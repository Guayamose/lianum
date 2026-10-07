/** Byte agreement checks against literal Solidity source. No compiler, EVM,
 * verifier, mock proof, native node, or claim state simulation runs here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CLAIM_CONFIG_SCHEMA, CLAIM_TICKET_FIELDS, claimDomainFrame, claimTicketFrame,
  claimIntentId, claimTicketId } from '../../wallet-platform/modules/native-claims/framing.mjs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const codec = read('NativeClaimCodec.sol'), types = read('NativeClaimTypes.sol');
const hash = value => createHash('sha256').update(value).digest('hex');
const h = name => hash(Buffer.from('SOLIDITY-CLAIM-CONFORMANCE/' + name));
const u = (value, bytes) => Buffer.from(BigInt(value).toString(16).padStart(bytes * 2, '0'), 'hex');
const raw = value => Buffer.from(value, 'hex');
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => [u(part.length, 4), part]));
}
function body(source, name) {
  const start = source.indexOf('function ' + name + '('); assert.ok(start >= 0, name);
  const open = source.indexOf('{', start); let depth = 1, at = open + 1;
  while (depth) { if (source[at] === '{') depth++; if (source[at] === '}') depth--; at++; }
  return source.slice(open + 1, at - 1);
}
function structFields(name) {
  const content = types.match(new RegExp('struct ' + name + ' \\{([\\s\\S]*?)\\n    }'))[1];
  return [...content.matchAll(/\b(uint256|uint64|uint8|bytes32|address)\s+(\w+)\s*;/g)].map(m => [m[2], m[1]]);
}
function packedFields(name, prefix) {
  return [...body(codec, name).matchAll(new RegExp('_p\\(abi.encodePacked\\(' + prefix + '\\.(\\w+)\\)\\)', 'g'))].map(m => m[1]);
}
function literalTag(name) { return body(codec, name).match(/_p\(bytes\("([^"]+)"\)\)/)[1]; }

test('Solidity claimDomain exactly matches all host configuration bytes and widths', () => {
  const fields = structFields('Configuration');
  assert.deepEqual(fields.map(([name]) => name), CLAIM_CONFIG_SCHEMA.map(([name]) => name));
  assert.deepEqual(packedFields('claimDomain', 'c'), fields.map(([name]) => name));
  const c = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'u256' ? ((1n << 255n) + 31337n).toString() : type === 'u8' ? '2' : type === 'u64' ? '100'
      : type === 'address' ? h(name).slice(0, 40) : type === 'field32' ? '01' + h(name).slice(2) : h(name)]));
  c.ledgerNamespace = c.hubDomain;
  const actual = frame(literalTag('claimDomain'), fields.map(([name, type]) =>
    type.startsWith('uint') ? u(c[name], Number(type.slice(4)) / 8) : raw(c[name])));
  assert.equal(actual.length, 834); assert.deepEqual(actual, claimDomainFrame(c));
});

test('Solidity ticket and immutable ID frames agree with host framing', () => {
  const fields = structFields('Ticket');
  assert.deepEqual(fields.map(([name]) => name), CLAIM_TICKET_FIELDS);
  assert.deepEqual(packedFields('ticketCommitment', 'ticket'), CLAIM_TICKET_FIELDS);
  const t = { kind: '2', id: h('id'), claimDomain: h('domain'), amount: '123456', destinationCommitment: h('destination'),
    maxFee: '100', referenceIngressN: h('N'), referenceQ: h('Q') };
  assert.deepEqual(frame(literalTag('ticketCommitment'), fields.map(([name, type]) =>
    type.startsWith('uint') ? u(t[name], Number(type.slice(4)) / 8) : raw(t[name]))), claimTicketFrame(t));
  assert.equal(hash(frame(literalTag('intentId'), [raw(t.claimDomain), raw(t.referenceQ), u(t.amount, 8)])),
    claimIntentId({ claimDomain: t.claimDomain, outputQ: t.referenceQ, amount: t.amount }));
  assert.equal(hash(frame(literalTag('ticketId'), [raw(t.claimDomain), u(2, 1), u(7, 8)])),
    claimTicketId({ claimDomain: t.claimDomain, kind: '2', nonce: '7' }));
});

test('Backing permit fields retain exact design order and width without ABI packing substitutions', () => {
  const expected = ['claimDomain','custodyInventoryDomain','actionDigest','expectedClaimSequence','hubStateSequence',
    'revocationState','wrapperSupply','pendingRedemptions','pendingRefunds','heldUnissued','unknownExposure',
    'nativePrincipalAvailable','feeReserveAvailable','reservedFeesAfter','inventoryCommitment','obligationsCommitment','validFrom','validUntil'];
  assert.deepEqual(structFields('BackingPermit').map(([name]) => name), expected);
  assert.deepEqual(packedFields('backingDigest', 'p'), expected);
  assert.equal(literalTag('backingDigest'), 'LIANUM/PAEG/native-claim-backing-permit/1');
  for (const name of ['wrapperSupply','pendingRedemptions','pendingRefunds','heldUnissued','unknownExposure',
    'nativePrincipalAvailable','feeReserveAvailable','reservedFeesAfter'])
    assert.equal(structFields('BackingPermit').find(([field]) => field === name)[1], 'uint256');
});

test('Canonical decoders constrain all u32 limbs, u64 scalars and only the intended field digests', () => {
  assert.match(body(codec, '_digest'), /type\(uint32\)\.max/);
  assert.match(body(codec, '_u64'), /type\(uint64\)\.max/);
  for (const [name, width, canonicalOffsets] of [['decodeOwner',27,[]],['decodeIngress',51,[32,40]],['decodeDischarge',42,[32]]]) {
    const b = body(codec, name); assert.match(b, new RegExp('inputs.length == ' + width));
    assert.deepEqual([...b.matchAll(/canonical\(_digest\(inputs, (\d+)\)\)/g)].map(m => Number(m[1])), canonicalOffsets);
  }
});

test('source authority permanently owns N and cannot release ingress capacity on ticket discharge', () => {
  const source = read('NativeClaimAuthority.sol');
  assert.doesNotMatch(source, /delete\s+(?:reservations|reservationOwner|operationNullifier)/);
  assert.match(body(source, 'consumeClaim'), /r\.gateway == msg\.sender && r\.operationId == operationId && !r\.consumed/);
  assert.match(body(source, 'consumeClaim'), /if \(r\.ingress\)/);
  assert.match(body(source, 'consumeClaim'), /leaf == bytes32\(0\)/);
  assert.match(body(source, 'consumeClaim'), /r\.consumed = true/);
  assert.match(body(source, 'reserveSignedEffect'), /claimReservation\(operationId\)/);
});

test('source issue, burn and discharge preserve distinct authorization and payout-fence boundaries', () => {
  const gateway = read('NativeClaimGateway.sol');
  for (const name of ['preposition','issue','requestRedemption','beginPayout']) assert.match(body(gateway, name), /_noPayout\(\)/);
  for (const name of ['preposition','reserveSignedEffect','issue','requestRedemption','beginPayout']) assert.match(body(gateway, name), /_authorize\(/);
  const issue = body(gateway, 'issue');
  assert.ok(issue.indexOf('_owner(ownerProof)') < issue.indexOf('mintToGateway'));
  assert.ok(issue.indexOf('_ingress(ingressProof)') < issue.indexOf('mintToGateway'));
  assert.match(issue, /depositBalanceIntent\(ownerProof\.proof, ownerProof\.inputs\)/);
  assert.match(issue, /allowance\(address\(this\), pool\) == 0/);
  assert.match(body(gateway, 'requestRedemption'), /burnForTicket\(msg\.sender, amount\)/);
  const discharge = body(gateway, 'discharge');
  assert.match(discharge, /ClaimVerifiers\.CO42/); assert.match(discharge, /activePayout == s\.ticketId/);
  assert.doesNotMatch(discharge, /_authorize\(|mintToGateway|nativePrincipalAvailable/);
  assert.match(discharge, /Validation\.discharge\(/);
  const validation = read('NativeClaimValidation.sol');
  assert.match(body(validation, 'discharge'), /currentRevocation\(c, s\.revocationState\)/);
  assert.match(body(gateway, 'seal'), /Validation\.links\(address\(Codec\), address\(FlatHubCodec\), address\(Poseidon2Domains\)\)/);
  assert.match(body(gateway, '_codePins'), /address\(Validation\), validationCodeHash/);
  assert.match(gateway, /MAX_INTENTS = 16/); assert.match(gateway, /MAX_TICKETS = 32/);
  for (const file of ['NativeClaimGateway.sol','NativeClaimAuthority.sol','NativeClaimToken.sol'])
    assert.doesNotMatch(read(file), /\.delegatecall\s*\(|selfdestruct\s*\(|function\s+(?:setVerifier|setGateway|reset|cancel|remint)\s*\(/);
});

// BTC/SOL asset labels are deployment data, not separate native currencies.
test('authority rejects native-currency aliases regardless of caller asset or inventory labels', () => {
  const gateway = read('NativeClaimGateway.sol'), authority = read('NativeClaimAuthority.sol');
  const assignment = gateway.match(/nativeAssetKey = ([^;]+);/)[1];
  assert.equal(assignment, 'sha256(abi.encode(c.nativeFamily, c.nativeGenesis))');
  assert.doesNotMatch(assignment, /nativeAsset|custodyInventoryDomain/);
  assert.match(body(authority, 'seal'), /a\.nativeAssetKey\(\) != b\.nativeAssetKey\(\)/);
  const genesis = h('genesis');
  const currencyKey = (family, nativeGenesis) => hash(Buffer.concat([u(family, 32), raw(nativeGenesis)]));
  assert.notEqual(currencyKey(1, genesis), currencyKey(2, genesis));
  assert.notEqual(currencyKey(1, genesis), currencyKey(1, h('different-genesis')));
});
