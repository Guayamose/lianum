/** Offline public compiler/ABI resources only. No node, private key or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {sourcePath} from '@lianum/environment';
import {compileSoliditySources} from '@lianum/proofs/tooling/solidity-compiler';
import {loadOriginalProtocolAbiToolsV1} from '../../../../src/operations/deployments/defi/official-protocol-resources-v1.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
test('current MetaMorpho compilation preserves the original ABI, bytecode and AST used by recovery', () => {
  const content = readFileSync(sourcePath('contracts/wallet/defi/BoundedMetaMorphoExit.sol'), 'utf8');
  const sha256 = '99ff7b9b398ee6d826b927d872734d9c13e0fc915ce349534b66738acd97e76a';
  assert.equal(sha(content), sha256);
  const result = compileSoliditySources({'BoundedMetaMorphoExit.sol': {content, sha256}}, {profile:'metamorpho-exit'});
  const artifact = result.contracts['BoundedMetaMorphoExit.sol'].BoundedMetaMorphoExit;
  // Independently captured with the original solc wrapper and exact original
  // settings before the migration, rather than computed from the new helper.
  assert.equal(sha(JSON.stringify(artifact)), '8b5c0fc1fd765715847d461a6abd91641701c2d16efcf8b0d7d7189597c6d6fc');
  assert.equal(sha(JSON.stringify(result.sourceASTs['BoundedMetaMorphoExit.sol'])), '42f2b162dd52b587d0182b44c585093a8443408bc282ca88fc0a09f790765460');
  assert.equal(result.compiler.version, '0.8.37+commit.f401782d.Emscripten.clang');
  assert.throws(() => compileSoliditySources({'Unrelated.sol':{content,sha256}}, {profile:'metamorpho-exit'}), /SOLIDITY_METAMORPHO_SOURCE/);
  assert.throws(() => compileSoliditySources({'BoundedMetaMorphoExit.sol':{content:content+'\n',sha256}}, {profile:'metamorpho-exit'}), /SOLIDITY_SOURCE_PIN/);
});

test('ethers is loaded only from its original manifest and preserves withdrawal ABI framing', () => {
  const {Interface, version} = loadOriginalProtocolAbiToolsV1();
  assert.equal(version, '6.15.0');
  const abi = new Interface(['function withdraw(uint256,address,address) returns (uint256)']);
  const first='0x'+'11'.repeat(20), second='0x'+'22'.repeat(20);
  assert.equal(abi.encodeFunctionData('withdraw',[3n,first,second]),
    '0xb460af94'+'3'.padStart(64,'0')+first.slice(2).padStart(64,'0')+second.slice(2).padStart(64,'0'));
  assert.throws(() => loadOriginalProtocolAbiToolsV1({root:'/tmp'}), /PROTOCOL_ABI_FIXED_RESOURCES/);
});
