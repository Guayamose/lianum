import * as Store from 'expo-secure-store';
import * as Auth from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import {AppState} from 'react-native';
import {hex} from '@scure/base';
import {sha256} from '@noble/hashes/sha2.js';
import * as RecoverySession from './wallet-session-v1.ts';
import {sealDeviceCustodyBackupV1,unsealDeviceCustodyBackupV1} from './sealed-custody-backup-v1.mjs';
import {readWalletRecoveryPartsInventoryV4} from './wallet-recovery-parts-v4.mjs';
import {deriveNativeAccountsV1,nativeEntropyV1,nativeMnemonicV1,signNativeWalletTransactionV1,validateNativeSendReviewV1,validateNativeAccountV1,type NativeAccountV1} from '../../../../packages/crypto/src/native-wallet-v1.mjs';
import {walletSessionStatusV1,readWalletSessionSecret,writeWalletSessionSecret,captureWalletSessionGuardV1} from './wallet-session-v1.ts';

const SECRET='lianum.native.wallet.v1.root',META='lianum.native.wallet.v1.accounts';
const secretOptions:Store.SecureStoreOptions={requireAuthentication:true,keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'lianum.native.wallet.v1',authenticationPrompt:"Protect your Ethereum, Bitcoin and Solana wallet"};
const publicOptions:Store.SecureStoreOptions={keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,keychainService:'org.lianum.native.wallet.public.v1'};
type Metadata={version:1;devicePublicKey:string;entropyBytes:16|32;network:'mainnet'|'testnet';accounts:NativeAccountV1[]};
let busy=false,operationGuard:(()=>void)|undefined;
function current(signal:AbortSignal,owner?:string){operationGuard?.();const session=walletSessionStatusV1();if(signal.aborted||!session.active||AppState.currentState==='background'||(owner&&session.publicKey!==owner))throw Error('NATIVE_WALLET_LOCKED');return session.publicKey!;}
async function exclusive<T>(work:()=>Promise<T>){if(busy)throw Error('NATIVE_WALLET_BUSY');operationGuard=captureWalletSessionGuardV1();busy=true;try{return await work();}finally{operationGuard=undefined;busy=false;}}
async function metadata(signal:AbortSignal):Promise<Metadata|null>{const owner=current(signal),raw=await Store.getItemAsync(META,publicOptions);current(signal,owner);if(raw===null)return null;if(raw.length>8000)throw Error('NATIVE_CUSTODY_INVALID');const m=JSON.parse(raw) as Metadata;if(m.version!==1||m.devicePublicKey!==owner||![16,32].includes(m.entropyBytes)||!['mainnet','testnet'].includes(m.network)||!Array.isArray(m.accounts)||m.accounts.length!==3)throw Error('NATIVE_CUSTODY_INVALID');return m;}
type Network='mainnet'|'testnet';
const networkKey=(m:Metadata)=>'lianum.native.wallet.network.v2.'+hex.encode(sha256(new TextEncoder().encode(JSON.stringify(m))));
function networkAccounts(value:unknown,network:Network):NativeAccountV1[]{
 if(!Array.isArray(value)||value.length!==3)throw Error('NATIVE_CUSTODY_INVALID');
 const accounts=value.map(validateNativeAccountV1);
 if(accounts.some(a=>a.network!==network)||new Set(accounts.map(a=>a.chain)).size!==3)throw Error('NATIVE_CUSTODY_BINDING');
 return accounts;
}
/** Additional public derivations share the existing protected root. The V4
 * recovery cut remains byte compatible; the same words regenerate both sets. */
