/** Native-claim byte contracts. SHA digests remain raw B32; only the existing
 * pool domain, typed receipt leaf and revocation state use canonical fields.
 * These codecs establish bytes, not deployment identity, custody or solvency. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, fixedArray, bytes32, canonicalField, digestBytes, digestWords, ZERO }
  from '../paeg/commitments.mjs';

export const CLAIM_TAGS = Object.freeze({
  domain: 'LIANUM/PAEG/native-claim-domain/1',
  receiptSecret: 'LIANUM/PAEG/native-claim-receipt-secret/1',
  refundSalt: 'LIANUM/PAEG/native-claim-refund-salt/1',
  destination: 'LIANUM/PAEG/native-claim-destination/1',
  ingressReceipt: 'LIANUM/PAEG/native-claim-ingress-receipt/1',
  intent: 'LIANUM/PAEG/native-claim-intent/1',
  ticket: 'LIANUM/PAEG/native-claim-ticket/1',
  ticketId: 'LIANUM/PAEG/native-claim-ticket-id/1',
  ticketSecret: 'LIANUM/PAEG/native-claim-ticket-secret/1',
  verifierSet: 'LIANUM/PAEG/native-claim-verifier-set/1',
});
export const CLAIM_TICKET_KINDS = Object.freeze({ REDEEM: '1', REFUND: '2' });
export const CLAIM_CONFIG_SCHEMA = Object.freeze([
  ['evmChainId', 'u256'], ['evmGenesis', 'b32'],
  ['gateway', 'address'], ['gatewayCodeHash', 'b32'],
  ['wrapper', 'address'], ['wrapperCodeHash', 'b32'],
  ['pool', 'address'], ['poolCodeHash', 'b32'], ['poolDomain', 'field32'],
  ['scope', 'b32'], ['policy', 'b32'], ['wrapperAssetIdentity', 'b32'],
  ['hub', 'address'], ['hubCodeHash', 'b32'], ['hubDomain', 'b32'],
  ['ledgerNamespace', 'b32'], ['registryCommitment', 'b32'],
  ['claimVerifierSetCommitment', 'b32'], ['nativeFamily', 'u8'],
  ['nativeGenesis', 'b32'], ['nativeAsset', 'b32'], ['nativeRuleCommitment', 'b32'],
  ['escrowEndpointCommitment', 'b32'], ['custodyInventoryDomain', 'b32'], ['refundMaxFee', 'u64'],
].map(Object.freeze));
export const CLAIM_TICKET_FIELDS = Object.freeze(['kind', 'id', 'claimDomain', 'amount',
  'destinationCommitment', 'maxFee', 'referenceIngressN', 'referenceQ']);
export const CLAIM_INGRESS_FIELDS = Object.freeze(['claimDomain', 'outputQ', 'admissionN',
  'refundDestination', 'admissionRevocationState', 'ingressReceiptLeaf', 'amountQ', 'evidenceFrom', 'evidenceUntil']);
export const CLAIM_DISCHARGE_FIELDS = Object.freeze(['claimDomain', 'ticketId', 'ticketCommitment',
  'dischargeN', 'admissionRevocationState', 'evidenceFrom', 'evidenceUntil']);
export const CLAIM_INGRESS_PUBLIC_WORDS = 51;
export const CLAIM_DISCHARGE_PUBLIC_WORDS = 42;
const snake = name => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export function claimUint(value, bits = 64) {
  assert.equal(typeof value, 'string', 'CLAIM_DECIMAL_STRING');
  assert.ok(value.length > 0 && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'CLAIM_CANONICAL_UINT');
  const result = BigInt(value);
  assert.equal(result.toString(), value, 'CLAIM_CANONICAL_UINT');
  assert.ok(result < (1n << BigInt(bits)), 'CLAIM_UINT_RANGE');
  return result;
}
function uintBytes(value, width) {
  return Buffer.from(claimUint(value, width * 8).toString(16).padStart(width * 2, '0'), 'hex');
}
function hex(value, width, nonzero = false) {
  assert.equal(typeof value, 'string', 'CLAIM_HEX_STRING');
  assert.equal(value.length, width * 2, 'CLAIM_HEX_WIDTH');
  assert.match(value, /^[0-9a-f]+$/, 'CLAIM_HEX_ENCODING');
  if (nonzero) assert.notEqual(value, '0'.repeat(width * 2), 'CLAIM_ZERO');
  return Buffer.from(value, 'hex');
}
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => {
    const size = Buffer.alloc(4); size.writeUInt32BE(part.length); return [size, part];
  }));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = (tag, parts) => hash(frame(tag, parts));
const b32 = value => Buffer.from(bytes32(value, true), 'hex');

export function validateClaimConfig(config) {
  exactRecord(config, CLAIM_CONFIG_SCHEMA.map(([name]) => name));
  for (const [name, type] of CLAIM_CONFIG_SCHEMA) {
    if (type.startsWith('u')) claimUint(config[name], Number(type.slice(1)));
    else if (type === 'address') hex(config[name], 20, true);
    else if (type === 'field32') canonicalField(config[name], true);
    else bytes32(config[name], true);
  }
  assert.ok(claimUint(config.evmChainId, 256) > 0n, 'CLAIM_EVM_CHAIN');
  assert.ok(['1', '2'].includes(config.nativeFamily), 'CLAIM_NATIVE_FAMILY');
  assert.equal(config.ledgerNamespace, config.hubDomain, 'CLAIM_INITIAL_NAMESPACE');
  assert.notEqual(config.nativeAsset, config.wrapperAssetIdentity, 'CLAIM_DISTINCT_ASSETS');
  return freeze(structuredClone(config));
}
export function claimDomainFrame(config) {
  const value = validateClaimConfig(config);
  return frame(CLAIM_TAGS.domain, CLAIM_CONFIG_SCHEMA.map(([name, type]) =>
    type.startsWith('u') ? uintBytes(value[name], Number(type.slice(1)) / 8)
      : hex(value[name], type === 'address' ? 20 : 32)));
}
export function claimDomainCommitment(config) { return hash(claimDomainFrame(config)); }
export function claimConfigToNoir(config) {
  const value = validateClaimConfig(config);
  return Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [snake(name),
    type === 'u256' ? [...uintBytes(value[name], 32)]
      : type.startsWith('u') ? value[name] : [...hex(value[name], type === 'address' ? 20 : 32)]]));
}

/** Separate two-role set; never modifies the original twelve-role set.
 * Source/key commitments are authenticated provenance, not caller assertions. */
