import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GENERATION_PORTFOLIO_PROFILE, validateFlatOwnerReadPayload } from '../../../src/client/features/portfolio/owner-portfolio-contract.mjs';
import { GENERATION_DEFI_POSITIONS, GENERATION_DEFI_EXITS, validateGenerationDefiRead, projectGenerationDefiRead } from '../../../src/client/features/defi/generation-defi-contract.mjs';
import { ACTIONS, DEFI_ACTIONS, validateWalletState, projectWalletState, createWalletClient, buildActionBody } from '../../../src/client/state/view-model.mjs';
const hex = n => BigInt(n).toString(16).padStart(64, '0'), address = n => BigInt(n).toString(16).padStart(40, '0');
const copy = value => structuredClone(value);
const observed = { observedAt: 100, blockNumber: '4', blockHash: hex(77), timestamp: '1200' };
function asset(n) {
  return { version: 1, status: 'LIVE', asset: { assetId: hex(n), symbol: 'SAME', decimals: 6 }, observed: copy(observed),
    balances: { available: '9007199254740993', reserved: '7', recovery: '0', locked: '2' },
    backing: { held: '9007199254741002', liabilities: '9007199254741002', surplus: '0', deficit: '0' }, requests: [] };
}
function generation(n) {
  return { generationId: hex(100+n), routes: [n*2, n*2+1].map(i => ({ assetId: hex(i), pool: address(i), domainCommitment: hex(200+i) })),
    portfolio: { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
      observed: copy(observed), assets: [asset(n*2), asset(n*2+1)], capabilities: { coordinatorRestart: true, keeperRestart: false,
        crossAssetAtomicConversion: false, privateDeFiComposability: false, fullWalletAcceptance: false } }, errorCode: null };
}
function position(n) { return { generationId: hex(100+n), shareAssetId: hex(n*2), underlyingAssetId: hex(n*2+1),
  vault: address(999), underlyingToken: address(998), kind: 'ERC4626_SHARE', status: 'LIVE',
  availableShares: '9007199254740993', estimatedRedeemableUnderlying: '9007199254740992', observed: copy(observed),
  rounding: 'down', underlyingSpendable: false, privateConversionAccepted: false, errorCode: null }; }
function journal(n) { return { generationId: hex(100+n), shareAssetId: hex(n*2), status: 'AVAILABLE', requestIds: [], errorCode: null }; }
function operation(n = 1) { return { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', requestId: 'original_exit_'+n,
  shareAssetId: hex(n*2), underlyingToken: address(998), phase: 'READY_TO_REDEEM', shares: '100', minimumUnderlying: '90',
  redeemedUnderlying: null, deadline: '1700', observation: 'PERSISTED_LAST_OBSERVATION', underlyingLocation: 'EXTERNAL_OWNER_ADDRESS',
  underlyingPrivateSpendable: false, redemptionPublic: true, sendBlocked: false,
  assurance: 'TRUSTED_OWNED_LOCAL_RPC_AND_ORIGINAL_ACCOUNT_EXIT', keeperRestart: false }; }
function fixture() { return { version: 1, profile: 'ACTIVE_FLAT_WALLET_APP_V1', connection: 'CONNECTED',
  portfolio: { version: 2, profile: GENERATION_PORTFOLIO_PROFILE, status: 'LIVE', coherent: true, observed: copy(observed),
    generations: [generation(1), generation(2)], capabilities: { coordinatorRestart: true, keeperRestart: false, nodeRestart: false,
      privateBalancesAggregated: false, implicitNoteMigration: false, fullWalletAcceptance: false } },
  account: null, nativeClaims: null, networks: null, transfers: null,
  defi: { snapshot: { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', operations: [],
    generationProjection: { version: 1, profile: GENERATION_DEFI_EXITS, generations: [journal(1), journal(2)] } },
    positions: { version: 1, profile: GENERATION_DEFI_POSITIONS, positions: [position(1), position(2)],
      privateBalancesAggregated: false, underlyingPrivateSpendable: false } },
  capabilities: { graphExecution: false, ...Object.fromEntries(Object.values(ACTIONS).map(value => [value.capability, false])),
    ...Object.fromEntries(Object.values(DEFI_ACTIONS).map(value => [value.capability, true])) },
  errors: { portfolio: null, nativeClaims: null, networks: null, defi: null, account: null, transfers: null } }; }
