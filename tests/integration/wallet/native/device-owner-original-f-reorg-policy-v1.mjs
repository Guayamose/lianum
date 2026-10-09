import assert from 'node:assert/strict';
import {assertDeviceRecoveryResultV1,DEVICE_RECOVERY_PROFILE_V1,DEVICE_RECOVERY_RESULT_V1} from './device-owner-recovery-policy-v1.mjs';
export const DEVICE_F_REORG_PROFILE_V1='device-owner-original-f-reorg-v1',DEVICE_F_REORG_RESULT_V1='LIANUM_DEVICE_OWNER_ORIGINAL_F_REORG_RESULT_V1';
export const DEVICE_F_REORG_RELEASE_V1=Object.freeze({format:'REVIEWED_ORIGINAL_DEVICE_F_REORG_RELEASE_V1',profile:DEVICE_F_REORG_PROFILE_V1,scope:'EXACT_ORIGINAL_BEFORE_F_PARENT_ONLY',
 originalRelations:9,originalSignatureRetained:true,originalWireReemissions:1,localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false});
export function assertDeviceFReorgReleaseV1(){assert.equal(arguments.length,0);assert.deepEqual(DEVICE_F_REORG_RELEASE_V1,
 {format:'REVIEWED_ORIGINAL_DEVICE_F_REORG_RELEASE_V1',profile:DEVICE_F_REORG_PROFILE_V1,scope:'EXACT_ORIGINAL_BEFORE_F_PARENT_ONLY',
 originalRelations:9,originalSignatureRetained:true,originalWireReemissions:1,localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false},'DEVICE_F_REORG_RELEASE_NULL_OR_CHANGED');}
export function assertDeviceFReorgResultV1(result){assert.equal(arguments.length,1);assert.equal(result.profile,DEVICE_F_REORG_PROFILE_V1);assert.equal(result.format,DEVICE_F_REORG_RESULT_V1);
 assertDeviceRecoveryResultV1({...result,profile:DEVICE_RECOVERY_PROFILE_V1,format:DEVICE_RECOVERY_RESULT_V1});
 const r=result.originalFReorg;assert.equal(r.format,'ORIGINAL_DEVICE_F_REORG_RECONFIRMATION_V1');assert.equal(r.scope,'EXACT_ORIGINAL_BEFORE_F_PARENT_ONLY');
 assert.equal(r.originalJobId,result.deviceNative.jobId);assert.equal(r.nativeBindingSHA256,result.deviceNative.nativeBindingSHA256);assert.equal(r.originalSHash,result.deviceReservation.observation.transactionHash);
 for(const k of ['sameWire','invalidatedBeforeReemission','deviceUnknownDurable','bothOutputsUnavailableWhileUnknown','snapshotConsumed'])assert.equal(r[k],true);
 for(const k of ['uniqueOriginalTransactionCount','originalEmissionCount','reemissionCount'])assert.equal(r[k],1);
 assert.equal(r.freshReconcilePermissions,2);for(const k of ['newEconomicPermissions','newNativeTransactionSignatures','newProofs'])assert.equal(r[k],0);
 assert.deepEqual(r.countsBefore,r.countsAfter);assert.equal(r.countsBefore.proofs,7);assert.match(r.originalWireSHA256,/^[0-9a-f]{64}$/);
 for(const k of ['transactionHash','calldataSHA256','outcome'])assert.equal(r.newTerminal[k],r.oldTerminal[k]);
 assert.equal(r.oldTerminal.outcome,'RECOVERED');assert.notEqual(r.newTerminal.blockHash,r.oldTerminal.blockHash);assert.equal(r.newTerminal.blockNumber,r.oldTerminal.blockNumber);
 assert.deepEqual(r.newTerminal,result.deviceNative.terminal);assert.deepEqual(r.newReceipt,result.deviceNative.receipt);
 assert.equal(r.oldReceipt.status,'0x1');assert.equal(r.newReceipt.status,'0x1');assert.equal(r.oldReceipt.transactionHash,r.newReceipt.transactionHash);
 assert.equal(r.oldReceipt.blockHash,'0x'+r.oldTerminal.blockHash);assert.equal(r.newReceipt.blockHash,'0x'+r.newTerminal.blockHash);
 assert.equal(r.probe.reverted,true);assert.equal(r.probe.exactOriginalParent,true);assert.equal(r.probe.originalTransactionAbsent,true);
 assert.equal(BigInt(r.probe.beforeBlockNumber)+1n,BigInt(r.probe.oldBlockNumber));assert.equal(r.deeperReorgSupported,false);assert.equal(r.publicNetwork,false);
 return{originalDeviceFReorgNodeAcceptance:true,deviceOwnerNativeRecoveryNodeAcceptance:true,deviceOwnerUSNodeAcceptance:true,deviceOwnerD26NodeAcceptance:true,
 nativeGraphAcceptance:true,nativeDeliveryCount:1,fullWalletAcceptance:false,physicalPhoneEstablished:false};}
