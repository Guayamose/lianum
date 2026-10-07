/**
 * Recipient-local A0 payout custody. Each profile owns one fresh secp256k1 key
 * and type-4 opening in an encrypted Vault. Offer data and withdrawal witnesses
 * are PRIVATE proof inputs, never public artifacts. No API exports a signer key.
 *
 * The invoice signer necessarily sees the private operation ID and canonical
 * slot. Execution-role packets have separate projections; a common operator can
 * combine views. Process separation is not a sandbox or non-collusion guarantee.
 * Trusted bootstrap, OS and exclusively controlled vault directory are required.
 * Vault durability/rollback/zeroization limitations apply unchanged.
 */
import { createPrivateKey, createPublicKey, randomBytes, verify } from 'node:crypto';
import { canonical, digest } from '../../../crypto/privacy.mjs';
import { Vault } from '../../../crypto/vault.mjs';
import { freshKey, signature, uintBE, wordsBE, nullifier } from '../../../notes/private-note-encoding.mjs';
import { walletNoteCommitment, walletWithdrawInput, balanceWithdrawFrame } from '../../../wallet/notes/private-wallet-note-encoding.mjs';
import { verifyPrivateNotePath } from '../../../notes/private-note-tree.mjs';
import { SECP256K1_ORDER } from '../../../crypto/private-native-certificate.mjs';
import { fundedFrame, fundedHash, FUNDED_DOMAINS, FUNDED_GRAPH_PROFILE } from '../../graph/funded-graph.mjs';
import { nativeTransferActionCommitment } from '../dispatch/native-capsules.mjs';
import { nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from '../dispatch/native-admission.mjs';

export const NATIVE_RECIPIENT_PROFILE = 'LIANUM_PAEG_TYPE4_RECIPIENT_V1';
const TERMS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId', 'slot', 'evidencePolicy', 'value', 'settleBefore', 'actionTemplate'];
const HASH_TERMS = ['scope', 'policy', 'asset', 'operationId', 'chainDomain', 'evidencePolicy', 'actionCommitment'];
const ACTION_TEMPLATE = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'amount',
  'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore'];
