/** Actual loopback wallet-app HTTP and original FlatAccountSession over a
 * synthetic in-memory keeper/DeFi capability. No chain, funds, proof or GUI. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFlatAccountSession } from '../wallet-platform/modules/api/flat-account-session.mjs';
const defiBrands = new WeakMap();
mock.module('../wallet-platform/modules/defi-adapters/private-vault-exit.mjs', { exports: {
  assertOwnedPrivateVaultExit(runtime, service) { assert.equal(defiBrands.get(service), runtime, 'SYNTHETIC_ORIGINAL_DEFI_REQUIRED'); },
} });
const { startWalletApplication } = await import('../wallet-app/server.mjs');
const { createEvmVaultWalletAppDriver } = await import('./evm-vault-wallet-app-driver.mjs');
const request = (kind = 'TOP_UP', requestId = 'original_top_up') => ({ requestId, kind, ownerOperationRef: 'ab'.repeat(32), assetId: 'cd'.repeat(32) });
const error = code => Object.assign(new Error(code), { code });
function gate() { let release, enter; return { release: () => release(), entered: new Promise(r => { enter = r; }),
  wait: new Promise(r => { release = r; }), enter: () => enter() }; }
async function fixture(t, initialRows = []) {
  const control = { snapshotGate: null, failReconcile: false, rows: structuredClone(initialRows), calls: [], gates: new Map(), failExecute: false, closed: 0, order: [], ownerReads: 0 };
  const originals = new Map();
  const keeper = { async snapshot() {
    const pending = control.snapshotGate;
    if (pending && pending.action === control.calls.at(-1)?.action) {
      control.snapshotGate = null; pending.gate.enter(); await pending.gate.wait;
    }
    return { version: 1, revision: control.calls.length, storageAvailable: true,
    requests: control.rows.map(row => ({ ...row, errorCode: null })) }; },
    async restartCoordinator() { throw error('JOURNAL_UNEXPECTED_RESTART'); }, async recover() { throw error('JOURNAL_UNEXPECTED_RECOVER'); },
    async close() { control.closed++; control.order.push('original-session'); } };
  for (const action of ['prepare', 'execute', 'reconcile']) keeper[action] = async input => {
    const id = action === 'prepare' ? input.requestId : input;
    control.calls.push({ action, input: structuredClone(input) });
    let row = control.rows.find(row => row.requestId === id);
    if (action === 'prepare') {
      assert.ok(['TOP_UP', 'EXIT'].includes(input.kind));
      if (row) assert.deepEqual(originals.get(id), input);
      else { row = { requestId: id, kind: input.kind, state: 'PREPARING' }; control.rows.push(row); originals.set(id, structuredClone(input)); }
    } else { assert.ok(row); assert.ok(['TOP_UP', 'EXIT'].includes(row.kind)); if (action === 'execute') row.state = 'SUBMITTING'; }
    const pending = control.gates.get(action);
    if (pending) { control.gates.delete(action); pending.enter(); await pending.wait; }
    if (action === 'execute' && control.failExecute) { row.state = 'UNKNOWN'; throw error('JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'); }
    if (action === 'reconcile' && control.failReconcile) throw error('JOURNAL_ORIGINAL_RECONCILIATION_FAILED');
    row.state = action === 'prepare' ? 'PREPARED' : 'CONFIRMED';
  };
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { async ownerView() {
    control.ownerReads++; return { status: 'LIVE', assets: [{ asset: { symbol: 'BLTV', decimals: 6 }, balances: { available: '0' } }] }; } } });
  const runtime = {}, defiCalls = [], operations = new Map();
  const service = { async snapshot() { return { operations: [...operations.values()] }; },
    async prepare(input) { defiCalls.push(['prepare', structuredClone(input)]);
      const prior = operations.get(input.requestId); if (prior) return prior;
      const row = { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', requestId: input.requestId, phase: 'READY_TO_REDEEM', shares: '100', redeemedUnderlying: null,
        underlyingPrivateSpendable: false, underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', redemptionPublic: true };
      operations.set(input.requestId, row); return row; },
    async execute(id) { defiCalls.push(['execute', id]); const row = operations.get(id); assert.ok(row);
      row.phase = 'REDEEMED'; row.redeemedUnderlying = '100'; return row; },
    async reconcile(id) { defiCalls.push(['reconcile', id]); assert.ok(operations.has(id)); return operations.get(id); },
    async requote(input) { defiCalls.push(['requote', structuredClone(input)]); return operations.get(input.requestId); },
    async reopen() { defiCalls.push(['reopen']); return { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: [...operations.keys()] }; },
    async originalReceipt() { assert.fail('PRIVATE_AUDIT_MUST_NOT_BE_AN_APP_ACTION'); } };
  defiBrands.set(service, runtime);
  const app = await startWalletApplication({ accountSession: session, defiExit: { runtime, service } });
  t.after(async () => { await app.close(); await session.close(); });
  return { app, session, driver: createEvmVaultWalletAppDriver(app, { deadlineMs: Date.now() + 60000 }), control, defiCalls, operations };
}

test('actual app routes prepare/execute/reconcile original TOP_UP and EXIT, preserving volatile acknowledgement semantics', async t => {
  const f = await fixture(t);
  for (const [kind, id] of [['TOP_UP', 'original_top_up'], ['EXIT', 'original_share_exit']]) {
    const prepared = await f.driver.account('prepare', request(kind, id));
    assert.equal(prepared.httpAdmission, 'VOLATILE_UI_QUEUE_ONLY'); assert.equal(prepared.originalJournalState, 'PREPARED');
    const executed = await f.driver.account('execute', { requestId: id }); assert.equal(executed.originalJournalState, 'CONFIRMED');
    const reconciled = await f.driver.account('reconcile', { requestId: id }); assert.equal(reconciled.requestId, id);
    assert.equal(reconciled.snapshot.requests.find(row => row.requestId === id).state, 'CONFIRMED');
  }
  assert.deepEqual(f.control.calls.map(row => row.action), ['prepare', 'execute', 'reconcile', 'prepare', 'execute', 'reconcile']);
  const state = await f.driver.state(); assert.equal(state.capabilities.graphExecution, false); assert.equal(state.portfolio.status, 'LIVE');
});

test('HTTP 200 volatile queue acknowledgement cannot complete a delayed original prepare/execute', async t => {
  const f = await fixture(t), preparation = gate(); f.control.gates.set('prepare', preparation);
  const input = request(), pending = f.driver.account('prepare', input); let finished = false;
  void pending.then(() => { finished = true; }, () => { finished = true; });
  await preparation.entered; input.ownerOperationRef = 'ef'.repeat(32);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(finished, false);
  preparation.release(); const prepared = await pending; assert.equal(prepared.requestId, 'original_top_up');
  assert.equal(f.control.calls[0].input.ownerOperationRef, 'ab'.repeat(32));
  const execution = gate(); f.control.gates.set('execute', execution);
  const pendingExecute = f.driver.account('execute', { requestId: 'original_top_up' }); finished = false;
  void pendingExecute.then(() => { finished = true; }, () => { finished = true; });
  await execution.entered; await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(finished, false);
  execution.release(); assert.equal((await pendingExecute).originalJournalState, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('confirmed duplicate execute is actual app409/no keeper mutation, while reconciliation keeps original ID', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
  const count = f.control.calls.length;
  assert.equal((await f.driver.duplicateAccountExecute('original_top_up')).duplicateRejected, true);
  assert.equal(f.control.calls.length, count);
  await f.driver.account('reconcile', { requestId: 'original_top_up' });
  assert.deepEqual(f.control.calls.at(-1), { action: 'reconcile', input: 'original_top_up' });
});

test('unknown original outcome stops the driver without a replacement action or hidden retry', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); f.control.failExecute = true;
  await assert.rejects(f.driver.account('execute', { requestId: 'original_top_up' }), /ORIGINAL_OUTCOME_UNRESOLVED|ORIGINAL_RECONCILIATION_REQUIRED/);
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
  assert.equal(f.control.rows[0].state, 'UNKNOWN');
  f.control.failExecute = false; await f.driver.account('reconcile', { requestId: 'original_top_up' });
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('GRAPH cannot be prepared by driver or smuggled through an existing original app request ID', async t => {
  const f = await fixture(t, [{ requestId: 'original_graph_id', kind: 'GRAPH', state: 'PREPARED' }]);
  await assert.rejects(f.driver.account('prepare', request('GRAPH', 'original_graph_id')), /GRAPH_FORBIDDEN/);
  assert.equal((await f.driver.rejectGraphRequest('original_graph_id')).graphRejected, true);
  assert.equal(f.control.calls.length, 0); assert.equal((await f.driver.state()).capabilities.graphExecution, false);
  for (const action of ['recover', 'restartCoordinator', 'close', 'graph'])
    await assert.rejects(f.driver.account(action, { requestId: 'original_graph_id' }), /FIXED_ROUTE/);
});

test('fixed owner/action tokens remain separate and wrong access fails without fallback mutation', async t => {
  const f = await fixture(t);
  const wrongRead = createEvmVaultWalletAppDriver({ ...f.app, ownerAccess: { ...f.app.ownerAccess, token: 'ee'.repeat(32) } }, { deadlineMs: Date.now() + 60000 });
  await assert.rejects(wrongRead.state(), /OWNER_STATE/);
  const wrongAction = createEvmVaultWalletAppDriver({ ...f.app, actionAccess: { ...f.app.actionAccess, token: 'ff'.repeat(32) } }, { deadlineMs: Date.now() + 60000 });
  await assert.rejects(wrongAction.account('prepare', request()), /VOLATILE_ADMISSION/);
  assert.equal(f.control.calls.length, 0);
  assert.throws(() => createEvmVaultWalletAppDriver({ ...f.app, actionAccess: f.app.ownerAccess }, { deadlineMs: Date.now() + 60000 }), /SEPARATE_ACCESS/);
});

test('actual DeFi app routes preserve original IDs/external underlying and never expose audit receipts', async t => {
  const f = await fixture(t), input = { requestId: 'original_share_exit', minimumOutput: '100', deadline: '1900000500' };
  assert.equal((await f.driver.defi('prepare', input)).phase, 'READY_TO_REDEEM');
  const redeemed = await f.driver.defi('execute', { requestId: input.requestId });
  assert.equal(redeemed.phase, 'REDEEMED'); assert.equal(redeemed.underlyingPrivateSpendable, false);
  await f.driver.defi('reopen', {}); await f.driver.defi('reconcile', { requestId: input.requestId });
  await f.driver.defi('execute', { requestId: input.requestId });
  const state = await f.driver.state(); assert.equal(state.defi.snapshot.operations[0].phase, 'REDEEMED');
  assert.equal(state.defi.snapshot.operations[0].underlyingLocation, 'EXTERNAL_OWNER_ADDRESS');
  await assert.rejects(f.driver.defi('originalReceipt', { requestId: input.requestId }), /FIXED_ROUTE/);
  await assert.rejects(f.driver.defi('execute', { requestId: input.requestId, recipient: 'different' }), /EXACT_FIELDS/);
});

test('closing app listener retains original account and harness cleanup closes it before original services', async t => {
  const f = await fixture(t); const result = await f.app.close(); f.control.order.push('listener');
  assert.equal(result.originalSessionsRetained, true); assert.equal(f.control.closed, 0);
  assert.equal((await f.session.snapshot()).available, true); await f.session.close();
  assert.deepEqual(f.control.order, ['listener', 'original-session']);
  const source = readFileSync(new URL('./evm-vault-flow.mjs', import.meta.url), 'utf8');
  const cleanup = source.slice(source.indexOf('  async function cleanup()'), source.indexOf('  const stop ='));
  assert.ok(cleanup.indexOf('walletApp.close()') < cleanup.indexOf('accounts.map(account => account.abort())'));
  assert.ok(cleanup.indexOf('walletApp.close()') < cleanup.indexOf('http.close()'));
});

test('integrated harness routes genuine account and DeFi actions through app while GRAPH/private audit stay private', () => {
  const source = readFileSync(new URL('./evm-vault-flow.mjs', import.meta.url), 'utf8');
  for (const fragment of ["appAccount('prepare', { requestId: 'vault_top_up', kind: 'TOP_UP'",
    "appAccount('execute', { requestId: 'vault_top_up' })", "appAccount('reconcile', { requestId: 'vault_top_up' })",
    "appAccount('prepare', { requestId, kind: 'EXIT'", "appAccount('execute', { requestId })", "appAccount('reconcile', { requestId })",
    "appDefi('prepare', redemption)", "appDefi('execute', { requestId: redemption.requestId })", "appDefi('reopen', {})",
    "appDefi('reconcile', { requestId: redemption.requestId })", "request('prepare', { requestId: graphId, kind: 'GRAPH'",
    "request('execute', { requestId: graphId })", 'appDriver.rejectGraphRequest(graphId)', 'vaultExit.originalReceipt(redemption.requestId)',
    'browserVisualAcceptance: false', 'graphExecutionExposed: false']) assert.ok(source.includes(fragment), fragment);
});

test('real session final-refresh race: SUCCEEDED plus existing CONFIRMED stays pending while keeper snapshot drains', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
  const refresh = gate(); f.control.snapshotGate = { action: 'reconcile', gate: refresh };
  const pending = f.driver.account('reconcile', { requestId: 'original_top_up' }); let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });
  try {
    await refresh.entered;
    const mid = await f.session.snapshot();
    assert.equal(mid.admissions.at(-1).action, 'reconcile'); assert.equal(mid.admissions.at(-1).state, 'SUCCEEDED');
    assert.equal(mid.requests[0].state, 'CONFIRMED'); assert.equal(mid.busy, true); assert.equal(mid.observation, 'STALE');
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(settled, false);
  } finally { refresh.release(); }
  const result = await pending; assert.equal(result.snapshot.busy, false); assert.equal(result.snapshot.queued, 0);
  assert.equal(result.snapshot.observation, 'CURRENT'); assert.equal(result.originalJournalState, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'reconcile').length, 1);
});

test('prepare and execute also wait through successful publication before final durable refresh', async t => {
  const f = await fixture(t);
  for (const method of ['prepare', 'execute']) {
    const refresh = gate(); f.control.snapshotGate = { action: method, gate: refresh };
    const pending = f.driver.account(method, method === 'prepare' ? request() : { requestId: 'original_top_up' });
    let settled = false; void pending.then(() => { settled = true; }, () => { settled = true; });
    try { await refresh.entered; assert.equal((await f.session.snapshot()).admissions.at(-1).state, 'SUCCEEDED');
      await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false);
    } finally { refresh.release(); }
    const result = await pending; assert.equal(result.snapshot.observation, 'CURRENT'); assert.equal(result.snapshot.busy, false);
  }
  assert.deepEqual(f.control.calls.map(row => row.action), ['prepare', 'execute']);
});

test('explicit reconciliation waits on an original UNKNOWN row while its own admission is RUNNING', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); f.control.failExecute = true;
  await assert.rejects(f.driver.account('execute', { requestId: 'original_top_up' }), /UNRESOLVED|RECONCILIATION_REQUIRED/);
  await f.session.idle(); f.control.failExecute = false;
  const work = gate(); f.control.gates.set('reconcile', work);
  const pending = f.driver.account('reconcile', { requestId: 'original_top_up' }); let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });
  try { await work.entered; const mid = await f.session.snapshot();
    assert.equal(mid.requests[0].state, 'UNKNOWN'); assert.equal(mid.admissions.at(-1).state, 'RUNNING');
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false);
  } finally { work.release(); }
  assert.equal((await pending).originalJournalState, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('failed reconciliation cannot borrow an older CONFIRMED row as a successful result', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
  f.control.failReconcile = true;
  await assert.rejects(f.driver.account('reconcile', { requestId: 'original_top_up' }), /ORIGINAL_RECONCILIATION_FAILED/);
  assert.equal(f.control.rows[0].state, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'reconcile').length, 1);
});

async function patchStateResponses(t, change) {
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error');
    const response = await original(url, options);
    if (!String(url).endsWith('/api/wallet/state')) return response;
    const value = await response.json(); change(value);
    return new Response(JSON.stringify(value), { status: response.status, headers: { 'content-type': 'application/json' } });
  });
}

test('idle=false, queued, busy or stale frames remain read-only pending until a healthy original current frame', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
  const patches = [{ idle: false }, { queued: 1 }, { busy: true }, { observation: 'STALE' }]; let seen = 0;
  await patchStateResponses(t, value => {
    const snapshot = value.account.snapshot;
    if (snapshot.admissions.at(-1)?.action === 'reconcile' && snapshot.admissions.at(-1)?.state === 'SUCCEEDED' && seen < patches.length)
      Object.assign(snapshot, patches[seen++]);
  });
  const count = f.control.calls.length, result = await f.driver.account('reconcile', { requestId: 'original_top_up' });
  assert.equal(seen, 4); assert.equal(result.snapshot.observation, 'CURRENT'); assert.equal(result.snapshot.busy, false);
  assert.equal(f.control.calls.length, count + 1);
});

test('unavailable journal, original ID/sequence substitution and ambiguous rows fail closed without mutation retry', async t => {
  for (const [name, change] of [
    ['unavailable', s => { s.available = false; s.storageAvailable = false; }],
    ['request id', s => { s.admissions.at(-1).requestId = 'other_original_id'; }],
    ['action', s => { s.admissions.at(-1).action = 'execute'; }],
    ['sequence', s => { s.admissions.at(-1).sequence += 1; }],
    ['duplicate admission', s => { s.admissions.push(structuredClone(s.admissions.at(-1))); }],
    ['duplicate row', s => { s.requests.push(structuredClone(s.requests[0])); }],
    ['graph kind', s => { s.requests[0].kind = 'GRAPH'; }],
    ['fresh unresolved', s => { s.requests[0].state = 'UNKNOWN'; }],
    ['fresh conflicting state', s => { s.requests[0].state = 'PREPARED'; }],
  ]) await t.test(name, async st => {
    const f = await fixture(st); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
    await patchStateResponses(st, value => change(value.account.snapshot));
    await assert.rejects(f.driver.account('reconcile', { requestId: 'original_top_up' }));
    assert.equal(f.control.calls.filter(row => row.action === 'reconcile').length, 1);
  });
});

test('lost mutating reply preserves the original operation and never resubmits; explicit reconciliation can finish it', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request());
  const original = globalThis.fetch; let lost = false;
  const hook = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await original(url, options);
    if (!lost && String(url).endsWith('/api/wallet/account/execute')) {
      lost = true; await response.arrayBuffer(); throw error('SYNTHETIC_LOST_EXECUTE_REPLY');
    }
    return response;
  });
  await assert.rejects(f.driver.account('execute', { requestId: 'original_top_up' }), /LOST_EXECUTE_REPLY/);
  await f.session.idle(); hook.mock.restore();
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
  assert.equal((await f.driver.account('reconcile', { requestId: 'original_top_up' })).originalJournalState, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('bounded original supervisor budget stops pending reads, retains IDs and creates no replacement action', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); await f.driver.account('execute', { requestId: 'original_top_up' });
  const work = gate(); f.control.gates.set('reconcile', work);
  const driver = createEvmVaultWalletAppDriver(f.app, { deadlineMs: Date.now() + 150 });
  try { await assert.rejects(driver.account('reconcile', { requestId: 'original_top_up' }), /POLL_BUDGET_EXHAUSTED/); }
  finally { work.release(); await f.session.idle(); }
  assert.equal(f.control.calls.filter(row => row.action === 'reconcile').length, 1);
  const calls = f.control.calls.length;
  await assert.rejects(driver.account('execute', { requestId: 'original_top_up' }), /POLL_BUDGET_EXHAUSTED/);
  assert.equal(f.control.calls.length, calls);
  const source = readFileSync(new URL('./evm-vault-flow.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('Date.parse(lock.startedAt) + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds'));
});


test('reconciliation UNKNOWN plus SUCCEEDED is still pending during the real final refresh, not a fresh unresolved outcome', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request()); f.control.failExecute = true;
  await assert.rejects(f.driver.account('execute', { requestId: 'original_top_up' }), /UNRESOLVED|RECONCILIATION_REQUIRED/);
  await f.session.idle(); f.control.failExecute = false;
  const refresh = gate(); f.control.snapshotGate = { action: 'reconcile', gate: refresh };
  const pending = f.driver.account('reconcile', { requestId: 'original_top_up' }); let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });
  try {
    await refresh.entered; const mid = await f.session.snapshot();
    assert.equal(mid.admissions.at(-1).state, 'SUCCEEDED'); assert.equal(mid.requests[0].state, 'UNKNOWN');
    assert.equal(mid.observation, 'STALE'); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false);
  } finally { refresh.release(); }
  assert.equal((await pending).originalJournalState, 'CONFIRMED');
  assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('lost state reply stops without replaying the already accepted mutation', async t => {
  const f = await fixture(t); await f.driver.account('prepare', request());
  const original = globalThis.fetch; let lost = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await original(url, options);
    if (!lost && String(url).endsWith('/api/wallet/state')) {
      lost = true; await response.arrayBuffer(); throw error('SYNTHETIC_LOST_STATE_REPLY');
    }
    return response;
  });
  await assert.rejects(f.driver.account('execute', { requestId: 'original_top_up' }), /LOST_STATE_REPLY/);
  await f.session.idle(); assert.equal(f.control.calls.filter(row => row.action === 'execute').length, 1);
});

test('DeFi HTTP response must retain the original ID and external-only projection', async t => {
  const f = await fixture(t), input = { requestId: 'original_share_exit', minimumOutput: '100', deadline: '1900000500' };
  await f.driver.defi('prepare', input);
  const original = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const response = await original(url, options);
    if (!String(url).endsWith('/api/wallet/defi/reconcile')) return response;
    const value = await response.json(); value.requestId = 'substituted_share_exit';
    return new Response(JSON.stringify(value), { status: 200 });
  });
  await assert.rejects(f.driver.defi('reconcile', { requestId: input.requestId }), /DEFI_IDENTITY_CHANGED/);
  assert.equal(f.defiCalls.filter(row => row[0] === 'reconcile').length, 1);
});
