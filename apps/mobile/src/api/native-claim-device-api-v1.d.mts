import type {NativeClaimDeviceDescriptorV1,NativeClaimDevicePermissionV1,NativeClaimDeviceObservationV1,NativeClaimDeviceReconcileV1,NativeClaimDeviceJournalPermissionV1,NativeClaimDeviceRedeemPermissionV1,NativeClaimDeviceRedeemAdmissionV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
export function readNativeClaimDeviceObservationV1(value:NativeClaimDeviceObservationV1):NativeClaimDeviceObservationV1;
export function createNativeClaimDeviceApiV1(input:{descriptor:NativeClaimDeviceDescriptorV1;fetchImpl?:typeof globalThis.fetch}):Readonly<{
 challenge(action?:NativeClaimDeviceJournalPermissionV1['action'],requestId?:string|null):Promise<NativeClaimDeviceJournalPermissionV1>;
 redemptionChallenge(input:{requestId:string;amount:string;maxFee:string}):Promise<NativeClaimDeviceRedeemPermissionV1>;
 redeem(permission:NativeClaimDeviceRedeemPermissionV1,signature:string):Promise<NativeClaimDeviceRedeemAdmissionV1>;
 read(permission:NativeClaimDeviceJournalPermissionV1,signature:string):Promise<NativeClaimDeviceObservationV1>;
 reconcile(permission:NativeClaimDeviceJournalPermissionV1,signature:string):Promise<NativeClaimDeviceReconcileV1>;
 close():{closed:true};}>;
