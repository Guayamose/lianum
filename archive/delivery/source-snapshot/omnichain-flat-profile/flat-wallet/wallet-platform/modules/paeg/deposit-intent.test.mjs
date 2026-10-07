import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import { DEPOSIT_INTENT_TAG, DEPOSIT_INTENT_PUBLIC_WORDS, validateDepositIntentStatement,
  encodeDepositIntentInputs, decodeDepositIntentInputs, depositIntentFrame, depositIntentWitness } from './deposit-intent.mjs';
import { freshKey, signature, uintBE } from '../../../../../omnichain-product/src/private-note-encoding.mjs';
import { balanceCommitment, balanceDepositFrame, walletDepositInput, walletInputPublicWords }
  from '../../../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { SECP256K1_ORDER } from '../../../../../omnichain-product/src/private-native-certificate.mjs';

const hex = byte => byte.repeat(32);
function fixture({ amount = '400', validFrom = '1700000000', validUntil = '1700007200' } = {}) {
  const key = freshKey();
  const note = { type: 4, rho: hex('33'), x: key.x.toString('hex'), y: key.y.toString('hex'),
    value: amount, secret: hex('44') };
  const statement = { scope: hex('11'), policy: hex('22'), validFrom, validUntil, amount,
    output: balanceCommitment(hex('11'), hex('22'), note).toString('hex') };
  return { key, note, statement, signature: signature(key, depositIntentFrame(statement)).toString('hex') };
}
const request = f => ({ statement: f.statement, note: f.note, signature: f.signature });
const ownerVerify = (f, frame, signed = f.signature) => verify('sha256', frame,
  { key: f.key.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signed, 'hex'));

test('D27 has exact 27-word ABI and preserves the existing type-4 note opening', () => {
  const f = fixture(), result = depositIntentWitness(request(f));
  assert.equal(DEPOSIT_INTENT_PUBLIC_WORDS, 27);
  assert.deepEqual(Object.keys(result.inputs), ['scope', 'policy', 'valid_from', 'valid_until', 'amount',
    'output', 'rho', 'key_x', 'key_y', 'secret', 'signature']);
  assert.deepEqual(result.publicInputs, [...result.inputs.scope.map(String), ...result.inputs.policy.map(String),
    result.inputs.valid_from, result.inputs.valid_until, result.inputs.amount, ...result.inputs.output.map(String)]);
  assert.deepEqual(decodeDepositIntentInputs(result.publicInputs), f.statement);
  assert.deepEqual(result.publicInputs.slice(16, 19), ['1700000000', '1700007200', '400']);
  const legacy = walletDepositInput({ scope: f.statement.scope, policy: f.statement.policy, epoch: '2833333',
    note: { ...f.note, ...f.key } });
  assert.equal(walletInputPublicWords('deposit_balance', legacy).length, 26);
  for (const field of ['scope', 'policy', 'amount', 'output', 'rho', 'key_x', 'key_y', 'secret'])
    assert.deepEqual(result.inputs[field], legacy[field], field);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.inputs) && Object.isFrozen(result.inputs.signature));
  f.note.secret = hex('55'); f.statement.validUntil = '1700010000';
  assert.equal(result.statement.validUntil, '1700007200');
  assert.deepEqual(result.inputs.secret, Array(32).fill(0x44));
});

test('signing frame has fixed H4 lengths, tag, field order, widths and endian convention', () => {
  const s = { scope: hex('11'), policy: hex('22'), validFrom: '1', validUntil: '18446744073709551615',
    amount: '4294967296', output: hex('aa') };
  const frame = depositIntentFrame(s);
  const expected = '0000001c4c49414e554d2f504145472f6465706f7369742d696e74656e742f31'
    + '00000020' + hex('11') + '00000020' + hex('22')
    + '00000008000000000000000100000008ffffffffffffffff000000080000000100000000'
    + '00000020' + hex('aa');
  assert.equal(DEPOSIT_INTENT_TAG, 'LIANUM/PAEG/deposit-intent/1');
  assert.equal(frame.length, 176);
  assert.equal(frame.toString('hex'), expected);
  assert.equal(createHash('sha256').update(frame).digest('hex'),
    '6c84c76b35bc5ebf9d7f89da57296d4707fa5a1ffccbc6368519a3e2519c638c');
});

test('owner signature commits every one of the 27 public scalar positions', () => {
  const f = fixture(), words = encodeDepositIntentInputs(f.statement);
  assert.ok(ownerVerify(f, depositIntentFrame(f.statement)));
  for (let i = 0; i < 27; i++) {
    const changed = [...words]; changed[i] = (BigInt(changed[i]) ^ 1n).toString();
    assert.equal(ownerVerify(f, depositIntentFrame(decodeDepositIntentInputs(changed))), false, `public word ${i}`);
    assert.throws(() => depositIntentWitness({ ...request(f), statement: decodeDepositIntentInputs(changed) }),
      /DEPOSIT_INTENT_(NOTE_VALUE|NOTE_COMMITMENT|OWNER_SIGNATURE)/, `public word ${i}`);
  }
  for (const validUntil of ['1700000001', '1700093600'])
    assert.throws(() => depositIntentWitness({ ...request(f), statement: { ...f.statement, validUntil } }),
      /OWNER_SIGNATURE/);
});

test('D26 signatures, alternate frame encodings and another owner cannot authorize D27', () => {
  const f = fixture(), s = f.statement;
  const legacyFrame = balanceDepositFrame(s.scope, s.policy, '2833333', s.amount, s.output);
  assert.throws(() => depositIntentWitness({ ...request(f), signature: signature(f.key, legacyFrame).toString('hex') }),
    /OWNER_SIGNATURE/);
  assert.throws(() => depositIntentWitness({ ...request(f), signature: signature(freshKey(), depositIntentFrame(s)).toString('hex') }),
    /OWNER_SIGNATURE/);
  const raw = depositIntentFrame(s);
  const frames = [raw.subarray(2), Buffer.concat([raw, Buffer.from('\n')]),
    Buffer.from(JSON.stringify(s)), Buffer.concat([uintBE(28, 2), raw.subarray(4)])];
  for (const frame of frames) assert.equal(ownerVerify(f, frame), false);
});

