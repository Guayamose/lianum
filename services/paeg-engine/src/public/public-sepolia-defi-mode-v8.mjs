/** Fixed deployment selection DATA. A marker cannot open a target or grant
 * a financial permission; Original Sup8 must authenticate its own capture. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lstat} from 'node:fs/promises';
import {assertPublicEmptySourceLocationDataV9} from './public-empty-source-location-v9.mjs';
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {PUBLIC_OPERATOR_STATE_V4,readPrivateOperatorFileV4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';

export const PUBLIC_SEPOLIA_DEFI_MODE_FILE_V8='defi-active-v8.json';
export const PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8=join(PUBLIC_OPERATOR_STATE_V4,'defi-v8');
export const PUBLIC_SEPOLIA_DEFI_RETENTION_DIRECTORY_V8=join(PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8,'retention');
export const PUBLIC_SEPOLIA_DEFI_SUPERVISOR_FILE_V8=join(PUBLIC_SEPOLIA_DEFI_RETENTION_DIRECTORY_V8,'defi-supervisor.vault');
export const PUBLIC_SEPOLIA_DEFI_CONNECTION_NAMES_V8=Object.freeze({AAVE_STATIC:'paired-aave-connection.json',MORPHO_V2:'paired-morpho-connection.json'});
const protocols=Object.freeze(['AAVE_STATIC','MORPHO_V2']);
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const hash=value=>{assert.match(value,/^[0-9a-f]{64}$/);assert.notEqual(value,'0'.repeat(64));return value;};
function exact(value,names){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),[...names].sort(),'PAEG_DEFI_MODE_FIELDS');for(const name of names)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,name),'value'));return value;}
export function publicSepoliaDefiConfigurationV8(configuration,devicePublicKey,mode){
 assert.match(devicePublicKey,/^04[0-9a-f]{128}$/);assert.notEqual(devicePublicKey,configuration.devicePublicKey,'PAEG_DEFI_SAME_PHONE_REQUIRED');assert.ok(['CREATE','CAPTURED','OPENING','ACTIVE_DEAD'].includes(mode));
 assert.ok(typeof configuration.journal?.password==='string'&&configuration.journal.password.length>=32);
 return{directory:PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8,password:sha('LIANUM/PUBLIC/SEPOLIA/DEFI/8\0'+configuration.journal.password),devicePublicKey,mode};
}
export function normalizePublicSepoliaDefiModeV8(raw,configuration,devicePublicKey){
 assert.match(devicePublicKey,/^04[0-9a-f]{128}$/);
 const mode=exact(raw,['profile','directory','supervisorDirectory','devicePublicKey','retentionIdentity','targetPlanSHA256','sourcePlanSHA256','connectionsSHA256']);
 assert.equal(mode.profile,'ORIGINAL_PUBLIC_SEPOLIA_DEFI_ACTIVE_CONFIGURATION_V8');assert.equal(mode.directory,PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8);assert.equal(mode.supervisorDirectory,PUBLIC_SEPOLIA_DEFI_RETENTION_DIRECTORY_V8);assert.equal(mode.devicePublicKey,devicePublicKey);assert.notEqual(devicePublicKey,configuration.devicePublicKey);hash(mode.retentionIdentity);hash(mode.sourcePlanSHA256);
 exact(mode.targetPlanSHA256,protocols);exact(mode.connectionsSHA256,protocols);for(const protocol of protocols){hash(mode.targetPlanSHA256[protocol]);hash(mode.connectionsSHA256[protocol]);}
 return structuredClone(mode);
}
export async function readPublicSepoliaDefiCheckpointV8(root,configuration,devicePublicKey){
 const input=publicSepoliaDefiConfigurationV8(configuration,devicePublicKey,'CAPTURED');
 try{const owner=await import(pathToFileURL(join(root,'packages/backend/src/operations/recovery/sepolia-defi-retention-v8.mjs')).href);return await owner.readOriginalSepoliaDefiRetentionModeV8({directory:PUBLIC_SEPOLIA_DEFI_RETENTION_DIRECTORY_V8,password:input.password});}finally{input.password=null;}
}
export function assertPublicSepoliaDefiCapturedV8(state,devicePublicKey,mode=null){
 assert.equal(state.phase,'CAPTURED','PAEG_DEFI_CAPTURE_REQUIRED');return assertPublicSepoliaDefiState(state,devicePublicKey,mode);
}
function assertPublicSepoliaDefiState(state,devicePublicKey,mode=null){
 hash(state.identity);
 assert.ok(state.mixedSource?.ready&&state.mixedAuthority&&state.mixedProvider,'PAEG_DEFI_SOURCE7_CAPTURE_REQUIRED');hash(state.mixedSource.planSHA256);assertPublicEmptySourceLocationDataV9(state.mixedAuthority,join(PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8,'source7','authority','journal.vault'),devicePublicKey);assert.equal(state.mixedAuthority.descriptor.devicePublicKey,devicePublicKey,'PAEG_DEFI_SOURCE7_SAME_PHONE_REQUIRED');exact(state.targets,protocols);assert.equal(state.authorities.length,2,'PAEG_DEFI_BOTH_ORIGINAL_AUTHORITIES_REQUIRED');
 for(const protocol of protocols){assert.equal(state.targets[protocol].ready,true,'PAEG_DEFI_TARGET_INITIALIZATION_INCOMPLETE');hash(state.targets[protocol].planSHA256);const row=state.authorities.filter(row=>row.protocol===protocol);assert.equal(row.length,1);assert.equal(row[0].descriptor.devicePublicKey,devicePublicKey,'PAEG_DEFI_SAME_PHONE_REQUIRED');}
 if(mode){assert.equal(state.identity,mode.retentionIdentity,'PAEG_DEFI_ORIGINAL_RETENTION_IDENTITY');assert.equal(state.mixedSource.planSHA256,mode.sourcePlanSHA256,'PAEG_DEFI_SOURCE7_ORIGINAL_PLAN');for(const protocol of protocols)assert.equal(state.targets[protocol].planSHA256,mode.targetPlanSHA256[protocol],'PAEG_DEFI_ORIGINAL_TARGET_PLAN');}
 return state;
}
export function assertPublicSepoliaDefiConnectionsV8(raw,state,devicePublicKey,mode=null){
 assert.ok(Array.isArray(raw)&&raw.length===2);const connections=raw.map(normalizeDeviceSepoliaDefiConnectionV7);
 assert.equal(new Set(connections.map(c=>c.protocol)).size,2);assert.equal(new Set(connections.map(c=>c.descriptor.origin)).size,1);assert.equal(new Set(connections.map(c=>c.transport.certificateSHA256)).size,1);assert.equal(new Set(connections.map(c=>c.transport.certificatePEM)).size,1);
 assert.equal(new Set(connections.map(c=>JSON.stringify(c.paegSource))).size,1,'PAEG_DEFI_SOURCE7_COMMON_PROFILE');for(const connection of connections){assert.ok(connection.paegSource,'PAEG_DEFI_SOURCE7_PROFILE_REQUIRED');assert.deepEqual(connection.paegSource.descriptor,state.mixedAuthority.descriptor,'PAEG_DEFI_SOURCE7_ORIGINAL_DESCRIPTOR');}
 for(const protocol of protocols){const connection=connections.find(row=>row.protocol===protocol);assert.equal(connection.descriptor.devicePublicKey,devicePublicKey);assert.deepEqual(connection.descriptor,state.authorities.find(row=>row.protocol===protocol)?.descriptor,'PAEG_DEFI_RETAINED_PUBLIC_DESCRIPTOR');if(mode)assert.equal(sha(connection),mode.connectionsSHA256[protocol],'PAEG_DEFI_ORIGINAL_PUBLIC_PROFILE');}
 return connections;
}
function assertReopenedPreparation(previous,current){
 const expected=structuredClone(previous);
 // Older published V8 packets predate this capability advertisement. The
 // live Original producer already supports it; only the exact boolean may be
 // added. Every network, target, budget and funding field stays identical.
 if(!Object.hasOwn(expected,'executorPayoutsV5')&&current.executorPayoutsV5===true)expected.executorPayoutsV5=true;
 assert.deepEqual(current,expected,'PAEG_DEFI_REOPEN_PREPARATION_CHANGED');
}
/** Authenticate the exact stored packets, then compare the live producer's
 * values. JSON property order is not identity across producer versions. This
 * does not publish a marker: the live Original renewal must still complete. */
