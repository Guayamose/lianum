/** Pure bounded BTC/SOL wire and BTC/SOL/EVM facts codecs. No RPC, signing, broadcast,
 * finality verification, observer signature verification or authorization.
 * Native truth, trusted bootstrap, pre-sign gates and durable once-only send
 * journals belong to the integration boundary, never to a caller boolean.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { types } from 'node:util';

const ZERO = '0'.repeat(64);
const LEGACY_PROFILE = Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii');
const sha = value => createHash('sha256').update(value).digest();
const shaHex = value => sha(value).toString('hex');
const txid = value => Buffer.from(sha(sha(value))).reverse().toString('hex');
const hash160 = value => createHash('ripemd160').update(sha(value)).digest('hex');
const MAX_MONEY = 2_100_000_000_000_000n;
const SECP_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
export const BINDING_LIMITS = Object.freeze({ bitcoinAmount: '1000000000', bitcoinFee: '10000',
  solanaLamports: String(Number.MAX_SAFE_INTEGER), bitcoinConfirmations: '6', maximumEvidenceLifetime: '86400' });
export const MEMO_PROGRAM = Object.freeze({
  address: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  owner: 'BPFLoader2111111111111111111111111111111111',
  codeSHA256: 'f520eaf096361abbb9639ea4dc3e5388a87b9330e121f476607b87c46ef67954',
});
export const FACTS_SCHEMA = 'LIANUM_FLAT_NATIVE_FACTS_V1';
export const BINDING_TAGS = Object.freeze({ key: 'LIANUM/PAEG/receipt-key/2',
  admission: 'LIANUM/PAEG/native-admission-nullifier/1', facts: 'LIANUM/native-facts/1' });
function exact(value, names) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'BINDING_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'BINDING_FIELDS');
  for (const name of names) {
    const property = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(property && Object.hasOwn(property, 'value') && property.enumerable, 'BINDING_DATA_FIELD');
  }
}
function hex(value, length = 32, nonzero = false) {
  assert.ok(typeof value === 'string' && value.length === length * 2
    && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value), 'BINDING_HEX');
  assert.ok(!nonzero || /[1-9a-f]/.test(value), 'BINDING_ZERO');
  return Buffer.from(value, 'hex');
}
function uint(value, width, maximum = (1n << BigInt(width * 8)) - 1n, positive = false) {
  assert.ok(typeof value === 'string' && value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), 'BINDING_UINT');
  const number = BigInt(value);
  assert.equal(number.toString(), value, 'BINDING_UINT_CANONICAL');
  assert.ok(number <= maximum && (!positive || number > 0n), 'BINDING_UINT_RANGE');
  return number;
}
function integer(value, width) { return Buffer.from(uint(value, width).toString(16).padStart(width * 2, '0'), 'hex'); }
function little(value, width) { return Buffer.from(integer(value, width)).reverse(); }
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => [integer(String(part.length), 4), part]));
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function base58(value, length) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = 0n;
  for (const letter of value) { const digit = alphabet.indexOf(letter); assert.ok(digit >= 0); result = result * 58n + BigInt(digit); }
  const body = result === 0n ? Buffer.alloc(0) : Buffer.from(result.toString(16).padStart(Math.ceil(result.toString(16).length / 2) * 2, '0'), 'hex');
  const bytes = Buffer.concat([Buffer.alloc(value.match(/^1*/)[0].length), body]);
  assert.equal(bytes.length, length); return bytes;
}
const MEMO_KEY = base58(MEMO_PROGRAM.address, 32);

