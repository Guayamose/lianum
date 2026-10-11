import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeClaimABI } from '@lianum/engine/claims/abi';
import { nativeStaticArguments, nativeProofCalldata }
  from '../../../src/execution/native/dispatch/native-deployment.mjs';
import { publicKeccak256 }
  from '@lianum/engine/cohorts/private-cohort-public-native';

const word = n => BigInt(n).toString(16).padStart(64, '0');
test('nested static values match the established fixed ABI encoder', () => {
  const inputs = [{ name: 'v', type: 'tuple', components: [
    { name: 'n', type: 'uint64' }, { name: 'xs', type: 'bytes32[2]' },
    { name: 'recipient', type: 'address' }] }];
  const values = [{ n: '600', xs: ['0x' + word(1), '0x' + word(2)], recipient: '0x' + 'aa'.repeat(20) }];
  assert.equal(encodeClaimABI(inputs, values), nativeStaticArguments(
    ['uint64', 'bytes32', 'bytes32', 'address'].map(type => ({ type })),
    [values[0].n, ...values[0].xs, values[0].recipient]));
});
test('proof dynamic offsets match the established proof calldata encoder', () => {
  const inputs = [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }];
  const signature = 'verify(bytes,bytes32[])';
  const artifact = { abi: [{ type: 'function', name: 'verify', inputs }],
    evm: { methodIdentifiers: { [signature]: publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex') } } };
  const proof = Buffer.from('a5'.repeat(33), 'hex'), words = ['1', '4294967295', '0'];
  assert.equal(encodeClaimABI(inputs, ['0x' + proof.toString('hex'), words.map(n => '0x' + word(n))]).slice(2),
    nativeProofCalldata(artifact, signature, proof, words).slice(10));
});
test('dynamic fixed array offsets are relative to its own tuple without a length word', () => {
  const inputs = [{ name: 'v', type: 'tuple', components: [
    { name: 'endpoints', type: 'bytes[2]' }, { name: 'escrow', type: 'bytes' }] }];
  const encoded = encodeClaimABI(inputs, [{ endpoints: ['0x11', '0x2222'], escrow: '0x33' }]);
  const array = word(64) + word(128) + word(1) + '11'.padEnd(64, '0')
    + word(2) + '2222'.padEnd(64, '0');
  assert.equal(encoded, '0x' + word(32) + word(64) + word(64 + array.length / 2)
    + array + word(1) + '33'.padEnd(64, '0'));
});
test('noncanonical and executable-shaped values fail closed', () => {
  const u = [{ name: 'n', type: 'uint64' }];
  for (const value of ['01', '1\n', '-0', '18446744073709551616', 1])
    assert.throws(() => encodeClaimABI(u, [value]));
  assert.throws(() => encodeClaimABI([{ name: 'x', type: 'bytes' }], ['0x00\n']));
  assert.throws(() => encodeClaimABI([{ name: 'x', type: 'tuple', components: u }], [{ get n() { throw Error('executed'); } }]),
    error => error.message !== 'executed');
});
