import test from 'node:test';
import assert from 'node:assert/strict';
import { privateFailureDiagnostic } from '../../../../src/execution/account/reconciliation/failure-diagnostics.mjs';

test('explicit assertion labels survive a wrapped signing failure without comparison values', () => {
  let cause;
  try { assert.equal('private actual', 'private expected', 'CLAIM_OPERATOR_AUDIT_TOO_OLD'); } catch (error) { cause = error; }
  const error = Object.assign(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN', { cause }), {
    causeCodes: ['CLAIM_OPERATOR_AUDIT_TOO_OLD'],
  });
  assert.deepEqual(privateFailureDiagnostic(error), { code: 'FLAT_OPERATOR_SIGNING_UNCERTAIN',
    causeCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD', causeCodes: ['CLAIM_OPERATOR_AUDIT_TOO_OLD'] });
  assert.ok(!JSON.stringify(privateFailureDiagnostic(error)).includes('private'));
});

test('raw errors, multiline values, getters and proxies are never diagnostic data sources', () => {
  for (const error of [new Error('private wire bytes'), new Error('CLAIM_FAILURE\nprivate values'),
    new Proxy({}, { get() { throw Error('must not invoke'); } }),
    new Proxy({}, { getPrototypeOf() { throw Error('must not invoke'); } }),
    Object.defineProperty({}, 'message', { get() { throw Error('must not invoke'); } })]) {
    assert.deepEqual(privateFailureDiagnostic(error), { code: 'FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED',
      causeCode: null, causeCodes: [] });
  }
});

test('cause collection is bounded, deduplicated and terminates on cycles', () => {
  const error = new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN');
  const next = new Error('CLAIM_STORE_UNCERTAIN', { cause: error }); error.cause = next;
  error.causeCodes = ['CLAIM_STORE_UNCERTAIN', 'CLAIM_A', 'CLAIM_B', 'CLAIM_C', 'CLAIM_D'];
  const value = privateFailureDiagnostic(error);
  assert.deepEqual(value.causeCodes, ['CLAIM_STORE_UNCERTAIN', 'CLAIM_A', 'CLAIM_B', 'CLAIM_C']);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.causeCodes));
});

