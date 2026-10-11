/** Pure native claim deployment proposals. No proposal establishes deployment,
 * custody, genuine verifier lineage, native backing or proof acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { deriveNativeRuntimeCode, predictNativeCreateAddress }
  from '../../../execution/native/dispatch/native-deployment.mjs';
import { linkPrivateBytecode } from '@lianum/engine/notes/private-asset-runtime';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { evmRuntimeCodeHash, evmFunctionSelector } from '../../../chains/evm/contracts/evm-code-hash.mjs';
import { nativeRuleCommitment } from '@lianum/engine/native/native-receipt-binding';
import { exactRecord, fixedArray, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { claimFrame, claimHash } from '@lianum/engine/claims/permits';
import { claimABIType, encodeClaimABI } from '@lianum/engine/claims/abi';
import { CLAIM_CONFIG_SCHEMA, validateClaimConfig, claimDomainCommitment,
  claimVerifierSetCommitment, nativeClaimEndpointCommitment, claimUint } from '@lianum/engine/claims/framing';
import { buildWrappedClaimGraphDeploymentPlanV1 } from './wrapped-claim-graph-plan-v1.mjs';
import { assertWrappedClaimDeploymentArtifactsV1 } from './wrapped-claim-deployment-artifacts-v1.mjs';
import { validateWrappedClaimOperationalRegistration } from '../../../claims/ingress/operational-registration-v2.mjs';
import { custodyProfileCommitment } from '../../../claims/protocol/registry-envelope-v2.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bare = value => value.slice(2), prefixed = value => '0x' + value;
function snapshot(value, seen = new Set(), depth = 0) {
  assert.ok(depth <= 128, 'CLAIM_PLAN_DATA_DEPTH');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value) && !Object.is(value, -0), 'CLAIM_PLAN_DATA_NUMBER'); return value;
  }
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) && !seen.has(value), 'CLAIM_PLAN_PLAIN_DATA');
  seen.add(value); let result;
  if (Array.isArray(value)) {
    fixedArray(value, value.length); result = value.map(child => snapshot(child, seen, depth + 1));
  } else {
    exactRecord(value, Object.keys(value));
    result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, snapshot(child, seen, depth + 1)]));
  }
  seen.delete(value); return result;
}
export const NATIVE_CLAIM_REFUND_FEES = Object.freeze(['10000', '5000']);
export const NATIVE_CLAIM_CONTRACTS = Object.freeze({
  nativeClaimCodec: ['native-claims/NativeClaimCodec.sol', 'NativeClaimCodec'],
  nativeClaimValidation: ['native-claims/NativeClaimValidation.sol', 'NativeClaimValidation'],
  token: ['native-claims/NativeClaimToken.sol', 'NativeClaimToken'],
  gateway: ['native-claims/NativeClaimGateway.sol', 'NativeClaimGateway'],
  authority: ['native-claims/NativeClaimAuthority.sol', 'NativeClaimAuthority'],
});
/** Solidity library selectors preserve nominal struct names. The compiler's
 * exact identifier is authoritative; tuple offsets still use the normal ABI. */
export function claimArtifactMethod(artifact, signature) {
  const nominal = input => input.type.startsWith('tuple') ? input.internalType.replace(/^struct /, '') : input.type;
  const signatures = item => [claimABIType, nominal].map(type => item.name + '(' + item.inputs.map(type).join(',') + ')');
  const found = artifact.abi.filter(item => item.type === 'function' && signatures(item).includes(signature));
  assert.equal(found.length, 1, 'CLAIM_BOOTSTRAP_ABI_METHOD');
  const abi = found[0], actual = signatures(abi).find(value => Object.hasOwn(artifact.evm.methodIdentifiers, value));
  assert.ok(actual, 'CLAIM_BOOTSTRAP_COMPILER_METHOD');
  const selector = evmFunctionSelector(actual);
  assert.equal(artifact.evm.methodIdentifiers[actual], selector, 'CLAIM_BOOTSTRAP_COMPILER_SELECTOR');
  return { abi, selector };
}

/** Native currency identity has no caller-selected asset label. */
export function deriveOwnedNativeCurrencyAsset(input) {
  exactRecord(input, ['family', 'genesis']);
  assert.ok(['1', '2'].includes(input.family), 'CLAIM_BOOTSTRAP_NATIVE_FAMILY'); bytes32(input.genesis, true);
  return claimHash(claimFrame('LIANUM/PAEG/owned-native-claim-currency/1', [
    Buffer.from([Number(input.family)]), Buffer.from(input.genesis, 'hex')]));
}
export function buildOwnedNativeClaimRules(input) {
  exactRecord(input, ['bitcoinGenesis', 'solanaGenesis']);
  const rules = [input.bitcoinGenesis, input.solanaGenesis].map((genesis, i) => {
    const family = String(i + 1);
    return { family, genesis, asset: deriveOwnedNativeCurrencyAsset({ family, genesis }),
      finalityKind: family, minimumConfirmations: i === 0 ? '6' : '0',
      maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  });
  rules.forEach(nativeRuleCommitment);
  return frozenInput({ rules, ...nativeAdmissionRulesTree(rules) });
}
export function claimConfigurationABI(config) {
  validateClaimConfig(config);
  return Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) =>
    [name, type.startsWith('u') ? config[name] : prefixed(config[name])]));
}

