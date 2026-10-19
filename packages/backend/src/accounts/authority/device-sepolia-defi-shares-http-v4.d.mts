import type {ExternalFlatDescriptor} from '@lianum/mobile-protocol/device/source-note-v1';
import type {OriginalSepoliaDefiIssuerV4} from './device-sepolia-defi-shares-authority-v4.mjs';
export type OriginalSepoliaDefiSharesHttpV4=Readonly<{descriptor:ExternalFlatDescriptor;account:OriginalSepoliaDefiIssuerV4;dispatch(path:string,payload:unknown,pairingId:string,reference?:string|null):Promise<unknown>;close():Promise<void>}>;
export function createOriginalDeviceSepoliaDefiSharesHttpV4(runtime:object,target:object,input:{origin:string;devicePublicKey:string;journal:{path:string;password:string}}):Promise<OriginalSepoliaDefiSharesHttpV4>;
export function assertOriginalDeviceSepoliaDefiSharesHttpV4(handler:OriginalSepoliaDefiSharesHttpV4):OriginalSepoliaDefiSharesHttpV4;
export function createOriginalDeviceSepoliaDefiSharesRetainedHttpV8(runtime:object,account:OriginalSepoliaDefiIssuerV4):OriginalSepoliaDefiSharesHttpV4;
export function mountOriginalDeviceSepoliaDefiSharesFinancialHttpV8(handler:OriginalSepoliaDefiSharesHttpV4):OriginalSepoliaDefiSharesHttpV4;
export function startOriginalDeviceSepoliaDefiSharesApprovedWorkerV8(handler:OriginalSepoliaDefiSharesHttpV4):void;
export function runOriginalDeviceSepoliaDefiSharesApprovedPendingV8(handler:OriginalSepoliaDefiSharesHttpV4):Promise<Readonly<{observed:number;redemptionsStarted:number;failures:number}>>;
export function withOriginalDeviceSepoliaDefiSharesIdleV10<T>(handler:OriginalSepoliaDefiSharesHttpV4,operation:()=>Promise<T>):Promise<T>;
export function quiesceOriginalDeviceSepoliaDefiSharesHttpV8(handler:OriginalSepoliaDefiSharesHttpV4):Promise<void>;

export function mountOriginalDeviceSepoliaDefiPaegFinancialHttpV8(handler:OriginalSepoliaDefiSharesHttpV4,provider:object):Promise<OriginalSepoliaDefiSharesHttpV4>;
