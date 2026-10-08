/** D26/U/S only, genuine original local keys/proofs/wires. No delivery/EXIT,
 * physical phone, native SecureStore/biometry, full portfolio or remote RPC. */
import assert from 'node:assert/strict';
import {assertDeviceDepositResultV1,DEVICE_DEPOSIT_RESULT_V1,DEVICE_DEPOSIT_PROFILE_V1} from './device-owner-deposit-policy-v1.mjs';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
export const DEVICE_RESERVATION_PROFILE_V1='device-owner-reservation-v1';
export const DEVICE_RESERVATION_RESULT_V1='LIANUM_DEVICE_OWNER_RESERVATION_RESULT_V1';
export const DEVICE_RESERVATION_REAL_RELEASE_V1=Object.freeze({"format":"REVIEWED_LOCAL_DEVICE_OWNER_RESERVATION_RELEASE_V1","profile":"device-owner-reservation-v1","amountAtomic":"500","relations":["deposit_balance","authorization","reservation"],"localOnly":true,"fakeFundsOnly":true,"publicNetwork":false,"phone":false});
export function assertDeviceReservationReleaseV1(){assert.equal(arguments.length,0);
 assert.deepEqual(DEVICE_RESERVATION_REAL_RELEASE_V1,{format:'REVIEWED_LOCAL_DEVICE_OWNER_RESERVATION_RELEASE_V1',profile:DEVICE_RESERVATION_PROFILE_V1,
  amountAtomic:'500',relations:['deposit_balance','authorization','reservation'],localOnly:true,fakeFundsOnly:true,publicNetwork:false,phone:false},'DEVICE_US_RELEASE_ABSENT_OR_CHANGED');}
export function assertDeviceReservationResultV1(r){assert.equal(arguments.length,1);assert.equal(r.format,DEVICE_RESERVATION_RESULT_V1);assert.equal(r.profile,DEVICE_RESERVATION_PROFILE_V1);
 assert.equal(r.deviceOwnerUSNodeAcceptance,true);assert.equal(r.proofs.length,3);assert.deepEqual(r.proofs.map(x=>x.relation),['deposit_balance','authorization','reservation']);
 // Original D26 checks apply to its retained HISTORICAL D26 receipt, plus the
 // same original runtime/owner closure. This projection issues no authority.
 assertDeviceDepositResultV1({...r,format:DEVICE_DEPOSIT_RESULT_V1,profile:DEVICE_DEPOSIT_PROFILE_V1,proofs:r.proofs.slice(0,1),
  cleanup:{...r.cleanup,mobileListeners:r.cleanup.mobileListeners.slice(0,1)}});
 for(const p of r.proofs.slice(1)){const e=p.evidence;assertBtcSolGraphProofReceipts({relation:p.relation,runId:e.runId,jobId:e.jobId,
  manifest:e.manifest,result:e.result,resources:e.resources,proofSHA256:p.proofSHA256,publicInputsSHA256:p.publicInputsSHA256,
  manifestSHA256:e.manifestSHA256,resultSHA256:e.resultSHA256,resourcesSHA256:e.resourcesSHA256});
  assert.equal(e.keySHA256,r.artifacts.graphKeys[p.relation]);assert.ok(p.relation==='authorization'?e.result.threads===12:[4,12].includes(e.result.threads));}
 const s=r.deviceReservation,c=r.deviceCustody;assert.equal(s.sameOriginalD26Opening,true);assert.equal(s.noLinuxAdoption,true);
 assert.equal(s.observation.sourceCommitment,r.deviceNote.localCommitment);assert.equal(s.observation.sourceNullifier,r.deviceNote.observation.nullifier);
 assert.equal(s.observation.changeCommitment,s.statement.changeCommitment);assert.equal(s.observation.reserveCommitment,s.statement.reserveCommitment);
 assert.equal(s.receipt.transactionHash,'0x'+s.observation.transactionHash);assert.equal(s.receipt.blockHash,'0x'+s.observation.blockHash);assert.equal(s.receipt.status,'0x1');
 assert.equal(s.originalReservationWireCount,1);for(const k of ['freshObservationRepeatedWithoutEffects','proofReplayRejected','reserveReplayRejected'])assert.equal(s[k],true);
 assert.ok([200,504].includes(s.proofHttp.status));assert.equal(s.proofHttp.admittedPosts,1);assert.equal(s.proofHttp.clientUnknown,true);assert.equal(s.proofHttp.automaticRetry,false);
 assert.equal(c.encryptedReadbackBeforeU,true);assert.equal(c.reopenedBeforeS,true);assert.equal(c.sameSourceCommitment,r.deviceNote.localCommitment);
 assert.equal(c.changeCommitment,s.statement.changeCommitment);assert.equal(c.recoveryCommitment,s.statement.recoveryCommitment);
 assert.equal(c.originalSReceiptEncrypted,true);assert.equal(c.reopenedAfterS,true);assert.equal(c.repeatedSLocalWrites,0);
 assert.equal(c.sameSourceNullifier,r.deviceNote.observation.nullifier);assert.equal(c.changeFreeBalance,null);assert.equal(c.recoveryFreeBalance,null);
 for(const e of [c.beforeU,c.afterReopen,c.afterOriginalS,c.afterSReopen]){assert.equal(e.nodeAesGcm,true);assert.equal(e.nodeCryptographicEntropy,true);assert.equal(e.ciphertextPersisted,true);
  assert.ok(e.maximumStoredValueBytes<=2048);assert.equal(e.secureStoreHardware,false);assert.equal(e.biometricHardware,false);assert.equal(e.rootPersistedToFile,false);}
 assert.deepEqual(r.economics,{deviceAmountAtomic:'500',reservedAtomic:'100',changeAtomic:'400',recoveryAtomic:'100',recoveryIsSubsetOfReserve:true,
  receiverFinancialTransactions:2,poolActualAtomic:'500',poolBackedAtomic:'500',sourceSpent:true,linuxOwnerAvailableAtomic:'0',nativeDeliveryTransactions:0});
 assert.equal(r.cleanup.mobileListeners.length,2);for(const row of r.cleanup.mobileListeners){assert.equal(row.closed,true);assert.equal(row.ownedSocketsRemaining,0);assert.equal(row.originalDiagnosticsInFlight,0);}
 for(const k of ['closedDeviceRecipient','closedDeviceProvider','syntheticDeviceCiphertextRemoved'])assert.equal(r.cleanup[k],true);
 return{deviceOwnerUSNodeAcceptance:true,deviceOwnerD26NodeAcceptance:true,mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,
  mobilePortfolioEstablished:false,physicalPhoneEstablished:false,nativeGraphAcceptance:false,fullWalletAcceptance:false};}
