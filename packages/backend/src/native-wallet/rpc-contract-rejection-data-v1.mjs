/** Diagnostic DATA only. A provider's reported revert is not independent
 * execution evidence, a retry instruction or any financial permission. */
import {types} from 'node:util';
const reasons=new Set([
 'STALE_EPOCH','OUTSIDE_WINDOW','INVALID_WINDOW','PUBLIC_INPUT_LENGTH','PUBLIC_DOMAIN',
 'PAGED_DEPOSIT_DOMAIN','PAGED_WITHDRAW_DOMAIN','DEPOSIT_BELOW_MINIMUM',
 'DEPOSIT_BALANCE_PROOF','DEPOSIT_INTENT_PROOF','PAGED_WITHDRAW_PROOF',
 'NOTE_ALREADY_SPENT','PAGED_UNISSUED_OUTPUT_ROOT','WITHDRAWAL_TERMS',
]);
const panics=new Set(['0x00','0x01','0x11','0x12','0x21','0x22','0x31','0x32','0x41','0x51']);
function values(raw,keys){
 if(raw===null||typeof raw!=='object'||types.isProxy(raw)||Object.getPrototypeOf(raw)!==Object.prototype)return null;
 const own=Reflect.ownKeys(raw);if(own.length!==keys.length||!own.every(key=>keys.includes(key)))return null;
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return null;out[key]=d.value;}return out;
}
export function normalizeNativeRpcContractRejectionDataV1(raw){
 const reason=values(raw,['reportedBy','kind','reason']);if(reason&&reason.reportedBy==='RPC_PROVIDER'&&reason.kind==='ERROR_STRING'&&reasons.has(reason.reason))return Object.freeze(reason);
 const panic=values(raw,['reportedBy','kind','panicCode']);if(panic&&panic.reportedBy==='RPC_PROVIDER'&&panic.kind==='PANIC'&&panics.has(panic.panicCode))return Object.freeze(panic);
 return null;
}
/** Only direct, canonical ABI data. No message parsing, nested object search,
 * arbitrary selector retention, payload hash or raw bytes are retained. */
export function classifyNativeRpcContractRejectionDataV1(raw){
 if(typeof raw!=='string'||raw.length<10||raw.length>330||!/^0x[0-9a-fA-F]+$/.test(raw)||raw.length%2!==0)return null;
 const data=raw.slice(2).toLowerCase(),selector=data.slice(0,8);
 if(selector==='4e487b71'){
  if(data.length!==72)return null;const n=BigInt('0x'+data.slice(8));if(n>255n)return null;
  return normalizeNativeRpcContractRejectionDataV1({reportedBy:'RPC_PROVIDER',kind:'PANIC',panicCode:'0x'+n.toString(16).padStart(2,'0')});
 }
 if(selector!=='08c379a0'||data.length<136||data.slice(8,72)!=='20'.padStart(64,'0'))return null;
 const n=BigInt('0x'+data.slice(72,136));if(n<1n||n>96n)return null;
 const bytes=Number(n),padded=Math.ceil(bytes/32)*64;if(data.length!==136+padded)return null;
 const text=data.slice(136,136+bytes*2),padding=data.slice(136+bytes*2);if(!/^0*$/.test(padding))return null;
 const reason=Buffer.from(text,'hex').toString('ascii');if(!reasons.has(reason)||Buffer.from(reason,'ascii').toString('hex')!==text)return null;
 return normalizeNativeRpcContractRejectionDataV1({reportedBy:'RPC_PROVIDER',kind:'ERROR_STRING',reason});
}
/** Own data fields only: a getter, Proxy or arbitrary exception is not read. */
export function readNativeRpcContractRejectionDataV1(error){
 if(types.isProxy(error)||!(error instanceof Error))return null;
 const d=Object.getOwnPropertyDescriptor(error,'rpcContractRejection');return d&&Object.hasOwn(d,'value')?normalizeNativeRpcContractRejectionDataV1(d.value):null;
}
