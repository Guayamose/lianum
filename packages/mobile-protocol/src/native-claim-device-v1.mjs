/** Public permission framing only. Parsed pairing metadata never grants native
 * custody, native balance or authority to select a controller/domain/caller. */
import {normalizeMobileOrigin} from './authorization.mjs';
import {normalizeDeviceExitStatementV1} from './device-exit-consent-v1.mjs';
import {normalizeExternalFlatPathV1,externalFlatWalletPublicInputsV3} from './device-external-flat-note-v1.mjs';
export const NATIVE_CLAIM_DEVICE_PAIRING_V1='LIANUM_NATIVE_CLAIM_DEVICE_PAIRING_V1';
export const NATIVE_CLAIM_DEVICE_PERMISSION_V1='LIANUM_NATIVE_CLAIM_DEVICE_PERMISSION_V1';
export const NATIVE_CLAIM_DEVICE_OBSERVATION_V1='LIANUM_NATIVE_CLAIM_DEVICE_OBSERVATION_V1';
export const NATIVE_CLAIM_DEVICE_TTL_MS=15000;
const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const need=ok=>{if(!ok)throw Error('NATIVE_CLAIM_DEVICE_FRAME');};
const match=(value,pattern)=>typeof value==='string'&&pattern.exec(value)?.[0]===value;
const hex=value=>need(match(value,/^[0-9a-f]{64}$/));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function data(raw){let count=0,size=0;function visit(v,depth){need(++count<=6000&&depth<=12);
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number'){need(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0));return v;}
 if(typeof v==='string'){size+=v.length;need(v.length<=512&&size<=65536&&!/[\u0000-\u001f\u007f-\uffff]/.test(v));return v;}
 need(v&&typeof v==='object');
 if(Array.isArray(v)){need(Object.getPrototypeOf(v)===Array.prototype&&v.length<=128&&Reflect.ownKeys(v).length===v.length+1);
 return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return visit(d.value,depth+1);});}
 need(Object.getPrototypeOf(v)===Object.prototype);const keys=Reflect.ownKeys(v);need(keys.length<=32);
 const result={};for(const key of keys){need(typeof key==='string'&&!['__proto__','constructor','prototype'].includes(key));const d=Object.getOwnPropertyDescriptor(v,key);need(d?.enumerable&&Object.hasOwn(d,'value'));result[key]=visit(d.value,depth+1);}return result;
 }return visit(raw,0);}
function exact(raw,keys){const v=data(raw);need(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));return Object.fromEntries(keys.map(k=>[k,v[k]]));}
export function normalizeNativeClaimDeviceDescriptorV1(raw){const v=exact(raw,['version','profile','origin','pairingId','devicePublicKey','accountScopeSHA256','lifetimeSHA256','claimDomain','nativeFamily','nativeGenesis','nativeAsset','wrapperAssetIdentity','claimSymbol','nativeSymbol','decimals','atomicUnit','nativeAssetKind','mint']);
 need(v.version===1&&v.profile===NATIVE_CLAIM_DEVICE_PAIRING_V1);normalizeMobileOrigin(v.origin);need(match(v.devicePublicKey,/^04[0-9a-f]{128}$/));
 for(const k of ['pairingId','accountScopeSHA256','lifetimeSHA256','claimDomain','nativeGenesis','nativeAsset','wrapperAssetIdentity'])hex(v[k]);
 need(['1','2'].includes(v.nativeFamily)&&match(v.claimSymbol,/^[A-Za-z][A-Za-z0-9]{1,15}$/)&&match(v.nativeSymbol,/^[A-Za-z][A-Za-z0-9]{1,15}$/)&&Number.isSafeInteger(v.decimals)&&v.decimals<=18&&match(v.atomicUnit,/^[A-Za-z][A-Za-z0-9_-]{0,31}$/));
 need(v.nativeAssetKind===null||['SOLANA_SPL_USDC'].includes(v.nativeAssetKind));need(v.mint===null||match(v.mint,/^[A-Za-z0-9]{32,64}$/));
 return freeze(v);}
