import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateFlatOwnerReadPayload, GENERATION_PORTFOLIO_PROFILE, ORIGINAL_SPL_USDC_UNITS_V1 } from '../../../../packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs';
import { ACTIONS, DEFI_ACTIONS, ACCOUNT_ACTIONS, DEFI_PROFILE, WALLET_PROFILE, atomic, displayUnits, validateWalletState, projectWalletState,
  buildActionBody, actionReview, createWalletClient, NATIVE_IDENTITY_PROFILE, originalNativeIdentity,
  nativeIdentityDetails, nativeAmountDetails, accountAssetChoices, accountActionContext, accountReviewDetails } from '../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs';
const clientSourceURLs = {
  'index.html': new URL('../../src/client/index.html', import.meta.url),
  'app.mjs': new URL('../../src/client/app.mjs', import.meta.url),
  'view-model.mjs': new URL('../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs', import.meta.url),
};
const ownerToken = 'a'.repeat(64), actionToken = 'b'.repeat(64), intentId = 'c'.repeat(64);
const requestId = 'original_request_01';
const nativeIdentity = (overrides = {}) => ({ version: 1, profile: NATIVE_IDENTITY_PROFILE, accountId: 'native_account_01',
  claimDomain: '1'.repeat(64), nativeFamily: '1', nativeGenesis: '2'.repeat(64), nativeAsset: '3'.repeat(64),
  wrapperAssetIdentity: '4'.repeat(64), claimSymbol: 'cBTC', nativeSymbol: 'BTC', decimals: 8, atomicUnit: 'satoshi',
  observation: 'ORIGINAL_BOUND_CONFIGURATION_ONLY', ...overrides });
const solIdentity = () => nativeIdentity({ claimDomain: '5'.repeat(64), nativeFamily: '2', nativeGenesis: '6'.repeat(64),
  nativeAsset: '7'.repeat(64), wrapperAssetIdentity: '8'.repeat(64), claimSymbol: 'cSOL', nativeSymbol: 'SOL', decimals: 9, atomicUnit: 'lamport' });
const asset = (overrides = {}) => ({ version: 1, status: 'LIVE', asset: { assetId: 'd'.repeat(64), symbol: 'CLBTC', decimals: 8 },
  observed: { blockNumber: '42', blockHash: 'e'.repeat(64), timestamp: '1000', observedAt: 1000 },
  balances: { available: '1234567890123456789', reserved: '200', recovery: '30', locked: '40' },
  backing: { held: '1234567890123457029', liabilities: '1234567890123457029', surplus: '0', deficit: '0' }, requests: [], ...overrides });
const fixture = (overrides = {}) => ({ version: 1, profile: WALLET_PROFILE, connection: 'CONNECTED', portfolio: asset(),
  nativeClaims: { identity: nativeIdentity(), snapshot: { phase: 'READY', storageAvailable: true, busy: false, queued: 0, observation: 'DURABLE_JOURNAL_ONLY', requests: [] }, owner: { deposits: [], tickets: [], requests: [] } },
  capabilities: { nativeDeposit: true, nativeRedeem: true, nativeRefund: true, nativeReconcile: true, nativeResume: true, graphExecution: false },
  errors: { portfolio: null, nativeClaims: null }, ...overrides });
const reply = (value, status = 200) => ({ status, ok: status >= 200 && status < 300, async json() { return structuredClone(value); } });
const makeClient = (fetchImpl, options = {}) => createWalletClient({ fetchImpl, ownerToken, actionToken, now: () => 1234, ...options });
function admission(action, id = requestId) { return reply({ admitted: true, action, requestId: id, state: 'ADMITTED' }, 202); }

