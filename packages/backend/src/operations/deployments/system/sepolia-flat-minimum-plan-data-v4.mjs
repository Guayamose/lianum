/** Independent PUBLIC mechanical planner derived from the unchanged static ledger planner.
 * This DATA module starts no compiler, prover or EVM; its canonical producer
 * supplies a private ORIGINAL RPC domain reader to its fixed hashing port.
 * A proposal never establishes observed code, genuine verifier lineage, an
 * owned deployment capability, or successful proof acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, deriveNativeHubDomain,
  nativeStaticArguments } from '../../../execution/native/dispatch/native-deployment.mjs';
import { derivePrivateAssetIdentity, derivePrivateAssetPoolScope,
  linkPrivateBytecode } from '@lianum/engine/notes/private-asset-runtime';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry,
  nativeQuorumRegistryCommitment } from '@lianum/engine/evidence/native-quorum';
import { GENERIC_COMPILER_PIN } from '@lianum/engine/execution/local/local-deployment';
import { createCommitmentCodec, exactRecord, fixedArray, canonicalField } from '@lianum/components/encoding/commitments';
import { RELATIONS, PROFILE } from '@lianum/components/encoding/statements';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const sha = value => createHash('sha256').update(value).digest('hex');
const keccak = value => '0x' + publicKeccak256(Buffer.from(value.slice(2), 'hex')).toString('hex');
const EMPTY_HASH = keccak('0x');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const FLAT_VERIFIER_ORDER = freeze([
  ['authorization', RELATIONS.authorization.wordCount], ['reservation', RELATIONS.reservation.wordCount],
  ['dependency', RELATIONS.dependency.wordCount], ['ready', RELATIONS.ready.wordCount],
  ['admission', RELATIONS.admission.wordCount], ['node', RELATIONS.node.wordCount],
  ['settlement', RELATIONS.settlement.wordCount], ['recovery', RELATIONS.recovery.wordCount],
  ['deposit_balance', 26], ['withdraw_balance', 39], ['withdraw', 39], ['deposit_intent', 27],
]);
assert.deepEqual(FLAT_VERIFIER_ORDER.map(([, width]) => width), [16, 58, 42, 50, 84, 32, 138, 41, 26, 39, 39, 27]);


/** Internal data-only composition; fixed public entrypoints select reviewed pins. */
export function buildFixedSepoliaFlatMinimumPlannerDataV4(buildPin,fixedPorts) {
  exactRecord(fixedPorts,['hashOriginalDomain']);assert.ok(Object.isFrozen(fixedPorts)&&typeof fixedPorts.hashOriginalDomain==='function','PUBLIC_FLAT_FIXED_PRIVATE_PORTS');
  const minimumDeposits=true, APPEND_ONLY_BUILD_PIN=buildPin;
  function positiveMinimum(value) {const amount=uint64(value);assert.ok(amount>0n,'FLAT_MINIMUM_DEPOSIT_REQUIRED');return amount.toString();}
// Snapshot data before awaiting the injected hash function. Reject accessors,
// proxies, cycles and executable toJSON hooks before reading their values.
function snapshot(value, active = new Set(), depth = 0, budget = { left: 500_000 }) {
  assert.ok(--budget.left >= 0 && depth <= 128, 'FLAT_PLAN_DATA_LIMIT');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { assert.ok(Number.isFinite(value) && !Object.is(value, -0), 'FLAT_PLAN_JSON_NUMBER'); return value; }
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) && !active.has(value), 'FLAT_PLAN_PLAIN_DATA');
  active.add(value);
  let result;
  if (Array.isArray(value)) {
    fixedArray(value, value.length);
    result = value.map(item => snapshot(item, active, depth + 1, budget));
  } else {
    exactRecord(value, Object.keys(value));
    result = Object.fromEntries(Object.keys(value).map(key => [key, snapshot(value[key], active, depth + 1, budget)]));
  }
  active.delete(value); return result;
}
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
}
const digestJSON = value => sha(canonicalJSON(value));
function address(value, nonzero = true) {
  assert.equal(typeof value, 'string'); assert.match(value, /^0x[0-9a-f]{40}$/, 'FLAT_PLAN_ADDRESS');
  assert.ok(!nonzero || value !== ZERO_ADDRESS, 'FLAT_PLAN_ZERO_ADDRESS'); return value;
}
function bytes32(value, nonzero = false) {
  assert.equal(typeof value, 'string'); assert.match(value, /^0x[0-9a-f]{64}$/, 'FLAT_PLAN_BYTES32');
  assert.ok(!nonzero || value !== ZERO32, 'FLAT_PLAN_ZERO_BYTES32'); return value;
}
function uint64(value) {
  assert.equal(typeof value, 'string'); assert.match(value, /^(0|[1-9][0-9]{0,19})$/, 'FLAT_PLAN_UINT64');
  assert.ok(BigInt(value) < 1n << 64n, 'FLAT_PLAN_UINT64'); return BigInt(value);
}
function pin(value) {
  exactRecord(value, ['address', 'codeHash']);
  const result = { address: address(value.address), codeHash: bytes32(value.codeHash, true) };
  assert.notEqual(result.codeHash, EMPTY_HASH, 'FLAT_PLAN_EMPTY_CODE_HASH'); return result;
}
function checkedBuild(compilation, sourceMap) {
  const names = Object.keys(APPEND_ONLY_BUILD_PIN.sources);
  exactRecord(sourceMap, names); exactRecord(compilation.sourceASTs, names);
  assert.equal(compilation.classification, 'COMPILED_SOURCES_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE');
  assert.equal(compilation.profile, 'standard', 'FLAT_PLAN_COMPILER_PROFILE');
  assert.deepEqual(compilation.compiler, GENERIC_COMPILER_PIN, 'FLAT_PLAN_COMPILER_PIN');
  assert.equal(digestJSON(compilation.settings), APPEND_ONLY_BUILD_PIN.settingsSHA256, 'FLAT_PLAN_SETTINGS_PIN');
  fixedArray(compilation.sources, names.length);
  assert.deepEqual(compilation.sources.map(record => record.name).sort(), [...names].sort(), 'FLAT_PLAN_SOURCE_SET');
  for (const name of names) {
    const record = sourceMap[name]; exactRecord(record, ['content', 'sha256']);
    const [sourceHash, astHash] = APPEND_ONLY_BUILD_PIN.sources[name];
    assert.equal(typeof record.content, 'string');
    assert.equal(sha(record.content), sourceHash, 'FLAT_PLAN_SOURCE_PIN');
    assert.equal(record.sha256, sourceHash, 'FLAT_PLAN_SOURCE_RECORD');
    assert.deepEqual(compilation.sources.find(record => record.name === name),
      { name, sha256: sourceHash, bytes: Buffer.byteLength(record.content) }, 'FLAT_PLAN_COMPILED_SOURCE');
    const ast = compilation.sourceASTs[name];
    assert.equal(ast.nodeType, 'SourceUnit'); assert.equal(ast.absolutePath, name);
    assert.equal(digestJSON(ast), astHash, 'FLAT_PLAN_AST_PIN');
  }
  return Object.fromEntries(Object.entries(APPEND_ONLY_BUILD_PIN.artifacts).map(([role, [source, name, hash]]) => {
    const artifact = compilation.contracts?.[source]?.[name];
    assert.ok(artifact, 'FLAT_PLAN_ARTIFACT_MISSING');
    assert.equal(digestJSON(artifact), hash, 'FLAT_PLAN_ARTIFACT_PIN');
    return [role, artifact];
  }));
}

