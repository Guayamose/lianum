import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { evmRuntimeCodeHash, evmFunctionSelector, EVM_CODE_HASH_RETAINED_BYTES } from '../../../../src/chains/evm/contracts/evm-code-hash.mjs';

test('pure code hashes retain exact-byte semantics and reject normalized spellings', () => {
  assert.equal(evmRuntimeCodeHash('0x'), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(evmRuntimeCodeHash('0x00'), '0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a');
  const original = evmRuntimeCodeHash('0x6001600055');
  assert.equal(evmRuntimeCodeHash('0x6001600055'), original);
  assert.notEqual(evmRuntimeCodeHash('0x6002600055'), original);
  for (const value of ['0X00', '0x0', '0xAB', '0x00\n', '0x00 ', '0x' + '00'.repeat(24_577), {}])
    assert.throws(() => evmRuntimeCodeHash(value), /EVM_CODE_HASH_CANONICAL_BYTES/);
});


test('ABI selectors share bounded pure-byte hashes without retaining artifact resolution or observations', () => {
  assert.equal(EVM_CODE_HASH_RETAINED_BYTES, 4 * 1024 * 1024);
  for (const [signature, selector] of [['balanceOf(address)', '70a08231'], ['totalSupply()', '18160ddd'],
    ['transfer(address,uint256)', 'a9059cbb']]) {
    const code = '0x' + Buffer.from(signature).toString('hex');
    assert.equal(evmFunctionSelector(signature), selector);
    assert.equal(evmFunctionSelector(signature), evmRuntimeCodeHash(code).slice(2, 10));
  }
  assert.notEqual(evmFunctionSelector('balanceOf(address)'), evmFunctionSelector('balanceOf(uint256)'));
  assert.throws(() => evmFunctionSelector({}), /EVM_FUNCTION_SIGNATURE/);
});


test('same selector bytes remove hashing work only and share the original cache bound', () => {
  const source = readFileSync(new URL('./evm-code-hash.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('const MAX_RUNTIME_BYTES')).replaceAll('export ', '');
  let hashes = 0;
  const api = vm.runInThisContext('(function({assert, Buffer, publicKeccak256}) {' + body
    + '; return { evmFunctionSelector, evmRuntimeCodeHash, EVM_CODE_HASH_RETAINED_BYTES }; })')({ assert, Buffer,
      publicKeccak256(bytes) { hashes++; return publicKeccak256(bytes); } });
  assert.equal(api.evmFunctionSelector('totalSupply()'), '18160ddd');
  assert.equal(api.evmFunctionSelector('totalSupply()'), '18160ddd');
  assert.equal(api.evmRuntimeCodeHash('0x' + Buffer.from('totalSupply()').toString('hex')).slice(2, 10), '18160ddd');
  assert.equal(hashes, 1);
  assert.notEqual(api.evmFunctionSelector('totalSupply(uint256)'), '18160ddd'); assert.equal(hashes, 2);
  const large = 'x'.repeat(24577);
  assert.equal(api.evmFunctionSelector(large), publicKeccak256(Buffer.from(large)).subarray(0, 4).toString('hex'));
  assert.equal(hashes, 3); api.evmFunctionSelector(large); assert.equal(hashes, 4, 'oversize selector remains uncached');
  assert.equal(api.EVM_CODE_HASH_RETAINED_BYTES, EVM_CODE_HASH_RETAINED_BYTES);
});
