export type DevicePagedEconomicOperationDisplayV4=Readonly<{result:string;disposition:string;budget:string;native:Readonly<{total:number;retained:number;uncertain:number}>;services:Readonly<{total:number;retained:number;uncertain:number}>;unclassified:number;pending:boolean;available:null;requiresNativeRefresh:true;recoveryIssued:boolean}>;
export function devicePagedEconomicOperationDisplayV4(raw:unknown,descriptor:unknown):DevicePagedEconomicOperationDisplayV4;
/** Presentation only; emits no network, finality or economic authority. */
export function devicePagedNativeCostPresentationDataV4(native:unknown,configuration:unknown):Readonly<{network:string;fee:string}>;
