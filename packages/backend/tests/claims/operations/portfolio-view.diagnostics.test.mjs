/** Focused host-only observation tests. Synthetic branded boundaries below are
 * not native custody, deployment or proof acceptance. No runtimes are started. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment } from '../../../src/claims/protocol/framing.mjs';

const systems = new WeakMap(), portfolios = new WeakMap(), observers = new WeakMap(), quorums = new WeakMap();
const url = path => new URL(path, import.meta.url).href;
mock.module(url('../ops/deploy-native-claims.mjs'), { exports: {
  assertOwnedNativeClaimSystem(runtime, claims) { assert.equal(systems.get(claims), runtime, 'TEST_ORIGINAL_SYSTEM'); },
} });
mock.module(url('../global-state/flat-portfolio-authority.mjs'), { exports: {
  assertOwnedFlatPortfolio(runtime, portfolio) { assert.equal(portfolios.get(portfolio), runtime, 'TEST_ORIGINAL_PORTFOLIO'); },
} });
mock.module(url('./owned-state.mjs'), { exports: {
  assertOwnedClaimObserver(observer) { assert.ok(observers.has(observer), 'TEST_ORIGINAL_OBSERVER'); },
  ownedClaimObserverBindings(observer) { assert.ok(observers.has(observer), 'TEST_ORIGINAL_OBSERVER'); return observers.get(observer); },
} });
mock.module(url('./operators.mjs'), { exports: {
  assertOwnedClaimOperatorQuorum(quorum, observer) { assert.equal(quorums.get(quorum), observer, 'TEST_ORIGINAL_QUORUM'); },
} });
const { createNativeClaimPortfolioView } = await import('../../../src/claims/operations/portfolio-view.mjs');
const h = value => createHash('sha256').update('synthetic portfolio diagnostic/' + value).digest('hex');
const fixed = code => ({ code, causeCode: null, causeCodes: [] });
const unavailable = 'CLAIM_PORTFOLIO_CUSTODY_UNAVAILABLE';

function fixture() {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? h(name).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '7'
      : type === 'u8' ? '2' : type === 'field32' ? '01' + h(name).slice(2) : h(name)]));
  config.ledgerNamespace = config.hubDomain;
  const head = { hash: h('head'), number: '9', timestamp: '300' };
  const asset = { assetId: h('asset'), token: config.wrapper, pool: config.pool, scope: config.scope, policy: config.policy };
  const state = { view: { status: 'LIVE', coherent: true,
    observed: { blockHash: head.hash, blockNumber: head.number, timestamp: head.timestamp },
    assets: [{ asset, status: 'LIVE', balances: { available: '3000000' } }] },
  health: { head: { ...head } }, current: { head: { ...head } }, calls: { health: 0, read: 0, assertCurrent: 0 } };
  const runtime = {}, claims = { configs: [config] };
  const portfolio = { registry: [asset], async ownerView() { return state.view; } };
  const observer = {
    async read() { state.calls.read++; if (Object.hasOwn(state, 'readError')) throw state.readError; return state.current; },
    async assertCurrent(current) {
      state.calls.assertCurrent++; assert.equal(current, state.current);
      if (Object.hasOwn(state, 'currentError')) throw state.currentError;
    },
  };
  const quorum = { async health(input) {
    state.calls.health++; assert.deepEqual(input, { claimDomain: claimDomainCommitment(config), mode: 'ingress' });
    if (Object.hasOwn(state, 'healthError')) throw state.healthError;
    return state.health;
  } };
  systems.set(claims, runtime); portfolios.set(portfolio, runtime);
  observers.set(observer, { system: claims }); quorums.set(quorum, observer);
  const input = { runtime, claims, portfolio, observer, quorum };
  return { state, input, ownerView: createNativeClaimPortfolioView(input) };
}

async function unavailablePosition(fixture, expected = fixed(unavailable), amount = '3000000') {
  const view = await fixture.ownerView(), position = view.nativeClaims[0];
  assert.equal(position.custodyObservation, 'UNAVAILABLE');
  assert.equal(position.availablePrivateClaims, amount);
  assert.equal(position.nativeSelfCustody, false); assert.equal(position.underlyingSpendable, false);
  assert.deepEqual(position.custodyDiagnostic, expected);
  assert.ok(Object.isFrozen(position) && Object.isFrozen(position.custodyDiagnostic)
    && Object.isFrozen(position.custodyDiagnostic.causeCodes));
  assert.deepEqual(Object.keys(position.custodyDiagnostic), ['code', 'causeCode', 'causeCodes']);
  return view;
}

test('current custody still requires original capabilities and all existing live checks', async () => {
  const f = fixture();
  const result = await f.ownerView(), position = result.nativeClaims[0];
  assert.equal(position.custodyObservation, 'CURRENT_QUORUM');
  assert.equal(Object.hasOwn(position, 'custodyDiagnostic'), false);
  assert.equal(position.availablePrivateClaims, '3000000');
  assert.deepEqual(f.state.calls, { health: 1, read: 1, assertCurrent: 1 });
  for (const key of ['runtime', 'claims', 'portfolio', 'observer', 'quorum'])
    assert.throws(() => createNativeClaimPortfolioView({ ...f.input, [key]: {} }), /TEST_ORIGINAL/);
  assert.throws(() => createNativeClaimPortfolioView({ ...f.input, skipHealth: true }), /EXACT_FIELDS/);
  quorums.delete(f.input.quorum);
  await assert.rejects(f.ownerView(), /TEST_ORIGINAL_QUORUM/);
  assert.deepEqual(f.state.calls, { health: 1, read: 1, assertCurrent: 1 });
});

test('wrapped explicit assertion labels survive without comparison values, keys, witnesses or native identity', async () => {
  const f = fixture(), secret = 'private witness key and native transaction identity';
  let cause;
  try { assert.equal(secret, 'other private value', 'CLAIM_CURRENT_PRINCIPAL_DEFICIT'); } catch (error) { cause = error; }
  f.state.healthError = Object.assign(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN', { cause }), {
    key: secret, witness: secret, nativeId: secret, causeCodes: ['CLAIM_CURRENT_PRINCIPAL_DEFICIT'],
  });
  const result = await unavailablePosition(f, { code: 'FLAT_OPERATOR_SIGNING_UNCERTAIN',
    causeCode: 'CLAIM_CURRENT_PRINCIPAL_DEFICIT', causeCodes: ['CLAIM_CURRENT_PRINCIPAL_DEFICIT'] });
  const encoded = JSON.stringify(result);
  for (const marker of [secret, 'other private value', 'stack', 'witness', 'nativeId', 'ERR_ASSERTION'])
    assert.ok(!encoded.includes(marker));
  assert.deepEqual(f.state.calls, { health: 1, read: 0, assertCurrent: 0 });
});

test('error code labels and bounded cyclic causes are copied without arbitrary diagnostic extensions', async () => {
  const f = fixture(), error = new Error('private RPC text');
  error.code = 'FLAT_OPERATOR_AUDIT_TOO_OLD'; error.cause = error;
  error.causeCodes = ['CLAIM_A', 'CLAIM_A', 'CLAIM_B', 'CLAIM_C', 'CLAIM_D', 'CLAIM_E'];
  error.auditBudget = { phase: 'after-claim-coverage', elapsedMilliseconds: 30001, limitMilliseconds: 30000 };
  f.state.healthError = error;
  const result = await unavailablePosition(f, { code: 'FLAT_OPERATOR_AUDIT_TOO_OLD',
    causeCode: 'CLAIM_C', causeCodes: ['CLAIM_A', 'CLAIM_B', 'CLAIM_C'] });
  error.causeCodes[0] = 'CLAIM_CHANGED';
  assert.equal(result.nativeClaims[0].custodyDiagnostic.causeCodes[0], 'CLAIM_A');
  assert.ok(!JSON.stringify(result).includes('auditBudget'));
  let chain = new Error('CLAIM_CAUSE_7');
  for (let i = 6; i >= 0; i--) chain = new Error('CLAIM_CAUSE_' + i, { cause: chain });
  f.state.healthError = chain;
  await unavailablePosition(f, { code: 'CLAIM_CAUSE_0', causeCode: 'CLAIM_CAUSE_4',
    causeCodes: ['CLAIM_CAUSE_1', 'CLAIM_CAUSE_2', 'CLAIM_CAUSE_3', 'CLAIM_CAUSE_4'] });
});

test('unexpected throws, accessors and proxies remain opaque without executing their hooks', async () => {
  let hooks = 0;
  const trap = () => { hooks++; throw new Error('private trap value'); };
  const accessors = Object.create(null);
  for (const key of ['code', 'message', 'cause', 'causeCodes', 'auditBudget', 'stack', 'toJSON'])
    Object.defineProperty(accessors, key, { get: trap });
  const proxy = new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap, ownKeys: trap });
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  const errors = [undefined, null, 4, Symbol('private symbol'), 'CLAIM_TEXT_NOT_AN_ERROR',
    new Error('private RPC wire payload'), new Error('CLAIM_FAILURE\nprivate comparison value'), accessors, proxy, revoked.proxy,
    { message: 'private value', cause: proxy, causeCodes: proxy, auditBudget: proxy },
    { message: 'private value', causeCodes: revoked.proxy }];
  for (const error of errors) {
    const f = fixture(); f.state.healthError = error;
    const result = await unavailablePosition(f);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
  const f = fixture(), causes = [];
  Object.defineProperty(causes, '0', { get: trap });
  f.state.healthError = { code: 'CLAIM_KNOWN_FAILURE', cause: proxy, causeCodes: causes, auditBudget: proxy };
  await unavailablePosition(f, fixed('CLAIM_KNOWN_FAILURE'));
  assert.equal(hooks, 0);
});

test('each private/health head mismatch stays unavailable with a fixed reason and no head values', async () => {
  for (const key of ['hash', 'number', 'timestamp']) {
    const f = fixture(); f.state.health.head[key] = key === 'hash' ? h('other') : '999';
    await unavailablePosition(f, fixed('CLAIM_PORTFOLIO_HEAD_MISMATCH'));
    assert.deepEqual(f.state.calls, { health: 1, read: 0, assertCurrent: 0 });
  }
  const f = fixture(); f.state.current.head.hash = h('later head');
  await unavailablePosition(f, fixed('CLAIM_PORTFOLIO_HEAD_MISMATCH'));
  assert.deepEqual(f.state.calls, { health: 1, read: 1, assertCurrent: 1 });
});

test('late observer read/current failures cannot leave custody current after an earlier matching head', async () => {
  for (const key of ['readError', 'currentError']) {
    const f = fixture(); f.state[key] = new Error('CLAIM_CURRENT_HEAD_CHANGED');
    await unavailablePosition(f, fixed('CLAIM_CURRENT_HEAD_CHANGED'));
    delete f.state[key];
    const recovered = (await f.ownerView()).nativeClaims[0];
    assert.equal(recovered.custodyObservation, 'CURRENT_QUORUM');
    assert.equal(Object.hasOwn(recovered, 'custodyDiagnostic'), false);
  }
});

test('private-view status, coherence and unavailable assets skip custody reads and preserve known amounts', async () => {
  for (const change of [state => { state.view.status = 'UNAVAILABLE'; }, state => { state.view.coherent = false; },
    state => { state.view.assets[0].status = 'UNAVAILABLE'; state.view.assets[0].balances = null; }]) {
    const f = fixture(); change(f.state);
    await unavailablePosition(f, fixed('CLAIM_PORTFOLIO_PRIVATE_VIEW_UNAVAILABLE'),
      f.state.view.assets[0].status === 'LIVE' ? '3000000' : null);
    assert.deepEqual(f.state.calls, { health: 0, read: 0, assertCurrent: 0 });
  }
});

test('funded private evidence precedes readiness assertions while native run/profile guards stay closed', () => {
  const source = readFileSync(new URL('../../../integration/native-claim-flow.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const funded = await ownerView();');
  const end = source.indexOf('result.acceptance.coherentPrivateAccount = true;', start);
  assert.ok(start >= 0 && end > start);
  const region = source.slice(start, end), write = region.indexOf("writeFixturePrivate(join(privateDirectory, 'funded-private-portfolio.json'), funded);");
  assert.ok(write > 0 && write < region.indexOf('assert.'));
  assert.match(region, /assert\.ok\(funded\.nativeClaims\.every\(asset => asset\.custodyObservation === 'CURRENT_QUORUM'\),\s*'NATIVE_CLAIM_FUNDED_PORTFOLIO_CUSTODY_UNAVAILABLE'\)/);
  assert.match(source, /const REAL_NATIVE_RUN_DISABLED = true;/);
  assert.match(source, /const ACCEPTANCE_PROFILE = 'SOLANA_LOADED_POST_DELIVERY_FACTS_PROBE';/);
});