test('atomic units preserve integers beyond Number precision and never fabricate null as zero', () => {
  assert.equal(displayUnits('1234567890123456789', 8), '12345678901.23456789');
  assert.equal(displayUnits('1', 18), '0.000000000000000001'); assert.equal(displayUnits('0', 8), '0');
  assert.equal(displayUnits(null, 8), null); assert.equal(displayUnits('1', -1), null);
  for (const bad of [0, 1.1, '01', '-1', '1.0', '1e9', '1\n', ' 1', String(1n << 256n)]) assert.equal(atomic(bad), null);
  assert.equal(displayUnits(String((1n << 256n) - 1n), 0), String((1n << 256n) - 1n));
});
test('single account and unavailable balances retain four independent categories without totals', () => {
  const p = projectWalletState(fixture()); assert.equal(p.coherent, true);
  assert.deepEqual(p.assets[0].balances, fixture().portfolio.balances); assert.equal('total' in p.assets[0], false);
  const none = projectWalletState(fixture({ portfolio: asset({ status: 'UNAVAILABLE', balances: null, observed: null, backing: null }) }));
  assert.equal(none.assets[0].balances.available, null); assert.equal(none.assets[0].amounts.available, null); assert.equal(none.coherent, false);
  assert.equal(projectWalletState(fixture({ portfolio: null })).assets.length, 0);
});
test('registered partial portfolio preserves per-asset availability and no coherent claim', () => {
  const p = { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'PARTIAL', coherent: false, observed: null,
    assets: [asset(), asset({ status: 'UNAVAILABLE', balances: null, observed: null })] };
  const view = projectWalletState(validateWalletState(fixture({ portfolio: p })));
  assert.equal(view.portfolioStatus, 'PARTIAL'); assert.equal(view.coherent, false);
  assert.equal(view.assets[0].balances.available, p.assets[0].balances.available); assert.equal(view.assets[1].balances.available, null);
});
test('native wrappers are labelled custodial, even when custody observation is missing', () => {
  const p = asset({ nativeClaims: [{ kind: 'CUSTODIAL_NATIVE_CLAIM', assetId: 'd'.repeat(64), nativeSymbol: 'BTC', availablePrivateClaims: '100', custodyObservation: 'UNAVAILABLE' }] });
  const view = projectWalletState(fixture({ portfolio: p }));
  assert.equal(view.nativeClaims[0].amount, '100'); assert.equal(view.nativeClaims[0].nativeSelfCustody, false);
  assert.equal(view.nativeClaims[0].underlyingSpendable, false); assert.equal(view.nativeClaims[0].custody, 'UNAVAILABLE');
});
test('actual ERC4626 positions require explicit non-spendable underlying and a coherent live source', () => {
  const p = { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true, assets: [asset()],
    positions: [{ kind: 'ERC4626_SHARE', status: 'LIVE', shareAssetId: 'd'.repeat(64), underlyingAssetId: 'f'.repeat(64),
      availableShares: '100', estimatedRedeemableUnderlying: '99', underlyingSpendable: false }, { kind: 'UNSUPPORTED', amount: '999' }] };
  let view = projectWalletState(fixture({ portfolio: p })); assert.equal(view.positions.length, 1); assert.equal(view.positions[0].estimate, '99');
  view = projectWalletState(fixture({ portfolio: p }), { stale: true }); assert.equal(view.positions[0].estimate, null); assert.equal(view.positions[0].status, 'STALE');
  p.coherent = false; assert.equal(projectWalletState(fixture({ portfolio: p })).positions[0].estimate, null);
  p.coherent = true; p.positions[0].underlyingSpendable = true;
  assert.equal(projectWalletState(fixture({ portfolio: p })).positions[0].status, 'UNAVAILABLE');
  assert.equal(projectWalletState(fixture()).positions.length, 0);
});
test('stale account and native request projections suppress terminal dispositions', () => {
  const state = fixture({ portfolio: asset({ requests: [{ requestId, kind: 'GRAPH', state: 'CONFIRMED', disposition: 'FULFILLED' }] }),
    nativeClaims: { snapshot: { requests: [{ requestId, action: 'redeem', state: 'RUNNING' }] },
      owner: { requests: [{ requestId, action: 'redeem', state: 'SUCCEEDED', result: { status: 'DISCHARGED' } }] } } });
  const current = projectWalletState(state); assert.equal(current.requests.length, 2); assert.equal(current.requests[1].disposition, 'DISCHARGED');
  for (const row of projectWalletState(state, { stale: true }).requests) { assert.equal(row.state, 'STALE'); assert.equal(row.disposition, ''); }
});
test('fixed command body validation rejects new routes, extras, noncanonical identities and amounts', () => {
  assert.deepEqual(buildActionBody('deposit', { requestId, intentId }), { requestId, intentId });
  assert.deepEqual(buildActionBody('reconcile', { requestId }), { requestId });
  assert.throws(() => buildActionBody('graph', { requestId }));
  assert.throws(() => buildActionBody('deposit', { requestId, intentId, rpc: 'https://example.invalid' }));
  for (const bad of ['a', requestId + '\n', 'réquest_123']) assert.throws(() => buildActionBody('resume', { requestId: bad }));
  for (const bad of ['0'.repeat(64), 'C'.repeat(64), '0x' + intentId, intentId + '\n']) assert.throws(() => buildActionBody('refund', { requestId, intentId: bad }));
  for (const bad of ['0', '-1', '01', '1.1', '1e3', String(1n << 64n), 1]) assert.throws(() => buildActionBody('redeem', { requestId, amount: bad, maxFee: '1' }));
  assert.deepEqual(buildActionBody('redeem', { requestId, amount: String((1n << 64n) - 1n), maxFee: '1' }), { requestId, amount: String((1n << 64n) - 1n), maxFee: '1' });
});
test('review text states owner prerequisites and distinguishes durable admission from settlement', () => {
  assert.match(actionReview('deposit', { requestId, intentId }).notes.join(' '), /intent ya preparado/);
  assert.match(actionReview('redeem', { requestId, amount: '1', maxFee: '1' }).notes.join(' '), /salida original autorizada/);
  for (const action of Object.keys(ACTIONS)) assert.match(actionReview(action, { requestId }).notes.join(' '), /202.*admisión duradera.*nunca liquidación/);
});
test('client does nothing on construction; only explicit initial/manual reads use the fixed owner route', async () => {
  const calls = []; const c = makeClient(async (...args) => { calls.push(args); return reply(fixture()); });
  assert.equal(calls.length, 0); await c.refresh(); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/wallet/state'); assert.deepEqual(calls[0][1].headers, { 'x-wallet-owner-token': ownerToken });
  assert.equal(calls[0][1].method, 'GET'); assert.equal(calls[0][1].cache, 'no-store'); assert.equal(calls[0][1].redirect, 'error');
  assert.equal(calls[0][1].credentials, 'omit'); assert.equal(c.getState().lastUpdated, 1234);
  const visible = JSON.stringify(c.getState()); assert.equal(visible.includes(ownerToken), false); assert.equal(visible.includes(actionToken), false);
  assert.equal(c.can('deposit'), true);
});
test('immutable review, cancel and double confirm issue exactly one POST and no automatic refresh', async () => {
  const calls = []; let finish;
  const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(fixture()) : new Promise(resolve => { finish = resolve; }); });
  await c.refresh(); const body = { requestId, intentId }; const review = c.review('deposit', body);
  body.intentId = 'e'.repeat(64); review.body.requestId = 'tampered_01';
  const pending = c.confirm(); assert.equal(await c.confirm(), false); assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].options.body), { requestId, intentId });
  assert.deepEqual(calls[1].options.headers, { 'x-wallet-action-token': actionToken, 'Content-Type': 'application/json' });
  assert.equal(calls[1].path, '/api/wallet/native/deposit'); finish(admission('deposit')); assert.equal(await pending, true);
  assert.equal(calls.length, 2); assert.equal(c.getState().outcome.state, 'ADMITTED'); assert.equal(c.getState().stale, true); assert.equal(c.can('deposit'), false);
  await c.refresh(); c.review('deposit', { requestId: 'different_request', intentId }); c.cancelReview(); assert.equal(await c.confirm(), false);
});
test('editing state returned by getState cannot change the reviewed action', async () => {
  let sent; const c = makeClient(async (_, options) => options.method === 'GET' ? reply(fixture()) : (sent = JSON.parse(options.body), admission('redeem')));
  await c.refresh(); c.review('redeem', { requestId, amount: '5', maxFee: '1' }); c.getState().review.body.amount = '999';
  await c.confirm(); assert.equal(sent.amount, '5');
});
test('all five manual actions use only their fixed route and exact original body', async () => {
  for (const action of Object.keys(ACTIONS)) {
    const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(fixture()) : admission(action); });
    await c.refresh(); const body = action === 'deposit' || action === 'refund' ? { requestId, intentId }
      : action === 'redeem' ? { requestId, amount: '100', maxFee: '1' } : { requestId };
    c.review(action, body); await c.confirm(); assert.equal(calls[1].path, ACTIONS[action].route); assert.deepEqual(JSON.parse(calls[1].options.body), body);
  }
});
test('uncertain POST preserves balances and original identity, blocks actions and never retries', async () => {
  let calls = 0; const c = makeClient(async (_, options) => { calls++; if (options.method === 'POST') throw new TypeError('transport lost'); return reply(fixture()); });
  await c.refresh(); const before = c.getState().data; c.review('refund', { requestId, intentId }); assert.equal(await c.confirm(), false);
  assert.equal(calls, 2); assert.deepEqual(c.getState().data, before); assert.equal(c.getState().originalRequestId, requestId);
  assert.deepEqual(c.getState().outcome, { state: 'UNKNOWN', action: 'refund', requestId });
  assert.equal(c.can('resume'), false); assert.throws(() => c.review('deposit', { requestId: 'different_request', intentId }));
  await c.refresh(); assert.equal(calls, 3); assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.can('reconcile'), true);
  c.review('reconcile', { requestId: c.getState().originalRequestId }); assert.equal(c.getState().review.body.requestId, requestId);
});
test('HTTP failure and malformed admission remain unknown, never settlement or automatic retries', async () => {
  for (const response of [reply({ error: 'NATIVE_CLAIM_STORAGE_UNCERTAIN' }, 400), reply({ admitted: true, action: 'deposit', requestId: 'wrong_request' }, 202), reply({ admitted: true }, 200)]) {
    const c = makeClient(async (_, options) => options.method === 'GET' ? reply(fixture()) : response);
    await c.refresh(); c.review('deposit', { requestId, intentId }); await c.confirm(); assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.can('deposit'), false);
  }
});
test('failed refresh retains previous exact data as stale and successful refresh alone clears fence', async () => {
  let fail = false; const c = makeClient(async () => { if (fail) throw new Error('network'); return reply(fixture()); });
  await c.refresh(); const before = c.getState().data; fail = true; assert.equal(await c.refresh(), false);
  assert.deepEqual(c.getState().data, before); assert.equal(c.getState().stale, true); assert.equal(c.can('redeem'), false);
  fail = false; await c.refresh(); assert.equal(c.getState().stale, false); assert.equal(c.can('redeem'), true);
});
test('partial API failure preserves prior section with an explicit stale flag', async () => {
  let value = fixture(); const c = makeClient(async () => reply(value)); await c.refresh();
  value = fixture({ portfolio: null, nativeClaims: null, errors: { portfolio: 'PORTFOLIO_UNAVAILABLE', nativeClaims: 'CLAIMS_BUSY' } });
  await c.refresh(); const state = c.getState(); assert.equal(state.portfolioStale, true); assert.equal(state.nativeStale, true);
  assert.equal(state.data.portfolio.balances.available, fixture().portfolio.balances.available); assert.equal(state.data.nativeClaims.snapshot.phase, 'READY');
  assert.equal(c.can('deposit'), false); assert.equal(projectWalletState(state.data, state).portfolioStatus, 'STALE');
});
test('fresh disconnected response is disconnected, not a fabricated historical view', async () => {
  const c = makeClient(async () => reply(fixture({ connection: 'DISCONNECTED', portfolio: null, nativeClaims: null })));
  await c.refresh(); assert.equal(c.getState().stale, false); assert.equal(c.getState().data.connection, 'DISCONNECTED');
  assert.equal(c.can('deposit'), false); assert.equal(projectWalletState(c.getState().data).portfolioStatus, 'UNAVAILABLE');
});
test('invalid graph capability, malformed assets and numeric balances fail closed', async () => {
  for (const value of [fixture({ profile: 'OLD_POOL' }), fixture({ capabilities: { ...fixture().capabilities, graphExecution: true } }),
    fixture({ portfolio: asset({ balances: { available: 0, reserved: '0', recovery: '0', locked: '0' } }) }),
    fixture({ portfolio: { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true, assets: [null] } })]) {
    assert.throws(() => validateWalletState(value)); const c = makeClient(async () => reply(value)); assert.equal(await c.refresh(), false); assert.equal(c.can('deposit'), false);
  }
});
test('request deadlines remain active during body parsing for reads and admissions', async () => {
  let failBody = true, readAborted = false;
  const c = makeClient(async (_, options) => ({ ok: true, status: 200, json: () => failBody
    ? new Promise((_, reject) => options.signal.addEventListener('abort', () => { readAborted = true; reject(new Error('body timeout')); }, { once: true }))
    : Promise.resolve(fixture()) }), { readTimeoutMs: 10 });
  assert.equal(await c.refresh(), false); assert.equal(readAborted, true); assert.equal(c.getState().reading, false);
  failBody = false; assert.equal(await c.refresh(), true);
  let postAborted = false;
  const post = makeClient(async (_, options) => options.method === 'GET' ? reply(fixture()) : ({ status: 202, ok: true,
    json: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => { postAborted = true; reject(new Error('body timeout')); }, { once: true })) }), { actionTimeoutMs: 10 });
  await post.refresh(); post.review('deposit', { requestId, intentId }); assert.equal(await post.confirm(), false);
  assert.equal(postAborted, true); assert.equal(post.getState().outcome.state, 'UNKNOWN'); assert.equal(post.getState().originalRequestId, requestId);
});
test('missing bootstrap tokens never send, and missing action token leaves reads only', async () => {
  let calls = 0; const fetchImpl = async () => { calls++; return reply(fixture()); };
  const absent = makeClient(fetchImpl, { ownerToken: '__WALLET_OWNER_TOKEN__' }); assert.equal(await absent.refresh(), false); assert.equal(calls, 0);
  const readOnly = makeClient(fetchImpl, { actionToken: '' }); await readOnly.refresh(); assert.equal(calls, 1); assert.equal(readOnly.can('deposit'), false);
});
test('static app has isolated in-memory tokens, safe text rendering and no automatic action seams', async () => {
  const [html, app] = await Promise.all(['index.html', 'app.mjs'].map(name => readFile(clientSourceURLs[name], 'utf8')));
  const modelRoot = new URL('./', clientSourceURLs['view-model.mjs']);
  const modulePaths = (await readdir(modelRoot, { recursive: true })).filter(name => name.endsWith('.mjs'));
  const model = (await Promise.all(modulePaths.map(name => readFile(new URL(name, modelRoot), 'utf8')))).join('\n');
  assert.match(html, /__WALLET_OWNER_TOKEN__/); assert.match(html, /__WALLET_ACTION_TOKEN__/); assert.match(html, /HOST_REPORTED/);
  assert.match(app, /element\?\.remove\(\)/); assert.match(app, /form\.addEventListener\('input', \(\) => client\.cancelReview\(\)\)/);
  for (const source of [app, model]) assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|innerHTML|setInterval|sendBeacon/);
  assert.doesNotMatch(app, /\/api\//); assert.doesNotMatch(model, /\/api\/wallet\/(?:graph|rpc|execute)/);
  assert.equal((app.match(/void client\.refresh\(\)/g) ?? []).length, 2);
  assert.match(model, /readTimeoutMs = 90000/); assert.match(model, /actionTimeoutMs = 30000/);
});

const defiRow = (overrides = {}) => ({ version: 1, profile: DEFI_PROFILE, requestId,
  phase: 'READY_TO_REDEEM', shareAssetId: 'd'.repeat(64), underlyingToken: '0x' + 'e'.repeat(40), shares: '100',
  minimumUnderlying: '99', redeemedUnderlying: null, deadline: '1300', observation: 'PERSISTED_LAST_OBSERVATION',
  underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', underlyingPrivateSpendable: false, redemptionPublic: true,
  sendBlocked: false, keeperRestart: false, ...overrides });
const extendedFixture = (overrides = {}) => fixture({
  defi: { snapshot: { version: 1, profile: DEFI_PROFILE, operations: [defiRow()] } },
  capabilities: { ...fixture().capabilities, ...Object.fromEntries(Object.values(DEFI_ACTIONS).map(action => [action.capability, true])) },
  errors: { ...fixture().errors, networks: null, defi: null }, ...overrides });