/** Called only with already-pinned artifacts by the bootstrap. Public use is
 * strictly a proposal. Exact constructor bytes and runtime bytes remain bound. */
export function claimCreationPlan({ source, contractName, artifact, sender, nonce,
  libraries = {}, immutableNames = {}, immutableValues = {}, values = [], isLibrary = false }) {
  const n = claimUint(nonce), address = predictNativeCreateAddress(sender, n);
  const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: address, libraries,
    immutableNames, immutableValues,
    isLibrary: isLibrary && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object) });
  const inputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
  const constructorData = encodeClaimABI(inputs, values);
  const creationData = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object,
    artifact.evm.bytecode.linkReferences, libraries) + constructorData.slice(2);
  assert.ok((expectedCode.length - 2) / 2 <= 24576, 'CLAIM_PLAN_RUNTIME_SIZE');
  assert.ok((creationData.length - 2) / 2 <= 49152, 'CLAIM_PLAN_INITCODE_SIZE');
  return frozenInput({ source, contractName, address, nonce, libraries: cloneInput(libraries),
    immutableNames: cloneInput(immutableNames), immutableValues: cloneInput(immutableValues),
    expectedCode, runtimeCode: expectedCode, codeHash: evmRuntimeCodeHash(expectedCode),
    runtimeBytes: (expectedCode.length - 2) / 2, constructorData, creationData,
    creationSHA256: sha(Buffer.from(creationData.slice(2), 'hex')) });
}

