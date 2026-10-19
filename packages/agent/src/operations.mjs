import {createDevicePagedAgentSavedOperationV4,normalizeDevicePagedAgentSavedOperationV4} from '@lianum/sdk/agent/operation';
import {devicePagedAgentReadUntilMsV5} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
import {normalizeDevicePagedAgentProgressAnyV5,validateDevicePagedAgentProgressFreshAnyV5} from '@lianum/mobile-protocol/device/paged-agent-v4';
import {exact,need,ownerId} from './validation.mjs';

/** This worker holds only finite device-signed progress grants. It cannot
 * prepare, approve, send, rebroadcast, cancel or renew a financial operation. */
export function createAgentOperations({store,observe=null,origin=null,now=Date.now}){
 need(observe===null||typeof observe==='function','CONFIGURATION');
 const active=new Map();let closed=false;
 const summary=owner=>store.operations(owner);
 function register(state,body){
  need(observe&&origin,'OPERATION_TRACKING_UNAVAILABLE');exact(body,['record']);
  const key=body.record?.proposalSHA256;ownerId(key);const operation=store.operation(state.owner,key);need(operation,'OPERATION_NOT_FOUND');
  const expected=normalizeDevicePagedAgentSavedOperationV4(body.record,operation.connection.descriptor);
  need(JSON.stringify(expected.connection)===JSON.stringify(operation.connection)&&expected.connection.descriptor.devicePublicKey===state.publicKey&&expected.connection.descriptor.origin===origin,'OPERATION_BINDING');
  const verified=createDevicePagedAgentSavedOperationV4(operation.connection,operation.proposal,expected.readerGrant,expected.confirmation);
  need(verified.proposalSHA256===key&&devicePagedAgentReadUntilMsV5(verified.readerGrant.grant)>now(),'OPERATION_BINDING');
  if(operation.record){need(JSON.stringify(operation.record.readerGrant)===JSON.stringify(verified.readerGrant),'OPERATION_BINDING');return {registered:true,id:key,financialPermission:false,operations:summary(state.owner)};}
  store.updateOperation(state.owner,key,current=>{current.record=verified;current.status='AUTHORIZATION_UNCONFIRMED';current.tracking='ACTIVE';current.expiresAt=devicePagedAgentReadUntilMsV5(verified.readerGrant.grant);current.readsUsed=0;current.failures=0;current.nextCheckAt=now();});
  return {registered:true,id:key,financialPermission:false,operations:summary(state.owner)};
 }
 function control(state,path,body){
  exact(body,['id']);ownerId(body.id);const operation=store.operation(state.owner,body.id);need(operation,'OPERATION_NOT_FOUND');
  if(path.endsWith('/stop'))store.updateOperation(state.owner,body.id,current=>{current.tracking='STOPPED';current.nextCheckAt=Number.MAX_SAFE_INTEGER;});
  else{
   need(observe&&operation.record&&operation.expiresAt>now()&&operation.readsUsed<operation.record.readerGrant.grant.maximumReads&&!['COMPLETED','RECOVERED','REVOKED'].includes(operation.status),'OPERATION_RECOVERY_UNAVAILABLE');
   store.updateOperation(state.owner,body.id,current=>{current.tracking='ACTIVE';current.failures=0;current.error=null;current.nextCheckAt=now();});
  }
  return {id:body.id,financialPermission:false,operations:summary(state.owner)};
 }
 const announce=(owner,id,kind,text,data={})=>store.append(owner,{remoteId:'operation:'+id+':'+kind,text,data:{operationId:id,network:'testnet',...data,action:{target:'approvals',label:'Ver operación'}},phase:'final_answer'});
 async function check(row,signal){
  const owner=row.owner,key=row.id;
  try{
   if(!row.record||row.tracking!=='ACTIVE')return;
   if(row.expiresAt<=now()||row.readsUsed>=row.record.readerGrant.grant.maximumReads){store.transaction(()=>{const current=store.operation(owner,key);if(current.tracking!=='ACTIVE')return;store.updateOperation(owner,key,value=>{value.tracking='EXPIRED';value.error='NATIVE_AGENT_READ_ACCESS_ENDED';});announce(owner,key,'read-ended','El acceso de consulta de tu operación ha terminado. Abre la operación en la app para comprobar su estado.');});return;}
   const agentKey=store.identity(owner);let observation;try{observation=await observe({record:row.record,key:agentKey,signal});}finally{agentKey.fill(0);}
   if(signal.aborted)return;
   const progress=normalizeDevicePagedAgentProgressAnyV5(observation.progress);validateDevicePagedAgentProgressFreshAnyV5(progress);
   need(observation.grantId===row.record.readerGrant.grant.grantId&&Number.isSafeInteger(observation.readsUsed)&&observation.readsUsed>row.readsUsed&&observation.readsUsed<=row.record.readerGrant.grant.maximumReads&&JSON.stringify(progress.automation?.terms)===JSON.stringify(row.record.readerGrant.grant.terms),'OPERATION_OBSERVATION');
   const completed=Number(progress.execution?.completed??'0'),total=Number(progress.execution?.total??row.nodeCount);need(Number.isSafeInteger(completed)&&Number.isSafeInteger(total)&&total===row.nodeCount&&completed<=total,'OPERATION_OBSERVATION');
   const status=progress.automation.revoked?'REVOKED':progress.phase==='RECOVERED'?'RECOVERED':progress.phase==='FULFILLED'&&!progress.pending&&completed===total?'COMPLETED':progress.phase==='RESERVED'?'RUNNING':'AUTHORIZED';
   store.transaction(()=>{
    const current=store.operation(owner,key);if(current.tracking!=='ACTIVE'||current.record.readerGrant.grant.grantId!==row.record.readerGrant.grant.grantId)return;
    const changed=current.status!==status||current.completed!==completed;
    store.updateOperation(owner,key,value=>{value.status=status;value.completed=completed;value.total=total;value.lastObservedAt=progress.observed.issuedAt;value.readsUsed=observation.readsUsed;value.failures=0;value.error=null;value.tracking=['COMPLETED','RECOVERED','REVOKED'].includes(status)?'FINISHED':'ACTIVE';value.nextCheckAt=value.tracking==='ACTIVE'?now()+30000:Number.MAX_SAFE_INTEGER;});
    if(changed){const text=status==='COMPLETED'?'Todos los pagos de tu operación están confirmados.':status==='RECOVERED'?'La operación figura recuperada. Puedes revisar su resultado en la app.':status==='REVOKED'?'La autorización de continuación de esta operación está revocada. Revisa los pagos ya realizados en la app.':status==='AUTHORIZED'?'El servidor ha confirmado la autorización de tu operación. Seguiré consultando su progreso.':completed+' de '+total+' pagos confirmados. La operación sigue en curso.';announce(owner,key,status+':'+completed,text,{completed,total});}
   });
  }catch{
   if(signal.aborted)return;
   store.transaction(()=>{const current=store.operation(owner,key);if(current?.tracking!=='ACTIVE')return;const failures=(current.failures??0)+1;store.updateOperation(owner,key,value=>{value.failures=failures;value.error='NATIVE_AGENT_OPERATION_STATUS_UNCONFIRMED';value.tracking=failures>=3?'NEEDS_REVIEW':'ACTIVE';value.nextCheckAt=failures>=3?Number.MAX_SAFE_INTEGER:now()+Math.min(120000,10000*2**failures);});if(failures===3)announce(owner,key,'unconfirmed:'+String(current.lastObservedAt??0),'No he podido actualizar el estado de tu operación. Su último resultado está guardado; puedes reintentar la consulta desde el agente.');});
  }
 }
 return Object.freeze({configured:Boolean(observe&&origin),register,control,
  async tick(){if(closed||!observe)return;const work=[];for(const row of store.claimOperations()){const id=row.owner+':'+row.id;if(active.has(id))continue;const controller=new AbortController(),promise=check(row,controller.signal).finally(()=>active.delete(id));active.set(id,{controller,promise});work.push(promise);}await Promise.allSettled(work);},
  async close(){closed=true;for(const entry of active.values())entry.controller.abort();await Promise.allSettled([...active.values()].map(entry=>entry.promise));}
 });
}
