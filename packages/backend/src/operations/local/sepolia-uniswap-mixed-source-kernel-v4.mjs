/** Explicit new four-rule Source for the original PUBLIC Uniswap target.
 * Existing three-rule Sources/verifiers stay immutable. Compiler and constructor
 * callbacks below are fixed private ports, never supplied by an API caller. */
import assert from 'node:assert/strict';
import {consumeOriginalPagedPublicUniswapMixedComponentV4} from '../recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {buildPagedDeploymentKernelDataV4,freeze,staticData,normalizePagedDeploymentConfigurationDataV4} from './funded-graph-paged-kernel-data-v4.mjs';
import {readOriginalFundedPagedGraphSepoliaDeploymentV4,assertOriginalFundedPagedGraphSepoliaWalletV4} from './funded-graph-paged-public-kernel-v4.mjs';
import {assertOriginalSepoliaUniswapTargetSystemV4,assertOriginalSepoliaUniswapTargetReadyV4,readOriginalSepoliaUniswapTargetSourceBindingV4} from './sepolia-uniswap-target-kernel-v4.mjs';
import {readOriginalPagedSepoliaSourceLaneV4,readOriginalPagedSepoliaHistoricalBalanceV4,readOriginalPagedSepoliaSourceFinancialHistoryV5,assertOriginalPagedSepoliaSourcePolicyBirthV5} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {buildPagedSepoliaSourceJournalDataV4} from './funded-graph-paged-source-journal-data-v4.mjs';
import {pagedOwnerExactV3} from '@lianum/mobile-protocol/device/paged-owner-v3';

