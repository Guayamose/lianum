/** Trusted local bootstrap. This module never starts an EVM or owns its
 * lifecycle. Only a golden createLocalEvm capability can receive deployments.
 * Importing it loads no artifacts, compiler, prover, backend or runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evmFunctionSelector } from '../../../chains/evm/contracts/evm-code-hash.mjs';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments,
  nativeProofCalldata } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { linkPrivateBytecode } from '../../../../../engine/src/notes/private-asset-runtime.mjs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry } from '../../../../../engine/src/evidence/native-quorum.mjs';
import { exactRecord, fixedArray, canonicalField, PROFILE_FIELD } from '../../../execution/encoding/commitments.mjs';
import { FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER, buildFlatDeploymentPlan } from './deployment-plan.mjs';
import { loadFlatDeploymentArtifacts } from './deployment-artifacts.mjs';
import { loadAppendOnlyDeploymentArtifacts, loadAppendOnlyLedgerArtifacts } from './append-only-deployment-artifacts.mjs';
import { APPEND_ONLY_BUILD_PIN, buildAppendOnlyDeploymentPlan, buildAppendOnlySuccessorPlan } from './append-only-deployment-plan.mjs';
// Source-only gate. Only a separately reviewed local-acceptance release may replace
// this literal; neither options nor environment variables can enable deployment.
const APPEND_ONLY_LOCAL_ACCEPTANCE_RELEASE = null;
const appendOnlyRegistries = new WeakMap();

import { assertOwnedPoolAsset, createNativePoolAsset } from '../../../chains/shared/contracts/owned-pool-asset.mjs';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const ownedSystems = new WeakMap(), activeDeployments = new WeakSet();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const keccak = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const encodedWords = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
const digest = value => { assert.match(value, /^0x[0-9a-f]{64}$/, 'FLAT_DEPLOY_DIGEST'); return value; };
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/, 'FLAT_DEPLOY_ADDRESS'); return value; };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
      if (Object.hasOwn(descriptor, 'value')) freeze(descriptor.value);
    Object.freeze(value);
  }
  return value;
}
// Fresh deployment, appended systems and original recovery share this exact
// immutability/ownership boundary before exposing a system to state readers.
function finalizeOwnedFlatSystem(runtime,system){
  freeze(system);
  ownedSystems.set(system,runtime);
  return system;
}
const canonicalType = input => input.type.startsWith('tuple')
  ? '(' + input.components.map(canonicalType).join(',') + ')' + input.type.slice(5) : input.type;
const libraryType = input => input.type.startsWith('tuple')
  ? input.internalType.replace(/^struct /, '') : input.type;
function method(artifact, signature) {
  const matches = artifact.abi.filter(item => item.type === 'function'
    && [canonicalType, libraryType].some(type => item.name + '(' + item.inputs.map(type).join(',') + ')' === signature));
  assert.equal(matches.length, 1, 'FLAT_DEPLOY_EXACT_ABI_METHOD');
  // Solidity library selectors retain nominal struct names even though their
  // argument words use the same static tuple encoding. Use the actual pinned
  // compiler identifier, never a guessed tuple selector for a library method.
  const identifiers = [canonicalType, libraryType].map(type => matches[0].name + '(' + matches[0].inputs.map(type).join(',') + ')');
  const actualSignature = identifiers.find(key => Object.hasOwn(artifact.evm.methodIdentifiers, key));
  assert.ok(actualSignature, 'FLAT_DEPLOY_COMPILER_METHOD_IDENTIFIER');
  const selector = evmFunctionSelector(actualSignature);
  assert.equal(artifact.evm.methodIdentifiers[actualSignature], selector, 'FLAT_DEPLOY_METHOD_SELECTOR');
  return { abi: matches[0], selector };
}
function staticArguments(inputs, values) {
  fixedArray(values, inputs.length);
  const scalarInputs = [], scalarValues = [];
  function flatten(input, value) {
    const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
    if (fixed) {
      const length = Number(fixed[2]); assert.ok(length <= 128, 'FLAT_DEPLOY_STATIC_ARRAY'); fixedArray(value, length);
      for (const child of value) flatten({ ...input, type: fixed[1] }, child);
    } else if (input.type === 'tuple') {
      exactRecord(value, input.components.map(item => item.name));
      for (const item of input.components) flatten(item, value[item.name]);
    } else {
      assert.equal(input.components, undefined, 'FLAT_DEPLOY_STATIC_SCALAR');
      scalarInputs.push({ type: input.type }); scalarValues.push(value);
    }
  }
  inputs.forEach((input, index) => flatten(input, values[index]));
  return nativeStaticArguments(scalarInputs, scalarValues);
}
function staticData(artifact, signature, args = []) {
  const entry = method(artifact, signature);
  return '0x' + entry.selector + staticArguments(entry.abi.inputs, args).slice(2);
}

/** The exact object returned after all deployment and storage checks, bound
 * to the exact still-owned runtime. A copied object/address list never passes. */
export function assertOwnedFlatSystem(runtime, system) {
  assert.ok(ownedSystems.has(system) && ownedSystems.get(system) === runtime, 'FLAT_OWNED_SYSTEM_CAPABILITY_REQUIRED');
}

