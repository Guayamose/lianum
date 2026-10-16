import type {DevicePagedAutomationTopologyV4} from '@lianum/mobile-protocol/device/paged-automation-quota-v4';
import type {DevicePagedBudgetAssetDataV4} from '../../../../packages/mobile-protocol/src/device-paged-budget-asset-v4.mjs';
import type {DevicePagedProviderQuoteAnyV5 as DevicePagedProviderQuoteV4} from '../../../../packages/mobile-protocol/src/device-paged-provider-quote-any-v5.mjs';
import type {DevicePagedPayoutSettlementPlanV3} from '../../../../packages/mobile-protocol/src/device-paged-payout-settlement-v3.mjs';
import {normalizeDevicePagedEconomicViewAnyV5 as normalizeDevicePagedEconomicViewV3} from '../../../../packages/mobile-protocol/src/device-paged-economic-view-v3.mjs';
import type {DevicePagedUniswapIntentV3} from '../../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
export type DevicePagedNativeIntentV3={family:'EVM'|'BTC'|'SOL';recipient:string;amount:string};
export type DevicePagedExecutionReviewV3=Readonly<{descriptor:any;rootId:string;graphId:string;authorizationRoot:string;reserveNullifier:string;budget:string;budgetAsset?:DevicePagedBudgetAssetDataV4;fundingOrigin?:'OPERATOR_TESTNET';settleBefore:string;expiresAt:number;automationTopology?:DevicePagedAutomationTopologyV4;executorPayouts?:import('@lianum/mobile-protocol/device/paged-executor-payout-v5').DevicePagedExecutorPayoutPlanV5;steps:readonly Readonly<{id:string;reserve:string;intent:DevicePagedNativeIntentV3|DevicePagedUniswapIntentV3|null;quote?:DevicePagedProviderQuoteV4|null}>[]}>;
export type DevicePagedWithdrawalBindingV3=Readonly<{descriptor:any;rootId:string;graphId:string;revision:number;role:string;id:string|null;amount:string;nullifier:string}>;
export type DevicePagedEconomicReviewV3=Readonly<{plan:DevicePagedPayoutSettlementPlanV3;rootId:string;revision:number;providerIdentity:string;signerIdentity:string;expiresAt:number;view:ReturnType<typeof normalizeDevicePagedEconomicViewV3>;changeConfirmed:boolean;eligible:boolean;blockedReason:null|'CHANGE_REQUIRED'|'WITHDRAWAL_HISTORY_UNAVAILABLE'|'WITHDRAWN_ELSEWHERE';paid:readonly Readonly<{id:string;amount:string;nullifier:string;recipient:string;transactionHash:string}>[]}>;
export function readDevicePagedEconomicReviewV3(value:unknown):DevicePagedEconomicReviewV3;
export function assertDevicePagedEconomicReviewActiveV3(value:unknown):void;
export function createDevicePagedCustodyViewIssuerV3(root:Uint8Array,descriptor:unknown,current:()=>void,revision?:number):Readonly<{executionReview(value:DevicePagedExecutionReviewV3,status:unknown):DevicePagedExecutionReviewV3;economicReview(value:DevicePagedEconomicReviewV3,reply:unknown):DevicePagedEconomicReviewV3;withdrawalOption(value:any,binding:DevicePagedWithdrawalBindingV3,status:unknown,active:()=>void):any;cutoffRecoveryReview(value:DevicePagedCutoffRecoveryReviewV5,reply:unknown):DevicePagedCutoffRecoveryReviewV5}>;
export function readDevicePagedExecutionReviewV3(value:unknown):DevicePagedExecutionReviewV3;
export function assertDevicePagedExecutionReviewActiveV3(value:unknown):void;
export function readDevicePagedWithdrawalOptionV3(value:unknown):DevicePagedWithdrawalBindingV3;

/** Existing original view, refreshed by the same live Vault with equal approved terms. */
export function readDevicePagedExecutionReviewRefreshV3(approved:unknown,fresh:unknown):DevicePagedExecutionReviewV3;
export function readDevicePagedEconomicReviewRefreshV3(approved:unknown,fresh:unknown):DevicePagedEconomicReviewV3;

import type {DevicePagedAutomationRequestAnyV5 as DevicePagedAutomationRequestV4} from '../../../../packages/mobile-protocol/src/device-paged-automation-v5.mjs';
export type DevicePagedAutomationReviewV4=Readonly<{execution:DevicePagedExecutionReviewV3;request:DevicePagedAutomationRequestV4}>;
export function createDevicePagedAutomationReviewV4(execution:unknown):DevicePagedAutomationReviewV4;
export function createDevicePagedLimitedAutomationReviewV5(execution:unknown,maximumCommands:number):DevicePagedAutomationReviewV4;
export function readDevicePagedAutomationReviewV4(review:unknown):DevicePagedAutomationReviewV4;
export function assertDevicePagedAutomationReviewActiveV4(review:unknown):void;
export function refreshDevicePagedAutomationReviewV4(review:unknown,freshExecution:unknown):DevicePagedAutomationReviewV4;

export type DevicePagedCutoffRecoveryReviewV5=Readonly<{descriptor:any;rootId:string;revision:number;graphId:string;authorizationRoot:string;reserveNullifier:string;progressCommitment:string;budget:string;settleBefore:string;blockTimestamp:string;blockHash:string;expiresAt:number}>;
export function readDevicePagedCutoffRecoveryReviewV5(value:unknown):DevicePagedCutoffRecoveryReviewV5;
