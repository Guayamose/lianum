/** Fixed SAME-session TLS client. No native keys, automatic retry or resume. */
import {normalizeNativeClaimDeviceDescriptorV1,normalizeNativeClaimDevicePermissionV1,
 validateNativeClaimDevicePermissionFreshV1,normalizeNativeClaimDeviceSignatureV1,
 normalizeNativeClaimDeviceObservationV1,normalizeNativeClaimDeviceReconcileV1}
 from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
const fail=()=>{throw Error('MOBILE_NATIVE_CLAIM_REJECTED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),observations=new WeakMap();
export function readNativeClaimDeviceObservationV1(value){const retained=observations.get(value),now=Date.now();
 if(!retained||!Number.isSafeInteger(now)||now<value.observedAt||now>=retained.expiresAt)fail();return value;}
export function createNativeClaimDeviceApiV1({descriptor,fetchImpl=globalThis.fetch}={}){
 const original=normalizeNativeClaimDeviceDescriptorV1(descriptor);if(typeof fetchImpl!=='function')fail();
 const permissions=new WeakMap(),controllers=new Set();let closed=false;
 function live(){if(closed)fail();}
 function scope(v){live();const p=validateNativeClaimDevicePermissionFreshV1(v);if(!same(p.descriptor,original))fail();return p;}
 async function post(path,payload){live();const controller=new AbortController();controllers.add(controller);let timer,reader;
  try{const target=original.origin+'/v1/mobile/native-claims/'+path;
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MOBILE_NATIVE_CLAIM_TIMEOUT'));},15000);});
   return await Promise.race([(async()=>{const response=await fetchImpl(target,{method:'POST',headers:{Accept:'application/json',Origin:original.origin,'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});live();
    if(controller.signal.aborted||!response.ok||response.redirected||response.url&&response.url!==target||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))fail();
    const length=response.headers.get('content-length');if(length!==null&&(/^(0|[1-9][0-9]{0,5})$/.exec(length)?.[0]!==length||Number(length)>65536))fail();
    if(!response.body||typeof response.body.getReader!=='function')fail();reader=response.body.getReader();const bytes=new Uint8Array(65536);let used=0;
    try{for(;;){const part=await reader.read();live();if(controller.signal.aborted)fail();if(part.done)break;if(!(part.value instanceof Uint8Array)||used+part.value.byteLength>bytes.length)fail();bytes.set(part.value,used);used+=part.value.byteLength;}
     if(length!==null&&used!==Number(length))fail();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));}finally{bytes.fill(0);}
   })(),timeout]);
  }finally{clearTimeout(timer);controller.abort();controllers.delete(controller);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 async function consume(permission,signature,action){const retained=permissions.get(permission);
  if(!retained||retained.consumed||permission.action!==action)fail();scope(permission);
  signature=normalizeNativeClaimDeviceSignatureV1(signature);retained.consumed=true;
  const raw=await post('operations',{permission,signature});live();
  const value=action==='READ_CLAIM_JOURNAL'?normalizeNativeClaimDeviceObservationV1(raw):normalizeNativeClaimDeviceReconcileV1(raw);
  if(!same(value.descriptor,original)||value.permissionId!==permission.challengeId)fail();
  if(action==='READ_CLAIM_JOURNAL'){scope(permission);if(value.expiresAt!==permission.expiresAt)fail();observations.set(value,{expiresAt:permission.expiresAt});}
  else if(value.requestId!==permission.requestId)fail();return value;
 }
 return Object.freeze({
  async challenge(action='READ_CLAIM_JOURNAL',requestId=null){if(arguments.length>2||!['READ_CLAIM_JOURNAL','RECONCILE_CLAIM_REQUEST'].includes(action))fail();
   const value=normalizeNativeClaimDevicePermissionV1(await post('challenges',{action,requestId}));scope(value);
   if(value.action!==action||value.requestId!==requestId)fail();permissions.set(value,{consumed:false});return value;},
  read(permission,signature){if(arguments.length!==2)fail();return consume(permission,signature,'READ_CLAIM_JOURNAL');},
  reconcile(permission,signature){if(arguments.length!==2)fail();return consume(permission,signature,'RECONCILE_CLAIM_REQUEST');},
  close(){if(arguments.length!==0)fail();closed=true;for(const controller of controllers)controller.abort();return{closed:true};},
 });
}