export function receiptKeyCommitment(input) {
  exact(input, ['ledgerNamespace', 'secret']);
  return shaHex(frame(BINDING_TAGS.key, [hex(input.ledgerNamespace, 32, true), hex(input.secret, 32, true)]));
}
export function assertReceiptKeyBinding(input) {
  exact(input, ['ledgerNamespace', 'secret', 'wireKeyCommitment']);
  hex(input.wireKeyCommitment, 32, true);
  assert.equal(receiptKeyCommitment({ ledgerNamespace: input.ledgerNamespace, secret: input.secret }),
    input.wireKeyCommitment, 'BINDING_RECEIPT_KEY');
}
export function nativeAdmissionNullifier(input) {
  exact(input, ['ledgerNamespace', 'secret', 'nativeGid']);
  return shaHex(frame(BINDING_TAGS.admission,
    ['ledgerNamespace', 'secret', 'nativeGid'].map(key => hex(input[key], 32, true))));
}
export function encodeWireCommitment(key) { hex(key, 32, true); return Buffer.from('LNRB1:' + key, 'ascii'); }
export function decodeWireCommitment(value) {
  assert.ok(Buffer.isBuffer(value) && value.length === 70, 'BINDING_PAYLOAD_LENGTH');
  const text = value.toString('ascii');
  assert.ok(Buffer.from(text, 'ascii').equals(value) && /^LNRB1:[0-9a-f]{64}$/.test(text), 'BINDING_PAYLOAD_BYTES');
  const key = text.slice(6); hex(key, 32, true); return key;
}

const BTC_FIELDS = ['sourceTxid', 'sourceVout', 'sourceScript', 'sourceSatoshi',
  'recipientScript', 'amountSatoshi', 'changeScript', 'feeSatoshi', 'wireKeyCommitment'];
