import type {NativeClaimDeviceDescriptorV1,NativeClaimDevicePermissionV1,NativeClaimDeviceObservationV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
export type PendingNativeClaimRedemptionV1=Readonly<{version:1;descriptor:NativeClaimDeviceDescriptorV1;requestId:string;amount:string;maxFee:string;recipientEndpoint:string;permissionSHA256:string;signatureSHA256:string;state:'UNRESOLVED'|'CONFIRMED'}>;
export function createNativeClaimPendingRedemptionV1(ports:{get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;digest(value:string):Promise<string>;devicePublicKey():Promise<string|null>}):Readonly<{
 read():Promise<PendingNativeClaimRedemptionV1|null>;
 retain(permission:NativeClaimDevicePermissionV1,signature:string):Promise<PendingNativeClaimRedemptionV1>;
 confirm(observation:NativeClaimDeviceObservationV1):Promise<PendingNativeClaimRedemptionV1|null>;
}>;
