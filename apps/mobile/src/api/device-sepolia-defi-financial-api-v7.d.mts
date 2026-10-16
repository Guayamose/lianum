import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import type {DeviceSepoliaDefiFinancialStatusV7} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import type {ExternalFlatConsent} from '@lianum/mobile-protocol/device/source-note-v1';
import type {createDeviceExternalFlatRoutedNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
export type DeviceSepoliaDefiVaultV7=Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>;
export type DeviceSepoliaDefiProposalV7=Readonly<{action:'INVEST'|'REDEEM';sharesAtomic:string;maximumInputAtomic:string|null;minimumAssetsAtomic:string|null;underlyingReceiver:string;receiptCommitment?:string|null}>;
export function createDeviceSepoliaDefiFinancialApiV7(input:{connection:DeviceSepoliaDefiConnectionV7;fetchImpl?:typeof fetch}):Readonly<{
  connection:DeviceSepoliaDefiConnectionV7;
  propose(vault:DeviceSepoliaDefiVaultV7,input:DeviceSepoliaDefiProposalV7):Promise<DeviceSepoliaDefiReviewV4>;
  submitInvestment(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string,capitalNodeId?:string):Promise<DeviceSepoliaDefiFinancialStatusV7>;
  continueInvestment(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string,observation:DeviceSepoliaDefiFinancialStatusV7,capitalNodeId?:string):Promise<DeviceSepoliaDefiFinancialStatusV7>;
  withdrawalReview(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string):Promise<ExternalFlatConsent>;
  armWithdrawal(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string,consent:ExternalFlatConsent,consentSignature:string):Promise<DeviceSepoliaDefiFinancialStatusV7>;
  redeem(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string):Promise<DeviceSepoliaDefiFinancialStatusV7>;
  observe(vault:DeviceSepoliaDefiVaultV7,review:DeviceSepoliaDefiReviewV4,jobId:string):Promise<DeviceSepoliaDefiFinancialStatusV7>;
  close():void;
}>;