function bitcoinIntent(input) {
  exact(input, BTC_FIELDS); hex(input.sourceTxid, 32, true); uint(input.sourceVout, 4);
  for (const name of ['sourceScript', 'recipientScript', 'changeScript']) {
    hex(input[name], 22); assert.match(input[name], /^0014[0-9a-f]{40}$/, 'BINDING_P2WPKH');
  }
  assert.notEqual(input.sourceScript, input.recipientScript, 'BINDING_RECIPIENT_SOURCE');
  assert.notEqual(input.changeScript, input.recipientScript, 'BINDING_RECIPIENT_CHANGE');
  const source = uint(input.sourceSatoshi, 8, MAX_MONEY, true);
  const amount = uint(input.amountSatoshi, 8, BigInt(BINDING_LIMITS.bitcoinAmount), true);
  const fee = uint(input.feeSatoshi, 8, BigInt(BINDING_LIMITS.bitcoinFee), true);
  assert.ok(source > amount + fee, 'BINDING_CHANGE_AMOUNT');
  hex(input.wireKeyCommitment, 32, true);
  return { source, amount, fee, change: source - amount - fee };
}
function bitcoinOutputs(input, change) {
  const binding = Buffer.concat([Buffer.from([0x6a, 0x46]), encodeWireCommitment(input.wireKeyCommitment)]);
  const output = (amount, script) => Buffer.concat([little(amount, 8), Buffer.from([script.length]), script]);
  return Buffer.concat([Buffer.from([3]), output(input.amountSatoshi, hex(input.recipientScript, 22)),
    output(change.toString(), hex(input.changeScript, 22)), output('0', binding)]);
}
/** Exact funded unsigned transaction. Funding/UTXO provenance is not checked. */
export function encodeBitcoinBinding(input) {
  const { change } = bitcoinIntent(input);
  return Buffer.concat([little('2', 4), Buffer.from([1]), Buffer.from(hex(input.sourceTxid)).reverse(),
    little(input.sourceVout, 4), Buffer.from([0]), little('4294967294', 4),
    bitcoinOutputs(input, change), Buffer.alloc(4)]).toString('hex');
}
function assertDERSighashAll(signature) {
  assert.ok(signature.length >= 9 && signature.length <= 73 && signature[0] === 0x30
    && signature[1] === signature.length - 3 && signature.at(-1) === 1, 'BINDING_SIGHASH_ALL_DER');
  let offset = 2;
  for (let i = 0; i < 2; i++) {
    assert.equal(signature[offset++], 2, 'BINDING_DER_INTEGER');
    const length = signature[offset++], value = signature.subarray(offset, offset + length); offset += length;
    assert.ok(length >= 1 && length <= 33 && value.length === length && (value[0] & 0x80) === 0
      && !(length > 1 && value[0] === 0 && (value[1] & 0x80) === 0), 'BINDING_DER_CANONICAL');
    const scalar = BigInt('0x' + value.toString('hex'));
    assert.ok(scalar > 0n && scalar < SECP_ORDER, 'BINDING_DER_SCALAR');
  }
  assert.equal(offset, signature.length - 1, 'BINDING_DER_TRAILING');
}
/** Signed form checks witness syntax/source key/SIGHASH_ALL, not ECDSA truth. */
export function validateBitcoinBinding(rawTransaction, expected) {
  bitcoinIntent(expected);
  assert.ok(typeof rawTransaction === 'string' && rawTransaction.length <= 2000
    && /^(?:[0-9a-f]{2})+$/.exec(rawTransaction)?.[0] === rawTransaction, 'BINDING_BTC_WIRE');
  const wire = Buffer.from(rawTransaction, 'hex'); let offset = 0;
  const take = length => { assert.ok(offset + length <= wire.length, 'BINDING_BTC_TRUNCATED');
    const value = wire.subarray(offset, offset + length); offset += length; return value; };
  // Every supported length/count is <253; any multibyte CompactSize is invalid.
  const small = () => { const value = take(1)[0]; assert.ok(value < 253, 'BINDING_BTC_COMPACT_SIZE'); return value; };
  const version = take(4); assert.equal(version.readUInt32LE(), 2, 'BINDING_BTC_VERSION');
  const containsWitness = wire[offset] === 0;
  if (containsWitness) assert.ok(take(2).equals(Buffer.from([0, 1])), 'BINDING_BTC_WITNESS_FLAG');
  const bodyStart = offset;
  assert.equal(small(), 1, 'BINDING_BTC_INPUT_COUNT');
  assert.equal(Buffer.from(take(32)).reverse().toString('hex'), expected.sourceTxid, 'BINDING_BTC_PREVOUT');
  assert.equal(take(4).readUInt32LE().toString(), expected.sourceVout, 'BINDING_BTC_PREVOUT');
  assert.equal(small(), 0, 'BINDING_BTC_SCRIPTSIG');
  assert.equal(take(4).readUInt32LE(), 0xfffffffe, 'BINDING_BTC_SEQUENCE');
  const outputsStart = offset; assert.equal(small(), 3, 'BINDING_BTC_OUTPUT_COUNT');
  const outputs = [];
  for (let index = 0; index < 3; index++) outputs.push({ amount: take(8).readBigUInt64LE(), script: take(small()) });
  const bodyEnd = offset;
  assert.ok(wire.subarray(outputsStart, bodyEnd).equals(bitcoinOutputs(expected, bitcoinIntent(expected).change)), 'BINDING_BTC_OUTPUTS');
  const wireKeyCommitment = decodeWireCommitment(outputs[2].script.subarray(2));
  if (containsWitness) {
    assert.equal(small(), 2, 'BINDING_BTC_WITNESS_COUNT');
    const signature = take(small()), key = take(small());
    assert.ok(key.length === 33 && [2, 3].includes(key[0]), 'BINDING_BTC_PUBLIC_KEY');
    assert.equal('0014' + hash160(key), expected.sourceScript, 'BINDING_BTC_SOURCE_KEY');
    assertDERSighashAll(signature);
  }
  const locktime = take(4); assert.equal(locktime.readUInt32LE(), 0, 'BINDING_BTC_LOCKTIME');
  assert.equal(offset, wire.length, 'BINDING_BTC_TRAILING');
  const stripped = Buffer.concat([version, wire.subarray(bodyStart, bodyEnd), locktime]);
  assert.equal(stripped.toString('hex'), encodeBitcoinBinding(expected), 'BINDING_BTC_INTENT');
  return freeze({ txid: txid(stripped), wtxid: txid(wire), transactionSHA256: shaHex(wire),
    unsignedTransaction: stripped.toString('hex'), containsWitness, wireKeyCommitment,
    effectIndex: '0', wireBindingVersion: '1', wireBindingKind: '1', wireBindingPosition: '2',
    assurance: 'wire-and-witness-syntax-only-no-ecdsa-utxo-finality-or-authorization' });
}

