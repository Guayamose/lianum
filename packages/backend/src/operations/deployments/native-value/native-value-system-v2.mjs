import { assertNativeValueRegistrations } from './native-value-registry-v2.mjs';
import {nativeSourceRecoverySectionIdentityV1,retainOriginalNativeSourceSectionV1,consumeOriginalNativeSourceSectionV1,resumeOriginalNativeSourceSectionV1,updateOriginalNativeSourceSectionV1} from '../../recovery/native-original-source-capsule-v1.mjs';
import {assertOwnedNativeDurableSourceReceiverV1} from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
/** Genuine-artifact-bound new native-value graph-only local bootstrap. This module never starts an EVM or owns its
 * lifecycle. Only a golden createLocalEvm capability can receive deployments.
 * Importing it loads no artifacts, compiler, prover, backend or runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments,
  nativeProofCalldata } from '../../../execution/native/dispatch/native-deployment.mjs';
import { linkPrivateBytecode } from '@lianum/engine/notes/private-asset-runtime';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry } from '@lianum/engine/evidence/native-quorum';
import { exactRecord, fixedArray, canonicalField, PROFILE_FIELD } from '@lianum/components/encoding/commitments';
import { buildNativeValueDeploymentPlan } from './native-value-deployment-plan-v2.mjs';
import { NATIVE_VALUE_LEDGER_ROLES, NATIVE_VALUE_VERIFIER_ORDER as FLAT_VERIFIER_ORDER, loadNativeValueDeploymentArtifacts, loadNativeValueDevDeploymentArtifactsV5 } from './native-value-deployment-artifacts-v2.mjs';
import { assertNativeValueOperatorBootstrap, provisionNativeValueOperators, finishNativeValueOperators, assertNativeBootstrapEconomicCaptureV1 } from '../../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { consumeNativeValueOperatorBootstrapRequest } from '../../operators/native-value/native-value-operators-v4.mjs';
import { verifyNativeValueConstructorStorage } from './native-value-deployment-checks-v2.mjs';
import { NATIVE_VALUE_SOURCE_CLOSURE, NATIVE_VALUE_REQUIRED_ARTIFACTS } from '../../releases/native-value/native-value-wallet-release-v4.mjs';
export { NATIVE_VALUE_SOURCE_CLOSURE };
export const NATIVE_VALUE_SYSTEM_PROFILE = 'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2';
export const NATIVE_VALUE_ACTIVATION_BLOCKERS = NATIVE_VALUE_REQUIRED_ARTIFACTS;
import { assertOwnedPoolAsset, createNativePoolAsset } from '../../../chains/shared/contracts/owned-pool-asset.mjs';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const ownedSystems = new WeakMap(), observationSystems = new WeakMap(), activeDeployments = new WeakSet(), economicCaptures=new WeakMap();
import {assertNativeEconomicRecoveryCaptureV1,nativeEconomicRecoverySectionIdentityV1,consumeNativeEconomicRecoverySectionV1} from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
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
  const entry=ownedSystems.get(system);assert.ok(!entry.capturing&&!entry.closed,'NATIVE_VALUE_ECONOMIC_SYSTEM_FENCED_OR_CLOSED');entry.assertLive();
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
  exactRecord(input, ['runtime','options']);
  const loadedBundle = await loadNativeValueDeploymentArtifacts();
  return deployFixedNativeValueSystem(input, loadedBundle);
}
/** Separate development publication, same genuine private deployment brand.
 * Caller options have no release/path/bundle/loader/assertion callback. */
