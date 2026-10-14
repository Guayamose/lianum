import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';
import {createGenericAccountCoordinator} from '../../../../engine/src/execution/accounts/generic-account-coordinator.mjs';
import {copy, sha} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';

const hex = n => n.toString(16).padStart(64, '0');
const asset = (n, kind = 'NATIVE') => ({assetId: hex(n), kind, symbol: kind === 'NATIVE' ? 'ETH' : 'TEST', decimals: 18, chainId: '31337', genesis: hex(9), pool: String(n).padStart(40, '0'), scope: hex(n + 20), policy: hex(30), token: kind === 'NATIVE' ? '0'.repeat(40) : 'a'.repeat(40), codeHash: hex(n + 40), assetIdentity: hex(n + 60), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
const registry = [asset(1), asset(2, 'ERC20')];
const config = {journalId: 'journal_test_01', accountId: 'account_test_01', lifetime: hex(90), registry};
const input = (overrides = {}) => ({requestId: 'request_0001', assetId: registry[0].assetId, kind: 'GRAPH', ownerOperationRef: hex(100), ...overrides});
const identity = {...Object.fromEntries(['journalId', 'accountId', 'lifetime'].map(k => [k, config[k]])), registrySHA256: sha(registry)};
const expectCode = (promise, code) => assert.rejects(promise, error => error.message === code && error.code === code && !('cause' in error));

// Deliberately mocked durability for state-machine fault injection. This is not
// cryptographic storage. A separate test below exercises actual Vault corruption.
class MemoryStore {
  record;
  failBeforeWrite = false;
  failAfterWrite = false;
  async create(data) { assert.equal(this.record, undefined); this.record = {revision: 0, data: copy(data)}; return copy(this.record); }
  async read() { return copy(this.record); }
  async update(revision, transform) {
    assert.equal(this.record.revision, revision);
    if (this.failBeforeWrite) throw Error('owner password must never escape');
    this.record = {revision: revision + 1, data: copy(transform(copy(this.record.data)))};
    if (this.failAfterWrite) throw Error('owner password must never escape');
    return copy(this.record);
  }
}

function harness({store = new MemoryStore()} = {}) {
  let clock = 1000;
  const stats = {executions: 0, reconciliations: 0, recoveries: 0, recoverySubmissions: 0, preparations: 0, observations: 0};
  const prepared = new Map(), outcomes = new Map(), recoverySubmissions = new Map();
  // The owner has already authorized this private operation. This map is the
  // mock owner-custody authority; merely presenting another valid hex ref fails.
  const owner = new Map([[hex(100), {assetId: registry[0].assetId, kind: 'GRAPH', bound: null}]]);
  const switches = {alive: true, loseExecuteReply: false, interruptGraph: false, beforeRecoveryDeadline: false, recoveryOutcomeUnavailable: false, loseRecoveryReply: false, observationUnavailable: false, ackFailure: false, ackRetainsFirst: false, mutateOutcome: x => x, mutateObservation: x => x, mutatePreparation: x => x};
  let checkpoint = null, pendingCheckpoint = null;
  const host = {
    async assertAuthority(expected) {
      assert.deepEqual(expected, identity);
      if (!switches.alive) throw Error('owner vault unavailable with credential secret');
      return {version: 1, available: true, identity};
    },
    async proposeCheckpoint(next) {
      pendingCheckpoint = copy(next);
      return {proposed: true, checkpointSHA256: sha(next)};
    },
    async retainCheckpoint(next) {
      if (checkpoint) assert.ok(next.revision >= checkpoint.revision && next.revision <= checkpoint.revision + 1);
      if (switches.ackFailure) {
        if (switches.ackRetainsFirst) checkpoint = copy(next);
        throw Error('lost keeper checkpoint reply');
      }
      checkpoint = copy(next); pendingCheckpoint = null;
      return {retained: true, checkpointSHA256: sha(next)};
    },
    async prepare(request) {
      stats.preparations++;
      assert.ok(store.record.data.requests.some(e => e.request.bindingSHA256 === request.bindingSHA256 && e.state === 'PREPARING'), 'persist before owner custody effects');
      const authorization = owner.get(request.ownerOperationRef);
      assert.ok(authorization, 'opaque reference is not authorization');
      assert.equal(authorization.assetId, request.assetId);
      assert.equal(authorization.kind, request.kind);
      if (authorization.bound) assert.equal(authorization.bound, request.bindingSHA256);
      authorization.bound = request.bindingSHA256;
      prepared.set(request.bindingSHA256, copy(request));
      return switches.mutatePreparation({version: 1, state: 'PREPARED', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256});
    },
    async execute(request) {
      assert.deepEqual(prepared.get(request.bindingSHA256), request);
      assert.ok(store.record.data.requests.some(e => e.request.bindingSHA256 === request.bindingSHA256 && e.state === 'SUBMITTING'));
      stats.executions++;
      assert.equal(outcomes.has(request.bindingSHA256), false, 'host execute must not repeat');
      if (switches.interruptGraph) throw Error('mock graph stopped after an original partial effect');
      const outcome = {version: 1, state: 'CONFIRMED', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256, outcomeId: hex(200), disposition: 'APPLIED', blockNumber: '20', blockHash: hex(201)};
      outcomes.set(request.bindingSHA256, outcome);
      if (switches.loseExecuteReply) throw Error('lost successful execution reply with owner secret');
      return switches.mutateOutcome(copy(outcome));
    },
    async reconcile(request) {
      stats.reconciliations++;
      assert.deepEqual(prepared.get(request.bindingSHA256), request);
      // Observing an unspent note is intentionally insufficient to create an
      // outcome or perform an execute. Only the original saved result is read.
      assert.ok(outcomes.has(request.bindingSHA256), 'original outcome unavailable');
      return switches.mutateOutcome(copy(outcomes.get(request.bindingSHA256)));
    },
    async recover(request) {
      stats.recoveries++;
      assert.deepEqual(prepared.get(request.bindingSHA256), request);
      assert.equal(request.kind, 'GRAPH');
      assert.ok(store.record.data.requests.some(e => e.request.bindingSHA256 === request.bindingSHA256 && e.state === 'RECOVERING'), 'recovery phase durable before host effects');
      if (outcomes.has(request.bindingSHA256)) return switches.mutateOutcome(copy(outcomes.get(request.bindingSHA256)));
      if (!recoverySubmissions.has(request.bindingSHA256)) {
        if (switches.beforeRecoveryDeadline) throw Error('original deadline not reached');
        recoverySubmissions.set(request.bindingSHA256, copy(request));
        stats.recoverySubmissions++;
      }
      assert.deepEqual(recoverySubmissions.get(request.bindingSHA256), request);
      if (switches.recoveryOutcomeUnavailable) throw Error('latched original refund outcome unknown');
      const outcome = {version: 1, state: 'CONFIRMED', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256, outcomeId: hex(210), disposition: 'RECOVERED', blockNumber: '20', blockHash: hex(211)};
      outcomes.set(request.bindingSHA256, outcome);
      if (switches.loseRecoveryReply) throw Error('lost original refund reply with owner secret');
      return switches.mutateOutcome(copy(outcome));
    },
    async observe({request, outcome, challenge}) {
      stats.observations++;
      if (switches.observationUnavailable) throw Error('private RPC secret');
      return switches.mutateObservation({version: 1, status: 'LIVE', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256, outcomeId: outcome.outcomeId, challenge, observedAt: clock, blockNumber: '21', blockHash: hex(202), canonicalOutcomeBlockHash: outcome.blockHash, backing: {held: '900', liabilities: '900', surplus: '0', deficit: '0'}});
    },
  };
  return {store, host, stats, switches, owner, prepared, outcomes, advance: ms => {clock += ms;}, get checkpoint() {return copy(checkpoint);}, get pendingCheckpoint() {return copy(pendingCheckpoint);}, coordinator: () => createGenericAccountCoordinator(config, {store, host, now: () => clock})};
}

test('exact retries preserve immutable request and bind owner capability once', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  const first = await c.prepare(input()), retry = await c.prepare(input());
  assert.deepEqual(retry, first);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.request));
  assert.throws(() => {first.request.kind = 'EXIT';}, TypeError);
  await expectCode(c.prepare(input({kind: 'EXIT'})), 'JOURNAL_REQUEST_CONFLICT');
  await expectCode(c.prepare(input({ownerOperationRef: hex(101)})), 'JOURNAL_REQUEST_CONFLICT');
  await expectCode(c.prepare(input({assetId: registry[1].assetId})), 'JOURNAL_REQUEST_CONFLICT');
  await expectCode(c.prepare(input({requestId: 'request_0002'})), 'JOURNAL_REFERENCE_ALREADY_BOUND');
  await expectCode(c.prepare(input({requestId: 'request_0002', assetId: registry[1].assetId})), 'JOURNAL_REFERENCE_ALREADY_BOUND');
  assert.equal(h.stats.preparations, 1);
  const confirmed = await c.execute(input().requestId);
  assert.equal(confirmed.state, 'CONFIRMED');
  assert.deepEqual(confirmed.request, first.request);
  assert.deepEqual((await c.prepare(input())).request, first.request);
  assert.deepEqual(await c.execute(input().requestId), confirmed);
  assert.equal(h.stats.executions, 1);
});