function immutableNames(compilation, sourceMap, role) {
  const [source, name] = APPEND_ONLY_BUILD_PIN.artifacts[role], ast = compilation.sourceASTs[source];
  const contract = ast.nodes.find(node => node.nodeType === 'ContractDefinition' && node.name === name);
  assert.ok(contract && contract.contractKind === 'contract', 'FLAT_PLAN_CONTRACT_AST');
  const sourceBytes = Buffer.from(sourceMap[source].content);
  const result = {};
  for (const node of contract.nodes.filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable')) {
    assert.ok(node.stateVariable && Number.isSafeInteger(node.id), 'FLAT_PLAN_IMMUTABLE_AST');
    const [start, length, sourceId] = node.src.split(':').map(Number);
    assert.equal(sourceId, Number(ast.src.split(':')[2]), 'FLAT_PLAN_AST_SOURCE_ID');
    assert.ok(start >= 0 && length > 0 && start + length <= sourceBytes.length, 'FLAT_PLAN_AST_SPAN');
    const declaration = sourceBytes.subarray(start, start + length).toString();
    assert.match(declaration, new RegExp('^[A-Za-z0-9_]+ (?:public|private) immutable ' + node.name + '$'), 'FLAT_PLAN_IMMUTABLE_DECLARATION');
    assert.ok(!Object.hasOwn(result, node.id), 'FLAT_PLAN_IMMUTABLE_ID'); result[node.id] = node.name;
  }
  if (role === 'hub') for (const name of ['pool0CodeHash', 'pool1CodeHash']) {
    const node = contract.nodes.find(node => node.nodeType === 'VariableDeclaration' && node.name === name);
    assert.ok(node?.stateVariable && node.mutability === 'mutable', 'FLAT_PLAN_POOL_HASH_STORAGE_REQUIRED');
  }
  assert.equal(new Set(Object.values(result)).size, Object.keys(result).length, 'FLAT_PLAN_IMMUTABLE_NAMES');
  return result;
}

