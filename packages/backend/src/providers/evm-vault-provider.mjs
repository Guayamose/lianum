/** Owned flat EVM vault provider bootstrap. One dedicated synthetic provider key; the
 * actual owned adapter alone holds native source custody. No caller signer,
 * verifier, state/health reader, RPC, key import, or proof backend is accepted.
 * Vault and the common trusted OS retain their durability/rollback assumptions.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat, realpath, mkdtemp, chmod } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { freshKey, signature } from '../../../engine/src/notes/private-note-encoding.mjs';
import { assertOwnedLocalEvmV2 } from '../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedNativeRecipientProcess } from '../../../engine/src/execution/native/recipients/native-recipient-process.mjs';
import { nativeTransferActionCommitment } from '../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { nativeAdmissionChainDomain, nativeAdmissionRuleRoot, nativeProviderIdentity,
  nativeDeliveryRiskCommitment, nativeDispatchStatementFrame, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { evmFundingEndpointCommitment } from '../chains/evm/dispatch/evm-facts-binding.mjs';
import { validateEvmGraphDeliveryDescriptorV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, evmGraphDeliveryTermsV1, isMetaMorphoGraphDescriptorV1, isUniswapGraphDescriptorV1, isAaveStaticGraphDescriptorV1, isMorphoBluePositionGraphDescriptorV1 } from '../chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { decodeEvmVaultDepositStatement } from '../chains/evm/vault/evm-vault-delivery.mjs';
import { assertOwnedEvmGraphDeliveryRouterV1, assertOwnedEvmGraphDeliveryObserverV1,
  assertOwnedEvmGraphDeliveryDescriptorV1 } from '../chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { isOwnedMetaMorphoGraphDeliveryObserverV1, isOwnedUniswapGraphDeliveryObserverV1, isOwnedAaveStaticGraphDeliveryObserverV1, isOwnedMorphoBluePositionGraphDeliveryObserverV1 } from '../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import { createOwnedEvmVaultDispatchGate } from '../chains/evm/dispatch/evm-dispatch-gate.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '../../../engine/src/evidence/native-quorum.mjs';
import { assertOwnedFlatSystem } from '../operations/deployments/system/deploy-system.mjs';
import { assertOwnedFlatOperatorQuorum } from '../operations/operators/claims/native-operators.mjs';
import { createFlatSystemStateReader } from '../execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord, fixedArray, bytes32, canonicalField, validateStruct, FIELD_MODULUS }
  from '../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../execution/account/preparation/readiness-inputs.mjs';
import { nativeRuleCommitment, nativeCustodyCommitment } from '../chains/shared/dispatch/native-receipt-binding.mjs';
import { createNativeDispatchJournal, normalizeNativeDispatchBinding }
  from '../chains/shared/dispatch/native-dispatch-gate.mjs';
import { createPinnedVerifier } from '@lianum/proofs/verification';
import { loadPinned, resourceModuleURL } from '../../../proofs/src/tooling/tooling.mjs';

export const OWNED_FLAT_EVM_VAULT_PROVIDER_PROFILE = 'OWNED_SYNTHETIC_FLAT_EVM_VAULT_PROVIDER_V1';
export const OWNED_FLAT_METAMORPHO_PROVIDER_PROFILE_V1 = 'OWNED_OFFICIAL_FLAT_METAMORPHO_PROVIDER_V1';
export const OWNED_FLAT_UNISWAP_PROVIDER_PROFILE_V1 = 'OWNED_OFFICIAL_FLAT_UNISWAP_V3_PROVIDER_V1';
const providerSlotsV4 = new WeakMap();
const ownedProviders = new WeakMap();
export function assertOwnedFlatEvmVaultProvider(provider, expected) {
  const retained = ownedProviders.get(provider);
  assert.ok(retained, 'FLAT_PROVIDER_OWNED_CAPABILITY'); retained.assertLive();
  for (const [name, value] of Object.entries(expected)) {
    assert.ok(['runtime', 'system', 'poolIndex', 'router', 'observer', 'operatorQuorum', 'family', 'recipientIndex'].includes(name),
      'FLAT_PROVIDER_EXPECTED_BINDING');
    assert.equal(retained[name], value, 'FLAT_PROVIDER_OWNED_BINDING');
  }
  return provider;
}
/** Private, explicitly selected public terms from the original registered
 * provider. This neither signs nor verifies current balances/finality. */
export function ownedFlatEvmVaultProviderReview(provider, expected) {
  assertOwnedFlatEvmVaultProvider(provider, expected);
  return ownedProviders.get(provider).manualReview();
}
const SCHEMA = 'OWNED_FLAT_EVM_VAULT_PROVIDER_CUSTODY_V1';
const TERMS = ['scope', 'policy', 'asset', 'amount', 'executionFrom', 'executionUntil', 'settleBefore'];
const TEMPLATE = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment', 'amount',
  'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore'];
