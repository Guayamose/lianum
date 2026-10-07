/** One isolated compatibility observation; NEVER broadcasts or mines. The
 * create-only marker refuses another run in this worktree. No private key,
 * RPC endpoint, account address or raw signed transaction is retained. */
import assert from 'node:assert/strict';
import { open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { linuxRuntimePins } from '../../../../../engine/src/chains/shared/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, unusedLoopbackPort, startOwnProcess,
  stopOwnProcess, removeOwnScratch, ownedRuntimeRpc, sleep } from '../../../../../engine/src/chains/shared/runtime-harness.mjs';
import { LOCAL_EVM_PROFILE, assertSignedEvmTransaction } from './owned-evm-v2-runtime.mjs';
const marker = fileURLToPath(new URL('../../../.local/evm-sign-only-probe.once', import.meta.url));
const output = fileURLToPath(new URL('../../../evidence/evm-sign-only-compatibility.json', import.meta.url));
const created = await open(marker, 'wx', 0o600); await created.writeFile(new Date().toISOString()); await created.sync(); await created.close();
const result = { schema: 'OWNED_EVM_SIGN_ONLY_COMPATIBILITY_V1', startedAt: new Date().toISOString(),
  runtimePin: linuxRuntimePins.anvil, profile: LOCAL_EVM_PROFILE, attemptedSignCalls: 0,
  broadcasts: 0, miningCalls: 0, passed: false, assurance: 'Backend compatibility only; no PAEG gate/proof/delivery claim' };
let handle, cwd;
try {
  const binary = await pinnedBinary(...linuxRuntimePins.anvil); cwd = await scratchDirectory('flat-evm-sign-only-probe-');
  const port = await unusedLoopbackPort();
  handle = startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
    '--hardfork', 'cancun', '--timestamp', String(LOCAL_EVM_PROFILE.genesisTimestamp), '--accounts', '5', '--balance', '10',
    '--mnemonic-random', '12', '--no-cors', '--no-mining', '--gas-limit', String(LOCAL_EVM_PROFILE.maxGas)], cwd);
  const rpc = (method, params = []) => ownedRuntimeRpc(`http://127.0.0.1:${port}`, method, params, {timeoutMs: 10_000});
  let ready = false;
  for (let i = 0; i < 100; i++) { handle.assertAlive(); try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch {} await sleep(100); }
  assert.ok(ready, 'PROBE_STARTUP'); const accounts = await rpc('eth_accounts'); assert.equal(accounts.length, 5);
  const before = await rpc('eth_getBlockByNumber', ['latest', false]); assert.equal(before.number, '0x0');
  for (const account of accounts) assert.equal(BigInt(await rpc('eth_getBalance', [account, 'latest'])), 10n ** 19n);
  const expected = { from: accounts[0].toLowerCase(), to: accounts[1].toLowerCase(), nonce: '0', chainId: '31337',
    gas: '21000', gasPrice: '1000000000', value: '0', data: '0x' };
  const request = { ...expected, nonce: '0x0', chainId: '0x7a69', gas: '0x5208', gasPrice: '0x3b9aca00', value: '0x0', type: '0x0' };
  result.attemptedSignCalls++; const response = await rpc('eth_signTransaction', [request]);
  assert.equal(typeof response, 'string', 'PROBE_SIGN_ONLY_HEX_RESULT');
  const signed = assertSignedEvmTransaction(response, expected);
  result.canonicalLegacyEip155 = true; result.recoveredSenderMatches = true;
  result.signedWireBytes = (response.length - 2) / 2; result.signedWireSHA256 = signed.transactionSHA256;
  result.transactionHash = signed.nativeId;
  const after = await rpc('eth_getBlockByNumber', ['latest', false]); assert.deepEqual(after, before);
  for (const tag of ['pending', 'latest']) assert.equal(await rpc('eth_getTransactionCount', [accounts[0], tag]), '0x0');
  assert.equal(await rpc('eth_getTransactionByHash', [signed.nativeId]), null);
  assert.equal(await rpc('eth_getTransactionReceipt', [signed.nativeId]), null);
  result.headUnchanged = true; result.noncesUnchanged = true; result.noTransactionOrReceipt = true; result.passed = true;
} catch (error) { result.error = { name: error.name, code: error.code ?? null, message: error.message, rpcCode: error.rpcCode ?? null }; }
finally {
  if (handle) { result.stop = await stopOwnProcess(handle); result.exitObserved = handle.child.exitCode !== null || handle.child.signalCode !== null; }
  if (cwd) { await removeOwnScratch(cwd); result.scratchRemoved = true; }
  result.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag:'wx',mode:0o600});
}
console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
