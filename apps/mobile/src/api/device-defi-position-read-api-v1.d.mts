import type {DeviceDefiPositionDescriptorV1,DeviceDefiPositionAccessV1,DeviceDefiPositionReadV1,DeviceDefiPositionObservationV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
export function readDeviceDefiPositionObservationV1(value:DeviceDefiPositionObservationV1):DeviceDefiPositionObservationV1;
export function readDeviceDefiPositionObservationWindowV1(value:DeviceDefiPositionObservationV1):Readonly<{issuedAt:number;expiresAt:number}>;
export function createDeviceDefiPositionReadApiV1(input:{descriptor:DeviceDefiPositionDescriptorV1;fetchImpl?:typeof globalThis.fetch}):Readonly<{
 challenge():Promise<DeviceDefiPositionAccessV1>;
 openReview(access:DeviceDefiPositionAccessV1,signature:string):Promise<DeviceDefiPositionReadV1>;
 read(review:DeviceDefiPositionReadV1,signature:string):Promise<DeviceDefiPositionObservationV1>;
 close():{closed:true};
}>;