const QUOTE = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'action', 'payoutCommitment', 'deliveryRiskSalt'];
const copy = cloneInput, freeze = frozenInput;
const equal = (left, right) => assert.deepEqual(left, right, 'FLAT_PROVIDER_CHANGED_BINDING');
function index(value) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value < 2, 'FLAT_PROVIDER_INDEX');
  return value;
}
function bare(value, bytes = 32) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, 2 + bytes * 2);
  assert.match(value, /^0x[0-9a-f]+$/); return value.slice(2);
}

// The directory is already private and belongs to this exact owned EVM run.
// No alternate location, creation fallback, existing-vault reset or symlink is
// accepted. The trusted local filesystem/OS remains an explicit assumption.
async function privateDirectory(runtime, directory) {
  assert.ok(typeof directory === 'string' && isAbsolute(directory) && !directory.includes('\0'), 'FLAT_PROVIDER_DIRECTORY');
  assert.equal(resolve(directory), directory, 'FLAT_PROVIDER_DIRECTORY_CANONICAL');
  const root = runtime.metadata.scratchDirectory;
  assert.ok(isAbsolute(root) && resolve(root) === root, 'FLAT_PROVIDER_OWNED_SCRATCH');
  const suffix = relative(root, directory);
  assert.ok(suffix === '' || (!suffix.startsWith('..' + sep) && suffix !== '..' && !isAbsolute(suffix)), 'FLAT_PROVIDER_OWNED_SCRATCH');
  const paths = [root];
  if (suffix) for (const part of suffix.split(sep)) paths.push(join(paths.at(-1), part));
  for (const path of paths) {
    assert.equal(await realpath(path), path, 'FLAT_PROVIDER_DIRECTORY_SYMLINK');
    const stat = await lstat(path);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o700, 'FLAT_PROVIDER_PRIVATE_DIRECTORY');
    if (typeof process.getuid === 'function') assert.equal(stat.uid, process.getuid(), 'FLAT_PROVIDER_DIRECTORY_OWNER');
  }
  return directory;
}

// Official locally pinned Poseidon2; a backend exists only during one gate
// operation. skipSrsInit avoids any implicit SRS download for host hashing.
async function withPinnedHash(work) {
  const helpers = await import(resourceModuleURL), toolchain = helpers.verifyToolchain();
  assert.equal(toolchain.barretenberg, '5.2.0', 'FLAT_PROVIDER_HASH_VERSION');
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length > 0 && fields.length <= 137, 'FLAT_PROVIDER_HASH_TUPLE');
      const inputs = fields.map(value => {
        assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS, 'FLAT_PROVIDER_HASH_FIELD');
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
      });
      const result = Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
      canonicalField(result); return result;
    });
  } finally { await backend?.destroy(); }
}

/** Explicit new custody only. The recipient must actually accept the original
 * invoice before bindQuote; the clause string by itself is never acceptance.
 */
export async function createOwnedFlatEvmVaultProvider(input) {
  return createOwnedFlatEvmDeliveryProvider(input, 'LEGACY');
}
/** Original official MetaMorpho only; uses the same quote, journal and P/R gate. */
export async function createOwnedFlatMetaMorphoProviderV1(input) {
  return createOwnedFlatEvmDeliveryProvider(input, 'METAMORPHO');
}
export async function createOwnedFlatUniswapProviderV1(input) {
  return createOwnedFlatEvmDeliveryProvider(input, 'UNISWAP');
}
export async function createOwnedFlatAaveStaticProviderV1(input) { return createOwnedFlatEvmDeliveryProvider(input,'AAVE_STATIC'); }
export async function createOwnedFlatMorphoBluePositionProviderV1(input) { assert.equal(arguments.length,1);return createOwnedFlatEvmDeliveryProvider(input,'MORPHO_BLUE_POSITION'); }

/** Fixed original provider credential born before D26 funding. The opaque slot
 * contains its own infra key; no caller signer or journal path is accepted. */
