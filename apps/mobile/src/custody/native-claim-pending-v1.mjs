/** Protected local recovery pointer. It has no signing or economic authority.
 * Writes precede the first POST; reopening only selects the original request.
 * SecureStore has no cross-process CAS/anti-rollback guarantee. */
import {normalizeNativeClaimDeviceDescriptorV1,validateNativeClaimDevicePermissionFreshV1,
 normalizeNativeClaimDeviceSignatureV1,nativeClaimDevicePermissionMessageV1}
 from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
import {readNativeClaimDeviceObservationV1} from '../api/native-claim-device-api-v1.mjs';
const KEY='lianum.native-claim.pending.v1';
const PAGE_BYTES=1800,MAX_BYTES=5400,MAX_REVISIONS=128;
const fail=()=>{throw Error('MOBILE_NATIVE_CLAIM_PENDING_RECOVERY_REQUIRED');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function exact(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||!keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');}))fail();}
function record(raw){exact(raw,['version','descriptor','requestId','amount','maxFee','recipientEndpoint','permissionSHA256','signatureSHA256','state']);
 if(raw.version!==1||!['UNRESOLVED','CONFIRMED'].includes(raw.state)||!hex(raw.permissionSHA256)||!hex(raw.signatureSHA256)||typeof raw.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(raw.requestId))fail();
 for(const k of ['amount','maxFee'])if(typeof raw[k]!=='string'||!/^[1-9][0-9]{0,19}$/.test(raw[k])||BigInt(raw[k])>=1n<<64n)fail();
 const descriptor=normalizeNativeClaimDeviceDescriptorV1(raw.descriptor);
 if(typeof raw.recipientEndpoint!=='string'||!(descriptor.nativeFamily==='1'?/^0014[0-9a-f]{40}$/:/^[0-9a-f]{64}$/).test(raw.recipientEndpoint))fail();
 return Object.freeze({...raw,descriptor});
}
/** Ports only perform protected local storage/digest/current identity, never RPC. */
export function createNativeClaimPendingRedemptionV1({get,set,digest,devicePublicKey}){
 if([get,set,digest,devicePublicKey].some(v=>typeof v!=='function'))fail();let tail=Promise.resolve();
 const serial=work=>{const next=tail.then(work);tail=next.catch(()=>{});return next;};
 async function hash(value){const h=await digest(value);if(!hex(h))fail();return h;}
 async function identity(value){if(await devicePublicKey()!==value.descriptor.devicePublicKey)fail();}
 function pointer(text){if(typeof text!=='string'||text.length>512)fail();let p;try{p=JSON.parse(text);}catch{fail();}
  exact(p,['version','revision','sha256','pages','bytes']);if(p.version!==1||!Number.isInteger(p.revision)||p.revision<1||p.revision>MAX_REVISIONS||!hex(p.sha256)||!Number.isInteger(p.pages)||p.pages<1||p.pages>3||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>MAX_BYTES||p.pages!==Math.ceil(p.bytes/PAGE_BYTES))fail();return p;}
 async function read(){const original=await get(KEY);if(original===null)return null;const p=pointer(original);let bytes='';
  for(let i=0;i<p.pages;i++){const part=await get(KEY+'.'+p.sha256+'.'+i);if(typeof part!=='string'||part.length!==Math.min(PAGE_BYTES,p.bytes-i*PAGE_BYTES))fail();bytes+=part;}
  if(bytes.length!==p.bytes||await hash(bytes)!==p.sha256||await get(KEY)!==original)fail();let value;try{value=record(JSON.parse(bytes));}catch{fail();}await identity(value);return{value,pointer:original,revision:p.revision};}
 async function write(value,old){await identity(value);const bytes=JSON.stringify(value);if(bytes.length>MAX_BYTES||/[^\x20-\x7e]/.test(bytes))fail();const sha256=await hash(bytes),revision=(old?.revision??0)+1;if(revision>MAX_REVISIONS)fail();
  const pages=Math.ceil(bytes.length/PAGE_BYTES);for(let i=0;i<pages;i++){const key=KEY+'.'+sha256+'.'+i,part=bytes.slice(i*PAGE_BYTES,(i+1)*PAGE_BYTES),previous=await get(key);if(previous!==null&&previous!==part)fail();if(previous===null)await set(key,part);if(await get(key)!==part)fail();}
  await identity(value);if(await get(KEY)!==(old?.pointer??null))fail();const next=JSON.stringify({version:1,revision,sha256,pages,bytes:bytes.length});await set(KEY,next);if(await get(KEY)!==next)fail();const checked=await read();if(!checked||!same(checked.value,value))fail();return checked.value;}
 return Object.freeze({
  read(){return serial(async()=>{const old=await read();return old?.value??null;});},
  retain(permission,signature){const p=validateNativeClaimDevicePermissionFreshV1(permission),signed=normalizeNativeClaimDeviceSignatureV1(signature);if(p.action!=='REDEEM_NATIVE_CLAIM')fail();
   return serial(async()=>{await identity(p);const old=await read(),value=record({version:1,descriptor:p.descriptor,requestId:p.requestId,amount:p.amount,maxFee:p.maxFee,recipientEndpoint:p.redemptionBinding.recipientEndpoint,
    permissionSHA256:await hash(new TextDecoder().decode(nativeClaimDevicePermissionMessageV1(p))),signatureSHA256:await hash(signed),state:'UNRESOLVED'});
    if(old){if(old.value.requestId===value.requestId){if(!same(old.value,value))fail();return old.value;}if(old.value.state!=='CONFIRMED')fail();}
    return write(value,old);});},
  confirm(observation){const observed=readNativeClaimDeviceObservationV1(observation);
   return serial(async()=>{readNativeClaimDeviceObservationV1(observed);const old=await read();if(!old)return null;if(!same(old.value.descriptor,observed.descriptor))fail();
    const request=observed.state.requests.find(r=>r.requestId===old.value.requestId&&r.action==='redeem');if(request?.state!=='CONFIRMED')return old.value;
    if(old.value.state==='CONFIRMED')return old.value;return write(record({...old.value,state:'CONFIRMED'}),old);});},
 });
}
