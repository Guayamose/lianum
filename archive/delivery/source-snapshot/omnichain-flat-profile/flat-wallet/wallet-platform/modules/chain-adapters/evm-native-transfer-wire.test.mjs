import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeEvmNativeTransferWire, bindOriginalEvmNativeTransfer } from './evm-native-transfer-wire.mjs';
import { originalFixture, fixtureRlp } from './evm-native-transfer-fixture.mjs';

// Published signed bytes only, copied from the EIP-155 example (CC0).
// https://eips.ethereum.org/EIPS/eip-155; no key is loaded and nothing is signed.
const EIP155 = '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83';
test('published EIP-155 signed transfer decodes unchanged with independently known sender', () => {
  const decoded = decodeEvmNativeTransferWire(EIP155);
  assert.equal(decoded.from, '0x9d8a62f656a8d1615c1294fd71e9cfb3e4855a4f');
  assert.equal(decoded.chainId, '1'); assert.equal(decoded.nonce, '9'); assert.equal(decoded.value, '1000000000000000000');
  assert.equal(decoded.gasPrice, '20000000000'); assert.equal(decoded.gas, '21000'); assert.equal(decoded.type, '0');
  assert.equal(decoded.to, '0x' + '35'.repeat(20)); assert.equal(decoded.signature.v, '37');
  assert.equal(decoded.signature.r, '18515461264373351373200002665853028612451056578545711640558177340181847433846');
});

test('all four chains decode legacy, EIP-2930 and EIP-1559 against separately assembled public preimages', () => {
  for (const chain of ['ethereum', 'base', 'arbitrum', 'bnb']) for (const type of [0, 1, 2]) {
    const fixture = originalFixture(chain, type), decoded = decodeEvmNativeTransferWire(fixture.original.nativeWire);
    assert.equal(decoded.chainId, fixture.expected.chainId); assert.equal(decoded.type, String(type));
    assert.equal(decoded.nativeId.slice(2), fixture.original.expected.nativeId);
    for (const key of ['from', 'to', 'value', 'nonce']) assert.equal(decoded[key], fixture.original.expected[key]);
    assert.equal(decoded.gas, fixture.expected.gas); assert.equal(decoded.data, '0x'); assert.ok(Object.isFrozen(decoded.signature));
    assert.equal(bindOriginalEvmNativeTransfer(fixture.original, fixture.expected.chainId).signed.nativeId, decoded.nativeId);
    if (type === 2) { assert.equal(decoded.maxFeePerGas, '30'); assert.equal(decoded.maxPriorityFeePerGas, '2'); }
    else assert.equal(decoded.gasPrice, '20');
  }
});

test('typed access lists preserve signed order, duplicate entries and storage-key bytes', () => {
  const item = { address: '0x' + '56'.repeat(20), storageKeys: ['0x' + '00'.repeat(32), '0x' + '01'.repeat(32)] };
  for (const type of [1, 2]) {
    const f = originalFixture('base', type, { accessList: [item, item] });
    assert.deepEqual(decodeEvmNativeTransferWire(f.original.nativeWire).accessList, [item, item]);
  }
});

test('wrong original amount, recipient, sender, nonce, hash and chain reject before any RPC', () => {
  const f = originalFixture();
  for (const patch of [{ value: '1' }, { nonce: '8' }, { from: '0x' + 'ab'.repeat(20) },
    { to: '0x' + 'cd'.repeat(20) }, { nativeId: 'ef'.repeat(32) }])
    assert.throws(() => bindOriginalEvmNativeTransfer({ ...f.original, expected: { ...f.original.expected, ...patch } }, '1'));
  assert.throws(() => bindOriginalEvmNativeTransfer(f.original, '8453'));
  assert.throws(() => bindOriginalEvmNativeTransfer({ ...f.original, expected: { ...f.original.expected, signer: {} } }, '1'));
  assert.equal(f.calls.length, 0);
});

test('unsupported types, ambiguous RLP, signature malleability, calldata and oversized value fail closed', () => {
  for (const wire of ['0x04c0', '0x03c0', '0x7ec0', '0x80', '0x01c0', '0x02c0', EIP155 + '00', EIP155.toUpperCase(), '0x' + '00'.repeat(131073)])
    assert.throws(() => decodeEvmNativeTransferWire(wire));
  for (const patch of [{ value: '0' }, { value: (1n << 128n).toString() }, { data: '0x12' }, { gas: '20999' }, { maxPriorityFeePerGas: '31' }])
    assert.throws(() => decodeEvmNativeTransferWire(originalFixture('ethereum', 2, patch).original.nativeWire));
  const parts = [Buffer.from([1]), Buffer.alloc(0), Buffer.from([2]), Buffer.from([30]), Buffer.from('5208', 'hex'),
    Buffer.from('34'.repeat(20), 'hex'), Buffer.from([1]), Buffer.alloc(0), [], Buffer.alloc(0), Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex'),
    Buffer.from('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140', 'hex')];
  assert.throws(() => decodeEvmNativeTransferWire('0x02' + fixtureRlp(parts).toString('hex')), /SIGNATURE/);
  parts[11] = Buffer.from([1]); parts[9] = Buffer.from([2]);
  assert.throws(() => decodeEvmNativeTransferWire('0x02' + fixtureRlp(parts).toString('hex')), /SIGNATURE/);
  parts[9] = Buffer.alloc(0); parts[0] = Buffer.from([0, 1]);
  assert.throws(() => decodeEvmNativeTransferWire('0x02' + fixtureRlp(parts).toString('hex')), /INTEGER/);
});
