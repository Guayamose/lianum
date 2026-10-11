import {loadNativeSplClaimValidationArtifactsV1} from './native-spl-claim-validation-artifacts-v1.mjs';
import {loadNativeSplClaimTokenArtifactsV1} from './native-spl-claim-token-artifacts-v1.mjs';
import {assertOwnedSolanaSplCustodyV1,isOwnedSolanaSplCustodyV1} from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
/** Fixed owned-local custody bootstrap. Importing starts no node, compiler,
 * prover or deployment. Only the artifact loader's exact retained builds can
 * enter this bootstrap; data-shaped objects cannot mint its private brands. */
import assert from 'node:assert/strict';
import { reserveOriginalClaimCustodyV1,reserveOriginalSplClaimCustodyV1 } from '../../operators/claims/shared-custody-allocation-v1.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { assertOwnedBitcoinRuntime, BITCOIN_CUSTODY_PROFILE } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { SOLANA_CUSTODY_PROFILE, SOLANA_NONCE_INGRESS_PROFILE } from "../../../chains/solana/runtime/solana-profiles.mjs";
import { assertOwnedSolanaRuntime } from "../../../chains/solana/runtime/owned-solana-runtime.mjs";
import { createOwnedPoolAsset } from '../../../chains/shared/contracts/owned-pool-asset.mjs';
import { evmRuntimeCodeHash } from '../../../chains/evm/contracts/evm-code-hash.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress }
  from '../../../execution/native/dispatch/native-deployment.mjs';
import { linkPrivateBytecode } from '@lianum/engine/notes/private-asset-runtime';
import { exactRecord, fixedArray, canonicalField, PROFILE_FIELD } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { encodeClaimABI } from '@lianum/engine/claims/abi';
import { nativeClaimEndpointCommitment, claimDomainCommitment } from '@lianum/engine/claims/framing';
import { auditClaimNativeInventory } from '../../../claims/operations/backing-audit.mjs';
import { FLAT_BUILD_PIN, FLAT_VERIFIER_ORDER } from '../system/deployment-plan.mjs';
import { NATIVE_INGRESS_V3_PROFILE } from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
import { loadFlatDeploymentArtifacts } from '../system/deployment-artifacts.mjs';
import { deployFlatSystem, assertOwnedFlatSystem } from '../system/deploy-system.mjs';
import { NATIVE_CLAIM_REFUND_FEES, buildOwnedNativeClaimRules,
  buildNativeClaimDeploymentPlan,buildNativeSplClaimDeploymentPlanV1,buildNativeSplClaimRulesV1, claimConfigurationABI, claimArtifactMethod } from './native-claim-deployment-plan.mjs';

export { deriveOwnedNativeCurrencyAsset, buildOwnedNativeClaimRules } from './native-claim-deployment-plan.mjs';

const bootstraps = new WeakMap(), systems = new WeakMap(), assignedCustody = new WeakSet(), assignedJournals = new Set();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = value => '0x' + value, bare = value => value.slice(2);
const word = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
const pin = record => ({ address: record.address, codeHash: record.codeHash });
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const property of Object.values(Object.getOwnPropertyDescriptors(value)))
      if (Object.hasOwn(property, 'value')) freeze(property.value);
    Object.freeze(value);
  }
  return value;
}

export function assertOwnedNativeClaimBootstrap(runtime, capability) {
  const binding = bootstraps.get(capability);
  assert.ok(binding && binding.runtime === runtime && binding.state === 'ready',
    'CLAIM_OWNED_BOOTSTRAP_REQUIRED');
}
export function assertOwnedNativeClaimSystem(runtime, claims) {
  assert.ok(systems.has(claims) && systems.get(claims) === runtime,
    'CLAIM_OWNED_SYSTEM_REQUIRED');
}

export async function createNativeClaimBootstrap(input) {
  assert.equal(arguments.length, 1, 'CLAIM_BOOTSTRAP_ARGUMENTS');
  return createBootstrap(input, false);
}
/** New before-fund BTC/SOL birth with genuine recent-blockhash CI51 V1 and
 * CO42 preparation. This selects new provenance, never a historical fallback
 * or SPL asset/rule/token profile. Caller build/runtime options are rejected. */
export async function preflightOriginalRecentBlockhashNativeClaimV4Artifacts(){
  assert.equal(arguments.length,0,'CLAIM_ORIGINAL_V1_PREFLIGHT_NO_OPTIONS');await loadBootstrapArtifacts(false,false,true);
}
export async function createOriginalRecentBlockhashNativeClaimBootstrapV4(input){
  assert.equal(arguments.length,1,'CLAIM_ORIGINAL_V1_BOOTSTRAP_ARITY');return createBootstrap(input,false,false,true);
}

/** Explicit new-domain entrypoint. No caller-supplied artifacts or profile. */
export async function createNativeClaimIngressV3Bootstrap(input) {
  assert.equal(arguments.length, 1, 'CLAIM_BOOTSTRAP_ARGUMENTS');
  return createBootstrap(input, true);
}
/** New fixed BTC+SPL custody set. SOURCE SOL remains graph-only on the same
 * original validator; the EVM native-family/genesis relabel fence is unchanged. */
export async function createNativeSplClaimIngressV1Bootstrap(input){assert.equal(arguments.length,1);return createBootstrap(input,false,true);}
export async function prepareNativeClaimsBootstrap(capability, context) {
  assert.equal(arguments.length, 2, 'CLAIM_BOOTSTRAP_ARGUMENTS');
  exactRecord(context, ['runtime', 'sender', 'ledger', 'libraries', 'verifiers', 'generatedLibraries', 'configuration']);
  assertOwnedNativeClaimBootstrap(context.runtime, capability);
  return prepareBootstrap(bootstraps.get(capability), context);
}
export async function deployNativeClaimSystem(runtime, options) {
  assert.equal(arguments.length, 2, 'CLAIM_BOOTSTRAP_ARGUMENTS');
  return deployClaims(runtime, options);
}

