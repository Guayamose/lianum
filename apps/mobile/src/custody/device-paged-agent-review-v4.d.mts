import type {DevicePagedAgentReadGrantAnyV5,DevicePagedSignedAgentReadGrantAnyV5} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
import type {DevicePagedAutomationReviewV4} from './device-paged-custody-views-v3.mjs';
import type {DevicePagedAgentReadGrantV4} from '@lianum/mobile-protocol/device/paged-agent-v4';
export type DevicePagedAgentAutomationReviewV4=Readonly<{automation:DevicePagedAutomationReviewV4;grant:DevicePagedAgentReadGrantAnyV5}>;
export function createDevicePagedAgentAutomationReviewV4(automation:unknown,readerPublicKey:string,maximumReads?:number,readUntilMs?:number):DevicePagedAgentAutomationReviewV4;
export function readDevicePagedAgentAutomationReviewV4(raw:unknown):DevicePagedAgentAutomationReviewV4;
export function refreshDevicePagedAgentAutomationReviewV4(raw:unknown,freshExecution:unknown):DevicePagedAgentAutomationReviewV4;
