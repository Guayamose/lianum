import type {DeviceExecutionConsentV1} from './device-execution-consent-v1.mjs';
export const DEVICE_RECOVERY_ARM_V1: 'LIANUM_DEVICE_ORIGINAL_LIVE_F_ARM_V1';
export type DeviceRecoveryArmConsentV1=Readonly<{version:1;profile:typeof DEVICE_RECOVERY_ARM_V1;action:'ARM_RECOVERY'|'DISARM_RECOVERY';execution:DeviceExecutionConsentV1;settleBefore:string}>;
export type DeviceRecoveryArmStatusV1=Readonly<{jobId:string;state:'ABSENT'|'ARMED'|'FIRING'|'UNKNOWN'|'DISARMED'|'RECOVERED'|'FULFILLED';settleBefore:string;armSHA256:string|null;terminalOutcome:'RECOVERED'|'FULFILLED'|null;authorizationSHA256:string}>;
export function normalizeDeviceRecoveryArmConsentV1(raw:unknown):DeviceRecoveryArmConsentV1;
export function validateDeviceRecoveryArmConsentFreshV1(raw:unknown,now?:number):DeviceRecoveryArmConsentV1;
export function deviceRecoveryArmConsentMessageV1(raw:unknown):Uint8Array;
export function normalizeDeviceRecoveryArmStatusV1(raw:unknown):DeviceRecoveryArmStatusV1;