const plans=new WeakMap(),constructors=new WeakMap(),completions=new WeakMap(),systems=new WeakMap(),births=new WeakMap(),birthWork=new WeakMap(),journalBirths=new WeakMap(),sourceCommands=new WeakSet();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),fresh=()=> '0x'+randomBytes(32).toString('hex');
const forbidden=()=>{throw Error('PUBLIC_UNISWAP_MIXED_PRIVATE_DEPLOYMENT_ONLY');};
const kernel=buildPagedDeploymentKernelDataV4(Object.freeze({chargeOriginalPoolCreationV1:forbidden,consumeOriginalPoolCreationTicketV1:forbidden,reconcileOriginalPoolCreationV1:forbidden,assertOriginalSystem:(...args)=>assertOriginalSepoliaUniswapMixedSourceV4(...args)}));
function state(runtime,plan){const p=plans.get(plan);assert.ok(p?.runtime===runtime&&!p.closed,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE_PLAN');assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,p.parent);assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,p.policySHA256);return p;}
function emit(p,event){if(p.closed)return;if(p.waiter){const waiter=p.waiter;p.waiter=null;waiter(event);}else{assert.equal(p.event,null);p.event=event;}}
async function issue(p,data){
 state(p.runtime,p.plan);assert.equal(p.pending,null);assert.equal(data.chainId,'11155111');assert.equal(data.sender,p.runtime.accounts[0]);assert.equal(data.securityGeneration,'EXACT_PAYOUT_SET_V4');assert.deepEqual(p.data.constructors.find(c=>c.nonce===data.nonce),data,'PUBLIC_UNISWAP_MIXED_COMPILED_CONSTRUCTOR');
 const token=Object.freeze(Object.create(null)),grant={runtime:p.runtime,plan:p.plan,data:freeze(structuredClone(data)),active:true,signConsumed:p.reopening!==null};constructors.set(token,grant);
 return new Promise((resolve,reject)=>{p.pending={token,resolve,reject,delivered:false};emit(p,Object.freeze({kind:'CONSTRUCTOR',token}));});
}
export async function prepareOriginalSepoliaUniswapMixedSourceV4(runtime,target){
 assert.equal(arguments.length,2);assertOriginalSepoliaUniswapTargetSystemV4(runtime,target);const pending=birthWork.get(target);if(pending){assert.equal(pending.runtime,runtime);return pending.work;}const work={runtime,work:null};birthWork.set(target,work);work.work=prepareMixed(runtime,target).finally(()=>{if(birthWork.get(target)===work)birthWork.delete(target);});return work.work;
}
async function prepareMixed(runtime,target,reopening=null){
 await assertOriginalSepoliaUniswapTargetReadyV4(runtime,target);const binding=readOriginalSepoliaUniswapTargetSourceBindingV4(runtime,target),parent=binding.parent,prior=readOriginalFundedPagedGraphSepoliaDeploymentV4(runtime,parent),previous=births.get(target);
 if(previous){assert.equal(previous.runtime,runtime);state(runtime,previous.plan);return previous.plan;}
 const lane=readOriginalPagedSepoliaSourceLaneV4(runtime),startNonce=reopening===null?await runtime.nonce(runtime.accounts[0],'pending'):BigInt(reopening.plan.startNonce),configuration=normalizePagedDeploymentConfigurationDataV4(reopening?.plan.configuration??{...prior.configuration,deploymentDomain:fresh(),policy:fresh(),registryEpoch:target.target.registry.registryEpoch,rulesRoot:'0x'+target.rulesRoot,attesterKeys:target.target.registry.keys});
 assert.equal(target.rules.length,4);assert.notEqual(configuration.rulesRoot,prior.configuration.rulesRoot,'PUBLIC_UNISWAP_MIXED_NEW_RULES_REQUIRED');assert.deepEqual(configuration.attesterKeys,prior.configuration.attesterKeys);assert.equal(configuration.minimumDepositAtomic,parent.minimumDepositAtomic);
 const plan=Object.freeze(Object.create(null)),p={runtime,plan,target,parent,configuration,startNonce,policySHA256:reopening?.plan.policySHA256??hash(lane.policy),reopening,data:null,pending:null,event:null,waiter:null,closed:false,context:null,system:null};plans.set(plan,p);births.set(target,p);
 p.work=kernel.deploy(runtime,configuration,prior,null,{successor:true,startNonce,reopening,issueConstructor:data=>issue(p,data),setSuccessorConstructors(rows){
  assert.equal(rows.length,3);const data=freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_PLAN_V4',predecessor:parent.pool,targetPlanSHA256:target.planSHA256,keysetId:target.keysetId,policySHA256:p.policySHA256,configuration,startNonce:startNonce.toString(),constructors:structuredClone(rows),rules:target.rules,rulesRoot:target.rulesRoot,sharesOriginalVerifiers:true});p.data=freeze({...data,planSHA256:hash(data)});if(reopening)assert.deepEqual(p.data,reopening.plan,'PUBLIC_UNISWAP_MIXED_RECOMPILED_PLAN');
 }}).then(context=>{state(runtime,plan);if(reopening)assert.deepEqual(context.system,reopening.system,'PUBLIC_UNISWAP_MIXED_RECOMPILED_SYSTEM');assert.deepEqual(context.system.registry.keys,target.target.registry.keys);assert.equal(context.system.registry.rulesRoot,target.rulesRoot);p.context=context;p.sourceEntries=freeze(structuredClone(context.entries));p.sourceOwnPins=freeze(structuredClone(context.ownPins));p.sourceOwnArtifacts=freeze(structuredClone(context.ownArtifacts));p.system=context.system;systems.set(context.system,p);const completion=Object.freeze(Object.create(null));completions.set(completion,{runtime,plan,system:context.system});emit(p,Object.freeze({kind:'READY',system:context.system,completion}));}).catch(error=>emit(p,{kind:'ERROR',error}));return plan;
}
export async function readOriginalSepoliaUniswapMixedSourceStepV4(runtime,plan){
 assert.equal(arguments.length,2);const p=state(runtime,plan);assert.ok(!p.waiter&&!p.pending?.delivered,'PUBLIC_UNISWAP_MIXED_STEP_PENDING');const event=p.event??await new Promise(resolve=>p.waiter=resolve);p.event=null;state(runtime,plan);if(event.kind==='ERROR')throw event.error;if(event.kind==='CONSTRUCTOR'){assert.strictEqual(p.pending.token,event.token);p.pending.delivered=true;}return event;
}
export function readOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token){
 assert.equal(arguments.length,2);const g=constructors.get(token);assert.ok(g?.runtime===runtime&&g.active,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE_CONSTRUCTOR');const p=state(runtime,g.plan);assert.strictEqual(p.pending?.token,token);assert.ok(p.pending.delivered);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_CONSTRUCTOR_V4',plan:p.data,constructor:g.data});
}
export function consumeOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token){const g=constructors.get(token),data=readOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token);assert.ok(!g.signConsumed,'PUBLIC_UNISWAP_MIXED_SIGN_ALREADY_CONSUMED');g.signConsumed=true;return data;}
/** Fixed constructor preparation revalidates the actual original Target and
 * parent after RPC awaits; a copied constructor never reaches this reader. */