const SOL_FIELDS = ['sourcePublicKey', 'recipientPublicKey', 'recentBlockhash', 'lamports', 'wireKeyCommitment'];
function solanaIntent(input) {
  exact(input, SOL_FIELDS);
  const source = hex(input.sourcePublicKey, 32, true), recipient = hex(input.recipientPublicKey, 32, true);
  hex(input.recentBlockhash, 32, true); hex(input.wireKeyCommitment, 32, true);
  const keys = [input.sourcePublicKey, input.recipientPublicKey, ZERO, MEMO_KEY.toString('hex')];
  assert.equal(new Set(keys).size, 4, 'BINDING_SOL_DISTINCT_KEYS');
  const amount = uint(input.lamports, 8, BigInt(BINDING_LIMITS.solanaLamports), true);
  return { source, recipient, amount };
}
export function encodeSolanaBindingMessage(input) {
  const { source, recipient, amount } = solanaIntent(input);
  return Buffer.concat([Buffer.from([1, 0, 2, 4]), source, recipient, Buffer.alloc(32), MEMO_KEY,
    hex(input.recentBlockhash), Buffer.from([2, 2, 2, 0, 1, 12]), little('2', 4),
    little(amount.toString(), 8), Buffer.from([3, 1, 0, 70]), encodeWireCommitment(input.wireKeyCommitment)]).toString('hex');
}
export function validateSolanaBindingMessage(messageHex, expected) {
  solanaIntent(expected); const message = hex(messageHex, 256);
  assert.ok(message.subarray(0, 4).equals(Buffer.from([1, 0, 2, 4])), 'BINDING_SOL_HEADER');
  assert.ok(message.subarray(68, 100).equals(Buffer.alloc(32))
    && message.subarray(100, 132).equals(MEMO_KEY), 'BINDING_SOL_PROGRAM_KEYS');
  assert.ok(message.subarray(164, 170).equals(Buffer.from([2, 2, 2, 0, 1, 12]))
    && message.readUInt32LE(170) === 2, 'BINDING_SOL_TRANSFER_INSTRUCTION');
  assert.ok(message.subarray(182, 186).equals(Buffer.from([3, 1, 0, 70])), 'BINDING_SOL_MEMO_INSTRUCTION');
  const decoded = { sourcePublicKey: message.subarray(4, 36).toString('hex'),
    recipientPublicKey: message.subarray(36, 68).toString('hex'), recentBlockhash: message.subarray(132, 164).toString('hex'),
    lamports: message.readBigUInt64LE(174).toString(), wireKeyCommitment: decodeWireCommitment(message.subarray(186)) };
  solanaIntent(decoded); assert.deepEqual(decoded, expected, 'BINDING_SOL_INTENT');
  return freeze({ ...decoded, messageSHA256: shaHex(message), effectIndex: '0',
    wireBindingVersion: '1', wireBindingKind: '2', wireBindingPosition: '1' });
}
function base64Bytes(value) {
  assert.ok(typeof value === 'string' && value.length > 0 && value.length <= 1_000_000
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'BINDING_BASE64');
  const bytes = Buffer.from(value, 'base64'); assert.equal(bytes.toString('base64'), value, 'BINDING_BASE64'); return bytes;
}
export function validateSolanaBindingTransaction(transactionBase64, expected) {
  const wire = base64Bytes(transactionBase64);
  assert.ok(wire.length === 321 && wire[0] === 1, 'BINDING_SOL_TRANSACTION_LENGTH');
  const message = wire.subarray(65), decoded = validateSolanaBindingMessage(message.toString('hex'), expected);
  const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519, hex(decoded.sourcePublicKey)]), type: 'spki', format: 'der' });
  assert.ok(verify(null, message, key, wire.subarray(1, 65)), 'BINDING_SOL_SIGNATURE');
  return freeze({ ...decoded, signatureHex: wire.subarray(1, 65).toString('hex'),
    transactionSHA256: shaHex(wire), assurance: 'exact-wire-and-ed25519-only-no-finality-or-authorization' });
}
/** Input must come from authenticated owned-RPC bootstrap. Matching supplied
 * bytes is not evidence that this account was fetched or deployed anywhere. */
