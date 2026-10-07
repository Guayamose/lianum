import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import * as api from './tron-native-transfer-wire.mjs';
const { decodeTronNativeTransferWire: decode, bindOriginalTronNativeTransfer: bind } = api;

// Public deterministic mathematical fixtures only: scalar 1, nonce 1 or 2.
// These intentionally insecure constants NEVER identify a real wallet, load a
// credential, use a signing API or leave this offline test. No chain is started.
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const TWO_GX = 0xc6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5n;
const OWNER = '417e5f4552091a69125d5dfcb7b8c2659029395bdf'; // Known secp256k1 generator address.
const RECIPIENT = '41' + '35'.repeat(20), MEMO = 'ab'.repeat(32);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = value => Buffer.from(value, 'hex');
const join = (...parts) => Buffer.concat(parts.flat());
const scalar = value => bytes(value.toString(16).padStart(64, '0'));
function varint(number) {
  const output = []; let value = BigInt(number);
  do { const next = Number(value & 127n); value >>= 7n; output.push(next | (value ? 128 : 0)); } while (value);
  return Buffer.from(output);
}
const field = (number, value) => Buffer.isBuffer(value)
  ? join(varint(number * 8 + 2), varint(value.length), value)
  : join(varint(number * 8), varint(value));
function syntheticSignature(raw, nonce = 1) {
  const r = nonce === 1 ? GX : TWO_GX, z = BigInt('0x' + sha(raw));
  let s = ((z + r) * (nonce === 1 ? 1n : (ORDER + 1n) / 2n)) % ORDER, v = 0;
  if (s > ORDER / 2n) { s = ORDER - s; v = 1; }
  return join(scalar(r), scalar(s), Buffer.from([v]));
}
function fixture(options = {}) {
  const owner = options.owner ?? OWNER, recipient = options.recipient ?? RECIPIENT;
  const amount = options.amount ?? 1_250_001n, timestamp = options.timestamp ?? 1_900_000_000_000n;
  const expiration = options.expiration ?? timestamp + 60_000n, memo = options.memo ?? null;
  const refBytes = options.refBytes ?? 'c145', refHash = options.refHash ?? 'c56bd8a3b3341d9d';
  const transferFields = options.transferFields ?? [field(1, bytes(owner)), field(2, bytes(recipient)), field(3, amount)];
  const transfer = join(transferFields);
  const anyFields = options.anyFields ?? [field(1, Buffer.from('type.googleapis.com/protocol.TransferContract')), field(2, transfer)];
  const any = join(anyFields);
  const contractFields = options.contractFields ?? [field(1, 1n), field(2, any)];
  const contract = join(contractFields);
  const rawFields = options.rawFields ?? [field(1, bytes(refBytes)), field(4, bytes(refHash)), field(8, expiration),
    ...(memo === null ? [] : [field(10, bytes(memo))]), field(11, contract), field(14, timestamp)];
  const raw = join(rawFields), signature = options.signature ?? syntheticSignature(raw, options.nonce);
  const envelopeFields = options.envelopeFields ?? [field(1, raw), field(2, signature)];
  const wire = join(envelopeFields);
  return { transferFields, anyFields, contractFields, rawFields, envelopeFields, transfer, any, contract, raw, signature, wire,
    original: { nativeWire: wire.toString('hex'), expected: { nativeId: sha(raw), transactionSHA256: sha(wire),
      ownerAddress: owner, recipientAddress: recipient, amountSun: String(amount), refBlockBytes: refBytes,
      refBlockHash: refHash, timestampMs: String(timestamp), expirationMs: String(expiration), wireKeyCommitment: memo } } };
}
const patchAt = (list, index, replacement) => list.map((entry, i) => i === index ? replacement : entry);
const rejectsFixture = (options, error) => assert.throws(() => decode(fixture(options).original.nativeWire), error);

