/** Deposits operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import * as PrivateDeposit from "../../../../../mobile-protocol/src/device-native-private-deposit-v2.mjs";
import assert from "node:assert/strict";
import { isOriginalNativePrivateWorkerDepositBridgeV3, isOriginalNativePrivateDepositBridgeV2 } from "../device-owner-deposit-bridge-v1.mjs";
import { copy, sha } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import { createHash } from "node:crypto";
import { validateFlatAccountOwnerObservation, flatAccountCalldataHash } from "../flat-account-validation.mjs";
import { readOriginalNativePrivateDepositDerivationV2 } from "../../../../../proofs/src/jobs/native-device-private-deposit-client-v2.mjs";
import { normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1 } from "../../../../../mobile-protocol/src/device-deposit-consent-v1.mjs";
import { walletInputPublicWords, decodeWalletPoolInputs } from "../../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs";
import { createNativeEconomicNoteProofProcessV1, createProofProcess } from "../../../../../engine/src/execution/proofs/proof-process.mjs";
import { nullifier } from "../../../../../engine/src/notes/private-note-encoding.mjs";
import { encodeFlatTransaction } from "../../../execution/encoding/transaction-codec.mjs";
export function createNativeValueDeposits({
  journal,
  lifecycle,
  profile,
  chain,
  deposits,
  reservations,
  exits,
  format,
  continuity,
  proofs,
  operations
}) {
  let privateDepositBridge = null;
  const deviceRows = () => journal.rows() ?? [];
  const privateDepositEnabled = () => journal.profile() === PrivateDeposit.DEVICE_NATIVE_PRIVATE_PROOF_V2;
  async function installPrivateDeposit(bridge) {
    return lifecycle.exclusive(async () => {
      assert.ok(profile.nativeNote && !profile.wrapped && !privateDepositBridge, 'NATIVE_PRIVATE_DEPOSIT_ORIGINAL_BIRTH');
      await lifecycle.healthy();
      if (!privateDepositEnabled()) {
        assert.equal(journal.profile(), undefined);
        assert.equal(deviceRows().length, 0);
        const view = await chain.reader.read();
        assert.equal(view.ledger.commitments.length, 0, 'NATIVE_PRIVATE_DEPOSIT_BEFORE_FUNDING');
        assert.equal(view.ledger.nullifiers.length, 0);
        await chain.reader.assertCurrent(view);
        lifecycle.continueWork();
        await journal.installProfile(PrivateDeposit.DEVICE_NATIVE_PRIVATE_PROOF_V2);
      }
      const privateWorker = isOriginalNativePrivateWorkerDepositBridgeV3(bridge);
      if (privateWorker && !deposits.privateWorkerEnabled()) {
        assert.equal(journal.workerProfile(), undefined);
        assert.equal(deviceRows().length, 0);
        assert.equal(reservations.reservationRows().length, 0);
        assert.equal(exits.exitRows().length, 0);
        const view = await chain.reader.read();
        assert.equal(view.ledger.commitments.length, 0, 'NATIVE_PRIVATE_WORKER_BEFORE_FUNDING');
        assert.equal(view.ledger.nullifiers.length, 0);
        await chain.reader.assertCurrent(view);
        lifecycle.continueWork();
        await journal.installWorkerProfile('ORIGINAL_NATIVE_NOTE_PRIVATE_WORKER_INPUT_V3');
      }
      assert.equal(privateWorker, deposits.privateWorkerEnabled(), 'NATIVE_PRIVATE_WORKER_SAME_JOURNAL_PROFILE');
      privateDepositBridge = bridge;
      return {
        installed: true,
        profile: PrivateDeposit.DEVICE_NATIVE_PRIVATE_PROOF_V2
      };
    });
  }
  const deviceRow = id => {
    format.reference(id);
    const row = deviceRows().find(value => value.jobId === id);
    assert.ok(row, 'DEVICE_DEPOSIT_ORIGINAL_JOB_REQUIRED');
    return row;
  };
  const deviceUpdate = (id, fields) => journal.patch(id, fields);
  const byteSHA = bytes => createHash('sha256').update(bytes).digest('hex');
  const devicePublic = row => ({
    jobId: row.jobId,
    stage: row.stage,
    consentFields: {
      statement: copy(row.consent.statement),
      rootId: row.consent.rootId,
      noteRevision: row.consent.noteRevision,
      jobId: row.jobId,
      witnessSHA256: row.consent.witnessSHA256,
      proofSHA256: row.proofSHA256,
      publicInputsSHA256: row.publicInputsSHA256
    },
    statement: copy(row.consent.statement),
    observation: copy(row.observation),
    errorCode: row.errorCode
  });
  function deviceBinding(consent) {
    assert.equal(consent.binding.accountIdentitySHA256, sha(profile.accountIdentity), 'DEVICE_DEPOSIT_ACCOUNT_CHANGED');
    assert.equal(consent.binding.originalAccountLifetime, profile.config.lifetime, 'DEVICE_DEPOSIT_LIFETIME_CHANGED');
    assert.equal(consent.binding.assetId, profile.asset.assetId, 'DEVICE_DEPOSIT_ASSET_CHANGED');
    for (const field of ['scope', 'policy', 'codeHash', 'assetIdentity']) assert.equal(consent.poolTerms[field], profile.asset[field], 'DEVICE_DEPOSIT_ASSET_CHANGED');
    assert.equal(consent.poolTerms.domainCommitment, profile.identity.domainCommitment, 'DEVICE_DEPOSIT_DOMAIN_CHANGED');
    assert.equal(consent.statement.scope, profile.asset.scope, 'DEVICE_DEPOSIT_SCOPE_CHANGED');
    assert.equal(consent.statement.policy, profile.asset.policy, 'DEVICE_DEPOSIT_POLICY_CHANGED');
  }
  async function deviceCurrent(consent, requireEpoch) {
    await lifecycle.healthy();
    lifecycle.continueWork();
    deviceBinding(consent);
    const view = await chain.reader.read();
    await chain.reader.assertCurrent(view);
    lifecycle.continueWork();
    if (requireEpoch) assert.equal(consent.statement.epoch, (BigInt(view.head.timestamp) / 600n).toString(), 'DEVICE_DEPOSIT_EPOCH_CHANGED');
    return view;
  }
  async function observeDevice(row) {
    assert.ok(row.submission?.dispatchLatched === true, 'DEVICE_DEPOSIT_ORIGINAL_SEND_REQUIRED');
    const submission = row.submission;
    const observation = await chain.observer.readTransaction({
      kind: 'deposit',
      identitySHA256: profile.identitySHA256,
      transactionHash: submission.transactionHash,
      calldataSHA256: submission.calldataSHA256
    });
    if (observation === null) return {
      ...devicePublic(row),
      stage: 'FUNDING_UNKNOWN'
    };
    // The original observer authenticates signed wire/nonce/sender, calldata,
    // actual receipt, canonical historical delta, token movement and backing.
    validateFlatAccountOwnerObservation({
      identity: profile.identity,
      artifact: chain.pool.artifact,
      submission,
      authorization: null,
      observation
    });
    const view = await deviceCurrent(row.consent, false),
      output = row.consent.statement.output;
    const indices = view.ledger.commitments.flatMap((leaf, index) => leaf === '0x' + output ? [index] : []);
    assert.equal(indices.length, 1, 'DEVICE_DEPOSIT_ORIGINAL_OUTPUT_REQUIRED');
    assert.ok(!view.ledger.nullifiers.includes('0x' + row.nullifier), 'DEVICE_DEPOSIT_NOTE_ALREADY_SPENT');
    const originalPath = view.ledger.tree.path(indices[0]);
    assert.equal(originalPath.leaf, '0x' + output, 'DEVICE_DEPOSIT_ORIGINAL_PATH_CHANGED');
    // Original SHA tree/RPC digests are 0x-prefixed. The mobile frame uses
    // bare bytes32; normalize only the public DTO, never the original ledger.
    const path = {
      root: format.bare(originalPath.root),
      index: originalPath.index,
      leaf: format.bare(originalPath.leaf),
      siblings: originalPath.siblings.map(format.bare)
    };
    await chain.reader.assertCurrent(view);
    lifecycle.continueWork();
    const receipt = await chain.runtime.receipt('0x' + observation.transaction.hash);
    assert.ok(receipt, 'DEVICE_DEPOSIT_ORIGINAL_RECEIPT_REQUIRED');
    await chain.runtime.checkReceipt(receipt);
    const observedAt = Date.now();
    const retained = {
      version: 1,
      profile: 'ORIGINAL_DEVICE_D26_INCLUSION_V1',
      jobId: row.jobId,
      rootId: row.consent.rootId,
      commitment: output,
      amount: row.consent.statement.amount,
      assetId: profile.asset.assetId,
      pool: profile.asset.pool,
      scope: profile.asset.scope,
      policy: profile.asset.policy,
      genesis: profile.asset.genesis,
      domainCommitment: profile.identity.domainCommitment,
      proofSHA256: row.proofSHA256,
      publicInputsSHA256: row.publicInputsSHA256,
      transactionHash: observation.transaction.hash,
      calldataSHA256: submission.calldataSHA256,
      receiptBlockHash: observation.receipt.blockHash,
      head: copy(view.head),
      path: copy(path),
      nullifier: row.nullifier,
      observedAt,
      expiresAt: observedAt + 15_000,
      nativeEffectsEstablished: true,
      mobileKeyCustody: true,
      backendOpeningDisclosure: 'ONE_D26_OPENING',
      mobileCanonicalRpcVerification: false
    };
    // Canonical observer revalidation may return a fresh inclusion head/path;
    // the exact historical transaction observation is permanently retained.
    if (row.stage !== 'CONFIRMED') await deviceUpdate(row.jobId, {
      stage: 'CONFIRMED',
      submission: {
        ...submission,
        transactionHash: observation.transaction.hash,
        observation
      },
      observation: retained
    });
    if (continuity.recovery?.source) continuity.recovery.sourceObservationRequired = false;
    return {
      ...devicePublic(deviceRow(row.jobId)),
      observation: retained
    };
  }
  async function provePrivateDeviceDeposit(consent, packet, client, originalPrivate, signature) {
    assert.ok(originalPrivate && client && privateDepositBridge && profile.nativeNote && !profile.wrapped, 'NATIVE_PRIVATE_DEPOSIT_ORIGINAL_RECIPIENT');
    assert.equal(isOriginalNativePrivateDepositBridgeV2(privateDepositBridge), true);
    PrivateDeposit.validateDeviceDepositConsentEitherFreshV2(consent);
    assert.ok(!deviceRows().some(r => r.jobId === consent.jobId || r.consent.statement.output === consent.statement.output), 'DEVICE_DEPOSIT_ORIGINAL_JOB_ONLY');
    assert.ok(deviceRows().length < 64, 'DEVICE_DEPOSIT_JOURNAL_CAPACITY');
    const words = PrivateDeposit.nativePrivateDepositPublicInputsV2(consent);
    assert.deepEqual(packet.authorization, {
      kind: 'ORIGINAL_CONSENT_V1',
      jobId: consent.jobId,
      consentSHA256: byteSHA(PrivateDeposit.deviceDepositConsentEitherMessageV2(consent)),
      witnessSHA256: consent.witnessSHA256
    });
    let started = false;
    try {
      const before = await deviceCurrent(consent, true);
      assert.ok(!before.ledger.commitments.includes('0x' + consent.statement.output), 'DEVICE_DEPOSIT_OUTPUT_PRESENT');
      await chain.reader.assertCurrent(before);
      PrivateDeposit.validateDeviceDepositConsentEitherFreshV2(consent);
      await journal.append({
        jobId: consent.jobId,
        consent: copy(consent),
        stage: 'PROVING',
        proof: null,
        proofSHA256: null,
        publicInputsSHA256: null,
        nullifier: null,
        submission: null,
        observation: null,
        errorCode: null
      });
      started = true;
      PrivateDeposit.validateDeviceDepositConsentEitherFreshV2(consent);
      lifecycle.trackProof(client);
      const result = await client.proveEncrypted(packet, packet.authorization),
        derived = readOriginalNativePrivateDepositDerivationV2(client, result);
      assert.equal(derived.jobId, consent.jobId);
      assert.equal(derived.commitment, consent.statement.output);
      assert.equal(derived.consentSHA256, packet.authorization.consentSHA256);
      assert.equal(derived.witnessSHA256, consent.witnessSHA256);
      assert.equal(result.metrics.acceptedResult, true, 'DEVICE_DEPOSIT_PROOF_NOT_ACCEPTED');
      assert.deepEqual(result.publicInputs, words);
      const view = await deviceCurrent(consent, true),
        proof = format.transportProof(result);
      assert.ok(!view.ledger.commitments.includes('0x' + consent.statement.output), 'DEVICE_DEPOSIT_OUTPUT_PRESENT');
      assert.equal(await chain.system.verify('deposit_balance', Buffer.from(proof.proof, 'hex'), proof.publicInputs.map(w => '0x' + BigInt(w).toString(16).padStart(64, '0')), view.header.number), true, 'DEVICE_DEPOSIT_DEPLOYED_VERIFIER_REJECTED');
      await chain.reader.assertCurrent(view);
      lifecycle.continueWork();
      await proofs.onProof({
        label: 'device-deposit-d26',
        relation: 'deposit_balance',
        role: 'device-owner',
        proof: {
          ...proof,
          metrics: result.metrics
        }
      });
      await deviceUpdate(consent.jobId, {
        stage: 'PROVED',
        proof,
        proofSHA256: byteSHA(Buffer.from(proof.proof, 'hex')),
        publicInputsSHA256: sha(proof.publicInputs),
        nullifier: derived.nullifier,
        ...(continuity.nativeSourceOriginal ? {
          originalSourceProofReceipt: format.sourceProofReceiptFrame('deposit_balance', 'device-deposit-d26', {
            ...proof,
            metrics: result.metrics
          })
        } : {})
      });
      await proofs.onPrivateAudit({
        reference: consent.jobId,
        phase: 'device-deposit-proof-retained',
        stage: 'PROVED'
      });
      return devicePublic(deviceRow(consent.jobId));
    } catch (error) {
      if (started && !lifecycle.isUnavailable()) await deviceUpdate(consent.jobId, {
        stage: 'FAILED',
        errorCode: 'DEVICE_DEPOSIT_PRIVATE_PROOF_REJECTED'
      });
      await proofs.onPrivateAudit({
        reference: consent.jobId,
        phase: 'device-deposit-proof-retained',
        stage: 'FAILED'
      }).catch(() => {});
      throw error;
    } finally {
      await client?.close();
      lifecycle.releaseProof();
    }
  }
  async function deviceDeposit({
    action,
    consent,
    witness,
    privateD26 = false,
    client = null,
    signature = null
  }) {
    if (continuity.recovery?.native) assert.equal(action, 'OBSERVE_D26', 'NATIVE_DEVICE_RECOVERY_OBSERVE_ORIGINAL_ONLY');
    return lifecycle.exclusive(async () => {
      deviceBinding(consent);
      assert.equal(consent.version, privateDepositEnabled() ? 2 : 1, 'NATIVE_PRIVATE_DEPOSIT_PROFILE_REQUIRED');
      if (action === 'PROVE_D26' && privateDepositEnabled()) return provePrivateDeviceDeposit(consent, witness, client, privateD26, signature);
      if (action === 'PROVE_D26') {
        assert.ok(!profile.wrapped && !deviceRows().some(row => row.jobId === consent.jobId || row.consent.statement.output === consent.statement.output), 'DEVICE_DEPOSIT_ORIGINAL_JOB_ONLY');
        assert.ok(deviceRows().length < 64, 'DEVICE_DEPOSIT_JOURNAL_CAPACITY');
        const input = normalizeDeviceDepositWitnessV1(witness),
          bytes = deviceDepositWitnessBytesV1(input);
        let prover;
        try {
          assert.equal(byteSHA(bytes), consent.witnessSHA256, 'DEVICE_DEPOSIT_WITNESS_CHANGED');
          const publicInputs = walletInputPublicWords('deposit_balance', input);
          const statement = decodeWalletPoolInputs('deposit_balance', publicInputs);
          for (const field of ['scope', 'policy', 'output']) assert.equal(statement[field].slice(2), consent.statement[field], 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
          for (const field of ['epoch', 'amount']) assert.equal(statement[field], consent.statement[field], 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
          await deviceCurrent(consent, true);
          await journal.append({
            jobId: consent.jobId,
            consent: copy(consent),
            stage: 'PROVING',
            proof: null,
            proofSHA256: null,
            publicInputsSHA256: null,
            nullifier: null,
            submission: null,
            observation: null,
            errorCode: null
          });
          // No server note key/root or Linux ownerProof is involved. The fixed
          // original worker validates exact ABI/pins/VK/ZK/resources and wipes
          // its one input when the one fresh child exits.
          prover = profile.nativeNote ? createNativeEconomicNoteProofProcessV1('owner') : createProofProcess({
            purpose: 'owner',
            modes: ['deposit_balance']
          });
          lifecycle.trackProof(prover);
          const result = await prover.prove('deposit_balance', input, publicInputs, 'device-deposit-d26');
          assert.equal(result.metrics.acceptedResult, true, 'DEVICE_DEPOSIT_PROOF_NOT_ACCEPTED');
          const view = await deviceCurrent(consent, true),
            proof = format.transportProof(result);
          assert.equal(await chain.system.verify('deposit_balance', Buffer.from(proof.proof, 'hex'), proof.publicInputs.map(word => '0x' + BigInt(word).toString(16).padStart(64, '0')), view.header.number), true, 'DEVICE_DEPOSIT_DEPLOYED_VERIFIER_REJECTED');
          await chain.reader.assertCurrent(view);
          lifecycle.continueWork();
          await proofs.onProof({
            label: 'device-deposit-d26',
            relation: 'deposit_balance',
            role: 'device-owner',
            proof: {
              ...proof,
              metrics: result.metrics
            }
          });
          await deviceUpdate(consent.jobId, {
            stage: 'PROVED',
            proof,
            ...(continuity.nativeSourceOriginal ? {
              originalSourceProofReceipt: format.sourceProofReceiptFrame('deposit_balance', 'device-deposit-d26', {
                ...proof,
                metrics: result.metrics
              })
            } : {}),
            proofSHA256: byteSHA(Buffer.from(proof.proof, 'hex')),
            publicInputsSHA256: sha(proof.publicInputs),
            nullifier: nullifier(Buffer.from(consent.statement.scope, 'hex'), Buffer.from(consent.statement.output, 'hex'), Buffer.from(input.secret)).toString('hex')
          });
          await proofs.onPrivateAudit({
            reference: consent.jobId,
            phase: 'device-deposit-proof-retained',
            stage: 'PROVED'
          });
          return devicePublic(deviceRow(consent.jobId));
        } catch (error) {
          if (!lifecycle.isUnavailable() && deviceRows().some(row => row.jobId === consent.jobId)) await deviceUpdate(consent.jobId, {
            stage: 'FAILED',
            errorCode: /^[A-Z0-9_]{1,100}$/.test(error.code ?? '') ? error.code : 'DEVICE_DEPOSIT_PROOF_REJECTED'
          });
          // Private completion notification only; preserve the original proof
          // error if diagnostic retention itself is unavailable.
          await proofs.onPrivateAudit({
            reference: consent.jobId,
            phase: 'device-deposit-proof-retained',
            stage: 'FAILED'
          }).catch(() => {});
          throw error;
        } finally {
          bytes.fill(0);
          for (const value of Object.values(input)) if (Array.isArray(value)) value.fill(0);
          if (prover) await prover.close();
          lifecycle.releaseProof();
        }
      }
      const row = deviceRow(consent.jobId);
      const fields = devicePublic(row).consentFields;
      for (const field of ['rootId', 'noteRevision', 'witnessSHA256', 'proofSHA256', 'publicInputsSHA256']) assert.equal(consent[field], fields[field], 'DEVICE_DEPOSIT_ORIGINAL_JOB_CHANGED');
      assert.deepEqual(consent.statement, fields.statement, 'DEVICE_DEPOSIT_STATEMENT_CHANGED');
      if (action === 'OBSERVE_D26') return {
        ...(await observeDevice(row)),
        authorizationSHA256: byteSHA(PrivateDeposit.deviceDepositConsentEitherMessageV2(consent))
      };
      assert.equal(action, 'FUND_D26');
      assert.equal(row.stage, 'PROVED', 'DEVICE_DEPOSIT_RECONCILE_ORIGINAL_ONLY');
      assert.equal(row.submission, null, 'DEVICE_DEPOSIT_RECONCILE_ORIGINAL_ONLY');
      await operations.tokenFundingReady(consent.statement.amount);
      const view = await deviceCurrent(consent, true),
        capacity = view.ledger.publicState;
      assert.ok(!view.ledger.commitments.includes('0x' + consent.statement.output), 'DEVICE_DEPOSIT_OUTPUT_PRESENT');
      assert.ok(capacity.leaves + 1 + 4 * capacity.liveReservations <= 64 && capacity.spent + 5 * capacity.liveReservations + capacity.outputCapacity + 1 <= 64, 'DEVICE_DEPOSIT_HEADROOM');
      const calldata = encodeFlatTransaction('depositBalance', row.proof);
      const submission = {
        kind: 'deposit',
        calldata,
        calldataSHA256: flatAccountCalldataHash(calldata),
        // Retain the original proven terms in the owner's bare-bytes32 format.
        // PROVE joined every field to these exact public inputs; the full
        // transition validator independently re-encodes the tuple below.
        publicInputs: row.proof.publicInputs,
        statement: copy(row.consent.statement),
        before: operations.snapshotFromView(view),
        epoch: consent.statement.epoch,
        transactionHash: null,
        dispatchLatched: true,
        ownerConfirmed: false,
        observation: null
      };
      // Durable original latch FIRST. Any later exception/reply loss can only
      // observe this same original wire. No owner.bindSubmission/adoption and
      // no recovery callback can manufacture a replacement send.
      await deviceUpdate(row.jobId, {
        stage: 'FUNDING_UNKNOWN',
        fundingConsent: copy(consent),
        submission
      });
      try {
        lifecycle.continueWork();
        const receipt = await chain.runtime.send('flat-account-device-deposit', {
          to: chain.pool.address,
          data: calldata,
          value: profile.nativeAsset ? consent.statement.amount : '0'
        });
        await deviceUpdate(row.jobId, {
          submission: {
            ...submission,
            transactionHash: format.bare(receipt.transactionHash)
          }
        });
        return {
          ...(await observeDevice(deviceRow(row.jobId))),
          authorizationSHA256: byteSHA(PrivateDeposit.deviceDepositConsentEitherMessageV2(consent))
        };
      } catch (error) {
        const hash = error.transactionRecord?.transactionHash;
        if (hash && !lifecycle.isUnavailable()) await deviceUpdate(row.jobId, {
          submission: {
            ...submission,
            transactionHash: format.bare(hash)
          }
        });
        throw error;
      }
    });
  }
  return Object.freeze({
    deviceRows,
    privateDepositEnabled,
    installPrivateDeposit,
    deviceRow,
    deviceUpdate,
    byteSHA,
    devicePublic,
    deviceBinding,
    deviceCurrent,
    observeDevice,
    provePrivateDeviceDeposit,
    deviceDeposit
  });
}
