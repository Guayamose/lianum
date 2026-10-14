/** Fixed local PagedV3 producer. It loads actual retained compiler outputs;
 * addresses/code hashes are derived before deployment. No proof acceptance,
 * public-chain safety, mobile identity, or compiler readiness is inferred. */
import assert from 'node:assert/strict';
import {buildPagedDepositCatalogueBackendV1} from './paged-deposit-catalogue-backend-v1.mjs';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {types} from 'node:util';
import {assertLocalEvm} from '../../chains/evm/runtime/local-evm-ownership.mjs';
import * as originalQuotaOwner from '../../chains/evm/runtime/local-evm-ownership.mjs';
function chargeOriginalPoolCreationV1(...args){return originalQuotaOwner.chargeOriginalPoolCreationV1(...args);}
function consumeOriginalPoolCreationTicketV1(...args){return originalQuotaOwner.consumeOriginalPoolCreationTicketV1(...args);}
function reconcileOriginalPoolCreationV1(...args){return originalQuotaOwner.reconcileOriginalPoolCreationV1(...args);}
function assertOriginalPoolCreationQuotaV1(...args){return originalQuotaOwner.assertOriginalPoolCreationQuotaV1(...args);}
function createOriginalPoolCreationQuotaV1(...args){return originalQuotaOwner.createOriginalPoolCreationQuotaV1(...args);}
function openOriginalPoolCreationQuotaV1(...args){return originalQuotaOwner.openOriginalPoolCreationQuotaV1(...args);}
import {GENERIC_COMPILER_PIN,deriveGenericVerifierImmutables} from '@lianum/engine/execution/local/local-deployment';
import {deriveNativeRuntimeCode,predictNativeCreateAddress,deriveNativeHubDomain,nativeStaticArguments,nativeProofCalldata} from '../../execution/native/dispatch/native-deployment.mjs';
import {linkPrivateBytecode,derivePrivateAssetIdentity,derivePrivateAssetPoolScope} from '@lianum/engine/notes/private-asset-runtime';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {NATIVE_QUORUM_PROFILE,normalizeNativeQuorumRegistry,nativeQuorumRegistryCommitment} from '@lianum/engine/evidence/native-quorum';
import {pagedGraphHashV3} from '@lianum/engine/execution/graph/funded-graph-paged-v3';
import {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,PAEG_PAGED_SPARSE_ENCODING_V3,PAEG_PAGED_WORDS_V3,loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import {loadFlatVerifierArtifacts} from '../deployments/system/deployment-artifacts.mjs';
import {readPagedSourceLedgerV3} from './paged-source-ledger-v3.mjs';
const owned=new WeakMap(),active=new WeakSet();
import {ZERO,NATIVE,MODES,names,sha,hex,bare,keccak,digest,address,word,exact,freeze,regular,immutableNames,constructorArgs,canonicalType,staticData,pinnedCompilation,buildPagedDeploymentKernelDataV4,normalizePagedDeploymentConfigurationDataV4} from './funded-graph-paged-kernel-data-v4.mjs';
import {isOriginalFundedPagedGraphSepoliaWalletV4,assertOriginalFundedPagedGraphSepoliaWalletV4,readOriginalFundedPagedGraphSepoliaDeploymentV4,closeOriginalFundedPagedGraphSepoliaDeploymentV4} from './funded-graph-paged-public-kernel-v4.mjs';
/** Pure pre-birth gate. This loads/pins actual five-role artifacts and compiled
 * consumers; it grants no runtime, wallet, proof result or accepted facts. */
export function assertFundedPagedLocalDeploymentArtifactsV3(manifestSHA256,consumerSHA256){assert.equal(arguments.length,2,'PAGED_DEPLOY_ARITY');const c=pinnedCompilation(manifestSHA256,consumerSHA256);return Object.freeze({profile:c.manifest.profile,manifestSHA256,consumerSHA256,sparseTreeEncoding:PAEG_PAGED_SPARSE_ENCODING_V3});}
/** runtime is the original fresh local capability, not an endpoint or DTO.
 * Configuration is public deployment input only and supplies no accepted fact. */
export async function deployOriginalFundedPagedGraphWalletV3(runtime,input){
 assert.equal(arguments.length,2,'PAGED_DEPLOY_ARITY');return deployOriginalPagedSystem(runtime,input,null,null);
}
/** Explicit operator-owned continuation. Old systems keep their original brands
 * and descriptors. One charged creation makes a fresh pool/state/native triple;
 * authentic existing verifier and library code is reused, never redeployed. */
export async function appendOriginalFundedPagedGraphWalletV3(runtime,predecessor,input,quota,principal){
 assert.equal(arguments.length,5,'PAGED_DEPLOY_ARITY');assertOriginalFundedPagedGraphWalletV3(runtime,predecessor);assertOriginalPoolCreationQuotaV1(runtime,quota);const prior=owned.get(predecessor);assert.ok(!prior.successorPending&&!prior.successor,'PAGED_DEPLOY_SUCCESSOR_FENCED');
 exact(input,['manifestSHA256','consumerSHA256','deploymentDomain','policy','registryEpoch','rulesRoot','attesterKeys','minimumDepositAtomic']);for(const key of ['manifestSHA256','consumerSHA256','policy','registryEpoch','rulesRoot','attesterKeys'])assert.deepEqual(input[key],prior.configuration[key],'PAGED_DEPLOY_SUCCESSOR_CONFIGURATION');assert.notEqual(input.deploymentDomain,prior.configuration.deploymentDomain,'PAGED_DEPLOY_SUCCESSOR_DOMAIN_REUSE');assert.ok(/^[1-9][0-9]*$/.test(input.minimumDepositAtomic)&&BigInt(input.minimumDepositAtomic)>=BigInt(prior.configuration.minimumDepositAtomic),'PAGED_DEPLOY_SUCCESSOR_MINIMUM_DOWNGRADE');
 prior.successorPending=true;try{const next=await deployOriginalPagedSystem(runtime,input,prior,{quota,principal});prior.successor=next;return next;}catch(error){throw new Error('PAGED_DEPLOY_SUCCESSOR_FAILED',{cause:error});}
}
const originalLocalKernel=buildPagedDeploymentKernelDataV4(Object.freeze({chargeOriginalPoolCreationV1:(...args)=>chargeOriginalPoolCreationV1(...args),consumeOriginalPoolCreationTicketV1:(...args)=>consumeOriginalPoolCreationTicketV1(...args),reconcileOriginalPoolCreationV1:(...args)=>reconcileOriginalPoolCreationV1(...args),assertOriginalSystem:(...args)=>assertOriginalFundedPagedGraphWalletV3(...args)}));
async function deployOriginalPagedSystem(runtime,input,prior,admission){const configuration=normalizePagedDeploymentConfigurationDataV4(input);await assertLocalEvm(runtime);assert.ok(prior?active.has(runtime):!active.has(runtime),'PAGED_DEPLOY_ALREADY_INSTALLED');if(!prior)active.add(runtime);const context=await originalLocalKernel.deploy(runtime,configuration,prior,admission);owned.set(context.system,context);return context.system;}
/** Private authenticated capture, not a public deployment-capability DTO. */
export function retainOriginalFundedPagedGraphDeploymentV3(runtime,system){assert.equal(arguments.length,2);assertOriginalFundedPagedGraphWalletV3(runtime,system);const original=owned.get(system);return{profile:'ORIGINAL_PAGED_DEPLOYMENT_RETENTION_V3',system:structuredClone(system),configuration:structuredClone(original.configuration)};}
/** Reopens only the exact stopped original hub restored by its private issuer.
 * No deployment, mint, acceptance or substituted contract is performed. */
export async function reopenOriginalFundedPagedGraphWalletV3(runtime,token){
 assert.equal(arguments.length,2);await assertLocalEvm(runtime);assert.equal(runtime.metadata.restoredOriginalState,true,'PAGED_DEPLOY_REOPEN_ORIGINAL_LEDGER');assert.ok(!active.has(runtime),'PAGED_DEPLOY_ALREADY_INSTALLED');
 const {consumeOriginalPagedComponentRecoveryV3}=await import('../recovery/paged-runtime-recovery-authority-v3.mjs');return reopenOriginalPagedSystem(runtime,consumeOriginalPagedComponentRecoveryV3(token,'deployment'));
}
/** Original supervisor token owns the whole stopped catalogue. Public snapshots
 * or individual descriptor copies cannot open additional systems. */
export async function reopenOriginalFundedPagedGraphWalletCollectionV1(runtime,token){
 assert.equal(arguments.length,2);await assertLocalEvm(runtime);assert.equal(runtime.metadata.restoredOriginalState,true,'PAGED_DEPLOY_REOPEN_ORIGINAL_LEDGER');assert.ok(!active.has(runtime),'PAGED_DEPLOY_ALREADY_INSTALLED');const {consumeOriginalPagedComponentRecoveryV3}=await import('../recovery/paged-runtime-recovery-authority-v3.mjs'),saved=consumeOriginalPagedComponentRecoveryV3(token,'deployment');exact(saved,['profile','principal','systems']);assert.equal(saved.profile,'ORIGINAL_PAGED_DEPOSIT_CATALOGUE_RETENTION_V1');assert.match(saved.principal,/^[0-9a-f]{64}$/);assert.ok(Array.isArray(saved.systems)&&saved.systems.length>0&&saved.systems.length<=257,'PAGED_DEPLOY_CATALOGUE_BOUND');assert.equal(new Set(saved.systems.map(s=>s.system.pool)).size,saved.systems.length,'PAGED_DEPLOY_CATALOGUE_DUPLICATE');const systems=[];for(const record of saved.systems)systems.push(await reopenOriginalPagedSystem(runtime,record));for(let i=1;i<systems.length;i++){const prior=owned.get(systems[i-1]);prior.successorPending=true;prior.successor=systems[i];}return Object.freeze({principal:saved.principal,systems:Object.freeze(systems)});
}
async function reopenOriginalPagedSystem(runtime,saved){
 exact(saved,['profile','system','configuration']);assert.equal(saved.profile,'ORIGINAL_PAGED_DEPLOYMENT_RETENTION_V3');
 const config=saved.configuration;exact(config,['manifestSHA256','consumerSHA256','deploymentDomain','policy','registryEpoch','rulesRoot','attesterKeys','minimumDepositAtomic']);const compiled=pinnedCompilation(config.manifestSHA256,config.consumerSHA256),retained=await loadFlatVerifierArtifacts();
 const data=saved.system;assert.equal(data.securityGeneration,compiled.manifest.securityGeneration);assert.equal(data.minimumDepositAtomic,config.minimumDepositAtomic);assert.equal(data.profile,compiled.manifest.profile);assert.equal(data.manifestSHA256,config.manifestSHA256);assert.equal(data.consumerSHA256,config.consumerSHA256);assert.ok(Array.isArray(data.deployments)&&data.deployments.length>3&&data.deployments.length<128);
 const entries=Object.fromEntries(Object.entries(names).map(([kind,[source,name]])=>{const artifact=compiled.consumer.contracts[source]?.[name];assert.ok(artifact,'PAGED_DEPLOY_ARTIFACT');return[kind,{source,name,artifact,names:immutableNames(compiled.consumer.sourceASTs[source])}];}));
 const records={};for(const kind of ['pool','state','native']){const matches=data.deployments.filter(row=>row.address===data[kind]&&row.source===entries[kind].source&&row.name===entries[kind].name);assert.equal(matches.length,1,'PAGED_DEPLOY_REOPEN_CONTRACT');records[kind]=matches[0];}
 const head=await runtime.block();await runtime.assertCanonical(head);const sender=address(runtime.accounts[0]),addresses=new Set();
 for(const row of data.deployments){address(row.address);assert.ok(!addresses.has(row.address),'PAGED_DEPLOY_REOPEN_DUPLICATE');addresses.add(row.address);assert.equal(predictNativeCreateAddress(sender,BigInt(row.nonce)),row.address,'PAGED_DEPLOY_REOPEN_CREATOR');assert.equal(row.receipt.contractAddress.toLowerCase(),row.address);await runtime.checkReceipt(row.receipt);await runtime.assertCanonical(row.receipt);assert.equal(await runtime.code(row.address,head.number),row.expectedCode,'PAGED_DEPLOY_REOPEN_CODE');assert.equal(await runtime.keccak(row.expectedCode),row.codeHash,'PAGED_DEPLOY_REOPEN_CODE_HASH');}
 const hubDomain=deriveNativeHubDomain(runtime.metadata.chainId,data.native,config.deploymentDomain),registry=normalizeNativeQuorumRegistry({profile:NATIVE_QUORUM_PROFILE,hubDomain:bare(hubDomain),registryEpoch:config.registryEpoch,rulesRoot:bare(config.rulesRoot),keys:config.attesterKeys});assert.deepEqual(data.registry,registry);assert.equal(data.hubDomain,bare(hubDomain));assert.equal(data.registryCommitment,nativeQuorumRegistryCommitment(registry));
 const assetIdentity=derivePrivateAssetIdentity(runtime.metadata.chainId,NATIVE,ZERO),scope=derivePrivateAssetPoolScope(runtime.metadata.chainId,data.pool,config.deploymentDomain,assetIdentity);assert.equal(data.assetIdentity,bare(assetIdentity));assert.equal(data.scope,bare(scope));assert.equal(data.policy,bare(config.policy));assert.equal(data.domain,pagedGraphHashV3('domain',[scope,config.policy,assetIdentity,hubDomain,hex(data.registryCommitment)].map(v=>Buffer.from(bare(v),'hex'))));
 const ownPins={},ownArtifacts={};for(const mode of MODES){const source='verifiers/'+mode+'.sol',artifact=compiled.verifiers.contracts[source]?.HonkVerifier,matches=data.deployments.filter(row=>row.source===source&&row.name==='HonkVerifier');assert.ok(artifact);assert.equal(matches.length,1,'PAGED_DEPLOY_REOPEN_VERIFIER');ownArtifacts[mode]=artifact;ownPins[mode]={verifier:matches[0].address,codeHash:matches[0].codeHash};}
 const system=freeze(structuredClone(data)),{pool,state,native}=records,call=(kind,signature,args=[],block='latest')=>runtime.call({to:records[kind].address,data:staticData(entries[kind].artifact,signature,args)},block);
 for(const [kind,values]of [['pool',{minimumDepositAmount:config.minimumDepositAtomic,scope:hex(system.scope),policy:hex(system.policy),assetIdentity:hex(system.assetIdentity),domainCommitment:hex(system.domain),graphState:system.state,graphStateCodeHash:state.codeHash,artifactManifest:hex(system.manifestSHA256)}],['state',{pool:system.pool,poolCodeHash:pool.codeHash,domain:hex(system.domain),nativeState:system.native,nativeStateCodeHash:native.codeHash,artifactManifest:hex(system.manifestSHA256)}],['native',{graphState:system.state,graphStateCodeHash:state.codeHash,domain:hex(system.domain),hubDomain:hex(system.hubDomain),registryCommitment:hex(system.registryCommitment),artifactManifest:hex(system.manifestSHA256)}]])for(const [key,value]of Object.entries(values))assert.equal((await call(kind,key+'()',[],head.number)).toLowerCase(),hex(word(value)),'PAGED_DEPLOY_REOPEN_GETTER_'+key);
 await runtime.assertCanonical(head);assert.equal((await runtime.block()).hash,head.hash,'PAGED_DEPLOY_REOPEN_HEAD_CHANGED');const ledgerLeaves=block=>{assertOriginalFundedPagedGraphWalletV3(runtime,system);return readPagedSourceLedgerV3(runtime,pool.address,call,block);};
 const libraries=new Map(),originalPins={};for(const row of data.deployments){if(compiled.consumer.contracts[row.source]?.[row.name])libraries.set(row.source+':'+row.name,row);if(compiled.verifiers.contracts[row.source]?.[row.name])libraries.set('paged:'+row.source+':'+row.name,row);}
 for(const [role,entry]of Object.entries(retained.verifiers)){const matches=data.deployments.filter(row=>row.source===entry.source&&row.name==='HonkVerifier');assert.equal(matches.length,1,'PAGED_DEPLOY_REOPEN_ORIGINAL_VERIFIER');originalPins[role]={verifier:matches[0].address,codeHash:matches[0].codeHash};for(const row of data.deployments)if(row.source===entry.source&&entry.contracts[row.name])libraries.set('original:'+row.source+':'+row.name,row);}
 active.add(runtime);owned.set(system,{runtime,system,entries,call,ledgerLeaves,ownArtifacts,ownPins,originalPins,libraries,pool,state,native,configuration:structuredClone(config),manifestSHA256:config.manifestSHA256,closed:false,successorPending:false,successor:null});return system;
}
export function assertOriginalFundedPagedGraphWalletV3(runtime,system){assert.equal(arguments.length,2,'PAGED_DEPLOY_ARITY');const s=owned.get(system);if(s){assert.ok(s.runtime===runtime&&!s.closed,'PAGED_DEPLOY_ORIGINAL_SYSTEM');return system;}return assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,system);}
export function readOriginalFundedPagedGraphDeploymentV3(runtime,system){assert.equal(arguments.length,2,'PAGED_DEPLOY_ARITY');assertOriginalFundedPagedGraphWalletV3(runtime,system);return owned.get(system)??readOriginalFundedPagedGraphSepoliaDeploymentV4(runtime,system);}
export function closeOriginalFundedPagedGraphDeploymentV3(runtime,system){assert.equal(arguments.length,2,'PAGED_DEPLOY_ARITY');assertOriginalFundedPagedGraphWalletV3(runtime,system);const local=owned.get(system);if(local)local.closed=true;else closeOriginalFundedPagedGraphSepoliaDeploymentV4(runtime,system);}
export const pagedGraphStaticDataV3=staticData;
export function pagedGraphProofDataV3(artifact,name,proof,publicInputs,health){assert.ok(arguments.length===4||arguments.length===5,'PAGED_DEPLOY_ARITY');assert.ok(['depositBalance','reserve','fold','admit','fulfill','withdraw'].includes(name),'PAGED_DEPLOY_PROOF_METHOD');const entries=artifact.abi.filter(e=>e.type==='function'&&e.name===name);assert.equal(entries.length,1,'PAGED_DEPLOY_PROOF_METHOD');const signature=name+'('+entries[0].inputs.map(canonicalType).join(',')+')';return nativeProofCalldata(artifact,signature,proof,publicInputs,health);}

