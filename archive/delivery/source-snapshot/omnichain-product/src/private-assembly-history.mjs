/** PC18 accepted-root-history encoding and host consistency checks.
 * Public data helpers only: no host check authenticates funding, a historical
 * acceptance decision, a recursive proof, or permission for native dispatch.
 * The deployed pool and block-pinned reads are the authority for the history.
 */
import { createHash } from 'node:crypto';
import { PRIVATE_NOTE_CAPACITY, PrivateNoteTree, ZERO_NOTE_HASH } from './private-note-tree.mjs';

export const PRIVATE_ROOT_HISTORY_CAPACITY = PRIVATE_NOTE_CAPACITY + 1;
export const PRIVATE_ROOT_HISTORY_FRAME_BYTES = 1 + 32 + 4 + PRIVATE_ROOT_HISTORY_CAPACITY * 32;
export const PRIVATE_EMPTY_NOTE_ROOT = new PrivateNoteTree().root;

function need(condition, code) { if (!condition) throw new Error(code); }
function hashBytes(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    need(value.length === 32, 'PC18_HISTORY_HASH_WIDTH');
    return Buffer.from(value);
  }
  need(typeof value === 'string' && /^(?:0x)?[0-9a-f]{64}$/.test(value), 'PC18_HISTORY_HASH_ENCODING');
  return Buffer.from(value.startsWith('0x') ? value.slice(2) : value, 'hex');
}
function digest(value) { return `0x${hashBytes(value).toString('hex')}`; }
function count(value, maximum, label) {
  if (typeof value === 'number') need(Number.isSafeInteger(value) && !Object.is(value, -0), `PC18_HISTORY_${label}_INTEGER`);
  else need(typeof value === 'bigint' || (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)), `PC18_HISTORY_${label}_INTEGER`);
  const n = BigInt(value);
  need(n >= 0n && n <= BigInt(maximum), `PC18_HISTORY_${label}_RANGE`);
  return Number(n);
}

/** Exact 2117-byte frame: 0x18 | scope32 | count:u32be | 65 x root32.
 * Accept either the exact live prefix or explicitly zero-padded entries.
 * Live roots are nonzero and unique, matching the recursive history relation;
 * the count, order and every padding byte are bound.
 */
export function privateRootHistoryFrame(scope, entries, liveCount = entries?.length) {
  need(Array.isArray(entries) && entries.length <= PRIVATE_ROOT_HISTORY_CAPACITY, 'PC18_HISTORY_CAPACITY');
  const n = count(liveCount, PRIVATE_ROOT_HISTORY_CAPACITY, 'COUNT');
  need(n >= 1 && n <= entries.length, 'PC18_HISTORY_COUNT');
  // Array.from visits sparse entries too, so a hole never becomes zero padding.
  const values = Array.from(entries, digest);
  need(values.slice(0, n).every(value => value !== ZERO_NOTE_HASH), 'PC18_HISTORY_ZERO_ENTRY');
  need(new Set(values.slice(0, n)).size === n, 'PC18_HISTORY_DUPLICATE');
  need(values.slice(n).every(value => value === ZERO_NOTE_HASH), 'PC18_HISTORY_PADDING');
  while (values.length < PRIVATE_ROOT_HISTORY_CAPACITY) values.push(ZERO_NOTE_HASH);
  const header = Buffer.alloc(37);
  header[0] = 0x18;
  hashBytes(scope).copy(header, 1);
  header.writeUInt32BE(n, 33);
  return Buffer.concat([header, ...values.map(hashBytes)]);
}

export function privateRootHistoryDigest(scope, entries, liveCount = entries?.length) {
  return `0x${createHash('sha256').update(privateRootHistoryFrame(scope, entries, liveCount)).digest('hex')}`;
}

// PC18-specific names for callers composing this history with recursive inputs.
export const privateAssemblyRootHistoryFrame = privateRootHistoryFrame;
export const privateAssemblyRootHistoryDigest = privateRootHistoryDigest;

/** Validate a public pool snapshot's complete fixed-width history. Intermediate
 * insertion-prefix roots cannot be inferred as accepted from current leaves:
 * only the authenticated history returned by the pool records that decision.
 */
export function assertPrivateRootHistory(state) {
  const fields = ['scope', 'root', 'leafCount', 'rootHistory', 'rootHistoryCount', 'rootHistoryDigest'];
  need(state && fields.every(field => Object.hasOwn(state, field)), 'PC18_HISTORY_FIELDS');
  need(Array.isArray(state.rootHistory) && state.rootHistory.length === PRIVATE_ROOT_HISTORY_CAPACITY, 'PC18_HISTORY_SNAPSHOT_WIDTH');
  const leaves = count(state.leafCount, PRIVATE_NOTE_CAPACITY, 'LEAVES');
  const n = count(state.rootHistoryCount, PRIVATE_ROOT_HISTORY_CAPACITY, 'COUNT');
  need(n >= 1 && n <= leaves + 1, 'PC18_HISTORY_LEAF_BOUND');
  const actual = privateRootHistoryDigest(state.scope, state.rootHistory, n);
  need(actual === digest(state.rootHistoryDigest), 'PC18_HISTORY_DIGEST');
  need(digest(state.rootHistory[0]) === PRIVATE_EMPTY_NOTE_ROOT, 'PC18_HISTORY_INITIAL_ROOT');
  need(digest(state.rootHistory[n - 1]) === digest(state.root), 'PC18_HISTORY_CURRENT_ROOT');
  return { count: n, remaining: PRIVATE_ROOT_HISTORY_CAPACITY - n, digest: actual };
}
