/** Fixed SAME-session TLS client. No native keys, automatic retry or resume. */
import {normalizeNativeClaimDeviceDescriptorV1,normalizeNativeClaimDevicePermissionV1,
 validateNativeClaimDevicePermissionFreshV1,normalizeNativeClaimDeviceSignatureV1,
 normalizeNativeClaimDeviceObservationV1,normalizeNativeClaimDeviceReconcileV1,normalizeNativeClaimDeviceRedeemAdmissionV1}
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
  const value=action==='READ_CLAIM_JOURNAL'?normalizeNativeClaimDeviceObservationV1(raw):action==='REDEEM_NATIVE_CLAIM'?normalizeNativeClaimDeviceRedeemAdmissionV1(raw):normalizeNativeClaimDeviceReconcileV1(raw);
  if(!same(value.descriptor,original)||value.permissionId!==permission.challengeId)fail();
  if(action==='READ_CLAIM_JOURNAL'){scope(permission);if(value.expiresAt!==permission.expiresAt)fail();observations.set(value,{expiresAt:permission.expiresAt});}
  else if(value.requestId!==permission.requestId)fail();return value;
 }
 return Object.freeze({
  async challenge(action='READ_CLAIM_JOURNAL',requestId=null){if(arguments.length>2||!['READ_CLAIM_JOURNAL','RECONCILE_CLAIM_REQUEST'].includes(action))fail();
   const value=normalizeNativeClaimDevicePermissionV1(await post('challenges',{action,requestId}));scope(value);
   if(value.action!==action||value.requestId!==requestId)fail();permissions.set(value,{consumed:false});return value;},
  async redemptionChallenge(input){if(arguments.length!==1||!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==3||!['requestId','amount','maxFee'].every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,k)??{},'value')))fail();
   const value=normalizeNativeClaimDevicePermissionV1(await post('challenges',{action:'REDEEM_NATIVE_CLAIM',requestId:input.requestId,amount:input.amount,maxFee:input.maxFee}));scope(value);
   if(value.action!=='REDEEM_NATIVE_CLAIM'||value.requestId!==input.requestId||value.amount!==input.amount||value.maxFee!==input.maxFee)fail();permissions.set(value,{consumed:false});return value;},
  redeem(permission,signature){if(arguments.length!==2)fail();return consume(permission,signature,'REDEEM_NATIVE_CLAIM');},
  read(permission,signature){if(arguments.length!==2)fail();return consume(permission,signature,'READ_CLAIM_JOURNAL');},
  reconcile(permission,signature){if(arguments.length!==2)fail();return consume(permission,signature,'RECONCILE_CLAIM_REQUEST');},
  close(){if(arguments.length!==0)fail();closed=true;for(const controller of controllers)controller.abort();return{closed:true};},
 });
}


import * as RootClaim from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
import {validateOriginalWalletEconomicStateV1} from '../../../../packages/mobile-protocol/src/original-wallet-economic-state-v1.mjs';
const freezeRootClaimData=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freezeRootClaimData(v);Object.freeze(value);}return value;};
const rootClaimPermissions=new WeakMap(),rootClaimReviews=new WeakMap(),rootClaimObservations=new WeakMap(),rootClaimExitPermissions=new WeakMap(),rootClaimExitQuotes=new WeakMap();
export function readOriginalDeviceRootClaimExitPermissionV3(value){const r=rootClaimExitPermissions.get(value);if(!r)fail();r.live();return RootClaim.validateDeviceRootClaimExitPermissionFreshV3(value);}
export function readOriginalDeviceRootClaimExitQuoteV3(value){const r=rootClaimExitQuotes.get(value);if(!r)fail();r.live();if(Date.now()>=value.expiresAt)fail();return value;}
export function readOriginalDeviceRootClaimPermissionV2(value){const r=rootClaimPermissions.get(value);if(!r)fail();r.live();return RootClaim.validateDeviceRootClaimPermissionFreshV2(value);}
export function readOriginalDeviceRootClaimReviewV2(value){const r=rootClaimReviews.get(value);if(!r)fail();r.live();readOriginalDeviceRootClaimPermissionV2(value.consent);return value;}
export function readOriginalDeviceRootClaimObservationV2(value){const r=rootClaimObservations.get(value);if(!r)fail();r.live();if(Date.now()<value.observedAt||Date.now()>=value.expiresAt)fail();return value;}
/** Separate device-root note API, on its fixed original TLS listener. Parsed
 * pairing metadata cannot grant the controller or the note opening. */
