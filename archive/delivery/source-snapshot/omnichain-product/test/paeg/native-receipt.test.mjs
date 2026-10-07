import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalGlobalEffectId } from '../../src/evidence/native-evidence.mjs';
import { canonicalNativeEffectId, nativeReceiptKeyCommitment, nativeReceiptReadOpening,
  nativeReceiptCommitment, nativeReceiptNullifier, nativeReceiptToNoir,
  nativeEffectToNoir } from '../../src/paeg/native-receipt.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const nk = hash('synthetic receipt spend secret');
const base = () => {
  const opening = Object.fromEntries(['hubDomain', 'registryCommitment', 'globalEffectId', 'scope', 'policy',
    'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptRho']
    .map(key => [key, hash(key)]));
  return { ...opening, receiptKeyCommitment: nativeReceiptKeyCommitment(opening.hubDomain, nk), validFrom: '100', validUntil: '200' };
};

test('all historical effect positions and native identity widths retain exact global IDs', () => {
  for (const chain of ['BTC', 'SOL', 'EVM']) for (const effectIndex of ['0', '9', '10', '255', '4294967295']) {
    const input = { chainDomain: { chain, genesis: hash('genesis'), asset: '0'.repeat(64) },
      effectIdentity: { transactionId: 'a'.repeat(chain === 'SOL' ? 128 : 64), effectIndex } };
    assert.equal(canonicalNativeEffectId(input), canonicalGlobalEffectId(input));
  }
});

test('receipt reading never accepts a spend secret or an unverified context extension', () => {
  const opening = base();
  assert.deepEqual(nativeReceiptReadOpening(opening), opening);
  for (const key of ['spendSecret', 'context', 'nodeCommitment', 'verified']) {
    assert.throws(() => nativeReceiptReadOpening({ ...opening, [key]: nk }), /NATIVE_RECEIPT_READ_FIELDS/);
  }
  assert.throws(() => nativeReceiptNullifier(opening, hash('wrong secret')), /NATIVE_RECEIPT_KEY_MISMATCH/);
});

test('scope, exact local terms, quorum registry, receipt ownership and window all bind the commitment', () => {
  const opening = base(), commitment = nativeReceiptCommitment(opening), nf = nativeReceiptNullifier(opening, nk);
  for (const field of Object.keys(opening)) {
    const changed = { ...opening, [field]: field === 'validFrom' ? '101' : field === 'validUntil' ? '201' : hash('changed:' + field) };
    assert.notEqual(nativeReceiptCommitment(changed), commitment);
    if (field !== 'receiptKeyCommitment' && field !== 'hubDomain') assert.notEqual(nativeReceiptNullifier(changed, nk), nf);
  }
  assert.throws(() => nativeReceiptReadOpening({ ...opening, validUntil: opening.validFrom }), /NATIVE_RECEIPT_WINDOW/);
});

test('family extension cannot silently alias EVM or reset the identity with a pool or owner salt', () => {
  const input = { chainDomain: { chain: 'TRON', genesis: hash('genesis'), asset: hash('native') },
    effectIdentity: { transactionId: hash('transaction'), effectIndex: '0' } };
  assert.notEqual(canonicalNativeEffectId(input), canonicalNativeEffectId({ ...input, chainDomain: { ...input.chainDomain, chain: 'EVM' } }));
  assert.throws(() => canonicalNativeEffectId({ ...input, pool: hash('pool') }), /NATIVE_EFFECT_FIELDS/);
  assert.throws(() => canonicalNativeEffectId({ ...input, effectIdentity: { ...input.effectIdentity, salt: nk } }), /NATIVE_EFFECT_IDENTITY/);
  assert.throws(() => canonicalNativeEffectId({ ...input, effectIdentity: { ...input.effectIdentity, effectIndex: '01' } }));
});

// An independent host byte oracle for the serialized witness. These checks do
// not execute Noir or claim that a compiled/proven relation has been accepted.
const frame = (tag, fields) => Buffer.concat([Buffer.from(tag, 'ascii'), ...fields].flatMap(field => {
  const length = Buffer.alloc(4); length.writeUInt32BE(field.length);
  return [length, field];
}));
const u64 = value => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes; };
const receiptDigestFields = ['hub_domain', 'registry_commitment', 'global_effect_id', 'scope', 'policy',
  'local_commitment', 'dispatch_id', 'chain_domain', 'evidence_policy', 'action_commitment', 'payout_commitment'];