export function claimVerifierSetFrame(roles) {
  fixedArray(roles, 2);
  const parts = [Buffer.from('LIANUM_PAEG_P2_V1', 'ascii')];
  for (let index = 0; index < 2; index++) {
    const role = roles[index];
    exactRecord(role, ['role', 'address', 'codeHash', 'width', 'sourceCommitment', 'keyCommitment']);
    assert.equal(role.role, String(index), 'CLAIM_VERIFIER_ROLE');
    assert.equal(role.width, index === 0 ? '51' : '42', 'CLAIM_VERIFIER_WIDTH');
    parts.push(uintBytes(role.role, 1), hex(role.address, 20, true), b32(role.codeHash),
      uintBytes(role.width, 4), b32(role.sourceCommitment), b32(role.keyCommitment));
  }
  return frame(CLAIM_TAGS.verifierSet, parts);
}
export function claimVerifierSetCommitment(roles) { return hash(claimVerifierSetFrame(roles)); }

function openingHash(tag, input) {
  exactRecord(input, ['claimDomain', 'noteSecret', 'outputQ']);
  return digest(tag, [b32(input.claimDomain), b32(input.noteSecret), b32(input.outputQ)]);
}
export function claimReceiptSecret(input) { return openingHash(CLAIM_TAGS.receiptSecret, input); }
export function claimRefundSalt(input) { return openingHash(CLAIM_TAGS.refundSalt, input); }
export function claimDestinationCommitment(input) {
  exactRecord(input, ['claimDomain', 'nativeChainDomain', 'endpoint', 'amount', 'maxFee', 'salt']);
  assert.ok(claimUint(input.amount) > 0n, 'CLAIM_POSITIVE_AMOUNT');
  return digest(CLAIM_TAGS.destination, [b32(input.claimDomain), b32(input.nativeChainDomain),
    b32(input.endpoint), uintBytes(input.amount, 8), uintBytes(input.maxFee, 8), hex(input.salt, 32)]);
}
export function claimIngressReceiptCommitment(input) {
  exactRecord(input, ['claimDomain', 'outputQ', 'amount', 'admissionN', 'refundDestination']);
  assert.ok(claimUint(input.amount) > 0n, 'CLAIM_POSITIVE_AMOUNT');
  return digest(CLAIM_TAGS.ingressReceipt, [b32(input.claimDomain), b32(input.outputQ),
    uintBytes(input.amount, 8), b32(input.admissionN), b32(input.refundDestination)]);
}
export function claimIntentId(input) {
  exactRecord(input, ['claimDomain', 'outputQ', 'amount']);
  assert.ok(claimUint(input.amount) > 0n, 'CLAIM_POSITIVE_AMOUNT');
  return digest(CLAIM_TAGS.intent, [b32(input.claimDomain), b32(input.outputQ), uintBytes(input.amount, 8)]);
}
function ticketKind(kind) { assert.ok(Object.values(CLAIM_TICKET_KINDS).includes(kind), 'CLAIM_TICKET_KIND'); }
export function validateClaimTicket(ticket) {
  exactRecord(ticket, CLAIM_TICKET_FIELDS); ticketKind(ticket.kind);
  for (const name of ['id', 'claimDomain', 'destinationCommitment']) bytes32(ticket[name], true);
  assert.ok(claimUint(ticket.amount) > 0n, 'CLAIM_POSITIVE_AMOUNT'); claimUint(ticket.maxFee);
  for (const name of ['referenceIngressN', 'referenceQ']) {
    bytes32(ticket[name], ticket.kind === CLAIM_TICKET_KINDS.REFUND);
    if (ticket.kind === CLAIM_TICKET_KINDS.REDEEM) assert.equal(ticket[name], ZERO, 'CLAIM_REDEEM_REFERENCE');
  }
  return freeze(structuredClone(ticket));
}
export function claimTicketFrame(ticket) {
  const t = validateClaimTicket(ticket);
  return frame(CLAIM_TAGS.ticket, [uintBytes(t.kind, 1), b32(t.id), b32(t.claimDomain), uintBytes(t.amount, 8),
    b32(t.destinationCommitment), uintBytes(t.maxFee, 8), hex(t.referenceIngressN, 32), hex(t.referenceQ, 32)]);
}
export function claimTicketCommitment(ticket) { return hash(claimTicketFrame(ticket)); }
export function claimTicketToNoir(ticket) {
  const t = validateClaimTicket(ticket);
  return Object.fromEntries(CLAIM_TICKET_FIELDS.map(name => [snake(name),
    ['kind', 'amount', 'maxFee'].includes(name) ? t[name] : digestBytes(t[name])]));
}
export function claimTicketId(input) {
  exactRecord(input, ['claimDomain', 'kind', 'nonce']); ticketKind(input.kind);
  return digest(CLAIM_TAGS.ticketId, [b32(input.claimDomain), uintBytes(input.kind, 1), uintBytes(input.nonce, 8)]);
}
export function claimTicketSecret(input) {
  exactRecord(input, ['claimDomain', 'ticketId']);
  return digest(CLAIM_TAGS.ticketSecret, [b32(input.claimDomain), b32(input.ticketId)]);
}

