/** Local-only asset-isolated reusable-balance deployment/integration helper.
 * Accepts the in-process object returned by createOwnedNativeRuntime; never a
 * caller-selected endpoint, key, external account or runtime executable.
 * Does not start/stop any runtime, generate proofs or replace circuit checks.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linuxRuntimePins } from './chains/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, isolatedRuntimeEnvironment, projectRoot, sleep } from './chains/runtime-harness.mjs';
import { assertPrivateRootHistory } from './private-assembly-history.mjs';
import { assertPrivateAssemblyRevocations } from './private-assembly-revocations.mjs';
import { PrivateNoteTree, ZERO_NOTE_HASH, privateSpentDigest, privateEffectDigest, assertPrivateNoteHeadroom } from './private-note-tree.mjs';

export const PRIVATE_ASSET_VERIFIER_MODES = Object.freeze(['reserve', 'fulfill', 'refund', 'withdraw', 'sol_ready', 'btc_ready', 'deposit_balance', 'reserve_from_note', 'withdraw_balance']);
export const PRIVATE_ASSET_INPUT_WORDS = Object.freeze({ reserve: 34, fulfill: 65, refund: 41, withdraw: 39, sol_ready: 61, btc_ready: 79, deposit_balance: 26, reserve_from_note: 74, withdraw_balance: 39 });
export const PRIVATE_ASSET_POOL_METHODS = Object.freeze({ reserve: 'reserve', fulfill: 'fulfill', refund: 'refund', withdraw: 'withdraw', deposit_balance: 'depositBalance', reserve_from_note: 'reserveFromNoteGuarded', withdraw_balance: 'withdrawBalance' });
export const PRIVATE_ASSET_POOL_SOURCE_SHA256 = '37d18f5c7cdac4be58bd59245bc26666db0efc28ec04daf64690616daae2b133';
export const PRIVATE_ASSET_TOKEN_SOURCE_SHA256 = '397538dba08caa692165e93036804c2045fb646e7edbd719899036912853461e';
export const PRIVATE_ASSET_NATIVE = `0x${'00'.repeat(20)}`;
export const PRIVATE_POOL_MAX_GAS = 30_000_000;
/** Recheck a numeric-height snapshot after its dependent authority reads.
 * This detects a changed header; it cannot remove the check-to-broadcast race. */
export async function assertPrivateSnapshotCanonical(runtime, snapshot) {
  assert.match(snapshot.blockNumber, /^0x(?:0|[1-9a-f][0-9a-f]*)$/i, 'PRIVATE_SNAPSHOT_BLOCK');
  assert.match(snapshot.blockHash, /^0x[0-9a-f]{64}$/i, 'PRIVATE_SNAPSHOT_HASH');
  const header = await runtime.evm('eth_getBlockByNumber', [snapshot.blockNumber, false]);
  assert.equal(header?.hash, snapshot.blockHash, 'PRIVATE_SNAPSHOT_BLOCK_CHANGED');
}
const EIP170_LIMIT = 24_576;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => `0x${BigInt(value).toString(16)}`;
function word(value) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'PRIVATE_ABI_SAFE_INTEGER');
  assert.ok(typeof value === 'bigint' || typeof value === 'number' || (typeof value === 'string' && /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i.test(value)), 'PRIVATE_ABI_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << 256n), 'PRIVATE_ABI_WORD_RANGE');
  return n.toString(16).padStart(64, '0');
}
function address(value) { assert.match(value, /^0x[0-9a-f]{40}$/i, 'PRIVATE_EVM_ADDRESS'); return value.toLowerCase(); }
function bytes32(value) { assert.match(value, /^0x[0-9a-f]{64}$/i, 'PRIVATE_BYTES32'); return value.toLowerCase(); }

/** Immutable local asset identity; assetCodeHash is EVM EXTCODEHASH (keccak256).
 * Native asset zero uses code hash zero. These are public identities, not labels. */
export function derivePrivateAssetIdentity(chainId, asset, assetCodeHash) {
  const a = address(asset), code = bytes32(assetCodeHash);
  assert.ok((a === PRIVATE_ASSET_NATIVE) === (BigInt(code) === 0n), 'PRIVATE_ASSET_CODE_IDENTITY');
  return `0x${sha(Buffer.from(`24${word(chainId)}${a.slice(2)}${code.slice(2)}`, 'hex'))}`;
}
export function derivePrivateAssetPoolScope(chainId, pool, deploymentDomain, assetIdentity) {
  return `0x${sha(Buffer.from(`25${word(chainId)}${address(pool).slice(2)}${bytes32(deploymentDomain).slice(2)}${bytes32(assetIdentity).slice(2)}`, 'hex'))}`;
}

/** Exact ABI for verify/reserve/fulfill/refund/withdraw(bytes,bytes32[]).
 * Dynamic offsets are measured from the argument head, not the selector. */
