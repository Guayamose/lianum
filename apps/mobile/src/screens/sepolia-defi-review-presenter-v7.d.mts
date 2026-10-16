import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
export function formatDeviceSepoliaDefiAtomicV7(amount:string,decimals:number):string;
export function presentDeviceSepoliaDefiReviewV7(raw:DeviceSepoliaDefiReviewV4,now?:number):Readonly<{
  protocol:string;title:string;confirmLabel:string;shares:string;amountLabel:string;amount:string;
  destinationLabel:string;destination:string;detail:string;validFrom:string;validUntil:string;live:boolean;timeNotice:string;
}>;
