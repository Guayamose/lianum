import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
export type DeviceSepoliaDefiActivityV7=Readonly<{profile:'DEVICE_SEPOLIA_DEFI_ACTIVITY_V7';review:DeviceSepoliaDefiReviewV4;jobId:string|null}>;
export function createDeviceSepoliaDefiActivityV7(input:{connection:DeviceSepoliaDefiConnectionV7;storage:{get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>}}):Readonly<{
  read(action:'INVEST'|'REDEEM'):Promise<DeviceSepoliaDefiActivityV7|null>;
  save(review:DeviceSepoliaDefiReviewV4,jobId?:string|null):Promise<DeviceSepoliaDefiActivityV7>;
}>;