test('canonical low-S is mandatory even when Node accepts the high-S twin', () => {
  const f = fixture(), low = Buffer.from(f.signature, 'hex');
  const high = Buffer.concat([low.subarray(0, 32), uintBE(SECP256K1_ORDER - BigInt('0x' + low.subarray(32).toString('hex')), 32)]).toString('hex');
  assert.ok(ownerVerify(f, depositIntentFrame(f.statement), high));
  assert.throws(() => depositIntentWitness({ ...request(f), signature: high }), /SIGNATURE_LOW_S/);
  for (const invalid of ['0'.repeat(128), '0'.repeat(64) + f.signature.slice(64),
    f.signature.slice(0, 64) + '0'.repeat(64), SECP256K1_ORDER.toString(16) + f.signature.slice(64)])
    assert.throws(() => depositIntentWitness({ ...request(f), signature: invalid }), /SIGNATURE_LOW_S/);
});

test('amount and absolute window bounds include full u64 and reject zero, empty or reversed windows', () => {
  const maximum = '18446744073709551615';
  const f = fixture({ amount: maximum, validFrom: '0', validUntil: maximum });
  assert.deepEqual(depositIntentWitness(request(f)).publicInputs.slice(16, 19), ['0', maximum, maximum]);
  for (const delta of [{ amount: '0' }, { validFrom: maximum }, { validFrom: '2', validUntil: '1' },
    { validUntil: '0' }, { amount: '18446744073709551616' }, { validUntil: '18446744073709551616' }])
    assert.throws(() => validateDepositIntentStatement({ ...f.statement, ...delta }), /DEPOSIT_INTENT_/);
});

test('strict canonical text rejects LF, CR, whitespace, hex prefixes, mixed case and coercion', () => {
  const f = fixture();
  for (const value of ['01', '1\n', '1\r\n', ' 1', '+1', '-0', '1.0', '1e0', '0x1', '１', 1, 1n, true])
    assert.throws(() => validateDepositIntentStatement({ ...f.statement, amount: value }), /DEPOSIT_INTENT_/);
  for (const name of ['scope', 'policy', 'output'])
    for (const value of [f.statement[name] + '\n', '0x' + f.statement[name], 'AB'.repeat(32), 'a'.repeat(63), Buffer.alloc(32)])
      assert.throws(() => validateDepositIntentStatement({ ...f.statement, [name]: value }), /COMMITMENT_/);
  for (const value of [f.signature + '\n', '0x' + f.signature, f.signature.toUpperCase(), Buffer.from(f.signature, 'hex')])
    assert.throws(() => depositIntentWitness({ ...request(f), signature: value }), /SIGNATURE_/);
  for (const name of ['rho', 'x', 'y', 'secret'])
    assert.throws(() => depositIntentWitness({ ...request(f), note: { ...f.note, [name]: f.note[name] + '\n' } }), /COMMITMENT_/);
});

test('note substitutions, unexpected fields and non-data records fail closed', () => {
  const f = fixture();
  for (const delta of [{ type: 2 }, { value: '401' }, { rho: hex('44') }, { secret: hex('55') },
    { x: fixture().note.x }])
    assert.throws(() => depositIntentWitness({ ...request(f), note: { ...f.note, ...delta } }), /DEPOSIT_INTENT_/);
  assert.throws(() => depositIntentWitness({ ...request(f), privateKey: f.key.privateKey }), /EXACT_FIELDS/);
  assert.throws(() => depositIntentWitness({ ...request(f), note: { ...f.note, privateKey: f.key.privateKey } }), /EXACT_FIELDS/);
  assert.throws(() => validateDepositIntentStatement({ ...f.statement, epoch: '2833333' }), /EXACT_FIELDS/);
  assert.throws(() => validateDepositIntentStatement(new Proxy(f.statement, {})), /PLAIN_RECORD/);
  const getter = { ...f.statement }; let reads = 0;
  Object.defineProperty(getter, 'amount', { enumerable: true, get() { reads++; return '400'; } });
  assert.throws(() => validateDepositIntentStatement(getter), /DATA_FIELDS/); assert.equal(reads, 0);
});

test('public decoder rejects sparse arrays, extra properties, noncanonical words and out-of-width digests', () => {
  const f = fixture(), words = encodeDepositIntentInputs(f.statement);
  for (const size of [26, 28]) assert.throws(() => decodeDepositIntentInputs(Array(size).fill('1')), /ARRAY_LENGTH/);
  const sparse = [...words]; delete sparse[0]; assert.throws(() => decodeDepositIntentInputs(sparse), /ARRAY_PROPERTIES/);
  const extra = [...words]; extra.extra = 'x'; assert.throws(() => decodeDepositIntentInputs(extra), /ARRAY_PROPERTIES/);
  assert.throws(() => decodeDepositIntentInputs(new Proxy([...words], {})), /ARRAY_LENGTH/);
  for (const value of ['4294967296', '01', '1\n', '0x00000001', 1, '-1']) {
    const changed = [...words]; changed[0] = value;
    assert.throws(() => decodeDepositIntentInputs(changed), /DEPOSIT_INTENT_/);
  }
  const zeroOutput = [...words]; zeroOutput.fill('0', 19);
  assert.throws(() => decodeDepositIntentInputs(zeroOutput), /COMMITMENT_NONZERO/);
});