// Operator admission shares this same deployment owner; these remain the
// canonical quota closures rather than another mechanical instance.
export {createOriginalPoolCreationQuotaV1,openOriginalPoolCreationQuotaV1};

const originalPagedCatalogues=buildPagedDepositCatalogueBackendV1({assertLocalEvm:(...args)=>assertLocalEvm(...args),assertOriginalPoolCreationQuotaV1:(...args)=>assertOriginalPoolCreationQuotaV1(...args),assertOriginalFundedPagedGraphWalletV3:(...args)=>assertOriginalFundedPagedGraphWalletV3(...args),readOriginalFundedPagedGraphDeploymentV3:(...args)=>readOriginalFundedPagedGraphDeploymentV3(...args),appendOriginalFundedPagedGraphWalletV3:(...args)=>appendOriginalFundedPagedGraphWalletV3(...args),retainOriginalFundedPagedGraphDeploymentV3:(...args)=>retainOriginalFundedPagedGraphDeploymentV3(...args),reopenOriginalFundedPagedGraphWalletCollectionV1:(...args)=>reopenOriginalFundedPagedGraphWalletCollectionV1(...args)});
export function readOriginalPagedDepositCapacityV1(...args){return originalPagedCatalogues.readOriginalPagedDepositCapacityV1(...args);}
export function createOriginalPagedDepositCatalogueV1(...args){return originalPagedCatalogues.createOriginalPagedDepositCatalogueV1(...args);}
export function reopenOriginalPagedDepositCatalogueV1(...args){return originalPagedCatalogues.reopenOriginalPagedDepositCatalogueV1(...args);}
export function assertOriginalPagedDepositCatalogueV1(...args){return originalPagedCatalogues.assertOriginalPagedDepositCatalogueV1(...args);}
