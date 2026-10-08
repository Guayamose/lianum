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
