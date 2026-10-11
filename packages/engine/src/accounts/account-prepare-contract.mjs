/** Pure account prepare wire contract. This validator issues no permission. */
import { types } from 'node:util';
const kinds = new Set(['TOP_UP', 'GRAPH', 'EXIT']);
/** @param {unknown} value @param {RegExp} pattern @returns {value is string} */
const wholeMatch = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
/** @param {unknown} value @returns {value is string} */
const requestId = value => wholeMatch(value, /^[A-Za-z0-9_-]{8,100}$/);
/** @param {unknown} value @returns {value is string} */
const hex = value => wholeMatch(value, /^[0-9a-f]{64}$/);
/** @param {unknown} condition @param {string} code @returns {asserts condition} */
function need(condition, code) { if (!condition) throw Object.assign(new Error(code), { code }); }
/** @param {unknown} value @param {readonly string[]} fields @param {string} code @returns {asserts value is Record<string,unknown>} */
function record(value, fields, code) {
  need(value && typeof value === 'object' && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(key =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')), code);
}

/** @param {unknown} input */
export function validateFlatAccountPrepare(input) {
  record(input, ['requestId', 'kind', 'ownerOperationRef', 'assetId'], 'FLAT_ACCOUNT_REQUEST_FIELDS');
  need(requestId(input.requestId) && typeof input.kind === 'string' && kinds.has(input.kind) && hex(input.ownerOperationRef) && hex(input.assetId),
    'FLAT_ACCOUNT_REQUEST');
  return Object.freeze({ requestId: input.requestId, kind: input.kind,
    ownerOperationRef: input.ownerOperationRef, assetId: input.assetId });
}
