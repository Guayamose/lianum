/** Fixed public provider identity/beneficiary binding. DATA only; no key custody. */
import {boundedPermissionSha256V1} from './bounded-permission-sha256-v1.mjs';
const need=value=>{if(!value)throw Error('MOBILE_PAGED_ECONOMIC_VIEW');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const hex=bytes=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
function bytes(value){return Uint8Array.from(value.match(/../g).map(byte=>parseInt(byte,16)));}
// Fixed public 64-byte Keccak-256, adapted from the original public-native
// kernel. Ethereum's 136-byte rate and 0x01 suffix; no platform crypto or keys.
const MASK=(1n<<64n)-1n,ROT=[0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const RC=[1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n];
const rol=(value,n)=>n===0?value:((value<<BigInt(n))|(value>>BigInt(64-n)))&MASK;
function publicPointKeccak(raw){
 need(raw instanceof Uint8Array&&raw.length===64);const padded=new Uint8Array(136),state=Array(25).fill(0n);padded.set(raw);padded[64]=1;padded[135]=128;
 try{for(let i=0;i<17;i++)for(let j=0;j<8;j++)state[i]^=BigInt(padded[i*8+j])<<BigInt(j*8);
  for(const round of RC){const c=Array.from({length:5},(_,x)=>state[x]^state[x+5]^state[x+10]^state[x+15]^state[x+20]),d=c.map((_,x)=>c[(x+4)%5]^rol(c[(x+1)%5],1));for(let i=0;i<25;i++)state[i]^=d[i%5];const b=Array(25).fill(0n);for(let x=0;x<5;x++)for(let y=0;y<5;y++)b[y+5*((2*x+3*y)%5)]=rol(state[x+5*y],ROT[x+5*y]);for(let x=0;x<5;x++)for(let y=0;y<5;y++)state[x+5*y]=b[x+5*y]^((~b[(x+1)%5+5*y])&b[(x+2)%5+5*y]);state[0]^=round;}
  const result=new Uint8Array(32);for(let i=0;i<32;i++)result[i]=Number((state[Math.floor(i/8)]>>BigInt((i%8)*8))&255n);return result;
 }finally{padded.fill(0);state.fill(0n);}
}
/** Public point linkage only, not proof of key custody or independent solver. */
export function devicePagedEconomicProviderV3(publicKey){
 need(typeof publicKey==='string'&&/^04[0-9a-f]{128}$/.test(publicKey));const x=BigInt('0x'+publicKey.slice(2,66)),y=BigInt('0x'+publicKey.slice(66)),prime=(1n<<256n)-(1n<<32n)-977n;need(x<prime&&y<prime&&(y*y)%prime===(x*x*x+7n)%prime);
 const point=bytes(publicKey.slice(2)),tag=new TextEncoder().encode('LIANUM/PAEG/provider-identity/2'),profile=new TextEncoder().encode('LIANUM_PAEG_NATIVE_4_V2'),parts=[tag,profile,point.subarray(0,32),point.subarray(32)],frame=new Uint8Array(parts.reduce((sum,part)=>sum+4+part.length,0));let digest,keccak;
 try{let offset=0;for(const part of parts){new DataView(frame.buffer).setUint32(offset,part.length,false);offset+=4;frame.set(part,offset);offset+=part.length;}digest=boundedPermissionSha256V1(frame);keccak=publicPointKeccak(point);return freeze({publicKey,signerIdentity:hex(digest),address:'0x'+hex(keccak.subarray(12))});}finally{point.fill(0);frame.fill(0);digest?.fill(0);keccak?.fill(0);}
}
