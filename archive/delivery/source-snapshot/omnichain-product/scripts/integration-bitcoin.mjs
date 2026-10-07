import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';

const exec = promisify(execFile);
const BITCOIND_HASH = 'f79eeb94e1379986df9f7be4c78c8fc8e18dc9be64a31cbaa8acad249d3db77a';
const CLI_HASH = 'f6ff1c850fd812c88afd817daac488dfac48b1a12eb99090ce541a663787698b';
export async function runBitcoinIntegration() {
  const binary = await pinnedBinary('bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoind.exe', BITCOIND_HASH);
  const cli = await pinnedBinary('bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoin-cli.exe', CLI_HASH);
  const cwd = await scratchDirectory('bitcoin-regtest-');
  const wallets = join(cwd, 'wallets');
  await mkdir(wallets);
  const config = join(cwd, 'bitcoin.conf');
  const port = await unusedLoopbackPort();
  const password = randomBytes(32).toString('hex');
  await writeFile(config, `regtest=1\nserver=1\nlisten=0\nlistenonion=0\ndiscover=0\ndnsseed=0\nfixedseeds=0\nnetworkactive=0\nnatpmp=0\n[regtest]\nconnect=0\nrpcport=${port}\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcuser=synthetic-local-harness\nrpcpassword=${password}\n`, { mode: 0o600 });
  const commonArgs = [`-datadir=${cwd}`, `-conf=${config}`, '-regtest'];
  const handle = startOwnProcess(binary, [...commonArgs, `-walletdir=${wallets}`, '-nosettings', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole=0'], cwd);
  const rpc = async (method, params = [], wallet = undefined) => {
    try {
      const args = [...commonArgs, '-rpcconnect=127.0.0.1', `-rpcport=${port}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), method, ...params.map(p => typeof p === 'string' ? p : JSON.stringify(p))];
      const result = await exec(cli, args, { cwd, timeout: 10000, windowsHide: true, maxBuffer: 1048576, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: cwd, TMP: cwd } });
      const value = result.stdout.trim();
      try { return JSON.parse(value); } catch { return value; }
    } catch (error) {
      // Do not expose config contents, secrets or raw child-process errors.
      const clean = new Error('LOCAL_BITCOIN_RPC_FAILED:' + method);
      clean.rpcCode = /error code:\s*(-?\d+)/.exec(error.stderr ?? '')?.[1] ?? null;
      throw clean;
    }
  };
  let stopped = false;
  try {
    let info;
    for (let i = 0; i < 100; i++) {
      handle.assertAlive();
      try { info = await rpc('getblockchaininfo'); break; } catch { await sleep(100); }
    }
    assert.equal(info?.chain, 'regtest');
    const network = await rpc('getnetworkinfo');
    assert.equal(network.networkactive, false);
    assert.equal(network.connections, 0);
    await rpc('createwallet', ['synthetic-solver']);
    await rpc('createwallet', ['synthetic-recipient']);
    const miningAddress = await rpc('getnewaddress', [], 'synthetic-solver');
    const recipientAddress = await rpc('getnewaddress', [], 'synthetic-recipient');
    assert.ok(recipientAddress.startsWith('bcrt1'));
    await rpc('generatetoaddress', [101, miningAddress]);
    const before = await rpc('getbalance', [], 'synthetic-recipient');
    assert.equal(before, 0);
    const txid = await rpc('sendtoaddress', [recipientAddress, 1], 'synthetic-solver');
    const pending = await rpc('gettransaction', [txid], 'synthetic-solver');
    assert.equal(pending.confirmations, 0);
    await rpc('generatetoaddress', [6, miningAddress]);
    const receipt = await rpc('gettransaction', [txid], 'synthetic-solver');
    assert.ok(receipt.confirmations >= 6);
    const decoded = await rpc('getrawtransaction', [txid, true]);
    const payment = decoded.vout.find(output => output.scriptPubKey.address === recipientAddress);
    assert.ok(payment);
    assert.equal(payment.value, 1);
    const after = await rpc('getbalance', [], 'synthetic-recipient');
    assert.equal(after, 1);
    let duplicateOutcome;
    try { assert.equal(await rpc('sendrawtransaction', [receipt.hex]), txid); duplicateOutcome = 'idempotent-known-transaction'; }
    catch (error) { assert.equal(error.rpcCode, '-27'); duplicateOutcome = 'already-in-chain-rejected'; }
    assert.equal(await rpc('getbalance', [], 'synthetic-recipient'), after);
    const utxo = await rpc('gettxout', [txid, payment.n, true]);
    assert.equal(utxo.value, 1);
    assert.ok(utxo.confirmations >= 6);
    const finalInfo = await rpc('getblockchaininfo');
    assert.equal(finalInfo.chain, 'regtest');
    const evidence = {
      schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'VERIFIED_LOCAL_RUNTIME',
      runtime: { name: 'Bitcoin Core', version: '31.1.0', binarySHA256: BITCOIND_HASH, cliSHA256: CLI_HASH, archiveSHA256: 'c99ef173471c58e6766d9eebd12e6c35349082eeed3939bc99eed58ef57db587' },
      network: { chain: 'regtest', genesisHash: await rpc('getblockhash', [0]), blocks: finalInfo.blocks, bestBlockHash: finalInfo.bestblockhash, networkactive: false, connections: 0 },
      transaction: { txid, recipient: recipientAddress, amountSatoshi: '100000000', recipientBalanceBeforeSatoshi: '0', recipientBalanceAfterSatoshi: '100000000', blockhash: receipt.blockhash, confirmations: receipt.confirmations, rawTransaction: receipt.hex, decoded, utxo },
      adversarial: { beforeMiningConfirmations: pending.confirmations, duplicateBroadcastOutcome: duplicateOutcome, duplicateDidNotCreditAgain: true },
      isolation: { processId: handle.child.pid, bindAddress: '127.0.0.1', freshDataDir: true, freshSyntheticWallets: true, publicPeersDisabled: true, ownProcessStoppedBeforeEvidence: false, scratchRemovedInFinally: true },
      limits: ['Bitcoin Core regtest execution with locally generated blocks; not public Bitcoin confirmations.', 'A receipt is trusted local RPC evidence, not a ZK or cross-chain consensus proof.', 'No general PAEG verifier, chain escrow, solver settlement or triple integration implemented here.'],
    };
    await rpc('stop');
    for (let i = 0; i < 50 && handle.child.exitCode === null; i++) await sleep(100);
    if (handle.child.exitCode === null) await stopOwnProcess(handle);
    stopped = true;
    evidence.isolation.ownProcessStoppedBeforeEvidence = true;
    return evidence;
  } catch (error) {
    if (error.message === 'LOCAL_RUNTIME_EXITED') {
      error.message += ': ' + handle.diagnostic().replaceAll(password, '[REDACTED]').replaceAll(cwd, '[OWN_SCRATCH]').slice(0, 1500);
    }
    throw error;
  } finally {
    if (!stopped) await stopOwnProcess(handle);
    await removeOwnScratch(cwd);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runBitcoinIntegration();
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence', 'chains-bitcoin-regtest.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ status: evidence.status, txid: evidence.transaction.txid, confirmations: evidence.transaction.confirmations, evidence: 'evidence/chains-bitcoin-regtest.json' }));
  } catch (error) { console.error('Bitcoin local integration failed:', error.message, error.rpcCode ?? ''); process.exitCode = 1; }
}
