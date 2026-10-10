import { linuxRuntimePins } from './linux-runtime-pins.mjs';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isCompatibilityModule, sourcePath } from '@lianum/environment';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot, isolatedRuntimeEnvironment } from './runtime-harness.mjs';

const exec = promisify(execFile);
export const windowsRuntimePins = Object.freeze({
  anvil: ['foundry-v1.8.4-portable/anvil.exe', '619d6f0ee33d6943a0698ab787296553f6c9614a8231a586f7d0babecc3388ab'],
  bitcoin: ['bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoind.exe', 'f79eeb94e1379986df9f7be4c78c8fc8e18dc9be64a31cbaa8acad249d3db77a'],
  cli: ['bitcoin-31.1-portable/bitcoin-31.1/bin/bitcoin-cli.exe', 'f6ff1c850fd812c88afd817daac488dfac48b1a12eb99090ce541a663787698b'],
  solc: ['solc-windows-amd64-v0.8.37+commit.f401782d.exe', '967743b2d12155f59a0ddf9410afe25c7deaa73f4fe3d33c4dc0739f627d9ec9'],
});
export const NATIVE_PRIVATE_COHORT_PROFILE = 'PC24_TWO_OWNER_COHORT_V1';
export const runtimePins = process.platform === 'linux' ? linuxRuntimePins : windowsRuntimePins;
export const sha = data => createHash('sha256').update(data).digest('hex');
export const word = value => {
  const s = typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) ? value.slice(2) : BigInt(value).toString(16);
  assert.ok(/^[0-9a-f]{1,64}$/i.test(s)); return s.padStart(64, '0');
};
export const hex = value => '0x' + BigInt(value).toString(16);
export const ZERO = '0x' + '00'.repeat(32);
const envFor = isolatedRuntimeEnvironment;
async function compile(binary, cwd, sourceName = 'contracts/LocalBitcoinDeliveryEscrow.sol', contractName = 'LocalBitcoinDeliveryEscrow') {
  const source = isCompatibilityModule(import.meta.url)
    ? join(projectRoot, sourceName)
    : sourcePath(sourceName.replace(/^contracts\//, 'contracts/engine/'));
  const content = await readFile(source, 'utf8');
  const input = { language: 'Solidity', sources: { [sourceName]: { content } }, settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } } } };
  const result = await new Promise((done, reject) => {
    const child = spawn(binary, ['--standard-json'], { cwd, env: envFor(cwd), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let text = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('LOCAL_COMPILE_TIMEOUT')); }, 30000);
    child.on('error', reject); child.stdout.on('data', b => { text += b; if (text.length > 4 * 1024 * 1024) { child.kill(); reject(new Error('LOCAL_COMPILE_LIMIT')); } });
    child.stderr.resume(); child.on('close', code => { clearTimeout(timer); if (code) reject(new Error('LOCAL_COMPILE_FAILED')); else { try { done(JSON.parse(text)); } catch { reject(new Error('LOCAL_COMPILE_INVALID')); } } });
    child.stdin.end(JSON.stringify(input));
  });
  assert.equal((result.errors || []).filter(e => e.severity === 'error').length, 0);
  return { artifact: result.contracts[sourceName][contractName], sourceSHA256: sha(content), settings: input.settings };
}

