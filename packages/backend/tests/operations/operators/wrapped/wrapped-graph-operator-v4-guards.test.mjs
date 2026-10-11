/** Actual source-only physical guard closures. These lower inert runtime ports
 * cannot issue production brands; no node, compiler, prover or native key runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput as copy, frozenInput as freeze, inputUint } from '../../../../src/execution/account/preparation/readiness-inputs.mjs';
const source = readFileSync(new URL('./wrapped-claim-graph-operators-v1.mjs', import.meta.url), 'utf8');
const a = source.indexOf('function graphNativeProjectionV4('), b = source.indexOf('function assertMessageWindowV4(', a);
assert.ok(a > 0 && b > a);
const operations = new WeakMap();
const readWrappedGraphDispatchOperationV4 = token => { const read = operations.get(token); assert.ok(read, 'TEST_ORIGINAL_OPERATION_REQUIRED'); return freeze(copy(read())); };
const api = new Function('assert','copy','freeze','inputUint','exactRecord','bytes32','readWrappedGraphDispatchOperationV4','equal',
  source.slice(a,b) + '\nreturn {graphNativeStateV4,graphNativeProjectionV4};')(assert,copy,freeze,inputUint,exactRecord,bytes32,readWrappedGraphDispatchOperationV4,assert.deepEqual);
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
test('reverse claim ticket is completed inside original serial after final awaits and fixed native quiescence',()=>{
  const claim=readFileSync(new URL('../native-claims/wrapped-operators-v1.mjs',import.meta.url),'utf8');
  const start=claim.indexOf('if (reverseCoverageTicketsV4.has(result))'),capture=claim.indexOf('reverseCoverageStatesV4.set(result, snapshot)',start);
  const body=claim.slice(start,capture);
  assert.ok(body.includes('await readVault(); await current();'));
  assert.ok(body.includes('await quiesceOwnedOperatorNativeReads([...nativeReads.values()])'));
  assert.ok(body.includes('performance.now() - started'));assert.ok(claim.indexOf('return result;',capture)>capture);
  assert.ok(source.includes('consumeWrappedGraphOperatorKeyLeaseV4'));assert.ok(!source.includes('signWrappedGraphAuthorizationV1'));
  const combined=readFileSync(new URL('./wrapped-claim-combined-operators-v1.mjs',import.meta.url),'utf8');
  assert.ok(!combined.includes('export function signWrappedGraphAuthorizationV1'));assert.ok(combined.includes('consumeWrappedGraphOperatorKeyLeaseV4(lease, token, kind, message, policy, frame)'));
});


/** HOST storage defect only. Execute the original audit/unchanged/save bodies
 * against the real encrypted V3 store. Native observation, binding validation
 * and current-view ports below are explicit inert data fixtures; no key, native
 * runtime, consensus, proof or financial acceptance is created. */
