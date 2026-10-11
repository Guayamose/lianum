/** HOST metadata regression for the original recovery callback. No proof,
 * resource receipt, custody or financial authority is created by this fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILE,SETTINGS,CATALOG} from '@lianum/proofs/catalog';
import {PROVING_LIMITS} from '../../../../packages/proofs/src/jobs/proving-execution.mjs';
import {assertBtcSolGraphProofReceipts,DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS} from './development-btc-sol-graph-proof-evidence.mjs';

function fixture(){
 const runId='01234567-89ab-4def-8abc-0123456789ab',jobId='12345678-9abc-4def-8abc-123456789abc';
 const proofSHA256='12'.repeat(32),publicInputsSHA256='34'.repeat(32),runtimePinsSHA256='56'.repeat(32),keyManifestSHA256='78'.repeat(32);
 const common={profile:PROFILE,relation:'recovery',runId,jobId};
 const manifest={...common,format:'FLAT_WALLET_PUBLIC_PROOF_V1',role:CATALOG.recovery.role,publicWords:41,settings:SETTINGS,
  selfVerified:true,proofSHA256,publicInputsSHA256,sourceVersion:'9a'.repeat(32),keySHA256:'bc'.repeat(32),target:'evm',runtimePinsSHA256,keyManifestSHA256};
 const result={...manifest,format:'FLAT_WALLET_WORKER_ATTEMPT_V1',threads:4,limits:PROVING_LIMITS,mode:'prove',phase:'completed',
  keyRecomputed:false,hostLimitsChanged:false,proofGenerated:true,wasmThreadExecution:{threads:4,sharedMemory:true,oneOwnedProcess:true,originalPreparedKeyRequired:true}};
 const resources={...common,format:'FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1',limits:PROVING_LIMITS,mode:'prove',phase:'completed',
  runtimePinsSHA256,peakWorkerRSS:1024,exitCode:0,signal:null,failure:null,failures:[],lockPreserved:false,hostLimitsChanged:false};
 return{relation:'recovery',runId,jobId,manifest,result,resources,proofSHA256,publicInputsSHA256,
  manifestSHA256:'de'.repeat(32),resultSHA256:'ef'.repeat(32),resourcesSHA256:'01'.repeat(32)};
}
test('the original F41 receipt can pass the callback without changing the seven successful graph relations',()=>{
 assert.deepEqual(DEVELOPMENT_BTC_SOL_GRAPH_RELATIONS,['authorization','reservation','dependency','ready','admission','node','settlement']);
 assert.equal(CATALOG.recovery.publicWords,41);
 const checked=assertBtcSolGraphProofReceipts(fixture());assert.equal(checked.relation,'recovery');assert.equal(checked.selfVerified,true);
});
test('recovery still rejects crossed roles, inputs, sources, keys and failed guards',()=>{
 for(const mutate of [
  row=>{row.relation='caller-selected';},row=>{row.manifest.role='local';},row=>{row.result.role='local';},
  row=>{row.manifest.publicWords=40;},row=>{row.result.publicWords=40;},row=>{row.result.relation='settlement';},
  row=>{row.result.selfVerified=false;},row=>{row.resources.runtimePinsSHA256='23'.repeat(32);},
  row=>{row.manifest.keyManifestSHA256='23'.repeat(32);},row=>{row.result.keySHA256='23'.repeat(32);},
  row=>{row.result.threads=12;},row=>{row.resources.peakWorkerRSS=PROVING_LIMITS.workerRSS+1;},
  row=>{row.resources.phase='failed';},row=>{row.resources.failure='PW_RESOURCE_MONITOR_FAILED';},
  row=>{row.resources.lockPreserved=true;},row=>{row.resources.exitCode=1;},row=>{row.result.cleanupErrorCode='PW_NATIVE_ORIGINAL_CLOSE_REJECTED';},
 ]){const row=structuredClone(fixture());mutate(row);assert.throws(()=>assertBtcSolGraphProofReceipts(row));}
});
