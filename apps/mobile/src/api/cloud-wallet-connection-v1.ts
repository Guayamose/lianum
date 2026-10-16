import {requestPublicWalletSessionV1,publicWalletSessionOriginV1} from './public-wallet-session-api-v1.ts';
import {walletSessionStatusV1} from '../custody/wallet-session-v1.ts';
import {normalizePublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';

/** Discovery returns routing data only. Existing custody and its signed
 * observations remain responsible for balances and financial actions. */
async function readCloudConnections(signal:AbortSignal){
 const owner=walletSessionStatusV1().publicKey;
 const result=await requestPublicWalletSessionV1('/v1/wallet/connections',{},signal);
 if(signal.aborted||!walletSessionStatusV1().active||walletSessionStatusV1().publicKey!==owner)throw Error('NATIVE_WALLET_LOCKED');
 if(!result||Object.keys(result).sort().join(',')!=='connections,devicePublicKey,profile'||result.profile!=='LIANUM_CLOUD_CONNECTIONS_V1'||result.devicePublicKey!==owner||!Array.isArray(result.connections)||result.connections.length>4)throw Error('MOBILE_CLOUD_CONNECTION_INVALID');
 if(result.connections.length===0)throw Error('MOBILE_CLOUD_CONNECTION_NOT_ASSIGNED');
 const entries=(result.connections as unknown[]).map(raw=>normalizePublicWalletConnectionV1(JSON.stringify(raw),owner!));
 if(entries.some(entry=>entry.origin!==publicWalletSessionOriginV1())||new Set(entries.map(entry=>entry.profile)).size!==entries.length||new Set(entries.map(entry=>entry.transport.certificateSHA256)).size!==1||new Set(entries.map(entry=>entry.transport.certificatePEM)).size!==1)throw Error('MOBILE_CLOUD_CONNECTION_INVALID');
 const paged=entries.filter(entry=>entry.kind==='PAGED'),defi=entries.filter(entry=>JSON.parse(entry.profile).format==='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7');
 const flat=entries.filter(entry=>entry.kind==='EXTERNAL_FLAT'&&JSON.parse(entry.profile).format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1');
 if(paged.length>1||flat.length>1||paged.length+defi.length+flat.length!==entries.length||new Set(defi.map(entry=>entry.protocol)).size!==defi.length)throw Error('MOBILE_CLOUD_CONNECTION_INVALID');
 const sources=defi.map(entry=>JSON.parse(entry.profile).paegSource).filter(Boolean);
 if(new Set(sources.map(source=>JSON.stringify(source))).size>1||sources.some(source=>paged.some(primary=>source.descriptor.pairingId===primary.descriptors[0].pairingId||source.descriptor.pool===primary.descriptors[0].pool||source.descriptor.assetIdentity!==primary.descriptors[0].assetIdentity)))throw Error('MOBILE_CLOUD_CONNECTION_INVALID');
 return entries;
}
export async function readCloudPagedConnectionV1(signal:AbortSignal):Promise<string>{
 const entries=await readCloudConnections(signal),entry=entries.find(entry=>entry.kind==='PAGED');
 if(!entry)throw Error('MOBILE_CLOUD_CONNECTION_NOT_ASSIGNED');return entry.profile;
}
export async function readCloudDefiConnectionsV7(signal:AbortSignal):Promise<readonly string[]>{
 const entries=await readCloudConnections(signal);
 return Object.freeze(entries.filter(entry=>JSON.parse(entry.profile).format==='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7').map(entry=>entry.profile));
}