test('fixed graph deadline budget survives wrappers without admitting arbitrary diagnostics', () => {
  const budget = { phase: 'after-claim-coverage', elapsedMilliseconds: 30001, limitMilliseconds: 30000 };
  const cause = Object.assign(new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'), { auditBudget: budget });
  const value = privateFailureDiagnostic(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN', { cause }));
  assert.deepEqual(value.auditBudget, budget);
  assert.ok(Object.isFrozen(value.auditBudget));
  budget.elapsedMilliseconds = 99999;
  assert.equal(value.auditBudget.elapsedMilliseconds, 30001);
  for (const invalid of [
    { ...budget, phase: 'private wire' }, { ...budget, secret: 'private' },
    { ...budget, elapsedMilliseconds: NaN }, { ...budget, elapsedMilliseconds: Infinity },
    { ...budget, elapsedMilliseconds: -0 }, { ...budget, elapsedMilliseconds: -1 },
    { ...budget, elapsedMilliseconds: 3600001 }, { ...budget, limitMilliseconds: 60000 },
    new Proxy({}, { ownKeys() { throw Error('must not invoke'); } }),
    Object.defineProperty({ phase: budget.phase, limitMilliseconds: 30000 }, 'elapsedMilliseconds',
      { get() { throw Error('must not invoke'); }, enumerable: true }),
  ]) {
    assert.equal(privateFailureDiagnostic(Object.assign(new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'),
      { auditBudget: invalid })).auditBudget, undefined);
  }
  assert.equal(privateFailureDiagnostic(Object.assign(new Error('FLAT_OPERATOR_OTHER'),
    { auditBudget: budget })).auditBudget, undefined);
});


test('claim deadline diagnostics retain only closed method, round and phase labels through wrappers', () => {
  const budget = { phase: 'after-graph-coverage', method: 'begin-payout', round: 'initial-preparation',
    elapsedMilliseconds: 30000, limitMilliseconds: 30000 };
  const diagnose = value => privateFailureDiagnostic(new Error('CLAIM_ATTESTATION_UNCERTAIN', {
    cause: Object.assign(new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD'), { auditBudget: value }) }));
  assert.deepEqual(diagnose(budget).auditBudget, budget);
  assert.ok(Object.isFrozen(diagnose(budget).auditBudget));
  for (const value of [{ ...budget, method: 'private-id' }, { ...budget, round: 'private-wire' },
    { ...budget, phase: 'private-rpc' }, { ...budget, nativeId: 'private' }, { ...budget, limitMilliseconds: 30001 },
    Object.defineProperty({ ...budget }, 'method', { get() { throw Error('must not invoke'); } }),
    new Proxy(budget, { ownKeys() { throw Error('must not invoke'); } })])
    assert.equal(diagnose(value).auditBudget, undefined);
  assert.equal(privateFailureDiagnostic(Object.assign(new Error('CLAIM_OTHER'), { auditBudget: budget })).auditBudget, undefined);
});


test('original native audit timings survive the same failure chain without DTOs or private fields', async () => {
  const { retainNativeValueOriginalAuditTimingV1, nativeValueFailureDiagnostic } = await import(
    '../../../../src/execution/native-value/reconciliation/native-value-failure-retention.mjs');
  const timing = { profile: 'NATIVE_VALUE_ORIGINAL_AUDIT_TIMING_V1', operation: 'certify', phase: 'post-key-coverage',
    currentMilliseconds: 1000.9, storeMilliseconds: 9000.8, nativeSourceMilliseconds: 21000.7,
    currentChecks: 15, storeLoads: 8, storeCommits: 2, nativeSourceObservations: 3, nativeReadCount: 180,
    elapsedMilliseconds: 31001, limitMilliseconds: 30000 };
  const cause = new Error('NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE');
  retainNativeValueOriginalAuditTimingV1(cause, timing);
  const wrapped = new Error('NATIVE_VALUE_POST_KEY_UNCERTAIN', { cause });
  const actual = nativeValueFailureDiagnostic(wrapped).nativeAuditTiming;
  assert.deepEqual(actual, { ...timing, currentMilliseconds: 1000, storeMilliseconds: 9000, nativeSourceMilliseconds: 21000 });
  assert.ok(Object.isFrozen(actual)); timing.storeMilliseconds = 1;
  assert.equal(actual.storeMilliseconds, 9000);
  assert.equal(nativeValueFailureDiagnostic(Object.assign(new Error('NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE'),
    { nativeAuditTiming: actual })).nativeAuditTiming, undefined);
  for (const invalid of [{ ...timing, nativeId: 'SYNTHETIC_PRIVATE_DO_NOT_RETAIN' }, { ...timing, limitMilliseconds: 60000 },
    { ...timing, currentChecks: 1.5 }, { ...timing, nativeSourceMilliseconds: Infinity },
    new Proxy(timing, { ownKeys() { throw Error('must not invoke'); } }),
    Object.defineProperty({ ...timing }, 'phase', { get() { throw Error('must not invoke'); } })]) {
    const error = new Error('NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE');
    retainNativeValueOriginalAuditTimingV1(error, invalid);
    assert.equal(nativeValueFailureDiagnostic(error).nativeAuditTiming, undefined);
  }
  assert.equal(JSON.stringify(nativeValueFailureDiagnostic(wrapped)).includes('SYNTHETIC_PRIVATE'), false);
});

test('original quorum timing spans certify and final fresh coverage without renewing the thirty-second start',async()=>{
  const {readFileSync,existsSync}=await import('node:fs');
  const {join}=await import('node:path');const {Script,createContext}=await import('node:vm');
  const {ROOT}=await import('../../../../../proofs/src/catalog.mjs');
  const file=new URL('../../../../src/operations/operators/native-value/native-value-operators-v4.mjs',import.meta.url);
  const source=readFileSync(existsSync(file)?file:join(ROOT,'wallet-platform/modules/ops/native-value-operators-v4.mjs'),'utf8');
  const from=source.indexOf('  async function serial(poolIndex,'),to=source.indexOf('  function keySign(',from);
  assert.ok(from>=0&&to>from);const code=source.slice(from,to),operator=Object.freeze({}),token=Object.freeze({});
  const view={poolIndex:0},shared=Object.freeze({view,started:0,token}),rounds=new WeakSet([shared]);
  const aggregate={profile:'NATIVE_VALUE_ORIGINAL_AUDIT_TIMING_V1',operation:'audit',phase:'initial',
    currentMilliseconds:100,storeMilliseconds:0,nativeSourceMilliseconds:0,currentChecks:0,storeLoads:0,storeCommits:0,nativeSourceObservations:0,nativeReadCount:0};
  const roundAuditTimings=new WeakMap([[shared,new Map([[operator,aggregate]])]]);let now=100,retained;
  const context=createContext({assert,operator,rounds,roundAuditTimings,busy:false,keyUsed:false,active:undefined,reservation:token,
    performance:{now:()=>now},bound:{system:Object.freeze({})},owned(){},pool(){},
    async unchanged(){now+=10;},async current(){const active=context.active;active.timing.currentChecks++;now+=1;context.budget(active.started);},
    newOriginalAuditTimingV4(){throw Error('HOST_SHARED_ORIGINAL_ONLY');},poison(){},
    retainNativeValueOriginalAuditTimingV1(error,value){retained={error,value:structuredClone(value)};}});
  const actual=new Script('('+code.trim()+')').runInContext(context);
  const budgetFrom=source.indexOf('function budget(started)'),budgetTo=source.indexOf('/** Creates only',budgetFrom);
  assert.ok(budgetFrom>=0&&budgetTo>budgetFrom);context.budget=new Script('('+source.slice(budgetFrom,budgetTo).trim()+')').runInContext(context);
  await actual(0,async()=>{const t=context.active.timing;t.operation='certify';t.storeLoads+=2;t.storeCommits++;t.storeMilliseconds+=5000;
    t.nativeSourceObservations+=3;t.nativeReadCount+=384;t.nativeSourceMilliseconds+=21000;now=26310;},shared);
  await assert.rejects(actual(0,async()=>{const t=context.active.timing;t.operation='coverage';t.storeLoads+=3;t.storeCommits++;t.storeMilliseconds+=2715;
    t.nativeSourceObservations++;t.nativeReadCount+=128;t.nativeSourceMilliseconds+=6136;now=35240;},shared),/NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE/);
  assert.equal(retained.error.message,'NATIVE_VALUE_COMPLETE_AUDIT_DEADLINE');assert.equal(retained.value.operation,'coverage');assert.equal(retained.value.phase,'initial');
  assert.equal(retained.value.elapsedMilliseconds,35241);assert.equal(retained.value.limitMilliseconds,30000);
  assert.equal(retained.value.nativeSourceObservations,4);assert.equal(retained.value.nativeReadCount,512);
  assert.equal(retained.value.nativeSourceMilliseconds,27136);assert.ok(retained.value.storeMilliseconds>=7715);
  assert.equal(shared.started,0);assert.equal(context.busy,false);assert.equal(context.active,undefined);
});
