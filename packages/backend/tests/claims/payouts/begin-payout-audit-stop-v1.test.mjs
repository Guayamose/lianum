/** Source-extracted host ordering/lifecycle tests only. All fixture/RPC/actor
 * ports below are synthetic. No owned runtime, signature, prover or key runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { assertBeginPayoutAuditReleaseV1, assertBeginPayoutAuditReceiptV1,
  CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1,
  CLAIM_BEGIN_PAYOUT_AUDIT_RELEASE_V1 } from '@lianum/proofs/jobs/begin-payout-audit-policy-v1';
const source = readFileSync(new URL('../../../src/claims/controller/controller.mjs', import.meta.url), 'utf8');
const cut = (text, a, b) => { const start = text.indexOf(a), end = text.indexOf(b, start); assert.ok(start >= 0 && end > start); return text.slice(start, end); };
const compile = (body, env) => vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body + '\n})')(env);
const copy = value => structuredClone(value), freeze = value => Object.freeze(value);
const ownerSource = cut(source, 'function createBeginAuditOwnerV1()', '\n/** Only the fixed diagnostic constructor');
const owner = () => compile(ownerSource + '; return createBeginAuditOwnerV1();',
  { assert, freeze, copy, assertBeginPayoutAuditReceiptV1, CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1 });
const receipt = () => ({ profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, method: 'BEGIN_PAYOUT',
  phase: 'BACKING_RETURNED_BEFORE_DISPATCH', limitMilliseconds: 30000, originalAuditGuardsPassed: true,
  selectedSignerCount: 3, originalAuthorizationSHA256: '11'.repeat(32), preparedSHA256: '22'.repeat(32),
  requestSHA256: '33'.repeat(32), originalHeadSHA256: '44'.repeat(32) });
function stopped(value) { value.begin(); let error; try { value.stop(receipt()); } catch (cause) { error = cause; } value.acknowledgeRetention(error); return error; }

test('fixed release is null and cannot be supplied or overridden by a caller', () => {
  assert.equal(CLAIM_BEGIN_PAYOUT_AUDIT_RELEASE_V1, null);
  assert.throws(() => assertBeginPayoutAuditReleaseV1(), /EXPLICIT_RELEASE/);
  assert.throws(() => assertBeginPayoutAuditReleaseV1(CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1), /NO_RELEASE_OPTIONS/);
  let constructorCalls = 0;
  const factory = compile(cut(source, 'export async function createNativeClaimBeginPayoutAuditControllerV1(', '\nasync function createController').replace(/^export /, '')
    + '; return createNativeClaimBeginPayoutAuditControllerV1;', { assert, assertBeginPayoutAuditReleaseV1, createController() { constructorCalls++; } });
  return assert.rejects(factory({}), /EXPLICIT_RELEASE/).then(() => assert.equal(constructorCalls, 0));
});

test('private stop is exact-object one-use and retains only a fixed safe projection', () => {
  const value = owner(), signal = stopped(value), result = value.consume(signal);
  assert.deepEqual(result, receipt()); assert.ok(Object.isFrozen(result)); value.assertReceipt(result);
  assert.throws(() => value.assertReceipt(structuredClone(result)), /ISSUED_RECEIPT_REQUIRED/);
  assert.throws(() => owner().assertReceipt(result), /CONSUMED_STOP_REQUIRED/);
  assert.throws(() => value.consume(signal), /ORIGINAL_STOP_REQUIRED/);
  assert.throws(() => value.begin(), /ATTEMPT_ONCE/); assert.throws(() => value.assertOpen(), /OWNER_TERMINAL/);
});

test('same-looking forged signals burn the outcome; wrong owner and early failures cannot pass', () => {
  for (const forged of [new Error(CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1), { message: CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1 }, undefined]) {
    const value = owner(), signal = stopped(value);
    assert.throws(() => value.consume(forged), /PRIVATE_STOP_IDENTITY/);
    assert.throws(() => value.consume(signal), /ORIGINAL_STOP_REQUIRED/);
  }
  const first = owner(), second = owner(), signal = stopped(first); stopped(second);
  assert.throws(() => second.consume(signal), /PRIVATE_STOP_IDENTITY/);
  const failed = owner(); assert.throws(() => failed.stop(receipt()), /STOP_PHASE/);
  failed.begin(); failed.finish(); assert.throws(() => failed.consume(new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD')), /ORIGINAL_STOP_REQUIRED/);
  assert.throws(() => failed.stop(receipt()), /STOP_PHASE/); assert.throws(() => failed.begin(), /ATTEMPT_ONCE/);
});

const payout = source.slice(source.indexOf('    payout: request => serial('));
const beforeSignSource = cut(payout, '            async beforeSign(prepared) {', '\n            async onSigned').trim().replace(/,$/, '');
function callbackFixture({ diagnostic = true, failBacking = false, badOrigin = false } = {}) {
  const trace = [], state = diagnostic ? owner() : null; state?.begin();
  const row = { id: 'ticket', claimDomain: 'domain', salt: 'salt', key: 'key', ticket: {
    kind: '1', amount: '3000000', maxFee: '5000', destinationCommitment: 'destination' }, native: { wireSalt: 'salt' } };
  const prepared = { intent: { immutable: true } }, authorizationOrigins = new WeakMap();
  const original = { indexes: [0, 1, 2], authorizationLifecycleProfile: 'CLAIM_AUTHORIZATION_LIFECYCLE_V4',
    authorization: {}, head: { number: '1', hash: 'hash', timestamp: '1' } };
  const env = { row, native: {}, isOwnedSolanaSplCustodyV1:()=>false, config: { nativeFamily: '2' }, assert, A: { BEGIN_PAYOUT: 'BEGIN' }, beginAuditOwner: state,
    copy, authorizationOrigins, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, Buffer,
    claimHash: bytes => createHash('sha256').update(bytes).digest('hex'), claimRouteCommitment: () => 'route-hash',
    prefix: value => '0x' + value, destination: () => 'destination', terms: (fresh, value) => value,
    route: async () => { trace.push('route'); return { endpoint: 'destination' }; },
    view: async () => { trace.push('view'); return { snapshot: {} }; },
    authorizationView: async () => { trace.push('view'); return { snapshot: {} }; },
    authorize: async (method, request) => {
      trace.push('backing'); if (failBacking) throw new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD');
      authorizationOrigins.set(original.authorization, { result: original, dispatch: null, method,
        request: { ...request, terms: { ...request.terms, action: badOrigin ? 'OTHER' : 'BEGIN' } }, captured: copy(original) });
      return original;
    },
    live: () => trace.push('live'), assertIngressKeeperLive: () => trace.push('keeper'),
    assertAuthorizationSnapshot: async () => trace.push('snapshot'), saveRow: async () => trace.push('save'),
    evm: async () => trace.push('beginPayout'), quorum: { authorizePayout: async () => { trace.push('native-presign'); return { head: {} }; } },
    adapter: { assertPrepared: async () => trace.push('native-prepared') },
    payoutKeyAuthorityV4: async () => { trace.push('native-key-authority'); return 'authority'; },
  };
  const callback = compile('return ({' + beforeSignSource + '}).beforeSign;', env);
  return { trace, state, run: () => callback(prepared) };
}

test('the actual controller callback stops only after genuine backing-return port and before every later effect', async () => {
  const f = callbackFixture(); let error;
  try { await f.run(); } catch (cause) { error = cause; f.state.acknowledgeRetention(error); } finally { f.state.finish(); }
  assert.deepEqual(f.trace, ['route', 'view', 'backing', 'live', 'keeper']);
  assertBeginPayoutAuditReceiptV1(f.state.consume(error));
  for (const key of ['snapshot', 'save', 'beginPayout', 'native-presign', 'native-key-authority']) assert.ok(!f.trace.includes(key));
});

test('earlier backing and wrong-phase origins propagate as failures rather than accepted stops', async () => {
  for (const fault of [{ failBacking: true }, { badOrigin: true }]) {
    const f = callbackFixture(fault); let error;
    try { await f.run(); } catch (cause) { error = cause; } finally { f.state.finish(); }
    assert.ok(error); assert.throws(() => f.state.consume(error), /ORIGINAL_STOP_REQUIRED/);
    assert.deepEqual(f.trace, ['route', 'view', 'backing']);
  }
});

test('ordinary controller callback preserves its original post-authorization predicates and native authority path', async () => {
  const f = callbackFixture({ diagnostic: false }); assert.equal(await f.run(), 'authority');
  assert.deepEqual(f.trace, ['route', 'view', 'backing', 'snapshot', 'save', 'beginPayout', 'view',
    'native-presign', 'save', 'snapshot', 'native-prepared', 'snapshot', 'live', 'native-key-authority']);
});

test('terminal owner still unwinds serial and reaches original close without operational live checks', async () => {
  const state = owner(); let busy = false, closed = false, released = false;
  const serialSource = cut(source, '  async function serial(work,', '\n  function selected(');
  const run = compile(serialSource + '; return serial;', { assert, live() {}, beginAuditOwner: state, busy,
    clearUnknown:async()=>{},refreshNativeValueReceiverClock:async()=>{},runtime:{},journal: { read: async () => {}, requiresReconciliation: () => false } });
  let error; try { await run(async () => { state.begin(); try { state.stop(receipt()); } catch (cause) { state.acknowledgeRetention(cause); throw cause; } }); } catch (cause) { error = cause; }
  assertBeginPayoutAuditReceiptV1(state.consume(error)); await assert.rejects(run(async () => {}), /OWNER_TERMINAL/);
  const closeBody = cut(source, '    close() {\n      // Releasing the original idle lease', '\n  });').trim().replace(/,$/, '');
  const close = compile('return ({' + closeBody + '}).close;', { assert, closed, busy, journal: { release() { released = true; } } });
  close(); assert.equal(released, true);
  assert.match(source, /assert\.ok\(!beginAuditSystemsV1\.has\(claims\) && !beginAuditKeepersV1\.has\(keeper\)/);
  assert.match(source, /assert\.ok\(!state\.consumeBeginAuditStop, 'CLAIM_BEGIN_AUDIT_LIFETIME_CANNOT_RESTART'\)/);
});

test('original native transfer awaits beforeSign before native key construction and rethrows through its original unwind', () => {
  const native = readFileSync(new URL('../../../src/chains/solana/transfers/solana-transfers.mjs', import.meta.url), 'utf8');
  const transfer = cut(native, '  async function transfer(selectedRoute,', '\n  async function broadcastRetained(');
  assert.ok(transfer.indexOf('await beforeSign(state.activePrepared)') < transfer.indexOf('const privateKey = createPrivateKey'));
  assert.ok(transfer.indexOf('const privateKey = createPrivateKey') < transfer.indexOf('const signature = sign('));
  assert.match(transfer, /if \(record\) error\.nativeId = record\.nativeId;\s*throw error;/);
  assert.match(transfer, /finally \{\s*state.activePrepared = null;\s*state.activeRoute = null;\s*state.preSignReadWindow = false;\s*state.preBroadcastReadWindow = false;\s*state.busy = false;\s*\}/);
});


test('unchanged production currentness rejects exact 30000 and a deadline crossed by the final awaited read', async () => {
  const operators = readFileSync(new URL('../../../src/claims/operations/operators.mjs', import.meta.url), 'utf8');
  const body = cut(operators, '  function withinAuditBudget(phase)', '\n  async function readCurrentView()');
  const c = { now: 0, after: null, reads: 0 };
  const check = compile(body + '; return current;', { assert, enterMetrics:()=>Object.freeze({}),leaveMetrics:()=>{},checkpointMetrics:()=>{},performance: { now: () => c.now }, started: 0,
    activeView: {}, auditMethod: 'begin-payout', auditRound: 'initial-preparation', cachedView: undefined,
    live() {}, observer: { async assertCurrent() { c.reads++; if (c.after !== null) c.now = c.after; } } });
  for (const elapsed of [29999, 29999.999]) { c.now = elapsed; await check('after-graph-coverage'); }
  for (const elapsed of [30000, 30001, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    c.now = elapsed; await assert.rejects(check('after-graph-coverage'), /AUDIT_TOO_OLD/);
  }
  c.now = 29999; c.after = 30000;
  await assert.rejects(check('after-graph-coverage'), error => {
    assert.equal(error.auditBudget.limitMilliseconds, 30000); assert.equal(error.auditBudget.method, 'begin-payout');
    assert.equal(error.auditBudget.round, 'initial-preparation'); return /AUDIT_TOO_OLD/.test(error.message);
  });
  assert.match(operators, /auditMethod = 'operation'; auditRound = 'whole-operation'; started = performance\.now\(\);\s*activeAuditMetrics = beginMetrics\(\);\s*const measuredOperation = enterMetrics\('serial'\);\s*try \{\s*await readVault\(\); activeView = await readCurrentView\(\)/);
  assert.match(operators, /started = performance\.now\(\); await readVault\(\); activeView = await readCurrentView\(\)/);
});
