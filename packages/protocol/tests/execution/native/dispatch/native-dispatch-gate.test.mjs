/** Pure rejection/codec coverage. NO proof/backend/node/native transfer runs.
 * A shape-valid synthetic R here is never claimed cryptographically verified. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshKey } from '../../../../../engine/src/notes/private-note-encoding.mjs';
import { nativeProviderIdentity, nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE,
  nativeAdmissionChainDomain, nativeAdmissionRuleCommitment } from '../../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeTransferActionCommitment } from '../../../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { normalizeNativeDispatchRequest, assertNativeDispatchBinding, nativeDispatchRetryDecision,
  createNativeDispatchGate } from '../../../../../backend/src/execution/native/dispatch/native-dispatch-gate.mjs';
import { nativeFixtureEndpointCommitment, nativeFixtureCustodyCommitment } from '../../../../../backend/src/evidence/native-quorum-observer.mjs';

const h = n => n.toString(16).padStart(64, '0');
const words = value => Array.from({ length: 8 }, (_, i) => BigInt('0x' + value.slice(i * 8, i * 8 + 8)).toString());
function fixture() {
  const key = freshKey(), providerKey = { x: key.x.toString('hex'), y: key.y.toString('hex') };
  const terms = { scope: h(1), policy: h(2), asset: h(3), amount: '3000000', executionFrom: '100', executionUntil: '200', settleBefore: '250' };
  const rule = { family: '2', genesis: h(4), asset: h(5), finalityKind: '2', minimumConfirmations: '0', maximumEvidenceLifetime: '300', maximumClockSkew: '3' };
  const chainDomain = nativeAdmissionChainDomain(rule);
  const sourceCommitment = nativeFixtureEndpointCommitment({ family: 'SOL', genesis: rule.genesis, asset: rule.asset, rawHex: h(6) });
  const destinationCommitment = nativeFixtureEndpointCommitment({ family: 'SOL', genesis: rule.genesis, asset: rule.asset, rawHex: h(7) });
  const action = { chainDomain, signerIdentity: nativeProviderIdentity(providerKey), sourceCommitment, destinationCommitment,
    amount: terms.amount, custodyKind: 1, custodyCommitment: nativeFixtureCustodyCommitment({ chainDomain, sourceCommitment, destinationCommitment }),
    executionFrom: terms.executionFrom, executionUntil: terms.executionUntil, settleBefore: terms.settleBefore,
    receiptKeyCommitment: h(8), receiptRho: h(9), deliveryRiskCommitment: h(10), actionSalt: h(11) };
  const hubDomain = h(12), registryCommitment = h(13), payoutCommitment = h(14), deliveryRiskSalt = h(15);
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE, hubDomain, registryCommitment,
    chainDomain, sourceCommitment, destinationCommitment, amount: terms.amount, scope: terms.scope, policy: terms.policy, asset: terms.asset,
    payoutCommitment, settleBefore: terms.settleBefore, salt: deliveryRiskSalt });
  const evidencePolicy = nativeAdmissionRuleCommitment(rule);
  const quote = { scope: terms.scope, policy: terms.policy, asset: terms.asset, hubDomain, registryCommitment, action, payoutCommitment, deliveryRiskSalt };
  const publicInputs = [terms.scope, terms.policy, terms.asset, hubDomain, registryCommitment, h(16), h(17), h(18),
    chainDomain, evidencePolicy, nativeTransferActionCommitment(action), payoutCommitment].flatMap(words).concat('110', '190');
  const input = { readyProof: { proof: Buffer.alloc(458 * 32), publicInputs }, action: structuredClone(action), deliveryRiskSalt };
  return { binding: { terms, hubDomain, registryCommitment, providerKey, evidencePolicy, quote }, input };
}
function replaceDigest(input, index, value) { input.readyProof.publicInputs.splice(index * 8, 8, ...words(value)); }

test('R wire is copied, strict, canonical, and has no caller verifier or recursive-key override', () => {
  const { input } = fixture(), normalized = normalizeNativeDispatchRequest(input);
  input.readyProof.proof[31] = 9; input.action.amount = '8'; input.readyProof.publicInputs[0] = '9';
  assert.equal(normalized.readyProof.proof[31], 0);
  assert.equal(normalized.action.amount, '3000000'); assert.equal(normalized.readyProof.publicInputs[0], '0');
  assert.ok(Object.isFrozen(normalized.action)); assert.ok(Object.isFrozen(normalized.readyProof.publicInputs));
  for (const name of ['verified', 'verify', 'graph', 'slot', 'nk', 'nativeRuntime']) {
    const f = fixture(); f.input[name] = name === 'verify' ? () => true : true;
    assert.throws(() => normalizeNativeDispatchRequest(f.input), /PAEG_DISPATCH_INPUT/);
  }
  for (const name of ['verified', 'proofFields', 'vkFields']) {
    const f = fixture(); f.input.readyProof[name] = true;
    assert.throws(() => normalizeNativeDispatchRequest(f.input), /PAEG_DISPATCH_INPUT/);
  }
});

test('R rejects accessors, proxies, sparse/noncanonical words and field-range violations', () => {
  let f = fixture(); Object.defineProperty(f.input, 'action', { get() { throw Error('getter called'); }, enumerable: true });
  assert.throws(() => normalizeNativeDispatchRequest(f.input), /PAEG_DISPATCH_INPUT/);
  f = fixture(); assert.throws(() => normalizeNativeDispatchRequest(new Proxy(f.input, {})), /PAEG_DISPATCH_INPUT/);
  f = fixture(); delete f.input.readyProof.publicInputs[3]; assert.throws(() => normalizeNativeDispatchRequest(f.input));
  for (const word of ['01', '1\n', '0x01', '-1', 1, '4294967296']) {
    f = fixture(); f.input.readyProof.publicInputs[0] = word; assert.throws(() => normalizeNativeDispatchRequest(f.input));
  }
  f = fixture(); f.input.readyProof.publicInputs[96] = '18446744073709551616'; assert.throws(() => normalizeNativeDispatchRequest(f.input));
  f = fixture(); f.input.readyProof.proof = Buffer.alloc(458 * 32 - 1); assert.throws(() => normalizeNativeDispatchRequest(f.input), /PROOF_BYTES/);
  f = fixture(); f.input.readyProof.proof.fill(255, 0, 32); assert.throws(() => normalizeNativeDispatchRequest(f.input), /PROOF_FIELD/);
  f = fixture(); f.input.action.receiptKeyCommitment += '\n'; assert.throws(() => normalizeNativeDispatchRequest(f.input));
  f = fixture(); f.input.readyProof.proof.extra = true; assert.throws(() => normalizeNativeDispatchRequest(f.input), /PROOF_BYTES/);
});

test('local bindings bind all independently known R digests to own accepted quote', () => {
  const { binding, input } = fixture(), checked = assertNativeDispatchBinding(binding, input);
  assert.equal(checked.intent.statement.payoutCommitment, binding.quote.payoutCommitment);
  assert.equal(checked.intent.statement.actionCommitment, nativeTransferActionCommitment(input.action));
  assert.equal(checked.intent.readyProofSHA256.length, 64);
  // Shape-valid bytes above are never sent to the verifier in these tests.
  for (const digestIndex of [0, 1, 2, 3, 4, 8, 9, 10, 11]) {
    const f = fixture(); replaceDigest(f.input, digestIndex, h(90));
    assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /PAEG_DISPATCH_/);
  }
  for (const digestIndex of [5, 6, 7]) {
    const f = fixture(); replaceDigest(f.input, digestIndex, '0'.repeat(64));
    assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /PAEG_DISPATCH_INPUT/);
  }
});

test('changes to native source/destination/custody/amount/provider or compensation cannot rebind a quote', () => {
  for (const field of ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment',
    'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt']) {
    const f = fixture(); f.input.action[field] = h(99);
    assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /PAEG_DISPATCH_QUOTE_CHANGED/);
  }
  let f = fixture(); f.input.action.amount = '3000001'; assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /QUOTE_CHANGED/);
  f = fixture(); f.input.deliveryRiskSalt = h(99); assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /QUOTE_CHANGED/);
  f = fixture(); f.binding.quote.payoutCommitment = h(99); assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /PAYOUT_CHANGED/);
  f = fixture(); f.binding.providerKey = fixture().binding.providerKey; assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /PROVIDER_CHANGED/);
  f = fixture(); f.input.action.custodyKind = 0; assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /CUSTODY_KIND/);
});

test('the fixed full-owner-refund/provider-loss clause is recomputed, not merely compared', () => {
  const f = fixture(); f.binding.quote.action.deliveryRiskCommitment = h(98); f.input.action.deliveryRiskCommitment = h(98);
  replaceDigest(f.input, 10, nativeTransferActionCommitment(f.input.action));
  assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /RISK_CHANGED/);
});

test('Ready half-open interval must fit the exact action interval and cutoff', () => {
  for (const [from, until] of [['99', '190'], ['110', '201'], ['110', '110'], ['190', '110']]) {
    const f = fixture(); f.input.readyProof.publicInputs[96] = from; f.input.readyProof.publicInputs[97] = until;
    assert.throws(() => assertNativeDispatchBinding(f.binding, f.input), /READY_WINDOW/);
  }
});

test('all claimed/signed/uncertain phases permit only exact-identity reconciliation', () => {
  const f = fixture(), { intent } = assertNativeDispatchBinding(f.binding, f.input);
  assert.equal(nativeDispatchRetryDecision(null, intent), 'FIRST');
  for (const phase of ['INTENT', 'PREPARED', 'SIGNED', 'BROADCAST', 'UNCERTAIN', 'OBSERVED']) {
    assert.equal(nativeDispatchRetryDecision({ phase, intent }, structuredClone(intent)), 'RECONCILE');
    const changed = structuredClone(intent); changed.readyProofSHA256 = h(101);
    assert.throws(() => nativeDispatchRetryDecision({ phase, intent }, changed), /REBOUND/);
    changed.readyProofSHA256 = intent.readyProofSHA256; changed.statement.snapshotDigest = h(102);
    assert.throws(() => nativeDispatchRetryDecision({ phase, intent }, changed), /REBOUND/);
  }
  assert.throws(() => nativeDispatchRetryDecision({ phase: 'UNKNOWN_RETRY', intent }, intent), /JOURNAL_PHASE/);
});

test('only durable PRE_SIGN_REJECTED permits new R; every immutable dispatch term stays pinned', () => {
  const f = fixture(), { intent } = assertNativeDispatchBinding(f.binding, f.input), changed = structuredClone(intent);
  changed.readyProofSHA256 = h(103); changed.statement.snapshotDigest = h(104); changed.statement.readyFrom = '120';
  assert.equal(nativeDispatchRetryDecision({ phase: 'PRE_SIGN_REJECTED', intent }, changed), 'RETRY_PRE_SIGN');
  for (const field of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'localCommitment', 'dispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment']) {
    const rebound = structuredClone(changed); rebound.statement[field] = h(105);
    assert.throws(() => nativeDispatchRetryDecision({ phase: 'PRE_SIGN_REJECTED', intent }, rebound), /REBOUND/);
  }
  const rebound = structuredClone(changed); rebound.action.amount = '1';
  assert.throws(() => nativeDispatchRetryDecision({ phase: 'PRE_SIGN_REJECTED', intent }, rebound), /REBOUND/);
});

test('gate bootstrap rejects lookalike deployment/native/health capabilities before work', async () => {
  const f = fixture(), cfg = { path: '/tmp/paeg-never-created-dispatch-test', password: 'synthetic-only', evmRuntime: {}, system: {},
    poolIndex: 0, nativeRuntime: {}, observer: { health: async () => ({ status: 'HEALTHY' }) }, rule: {}, recipientIndex: 0,
    terms: f.binding.terms, acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE };
  await assert.rejects(createNativeDispatchGate(cfg), /NATIVE_OWNED_SYSTEM_CAPABILITY/);
  await assert.rejects(createNativeDispatchGate({ ...cfg, verify: async () => true }), /PAEG_DISPATCH_INPUT/);
  await assert.rejects(createNativeDispatchGate({ ...cfg, acceptedLossClause: 'INSURED' }), /EXPLICIT_LOSS_ACCEPTANCE/);
});
