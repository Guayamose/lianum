/** Private filesystem mechanics for the lifetime registry. No capability,
 * runtime brand or recovery admission is created by this module. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, realpath, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const PROFILE = 'WRAPPED_FIXED_PRIVATE_LIFETIME_REGISTRY_V1';

/** @param {string} path */
export async function syncWrappedLifetimeDirectoryV1(path) {
  const fd = await open(path, 'r');
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}

/** @param {string} path */
export async function assertWrappedLifetimePrivateDirectoryV1(path) {
  const stat = await lstat(path);
  assert.ok(
    stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700,
    'WRAPPED_LIFETIME_PRIVATE_DIRECTORY',
  );
  assert.equal(await realpath(path), path);
  if (typeof process.getuid === 'function') assert.equal(stat.uid, process.getuid());
}

/** @param {string} path @param {number} maximum */
export async function readWrappedLifetimePrivateFileV1(path, maximum) {
  const stat = await lstat(path);
  assert.ok(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o600 &&
      stat.size <= maximum,
    'WRAPPED_LIFETIME_PRIVATE_FILE',
  );
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const current = await fd.stat();
    assert.equal(current.ino, stat.ino);
    assert.equal(current.dev, stat.dev);
    const bytes = await fd.readFile();
    assert.equal(bytes.length, stat.size);
    return bytes;
  } finally {
    await fd.close();
  }
}

/** The lease authenticates its own inode and original bytes before removal.
 * @param {string} directory @param {string} runId
 * @returns {Promise<() => Promise<void>>}
 */
export async function acquireWrappedLifetimeLeaseV1(directory, runId) {
  const path = join(directory, 'registry.active');
  const raw = JSON.stringify({
    profile: PROFILE,
    runId,
    pid: process.pid,
    nonce: randomBytes(32).toString('hex'),
  });
  const fd = await open(
    path,
    constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await fd.writeFile(raw);
    await fd.sync();
    await syncWrappedLifetimeDirectoryV1(directory);
  } catch (error) {
    await fd.close();
    throw error;
  }
  const original = await fd.stat();
  let released = false;
  return async () => {
    if (released) return;
    const current = await lstat(path);
    assert.equal(current.ino, original.ino);
    assert.equal(current.dev, original.dev);
    assert.equal((await readWrappedLifetimePrivateFileV1(path, 1024)).toString(), raw);
    await unlink(path);
    await syncWrappedLifetimeDirectoryV1(directory);
    released = true;
    await fd.close();
  };
}

/** Creates only a fresh key. The caller keeps ownership of admission and AEAD.
 * @param {string} directory
 */
export async function createWrappedLifetimeRootKeyV1(directory) {
  const key = randomBytes(32);
  try {
    const fd = await open(
      join(directory, 'local-root.secret'),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await fd.writeFile(key);
      await fd.sync();
    } finally {
      await fd.close();
    }
    await syncWrappedLifetimeDirectoryV1(directory);
  } finally {
    key.fill(0);
  }
}
