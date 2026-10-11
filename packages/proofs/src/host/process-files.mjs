/** Shared original supervisor file/PID guards, unchanged predicates. */
import assert from 'node:assert/strict';
import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** @typedef {{pid:number,ppid:number,state:string,pgrp:number,session:number,startTimeTicks:string}} NativeProcStat */
/** @typedef {'PPID'|'PGRP'|'SESSION'} IdentityField */
/** @typedef {{field:IdentityField,tokenShape:'missing'|'negative'|'unsafeInteger'|'nonDecimal',originalIntegerFailure:true,identityMinusOne:boolean}} IntegerDiagnostic */
/** @param {number} value */
const integer = value => { assert.ok(Number.isSafeInteger(value) && value >= 0, 'NATIVE_RESOURCE_INTEGER'); return value; };
/** @type {WeakMap<object,{diagnostic:Readonly<IntegerDiagnostic>,identityMinusOne:boolean}>} */
const originalProcIntegerFailures = new WeakMap();
/** @param {string | undefined} token @param {IdentityField} field */
function procInteger(token, field) {
  const value = Number(token);
  try { return integer(value); }
  catch (error) {
    const tokenShape = token === undefined ? 'missing'
      : /^-\d+$/.test(token) ? 'negative'
      : /^\d+$/.test(token) && !Number.isSafeInteger(value) ? 'unsafeInteger' : 'nonDecimal';
    const identityMinusOne = token === '-1' && (field === 'PGRP' || field === 'SESSION');
    assert.ok(error instanceof Error);
    originalProcIntegerFailures.set(error, Object.freeze({
      diagnostic: Object.freeze({ field, tokenShape, originalIntegerFailure: true, identityMinusOne }),
      identityMinusOne,
    }));
    throw error; // The same original numeric rejection, never a retry/zero.
  }
}
/** Diagnostic-only: original failure identity required, no text/value/PID. */
/** @param {unknown} error */
export function nativeProcStatIntegerDiagnosticV1(error) {
  assert.equal(arguments.length, 1);
  return error && typeof error === 'object' ? originalProcIntegerFailures.get(error)?.diagnostic ?? null : null;
}
/** Only an original parser rejection of the exact kernel identity sentinel. */
/** @param {unknown} error */
export function isOriginalNativeProcStatMinusOneV1(error) {
  assert.equal(arguments.length, 1);
  return Boolean(error && typeof error === 'object' && originalProcIntegerFailures.get(error)?.identityMinusOne === true);
}

/** @param {string} path @param {number} [maximumBytes] */
export function readNativeFlowRegularV1(path, maximumBytes = 8 * 1024 * 1024) {
  assert.equal(realpathSync(path), resolve(path), 'NATIVE_FILE_SYMLINK');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && before.size <= BigInt(maximumBytes), 'NATIVE_REGULAR_FILE_SIZE');
    const bytes = readFileSync(fd), after = fstatSync(fd, { bigint: true });
    assert.ok(bytes.length <= maximumBytes && before.size === after.size
      && before.mtimeNs === after.mtimeNs, 'NATIVE_FILE_CHANGED');
    return bytes;
  } finally { closeSync(fd); }
}

/** @param {number} pid @param {string} text @returns {NativeProcStat} */
export function parseNativeProcStat(pid, text) {
  const end = text.lastIndexOf(') '), first = text.indexOf(' ');
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && end > first
    && text.slice(0, first) === String(pid), 'NATIVE_PROC_STAT');
  const fields = text.slice(end + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 22 && /^[RSDZTWXIKPt]$/.test(fields[0]), 'NATIVE_PROC_STAT_FIELDS');
  const ppid = procInteger(fields[1], 'PPID'), pgrp = procInteger(fields[2], 'PGRP');
  const session = procInteger(fields[3], 'SESSION'), startTimeTicks = fields[19];
  assert.match(startTimeTicks, /^\d+$/, 'NATIVE_PROC_START_IDENTITY');
  return { pid, ppid, state: fields[0], pgrp, session, startTimeTicks };
}
/** @param {number} pid */
export function nativeProcStatV1(pid) {
  try { return parseNativeProcStat(pid, readFileSync(`/proc/${pid}/stat`, 'utf8')); }
  catch (error) { if (error instanceof Error && 'code' in error && ['ENOENT', 'ESRCH'].includes(String(error.code))) return null; throw error; }
}
