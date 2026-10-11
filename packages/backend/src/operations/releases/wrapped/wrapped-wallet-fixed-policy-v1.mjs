/** Explicitly closed fixed entry. Source/host checks never populate these. */
import assert from 'node:assert/strict';
export const WRAPPED_WALLET_FIXED_RELEASE_V1=true;
export const WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1=null;
export const WRAPPED_WALLET_ECONOMICS_V1=Object.freeze({source:'3000000',payout:'1200000',change:'1800000',graphNative:'1000000'});
export const WRAPPED_WALLET_FIXED_RESULT_V1='LIANUM_FIXED_WRAPPED_WALLET_ACCEPTANCE_RESULT_V1';
export const WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1='LIANUM_FIXED_WRAPPED_WALLET_PREFLIGHT_RESULT_V1';
export function assertWrappedWalletFixedResultV1(r){
 assert.deepEqual(r.coldRecovery,{orderedWorkerLifetimes:3,prePrincipalReopened:true,fundedObligationsReopened:true,originalBaselineRestored:true,noInitialEffectsReplayed:true});
 assert.equal(r.format,WRAPPED_WALLET_FIXED_RESULT_V1);assert.equal(r.fullWalletAcceptance,true);assert.equal(r.terminal?.profile,'ORIGINAL_WRAPPED_WALLET_ECONOMIC_CLOSURE_V1');
 assert.deepEqual(r.terminal.economics,WRAPPED_WALLET_ECONOMICS_V1);assert.deepEqual(r.terminal.finalLiabilities,['0','0']);
 assert.deepEqual(r.terminal.finalNativePrincipal,['0','0']);assert.deepEqual(r.terminal.nativeSendCounts,{bitcoin:0,solana:2,graph:1});
 assert.equal(r.terminal.originalProofTransactionsVerified,true);assert.equal(r.terminal.currentCompleteReciprocalAudit,true);
 assert.equal(r.oneSharedApplication,true);assert.equal(r.cleanup.allOwnedResourcesClosed,true);return {fullWalletAcceptance:true};
}
export function assertWrappedWalletFixedPreflightResultV1(r){assert.equal(r.format,WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1);
 assert.equal(r.fullWalletAcceptance,false);assert.equal(r.unfunded?.originalFactories,true);assert.equal(r.unfunded?.principalAbsent,true);
 assert.equal(r.unfunded?.proofsAbsent,true);assert.equal(r.cleanup.allOwnedResourcesClosed,true);return {fullWalletAcceptance:false,unfunded:true};}

/** One exact reviewed checkpoint, component deployment only. No mode/options override. */
export const WRAPPED_DEPLOYMENT_ONLY_RELEASE_V1=null;
export const WRAPPED_DEPLOYMENT_ONLY_RESULT_V1='LIANUM_WRAPPED_DEPLOYMENT_ONLY_RESULT_V1';
export function assertWrappedDeploymentOnlyReleaseV1(){
 assert.equal(arguments.length,0);assert.equal(WRAPPED_WALLET_FIXED_RELEASE_V1,null);assert.equal(WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1,null);
 assert.match(WRAPPED_DEPLOYMENT_ONLY_RELEASE_V1,/^[0-9a-f]{64}$/,'WRAPPED_DEPLOYMENT_ONLY_NOT_RELEASED');
 assert.notEqual(WRAPPED_DEPLOYMENT_ONLY_RELEASE_V1,'0'.repeat(64),'WRAPPED_DEPLOYMENT_ONLY_REVIEWED_CHECKPOINT');return WRAPPED_DEPLOYMENT_ONLY_RELEASE_V1;
}
export function assertWrappedDeploymentOnlyResultV1(r){
 assert.equal(r.format,WRAPPED_DEPLOYMENT_ONLY_RESULT_V1);assert.equal(r.deploymentOnly,true);assert.equal(r.fullWalletAcceptance,false);assert.equal(r.fullUnfundedWalletAcceptance,false);
 assert.equal(r.unfunded,null);assert.equal(r.terminal,null);assert.equal(r.oneExecutionReleaseConsumed,true);assert.match(r.checkpointSHA256,/^[0-9a-f]{64}$/);assert.equal(r.checkpointSHA256,WRAPPED_DEPLOYMENT_ONLY_RELEASE_V1,'WRAPPED_DEPLOYMENT_ONLY_CHECKPOINT_MISMATCH');
 assert.deepEqual(r.deployment,{scope:'ORIGINAL_COMBINED_DEPLOYMENT_HELPER_ONLY_V1',helperReturned:true,originalFactories:true,runtimeCapabilityCount:4,receiverChainId:'31337',graphChainId:'1',laterWalletWorkStarted:false});
 assert.equal(r.cleanup.allOwnedResourcesClosed,true);for(const k of ['closedEvm','closedGraphEvm','closedBitcoin','closedSolana'])assert.equal(r.cleanup[k],true);
 return {deploymentOnly:true,fullWalletAcceptance:false,fullUnfundedWalletAcceptance:false};
}