function unavailable(value, index = 1) {
  const g = value.portfolio.generations[index]; g.portfolio = null; g.errorCode = 'FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE';
  value.portfolio.status = 'PARTIAL'; value.portfolio.coherent = false; value.portfolio.observed = null;
  return value;
}
const firstPosition = value => value.defi.positions.positions[0];
const firstJournal = value => value.defi.snapshot.generationProjection.generations[0];
const reply = value => ({ status: 200, ok: true, json: async () => copy(value) });

test('exact generation DeFi payload keeps nested catalogue unchanged and amounts separate beyond Number precision', () => {
  const input = fixture(), before = copy(input.portfolio), data = validateWalletState(input), view = projectWalletState(data);
  assert.deepEqual(data.portfolio, before); assert.deepEqual(validateFlatOwnerReadPayload(data.portfolio).data, before);
  assert.equal(view.positions.length, 2); assert.equal(view.positions[0].estimate, '9007199254740992');
  assert.equal(view.positions[0].shares, '9007199254740993'); assert.equal(view.positions[0].generationId, hex(101));
  assert.equal(view.positions[0].shareAssetId, hex(2)); assert.equal(view.positions[0].pool, address(2));
  assert.equal(view.positions[0].domainCommitment, hex(202)); assert.equal(view.positions[0].rounding, 'down');
  assert.equal(view.positions[0].underlyingSpendable, false); assert.equal(view.positions[0].privateConversionAccepted, false);
  assert.deepEqual(view.assets.map(row => row.balances), before.generations.flatMap(g => g.portfolio.assets.map(a => a.balances)));
  assert.equal(Object.hasOwn(view, 'total'), false); assert.equal(Object.hasOwn(view, 'estimatedBalance'), false);
  input.defi.positions.positions[0].availableShares = '1'; assert.equal(data.defi.positions.positions[0].availableShares, '9007199254740993');
});
test('independent read times at the identical original head do not hide a current estimate', () => {
  const data = fixture(); firstPosition(data).observed.observedAt++;
  assert.equal(projectWalletState(validateWalletState(data)).positions[0].estimate, '9007199254740992');
});
for (const field of ['blockNumber', 'blockHash', 'timestamp']) test(`head race in ${field} downgrades only the mismatched original position`, () => {
  const data = fixture(); firstPosition(data).observed[field] = field === 'blockHash' ? hex(999) : '999';
  const view = projectWalletState(validateWalletState(data));
  assert.equal(view.positions[0].status, 'STALE'); assert.equal(view.positions[0].estimate, null); assert.equal(view.positions[0].shares, null);
  assert.equal(view.positions[0].observed, null); assert.equal(view.positions[1].status, 'LIVE');
});
test('available share mismatch is unknown even when reserved or total-like amounts could explain it', () => {
  const data = fixture(); firstPosition(data).availableShares = '9007199254741000';
  assert.equal(projectWalletState(validateWalletState(data)).positions[0].estimate, null);
});
test('unavailable successor does not hide a healthy old same-generation estimate or infer successor zero', () => {
  const data = unavailable(fixture()), view = projectWalletState(validateWalletState(data));
  assert.equal(view.portfolioStatus, 'PARTIAL'); assert.equal(view.coherent, false);
  assert.equal(view.positions[0].status, 'LIVE'); assert.equal(view.positions[0].estimate, '9007199254740992');
  assert.equal(view.positions[1].estimate, null); assert.equal(view.assets[2].balances.available, null);
});
test('different healthy successor head does not invalidate the old generation join', () => {
  const data = fixture(), next = data.portfolio.generations[1].portfolio;
  for (const o of [next.observed, ...next.assets.map(a => a.observed)]) o.blockHash = hex(888);
  data.defi.positions.positions[1].observed.blockHash = hex(888);
  data.portfolio.status = 'STALE'; data.portfolio.coherent = false; data.portfolio.observed = null;
  assert.ok(projectWalletState(validateWalletState(data)).positions.every(row => row.status === 'LIVE'));
});
test('stale same-generation portfolio cannot supply a current estimate', () => {
  const data = fixture(), p = data.portfolio.generations[0].portfolio;
  p.assets[0].requests = [{ requestId: 'stale_original_exit', kind: 'EXIT', state: 'STALE', disposition: null }];
  p.assets[0].status = 'STALE'; p.status = 'STALE'; data.portfolio.status = 'STALE';
  assert.equal(projectWalletState(validateWalletState(data)).positions[0].estimate, null);
});
test('missing owner view or same-generation observation yields unknown without inventing balances', () => {
  for (const data of [unavailable(fixture(), 0), { ...fixture(), portfolio: null }]) {
    const view = projectWalletState(validateWalletState(data)); assert.equal(view.positions[0].estimate, null);
    assert.equal(view.positions[0].shares, null); assert.equal(view.positions[0].observed, null);
  }
});
test('global read, owner, service, pending read/send and disconnected fences suppress generation estimates', () => {
  for (const flags of [{ stale: true }, { portfolioStale: true }, { defiStale: true }, { reading: true }, { sending: true }])
    assert.ok(projectWalletState(validateWalletState(fixture()), flags).positions.every(p => p.estimate === null));
  for (const section of ['portfolio', 'defi']) { const data = fixture(); data.errors[section] = 'UNAVAILABLE';
    assert.ok(projectWalletState(validateWalletState(data)).positions.every(p => p.estimate === null)); }
  const data = fixture(); data.connection = 'UNAVAILABLE'; assert.ok(projectWalletState(validateWalletState(data)).positions.every(p => p.estimate === null));
});
test('missing registered underlying retains original identities with explicitly unknown estimate', () => {
  const data = fixture(), row = firstPosition(data); row.underlyingAssetId = null; row.status = 'UNAVAILABLE';
  row.availableShares = row.estimatedRedeemableUnderlying = row.observed = null; row.errorCode = 'PRIVATE_VAULT_GENERATION_UNDERLYING_NOT_REGISTERED';
  const view = projectWalletState(validateWalletState(data)); assert.equal(view.positions[0].status, 'UNAVAILABLE');
  assert.equal(view.positions[0].underlyingAssetId, null); assert.equal(view.positions[0].estimate, null);
});
test('null requestIds explicitly mean unknown original journal contents, never zero operations or liabilities', () => {
  const data = fixture(), journal = firstJournal(data); journal.status = 'UNAVAILABLE'; journal.requestIds = null;
  journal.errorCode = 'PRIVATE_VAULT_GENERATION_UNAVAILABLE';
  const view = projectWalletState(validateWalletState(data));
  assert.equal(view.defiJournalsUnknown, true); assert.equal(view.defiGenerations[0].journalContentsKnown, false);
  assert.equal(view.defiGenerations[0].requestCount, null); assert.equal(view.defiGenerations[0].requestIds, null);
  assert.equal(view.defiGenerations[1].requestCount, 0); assert.equal(view.positions[0].status, 'LIVE');
  assert.equal(Object.hasOwn(view.defiGenerations[0], 'liabilities'), false);
});
test('partial original journal view retains healthy original operation and matching service identity', () => {
  const data = fixture(); data.defi.snapshot.operations = [operation()]; firstJournal(data).requestIds = ['original_exit_1'];
  const next = data.defi.snapshot.generationProjection.generations[1]; next.status = 'UNAVAILABLE'; next.requestIds = null;
  next.errorCode = 'PRIVATE_VAULT_GENERATION_REOPEN_UNAVAILABLE';
  const view = projectWalletState(validateWalletState(data)); assert.equal(view.defiOperations.length, 1);
  assert.equal(view.defiOperations[0].generationId, hex(101)); assert.equal(view.defiOperations[0].shareAssetId, hex(2));
  assert.equal(view.defiOperations[0].requestId, 'original_exit_1'); assert.equal(view.defiJournalsUnknown, true);
});
test('stale journal views cannot present a retained empty original journal as currently known', () => {
  const view = projectWalletState(validateWalletState(fixture()), { defiStale: true });
  assert.ok(view.defiGenerations.every(row => row.status === 'STALE' && row.requestCount === null && row.requestIds === null));
  assert.equal(view.defiJournalsUnknown, true);
});
test('strict bounded position schema rejects noncanonical values, extra authority and malformed discriminants', () => {
  const changes = [p => p.version = 2, p => p.profile = 'OTHER', p => p.privateBalancesAggregated = true,
    p => p.underlyingPrivateSpendable = true, p => p.extra = false, p => p.positions = [],
    p => p.positions = Array.from({ length: 9 }, () => position(1)), p => p.positions.push(copy(p.positions[0])),
    p => p.positions[0].privateConversionAccepted = true, p => p.positions[0].underlyingSpendable = true,
    p => p.positions[0].rounding = 'up', p => p.positions[0].kind = 'ERC20', p => p.positions[0].generationId = hex(101)+'\n',
    p => p.positions[0].vault = '0x'+address(999), p => p.positions[0].underlyingToken = address(998).toUpperCase(),
    p => p.positions[0].underlyingAssetId = p.positions[0].shareAssetId, p => p.positions[0].estimatedRedeemableUnderlying = 1,
    p => p.positions[0].availableShares = '01', p => p.positions[0].availableShares = String(1n<<256n),
    p => p.positions[0].observed.observedAt = -0, p => p.positions[0].observed.observedAt = Number.MAX_SAFE_INTEGER+1,
    p => p.positions[0].observed.timestamp = '1\n', p => p.positions[0].observed.extra = true,
    p => p.positions[0].status = 'STALE', p => p.positions[0].errorCode = 'PRIVATE_VAULT_GENERATION_POSITION_UNAVAILABLE',
    p => p.positions[0].underlyingAssetId = null, p => p.positions[0].availableShares = '0'];
  for (const change of changes) { const data = fixture(); change(data.defi.positions);
    assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/); }
});
test('strict structural codec refuses sparse arrays, symbol keys and accessors without invoking them', () => {
  for (const change of [p => delete p.positions[0], p => p.positions.extra = 1,
    p => Object.defineProperty(p.positions[0], 'status', { value: 'LIVE', enumerable: false }),
    p => p.positions[0][Symbol('hidden')] = 1, p => Object.defineProperty(p.positions[0], 'status', { get() { throw Error('getter invoked'); } })]) {
    const data = fixture(); change(data.defi.positions);
    assert.throws(() => validateGenerationDefiRead(data.defi, data.portfolio), /GENERATION_DEFI_CONTRACT/);
  }
});
test('same symbol, vault or amounts cannot substitute another generation or underlying registry route', () => {
  for (const change of [row => row.generationId = hex(102), row => row.generationId = hex(999),
    row => row.shareAssetId = hex(4), row => row.underlyingAssetId = hex(5)]) {
    const data = fixture(); change(firstPosition(data)); assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/);
  }
});
test('bounded exit projection rejects fabricated zeros, duplicate IDs, mismatched operations and service substitutions', () => {
  const changes = [d => firstJournal(d).requestIds = null, d => { firstJournal(d).status = 'UNAVAILABLE'; firstJournal(d).errorCode = 'PRIVATE_VAULT_GENERATION_UNAVAILABLE'; },
    d => firstJournal(d).generationId = hex(102), d => firstJournal(d).shareAssetId = hex(4),
    d => firstJournal(d).requestIds = ['unrepresented_original'], d => d.defi.snapshot.operations = [operation()],
    d => d.defi.snapshot.generationProjection.generations = [],
    d => d.defi.snapshot.generationProjection.extra = true, d => firstJournal(d).errorCode = 'OTHER',
    d => d.defi.snapshot.generationProjection.generations.push(copy(firstJournal(d))),
    d => { d.defi.snapshot.operations = [operation()]; firstJournal(d).requestIds = ['original_exit_1', 'original_exit_1']; },
    d => { d.defi.snapshot.operations = [operation()]; firstJournal(d).requestIds = ['original_exit_1']; d.defi.snapshot.operations[0].underlyingToken = address(11); },
    d => { d.defi.snapshot.operations = [operation()]; firstJournal(d).requestIds = ['original_exit_1']; d.defi.snapshot.operations[0].underlyingPrivateSpendable = true; },
    d => d.defi.positions.positions.pop(), d => delete d.defi.snapshot.generationProjection, d => delete d.defi.positions,
    d => d.defi.snapshot = null];
  for (const change of changes) { const data = fixture(); change(data); assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/); }
});
function withOperation(overrides = {}) {
  const data = fixture(), row = { ...operation(), ...overrides };
  data.defi.snapshot.operations = [row]; firstJournal(data).requestIds = [row.requestId];
  return data;
}
const exitPhases = ['BINDING_REDEMPTION', 'READY_TO_REDEEM', 'REDEMPTION_UNRESOLVED',
  'REQUOTING_REDEMPTION', 'REDEEMED', 'REVERTED'];
