/** Portable byte-identical PC23 W39 preparation from the SAME retained device
 * change/recovery opening. No entropy/key/backend mark or financial authority
 * is issued by this codec. The caller must hold the fixed service quote and
 * prove the original live unspent/finality state before protected signing. */
import { sha256 } from '@noble/hashes/sha2.js';
import { localBalanceCommitmentMessageV1, localBalanceWithdrawalMessageV1,
  localNoteHexBytesV1, localNoteUintBytesV1 } from './balance-note-codec-v1.mjs';
import { localFundedSpendNullifierV1 } from './funded-balance-owner-codec-v1.mjs';
function need(value) { if (!value) throw Error('MOBILE_DEVICE_W39_ENCODING_INVALID'); }
function exact(value, names) {
  need(value && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === names.length);
  for (const name of names) { const row = Object.getOwnPropertyDescriptor(value, name); need(row?.enumerable && Object.hasOwn(row, 'value')); }
}
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const uint = value => { localNoteUintBytesV1(value); return value; };
const hash = (value, width = 32) => { localNoteHexBytesV1(value, width); return value; };
function opening(value) {
  exact(value, ['type', 'rho', 'x', 'y', 'value', 'secret']); need(value.type === 4);
  for (const name of ['rho', 'x', 'y', 'secret']) hash(value[name]);
  uint(value.value); need(BigInt(value.value) > 0n); return { ...value };
}
function path(value) {
  exact(value, ['root', 'index', 'leaf', 'siblings']); hash(value.root); hash(value.leaf);
  need(Number.isSafeInteger(value.index) && value.index >= 0 && value.index < 64
    && Array.isArray(value.siblings) && Object.getPrototypeOf(value.siblings) === Array.prototype
    && value.siblings.length === 6 && Reflect.ownKeys(value.siblings).length === 7);
  const siblings = Array.from({ length: 6 }, (_, index) => { const row = Object.getOwnPropertyDescriptor(value.siblings, String(index));
    need(row?.enumerable && Object.hasOwn(row, 'value')); return hash(row.value); });
  let root = value.leaf, index = value.index;
  for (const sibling of siblings) {
    const bytes = new Uint8Array(65); bytes[0] = 1;
    bytes.set(localNoteHexBytesV1(index & 1 ? sibling : root), 1);
    bytes.set(localNoteHexBytesV1(index & 1 ? root : sibling), 33);
    try { root = hex(sha256(bytes)); } finally { bytes.fill(0); }
    index >>= 1;
  }
  need(root === value.root); return { root, index: value.index, leaf: value.leaf, siblings };
}
const words = (value, width = 32) => {
  const bytes = localNoteHexBytesV1(value, width);
  return Array.from({ length: width / 4 }, (_, index) => {
    let word = 0; for (const byte of bytes.subarray(index * 4, index * 4 + 4)) word = word * 256 + byte; return word;
  });
};
export function localDeviceWithdrawalStatementV1(raw) {
  exact(raw, ['scope', 'policy', 'epoch', 'opening', 'path', 'recipient']);
  const scope = hash(raw.scope), policy = hash(raw.policy), epoch = uint(raw.epoch), recipient = hash(raw.recipient, 20);
  need(recipient !== '0'.repeat(40)); const note = opening(raw.opening), member = path(raw.path);
  const commitment = hex(sha256(localBalanceCommitmentMessageV1(scope, policy, note)));
  need(commitment === member.leaf);
  return Object.freeze({ scope, policy, epoch, root: member.root,
    nullifier: localFundedSpendNullifierV1(scope, commitment, note.secret), amount: note.value, recipient, commitment });
}
export function localDeviceWithdrawalFrameV1(statement) {
  exact(statement, ['scope', 'policy', 'epoch', 'root', 'nullifier', 'amount', 'recipient', 'commitment']);
  hash(statement.root); hash(statement.nullifier);
  return localBalanceWithdrawalMessageV1({ scope: statement.scope, policy: statement.policy,
    commitment: statement.commitment, recipient: statement.recipient, amount: statement.amount, epoch: statement.epoch });
}
export function localDeviceWithdrawalWitnessV1(raw) {
  exact(raw, ['statement', 'opening', 'path', 'signature']);
  const note = opening(raw.opening), member = path(raw.path), signature = Array.from(localNoteHexBytesV1(raw.signature, 64));
  const expected = localDeviceWithdrawalStatementV1({ scope: raw.statement.scope, policy: raw.statement.policy,
    epoch: raw.statement.epoch, opening: note, path: member, recipient: raw.statement.recipient });
  need(JSON.stringify(expected) === JSON.stringify(raw.statement));
  return { scope: words(expected.scope), policy: words(expected.policy), epoch: expected.epoch,
    root: words(expected.root), spent: words(expected.nullifier), amount: expected.amount,
    recipient: words(expected.recipient, 20), siblings: member.siblings.map(value => Array.from(localNoteHexBytesV1(value))),
    leaf_index: String(member.index), rho: Array.from(localNoteHexBytesV1(note.rho)), key_x: Array.from(localNoteHexBytesV1(note.x)),
    key_y: Array.from(localNoteHexBytesV1(note.y)), value: note.value, secret: Array.from(localNoteHexBytesV1(note.secret)), signature };
}
export function localDeviceWithdrawalPublicWordsV1(statement) {
  // The public ABI is exactly 39 words. Commitment belongs to the signed frame
  // and quote; it is not an extra circuit public input.
  localDeviceWithdrawalFrameV1(statement);
  return [...words(statement.scope), ...words(statement.policy), statement.epoch, ...words(statement.root),
    ...words(statement.nullifier), statement.amount, ...words(statement.recipient, 20)].map(String);
}