export function privateVerifierCalldata(selector, proof, publicInputs) {
  assert.match(selector, /^[0-9a-f]{8}$/i, 'PRIVATE_METHOD_SELECTOR');
  assert.ok(Buffer.isBuffer(proof) || proof instanceof Uint8Array, 'PRIVATE_PROOF_REQUIRES_BYTES');
  assert.ok(Array.isArray(publicInputs), 'PRIVATE_PUBLIC_INPUT_ARRAY');
  const data = Buffer.from(proof), padded = Math.ceil(data.length / 32) * 32;
  const tail = word(data.length) + data.toString('hex').padEnd(padded * 2, '0');
  return `0x${selector}${word(64)}${word(96 + padded)}${tail}${word(publicInputs.length)}${publicInputs.map(word).join('')}`;
}

/** Exact ABI for reserveGuarded(bytes,bytes32[],bytes32,uint64,bytes32).
 * Five head words precede the two dynamic tails. Guard roots remain full-width
 * bytes32 values; sequence is a canonical uint64, never an imprecise Number.
 * This only encodes guards; the contract enforces their atomicity with funding.
 */
export function privateGuardedReserveCalldata(selector, proof, publicInputs, guards) {
  assert.match(selector, /^[0-9a-f]{8}$/i, 'PRIVATE_METHOD_SELECTOR');
  assert.ok(Buffer.isBuffer(proof) || proof instanceof Uint8Array, 'PRIVATE_PROOF_REQUIRES_BYTES');
  assert.ok(Array.isArray(publicInputs), 'PRIVATE_PUBLIC_INPUT_ARRAY');
  const keys = ['expectedRoot', 'expectedSequence', 'expectedPostRoot'];
  assert.ok(guards && typeof guards === 'object' && !Array.isArray(guards) &&
    Object.keys(guards).length === keys.length && keys.every(key => Object.hasOwn(guards, key)), 'PRIVATE_RESERVE_GUARD_FIELDS');
  const root = bytes32(guards.expectedRoot), postRoot = bytes32(guards.expectedPostRoot);
  const sequence = word(guards.expectedSequence);
  assert.ok(BigInt(`0x${sequence}`) < (1n << 64n), 'PRIVATE_RESERVE_GUARD_SEQUENCE_RANGE');
  const data = Buffer.from(proof), padded = Math.ceil(data.length / 32) * 32;
  const tail = word(data.length) + data.toString('hex').padEnd(padded * 2, '0');
  return `0x${selector}${word(160)}${word(192 + padded)}${root.slice(2)}${sequence}${postRoot.slice(2)}${tail}${word(publicInputs.length)}${publicInputs.map(word).join('')}`;
}

/** Parse actual trace output without presuming every revert is Error(string).
 * Empty data stays EMPTY_REVERT and cannot establish verifier rejection. */
export function decodePrivateRevert(input) {
  assert.equal(typeof input, 'string', 'PRIVATE_REVERT_HEX');
  const raw = input.replace(/^0x/, '');
  assert.match(raw, /^(?:[0-9a-f]{2})*$/i, 'PRIVATE_REVERT_HEX');
  const data = `0x${raw.toLowerCase()}`;
  if (raw.length < 8) return { data, selector: null, kind: raw.length ? 'MALFORMED_REVERT' : 'EMPTY_REVERT' };
  const selector = data.slice(0, 10);
  if (selector === '0x08c379a0') {
    if (raw.length >= 136 && BigInt(`0x${raw.slice(8, 72)}`) === 32n) {
      const length = BigInt(`0x${raw.slice(72, 136)}`);
      if (length <= BigInt((raw.length - 136) / 2)) return { data, selector, kind: 'ERROR_STRING', reason: Buffer.from(raw.slice(136, 136 + Number(length) * 2), 'hex').toString('utf8') };
    }
    return { data, selector, kind: 'MALFORMED_ERROR_STRING' };
  }
  if (selector === '0x4e487b71' && raw.length === 72) return { data, selector, kind: 'PANIC', panicCode: `0x${BigInt(`0x${raw.slice(8)}`).toString(16)}` };
  return { data, selector, kind: 'CUSTOM_ERROR' };
}

/** Replace only compiler-declared 20-byte library references. Generated source
 * is never patched and unresolved placeholders are never submitted to Anvil. */
export function linkPrivateBytecode(bytecode, references, libraries) {
  assert.equal(typeof bytecode, 'string');
  const used = [];
  let linked = bytecode;
  for (const [source, names] of Object.entries(references ?? {})) {
    for (const [name, locations] of Object.entries(names)) {
      const libraryAddress = address(libraries[`${source}:${name}`]);
      for (const location of locations) {
        assert.ok(Number.isSafeInteger(location.start) && location.start >= 0, 'PRIVATE_LINK_START');
        assert.equal(location.length, 20, 'PRIVATE_LINK_WIDTH');
        assert.ok((location.start + location.length) * 2 <= bytecode.length, 'PRIVATE_LINK_BOUNDS');
        const range = [location.start, location.start + location.length];
        assert.ok(used.every(([a, b]) => range[1] <= a || range[0] >= b), 'PRIVATE_LINK_OVERLAP'); used.push(range);
        linked = linked.slice(0, range[0] * 2) + libraryAddress.slice(2) + linked.slice(range[1] * 2);
      }
    }
  }
  assert.match(linked, /^(?:[0-9a-f]{2})+$/i, 'PRIVATE_UNRESOLVED_BYTECODE');
  return linked;
}