test('lost successful reply reconstructs and reconciles original without execute', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  const original = await c.prepare(input());
  h.switches.loseExecuteReply = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(c.snapshot().requests[0].state, 'UNKNOWN');
  await expectCode(c.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
  c.close();
  const restored = h.coordinator();
  await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  const result = await restored.reconcile(input().requestId);
  assert.equal(result.state, 'CONFIRMED');
  assert.deepEqual(result.request, original.request);
  assert.equal(h.stats.executions, 1);
  assert.equal(h.stats.reconciliations, 1);
});

test('finite TOP_UP and EXIT profiles use the same owner validation and exact outcomes', async () => {
  for (const kind of ['TOP_UP', 'EXIT']) {
    const h = harness(), c = h.coordinator();
    h.owner.get(hex(100)).kind = kind;
    await c.open({create: true});
    const prepared = await c.prepare(input({kind}));
    assert.equal(prepared.state, 'PREPARED');
    assert.equal((await c.execute(input().requestId)).state, 'CONFIRMED');
    assert.equal(h.stats.executions, 1);
  }
});

test('lost prepare reply remains PREPARING and retries the same custody lookup only', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  const prepare = h.host.prepare;
  h.host.prepare = async request => {await prepare(request); throw Error('lost preparation acknowledgement');};
  await expectCode(c.prepare(input()), 'JOURNAL_OWNER_PREPARATION_UNAVAILABLE');
  const binding = h.store.record.data.requests[0].request;
  assert.equal(c.snapshot().requests[0].state, 'PREPARING');
  await expectCode(c.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
  h.host.prepare = prepare;
  const restarted = h.coordinator(); await restarted.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  assert.deepEqual((await restarted.prepare(input())).request, binding);
  assert.equal(h.stats.preparations, 2);
  assert.equal(h.stats.executions, 0);
});