test('HOST original wrapped audit avoids key-order-only AEAD commits and keeps every fresh check', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { isDeepStrictEqual } = await import('node:util');
  const moduleURL = (canonical, mapped) => {
    const candidate = new URL(canonical, import.meta.url);
    try { readFileSync(candidate); return candidate; }
    catch (error) { assert.equal(error.code, 'ENOENT'); const fallback = new URL(mapped, import.meta.url); readFileSync(fallback); return fallback; }
  };
  const storeModule = await import(moduleURL('../../../../src/claims/storage/segmented-record-store.mjs', '../native-claims/segmented-record-store.mjs').href);
  const readiness = await import(moduleURL('../../../../src/execution/account/preparation/readiness-inputs.mjs', '../paeg/readiness-inputs.mjs').href);
  const commitments = await import(moduleURL('../../../../../components/src/encoding/commitments.mjs', '../paeg/commitments.mjs').href);
  const inventorySource = readFileSync(moduleURL('../../../../src/operations/operators/wrapped/wrapped-claim-graph-inventory-v1.mjs', './wrapped-claim-graph-inventory-v1.mjs'), 'utf8');
  const watermarkLine = inventorySource.split('\n').filter(line => line.startsWith('export const nativeValueWatermark = '));
  assert.equal(watermarkLine.length, 1);
  const watermark = Function(watermarkLine[0].replace('export ', '') + '\nreturn nativeValueWatermark;')();
  const unchangedAt = source.indexOf('  async function unchanged() {'), saveEnd = source.indexOf('  async function current() {', unchangedAt);
  const auditAt = source.indexOf('  async function auditAll('), auditEnd = source.indexOf('  function evmFenceV4()', auditAt);
  assert.ok(unchangedAt >= 0 && saveEnd > unchangedAt && auditAt >= 0 && auditEnd > auditAt);
  const bodies = source.slice(unchangedAt, saveEnd) + source.slice(auditAt, auditEnd);
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
      assert.deepEqual(prior, live.read().state); return input.nextState;
    }); return { revision: String(row.revision), state: row.data }; },
  } };
  const ports = { assert, isDeepStrictEqual, copy: readiness.cloneInput, freeze: readiness.frozenInput,
    equal: (a, b) => assert.deepEqual(a, b), exactRecord: commitments.exactRecord, inputUint: readiness.inputUint,
    validateNativeValueOperatorInventory(state) { // Inert prevalidated inventory port: never grants a typed native observation.
      assert.deepEqual(Object.keys(state).sort(), ['authorizations', 'checkpoints', 'inventories', 'lastClock']); return state;
    }, nativeValueWatermark: watermark, MAX_CERTIFICATES_PER_ORIGINAL: 64,
    bound: { resources, binding: Object.freeze({ inert: true }) },
    active: { view: { head: { timestamp: '1000' } } }, record: { revision: String(durable.revision), state: durable.data },
    owned() { assert.equal(control.poisoned, false); }, poison() { control.poisoned = true; },
    current: async () => { control.currents++; },
    observe: async () => { control.observations++; if (control.failure) throw control.failure; return {
      status: control.status, reason: control.status === 'live' ? null : 'INERT_ORIGINAL_SOURCE_UNKNOWN', observed: true, nativeReadCount: '1', sourceStatus: control.status === 'live' ? 'observed' : 'unverified',
      original: { facts: { finalizedBlockId: blockId, finalizedBlockHeight: control.height } },
    }; },
  };
  const names = Object.keys(ports);
  const live = Function(...names, bodies + '\nreturn {audit:auditAll, read:()=>record};')(...names.map(name => ports[name]));
  await live.audit(); await live.audit();
  assert.deepEqual({ reads: control.reads, currents: control.currents, observations: control.observations, commits: control.commits },
    { reads: 4, currents: 4, observations: 2, commits: 0 });
  assert.equal((await store.read()).revision, durable.revision);
  // A genuinely new watermark still gets the original durable CAS/readback.
  control.height = '6'; await live.audit();
  assert.equal(control.commits, 1); assert.equal((await store.read()).revision, durable.revision + 1);
  assert.equal(live.read().state.inventories[0].entries[0].watermark.blockHeight, '6');
  await live.audit(); assert.equal(control.commits, 1); assert.equal(control.observations, 4);
  // A later original-source failure is re-observed and cannot be hidden by a
  // previously equal state. It propagates unchanged without a new commit.
  control.status = 'unknown'; const unavailable = await live.audit();
  assert.equal(unavailable.blockers.length, 1); assert.equal(control.commits, 2);
  assert.equal(live.read().state.inventories[0].entries[0].status, 'unknown');
  const original = Error('INERT_ORIGINAL_SOURCE_FAILED'); control.failure = original;
  await assert.rejects(live.audit(), error => error === original);
  assert.equal(control.observations, 6); assert.equal(control.commits, 2);
  assert.equal((await store.read()).revision, durable.revision + 2);
});