export async function createOriginalDeviceMetaMorphoProviderSlotV4(input){
 assert.equal(arguments.length,1);exactRecord(input,['runtime','system','poolIndex','router','observer','operatorQuorum','rule','rulePath','slot','maximumInput','shareAmount','payoutAmount']);
 const {runtime,system,router,observer,operatorQuorum}=input;assert.equal(input.poolIndex,0);assert.ok(Number.isInteger(input.slot)&&input.slot>=0&&input.slot<4,'FLAT_PROVIDER_SLOT');
 for(const k of ['maximumInput','shareAmount','payoutAmount'])assert.ok(inputUint(input[k])>0n,'FLAT_PROVIDER_SLOT_QUOTA');
 await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);assertOwnedEvmGraphDeliveryRouterV1(runtime,system,router,observer);assertOwnedEvmGraphDeliveryObserverV1(observer,{runtime,system,poolIndex:1});assert.ok(isOwnedMetaMorphoGraphDeliveryObserverV1(observer),'FLAT_PROVIDER_FIXED_OBSERVER_VARIANT');assertOwnedFlatOperatorQuorum(operatorQuorum,{runtime,system,nativeRuntime:observer,family:'3'});
 assert.equal(input.rule.family,'3');assert.equal(nativeAdmissionRuleRoot(input.rule,input.rulePath),system.registry.rulesRoot,'FLAT_PROVIDER_REGISTERED_RULE');
 const reader=await createFlatSystemStateReader({runtime,system,poolIndex:0}),view=await reader.read();await reader.assertCurrent(view);assert.ok(view.ledger.commitments.length===0&&view.ledger.nullifiers.length===0,'FLAT_PROVIDER_SLOT_BEFORE_FUNDING');
 const directory=await mkdtemp(join(runtime.metadata.scratchDirectory,'device-external-graph-provider-slot-'));await chmod(directory,0o700);await privateDirectory(runtime,directory);
 const key=freshKey(),password=randomBytes(32).toString('hex'),vault=new Vault(join(directory,'provider-slot.vault')),data={schema:'ORIGINAL_DEVICE_META_PROVIDER_SLOT_V4',slot:input.slot,maximumInput:input.maximumInput,shareAmount:input.shareAmount,payoutAmount:input.payoutAmount,rule:copy(input.rule),rulePath:copy(input.rulePath),state:'BORN',providerKey:{x:key.x.toString('hex'),y:key.y.toString('hex')},privateKeyPem:key.privateKey.export({type:'pkcs8',format:'pem'})},record=await vault.create(data,password);equal(await vault.read(password),record);
 const token=Object.freeze(Object.create(null));providerSlotsV4.set(token,{...input,rule:copy(input.rule),rulePath:copy(input.rulePath),directory,password,vault,record,key,used:false,closed:false});return token;
}
export async function activateOriginalDeviceMetaMorphoProviderSlotV4(token,input){
 assert.equal(arguments.length,2);const s=providerSlotsV4.get(token);assert.ok(s&&!s.used&&!s.closed,'FLAT_PROVIDER_ORIGINAL_SLOT');
 exactRecord(input,['runtime','system','poolIndex','router','observer','operatorQuorum','rule','rulePath','descriptor','depositProof','terms','acceptedLossClause']);
 for(const k of ['runtime','system','poolIndex','router','observer','operatorQuorum'])assert.equal(input[k],s[k],'FLAT_PROVIDER_SLOT_BINDING');equal(input.rule,s.rule);equal(input.rulePath,s.rulePath);
 const d=evmGraphDeliveryTermsV1(input.descriptor);assert.equal(d.route.assetAmount,s.maximumInput,'FLAT_PROVIDER_SLOT_QUOTA');assert.equal(d.route.shareAmount,s.shareAmount,'FLAT_PROVIDER_SLOT_QUOTA');assert.equal(input.terms.amount,s.shareAmount,'FLAT_PROVIDER_SLOT_QUOTA');
 await privateDirectory(s.runtime,s.directory);equal(await s.vault.read(s.password),s.record);assert.ok(!s.used&&!s.closed,'FLAT_PROVIDER_ORIGINAL_SLOT');s.used=true;
 s.record=await s.vault.update(s.password,s.record.revision,data=>({...data,state:'ACTIVATING'}));equal(await s.vault.read(s.password),s.record);
 let provider;try{provider=await createOwnedFlatEvmDeliveryProvider({...input,directory:s.directory,password:s.password},'METAMORPHO',s.key);
  s.record=await s.vault.update(s.password,s.record.revision,data=>({...data,state:'BOUND'}));equal(await s.vault.read(s.password),s.record);s.key=null;s.provider=provider;return provider;
 }catch(error){await provider?.close().catch(()=>{});s.key=null;throw error;}
}
/** Credential/checkpoint DATA from the same original slot only. The fixed
 * workspace seals it in the existing private lifetime registry. It cannot
 * create a provider and the observation opener never reactivates this key. */
