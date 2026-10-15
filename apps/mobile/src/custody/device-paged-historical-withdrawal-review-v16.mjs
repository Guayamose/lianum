/** Local custody views for one terminal note and a fresh withdrawal broker.
 * The issuer requires the private custody ROOT preimage. No key, opening,
 * old graph permission, proof capability or signing callback is returned. */
import {sha256} from '@noble/hashes/sha2.js';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
const held=new WeakMap(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const need=value=>{if(!value)throw Error('MOBILE_PAGED_HISTORICAL_WITHDRAWAL');};
function same(a,b){if(Object.is(a,b))return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const left=Reflect.ownKeys(a),right=Reflect.ownKeys(b);return left.length===right.length&&left.every(key=>right.includes(key)&&same(a[key],b[key]));}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function createDevicePagedHistoricalWithdrawalViewIssuerV16(rootBytes,rawDescriptor,current,revision){
 need(rootBytes instanceof Uint8Array&&rootBytes.length===32&&typeof current==='function'&&Number.isSafeInteger(revision)&&revision>0);
 const rootId=hex(sha256(rootBytes)),descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor);
 return Object.freeze({review(raw,active){
  current();need(typeof active==='function');active();const value=structuredClone(P.pagedOwnerExactV3(raw,['sourceDescriptor','brokerDescriptor','rootId','revision','graphId','authorizationRoot','phase','role','id','commitment','nullifier','amount','epoch','recipient','x','y','message','expiresAt']));
  need(same(value.sourceDescriptor,descriptor)&&value.rootId===rootId&&value.revision===revision&&/^paged-graph-[0-9a-f]{32}$/.test(value.graphId));
  const broker=P.normalizeDevicePagedDescriptorV3(value.brokerDescriptor);need(broker.pairingId!==descriptor.pairingId&&broker.deadlineMs>P.devicePagedNowV3());
  for(const key of new Set([...Object.keys(descriptor),...Object.keys(broker)].filter(key=>!['pairingId','deadlineMs','chainDeadlineSeconds'].includes(key))))need(same(broker[key],descriptor[key]));
  need(['FULFILLED','RECOVERED'].includes(value.phase)&&['change','recovery','payout'].includes(value.role));need(value.role==='payout'?value.phase==='FULFILLED'&&typeof value.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value.id):value.id===null);if(value.role==='recovery')need(value.phase==='RECOVERED');
  for(const key of ['authorizationRoot','commitment','nullifier','x','y'])P.pagedOwnerHexV3(value[key]);P.pagedOwnerUintV3(value.amount);need(BigInt(value.amount)>0n);P.pagedOwnerUintV3(value.epoch,true);
  need(/^0x[0-9a-f]{40}$/.test(value.recipient)&&value.recipient!=='0x'+'0'.repeat(40)&&/^(?:[0-9a-f]{2})+$/.test(value.message)&&value.message.length<=8192);
  need(Number.isSafeInteger(value.expiresAt)&&value.expiresAt>P.devicePagedNowV3()&&value.expiresAt<=Math.min(P.devicePagedNowV3()+60000,broker.deadlineMs));
  const result=freeze(value);held.set(result,{value:result,current:()=>{current();active();}});return result;
 }});
}
export function assertDevicePagedHistoricalWithdrawalReviewActiveV16(raw){const row=raw&&typeof raw==='object'?held.get(raw):null;need(row);row.current();need(P.devicePagedNowV3()<row.value.brokerDescriptor.deadlineMs);return row.value;}
export function readDevicePagedHistoricalWithdrawalReviewV16(raw){const value=assertDevicePagedHistoricalWithdrawalReviewActiveV16(raw);need(P.devicePagedNowV3()<value.expiresAt);return value;}
