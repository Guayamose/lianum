/** Share-quantity DATA only. Splitting never quotes assets, signs a review,
 * creates custody or issues a Source/PAEG execution capability. */
import {externalFlatExactV1 as exact} from './device-external-flat-note-v1.mjs';
export const DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4='DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4';
export const MAXIMUM_SHARE_NOTE_ATOMIC_V4='18446744073709551615';
const maximum=BigInt(MAXIMUM_SHARE_NOTE_ATOMIC_V4),minimum=1000000000000000000n,pageSize=64;
const need=(condition,code)=>{if(!condition)throw Error(code);};
const integer=value=>{need(typeof value==='string'&&/^[1-9][0-9]{0,38}$/.test(value),'DEFI_SHARE_PLAN_CANONICAL_SHARES');return BigInt(value);};
export function planDeviceSepoliaMorphoShareNotesV4(raw){
 need(arguments.length===1,'DEFI_SHARE_PLAN_ARGUMENTS');
 const input=exact(raw,['totalSharesAtomic','maximumNodes']);
 const total=integer(input.totalSharesAtomic),limit=input.maximumNodes;
 need(Number.isSafeInteger(limit)&&limit>=1&&limit<=256,'DEFI_SHARE_PLAN_NODE_LIMIT');
 need(total>=minimum,'DEFI_SHARE_PLAN_BELOW_MINIMUM');
 const count=(total+maximum-1n)/maximum;
 need(count<=BigInt(limit),'DEFI_SHARE_PLAN_TOO_MANY_NOTES');
 // Balanced shares preserve every atomic unit and avoid a dust final note.
 // Asset previews must subsequently be obtained for THESE exact quantities.
 const base=total/count,remainder=total%count;
 need(base>=minimum,'DEFI_SHARE_PLAN_UNREPRESENTABLE');
 const notes=Array.from({length:Number(count)},(_,index)=>{
  const shares=base+(BigInt(index)<remainder?1n:0n);
  need(shares>=minimum&&shares<=maximum,'DEFI_SHARE_PLAN_NOTE_RANGE');
  return Object.freeze({id:'share-'+String(index).padStart(4,'0'),pageIndex:Math.floor(index/pageSize),noteIndex:index%pageSize,sharesAtomic:shares.toString()});
 });
 return Object.freeze({profile:DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4,protocol:'MORPHO_V2',shareDecimals:18,totalSharesAtomic:total.toString(),minimumNoteSharesAtomic:minimum.toString(),maximumNoteSharesAtomic:maximum.toString(),pageSize,pages:Math.ceil(notes.length/pageSize),notes:Object.freeze(notes),financialAuthority:false,quotesRequired:true,originalCustodyPerNoteRequired:true});
}
