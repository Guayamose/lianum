/** Fixed original mobile SOURCE continuation after two unclosed backend exits, with the same durable ARM. */
import assert from 'node:assert/strict';
import {assertNativeEconomicNoteReceiptV1,NOTE_NATIVE_LINEAGE_V1} from '@lianum/proofs/execution/note-native-execution-v1';
import {validateOriginalWalletEconomicStateV1,ORIGINAL_ECONOMIC_STATE_V1} from '../../../../packages/mobile-protocol/src/original-wallet-economic-state-v1.mjs';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
export const NATIVE_SOURCE_ABRUPT_PROFILE_V1='native-original-source-abrupt-v1';
export const NATIVE_SOURCE_ABRUPT_RESULT_V1='LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_RESULT_V1';
const sourceReview='SOURCE_REVIEWED_ORIGINAL_SOURCE_ABRUPT_V1';
export function assertNativeSourceAbruptReleaseV1(){assert.equal(arguments.length,0);assert.equal(sourceReview,'SOURCE_REVIEWED_ORIGINAL_SOURCE_ABRUPT_V1','NATIVE_SOURCE_ABRUPT_RELEASE_NOT_REVIEWED');}
export function assertNativeSourceAbruptResultV1(r){
 assert.equal(arguments.length,1);assert.equal(r.format,NATIVE_SOURCE_ABRUPT_RESULT_V1);assert.equal(r.profile,NATIVE_SOURCE_ABRUPT_PROFILE_V1);
 for(const k of ['success','sourceUnchanged','sourceAbruptRestartNodeAcceptance','sourceArmedAbruptRestartEstablished','sourceEconomicStateAbruptRestartEstablished','sourceMobileStateCoherenceEstablished','nativeProcessRestartEstablished','localOnly','fakeFundsOnly'])assert.equal(r[k],true,k);
 for(const k of ['interrupted','publicNetwork','nativeGraphAcceptance','keeperLossRecoveryEstablished','mobileNoteCustodyEstablished','tlsEstablished','reactRendererEstablished','physicalPhoneEstablished','mobilePortfolioEstablished','independentInfrastructureEstablished','fullWalletAcceptance','postCutoffRecoveryEstablished'])assert.equal(r[k],false,k);
 assert.equal(r.phase,'completed');assert.equal(r.nativeDeliveryCount,0);assert.equal(r.nativeExecution,'ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1');
 assert.deepEqual(r.proofs.map(p=>[p.relation,p.publicWords]),[['deposit_balance',26],['authorization',16],['reservation',58]]);assert.equal(new Set(r.proofs.map(p=>p.proofSHA256)).size,3);
 const d=r.proofs[0],e=d.evidence;assert.equal(d.amountAtomic,'500');assert.equal(e.keySHA256,r.artifacts.noteKeys.deposit_balance);
 for(const [k,v]of Object.entries(NOTE_NATIVE_LINEAGE_V1.deposit_balance))assert.equal(e[k],v);
 assert.equal(e.phase,'completed');assert.equal(e.acceptedResult,true);assert.equal(e.resourceReceiptCompleted,true);assert.deepEqual(e.exit,{code:0,signal:null});assertNativeEconomicNoteReceiptV1('deposit_balance',e.worker,e);
 assert.equal(e.worker.proofSHA256,d.proofSHA256);assert.equal(e.worker.publicInputsSHA256,d.publicInputsSHA256);
 for(const p of r.proofs.slice(1)){const q=p.evidence;assert.equal(q.keySHA256,r.artifacts.graphKeys[p.relation]);assertBtcSolGraphProofReceipts({relation:p.relation,runId:q.runId,jobId:q.jobId,manifest:q.manifest,result:q.result,resources:q.resources,proofSHA256:p.proofSHA256,publicInputsSHA256:p.publicInputsSHA256,manifestSHA256:q.manifestSHA256,resultSHA256:q.resultSHA256,resourcesSHA256:q.resourcesSHA256});}
 const c=r.crash,b=r.birth.initial,o=r.reopen.initial,a=r.arm;
 assert.deepEqual(c.exit,{code:17,signal:null});assert.equal(c.intendedExitCode,17);for(const k of ['orderedCaptureCalled','originalCloseCalled','signalDeliveryObserved'])assert.equal(c[k],false,k);
 for(const k of ['allOriginalProcessesAbsent','parentVaultRetained'])assert.equal(c[k],true,k);assert.equal(c.configuredKernelParentDeathSignal,'SIGTERM');
 assert.equal(c.before.process.pid,b.process.pid);assert.notEqual(o.process.pid,b.process.pid);assert.ok(o.sourceGeneration>b.sourceGeneration);
 assert.deepEqual(o.descriptor,b.descriptor);assert.deepEqual(o.ledger,c.before.ledger);assert.deepEqual(o.counts,c.before.counts);
 for(const row of [b,o,c.before]){assert.equal(row.capsule.phase,'CONFIRMED');assert.equal(row.capsule.pending,false);assert.equal(row.linuxSourceStatus,'UNISSUED');assert.equal(row.linuxAvailable,'0');}
 assert.equal(c.before.ledger.publicState.backedAmount,'500');assert.equal(c.before.ledger.commitments.length,1);assert.equal(c.before.ledger.nullifiers.length,0);
 assert.equal(r.deposit.observation.commitment,r.deposit.commitment);assert.equal(r.deposit.observation.amount,'500');
 assert.equal(r.reservation.observation.sourceCommitment,r.deposit.commitment);assert.equal(r.reservation.observation.sourceNullifier,r.deposit.observation.nullifier);
 assert.equal(a.firstFreshPermission,true);assert.equal(a.noEarlyF,true);assert.equal(a.permission.state,'ARMED');assert.equal(a.read.armSHA256,a.permission.armSHA256);assert.equal(a.final.arm.armSHA256,a.permission.armSHA256);
 assert.equal(a.final.arm.jobId,r.reservation.jobId);assert.equal(a.final.arm.settleBefore,r.reservation.statement.settleBefore);assert.equal(a.final.arm.terminalOutcome,null);assert.equal(a.final.status.outcome,null);
 assert.ok(BigInt(a.final.head.timestamp)<BigInt(a.final.arm.settleBefore));assert.equal(a.final.counts.native,b.counts.native);assert.equal(a.final.counts.receiver,b.counts.receiver+2);
 assert.equal(a.final.ownerView.balances.available,'0');assert.equal(a.final.linuxSummary.notes.source.status,'UNISSUED');
 const ac=r.armedCrash,ao=r.armedReopen.initial,ar=r.armedObservation;
 assert.deepEqual(ac.exit,{code:17,signal:null});assert.equal(ac.intendedExitCode,17);
 for(const k of ['orderedCaptureCalled','originalCloseCalled','signalDeliveryObserved'])assert.equal(ac[k],false,k);
 for(const k of ['allOriginalProcessesAbsent','parentVaultRetained'])assert.equal(ac[k],true,k);assert.equal(ac.configuredKernelParentDeathSignal,'SIGTERM');
 assert.equal(ac.before.process.pid,o.process.pid);assert.notEqual(ao.process.pid,o.process.pid);assert.notEqual(ao.process.pid,b.process.pid);assert.ok(ao.sourceGeneration>o.sourceGeneration);
 assert.deepEqual(ao.descriptor,o.descriptor);assert.deepEqual(ao.snapshot.ledger,ac.before.snapshot.ledger);assert.deepEqual(ao.snapshot.counts,ac.before.snapshot.counts);
 for(const point of [ac.before,ao]){assert.equal(point.capsule.phase,'CONFIRMED');assert.equal(point.capsule.pending,false);assert.equal(point.snapshot.arm.armSHA256,a.permission.armSHA256);assert.equal(point.snapshot.arm.state,'ARMED');assert.equal(point.snapshot.arm.settleBefore,a.permission.settleBefore);assert.equal(point.snapshot.status.outcome,null);assert.ok(BigInt(point.snapshot.head.timestamp)<BigInt(point.snapshot.arm.settleBefore));}
 assert.equal(ar.originalPermissionRetained,true);assert.equal(ar.noNewProofKeyOrSend,true);assert.equal(ar.arm.armSHA256,a.permission.armSHA256);assert.equal(ar.arm.state,'ARMED');
 assert.equal(ar.final.arm.armSHA256,a.permission.armSHA256);assert.deepEqual(ar.final.ledger,a.final.ledger);assert.deepEqual(ar.final.counts,a.final.counts);assert.ok(BigInt(ar.final.head.timestamp)<BigInt(ar.final.arm.settleBefore));
 assert.equal(ar.outputs.nativeOutcome,null);assert.equal(ar.outputs.parentJobId,r.reservation.jobId);assert.equal(ar.outputs.reservationTransactionHash,r.reservation.observation.transactionHash);
 assert.deepEqual([ar.outputs.change.amount,ar.outputs.change.state,ar.outputs.recovery.amount,ar.outputs.recovery.state],['400','UNSPENT','100','LOCKED']);
 const state=r.economicState,birthState=state.birth,points=[birthState,...['d26','armed'].flatMap(name=>[state[name].before,state[name].opened,state[name].fresh])];
 const birthRoutes=birthState.value.rows.map(row=>row.route);
 for(const point of points){const value=validateOriginalWalletEconomicStateV1(point.value),q=point.checkpoint;
  assert.equal(value.storageAvailable,true);assert.equal(q.version,1);assert.equal(q.profile,ORIGINAL_ECONOMIC_STATE_V1);
  assert.equal(value.lifetime,birthState.value.lifetime);assert.equal(q.lifetime,value.lifetime);assert.equal(q.revision,value.revision);
  assert.equal(q.sourceSetSHA256,birthState.checkpoint.sourceSetSHA256);assert.match(q.stateSHA256,/^[0-9a-f]{64}$/);
  assert.deepEqual(value.rows.map(row=>row.route),birthRoutes);assert.ok(value.rows.length>0);
  for(const row of value.rows){assert.equal(row.component,'NATIVE_NOTE');
   if(row.requests.some(request=>['PREPARED','UNKNOWN'].includes(request.state))){assert.notEqual(row.state,'LIVE');assert.equal(row.balances,null);}}
 }
 for(const name of ['d26','armed']){const v=state[name];assert.deepEqual(v.opened.checkpoint,v.before.checkpoint);
  assert.equal(v.opened.value.observedAt,null);assert.ok(v.opened.value.rows.every(row=>row.state!=='LIVE'&&row.balances===null));
  assert.ok(v.fresh.checkpoint.revision>=v.opened.checkpoint.revision);}
 const mobile=state.mobile;
 for(const value of Object.values(mobile)){assert.equal(value.version,1);assert.equal(value.readOnly,true);assert.equal(value.completePortfolio,false);assert.equal(value.aggregateBalance,null);}
 for(const value of [mobile.sourceBefore,mobile.sourceAfter]){assert.equal(value.rows.length,1);const row=value.rows[0];
  assert.equal(row.route.component,'DEVICE_NATIVE_SOURCE');assert.equal(row.route.rootId,ar.outputs.rootId);assert.equal(row.route.depositJobId,r.deposit.jobId);
  assert.equal(row.available,'500');assert.equal(row.noteAmount,'500');assert.equal(row.custody,'DEVICE');}
 for(const value of [mobile.outputsBefore,mobile.outputsAfter]){assert.equal(value.rows.length,2);
  for(const role of ['change','recovery']){const row=value.rows.find(row=>row.route.noteRole===role);assert.ok(row);assert.equal(row.route.component,'DEVICE_NATIVE_NOTE');
   assert.equal(row.route.rootId,ar.outputs.rootId);assert.equal(row.route.parentJobId,r.reservation.jobId);assert.equal(row.route.commitment,ar.outputs[role].commitment);
   assert.equal(row.noteAmount,role==='change'?'400':'100');assert.equal(row.available,role==='change'?'400':null);assert.equal(row.locked,role==='recovery'?'100':null);assert.equal(row.custody,'DEVICE');}
 }
 assert.deepEqual(mobile.invalidated.rows.map(row=>row.route),mobile.outputsBefore.rows.map(row=>row.route));
 assert.ok(mobile.invalidated.rows.every(row=>row.state==='STALE'&&row.available===null&&row.locked===null));
 assert.deepEqual(mobile.outputsAfter.rows.map(row=>row.route),mobile.outputsBefore.rows.map(row=>row.route));
 assert.deepEqual(r.economics,{amountAtomic:'500',changeAtomic:'400',recoveryAtomic:'100',receiverFinancialWires:2,nativeDeliveryWires:0,poolBackedAtomic:'500'});
 assert.equal(r.tlsVersion,'TLSv1.3');assert.equal(r.mobileCustody.nodeAesGcm,true);assert.equal(r.mobileCustody.nodeCryptographicEntropy,true);assert.equal(r.mobileCustody.ciphertextPersisted,true);
 for(const k of ['rootPersistedToFile','secureStoreHardware','biometricHardware'])assert.equal(r.mobileCustody[k],false,k);
 assert.deepEqual(r.cleanup.errors,[]);for(const k of ['closedEvm','closedNativeEvm','closedNativeExecution','closedBackend','closedMobileVault','closedMobileHost'])assert.equal(r.cleanup[k],true,k);
 assert.equal(r.cleanup.backend.report.closed,true);assert.equal(r.cleanup.backend.report.originalResourcesStopped,true);
 return{sourceAbruptRestartNodeAcceptance:true,sourceArmedAbruptRestartEstablished:true,sourceEconomicStateAbruptRestartEstablished:true,sourceMobileStateCoherenceEstablished:true,nativeProcessRestartEstablished:true,nativeDeliveryCount:0,nativeGraphAcceptance:false,keeperLossRecoveryEstablished:false,mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,physicalPhoneEstablished:false,mobilePortfolioEstablished:false,independentInfrastructureEstablished:false,fullWalletAcceptance:false,postCutoffRecoveryEstablished:false};
}
