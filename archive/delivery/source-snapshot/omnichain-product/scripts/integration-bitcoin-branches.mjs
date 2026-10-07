import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';

const BITCOIND_HASH = 'f79eeb94e1379986df9f7be4c78c8fc8e18dc9be64a31cbaa8acad249d3db77a';
const CLI_HASH = 'f6ff1c850fd812c88afd817daac488dfac48b1a12eb99090ce541a663787698b';
const NONFINAL_SEQUENCE = 0xfffffffe; // Enables absolute nLockTime; BIP68 relative lock is disabled.

// All RPC parameters are sent via stdin. In particular, synthetic private
// descriptors never appear in process arguments, harness output, or saved evidence.
function privateCli(binary, args, params, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: cwd, TMP: cwd },
    });
    let stdout = ''; let stderr = ''; let count = 0; let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('OWN_CLI_TIMEOUT')); }, 15000);
    child.on('error', () => finish(new Error('OWN_CLI_SPAWN_FAILED')));
    child.stdin.on('error', () => finish(new Error('OWN_CLI_INPUT_FAILED')));
    child.stdout.on('data', chunk => {
      count += chunk.length;
      if (count > 1048576) { child.kill(); finish(new Error('OWN_CLI_OUTPUT_LIMIT')); }
      else stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => { if (stderr.length < 8192) stderr += chunk.toString(); });
    child.on('close', code => {
      if (code !== 0) {
        const error = new Error('OWN_CLI_RPC_FAILED');
        error.rpcCode = /error code:\s*(-?\d+)/.exec(stderr)?.[1] ?? null;
        error.rpcMethod = args.at(-1);
        return finish(error);
      }
      const body = stdout.trim();
      if (body === '') return finish(null, null); // bitcoin-cli renders a JSON null result as empty output.
      try { finish(null, JSON.parse(body)); } catch { finish(null, body); }
    });
    child.stdin.end(params.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('\n') + (params.length ? '\n' : ''));
  });
}

function keyExpression(descriptor) {
  const match = /^wpkh\((.+)\)#[a-z0-9]{8}$/.exec(descriptor);
  if (!match) throw new Error('SYNTHETIC_KEY_DESCRIPTOR_UNEXPECTED');
  return match[1].replace(/\/\*$/, '/0');
}

