/** One offline hash comparison on a freshly owned fake EVM. Run only through
 * run-hash-conformance.mjs after source review; this never generates proofs. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSoliditySources } from '../proof-workers/solidity-compiler.mjs';
import { createLocalEvm, LOCAL_EVM_PROFILE } from '../../../omnichain-product/src/paeg/local-evm.mjs';
import { createFraming, FIELD_MODULUS, PROFILE } from '../../candidate-poseidon/src/framing.mjs';
import { loadPinned, verifyAPI, LIMITS } from '../../candidate-poseidon/src/component-tooling.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SCRIPT = join(ROOT, 'flat-wallet/scripts/hash-conformance.mjs');
const SUPERVISOR = join(ROOT, 'flat-wallet/scripts/run-hash-conformance.mjs');
const ATTEMPT = join(ROOT, 'flat-wallet/.local/hash-conformance', `attempt-${process.ppid}`);
const ZERO = '0'.repeat(64), R = FIELD_MODULUS;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const word = value => {
  const n = typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? BigInt('0x' + value) : BigInt(value);
  assert.ok(n >= 0n && n < (1n << 256n), 'HASH_ABI_UINT256');
  return n.toString(16).padStart(64, '0');
};
const raw = value => Buffer.from(word(value), 'hex');
const b32 = byte => byte.repeat(32);
const bigint = value => BigInt('0x' + value);
const SIG = Object.freeze({
  hash: 'hash(uint256[])',
  domain: 'domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)',
  revoked: 'revokedDigest(uint256,bytes32,bytes32[64],uint256)',
  auth: 'authorizationLeaf(uint256,uint256)', receipt: 'receiptLeaf(uint256,bytes32)',
  empty: 'emptyLeaf(uint256,uint256)', node: 'nodeHash(uint256,uint256,uint256,uint256,uint256)',
  evidence: 'evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
  admission: 'admissionRevocationState(uint256,uint256,uint256,uint256)',
});

function regular(path) {
  assert.equal(realpathSync(path), resolve(path), 'HASH_SOURCE_SYMLINK');
  assert.ok(lstatSync(path).isFile(), 'HASH_SOURCE_REGULAR');
  return readFileSync(path);
}
function authenticate() {
  assert.equal(process.platform, 'linux', 'HASH_LINUX_ONLY');
  assert.deepEqual(process.argv.slice(1), [SCRIPT], 'HASH_FIXED_WORKER_ARGUMENTS');
  assert.deepEqual(process.execArgv, [], 'HASH_NO_NODE_ARGUMENTS');
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH'], 'HASH_CLEAN_ENVIRONMENT');
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  assert.equal(realpathSync(process.cwd()), ROOT, 'HASH_WORKER_CWD');
  assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath), 'HASH_PARENT_EXECUTABLE');
  assert.equal(realpathSync(`/proc/${process.ppid}/cwd`), ROOT, 'HASH_PARENT_CWD');
  const argv = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(argv.length, 2, 'HASH_PARENT_ARGUMENTS');
  assert.equal(realpathSync(resolve(ROOT, argv[1])), SUPERVISOR, 'HASH_FIXED_SUPERVISOR');
  const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
  const tail = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  assert.equal(Number(tail[1]), process.ppid, 'HASH_ACTUAL_PARENT');
  assert.equal(Number(tail[2]), process.pid, 'HASH_OWNED_PROCESS_GROUP');
  assert.equal(Number(tail[3]), process.pid, 'HASH_OWNED_SESSION');
  assert.equal(realpathSync(ATTEMPT), ATTEMPT, 'HASH_FIXED_ATTEMPT');
  const lock = JSON.parse(regular(join(ROOT, 'flat-wallet/.local/hash-conformance/active.lock')));
  assert.equal(lock.pid, process.ppid, 'HASH_SUPERVISOR_LOCK');
  return { supervisorPID: process.ppid, workerPID: process.pid };
}

let runtime, backend, framing, interrupted = false;
let result = { format: 'FLAT_WALLET_HASH_CONFORMANCE_V1', classification: 'HASH_CONFORMANCE_INCOMPLETE',
  success: false, phase: 'initializing', startedAt: new Date().toISOString(),
  proofGenerated: false, nativeFunds: false, publicNetwork: false,
  positive: [], negative: [], cleanup: { closedAnvil: false } };
const save = () => {
  const temporary = join(ATTEMPT, 'result.json.tmp');
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, join(ATTEMPT, 'result.json'));
};
const checkpoint = () => { assert.equal(interrupted, false, 'HASH_INTERRUPTED'); };
const onSignal = () => { interrupted = true; };
const safeError = error => ({ name: /^[A-Za-z]+$/.test(error.name) ? error.name : 'Error',
  code: typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null,
  reason: String(error.message).match(/\bHASH_[A-Z0-9_]+\b/)?.[0]
    ?? String(error.message).match(/\bSOLIDITY_[A-Z0-9_]+\b/)?.[0] ?? 'HASH_CHECK_FAILED',
  compilerErrorCodes: (error.compilerErrors ?? []).map(item => String(item.errorCode ?? item.type)) });

try {
  result.supervisor = authenticate();
  process.on('SIGTERM', onSignal); process.on('SIGINT', onSignal);
  save();
  const sourceMap = {};
  for (const name of ['Poseidon2.sol', 'Poseidon2Domains.sol', 'Poseidon2Conformance.sol']) {
    const path = 'contracts/crypto/' + name;
    const content = regular(join(ROOT, 'flat-wallet', path)).toString('utf8');
    sourceMap[path] = { content, sha256: sha(content) };
  }
  result.soliditySources = Object.entries(sourceMap).map(([name, record]) =>
    ({ name, sha256: record.sha256, bytes: Buffer.byteLength(record.content) }));
  result.executionSources = [SCRIPT, SUPERVISOR,
    join(ROOT, 'flat-wallet/proof-workers/solidity-compiler.mjs'),
    join(ROOT, 'candidate-poseidon/src/framing.mjs'),
    join(ROOT, 'candidate-poseidon/src/component-tooling.mjs'),
    join(ROOT, '../omnichain-product/src/paeg/local-evm.mjs'),
    join(ROOT, '../omnichain-product/src/chains/runtime-harness.mjs')].map(path => {
      const bytes = regular(path); return { path: resolve(path), bytes: bytes.length, sha256: sha(bytes) };
    });
  result.phase = 'compiling'; save(); checkpoint();
  const compiled = compileSoliditySources(sourceMap);
  const contract = compiled.contracts['contracts/crypto/Poseidon2Conformance.sol'].Poseidon2Conformance;
  for (const part of ['bytecode', 'deployedBytecode']) {
    assert.deepEqual(contract.evm[part].linkReferences, {}, 'HASH_NO_LINK_REFERENCES');
    assert.match(contract.evm[part].object, /^(?:[0-9a-f]{2})+$/, 'HASH_CANONICAL_BYTECODE');
  }
  assert.deepEqual(contract.evm.deployedBytecode.immutableReferences ?? {}, {}, 'HASH_NO_IMMUTABLES');
  const creation = Buffer.from(contract.evm.bytecode.object, 'hex');
  const deployed = Buffer.from(contract.evm.deployedBytecode.object, 'hex');
  assert.ok(deployed.length <= 24576, 'HASH_EIP170_CODE_SIZE');
  assert.ok(creation.length <= 49152, 'HASH_EIP3860_INIT_CODE_SIZE');
  result.compilation = { compiler: compiled.compiler, settings: compiled.settings, sources: compiled.sources,
    milliseconds: compiled.milliseconds, creationBytes: creation.length, creationSHA256: sha(creation),
    runtimeBytes: deployed.length, runtimeSHA256: sha(deployed), eip170Maximum: 24576,
    warnings: compiled.warnings.map(item => ({ severity: item.severity, type: item.type, errorCode: item.errorCode })) };
  writeFileSync(join(ATTEMPT, 'creation.hex'), creation.toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(join(ATTEMPT, 'runtime.hex'), deployed.toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  const selectors = contract.evm.methodIdentifiers;
  for (const signature of Object.values(SIG)) assert.match(selectors[signature], /^[0-9a-f]{8}$/, 'HASH_ABI_SELECTOR');
  const encode = (signature, words) => '0x' + selectors[signature] + words.map(word).join('');
  const hashCall = fields => encode(SIG.hash, [32n, BigInt(fields.length), ...fields]);
  const positives = [], negatives = [];
  const add = (name, signature, words, expected, oracle = 'frozen-host-framing') => {
    assert.match(expected, /^[0-9a-f]{64}$/, 'HASH_EXPECTED_FIELD');
    assert.ok(bigint(expected) < R, 'HASH_EXPECTED_CANONICAL');
    positives.push({ name, data: encode(signature, words), expected, oracle });
  };
  const bad = (name, signature, words, error, errorArgs = []) =>
    negatives.push({ name, data: encode(signature, words), error, errorArgs });

  result.phase = 'building-bb-vectors'; save(); checkpoint();
  assert.equal(LIMITS.maximumPages, 32768, 'HASH_FIXED_WASM_PAGES');
  const bbPackage = join(ROOT, '../omnichain-product/experiments/private-core-proof/node_modules/@aztec/bb.js/package.json');
  assert.equal(JSON.parse(regular(bbPackage)).version, '5.2.0', 'HASH_BB_VERSION');
  const bb = await loadPinned('@aztec/bb.js');
  result.bb = { version: '5.2.0', backend: 'Wasm', threads: 1, skipSrsInit: true,
    memory: { initial: 37, maximum: 32768 }, apiPins: verifyAPI() };
  backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
    skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
  const bbHash = async fields => {
    for (const value of fields) assert.ok(value >= 0n && value < R, 'HASH_BB_CANONICAL_INPUT');
    return Buffer.from((await backend.poseidon2Hash({ inputs: fields.map(raw) })).hash).toString('hex');
  };
  for (const length of [0, 1, 2, 3, 4, 6, 7, 8, 9, 14, 18, 137]) {
    const fields = Array.from({ length }, (_, i) => i % 3 === 0 ? R - 1n - BigInt(i) : BigInt(i));
    positives.push({ name: `raw-mixed-length-${length}`, data: hashCall(fields),
      expected: await bbHash(fields), oracle: 'bb.js-5.2.0-fixed-length' });
  }
  for (const length of [3, 6]) {
    const fields = Array(length).fill(0n);
    positives.push({ name: `raw-zero-exact-rate-${length}`, data: hashCall(fields),
      expected: await bbHash(fields), oracle: 'bb.js-5.2.0-fixed-length' });
  }
  const admissionDomain = 17n, admissionDigest = R - 2n;
  for (const [count, sequence] of [[0n, 0n], [64n, (1n << 64n) - 1n]]) {
    const payload = [admissionDomain, admissionDigest, count, sequence];
    add(`admission-state-${count}`, SIG.admission, payload,
      await bbHash([PROFILE, 1n, 18n, 4n, ...payload]), 'bb.js-5.2.0-purpose18-frozen-schema');
  }
  await backend.destroy(); backend = null;

  result.phase = 'building-frozen-host-vectors'; save(); checkpoint();
  framing = await createFraming();
  const domain = { scope: b32('81'), policy: b32('92'), asset: b32('a3'), hubDomain: b32('b4'),
    registryCommitment: b32('c5'), verifierSetCommitment: b32('d6'), ledgerNamespace: b32('e7') };
  const domainWords = Object.values(domain), D = await framing.domainCommitment(domain);
  add('domain-seven-high-bit-identities', SIG.domain, domainWords, D);
  const alternate = { ...domain, ledgerNamespace: b32('e8') };
  const alternateD = await framing.domainCommitment(alternate);
  assert.notEqual(D, alternateD, 'HASH_NAMESPACE_SEPARATION');
  add('domain-alternate-namespace', SIG.domain, Object.values(alternate), alternateD);
  const entries = Array.from({ length: 64 }, (_, i) => word((1n << 255n) + BigInt(i + 1)));
  let revoked;
  for (const count of [0, 1, 64]) {
    const vector = entries.map((value, i) => i < count ? value : ZERO);
    revoked = await framing.revocationDigest({ domain: D, hub: domain.hubDomain, entries: vector, count: String(count) });
    add(`revoked-count-${count}`, SIG.revoked, [D, domain.hubDomain, ...vector, count], revoked);
  }
  const E = word(R - 3n), shaCM = b32('fe');
  const authLeaf = await framing.authorizationLeaf({ domain: D, envelope: E });
  const receiptLeaf = await framing.receiptLeaf({ domain: D, receiptCommitment: shaCM });
  add('authorization-occupied', SIG.auth, [D, E], authLeaf);
  add('receipt-raw-sha-high-bits', SIG.receipt, [D, shaCM], receiptLeaf);
  const roots = [];
  for (const [kind, depth] of [[0, 6], [1, 4], [2, 6]]) {
    let empty = await framing.emptyLeaf({ domain: D, treeKind: kind });
    add(`empty-leaf-kind-${kind}`, SIG.empty, [D, kind], empty);
    for (let level = 1; level <= depth; ++level) {
      const parent = await framing.nodeHash({ domain: D, treeKind: kind, level, left: empty, right: empty });
      add(`empty-tree-kind-${kind}-level-${level}`, SIG.node, [D, kind, level, empty, empty], parent);
      empty = parent;
    }
    roots[kind] = empty;
  }
  for (const [kind, leaf] of [[0, authLeaf], [2, receiptLeaf]]) {
    const empty = await framing.emptyLeaf({ domain: D, treeKind: kind });
    const leaves = Array(64).fill(empty); leaves[5] = leaf;
    const tree = await framing.merkle({ domain: D, treeKind: kind, leaves });
    const { siblings } = tree.path(5);
    let current = leaf;
    for (let level = 1; level <= 6; ++level) {
      const rightSide = ((5 >> (level - 1)) & 1) === 1;
      const left = rightSide ? siblings[level - 1] : current;
      const right = rightSide ? current : siblings[level - 1];
      const parent = await framing.nodeHash({ domain: D, treeKind: kind, level, left, right });
      add(`occupied-path-kind-${kind}-level-${level}`, SIG.node, [D, kind, level, left, right], parent);
      current = parent;
    }
    assert.equal(current, tree.root, 'HASH_HOST_PATH_ROOT');
  }
  const state = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: roots[2], receiptCount: '64', revokedDigest: revoked,
    revokedCount: '64', revocationSequence: ((1n << 64n) - 1n).toString() };
  const stateWords = [D, state.hubDomain, state.registryCommitment, state.receiptRoot,
    state.receiptCount, state.revokedDigest, state.revokedCount, state.revocationSequence];
  add('evidence-state-boundaries', SIG.evidence, stateWords,
    await framing.evidenceDigest({ domain: D, state }));
  const zeroChild = await framing.nodeHash({ domain: D, treeKind: 0, level: 1, left: ZERO, right: ZERO });
  add('node-zero-field-children', SIG.node, [D, 0, 1, 0, 0], zeroChild);
  await framing.destroy(); framing = null;

  for (const alias of [R, R + 1n])
    negatives.push({ name: `raw-field-${alias === R ? 'r' : 'x-plus-r'}`, data: hashCall([alias]),
      error: 'NonCanonicalField(uint256,uint256)', errorArgs: [0n, alias] });
  for (const value of [0n, R, R + 1n]) bad(`domain-range-${value}`, SIG.empty, [value, 0], 'InvalidDomain()');
  bad('envelope-zero', SIG.auth, [D, 0], 'EmptyCommitment()');
  bad('envelope-r-alias', SIG.auth, [D, R + 1n], 'NonCanonicalField()');
  bad('receipt-zero', SIG.receipt, [D, ZERO], 'EmptyCommitment()');
  for (const kind of [3n, 256n]) bad(`kind-${kind}`, SIG.empty, [D, kind], 'InvalidTreeKind()');
  for (const [kind, level] of [[0, 0], [0, 7], [1, 5], [2, 7], [0, 256]])
    bad(`level-${kind}-${level}`, SIG.node, [D, kind, level, 0, 0], 'InvalidTreeLevel()');
  bad('node-left-r', SIG.node, [D, 0, 1, R, 0], 'NonCanonicalField()');
  bad('node-right-x-plus-r', SIG.node, [D, 0, 1, 0, R + 1n], 'NonCanonicalField()');
  for (let i = 0; i < 7; ++i) {
    const values = domainWords.slice(); values[i] = ZERO;
    bad(`zero-domain-identity-${i}`, SIG.domain, values, 'EmptyCommitment()');
  }
  const emptyVector = Array(64).fill(ZERO);
  bad('revoked-count-65', SIG.revoked, [D, domain.hubDomain, ...emptyVector, 65], 'InvalidCount()');
  bad('revoked-zero-live', SIG.revoked, [D, domain.hubDomain, ...emptyVector, 1], 'InvalidRevokedEntry(uint256)', [0]);
  const tail = emptyVector.slice(); tail[63] = entries[0];
  bad('revoked-nonzero-tail', SIG.revoked, [D, domain.hubDomain, ...tail, 0], 'InvalidRevokedEntry(uint256)', [63]);
  const duplicate = emptyVector.slice(); duplicate[0] = entries[0]; duplicate[1] = entries[0];
  bad('revoked-duplicate-live', SIG.revoked, [D, domain.hubDomain, ...duplicate, 2],
    'DuplicateRevokedEntry(uint256,uint256)', [0, 1]);
  for (const index of [4, 6]) {
    const values = stateWords.slice(); values[index] = 65;
    bad(`evidence-count-index-${index}`, SIG.evidence, values, 'InvalidCount()');
  }
  const sequenceOverflow = stateWords.slice(); sequenceOverflow[7] = 1n << 64n;
  bad('evidence-sequence-overflow', SIG.evidence, sequenceOverflow, 'InvalidSequence()');
  bad('admission-count-65', SIG.admission, [D, revoked, 65, 0], 'InvalidCount()');
  bad('admission-sequence-overflow', SIG.admission, [D, revoked, 1, 1n << 64n], 'InvalidSequence()');
  bad('admission-digest-r', SIG.admission, [D, R, 0, 0], 'NonCanonicalField()');
  result.plannedCases = { positive: positives.length, negative: negatives.length };

  result.phase = 'starting-owned-evm'; save(); checkpoint();
  runtime = await createLocalEvm();
  const health = await runtime.health(), genesis = await runtime.block('0x0');
  assert.equal(health.chainId, '31337', 'HASH_CHAIN_ID');
  assert.equal(genesis.number, '0x0', 'HASH_FRESH_GENESIS');
  assert.equal(genesis.hash, health.genesisHash, 'HASH_GENESIS_IDENTITY');
  assert.equal(BigInt(genesis.timestamp), BigInt(LOCAL_EVM_PROFILE.genesisTimestamp), 'HASH_GENESIS_TIME');
  assert.deepEqual(genesis.transactions, [], 'HASH_EMPTY_GENESIS');
  result.runtime = { profile: LOCAL_EVM_PROFILE, chainId: health.chainId, genesisHash: health.genesisHash,
    genesisTimestamp: BigInt(genesis.timestamp).toString(), binaryPin: runtime.metadata.runtimePin,
    processId: runtime.metadata.processId, ownedScratchRetained: true };
  const deployment = await runtime.send('hash-conformance-deploy', { data: '0x' + creation.toString('hex') });
  assert.match(deployment.contractAddress, /^0x[0-9a-f]{40}$/i, 'HASH_DEPLOYMENT_ADDRESS');
  const address = deployment.contractAddress;
  const code = await runtime.code(address);
  assert.equal(code, '0x' + deployed.toString('hex'), 'HASH_DEPLOYED_RUNTIME_BYTES');
  result.deployment = { runtimeSHA256: sha(Buffer.from(code.slice(2), 'hex')), runtimeBytes: (code.length - 2) / 2,
    gasUsed: BigInt(deployment.gasUsed).toString(), blockHash: deployment.blockHash };
  result.phase = 'comparing-positive-vectors'; save();
  for (const test of positives) {
    checkpoint();
    result.activeCase = test.name; save();
    const output = await runtime.call({ to: address, data: test.data });
    assert.match(output, /^0x[0-9a-f]{64}$/, 'HASH_SOLIDITY_RETURN_BYTES');
    assert.equal(output.slice(2), test.expected, 'HASH_CROSS_LANGUAGE_MISMATCH');
    const receipt = await runtime.send(test.name, { to: address, data: test.data });
    result.positive.push({ name: test.name, oracle: test.oracle, expected: test.expected,
      actual: output.slice(2), calldataSHA256: sha(Buffer.from(test.data.slice(2), 'hex')),
      gasUsed: BigInt(receipt.gasUsed).toString(), blockHash: receipt.blockHash });
    save();
  }
  result.phase = 'checking-exact-reverts'; save();
  const errorSelectors = new Map();
  for (const test of negatives) {
    checkpoint();
    result.activeCase = test.name; save();
    if (!errorSelectors.has(test.error)) {
      const digest = await runtime.keccak('0x' + Buffer.from(test.error, 'ascii').toString('hex'));
      assert.match(digest, /^0x[0-9a-f]{64}$/, 'HASH_ERROR_SIGNATURE_HASH');
      errorSelectors.set(test.error, digest.slice(0, 10));
    }
    const selector = errorSelectors.get(test.error);
    const receipt = await runtime.send(test.name, { to: address, data: test.data }, '0x0', selector);
    const entry = runtime.receipts.at(-1);
    const expectedData = selector + test.errorArgs.map(word).join('');
    assert.equal(entry.revert.data, expectedData, 'HASH_EXACT_REVERT_DATA');
    result.negative.push({ name: test.name, expectedError: test.error, selector,
      exactRevertData: entry.revert.data, calldataSHA256: sha(Buffer.from(test.data.slice(2), 'hex')),
      gasUsed: BigInt(receipt.gasUsed).toString(), blockHash: receipt.blockHash });
    save();
  }
  result.activeCase = null;
  await runtime.health(); checkpoint();
  result.phase = 'closing-owned-runtime'; save();
} catch (error) {
  result.failure = safeError(error); result.phase = 'failed'; process.exitCode = 1;
} finally {
  for (const [name, item] of [['bb', backend], ['framing', framing]]) {
    if (item) try { await item.destroy(); } catch (error) {
      result.cleanup[name + 'Error'] = safeError(error); process.exitCode = 1;
    }
  }
  if (runtime) {
    try {
      const status = await runtime.close();
      assert.equal(status.exitObserved, true, 'HASH_ANVIL_EXIT_EVENT');
      assert.equal(status.stopped, true, 'HASH_ANVIL_STOPPED');
      assert.ok(status.signal === 'SIGTERM' || (status.signal === null && status.exitCode === 0), 'HASH_ANVIL_CLEAN_EXIT');
      result.cleanup.closedAnvil = true; result.cleanup.anvilExit = status;
    } catch (error) { result.cleanup.anvilError = safeError(error); process.exitCode = 1; }
  }
  if (interrupted) { result.failure ??= { reason: 'HASH_INTERRUPTED' }; process.exitCode = 1; }
  const countsMatch = result.positive.length === result.plannedCases?.positive
    && result.negative.length === result.plannedCases?.negative;
  result.success = process.exitCode !== 1 && !result.failure && result.cleanup.closedAnvil && countsMatch;
  result.classification = result.success ? 'HASH_CONFORMANCE_SUCCESS' : 'HASH_CONFORMANCE_INCOMPLETE';
  result.phase = result.success ? 'completed' : 'failed';
  result.completedAt = new Date().toISOString();
  result.disclosure = 'Synthetic local hash/ABI conformance and observed transaction gas only. No proof generation, wallet acceptance, native finality, total latency or inherited audit claim.';
  if (!result.success) process.exitCode = 1;
  try { save(); } catch { process.exitCode = 1; }
  process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
}
console.log(JSON.stringify({ classification: result.classification, success: result.success,
  positive: result.positive.length, negative: result.negative.length }));
