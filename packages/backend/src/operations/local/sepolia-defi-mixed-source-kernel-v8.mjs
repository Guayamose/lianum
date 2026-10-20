/** Explicit seven-rule Source for the same Original Uniswap/Aave/Morpho
 * targets. Existing Sources/verifiers stay immutable. Compiler and constructor
 * callbacks below are fixed private ports, never supplied by an API caller. */
import assert from 'node:assert/strict';
import {consumeOriginalSepoliaDefiComponentV8} from '../recovery/sepolia-defi-retention-v8.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {buildPagedDeploymentKernelDataV4,freeze,staticData,normalizePagedDeploymentConfigurationDataV4} from './funded-graph-paged-kernel-data-v4.mjs';
import {readOriginalFundedPagedGraphSepoliaDeploymentV4,assertOriginalFundedPagedGraphSepoliaWalletV4} from './funded-graph-paged-public-kernel-v4.mjs';
import {assertOriginalSepoliaUniswapTargetSystemV4,assertOriginalSepoliaUniswapTargetReadyV4,readOriginalSepoliaUniswapTargetSourceBindingV4} from './sepolia-uniswap-target-kernel-v4.mjs';
import {readOriginalPagedSepoliaSourceLaneV4,readOriginalPagedSepoliaHistoricalBalanceV4,readOriginalPagedSepoliaSourceFinancialHistoryV5,assertOriginalPagedSepoliaSourcePolicyBirthV5} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {buildPagedSepoliaSourceJournalDataV4} from './funded-graph-paged-source-journal-data-v4.mjs';
import {pagedOwnerExactV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as Aave from '../deployments/defi/aave-sepolia-target-v4.mjs';
import * as Morpho from '../deployments/defi/morpho-v2-sepolia-target-v4.mjs';
import {nativeAdmissionRulesTree,nativeAdmissionRuleCommitment} from '@lianum/engine/execution/native/dispatch/native-admission';

const plans=new WeakMap(),constructors=new WeakMap(),completions=new WeakMap(),systems=new WeakMap(),births=new WeakMap(),birthWork=new WeakMap(),journalBirths=new WeakMap(),sourceCommands=new WeakSet();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),fresh=()=> '0x'+randomBytes(32).toString('hex');
const forbidden=()=>{throw Error('PUBLIC_DEFI_MIXED_PRIVATE_DEPLOYMENT_ONLY');};
const kernel=buildPagedDeploymentKernelDataV4(Object.freeze({chargeOriginalPoolCreationV1:forbidden,consumeOriginalPoolCreationTicketV1:forbidden,reconcileOriginalPoolCreationV1:forbidden,assertOriginalSystem:(...args)=>assertOriginalSepoliaDefiMixedSourceV8(...args)}));
function targetBindings(runtime,target,aaveTarget,morphoTarget){
 assertOriginalSepoliaUniswapTargetSystemV4(runtime,target);
 const parent=readOriginalSepoliaUniswapTargetSourceBindingV4(runtime,target).parent,aave=Aave.readOriginalAaveSepoliaTargetBindingV4(runtime,aaveTarget),morpho=Morpho.readOriginalMorphoV2SepoliaTargetBindingV4(runtime,morphoTarget);
 for(const binding of [aave,morpho]){assert.strictEqual(binding.parent,parent,'PUBLIC_DEFI_MIXED_SAME_ORIGINAL_PARENT');assert.strictEqual(binding.uniswapTarget,target,'PUBLIC_DEFI_MIXED_SAME_ORIGINAL_UNISWAP_TARGET');}
 const aavePlan=Aave.readOriginalAaveSepoliaTargetPlanV4(runtime,aave.plan),morphoPlan=Morpho.readOriginalMorphoV2SepoliaTargetPlanV4(runtime,morpho.plan);
 for(const system of [target,aaveTarget,morphoTarget]){assert.equal(system.keysetId,runtime.metadata.keysetId,'PUBLIC_DEFI_MIXED_SAME_KEYSET');assert.equal(system.account,runtime.accounts[0],'PUBLIC_DEFI_MIXED_SAME_PROVIDER_ACCOUNT');}
 assert.equal(target.rules.length,4);assert.equal(aavePlan.rules.length,5);assert.equal(morphoPlan.rules.length,6);
 for(const plan of [aavePlan,morphoPlan]){assert.deepEqual(plan.rules.slice(0,4),target.rules,'PUBLIC_DEFI_MIXED_ORIGINAL_RULE_PREFIX');assert.deepEqual(plan.target.registry.keys,target.target.registry.keys,'PUBLIC_DEFI_MIXED_SAME_ATTESTERS');assert.equal(nativeAdmissionRulesTree(plan.rules).root,plan.rulesRoot,'PUBLIC_DEFI_MIXED_TARGET_RULES_ROOT');}
 const rules=[...target.rules,aavePlan.rules[4],...morphoPlan.rules.slice(4)],tree=nativeAdmissionRulesTree(rules);
 assert.equal(rules.length,7);assert.equal(new Set(rules.map(nativeAdmissionRuleCommitment)).size,7,'PUBLIC_DEFI_MIXED_DISTINCT_RULES');assert.equal(new Set(rules.map(rule=>rule.genesis+':'+rule.asset)).size,7,'PUBLIC_DEFI_MIXED_DISTINCT_ASSETS');
 return {parent,aavePlan,morphoPlan,rules:freeze(structuredClone(rules)),rulesRoot:tree.root};
}
async function targetReady(runtime,target,aaveTarget,morphoTarget){
 const binding=targetBindings(runtime,target,aaveTarget,morphoTarget);await assertOriginalSepoliaUniswapTargetReadyV4(runtime,target);await Aave.finalizeOriginalAaveSepoliaTargetV4(runtime,Aave.readOriginalAaveSepoliaTargetBindingV4(runtime,aaveTarget).plan);await Morpho.finalizeOriginalMorphoV2SepoliaTargetV4(runtime,Morpho.readOriginalMorphoV2SepoliaTargetBindingV4(runtime,morphoTarget).plan);assert.deepEqual(targetBindings(runtime,target,aaveTarget,morphoTarget),binding);return binding;
}
function state(runtime,plan){const p=plans.get(plan);assert.ok(p?.runtime===runtime&&!p.closed,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_PLAN');assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,p.parent);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.policySHA256);const binding=targetBindings(runtime,p.target,p.aaveTarget,p.morphoTarget);assert.deepEqual(binding.rules,p.rules);assert.equal(binding.rulesRoot,p.rulesRoot);return p;}
function emit(p,event){if(p.closed)return;if(p.waiter){const waiter=p.waiter;p.waiter=null;waiter(event);}else{assert.equal(p.event,null);p.event=event;}}
async function issue(p,data){
 state(p.runtime,p.plan);assert.equal(p.pending,null);assert.equal(data.chainId,'11155111');assert.equal(data.sender,p.runtime.accounts[0]);assert.equal(data.securityGeneration,'EXACT_PAYOUT_SET_V4');assert.deepEqual(p.data.constructors.find(c=>c.nonce===data.nonce),data,'PUBLIC_DEFI_MIXED_COMPILED_CONSTRUCTOR');
 const index=p.data.constructors.findIndex(row=>row.nonce===data.nonce),observationOnly=Boolean(p.reopening&&(p.reopening.system!==null||index<p.reopening.receipts.length));
 const token=Object.freeze(Object.create(null)),grant={runtime:p.runtime,plan:p.plan,index,data:freeze(structuredClone(data)),active:true,signConsumed:observationOnly,observationOnly};constructors.set(token,grant);
 return new Promise((resolve,reject)=>{p.pending={token,resolve,reject,delivered:false};emit(p,Object.freeze({kind:'CONSTRUCTOR',token}));});
}
export async function prepareOriginalSepoliaDefiMixedSourceV8(runtime,target,aaveTarget,morphoTarget){
 assert.equal(arguments.length,4);targetBindings(runtime,target,aaveTarget,morphoTarget);const pending=birthWork.get(target);if(pending){assert.ok(pending.runtime===runtime&&pending.aaveTarget===aaveTarget&&pending.morphoTarget===morphoTarget,'PUBLIC_DEFI_MIXED_ALREADY_OWNED');return pending.work;}const work={runtime,aaveTarget,morphoTarget,work:null};birthWork.set(target,work);work.work=prepareMixed(runtime,target,aaveTarget,morphoTarget).finally(()=>{if(birthWork.get(target)===work)birthWork.delete(target);});return work.work;
}
async function prepareMixed(runtime,target,aaveTarget,morphoTarget,reopening=null){
 const binding=await targetReady(runtime,target,aaveTarget,morphoTarget),{parent,rules,rulesRoot}=binding,prior=readOriginalFundedPagedGraphSepoliaDeploymentV4(runtime,parent),previous=births.get(target);
 if(previous){assert.ok(previous.runtime===runtime&&previous.aaveTarget===aaveTarget&&previous.morphoTarget===morphoTarget,'PUBLIC_DEFI_MIXED_ALREADY_OWNED');if(!previous.closed){state(runtime,previous.plan);return previous.plan;}assert.ok(reopening,'PUBLIC_DEFI_MIXED_CLOSED_SOURCE_REQUIRES_RETENTION');}
 const lane=readOriginalPagedSepoliaSourceLaneV4(runtime),startNonce=reopening===null?await runtime.nonce(runtime.accounts[0],'pending'):BigInt(reopening.plan.startNonce),registryEpoch=([target.target.registry.registryEpoch,aaveTarget.target.registry.registryEpoch,morphoTarget.target.registry.registryEpoch].map(BigInt).reduce((a,b)=>a>b?a:b)+1n).toString(),configuration=normalizePagedDeploymentConfigurationDataV4(reopening?.plan.configuration??{...prior.configuration,deploymentDomain:fresh(),policy:fresh(),registryEpoch,rulesRoot:'0x'+rulesRoot,attesterKeys:target.target.registry.keys});
 assert.ok(startNonce>=0n&&startNonce+3n<1n<<64n);assert.equal(configuration.rulesRoot,'0x'+rulesRoot,'PUBLIC_DEFI_MIXED_EXACT_RULES_ROOT');assert.notEqual(configuration.rulesRoot,prior.configuration.rulesRoot,'PUBLIC_DEFI_MIXED_NEW_RULES_REQUIRED');assert.equal(configuration.registryEpoch,registryEpoch);assert.deepEqual(configuration.attesterKeys,prior.configuration.attesterKeys);assert.equal(configuration.minimumDepositAtomic,parent.minimumDepositAtomic);
 const plan=Object.freeze(Object.create(null)),p={runtime,plan,target,aaveTarget,morphoTarget,parent,rules,rulesRoot,configuration,startNonce,policySHA256:reopening?.plan.policySHA256??hash(lane.policy),reopening,data:null,pending:null,event:null,waiter:null,closed:false,context:null,system:null,receipts:new Map()};plans.set(plan,p);births.set(target,p);
 p.work=kernel.deploy(runtime,configuration,prior,null,{successor:true,startNonce,reopening,issueConstructor:data=>issue(p,data),setSuccessorConstructors(rows){
  assert.equal(rows.length,3);const data=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_PLAN_V8',predecessor:parent.pool,uniswapTargetPlanSHA256:target.planSHA256,aaveTargetPlanSHA256:aaveTarget.planSHA256,morphoTargetPlanSHA256:morphoTarget.planSHA256,keysetId:target.keysetId,policySHA256:p.policySHA256,configuration,startNonce:startNonce.toString(),constructors:structuredClone(rows),rules,rulesRoot,sharesOriginalVerifiers:true});p.data=freeze({...data,planSHA256:hash(data)});if(reopening)assert.deepEqual(p.data,reopening.plan,'PUBLIC_DEFI_MIXED_RECOMPILED_PLAN');
 }}).then(context=>{state(runtime,plan);if(reopening?.system)assert.deepEqual(context.system,reopening.system,'PUBLIC_DEFI_MIXED_RECOMPILED_SYSTEM');assert.deepEqual(context.system.registry.keys,target.target.registry.keys);assert.equal(context.system.registry.rulesRoot,rulesRoot);p.context=context;p.sourceEntries=freeze(structuredClone(context.entries));p.sourceOwnPins=freeze(structuredClone(context.ownPins));p.sourceOwnArtifacts=freeze(structuredClone(context.ownArtifacts));p.system=context.system;systems.set(context.system,p);const completion=Object.freeze(Object.create(null));completions.set(completion,{runtime,plan,system:context.system});emit(p,Object.freeze({kind:'READY',system:context.system,completion}));}).catch(error=>emit(p,{kind:'ERROR',error}));return plan;
}
export async function readOriginalSepoliaDefiMixedSourceStepV8(runtime,plan){
 assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(!p.waiter&&!p.pending?.delivered,'PUBLIC_DEFI_MIXED_STEP_PENDING');const event=p.event??await new Promise(resolve=>p.waiter=resolve);p.event=null;state(runtime,plan);if(event.kind==='ERROR')throw event.error;if(event.kind==='CONSTRUCTOR'){assert.strictEqual(p.pending.token,event.token);p.pending.delivered=true;}return event;
}
export function readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token){
 assert.equal(arguments.length,2);const g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_CONSTRUCTOR');const p=state(runtime,g.plan);assert.strictEqual(p.pending?.token,token);assert.ok(p.pending.delivered);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_CONSTRUCTOR_V8',plan:p.data,constructor:g.data});
}
export function consumeOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token){const g=constructors.get(token),data=readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token);assert.ok(!g.signConsumed,'PUBLIC_DEFI_MIXED_SIGN_ALREADY_CONSUMED');g.signConsumed=true;return data;}
/** Fixed constructor preparation revalidates the actual original Target and
 * parent after RPC awaits; a copied constructor never reaches this reader. */