test('exact retained protobuf envelope binds to SHA256(raw_data) and independently known owner', () => {
  const f = fixture(), result = bind(f.original).signed;
  // Immutable vector independently assembled with Python hashlib and integer
  // protobuf encoding. No production decoder/encoder generated these constants.
  const pinnedWire = '0a85010a02c1452208c56bd8a3b3341d9d40e0c4d086a6375a67080112630a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412320a15417e5f4552091a69125d5dfcb7b8c2659029395bdf121541353535353535353535353535353535353535353518d1a54c7080f0cc86a637124179be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179826fa509ec12503e09fb669a93c8e2c880906efa7b011e36065b391bc2e20c65801';
  assert.equal(result.nativeWire, pinnedWire);
  assert.equal(result.nativeId, '5f4748e244fe40730aa933c0f4eac86faf0bf063d1689402002c4b758b1d6351');
  assert.equal(result.transactionSHA256, '906ca1ce5d9dfe9a8b2bc22cb5efbaa87043d7669d842acc66c7e415e933e704');
  assert.equal(result.nativeWire, f.wire.toString('hex'));
  assert.equal(result.rawDataHex, f.raw.toString('hex'));
  assert.equal(result.nativeId, sha(f.raw));
  assert.equal(result.transactionSHA256, sha(f.wire));
  assert.notEqual(result.nativeId, result.transactionSHA256);
  for (const [key, value] of Object.entries(f.original.expected)) assert.equal(result[key], value);
  assert.equal(result.signature.signerAddress, OWNER); assert.equal(result.permissionId, '0');
  assert.equal(result.schema, api.TRON_TRANSFER_WIRE_PROFILE);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.signature));
});

test('public OpenSSL verification independently validates synthetic signatures over SHA256(raw_data)', () => {
  const publicKey = createPublicKey({ format: 'der', type: 'spki', key: bytes(
    '3056301006072a8648ce3d020106052b8104000a03420004' + GX.toString(16)
    + '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8') });
  for (const nonce of [1, 2]) for (const memo of [null, MEMO]) {
    const f = fixture({ nonce, memo });
    assert.equal(verify('sha256', f.raw, { key: publicKey, dsaEncoding: 'ieee-p1363' }, f.signature.subarray(0, 64)), true);
    assert.equal(verify('sha256', f.wire, { key: publicKey, dsaEncoding: 'ieee-p1363' }, f.signature.subarray(0, 64)), false);
  }
});

test('fixed32 raw memo K is bound as bytes with no ASCII prefix, ABI or secret opening', () => {
  const f = fixture({ memo: MEMO }), result = bind(f.original).signed;
  assert.equal(result.wireKeyCommitment, MEMO);
  assert.ok(f.raw.includes(join(Buffer.from([0x52, 0x20]), bytes(MEMO))));
  assert.equal(decode(fixture().original.nativeWire).wireKeyCommitment, null);
  const sparseKey = '00'.repeat(31) + '01';
  assert.equal(bind(fixture({ memo: sparseKey }).original).signed.wireKeyCommitment, sparseKey);
  for (const memo of ['', 'ab'.repeat(31), 'ab'.repeat(33), '00'.repeat(32),
    Buffer.from('LNRB1:' + MEMO).toString('hex')]) rejectsFixture({ memo }, /TRON_TRANSFER_MEMO/);
  for (const expectation of [null, 'cd'.repeat(32)]) assert.throws(() => bind({ ...f.original,
    expected: { ...f.original.expected, wireKeyCommitment: expectation } }), /ORIGINAL_INTENT/);
  const absent = fixture(); assert.throws(() => bind({ ...absent.original,
    expected: { ...absent.original.expected, wireKeyCommitment: MEMO } }), /ORIGINAL_INTENT/);
});

test('all numeric values remain exact across JavaScript safe-integer boundary and int63 maximum', () => {
  const amount = (1n << 63n) - 1n, timestamp = 9_007_199_254_740_993n, expiration = amount;
  const result = bind(fixture({ amount, timestamp, expiration }).original).signed;
  assert.equal(result.amountSun, String(amount)); assert.equal(result.timestampMs, String(timestamp));
  assert.equal(result.expirationMs, String(expiration));
  assert.equal(decode(fixture({ amount: 1n }).original.nativeWire).amountSun, '1');
  for (const value of [0n, 1n << 63n, (1n << 64n) - 1n]) rejectsFixture({ amount: value }, /AMOUNT/);
});

