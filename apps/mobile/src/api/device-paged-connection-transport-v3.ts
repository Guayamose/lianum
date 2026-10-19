import {Platform} from 'react-native';
import {createDevicePagedPinnedTransportCoreV3 as createPinnedTransport,createDevicePagedSourceRenewalPinnedTransportCoreV4,readOriginalDevicePagedSourceRenewalTransportCoreV4,type Transport} from './device-paged-pinned-transport-core-v3.ts';
import bridge from '../native-specs/NativeLianumPagedPinnedTls.ts';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDeviceDefiPositionDescriptorV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {normalizePublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';

export type DevicePagedConnectionProfileV3={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3';descriptor:any;transport:{type:'ANDROID_PINNED_TLS_V1';certificatePEM:string;certificateSHA256:string}};
function fail(code:string):never{throw Error(code);}
export function parseDevicePagedConnectionProfileV3(text:string):DevicePagedConnectionProfileV3{
 if(text.length>65536)fail('MOBILE_PAGED_TLS_PROFILE');
 const packet=P.pagedOwnerExactV3(JSON.parse(text),['format','descriptor','transport']);
 const transport=P.pagedOwnerExactV3(packet.transport,['type','certificatePEM','certificateSHA256']);
 if(packet.format!=='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3'||transport.type!=='ANDROID_PINNED_TLS_V1'||typeof transport.certificatePEM!=='string'||transport.certificatePEM.length>32768||!transport.certificatePEM.includes('-----BEGIN CERTIFICATE-----')||typeof transport.certificateSHA256!=='string'||!/^[a-f0-9]{64}$/.test(transport.certificateSHA256))fail('MOBILE_PAGED_TLS_PROFILE');
 return {format:packet.format,descriptor:P.normalizeDevicePagedDescriptorV3(packet.descriptor),transport:Object.freeze({...transport})};
}
export async function readDevicePagedConnectionClipboardV3():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 const text=await bridge.readConnectionProfile('PAGED');if(typeof text!=='string')fail('MOBILE_PAGED_TLS_PROFILE');
 parseDevicePagedConnectionProfileV3(text);return text;
}
export async function readDeviceExternalFlatConnectionClipboardV1():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 return bridge.readConnectionProfile('EXTERNAL_FLAT');
}
export type DeviceDefiPositionsConnectionProfileV1={format:'DEVICE_DEFI_POSITIONS_CONNECTION_V1';descriptor:ReturnType<typeof normalizeDeviceDefiPositionDescriptorV1>;transport:{type:'ANDROID_PINNED_TLS_V1';certificatePEM:string;certificateSHA256:string}};
export function parseDeviceDefiPositionsConnectionProfileV1(text:string):DeviceDefiPositionsConnectionProfileV1{
 const value=normalizePublicWalletConnectionV1(text);if(value.kind!=='POSITIONS')fail('MOBILE_PAGED_TLS_PROFILE');
 return JSON.parse(value.profile) as DeviceDefiPositionsConnectionProfileV1;
}
export async function readDeviceDefiPositionsConnectionClipboardV1():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 const text=await bridge.readConnectionProfile('POSITIONS');parseDeviceDefiPositionsConnectionProfileV1(text);return text;
}
/** Only this constructor-scoped original descriptor can supply either SDK. */
export async function createDevicePagedConnectionTransportV3(profile:DevicePagedConnectionProfileV3,signal?:AbortSignal):Promise<Transport>{
 const packet=parseDevicePagedConnectionProfileV3(JSON.stringify(profile)),descriptor=packet.descriptor;
 // Transport lifetime is independent of the signed financial permission.
 // Android bounds each TLS session to nine hours, even for longer permissions.
 const transportDeadline=Math.min(descriptor.deadlineMs,Date.now()+9*60*60*1000);
 return createPinnedTransport('PAGED',descriptor.origin,transportDeadline,packet.transport,signal,descriptor.pairingId);
}
export async function createDeviceExternalFlatPinnedTransportV1(input:{descriptor:unknown;certificatePEM:string;certificateSHA256:string;signal?:AbortSignal}):Promise<Transport>{
 const descriptor=normalizeExternalFlatDescriptorV1(input.descriptor);
 return createPinnedTransport('EXTERNAL_FLAT',descriptor.origin,Date.now()+9*60*60*1000,input,input.signal);
}
export function parseDeviceSepoliaDefiConnectionV7(text:string):DeviceSepoliaDefiConnectionV7{
 if(typeof text!=='string'||text.length===0||text.length>65536)fail('MOBILE_PAGED_TLS_PROFILE');return normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(text));
}
export async function createDeviceSepoliaDefiPinnedTransportV7(profile:DeviceSepoliaDefiConnectionV7,signal?:AbortSignal):Promise<Transport>{
 const packet=normalizeDeviceSepoliaDefiConnectionV7(profile);
 return createPinnedTransport('SEPOLIA_DEFI_V7',packet.descriptor.origin,Date.now()+9*60*60*1000,packet.transport,signal,packet.descriptor.pairingId);
}
export async function readDeviceSepoliaDefiConnectionClipboardV7():Promise<string>{
 if(Platform.OS!=='android'||!bridge?.readConnectionProfile)fail('MOBILE_PAGED_TLS_BRIDGE_REQUIRED');
 const text=await bridge.readConnectionProfile('SEPOLIA_DEFI_V7');parseDeviceSepoliaDefiConnectionV7(text);return text;
}
export async function createDeviceDefiPositionsPinnedTransportV1(profile:DeviceDefiPositionsConnectionProfileV1,signal?:AbortSignal):Promise<Transport>{
 const packet=parseDeviceDefiPositionsConnectionProfileV1(JSON.stringify(profile));
 return createPinnedTransport('POSITIONS',packet.descriptor.origin,Date.now()+9*60*60*1000,packet.transport,signal);
}
// This original handle owns only a short pinned recovery transport. It is
// never accepted by the ordinary financial V3 SDK or caller-supplied fetch.
export async function createDevicePagedSourceRenewalPinnedTransportV4(profile:DevicePagedConnectionProfileV3,sourceToken:object,signal?:AbortSignal):Promise<Readonly<{close:()=>Promise<void>}>>{
 if(arguments.length!==2&&arguments.length!==3)fail('MOBILE_PAGED_SOURCE_RECOVERY_TRANSPORT');const Vault=await import('../custody/device-paged-note-vault-v3.ts'),scope=await Vault.readDevicePagedSourceRecoveryScopeV4(sourceToken),packet=parseDevicePagedConnectionProfileV3(JSON.stringify(profile));
 if(JSON.stringify(packet.descriptor)!==JSON.stringify(scope.descriptor))fail('MOBILE_PAGED_SOURCE_RECOVERY_TRANSPORT');await Vault.assertDevicePagedSourceRecoveryTokenV4(sourceToken);
 const transport=await createDevicePagedSourceRenewalPinnedTransportCoreV4(packet,sourceToken,signal);
 try{await Vault.assertDevicePagedSourceRecoveryTokenV4(sourceToken);return transport;}catch(error){await transport.close();throw error;}
}
export async function readOriginalDevicePagedSourceRenewalTransportV4(handle:object,sourceToken:object):Promise<Transport>{
 const Vault=await import('../custody/device-paged-note-vault-v3.ts');await Vault.assertDevicePagedSourceRecoveryTokenV4(sourceToken);return readOriginalDevicePagedSourceRenewalTransportCoreV4(handle,sourceToken);
}
