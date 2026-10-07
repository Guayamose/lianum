/** M21 exact original owner-refund note custody. Trusted local host/OS and
 * directory only; no key backup after keeper loss, hostile-host isolation,
 * rollback resistance or reliable JavaScript/OpenSSL secret zeroization.
 * This module NEVER generates a recovery key or substitutes a new note.
 */
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { canonical } from '../crypto/privacy.mjs';
import { Vault } from '../crypto/vault.mjs';
import { paymentCommitment, signature, withdrawFrame, nullifier, bytes, wordsBE } from '../notes/private-note-encoding.mjs';
import { verifyPrivateNotePath } from '../notes/private-note-tree.mjs';
import { SECP256K1_ORDER } from '../notes/private-native-certificate.mjs';

const BINDING = ['scope', 'policy', 'budget', 'withdrawalRecipient', 'cutoff', 'reservedCommitment', 'reserveNullifier', 'paymentCommitment'];
const NOTE = ['type', 'origin', 'x', 'y', 'value', 'secret'];
const REQUEST = ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount', 'epoch'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = 'OWNER_REFUND_INPUT') => { if (!ok) fail(code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
const raw = value => Buffer.from(value, 'hex');
function exact(value, fields) {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k)), 'OWNER_REFUND_FIELDS');
}
function hex(value, width = 32) { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${width * 2}}$`).test(value)); return value; }
function uint(value, positive = false) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value));
  need(BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n)); return BigInt(value);
}
const publicKey = note => createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: raw(note.x).toString('base64url'), y: raw(note.y).toString('base64url') }, format: 'jwk' });
export function validateOwnerRefundBinding(input) {
  exact(input, BINDING); const b = copy(input);
  for (const k of ['scope', 'policy', 'reservedCommitment', 'reserveNullifier', 'paymentCommitment']) hex(b[k]);
  uint(b.budget, true); uint(b.cutoff, true); hex(b.withdrawalRecipient, 20);
  need(b.withdrawalRecipient !== '00'.repeat(20), 'OWNER_REFUND_DESTINATION'); return b;
}
export function validateOwnerRefundOpening(input, expectedBinding) {
  exact(input, ['version', 'binding', 'note']);
  const b = validateOwnerRefundBinding(expectedBinding), o = copy(input);
  need(o.version === 1 && equal(validateOwnerRefundBinding(o.binding), b), 'OWNER_REFUND_BINDING');
  exact(o.note, NOTE);
  need(o.note.type === 3 && o.note.value === b.budget, 'OWNER_REFUND_NOTE_TYPE_VALUE');
  for (const k of ['origin', 'x', 'y', 'secret']) hex(o.note[k]);
  publicKey(o.note);
  need(paymentCommitment(b.scope, o.note).toString('hex') === b.paymentCommitment, 'OWNER_REFUND_COMMITMENT'); return o;
}
export function importOwnerRefundOpening(expectedBinding, opening) {
  const o = validateOwnerRefundOpening(opening, expectedBinding), n = o.note;
  return { note: { type: 3, origin: raw(n.origin), x: raw(n.x), y: raw(n.y), value: BigInt(n.value), secret: raw(n.secret), commitment: raw(o.binding.paymentCommitment) } };
}
export function validateOwnerRefundCustodyConfig(input) {
  exact(input, ['path', 'password', 'withdrawalRecipient']);
  need(typeof input.path === 'string' && input.path.length > 0 && !input.path.includes('\0'));
  need(typeof input.password === 'string' && input.password.length > 0 && Buffer.byteLength(input.password) <= 1024);
  hex(input.withdrawalRecipient, 20); need(input.withdrawalRecipient !== '00'.repeat(20), 'OWNER_REFUND_DESTINATION'); return copy(input);
}
function recoveryConfig(input) {
  exact(input, ['path', 'password', 'expectedBinding']);
  const expectedBinding = validateOwnerRefundBinding(input.expectedBinding);
  const base = validateOwnerRefundCustodyConfig({ path: input.path, password: input.password, withdrawalRecipient: expectedBinding.withdrawalRecipient });
  return { path: base.path, password: base.password, expectedBinding };
}
function validateState(state, expectedBinding) {
  exact(state, ['version', 'binding', 'note', 'privateKeyPem']);
  validateOwnerRefundOpening({ version: state.version, binding: state.binding, note: state.note }, expectedBinding);
  need(typeof state.privateKeyPem === 'string' && state.privateKeyPem.length < 4096 && state.privateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----'), 'OWNER_REFUND_KEY');
  const privateKey = createPrivateKey(state.privateKeyPem);
  need(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails?.namedCurve === 'secp256k1', 'OWNER_REFUND_KEY');
  const pub = createPublicKey(privateKey), jwk = pub.export({ format: 'jwk' });
  need(Buffer.from(jwk.x, 'base64url').toString('hex') === state.note.x && Buffer.from(jwk.y, 'base64url').toString('hex') === state.note.y, 'OWNER_REFUND_KEY');
  return { privateKey, publicKey: pub };
}
function validateRequest(input, binding) {
  exact(input, REQUEST); const r = copy(input);
  uint(r.epoch); uint(r.amount, true); hex(r.recipient, 20);
  need(r.scope === binding.scope && r.policy === binding.policy && r.paymentCommitment === binding.paymentCommitment && r.recipient === binding.withdrawalRecipient && r.amount === binding.budget, 'OWNER_REFUND_WITHDRAWAL_MISMATCH');
  need(BigInt(r.epoch) >= BigInt(binding.cutoff), 'OWNER_REFUND_BEFORE_CUTOFF'); return r;
}
class OwnerRefundCustody {
  #vault; #password; #state; #key; #closed = false;
  constructor(vault, cfg, state) {
    this.#vault = vault; this.#password = cfg.password; this.#state = copy(state); this.#key = validateState(this.#state, cfg.expectedBinding); Object.freeze(this);
  }
  #open() { need(!this.#closed, 'OWNER_REFUND_CLOSED'); }
  /** Authenticates the actual current encrypted file, not the create return. */
  async authenticate() {
    this.#open(); const record = await this.#vault.read(this.#password); this.#open();
    need(record.revision === 0, 'OWNER_REFUND_IMMUTABLE_REVISION'); validateState(record.data, this.#state.binding);
    need(equal(record.data, this.#state), 'OWNER_REFUND_READBACK_MISMATCH'); return { authenticated: true };
  }
  /** Private trusted keeper/prover input only, NEVER a public actor summary. */
  opening() { this.#open(); return { version: 1, binding: copy(this.#state.binding), note: copy(this.#state.note) }; }
  /** Epoch is an exact signing input authenticated by the trusted keeper's
   * current canonical pool read. This signer itself makes no chain truth claim. */
  authorizeWithdrawal(input) {
    this.#open(); const r = validateRequest(input, this.#state.binding);
    return { ...r, signature: signature(this.#key, withdrawFrame(r.scope, r.policy, r.paymentCommitment, raw(r.recipient), r.amount, r.epoch)).toString('hex') };
  }
  close() { this.#closed = true; this.#password = this.#state = this.#key = undefined; }
}

/** Called only inside the original owner. It serializes the already-created
 * graph.recovery, not the graph, owner key, origin seed or recipient material.
 * A retry may authenticate an identical already-committed file after uncertain
 * save failure; it NEVER overwrites a substituted file or generates a new key.
 * vaultFactory is a trusted host test seam, never part of bootstrap/IPC.
 */
export async function persistOriginalOwnerRefundCustody(graph, input, { vaultFactory = path => new Vault(path) } = {}) {
  const cfg = validateOwnerRefundCustodyConfig(input), n = graph.recovery;
  need(n?.type === 3 && BigInt(n.value) === BigInt(graph.budget), 'OWNER_REFUND_NOTE_TYPE_VALUE');
  const binding = validateOwnerRefundBinding({ scope: graph.scope.toString('hex'), policy: graph.policy.toString('hex'), budget: graph.budget.toString(), withdrawalRecipient: cfg.withdrawalRecipient, cutoff: graph.claimEpoch.toString(), reservedCommitment: graph.reserved.toString('hex'), reserveNullifier: graph.nullifier.toString('hex'), paymentCommitment: n.commitment.toString('hex') });
  need(nullifier(binding.scope, graph.reserved, graph.reserveSecret).toString('hex') === binding.reserveNullifier, 'OWNER_REFUND_RESERVE_BINDING');
  const state = { version: 1, binding, note: { type: 3, origin: n.origin.toString('hex'), x: n.x.toString('hex'), y: n.y.toString('hex'), value: n.value.toString(), secret: n.secret.toString('hex') }, privateKeyPem: n.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  validateState(state, binding);
  const vault = vaultFactory(cfg.path);
  try { await vault.create(state, cfg.password); } catch (error) { if (error?.code !== 'VAULT_EXISTS') throw error; }
  const wallet = new OwnerRefundCustody(vault, { ...cfg, expectedBinding: binding }, state);
  try { await wallet.authenticate(); return wallet; } catch (error) { wallet.close(); throw error; }
}
export async function recoverOwnerRefundCustody(input) {
  const cfg = recoveryConfig(input), vault = new Vault(cfg.path), record = await vault.read(cfg.password);
  need(record.revision === 0, 'OWNER_REFUND_IMMUTABLE_REVISION');
  return new OwnerRefundCustody(vault, cfg, record.data);
}

/** Unchanged type-3 withdraw circuit witness. Membership is checked here, but
 * only canonical pool reads + the pool establish issuance/current epoch/unspent. */
export function ownerRefundWithdrawalInput(binding, opening, authorization, path) {
  const b = validateOwnerRefundBinding(binding), { note } = importOwnerRefundOpening(b, opening);
  exact(authorization, [...REQUEST, 'signature']); const { signature: signed, ...request } = authorization;
  const a = validateRequest(request, b); hex(signed, 64);
  const r = BigInt(`0x${signed.slice(0, 64)}`), s = BigInt(`0x${signed.slice(64)}`);
  need(r > 0n && r < SECP256K1_ORDER && s > 0n && s <= SECP256K1_ORDER / 2n && verify('sha256', withdrawFrame(a.scope, a.policy, a.paymentCommitment, raw(a.recipient), a.amount, a.epoch), { key: publicKey(opening.note), dsaEncoding: 'ieee-p1363' }, raw(signed)), 'OWNER_REFUND_SIGNATURE');
  exact(path, ['index', 'leaf', 'root', 'siblings']);
  need(typeof path.root === 'string' && /^0x[0-9a-f]{64}$/.test(path.root) && Array.isArray(path.siblings) && path.siblings.every(h => typeof h === 'string' && /^0x[0-9a-f]{64}$/.test(h)) && path.leaf === `0x${b.paymentCommitment}` && verifyPrivateNotePath(path), 'OWNER_REFUND_MEMBERSHIP');
  return { scope: wordsBE(raw(a.scope)), policy: wordsBE(raw(a.policy)), epoch: a.epoch, root: wordsBE(raw(path.root.slice(2))), spent: wordsBE(nullifier(a.scope, note.commitment, note.secret)), amount: a.amount, recipient: wordsBE(raw(a.recipient)), siblings: path.siblings.map(h => bytes(raw(h.slice(2)))), leaf_index: String(path.index), note_type: 3, note_origin: bytes(note.origin), key_x: bytes(note.x), key_y: bytes(note.y), value: note.value.toString(), secret: bytes(note.secret), signature: bytes(raw(signed)) };
}
