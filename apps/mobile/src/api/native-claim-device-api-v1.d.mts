import type {NativeClaimDeviceDescriptorV1,NativeClaimDevicePermissionV1,NativeClaimDeviceObservationV1,NativeClaimDeviceReconcileV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
export function readNativeClaimDeviceObservationV1(value:NativeClaimDeviceObservationV1):NativeClaimDeviceObservationV1;
export function createNativeClaimDeviceApiV1(input:{descriptor:NativeClaimDeviceDescriptorV1;fetchImpl?:typeof globalThis.fetch}):Readonly<{
 challenge(action?:NativeClaimDevicePermissionV1['action'],requestId?:string|null):Promise<NativeClaimDevicePermissionV1>;
 read(permission:NativeClaimDevicePermissionV1,signature:string):Promise<NativeClaimDeviceObservationV1>;
 reconcile(permission:NativeClaimDevicePermissionV1,signature:string):Promise<NativeClaimDeviceReconcileV1>;
 close():{closed:true};}>;