/** Every generated source has an explicit expected SHA256 from its own artifact
 * provenance. Matching a caller-supplied pin is integrity, not genuine-proof
 * evidence; the caller must supply the independently reviewed artifact pins. */
export async function privateAssetSourceInput(sourceMap) {
  assert.ok(sourceMap && typeof sourceMap === 'object' && !Array.isArray(sourceMap), 'PRIVATE_SOURCE_MAP');
  assert.deepEqual(Object.keys(sourceMap).sort(), [...PRIVATE_ASSET_VERIFIER_MODES].sort(), 'PRIVATE_ASSET_EXACT_NINE_SOURCES');
  const sources = {}, sourceNames = {};
  for (const mode of PRIVATE_ASSET_VERIFIER_MODES) {
    const record = sourceMap[mode];
    assert.ok(record && typeof record === 'object' && !Array.isArray(record), 'PRIVATE_ASSET_PINNED_SOURCE');
    assert.deepEqual(Object.keys(record).sort(), ['content', 'sha256'], 'PRIVATE_ASSET_SOURCE_FIELDS');
    const { content, sha256 } = record;
    assert.ok(typeof content === 'string' && content.length > 0, 'PRIVATE_SOLIDITY_SOURCE');
    assert.match(sha256, /^[0-9a-f]{64}$/, 'PRIVATE_ASSET_SOURCE_PIN');
    assert.equal(sha(content), sha256, `PRIVATE_ASSET_SOURCE_HASH_${mode}`);
    assert.ok(!/^\s*import\s/m.test(content), 'PRIVATE_IMPORTED_SOURCE_UNSUPPORTED');
    const name = `${mode}.sol`; sources[name] = { content }; sourceNames[mode] = name;
  }
  const pool = await readFile(join(projectRoot, 'contracts/PrivateAssetNotePool.sol'), 'utf8');
  assert.equal(sha(pool), PRIVATE_ASSET_POOL_SOURCE_SHA256, 'PRIVATE_ASSET_POOL_SOURCE_HASH');
  assert.ok(!/^\s*import\s/m.test(pool), 'PRIVATE_IMPORTED_SOURCE_UNSUPPORTED');
  sourceNames.pool = 'PrivateAssetNotePool.sol'; sources[sourceNames.pool] = { content: pool };
  const token = await readFile(join(projectRoot, 'contracts/PrivateAssetTestToken.sol'), 'utf8');
  assert.equal(sha(token), PRIVATE_ASSET_TOKEN_SOURCE_SHA256, 'PRIVATE_ASSET_TOKEN_SOURCE_HASH');
  sourceNames.token = 'PrivateAssetTestToken.sol'; sources[sourceNames.token] = { content: token };
  return { sources, sourceNames };
}

/** Strict count for every independently pinned verifier, including readiness.
 * Raw privateVerifierCalldata remains available only for explicit ABI controls. */
export function privateAssetVerifierCalldata(mode, selector, proof, publicInputs) {
  assert.ok(Object.hasOwn(PRIVATE_ASSET_INPUT_WORDS, mode), 'PRIVATE_VERIFIER_MODE');
  assert.equal(publicInputs?.length, PRIVATE_ASSET_INPUT_WORDS[mode], 'PRIVATE_ASSET_PUBLIC_INPUT_LENGTH');
  return privateVerifierCalldata(selector, proof, publicInputs);
}

/** Compilation only: hash-checks the exact local official solc binary on every
 * call. Nine generated sources retain independent compiler namespaces. */
