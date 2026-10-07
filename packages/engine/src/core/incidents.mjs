/** Bounded encrypted incident sink for effects not integrated into wallet state.
 * A directory that remains durably present freezes admissions/dispatch/settlement
 * after SDK restart. Creating it is not proof against filesystem failure or power
 * loss; if creation fails there is no promised persistent marker. Nothing is
 * automatically deleted or marked reconciled. A trusted
 * owner-only directory is required, as for Vault. Windows directory fsync and
 * power-loss durability have the same limitations documented in vault.mjs.
 * Free disk, writable filesystem and a replayable producer remain assumptions.
 * Deterministic evidence filenames leak repeat correlation to filesystem metadata
 * readers; the OS/directory are trusted and no public unlinkability is claimed.
 */
import { mkdirSync, lstatSync } from 'node:fs';
import { open, readdir, unlink, link, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { canonical, encryptJson, decryptJson, digest } from '../crypto/privacy.mjs';

const MAX_ENTRIES = 128;
const MAX_INCIDENT_BYTES = 16 * 1024;
const ENTRY = /^[0-9a-f]{64}\.json$/;
function failure(code, message, cause) { return Object.assign(new Error(message, cause ? { cause } : undefined), { code }); }
function directoryFor(vaultPath) {
  if (typeof vaultPath !== 'string' || !vaultPath || vaultPath.includes('\0')) throw new TypeError('Invalid incident vault path');
  return `${resolve(vaultPath)}.incidents`;
}
function checkDirectory(directory) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('OBSERVATION_NOT_PERSISTED', 'Incident directory is not a trusted regular directory');
}

function evidenceIdentity(incident) {
  if (incident.kind === 'invalidation' && incident.evidence?.payload && incident.evidence?.predecessor?.payload) {
    return digest('PAEG/incident-evidence-identity/1', { kind: 'invalidation', hash: incident.hash,
      payload: incident.evidence.payload, predecessor: incident.evidence.predecessor.payload });
  }
  if (incident.receipt?.payload) {
    return digest('PAEG/incident-evidence-identity/1', { kind: 'receipt', hash: incident.hash, payload: incident.receipt.payload });
  }
  return null;
}

/** Call synchronously inside the vault transform when capacity rejects an
 * already authenticated observation, before releasing its writer lock. */
export function freezeForIncident(vaultPath) {
  const directory = directoryFor(vaultPath);
  try {
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    checkDirectory(directory);
    return directory;
  } catch (error) { throw failure('OBSERVATION_NOT_PERSISTED', 'Cannot persist observation freeze; stop dispatch and retain the observation at its producer', error); }
}

/** Synchronous by design: use inside the serialized Vault transform to prevent
 * a check-before-lock race with observation quarantine. Awaiting it also works. */
export function assertNoIncidents(vaultPath) {
  const directory = directoryFor(vaultPath);
  try { lstatSync(directory); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw failure('STORAGE_FROZEN', 'Cannot verify the incident freeze state', error);
  }
  throw failure('STORAGE_FROZEN', 'Unintegrated observation freeze persists; admissions, dispatch and settlement require explicit reconciliation');
}

async function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function incidentSummary(vaultPath) {
  const directory = directoryFor(vaultPath);
  try { checkDirectory(directory); }
  catch (error) {
    if (error.code === 'ENOENT') return { frozen: false, count: 0, pendingCount: 0 };
    throw failure('STORAGE_FROZEN', 'Incident directory cannot be inspected safely', error);
  }
  const entries = await readdir(directory, { withFileTypes: true });
  return { frozen: true, count: entries.filter((entry) => entry.isFile() && ENTRY.test(entry.name)).length, pendingCount: entries.filter((entry) => entry.name.endsWith('.tmp')).length };
}

export async function persistIncident(vaultPath, password, incident) {
  const directory = freezeForIncident(vaultPath);
  const identity = evidenceIdentity(incident);
  const id = identity ?? randomBytes(32).toString('hex');
  const temporary = `${directory}/${id}.tmp`;
  const destination = `${directory}/${id}.json`;
  const lockPath = `${directory}/.append.lock`;
  let lock, handle;
  let temporaryCreated = false;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    if (identity) {
      let existing;
      try { existing = await lstat(destination); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink() || existing.size > 32 * 1024) throw failure('OBSERVATION_NOT_PERSISTED', 'Existing incident entry cannot be safely authenticated');
        const priorHandle = await open(destination, 'r');
        let bytes;
        try {
          const buffer = Buffer.alloc(32 * 1024 + 1);
          let offset = 0;
          while (offset < buffer.length) {
            const { bytesRead } = await priorHandle.read(buffer, offset, buffer.length - offset, offset);
            if (!bytesRead) break;
            offset += bytesRead;
          }
          if (offset > 32 * 1024) throw failure('OBSERVATION_NOT_PERSISTED', 'Existing incident exceeds bounds');
          bytes = buffer.subarray(0, offset);
        } finally { await priorHandle.close(); }
        const prior = decryptJson(JSON.parse(bytes.toString('utf8')), password);
        if (prior.id !== id || evidenceIdentity(prior.incident) !== identity) {
          throw failure('OBSERVATION_NOT_PERSISTED', 'Existing incident identity does not authenticate this evidence');
        }
        return { recorded: true, integrated: false, frozen: true, incidentId: id, duplicate: true };
      }
    }
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.filter((entry) => ENTRY.test(entry.name) || entry.name.endsWith('.tmp')).length >= MAX_ENTRIES) {
      throw failure('OBSERVATION_NOT_PERSISTED', 'Encrypted incident sink is full; producer must retain/replay the observation');
    }
    const record = { version: 1, kind: 'unintegrated-observation', id, recordedAt: Date.now(), incident };
    const plaintext = canonical(record);
    if (Buffer.byteLength(plaintext) > MAX_INCIDENT_BYTES) throw failure('OBSERVATION_NOT_PERSISTED', 'Observation exceeds incident entry capacity');
    const encrypted = JSON.stringify(encryptJson(record, password));
    handle = await open(temporary, 'wx', 0o600);
    temporaryCreated = true;
    await handle.writeFile(encrypted, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    // Hard-link publication cannot overwrite a preexisting immutable entry. The
    // unique temporary and destination are within this one trusted directory.
    await link(temporary, destination);
    await syncDirectory(directory);
    await syncDirectory(dirname(directory));
    return { recorded: true, integrated: false, frozen: true, incidentId: id };
  } catch (error) {
    throw failure('OBSERVATION_NOT_PERSISTED', 'Observation was not acknowledged as durably recorded; admissions remain frozen and the producer must retain/replay it', error);
  } finally {
    let cleanupError;
    try { await handle?.close(); } catch (error) { cleanupError = error; }
    try { if (temporaryCreated) await unlink(temporary); } catch (error) { cleanupError ??= error; }
    if (lock) {
      try { await lock.close(); } catch (error) { cleanupError ??= error; }
      try { await unlink(lockPath); } catch (error) { cleanupError ??= error; }
    }
    if (cleanupError) throw failure('OBSERVATION_NOT_PERSISTED', 'Incident publication/cleanup outcome needs explicit inspection; producer must retain the observation', cleanupError);
  }
}
