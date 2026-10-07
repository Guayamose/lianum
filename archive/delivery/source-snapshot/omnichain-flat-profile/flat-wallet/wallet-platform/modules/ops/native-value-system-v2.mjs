/** Genuine-artifact-bound new native-value graph-only local bootstrap. This module never starts an EVM or owns its
 * lifecycle. Only a golden createLocalEvm capability can receive deployments.
 * Importing it loads no artifacts, compiler, prover, backend or runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments,
  nativeProofCalldata } from '../../../../../omnichain-product/src/paeg/native-deployment.mjs';
import { linkPrivateBytecode } from '../../../../../omnichain-product/src/private-asset-runtime.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { exactRecord, fixedArray, canonicalField, PROFILE_FIELD } from '../paeg/commitments.mjs';
import { buildNativeValueDeploymentPlan } from './native-value-deployment-plan-v2.mjs';
import { NATIVE_VALUE_LEDGER_ROLES, NATIVE_VALUE_VERIFIER_ORDER as FLAT_VERIFIER_ORDER, loadNativeValueDeploymentArtifacts } from './native-value-deployment-artifacts-v2.mjs';
import { assertNativeValueOperatorBootstrap, provisionNativeValueOperators, finishNativeValueOperators } from './native-value-local-operator-bootstrap-v4.mjs';
import { consumeNativeValueOperatorBootstrapRequest } from './native-value-operators-v4.mjs';
import { verifyNativeValueConstructorStorage } from './native-value-deployment-checks-v2.mjs';
import { NATIVE_VALUE_SOURCE_CLOSURE, NATIVE_VALUE_REQUIRED_ARTIFACTS } from './native-value-wallet-release-v4.mjs';
export { NATIVE_VALUE_SOURCE_CLOSURE };
export const NATIVE_VALUE_SYSTEM_PROFILE = 'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2';
export const NATIVE_VALUE_ACTIVATION_BLOCKERS = NATIVE_VALUE_REQUIRED_ARTIFACTS;
import { assertOwnedPoolAsset, createNativePoolAsset } from '../chain-adapters/owned-pool-asset.mjs';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const ownedSystems = new WeakMap(), activeDeployments = new WeakSet();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const keccak = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const encodedWords = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
const digest = value => { assert.match(value, /^0x[0-9a-f]{64}$/, 'NATIVE_VALUE_DEPLOY_DIGEST'); return value; };
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/, 'NATIVE_VALUE_DEPLOY_ADDRESS'); return value; };
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
      if (Object.hasOwn(descriptor, 'value')) freeze(descriptor.value);
    Object.freeze(value);
  }
  return value;
}
async function drained(work) {
  const results = await Promise.allSettled(work.map(fn=>Promise.resolve().then(fn)));
  const failure = results.find(row=>row.status==='rejected');
  if(failure)throw failure.reason;return results.map(row=>row.value);
}
const canonicalType = input => input.type.startsWith('tuple')
  ? '(' + input.components.map(canonicalType).join(',') + ')' + input.type.slice(5) : input.type;
const libraryType = input => input.type.startsWith('tuple')
  ? input.internalType.replace(/^struct /, '') : input.type;
function method(artifact, signature) {
  const matches = artifact.abi.filter(item => item.type === 'function'
    && [canonicalType, libraryType].some(type => item.name + '(' + item.inputs.map(type).join(',') + ')' === signature));
  assert.equal(matches.length, 1, 'NATIVE_VALUE_DEPLOY_EXACT_ABI_METHOD');
  // Solidity library selectors retain nominal struct names even though their
  // argument words use the same static tuple encoding. Use the actual pinned
  // compiler identifier, never a guessed tuple selector for a library method.
  const identifiers = [canonicalType, libraryType].map(type => matches[0].name + '(' + matches[0].inputs.map(type).join(',') + ')');
  const actualSignature = identifiers.find(key => Object.hasOwn(artifact.evm.methodIdentifiers, key));
  assert.ok(actualSignature, 'NATIVE_VALUE_DEPLOY_COMPILER_METHOD_IDENTIFIER');
  const selector = publicKeccak256(Buffer.from(actualSignature)).subarray(0, 4).toString('hex');
  assert.equal(artifact.evm.methodIdentifiers[actualSignature], selector, 'NATIVE_VALUE_DEPLOY_METHOD_SELECTOR');
  return { abi: matches[0], selector };
}
function staticArguments(inputs, values) {
  fixedArray(values, inputs.length);
  const scalarInputs = [], scalarValues = [];
  function flatten(input, value) {
    const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
    if (fixed) {
      const length = Number(fixed[2]); assert.ok(length <= 128, 'NATIVE_VALUE_DEPLOY_STATIC_ARRAY'); fixedArray(value, length);
      for (const child of value) flatten({ ...input, type: fixed[1] }, child);
    } else if (input.type === 'tuple') {
      exactRecord(value, input.components.map(item => item.name));
      for (const item of input.components) flatten(item, value[item.name]);
    } else {
      assert.equal(input.components, undefined, 'NATIVE_VALUE_DEPLOY_STATIC_SCALAR');
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
export function assertOwnedNativeValueSystem(runtime, system) {
  assert.ok(ownedSystems.has(system) && ownedSystems.get(system).runtime === runtime, 'NATIVE_VALUE_OWNED_DEPLOYMENT_REQUIRED');
  ownedSystems.get(system).assertLive();
}

export function nativeValueOperatorResources(runtime, system, request) {
  assertOwnedNativeValueSystem(runtime, system);
  const entry = consumeNativeValueOperatorBootstrapRequest(request, { runtime, system });
  assert.deepEqual(entry.publicKey, system.registry.quorum.keys[entry.signerIndex]);
  return ownedSystems.get(system).operators[entry.signerIndex];
}
function checkedOptions(runtime, options) {
  exactRecord(options, ['deploymentDomain','registryEpoch','pools','bootstrap']);
  const metadata = assertNativeValueOperatorBootstrap(options.bootstrap);
  const deploymentDomain = digest(options.deploymentDomain);
  assert.notEqual(deploymentDomain, ZERO32, 'NATIVE_VALUE_DEPLOY_DOMAIN');
  assert.equal(typeof options.registryEpoch, 'string');
  assert.match(options.registryEpoch, /^(0|[1-9][0-9]*)$/);assert.ok(BigInt(options.registryEpoch)<1n<<64n);
  fixedArray(options.pools, 2);
  const pools = options.pools.map(pool => {
    exactRecord(pool, ['policy', 'deploymentDomain', ...(Object.hasOwn(pool,'assetCapability') ? ['assetCapability'] : [])]);
    const policy = digest(pool.policy), deploymentDomain = digest(pool.deploymentDomain);
    assert.ok(policy !== ZERO32 && deploymentDomain !== ZERO32);
    if (Object.hasOwn(pool,'assetCapability')) assertOwnedPoolAsset(runtime,pool.assetCapability);
    return {policy,deploymentDomain,assetCapability:pool.assetCapability,
      asset:pool.assetCapability?.metadata.address??ZERO_ADDRESS,assetCodeHash:pool.assetCapability?.metadata.codeHash??ZERO32};
  });
  assert.notEqual(pools[0].policy,pools[1].policy);assert.notEqual(pools[0].deploymentDomain,pools[1].deploymentDomain);
  return { deploymentDomain, registryEpoch:options.registryEpoch, rulesRoot:metadata.rulesRoot,
    attesterKeys:metadata.attesterKeys, adapterProfiles:metadata.adapterProfiles, bootstrap:options.bootstrap, pools };
}
function viewFacade(runtime, record, artifact) {
  const facade = { ...record, artifact, selectors: artifact.evm.methodIdentifiers,
    data: (signature, args = []) => staticData(artifact, signature, args),
    call: async (signature, args = [], block = 'latest') => {
      const entry = method(artifact, signature);
      assert.ok(['view', 'pure'].includes(entry.abi.stateMutability), 'NATIVE_VALUE_DEPLOY_READ_ONLY_METHOD');
      return runtime.call({ to: record.address, data: staticData(artifact, signature, args) }, block);
    } };
  return facade;
}
async function unchangedHead(runtime, header) {
  await runtime.assertCanonical(header);
  const current = await runtime.block();
  assert.equal(current.number, header.number, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
}
async function expectedCodeAt(runtime, record, block) {
  const actual = await runtime.code(record.address, block);
  assert.equal(actual.toLowerCase(), record.expectedCode, 'NATIVE_VALUE_DEPLOY_COMPLETE_RUNTIME_MISMATCH');
  assert.equal(keccak(actual), record.codeHash, 'NATIVE_VALUE_DEPLOY_RUNTIME_HASH_MISMATCH');
}
function rawWords(raw, count) {
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'NATIVE_VALUE_DEPLOY_RETURN_WORDS');
  assert.equal(raw.length, 2 + 64 * count, 'NATIVE_VALUE_DEPLOY_RETURN_LENGTH');
  return Array.from({ length: count }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
/** Deploy only the exact reviewed new-profile verifier bundle and linked ledgers.
 * Options contain public policy/domain data and an ORIGINAL private bootstrap.
 * No receipt observer, source override, claims bootstrap or authority flag exists.
 * Native-value execution is not backing; this path exposes no CI/CO authority. */