// Both the no-node V3 preflight and the owned bootstrap use these exact fixed
// readers. Every call rereads their complete original dependencies; no artifact
// cache, caller data, path, compatibility pin or runtime authority is accepted.
async function loadBootstrapArtifacts(ingressV3,spl=false,originalV1=false) {
  assert.ok(typeof originalV1==='boolean'&&(!originalV1||(!ingressV3&&!spl)),'CLAIM_ORIGINAL_V1_FIXED_BOOTSTRAP');
  const bundlePromise = (spl||originalV1)
    ? import('./native-spl-claim-v1-artifacts.mjs').then(module=>module.loadNativeSplClaimV1Artifacts())
    : ingressV3
    ? import('./native-claim-ingress-v3-artifacts.mjs').then(module => module.loadNativeClaimIngressV3Artifacts())
    : import('./native-claim-artifacts.mjs').then(module => module.loadNativeClaimArtifacts());
  const [bundle, baseBundle] = await Promise.all([bundlePromise, loadFlatDeploymentArtifacts()]);
  if(spl){const fresh=loadNativeSplClaimTokenArtifactsV1(),validation=loadNativeSplClaimValidationArtifactsV1();return {bundle:{...bundle,contracts:{...bundle.contracts,artifacts:{...bundle.contracts.artifacts,nativeSplToken:fresh.artifacts.nativeSplToken,nativeSplClaimValidation:validation.artifacts.nativeSplClaimValidation},splTokenCompilation:fresh,splValidationCompilation:validation}},baseBundle};}
  return { bundle, baseBundle };
}
export async function preflightNativeSplClaimIngressV1Artifacts(){assert.equal(arguments.length,0,'SPL_CLAIM_BOOTSTRAP_NO_OPTIONS');await loadBootstrapArtifacts(false,true);}
export async function preflightNativeClaimIngressV3Artifacts() {
  assert.equal(arguments.length, 0, 'V3_BOOTSTRAP_ARTIFACT_PREFLIGHT_NO_OPTIONS');
  await loadBootstrapArtifacts(true);
}

function nativeIdentity(nativeRuntimes,spl=false) {
  fixedArray(nativeRuntimes, 2);
  const [bitcoin, solana] = nativeRuntimes;
  assertOwnedBitcoinRuntime(bitcoin); assertOwnedSolanaRuntime(solana);
  assert.equal(bitcoin.metadata.profile, BITCOIN_CUSTODY_PROFILE, 'CLAIM_BOOTSTRAP_BITCOIN_CUSTODY');
  if(spl)assertOwnedSolanaSplCustodyV1(solana);else assert.equal(solana.metadata.classification, SOLANA_CUSTODY_PROFILE, 'CLAIM_BOOTSTRAP_SOLANA_CUSTODY');
  for (const native of nativeRuntimes) {
    assert.equal(typeof native.inventory, 'function', 'CLAIM_BOOTSTRAP_CUSTODY_INVENTORY');
    exactRecord(native.roles, ['depositor', 'escrow', 'recipient']);
    assert.equal(new Set(Object.values(native.roles).map(role => role.endpoint)).size, 3, 'CLAIM_BOOTSTRAP_DISTINCT_ROLES');
    assert.equal(native.transfers.length, 0, 'CLAIM_BOOTSTRAP_UNUSED_CUSTODY');
  }
  return spl?buildNativeSplClaimRulesV1({bitcoinGenesis:bitcoin.genesis,solanaGenesis:bare(solana.genesisHex),splAsset:solana.metadata.asset}):buildOwnedNativeClaimRules({ bitcoinGenesis: bitcoin.genesis, solanaGenesis: bare(solana.genesisHex) });
}
async function currentHead(runtime, header) {
  await runtime.assertCanonical(header); const current = await runtime.block();
  assert.equal(current.number, header.number, 'CLAIM_BOOTSTRAP_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'CLAIM_BOOTSTRAP_HEAD_CHANGED');
}
async function exactCode(runtime, record, block) {
  const actual = await runtime.code(record.address, block);
  assert.equal(actual, record.expectedCode, 'CLAIM_BOOTSTRAP_EXACT_CODE');
  assert.equal(evmRuntimeCodeHash(actual), record.codeHash, 'CLAIM_BOOTSTRAP_CODE_HASH');
}
async function originalCreation(runtime, record) {
  const hash = record.receipt.transactionHash;
  const entries = runtime.transactions.filter(entry => entry.transactionHash === hash);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_ORIGINAL_CREATION');
  const entry = entries[0];
  assert.equal(entry.phase, 'mined', 'CLAIM_BOOTSTRAP_MINED_CREATION');
  assert.equal(entry.request.to, undefined, 'CLAIM_BOOTSTRAP_CREATE_ONLY');
  assert.equal(entry.request.from, record.sender); assert.equal(entry.request.data, record.creationData);
  assert.equal(BigInt(entry.senderNonce).toString(), record.nonce);
  assert.equal(BigInt(entry.request.value ?? '0x0'), 0n, 'CLAIM_BOOTSTRAP_NO_VALUE');
  const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
  assert.ok(transaction && receipt, 'CLAIM_BOOTSTRAP_CREATION_HISTORY');
  assert.deepEqual(receipt, record.receipt, 'CLAIM_BOOTSTRAP_RECEIPT_CHANGED');
  assert.deepEqual(entry.receipt, receipt, 'CLAIM_BOOTSTRAP_ORIGINAL_RECEIPT');
  assert.equal(receipt.status, '0x1'); assert.equal(receipt.contractAddress, record.address);
  assert.equal(receipt.from, record.sender); assert.equal(receipt.to, null);
  assert.deepEqual(receipt.logs, [], 'CLAIM_BOOTSTRAP_UNEXPECTED_CONSTRUCTOR_LOG');
  assert.equal(transaction.hash, hash); assert.equal(transaction.to, null); assert.equal(transaction.from, record.sender);
  assert.equal(transaction.input, record.creationData); assert.equal(BigInt(transaction.nonce).toString(), record.nonce);
  assert.equal(BigInt(transaction.value), 0n); assert.equal(transaction.blockHash, receipt.blockHash);
  assert.equal(transaction.blockNumber, receipt.blockNumber); assert.equal(transaction.transactionIndex, receipt.transactionIndex);
  assert.equal(predictNativeCreateAddress(record.sender, BigInt(record.nonce)), record.address);
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  await exactCode(runtime, record, receipt.blockNumber);
  assert.equal(await runtime.keccak(record.expectedCode), record.codeHash, 'CLAIM_BOOTSTRAP_INDEPENDENT_HASH');
}
function abiValues(input, value) {
  const array = /^(.*)\[([0-9]*)\]$/.exec(input.type);
  if (array) {
    assert.ok(Array.isArray(value) && value.length <= 128, 'CLAIM_BOOTSTRAP_ABI_ARRAY');
    fixedArray(value, array[2] === '' ? value.length : Number(array[2]));
    return value.map(child => abiValues({ ...input, type: array[1] }, child));
  }
  if (input.type === 'tuple') {
    exactRecord(value, input.components.map(child => child.name));
    return Object.fromEntries(input.components.map(child => [child.name, abiValues(child, value[child.name])]));
  }
  if (input.type.startsWith('uint') && typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'CLAIM_BOOTSTRAP_INTEGER'); return String(value);
  }
  return value;
}
function facade(runtime, record, artifact) {
  const method = signature => claimArtifactMethod(artifact, signature);
  const encode = ({ abi, selector }, args) => {
    const inputs = abi.inputs; fixedArray(args, inputs.length);
    return prefix(selector + encodeClaimABI(inputs, inputs.map((input, i) => abiValues(input, args[i]))).slice(2));
  };
  const data = (signature, args = []) => encode(method(signature), args);
  return { ...record, artifact, data, call: async (signature, args = [], block = 'latest') => {
    const entry = method(signature);
    assert.ok(['pure', 'view'].includes(entry.abi.stateMutability), 'CLAIM_BOOTSTRAP_VIEW_ONLY');
    // No await or external callback separates resolution and argument encoding.
    return runtime.call({ to: record.address, data: encode(entry, args) }, block);
  } };
}

