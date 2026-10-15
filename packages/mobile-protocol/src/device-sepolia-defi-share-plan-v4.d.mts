export const DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4: 'DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4';
export const MAXIMUM_SHARE_NOTE_ATOMIC_V4: '18446744073709551615';
export type DeviceSepoliaDefiShareNoteV4 = Readonly<{id:string;pageIndex:number;noteIndex:number;sharesAtomic:string}>;
export type DeviceSepoliaDefiSharePlanV4 = Readonly<{profile:typeof DEVICE_SEPOLIA_DEFI_SHARE_PLAN_V4;protocol:'MORPHO_V2';shareDecimals:18;totalSharesAtomic:string;minimumNoteSharesAtomic:string;maximumNoteSharesAtomic:string;pageSize:64;pages:number;notes:ReadonlyArray<DeviceSepoliaDefiShareNoteV4>;financialAuthority:false;quotesRequired:true;originalCustodyPerNoteRequired:true}>;
export function planDeviceSepoliaMorphoShareNotesV4(input:{totalSharesAtomic:string;maximumNodes:number}):DeviceSepoliaDefiSharePlanV4;