const component = (name, type, components) => ({ name, type, ...(components ? { components } : {}) });
const verifierSchema = [component('pins', 'tuple[12]', [component('verifier', 'address'), component('codeHash', 'bytes32')]),
  component('poseidon2Domains', 'address'), component('poseidon2DomainsCodeHash', 'bytes32'),
  component('hubCodec', 'address'), component('hubCodecCodeHash', 'bytes32')];
const constructorSchemas = {
  hub: [component('poolRegistrar', 'address'), component('poolRegistryCodec', 'address'), component('poolRegistryCodecCodeHash', 'bytes32'), component('deploymentDomain', 'bytes32'), component('registryEpoch', 'uint64'), component('rulesRoot', 'bytes32'),
    component('verifierSet', 'tuple', verifierSchema), component('pools', 'address[2]'), component('poolCodeHashes', 'bytes32[2]'),
    component('attesterX', 'uint256[4]'), component('attesterY', 'uint256[4]'),
    component('claimAuthority', 'address'), component('claimAuthorityCodeHash', 'bytes32')],
  pool: [...(minimumDeposits ? [component('minimumDepositAmount', 'uint64')] : []), component('asset', 'address'), component('deploymentDomain', 'bytes32'), component('policy', 'bytes32'),
    component('verifierSet', 'tuple', verifierSchema), component('receiptHub', 'address'), component('receiptHubCodeHash', 'bytes32'),
    component('hubDomain', 'bytes32'), component('registryCommitment', 'bytes32')],
};
const abiShape = inputs => inputs.map(input => component(input.name, input.type, input.components && abiShape(input.components)));
function constructorArguments(artifact, role, configuration) {
  const constructors = artifact.abi.filter(item => item.type === 'constructor');
  assert.equal(constructors.length, 1, 'FLAT_PLAN_CONSTRUCTOR');
  const ctor = constructors[0]; assert.equal(ctor.stateMutability, 'nonpayable');
  assert.deepEqual(abiShape(ctor.inputs), [component('configuration', 'tuple', constructorSchemas[role])], 'FLAT_PLAN_CONSTRUCTOR_SCHEMA');
  const inputs = [], values = [];
  function flatten(input, value) {
    const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
    if (fixed) {
      const length = Number(fixed[2]); assert.ok(length <= 128, 'FLAT_PLAN_STATIC_ARRAY_BOUND'); fixedArray(value, length);
      for (const item of value) flatten({ ...input, type: fixed[1] }, item);
    } else if (input.type === 'tuple') {
      exactRecord(value, input.components.map(component => component.name));
      for (const child of input.components) flatten(child, value[child.name]);
    } else {
      assert.equal(input.components, undefined, 'FLAT_PLAN_SCALAR_COMPONENTS');
      inputs.push({ type: input.type }); values.push(value);
    }
  }
  flatten(ctor.inputs[0], configuration);
  // All static tuple/array leaves occupy one word. The golden encoder performs
  // scalar width/range/byte encoding; this module implements no ABI word codec.
  assert.equal(inputs.length, role === 'hub' ? 48 : minimumDeposits ? 36 : 35, 'FLAT_PLAN_CONSTRUCTOR_WORDS');
  return nativeStaticArguments(inputs, values);
}
function creation(artifact, libraries, constructorData = '0x') {
  const data = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries)
    + constructorData.slice(2);
  assert.ok((data.length - 2) / 2 <= 49_152, 'FLAT_PLAN_INITCODE_LIMIT'); return data;
}
function libraryPlans(artifacts, addresses) {
  exactRecord(addresses, ['poseidon2Domains', 'hubCodec', 'poolRegistryCodec']);
  assert.equal(new Set(Object.values(addresses)).size, 3, 'FLAT_PLAN_DUPLICATE_LIBRARY');
  assert.notEqual(addresses.poseidon2Domains, addresses.hubCodec, 'FLAT_PLAN_DUPLICATE_LIBRARY');
  return Object.fromEntries(Object.keys(addresses).map(role => {
    const target = address(addresses[role]), artifact = artifacts[role];
    // The pinned pure/view-only libraries have no address guard. Do not invent
    // one: unlike stateful libraries, their exact runtime is address-independent.
    if (role !== 'poolRegistryCodec') assert.deepEqual(artifact.evm.deployedBytecode.linkReferences, {});
    assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences, {});
    assert.match(artifact.evm.deployedBytecode.object, role === 'poolRegistryCodec' ? /^608080604052/ : /^6080604052/, 'FLAT_PLAN_LIBRARY_RUNTIME_FORM');
    const links = Object.fromEntries(['poseidon2Domains', 'hubCodec'].map(name => {
      const [source, contract] = APPEND_ONLY_BUILD_PIN.artifacts[name]; return [source + ':' + contract, address(addresses[name])]; }));
    const runtimeCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target, libraries: links });
    return [role, { address: target, runtimeCode, codeHash: keccak(runtimeCode),
      runtimeBytes: (runtimeCode.length - 2) / 2, creationData: creation(artifact, links) }];
  }));
}
/** Derive expected library pins from their exact pinned runtime form.
 * Addresses are caller proposals. No chain observation or deployment occurs. */