test('opaque reference and asset ID never establish owner authorization', async () => {
  for (const request of [input({ownerOperationRef: hex(101)}), input({assetId: registry[1].assetId}), input({kind: 'EXIT'})]) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true});
    await expectCode(c.prepare(request), 'JOURNAL_OWNER_PREPARATION_UNAVAILABLE');
    assert.equal(c.snapshot().requests[0].state, 'PREPARING');
    await expectCode(c.execute(request.requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
    assert.equal(h.stats.executions, 0);
  }
});

test('reject graph, credential, arbitrary payload, unknown kind and unregistered asset before host prepare', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  for (const key of ['graph', 'dag', 'terms', 'payload', 'signingKey', 'password', 'ownerVault', 'noteOpening', 'packets']) {
    await expectCode(c.prepare({...input(), [key]: 'SECRET'}), 'JOURNAL_REQUEST_FIELDS');
  }
  await expectCode(c.prepare(input({kind: 'REFUND'})), 'JOURNAL_REQUEST');
  await expectCode(c.prepare(input({ownerOperationRef: {graph: 'SECRET'}})), 'JOURNAL_REQUEST');
  await expectCode(c.prepare(input({assetId: hex(99)})), 'JOURNAL_ASSET_UNKNOWN');
  assert.equal(h.stats.preparations, 0);
  assert.equal(c.snapshot().requests.length, 0);
});

