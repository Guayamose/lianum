export type DeviceSepoliaDefiFinancialStatusV7=Readonly<{
  jobId:string;reference:string;phase:'PREPARED'|'SUBMITTED'|'CONFIRMED'|'UNKNOWN';transactionHash:string|null;
  canonical:boolean;protocol:'AAVE_STATIC'|'MORPHO_V2';kind:'INVEST'|'WITHDRAW'|'REDEEM';
}>;
export function normalizeDeviceSepoliaDefiFinancialStatusV7(raw:unknown):DeviceSepoliaDefiFinancialStatusV7;