export async function compilePrivateAssetPool(sourceMap) {
  assert.equal(process.platform, 'linux', 'PRIVATE_LOCAL_LINUX_ONLY');
  const { sources, sourceNames } = await privateAssetSourceInput(sourceMap);
  const binary = await pinnedBinary(...linuxRuntimePins.solc);
  const cwd = await scratchDirectory('private-asset-compile-');
  const settings = {
    optimizer: { enabled: true, runs: 1 }, viaIR: false, evmVersion: 'cancun', metadata: { bytecodeHash: 'none' },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object', 'evm.deployedBytecode.linkReferences', 'evm.deployedBytecode.immutableReferences', 'evm.methodIdentifiers'] } },
  };
  const input = { language: 'Solidity', sources, settings };
  let peakSampledRSSKiB = 0;
  const start = performance.now();
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(binary, ['--standard-json', '--no-import-callback'], { cwd, env: isolatedRuntimeEnvironment(cwd), stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', failure, killTimer;
      const fail = error => { failure ??= error; child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000); };
      const interval = setInterval(async () => {
        try { const status = await readFile(`/proc/${child.pid}/status`, 'utf8'); const rss = /VmHWM:\s+(\d+) kB/.exec(status); if (rss) peakSampledRSSKiB = Math.max(peakSampledRSSKiB, Number(rss[1])); } catch {}
      }, 100);
      const timer = setTimeout(() => fail(new Error('PRIVATE_SOLC_TIMEOUT')), 180_000);
      child.on('error', error => { failure ??= error; });
      child.stdin.on('error', error => { failure ??= error; });
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 64 * 1024 * 1024) fail(new Error('PRIVATE_SOLC_OUTPUT_LIMIT')); });
      child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk; });
      child.on('close', code => {
        clearInterval(interval); clearTimeout(timer); clearTimeout(killTimer);
        if (failure) return reject(failure);
        if (code !== 0) return reject(new Error(`PRIVATE_SOLC_EXIT_${code}: ${stderr}`));
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify(input));
    });
    const errors = (output.errors ?? []).filter(error => error.severity === 'error');
    if (errors.length) { const error = new Error(`PRIVATE_SOLIDITY_COMPILER_ERRORS: ${errors.map(item => item.formattedMessage ?? item.message).join('\n')}`); error.compilerErrors = errors; throw error; }
    for (const mode of PRIVATE_ASSET_VERIFIER_MODES) {
      const artifact = output.contracts?.[sourceNames[mode]]?.HonkVerifier;
      assert.ok(artifact, `PRIVATE_GENERATED_HONK_VERIFIER_${mode}`);
      const verify = artifact.abi.find(item => item.type === 'function' && item.name === 'verify');
      assert.equal(verify?.stateMutability, 'view', `PRIVATE_VERIFIER_VIEW_${mode}`);
      assert.deepEqual(verify.inputs.map(input => input.type), ['bytes', 'bytes32[]'], 'PRIVATE_VERIFIER_INPUT_ABI');
      assert.deepEqual(verify.outputs.map(output => output.type), ['bool'], 'PRIVATE_VERIFIER_OUTPUT_ABI');
      assert.ok(artifact.evm.methodIdentifiers['verify(bytes,bytes32[])'], 'PRIVATE_VERIFIER_ABI');
    }
    assert.ok(output.contracts?.[sourceNames.pool]?.PrivateAssetNotePool, 'PRIVATE_POOL_ARTIFACT');
    assert.ok(output.contracts[sourceNames.pool].PrivateAssetNotePool.evm.deployedBytecode.object.length / 2 <= EIP170_LIMIT, 'PRIVATE_ASSET_POOL_EIP170_SIZE');
    return { output, sourceNames, settings, milliseconds: performance.now() - start, peakSampledRSSKiB,
      memoryMetric: '100ms /proc VmHWM samples; lower bound if final peak falls between samples',
      solcPin: linuxRuntimePins.solc,
      sources: Object.fromEntries(Object.entries(sources).map(([name, { content }]) => [name, { bytes: Buffer.byteLength(content), sha256: sha(content) }])),
    };
  } finally { await removeOwnScratch(cwd); }
}

async function assertOwnedRuntime(runtime) {
  assert.equal(runtime?.metadata?.classification, 'OWNED_LOCAL_RUNTIMES_ONLY', 'PRIVATE_RUNTIME_OWNERSHIP');
  assert.equal(runtime.metadata.freshSyntheticWallets, true, 'PRIVATE_SYNTHETIC_ACCOUNTS');
  assert.equal(typeof runtime.evm, 'function', 'PRIVATE_OWNED_RPC');
  assert.equal(await runtime.evm('eth_chainId'), '0x7a69', 'PRIVATE_LOCAL_CHAIN_ID');
  assert.equal((await runtime.evm('eth_getBlockByNumber', ['0x0', false])).hash, runtime.metadata.evmGenesis, 'PRIVATE_RUNTIME_GENESIS');
  const accounts = await runtime.evm('eth_accounts');
  assert.deepEqual(accounts, runtime.accounts, 'PRIVATE_RUNTIME_ACCOUNTS');
  assert.ok(accounts.length > 0); for (const account of accounts) address(account);
}

/** Compile then deploy exact generated verifier libraries, nine verifiers, then
 * the immutable pool. Caller owns runtime lifetime and persists returned data.
 * onDeployment receives each confirmed deployment before work continues.
 */
