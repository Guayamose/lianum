/** Foreground wallet custody. Wire permissions remain separate and fresh. */
import {readDevicePagedExecutionReviewV3,assertDevicePagedExecutionReviewActiveV3,readDevicePagedWithdrawalOptionV3,readDevicePagedEconomicReviewV3,assertDevicePagedEconomicReviewActiveV3,readDevicePagedExecutionReviewRefreshV3,readDevicePagedEconomicReviewRefreshV3} from './device-paged-custody-views-v3.mjs';
import * as Store from 'expo-secure-store';
import * as Auth from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import {AppState,Platform} from 'react-native';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,privateKeyFromHex,devicePublicKey,signDeviceMessage} from './signing.mjs';
import {readWalletRecoveryInventoryV1} from './wallet-recovery-package-v1.mjs';
import {decryptExpoAesBase64V1} from './expo-aes-base64-v1.mjs';
import {sealDeviceCustodyBackupV1,unsealDeviceCustodyBackupV1} from './sealed-custody-backup-v1.mjs';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as C from '../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';
import * as E from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as G from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import * as R from '../../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs';
import * as D from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {signDevicePagedConsentV3,signDevicePagedGraphConsentV3,createDevicePagedGraphExecutionSessionV3,closeDevicePagedGraphExecutionSessionV3,DEVICE_PAGED_EXECUTION_MAX_MS_V3} from './device-paged-permission-v3.mjs';
import {readDevicePagedRowV3,readDevicePagedStatusV3} from '../api/device-paged-owner-api-v3.mjs';
import {readDevicePagedGraphReplyV3,readDevicePagedGraphReplyConsentV3} from '../api/device-paged-graph-api-v3.mjs';
import {localBalanceWithdrawalMessageV1} from './balance-note-codec-v1.mjs';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {nativeWalletAuthMessageV1} from '../../../../packages/crypto/src/native-wallet-auth-v1.mjs';

