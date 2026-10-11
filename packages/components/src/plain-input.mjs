/** Detached plain-data validation shared across module boundaries. */
import assert from "node:assert/strict";
import { types } from "node:util";
import {
  fixedArray,
  exactRecord,
  canonicalField,
  bytes32,
} from "./encoding/commitments.mjs";

/** Canonical decimal input, with the original host encoding and range checks.
 * @param {unknown} value @param {number} [bits] @param {bigint} [maximum] */
export function inputUint(
  value,
  bits = 64,
  maximum = (1n << BigInt(bits)) - 1n,
) {
  assert.equal(typeof value, "string", "INPUT_UINT_STRING");
  const text = /** @type {string} */ (value);
  assert.ok(
    text.length <= 39 && /^(0|[1-9][0-9]*)$/.test(text),
    "INPUT_UINT_ENCODING",
  );
  const number = BigInt(text);
  assert.equal(number.toString(), text, "INPUT_UINT_CANONICAL");
  assert.ok(
    number <= maximum && number < 1n << BigInt(bits),
    "INPUT_UINT_RANGE",
  );
  return number;
}
/** Exact public Merkle path; no membership, state or authority is established.
 * @template {{root:unknown,index:number,siblings:unknown[]}} T
 * @param {T} value @param {number} depth @param {boolean} [field] @returns {T} */
export function inputPath(value, depth, field = false) {
  exactRecord(value, ["root", "index", "siblings"]);
  assert.ok(
    Number.isSafeInteger(value.index) &&
      !Object.is(value.index, -0) &&
      value.index >= 0 &&
      value.index < 2 ** depth,
    "INPUT_PATH_INDEX",
  );
  fixedArray(value.siblings, depth);
  (field ? canonicalField : bytes32)(value.root);
  value.siblings.forEach((item) => (field ? canonicalField : bytes32)(item));
  return value;
}

/** @template T @param {T} value @returns {T} */
export function frozenInput(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozenInput);
    Object.freeze(value);
  }
  return value;
}
/** Snapshot untrusted plain data before any await or legacy codec call.
 * @template T @param {T} value @returns {T} */
export function cloneInput(value) {
  /** @type {Set<object>} */
  const seen = new Set();
  /** @param {unknown} v */
  const visit = (v) => {
    if (v === null || ["string", "boolean"].includes(typeof v)) return;
    if (typeof v === "number") {
      assert.ok(Number.isSafeInteger(v) && !Object.is(v, -0), "INPUT_INTEGER");
      return;
    }
    assert.ok(
      v && typeof v === "object" && !types.isProxy(v) && !seen.has(v),
      "INPUT_PLAIN_DATA",
    );
    seen.add(v);
    if (Array.isArray(v)) fixedArray(v, v.length);
    else {
      const keys = Reflect.ownKeys(v);
      assert.ok(keys.every((key) => typeof key === "string"));
      exactRecord(v, keys);
    }
    Object.values(v).forEach(visit);
    seen.delete(v);
  };
  visit(value);
  return structuredClone(value);
}