export function createDeviceRootNativeClaimApiV2({descriptor,fetchImpl=globalThis.fetch}={}){
 const original=RootClaim.normalizeDeviceRootClaimDescriptorV2(descriptor),controllers=new Set();if(typeof fetchImpl!=='function')fail();let closed=false;
 const live=()=>{if(closed)fail();};const scope=p=>{live();p=RootClaim.validateDeviceRootClaimPermissionFreshV2(p);if(!same(p.descriptor,original))fail();return p;};
 async function post(path,body,proof=false){live();const target=original.claim.origin+'/v1/mobile/native-claims/root-note/'+path,controller=new AbortController();controllers.add(controller);let timer,reader;
  try{return await Promise.race([new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MOBILE_NATIVE_CLAIM_TIMEOUT'));},proof?900000:15000);}), (async()=>{const response=await fetchImpl(target,{method:'POST',headers:{Accept:'application/json',Origin:original.claim.origin,'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});live();if(!response.ok||response.redirected||response.url&&response.url!==target||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''))fail();const length=response.headers.get('content-length');if(length!==null&&(!/^[1-9][0-9]{0,5}$/.test(length)||Number(length)>65536))fail();if(!response.body||typeof response.body.getReader!=='function')fail();reader=response.body.getReader();const bytes=new Uint8Array(65536);let count=0;try{for(;;){const p=await reader.read();live();if(controller.signal.aborted)fail();if(p.done)break;if(!(p.value instanceof Uint8Array)||count+p.value.byteLength>bytes.length)fail();bytes.set(p.value,count);count+=p.value.byteLength;}if(length!==null&&count!==Number(length))fail();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,count)));}finally{bytes.fill(0);}})()]);}
  finally{clearTimeout(timer);controller.abort();controllers.delete(controller);if(reader){void reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 function retain(raw){const p=scope(raw);rootClaimPermissions.set(p,{live,used:false});return p;}
 function burn(permission,signature,action){const r=rootClaimPermissions.get(permission);if(!r||r.used||permission.action!==action)fail();scope(permission);signature=RootClaim.normalizeNativeClaimDeviceSignatureV1(signature);r.used=true;return signature;}
 function retainExit(raw){live();const p=RootClaim.validateDeviceRootClaimExitPermissionFreshV3(raw);if(!same(p.descriptor,original))fail();rootClaimExitPermissions.set(p,{live,used:false});return p;}
 function burnExit(permission,signature){const r=rootClaimExitPermissions.get(permission);if(!r||r.used)fail();readOriginalDeviceRootClaimExitPermissionV3(permission);r.used=true;return RootClaim.normalizeNativeClaimDeviceSignatureV1(signature);}
 return Object.freeze({
  async quoteW39(access,signature){if(arguments.length!==2)fail();signature=burn(access,signature,'ACCESS');const quote=RootClaim.normalizeDeviceRootClaimExitQuoteV3(await post('exit-quotes',{access,signature}));live();if(!same(quote.descriptor,original)||quote.expiresAt>access.expiresAt||quote.expiresAt<=Date.now())fail();rootClaimExitQuotes.set(quote,{live});return quote;},
  async reviewW39(access,signature,quote,witnessSHA256){if(arguments.length!==4)fail();readOriginalDeviceRootClaimExitQuoteV3(quote);signature=burn(access,signature,'ACCESS');const p=retainExit(await post('exit-reviews',{access,signature,quote,witnessSHA256}));if(p.expiresAt>access.expiresAt||p.expiresAt>quote.expiresAt||p.action!=='PROVE_W39'||p.quoteId!==quote.quoteId||p.rootId!==quote.rootId||p.noteRevision!==quote.noteRevision||!same(p.statement,quote.statement)||!same(p.path,quote.path)||p.witnessSHA256!==witnessSHA256)fail();return p;},
  async exitChallenge(access,signature,action){if(arguments.length!==3||!['WITHDRAW_W39','OBSERVE_W39','REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'].includes(action))fail();signature=burn(access,signature,'ACCESS');const p=retainExit(await post('exit-challenges',{access,signature,action}));if(p.action!==action||p.expiresAt>access.expiresAt)fail();return p;},
  async exitSubmit(permission,signature,packet=null){if(arguments.length<2||arguments.length>3)fail();signature=burnExit(permission,signature);if(permission.action==='PROVE_W39'?!packet:packet!==null)fail();const result=await post('exit-operations',{permission,signature,packet},!permission.action.startsWith('OBSERVE_'));live();if(result.profile!==RootClaim.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3||!same(result.descriptor,original)||result.permissionId!==permission.challengeId||result.jobId!==permission.jobId)fail();return freezeRootClaimData(result);},
  async challenge(action='ACCESS'){if(arguments.length>1||!['ACCESS','READ'].includes(action))fail();const p=retain(await post('challenges',{action}));if(p.action!==action)fail();return p;},
  async reviewD27(access,signature,draft){if(arguments.length!==3)fail();signature=burn(access,signature,'ACCESS');const p=retain(await post('reviews',{access,signature,draft}));if(p.action!=='PROVE_D27'||!same(p.statement,draft.statement)||p.rootId!==draft.rootId||p.noteRevision!==draft.noteRevision||p.witnessSHA256!==draft.witnessSHA256)fail();return p;},
  async reviewCI51(access,signature,witnessSHA256){if(arguments.length!==3)fail();signature=burn(access,signature,'ACCESS');const value=await post('ingress-reviews',{access,signature,witnessSHA256}),consent=retain(value.consent);if(consent.action!=='PROVE_CI51'||consent.witnessSHA256!==witnessSHA256)fail();RootClaim.deviceRootClaimDataBytesV2(value.common).fill(0);const result=Object.freeze({consent,common:freezeRootClaimData(value.common)});rootClaimReviews.set(result,{live});return result;},
  async effectChallenge(action){if(arguments.length!==1||!['FUND_NATIVE_CLAIM','ISSUE_CLAIM'].includes(action))fail();const p=retain(await post('effect-challenges',{action}));if(p.action!==action)fail();return p;},
  async submit(permission,signature,packet=null){if(arguments.length<2||arguments.length>3||!['PROVE_D27','PROVE_CI51','FUND_NATIVE_CLAIM','ISSUE_CLAIM'].includes(permission.action))fail();signature=burn(permission,signature,permission.action);const proof=permission.action.startsWith('PROVE_');if(proof?!packet:packet!==null)fail();const value=await post('operations',{permission,signature,packet},proof);live();if(value.profile!==original.profile||value.permissionId!==permission.challengeId||!same(value.descriptor,original)||value.jobId!==permission.jobId)fail();return value;},
  async read(permission,signature){if(arguments.length!==2)fail();signature=burn(permission,signature,'READ');const value=await post('operations',{permission,signature,packet:null});live();if(value.profile!==original.profile||!same(value.descriptor,original)||value.permissionId!==permission.challengeId||value.noteCustody!=='DEVICE_ROOT_NOTE'||value.nativeCustody!=='BACKEND_LOCAL_QUORUM'||value.nativeSelfCustody!==false||(value.availablePrivateClaims!==null&&value.availablePrivateClaims!==value.note?.available)||value.expiresAt!==permission.expiresAt||!Number.isSafeInteger(value.observedAt)||value.observedAt> Date.now())fail();scope(permission);if(value.note){const n=value.note;if(!['UNKNOWN','LIVE','SPENT'].includes(n.state)||n.commitment!==value.commitment||n.nullifier!==value.nullifier||n.state==='LIVE'&&(n.available!==value.deposit?.amount||n.path?.leaf!==n.commitment||!n.backing)||n.state!=='LIVE'&&n.available!==null)fail();}validateOriginalWalletEconomicStateV1(value.economicState);if(value.economicState.rows.length!==1)fail();const row=value.economicState.rows[0];if(row.component!=='NATIVE_CLAIM'||row.route.domainCommitment!==original.claim.claimDomain||row.route.pool!==original.pool||row.route.scope!==original.scope||row.route.policy!==original.policy||row.asset.decimals!==original.claim.decimals)fail();freezeRootClaimData(value);rootClaimObservations.set(value,{live});return value;},
  close(){if(arguments.length!==0)fail();closed=true;for(const c of controllers)c.abort();return{closed:true};},
 });
}
