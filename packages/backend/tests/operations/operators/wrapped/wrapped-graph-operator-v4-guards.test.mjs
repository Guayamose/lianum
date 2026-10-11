import {readOriginalReverseCoverageV4,finalizeOriginalReverseCoverageV4} from '../../../../src/claims/wrapped/operations/reverse-coverage-finalization-v4.mjs';
import {createOriginalGraphInventoryRoundV4} from '../../../../src/operations/operators/wrapped/original-graph-inventory-round-v4.mjs';
import {nativeValueWatermark as watermark} from '../../../../src/operations/operators/wrapped/wrapped-claim-graph-inventory-v1.mjs';
/** Actual source-only physical guard closures. These lower inert runtime ports
 * cannot issue production brands; no node, compiler, prover or native key runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGraphNativeStateV4,graphNativeProjectionV4} from '../../../../src/operations/operators/wrapped/graph-native-state-v4.mjs';
import { cloneInput as copy, frozenInput as freeze, inputUint } from "@lianum/components/plain-input";
const operations = new WeakMap();
const readWrappedGraphDispatchOperationV4 = token => { const read = operations.get(token); assert.ok(read, 'TEST_ORIGINAL_OPERATION_REQUIRED'); return freeze(copy(read())); };
const api = {
  graphNativeStateV4(rows, token) {
    return assertGraphNativeStateV4(rows, token === null ? null : readWrappedGraphDispatchOperationV4(token), inputUint);
  },
  graphNativeProjectionV4: (before,after) => graphNativeProjectionV4(before,after,inputUint),
};
const h = digit => digit.repeat(64);
function fixture(family = 'EVM') {
  const state = { profile:'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4',family,lifetimeId:h('1'),genesis:h('2'),readGeneration:'0',activeReads:0,readsIdle:true,
    mutationGeneration:'4',activeMutations:1,busy:true,closed:false,uncertain:false,pending:true,adverseHistory:false,
    ...(family === 'EVM' ? {transactions:[],receipts:[],lifecycle:[],lastTimestamp:'1000'} : {entry:{phase:'KEY_PENDING'},journal:[]}) };
  const rows = [{profileCommitment:h('3'),state}], token = Object.freeze(Object.create(null));
  const descriptor = {profile:'WRAPPED_GRAPH_DISPATCH_OPERATION_V4',profileCommitment:h('3'),family,lifetimeId:h('1'),phase:'native-key',
    prepared:{unsignedWire:'0011',intent:{amount:'1'}},signed:null,nativeAuditStarted:0};
  operations.set(token, () => ({...descriptor,physicalState:state}));
  return {rows,token,state,descriptor};
}
for (const family of ['EVM','TRON']) test('fixed GRAPH physical guard accepts only exact '+family+' operation plus idle sibling', () => {
  const f = fixture(family), sibling = copy(f.rows[0]); sibling.profileCommitment=h('4'); sibling.state.lifetimeId=h('5');
  Object.assign(sibling.state,{busy:false,pending:false,activeMutations:0}); f.rows.push(sibling);
  assert.equal(api.graphNativeStateV4(f.rows,f.token),f.rows);
  sibling.state.busy=true; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/STATE_busy/);
  sibling.state.busy=false; sibling.state.pending=true; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/STATE_pending/);
  sibling.state.pending=false; sibling.state.activeMutations=1; assert.throws(()=>api.graphNativeStateV4(f.rows,f.token),/MUTATION_IN_FLIGHT/);
});
for (const change of ['family','lifetime','phase','profile','activeReads','adverse','uncertain','copy']) test('fixed GRAPH physical guard rejects '+change, () => {
  const f=fixture();
  if(change==='family')f.descriptor.family='TRON'; if(change==='lifetime')f.descriptor.lifetimeId=h('9');
  if(change==='phase')f.descriptor.phase='caller-selected'; if(change==='profile')f.descriptor.profileCommitment=h('9');
  if(change==='activeReads')f.state.activeReads=1;if(change==='adverse')f.state.adverseHistory=true;if(change==='uncertain')f.state.uncertain=true;
  assert.throws(()=>api.graphNativeStateV4(f.rows,change==='copy'?{...f.token}:f.token));
});
test('cross-signer GRAPH progress allows monotonic reads only; every physical history and mutation fence stays exact',()=>{
  const f=fixture(),before=copy(f.rows);f.state.readGeneration='2';api.graphNativeProjectionV4(before,f.rows);
  assert.throws(()=>api.graphNativeProjectionV4(f.rows,before),/READ_GENERATION_ROLLBACK/);
  for(const key of ['mutationGeneration','lifetimeId','lastTimestamp']){const changed=copy(f.rows);changed[0].state[key]='9';assert.throws(()=>api.graphNativeProjectionV4(f.rows,changed));}
  const changed=copy(f.rows);changed[0].state.transactions.push({phase:'unknown'});assert.throws(()=>api.graphNativeProjectionV4(f.rows,changed));
});



/** HOST storage defect only. Exercise the original audit/unchanged/save transitions
 * through their complete mechanism against the real encrypted V3 store. Native observation, binding validation
 * and current-view ports below are explicit inert data fixtures; no key, native
 * runtime, consensus, proof or financial acceptance is created. */
