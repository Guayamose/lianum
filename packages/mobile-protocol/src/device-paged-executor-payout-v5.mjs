/** Public signed payout custody/collection DATA. A parsed record grants no
 * withdrawal authority; Original owners additionally verify keys and state. */
import * as P from './device-paged-owner-v3.mjs';
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
import {devicePagedEconomicProviderV3} from './device-paged-economic-provider-v3.mjs';
export const DEVICE_PAGED_EXECUTOR_PAYOUT_CUSTODY_V5='DEVICE_PAGED_EXECUTOR_PAYOUT_CUSTODY_V5';
export const DEVICE_PAGED_EXECUTOR_PAYOUT_PLAN_V5='DEVICE_PAGED_EXECUTOR_PAYOUT_PLAN_V5';
const need=v=>{if(!v)throw Error('MOBILE_PAGED_EXECUTOR_PAYOUT_TERMS');},exact=P.pagedOwnerExactV3,hex=P.pagedOwnerHexV3;
const frozen=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
const list=(raw,max)=>{need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length>0&&raw.length<=max&&Reflect.ownKeys(raw).length===raw.length+1);return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;});};
const uint=v=>{P.pagedOwnerUintV3(v,true);return BigInt(v);};
const id=v=>need(typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v));
const ms=v=>need(Number.isSafeInteger(v)&&v>0);
const graph=t=>{need(typeof t.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(t.graphId));hex(t.rootId);need(Number.isSafeInteger(t.revision)&&t.revision>0);};
const point=(x,y)=>devicePagedEconomicProviderV3('04'+x+y);
const sig=v=>{need(typeof v==='string'&&/^[0-9a-f]{128}$/.test(v));const n=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,r=BigInt('0x'+v.slice(0,64)),s=BigInt('0x'+v.slice(64));need(r>0n&&r<n&&s>0n&&s<=n/2n);};
export function devicePagedExecutorPayoutHashV5(value){const b=new TextEncoder().encode(JSON.stringify(value));try{return Array.from(boundedPermissionSha256V1(b),x=>x.toString(16).padStart(2,'0')).join('');}finally{b.fill(0);}}
export function normalizeDevicePagedExecutorPayoutPreparationV5(raw){const r=exact(raw,['preparationId','pageIndex','operationId','nodes','collectBy','maximumFeeAtomic']);need(/^paged-page-[0-9a-f]{32}$/.test(r.preparationId));uint(r.pageIndex);hex(r.operationId);ms(r.collectBy);need(uint(r.maximumFeeAtomic)>0n&&Array.isArray(r.nodes)&&r.nodes.length>0&&r.nodes.length<=64);const ids=new Set();r.nodes=list(r.nodes,64).map(raw=>{const n=exact(raw,['id','ordinal','amount']);id(n.id);need(!ids.has(n.id)&&uint(n.ordinal)<256n&&uint(n.amount)>0n);ids.add(n.id);return n;});return frozen(r);}
export function normalizeDevicePagedExecutorPayoutCustodyTermsV5(raw){
 const t=exact(raw,['profile','descriptor','providerIdentity','providerPublicKey','graphId','rootId','revision','operationId','preparationId','id','ordinal','beneficiary','opening','randomness','commitment','nullifier','collectBy','maximumFeeAtomic']);
 need(t.profile===DEVICE_PAGED_EXECUTOR_PAYOUT_CUSTODY_V5);t.descriptor=P.normalizeDevicePagedDescriptorV3(t.descriptor);hex(t.providerIdentity);const p=devicePagedEconomicProviderV3(t.providerPublicKey);need(t.beneficiary===p.address);graph(t);hex(t.operationId);need(/^paged-page-[0-9a-f]{32}$/.test(t.preparationId));id(t.id);need(uint(t.ordinal)<256n);hex(t.randomness);hex(t.commitment);hex(t.nullifier);ms(t.collectBy);need(t.collectBy<=t.descriptor.deadlineMs&&uint(t.maximumFeeAtomic)>0n);
 t.opening=exact(t.opening,['type','rho','x','y','value','secret']);need(t.opening.type===4);for(const k of ['rho','x','y','secret'])hex(t.opening[k]);point(t.opening.x,t.opening.y);need(uint(t.opening.value)>0n);return frozen(t);
}
export function devicePagedExecutorPayoutCustodyFrameV5(termsSHA256){hex(termsSHA256);return new TextEncoder().encode('LIANUM/EXECUTOR-PAYOUT-CUSTODY/5\n'+termsSHA256);}
export function normalizeDevicePagedExecutorPayoutCustodyV5(raw){const c=exact(raw,['terms','termsSHA256','signature','ownershipSignature']);c.terms=normalizeDevicePagedExecutorPayoutCustodyTermsV5(c.terms);hex(c.termsSHA256);need(c.termsSHA256===devicePagedExecutorPayoutHashV5(c.terms));sig(c.signature);sig(c.ownershipSignature);return frozen(c);}
export function normalizeDevicePagedExecutorPayoutPlanV5(raw){
 const t=exact(raw,['profile','descriptorSHA256','providerIdentity','providerPublicKey','graphId','rootId','revision','authorizationRoot','beneficiary','quoteRoot','collectBy','maximumTotalFeeAtomic','payouts']);need(t.profile===DEVICE_PAGED_EXECUTOR_PAYOUT_PLAN_V5);for(const k of ['descriptorSHA256','providerIdentity','authorizationRoot','quoteRoot'])hex(t[k]);graph(t);need(t.beneficiary===devicePagedEconomicProviderV3(t.providerPublicKey).address);ms(t.collectBy);need(uint(t.maximumTotalFeeAtomic)>0n);need(Array.isArray(t.payouts)&&t.payouts.length>0&&t.payouts.length<=256);
 const ids=new Set(),cms=new Set(),nfs=new Set();t.payouts=list(t.payouts,256).map((raw,index)=>{const p=exact(raw,['id','ordinal','commitment','nullifier','amountAtomic','certificateSHA256','maximumFeeAtomic']);id(p.id);need(p.ordinal===String(index)&&!ids.has(p.id));ids.add(p.id);for(const k of ['commitment','nullifier','certificateSHA256'])hex(p[k]);need(!cms.has(p.commitment)&&!nfs.has(p.nullifier));cms.add(p.commitment);nfs.add(p.nullifier);need(uint(p.amountAtomic)>0n&&uint(p.maximumFeeAtomic)>0n&&uint(p.maximumFeeAtomic)<=uint(t.maximumTotalFeeAtomic));return p;});return frozen(t);
}
/** Bounded SHA frames preserve every ordered payout without exceeding the
 * mobile hash primitive's 8KiB input bound at the supported 256 nodes. */
export function devicePagedExecutorPayoutPlanHashV5(raw){const plan=normalizeDevicePagedExecutorPayoutPlanV5(raw),{payouts,...header}=plan;let hash=devicePagedExecutorPayoutHashV5(['LIANUM/EXECUTOR-PAYOUT-PLAN/5',header,payouts.length]);for(const [index,row]of payouts.entries())hash=devicePagedExecutorPayoutHashV5(['LIANUM/EXECUTOR-PAYOUT-ROW/5',hash,index,row]);return hash;}
