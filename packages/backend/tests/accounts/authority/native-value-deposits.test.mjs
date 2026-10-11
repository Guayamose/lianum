/** Actual account D26 transition over inert journal/RPC ports. This exercises
 * retained state and retry rules; it does not mint a financial proof or account. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createNativeValueDeposits } from '../../../src/accounts/authority/native-value/native-value-authority-deposits.mjs';
import { normalizeDeviceDepositConsentV1 } from '@lianum/mobile-protocol/device-deposit-consent-v1';

const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture({ proofMissing = false } = {}) {
  const key = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).publicKey.export({
    format: 'jwk',
  });
  const accountIdentity = { accountId: 'host-d26' },
    asset = {
      assetId: sha('assetId'),
      scope: sha('scope'),
      policy: sha('policy'),
      codeHash: sha('codeHash'),
      assetIdentity: sha('assetIdentity'),
      pool: '11'.repeat(20),
      genesis: sha('genesis'),
    };
  const identity = { domainCommitment: sha('domain') },
    lifetime = sha('lifetime');
  const binding = {
    ...Object.fromEntries(
      [
        'accountIdentitySHA256',
        'originalAccountLifetime',
        'generationId',
        'ownerOperationRef',
        'assetId',
        'ownerIdentitySHA256',
        'keyScopeSHA256',
        'processIdentitySHA256',
        'originalReviewSHA256',
        'termsSHA256',
        'requestBindingSHA256',
        'assetBindingSHA256',
      ].map((k) => [k, sha(k)]),
    ),
    accountIdentitySHA256: sha(accountIdentity),
    originalAccountLifetime: lifetime,
    assetId: asset.assetId,
    requestId: 'private_native_request',
    kind: 'TOP_UP',
    originalProcessGeneration: 1,
    observedProcessGeneration: 1,
    journalRevision: 1,
    requestState: 'PREPARED',
    authorityStage: 'READY',
    submission: null,
    asset: {
      chainId: '31337',
      genesis: asset.genesis,
      pool: asset.pool,
      kind: 'NATIVE',
      token: '00'.repeat(20),
      symbol: 'ETH',
      decimals: 18,
    },
    amountAtomic: '20',
    recipient: '90'.repeat(20),
    role: null,
    custody: 'LINUX_ORIGINAL_OWNER_CUSTODY',
    publicNetwork: false,
    mobileNoteCustody: false,
    economicObservation: false,
  };
  const consent = normalizeDeviceDepositConsentV1({
    version: 1,
    profile: 'LIANUM_DEVICE_ORIGINAL_D26_V1',
    action: 'FUND_D26',
    origin: 'https://host.invalid',
    pairingId: sha('pair'),
    devicePublicKey:
      '04' +
      Buffer.from(key.x, 'base64url').toString('hex') +
      Buffer.from(key.y, 'base64url').toString('hex'),
    challengeId: sha('challenge'),
    nonce: sha('nonce'),
    expiresAt: Date.now() + 15000,
    binding,
    poolTerms: {
      scope: asset.scope,
      policy: asset.policy,
      codeHash: asset.codeHash,
      assetIdentity: asset.assetIdentity,
      domainCommitment: identity.domainCommitment,
    },
    statement: {
      scope: asset.scope,
      policy: asset.policy,
      epoch: '10',
      amount: '20',
      output: sha('output'),
    },
    rootId: sha('root'),
    noteRevision: 1,
    jobId: sha('job'),
    witnessSHA256: sha('witness'),
    proofSHA256: sha('proof'),
    publicInputsSHA256: sha('words'),
    observed: { blockNumber: '1', blockHash: sha('head'), timestamp: '6000' },
    openingDisclosure: null,
  });
  let row = {
    jobId: consent.jobId,
    consent,
    stage: 'PROVED',
    proof: proofMissing ? null : { proof: 'abcd', publicInputs: ['0'] },
    proofSHA256: consent.proofSHA256,
    publicInputsSHA256: consent.publicInputsSHA256,
    nullifier: sha('nullifier'),
    submission: null,
    observation: null,
    errorCode: null,
  };
  const order = [],
    originalFailure = Object.assign(Error('HOST_REPLY_LOST'), {
      transactionRecord: { transactionHash: '0x' + sha('transaction') },
    });
  const view = {
    header: { number: '1' },
    head: { number: '1', hash: sha('head'), timestamp: '6000' },
    ledger: {
      commitments: [],
      nullifiers: [],
      tree: {
        path() {
          assert.fail('no observed inclusion');
        },
      },
      publicState: { leaves: 0, liveReservations: 0, spent: 0, outputCapacity: 0 },
    },
  };
  const never = () => assert.fail('unused proof or custody operation');
  const family = createNativeValueDeposits({
    originalBridges: {
      isOriginalNativePrivateWorkerDepositBridgeV3: () => false,
      isOriginalNativePrivateDepositBridgeV2: () => false,
    },
    journal: {
      rows: () => [row],
      profile: () => undefined,
      workerProfile: () => undefined,
      append: never,
      installProfile: never,
      installWorkerProfile: never,
      async patch(id, fields) {
        assert.equal(id, row.jobId);
        order.push('retain:' + Object.keys(fields).join(','));
        row = { ...row, ...structuredClone(fields) };
      },
    },
    lifecycle: {
      continueWork() {},
      exclusive: (work) => work(),
      healthy: async () => {},
      isUnavailable: () => false,
      trackProof: never,
      releaseProof: never,
    },
    profile: {
      nativeNote: true,
      wrapped: false,
      nativeAsset: true,
      accountIdentity,
      config: { lifetime },
      asset,
      identity,
      identitySHA256: sha(identity),
    },
    chain: {
      reader: {
        read: async () => view,
        assertCurrent: async (actual) => assert.equal(actual, view),
      },
      observer: {
        async readTransaction(request) {
          assert.equal(request.transactionHash, sha('transaction'));
          order.push('observe');
          return null;
        },
      },
      pool: { address: '0x' + asset.pool, artifact: {} },
      system: { verify: never },
      runtime: {
        receipt: never,
        checkReceipt: never,
        async send(label, request) {
          order.push('send');
          assert.equal(row.stage, 'FUNDING_UNKNOWN');
          assert.equal(row.submission.dispatchLatched, true);
          assert.equal(label, 'flat-account-device-deposit');
          assert.deepEqual(request, { to: '0x' + asset.pool, data: '0x1234', value: '20' });
          throw originalFailure;
        },
      },
    },
    deposits: { privateWorkerEnabled: () => false },
    reservations: { reservationRows: () => [] },
    exits: { exitRows: () => [] },
    format: {
      bare: (value) => value.replace(/^0x/, ''),
      reference() {},
      copy: structuredClone,
      sha,
      transportProof: never,
      sourceProofReceiptFrame: never,
      validateObservation: never,
      calldataHash: sha,
      walletInputPublicWords: never,
      decodeWalletPoolInputs: never,
      nullifier: never,
      encodeTransaction(method, proof) {
        assert.equal(method, 'depositBalance');
        assert.equal(proof, row.proof);
        return '0x1234';
      },
    },
    continuity: { nativeSourceOriginal: null, recovery: null },
    proofs: {
      createNativeEconomicNoteProofProcessV1: never,
      createProofProcess: never,
      readOriginalNativePrivateDepositDerivationV2: never,
      onProof: never,
      onPrivateAudit: never,
    },
    operations: {
      async tokenFundingReady() {
        order.push('funding-ready');
      },
      snapshotFromView: () => ({ block: 1 }),
    },
  });
  return { family, consent, order, originalFailure, row: () => row };
}

test('D26 retains its only send before effects and a lost reply permits observation only', async () => {
  const f = fixture();
  await assert.rejects(
    f.family.deviceDeposit({ action: 'FUND_D26', consent: f.consent, witness: null }),
    (error) => error === f.originalFailure,
  );
  assert.deepEqual(f.order, [
    'funding-ready',
    'retain:stage,fundingConsent,submission',
    'send',
    'retain:submission',
  ]);
  assert.equal(f.row().submission.transactionHash, sha('transaction'));
  await assert.rejects(
    f.family.deviceDeposit({ action: 'FUND_D26', consent: f.consent, witness: null }),
    /RECONCILE_ORIGINAL_ONLY/,
  );
  const result = await f.family.deviceDeposit({
    action: 'OBSERVE_D26',
    consent: { ...f.consent, action: 'OBSERVE_D26' },
    witness: null,
  });
  assert.equal(result.stage, 'FUNDING_UNKNOWN');
  assert.equal(f.order.filter((value) => value === 'send').length, 1);
  assert.equal(f.order.at(-1), 'observe');
});

test('D26 rejects an altered binding or missing retained proof before persistence and send', async () => {
  const f = fixture();
  await assert.rejects(
    f.family.deviceDeposit({
      action: 'FUND_D26',
      consent: {
        ...f.consent,
        binding: { ...f.consent.binding, originalAccountLifetime: sha('foreign') },
      },
      witness: null,
    }),
    /LIFETIME_CHANGED/,
  );
  assert.deepEqual(f.order, []);
  const missing = fixture({ proofMissing: true });
  await assert.rejects(
    missing.family.deviceDeposit({ action: 'FUND_D26', consent: missing.consent, witness: null }),
    /ORIGINAL_PROOF_REQUIRED/,
  );
  assert.equal(
    missing.order.some((value) => value === 'send' || value.startsWith('retain:')),
    false,
  );
});