export async function deployPrivateAssetPool(runtime, { sources, policy, deploymentDomain, solAuthority, btcAuthority, asset, initialSupply = 1_000_000_000n, onDeployment = async () => {} }) {
  await assertOwnedRuntime(runtime);
  policy = bytes32(policy); deploymentDomain = bytes32(deploymentDomain);
  const compilation = await compilePrivateAssetPool(sources);
  const deployments = [], receipts = [], deployed = new Map(), active = new Set();
  const gasLimit = hex(PRIVATE_POOL_MAX_GAS);

  const send = async (label, transaction, expectedStatus = '0x1', expectedRevert) => {
    assert.ok(expectedStatus === '0x1' || expectedStatus === '0x0', 'PRIVATE_EXPECTED_RECEIPT_STATUS');
    assert.ok(transaction && typeof transaction === 'object', 'PRIVATE_TRANSACTION');
    assert.ok(Object.keys(transaction).every(key => ['from', 'to', 'data', 'gas', 'value'].includes(key)), 'PRIVATE_TRANSACTION_FIELDS');
    const request = { from: runtime.accounts[0], gas: gasLimit, ...transaction };
    request.from = address(request.from);
    assert.ok(runtime.accounts.map(account => account.toLowerCase()).includes(request.from), 'PRIVATE_SENDER_NOT_OWNED');
    if (request.to !== undefined) request.to = address(request.to);
    if (request.data !== undefined) assert.match(request.data, /^0x(?:[0-9a-f]{2})*$/i, 'PRIVATE_TRANSACTION_DATA');
    const gas = BigInt(request.gas); assert.ok(gas > 0n && gas <= BigInt(PRIVATE_POOL_MAX_GAS), 'PRIVATE_TRANSACTION_GAS'); request.gas = hex(gas);
    if (request.value !== undefined) { word(request.value); request.value = hex(request.value); }
    // No retry: a lost response is ambiguous and must be reconciled separately.
    const hash = await runtime.evm('eth_sendTransaction', [request]);
    let receipt;
    for (let i = 0; i < 200; i++) { receipt = await runtime.evm('eth_getTransactionReceipt', [hash]); if (receipt) break; await sleep(50); }
    if (!receipt) { const error = new Error('PRIVATE_RECEIPT_TIMEOUT'); error.transactionHash = hash; throw error; }
    const entry = { label, request, receipt, gasUsed: Number(BigInt(receipt.gasUsed)) };
    if (receipt.status === '0x0') {
      const trace = await runtime.evm('debug_traceTransaction', [hash, { disableMemory: true, disableStack: true, disableStorage: true }]);
      entry.trace = { failed: trace.failed, gas: trace.gas, returnValue: trace.returnValue };
      assert.equal(trace.failed, true, 'PRIVATE_REVERT_TRACE');
      entry.revert = decodePrivateRevert(trace.returnValue);
    }
    receipts.push(entry);
    assert.equal(receipt.status, expectedStatus, label);
    if (expectedStatus === '0x0') assert.ok(entry.revert?.selector, 'PRIVATE_EXPECTED_REVERT_PAYLOAD_NOT_EMPTY_OR_TRANSPORT');
    if (expectedRevert !== undefined) {
      assert.ok(entry.revert, 'PRIVATE_EXPECTED_REVERT');
      if (/^0x[0-9a-f]{8}$/i.test(expectedRevert)) assert.equal(entry.revert.selector, expectedRevert.toLowerCase(), label);
      else assert.equal(entry.revert.reason, expectedRevert, label);
    }
    return receipt;
  };

  const deployArtifact = async (source, contractName, constructorWords = [], isLinkedLibrary = false) => {
    const key = `${source}:${contractName}`;
    if (deployed.has(key)) { assert.equal(constructorWords.length, 0); return deployed.get(key); }
    assert.ok(!active.has(key), 'PRIVATE_CYCLIC_LIBRARY_LINK'); active.add(key);
    const artifact = compilation.output.contracts[source]?.[contractName]; assert.ok(artifact, `PRIVATE_ARTIFACT_${key}`);
    const libraries = {}, linkedLibraries = [];
    for (const [librarySource, names] of Object.entries(artifact.evm.bytecode.linkReferences ?? {})) {
      for (const [libraryName, references] of Object.entries(names)) {
        const library = await deployArtifact(librarySource, libraryName, [], true);
        libraries[`${librarySource}:${libraryName}`] = library.address;
        linkedLibraries.push({ librarySource, libraryName, address: library.address, references });
      }
    }
    const bytecode = linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries) + constructorWords.map(word).join('');
    assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= EIP170_LIMIT, 'PRIVATE_ARTIFACT_EIP170_SIZE');
    const receipt = await send(`deploy ${key}`, { data: `0x${bytecode}` });
    const deployedAddress = address(receipt.contractAddress);
    const code = await runtime.evm('eth_getCode', [deployedAddress, 'latest']);
    assert.match(code, /^0x(?:[0-9a-f]{2})+$/i, 'PRIVATE_DEPLOYED_CODE');
    const deployedCodeBytes = (code.length - 2) / 2;
    assert.ok(deployedCodeBytes <= EIP170_LIMIT, 'PRIVATE_NORMAL_EIP170_SIZE');
    const expectedRuntime = linkPrivateBytecode(artifact.evm.deployedBytecode.object, artifact.evm.deployedBytecode.linkReferences, libraries);
    assert.equal(deployedCodeBytes, expectedRuntime.length / 2, 'PRIVATE_DEPLOYED_CODE_LENGTH');
    const actualRuntime = Buffer.from(code.slice(2), 'hex'), templateRuntime = Buffer.from(expectedRuntime, 'hex');
    // solc libraries substitute their deployment address into the initial PUSH20
    // self-address guard. This is a compiler-declared link dependency, not a
    // general allowance for arbitrary runtime-byte differences.
    if (isLinkedLibrary && /^73(?:00){20}3014/.test(expectedRuntime)) {
      Buffer.from(deployedAddress.slice(2), 'hex').copy(templateRuntime, 1);
    }
    for (const ranges of Object.values(artifact.evm.deployedBytecode.immutableReferences ?? {})) for (const { start, length } of ranges) {
      assert.ok(start >= 0 && length === 32 && start + length <= actualRuntime.length, 'PRIVATE_IMMUTABLE_RANGE');
      actualRuntime.fill(0, start, start + length); templateRuntime.fill(0, start, start + length);
    }
    assert.deepEqual(actualRuntime, templateRuntime, 'PRIVATE_DEPLOYED_CODE_TEMPLATE');
    const record = { source, contractName, constructorWords: constructorWords.map(value => `0x${word(value)}`),
      constructorArgumentsSHA256: sha(Buffer.from(constructorWords.map(word).join(''), 'hex')), role: contractName === 'HonkVerifier' ? 'verifier' : contractName === 'PrivateAssetNotePool' ? 'asset-funded-note-pool' : contractName === 'PrivateAssetTestToken' ? 'fixed-local-test-asset' : 'generated-linked-library',
      address: deployedAddress, linkedLibraries, creationBytes: bytecode.length / 2,
      linkedCreationBytecodeSHA256: sha(Buffer.from(bytecode, 'hex')), deployedCodeBytes,
      deployedCodeSHA256: sha(Buffer.from(code.slice(2), 'hex')), deploymentGas: Number(BigInt(receipt.gasUsed)), receipt,
    };
    deployments.push(record); deployed.set(key, record); active.delete(key);
    await onDeployment(record); return record;
  };

  const verifiers = {};
  for (const mode of PRIVATE_ASSET_VERIFIER_MODES) {
    const source = compilation.sourceNames[mode], deployedVerifier = await deployArtifact(source, 'HonkVerifier');
    const selector = compilation.output.contracts[source].HonkVerifier.evm.methodIdentifiers['verify(bytes,bytes32[])'];
    verifiers[mode] = { address: deployedVerifier.address, selector, source };
  }
  // Only this exact, fixed local token runtime is accepted by the deployment
  // helper. Contract delta checks alone cannot classify arbitrary token code.
  if (asset === undefined) {
    assert.ok(BigInt(initialSupply) > 0n && BigInt(initialSupply) < (1n << 256n), 'PRIVATE_ASSET_SUPPLY');
    asset = (await deployArtifact(compilation.sourceNames.token, 'PrivateAssetTestToken', [initialSupply])).address;
  } else asset = address(asset);
  const tokenArtifact = compilation.output.contracts[compilation.sourceNames.token].PrivateAssetTestToken;
  if (asset !== PRIVATE_ASSET_NATIVE) {
    const actualCode = await runtime.evm('eth_getCode', [asset, 'latest']);
    assert.equal(actualCode, `0x${tokenArtifact.evm.deployedBytecode.object}`, 'PRIVATE_ASSET_UNSUPPORTED_TOKEN_CODE');
  }
  const pool = await deployArtifact(compilation.sourceNames.pool, 'PrivateAssetNotePool', [asset, deploymentDomain, policy, ...['reserve', 'fulfill', 'refund', 'withdraw'].map(mode => verifiers[mode].address), address(solAuthority), address(btcAuthority), ...['deposit_balance', 'reserve_from_note', 'withdraw_balance'].map(mode => verifiers[mode].address)]);
  const selectors = compilation.output.contracts[compilation.sourceNames.pool].PrivateAssetNotePool.evm.methodIdentifiers;
  const data = (method, args = []) => { assert.ok(selectors[method], `PRIVATE_POOL_METHOD_${method}`); return `0x${selectors[method]}${args.map(word).join('')}`; };
  const proofData = (mode, proof, publicInputs) => {
    assert.ok(Object.hasOwn(PRIVATE_ASSET_POOL_METHODS, mode), 'PRIVATE_POOL_MODE');
    return privateAssetVerifierCalldata(mode, selectors[`${PRIVATE_ASSET_POOL_METHODS[mode]}(bytes,bytes32[])`], proof, publicInputs);
  };
  const guardedReserveData = (proof, publicInputs, guards) => {
    assert.equal(publicInputs?.length, 34, 'PRIVATE_ASSET_PUBLIC_INPUT_LENGTH');
    return privateGuardedReserveCalldata(selectors['reserveGuarded(bytes,bytes32[],bytes32,uint64,bytes32)'], proof, publicInputs, guards);
  };
  const call = (method, args = [], block = 'latest') => runtime.evm('eth_call', [{ to: pool.address, data: data(method, args), gas: gasLimit }, block]);
  const verify = async (mode, proof, publicInputs, block = 'latest') => {
    assert.ok(Object.hasOwn(verifiers, mode), 'PRIVATE_VERIFIER_MODE');
    const verifier = verifiers[mode];
    const result = await runtime.evm('eth_call', [{ to: verifier.address, data: privateAssetVerifierCalldata(mode, verifier.selector, proof, publicInputs), gas: gasLimit }, block]);
    assert.ok(result === `0x${word(0)}` || result === `0x${word(1)}`, 'PRIVATE_VERIFIER_RETURN_ABI');
    return result === `0x${word(1)}`;
  };
  const scope = await call('scope()');
  const assetCodeHash = await call('assetCodeHash()');
  const assetIdentity = derivePrivateAssetIdentity(runtime.metadata.chainId, asset, assetCodeHash);
  assert.equal(address(`0x${(await call('asset()')).slice(-40)}`), asset, 'PRIVATE_DEPLOYED_ASSET');
  assert.equal(await call('assetIdentity()'), assetIdentity, 'PRIVATE_DEPLOYED_ASSET_IDENTITY');
  assert.equal(scope, derivePrivateAssetPoolScope(runtime.metadata.chainId, pool.address, deploymentDomain, assetIdentity), 'PRIVATE_DEPLOYED_SCOPE');
  assert.equal(await call('policy()'), policy, 'PRIVATE_DEPLOYED_POLICY');
  assert.equal(await call('deploymentDomain()'), deploymentDomain, 'PRIVATE_DEPLOYED_DOMAIN');
  assert.equal(BigInt(await call('EPOCH_SECONDS()')), 600n, 'PRIVATE_EPOCH_SECONDS');
  for (const mode of ['reserve', 'fulfill', 'refund', 'withdraw']) assert.equal(address(`0x${(await call(`${mode}Verifier()`)).slice(-40)}`), verifiers[mode].address, 'PRIVATE_IMMUTABLE_VERIFIER');
  for (const [mode, getter] of Object.entries({ deposit_balance: 'depositBalanceVerifier', reserve_from_note: 'reserveFromNoteVerifier', withdraw_balance: 'withdrawBalanceVerifier' })) assert.equal(address(`0x${(await call(`${getter}()`)).slice(-40)}`), verifiers[mode].address, 'PRIVATE_IMMUTABLE_WALLET_VERIFIER');
  assert.equal(address(`0x${(await call('solFinalityAuthority()')).slice(-40)}`), address(solAuthority));
  assert.equal(address(`0x${(await call('btcFinalityAuthority()')).slice(-40)}`), address(btcAuthority));
  // One fixed block for all data, plus independent host reconstruction. Never
  // accept a prover-provided root/digest as a substitute for authority reads.
  const snapshot = async (block = 'latest') => {
    assert.ok(block === 'latest' || /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(block), 'PRIVATE_SNAPSHOT_BLOCK');
    const header = await runtime.evm('eth_getBlockByNumber', [block, false]);
    assert.ok(header?.number && header?.hash, 'PRIVATE_SNAPSHOT_BLOCK_MISSING');
    const [rawState, rawEffects, rawHistory, rawRevocations, rawBacking] = await Promise.all([call('canonicalState()', [], header.number), call('canonicalEffects()', [], header.number), call('canonicalRootHistory()', [], header.number), call('canonicalRevocations()', [], header.number), call('canonicalBacking()', [], header.number)]);
    const result = decodePrivateAssetSnapshot({ scope, policy, header, rawState, rawEffects, rawHistory, rawRevocations });
    assert.match(rawBacking, /^0x(?:[0-9a-f]{64}){6}$/i, 'PRIVATE_ASSET_BACKING_ABI');
    const backing = rawBacking.slice(2).match(/.{64}/g).map(x => BigInt(`0x${x}`));
    assert.equal(backing[0].toString(), result.stateSequence, 'PRIVATE_ASSET_BACKING_SEQUENCE');
    const [, admitted, actual, surplus, deficit, unrelatedNative] = backing;
    assert.equal(actual + deficit, admitted + surplus, 'PRIVATE_ASSET_BACKING_CONSERVATION');
    assert.ok(surplus === 0n || deficit === 0n, 'PRIVATE_ASSET_BACKING_SIGN');
    Object.assign(result, { asset, assetCodeHash, assetIdentity, backedAmount: admitted.toString(), assetBalance: actual.toString(), assetSurplus: surplus.toString(), assetDeficit: deficit.toString(), unrelatedNative: unrelatedNative.toString() });
    await assertPrivateSnapshotCanonical(runtime, result);
    return result;
  };
  const assetSelectors = tokenArtifact.evm.methodIdentifiers;
  const assetData = (method, args = []) => { assert.ok(assetSelectors[method], 'PRIVATE_ASSET_METHOD'); return `0x${assetSelectors[method]}${args.map(word).join('')}`; };
  const assetCall = (method, args = [], block = 'latest') => {
    assert.notEqual(asset, PRIVATE_ASSET_NATIVE, 'PRIVATE_NATIVE_HAS_NO_TOKEN_ABI');
    return runtime.evm('eth_call', [{ to: asset, data: assetData(method, args), gas: gasLimit }, block]);
  };
  const assetBalance = async (holder, block = 'latest') => {
    holder = address(holder);
    assert.ok(block === 'latest' || /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(block), 'PRIVATE_ASSET_BLOCK');
    return BigInt(asset === PRIVATE_ASSET_NATIVE ? await runtime.evm('eth_getBalance', [holder, block]) : await assetCall('balanceOf(address)', [holder], block));
  };
  const fundingTransactionValue = amount => {
    const n = BigInt(`0x${word(amount)}`);
    assert.ok(n > 0n && n < (1n << 64n), 'PRIVATE_ASSET_FUNDING_AMOUNT');
    return asset === PRIVATE_ASSET_NATIVE ? hex(n) : '0x0';
  };
  const beforeDeposit = async (amount, from = runtime.accounts[0]) => {
    fundingTransactionValue(amount); from = address(from);
    assert.ok(runtime.accounts.map(a => a.toLowerCase()).includes(from), 'PRIVATE_ASSET_APPROVER_NOT_OWNED');
    if (asset === PRIVATE_ASSET_NATIVE) return null;
    return send('approve exact local note deposit', { from, to: asset, data: assetData('approve(address,uint256)', [pool.address, amount]) });
  };
  return { address: pool.address, asset, assetCodeHash, assetIdentity, assetSelectors, assetData, assetCall, assetBalance, fundingTransactionValue, beforeDeposit, scope, policy, deploymentDomain, selectors, data, proofData, guardedReserveData, call, send, verify, snapshot, verifiers, deployments, receipts, compilation };
}

