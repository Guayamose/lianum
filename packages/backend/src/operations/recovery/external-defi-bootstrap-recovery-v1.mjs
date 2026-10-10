/** Original external-DeFi bootstrap recovery through the existing encrypted
 * lifetime registry and ordered recovery authority. No raw JSON authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalClaimRecordDataV1} from '../../claims/storage/segmented-record-store.mjs';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {assertOwnedLocalEvmV2} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertOwnedFlatSystem,captureOwnedFlatSystemRecoveryV1,reopenOwnedFlatSystemRecoveryV1} from '../deployments/system/deploy-system.mjs';
import {assertOfficialProtocolFixture,captureOfficialProtocolFixtureRecoveryV1,reopenOfficialProtocolFixtureRecoveryV1} from '../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import {assertOwnedPrivateExternalRouterV1,captureOwnedPrivateExternalRouterRecoveryV1,reopenOwnedPrivateExternalRouterRecoveryV1} from '../deployments/defi/deploy-private-external-router-v1.mjs';
import {assertRetainedLocalFlatOperatorGroupV1,captureRetainedLocalFlatOperatorGroupV1,reopenRetainedLocalFlatOperatorGroupV1} from '../operators/claims/native-operators.mjs';
import {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,updateWrappedPrivateLifetimePartV1,assertWrappedPrivateLifetimePartSealedV1,assertWrappedPrivateLifetimeAttemptV1,wrappedPrivateLifetimeRuntimeCheckpointV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {retainOriginalWrappedRecoverySectionV1,consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
const owned=new WeakMap(),parts=new WeakMap(),SLOT='custody-bootstrap';
const sha=value=>createHash('sha256').update(canonicalClaimRecordDataV1(value)).digest('hex');
function assertSameAttempt(runtime,token){assertWrappedPrivateLifetimeAttemptV1(runtime,originalWrappedRecoverySectionIdentityV1(token,'system'));}
function identity(runtime,system){return {profile:'EXTERNAL_DEFI_BOOTSTRAP_RECOVERY_V1',genesis:runtime.metadata.evmGenesis,hub:system.hub.address};}
function assertActors(s){
 assertOwnedFlatSystem(s.runtime,s.system);assertOfficialProtocolFixture(s.runtime,s.protocols);assertRetainedLocalFlatOperatorGroupV1(s.operatorGroup,{runtime:s.runtime});
 assert.equal(s.routers.length,2);assert.equal(s.system.pools.length,2);assert.equal(s.operatorGroup.operators.length,4);
 assert.deepEqual(s.operatorGroup.operators.map(o=>o.publicKey),s.system.registry.keys,'ORIGINAL_OPERATOR_REGISTRY');
 for(let poolIndex=0;poolIndex<2;poolIndex++){assertOwnedPrivateExternalRouterV1(s.routers[poolIndex],{runtime:s.runtime,system:s.system,poolIndex});assert.equal(s.routers[poolIndex].identity.solver,s.runtime.accounts[0].slice(2));}
 assert.equal(s.routers[0].protocolKind,'UNISWAP_V3_EXACT_OUTPUT_SINGLE');assert.equal(s.routers[1].protocolKind,'METAMORPHO_V1_EXACT_SHARE_MINT');
}
function inventory(s){assertActors(s);return {profile:'EXTERNAL_DEFI_BOOTSTRAP_ACTORS_V1',genesis:s.runtime.metadata.evmGenesis,chainId:s.runtime.metadata.chainId,
 runtimeAccounts:[...s.runtime.accounts],operatorKeys:s.operatorGroup.operators.map(o=>structuredClone(o.publicKey)),hub:s.system.hub.address,
 poolAddresses:s.system.pools.map(p=>p.address),poolDomains:s.system.pools.map(p=>structuredClone(p.domain)),
 verifierAddresses:Object.fromEntries(Object.entries(s.system.verifiers).map(([role,v])=>[role,v.address])),
 protocolDeployments:s.protocols.deployments.map(p=>({name:p.name,address:p.address,creationSHA256:p.creationSHA256})),
 routers:s.routers.map(r=>({identity:structuredClone(r.identity),protocolKind:r.protocolKind,fee:r.fee,creationTransactionHash:r.creationTransactionHash})),
 externalProtocolAdmin:s.runtime.accounts[0],solver:s.runtime.accounts[0],providers:[]};}
async function snapshot(s){
 assertActors(s);await assertOwnedLocalEvmV2(s.runtime);const head=await s.runtime.block();
 const system=await captureOwnedFlatSystemRecoveryV1(s.runtime,s.system),protocols=await captureOfficialProtocolFixtureRecoveryV1(s.runtime,s.protocols),routers=[];
 for(const router of s.routers)routers.push(await captureOwnedPrivateExternalRouterRecoveryV1(router));
 for(const record of [system,protocols,...routers])assert.deepEqual(record.head,head,'SAME_ORIGINAL_BOOTSTRAP_HEAD');
 await s.runtime.assertCanonical(head);assert.deepEqual(await s.runtime.block(),head);
 return {schema:'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1',system,protocols,routers,head:structuredClone(head),inventory:inventory(s),operatorReceipt:null};
}
function issue(s){const bootstrap=Object.freeze({runtime:s.runtime,system:s.system,protocols:s.protocols,routers:Object.freeze([...s.routers]),operatorGroup:s.operatorGroup,
 inventory:()=>{assert.ok(!s.closed&&!s.sealed);return structuredClone(inventory(s));},
 close:async()=>{if(s.closed)return {closed:true};s.sealed=true;const results=await Promise.allSettled(s.operatorGroup.operators.map(o=>o.close()));s.closed=true;const errors=results.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'EXTERNAL_BOOTSTRAP_OPERATOR_CLOSE');return {closed:true};}});owned.set(bootstrap,s);return bootstrap;}
export async function createExternalDefiBootstrapRecoveryV1(input){
 exactRecord(input,['runtime','system','protocols','routers','operatorGroup']);const s={...input,closed:false,sealed:false,handle:null,record:null};assertActors(s);
 s.identity=identity(s.runtime,s.system);s.record=await snapshot(s);s.handle=await retainWrappedPrivateLifetimePartV1(s.runtime,SLOT,s.identity,s.record);assertWrappedPrivateLifetimePartSealedV1(s.handle);return issue(s);
}
export async function retainExternalDefiBootstrapForReopenV1(input){
 exactRecord(input,['runtime','bootstrap','attemptAuthority']);const s=owned.get(input.bootstrap);assert.ok(s&&!s.closed&&!s.sealed);assert.equal(s.runtime,input.runtime);s.sealed=true;
 assertSameAttempt(input.runtime,input.attemptAuthority);
 try{
  const current=await s.runtime.block();const record=JSON.stringify(current)===JSON.stringify(s.record.head)?structuredClone(s.record):await snapshot(s);
  assert.deepEqual(record.inventory,inventory(s),'ORIGINAL_BOOTSTRAP_INVENTORY');
  record.operatorReceipt=await captureRetainedLocalFlatOperatorGroupV1(s.operatorGroup);s.closed=true;
  await updateWrappedPrivateLifetimePartV1(s.handle,record);assertWrappedPrivateLifetimePartSealedV1(s.handle);s.record=record;
  await s.runtime.assertCanonical(record.head);assert.deepEqual(await s.runtime.block(),record.head);
  await retainOriginalWrappedRecoverySectionV1(input.attemptAuthority,'system',{schema:'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2',hashProfile:'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1',legacyBinding:null,identity:s.identity,stateSHA256:sha(record),inventorySHA256:sha(record.inventory)});
  return {retained:true,originalResourcesStopped:true};
 }catch(error){try{await input.bootstrap.close();}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_BOOTSTRAP_CAPTURE_CLEANUP');}throw error;}
}
function part(value,kind){const token=Object.freeze(Object.create(null));parts.set(token,{kind,value});return token;}
export function consumeExternalDefiBootstrapPartV1(token,kind){const row=parts.get(token);assert.ok(row&&row.kind===kind,'ORIGINAL_EXTERNAL_BOOTSTRAP_PART');parts.delete(token);return row.value;}
export function assertCanonicalExternalBootstrapSectionV2(input){
 exactRecord(input,['descriptor','state','partVersion','registryCheckpoint']);const {descriptor,state:r}=input;
 exactRecord(descriptor,['schema','hashProfile','legacyBinding','identity','stateSHA256','inventorySHA256']);
 assert.equal(descriptor.schema,'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2');assert.equal(descriptor.hashProfile,'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1');
 assert.equal(sha(r),descriptor.stateSHA256);assert.equal(sha(r.inventory),descriptor.inventorySHA256);
 if(descriptor.legacyBinding!==null){
  const binding=descriptor.legacyBinding;exactRecord(binding,['profile','legacyDescriptorSHA256','registryCheckpoint','partIdentitySHA256','partVersion']);
  assert.equal(binding.profile,'AUTHENTICATED_V1_TO_CANONICAL_BOOTSTRAP_V2');assert.match(binding.legacyDescriptorSHA256,/^[0-9a-f]{64}$/);
  assert.equal(binding.partIdentitySHA256,sha(descriptor.identity));assert.equal(binding.partVersion,input.partVersion);
  exactRecord(binding.registryCheckpoint,['revision','commitment']);assert.ok(Number.isSafeInteger(binding.registryCheckpoint.revision)&&binding.registryCheckpoint.revision>=0);assert.match(binding.registryCheckpoint.commitment,/^[0-9a-f]{64}$/);
  assert.deepEqual(input.registryCheckpoint,binding.registryCheckpoint,'ORIGINAL_CANONICAL_MIGRATION_CHECKPOINT');
 }
 return undefined;
}

export async function reopenExternalDefiBootstrapFromAuthorityV1(input){
 exactRecord(input,['runtime','attemptAuthority']);const {runtime}=input;await assertOwnedLocalEvmV2(runtime);
 assertSameAttempt(input.runtime,input.attemptAuthority);const descriptor=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'system');
 exactRecord(descriptor,['schema','hashProfile','legacyBinding','identity','stateSHA256','inventorySHA256']);assert.equal(descriptor.schema,'EXTERNAL_DEFI_BOOTSTRAP_SECTION_V2');assert.equal(descriptor.hashProfile,'CLAIM_RECORD_CANONICAL_JSON_SHA256_V1');assert.equal(descriptor.identity.profile,'EXTERNAL_DEFI_BOOTSTRAP_RECOVERY_V1');assert.equal(descriptor.identity.genesis,runtime.metadata.evmGenesis);
 const saved=await readWrappedPrivateLifetimePartV1(runtime,SLOT,descriptor.identity),r=saved.privateState;
 assertCanonicalExternalBootstrapSectionV2({descriptor,state:r,partVersion:saved.version,registryCheckpoint:descriptor.legacyBinding===null?null:await wrappedPrivateLifetimeRuntimeCheckpointV1(runtime)});
 exactRecord(r,['schema','system','protocols','routers','head','inventory','operatorReceipt']);assert.equal(r.schema,'EXTERNAL_DEFI_BOOTSTRAP_STATE_V1');assert.equal(r.routers.length,2);assert.ok(r.operatorReceipt);
 assert.deepEqual(await runtime.block(),r.head);let operatorGroup=null;
 try{
  const protocols=await reopenOfficialProtocolFixtureRecoveryV1(part({runtime,record:r.protocols},'protocols'));
  const system=await reopenOwnedFlatSystemRecoveryV1(part({runtime,record:r.system},'system'));assert.equal(system.hub.address,descriptor.identity.hub);
  const routers=[];for(const record of r.routers)routers.push(await reopenOwnedPrivateExternalRouterRecoveryV1(part({runtime,record,system,protocols},'router')));
  operatorGroup=await reopenRetainedLocalFlatOperatorGroupV1({runtime,expected:r.operatorReceipt,bindings:[null,null,null,null]});
  const s={runtime,system,protocols,routers,operatorGroup,identity:descriptor.identity,handle:saved.handle,record:r,closed:false,sealed:false};assertActors(s);assert.deepEqual(inventory(s),r.inventory,'ORIGINAL_REOPENED_ACTOR_INVENTORY');
  await runtime.assertCanonical(r.head);assert.deepEqual(await runtime.block(),r.head);return issue(s);
 }catch(error){if(operatorGroup)await Promise.allSettled(operatorGroup.operators.map(o=>o.close()));throw error;}
}

/** Separate finite system section for an EXIT-only catalogue continuation.
 * Uses the full original system producer/consumer, never protocol/GRAPH actors.
 * Original runtime and owner processes remain their own ordered sections. */