function deriveAppendOnlyLibraryPlans(input) {
  const data = snapshot(input); exactRecord(data, ['compilation', 'sourceMap', 'addresses']);
  return freeze(libraryPlans(checkedBuild(data.compilation, data.sourceMap), data.addresses));
}
function verifierConfiguration(verifiers, libraries) {
  exactRecord(verifiers, FLAT_VERIFIER_ORDER.map(([name]) => name));
  const pins = FLAT_VERIFIER_ORDER.map(([name]) => {
    const entry = pin(verifiers[name]); return { verifier: entry.address, codeHash: entry.codeHash };
  });
  return { pins, poseidon2Domains: libraries.poseidon2Domains.address,
    poseidon2DomainsCodeHash: libraries.poseidon2Domains.codeHash,
    hubCodec: libraries.hubCodec.address, hubCodecCodeHash: libraries.hubCodec.codeHash };
}
function configurationCommitment(configuration) {
  const parts = [Buffer.from('LIANUM/PAEG/flat-verifier-set/4'), Buffer.from(PROFILE)];
  configuration.pins.forEach((pin, role) => {
    const width = Buffer.alloc(4); width.writeUInt32BE(FLAT_VERIFIER_ORDER[role][1]);
    parts.push(Buffer.from([role]), Buffer.from(pin.verifier.slice(2), 'hex'), Buffer.from(pin.codeHash.slice(2), 'hex'), width);
  });
  for (const [name, addressKey, hashKey] of [['Poseidon2Domains', 'poseidon2Domains', 'poseidon2DomainsCodeHash'], ['FlatHubCodec', 'hubCodec', 'hubCodecCodeHash']])
    parts.push(Buffer.from(name), Buffer.from(configuration[addressKey].slice(2), 'hex'), Buffer.from(configuration[hashKey].slice(2), 'hex'));
  return '0x' + sha(Buffer.concat(parts.flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  })));
}