export function normalizeNativeClaimDevicePermissionV1(raw){raw=data(raw);if(raw?.profile===NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1)return normalizeNativeClaimDeviceRedeemPermissionV1(raw);const v=exact(raw,['version','profile','action','descriptor','challengeId','nonce','expiresAt','requestId','requestSHA256']);
 need(v.version===1&&v.profile===NATIVE_CLAIM_DEVICE_PERMISSION_V1&&['READ_CLAIM_JOURNAL','RECONCILE_CLAIM_REQUEST'].includes(v.action));v.descriptor=normalizeNativeClaimDeviceDescriptorV1(v.descriptor);hex(v.challengeId);hex(v.nonce);need(v.challengeId!==v.nonce&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);
 if(v.action==='READ_CLAIM_JOURNAL')need(v.requestId===null&&v.requestSHA256===null);else{need(match(v.requestId,/^[A-Za-z0-9_-]{8,100}$/));hex(v.requestSHA256);}return freeze(v);}
export function validateNativeClaimDevicePermissionFreshV1(raw,now=Date.now()){const v=normalizeNativeClaimDevicePermissionV1(raw);need(Number.isSafeInteger(now)&&now>=0&&v.expiresAt>now&&v.expiresAt<=now+NATIVE_CLAIM_DEVICE_TTL_MS);return v;}
export function nativeClaimDevicePermissionMessageV1(raw){const v=normalizeNativeClaimDevicePermissionV1(raw);const s=v.profile+'\n'+JSON.stringify(v);need(s.length<=4096);return Uint8Array.from(s,c=>c.charCodeAt(0));}
export function normalizeNativeClaimDeviceSignatureV1(value){need(match(value,/^[0-9a-f]{128}$/));const r=BigInt('0x'+value.slice(0,64)),s=BigInt('0x'+value.slice(64));need(r>0n&&r<order&&s>0n&&s<=order/2n);return value;}
export function normalizeNativeClaimDeviceObservationV1(raw){const v=exact(raw,['version','profile','descriptor','permissionId','observedAt','expiresAt','state']);need(v.version===1&&v.profile===NATIVE_CLAIM_DEVICE_OBSERVATION_V1);v.descriptor=normalizeNativeClaimDeviceDescriptorV1(v.descriptor);hex(v.permissionId);need(Number.isSafeInteger(v.observedAt)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>v.observedAt&&v.expiresAt<=v.observedAt+NATIVE_CLAIM_DEVICE_TTL_MS);
 const s=exact(v.state,['phase','storageAvailable','requiresReconciliation','requests','deposits','tickets','custody','nativeSelfCustody','underlyingSpendable','independentOperators','availablePrivateClaims']);need(s.phase==='READY'&&s.storageAvailable===true&&typeof s.requiresReconciliation==='boolean'&&s.custody==='BACKEND_LOCAL_QUORUM'&&s.nativeSelfCustody===false&&s.underlyingSpendable===false&&s.independentOperators===false&&s.availablePrivateClaims===null);
 const ids=new Set();need(Array.isArray(s.requests)&&Array.isArray(s.deposits)&&Array.isArray(s.tickets));
 s.requests=s.requests.map(raw=>{const r=exact(raw,['requestId','action','state','errorCode','requestSHA256']);need(match(r.requestId,/^[A-Za-z0-9_-]{8,100}$/)&&!ids.has(r.requestId));ids.add(r.requestId);need(['deposit','refund','redeem','restartKeeper'].includes(r.action)&&['ADMITTED','RUNNING','CONFIRMED','RECONCILIATION_REQUIRED'].includes(r.state));hex(r.requestSHA256);need(r.errorCode===null||match(r.errorCode,/^[A-Z][A-Z0-9_]{1,120}$/));return r;});
 s.deposits=s.deposits.map(raw=>{const r=exact(raw,['intentId','claimDomain','amount','status']);hex(r.intentId);need(r.claimDomain===v.descriptor.claimDomain&&match(r.amount,/^(0|[1-9][0-9]{0,77})$/)&&BigInt(r.amount)<1n<<256n&&match(r.status,/^[A-Z][A-Z0-9_]{1,63}$/));return r;});
 s.tickets=s.tickets.map(raw=>{const r=exact(raw,['ticketId','claimDomain','status']);hex(r.ticketId);need(r.claimDomain===v.descriptor.claimDomain&&match(r.status,/^[A-Z][A-Z0-9_]{1,63}$/));return r;});v.state=s;return freeze(v);}