async function nativePreflight(binding) {
  const tree = nativeIdentity(binding.nativeRuntimes,binding.spl);
  assert.deepEqual(tree.rules, binding.rules, 'CLAIM_BOOTSTRAP_NATIVE_IDENTITY_CHANGED');
  for (const [i, native] of binding.nativeRuntimes.entries()) {
    const rule = binding.rules[i], roles = binding.nativeRoles[i];
    assert.deepEqual(native.roles, roles, 'CLAIM_BOOTSTRAP_CUSTODY_ROLES_CHANGED');
    // nativeIdentity already authenticated both original runtime capabilities.
    // Select immutable construction pins, never the mutable inventory snapshot.
    let bootstrapPins = null;
    if (native.nonceIngressProfile !== undefined || native.nonceInfrastructureByAuthority !== undefined) {
      assert.equal(rule.family, '2', 'CLAIM_BOOTSTRAP_NONCE_SOL_ONLY');
      assert.equal(native.nonceIngressProfile, SOLANA_NONCE_INGRESS_PROFILE, 'CLAIM_BOOTSTRAP_NONCE_SOURCE_PROFILE');
      bootstrapPins = native.nonceInfrastructureByAuthority;
      exactRecord(bootstrapPins, ['depositor', 'escrow']);
      assert.ok(Object.isFrozen(native) && Object.isFrozen(bootstrapPins)
        && Object.values(bootstrapPins).every(Object.isFrozen), 'CLAIM_BOOTSTRAP_IMMUTABLE_NONCE_PINS');
      for (const role of ['depositor', 'escrow'])
        assert.equal(bootstrapPins[role].authorityPublicKey, roles[role].endpoint, 'CLAIM_BOOTSTRAP_NONCE_SOURCE_ROLE');
    }
    for (const route of ['deposit', 'refund', 'redeem']) {
      const adapter = native.adapter({ asset: rule.asset, route });
      assert.equal(adapter.binding.family, rule.family); assert.equal(adapter.binding.genesis, rule.genesis);
      assert.equal(adapter.binding.asset, rule.asset);
    }
    if(binding.spl&&i===1){assertOwnedSolanaSplCustodyV1(native);const empty=await native.assertOriginalEmptyBootstrapV1();assert.equal(empty.nativePrincipalAvailable,'0');assert.equal(empty.initializedPrincipal,false);assert.ok(BigInt(empty.feeReserveAvailable)>=BigInt(NATIVE_CLAIM_REFUND_FEES[i]));continue;}
    const inventory = await native.inventory();
    if (bootstrapPins !== null)
      assert.ok(Object.hasOwn(inventory, 'nonceInfrastructureByAuthority'), 'CLAIM_BOOTSTRAP_COMPLETE_DUAL_NONCE_INVENTORY');
    assert.deepEqual(inventory.syntheticPrefunding, native.syntheticPrefunding, 'CLAIM_BOOTSTRAP_SYNTHETIC_FUNDING');
    const audited = auditClaimNativeInventory(inventory, { nativeFamily: rule.family, nativeGenesis: rule.genesis,
      nativeAsset: rule.asset, escrowEndpointCommitment: nativeClaimEndpointCommitment({ family: rule.family,
        genesis: rule.genesis, asset: rule.asset, endpoint: roles.escrow.endpoint }) }, roles, bootstrapPins);
    assert.equal(inventory.feeAudit.transfers.length, 0, 'CLAIM_BOOTSTRAP_UNUSED_CUSTODY');
    assert.equal(audited.nativePrincipalAvailable, '0', 'CLAIM_BOOTSTRAP_EMPTY_NATIVE_PRINCIPAL');
    assert.ok(BigInt(audited.feeReserveAvailable) >= BigInt(NATIVE_CLAIM_REFUND_FEES[i]), 'CLAIM_BOOTSTRAP_FEE_RESERVE');
    if (rule.family === '2') for (const role of ['depositor', 'recipient']) {
      const account = inventory.accounts.find(value => value.role === role);
      assert.ok(account.exists && BigInt(account.total) >= BigInt(account.rentExemptMinimum), 'CLAIM_BOOTSTRAP_FUNDED_SOL_ROUTE');
    }
  }
}
async function createBootstrap(input, ingressV3,spl=false,originalV1=false) {
  assert.ok(typeof originalV1==='boolean'&&(!originalV1||(!ingressV3&&!spl)),'CLAIM_ORIGINAL_V1_FIXED_BOOTSTRAP');
  exactRecord(input, ['runtime', 'nativeRuntimes', 'journalRoot']);
  const { runtime, journalRoot } = input; fixedArray(input.nativeRuntimes, 2);
  const nativeRuntimes = Object.freeze([...input.nativeRuntimes]), tree = nativeIdentity(nativeRuntimes,spl);
  // Native ownership brands were checked by nativeIdentity before this scope
  // decision. A free profile string or caller artifact cannot select a key.
  if (ingressV3&&!spl) {
    assert.equal(nativeRuntimes[1].nonceIngressProfile, NATIVE_INGRESS_V3_PROFILE,
      'V3_BOOTSTRAP_OWNED_NONCE_PROFILE_REQUIRED');
    exactRecord(nativeRuntimes[1].nonceInfrastructureByAuthority, ['depositor', 'escrow']);
  } else if(!spl) {
    for (const native of nativeRuntimes) assert.ok(native.nonceIngressProfile === undefined
      && native.nonceInfrastructureByAuthority === undefined, 'V3_RUNTIME_REQUIRES_NEW_BOOTSTRAP');
  }
  assert.ok(nativeRuntimes.every(native => !assignedCustody.has(native)), 'CLAIM_BOOTSTRAP_CUSTODY_ALREADY_ASSIGNED');
  assert.ok(typeof journalRoot === 'string' && isAbsolute(journalRoot) && resolve(journalRoot) === journalRoot,
    'CLAIM_BOOTSTRAP_ABSOLUTE_JOURNAL');
  assert.ok(!assignedJournals.has(journalRoot), 'CLAIM_BOOTSTRAP_JOURNAL_ALREADY_ASSIGNED');
  (spl?reserveOriginalSplClaimCustodyV1:reserveOriginalClaimCustodyV1)(nativeRuntimes, journalRoot);
  await assertLocalEvm(runtime);
  assert.equal(runtime.metadata.chainId, '31337', 'CLAIM_BOOTSTRAP_LOCAL_EVM');
  const stat = await lstat(journalRoot);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'CLAIM_BOOTSTRAP_JOURNAL_DIRECTORY');
  assert.equal(await realpath(journalRoot), journalRoot, 'CLAIM_BOOTSTRAP_JOURNAL_REALPATH');
  assert.deepEqual(await readdir(journalRoot), [], 'CLAIM_BOOTSTRAP_FRESH_JOURNAL');
  // Artifact loading is eager: missing genuine claim keys or compilation stops
  // before the outer base-ledger deployment can send its first transaction.
  // Every entrypoint selects a fixed loader. Never retry V3 failures
  // through the legacy loader, or update an existing domain in place.
  const { bundle, baseBundle } = await loadBootstrapArtifacts(ingressV3,spl,originalV1);
  const genesis = await runtime.block('0x0'); await runtime.assertCanonical(genesis);
  assert.equal(genesis.hash, runtime.metadata.evmGenesis, 'CLAIM_BOOTSTRAP_EVM_GENESIS');
  const binding = { runtime, nativeRuntimes,spl, nativeRoles: frozenInput(nativeRuntimes.map(native => cloneInput(native.roles))),
    rules: tree.rules,registeredRules:spl?tree.registeredRules:tree.rules,graphSolanaRule:spl?tree.graphSolanaRule:null, rulesRoot: prefix(tree.root), journalRoot, evmGenesis: bare(genesis.hash), bundle, baseBundle,
    inventoryDomains: Object.freeze([randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]),
    claimIngressProfile: ingressV3 ? NATIVE_INGRESS_V3_PROFILE : 'LEGACY_NATIVE_CLAIM_INGRESS',
    state: 'validating', deployments: [], sealReceipts: [] };
  await nativePreflight(binding);
  // Recheck after awaits so two concurrent factories cannot share an inventory.
  assert.ok(nativeRuntimes.every(native => !assignedCustody.has(native)), 'CLAIM_BOOTSTRAP_CUSTODY_ALREADY_ASSIGNED');
  assert.ok(!assignedJournals.has(journalRoot), 'CLAIM_BOOTSTRAP_JOURNAL_ALREADY_ASSIGNED');
  nativeRuntimes.forEach(native => assignedCustody.add(native));
  assignedJournals.add(journalRoot);
  const capability = Object.freeze({ classification: 'OWNED_LOCAL_NATIVE_CLAIM_BOOTSTRAP',
    claimIngressProfile: binding.claimIngressProfile,nativeSplCustodyProfile:binding.spl,registeredRules:binding.registeredRules,graphSolanaRule:binding.graphSolanaRule,
    rulesRoot: binding.rulesRoot, rules: tree.rules, rulePaths: frozenInput(tree.paths) });
  binding.state = 'ready'; bootstraps.set(capability, binding); return capability;
}