export async function readOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token){
 const data=readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token),g=constructors.get(token),p=state(runtime,g.plan);
 // Retained constructors only replay their authenticated receipt. Both prepare
 // and finalize validate all current targets; no signing checkpoint is issued.
 if(g.observationOnly){assert.ok(g.signConsumed&&p.reopening?.receipts[g.index],'PUBLIC_DEFI_MIXED_ORIGINAL_RETAINED_RECEIPT');return data;}
 await targetReady(runtime,p.target,p.aaveTarget,p.morphoTarget);assert.deepEqual(readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token),data);const head=await runtime.block();await runtime.assertCanonical(head);assert.deepEqual(readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token),data);g.validation={head:freeze(structuredClone(head)),wall:Date.now(),elapsed:performance.now(),policySHA256:hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),epochId:readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId};return data;
}
/** Full target/code validation precedes fee observation. These ports retain
 * only a private checkpoint of that same pending Original constructor. */
export async function prepareOriginalSepoliaDefiMixedSourceInitializationDispatchV8(runtime,token){
 assert.equal(arguments.length,2);const g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_CONSTRUCTOR');
 if(!g.validation||Date.now()>=g.validation.wall+30000||performance.now()>=g.validation.elapsed+30000)await readOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token);
 return readOriginalSepoliaDefiMixedSourceInitializationDispatchV8(runtime,token);
}
export async function readOriginalSepoliaDefiMixedSourceInitializationDispatchV8(runtime,token){
 assert.equal(arguments.length,2);const g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_CONSTRUCTOR');
 const current=()=>{const p=plans.get(g.plan),v=g.validation;assert.ok(p?.runtime===runtime&&!p.closed,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_PLAN');assert.ok(v&&Date.now()<v.wall+30000&&performance.now()<v.elapsed+30000,'PUBLIC_DEFI_MIXED_INITIALIZATION_VALIDATION_EXPIRED');assert.strictEqual(p.pending?.token,token);assert.ok(p.pending.delivered&&g.active);assert.equal(g.index,p.receipts.size,'PUBLIC_DEFI_MIXED_RECEIPT_ORDER');assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,p.parent);assertOriginalSepoliaUniswapTargetSystemV4(runtime,p.target);assert.strictEqual(readOriginalSepoliaUniswapTargetSourceBindingV4(runtime,p.target).parent,p.parent);for(const [owner,system,name]of [[Aave,p.aaveTarget,'Aave'],[Morpho,p.morphoTarget,'MorphoV2']]){const b=owner['readOriginal'+name+'SepoliaTargetBindingV4'](runtime,system);assert.strictEqual(b.parent,p.parent);assert.strictEqual(b.uniswapTarget,p.target);assert.equal(system.keysetId,runtime.metadata.keysetId);assert.equal(system.account,runtime.accounts[0]);}assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.policySHA256);assert.equal(hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),v.policySHA256,'PUBLIC_DEFI_MIXED_INITIALIZATION_POLICY_CHANGED');assert.equal(readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId,v.epochId,'PUBLIC_DEFI_MIXED_INITIALIZATION_EPOCH_CHANGED');assert.equal(p.data.keysetId,runtime.metadata.keysetId);assert.equal(g.data.sender,runtime.accounts[0]);return p;};
 let p=current();await runtime.assertCanonical(g.validation.head);p=current();return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_CONSTRUCTOR_V8',plan:p.data,constructor:g.data});
}
export async function consumeOriginalSepoliaDefiMixedSourceInitializationDispatchV8(runtime,token){
 assert.equal(arguments.length,2);const data=await readOriginalSepoliaDefiMixedSourceInitializationDispatchV8(runtime,token),g=constructors.get(token);assert.ok(!g.signConsumed&&!g.observationOnly,'PUBLIC_DEFI_MIXED_SIGN_ALREADY_CONSUMED');g.signConsumed=true;return data;
}
export async function consumeOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token){
 const data=await readOriginalSepoliaDefiMixedSourceInitializationV8(runtime,token);assert.deepEqual(consumeOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token),data);return data;
}
export async function advanceOriginalSepoliaDefiMixedSourceV8(runtime,plan,token,receipt){
 assert.equal(arguments.length,4);const p=state(runtime,plan),g=constructors.get(token),pending=p.pending;assert.ok(g?.runtime===runtime&&g.active&&g.plan===plan&&pending?.token===token&&pending.delivered,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_STEP');await runtime.checkReceipt(receipt);assert.equal(receipt.contractAddress?.toLowerCase(),g.data.expectedAddress);if(g.observationOnly)assert.deepEqual(receipt,p.reopening.receipts[g.index],'PUBLIC_DEFI_MIXED_ORIGINAL_RETAINED_RECEIPT');state(runtime,plan);assert.strictEqual(p.pending,pending);assert.ok(g.active);assert.equal(g.index,p.receipts.size,'PUBLIC_DEFI_MIXED_RECEIPT_ORDER');p.receipts.set(g.index,freeze(structuredClone(receipt)));g.active=false;p.pending=null;pending.resolve(structuredClone(receipt));
}
export function assertOriginalSepoliaDefiMixedSourceV8(runtime,system){
 assert.equal(arguments.length,2);const p=systems.get(system);assert.ok(p?.runtime===runtime&&p.system===system&&!p.closed,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE');state(runtime,p.plan);return system;
}
/** Only this instance's private birth map links a Source to its Target. Equal
 * registry/rule DATA from another original Source does not establish lineage. */
export function readOriginalSepoliaDefiMixedSourceBindingV8(runtime,system){
 assert.equal(arguments.length,2);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system);return Object.freeze({target:p.target,uniswapTarget:p.target,aaveTarget:p.aaveTarget,morphoTarget:p.morphoTarget,parent:p.parent,plan:p.plan});
}
export function readOriginalSepoliaDefiMixedSourceCompletionV8(runtime,token){
 assert.equal(arguments.length,2);const g=completions.get(token);assert.ok(g?.runtime===runtime,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_COMPLETION');assertOriginalSepoliaDefiMixedSourceV8(runtime,g.system);const p=state(runtime,g.plan);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_COMPLETION_V8',system:structuredClone(g.system),plan:p.data});
}
export function readOriginalSepoliaDefiMixedSourcePlanV8(runtime,plan){assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(p.data,'PUBLIC_DEFI_MIXED_COMPILED_PLAN_PENDING');return p.data;}
export function readOriginalSepoliaDefiMixedSourcePlanBindingV8(runtime,plan){assert.equal(arguments.length,2);const p=state(runtime,plan);return Object.freeze({uniswapTarget:p.target,aaveTarget:p.aaveTarget,morphoTarget:p.morphoTarget,parent:p.parent});}
export function readOriginalSepoliaDefiMixedSourceInitializationAttemptV8(runtime,token){assert.equal(arguments.length,2);readOriginalSepoliaDefiMixedSourceConstructorV8(runtime,token);const g=constructors.get(token);return Object.freeze({consumed:g.signConsumed,observationOnly:g.observationOnly});}
export function readOriginalSepoliaDefiMixedSourceRetainedReceiptsV8(runtime,plan){assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(p.reopening,'PUBLIC_DEFI_MIXED_RETAINED_PLAN_REQUIRED');return freeze(structuredClone(p.reopening.receipts));}
export async function finalizeOriginalSepoliaDefiMixedSourceV8(runtime,plan){assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(p.system&&p.receipts.size===3,'PUBLIC_DEFI_MIXED_SOURCE_INITIALIZATION_INCOMPLETE');return assertOriginalSepoliaDefiMixedSourceReadyV8(runtime,p.system);}
export async function closeOriginalSepoliaDefiMixedSourcePlanV8(runtime,plan){
 assert.equal(arguments.length,2);const p=plans.get(plan);assert.ok(p?.runtime===runtime,'PUBLIC_DEFI_ORIGINAL_MIXED_SOURCE_PLAN');if(p.closed)return;p.closed=true;const error=Error('PUBLIC_DEFI_MIXED_SOURCE_CLOSED');if(p.pending){constructors.get(p.pending.token).active=false;p.pending.reject(error);p.pending=null;}if(p.waiter){p.waiter({kind:'ERROR',error});p.waiter=null;}await p.work;
}

