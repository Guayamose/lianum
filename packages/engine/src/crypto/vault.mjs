/**
 * Cooperative single-writer encrypted local store. The containing directory and
 * OS account must be trusted; do not put it on a network/sync filesystem. A lock
 * serializes participating writers, not hostile processes or filesystem admins.
 *
 * Durability: fsync encrypted temp -> close -> rename over destination -> fsync
 * directory where supported. Windows does not expose portable directory fsync
 * through Node; ACLs, filesystem semantics and power-loss behavior remain OS
 * assumptions. mode 0600 is not a Windows ACL configuration. No promise of secure
 * deletion, strong key zeroization, rollback resistance or Byzantine concurrency.
 * An error after rename may mean the update committed: re-read the revision.
 *
 * Stale locks deliberately fail closed. Recovery is an explicit administrator
 * action only after confirming every writer is stopped: preserve the current
 * vault/lock for diagnosis, remove that exact lock, authenticate the current
 * vault, and reconcile state before resuming. Orphan encrypted *.tmp-* files are
 * never adopted, and must not be treated as committed recovery snapshots.
 */
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { canonical, encryptJsonAsync, decryptJsonAsync } from './privacy.mjs';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function problem(code, message) {
  return Object.assign(new Error(message), { code });
}

async function boundedRead(path, maximum) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw problem('VAULT_UNSAFE_PATH', 'Expected a regular local file');
  // lstat/open is not a defense against hostile directory replacement. The caller
  // must supply an exclusively controlled directory as stated in this module.
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum) throw problem('VAULT_SIZE', 'Vault file exceeds size limit');
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maximum) throw problem('VAULT_SIZE', 'Vault file exceeds size limit');
    return buffer.subarray(0, offset).toString('utf8');
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path) {
  // Node cannot portably open/fsync Windows directory handles. File fsync still
  // occurs before rename; do not relabel it as proven power-loss durability.
  if (process.platform === 'win32') return;
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

export class Vault {
  constructor(path) {
    if (typeof path !== 'string' || path.length === 0 || path.includes('\0')) throw new TypeError('Vault path must be a nonempty string');
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
    Object.freeze(this);
  }

  async _locked(work) {
    const token = randomBytes(32).toString('hex');
    let lock;
    try { lock = await open(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw problem('VAULT_LOCKED', 'Vault is locked; stale locks require explicit recovery');
      throw error;
    }
    let initialized = false;
    try {
      await lock.writeFile(JSON.stringify({ version: 1, pid: process.pid, token }), 'utf8');
      await lock.sync();
      initialized = true;
      await lock.close();
      lock = undefined;
      return await work();
    } finally {
      await lock?.close();
      if (initialized) {
        const current = JSON.parse(await boundedRead(this.lockPath, 1024));
        if (current.token !== token) throw problem('VAULT_LOCK_OWNERSHIP', 'Lock ownership changed; refusing to remove it');
      }
      // An incomplete lock written by this call can also be removed safely under
      // the exclusive-directory assumption. No unrelated/stale lock is removed.
      await unlink(this.lockPath);
    }
  }

  async _write(record, password) {
    const envelope = await encryptJsonAsync(record, password);
    const serialized = JSON.stringify(envelope);
    const temporary = `${this.path}.tmp-${randomBytes(16).toString('hex')}`;
    let handle;
    let created = false;
    try {
      handle = await open(temporary, 'wx', 0o600);
      created = true;
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, this.path);
      created = false;
      await syncDirectory(this.path);
    } finally {
      try { await handle?.close(); }
      finally { if (created) await unlink(temporary); }
    }
  }

  async create(initial, password) {
    // Snapshot caller-owned data before the first asynchronous boundary.
    const data = JSON.parse(canonical(initial));
    return this._locked(async () => {
      try {
        await lstat(this.path);
        throw problem('VAULT_EXISTS', 'Vault already exists');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const record = { revision: 0, data };
      await this._write(record, password);
      return record;
    });
  }

  async read(password) {
    const serialized = await boundedRead(this.path, MAX_FILE_BYTES);
    const record = await decryptJsonAsync(JSON.parse(serialized), password);
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).sort().join(',') !== 'data,revision' ||
        !Number.isSafeInteger(record.revision) || record.revision < 0) {
      throw problem('VAULT_RECORD', 'Invalid authenticated vault record');
    }
    return record;
  }

  async update(password, expectedRevision, transform) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('Invalid expected revision');
    if (typeof transform !== 'function' || types.isAsyncFunction(transform)) throw new TypeError('Vault transform must be synchronous');
    return this._locked(async () => {
      const current = await this.read(password);
      if (current.revision !== expectedRevision) throw problem('VAULT_CONFLICT', 'Vault revision conflict');
      if (current.revision === Number.MAX_SAFE_INTEGER) throw problem('VAULT_REVISION_LIMIT', 'Vault revision exhausted');
      const result = transform(current.data);
      if (types.isPromise(result)) {
        // Consume a possible rejection without adopting an asynchronous update.
        result.catch(() => {});
        throw new TypeError('Vault transform must return synchronous JSON');
      }
      const record = { revision: current.revision + 1, data: JSON.parse(canonical(result)) };
      await this._write(record, password);
      return record;
    });
  }
}
