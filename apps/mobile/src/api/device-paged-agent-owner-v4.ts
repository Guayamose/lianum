import {prepareDevicePagedExecutorPayoutsV5,prepareDevicePagedExecutorInvoicesV5} from './device-paged-executor-payout-flow-v5.ts';
import type {DevicePagedAgentReadGrantAnyV5,DevicePagedSignedAgentReadGrantAnyV5} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
/** Owner-side orchestration. The external agent supplies public proposal DATA;
 * actual mobile custody prepares, reviews and signs its existing operation. */
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {readDevicePagedGraphReplyV3,readDevicePagedGraphApiV3} from './device-paged-graph-api-v3.mjs';
import {prepareDevicePagedAgentProposalPlanV4} from './device-paged-agent-proposal-v4.mjs';
import {readDevicePagedGraphExecutionSessionV3} from '../custody/device-paged-permission-v3.mjs';
import {createDevicePagedAutomationReviewV4,readDevicePagedExecutionReviewV3} from '../custody/device-paged-custody-views-v3.mjs';
import {createDevicePagedAgentAutomationReviewV4,readDevicePagedAgentAutomationReviewV4} from '../custody/device-paged-agent-review-v4.mjs';
import {signWalletSessionPagedGraphV1} from '../custody/wallet-session-v1.ts';
import {openDevicePagedGraphAgentAutomationSessionV4,signDevicePagedAgentReadGrantV4,signDevicePagedGraphExecutionPermissionV3,closeDevicePagedGraphExecutionSessionV3} from '../custody/key-store.ts';
const need=(value:unknown)=>{if(!value)throw Error('MOBILE_PAGED_AGENT_OWNER');};
const prepared=new WeakMap<object,{vault:any;graphApi:any;plan:any;signal:AbortSignal}>();
function current(signal:AbortSignal){need(signal instanceof AbortSignal&&!signal.aborted);}
async function dispatch(vault:any,graphApi:any,draft:any,signal:AbortSignal,session?:object){
 current(signal);const descriptor=readDevicePagedGraphApiV3(graphApi);let reply:any;
 try{const arm=await vault.armGraphCommand(draft),consent=await graphApi.challenge(draft.action,draft.graphId,draft.jobId,draft.rootId,draft.revision,draft.command);current(signal);const signature=session?await signDevicePagedGraphExecutionPermissionV3(session,consent,signal,draft.command):await signWalletSessionPagedGraphV1(consent,descriptor.origin,descriptor.pairingId,signal);current(signal);await vault.consumeArmedGraphConsent(arm,consent);reply=await graphApi.submit(consent,signature,draft.command);current(signal);readDevicePagedGraphReplyV3(reply);await vault.acceptGraphReply(reply);current(signal);return reply.status;}finally{P.pagedOwnerWipeV3(draft.command);P.pagedOwnerWipeV3(reply?.private);}
}
async function command(vault:any,graphApi:any,action:string,body:unknown,signal:AbortSignal,session?:object){
 return dispatch(vault,graphApi,await vault.graphCommand(action,body),signal,session);
}
function assertPreparation(plan:any,local:any){
 need(JSON.stringify(local.terms)===JSON.stringify(plan.terms));
 need(local.pages.length<=plan.pages.length);
 const compare=(rows:any[],index:number)=>{const expected=plan.pages[index];need(expected&&rows.length===expected.length);for(let i=0;i<rows.length;i++){const row=rows[i],node=expected[i];for(const key of ['id','chainDomain','evidencePolicy','amount','dependsOn','intent'])need(JSON.stringify(row[key])===JSON.stringify(node[key]));need(row.ordinal===String(index*64+i));}};
 for(const [index,page] of local.pages.entries()){need(page.pageIndex===String(index));compare(page.nodes,index);}
 if(local.pendingPage){need(local.pendingPage.pageIndex===String(local.pages.length));compare(local.pendingPage.nodes,local.pages.length);}
}
/** Re-entry uses the original persisted keys/pages. Observation decides whether
 * BEGIN/APPEND/SEAL reached the server; no financial approval is acquired here. */
