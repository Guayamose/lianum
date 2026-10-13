import type {DevicePagedPayoutSettlementPlanV3} from '../../../../packages/mobile-protocol/src/device-paged-payout-settlement-v3.mjs';
import {normalizeDevicePagedEconomicViewV3} from '../../../../packages/mobile-protocol/src/device-paged-economic-view-v3.mjs';
import type {DevicePagedUniswapIntentV3} from '../../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
export type DevicePagedNativeIntentV3={family:'EVM'|'BTC'|'SOL';recipient:string;amount:string};
export type DevicePagedExecutionReviewV3=Readonly<{descriptor:any;rootId:string;graphId:string;authorizationRoot:string;reserveNullifier:string;budget:string;settleBefore:string;expiresAt:number;steps:readonly Readonly<{id:string;reserve:string;intent:DevicePagedNativeIntentV3|DevicePagedUniswapIntentV3|null}>[]}>;
export type DevicePagedWithdrawalBindingV3=Readonly<{descriptor:any;rootId:string;graphId:string;revision:1;role:string;id:string|null;amount:string;nullifier:string}>;
export type DevicePagedEconomicReviewV3=Readonly<{plan:DevicePagedPayoutSettlementPlanV3;rootId:string;revision:1;providerIdentity:string;signerIdentity:string;expiresAt:number;view:ReturnType<typeof normalizeDevicePagedEconomicViewV3>;changeConfirmed:boolean;eligible:boolean;blockedReason:null|'CHANGE_REQUIRED'|'WITHDRAWAL_HISTORY_UNAVAILABLE'|'WITHDRAWN_ELSEWHERE';paid:readonly Readonly<{id:string;amount:string;nullifier:string;recipient:string;transactionHash:string}>[]}>;
export function readDevicePagedEconomicReviewV3(value:unknown):DevicePagedEconomicReviewV3;
export function assertDevicePagedEconomicReviewActiveV3(value:unknown):void;
export function createDevicePagedCustodyViewIssuerV3(root:Uint8Array,descriptor:unknown,current:()=>void):Readonly<{executionReview(value:DevicePagedExecutionReviewV3,status:unknown):DevicePagedExecutionReviewV3;economicReview(value:DevicePagedEconomicReviewV3,reply:unknown):DevicePagedEconomicReviewV3;withdrawalOption(value:any,binding:DevicePagedWithdrawalBindingV3,status:unknown,active:()=>void):any}>;
export function readDevicePagedExecutionReviewV3(value:unknown):DevicePagedExecutionReviewV3;
export function assertDevicePagedExecutionReviewActiveV3(value:unknown):void;
export function readDevicePagedWithdrawalOptionV3(value:unknown):DevicePagedWithdrawalBindingV3;

/** Existing original view, refreshed by the same live Vault with equal approved terms. */
export function readDevicePagedExecutionReviewRefreshV3(approved:unknown,fresh:unknown):DevicePagedExecutionReviewV3;
export function readDevicePagedEconomicReviewRefreshV3(approved:unknown,fresh:unknown):DevicePagedEconomicReviewV3;