/** Same fixed mechanical journal vocabulary, owned by a distinct Original
 * Mixed instance. Existing Native3 journal/system tokens are never promoted. */
export function readOriginalSepoliaDefiMixedSourceDeploymentV8(runtime,system){
 assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system),c=p.context;return Object.freeze({entries:p.sourceEntries,ownPins:p.sourceOwnPins,ownArtifacts:p.sourceOwnArtifacts,pool:c.pool,state:c.state,native:c.native,ledgerLeaves:c.ledgerLeaves,call:(kind,signature,args=[],block='latest')=>{assertOriginalSepoliaDefiMixedSourceV8(runtime,system);assert.ok(['pool','state','native'].includes(kind));return runtime.call({to:system[kind],data:staticData(p.sourceEntries[kind].artifact,signature,args)},block);}});
}
export async function assertOriginalSepoliaDefiMixedSourceReadyV8(runtime,system){
 assert.equal(arguments.length,2);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system);if(p.dispatchValidationWork)return p.dispatchValidationWork;
 const policySHA256=hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),epochId=readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId;
 const work=(async()=>{await targetReady(runtime,p.target,p.aaveTarget,p.morphoTarget);return validateSourceDispatchContractsV8(runtime,system,p,policySHA256,epochId);})();p.dispatchValidationWork=work;try{return await work;}finally{if(p.dispatchValidationWork===work)p.dispatchValidationWork=null;}
}
async function observeSourceDispatchContractsV33(runtime,system,p,policySHA256,epochId,checkedHead=null){
 const head=checkedHead??await runtime.block('finalized'),key=hash([head.number,head.hash,system.deployments]);
 // Successful immutable-contract validation belongs to this private plan and
 // exact finalized hash. Every reuse still observes canonicality afresh.
 try{
  if(checkedHead)assert.equal(p.sourceContractValidationV33,key,'PUBLIC_DEFI_MIXED_SOURCE_VALIDATION_CHANGED');
  else if(p.sourceContractValidationV33!==key){
   await Promise.all(system.deployments.map(async row=>{assert.ok(BigInt(row.receipt.blockNumber)<=BigInt(head.number),'PUBLIC_DEFI_MIXED_SOURCE_FINALITY_PENDING');const actual=await runtime.receipt(row.receipt.transactionHash);assert.deepEqual(actual,row.receipt,'PUBLIC_DEFI_MIXED_SOURCE_ORIGINAL_RECEIPT');await runtime.checkReceipt(actual);assert.equal(await runtime.code(row.address,head.number),row.expectedCode,'PUBLIC_DEFI_MIXED_SOURCE_CODE');}));
  }
  await runtime.assertCanonical(head);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);assert.equal(hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),policySHA256,'PUBLIC_DEFI_MIXED_DISPATCH_POLICY_CHANGED');assert.equal(readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId,epochId,'PUBLIC_DEFI_MIXED_DISPATCH_EPOCH_CHANGED');p.sourceContractValidationV33=key;return head;
 }catch(error){if(p.sourceContractValidationV33===key)p.sourceContractValidationV33=null;throw error;}
}
async function validateSourceDispatchContractsV8(runtime,system,p,policySHA256,epochId,targetCheckpoints=null,checkedHead=null){
 const head=await observeSourceDispatchContractsV33(runtime,system,p,policySHA256,epochId,checkedHead),clocks=targetCheckpoints===null?[]:await readTargetDispatchCheckpointsV8(runtime,p,targetCheckpoints);
 p.dispatchValidation={head:freeze(structuredClone(head)),wall:Math.min(Date.now(),...clocks.map(v=>v.wall)),elapsed:Math.min(performance.now(),...clocks.map(v=>v.elapsed)),policySHA256,epochId,planSHA256:p.data.planSHA256,keysetId:runtime.metadata.keysetId,account:runtime.accounts[0],targetCheckpoints};return system;
}
async function readTargetDispatchCheckpointsV8(runtime,p,checkpoints){
 return Promise.all([Aave.readOriginalAaveSepoliaTargetFinancialCheckpointV8(runtime,p.aaveTarget,checkpoints.aave),Morpho.readOriginalMorphoV2SepoliaTargetFinancialCheckpointV8(runtime,p.morphoTarget,checkpoints.morpho)]);
}
/** Only the full Original producer above writes this bounded checkpoint.
 * This read never refreshes it, issues a Source permission or accepts DATA. */
