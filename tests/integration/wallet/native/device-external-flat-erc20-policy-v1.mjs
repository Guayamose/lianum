/** Fixed local software-mobile vertical. Reports never issue capabilities. */
import assert from 'node:assert/strict';
import {basename,dirname,join} from 'node:path';
import {ROOT,GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
import {PRIVATE_RESOURCE_POLICY} from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import {NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1} from './native-device-economic-process-scope-v1.mjs';
export const DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1='device-external-flat-erc20-v1';
export const DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1='LIANUM_DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1';
// Root enables a reviewed literal only after the original producer contracts
// and complete source capsule are reviewed. No argument/environment selector.
export const DEVICE_EXTERNAL_FLAT_ERC20_RELEASE_V1=Object.freeze({format:'REVIEWED_ORIGINAL_DEVICE_EXTERNAL_FLAT_ERC20_RELEASE_V1',profile:DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1,amountAtomic:'500',relations:Object.freeze(['deposit_balance','withdraw_balance']),localOnly:true,fakeFundsOnly:true,publicNetwork:false,physicalPhone:false});
export function assertDeviceExternalFlatErc20ReleaseV1(){assert.equal(arguments.length,0);
 assert.deepEqual(DEVICE_EXTERNAL_FLAT_ERC20_RELEASE_V1,{format:'REVIEWED_ORIGINAL_DEVICE_EXTERNAL_FLAT_ERC20_RELEASE_V1',profile:DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1,
  amountAtomic:'500',relations:['deposit_balance','withdraw_balance'],localOnly:true,fakeFundsOnly:true,publicNetwork:false,physicalPhone:false},'DEVICE_EXTERNAL_FLAT_RELEASE_PENDING');}
export function classifyDeviceExternalFlatErc20ProcessV1(argv,executable,parent){assert.equal(arguments.length,3);
 const unexpected=()=>({role:'device-external-flat-unexpected-process',proofWorker:true});
 if(executable!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1&&argv?.[0]!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1)
  return basename(executable??'')==='anvil'||basename(argv?.[0]??'')==='anvil'?unexpected():null;
 const fixedParent=parent&&Array.isArray(parent.argv)&&parent.argv.length===2&&parent.argv[0]===process.execPath&&parent.argv[1]===join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs');
 if(!fixedParent||executable!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||!Array.isArray(argv)||argv.length!==20)return unexpected();
 const fixed=[[0,NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1],[1,'--host'],[2,'127.0.0.1'],[3,'--port'],[5,'--chain-id'],[6,'31337'],[7,'--hardfork'],[8,'cancun'],[9,'--timestamp'],[10,'1900000210'],[11,'--accounts'],[12,'0'],[13,'--init'],[15,'--quiet'],[16,'--no-cors'],[17,'--no-mining'],[18,'--gas-limit'],[19,'30000000']];
 if(fixed.some(([i,v])=>argv[i]!==v)||/^[1-9][0-9]{0,4}$/.exec(argv[4])?.[0]!==argv[4]||Number(argv[4])>65535)return unexpected();
 const directory=dirname(argv[14]);if(dirname(directory)!==join(GOLDEN,'.local/integrations')||/^flat-economic-receiver-v2-[A-Za-z0-9]{6}$/.exec(basename(directory))?.[0]!==basename(directory)||argv[14]!==join(directory,'native-economic-genesis-v2.json'))return unexpected();
 return{role:'evm-runtime',proofWorker:false};
}
export function assertDeviceExternalFlatErc20ResultV1(result){assert.equal(arguments.length,1);
 assert.equal(result.format,DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1);assert.equal(result.profile,DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1);
 for(const k of ['success','sourceUnchanged','localOnly','fakeFundsOnly','originalDeviceExternalFlatNodeAcceptance'])assert.equal(result[k],true,k);
 assert.equal(result.phase,'completed');assert.equal(result.interrupted,false);assert.equal(result.nativeExecution,null);assert.equal(result.nativeDeliveryCount,0);
 for(const k of ['publicNetwork','physicalPhoneEstablished','secureStoreHardwareEstablished','biometricHardwareEstablished','reactRendererEstablished','newBackendRecoveryEstablished','graphAcceptance','fullWalletAcceptance'])assert.equal(result[k],false,k);
 assert.deepEqual(result.proofs.map(p=>p.relation),['deposit_balance','withdraw_balance']);
 for(const [i,p]of result.proofs.entries()){assert.equal(p.label,i?'device-external-flat-w39':'device-external-flat-d26');assert.equal(p.publicWords,i?39:26);assert.equal(p.amountAtomic,'500');
  const e=p.evidence;assert.deepEqual(e.policy,PRIVATE_RESOURCE_POLICY);assert.equal(e.phase,'completed');assert.equal(e.acceptedResult,true);assert.equal(e.resourceReceiptCompleted,true);assert.equal(e.zeroKnowledgeEnabled,true);
  assert.equal(e.threads,1);assert.equal(e.maximumPages,32768);assert.equal(e.worker.threads,1);assert.equal(e.worker.maximumPages,32768);assert.equal(e.worker.verified,true);assert.equal(e.worker.zeroKnowledgeEnabled,true);assert.deepEqual(e.exit,{code:0,signal:null});
  assert.equal(e.keySHA256,result.artifacts.noteKeys[p.relation]);assert.equal(e.worker.keySHA256,e.keySHA256);assert.equal(e.worker.proofSHA256,p.proofSHA256);assert.equal(e.worker.publicInputsSHA256,p.publicInputsSHA256);
  assert.equal(p.rawTelemetrySHA256,p.retainedTelemetrySHA256);assert.equal(p.actualProofChildGone,true);}
 assert.equal(result.assetMetadata.kind,'ERC20');assert.equal(result.assetMetadata.decimals,6);
 const n=result.deviceNote;assert.equal(n.amountAtomic,'500');assert.equal(n.sourceOpeningUnchanged,true);assert.equal(n.transportKeyDifferentFromNoteKey,true);assert.equal(n.privateSigningKeyAbsentFromWitness,true);
 assert.equal(n.deposit.mode,'deposit_balance');assert.equal(n.withdrawal.mode,'withdraw_balance');assert.equal(n.deposit.stage,'CONFIRMED');assert.equal(n.withdrawal.stage,'CONFIRMED');
 assert.equal(n.deposit.observation.commitment,n.commitment);assert.equal(n.withdrawal.observation.commitment,n.commitment);assert.equal(n.withdrawal.consentFields.depositJobId,n.deposit.jobId);
 assert.equal(n.deposit.observation.amount,'500');assert.equal(n.withdrawal.observation.amount,'500');assert.equal(n.originalFinancialWireCount,2);assert.equal(n.originalFinancialReceiptCount,2);
 for(const k of ['actualFundReplyDiscarded','actualExitReplyDiscarded','sameJobReconciliation','duplicateSdkRejectedBeforePost','duplicateOriginalPermissionRejected','noAutomaticRetry','canonicalReceiptsJoined','sourceNullifierSpent','poolUnfundedAfterExit','recipientDeltaExact'])assert.equal(n[k],true,k);
 assert.equal(n.poolBackingAfterFund,'500');assert.equal(n.poolBackingAfterExit,'0');assert.equal(n.recipientDeltaAtomic,'500');
 const h=result.mobileHost;assert.equal(h.nodeAesGcm,true);assert.equal(h.nodeCryptographicEntropy,true);assert.equal(h.ciphertextPersisted,true);assert.equal(h.rootPersistedToFile,false);assert.equal(h.notePrivateKeyPersistedPlaintext,false);assert.equal(h.secureStoreHardware,false);assert.equal(h.biometricHardware,false);assert.ok(h.maximumStoredValueBytes<=2048);
 for(const k of ['closedDeviceService','closedMobileVault','closedMobileHost','closedEvm','setupOperatorsClosed'])assert.equal(result.cleanup[k],true,k);
 assert.equal(result.cleanup.errors.length,0);assert.equal(result.cleanup.service.closed,true);assert.equal(result.cleanup.service.ownedSocketsRemaining,0);assert.equal(result.cleanup.service.originalOperationsInFlight,0);
 assert.equal(result.cleanup.host.ownedTlsSocketsRemaining,0);assert.equal(result.cleanup.evm.status.stopped,true);assert.equal(result.cleanup.evm.status.scratchRemoved,true);assert.equal(result.cleanup.evm.status.exitObserved,true);assert.equal(result.cleanup.evm.stop.stopped,true);assert.equal(result.cleanup.evm.stop.forced,false);
 assert.equal(result.cleanup.evm.stop.pid,result.cleanup.evm.status.pid);assert.equal(result.cleanup.evm.originalPIDAbsent,true);assert.equal(result.cleanup.evm.status.exitCode,0);assert.equal(result.cleanup.evm.status.signal,null);
 return{originalDeviceExternalFlatNodeAcceptance:true,physicalPhoneEstablished:false,graphAcceptance:false,newBackendRecoveryEstablished:false,fullWalletAcceptance:false};}
