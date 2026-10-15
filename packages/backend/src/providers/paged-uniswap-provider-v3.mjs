/** Original LOCAL Uniswap exact-output context for a Paged receipt. The ERC20
 * output remains in its original D27 pool; it is never a Paged payout asset. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {nativeCustodyCommitment} from '@lianum/engine/native/native-receipt-binding';
import {nativeAdmissionRulesTree,nativeAdmissionRuleCommitment,nativeAdmissionChainDomain} from '@lianum/engine/execution/native/dispatch/native-admission';
import {normalizeExternalFlatDescriptorV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeDevicePagedUniswapIntentV3} from '@lianum/mobile-protocol/device/paged-graph-v3';
import {createOwnedDeviceExternalFlatReceiverV1,assertOwnedDeviceExternalFlatReceiverV1,armOriginalPagedUniswapRuntimeRetentionV3,captureOriginalPagedUniswapRuntimeV3,reopenOriginalPagedUniswapRuntimeV3,reopenOriginalPagedUniswapBootstrapV3} from '../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createOriginalUniswapFixtureV3,assertOfficialProtocolFixture,captureOriginalUniswapFixtureRecoveryV3} from '../operations/deployments/defi/official-protocol-fixture-v3.mjs';
import {createOwnedPoolAsset} from '../chains/shared/contracts/owned-pool-asset.mjs';
import {evmRuntimeCodeHash} from '../chains/evm/contracts/evm-code-hash.mjs';
import {deployFlatSystem,assertOwnedFlatSystem,captureOwnedFlatSystemRecoveryV1} from '../operations/deployments/system/deploy-system.mjs';
import {createOwnedPrivateExternalRouterV1,assertOwnedPrivateExternalRouterV1,captureOwnedPrivateExternalRouterRecoveryV1} from '../operations/deployments/defi/deploy-private-external-router-v1.mjs';
import {createOwnedUniswapGraphDeliveryObserverV1,assertOwnedUniswapGraphDeliveryObserverV1,prepareOwnedUniswapGraphDescriptorV1,assertOwnedUniswapGraphDeliveryFactsV1,readOriginalEvmGraphDeliveryEconomicFactsV1} from '../chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';
import {createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3,assertOriginalDeviceExternalFlatShareNoteAuthorityV1,readOriginalDeviceExternalFlatD27PreparationV3,readOriginalDeviceExternalFlatD27HandoffV4,consumeOriginalDeviceExternalFlatShareProofV1,bindOriginalDeviceExternalFlatShareGraphV1,retainOriginalPagedUniswapShareAuthorityV3,captureOriginalPagedUniswapShareAuthorityV3,reopenOriginalPagedUniswapShareAuthorityV3} from '../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {evmFundingEndpointCommitment} from '../chains/evm/dispatch/evm-facts-binding.mjs';
import {evmGraphDeliveryDescriptorCommitmentV1,encodeEvmGraphDeliveryCallV1,evmGraphDeliveryTermsV1} from '../chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import {validateEvmDeliveryWire} from '../chains/evm/dispatch/evm-facts-binding.mjs';
const owned=new WeakMap(),fresh=()=>randomBytes(32).toString('hex'),bare=x=>x.slice(2),sha=x=>createHash('sha256').update(x).digest('hex'),clone=structuredClone;
function exact(value,keys){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function original(context){const s=owned.get(context);assert.ok(s&&!s.closed&&!s.closing&&!s.poisoned,'PAGED_UNISWAP_ORIGINAL_CONTEXT');assertOwnedDeviceExternalFlatReceiverV1(s.runtime);assertOwnedFlatSystem(s.runtime,s.system);assertOfficialProtocolFixture(s.runtime,s.protocols);assertOwnedPrivateExternalRouterV1(s.router,{runtime:s.runtime,system:s.system,poolIndex:1});assertOwnedUniswapGraphDeliveryObserverV1(s.observer,{runtime:s.runtime,system:s.system,poolIndex:1});assertOriginalDeviceExternalFlatShareNoteAuthorityV1(s.account,{runtime:s.runtime,system:s.system,poolIndex:1,deliveryObserver:s.observer});return s;}
async function healthy(s){assert.deepEqual(await s.vault.read(s.password),s.record,'PAGED_UNISWAP_CHECKPOINT_CHANGED');await s.runtime.health();}
async function save(s,data){await healthy(s);try{const next=await s.vault.update(s.password,s.record.revision,old=>{assert.deepEqual(old,s.record.data);return clone(data);});assert.deepEqual(await s.vault.read(s.password),next);s.record=next;}catch(error){s.poisoned=true;throw error;}}
function exposeContext(s){
 const {runtime,account,rule}=s,descriptor=normalizeExternalFlatDescriptorV1(s.record.data.targetDescriptor);const context=Object.freeze({profile:'ORIGINAL_PAGED_UNISWAP_CONTEXT_V3',classification:'LOCAL_SYNTHETIC_ORIGINAL_UNISWAP_NOT_PUBLIC_CONSENSUS',rule:freeze(clone(rule)),targetDescriptor:freeze(clone(descriptor)),template:freeze({maximumInput:'200',outputAmount:'100',recipient:runtime.accounts[1].slice(2),inputAsset:{asset:s.system.pools[0].asset.slice(2),assetIdentity:s.system.pools[0].assetIdentity.slice(2),symbol:s.system.pools[0].assetMetadata.symbol,decimals:s.system.pools[0].assetMetadata.decimals}}),configuration:freeze({family:'EVM',label:'Uniswap exact-output local',chainDomain:nativeAdmissionChainDomain(rule),evidencePolicy:nativeAdmissionRuleCommitment(rule),assetSymbol:descriptor.assetMetadata.symbol,decimals:descriptor.assetMetadata.decimals,destinations:[]}),close(){if(s.closing)return s.closing;s.closing=(async()=>{await s.work?.catch(()=>{});let first;try{await account.close();}catch(error){first=error;}try{await runtime.close();}catch(error){first??=error;}s.closed=true;s.password=null;if(first)throw Error('PAGED_UNISWAP_CLOSE_UNCONFIRMED');return{closed:true,originalUniswapResourcesStopped:true};})();return s.closing;}});
  owned.set(context,s);original(context);return context;
}
/** Fixed original birth. Neither keys, factories, RPC nor a runtime are options. */
export async function createOriginalPagedUniswapContextV3(input){
 assert.equal(arguments.length,1);exact(input,['origin','devicePublicKey']);const config=clone(input);let runtime,account;
 try{
  runtime=await createOwnedDeviceExternalFlatReceiverV1();const protocols=await createOriginalUniswapFixtureV3(runtime),assets=[];
  for(const contract of [protocols.first,protocols.second])assets.push(await createOwnedPoolAsset({runtime,deployment:{address:contract.address,transactionHash:contract.receipt.transactionHash,expectedCode:contract.code,codeHash:evmRuntimeCodeHash(contract.code)},symbol:(await protocols.read(contract,'symbol'))[0],decimals:Number((await protocols.read(contract,'decimals'))[0]),kind:'ERC20'}));
  const outputIdentity=bare(derivePrivateAssetIdentity(runtime.metadata.chainId,protocols.second.address,evmRuntimeCodeHash(protocols.second.code))),rule={family:'3',genesis:bare(runtime.metadata.evmGenesis),asset:outputIdentity,finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'},tree=nativeAdmissionRulesTree([rule]);
  const attesterKeys=Array.from({length:4},()=>{const key=freshKey();return{x:key.x.toString('hex'),y:key.y.toString('hex')};});
  const system=await deployFlatSystem(runtime,{deploymentDomain:'0x'+fresh(),registryEpoch:'1',rulesRoot:'0x'+tree.root,attesterKeys,pools:assets.map(assetCapability=>({assetCapability,policy:'0x'+fresh(),deploymentDomain:'0x'+fresh()}))});
  const router=await createOwnedPrivateExternalRouterV1({runtime,system,poolIndex:1,protocolFixture:protocols,protocolKind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE'}),observer=await createOwnedUniswapGraphDeliveryObserverV1({runtime,system,poolIndex:1,router,protocolFixture:protocols});
  account=await createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3({runtime,system,poolIndex:1,origin:config.origin,devicePublicKey:config.devicePublicKey,deliveryObserver:observer});
  const descriptor=assertOriginalDeviceExternalFlatShareNoteAuthorityV1(account,{runtime,system,poolIndex:1,deliveryObserver:observer}),vault=new Vault(join(runtime.metadata.scratchDirectory,'paged-uniswap-context.vault')),password=fresh();
  const record=await vault.create({schema:'ORIGINAL_PAGED_UNISWAP_CONTEXT_V3',identity:fresh(),rule:clone(rule),targetDescriptor:clone(descriptor),solverAllowance:null,preparation:null},password);assert.deepEqual(await vault.read(password),record);
  const s={runtime,protocols,system,router,observer,account,rule,assets,vault,password,record,closed:false,closing:false,poisoned:false,busy:false,work:null};
  await retainOriginalPagedUniswapShareAuthorityV3(account,{runtime,system,poolIndex:1,deliveryObserver:observer});
  s.retention=await armOriginalPagedUniswapRuntimeRetentionV3({runtime,system,router,observer,protocolFixture:protocols,targetAccount:account});
  return exposeContext(s);
 }catch(error){await account?.close().catch(()=>{});await runtime?.close().catch(()=>{});throw error;}
}
export function assertOriginalPagedUniswapContextV3(context){assert.equal(arguments.length,1);original(context);return context;}
/** Operator-only original handles. Public JSON cannot produce this context. */
export function readOriginalPagedUniswapContextV3(context){assert.equal(arguments.length,1);const s=original(context);return Object.freeze({runtime:s.runtime,system:s.system,router:s.router,observer:s.observer,protocolFixture:s.protocols,targetAccount:s.account,targetDescriptor:context.targetDescriptor,rule:context.rule});}
async function serial(context,work){const s=original(context);assert.ok(!s.busy,'PAGED_UNISWAP_BUSY');s.busy=true;s.work=(async()=>{try{await healthy(s);return await work(s);}finally{s.busy=false;s.work=null;}})();return s.work;}
/** Explicit LOCAL solver setup; never caller token/address selection. No
 * private source pool is funded and no swap or D27 arrival occurs here. */
export async function prepareOriginalPagedUniswapSolverV3(context,maximumInput){assert.equal(arguments.length,2);return serial(context,async s=>{assert.match(maximumInput,/^[1-9][0-9]{0,19}$/);if(s.record.data.solverAllowance!==null){assert.equal(s.record.data.solverAllowance,maximumInput);assert.equal((await s.protocols.read(s.protocols.first,'allowance',[s.system.sender,s.router.address]))[0],BigInt(maximumInput),'PAGED_UNISWAP_APPROVAL_UNKNOWN');return{prepared:true};}assert.equal(s.record.data.preparation,null);const head=await s.runtime.block(),allowance=(await s.protocols.read(s.protocols.first,'allowance',[s.system.sender,s.router.address]))[0];assert.equal(allowance,0n);await s.runtime.assertCanonical(head);await save(s,{...s.record.data,solverAllowance:maximumInput});await s.protocols.send(s.protocols.first,'approve',[s.router.address,BigInt(maximumInput)]);assert.equal((await s.protocols.read(s.protocols.first,'allowance',[s.system.sender,s.router.address]))[0],BigInt(maximumInput));return{prepared:true};});}
function exactOriginalUniswapSubject(subject,intent){assert.equal(subject.jobId,intent.depositJobId);assert.equal(subject.rootId,intent.rootId);if(Object.hasOwn(intent,'recipient'))assert.equal(subject.recipient,intent.recipient,'PAGED_UNISWAP_ORIGINAL_D27_RECIPIENT');for(const[key,value]of Object.entries({output:intent.outputCommitment,amount:intent.outputAmount,validFrom:intent.validFrom,validUntil:intent.validUntil}))assert.equal(subject.statement[key],value,'PAGED_UNISWAP_ORIGINAL_D27_BINDING');}
async function completeOriginalUniswapHandoff(s,intent){
 const pending=s.record.data.preparation;assert.ok(pending?.stage==='HANDOFF_UNKNOWN','PAGED_UNISWAP_HANDOFF_PENDING');assert.deepEqual(pending.intent,intent,'PAGED_UNISWAP_REUSED_INTENT');
 const subject=await readOriginalDeviceExternalFlatD27HandoffV4(s.account,{runtime:s.runtime,system:s.system,poolIndex:1,router:s.router,deliveryObserver:s.observer});exactOriginalUniswapSubject(subject,intent);const binding={runtime:s.runtime,system:s.system,poolIndex:1,deliveryObserver:s.observer};
 const proof=subject.stage==='PROVED'?await consumeOriginalDeviceExternalFlatShareProofV1(s.account,{...binding,shareAmount:intent.outputAmount,validFrom:intent.validFrom,validUntil:intent.validUntil}):subject.proof;assert.equal(sha(Buffer.from(proof.proof,'hex')),subject.proofSHA256);assert.deepEqual(proof.publicInputs,subject.proof.publicInputs);
 const descriptor=prepareOwnedUniswapGraphDescriptorV1({observer:s.observer,router:s.router,route:{maximumInput:intent.maximumInput,outputAmount:intent.outputAmount,validFrom:intent.validFrom,validUntil:intent.validUntil},ownerPublicInputs:[...proof.publicInputs]});
 const sourceCommitment=evmFundingEndpointCommitment({genesis:s.rule.genesis,asset:s.rule.asset,address:descriptor.plan.identity.solver}),destinationCommitment=evmGraphDeliveryDescriptorCommitmentV1(descriptor),custodyCommitment=nativeCustodyCommitment({family:s.rule.family,genesis:s.rule.genesis,asset:s.rule.asset,sourceCommitment,destinationCommitment});
 const delivery={intent:clone(intent),descriptor,proof:proof.proof,publicInputs:[...proof.publicInputs],sourceCommitment,destinationCommitment,custodyCommitment,amount:intent.outputAmount,rule:clone(s.rule)};
 // The exact public proof and descriptor persist before graph binding. They
 // remain non-dispatchable while HANDOFF_UNKNOWN and grant no new consent.
 if(pending.delivery===null)await save(s,{...s.record.data,preparation:{stage:'HANDOFF_UNKNOWN',intent:clone(intent),delivery:clone(delivery)}});else assert.deepEqual(pending.delivery,delivery,'PAGED_UNISWAP_ORIGINAL_HANDOFF_CHANGED');
 if(subject.graphDescriptor===null)await bindOriginalDeviceExternalFlatShareGraphV1(s.account,{runtime:s.runtime,system:s.system,router:s.router,deliveryObserver:s.observer,descriptor});else assert.deepEqual(subject.graphDescriptor,descriptor,'PAGED_UNISWAP_ORIGINAL_GRAPH_CHANGED');
 const confirmed=await readOriginalDeviceExternalFlatD27HandoffV4(s.account,{runtime:s.runtime,system:s.system,poolIndex:1,router:s.router,deliveryObserver:s.observer});exactOriginalUniswapSubject(confirmed,intent);assert.equal(confirmed.stage,'DELIVERY_UNKNOWN');assert.equal(confirmed.proofSHA256,subject.proofSHA256);assert.deepEqual(confirmed.graphDescriptor,descriptor,'PAGED_UNISWAP_ORIGINAL_GRAPH_READBACK');
 await save(s,{...s.record.data,preparation:{stage:'PREPARED',intent:clone(intent),delivery:clone(delivery)}});return freeze(clone(delivery));
}
export async function prepareOriginalPagedUniswapDeliveryV3(context,rawIntent){assert.equal(arguments.length,2);const intent=normalizeDevicePagedUniswapIntentV3(rawIntent);return serial(context,async s=>{
 if(s.record.data.preparation){assert.deepEqual(s.record.data.preparation.intent,intent,'PAGED_UNISWAP_REUSED_INTENT');if(s.record.data.preparation.stage==='PREPARED')return freeze(clone(s.record.data.preparation.delivery));assert.equal(s.record.data.preparation.stage,'HANDOFF_UNKNOWN','PAGED_UNISWAP_HANDOFF_UNKNOWN');return completeOriginalUniswapHandoff(s,intent);}
 assert.equal(s.record.data.solverAllowance,intent.maximumInput,'PAGED_UNISWAP_SOLVER_SETUP_REQUIRED');const subject=await readOriginalDeviceExternalFlatD27PreparationV3(s.account,{runtime:s.runtime,system:s.system,poolIndex:1,deliveryObserver:s.observer});exactOriginalUniswapSubject(subject,intent);
 await save(s,{...s.record.data,preparation:{stage:'HANDOFF_UNKNOWN',intent:clone(intent),delivery:null}});return completeOriginalUniswapHandoff(s,intent);
 });}
/** Reconcile the existing exact handoff. No caller terms, proof or descriptor
 * can replace its durable original intent. Dispatch still requires PREPARED. */
export async function recoverOriginalPagedUniswapPreparationV4(context){assert.equal(arguments.length,1);return serial(context,async s=>{const pending=s.record.data.preparation;assert.ok(pending,'PAGED_UNISWAP_PREPARATION_REQUIRED');if(pending.stage==='PREPARED')return freeze(clone(pending.delivery));assert.equal(pending.stage,'HANDOFF_UNKNOWN');return completeOriginalUniswapHandoff(s,pending.intent);});}
export async function readOriginalPagedUniswapPreparedDeliveryV3(context,rawIntent){assert.equal(arguments.length,2);const s=original(context),intent=normalizeDevicePagedUniswapIntentV3(rawIntent);await healthy(s);const p=s.record.data.preparation;assert.ok(p?.stage==='PREPARED','PAGED_UNISWAP_PREPARATION_REQUIRED');assert.deepEqual(p.intent,intent,'PAGED_UNISWAP_REUSED_INTENT');return freeze(clone(p.delivery));}
/** Only the original reader can turn a confirmed swap and D27 arrival into
 * facts. Unknown/adverse delivery remains non-admissible; no receipt fallback. */
export async function observeOriginalPagedUniswapDeliveryV3(context,input){assert.equal(arguments.length,2);exact(input,['intent','receiptKeyCommitment','nativeId']);const s=original(context),delivery=await readOriginalPagedUniswapPreparedDeliveryV3(context,input.intent),nativeId=input.nativeId;assert.match(nativeId,/^0x[0-9a-f]{64}$/);const intent={descriptor:delivery.descriptor,receiptKeyCommitment:input.receiptKeyCommitment,proof:delivery.proof};
 // The exact receipt key belongs to the Paged action, not the economic intent.
 assert.match(intent.receiptKeyCommitment,/^[0-9a-f]{64}$/);const calldata=encodeEvmGraphDeliveryCallV1(intent),query={transactionHash:bare(nativeId),calldataSHA256:sha(Buffer.from(calldata.slice(2),'hex'))},facts=await s.observer.observeFacts(query);assertOwnedUniswapGraphDeliveryFactsV1(facts,{observer:s.observer});
 if(facts.status!=='observed')return freeze({status:facts.status==='adverse'?'ADVERSE':'UNKNOWN',nativeId});assert.deepEqual(facts.intent,intent);const decoded=validateEvmDeliveryWire(facts.nativeWire,intent);assert.equal(decoded.nativeId,bare(nativeId));assert.equal(facts.genesis,s.rule.genesis);assert.equal(facts.asset,s.rule.asset);assert.ok(BigInt(facts.confirmations)>=BigInt(s.rule.minimumConfirmations));return Object.freeze({status:'OBSERVED',facts,economics:readOriginalEvmGraphDeliveryEconomicFactsV1(facts,s.observer)});
}
export async function readOriginalPagedUniswapCheckpointV3(context){assert.equal(arguments.length,1);const s=original(context);assert.ok(!s.busy);await healthy(s);return freeze({profile:context.profile,identity:s.record.data.identity,revision:s.record.revision,dataSHA256:sha(canonical(s.record.data)),targetDescriptor:clone(context.targetDescriptor),rule:clone(s.rule)});}

/** Controlled original shutdown: every ledger, deployment and private journal
 * remains in the authenticated Mixed supervisor; no receipt is fabricated. */
export async function captureOriginalPagedUniswapContextV3(context){
 assert.equal(arguments.length,1);const s=original(context);assert.ok(!s.busy&&s.work===null,'PAGED_UNISWAP_CAPTURE_QUIESCENCE');s.busy=true;
 try{
  await healthy(s);const head=await s.runtime.block();
  const bootstrap={system:await captureOwnedFlatSystemRecoveryV1(s.runtime,s.system),protocols:await captureOriginalUniswapFixtureRecoveryV3(s.runtime,s.protocols),router:await captureOwnedPrivateExternalRouterRecoveryV1(s.router)};
  for(const actor of Object.values(bootstrap))assert.deepEqual(actor.head,head,'PAGED_UNISWAP_CAPTURE_HEAD_CHANGED');
  await s.runtime.assertCanonical(head);await healthy(s);
  const checkpoint={profile:context.profile,identity:s.record.data.identity,revision:s.record.revision,dataSHA256:sha(canonical(s.record.data)),targetDescriptor:clone(context.targetDescriptor),rule:clone(s.rule)};
  const account=await captureOriginalPagedUniswapShareAuthorityV3(s.account);assert.deepEqual(account.descriptor,context.targetDescriptor);
  const retained={profile:'ORIGINAL_PAGED_UNISWAP_CONTEXT_COLD_RETENTION_V3',genesis:s.runtime.metadata.evmGenesis,directory:s.runtime.metadata.scratchDirectory,runtimeAccounts:[...s.runtime.accounts],targetDescriptor:clone(context.targetDescriptor),checkpoint,bootstrap,account,context:{password:s.password,record:clone(s.record)},template:clone(context.template),configuration:clone(context.configuration)};
  const receiver=await captureOriginalPagedUniswapRuntimeV3(s.runtime,s.retention);s.closed=true;s.password=null;s.retention=null;
  return{context:retained,receiver};
 }catch(error){s.poisoned=true;s.password=null;await Promise.allSettled([s.account.close(),s.runtime.close()]);s.closed=true;throw error;}finally{s.busy=false;}
}
/** Both arguments are one-use original tokens from the same sealed supervisor. */
export async function reopenOriginalPagedUniswapContextV3(componentToken,runtimeToken){
 assert.equal(arguments.length,2);let runtime,account;
 try{
  runtime=await reopenOriginalPagedUniswapRuntimeV3(runtimeToken);
  const parts=await reopenOriginalPagedUniswapBootstrapV3(componentToken,runtime),r=parts.retained;
  account=await reopenOriginalPagedUniswapShareAuthorityV3(parts.accountToken);
  const descriptor=assertOriginalDeviceExternalFlatShareNoteAuthorityV1(account,{runtime,system:parts.system,poolIndex:1,deliveryObserver:parts.deliveryObserver});assert.deepEqual(descriptor,r.targetDescriptor);
  const vault=new Vault(join(runtime.metadata.scratchDirectory,'paged-uniswap-context.vault')),record=await vault.read(r.context.password);assert.deepEqual(record,r.context.record,'PAGED_UNISWAP_REOPEN_CHECKPOINT');
  const rule=record.data.rule,actual={profile:'ORIGINAL_PAGED_UNISWAP_CONTEXT_V3',identity:record.data.identity,revision:record.revision,dataSHA256:sha(canonical(record.data)),targetDescriptor:clone(descriptor),rule:clone(rule)};assert.deepEqual(actual,r.checkpoint);
  assert.equal(rule.genesis,bare(runtime.metadata.evmGenesis));assert.equal(rule.asset,descriptor.poolTerms.assetIdentity);
  const s={runtime,protocols:parts.protocols,system:parts.system,router:parts.router,observer:parts.deliveryObserver,account,rule,assets:parts.system.pools.map(p=>p.assetCapability),vault,password:r.context.password,record,closed:false,closing:false,poisoned:false,busy:false,work:null};
  s.retention=await armOriginalPagedUniswapRuntimeRetentionV3({runtime,system:s.system,router:s.router,observer:s.observer,protocolFixture:s.protocols,targetAccount:account});
  const context=exposeContext(s);assert.deepEqual(context.template,r.template);assert.deepEqual(context.configuration,r.configuration);return context;
 }catch(error){await Promise.allSettled([account?.close(),runtime?.close()]);throw error;}
}