function checkedOptions(runtime, options) {
  const required = ['deploymentDomain', 'registryEpoch', 'rulesRoot', 'attesterKeys', 'pools'];
  exactRecord(options, [...required, ...(Object.hasOwn(options, 'onDeployment') ? ['onDeployment'] : []),
    ...(Object.hasOwn(options, 'nativeClaimBootstrap') ? ['nativeClaimBootstrap'] : [])]);
  const deploymentDomain = digest(options.deploymentDomain), rulesRoot = digest(options.rulesRoot);
  assert.ok(deploymentDomain !== ZERO32 && rulesRoot !== ZERO32, 'FLAT_DEPLOY_NONZERO_HUB_IDENTITY');
  assert.equal(typeof options.registryEpoch, 'string');
  fixedArray(options.attesterKeys, 4);
  options.attesterKeys.forEach(key => exactRecord(key, ['x', 'y']));
  const registry = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE,
    hubDomain: ZERO32.slice(2), registryEpoch: options.registryEpoch, rulesRoot: rulesRoot.slice(2), keys: options.attesterKeys });
  fixedArray(options.pools, 2);
  const pools = options.pools.map(pool => {
    exactRecord(pool, ['policy', 'deploymentDomain', ...(Object.hasOwn(pool, 'assetCapability') ? ['assetCapability'] : [])]);
    const policy = digest(pool.policy), deploymentDomain = digest(pool.deploymentDomain);
    assert.ok(policy !== ZERO32 && deploymentDomain !== ZERO32, 'FLAT_DEPLOY_NONZERO_POOL_IDENTITY');
    if (Object.hasOwn(pool, 'assetCapability')) assertOwnedPoolAsset(runtime, pool.assetCapability);
    return { policy, deploymentDomain, assetCapability: pool.assetCapability,
      asset: pool.assetCapability?.metadata.address ?? ZERO_ADDRESS,
      assetCodeHash: pool.assetCapability?.metadata.codeHash ?? ZERO32 };
  });
  assert.notEqual(pools[0].policy, pools[1].policy, 'FLAT_DEPLOY_DISTINCT_POOL_POLICIES');
  assert.notEqual(pools[0].deploymentDomain, pools[1].deploymentDomain, 'FLAT_DEPLOY_DISTINCT_POOL_DOMAINS');
  const onDeployment = options.onDeployment ?? (async () => {});
  assert.equal(typeof onDeployment, 'function', 'FLAT_DEPLOY_CALLBACK');
  return { deploymentDomain, rulesRoot, registryEpoch: registry.registryEpoch, attesterKeys: registry.keys,
    pools, onDeployment, nativeClaimBootstrap: options.nativeClaimBootstrap ?? null };
}
function viewFacade(runtime, record, artifact) {
  const facade = { ...record, artifact, selectors: artifact.evm.methodIdentifiers,
    data: (signature, args = []) => staticData(artifact, signature, args),
    call: async (signature, args = [], block = 'latest') => {
      const entry = method(artifact, signature);
      assert.ok(['view', 'pure'].includes(entry.abi.stateMutability), 'FLAT_DEPLOY_READ_ONLY_METHOD');
      // Reuse only this synchronous resolution; arguments and every RPC remain fresh.
      return runtime.call({ to: record.address, data: '0x' + entry.selector + staticArguments(entry.abi.inputs, args).slice(2) }, block);
    } };
  return facade;
}
async function unchangedHead(runtime, header) {
  await runtime.assertCanonical(header);
  const current = await runtime.block();
  assert.equal(current.number, header.number, 'FLAT_DEPLOY_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'FLAT_DEPLOY_HEAD_CHANGED');
}
async function expectedCodeAt(runtime, record, block) {
  const actual = await runtime.code(record.address, block);
  assert.equal(actual.toLowerCase(), record.expectedCode, 'FLAT_DEPLOY_COMPLETE_RUNTIME_MISMATCH');
  assert.equal(keccak(actual), record.codeHash, 'FLAT_DEPLOY_RUNTIME_HASH_MISMATCH');
}
function rawWords(raw, count) {
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'FLAT_DEPLOY_RETURN_WORDS');
  assert.equal(raw.length, 2 + 64 * count, 'FLAT_DEPLOY_RETURN_LENGTH');
  return Array.from({ length: count }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
function legacyEmptyTree() {
  const nodes = Array(128).fill(ZERO32);
  for (let index = 63; index > 0; index--) nodes[index] = '0x' + sha(Buffer.from('01' + nodes[index * 2].slice(2) + nodes[index * 2 + 1].slice(2), 'hex'));
  return nodes;
}
async function emptyP2Tree(library, domain, kind, block) {
  const nodes = Array(128).fill(ZERO32);
  let empty = await library.call('emptyLeaf(uint256,uint256)', [domain, kind], block);
  canonicalField(rawWords(empty, 1)[0].slice(2));
  for (let index = 64; index < 128; index++) nodes[index] = empty;
  for (let level = 1; level <= 6; level++) {
    empty = await library.call('nodeHash(uint256,uint256,uint256,uint256,uint256)', [domain, kind, level, empty, empty], block);
    canonicalField(rawWords(empty, 1)[0].slice(2));
    const start = 64 >> level;
    for (let index = start; index < 2 * start; index++) nodes[index] = empty;
  }
  return nodes;
}

async function assertConstructorStorage(runtime, hub, pools, libraries, verifiers, generatedLibraries, plan) {
  const header = await runtime.block(), block = header.number;
  const expect = async (target, signature, args, values) => {
    assert.equal((await target.call(signature, args, block)).toLowerCase(), encodedWords(values), 'FLAT_DEPLOY_STORAGE_' + signature);
  };
  for (const target of [hub, ...pools, ...Object.values(libraries), ...Object.values(verifiers), ...generatedLibraries])
    await expectedCodeAt(runtime, target, block);
  const configWords = plan.verifierSet.pins.flatMap(pin => [pin.verifier, pin.codeHash]);
  configWords.push(plan.verifierSet.poseidon2Domains, plan.verifierSet.poseidon2DomainsCodeHash,
    plan.verifierSet.hubCodec, plan.verifierSet.hubCodecCodeHash);
  for (const [key, value] of Object.entries({ ...plan.hub.immutableValues,
    pool0CodeHash: plan.pools[0].codeHash, pool1CodeHash: plan.pools[1].codeHash })) {
    // This private immutable is authenticated by the full expected runtime.
    if (key !== 'claimAuthorityCodeHash') await expect(hub, key + '()', [], [value]);
  }
  await expect(hub, 'verifierConfiguration()', [], configWords);
  for (let index = 0; index < 4; index++) {
    const key = plan.registry.keys[index];
    const signer = '0x' + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex');
    await expect(hub, 'attester(uint8)', [index], ['0x' + key.x, '0x' + key.y, signer]);
  }
  for (const name of ['totalReservedTagCapacity', 'spentTagCount', 'spentTagSequence', 'revokedCount',
    'revocationSequence', 'halted', 'revocationOverflowDigest', 'revocationOverflowCount', 'checkpointCount'])
    await expect(hub, name + '()', [], [0]);
  await expect(hub, 'stateSequence()', [], [2]);
  if (plan.buildAttempt === APPEND_ONLY_BUILD_PIN.attempt) {
    await expect(hub, 'MAX_REGISTERED_POOLS()', [], [8]);
    await expect(hub, 'CAPACITY()', [], [64]);
    await expect(hub, 'pinnedPoolCount()', [], [2]);
    await expect(hub, 'registeredPoolCount()', [], [2]);
    for (const [index, pool] of pools.entries()) {
      await expect(hub, 'registeredPoolAt(uint256)', [index], [pool.address]);
      await expect(hub, 'pinnedPoolCodeHash(address)', [pool.address], [pool.codeHash]);
    }
  }
  const zero64 = Array(64).fill(ZERO32), legacy = legacyEmptyTree();
  await expect(hub, 'spentTagList()', [], zero64); await expect(hub, 'revokedList()', [], zero64);
  await expect(hub, 'checkpointTreeNodes()', [], legacy);
  await expect(hub, 'checkpointRoot()', [], [legacy[1]]);
  await expect(hub, 'acceptedCheckpointRoots(bytes32)', [legacy[1]], [1]);
  const spentTagDigest = '0x' + sha(Buffer.from('31' + plan.hubDomain.slice(2) + '00000000' + '00'.repeat(32 * 64), 'hex'));
  await expect(hub, 'spentTagDigest()', [], [spentTagDigest]);
  for (const [index, pool] of pools.entries()) {
    const projected = plan.pools[index], domain = projected.domainCommitment;
    for (const [name, value] of Object.entries(projected.immutableValues)) await expect(pool, name + '()', [], [value]);
    await expect(pool, 'verifierConfiguration()', [], configWords);
    await expect(pool, 'EPOCH_SECONDS()', [], [600]);
    for (const name of ['backedAmount', 'leafCount', 'spentCount', 'liveReservations', 'outputCapacity',
      'stateSequence', 'authorizationLeafCount', 'transitionInProgress']) await expect(pool, name + '()', [], [0]);
    await expect(pool, 'canonicalBacking()', [], [0, 0, 0, 0, 0, 0]);
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    const backing = await pool.assetCapability.read({ holder: pool.address, blockNumber: block });
    assert.equal(backing.blockHash, header.hash, 'FLAT_DEPLOY_ASSET_BLOCK_HASH');
    assert.equal(backing.balance, '0', 'FLAT_DEPLOY_UNFUNDED_ASSET');
    assert.equal(await runtime.balance(pool.address, block), 0n, 'FLAT_DEPLOY_UNFUNDED_POOL');
    await expect(pool, 'treeNodes()', [], legacy); await expect(pool, 'currentRoot()', [], [legacy[1]]);
    await expect(pool, 'spentList()', [], zero64); await expect(pool, 'noteLeaves()', [], zero64);
    await expect(pool, 'rootHistoryCount()', [], [1]);
    await expect(pool, 'rootHistory()', [], [legacy[1], ...zero64]);
    await expect(pool, 'acceptedRoots(bytes32)', [legacy[1]], [1]);
    const spentDigest = '0x' + sha(Buffer.from('02' + projected.scope.slice(2) + '00000000' + '00'.repeat(32 * 64), 'hex'));
    const rootHistoryDigest = '0x' + sha(Buffer.from('18' + projected.scope.slice(2) + '00000001'
      + legacy[1].slice(2) + '00'.repeat(32 * 64), 'hex'));
    await expect(pool, 'spentDigest()', [], [spentDigest]);
    await expect(pool, 'rootHistoryDigest()', [], [rootHistoryDigest]);
    const authNodes = await emptyP2Tree(libraries.poseidon2Domains, domain, 0, block);
    await expect(pool, 'authorizationTreeNodes()', [], authNodes);
    await expect(pool, 'authorizationRoot()', [], [authNodes[1]]);
    await expect(pool, 'authorizationRootHistoryCount()', [], [1]);
    await expect(pool, 'authorizationRootHistory()', [], [authNodes[1], ...zero64]);
    await expect(pool, 'acceptedAuthorizationRoots(bytes32)', [authNodes[1]], [1]);
    await expect(hub, 'isRegisteredPool(address)', [pool.address], [1]);
    await expect(hub, 'poolDomain(address)', [pool.address], [domain]);
    await expect(hub, 'domainPool(bytes32)', [domain], [pool.address]);
    await expect(hub, 'reservedTagCapacityByPool(address)', [pool.address], [0]);
    const receiptNodes = await emptyP2Tree(libraries.poseidon2Domains, domain, 2, block);
    const revokedDigest = await libraries.poseidon2Domains.call('revokedDigest(uint256,bytes32,bytes32[64],uint256)',
      [domain, plan.hubDomain, zero64, 0], block);
    canonicalField(rawWords(revokedDigest, 1)[0].slice(2));
    const evidence = await libraries.poseidon2Domains.call('evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
      [domain, { hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment, receiptRoot: receiptNodes[1],
        receiptCount: 0, revokedDigest, revokedCount: 0, revocationSequence: 0 }], block);
    canonicalField(rawWords(evidence, 1)[0].slice(2));
    await expect(hub, 'receiptTreeNodes(bytes32)', [domain], receiptNodes);
    await expect(hub, 'receiptRoot(bytes32)', [domain], [receiptNodes[1]]);
    await expect(hub, 'receiptCount(bytes32)', [domain], [0]);
    await expect(hub, 'revokedDigest(bytes32)', [domain], [revokedDigest]);
    await expect(hub, 'evidenceState(bytes32)', [domain], [evidence]);
    await expect(hub, 'evidenceStateCount(bytes32)', [domain], [1]);
    await expect(hub, 'evidenceStateHistory(bytes32)', [domain], [evidence, ...Array(128).fill(ZERO32)]);
    await expect(hub, 'acceptedReceiptRoots(bytes32,bytes32)', [domain, receiptNodes[1]], [1]);
    await expect(hub, 'recordedEvidenceStates(bytes32,bytes32)', [domain, evidence], [1]);
    await expect(hub, 'evidenceStateRevocationSequence(bytes32,bytes32)', [domain, evidence], [0]);
    await expect(hub, 'isUsable(bytes32,bytes32)', [domain, evidence], [1]);
  }
  await unchangedHead(runtime, header); return freeze({ blockNumber: header.number, blockHash: header.hash,
    constructorStorageMatched: true, completeRuntimesMatched: true, poolsUnfunded: true });
}

/** Deploy exactly the fixed genuine verifier bundle and frozen linked ledgers.
 * Options contain public registry/policy/domain data and an optional receipt
 * observer. Omitted asset capabilities preserve native fake ETH; contract
 * assets must be separately authenticated by the private owned bootstrap. */
export async function deployFlatSystem(runtime, options) {
  return deploySystem(runtime, options, false);
}
export async function deployFlatAppendOnlySystem(runtime, options) {
  assert.ok(APPEND_ONLY_LOCAL_ACCEPTANCE_RELEASE, 'APPEND_ONLY_LOCAL_ACCEPTANCE_NOT_RELEASED');
  assert.equal(Object.hasOwn(options, 'nativeClaimBootstrap'), false, 'APPEND_ONLY_NATIVE_PROFILE_UNSUPPORTED');
  return deploySystem(runtime, options, true);
}
async function deploySystem(runtime, options, appendOnly) {
  const buildPin = appendOnly ? APPEND_ONLY_BUILD_PIN : FLAT_BUILD_PIN;

  await assertLocalEvm(runtime);
  assert.ok(!activeDeployments.has(runtime), 'FLAT_DEPLOY_CONCURRENT_BOOTSTRAP');
  const configuration = checkedOptions(runtime, options), sender = address(runtime.accounts[0]);
  let claimBootstrapModule = null;
  if (configuration.nativeClaimBootstrap) {
    claimBootstrapModule = await import('../claims/deploy-native-claims.mjs');
    claimBootstrapModule.assertOwnedNativeClaimBootstrap(runtime, configuration.nativeClaimBootstrap);
    assert.ok(configuration.pools.every(pool => !pool.assetCapability), 'FLAT_CLAIM_BOOTSTRAP_SELECTS_ASSETS');
  }
  assert.equal(runtime.metadata.chainId, '31337', 'FLAT_DEPLOY_LOCAL_CHAIN');
  const deployments = [], registrationReceipts = [], generatedLibraries = new Map(), visiting = new Set();
  let plan, bundle;
  activeDeployments.add(runtime);
  try {
    let nativeAsset;
    for (const pool of configuration.nativeClaimBootstrap ? [] : configuration.pools) {
      if (!pool.assetCapability) pool.assetCapability = nativeAsset ??= await createNativePoolAsset({ runtime });
      assertOwnedPoolAsset(runtime, pool.assetCapability);
    }
    // Read every asset before any deployment. Only authenticated immutable
    // address/code pins cross into the pure deployment planner below.
    const assetHeader = await runtime.block();
    for (const pool of configuration.nativeClaimBootstrap ? [] : configuration.pools) {
      const observed = await pool.assetCapability.read({ holder: sender, blockNumber: assetHeader.number });
      assert.equal(observed.blockHash, assetHeader.hash, 'FLAT_DEPLOY_ASSET_BLOCK_HASH');
    }
    await unchangedHead(runtime, assetHeader);
    // All generated source/key/compiler validation completes before first send.
    bundle = await (appendOnly ? loadAppendOnlyDeploymentArtifacts() : loadFlatDeploymentArtifacts());
    async function deploy(source, contractName, artifact, immutableNames, immutableValues, links = {}, planned) {
      const nonce = await runtime.nonce(sender, 'pending');
      const target = predictNativeCreateAddress(sender, nonce);
      if (planned) {
        assert.equal(nonce.toString(), planned.nonce, 'FLAT_DEPLOY_NONCE_CHANGED');
        assert.equal(target, planned.address, 'FLAT_DEPLOY_PLANNED_ADDRESS');
      }
      assert.equal(await runtime.code(target), '0x', 'FLAT_DEPLOY_CREATE_ADDRESS_OCCUPIED');
      const astLibrary = contractName !== 'HonkVerifier' && !['PrivateFlatReceiptHub', 'PrivateFlatAssetNotePool', 'PrivateFlatReceiptHubV2', 'PrivateFlatAssetNotePoolV2'].includes(contractName);
      const guardedLibrary = astLibrary && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object);
      const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target, libraries: links,
        immutableNames, immutableValues, isLibrary: guardedLibrary });
      const constructorInputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
      const constructorData = planned?.constructorData ?? staticArguments(constructorInputs, []);
      const creationData = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, links) + constructorData.slice(2);
      assert.ok((creationData.length - 2) / 2 <= 49152, 'FLAT_DEPLOY_INITCODE_LIMIT');
      if (planned) {
        assert.equal(expectedCode, planned.runtimeCode, 'FLAT_DEPLOY_PLANNED_RUNTIME');
        assert.equal(creationData, planned.creationData, 'FLAT_DEPLOY_PLANNED_CREATION');
      }
      const expectedHash = keccak(expectedCode);
      const receipt = await runtime.send('deploy flat ' + source + ':' + contractName, { from: sender, data: creationData });
      assert.equal(address(receipt.contractAddress), target, 'FLAT_DEPLOY_ACTUAL_ADDRESS');
      const records = runtime.transactions.filter(record => record.transactionHash === receipt.transactionHash);
      assert.equal(records.length, 1, 'FLAT_DEPLOY_TRANSACTION_RECORD');
      const transaction = records[0];
      assert.equal(transaction.phase, 'mined'); assert.equal(transaction.request.from, sender);
      assert.equal(BigInt(transaction.senderNonce), nonce); assert.equal(transaction.request.data, creationData);
      assert.equal(BigInt(transaction.request.value ?? '0x0'), 0n, 'FLAT_DEPLOY_NO_VALUE');
      assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'FLAT_DEPLOY_NEXT_NONCE');
      await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
      const record = { source, contractName, address: target, nonce: nonce.toString(), receipt, expectedCode,
        runtimeCode: expectedCode, codeHash: expectedHash, runtimeBytes: (expectedCode.length - 2) / 2,
        libraries: { ...links }, immutableValues, constructorData, creationSHA256: sha(Buffer.from(creationData.slice(2), 'hex')),
        proofAcceptanceClaim: false };
      await expectedCodeAt(runtime, record, receipt.blockNumber);
      assert.equal(await runtime.keccak(expectedCode), expectedHash, 'FLAT_DEPLOY_INDEPENDENT_KECCAK');
      freeze(record); deployments.push(record); await configuration.onDeployment(record); return record;
    }
    const libraries = {};
    for (const role of ['poseidon2Domains', 'hubCodec', ...(appendOnly ? ['poolRegistryCodec'] : [])]) {
      const [source, name] = buildPin.artifacts[role], artifact = bundle.ledger.artifacts[role];
      const links = Object.fromEntries(Object.entries(libraries).map(([name, value]) => {
        const [file, contract] = buildPin.artifacts[name]; return [file + ':' + contract, value.address]; }));
      libraries[role] = viewFacade(runtime, await deploy(source, name, artifact, {}, {}, links), artifact);
    }
    async function verifierLinks(entry, artifact) {
      const links = {};
      for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences]) {
        for (const [source, names] of Object.entries(references ?? {})) for (const name of Object.keys(names)) {
          assert.equal(source, entry.source, 'FLAT_DEPLOY_CROSS_SOURCE_LIBRARY');
          const key = source + ':' + name;
          if (!generatedLibraries.has(key)) {
            assert.ok(!visiting.has(key), 'FLAT_DEPLOY_CYCLIC_LIBRARY'); visiting.add(key);
            const library = entry.contracts[name]; assert.ok(library, 'FLAT_DEPLOY_MISSING_LIBRARY');
            const dependencies = await verifierLinks(entry, library);
            const record = await deploy(source, name, library, {}, {}, dependencies);
            generatedLibraries.set(key, viewFacade(runtime, record, library)); visiting.delete(key);
          }
          links[key] = generatedLibraries.get(key).address;
        }
      }
      return links;
    }
    const verifiers = {};
    for (const [role] of FLAT_VERIFIER_ORDER) {
      const entry = bundle.verifiers[role], links = await verifierLinks(entry, entry.artifact);
      const record = await deploy(entry.source, 'HonkVerifier', entry.artifact, entry.immutableNames, entry.immutableValues, links);
      verifiers[role] = { ...viewFacade(runtime, record, entry.artifact), lineage: entry.lineage };
    }
    let claimAuthority;
    if (claimBootstrapModule) {
      const prepared = await claimBootstrapModule.prepareNativeClaimsBootstrap(configuration.nativeClaimBootstrap, {
        runtime, sender, ledger: bundle.ledger, libraries, verifiers,
        generatedLibraries: Object.fromEntries(generatedLibraries), configuration,
      });
      exactRecord(prepared, ['assetCapabilities', 'claimAuthority']);
      fixedArray(prepared.assetCapabilities, 2);
      const head = await runtime.block();
      for (let index = 0; index < 2; index++) {
        const capability = prepared.assetCapabilities[index];
        assertOwnedPoolAsset(runtime, capability);
        const observed = await capability.read({ holder: sender, blockNumber: head.number });
        assert.equal(observed.blockHash, head.hash, 'FLAT_CLAIM_ASSET_BLOCK');
        configuration.pools[index].assetCapability = capability;
        configuration.pools[index].asset = capability.metadata.address;
        configuration.pools[index].assetCodeHash = capability.metadata.codeHash;
      }
      await unchangedHead(runtime, head);
      claimAuthority = prepared.claimAuthority;
    }
    const planningHeader = await runtime.block();
    await expectedCodeAt(runtime, libraries.poseidon2Domains, planningHeader.number);
    const hashFields = async fields => {
      fixedArray(fields, 18);
      assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, 1n, 14n], 'FLAT_DEPLOY_DOMAIN_PURPOSE');
      const values = [];
      for (let index = 4; index < fields.length; index += 2) {
        const high = fields[index], low = fields[index + 1];
        assert.ok(typeof high === 'bigint' && high >= 0n && high < 1n << 128n
          && typeof low === 'bigint' && low >= 0n && low < 1n << 128n, 'FLAT_DEPLOY_DOMAIN_LIMBS');
        values.push('0x' + high.toString(16).padStart(32, '0') + low.toString(16).padStart(32, '0'));
      }
      const raw = await libraries.poseidon2Domains.call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)', values, planningHeader.number);
      const result = rawWords(raw, 1)[0].slice(2); canonicalField(result, true);
      await unchangedHead(runtime, planningHeader); return result;
    };
    plan = await (appendOnly ? buildAppendOnlyDeploymentPlan : buildFlatDeploymentPlan)({ compilation: bundle.ledger.compilation, sourceMap: bundle.ledger.sourceMap,
      chainId: '31337', sender, nextNonce: (await runtime.nonce(sender, 'pending')).toString(),
      deploymentDomain: configuration.deploymentDomain, registryEpoch: configuration.registryEpoch,
      rulesRoot: configuration.rulesRoot, attesterKeys: configuration.attesterKeys,
      pools: configuration.pools.map(({ assetCapability, ...pool }) => pool),
      libraries: Object.fromEntries(Object.entries(libraries).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
      verifiers: Object.fromEntries(Object.entries(verifiers).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
      ...(claimAuthority ? { claimAuthority } : {}) }, { hashFields });
    await unchangedHead(runtime, planningHeader);
    const hub = viewFacade(runtime, await deploy(...buildPin.artifacts.hub.slice(0, 2), bundle.ledger.artifacts.hub,
      bundle.ledger.immutableNames.hub, plan.hub.immutableValues, plan.links, plan.hub), bundle.ledger.artifacts.hub);
    const pools = [];
    for (const [index, projected] of plan.pools.entries()) {
      const record = await deploy(...buildPin.artifacts.pool.slice(0, 2), bundle.ledger.artifacts.pool,
        bundle.ledger.immutableNames.pool, projected.immutableValues, plan.links, projected);
      const assetCapability = configuration.pools[index].assetCapability;
      pools.push({ ...viewFacade(runtime, record, bundle.ledger.artifacts.pool), ...projected.immutableValues,
        assetCapability, assetMetadata: assetCapability.metadata,
        domain: projected.domain, domainCommitment: projected.domainCommitment });
    }
    for (const pool of pools) {
      const receipt = await runtime.send('register flat pool domain', { from: sender, to: hub.address,
        data: hub.data('registerPoolDomain(address)', [pool.address]) });
      registrationReceipts.push(receipt); await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    }
    const bootstrap = await assertConstructorStorage(runtime, hub, pools, libraries, verifiers, [...generatedLibraries.values()], plan);
    const commonAsset = pools.every(pool => pool.asset === pools[0].asset && pool.assetCodeHash === pools[0].assetCodeHash)
      ? pools[0] : null;
    const system = { ...(appendOnly ? { deploymentProfile: 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2' } : {}),
      classification: 'OWNED_LOCAL_FLAT_SYSTEM_NOT_PROOF_ACCEPTANCE', chainId: '31337', sender,
      plan, hub, pools, libraries, generatedLibraries: Object.fromEntries(generatedLibraries), verifiers,
      registry: plan.registry, hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment,
      verifierSetCommitment: plan.verifierSetCommitment, ledgerNamespace: plan.ledgerNamespace,
      asset: commonAsset?.asset ?? null, assetCodeHash: commonAsset?.assetCodeHash ?? null,
      assetIdentity: commonAsset?.assetIdentity ?? null, assetMetadata: commonAsset?.assetMetadata ?? null,
      assetCapability: commonAsset?.assetCapability ?? null,
      deployments: [...deployments], registrationReceipts: [...registrationReceipts], bootstrap,
      provenance: bundle.provenance,
      verify: async (role, proof, publicInputs, block = 'latest') => {
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        const spec = FLAT_VERIFIER_ORDER.find(([name]) => name === role); assert.ok(spec, 'FLAT_DEPLOY_VERIFIER_ROLE');
        fixedArray(publicInputs, spec[1]);
        const verifier = verifiers[role]; await expectedCodeAt(runtime, verifier, block);
        const raw = await runtime.call({ to: verifier.address,
          data: nativeProofCalldata(verifier.artifact, 'verify(bytes,bytes32[])', proof, publicInputs) }, block);
        assert.ok(raw === encodedWords([0]) || raw === encodedWords([1]), 'FLAT_DEPLOY_VERIFIER_BOOLEAN');
        return raw === encodedWords([1]);
      },
      assetBalance: (holder, block = 'latest') => {
        assert.ok(commonAsset, 'FLAT_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET');
        return commonAsset.assetCapability.balance(holder, block);
      },
      get receipts() { return freeze(structuredClone(runtime.receipts)); },
    };
    finalizeOwnedFlatSystem(runtime,system);
    if (appendOnly) appendOnlyRegistries.set(system, { runtime, initial: system, pools: [...pools],
      systems: [system], pendingPool: null, appendBusy: false, appendFenced: false });
    return system;
  } catch (error) {
    // Observers can throw primitive values or frozen errors. Always attach
    // retained evidence to our own writable error without losing the cause.
    const failure = new Error('FLAT_DEPLOYMENT_FAILED', { cause: error });
    failure.partialDeployments = [...deployments]; failure.registrationReceipts = [...registrationReceipts];
    failure.localReceipts = runtime.receipts; failure.localTransactions = runtime.transactions;
    if (plan) failure.deploymentPlan = plan;
    if (bundle) failure.artifactProvenance = bundle.provenance;
    throw failure;
  } finally { activeDeployments.delete(runtime); }
}

/** Read-only original runtime registry. This cannot brand supplied objects.
 * The array is a snapshot; immutable generation pool arrays never change. */
export function describeOwnedFlatPoolRegistry(runtime, system) {
  assertOwnedFlatSystem(runtime, system);
  const state = appendOnlyRegistries.get(system);
  return Object.freeze({ appendOnly: !!state, pools: Object.freeze([...(state?.pools ?? system.pools), ...(state?.pendingPool ? [state.pendingPool] : [])]),
    appendFenced: state?.appendFenced ?? false, maximumPools: state ? 8 : 2 });
}

/** Appends one same-asset pool and returns a one-pool immutable generation view.
 * It neither creates nor replaces a catalogue, keeper, note, journal or consent.
 * Uncertain mutation fences future append attempts; old capabilities survive. */
export async function appendFlatPoolSuccessor(runtime, system, options) {
  assert.ok(APPEND_ONLY_LOCAL_ACCEPTANCE_RELEASE, 'APPEND_ONLY_LOCAL_ACCEPTANCE_NOT_RELEASED');
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  const state = appendOnlyRegistries.get(system);
  assert.ok(state && state.runtime === runtime, 'APPEND_ONLY_ORIGINAL_SYSTEM_REQUIRED');
  assert.ok(!state.appendBusy && !state.appendFenced, 'APPEND_ONLY_APPEND_FENCED');
  exactRecord(options, ['predecessor', 'deploymentDomain', 'policy']);
  const predecessor = state.pools.find(pool => pool.address === options.predecessor);
  assert.ok(predecessor, 'APPEND_ONLY_REGISTERED_PREDECESSOR');
  const deploymentDomain = digest(options.deploymentDomain), policy = digest(options.policy);
  assert.ok(deploymentDomain !== ZERO32 && policy !== ZERO32, 'APPEND_ONLY_NONZERO_POOL_IDENTITY');
  assert.ok(state.pools.length < 8, 'APPEND_ONLY_EIGHT_POOLS_TOTAL');
  assert.ok(state.pools.every(pool => pool.deploymentDomain !== deploymentDomain), 'APPEND_ONLY_DOMAIN_REUSE');
  assert.ok(!activeDeployments.has(runtime), 'FLAT_DEPLOY_CONCURRENT_BOOTSTRAP');
  activeDeployments.add(runtime); state.appendBusy = true; let mutated = false, candidate = null;
  try {
    const initial = state.initial, { hub, libraries, verifiers } = initial;
    const ledger = loadAppendOnlyLedgerArtifacts();
    const header = await runtime.block();
    for (const record of [hub, predecessor, ...Object.values(libraries), ...Object.values(verifiers),
      ...Object.values(initial.generatedLibraries)]) await expectedCodeAt(runtime, record, header.number);
    assertOwnedPoolAsset(runtime, predecessor.assetCapability);
    const asset = await predecessor.assetCapability.read({ holder: predecessor.address, blockNumber: header.number });
    assert.equal(asset.blockHash, header.hash);
    const expect = async (signature, args, values) => assert.equal(await hub.call(signature, args, header.number),
      encodedWords(values), 'APPEND_ONLY_REGISTRY_' + signature);
    await expect('poolRegistrar()', [], [initial.sender]);
    await expect('halted()', [], [0]);
    await expect('pinnedPoolCount()', [], [state.pools.length]);
    await expect('registeredPoolCount()', [], [state.pools.length]);
    for (const [i, old] of state.pools.entries()) {
      await expect('registeredPoolAt(uint256)', [i], [old.address]);
      await expect('poolDomain(address)', [old.address], [old.domainCommitment]);
      await expect('pinnedPoolCodeHash(address)', [old.address], [old.codeHash]);
    }
    const sourceManifestSHA256 = initial.provenance.sourceManifestSHA256;
    const keyManifestSHA256 = initial.provenance.keyManifestSHA256;
    assert.match(sourceManifestSHA256, /^[0-9a-f]{64}$/); assert.match(keyManifestSHA256, /^[0-9a-f]{64}$/);
    const nonce = await runtime.nonce(initial.sender, 'pending');
    const hashFields = async fields => {
      fixedArray(fields, 18); assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, 1n, 14n]);
      const words = [];
      for (let i = 4; i < fields.length; i += 2) {
        assert.ok(fields[i] >= 0n && fields[i] < 1n << 128n && fields[i+1] >= 0n && fields[i+1] < 1n << 128n);
        words.push('0x' + fields[i].toString(16).padStart(32, '0') + fields[i+1].toString(16).padStart(32, '0'));
      }
      const result = rawWords(await libraries.poseidon2Domains.call(
        'domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)', words, header.number), 1)[0].slice(2);
      canonicalField(result, true); await unchangedHead(runtime, header); return result;
    };
    const projected = await buildAppendOnlySuccessorPlan({ compilation: ledger.compilation, sourceMap: ledger.sourceMap,
      chainId: '31337', sender: initial.sender, nextNonce: (nonce + 1n).toString(),
      hub: { address: hub.address, codeHash: hub.codeHash, hubDomain: initial.hubDomain,
        registryCommitment: initial.registryCommitment, ledgerNamespace: initial.ledgerNamespace },
      verifierSet: initial.plan.verifierSet, verifierSetCommitment: initial.verifierSetCommitment,
      libraries: Object.fromEntries(Object.entries(libraries).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
      pool: { asset: predecessor.asset, assetCodeHash: predecessor.assetCodeHash, deploymentDomain, policy } }, { hashFields });
    assert.equal(projected.assetIdentity, predecessor.assetIdentity, 'APPEND_ONLY_SAME_ASSET');
    assert.ok(state.pools.every(pool => pool.domainCommitment !== projected.domainCommitment), 'APPEND_ONLY_UNIQUE_DOMAIN');
    assert.equal(await runtime.code(projected.address, header.number), '0x', 'APPEND_ONLY_PROSPECTIVE_EMPTY');
    await unchangedHead(runtime, header);
    assert.equal(await runtime.nonce(initial.sender, 'pending'), nonce, 'APPEND_ONLY_NONCE_CHANGED');
    const pin = { pool: projected.address, predecessor: predecessor.address, codeHash: projected.codeHash,
      assetIdentity: projected.assetIdentity, domainCommitment: projected.domainCommitment,
      sourceManifestSHA256: '0x' + sourceManifestSHA256, keyManifestSHA256: '0x' + keyManifestSHA256 };
    // Preserve the exact prospective descriptor BEFORE a potentially uncertain
    // transaction. Readers authenticate only the actually registered prefix;
    // a lost registration reply cannot erase older original recovery routes.
    state.pendingPool = freeze({ ...projected, ...projected.immutableValues,
      expectedCode: projected.runtimeCode, registrationPin: pin,
      assetCapability: predecessor.assetCapability, assetMetadata: predecessor.assetMetadata });
    mutated = true;
    const pinReceipt = await runtime.send('pin exact prospective append-only pool', { from: initial.sender, to: hub.address,
      data: hub.data('pinSuccessorPool((address,address,bytes32,bytes32,bytes32,bytes32,bytes32))', [pin]) });
    await runtime.checkReceipt(pinReceipt); await runtime.assertCanonical(pinReceipt);
    assert.equal(await runtime.nonce(initial.sender, 'pending'), nonce + 1n);
    const receipt = await runtime.send('deploy exact append-only successor pool', { from: initial.sender, data: projected.creationData });
    await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    assert.equal(address(receipt.contractAddress), projected.address, 'APPEND_ONLY_CREATE_ADDRESS');
    const tx = runtime.transactions.filter(record => record.transactionHash === receipt.transactionHash);
    assert.equal(tx.length, 1); assert.equal(tx[0].request.data, projected.creationData);
    assert.equal(BigInt(tx[0].senderNonce), nonce + 1n); assert.equal(BigInt(tx[0].request.value ?? '0x0'), 0n);
    assert.equal(await runtime.nonce(initial.sender, 'pending'), nonce + 2n);
    const record = { ...projected, expectedCode: projected.runtimeCode, receipt,
      source: 'v2/PrivateFlatAssetNotePoolV2.sol', contractName: 'PrivateFlatAssetNotePoolV2', proofAcceptanceClaim: false };
    await expectedCodeAt(runtime, record, receipt.blockNumber);
    assert.equal(await runtime.keccak(projected.runtimeCode), projected.codeHash);
    const pool = { ...viewFacade(runtime, record, ledger.artifacts.pool), ...projected.immutableValues,
      assetCapability: predecessor.assetCapability, assetMetadata: predecessor.assetMetadata, domain: projected.domain,
      domainCommitment: projected.domainCommitment, registrationPin: pin };
    const deployed = await runtime.block();
    for (const [name, value] of Object.entries(projected.immutableValues)) assert.equal(
      await pool.call(name + '()', [], deployed.number), encodedWords([value]), 'APPEND_ONLY_IMMUTABLE_' + name);
    for (const name of ['leafCount', 'spentCount', 'liveReservations', 'outputCapacity', 'authorizationLeafCount', 'stateSequence', 'backedAmount'])
      assert.equal(await pool.call(name + '()', [], deployed.number), encodedWords([0]), 'APPEND_ONLY_CONSTRUCTOR_' + name);
    assert.equal(await hub.call('successorPoolPin(address)', [pool.address], deployed.number), encodedWords(Object.values(pin)));
    const freshAsset = await pool.assetCapability.read({ holder: pool.address, blockNumber: deployed.number });
    assert.equal(freshAsset.blockHash, deployed.hash); assert.equal(freshAsset.balance, '0');
    assert.equal(await runtime.balance(pool.address, deployed.number), 0n);
    await unchangedHead(runtime, deployed);
    const registration = await runtime.send('register exact append-only successor domain', { from: initial.sender, to: hub.address,
      data: hub.data('registerPoolDomain(address)', [pool.address]) });
    await runtime.checkReceipt(registration); await runtime.assertCanonical(registration);
    const registered = await runtime.block();
    assert.equal(await hub.call('registeredPoolCount()', [], registered.number), encodedWords([state.pools.length + 1]));
    assert.equal(await hub.call('registeredPoolAt(uint256)', [state.pools.length], registered.number), encodedWords([pool.address]));
    assert.equal(await hub.call('poolDomain(address)', [pool.address], registered.number), encodedWords([pool.domainCommitment]));
    assert.equal(await hub.call('domainPool(bytes32)', [pool.domainCommitment], registered.number), encodedWords([pool.address]));
    for (const old of state.pools) {
      assert.equal(await hub.call('poolDomain(address)', [old.address], registered.number), encodedWords([old.domainCommitment]));
      assert.equal(await hub.call('pinnedPoolCodeHash(address)', [old.address], registered.number), encodedWords([old.codeHash]));
    }
    await unchangedHead(runtime, registered);
    freeze(pool); state.pools.push(pool); state.pendingPool = null;
    candidate = { ...initial, pools: [pool],
      plan: { ...initial.plan, pools: [projected] },
      asset: pool.asset, assetCodeHash: pool.assetCodeHash, assetIdentity: pool.assetIdentity,
      assetCapability: pool.assetCapability, assetMetadata: pool.assetMetadata,
      assetBalance: (holder, block = 'latest') => pool.assetCapability.balance(holder, block),
      bootstrap: { blockNumber: registered.number, blockHash: registered.hash,
        completeRuntimesMatched: true, constructorStorageMatched: true, poolsUnfunded: true },
      deployments: [...initial.deployments, record], registrationReceipts: [registration],
      successorRegistration: { predecessor: predecessor.address, pin, pinReceipt, receipt, registration } };
    // Provisional capability is private until the real current-state reader passes.
    finalizeOwnedFlatSystem(runtime,candidate); appendOnlyRegistries.set(candidate, state);
    const { createFlatSystemStateReader } = await import('../../../execution/account/reconciliation/flat-system-state.mjs');
    const reader = await createFlatSystemStateReader({ runtime, system: candidate, poolIndex: 0 });
    const observed = await reader.read(); await reader.assertCurrent(observed);
    state.systems.push(candidate); return candidate;
  } catch (error) {
    if (mutated) state.appendFenced = true;
    if (candidate) { ownedSystems.delete(candidate); appendOnlyRegistries.delete(candidate); }
    throw new Error('APPEND_ONLY_SUCCESSOR_FAILED', { cause: error });
  } finally { state.appendBusy = false; activeDeployments.delete(runtime); }
}

// Exact original flat-system reconstruction. Only a sealed external bootstrap
// part token can enter; public descriptor JSON alone never grants this brand.
const FLAT_RECOVERY_FIELDS_V1=['classification','chainId','sender','plan','registry','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace','asset','assetCodeHash','assetIdentity','assetMetadata','deployments','registrationReceipts','bootstrap','provenance'];
function flatRecoveryFacadeV1(value){
 const excluded=new Set(['data','call','artifact','selectors','assetCapability']);
 return {record:structuredClone(Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.has(key)))),artifactSHA256:sha(Buffer.from(JSON.stringify(value.artifact)))};
}
function flatRecoveryArtifactV1(bundle,packed){
 exactRecord(packed,['record','artifactSHA256']);const {source,contractName}=packed.record,candidates=[];
 for(const [role,[file,name]]of Object.entries(FLAT_BUILD_PIN.artifacts))if(file===source&&name===contractName&&bundle.ledger.artifacts[role])candidates.push(bundle.ledger.artifacts[role]);
 for(const entry of Object.values(bundle.verifiers))if(entry.source===source&&entry.contracts[contractName])candidates.push(entry.contracts[contractName]);
 const artifact=candidates.find(a=>sha(Buffer.from(JSON.stringify(a)))===packed.artifactSHA256);assert.ok(artifact,'FLAT_RECOVERY_PINNED_ARTIFACT');return artifact;
}