test('network holdings are external observations, with configured distinct from current balance', () => {
  const networks = { observation: 'TRUSTED_RPC_NATIVE_HOLDINGS_ONLY', privateSpendable: false,
    chains: [{ chain: 'ethereum', configured: true, network: null }, { chain: 'base', configured: false, network: null }],
    observations: [{ schema: 'flat-portfolio-observation/1', chain: 'ethereum', status: 'fresh', balanceAtomic: '1000000000000000001',
      network: { nativeAsset: { symbol: 'ETH', decimals: 18 } }, creditEligible: false, privateSpendableAtomic: null, block: { height: '42' } }] };
  const state = validateWalletState(extendedFixture({ networks })); let view = projectWalletState(state);
  assert.equal(view.networks[0].configured, true); assert.equal(view.networks[1].observations.length, 0);
  assert.equal(view.networks[0].observations[0].display, '1.000000000000000001'); assert.equal(view.networks[0].observations[0].privateSpendable, false);
  assert.equal(view.assets[0].balances.available, fixture().portfolio.balances.available);
  for (const status of ['unknown', 'stale', 'reorged']) {
    networks.observations[0].status = status; assert.equal(projectWalletState(extendedFixture({ networks })).networks[0].observations[0].amount, null);
  }
  networks.observations[0].status = 'fresh'; view = projectWalletState(extendedFixture({ networks }), { networksStale: true });
  assert.equal(view.networks[0].observations[0].amount, null); assert.equal(view.networks[0].observations[0].status, 'stale');
  networks.observations[0].creditEligible = true; assert.equal(projectWalletState(extendedFixture({ networks })).networks[0].observations[0].amount, null);
});
test('DeFi outputs remain external and never change private portfolio balances', () => {
  const state = extendedFixture({ defi: { snapshot: { version: 1, profile: DEFI_PROFILE, operations: [defiRow({ phase: 'REDEEMED', redeemedUnderlying: '100' })] } } });
  const view = projectWalletState(state); assert.equal(view.defiOperations[0].redeemedUnderlying, '100');
  assert.equal(view.defiOperations[0].underlyingPrivateSpendable, false); assert.equal(view.defiOperations[0].underlyingLocation, 'EXTERNAL_OWNER_ADDRESS');
  assert.equal(view.assets[0].balances.available, fixture().portfolio.balances.available);
  assert.equal(projectWalletState(state, { defiStale: true }).defiOperations[0].phase, 'STALE');
  state.defi.snapshot.operations[0].underlyingPrivateSpendable = true;
  assert.equal(projectWalletState(state).defiOperations[0].redeemedUnderlying, null);
});
test('DeFi command bodies use original IDs and exact uint128/uint64 limits; no browser timestamps', () => {
  assert.deepEqual(buildActionBody('defiReopen', {}), {}); assert.throws(() => buildActionBody('defiReopen', { requestId }));
  for (const action of ['defiPrepare', 'defiRequote']) {
    assert.deepEqual(buildActionBody(action, { requestId, minimumOutput: '99', deadline: '1300' }), { requestId, minimumOutput: '99', deadline: '1300' });
    for (const patch of [{ minimumOutput: '0' }, { minimumOutput: String(1n << 128n) }, { minimumOutput: '01' }, { deadline: '0' }, { deadline: String(1n << 64n) }, { deadline: '1.1' }, { receiver: 'new' }])
      assert.throws(() => buildActionBody(action, { requestId, minimumOutput: '1', deadline: '1', ...patch }));
  }
  for (const action of Object.keys(DEFI_ACTIONS)) {
    const notes = actionReview(action, {}).notes.join(' '); assert.match(notes, /EXIT.*confirmada/); assert.match(notes, /HTTP 200/); assert.match(notes, /No se deriva del reloj/);
  }
});
test('all five DeFi actions require explicit review and use only their exact HTTP200 service contract', async () => {
  for (const action of Object.keys(DEFI_ACTIONS)) {
    const calls = []; const c = makeClient(async (path, options) => {
      calls.push({ path, options }); if (options.method === 'GET') return reply(extendedFixture());
      return reply(action === 'defiReopen' ? { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [requestId] } : defiRow());
    });
    await c.refresh(); const body = action === 'defiReopen' ? {} : ['defiPrepare', 'defiRequote'].includes(action) ? { requestId, minimumOutput: '99', deadline: '1300' } : { requestId };
    c.review(action, body); assert.equal(calls.length, 1); assert.equal(await c.confirm(), true); assert.equal(calls.length, 2);
    assert.equal(calls[1].path, DEFI_ACTIONS[action].route); assert.deepEqual(JSON.parse(calls[1].options.body), body);
    assert.equal(c.getState().outcome.state, 'SERVICE_RESULT'); assert.equal(c.getState().stale, true);
    assert.equal(calls[1].options.headers['x-wallet-action-token'], actionToken);
  }
});
test('uncertain DeFi submission retains its own original ID separately from native and never resends', async () => {
  let calls = 0; const c = makeClient(async (_, options) => { calls++; if (options.method === 'GET') return reply(extendedFixture()); throw Error('lost'); });
  await c.refresh(); c.review('deposit', { requestId: 'native_request_01', intentId }); await c.confirm(); await c.refresh();
  c.review('defiExecute', { requestId }); await c.confirm(); assert.equal(calls, 4);
  assert.deepEqual(c.getState().originalRequestIds, { native: 'native_request_01', defi: requestId, account: null });
  assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.can('defiReconcile'), false);
  await c.refresh(); c.review('defiReconcile', { requestId: c.getState().originalRequestIds.defi }); assert.equal(calls, 5);
});
test('execute and requote cannot be reviewed for missing, blocked or uncertain original vault rows', async () => {
  for (const row of [null, defiRow({ phase: 'REDEMPTION_UNRESOLVED' }), defiRow({ sendBlocked: true }), defiRow({ phase: 'REQUOTING_REDEMPTION' })]) {
    const c = makeClient(async () => reply(extendedFixture({ defi: { snapshot: { version: 1, profile: DEFI_PROFILE, operations: row ? [row] : [] } } })));
    await c.refresh(); assert.throws(() => c.review('defiExecute', { requestId }));
    assert.throws(() => c.review('defiRequote', { requestId, minimumOutput: '99', deadline: '1300' }));
    assert.doesNotThrow(() => c.review('defiReconcile', { requestId }));
  }
});
test('DeFi 202, wrong identity and contradictory result semantics are unknown, not successful outcomes', async () => {
  for (const response of [reply(defiRow(), 202), reply(defiRow({ requestId: 'wrong_request' })), reply(defiRow({ underlyingPrivateSpendable: true })), reply({ reopened: true, originalIdentitiesRetained: false })]) {
    const c = makeClient(async (_, options) => options.method === 'GET' ? reply(extendedFixture()) : response);
    await c.refresh(); c.review('defiPrepare', { requestId, minimumOutput: '99', deadline: '1300' }); assert.equal(await c.confirm(), false);
    assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.getState().originalRequestIds.defi, requestId);
  }
});
test('optional extension errors retain data with stale flags and disable only affected DeFi actions', async () => {
  let value = extendedFixture({ networks: { observation: 'TRUSTED_RPC_NATIVE_HOLDINGS_ONLY', privateSpendable: false, chains: [], observations: [] } });
  const c = makeClient(async () => reply(value)); await c.refresh();
  value = extendedFixture({ networks: null, defi: { snapshot: null }, errors: { portfolio: null, nativeClaims: null, networks: 'NETWORK_UNAVAILABLE', defi: 'DEFI_UNAVAILABLE' } });
  await c.refresh(); assert.equal(c.getState().networksStale, true); assert.equal(c.getState().defiStale, true);
  assert.equal(c.getState().data.defi.snapshot.operations[0].requestId, requestId); assert.equal(c.can('defiPrepare'), false); assert.equal(c.can('deposit'), true);
});


test('fresh native journal permits only original reconciliation when the private owner projection fails', async () => {
  let value = fixture(); let lost = false;
  const c = makeClient(async () => { if (lost) throw Error('transport'); return reply(value); });
  await c.refresh();
  value = fixture({ nativeClaims: { snapshot: fixture().nativeClaims.snapshot, owner: null }, errors: { portfolio: null, nativeClaims: 'WALLET_OWNER_VIEW_FAILED' } });
  await c.refresh(); assert.equal(c.getState().nativeStale, true); assert.equal(c.getState().nativeSnapshotFresh, true);
  assert.equal(c.can('reconcile'), true); assert.doesNotThrow(() => c.review('reconcile', { requestId }));
  for (const action of ['deposit', 'redeem', 'refund', 'resume']) assert.equal(c.can(action), false);
  lost = true; await c.refresh(); assert.equal(c.getState().nativeSnapshotFresh, false); assert.equal(c.can('reconcile'), false);
  lost = false;
  for (const nativeClaims of [null, { snapshot: null, owner: null }]) {
    value = fixture({ nativeClaims, errors: { portfolio: null, nativeClaims: 'WALLET_SNAPSHOT_FAILED' } });
    await c.refresh(); assert.equal(c.getState().data.nativeClaims.snapshot.phase, 'READY');
    assert.equal(c.getState().nativeSnapshotFresh, false); assert.equal(c.can('reconcile'), false);
  }
  for (const patch of [{ phase: 'UNAVAILABLE' }, { storageAvailable: false }, { busy: true }, { queued: 1 }, { storageAvailable: undefined }]) {
    value = fixture({ nativeClaims: { snapshot: { ...fixture().nativeClaims.snapshot, ...patch }, owner: null }, errors: { portfolio: null, nativeClaims: 'WALLET_OWNER_VIEW_FAILED' } });
    await c.refresh(); assert.equal(c.can('reconcile'), false);
  }
  value = fixture({ nativeClaims: { snapshot: fixture().nativeClaims.snapshot, owner: null }, errors: { portfolio: null, nativeClaims: 'WALLET_OWNER_VIEW_FAILED' },
    capabilities: { ...fixture().capabilities, nativeReconcile: false } });
  await c.refresh(); assert.equal(c.can('reconcile'), false);
});


test('fresh server capability permits only explicit DeFi reopen despite unavailable snapshot', async () => {
  let value = extendedFixture(); let lost = false; let posts = 0;
  const c = makeClient(async (_, options) => {
    if (lost) throw Error('transport');
    if (options.method === 'POST') { posts++; return reply({ reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [requestId] }); }
    return reply(value);
  });
  await c.refresh();
  value = extendedFixture({ defi: { snapshot: null }, errors: { portfolio: null, nativeClaims: null, networks: null, defi: 'DEFI_SNAPSHOT_UNAVAILABLE' } });
  await c.refresh(); assert.equal(c.getState().defiStale, true); assert.equal(c.can('defiReopen'), true);
  assert.equal(posts, 0);
  for (const action of ['defiPrepare', 'defiExecute', 'defiReconcile', 'defiRequote']) assert.equal(c.can(action), false);
  c.review('defiReopen', {}); assert.equal(posts, 0); assert.equal(await c.confirm(), true); assert.equal(posts, 1);
  assert.equal(c.can('defiReopen'), false); assert.equal(await c.confirm(), false); assert.equal(posts, 1);
  await c.refresh(); assert.equal(c.can('defiReopen'), true);
  lost = true; await c.refresh(); assert.equal(c.can('defiReopen'), false);
  lost = false; value = { ...value, connection: 'DISCONNECTED' }; await c.refresh(); assert.equal(c.can('defiReopen'), false);
  value = { ...value, connection: 'CONNECTED', capabilities: { ...value.capabilities, defiReopen: false } };
  await c.refresh(); assert.equal(c.can('defiReopen'), false);
});

test('native identity schema accepts only exact original BTC/SOL configuration and detached scalar copies', () => {
  for (const identity of [nativeIdentity(), solIdentity()]) {
    const source = { identity, owner: { deposits: [], tickets: [] } };
    const parsed = originalNativeIdentity(source); assert.deepEqual(parsed, identity);
    parsed.claimDomain = 'f'.repeat(64); assert.notEqual(parsed.claimDomain, source.identity.claimDomain);
    const details = nativeIdentityDetails(source.identity);
    assert.ok(details.some(([label, value]) => label === 'Dominio completo' && value === identity.claimDomain));
    assert.ok(details.some(([, value]) => value.includes('no acredita custodia actual')));
    assert.ok(details.some(([label, value]) => label === 'Identidad wrapper (no assetId)' && value === identity.wrapperAssetIdentity));
  }
  const invalid = [null, undefined, {}, { ...nativeIdentity(), extra: 'route' }];
  for (const key of Object.keys(nativeIdentity())) { const missing = nativeIdentity(); delete missing[key]; invalid.push(missing); }
  for (const [key, value] of [['version', 2], ['profile', WALLET_PROFILE], ['accountId', 'short'], ['accountId', 'native_account_01\n'],
    ['nativeFamily', 1], ['nativeFamily', '3'], ['claimSymbol', 'cSOL'], ['nativeSymbol', 'SOL'], ['decimals', 9], ['decimals', '8'],
    ['atomicUnit', 'lamport'], ['observation', 'CURRENT_QUORUM'], ['nativeAsset', nativeIdentity().wrapperAssetIdentity]]) invalid.push(nativeIdentity({ [key]: value }));
  for (const key of ['claimDomain', 'nativeGenesis', 'nativeAsset', 'wrapperAssetIdentity']) for (const value of ['0'.repeat(64), 'A'.repeat(64), '0x' + '1'.repeat(64), '1'.repeat(64) + '\n'])
    invalid.push(nativeIdentity({ [key]: value }));
  for (const identity of invalid) assert.equal(originalNativeIdentity({ identity }), null);
});