export async function deployNativeValueDevSystemV5(input) {
  assert.equal(arguments.length, 1, 'NATIVE_VALUE_DEV_DEPLOY_NO_CALLER_OVERRIDE');
  exactRecord(input, ['runtime','options']);
  const loadedBundle = await loadNativeValueDevDeploymentArtifactsV5();
  return deployFixedNativeValueSystem(input, loadedBundle);
}
async function deployFixedNativeValueSystem(input, loadedBundle) {
  const { runtime, options } = input;
  // Every fixed artifact fence completes before ownership/allocation/first send.
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
    ownedSystems.set(system, { runtime, operators:operatorResources, assertLive:live, bundle, originalBootstrap:configuration.bootstrap, capturing:false,closed:false, close:()=>configuration.bootstrap.close() });
    try {
      const handles = await finishNativeValueOperators(configuration.bootstrap,{runtime,system});
      system.operators = handles.operators; system.quorum = handles.quorum;
      freeze(system);
      const { createNativeValueSystemStateReader } = await import('../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs');
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


/** Read-only brand is intentionally not accepted by assertOwnedNativeValueSystem.
 * Only the fixed native issuer can reconstruct it after encrypted retention. */
/** Source identity of an authentic economic system. A D26 observation facade
 * cannot provide the original recovery identity or become an economic system. */
export function nativeValueOriginalRecoverySourceV1(runtime,system){
  assert.equal(arguments.length,2);assertOwnedNativeValueSystem(runtime,system);
  const source=ownedSystems.get(system).bundle.provenance.hostSourceClosureSHA256;
  assert.match(source,/^[0-9a-f]{64}$/,'NATIVE_VALUE_ORIGINAL_RECOVERY_SOURCE');return source;
}
export function assertOwnedNativeValueObservationSystemV1(runtime,system) {
  if(ownedSystems.has(system))return assertOwnedNativeValueSystem(runtime,system);
  const retained=observationSystems.get(system);
  assert.ok(retained&&retained.runtime===runtime,'NATIVE_D26_ORIGINAL_OBSERVATION_SYSTEM');
  assert.equal(retained.closed,false,'NATIVE_D26_OBSERVATION_CLOSED');
}
const observationRecordFields=['source','contractName','address','nonce','receipt','expectedCode','runtimeCode',
  'codeHash','runtimeBytes','libraries','immutableValues','constructorData','creationSHA256','proofAcceptanceClaim'];
function observationRecord(value){return Object.fromEntries(observationRecordFields.map(name=>[name,structuredClone(value[name])]));}
function observationArtifactSHA(artifact){return createHash('sha256').update(observationCanonical(artifact)).digest('hex');}
import {canonicalClaimRecordDataV1 as observationCanonical} from '@lianum/engine/storage/records';
export async function captureNativeValueD26ObservationSystemV1(runtime,system) {
  assert.equal(arguments.length,2);assertOwnedNativeValueSystem(runtime,system);
  return captureNativeSystemRecord(runtime,system,()=>assertOwnedNativeValueSystem(runtime,system),'ORIGINAL_NATIVE_D26_OBSERVATION_SYSTEM_V1');
}
async function captureNativeSystemRecord(runtime,system,assertCapture,schema){
  assertCapture();await assertLocalEvm(runtime);
  assert.ok(system.pools.every(pool=>pool.asset===ZERO_ADDRESS),'NATIVE_D26_RECOVERY_NATIVE_ASSET_ONLY');
  const before=await runtime.block();
  const records=[system.hub,...system.pools,...Object.values(system.libraries),...Object.values(system.verifiers),...Object.values(system.generatedLibraries)];
  for(const record of records){await expectedCodeAt(runtime,record,before.number);await runtime.checkReceipt(record.receipt);await runtime.assertCanonical(record.receipt);}
  const pins=Object.fromEntries(records.map(record=>[record.address,observationArtifactSHA(record.artifact)]));
  const metadata=Object.fromEntries(['classification','profile','claimsEnabled','adapterProfiles','chainId','sender','plan','registry',
    'hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace','bootstrap'].map(name=>[name,structuredClone(system[name])]));
  const record={schema,metadata,pins,
    hub:observationRecord(system.hub),pools:system.pools.map(pool=>({...observationRecord(pool),
      ...Object.fromEntries(['scope','policy','asset','assetCodeHash','assetIdentity','domain','domainCommitment','assetMetadata'].map(name=>[name,structuredClone(pool[name])]))})),
    libraries:Object.fromEntries(Object.entries(system.libraries).map(([name,value])=>[name,observationRecord(value)])),
    verifiers:Object.fromEntries(Object.entries(system.verifiers).map(([name,value])=>[name,observationRecord(value)])),
    generatedLibraries:Object.fromEntries(Object.entries(system.generatedLibraries).map(([name,value])=>[name,observationRecord(value)])),
    genesis:runtime.metadata.evmGenesis,head:structuredClone(before),
    retainedHostSourceSHA256:ownedSystems.get(system).bundle.provenance.hostSourceClosureSHA256};
  await unchangedHead(runtime,before);assertCapture();return record;
}
export function stopCapturedNativeValueD26ObservationSystemV1(runtime,system) {
  assert.equal(arguments.length,2);assertOwnedNativeValueSystem(runtime,system);ownedSystems.get(system).close();
  return {closed:true,economicSystemRevoked:true};
}
export async function reopenNativeValueD26ObservationSystemV1(token,runtime) {
  assert.equal(arguments.length,2);
  const {consumeNativeD26ObservationSectionV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const retained=consumeNativeD26ObservationSectionV1(token,'deviceD26'),capture=retained.system;
  assert.equal(capture.schema,'ORIGINAL_NATIVE_D26_OBSERVATION_SYSTEM_V1');
  const {bundle,header,hub,pools,libraries,verifiers,generatedLibraries}=await restoreNativeSystemParts(runtime,capture);
  const system={...capture.metadata,hub,pools,libraries,verifiers,generatedLibraries};
  const entry={runtime,closed:false};observationSystems.set(system,entry);freeze(system);
  try{
    const {createNativeValueObservationStateReaderV1}=await import('../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs');
    for(const poolIndex of [0,1]){const reader=await createNativeValueObservationStateReaderV1({runtime,system,poolIndex});const view=await reader.read();await reader.assertCurrent(view);}
    await unchangedHead(runtime,header);
    return {system,deposit:retained,close(){entry.closed=true;}};
  }catch(error){entry.closed=true;throw error;}
}

async function restoreNativeSystemParts(runtime,capture){
  // Fixed genuine loader checks all 12 retained/program/VK/ABI/runtime roles.
  // Captured address/immutable data is AEAD-authenticated original output, never
  // caller-selected artifact or pin; derive the complete code again below.
  const bundle=await loadNativeValueDevDeploymentArtifactsV5();await assertLocalEvm(runtime);
  assert.equal(runtime.metadata.evmGenesis,capture.genesis,'NATIVE_D26_RECOVERY_GENESIS_CHANGED');
  assert.equal(runtime.metadata.chainId,'31337');assert.equal(capture.metadata.sender,runtime.accounts[0]);
  assert.equal(capture.metadata.profile,NATIVE_VALUE_SYSTEM_PROFILE);assert.equal(capture.metadata.claimsEnabled,false);
  assert.equal(Object.keys(capture.verifiers).length,FLAT_VERIFIER_ORDER.length);
  assert.deepEqual(Object.keys(capture.verifiers).sort(),FLAT_VERIFIER_ORDER.map(([role])=>role).sort());
  const header=await runtime.block();await runtime.assertCanonical(capture.head);
  function artifact(record){
    for(const [role,[source,name]]of Object.entries(NATIVE_VALUE_LEDGER_ROLES))
      if(record.source===source&&record.contractName===name)return bundle.ledger.artifacts[role];
    const matches=Object.values(bundle.verifiers).filter(entry=>entry.source===record.source);
    assert.equal(matches.length,1,'NATIVE_D26_RECOVERY_FIXED_ARTIFACT');
    return record.contractName==='HonkVerifier'?matches[0].artifact:matches[0].contracts[record.contractName];
  }
  async function restore(record){
    const fixed=artifact(record);assert.ok(fixed,'NATIVE_D26_RECOVERY_FIXED_ARTIFACT');
    assert.equal(observationArtifactSHA(fixed),capture.pins[record.address],'NATIVE_D26_RECOVERY_ARTIFACT_CHANGED');
    const astLibrary=record.contractName!=='HonkVerifier'&&!['PrivateFlatReceiptHubNativeValueV2','PrivateFlatAssetNotePool'].includes(record.contractName);
    const isLibrary=astLibrary&&/^73(?:00){20}3014/.test(fixed.evm.deployedBytecode.object);
    const expected=deriveNativeRuntimeCode({artifact:fixed,deployedAddress:record.address,libraries:record.libraries,
      immutableNames:record.contractName==='HonkVerifier'?Object.values(bundle.verifiers).find(entry=>entry.source===record.source).immutableNames:
        record.contractName==='PrivateFlatReceiptHubNativeValueV2'?bundle.ledger.immutableNames.hub:
        record.contractName==='PrivateFlatAssetNotePool'?bundle.ledger.immutableNames.pool:{},
      immutableValues:record.immutableValues,isLibrary});
    assert.equal(expected,record.expectedCode,'NATIVE_D26_RECOVERY_PINNED_RUNTIME');assert.equal(record.runtimeCode,expected);
    const creation='0x'+linkPrivateBytecode(fixed.evm.bytecode.object,fixed.evm.bytecode.linkReferences,record.libraries)+record.constructorData.slice(2);
    assert.equal(sha(Buffer.from(creation.slice(2),'hex')),record.creationSHA256,'NATIVE_D26_RECOVERY_PINNED_CREATION');
    assert.equal(record.proofAcceptanceClaim,false);assert.equal(record.runtimeBytes,(expected.length-2)/2);
    assert.equal(keccak(expected),record.codeHash);await expectedCodeAt(runtime,record,header.number);
    assert.equal(predictNativeCreateAddress(capture.metadata.sender,BigInt(record.nonce)),record.address);
    await runtime.checkReceipt(record.receipt);await runtime.assertCanonical(record.receipt);
    const wire=runtime.transactions.filter(row=>row.transactionHash===record.receipt.transactionHash);
    assert.equal(wire.length,1,'NATIVE_D26_RECOVERY_ORIGINAL_DEPLOYMENT_WIRE');
    assert.equal(wire[0].phase,'mined');assert.equal(wire[0].request.from,capture.metadata.sender);
    assert.equal(BigInt(wire[0].senderNonce),BigInt(record.nonce));assert.equal(wire[0].request.data,creation);
    assert.equal(BigInt(wire[0].request.value??'0x0'),0n);assert.equal(record.receipt.contractAddress,record.address);
    assert.equal(sha(Buffer.from(wire[0].request.data.slice(2),'hex')),record.creationSHA256);
    return viewFacade(runtime,record,fixed);
  }
  const libraries={},verifiers={},generatedLibraries={};
  for(const [name,value]of Object.entries(capture.libraries))libraries[name]=await restore(value);
  for(const [role]of FLAT_VERIFIER_ORDER)verifiers[role]={...await restore(capture.verifiers[role]),lineage:bundle.verifiers[role].lineage};
  for(const [name,value]of Object.entries(capture.generatedLibraries))generatedLibraries[name]=await restore(value);
  const hub=await restore(capture.hub),nativeAsset=await createNativePoolAsset({runtime}),pools=[];
  for(const record of capture.pools){assert.equal(record.asset,ZERO_ADDRESS);assert.deepEqual(record.assetMetadata,nativeAsset.metadata);
    pools.push({...await restore(record),...record,assetCapability:nativeAsset});}
  return {bundle,header,hub,pools,libraries,verifiers,generatedLibraries};
}

/** Only the fixed economic native issuer can retain/reopen this original brand.
 * D26 observation capability and public deployment records grant no economics. */
export function fenceOriginalNativeSystemEconomicRecoveryV1(runtime,system,authority){
 assert.equal(arguments.length,3);assert.equal(sourceSystems.has(system),false,'NATIVE_SOURCE_DISTINCT_SYSTEM_ISSUER');const identity=assertNativeEconomicRecoveryCaptureV1(authority),entry=ownedSystems.get(system);
 assert.ok(entry&&entry.runtime===runtime&&!entry.capturing&&!entry.closed,'NATIVE_VALUE_ORIGINAL_ECONOMIC_SYSTEM_REQUIRED');
 assertNativeBootstrapEconomicCaptureV1(entry.originalBootstrap,{runtime,system,authority});
 assert.equal(identity.sourceSHA256,entry.bundle.provenance.hostSourceClosureSHA256,'NATIVE_VALUE_ECONOMIC_CAPTURE_ORIGINAL_SOURCE');
 entry.capturing=true;economicCaptures.set(system,{runtime,identity,captured:false,token:null});
}
export async function captureOriginalNativeSystemEconomicRecoveryV1(runtime,system,token){
 assert.equal(arguments.length,3);const identity=nativeEconomicRecoverySectionIdentityV1(token,'system'),capture=economicCaptures.get(system),entry=ownedSystems.get(system);
 const check=()=>{assert.ok(capture&&entry&&entry.runtime===runtime&&capture.runtime===runtime&&entry.capturing&&!entry.closed,'NATIVE_VALUE_ECONOMIC_CAPTURE_FENCE_REQUIRED');
   assert.deepEqual(capture.identity,identity,'NATIVE_VALUE_ECONOMIC_CAPTURE_AUTHORITY_REBOUND');};
 check();assert.equal(capture.captured,false,'NATIVE_VALUE_ECONOMIC_SYSTEM_CAPTURE_ONCE');capture.token=token;
 const record=await captureNativeSystemRecord(runtime,system,check,'ORIGINAL_NATIVE_SYSTEM_ECONOMIC_RECOVERY_V1');
 record.registrationReceipts=structuredClone(system.registrationReceipts);record.deployments=system.deployments.map(observationRecord);
 capture.captured=true;return record;
}
export function stopCapturedNativeSystemEconomicRecoveryV1(runtime,system,token){
 assert.equal(arguments.length,3);nativeEconomicRecoverySectionIdentityV1(token,'system');const capture=economicCaptures.get(system),entry=ownedSystems.get(system);
 assert.ok(capture&&entry&&entry.runtime===runtime&&entry.capturing&&capture.captured&&!entry.closed,'NATIVE_VALUE_ECONOMIC_SYSTEM_CAPTURE_REQUIRED');
 assert.equal(capture.token,token);entry.closed=true;ownedSystems.delete(system);return {closed:true,originalResourcesStopped:true};
}
export function abortNativeSystemEconomicRecoveryV1(runtime,system,token){
 assert.equal(arguments.length,3);nativeEconomicRecoverySectionIdentityV1(token,'system');const capture=economicCaptures.get(system),entry=ownedSystems.get(system);
 assert.ok(capture&&capture.runtime===runtime,'NATIVE_VALUE_ECONOMIC_CAPTURE_FENCE_REQUIRED');if(capture.token)assert.equal(capture.token,token);
 if(entry)entry.closed=true;ownedSystems.delete(system);return {closed:true,recoveryIncomplete:true};
}
export async function reopenOriginalNativeSystemEconomicRecoveryV1(token,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','bootstrap']);const {runtime,bootstrap}=input;
 const identity=nativeEconomicRecoverySectionIdentityV1(token,'system'),capture=consumeNativeEconomicRecoverySectionV1(token,'system');
 assert.equal(capture.schema,'ORIGINAL_NATIVE_SYSTEM_ECONOMIC_RECOVERY_V1');
 assert.equal(capture.retainedHostSourceSHA256,identity.sourceSHA256,'NATIVE_VALUE_ECONOMIC_REOPEN_ORIGINAL_SOURCE');
 assert.equal(runtime.metadata.restoredOriginalState,true,'NATIVE_VALUE_ECONOMIC_RESTORED_RECEIVER_REQUIRED');
 return restoreOriginalNativeEconomicSystem(runtime,bootstrap,capture,identity);
}
async function restoreOriginalNativeEconomicSystem(runtime,bootstrap,capture,identity){
 const {bundle,header,hub,pools,libraries,verifiers,generatedLibraries}=await restoreNativeSystemParts(runtime,capture);
 assert.equal(bundle.provenance.hostSourceClosureSHA256,identity.sourceSHA256,'NATIVE_VALUE_ECONOMIC_CURRENT_SOURCE_CHANGED');
 const metadata=assertNativeValueOperatorBootstrap(bootstrap);assert.deepEqual(metadata.attesterKeys,capture.metadata.registry.quorum.keys,'NATIVE_VALUE_ECONOMIC_MEMBER_KEYS');
 assert.deepEqual(metadata.adapterProfiles,capture.metadata.adapterProfiles,'NATIVE_VALUE_ECONOMIC_SOURCE_REGISTRATION');
 for(const receipt of capture.registrationReceipts){await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
 await verifyNativeEconomicOriginalStorage(runtime,hub,pools,capture.metadata.plan,header);
 const records=[hub,...pools,...Object.values(libraries),...Object.values(verifiers),...Object.values(generatedLibraries)];
 assert.deepEqual(capture.deployments.map(value=>value.address).sort(),records.map(value=>value.address).sort(),'NATIVE_VALUE_ECONOMIC_DEPLOYMENT_INVENTORY');
 const commonAsset=pools.every(pool=>pool.asset===pools[0].asset&&pool.assetCodeHash===pools[0].assetCodeHash)?pools[0]:null;
 const system={...capture.metadata,hub,pools,libraries,verifiers,generatedLibraries,deployments:records,registrationReceipts:structuredClone(capture.registrationReceipts),
   asset:commonAsset?.asset??null,assetCodeHash:commonAsset?.assetCodeHash??null,assetIdentity:commonAsset?.assetIdentity??null,
   assetMetadata:commonAsset?.assetMetadata??null,assetCapability:commonAsset?.assetCapability??null,provenance:bundle.provenance,
   async verify(role,proof,publicInputs,block='latest'){
     assertOwnedNativeValueSystem(runtime,system);await assertLocalEvm(runtime);const spec=FLAT_VERIFIER_ORDER.find(([name])=>name===role);assert.ok(spec,'NATIVE_VALUE_DEPLOY_VERIFIER_ROLE');
     fixedArray(publicInputs,spec[1]);const verifier=verifiers[role];await expectedCodeAt(runtime,verifier,block);
     const raw=await runtime.call({to:verifier.address,data:nativeProofCalldata(verifier.artifact,'verify(bytes,bytes32[])',proof,publicInputs)},block);
     assert.ok(raw===encodedWords([0])||raw===encodedWords([1]),'NATIVE_VALUE_DEPLOY_VERIFIER_BOOLEAN');return raw===encodedWords([1]);
   },assetBalance(holder,block='latest'){assertOwnedNativeValueSystem(runtime,system);assert.ok(commonAsset,'NATIVE_VALUE_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET');return commonAsset.assetCapability.balance(holder,block);},
   get receipts(){assertOwnedNativeValueSystem(runtime,system);return freeze(structuredClone(runtime.receipts));}};
 const resources=await provisionNativeValueOperators(bootstrap,{runtime,registry:system.registry,adapterProfiles:system.adapterProfiles});
 const live=()=>{assertNativeValueOperatorBootstrap(bootstrap);},entry={runtime,operators:resources,assertLive:live,bundle,originalBootstrap:bootstrap,capturing:false,closed:false,close:()=>bootstrap.close()};
 ownedSystems.set(system,entry);
 try{const handles=await finishNativeValueOperators(bootstrap,{runtime,system});system.operators=handles.operators;system.quorum=handles.quorum;freeze(system);
   const {createNativeValueSystemStateReader}=await import('../../../execution/native-value/reconciliation/native-value-system-state-v2.mjs');
   const readers=await drained([0,1].map(poolIndex=>()=>createNativeValueSystemStateReader({runtime,system,poolIndex}))),views=await drained(readers.map(reader=>()=>reader.read()));
   assert.deepEqual(views[0].head,views[1].head,'NATIVE_VALUE_ECONOMIC_COMMON_HEAD');await drained(readers.map((reader,index)=>()=>reader.assertCurrent(views[index])));
   await unchangedHead(runtime,header);live();return system;
 }catch(error){entry.closed=true;ownedSystems.delete(system);try{bootstrap.close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_VALUE_ECONOMIC_SYSTEM_REOPEN_CLEANUP_FAILED',{cause:error});}throw error;}
}

/** Recheck the original immutable registry/configuration at the current head.
 * Constructor verification deliberately still requires an empty new system.
 * Economic restoration checks mutable backing/trees/cursors through the same
 * original full state readers below, preserving genuine funded/spent state. */
async function verifyNativeEconomicOriginalStorage(runtime,hub,pools,plan,header){
 const expect=async(target,signature,args,values)=>assert.equal((await target.call(signature,args,header.number)).toLowerCase(),encodedWords(values),'NATIVE_VALUE_ECONOMIC_IMMUTABLE_STORAGE_'+signature);
 const configWords=plan.verifierSet.pins.flatMap(pin=>[pin.verifier,pin.codeHash]);
 configWords.push(plan.verifierSet.poseidon2Domains,plan.verifierSet.poseidon2DomainsCodeHash,plan.verifierSet.hubCodec,plan.verifierSet.hubCodecCodeHash);
 for(const [key,value]of Object.entries({...plan.hub.immutableValues,pool0CodeHash:plan.pools[0].codeHash,pool1CodeHash:plan.pools[1].codeHash}))
   if(key!=='claimAuthorityCodeHash')await expect(hub,key+'()',[],[value]);
 await expect(hub,'verifierConfiguration()',[],configWords);
 for(let index=0;index<4;index++){
   const key=plan.registry.quorum.keys[index],signer='0x'+publicKeccak256(Buffer.from(key.x+key.y,'hex')).subarray(12).toString('hex');
   await expect(hub,'attester(uint8)',[index],['0x'+key.x,'0x'+key.y,signer]);
 }
 assert.equal(plan.hub.immutableValues.claimAuthority,ZERO_ADDRESS);assert.equal(plan.hub.immutableValues.claimAuthorityCodeHash,ZERO32);
 const {SEMANTIC_PROFILE}=await import('../../../chains/shared/transfers/generic-native-value-v2.mjs'),text=Buffer.from(SEMANTIC_PROFILE);
 assert.equal(await hub.call('NATIVE_VALUE_PROFILE()',[],header.number),'0x'+encodedWords([32,text.length]).slice(2)+text.toString('hex').padEnd(Math.ceil(text.length/32)*64,'0'));
 for(const [index,pool]of pools.entries()){
   const projected=plan.pools[index];for(const [name,value]of Object.entries(projected.immutableValues))await expect(pool,name+'()',[],[value]);
   await expect(pool,'verifierConfiguration()',[],configWords);await expect(pool,'EPOCH_SECONDS()',[],[600]);
   await expect(hub,'isRegisteredPool(address)',[pool.address],[1]);await expect(hub,'poolDomain(address)',[pool.address],[projected.domainCommitment]);
   await expect(hub,'domainPool(bytes32)',[projected.domainCommitment],[pool.address]);assertOwnedPoolAsset(runtime,pool.assetCapability);
 }
 await unchangedHead(runtime,header);
}

/** Immutable deployment source is authenticated before funding; reopening
 * reconstructs its original facades and current readers, never deploys again. */
const sourceSystems=new WeakMap();
export async function retainOriginalNativeSystemSourceV1(token,system){
 assert.equal(arguments.length,2);const identity=nativeSourceRecoverySectionIdentityV1(token,'system'),entry=ownedSystems.get(system);assert.ok(entry&&!entry.closed&&!entry.capturing&&!sourceSystems.has(system),'NATIVE_SOURCE_ORIGINAL_SYSTEM');assertOwnedNativeDurableSourceReceiverV1(entry.runtime);assertOwnedNativeValueSystem(entry.runtime,system);
 assert.equal(entry.bundle.provenance.hostSourceClosureSHA256,identity.sourceSHA256);
 const capture=await captureNativeSystemRecord(entry.runtime,system,()=>assertOwnedNativeValueSystem(entry.runtime,system),'ORIGINAL_NATIVE_SYSTEM_SOURCE_SEED_V1');capture.registrationReceipts=structuredClone(system.registrationReceipts);capture.deployments=system.deployments.map(observationRecord);
 const wrapper={schema:'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1',sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:capture,candidate:null};const handle=await retainOriginalNativeSourceSectionV1(token,'system',wrapper);sourceSystems.set(system,{handle,identity});return {retainedOriginalSource:true};
}
export async function reopenOriginalNativeSystemSourceV1(token,input){
 assert.equal(arguments.length,2);exactRecord(input,['runtime','bootstrap']);assertOwnedNativeDurableSourceReceiverV1(input.runtime);const identity=nativeSourceRecoverySectionIdentityV1(token,'system'),wrapper=consumeOriginalNativeSourceSectionV1(token,'system');assert.equal(wrapper.schema,'ORIGINAL_NATIVE_SYSTEM_DURABLE_SOURCE_V1');assert.equal(wrapper.candidate,null);assert.equal(wrapper.sourceSHA256,identity.sourceSHA256);const capture=wrapper.confirmed;assert.equal(capture.schema,'ORIGINAL_NATIVE_SYSTEM_SOURCE_SEED_V1');assert.equal(capture.retainedHostSourceSHA256,identity.sourceSHA256);assert.equal(input.runtime.metadata.restoredOriginalState,true);
 const system=await restoreOriginalNativeEconomicSystem(input.runtime,input.bootstrap,capture,identity),handle=resumeOriginalNativeSourceSectionV1(token,'system');await updateOriginalNativeSourceSectionV1(handle,wrapper);sourceSystems.set(system,{handle,identity});return system;
}

/** Wallet eligibility checked by the original deployment owner. */
export function assertOwnedNativeValueWalletSystem(runtime, system) {
  assertOwnedNativeValueSystem(runtime, system);
  assert.equal(system.profile, NATIVE_VALUE_SYSTEM_PROFILE, 'NATIVE_VALUE_WALLET_PROFILE');
  assert.equal(system.claimsEnabled, false, 'NATIVE_VALUE_WALLET_GRAPH_ONLY');
  assert.ok(Object.isFrozen(system), 'NATIVE_VALUE_WALLET_FROZEN_DEPLOYMENT');
  assertNativeValueRegistrations({ registry: system.registry, profiles: system.adapterProfiles });
}
