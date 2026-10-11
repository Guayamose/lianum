/** Detached plain-data validation shared across module boundaries. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { fixedArray, exactRecord } from './encoding/commitments.mjs';

/** @template T @param {T} value @returns {T} */
export function frozenInput(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozenInput); Object.freeze(value); }
  return value;
}
/** Snapshot untrusted plain data before any await or legacy codec call.
 * @template T @param {T} value @returns {T} */
export function cloneInput(value) {
  /** @type {Set<object>} */
  const seen = new Set();
  /** @param {unknown} v */
  const visit = v => {
    if (v === null || ['string', 'boolean'].includes(typeof v)) return;
    if (typeof v === 'number') { assert.ok(Number.isSafeInteger(v) && !Object.is(v, -0), 'INPUT_INTEGER'); return; }
    assert.ok(v && typeof v === 'object' && !types.isProxy(v) && !seen.has(v), 'INPUT_PLAIN_DATA');
    seen.add(v);
    if (Array.isArray(v)) fixedArray(v, v.length);
    else { const keys = Reflect.ownKeys(v); assert.ok(keys.every(key => typeof key === 'string')); exactRecord(v, keys); }
    Object.values(v).forEach(visit); seen.delete(v);
  };
  visit(value); return structuredClone(value);
}
