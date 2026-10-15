import type {ExternalFlatDescriptor,ExternalFlatConsent} from '@lianum/mobile-protocol/device/source-note-v1';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import type {createDeviceExternalFlatRoutedNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
declare const preparationBrand:unique symbol;
export type DeviceSepoliaDefiPreparationV4=Readonly<{[preparationBrand]:true}>;
export type DeviceSepoliaDefiSharesApiV4=Readonly<{
 descriptor:ExternalFlatDescriptor;
 prepare(vault:Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>,review:DeviceSepoliaDefiReviewV4,signal?:AbortSignal):Promise<DeviceSepoliaDefiPreparationV4>;
 prepareWithReviewedAuthorizationV5(vault:Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>,review:DeviceSepoliaDefiReviewV4,authorization:object,signal?:AbortSignal):Promise<DeviceSepoliaDefiPreparationV4>;
 submit(token:DeviceSepoliaDefiPreparationV4):Promise<unknown>;
 signPreparedWithdrawal(token:DeviceSepoliaDefiPreparationV4,consent:ExternalFlatConsent):Promise<string>;
 observe(vault:Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>):Promise<unknown>;
 close():void;
}>;
export function createDeviceSepoliaDefiSharesApiV4(input:{descriptor:ExternalFlatDescriptor;fetchImpl?:typeof globalThis.fetch}):DeviceSepoliaDefiSharesApiV4;