export function normalizeNativeClaimDeviceReconcileV1(raw){const v=exact(raw,['version','profile','descriptor','permissionId','admitted','action','requestId','state']);need(v.version===1&&v.profile==='LIANUM_NATIVE_CLAIM_DEVICE_RECONCILE_V1'&&v.admitted===true&&v.action==='reconcile');v.descriptor=normalizeNativeClaimDeviceDescriptorV1(v.descriptor);hex(v.permissionId);need(match(v.requestId,/^[A-Za-z0-9_-]{8,100}$/)&&['ADMITTED','RUNNING','CONFIRMED','RECONCILIATION_REQUIRED'].includes(v.state));return freeze(v);}

export const NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1='LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1';
export const NATIVE_CLAIM_DEVICE_REDEEM_ADMISSION_V1='LIANUM_NATIVE_CLAIM_DEVICE_REDEEM_ADMISSION_V1';
export function normalizeNativeClaimDeviceRedemptionBindingV1(raw,descriptor){const v=exact(raw,['profile','accountScopeSHA256','claimDomain','callerSHA256','nativeFamily','nativeGenesis','nativeAsset','recipientEndpoint','recipientEndpointCommitment','custody','nativeSelfCustody']);
 need(v.profile==='ORIGINAL_NATIVE_CLAIM_DEVICE_REDEMPTION_BINDING_V1'&&v.custody==='BACKEND_LOCAL_QUORUM'&&v.nativeSelfCustody===false);for(const k of ['accountScopeSHA256','claimDomain','callerSHA256','nativeGenesis','nativeAsset','recipientEndpointCommitment'])hex(v[k]);
 need(v.nativeFamily===descriptor.nativeFamily&&v.accountScopeSHA256===descriptor.accountScopeSHA256&&v.claimDomain===descriptor.claimDomain&&v.nativeGenesis===descriptor.nativeGenesis&&v.nativeAsset===descriptor.nativeAsset);
 need(v.nativeFamily==='1'?match(v.recipientEndpoint,/^0014[0-9a-f]{40}$/):match(v.recipientEndpoint,/^[0-9a-f]{64}$/));return freeze(v);}
export function normalizeNativeClaimDeviceRedeemPermissionV1(raw){const v=exact(raw,['version','profile','action','descriptor','redemptionBinding','requestId','amount','maxFee','challengeId','nonce','expiresAt']);
 need(v.version===1&&v.profile===NATIVE_CLAIM_DEVICE_REDEEM_PERMISSION_V1&&v.action==='REDEEM_NATIVE_CLAIM');v.descriptor=normalizeNativeClaimDeviceDescriptorV1(v.descriptor);v.redemptionBinding=normalizeNativeClaimDeviceRedemptionBindingV1(v.redemptionBinding,v.descriptor);
 need(match(v.requestId,/^[A-Za-z0-9_-]{8,100}$/));for(const k of ['amount','maxFee'])need(match(v[k],/^[1-9][0-9]{0,19}$/)&&BigInt(v[k])<1n<<64n);
 hex(v.challengeId);hex(v.nonce);need(v.challengeId!==v.nonce&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);return freeze(v);}
