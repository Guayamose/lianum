/** Canonical public-state bytes for the bounded generic native protocol.
 * Pure codecs and witness preparation only: these functions do not authenticate
 * a state read, establish native consensus, or authorize a transition. The hub
 * and consuming relations must bind digests and current sequences themselves.
 * All external byte strings are lower-case, fixed-width, 0x-prefixed hex. Every
 * external integer (including counts, indexes and halt) is a decimal string.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const NATIVE_STATE_CAPACITY = 64;
export const NATIVE_STATE_TREE_DEPTH = 6;
export const NATIVE_STATE_ZERO = `0x${'00'.repeat(32)}`;
export const NATIVE_STATE_PREFIX = Object.freeze({ poolSpent: 0x02, spentTag: 0x31, revoked: 0x32 });
export const NATIVE_STATE_TAG = Object.freeze({ evidence: 'LIANUM/PAEG/evidence-state/2', snapshot: 'LIANUM/PAEG/checkpoint/2' });

// Tuple: external field, Noir field, byte width, optional integer maximum.
const EVIDENCE_SPEC = [
  ['hubDomain', 'hub_domain', 32], ['registryCommitment', 'registry_commitment', 32],
  ['receiptRoot', 'receipt_root', 32], ['receiptCount', 'receipt_count', 4, 64n],
  ['revokedDigest', 'revoked_digest', 32], ['revokedCount', 'revoked_count', 4, 64n],
  ['revocationSequence', 'revocation_sequence', 8, (1n << 64n) - 1n],
];
const SNAPSHOT_SPEC = [
  ['hubDomain', 'hub_domain', 32], ['registryCommitment', 'registry_commitment', 32],
  ['pool', 'pool', 20], ['scope', 'scope', 32], ['policy', 'policy', 32],
  ['assetIdentity', 'asset_identity', 32], ['poolRoot', 'pool_root', 32],
  ['poolSpentDigest', 'pool_spent_digest', 32], ['poolSpentCount', 'pool_spent_count', 4, 64n],
  ['poolStateSequence', 'pool_state_sequence', 8, (1n << 64n) - 1n],
  ['receiptRoot', 'receipt_root', 32], ['receiptCount', 'receipt_count', 4, 64n],
  ['spentTagDigest', 'spent_tag_digest', 32], ['spentTagCount', 'spent_tag_count', 4, 64n],
  ['spentTagSequence', 'spent_tag_sequence', 8, (1n << 64n) - 1n],
  ['revokedDigest', 'revoked_digest', 32], ['revokedCount', 'revoked_count', 4, 64n],
  ['revocationSequence', 'revocation_sequence', 8, (1n << 64n) - 1n],
  ['hubStateSequence', 'hub_state_sequence', 8, (1n << 64n) - 1n],
  ['registryEpoch', 'registry_epoch', 8, (1n << 64n) - 1n],
  ['halt', 'halt', 1, 1n], ['timestamp', 'timestamp', 8, (1n << 64n) - 1n],
];
export const EVIDENCE_STATE_FIELDS = Object.freeze(EVIDENCE_SPEC.map(([field]) => field));
export const SNAPSHOT_FIELDS = Object.freeze(SNAPSHOT_SPEC.map(([field]) => field));
export const NATIVE_STATE_PUBLIC_WORDS = Object.freeze({ evidence: 35, snapshot: 96 });

function exact(value, fields, label) {
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, `PAEG_STATE_${label}_FIELDS`);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...fields].sort(), `PAEG_STATE_${label}_FIELDS`);
}
function bytes(value, width = 32) {
  assert.equal(typeof value, 'string', 'PAEG_STATE_HEX');
  assert.match(value, new RegExp(`^0x[0-9a-f]{${width * 2}}$`), 'PAEG_STATE_HEX');
  return Buffer.from(value.slice(2), 'hex');
}
function integer(value, maximum, label = 'INTEGER') {
  assert.equal(typeof value, 'string', `PAEG_STATE_${label}`);
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), `PAEG_STATE_${label}`);
  const result = BigInt(value);
  assert.ok(result <= maximum, `PAEG_STATE_${label}_RANGE`);
  return result;
}
function uintBytes(value, width, maximum) {
  return Buffer.from(integer(value, maximum).toString(16).padStart(width * 2, '0'), 'hex');
}
function hash(frame) { return `0x${createHash('sha256').update(frame).digest('hex')}`; }
function fields(value, spec, label) {
  exact(value, spec.map(([field]) => field), label);
  return spec.map(([field, , width, maximum]) => maximum === undefined
    ? bytes(value[field], width) : uintBytes(value[field], width, maximum));
}
function framed(tag, values) {
  return Buffer.concat([Buffer.from(tag, 'utf8'), ...values].flatMap(value => {
    const size = Buffer.alloc(4); size.writeUInt32BE(value.length);
    return [size, value];
  }));
}
function words(value, spec, label) {
  const encoded = fields(value, spec, label);
  return encoded.flatMap((buffer, i) => spec[i][3] === undefined
    ? Array.from({ length: buffer.length / 4 }, (_, j) => buffer.readUInt32BE(j * 4).toString())
    : [value[spec[i][0]]]);
}
function toNoir(value, spec, label) {
  const encoded = fields(value, spec, label);
  return Object.fromEntries(spec.map(([field, noirField, , maximum], i) =>
    [noirField, maximum === undefined ? [...encoded[i]] : value[field]]));
}

/** H4: each component, including the tag, has its own u32BE byte length. */
export function evidenceStateFrame(state) { return framed(NATIVE_STATE_TAG.evidence, fields(state, EVIDENCE_SPEC, 'EVIDENCE')); }
export function evidenceStateDigest(state) { return hash(evidenceStateFrame(state)); }
export function evidenceStateWords(state) { return words(state, EVIDENCE_SPEC, 'EVIDENCE'); }
export function evidenceStateToNoir(state) { return toNoir(state, EVIDENCE_SPEC, 'EVIDENCE'); }
export function snapshotFrame(snapshot) { return framed(NATIVE_STATE_TAG.snapshot, fields(snapshot, SNAPSHOT_SPEC, 'SNAPSHOT')); }
export function snapshotDigest(snapshot) { return hash(snapshotFrame(snapshot)); }
export function snapshotWords(snapshot) { return words(snapshot, SNAPSHOT_SPEC, 'SNAPSHOT'); }
export function snapshotToNoir(snapshot) { return toNoir(snapshot, SNAPSHOT_SPEC, 'SNAPSHOT'); }