export async function readOriginalSepoliaUniswapMixedSourceInitializationV4(runtime,token){
 const data=readOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token),g=constructors.get(token),p=state(runtime,g.plan);await assertOriginalSepoliaUniswapTargetReadyV4(runtime,p.target);assert.deepEqual(readOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token),data);return data;
}
export async function consumeOriginalSepoliaUniswapMixedSourceInitializationV4(runtime,token){
 const data=await readOriginalSepoliaUniswapMixedSourceInitializationV4(runtime,token);assert.deepEqual(consumeOriginalSepoliaUniswapMixedSourceConstructorV4(runtime,token),data);return data;
}
export async function advanceOriginalSepoliaUniswapMixedSourceV4(runtime,plan,token,receipt){
 assert.equal(arguments.length,4);const p=state(runtime,plan),g=constructors.get(token),pending=p.pending;assert.ok(g?.runtime===runtime&&g.active&&pending?.token===token&&pending.delivered,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE_STEP');await runtime.checkReceipt(receipt);assert.equal(receipt.contractAddress?.toLowerCase(),g.data.expectedAddress);state(runtime,plan);assert.strictEqual(p.pending,pending);assert.ok(g.active);g.active=false;p.pending=null;pending.resolve(structuredClone(receipt));
}
export function assertOriginalSepoliaUniswapMixedSourceV4(runtime,system){
 assert.equal(arguments.length,2);const p=systems.get(system);assert.ok(p?.runtime===runtime&&p.system===system&&!p.closed,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE');state(runtime,p.plan);return system;
}
/** Only this instance's private birth map links a Source to its Target. Equal
 * registry/rule DATA from another original Source does not establish lineage. */
export function readOriginalSepoliaUniswapMixedSourceBindingV4(runtime,system){
 assert.equal(arguments.length,2);assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);const p=systems.get(system);return Object.freeze({target:p.target,parent:p.parent,plan:p.plan});
}
export function readOriginalSepoliaUniswapMixedSourceCompletionV4(runtime,token){
 assert.equal(arguments.length,2);const g=completions.get(token);assert.ok(g?.runtime===runtime,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE_COMPLETION');assertOriginalSepoliaUniswapMixedSourceV4(runtime,g.system);const p=state(runtime,g.plan);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_COMPLETION_V4',system:structuredClone(g.system),plan:p.data});
}
export async function closeOriginalSepoliaUniswapMixedSourcePlanV4(runtime,plan){
 assert.equal(arguments.length,2);const p=plans.get(plan);assert.ok(p?.runtime===runtime,'PUBLIC_UNISWAP_ORIGINAL_MIXED_SOURCE_PLAN');if(p.closed)return;p.closed=true;const error=Error('PUBLIC_UNISWAP_MIXED_SOURCE_CLOSED');if(p.pending){constructors.get(p.pending.token).active=false;p.pending.reject(error);p.pending=null;}if(p.waiter){p.waiter({kind:'ERROR',error});p.waiter=null;}await p.work;
}

/** Same fixed mechanical journal vocabulary, owned by a distinct Original
 * Mixed instance. Existing Native3 journal/system tokens are never promoted. */
