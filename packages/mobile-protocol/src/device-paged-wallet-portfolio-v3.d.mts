export const DEVICE_PAGED_WALLET_PORTFOLIO_V3:'DEVICE_PAGED_WALLET_PORTFOLIO_V3';
export type DevicePagedPortfolioOutputV3={role:'source'|'change'|'recovery'|'payout';id:string|null;commitment:string;nullifier:string;amount:string};
export type DevicePagedPortfolioRequestV3={outputs:readonly DevicePagedPortfolioOutputV3[]};
export type DevicePagedPortfolioObservedOutputV3=DevicePagedPortfolioOutputV3&{issued:boolean;state:'LIVE'|'SPENT'|'LOCKED'|'UNKNOWN';available:string|null};
export type DevicePagedWalletPortfolioV3={type:'wallet-portfolio';profile:'DEVICE_PAGED_WALLET_PORTFOLIO_V3';descriptor:any;graphId:string;rootId:string;revision:1;authorizationRoot:string|null;phase:string;pending:boolean;ledger:{blockHash:string;blockNumber:string;heldAmount:string;backedAmount:string;reservedAmount:string|null};outputs:readonly DevicePagedPortfolioObservedOutputV3[]};
export function normalizeDevicePagedPortfolioRequestV3(raw:unknown):DevicePagedPortfolioRequestV3;
export function normalizeDevicePagedWalletPortfolioV3(raw:unknown,descriptor:unknown):DevicePagedWalletPortfolioV3;