// No caller-supplied executable, endpoint, credentials, data directory or wallet.
export async function createOwnedNativeRuntime(progress = async () => {}) {
  return createOwnedNativeRuntimeProfile(progress, false);
}
// Fixed synthetic cohort only. No caller-controlled account count, key, wallet,
// executable, endpoint or startup setting can enter this constructor.
export async function createOwnedNativeCohortRuntime(progress = async () => {}) {
  assert.ok(arguments.length <= 1 && typeof progress === 'function', 'NATIVE_COHORT_FIXED_CONSTRUCTOR');
  return createOwnedNativeRuntimeProfile(progress, true);
}
async function createOwnedNativeRuntimeProfile(progress, cohort) {
  const binaries = {};
  for (const [name, [path, hash]] of Object.entries(runtimePins)) binaries[name] = await pinnedBinary(path, hash);
  const cwd = await scratchDirectory('m9-native-'), handles = [];
  let btc;
  const close = async () => {
    if (btc && handles[1]?.child.exitCode === null) await btc('stop').catch(() => {});
    const results = await Promise.allSettled(handles.map(stopOwnProcess));
    const bad = results.find(r => r.status === 'rejected'); if (bad) throw bad.reason;
    await removeOwnScratch(cwd);
  };
  try {
    await progress('Compilando el contrato local'); const compilation = await compile(binaries.solc, cwd);
    const evmPort = await unusedLoopbackPort();
    const evmHandle = startOwnProcess(binaries.anvil, ['--host', '127.0.0.1', '--port', String(evmPort), '--chain-id', '31337', '--hardfork', 'cancun', '--timestamp', '1900000000', '--accounts', cohort ? '9' : '5', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
    handles.push(evmHandle); const evm = (method, params = []) => ownedRuntimeRpc(`http://127.0.0.1:${evmPort}`, method, params);
    let ready = false;
    for (let i = 0; i < 100; i++) { evmHandle.assertAlive(); try { ready = await evm('eth_chainId') === '0x7a69'; if (ready) break; } catch {} await sleep(100); }
    assert.ok(ready, 'Own local EVM startup');
    await progress('Iniciando Bitcoin regtest sin pares externos');
    const btcDir = join(cwd, 'bitcoin'), wallets = join(btcDir, 'wallets'); await mkdir(wallets, { recursive: true });
    const btcPort = await unusedLoopbackPort(), config = join(btcDir, 'bitcoin.conf');
    await writeFile(config, `regtest=1\nserver=1\nlisten=0\nlistenonion=0\ndiscover=0\ndnsseed=0\nfixedseeds=0\nnetworkactive=0\nnatpmp=0\n[regtest]\nconnect=0\nrpcport=${btcPort}\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcuser=synthetic-m9\nrpcpassword=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    const common = [`-datadir=${btcDir}`, `-conf=${config}`, '-regtest'];
    const btcHandle = startOwnProcess(binaries.bitcoin, [...common, `-walletdir=${wallets}`, '-nosettings', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole=0'], btcDir); handles.push(btcHandle);
    btc = async (method, params = [], wallet) => {
      try {
        const result = await exec(binaries.cli, [...common, '-rpcconnect=127.0.0.1', `-rpcport=${btcPort}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), method, ...params.map(v => typeof v === 'string' ? v : JSON.stringify(v))], { cwd: btcDir, env: envFor(btcDir), timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const s = result.stdout.trim(); if (s === '') return null; // bitcoin-cli prints JSON null as empty output.
        try { return JSON.parse(s); } catch { return s; }
      } catch (cause) { const error = new Error('LOCAL_BITCOIN_RPC_FAILED'); error.rpcCode = /error code:\s*(-?\d+)/.exec(cause.stderr || '')?.[1]; throw error; }
    };
    let info;
    for (let i = 0; i < 100; i++) { btcHandle.assertAlive(); try { info = await btc('getblockchaininfo'); break; } catch {} await sleep(100); }
    assert.equal(info?.chain, 'regtest'); const network = await btc('getnetworkinfo'); assert.equal(network.networkactive, false); assert.equal(network.connections, 0);
    await btc('createwallet', ['m9-solver']); await btc('createwallet', ['m9-recipient']);
    const miningAddress = await btc('getnewaddress', ['', 'bech32'], 'm9-solver');
    await progress('Minando fondos ficticios del solver'); await btc('generatetoaddress', [101, miningAddress]);
    const accounts = await evm('eth_accounts'), genesis = (await evm('eth_getBlockByNumber', ['0x0', false])).hash, bitcoinGenesis = await btc('getblockhash', [0]);
    const receipts = [];
    const send = async (label, request, expectedStatus = '0x1', expectedRevert) => {
      const hash = await evm('eth_sendTransaction', [{ gas: '0x7a1200', ...request }]);
      let receipt;
      for (let i = 0; i < 100; i++) { receipt = await evm('eth_getTransactionReceipt', [hash]); if (receipt) break; await sleep(30); }
      if (!receipt) throw new Error('LOCAL_RECEIPT_TIMEOUT');
      let revertReason;
      if (receipt.status === '0x0') {
        const trace = await evm('debug_traceTransaction', [hash, { disableMemory: true, disableStack: true, disableStorage: true }]);
        const raw = trace.returnValue.replace(/^0x/, ''); assert.ok(raw.startsWith('08c379a0'), 'Expected Solidity Error(string)');
        const n = Number(BigInt('0x' + raw.slice(72, 136))); revertReason = Buffer.from(raw.slice(136, 136 + 2 * n), 'hex').toString('utf8');
      }
      receipts.push({ label, request, receipt, ...(revertReason ? { revertReason } : {}) });
      assert.equal(receipt.status, expectedStatus, label); if (expectedRevert) assert.equal(revertReason, expectedRevert, label); return receipt;
    };
    const deployment = await send('deploy local Bitcoin delivery authority', { from: accounts[0], data: '0x' + compilation.artifact.evm.bytecode.object + word(accounts[2]) + word('0x' + bitcoinGenesis) });
    const address = deployment.contractAddress;
    const data = (method, args = []) => { const selector = compilation.artifact.evm.methodIdentifiers[method]; assert.ok(selector, method); return '0x' + selector + args.map(word).join(''); };
    const call = async (method, args = []) => evm('eth_call', [{ to: address, data: data(method, args) }, 'latest']);
    const time = async () => Number(BigInt((await evm('eth_getBlockByNumber', ['latest', false])).timestamp));
    const balance = async a => BigInt(await evm('eth_getBalance', [a, 'latest']));
    const reservation = async id => {
      const raw = await call('reservations(bytes32)', [id]); const w = raw.slice(2).match(/.{64}/g); assert.equal(w.length, 11);
      return { owner: '0x' + w[0].slice(-40), solver: '0x' + w[1].slice(-40), amountWei: BigInt('0x' + w[2]).toString(), orderHash: '0x' + w[3], scriptHash: '0x' + w[4], sats: BigInt('0x' + w[5]).toString(), executeBy: Number(BigInt('0x' + w[6])), claimBy: Number(BigInt('0x' + w[7])), openedAt: Number(BigInt('0x' + w[8])), profile: Number(BigInt('0x' + w[9])), state: ['ABSENT', 'OPEN', 'PAID', 'REFUNDED'][Number(BigInt('0x' + w[10]))] };
    };
    return { evm, btc, accounts, address, data, call, send, time, balance, reservation, receipts, miningAddress, close,
      metadata: { classification: 'OWNED_LOCAL_RUNTIMES_ONLY', ...(cohort ? { cohortProfile: { name: NATIVE_PRIVATE_COHORT_PROFILE, accountCount: 9, commonTrustedHost: true, externalAnonymitySetClaim: false } } : {}), chainId: '31337', evmGenesis: genesis, bitcoinGenesis, bitcoinNetwork: 'regtest', bitcoinPeers: 0, bitcoinNetworkActive: false, processIds: handles.map(h => h.child.pid), contract: address, contractSourceSHA256: compilation.sourceSHA256, compilerSettings: compilation.settings, runtimePins, freshSyntheticWallets: true, nativeSigning: 'Owned Anvil/Core synthetic accounts; no browser/user key custody', privacy: 'Transparent trusted-observer baseline; no ZK settlement' } };
  } catch (error) { await close(); throw error; }
}

