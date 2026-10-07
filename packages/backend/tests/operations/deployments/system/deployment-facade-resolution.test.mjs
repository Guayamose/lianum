/** Exact source-extracted production facade checks. Synthetic artifacts/RPC;
 * real ABI codecs and pure selector hashing. No constructor, node or key. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { claimArtifactMethod } from '../../../../src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import { encodeClaimABI } from '../../../../src/claims/protocol/abi.mjs';
import { evmFunctionSelector } from '../../../../src/chains/evm/contracts/evm-code-hash.mjs';
import { exactRecord, fixedArray } from '../../../../src/execution/encoding/commitments.mjs';
import { nativeStaticArguments } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
function cut(source, begin, end) {
  const start = source.indexOf(begin), stop = source.indexOf(end, start);
  assert.ok(start >= 0 && stop > start); return source.slice(start, stop);
}
const compile = (body, env) => vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body + '\n})')(env);
const claimSource = source('./deploy-native-claims.mjs'), flatSource = source('./deploy-system.mjs');
const claimFactory = (resolve) => compile(cut(claimSource, 'function abiValues(', '\nasync function nativePreflight') + '; return facade;',
  { assert, fixedArray, exactRecord, encodeClaimABI, prefix: value => '0x' + value, claimArtifactMethod: resolve });
const flatFactory = (selector = evmFunctionSelector) => compile(cut(flatSource, 'const canonicalType =', '\n/** The exact object')
  + cut(flatSource, 'function viewFacade(', '\nasync function unchangedHead') + '; return viewFacade;',
  { assert, fixedArray, exactRecord, nativeStaticArguments, evmFunctionSelector: selector });
function artifact() {
  const methods = [['totalSupply', [], 'view'], ['balanceOf', [{ name: 'owner', type: 'address' }], 'view'],
    ['setValue', [{ name: 'value', type: 'uint256' }], 'nonpayable']];
  return { abi: methods.map(([name, inputs, stateMutability]) => ({ type: 'function', name, inputs, stateMutability })),
    evm: { methodIdentifiers: Object.fromEntries(methods.map(([name, inputs]) => {
      const signature = name + '(' + inputs.map(row => row.type).join(',') + ')';
      return [signature, evmFunctionSelector(signature)];
    })) } };
}

test('claim facade resolves exactly once per RPC and preserves fresh calls/argument/block bytes', async () => {
  let resolutions = 0; const calls = [], data = artifact(), record = { address: '0x' + '12'.repeat(20) };
  const facade = claimFactory((...args) => { resolutions++; return claimArtifactMethod(...args); })(
    { call: async (...args) => { calls.push(args); return 'fresh-' + calls.length; } }, record, data);
  for (const head of ['0x1', '0x2']) assert.equal(await facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)], head), 'fresh-' + calls.length);
  assert.equal(resolutions, 2); assert.equal(calls.length, 2);
  assert.deepEqual(calls, ['0x1', '0x2'].map(head => [{ to: record.address,
    data: '0x70a08231' + '34'.repeat(20).padStart(64, '0') }, head]));
  await assert.rejects(facade.call('setValue(uint256)', ['1']), /VIEW_ONLY/);
  await assert.rejects(facade.call('balanceOf(address)', []));
  await assert.rejects(facade.call('missing()'), /ABI_METHOD/);
  assert.equal(calls.length, 2);
  data.evm.methodIdentifiers['balanceOf(address)'] = '00000000';
  await assert.rejects(facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)]), /COMPILER_SELECTOR/);
  data.evm.methodIdentifiers['balanceOf(address)'] = '70a08231'; data.abi.push(structuredClone(data.abi[1]));
  await assert.rejects(facade.call('balanceOf(address)', ['0x' + '34'.repeat(20)]), /ABI_METHOD/);
  assert.equal(calls.length, 2);
});

test('flat facade retains exact call bytes and reauthenticates mutable ABI/selector input on every call', async () => {
  let resolutions = 0; const calls = [], data = artifact(), record = { address: '0x' + '12'.repeat(20) };
  const facade = flatFactory(signature => { resolutions++; return evmFunctionSelector(signature); })({ call: async (...args) => { calls.push(args); return calls.length; } }, record, data);
  for (const head of ['0x1', '0x2']) assert.equal(await facade.call('totalSupply()', [], head), calls.length);
  assert.deepEqual(calls, ['0x1', '0x2'].map(head => [{ to: record.address, data: '0x18160ddd' }, head]));
  assert.equal(resolutions, 2);
  await assert.rejects(facade.call('setValue(uint256)', ['1']), /READ_ONLY_METHOD/);
  await assert.rejects(facade.call('totalSupply()', ['1']));
  data.evm.methodIdentifiers['totalSupply()'] = '00000000';
  await assert.rejects(facade.call('totalSupply()'), /METHOD_SELECTOR/);
  data.evm.methodIdentifiers['totalSupply()'] = '18160ddd'; data.abi[0].stateMutability = 'nonpayable';
  await assert.rejects(facade.call('totalSupply()'), /READ_ONLY_METHOD/);
  assert.equal(calls.length, 2);
});


test('canonical tuple calls retain genuine nominal Solidity library selectors and reject changed compiler maps', () => {
  const input = { name: 'value', type: 'tuple', internalType: 'struct Lib.Item', components: [{ name: 'amount', type: 'uint256' }] };
  const nominal = 'inspect(Lib.Item)', canonical = 'inspect((uint256))';
  const data = { abi: [{ type: 'function', name: 'inspect', inputs: [input], stateMutability: 'view' }],
    evm: { methodIdentifiers: { [nominal]: evmFunctionSelector(nominal) } } };
  assert.equal(claimArtifactMethod(data, canonical).selector, evmFunctionSelector(nominal));
  assert.equal(claimArtifactMethod(data, nominal).selector, evmFunctionSelector(nominal));
  data.evm.methodIdentifiers[nominal] = evmFunctionSelector(canonical);
  assert.throws(() => claimArtifactMethod(data, canonical), /COMPILER_SELECTOR/);
});
