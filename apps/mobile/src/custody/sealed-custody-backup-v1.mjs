/** Explicit local backup only. Passphrases and plaintext never enter a service.
 * Same fixed scrypt work factor as the original private Vault; native AES-GCM.
 * Mutable secret buffers are wiped. JS strings/native handles are not erasable. */
import * as Crypto from 'expo-crypto';
import {scryptAsync} from '@noble/hashes/scrypt.js';

export const DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1=65536;
export const DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1=98304;
const PROFILE='LIANUM_SEALED_DEVICE_CUSTODY_BACKUP_V1';
const KDF=Object.freeze({name:'scrypt',N:32768,r:8,p:1});
const CIPHER='AES-256-GCM';
const encoder=new TextEncoder();
const fail=(code='MOBILE_CUSTODY_BACKUP_INVALID')=>{throw Error(code);};
const need=(ok,code)=>{if(!ok)fail(code);};
/** @typedef {{profile:'DEVICE_IDENTITY_CUSTODY_V1'|'DEVICE_EXTERNAL_FLAT_CUSTODY_V1',devicePublicKey:string,routeSHA256:string|null}} DeviceCustodyBackupBindingV1 */
function exact(raw,keys){
 need(raw!==null&&typeof raw==='object'&&!Array.isArray(raw)&&(Object.getPrototypeOf(raw)===Object.prototype||Object.getPrototypeOf(raw)===null));
 const ds=Object.getOwnPropertyDescriptors(raw),actual=Reflect.ownKeys(ds);need(actual.length===keys.length);
 for(const k of actual)need(typeof k==='string'&&keys.includes(k)&&ds[k].enumerable&&Object.hasOwn(ds[k],'value'));
 return raw;
}
function binding(raw){const v=exact(raw,['profile','devicePublicKey','routeSHA256']);
 need(['DEVICE_IDENTITY_CUSTODY_V1','DEVICE_EXTERNAL_FLAT_CUSTODY_V1'].includes(v.profile));
 need(typeof v.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.exec(v.devicePublicKey)?.[0]===v.devicePublicKey);
 need(v.profile==='DEVICE_IDENTITY_CUSTODY_V1'?v.routeSHA256===null:typeof v.routeSHA256==='string'&&/^[0-9a-f]{64}$/.exec(v.routeSHA256)?.[0]===v.routeSHA256);
 return Object.freeze({profile:v.profile,devicePublicKey:v.devicePublicKey,routeSHA256:v.routeSHA256});
}
function current(signal){if(signal?.aborted)fail('MOBILE_CUSTODY_BACKUP_CANCELLED');}
function passwordBytes(passphrase){need(typeof passphrase==='string'&&passphrase.length>=12&&passphrase.length<=1024,'MOBILE_CUSTODY_BACKUP_PASSWORD');
 const bytes=encoder.encode(passphrase);if(bytes.length>1024){bytes.fill(0);fail('MOBILE_CUSTODY_BACKUP_PASSWORD');}return bytes;}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const saltBytes=salt=>Uint8Array.from(salt.match(/../g),p=>parseInt(p,16));
function header(v){return{version:1,profile:PROFILE,binding:v.binding,kdf:v.kdf,cipher:CIPHER};}
function sealed(v){const maximum=Math.ceil((DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1+28)/3)*4;
 need(typeof v==='string'&&v.length>=40&&v.length<=maximum&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.exec(v)?.[0]===v);return v;}
