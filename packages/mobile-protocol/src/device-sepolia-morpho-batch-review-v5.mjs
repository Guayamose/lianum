/** Aggregate review DATA for an exact Morpho share plan. It cannot create
 * custody or grant issuer authority. Every leaf retains its own pairing/root,
 * reference/receipt and original D27 obligation under the approved USDC sum. */
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex} from './device-external-flat-note-v1.mjs';
import {planDeviceSepoliaMorphoShareNotesV4} from './device-sepolia-defi-share-plan-v4.mjs';
import {normalizeDeviceSepoliaDefiReviewV4} from './device-sepolia-defi-review-v4.mjs';
export const DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5='DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5';
const need=value=>{if(!value)throw Error('DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_DATA');},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function normalizeDeviceSepoliaMorphoBatchReviewV5(raw){
 need(arguments.length===1);const value=exact(raw,['profile','reference','totalSharesAtomic','maximumNodes','maximumInputAtomic','notes']);
 need(value.profile===DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5);hex(value.reference);need(value.reference!=='0'.repeat(64));
 const plan=planDeviceSepoliaMorphoShareNotesV4({totalSharesAtomic:value.totalSharesAtomic,maximumNodes:value.maximumNodes});
 need(Array.isArray(value.notes)&&Object.getPrototypeOf(value.notes)===Array.prototype&&value.notes.length===plan.notes.length&&Reflect.ownKeys(value.notes).length===value.notes.length+1);
 const entries=Array.from({length:value.notes.length},(_,index)=>{const descriptor=Object.getOwnPropertyDescriptor(value.notes,String(index));need(descriptor?.enumerable&&Object.hasOwn(descriptor,'value'));return descriptor.value;});
 need(typeof value.maximumInputAtomic==='string'&&/^[1-9][0-9]{0,38}$/.test(value.maximumInputAtomic)&&BigInt(value.maximumInputAtomic)<(1n<<128n));
 const sets=Object.fromEntries(['pairingId','lifetime','rootId','reference','receiptCommitment'].map(key=>[key,new Set()]));let maximumInput=0n;let first;
 const notes=entries.map((rawNote,index)=>{
  const note=exact(rawNote,['id','review']),review=normalizeDeviceSepoliaDefiReviewV4(note.review),part=plan.notes[index];
  need(note.id===part.id&&review.protocol==='MORPHO_V2'&&review.action==='INVEST'&&review.shares===part.sharesAtomic&&review.reference!==value.reference);
  if(first){for(const key of ['underlyingReceiver','shareWithdrawalRecipient','validFrom','validUntil'])need(review[key]===first[key]);for(const key of ['origin','devicePublicKey','poolTerms','assetMetadata'])need(same(review.descriptor[key],first.descriptor[key]));}else first=review;
  for(const key of Object.keys(sets)){const held=key==='pairingId'||key==='lifetime'?review.descriptor[key]:review[key];need(!sets[key].has(held));sets[key].add(held);}
  maximumInput+=BigInt(review.maximumInputAtomic);return{id:note.id,review};
 });
 need(maximumInput.toString()===value.maximumInputAtomic);return freeze({...value,notes});
}
