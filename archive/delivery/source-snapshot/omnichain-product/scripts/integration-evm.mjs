import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalReadOnlyRpc, inspectEthereumLocal } from '../src/chains/local-rpc.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';

const ANVIL_HASH = '619d6f0ee33d6943a0698ab787296553f6c9614a8231a586f7d0babecc3388ab';
export async function runEvmIntegration() {
  const binary = await pinnedBinary('foundry-v1.8.4-portable/anvil.exe', ANVIL_HASH);
  const cwd = await scratchDirectory('anvil-');
  const port = await unusedLoopbackPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const processHandle = startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--accounts', '2', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
  const rpc = (method, params) => ownedRuntimeRpc(endpoint, method, params);
  const waitReceipt = async hash => {
    for (let i = 0; i < 50; i++) {
      const receipt = await rpc('eth_getTransactionReceipt', [hash]);
      if (receipt) return receipt;
      await sleep(20);
    }
    throw new Error('LOCAL_RECEIPT_TIMEOUT');
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      processHandle.assertAlive();
      try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch { /* startup only */ }
      await sleep(100);
    }
    assert.ok(ready, 'isolated Anvil startup');
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    const identity = await inspectEthereumLocal(new LocalReadOnlyRpc(endpoint, { family: 'ethereum' }), { expectedGenesisHash: genesis.hash });
    const [sender, recipient] = await rpc('eth_accounts');
    const before = BigInt(await rpc('eth_getBalance', [recipient, 'latest']));
    const value = 1234567n;
    const request = { from: sender, to: recipient, value: '0x' + value.toString(16), nonce: '0x0', gas: '0x5208' };
    const txHash = await rpc('eth_sendTransaction', [request]);
    const receipt = await waitReceipt(txHash);
    assert.equal(receipt.status, '0x1');
    assert.equal(receipt.from, sender);
    assert.equal(receipt.to, recipient);
    const after = BigInt(await rpc('eth_getBalance', [recipient, 'latest']));
    assert.equal(after - before, value);
    await assert.rejects(() => rpc('eth_sendTransaction', [request]), { message: 'OWNED_RPC_REMOTE_ERROR' });
    // Pending transaction gives an actual local no-receipt/timeout condition.
    await rpc('evm_setAutomine', [false]);
    const delayedHash = await rpc('eth_sendTransaction', [{ ...request, nonce: '0x1', value: '0x1' }]);
    assert.equal(await rpc('eth_getTransactionReceipt', [delayedHash]), null);
    const pendingBalance = BigInt(await rpc('eth_getBalance', [recipient, 'latest']));
    assert.equal(pendingBalance, after);
    await rpc('evm_mine', []);
    const delayedReceipt = await waitReceipt(delayedHash);
    assert.equal(delayedReceipt.status, '0x1');
    assert.equal(BigInt(await rpc('eth_getBalance', [recipient, 'latest'])), after + 1n);
    return {
      schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'VERIFIED_LOCAL_RUNTIME',
      runtime: { name: 'Anvil', version: '1.8.4', binarySHA256: ANVIL_HASH, archiveSHA256: '7927f41b36fbe815f858ebb3e9fb7ca07a9b53fed67ccca6471acd7efd203aa1' },
      network: identity, transaction: { amountWei: value.toString(), recipientBalanceBefore: before.toString(), recipientBalanceAfter: after.toString(), receipt },
      adversarial: { sameNonceReplayRejected: true, automineDisabledReceiptAbsent: true, lateReceiptAfterExplicitMine: delayedReceipt, priorTransferNotRolledBack: true },
      isolation: { processId: processHandle.child.pid, freshRandomSyntheticAccounts: true, p2p: false, forkUrl: false, bindAddress: '127.0.0.1', ownProcessStoppedInFinally: true, scratchRemovedInFinally: true },
      limits: ['Local EVM execution, not Ethereum consensus or public-network integration.', 'No contract escrow, ZK verifier, DeFi composition or cross-chain settlement.', 'Genesis is pinned from our own isolated process; a generic untrusted RPC is not independently authenticated.'],
    };
  } finally { await stopOwnProcess(processHandle); await removeOwnScratch(cwd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runEvmIntegration();
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence', 'chains-evm-local.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ status: evidence.status, txHash: evidence.transaction.receipt.transactionHash, evidence: 'evidence/chains-evm-local.json' }));
  } catch (error) { console.error('EVM local integration failed:', error.message); process.exitCode = 1; }
}