test('required positive timestamp and later int63 expiration are local profile checks, without a clock', () => {
  for (const values of [{ timestamp: 0n }, { expiration: 0n }, { timestamp: 100n, expiration: 100n },
    { timestamp: 100n, expiration: 99n }, { timestamp: 1n, expiration: 1n << 63n },
    { timestamp: 1n << 63n, expiration: (1n << 63n) + 1n }]) rejectsFixture(values, /TIME_PROFILE/);
  // Accepted old/future values make no claim about present admission or chain-head expiry.
  for (const timestamp of [1n, 1_900_000_000_000n, 9_007_199_254_740_993n])
    assert.equal(decode(fixture({ timestamp }).original.nativeWire).expirationVerified, false);
});

test('TAPOS fields have exact lengths; arbitrary and all-zero references prove no canonical block', () => {
  for (const refBytes of ['', '00', '000000']) rejectsFixture({ refBytes }, /TAPOS_LENGTH/);
  for (const refHash of ['', '00'.repeat(7), '00'.repeat(9)]) rejectsFixture({ refHash }, /TAPOS_LENGTH/);
  const result = decode(fixture({ refBytes: '0000', refHash: '00'.repeat(8) }).original.nativeWire);
  assert.equal(result.refBlockHash, '00'.repeat(8)); assert.equal(result.taposVerified, false);
  assert.equal(result.genesisVerified, false);
});

test('21-byte 41 addresses and distinct transfer endpoints are required', () => {
  for (const value of ['35'.repeat(20), '41' + '35'.repeat(21), '40' + '35'.repeat(20), '']) {
    rejectsFixture({ owner: value }, /ADDRESS/); rejectsFixture({ recipient: value }, /ADDRESS/);
  }
  rejectsFixture({ recipient: OWNER }, /SELF_TRANSFER/);
  rejectsFixture({ owner: '41' + 'cd'.repeat(20) }, /SIGNATURE_OWNER/);
});

test('only TransferContract enum1 and the exact protobuf Any type URL are supported', () => {
  const f = fixture();
  for (const type of [0n, 2n, 31n, (1n << 64n) - 1n])
    rejectsFixture({ contractFields: [field(1, type), f.contractFields[1]] }, /CONTRACT_TYPE/);
  for (const typeUrl of ['', 'protocol.TransferContract', 'type.googleapis.com/protocol.TransferAssetContract',
    'type.googleapis.com/protocol.TransferContract\0', 'type.googleapis.com/protocol.TransferContract\n'])
    rejectsFixture({ anyFields: [field(1, Buffer.from(typeUrl)), f.anyFields[1]] }, /TYPE_URL/);
});

test('missing required fields at every protobuf level reject instead of defaulting', () => {
  const f = fixture();
  for (const name of ['transferFields', 'anyFields', 'contractFields', 'rawFields', 'envelopeFields'])
    for (let i = 0; i < f[name].length; i++) rejectsFixture({ [name]: f[name].filter((_, index) => index !== i) });
});

test('duplicate fields including repeated contracts and signatures reject at every level', () => {
  const f = fixture({ memo: MEMO });
  for (const name of ['transferFields', 'anyFields', 'contractFields', 'rawFields', 'envelopeFields'])
    for (let i = 0; i < f[name].length; i++) {
      const doubled = [...f[name]]; doubled.splice(i, 0, f[name][i]);
      rejectsFixture({ [name]: doubled }, /ORDER_OR_DUPLICATE|MESSAGE_BOUND/);
    }
});

test('reordered fields and unknown fields fail closed at every protobuf level', () => {
  const f = fixture();
  for (const name of ['transferFields', 'anyFields', 'contractFields', 'rawFields', 'envelopeFields']) {
    rejectsFixture({ [name]: [...f[name]].reverse() }, /ORDER_OR_DUPLICATE/);
    rejectsFixture({ [name]: [...f[name], field(99, 1n)] }, /UNSUPPORTED_FIELD/);
  }
});

