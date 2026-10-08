import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, open, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureTronCandidateDiskLogs } from './tron-candidate-disk-log-capture.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'lianum-tron-disk-log-'));
  const source = join(root, 'scratch'), audit = join(root, 'audit');
  await mkdir(join(source, 'logs/db'), { recursive: true, mode: 0o700 });
  await mkdir(audit, { mode: 0o700 });
  try { await run({ root, source, audit }); } finally { await rm(root, { recursive: true, force: true }); }
}

test('fixed Logback files retain small originals and bound large prefix/tail reads', async () => fixture(async ({ source, audit }) => {
  const small = Buffer.from('synthetic private Java warning\n');
  await writeFile(join(source, 'logs/tron.log'), small, { mode: 0o600 });
  const file = await open(join(source, 'logs/db/db.log'), 'wx', 0o600);
  const size = 32 * 1024 * 1024, edge = 512 * 1024;
  try {
    await file.truncate(size);
    await file.write(Buffer.alloc(edge, 65), 0, edge, 0);
    await file.write(Buffer.alloc(edge, 90), 0, edge, size - edge);
  } finally { await file.close(); }
  const result = await captureTronCandidateDiskLogs(source, audit);
  assert.equal(result.limitPerFile, 1024 * 1024);
  assert.deepEqual(await readFile(join(audit, 'tron-log-private.bin')), small);
  assert.equal(result.files[0].truncated, false);
  const retained = await readFile(join(audit, 'tron-db-log-private.bin'));
  assert.equal(retained.length, 1024 * 1024);
  assert.ok(retained.subarray(0, edge).every(value => value === 65));
  assert.ok(retained.subarray(edge).every(value => value === 90));
  assert.equal(result.files[1].sourceBytes, size);
  assert.equal(result.files[1].tailOffset, size - edge);
  assert.equal(result.files[1].omittedBytes, size - retained.length);
  assert.equal(result.files[1].truncated, true);
  assert.equal((await lstat(join(audit, 'tron-db-log-private.bin'))).mode & 0o777, 0o600);
}));

test('absent disk logs remain explicit and symlinked source files are refused', async () => fixture(async ({ root, source, audit }) => {
  const absent = await captureTronCandidateDiskLogs(source, audit);
  assert.deepEqual(absent.files, [{ source: 'logs/tron.log', present: false }, { source: 'logs/db/db.log', present: false }]);
  await writeFile(join(root, 'outside'), 'synthetic');
  await symlink(join(root, 'outside'), join(source, 'logs/tron.log'));
  await assert.rejects(captureTronCandidateDiskLogs(source, audit), error => error.code === 'ELOOP');
}));

test('parent directory symlinks and overwriting retained diagnostics are refused', async () => fixture(async ({ root, source, audit }) => {
  await writeFile(join(source, 'logs/tron.log'), 'synthetic');
  await captureTronCandidateDiskLogs(source, audit);
  await assert.rejects(captureTronCandidateDiskLogs(source, audit), error => error.code === 'EEXIST');
  await rm(join(source, 'logs'), { recursive: true });
  await mkdir(join(root, 'outside'));
  await symlink(join(root, 'outside'), join(source, 'logs'));
  await assert.rejects(captureTronCandidateDiskLogs(source, audit), /NO_PARENT_SYMLINK/);
}));
