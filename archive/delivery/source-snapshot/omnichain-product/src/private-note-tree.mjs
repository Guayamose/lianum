/** Local PC15 bounded note-authority encoding and tree helpers.
 * These are host data/invariant helpers, never a substitute for proof checking.
 * Hashes returned here are full 32-byte lower-case 0x-prefixed hex strings.
 */
import { createHash } from 'node:crypto';

export const PRIVATE_NOTE_DEPTH = 6;
export const PRIVATE_NOTE_CAPACITY = 64;
export const PRIVATE_NOTE_EPOCH_SECONDS = 600;
export const ZERO_NOTE_HASH = `0x${'00'.repeat(32)}`;
export const PRIVATE_POOL_INPUT_WORDS = Object.freeze({ reserve: 34, fulfill: 65, refund: 41, withdraw: 39 });
const U32_MAX = (1n << 32n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const U256_MAX = (1n << 256n) - 1n;
function need(condition, code) { if (!condition) throw new Error(code); }
function hash(bytes) { return `0x${createHash('sha256').update(bytes).digest('hex')}`; }
function bytes(input, width, label = 'BYTES') {
  let result;
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) result = Buffer.from(input);
  else {
    need(typeof input === 'string' && /^(?:0x)?[0-9a-f]+$/.test(input), `PC15_${label}_ENCODING`);
    const raw = input.startsWith('0x') ? input.slice(2) : input;
    need(raw.length === width * 2, `PC15_${label}_WIDTH`);
    result = Buffer.from(raw, 'hex');
  }
  need(result.length === width, `PC15_${label}_WIDTH`);
  return result;
}
function digest(input) { return `0x${bytes(input, 32, 'HASH').toString('hex')}`; }
function uint(input, maximum, label) {
  if (typeof input === 'number') need(Number.isSafeInteger(input) && !Object.is(input, -0), `PC15_${label}_INTEGER`);
  else need(typeof input === 'bigint' || (typeof input === 'string' && /^(0|[1-9][0-9]*)$/.test(input)), `PC15_${label}_INTEGER`);
  const value = BigInt(input);
  need(value >= 0n && value <= maximum, `PC15_${label}_RANGE`);
  return value;
}
function count(input, label = 'COUNT') { return Number(uint(input, 64n, label)); }
function fixedUint(input, width, label) {
  const value = uint(input, (1n << BigInt(width * 8)) - 1n, label);
  return Buffer.from(value.toString(16).padStart(width * 2, '0'), 'hex');
}
function publicWord(input, maximum, label) {
  // Solidity ABI bytes32 words and prover decimal strings are both supported.
  const value = typeof input === 'string' && /^0x[0-9a-f]{64}$/.test(input) ? BigInt(input) : uint(input, maximum, label);
  need(value <= maximum, `PC15_${label}_RANGE`);
  return value;
}

/** SHA256(0x01 || left32 || right32), exactly 65 bytes. */
export function noteNodeHash(left, right) {
  return hash(Buffer.concat([Buffer.from([1]), bytes(left, 32, 'HASH'), bytes(right, 32, 'HASH')]));
}

/** SHA256(0x05 || chainId:u256be || address20 || deploymentDomain32). */
export function derivePrivatePoolScope(chainId, address, deploymentDomain) {
  return hash(Buffer.concat([Buffer.from([5]), fixedUint(chainId, 32, 'CHAIN_ID'), bytes(address, 20, 'ADDRESS'), bytes(deploymentDomain, 32, 'DOMAIN')]));
}

/** Preserve all 256 digest bits as eight big-endian u32 decimal strings. */
export function noteHashToWords(input) {
  const value = bytes(input, 32, 'HASH');
  return Array.from({ length: 8 }, (_, i) => value.readUInt32BE(i * 4).toString());
}
export function noteWordsToHash(words) {
  need(Array.isArray(words) && words.length === 8, 'PC15_HASH_WORD_COUNT');
  const result = Buffer.alloc(32);
  words.forEach((word, i) => result.writeUInt32BE(Number(publicWord(word, U32_MAX, 'U32')), i * 4));
  return `0x${result.toString('hex')}`;
}

/** Outputs exactly the full ordered circuit public statement, without reducing
 * hashes modulo a scalar field. Can be ABI-encoded as bytes32[] by the caller. */
