/** Public wallet selection DATA only. The existing signed access/consent and
 * private proof bodies are forwarded unchanged through the original transport. */
import {normalizeExternalFlatDescriptorV1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
export function createDevicePagedPublicUniswapFetchV5(fetchImpl,rawDescriptor){
 if(arguments.length!==2||typeof fetchImpl!=='function')throw Error('MOBILE_PAGED_PUBLIC_UNISWAP_ROUTING');
 const descriptor=normalizeExternalFlatDescriptorV1(rawDescriptor);
 if(descriptor.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1)throw Error('MOBILE_PAGED_PUBLIC_UNISWAP_ROUTING');
 const challenge=descriptor.origin+'/v1/mobile/external-flat-share/challenges';
 return (url,options)=>{
  if(url===challenge){
   if(options?.method!=='POST'||options.body!=='{}')throw Error('MOBILE_PAGED_PUBLIC_UNISWAP_ROUTING');
   return fetchImpl(url,{...options,body:JSON.stringify({pairingId:descriptor.pairingId})});
  }
  return fetchImpl(url,options);
 };
}
