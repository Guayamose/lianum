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
async function command(vault:any,graphApi:any,action:string,body:unknown,signal:AbortSignal,session?:object){
 current(signal);const descriptor=readDevicePagedGraphApiV3(graphApi),draft=await vault.graphCommand(action,body);let reply:any;
 try{current(signal);const arm=await vault.armGraphCommand(draft),consent=await graphApi.challenge(draft.action,draft.graphId,draft.jobId,draft.rootId,draft.revision,draft.command);current(signal);const signature=session?await signDevicePagedGraphExecutionPermissionV3(session,consent,signal,draft.command):await signWalletSessionPagedGraphV1(consent,descriptor.origin,descriptor.pairingId,signal);current(signal);await vault.consumeArmedGraphConsent(arm,consent);reply=await graphApi.submit(consent,signature,draft.command);current(signal);readDevicePagedGraphReplyV3(reply);await vault.acceptGraphReply(reply);current(signal);return reply.status;}finally{P.pagedOwnerWipeV3(draft.command);P.pagedOwnerWipeV3(reply?.private);}
}
/** Returns an actual original review; preparation authorizes no reservation or
 * payment. Missing replies remain in the existing Vault recovery fences. */
export async function prepareDevicePagedAgentOperationV4(input:{vault:any;graphApi:any;status:unknown;pairing:unknown;proposal:unknown;signal:AbortSignal;readerReadUntilMs?:number;maximumReads?:number}):Promise<object>{
 current(input.signal);const descriptor=readDevicePagedGraphApiV3(input.graphApi),plan=prepareDevicePagedAgentProposalPlanV4(input.pairing,input.proposal);need(JSON.stringify(plan.descriptor)===JSON.stringify(descriptor));const seed=await input.vault.prepareGraph(input.status,plan.terms);
 try{await command(input.vault,input.graphApi,'BEGIN_GRAPH',seed.command,input.signal);}finally{P.pagedOwnerWipeV3(seed.command);}
 for(const page of plan.pages){current(input.signal);await input.vault.prepareGraphPage(page);await command(input.vault,input.graphApi,'OBSERVE_GRAPH',{},input.signal);const request=await input.vault.graphNativePreparationCommand();try{await command(input.vault,input.graphApi,'PREPARE_NATIVE_PAGE',request,input.signal);}finally{P.pagedOwnerWipeV3(request);}const actions=await input.vault.graphNativeActions();let completed:any;try{completed=await input.vault.completeGraphPage(actions);}finally{P.pagedOwnerWipeV3(actions);P.pagedOwnerWipeV3(completed?.command);}await command(input.vault,input.graphApi,'OBSERVE_GRAPH',{},input.signal);const append=await input.vault.graphPageAppendCommand();try{await command(input.vault,input.graphApi,'APPEND_PAGE',append,input.signal);}finally{P.pagedOwnerWipeV3(append);}}
 await command(input.vault,input.graphApi,'SEAL_GRAPH',{},input.signal);const execution=await input.vault.graphExecutionReview(),review=readDevicePagedExecutionReviewV3(execution);const nodes=plan.pages.flat();need(review.budget===plan.terms.budget&&review.settleBefore===plan.terms.settleBefore&&review.steps.length===nodes.length&&review.steps.every((step,index)=>step.id===nodes[index].id&&step.reserve===nodes[index].amount&&JSON.stringify(step.intent)===JSON.stringify(nodes[index].intent)));const local=await input.vault.graphBuilderSummary();need(local.nodes.every((node:any,index:number)=>JSON.stringify(node.dependsOn)===JSON.stringify(nodes[index].dependsOn)));
 const agentReview=createDevicePagedAgentAutomationReviewV4(createDevicePagedAutomationReviewV4(execution),plan.agentPublicKey,input.maximumReads,input.readerReadUntilMs);prepared.set(agentReview,{vault:input.vault,graphApi:input.graphApi,plan,signal:input.signal});return agentReview;
}
/** One original approval precedes the first note/invoice signature. After
 * START the existing server worker continues; no per-node approval is added. */
export async function authorizeDevicePagedAgentOperationV4(rawReview:object,beforeStart?: (grant:DevicePagedSignedAgentReadGrantAnyV5)=>Promise<void>):Promise<{confirmation:'CONFIRMED'|'UNKNOWN';readerGrant:DevicePagedSignedAgentReadGrantAnyV5;status:any|null}>{
 const original=prepared.get(rawReview);need(original);const own=original!;current(own.signal);readDevicePagedAgentAutomationReviewV4(rawReview);let execution:any=null,session:object|undefined;
 const refresh=async()=>{await command(own.vault,own.graphApi,'OBSERVE_GRAPH',{},own.signal);execution=await own.vault.graphExecutionReview();return execution;};
 try{session=await openDevicePagedGraphAgentAutomationSessionV4(rawReview,own.signal,refresh);current(own.signal);need(execution);await own.vault.beginExecutionStorage(execution,session);for(let i=0;i<6;i++){const summary=await own.vault.graphSummary();if(summary.phase!=='SIGNING')break;const plan=await own.vault.graphSignaturePlan(),signed=await own.vault.graphSignatureCommand(plan.pageIndex,plan.finish);try{await command(own.vault,own.graphApi,'SIGN_GRAPH',signed,own.signal,session);}finally{P.pagedOwnerWipeV3(signed);}}need((await own.vault.graphSummary()).phase==='PREPARED');const readerGrant=await signDevicePagedAgentReadGrantV4(session,own.signal),request=readDevicePagedGraphExecutionSessionV3(session).automation!;if(beforeStart){await beforeStart(readerGrant);current(own.signal);}prepared.delete(rawReview);try{const status=await command(own.vault,own.graphApi,'START_AUTOMATION',request,own.signal,session);return{confirmation:'CONFIRMED',readerGrant,status};}catch(error){if(own.graphApi.isUnconfirmedReply(error))return{confirmation:'UNKNOWN',readerGrant,status:null};throw error;}}
 finally{await own.vault.endExecutionStorage();if(session)closeDevicePagedGraphExecutionSessionV3(session);}
}
/** Read-only original re-entry. A saved read grant never proves START was
 * accepted, and this observation never repeats or signs START. */
export async function observeDevicePagedAgentOperationStartV4(vault:any,graphApi:any,grant:DevicePagedSignedAgentReadGrantAnyV5,signal:AbortSignal){
 current(signal);let value=await vault.graphAutomationStatus();if(value?.current!==true){await command(vault,graphApi,'OBSERVE_GRAPH',{},signal);value=await vault.graphAutomationStatus();}current(signal);need(value?.current===true&&JSON.stringify(value.terms)===JSON.stringify(grant.grant.terms));return value;
}