export async function assertOriginalSepoliaDefiMixedSourceDispatchReadyV8(runtime,system){
 assert.equal(arguments.length,2);const current=v=>{assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system);assert.ok(v&&Date.now()<v.wall+30000&&performance.now()<v.elapsed+30000,'PUBLIC_DEFI_MIXED_DISPATCH_VALIDATION_EXPIRED');assert.equal(p.data.planSHA256,v.planSHA256);assert.equal(runtime.metadata.keysetId,v.keysetId);assert.equal(runtime.accounts[0],v.account);assert.equal(hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),v.policySHA256,'PUBLIC_DEFI_MIXED_DISPATCH_POLICY_CHANGED');assert.equal(readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId,v.epochId,'PUBLIC_DEFI_MIXED_DISPATCH_EPOCH_CHANGED');return p;};assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const before=systems.get(system).dispatchValidation,p=current(before);if(before.targetCheckpoints)await readTargetDispatchCheckpointsV8(runtime,p,before.targetCheckpoints);await runtime.assertCanonical(before.head);current(before);const after=systems.get(system).dispatchValidation;current(after);for(const key of ['planSHA256','keysetId','account','policySHA256','epochId'])assert.equal(after[key],before[key],'PUBLIC_DEFI_MIXED_DISPATCH_CONTEXT_CHANGED');return system;
}
export async function warmOriginalSepoliaDefiMixedSourceDispatchV8(runtime,system){
 assert.equal(arguments.length,2);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system);if(p.dispatchValidationWork)return p.dispatchValidationWork;const policySHA256=hash(readOriginalPagedSepoliaSourceLaneV4(runtime).policy),epochId=readOriginalPagedSepoliaSourceFinancialHistoryV5(runtime).epochId;
 const work=(async()=>{const checkedHead=await observeSourceDispatchContractsV33(runtime,system,p,policySHA256,epochId);const completed=await Promise.allSettled([Aave.warmOriginalAaveSepoliaTargetFinancialCheckpointV8(runtime,p.aaveTarget),Morpho.warmOriginalMorphoV2SepoliaTargetFinancialCheckpointV8(runtime,p.morphoTarget)]),failure=completed.find(row=>row.status==='rejected');if(failure)throw failure.reason;const [aave,morpho]=completed.map(row=>row.value);return validateSourceDispatchContractsV8(runtime,system,p,policySHA256,epochId,{aave,morpho},checkedHead);})();p.dispatchValidationWork=work;try{return await work;}finally{if(p.dispatchValidationWork===work)p.dispatchValidationWork=null;}
}
const sourceJournal=buildPagedSepoliaSourceJournalDataV4(Object.freeze({readOriginalHistoricalBalance:readOriginalPagedSepoliaHistoricalBalanceV4,readOriginalFinancialHistory:readOriginalPagedSepoliaSourceFinancialHistoryV5,assertOriginalSystem:(...args)=>assertOriginalSepoliaDefiMixedSourceV8(...args),readOriginalSystem:(...args)=>readOriginalSepoliaDefiMixedSourceDeploymentV8(...args),assertOriginalReceiverReady:(runtime,system,storageRecovery=false)=>{assert.equal(storageRecovery,false,'PUBLIC_DEFI_MIXED_STORAGE_RECOVERY_UNSUPPORTED');return assertOriginalSepoliaDefiMixedSourceReadyV8(runtime,system);},assertOriginalDispatchReady:(...args)=>assertOriginalSepoliaDefiMixedSourceDispatchReadyV8(...args)}));
export async function createOriginalSepoliaDefiMixedSourceJournalV8(runtime,system,input){
 assert.equal(arguments.length,3);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);pagedOwnerExactV3(input,['origin','devicePublicKey','journal']);pagedOwnerExactV3(input.journal,['path','password']);const data=structuredClone(input),configSHA256=hash(data),previous=journalBirths.get(system);if(previous){assert.ok(previous.runtime===runtime&&previous.configSHA256===configSHA256,'PUBLIC_DEFI_MIXED_SOURCE_JOURNAL_ALREADY_BORN');const bundle=await previous.work;return sourceJournal.assertBundle(runtime,system,bundle);}const lane=readOriginalPagedSepoliaSourceLaneV4(runtime),birth={runtime,configSHA256,work:null};journalBirths.set(system,birth);birth.work=sourceJournal.createIndependent(runtime,system,data,lane.policy.expiresAt-30*60000);return birth.work;
}
export async function reopenOriginalSepoliaDefiMixedSourceJournalV8(runtime,system,input,token){assert.equal(arguments.length,4);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const p=systems.get(system);return sourceJournal.reopenDefiMixed(runtime,system,input,token,p.target);}
export const assertOriginalSepoliaDefiMixedSourceJournalV8=(...args)=>sourceJournal.assertBundle(...args);
export const issueOriginalSepoliaDefiMixedSourcePermissionV8=(...args)=>sourceJournal.issue(...args);
export const consumeOriginalSepoliaDefiMixedSourcePermissionV8=(...args)=>sourceJournal.consume(...args);
export const readOriginalSepoliaDefiMixedSourcePermissionV8=(...args)=>sourceJournal.readPermission(...args);
export const readOriginalSepoliaDefiMixedSourceDispatchAuthorizationV8=(...args)=>sourceJournal.readDispatchAuthorization(...args);
export const registerOriginalSepoliaDefiMixedSourceProofV8=(...args)=>sourceJournal.register(...args);
export const registerOriginalSepoliaDefiMixedSourceRetainedProofV8=(...args)=>sourceJournal.registerRetained(...args);
export const registerOriginalSepoliaDefiMixedSourceAutomationProofV8=(...args)=>sourceJournal.registerAutomation(...args);
async function retainCommand(promise){const token=await promise;sourceCommands.add(token);return token;}
export const armOriginalSepoliaDefiMixedSourceCommandV8=(...args)=>retainCommand(sourceJournal.arm(...args));
export const armOriginalSepoliaDefiMixedSourceCutoffV8=(...args)=>retainCommand(sourceJournal.cutoff(...args));
export const armOriginalSepoliaDefiMixedSourceAutomationCommandV8=(...args)=>retainCommand(sourceJournal.armAutomation(...args));
export const armOriginalSepoliaDefiMixedSourceAutomationCutoffV8=(...args)=>retainCommand(sourceJournal.cutoffAutomation(...args));
/** Classification reads this canonical owner's private map only. It never
 * registers a caller token or converts command DATA into a permission. */