test('owner permission is default omitted zero; explicit permissions and provider/name extensions reject', () => {
  const f = fixture();
  for (const permission of [0n, 1n, 2n, 9n]) rejectsFixture({ contractFields: [...f.contractFields, field(5, permission)] }, /UNSUPPORTED_FIELD/);
  for (const number of [3, 4]) rejectsFixture({ contractFields: [...f.contractFields, field(number, Buffer.alloc(0))] }, /UNSUPPORTED_FIELD/);
});

test('ret results, auths, scripts, ref_block_num and fee_limit are outside the signed-transfer subset', () => {
  const f = fixture();
  rejectsFixture({ envelopeFields: [...f.envelopeFields, field(5, Buffer.alloc(0))] }, /UNSUPPORTED_FIELD/);
  for (const [index, extension] of [[1, field(3, 1n)], [3, field(9, Buffer.alloc(0))],
    [4, field(12, Buffer.alloc(0))], [5, field(18, 0n)], [5, field(18, 1n)]]) {
    const rawFields = [...f.rawFields]; rawFields.splice(index, 0, extension);
    rejectsFixture({ rawFields }, /UNSUPPORTED_FIELD/);
  }
});

test('wrong protobuf wire types, field0, groups, reserved types and huge tags reject', () => {
  const f = fixture();
  for (const tag of [0n, 8n, 11n, 12n, 13n, 14n, 15n, 1n << 32n])
    rejectsFixture({ envelopeFields: [varint(tag), ...f.envelopeFields] });
  for (const name of ['transferFields', 'anyFields', 'contractFields', 'rawFields'])
    rejectsFixture({ [name]: patchAt(f[name], 0, field(1, name === 'contractFields' ? Buffer.from([1]) : 1n)) }, /UNSUPPORTED_FIELD/);
});

test('minimal varints are required for tags, byte lengths and integer values', () => {
  const f = fixture();
  rejectsFixture({ envelopeFields: [join(Buffer.from([0x8a, 0x00]), varint(f.raw.length), f.raw), f.envelopeFields[1]] }, /VARINT_NONMINIMAL/);
  const length = varint(f.raw.length), overlongLength = join(length.subarray(0, -1), Buffer.from([length.at(-1) | 128, 0]));
  rejectsFixture({ envelopeFields: [join(Buffer.from([0x0a]), overlongLength, f.raw), f.envelopeFields[1]] }, /VARINT_NONMINIMAL/);
  rejectsFixture({ transferFields: [f.transferFields[0], f.transferFields[1], Buffer.from([0x18, 0x81, 0x00])] }, /VARINT_NONMINIMAL/);
  rejectsFixture({ rawFields: patchAt(f.rawFields, 2, Buffer.from([0x40, 0x80, 0x00])) }, /VARINT_NONMINIMAL/);
  rejectsFixture({ contractFields: [Buffer.from([0x08, 0x81, 0x00]), f.contractFields[1]] }, /VARINT_NONMINIMAL/);
});

test('varint overflow, unterminated varints, length overruns and bounded messages reject', () => {
  const f = fixture();
  for (const bad of [Buffer.alloc(11, 0x80), join(Buffer.alloc(9, 0xff), Buffer.from([2])), Buffer.from([0x80])]) {
    rejectsFixture({ transferFields: [f.transferFields[0], f.transferFields[1], join(Buffer.from([0x18]), bad)] }, /VARINT/);
    rejectsFixture({ envelopeFields: [join(Buffer.from([0x0a]), bad)] }, /VARINT/);
  }
  rejectsFixture({ envelopeFields: [join(Buffer.from([0x0a]), varint((1n << 64n) - 1n))] }, /BYTES_TRUNCATED/);
  rejectsFixture({ envelopeFields: [field(1, Buffer.alloc(257)), f.envelopeFields[1]] }, /MESSAGE_BOUND/);
  rejectsFixture({ rawFields: patchAt(f.rawFields, 3, field(11, Buffer.alloc(193))) }, /MESSAGE_BOUND/);
  rejectsFixture({ contractFields: [f.contractFields[0], field(2, Buffer.alloc(161))] }, /MESSAGE_BOUND/);
  rejectsFixture({ anyFields: [f.anyFields[0], field(2, Buffer.alloc(97))] }, /MESSAGE_BOUND/);
});