export function assertMemoProgramAccount(snapshot) {
  exact(snapshot, ['address', 'owner', 'executable', 'dataBase64']);
  assert.equal(snapshot.address, MEMO_PROGRAM.address, 'BINDING_MEMO_ADDRESS');
  assert.equal(snapshot.owner, MEMO_PROGRAM.owner, 'BINDING_MEMO_OWNER');
  assert.equal(snapshot.executable, true, 'BINDING_MEMO_EXECUTABLE');
  assert.equal(shaHex(base64Bytes(snapshot.dataBase64)), MEMO_PROGRAM.codeSHA256, 'BINDING_MEMO_CODE');
}

const RULE = [['family', 1], ['genesis', 32], ['asset', 32], ['finalityKind', 1],
  ['minimumConfirmations', 4], ['maximumEvidenceLifetime', 8], ['maximumClockSkew', 8]];
const OBSERVATION = [['blockId', 32], ['stateCommitment', 32], ['blockHeight', 8], ['observedAt', 8],
  ['finalityKind', 1], ['confirmations', 4], ['sourceCommitment', 32], ['destinationCommitment', 32],
  ['amount', 16], ['custodyKind', 1], ['custodyCommitment', 32], ['evidenceFrom', 8], ['evidenceUntil', 8]];
const CONTEXT = [['observedTipId', 32], ['observedTipHeight', 8], ['transactionSlot', 8], ['parentSlot', 8], ['observedSlot', 8]];
const FACTS = [['ledgerNamespace', 32], ['hubDomain', 32], ['registryCommitment', 32], ['ruleCommitment', 32],
  ['family', 1], ['genesis', 32], ['asset', 32], ['transactionId', 64], ['effectIndex', 4], ['nativeGid', 32],
  ['transactionSHA256', 32], ['wireBindingVersion', 1], ['wireBindingKind', 1], ['wireBindingPosition', 4], ['wireKeyCommitment', 32]];
export const FACTS_FIELDS = freeze({ facts: FACTS.map(([key]) => key), observation: OBSERVATION.map(([key]) => key), nativeContext: CONTEXT.map(([key]) => key) });
const spec = (value, definition) => { exact(value, definition.map(([key]) => key));
  return definition.map(([key, width]) => width >= 32 ? hex(value[key], width) : integer(value[key], width)); };
function ruleParts(rule) {
  const encoded = spec(rule, RULE);
  assert.ok(['1', '2', '3'].includes(rule.family), 'BINDING_RULE_FAMILY');
  assert.equal(rule.finalityKind, rule.family, 'BINDING_RULE_FINALITY');
  hex(rule.genesis, 32, true); hex(rule.asset, 32, true);
  assert.ok(rule.family === '1' ? BigInt(rule.minimumConfirmations) >= 6n
    : rule.family === '2' ? rule.minimumConfirmations === '0'
      : BigInt(rule.minimumConfirmations) >= 1n, 'BINDING_RULE_CONFIRMATIONS');
  uint(rule.maximumEvidenceLifetime, 8, 86400n, true); uint(rule.maximumClockSkew, 8, 30n);
  return encoded;
}
export function nativeRuleCommitment(rule) {
  return shaHex(frame('LIANUM/PAEG/native-rule/2', [LEGACY_PROFILE, ...ruleParts(rule)]));
}
function chainFrame(family, genesis, asset) {
  assert.ok(['1', '2', '3'].includes(family), 'BINDING_FAMILY');
  return frame('LIANUM/evidence-chain/1', [Buffer.from(family === '1' ? 'BTC' : family === '2' ? 'SOL' : 'EVM'),
    hex(genesis, 32, true), hex(asset, 32, true)]);
}
export function nativeFactIdentity(input) {
  exact(input, ['family', 'genesis', 'asset', 'transactionId', 'effectIndex']);
  const transaction = hex(input.transactionId, 64, true); uint(input.effectIndex, 4);
  if (input.family === '1') assert.ok(transaction.subarray(32).equals(Buffer.alloc(32)), 'BINDING_BTC_ID_PADDING');
  if (input.family === '3') assert.ok(transaction.subarray(32).equals(Buffer.alloc(32)), 'BINDING_EVM_ID_PADDING');
  return shaHex(frame('LIANUM/native-global-effect/1', [chainFrame(input.family, input.genesis, input.asset),
    input.family === '2' ? transaction : transaction.subarray(0, 32), Buffer.from(input.effectIndex, 'ascii')]));
}
export function nativeCustodyCommitment(input) {
  exact(input, ['family', 'genesis', 'asset', 'sourceCommitment', 'destinationCommitment']);
  return shaHex(frame('LIANUM/PAEG/native-recipient-custody/2', [LEGACY_PROFILE,
    sha(chainFrame(input.family, input.genesis, input.asset)), hex(input.sourceCommitment, 32, true), hex(input.destinationCommitment, 32, true)]));
}
export function nativeObservedEffectCommitment(input) {
  exact(input, ['family', 'genesis', 'asset', 'nativeGid', 'blockId', 'blockHeight', 'transactionSHA256',
    'sourceCommitment', 'destinationCommitment', 'amount']);
  return shaHex(frame('LIANUM/PAEG/local-native-observed-effect/2', [LEGACY_PROFILE,
    sha(chainFrame(input.family, input.genesis, input.asset)), hex(input.nativeGid, 32, true), hex(input.blockId, 32, true),
    integer(input.blockHeight, 8), hex(input.transactionSHA256, 32, true), hex(input.sourceCommitment, 32, true),
    hex(input.destinationCommitment, 32, true), integer(input.amount, 16)]));
}
/** Expected policy/domain needs authenticated provenance at integration. This
 * validates a fact claim's bytes/internal relations, not signatures or truth. */
