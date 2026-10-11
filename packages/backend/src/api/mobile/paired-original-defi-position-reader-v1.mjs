/** Private operator pairing over the SAME catalogue, session and fixed vault
 * facade. This issues read permissions only; no note, witness or owner key. */
import {types} from 'node:util';
import {randomBytes,createPublicKey,verify,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {generationPrivateVaultExitBinding,assertGenerationPrivateVaultExitSession} from '../../defi/withdrawals/generation-private-vault-exit.mjs';
import {normalizeDeviceDefiPositionDescriptorV1,normalizeDeviceDefiPositionAccessV1,normalizeDeviceDefiPositionReadV1,
 validateDeviceDefiPositionFreshV1,deviceDefiPositionPermissionMessageV1,normalizeDeviceDefiPositionSignatureV1,
 deviceDefiPositionTargetsV1,deviceDefiPositionStateBytesV1,validateDeviceDefiPositionHeadsFreshV1,
 normalizeDeviceDefiPositionObservationV1,DEFI_POSITION_ACCESS_V1,DEFI_POSITION_READ_V1,
 DEFI_POSITION_OBSERVATION_V1,DEFI_POSITION_TTL_MS} from '@lianum/mobile-protocol/device-defi-position-read-v1';
const owned=new WeakMap();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const need=(ok,code='DEVICE_DEFI_ORIGINAL_REQUIRED')=>{if(!ok)fail(code);};
function exact(value,keys){need(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)??{},'value')),'DEVICE_DEFI_INPUT');}
function publicData(raw){let nodes=0;function visit(value,depth){need(++nodes<=6000&&depth<=12,'DEVICE_DEFI_INPUT');if(value&&typeof value==='object'){need(!types.isProxy(value),'DEVICE_DEFI_INPUT');for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if(Object.hasOwn(d,'value'))visit(d.value,depth+1);else fail('DEVICE_DEFI_INPUT');}}visit(raw,0);}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=state=>createHash('sha256').update(deviceDefiPositionStateBytesV1(state)).digest('hex');
const nonce=()=>randomBytes(32).toString('hex');
export function assertPairedOriginalDefiPositionReaderV1(reader){need(arguments.length===1);const state=owned.get(reader);need(state,'DEVICE_DEFI_ORIGINAL_REQUIRED');state.live();return state.descriptor;}
export function createPairedOriginalDefiPositionReaderV1(input){
 need(arguments.length===1);exact(input,['runtime','catalogue','session','service','origin','devicePublicKey']);
 const {runtime,catalogue,session,service}=input;
 for(const v of [runtime,catalogue,session,service])need(!types.isProxy(v));
 const binding=generationPrivateVaultExitBinding(runtime,service);need(binding?.catalogue===catalogue);assertGenerationPrivateVaultExitSession(runtime,service,session);
 const descriptor=normalizeDeviceDefiPositionDescriptorV1({origin:input.origin,pairingId:nonce(),devicePublicKey:input.devicePublicKey});
 const publicKey=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
 const accesses=new Map(),reviews=new Map();let closed=false,busy=false,active=null;
 function live(){need(!closed,'DEVICE_DEFI_READER_CLOSED');const current=generationPrivateVaultExitBinding(runtime,service);need(current?.catalogue===catalogue);assertGenerationPrivateVaultExitSession(runtime,service,session);}
 async function ready(){live();const journal=await session.snapshot();live();need(journal.available&&journal.storageAvailable&&journal.phase==='READY'&&journal.observation==='CURRENT'&&!journal.busy&&journal.queued===0,'DEVICE_DEFI_SESSION_UNAVAILABLE');}
 function capacity(map){const now=performance.now();for(const [id,row] of map)if(row.consumed||row.deadline<=now)map.delete(id);need(map.size<16,'DEVICE_DEFI_READ_CAPACITY');}
 function issue(review,extras={}){const value=(review?normalizeDeviceDefiPositionReadV1:normalizeDeviceDefiPositionAccessV1)({version:1,profile:review?DEFI_POSITION_READ_V1:DEFI_POSITION_ACCESS_V1,action:review?'READ_DEFI_POSITIONS':'REQUEST_DEFI_POSITION_REVIEW',...descriptor,challengeId:nonce(),nonce:nonce(),expiresAt:Date.now()+DEFI_POSITION_TTL_MS,...extras});
  const map=review?reviews:accesses;capacity(map);map.set(value.challengeId,{value,deadline:performance.now()+DEFI_POSITION_TTL_MS,consumed:false});return structuredClone(value);}
 function authenticate(input,review){exact(input,review?['review','signature']:['access','signature']);publicData(input);const value=(review?normalizeDeviceDefiPositionReadV1:normalizeDeviceDefiPositionAccessV1)(input[review?'review':'access']);
  const row=(review?reviews:accesses).get(value.challengeId);need(row&&!row.consumed&&same(row.value,value)&&performance.now()<row.deadline,'DEVICE_DEFI_READ_PERMISSION');
  validateDeviceDefiPositionFreshV1(value);need(Object.keys(descriptor).every(k=>value[k]===descriptor[k]),'DEVICE_DEFI_READ_PERMISSION');const signature=normalizeDeviceDefiPositionSignatureV1(input.signature);
  need(verify('sha256',deviceDefiPositionPermissionMessageV1(value),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),'DEVICE_DEFI_READ_PERMISSION');row.consumed=true;return row;}
 function fresh(row){live();need(performance.now()<row.deadline,'DEVICE_DEFI_READ_EXPIRED');validateDeviceDefiPositionFreshV1(row.value);}
 async function snapshot(){await ready();const first=validateDeviceDefiPositionHeadsFreshV1(await service.ownerStateView());live();
  const second=validateDeviceDefiPositionHeadsFreshV1(await service.ownerStateView());await ready();
  need(same(deviceDefiPositionTargetsV1(first),deviceDefiPositionTargetsV1(second))&&digest(first)===digest(second),'DEVICE_DEFI_POSITION_HEAD_CHANGED');return second;}
 function run(work){live();need(!busy,'DEVICE_DEFI_READ_BUSY');busy=true;active=(async()=>{try{return await work();}finally{busy=false;active=null;}})();return active;}
 const reader=Object.freeze({
  challenge(){need(arguments.length===0);live();need(!busy,'DEVICE_DEFI_READ_BUSY');return issue(false);},
  openReview(input){need(arguments.length===1);return run(async()=>{const access=authenticate(input,false);const state=await snapshot();fresh(access);
   return issue(true,{accessChallengeId:access.value.challengeId,targets:deviceDefiPositionTargetsV1(state),observationSHA256:digest(state)});});},
  read(input){need(arguments.length===1);return run(async()=>{const review=authenticate(input,true);const state=await snapshot();fresh(review);
   need(same(deviceDefiPositionTargetsV1(state),review.value.targets)&&digest(state)===review.value.observationSHA256,'DEVICE_DEFI_POSITION_REVIEW_STALE');
   return normalizeDeviceDefiPositionObservationV1({version:1,profile:DEFI_POSITION_OBSERVATION_V1,...descriptor,reviewId:review.value.challengeId,observationSHA256:digest(state),positions:state,custody:'LINUX_ORIGINAL_OWNER_CUSTODY',mobileNoteCustody:false,readOnly:true});});},
  close(){need(arguments.length===0);closed=true;for(const row of [...accesses.values(),...reviews.values()])row.consumed=true;return{closed:true,retainedOriginalCustody:true};},
  async idle(){need(arguments.length===0);if(active)await active.catch(()=>{});return{closed,busy};},
 });
 owned.set(reader,{live,descriptor});return reader;
}