test('prepare acknowledgement must match exact binding and contain no hidden fields', async () => {
  for (const change of [x => ({...x, bindingSHA256: hex(1)}), x => ({...x, assetBindingSHA256: hex(2)}), x => ({...x, graph: 'SECRET'})]) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true});
    h.switches.mutatePreparation = change;
    await assert.rejects(c.prepare(input()));
    assert.equal(c.snapshot().requests[0].state, 'PREPARING');
    assert.equal(h.stats.executions, 0);
    assert.equal(JSON.stringify(h.store.record).includes('SECRET'), false);
  }
});

test('exact canonical outcome is required even when pool balance is live', async () => {
  for (const change of [x => ({...x, bindingSHA256: hex(1)}), x => ({...x, assetBindingSHA256: hex(2)}), () => ({state: 'CONFIRMED'}), x => ({...x, graph: 'SECRET'})]) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true}); await c.prepare(input());
    h.switches.mutateOutcome = change;
    await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
    assert.equal(c.snapshot().requests[0].state, 'UNKNOWN');
    assert.equal(h.stats.observations, 0);
    assert.equal(JSON.stringify(h.store.record).includes('SECRET'), false);
  }
});

test('unavailable, stale, foreign and noncanonical observation leave original UNKNOWN', async () => {
  const mutations = [x => ({...x, status: 'UNAVAILABLE'}), x => ({...x, observedAt: x.observedAt - 1}), x => ({...x, challenge: hex(1).slice(0, 32)}), x => ({...x, assetBindingSHA256: hex(2)}), x => ({...x, outcomeId: hex(3)}), x => ({...x, canonicalOutcomeBlockHash: hex(4)}), x => ({...x, blockNumber: '19'}), x => ({...x, backing: {...x.backing, held: '899', deficit: '1'}}), x => ({...x, graph: 'SECRET'})];
  for (const change of mutations) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true}); await c.prepare(input());
    h.switches.mutateObservation = change;
    await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
    assert.equal(c.snapshot().requests[0].state, 'UNKNOWN');
    await expectCode(c.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
    assert.equal(h.stats.executions, 1);
  }
});

test('observation failure can reconcile later; unchanged old pool backing is not a credit', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  h.switches.observationUnavailable = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.switches.observationUnavailable = false;
  assert.equal((await c.reconcile(input().requestId)).state, 'CONFIRMED');
  assert.equal(h.stats.executions, 1);
  assert.equal('available' in c.snapshot(), false);
  assert.equal(JSON.stringify(c.snapshot()).includes('900'), false);
});