function envelope(serialized,expected){need(typeof serialized==='string'&&serialized.length<=DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1);
 need(encoder.encode(serialized).length<=DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1);let v;try{v=JSON.parse(serialized);}catch{fail();}
 exact(v,['version','profile','binding','kdf','cipher','sealed']);need(v.version===1&&v.profile===PROFILE&&v.cipher===CIPHER);
 const b=binding(v.binding);need(JSON.stringify(b)===JSON.stringify(expected),'MOBILE_CUSTODY_BACKUP_BINDING');
 const k=exact(v.kdf,['name','N','r','p','salt']);need(k.name===KDF.name&&k.N===KDF.N&&k.r===KDF.r&&k.p===KDF.p);
 need(typeof k.salt==='string'&&/^[0-9a-f]{64}$/.exec(k.salt)?.[0]===k.salt);
 return{...header({binding:b,kdf:{...KDF,salt:k.salt}}),sealed:sealed(v.sealed)};
}
/** @param {Uint8Array} clearBytes @param {string} passphrase @param {DeviceCustodyBackupBindingV1} rawBinding @param {AbortSignal} [signal] @returns {Promise<string>} */
export async function sealDeviceCustodyBackupV1(clearBytes,passphrase,rawBinding,signal){
 need(arguments.length===3||arguments.length===4);current(signal);const b=binding(rawBinding);
 need(clearBytes instanceof Uint8Array);const length=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteLength').get.call(clearBytes);
 need(length>0&&length<=DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1);const clear=new Uint8Array(length);Uint8Array.prototype.set.call(clear,clearBytes);let password,keyBytes,salt,aad;
 try{need(clear.length>0&&clear.length<=DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1);password=passwordBytes(passphrase);passphrase='';
  salt=await Crypto.getRandomBytesAsync(32);current(signal);need(salt instanceof Uint8Array&&salt.length===32);
  const h=header({binding:b,kdf:{...KDF,salt:hex(salt)}});aad=encoder.encode(JSON.stringify(h));
  keyBytes=await scryptAsync(password,salt,{N:KDF.N,r:KDF.r,p:KDF.p,dkLen:32,maxmem:64*1024*1024,asyncTick:10});current(signal);
  const key=await Crypto.AESEncryptionKey.import(keyBytes);current(signal);
  const encrypted=await Crypto.aesEncryptAsync(clear,key,{nonce:{length:12},tagLength:16,additionalData:aad});current(signal);
  const combined=sealed(await encrypted.combined('base64'));current(signal);const result=JSON.stringify({...h,sealed:combined});
  need(encoder.encode(result).length<=DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1);return result;
 }finally{clear.fill(0);password?.fill(0);keyBytes?.fill(0);salt?.fill(0);aad?.fill(0);passphrase='';}
}
/** Returns private bytes only to the local restoring consumer; it must wipe them.
 * No SDK/authority/freshness is created by decrypting a backup.
 * @param {string} serialized @param {string} passphrase @param {DeviceCustodyBackupBindingV1} rawBinding @param {AbortSignal} [signal] @returns {Promise<Uint8Array>} */
export async function unsealDeviceCustodyBackupV1(serialized,passphrase,rawBinding,signal){
 need(arguments.length===3||arguments.length===4);current(signal);const b=binding(rawBinding),v=envelope(serialized,b);let password,keyBytes,salt,aad,clear;let returned=false;
 try{password=passwordBytes(passphrase);passphrase='';salt=saltBytes(v.kdf.salt);aad=encoder.encode(JSON.stringify(header(v)));
  keyBytes=await scryptAsync(password,salt,{N:KDF.N,r:KDF.r,p:KDF.p,dkLen:32,maxmem:64*1024*1024,asyncTick:10});current(signal);
  const key=await Crypto.AESEncryptionKey.import(keyBytes);current(signal);
  try{clear=await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(v.sealed,{ivLength:12,tagLength:16}),key,{output:'bytes',additionalData:aad});}
  catch{current(signal);fail('MOBILE_CUSTODY_BACKUP_AUTHENTICATION');}
  current(signal);need(clear instanceof Uint8Array&&clear.length>0&&clear.length<=DEVICE_CUSTODY_BACKUP_MAX_CLEAR_BYTES_V1);returned=true;return clear;
 }finally{if(!returned)clear?.fill(0);password?.fill(0);keyBytes?.fill(0);salt?.fill(0);aad?.fill(0);passphrase='';}
}