export async function readNativeWalletCustodyV1(signal:AbortSignal,network?:Network){
 const m=await metadata(signal);if(!m)return{status:'ABSENT' as const,accounts:[]};
 networkAccounts(m.accounts,m.network);
 if(network===undefined||network===m.network)return{status:'READY' as const,accounts:m.accounts};
 const raw=await Store.getItemAsync(networkKey(m),publicOptions);current(signal,m.devicePublicKey);
 if(raw===null)return{status:'NETWORK_REQUIRED' as const,accounts:[]};
 if(raw.length>8000)throw Error('NATIVE_CUSTODY_INVALID');
 const extra=JSON.parse(raw);if(extra.version!==2||extra.devicePublicKey!==m.devicePublicKey||extra.network!==network||Object.keys(extra).sort().join(',')!=='accounts,devicePublicKey,network,version')throw Error('NATIVE_CUSTODY_BINDING');
 return{status:'READY' as const,accounts:networkAccounts(extra.accounts,network)};
}
export async function enableNativeWalletNetworkV2(network:Network,signal:AbortSignal){return exclusive(async()=>{
 if(network!=='mainnet'&&network!=='testnet')throw Error('NATIVE_NETWORK_UNSUPPORTED');
 const m=await metadata(signal);if(!m)return{status:'ABSENT' as const,accounts:[]};
 const existing=await readNativeWalletCustodyV1(signal,network);if(existing.status==='READY')return existing;
 await approve(network==='testnet'?"Activate your test accounts with the same wallet":"Activate your main network accounts",signal);
 return withEntropy(signal,async(entropy,original)=>{
  const key=networkKey(original),before=await Store.getItemAsync(key,publicOptions),accounts=deriveNativeAccountsV1(entropy,network),raw=JSON.stringify({version:2,devicePublicKey:original.devicePublicKey,network,accounts});
  current(signal,original.devicePublicKey);if(before!==null&&before!==raw)throw Error('NATIVE_CUSTODY_BINDING');
  await Store.setItemAsync(key,raw,publicOptions);current(signal,original.devicePublicKey);
  if(await Store.getItemAsync(key,publicOptions)!==raw)throw Error('NATIVE_CUSTODY_WRITE_FAILED');
  current(signal,original.devicePublicKey);return{status:'READY' as const,accounts};
 });
});}
async function withEntropy<T>(signal:AbortSignal,work:(entropy:Uint8Array,m:Metadata)=>T|Promise<T>):Promise<T>{const owner=current(signal),m=await metadata(signal);if(!m)throw Error('NATIVE_WALLET_REQUIRED');let raw:string|null=null,held:Uint8Array|undefined,entropy:Uint8Array|undefined;try{raw=await readWalletSessionSecret(SECRET,secretOptions);current(signal,owner);if(raw===null)throw Error('NATIVE_RECOVERY_REQUIRED');held=hex.decode(raw);entropy=held.slice(0,m.entropyBytes);if(m.entropyBytes===16&&held.slice(16).some(byte=>byte!==0))throw Error('NATIVE_CUSTODY_INVALID');if(JSON.stringify(deriveNativeAccountsV1(entropy,m.network))!==JSON.stringify(m.accounts))throw Error('NATIVE_CUSTODY_BINDING');const result=await work(entropy,m);current(signal,owner);return result;}finally{held?.fill(0);entropy?.fill(0);raw=null;}}
async function approve(promptMessage:string,signal:AbortSignal){const owner=current(signal);const approval=await Auth.authenticateAsync({promptMessage,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current(signal,owner);if(!approval.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');}
async function storeEntropy(entropy:Uint8Array,network:'mainnet'|'testnet',signal:AbortSignal){const owner=current(signal),old=await metadata(signal);if(old){if(old.network!==network||JSON.stringify(deriveNativeAccountsV1(entropy,network))!==JSON.stringify(old.accounts))throw Error('NATIVE_WALLET_ALREADY_EXISTS');const padded=new Uint8Array(32);padded.set(entropy);try{await writeWalletSessionSecret(SECRET,hex.encode(padded),secretOptions);current(signal,owner);return{status:'READY' as const,accounts:old.accounts};}finally{padded.fill(0);}}
 // Inspect the session-sealed original before creating anything. An interrupted
 // birth can be repaired only with the same seed, never by replacing its keys.
 let retained:string|null=null;const padded=new Uint8Array(32);padded.set(entropy);try{retained=await readWalletSessionSecret(SECRET,secretOptions);current(signal,owner);if(retained!==null&&retained!==hex.encode(padded))throw Error('NATIVE_RECOVERY_REQUIRED');const m:Metadata={version:1,devicePublicKey:owner,entropyBytes:entropy.length as 16|32,network,accounts:deriveNativeAccountsV1(entropy,network)};if(retained===null)await writeWalletSessionSecret(SECRET,hex.encode(padded),secretOptions);current(signal,owner);const raw=JSON.stringify(m);await Store.setItemAsync(META,raw,publicOptions);current(signal,owner);if(await Store.getItemAsync(META,publicOptions)!==raw)throw Error('NATIVE_CUSTODY_WRITE_FAILED');current(signal,owner);return{status:'READY' as const,accounts:m.accounts};}finally{padded.fill(0);retained=null;}}
export async function createNativeWalletCustodyV1(network:'mainnet'|'testnet',signal:AbortSignal){return exclusive(async()=>{if(await metadata(signal))throw Error('NATIVE_WALLET_ALREADY_EXISTS');await approve("Create your wallet and its addresses",signal);const entropy=await Crypto.getRandomBytesAsync(32);try{return await storeEntropy(entropy,network,signal);}finally{entropy.fill(0);}});}
export async function restoreNativeWalletCustodyV1(phrase:string,network:'mainnet'|'testnet',signal:AbortSignal){return exclusive(async()=>{const entropy=nativeEntropyV1(phrase);phrase='';try{await approve("Recover your wallet with these words",signal);return await storeEntropy(entropy,network,signal);}finally{entropy.fill(0);}});}
export async function revealNativeWalletMnemonicV1(signal:AbortSignal){return exclusive(async()=>{await approve("Show the words that allow you to recover your funds",signal);return withEntropy(signal,entropy=>nativeMnemonicV1(entropy));});}
/** The review is snapshotted before biometric authentication; changes cannot
 * substitute a recipient or spend after the original foreground session closes. */
export async function authorizeNativeWalletSendV1(input:{account:NativeAccountV1;transaction:unknown;recipient:string;amountAtomic:string;maximumFeeAtomic:string;expiresAt:number},signal:AbortSignal){return exclusive(async()=>{const owner=current(signal),snapshot=JSON.parse(JSON.stringify(input));const check=()=>{current(signal,owner);if(Date.now()>=snapshot.expiresAt)throw Error('NATIVE_QUOTE_EXPIRED');validateNativeSendReviewV1(snapshot.account,snapshot.transaction,snapshot.recipient,snapshot.amountAtomic,snapshot.maximumFeeAtomic);};check();await approve("Authorize the transfer and the commission you have reviewed",signal);check();return withEntropy(signal,async(entropy)=>{const enabled=await readNativeWalletCustodyV1(signal,snapshot.account.network),derived=deriveNativeAccountsV1(entropy,snapshot.account.network);if(enabled.status!=='READY'||JSON.stringify(derived)!==JSON.stringify(enabled.accounts)||!derived.some(account=>JSON.stringify(account)===JSON.stringify(snapshot.account)))throw Error('NATIVE_ACCOUNT_BINDING');check();return signNativeWalletTransactionV1(entropy,snapshot.account,snapshot.transaction);});});}


const nativeRecoveryBinding=(rootId:string)=>({profile:'DEVICE_NATIVE_ROOT_NOTE_CUSTODY_V1' as const,rootId});
function nativeRecoveryRootId(entropy:Uint8Array,network:string,owner:string){const bytes=new TextEncoder().encode('LIANUM/NATIVE/WALLET/RECOVERY/4\n'+owner+'\n'+network+'\n'+hex.encode(entropy));try{return hex.encode(sha256(bytes));}finally{bytes.fill(0);}}
/** Existing seed only. Missing/corrupt metadata or an orphan protected root is
 * rejected, never silently excluded or replaced with newly generated words. */
export async function exportNativeWalletRecoveryCutV4(scope:object,expectedPublicKey:string,passphrase:string,signal:AbortSignal){return exclusive(async()=>{
 RecoverySession.assertWalletSessionRecoveryBatchV4(scope,'EXPORT',expectedPublicKey,signal);const before=await Store.getItemAsync(META,publicOptions),rootBefore=await readWalletSessionSecret(SECRET,secretOptions);current(signal,expectedPublicKey);if(before===null&&rootBefore===null)return null;if(before===null||rootBefore===null)throw Error('NATIVE_RECOVERY_REQUIRED');
 return withEntropy(signal,async(entropy,m)=>{const rootId=nativeRecoveryRootId(entropy,m.network,expectedPublicKey),clear=new TextEncoder().encode(JSON.stringify({format:'LIANUM_NATIVE_WALLET_PRIVATE_SNAPSHOT_V4',devicePublicKey:expectedPublicKey,rootId,entropyBytes:m.entropyBytes,entropyHex:hex.encode(entropy),network:m.network,accounts:m.accounts}));try{const backup=await sealDeviceCustodyBackupV1(clear,passphrase,nativeRecoveryBinding(rootId),signal);RecoverySession.assertWalletSessionRecoveryBatchV4(scope,'EXPORT',expectedPublicKey,signal);if(await Store.getItemAsync(META,publicOptions)!==before||await readWalletSessionSecret(SECRET,secretOptions)!==rootBefore)throw Error('NATIVE_CUSTODY_WRITE_FAILED');return{kind:'NATIVE_WALLET' as const,rootId,backup};}finally{clear.fill(0);passphrase='';}});
 });}
/** Same password-opened bundle + original foreground scope. The preflight
 * checks owner, seed identity and all three derivations before any root write. */
export async function restoreNativeWalletRecoveryCutV4(rawInventory:unknown,serialized:string,passphrase:string,scope:object,signal:AbortSignal,preflightOnly=false){const inventory=readWalletRecoveryPartsInventoryV4(rawInventory,serialized,signal),cut=inventory.custodies.find(c=>c.kind==='NATIVE_WALLET');if(!cut)return null;return exclusive(async()=>{
 RecoverySession.assertWalletSessionRecoveryBatchV4(scope,'RESTORE',inventory.devicePublicKey,signal);let clear:Uint8Array|undefined,entropy:Uint8Array|undefined;try{clear=await unsealDeviceCustodyBackupV1(cut.backup,passphrase,nativeRecoveryBinding(cut.rootId),signal);const s=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear));if(Object.keys(s).sort().join(',')!==['format','devicePublicKey','rootId','entropyBytes','entropyHex','network','accounts'].sort().join(',')||s.format!=='LIANUM_NATIVE_WALLET_PRIVATE_SNAPSHOT_V4'||s.devicePublicKey!==inventory.devicePublicKey||s.rootId!==cut.rootId||![16,32].includes(s.entropyBytes)||!['mainnet','testnet'].includes(s.network)||typeof s.entropyHex!=='string'||s.entropyHex.length!==s.entropyBytes*2)throw Error('NATIVE_CUSTODY_INVALID');entropy=hex.decode(s.entropyHex);if(nativeRecoveryRootId(entropy,s.network,s.devicePublicKey)!==s.rootId||JSON.stringify(deriveNativeAccountsV1(entropy,s.network))!==JSON.stringify(s.accounts))throw Error('NATIVE_CUSTODY_BINDING');
 const before=await Store.getItemAsync(META,publicOptions),old=await metadata(signal),rootBefore=await readWalletSessionSecret(SECRET,secretOptions),padded=new Uint8Array(32);try{padded.set(entropy);if(rootBefore!==null&&rootBefore!==hex.encode(padded))throw Error('NATIVE_WALLET_ALREADY_EXISTS');if(old&&(old.devicePublicKey!==s.devicePublicKey||old.entropyBytes!==s.entropyBytes||old.network!==s.network||JSON.stringify(old.accounts)!==JSON.stringify(s.accounts)))throw Error('NATIVE_WALLET_ALREADY_EXISTS');RecoverySession.assertWalletSessionRecoveryBatchV4(scope,'RESTORE',s.devicePublicKey,signal);if(await Store.getItemAsync(META,publicOptions)!==before||await readWalletSessionSecret(SECRET,secretOptions)!==rootBefore)throw Error('NATIVE_CUSTODY_WRITE_FAILED');if(preflightOnly)return{status:'VERIFIED' as const,rootId:s.rootId,accounts:s.accounts};const result=await storeEntropy(entropy,s.network,signal);RecoverySession.assertWalletSessionRecoveryBatchV4(scope,'RESTORE',s.devicePublicKey,signal);return{...result,rootId:s.rootId};}finally{padded.fill(0);}
 }finally{clear?.fill(0);entropy?.fill(0);passphrase='';}
 });}