export function isOriginalSepoliaDefiMixedSourceCommandV8(token){return sourceCommands.has(token);}
export const readOriginalSepoliaDefiMixedSourceCommandV8=(...args)=>sourceJournal.readCommand(...args);
export const consumeOriginalSepoliaDefiMixedSourceCommandV8=(...args)=>sourceJournal.consumeCommand(...args);
export const armOriginalSepoliaDefiExpiredDepositRetirementV18=(...args)=>sourceJournal.armExpiredDepositRetirementV18(...args);
export const consumeOriginalSepoliaDefiExpiredDepositRetirementV18=(...args)=>sourceJournal.consumeExpiredDepositRetirementV18(...args);
export const closeOriginalSepoliaDefiMixedSourceJournalV8=(...args)=>sourceJournal.close(...args);

/** Retained compiled Mixed Source DATA; only a later Original Sup consumer may reopen. */
export async function retainOriginalSepoliaDefiMixedSourceV8(runtime,system){
 assert.equal(arguments.length,2);await assertOriginalSepoliaDefiMixedSourceReadyV8(runtime,system);const p=systems.get(system);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_RETENTION_V8',plan:structuredClone(p.data),system:structuredClone(system),receipts:structuredClone([...p.receipts.values()])});
}
export async function retainOriginalSepoliaDefiMixedSourcePlanV8(runtime,plan){assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(p.data,'PUBLIC_DEFI_MIXED_COMPILED_PLAN_PENDING');if(p.system)return retainOriginalSepoliaDefiMixedSourceV8(runtime,p.system);for(const receipt of p.receipts.values()){assert.deepEqual(await runtime.receipt(receipt.transactionHash),receipt,'PUBLIC_DEFI_MIXED_ORIGINAL_PARTIAL_RECEIPT');await runtime.checkReceipt(receipt);}state(runtime,plan);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_RETENTION_V8',plan:structuredClone(p.data),system:null,receipts:structuredClone([...p.receipts.values()])});}

/** Cold creation mode is selected only by this one-use Mixed Sup component.
 * Same protected receipts are replayed; new tokens cannot sign constructors. */
async function reopen(runtime,target,aaveTarget,morphoTarget,token,kind){
 const binding=targetBindings(runtime,target,aaveTarget,morphoTarget);assert.ok((!births.has(target)||births.get(target).closed)&&!birthWork.has(target),'PUBLIC_DEFI_MIXED_SOURCE_ALREADY_OWNED');const saved=await consumeOriginalSepoliaDefiComponentV8(runtime,target,token,kind,null);pagedOwnerExactV3(saved,['profile','plan','system','receipts']);assert.equal(saved.profile,'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_RETENTION_V8');assert.equal(saved.plan.profile,'ORIGINAL_PUBLIC_SEPOLIA_DEFI_MIXED_SOURCE_PLAN_V8');assert.equal(saved.plan.keysetId,runtime.metadata.keysetId);assert.equal(saved.plan.uniswapTargetPlanSHA256,target.planSHA256);assert.equal(saved.plan.aaveTargetPlanSHA256,aaveTarget.planSHA256);assert.equal(saved.plan.morphoTargetPlanSHA256,morphoTarget.planSHA256);assert.equal(saved.plan.predecessor,binding.parent.pool);assert.deepEqual(saved.plan.rules,binding.rules);assert.equal(saved.plan.rulesRoot,binding.rulesRoot);assert.match(saved.plan.startNonce,/^(?:0|[1-9][0-9]*)$/);assert.ok(Array.isArray(saved.receipts)&&saved.receipts.length<=3);if(kind==='mixedSource')assert.ok(saved.system&&saved.receipts.length===3,'PUBLIC_DEFI_MIXED_READY_RETENTION_REQUIRED');else assert.equal(saved.system,null,'PUBLIC_DEFI_MIXED_PARTIAL_RETENTION_REQUIRED');const start=BigInt(saved.plan.startNonce);assert.ok(start+3n<1n<<64n);assert.ok(await runtime.nonce(runtime.accounts[0],'pending')>=start+BigInt(saved.receipts.length),'PUBLIC_DEFI_MIXED_REOPEN_NONCE');assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,saved.plan.policySHA256);return prepareMixed(runtime,target,aaveTarget,morphoTarget,freeze(structuredClone(saved)));
}
export async function prepareOriginalSepoliaDefiMixedSourceReopenV8(runtime,target,aaveTarget,morphoTarget,token){assert.equal(arguments.length,5);return reopen(runtime,target,aaveTarget,morphoTarget,token,'mixedSource');}
export async function prepareOriginalSepoliaDefiMixedSourceResumeV8(runtime,target,aaveTarget,morphoTarget,token){assert.equal(arguments.length,5);return reopen(runtime,target,aaveTarget,morphoTarget,token,'mixedInitialization');}

