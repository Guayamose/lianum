import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {createDevicePagedConnectionTransportV3,createDeviceSepoliaDefiPinnedTransportV7} from './device-paged-connection-transport-v3.ts';
import type {Transport} from './device-paged-pinned-transport-core-v3.ts';
/** Android owns one pinned socket realm at a time. Both fixed SDKs keep their
 * original brands; switching transport neither signs nor repeats a request. */
export function createDeviceSepoliaDefiPagedTransportV8(raw:unknown,signal:AbortSignal){
 const profile=normalizeDeviceSepoliaDefiConnectionV7(raw);if(!profile.paegSource||signal.aborted)throw Error('MOBILE_SEPOLIA_DEFI_SOURCE_REQUIRED');let current:Transport|null=null,realm:string|null=null,closed=false,work:Promise<unknown>=Promise.resolve();
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit)=>{const pending=work.then(async()=>{if(closed||signal.aborted||typeof input!=='string')throw Error('MOBILE_SEPOLIA_DEFI_CLOSED');const url=new URL(input);if(url.origin!==profile.descriptor.origin)throw Error('MOBILE_SEPOLIA_DEFI_ORIGIN');const selected=url.pathname.startsWith('/v1/mobile/paged-owner/')?'PAGED':url.pathname.startsWith('/v1/mobile/sepolia-defi-shares/')?'DEFI':null;if(!selected)throw Error('MOBILE_SEPOLIA_DEFI_ROUTE');if(realm!==selected){await current?.close();current=null;realm=null;if(closed||signal.aborted)throw Error('MOBILE_SEPOLIA_DEFI_CLOSED');current=selected==='PAGED'?await createDevicePagedConnectionTransportV3({format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:profile.paegSource!.descriptor,transport:profile.transport},signal):await createDeviceSepoliaDefiPinnedTransportV7(profile,signal);realm=selected;}return current!.fetchImpl(input,init);});work=pending.catch(()=>{});return pending;}) as typeof fetch;
 return Object.freeze({fetchImpl,async close(){closed=true;await work.catch(()=>{});await current?.close();current=null;realm=null;}});
}
