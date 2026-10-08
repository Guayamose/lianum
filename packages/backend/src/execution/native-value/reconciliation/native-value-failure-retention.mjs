/** Diagnostic data only. A phase cannot authorize a read, write, proof or send.
 * Never reads exception values, stacks, native identities or private inputs. */
import { AssertionError } from 'node:assert';
import { types } from 'node:util';
import { privateFailureDiagnostic } from '../../account/reconciliation/failure-diagnostics.mjs';

const phases = new Set(['validate-original-readiness', 'dispatch-native', 'persist-native-observation',
  'observe-native', 'certify-native', 'read-admission-checkpoint',
  'build-admission-inputs', 'join-admission', 'persist-proof-intent',
  'prove-admission', 'verify-admission', 'read-current-admission-gate',
  'persist-admission-intent', 'submit-admission', 'persist-admission-receipt',
  'observe-original-admission', 'provider-observe-native', 'provider-retain-original',
  'provider-certify-native', 'provider-persist-observation', 'provider-preparation',
  'provider-native-key', 'provider-provider-key', 'provider-send',
  'provider-reconciliation-error-append', 'provider-dispatch-error-append',
  'admission-proof-cleanup']);
const retainedPhases = new WeakMap();
const secondaryFailures = new WeakMap();
const originalAuditTimings = new WeakMap();
const timingOperations = new Set(['audit', 'health', 'checkpoint', 'certify', 'coverage']);
const timingPhases = new Set(['initial', 'initial-coverage', 'new-original-observation', 'checked-original-save',
  'retained-certificate-coverage', 'unsigned-intent-save', 'pre-key-coverage', 'key-sign', 'signed-save',
  'post-key-coverage', 'return']);
const timingNumbers = ['currentMilliseconds', 'storeMilliseconds', 'nativeSourceMilliseconds',
  'currentChecks', 'storeLoads', 'storeCommits', 'nativeSourceObservations', 'nativeReadCount', 'elapsedMilliseconds'];
// A numeric private diagnostic never grants currentness or resumption. The
// original error owns the data; attaching a lookalike DTO cannot retain it.
export function retainNativeValueOriginalAuditTimingV1(error, value) {
  if (!object(error) || originalAuditTimings.has(error) || !object(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return;
  const fields = ['profile', 'operation', 'phase', ...timingNumbers, 'limitMilliseconds'];
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || !keys.every(key => fields.includes(key)
    && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'))) return;
  const data = key => descriptors[key].value;
  if (data('profile') !== 'NATIVE_VALUE_ORIGINAL_AUDIT_TIMING_V1' || !timingOperations.has(data('operation'))
    || !timingPhases.has(data('phase')) || data('limitMilliseconds') !== 30_000) return;
  const saved = { profile: data('profile'), operation: data('operation'), phase: data('phase') };
  for (const key of timingNumbers) {
    const number = data(key);
    if (typeof number !== 'number' || !Number.isFinite(number) || Object.is(number, -0) || number < 0
      || number > 3_600_000 || (!key.endsWith('Milliseconds') && !Number.isSafeInteger(number))) return;
    saved[key] = Math.floor(number);
  }
  saved.limitMilliseconds = 30_000; originalAuditTimings.set(error, Object.freeze(saved));
}
function originalAuditTiming(error) {
  const seen = new Set();
  for (let i = 0; i < 4 && object(error) && !seen.has(error); i++) {
    seen.add(error); const value = originalAuditTimings.get(error); if (value) return value;
    error = Object.getOwnPropertyDescriptor(error, 'cause')?.value;
  }
  return null;
}
const classes = new Map([[AssertionError.prototype, 'ASSERTION_ERROR'],
  [TypeError.prototype, 'TYPE_ERROR'], [RangeError.prototype, 'RANGE_ERROR'],
  [Error.prototype, 'ERROR']]);
function object(error) {
  return error !== null && typeof error === 'object' && !types.isProxy(error);
}
export function retainNativeValueFailurePhase(error, phase) {
  if (object(error) && phases.has(phase) && !retainedPhases.has(error)) retainedPhases.set(error, phase);
}
function boundedDiagnostic(error) {
  const safe = object(error);
  const errorClass = safe && types.isNativeError(error)
    ? classes.get(Object.getPrototypeOf(error)) ?? 'OTHER_NATIVE_ERROR' : 'THROWN_VALUE';
  return { ...privateFailureDiagnostic(error), errorClass };
}
export function retainNativeValueSecondaryFailure(error, phase, secondary) {
  if (!object(error) || !phases.has(phase)) return;
  const entries = secondaryFailures.get(error) ?? [];
  if (entries.length < 2) {
    secondaryFailures.set(error, Object.freeze([...entries,
      Object.freeze({ ...boundedDiagnostic(secondary), phase })]));
  }
}
export function nativeValueFailureDiagnostic(error) {
  const safe = object(error), secondary = safe ? secondaryFailures.get(error) : null, timing = originalAuditTiming(error);
  return Object.freeze({ ...boundedDiagnostic(error),
    phase: safe ? retainedPhases.get(error) ?? 'unlocated' : 'unlocated',
    ...(secondary ? { secondaryFailures: secondary } : {}),
    ...(timing ? { nativeAuditTiming: timing } : {}) });
}
