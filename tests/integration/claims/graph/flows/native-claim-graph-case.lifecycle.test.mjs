/** Host-only orchestration regression. All fixture/proof/reader dependencies
 * are module-mocked; no proof worker, validator, EVM, RPC, or file is created.
 * Run: node --experimental-test-module-mocks --test <this file> */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';

const copy = value => structuredClone(value);
const reference = '12'.repeat(32), domain = '34'.repeat(32);
let control;
const forbid = () => { throw new Error('HOST_LIFECYCLE_FORBIDDEN_PROOF_OR_NODE'); };
mock.module(new URL('./owned-flat-fixture.mjs', import.meta.url).href, { exports: {
  freshFixtureId: () => reference,
  writeFixturePrivate(path, value) {
    const name = basename(path); control.events.push('write:' + name);
    control.artifacts.set(name, copy(value));
  },
} });
mock.module(new URL('./prepare-native-claim-graph.mjs', import.meta.url).href, { exports: {
  async prepareNativeClaimGraph(fixture, directory, owner, options, onProof) {
    assert.equal(fixture, control.fixture); assert.equal(owner, control.owner);
    assert.equal(directory, '/host-only-private-audit'); assert.equal(typeof onProof, 'function');
    assert.deepEqual(options, { cutoff: '7300', payoutAmount: '1200000', nativeAmount: '1000000', poolIndex: 1 });
    control.events.push('graph:prepare'); return control.graph;
  },
} });
mock.module(new URL('../wallet-platform/modules/paeg/flat-system-state.mjs', import.meta.url).href, { exports: {
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    assert.equal(runtime, control.fixture.runtime); assert.equal(system, control.fixture.system); assert.equal(poolIndex, 1);
    return { async read() { control.events.push('reader:read'); return copy(control.state); } };
  },
} });
mock.module(new URL('../../../omnichain-product/src/paeg/proof-process.mjs', import.meta.url).href,
  { exports: { createProofProcess: forbid } });
mock.module(new URL('../../../omnichain-product/src/private-wallet-note-encoding.mjs', import.meta.url).href,
  { exports: { walletInputPublicWords: forbid, decodeWalletPoolInputs: forbid } });
mock.module(new URL('../wallet-platform/modules/paeg/transaction-codec.mjs', import.meta.url).href,
  { exports: { encodeFlatTransaction: forbid } });
mock.module(new URL('../wallet-platform/modules/native-claims/framing.mjs', import.meta.url).href,
  { exports: { claimDomainCommitment: () => domain } });

const { runNativeClaimGraphCase } = await import('./native-claim-graph-case.mjs');

