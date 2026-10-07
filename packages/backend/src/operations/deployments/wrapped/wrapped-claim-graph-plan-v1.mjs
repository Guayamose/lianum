/** Pure nonzero-authority graph proposal over an ORIGINAL combined wrapped artifact bundle.
 * Importing or calling this module starts no compiler, prover, RPC or EVM.
 * A proposal never establishes observed code, genuine verifier lineage, an
 * owned deployment capability, or successful proof acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, deriveNativeHubDomain,
  nativeStaticArguments } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { derivePrivateAssetIdentity, derivePrivateAssetPoolScope,
  linkPrivateBytecode } from '../../../../../engine/src/notes/private-asset-runtime.mjs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry,
  nativeQuorumRegistryCommitment } from '../../../../../engine/src/evidence/native-quorum.mjs';
import { GENERIC_COMPILER_PIN } from '../../../../../engine/src/execution/local/local-deployment.mjs';
import { createCommitmentCodec, exactRecord, fixedArray, canonicalField } from '../../../execution/encoding/commitments.mjs';
import { PROFILE } from '../../../execution/encoding/statements.mjs';
import { assertWrappedClaimDeploymentArtifactsV1, WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1, WRAPPED_CLAIM_LEDGER_ROLES_V1 } from './wrapped-claim-deployment-artifacts-v1.mjs';
import { assertCombinedAdapterRegistrationsV2 } from '../../../claims/protocol/registry-envelope-v2.mjs';
import { registryCommitment as wrappedRegistryCommitment } from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { REGISTRY_SCHEMA } from '../../../chains/evm/transfers/evm-native-value-v2.mjs';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const sha = value => createHash('sha256').update(value).digest('hex');
const keccak = value => '0x' + publicKeccak256(Buffer.from(value.slice(2), 'hex')).toString('hex');
const EMPTY_HASH = keccak('0x');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const FLAT_VERIFIER_ORDER = WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1;

// Snapshot data before awaiting the injected hash function. Reject accessors,
// proxies, cycles and executable toJSON hooks before reading their values.
function snapshot(value, active = new Set(), depth = 0, budget = { left: 500_000 }) {
  assert.ok(--budget.left >= 0 && depth <= 128, 'NATIVE_VALUE_PLAN_DATA_LIMIT');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { assert.ok(Number.isFinite(value) && !Object.is(value, -0), 'NATIVE_VALUE_PLAN_JSON_NUMBER'); return value; }
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) && !active.has(value), 'NATIVE_VALUE_PLAN_PLAIN_DATA');
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
  assert.equal(typeof value, 'string'); assert.match(value, /^0x[0-9a-f]{40}$/, 'NATIVE_VALUE_PLAN_ADDRESS');
  assert.ok(!nonzero || value !== ZERO_ADDRESS, 'NATIVE_VALUE_PLAN_ZERO_ADDRESS'); return value;
}
function bytes32(value, nonzero = false) {
  assert.equal(typeof value, 'string'); assert.match(value, /^0x[0-9a-f]{64}$/, 'NATIVE_VALUE_PLAN_BYTES32');
  assert.ok(!nonzero || value !== ZERO32, 'NATIVE_VALUE_PLAN_ZERO_BYTES32'); return value;
}
function uint64(value) {
  assert.equal(typeof value, 'string'); assert.match(value, /^(0|[1-9][0-9]{0,19})$/, 'NATIVE_VALUE_PLAN_UINT64');
  assert.ok(BigInt(value) < 1n << 64n, 'NATIVE_VALUE_PLAN_UINT64'); return BigInt(value);
}
function pin(value) {
  exactRecord(value, ['address', 'codeHash']);
  const result = { address: address(value.address), codeHash: bytes32(value.codeHash, true) };
  assert.notEqual(result.codeHash, EMPTY_HASH, 'NATIVE_VALUE_PLAN_EMPTY_CODE_HASH'); return result;
}

function immutableNames(compilation, sourceMap, role) {
  const [source, name] = WRAPPED_CLAIM_LEDGER_ROLES_V1[role], ast = compilation.sourceASTs[source];
  const contract = ast.nodes.find(node => node.nodeType === 'ContractDefinition' && node.name === name);
  assert.ok(contract && contract.contractKind === 'contract', 'NATIVE_VALUE_PLAN_CONTRACT_AST');
  const sourceBytes = Buffer.from(sourceMap[source].content);
  const result = {};
  for (const node of contract.nodes.filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable')) {
    assert.ok(node.stateVariable && Number.isSafeInteger(node.id), 'NATIVE_VALUE_PLAN_IMMUTABLE_AST');
    const [start, length, sourceId] = node.src.split(':').map(Number);
    assert.equal(sourceId, Number(ast.src.split(':')[2]), 'NATIVE_VALUE_PLAN_AST_SOURCE_ID');
    assert.ok(start >= 0 && length > 0 && start + length <= sourceBytes.length, 'NATIVE_VALUE_PLAN_AST_SPAN');
    const declaration = sourceBytes.subarray(start, start + length).toString();
    assert.match(declaration, new RegExp('^[A-Za-z0-9_]+ (?:public|private) immutable ' + node.name + '$'), 'NATIVE_VALUE_PLAN_IMMUTABLE_DECLARATION');
    assert.ok(!Object.hasOwn(result, node.id), 'NATIVE_VALUE_PLAN_IMMUTABLE_ID'); result[node.id] = node.name;
  }
  if (role === 'hub') for (const name of ['pool0CodeHash', 'pool1CodeHash']) {
    const node = contract.nodes.find(node => node.nodeType === 'VariableDeclaration' && node.name === name);
    assert.ok(node?.stateVariable && node.mutability === 'mutable', 'NATIVE_VALUE_PLAN_POOL_HASH_STORAGE_REQUIRED');
  }
  assert.equal(new Set(Object.values(result)).size, Object.keys(result).length, 'NATIVE_VALUE_PLAN_IMMUTABLE_NAMES');
  return result;
}

const component = (name, type, components) => ({ name, type, ...(components ? { components } : {}) });
const verifierSchema = [component('pins', 'tuple[12]', [component('verifier', 'address'), component('codeHash', 'bytes32')]),
  component('poseidon2Domains', 'address'), component('poseidon2DomainsCodeHash', 'bytes32'),
  component('hubCodec', 'address'), component('hubCodecCodeHash', 'bytes32')];
const constructorSchemas = {
  hub: [component('deploymentDomain', 'bytes32'), component('registryEpoch', 'uint64'), component('rulesRoot', 'bytes32'),
    component('verifierSet', 'tuple', verifierSchema), component('pools', 'address[2]'), component('poolCodeHashes', 'bytes32[2]'),
    component('attesterX', 'uint256[4]'), component('attesterY', 'uint256[4]'),
    component('claimAuthority', 'address'), component('claimAuthorityCodeHash', 'bytes32')],
  pool: [component('asset', 'address'), component('deploymentDomain', 'bytes32'), component('policy', 'bytes32'),
    component('verifierSet', 'tuple', verifierSchema), component('receiptHub', 'address'), component('receiptHubCodeHash', 'bytes32'),
    component('hubDomain', 'bytes32'), component('registryCommitment', 'bytes32')],
};
const abiShape = inputs => inputs.map(input => component(input.name, input.type, input.components && abiShape(input.components)));
function constructorArguments(artifact, role, configuration) {
  const constructors = artifact.abi.filter(item => item.type === 'constructor');
  assert.equal(constructors.length, 1, 'NATIVE_VALUE_PLAN_CONSTRUCTOR');
  const ctor = constructors[0]; assert.equal(ctor.stateMutability, 'nonpayable');
  assert.deepEqual(abiShape(ctor.inputs), [component('configuration', 'tuple', constructorSchemas[role])], 'NATIVE_VALUE_PLAN_CONSTRUCTOR_SCHEMA');
  const inputs = [], values = [];
  function flatten(input, value) {
    const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
    if (fixed) {
      const length = Number(fixed[2]); assert.ok(length <= 128, 'NATIVE_VALUE_PLAN_STATIC_ARRAY_BOUND'); fixedArray(value, length);
      for (const item of value) flatten({ ...input, type: fixed[1] }, item);
    } else if (input.type === 'tuple') {
      exactRecord(value, input.components.map(component => component.name));
      for (const child of input.components) flatten(child, value[child.name]);
    } else {
      assert.equal(input.components, undefined, 'NATIVE_VALUE_PLAN_SCALAR_COMPONENTS');
      inputs.push({ type: input.type }); values.push(value);
    }
  }
  flatten(ctor.inputs[0], configuration);
  // All static tuple/array leaves occupy one word. The golden encoder performs
  // scalar width/range/byte encoding; this module implements no ABI word codec.
  assert.equal(inputs.length, role === 'hub' ? 45 : 35, 'NATIVE_VALUE_PLAN_CONSTRUCTOR_WORDS');
  return nativeStaticArguments(inputs, values);
}
function creation(artifact, libraries, constructorData = '0x') {
  const data = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries)
    + constructorData.slice(2);
  assert.ok((data.length - 2) / 2 <= 49_152, 'NATIVE_VALUE_PLAN_INITCODE_LIMIT'); return data;
}
function libraryPlans(artifacts, addresses) {
  exactRecord(addresses, ['poseidon2Domains', 'hubCodec']);
  assert.notEqual(addresses.poseidon2Domains, addresses.hubCodec, 'NATIVE_VALUE_PLAN_DUPLICATE_LIBRARY');
  return Object.fromEntries(Object.keys(addresses).map(role => {
    const target = address(addresses[role]), artifact = artifacts[role];
    // The pinned pure/view-only libraries have no address guard. Do not invent
    // one: unlike stateful libraries, their exact runtime is address-independent.
    assert.deepEqual(artifact.evm.deployedBytecode.linkReferences, {});
    assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences, {});
    assert.match(artifact.evm.deployedBytecode.object, /^6080604052/, 'NATIVE_VALUE_PLAN_LIBRARY_RUNTIME_FORM');
    const runtimeCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target });
    return [role, { address: target, runtimeCode, codeHash: keccak(runtimeCode),
      runtimeBytes: (runtimeCode.length - 2) / 2, creationData: creation(artifact, {}) }];
  }));
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

/** Exact hub-then-two-pools proposal on chain 31337. hashFields must be the
 * caller's independently trusted, pinned Poseidon2 implementation. */
