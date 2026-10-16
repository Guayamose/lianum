/** OWNER operation DATA, including unsent and uncertain deliveries. This view
 * never issues a payment, note opening, withdrawal or execution capability. */
import * as P from './device-paged-owner-v3.mjs';
import {normalizeDevicePagedProviderQuoteV4} from './device-paged-provider-quote-v4.mjs';
import {normalizeDevicePagedProviderQuoteAnyV5} from './device-paged-provider-quote-any-v5.mjs';
import {DEVICE_PAGED_PAYMENT_LIMIT_V3} from './device-paged-payment-list-v3.mjs';
import {normalizePublicSolanaSignatureDataV1} from './public-solana-signature-data-v1.mjs';

export const DEVICE_PAGED_ECONOMIC_OPERATION_V4='DEVICE_PAGED_ECONOMIC_OPERATION_V4';
const need=(value,code='MOBILE_PAGED_ECONOMIC_OPERATION')=>{if(!value)throw Error(code);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const uint=value=>{P.pagedOwnerUintV3(value,true);return BigInt(value);};
function identifier(value){need(typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value));return value;}
function list(raw){
 need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length<=DEVICE_PAGED_PAYMENT_LIMIT_V3&&Reflect.ownKeys(raw).length===raw.length+1);
 return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;});
}
export function normalizeDevicePagedEconomicOperationRequestV4(raw){
 const input=P.pagedOwnerExactV3(raw,['ids']),ids=list(input.ids).map(identifier);
 need(new Set(ids).size===ids.length);return freeze({ids});
}
export function normalizeDevicePagedEconomicOperationRowsV4(raw,scope){return normalizeRows(raw,scope,normalizeDevicePagedProviderQuoteV4);}
export function normalizeDevicePagedEconomicOperationRowsAnyV5(raw,scope){return normalizeRows(raw,scope,normalizeDevicePagedProviderQuoteAnyV5);}
function normalizeRows(raw,scope,normalizeQuote){
 const rows=list(raw),seen=new Set();
 return freeze(rows.map((raw,index)=>{
  const row=P.pagedOwnerExactV3(raw,['id','quote','attempt']);identifier(row.id);need(!seen.has(row.id));seen.add(row.id);
  if(row.quote!==null){
   row.quote=normalizeQuote(row.quote);const terms=row.quote.terms;
   for(const key of ['graphId','rootId','revision','budget'])need(terms[key]===scope[key],'MOBILE_PAGED_ECONOMIC_OPERATION_SCOPE');
   need(same(terms.descriptor,scope.descriptor)&&terms.id===row.id&&terms.expiresAt===scope.settleBefore&&terms.ordinal===String(index),'MOBILE_PAGED_ECONOMIC_OPERATION_SCOPE');
  }
  const attempt=P.pagedOwnerExactV3(row.attempt,['stage','nativeId','transactionSHA256','authorizationRoot']);
  need(['NOT_SENT','KEY_PENDING','SIGNED','MINED'].includes(attempt.stage));
  if(attempt.stage==='NOT_SENT')need(attempt.nativeId===null&&attempt.transactionSHA256===null&&attempt.authorizationRoot===null);
  else {
   P.pagedOwnerHexV3(attempt.authorizationRoot);need(attempt.authorizationRoot===scope.authorizationRoot,'MOBILE_PAGED_ECONOMIC_OPERATION_SCOPE');
   if(attempt.stage==='KEY_PENDING')need(attempt.nativeId===null&&attempt.transactionSHA256===null);
   else {
    need(row.quote!==null,'MOBILE_PAGED_ECONOMIC_OPERATION_SIGNED_TERMS');P.pagedOwnerHexV3(attempt.transactionSHA256);
    const family=row.quote.terms.deliver.family;
     if(family==='SOL'&&row.quote.terms.classification==='PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE')normalizePublicSolanaSignatureDataV1(attempt.nativeId);
     else need(typeof attempt.nativeId==='string'&&new RegExp(family==='BTC'?'^[0-9a-f]{64}$':family==='SOL'?'^[0-9a-f]{128}$':'^0x[0-9a-f]{64}$').test(attempt.nativeId));
   }
  }
  return row;
 }));
}
export function normalizeDevicePagedEconomicOperationViewV4(raw,rawDescriptor){return normalizeView(raw,rawDescriptor,normalizeDevicePagedEconomicOperationRowsV4);}
export function normalizeDevicePagedEconomicOperationViewAnyV5(raw,rawDescriptor){return normalizeView(raw,rawDescriptor,normalizeDevicePagedEconomicOperationRowsAnyV5);}
function normalizeView(raw,rawDescriptor,normalizeRows){
 const view=P.pagedOwnerExactV3(raw,['type','profile','descriptor','graphId','rootId','revision','authorizationRoot','phase','pending','nodes','budget','settleBefore','providerIdentity','checkpoint','rows','ledger','settlement']);
 need(view.type==='economic-operation'&&view.profile===DEVICE_PAGED_ECONOMIC_OPERATION_V4);
 view.descriptor=P.normalizeDevicePagedDescriptorV3(view.descriptor);need(same(view.descriptor,P.normalizeDevicePagedDescriptorV3(rawDescriptor)));
 need(typeof view.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(view.graphId));P.pagedOwnerHexV3(view.rootId);need(Number.isSafeInteger(view.revision)&&view.revision>0);
 if(view.authorizationRoot!==null)P.pagedOwnerHexV3(view.authorizationRoot);
 need(['BUILDING','SIGNING','PREPARED','RESERVED','FULFILLED','RECOVERED','UNKNOWN','FAILED'].includes(view.phase)&&typeof view.pending==='boolean');
 need(uint(view.nodes)<=BigInt(DEVICE_PAGED_PAYMENT_LIMIT_V3));uint(view.budget);uint(view.settleBefore);P.pagedOwnerHexV3(view.providerIdentity);
 const checkpoint=P.pagedOwnerExactV3(view.checkpoint,['profile','providerIdentity','configurationSHA256','revision','dataSHA256']);
 need(checkpoint.profile==='ORIGINAL_PAGED_NATIVE_PROVIDER_CHECKPOINT_V3'&&checkpoint.providerIdentity===view.providerIdentity&&Number.isSafeInteger(checkpoint.revision)&&checkpoint.revision>=0&&!Object.is(checkpoint.revision,-0));P.pagedOwnerHexV3(checkpoint.configurationSHA256);P.pagedOwnerHexV3(checkpoint.dataSHA256);
 view.rows=normalizeRows(view.rows,view);need(view.rows.length===Number(view.nodes));
 need(view.rows.reduce((sum,row)=>sum+(row.quote===null?0n:BigInt(row.quote.terms.payout.amountAtomic)),0n)<=BigInt(view.budget));
 const ledger=P.pagedOwnerExactV3(view.ledger,['blockHash','blockNumber','timestamp','outcome','heldAmount','backedAmount']);
 need(/^0x[0-9a-f]{64}$/.test(ledger.blockHash));for(const key of ['blockNumber','timestamp','heldAmount','backedAmount'])uint(ledger[key]);need(uint(ledger.heldAmount)>=uint(ledger.backedAmount));need(['0','1','2','3'].includes(ledger.outcome));
 if(!view.pending&&!['UNKNOWN','FAILED'].includes(view.phase))need(ledger.outcome===({BUILDING:'0',SIGNING:'0',PREPARED:'0',RESERVED:'1',FULFILLED:'2',RECOVERED:'3'})[view.phase]);
 const settlement=P.pagedOwnerExactV3(view.settlement,['outcome','budgetDisposition','retainedConfirmedDeliveryCount','requiresNativeRefresh','ownerRecoveryAvailable','crossAssetValueConservation']);
 const count=view.rows.filter(row=>row.attempt.stage==='MINED').length;
 need(settlement.retainedConfirmedDeliveryCount===String(count)&&settlement.requiresNativeRefresh===true&&settlement.ownerRecoveryAvailable===null&&settlement.crossAssetValueConservation===false);
 const uncertain=view.rows.some(row=>['KEY_PENDING','SIGNED'].includes(row.attempt.stage));
 const terminal=ledger.outcome==='2'?'FULL':ledger.outcome==='3'?(uncertain?'RECOVERED_WITH_UNCERTAIN_DELIVERIES':count?'PARTIAL':'TIMEOUT'):'PENDING';
 need(settlement.outcome===terminal&&settlement.budgetDisposition===({FULL:'PROVIDER_NOTES_ISSUED',PARTIAL:'OWNER_RECOVERY_NOTE_ISSUED',TIMEOUT:'OWNER_RECOVERY_NOTE_ISSUED',RECOVERED_WITH_UNCERTAIN_DELIVERIES:'OWNER_RECOVERY_NOTE_ISSUED',PENDING:ledger.outcome==='1'?'RESERVED':'NOT_RESERVED'})[terminal]);
 need(new TextEncoder().encode(JSON.stringify(view)).length<=2*1024*1024);return freeze(view);
}
