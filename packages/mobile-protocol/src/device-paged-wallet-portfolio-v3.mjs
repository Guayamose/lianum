/** Encrypted wallet observations are DATA, never a spend authorization. */
import * as P from './device-paged-owner-v3.mjs';
import {DEVICE_PAGED_PAYMENT_LIMIT_V3} from './device-paged-payment-list-v3.mjs';

export const DEVICE_PAGED_WALLET_PORTFOLIO_V3='DEVICE_PAGED_WALLET_PORTFOLIO_V3';
const need=value=>{if(!value)throw Error('MOBILE_PAGED_WALLET_PORTFOLIO');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(raw,keys)=>P.pagedOwnerExactV3(P.snapshotDevicePagedWitnessV3(raw),keys);
const uint=value=>{P.pagedOwnerUintV3(value,true);return BigInt(value);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

function output(raw,observed=false){
 const keys=['role','id','commitment','nullifier','amount'];
 const value=exact(raw,observed?[...keys,'issued','state','available']:keys);
 need(['source','change','recovery','payout'].includes(value.role));
 need(value.role==='payout'?typeof value.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value.id):value.id===null);
 P.pagedOwnerHexV3(value.commitment);P.pagedOwnerHexV3(value.nullifier);uint(value.amount);
 if(observed){
  need(typeof value.issued==='boolean'&&['LIVE','SPENT','LOCKED','UNKNOWN'].includes(value.state));
  if(value.state==='LIVE')need(value.issued&&uint(value.amount)>0n&&value.available===value.amount);
  else if(value.state==='UNKNOWN')need(value.available===null);
  else{need(value.available==='0');if(value.state==='SPENT')need(value.issued);}
  if(!value.issued)need(['LOCKED','UNKNOWN'].includes(value.state));
 }
 return value;
}
function outputs(raw,observed=false){
 need(Array.isArray(raw)&&raw.length>=1&&raw.length<=DEVICE_PAGED_PAYMENT_LIMIT_V3+3);
 const ids=new Set(),cms=new Set(),nfs=new Set();
 return raw.map(rawOutput=>{const value=output(rawOutput,observed),id=value.role+':'+(value.id??'');need(!ids.has(id)&&!cms.has(value.commitment)&&!nfs.has(value.nullifier));ids.add(id);cms.add(value.commitment);nfs.add(value.nullifier);return value;});
}
export function normalizeDevicePagedPortfolioRequestV3(raw){
 const value=exact(raw,['outputs']);value.outputs=outputs(value.outputs);return freeze(value);
}
export function normalizeDevicePagedWalletPortfolioV3(raw,rawDescriptor){
 const value=exact(raw,['type','profile','descriptor','graphId','rootId','revision','authorizationRoot','phase','pending','ledger','outputs']);
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor);value.descriptor=P.normalizeDevicePagedDescriptorV3(value.descriptor);
 need(value.type==='wallet-portfolio'&&value.profile===DEVICE_PAGED_WALLET_PORTFOLIO_V3&&same(value.descriptor,descriptor));
 need(typeof value.graphId==='string'&&/^[a-z0-9-]{8,100}$/.test(value.graphId)&&typeof value.rootId==='string'&&/^[a-z0-9-]{8,100}$/.test(value.rootId));
 need(value.revision===1);if(value.authorizationRoot!==null)P.pagedOwnerHexV3(value.authorizationRoot);
 need(['BUILDING','SIGNING','PREPARED','RESERVED','FULFILLED','RECOVERED','UNKNOWN','FAILED'].includes(value.phase)&&typeof value.pending==='boolean');
 const ledger=exact(value.ledger,['blockHash','blockNumber','heldAmount','backedAmount','reservedAmount']);
 need(typeof ledger.blockHash==='string'&&/^0x[0-9a-f]{64}$/.test(ledger.blockHash));uint(ledger.blockNumber);
 need(uint(ledger.heldAmount)>=uint(ledger.backedAmount));
 if(value.pending){need(value.phase==='UNKNOWN'&&ledger.reservedAmount===null);}else{uint(ledger.reservedAmount);need(uint(ledger.reservedAmount)<=uint(ledger.backedAmount));}
 value.ledger=ledger;value.outputs=outputs(value.outputs,true);
 if(value.pending)need(value.outputs.every(row=>row.state==='UNKNOWN'));
 need(value.outputs.filter(row=>row.state==='LIVE').reduce((sum,row)=>sum+uint(row.available),0n)+(ledger.reservedAmount===null?0n:uint(ledger.reservedAmount))<=uint(ledger.backedAmount));
 need(new TextEncoder().encode(JSON.stringify(value)).length<=512*1024);return freeze(value);
}