export function readOriginalSepoliaUniswapMixedSourceDeploymentV4(runtime,system){
 assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);const p=systems.get(system),c=p.context;return Object.freeze({entries:p.sourceEntries,ownPins:p.sourceOwnPins,ownArtifacts:p.sourceOwnArtifacts,pool:c.pool,state:c.state,native:c.native,ledgerLeaves:c.ledgerLeaves,call:(kind,signature,args=[],block='latest')=>{assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);assert.ok(['pool','state','native'].includes(kind));return runtime.call({to:system[kind],data:staticData(p.sourceEntries[kind].artifact,signature,args)},block);}});
}
export async function assertOriginalSepoliaUniswapMixedSourceReadyV4(runtime,system){
 assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);const p=systems.get(system);await assertOriginalSepoliaUniswapTargetReadyV4(runtime,p.target);const head=await runtime.block('finalized');
 await Promise.all(system.deployments.map(async row=>{assert.ok(BigInt(row.receipt.blockNumber)<=BigInt(head.number),'PUBLIC_UNISWAP_MIXED_SOURCE_FINALITY_PENDING');const actual=await runtime.receipt(row.receipt.transactionHash);assert.deepEqual(actual,row.receipt,'PUBLIC_UNISWAP_MIXED_SOURCE_ORIGINAL_RECEIPT');await runtime.checkReceipt(actual);assert.equal(await runtime.code(row.address,head.number),row.expectedCode,'PUBLIC_UNISWAP_MIXED_SOURCE_CODE');}));await runtime.assertCanonical(head);assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);return system;
}
const sourceJournal=buildPagedSepoliaSourceJournalDataV4(Object.freeze({readOriginalHistoricalBalance:readOriginalPagedSepoliaHistoricalBalanceV4,readOriginalFinancialHistory:readOriginalPagedSepoliaSourceFinancialHistoryV5,assertOriginalSystem:(...args)=>assertOriginalSepoliaUniswapMixedSourceV4(...args),readOriginalSystem:(...args)=>readOriginalSepoliaUniswapMixedSourceDeploymentV4(...args),assertOriginalReceiverReady:(...args)=>assertOriginalSepoliaUniswapMixedSourceReadyV4(...args)}));
export async function createOriginalSepoliaUniswapMixedSourceJournalV4(runtime,system,input){
 assert.equal(arguments.length,3);assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);pagedOwnerExactV3(input,['origin','devicePublicKey','journal']);pagedOwnerExactV3(input.journal,['path','password']);const data=structuredClone(input),configSHA256=hash(data),previous=journalBirths.get(system);if(previous){assert.ok(previous.runtime===runtime&&previous.configSHA256===configSHA256,'PUBLIC_UNISWAP_MIXED_SOURCE_JOURNAL_ALREADY_BORN');const bundle=await previous.work;return sourceJournal.assertBundle(runtime,system,bundle);}const lane=readOriginalPagedSepoliaSourceLaneV4(runtime),birth={runtime,configSHA256,work:null};journalBirths.set(system,birth);birth.work=sourceJournal.createIndependent(runtime,system,data,lane.policy.expiresAt-30*60000);return birth.work;
}
export const reopenOriginalSepoliaUniswapMixedSourceJournalV4=(...args)=>sourceJournal.reopenMixed(...args);
export const assertOriginalSepoliaUniswapMixedSourceJournalV4=(...args)=>sourceJournal.assertBundle(...args);
export const issueOriginalSepoliaUniswapMixedSourcePermissionV4=(...args)=>sourceJournal.issue(...args);
export const consumeOriginalSepoliaUniswapMixedSourcePermissionV4=(...args)=>sourceJournal.consume(...args);
export const readOriginalSepoliaUniswapMixedSourcePermissionV4=(...args)=>sourceJournal.readPermission(...args);
export const readOriginalSepoliaUniswapMixedSourceDispatchAuthorizationV4=(...args)=>sourceJournal.readDispatchAuthorization(...args);
export const registerOriginalSepoliaUniswapMixedSourceProofV4=(...args)=>sourceJournal.register(...args);
export const registerOriginalSepoliaUniswapMixedSourceRetainedProofV4=(...args)=>sourceJournal.registerRetained(...args);
export const registerOriginalSepoliaUniswapMixedSourceAutomationProofV4=(...args)=>sourceJournal.registerAutomation(...args);
async function retainCommand(promise){const token=await promise;sourceCommands.add(token);return token;}
export const armOriginalSepoliaUniswapMixedSourceCommandV4=(...args)=>retainCommand(sourceJournal.arm(...args));
export const armOriginalSepoliaUniswapMixedSourceCutoffV4=(...args)=>retainCommand(sourceJournal.cutoff(...args));
export const armOriginalSepoliaUniswapMixedSourceAutomationCommandV4=(...args)=>retainCommand(sourceJournal.armAutomation(...args));
export const armOriginalSepoliaUniswapMixedSourceAutomationCutoffV4=(...args)=>retainCommand(sourceJournal.cutoffAutomation(...args));
/** Classification reads this canonical owner's private map only. It never
 * registers a caller token or converts command DATA into a permission. */
export function isOriginalSepoliaUniswapMixedSourceCommandV4(token){return sourceCommands.has(token);}
export const readOriginalSepoliaUniswapMixedSourceCommandV4=(...args)=>sourceJournal.readCommand(...args);
export const consumeOriginalSepoliaUniswapMixedSourceCommandV4=(...args)=>sourceJournal.consumeCommand(...args);
export const closeOriginalSepoliaUniswapMixedSourceJournalV4=(...args)=>sourceJournal.close(...args);