async function authenticateBase(binding, context, block) {
  const { runtime, sender, libraries, verifiers, generatedLibraries } = context;
  assert.equal(sender, runtime.accounts[0], 'CLAIM_BOOTSTRAP_SENDER');
  assert.deepEqual(context.ledger, binding.baseBundle.ledger, 'CLAIM_BOOTSTRAP_FIXED_LEDGER');
  exactRecord(libraries, ['poseidon2Domains', 'hubCodec']);
  exactRecord(verifiers, FLAT_VERIFIER_ORDER.map(([role]) => role));
  const authenticated = new Map();
  async function verify(record, source, name, artifact, names = {}, values = {}, links = {}, library = false) {
    assert.equal(record.source, source); assert.equal(record.contractName, name);
    const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: record.address,
      libraries: links, immutableNames: names, immutableValues: values,
      isLibrary: library && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object) });
    assert.equal(record.expectedCode, expectedCode, 'CLAIM_BOOTSTRAP_PREREQUISITE_RUNTIME');
    const constructorData = encodeClaimABI(artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [], []);
    const creationData = prefix(linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, links)) + constructorData.slice(2);
    const checked = { ...record, sender, creationData, expectedCode, codeHash: evmRuntimeCodeHash(expectedCode) };
    await originalCreation(runtime, checked); await exactCode(runtime, checked, block);
    authenticated.set(record.address, checked); return facade(runtime, checked, artifact);
  }
  const baseLibraries = {};
  for (const role of ['poseidon2Domains', 'hubCodec']) {
    const [source, name] = FLAT_BUILD_PIN.artifacts[role];
    baseLibraries[role] = await verify(libraries[role], source, name,
      binding.baseBundle.ledger.artifacts[role], {}, {}, {}, true);
  }
  const used = new Set(), visiting = new Set();
  async function links(entry, artifact) {
    const result = {};
    for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences])
      for (const [source, names] of Object.entries(references)) for (const name of Object.keys(names)) {
        assert.equal(source, entry.source, 'CLAIM_BOOTSTRAP_VERIFIER_LINK_SOURCE');
        const key = source + ':' + name, record = generatedLibraries[key];
        assert.ok(record, 'CLAIM_BOOTSTRAP_GENERATED_LIBRARY_REQUIRED');
        if (!used.has(key)) {
          assert.ok(!visiting.has(key), 'CLAIM_BOOTSTRAP_LIBRARY_CYCLE'); visiting.add(key);
          const artifact = entry.contracts[name]; assert.ok(artifact, 'CLAIM_BOOTSTRAP_GENERATED_ARTIFACT');
          await verify(record, source, name, artifact, {}, {}, await links(entry, artifact), true);
          used.add(key); visiting.delete(key);
        }
        result[key] = record.address;
      }
    return result;
  }
  for (const [role] of FLAT_VERIFIER_ORDER) {
    const entry = binding.baseBundle.verifiers[role];
    await verify(verifiers[role], entry.source, 'HonkVerifier', entry.artifact,
      entry.immutableNames, entry.immutableValues, await links(entry, entry.artifact));
  }
  assert.deepEqual([...used].sort(), Object.keys(generatedLibraries).sort(), 'CLAIM_BOOTSTRAP_COMPLETE_GENERATED_LIBRARIES');
  assert.equal(authenticated.size, 14 + used.size, 'CLAIM_BOOTSTRAP_DISTINCT_PREREQUISITES');
  return baseLibraries;
}
function artifactFor(binding, record) {
  if(binding.spl&&record.source==='native-claims/NativeSplClaimValidationV1.sol'&&record.contractName==='NativeSplClaimValidationV1')return binding.bundle.contracts.artifacts.nativeSplClaimValidation;
  if(binding.spl&&record.source==='native-claims/NativeSplClaimTokenV1.sol'&&record.contractName==='NativeSplClaimTokenV1')return binding.bundle.contracts.artifacts.nativeSplToken;
  const artifact = binding.bundle.contracts.compilation.contracts[record.source]?.[record.contractName];
  if (artifact) return artifact;
  const entries = Object.values(binding.bundle.verifiers).filter(entry => entry.source === record.source);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_FIXED_ARTIFACT_SOURCE');
  const result = entries[0].contracts[record.contractName]; assert.ok(result, 'CLAIM_BOOTSTRAP_FIXED_ARTIFACT'); return result;
}
async function prepareBootstrap(binding, context) {
  binding.state = 'preparing';
  try {
    const { runtime, sender, configuration } = context;
    assert.equal(configuration.rulesRoot, binding.rulesRoot, 'CLAIM_BOOTSTRAP_REGISTERED_RULES');
    const data = cloneInput({ deploymentDomain: configuration.deploymentDomain, registryEpoch: configuration.registryEpoch,
      rulesRoot: configuration.rulesRoot, attesterKeys: configuration.attesterKeys,
      pools: configuration.pools.map(pool => ({ policy: pool.policy, deploymentDomain: pool.deploymentDomain })) });
    await assertLocalEvm(runtime); await nativePreflight(binding);
    const header = await runtime.block(), libraries = await authenticateBase(binding, context, header.number);
    await currentHead(runtime, header);
    const hashFields = async fields => {
      fixedArray(fields, 18); assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, 1n, 14n], 'CLAIM_BOOTSTRAP_DOMAIN_PURPOSE');
      const values = [];
      for (let i = 4; i < fields.length; i += 2) {
        const [high, low] = fields.slice(i, i + 2);
        assert.ok(typeof high === 'bigint' && high >= 0n && high < 1n << 128n
          && typeof low === 'bigint' && low >= 0n && low < 1n << 128n, 'CLAIM_BOOTSTRAP_DOMAIN_LIMBS');
        values.push(prefix(high.toString(16).padStart(32, '0') + low.toString(16).padStart(32, '0')));
      }
      const raw = await libraries.poseidon2Domains.call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)', values, header.number);
      assert.match(raw, /^0x[0-9a-f]{64}$/, 'CLAIM_BOOTSTRAP_DOMAIN_RESULT'); canonicalField(bare(raw), true);
      await currentHead(runtime, header); return bare(raw);
    };
    const bundle = { contracts: binding.bundle.contracts, verifiers: Object.fromEntries(Object.entries(binding.bundle.verifiers)
      .map(([role, { sourceBytes, ...entry }]) => [role, entry])) };
    const plan = await (binding.spl?buildNativeSplClaimDeploymentPlanV1:buildNativeClaimDeploymentPlan)({ bundle, ledger: binding.baseBundle.ledger, sender,
      nextNonce: (await runtime.nonce(sender, 'pending')).toString(), evmGenesis: binding.evmGenesis,
      libraries: Object.fromEntries(Object.entries(libraries).map(([role, value]) => [role, pin(value)])),
      verifiers: Object.fromEntries(Object.entries(context.verifiers).map(([role, value]) => [role, pin(value)])),
      configuration: data, rules: binding.rules, nativeRoles: binding.nativeRoles, inventoryDomains: binding.inventoryDomains }, { hashFields });
    binding.plan = plan; await currentHead(runtime, header);
    for (const record of [...plan.deployments, plan.flatPlan.hub, ...plan.flatPlan.pools])
      assert.equal(await runtime.code(record.address, header.number), '0x', 'CLAIM_BOOTSTRAP_CREATE_OCCUPIED');
    await currentHead(runtime, header);
    const byAddress = new Map();
    for (const proposed of plan.deployments) {
      assert.equal((await runtime.nonce(sender, 'pending')).toString(), proposed.nonce, 'CLAIM_BOOTSTRAP_NONCE_CHANGED');
      assert.equal(await runtime.code(proposed.address), '0x', 'CLAIM_BOOTSTRAP_CREATE_OCCUPIED');
      const receipt = await runtime.send('deploy native claim ' + proposed.contractName, { from: sender, data: proposed.creationData });
      const record = freeze({ ...proposed, sender, receipt, proofAcceptanceClaim: false });
      // Retain the first returned identity even if subsequent verification fails.
      binding.deployments.push(record);
      await originalCreation(runtime, record);
      assert.equal((await runtime.nonce(sender, 'pending')).toString(), (BigInt(proposed.nonce) + 1n).toString(), 'CLAIM_BOOTSTRAP_NEXT_NONCE');
      byAddress.set(record.address, facade(runtime, record, artifactFor(binding, record)));
      await configuration.onDeployment(record);
    }
    const wrap = record => byAddress.get(record.address);
    binding.authority = wrap(plan.authority); binding.gateways = plan.gateways.map(wrap); binding.wrappers = plan.wrappers.map(wrap);
    binding.verifiers = Object.fromEntries(Object.entries(plan.verifiers).map(([role, record]) => [role,
      { ...wrap(record), lineage: binding.bundle.verifiers[role].lineage }]));
    binding.libraries = { ...libraries, ...Object.fromEntries(Object.entries(plan.libraries).map(([role, record]) => [role, wrap(record)])),
      ...Object.fromEntries(Object.entries(plan.generatedLibraries).map(([role, record]) => [role, wrap(record)])) };
    binding.assetCapabilities = [];
    for (const [i, wrapper] of binding.wrappers.entries()) binding.assetCapabilities.push(await createOwnedPoolAsset({ runtime,
      deployment: { address: wrapper.address, transactionHash: wrapper.receipt.transactionHash,
        expectedCode: wrapper.expectedCode, codeHash: wrapper.codeHash }, symbol: i === 0 ? 'cBTC' : binding.spl?'cUSDC':'cSOL', decimals: i === 0 ? 8 : binding.spl?6:9, kind: 'ERC20' }));
    binding.state = 'prepared';
    return Object.freeze({ assetCapabilities: Object.freeze([...binding.assetCapabilities]), claimAuthority: freeze(pin(binding.authority)) });
  } catch (cause) { binding.state = 'failed'; throw failure(binding, cause); }
}