export function encodePrivatePoolInputs(mode, statement) {
  need(Object.hasOwn(PRIVATE_POOL_INPUT_WORDS, mode), 'PC15_POOL_MODE');
  const common = ['scope', 'policy', 'epoch'];
  const tail = {
    reserve: ['amount', 'output', 'admissionTag'],
    fulfill: ['root', 'nullifier', 'effectSol', 'effectBtc', 'outputSol', 'outputBtc'],
    refund: ['root', 'nullifier', 'outputRecovery'],
    withdraw: ['root', 'nullifier', 'amount', 'recipient'],
  }[mode];
  const fields = [...common, ...tail];
  need(statement && typeof statement === 'object' && Object.keys(statement).length === fields.length && fields.every(key => Object.hasOwn(statement, key)), 'PC15_POOL_FIELDS');
  const output = [];
  for (const field of fields) {
    if (field === 'amount' || field === 'epoch') output.push(uint(statement[field], U64_MAX, 'U64').toString());
    else if (field === 'recipient') {
      const value = bytes(statement[field], 20, 'ADDRESS');
      for (let i = 0; i < 5; i++) output.push(value.readUInt32BE(i * 4).toString());
    } else output.push(...noteHashToWords(statement[field]));
  }
  need(output.length === PRIVATE_POOL_INPUT_WORDS[mode], 'PC15_POOL_INTERNAL_ABI');
  return output;
}

export function privatePoolAbiWords(words) {
  need(Array.isArray(words), 'PC15_PUBLIC_WORDS');
  return words.map(word => `0x${publicWord(word, U256_MAX, 'U256').toString(16).padStart(64, '0')}`);
}

/** Append-only complete depth-6 tree, matching the Solidity heap exactly.
 * Leaves must be nonzero and globally unique. Padding is always zero32.
 */
