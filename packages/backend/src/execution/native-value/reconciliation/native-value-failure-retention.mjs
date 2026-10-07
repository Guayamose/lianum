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
  const safe = object(error), secondary = safe ? secondaryFailures.get(error) : null;
  return Object.freeze({ ...boundedDiagnostic(error),
    phase: safe ? retainedPhases.get(error) ?? 'unlocated' : 'unlocated',
    ...(secondary ? { secondaryFailures: secondary } : {}) });
}
