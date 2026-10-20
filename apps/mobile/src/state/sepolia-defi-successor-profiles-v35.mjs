/** Public routing DATA only. New custody comes from the separate authenticated
 * encrypted source handoff; target identity and retained withdrawals stay fixed. */
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {normalizeDevicePagedSourceSuccessorConnectionV35} from '@lianum/mobile-protocol/device/paged-source-successor-v35';
import {normalizeDevicePagedNativePreparationV3} from '@lianum/mobile-protocol/device/paged-graph-v3';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),need=v=>{if(!v)throw Error('MOBILE_SEPOLIA_DEFI_SUCCESSOR_BINDING');};
export function sepoliaDefiSuccessorProfilesV35(profiles,sourceConnection,rawPairing){
 need(Array.isArray(profiles)&&profiles.length===2);const original=profiles.map(text=>normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(text)));need(new Set(original.map(p=>p.protocol)).size===2&&original.every(p=>p.paegSource&&same(p.paegSource,original[0].paegSource)&&same(p.transport,original[0].transport)));
 const next=normalizeDevicePagedSourceSuccessorConnectionV35(sourceConnection,original[0].paegSource.descriptor);need(same(next.transport,original[0].transport)&&same(rawPairing.descriptor,next.descriptor));const preparation=normalizeDevicePagedNativePreparationV3(rawPairing.nativePreparation,next.descriptor);need(preparation.defi&&!preparation.uniswap);
 return Object.freeze(original.map(value=>JSON.stringify(normalizeDeviceSepoliaDefiConnectionV7({...value,paegSource:{descriptor:next.descriptor,preparation}}))));
}
