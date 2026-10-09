/** Read-only framing. Parsed records never establish catalogue membership,
 * note custody, economic authority or spendable underlying credit. */
import {normalizeMobileOrigin} from './authorization.mjs';
import {validatePositionStateEnvelope} from '../../../apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs';
export const DEFI_POSITION_ACCESS_V1='LIANUM_DEVICE_DEFI_POSITION_ACCESS_V1';
export const DEFI_POSITION_READ_V1='LIANUM_DEVICE_DEFI_POSITION_READ_V1';
export const DEFI_POSITION_OBSERVATION_V1='LIANUM_DEVICE_DEFI_POSITION_OBSERVATION_V1';
export const DEFI_POSITION_TTL_MS=15000;
const ORDER=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const need=value=>{if(!value)throw Error('DEVICE_DEFI_POSITION_FRAME');};
const whole=(value,pattern)=>typeof value==='string'&&pattern.exec(value)?.[0]===value;
const hash=value=>need(whole(value,/^[0-9a-f]{64}$/));
const address=value=>need(whole(value,/^[0-9a-f]{40}$/));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function data(raw){let nodes=0,bytes=0;function copy(value,depth){
 need(++nodes<=6000&&depth<=12);
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){need(Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0));return value;}
 if(typeof value==='string'){bytes+=value.length;need(bytes<=65536&&value.length<=512&&!/[\u0000-\u001f\u007f-\uffff]/.test(value));return value;}
 need(value&&typeof value==='object');
 if(Array.isArray(value)){need(Object.getPrototypeOf(value)===Array.prototype&&value.length<=128&&Reflect.ownKeys(value).length===value.length+1);
  return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return copy(d.value,depth+1);});}
 need(Object.getPrototypeOf(value)===Object.prototype);const keys=Reflect.ownKeys(value);need(keys.length<=32&&keys.every(k=>typeof k==='string'));
 const out={};for(const k of keys){need(k!=='__proto__'&&k!=='constructor'&&k!=='prototype');const d=Object.getOwnPropertyDescriptor(value,k);need(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=copy(d.value,depth+1);}return out;
 }return copy(raw,0);}
function exact(raw,keys){const value=data(raw);need(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)));return value;}
export function normalizeDeviceDefiPositionDescriptorV1(raw){const v=exact(raw,['origin','pairingId','devicePublicKey']);normalizeMobileOrigin(v.origin);hash(v.pairingId);need(whole(v.devicePublicKey,/^04[0-9a-f]{128}$/));return freeze(v);}
function permission(raw,review){const v=exact(raw,review?['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt','accessChallengeId','targets','observationSHA256']:['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt']);
 need(v.version===1&&v.profile===(review?DEFI_POSITION_READ_V1:DEFI_POSITION_ACCESS_V1)&&v.action===(review?'READ_DEFI_POSITIONS':'REQUEST_DEFI_POSITION_REVIEW'));
 normalizeDeviceDefiPositionDescriptorV1({origin:v.origin,pairingId:v.pairingId,devicePublicKey:v.devicePublicKey});hash(v.challengeId);hash(v.nonce);need(v.challengeId!==v.nonce&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>0);
 if(review){hash(v.accessChallengeId);hash(v.observationSHA256);need(Array.isArray(v.targets)&&v.targets.length>0&&v.targets.length<=8);const shares=new Set();
  v.targets=v.targets.map(t=>{t=exact(t,['generationId','shareAssetId','underlyingAssetId','vault','underlyingToken','vaultIdentity']);hash(t.generationId);hash(t.shareAssetId);if(t.underlyingAssetId!==null){hash(t.underlyingAssetId);need(t.underlyingAssetId!==t.shareAssetId);}address(t.vault);address(t.underlyingToken);
   const i=exact(t.vaultIdentity,['chainId','genesisHash','domain','runtimeId','asset','assetCodeSHA256','vault','vaultCodeSHA256']);need(i.chainId==='31337'&&i.vault===t.vault&&i.asset===t.underlyingToken&&i.vault!==i.asset);for(const k of ['genesisHash','domain','runtimeId','assetCodeSHA256','vaultCodeSHA256'])hash(i[k]);t.vaultIdentity=i;
   need(!shares.has(t.shareAssetId));shares.add(t.shareAssetId);return t;});}
 return freeze(v);}