export async function buildWrappedClaimGraphDeploymentPlanV1(input, options) {
  exactRecord(options, ['hashFields']); assert.equal(typeof options.hashFields, 'function', 'NATIVE_VALUE_PLAN_HASH_PROVIDER');
  exactRecord(input, ['bundle','chainId','sender','nextNonce','deploymentDomain','registryEpoch','rulesRoot','attesterKeys','adapterProfiles','pools','verifiers','libraries','claimAuthority']);
  assertWrappedClaimDeploymentArtifactsV1(input.bundle);
  const { bundle, ...publicInput } = input;
  const data = snapshot(publicInput);
  data.compilation = bundle.ledger.compilation; data.sourceMap = bundle.ledger.sourceMap;
  const hasClaimAuthority = true;
  exactRecord(data, ['compilation', 'sourceMap', 'chainId', 'sender', 'nextNonce', 'deploymentDomain',
    'registryEpoch', 'rulesRoot', 'attesterKeys', 'adapterProfiles', 'pools', 'verifiers', 'libraries',
    ...(hasClaimAuthority ? ['claimAuthority'] : [])]);
  const claimAuthority = hasClaimAuthority ? pin(data.claimAuthority)
    : { address: ZERO_ADDRESS, codeHash: ZERO32 };
  assert.equal(data.chainId, '31337', 'NATIVE_VALUE_PLAN_LOCAL_CHAIN');
  const artifacts = bundle.ledger.artifacts;
  const sender = address(data.sender), nonce = uint64(data.nextNonce);
  assert.ok(nonce + 2n < (1n << 64n) - 1n, 'NATIVE_VALUE_PLAN_CREATE_NONCE_LIMIT');
  const deploymentDomain = bytes32(data.deploymentDomain, true), rulesRoot = bytes32(data.rulesRoot, true);
  const registryEpoch = uint64(data.registryEpoch).toString();
  exactRecord(data.libraries, ['poseidon2Domains', 'hubCodec']);
  const proposedLibraries = Object.fromEntries(Object.entries(data.libraries).map(([role, value]) => [role, pin(value)]));
  const libraries = libraryPlans(artifacts, Object.fromEntries(Object.entries(proposedLibraries).map(([role, value]) => [role, value.address])));
  for (const role of Object.keys(libraries)) assert.equal(proposedLibraries[role].codeHash, libraries[role].codeHash, 'NATIVE_VALUE_PLAN_LIBRARY_RUNTIME_PIN');
  assert.notEqual(libraries.poseidon2Domains.address, libraries.hubCodec.address, 'NATIVE_VALUE_PLAN_DUPLICATE_LIBRARY');
  const links = Object.fromEntries(Object.entries(libraries).map(([role, library]) => {
    const [source, name] = WRAPPED_CLAIM_LEDGER_ROLES_V1[role]; return [source + ':' + name, library.address];
  }));
  const verifierSet = verifierConfiguration(data.verifiers, libraries);
  const expectedCodeByAddress = new Map();
  const bindExpectedCode = (target, codeHash) => {
    assert.ok(!expectedCodeByAddress.has(target) || expectedCodeByAddress.get(target) === codeHash,
      'NATIVE_VALUE_PLAN_CONTRADICTORY_CODE_PIN');
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
  assert.ok(existing.every(target => !prospective.includes(target)), 'NATIVE_VALUE_PLAN_PREREQUISITE_ADDRESS_COLLISION');
  const hubDomain = deriveNativeHubDomain(data.chainId, hubAddress, deploymentDomain);
  const quorum = normalizeNativeQuorumRegistry({ profile: NATIVE_QUORUM_PROFILE, hubDomain: hubDomain.slice(2),
    registryEpoch, rulesRoot: rulesRoot.slice(2), keys: data.attesterKeys });
  const registry = { schema: REGISTRY_SCHEMA, quorum };
  const registrations = assertCombinedAdapterRegistrationsV2({ registry, profiles: data.adapterProfiles });
  const signerAddresses = quorum.keys.map(key => '0x' + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex'));
  assert.ok(signerAddresses.every(signer => signer !== ZERO_ADDRESS), 'NATIVE_VALUE_PLAN_ZERO_ATTESTER_ADDRESS');
  assert.equal(new Set(signerAddresses).size, 4, 'NATIVE_VALUE_PLAN_DUPLICATE_ATTESTER_ADDRESS');
  const registryCommitment = '0x' + wrappedRegistryCommitment(registry);
  const commonValues = { hubDomain, ledgerNamespace: hubDomain, registryCommitment, verifierSetCommitment,
    poseidon2Domains: libraries.poseidon2Domains.address, poseidon2DomainsCodeHash: libraries.poseidon2Domains.codeHash,
    hubCodec: libraries.hubCodec.address, hubCodecCodeHash: libraries.hubCodec.codeHash };
  const hubValues = { ...commonValues, deploymentDomain, registryEpoch, rulesRoot,
    pool0: poolAddresses[0], pool1: poolAddresses[1],
    claimAuthority: claimAuthority.address, claimAuthorityCodeHash: claimAuthority.codeHash };
  const hubNames = immutableNames(data.compilation, data.sourceMap, 'hub');
  assert.deepEqual(Object.values(hubNames).sort(), Object.keys(hubValues).sort(), 'NATIVE_VALUE_PLAN_HUB_IMMUTABLE_SET');
  const hubRuntime = deriveNativeRuntimeCode({ artifact: artifacts.hub, deployedAddress: hubAddress, libraries: links,
    immutableNames: hubNames, immutableValues: hubValues });
  assert.ok((hubRuntime.length - 2) / 2 <= 24576, 'NATIVE_VALUE_PLAN_RUNTIME_SIZE');
  const hubCodeHash = keccak(hubRuntime);
  const poolNames = immutableNames(data.compilation, data.sourceMap, 'pool');
  fixedArray(data.pools, 2);
  const codec = createCommitmentCodec({ hashFields: options.hashFields }), pools = [];
  for (let index = 0; index < 2; index++) {
    const inputPool = data.pools[index]; exactRecord(inputPool, ['asset', 'assetCodeHash', 'deploymentDomain', 'policy']);
    const asset = address(inputPool.asset, false), assetCodeHash = bytes32(inputPool.assetCodeHash);
    assert.ok(asset === ZERO_ADDRESS || (!prospective.includes(asset) && assetCodeHash !== EMPTY_HASH), 'NATIVE_VALUE_PLAN_ASSET_PIN');
    const assetIdentity = derivePrivateAssetIdentity(data.chainId, asset, assetCodeHash);
    if (asset !== ZERO_ADDRESS) bindExpectedCode(asset, assetCodeHash);
    const poolDomain = bytes32(inputPool.deploymentDomain, true), policy = bytes32(inputPool.policy, true);
    const target = poolAddresses[index];
    const scope = derivePrivateAssetPoolScope(data.chainId, target, poolDomain, assetIdentity);
    const domain = Object.fromEntries(Object.entries({ scope, policy, asset: assetIdentity, hubDomain, registryCommitment,
      verifierSetCommitment, ledgerNamespace: hubDomain }).map(([key, value]) => [key, value.slice(2)]));
    const domainCommitment = await codec.domainCommitment(domain); canonicalField(domainCommitment, true);
    const configuration = { asset, deploymentDomain: poolDomain, policy, verifierSet,
      receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash, hubDomain, registryCommitment };
    const values = { ...commonValues, asset, assetCodeHash, assetIdentity, deploymentDomain: poolDomain, scope, policy,
      domainCommitment: '0x' + domainCommitment, receiptHub: hubAddress, receiptHubCodeHash: hubCodeHash };
    assert.deepEqual(Object.values(poolNames).sort(), Object.keys(values).sort(), 'NATIVE_VALUE_PLAN_POOL_IMMUTABLE_SET');
    const runtimeCode = deriveNativeRuntimeCode({ artifact: artifacts.pool, deployedAddress: target, libraries: links,
      immutableNames: poolNames, immutableValues: values });
    assert.ok((runtimeCode.length - 2) / 2 <= 24576, 'NATIVE_VALUE_PLAN_RUNTIME_SIZE');
    const constructorData = constructorArguments(artifacts.pool, 'pool', configuration);
    pools.push({ address: target, nonce: (nonce + BigInt(index) + 1n).toString(), asset, assetCodeHash, assetIdentity,
      scope, domain, domainCommitment: '0x' + domainCommitment, configuration, immutableValues: values,
      runtimeCode, runtimeBytes: (runtimeCode.length - 2) / 2, codeHash: keccak(runtimeCode), constructorData,
      creationData: creation(artifacts.pool, links, constructorData) });
  }
  assert.notEqual(pools[0].immutableValues.policy, pools[1].immutableValues.policy, 'NATIVE_VALUE_PLAN_DISTINCT_POLICIES');
  assert.notEqual(pools[0].immutableValues.deploymentDomain, pools[1].immutableValues.deploymentDomain, 'NATIVE_VALUE_PLAN_DISTINCT_POOL_DOMAINS');
  assert.notEqual(pools[0].domainCommitment, pools[1].domainCommitment, 'NATIVE_VALUE_PLAN_DUPLICATE_DOMAIN');
  const configuration = { deploymentDomain, registryEpoch, rulesRoot, verifierSet, pools: poolAddresses,
    poolCodeHashes: pools.map(pool => pool.codeHash), attesterX: quorum.keys.map(key => '0x' + key.x), attesterY: quorum.keys.map(key => '0x' + key.y),
    claimAuthority: claimAuthority.address, claimAuthorityCodeHash: claimAuthority.codeHash };
  const constructorData = constructorArguments(artifacts.hub, 'hub', configuration);
  return freeze({ classification: 'PREDICTED_WRAPPED_CLAIM_GRAPH_DEPLOYMENT_NOT_CHAIN_OR_PROOF_EVIDENCE',
    buildAttempt: bundle.provenance.releaseSHA256, adapterProfiles: registrations.profiles, claimsEnabled: true, chainId: data.chainId, sender, registry, hubDomain, registryCommitment,
    ledgerNamespace: hubDomain, verifierSet, verifierSetCommitment, libraries, links,
    requiredVerifierLineage: FLAT_VERIFIER_ORDER.map(([role, publicWords]) => ({ role, publicWords,
      address: data.verifiers[role].address, codeHash: data.verifiers[role].codeHash })),
    hub: { address: hubAddress, nonce: nonce.toString(), configuration, immutableValues: hubValues,
      runtimeCode: hubRuntime, runtimeBytes: (hubRuntime.length - 2) / 2, codeHash: hubCodeHash,
      constructorData, creationData: creation(artifacts.hub, links, constructorData) }, pools,
    postDeployment: poolAddresses.map(pool => ({ target: hubAddress, method: 'registerPoolDomain(address)', pool })) });
}