/** Retained compiled Mixed Source DATA; only a later Original Sup consumer may reopen. */
export async function retainOriginalSepoliaUniswapMixedSourceV4(runtime,system){
 assert.equal(arguments.length,2);await assertOriginalSepoliaUniswapMixedSourceReadyV4(runtime,system);const p=systems.get(system);assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);return freeze({profile:'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_RETENTION_V4',plan:structuredClone(p.data),system:structuredClone(system)});
}

/** Cold creation mode is selected only by this one-use Mixed Sup component.
 * Same protected receipts are replayed; new tokens cannot sign constructors. */
export async function prepareOriginalSepoliaUniswapMixedSourceReopenV4(runtime,target,mixedSourceToken){
 assert.equal(arguments.length,3);assertOriginalSepoliaUniswapTargetSystemV4(runtime,target);assert.ok(!births.has(target)&&!birthWork.has(target),'PUBLIC_UNISWAP_MIXED_SOURCE_ALREADY_OWNED');const saved=consumeOriginalPagedPublicUniswapMixedComponentV4(mixedSourceToken,'mixedSource');pagedOwnerExactV3(saved,['profile','plan','system']);assert.equal(saved.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_RETENTION_V4');assert.equal(saved.plan.profile,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_MIXED_SOURCE_PLAN_V4');assert.equal(saved.plan.keysetId,runtime.metadata.keysetId);assert.equal(saved.plan.targetPlanSHA256,target.planSHA256);assert.equal(saved.plan.predecessor,readOriginalSepoliaUniswapTargetSourceBindingV4(runtime,target).parent.pool);assert.match(saved.plan.startNonce,/^(?:0|[1-9][0-9]*)$/);const start=BigInt(saved.plan.startNonce);assert.ok(start+3n<1n<<64n);assert.ok(await runtime.nonce(runtime.accounts[0],'pending')>=start+3n,'PUBLIC_UNISWAP_MIXED_REOPEN_NONCE');assertOriginalPagedSepoliaSourcePolicyBirthV5(runtime,saved.plan.policySHA256);return prepareMixed(runtime,target,freeze(structuredClone(saved)));
}

/** Readonly metadata from the same live singleton; a clone never passes the
 * Original Source guard and this export issues no proof or financial token. */

export const replaceOriginalSepoliaUniswapMixedEmptySourceJournalV9=(...args)=>sourceJournal.replaceEmpty(...args);
export const readOriginalSepoliaUniswapMixedEmptyReplacementJournalV9=(...args)=>sourceJournal.readEmptyReplacement(...args);
export const assertOriginalSepoliaUniswapMixedEmptyReplacementJournalV9=(...args)=>sourceJournal.assertEmptyReplacement(...args);
export const assertOriginalSepoliaUniswapMixedSourceStorageJournalV9=(...args)=>sourceJournal.assertStorageBundle(...args);
export const readOriginalSepoliaUniswapMixedEmptyCurrentLineageV9=(...args)=>sourceJournal.readCurrentEmptyLineage(...args);
export const reopenOriginalSepoliaUniswapMixedEmptyPredecessorJournalV9=(...args)=>sourceJournal.reopenEmptyPredecessor(...args);
export const isOriginalSepoliaUniswapMixedEmptyPredecessorJournalV9=(...args)=>sourceJournal.isEmptyReplacementPredecessor(...args);

/** Only actual expired Source bundles can prepare a fresh bounded exit. */
export const prepareOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.prepareExpiredWithdrawalV10(...args);
export const readPreparationOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.readExpiredPreparationV10(...args);
export const assertPreparationOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.assertExpiredPreparationV10(...args);
export const closePreparationOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.closeExpiredPreparationV10(...args);
export const createOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.createExpiredWithdrawalV10(...args);
export const readOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.readExpiredWithdrawalV10(...args);
export const publishOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.publishExpiredWithdrawalV10(...args);
export async function reopenOriginalSepoliaUniswapMixedExpiredWithdrawalV10(runtime,system,sourceBundle,ownerCheckpoint,token){assert.equal(arguments.length,5);assertOriginalSepoliaUniswapMixedSourceV4(runtime,system);const S=await import('../recovery/paged-public-uniswap-mixed-supervisor-v4.mjs'),saved=await S.consumeOriginalPagedPublicUniswapExpiredMixedWithdrawalV10(token);return sourceJournal.reopenExpiredWithdrawalV10(runtime,system,sourceBundle,ownerCheckpoint,saved);}
export const openOutputOwnerOriginalSepoliaUniswapMixedExpiredWithdrawalV10=(...args)=>sourceJournal.openExpiredWithdrawalOutputOwnerV10(...args);
