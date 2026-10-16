/** Explicit version dispatch. V4 validators themselves remain unchanged. */
import * as V4 from './device-paged-provider-quote-v4.mjs';
import * as V5 from './device-paged-provider-quote-v5.mjs';
const data=(v,key)=>v&&typeof v==='object'?Object.getOwnPropertyDescriptor(v,key)?.value:undefined;
const terms=v=>data(v,'profile')===V5.DEVICE_PAGED_PROVIDER_QUOTE_V5?V5:V4;
const quote=v=>terms(data(v,'terms'));
export const normalizeDevicePagedProviderQuoteTermsAnyV5=v=>terms(v)[terms(v)===V5?'normalizeDevicePagedProviderQuoteTermsV5':'normalizeDevicePagedProviderQuoteTermsV4'](v);
export const devicePagedProviderQuoteTermsHashAnyV5=v=>terms(v)[terms(v)===V5?'devicePagedProviderQuoteTermsHashV5':'devicePagedProviderQuoteTermsHashV4'](v);
export const normalizeDevicePagedProviderQuoteAnyV5=v=>quote(v)[quote(v)===V5?'normalizeDevicePagedProviderQuoteV5':'normalizeDevicePagedProviderQuoteV4'](v);
export const devicePagedProviderQuoteFrameAnyV5=(hash,action,profile)=>profile===V5.DEVICE_PAGED_PROVIDER_QUOTE_V5?V5.devicePagedProviderQuoteFrameV5(hash,action):V4.devicePagedProviderQuoteFrameV4(hash,action);
export const assertDevicePagedProviderQuoteActionAnyV5=(v,a)=>quote(v)[quote(v)===V5?'assertDevicePagedProviderQuoteActionV5':'assertDevicePagedProviderQuoteActionV4'](v,a);
export const assertDevicePagedProviderQuoteBindingAnyV5=(v,e,n)=>quote(v)[quote(v)===V5?'assertDevicePagedProviderQuoteBindingV5':'assertDevicePagedProviderQuoteBindingV4'](v,e,n);