export function normalizeNativeClaimDeviceRedeemAdmissionV1(raw){const v=exact(raw,['version','profile','descriptor','permissionId','admitted','action','requestId','state','duplicate']);
 need(v.version===1&&v.profile===NATIVE_CLAIM_DEVICE_REDEEM_ADMISSION_V1&&v.admitted===true&&v.action==='redeem'&&typeof v.duplicate==='boolean');v.descriptor=normalizeNativeClaimDeviceDescriptorV1(v.descriptor);hex(v.permissionId);
 need(match(v.requestId,/^[A-Za-z0-9_-]{8,100}$/)&&['ADMITTED','RUNNING','CONFIRMED','RECONCILIATION_REQUIRED'].includes(v.state));return freeze(v);}


/** Separate device-root note profile. The native asset remains in the original
 * local quorum custody. This frame neither grants a controller nor adopts an
 * existing Linux note. All proof recipients are one-job original recipients. */
export const DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2='ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2';
export const DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2='ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2';
export const DEVICE_ROOT_NATIVE_CLAIM_HANDOFF_V2='ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_HANDOFF_V2';
const rootClaimUUID=v=>need(match(v,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
const rootClaimUint=v=>{need(match(v,/^(0|[1-9][0-9]{0,19})$/)&&BigInt(v)<1n<<64n);return v;};
export function normalizeDeviceRootClaimDescriptorV2(raw){
 const v=exact(raw,['profile','claim','pool','scope','policy','recipient','noteCustody','nativeCustody']);
 need(v.profile===DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2&&v.noteCustody==='DEVICE_ROOT_NOTE'&&v.nativeCustody==='BACKEND_LOCAL_QUORUM');
 v.claim=normalizeNativeClaimDeviceDescriptorV1(v.claim);for(const k of ['scope','policy'])hex(v[k]);
 for(const k of ['pool','recipient'])need(match(v[k],/^[0-9a-f]{40}$/)&&v[k]!=='0'.repeat(40));need(v.pool!==v.recipient);return freeze(v);
}
export function normalizeDeviceRootClaimStatementV2(raw,ingress=false){
 const fields=ingress?['claimDomain','outputQ','admissionN','refundDestination','admissionRevocationState','ingressReceiptLeaf','amountQ','evidenceFrom','evidenceUntil']:['scope','policy','validFrom','validUntil','amount','output'];
 const v=exact(raw,fields),numbers=ingress?['amountQ','evidenceFrom','evidenceUntil']:['validFrom','validUntil','amount'];
 for(const k of fields)numbers.includes(k)?rootClaimUint(v[k]):hex(v[k]);need(BigInt(v[ingress?'amountQ':'amount'])>0n&&BigInt(v[ingress?'evidenceFrom':'validFrom'])<BigInt(v[ingress?'evidenceUntil':'validUntil']));return freeze(v);
}
export function deviceRootClaimPublicInputsV2(raw,ingress=false){
 const s=normalizeDeviceRootClaimStatementV2(raw,ingress),words=v=>Array.from({length:8},(_,i)=>BigInt('0x'+v.slice(i*8,i*8+8)).toString());
 return freeze(ingress?[...words(s.claimDomain),...words(s.outputQ),...words(s.admissionN),...words(s.refundDestination),...words(s.admissionRevocationState),...words(s.ingressReceiptLeaf),s.amountQ,s.evidenceFrom,s.evidenceUntil]:[...words(s.scope),...words(s.policy),s.validFrom,s.validUntil,s.amount,...words(s.output)]);
}
export function normalizeDeviceRootClaimPermissionV2(raw){
 const v=exact(raw,['version','profile','action','descriptor','rootId','noteRevision','challengeId','nonce','expiresAt','jobId','statement','witnessSHA256','commonSHA256','recipient']);
 need(v.version===2&&v.profile===DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2&&['ACCESS','READ','PROVE_D27','FUND_NATIVE_CLAIM','PROVE_CI51','ISSUE_CLAIM'].includes(v.action));v.descriptor=normalizeDeviceRootClaimDescriptorV2(v.descriptor);
 for(const k of ['challengeId','nonce'])hex(v[k]);need(v.challengeId!==v.nonce&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);
 if(['ACCESS','READ'].includes(v.action)){for(const k of ['rootId','noteRevision','jobId','statement','witnessSHA256','commonSHA256','recipient'])need(v[k]===null);return freeze(v);}
 hex(v.rootId);need(Number.isSafeInteger(v.noteRevision)&&v.noteRevision>=0&&!Object.is(v.noteRevision,-0));rootClaimUUID(v.jobId);
 const ingress=v.action==='PROVE_CI51';v.statement=normalizeDeviceRootClaimStatementV2(v.statement,ingress);
 if(ingress)need(v.statement.claimDomain===v.descriptor.claim.claimDomain);else need(v.statement.scope===v.descriptor.scope&&v.statement.policy===v.descriptor.policy);
 if(v.action.startsWith('PROVE_')){
  hex(v.witnessSHA256);if(ingress)hex(v.commonSHA256);else need(v.commonSHA256===null);
  const q=exact(v.recipient,['type','profile','relation','role','jobId','recipientPublicKey']);need(q.type==='flat-private-proof-input-ready'&&q.profile==='ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1'&&q.jobId===v.jobId&&q.relation===(ingress?'native_claim_ingress':'deposit_intent')&&q.role===(ingress?'claim_ingress':'owner')&&match(q.recipientPublicKey,/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/));v.recipient=q;
 }else for(const k of ['witnessSHA256','commonSHA256','recipient'])need(v[k]===null);
 return freeze(v);
}
export function validateDeviceRootClaimPermissionFreshV2(raw,now=Date.now()){
 const v=normalizeDeviceRootClaimPermissionV2(raw);need(Number.isSafeInteger(now)&&now>=0&&v.expiresAt>now&&v.expiresAt<=now+NATIVE_CLAIM_DEVICE_TTL_MS);return v;
}
export function deviceRootClaimPermissionMessageV2(raw){const s=DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2+'\n'+JSON.stringify(normalizeDeviceRootClaimPermissionV2(raw));need(s.length<=8192);return Uint8Array.from(s,c=>c.charCodeAt(0));}
export function deviceRootClaimDataBytesV2(raw){let nodes=0,characters=0;function copy(v,depth){need(++nodes<=10000&&depth<=16);if(v===null||typeof v==='boolean')return v;if(typeof v==='number'){need(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0));return v;}if(typeof v==='string'){characters+=v.length;need(v.length<=8192&&characters<=65536&&!/[\u0000-\u001f\u007f-\uffff]/.test(v));return v;}need(v&&typeof v==='object');if(Array.isArray(v)){need(Object.getPrototypeOf(v)===Array.prototype&&v.length<=128&&Reflect.ownKeys(v).length===v.length+1);return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return copy(d.value,depth+1);});}need(Object.getPrototypeOf(v)===Object.prototype);const result={},keys=Reflect.ownKeys(v);need(keys.length<=64);for(const k of keys){need(typeof k==='string'&&!['__proto__','constructor','prototype'].includes(k));characters+=k.length;need(characters<=65536);const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable&&Object.hasOwn(d,'value'));result[k]=copy(d.value,depth+1);}return result;}const text=JSON.stringify(copy(raw,0));need(text.length<=65536);return Uint8Array.from(text,c=>c.charCodeAt(0));}