test('BTC-first combined portfolio leaves all native reviews bound only to original SOL identity', async () => {
  const identity = solIdentity();
  const portfolio = { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
    assets: [asset({ asset: { assetId: 'a'.repeat(64), symbol: 'cBTC', decimals: 8 } }),
      asset({ asset: { assetId: 'b'.repeat(64), symbol: 'cSOL', decimals: 9 } })] };
  const value = fixture({ portfolio, nativeClaims: { ...fixture().nativeClaims, identity } });
  const calls = [];
  const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(value) : admission('redeem'); });
  await c.refresh(); assert.notEqual(identity.wrapperAssetIdentity, portfolio.assets[1].asset.assetId);
  const bodies = { deposit: { requestId, intentId }, refund: { requestId, intentId },
    redeem: { requestId, amount: '9007199254740993', maxFee: '1001' }, reconcile: { requestId }, resume: { requestId } };
  for (const action of Object.keys(ACTIONS)) {
    assert.equal(c.can(action), true);
    const review = c.review(action, bodies[action]); assert.deepEqual(review.nativeIdentity, identity);
    assert.match(nativeIdentityDetails(review.nativeIdentity).flat().join(' '), /cSOL \/ SOL.*lamport · 9/);
    assert.deepEqual(review.body, bodies[action]);
  }
  const review = c.review('redeem', bodies.redeem);
  assert.deepEqual(review.nativeAmounts, [['Importe del claim', '9007199254740993 lamport · 9007199.254740993 cSOL (exacto)'],
    ['Comisión máxima nativa', '1001 lamport · 0.000001001 SOL (exacto)']]);
  assert.equal(await c.confirm(), true); assert.equal(calls.length, 2);
  assert.equal(calls[1].path, '/api/wallet/native/redeem');
  assert.deepEqual(JSON.parse(calls[1].options.body), bodies.redeem);
  assert.deepEqual(calls[1].options.headers, { 'x-wallet-action-token': actionToken, 'Content-Type': 'application/json' });
});

test('missing or inconsistent identity blocks monetary paths while fresh original reconciliation and DeFi remain available', async () => {
  const invalid = [undefined, null, nativeIdentity({ nativeSymbol: 'SOL' }), solIdentity()];
  for (const identity of invalid) {
    const nativeClaims = { ...fixture().nativeClaims, identity };
    if (identity?.nativeFamily === '2') nativeClaims.owner = { ...nativeClaims.owner,
      deposits: [{ intentId, claimDomain: nativeIdentity().claimDomain, amount: '1' }] };
    let posts = 0;
    const c = makeClient(async (_, options) => { if (options.method === 'POST') { posts++; return admission('reconcile'); }
      return reply(extendedFixture({ nativeClaims })); });
    assert.equal(await c.refresh(), true); assert.equal(c.getState().stale, false);
    assert.equal(projectWalletState(c.getState().data).assets[0].balances.available, asset().balances.available);
    for (const action of ['deposit', 'redeem', 'refund', 'resume']) {
      assert.equal(c.can(action), false); assert.throws(() => c.review(action, {}));
    }
    assert.equal(c.can('defiPrepare'), true); assert.equal(c.can('defiReopen'), true);
    assert.equal(c.can('reconcile'), true); const review = c.review('reconcile', { requestId });
    assert.equal(review.nativeIdentity, null); assert.match(nativeIdentityDetails(review.nativeIdentity)[0][1], /No disponible/);
    assert.equal(posts, 0); assert.equal(await c.confirm(), true); assert.equal(posts, 1);
  }
});

test('all owner intent and ticket domains must match the original action identity', () => {
  const identity = solIdentity();
  for (const key of ['deposits', 'tickets']) for (const claimDomain of [undefined, nativeIdentity().claimDomain]) {
    assert.equal(originalNativeIdentity({ identity, owner: { [key]: [{ claimDomain }] } }), null);
  }
  const source = { identity, owner: { deposits: [{ intentId, claimDomain: identity.claimDomain, amount: '1234567891' }], tickets: [] } };
  assert.deepEqual(nativeAmountDetails('deposit', { intentId }, source), [['Importe del intent original', '1234567891 lamport · 1.234567891 SOL (exacto)']]);
  assert.deepEqual(nativeAmountDetails('refund', { intentId }, source), nativeAmountDetails('deposit', { intentId }, source));
  assert.deepEqual(nativeAmountDetails('deposit', { intentId: 'f'.repeat(64) }, source), [['Importe del intent original', 'No disponible; no equivale a cero']]);
});

test('review identity and exact amount display cannot be mutated through source, returned review or state copies', async () => {
  let source = fixture({ nativeClaims: { ...fixture().nativeClaims, identity: solIdentity() } }); const calls = [];
  const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(source) : admission('redeem'); });
  await c.refresh(); const body = { requestId, amount: '1000000001', maxFee: '2' };
  const reviewed = c.review('redeem', body); const saved = c.getState().review;
  reviewed.nativeIdentity.claimDomain = nativeIdentity().claimDomain; reviewed.nativeIdentity.nativeSymbol = 'BTC';
  reviewed.nativeAmounts[0][1] = '0 BTC'; reviewed.body.amount = '999'; body.amount = '666';
  source.nativeClaims.identity.decimals = 8; const outward = c.getState(); outward.data.nativeClaims.identity.atomicUnit = 'satoshi';
  outward.review.nativeIdentity.nativeAsset = 'f'.repeat(64);
  assert.deepEqual(c.getState().review, saved); assert.equal(await c.confirm(), true);
  assert.deepEqual(JSON.parse(calls[1].options.body), { requestId, amount: '1000000001', maxFee: '2' });
});

test('an identity change or disappearance invalidates review without inheriting previous usable configuration', async () => {
  let source = fixture(); let posts = 0;
  const c = makeClient(async (_, options) => { if (options.method === 'POST') posts++; return reply(source); });
  await c.refresh(); c.review('redeem', { requestId, amount: '1', maxFee: '1' });
  source = fixture({ nativeClaims: { ...fixture().nativeClaims, identity: null } });
  await c.refresh(); assert.equal(c.getState().review, null); assert.equal(c.can('redeem'), false); assert.equal(await c.confirm(), false);
  assert.equal(projectWalletState(c.getState().data).nativeIdentity, null); assert.equal(c.can('reconcile'), true);
  source = fixture({ nativeClaims: { ...fixture().nativeClaims, identity: solIdentity() } });
  await c.refresh(); assert.equal(c.getState().nativeIdentityMismatch, true);
  assert.equal(projectWalletState(c.getState().data, c.getState()).nativeIdentity, null);
  for (const action of ['deposit', 'redeem', 'refund', 'resume']) assert.equal(c.can(action), false);
  assert.equal(c.can('reconcile'), true); assert.equal(posts, 0);
  source = fixture(); await c.refresh(); assert.equal(c.can('redeem'), true);
  c.review('redeem', { requestId, amount: '1', maxFee: '1' }); await c.refresh();
  assert.equal(c.getState().review, null); assert.equal(await c.confirm(), false); assert.equal(posts, 0);
});

test('identity-independent reconciliation still requires all original freshness and capability fences', async () => {
  for (const patch of [{ connection: 'DISCONNECTED' }, { connection: 'UNAVAILABLE' },
    { capabilities: { ...fixture().capabilities, nativeReconcile: false } },
    ...[{ phase: 'UNAVAILABLE' }, { storageAvailable: false }, { busy: true }, { queued: 1 }].map(snapshot => ({
      nativeClaims: { identity: null, owner: null, snapshot: { ...fixture().nativeClaims.snapshot, ...snapshot } } }))]) {
    const value = fixture({ nativeClaims: { ...fixture().nativeClaims, identity: null }, ...patch });
    const c = makeClient(async () => reply(value)); await c.refresh(); assert.equal(c.can('reconcile'), false);
  }
  const c = makeClient(async () => reply(fixture({ nativeClaims: { ...fixture().nativeClaims, identity: null } })), { actionToken: '' });
  await c.refresh(); assert.equal(c.can('reconcile'), false);
});

test('native forms and review render the same full identity and exact amount details using safe text nodes', async () => {
  const app = await readFile(clientSourceURLs['app.mjs'], 'utf8');
  assert.match(app, /binding\.dataset\.nativeBinding = 'true'/);
  assert.match(app, /nativeIdentityDetails\(identity\)/);
  assert.match(app, /nativeAmountDetails\(action, body, state\.data\.nativeClaims\)/);
  assert.match(app, /nativeIdentityDetails\(state\.review\.nativeIdentity\)/);
  assert.match(app, /state\.review\.nativeAmounts/);
  assert.doesNotMatch(app, /innerHTML|toFixed|parseFloat/);
});

const accountSnapshot = (overrides = {}) => ({ version: 1, profile: 'LOCAL_FLAT_ACCOUNT_API_V1', phase: 'READY',
  available: true, busy: false, queued: 0, observation: 'CURRENT', revision: 1, storageAvailable: true, errorCode: null,
  requests: [], admissions: [], capabilities: { coordinatorRestart: true, keeperRestart: false, nodeRestart: false, fullWalletAcceptance: false }, ...overrides });
const accountFixture = (overrides = {}) => extendedFixture({ account: { snapshot: accountSnapshot() },
  capabilities: { ...extendedFixture().capabilities, ...Object.fromEntries(Object.values(ACCOUNT_ACTIONS).map(action => [action.capability, true])) },
  errors: { ...extendedFixture().errors, account: null }, ...overrides });
const accountBody = (overrides = {}) => ({ requestId, kind: 'TOP_UP', ownerOperationRef: 'e'.repeat(64), assetId: asset().asset.assetId, ...overrides });
const accountRow = (overrides = {}) => ({ requestId, kind: 'TOP_UP', state: 'PREPARED', errorCode: null, ...overrides });
const accountOwnerRow = (overrides = {}) => ({ requestId, kind: 'TOP_UP', state: 'UNRESOLVED', disposition: null, ...overrides });
const accountAdmission = (action, overrides = {}, status = 200) => reply({ version: 1, profile: 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1',
  acceptance: 'VOLATILE_UI_QUEUE_ONLY', durableAdmissionEstablished: false, settlementEstablished: false,
  admission: { version: 1, admitted: true, sequence: 1, action, requestId }, ...overrides }, status);