export const replaceOriginalSepoliaDefiMixedEmptySourceJournalV9=(...args)=>sourceJournal.replaceEmpty(...args);
export const readOriginalSepoliaDefiMixedEmptyReplacementJournalV9=(...args)=>sourceJournal.readEmptyReplacement(...args);
export const assertOriginalSepoliaDefiMixedEmptyReplacementJournalV9=(...args)=>sourceJournal.assertEmptyReplacement(...args);
export const assertOriginalSepoliaDefiMixedSourceStorageJournalV9=(...args)=>sourceJournal.assertStorageBundle(...args);
export const readOriginalSepoliaDefiMixedEmptyCurrentLineageV9=(...args)=>sourceJournal.readCurrentEmptyLineage(...args);
export const reopenOriginalSepoliaDefiMixedEmptyPredecessorJournalV9=(...args)=>sourceJournal.reopenEmptyPredecessor(...args);
export const isOriginalSepoliaDefiMixedEmptyPredecessorJournalV9=(...args)=>sourceJournal.isEmptyReplacementPredecessor(...args);

/** Only actual expired Source bundles can prepare a fresh bounded exit. */
export const prepareOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.prepareExpiredWithdrawalV10(...args);
export const readPreparationOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.readExpiredPreparationV10(...args);
export const assertPreparationOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.assertExpiredPreparationV10(...args);
export const closePreparationOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.closeExpiredPreparationV10(...args);
export const createOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.createExpiredWithdrawalV10(...args);
export const readOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.readExpiredWithdrawalV10(...args);
export const publishOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.publishExpiredWithdrawalV10(...args);
export async function reopenOriginalSepoliaDefiMixedExpiredWithdrawalV10(runtime,system,sourceBundle,ownerCheckpoint,token){assert.equal(arguments.length,5);assertOriginalSepoliaDefiMixedSourceV8(runtime,system);const S=await import('../recovery/sepolia-defi-retention-v8.mjs'),saved=await S.consumeOriginalSepoliaDefiExpiredMixedWithdrawalV10(runtime,system,token);return sourceJournal.reopenExpiredWithdrawalV10(runtime,system,sourceBundle,ownerCheckpoint,saved);}
export const openOutputOwnerOriginalSepoliaDefiMixedExpiredWithdrawalV10=(...args)=>sourceJournal.openExpiredWithdrawalOutputOwnerV10(...args);

export const isOriginalSepoliaDefiExpiredWithdrawalRetirementV32=(...args)=>sourceJournal.isExpiredWithdrawalRetirementV32(...args);
export const armOriginalSepoliaDefiExpiredWithdrawalRetirementV32=(...args)=>sourceJournal.armExpiredWithdrawalRetirementV32(...args);
export const consumeOriginalSepoliaDefiExpiredWithdrawalRetirementV32=(...args)=>sourceJournal.consumeExpiredWithdrawalRetirementV32(...args);

/** Same-pool source succession: fixed Original journal owner, no new deployment. */
export const prepareOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.prepareMixedSuccessorV35(...args);
export const createOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.createMixedSuccessorV35(...args);
export const readPreparationOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.readMixedSuccessorPreparationV35(...args);
export const readBindingOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.readMixedSuccessorV35(...args);
export const readLineageOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.readCurrentMixedSuccessorLineageV35(...args);
export const reopenPredecessorOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.reopenMixedSuccessorPredecessorV35(...args);
export const isPredecessorOriginalSepoliaDefiMixedSuccessorV35=(...args)=>sourceJournal.isMixedSuccessorPredecessorV35(...args);