export function assertReopenedPublicSepoliaDefiConnectionsV11(raw,previous){
 const devicePublicKey=previous.input.devicePublicKey;
 const retained=assertPublicSepoliaDefiConnectionsV8(previous.connections,previous.state,devicePublicKey,previous.mode);
 const current=assertPublicSepoliaDefiConnectionsV8(raw,previous.state,devicePublicKey);
 for(const connection of current){
  const old=retained.find(row=>row.protocol===connection.protocol),{preparation:oldPreparation,...oldSource}=old.paegSource,{preparation:newPreparation,...newSource}=connection.paegSource;
  const {paegSource:ignoredOld,...oldFixed}=old,{paegSource:ignoredNew,...newFixed}=connection;
  assert.deepEqual(newFixed,oldFixed,'PAEG_DEFI_REOPEN_FIXED_PROFILE_CHANGED');
  assert.deepEqual(newSource,oldSource,'PAEG_DEFI_REOPEN_SOURCE_CHANGED');
  assertReopenedPreparation(oldPreparation,newPreparation);
 }
 return current;
}
export async function readPublicSepoliaDefiModeV8(root,configuration,uniswapMode){
 let bytes;
 try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PUBLIC_SEPOLIA_DEFI_MODE_FILE_V8);}catch(error){
  if(error.code!=='ENOENT')throw error;
  try{await lstat(PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8);}catch(missing){if(missing.code==='ENOENT')return null;throw missing;}
  throw Error('PAEG_DEFI_ACTIVATION_PUBLICATION_PENDING');
 }
 try{
  assert.ok(uniswapMode,'PAEG_DEFI_ORIGINAL_UNISWAP_REQUIRED');const devicePublicKey=uniswapMode.input.mixed.devicePublicKey,mode=normalizePublicSepoliaDefiModeV8(JSON.parse(bytes.toString('utf8')),configuration,devicePublicKey),state=assertPublicSepoliaDefiCapturedV8(await readPublicSepoliaDefiCheckpointV8(root,configuration,devicePublicKey),devicePublicKey,mode);
  const connections=[];for(const protocol of protocols){const publicBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PUBLIC_SEPOLIA_DEFI_CONNECTION_NAMES_V8[protocol]);try{const packet=normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(publicBytes.toString('utf8')));connections.push(packet);assert.equal(packet.protocol,protocol);assert.equal(sha(packet),mode.connectionsSHA256[protocol],'PAEG_DEFI_ORIGINAL_PUBLIC_PROFILE');assert.deepEqual(packet.descriptor,state.authorities.find(row=>row.protocol===protocol).descriptor,'PAEG_DEFI_RETAINED_PUBLIC_DESCRIPTOR');}finally{publicBytes.fill(0);}}
  assertPublicSepoliaDefiConnectionsV8(connections,state,devicePublicKey,mode);return{mode,state,connections,input:publicSepoliaDefiConfigurationV8(configuration,devicePublicKey,'CAPTURED')};
 }finally{bytes.fill(0);}
}
export async function publishCapturedPublicSepoliaDefiV8(root,configuration,devicePublicKey,rawConnections){
 // The caller has already closed the genuine product. Read the authenticated
 // retained owner again; metadata or successful deployment receipts alone
 // cannot publish an activation marker.
 const state=assertPublicSepoliaDefiCapturedV8(await readPublicSepoliaDefiCheckpointV8(root,configuration,devicePublicKey),devicePublicKey);
 return (await publishPublicSepoliaDefiState(configuration,devicePublicKey,state,rawConnections)).publication;
}
async function publishPublicSepoliaDefiState(configuration,devicePublicKey,state,rawConnections){
 const connections=assertPublicSepoliaDefiConnectionsV8(rawConnections,state,devicePublicKey),targetPlanSHA256={},connectionsSHA256={};
 assert.equal(new Set(connections.map(c=>c.protocol)).size,2);assert.equal(new Set(connections.map(c=>c.transport.certificateSHA256)).size,1);assert.equal(new Set(connections.map(c=>c.transport.certificatePEM)).size,1);
 for(const protocol of protocols){const connection=connections.find(row=>row.protocol===protocol);assert.equal(connection.descriptor.devicePublicKey,devicePublicKey);assert.deepEqual(connection.descriptor,state.authorities.find(row=>row.protocol===protocol).descriptor,'PAEG_DEFI_RETAINED_PUBLIC_DESCRIPTOR');targetPlanSHA256[protocol]=state.targets[protocol].planSHA256;connectionsSHA256[protocol]=sha(connection);const bytes=Buffer.from(JSON.stringify(connection)+'\n');try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,PUBLIC_SEPOLIA_DEFI_CONNECTION_NAMES_V8[protocol]);}finally{bytes.fill(0);}}
 const mode=normalizePublicSepoliaDefiModeV8({profile:'ORIGINAL_PUBLIC_SEPOLIA_DEFI_ACTIVE_CONFIGURATION_V8',directory:PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8,supervisorDirectory:PUBLIC_SEPOLIA_DEFI_RETENTION_DIRECTORY_V8,devicePublicKey,retentionIdentity:state.identity,targetPlanSHA256,sourcePlanSHA256:state.mixedSource.planSHA256,connectionsSHA256},configuration,devicePublicKey),bytes=Buffer.from(JSON.stringify(mode)+'\n');
 try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,PUBLIC_SEPOLIA_DEFI_MODE_FILE_V8);}finally{bytes.fill(0);}
 return {mode,state,publication:Object.freeze({profile:mode.profile,retentionIdentity:state.identity,targetPlanSHA256:Object.freeze({...targetPlanSHA256}),sourcePlanSHA256:mode.sourcePlanSHA256,connectionsSHA256:Object.freeze({...connectionsSHA256}),financialPermissionIssued:false})};
}

