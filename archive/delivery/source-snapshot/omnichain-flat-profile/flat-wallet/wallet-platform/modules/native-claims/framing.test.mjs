/** Static Noir/H4 conformance plus host encoding checks. Reading the new
 * source does not compile it or establish circuit constraints/proof validity. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CLAIM_CONFIG_SCHEMA, CLAIM_INGRESS_FIELDS, CLAIM_DISCHARGE_FIELDS,
  claimDomainFrame, claimDomainCommitment, claimConfigToNoir, validateClaimConfig,
  claimReceiptSecret, claimRefundSalt, claimDestinationCommitment, claimIngressReceiptCommitment,
  claimIntentId, claimTicketId, claimTicketSecret, claimTicketFrame, claimTicketCommitment,
  claimVerifierSetFrame, claimVerifierSetCommitment, nativeClaimEndpointCommitment,
  encodeClaimIngressInputs, decodeClaimIngressInputs, encodeClaimDischargeInputs, decodeClaimDischargeInputs }
  from './framing.mjs';
import { ZERO, FIELD_MODULUS } from '../paeg/commitments.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const h = label => hash(Buffer.from('CLAIM-CODEC-FIXTURE/' + label));
const u = (value, width) => Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex');
const b = value => Buffer.from(value, 'hex');
const frame = (tag, parts) => Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(value => [u(value.length, 4), value]));
const snake = name => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const source = readFileSync(new URL('../../../proof-relations/native-claim-lib/src/framing.nr', import.meta.url), 'utf8');
function configFixture() {
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? h(name).slice(0, 40) : type === 'u256' ? ((1n << 255n) + 31337n).toString()
      : type === 'u64' ? '100' : type === 'u8' ? '2' : type === 'field32' ? '01' + h(name).slice(2) : h(name)]));
  config.ledgerNamespace = config.hubDomain;
  return config;
}

/** Interpret only explicit fixed-frame writes, then independently hash bytes.
 * This catches tag, field order, width, offset and fixed SHA-padding mistakes. */
function noirFrame(name, variables) {
  const fn = source.match(new RegExp('pub fn ' + name + '\\([\\s\\S]*?\n}'))?.[0];
  assert.ok(fn, name);
  const length = Number(fn.match(/let mut message: \[u8; (\d+)\]/)?.[1]);
  const result = Buffer.alloc(length); let end = 0;
  for (const match of fn.matchAll(/message = part\(message, (\d+), ([^\n]+)\);/g)) {
    const offset = Number(match[1]), expression = match[2];
    const value = /^\[(?:\d+,?\s*)+\]$/.test(expression) ? Buffer.from(JSON.parse(expression)) : variables[expression];
    assert.ok(Buffer.isBuffer(value), name + ': ' + expression);
    assert.equal(offset, end, name + ': contiguous frame');
    result.writeUInt32BE(value.length, offset); value.copy(result, offset + 4); end += 4 + value.length;
  }
  assert.equal(end, length, name + ': frame width');
  const sha = fn.match(/sha256::<(\d+), (\d+)>/);
  assert.equal(Number(sha[1]), length);
  assert.equal(Number(sha[2]), Math.ceil((length + 9) / 64) * 64);
  return result;
}

test('claim domain includes all 25 ordered fields, raw u256/addresses and full source struct', () => {
  const c = configFixture(), variables = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [
    type === 'u8' ? '[config.' + snake(name) + ']' : type === 'u64' ? 'u64_bytes(config.' + snake(name) + ')' : 'config.' + snake(name),
    type.startsWith('u') ? u(c[name], Number(type.slice(1)) / 8) : b(c[name]) ]));
  const encoded = noirFrame('claim_domain', variables);
  assert.deepEqual(encoded, claimDomainFrame(c)); assert.equal(hash(encoded), claimDomainCommitment(c));
  assert.equal(encoded.length, 834);
  const typeSource = readFileSync(new URL('../../../proof-relations/native-claim-lib/src/types.nr', import.meta.url), 'utf8');
  const names = [...typeSource.match(/pub struct ClaimConfig \{([\s\S]*?)\n}/)[1].matchAll(/pub (\w+):/g)].map(match => match[1]);
  assert.deepEqual(names, CLAIM_CONFIG_SCHEMA.map(([name]) => snake(name)));
  assert.deepEqual(Object.keys(claimConfigToNoir(c)), names);
  assert.equal(Buffer.from(claimConfigToNoir(c).evm_chain_id).toString('hex'), u(c.evmChainId, 32).toString('hex'));
  for (const name of ['evmGenesis', 'gatewayCodeHash', 'wrapperCodeHash', 'poolCodeHash', 'hubCodeHash',
    'claimVerifierSetCommitment', 'custodyInventoryDomain', 'escrowEndpointCommitment'])
    assert.notEqual(claimDomainCommitment({ ...c, [name]: h('changed-' + name) }), claimDomainCommitment(c));
});