export function flatRecoveryViewDataV1(value){
 if(value===null||['string','number','boolean'].includes(typeof value))return value;
 if(Array.isArray(value))return value.map(flatRecoveryViewDataV1);
 assert.ok(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'FLAT_RECOVERY_PLAIN_VIEW_DATA');
 const entries=[];
 for(const [key,item]of Object.entries(value)){
  if(typeof item==='function'){
   assert.equal(key,'path','FLAT_RECOVERY_NO_UNKNOWN_FUNCTION');
   assert.ok(Array.isArray(value.nodes)&&value.nodes.length===128&&Array.isArray(value.leaves)&&value.leaves.length===64&&typeof value.root==='string'&&Number.isSafeInteger(value.count)&&value.count>=0&&value.count<=64,'FLAT_RECOVERY_DERIVED_TREE_PATH_ONLY');
   assert.equal(value.leafCount,value.count);assert.equal(value.root,value.nodes[1]);assert.deepEqual(value.leaves,value.nodes.slice(64));
   continue;
  }
  entries.push([key,flatRecoveryViewDataV1(item)]);
 }
 return Object.fromEntries(entries);
}

export async function captureOwnedFlatSystemRecoveryV1(runtime,system){
 assert.equal(arguments.length,2);assertOwnedFlatSystem(runtime,system);await assertLocalEvm(runtime);
 assert.equal(system.deploymentProfile,undefined,'FIXED_TWO_POOL_RECOVERY_ONLY');assert.equal(system.pools.length,2);
 const {createFlatSystemStateReader}=await import('../../../execution/account/reconciliation/flat-system-state.mjs');
 const readers=await Promise.all([0,1].map(poolIndex=>createFlatSystemStateReader({runtime,system,poolIndex})));
 const views=[];for(const reader of readers)views.push(await reader.read());assert.deepEqual(views[0].head,views[1].head);
 for(let i=0;i<2;i++)await readers[i].assertCurrent(views[i]);
 const head=await runtime.block(),assets=[];
 for(const pool of system.pools){
  assertOwnedPoolAsset(runtime,pool.assetCapability);const metadata=pool.assetMetadata;assert.equal(metadata.kind,'ERC20','EXTERNAL_FIXED_TOKEN_ASSETS');
  const originals=runtime.transactions.filter(t=>t.receipt?.contractAddress?.toLowerCase()===metadata.address);assert.equal(originals.length,1);
  assets.push({metadata:structuredClone(metadata),deployment:{address:metadata.address,transactionHash:originals[0].transactionHash,expectedCode:await runtime.code(metadata.address,head.number),codeHash:metadata.codeHash}});
 }
 await unchangedHead(runtime,head);
 const map=rows=>Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,flatRecoveryFacadeV1(value)]));
 return {schema:'ORIGINAL_FLAT_SYSTEM_RECOVERY_V1',genesis:runtime.metadata.evmGenesis,head:structuredClone(head),
  system:structuredClone(Object.fromEntries(FLAT_RECOVERY_FIELDS_V1.map(key=>[key,system[key]]))),hub:flatRecoveryFacadeV1(system.hub),pools:system.pools.map(flatRecoveryFacadeV1),
  libraries:map(system.libraries),generatedLibraries:map(system.generatedLibraries),verifiers:map(system.verifiers),assets,views:views.map(flatRecoveryViewDataV1)};
}
export async function reopenOwnedFlatSystemRecoveryV1(token){
 assert.equal(arguments.length,1);
 const {consumeExternalDefiBootstrapPartV1}=await import('../../recovery/external-defi-bootstrap-recovery-v1.mjs');
 const {runtime,record:r}=consumeExternalDefiBootstrapPartV1(token,'system');
 exactRecord(r,['schema','genesis','head','system','hub','pools','libraries','generatedLibraries','verifiers','assets','views']);assert.equal(r.schema,'ORIGINAL_FLAT_SYSTEM_RECOVERY_V1');
 await assertLocalEvm(runtime);assert.equal(runtime.metadata.evmGenesis,r.genesis);assert.equal(runtime.metadata.chainId,'31337');assert.equal(r.system.sender,runtime.accounts[0]);
 const head=await runtime.block();assert.deepEqual(head,r.head,'ORIGINAL_FLAT_RECOVERY_HEAD');
 const bundle=await loadFlatDeploymentArtifacts();assert.deepEqual(bundle.provenance,r.system.provenance);
 const restore=p=>viewFacade(runtime,p.record,flatRecoveryArtifactV1(bundle,p));
 const map=rows=>Object.fromEntries(Object.entries(rows).map(([key,p])=>[key,restore(p)]));
 const assets=[];for(const row of r.assets){const {createOwnedPoolAsset}=await import('../../../chains/shared/contracts/owned-pool-asset.mjs');assets.push(await createOwnedPoolAsset({runtime,kind:row.metadata.kind,symbol:row.metadata.symbol,decimals:row.metadata.decimals,deployment:row.deployment}));assert.deepEqual(assets.at(-1).metadata,row.metadata);}
 assert.equal(assets.length,2);assert.equal(r.pools.length,2);assert.equal(r.views.length,2);
 const hub=restore(r.hub),pools=r.pools.map((p,i)=>({...restore(p),assetCapability:assets[i],assetMetadata:assets[i].metadata})),libraries=map(r.libraries),generatedLibraries=map(r.generatedLibraries),verifiers=map(r.verifiers);
 const common=pools.every(p=>p.asset===pools[0].asset&&p.assetCodeHash===pools[0].assetCodeHash)?pools[0]:null;
 const system={...structuredClone(r.system),hub,pools,libraries,generatedLibraries,verifiers,assetCapability:common?.assetCapability??null};
 const packed=[r.hub,...r.pools,...Object.values(r.libraries),...Object.values(r.generatedLibraries),...Object.values(r.verifiers)];
 assert.equal(packed.length,system.deployments.length,'ALL_ORIGINAL_DEPLOYMENTS');assert.equal(new Set(packed.map(p=>p.record.address)).size,packed.length);
 for(const p of packed){
  const record=p.record,artifact=flatRecoveryArtifactV1(bundle,p),originals=runtime.transactions.filter(t=>t.transactionHash===record.receipt.transactionHash);assert.equal(originals.length,1);
  const tx=originals[0],creation='0x'+linkPrivateBytecode(artifact.evm.bytecode.object,artifact.evm.bytecode.linkReferences,record.libraries)+record.constructorData.slice(2);
  assert.equal(tx.phase,'mined');assert.equal(tx.request.from,system.sender);assert.equal(tx.request.data,creation);assert.equal(BigInt(tx.senderNonce).toString(),record.nonce);assert.equal(record.address,predictNativeCreateAddress(system.sender,BigInt(record.nonce)));
  assert.equal(sha(Buffer.from(creation.slice(2),'hex')),record.creationSHA256);assert.deepEqual(tx.receipt,record.receipt);assert.equal(record.receipt.status,'0x1');assert.equal(record.receipt.contractAddress.toLowerCase(),record.address);
  await runtime.checkReceipt(record.receipt);await runtime.assertCanonical(record.receipt);await expectedCodeAt(runtime,record,head.number);
  const originalRecord=system.deployments.find(x=>x.address===record.address);assert.ok(originalRecord);for(const [key,value]of Object.entries(originalRecord))assert.deepEqual(record[key],value,'ORIGINAL_DEPLOYMENT_RECORD');
 }
 for(const receipt of system.registrationReceipts){await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
 system.verify=async(role,proof,publicInputs,block='latest')=>{assertOwnedFlatSystem(runtime,system);await assertLocalEvm(runtime);const spec=FLAT_VERIFIER_ORDER.find(([name])=>name===role);assert.ok(spec);fixedArray(publicInputs,spec[1]);const verifier=verifiers[role];await expectedCodeAt(runtime,verifier,block);const raw=await runtime.call({to:verifier.address,data:nativeProofCalldata(verifier.artifact,'verify(bytes,bytes32[])',proof,publicInputs)},block);assert.ok(raw===encodedWords([0])||raw===encodedWords([1]));return raw===encodedWords([1]);};
 system.assetBalance=(holder,block='latest')=>{assert.ok(common);return common.assetCapability.balance(holder,block);};
 Object.defineProperty(system,'receipts',{enumerable:true,get:()=>freeze(structuredClone(runtime.receipts))});
 finalizeOwnedFlatSystem(runtime,system);
 try{
  const {createFlatSystemStateReader}=await import('../../../execution/account/reconciliation/flat-system-state.mjs');
  for(let poolIndex=0;poolIndex<2;poolIndex++){const reader=await createFlatSystemStateReader({runtime,system,poolIndex}),view=await reader.read();assert.deepEqual(flatRecoveryViewDataV1(view),r.views[poolIndex],'ORIGINAL_FLAT_LEDGER_STATE');await reader.assertCurrent(view);}
  await unchangedHead(runtime,head);return system;
 }catch(error){ownedSystems.delete(system);throw error;}
}