export async function snapshotOriginalDeviceMetaMorphoProviderSlotV4(token){
 assert.equal(arguments.length,1);const s=providerSlotsV4.get(token);assert.ok(s&&!s.closed,'FLAT_PROVIDER_ORIGINAL_SLOT');
 await privateDirectory(s.runtime,s.directory);const slotRecord=await s.vault.read(s.password);equal(slotRecord,s.record);assert.ok(['BORN','BOUND'].includes(slotRecord.data.state),'FLAT_PROVIDER_SLOT_UNCERTAIN');
 let providerRecord=null;if(s.provider){assertOwnedFlatEvmVaultProvider(s.provider,{runtime:s.runtime,system:s.system,poolIndex:s.poolIndex,router:s.router,observer:s.observer});assert.equal(s.provider.report().persistenceUncertain,false,'FLAT_PROVIDER_SLOT_UNCERTAIN');const vault=new Vault(join(s.directory,'evm-vault-provider.vault'));providerRecord=await vault.read(s.password);equal(await vault.read(s.password),providerRecord);}
 assert.equal(slotRecord.data.state==='BOUND',s.used&&s.provider!==undefined,'FLAT_PROVIDER_SLOT_UNCERTAIN');equal(await s.vault.read(s.password),slotRecord);await privateDirectory(s.runtime,s.directory);
 return copy({schema:'ORIGINAL_DEVICE_META_PROVIDER_SLOT_CHECKPOINT_V4',slot:s.slot,directory:s.directory,password:s.password,router:s.router.address,slotRecord,providerRecord});
}
export function closeOriginalDeviceMetaMorphoProviderSlotV4(token){assert.equal(arguments.length,1);const s=providerSlotsV4.get(token);assert.ok(s,'FLAT_PROVIDER_ORIGINAL_SLOT');s.closed=true;s.key=null;s.password=null;return{closed:true};}