test('account fixed bodies accept original references without witnesses or caller-selected graph terms', () => {
  for (const kind of ['TOP_UP', 'EXIT', 'GRAPH']) assert.deepEqual(buildActionBody('accountPrepare', accountBody({ kind })), accountBody({ kind }));
  for (const kind of ['UNKNOWN', 'top_up']) assert.throws(() => buildActionBody('accountPrepare', accountBody({ kind })));
  for (const key of ['ownerOperationRef', 'assetId']) for (const value of ['A'.repeat(64), '0x' + 'a'.repeat(64), 'a'.repeat(64) + '\n', null])
    assert.throws(() => buildActionBody('accountPrepare', accountBody({ [key]: value })));
  for (const key of ['witness', 'rootKey', 'destination', 'amount', 'rpc']) assert.throws(() => buildActionBody('accountPrepare', { ...accountBody(), [key]: 'caller supplied' }));
  for (const action of ['accountExecute', 'accountReconcile', 'accountRecover']) {
    assert.deepEqual(buildActionBody(action, { requestId }), { requestId });
    assert.throws(() => buildActionBody(action, { requestId, kind: 'TOP_UP' }));
  }
  for (const action of ['accountRestart', 'accountGraph', 'accountClose']) assert.throws(() => buildActionBody(action, { requestId }));
});

test('account preparation review binds exact selected asset even with identical symbols and reversed portfolio order', async () => {
  const first = asset({ asset: { assetId: 'a'.repeat(64), symbol: 'SAME', decimals: 8 } });
  const second = asset({ asset: { assetId: 'b'.repeat(64), symbol: 'SAME', decimals: 9 } });
  for (const assets of [[first, second], [second, first]]) {
    const value = accountFixture({ portfolio: { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true, assets } });
    const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(value) : accountAdmission('prepare'); });
    await c.refresh(); const body = accountBody({ kind: 'EXIT', assetId: second.asset.assetId });
    const review = c.review('accountPrepare', body); assert.deepEqual(review.accountContext.asset, second.asset); assert.equal(review.accountContext.kind, 'EXIT');
    assert.ok(accountReviewDetails(review.accountContext).some(([label, value]) => label === 'Identidad completa del activo' && value === second.asset.assetId));
    assert.match(review.notes.join(' '), /cola local volátil.*puede no ser duradera/);
    assert.match(review.notes.join(' '), /no crea el ownerOperationRef, claves, testigos ni pruebas/);
    body.assetId = first.asset.assetId; review.accountContext.asset.decimals = 1; review.body.ownerOperationRef = 'f'.repeat(64);
    assert.equal(await c.confirm(), true); assert.equal(calls.length, 2);
    assert.equal(calls[1].path, '/api/wallet/account/prepare');
    assert.deepEqual(JSON.parse(calls[1].options.body), accountBody({ kind: 'EXIT', assetId: second.asset.assetId }));
    assert.deepEqual(calls[1].options.headers, { 'x-wallet-action-token': actionToken, 'Content-Type': 'application/json' });
    assert.equal(c.getState().outcome.state, 'VOLATILE_QUEUE_ACCEPTANCE'); assert.equal(c.getState().stale, true);
  }
});

test('account prepare requires fresh unambiguous original portfolio assets and a new request ID', async () => {
  for (const portfolio of [null, asset({ status: 'STALE' }), asset({ status: 'UNAVAILABLE', balances: null, observed: null }),
    { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: false, assets: [asset()] },
    { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true, assets: [asset(), asset()] }]) {
    const c = makeClient(async () => reply(accountFixture({ portfolio }))); await c.refresh();
    assert.equal(c.can('accountPrepare'), false); assert.deepEqual(accountAssetChoices(c.getState()), []);
  }
  const c = makeClient(async () => reply(accountFixture({ account: { snapshot: accountSnapshot({ requests: [accountRow()] }) } })));
  await c.refresh(); assert.throws(() => c.review('accountPrepare', accountBody()));
  assert.throws(() => c.review('accountPrepare', accountBody({ requestId: 'new_original_01', assetId: 'f'.repeat(64) })));
});

test('account execute reviews only uniquely mapped PREPARED original TOP_UP/EXIT and rejects GRAPH or unknown IDs', async () => {
  for (const kind of ['TOP_UP', 'EXIT']) {
    const value = accountFixture({ account: { snapshot: accountSnapshot({ requests: [accountRow({ kind })] }) },
      portfolio: asset({ requests: [accountOwnerRow({ kind })] }) });
    const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(value) : accountAdmission('execute'); });
    await c.refresh(); const review = c.review('accountExecute', { requestId }); assert.equal(review.accountContext.kind, kind);
    assert.deepEqual(review.accountContext.asset, value.portfolio.asset); assert.equal(review.accountContext.journalState, 'PREPARED');
    assert.equal(await c.confirm(), true); assert.equal(calls[1].path, '/api/wallet/account/execute');
    assert.deepEqual(JSON.parse(calls[1].options.body), { requestId });
  }
  for (const row of [null, accountRow({ kind: 'GRAPH' }), ...['PREPARING', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'].map(state => accountRow({ state }))]) {
    const c = makeClient(async () => reply(accountFixture({ account: { snapshot: accountSnapshot({ requests: row ? [row] : [] }) }, portfolio: asset({ requests: [accountOwnerRow()] }) })));
    await c.refresh(); assert.throws(() => c.review('accountExecute', { requestId }));
  }
});

test('account execute rejects absent, stale, duplicate or kind-conflicting owner asset mappings', async () => {
  for (const portfolio of [null, asset(), asset({ requests: [accountOwnerRow({ kind: 'EXIT' })] }),
    asset({ status: 'STALE', requests: [accountOwnerRow()] }), asset({ requests: [accountOwnerRow(), accountOwnerRow()] }),
    { profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
      assets: [asset({ requests: [accountOwnerRow()] }), asset({ asset: { assetId: 'f'.repeat(64), symbol: 'CLBTC', decimals: 8 }, requests: [accountOwnerRow()] })] }]) {
    const c = makeClient(async () => reply(accountFixture({ portfolio, account: { snapshot: accountSnapshot({ requests: [accountRow()] }) } })));
    await c.refresh(); assert.throws(() => c.review('accountExecute', { requestId }));
  }
});

test('account reconciliation uses only eligible original journal rows and leaves unavailable asset explicitly unknown', async () => {
  for (const state of ['SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']) {
    const value = accountFixture({ portfolio: null, errors: { ...accountFixture().errors, portfolio: 'OWNER_UNAVAILABLE' },
      account: { snapshot: accountSnapshot({ requests: [accountRow({ state, kind: 'EXIT' })] }) } });
    const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(value) : accountAdmission('reconcile'); });
    await c.refresh(); assert.equal(c.can('accountReconcile'), true); const review = c.review('accountReconcile', { requestId });
    assert.deepEqual(review.accountContext, { kind: 'EXIT', journalState: state, asset: null });
    assert.match(accountReviewDetails(review.accountContext).flat().join(' '), /No disponible; conciliación solo por ID original/);
    assert.equal(await c.confirm(), true); assert.equal(calls[1].path, '/api/wallet/account/reconcile'); assert.deepEqual(JSON.parse(calls[1].options.body), { requestId });
  }
  for (const row of [null, accountRow(), accountRow({ state: 'PREPARING' }), accountRow({ kind: 'GRAPH', state: 'UNKNOWN' })]) {
    const c = makeClient(async () => reply(accountFixture({ account: { snapshot: accountSnapshot({ requests: row ? [row] : [] }) } })));
    await c.refresh(); assert.throws(() => c.review('accountReconcile', { requestId }));
  }
});

test('account HTTP200 volatile acceptance never becomes durable or settlement and malformed acknowledgments remain unknown', async () => {
  const original = { version: 1, admitted: true, sequence: 1, action: 'prepare', requestId };
  for (const response of [accountAdmission('prepare', {}, 202), admission('prepare'), accountAdmission('prepare', { durableAdmissionEstablished: true }),
    accountAdmission('prepare', { settlementEstablished: true }), accountAdmission('prepare', { acceptance: 'DURABLE' }),
    accountAdmission('prepare', { admission: { ...original, requestId: 'different_request' } }), accountAdmission('prepare', { admission: { ...original, action: 'execute' } }),
    accountAdmission('prepare', { admission: { ...original, sequence: 0 } }), accountAdmission('prepare', { admission: { ...original, sequence: 1.5 } }),
    accountAdmission('prepare', { admission: { ...original, result: 'CONFIRMED' } }), accountAdmission('prepare', { confirmed: true })]) {
    let calls = 0; const c = makeClient(async (_, options) => { calls++; return options.method === 'GET' ? reply(accountFixture()) : response; });
    await c.refresh(); c.review('accountPrepare', accountBody()); assert.equal(await c.confirm(), false);
    assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.getState().originalRequestIds.account, requestId);
    assert.equal(c.can('accountPrepare'), false); assert.equal(calls, 2); assert.equal(await c.confirm(), false); assert.equal(calls, 2);
  }
});

test('account lost replies retain an independent original ID and never retry or borrow native/DeFi identity', async () => {
  let calls = 0; let value = accountFixture();
  const c = makeClient(async (_, options) => { calls++; if (options.method === 'GET') return reply(value); throw Error('lost'); });
  await c.refresh(); c.review('deposit', { requestId: 'native_request_01', intentId }); await c.confirm(); await c.refresh();
  c.review('defiExecute', { requestId }); await c.confirm(); await c.refresh();
  c.review('accountPrepare', accountBody({ requestId: 'account_request_01' })); await c.confirm();
  assert.deepEqual(c.getState().originalRequestIds, { native: 'native_request_01', defi: requestId, account: 'account_request_01' });
  assert.equal(calls, 6); assert.equal(c.getState().outcome.state, 'UNKNOWN');
  value = accountFixture({ account: { snapshot: accountSnapshot({ requests: [accountRow({ requestId: 'account_request_01', state: 'UNKNOWN' })] }) } });
  await c.refresh(); c.review('accountReconcile', { requestId: c.getState().originalRequestIds.account }); assert.equal(calls, 7);
});

test('both bound journals independently fence all account, native and DeFi actions', async () => {
  for (const lane of ['account', 'nativeClaims']) for (const patch of [{ busy: true }, { queued: 1 }, { phase: 'UNAVAILABLE' }, { storageAvailable: false }]) {
    const base = accountFixture(); const value = { ...base, [lane]: { ...base[lane], snapshot: { ...base[lane].snapshot, ...patch } } };
    const c = makeClient(async () => reply(value)); await c.refresh();
    for (const action of [...Object.keys(ACTIONS), ...Object.keys(DEFI_ACTIONS), ...Object.keys(ACCOUNT_ACTIONS)]) assert.equal(c.can(action), false, `${lane}/${JSON.stringify(patch)}/${action}`);
  }
  for (const lane of ['account', 'nativeClaims']) {
    const value = accountFixture(); value[lane].snapshot = null;
    const c = makeClient(async () => reply(value)); await c.refresh();
    for (const action of ['accountPrepare', 'accountReconcile', 'reconcile', 'defiReopen']) assert.equal(c.can(action), false);
  }
});

test('stale journal fallback cannot authorize cross-service recovery and cached owner data cannot relabel account reconciliation', async () => {
  let value = accountFixture({ account: { snapshot: accountSnapshot({ requests: [accountRow({ state: 'UNKNOWN' })] }) }, portfolio: asset({ requests: [accountOwnerRow()] }) });
  const c = makeClient(async () => reply(value)); await c.refresh(); assert.equal(c.can('accountReconcile'), true);
  value = { ...value, portfolio: null, errors: { ...value.errors, portfolio: 'OWNER_UNAVAILABLE' } };
  await c.refresh(); assert.equal(c.getState().portfolioStale, true);
  assert.equal(c.review('accountReconcile', { requestId }).accountContext.asset, null);
  value = { ...value, account: { snapshot: null }, errors: { ...value.errors, account: 'WALLET_ACCOUNT_UNAVAILABLE' } };
  await c.refresh(); assert.equal(c.getState().data.account.snapshot.phase, 'READY'); assert.equal(c.getState().accountSnapshotFresh, false);
  for (const action of ['accountReconcile', 'reconcile', 'defiReopen']) assert.equal(c.can(action), false);
});

