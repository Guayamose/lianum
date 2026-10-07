/**
 * PC17: bounded recipient-local custody for unchanged PC15 payment notes.
 * Host/API separation only. Trusted process bootstrap, OS and local vault
 * directory are required; this is not a sandbox or native execution adapter.
 * The owner receives the note opening for its monolithic proof, never the key.
 */
import { createPrivateKey, createPublicKey, randomBytes, verify } from 'node:crypto';
import { canonical, digest } from '../crypto/privacy.mjs';
import { Vault } from '../crypto/vault.mjs';
import {
  freshKey, signature, paymentCommitment, localCommitment, invoiceFrame,
  withdrawFrame, nullifier, bytes, wordsBE,
} from '../notes/private-note-encoding.mjs';
import { verifyPrivateNotePath } from '../notes/private-note-tree.mjs';
import { SECP256K1_ORDER } from '../notes/private-native-certificate.mjs';

const TERMS = ['scope', 'policy', 'role', 'originSlot', 'origin', 'value', 'descriptor'];
const DESCRIPTOR = ['chain', 'nonce', 'source', 'recipient', 'amount', 'executeAfter', 'executeBefore', 'validFrom', 'validUntil'];
const NOTE = ['type', 'origin', 'x', 'y', 'value', 'secret'];
const INVOICE = ['version', 'role', 'scope', 'policy', 'originSlot', 'paymentCommitment', 'localCommitment', 'invoiceSignature', 'note'];
const REQUEST = ['scope', 'policy', 'paymentCommitment', 'recipient', 'amount', 'epoch'];
const EPOCH_MAX = 30744573456182586n;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (value, code = 'RECIPIENT_INPUT') => { if (!value) fail(code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
function exact(value, fields) {
  // Call canonical first so accessors, proxies, coercions and hidden fields fail.
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value));
  need(Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k)));
}
function hex(value, width = 32) { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${width * 2}}$`).test(value)); return value; }
function uint(value, positive = false) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value));
  need(BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n));
  return BigInt(value);
}
const raw = h => Buffer.from(h, 'hex');
function publicKey(note) {
  return createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: raw(note.x).toString('base64url'), y: raw(note.y).toString('base64url') }, format: 'jwk' });
}
function validSignature(note, message, signed) {
  try {
    hex(signed, 64);
    const s = BigInt(`0x${signed.slice(64)}`);
    return s > 0n && s <= SECP256K1_ORDER / 2n && verify('sha256', message, { key: publicKey(note), dsaEncoding: 'ieee-p1363' }, raw(signed));
  } catch { return false; }
}

/** Own-role JSON only. The recipient cannot validate the shared seed derivation;
 * the unchanged reserve circuit does so when the owner supplies origin_seed. */
export function validateRecipientTerms(input) {
  exact(input, TERMS);
  const t = copy(input);
  for (const k of ['scope', 'policy', 'origin']) hex(t[k]);
  need(t.role === 'sol' || t.role === 'btc');
  const slot = t.role === 'sol' ? 1 : 2;
  need(t.originSlot === slot);
  uint(t.value, true);
  exact(t.descriptor, DESCRIPTOR);
  const d = t.descriptor;
  need(d.chain === slot);
  for (const k of ['nonce', 'source', 'recipient']) hex(d[k]);
  if (t.role === 'btc') need(d.source === '00'.repeat(32));
  uint(d.amount, true);
  for (const k of ['executeAfter', 'executeBefore', 'validFrom', 'validUntil']) uint(d[k]);
  need(BigInt(d.validFrom) < BigInt(d.validUntil) && BigInt(d.validUntil) <= EPOCH_MAX);
  need(BigInt(d.executeAfter) < BigInt(d.executeBefore));
  need(BigInt(d.executeAfter) >= BigInt(d.validFrom) * 600n && BigInt(d.executeBefore) <= BigInt(d.validUntil) * 600n);
  return t;
}

export function recipientTermsDigest(terms) {
  return digest('PC17/recipient-terms/1', validateRecipientTerms(terms));
}

function commitments(terms, note) {
  const payment = paymentCommitment(terms.scope, note).toString('hex');
  const local = localCommitment(terms.scope, terms.policy, { ...terms.descriptor, payout: payment }).toString('hex');
  return { paymentCommitment: payment, localCommitment: local };
}
function checkNote(note, terms) {
  exact(note, NOTE);
  need(note.type === 2 && note.origin === terms.origin && note.value === terms.value, 'RECIPIENT_NOTE_MISMATCH');
  for (const k of ['origin', 'x', 'y', 'secret']) hex(note[k]);
  publicKey(note); // Reject invalid curve points before admitting an opening.
}
function invoiceFor(state) {
  const t = state.terms;
  return { version: 1, role: t.role, scope: t.scope, policy: t.policy, originSlot: t.originSlot,
    ...commitments(t, state.note), invoiceSignature: state.invoiceSignature, note: copy(state.note) };
}

/** Owner-side validation/projection. Returned note data includes the private
 * note opening required by PC15, not a private signing key or a public artifact. */
export function importRecipientInvoice(expectedTerms, suppliedInvoice) {
  const terms = validateRecipientTerms(expectedTerms);
  exact(suppliedInvoice, INVOICE);
  const invoice = copy(suppliedInvoice);
  need(invoice.version === 1 && invoice.role === terms.role && invoice.scope === terms.scope &&
    invoice.policy === terms.policy && invoice.originSlot === terms.originSlot, 'RECIPIENT_INVOICE_MISMATCH');
  checkNote(invoice.note, terms);
  const cm = commitments(terms, invoice.note);
  need(invoice.paymentCommitment === cm.paymentCommitment && invoice.localCommitment === cm.localCommitment,
    'RECIPIENT_COMMITMENT_MISMATCH');
  need(validSignature(invoice.note, invoiceFrame(terms.scope, cm.localCommitment, cm.paymentCommitment), invoice.invoiceSignature), 'RECIPIENT_INVOICE_SIGNATURE');
  const n = invoice.note;
  return {
    note: { type: 2, origin: raw(n.origin), x: raw(n.x), y: raw(n.y), value: BigInt(n.value), secret: raw(n.secret), commitment: raw(cm.paymentCommitment) },
    local: { ...Object.fromEntries(Object.entries(terms.descriptor).map(([k, v]) => [k,
      ['nonce', 'source', 'recipient'].includes(k) ? raw(v) : k === 'chain' ? v : BigInt(v)])),
    payout: raw(cm.paymentCommitment), commitment: raw(cm.localCommitment), invoiceSignature: raw(invoice.invoiceSignature) },
  };
}

function config(input) {
  exact(input, ['path', 'password', 'expectedTerms', 'withdrawalRecipient']);
  need(typeof input.path === 'string' && input.path.length > 0);
  need(typeof input.password === 'string' && input.password.length > 0 && Buffer.byteLength(input.password) <= 1024);
  hex(input.withdrawalRecipient, 20);
  need(input.withdrawalRecipient !== '00'.repeat(20));
  return { ...copy(input), expectedTerms: validateRecipientTerms(input.expectedTerms) };
}

function validateState(state, cfg) {
  exact(state, ['version', 'terms', 'withdrawalRecipient', 'privateKeyPem', 'note', 'invoiceSignature']);
  need(state.version === 1 && equal(state.terms, cfg.expectedTerms) && state.withdrawalRecipient === cfg.withdrawalRecipient,
    'RECIPIENT_RECOVERY_BINDING');
  checkNote(state.note, state.terms);
  need(typeof state.privateKeyPem === 'string' && state.privateKeyPem.length < 4096 && state.privateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----'), 'RECIPIENT_RECOVERY_KEY');
  const privateKey = createPrivateKey(state.privateKeyPem);
  need(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails.namedCurve === 'secp256k1', 'RECIPIENT_RECOVERY_KEY');
  const pub = createPublicKey(privateKey), jwk = pub.export({ format: 'jwk' });
  need(Buffer.from(jwk.x, 'base64url').toString('hex') === state.note.x && Buffer.from(jwk.y, 'base64url').toString('hex') === state.note.y, 'RECIPIENT_RECOVERY_KEY');
  if (state.invoiceSignature !== null) importRecipientInvoice(state.terms, invoiceFor(state));
  return { privateKey, publicKey: pub };
}

class RecipientCustody {
  #vault; #password; #revision; #state; #key; #busy = false; #closed = false;
  constructor(vault, cfg, record) {
    this.#vault = vault; this.#password = cfg.password; this.#revision = record.revision;
    this.#state = copy(record.data); this.#key = validateState(this.#state, cfg);
    Object.freeze(this);
  }
  #open() { need(!this.#closed, 'RECIPIENT_CLOSED'); }
  #approved() { this.#open(); need(this.#state.invoiceSignature !== null, 'RECIPIENT_ACK_REQUIRED'); }
  reviewCompensation() {
    this.#open();
    return { role: this.#state.terms.role, acknowledged: this.#state.invoiceSignature !== null,
      termsDigest: recipientTermsDigest(this.#state.terms), value: this.#state.note.value,
      ...commitments(this.#state.terms, this.#state.note) };
  }
  /** Recipient-local approval surface. Never expose this on owner IPC. */
  async acknowledgeCompensation(approval) {
    this.#open();
    exact(approval, ['termsDigest', 'value', 'paymentCommitment', 'localCommitment']);
    const review = this.reviewCompensation();
    for (const k of Object.keys(approval)) need(approval[k] === review[k], 'RECIPIENT_ACK_MISMATCH');
    need(!this.#busy, 'RECIPIENT_BUSY');
    if (this.#state.invoiceSignature !== null) return this.reviewCompensation();
    this.#busy = true;
    try {
      const next = { ...this.#state, invoiceSignature: signature(this.#key,
        invoiceFrame(this.#state.terms.scope, review.localCommitment, review.paymentCommitment)).toString('hex') };
      // Persist the exact approved signature before releasing any invoice.
      const record = await this.#vault.update(this.#password, this.#revision, () => next);
      this.#revision = record.revision; this.#state = record.data;
      return this.reviewCompensation();
    } finally { this.#busy = false; }
  }
  invoice(proposedTerms) {
    this.#approved();
    need(equal(validateRecipientTerms(proposedTerms), this.#state.terms), 'RECIPIENT_TERMS_MISMATCH');
    return invoiceFor(this.#state);
  }
  /** Necessary local acknowledgement guard, NOT a proof of funding, finality,
   * readiness or compensation availability. Existing adapters are not wired. */
  assertNativeExposureAcknowledged(input) {
    this.#approved();
    exact(input, ['terms', 'paymentCommitment', 'localCommitment']);
    need(equal(validateRecipientTerms(input.terms), this.#state.terms), 'RECIPIENT_TERMS_MISMATCH');
    const cm = commitments(this.#state.terms, this.#state.note);
    need(input.paymentCommitment === cm.paymentCommitment && input.localCommitment === cm.localCommitment, 'RECIPIENT_COMMITMENT_MISMATCH');
    return { acknowledged: true, ...cm };
  }
  /** Exact PC15 withdrawal only. The destination is pinned by recipient-local
   * bootstrap; this cannot sign arbitrary messages or send to an owner address.
   * Epoch/inclusion and actual mint/unspent status remain pool/proof checks. */
  authorizeWithdrawal(input) {
    this.#approved();
    exact(input, REQUEST);
    const request = copy(input), t = this.#state.terms, cm = commitments(t, this.#state.note);
    uint(request.epoch); uint(request.amount, true); hex(request.recipient, 20);
    need(request.scope === t.scope && request.policy === t.policy && request.paymentCommitment === cm.paymentCommitment &&
      request.recipient === this.#state.withdrawalRecipient && request.amount === this.#state.note.value, 'RECIPIENT_WITHDRAWAL_MISMATCH');
    return { ...request, signature: signature(this.#key,
      withdrawFrame(t.scope, t.policy, cm.paymentCommitment, raw(request.recipient), request.amount, request.epoch)).toString('hex') };
  }
  close() {
    need(!this.#busy, 'RECIPIENT_BUSY');
    this.#closed = true; this.#password = undefined; this.#state = undefined; this.#key = undefined;
    // JavaScript/OpenSSL garbage collection is not reliable secret zeroization.
  }
}

export async function createRecipientCustody(input) {
  const cfg = config(input), key = freshKey(), t = cfg.expectedTerms;
  const state = { version: 1, terms: t, withdrawalRecipient: cfg.withdrawalRecipient,
    privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    note: { type: 2, origin: t.origin, x: key.x.toString('hex'), y: key.y.toString('hex'), value: t.value, secret: randomBytes(32).toString('hex') },
    invoiceSignature: null };
  const vault = new Vault(cfg.path);
  return new RecipientCustody(vault, cfg, await vault.create(state, cfg.password));
}

export async function recoverRecipientCustody(input) {
  const cfg = config(input), vault = new Vault(cfg.path);
  return new RecipientCustody(vault, cfg, await vault.read(cfg.password));
}

/** Build exactly the unchanged withdraw circuit input from opening + constrained
 * recipient signature + depth-six membership path. The caller must authenticate
 * root acceptance/current epoch/unspentness through the actual pool. A host path
 * to a caller-invented root does not establish issuance or available funds. */
export function recipientWithdrawalInput(terms, invoice, authorization, path) {
  const { note } = importRecipientInvoice(terms, invoice);
  exact(authorization, [...REQUEST, 'signature']);
  const a = copy(authorization);
  uint(a.epoch); hex(a.recipient, 20);
  need(a.scope === terms.scope && a.policy === terms.policy && a.amount === note.value.toString() &&
    a.paymentCommitment === note.commitment.toString('hex'), 'RECIPIENT_WITHDRAWAL_MISMATCH');
  need(validSignature(invoice.note, withdrawFrame(a.scope, a.policy, a.paymentCommitment, raw(a.recipient), a.amount, a.epoch), a.signature), 'RECIPIENT_WITHDRAWAL_SIGNATURE');
  exact(path, ['index', 'leaf', 'root', 'siblings']);
  need(typeof path.root === 'string' && /^0x[0-9a-f]{64}$/.test(path.root) && Array.isArray(path.siblings) &&
    path.siblings.every(h => typeof h === 'string' && /^0x[0-9a-f]{64}$/.test(h)), 'RECIPIENT_MEMBERSHIP');
  need(path.leaf === `0x${a.paymentCommitment}` && verifyPrivateNotePath(path), 'RECIPIENT_MEMBERSHIP');
  return { scope: wordsBE(raw(a.scope)), policy: wordsBE(raw(a.policy)), epoch: a.epoch,
    root: wordsBE(raw(path.root.slice(2))), spent: wordsBE(nullifier(a.scope, note.commitment, note.secret)),
    amount: a.amount, recipient: wordsBE(raw(a.recipient)),
    siblings: path.siblings.map(h => bytes(raw(h.slice(2)))), leaf_index: String(path.index),
    note_type: note.type, note_origin: bytes(note.origin), key_x: bytes(note.x), key_y: bytes(note.y),
    value: note.value.toString(), secret: bytes(note.secret), signature: bytes(raw(a.signature)) };
}