export class PrivateNoteTree {
  #nodes = Array(128).fill(ZERO_NOTE_HASH);
  #count = 0;
  #inserted = new Set();
  constructor(leaves = []) {
    need(Array.isArray(leaves) && leaves.length <= PRIVATE_NOTE_CAPACITY, 'PC15_TREE_CAPACITY');
    for (let i = 63; i > 0; i--) this.#nodes[i] = noteNodeHash(this.#nodes[i * 2], this.#nodes[i * 2 + 1]);
    for (const leaf of leaves) this.append(leaf);
  }
  get root() { return this.#nodes[1]; }
  get leafCount() { return this.#count; }
  get leaves() { return this.#nodes.slice(64); }
  get nodes() { return [...this.#nodes]; }
  append(input) {
    const leaf = digest(input);
    need(leaf !== ZERO_NOTE_HASH && !this.#inserted.has(leaf), 'PC15_DUPLICATE_OR_ZERO_NOTE');
    need(this.#count < PRIVATE_NOTE_CAPACITY, 'PC15_TREE_FULL');
    const index = this.#count++;
    this.#inserted.add(leaf);
    let cursor = 64 + index;
    this.#nodes[cursor] = leaf;
    while (cursor > 1) {
      cursor = Math.floor(cursor / 2);
      this.#nodes[cursor] = noteNodeHash(this.#nodes[cursor * 2], this.#nodes[cursor * 2 + 1]);
    }
    return index;
  }
  path(input) {
    const index = count(input, 'LEAF_INDEX');
    need(index < this.#count, 'PC15_UNINSERTED_LEAF');
    const siblings = [];
    for (let cursor = 64 + index; cursor > 1; cursor = Math.floor(cursor / 2)) siblings.push(this.#nodes[cursor ^ 1]);
    return { index, leaf: this.#nodes[64 + index], root: this.root, siblings };
  }
}

export function verifyPrivateNotePath({ index, leaf, root, siblings }) {
  const leafIndex = count(index, 'LEAF_INDEX');
  need(leafIndex < 64, 'PC15_LEAF_INDEX_RANGE');
  need(Array.isArray(siblings) && siblings.length === PRIVATE_NOTE_DEPTH, 'PC15_PATH_DEPTH');
  let value = digest(leaf);
  need(value !== ZERO_NOTE_HASH, 'PC15_EMPTY_LEAF');
  for (let level = 0; level < PRIVATE_NOTE_DEPTH; level++) {
    value = ((leafIndex >> level) & 1) === 0 ? noteNodeHash(value, siblings[level]) : noteNodeHash(siblings[level], value);
  }
  return value === digest(root);
}

/** Fixed 2085-byte frame: type:u8 || scope32 || count:u32be || 64×entry32.
 * type 2 = spent note nullifiers; 3 = SOL effects; 4 = BTC effects.
 * Accept unpadded entries or explicit zero-padded entries, but never sparse live
 * entries, nonzero tail padding, duplicate live entries or malformed counts.
 */
export function privateBoundedListFrame(type, scope, entries, liveCount = entries?.length) {
  need([2, 3, 4].includes(type), 'PC15_LIST_TYPE');
  need(Array.isArray(entries) && entries.length <= 64, 'PC15_LIST_CAPACITY');
  const n = count(liveCount);
  need(n <= entries.length, 'PC15_LIST_COUNT');
  const values = entries.map(digest);
  const live = values.slice(0, n);
  need(live.every(value => value !== ZERO_NOTE_HASH), 'PC15_LIST_ZERO_ENTRY');
  need(new Set(live).size === n, 'PC15_LIST_DUPLICATE');
  need(values.slice(n).every(value => value === ZERO_NOTE_HASH), 'PC15_LIST_PADDING');
  while (values.length < 64) values.push(ZERO_NOTE_HASH);
  return Buffer.concat([Buffer.from([type]), bytes(scope, 32, 'SCOPE'), fixedUint(n, 4, 'COUNT'), ...values.map(value => bytes(value, 32, 'HASH'))]);
}
export function privateBoundedListDigest(type, scope, entries, liveCount = entries?.length) {
  return hash(privateBoundedListFrame(type, scope, entries, liveCount));
}
export function privateSpentDigest(scope, entries, liveCount = entries?.length) {
  return privateBoundedListDigest(2, scope, entries, liveCount);
}
export function privateEffectDigest(chain, scope, entries, liveCount = entries?.length) {
  need(chain === 'SOL' || chain === 'BTC', 'PC15_EFFECT_CHAIN');
  return privateBoundedListDigest(chain === 'SOL' ? 3 : 4, scope, entries, liveCount);
}

/** Public capacity only: cannot establish a valid note, proof or balance. */
export function assertPrivateNoteHeadroom(state) {
  const keys = ['leafCount', 'spentCount', 'liveReservations', 'liveOutputNotes'];
  need(state && keys.every(key => Object.hasOwn(state, key)), 'PC15_HEADROOM_FIELDS');
  const [leaves, spent, reservations, outputs] = keys.map(key => count(state[key], key));
  need(leaves + 2 * reservations <= 64, 'PC15_TREE_HEADROOM');
  need(spent + 3 * reservations + outputs <= 64, 'PC15_SPENT_HEADROOM');
  return { treeRemaining: 64 - leaves - 2 * reservations, spentRemaining: 64 - spent - 3 * reservations - outputs };
}

/** Mirrors counter arithmetic for exhaustive host invariant tests. Does not
 * authenticate transitions and must never authorize funds or native dispatch. */
export function applyPrivateNoteCapacityTransition(state, mode) {
  assertPrivateNoteHeadroom(state);
  const next = Object.fromEntries(['leafCount', 'spentCount', 'liveReservations', 'liveOutputNotes'].map(key => [key, count(state[key], key)]));
  if (mode === 'reserve') { next.leafCount++; next.liveReservations++; }
  else if (mode === 'fulfill' || mode === 'refund') {
    need(next.liveReservations > 0, 'PC15_NO_LIVE_RESERVATION');
    const outputs = mode === 'fulfill' ? 2 : 1;
    next.liveReservations--; next.liveOutputNotes += outputs; next.leafCount += outputs; next.spentCount++;
  } else if (mode === 'withdraw') {
    need(next.liveOutputNotes > 0, 'PC15_NO_LIVE_OUTPUT');
    next.liveOutputNotes--; next.spentCount++;
  } else throw new Error('PC15_POOL_MODE');
  assertPrivateNoteHeadroom(next);
  return next;
}