// Internal reviewed-source deployment only; never exposed as a user RPC.
export async function deployOwnedTripleAuthority(runtime, constructorArgs) {
  const binary = await pinnedBinary(...runtimePins.solc);
  const cwd = await scratchDirectory('m14-triple-compile-');
  try {
    const compilation = await compile(binary, cwd, 'contracts/LocalTripleDeliveryEscrow.sol', 'LocalTripleDeliveryEscrow');
    const receipt = await runtime.send('deploy local triple delivery authority', { from: runtime.accounts[0], data: '0x' + compilation.artifact.evm.bytecode.object + constructorArgs.map(word).join('') });
    const address = receipt.contractAddress;
    const data = (method, args = []) => { const selector = compilation.artifact.evm.methodIdentifiers[method]; assert.ok(selector, method); return '0x' + selector + args.map(word).join(''); };
    const call = (method, args = []) => runtime.evm('eth_call', [{ to: address, data: data(method, args) }, 'latest']);
    return { address, data, call, sourceSHA256: compilation.sourceSHA256, compilerSettings: compilation.settings };
  } finally { await removeOwnScratch(cwd); }
}
export async function deployOwnedNaiveTripleAuthority(runtime, amountWei) {
  const binary = await pinnedBinary(...runtimePins.solc), cwd = await scratchDirectory('m14-naive-compile-');
  try {
    const compilation = await compile(binary, cwd, 'contracts/test/NaiveTripleObserverEscrow.sol', 'NaiveTripleObserverEscrow');
    const receipt = await runtime.send('deploy funded naive triple negative control', { from: runtime.accounts[0], value: hex(amountWei), data: '0x' + compilation.artifact.evm.bytecode.object + word(runtime.accounts[2]) + word(runtime.accounts[1]) });
    const address = receipt.contractAddress;
    const data = (method, args = []) => { const selector = compilation.artifact.evm.methodIdentifiers[method]; assert.ok(selector); return '0x' + selector + args.map(word).join(''); };
    return { address, data, sourceSHA256: compilation.sourceSHA256 };
  } finally { await removeOwnScratch(cwd); }
}
