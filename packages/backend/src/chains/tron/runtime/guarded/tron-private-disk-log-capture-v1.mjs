/** Read-only bounded private diagnostics. No native authority or protocol data
 * is accepted here. Only fixed original Logback files under owned scratch. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const LIMIT = 1024 * 1024, HALF = LIMIT / 2;
const FILES = Object.freeze(['logs/tron.log', 'logs/db/db.log']);
const sha = value => createHash('sha256').update(value).digest('hex');
const absent = error => error.code === 'ENOENT';

async function exactRead(handle, count, position) {
  const bytes = Buffer.alloc(count);
  let offset = 0;
  while (offset < count) {
    const value = await handle.read(bytes, offset, count - offset, position + offset);
    assert.ok(value.bytesRead > 0, 'TRON_CANDIDATE_DISK_LOG_SHORT_READ');
    offset += value.bytesRead;
  }
  return bytes;
}

export async function captureTronCandidateDiskLogs(directory, audit) {
  assert.equal(arguments.length, 2, 'TRON_CANDIDATE_DISK_LOG_NO_OPTIONS');
  assert.equal(await realpath(directory), directory, 'TRON_CANDIDATE_DISK_LOG_OWNED_DIRECTORY');
  assert.equal(await realpath(audit), audit, 'TRON_CANDIDATE_DISK_LOG_AUDIT_DIRECTORY');
  const rows = [];
  for (const name of FILES) {
    const path = join(directory, name);
    let source;
    try {
      assert.equal(await realpath(dirname(path)), dirname(path), 'TRON_CANDIDATE_DISK_LOG_NO_PARENT_SYMLINK');
      source = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if (!absent(error)) throw error;
      rows.push({ source: name, present: false }); continue;
    }
    try {
      const before = await source.stat();
      assert.ok(before.isFile() && before.uid === process.getuid(), 'TRON_CANDIDATE_DISK_LOG_ORIGINAL_FILE');
      assert.ok(Number.isSafeInteger(before.size) && before.size >= 0, 'TRON_CANDIDATE_DISK_LOG_SIZE');
      const truncated = before.size > LIMIT;
      const prefix = await exactRead(source, truncated ? HALF : before.size, 0);
      const tailOffset = truncated ? before.size - HALF : before.size;
      const tail = truncated ? await exactRead(source, HALF, tailOffset) : Buffer.alloc(0);
      const after = await source.stat();
      assert.equal(after.dev, before.dev); assert.equal(after.ino, before.ino);
      assert.equal(after.size, before.size, 'TRON_CANDIDATE_DISK_LOG_CHANGED_AFTER_EXIT');
      assert.equal(after.mtimeMs, before.mtimeMs, 'TRON_CANDIDATE_DISK_LOG_CHANGED_AFTER_EXIT');
      const bytes = Buffer.concat([prefix, tail]);
      const retained = name === 'logs/tron.log' ? 'tron-log-private.bin' : 'tron-db-log-private.bin';
      const destination = await open(join(audit, retained), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      try { await destination.writeFile(bytes); await destination.sync(); } finally { await destination.close(); }
      rows.push({ source: name, present: true, retainedPrivate: retained, sourceBytes: before.size,
        retainedBytes: bytes.length, truncated, prefixBytes: prefix.length, tailBytes: tail.length,
        tailOffset, omittedBytes: before.size - bytes.length, sha256: sha(bytes),
        prefixSHA256: sha(prefix), tailSHA256: sha(tail) });
    } finally { await source.close(); }
  }
  return { format: 'LIANUM_TRON_PRIVATE_DISK_LOG_CAPTURE_V1', limitPerFile: LIMIT,
    originalNativeChildAlreadyExitedRequired: true, files: rows };
}
