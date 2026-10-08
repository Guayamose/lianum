/** Fixed local synthetic-chain custody signing. This is not device custody.
 * Private keys never enter a process argument, RPC request or public receipt. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FLAT} from '../../../../../proofs/src/catalog.mjs';
import {inspectNativeValueDevMobileDependenciesV5} from '../../../operations/releases/native-value/native-value-dev-source-pins-v5.mjs';
import {publicKeccak256} from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
const APP=resolve(FLAT,'../../../apps/mobile');
const require=createRequire(join(APP,'src/custody/signing.mjs'));
async function curve(){
 inspectNativeValueDevMobileDependenciesV5();
 const entry=require.resolve('@noble/curves/secp256k1.js');
 assert.equal(realpathSync(entry),join(APP,'node_modules/@noble/curves/secp256k1.js'));
 const {secp256k1}=await import(pathToFileURL(entry).href);
 inspectNativeValueDevMobileDependenciesV5();return secp256k1;
}
const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const uint=value=>{assert.ok(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.exec(value)?.[0]===value&&value.length<=78);const n=BigInt(value);assert.ok(n<1n<<256n);return n;};
const integer=n=>{if(n===0n)return Buffer.alloc(0);let h=n.toString(16);if(h.length%2)h='0'+h;return Buffer.from(h,'hex');};
function length(n,offset){if(n<56)return Buffer.from([offset+n]);const raw=integer(BigInt(n));return Buffer.concat([Buffer.from([offset+55+raw.length]),raw]);}
function rlp(value){if(Array.isArray(value)){const raw=Buffer.concat(value.map(rlp));return Buffer.concat([length(raw.length,0xc0),raw]);}return value.length===1&&value[0]<0x80?value:Buffer.concat([length(value.length,0x80),value]);}
function fields(tx){
 assert.ok(tx&&Object.getPrototypeOf(tx)===Object.prototype);assert.deepEqual(Reflect.ownKeys(tx).sort(),['chainId','data','from','gas','gasPrice','nonce','to','value']);
 for(const key of Reflect.ownKeys(tx))assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(tx,key)??{},'value'));
 for(const key of ['from','to'])assert.ok(key==='to'&&tx[key]===null||typeof tx[key]==='string'&&/^0x[0-9a-f]{40}$/.exec(tx[key])?.[0]===tx[key]);
 assert.ok(typeof tx.data==='string'&&tx.data.length<=262146&&/^0x(?:[0-9a-f]{2})*$/.exec(tx.data)?.[0]===tx.data);
 assert.ok(uint(tx.chainId)>0n&&uint(tx.gas)>0n);
 return [integer(uint(tx.nonce)),integer(uint(tx.gasPrice)),integer(uint(tx.gas)),Buffer.from(tx.to?.slice(2)??'','hex'),integer(uint(tx.value)),Buffer.from(tx.data.slice(2),'hex')];
}
export async function nativeEconomicLocalAddressV2(key){
 assert.equal(arguments.length,1);assert.ok(key instanceof Uint8Array&&key.length===32);
 const held=Buffer.from(key);try{const ec=await curve();assert.ok(ec.utils.isValidSecretKey(held),'NATIVE_ECONOMIC_KEY_INVALID');
 return '0x'+Buffer.from(publicKeccak256(ec.getPublicKey(held,false).subarray(1))).subarray(12).toString('hex');}finally{held.fill(0);}
}
// Cryptographic preparation is separate from the original custody's final key
// gate. Only its synchronous consumer may use the loaded curve and held key.
// This token conveys no runtime, custody, nonce or transaction authorization.
const preparedSigners=new WeakMap();
export async function prepareNativeEconomicLocalSignerV2(key,transaction){
 assert.equal(arguments.length,2);assert.ok(key instanceof Uint8Array&&key.length===32);
 const body=fields(transaction),tx=structuredClone(transaction),chain=uint(tx.chainId);
 const unsigned=rlp([...body,integer(chain),Buffer.alloc(0),Buffer.alloc(0)]),digest=publicKeccak256(unsigned);
 const held=Buffer.from(key);let retained=false;
 try{
  const ec=await curve();assert.ok(ec.utils.isValidSecretKey(held),'NATIVE_ECONOMIC_KEY_INVALID');
  const pub=ec.getPublicKey(held,false),from='0x'+Buffer.from(publicKeccak256(pub.subarray(1))).subarray(12).toString('hex');
  assert.equal(from,tx.from,'NATIVE_ECONOMIC_SIGNER_WRONG_ACCOUNT');
  const token=Object.freeze(Object.create(null));
  preparedSigners.set(token,{ec,held,pub,from,body,chain,unsigned,digest,closed:false});retained=true;return token;
 }finally{if(!retained)held.fill(0);}
}
export function revokeNativeEconomicLocalSignerV2(token){
 assert.equal(arguments.length,1);const state=preparedSigners.get(token);
 assert.ok(state,'NATIVE_ECONOMIC_ORIGINAL_PREPARED_SIGNER_REQUIRED');state.closed=true;state.held.fill(0);
 return Object.freeze({revoked:true});
}
/** No await, import, dependency hash, storage, RPC, callback or external key
 * read can intervene between the original final custody guard and key use. */
export function consumeNativeEconomicLocalSignerV2(token){
 assert.equal(arguments.length,1);const state=preparedSigners.get(token);
 assert.ok(state&&!state.closed,'NATIVE_ECONOMIC_PREPARED_SIGNER_CLOSED_OR_USED');state.closed=true;
 const {ec,held,pub,from,body,chain,unsigned,digest}=state;
 try{
  const signature=ec.sign(digest,held,{prehash:false,lowS:true,format:'recovered'});
  assert.equal(signature.length,65);const parity=signature[0];assert.ok(parity===0||parity===1,'NATIVE_ECONOMIC_EIP155_RECOVERY_BIT');
  const r=BigInt('0x'+Buffer.from(signature.subarray(1,33)).toString('hex')),s=BigInt('0x'+Buffer.from(signature.subarray(33)).toString('hex'));
  assert.ok(r>0n&&r<order&&s>0n&&s<=order/2n,'NATIVE_ECONOMIC_EIP155_LOW_S');
  assert.ok(ec.verify(signature,digest,pub,{prehash:false,lowS:true,format:'recovered'}),'NATIVE_ECONOMIC_EIP155_SIGNATURE_INVALID');
  assert.deepEqual(ec.recoverPublicKey(signature,digest,{prehash:false}),ec.getPublicKey(held,true),'NATIVE_ECONOMIC_EIP155_RECOVERED_KEY');
  const raw=rlp([...body,integer(chain*2n+35n+BigInt(parity)),integer(r),integer(s)]);
  return Object.freeze({nativeWire:'0x'+raw.toString('hex'),unsignedWire:'0x'+unsigned.toString('hex'),nativeId:'0x'+Buffer.from(publicKeccak256(raw)).toString('hex'),from});
 }finally{held.fill(0);}
}
/** Pure compatibility signing helper. Economic runtime key use must select the
 * prepared synchronous consumer through its own original private custody. */
export async function signNativeEconomicLocalTransactionV2(key,transaction){
 assert.equal(arguments.length,2);return consumeNativeEconomicLocalSignerV2(await prepareNativeEconomicLocalSignerV2(key,transaction));
}