export async function prepareDevicePagedAgentOperationV4(input:{vault:any;graphApi:any;status:any;pairing:unknown;proposal:unknown;signal:AbortSignal;readerReadUntilMs?:number;maximumReads?:number;retainGraphId?:(graphId:string)=>Promise<void>}):Promise<object>{
 current(input.signal);const {vault,graphApi,signal}=input,descriptor=readDevicePagedGraphApiV3(graphApi),plan=prepareDevicePagedAgentProposalPlanV4(input.pairing,input.proposal);need(JSON.stringify(plan.descriptor)===JSON.stringify(descriptor));
 let graph=await vault.graphSummary();
 if(graph===null){
  const seed=await vault.prepareGraph(input.status,plan.terms,(input.pairing as any)?.nativePreparation?.executorPayoutsV5?{executorPayoutsV5:true}:undefined);
  try{await input.retainGraphId?.(seed.graphId);await command(vault,graphApi,'BEGIN_GRAPH',seed.command,signal);}finally{P.pagedOwnerWipeV3(seed.command);}
 }else{
  const local=await vault.graphAgentPreparationDataV5();assertPreparation(plan,local);await input.retainGraphId?.(local.graphId);
  if(input.status.note?.state==='LIVE'){
   if(graph.pending?.action==='BEGIN_GRAPH')await dispatch(vault,graphApi,await vault.resumeGraphBegin(input.status),signal);
   else{
    // A prior BEGIN command may have been armed but not sent, with no pending
    // marker. Reuse it when present; only seed-only storage uses the new port.
    if(local.hasBeginCommand)await dispatch(vault,graphApi,await vault.resumeGraphBegin(input.status),signal);
    else{const seed=await vault.graphInitialBeginCommandV5(input.status);try{await command(vault,graphApi,'BEGIN_GRAPH',seed.command,signal);}finally{P.pagedOwnerWipeV3(seed.command);}}
   }
  }else await command(vault,graphApi,'OBSERVE_GRAPH',{},signal);
 }
 await command(vault,graphApi,'OBSERVE_GRAPH',{},signal);graph=await vault.graphSummary();
 need(['BUILDING','SIGNING','PREPARED'].includes(graph.phase));
 while(graph.phase==='BUILDING'){
  current(signal);let local=await vault.graphAgentPreparationDataV5();assertPreparation(plan,local);
  const accepted=Number(graph.status.pages);need(Number.isSafeInteger(accepted)&&accepted>=0&&accepted<=local.pages.length&&local.pages.length<=accepted+1);
  if(local.pages.length>accepted){const append=await vault.graphPageAppendCommand();try{await command(vault,graphApi,'APPEND_PAGE',append,signal);}finally{P.pagedOwnerWipeV3(append);}}
  else if(local.pages.length<plan.pages.length){
   if(!local.pendingPage)await vault.prepareGraphPage(plan.pages[local.pages.length]);
   local=await vault.graphAgentPreparationDataV5();assertPreparation(plan,local);
   await prepareDevicePagedExecutorPayoutsV5(vault,(action,body)=>command(vault,graphApi,action,body,signal));
   const request=await vault.graphNativePreparationCommand();try{await command(vault,graphApi,'PREPARE_NATIVE_PAGE',request,signal);}finally{P.pagedOwnerWipeV3(request);}
   const actions=await vault.graphNativeActions();let completed:any;try{completed=await vault.completeGraphPage(actions);}finally{P.pagedOwnerWipeV3(actions);P.pagedOwnerWipeV3(completed?.command);}
  }else{need(local.pendingPage===null);await command(vault,graphApi,'SEAL_GRAPH',{},signal);}
  await command(vault,graphApi,'OBSERVE_GRAPH',{},signal);graph=await vault.graphSummary();
 }
 const local=await vault.graphAgentPreparationDataV5();assertPreparation(plan,local);need(local.pendingPage===null&&local.pages.length===plan.pages.length);
 const execution=await vault.graphExecutionReview(),review=readDevicePagedExecutionReviewV3(execution),nodes=plan.pages.flat();need(review.budget===plan.terms.budget&&review.settleBefore===plan.terms.settleBefore&&review.steps.length===nodes.length&&review.steps.every((step,index)=>step.id===nodes[index].id&&step.reserve===nodes[index].amount&&JSON.stringify(step.intent)===JSON.stringify(nodes[index].intent)));
 const agentReview=createDevicePagedAgentAutomationReviewV4(createDevicePagedAutomationReviewV4(execution),plan.agentPublicKey,input.maximumReads,input.readerReadUntilMs);prepared.set(agentReview,{vault,graphApi,plan,signal});return agentReview;
}
/** One original approval precedes the first note/invoice signature. After
 * START the existing server worker continues; no per-node approval is added. */