/** Exact independent PUBLIC hub-then-two-pools proposal. The hash port belongs
 * to the one private producer. Foreign mechanical instances issue DATA only. */
async function buildAppendOnlyDeploymentPlan(input,originalDomain) {
  const data = snapshot(input);
  const hasClaimAuthority = Object.hasOwn(data, 'claimAuthority');
  exactRecord(data, ['compilation', 'sourceMap', 'chainId', 'sender', 'nextNonce', 'deploymentDomain',
    'registryEpoch', 'rulesRoot', 'attesterKeys', 'pools', 'verifiers', 'libraries',
    ...(hasClaimAuthority ? ['claimAuthority'] : [])]);
  assert.equal(hasClaimAuthority, false, 'APPEND_ONLY_NATIVE_VALUE_OR_CLAIM_PROFILE_UNSUPPORTED');
  const claimAuthority = hasClaimAuthority ? pin(data.claimAuthority)
    : { address: ZERO_ADDRESS, codeHash: ZERO32 };
  assert.equal(data.chainId, '11155111', 'PUBLIC_FLAT_SEPOLIA_CHAIN');
  const artifacts = checkedBuild(data.compilation, data.sourceMap);
  const sender = address(data.sender), nonce = uint64(data.nextNonce);
  assert.ok(nonce + 2n < (1n << 64n) - 1n, 'FLAT_PLAN_CREATE_NONCE_LIMIT');
  const deploymentDomain = bytes32(data.deploymentDomain, true), rulesRoot = bytes32(data.rulesRoot, true);
  const registryEpoch = uint64(data.registryEpoch).toString();
  exactRecord(data.libraries, ['poseidon2Domains', 'hubCodec', 'poolRegistryCodec']);
  const proposedLibraries = Object.fromEntries(Object.entries(data.libraries).map(([role, value]) => [role, pin(value)]));
  const libraries = libraryPlans(artifacts, Object.fromEntries(Object.entries(proposedLibraries).map(([role, value]) => [role, value.address])));
  for (const role of Object.keys(libraries)) assert.equal(proposedLibraries[role].codeHash, libraries[role].codeHash, 'FLAT_PLAN_LIBRARY_RUNTIME_PIN');
  assert.notEqual(libraries.poseidon2Domains.address, libraries.hubCodec.address, 'FLAT_PLAN_DUPLICATE_LIBRARY');
  const links = Object.fromEntries(Object.entries(libraries).map(([role, library]) => {
    const [source, name] = APPEND_ONLY_BUILD_PIN.artifacts[role]; return [source + ':' + name, library.address];
  }));
  const verifierSet = verifierConfiguration(data.verifiers, libraries);
  const expectedCodeByAddress = new Map();
  const bindExpectedCode = (target, codeHash) => {
    assert.ok(!expectedCodeByAddress.has(target) || expectedCodeByAddress.get(target) === codeHash,
      'FLAT_PLAN_CONTRADICTORY_CODE_PIN');
    expectedCodeByAddress.set(target, codeHash);
  };
  for (const library of Object.values(libraries)) bindExpectedCode(library.address, library.codeHash);
  if (hasClaimAuthority) bindExpectedCode(claimAuthority.address, claimAuthority.codeHash);
  for (const verifier of verifierSet.pins) bindExpectedCode(verifier.verifier, verifier.codeHash);
  const verifierSetCommitment = configurationCommitment(verifierSet);
  const hubAddress = predictNativeCreateAddress(sender, nonce);
  const poolAddresses = [1n, 2n].map(offset => predictNativeCreateAddress(sender, nonce + offset));
  const prospective = [hubAddress, ...poolAddresses];
  const existing = [...Object.values(libraries).map(item => item.address), ...verifierSet.pins.map(item => item.verifier),
    ...(hasClaimAuthority ? [claimAuthority.address] : [])];
  assert.ok(existing.every(target => !prospective.includes(target)), 'FLAT_PLAN_PREREQUISITE_ADDRESS_COLLISION');
  const hubDomain = deriveNativeHubDomain(data.chainId, hubAddress, deploymentDomain);
  const registry = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: hubDomain.slice(2),
    registryEpoch, rulesRoot: rulesRoot.slice(2), keys: data.attesterKeys });
  const signerAddresses = registry.keys.map(key => '0x' + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex'));
  assert.ok(signerAddresses.every(signer => signer !== ZERO_ADDRESS), 'FLAT_PLAN_ZERO_ATTESTER_ADDRESS');
  assert.equal(new Set(signerAddresses).size, 4, 'FLAT_PLAN_DUPLICATE_ATTESTER_ADDRESS');
  const registryCommitment = '0x' + nativeQuorumRegistryCommitment(registry);
  const commonValues = { hubDomain, ledgerNamespace: hubDomain, registryCommitment, verifierSetCommitment,
    poseidon2Domains: libraries.poseidon2Domains.address, poseidon2DomainsCodeHash: libraries.poseidon2Domains.codeHash,
    hubCodec: libraries.hubCodec.address, hubCodecCodeHash: libraries.hubCodec.codeHash };
  const hubValues = { ...commonValues, poolRegistrar: sender, poolRegistryCodec: libraries.poolRegistryCodec.address,
    poolRegistryCodecCodeHash: libraries.poolRegistryCodec.codeHash, deploymentDomain, registryEpoch, rulesRoot,
    pool0: poolAddresses[0], pool1: poolAddresses[1],
    claimAuthority: claimAuthority.address, claimAuthorityCodeHash: claimAuthority.codeHash };
  const hubNames = immutableNames(data.compilation, data.sourceMap, 'hub');
  assert.deepEqual(Object.values(hubNames).sort(), Object.keys(hubValues).sort(), 'FLAT_PLAN_HUB_IMMUTABLE_SET');
  const hubRuntime = deriveNativeRuntimeCode({ artifact: artifacts.hub, deployedAddress: hubAddress, libraries: links,
    immutableNames: hubNames, immutableValues: hubValues });
  const hubCodeHash = keccak(hubRuntime);
  const poolNames = immutableNames(data.compilation, data.sourceMap, 'pool');
  fixedArray(data.pools, 2);
  const codec = createCommitmentCodec({hashFields:fields=>fixedPorts.hashOriginalDomain(originalDomain,fields)}), pools = [];
  for (let index = 0; index < 2; index++) {
    const inputPool = data.pools[index]; exactRecord(inputPool, ['asset', 'assetCodeHash', 'deploymentDomain', 'policy', ...(minimumDeposits ? ['minimumDepositAtomic'] : [])]);
    const asset = address(inputPool.asset, false), assetCodeHash = bytes32(inputPool.assetCodeHash);
    assert.ok(asset === ZERO_ADDRESS || (!prospective.includes(asset) && assetCodeHash !== EMPTY_HASH), 'FLAT_PLAN_ASSET_PIN');
    const assetIdentity = derivePrivateAssetIdentity(data.chainId, asset, assetCodeHash);
    if (asset !== ZERO_ADDRESS) bindExpectedCode(asset, assetCodeHash);
    const poolDomain = bytes32(inputPool.deploymentDomain, true), policy = bytes32(inputPool.policy, true);
    const target = poolAddresses[index];
    const scope = derivePrivateAssetPoolScope(data.chainId, target, poolDomain, assetIdentity);
    const domain = Object.fromEntries(Object.entries({ scope, policy, asset: assetIdentity, hubDomain, registryCommitment,
      verifierSetCommitment, ledgerNamespace: hubDomain }).map(([key, value]) => [key, value.slice(2)]));
    const domainCommitment = await codec.domainCommitment(domain); canonicalField(domainCommitment, true);
    const minimumDepositAtomic=minimumDeposits ? positiveMinimum(inputPool.minimumDepositAtomic) : null;
    const configuration = { ...(minimumDeposits ? {minimumDepositAmount:minimumDepositAtomic} : {}), asset, deploymentDomain: poolDomain, policy, verifierSet,
      receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash, hubDomain, registryCommitment };
    const values = { ...(minimumDeposits ? {minimumDepositAmount:minimumDepositAtomic} : {}), ...commonValues, asset, assetCodeHash, assetIdentity, deploymentDomain: poolDomain, scope, policy,
      domainCommitment: '0x' + domainCommitment, receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash };
    assert.deepEqual(Object.values(poolNames).sort(), Object.keys(values).sort(), 'FLAT_PLAN_POOL_IMMUTABLE_SET');
    const runtimeCode = deriveNativeRuntimeCode({ artifact: artifacts.pool, deployedAddress: target, libraries: links,
      immutableNames: poolNames, immutableValues: values });
    const constructorData = constructorArguments(artifacts.pool, 'pool', configuration);
    pools.push({ ...(minimumDeposits ? {minimumDepositAtomic} : {}), address: target, nonce: (nonce + BigInt(index) + 1n).toString(), asset, assetCodeHash, assetIdentity,
      scope, domain, domainCommitment: '0x' + domainCommitment, configuration, immutableValues: values,
      runtimeCode, runtimeBytes: (runtimeCode.length - 2) / 2, codeHash: keccak(runtimeCode), constructorData,
      creationData: creation(artifacts.pool, links, constructorData) });
  }
  assert.notEqual(pools[0].domainCommitment, pools[1].domainCommitment, 'FLAT_PLAN_DUPLICATE_DOMAIN');
  const configuration = { poolRegistrar: sender, poolRegistryCodec: libraries.poolRegistryCodec.address,
    poolRegistryCodecCodeHash: libraries.poolRegistryCodec.codeHash, deploymentDomain, registryEpoch, rulesRoot, verifierSet, pools: poolAddresses,
    poolCodeHashes: pools.map(pool => pool.codeHash), attesterX: registry.keys.map(key => '0x' + key.x), attesterY: registry.keys.map(key => '0x' + key.y),
    claimAuthority: claimAuthority.address, claimAuthorityCodeHash: claimAuthority.codeHash };
  const constructorData = constructorArguments(artifacts.hub, 'hub', configuration);
  return freeze({ classification:'PREDICTED_PUBLIC_SEPOLIA_MINIMUM_TARGET_NOT_PROOF_OR_FINANCIAL_AUTHORITY',
    buildAttempt: APPEND_ONLY_BUILD_PIN.attempt, chainId: data.chainId, sender, registry, hubDomain, registryCommitment,
    ledgerNamespace: hubDomain, verifierSet, verifierSetCommitment, libraries, links,
    requiredVerifierLineage: FLAT_VERIFIER_ORDER.map(([role, publicWords]) => ({ role, publicWords,
      address: data.verifiers[role].address, codeHash: data.verifiers[role].codeHash })),
    hub: { address: hubAddress, nonce: nonce.toString(), configuration, immutableValues: hubValues,
      runtimeCode: hubRuntime, runtimeBytes: (hubRuntime.length - 2) / 2, codeHash: hubCodeHash,
      constructorData, creationData: creation(artifacts.hub, links, constructorData) }, pools,
    postDeployment: poolAddresses.map(pool => ({ target: hubAddress, method: 'registerPoolDomain(address)', pool })) });
}


return Object.freeze({deriveLibraryPlans:deriveAppendOnlyLibraryPlans,plan:buildAppendOnlyDeploymentPlan});
}