test('account confirmation is invalidated by refresh or cancel and concurrent confirmation posts once', async () => {
  let finish; const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options });
    return options.method === 'GET' ? reply(accountFixture()) : new Promise(resolve => { finish = resolve; }); });
  await c.refresh(); c.review('accountPrepare', accountBody()); await c.refresh(); assert.equal(await c.confirm(), false);
  c.review('accountPrepare', accountBody()); c.cancelReview(); assert.equal(await c.confirm(), false);
  c.review('accountPrepare', accountBody()); const pending = c.confirm(); assert.equal(await c.confirm(), false);
  for (const action of ['accountPrepare', 'redeem', 'defiReopen']) assert.equal(c.can(action), false);
  assert.equal(await c.refresh(), false); assert.equal(calls.length, 3); finish(accountAdmission('prepare')); assert.equal(await pending, true);
  assert.equal(calls.length, 3); assert.equal(c.getState().outcome.state, 'VOLATILE_QUEUE_ACCEPTANCE');
});

test('account schema rejects duplicate journal IDs and malformed readiness without discarding genuine unavailable states', () => {
  for (const snapshot of [accountSnapshot({ queued: -1 }), accountSnapshot({ busy: 'false' }), accountSnapshot({ profile: 'OTHER' }),
    accountSnapshot({ requests: [accountRow(), accountRow()] }), accountSnapshot({ requests: [accountRow({ kind: 'OTHER' })] })])
    assert.throws(() => validateWalletState(accountFixture({ account: { snapshot } })));
  assert.doesNotThrow(() => validateWalletState(accountFixture({ account: { snapshot: accountSnapshot({ phase: 'UNAVAILABLE', available: false, storageAvailable: false, revision: null, observation: 'STALE' }) } })));
});

test('account UI labels queue-only results and keeps coordinator control private', async () => {
  const [html, app] = await Promise.all(['index.html', 'app.mjs'].map(name => readFile(clientSourceURLs[name], 'utf8')));
  assert.match(html, /Cola local volátil/); assert.match(html, /Puede no ser duradera/);
  assert.match(app, /state\.outcome\.state === 'VOLATILE_QUEUE_ACCEPTANCE'/);
  assert.match(app, /accountReviewDetails\(state\.review\.accountContext\)/);
  assert.match(app, /form\.addEventListener\('change', \(\) => client\.cancelReview\(\)\)/);
  assert.match(app, /solo estado de procesamiento de la cola local/);
  assert.doesNotMatch(app, /accountRestart|accountClose|accountGraph/);
  assert.match(html, /La acción DeFi no crea esa salida/);
});

test('manual PREPARING continuation retains original ID and kind while keeper alone checks hidden ref/asset equality', async () => {
  const row = accountRow({ state: 'PREPARING', kind: 'EXIT' });
  const source = accountFixture({ account: { snapshot: accountSnapshot({ requests: [row] }) } });
  const calls = []; const c = makeClient(async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? reply(source) : accountAdmission('prepare'); });
  await c.refresh(); const body = accountBody({ kind: 'EXIT' });
  assert.throws(() => c.review('accountPrepare', accountBody({ kind: 'TOP_UP' })));
  assert.throws(() => c.review('accountPrepare', accountBody({ kind: 'GRAPH' })));
  assert.throws(() => c.review('accountExecute', { requestId })); assert.throws(() => c.review('accountReconcile', { requestId }));
  const review = c.review('accountPrepare', body); assert.equal(review.accountContext.preparingContinuation, true);
  assert.equal(review.accountContext.journalState, 'PREPARING'); assert.deepEqual(review.body, body);
  assert.match(review.notes.join(' '), /no verifica igualdad con los campos ocultos.*debe rechazar cualquier diferencia, nunca reemplazarla/);
  assert.equal(calls.length, 1); assert.equal(await c.confirm(), true); assert.equal(calls.length, 2);
  assert.equal(calls[1].path, '/api/wallet/account/prepare'); assert.deepEqual(JSON.parse(calls[1].options.body), body);
  assert.equal(c.getState().originalRequestIds.account, requestId); assert.equal(c.getState().outcome.state, 'VOLATILE_QUEUE_ACCEPTANCE');
  assert.equal(await c.confirm(), false); assert.equal(calls.length, 2);
  const graph = makeClient(async () => reply(accountFixture({ account: { snapshot: accountSnapshot({ requests: [accountRow({ state: 'PREPARING', kind: 'GRAPH' })] }) } })));
  await graph.refresh(); assert.throws(() => graph.review('accountPrepare', accountBody()));
});

// Synthetic app-safe metadata. These rows establish no chain, receipt or finality truth.
const transferMetadata = (overrides = {}) => {
  const chain = overrides.chain ?? 'ethereum', [chainId, symbol] = { ethereum: ['1', 'ETH'], base: ['8453', 'ETH'], arbitrum: ['42161', 'ETH'], bnb: ['56', 'BNB'] }[chain];
  const genesisHash = overrides.genesisHash ?? '0x' + 'a'.repeat(64), networkId = `eip155:${chainId}/genesis:${genesisHash}`;
  return { schema: 'flat-evm-original-transfer-status/1', nativeId: 'b'.repeat(64), chain, family: 'evm', chainId, genesisHash, networkId,
    asset: { id: `${networkId}/native`, kind: 'native', symbol, decimals: 18, commitment: 'c'.repeat(64) },
    from: '0x' + '1'.repeat(40), to: '0x' + '2'.repeat(40), value: '9007199254740993001', nonce: '7', transactionType: '2',
    metadataOnly: true, currentFinalityVerified: false, creditEligible: false, privateSpendableAtomic: null,
    graphAdmissionEligible: false, deliveryVerified: false, recipientRetainedValueVerified: false,
    source: 'retained-observation-metadata', freshness: 'not-revalidated', status: 'observed', reason: null,
    observedAtMs: '1000', validUntilMs: '9999999999999', ...overrides };
};
const transferRow = (status = transferMetadata(), overrides = {}) => ({ ownerAddress: status.from, direction: 'outgoing',
  refreshStatus: 'REFRESHED', errorCode: null, status, ...overrides });
const transferSection = (rows = [transferRow()]) => ({ profile: 'FIXED_ORIGINAL_EVM_TRANSFERS_V1',
  observation: 'TRUSTED_RPC_RETAINED_TRANSFER_METADATA_ONLY', rows });
const transferFixture = (overrides = {}) => accountFixture({ transfers: transferSection(), errors: { ...accountFixture().errors, transfers: null }, ...overrides });

test('original EVM transfer metadata retains exact amount and full domain without becoming delivery or credit', () => {
  const data = validateWalletState(transferFixture()); const view = projectWalletState(data); const transfer = view.transfers[0];
  assert.equal(transfer.value, '9007199254740993001'); assert.equal(transfer.display, '9.007199254740993001');
  assert.equal(transfer.nativeId, data.transfers.rows[0].status.nativeId); assert.equal(transfer.genesisHash, data.transfers.rows[0].status.genesisHash);
  assert.equal(transfer.networkId, data.transfers.rows[0].status.networkId); assert.equal(transfer.from, data.transfers.rows[0].status.from);
  assert.equal(transfer.to, data.transfers.rows[0].status.to); assert.equal(transfer.ownerAddress, data.transfers.rows[0].ownerAddress);
  assert.equal(transfer.freshness, 'not-revalidated'); assert.equal(transfer.metadataOnly, true); assert.equal(transfer.historical, false);
  for (const key of ['currentFinalityVerified', 'creditEligible', 'graphAdmissionEligible', 'deliveryVerified', 'recipientRetainedValueVerified']) assert.equal(transfer[key], false);
  assert.equal(transfer.privateSpendableAtomic, null); assert.equal(transfer.validUntilMs, '9999999999999');
  assert.deepEqual(view.assets[0].balances, asset().balances); assert.equal('deliveredAmount' in transfer, false);
});

test('every retained transfer status preserves original amount with no current-finality promotion', () => {
  for (const status of ['unobserved', 'observed', 'pending', 'reverted', 'unknown', 'reorged', 'stale']) {
    const data = transferFixture({ transfers: transferSection([transferRow(transferMetadata({ status, reason: status === 'observed' ? null : 'EVM_TRANSFER_UNAVAILABLE',
      observedAtMs: status === 'unobserved' ? null : '1000', validUntilMs: status === 'unobserved' ? null : '9999999999999' }))]) });
    const transfer = projectWalletState(validateWalletState(data)).transfers[0];
    assert.equal(transfer.status, status); assert.equal(transfer.value, transferMetadata().value); assert.equal(transfer.display, '9.007199254740993001');
    assert.equal(transfer.freshness, 'not-revalidated'); assert.equal(transfer.currentFinalityVerified, false);
    assert.equal(transfer.deliveryVerified, false); assert.equal(transfer.creditEligible, false);
  }
});

test('transfer identities stay chain and genesis qualified even when native IDs collide', () => {
  const rows = ['ethereum', 'base', 'arbitrum', 'bnb'].map(chain => transferRow(transferMetadata({ chain })));
  rows.push(transferRow(transferMetadata({ genesisHash: '0x' + 'd'.repeat(64) })));
  const result = projectWalletState(validateWalletState(transferFixture({ transfers: transferSection(rows) }))).transfers;
  assert.equal(result.length, 5); assert.equal(new Set(result.map(row => row.nativeId)).size, 1);
  assert.equal(new Set(result.map(row => row.networkId)).size, 5); assert.equal(new Set(result.map(row => row.assetId)).size, 5);
  assert.equal(result[3].symbol, 'BNB'); assert.equal(result[3].chainId, '56');
  assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([rows[0], rows[0]]) })));
});

test('transfer validation rejects contradictory authority, unsafe payload fields and malformed original identities', () => {
  assert.doesNotThrow(() => validateWalletState(transferFixture({ transfers: transferSection([transferRow(transferMetadata({ reason: 'R'.repeat(121) }))]) })));
  assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([transferRow(transferMetadata({ reason: 'R'.repeat(122) }))]) })));
  for (const [key, value] of [['metadataOnly', false], ['currentFinalityVerified', true], ['creditEligible', true], ['privateSpendableAtomic', '0'],
    ['graphAdmissionEligible', true], ['deliveryVerified', true], ['recipientRetainedValueVerified', true], ['freshness', 'fresh'],
    ['source', 'verified-chain'], ['schema', 'flat-evm-original-transfer-observation/1'], ['nativeId', '0'.repeat(64)], ['nativeId', '0x' + 'b'.repeat(64)],
    ['chainId', '56'], ['genesisHash', 'a'.repeat(64)], ['networkId', 'eip155:1'], ['from', '0x' + 'A'.repeat(40)], ['value', '01'],
    ['value', 1], ['nonce', '-1'], ['transactionType', '3'], ['reason', 'raw error with values'], ['validUntilMs', '1e4'],
    ['nativeWire', 'private wire must never enter UI state'], ['receipt', { logs: ['private values'] }]]) {
    assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([transferRow(transferMetadata({ [key]: value }))]) })), key);
  }
  for (const patch of [{ decimals: 8 }, { symbol: 'BTC' }, { id: 'unqualified' }, { commitment: '0'.repeat(64) }, { raw: 'wire' }]) {
    const status = transferMetadata(); status.asset = { ...status.asset, ...patch };
    assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([transferRow(status)]) })));
  }
  for (const key of ['status', 'nativeWire', 'receipt']) {
    const row = transferRow(); if (key === 'status') delete row.status; else row[key] = 'forbidden';
    assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([row]) })));
  }
  assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection(Array.from({ length: 9 }, () => transferRow())) })));
});