export async function retainExternalDefiVaultExitSystemForReopenV1(input){
 assert.equal(arguments.length,1);exactRecord(input,['runtime','system','attemptAuthority']);const {runtime,system,attemptAuthority}=input;assertSameAttempt(runtime,attemptAuthority);assertOwnedFlatSystem(runtime,system);
 const head=await runtime.block(),record=await captureOwnedFlatSystemRecoveryV1(runtime,system);assert.deepEqual(record.head,head);await runtime.assertCanonical(head);assert.deepEqual(await runtime.block(),head);
 const id={profile:'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_LIFETIME_V1',genesis:runtime.metadata.evmGenesis,hub:system.hub.address};
 const state={schema:'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_STATE_V1',system:record};const handle=await retainWrappedPrivateLifetimePartV1(runtime,SLOT,id,state);assertWrappedPrivateLifetimePartSealedV1(handle);
 await retainOriginalWrappedRecoverySectionV1(attemptAuthority,'system',{schema:'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_SECTION_V1',identity:id,stateSHA256:sha(state),graphRecoveryEstablished:false});
 return {retained:true,originalResourcesStopped:true};
}
export async function reopenExternalDefiVaultExitSystemFromAuthorityV1(input){
 assert.equal(arguments.length,1);exactRecord(input,['runtime','attemptAuthority']);const {runtime,attemptAuthority}=input;await assertOwnedLocalEvmV2(runtime);assertSameAttempt(runtime,attemptAuthority);
 const d=consumeOriginalWrappedRecoverySectionV1(attemptAuthority,'system');exactRecord(d,['schema','identity','stateSHA256','graphRecoveryEstablished']);assert.equal(d.schema,'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_SECTION_V1');assert.equal(d.graphRecoveryEstablished,false);assert.equal(d.identity.profile,'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_LIFETIME_V1');assert.equal(d.identity.genesis,runtime.metadata.evmGenesis);
 const saved=await readWrappedPrivateLifetimePartV1(runtime,SLOT,d.identity),state=saved.privateState;exactRecord(state,['schema','system']);assert.equal(state.schema,'EXTERNAL_DEFI_VAULT_EXIT_SYSTEM_STATE_V1');assert.equal(sha(state),d.stateSHA256);assertWrappedPrivateLifetimePartSealedV1(saved.handle);
 const system=await reopenOwnedFlatSystemRecoveryV1(part({runtime,record:state.system},'system'));assertOwnedFlatSystem(runtime,system);assert.equal(system.hub.address,d.identity.hub);assert.deepEqual(await runtime.block(),state.system.head);await runtime.assertCanonical(state.system.head);
 return Object.freeze({runtime,system,graphRecoveryEstablished:false,close:async()=>({closed:true})});
}