test('unspent observation cannot authorize resending or invent original outcome', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  h.switches.loseExecuteReply = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.outcomes.clear(); // The original outcome is unavailable, no replacement allowed.
  await expectCode(c.reconcile(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  await expectCode(c.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
  assert.equal(h.stats.executions, 1);
  assert.equal(h.stats.observations, 0);
});

test('explicit recovery keeps the original graph binding across lost reply and restart', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  const original = await c.prepare(input());
  h.switches.interruptGraph = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.switches.loseRecoveryReply = true;
  await expectCode(c.recover(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(c.snapshot().requests[0].state, 'RECOVERING');
  assert.equal(h.stats.recoverySubmissions, 1);
  await expectCode(c.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
  await expectCode(c.prepare(input({ownerOperationRef: hex(101)})), 'JOURNAL_REQUEST_CONFLICT');
  await expectCode(c.prepare(input({requestId: 'replacement_request'})), 'JOURNAL_REFERENCE_ALREADY_BOUND');
  c.close();
  const restored = h.coordinator();
  await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  const result = await restored.recover(input().requestId);
  assert.equal(result.state, 'CONFIRMED');
  assert.equal(result.confirmation.outcome.disposition, 'RECOVERED');
  assert.deepEqual(result.request, original.request);
  const stats = copy(h.stats);
  for (const method of ['execute', 'reconcile', 'recover']) assert.deepEqual(await restored[method](input().requestId), result);
  assert.deepEqual(h.stats, stats);
  assert.equal(stats.executions, 1);
  assert.equal(stats.recoveries, 2);
  assert.equal(stats.recoverySubmissions, 1);
  assert.equal(stats.observations, 1);
});

test('early recovery stays retryable while reconcile never prepares or submits a refund', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  h.switches.interruptGraph = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.switches.beforeRecoveryDeadline = true;
  await expectCode(c.recover(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(h.stats.recoverySubmissions, 0);
  await expectCode(c.reconcile(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(c.snapshot().requests[0].state, 'RECOVERING');
  assert.equal(h.stats.recoveries, 1);
  const restored = h.coordinator();
  await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  h.switches.beforeRecoveryDeadline = false;
  assert.equal((await restored.recover(input().requestId)).confirmation.outcome.disposition, 'RECOVERED');
  assert.equal(h.stats.recoverySubmissions, 1);
  assert.equal(h.stats.executions, 1);
});

test('latched unknown refund is never resubmitted and only its exact original outcome can confirm', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  h.switches.interruptGraph = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.switches.recoveryOutcomeUnavailable = true;
  for (let attempt = 0; attempt < 2; attempt++) await expectCode(c.recover(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  await expectCode(c.reconcile(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(c.snapshot().requests[0].state, 'RECOVERING');
  assert.equal(h.stats.recoverySubmissions, 1);
  assert.equal(h.stats.observations, 0);
  h.switches.recoveryOutcomeUnavailable = false;
  h.switches.observationUnavailable = true;
  await expectCode(c.recover(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  h.switches.observationUnavailable = false;
  assert.equal((await c.reconcile(input().requestId)).confirmation.outcome.disposition, 'RECOVERED');
  assert.equal(h.stats.recoverySubmissions, 1);
  assert.equal(h.stats.executions, 1);
});

test('recovery requires an existing submitted GRAPH and never replaces an APPLIED outcome', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  await expectCode(c.recover('unknown_request'), 'JOURNAL_REQUEST_UNKNOWN');
  await expectCode(c.recover({...input(), terms: 'replacement'}), 'JOURNAL_REQUEST_ID');
  await c.prepare(input());
  await expectCode(c.recover(input().requestId), 'JOURNAL_NOT_SUBMITTED');
  const applied = await c.execute(input().requestId);
  assert.deepEqual(await c.recover(input().requestId), applied);
  assert.equal(h.stats.recoveries, 0);
  for (const kind of ['TOP_UP', 'EXIT']) {
    const other = harness(), coordinator = other.coordinator();
    other.owner.get(hex(100)).kind = kind;
    await coordinator.open({create: true}); await coordinator.prepare(input({kind}));
    await expectCode(coordinator.recover(input().requestId), 'JOURNAL_RECOVERY_GRAPH_REQUIRED');
    await coordinator.execute(input().requestId);
    await expectCode(coordinator.recover(input().requestId), 'JOURNAL_RECOVERY_GRAPH_REQUIRED');
    assert.equal(other.stats.recoveries, 0);
  }
});

test('recovery persistence and checkpoint failures occur before any refund effect', async () => {
  for (const mode of ['beforeWrite', 'afterWrite', 'beforeAck', 'afterAck']) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true}); await c.prepare(input());
    h.switches.interruptGraph = true;
    await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
    if (mode === 'beforeWrite') h.store.failBeforeWrite = true;
    if (mode === 'afterWrite') h.store.failAfterWrite = true;
    if (mode.endsWith('Ack')) {h.switches.ackFailure = true; h.switches.ackRetainsFirst = mode === 'afterAck';}
    await expectCode(c.recover(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
    assert.equal(h.stats.recoveries, 0);
    assert.equal(h.stats.recoverySubmissions, 0);
    h.store.failBeforeWrite = false; h.store.failAfterWrite = false; h.switches.ackFailure = false;
    const restored = h.coordinator();
    await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
    assert.equal(restored.snapshot().requests[0].state, mode === 'beforeWrite' ? 'UNKNOWN' : 'RECOVERING');
    await expectCode(restored.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
    assert.equal((await restored.recover(input().requestId)).confirmation.outcome.disposition, 'RECOVERED');
    assert.equal(h.stats.recoverySubmissions, 1);
    assert.equal(h.stats.executions, 1);
  }
});

test('write or checkpoint acknowledgement failure happens before host execution', async () => {
  for (const mode of ['beforeWrite', 'afterWrite', 'beforeAck', 'afterAck']) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true}); await c.prepare(input());
    if (mode === 'beforeWrite') h.store.failBeforeWrite = true;
    if (mode === 'afterWrite') h.store.failAfterWrite = true;
    if (mode.endsWith('Ack')) {h.switches.ackFailure = true; h.switches.ackRetainsFirst = mode === 'afterAck';}
    await expectCode(c.execute(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
    assert.equal(h.stats.executions, 0);
    assert.equal(c.snapshot().storageAvailable, false);
    await expectCode(c.execute(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
    h.store.failBeforeWrite = false; h.store.failAfterWrite = false; h.switches.ackFailure = false;
    const restarted = h.coordinator();
    await restarted.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
    if (mode !== 'beforeWrite') {
      assert.equal(restarted.snapshot().requests[0].state, 'SUBMITTING');
      await expectCode(restarted.execute(input().requestId), 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
      await expectCode(restarted.reconcile(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
      assert.equal(h.stats.executions, 0);
    } else assert.equal(restarted.snapshot().requests[0].state, 'PREPARED');
  }
});

test('lost UNKNOWN acknowledgement after execution restores SUBMITTING/UNKNOWN with no second execute', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  const execute = h.host.execute;
  h.host.execute = async request => {const outcome = await execute(request); h.switches.ackFailure = true; throw Error('lost execution reply');};
  await expectCode(c.execute(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
  assert.equal(c.snapshot().requests[0].state, 'SUBMITTING');
  h.switches.ackFailure = false;
  const restored = h.coordinator(); await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  assert.equal(restored.snapshot().requests[0].state, 'UNKNOWN');
  assert.equal((await restored.reconcile(input().requestId)).state, 'CONFIRMED');
  assert.equal(h.stats.executions, 1);
});

test('CONFIRMED is not acknowledged before keeper retention; committed successor can recover', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  const observe = h.host.observe;
  h.host.observe = async request => {const result = await observe(request); h.switches.ackFailure = true; return result;};
  await expectCode(c.execute(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
  assert.equal(c.snapshot().requests[0].state, 'SUBMITTING');
  assert.equal(h.store.record.data.requests[0].state, 'CONFIRMED');
  h.switches.ackFailure = false;
  const restored = h.coordinator(); await restored.open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint});
  assert.equal(restored.snapshot().requests[0].state, 'CONFIRMED');
  assert.equal((await restored.execute(input().requestId)).state, 'CONFIRMED');
  assert.equal(h.stats.executions, 1);
  assert.equal(h.stats.reconciliations, 0);
});

test('restart requires surviving authority and exact original checkpoint identity', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true});
  const stale = h.checkpoint;
  await c.prepare(input());
  await expectCode(h.coordinator().open(), 'JOURNAL_OPEN_FAILED');
  await expectCode(h.coordinator().open({checkpoint: stale}), 'JOURNAL_OPEN_FAILED');
  await expectCode(h.coordinator().open({checkpoint: {...h.checkpoint, stateSHA256: hex(1)}}), 'JOURNAL_OPEN_FAILED');
  await expectCode(h.coordinator().open({checkpoint: {...h.checkpoint, journalId: 'other_journal'}}), 'JOURNAL_OPEN_FAILED');
  h.switches.alive = false;
  await expectCode(h.coordinator().open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint}), 'JOURNAL_AUTHORITY_UNAVAILABLE');
});

test('recovery rejects an unproposed successor even when its predecessor hash matches', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  h.switches.ackFailure = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_STORAGE_UNAVAILABLE');
  h.switches.ackFailure = false;
  // This is structurally valid and correctly links the original checkpoint,
  // but differs from the exact candidate the keeper retained before the write.
  h.store.record.data.requests[0].state = 'UNKNOWN';
  h.store.record.data.requests[0].errorCode = 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED';
  await expectCode(h.coordinator().open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint}), 'JOURNAL_OPEN_FAILED');
  assert.equal(h.stats.executions, 0);
});

test('corrupt schema, rollback, mismatched asset domain and unlinked successor fail closed', async () => {
  for (const mutate of [r => {r.data.requests[0].request.graph = 'SECRET';}, r => {r.data.registry[0].pool = '9'.repeat(40);}, r => {r.data.requests[0].request.assetBindingSHA256 = hex(3);}, r => {r.revision++; r.data.previousStateSHA256 = hex(4);}, r => {r.revision--;}]) {
    const h = harness(), c = h.coordinator();
    await c.open({create: true}); await c.prepare(input());
    const checkpoint = h.checkpoint;
    mutate(h.store.record);
    await expectCode(h.coordinator().open({checkpoint}), 'JOURNAL_OPEN_FAILED');
  }
});

test('public projection and checkpoint contain no refs or owner details; errors do not relay host secrets', async () => {
  const h = harness(), c = h.coordinator();
  await c.open({create: true}); await c.prepare(input());
  const visible = JSON.stringify({snapshot: c.snapshot(), checkpoint: h.checkpoint});
  for (const key of ['ownerOperationRef', 'password', 'graph', 'signingKey', 'packets', 'noteOpening']) assert.equal(visible.includes(key), false);
  h.switches.observationUnavailable = true;
  await expectCode(c.execute(input().requestId), 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
  assert.equal(JSON.stringify(h.store.record).includes('secret'), false);
});

test('real encrypted Vault rejects corrupted authenticated bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'generic-journal-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const path = join(directory, 'journal.vault'), vault = new Vault(path), password = 'synthetic-journal-only-test-password';
  const store = {create: data => vault.create(data, password), read: () => vault.read(password), update: (revision, transform) => vault.update(password, revision, transform)};
  const h = harness({store}), c = h.coordinator();
  await c.open({create: true});
  const bytes = await readFile(path, 'utf8');
  assert.equal(bytes.includes('ownerOperationRef'), false);
  await writeFile(path, bytes.slice(0, -8) + 'CORRUPT');
  await expectCode(h.coordinator().open({checkpoint: h.checkpoint, pendingCheckpoint: h.pendingCheckpoint}), 'JOURNAL_OPEN_FAILED');
});