test('transfer direction is tied to the privately associated owner address', () => {
  const status = transferMetadata();
  const incoming = transferRow(status, { ownerAddress: status.to, direction: 'incoming' });
  const selfStatus = transferMetadata({ to: status.from }); const self = transferRow(selfStatus, { direction: 'self' });
  assert.doesNotThrow(() => validateWalletState(transferFixture({ transfers: transferSection([incoming]) })));
  assert.doesNotThrow(() => validateWalletState(transferFixture({ transfers: transferSection([self]) })));
  for (const row of [transferRow(status, { direction: 'incoming' }), transferRow(status, { direction: 'self' }),
    transferRow(status, { ownerAddress: '0x' + '3'.repeat(40) })]) assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([row]) })));
});

test('account or native journal activity independently marks retained transfer metadata historical', () => {
  for (const lane of ['account', 'nativeClaims']) for (const patch of [{ busy: true }, { queued: 1 }, { phase: 'UNAVAILABLE' }, { storageAvailable: false }]) {
    const data = transferFixture(); Object.assign(data[lane].snapshot, patch);
    const row = projectWalletState(data).transfers[0]; assert.equal(row.historical, true, `${lane}/${JSON.stringify(patch)}`);
    assert.equal(row.status, 'observed'); assert.equal(row.freshness, 'not-revalidated'); assert.equal(row.currentFinalityVerified, false);
  }
  for (const options of [{ stale: true }, { reading: true }, { sending: true }, { accountStale: true }, { nativeStale: true },
    { accountSnapshotFresh: false }, { nativeSnapshotFresh: false }, { transfersStale: true }]) {
    assert.equal(projectWalletState(transferFixture(), options).transfers[0].historical, true);
  }
  for (const lane of ['account', 'nativeClaims']) { const data = transferFixture(); data[lane].snapshot = null; assert.equal(projectWalletState(data).transfers[0].historical, true); }
});

