// Owned disposable Anvil only. Never connect to caller-provided RPC endpoints.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shaHex } from '../experiments/private-core-proof/encoding.mjs';
import { linuxRuntimePins } from '../src/chains/linux-runtime-pins.mjs';
import { pinnedBinary, unusedLoopbackPort, startOwnProcess, stopOwnProcess, isolatedRuntimeEnvironment, sleep } from '../src/chains/runtime-harness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const experiment = join(root, 'experiments/private-core-proof');
const evidence = join(root, 'evidence/m15-auth-proof');
const word = value => { const n = BigInt(value); assert.ok(n >= 0n && n < 2n ** 256n); return n.toString(16).padStart(64, '0'); };
export function verifierCalldata(selector, proof, publicInputs) {
  assert.match(selector, /^[0-9a-f]{8}$/);
  const data = Buffer.from(proof); const padded = Math.ceil(data.length / 32) * 32;
  const bytesTail = word(data.length) + data.toString('hex').padEnd(padded * 2, '0');
  return '0x' + selector + word(64) + word(64 + 32 + padded) + bytesTail + word(publicInputs.length) + publicInputs.map(word).join('');
}
async function compile(binary, cwd, sources) {
  const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 1 }, viaIR: false, evmVersion: 'cancun', metadata: { bytecodeHash: 'none' }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object', 'evm.deployedBytecode.linkReferences', 'evm.methodIdentifiers'] } } } };
  const start = performance.now(); let peakSampledRSSKiB = 0;
  const output = await new Promise((resolve, reject) => {
    const p = spawn(binary, ['--standard-json'], { cwd, env: isolatedRuntimeEnvironment(cwd), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const interval = setInterval(async () => {
      try { const s = await readFile(`/proc/${p.pid}/status`, 'utf8'); const rss = /VmHWM:\s+(\d+) kB/.exec(s); if (rss) peakSampledRSSKiB = Math.max(peakSampledRSSKiB, Number(rss[1])); } catch {}
    }, 100);
    const timer = setTimeout(() => { p.kill('SIGTERM'); reject(new Error('OWN_SOLC_TIMEOUT')); }, 180000);
    p.on('error', reject);
    p.stdout.on('data', b => { stdout += b; if (stdout.length > 16 * 1024 * 1024) { p.kill('SIGTERM'); reject(new Error('OWN_SOLC_OUTPUT_LIMIT')); } });
    p.stderr.on('data', b => { if (stderr.length < 4096) stderr += b; });
    p.on('close', code => { clearInterval(interval); clearTimeout(timer); if (code !== 0) reject(new Error(`OWN_SOLC_EXIT_${code}: ${stderr}`)); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } } });
    p.stdin.end(JSON.stringify(input));
  });
  const errors = (output.errors ?? []).filter(e => e.severity === 'error');
  if (errors.length) { const e = new Error('SOLIDITY_COMPILER_ERRORS: ' + errors.map(e => e.formattedMessage ?? e.message).join('\n')); e.compilerErrors = errors; throw e; }
  return { output, settings: input.settings, milliseconds: performance.now() - start, peakSampledRSSKiB };
}
async function main() {
  assert.equal(process.platform, 'linux');
  const results = JSON.parse(await readFile(join(evidence, 'results.json')));
  assert.equal(results.hostVerification.find(r => r.name === 'positive').returned, true);
  const binaries = { anvil: await pinnedBinary(...linuxRuntimePins.anvil), solc: await pinnedBinary(...linuxRuntimePins.solc) };
  const sources = {};
  for (const sourceName of ['Verifier.sol', 'WrongVerifier.sol']) {
    const content = await readFile(join(evidence, sourceName), 'utf8');
    assert.equal(shaHex(content), results.artifacts[sourceName].sha256); sources[sourceName] = { content };
  }
  const local = join(experiment, '.local'); await mkdir(local, { recursive: true });
  const cwd = await mkdtemp(join(local, 'anvil-auth-'));
  const record = { classification: 'LOCAL_ZK_SIGNATURE_VERIFIER_ATTEMPT_UNFUNDED', startedAt: new Date().toISOString(), runtimePins: { anvil: linuxRuntimePins.anvil, solc: linuxRuntimePins.solc }, sources: Object.fromEntries(Object.entries(sources).map(([n, { content }]) => [n, { bytes: Buffer.byteLength(content), sha256: shaHex(content) }])), deployments: [], cases: [], transportFailures: [], limits: ['Synthetic unfunded signature relation', 'No native SOL/BTC fulfillment', 'No funded owner or settlement', 'Stateless verifier does not prevent same-scope proof replay', 'No private-wallet or metadata-unlinkability claim'] };
  const checkpoint = () => writeFile(join(root, 'evidence/m15-auth-anvil.json'), JSON.stringify(record, null, 2) + '\n');
  let handle;
  try {
    const compiled = await compile(binaries.solc, cwd, sources);
    record.compiler = { settings: compiled.settings, milliseconds: compiled.milliseconds, peakSampledRSSKiB: compiled.peakSampledRSSKiB, memoryMetric: '100ms /proc VmHWM samples; lower bound if final process peak falls between samples', warnings: (compiled.output.errors ?? []).map(e => ({ severity: e.severity, message: e.message })) };
    await writeFile(join(evidence, 'solidity-artifacts.json'), JSON.stringify(compiled.output.contracts));
    const port = await unusedLoopbackPort(); const endpoint = `http://127.0.0.1:${port}`;
    handle = startOwnProcess(binaries.anvil, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'cancun', '--timestamp', '1900000000', '--accounts', '2', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
    record.ownedProcessId = handle.child.pid; record.loopbackPort = port;
    const rpc = async (method, params = []) => {
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      assert.equal(response.status, 200, 'RPC transport status'); const result = await response.json();
      if (result.error) { const e = new Error(result.error.message); e.rpc = result.error; throw e; }
      return result.result;
    };
    let ready = false;
    for (let i = 0; i < 100; i++) { handle.assertAlive(); try { if (await rpc('eth_chainId') === '0x7a69') { ready = true; break; } } catch {} await sleep(100); }
    assert.ok(ready, 'Own Anvil started');
    const accounts = await rpc('eth_accounts'); record.genesisHash = (await rpc('eth_getBlockByNumber', ['0x0', false])).hash;
    const send = async transaction => {
      const hash = await rpc('eth_sendTransaction', [{ from: accounts[0], gas: '0x1c9c380', ...transaction }]);
      for (let i = 0; i < 100; i++) { const receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) return receipt; await sleep(50); }
      throw new Error('OWN_ANVIL_RECEIPT_TIMEOUT');
    };
    const deployed = {}, libraryAddresses = new Map();
    const deployArtifact = async (name, contractName) => {
      const key = name + ':' + contractName;
      if (libraryAddresses.has(key)) return libraryAddresses.get(key);
      const artifact = compiled.output.contracts[name][contractName];
      assert.ok(artifact, 'Exact generated Solidity artifact');
      let bytecode = artifact.evm.bytecode.object;
      const links = [];
      for (const [librarySource, libraries] of Object.entries(artifact.evm.bytecode.linkReferences ?? {})) {
        for (const [libraryName, refs] of Object.entries(libraries)) {
          const linked = await deployArtifact(librarySource, libraryName);
          for (const ref of refs) {
            assert.equal(ref.length, 20);
            bytecode = bytecode.slice(0, ref.start * 2) + linked.address.slice(2) + bytecode.slice((ref.start + ref.length) * 2);
          }
          links.push({ librarySource, libraryName, address: linked.address, references: refs });
        }
      }
      assert.match(bytecode, /^[0-9a-f]+$/i, 'All compiler-reported library references must be linked before RPC');
      const receipt = await send({ data: '0x' + bytecode });
      assert.equal(receipt.status, '0x1', 'Verifier deployment');
      const deployedCode = await rpc('eth_getCode', [receipt.contractAddress, 'latest']);
      const d = { source: name, contractName, role: contractName === 'HonkVerifier' ? 'verifier' : 'generated-linked-library', address: receipt.contractAddress, linkedLibraries: links, creationBytes: bytecode.length / 2, linkedCreationBytecodeSHA256: shaHex(Buffer.from(bytecode, 'hex')), deployedCodeBytes: (deployedCode.length - 2) / 2, deployedCodeSHA256: shaHex(Buffer.from(deployedCode.slice(2), 'hex')), deploymentGas: Number(BigInt(receipt.gasUsed)), receipt };
      assert.ok(d.deployedCodeBytes <= 24576, 'Normal EIP-170 size limit; no unlimited-code-size flag');
      record.deployments.push(d); libraryAddresses.set(key, d); await checkpoint(); return d;
    };
    for (const name of ['Verifier.sol', 'WrongVerifier.sol']) {
      const artifact = compiled.output.contracts[name].HonkVerifier;
      assert.equal(artifact.abi.find(a => a.type === 'function' && a.name === 'verify').stateMutability, 'view');
      const d = await deployArtifact(name, 'HonkVerifier');
      deployed[name] = { address: d.address, selector: artifact.evm.methodIdentifiers['verify(bytes,bytes32[])'] };
    }
    const proof = await readFile(join(evidence, 'proof.bin')), publicInputs = JSON.parse(await readFile(join(evidence, 'public-inputs.json')));
    const changeAt = (index, inputs = publicInputs) => inputs.map((v, i) => i === index ? '0x' + (BigInt(v) ^ 1n).toString(16).padStart(64, '0') : v);
    const altered = Buffer.from(proof); altered[31] ^= 1;
    const tests = [
      ['positive', proof, publicInputs, 'Verifier.sol', true],
      ['changedPublicCommitment', proof, changeAt(16), 'Verifier.sol', false],
      ['crossDomainPublicScope', proof, changeAt(0), 'Verifier.sol', false],
      ['wrongDigestWordOrder', proof, [...publicInputs.slice(0, 16), ...publicInputs.slice(16).reverse()], 'Verifier.sol', false],
      ['alteredProof', altered, publicInputs, 'Verifier.sol', false],
      ['wrongVerificationKeyContract', proof, publicInputs, 'WrongVerifier.sol', false],
      ['sameScopeReplayStatelessAccepted', proof, publicInputs, 'Verifier.sol', true],
    ];
    for (const [name, candidateProof, inputs, source, expected] of tests) {
      const d = deployed[source]; const data = verifierCalldata(d.selector, candidateProof, inputs);
      let callResult, callError;
      try { callResult = await rpc('eth_call', [{ to: d.address, data, gas: '0x1c9c380' }, 'latest']); } catch (e) { if (!e.rpc) { record.transportFailures.push({ name, error: String(e.message) }); throw e; } callError = e.rpc; }
      const receipt = await send({ to: d.address, data });
      const entry = { name, expected, contract: d.address, calldataBytes: (data.length - 2) / 2, calldataSHA256: shaHex(Buffer.from(data.slice(2), 'hex')), ethCallReturn: callResult ?? null, ethCallError: callError ?? null, receipt, gasUsed: Number(BigInt(receipt.gasUsed)) };
      if (expected) {
        assert.equal(callResult, '0x' + word(1), name); assert.equal(receipt.status, '0x1', name); entry.classified = 'VERIFIER_RETURNED_TRUE';
      } else if (receipt.status === '0x0') {
        const trace = await rpc('debug_traceTransaction', [receipt.transactionHash, { disableMemory: true, disableStack: true, disableStorage: true }]);
        entry.trace = { failed: trace.failed, gas: trace.gas, returnValue: trace.returnValue };
        assert.equal(trace.failed, true); assert.ok(trace.returnValue.replace(/^0x/, '').length >= 8, 'Actual verifier revert payload, not transport error');
        assert.ok(callError, 'eth_call separately reverted'); entry.classified = 'DEPLOYED_VERIFIER_REVERTED';
      } else {
        assert.equal(receipt.status, '0x1'); assert.equal(callResult, '0x' + word(0)); entry.classified = 'VERIFIER_RETURNED_FALSE';
      }
      record.cases.push(entry); await checkpoint();
    }
    record.classification = 'ACTUAL_DEPLOYED_LOCAL_ZK_SIGNATURE_VERIFIER_UNFUNDED';
    record.completedAt = new Date().toISOString(); record.processResourceUsage = process.resourceUsage();
    console.log(JSON.stringify({ classification: record.classification, deployments: record.deployments.map(d => ({ source: d.source, codeBytes: d.deployedCodeBytes, gas: d.deploymentGas })), cases: record.cases.map(c => ({ name: c.name, classified: c.classified, gasUsed: c.gasUsed })) }));
  } catch (e) { record.failure = { message: String(e.message), rpc: e.rpc ?? null }; throw e; }
  finally {
    if (handle) record.cleanup = await stopOwnProcess(handle);
    await rm(cwd, { recursive: true, force: false }); await checkpoint();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