const PRIVATE_KEY='lianum.owner.secp256k1.v1',PUBLIC_KEY='lianum.owner.public.v1';
const identityOptions:Store.SecureStoreOptions={requireAuthentication:true,keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.wallet.owner.authenticated.v1',authenticationPrompt:'Abrir tu wallet'};
const publicOptions:Store.SecureStoreOptions={keychainService:'org.lianum.wallet.owner.public.v1'};
const IDLE=15*60*1000,MAXIMUM=30*60*1000,FORMAT='LIANUM_WALLET_SESSION_SEALED_ROOT_V1';
const encoder=new TextEncoder(),utf=(value:unknown)=>encoder.encode(JSON.stringify(value)),hash=(bytes:Uint8Array)=>bytesToHex(sha256(bytes));
function need(value:unknown,code='MOBILE_WALLET_SESSION_BINDING'):asserts value{if(!value)throw Error(code);}
type CachedRoot={bytes:Uint8Array;envelope:string};
type Session={key:Uint8Array;wrap:Uint8Array;publicKey:string;birth:number;touched:number;timer:ReturnType<typeof setTimeout>|null;roots:Map<string,CachedRoot>;closed:boolean};
export type WalletSessionStatusV1=Readonly<{managed:boolean;active:boolean;state:'LOCKED'|'OPEN';publicKey:string|null;idleRemainingMs:number;maximumRemainingMs:number}>;
let session:Session|null=null,opening=false,epoch=0,managed=false;
const listeners=new Set<(status:WalletSessionStatusV1)=>void>(),versions=new Map<string,number>(),rootWork=new Map<string,Promise<string|null>>(),rootWrites=new Set<string>();
const mono=()=>{const value=performance.now();need(Number.isFinite(value)&&value>=0,'MOBILE_WALLET_SESSION_CLOCK');return value;};
const foreground=()=>AppState?.currentState==='active'||AppState?.currentState==='inactive';
function current(own:Session):Session{need(session===own&&!own.closed&&foreground(),'MOBILE_WALLET_SESSION_LOCKED');const now=mono();if(now<own.birth||now<own.touched||now-own.birth>=MAXIMUM||now-own.touched>=IDLE){lockWalletSessionV1();throw Error('MOBILE_WALLET_SESSION_EXPIRED');}return own;}
function live():Session{need(session,'MOBILE_WALLET_SESSION_LOCKED');return current(session!);}
function publish(){const status=walletSessionStatusV1();for(const listener of listeners){try{listener(status);}catch{}}}
function schedule(own:Session){if(own.timer!==null)clearTimeout(own.timer);const remaining=Math.min(own.birth+MAXIMUM,own.touched+IDLE)-mono();own.timer=setTimeout(()=>{if(session===own)lockWalletSessionV1();},Math.max(1,Math.ceil(remaining)));}
export function walletSessionStatusV1():WalletSessionStatusV1{const own=session;if(own&&!own.closed){const now=mono();if(!foreground()||now<own.birth||now<own.touched||now-own.birth>=MAXIMUM||now-own.touched>=IDLE)lockWalletSessionV1();}const current=session;if(!current||current.closed)return Object.freeze({managed,active:false,state:'LOCKED',publicKey:null,idleRemainingMs:0,maximumRemainingMs:0});const now=mono();return Object.freeze({managed,active:true,state:'OPEN',publicKey:current.publicKey,idleRemainingMs:Math.max(0,Math.floor(IDLE-(now-current.touched))),maximumRemainingMs:Math.max(0,Math.floor(MAXIMUM-(now-current.birth)))});}
export function subscribeWalletSessionV1(listener:(status:WalletSessionStatusV1)=>void):()=>void{need(typeof listener==='function');listeners.add(listener);listener(walletSessionStatusV1());return()=>{listeners.delete(listener);};}
// Only a successful fresh strong biometric may reset the maximum entry age.
function renewAuthenticatedSession(own:Session):void{current(own);const now=mono();own.birth=now;own.touched=now;schedule(own);publish();}
export function touchWalletSessionV1():void{const own=live();own.touched=mono();schedule(own);publish();}
/** An opaque lifetime check, never a key or a signing permission. Reopening the
 * same identity creates a different session and cannot revive pending work. */
export function captureWalletSessionGuardV1():()=>void{const own=live();return()=>{current(own);};}
/** Authentication for the public-wallet service only. It cannot authorize a
 * blockchain movement: submit accepts an independently reviewed native signature. */
export function signWalletSessionNativeRequestV1(challenge:unknown,expected:{origin:string;path:string;bodySHA256:string}):string{const own=live();const frame=nativeWalletAuthMessageV1(challenge,{...expected,devicePublicKey:own.publicKey});try{const signature=signDeviceMessage(own.key,frame);current(own);return signature;}finally{frame.fill(0);}}
export function lockWalletSessionV1():void{managed=true;epoch++;const own=session;session=null;for(const token of [...activeIdentityRecoveries])closeWalletSessionJointRecoveryV1(token);for(const token of [...activeSettlements])closeWalletSessionPagedSettlementV3(token);for(const token of [...activeAuthorizations])closeWalletSessionAuthorizationV1(token);for(const scope of [...executionClosers.keys()])closeWalletSessionPagedExecutionV1(scope);if(own){own.closed=true;if(own.timer!==null)clearTimeout(own.timer);own.key.fill(0);own.wrap.fill(0);for(const root of own.roots.values())root.bytes.fill(0);own.roots.clear();}publish();}
export async function openWalletSessionV1(signal?:AbortSignal):Promise<WalletSessionStatusV1>{
 need(!opening,'MOBILE_WALLET_SESSION_BUSY');managed=true;if(session){live();return walletSessionStatusV1();}opening=true;const stamp=epoch;let retained:string|null=null,key:Uint8Array|undefined,wrap:Uint8Array|undefined;
 try{
  need(!signal?.aborted&&foreground(),'MOBILE_WALLET_SESSION_LOCKED');
  need(['android','ios'].includes(Platform.OS)&&await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');
  need(epoch===stamp&&!signal?.aborted&&foreground(),'MOBILE_WALLET_SESSION_LOCKED');
  // This single authenticated read is the login biometric. No second LocalAuth prompt.
  retained=await Store.getItemAsync(PRIVATE_KEY,identityOptions);
  need(retained!==null,'MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);
  const publicKey=await Store.getItemAsync(PUBLIC_KEY,publicOptions);need(publicKey===devicePublicKey(key),'MOBILE_KEY_BINDING_CHANGED');
  need(epoch===stamp&&!signal?.aborted&&foreground(),'MOBILE_WALLET_SESSION_LOCKED');
  const info=encoder.encode('LIANUM/WALLET/SEALED-ROOT/1\n'+publicKey);try{wrap=hkdf(sha256,key,new Uint8Array(32),info,32);}finally{info.fill(0);}
  const now=mono();session={key,wrap,publicKey:publicKey!,birth:now,touched:now,timer:null,roots:new Map(),closed:false};key=undefined;wrap=undefined;schedule(session);publish();return walletSessionStatusV1();
 }finally{retained=null;key?.fill(0);wrap?.fill(0);opening=false;}
}

function rootScope(key:string,options:Store.SecureStoreOptions){
 need(typeof key==='string'&&(key==='lianum.native.wallet.v1.root'||key==='lianum.note.root.encryption.v1'||/^(lianum\.device\.paged(?:\.graph)?\.v3\.[0-9a-f]{64})\.root$/.test(key)||/^lianum\.external-flat\.root\.v1(?:\.[0-9a-f]{64})?$/.test(key)),'MOBILE_WALLET_SESSION_SECRET_SCOPE');
 need(options&&Object.getPrototypeOf(options)===Object.prototype&&options.requireAuthentication===true&&options.keychainAccessible===Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,'MOBILE_WALLET_SESSION_SECRET_SCOPE');
 const expected=key==='lianum.note.root.encryption.v1'?'org.lianum.wallet.note.root.authenticated.v1':key.endsWith('.root')?key.slice(0,-5):key.replace(/^lianum\./,'org.lianum.');need(options.keychainService===expected,'MOBILE_WALLET_SESSION_SECRET_SCOPE');
 need(Object.keys(options).every(k=>['requireAuthentication','keychainAccessible','keychainService','authenticationPrompt'].includes(k)),'MOBILE_WALLET_SESSION_SECRET_SCOPE');
 const binding={key,keychainService:expected,keychainAccessible:options.keychainAccessible,requireAuthentication:true},bytes=utf(binding);let scope:string;try{scope=hash(bytes);}finally{bytes.fill(0);}
 const name='lianum.wallet.session.sealed-root.v1.'+scope;
 // This entry contains AEAD ciphertext only; plaintext ROOT stays in the legacy authenticated entry.
 const sealedOptions:Store.SecureStoreOptions={keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.wallet.session.sealed-root.v1'};
 return{scope:scope!,name,sealedOptions};
}
function exact(raw:unknown,keys:string[]):Record<string,any>{need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===keys.length);const value=raw as Record<string,any>;need(keys.every(key=>Object.hasOwn(value,key)));return value;}
function rootEnvelope(text:string,own:Session,scope:string){need(text.length<=4096,'MOBILE_WALLET_SESSION_SECRET_BINDING');const envelope=exact(JSON.parse(text),['format','devicePublicKey','scopeSHA256','legacyRootSHA256','sealed']);need(envelope.format===FORMAT&&envelope.devicePublicKey===own.publicKey&&envelope.scopeSHA256===scope&&typeof envelope.legacyRootSHA256==='string'&&/^[0-9a-f]{64}$/.test(envelope.legacyRootSHA256)&&typeof envelope.sealed==='string','MOBILE_WALLET_SESSION_SECRET_BINDING');return envelope;}
function associated(envelope:Record<string,any>):Uint8Array{return utf({format:FORMAT,devicePublicKey:envelope.devicePublicKey,scopeSHA256:envelope.scopeSHA256,legacyRootSHA256:envelope.legacyRootSHA256});}
export async function readWalletSessionSecret(key:string,options:Store.SecureStoreOptions):Promise<string|null>{
 const own=live(),scope=rootScope(key,options),version=versions.get(scope.scope)??0;need(!rootWrites.has(scope.scope),'MOBILE_WALLET_SESSION_SECRET_CHANGED');
 const existing=rootWork.get(scope.scope);if(existing){const result=await existing;current(own);need((versions.get(scope.scope)??0)===version,'MOBILE_WALLET_SESSION_SECRET_CHANGED');return result;}
 const check=()=>{current(own);need((versions.get(scope.scope)??0)===version,'MOBILE_WALLET_SESSION_SECRET_CHANGED');};
 const task=(async()=>{let raw:string|null=null,root:Uint8Array|undefined,aad:Uint8Array|undefined;try{
  raw=await Store.getItemAsync(scope.name,scope.sealedOptions);check();const cached=own.roots.get(scope.scope);
  if(cached){need(raw===cached.envelope,'MOBILE_WALLET_SESSION_SECRET_CHANGED');return bytesToHex(cached.bytes);}
  if(raw!==null){const envelope=rootEnvelope(raw,own,scope.scope);aad=associated(envelope);const wrap=await Crypto.AESEncryptionKey.import(own.wrap);check();root=await decryptExpoAesBase64V1(envelope.sealed,wrap,{output:'bytes',additionalData:aad},256);check();need(root.length===32&&hash(root)===envelope.legacyRootSHA256,'MOBILE_WALLET_SESSION_SECRET_BINDING');need(await Store.getItemAsync(scope.name,scope.sealedOptions)===raw,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();}
  else{
   // One initial migration read. The original ROOT/record are neither replaced nor deleted.
   let legacy:string|null=await Store.getItemAsync(key,options);check();if(legacy===null)return null;need(/^[0-9a-f]{64}$/.test(legacy),'MOBILE_WALLET_SESSION_SECRET_BINDING');root=Uint8Array.from(legacy.match(/../g)!,pair=>parseInt(pair,16));legacy=null;
   const envelope={format:FORMAT,devicePublicKey:own.publicKey,scopeSHA256:scope.scope,legacyRootSHA256:hash(root),sealed:''};aad=associated(envelope);const wrap=await Crypto.AESEncryptionKey.import(own.wrap);check();const sealed=await Crypto.aesEncryptAsync(root,wrap,{nonce:{length:12},tagLength:16,additionalData:aad});check();envelope.sealed=await sealed.combined('base64');check();
   need(await Store.getItemAsync(scope.name,scope.sealedOptions)===null,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();raw=JSON.stringify(envelope);await Store.setItemAsync(scope.name,raw,scope.sealedOptions);check();need(await Store.getItemAsync(scope.name,scope.sealedOptions)===raw,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();
  }
  if(own.roots.size>=128){const first=own.roots.entries().next().value;if(first){first[1].bytes.fill(0);own.roots.delete(first[0]);}}
  own.roots.set(scope.scope,{bytes:new Uint8Array(root!),envelope:raw!});return bytesToHex(root!);
 }finally{root?.fill(0);aad?.fill(0);raw=null;}})();rootWork.set(scope.scope,task);try{return await task;}finally{if(rootWork.get(scope.scope)===task)rootWork.delete(scope.scope);}
}
export async function invalidateWalletSessionSecret(key:string,options:Store.SecureStoreOptions):Promise<void>{const scope=rootScope(key,options);versions.set(scope.scope,(versions.get(scope.scope)??0)+1);const cached=session?.roots.get(scope.scope);cached?.bytes.fill(0);session?.roots.delete(scope.scope);await Store.deleteItemAsync(scope.name,scope.sealedOptions);}

/** Birth/restoration already owns the new ROOT bytes. Seal those same bytes
 * after its authenticated legacy write; never open a second ROOT prompt. */
export async function writeWalletSessionSecret(key:string,value:string,options:Store.SecureStoreOptions):Promise<void>{
 const own=live(),scope=rootScope(key,options);need(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),'MOBILE_WALLET_SESSION_SECRET_BINDING');
 need(!rootWrites.has(scope.scope),'MOBILE_WALLET_SESSION_SECRET_CHANGED');rootWrites.add(scope.scope);let version=0;
 const check=()=>{current(own);need((versions.get(scope.scope)??0)===version,'MOBILE_WALLET_SESSION_SECRET_CHANGED');};
 let root:Uint8Array|undefined,aad:Uint8Array|undefined;
 try{await invalidateWalletSessionSecret(key,options);current(own);version=versions.get(scope.scope)??0;const pending=rootWork.get(scope.scope);if(pending)await pending.catch(()=>{});check();root=Uint8Array.from(value.match(/../g)!,pair=>parseInt(pair,16));await Store.setItemAsync(key,value,options);check();
  const envelope={format:FORMAT,devicePublicKey:own.publicKey,scopeSHA256:scope.scope,legacyRootSHA256:hash(root),sealed:''};aad=associated(envelope);const wrap=await Crypto.AESEncryptionKey.import(own.wrap);check();const sealed=await Crypto.aesEncryptAsync(root,wrap,{nonce:{length:12},tagLength:16,additionalData:aad});check();envelope.sealed=await sealed.combined('base64');check();
  need(await Store.getItemAsync(scope.name,scope.sealedOptions)===null,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();const raw=JSON.stringify(envelope);await Store.setItemAsync(scope.name,raw,scope.sealedOptions);check();need(await Store.getItemAsync(scope.name,scope.sealedOptions)===raw,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();own.roots.set(scope.scope,{bytes:new Uint8Array(root),envelope:raw});
 }finally{root?.fill(0);aad?.fill(0);value='';rootWrites.delete(scope.scope);}
}

/** A password-authenticated joint copy may repair this same locked identity.
 * This one-use capability is never accepted by any signer or ROOT accessor. */
type JointIdentityRecovery={devicePublicKey:string;identitySHA256:string;packageSHA256:string;signal:AbortSignal;stamp:number;birth:number;used:boolean;closed:boolean;abort:()=>void;timer:ReturnType<typeof setTimeout>};
const identityRecoveries=new WeakMap<object,JointIdentityRecovery>(),activeIdentityRecoveries=new Set<object>();
export function closeWalletSessionJointRecoveryV1(token:object):void{const s=identityRecoveries.get(token);if(!s)return;s.closed=true;clearTimeout(s.timer);s.signal.removeEventListener('abort',s.abort);activeIdentityRecoveries.delete(token);identityRecoveries.delete(token);}
function recoveryHash(value:string):string{const bytes=encoder.encode(value);try{return hash(bytes);}finally{bytes.fill(0);}}
function jointRecoveryCurrent(token:object,identityBackup:string,expectedPublicKey:string,signal:AbortSignal){const s=identityRecoveries.get(token);need(s&&!s.closed&&managed&&session===null&&epoch===s.stamp&&foreground()&&signal===s.signal&&!signal.aborted&&mono()>=s.birth&&mono()-s.birth<60000&&expectedPublicKey===s.devicePublicKey&&recoveryHash(identityBackup)===s.identitySHA256,'MOBILE_WALLET_SESSION_RECOVERY');return s;}
export async function approveWalletSessionJointRecoveryV1(rawInventory:unknown,serialized:string,signal:AbortSignal):Promise<object>{const inventory=readWalletRecoveryInventoryV1(rawInventory,serialized,signal);need(managed&&session===null&&foreground()&&!approvalBusy,'MOBILE_WALLET_SESSION_RECOVERY');const stamp=epoch,publicBefore=await Store.getItemAsync(PUBLIC_KEY,publicOptions);need(publicBefore===null||publicBefore===inventory.devicePublicKey,'MOBILE_CUSTODY_BACKUP_CONFLICT');need(epoch===stamp&&session===null&&!signal.aborted&&foreground(),'MOBILE_WALLET_SESSION_RECOVERY');approvalBusy=true;let token:object|undefined;
 try{need(await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');const approved=await Auth.authenticateAsync({promptMessage:'Recuperar esta misma wallet y las custodias de la copia conjunta autenticada; no autoriza pagos.',cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');need(epoch===stamp&&session===null&&!signal.aborted&&foreground(),'MOBILE_WALLET_SESSION_RECOVERY');readWalletRecoveryInventoryV1(rawInventory,serialized,signal);need(await Store.getItemAsync(PUBLIC_KEY,publicOptions)===publicBefore,'MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');const held:object=Object.freeze(Object.create(null));token=held;const abort=()=>closeWalletSessionJointRecoveryV1(held);identityRecoveries.set(held,{devicePublicKey:inventory.devicePublicKey,identitySHA256:recoveryHash(inventory.identityBackup),packageSHA256:recoveryHash(serialized),signal,stamp,birth:mono(),used:false,closed:false,abort,timer:setTimeout(abort,60000)});activeIdentityRecoveries.add(held);signal.addEventListener('abort',abort,{once:true});jointRecoveryCurrent(held,inventory.identityBackup,inventory.devicePublicKey,signal);return held;
 }catch(error){if(token)closeWalletSessionJointRecoveryV1(token);throw error;}finally{approvalBusy=false;}}
export function consumeWalletSessionJointIdentityRecoveryV1(token:object,identityBackup:string,expectedPublicKey:string,signal:AbortSignal):()=>void{const s=jointRecoveryCurrent(token,identityBackup,expectedPublicKey,signal);need(!s.used,'MOBILE_WALLET_SESSION_RECOVERY_USED');s.used=true;return()=>{jointRecoveryCurrent(token,identityBackup,expectedPublicKey,signal);};}

export type WalletSessionAuthorizationV1=Readonly<object>;
export type WalletSessionExternalKindV1='NOTE'|'GRAPH'|'OUTPUT'|'BLUE'|'AAVE'|'META';
export type WalletSessionPagedWithdrawalReviewV1={graphId:string;rootId:string;revision:number;role:'change'|'recovery'|'payout';id:string|null;recipient:string;amount:string;nullifier?:string};
type Authorization={own:Session;kind:'PAGED_DEPOSIT'|'PAGED_WITHDRAWAL'|WalletSessionExternalKindV1;descriptor:any;draft:any;birth:number;closed:boolean;used:Set<string>;proof:string|null;proofJob:string|null;command:string|null;quote:any|null;nullifier:string|null;settlement?:object;payoutCommitment?:string;authorizationRoot?:string};
type Settlement={own:Session;descriptor:any;review:any;originalReview:unknown;birth:number;closed:boolean;leaves:Map<string,object>;timer:ReturnType<typeof setTimeout>;signal:AbortSignal;abort:()=>void};
const settlements=new WeakMap<object,Settlement>(),activeSettlements=new Set<object>();
const authorizations=new WeakMap<object,Authorization>(),activeAuthorizations=new Set<object>(),executionClosers=new Map<object,()=>void>();
let approvalBusy=false;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function snapshot(raw:unknown){return C.snapshotDevicePagedGraphCommandV3(raw);}
function digest(raw:unknown):string{const copy=snapshot(raw),bytes=utf(copy);try{return hash(bytes);}finally{bytes.fill(0);P.pagedOwnerWipeV3(copy);}}
function descriptorCurrent(own:Session,descriptor:any,origin?:string,pairingId?:string){current(own);need(descriptor.devicePublicKey===own.publicKey&&(origin===undefined||descriptor.origin===origin)&&(pairingId===undefined||descriptor.pairingId===pairingId),'MOBILE_WALLET_SESSION_BINDING');}
function tokenCurrent(token:object,kind:Authorization['kind']):Authorization{const state=authorizations.get(token);if(state?.settlement)settlementCurrent(state.settlement);need(state&&!state.closed&&state.kind===kind,'MOBILE_WALLET_SESSION_AUTHORIZATION');current(state.own);need(mono()-state.birth<IDLE,'MOBILE_WALLET_SESSION_AUTHORIZATION_EXPIRED');descriptorCurrent(state.own,state.descriptor);return state;}
export function closeWalletSessionAuthorizationV1(token:object):void{const state=authorizations.get(token);if(state){state.closed=true;state.used.clear();P.pagedOwnerWipeV3(state.draft);P.pagedOwnerWipeV3(state.quote);state.proof=null;state.proofJob=null;state.command=null;state.nullifier=null;}activeAuthorizations.delete(token);authorizations.delete(token);}
async function approve(kind:Authorization['kind'],descriptor:any,draft:any,prompt:string,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const own=live();descriptorCurrent(own,descriptor);need(!signal?.aborted&&!approvalBusy&&activeAuthorizations.size<64,'MOBILE_WALLET_SESSION_AUTHORIZATION');approvalBusy=true;
 try{const captured=snapshot(draft),approved=await Auth.authenticateAsync({promptMessage:prompt,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current(own);need(!signal?.aborted,'MOBILE_WALLET_SESSION_AUTHORIZATION');need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');renewAuthenticatedSession(own);const token=Object.freeze(Object.create(null));authorizations.set(token,{own,kind,descriptor:snapshot(descriptor),draft:captured,birth:mono(),closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null});activeAuthorizations.add(token);return token;
 }finally{approvalBusy=false;}
}
function consume(state:Authorization,action:string,nonce:string){need(!state.used.has(action)&&!state.used.has('nonce:'+nonce),'MOBILE_WALLET_SESSION_AUTHORIZATION_USED');state.used.add(action);state.used.add('nonce:'+nonce);}
export async function approveWalletSessionPagedDepositV1(rawDescriptor:unknown,rawDraft:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),draft=P.normalizeDevicePagedDraftV3(rawDraft);need(draft.action==='PROVE_D26'&&draft.mode==='deposit'&&draft.authorizationRoot===null&&draft.reserveNullifier===null,'MOBILE_WALLET_SESSION_AUTHORIZATION');need(P.devicePagedWordsHexV3(draft.publicInputs,0)===descriptor.scope&&P.devicePagedWordsHexV3(draft.publicInputs,8)===descriptor.policy,'MOBILE_WALLET_SESSION_BINDING');return approve('PAGED_DEPOSIT',descriptor,draft,'Autorizar un ingreso de '+draft.publicInputs[17]+' unidades de esta nota.',signal);
}
/** Only a live original SDK result can grant the FUND half of this approval. */
export function bindWalletSessionPagedDepositV1(token:object,raw:unknown):void{
 const state=tokenCurrent(token,'PAGED_DEPOSIT');let row:any;
 try{row=readDevicePagedRowV3(raw);}catch{const status=readDevicePagedStatusV3(raw);need(same(status.descriptor,state.descriptor),'MOBILE_WALLET_SESSION_BINDING');row=status.jobs.find((job:any)=>job.jobId===state.draft.jobId);}
 need(row&&row.mode==='deposit'&&row.stage==='PROVED'&&same(row.descriptor,state.descriptor)&&row.jobId===state.draft.jobId&&row.rootId===state.draft.rootId&&row.revision===state.draft.revision&&same(row.publicInputs,state.draft.publicInputs)&&row.witnessSHA256===state.draft.witnessSHA256,'MOBILE_WALLET_SESSION_AUTHORIZATION');P.pagedOwnerHexV3(row.proofSHA256);if(state.proof!==null)need(state.proof===row.proofSHA256,'MOBILE_WALLET_SESSION_BINDING');state.proof=row.proofSHA256;
}
export async function signWalletSessionPagedOwnerV1(raw:unknown,origin:string,pairingId:string,signal?:AbortSignal,token?:object):Promise<string>{
 const own=live(),c=P.validateDevicePagedConsentFreshV3(raw);descriptorCurrent(own,c.descriptor,origin,pairingId);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');let approval:Authorization|null=null;
 if(!['READ_STATE','OBSERVE_JOB'].includes(c.action)){need(token&&['PROVE_D26','FUND_D26'].includes(c.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');approval=tokenCurrent(token,'PAGED_DEPOSIT');need(approval.own===own&&same(approval.descriptor,c.descriptor)&&['jobId','rootId','revision'].every(k=>c[k]===approval!.draft[k]),'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_D26')for(const k of Object.keys(approval.draft))need(same(c[k],approval.draft[k]),'MOBILE_WALLET_SESSION_BINDING');else need(approval.proof!==null&&c.proofSHA256===approval.proof,'MOBILE_WALLET_SESSION_AUTHORIZATION');consume(approval,c.action,c.nonce);}
 try{current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');const signature=signDevicePagedConsentV3(own.key,c);current(own);P.validateDevicePagedConsentFreshV3(c);return signature;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}
function withdrawalReview(raw:unknown):WalletSessionPagedWithdrawalReviewV1{const names=['graphId','rootId','revision','role','id','recipient','amount',...(Object.hasOwn((raw??{}) as object,'nullifier')?['nullifier']:[])],v=exact(raw,names);need(/^paged-graph-[0-9a-f]{32}$/.test(v.graphId)&&Number.isSafeInteger(v.revision)&&v.revision>0&&['change','recovery','payout'].includes(v.role),'MOBILE_WALLET_SESSION_BINDING');P.pagedOwnerHexV3(v.rootId);P.pagedOwnerUintV3(v.amount);need(/^0x[0-9a-f]{40}$/.test(v.recipient)&&v.recipient!=='0x'+'0'.repeat(40),'MOBILE_WALLET_SESSION_BINDING');need(v.role==='payout'?typeof v.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v.id):v.id===null,'MOBILE_WALLET_SESSION_BINDING');if(v.nullifier!==undefined)P.pagedOwnerHexV3(v.nullifier);return snapshot(v);}
export async function approveWalletSessionPagedWithdrawalV1(rawDescriptor:unknown,rawReview:unknown,signal?:AbortSignal,originalOption?:object):Promise<WalletSessionAuthorizationV1>{
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),review=withdrawalReview(rawReview);
 if(review.nullifier!==undefined){need(originalOption,'MOBILE_WALLET_SESSION_BINDING');const option=readDevicePagedWithdrawalOptionV3(originalOption);need(same(option.descriptor,descriptor)&&['graphId','rootId','revision','role','id','amount','nullifier'].every(k=>(option as any)[k]===(review as any)[k]),'MOBILE_WALLET_SESSION_BINDING');}
 return approve('PAGED_WITHDRAWAL',descriptor,review,'Autorizar una retirada de '+review.amount+' unidades a '+review.recipient+'.',signal);
}
function withdrawalReply(state:Authorization,raw:unknown){const reply=readDevicePagedGraphReplyV3(raw),c=readDevicePagedGraphReplyConsentV3(raw),status=reply.status;need(same(c.descriptor,state.descriptor)&&same(status.descriptor,state.descriptor)&&(state.authorizationRoot===undefined||c.authorizationRoot===state.authorizationRoot&&status.authorizationRoot===state.authorizationRoot)&&['graphId','rootId','revision'].every(k=>status[k]===state.draft[k]&&c[k]===state.draft[k]),'MOBILE_WALLET_SESSION_BINDING');return{reply,c,status};}
export function bindWalletSessionPagedWithdrawalV1(token:object,rawReply:unknown,rawCommand:unknown):void{
 const state=tokenCurrent(token,'PAGED_WITHDRAWAL'),{reply,c}=withdrawalReply(state,rawReply);need(c.action==='READ_OUTPUT','MOBILE_WALLET_SESSION_AUTHORIZATION');need(c.commandSHA256===digest({role:state.draft.role,id:state.draft.id,recipient:state.draft.recipient}),'MOBILE_WALLET_SESSION_BINDING');const q=reply.private;need(q?.type==='output-withdrawal-request'&&['role','id','recipient'].every(k=>q[k]===state.draft[k])&&q.opening?.value===state.draft.amount,'MOBILE_WALLET_SESSION_BINDING');const command=exact(rawCommand,['role','id','recipient','epoch','signature']);need(['role','id','recipient','epoch'].every(k=>command[k]===q[k])&&/^[0-9a-f]{128}$/.test(command.signature),'MOBILE_WALLET_SESSION_BINDING');P.pagedOwnerHexV3(q.commitment);need(state.payoutCommitment===undefined||q.commitment===state.payoutCommitment,'MOBILE_WALLET_SESSION_BINDING');P.pagedOwnerHexV3(q.nullifier);P.pagedOwnerUintV3(q.epoch,true);if(state.draft.nullifier!==undefined)need(state.draft.nullifier===q.nullifier,'MOBILE_WALLET_SESSION_BINDING');const frame=localBalanceWithdrawalMessageV1({scope:state.descriptor.scope,policy:state.descriptor.policy,commitment:q.commitment,recipient:q.recipient.slice(2),amount:state.draft.amount,epoch:q.epoch});let signed:Uint8Array|undefined,pub:Uint8Array|undefined;
 try{need(bytesToHex(frame)===q.message,'MOBILE_WALLET_SESSION_BINDING');signed=Uint8Array.from((command.signature as string).match(/../g)!,p=>parseInt(p,16));pub=Uint8Array.from(('04'+q.x+q.y).match(/../g)!,p=>parseInt(p,16));need(secp256k1.verify(signed,frame,pub,{prehash:true,lowS:true}),'MOBILE_WALLET_SESSION_BINDING');}finally{frame.fill(0);signed?.fill(0);pub?.fill(0);}
 state.command=digest(command);state.nullifier=q.nullifier;state.quote={epoch:q.epoch};
}
/** Recover only the same original PROVED W39, never a caller proof digest. */
export function bindWalletSessionPagedWithdrawalProofV1(token:object,rawReply:unknown):void{
 const state=tokenCurrent(token,'PAGED_WITHDRAWAL'),{c,status}=withdrawalReply(state,rawReply);need(['PROVE_OUTPUT_W39','OBSERVE_GRAPH','READ_GRAPH','READ_ECONOMIC_SETTLEMENT'].includes(c.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');const job=status.job;need(job?.mode==='withdraw'&&job.stage==='PROVED','MOBILE_WALLET_SESSION_AUTHORIZATION');const p=job.publicInputs;need(P.devicePagedWordsHexV3(p,0)===state.descriptor.scope&&P.devicePagedWordsHexV3(p,8)===state.descriptor.policy&&p[33]===state.draft.amount,'MOBILE_WALLET_SESSION_BINDING');const recipient=p.slice(34,39).map((v:string)=>BigInt(v).toString(16).padStart(8,'0')).join('');need('0x'+recipient===state.draft.recipient,'MOBILE_WALLET_SESSION_BINDING');const nf=P.devicePagedWordsHexV3(p,25),expected=state.nullifier??state.draft.nullifier;need(expected!==undefined&&expected!==null&&nf===expected,'MOBILE_WALLET_SESSION_BINDING');if(state.quote!==null)need(state.quote.epoch===p[16],'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_OUTPUT_W39')need(c.commandSHA256===state.command&&c.jobId===job.jobId,'MOBILE_WALLET_SESSION_BINDING');if(state.proof!==null)need(state.proof===job.proofSHA256&&state.proofJob===job.jobId,'MOBILE_WALLET_SESSION_BINDING');state.nullifier=nf;state.proof=job.proofSHA256;state.proofJob=job.jobId;
}
export async function signWalletSessionPagedGraphV1(raw:unknown,origin:string,pairingId:string,signal?:AbortSignal,options?:{authorization:object;command:unknown}):Promise<string>{
 const own=live(),c=C.validateDevicePagedGraphConsentFreshV3(raw);descriptorCurrent(own,c.descriptor,origin,pairingId);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');const ordinary=['READ_GRAPH','OBSERVE_GRAPH','READ_ECONOMIC_SETTLEMENT','READ_PORTFOLIO','NEXT_COMMAND','READ_READY','READ_OUTPUT','BEGIN_GRAPH','PREPARE_NATIVE_PAGE','APPEND_PAGE','SEAL_GRAPH'];let token:object|undefined;
 if(!ordinary.includes(c.action)){need(options&&['PROVE_OUTPUT_W39','WITHDRAW_OUTPUT_W39'].includes(c.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');token=options.authorization;const state=tokenCurrent(token,'PAGED_WITHDRAWAL');need(state.own===own&&same(state.descriptor,c.descriptor)&&(state.authorizationRoot===undefined||c.authorizationRoot===state.authorizationRoot)&&['graphId','rootId','revision'].every(k=>c[k]===state.draft[k]),'MOBILE_WALLET_SESSION_BINDING');const command=digest(options.command);need(command===c.commandSHA256,'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_OUTPUT_W39')need(state.command!==null&&state.command===command,'MOBILE_WALLET_SESSION_AUTHORIZATION');else need(state.proof!==null&&state.proofJob!==null&&command===digest({}),'MOBILE_WALLET_SESSION_AUTHORIZATION');consume(state,c.action,c.nonce);if(state.settlement)touchWalletSessionV1();}
 try{const signature=signDevicePagedGraphConsentV3(own.key,c);current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');C.validateDevicePagedGraphConsentFreshV3(c);return signature;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}

/** A single strong approval delegates only the reviewed original payout
 * leaves. No identity key or generic permission is copied into this scope. */
function settlementCurrent(token:object):Settlement{const state=settlements.get(token);need(state&&!state.closed,'MOBILE_WALLET_SESSION_SETTLEMENT');try{assertDevicePagedEconomicReviewActiveV3(state.originalReview);}catch(error){closeWalletSessionPagedSettlementV3(token);throw error;}current(state.own);need(mono()>=state.birth&&mono()-state.birth<MAXIMUM&&!state.signal.aborted&&P.devicePagedNowV3()<state.descriptor.deadlineMs,'MOBILE_WALLET_SESSION_SETTLEMENT_EXPIRED');descriptorCurrent(state.own,state.descriptor);return state;}
export function closeWalletSessionPagedSettlementV3(token:object):void{const state=settlements.get(token);if(!state||state.closed)return;state.closed=true;clearTimeout(state.timer);state.signal.removeEventListener('abort',state.abort);for(const leaf of state.leaves.values())closeWalletSessionAuthorizationV1(leaf);state.leaves.clear();P.pagedOwnerWipeV3(state.review);activeSettlements.delete(token);settlements.delete(token);}
export async function approveWalletSessionPagedSettlementV3(rawReview:unknown,signal:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{const own=live();let review=readDevicePagedEconomicReviewV3(rawReview),activeReview=rawReview;need(refreshOriginalReview===undefined||typeof refreshOriginalReview==='function','MOBILE_WALLET_SESSION_SETTLEMENT');need(signal instanceof AbortSignal&&!signal.aborted&&review.eligible&&review.changeConfirmed&&!approvalBusy&&activeSettlements.size<4,'MOBILE_WALLET_SESSION_SETTLEMENT');descriptorCurrent(own,review.plan.descriptor);approvalBusy=true;let token:object|undefined;
 try{const approved=await Auth.authenticateAsync({promptMessage:`Pagar ${review.plan.payouts.filter(row=>!review.paid.some(p=>p.id===row.id)).length} resultados al proveedor de esta operación, hasta 30 minutos con la app abierta.`,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current(own);need(!signal.aborted,'MOBILE_PAGED_CANCELLED');need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');assertDevicePagedEconomicReviewActiveV3(rawReview);if(refreshOriginalReview){const fresh=await refreshOriginalReview();current(own);need(!signal.aborted,'MOBILE_PAGED_CANCELLED');review=readDevicePagedEconomicReviewRefreshV3(rawReview,fresh);activeReview=fresh;}else review=readDevicePagedEconomicReviewV3(rawReview);need(review.eligible&&review.changeConfirmed,'MOBILE_WALLET_SESSION_SETTLEMENT');descriptorCurrent(own,review.plan.descriptor);renewAuthenticatedSession(own);const held:object=Object.freeze(Object.create(null));token=held;const abort=()=>closeWalletSessionPagedSettlementV3(held),remaining=Math.min(MAXIMUM,review.plan.descriptor.deadlineMs-P.devicePagedNowV3());need(remaining>0,'MOBILE_WALLET_SESSION_SETTLEMENT_EXPIRED');settlements.set(held,{own,descriptor:snapshot(review.plan.descriptor),review:snapshot(review),originalReview:activeReview,birth:mono(),closed:false,leaves:new Map(),timer:setTimeout(abort,remaining),signal,abort});activeSettlements.add(held);signal.addEventListener('abort',abort,{once:true});settlementCurrent(held);return held;
 }catch(error){if(token)closeWalletSessionPagedSettlementV3(token);throw error;}finally{approvalBusy=false;}}
export function walletSessionPagedSettlementLeafV3(token:object,id:string):object{const parent=settlementCurrent(token),row=parent.review.plan.payouts.find((value:any)=>value.id===id);need(row&&!parent.review.paid.some((value:any)=>value.id===id),'MOBILE_WALLET_SESSION_SETTLEMENT');const previous=parent.leaves.get(id);if(previous){tokenCurrent(previous,'PAGED_WITHDRAWAL');return previous;}need(activeAuthorizations.size<64,'MOBILE_WALLET_SESSION_AUTHORIZATION');const draft=withdrawalReview({graphId:parent.review.plan.graphId,rootId:parent.review.rootId,revision:parent.review.revision,role:'payout',id:row.id,recipient:parent.review.plan.beneficiary,amount:row.amount,nullifier:row.nullifier}),leaf=Object.freeze(Object.create(null));authorizations.set(leaf,{own:parent.own,kind:'PAGED_WITHDRAWAL',descriptor:snapshot(parent.descriptor),draft,birth:mono(),closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null,settlement:token,payoutCommitment:row.commitment,authorizationRoot:parent.review.plan.authorizationRoot});activeAuthorizations.add(leaf);parent.leaves.set(id,leaf);return leaf;}

function externalNoteDraft(raw:unknown){const d=exact(snapshot(raw),['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256']);need(['PROVE_D26','FUND_D26','PROVE_D27','PROVE_W39','WITHDRAW_W39'].includes(d.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');E.externalFlatHexV1(d.rootId);need(d.noteRevision===1,'MOBILE_WALLET_SESSION_BINDING');E.externalFlatHexV1(d.recipient,40);need(d.recipient!=='0'.repeat(40),'MOBILE_WALLET_SESSION_BINDING');if(d.jobId!==null)E.externalFlatHexV1(d.jobId);need(d.jobId!==null||d.action==='PROVE_D26'||d.action==='PROVE_D27','MOBILE_WALLET_SESSION_BINDING');if(d.witnessSHA256!==null)E.externalFlatHexV1(d.witnessSHA256);need(d.statement&&d.statement.scope&&d.statement.policy&&typeof d.statement.amount==='string','MOBILE_WALLET_SESSION_BINDING');E.externalFlatUintV1(d.statement.amount);return d;}
function redemptionDraft(kind:'BLUE'|'AAVE'|'META',raw:unknown){const d=exact(snapshot(raw),['action','withdrawalJobId','minimumAssets','deadline']);need(d.action==='REDEEM_'+kind,'MOBILE_WALLET_SESSION_AUTHORIZATION');E.externalFlatHexV1(d.withdrawalJobId);E.externalFlatUintV1(d.minimumAssets);E.externalFlatUintV1(d.deadline);return d;}
export async function approveWalletSessionExternalV1(kind:WalletSessionExternalKindV1,rawDescriptor:unknown,rawDraft:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const descriptor=E.normalizeExternalFlatDescriptorV1(rawDescriptor);need(['NOTE','GRAPH','OUTPUT','BLUE','AAVE','META'].includes(kind),'MOBILE_WALLET_SESSION_AUTHORIZATION');let draft:any;
 if(kind==='NOTE')draft=externalNoteDraft(rawDraft);else if(kind==='GRAPH'){draft=G.normalizeExternalFlatGraphDraftV1(rawDraft);need(!['OBSERVE_S','RECONCILE_GRAPH'].includes(draft.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');}else if(kind==='OUTPUT')draft=G.normalizeExternalFlatGraphOutputDraftV1(rawDraft);else draft=redemptionDraft(kind,rawDraft);
 const action=draft.action??draft.draft?.action,names:Record<string,string>={PROVE_D26:'preparar el ingreso',FUND_D26:'ingresar fondos',PROVE_D27:'preparar el ingreso',PROVE_W39:'preparar la retirada',WITHDRAW_W39:'retirar fondos',PROVE_U:'preparar la operación',RESERVE_S:'reservar fondos',EXECUTE_GRAPH:'ejecutar la operación',RECOVER_GRAPH:'recuperar fondos',CANCEL_GRAPH:'cancelar la operación',REDEEM_BLUE:'retirar la inversión',REDEEM_AAVE:'retirar la inversión',REDEEM_META:'retirar la inversión'};need(names[action],'MOBILE_WALLET_SESSION_AUTHORIZATION');return approve(kind,descriptor,draft,'Autorizar '+names[action]+' de esta operación revisada.',signal);
}
function externalAuthorization(own:Session,kind:WalletSessionExternalKindV1,token:object|undefined,descriptor:any,actual:any){need(token,'MOBILE_WALLET_SESSION_AUTHORIZATION');const state=tokenCurrent(token,kind);need(state.own===own&&same(state.descriptor,descriptor),'MOBILE_WALLET_SESSION_BINDING');let draft=state.draft;
 if(kind==='OUTPUT'){need(actual.noteRole===draft.noteRole,'MOBILE_WALLET_SESSION_BINDING');draft=draft.draft;actual=actual.consent;}
 const target=kind==='GRAPH'?actual.draft:actual;
 for(const key of Object.keys(draft)){if(key==='jobId'&&draft[key]===null&&String(draft.action).startsWith('PROVE_'))continue;need(same(draft[key],target[key]),'MOBILE_WALLET_SESSION_BINDING');}
 consume(state,draft.action,actual.nonce);return state;
}
/** Fixed external domains only. No caller-supplied frame or signing callback. */
export async function signWalletSessionExternalV1(kind:WalletSessionExternalKindV1,raw:unknown,origin:string,pairingId:string,signal?:AbortSignal,token?:object):Promise<string>{
 const own=live();let c:any,descriptor:any,read=false,frame:Uint8Array|undefined,check:()=>any;
 if(kind==='NOTE'){check=()=>E.validateExternalFlatFreshV1(raw);c=check();descriptor=c.action==='ACCESS'?{origin:c.origin,pairingId:c.pairingId,devicePublicKey:c.devicePublicKey}:c.descriptor;read=c.action==='ACCESS'||c.action==='QUOTE_W39'||c.action.startsWith('OBSERVE_');}
 else if(kind==='GRAPH'){check=()=>G.validateExternalFlatGraphFreshV1(raw);c=check();descriptor=c.descriptor;read=['OBSERVE_S','RECONCILE_GRAPH'].includes(c.draft.action);}
 else if(kind==='OUTPUT'){check=()=>G.validateExternalFlatGraphOutputFreshV1(raw);c=check();descriptor=c.consent.descriptor;read=['QUOTE_W39','OBSERVE_W39'].includes(c.consent.action);}
 else if(kind==='BLUE'){check=()=>R.validateDeviceMorphoBlueRedemptionFreshV1(raw);c=check();descriptor=c.descriptor;read=['ACCESS_BLUE','OBSERVE_BLUE'].includes(c.action);}
 else if(kind==='AAVE'){check=()=>R.validateDeviceAaveStaticRedemptionFreshV1(raw);c=check();descriptor=c.descriptor;read=['ACCESS_AAVE','OBSERVE_AAVE'].includes(c.action);}
 else{need(kind==='META','MOBILE_WALLET_SESSION_BINDING');check=()=>R.validateDeviceMetaMorphoRedemptionFreshV2(raw);c=check();descriptor=c.descriptor;read=['ACCESS_META','OBSERVE_META'].includes(c.action);}
 descriptorCurrent(own,descriptor,origin,pairingId);need(!signal?.aborted,'MOBILE_EXTERNAL_FLAT_CANCELLED');if(!read)externalAuthorization(own,kind,token,descriptor,c);
 try{check();current(own);if(kind==='NOTE')frame=E.externalFlatPermissionMessageV1(c);else if(kind==='GRAPH')frame=G.externalFlatGraphPermissionMessageV1(c);else if(kind==='OUTPUT')frame=G.externalFlatGraphOutputPermissionMessageV1(c);else if(kind==='BLUE')frame=R.deviceMorphoBlueRedemptionPermissionMessageV1(c);else if(kind==='AAVE')frame=R.deviceAaveStaticRedemptionPermissionMessageV1(c);else frame=R.deviceMetaMorphoRedemptionPermissionMessageV2(c);const signature=signDeviceMessage(own.key,frame);check();current(own);need(!signal?.aborted,'MOBILE_EXTERNAL_FLAT_CANCELLED');return signature;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}finally{frame?.fill(0);}
}
export async function signWalletSessionDefiPositionV1(raw:unknown,origin:string,pairingId:string,signal?:AbortSignal):Promise<string>{const own=live(),value=D.validateDeviceDefiPositionFreshV1(raw as any);descriptorCurrent(own,value,origin,pairingId);need(!signal?.aborted,'MOBILE_DEFI_POSITION_READ_REVOKED');const frame=D.deviceDefiPositionPermissionMessageV1(value);try{const signature=signDeviceMessage(own.key,frame);current(own);D.validateDeviceDefiPositionFreshV1(value);need(!signal?.aborted,'MOBILE_DEFI_POSITION_READ_REVOKED');return signature;}finally{frame.fill(0);}}

/** Existing scoped graph signer retains its own exact action/root guards.
 * Its key is supplied internally after one separate financial biometric. */
export async function openWalletSessionPagedExecutionV1(rawReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{
 const own=live();current(own);let review=readDevicePagedExecutionReviewV3(rawReview),activeReview=rawReview;need(refreshOriginalReview===undefined||typeof refreshOriginalReview==='function','MOBILE_PAGED_EXECUTION_REVIEW');
 const check=()=>{current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');assertDevicePagedExecutionReviewActiveV3(activeReview);descriptorCurrent(own,review.descriptor);};check();need(!approvalBusy,'MOBILE_WALLET_SESSION_AUTHORIZATION');approvalBusy=true;let opened:object|undefined;
 try{const approved=await Auth.authenticateAsync({promptMessage:`Autorizar ${review.steps.length} pagos y reservar ${review.budget} unidades de esta nota, hasta 30 minutos con la app abierta.`,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');if(refreshOriginalReview){const fresh=await refreshOriginalReview();check();review=readDevicePagedExecutionReviewRefreshV3(rawReview,fresh);activeReview=fresh;}else review=readDevicePagedExecutionReviewV3(rawReview);check();renewAuthenticatedSession(own);for(const other of [...executionClosers.keys()])closeWalletSessionPagedExecutionV1(other);
  opened=createDevicePagedGraphExecutionSessionV3(own.key,{descriptor:review.descriptor,rootId:review.rootId,graphId:review.graphId,authorizationRoot:review.authorizationRoot,reserveNullifier:review.reserveNullifier,budget:review.budget,settleBefore:review.settleBefore,deadlineMs:Math.min(P.devicePagedNowV3()+DEVICE_PAGED_EXECUTION_MAX_MS_V3,review.descriptor.deadlineMs)},()=>{check();need(AppState.currentState==='active','MOBILE_PAGED_CANCELLED');},()=>{check();touchWalletSessionV1();});const scope=opened,abort=()=>closeWalletSessionPagedExecutionV1(scope),timer=setTimeout(abort,DEVICE_PAGED_EXECUTION_MAX_MS_V3);signal?.addEventListener('abort',abort,{once:true});executionClosers.set(scope,()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);closeDevicePagedGraphExecutionSessionV3(scope);});check();return scope;
 }catch(error){if(opened){closeWalletSessionPagedExecutionV1(opened);closeDevicePagedGraphExecutionSessionV3(opened);}throw error;}finally{approvalBusy=false;}
}
export function closeWalletSessionPagedExecutionV1(scope:object):void{executionClosers.get(scope)?.();executionClosers.delete(scope);}

/** A decrypted recovery copy may verify this same already-open identity.
 * It cannot extract key bytes, change the identity or extend the session. */
export function assertWalletSessionIdentityKeyV1(candidate:Uint8Array,expectedPublicKey:string):void{const own=live();need(candidate instanceof Uint8Array&&candidate.length===32&&expectedPublicKey===own.publicKey&&devicePublicKey(candidate)===own.publicKey,'MOBILE_CUSTODY_BACKUP_CONFLICT');let mismatch=0;for(let i=0;i<32;i++)mismatch|=candidate[i]^own.key[i];need(mismatch===0,'MOBILE_CUSTODY_BACKUP_CONFLICT');current(own);}

/** Backup work stays inside one authenticated session. These functions return
 * ciphertext or a same-identity check, never a key or signing capability. */
function identityBackupScope(expectedPublicKey:string,signal?:AbortSignal){
 const own=live(),stamp=epoch;
 const check=()=>{need(!signal?.aborted,'MOBILE_CUSTODY_BACKUP_CANCELLED');current(own);need(epoch===stamp&&expectedPublicKey===own.publicKey&&devicePublicKey(own.key)===expectedPublicKey,'MOBILE_CUSTODY_BACKUP_BINDING');};
 check();return{own,check,binding:{profile:'DEVICE_IDENTITY_CUSTODY_V1' as const,devicePublicKey:expectedPublicKey,routeSHA256:null}};
}
async function approveIdentityBackup(check:()=>void,promptMessage:string):Promise<void>{
 check();need(['android','ios'].includes(Platform.OS)&&await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');check();
 const approved=await Auth.authenticateAsync({promptMessage,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');
}
async function identityBackupPublicCAS(expectedPublicKey:string,check:()=>void):Promise<void>{
 const stored=await Store.getItemAsync(PUBLIC_KEY,publicOptions);check();need(stored===expectedPublicKey,'MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');
}
export async function exportWalletSessionIdentityBackupV1(passphrase:string,expectedPublicKey:string,signal?:AbortSignal):Promise<string>{
 const {own,check,binding}=identityBackupScope(expectedPublicKey,signal);let clear:Uint8Array|undefined;
 try{
  await identityBackupPublicCAS(expectedPublicKey,check);
  await approveIdentityBackup(check,'Crear una copia cifrada de tu misma identidad; guarda la copia y su contraseña fuera del dispositivo');
  await identityBackupPublicCAS(expectedPublicKey,check);
  clear=utf({profile:'DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1',devicePublicKey:expectedPublicKey,privateKeyHex:bytesToHex(own.key)});
  const sealed=await sealDeviceCustodyBackupV1(clear,passphrase,binding,signal);check();await identityBackupPublicCAS(expectedPublicKey,check);return sealed;
 }finally{clear?.fill(0);passphrase='';}
}
export async function verifyWalletSessionIdentityBackupV1(serialized:string,passphrase:string,expectedPublicKey:string,signal?:AbortSignal):Promise<Readonly<{devicePublicKey:string;restored:true}>>{
 const {own,check,binding}=identityBackupScope(expectedPublicKey,signal);let clear:Uint8Array|undefined,candidate:Uint8Array|undefined,value:any;
 try{
  await identityBackupPublicCAS(expectedPublicKey,check);
  await approveIdentityBackup(check,'Comprobar la copia cifrada de esta misma identidad antes de restaurar su custodia');
  await identityBackupPublicCAS(expectedPublicKey,check);
  clear=await unsealDeviceCustodyBackupV1(serialized,passphrase,binding,signal);check();need(clear.length<=1024,'MOBILE_CUSTODY_BACKUP_INVALID');
  value=exact(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear)),['profile','devicePublicKey','privateKeyHex']);
  need(value.profile==='DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1'&&value.devicePublicKey===expectedPublicKey&&typeof value.privateKeyHex==='string','MOBILE_CUSTODY_BACKUP_INVALID');candidate=privateKeyFromHex(value.privateKeyHex);value.privateKeyHex=null;
  need(devicePublicKey(candidate)===expectedPublicKey,'MOBILE_CUSTODY_BACKUP_CONFLICT');let mismatch=0;for(let i=0;i<32;i++)mismatch|=candidate[i]^own.key[i];need(mismatch===0,'MOBILE_CUSTODY_BACKUP_CONFLICT');check();
  await identityBackupPublicCAS(expectedPublicKey,check);return Object.freeze({devicePublicKey:expectedPublicKey,restored:true as const});
 }finally{clear?.fill(0);candidate?.fill(0);if(value)value.privateKeyHex=null;serialized='';passphrase='';}
}

AppState?.addEventListener?.('change',state=>{if(state==='background')lockWalletSessionV1();});
