/** Public permission framing only. Parsed pairing metadata never grants native
 * custody, native balance or authority to select a controller/domain/caller. */
import {normalizeMobileOrigin} from './authorization.mjs';
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