export const normalizeDeviceDefiPositionAccessV1=raw=>permission(raw,false);
export const normalizeDeviceDefiPositionReadV1=raw=>permission(raw,true);
export function validateDeviceDefiPositionFreshV1(raw,now=Date.now()){const v=raw?.profile===DEFI_POSITION_ACCESS_V1?normalizeDeviceDefiPositionAccessV1(raw):normalizeDeviceDefiPositionReadV1(raw);need(Number.isSafeInteger(now)&&v.expiresAt>now&&v.expiresAt<=now+DEFI_POSITION_TTL_MS);return v;}
export function deviceDefiPositionPermissionMessageV1(raw){const v=raw?.profile===DEFI_POSITION_ACCESS_V1?normalizeDeviceDefiPositionAccessV1(raw):normalizeDeviceDefiPositionReadV1(raw);return Uint8Array.from(v.profile+'\n'+JSON.stringify(v),c=>c.charCodeAt(0));}
export function normalizeDeviceDefiPositionSignatureV1(value){need(whole(value,/^[0-9a-f]{128}$/));const r=BigInt('0x'+value.slice(0,64)),s=BigInt('0x'+value.slice(64));need(r>0n&&r<ORDER&&s>0n&&s<=ORDER/2n);return value;}
export function normalizeDeviceDefiPositionStateV1(raw){const v=data(raw);validatePositionStateEnvelope(v);return freeze(v);}
export const deviceDefiPositionTargetsV1=state=>freeze(normalizeDeviceDefiPositionStateV1(state).positions.map(p=>({generationId:p.generationId,shareAssetId:p.shareAssetId,underlyingAssetId:p.underlyingAssetId,vault:p.vault,underlyingToken:p.underlyingToken,vaultIdentity:p.vaultIdentity})));
/** observedAt is a fresh host reading time, not the identity of a chain head.
 * Exact chain heads, statuses, amounts and pending requests remain committed. */
export function deviceDefiPositionStateBytesV1(raw){const v=normalizeDeviceDefiPositionStateV1(raw);function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().filter(k=>k!=='observedAt').map(k=>[k,canonical(x[k])]));return x;}
 return Uint8Array.from(JSON.stringify(canonical(v)),c=>c.charCodeAt(0));}
export function validateDeviceDefiPositionHeadsFreshV1(raw,now=Date.now()){const v=normalizeDeviceDefiPositionStateV1(raw);need(Number.isSafeInteger(now));let head=null;
 for(const p of v.positions)for(const row of [p.ownership,p.valuation])if(row.status==='LIVE'){const h=row.observed;need(h.observedAt<=now&&now-h.observedAt<=DEFI_POSITION_TTL_MS);const next=JSON.stringify([h.blockNumber,h.blockHash,h.timestamp]);need(head===null||head===next);head=next;}return v;}
export function normalizeDeviceDefiPositionObservationV1(raw){const v=exact(raw,['version','profile','origin','pairingId','devicePublicKey','reviewId','observationSHA256','positions','custody','mobileNoteCustody','readOnly']);need(v.version===1&&v.profile===DEFI_POSITION_OBSERVATION_V1&&v.custody==='LINUX_ORIGINAL_OWNER_CUSTODY'&&v.mobileNoteCustody===false&&v.readOnly===true);
 normalizeDeviceDefiPositionDescriptorV1({origin:v.origin,pairingId:v.pairingId,devicePublicKey:v.devicePublicKey});hash(v.reviewId);hash(v.observationSHA256);v.positions=normalizeDeviceDefiPositionStateV1(v.positions);return freeze(v);}
