/** Original system construction and one-use cold recovery, owned by the backend. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const fresh=()=>randomBytes(32).toString('hex');
import {assertWrappedWalletCompositionReleaseV1 as released} from './wrapped-composition-release-v1.mjs';
export async function createWrappedWalletAcceptanceSystemV1(input) {
  assert.equal(arguments.length, 1); released();
  const { exactRecord, fixedArray } = await import('@lianum/components/encoding/commitments');
  exactRecord(input, ['runtime','nativeRuntimes','graphNativeRuntimes','journalRoot']); fixedArray(input.nativeRuntimes, 2);
  const { createWrappedClaimCustodyBootstrapV1, revokeWrappedClaimCustodyBootstrapV1 } = await import('../../../operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');
  const { createWrappedClaimOperatorBootstrapV1 } = await import('../../../operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs');
  const { deployWrappedClaimGraphSystemV1 } = await import('../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs');
  const custodyBootstrap = await createWrappedClaimCustodyBootstrapV1({runtime:input.runtime,nativeRuntimes:input.nativeRuntimes,journalRoot:input.journalRoot});
  let bootstrap;
  try {
    bootstrap = await createWrappedClaimOperatorBootstrapV1({runtime:input.runtime,nativeRuntimes:input.graphNativeRuntimes,custodyBootstrap});
    const system = await deployWrappedClaimGraphSystemV1({runtime:input.runtime,options:{deploymentDomain:'0x'+fresh(),registryEpoch:'1',
      pools:[0,1].map(()=>({policy:'0x'+fresh(),deploymentDomain:'0x'+fresh()})),bootstrap,custodyBootstrap}});
    return Object.freeze({system,bootstrap,custodyBootstrap});
  } catch (error) {
    // The deployer may refuse before entering its own cleanup try. Retain
    // ownership here until success, then close/revoke only original resources.
    // Failed native allocations remain reserved; there is no replacement/retry.
    const failures=[];try{bootstrap?.close();}catch(cause){failures.push(cause);}
    try{revokeWrappedClaimCustodyBootstrapV1(input.runtime,custodyBootstrap);}catch(cause){failures.push(cause);}
    if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_ACCEPTANCE_BOOTSTRAP_CLEANUP_INCOMPLETE',{cause:error});
    throw error;
  }
}
// Each subsystem token is private, one-use, and valid only during the original
// authority's ordered system reopen. There is no public issue-token operation.
const systemRecoveryPartsV1=new WeakMap();
export function consumeWrappedSystemRecoveryPartV1(token,part) {
  assert.equal(arguments.length,2);const entry=systemRecoveryPartsV1.get(token);
  assert.ok(entry&&entry.part===part&&!entry.used&&entry.active,'WRAPPED_RECOVERY_SYSTEM_PART_TOKEN');entry.used=true;return entry.value;
}
async function withSystemRecoveryPartV1(part,value,work) {
  const token=Object.freeze(Object.create(null)),entry={part,value,used:false,active:true};systemRecoveryPartsV1.set(token,entry);
  try {const result=await work(token);assert.equal(entry.used,true,'WRAPPED_RECOVERY_SYSTEM_PART_UNUSED');return result;}
  finally {entry.active=false;systemRecoveryPartsV1.delete(token);}
}
export async function retainWrappedWalletSystemForReopenV1(input) {
  assert.equal(arguments.length,1);released();
  const {exactRecord}=await import('@lianum/components/encoding/commitments');
  exactRecord(input,['runtime','system','bootstrap','custodyBootstrap','attemptAuthority']);
  const {runtime,system,bootstrap,custodyBootstrap,attemptAuthority}=input;
  const op=await import('../../../operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs');
  const custody=await import('../../../operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');
  const contracts=await import('../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs');
  op.assertWrappedClaimOperatorBootstrapForSystemV1(bootstrap,{runtime,system});
  op.assertWrappedClaimOperatorCustodyBootstrapV1(bootstrap,{runtime,custodyBootstrap});
  try {
  op.fenceWrappedClaimOperatorBootstrapRecoveryV1(bootstrap);
  const record={schema:'WRAPPED_WALLET_SYSTEM_RECOVERY_V1',
    custody:custody.captureWrappedClaimCustodyBootstrapRecoveryV1(runtime,custodyBootstrap),
    contracts:await contracts.captureWrappedClaimGraphSystemRecoveryV1(runtime,system),
    operators:await op.captureWrappedClaimOperatorBootstrapRecoveryV1(bootstrap)};
  await contracts.assertCapturedWrappedClaimSystemUnchangedV1(runtime,system,record.contracts);
  const {retainOriginalWrappedRecoverySectionV1}=await import('./wrapped-recovery-authority-v1.mjs');
  await retainOriginalWrappedRecoverySectionV1(attemptAuthority,'system',record);
  // Operator capture irreversibly fences original signing before its first
  // await. A failed durable write stays fenced. A failed close leaves this
  // section RETAINED, never falsely CAPTURED or reopenable.
  await bootstrap.close();custody.revokeWrappedClaimCustodyBootstrapV1(runtime,custodyBootstrap);
  return {retained:true,originalResourcesStopped:true};
  }catch(error){
    const failures=[];try{await bootstrap.close();}catch(e){failures.push(e);}
    try{custody.revokeWrappedClaimCustodyBootstrapV1(runtime,custodyBootstrap);}catch(e){failures.push(e);}
    if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_RECOVERY_SYSTEM_CAPTURE_CLEANUP_FAILED',{cause:error});throw error;
  }
}
export async function reopenWrappedWalletAcceptanceSystemV1(input) {
  assert.equal(arguments.length,1);released();
  const {exactRecord,fixedArray}=await import('@lianum/components/encoding/commitments');
  exactRecord(input,['runtime','nativeRuntimes','graphNativeRuntimes','attemptAuthority']);fixedArray(input.nativeRuntimes,2);
  const {consumeOriginalWrappedRecoverySectionV1}=await import('./wrapped-recovery-authority-v1.mjs');
  const record=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'system');
  exactRecord(record,['schema','custody','contracts','operators']);assert.equal(record.schema,'WRAPPED_WALLET_SYSTEM_RECOVERY_V1');
  const custody=await import('../../../operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');
  const op=await import('../../../operations/operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs');
  const contracts=await import('../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs');
  const {runtime}=input;let custodyBootstrap,bootstrap;
  try {
    custodyBootstrap=await withSystemRecoveryPartV1('custody',{runtime,nativeRuntimes:input.nativeRuntimes,record:record.custody},token=>custody.reopenWrappedClaimCustodyBootstrapRecoveryV1(token));
    bootstrap=await withSystemRecoveryPartV1('operators',{runtime,nativeRuntimes:input.graphNativeRuntimes,custodyBootstrap,record:record.operators},token=>op.reopenWrappedClaimOperatorBootstrapRecoveryV1(token));
    const system=await withSystemRecoveryPartV1('contracts',{runtime,bootstrap,custodyBootstrap,record:record.contracts},token=>contracts.reopenWrappedClaimGraphSystemRecoveryV1(token));
    return Object.freeze({system,bootstrap,custodyBootstrap});
  } catch(error) {
    const failures=[];if(bootstrap)try{await bootstrap.close();}catch(e){failures.push(e);}
    if(custodyBootstrap)try{custody.revokeWrappedClaimCustodyBootstrapV1(runtime,custodyBootstrap);}catch(e){failures.push(e);}
    if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_RECOVERY_SYSTEM_REOPEN_CLEANUP_FAILED',{cause:error});throw error;
  }
}