for (const phase of exitPhases) {
  test(`${phase} preserves original producer proceeds semantics for current and historical rows`, () => {
    for (const observation of ['ORIGINAL_RECONCILIATION', 'PERSISTED_LAST_OBSERVATION']) {
      for (const sendBlocked of [false, true]) {
        const redeemedUnderlying = phase === 'REDEEMED' ? '90' : null;
        const data = withOperation({ phase, observation, sendBlocked, redeemedUnderlying });
        const accepted = validateWalletState(data), view = projectWalletState(accepted);
        assert.deepEqual(accepted.defi.snapshot.operations, data.defi.snapshot.operations);
        assert.equal(view.defiOperations[0].phase, phase);
        assert.equal(view.defiOperations[0].redeemedUnderlying, redeemedUnderlying);
        assert.equal(view.defiOperations[0].underlyingPrivateSpendable, false);
        assert.equal(view.defiOperations[0].underlyingLocation, 'EXTERNAL_OWNER_ADDRESS');
      }
    }
  });
  if (phase !== 'REDEEMED') test(`${phase} cannot assert any observed redemption proceeds`, () => {
    for (const observation of ['ORIGINAL_RECONCILIATION', 'PERSISTED_LAST_OBSERVATION']) {
      for (const redeemedUnderlying of ['0', '1', '90', '100', String((1n << 128n) - 1n)]) {
        const data = withOperation({ phase, observation, redeemedUnderlying });
        assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/, `${phase}/${observation}/${redeemedUnderlying}`);
      }
    }
  });
}
test('REDEEMED requires positive uint128 original proceeds at or above the committed minimum', () => {
  for (const observation of ['ORIGINAL_RECONCILIATION', 'PERSISTED_LAST_OBSERVATION']) {
    for (const redeemedUnderlying of [null, undefined, '0', '89', 90, '090', '+90', '90.0', '9e1', '90\n',
      String(1n << 128n), String((1n << 256n) - 1n)]) {
      const data = withOperation({ phase: 'REDEEMED', observation, redeemedUnderlying });
      assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/, `${observation}/${redeemedUnderlying}`);
    }
    for (const minimumUnderlying of ['1', '9007199254740993', String((1n << 128n) - 1n)]) {
      const data = withOperation({ phase: 'REDEEMED', observation, minimumUnderlying, redeemedUnderlying: minimumUnderlying });
      assert.equal(projectWalletState(validateWalletState(data)).defiOperations[0].redeemedUnderlying, minimumUnderlying);
      if (BigInt(minimumUnderlying) > 1n) {
        data.defi.snapshot.operations[0].redeemedUnderlying = String(BigInt(minimumUnderlying) - 1n);
        assert.throws(() => validateWalletState(data), /GENERATION_DEFI_CONTRACT/);
      }
    }
    const data = withOperation({ phase: 'REDEEMED', observation, redeemedUnderlying: '100' });
    assert.equal(projectWalletState(validateWalletState(data)).defiOperations[0].redeemedUnderlying, '100');
  }
});
test('contradictory proceeds refresh retains historical data only as stale until an explicit valid original read', async () => {
  let data = withOperation({ phase: 'REDEEMED', redeemedUnderlying: '100' });
  const calls = [], c = createWalletClient({ ownerToken: 'a'.repeat(64), actionToken: 'b'.repeat(64),
    fetchImpl: async (path, options) => { calls.push({ path, method: options.method }); return reply(data); } });
  assert.equal(await c.refresh(), true); const previous = c.getState().data;
  data.defi.snapshot.operations[0].phase = 'REDEMPTION_UNRESOLVED';
  assert.equal(await c.refresh(), false);
  let state = c.getState(), view = projectWalletState(state.data, state);
  assert.deepEqual(state.data, previous); assert.equal(state.stale, true);
  // Preserve the established historical display, explicitly STALE rather than
  // promoting the rejected unresolved row or replacing known history with zero.
  assert.equal(view.defiOperations[0].phase, 'STALE'); assert.equal(view.defiOperations[0].redeemedUnderlying, '100');
  assert.equal(view.defiGenerations[0].requestCount, null); assert.equal(view.defiJournalsUnknown, true);
  for (const action of Object.keys(DEFI_ACTIONS)) assert.equal(c.can(action), false);
  assert.throws(() => c.review('defiExecute', { requestId: 'original_exit_1' }));
  assert.equal(await c.confirm(), false); assert.equal(calls.length, 2);
  data.defi.snapshot.operations[0].redeemedUnderlying = null;
  assert.equal(await c.refresh(), true); state = c.getState(); view = projectWalletState(state.data, state);
  assert.equal(view.defiOperations[0].phase, 'REDEMPTION_UNRESOLVED');
  assert.equal(view.defiOperations[0].redeemedUnderlying, null);
  assert.throws(() => c.review('defiExecute', { requestId: 'original_exit_1' }));
  assert.equal(c.can('defiReconcile'), true);
  assert.equal(c.review('defiReconcile', { requestId: 'original_exit_1' }).body.requestId, 'original_exit_1');
  c.cancelReview(); assert.equal(await c.confirm(), false);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => ({ path: '/api/wallet/state', method: 'GET' })));
});
test('first contradictory redemption read establishes no known state or original journal contents', async () => {
  const data = withOperation({ phase: 'REDEEMED', redeemedUnderlying: null });
  const c = createWalletClient({ ownerToken: 'a'.repeat(64), actionToken: 'b'.repeat(64), fetchImpl: async () => reply(data) });
  assert.equal(await c.refresh(), false); assert.equal(c.getState().data, null); assert.equal(c.getState().stale, true);
  for (const action of Object.keys(DEFI_ACTIONS)) assert.equal(c.can(action), false);
  const view = projectGenerationDefiRead(data.defi, data.portfolio);
  assert.deepEqual(view.positions, []); assert.deepEqual(view.generations, []);
  assert.equal(view.generationMode, true); assert.equal(view.journalsUnknown, true);
});
test('direct malformed presentation is fail-closed, and frozen catalogue rejects nested position injection', () => {
  const data = fixture(); firstPosition(data).underlyingSpendable = true;
  assert.deepEqual(projectGenerationDefiRead(data.defi, data.portfolio).positions, []);
  const nested = fixture(); nested.portfolio.generations[0].portfolio.positions = [position(1)]; assert.throws(() => validateWalletState(nested));
});
test('failed refresh retains prior data only as stale and never revives a known empty journal or estimate', async () => {
  let data = fixture(); const c = createWalletClient({ ownerToken: 'a'.repeat(64), actionToken: 'b'.repeat(64), fetchImpl: async () => reply(data) });
  assert.equal(await c.refresh(), true); firstPosition(data).rounding = 'up'; assert.equal(await c.refresh(), false);
  const state = c.getState(), view = projectWalletState(state.data, state);
  assert.equal(state.stale, true); assert.ok(view.positions.every(row => row.estimate === null)); assert.equal(view.defiJournalsUnknown, true);
  assert.equal(c.can('defiExecute'), false);
});
test('partial API failures retain original journal rows explicitly stale while owner failure suppresses estimates', async () => {
  let data = fixture(); const c = createWalletClient({ ownerToken: 'a'.repeat(64), fetchImpl: async () => reply(data) });
  assert.equal(await c.refresh(), true); data = fixture(); data.defi = { snapshot: null, positions: null }; data.errors.defi = 'UNAVAILABLE';
  assert.equal(await c.refresh(), true); let state = c.getState(), view = projectWalletState(state.data, state);
  assert.equal(view.defiJournalsUnknown, true); assert.ok(view.defiGenerations.every(row => row.requestCount === null));
  data = fixture(); data.portfolio = null; data.errors.portfolio = 'UNAVAILABLE'; assert.equal(await c.refresh(), true);
  state = c.getState(); view = projectWalletState(state.data, state); assert.ok(view.positions.every(row => row.estimate === null));
});
test('legacy single-service DeFi keeps its exact prior projection and unchanged fixed action bodies', () => {
  const data = fixture(); data.defi = { snapshot: { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', operations: [operation()] } };
  const view = projectWalletState(validateWalletState(data)); assert.equal(view.defiGenerationMode, false);
  assert.deepEqual(view.defiGenerations, []); assert.equal(view.defiOperations[0].shares, '100'); assert.equal('generationId' in view.defiOperations[0], false);
  assert.equal(validateGenerationDefiRead(data.defi, data.portfolio), false);
  assert.deepEqual(buildActionBody('defiReopen', {}), {});
  for (const action of ['defiExecute', 'defiReconcile']) assert.deepEqual(buildActionBody(action, { requestId: 'original_exit_1' }), { requestId: 'original_exit_1' });
  assert.throws(() => buildActionBody('defiExecute', { requestId: 'original_exit_1', generationId: hex(101) }));
});
test('generation UI uses text nodes, explicit unknown journal language and no new action/selection control', async () => {
  const s = await readFile(new URL('./public/app.mjs', import.meta.url), 'utf8');
  assert.match(s, /Contenido del diario original desconocido\. No significa cero operaciones ni ausencia de obligaciones\./);
  assert.match(s, /Redondeo hacia abajo · no gastable · no se suma al saldo privado ni a otras generaciones/);
  assert.match(s, /Generación original: \$\{position.generationId\}/); assert.match(s, /Share asset: \$\{position.shareAssetId\}/);
  assert.doesNotMatch(s, /innerHTML\s*=|insertAdjacentHTML|generationSelect|serviceSelect/);
});

test('partial reopen stays UNKNOWN, sends one exact empty body and requires manual refresh before original recovery', async () => {
  const data = fixture(), response = { reopened: false, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [],
    generationProjection: copy(data.defi.snapshot.generationProjection) };
  const next = response.generationProjection.generations[1]; next.status = 'UNAVAILABLE'; next.requestIds = null;
  next.errorCode = 'PRIVATE_VAULT_GENERATION_REOPEN_UNAVAILABLE';
  const calls = []; const c = createWalletClient({ ownerToken: 'a'.repeat(64), actionToken: 'b'.repeat(64),
    fetchImpl: async (path, options) => { calls.push({ path, options }); return reply(options.method === 'GET' ? data : response); } });
  assert.equal(await c.refresh(), true); c.review('defiReopen', {}); assert.equal(await c.confirm(), false);
  assert.equal(calls.length, 2); assert.equal(calls[1].path, '/api/wallet/defi/reopen'); assert.equal(calls[1].options.body, '{}');
  assert.equal(c.getState().outcome.state, 'UNKNOWN'); assert.equal(c.can('defiReconcile'), false);
  assert.equal(await c.confirm(), false); assert.equal(calls.length, 2);
  assert.equal(await c.refresh(), true); assert.equal(c.can('defiReconcile'), true); assert.equal(calls.length, 3);
});
test('positions and journals bind the original generation/share tuple rather than assuming one service per generation', () => {
  const data = fixture(); data.portfolio.generations.pop();
  const row = data.defi.positions.positions[1]; row.generationId = hex(101); row.shareAssetId = hex(3); row.underlyingAssetId = hex(2);
  Object.assign(data.defi.snapshot.generationProjection.generations[1], { generationId: hex(101), shareAssetId: hex(3) });
  const view = projectWalletState(validateWalletState(data)); assert.equal(view.positions.length, 2);
  assert.equal(view.positions[1].status, 'LIVE'); assert.equal(view.positions[1].shareAssetId, hex(3));
});
