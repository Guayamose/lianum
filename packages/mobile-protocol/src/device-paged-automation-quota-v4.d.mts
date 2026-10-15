export type DevicePagedAutomationTopologyV4=Readonly<{pages:string;nodes:readonly Readonly<{id:string;dependsOn:readonly string[]}>[]}>;
export function normalizeDevicePagedAutomationTopologyV4(raw:unknown):DevicePagedAutomationTopologyV4;
export function devicePagedAutomationCommandQuotaV4(raw:unknown):Readonly<{nodes:number;pages:number;dependencies:number;dependencyFolds:number;maxCommands:number;maximumCommands:4096}>;