test('every new circuit SHA frame matches host tag, order, widths and offsets', () => {
  const claimDomain = h('domain'), noteSecret = h('secret'), outputQ = h('Q'), endpoint = h('endpoint'),
    nativeChainDomain = h('chain'), salt = h('salt'), admissionN = h('N'), refundDestination = h('refund'), amount = '123', maxFee = '9';
  const opening = { claimDomain, noteSecret, outputQ }, openingVars = {
    claim_domain: b(claimDomain), note_secret: b(noteSecret), output_q: b(outputQ) };
  assert.equal(hash(noirFrame('receipt_secret', openingVars)), claimReceiptSecret(opening));
  assert.equal(hash(noirFrame('refund_salt', openingVars)), claimRefundSalt(opening));
  assert.notEqual(claimReceiptSecret(opening), claimRefundSalt(opening));
  const destinationVars = { claim_domain: b(claimDomain), native_chain_domain: b(nativeChainDomain), endpoint: b(endpoint),
    'u64_bytes(amount)': u(amount, 8), 'u64_bytes(max_fee)': u(maxFee, 8), salt: b(salt) };
  assert.equal(hash(noirFrame('destination_commitment', destinationVars)), claimDestinationCommitment({
    claimDomain, nativeChainDomain, endpoint, amount, maxFee, salt }));
  assert.equal(hash(noirFrame('ingress_receipt_commitment', { claim_domain: b(claimDomain), output_q: b(outputQ),
    'u64_bytes(amount)': u(amount, 8), admission_n: b(admissionN), refund_destination: b(refundDestination) })),
  claimIngressReceiptCommitment({ claimDomain, outputQ, amount, admissionN, refundDestination }));
  assert.equal(hash(noirFrame('claim_intent_id', { claim_domain: b(claimDomain), output_q: b(outputQ), 'u64_bytes(amount)': u(amount, 8) })),
    claimIntentId({ claimDomain, outputQ, amount }));
  const ticketId = claimTicketId({ claimDomain, kind: '2', nonce: '7' });
  assert.equal(hash(noirFrame('ticket_id', { claim_domain: b(claimDomain), '[kind]': u(2, 1), 'u64_bytes(nonce)': u(7, 8) })), ticketId);
  assert.equal(hash(noirFrame('ticket_secret', { claim_domain: b(claimDomain), ticket_id: b(ticketId) })),
    claimTicketSecret({ claimDomain, ticketId }));
  const ticket = { kind: '2', id: ticketId, claimDomain, amount, destinationCommitment: refundDestination,
    maxFee, referenceIngressN: admissionN, referenceQ: outputQ };
  const variables = Object.fromEntries(Object.entries(ticket).map(([name, value]) => [
    name === 'kind' ? '[ticket.kind]' : ['amount', 'maxFee'].includes(name) ? 'u64_bytes(ticket.' + snake(name) + ')' : 'ticket.' + snake(name),
    name === 'kind' ? u(value, 1) : ['amount', 'maxFee'].includes(name) ? u(value, 8) : b(value)]));
  assert.deepEqual(noirFrame('ticket_commitment', variables), claimTicketFrame(ticket));
  assert.equal(hash(noirFrame('ticket_commitment', variables)), claimTicketCommitment(ticket));
});

