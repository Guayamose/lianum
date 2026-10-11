/** Exact-source source-fence tests. The original GRAPH serial/audit/capture,
 * combined source-token bridge and claim jointCurrent functions are executed
 * verbatim. EVM observations, durable writes and ownership are synthetic ports.
 * This is no deployment, EVM proof/crypto, native runtime or financial evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { cloneInput as copy, frozenInput as freeze } from "@lianum/components/plain-input";
import { exactRecord } from '@lianum/components/encoding/commitments';
const graphSource = readFileSync(new URL('./native-operators.mjs', import.meta.url), 'utf8');
const bridgeSource = readFileSync(new URL('./combined-native-operators.mjs', import.meta.url), 'utf8');
const claimSource = readFileSync(new URL('../native-claims/operators.mjs', import.meta.url), 'utf8');
const cut = (source, from, until) => {
  const a = source.indexOf(from), b = source.indexOf(until, a);
  assert.ok(a >= 0 && b > a, 'TEST_EXACT_SOURCE_BOUNDARY'); return source.slice(a, b);
};
const serialSource = cut(graphSource, '  async function serial(selectedPool, work)', '  function store(family)');
const auditSource = cut(graphSource, '  async function auditAll(view, freshness)', '  function coverageFreshness');
const stateSource = cut(graphSource, '  function sourceStateV4()', "  if (custody) registerCombinedOperatorBranch");
const coverageMethods = cut(graphSource, '    sourceStateV4,', '    noteKeyUse()');
const combinedSource = cut(bridgeSource, 'export async function assertCombinedGraphCoverageV4', '// Only fixed domain codecs').replaceAll('export ', '');
const jointSource = cut(claimSource, '  async function jointCurrent()', '  const clock =');
const compile = (source, environment) => vm.runInThisContext('(function({' + Object.keys(environment).join(',') + '}) {' + source + '\n})')(environment);
function fixture() {
  const c = { now: 0, evmReads: 0, nativeReads: 0, keys: 0, adverse: false, failEarly: false, claimChecks: 0 };
  const head = { number: '60', hash: '12'.repeat(32), timestamp: '1000' }, token = Object.freeze({});
  const gid = '34'.repeat(32), view = { head };
  const observation = { status: 'observed', genesis: '56'.repeat(32), asset: '78'.repeat(32), nativeWire: '00', intent: {},
    blockId: '9a'.repeat(32), blockHeight: '50', finalityKind: '1', confirmations: '11',
    nativeContext: { observedTipId: head.hash, observedTipHeight: head.number, transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
  const body = `
    let busy=false, activeKeyUsed=false, poisoned=false, operationGeneration=0, keyUseEpoch=0;
    let activeView, activeAnchor, activeFreshness, activeBudget;
    const custody=token, coverageTicketsV4=new WeakSet(), coverageStatesV4=new WeakMap();
    let record={revision:0,data:{adverse:{},currentNativeContexts:{},authorizations:[],inventories:{'3':{state:{entries:[
      {request:{family:'3',recipientIndex:'0',nativeId:'owned-evm-effect'},facts:{nativeGid:gid,nativeContext:copy(observation.nativeContext)},status:'live',reason:null,signature:'SYNTHETIC_ONLY'}
    ]}}}}};
    const bound={families:['3'],runtime:{},system:{}};
    const peers={'3':{auditInventory:async()=>({ready:true})}}, policies={'3':{}}, factReaders={'3':{observe:async()=>{
      c.evmReads++;return c.adverse?{status:'adverse',reason:'EVM_FACT_CHANGED'}:copy(observation);
    }}};
    const retained=()=>bound, live=()=>{}, poison=()=>{poisoned=true;}, signingFailure=e=>e;
    const assertLocalEvm=async()=>{if(c.failEarly)throw Error('TEST_BEFORE_FIRST_NATIVE_READ');};
    const assertOwnedFlatSystem=()=>{}, assertNativeCapabilities=()=>{}, assertVault=async()=>{};
    const currentView=async()=>view, current=async()=>{}, assertCombinedGraphBinding=()=>{};
    const assertStableOperatorFact=()=>{}, assertCurrentNativeContext=()=>{};
    const save=async data=>{record={revision:record.revision+1,data:copy(data)};};
    ${serialSource}\n${auditSource}\n${stateSource}
    return {busy:()=>busy,${coverageMethods}
      audit:()=>serial(0,(v,f)=>auditAll(v,f)), snapshot:()=>copy(record)};
  `;
  const graph = compile(body, { assert, copy, freeze, equal: assert.deepEqual, exactRecord, isDeepStrictEqual,
    OBSERVED: Object.keys(observation), performance: { now: () => c.now }, c, token, gid, view, observation });
  const state = { branches: new Map([['graph', graph]]) };
  const bridge = compile(combinedSource + ';return {assertCombinedGraphCoverageV4,assertCombinedGraphSourceCurrentV4};', {
    assert, graphSourceLeasesV4: new WeakMap(), original: value => { assert.equal(value, token); return state; }, assertCombinedOperatorLive: () => {} });
  return { c, graph, bridge, head, token };
}

test('V4 fixed source token rejects an EVM-only later GRAPH adverse audit and retains the adverse record', async () => {
  const f = fixture(), lease = await f.bridge.assertCombinedGraphCoverageV4(f.token, f.head);
  f.bridge.assertCombinedGraphSourceCurrentV4(f.token, lease);
  f.c.adverse = true; const report = await f.graph.audit();
  assert.ok(report.blockers.length > 0); assert.ok(Object.keys(f.graph.snapshot().data.adverse).length > 0);
  assert.equal(f.c.nativeReads, 0); assert.equal(f.c.keys, 0);
  assert.throws(() => f.bridge.assertCombinedGraphSourceCurrentV4(f.token, lease), /COMBINED_GRAPH_SOURCE_CHANGED/);
});

test('V4 source token retains the generation of its exact completed reciprocal audit before a later claim current await', async () => {
  const f = fixture(); let lease;
  const activeV4 = { setGraphSource(value) { lease = value; }, assertGraphSource() { f.bridge.assertCombinedGraphSourceCurrentV4(f.token, lease); } };
  const joint = compile(jointSource + ';return jointCurrent;', { custody: f.token, activeView: { head: f.head }, activeV4,
    assertCombinedGraphCoverage: () => assert.fail('TEST_NO_BASELINE_DOWNGRADE'),
    assertCombinedGraphCoverageV4: f.bridge.assertCombinedGraphCoverageV4,
    current: async () => { if (++f.c.claimChecks === 2) { f.c.adverse = true; await f.graph.audit(); } } });
  await assert.rejects(joint(), /COMBINED_GRAPH_SOURCE_CHANGED/);
  assert.equal(f.c.claimChecks, 2); assert.equal(f.c.nativeReads, 0); assert.equal(f.c.keys, 0);
  assert.ok(Object.keys(f.graph.snapshot().data.adverse).length > 0);
});

test('V4 source fence advances on failed GRAPH operation before any EVM/native observation and cannot revive', async () => {
  const f = fixture(), lease = await f.bridge.assertCombinedGraphCoverageV4(f.token, f.head), reads = f.c.evmReads;
  f.c.failEarly = true; await assert.rejects(f.graph.audit(), /BEFORE_FIRST_NATIVE_READ/); f.c.failEarly = false;
  assert.equal(f.c.evmReads, reads); assert.equal(f.c.nativeReads, 0); assert.equal(f.c.keys, 0);
  assert.throws(() => f.bridge.assertCombinedGraphSourceCurrentV4(f.token, lease), /COMBINED_GRAPH_SOURCE_CHANGED/);
  await f.graph.audit();
  assert.throws(() => f.bridge.assertCombinedGraphSourceCurrentV4(f.token, lease), /COMBINED_GRAPH_SOURCE_CHANGED/);
});
