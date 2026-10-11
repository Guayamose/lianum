/** Account journal shape and known lifecycle labels; no account authority. */
import { record, validId } from './values.mjs';

export const accountKinds = ['TOP_UP', 'EXIT', 'GRAPH'];

const accountStates = ['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'];

export const reconcileStates = ['SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'];

export function validAccountSnapshot(value) {
  if (!record(value) || value.version !== 1 || value.profile !== 'LOCAL_FLAT_ACCOUNT_API_V1'
    || !['READY', 'UNAVAILABLE', 'CLOSED'].includes(value.phase) || typeof value.available !== 'boolean'
    || typeof value.busy !== 'boolean' || !Number.isSafeInteger(value.queued) || value.queued < 0
    || typeof value.storageAvailable !== 'boolean' || !['CURRENT', 'STALE'].includes(value.observation)
    || !(value.revision === null || Number.isSafeInteger(value.revision) && value.revision >= 0)
    || !Array.isArray(value.requests) || value.requests.length > 128
    || !Array.isArray(value.admissions) || value.admissions.length > 32) return false;
  const ids = new Set();
  for (const row of value.requests) {
    if (!record(row) || !validId(row.requestId) || ids.has(row.requestId) || ![...accountKinds, 'GRAPH'].includes(row.kind)
      || !accountStates.includes(row.state) || !(row.errorCode === null || typeof row.errorCode === 'string')) return false;
    ids.add(row.requestId);
  }
  return true;
}

export function journalReady(snapshot) {
  return snapshot?.phase === 'READY' && snapshot.storageAvailable === true && snapshot.busy === false && snapshot.queued === 0;
}