async function createOwnedFlatEvmDeliveryProvider(input, variant,originalSlotKey=null) {
  const officialMetaMorpho = variant === 'METAMORPHO', officialUniswap = variant === 'UNISWAP', officialAave = variant === 'AAVE_STATIC', originalBlue=variant==='MORPHO_BLUE_POSITION';
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'router', 'observer', 'operatorQuorum', 'rule', 'rulePath',
    'descriptor', 'depositProof', 'terms', 'acceptedLossClause', 'directory', 'password']);
  const { runtime, system, router, observer, operatorQuorum } = input;
  const poolIndex = index(input.poolIndex);
  const terms = copy(input.terms), rule = copy(input.rule), rulePath = copy(input.rulePath);
  const descriptor = copy(input.descriptor), depositProof = input.depositProof;
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  assert.equal(isMetaMorphoGraphDescriptorV1(descriptor), officialMetaMorpho, 'FLAT_PROVIDER_FIXED_DESCRIPTOR_VARIANT');
  assert.equal(isOwnedMetaMorphoGraphDeliveryObserverV1(observer), officialMetaMorpho, 'FLAT_PROVIDER_FIXED_OBSERVER_VARIANT');
  assert.equal(isUniswapGraphDescriptorV1(descriptor), officialUniswap, 'FLAT_PROVIDER_FIXED_DESCRIPTOR_VARIANT');
  assert.equal(isOwnedUniswapGraphDeliveryObserverV1(observer), officialUniswap, 'FLAT_PROVIDER_FIXED_OBSERVER_VARIANT');
  assert.equal(isAaveStaticGraphDescriptorV1(descriptor),officialAave,'FLAT_PROVIDER_FIXED_DESCRIPTOR_VARIANT');
  assert.equal(isOwnedAaveStaticGraphDeliveryObserverV1(observer),officialAave,'FLAT_PROVIDER_FIXED_OBSERVER_VARIANT');
  assert.equal(isMorphoBluePositionGraphDescriptorV1(descriptor),originalBlue,'FLAT_PROVIDER_FIXED_DESCRIPTOR_VARIANT');
  assert.equal(isOwnedMorphoBluePositionGraphDeliveryObserverV1(observer),originalBlue,'FLAT_PROVIDER_FIXED_OBSERVER_VARIANT');
  const descriptorTerms = evmGraphDeliveryTermsV1(descriptor),
    profile = originalBlue ? 'OWNED_FLAT_ORIGINAL_MORPHO_BLUE_POSITION_PROVIDER_V1' : officialAave ? 'OWNED_FLAT_AAVE_STATIC_PROVIDER_V1' : officialUniswap ? OWNED_FLAT_UNISWAP_PROVIDER_PROFILE_V1
      : officialMetaMorpho ? OWNED_FLAT_METAMORPHO_PROVIDER_PROFILE_V1 : OWNED_FLAT_EVM_VAULT_PROVIDER_PROFILE;
  assert.ok(typeof depositProof === 'string' && /^(?:[0-9a-f]{2})+$/.exec(depositProof)?.[0] === depositProof
    && depositProof.length <= 131072, 'FLAT_PROVIDER_ORIGINAL_D27_PROOF');
  const directory = input.directory;
  let password = input.password;
  exactRecord(terms, TERMS); for (const name of ['scope', 'policy', 'asset']) bytes32(terms[name], true);
  assert.ok(inputUint(terms.amount, 128) > 0n, 'FLAT_PROVIDER_AMOUNT');
  assert.ok(inputUint(terms.executionFrom) < inputUint(terms.executionUntil)
    && inputUint(terms.executionUntil) <= inputUint(terms.settleBefore), 'FLAT_PROVIDER_WINDOW');
  assert.equal(input.acceptedLossClause, NATIVE_ADMISSION_LOSS_CLAUSE, 'FLAT_PROVIDER_EXPLICIT_LOSS_ACCEPTANCE');
  assert.ok(typeof password === 'string' && password.length > 0 && Buffer.byteLength(password) <= 1024, 'FLAT_PROVIDER_PASSWORD');
  nativeRuleCommitment(rule);
  assert.equal(rule.family, '3', 'FLAT_PROVIDER_EVM_FAMILY');
  await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer);
  assert.equal(poolIndex, router.sourcePoolIndex, 'FLAT_PROVIDER_ROUTER_SOURCE_POOL');
  const recipientIndex = index(router.destinationPoolIndex);
  const observerBinding = { runtime, system, poolIndex: recipientIndex };
  assertOwnedEvmGraphDeliveryObserverV1(observer, observerBinding);
  const quorumBinding = { runtime, system, nativeRuntime: observer, family: '3' };
  assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding);
  assert.ok([runtime, router, observer].every(Object.isFrozen), 'FLAT_PROVIDER_IMMUTABLE_RUNTIME');
  assertOwnedEvmGraphDeliveryDescriptorV1(runtime, system, router, observer, descriptor);
  const pool = system.pools[poolIndex], domain = copy(validateStruct('domain', pool.domain));
  for (const name of ['scope', 'policy', 'asset']) assert.equal(terms[name], domain[name], 'FLAT_PROVIDER_POOL_TERMS');
  equal([domain.scope, domain.policy, domain.asset], [bare(pool.scope), bare(pool.policy), bare(pool.assetIdentity)]);
  assert.equal(domain.hubDomain, bare(system.hubDomain), 'FLAT_PROVIDER_HUB');
  assert.equal(domain.ledgerNamespace, domain.hubDomain, 'FLAT_PROVIDER_INITIAL_NAMESPACE');
  assert.equal(domain.registryCommitment, bare(system.registryCommitment), 'FLAT_PROVIDER_REGISTRY');
  assert.equal(domain.verifierSetCommitment, bare(system.verifierSetCommitment), 'FLAT_PROVIDER_VERIFIERS');
  const registry = copy(system.registry);
  assert.equal(nativeQuorumRegistryCommitment(registry), domain.registryCommitment, 'FLAT_PROVIDER_REGISTRY');
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: domain.registryCommitment });
  exactRecord(rulePath, ['index', 'siblings']); inputUint(rulePath.index, 8, 7n);
  fixedArray(rulePath.siblings, 3); rulePath.siblings.forEach(value => bytes32(value));
  assert.equal(nativeAdmissionRuleRoot(rule, rulePath), registry.rulesRoot, 'FLAT_PROVIDER_RULE_MEMBERSHIP');
  const native = freeze({ family: '3', genesis: rule.genesis, asset: rule.asset,
    sourceEndpoint: descriptorTerms.identity.solver, destinationEndpoint: descriptorTerms.identity.router,
    changeEndpoint: null, descriptor, depositProof });
  assert.equal(rule.genesis, descriptorTerms.identity.genesisHash, 'FLAT_PROVIDER_EVM_GENESIS');
  assert.equal(rule.asset, descriptorTerms.identity.shareIdentity, 'FLAT_PROVIDER_EVM_ASSET');
  assert.equal(domain.asset, descriptorTerms.identity.assetIdentity, 'FLAT_PROVIDER_EVM_SOURCE_ASSET');
  assert.equal(domain.ledgerNamespace, descriptorTerms.identity.ledgerNamespace, 'FLAT_PROVIDER_EVM_NAMESPACE');
  // q is the delivered share amount. Solver underlying liquidity is advanced
  // publicly; B is reimbursed from the original private reservation invoice.
  assert.equal(terms.amount, descriptorTerms.route.shareAmount, 'FLAT_PROVIDER_EXACT_SHARES');
  for (const name of ['executionFrom', 'executionUntil'])
    assert.equal(terms[name], descriptorTerms.route[name], 'FLAT_PROVIDER_EXACT_WINDOW');
  const sourceCommitment = evmFundingEndpointCommitment({ genesis: rule.genesis, asset: rule.asset,
    address: native.sourceEndpoint }), destinationCommitment = evmGraphDeliveryDescriptorCommitmentV1(descriptor);
  assert.notEqual(sourceCommitment, destinationCommitment, 'FLAT_PROVIDER_SELF_PAYMENT');
  const bootstrap = freeze({ profile, pool: bare(pool.address, 20),
    poolIndex, recipientIndex, domain, registry, rule, rulePath, native, terms,
    acceptedLossClause: input.acceptedLossClause, chainDomain: nativeAdmissionChainDomain(rule),
    evidencePolicy: nativeRuleCommitment(rule), sourceCommitment, destinationCommitment,
    custodyCommitment: nativeCustodyCommitment({ family: rule.family, genesis: rule.genesis, asset: rule.asset,
      sourceCommitment, destinationCommitment }) });
  await assertOwnedLocalEvmV2(runtime); await router.read(); await privateDirectory(runtime, directory);
  const stateReader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const initialView = await stateReader.read();
  assert.equal(initialView.domainCommitment, bare(pool.domainCommitment), 'FLAT_PROVIDER_CURRENT_DOMAIN');
  await stateReader.assertCurrent(initialView);
  const vault = new Vault(join(directory, 'evm-vault-provider.vault'));
  let key = originalSlotKey??freshKey(), record, busy = false, closed = false, poisoned = false;
  const providerKey = freeze({ x: key.x.toString('hex'), y: key.y.toString('hex') });
  const live = () => assert.ok(!closed && !poisoned, 'FLAT_PROVIDER_CLOSED_OR_POISONED');
  async function unchanged() {
    live();
    try { await privateDirectory(runtime, directory); equal(await vault.read(password), record); }
    catch (cause) { poisoned = true; throw new Error('FLAT_PROVIDER_CUSTODY_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  async function save(data) {
    await unchanged();
    try {
      const next = await vault.update(password, record.revision, () => copy(data));
      equal(await vault.read(password), next); record = next;
    } catch (cause) { poisoned = true; throw new Error('FLAT_PROVIDER_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  try {
    record = await vault.create({ schema: SCHEMA, bootstrap, providerKey,
      privateKeyPem: key.privateKey.export({ type: 'pkcs8', format: 'pem' }), quote: null,
      dispatch: null, providerSigning: null }, password);
    await unchanged();
  } catch (error) { key = password = record = undefined; throw error; }
  const actionTemplate = freeze({ chainDomain: bootstrap.chainDomain, signerIdentity: nativeProviderIdentity(providerKey),
    sourceCommitment, destinationCommitment, amount: terms.amount, custodyKind: 1,
    custodyCommitment: bootstrap.custodyCommitment,
    ...Object.fromEntries(['executionFrom', 'executionUntil', 'settleBefore'].map(name => [name, terms[name]])) });
  const bindingFor = quote => normalizeNativeDispatchBinding({ domain, pool: bootstrap.pool, registry, rule, rulePath,
    providerKey, native, quote: Object.fromEntries(['action', 'payoutCommitment', 'deliveryRiskSalt'].map(name => [name, quote[name]])),
    acceptedLossClause: bootstrap.acceptedLossClause });
  function checkedQuote(raw) {
    const quote = copy(raw); exactRecord(quote, QUOTE);
    for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'])
      assert.equal(quote[name], domain[name], 'FLAT_PROVIDER_QUOTE_DOMAIN');
    nativeTransferActionCommitment(quote.action); bytes32(quote.payoutCommitment, true); bytes32(quote.deliveryRiskSalt, true);
    equal(Object.fromEntries(TEMPLATE.map(name => [name, quote.action[name]])), actionTemplate);
    assert.equal(quote.action.deliveryRiskCommitment, nativeDeliveryRiskCommitment({ clause: bootstrap.acceptedLossClause,
      hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: actionTemplate.chainDomain,
      sourceCommitment, destinationCommitment, amount: terms.amount, scope: domain.scope, policy: domain.policy,
      asset: domain.asset, payoutCommitment: quote.payoutCommitment, settleBefore: terms.settleBefore,
      salt: quote.deliveryRiskSalt }), 'FLAT_PROVIDER_QUOTE_RISK');
    bindingFor(quote);
    // Freeze the original owner's proof as part of the full call, without
    // adding proof bytes or K to the descriptor's semantic commitment.
    encodeEvmGraphDeliveryCallV1({ descriptor, receiptKeyCommitment: quote.action.receiptKeyCommitment, proof: depositProof });
    return quote;
  }
  const store = Object.freeze({ async load() { await unchanged(); return copy(record.data.dispatch); },
    async commit(request) {
      const next = copy(request); exactRecord(next, ['expectedRevision', 'nextState']); await unchanged();
      const previous = record.data.dispatch;
      assert.equal(next.expectedRevision, previous.revision, 'FLAT_PROVIDER_DISPATCH_CAS');
      const revision = inputUint(previous.revision) + 1n; inputUint(revision.toString());
      const dispatch = { revision: revision.toString(), state: next.nextState };
      await save({ ...record.data, dispatch }); return copy(dispatch);
    } });
  const healthReader = Object.freeze({ async read(request) {
    exactRecord(request, ['pool', 'domainCommitment']);
    assert.equal(request.pool, bootstrap.pool); assert.equal(request.domainCommitment, bare(pool.domainCommitment));
    assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding);
    const permit = await operatorQuorum.health({ poolIndex });
    return copy({ message: permit.message, indexes: permit.indexes, signatures: permit.signatures });
  } });
  const providerSigner = Object.freeze({ publicKey: providerKey, async signDispatch(raw) {
    const statement = copy(raw); nativeDispatchStatementFrame(statement); await unchanged();
    const journal = record.data.dispatch.state.journal;
    assert.ok(journal?.phase === 'NATIVE_SIGNED' && journal.signed, 'FLAT_PROVIDER_NATIVE_JOURNAL_REQUIRED');
    const descriptor = journal.intent.readinessOpening.descriptor;
    equal(statement, { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
      readyStatement: journal.intent.readyStatement, localCommitment: descriptor.localCommitment,
      dispatchId: descriptor.dispatchId, actionCommitment: descriptor.actionCommitment,
      globalEffectId: journal.signed.globalEffectId, deliveryRiskCommitment: record.data.quote.action.deliveryRiskCommitment,
      signedAt: journal.signedAt });
    if (record.data.providerSigning !== null) {
      equal(record.data.providerSigning.statement, statement);
      assert.ok(record.data.providerSigning.signature !== null, 'FLAT_PROVIDER_SIGNING_UNCERTAIN_NO_RETRY');
      return record.data.providerSigning.signature;
    }
    // Claim this exact H4 frame durably before sole SHA256/ECDSA key use. An
    // uncertain intent/signature write is never permission to sign again.
    await save({ ...record.data, providerSigning: { statement, signature: null } });
    const signed = signature(key, nativeDispatchStatementFrame(statement)).toString('hex');
    await save({ ...record.data, providerSigning: { statement, signature: signed } }); return signed;
  } });
  async function serial(work) {
    live(); assert.ok(!busy, 'FLAT_PROVIDER_BUSY'); busy = true;
    try { await unchanged(); await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system);
      assertOwnedEvmGraphDeliveryRouterV1(runtime, system, router, observer); assertOwnedEvmGraphDeliveryObserverV1(observer, observerBinding);
      assertOwnedFlatOperatorQuorum(operatorQuorum, quorumBinding); return await work(); }
    finally { busy = false; }
  }
  async function operation(method, request) {
    return serial(async () => {
      assert.ok(record.data.quote && record.data.dispatch, 'FLAT_PROVIDER_QUOTE_REQUIRED');
      let verifier, gate;
      try {
        verifier = await createPinnedVerifier('dispatch');
        return await withPinnedHash(async hashFields => {
          gate = await createOwnedEvmVaultDispatchGate({ runtime, system, router, observer,
            binding: bindingFor(record.data.quote), hashFields, verifier, providerSigner, stateReader, healthReader, store });
          try { return method === 'execute' ? await gate.execute(request) : await gate.reconcile(); }
          finally { gate.close(); gate = undefined; }
        });
      } finally { try { gate?.close(); } finally { await verifier?.dispose(); } }
    });
  }
  const provider = Object.create(null);
  Object.defineProperties(provider, {
    offer: { value() { live(); return freeze(copy({ providerKey, signerIdentity: actionTemplate.signerIdentity,
      actionTemplate, evidencePolicy: bootstrap.evidencePolicy, acceptedLossClause: bootstrap.acceptedLossClause })); } },
    bindQuote: { value(request) {
      exactRecord(request, ['recipientCustody']); assertOwnedNativeRecipientProcess(request.recipientCustody);
      const recipientCustody = request.recipientCustody;
      return serial(async () => {
        const quote = checkedQuote(await recipientCustody.acceptedQuote());
        if (record.data.quote !== null) equal(record.data.quote, quote);
        else {
          assert.equal(record.data.dispatch, null, 'FLAT_PROVIDER_QUOTE_REBOUND');
          await save({ ...record.data, quote,
            dispatch: { revision: '0', state: createNativeDispatchJournal(bindingFor(quote)) } });
        }
        return freeze({ bound: true, payoutCommitment: quote.payoutCommitment });
      });
    } },
    execute: { value(request) {
      const ownedRequest = copy(request);
      exactRecord(ownedRequest, ['dependencyProof', 'readyProof', 'readinessOpening', 'action', 'deliveryRiskSalt', 'receiptSpendSecret']);
      return operation('execute', ownedRequest);
    } },
    reconcile: { value() { assert.equal(arguments.length, 0, 'FLAT_PROVIDER_RECONCILE_FIELDS'); return operation('reconcile'); } },
    report: { value() { return freeze({ profile, closed, persistenceUncertain: poisoned,
      quoteBound: Boolean(record?.data.quote), phase: record?.data.dispatch?.state.journal?.phase ?? (record?.data.quote ? 'BOUND' : 'OFFERED'),
      providerSigningStarted: Boolean(record?.data.providerSigning),
      assurance: 'COMMON_TRUSTED_HOST_SYNTHETIC_CUSTODY_NOT_INDEPENDENT_OPERATORS' }); } },
    close: { value() { assert.ok(!busy, 'FLAT_PROVIDER_BUSY'); closed = true;
      // Drop references only: JavaScript/KeyObject memory is not strongly zeroized.
      key = password = record = undefined; return freeze({ closed: true }); } },
    toJSON: { value() { throw new Error('FLAT_PROVIDER_NOT_SERIALIZABLE'); } },
  });
  ownedProviders.set(provider, { runtime, system, poolIndex, router, observer, operatorQuorum,
    family: rule.family, recipientIndex, assertLive: live,
    manualReview() {
      live(); assert.ok(record.data.quote && record.data.dispatch, 'FLAT_PROVIDER_QUOTE_REQUIRED');
      const original = bootstrap.native.descriptor, d = evmGraphDeliveryTermsV1(original), target = decodeEvmVaultDepositStatement(d.publicInputs);
      if (officialUniswap) return freeze({ routeProfile: 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1', family: '3',
        protocolKind: original.plan.protocolKind, fee: original.plan.fee, chainId: d.identity.chainId, genesis: d.identity.genesisHash,
        router: d.identity.router, protocol: original.plan.identity.protocol, inputToken: original.plan.identity.inputAsset, outputToken: d.identity.vault,
        solver: d.identity.solver, sourcePool: bootstrap.pool, targetPool: d.identity.targetPool,
        sourceAssetIdentity: d.identity.assetIdentity, targetAssetIdentity: d.identity.shareIdentity,
        targetCommitment: target.output, descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(original),
        solverMaximumInputAmount: d.route.assetAmount, deliveredOutputAmount: d.route.shareAmount,
        executionFrom: d.route.executionFrom, executionUntil: d.route.executionUntil, settleBefore: terms.settleBefore,
        payoutCommitment: record.data.quote.payoutCommitment, deliveryRiskCommitment: record.data.quote.action.deliveryRiskCommitment,
        deliveryLossClause: bootstrap.acceptedLossClause, protocolAmountsPublic: true, publicNetwork: false });
      if (officialMetaMorpho || officialAave || originalBlue) return freeze({ routeProfile: originalBlue ? 'REGISTERED_LOCAL_EVM_MORPHO_BLUE_PRIVATE_SUPPLY_V1' : officialAave ? 'REGISTERED_LOCAL_EVM_AAVE_STATIC_V1' : 'REGISTERED_LOCAL_EVM_METAMORPHO_V1', family: '3',
        protocolKind: original.plan.protocolKind, chainId: d.identity.chainId, genesis: d.identity.genesisHash,
        router: d.identity.router, vault: d.identity.vault, solver: d.identity.solver,
        sourcePool: bootstrap.pool, targetPool: d.identity.targetPool,
        sourceAssetIdentity: d.identity.assetIdentity, targetAssetIdentity: d.identity.shareIdentity,
        targetCommitment: target.output, descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(original),
        solverMaximumUnderlyingAmount: d.route.assetAmount, deliveredShares: d.route.shareAmount,
        executionFrom: d.route.executionFrom, executionUntil: d.route.executionUntil, settleBefore: terms.settleBefore,
        payoutCommitment: record.data.quote.payoutCommitment, deliveryRiskCommitment: record.data.quote.action.deliveryRiskCommitment,
        deliveryLossClause: bootstrap.acceptedLossClause, protocolAmountsPublic: true, publicNetwork: false });
      return freeze({ routeProfile: 'REGISTERED_LOCAL_EVM_VAULT_V1', family: '3',
        chainId: d.identity.chainId, genesis: d.identity.genesisHash,
        router: d.identity.router, vault: d.identity.vault, solver: d.identity.solver,
        sourcePool: bootstrap.pool, targetPool: d.identity.targetPool,
        sourceAssetIdentity: d.identity.assetIdentity, targetAssetIdentity: d.identity.shareIdentity,
        targetCommitment: target.output, descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(original),
        solverUnderlyingAmount: d.route.assetAmount, deliveredShares: d.route.shareAmount,
        executionFrom: d.route.executionFrom, executionUntil: d.route.executionUntil,
        settleBefore: terms.settleBefore, payoutCommitment: record.data.quote.payoutCommitment,
        deliveryLossClause: bootstrap.acceptedLossClause });
    } });
  return Object.freeze(provider);
}