/** Publish only the Source7 profile changed by the SAME live Original renewal.
 * The previous marker is checked first; accounts, plans, TLS and all non-Source
 * fields stay identical. This producer never represents ACTIVE as CAPTURED. */
export async function publishLivePublicSepoliaDefiRenewalV10(root,configuration,product,previous,receipt){
 assert.equal(arguments.length,5);assert.equal(receipt.profile,'ORIGINAL_PUBLIC_EMPTY_SOURCE_LIVE_RENEWAL_RECEIPT_V10');assert.equal(receipt.retainedInLiveProduct,true);assert.equal(receipt.financialTransactions,0);
 const devicePublicKey=previous.input.devicePublicKey,B=await import(pathToFileURL(join(root,'packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs')).href);
 const connections=await B.readOriginalPagedPublicSepoliaDefiConnectionsV8(product),financial=await B.readOriginalPagedPublicNativeFinancialStateV5(product),state=await readPublicSepoliaDefiCheckpointV8(root,configuration,devicePublicKey);
 assert.equal(state.phase,'ACTIVE','PAEG_DEFI_LIVE_ACTIVATION_REQUIRED');assertPublicSepoliaDefiState(state,devicePublicKey,previous.mode);
 assert.equal(financial.epoch?.nonce,receipt.intentId);assert.equal(financial.effectivePolicy.expiresAt,receipt.expiresAt);
 const lineage=state.mixedAuthority.emptyReplacementV9;assert.ok(lineage,'PAEG_DEFI_LIVE_EMPTY_LINEAGE_REQUIRED');assert.equal(lineage.financial.epochId,financial.epoch.epochId);assert.equal(lineage.financial.expiresAt,receipt.expiresAt);
 for(const connection of connections){let bytes;try{bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PUBLIC_SEPOLIA_DEFI_CONNECTION_NAMES_V8[connection.protocol]);const old=normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(bytes.toString('utf8')));assert.equal(sha(old),previous.mode.connectionsSHA256[connection.protocol],'PAEG_DEFI_ORIGINAL_PUBLIC_PROFILE');const {paegSource:oldSource,...oldFixed}=old,{paegSource:newSource,...newFixed}=connection;assert.deepEqual(newFixed,oldFixed,'PAEG_DEFI_LIVE_ONLY_SOURCE_PROFILE');assertReopenedPreparation(oldSource.preparation,newSource.preparation);}finally{bytes?.fill(0);}}
 return publishPublicSepoliaDefiState(configuration,devicePublicKey,state,connections);
}