/** Pure ABI/consistency decoder for independently block-pinned public pool reads.
 * This does not authenticate a caller-supplied header or replace the runtime's
 * final canonical-header recheck. It does not interpret readiness proof inputs.
 */
export function decodePrivateAssetSnapshot({ scope, policy, header, rawState, rawEffects, rawHistory, rawRevocations }) {
  const split = (raw, size) => {
    assert.match(raw, /^0x(?:[0-9a-f]{64})+$/i, 'PRIVATE_SNAPSHOT_ABI');
    const words = raw.slice(2).match(/.{64}/g).map(word => `0x${word.toLowerCase()}`);
    assert.equal(words.length, size, 'PRIVATE_SNAPSHOT_ABI_LENGTH'); return words;
  };
  const state = split(rawState, 135), effects = split(rawEffects, 133), history = split(rawHistory, 68), revocations = split(rawRevocations, 68);
  assert.equal(state[2], revocations[0], 'PRIVATE_SNAPSHOT_REVOCATION_SEQUENCE');
  assert.ok(BigInt(revocations[1]) === 0n || BigInt(revocations[1]) === 1n, 'PRIVATE_SNAPSHOT_HALT_BOOLEAN');
  assert.equal(state[2], effects[0], 'PRIVATE_SNAPSHOT_SEQUENCE');
  assert.equal(state[2], history[0], 'PRIVATE_SNAPSHOT_HISTORY_SEQUENCE');
  assert.ok(BigInt(history[2]) >= 1n && BigInt(history[2]) <= 65n, 'PRIVATE_SNAPSHOT_HISTORY_COUNT');
  const small = value => { const n = BigInt(value); assert.ok(n <= 64n, 'PRIVATE_SNAPSHOT_COUNT'); return Number(n); };
  const result = { blockNumber: header.number, blockHash: header.hash, blockTimestamp: BigInt(header.timestamp).toString(),
    epoch: (BigInt(header.timestamp) / 600n).toString(), scope, policy, root: state[0], spentDigest: state[1], stateSequence: BigInt(state[2]).toString(), sequence: BigInt(state[2]).toString(),
    leafCount: small(state[3]), spentCount: small(state[4]), liveReservations: small(state[5]), liveOutputNotes: small(state[6]),
    leaves: state.slice(7, 71), nullifiers: state.slice(71), solEffectDigest: effects[1], btcEffectDigest: effects[2],
    revocationCoverageHalted: BigInt(revocations[1]) === 1n, solRevokedDigest: revocations[2], solRevokedCount: small(revocations[3]), solRevokedEffects: revocations.slice(4),
    rootHistoryDigest: history[1], rootHistoryCount: Number(BigInt(history[2])), rootHistory: history.slice(3),
    solEffectCount: small(effects[3]), btcEffectCount: small(effects[4]), solEffects: effects.slice(5, 69), btcEffects: effects.slice(69),
  };
  assert.ok(result.leaves.slice(result.leafCount).every(leaf => leaf === ZERO_NOTE_HASH), 'PRIVATE_TREE_PADDING');
  assert.equal(new PrivateNoteTree(result.leaves.slice(0, result.leafCount)).root, result.root, 'PRIVATE_CANONICAL_ROOT');
  assert.equal(privateSpentDigest(scope, result.nullifiers, result.spentCount), result.spentDigest, 'PRIVATE_CANONICAL_SPENT');
  assert.equal(privateEffectDigest('SOL', scope, result.solEffects, result.solEffectCount), result.solEffectDigest, 'PRIVATE_CANONICAL_SOL_EFFECTS');
  assert.equal(privateEffectDigest('BTC', scope, result.btcEffects, result.btcEffectCount), result.btcEffectDigest, 'PRIVATE_CANONICAL_BTC_EFFECTS');
  assertPrivateRootHistory(result);
  assertPrivateAssemblyRevocations(result);
  assertPrivateNoteHeadroom(result);
  return result;
}