export async function deployNativeValueSystem(input) {
  exactRecord(input, ['runtime','options']); const { runtime, options } = input;
  // All evidence is checked before ownership, allocation or the first send.
  const loadedBundle = await loadNativeValueDeploymentArtifacts();
  await assertLocalEvm(runtime);
  assert.ok(!activeDeployments.has(runtime), 'NATIVE_VALUE_DEPLOY_CONCURRENT_BOOTSTRAP');
  const configuration = checkedOptions(runtime, options), sender = address(runtime.accounts[0]);
  assert.equal(runtime.metadata.chainId, '31337', 'NATIVE_VALUE_DEPLOY_LOCAL_CHAIN');
  const deployments = [], registrationReceipts = [], generatedLibraries = new Map(), visiting = new Set();
  let plan, bundle;
  activeDeployments.add(runtime);
  try {
    let nativeAsset;
    for (const pool of configuration.pools) {
      if (!pool.assetCapability) pool.assetCapability = nativeAsset ??= await createNativePoolAsset({ runtime });
      assertOwnedPoolAsset(runtime, pool.assetCapability);
    }
    // Read every asset before any deployment. Only authenticated immutable
    // address/code pins cross into the pure deployment planner below.
    const assetHeader = await runtime.block();
    for (const pool of configuration.pools) {
      const observed = await pool.assetCapability.read({ holder: sender, blockNumber: assetHeader.number });
      assert.equal(observed.blockHash, assetHeader.hash, 'NATIVE_VALUE_DEPLOY_ASSET_BLOCK_HASH');
    }
    await unchangedHead(runtime, assetHeader);
    // All generated source/key/compiler validation completes before first send.
    bundle = loadedBundle;
    async function deploy(source, contractName, artifact, immutableNames, immutableValues, links = {}, planned) {
      const nonce = await runtime.nonce(sender, 'pending');
      const target = predictNativeCreateAddress(sender, nonce);
      if (planned) {
        assert.equal(nonce.toString(), planned.nonce, 'NATIVE_VALUE_DEPLOY_NONCE_CHANGED');
        assert.equal(target, planned.address, 'NATIVE_VALUE_DEPLOY_PLANNED_ADDRESS');
      }
      assert.equal(await runtime.code(target), '0x', 'NATIVE_VALUE_DEPLOY_CREATE_ADDRESS_OCCUPIED');
      const astLibrary = contractName !== 'HonkVerifier' && !['PrivateFlatReceiptHubNativeValueV2', 'PrivateFlatAssetNotePool'].includes(contractName);
      const guardedLibrary = astLibrary && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object);
      const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target, libraries: links,
        immutableNames, immutableValues, isLibrary: guardedLibrary });
      const constructorInputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
      const constructorData = planned?.constructorData ?? staticArguments(constructorInputs, []);
      const creationData = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, links) + constructorData.slice(2);
      assert.ok((expectedCode.length-2)/2<=24576,'NATIVE_VALUE_DEPLOY_RUNTIME_LIMIT');
      assert.ok((creationData.length - 2) / 2 <= 49152, 'NATIVE_VALUE_DEPLOY_INITCODE_LIMIT');
      if (planned) {
        assert.equal(expectedCode, planned.runtimeCode, 'NATIVE_VALUE_DEPLOY_PLANNED_RUNTIME');
        assert.equal(creationData, planned.creationData, 'NATIVE_VALUE_DEPLOY_PLANNED_CREATION');
      }
      const expectedHash = keccak(expectedCode);
      const receipt = await runtime.send('deploy flat ' + source + ':' + contractName, { from: sender, data: creationData });
      assert.equal(address(receipt.contractAddress), target, 'NATIVE_VALUE_DEPLOY_ACTUAL_ADDRESS');
      const records = runtime.transactions.filter(record => record.transactionHash === receipt.transactionHash);
      assert.equal(records.length, 1, 'NATIVE_VALUE_DEPLOY_TRANSACTION_RECORD');
      const transaction = records[0];
      assert.equal(transaction.phase, 'mined'); assert.equal(transaction.request.from, sender);
      assert.equal(BigInt(transaction.senderNonce), nonce); assert.equal(transaction.request.data, creationData);
      assert.equal(BigInt(transaction.request.value ?? '0x0'), 0n, 'NATIVE_VALUE_DEPLOY_NO_VALUE');
      assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'NATIVE_VALUE_DEPLOY_NEXT_NONCE');
      await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
      const record = { source, contractName, address: target, nonce: nonce.toString(), receipt, expectedCode,
        runtimeCode: expectedCode, codeHash: expectedHash, runtimeBytes: (expectedCode.length - 2) / 2,
        libraries: { ...links }, immutableValues, constructorData, creationSHA256: sha(Buffer.from(creationData.slice(2), 'hex')),
        proofAcceptanceClaim: false };
      await expectedCodeAt(runtime, record, receipt.blockNumber);
      assert.equal(await runtime.keccak(expectedCode), expectedHash, 'NATIVE_VALUE_DEPLOY_INDEPENDENT_KECCAK');
      freeze(record); deployments.push(record); return record;
    }
    const libraries = {};
    for (const role of ['poseidon2Domains', 'hubCodec']) {
      const [source, name] = NATIVE_VALUE_LEDGER_ROLES[role], artifact = bundle.ledger.artifacts[role];
      libraries[role] = viewFacade(runtime, await deploy(source, name, artifact, {}, {}), artifact);
    }
    async function verifierLinks(entry, artifact) {
      const links = {};
      for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences]) {
        for (const [source, names] of Object.entries(references ?? {})) for (const name of Object.keys(names)) {
          assert.equal(source, entry.source, 'NATIVE_VALUE_DEPLOY_CROSS_SOURCE_LIBRARY');
          const key = source + ':' + name;
          if (!generatedLibraries.has(key)) {
            assert.ok(!visiting.has(key), 'NATIVE_VALUE_DEPLOY_CYCLIC_LIBRARY'); visiting.add(key);
            const library = entry.contracts[name]; assert.ok(library, 'NATIVE_VALUE_DEPLOY_MISSING_LIBRARY');
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
    const planningHeader = await runtime.block();
    await expectedCodeAt(runtime, libraries.poseidon2Domains, planningHeader.number);
    const hashFields = async fields => {
      fixedArray(fields, 18);
      assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, 1n, 14n], 'NATIVE_VALUE_DEPLOY_DOMAIN_PURPOSE');
      const values = [];
      for (let index = 4; index < fields.length; index += 2) {
        const high = fields[index], low = fields[index + 1];
        assert.ok(typeof high === 'bigint' && high >= 0n && high < 1n << 128n
          && typeof low === 'bigint' && low >= 0n && low < 1n << 128n, 'NATIVE_VALUE_DEPLOY_DOMAIN_LIMBS');
        values.push('0x' + high.toString(16).padStart(32, '0') + low.toString(16).padStart(32, '0'));
      }
      const raw = await libraries.poseidon2Domains.call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)', values, planningHeader.number);
      const result = rawWords(raw, 1)[0].slice(2); canonicalField(result, true);
      await unchangedHead(runtime, planningHeader); return result;
    };
    plan = await buildNativeValueDeploymentPlan({ bundle,
      chainId: '31337', sender, nextNonce: (await runtime.nonce(sender, 'pending')).toString(),
      deploymentDomain: configuration.deploymentDomain, registryEpoch: configuration.registryEpoch,
      rulesRoot: configuration.rulesRoot, attesterKeys: configuration.attesterKeys, adapterProfiles: configuration.adapterProfiles,
      pools: configuration.pools.map(({ assetCapability, ...pool }) => pool),
      libraries: Object.fromEntries(Object.entries(libraries).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
      verifiers: Object.fromEntries(Object.entries(verifiers).map(([role, value]) => [role, { address: value.address, codeHash: value.codeHash }])),
 }, { hashFields });
    await unchangedHead(runtime, planningHeader);
    const hub = viewFacade(runtime, await deploy('native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol', 'PrivateFlatReceiptHubNativeValueV2', bundle.ledger.artifacts.hub,
      bundle.ledger.immutableNames.hub, plan.hub.immutableValues, plan.links, plan.hub), bundle.ledger.artifacts.hub);
    const pools = [];
    for (const [index, projected] of plan.pools.entries()) {
      const record = await deploy('PrivateFlatAssetNotePool.sol', 'PrivateFlatAssetNotePool', bundle.ledger.artifacts.pool,
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
    const bootstrap = await verifyNativeValueConstructorStorage(runtime, hub, pools, libraries, verifiers, [...generatedLibraries.values()], plan);
    const commonAsset = pools.every(pool => pool.asset === pools[0].asset && pool.assetCodeHash === pools[0].assetCodeHash)
      ? pools[0] : null;
    const system = { classification: 'OWNED_LOCAL_NATIVE_VALUE_GRAPH_ONLY_SYSTEM_NOT_PROOF_ACCEPTANCE',
      profile:NATIVE_VALUE_SYSTEM_PROFILE, claimsEnabled:false, adapterProfiles:plan.adapterProfiles, chainId: '31337', sender,
      plan, hub, pools, libraries, generatedLibraries: Object.fromEntries(generatedLibraries), verifiers,
      registry: plan.registry, hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment,
      verifierSetCommitment: plan.verifierSetCommitment, ledgerNamespace: plan.ledgerNamespace,
      asset: commonAsset?.asset ?? null, assetCodeHash: commonAsset?.assetCodeHash ?? null,
      assetIdentity: commonAsset?.assetIdentity ?? null, assetMetadata: commonAsset?.assetMetadata ?? null,
      assetCapability: commonAsset?.assetCapability ?? null,
      deployments: [...deployments], registrationReceipts: [...registrationReceipts], bootstrap,
      provenance: bundle.provenance,
      verify: async (role, proof, publicInputs, block = 'latest') => {
        assertOwnedNativeValueSystem(runtime, system); await assertLocalEvm(runtime);
        const spec = FLAT_VERIFIER_ORDER.find(([name]) => name === role); assert.ok(spec, 'NATIVE_VALUE_DEPLOY_VERIFIER_ROLE');
        fixedArray(publicInputs, spec[1]);
        const verifier = verifiers[role]; await expectedCodeAt(runtime, verifier, block);
        const raw = await runtime.call({ to: verifier.address,
          data: nativeProofCalldata(verifier.artifact, 'verify(bytes,bytes32[])', proof, publicInputs) }, block);
        assert.ok(raw === encodedWords([0]) || raw === encodedWords([1]), 'NATIVE_VALUE_DEPLOY_VERIFIER_BOOLEAN');
        return raw === encodedWords([1]);
      },
      assetBalance: (holder, block = 'latest') => {
        assert.ok(commonAsset, 'NATIVE_VALUE_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET');
        return commonAsset.assetCapability.balance(holder, block);
      },
      get receipts() { return freeze(structuredClone(runtime.receipts)); },
    };
    const operatorResources = await provisionNativeValueOperators(configuration.bootstrap, {
      runtime, registry:plan.registry, adapterProfiles:plan.adapterProfiles });
    // No caller receives this object until all four binds and the final full
    // canonical receiver snapshot succeed. Any failure revokes the private brand.
    const live = () => { assertNativeValueOperatorBootstrap(configuration.bootstrap); };
    ownedSystems.set(system, { runtime, operators:operatorResources, assertLive:live });
    try {
      const handles = await finishNativeValueOperators(configuration.bootstrap,{runtime,system});
      system.operators = handles.operators; system.quorum = handles.quorum;
      freeze(system);
      const { createNativeValueSystemStateReader } = await import('../paeg/native-value-system-state-v2.mjs');
      const readers = await drained([0,1].map(poolIndex=>()=>createNativeValueSystemStateReader({runtime,system,poolIndex})));
      const views = await drained(readers.map(reader=>()=>reader.read()));
      assert.deepEqual(views[0].head,views[1].head,'NATIVE_VALUE_BOOTSTRAP_COMMON_HEAD');
      await drained(readers.map((reader,i)=>()=>reader.assertCurrent(views[i])));
      live();await assertLocalEvm(runtime);return system;
    } catch(cause) { ownedSystems.delete(system);try{configuration.bootstrap.close();}catch{}throw cause; }
  } catch (error) {
    // Observers can throw primitive values or frozen errors. Always attach
    // retained evidence to our own writable error without losing the cause.
    const failure = new Error('NATIVE_VALUE_DEPLOYMENT_FAILED', { cause: error });
    failure.partialDeployments = [...deployments]; failure.registrationReceipts = [...registrationReceipts];
    failure.localReceipts = runtime.receipts; failure.localTransactions = runtime.transactions;
    if (plan) failure.deploymentPlan = plan;
    if (bundle) failure.artifactProvenance = bundle.provenance;
    throw failure;
  } finally { activeDeployments.delete(runtime); }
}
