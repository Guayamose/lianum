import {walletSessionStatusV1,approveWalletSessionJointRecoveryV1,closeWalletSessionJointRecoveryV1,openWalletSessionV1} from './wallet-session-v1';
import {AppState} from 'react-native';
import {exportDeviceIdentityBackupV1,importDeviceIdentityBackupV1,readDevicePublicKey} from './key-store';
import {openExistingDevicePagedCustodyV3,restoreDevicePagedNoteBackupV3} from './device-paged-note-vault-v3';
import {openExistingDeviceExternalFlatCustodyV1,restoreDeviceExternalFlatNoteBackupV1} from './device-external-flat-note-vault-v1';
import {createWalletRecoveryPackageV1,openWalletRecoveryPackageV1,type WalletRecoveryCustodyV1} from './wallet-recovery-package-v1.mjs';
import type {PublicConnectionRegistryV1} from '../state/public-connection-registry-v1.mjs';
import {createNativePublicConnectionRegistryV1} from '../state/public-connection-store-v1';
export type WalletRecoveryProgressV1=Readonly<{stage:'IDENTITY'|'CUSTODIES'|'CONNECTIONS'|'COMPLETE';completed:number;total:number}>;
type Progress=(value:WalletRecoveryProgressV1)=>void;
function live(signal:AbortSignal){if(!(signal instanceof AbortSignal)||signal.aborted||AppState.currentState!=='active')throw Error('MOBILE_CUSTODY_BACKUP_CANCELLED');}
function same(left:unknown,right:unknown){return JSON.stringify(left)===JSON.stringify(right);}
/** Caller first drains every mobile SDK. Existing-only factories guarantee that
 * a public connection without local custody creates no ROOT or empty note. */
export async function exportJointWalletRecoveryV1(registry:PublicConnectionRegistryV1,passphrase:string,signal:AbortSignal,onProgress?:Progress){
 live(signal);if(await readDevicePublicKey()!==registry.devicePublicKey)throw Error('MOBILE_CUSTODY_BACKUP_BINDING');const connections=await registry.list();live(signal);
 const routes=connections.flatMap<{kind:WalletRecoveryCustodyV1['kind'];descriptor:any}>(entry=>entry.kind==='POSITIONS'?[]:entry.kind==='PAGED'?['GRAPH','NOTE'].map(mode=>({kind:mode==='GRAPH'?'PAGED_GRAPH' as const:'PAGED_NOTE' as const,descriptor:entry.descriptors[0]})):entry.descriptors.map(descriptor=>({kind:'EXTERNAL_FLAT' as const,descriptor}))),cuts:WalletRecoveryCustodyV1[]=[];
 const unique=routes.filter((route,index)=>routes.findIndex(other=>other.kind===route.kind&&same(other.descriptor,route.descriptor))===index);
 onProgress?.({stage:'IDENTITY',completed:0,total:unique.length});const identityBackup=await exportDeviceIdentityBackupV1(passphrase,registry.devicePublicKey,signal);live(signal);
 try{for(const [index,route]of unique.entries()){let vault:any=null;try{live(signal);vault=route.kind==='EXTERNAL_FLAT'?await openExistingDeviceExternalFlatCustodyV1(route.descriptor):await openExistingDevicePagedCustodyV3(route.descriptor,route.kind==='PAGED_GRAPH'?'GRAPH':'NOTE',signal);live(signal);const backup=await vault.exportBackup(passphrase,registry.devicePublicKey,signal);live(signal);cuts.push({kind:route.kind,descriptor:route.descriptor,backup});}catch(error){if(!(error instanceof Error)||error.message!=='MOBILE_WALLET_CUSTODY_ABSENT')throw error;}finally{await vault?.close();}onProgress?.({stage:'CUSTODIES',completed:index+1,total:unique.length});}
  const after=await registry.list();live(signal);if(!same(after.map(entry=>entry.id),connections.map(entry=>entry.id)))throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');
  const serialized=await createWalletRecoveryPackageV1({devicePublicKey:registry.devicePublicKey,identityBackup,connections:connections.map(entry=>entry.profile),custodies:cuts},passphrase,signal);live(signal);onProgress?.({stage:'COMPLETE',completed:cuts.length,total:cuts.length});return{serialized,custodies:cuts.length,connections:connections.length,backendPositions:connections.filter(entry=>entry.kind==='POSITIONS').length};
 }finally{passphrase='';}
}
/** Each original restorer authenticates/decrypts its own cut and rejects a
 * conflicting root/revision. A mobile copy never restores service positions. */
export async function restoreJointWalletRecoveryV1(serialized:string,passphrase:string,expectedPublicKey:string,signal:AbortSignal,onProgress?:Progress){
 live(signal);const inventory=await openWalletRecoveryPackageV1(serialized,passphrase,expectedPublicKey,signal);live(signal);
 let recovery:object|undefined;try{const session=walletSessionStatusV1();if(session.managed&&!session.active)recovery=await approveWalletSessionJointRecoveryV1(inventory,serialized,signal);live(signal);onProgress?.({stage:'IDENTITY',completed:0,total:inventory.custodies.length});await importDeviceIdentityBackupV1(inventory.identityBackup,passphrase,expectedPublicKey,signal,recovery);live(signal);if(recovery){closeWalletSessionJointRecoveryV1(recovery);recovery=undefined;await openWalletSessionV1(signal);live(signal);}
 for(const [index,cut]of inventory.custodies.entries()){let vault:any=null;try{vault=cut.kind==='EXTERNAL_FLAT'?await restoreDeviceExternalFlatNoteBackupV1(cut.backup,passphrase,expectedPublicKey,cut.descriptor,signal):await restoreDevicePagedNoteBackupV3(cut.backup,passphrase,expectedPublicKey,cut.descriptor,signal);live(signal);const summary=await vault.summary();if(!same(summary.descriptor,cut.descriptor))throw Error('MOBILE_CUSTODY_BACKUP_BINDING');live(signal);}finally{await vault?.close();}onProgress?.({stage:'CUSTODIES',completed:index+1,total:inventory.custodies.length});}
  const registry=createNativePublicConnectionRegistryV1(expectedPublicKey);for(const [index,profile]of inventory.connections.entries()){live(signal);await registry.remember(profile,{select:false});onProgress?.({stage:'CONNECTIONS',completed:index+1,total:inventory.connections.length});}
  live(signal);onProgress?.({stage:'COMPLETE',completed:inventory.custodies.length,total:inventory.custodies.length});return{devicePublicKey:expectedPublicKey,custodies:inventory.custodies.length,connections:inventory.connections.length,backendPositions:inventory.backendRequired.length,requiresOriginalReads:true as const};
 }finally{if(recovery)closeWalletSessionJointRecoveryV1(recovery);passphrase='';serialized='';}
}
