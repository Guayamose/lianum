import {types} from 'node:util';
export const fail=code=>{const error=Error('NATIVE_WALLET_'+code);error.code=error.message;throw error;};
export const need=(condition,code='INVALID')=>{if(!condition)fail(code);};
export function exact(raw,required,optional=[]){need(raw&&typeof raw==='object'&&!types.isProxy(raw)&&Object.getPrototypeOf(raw)===Object.prototype,'INVALID');const keys=Reflect.ownKeys(raw);need(keys.every(key=>typeof key==='string'&&required.concat(optional).includes(key))&&required.every(key=>keys.includes(key)),'INVALID');for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);need(d?.enumerable&&Object.hasOwn(d,'value'),'INVALID');}return raw;}
export function uint(value,bits=256){need(typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value),'INTEGER');const n=BigInt(value);need(n<(1n<<BigInt(bits)),'INTEGER');return n;}
export function number(value){need(Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0),'RPC_INTEGER');return BigInt(value);}
export function quantity(value){need(typeof value==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value),'RPC_QUANTITY');return BigInt(value);}
export const q=n=>'0x'+BigInt(n).toString(16);
export function hash(value){need(typeof value==='string'&&/^(?:0x)?[0-9a-f]{64}$/.test(value),'HASH');return value;}
export const clone=value=>structuredClone(value);
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function signalCurrent(signal){need(signal===undefined||signal instanceof AbortSignal,'SIGNAL');need(!signal?.aborted,'CANCELLED');}
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function byteSize(value,max=4194304){need(Buffer.byteLength(JSON.stringify(value))<=max,'DATA_BOUND');return value;}