const nativeInput = (chain, effectIndex = '0') => ({
  chainDomain: { chain, genesis: hash('genesis'), asset: '0'.repeat(64) },
  effectIdentity: { transactionId: 'ab'.repeat(chain === 'SOL' ? 64 : 32), effectIndex },
});

test('receipt witness retains all digest bytes and exact u64 values in the 551-byte contract', () => {
  const opening = { ...base(), validFrom: '9007199254740993', validUntil: '18446744073709551615' };
  const witness = nativeReceiptToNoir(opening);
  assert.deepEqual(Object.keys(witness), [...receiptDigestFields, 'valid_from', 'valid_until',
    'receipt_key_commitment', 'receipt_rho']);
  assert.equal(witness.valid_from, opening.validFrom);
  assert.equal(witness.valid_until, opening.validUntil);
  for (const [field, bytes] of Object.entries(witness)) {
    if (field === 'valid_from' || field === 'valid_until') continue;
    assert.equal(bytes.length, 32);
    assert.ok(bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
    const hostField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    assert.equal(Buffer.from(bytes).toString('hex'), opening[hostField]);
  }
  const receiptFrame = frame('LIANUM/PAEG/native-receipt/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2'),
    ...receiptDigestFields.map(field => Buffer.from(witness[field])), u64(witness.valid_from), u64(witness.valid_until),
    Buffer.from(witness.receipt_key_commitment), Buffer.from(witness.receipt_rho)]);
  assert.equal(receiptFrame.length, 551);
  assert.equal(hash(receiptFrame), nativeReceiptCommitment(opening));
  const keyFrame = frame('LIANUM/PAEG/receipt-key/2', [Buffer.from(witness.hub_domain), Buffer.from(nk, 'hex')]);
  assert.equal(keyFrame.length, 101);
  assert.equal(hash(keyFrame), opening.receiptKeyCommitment);
  const spendFrame = frame('LIANUM/PAEG/receipt-spend/2', [Buffer.from(witness.hub_domain),
    Buffer.from(nk, 'hex'), Buffer.from(hash(receiptFrame), 'hex')]);
  assert.equal(spendFrame.length, 139);
  assert.equal(hash(spendFrame), nativeReceiptNullifier(opening, nk));
});

test('receipt witness rejects zero digests, noncanonical integers and hidden or extra fields', () => {
  const opening = base();
  for (const field of [...Object.keys(opening).filter(field => !field.startsWith('valid'))]) {
    assert.throws(() => nativeReceiptToNoir({ ...opening, [field]: '0'.repeat(64) }), /NATIVE_RECEIPT_DIGEST/);
    assert.throws(() => nativeReceiptToNoir({ ...opening, [field]: `0x${opening[field]}` }), /NATIVE_RECEIPT_DIGEST/);
  }
  for (const value of [0, 100n, '-1', '01', '1.0', '1e2', '18446744073709551616']) {
    assert.throws(() => nativeReceiptToNoir({ ...opening, validFrom: value }), /NATIVE_RECEIPT_TIME/);
  }
  assert.doesNotThrow(() => nativeReceiptToNoir({ ...opening, validFrom: '0', validUntil: '1' }));
  assert.throws(() => nativeReceiptToNoir({ ...opening, validUntil: opening.validFrom }), /NATIVE_RECEIPT_WINDOW/);
  assert.throws(() => nativeReceiptToNoir({ ...opening, spendSecret: nk }), /NATIVE_RECEIPT_READ_FIELDS/);
  const accessor = { ...opening };
  Object.defineProperty(accessor, 'receiptRho', { enumerable: true, get() { throw new Error('accessor executed'); } });
  assert.throws(() => nativeReceiptToNoir(accessor), /NATIVE_RECEIPT_READ_FIELDS/);
  const hidden = { ...opening };
  Object.defineProperty(hidden, 'spendSecret', { value: nk });
  assert.throws(() => nativeReceiptToNoir(hidden), /NATIVE_RECEIPT_READ_FIELDS/);
});

