import type {DevicePagedProviderQuoteTermsV4,DevicePagedProviderQuoteV4} from './device-paged-provider-quote-v4.mjs';
import type {DevicePagedProviderQuoteTermsV5,DevicePagedProviderQuoteV5} from './device-paged-provider-quote-v5.mjs';
export type DevicePagedProviderQuoteAnyV5=DevicePagedProviderQuoteV4|DevicePagedProviderQuoteV5;
export function normalizeDevicePagedProviderQuoteTermsAnyV5(raw:unknown):Readonly<DevicePagedProviderQuoteTermsV4|DevicePagedProviderQuoteTermsV5>;
export function devicePagedProviderQuoteTermsHashAnyV5(raw:unknown):string;
export function normalizeDevicePagedProviderQuoteAnyV5(raw:unknown):DevicePagedProviderQuoteAnyV5;
export function devicePagedProviderQuoteFrameAnyV5(hash:string,action:string,profile:string):Uint8Array;
export function assertDevicePagedProviderQuoteActionAnyV5(raw:unknown,action:unknown):DevicePagedProviderQuoteAnyV5;
export function assertDevicePagedProviderQuoteBindingAnyV5(raw:unknown,expected:Parameters<typeof import('./device-paged-provider-quote-v4.mjs').assertDevicePagedProviderQuoteBindingV4>[1],now:string):DevicePagedProviderQuoteAnyV5;
