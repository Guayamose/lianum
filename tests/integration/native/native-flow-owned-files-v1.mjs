/** Shared original supervisor file/PID guards, unchanged predicates. */
import assert from 'node:assert/strict';
import { constants, openSync, closeSync, fstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
const integer = value => { assert.ok(Number.isSafeInteger(value) && value >= 0, 'NATIVE_RESOURCE_INTEGER'); return value; };

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

export function parseNativeProcStat(pid, text) {
  const end = text.lastIndexOf(') '), first = text.indexOf(' ');
  assert.ok(Number.isSafeInteger(pid) && pid > 0 && end > first
    && text.slice(0, first) === String(pid), 'NATIVE_PROC_STAT');
  const fields = text.slice(end + 2).trim().split(/\s+/);
  assert.ok(fields.length >= 22 && /^[RSDZTWXIKPt]$/.test(fields[0]), 'NATIVE_PROC_STAT_FIELDS');
  const ppid = integer(Number(fields[1])), pgrp = integer(Number(fields[2]));
  const session = integer(Number(fields[3])), startTimeTicks = fields[19];
  assert.match(startTimeTicks, /^\d+$/, 'NATIVE_PROC_START_IDENTITY');
  return { pid, ppid, state: fields[0], pgrp, session, startTimeTicks };
}
export function nativeProcStatV1(pid) {
  try { return parseNativeProcStat(pid, readFileSync(`/proc/${pid}/stat`, 'utf8')); }
  catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) return null; throw error; }
}