/** Exact existing native-endpoint/2 frame. Bootstrap must authenticate the
 * escrow bytes and ownership; matching user-supplied bytes cannot do that. */
export function nativeClaimEndpointCommitment(input) {
  exactRecord(input, ['family', 'genesis', 'asset', 'endpoint']);
  assert.ok(['1', '2'].includes(input.family), 'CLAIM_NATIVE_FAMILY');
  const btc = input.family === '1', raw = hex(input.endpoint, btc ? 22 : 32);
  if (btc) assert.match(input.endpoint, /^0014[0-9a-f]{40}$/, 'CLAIM_BTC_ENDPOINT');
  return digest('LIANUM/PAEG/native-endpoint/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii'),
    Buffer.from(btc ? 'BTC' : 'SOL', 'ascii'), b32(input.genesis), b32(input.asset),
    Buffer.from(btc ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY', 'ascii'), raw]);
}

function validateStatement(statement, fields) {
  exactRecord(statement, fields);
  for (const name of fields) {
    if (['amountQ', 'evidenceFrom', 'evidenceUntil'].includes(name)) claimUint(statement[name]);
    else if (['admissionRevocationState', 'ingressReceiptLeaf'].includes(name)) canonicalField(statement[name], true);
    else bytes32(statement[name], true);
  }
  if (fields === CLAIM_INGRESS_FIELDS) assert.ok(claimUint(statement.amountQ) > 0n, 'CLAIM_POSITIVE_AMOUNT');
  assert.ok(claimUint(statement.evidenceFrom) < claimUint(statement.evidenceUntil), 'CLAIM_EVIDENCE_WINDOW');
  return freeze(structuredClone(statement));
}
export function validateClaimIngressStatement(statement) { return validateStatement(statement, CLAIM_INGRESS_FIELDS); }
export function validateClaimDischargeStatement(statement) { return validateStatement(statement, CLAIM_DISCHARGE_FIELDS); }
function encode(statement, fields) {
  const checked = validateStatement(statement, fields);
  return Object.freeze(fields.flatMap(name => ['amountQ', 'evidenceFrom', 'evidenceUntil'].includes(name)
    ? [checked[name]] : digestWords(checked[name]).map(String)));
}
export function encodeClaimIngressInputs(statement) { return encode(statement, CLAIM_INGRESS_FIELDS); }
export function encodeClaimDischargeInputs(statement) { return encode(statement, CLAIM_DISCHARGE_FIELDS); }
function decode(words, fields, width) {
  fixedArray(words, width); let offset = 0;
  const statement = Object.fromEntries(fields.map(name => {
    if (['amountQ', 'evidenceFrom', 'evidenceUntil'].includes(name)) return [name, words[offset++]];
    const bytes = Buffer.alloc(32);
    for (let i = 0; i < 8; i++) bytes.writeUInt32BE(Number(claimUint(words[offset++], 32)), i * 4);
    return [name, bytes.toString('hex')];
  }));
  return validateStatement(statement, fields);
}
export function decodeClaimIngressInputs(words) { return decode(words, CLAIM_INGRESS_FIELDS, CLAIM_INGRESS_PUBLIC_WORDS); }
export function decodeClaimDischargeInputs(words) { return decode(words, CLAIM_DISCHARGE_FIELDS, CLAIM_DISCHARGE_PUBLIC_WORDS); }