test('canonical lowercase bare hex, complete consumption and all truncated wire prefixes reject', () => {
  const f = fixture({ memo: MEMO }), wire = f.original.nativeWire;
  for (const value of ['', '0x' + wire, wire.toUpperCase(), wire + '\n', wire + ' ', wire + '0', wire + '00',
    '00'.repeat(513), null, undefined, f.wire, 1, { toString() { throw new Error('coercion'); } }]) assert.throws(() => decode(value));
  for (let length = 0; length < f.wire.length; length++) assert.throws(() => decode(wire.slice(0, 2 * length)));
});

test('single canonical65 r||s||v with recovery byte0/1 and low-S is required', () => {
  const f = fixture();
  for (const signature of [f.signature.subarray(0, 64), join(f.signature, Buffer.from([0])),
    join(f.signature, Buffer.alloc(3)), Buffer.alloc(65)]) rejectsFixture({ signature }, /SIGNATURE/);
  for (const value of [2, 3, 27, 28, 255]) rejectsFixture({ signature: join(f.signature.subarray(0, 64), Buffer.from([value])) }, /SIGNATURE_PROFILE/);
  for (const r of [0n, ORDER, (1n << 256n) - 1n]) rejectsFixture({ signature: join(scalar(r), f.signature.subarray(32)) }, /SIGNATURE_PROFILE/);
  for (const s of [0n, ORDER / 2n + 1n, ORDER, (1n << 256n) - 1n])
    rejectsFixture({ signature: join(f.signature.subarray(0, 32), scalar(s), f.signature.subarray(64)) }, /SIGNATURE_PROFILE/);
  const highS = ORDER - BigInt('0x' + f.signature.subarray(32, 64).toString('hex'));
  rejectsFixture({ signature: join(f.signature.subarray(0, 32), scalar(highS), Buffer.from([f.signature[64] ^ 1])) }, /SIGNATURE_PROFILE/);
});

test('raw_data mutations, wrong digest and recovery parity do not retain owner binding', () => {
  const f = fixture({ memo: MEMO });
  for (const changed of [{ amount: 3n }, { recipient: '41' + 'ab'.repeat(20) }, { memo: 'cd'.repeat(32) },
    { timestamp: 1_900_000_000_001n }, { expiration: 1_900_000_060_001n }, { refBytes: 'abcd' }, { refHash: 'ab'.repeat(8) }])
    rejectsFixture({ memo: MEMO, ...changed, signature: f.signature }, /SIGNATURE_OWNER/);
  rejectsFixture({ signature: syntheticSignature(f.wire) }, /SIGNATURE_OWNER/);
  rejectsFixture({ signature: join(f.signature.subarray(0, 64), Buffer.from([f.signature[64] ^ 1])) }, /SIGNATURE_OWNER/);
});

test('a second valid signature for identical raw_data keeps txID but changes original envelope identity', () => {
  const first = fixture({ nonce: 1 }), second = fixture({ nonce: 2 });
  const a = bind(first.original).signed, b = bind(second.original).signed;
  assert.equal(a.nativeId, b.nativeId); assert.equal(a.ownerAddress, b.ownerAddress);
  assert.notEqual(a.nativeWire, b.nativeWire); assert.notEqual(a.transactionSHA256, b.transactionSHA256);
  assert.throws(() => bind({ ...second.original, expected: first.original.expected }), /ORIGINAL_IDENTITY/);
});