test('native effect witness preserves family widths and canonical decimal positions across every digit length', () => {
  const positions = ['0', '9', '10', '99', '100', '999', '1000', '9999', '10000', '99999',
    '100000', '999999', '1000000', '9999999', '10000000', '99999999', '100000000', '999999999',
    '1000000000', '4294967295'];
  for (const [family, chain] of ['BTC', 'SOL', 'EVM', 'TRON'].entries()) for (const effectIndex of positions) {
    const input = nativeInput(chain, effectIndex), witness = nativeEffectToNoir(input);
    assert.deepEqual(Object.keys(witness), ['family', 'genesis', 'asset', 'transaction_id', 'effect_index']);
    assert.equal(witness.family, String(family + 1));
    assert.equal(witness.effect_index, effectIndex);
    assert.equal(witness.transaction_id.length, 64);
    const transactionLength = chain === 'SOL' ? 64 : 32;
    assert.equal(Buffer.from(witness.transaction_id.slice(0, transactionLength)).toString('hex'), input.effectIdentity.transactionId);
    assert.ok(witness.transaction_id.slice(transactionLength).every(byte => byte === 0));
    const domain = frame('LIANUM/evidence-chain/1', [Buffer.from(chain, 'ascii'),
      Buffer.from(witness.genesis), Buffer.from(witness.asset)]);
    assert.equal(domain.length, chain === 'TRON' ? 107 : 106);
    const bytes = frame('LIANUM/native-global-effect/1', [domain,
      Buffer.from(witness.transaction_id.slice(0, transactionLength)), Buffer.from(witness.effect_index, 'ascii')]);
    assert.equal(bytes.length, 45 + domain.length + transactionLength + effectIndex.length);
    assert.ok(bytes.length <= 225);
    assert.equal(hash(bytes), canonicalNativeEffectId(input));
    if (chain !== 'TRON') assert.equal(hash(bytes), canonicalGlobalEffectId(input));
  }
  const sol = nativeInput('SOL'), changed = nativeInput('SOL');
  changed.effectIdentity.transactionId = `${sol.effectIdentity.transactionId.slice(0, 126)}ac`;
  assert.notDeepEqual(nativeEffectToNoir(sol).transaction_id, nativeEffectToNoir(changed).transaction_id);
  assert.notEqual(canonicalNativeEffectId(sol), canonicalNativeEffectId(changed));
});

test('native effect witness rejects family, width, scalar type and canonical-text aliases', () => {
  const input = nativeInput('BTC');
  for (const effectIndex of [0, 1n, '-1', '01', '1.0', '1e2', '4294967296']) {
    assert.throws(() => nativeEffectToNoir({ ...input, effectIdentity: { ...input.effectIdentity, effectIndex } }), /NATIVE_EFFECT_POSITION/);
  }
  for (const chain of ['btc', 'Sol', 'ETH', '', 1]) {
    assert.throws(() => nativeEffectToNoir({ ...input, chainDomain: { ...input.chainDomain, chain } }), /NATIVE_EFFECT_FAMILY/);
  }
  for (const chain of ['BTC', 'SOL', 'EVM', 'TRON']) {
    const value = nativeInput(chain);
    for (const transactionId of ['ab'.repeat(chain === 'SOL' ? 32 : 64), value.effectIdentity.transactionId.toUpperCase(),
      `0x${value.effectIdentity.transactionId}`, Buffer.from(value.effectIdentity.transactionId, 'hex')]) {
      assert.throws(() => nativeEffectToNoir({ ...value, effectIdentity: { ...value.effectIdentity, transactionId } }), /NATIVE_EFFECT_TRANSACTION/);
    }
  }
  assert.throws(() => nativeEffectToNoir({ ...input, verified: true }), /NATIVE_EFFECT_FIELDS/);
  assert.throws(() => nativeEffectToNoir({ ...input, chainDomain: { ...input.chainDomain, policy: hash('policy') } }), /NATIVE_EFFECT_DOMAIN/);
  assert.throws(() => nativeEffectToNoir({ ...input, effectIdentity: { ...input.effectIdentity, salt: nk } }), /NATIVE_EFFECT_IDENTITY/);
});