test('HOST original wrapped audit avoids key-order-only AEAD commits and keeps every fresh check', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const storeModule = await import('../../../../src/claims/storage/segmented-record-store.mjs');
  const readiness = await import('../../../../src/execution/account/preparation/readiness-inputs.mjs');
  const commitments = await import('../../../../../components/src/encoding/commitments.mjs');
  const blockId = 'a'.repeat(64), nativeId = 'b'.repeat(64), gid = 'c'.repeat(64);
  const initial = { lastClock: '1000', inventories: [{ profileCommitment: 'd'.repeat(64), entries: [{
    original: { nativeId, facts: { nativeGid: gid } }, watermark: watermark({ finalizedBlockId: blockId, finalizedBlockHeight: '5' }),
    status: 'live', reason: null, lastCheckedAt: '1000', pending: null, history: [],
  }] }], authorizations: [], checkpoints: [] };
  const directory = await mkdtemp(join(tmpdir(), 'wrapped-audit-order-host-'));
  const store = await storeModule.createClaimRecordStore({ path: join(directory, 'journal'), password: 'HOST original audit private password',
    identity: { purpose: 'INERT_WRAPPED_AUDIT_KEY_ORDER_HOST' } }, initial);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  const durable = await store.read();
  // This is the actual canonical AEAD readback order that broke the original
  // JSON-text comparison. The value produced by the original watermark is equal.
  const reordered = readiness.cloneInput(durable.data);
  reordered.inventories[0].entries[0].watermark = watermark({ finalizedBlockId: blockId, finalizedBlockHeight: '5' });
  assert.notEqual(JSON.stringify(reordered), JSON.stringify(durable.data));
  assert.deepEqual(reordered, durable.data);
  const control = { reads: 0, commits: 0, currents: 0, observations: 0, height: '5', failure: null, status: 'live', poisoned: false };
  const resources = { store: {
    async load() { control.reads++; const row = await store.read(); return { revision: String(row.revision), state: row.data }; },
    async commit(input) { control.commits++; const row = await store.update(Number(input.expectedRevision), prior => {
      assert.deepEqual(prior, scope.record.state); return input.nextState;
    }); return { revision: String(row.revision), state: row.data }; },
  } };
  const ports = { copy: readiness.cloneInput, freeze: readiness.frozenInput,
    equal: (a, b) => assert.deepEqual(a, b), exactRecord: commitments.exactRecord, inputUint: readiness.inputUint,
    validateNativeValueOperatorInventory(state) { // Inert prevalidated inventory port: never grants a typed native observation.
      assert.deepEqual(Object.keys(state).sort(), ['authorizations', 'checkpoints', 'inventories', 'lastClock']); return state;
    }, nativeValueWatermark: watermark, MAX_CERTIFICATES_PER_ORIGINAL: 64,
    owned() { assert.equal(control.poisoned, false); }, poison() { control.poisoned = true; },
    current: async () => { control.currents++; },
    observe: async () => { control.observations++; if (control.failure) throw control.failure; return {
      status: control.status, reason: control.status === 'live' ? null : 'INERT_ORIGINAL_SOURCE_UNKNOWN', observed: true, nativeReadCount: '1', sourceStatus: control.status === 'live' ? 'observed' : 'unverified',
      original: { facts: { finalizedBlockId: blockId, finalizedBlockHeight: control.height } },
    }; },
  };
  const scope = {bound: {resources,binding:Object.freeze({inert:true})},
    active:{view:{head:{timestamp:'1000'}}},record:{revision:String(durable.revision),state:durable.data}};
  const live = createOriginalGraphInventoryRoundV4(scope, ports);
  await live.audit(); await live.audit();
  assert.deepEqual({ reads: control.reads, currents: control.currents, observations: control.observations, commits: control.commits },
    { reads: 4, currents: 4, observations: 2, commits: 0 });
  assert.equal((await store.read()).revision, durable.revision);
  // A genuinely new watermark still gets the original durable CAS/readback.
  control.height = '6'; await live.audit();
  assert.equal(control.commits, 1); assert.equal((await store.read()).revision, durable.revision + 1);
  assert.equal(scope.record.state.inventories[0].entries[0].watermark.blockHeight, '6');
  await live.audit(); assert.equal(control.commits, 1); assert.equal(control.observations, 4);
  // A later original-source failure is re-observed and cannot be hidden by a
  // previously equal state. It propagates unchanged without a new commit.
  control.status = 'unknown'; const unavailable = await live.audit();
  assert.equal(unavailable.blockers.length, 1); assert.equal(control.commits, 2);
  assert.equal(scope.record.state.inventories[0].entries[0].status, 'unknown');
  const original = Error('INERT_ORIGINAL_SOURCE_FAILED'); control.failure = original;
  await assert.rejects(live.audit(), error => error === original);
  assert.equal(control.observations, 6); assert.equal(control.commits, 2);
  assert.equal((await store.read()).revision, durable.revision + 2);
});