test('all expected fields bind exactly, including original txID and signed-envelope SHA256', () => {
  const f = fixture({ memo: MEMO });
  const replacements = { nativeId: '00'.repeat(32), transactionSHA256: '00'.repeat(32), ownerAddress: RECIPIENT,
    recipientAddress: OWNER, amountSun: '1', refBlockBytes: '0000', refBlockHash: '00'.repeat(8),
    timestampMs: '1', expirationMs: '2', wireKeyCommitment: 'cd'.repeat(32) };
  for (const [key, value] of Object.entries(replacements)) assert.throws(() => bind({ ...f.original,
    expected: { ...f.original.expected, [key]: value } }), /ORIGINAL_(IDENTITY|INTENT)/);
});

test('strict input records reject additional keys, absent expectations, proxies and getters without invoking them', () => {
  const f = fixture(), original = f.original;
  for (const key of Object.keys(original.expected)) {
    const expected = { ...original.expected }; delete expected[key]; assert.throws(() => bind({ ...original, expected }), /MISSING_FIELD/);
  }
  for (const candidate of [{ ...original, authorized: true }, { ...original, inclusion: {} },
    { ...original, expected: { ...original.expected, permissionVerified: true } }, Object.create(original),
    new Proxy(original, { getPrototypeOf() { throw new Error('proxy trap executed'); } })]) assert.throws(() => bind(candidate), /FIELD|RECORD/);
  const getter = { ...original };
  Object.defineProperty(getter, 'nativeWire', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(() => bind(getter), /INVALID_DATA_FIELD/);
  const expectedGetter = { ...original.expected };
  Object.defineProperty(expectedGetter, 'amountSun', { enumerable: true, get() { throw new Error('getter executed'); } });
  assert.throws(() => bind({ ...original, expected: expectedGetter }), /INVALID_DATA_FIELD/);
  assert.throws(() => bind({ ...original, expected: new Proxy(original.expected, {}) }), /INVALID_RECORD/);
  assert.throws(() => bind({ ...original, [Symbol('extra')]: true }), /UNEXPECTED_FIELD/);
});

test('expected values reject noncanonical numbers, address aliases, memo omissions and malformed hashes', () => {
  const f = fixture();
  for (const key of ['amountSun', 'timestampMs', 'expirationMs']) for (const value of [1, 1n, '01', '0', '-1', '1\n', ' 1', '1e0', String(1n << 63n)])
    assert.throws(() => bind({ ...f.original, expected: { ...f.original.expected, [key]: value } }), /EXPECTED_INTEGER/);
  for (const [key, values] of Object.entries({ ownerAddress: [OWNER.toUpperCase(), '0x' + OWNER, OWNER + '\n',
    'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC'], nativeId: ['00', f.original.expected.nativeId + '\n'],
    transactionSHA256: [null, f.original.expected.transactionSHA256.toUpperCase()], refBlockBytes: ['c145\n'],
    refBlockHash: ['00'], wireKeyCommitment: [undefined, '', '00'.repeat(32), MEMO + '\n'] }))
    for (const value of values) assert.throws(() => bind({ ...f.original, expected: { ...f.original.expected, [key]: value } }), /EXPECTED_/);
});

test('outputs explicitly carry no permission, genesis, receipt, finality, graph or credit authority', () => {
  const result = bind(fixture({ memo: MEMO }).original).signed;
  for (const key of ['accountPermissionVerified', 'taposVerified', 'expirationVerified', 'genesisVerified',
    'inclusionVerified', 'finalityVerified', 'deliveryVerified', 'graphAdmissionEligible', 'creditEligible']) assert.equal(result[key], false);
  assert.equal(result.privateSpendableAtomic, null); assert.equal(result.assurance, 'signed-owner-address-binding-only');
  assert.deepEqual(Object.keys(api).sort(), ['TRON_TRANSFER_WIRE_LIMITS', 'TRON_TRANSFER_WIRE_PROFILE',
    'bindOriginalTronNativeTransfer', 'decodeTronNativeTransferWire'].sort());
  assert.throws(() => { result.creditEligible = true; }, TypeError);
  assert.throws(() => { result.signature.signerAddress = RECIPIENT; }, TypeError);
});
