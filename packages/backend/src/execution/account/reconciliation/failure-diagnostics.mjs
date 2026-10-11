/** Bounded protocol labels and a fixed deadline budget only. Never exports
 * comparison values, RPC text, native identities or stacks. */
import { AssertionError } from 'node:assert';
import { types } from 'node:util';

const LABEL = /^(?:FLAT|CLAIM|NATIVE_CLAIM|COMBINED_OPERATOR|OPERATOR_NATIVE|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|PW|VAULT|NATIVE|COMMITMENT)_[A-Z0-9_]{1,100}$/;
/** @param {unknown} value @returns {value is string} */
const known = value => typeof value === 'string' && LABEL.exec(value)?.[0] === value;
const BUDGET_PHASES = new Set(['graph-current', 'after-native-audit',
  'before-claim-coverage', 'after-claim-coverage', 'after-operation',
  'claim-current', 'before-graph-coverage', 'after-graph-coverage', 'synchronous-v4-fence']);
const CLAIM_BUDGET_METHODS = new Set(['operation', 'begin-payout', 'redeem', 'reserve-payout',
  'debt-health', 'presign-payout', 'payout-broadcast']);
const CLAIM_BUDGET_ROUNDS = new Set(['whole-operation', 'initial-preparation', 'original-validation',
  'existing-authorization', 'pre-key', 'persisted-return']);
/** @param {unknown} value @param {string} key @returns {unknown} */
function data(value, key) {
  if (!value || typeof value !== 'object' || types.isProxy(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
/** @param {unknown} error */
function label(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) return null;
  const message = data(error, 'message');
  if (types.isNativeError(error) && Object.getPrototypeOf(error) === AssertionError.prototype
    && data(error, 'generatedMessage') === false) {
    const first = typeof message === 'string' ? message.split('\n', 1)[0] : null;
    if (known(first)) return first;
  }
  const code = data(error, 'code');
  return known(code) ? code : known(message) ? message : null;
}

/** @param {unknown} error */
function auditBudget(error) {
  const value = data(error, 'auditBudget');
  if (!value || typeof value !== 'object' || types.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  const scoped = keys.length === 5 && ['method', 'round'].every(key => keys.includes(key));
  if ((!scoped && keys.length !== 3) || !['phase', 'elapsedMilliseconds', 'limitMilliseconds'].every(key => keys.includes(key))) return null;
  const method = data(value, 'method'), round = data(value, 'round');
  if (scoped && (typeof method !== 'string' || typeof round !== 'string' || !CLAIM_BUDGET_METHODS.has(method) || !CLAIM_BUDGET_ROUNDS.has(round))) return null;
  const phase = data(value, 'phase'), elapsedMilliseconds = data(value, 'elapsedMilliseconds');
  if (typeof phase !== 'string' || !BUDGET_PHASES.has(phase) || data(value, 'limitMilliseconds') !== 30_000
    || typeof elapsedMilliseconds !== 'number' || !Number.isSafeInteger(elapsedMilliseconds) || Object.is(elapsedMilliseconds, -0)
    || elapsedMilliseconds < 0 || elapsedMilliseconds > 3_600_000) return null;
  return Object.freeze({ phase, ...(scoped ? { method, round } : {}), elapsedMilliseconds, limitMilliseconds: 30_000 });
}

/** @param {unknown} error @param {string} [fallback] */
export function privateFailureDiagnostic(error, fallback = 'FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED') {
  const code = label(error) ?? (known(fallback) ? fallback : 'FLAT_EXECUTION_ORIGINAL_OUTCOME_UNRESOLVED');
  let budget = auditBudget(error);
  /** @type {string[]} */
  const codes = [];
  const seen = new Set();
  /** @param {unknown} value */
  const add = value => { if (known(value) && value !== code && !codes.includes(value) && codes.length < 4) codes.push(value); };
  const supplied = data(error, 'causeCodes');
  if (Array.isArray(supplied) && !types.isProxy(supplied))
    for (let i = 0; i < Math.min(supplied.length, 4); i++) add(data(supplied, String(i)));
  let cause = data(error, 'cause');
  for (let depth = 0; cause && depth < 4 && !seen.has(cause); depth++) {
    seen.add(cause); add(label(cause)); budget ??= auditBudget(cause); cause = data(cause, 'cause');
  }
  const deadline = ['FLAT_OPERATOR_AUDIT_TOO_OLD', 'CLAIM_OPERATOR_AUDIT_TOO_OLD'].some(value => code === value || codes.includes(value));
  return Object.freeze({ code, causeCode: codes.at(-1) ?? null, causeCodes: Object.freeze(codes),
    ...(deadline && budget ? { auditBudget: budget } : {}) });
}