function fixture(options = {}) {
  const c = { options, events: [], artifacts: new Map(), available: true, executeCount: 0, registered: null,
    graph: { prepared: { synthetic: true }, providers: [{ synthetic: true }], recipients: [] },
    state: { ledger: { publicState: { backedAmount: '3000000', actualAssetBalance: '3000000', liveReservations: 0 } },
      state: { spentTagCount: '4' } },
    snapshot: { reference, stage: 'PREPARED', outcome: null, executionStarted: false,
      admittedReceipts: 0, nativeExposure: [], errorCode: null },
    custody: { accounts: [{ role: 'escrow', total: '3000000' }], feeAudit: { actualFees: '5000' } },
    claims: { gateways: [{ claimDomain: domain, wrapperSupply: '3000000', pendingRedemptions: '0',
      pendingRefunds: '0', heldUnissued: '0' }] },
  };
  c.owner = {
    report: () => ({ available: c.available, childExited: !c.available }),
    async suspend() { c.events.push('owner:suspend'); c.available = false; },
    async restart() { c.events.push('owner:restart'); c.available = true; },
  };
  c.fixture = { runtime: { transactions: [], time: async () => 100n }, system: {},
    solana: { inventory: async () => copy(c.custody), transfers: [{ route: 'deposit' }],
      roles: { depositor: { endpoint: 'depositor' }, escrow: { endpoint: 'escrow' }, recipient: { endpoint: 'recipient' } } },
    graphSolana: { transfers: [] }, observer: { read: async () => copy(c.claims) }, claims: { configs: [{}, {}] } };
  c.account = { assetId: '56'.repeat(32), ownerActions: { async registerGraph(value) {
    c.events.push('account:register'); c.registered = copy(value);
  } }, async privateStatus() {
    c.events.push('account:privateStatus');
    if (options.accountStatusError) throw options.accountStatusError;
    return { operations: [{ ownerOperationRef: reference, errorCode: options.accountErrorCode ?? null,
      submission: c.fixture.runtime.transactions.length ? { dispatchLatched: true, ownerConfirmed: true } : null }] };
  } };
  c.execution = { snapshot(ref) { assert.equal(ref, reference); c.events.push('execution:snapshot');
    if (options.snapshotError) throw options.snapshotError; return copy(c.snapshot);
  } };
  const graphRequest = state => ({ version: 1, requests: [{ requestId: 'claim_funded_sol_graph', kind: 'GRAPH',
    state, errorCode: state === 'CONFIRMED' ? null : options.errorCode ?? 'FLAT_ACCOUNT_OWNER_OFFLINE' }] });
  c.request = async (action, body = {}) => {
    c.events.push('request:' + action);
    if (action === 'prepare') {
      assert.equal(c.available, true); assert.equal(body.ownerOperationRef, reference); assert.equal(body.kind, 'GRAPH');
      if (options.prepareError) throw options.prepareError;
      return graphRequest('PREPARED');
    }
    if (action === 'execute') {
      assert.deepEqual(body, { requestId: 'claim_funded_sol_graph' });
      if (++c.executeCount > 1) {
        if (options.duplicateEffect) c.fixture.runtime.transactions.push({ label: 'unwanted-duplicate' });
        return graphRequest('CONFIRMED');
      }
      // Model the authority's actual boundary: owner binds and acknowledges S
      // while online; authority alone suspends it before native execution.
      assert.equal(c.available, true, 'HOST_OWNER_MUST_BIND_RESERVATION_ONLINE');
      assert.equal(c.fixture.graphSolana.transfers.length, 0);
      c.events.push('authority:bind-reservation');
      if (options.executeError) throw options.executeError;
      if (options.unresolvedBeforeReservation) return graphRequest('UNKNOWN');
      c.fixture.runtime.transactions.push({ label: 'reservation' }); c.events.push('authority:reservation-submitted');
      await c.owner.suspend();
      assert.equal(c.available, false); assert.equal(c.fixture.graphSolana.transfers.length, 0);
      c.events.push('authority:owner-stopped-before-native');
      c.events.push('native:execute');
      c.fixture.graphSolana.transfers.push({ phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1,
        intent: { lamports: '1000000', sourcePublicKey: 'independent-solver' } });
      c.snapshot = { ...c.snapshot, stage: 'FULFILLED', outcome: 'FULFILLED', executionStarted: true,
        admittedReceipts: 1, nativeExposure: [{ slot: 0, family: '2', status: 'DELIVERED' }] };
      if (options.unresolvedAfterDelivery) {
        c.snapshot.outcome = null; c.snapshot.stage = 'ORIGINAL_OUTCOME_UNRESOLVED';
        c.snapshot.errorCode = options.errorCode; return graphRequest('UNKNOWN');
      }
      c.fixture.runtime.transactions.push({ label: 'settlement' }); return graphRequest('CONFIRMED');
    }
    if (action === 'restart') return graphRequest('CONFIRMED');
    assert.equal(action, 'reconcile'); assert.equal(c.available, true); return graphRequest('CONFIRMED');
  };
  c.run = () => runNativeClaimGraphCase({ fixture: c.fixture, owner: c.owner, account: c.account,
    execution: c.execution, request: c.request, privateDirectory: '/host-only-private-audit', onProof: forbid,
    stage: async name => { c.events.push('stage:' + name); },
    audit: async () => { c.events.push('audit'); if (options.auditError) throw options.auditError; },
    ownerView: async () => ({ assets: [{}, { balances: { available: '1800000' },
      requests: [{ requestId: 'claim_funded_sol_graph', disposition: 'FULFILLED' }] }] }),
  });
  control = c; return c;
}

test('authority reserves with owner online, then stops owner before native delivery; duplicates/restart add no effects', async () => {
  const c = fixture(), result = await c.run();
  const before = (first, second) => assert.ok(c.events.indexOf(first) < c.events.indexOf(second), first + ' before ' + second);
  before('request:execute', 'authority:bind-reservation');
  before('authority:bind-reservation', 'authority:reservation-submitted');
  before('authority:reservation-submitted', 'owner:suspend');
  before('owner:suspend', 'native:execute');
  before('write:claim-funded-graph-execution.json', 'request:restart');
  before('request:restart', 'owner:restart'); before('owner:restart', 'request:reconcile');
  assert.equal(c.events.filter(value => value === 'owner:suspend').length, 1);
  assert.equal(c.executeCount, 2); assert.equal(c.fixture.graphSolana.transfers.length, 1);
  assert.deepEqual(c.fixture.runtime.transactions.map(row => row.label), ['reservation', 'settlement']);
  assert.equal(result.report.ownerOfflineSettlement, true); assert.equal(result.report.duplicateAndRestartNoNewEffect, true);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.deepEqual(retained.request, { action: 'execute', body: { requestId: 'claim_funded_sol_graph' } });
  assert.equal(retained.result.requests[0].state, 'CONFIRMED'); assert.equal(retained.execution.outcome, 'FULFILLED');
  assert.equal(retained.accountStatus.operations[0].ownerOperationRef, reference);
  assert.deepEqual(retained.accountStatus.operations[0].submission, { dispatchLatched: true, ownerConfirmed: true });
  assert.equal(retained.accountStatusError, null);
  assert.deepEqual(retained.ownerLifecycle, { available: false, childExited: true });
  assert.equal(retained.error, null); assert.equal(retained.snapshotError, null);
});

