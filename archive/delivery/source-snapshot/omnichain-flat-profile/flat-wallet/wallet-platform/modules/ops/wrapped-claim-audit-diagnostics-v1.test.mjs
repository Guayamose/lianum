/** Source-extracted diagnostic-only host checks. No factory, runtime, key,
 * compiler, proof worker, historical fixture or network is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { privateFailureDiagnostic } from '../paeg/failure-diagnostics.mjs';
const source = readFileSync(new URL('../native-claims/wrapped-operators-v1.mjs', import.meta.url), 'utf8');
const cut = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
const currentSource = cut('  function auditBudgetFailure(', '  async function readCurrentView()');
const before = `async function current() { live();
  const withinBudget = () => assert.ok(activeView && performance.now() - started < 30_000, 'CLAIM_OPERATOR_AUDIT_TOO_OLD');
  try { withinBudget(); await observer.assertCurrent(activeView); live(); withinBudget(); }
  catch (error) { cachedView = undefined; throw error; }
}`;
function makeCurrent(body, times, view = {}) {
  let samples = 0, reads = 0;
  const api = vm.runInThisContext('(function({assert,performance,observer,activeView}) {'
    + "let started = 0, cachedView = activeView, auditMethod = 'begin-payout', auditRound = 'initial-preparation'; const live = () => {};"
    + body + '; return {current, cached: () => cachedView}; })')({ assert, activeView: view,
      performance: { now: () => times[Math.min(samples++, times.length - 1)] },
      observer: { assertCurrent: async () => { reads++; } } });
  return { ...api, samples: () => samples, reads: () => reads };
}
async function outcome(api) { try { await api.current(); return 'PASS'; } catch (error) { return error.message; } }

test('diagnostics preserve original early predicates and exact clock/RPC counts including nonfinite negatives', async () => {
  for (const times of [[-Infinity], [-1], [-0], [0], [29999], [30000], [Infinity], [NaN], [0,30000], [0,Infinity], [0,-1]]) {
    const a = makeCurrent(before, times), b = makeCurrent(currentSource, times);
    assert.equal(await outcome(a), await outcome(b));
    assert.equal(a.samples(), b.samples()); assert.equal(a.reads(), b.reads());
    assert.equal(a.cached() === undefined, b.cached() === undefined);
  }
  const a = makeCurrent(before, [0], null), b = makeCurrent(currentSource, [0], null);
  assert.equal(await outcome(a), await outcome(b)); assert.equal(a.samples(), 0); assert.equal(b.samples(), 0);
});

test('claim deadline emits only fixed method/round/phase and bounded counts without another clock sample', async () => {
  const api = makeCurrent(currentSource, [0,30000]);
  await assert.rejects(api.current('after-graph-coverage'), error => {
    assert.deepEqual(privateFailureDiagnostic(error).auditBudget, {phase:'after-graph-coverage', method:'begin-payout',
      round:'initial-preparation',elapsedMilliseconds:30000,limitMilliseconds:30000});
    assert.ok(Object.isFrozen(error.auditBudget)); return true;
  });
  assert.equal(api.samples(), 2); assert.equal(api.reads(), 1);
});

test('terminal V4 predicate stays strict and samples the same clock exactly once', () => {
  const helper = cut('  function auditBudgetFailure(', '  async function current(');
  const terminal = cut('      const elapsed = performance.now() - started;\n      try { assert.ok', '\n    };');
  const run = vm.runInThisContext('(function({assert,performance}) { let started=0,auditMethod="begin-payout",auditRound="pre-key";'
    + helper + terminal + '})');
  for (const n of [-Infinity,-1,-0,0,29999,30000,Infinity,NaN]) {
    let samples=0; const expected=Number.isFinite(n)&&n>=0&&n<30000;
    const execute=()=>run({assert,performance:{now(){samples++;return n;}}});
    if(expected) execute(); else assert.throws(execute,error=>error.auditBudget.phase==='synchronous-v4-fence');
    assert.equal(samples,1);
  }
});

test('reciprocal GRAPH order is retained and currentness still runs before and after its await', async () => {
  const body=cut('  async function jointCurrent()', '  const clock ='); const events=[];
  const api=vm.runInThisContext('(function({current,custody,activeV4,activeView,assertCombinedGraphCoverageV4}) {'+body+';return jointCurrent;})')({
    current:async phase=>events.push(phase),custody:{},activeView:{head:{}},activeV4:{setGraphSource:()=>events.push('capture'),assertGraphSource:()=>events.push('assert')},
    assertCombinedGraphCoverageV4:async()=>{events.push('graph-read');return {};}});
  await api(); assert.deepEqual(events,['before-graph-coverage','graph-read','capture','after-graph-coverage','assert']);
});

test('new method labels never project request fields, and full-round starts remain before journal/view reads', () => {
  const method=cut('    auditMethod = request.terms?.action', '    const head =');
  const label=vm.runInThisContext('(function(request,A){let auditMethod,auditRound;const original=null;'+method+';return auditMethod;})');
  const A={BEGIN_PAYOUT:'b',REDEEM:'r',RESERVE_PAYOUT:'v'};
  for(const [request,want] of [[{terms:{action:'b'}},'begin-payout'],[{terms:{action:'r'}},'redeem'],[{terms:{action:'v'}},'reserve-payout'],[{mode:'debt'},'debt-health'],[{nativeId:'SYNTHETIC_PRIVATE_ID'},'payout-broadcast'],[{mode:'SYNTHETIC_PRIVATE_MODE'},'presign-payout']])
    assert.equal(label(request,A),want);
  assert.match(source,/auditMethod = 'operation'; auditRound = 'whole-operation'; started = performance\.now\(\);\n    try \{\n      await readVault\(\); activeView = await readCurrentView\(\);/);
  assert.match(source,/auditRound = round;[\s\S]*?quiet\.release\(\);\n      started = beginWrappedClaimAuditRoundV4\(custody\); await readVault\(\); activeView = await readCurrentView\(\);/);
  for(const round of ['existing-authorization','pre-key','persisted-return']) assert.ok(source.includes("await freshRound('"+round+"')"));
});

test('shared diagnostic prerequisite rejects invalid scoped data without invoking getters/proxies', () => {
  const good={phase:'after-graph-coverage',method:'begin-payout',round:'initial-preparation',elapsedMilliseconds:30000,limitMilliseconds:30000};
  const diagnose=b=>privateFailureDiagnostic(Object.assign(new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD'),{auditBudget:b}));
  assert.deepEqual(diagnose(good).auditBudget,good);
  for(const bad of [{...good,extra:'SYNTHETIC_PRIVATE'}, {...good,method:'CLAIM_SYNTHETIC_ID'}, {...good,round:'x'}, {...good,phase:'x'},
    {...good,elapsedMilliseconds:NaN},{...good,elapsedMilliseconds:-0},{...good,elapsedMilliseconds:3600001},{...good,limitMilliseconds:30001},
    Object.assign(Object.create(null),good),{...good,[Symbol('x')]:1},new Proxy(good,{ownKeys(){throw Error('invoked');}}),
    Object.defineProperty({...good},'method',{get(){throw Error('invoked');}})]) assert.equal(diagnose(bad).auditBudget,undefined);
});