export async function authorizeDevicePagedAgentOperationV4(rawReview:object,beforeStart?: (grant:DevicePagedSignedAgentReadGrantAnyV5)=>Promise<void>):Promise<{confirmation:'CONFIRMED'|'UNKNOWN';readerGrant:DevicePagedSignedAgentReadGrantAnyV5;status:any|null}>{
 const original=prepared.get(rawReview);need(original);const own=original!;current(own.signal);readDevicePagedAgentAutomationReviewV4(rawReview);let execution:any=null,session:object|undefined;
 const refresh=async()=>{await command(own.vault,own.graphApi,'OBSERVE_GRAPH',{},own.signal);execution=await own.vault.graphExecutionReview();return execution;};
 try{session=await openDevicePagedGraphAgentAutomationSessionV4(rawReview,own.signal,refresh);current(own.signal);need(execution);await own.vault.beginExecutionStorage(execution,session);for(let i=0;i<6;i++){const summary=await own.vault.graphSummary();if(summary.phase!=='SIGNING')break;await prepareDevicePagedExecutorInvoicesV5(own.vault,(action,body)=>command(own.vault,own.graphApi,action,body,own.signal,session));const plan=await own.vault.graphSignaturePlan(),signed=await own.vault.graphSignatureCommand(plan.pageIndex,plan.finish);try{await command(own.vault,own.graphApi,'SIGN_GRAPH',signed,own.signal,session);}finally{P.pagedOwnerWipeV3(signed);}}need((await own.vault.graphSummary()).phase==='PREPARED');const readerGrant=await signDevicePagedAgentReadGrantV4(session,own.signal),request=readDevicePagedGraphExecutionSessionV3(session).automation!;if(beforeStart){await beforeStart(readerGrant);current(own.signal);}prepared.delete(rawReview);try{const status=await command(own.vault,own.graphApi,'START_AUTOMATION',request,own.signal,session);return{confirmation:'CONFIRMED',readerGrant,status};}catch(error){if(own.graphApi.isUnconfirmedReply(error))return{confirmation:'UNKNOWN',readerGrant,status:null};throw error;}}
 finally{await own.vault.endExecutionStorage();if(session)closeDevicePagedGraphExecutionSessionV3(session);}
}
/** Read-only original re-entry. A saved read grant never proves START was
 * accepted, and this observation never repeats or signs START. */
export async function observeDevicePagedAgentOperationStartV4(vault:any,graphApi:any,grant:DevicePagedSignedAgentReadGrantAnyV5,signal:AbortSignal){
 current(signal);let value=await vault.graphAutomationStatus();if(value?.current!==true){await command(vault,graphApi,'OBSERVE_GRAPH',{},signal);value=await vault.graphAutomationStatus();}current(signal);need(value?.current===true&&JSON.stringify(value.terms)===JSON.stringify(grant.grant.terms));return value;
}
