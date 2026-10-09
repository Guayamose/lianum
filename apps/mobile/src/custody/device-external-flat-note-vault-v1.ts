/** A NEW device root namespace and one PC23 ERC20 source note. No Linux owner,
 * NativeValue reservation, root export, rollover, or key rotation. SecureStore
 * is not an anti-rollback store; an ambiguous write fences this root. */
import * as Store from 'expo-secure-store';
import * as Auth from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {sha256} from '@noble/hashes/sha2.js';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {bytesToHex,privateKeyFromHex,signDeviceMessage} from './signing.mjs';
import {localBalanceCommitmentMessageV1,localBalanceDepositMessageV1,localNoteHexBytesV1} from './balance-note-codec-v1.mjs';
import {localDeviceWithdrawalStatementV1,localDeviceWithdrawalFrameV1,localDeviceWithdrawalWitnessV1} from './device-balance-withdrawal-codec-v1.mjs';
import {readDeviceExternalFlatRowV1,readDeviceExternalFlatStatusV1,readDeviceExternalFlatQuoteV1} from '../api/device-external-flat-note-api-v1.mjs';
import * as P from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatDescriptor,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatRow,ExternalFlatAction} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
const PROFILE=P.DEVICE_EXTERNAL_FLAT_NOTE_V1,ROOT='lianum.external-flat.root.v1',POINTER='lianum.external-flat.pointer.v1',MANIFEST='lianum.external-flat.record.v1';
const PRIVATE:Store.SecureStoreOptions={requireAuthentication:true,keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.external-flat.root.v1',authenticationPrompt:'Abrir tu nota ERC20 local'};
const DATA:Store.SecureStoreOptions={keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.external-flat.ciphertext.v1'};
const digest=(b:Uint8Array)=>bytesToHex(sha256(b)),utf=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)),same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const need=(ok:unknown,code='MOBILE_EXTERNAL_FLAT_BINDING')=>{if(!ok)throw Error(code);};
const wipeState=(value:any)=>{if(value?.note){P.externalFlatWipeV1(value.note.opening);value.note.privateKey=null;}if(value)value.note=null;};
const chunk=(hash:string,i:number)=>'lianum.external-flat.chunk.v1.'+hash+'.'+i;
const words=(s:string)=>{const b=localNoteHexBytesV1(s);return Array.from({length:8},(_,i)=>b[i*4]*16777216+b[i*4+1]*65536+b[i*4+2]*256+b[i*4+3]);};
let occupied=false;
export type DeviceExternalFlatSummary={profile:string;rootId:string;noteRevision:number;descriptor:ExternalFlatDescriptor|null;recipient:string|null;amount:string|null;commitment:string|null;jobs:ExternalFlatRow[];pending:{jobId:string;action:ExternalFlatAction}|null;storageAvailable:boolean};
export type DeviceExternalFlatPrepared={draft:ExternalFlatDraft;witness:any};
export async function createDeviceExternalFlatNoteVaultV1(){
 need(!occupied,'MOBILE_EXTERNAL_FLAT_ALREADY_OPEN');occupied=true;let closed=false,poisoned=false,busy=false,active:Promise<any>|null=null;
 const live=()=>need(!closed&&!poisoned,'MOBILE_EXTERNAL_FLAT_UNAVAILABLE');
 async function protectedStorage(){live();need(['ios','android'].includes(Platform.OS)&&await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');live();}
 async function approve(){await protectedStorage();const a=await Auth.authenticateAsync({promptMessage:'Abrir la raíz separada de tu nota ERC20',cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});live();need(a.success,'MOBILE_AUTHENTICATION_CANCELLED');}
 async function get(key:string,options=DATA){const v=await Store.getItemAsync(key,options);live();return v;}
 async function put(key:string,value:string,options=DATA){need(value.length<=2048,'MOBILE_EXTERNAL_FLAT_CAPACITY');await Store.setItemAsync(key,value,options);live();need(await get(key,options)===value,'MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN');}
 function pointer(raw:string){const p=P.externalFlatExactV1(JSON.parse(raw),['profile','rootId','revision','recordSHA256','state']);need(p.profile===PROFILE&&Number.isSafeInteger(p.revision)&&p.revision>=0&&['CREATING','WRITING','ACTIVE'].includes(p.state));P.externalFlatHexV1(p.rootId);if(p.recordSHA256!==null)P.externalFlatHexV1(p.recordSHA256);return p;}
 async function envelope(){const raw=await get(MANIFEST);need(raw!==null,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');const m=P.externalFlatExactV1(JSON.parse(raw!),['profile','sha256','bytes','chunks']);need(m.profile===PROFILE&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=16384&&m.chunks===Math.ceil(m.bytes/1500)&&m.chunks<=11);P.externalFlatHexV1(m.sha256);const parts:string[]=[];
  for(let i=0;i<m.chunks;i++){const part=await get(chunk(m.sha256,i));need(part!==null&&part.length===Math.min(1500,m.bytes-i*1500)&&/^[\x20-\x7e]*$/.exec(part)?.[0]===part,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');parts.push(part!);}
  const joined=parts.join('');need(digest(new TextEncoder().encode(joined))===m.sha256&&await get(MANIFEST)===raw,'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');return{raw:joined,sha256:m.sha256};}
 function state(value:any){P.externalFlatExactV1(value,['profile','rootId','noteRevision','descriptor','note','jobs','pending','prepared']);need(value.profile===PROFILE&&value.noteRevision===1);P.externalFlatHexV1(value.rootId);need(Array.isArray(value.jobs)&&value.jobs.length<=2);value.jobs=value.jobs.map(P.normalizeExternalFlatRowV1);need(new Set(value.jobs.map((r:ExternalFlatRow)=>r.jobId)).size===value.jobs.length&&new Set(value.jobs.map((r:ExternalFlatRow)=>r.mode)).size===value.jobs.length);
  if(value.descriptor!==null)value.descriptor=P.normalizeExternalFlatDescriptorV1(value.descriptor);
  if(value.note!==null){const n=P.externalFlatExactV1(value.note,['opening','privateKey','commitment','recipient']);const o=P.externalFlatExactV1(n.opening,['type','rho','x','y','value','secret']);need(o.type===4&&BigInt(P.externalFlatUintV1(o.value))>0n);for(const k of ['rho','x','y','secret'])P.externalFlatHexV1(o[k]);P.externalFlatHexV1(n.commitment);P.externalFlatHexV1(n.recipient,40);need(value.descriptor!==null);const key=privateKeyFromHex(n.privateKey);try{const pub=secp256k1.getPublicKey(key,false);need(bytesToHex(pub.slice(1,33))===o.x&&bytesToHex(pub.slice(33))===o.y&&digest(localBalanceCommitmentMessageV1(value.descriptor.poolTerms.scope,value.descriptor.poolTerms.policy,o))===n.commitment);}finally{key.fill(0);}}
  for(const r of value.jobs)need(r.consentFields.rootId===value.rootId&&r.consentFields.noteRevision===1&&same(r.descriptor,value.descriptor)&&r.consentFields.recipient===value.note?.recipient&&(r.mode==='deposit_balance'?r.consentFields.statement.output:r.consentFields.statement.commitment)===value.note?.commitment&&r.consentFields.statement.amount===value.note?.opening.value);
  if(value.pending!==null){const p=P.externalFlatExactV1(value.pending,['jobId','action']);P.externalFlatHexV1(p.jobId);need(['PROVE_D26','FUND_D26','OBSERVE_D26','PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(p.action)&&value.jobs.some((r:ExternalFlatRow)=>r.jobId===p.jobId));}
  if(value.prepared!==null){P.externalFlatExactV1(value.prepared,['draft']);const d=P.externalFlatExactV1(value.prepared.draft,['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256']);need(d.rootId===value.rootId&&d.noteRevision===1&&d.recipient===value.note?.recipient&&['PROVE_D26','PROVE_W39'].includes(d.action));P.externalFlatHexV1(d.witnessSHA256);}
  return value;}
 // Private encrypted storage codec only. Rows regain the SAME authenticated
 // descriptor before the original normalizer; disk data never issues SDK refs.
 const STATE_CODEC='DEVICE_EXTERNAL_FLAT_SHARED_DESCRIPTOR_STATE_V1';
 function persistedState(value:any){state(value);return{codec:STATE_CODEC,...value,jobs:value.jobs.map((row:ExternalFlatRow)=>{const {descriptor,...stored}=row;need(same(descriptor,value.descriptor));return stored;})};}
 function decodedState(value:any){
  if(!Object.hasOwn(value,'codec'))return value; // Original full-row V1 remains readable.
  const v=P.externalFlatExactV1(value,['codec','profile','rootId','noteRevision','descriptor','note','jobs','pending','prepared']);need(v.codec===STATE_CODEC);const descriptor=v.descriptor===null?null:P.normalizeExternalFlatDescriptorV1(v.descriptor);need(Array.isArray(v.jobs)&&v.jobs.length<=2);
  const jobs=v.jobs.map((row:any)=>{const r=P.externalFlatExactV1(row,['profile','jobId','mode','stage','consentFields','observation','errorCode']);need(descriptor!==null);return P.normalizeExternalFlatRowV1({profile:r.profile,descriptor,jobId:r.jobId,mode:r.mode,stage:r.stage,consentFields:r.consentFields,observation:r.observation,errorCode:r.errorCode});});
  return{profile:v.profile,rootId:v.rootId,noteRevision:v.noteRevision,descriptor,note:v.note,jobs,pending:v.pending,prepared:v.prepared};
 }
 const aad=(e:any)=>utf({profile:PROFILE,rootId:e.rootId,revision:e.revision,previousSHA256:e.previousSHA256});
 let rootId:string;
 async function read(){const original=await get(POINTER);need(original!==null,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');const p=pointer(original!);need(p.state==='ACTIVE'&&p.rootId===rootId,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');const originalEnvelope=await envelope();need(originalEnvelope.sha256===p.recordSHA256);const e=P.externalFlatExactV1(JSON.parse(originalEnvelope.raw),['profile','rootId','revision','previousSHA256','sealed']);need(e.profile===PROFILE&&e.rootId===rootId&&e.revision===p.revision);if(e.previousSHA256!==null)P.externalFlatHexV1(e.previousSHA256);need(typeof e.sealed==='string'&&e.sealed.length<=16384);
  let raw:string|null=await get(ROOT,PRIVATE);need(raw!==null,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');const bytes=localNoteHexBytesV1(raw!);let clear:Uint8Array|undefined;
  try{const key=await Crypto.AESEncryptionKey.import(bytes);live();clear=await Crypto.aesDecryptAsync(Crypto.AESSealedData.fromCombined(e.sealed,{ivLength:12,tagLength:16}),key,{output:'bytes',additionalData:aad(e)});live();need(clear.length<=10000);const value=state(decodedState(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear))));need(value.rootId===rootId&&await get(POINTER)===original&&(await envelope()).raw===originalEnvelope.raw,'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');return{value,p,original,originalEnvelope};}
  finally{raw=null;bytes.fill(0);clear?.fill(0);}}
 async function write(value:any,prior:any){state(value);let raw:string|null=await get(ROOT,PRIVATE);need(raw!==null);const bytes=localNoteHexBytesV1(raw!),clear=utf(persistedState(value));let cipher:string|null=null;
  try{need(clear.length<=10000);if(prior)need(await get(POINTER)===prior.original&&(await envelope()).raw===prior.originalEnvelope.raw,'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');const e:any={profile:PROFILE,rootId,revision:prior?prior.p.revision+1:0,previousSHA256:prior?prior.p.recordSHA256:null,sealed:null};
   await put(POINTER,JSON.stringify({profile:PROFILE,rootId,revision:e.revision,recordSHA256:e.previousSHA256,state:prior?'WRITING':'CREATING'}));const key=await Crypto.AESEncryptionKey.import(bytes);live();const sealed=await Crypto.aesEncryptAsync(clear,key,{nonce:{length:12},tagLength:16,additionalData:aad(e)});live();cipher=await sealed.combined('base64');live();e.sealed=cipher;const text=JSON.stringify(e);need(text.length<=16384,'MOBILE_EXTERNAL_FLAT_CAPACITY');const sha=digest(new TextEncoder().encode(text)),chunks=Math.ceil(text.length/1500);
   for(let i=0;i<chunks;i++){const k=chunk(sha,i),part=text.slice(i*1500,(i+1)*1500),old=await get(k);need(old===null||old===part,'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');if(old===null)await put(k,part);}
   await put(MANIFEST,JSON.stringify({profile:PROFILE,sha256:sha,bytes:text.length,chunks}));need((await envelope()).raw===text,'MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN');await put(POINTER,JSON.stringify({profile:PROFILE,rootId,revision:e.revision,recordSHA256:sha,state:'ACTIVE'}));const after=await read();need(same(after.value,value),'MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN');wipeState(after.value);
  }catch(e){poisoned=true;throw e;}finally{raw=null;cipher=null;bytes.fill(0);clear.fill(0);}}
 function run<T>(fn:()=>Promise<T>):Promise<T>{live();need(!busy,'MOBILE_EXTERNAL_FLAT_BUSY');busy=true;active=(async()=>{try{return await fn();}finally{busy=false;active=null;}})();return active as Promise<T>;}
 try{await approve();const p=await get(POINTER),key=await get(ROOT,PRIVATE),manifest=await get(MANIFEST);
  if(p===null&&key===null&&manifest===null){const entropy=await Crypto.getRandomBytesAsync(32);rootId=bytesToHex(await Crypto.getRandomBytesAsync(32));try{await put(POINTER,JSON.stringify({profile:PROFILE,rootId,revision:0,recordSHA256:null,state:'CREATING'}));await put(ROOT,bytesToHex(entropy),PRIVATE);await write({profile:PROFILE,rootId,noteRevision:1,descriptor:null,note:null,jobs:[],pending:null,prepared:null},null);}finally{entropy.fill(0);}}
  else{need(p!==null&&key!==null&&manifest!==null,'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED');rootId=pointer(p!).rootId;const s=await read();wipeState(s.value);}
 }catch(e){occupied=false;closed=true;throw e;}
 const summaryOf=(s:any):DeviceExternalFlatSummary=>({profile:PROFILE,rootId,noteRevision:1,descriptor:s.descriptor,recipient:s.note?.recipient??null,amount:s.note?.opening.value??null,commitment:s.note?.commitment??null,jobs:s.jobs,pending:s.pending,storageAvailable:true});
 const vault=Object.freeze({
  summary(){return run(async()=>{const s=await read();try{return structuredClone(summaryOf(s.value));}finally{wipeState(s.value);}});},
  prepareDeposit(raw:ExternalFlatDescriptor,recipient:string,amount:string,timestamp:string):Promise<DeviceExternalFlatPrepared>{return run(async()=>{const descriptor=P.normalizeExternalFlatDescriptorV1(raw);P.externalFlatHexV1(recipient,40);need(recipient!==descriptor.poolTerms.pool&&recipient!=='0'.repeat(40));need(BigInt(P.externalFlatUintV1(amount))>0n);P.externalFlatUintV1(timestamp);const s=await read();let noteKey:Uint8Array|undefined,privateWitness:any=null,returned=false;
   try{need(s.value.pending===null&&s.value.jobs.length===0,'MOBILE_EXTERNAL_FLAT_OBSERVE_ONLY');if(s.value.note===null){for(let i=0;i<16;i++){const e=await Crypto.getRandomBytesAsync(32);live();try{noteKey=privateKeyFromHex(bytesToHex(e));break;}catch{}finally{e.fill(0);}}need(noteKey,'MOBILE_ENTROPY_FAILED');const pub=secp256k1.getPublicKey(noteKey!,false),rho=await Crypto.getRandomBytesAsync(32),secret=await Crypto.getRandomBytesAsync(32);live();try{const opening={type:4 as const,rho:bytesToHex(rho),x:bytesToHex(pub.slice(1,33)),y:bytesToHex(pub.slice(33)),value:amount,secret:bytesToHex(secret)},commitment=digest(localBalanceCommitmentMessageV1(descriptor.poolTerms.scope,descriptor.poolTerms.policy,opening));s.value.descriptor=descriptor;s.value.note={opening,privateKey:bytesToHex(noteKey!),commitment,recipient};}finally{rho.fill(0);secret.fill(0);}}
    need(same(s.value.descriptor,descriptor)&&s.value.note.recipient===recipient&&s.value.note.opening.value===amount);noteKey?.fill(0);noteKey=privateKeyFromHex(s.value.note.privateKey);const n=s.value.note,statement={scope:descriptor.poolTerms.scope,policy:descriptor.poolTerms.policy,epoch:(BigInt(timestamp)/600n).toString(),amount,output:n.commitment};const signature=signDeviceMessage(noteKey,localBalanceDepositMessageV1(statement));const witness=privateWitness=P.externalFlatWitnessV1('deposit_balance',{scope:words(statement.scope),policy:words(statement.policy),epoch:statement.epoch,amount,output:words(n.commitment),rho:[...localNoteHexBytesV1(n.opening.rho)],key_x:[...localNoteHexBytesV1(n.opening.x)],key_y:[...localNoteHexBytesV1(n.opening.y)],secret:[...localNoteHexBytesV1(n.opening.secret)],signature:[...localNoteHexBytesV1(signature,64)]});const bytes=P.externalFlatWitnessBytesV1('deposit_balance',witness);let draft:ExternalFlatDraft;try{draft={action:'PROVE_D26',jobId:null,rootId,noteRevision:1,recipient,statement,path:null,witnessSHA256:digest(bytes)};}finally{bytes.fill(0);}s.value.prepared={draft};await write(s.value,s);returned=true;return{draft:structuredClone(draft),witness};
   }finally{noteKey?.fill(0);if(!returned)P.externalFlatWipeV1(privateWitness);wipeState(s.value);}});},
  prepareWithdrawal(raw:ExternalFlatConsent):Promise<DeviceExternalFlatPrepared>{return run(async()=>{const quote=readDeviceExternalFlatQuoteV1(raw);need(quote.action==='QUOTE_W39');P.validateExternalFlatFreshV1(quote);const s=await read();let key:Uint8Array|undefined,privateWitness:any=null,returned=false;
   try{const parent=s.value.jobs.find((j:ExternalFlatRow)=>j.mode==='deposit_balance');need(parent?.stage==='CONFIRMED'&&s.value.pending===null&&!s.value.jobs.some((j:ExternalFlatRow)=>j.mode==='withdraw_balance'));need(same(quote.descriptor,s.value.descriptor)&&quote.rootId===rootId&&quote.noteRevision===1&&quote.depositJobId===parent.jobId&&quote.recipient===s.value.note.recipient);const n=s.value.note,statement=localDeviceWithdrawalStatementV1({scope:quote.statement.scope,policy:quote.statement.policy,epoch:quote.statement.epoch,opening:n.opening,path:quote.path!,recipient:n.recipient});need(same(statement,quote.statement));key=privateKeyFromHex(n.privateKey);const signature=signDeviceMessage(key,localDeviceWithdrawalFrameV1(statement)),witness=privateWitness=P.externalFlatWitnessV1('withdraw_balance',localDeviceWithdrawalWitnessV1({statement,opening:n.opening,path:quote.path!,signature}));const bytes=P.externalFlatWitnessBytesV1('withdraw_balance',witness);let draft:ExternalFlatDraft;try{draft={action:'PROVE_W39',jobId:quote.jobId,rootId,noteRevision:1,recipient:n.recipient,statement,path:quote.path,witnessSHA256:digest(bytes)};}finally{bytes.fill(0);}s.value.prepared={draft};await write(s.value,s);returned=true;return{draft:structuredClone(draft),witness};
   }finally{key?.fill(0);if(!returned)P.externalFlatWipeV1(privateWitness);wipeState(s.value);}});},
  draft(action:ExternalFlatAction):Promise<ExternalFlatDraft>{return run(async()=>{const s=await read();try{const deposit=action==='QUOTE_W39'||action.endsWith('D26'),r=s.value.jobs.find((j:ExternalFlatRow)=>j.mode===(deposit?'deposit_balance':'withdraw_balance'));need(r,'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOB');const c=r.consentFields;if(action==='QUOTE_W39'){need(r.stage==='CONFIRMED'&&s.value.pending===null&&!s.value.jobs.some((j:ExternalFlatRow)=>j.mode==='withdraw_balance'));return{action,jobId:r.jobId,rootId,noteRevision:1,recipient:c.recipient,statement:null,path:null,witnessSHA256:null};}
    need(['FUND_D26','OBSERVE_D26','WITHDRAW_W39','OBSERVE_W39'].includes(action));if(!action.startsWith('OBSERVE_'))need(r.stage==='PROVED'&&s.value.pending===null,'MOBILE_EXTERNAL_FLAT_OBSERVE_ONLY');need(c.proofSHA256!==null);return{action,jobId:r.jobId,rootId,noteRevision:1,recipient:c.recipient,statement:c.statement,path:c.path,witnessSHA256:c.witnessSHA256};
   }finally{wipeState(s.value);}});},
  latch(raw:ExternalFlatConsent){return run(async()=>{const c=P.normalizeExternalFlatConsentV1(raw);P.validateExternalFlatFreshV1(c);const s=await read();try{need(same(c.descriptor,s.value.descriptor)&&c.rootId===rootId&&c.noteRevision===1&&c.recipient===s.value.note.recipient);if(c.action==='QUOTE_W39')return;
    const prove=c.action.startsWith('PROVE_');if(prove){need(s.value.pending===null&&!s.value.jobs.some((r:ExternalFlatRow)=>r.jobId===c.jobId));const d=s.value.prepared?.draft;need(d&&['action','rootId','noteRevision','recipient','statement','path','witnessSHA256'].every(k=>same(d[k],(c as any)[k]))&&(d.jobId===null||d.jobId===c.jobId));s.value.jobs.push(P.normalizeExternalFlatRowV1({profile:PROFILE,descriptor:c.descriptor,jobId:c.jobId,mode:c.action==='PROVE_D26'?'deposit_balance':'withdraw_balance',stage:'PROVING',consentFields:Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256'].map(k=>[k,(c as any)[k]])),observation:null,errorCode:null}));s.value.prepared=null;}
    else{const r=s.value.jobs.find((j:ExternalFlatRow)=>j.jobId===c.jobId);need(r&&Object.keys(r.consentFields).every(k=>same(r.consentFields[k],(c as any)[k])));if(!c.action.startsWith('OBSERVE_'))need(s.value.pending===null&&r.stage==='PROVED','MOBILE_EXTERNAL_FLAT_OBSERVE_ONLY');}
    s.value.pending={jobId:c.jobId,action:c.action};await write(s.value,s);
   }finally{wipeState(s.value);}});},
  accept(raw:ExternalFlatRow){return run(async()=>{const r=readDeviceExternalFlatRowV1(raw),s=await read();try{const old=s.value.jobs.find((j:ExternalFlatRow)=>j.jobId===r.jobId);need(old&&same(old.descriptor,r.descriptor));for(const k of ['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'] as const)need(same(old.consentFields[k],r.consentFields[k]));if(old.consentFields.proofSHA256!==null)need(old.consentFields.proofSHA256===r.consentFields.proofSHA256&&old.consentFields.publicInputsSHA256===r.consentFields.publicInputsSHA256);const order=['PROVING','PROVED',old.mode==='deposit_balance'?'FUNDING_UNKNOWN':'WITHDRAWAL_UNKNOWN','CONFIRMED'];need(order.indexOf(r.stage)>=order.indexOf(old.stage));s.value.jobs=s.value.jobs.map((j:ExternalFlatRow)=>j.jobId===r.jobId?structuredClone(r):j);if(s.value.pending?.jobId===r.jobId&&(r.stage==='CONFIRMED'||r.stage==='PROVED'&&s.value.pending.action.startsWith('PROVE_')))s.value.pending=null;await write(s.value,s);return structuredClone(summaryOf(s.value));}finally{wipeState(s.value);}});},
  acceptStatus(raw:any){const status=readDeviceExternalFlatStatusV1(raw);return run(async()=>{const s=await read();try{if(s.value.descriptor!==null)need(same(status.descriptor,s.value.descriptor));need(status.jobs.length===s.value.jobs.length&&status.jobs.every((r:ExternalFlatRow)=>s.value.jobs.some((old:ExternalFlatRow)=>old.jobId===r.jobId)),'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS');return status;}finally{wipeState(s.value);}});},
  // A fresh original SDK inventory can reconcile an older LOCAL copy of the
  // same root/note. This creates no permission and performs no proof or send.
  reconcileOriginalStatus(raw:any){const status=readDeviceExternalFlatStatusV1(raw);return run(async()=>{const s=await read();try{
    if(s.value.descriptor===null){need(status.jobs.length===0,'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS');return structuredClone(summaryOf(s.value));}
    need(same(status.descriptor,s.value.descriptor));const n=s.value.note;need(n!==null);
    need(s.value.jobs.every((old:ExternalFlatRow)=>status.jobs.some((r:ExternalFlatRow)=>r.jobId===old.jobId)),'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS');
    const deposit=status.jobs.find((r:ExternalFlatRow)=>r.mode==='deposit_balance');
    for(const r of status.jobs){
      readDeviceExternalFlatRowV1(r);const c=r.consentFields;
      need(c.rootId===rootId&&c.noteRevision===1&&c.recipient===n.recipient&&c.statement.amount===n.opening.value,'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS');
      if(r.mode==='deposit_balance')need(c.statement.output===n.commitment&&c.depositJobId===r.jobId);
      else{need(deposit&&c.depositJobId===deposit.jobId);const expected=localDeviceWithdrawalStatementV1({scope:status.descriptor.poolTerms.scope,policy:status.descriptor.poolTerms.policy,epoch:c.statement.epoch,opening:n.opening,path:c.path!,recipient:n.recipient});need(same(expected,c.statement));}
      const old=s.value.jobs.find((j:ExternalFlatRow)=>j.jobId===r.jobId);
      if(old){
        need(old.mode===r.mode&&same(old.descriptor,r.descriptor));
        for(const key of ['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'] as const)need(same(old.consentFields[key],c[key]));
        if(old.consentFields.proofSHA256!==null)need(old.consentFields.proofSHA256===c.proofSHA256&&old.consentFields.publicInputsSHA256===c.publicInputsSHA256);
        const order=['PROVING','PROVED',r.mode==='deposit_balance'?'FUNDING_UNKNOWN':'WITHDRAWAL_UNKNOWN','CONFIRMED'];need(order.indexOf(r.stage)>=order.indexOf(old.stage),'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');
        if(old.observation!==null)need(same(old.observation,r.observation),'MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED');
      }
      const prepared=s.value.prepared?.draft;
      if(prepared&&(prepared.action==='PROVE_D26')===(r.mode==='deposit_balance')){
        need(prepared.jobId===null||prepared.jobId===r.jobId);
        for(const key of ['rootId','noteRevision','recipient','statement','path','witnessSHA256'] as const)need(same(prepared[key],c[key]));
        s.value.prepared=null;
      }
    }
    s.value.jobs=structuredClone(status.jobs);
    const pending=s.value.pending;
    if(pending){const row=status.jobs.find((r:ExternalFlatRow)=>r.jobId===pending.jobId);need(row);if(row!.stage==='CONFIRMED'||row!.stage==='PROVED'&&pending.action.startsWith('PROVE_'))s.value.pending=null;}
    // An unknown/proving operation restored from an older snapshot remains
    // observation-only, including a snapshot taken before its local latch.
    const unresolved=status.jobs.find((r:ExternalFlatRow)=>['PROVING','FUNDING_UNKNOWN','WITHDRAWAL_UNKNOWN'].includes(r.stage));
    if(unresolved)s.value.pending={jobId:unresolved.jobId,action:unresolved.mode==='deposit_balance'?'OBSERVE_D26':'OBSERVE_W39'};
    // Recheck the SDK lease after queued storage/biometric work. A response
    // which expired while this actor was waiting cannot become durable state.
    readDeviceExternalFlatStatusV1(raw);state(s.value);await write(s.value,s);return structuredClone(summaryOf(s.value));
  }finally{wipeState(s.value);}});},
  close(){closed=true;return(async()=>{if(active)await active.catch(()=>{});occupied=false;return{closed:true,storageAvailable:!poisoned,rootRetained:true};})();},
 });return vault;
}
