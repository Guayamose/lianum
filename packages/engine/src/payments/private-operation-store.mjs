/**
 * Durable, non-secret private-wallet operation journal. The caller must enforce
 * its safe operation/request schema: never persist secret keys, proofs, witnesses
 * or native receipts here. This module validates the structural JSON envelope.
 *
 * Supply a trusted local directory, not a request-supplied path. Cooperative
 * writers use an exclusive lock; the directory and OS account must be trusted.
 * This is not a hostile-filesystem, network-filesystem or rollback defense.
 * Stale locks fail closed and require explicit administrative recovery. Orphan
 * temporary files are never read, promoted or removed by initialization.
 *
 * Write ordering: exclusive lock -> unique 0600 temporary -> file fsync -> rename
 * -> directory fsync -> release owned lock. Windows directory fsync is unavailable
 * through portable Node APIs; mode bits do not configure Windows ACLs.
 * PRIVATE_STORE_WRITE_UNCERTAIN means rename was attempted, or later durability /
 * lock cleanup failed. Reread the committed journal and reconcile; never execute
 * or retry an external action automatically on that error. There is no cache that
 * could accidentally adopt a failed temporary write or hide a committed rename.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, parse, join, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { canonical } from '../crypto/privacy.mjs';

export const MAX_OPERATIONS = 32;
export const MAX_REQUESTS = 128;
export const MAX_FILE_BYTES = 512 * 1024;
const MAX_LOCK_BYTES = 1024;

function problem(code, message, cause) {
  return Object.assign(new Error(`${code}: ${message}`, cause ? { cause } : undefined), { code });
}

function failure(error) {
  return typeof error?.code === 'string' && error.code.startsWith('PRIVATE_STORE_')
    ? error : problem('PRIVATE_STORE_IO', 'Local journal filesystem operation failed', error);
}

function sameFile(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino;
}

async function directoryPath(directory, create = false) {
  const root = parse(directory).root;
  let current = root;
  for (const part of directory.slice(root.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    let metadata;
    try { metadata = await fs.lstat(current); }
    catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      let created = false;
      try { await fs.mkdir(current, { mode: 0o700 }); created = true; }
      catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
      metadata = await fs.lstat(current);
      // Persist the newly created directory entry in its parent as well as the
      // journal entry later persisted in the leaf directory.
      if (created) await syncDirectory(current);
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Journal directory components must be real directories');
    }
  }
}

async function boundedRead(path, maximum) {
  const metadata = await fs.lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Expected a single-link regular local journal file');
  }
  if (metadata.size > maximum) throw problem('PRIVATE_STORE_SIZE', 'Journal file exceeds byte limit');
  const handle = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || !sameFile(stat, metadata)) {
      throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Journal file identity or type changed');
    }
    if (stat.size > maximum) throw problem('PRIVATE_STORE_SIZE', 'Journal file exceeds byte limit');
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximum) throw problem('PRIVATE_STORE_SIZE', 'Journal file exceeds byte limit');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)); }
    catch (error) { throw problem('PRIVATE_STORE_RECORD', 'Journal contains invalid UTF-8', error); }
  } finally { await handle.close(); }
}

function snapshot(value) {
  let serialized;
  try { serialized = canonical(value); }
  catch (error) {
    throw problem(error instanceof RangeError ? 'PRIVATE_STORE_SIZE' : 'PRIVATE_STORE_RECORD',
      'Journal must contain bounded ordinary canonical JSON', error);
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) {
    throw problem('PRIVATE_STORE_SIZE', 'Journal exceeds byte limit');
  }
  const record = JSON.parse(serialized);
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).sort().join(',') !== 'operations,requests,revision,version' ||
      record.version !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 0 ||
      !Array.isArray(record.operations) || !Array.isArray(record.requests)) {
    throw problem('PRIVATE_STORE_RECORD', 'Invalid journal root schema, version or revision');
  }
  if (record.operations.length > MAX_OPERATIONS) {
    throw problem('PRIVATE_STORE_OPERATIONS_LIMIT', 'Operation limit reached; no records were discarded');
  }
  if (record.requests.length > MAX_REQUESTS) {
    throw problem('PRIVATE_STORE_REQUESTS_LIMIT', 'Idempotency request limit reached; no records were discarded');
  }
  return { record, serialized };
}

async function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const handle = await fs.open(dirname(path), 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export class PrivateOperationStore {
  constructor(directory) {
    if (typeof directory !== 'string' || directory.length === 0 || directory.includes('\0')) {
      throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Directory must be a nonempty local path');
    }
    this.directory = resolve(directory);
    this.path = join(this.directory, 'private-operations.json');
    this.lockPath = `${this.path}.lock`;
    Object.freeze(this);
  }

  async #verifyLock(context) {
    try {
      const stat = await fs.lstat(this.lockPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !sameFile(stat, context.identity)) {
        throw new Error('Lock file identity changed');
      }
      if (context.initialized) {
        const lock = JSON.parse(await boundedRead(this.lockPath, MAX_LOCK_BYTES));
        if (lock.version !== 1 || lock.pid !== process.pid || lock.token !== context.token) {
          throw new Error('Lock token changed');
        }
      }
    } catch (error) {
      throw problem('PRIVATE_STORE_LOCK_OWNERSHIP', 'Lock ownership changed; refusing to remove or commit through it', error);
    }
  }

  async #locked(work) {
    await directoryPath(this.directory);
    const context = { token: randomBytes(32).toString('hex'), initialized: false, renameAttempted: false };
    let handle;
    try { handle = await fs.open(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') {
        let stat;
        try { stat = await fs.lstat(this.lockPath); }
        catch (statError) { if (statError.code !== 'ENOENT') throw statError; }
        // Another cooperative writer may release its lock between our failed
        // exclusive open and inspection. That remains a normal lock conflict.
        if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) {
          throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Lock path must be a regular local file');
        }
        throw problem('PRIVATE_STORE_LOCKED', 'Journal is locked; stale locks require explicit recovery');
      }
      throw error;
    }
    let result;
    let error;
    try {
      context.identity = await handle.stat();
      await handle.writeFile(JSON.stringify({ version: 1, pid: process.pid, token: context.token }), 'utf8');
      await handle.sync();
      context.initialized = true;
      await handle.close();
      handle = undefined;
      result = await work(context);
    } catch (caught) { error = caught; }
    try {
      try { await handle?.close(); }
      finally {
        await this.#verifyLock(context);
        await fs.unlink(this.lockPath);
      }
    } catch (cleanupError) {
      if (!error) error = cleanupError;
      else error = problem(cleanupError.code ?? 'PRIVATE_STORE_IO', 'Journal failed and owned-lock cleanup could not be completed', error);
    }
    if (error) {
      if (context.renameAttempted) {
        throw problem('PRIVATE_STORE_WRITE_UNCERTAIN', 'Write may have committed; reread and reconcile before further action', error);
      }
      throw failure(error);
    }
    return result;
  }

  async #persist(serialized, context) {
    await this.#verifyLock(context);
    // A fixed, caller-independent target is checked again immediately before
    // replacement. Cooperative writers cannot replace it without holding lock.
    try {
      const target = await fs.lstat(this.path);
      if (!target.isFile() || target.isSymbolicLink() || target.nlink !== 1) {
        throw problem('PRIVATE_STORE_UNSAFE_PATH', 'Journal target must be a regular local file');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = `${this.path}.tmp-${randomBytes(16).toString('hex')}`;
    let handle;
    let identity;
    let created = false;
    let error;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      created = true;
      identity = await handle.stat();
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.#verifyLock(context);
      context.renameAttempted = true;
      await fs.rename(temporary, this.path);
      created = false;
      await syncDirectory(this.path);
    } catch (caught) { error = caught; }
    try {
      try { await handle?.close(); }
      finally {
        if (created) {
          let current;
          try { current = await fs.lstat(temporary); }
          catch (caught) { if (caught.code !== 'ENOENT') throw caught; }
          if (current) {
            if (!current.isFile() || current.isSymbolicLink() || !sameFile(identity, current)) {
              throw problem('PRIVATE_STORE_TEMP_OWNERSHIP', 'Temporary file ownership changed; refusing to remove it');
            }
            await fs.unlink(temporary);
          }
        }
      }
    } catch (cleanupError) { if (!error) error = cleanupError; }
    if (error) throw error;
  }

  /** Create once or load the committed record; an existing file is never reset. */
  async initialize() {
    try {
      await directoryPath(this.directory, true);
      return await this.#locked(async (context) => {
        try { return await this.read(); }
        catch (error) { if (error.code !== 'PRIVATE_STORE_NOT_FOUND') throw error; }
        const { record, serialized } = snapshot({ version: 1, revision: 0, operations: [], requests: [] });
        await this.#persist(serialized, context);
        return record;
      });
    } catch (error) { throw failure(error); }
  }

  /** Always reread committed bytes; returned data has no shared mutable state. */
  async read() {
    try {
      await directoryPath(this.directory);
      const serialized = await boundedRead(this.path, MAX_FILE_BYTES);
      let value;
      try { value = JSON.parse(serialized); }
      catch (error) { throw problem('PRIVATE_STORE_RECORD', 'Journal JSON is malformed or truncated', error); }
      return snapshot(value).record;
    } catch (error) {
      if (error.code === 'ENOENT') throw problem('PRIVATE_STORE_NOT_FOUND', 'Committed journal does not exist', error);
      throw failure(error);
    }
  }

  /**
   * transform receives a deep copy of the full record and returns a full record.
   * It must be synchronous and preserve version/revision; this method advances
   * revision. It can replace operations/requests but no automatic eviction occurs.
   */
  async update(expectedRevision, transform) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw problem('PRIVATE_STORE_REVISION', 'Expected revision must be a nonnegative safe integer');
    }
    if (typeof transform !== 'function' || types.isAsyncFunction(transform)) {
      throw problem('PRIVATE_STORE_TRANSFORM', 'Journal transform must be synchronous');
    }
    try {
      return await this.#locked(async (context) => {
        const current = await this.read();
        if (current.revision !== expectedRevision) throw problem('PRIVATE_STORE_CONFLICT', 'Journal revision conflict');
        if (current.revision === Number.MAX_SAFE_INTEGER) throw problem('PRIVATE_STORE_REVISION_LIMIT', 'Journal revision exhausted');
        let result;
        try { result = transform(snapshot(current).record); }
        catch (error) { throw problem('PRIVATE_STORE_TRANSFORM', 'Journal transform failed', error); }
        if (types.isPromise(result)) {
          result.catch(() => {});
          throw problem('PRIVATE_STORE_TRANSFORM', 'Journal transform must return synchronous JSON');
        }
        const candidate = snapshot(result).record;
        if (candidate.version !== current.version || candidate.revision !== current.revision) {
          throw problem('PRIVATE_STORE_REVISION', 'Transform must preserve the current version and revision');
        }
        const { record, serialized } = snapshot({ ...candidate, revision: current.revision + 1 });
        await this.#persist(serialized, context);
        return record;
      });
    } catch (error) { throw failure(error); }
  }
}