test('prepare failure propagates without suspension, execute, retry or native effects', async () => {
  const error = new Error('PREPARE_FAILED'), c = fixture({ prepareError: error });
  await assert.rejects(c.run(), actual => actual === error);
  assert.equal(c.executeCount, 0); assert.equal(c.available, true); assert.equal(c.artifacts.size, 0);
  assert.equal(c.fixture.runtime.transactions.length, 0); assert.equal(c.fixture.graphSolana.transfers.length, 0);
});

test('thrown execute failure retains request and PREPARED snapshot and propagates the original error', async () => {
  const error = Object.assign(new Error('ORIGINAL_RESERVATION_BIND_FAILED'), { code: 'FLAT_ACCOUNT_OWNER_OFFLINE' });
  const c = fixture({ executeError: error, auditError: new Error('AUDIT_UNAVAILABLE') });
  await assert.rejects(c.run(), actual => actual === error);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.equal(retained.result, null); assert.equal(retained.execution.stage, 'PREPARED');
  assert.deepEqual(retained.error, { code: error.code, message: error.message });
  assert.equal(c.executeCount, 1); assert.equal(c.available, true);
  assert.equal(c.fixture.runtime.transactions.length, 0); assert.equal(c.fixture.graphSolana.transfers.length, 0);
  assert.ok(!c.events.includes('request:restart')); assert.ok(!c.artifacts.has('claim-funded-graph.json'));
});

test('UNKNOWN reservation result is retained before assertion and never mistaken for completed acceptance', async () => {
  const c = fixture({ unresolvedBeforeReservation: true, accountErrorCode: 'FLAT_OWNER_PROCESS_CLOSED' });
  await assert.rejects(c.run(), /FLAT_OWNER_PROCESS_CLOSED/);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.equal(retained.result.requests[0].state, 'UNKNOWN'); assert.equal(retained.execution.outcome, null);
  assert.equal(retained.ownerLifecycle.available, true);
  assert.equal(retained.accountStatus.operations[0].errorCode, 'FLAT_OWNER_PROCESS_CLOSED');
  assert.equal(retained.accountStatus.operations[0].submission, null);
  assert.equal(c.executeCount, 1); assert.equal(c.fixture.graphSolana.transfers.length, 0);
  assert.ok(!c.artifacts.has('claim-funded-graph.json')); assert.ok(!c.events.includes('owner:suspend'));
});

test('unresolved delivered native effect is retained without a second execution or automatic retry', async () => {
  const c = fixture({ unresolvedAfterDelivery: true, errorCode: 'FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED' });
  await assert.rejects(c.run(), /FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED/);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.equal(retained.result.requests[0].state, 'UNKNOWN'); assert.equal(retained.execution.outcome, null);
  assert.equal(retained.execution.nativeExposure[0].status, 'DELIVERED'); assert.equal(retained.ownerLifecycle.available, false);
  assert.equal(c.executeCount, 1); assert.equal(c.fixture.graphSolana.transfers.length, 1);
  assert.equal(c.fixture.runtime.transactions.length, 1); assert.ok(!c.events.includes('request:restart'));
});

test('an unavailable snapshot is recorded and cannot produce a completed graph report', async () => {
  const c = fixture({ snapshotError: Object.assign(new Error('KEEPER_CLOSED'), { code: 'FLAT_EXECUTION_CLOSED' }) });
  await assert.rejects(c.run(), /CLAIM_GRAPH_EXECUTION_SNAPSHOT_UNAVAILABLE/);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.equal(retained.execution, null); assert.equal(retained.snapshotError.code, 'FLAT_EXECUTION_CLOSED');
  assert.equal(retained.result.requests[0].state, 'CONFIRMED'); assert.equal(c.executeCount, 1);
  assert.ok(!c.artifacts.has('claim-funded-graph.json'));
});

test('a duplicate execute effect is detected rather than claimed idempotent', async () => {
  const c = fixture({ duplicateEffect: true });
  await assert.rejects(c.run());
  assert.equal(c.executeCount, 2); assert.equal(c.fixture.runtime.transactions.length, 3);
  assert.ok(!c.artifacts.has('claim-funded-graph.json'));
});

test('unavailable account diagnostics are recorded without masking a thrown execute failure', async () => {
  const error = new Error('ORIGINAL_REQUEST_FAILURE');
  const c = fixture({ executeError: error, accountStatusError: new Error('ACCOUNT_STATUS_UNAVAILABLE') });
  await assert.rejects(c.run(), actual => actual === error);
  const retained = c.artifacts.get('claim-funded-graph-execution.json');
  assert.equal(retained.accountStatus, null); assert.equal(retained.accountStatusError.message, 'ACCOUNT_STATUS_UNAVAILABLE');
  assert.equal(retained.error.message, error.message); assert.equal(c.executeCount, 1);
});
