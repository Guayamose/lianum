import type {DeviceSepoliaMorphoBatchReviewV5} from '@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5';
import type {createDeviceExternalFlatRoutedNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
declare const batchBrand:unique symbol;
export type DeviceSepoliaMorphoShareBatchV5=Readonly<{[batchBrand]:true}>;
export type DeviceSepoliaMorphoShareBatchApiV5=Readonly<{
 prepare(review:DeviceSepoliaMorphoBatchReviewV5,entries:Array<{id:string;vault:Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>}>,signal?:AbortSignal):Promise<DeviceSepoliaMorphoShareBatchV5>;
 submitNote(token:DeviceSepoliaMorphoShareBatchV5,id:string):Promise<unknown>;
 observe(token:DeviceSepoliaMorphoShareBatchV5,id:string):Promise<unknown>;
 state(token:DeviceSepoliaMorphoShareBatchV5):Readonly<{reference:string;notes:ReadonlyArray<Readonly<{id:string;phase:'READY'|'PREPARING'|'SUBMITTING'|'PROVED'|'UNKNOWN'}>>;financialNativeMounted:false}>;
 close():void;
}>;
export function createDeviceSepoliaMorphoShareBatchApiV5(input?:{fetchImpl?:typeof globalThis.fetch}):DeviceSepoliaMorphoShareBatchApiV5;
