import {createDevicePagedConnectionTransportV3,parseDevicePagedConnectionProfileV3} from './device-paged-connection-transport-v3.ts';
import {createDevicePagedOwnerApiV3} from './device-paged-owner-api-v3.mjs';
import {createDevicePagedGraphApiV3} from './device-paged-graph-api-v3.mjs';
import {openExistingDevicePagedCustodyV3} from '../custody/device-paged-note-vault-v3.ts';
import {readDevicePublicKey,signDevicePagedOwnerPermissionV3} from '../custody/key-store.ts';
import {prepareDevicePagedAgentProposalPlanV4} from './device-paged-agent-proposal-v4.mjs';
import {prepareDevicePagedAgentOperationV4,authorizeDevicePagedAgentOperationV4,observeDevicePagedAgentOperationStartV4} from './device-paged-agent-owner-v4.ts';
import {readDevicePagedAgentAutomationReviewV4} from '../custody/device-paged-agent-review-v4.mjs';
import {createNativeDevicePagedAgentPublicStoreV4,createNativeDevicePagedAgentPreparationStoreV5} from '../state/device-paged-agent-public-store-v4.ts';
import {devicePagedAgentDescriptorSHA256V4,devicePagedAgentProposalDigestV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
import {createDevicePagedAgentSavedOperationV4,devicePagedAgentReadConnectionExportV4,type DevicePagedAgentSavedOperationV4} from './device-paged-agent-public-operation-v4.mjs';
const need=(value:unknown,code='MOBILE_PAGED_AGENT_UI')=>{if(!value)throw Error(code);};
/** One original connection/custody owner, opened only by an explicit action.
 * No caller-supplied fetch, custody factory or source substitution exists. */
export function createDevicePagedAgentUiControllerV4(profile:string,signal:AbortSignal){
 const packet=parseDevicePagedConnectionProfileV3(profile),store=createNativeDevicePagedAgentPublicStoreV4(packet.descriptor),preparationStore=createNativeDevicePagedAgentPreparationStoreV5(packet.descriptor);let held:any=null,review:object|null=null,proposal:unknown=null,tail:Promise<unknown>=Promise.resolve(),closed=false,closing:Promise<void>|null=null;
 const live=()=>{need(!closed&&!signal.aborted,'MOBILE_PAGED_AGENT_CANCELLED');};
 const serial=<T>(f:()=>Promise<T>)=>{const result=tail.then(async()=>{live();return f();});tail=result.catch(()=>{});return result;};
 async function stop(s:any){if(!s)return;await Promise.allSettled([s.api?.close(),s.graphApi?.close()]);try{await s.vault?.close();}finally{await s.transport?.close();}}
 async function open(){if(held)return held;live();need(Date.now()<packet.descriptor.deadlineMs,'MOBILE_PAGED_AGENT_SOURCE_READ_ONLY');need(await readDevicePublicKey()===packet.descriptor.devicePublicKey,'MOBILE_PAGED_AGENT_IDENTITY');live();const transport=await createDevicePagedConnectionTransportV3(packet,signal),api=createDevicePagedOwnerApiV3({descriptor:packet.descriptor,fetchImpl:transport.fetchImpl}),graphApi=createDevicePagedGraphApiV3({descriptor:packet.descriptor,fetchImpl:transport.fetchImpl});let vault:any=null;
  try{const pairing=await graphApi.pairing();live();vault=await openExistingDevicePagedCustodyV3(packet.descriptor,'GRAPH',signal);live();held={transport,api,graphApi,vault,pairing};return held;}catch(error){await stop({transport,api,graphApi,vault});throw error;}
 }
 async function noteRead(s:any){await s.vault.beginReadStorage(signal);try{const draft=await s.vault.readDraft();live();const consent=await s.api.challenge(draft);live();const signature=await signDevicePagedOwnerPermissionV3(consent,packet.descriptor.origin,packet.descriptor.pairingId,signal);live();const status=await s.api.submit(consent,signature);live();await s.vault.acceptStatus(status);live();return status;}finally{await s.vault.endReadStorage();}}
 return Object.freeze({
  saved:()=>serial(()=>store.read()),
  preparation:()=>serial(()=>preparationStore.read()),
  prepare:(signed:unknown,readUntilMs?:number)=>serial(async()=>{
   need(review===null,'MOBILE_PAGED_AGENT_ALREADY_PREPARED');need(await store.read()===null,'MOBILE_PAGED_AGENT_ALREADY_AUTHORIZED');
   const s=await open(),plan=prepareDevicePagedAgentProposalPlanV4(s.pairing,signed);let association=await preparationStore.read();const graph=await s.vault.graphSummary();
   need(graph===null||association!==null,'MOBILE_PAGED_AGENT_EXISTING_OPERATION');
   if(association){need(association.proposalSHA256===plan.proposalSHA256,'MOBILE_PAGED_AGENT_PREPARATION_BINDING');if(association.graphId!==null)need(graph?.graphId===association.graphId,'MOBILE_PAGED_AGENT_PREPARATION_BINDING');}
   const status=await noteRead(s),source=await s.vault.summary();
   if(association)need(source.rootId===association.source.rootId&&source.noteRevision===association.source.revision,'MOBILE_PAGED_AGENT_PREPARATION_BINDING');
   else{need(await s.vault.graphSummary()===null,'MOBILE_PAGED_AGENT_EXISTING_OPERATION');association=await preparationStore.save({profile:'DEVICE_PAGED_AGENT_PREPARATION_V5',descriptorSHA256:devicePagedAgentDescriptorSHA256V4(packet.descriptor),proposalSHA256:devicePagedAgentProposalDigestV4((signed as any).proposal),proposal:signed,source:{rootId:source.rootId,revision:source.noteRevision},graphId:null,maximumReads:4096,readUntilMs:readUntilMs??null});}
   need(association);const retained=association!;
   review=await prepareDevicePagedAgentOperationV4({vault:s.vault,graphApi:s.graphApi,pairing:s.pairing,status,proposal:retained.proposal,signal,...(retained.readUntilMs===null?{}:{readerReadUntilMs:retained.readUntilMs}),maximumReads:retained.maximumReads,retainGraphId:async graphId=>{need(retained.graphId===null||retained.graphId===graphId,'MOBILE_PAGED_AGENT_PREPARATION_BINDING');await preparationStore.save({...retained,graphId});live();}});
   proposal=retained.proposal;live();return readDevicePagedAgentAutomationReviewV4(review);
  }),
  authorize:()=>serial(async()=>{need(review&&held,'MOBILE_PAGED_AGENT_NO_REVIEW');const original=review!;review=null;let saved:DevicePagedAgentSavedOperationV4|null=null;const result=await authorizeDevicePagedAgentOperationV4(original,async grant=>{saved=createDevicePagedAgentSavedOperationV4(packet,proposal,grant,'UNCONFIRMED');await store.save(saved);live();});live();if(result.confirmation==='CONFIRMED'){await observeDevicePagedAgentOperationStartV4(held.vault,held.graphApi,result.readerGrant,signal);saved={...saved!,confirmation:'CONFIRMED'};await store.save(saved);}return{confirmation:result.confirmation,record:saved};}),
  exportReadAccess:()=>serial(async()=>{const record=await store.read();need(record,'MOBILE_PAGED_AGENT_NO_SAVED_GRANT');const s=await open(),observed=await observeDevicePagedAgentOperationStartV4(s.vault,s.graphApi,record!.readerGrant,signal);need(observed.revoked===false,'MOBILE_PAGED_AGENT_OPERATION_STOPPED');const confirmed={...record!,confirmation:'CONFIRMED' as const};await store.save(confirmed);live();return devicePagedAgentReadConnectionExportV4(confirmed,packet.descriptor);}),
  close(){if(closing)return closing;closed=true;review=null;proposal=null;closing=tail.catch(()=>{}).then(async()=>{const original=held;held=null;await stop(original);});return closing;}
 });
}
