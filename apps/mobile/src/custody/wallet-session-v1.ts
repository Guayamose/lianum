import {readDevicePagedCutoffRecoveryReviewV5} from './device-paged-custody-views-v3.mjs';
import {readDevicePagedHistoricalWithdrawalReviewV16,assertDevicePagedHistoricalWithdrawalReviewActiveV16} from './device-paged-historical-withdrawal-review-v16.mjs';
/** Foreground wallet custody. Wire permissions remain separate and fresh. */
import {readDevicePagedExecutionReviewV3,assertDevicePagedExecutionReviewActiveV3,readDevicePagedWithdrawalOptionV3,readDevicePagedEconomicReviewV3,assertDevicePagedEconomicReviewActiveV3,readDevicePagedExecutionReviewRefreshV3,readDevicePagedEconomicReviewRefreshV3} from './device-paged-custody-views-v3.mjs';
import * as Store from 'expo-secure-store';
import * as Auth from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import {AppState,Platform} from 'react-native';
import {devicePagedBudgetAmountPresentationDataV4} from '@lianum/mobile-protocol/device/paged-budget-asset-v4';
import {hkdf} from '@noble/hashes/hkdf.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex,privateKeyFromHex,devicePublicKey,signDeviceMessage} from './signing.mjs';
import {readWalletRecoveryInventoryV1} from './wallet-recovery-package-v1.mjs';
import {isWalletRecoveryPartsV4,readWalletRecoveryPartsInventoryV4} from './wallet-recovery-parts-v4.mjs';
import {decryptExpoAesBase64V1} from './expo-aes-base64-v1.mjs';
import {sealDeviceCustodyBackupV1,unsealDeviceCustodyBackupV1} from './sealed-custody-backup-v1.mjs';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as C from '../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';
import {normalizeDevicePagedEconomicViewAnyV5 as normalizeDevicePagedEconomicViewV3} from '../../../../packages/mobile-protocol/src/device-paged-economic-view-v3.mjs';
import * as E from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as SepoliaDefi from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {normalizeDeviceSepoliaMorphoBatchReviewV5} from '@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5';
import {readDeviceExternalFlatRowV1} from '../api/device-external-flat-note-api-v1.mjs';
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
const identityOptions:Store.SecureStoreOptions={requireAuthentication:true,keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.wallet.owner.authenticated.v1',authenticationPrompt:"Open your wallet"};
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
/** One explicit biometric for a whole private recovery operation. This closed
 * original-session scope is accepted only by local custody backup code. It
 * cannot sign, reserve, pay, refresh an SDK frame or survive a session change. */
type RecoveryBatch={own:Session;mode:'EXPORT'|'RESTORE';signal:AbortSignal;abort:()=>void};
const recoveryBatches=new WeakMap<object,RecoveryBatch>(),activeRecoveryBatches=new Set<object>();
export function closeWalletSessionRecoveryBatchV4(token:object):void{const held=recoveryBatches.get(token);if(!held)return;held.signal.removeEventListener('abort',held.abort);recoveryBatches.delete(token);activeRecoveryBatches.delete(token);}
export function assertWalletSessionRecoveryBatchV4(token:object,mode:'EXPORT'|'RESTORE',expectedPublicKey:string,signal:AbortSignal):void{const held=recoveryBatches.get(token);need(held&&held.mode===mode&&held.signal===signal&&!signal.aborted&&held.own.publicKey===expectedPublicKey,'MOBILE_WALLET_SESSION_RECOVERY');current(held!.own);}
export async function approveWalletSessionRecoveryBatchV4(mode:'EXPORT'|'RESTORE',expectedPublicKey:string,signal:AbortSignal):Promise<object>{
 need(mode==='EXPORT'||mode==='RESTORE');const own=live();need(signal instanceof AbortSignal&&!signal.aborted&&own.publicKey===expectedPublicKey&&!approvalBusy,'MOBILE_WALLET_SESSION_RECOVERY');approvalBusy=true;
 try{need(await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');current(own);const approved=await Auth.authenticateAsync({promptMessage:mode==='EXPORT'?"Create the full copy of this wallet, including your previous entries.":"Restore protected data from this wallet. It does not authorize payments.",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');current(own);need(!signal.aborted,'MOBILE_CUSTODY_BACKUP_CANCELLED');renewAuthenticatedSession(own);const token=Object.freeze(Object.create(null)),abort=()=>closeWalletSessionRecoveryBatchV4(token);recoveryBatches.set(token,{own,mode,signal,abort});activeRecoveryBatches.add(token);signal.addEventListener('abort',abort,{once:true});return token;}finally{approvalBusy=false;}
}
/** Authentication for the public-wallet service only. It cannot authorize a
 * blockchain movement: submit accepts an independently reviewed native signature. */
export function signWalletSessionNativeRequestV1(challenge:unknown,expected:{origin:string;path:string;bodySHA256:string}):string{const own=live();const frame=nativeWalletAuthMessageV1(challenge,{...expected,devicePublicKey:own.publicKey});try{const signature=signDeviceMessage(own.key,frame);current(own);return signature;}finally{frame.fill(0);}}
/** Dedicated readonly channel PoP. The actual SDK challenge and same protected
 * Vault/session must be current; arbitrary messages and copied frames fail. */
export async function signWalletSessionPagedSourceRenewalV4(rawChallenge:unknown):Promise<string>{
 need(arguments.length===1);const own=live(),SDK=await import('../api/device-paged-source-renewal-wire-v4.mjs'),S=await import('@lianum/mobile-protocol/device/paged-source-renewal-v4');current(own);const accepted=await SDK.readDevicePagedSourceRenewalWireChallengeV4(rawChallenge);current(own);need(accepted.descriptor.devicePublicKey===own.publicKey,'MOBILE_WALLET_SESSION_BINDING');const message=S.devicePagedSourceRenewalPermissionMessageV4(accepted.challenge,accepted.descriptor);
 try{S.validateDevicePagedSourceRenewalChallengeFreshV4(accepted.challenge,accepted.descriptor);const signature=signDeviceMessage(own.key,message);current(own);await SDK.readDevicePagedSourceRenewalWireChallengeV4(rawChallenge);current(own);return signature;}finally{message.fill(0);}
}
/** Prepares one bounded withdrawal channel; moving funds still needs the
 * separate reviewed W39 approval below. Only an Original pinned SDK frame signs. */
export async function signWalletSessionPagedExpiredWithdrawalV10(raw:unknown):Promise<string>{
 const own=live(),SDK=await import('../api/device-paged-expired-withdrawal-wire-v10.mjs'),EW=await import('@lianum/mobile-protocol/device/paged-expired-withdrawal-v10');
 const consent=await SDK.readDevicePagedExpiredWithdrawalConsentV10(raw);current(own);need(consent.sourceDescriptor.devicePublicKey===own.publicKey,'MOBILE_WALLET_SESSION_BINDING');
 const frame=EW.devicePagedExpiredWithdrawalPermissionMessageV10(consent);try{const signature=signDeviceMessage(own.key,frame);await SDK.readDevicePagedExpiredWithdrawalConsentV10(raw);current(own);return signature;}finally{frame.fill(0);}
}
export function lockWalletSessionV1():void{managed=true;epoch++;const own=session;session=null;for(const token of [...activeRecoveryBatches])closeWalletSessionRecoveryBatchV4(token);for(const token of [...activeIdentityRecoveries])closeWalletSessionJointRecoveryV1(token);for(const token of [...activeSettlements])closeWalletSessionPagedSettlementV3(token);for(const token of [...activeAuthorizations])closeWalletSessionAuthorizationV1(token);for(const scope of [...executionClosers.keys()])closeWalletSessionPagedExecutionV1(scope);if(own){own.closed=true;if(own.timer!==null)clearTimeout(own.timer);own.key.fill(0);own.wrap.fill(0);for(const root of own.roots.values())root.bytes.fill(0);own.roots.clear();}publish();}
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

/** Copy an already unlocked ROOT into a new custody scope as AEAD ciphertext.
 * The original authenticated ROOT remains in its source scope. No plaintext
 * duplicate or second per-operation Android Keystore write is created. */
export async function copyWalletSessionSecretV10(sourceKey:string,sourceOptions:Store.SecureStoreOptions,targetKey:string,targetOptions:Store.SecureStoreOptions):Promise<void>{
 const own=live(),source=rootScope(sourceKey,sourceOptions),target=rootScope(targetKey,targetOptions);need(source.scope!==target.scope,'MOBILE_WALLET_SESSION_SECRET_SCOPE');
 const sourceVersion=versions.get(source.scope)??0;let value:string|null=await readWalletSessionSecret(sourceKey,sourceOptions),root:Uint8Array|undefined,aad:Uint8Array|undefined;
 const sourceCurrent=()=>{current(own);need((versions.get(source.scope)??0)===sourceVersion&&!rootWrites.has(source.scope),'MOBILE_WALLET_SESSION_SECRET_CHANGED');};
 try{
  sourceCurrent();need(value!==null,'MOBILE_WALLET_SESSION_SECRET_BINDING');const prior=await Store.getItemAsync(target.name,target.sealedOptions);sourceCurrent();
  if(prior!==null){need(await readWalletSessionSecret(targetKey,targetOptions)===value,'MOBILE_WALLET_SESSION_SECRET_BINDING');sourceCurrent();return;}
  need(!rootWrites.has(target.scope)&&!rootWork.has(target.scope),'MOBILE_WALLET_SESSION_SECRET_CHANGED');need(await Store.getItemAsync(targetKey,targetOptions)===null,'MOBILE_WALLET_SESSION_SECRET_BINDING');sourceCurrent();
  rootWrites.add(target.scope);let targetVersion=versions.get(target.scope)??0;
  const check=()=>{sourceCurrent();need((versions.get(target.scope)??0)===targetVersion,'MOBILE_WALLET_SESSION_SECRET_CHANGED');};
  try{
   await invalidateWalletSessionSecret(targetKey,targetOptions);sourceCurrent();targetVersion=versions.get(target.scope)??0;check();root=Uint8Array.from(value!.match(/../g)!,pair=>parseInt(pair,16));
   const envelope={format:FORMAT,devicePublicKey:own.publicKey,scopeSHA256:target.scope,legacyRootSHA256:hash(root),sealed:''};aad=associated(envelope);const wrap=await Crypto.AESEncryptionKey.import(own.wrap);check();const sealed=await Crypto.aesEncryptAsync(root,wrap,{nonce:{length:12},tagLength:16,additionalData:aad});check();envelope.sealed=await sealed.combined('base64');check();
   need(await Store.getItemAsync(target.name,target.sealedOptions)===null,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();const raw=JSON.stringify(envelope);await Store.setItemAsync(target.name,raw,target.sealedOptions);check();need(await Store.getItemAsync(target.name,target.sealedOptions)===raw,'MOBILE_WALLET_SESSION_SECRET_CHANGED');check();own.roots.set(target.scope,{bytes:new Uint8Array(root),envelope:raw});
  }finally{rootWrites.delete(target.scope);}
 }finally{root?.fill(0);aad?.fill(0);value=null;}
}

/** A password-authenticated joint copy may repair this same locked identity.
 * This one-use capability is never accepted by any signer or ROOT accessor. */
type JointIdentityRecovery={devicePublicKey:string;identitySHA256:string;packageSHA256:string;signal:AbortSignal;stamp:number;birth:number;used:boolean;closed:boolean;abort:()=>void;timer:ReturnType<typeof setTimeout>};
const identityRecoveries=new WeakMap<object,JointIdentityRecovery>(),activeIdentityRecoveries=new Set<object>();
export function closeWalletSessionJointRecoveryV1(token:object):void{const s=identityRecoveries.get(token);if(!s)return;s.closed=true;clearTimeout(s.timer);s.signal.removeEventListener('abort',s.abort);activeIdentityRecoveries.delete(token);identityRecoveries.delete(token);}
function recoveryHash(value:string):string{const bytes=encoder.encode(value);try{return hash(bytes);}finally{bytes.fill(0);}}
function jointRecoveryCurrent(token:object,identityBackup:string,expectedPublicKey:string,signal:AbortSignal){const s=identityRecoveries.get(token);need(s&&!s.closed&&managed&&session===null&&epoch===s.stamp&&foreground()&&signal===s.signal&&!signal.aborted&&mono()>=s.birth&&mono()-s.birth<60000&&expectedPublicKey===s.devicePublicKey&&recoveryHash(identityBackup)===s.identitySHA256,'MOBILE_WALLET_SESSION_RECOVERY');return s;}
export async function approveWalletSessionJointRecoveryV1(rawInventory:unknown,serialized:string,signal:AbortSignal):Promise<object>{const readInventory=()=>isWalletRecoveryPartsV4(serialized)?readWalletRecoveryPartsInventoryV4(rawInventory,serialized,signal):readWalletRecoveryInventoryV1(rawInventory,serialized,signal);const inventory=readInventory();need(managed&&session===null&&foreground()&&!approvalBusy,'MOBILE_WALLET_SESSION_RECOVERY');const stamp=epoch,publicBefore=await Store.getItemAsync(PUBLIC_KEY,publicOptions);need(publicBefore===null||publicBefore===inventory.devicePublicKey,'MOBILE_CUSTODY_BACKUP_CONFLICT');need(epoch===stamp&&session===null&&!signal.aborted&&foreground(),'MOBILE_WALLET_SESSION_RECOVERY');approvalBusy=true;let token:object|undefined;
 try{need(await Store.isAvailableAsync()&&Store.canUseBiometricAuthentication()&&await Auth.hasHardwareAsync()&&await Auth.isEnrolledAsync(),'MOBILE_PROTECTED_STORAGE_UNAVAILABLE');const approved=await Auth.authenticateAsync({promptMessage:"Recover this same wallet and the custody of the authenticated joint copy; it does not authorize payments.",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');need(epoch===stamp&&session===null&&!signal.aborted&&foreground(),'MOBILE_WALLET_SESSION_RECOVERY');readInventory();need(await Store.getItemAsync(PUBLIC_KEY,publicOptions)===publicBefore,'MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');const held:object=Object.freeze(Object.create(null));token=held;const abort=()=>closeWalletSessionJointRecoveryV1(held);identityRecoveries.set(held,{devicePublicKey:inventory.devicePublicKey,identitySHA256:recoveryHash(inventory.identityBackup),packageSHA256:recoveryHash(serialized),signal,stamp,birth:mono(),used:false,closed:false,abort,timer:setTimeout(abort,60000)});activeIdentityRecoveries.add(held);signal.addEventListener('abort',abort,{once:true});jointRecoveryCurrent(held,inventory.identityBackup,inventory.devicePublicKey,signal);return held;
 }catch(error){if(token)closeWalletSessionJointRecoveryV1(token);throw error;}finally{approvalBusy=false;}}
export function consumeWalletSessionJointIdentityRecoveryV1(token:object,identityBackup:string,expectedPublicKey:string,signal:AbortSignal):()=>void{const s=jointRecoveryCurrent(token,identityBackup,expectedPublicKey,signal);need(!s.used,'MOBILE_WALLET_SESSION_RECOVERY_USED');s.used=true;return()=>{jointRecoveryCurrent(token,identityBackup,expectedPublicKey,signal);};}

export type WalletSessionAuthorizationV1=Readonly<object>;
export type WalletSessionExternalKindV1='NOTE'|'GRAPH'|'OUTPUT'|'BLUE'|'AAVE'|'META';
export type WalletSessionPagedWithdrawalReviewV1={graphId:string;rootId:string;revision:number;role:'change'|'recovery'|'payout';id:string|null;recipient:string;amount:string;nullifier?:string};
type Authorization={own:Session;kind:'PAGED_DEPOSIT'|'PAGED_NOTE_WITHDRAWAL_V10'|'PAGED_WITHDRAWAL'|'PAGED_HISTORICAL_WITHDRAWAL'|'PAGED_CUTOFF_RECOVERY'|'SEPOLIA_DEFI'|'SEPOLIA_DEFI_RECEIPT_V8'|'SEPOLIA_MORPHO_BATCH'|WalletSessionExternalKindV1;descriptor:any;draft:any;birth:number;closed:boolean;used:Set<string>;proof:string|null;proofJob:string|null;command:string|null;quote:any|null;nullifier:string|null;settlement?:object;payoutCommitment?:string;authorizationRoot?:string;defiBatch?:object;batchLeaves?:Map<string,object>;batchSignal?:AbortSignal;cutoffReview?:unknown;historicalReview?:unknown};
type Settlement={own:Session;descriptor:any;review:any;originalReview:unknown;birth:number;closed:boolean;leaves:Map<string,object>;completed:Set<string>;timer:ReturnType<typeof setTimeout>;signal:AbortSignal;abort:()=>void};
const settlements=new WeakMap<object,Settlement>(),activeSettlements=new Set<object>();
const authorizations=new WeakMap<object,Authorization>(),activeAuthorizations=new Set<object>(),executionClosers=new Map<object,()=>void>();
let approvalBusy=false;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function snapshot(raw:unknown){return C.snapshotDevicePagedGraphCommandV3(raw);}
function digest(raw:unknown):string{const copy=snapshot(raw),bytes=utf(copy);try{return hash(bytes);}finally{bytes.fill(0);P.pagedOwnerWipeV3(copy);}}
function descriptorCurrent(own:Session,descriptor:any,origin?:string,pairingId?:string){current(own);need(descriptor.devicePublicKey===own.publicKey&&(origin===undefined||descriptor.origin===origin)&&(pairingId===undefined||descriptor.pairingId===pairingId),'MOBILE_WALLET_SESSION_BINDING');}
function tokenCurrent(token:object,kind:Authorization['kind']):Authorization{const state=authorizations.get(token);if(state?.settlement)settlementCurrent(state.settlement);if(state?.defiBatch)tokenCurrent(state.defiBatch,'SEPOLIA_MORPHO_BATCH');if(state?.historicalReview)assertDevicePagedHistoricalWithdrawalReviewActiveV16(state.historicalReview);need(!state?.batchSignal?.aborted,'MOBILE_WALLET_SESSION_AUTHORIZATION');need(state&&!state.closed&&state.kind===kind,'MOBILE_WALLET_SESSION_AUTHORIZATION');current(state.own);need(mono()-state.birth<IDLE,'MOBILE_WALLET_SESSION_AUTHORIZATION_EXPIRED');descriptorCurrent(state.own,state.descriptor);return state;}
export function closeWalletSessionAuthorizationV1(token:object):void{const state=authorizations.get(token);if(state){for(const leaf of state.batchLeaves?.values()??[])closeWalletSessionAuthorizationV1(leaf);state.batchLeaves?.clear();state.closed=true;state.used.clear();P.pagedOwnerWipeV3(state.draft);P.pagedOwnerWipeV3(state.quote);state.proof=null;state.proofJob=null;state.command=null;state.nullifier=null;}activeAuthorizations.delete(token);authorizations.delete(token);}
async function approve(kind:Authorization['kind'],descriptor:any,draft:any,prompt:string,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const own=live();descriptorCurrent(own,descriptor);need(!signal?.aborted&&!approvalBusy&&activeAuthorizations.size<64,'MOBILE_WALLET_SESSION_AUTHORIZATION');approvalBusy=true;
 try{const captured=snapshot(draft),approved=await Auth.authenticateAsync({promptMessage:prompt,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current(own);need(!signal?.aborted,'MOBILE_WALLET_SESSION_AUTHORIZATION');need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');renewAuthenticatedSession(own);const token=Object.freeze(Object.create(null));authorizations.set(token,{own,kind,descriptor:snapshot(descriptor),draft:captured,birth:mono(),closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null});activeAuthorizations.add(token);return token;
 }finally{approvalBusy=false;}
}
function consume(state:Authorization,action:string,nonce:string){need(!state.used.has(action)&&!state.used.has('nonce:'+nonce),'MOBILE_WALLET_SESSION_AUTHORIZATION_USED');state.used.add(action);state.used.add('nonce:'+nonce);}
/** One fresh approval for an exact locally retained terminal note, paid only
 * through its fresh broker. The historical graph receives no new permission. */
export async function approveWalletSessionPagedHistoricalWithdrawalV16(rawReview:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const review=readDevicePagedHistoricalWithdrawalReviewV16(rawReview);let token:object|undefined;
 try{token=await approve('PAGED_HISTORICAL_WITHDRAWAL',review.brokerDescriptor,review,'Retirar '+review.amount+" units recovered to "+review.recipient+'.',signal);readDevicePagedHistoricalWithdrawalReviewV16(rawReview);const state=authorizations.get(token)!;state.historicalReview=rawReview;state.nullifier=review.nullifier;state.batchSignal=signal;return token;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}
export function consumeWalletSessionPagedHistoricalNoteSignatureV16(token:object,rawReview:unknown):void{
 const state=tokenCurrent(token,'PAGED_HISTORICAL_WITHDRAWAL');need(state.historicalReview===rawReview&&same(assertDevicePagedHistoricalWithdrawalReviewActiveV16(rawReview),state.draft),'MOBILE_WALLET_SESSION_BINDING');consume(state,'HISTORICAL_NOTE_SIGNATURE',digest(state.draft));
}
function historicalWithdrawalWords(state:Authorization,publicInputs:unknown){
 const p=P.normalizeDevicePagedPublicInputsV3('withdraw',publicInputs),review=state.draft;
 need(P.devicePagedWordsHexV3(p,0)===state.descriptor.scope&&P.devicePagedWordsHexV3(p,8)===state.descriptor.policy&&p[16]===review.epoch&&P.devicePagedWordsHexV3(p,25)===review.nullifier&&p[33]===review.amount&&'0x'+p.slice(34,39).map((word:string)=>BigInt(word).toString(16).padStart(8,'0')).join('')===review.recipient,'MOBILE_WALLET_SESSION_BINDING');return p;
}
export function bindWalletSessionPagedHistoricalWithdrawalProofV16(token:object,rawRow:unknown):void{
 const state=tokenCurrent(token,'PAGED_HISTORICAL_WITHDRAWAL'),row=readDevicePagedRowV3(rawRow);need(row.mode==='withdraw'&&row.stage==='PROVED'&&same(row.descriptor,state.descriptor)&&row.rootId===state.draft.rootId&&row.revision===state.draft.revision,'MOBILE_WALLET_SESSION_BINDING');const p=historicalWithdrawalWords(state,row.publicInputs);
 if(state.proofJob!==null)need(state.proofJob===row.jobId,'MOBILE_WALLET_SESSION_BINDING');if(state.quote!==null)need(same(state.quote.publicInputs,p)&&state.quote.witnessSHA256===row.witnessSHA256,'MOBILE_WALLET_SESSION_BINDING');if(state.proof!==null)need(state.proof===row.proofSHA256,'MOBILE_WALLET_SESSION_BINDING');state.proofJob=row.jobId;state.proof=row.proofSHA256;state.quote={publicInputs:snapshot(p),witnessSHA256:row.witnessSHA256};
}
export async function approveWalletSessionPagedNoteWithdrawalV10(rawDescriptor:unknown,rawDraft:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),draft=P.normalizeDevicePagedDraftV3(rawDraft);need(draft.action==='PROVE_W39'&&draft.mode==='withdraw'&&draft.authorizationRoot===null&&draft.reserveNullifier===null,'MOBILE_WALLET_SESSION_AUTHORIZATION');
 need(P.devicePagedWordsHexV3(draft.publicInputs,0)===descriptor.scope&&P.devicePagedWordsHexV3(draft.publicInputs,8)===descriptor.policy,'MOBILE_WALLET_SESSION_BINDING');
 const recipient='0x'+P.devicePagedWordsHexV3(draft.publicInputs,34,5);need(recipient!=='0x'+'0'.repeat(40),'MOBILE_WALLET_SESSION_BINDING');return approve('PAGED_NOTE_WITHDRAWAL_V10',descriptor,draft,'Retirar '+draft.publicInputs[33]+" units to "+recipient+'.',signal);
}
export function bindWalletSessionPagedNoteWithdrawalV10(token:object,raw:unknown):void{
 const state=tokenCurrent(token,'PAGED_NOTE_WITHDRAWAL_V10');let row:any;try{row=readDevicePagedRowV3(raw);}catch{const status=readDevicePagedStatusV3(raw);need(same(status.descriptor,state.descriptor),'MOBILE_WALLET_SESSION_BINDING');row=status.jobs.find((job:any)=>job.jobId===state.draft.jobId);}
 need(row&&row.mode==='withdraw'&&row.stage==='PROVED'&&same(row.descriptor,state.descriptor)&&row.jobId===state.draft.jobId&&row.rootId===state.draft.rootId&&row.revision===state.draft.revision&&same(row.publicInputs,state.draft.publicInputs)&&row.witnessSHA256===state.draft.witnessSHA256,'MOBILE_WALLET_SESSION_BINDING');P.pagedOwnerHexV3(row.proofSHA256);if(state.proof!==null)need(state.proof===row.proofSHA256,'MOBILE_WALLET_SESSION_BINDING');state.proof=row.proofSHA256;
}
export async function approveWalletSessionPagedDepositV1(rawDescriptor:unknown,rawDraft:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),draft=P.normalizeDevicePagedDraftV3(rawDraft);need(draft.action==='PROVE_D26'&&draft.mode==='deposit'&&draft.authorizationRoot===null&&draft.reserveNullifier===null,'MOBILE_WALLET_SESSION_AUTHORIZATION');need(P.devicePagedWordsHexV3(draft.publicInputs,0)===descriptor.scope&&P.devicePagedWordsHexV3(draft.publicInputs,8)===descriptor.policy,'MOBILE_WALLET_SESSION_BINDING');return approve('PAGED_DEPOSIT',descriptor,draft,"Authorize an deposit of "+draft.publicInputs[17]+" units of this note.",signal);
}
/** Only a live original SDK result can grant the FUND half of this approval. */
export function bindWalletSessionPagedDepositV1(token:object,raw:unknown):void{
 const state=tokenCurrent(token,'PAGED_DEPOSIT');let row:any;
 try{row=readDevicePagedRowV3(raw);}catch{const status=readDevicePagedStatusV3(raw);need(same(status.descriptor,state.descriptor),'MOBILE_WALLET_SESSION_BINDING');row=status.jobs.find((job:any)=>job.jobId===state.draft.jobId);}
 need(row&&row.mode==='deposit'&&row.stage==='PROVED'&&same(row.descriptor,state.descriptor)&&row.jobId===state.draft.jobId&&row.rootId===state.draft.rootId&&row.revision===state.draft.revision&&same(row.publicInputs,state.draft.publicInputs)&&row.witnessSHA256===state.draft.witnessSHA256,'MOBILE_WALLET_SESSION_AUTHORIZATION');P.pagedOwnerHexV3(row.proofSHA256);if(state.proof!==null)need(state.proof===row.proofSHA256,'MOBILE_WALLET_SESSION_BINDING');state.proof=row.proofSHA256;
}
export async function signWalletSessionPagedOwnerV1(raw:unknown,origin:string,pairingId:string,signal?:AbortSignal,token?:object):Promise<string>{
 const own=live(),c=P.validateDevicePagedConsentFreshV3(raw);descriptorCurrent(own,c.descriptor,origin,pairingId);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');let approval:Authorization|null=null;
 if(!['READ_STATE','OBSERVE_JOB'].includes(c.action)){
  if(token&&authorizations.get(token)?.kind==='PAGED_HISTORICAL_WITHDRAWAL'){
   approval=tokenCurrent(token,'PAGED_HISTORICAL_WITHDRAWAL');need(approval.own===own&&same(approval.descriptor,c.descriptor)&&c.rootId===approval.draft.rootId&&c.revision===approval.draft.revision&&['PROVE_W39','WITHDRAW_W39'].includes(c.action),'MOBILE_WALLET_SESSION_BINDING');
   if(c.action==='PROVE_W39'){need(approval.used.has('HISTORICAL_NOTE_SIGNATURE')&&c.mode==='withdraw'&&approval.proofJob===null,'MOBILE_WALLET_SESSION_AUTHORIZATION');const p=historicalWithdrawalWords(approval,c.publicInputs);approval.proofJob=c.jobId;approval.quote={publicInputs:snapshot(p),witnessSHA256:c.witnessSHA256};}
   else need(approval.proof!==null&&c.jobId===approval.proofJob&&c.proofSHA256===approval.proof,'MOBILE_WALLET_SESSION_AUTHORIZATION');
   consume(approval,c.action,c.nonce);
  }else if(token&&authorizations.get(token)?.kind==='PAGED_NOTE_WITHDRAWAL_V10'){approval=tokenCurrent(token,'PAGED_NOTE_WITHDRAWAL_V10');need(approval.own===own&&same(approval.descriptor,c.descriptor)&&['jobId','rootId','revision'].every(k=>c[k]===approval!.draft[k])&&['PROVE_W39','WITHDRAW_W39'].includes(c.action),'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_W39')for(const k of Object.keys(approval.draft))need(same(c[k],approval.draft[k]),'MOBILE_WALLET_SESSION_BINDING');else need(approval.proof!==null&&c.proofSHA256===approval.proof,'MOBILE_WALLET_SESSION_BINDING');consume(approval,c.action,c.nonce);}else{need(token&&['PROVE_D26','FUND_D26'].includes(c.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');approval=tokenCurrent(token,'PAGED_DEPOSIT');need(approval.own===own&&same(approval.descriptor,c.descriptor)&&['jobId','rootId','revision'].every(k=>c[k]===approval!.draft[k]),'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_D26')for(const k of Object.keys(approval.draft))need(same(c[k],approval.draft[k]),'MOBILE_WALLET_SESSION_BINDING');else need(approval.proof!==null&&c.proofSHA256===approval.proof,'MOBILE_WALLET_SESSION_AUTHORIZATION');consume(approval,c.action,c.nonce);}
 }
 try{current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');const signature=signDevicePagedConsentV3(own.key,c);current(own);P.validateDevicePagedConsentFreshV3(c);return signature;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}
function withdrawalReview(raw:unknown):WalletSessionPagedWithdrawalReviewV1{const names=['graphId','rootId','revision','role','id','recipient','amount',...(Object.hasOwn((raw??{}) as object,'nullifier')?['nullifier']:[])],v=exact(raw,names);need(/^paged-graph-[0-9a-f]{32}$/.test(v.graphId)&&Number.isSafeInteger(v.revision)&&v.revision>0&&['change','recovery','payout'].includes(v.role),'MOBILE_WALLET_SESSION_BINDING');P.pagedOwnerHexV3(v.rootId);P.pagedOwnerUintV3(v.amount);need(/^0x[0-9a-f]{40}$/.test(v.recipient)&&v.recipient!=='0x'+'0'.repeat(40),'MOBILE_WALLET_SESSION_BINDING');need(v.role==='payout'?typeof v.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v.id):v.id===null,'MOBILE_WALLET_SESSION_BINDING');if(v.nullifier!==undefined)P.pagedOwnerHexV3(v.nullifier);return snapshot(v);}
export async function approveWalletSessionPagedWithdrawalV1(rawDescriptor:unknown,rawReview:unknown,signal?:AbortSignal,originalOption?:object):Promise<WalletSessionAuthorizationV1>{
 const descriptor=P.normalizeDevicePagedDescriptorV3(rawDescriptor),review=withdrawalReview(rawReview);
 if(review.nullifier!==undefined){need(originalOption,'MOBILE_WALLET_SESSION_BINDING');const option=readDevicePagedWithdrawalOptionV3(originalOption);need(same(option.descriptor,descriptor)&&['graphId','rootId','revision','role','id','amount','nullifier'].every(k=>(option as any)[k]===(review as any)[k]),'MOBILE_WALLET_SESSION_BINDING');}
 return approve('PAGED_WITHDRAWAL',descriptor,review,"Authorize a withdrawal of "+review.amount+" units to "+review.recipient+'.',signal);
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
/** Explicit sensitive approval of one cutoff, using the original authenticated
 * graph facts. An expired quotation is not renewed or converted into execution. */
export async function approveWalletSessionPagedCutoffRecoveryV5(rawReview:unknown,signal?:AbortSignal):Promise<object>{
 const review=readDevicePagedCutoffRecoveryReviewV5(rawReview);let token:object|undefined;
 try{token=await approve('PAGED_CUTOFF_RECOVERY',review.descriptor,review,"Recover the budget of this expired graph; confirmed deliveries are retained.",signal);readDevicePagedCutoffRecoveryReviewV5(rawReview);authorizations.get(token)!.cutoffReview=rawReview;return token;}
 catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}
export async function signWalletSessionPagedGraphV1(raw:unknown,origin:string,pairingId:string,signal?:AbortSignal,options?:{authorization:object;command:unknown}):Promise<string>{
 const own=live(),c=C.validateDevicePagedGraphConsentFreshV3(raw);descriptorCurrent(own,c.descriptor,origin,pairingId);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');const ordinary=['READ_GRAPH','OBSERVE_GRAPH','READ_ECONOMIC_SETTLEMENT','READ_ECONOMIC_OPERATION','READ_PORTFOLIO','READ_SOURCE_CONTINUATION_V4','NEXT_COMMAND','READ_READY','READ_OUTPUT','BEGIN_GRAPH','PREPARE_EXECUTOR_PAYOUTS_V5','PREPARE_NATIVE_PAGE','APPEND_PAGE','SEAL_GRAPH','STOP_AUTOMATION'];let token:object|undefined;
 if(c.action==='RECOVER_CUTOFF'){need(options,'MOBILE_WALLET_SESSION_AUTHORIZATION');token=options.authorization;const state=tokenCurrent(token,'PAGED_CUTOFF_RECOVERY');readDevicePagedCutoffRecoveryReviewV5(state.cutoffReview);need(state.own===own&&same(state.descriptor,c.descriptor)&&['graphId','rootId','revision','authorizationRoot','reserveNullifier','progressCommitment'].every(k=>c[k]===(state.draft as any)[k])&&digest(options.command)===digest({})&&c.commandSHA256===digest({}),'MOBILE_WALLET_SESSION_BINDING');consume(state,c.action,c.nonce);}
 else if(!ordinary.includes(c.action)){need(options&&['PROVE_OUTPUT_W39','WITHDRAW_OUTPUT_W39'].includes(c.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');token=options.authorization;const state=tokenCurrent(token,'PAGED_WITHDRAWAL');need(state.own===own&&same(state.descriptor,c.descriptor)&&(state.authorizationRoot===undefined||c.authorizationRoot===state.authorizationRoot)&&['graphId','rootId','revision'].every(k=>c[k]===state.draft[k]),'MOBILE_WALLET_SESSION_BINDING');const command=digest(options.command);need(command===c.commandSHA256,'MOBILE_WALLET_SESSION_BINDING');if(c.action==='PROVE_OUTPUT_W39')need(state.command!==null&&state.command===command,'MOBILE_WALLET_SESSION_AUTHORIZATION');else need(state.proof!==null&&state.proofJob!==null&&command===digest({}),'MOBILE_WALLET_SESSION_AUTHORIZATION');consume(state,c.action,c.nonce);if(state.settlement)touchWalletSessionV1();}
 try{const signature=signDevicePagedGraphConsentV3(own.key,c);current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');C.validateDevicePagedGraphConsentFreshV3(c);return signature;}catch(error){if(token)closeWalletSessionAuthorizationV1(token);throw error;}
}

/** A single strong approval delegates only the reviewed original payout
 * leaves. No identity key or generic permission is copied into this scope. */
function settlementCurrent(token:object):Settlement{const state=settlements.get(token);need(state&&!state.closed,'MOBILE_WALLET_SESSION_SETTLEMENT');try{assertDevicePagedEconomicReviewActiveV3(state.originalReview);}catch(error){closeWalletSessionPagedSettlementV3(token);throw error;}current(state.own);need(mono()>=state.birth&&mono()-state.birth<MAXIMUM&&!state.signal.aborted&&P.devicePagedNowV3()<state.descriptor.deadlineMs,'MOBILE_WALLET_SESSION_SETTLEMENT_EXPIRED');descriptorCurrent(state.own,state.descriptor);return state;}
export function closeWalletSessionPagedSettlementV3(token:object):void{const state=settlements.get(token);if(!state||state.closed)return;state.closed=true;clearTimeout(state.timer);state.signal.removeEventListener('abort',state.abort);for(const leaf of state.leaves.values())closeWalletSessionAuthorizationV1(leaf);state.leaves.clear();P.pagedOwnerWipeV3(state.review);activeSettlements.delete(token);settlements.delete(token);}
export async function approveWalletSessionPagedSettlementV3(rawReview:unknown,signal:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{const own=live();let review=readDevicePagedEconomicReviewV3(rawReview),activeReview=rawReview;need(refreshOriginalReview===undefined||typeof refreshOriginalReview==='function','MOBILE_WALLET_SESSION_SETTLEMENT');need(signal instanceof AbortSignal&&!signal.aborted&&review.eligible&&review.changeConfirmed&&!approvalBusy&&activeSettlements.size<4,'MOBILE_WALLET_SESSION_SETTLEMENT');descriptorCurrent(own,review.plan.descriptor);approvalBusy=true;let token:object|undefined;
 try{const approved=await Auth.authenticateAsync({promptMessage:`Pay ${review.plan.payouts.filter(row=>!review.paid.some(p=>p.id===row.id)).length} results to the provider of this operation, up to 30 minutes with the app open.`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current(own);need(!signal.aborted,'MOBILE_PAGED_CANCELLED');need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');assertDevicePagedEconomicReviewActiveV3(rawReview);if(refreshOriginalReview){const fresh=await refreshOriginalReview();current(own);need(!signal.aborted,'MOBILE_PAGED_CANCELLED');review=readDevicePagedEconomicReviewRefreshV3(rawReview,fresh);activeReview=fresh;}else review=readDevicePagedEconomicReviewV3(rawReview);need(review.eligible&&review.changeConfirmed,'MOBILE_WALLET_SESSION_SETTLEMENT');descriptorCurrent(own,review.plan.descriptor);renewAuthenticatedSession(own);const held:object=Object.freeze(Object.create(null));token=held;const abort=()=>closeWalletSessionPagedSettlementV3(held),remaining=Math.min(MAXIMUM,review.plan.descriptor.deadlineMs-P.devicePagedNowV3());need(remaining>0,'MOBILE_WALLET_SESSION_SETTLEMENT_EXPIRED');settlements.set(held,{own,descriptor:snapshot(review.plan.descriptor),review:snapshot(review),originalReview:activeReview,birth:mono(),closed:false,leaves:new Map(),completed:new Set(),timer:setTimeout(abort,remaining),signal,abort});activeSettlements.add(held);signal.addEventListener('abort',abort,{once:true});settlementCurrent(held);return held;
 }catch(error){if(token)closeWalletSessionPagedSettlementV3(token);throw error;}finally{approvalBusy=false;}}
export function walletSessionPagedSettlementLeafV3(token:object,id:string):object{const parent=settlementCurrent(token),row=parent.review.plan.payouts.find((value:any)=>value.id===id);need(row&&!parent.completed.has(id)&&!parent.review.paid.some((value:any)=>value.id===id),'MOBILE_WALLET_SESSION_SETTLEMENT');const previous=parent.leaves.get(id);if(previous){tokenCurrent(previous,'PAGED_WITHDRAWAL');return previous;}need(activeAuthorizations.size<64,'MOBILE_WALLET_SESSION_AUTHORIZATION');const draft=withdrawalReview({graphId:parent.review.plan.graphId,rootId:parent.review.rootId,revision:parent.review.revision,role:'payout',id:row.id,recipient:parent.review.plan.beneficiary,amount:row.amount,nullifier:row.nullifier}),leaf=Object.freeze(Object.create(null));authorizations.set(leaf,{own:parent.own,kind:'PAGED_WITHDRAWAL',descriptor:snapshot(parent.descriptor),draft,birth:mono(),closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null,settlement:token,payoutCommitment:row.commitment,authorizationRoot:parent.review.plan.authorizationRoot});activeAuthorizations.add(leaf);parent.leaves.set(id,leaf);return leaf;}

/** Release a leaf only after a fresh original economic observation confirms
 * its exact W39 and spent NF. The reviewed parent retains a used-id tombstone;
 * neither a lost effect reply nor a caller DATA object can release/reissue it. */
export function completeWalletSessionPagedSettlementLeafV3(token:object,id:string,rawReply:unknown):void{
 const parent=settlementCurrent(token),leaf=parent.leaves.get(id);need(leaf&&!parent.completed.has(id),'MOBILE_WALLET_SESSION_SETTLEMENT');
 const state=tokenCurrent(leaf!,'PAGED_WITHDRAWAL'),{reply,c,status}=withdrawalReply(state,rawReply),job=status.job;
 need(c.action==='READ_ECONOMIC_SETTLEMENT'&&job?.mode==='withdraw'&&job.stage==='CONFIRMED'&&job.jobId===state.proofJob&&job.proofSHA256===state.proof&&job.transactionHash!==null,'MOBILE_WALLET_SESSION_SETTLEMENT');
 const p=job!.publicInputs;need(P.devicePagedWordsHexV3(p,0)===state.descriptor.scope&&P.devicePagedWordsHexV3(p,8)===state.descriptor.policy&&P.devicePagedWordsHexV3(p,25)===state.draft.nullifier&&p[33]===state.draft.amount&&'0x'+p.slice(34,39).map((value:string)=>BigInt(value).toString(16).padStart(8,'0')).join('')===state.draft.recipient,'MOBILE_WALLET_SESSION_BINDING');
 const view=normalizeDevicePagedEconomicViewV3(reply.private,parent.descriptor),output=view.outputs.find(row=>row.id===id),row=view.rows.find(row=>row.id===id);
 need(view.graphId===parent.review.plan.graphId&&view.authorizationRoot===parent.review.plan.authorizationRoot&&view.ledger.blockHash===status.blockHash&&view.ledger.blockNumber===status.blockNumber&&row?.providerIdentity===parent.review.providerIdentity&&row?.signerIdentity===parent.review.signerIdentity&&row?.beneficiary.address===parent.review.plan.beneficiary&&output?.commitment===state.payoutCommitment&&output?.amount===state.draft.amount&&output?.nullifier===state.draft.nullifier&&output?.withdrawn&&view.ledger.spentNullifiers.some(value=>value.nullifier===state.draft.nullifier&&value.spent),'MOBILE_WALLET_SESSION_BINDING');
 parent.completed.add(id);parent.leaves.delete(id);closeWalletSessionAuthorizationV1(leaf!);
}


/** Sensitive approval precedes the note signature and disclosure to a prover.
 * This reviewed domain cannot authorize arbitrary messages or another venue. */
export async function approveWalletSessionSepoliaDefiV4(rawReview:unknown,signal?:AbortSignal):Promise<object>{
 const review=SepoliaDefi.normalizeDeviceSepoliaDefiReviewV4(rawReview);const name=review.protocol==='AAVE_STATIC'?'Aave':'Morpho';
 return approve('SEPOLIA_DEFI',review.descriptor,review,review.action==='INVEST'?`Authorize this investment in ${name}, with USDC maximum and reviewed deadlines.`:`Authorize this withdrawal of ${name} to the reviewed USDC address.`,signal);
}
/** Preparing a Source7-bound D27 cannot spend, withdraw or authorize a native
 * investment. The final signed PAEG review still requires its strong approval. */
export async function prepareWalletSessionSepoliaDefiReceiptV8(rawReview:unknown,originalPreparation:object,signal?:AbortSignal):Promise<object>{
 const own=live(),review=SepoliaDefi.normalizeDeviceSepoliaDefiReviewV4(rawReview),{readDevicePagedSepoliaDefiReceiptPreparationV8}=await import('./device-paged-note-vault-v3.ts'),prepared=await readDevicePagedSepoliaDefiReceiptPreparationV8(originalPreparation);current(own);need(review.action==='INVEST'&&same(prepared.review,review)&&prepared.descriptor.chainId==='11155111'&&prepared.descriptor.origin===review.descriptor.origin&&prepared.descriptor.devicePublicKey===own.publicKey&&prepared.receiptCommitment===review.receiptCommitment&&!signal?.aborted&&!approvalBusy&&activeAuthorizations.size<64,'MOBILE_SEPOLIA_DEFI_RECEIPT_PREPARATION');descriptorCurrent(own,review.descriptor);const token=Object.freeze(Object.create(null));authorizations.set(token,{own,kind:'SEPOLIA_DEFI_RECEIPT_V8',descriptor:snapshot(review.descriptor),draft:snapshot(review),birth:mono(),closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null,batchSignal:signal});activeAuthorizations.add(token);return token;
}
function sepoliaDefiAuthorization(token:object):Authorization{const state=authorizations.get(token);need(state&&(state.kind==='SEPOLIA_DEFI'||state.kind==='SEPOLIA_DEFI_RECEIPT_V8'),'MOBILE_WALLET_SESSION_AUTHORIZATION');const currentState=tokenCurrent(token,state.kind);need(state.kind!=='SEPOLIA_DEFI_RECEIPT_V8'||state.draft.action==='INVEST','MOBILE_SEPOLIA_DEFI_RECEIPT_PREPARATION');return currentState;}
/** One explicit maximum-USDC review owns only its exact distinct note leaves.
 * The pure share planner/quote DATA cannot derive any leaf without this original
 * foreground approval; closing/cancelling the parent fences every leaf. */
export async function approveWalletSessionSepoliaMorphoBatchV5(rawReview:unknown,signal?:AbortSignal):Promise<object>{
 const review=normalizeDeviceSepoliaMorphoBatchReviewV5(rawReview),atomic=BigInt(review.maximumInputAtomic),whole=atomic/1000000n,fraction=(atomic%1000000n).toString().padStart(6,'0').replace(/0+$/,'');
 const token=await approve('SEPOLIA_MORPHO_BATCH',review.notes[0].review.descriptor,review,`Invest up to ${whole}${fraction?'.'+fraction:''} USDC in Morpho ${review.notes.length} notes, with recipients and reviewed deadlines.`,signal),state=authorizations.get(token)!;state.batchLeaves=new Map();state.batchSignal=signal;return token;
}
export function assertWalletSessionSepoliaMorphoBatchV5(token:object,rawReview:unknown):void{const state=tokenCurrent(token,'SEPOLIA_MORPHO_BATCH');need(same(state.draft,normalizeDeviceSepoliaMorphoBatchReviewV5(rawReview)),'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');}
export function walletSessionSepoliaMorphoBatchLeafV5(token:object,id:string):object{
 const parent=tokenCurrent(token,'SEPOLIA_MORPHO_BATCH'),review=normalizeDeviceSepoliaMorphoBatchReviewV5(parent.draft),row=review.notes.find(note=>note.id===id);need(row,'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');
 const existing=parent.batchLeaves!.get(id);if(existing){tokenCurrent(existing,'SEPOLIA_DEFI');return existing;}
 need(!parent.used.has('leaf:'+id)&&activeAuthorizations.size<64,'MOBILE_WALLET_SESSION_AUTHORIZATION_USED');descriptorCurrent(parent.own,row.review.descriptor);parent.used.add('leaf:'+id);
 const leaf=Object.freeze(Object.create(null));authorizations.set(leaf,{own:parent.own,kind:'SEPOLIA_DEFI',descriptor:snapshot(row.review.descriptor),draft:snapshot(row.review),birth:parent.birth,closed:false,used:new Set(),proof:null,proofJob:null,command:null,quote:null,nullifier:null,defiBatch:token});activeAuthorizations.add(leaf);parent.batchLeaves!.set(id,leaf);return leaf;
}
export function assertWalletSessionSepoliaDefiV4(token:object,rawReview:unknown):void{const state=sepoliaDefiAuthorization(token),review=SepoliaDefi.normalizeDeviceSepoliaDefiReviewV4(rawReview);need(same(state.draft,review),'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');}
export function signWalletSessionSepoliaDefiReviewV4(token:object,rawChallenge:unknown):string{
 const state=sepoliaDefiAuthorization(token),c=SepoliaDefi.validateDeviceSepoliaDefiReviewFreshV4(rawChallenge);assertWalletSessionSepoliaDefiV4(token,c.review);consume(state,'REVIEW',c.nonce);const frame=SepoliaDefi.deviceSepoliaDefiReviewPermissionMessageV4(c);try{const signature=signDeviceMessage(state.own.key,frame);assertWalletSessionSepoliaDefiV4(token,c.review);SepoliaDefi.validateDeviceSepoliaDefiReviewFreshV4(c);return signature;}finally{frame.fill(0);}
}
export function bindWalletSessionSepoliaDefiProofV4(token:object,rawRow:unknown):void{const state=sepoliaDefiAuthorization(token),review=SepoliaDefi.normalizeDeviceSepoliaDefiReviewV4(state.draft),row=readDeviceExternalFlatRowV1(rawRow as any),c=row.consentFields;need(row.stage==='PROVED'&&same(row.descriptor,review.descriptor)&&c.rootId===review.rootId&&c.noteRevision===review.noteRevision&&c.statement.amount===review.shares&&c.recipient===review.shareWithdrawalRecipient.slice(2)&&row.mode===(review.action==='INVEST'?'deposit_intent':'withdraw_balance'),'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');need(state.proof===null,'MOBILE_WALLET_SESSION_AUTHORIZATION_USED');state.proof=c.proofSHA256;state.proofJob=c.jobId;state.quote=snapshot(c);}
/** Only the same approved amounts/root may reach the existing NOTE signer.
 * It uses the one original approval and creates no login-derived permission. */
export async function signWalletSessionSepoliaDefiNoteV4(token:object,rawConsent:unknown):Promise<string>{
 const state=sepoliaDefiAuthorization(token),review=SepoliaDefi.normalizeDeviceSepoliaDefiReviewV4(state.draft),c=E.normalizeExternalFlatConsentV1(rawConsent);E.validateExternalFlatFreshV1(c);need(same(c.descriptor,review.descriptor)&&c.rootId===review.rootId&&c.noteRevision===review.noteRevision&&c.statement?.amount===review.shares&&c.recipient===review.shareWithdrawalRecipient.slice(2),'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');
 need(review.action==='INVEST'?c.action==='PROVE_D27':c.action==='PROVE_W39'||c.action==='WITHDRAW_W39','MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');if(c.action==='WITHDRAW_W39'){need(c.jobId===state.proofJob&&c.proofSHA256===state.proof&&c.publicInputsSHA256===state.quote?.publicInputsSHA256,'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');for(const k of ['depositJobId','statement','path','witnessSHA256'])need(same((c as any)[k],state.quote?.[k]),'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');}if(review.action==='INVEST')need(c.statement.validFrom===review.validFrom&&c.statement.validUntil===review.validUntil,'MOBILE_SEPOLIA_DEFI_REVIEW_CHANGED');consume(state,c.action,c.nonce);const frame=E.externalFlatPermissionMessageV1(c);try{const signature=signDeviceMessage(state.own.key,frame);assertWalletSessionSepoliaDefiV4(token,review);E.validateExternalFlatFreshV1(c);return signature;}finally{frame.fill(0);}
}

function externalNoteDraft(raw:unknown){const d=exact(snapshot(raw),['action','jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256']);need(['PROVE_D26','FUND_D26','PROVE_D27','PROVE_W39','WITHDRAW_W39'].includes(d.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');E.externalFlatHexV1(d.rootId);need(d.noteRevision===1,'MOBILE_WALLET_SESSION_BINDING');E.externalFlatHexV1(d.recipient,40);need(d.recipient!=='0'.repeat(40),'MOBILE_WALLET_SESSION_BINDING');if(d.jobId!==null)E.externalFlatHexV1(d.jobId);need(d.jobId!==null||d.action==='PROVE_D26'||d.action==='PROVE_D27','MOBILE_WALLET_SESSION_BINDING');if(d.witnessSHA256!==null)E.externalFlatHexV1(d.witnessSHA256);need(d.statement&&d.statement.scope&&d.statement.policy&&typeof d.statement.amount==='string','MOBILE_WALLET_SESSION_BINDING');E.externalFlatUintV1(d.statement.amount);return d;}
function redemptionDraft(kind:'BLUE'|'AAVE'|'META',raw:unknown){const d=exact(snapshot(raw),['action','withdrawalJobId','minimumAssets','deadline']);need(d.action==='REDEEM_'+kind,'MOBILE_WALLET_SESSION_AUTHORIZATION');E.externalFlatHexV1(d.withdrawalJobId);E.externalFlatUintV1(d.minimumAssets);E.externalFlatUintV1(d.deadline);return d;}
export async function approveWalletSessionExternalV1(kind:WalletSessionExternalKindV1,rawDescriptor:unknown,rawDraft:unknown,signal?:AbortSignal):Promise<WalletSessionAuthorizationV1>{
 const descriptor=E.normalizeExternalFlatDescriptorV1(rawDescriptor);need(['NOTE','GRAPH','OUTPUT','BLUE','AAVE','META'].includes(kind),'MOBILE_WALLET_SESSION_AUTHORIZATION');let draft:any;
 if(kind==='NOTE')draft=externalNoteDraft(rawDraft);else if(kind==='GRAPH'){draft=G.normalizeExternalFlatGraphDraftV1(rawDraft);need(!['OBSERVE_S','RECONCILE_GRAPH'].includes(draft.action),'MOBILE_WALLET_SESSION_AUTHORIZATION');}else if(kind==='OUTPUT')draft=G.normalizeExternalFlatGraphOutputDraftV1(rawDraft);else draft=redemptionDraft(kind,rawDraft);
 const action=draft.action??draft.draft?.action,names:Record<string,string>={PROVE_D26:"preparing for admission",FUND_D26:"enter funds",PROVE_D27:"preparing for admission",PROVE_W39:"prepare for withdrawal",WITHDRAW_W39:"withdraw funds",PROVE_U:"prepare the operation",RESERVE_S:"reserve funds",EXECUTE_GRAPH:"execute the operation",RECOVER_GRAPH:"Recovery of funds",CANCEL_GRAPH:"cancel operation",REDEEM_BLUE:"withdraw the investment",REDEEM_AAVE:"withdraw the investment",REDEEM_META:"withdraw the investment"};need(names[action],'MOBILE_WALLET_SESSION_AUTHORIZATION');return approve(kind,descriptor,draft,"Authorize "+names[action]+" of this reviewed operation.",signal);
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
export async function openWalletSessionPagedExecutionV1(rawReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{return openPagedExecution(rawReview,signal,refreshOriginalReview);}
export async function openWalletSessionPagedAutomationV4(rawAutomationReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{const port=await import('./device-paged-custody-views-v3.mjs'),automation=port.readDevicePagedAutomationReviewV4(rawAutomationReview);return openPagedExecution(automation.execution,signal,refreshOriginalReview,rawAutomationReview);}
export async function openWalletSessionPagedAgentAutomationV4(rawAgentReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{const port=await import('./device-paged-agent-review-v4.mjs'),agent=port.readDevicePagedAgentAutomationReviewV4(rawAgentReview);return openPagedExecution(agent.automation.execution,signal,refreshOriginalReview,agent.automation,rawAgentReview);}
async function openPagedExecution(rawReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>,rawAutomationReview?:unknown,rawAgentReview?:unknown):Promise<object>{
 const automationPort=rawAutomationReview!==undefined?await import('./device-paged-custody-views-v3.mjs'):null;
 const agentPort=rawAgentReview!==undefined?await import('./device-paged-agent-review-v4.mjs'):null;let activeAgent=rawAgentReview;
 const own=live();current(own);let review=readDevicePagedExecutionReviewV3(rawReview),activeReview=rawReview,activeAutomation=rawAutomationReview;need(refreshOriginalReview===undefined||typeof refreshOriginalReview==='function','MOBILE_PAGED_EXECUTION_REVIEW');
 const check=()=>{current(own);need(!signal?.aborted,'MOBILE_PAGED_CANCELLED');assertDevicePagedExecutionReviewActiveV3(activeReview);if(activeAutomation!==undefined)automationPort!.assertDevicePagedAutomationReviewActiveV4(activeAutomation);if(activeAgent!==undefined)need(agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).automation===activeAutomation,'MOBILE_PAGED_AGENT_REVIEW');descriptorCurrent(own,review.descriptor);};check();need(!approvalBusy,'MOBILE_WALLET_SESSION_AUTHORIZATION');approvalBusy=true;let opened:object|undefined;
 const budgetPresentation=devicePagedBudgetAmountPresentationDataV4(review.budget,review.descriptor,review.budgetAsset?{budgetAsset:review.budgetAsset,fundingOrigin:review.fundingOrigin!}:null);
 try{const approved=await Auth.authenticateAsync({promptMessage:activeAutomation!==undefined?`Authorize these ${review.steps.length} payments and reserve ${budgetPresentation.amount}. The server can continue with the app closed until the reviewed deadline.${activeAgent!==undefined?" The agent "+agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant.readerPublicKey.slice(0,18)+" can only read progress ("+agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant.maximumReads+" checks; read-only until "+new Date('readUntilMs' in agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant?(agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant as import('@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5').DevicePagedAgentReadGrantV5).readUntilMs:agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant.terms.expiresAt).toLocaleString('en-US')+').':''}`:`Authorize ${review.steps.length} payments and reserve ${budgetPresentation.amount}, for up to 30 minutes with the app open.`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');if(refreshOriginalReview){const fresh=await refreshOriginalReview();check();review=readDevicePagedExecutionReviewRefreshV3(rawReview,fresh);activeReview=fresh;if(activeAgent!==undefined){activeAgent=agentPort!.refreshDevicePagedAgentAutomationReviewV4(activeAgent,fresh);activeAutomation=agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).automation;}else if(activeAutomation!==undefined)activeAutomation=automationPort!.refreshDevicePagedAutomationReviewV4(activeAutomation,fresh);}else review=readDevicePagedExecutionReviewV3(rawReview);check();renewAuthenticatedSession(own);for(const other of [...executionClosers.keys()])closeWalletSessionPagedExecutionV1(other);
  opened=createDevicePagedGraphExecutionSessionV3(own.key,{descriptor:review.descriptor,rootId:review.rootId,graphId:review.graphId,authorizationRoot:review.authorizationRoot,reserveNullifier:review.reserveNullifier,budget:review.budget,settleBefore:review.settleBefore,deadlineMs:Math.min(P.devicePagedNowV3()+DEVICE_PAGED_EXECUTION_MAX_MS_V3,review.descriptor.deadlineMs,...(activeAutomation!==undefined?[automationPort!.readDevicePagedAutomationReviewV4(activeAutomation).request.expiresAt]:[])),...(activeAutomation!==undefined?{automation:automationPort!.readDevicePagedAutomationReviewV4(activeAutomation).request}:{}),...(activeAgent!==undefined?{agentReadGrant:agentPort!.readDevicePagedAgentAutomationReviewV4(activeAgent).grant}:{})},()=>{check();need(AppState.currentState==='active','MOBILE_PAGED_CANCELLED');},()=>{check();touchWalletSessionV1();});const scope=opened,abort=()=>closeWalletSessionPagedExecutionV1(scope),timer=setTimeout(abort,DEVICE_PAGED_EXECUTION_MAX_MS_V3);signal?.addEventListener('abort',abort,{once:true});executionClosers.set(scope,()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);closeDevicePagedGraphExecutionSessionV3(scope);});check();return scope;
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
 const approved=await Auth.authenticateAsync({promptMessage,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();need(approved.success,'MOBILE_AUTHENTICATION_CANCELLED');
}
async function identityBackupPublicCAS(expectedPublicKey:string,check:()=>void):Promise<void>{
 const stored=await Store.getItemAsync(PUBLIC_KEY,publicOptions);check();need(stored===expectedPublicKey,'MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');
}
export async function exportWalletSessionIdentityBackupV1(passphrase:string,expectedPublicKey:string,signal?:AbortSignal,batch?:object):Promise<string>{
 const {own,check,binding}=identityBackupScope(expectedPublicKey,signal);let clear:Uint8Array|undefined;
 try{
  await identityBackupPublicCAS(expectedPublicKey,check);
  if(batch){need(signal instanceof AbortSignal);assertWalletSessionRecoveryBatchV4(batch,'EXPORT',expectedPublicKey,signal);}else await approveIdentityBackup(check,"Create an encrypted copy of your own identity; save the copy and password outside the device");
  await identityBackupPublicCAS(expectedPublicKey,check);
  clear=utf({profile:'DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1',devicePublicKey:expectedPublicKey,privateKeyHex:bytesToHex(own.key)});
  const sealed=await sealDeviceCustodyBackupV1(clear,passphrase,binding,signal);check();await identityBackupPublicCAS(expectedPublicKey,check);return sealed;
 }finally{clear?.fill(0);passphrase='';}
}
export async function verifyWalletSessionIdentityBackupV1(serialized:string,passphrase:string,expectedPublicKey:string,signal?:AbortSignal):Promise<Readonly<{devicePublicKey:string;restored:true}>>{
 const {own,check,binding}=identityBackupScope(expectedPublicKey,signal);let clear:Uint8Array|undefined,candidate:Uint8Array|undefined,value:any;
 try{
  await identityBackupPublicCAS(expectedPublicKey,check);
  await approveIdentityBackup(check,"Check the encrypted copy of this same identity before restoring its custody");
  await identityBackupPublicCAS(expectedPublicKey,check);
  clear=await unsealDeviceCustodyBackupV1(serialized,passphrase,binding,signal);check();need(clear.length<=1024,'MOBILE_CUSTODY_BACKUP_INVALID');
  value=exact(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear)),['profile','devicePublicKey','privateKeyHex']);
  need(value.profile==='DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1'&&value.devicePublicKey===expectedPublicKey&&typeof value.privateKeyHex==='string','MOBILE_CUSTODY_BACKUP_INVALID');candidate=privateKeyFromHex(value.privateKeyHex);value.privateKeyHex=null;
  need(devicePublicKey(candidate)===expectedPublicKey,'MOBILE_CUSTODY_BACKUP_CONFLICT');let mismatch=0;for(let i=0;i<32;i++)mismatch|=candidate[i]^own.key[i];need(mismatch===0,'MOBILE_CUSTODY_BACKUP_CONFLICT');check();
  await identityBackupPublicCAS(expectedPublicKey,check);return Object.freeze({devicePublicKey:expectedPublicKey,restored:true as const});
 }finally{clear?.fill(0);candidate?.fill(0);if(value)value.privateKeyHex=null;serialized='';passphrase='';}
}

AppState?.addEventListener?.('change',state=>{if(state==='background')lockWalletSessionV1();});