/** Distinct original DeviceExternalFlat token, same full System opener. */
export async function reopenOriginalDeviceExternalFlatSystemRecordV1(token){
 assert.equal(arguments.length,1);const module=await import('../../accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs');const {runtime,record}=module.consumeOriginalDeviceExternalFlatSystemReopenV1(token);
 const system=await reopenOwnedFlatSystemRecoveryV1(part({runtime,record},'system'));assertOwnedFlatSystem(runtime,system);return system;
}

export async function reopenOriginalDeviceExternalFlatGraphSystemRecordV1(token){
 assert.equal(arguments.length,1);const module=await import('../../accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs');const {runtime,record,graph}=module.consumeOriginalDeviceExternalFlatSystemReopenV1(token);assert.ok(graph,'DEVICE_EXTERNAL_GRAPH_ORIGINAL_SYSTEM_TOKEN');
 const protocols=await reopenOfficialProtocolFixtureRecoveryV1(part({runtime,record:graph.protocols},'protocols')),system=await reopenOwnedFlatSystemRecoveryV1(part({runtime,record},'system'));assertOwnedFlatSystem(runtime,system);
 if(graph.schema==='DEVICE_MORPHO_BLUE_GRAPH_SYSTEM_PRIVATE_V1'){
  const {reopenOwnedOriginalMorphoBluePositionV1}=await import('../deployments/defi/deploy-morpho-blue-position-v1.mjs');
  const position=await reopenOwnedOriginalMorphoBluePositionV1(part({runtime,protocols,record:graph.position},'blue-position'));
  const {reopenOwnedPrivateMorphoBluePositionRouterV1}=await import('../deployments/defi/deploy-private-external-router-v1.mjs');
  const router=await reopenOwnedPrivateMorphoBluePositionRouterV1(part({runtime,record:graph.router,system,protocols,position},'blue-router'));assertOwnedPrivateExternalRouterV1(router,{runtime,system,poolIndex:1});assert.equal(router.protocolKind,'MORPHO_BLUE_V1_EXACT_SHARE_SUPPLY');
  const {createOwnedMorphoBluePositionGraphDeliveryObserverV1}=await import('../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs');const deliveryObserver=await createOwnedMorphoBluePositionGraphDeliveryObserverV1({runtime,system,poolIndex:1,router,position});return Object.freeze({system,protocols,router,position,deliveryObserver});
 }
 assert.equal(graph.schema,'DEVICE_EXTERNAL_FLAT_GRAPH_SYSTEM_PRIVATE_V1');
 const router=await reopenOwnedPrivateExternalRouterRecoveryV1(part({runtime,record:graph.router,system,protocols},'router'));assertOwnedPrivateExternalRouterV1(router,{runtime,system,poolIndex:1});assert.equal(router.protocolKind,'METAMORPHO_V1_EXACT_SHARE_MINT');const {createOwnedMetaMorphoGraphDeliveryObserverV1}=await import('../../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs');const deliveryObserver=await createOwnedMetaMorphoGraphDeliveryObserverV1({runtime,system,poolIndex:1,router,protocolFixture:protocols});return Object.freeze({system,protocols,router,deliveryObserver});
}
