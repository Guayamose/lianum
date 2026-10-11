/** Operations operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import { validateBoundRequest, sha, immutable, copy, validateOutcome } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import assert from "node:assert/strict";
import { flatAccountGraphBinding, validateFlatAccountOwnerObservation, flatAccountCalldataHash, validateFlatManualGraphAdmissionTime } from "../flat-account-validation.mjs";
import { decodeStatement } from "../../../execution/encoding/statements.mjs";
import { validateNativeValueManualReview, validateNativeValueManualRecords } from "../../../../../custody/src/preparation/native-value-owner-manual-binding-v1.mjs";
import { createNativeEconomicNoteProofProcessV1, createProofProcess } from "../../../../../engine/src/execution/proofs/proof-process.mjs";
import { encodeFlatTransaction } from "../../../execution/encoding/transaction-codec.mjs";
import { withFlatHash } from "../../../../../proofs/src/tooling/scoped-proof-tools.mjs";
import { reservationWitness } from "../../../execution/account/preparation/funding-inputs.mjs";
import { reserveProjection } from "../../../../../engine/src/execution/local/local-ledger.mjs";
import { privateFailureDiagnostic } from "../../../execution/account/reconciliation/failure-diagnostics.mjs";
import { decodeNativeValueTerminalCalldata } from "../../../execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs";
export function createNativeValueOwnerOperations({
  journal,
  profile,
  operations,
  lifecycle,
  format,
  chain,
  proofs,
  manual,
  approvals,
  account
}) {
  let ownerViewTerminalObserver;
  function request(value) {
    const bound = validateBoundRequest(value, profile.config),
      entry = operations.operation(bound.ownerOperationRef);
    if (profile.wrapped) assert.equal(bound.kind, 'GRAPH', 'WRAPPED_WALLET_ORIGINAL_CLAIM_CONTROLLER_REQUIRED');
    assert.equal(bound.assetId, profile.asset.assetId, 'FLAT_ACCOUNT_ASSET_CHANGED');
    assert.equal(bound.kind, entry.kind, 'FLAT_ACCOUNT_KIND_CHANGED');
    if (entry.request !== null) assert.deepEqual(bound, entry.request, 'FLAT_ACCOUNT_REQUEST_REBOUND');
    return {
      bound,
      entry
    };
  }
  async function register(ref, kind, role = null, graph = null) {
    if (profile.wrapped) assert.equal(kind, 'GRAPH', 'WRAPPED_WALLET_ORIGINAL_CLAIM_CONTROLLER_REQUIRED');
    await lifecycle.healthy();
    format.reference(ref);
    assert.ok(kind !== 'GRAPH' || chain.nativeExecution !== null, 'FLAT_ACCOUNT_GRAPH_EXECUTION_UNAVAILABLE');
    const ownerKind = kind === 'TOP_UP' ? 'deposit' : kind === 'GRAPH' ? 'reservation' : 'withdraw_' + role;
    const preparationSHA256 = sha({
      kind,
      ownerKind,
      ...(graph ? {
        prepared: graph.prepared,
        providers: graph.providers.map(({
          custody: _capability,
          ...data
        }) => data)
      } : {})
    });
    let entry = journal.rows().find(value => value.ownerOperationRef === ref);
    if (entry) {
      assert.equal(entry.preparationSHA256, preparationSHA256, 'FLAT_ACCOUNT_OPERATION_REBOUND');
      if (entry.nativeBinding !== null || kind !== 'GRAPH') return {
        ownerOperationRef: ref,
        kind,
        assetId: profile.asset.assetId
      };
    } else {
      assert.ok(!journal.rows().some(value => value.ownerKind === ownerKind), 'FLAT_ACCOUNT_ORIGINAL_OWNER_REFERENCE_REQUIRED');
      const summary = await chain.owner.publicView.summary();
      assert.equal(summary.identitySHA256, profile.identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
      if (kind !== 'GRAPH') assert.ok(['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(summary.operations[ownerKind]), 'FLAT_ACCOUNT_OWNER_PREPARATION_REQUIRED');else {
        // The public U was produced in the owner process. Every detached packet
        // must still be exactly that owner's original retained authorization.
        for (const name of ['reservation', 'recovery', 'assembler']) assert.deepEqual((await chain.owner.roles[name]()).select(), graph.prepared.rolePackets[name], 'FLAT_ACCOUNT_ORIGINAL_PACKET');
        for (const name of ['local', 'dependency']) for (let slot = 0; slot < 4; slot++) assert.deepEqual((await chain.owner.roles[name](slot)).select(), graph.prepared.rolePackets[name][slot], 'FLAT_ACCOUNT_ORIGINAL_PACKET');
      }
      if (kind === 'TOP_UP' && !profile.nativeAsset) {
        // Approval is an explicit funding prerequisite supplied by the private
        // bootstrap, not an implicit side effect or a deposit resend policy.
        const original = await chain.owner.ownerProof.deposit();
        await tokenFundingReady(original.statement.amount);
      }
      await journal.append({
        ownerOperationRef: ref,
        kind,
        ownerKind,
        role,
        preparationSHA256,
        request: null,
        stage: 'READY',
        prepared: graph?.prepared ?? null,
        nativeBinding: null,
        submission: null,
        terminal: null,
        outcome: null,
        errorCode: null
      });
      entry = operations.operation(ref);
    }
    if (kind === 'GRAPH') {
      const expected = flatAccountGraphBinding(entry.prepared, profile.identity);
      const binding = await chain.nativeExecution.prepare(ref, entry.prepared, graph.providers);
      assert.deepEqual(binding, expected, 'FLAT_ACCOUNT_NATIVE_BINDING_CHANGED');
      await operations.update(ref, {
        nativeBinding: binding
      });
    }
    return {
      ownerOperationRef: ref,
      kind,
      assetId: profile.asset.assetId
    };
  }
  function snapshotFromView(view) {
    return {
      identitySHA256: profile.identitySHA256,
      blockHash: view.head.hash,
      canonicalBlockHashBefore: view.head.hash,
      canonicalBlockHashAfter: view.head.hash,
      timestamp: view.head.timestamp,
      ...Object.fromEntries(['rawState', 'rawHistory', 'rawBacking'].map(key => [key, view.poolObservation[key]]))
    };
  }
  async function confirmOwner(ref, acknowledgeOwner = true) {
    const entry = operations.operation(ref),
      submission = entry.submission;
    assert.ok(submission, 'FLAT_ACCOUNT_ORIGINAL_SUBMISSION_REQUIRED');
    const observation = await chain.observer.readTransaction({
      kind: submission.kind,
      identitySHA256: profile.identitySHA256,
      transactionHash: submission.transactionHash,
      calldataSHA256: submission.calldataSHA256
    });
    assert.ok(observation, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_UNRESOLVED');
    validateFlatAccountOwnerObservation({
      identity: profile.identity,
      artifact: chain.pool.artifact,
      submission,
      authorization: entry.prepared ? decodeStatement('authorization', entry.prepared.authorization.publicInputs) : null,
      observation
    });
    let ownerConfirmed = submission.ownerConfirmed;
    if (acknowledgeOwner && !ownerConfirmed) {
      await chain.owner.owner.acknowledgeSubmitted({
        kind: submission.kind,
        transactionHash: observation.transaction.hash
      });
      const confirmed = await chain.owner.owner.reconcile({
        kind: submission.kind
      });
      assert.equal(confirmed.stage, 'CONFIRMED', 'FLAT_ACCOUNT_OWNER_RECONCILIATION_REQUIRED');
      ownerConfirmed = true;
    }
    if (submission.observation === null || ownerConfirmed !== submission.ownerConfirmed) await operations.update(ref, {
      submission: {
        ...submission,
        transactionHash: observation.transaction.hash,
        observation,
        ownerConfirmed
      }
    });
    const receipt = await chain.runtime.receipt('0x' + observation.transaction.hash);
    assert.ok(receipt, 'FLAT_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await chain.runtime.checkReceipt(receipt);
    assert.equal(format.bare(receipt.blockHash), observation.receipt.blockHash, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    return receipt;
  }
  async function submitOwner(ref, {
    proof,
    statement,
    before,
    calldata
  }) {
    const entry = operations.operation(ref);
    assert.equal(entry.submission, null, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
    if (entry.manualLifecycle || entry.nativeManualReview) await requireFixedManualEpoch(ref);
    const submission = {
      kind: entry.ownerKind,
      calldata,
      calldataSHA256: flatAccountCalldataHash(calldata),
      publicInputs: proof.publicInputs,
      statement,
      before,
      epoch: statement.epoch ?? null,
      transactionHash: null,
      dispatchLatched: false,
      ownerConfirmed: false,
      observation: null
    };
    // Persist complete exact original identity before even requesting the owner
    // latch. Any error after this point can only reconcile this original send.
    await operations.update(ref, {
      submission
    });
    lifecycle.continueWork();
    const lease = await chain.owner.owner.bindSubmission({
      kind: entry.ownerKind,
      calldata
    });
    assert.equal(lease.dispatchAllowed, true, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
    await operations.update(ref, {
      submission: {
        ...submission,
        dispatchLatched: true
      }
    });
    let receipt;
    try {
      lifecycle.continueWork();
      receipt = await chain.runtime.send('flat-account-' + entry.ownerKind, {
        to: chain.pool.address,
        data: calldata,
        value: entry.kind === 'TOP_UP' && profile.nativeAsset ? statement.amount : '0'
      });
      await operations.update(ref, {
        submission: {
          ...operations.operation(ref).submission,
          transactionHash: format.bare(receipt.transactionHash)
        }
      });
      return await confirmOwner(ref);
    } catch (error) {
      const hash = error.transactionRecord?.transactionHash;
      if (hash && !lifecycle.isUnavailable()) {
        const current = operations.operation(ref).submission;
        if (current.transactionHash !== null) assert.equal(current.transactionHash, format.bare(hash), 'FLAT_ACCOUNT_TRANSACTION_CHANGED');else await operations.update(ref, {
          submission: {
            ...current,
            transactionHash: format.bare(hash)
          }
        });
      }
      throw error;
    } finally {
      await proofs.onPrivateAudit({
        reference: ref,
        phase: 'owner-transition',
        receipt: receipt ?? null
      });
    }
  }
  async function tokenFundingReady(amount) {
    if (profile.nativeAsset) return;
    const head = await chain.runtime.block();
    const [allowance, balance] = await Promise.all([chain.pool.assetCapability.allowance(chain.system.sender, chain.pool.address, head.number), chain.pool.assetCapability.balance(chain.system.sender, head.number)]);
    assert.equal(allowance, BigInt(amount), 'FLAT_ACCOUNT_EXACT_TOKEN_ALLOWANCE_REQUIRED');
    assert.ok(balance >= BigInt(amount), 'FLAT_ACCOUNT_TOKEN_FUNDING_BALANCE');
    await chain.runtime.assertCanonical(head);
  }
  async function requireFixedManualEpoch(ref) {
    const entry = operations.operation(ref),
      review = entry.nativeManualReview;
    if (!review) return manual.requireManualEpoch(ref);
    validateNativeValueManualReview(review);
    const records = await chain.owner.ownerView.nativeNotePreparations();
    validateNativeValueManualRecords(records);
    const original = records.records.find(row => row.review.request.ownerOperationRef === ref);
    assert.ok(original && original.ownerState === 'PREPARED', 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
    assert.deepEqual(original.review, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
    const scope = await chain.owner.publicView.summary();
    for (const key of ['keyScopeSHA256', 'processIdentitySHA256', 'processGeneration']) assert.equal(scope[key], review[key], 'NATIVE_VALUE_MANUAL_NOTE_PROCESS_CHANGED');
    assert.equal(String((await chain.runtime.time()) / 600n), review.epoch, 'NATIVE_VALUE_MANUAL_NOTE_EPOCH_FIXED');
    const terms = await chain.owner.ownerView.preparationTerms({
      kind: review.ownerKind
    });
    assert.equal(terms.identitySHA256, profile.identitySHA256, 'NATIVE_VALUE_MANUAL_NOTE_IDENTITY');
    for (const key of ['amount', 'recipient', 'epoch']) assert.equal(terms.prepared?.[key], review[key], 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
    assert.equal(String(BigInt(terms.observed.timestamp) / 600n), review.epoch, 'NATIVE_VALUE_MANUAL_NOTE_EPOCH_FIXED');
    assert.equal(terms.prepared.submissionBound, false, 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
  }
  function nativeNoteApproval(review) {
    const ref = review.request.ownerOperationRef;
    if (approvals.nativeNoteApprovals.has(ref)) return approvals.nativeNoteApprovals.get(ref);
    const body = immutable(review.request),
      publicReview = immutable({
        version: 1,
        profile: 'ORIGINAL_MANUAL_NATIVE_VALUE_NOTE_REVIEW_V1',
        ...body,
        asset: {
          assetId: profile.asset.assetId,
          symbol: profile.asset.symbol,
          decimals: profile.asset.decimals
        },
        originalAccountLifetime: profile.config.lifetime,
        generationId: sha(profile.accountIdentity),
        identitySHA256: profile.identitySHA256,
        accountIdentitySHA256: sha(profile.accountIdentity),
        terms: review,
        termsSHA256: sha(review),
        actionBodySHA256: {
          accountPrepare: sha(body),
          accountExecute: sha({
            requestId: body.requestId
          }),
          accountReconcile: sha({
            requestId: body.requestId
          })
        },
        publicNetwork: false,
        observation: 'ORIGINAL_OWNER_LOCAL_NOTE_TERMS_ONLY',
        settlementEstablished: false
      });
    const approval = Object.freeze(Object.defineProperty(Object.create(null), 'toJSON', {
      value() {
        throw format.failure('NATIVE_VALUE_MANUAL_NOTE_NOT_SERIALIZABLE');
      }
    }));
    approvals.manualNotes.set(approval, {
      account: account.capability(),
      body,
      review: publicReview,
      check() {
        assert.deepEqual(operations.operation(ref).nativeManualReview, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
      }
    });
    approvals.nativeNoteApprovals.set(ref, approval);
    return approval;
  }
  async function executeNote(ref) {
    const manual = Boolean(operations.operation(ref).manualLifecycle || operations.operation(ref).nativeManualReview);
    if (manual) await requireFixedManualEpoch(ref);
    const entry = operations.operation(ref),
      mode = entry.kind === 'TOP_UP' ? 'deposit_balance' : 'withdraw_balance';
    const client = profile.nativeNote ? createNativeEconomicNoteProofProcessV1('owner') : createProofProcess({
      purpose: 'owner',
      modes: [mode]
    });
    lifecycle.trackProof(client);
    let job = null,
      result = null;
    try {
      for (let attempt = 0; attempt < (manual ? 1 : 2); attempt++) {
        lifecycle.continueWork();
        job = entry.kind === 'TOP_UP' ? await chain.owner.ownerProof.deposit() : await chain.owner.ownerProof.withdrawal(entry.role);
        const epoch = String((await chain.runtime.time()) / 600n);
        if (epoch !== job.statement.epoch) {
          if (manual) {
            await requireFixedManualEpoch(ref);
            throw format.failure('FLAT_ACCOUNT_MANUAL_EPOCH_RACED');
          }
          await chain.owner.owner.renewEpoch({
            kind: entry.ownerKind,
            epoch
          });
          job = entry.kind === 'TOP_UP' ? await chain.owner.ownerProof.deposit() : await chain.owner.ownerProof.withdrawal(entry.role);
        }
        if (entry.kind === 'TOP_UP') await tokenFundingReady(job.statement.amount);
        result = await client.prove(mode, job.inputs, job.publicInputs, 'flat-account-' + entry.ownerKind);
        assert.equal(result.metrics.acceptedResult, true, 'FLAT_ACCOUNT_PROOF_INCOMPLETE');
        await proofs.onProof({
          label: 'flat-account-' + entry.ownerKind,
          relation: mode,
          proof: {
            ...format.transportProof(result),
            metrics: result.metrics
          }
        });
        if (String((await chain.runtime.time()) / 600n) !== job.statement.epoch) {
          if (manual) {
            await requireFixedManualEpoch(ref);
            throw format.failure('FLAT_ACCOUNT_MANUAL_EPOCH_RACED');
          }
          result = null;
          job = null;
          continue;
        }
        if (entry.kind === 'TOP_UP') await tokenFundingReady(job.statement.amount);
        const proof = format.transportProof(result),
          before = await chain.observer.readSnapshot();
        return await submitOwner(ref, {
          proof,
          statement: job.statement,
          before,
          calldata: encodeFlatTransaction(entry.kind === 'TOP_UP' ? 'depositBalance' : 'withdrawBalance', proof)
        });
      }
      throw format.failure('FLAT_ACCOUNT_NOTE_EPOCH_UNAVAILABLE');
    } finally {
      job = null;
      result = null;
      await client.close();
      lifecycle.releaseProof();
    }
  }
  async function manualGraphTime(ref) {
    const approval = approvals.manualGraphApprovals.get(ref);
    if (profile.wrapped) assert.ok(approval, 'WRAPPED_WALLET_ORIGINAL_OWNER_APPROVAL_REQUIRED');
    if (approval) {
      const retained = approvals.manualGraphs.get(approval);
      if (profile.wrapped) retained.checkRoute();
      validateFlatManualGraphAdmissionTime(retained.review, String(await chain.runtime.time()));
      if (profile.wrapped && operations.operation(ref).submission === null) {
        const view = await chain.reader.read();
        assert.deepEqual(view.head, retained.review.wrappedBinding.head, 'WRAPPED_WALLET_APPROVED_HEAD_CHANGED');
        await chain.reader.assertCurrent(view);
      }
    }
  }
  async function executeGraph(ref) {
    await manualGraphTime(ref);
    const entry = operations.operation(ref);
    assert.ok(entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
    const prepared = entry.prepared,
      packet = prepared.rolePackets.reservation;
    const before = await chain.reader.read(),
      funding = packet.funding.value;
    const index = before.ledger.commitments.indexOf('0x' + funding.inputCommitment);
    assert.ok(index >= 0 && !before.ledger.nullifiers.includes('0x' + funding.inputNullifier), 'FLAT_ACCOUNT_SOURCE_NOT_UNSPENT');
    const path = before.ledger.tree.path(index);
    const job = await withFlatHash(hashFields => reservationWitness(packet, {
      inputRoot: format.bare(path.root),
      inputPath: {
        leaf: format.bare(path.leaf),
        index: path.index,
        siblings: path.siblings.map(format.bare)
      }
    }, {
      hashFields
    }));
    const reservation = await proofs.proofRunner.prove('reservation', job, 'flat-account-reservation');
    const fresh = await chain.reader.read();
    assert.deepEqual(fresh.ledger.publicState, before.ledger.publicState, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.deepEqual(fresh.ledger.commitments, before.ledger.commitments, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.deepEqual(fresh.ledger.nullifiers, before.ledger.nullifiers, 'FLAT_ACCOUNT_FRESH_RESERVATION_REQUIRED');
    assert.ok(BigInt(fresh.head.timestamp) >= BigInt(funding.fundingNotBefore) && BigInt(fresh.head.timestamp) < BigInt(funding.fundingValidUntil), 'FLAT_ACCOUNT_RESERVATION_WINDOW');
    await chain.reader.assertCurrent(fresh);
    const projection = reserveProjection(before.ledger, '0x' + funding.reserveCommitment, '0x' + funding.changeCommitment);
    await submitOwner(ref, {
      proof: reservation,
      statement: job.statement,
      before: snapshotFromView(fresh),
      calldata: encodeFlatTransaction('reserveGenericGuarded', {
        authorization: prepared.authorization,
        reservation,
        expectedSequence: projection.expectedSequence,
        expectedPostRoot: projection.expectedPostRoot
      })
    });
    await chain.owner.suspend();
    const lifecycle = chain.owner.report();
    assert.equal(lifecycle.childExited, true, 'FLAT_ACCOUNT_OWNER_MUST_BE_ABSENT');
    assert.equal(lifecycle.available, false, 'FLAT_ACCOUNT_OWNER_MUST_BE_ABSENT');
    await proofs.onStage({
      reference: ref,
      kind: 'GRAPH',
      stage: 'OWNER_SUSPENDED_BEFORE_NATIVE',
      ownerLifecycle: lifecycle
    });
    lifecycle.continueWork();
    const result = await chain.nativeExecution.execute(ref);
    assert.equal(result.outcome, 'FULFILLED', 'FLAT_ACCOUNT_FULFILLMENT_REQUIRED');
    return result;
  }
  async function confirmTerminal(bound, result) {
    const ref = bound.ownerOperationRef,
      entry = operations.operation(ref),
      receipt = result.receipt;
    assert.ok(receipt, 'FLAT_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await chain.runtime.checkReceipt(receipt);
    assert.equal(receipt.status, '0x1', 'FLAT_ACCOUNT_SUCCESS_REQUIRED');
    assert.equal(receipt.to, chain.pool.address, 'FLAT_ACCOUNT_TERMINAL_POOL');
    const transaction = await chain.runtime.transaction(receipt.transactionHash);
    assert.ok(transaction, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_REQUIRED');
    const originals = chain.runtime.transactions.filter(value => value.transactionHash === receipt.transactionHash);
    assert.equal(originals.length, 1, 'FLAT_ACCOUNT_ORIGINAL_TRANSACTION_REQUIRED');
    const original = originals[0];
    assert.equal(transaction.from, chain.system.sender, 'FLAT_ACCOUNT_TRANSACTION_SENDER');
    assert.equal(transaction.to, chain.pool.address, 'FLAT_ACCOUNT_TRANSACTION_POOL');
    assert.equal(transaction.input, original.request.data, 'FLAT_ACCOUNT_TRANSACTION_CHANGED');
    assert.equal(transaction.value, original.request.value ?? '0x0', 'FLAT_ACCOUNT_TRANSACTION_VALUE');
    assert.equal(BigInt(transaction.nonce), BigInt(original.senderNonce), 'FLAT_ACCOUNT_TRANSACTION_NONCE');
    assert.equal(transaction.blockHash, receipt.blockHash, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    assert.equal(transaction.blockNumber, receipt.blockNumber, 'FLAT_ACCOUNT_RECEIPT_CHANGED');
    const calldataSHA256 = flatAccountCalldataHash(transaction.input);
    if (result.calldataSHA256 !== undefined) assert.equal(result.calldataSHA256, calldataSHA256, 'FLAT_ACCOUNT_TERMINAL_CALLDATA_CHANGED');
    if (bound.kind !== 'GRAPH') assert.equal(entry.submission.calldataSHA256, calldataSHA256, 'FLAT_ACCOUNT_TERMINAL_CALLDATA_CHANGED');
    const disposition = result.outcome === 'RECOVERED' ? 'RECOVERED' : 'APPLIED';
    const terminal = {
      disposition,
      transactionHash: format.bare(receipt.transactionHash),
      blockHash: format.bare(receipt.blockHash),
      blockNumber: BigInt(receipt.blockNumber).toString(),
      calldataSHA256
    };
    if (disposition === 'RECOVERED') {
      assert.equal(bound.kind, 'GRAPH');
      format.reference(terminal.calldataSHA256);
    }
    const outcome = {
      version: 1,
      state: 'CONFIRMED',
      bindingSHA256: bound.bindingSHA256,
      assetBindingSHA256: bound.assetBindingSHA256,
      outcomeId: sha({
        identitySHA256: profile.identitySHA256,
        ownerOperationRef: ref,
        kind: bound.kind,
        ...terminal
      }),
      disposition,
      blockNumber: terminal.blockNumber,
      blockHash: terminal.blockHash
    };
    if (entry.outcome !== null) {
      assert.deepEqual(terminal, entry.terminal, 'FLAT_ACCOUNT_TERMINAL_CHANGED');
      assert.deepEqual(outcome, entry.outcome, 'FLAT_ACCOUNT_OUTCOME_CHANGED');
      return copy(entry.outcome);
    }
    await operations.update(ref, {
      stage: 'CONFIRMED',
      terminal,
      outcome,
      errorCode: null,
      ...(entry.manualLifecycle ? {
        manualLifecycle: {
          ...entry.manualLifecycle,
          state: 'CONFIRMED',
          history: [...entry.manualLifecycle.history, {
            state: 'CONFIRMED',
            generation: entry.manualLifecycle.generation,
            evidence: outcome
          }]
        }
      } : {})
    });
    return copy(outcome);
  }
  async function reconcileOriginal(bound) {
    const entry = operations.operation(bound.ownerOperationRef);
    // Original S observation remains mandatory even if the native terminal has
    // already been confirmed. This path never calls execute or sends again.
    const receipt = await confirmOwner(bound.ownerOperationRef, entry.kind !== 'GRAPH');
    if (entry.kind !== 'GRAPH') return confirmTerminal(bound, {
      receipt,
      outcome: 'APPLIED'
    });
    const result = await chain.nativeExecution.reconcile(bound.ownerOperationRef);
    assert.ok(['FULFILLED', 'RECOVERED'].includes(result.outcome), 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
    return confirmTerminal(bound, result);
  }
  async function recoverOriginal(bound) {
    const ref = bound.ownerOperationRef,
      entry = operations.operation(ref);
    assert.equal(entry.kind, 'GRAPH', 'FLAT_ACCOUNT_RECOVERY_GRAPH_ONLY');
    assert.ok(entry.request !== null && entry.stage !== 'READY', 'FLAT_ACCOUNT_NOT_STARTED');
    if (entry.outcome !== null) return reconcileOriginal(bound);
    // This observes original S with no owner RPC once its prior confirmation
    // was retained. F and its own irreversible latch belong to nativeExecution.
    await confirmOwner(ref, false);
    await operations.update(ref, {
      stage: 'RECOVERING',
      errorCode: null
    });
    await proofs.onStage({
      reference: ref,
      kind: 'GRAPH',
      stage: 'RECOVERING'
    });
    lifecycle.continueWork();
    const result = await chain.nativeExecution.recover(ref);
    assert.ok(['FULFILLED', 'RECOVERED'].includes(result.outcome), 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
    return confirmTerminal(bound, result);
  }
  async function unresolved(ref, error) {
    const diagnostic = privateFailureDiagnostic(error, 'FLAT_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED');
    // Preserve the first original cause before an uncertain journal write or
    // the public keeper/HTTP mapper can replace it. This private callback grants
    // no consent, key use, reconciliation, retry or replacement operation.
    try {
      await proofs.onPrivateAudit({
        reference: ref,
        stage: 'account-first-failure',
        originalError: error,
        diagnostic
      });
    } catch {/* Diagnostic storage must not replace the original outcome. */}
    if (!lifecycle.isUnavailable() && operations.operation(ref).outcome === null) {
      await operations.update(ref, {
        stage: 'UNKNOWN',
        ...(operations.operation(ref).manualLifecycle ? {
          manualLifecycle: {
            ...operations.operation(ref).manualLifecycle,
            state: 'UNKNOWN',
            history: [...operations.operation(ref).manualLifecycle.history, {
              state: 'UNKNOWN',
              generation: operations.operation(ref).manualLifecycle.generation,
              evidence: null
            }]
          }
        } : {}),
        errorCode: diagnostic.code,
        errorCauseCodes: diagnostic.causeCodes,
        ...(diagnostic.auditBudget ? {
          errorAuditBudget: diagnostic.auditBudget
        } : {})
      });
      await proofs.onPrivateAudit({
        reference: ref,
        stage: 'account-operation-failed',
        errorCode: diagnostic.code,
        errorCauseCodes: diagnostic.causeCodes,
        ...(diagnostic.auditBudget ? {
          auditBudget: diagnostic.auditBudget
        } : {})
      });
    }
  }
  async function readRetainedOwnerOutcome(entry) {
    const bound = validateBoundRequest(entry.request, profile.config);
    const outcome = validateOutcome(entry.outcome, bound),
      terminal = entry.terminal;
    assert.ok(terminal && entry.submission?.observation, 'FLAT_ACCOUNT_OWNER_VIEW_ORIGINAL_REQUIRED');
    const submission = entry.submission;
    const original = await chain.observer.readTransaction({
      kind: submission.kind,
      identitySHA256: profile.identitySHA256,
      transactionHash: submission.transactionHash,
      calldataSHA256: submission.calldataSHA256
    });
    assert.ok(original, 'FLAT_ACCOUNT_OWNER_VIEW_ORIGINAL_UNAVAILABLE');
    validateFlatAccountOwnerObservation({
      identity: profile.identity,
      artifact: chain.pool.artifact,
      submission,
      authorization: entry.prepared ? decodeStatement('authorization', entry.prepared.authorization.publicInputs) : null,
      observation: original
    });
    let receipt, disposition;
    if (entry.kind === 'GRAPH') {
      const transaction = await chain.runtime.transaction('0x' + terminal.transactionHash);
      assert.ok(transaction, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_UNAVAILABLE');
      assert.equal(flatAccountCalldataHash(transaction.input), terminal.calldataSHA256, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      const decoded = decodeNativeValueTerminalCalldata(transaction.input);
      ownerViewTerminalObserver ??= await chain.createNativeValueTerminalObserver({
        runtime: chain.runtime,
        system: chain.system,
        poolIndex: chain.poolIndex
      });
      const observed = await ownerViewTerminalObserver.observe({
        kind: decoded.kind,
        submission: {
          target: chain.pool.address,
          calldata: transaction.input,
          calldataSHA256: terminal.calldataSHA256,
          transactionHash: terminal.transactionHash
        },
        statement: decoded.statement,
        binding: entry.nativeBinding
      });
      assert.ok(['FULFILLED', 'RECOVERED'].includes(observed.outcome), 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_REQUIRED');
      assert.equal(observed.calldataSHA256, terminal.calldataSHA256, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      receipt = observed.receipt;
      disposition = observed.outcome;
      assert.equal(outcome.disposition, disposition === 'FULFILLED' ? 'APPLIED' : 'RECOVERED', 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    } else {
      assert.equal(original.transaction.hash, terminal.transactionHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      assert.equal(submission.calldataSHA256, terminal.calldataSHA256, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
      receipt = await chain.runtime.receipt('0x' + terminal.transactionHash);
      disposition = 'APPLIED';
      assert.equal(outcome.disposition, disposition, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    }
    assert.ok(receipt, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_UNAVAILABLE');
    await chain.runtime.checkReceipt(receipt);
    assert.equal(receipt.status, '0x1', 'FLAT_ACCOUNT_SUCCESS_REQUIRED');
    assert.equal(format.bare(receipt.transactionHash), terminal.transactionHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(format.bare(receipt.blockHash), terminal.blockHash, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(BigInt(receipt.blockNumber).toString(), terminal.blockNumber, 'FLAT_ACCOUNT_OWNER_VIEW_TERMINAL_CHANGED');
    assert.equal(outcome.blockHash, terminal.blockHash, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.blockNumber, terminal.blockNumber, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.disposition, terminal.disposition, 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    assert.equal(outcome.outcomeId, sha({
      identitySHA256: profile.identitySHA256,
      ownerOperationRef: bound.ownerOperationRef,
      kind: bound.kind,
      ...terminal
    }), 'FLAT_ACCOUNT_OWNER_VIEW_OUTCOME_CHANGED');
    return {
      request: {
        requestId: bound.requestId,
        kind: bound.kind,
        state: 'CONFIRMED',
        disposition
      },
      receipt
    };
  }
  async function privateOwnerView() {
    const entries = journal.rows().filter(entry => entry.request !== null);
    const requests = entries.map(entry => ({
      requestId: entry.request.requestId,
      kind: entry.kind,
      state: entry.outcome === null ? 'UNRESOLVED' : 'STALE',
      disposition: null
    }));
    try {
      await lifecycle.healthy();
    } catch {
      return format.projectFlatAccountOwnerView({
        asset: profile.asset,
        current: null,
        requests
      });
    }
    const receipts = [];
    for (let index = 0; index < entries.length; index++) {
      // HTTP admission, a recover action, or journal CONFIRMED alone is never a
      // terminal disposition. Unresolved originals stay unresolved in this view.
      if (entries[index].outcome === null) continue;
      try {
        const checked = await readRetainedOwnerOutcome(entries[index]);
        requests[index] = checked.request;
        receipts.push({
          index,
          receipt: checked.receipt
        });
      } catch {/* Preserve STALE/null, without exposing private exception data. */}
    }
    let current = null;
    try {
      const summary = await chain.owner.ownerView.summary(),
        view = await chain.reader.read(),
        state = view.ledger.publicState;
      assert.equal(summary.identitySHA256, profile.identitySHA256, 'FLAT_ACCOUNT_OWNER_VIEW_IDENTITY');
      assert.equal(summary.observed.blockHash, view.head.hash, 'FLAT_ACCOUNT_OWNER_VIEW_HEAD_CHANGED');
      assert.equal(summary.observed.timestamp, view.head.timestamp, 'FLAT_ACCOUNT_OWNER_VIEW_HEAD_CHANGED');
      for (const {
        index,
        receipt
      } of receipts) {
        try {
          await chain.runtime.assertCanonical(receipt);
          assert.ok(BigInt(receipt.blockNumber) <= BigInt(view.head.number), 'FLAT_ACCOUNT_OWNER_VIEW_STALE_HEAD');
        } catch {
          requests[index] = {
            ...requests[index],
            state: 'STALE',
            disposition: null
          };
        }
      }
      await chain.reader.assertCurrent(view);
      current = {
        observed: {
          observedAt: Date.now(),
          blockNumber: view.head.number,
          blockHash: view.head.hash,
          timestamp: view.head.timestamp
        },
        balances: copy(summary.balances),
        backing: {
          held: state.actualAssetBalance,
          liabilities: state.backedAmount,
          surplus: state.surplus,
          deficit: '0'
        }
      };
      return format.projectFlatAccountOwnerView({
        asset: profile.asset,
        current,
        requests
      });
    } catch {
      // No cached amounts or fabricated zeros when the owner/head/backing is
      // unavailable. Previously successful rows are also downgraded to STALE.
      return format.projectFlatAccountOwnerView({
        asset: profile.asset,
        current: null,
        requests
      });
    }
  }
  return Object.freeze({
    request,
    register,
    snapshotFromView,
    confirmOwner,
    submitOwner,
    tokenFundingReady,
    requireFixedManualEpoch,
    nativeNoteApproval,
    executeNote,
    manualGraphTime,
    executeGraph,
    confirmTerminal,
    reconcileOriginal,
    recoverOriginal,
    unresolved,
    readRetainedOwnerOutcome,
    privateOwnerView
  });
}
