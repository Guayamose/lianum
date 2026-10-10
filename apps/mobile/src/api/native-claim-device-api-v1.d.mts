import type {NativeClaimDeviceDescriptorV1,NativeClaimDevicePermissionV1,NativeClaimDeviceObservationV1,NativeClaimDeviceReconcileV1,NativeClaimDeviceJournalPermissionV1,NativeClaimDeviceRedeemPermissionV1,NativeClaimDeviceRedeemAdmissionV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
export function readNativeClaimDeviceObservationV1(value:NativeClaimDeviceObservationV1):NativeClaimDeviceObservationV1;
export function createNativeClaimDeviceApiV1(input:{descriptor:NativeClaimDeviceDescriptorV1;fetchImpl?:typeof globalThis.fetch}):Readonly<{
 challenge(action?:NativeClaimDeviceJournalPermissionV1['action'],requestId?:string|null):Promise<NativeClaimDeviceJournalPermissionV1>;
 redemptionChallenge(input:{requestId:string;amount:string;maxFee:string}):Promise<NativeClaimDeviceRedeemPermissionV1>;
 redeem(permission:NativeClaimDeviceRedeemPermissionV1,signature:string):Promise<NativeClaimDeviceRedeemAdmissionV1>;
 read(permission:NativeClaimDeviceJournalPermissionV1,signature:string):Promise<NativeClaimDeviceObservationV1>;
 reconcile(permission:NativeClaimDeviceJournalPermissionV1,signature:string):Promise<NativeClaimDeviceReconcileV1>;
 close():{closed:true};}>;

import type {DeviceRootClaimDescriptorV2,DeviceRootClaimPermissionV2,DeviceRootClaimStatementV2,DeviceRootClaimExitPermissionV3,DeviceRootClaimExitQuoteV3} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
export type DeviceRootClaimReviewV2=Readonly<{consent:DeviceRootClaimPermissionV2;common:Record<string,unknown>}>;
export type DeviceRootClaimObservationV2=Readonly<{profile:string;descriptor:DeviceRootClaimDescriptorV2;permissionId:string;observedAt:number;expiresAt:number;
 noteCustody:'DEVICE_ROOT_NOTE';nativeCustody:'BACKEND_LOCAL_QUORUM';nativeSelfCustody:false;availablePrivateClaims:string|null;
 note?:Readonly<{state:'UNKNOWN'|'LIVE'|'SPENT';commitment:string|null;nullifier:string|null;available:string|null;path:DeviceRootClaimExitQuoteV3['path']|null;backing:Readonly<{held:string;liabilities:string;surplus:string;deficit:string}>|null}>;withdrawal?:Readonly<{jobId:string;stage:string;proofSHA256:string|null;publicInputsSHA256:string|null;transactionHash:string|null}>|null;redemption?:Readonly<{requestId:string;ticketId:string|null;amount:string;maxFee:string;payoutAdmitted:boolean;status:string}>|null;
 deposit:Readonly<{status:string;amount:string}>|null;commitment:string|null;nullifier:string|null;requiresReconciliation:boolean;economicState:unknown}>;
export function readOriginalDeviceRootClaimPermissionV2(value:DeviceRootClaimPermissionV2):DeviceRootClaimPermissionV2;
export function readOriginalDeviceRootClaimReviewV2(value:object):DeviceRootClaimReviewV2;
export function readOriginalDeviceRootClaimObservationV2(value:object):DeviceRootClaimObservationV2;
export function readOriginalDeviceRootClaimExitPermissionV3(value:DeviceRootClaimExitPermissionV3):DeviceRootClaimExitPermissionV3;
export function readOriginalDeviceRootClaimExitQuoteV3(value:object):DeviceRootClaimExitQuoteV3;
export function createDeviceRootNativeClaimApiV2(input:{descriptor:DeviceRootClaimDescriptorV2;fetchImpl?:typeof globalThis.fetch}):Readonly<{
 quoteW39(access:DeviceRootClaimPermissionV2,signature:string):Promise<DeviceRootClaimExitQuoteV3>;
 reviewW39(access:DeviceRootClaimPermissionV2,signature:string,quote:DeviceRootClaimExitQuoteV3,witnessSHA256:string):Promise<DeviceRootClaimExitPermissionV3>;
 exitChallenge(access:DeviceRootClaimPermissionV2,signature:string,action:Exclude<DeviceRootClaimExitPermissionV3['action'],'PROVE_W39'>):Promise<DeviceRootClaimExitPermissionV3>;
 exitSubmit(permission:DeviceRootClaimExitPermissionV3,signature:string,packet?:unknown):Promise<unknown>;
 challenge(action?:'ACCESS'|'READ'):Promise<DeviceRootClaimPermissionV2>;
 reviewD27(access:DeviceRootClaimPermissionV2,signature:string,draft:{rootId:string;noteRevision:number;statement:DeviceRootClaimStatementV2;witnessSHA256:string}):Promise<DeviceRootClaimPermissionV2>;
 reviewCI51(access:DeviceRootClaimPermissionV2,signature:string,witnessSHA256:string):Promise<DeviceRootClaimReviewV2>;
 effectChallenge(action:'FUND_NATIVE_CLAIM'|'ISSUE_CLAIM'):Promise<DeviceRootClaimPermissionV2>;
 submit(permission:DeviceRootClaimPermissionV2,signature:string,packet?:unknown):Promise<unknown>;
 read(permission:DeviceRootClaimPermissionV2,signature:string):Promise<DeviceRootClaimObservationV2>;close():{closed:true};}>;