async function completeReverseCoverage(ports) {
  const quiet = await readOriginalReverseCoverageV4(ports);
  finalizeOriginalReverseCoverageV4(ports,quiet);
}
function finalizationFixture() {
  const events = [], quiet = Object.freeze({}), snapshot = Object.freeze({head:'original'});
  const ports = {
    async readVault() { events.push('journal'); }, async current() { events.push('current'); },
    async quiesce() { events.push('quiesce'); return quiet; },
    assertQuiescent(value) { assert.equal(value,quiet); events.push('quiescent'); },
    assertLive() { events.push('live'); }, snapshot() { events.push('snapshot'); return snapshot; },
    now() { events.push('deadline'); return 120; }, started:100,
    retain(value) { assert.equal(value,snapshot); events.push('retain'); },
  };
  return {events,ports};
}
test('reverse completion retains only after final journal/head reads, original quiescence and deadline', async () => {
  const f=finalizationFixture(); let release;
  f.ports.readVault = () => new Promise(resolve => {f.events.push('journal');release=resolve;});
  const pending=completeReverseCoverage(f.ports);
  await Promise.resolve(); assert.deepEqual(f.events,['journal']);
  release(); await pending;
  assert.deepEqual(f.events,['journal','current','quiesce','quiescent','live','snapshot','deadline','retain']);
});
for (const phase of ['readVault','current','quiesce','assertQuiescent','assertLive'])
  test('reverse completion never retains after failed '+phase, async () => {
    const f=finalizationFixture(),failure=Error('ORIGINAL_'+phase);
    f.ports[phase]=()=>{throw failure;};
    await assert.rejects(completeReverseCoverage(f.ports),error=>error===failure);
    assert.equal(f.events.includes('retain'),false);
  });
for (const elapsed of [-1,30_000,NaN,Infinity])
  test('reverse completion rejects invalid or expired elapsed '+elapsed, async () => {
    const f=finalizationFixture();f.ports.now=()=>f.ports.started+elapsed;
    await assert.rejects(completeReverseCoverage(f.ports),/CLAIM_OPERATOR_AUDIT_TOO_OLD/);
    assert.equal(f.events.includes('retain'),false);
  });
