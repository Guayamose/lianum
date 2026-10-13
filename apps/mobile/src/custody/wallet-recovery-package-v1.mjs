/** An authenticated inventory of original encrypted custody cuts. Decryption
 * creates no SDK observation, permission, backend journal or economic grant. */
import {sha256} from '@noble/hashes/sha2.js';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizePublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';
import {sealDeviceCustodyBackupV1,unsealDeviceCustodyBackupV1} from './sealed-custody-backup-v1.mjs';
export const WALLET_RECOVERY_MAX_BYTES_V1=32*1024*1024;
const FORMAT='LIANUM_WALLET_RECOVERY_PACKAGE_V1',MANIFEST='LIANUM_WALLET_RECOVERY_MANIFEST_V1',encoder=new TextEncoder();
const fail=()=>{throw Error('MOBILE_WALLET_RECOVERY_PACKAGE');},need=value=>{if(!value)fail();};
const hash=text=>{const bytes=encoder.encode(text);try{return Array.from(sha256(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}finally{bytes.fill(0);}};
const exact=(raw,keys)=>{need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===keys.length);for(const key of keys){const d=Object.getOwnPropertyDescriptor(raw,key);need(d?.enumerable&&Object.hasOwn(d,'value'));}return raw;};
const inventories=new WeakMap(),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const binding=key=>({profile:'DEVICE_WALLET_RECOVERY_MANIFEST_V1',devicePublicKey:key,routeSHA256:null});
const publicKey=key=>need(typeof key==='string'&&/^04[0-9a-f]{128}$/.test(key));
const current=signal=>{if(signal?.aborted)throw Error('MOBILE_CUSTODY_BACKUP_CANCELLED');};
function part(kind,payload){need(typeof payload==='string'&&payload.length>0&&payload.length<=17*1024*1024);return{kind,id:hash(kind+'\n'+payload),payload};}
function custody(kind,payload,key){
 need(['PAGED_NOTE','PAGED_GRAPH','EXTERNAL_FLAT'].includes(kind));const v=exact(JSON.parse(payload),['descriptor','backup']);need(typeof v.backup==='string'&&v.backup.length>0);
 const descriptor=kind==='EXTERNAL_FLAT'?normalizeExternalFlatDescriptorV1(v.descriptor):P.normalizeDevicePagedDescriptorV3(v.descriptor);need(descriptor.devicePublicKey===key);
 if(kind!=='EXTERNAL_FLAT'){const cut=JSON.parse(v.backup);need(cut.format==='DEVICE_PAGED_NOTE_BACKUP_PACKAGE_V3'&&cut.mode===(kind==='PAGED_GRAPH'?'GRAPH':'NOTE')&&JSON.stringify(cut.descriptor)===JSON.stringify(descriptor));}
 return{kind,descriptor,backup:v.backup};
}
function entries(parts,key){
 need(Array.isArray(parts)&&parts.length>0&&parts.length<=129);const ids=new Set(),routes=new Set(),profiles=[],cuts=[];let identity=null;
 for(const raw of parts){const p=exact(raw,['kind','id','payload']);need(typeof p.id==='string'&&p.id===part(p.kind,p.payload).id&&!ids.has(p.id));ids.add(p.id);
  if(p.kind==='IDENTITY'){need(identity===null&&p.payload.length<=98304);identity=p.payload;}
  else if(p.kind==='CONNECTION'){const entry=normalizePublicWalletConnectionV1(p.payload,key);need(entry.profile===p.payload);profiles.push(entry);}
  else{const cut=custody(p.kind,p.payload,key),route=cut.kind+'\n'+JSON.stringify(cut.descriptor);need(!routes.has(route));routes.add(route);cuts.push(cut);}
 }
 need(identity!==null);for(const cut of cuts)need(profiles.some(entry=>entry.descriptors.some(d=>JSON.stringify(d)===JSON.stringify(cut.descriptor))));
 return{identity,profiles,cuts};
}
export async function createWalletRecoveryPackageV1({devicePublicKey,identityBackup,connections,custodies},passphrase,signal){
 publicKey(devicePublicKey);current(signal);need(Array.isArray(connections)&&connections.length<=32&&Array.isArray(custodies)&&custodies.length<=96);
 const parts=[part('IDENTITY',identityBackup),...connections.map(text=>part('CONNECTION',normalizePublicWalletConnectionV1(text,devicePublicKey).profile)),...custodies.map(cut=>part(cut.kind,JSON.stringify({descriptor:cut.descriptor,backup:cut.backup})))],validated=entries(parts,devicePublicKey);
 const manifest={format:MANIFEST,devicePublicKey,scope:'REGISTERED_DEVICE_CUSTODIES',createdAt:Date.now(),parts:parts.map(p=>({kind:p.kind,id:p.id,length:p.payload.length})),backendRequired:validated.profiles.filter(entry=>entry.kind==='POSITIONS').map(entry=>({kind:'POSITIONS',origin:entry.origin,pairingId:entry.descriptors[0].pairingId})),excluded:['UNREGISTERED_LEGACY_CUSTODIES','BACKEND_POSITION_JOURNALS']};
 const clear=encoder.encode(JSON.stringify(manifest));let sealed;
 try{sealed=await sealDeviceCustodyBackupV1(clear,passphrase,binding(devicePublicKey),signal);current(signal);}finally{clear.fill(0);passphrase='';}
 const serialized=JSON.stringify({format:FORMAT,devicePublicKey,manifest:sealed,parts}),bytes=encoder.encode(serialized);try{need(bytes.length<=WALLET_RECOVERY_MAX_BYTES_V1);return serialized;}finally{bytes.fill(0);}
}
export function walletRecoveryPackagePublicKeyV1(serialized){
 need(typeof serialized==='string'&&serialized.length>0&&serialized.length<=WALLET_RECOVERY_MAX_BYTES_V1);const bytes=encoder.encode(serialized);try{need(bytes.length<=WALLET_RECOVERY_MAX_BYTES_V1);}finally{bytes.fill(0);}const v=exact(JSON.parse(serialized),['format','devicePublicKey','manifest','parts']);need(v.format===FORMAT);publicKey(v.devicePublicKey);return v.devicePublicKey;
}
export async function openWalletRecoveryPackageV1(serialized,passphrase,expectedPublicKey,signal){
 publicKey(expectedPublicKey);current(signal);need(walletRecoveryPackagePublicKeyV1(serialized)===expectedPublicKey);const packet=JSON.parse(serialized),validated=entries(packet.parts,expectedPublicKey);let clear;
 try{clear=await unsealDeviceCustodyBackupV1(packet.manifest,passphrase,binding(expectedPublicKey),signal);current(signal);const m=exact(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear)),['format','devicePublicKey','scope','createdAt','parts','backendRequired','excluded']);need(m.format===MANIFEST&&m.devicePublicKey===expectedPublicKey&&m.scope==='REGISTERED_DEVICE_CUSTODIES'&&Number.isSafeInteger(m.createdAt)&&m.createdAt>0);need(JSON.stringify(m.parts)===JSON.stringify(packet.parts.map(p=>({kind:p.kind,id:p.id,length:p.payload.length}))));const required=validated.profiles.filter(entry=>entry.kind==='POSITIONS').map(entry=>({kind:'POSITIONS',origin:entry.origin,pairingId:entry.descriptors[0].pairingId}));need(JSON.stringify(m.backendRequired)===JSON.stringify(required)&&JSON.stringify(m.excluded)===JSON.stringify(['UNREGISTERED_LEGACY_CUSTODIES','BACKEND_POSITION_JOURNALS']));const value=freeze({devicePublicKey:expectedPublicKey,createdAt:m.createdAt,identityBackup:validated.identity,connections:validated.profiles.map(entry=>entry.profile),custodies:validated.cuts,backendRequired:required,excluded:m.excluded});inventories.set(value,{packageSHA256:hash(serialized),signal});return value;}
 finally{clear?.fill(0);passphrase='';serialized='';}
}

/** Same password-authenticated package only; no caller DTO can issue recovery. */
export function readWalletRecoveryInventoryV1(raw,serialized,signal){need(typeof serialized==='string'&&serialized.length>0&&serialized.length<=WALLET_RECOVERY_MAX_BYTES_V1);const own=raw&&typeof raw==='object'?inventories.get(raw):null;need(own&&signal instanceof AbortSignal&&own.signal===signal&&own.packageSHA256===hash(serialized));current(signal);return raw;}