test('new failed or unknown transfer rows replace old observed status while missing-section and transport failures retain history', async () => {
  let data = transferFixture(), lost = false; let calls = 0;
  const c = makeClient(async (path, options) => { calls++; assert.equal(path, '/api/wallet/state'); assert.equal(options.method, 'GET');
    if (lost) throw Error('transport lost'); return reply(data); });
  await c.refresh(); const original = structuredClone(c.getState().data.transfers.rows[0].status);
  const failed = transferRow(transferMetadata({ status: 'unknown', reason: 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE', validUntilMs: null }),
    { refreshStatus: 'FAILED', errorCode: 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE' });
  data = transferFixture({ transfers: transferSection([failed]), errors: { ...data.errors, transfers: 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE' } });
  await c.refresh(); let state = c.getState(), row = projectWalletState(state.data, state).transfers[0];
  assert.equal(row.status, 'unknown'); assert.equal(row.historical, true); assert.equal(row.validUntilMs, null);
  const retainedFailure = state.data.transfers;
  data = transferFixture({ transfers: null, errors: { ...data.errors, transfers: 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE' } });
  await c.refresh(); assert.deepEqual(c.getState().data.transfers, retainedFailure);
  data = transferFixture(); await c.refresh(); lost = true; assert.equal(await c.refresh(), false);
  state = c.getState(); row = projectWalletState(state.data, state).transfers[0];
  assert.deepEqual(state.data.transfers.rows[0].status, original); assert.equal(row.historical, true); assert.equal(row.freshness, 'not-revalidated');
  assert.equal(calls, 5); assert.equal(row.deliveryVerified, false);
});

test('blocked transfer rows are historical and cannot retain a future validity or observed success status', () => {
  const code = 'WALLET_OPERATION_IN_PROGRESS';
  const row = transferRow(transferMetadata({ status: 'stale', reason: code, validUntilMs: null }), { refreshStatus: 'BLOCKED', errorCode: code });
  const data = validateWalletState(transferFixture({ transfers: transferSection([row]), errors: { ...transferFixture().errors, transfers: code } }));
  const view = projectWalletState(data).transfers[0]; assert.equal(view.historical, true); assert.equal(view.status, 'stale');
  for (const status of [transferMetadata({ reason: code }), transferMetadata({ status: 'stale', reason: code })]) {
    assert.throws(() => validateWalletState(transferFixture({ transfers: transferSection([transferRow(status, { refreshStatus: 'BLOCKED', errorCode: code })]) })));
  }
});

test('absent and empty transfer sections add no rows or action capability, and empty failure never revives prior success', async () => {
  assert.deepEqual(projectWalletState(validateWalletState(accountFixture())).transfers, []);
  assert.deepEqual(projectWalletState(validateWalletState(transferFixture({ transfers: null }))).transfers, []);
  let data = transferFixture(); const c = makeClient(async () => reply(data)); await c.refresh();
  const capabilities = structuredClone(c.getState().data.capabilities);
  data = transferFixture({ transfers: transferSection([]), errors: { ...data.errors, transfers: 'WALLET_TRANSFER_OBSERVATION_UNAVAILABLE' } });
  await c.refresh(); assert.deepEqual(projectWalletState(c.getState().data, c.getState()).transfers, []);
  assert.deepEqual(c.getState().data.capabilities, capabilities);
  for (const action of ['transfer', 'transferSend', 'transferObserve', 'transferReconcile']) assert.throws(() => c.review(action, {}));
});

test('genuine observer status projection validates through host-only synthetic transport without exposing its wire or receipt', async () => {
  const [{ createEvmNativeTransferObserver }, { originalFixture }] = await Promise.all([
    import('../../../../packages/backend/src/chains/evm/observations/evm-native-transfer-observer.mjs'),
    import('../../../../packages/backend/tests/fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs')]);
  const fixture = originalFixture('base'); const observer = createEvmNativeTransferObserver(fixture.config);
  const first = transferRow(observer.status()); assert.equal(first.status.status, 'unobserved');
  assert.doesNotThrow(() => validateWalletState(transferFixture({ transfers: transferSection([first]) })));
  await observer.observe({ nativeId: fixture.original.expected.nativeId });
  const source = observer.status(); const data = validateWalletState(transferFixture({ transfers: transferSection([transferRow(source)]) }));
  assert.equal(data.transfers.rows[0].status.status, 'observed'); assert.equal(projectWalletState(data).transfers[0].freshness, 'not-revalidated');
  for (const secretField of ['nativeWire', 'receipt', 'logs', 'signature', 'endpoint', 'transport']) assert.equal(JSON.stringify(data.transfers).includes(secretField), false);
  assert.ok(fixture.calls.length > 0); assert.equal(source.deliveryVerified, false);
});

test('transfer UI renders retained statuses with safe full-identity text and no selector, action, polling or finality promotion', async () => {
  const [html, app] = await Promise.all(['index.html', 'app.mjs'].map(name => readFile(clientSourceURLs[name], 'utf8')));
  const transferSectionHtml = html.slice(html.indexOf('<section id="transfers"'), html.indexOf('<section id="custody"'));
  assert.match(transferSectionHtml, /Metadatos retenidos/); assert.match(transferSectionHtml, /No acreditan entrega/);
  assert.doesNotMatch(transferSectionHtml, /<input|<select|<form|<button/);
  const renderer = app.slice(app.indexOf('function renderTransfers('), app.indexOf('function renderExtensions('));
  assert.match(renderer, /Histórico · sin revalidar/); assert.match(renderer, /Metadatos RPC retenidos · sin revalidar/);
  assert.match(renderer, /IMPORTE DE LA TRANSACCIÓN ORIGINAL/); assert.match(renderer, /transfer\.networkId/);
  assert.match(renderer, /transfer\.nativeId/); assert.match(renderer, /transfer\.from/); assert.match(renderer, /transfer\.to/);
  assert.doesNotMatch(renderer, /innerHTML|fetch\(|client\.confirm|client\.review|setInterval|currentFinalityVerified: true/);
});

/** HOST parsed-data transport only. No native validator, deposit, swap,
 * principal mint, proof, custody check or signing is simulated as acceptance. */
function splUsdcWallet() {
  const observed = { blockNumber: '42', blockHash: 'e'.repeat(64), timestamp: '1000', observedAt: 1000 };
  const btc = asset({ asset: { assetId: 'a'.repeat(64), symbol: 'CBTC', decimals: 8 },
    balances: { available: '80000', reserved: '0', recovery: '0', locked: '0' },
    backing: { held: '80000', liabilities: '80000', surplus: '0', deficit: '0' } });
  const usdc = asset({ asset: { assetId: 'b'.repeat(64), symbol: 'CUSDC', decimals: 6 },
    balances: { available: '9007199254740993', reserved: '0', recovery: '0', locked: '0' },
    backing: { held: '9007199254740993', liabilities: '9007199254740993', surplus: '0', deficit: '0' } });
  const custody = (row, nativeSymbol) => ({ kind: 'CUSTODIAL_NATIVE_CLAIM', assetId: row.asset.assetId, nativeSymbol,
    nativeGenesis: '6'.repeat(64), availablePrivateClaims: row.balances.available, custodyObservation: 'CURRENT_QUORUM',
    nativeSelfCustody: false, underlyingSpendable: false, redemption: 'EXPLICIT_BURN_TICKET_AND_ORIGINAL_NATIVE_DELIVERY',
    independentOperators: false, assurance: 'LOCAL_THREE_OF_FOUR_OBSERVATIONS_WITH_COMMON_HOST_AND_NATIVE_CUSTODIAN_TRUST' });
  const component = (row, position) => ({ version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
    observed: structuredClone(observed), assets: [row], nativeClaims: [position], capabilities: { coordinatorRestart: true,
      keeperRestart: false, crossAssetAtomicConversion: false, privateDeFiComposability: false, fullWalletAcceptance: false } });
  const splPosition = { ...custody(usdc, 'USDC'), nativeAssetKind: 'SOLANA_SPL_USDC', decimals: 6, atomicUnit: 'micro-USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' };
  const generations = [component(btc, custody(btc, 'BTC')), component(usdc, splPosition)].map((portfolio, index) => ({
    generationId: String(index + 1).repeat(64), routes: [{ assetId: portfolio.assets[0].asset.assetId,
      pool: String(index + 3).repeat(40), domainCommitment: String(index + 4).repeat(64) }], portfolio, errorCode: null }));
  const portfolio = { version: 2, profile: GENERATION_PORTFOLIO_PROFILE, status: 'LIVE', coherent: true, observed,
    generations, capabilities: { coordinatorRestart: true, keeperRestart: false, nodeRestart: false,
      privateBalancesAggregated: false, implicitNoteMigration: false, fullWalletAcceptance: false } };
  const identity = { ...solIdentity(), claimSymbol: 'cUSDC', nativeSymbol: 'USDC', decimals: 6, atomicUnit: 'micro-USDC',
    nativeAssetKind: splPosition.nativeAssetKind, mint: splPosition.mint };
  return fixture({ portfolio, nativeClaims: { ...fixture().nativeClaims, identity } });
}

test('SPL USDC owner wallet preserves exact distinct principal, SOL fees and original UNKNOWN reconciliation', async () => {
  const value = splUsdcWallet(), before = structuredClone(value);
  assert.equal(ORIGINAL_SPL_USDC_UNITS_V1.mint, value.nativeClaims.identity.mint);
  validateFlatOwnerReadPayload(value.portfolio); validateWalletState(value);
  const view = projectWalletState(value);
  assert.deepEqual(view.assets.map(row => [row.symbol, row.decimals, row.balances.available]),
    [['CBTC', 8, '80000'], ['CUSDC', 6, '9007199254740993']]);
  const spl = view.nativeClaims.find(row => row.nativeSymbol === 'USDC');
  assert.equal(spl.amount, '9007199254740993'); assert.equal(spl.display, '9007199254.740993');
  assert.equal(spl.mint, value.nativeClaims.identity.mint); assert.equal(spl.custody, 'CURRENT_QUORUM');
  assert.equal(spl.underlyingSpendable, false); assert.equal(spl.nativeSelfCustody, false);
  assert.equal(Object.hasOwn(view, 'totalBalance'), false);
  const body = { requestId: 'original_usdc_redemption_01', amount: '9007199254740993', maxFee: '5000' };
  const details = nativeAmountDetails('redeem', body, value.nativeClaims);
  assert.deepEqual(details, [['Importe del claim', '9007199254740993 micro-USDC · 9007199254.740993 cUSDC (exacto)'],
    ['Comisión máxima nativa', '5000 lamport · 0.000005 SOL (exacto)']]);
  assert.match(nativeIdentityDetails(view.nativeIdentity).flat().join(' '), /Mint SPL vinculado.*EPjF.*Comisión separada.*SOL/);
  let current = value; const calls = [];
  const client = makeClient(async (path, options) => {
    calls.push({ path, method: options.method, body: options.body });
    if (options.method === 'GET') return reply(current);
    throw Error('HOST_LOST_ORIGINAL_REPLY');
  });
  assert.equal(await client.refresh(), true); assert.equal(client.can('redeem'), true);
  const review = client.review('redeem', body);
  assert.deepEqual(review.nativeIdentity, value.nativeClaims.identity); assert.deepEqual(review.nativeAmounts, details);
  assert.equal(await client.confirm(), false); assert.equal(client.getState().outcome.state, 'UNKNOWN');
  assert.equal(calls.filter(row => row.method === 'POST').length, 1);
  assert.equal(calls.at(-1).path, '/api/wallet/native/redeem'); assert.deepEqual(JSON.parse(calls.at(-1).body), body);
  assert.equal(client.can('redeem'), false); assert.equal(await client.confirm(), false);
  current = structuredClone(value);
  current.nativeClaims.snapshot.requests = [{ requestId: body.requestId, action: 'redeem', state: 'RECONCILIATION_REQUIRED', errorCode: null }];
  assert.equal(await client.refresh(), true); assert.equal(client.can('reconcile'), true);
  assert.deepEqual(client.review('reconcile', { requestId: body.requestId }).body, { requestId: body.requestId });
  assert.equal(calls.filter(row => row.method === 'POST').length, 1, 'NO_AUTOMATIC_REPLACEMENT_OR_REPLAY');
  assert.deepEqual(value, before, 'PARSED_PRESENTATION_NEVER_MUTATES_ORIGINAL_FUNDS_OR_STATE');
});

test('SPL USDC wallet rejects mint/unit/relabel and partial schemas while retaining unavailable custody as unknown', async () => {
  const original = splUsdcWallet(), row = value => value.portfolio.generations[1].portfolio.nativeClaims[0];
  for (const mutate of [
    value => { row(value).mint = 'So11111111111111111111111111111111111111112'; },
    value => { row(value).decimals = 9; }, value => { row(value).atomicUnit = 'lamport'; },
    value => { delete row(value).nativeAssetKind; },
    value => { value.portfolio.generations[1].portfolio.assets[0].asset.symbol = 'CSOL'; },
  ]) {
    const value = structuredClone(original); mutate(value);
    assert.throws(() => validateFlatOwnerReadPayload(value.portfolio), /RESPONSE_INVALID/);
    assert.throws(() => validateWalletState(value), /RESPONSE_INVALID/);
    const projection = projectWalletState(value).nativeClaims.find(item => item.assetId === 'b'.repeat(64));
    assert.equal(projection.amount, null); assert.equal(projection.custody, 'UNAVAILABLE');
  }
  for (const identity of [
    { ...original.nativeClaims.identity, mint: 'So11111111111111111111111111111111111111112' },
    { ...original.nativeClaims.identity, nativeFamily: '1' }, { ...original.nativeClaims.identity, decimals: 9 },
    { ...original.nativeClaims.identity, profile: 'ORIGINAL_WRAPPED_CLAIM_SESSION_IDENTITY_V1' },
    { ...original.nativeClaims.identity, atomicUnit: 'lamport' },
    (({ mint, ...value }) => value)(original.nativeClaims.identity),
    { ...original.nativeClaims.identity, callerEndpoint: 'https://caller.invalid' },
  ]) assert.equal(originalNativeIdentity({ identity }), null);
  const unavailable = structuredClone(original); row(unavailable).custodyObservation = 'UNAVAILABLE';
  row(unavailable).custodyDiagnostic = { code: 'CLAIM_PORTFOLIO_CUSTODY_UNAVAILABLE', causeCode: null, causeCodes: [] };
  validateWalletState(unavailable); const claim = projectWalletState(unavailable).nativeClaims.find(item => item.nativeSymbol === 'USDC');
  assert.equal(claim.amount, row(unavailable).availablePrivateClaims, 'NOTE_OWNERSHIP_REMAINS_SEPARATE_FROM_CUSTODY');
  assert.equal(claim.custody, 'UNAVAILABLE'); assert.equal(claim.underlyingSpendable, false);
  assert.equal(projectWalletState(unavailable, { stale: true }).nativeClaims[1].custody, 'STALE');
  const noIdentity = structuredClone(original); noIdentity.nativeClaims.identity = null;
  const client = makeClient(async () => reply(noIdentity)); await client.refresh();
  assert.equal(client.can('redeem'), false); assert.equal(client.can('reconcile'), true);
  assert.deepEqual(originalNativeIdentity(fixture().nativeClaims), nativeIdentity());
  assert.deepEqual(originalNativeIdentity({ identity: solIdentity() }), solIdentity());
});

// Explicit inert display frames: no custody, balance credit or economic method.
test('HOST wallet activity keeps native claims beside original economic state', () => {
  const sourceId = '1'.repeat(64), checkpointSHA256 = '2'.repeat(64), assetId = 'd'.repeat(64);
  const original = fixture({portfolio: asset({requests: [{requestId,kind:'GRAPH',state:'CONFIRMED',disposition:'FULFILLED'}],
    nativeClaims: [{kind:'CUSTODIAL_NATIVE_CLAIM',assetId,nativeSymbol:'BTC',availablePrivateClaims:'100',custodyObservation:'UNAVAILABLE'}]}),
    nativeClaims: {identity:nativeIdentity(),snapshot:{phase:'READY',storageAvailable:true,busy:false,queued:0,
      observation:'DURABLE_JOURNAL_ONLY',requests:[{requestId,action:'redeem',state:'UNKNOWN'}]},
      owner:{deposits:[],tickets:[],requests:[{requestId,action:'redeem',state:'UNKNOWN',errorCode:'NATIVE_CLAIM_OUTCOME_UNRESOLVED'}]}},
    economicState:{version:1,profile:'ORIGINAL_PRIVATE_WALLET_ECONOMIC_STATE_V1',lifetime:'3'.repeat(64),status:'LIVE',
      revision:1,storageAvailable:true,observedAt:Date.now(),rows:[{
        route:{sourceId,generationId:null,assetId,chainId:'31337',genesis:'4'.repeat(64),pool:'5'.repeat(40),
          scope:'6'.repeat(64),policy:'7'.repeat(64),assetIdentity:'8'.repeat(64),domainCommitment:null},
        asset:{kind:'ERC20',symbol:'CLBTC',decimals:8},component:'WRAPPED_CLAIM',state:'LIVE',reason:null,
        head:{blockNumber:'42',blockHash:'e'.repeat(64),timestamp:'1000'},balances:{available:'10',reserved:'0',recovery:'0',locked:'0'},
        backing:{held:'10',liabilities:'10',surplus:'0',deficit:'0'},requests:[{requestId,kind:'GRAPH',state:'CONFIRMED',disposition:'FULFILLED'}],
        position:null,checkpointSHA256}],checkpoints:[{sourceId,stateSHA256:checkpointSHA256,journalRevision:1}],
      capabilities:{readOnly:true,privateBalancesAggregated:false,underlyingCredit:false,deviceRootsIncluded:false,crossNetworkAtomicState:false}}});
  const projected = projectWalletState(validateWalletState(original));
  assert.equal(projected.requests.length,2); // native snapshot/owner same ID stays one; old portfolio copy is replaced.
  const note = projected.requests.find(row=>row.source==='CLBTC'), claim = projected.requests.find(row=>row.source==='Claim nativo');
  assert.equal(note.requestId,requestId);assert.equal(note.action,'GRAPH');assert.equal(note.disposition,'FULFILLED');
  assert.equal(note.native,false);assert.equal(typeof note.rowKey,'string'); // No native-claim reconcile button on this route.
  assert.equal(claim.requestId,requestId);assert.equal(claim.native,true);assert.equal(claim.state,'UNKNOWN');
  assert.equal(claim.errorCode,'NATIVE_CLAIM_OUTCOME_UNRESOLVED');assert.equal(claim.disposition,'');
  assert.equal(projected.nativeClaims.length,1);assert.equal(projected.nativeClaims[0].amount,'100');
  assert.equal(projected.nativeClaims[0].nativeSelfCustody,false);assert.equal(projected.nativeClaims[0].underlyingSpendable,false);
  assert.equal(projected.assets[0].balances.available,'10'); // The custodial reading is never added to a note balance.
  original.nativeClaims.owner.requests[0]={requestId,action:'redeem',state:'SUCCEEDED',result:{status:'DISCHARGED'}};
  const final = projectWalletState(validateWalletState(original));assert.equal(final.requests.length,2);
  assert.equal(final.requests.find(row=>row.native).disposition,'DISCHARGED');
  const stale = projectWalletState(validateWalletState(original),{nativeStale:true});
  assert.equal(stale.requests.find(row=>row.native).state,'STALE');assert.equal(stale.requests.find(row=>row.native).disposition,'');
  assert.equal(stale.requests.find(row=>!row.native).disposition,'FULFILLED');
});