function failure(binding, cause) {
  const error = new Error('NATIVE_CLAIM_BOOTSTRAP_FAILED', { cause });
  error.claimDeployments = [...binding.deployments]; error.claimSealReceipts = [...binding.sealReceipts];
  error.localReceipts = binding.runtime.receipts; error.localTransactions = binding.runtime.transactions;
  if (binding.plan) error.claimDeploymentPlan = binding.plan;
  error.artifactProvenance = binding.bundle.contracts.provenance; return error;
}

async function seal(binding, target) {
  const { runtime } = binding, sender = runtime.accounts[0], nonce = await runtime.nonce(sender, 'pending');
  const data = target.data('seal()');
  const receipt = await runtime.send('seal native claim ' + target.contractName, { from: sender, to: target.address, data });
  binding.sealReceipts.push(receipt);
  const entries = runtime.transactions.filter(entry => entry.transactionHash === receipt.transactionHash);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_ORIGINAL_SEAL');
  const entry = entries[0]; assert.equal(entry.phase, 'mined');
  exactRecord(entry.request, ['from', 'to', 'data', 'gas']);
  assert.equal(entry.request.from, sender); assert.equal(entry.request.to, target.address); assert.equal(entry.request.data, data);
  assert.equal(BigInt(entry.senderNonce), nonce); assert.deepEqual(entry.receipt, receipt);
  const [transaction, observed] = await Promise.all([runtime.transaction(receipt.transactionHash), runtime.receipt(receipt.transactionHash)]);
  assert.deepEqual(receipt, observed, 'CLAIM_BOOTSTRAP_SEAL_RECEIPT_CHANGED');
  assert.equal(receipt.status, '0x1'); assert.equal(receipt.from, sender); assert.equal(receipt.to, target.address);
  assert.equal(receipt.contractAddress, null); assert.deepEqual(receipt.logs, []);
  assert.equal(transaction.hash, receipt.transactionHash); assert.equal(transaction.from, sender);
  assert.equal(transaction.to, target.address); assert.equal(transaction.input, data);
  assert.equal(BigInt(transaction.gas), BigInt(entry.request.gas));
  assert.equal(BigInt(transaction.value), 0n); assert.equal(BigInt(transaction.nonce), nonce);
  assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
  assert.equal(transaction.transactionIndex, receipt.transactionIndex);
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'CLAIM_BOOTSTRAP_SEAL_NONCE');
}
async function checkedStorage(binding, flatSystem) {
  const { runtime, plan, authority, gateways, wrappers } = binding, header = await runtime.block(), block = header.number;
  for (const record of [...binding.deployments, flatSystem.hub, ...flatSystem.pools, ...Object.values(binding.libraries)])
    await exactCode(runtime, record, block);
  const expect = async (target, signature, args, values) => assert.equal(await target.call(signature, args, block),
    prefix(values.map(value => word(value).slice(2)).join('')), 'CLAIM_BOOTSTRAP_STORAGE_' + signature);
  const expectMetadata = async (target, signature, value) => {
    const method = claimArtifactMethod(target.artifact, signature);
    assert.equal(method.abi.outputs.length, 1, 'CLAIM_BOOTSTRAP_TOKEN_METADATA_ABI');
    assert.equal(method.abi.outputs[0].type, 'string', 'CLAIM_BOOTSTRAP_TOKEN_METADATA_ABI');
    // These fixed token names/symbols use the identical dynamic bytes/string layout.
    // Keep the original encoder's bounded bytes support and verify the real string ABI.
    assert.ok(typeof value === 'string' && /^[\x20-\x7e]{1,64}$/.exec(value)?.[0] === value, 'CLAIM_BOOTSTRAP_TOKEN_METADATA_VALUE');
    const encoded = encodeClaimABI([{ type: 'bytes' }], ['0x' + Buffer.from(value, 'utf8').toString('hex')]);
    assert.equal(await target.call(signature, [], block), encoded,
      'CLAIM_BOOTSTRAP_TOKEN_METADATA_' + signature);
  };
  await expect(authority, 'hub()', [], [flatSystem.hub.address]); await expect(authority, 'isSealed()', [], [1]);
  await expect(flatSystem.hub, 'claimAuthority()', [], [authority.address]);
  for (let i = 0; i < 2; i++) {
    const gateway = gateways[i], wrapper = wrappers[i], config = plan.configs[i], pool = flatSystem.pools[i];
    const configurationMethod = gateway.artifact.abi.find(item => item.type === 'function' && item.name === 'claimConfiguration');
    assert.equal(await gateway.call('claimConfiguration()', [], block),
      encodeClaimABI(configurationMethod.outputs, [claimConfigurationABI(config)]), 'CLAIM_BOOTSTRAP_FULL_CONFIGURATION');
    const verifierMethod = gateway.artifact.abi.find(item => item.type === 'function' && item.name === 'verifierConfiguration');
    assert.equal(await gateway.call('verifierConfiguration()', [], block),
      encodeClaimABI(verifierMethod.outputs, [gateway.deployment.verifiers]), 'CLAIM_BOOTSTRAP_FULL_VERIFIER_CONFIGURATION');
    for (const [name, value] of Object.entries({ hub: flatSystem.hub.address, pool: pool.address,
      authority: authority.address, authorityCodeHash: authority.codeHash,
      codecCodeHash: binding.libraries.nativeClaimCodec.codeHash, validationCodeHash: binding.spl&&i===1?binding.libraries.nativeSplClaimValidation.codeHash:binding.libraries.nativeClaimValidation.codeHash,
      configurationCommitment: gateway.configurationCommitment, claimDomain: prefix(claimDomainCommitment(config)),
      custodyInventoryDomain: prefix(config.custodyInventoryDomain),
      nativeAssetKey: prefix(sha(Buffer.from(word(config.nativeFamily).slice(2) + config.nativeGenesis, 'hex'))),
      isSealed: 1, MAX_INTENTS: 16, MAX_TICKETS: 32, BITCOIN_OUTPUT_FLOOR: 1000, MAX_PERMIT_SECONDS: 30 }))
      await expect(gateway, name + '()', [], [value]);
    for (const name of ['claimSequence', 'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce',
      'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'activePayout', 'liabilities'])
      await expect(gateway, name + '()', [], [0]);
    for (let n = 0; n < 16; n++) await expect(gateway, 'intentHistory(uint256)', [n], [0]);
    for (let n = 0; n < 32; n++) await expect(gateway, 'ticketHistory(uint256)', [n], [0]);
    await expect(wrapper, 'gateway()', [], [gateway.address]); await expect(wrapper, 'decimals()', [], [i === 0 ? 8 : binding.spl?6:9]);
    await expectMetadata(wrapper,'symbol()',i===0?'cBTC':binding.spl?'cUSDC':'cSOL');
    await expectMetadata(wrapper,'name()',i===0?'Custodial Bitcoin Claim':binding.spl?'Custodial USDC SPL Claim':'Custodial Solana Claim');
    await expect(wrapper, 'totalSupply()', [], [0]);
    for (const holder of [runtime.accounts[0], gateway.address, pool.address]) await expect(wrapper, 'balanceOf(address)', [holder], [0]);
    await expect(wrapper, 'allowance(address,address)', [gateway.address, pool.address], [0]);
    await expect(authority, 'gateways(uint256)', [i], [gateway.address]);
    await expect(authority, 'gatewayPool(address)', [gateway.address], [pool.address]);
    await expect(authority, 'gatewayCodeHash(address)', [gateway.address], [gateway.codeHash]);
    await expect(authority, 'gatewayConfiguration(address)', [gateway.address], [gateway.configurationCommitment]);
    await expect(authority, 'reservedReceiptCapacity(address)', [pool.address], [0]);
    for (let j = 0; j < 2; j++) await expect(gateway, 'payoutEndpointCommitments(uint256)', [j], [gateway.payoutEndpointCommitments[j]]);
    const observed = await binding.assetCapabilities[i].read({ holder: pool.address, blockNumber: block });
    assert.equal(observed.blockHash, header.hash); assert.equal(observed.totalSupply, '0'); assert.equal(observed.balance, '0');
  }
  for (const record of binding.deployments) await originalCreation(runtime, record);
  await currentHead(runtime, header);
  return freeze({ blockNumber: block, blockHash: header.hash, completeRuntimesMatched: true,
    completeConfigurationsMatched: true, originalDeploymentReceiptsMatched: true,
    gatewaysSealed: true, authoritySealed: true, initialLiabilitiesZero: true, proofAcceptanceEstablished: false });
}
async function deployClaims(runtime, options) {
  exactRecord(options, ['deploymentDomain', 'registryEpoch', 'rulesRoot', 'attesterKeys', 'pools', 'nativeClaimBootstrap',
    ...(Object.hasOwn(options, 'onDeployment') ? ['onDeployment'] : [])]);
  const capability = options.nativeClaimBootstrap;
  assertOwnedNativeClaimBootstrap(runtime, capability); const binding = bootstraps.get(capability);
  assert.ok(!binding.outerAttempted, 'CLAIM_BOOTSTRAP_ALREADY_ATTEMPTED'); binding.outerAttempted = true;
  try {
    assert.equal(options.rulesRoot, binding.rulesRoot, 'CLAIM_BOOTSTRAP_REGISTERED_RULES');
    const flatSystem = await deployFlatSystem(runtime, options);
    assertOwnedFlatSystem(runtime, flatSystem); assert.equal(binding.state, 'prepared', 'CLAIM_BOOTSTRAP_PREPARATION_REQUIRED');
    assert.deepEqual(flatSystem.plan, binding.plan.flatPlan, 'CLAIM_BOOTSTRAP_FLAT_PLAN_CHANGED');
    await nativePreflight(binding);
    for (const gateway of binding.gateways) await seal(binding, gateway);
    await seal(binding, binding.authority);
    const bootstrap = await checkedStorage(binding, flatSystem);
    const claims = freeze({ classification: 'OWNED_LOCAL_CUSTODIAL_NATIVE_CLAIMS_NOT_PROOF_ACCEPTANCE', flatSystem,
      claimIngressProfile: binding.claimIngressProfile,nativeSplCustodyProfile:binding.spl,registeredRules:binding.registeredRules,graphSolanaRule:binding.graphSolanaRule,
      authority: binding.authority, gateways: binding.gateways, wrappers: binding.wrappers, verifiers: binding.verifiers,
      libraries: binding.libraries, verifierPins: binding.plan.verifierPins, configs: binding.plan.configs,
      policies: binding.plan.policies, nativeRuntimes: binding.nativeRuntimes, journalRoot: binding.journalRoot,
      deployments: [...binding.deployments], sealReceipts: [...binding.sealReceipts], bootstrap,
      provenance: binding.bundle.contracts.provenance,
      limitations: ['Custodial ERC20 claims on owned local synthetic chains.',
        'Native spending keys are not threshold protected; same-host attesters are not independent operators.',
        'Bootstrap establishes code and state identity, not proof acceptance or future backing.'] });
    binding.state = 'sealed'; systems.set(claims, runtime); return claims;
  } catch (cause) { binding.state = 'failed'; throw failure(binding, cause); }
}
