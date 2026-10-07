/** DRAFT private wire validation. Pure codecs are not owned-runtime capabilities. */
import { createPublicKey, verify } from 'node:crypto';
import { resolve } from 'node:path';
import { canonical, digest } from '../../../crypto/privacy.mjs';
import { nullifier } from '../../../notes/private-note-encoding.mjs';
import { PrivateNoteTree, noteWordsToHash } from '../../../notes/private-note-tree.mjs';
import { walletNoteCommitment, balanceWithdrawFrame, walletInputPublicWords, encodeWalletPoolInputs }
  from '../../../wallet/notes/private-wallet-note-encoding.mjs';
import { SECP256K1_ORDER } from '../../../notes/private-native-certificate.mjs';
import { encodeProofMessage, decodeProofMessage } from '../../proofs/proof-worker.mjs';

export const PROTOCOL = 'LIANUM_PRIVATE_OWNER_RECOVERY_DRAFT_V1';
export const MAX_BYTES = 64 * 1024;
export const TIMEOUT_MS = 15000;
export const NOTES = Object.freeze(['source', 'change', 'recovery']);
export const DOMAINS = Object.freeze(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment']);
const COMMITMENT = { source: 'fundingCommitment', change: 'changeCommitment', recovery: 'recoveryCommitment' };
const ERROR = /^(?:OWNER_RECOVERY|VAULT)_[A-Z_]{1,80}$/;
export const problem = code => Object.assign(new Error(code), { code });
export const need = (ok, code = 'PROTOCOL') => { if (!ok) throw problem('OWNER_RECOVERY_' + code); };
export const codeFor = error => ERROR.test(error?.code ?? '') ? error.code : 'OWNER_RECOVERY_REJECTED';
export const copy = value => JSON.parse(canonical(value));
export const same = (a, b) => canonical(a) === canonical(b);
export function exact(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), 'EXACT_FIELDS');
}
export function uint(value) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) < 1n << 64n, 'INTEGER');
  return value;
}
export function hash(value, bytes = 32, prefixed = false) {
  need(typeof value === 'string' && new RegExp(`^${prefixed ? '0x' : ''}[0-9a-f]{${bytes * 2}}$`).test(value)
    && value !== (prefixed ? '0x' : '') + '0'.repeat(bytes * 2), 'HASH');
  return value;
}
export function sequence(value) { need(Number.isSafeInteger(value) && value > 0, 'SEQUENCE'); return value; }
export function note(value) { need(NOTES.includes(value), 'NOTE_SELECTION'); return value; }
export function encode(value) {
  canonical(value);
  const bytes = encodeProofMessage(value);
  if (bytes.length > MAX_BYTES) { bytes.fill(0); need(false, 'MESSAGE_LIMIT'); }
  return bytes;
}
export function decode(bytes) {
  need(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= MAX_BYTES, 'MESSAGE_LIMIT');
  const value = decodeProofMessage(bytes); canonical(value); return value;
}
export function config(input) {
  exact(input, ['recoveryVault', 'exitVault', 'expectedBinding', 'destinations']);
  exact(input.recoveryVault, ['path', 'password']); exact(input.exitVault, ['path', 'password', 'mode']);
  for (const vault of [input.recoveryVault, input.exitVault]) {
    need(typeof vault.path === 'string' && vault.path.length > 0 && vault.path.length <= 4096 && !vault.path.includes('\0'), 'CONFIG');
    need(typeof vault.password === 'string' && vault.password.length > 0 && Buffer.byteLength(vault.password) <= 1024, 'CONFIG');
  }
  need(['create', 'recover'].includes(input.exitVault.mode), 'CONFIG');
  exact(input.expectedBinding, [...DOMAINS, 'operationId', 'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore',
    'fundingCommitment', 'admissionTag', 'reserveCommitment', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment']);
  for (const [name, value] of Object.entries(input.expectedBinding)) {
    if (['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].includes(name)) uint(value); else hash(value);
  }
  exact(input.destinations, NOTES);
  for (const name of NOTES) if (name !== 'change' || input.destinations[name] !== null) hash(input.destinations[name], 20);
  const result = copy(input);
  // The child has a fixed cwd. Preserve the invoking owner's path selection.
  result.recoveryVault.path = resolve(result.recoveryVault.path); result.exitVault.path = resolve(result.exitVault.path);
  const bytes = encode(result); bytes.fill(0); return result;
}
export function domains(binding) { return Object.fromEntries(DOMAINS.map(name => [name, binding[name]])); }
export function query(binding, name) { return { ...domains(binding), note: note(name) }; }
export function checkQuery(input, binding, selectedNote) {
  exact(input, [...DOMAINS, 'note']); need(same(input, query(binding, selectedNote)), 'BRIDGE_DOMAIN');
}
export function view(input, binding) {
  exact(input, [...DOMAINS, 'blockNumber', 'blockHash', 'timestamp', 'poolStateSequence', 'root', 'commitments', 'nullifiers']);
  need(DOMAINS.every(name => input[name] === binding[name]), 'BRIDGE_DOMAIN');
  for (const name of ['blockNumber', 'timestamp', 'poolStateSequence']) uint(input[name]);
  hash(input.blockHash, 32, true); hash(input.root, 32, true);
  for (const name of ['commitments', 'nullifiers']) {
    need(Array.isArray(input[name]) && input[name].length <= 64 && new Set(input[name]).size === input[name].length, 'OBSERVATION_LIST');
    input[name].forEach(item => hash(item, 32, true));
  }
  need(new PrivateNoteTree(input.commitments).root === input.root, 'OBSERVATION_ROOT');
  return copy(input);
}
export function observed(input, status) {
  return { blockNumber: input.blockNumber, blockHash: input.blockHash, poolStateSequence: input.poolStateSequence,
    root: input.root, canonicalNullifier: status.canonicalNullifier, epoch: (BigInt(input.timestamp) / 600n).toString() };
}
/** Data conversion only, NOT an ownership check. Only the parent factory may
 * source this input through readNativeSystemState of its branded deployment. */
export function projectNativeObservation(native, binding, poolAddress) {
  const s = native.snapshot;
  need(s.pool === poolAddress && s.scope === '0x' + binding.scope && s.policy === '0x' + binding.policy
    && s.assetIdentity === '0x' + binding.asset && s.hubDomain === '0x' + binding.hubDomain
    && s.registryCommitment === '0x' + binding.registryCommitment, 'POOL_BINDING');
  return view({ ...domains(binding), blockNumber: BigInt(native.header.number).toString(),
    blockHash: native.header.hash, timestamp: BigInt(native.header.timestamp).toString(),
    poolStateSequence: native.ledger.publicState.sequence, root: native.ledger.tree.root,
    commitments: native.ledger.commitments, nullifiers: native.ledger.nullifiers }, binding);
}
export function requestFor(status, input) {
  const index = input.commitments.indexOf('0x' + status.noteCommitment);
  need(index >= 0, 'CURRENT_MEMBERSHIP_REQUIRED');
  const { eligibility, authorization, ...terms } = status;
  return { ...terms, epoch: (BigInt(input.timestamp) / 600n).toString(), path: new PrivateNoteTree(input.commitments).path(index) };
}
export function checkStatus(value, cfg, name, state) {
  exact(value, ['note', 'scope', 'policy', 'noteCommitment', 'recipient', 'amount', 'canonicalNullifier', 'eligibility', 'authorization']);
  need(value.note === note(name) && value.scope === cfg.expectedBinding.scope && value.policy === cfg.expectedBinding.policy
    && value.noteCommitment === cfg.expectedBinding[COMMITMENT[name]] && value.recipient === cfg.destinations[name], 'RESULT_BINDING');
  uint(value.amount);
  const empty = name === 'change' && value.amount === '0';
  need(empty ? value.canonicalNullifier === null && value.recipient === null : BigInt(value.amount) > 0n, 'RESULT_BINDING');
  if (!empty) hash(value.canonicalNullifier);
  need(value.eligibility === (empty ? 'NO_CHANGE_NOTE' : state === 'prepared' && name !== 'source'
    ? 'AUTHORIZED_RECORD_REQUIRED' : 'OBSERVATION_REQUIRED'), 'RESULT_BINDING');
  if (value.authorization !== null) {
    exact(value.authorization, ['epoch', 'root', 'hash']); uint(value.authorization.epoch);
    hash(value.authorization.root, 32, true); hash(value.authorization.hash);
    need(value.eligibility === 'OBSERVATION_REQUIRED', 'RESULT_BINDING');
  }
  return copy(value);
}
export function checkInitialized(value, cfg) {
  exact(value, ['record', 'statuses']); exact(value.record, ['state', 'binding', 'persistedProofBindingsChecked', 'cryptographicProofVerification']);
  need(['prepared', 'authorized'].includes(value.record.state) && same(value.record.binding, cfg.expectedBinding)
    && value.record.persistedProofBindingsChecked === (value.record.state === 'authorized')
    && value.record.cryptographicProofVerification === false, 'RESULT_BINDING');
  exact(value.statuses, NOTES);
  for (const name of NOTES) checkStatus(value.statuses[name], cfg, name, value.record.state);
  need(BigInt(value.statuses.source.amount) === BigInt(value.statuses.change.amount) + BigInt(value.statuses.recovery.amount), 'CONSERVATION');
  return copy(value);
}
/** Independently check the complete private proof input, W39 public ABI, fixed
 * economics, commitment, canonical nullifier and retained authorization hash.
 * This does not prove native execution or accept a caller-created chain view. */
export function checkAuthorization(value, status, input, checks) {
  const spent = input.nullifiers.includes('0x' + status.canonicalNullifier);
  const issued = input.commitments.includes('0x' + status.noteCommitment);
  const outcome = spent ? 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION'
    : !issued ? 'NOTE_NOT_ISSUED_AT_OBSERVATION' : 'AUTHORIZED_UNSPENT_AT_OBSERVATION';
  need(value.status === outcome, 'RESULT_BINDING');
  exact(value, outcome === 'AUTHORIZED_UNSPENT_AT_OBSERVATION'
    ? ['status', 'witness', 'expectedPublicInputs', 'observed', 'authorization'] : ['status', 'observed']);
  need(same(value.observed, observed(input, status)) && checks >= (issued && !spent ? 2 : 1), 'CANONICAL_OBSERVATION_REQUIRED');
  if (outcome !== 'AUTHORIZED_UNSPENT_AT_OBSERVATION') return copy(value);
  const w = value.witness, request = requestFor(status, input);
  exact(w, ['scope', 'policy', 'epoch', 'root', 'spent', 'amount', 'recipient', 'siblings',
    'leaf_index', 'rho', 'key_x', 'key_y', 'value', 'secret', 'signature']);
  for (const field of ['scope', 'policy', 'root', 'spent', 'recipient']) {
    need(Array.isArray(w[field]) && w[field].length === (field === 'recipient' ? 5 : 8)
      && w[field].every(word => Number.isSafeInteger(word) && word >= 0 && word <= 0xffffffff), 'RESULT_WITNESS');
  }
  for (const field of ['epoch', 'amount', 'value', 'leaf_index']) uint(w[field]);
  for (const field of ['rho', 'key_x', 'key_y', 'secret', 'signature']) {
    need(Array.isArray(w[field]) && w[field].length === (field === 'signature' ? 64 : 32)
      && w[field].every(b => Number.isInteger(b) && b >= 0 && b <= 255), 'RESULT_WITNESS');
  }
  need(w.value === status.amount && w.leaf_index === String(request.path.index)
    && same(w.siblings, request.path.siblings.map(h => [...Buffer.from(h.slice(2), 'hex')])), 'RESULT_WITNESS');
  const opening = { type: 4, rho: Buffer.from(w.rho), x: Buffer.from(w.key_x), y: Buffer.from(w.key_y),
    value: w.value, secret: Buffer.from(w.secret) };
  const cm = walletNoteCommitment(status.scope, status.policy, opening);
  need(cm.toString('hex') === status.noteCommitment && nullifier(status.scope, cm, opening.secret).toString('hex')
    === status.canonicalNullifier, 'RESULT_NULLIFIER');
  const expected = encodeWalletPoolInputs('withdraw_balance', { scope: status.scope, policy: status.policy, epoch: request.epoch,
    root: input.root, nullifier: status.canonicalNullifier, amount: status.amount, recipient: status.recipient });
  const actual = walletInputPublicWords('withdraw_balance', w);
  need(same(actual, expected) && same(value.expectedPublicInputs, expected)
    && noteWordsToHash(actual.slice(25, 33)) === '0x' + status.canonicalNullifier, 'RESULT_PUBLIC_INPUTS');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: opening.x.toString('base64url'), y: opening.y.toString('base64url') } });
  const signature = Buffer.from(w.signature), s = BigInt('0x' + signature.subarray(32).toString('hex'));
  need(s > 0n && s <= SECP256K1_ORDER / 2n && verify('sha256', balanceWithdrawFrame(status.scope, status.policy,
    status.noteCommitment, status.recipient, status.amount, request.epoch), { key, dsaEncoding: 'ieee-p1363' }, signature), 'RESULT_SIGNATURE');
  need(same(value.authorization, { epoch: request.epoch, root: input.root,
    hash: digest('LIANUM/PAEG/owner-exit-authorization/1', { request, witness: w }) }), 'RESULT_AUTHORIZATION');
  return copy(value);
}
