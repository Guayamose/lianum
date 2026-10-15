import type {ExternalFlatDescriptor} from '@lianum/mobile-protocol/device/source-note-v1';
import type {OriginalSepoliaDefiIssuerV4} from './device-sepolia-defi-shares-authority-v4.mjs';
export type OriginalSepoliaDefiSharesHttpV4=Readonly<{descriptor:ExternalFlatDescriptor;account:OriginalSepoliaDefiIssuerV4;dispatch(path:string,payload:unknown,pairingId:string,reference?:string|null):Promise<unknown>;close():Promise<void>}>;
export function createOriginalDeviceSepoliaDefiSharesHttpV4(runtime:object,target:object,input:{origin:string;devicePublicKey:string;journal:{path:string;password:string}}):Promise<OriginalSepoliaDefiSharesHttpV4>;
export function assertOriginalDeviceSepoliaDefiSharesHttpV4(handler:OriginalSepoliaDefiSharesHttpV4):OriginalSepoliaDefiSharesHttpV4;