test('CI51/CO42 public and private source ABIs match the exact host statement order', () => {
  for (const [name, fields, count, privateNames] of [
    ['native-claim-ingress', CLAIM_INGRESS_FIELDS, 51, ['config', 'domain', 'evidence', 'note_opening']],
    ['native-claim-discharge', CLAIM_DISCHARGE_FIELDS, 42, ['config', 'domain', 'evidence', 'ticket', 'destination_endpoint', 'destination_salt']],
  ]) {
    const main = readFileSync(new URL('../../../proof-relations/' + name + '/src/main.nr', import.meta.url), 'utf8');
    const args = main.match(/fn main\(([\s\S]*?)\n\) \{/)[1];
    const pub = [...args.matchAll(/^\s+(\w+): pub (.*),$/gm)];
    assert.deepEqual(pub.map(match => match[1]), fields.map(snake));
    assert.equal(pub.reduce((n, match) => n + (match[2] === '[u32; 8]' ? 8 : match[2] === 'u64' ? 1 : NaN), 0), count);
    assert.deepEqual([...args.matchAll(/^\s+(\w+): (?!pub )(.*),$/gm)].map(match => match[1]), privateNames);
  }
});

test('canonical public codec preserves raw B32 and rejects noncanonical u32/u64/field encodings', () => {
  const ingress = { claimDomain: 'f'.repeat(64), outputQ: h('Q'), admissionN: h('N'), refundDestination: h('refund'),
    admissionRevocationState: '01' + h('revocation').slice(2), ingressReceiptLeaf: '02' + h('leaf').slice(2),
    amountQ: '18446744073709551615', evidenceFrom: '1', evidenceUntil: '2' };
  const words = encodeClaimIngressInputs(ingress);
  assert.deepEqual(decodeClaimIngressInputs(words), ingress);
  for (const [index, value] of [[0, '4294967296'], [0, '01'], [0, 1], [48, '18446744073709551616'], [50, '2\n']]) {
    const changed = [...words]; changed[index] = value; assert.throws(() => decodeClaimIngressInputs(changed));
  }
  assert.throws(() => decodeClaimIngressInputs(words.slice(1)));
  assert.throws(() => encodeClaimIngressInputs({ ...ingress, admissionRevocationState: FIELD_MODULUS.toString(16).padStart(64, '0') }));
  const discharge = { claimDomain: ingress.claimDomain, ticketId: h('ticket'), ticketCommitment: h('ticket-cm'),
    dischargeN: h('out-N'), admissionRevocationState: ingress.admissionRevocationState, evidenceFrom: '1', evidenceUntil: '2' };
  assert.deepEqual(decodeClaimDischargeInputs(encodeClaimDischargeInputs(discharge)), discharge);
});

test('config/ticket parsers reject extras, coercion, asset aliasing and invalid reference kinds', () => {
  const config = configFixture();
  for (const change of [c => { c.extra = true; }, c => { c.nativeFamily = 2; }, c => { c.nativeFamily = '3'; },
    c => { c.gateway = '0x' + c.gateway; }, c => { c.refundMaxFee = '1\n'; },
    c => { c.nativeAsset = c.wrapperAssetIdentity; }, c => { c.evmChainId = (1n << 256n).toString(); },
    c => { delete c.custodyInventoryDomain; }, c => { c.hubDomain = h('different-hub'); }]) {
    const changed = structuredClone(config); change(changed); assert.throws(() => validateClaimConfig(changed));
  }
  const ticket = { kind: '1', id: h('ticket'), claimDomain: h('claim'), amount: '1', destinationCommitment: h('destination'),
    maxFee: '0', referenceIngressN: ZERO, referenceQ: ZERO };
  claimTicketCommitment(ticket);
  assert.throws(() => claimTicketCommitment({ ...ticket, kind: '2' }));
  assert.throws(() => claimTicketCommitment({ ...ticket, referenceQ: h('Q') }));
  assert.throws(() => claimTicketCommitment({ ...ticket, kind: 1 }));
});

test('existing native endpoint bytes and separate verifier-set frame have fixed labels and roles', () => {
  for (const family of ['1', '2']) {
    const genesis = h('genesis'), asset = h('asset'), endpoint = family === '1' ? '0014' + h('key').slice(0, 40) : h('key');
    const expected = frame('LIANUM/PAEG/native-endpoint/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
      Buffer.from(family === '1' ? 'BTC' : 'SOL'), b(genesis), b(asset),
      Buffer.from(family === '1' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'), b(endpoint)]);
    assert.equal(nativeClaimEndpointCommitment({ family, genesis, asset, endpoint }), hash(expected));
  }
  const roles = [0, 1].map(index => ({ role: String(index), address: h('address' + index).slice(0, 40), codeHash: h('code' + index),
    width: index === 0 ? '51' : '42', sourceCommitment: h('source' + index), keyCommitment: h('key' + index) }));
  const expected = frame('LIANUM/PAEG/native-claim-verifier-set/1', [Buffer.from('LIANUM_PAEG_P2_V1'), ...roles.flatMap(role =>
    [u(role.role, 1), b(role.address), b(role.codeHash), u(role.width, 4), b(role.sourceCommitment), b(role.keyCommitment)])]);
  assert.deepEqual(claimVerifierSetFrame(roles), expected); assert.equal(claimVerifierSetCommitment(roles), hash(expected));
  assert.throws(() => claimVerifierSetCommitment([...roles].reverse()));
  assert.throws(() => claimVerifierSetCommitment([{ ...roles[0], width: '42' }, roles[1]]));
});