function list(prefix, domain, entries, count) {
  assert.ok(Object.values(NATIVE_STATE_PREFIX).includes(prefix), 'PAEG_STATE_LIST_PREFIX');
  bytes(domain);
  assert.ok(Array.isArray(entries) && entries.length <= NATIVE_STATE_CAPACITY, 'PAEG_STATE_LIST_CAPACITY');
  const liveCount = Number(integer(count, 64n, 'COUNT'));
  assert.ok(liveCount <= entries.length, 'PAEG_STATE_LIST_COUNT');
  // Array.from visits missing slots too; sparse arrays are never valid padding.
  const encoded = Array.from(entries, value => bytes(value));
  const live = entries.slice(0, liveCount);
  assert.ok(live.every(value => value !== NATIVE_STATE_ZERO), 'PAEG_STATE_LIST_ZERO_ENTRY');
  assert.equal(new Set(live).size, liveCount, 'PAEG_STATE_LIST_DUPLICATE');
  assert.ok(entries.slice(liveCount).every(value => value === NATIVE_STATE_ZERO), 'PAEG_STATE_LIST_PADDING');
  while (encoded.length < NATIVE_STATE_CAPACITY) encoded.push(Buffer.alloc(32));
  return encoded;
}
/** Exactly 2085 bytes. 0x02 retains the legacy pool-spent byte contract. */
export function boundedListFrame(prefix, domain, entries, count = String(entries?.length)) {
  const encoded = list(prefix, domain, entries, count);
  return Buffer.concat([Buffer.from([prefix]), bytes(domain), uintBytes(count, 4, 64n), ...encoded]);
}
export function boundedListDigest(prefix, domain, entries, count = String(entries?.length)) {
  return hash(boundedListFrame(prefix, domain, entries, count));
}
export function boundedListToNoir(prefix, domain, entries, count = String(entries?.length)) {
  return { prefix: String(prefix), domain: [...bytes(domain)], entries: list(prefix, domain, entries, count).map(value => [...value]), count };
}
/** Checks the entire canonical vector against a caller-supplied digest. The
 * caller must authenticate that digest; this helper never vouches for a read. */
export function assertAbsent(prefix, domain, entries, count, expectedDigest, target) {
  bytes(expectedDigest); bytes(target);
  assert.notEqual(target, NATIVE_STATE_ZERO, 'PAEG_STATE_ABSENT_ZERO');
  assert.equal(boundedListDigest(prefix, domain, entries, count), expectedDigest, 'PAEG_STATE_LIST_DIGEST');
  assert.ok(!entries.slice(0, Number(integer(count, 64n, 'COUNT'))).includes(target), 'PAEG_STATE_PRESENT');
}
/** SHA256(0x01 || left32 || right32), shared with PrivateNoteTree. */
export function nodeHash(left, right) { return hash(Buffer.concat([Buffer.from([1]), bytes(left), bytes(right)])); }
export function membership(commitment, siblings, index, root) {
  bytes(commitment); bytes(root);
  assert.notEqual(commitment, NATIVE_STATE_ZERO, 'PAEG_STATE_EMPTY_LEAF');
  assert.ok(Array.isArray(siblings) && siblings.length === NATIVE_STATE_TREE_DEPTH, 'PAEG_STATE_PATH_DEPTH');
  const position = Number(integer(index, 63n, 'INDEX'));
  let value = commitment;
  for (let level = 0; level < NATIVE_STATE_TREE_DEPTH; level++) {
    value = ((position >> level) & 1) === 0 ? nodeHash(value, siblings[level]) : nodeHash(siblings[level], value);
  }
  assert.equal(value, root, 'PAEG_STATE_MEMBERSHIP');
}

/** Full u32 words preserve all digest bits; no field reduction/truncation. */
export function nativeDigestWords(digest) {
  const value = bytes(digest);
  return Array.from({ length: 8 }, (_, i) => value.readUInt32BE(i * 4).toString());
}

/** Detached public byte/test vectors, never a verified-state object. */
export function nativeStateVectors(snapshot, evidenceState) {
  return {
    snapshot: { frame: `0x${snapshotFrame(snapshot).toString('hex')}`, digest: snapshotDigest(snapshot),
      words: snapshotWords(snapshot), noir: snapshotToNoir(snapshot) },
    evidenceState: { frame: `0x${evidenceStateFrame(evidenceState).toString('hex')}`, digest: evidenceStateDigest(evidenceState),
      words: evidenceStateWords(evidenceState), noir: evidenceStateToNoir(evidenceState) },
  };
}