export async function runBitcoinBranchIntegration() {
  const binary = await pinnedBinary('bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoind.exe', BITCOIND_HASH);
  const cli = await pinnedBinary('bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoin-cli.exe', CLI_HASH);
  const cwd = await scratchDirectory('bitcoin-branches-');
  const walletDir = join(cwd, 'wallets');
  await mkdir(walletDir);
  const config = join(cwd, 'bitcoin.conf');
  const port = await unusedLoopbackPort();
  const password = randomBytes(32).toString('hex');
  await writeFile(config, `regtest=1\nserver=1\nlisten=0\nlistenonion=0\ndiscover=0\ndnsseed=0\nfixedseeds=0\nnetworkactive=0\nnatpmp=0\n[regtest]\nconnect=0\nrpcport=${port}\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcuser=synthetic-branch-harness\nrpcpassword=${password}\n`, { mode: 0o600 });
  const commonArgs = [`-datadir=${cwd}`, `-conf=${config}`, '-regtest'];
  const handle = startOwnProcess(binary, [...commonArgs, `-walletdir=${walletDir}`, '-nosettings', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole=0'], cwd);
  let stage = 'startup'; let stopped = false;
  // RPC command and stdin arguments have distinct positions. Keeping the method
  // in argv (non-secret) also lets bitcoin-cli convert its typed parameters.
  const call = async (method, params = [], wallet) => {
    const args = [...commonArgs, '-rpcconnect=127.0.0.1', `-rpcport=${port}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), '-stdin', method];
    return privateCli(cli, args, params, cwd);
  };
  try {
    let info;
    for (let i = 0; i < 100; i++) {
      handle.assertAlive();
      try { info = await call('getblockchaininfo'); break; } catch { await sleep(100); }
    }
    assert.equal(info?.chain, 'regtest');
    const network = await call('getnetworkinfo');
    assert.equal(network.networkactive, false);
    assert.equal(network.connections, 0);
    stage = 'synthetic-wallets';
    for (const name of ['solver-source', 'receiver-source']) await call('createwallet', [name]);
    for (const name of ['solver-branch', 'receiver-branch']) await call('createwallet', [name, false, true]);
    const miningAddress = await call('getnewaddress', ['', 'bech32'], 'solver-source');
    const receiverDestination = await call('getnewaddress', ['', 'bech32'], 'receiver-source');
    const refundDestination = await call('getnewaddress', ['', 'bech32'], 'solver-source');
    await call('generatetoaddress', [101, miningAddress]);
    const lockHeight = 120;
    const privateKey = async wallet => {
      // Only wallets generated moments ago inside our fresh data directory.
      const data = await call('listdescriptors', [true], wallet);
      const entry = data.descriptors.find(d => !d.internal && d.desc.startsWith('wpkh('));
      if (!entry) throw new Error('SYNTHETIC_KEY_SOURCE_MISSING');
      return keyExpression(entry.desc);
    };
    const receiverPrivate = await privateKey('receiver-source');
    const solverPrivate = await privateKey('solver-source');
    const receiverPublic = (await call('getaddressinfo', [receiverDestination], 'receiver-source')).pubkey;
    const solverPublic = (await call('getaddressinfo', [miningAddress], 'solver-source')).pubkey;
    assert.match(receiverPublic, /^(02|03)[0-9a-f]{64}$/);
    assert.match(solverPublic, /^(02|03)[0-9a-f]{64}$/);
    const policy = (receiver, solver) => `wsh(or_i(pk(${receiver}),and_v(v:pk(${solver}),after(${lockHeight}))))`;
    const publicDescriptor = (await call('getdescriptorinfo', [policy(receiverPublic, solverPublic)])).descriptor;
    const [branchAddress] = await call('deriveaddresses', [publicDescriptor]);
    stage = 'import-miniscript';
    for (const [wallet, descriptor] of [
      ['receiver-branch', policy(receiverPrivate, solverPublic)],
      ['solver-branch', policy(receiverPublic, solverPrivate)],
    ]) {
      const parsed = await call('getdescriptorinfo', [descriptor]);
      const [roleAddress] = await call('deriveaddresses', [`${descriptor}#${parsed.checksum}`]);
      assert.equal(roleAddress, branchAddress, 'both roles must compile to the same output script');
      const result = await call('importdescriptors', [[{ desc: `${descriptor}#${parsed.checksum}`, timestamp: 'now', active: false }]], wallet);
      assert.ok(result[0]?.success, 'synthetic branch descriptor import');
    }
    const addressInfo = await call('getaddressinfo', [branchAddress], 'receiver-branch');
    stage = 'fund-two-conditional-outputs';
    const fund = async () => {
      const txid = await call('sendtoaddress', [branchAddress, 1], 'solver-source');
      const decoded = await call('getrawtransaction', [txid, true]);
      const output = decoded.vout.find(o => o.scriptPubKey.address === branchAddress);
      assert.ok(output && output.value === 1);
      return { txid, vout: output.n, amountSatoshi: '100000000' };
    };
    const releasedFunding = await fund();
    const refundedFunding = await fund();
    await call('generatetoaddress', [1, miningAddress]);
    const fundedHeight = await call('getblockcount');
    assert.ok(fundedHeight < lockHeight);
    const sign = async (input, wallet, destination, locktime, sequence = NONFINAL_SEQUENCE) => {
      const psbt = await call('createpsbt', [[{ txid: input.txid, vout: input.vout, sequence }], [{ [destination]: 0.99998 }], locktime]);
      const signed = await call('walletprocesspsbt', [psbt, true, 'ALL', true, false], wallet);
      const finalized = await call('finalizepsbt', [signed.psbt]);
      return finalized;
    };
    stage = 'sign-branches';
    const releaseA = await sign(releasedFunding, 'receiver-branch', receiverDestination, 0);
    const refundA = await sign(releasedFunding, 'solver-branch', refundDestination, lockHeight);
    const releaseB = await sign(refundedFunding, 'receiver-branch', receiverDestination, 0);
    const refundB = await sign(refundedFunding, 'solver-branch', refundDestination, lockHeight);
    for (const tx of [releaseA, refundA, releaseB, refundB]) assert.ok(tx.complete, 'Core must finalize the intended signed branch');
    const decodedReleaseA = await call('decoderawtransaction', [releaseA.hex]);
    const decodedRefundB = await call('decoderawtransaction', [refundB.hex]);
    assert.equal(decodedReleaseA.vin[0].txinwitness.at(-2), '01');
    assert.equal(decodedRefundB.vin[0].txinwitness.at(-2), '');
    assert.equal(decodedRefundB.locktime, lockHeight);
    assert.equal(decodedRefundB.vin[0].sequence, NONFINAL_SEQUENCE);
    const noTimelock = await sign(refundedFunding, 'solver-branch', refundDestination, 0);
    assert.equal(noTimelock.complete, false, 'solver key alone cannot satisfy the receiver branch or missing CLTV locktime');
    const test = async hex => (await call('testmempoolaccept', [[hex]]))[0];
    stage = 'reject-early-refund';
    const earlyRefund = await test(refundB.hex);
    assert.equal(earlyRefund.allowed, false);
    assert.equal(earlyRefund['reject-reason'], 'non-final');
    let earlyBroadcastRejected = false;
    try { await call('sendrawtransaction', [refundB.hex]); }
    catch (error) { assert.equal(error.rpcCode, '-26'); earlyBroadcastRejected = true; }
    assert.ok(earlyBroadcastRejected);
    stage = 'receiver-release-before-expiry';
    assert.equal((await test(releaseA.hex)).allowed, true, 'receiver release must be valid before expiry');
    const releaseTxid = await call('sendrawtransaction', [releaseA.hex]);
    await call('generatetoaddress', [1, miningAddress]);
    assert.equal(await call('gettxout', [releasedFunding.txid, releasedFunding.vout]), null, 'receiver release consumes conditional outpoint');
    const receiverOutput = (await call('getrawtransaction', [releaseTxid, true])).vout.find(v => v.scriptPubKey.address === receiverDestination);
    assert.ok(receiverOutput && receiverOutput.value === 0.99998);
    stage = 'both-branches-valid-after-expiry';
    const heightBeforeAdvance = await call('getblockcount');
    await call('generatetoaddress', [lockHeight - heightBeforeAdvance, miningAddress]);
    assert.equal(await call('getblockcount'), lockHeight);
    const lateRelease = await test(releaseB.hex);
    const matureRefund = await test(refundB.hex);
    assert.equal(lateRelease.allowed, true);
    assert.equal(matureRefund.allowed, true);
    const spentRefund = await test(refundA.hex);
    assert.equal(spentRefund.allowed, false);
    assert.match(spentRefund['reject-reason'], /missing|spent/);
    stage = 'solver-refund-wins-one-outpoint';
    const refundTxid = await call('sendrawtransaction', [refundB.hex]);
    await call('generatetoaddress', [1, miningAddress]);
    assert.equal(await call('gettxout', [refundedFunding.txid, refundedFunding.vout]), null);
    const losingRelease = await test(releaseB.hex);
    assert.equal(losingRelease.allowed, false);
    assert.match(losingRelease['reject-reason'], /missing|spent/);
    const refundReceipt = await call('getrawtransaction', [refundTxid, true]);
    const releaseReceipt = await call('getrawtransaction', [releaseTxid, true]);
    assert.ok(refundReceipt.vout.some(o => o.scriptPubKey.address === refundDestination && o.value === 0.99998));
    assert.equal(await call('getreceivedbyaddress', [receiverDestination, 1], 'receiver-source'), 0.99998);
    const evidence = {
      schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'VERIFIED_LOCAL_SCRIPT_BRANCHES', candidateOnly: true,
      runtime: { name: 'Bitcoin Core', version: '31.1.0', binarySHA256: BITCOIND_HASH, cliSHA256: CLI_HASH },
      network: { chain: 'regtest', genesisHash: await call('getblockhash', [0]), finalHeight: await call('getblockcount'), networkactive: false, connections: 0 },
      policy: { publicDescriptor, address: branchAddress, witnessScript: addressInfo.hex, refundLockHeight: lockHeight, fundingIsFulfillment: false, receiverBranchExpires: false },
      amounts: { eachFundingSatoshi: '100000000', eachSpendOutputSatoshi: '99998000', eachSpendFeeSatoshi: '2000', receiverActuallyReceivedSatoshi: '99998000' },
      tests: { earlyRefund, earlyBroadcastRejected, solverWithoutRequiredLocktimeCannotFinalize: !noTimelock.complete, lateReceiverRelease: lateRelease, matureSolverRefund: matureRefund, refundAfterReceiverSpend: spentRefund, receiverReleaseAfterRefund: losingRelease },
      receiverReleased: { funding: releasedFunding, fundingHeight: fundedHeight, spend: releaseReceipt, serializedSpend: releaseA.hex },
      solverRefunded: { funding: refundedFunding, fundingHeight: fundedHeight, spend: refundReceipt, serializedSpend: refundB.hex },
      isolation: { ownProcessId: handle.child.pid, freshSyntheticWallets: true, privateDescriptorsStdinOnly: true, privateKeysNeverSavedInEvidence: true, ownProcessStoppedBeforeEvidence: false, scratchRemovedInFinally: true },
      limits: ['Candidate local script semantics only; no adopted PAEG settlement design.', 'A conditional funding output is not a delivered receiver coin; only receiver release to its selected destination was counted as delivery.', 'Both branches remain valid after CLTV maturity while the output is unspent; miners order conflicting spends.', 'No EVM/Solana synchronization, global fulfillment proof, refund instantaneity, metadata privacy, or distributed atomicity established.'],
    };
    stage = 'shutdown';
    await call('stop');
    for (let i = 0; i < 50 && handle.child.exitCode === null; i++) await sleep(100);
    if (handle.child.exitCode === null) await stopOwnProcess(handle);
    stopped = true;
    evidence.isolation.ownProcessStoppedBeforeEvidence = true;
    return evidence;
  } catch (error) {
    const clean = new Error('BITCOIN_BRANCH_INTEGRATION_FAILED');
    clean.stage = stage;
    clean.rpcCode = error.rpcCode ?? null;
    clean.rpcMethod = error.rpcMethod ?? null;
    clean.assertion = error.code === 'ERR_ASSERTION' ? String(error.message).split('\n')[0].slice(0, 160) : null;
    throw clean;
  } finally {
    if (!stopped) await stopOwnProcess(handle);
    await removeOwnScratch(cwd);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await runBitcoinBranchIntegration();
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence', 'm2-bitcoin-script-branches.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ status: evidence.status, release: evidence.receiverReleased.spend.txid, refund: evidence.solverRefunded.spend.txid, evidence: 'evidence/m2-bitcoin-script-branches.json' }));
  } catch (error) {
    const evidence = { schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'FAILED_NOT_VERIFIED', stage: error.stage ?? 'prerequisites', rpcCode: error.rpcCode ?? null, rpcMethod: error.rpcMethod ?? null, assertion: error.assertion ?? null };
    await mkdir(join(projectRoot, 'evidence'), { recursive: true });
    await writeFile(join(projectRoot, 'evidence', 'm2-bitcoin-branches-failure.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.error(JSON.stringify(evidence)); process.exitCode = 1;
  }
}