const OFFER = ['x', 'y', 'value', 'secret', 'randomness'];
const INVOICE = [...HASH_TERMS, 'slot', 'rho', 'payoutCommitment', 'settleBefore', 'action', 'deliveryRiskSalt'];
const WITHDRAW = ['scope', 'policy', 'payoutCommitment', 'recipient', 'amount', 'epoch', 'path'];
const WITNESS = ['scope', 'policy', 'epoch', 'root', 'spent', 'amount', 'recipient', 'siblings', 'leaf_index', 'rho', 'key_x', 'key_y', 'value', 'secret', 'signature'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = 'PAEG_RECIPIENT_INPUT') => { if (!ok) fail(code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
const raw = value => Buffer.from(value, 'hex');
function exact(value, fields) {
  canonical(value); // Reject accessors, proxies, hidden fields and coercions first.
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)));
}
function hash(value, width = 32, allowZero = false) {
  need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${width * 2}}$`).test(value));
  need(allowZero || value !== '0'.repeat(width * 2));
  return value;
}
function uint(value, positive = false) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value)
    && BigInt(value) < (1n << 64n) && (!positive || BigInt(value) > 0n));
  return value;
}
function checkSlot(slot) { need(Number.isInteger(slot) && slot >= 0 && slot < 4); }
function publicKey(opening) {
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: raw(opening.x).toString('base64url'), y: raw(opening.y).toString('base64url') } });
}
function validSignature(opening, message, signed) {
  try {
    hash(signed, 64, true);
    const s = BigInt('0x' + signed.slice(64));
    return s > 0n && s <= SECP256K1_ORDER / 2n
      && verify('sha256', message, { key: publicKey(opening), dsaEncoding: 'ieee-p1363' }, raw(signed));
  } catch { return false; }
}
export function validateNativeRecipientTerms(input) {
  exact(input, TERMS);
  const terms = copy(input);
  for (const key of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId', 'evidencePolicy']) hash(terms[key]);
  checkSlot(terms.slot); uint(terms.value, true); uint(terms.settleBefore, true);
  exact(terms.actionTemplate, ACTION_TEMPLATE);
  const template = terms.actionTemplate;
  for (const key of ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment']) hash(template[key]);
  need(typeof template.amount === 'string' && /^[1-9][0-9]{0,38}$/.test(template.amount)
    && BigInt(template.amount) < (1n << 128n));
  need(template.custodyKind === 1);
  for (const key of ['executionFrom', 'executionUntil', 'settleBefore']) uint(template[key]);
  need(BigInt(template.executionFrom) < BigInt(template.executionUntil)
    && BigInt(template.executionUntil) <= BigInt(template.settleBefore)
    && template.settleBefore === terms.settleBefore);
  return terms;
}
function checkOffer(offer) {
  exact(offer, OFFER);
  for (const key of ['x', 'y', 'secret', 'randomness']) hash(offer[key], 32, true);
  uint(offer.value, true); publicKey(offer);
}
function deriveNote(terms, offer) {
  const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin, [raw(terms.scope), raw(terms.policy), raw(terms.asset),
    raw(terms.operationId), uintBE(terms.slot, 1), raw(offer.randomness)]);
  return { type: 4, rho, x: offer.x, y: offer.y, value: offer.value, secret: offer.secret };
}
/** Private owner-side opening; no signer key is accepted or returned. */
export function nativeRecipientPayoutNote(expectedTerms, offer) {
  const terms = validateNativeRecipientTerms(expectedTerms);
  checkOffer(offer);
  need(offer.value === terms.value, 'PAEG_RECIPIENT_VALUE_MISMATCH');
  return deriveNote(terms, offer);
}
/** Own action only. Pinning its template before offer creation avoids the cycle
 * payout -> delivery-risk -> action commitment. The fixed clause permits full
 * owner refund and provider delivery loss; it promises no provider recovery. */
export function nativeRecipientInvoiceRequest(expectedTerms, offer, actionTerms) {
  const terms = validateNativeRecipientTerms(expectedTerms), note = nativeRecipientPayoutNote(terms, offer);
  exact(actionTerms, ['action', 'deliveryRiskSalt']);
  const action = copy(actionTerms.action), deliveryRiskSalt = hash(actionTerms.deliveryRiskSalt);
  const actionCommitment = nativeTransferActionCommitment(action);
  const template = Object.fromEntries(ACTION_TEMPLATE.map(key => [key, action[key]]));
  need(equal(template, terms.actionTemplate), 'PAEG_RECIPIENT_ACTION_MISMATCH');
  const payoutCommitment = walletNoteCommitment(terms.scope, terms.policy, note).toString('hex');
  const risk = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: terms.hubDomain, registryCommitment: terms.registryCommitment,
    chainDomain: action.chainDomain, sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount,
    scope: terms.scope, policy: terms.policy, asset: terms.asset, payoutCommitment,
    settleBefore: terms.settleBefore, salt: deliveryRiskSalt });
  need(action.deliveryRiskCommitment === risk, 'PAEG_RECIPIENT_DELIVERY_RISK');
  return { ...Object.fromEntries(['scope', 'policy', 'asset', 'operationId', 'slot', 'evidencePolicy', 'settleBefore'].map(key => [key, terms[key]])),
    chainDomain: action.chainDomain, actionCommitment, rho: note.rho, payoutCommitment, action, deliveryRiskSalt };
}
function checkInvoice(input) {
  exact(input, INVOICE);
  const request = copy(input);
  HASH_TERMS.forEach(key => hash(request[key]));
  for (const key of ['rho', 'payoutCommitment', 'deliveryRiskSalt']) hash(request[key]);
  need(nativeTransferActionCommitment(request.action) === request.actionCommitment, 'PAEG_RECIPIENT_ACTION_MISMATCH');
  checkSlot(request.slot); uint(request.settleBefore, true);
  return request;
}
/** Byte-identical to payoutInvoiceMessage(): H4, including the A0 profile tag.
 * rho/value are verified through the derived payout commitment, not appended. */
export function nativeRecipientInvoiceMessage(input) {
  const request = checkInvoice(input);
  return fundedFrame(FUNDED_DOMAINS.invoice, [Buffer.from(FUNDED_GRAPH_PROFILE.id),
    ...['scope', 'policy', 'asset', 'operationId'].map(key => raw(request[key])), uintBE(request.slot, 1),
    ...['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(key => raw(request[key])),
    uintBE(request.settleBefore, 8)]);
}
function resultFor(state) {
  need(state.invoice !== null, 'PAEG_RECIPIENT_INVOICE_REQUIRED');
  return { invoiceSignature: state.invoice.signature, note: deriveNote(state.terms, state.offer),
    payoutCommitment: state.invoice.request.payoutCommitment };
}
function config(input) {
  exact(input, ['path', 'password', 'expectedTerms', 'withdrawalRecipient']);
  need(typeof input.path === 'string' && input.path.length > 0 && !input.path.includes('\0'));
  need(typeof input.password === 'string' && input.password.length > 0 && Buffer.byteLength(input.password) <= 1024);
  hash(input.withdrawalRecipient, 20);
  return { ...copy(input), expectedTerms: validateNativeRecipientTerms(input.expectedTerms) };
}
function checkPath(path, commitment) {
  exact(path, ['index', 'leaf', 'root', 'siblings']);
  need(Number.isInteger(path.index) && path.index >= 0 && path.index < 64, 'PAEG_RECIPIENT_MEMBERSHIP');
  need(typeof path.leaf === 'string' && /^0x[0-9a-f]{64}$/.test(path.leaf)
    && typeof path.root === 'string' && /^0x[0-9a-f]{64}$/.test(path.root)
    && Array.isArray(path.siblings) && path.siblings.length === 6
    && path.siblings.every(value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value)), 'PAEG_RECIPIENT_MEMBERSHIP');
  need(path.leaf === '0x' + commitment && verifyPrivateNotePath(path), 'PAEG_RECIPIENT_MEMBERSHIP');
}
function withdrawalRequest(state, input) {
  need(state.invoice !== null, 'PAEG_RECIPIENT_INVOICE_REQUIRED');
  exact(input, WITHDRAW);
  const request = copy(input), terms = state.terms;
  uint(request.epoch); uint(request.amount, true); hash(request.recipient, 20);
  need(request.scope === terms.scope && request.policy === terms.policy
    && request.payoutCommitment === state.invoice.request.payoutCommitment
    && request.recipient === state.withdrawalRecipient && request.amount === state.offer.value,
  'PAEG_RECIPIENT_WITHDRAWAL_MISMATCH');
  checkPath(request.path, request.payoutCommitment);
  return request;
}
function witnessFields(state, request) {
  const note = deriveNote(state.terms, state.offer), path = request.path;
  return { scope: wordsBE(raw(request.scope)), policy: wordsBE(raw(request.policy)), epoch: request.epoch,
    root: wordsBE(raw(path.root.slice(2))),
    spent: wordsBE(nullifier(request.scope, request.payoutCommitment, note.secret)),
    amount: request.amount, recipient: wordsBE(raw(request.recipient)),
    siblings: path.siblings.map(value => [...raw(value.slice(2))]), leaf_index: String(path.index),
    rho: [...raw(note.rho)], key_x: [...raw(note.x)], key_y: [...raw(note.y)], value: note.value, secret: [...raw(note.secret)] };
}
function validateState(state, cfg) {
  exact(state, ['version', 'profile', 'terms', 'withdrawalRecipient', 'privateKeyPem', 'offer', 'invoice', 'withdrawal']);
  need(state.version === 1 && state.profile === NATIVE_RECIPIENT_PROFILE
    && equal(state.terms, cfg.expectedTerms) && state.withdrawalRecipient === cfg.withdrawalRecipient,
  'PAEG_RECIPIENT_RECOVERY_BINDING');
  checkOffer(state.offer);
  need(state.offer.value === state.terms.value, 'PAEG_RECIPIENT_RECOVERY_BINDING');
  need(typeof state.privateKeyPem === 'string' && state.privateKeyPem.length < 4096
    && state.privateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----'), 'PAEG_RECIPIENT_RECOVERY_KEY');
  const privateKey = createPrivateKey(state.privateKeyPem);
  need(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails.namedCurve === 'secp256k1', 'PAEG_RECIPIENT_RECOVERY_KEY');
  const pub = createPublicKey(privateKey), jwk = pub.export({ format: 'jwk' });
  need(Buffer.from(jwk.x, 'base64url').toString('hex') === state.offer.x
    && Buffer.from(jwk.y, 'base64url').toString('hex') === state.offer.y, 'PAEG_RECIPIENT_RECOVERY_KEY');
  if (state.invoice !== null) {
    exact(state.invoice, ['request', 'signature']);
    need(equal(checkInvoice(state.invoice.request), nativeRecipientInvoiceRequest(state.terms, state.offer, { action: state.invoice.request.action, deliveryRiskSalt: state.invoice.request.deliveryRiskSalt })), 'PAEG_RECIPIENT_RECOVERY_INVOICE');
    need(validSignature(state.offer, nativeRecipientInvoiceMessage(state.invoice.request), state.invoice.signature), 'PAEG_RECIPIENT_RECOVERY_INVOICE');
  }
  if (state.withdrawal !== null) {
    exact(state.withdrawal, ['request', 'witness']);
    const request = withdrawalRequest(state, state.withdrawal.request), witness = state.withdrawal.witness;
    exact(witness, WITNESS);
    const { signature: sig, ...fields } = witness;
    need(equal(fields, witnessFields(state, request)) && Array.isArray(sig) && sig.length === 64
      && sig.every(byte => Number.isInteger(byte) && byte >= 0 && byte < 256), 'PAEG_RECIPIENT_RECOVERY_WITHDRAWAL');
    need(validSignature(state.offer, balanceWithdrawFrame(request.scope, request.policy, request.payoutCommitment,
      request.recipient, request.amount, request.epoch), Buffer.from(sig).toString('hex')), 'PAEG_RECIPIENT_RECOVERY_WITHDRAWAL');
  }
  return { privateKey, publicKey: pub };
}

class NativeRecipientCustody {
  #vault; #password; #revision; #state; #key; #busy = false; #closed = false; #uncertain = false;
  constructor(vault, cfg, record) {
    this.#vault = vault; this.#password = cfg.password; this.#revision = record.revision;
    this.#state = copy(record.data); this.#key = validateState(this.#state, cfg);
    Object.freeze(this);
  }
  #open() {
    need(!this.#closed, 'PAEG_RECIPIENT_CLOSED');
    need(!this.#uncertain, 'PAEG_RECIPIENT_RECOVERY_REQUIRED');
    need(!this.#busy, 'PAEG_RECIPIENT_BUSY');
  }
  async #persist(next) {
    this.#busy = true;
    try {
      const record = await this.#vault.update(this.#password, this.#revision, () => next);
      this.#revision = record.revision; this.#state = record.data;
    } catch (error) {
      // Rename may have happened before an I/O error. Never acknowledge or issue
      // another signature from stale memory. Recovery authenticates actual disk.
      this.#uncertain = true;
      throw error;
    } finally { this.#busy = false; }
  }
  offer() { this.#open(); return copy(this.#state.offer); }
  /** Provider-facing acceptance only. Invoice operation/slot and the private
   * payout opening stay with recipient custody; no new signature is issued. */
  acceptedQuote() {
    this.#open();
    need(this.#state.invoice !== null, 'PAEG_RECIPIENT_INVOICE_REQUIRED');
    const invoice = this.#state.invoice.request, terms = this.#state.terms;
    return copy({ scope: terms.scope, policy: terms.policy, asset: terms.asset,
      hubDomain: terms.hubDomain, registryCommitment: terms.registryCommitment,
      action: invoice.action, payoutCommitment: invoice.payoutCommitment,
      deliveryRiskSalt: invoice.deliveryRiskSalt });
  }
  async acceptInvoice(input) {
    this.#open();
    const request = checkInvoice(input);
    need(equal(request, nativeRecipientInvoiceRequest(this.#state.terms, this.#state.offer, { action: request.action, deliveryRiskSalt: request.deliveryRiskSalt })), 'PAEG_RECIPIENT_INVOICE_MISMATCH');
    if (this.#state.invoice !== null) {
      need(equal(request, this.#state.invoice.request), 'PAEG_RECIPIENT_INVOICE_REBIND');
      return resultFor(this.#state);
    }
    const invoice = { request, signature: signature(this.#key, nativeRecipientInvoiceMessage(request)).toString('hex') };
    await this.#persist({ ...this.#state, invoice });
    return resultFor(this.#state);
  }
  /** Public reconciliation material only. This does not establish whether a
   * pool has issued/spent the payout or which root/epoch the chain accepts. */
  withdrawalStatus() {
    this.#open();
    need(this.#state.invoice !== null, 'PAEG_RECIPIENT_INVOICE_REQUIRED');
    const state = this.#state, payoutCommitment = state.invoice.request.payoutCommitment;
    return {
      scope: state.terms.scope, policy: state.terms.policy, payoutCommitment,
      recipient: state.withdrawalRecipient, amount: state.offer.value,
      canonicalNullifier: nullifier(state.terms.scope, payoutCommitment, state.offer.secret).toString('hex'),
      authorization: state.withdrawal === null ? null : {
        epoch: state.withdrawal.request.epoch, root: state.withdrawal.request.path.root,
        hash: digest('LIANUM/PAEG/recipient-withdrawal-authorization/1', state.withdrawal),
      },
    };
  }
  /** Supplied membership must be for this exact payout. The trusted caller must
   * reconcile actual pool issuance, accepted root, epoch and unspentness before
   * EVERY call, including retries and renewals. A locally consistent path alone
   * does not authenticate chain state. Epoch/path may refresh without changing
   * scope, policy, payout, recipient, amount, opening or canonical nullifier.
   * The latest request/witness replaces the previous one durably before reply;
   * an exact retry of that latest request returns its retained signature. All
   * versions spend the same canonical nullifier, enforced by the actual pool.
   * No renewal-count cap or unbounded history can strand a delayed withdrawal. */
  async authorizeWithdrawal(input) {
    this.#open();
    const request = withdrawalRequest(this.#state, input);
    if (this.#state.withdrawal !== null && equal(request, this.#state.withdrawal.request)) {
      return copy(this.#state.withdrawal.witness);
    }
    const note = { ...deriveNote(this.#state.terms, this.#state.offer), ...this.#key };
    const witness = walletWithdrawInput({ scope: request.scope, policy: request.policy, epoch: request.epoch,
      note, path: request.path, recipient: request.recipient });
    if (this.#state.withdrawal !== null) {
      need(equal(witness.spent, this.#state.withdrawal.witness.spent), 'PAEG_RECIPIENT_WITHDRAWAL_MISMATCH');
    }
    await this.#persist({ ...this.#state, withdrawal: { request, witness } });
    return copy(this.#state.withdrawal.witness);
  }
  close() {
    need(!this.#busy, 'PAEG_RECIPIENT_BUSY');
    this.#closed = true; this.#password = undefined; this.#state = undefined; this.#key = undefined;
  }
}

export async function createNativeRecipientCustody(input) {
  const cfg = config(input), key = freshKey();
  const state = { version: 1, profile: NATIVE_RECIPIENT_PROFILE, terms: cfg.expectedTerms,
    withdrawalRecipient: cfg.withdrawalRecipient, privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    offer: { x: key.x.toString('hex'), y: key.y.toString('hex'), value: cfg.expectedTerms.value,
      secret: randomBytes(32).toString('hex'), randomness: randomBytes(32).toString('hex') },
    invoice: null, withdrawal: null };
  const vault = new Vault(cfg.path);
  return new NativeRecipientCustody(vault, cfg, await vault.create(state, cfg.password));
}
export async function recoverNativeRecipientCustody(input) {
  const cfg = config(input), vault = new Vault(cfg.path);
  return new NativeRecipientCustody(vault, cfg, await vault.read(cfg.password));
}