function validateFacts(input, policy, claimOnly) {
  exact(input, [...FACTS_FIELDS.facts, 'observation', 'nativeContext']);
  const body = Object.fromEntries(FACTS_FIELDS.facts.map(key => [key, input[key]])); spec(body, FACTS);
  spec(input.observation, OBSERVATION); spec(input.nativeContext, CONTEXT);
  exact(policy, ['ledgerNamespace', 'hubDomain', 'registryCommitment', 'rule']); ruleParts(policy.rule);
  for (const name of ['ledgerNamespace', 'hubDomain', 'registryCommitment']) {
    hex(policy[name], 32, true); assert.equal(input[name], policy[name], 'BINDING_FACT_DOMAIN');
  }
  const rule = policy.rule, observed = input.observation, context = input.nativeContext;
  for (const name of ['family', 'genesis', 'asset']) assert.equal(input[name], rule[name], 'BINDING_FACT_RULE');
  assert.equal(input.ruleCommitment, nativeRuleCommitment(rule), 'BINDING_FACT_RULE_COMMITMENT');
  if (claimOnly) assert.ok(['1', '2'].includes(input.family), 'BINDING_CLAIM_FAMILY');
  // A second tuple exists only at the claim boundary. Every other tuple,
  // including partial mixtures of v1 and v2, remains invalid.
  const nonceClaim = claimOnly && input.family === '2' && input.wireBindingVersion === '2';
  assert.equal(input.effectIndex, nonceClaim ? '1' : '0', 'BINDING_FACT_EFFECT_INDEX');
  assert.equal(input.wireBindingVersion, nonceClaim ? '2' : '1', 'BINDING_FACT_VERSION');
  assert.equal(input.wireBindingKind, input.family, 'BINDING_FACT_BINDING_KIND');
  assert.equal(input.wireBindingPosition, nonceClaim ? '2' : input.family === '1' ? '2' : input.family === '2' ? '1' : '0', 'BINDING_FACT_BINDING_POSITION');
  assert.equal(input.nativeGid, nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, input[name]]))), 'BINDING_FACT_IDENTITY');
  for (const name of ['ruleCommitment', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment']) hex(input[name], 32, true);
  for (const name of ['blockId', 'stateCommitment', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment']) hex(observed[name], 32, true);
  assert.notEqual(observed.sourceCommitment, observed.destinationCommitment, 'BINDING_FACT_ENDPOINTS');
  const maximumAmount = input.family === '1' ? BigInt(BINDING_LIMITS.bitcoinAmount)
    : input.family === '2' ? BigInt(BINDING_LIMITS.solanaLamports) : (1n << 128n) - 1n;
  uint(observed.amount, 16, maximumAmount, true);
  assert.equal(observed.custodyKind, '1', 'BINDING_FACT_CUSTODY_KIND');
  const endpoints = { family: input.family, genesis: input.genesis, asset: input.asset,
    sourceCommitment: observed.sourceCommitment, destinationCommitment: observed.destinationCommitment };
  assert.equal(observed.custodyCommitment, nativeCustodyCommitment(endpoints), 'BINDING_FACT_CUSTODY');
  assert.equal(observed.stateCommitment, nativeObservedEffectCommitment({ ...endpoints,
    nativeGid: input.nativeGid, blockId: observed.blockId, blockHeight: observed.blockHeight,
    transactionSHA256: input.transactionSHA256, amount: observed.amount }), 'BINDING_FACT_STATE');
  assert.equal(observed.finalityKind, rule.finalityKind, 'BINDING_FACT_FINALITY_KIND');
  assert.ok(BigInt(observed.confirmations) >= BigInt(rule.minimumConfirmations), 'BINDING_FACT_CONFIRMATIONS');
  assert.equal(observed.evidenceFrom, observed.observedAt, 'BINDING_FACT_OBSERVED_TIME');
  const expiry = BigInt(observed.observedAt) + BigInt(rule.maximumEvidenceLifetime);
  assert.ok(expiry < (1n << 64n), 'BINDING_FACT_TIME_OVERFLOW');
  assert.equal(observed.evidenceUntil, expiry.toString(), 'BINDING_FACT_LIFETIME');
  if (input.family === '1' || input.family === '3') {
    hex(context.observedTipId, 32, true);
    // Family 3 is the registered owned-chain canonical-depth rule. Width
    // checks plus this equality bound depth+1 to u32, exactly as in I84.
    assert.equal(BigInt(observed.confirmations), BigInt(context.observedTipHeight) - BigInt(observed.blockHeight) + 1n, 'BINDING_FACT_TIP_COUNT');
    for (const name of ['transactionSlot', 'parentSlot', 'observedSlot']) assert.equal(context[name], '0',
      input.family === '1' ? 'BINDING_FACT_BTC_PADDING' : 'BINDING_FACT_EVM_PADDING');
  } else {
    assert.equal(observed.confirmations, '0', 'BINDING_FACT_SOL_CONFIRMATIONS');
    assert.equal(context.observedTipId, ZERO, 'BINDING_FACT_SOL_PADDING');
    assert.equal(context.observedTipHeight, '0', 'BINDING_FACT_SOL_PADDING');
    assert.ok(BigInt(context.parentSlot) < BigInt(context.transactionSlot)
      && BigInt(context.transactionSlot) <= BigInt(context.observedSlot), 'BINDING_FACT_SLOT_ORDER');
  }
  return freeze(structuredClone(input));
}
export function validateNativeFacts(input, policy) { return validateFacts(input, policy, false); }
/** Payout/refund host facts only. Ingress v1 and claim nonce v2 retain the same
 * authenticated 829-byte schema; generic admission helpers remain strict v1. */
export function validateNativeClaimFacts(input, policy) { return validateFacts(input, policy, true); }
function encodeCheckedFacts(checked) {
  const body = Object.fromEntries(FACTS_FIELDS.facts.map(key => [key, checked[key]]));
  return frame(BINDING_TAGS.facts, [Buffer.from(FACTS_SCHEMA, 'ascii'), ...spec(body, FACTS),
    ...spec(checked.observation, OBSERVATION), ...spec(checked.nativeContext, CONTEXT)]);
}
export function encodeNativeFacts(input, policy) { return encodeCheckedFacts(validateNativeFacts(input, policy)); }
export function encodeNativeClaimFacts(input, policy) { return encodeCheckedFacts(validateNativeClaimFacts(input, policy)); }
export function nativeFactsDigest(input, policy) { return shaHex(encodeNativeFacts(input, policy)); }
export function nativeClaimFactsDigest(input, policy) { return shaHex(encodeNativeClaimFacts(input, policy)); }