export async function buildWrappedClaimDeploymentPlanV1(raw, options) {
  exactRecord(options, ['hashFields']); assert.equal(typeof options.hashFields, 'function');
  exactRecord(raw, ['bundle', 'sender', 'nextNonce', 'evmGenesis', 'libraries',
    'verifiers', 'configuration', 'rules', 'nativeRoles', 'inventoryDomains']);
  assertWrappedClaimDeploymentArtifactsV1(raw.bundle);
  const { bundle, ...publicInput } = raw, input = snapshot(publicInput), { hashFields } = options;
  input.bundle = bundle; input.ledger = bundle.ledger;
  exactRecord(input, ['bundle', 'ledger', 'sender', 'nextNonce', 'evmGenesis', 'libraries',
    'verifiers', 'configuration', 'rules', 'nativeRoles', 'inventoryDomains']);
  fixedArray(input.rules, 2); fixedArray(input.nativeRoles, 2); fixedArray(input.inventoryDomains, 2);
  exactRecord(input.configuration, ['deploymentDomain', 'registryEpoch', 'rulesRoot', 'attesterKeys', 'adapterProfiles', 'pools']);
  fixedArray(input.configuration.pools, 2);
  input.configuration.pools.forEach(pool => exactRecord(pool, ['policy', 'deploymentDomain']));
  assert.equal(new Set(input.inventoryDomains).size, 2, 'CLAIM_PLAN_DISTINCT_INVENTORIES');
  input.inventoryDomains.forEach(value => bytes32(value, true));
  const rules = buildOwnedNativeClaimRules({ bitcoinGenesis: input.rules[0].genesis, solanaGenesis: input.rules[1].genesis });
  assert.deepEqual(input.rules, rules.rules, 'CLAIM_PLAN_FIXED_NATIVE_RULES');
  // The root commits to both typed custody profiles and generic graph profiles.
  // The independently reconstructed two-currency rules are checked above, but
  // their historical two-leaf tree is never substituted for the combined root.
  let nonce = claimUint(input.nextNonce);
  const prerequisites = [], generated = {}, claimLibraries = {}, verifiers = {}, visiting = new Set();
  const links = {
    'FlatHubCodec.sol:FlatHubCodec': input.libraries.hubCodec.address,
    'crypto/Poseidon2Domains.sol:Poseidon2Domains': input.libraries.poseidon2Domains.address,
  };
  const add = (source, contractName, artifact, libraries, names = {}, values = {}, ctor = [], isLibrary = false) => {
    const record = claimCreationPlan({ source, contractName, artifact, sender: input.sender,
      nonce: (nonce++).toString(), libraries, immutableNames: names, immutableValues: values, values: ctor, isLibrary });
    prerequisites.push(record); return record;
  };
  for (const role of ['nativeClaimCodec', 'nativeClaimValidation']) {
    const [source, name] = NATIVE_CLAIM_CONTRACTS[role], artifact = input.bundle.contracts.artifacts[role];
    assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences, {}, 'CLAIM_PLAN_STORAGE_ONLY_LIBRARY');
    claimLibraries[role] = add(source, name, artifact, links, {}, {}, [], true);
    links[source + ':' + name] = claimLibraries[role].address;
  }
  function verifierLinks(entry, artifact) {
    const references = {};
    for (const refs of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences])
      for (const [source, names] of Object.entries(refs)) for (const name of Object.keys(names)) {
        assert.equal(source, entry.source, 'CLAIM_PLAN_VERIFIER_LIBRARY_SOURCE');
        const key = source + ':' + name;
        if (!generated[key]) {
          assert.ok(!visiting.has(key), 'CLAIM_PLAN_LIBRARY_CYCLE'); visiting.add(key);
          const library = entry.contracts[name]; assert.ok(library, 'CLAIM_PLAN_LIBRARY_MISSING');
          generated[key] = add(source, name, library, verifierLinks(entry, library), {}, {}, [], true);
          visiting.delete(key);
        }
        references[key] = generated[key].address;
      }
    return references;
  }
  for (const role of ['CI51', 'CO42']) {
    const entry = input.bundle.verifiers[role];
    verifiers[role] = add(entry.source, 'HonkVerifier', entry.artifact,
      verifierLinks(entry, entry.artifact), entry.immutableNames, entry.immutableValues);
  }
  const verifierPins = ['CI51', 'CO42'].map((role, i) => {
    const entry = input.bundle.verifiers[role];
    bytes32(entry.sourceCommitment, true); bytes32(entry.keyCommitment, true);
    return { role: String(i), address: bare(verifiers[role].address), codeHash: bare(verifiers[role].codeHash),
      width: i === 0 ? '51' : '42', sourceCommitment: entry.sourceCommitment, keyCommitment: entry.keyCommitment };
  });
  const verifierConfiguration = { pins: verifierPins.map(p => ({ verifier: prefixed(p.address),
    codeHash: prefixed(p.codeHash), sourceCommitment: prefixed(p.sourceCommitment), keyCommitment: prefixed(p.keyCommitment) })) };
  const claimVerifierSet = claimVerifierSetCommitment(verifierPins);
  const at = offset => predictNativeCreateAddress(input.sender, nonce + BigInt(offset));
  const tokenAddresses = [at(0), at(1)], gatewayAddresses = [at(2), at(3)], authorityAddress = at(4);
  const { artifacts } = input.bundle.contracts;
  for (const role of ['token', 'gateway', 'authority'])
    assert.deepEqual(artifacts[role].evm.deployedBytecode.immutableReferences, {}, 'CLAIM_PLAN_STORAGE_ONLY_CONTRACT');
  const runtime = (role, deployedAddress) => deriveNativeRuntimeCode({ artifact: artifacts[role],
    deployedAddress, libraries: links, immutableNames: {}, immutableValues: {} });
  const wrapperHash = evmRuntimeCodeHash(runtime('token', tokenAddresses[0]));
  const gatewayHash = evmRuntimeCodeHash(runtime('gateway', gatewayAddresses[0]));
  const authorityHash = evmRuntimeCodeHash(runtime('authority', authorityAddress));
  const flatPlan = await buildWrappedClaimGraphDeploymentPlanV1({ bundle,
    chainId: '31337', sender: input.sender, nextNonce: (nonce + 5n).toString(), ...input.configuration,
    pools: input.configuration.pools.map((pool, i) => ({ ...pool, asset: tokenAddresses[i], assetCodeHash: wrapperHash })),
    libraries: input.libraries, verifiers: input.verifiers,
    claimAuthority: { address: authorityAddress, codeHash: authorityHash } }, { hashFields });
  const configs = [], deployments = [], gatewayValues = [], payoutEndpointCommitments = [];
  for (let i = 0; i < 2; i++) {
    const rule = input.rules[i], pool = flatPlan.pools[i], roles = input.nativeRoles[i];
    exactRecord(roles, ['depositor', 'escrow', 'recipient']);
    const endpoint = value => nativeClaimEndpointCommitment({ family: rule.family, genesis: rule.genesis,
      asset: rule.asset, endpoint: value });
    assert.equal(new Set(Object.values(roles).map(value => value.endpoint)).size, 3, 'CLAIM_PLAN_DISTINCT_NATIVE_ROLES');
    const config = validateClaimConfig({ evmChainId: '31337', evmGenesis: bytes32(input.evmGenesis, true),
      gateway: bare(gatewayAddresses[i]), gatewayCodeHash: bare(gatewayHash),
      wrapper: bare(tokenAddresses[i]), wrapperCodeHash: bare(wrapperHash), pool: bare(pool.address),
      poolCodeHash: bare(pool.codeHash), poolDomain: bare(pool.domainCommitment), scope: bare(pool.scope),
      policy: bare(pool.configuration.policy), wrapperAssetIdentity: bare(pool.assetIdentity),
      hub: bare(flatPlan.hub.address), hubCodeHash: bare(flatPlan.hub.codeHash), hubDomain: bare(flatPlan.hubDomain),
      ledgerNamespace: bare(flatPlan.ledgerNamespace), registryCommitment: bare(flatPlan.registryCommitment),
      claimVerifierSetCommitment: claimVerifierSet, nativeFamily: rule.family, nativeGenesis: rule.genesis,
      nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule), escrowEndpointCommitment: endpoint(roles.escrow.endpoint),
      custodyInventoryDomain: input.inventoryDomains[i], refundMaxFee: NATIVE_CLAIM_REFUND_FEES[i] });
    configs.push(config);
    const payoutEndpoints = [roles.depositor.endpoint, roles.recipient.endpoint];
    payoutEndpointCommitments.push(payoutEndpoints.map(value => prefixed(endpoint(value))));
    gatewayValues.push({ claim: claimConfigurationABI(config), verifiers: verifierConfiguration,
      authority: authorityAddress, authorityCodeHash: authorityHash,
      codecCodeHash: claimLibraries.nativeClaimCodec.codeHash, validationCodeHash: claimLibraries.nativeClaimValidation.codeHash,
      payoutEndpoints: payoutEndpoints.map(prefixed), escrowEndpoint: prefixed(roles.escrow.endpoint) });
    const [source, contractName] = NATIVE_CLAIM_CONTRACTS.token;
    deployments.push(claimCreationPlan({ source, contractName, artifact: artifacts.token, sender: input.sender,
      nonce: (nonce + BigInt(i)).toString(), values: [gatewayAddresses[i], rule.family] }));
  }
  const gateways = gatewayValues.map((value, i) => {
    const [source, contractName] = NATIVE_CLAIM_CONTRACTS.gateway;
    const record = claimCreationPlan({ source, contractName, artifact: artifacts.gateway, sender: input.sender,
      nonce: (nonce + 2n + BigInt(i)).toString(), libraries: links, values: [value] });
    return { ...record, deployment: value, configurationCommitment: prefixed(sha(Buffer.from(record.constructorData.slice(2), 'hex'))),
      payoutEndpointCommitments: payoutEndpointCommitments[i], claimDomain: prefixed(claimDomainCommitment(configs[i])) };
  });
  const [source, contractName] = NATIVE_CLAIM_CONTRACTS.authority;
  const authority = claimCreationPlan({ source, contractName, artifact: artifacts.authority, sender: input.sender,
    nonce: (nonce + 4n).toString(), values: [{ hub: flatPlan.hub.address, gateways: gatewayAddresses,
      pools: flatPlan.pools.map(pool => pool.address), gatewayCodeHashes: [gatewayHash, gatewayHash],
      gatewayConfigurations: gateways.map(gateway => gateway.configurationCommitment) }] });
  assert.equal(authority.codeHash, authorityHash, 'CLAIM_PLAN_AUTHORITY_HASH_CYCLE');
  deployments.forEach(value => assert.equal(value.codeHash, wrapperHash, 'CLAIM_PLAN_WRAPPER_HASH_CYCLE'));
  gateways.forEach(value => assert.equal(value.codeHash, gatewayHash, 'CLAIM_PLAN_GATEWAY_HASH_CYCLE'));
  const custodyProfiles = input.configuration.adapterProfiles.filter(row => row.kind === 'custody');
  const custodyRegistration = { registry: flatPlan.registry, profiles: flatPlan.adapterProfiles,
    claims: configs.map((config, i) => {
      const matching = custodyProfiles.filter(row => row.profile.family === String(i + 1));
      assert.equal(matching.length, 1, 'WRAPPED_CLAIM_PLAN_EXACT_CUSTODY_PROFILE');
      return { config, rule: input.rules[i], profileCommitment: custodyProfileCommitment(matching[0].profile) };
    }) };
  validateWrappedClaimOperationalRegistration(custodyRegistration);
  return frozenInput({ classification: 'PREDICTED_WRAPPED_CLAIMS_NOT_DEPLOYMENT_OR_PROOF_ACCEPTANCE', custodyRegistration,
    prerequisites, libraries: claimLibraries, generatedLibraries: generated, verifiers, verifierPins,
    wrappers: deployments, gateways, authority, configs, flatPlan,
    deployments: [...prerequisites, ...deployments, ...gateways, authority],
    policies: input.rules.map(rule => ({ ledgerNamespace: bare(flatPlan.ledgerNamespace), hubDomain: bare(flatPlan.hubDomain),
      registryCommitment: bare(flatPlan.registryCommitment), rule })) });
}