/** A separate exit consent for the SAME before-fund device-root intake. The
 * old D27/CI51 permissions do not acquire any new action or lifetime. */
export const DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3='ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3';
export function normalizeDeviceRootClaimExitQuoteV3(raw){
 const v=exact(raw,['profile','descriptor','quoteId','rootId','noteRevision','statement','path','observed','expiresAt']);
 need(v.profile===DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3);v.descriptor=normalizeDeviceRootClaimDescriptorV2(v.descriptor);
 hex(v.quoteId);hex(v.rootId);need(Number.isSafeInteger(v.noteRevision)&&v.noteRevision>=0);v.statement=normalizeDeviceExitStatementV1(v.statement);v.path=normalizeExternalFlatPathV1(v.path);
 need(v.statement.scope===v.descriptor.scope&&v.statement.policy===v.descriptor.policy&&v.statement.recipient===v.descriptor.recipient&&v.path.root===v.statement.root&&v.path.leaf===v.statement.commitment);
 v.observed=exact(v.observed,['blockNumber','blockHash','timestamp']);rootClaimUint(v.observed.blockNumber);hex(v.observed.blockHash);rootClaimUint(v.observed.timestamp);
 need(v.statement.epoch===(BigInt(v.observed.timestamp)/600n).toString()&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);return freeze(v);
}
export function normalizeDeviceRootClaimExitPermissionV3(raw){
 const v=exact(raw,['version','profile','action','descriptor','rootId','noteRevision','jobId','quoteId','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256','recipient','requestId','ticketId','amount','maxFee','challengeId','nonce','expiresAt']);
 need(v.version===3&&v.profile===DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3&&['PROVE_W39','WITHDRAW_W39','OBSERVE_W39','REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'].includes(v.action));v.descriptor=normalizeDeviceRootClaimDescriptorV2(v.descriptor);
 for(const k of ['rootId','challengeId','nonce'])hex(v[k]);need(v.challengeId!==v.nonce&&Number.isSafeInteger(v.noteRevision)&&v.noteRevision>=0&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);rootClaimUUID(v.jobId);
 if(v.action.endsWith('W39')){
  hex(v.quoteId);v.statement=normalizeDeviceExitStatementV1(v.statement);v.path=normalizeExternalFlatPathV1(v.path);hex(v.witnessSHA256);
  need(v.statement.scope===v.descriptor.scope&&v.statement.policy===v.descriptor.policy&&v.statement.recipient===v.descriptor.recipient&&v.path.root===v.statement.root&&v.path.leaf===v.statement.commitment);
  need(v.requestId===null&&v.ticketId===null&&v.amount===null&&v.maxFee===null);
  if(v.action==='PROVE_W39'){need(v.proofSHA256===null&&v.publicInputsSHA256===null);const r=exact(v.recipient,['type','profile','relation','role','jobId','recipientPublicKey']);need(r.type==='flat-private-proof-input-ready'&&r.profile==='ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1'&&r.relation==='withdraw_balance'&&r.role==='owner'&&r.jobId===v.jobId&&match(r.recipientPublicKey,/^MCowBQYDK2VuAyEA[A-Za-z0-9+/]{43}=$/));v.recipient=r;}
  else{hex(v.proofSHA256);hex(v.publicInputsSHA256);need(v.recipient===null);}
 }else{
  for(const k of ['quoteId','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256','recipient'])need(v[k]===null);
  hex(v.requestId);rootClaimUint(v.amount);rootClaimUint(v.maxFee);need(BigInt(v.amount)>0n&&BigInt(v.maxFee)>0n);
  if(v.action==='REDEEM_NATIVE')need(v.ticketId===null);else hex(v.ticketId);
 }
 return freeze(v);
}
export function validateDeviceRootClaimExitPermissionFreshV3(raw,now=Date.now()){const v=normalizeDeviceRootClaimExitPermissionV3(raw);need(Number.isSafeInteger(now)&&now>=0&&v.expiresAt>now&&v.expiresAt<=now+15000);return v;}
export function deviceRootClaimExitPermissionMessageV3(raw){const s=DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3+'\n'+JSON.stringify(normalizeDeviceRootClaimExitPermissionV3(raw));need(s.length<=8192);return Uint8Array.from(s,c=>c.charCodeAt(0));}
export function deviceRootClaimExitPublicInputsV3(raw){return externalFlatWalletPublicInputsV3('withdraw_balance',raw);}
