/** Focal host/codec tests only. Every positive lower datum here is explicitly
 * synthetic. No node, owner, prover, compiler, RPC, signature or funding starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { encodeStatement } from '../../../../packages/backend/src/execution/encoding/statements.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { inspectNativeValueOriginalAdmissionReceipt } from '../../../../packages/backend/src/execution/native-value/preparation/native-value-graph-admission-v2.mjs';
import { decodeNativeWalletAdmissionCalldata, assertNativeWalletConservation } from './native-wallet-real-evidence-v1.mjs';
import { NATIVE_WALLET_PROOF_ROLES_V1, NATIVE_WALLET_REAL_RELEASE_V1, NATIVE_WALLET_UNFUNDED_RELEASE_V1 } from './native-wallet-real-policy-v1.mjs';
import { runNativeWalletRealAcceptance, runNativeWalletRealPreflight } from './native-wallet-real-driver-v1.mjs';
import { runNativeWalletRealAcceptanceSupervisor, runNativeWalletRealPreflightSupervisor,
  classifyNativeWalletRealExecutable, nativeProofProcessResources, nativeWalletUnfundedProcessFailure,
  NATIVE_FLOW_LIMITS, nativeResourceFailure } from '../../native/native-flow-supervisor.mjs';
const hex=n=>BigInt(n).toString(16).padStart(64,'0'),address='0x'+'12'.repeat(20);
const packet=(kind,statement,n)=>({proof:'ab'.repeat(n*32),publicInputs:[...encodeStatement(kind,statement)]});
function syntheticAdmission(){
  const p={domainCommitment:hex(1),authorizationRoot:hex(2),checkpoint:hex(3),readinessEvidenceState:hex(4),joinCommitment:hex(5),readyFrom:'100',readyUntil:'200'};
  const r={...p,readinessCommitment:hex(6)},i={...r,acceptedCheckpointRoot:hex(7),admissionRevocationState:hex(8),receiptLeaf:hex(9),admissionNullifier:hex(10),admissionFrom:'110',admissionUntil:'130'};
  return {pool:address,dependency:packet('dependency',p,1),readiness:packet('ready',r,2),admission:packet('admission',i,3),
    healthFrom:'110',healthUntil:'130',healthSignatures:[0,1,2].map(index=>({signerIndex:String(index),v:'27',r:'0x'+hex(index+1),s:'0x'+hex(index+2)}))};
}
const replaceWord=(data,at,value)=>data.slice(0,10+at*2)+hex(value)+data.slice(10+(at+32)*2);
test('synthetic fixed P42/R50/I84 calldata roundtrips exactly; grants no proof claim',()=>{
  const original=syntheticAdmission(),decoded=decodeNativeWalletAdmissionCalldata(encodeFlatTransaction('admit',original));
  assert.deepEqual(decoded.request,original);assert.equal(decoded.admission.receiptLeaf,hex(9));
});
for(const [name,mutate] of [
  ['wrong method',v=>'0x00000000'+v.slice(10)],['trailing bytes',v=>v+'00'.repeat(32)],
  ['tuple alias',v=>replaceWord(v,64,576)],['oversized offset',v=>replaceWord(v,32,2**30)],
  ['address padding',v=>replaceWord(v,0,1n<<200n)],['truncated tuple',v=>v.slice(0,-64)],
  ['wrong proof offset',v=>replaceWord(v,576,32)],['wrong public count',v=>replaceWord(v,576+128,41)],
])test('synthetic admission rejects '+name,()=>assert.throws(()=>decodeNativeWalletAdmissionCalldata(mutate(encodeFlatTransaction('admit',syntheticAdmission())))));
function receiptRecord(){return {phase:'mined',transactionHash:'0x'+hex(1),request:{to:address,data:'0x1234',value:'0x0'},
  receipt:{transactionHash:'0x'+hex(1),to:address,status:'0x1',blockHash:'0x'+hex(2),blockNumber:'0x1'}};}
test('synthetic owned-runtime nested receipt record, not flat receipt, is selected',()=>{
  const original=receiptRecord(),record=structuredClone(original);assert.deepEqual(inspectNativeValueOriginalAdmissionReceipt(record,original),original.receipt);
  assert.throws(()=>inspectNativeValueOriginalAdmissionReceipt(original.receipt,original));
});
for(const [name,mutate] of [
  ['missing nested receipt',v=>delete v.receipt],['changed calldata',v=>v.request.data='0xffff'],
  ['changed transaction',v=>v.transactionHash='0x'+hex(3)],['changed block',v=>v.receipt.blockHash='0x'+hex(4)],
  ['reverted receipt',v=>v.receipt.status='0x0'],['unmined record',v=>v.phase='broadcast'],
])test('synthetic original receipt rejects '+name,()=>{const original=receiptRecord(),record=structuredClone(original);mutate(record);assert.throws(()=>inspectNativeValueOriginalAdmissionReceipt(record,original));});
const conserved=()=>({sourceDeposit:'50000',sourceChange:'40000',solverPayout:'10000',sourcePoolBacked:'0',sourcePoolActual:'0',liveReservations:0,
  nativeRecipientBefore:'1000000',nativeRecipientAfter:'1100000',nativeSenderBefore:'1000000',nativeSenderAfter:'858000',nativeValue:'100000',nativeGasUsed:'21000',nativeGasPrice:'2'});
test('synthetic exact closure separates source custody, solver-native value and gas',()=>assert.equal(assertNativeWalletConservation(conserved()),true));
for(const key of ['sourceChange','solverPayout','sourcePoolBacked','sourcePoolActual','nativeRecipientAfter','nativeSenderAfter','nativeGasUsed'])
 test('synthetic conservation rejects altered '+key,()=>{const v=conserved();v[key]=String(BigInt(v[key])+1n);assert.throws(()=>assertNativeWalletConservation(v));});
test('both fixed worker and supervisor entry gates stop before any resource side effect',async()=>{
  assert.equal(NATIVE_WALLET_REAL_RELEASE_V1,null);assert.equal(NATIVE_WALLET_UNFUNDED_RELEASE_V1,null);
  for(const fn of [runNativeWalletRealAcceptance,runNativeWalletRealPreflight,runNativeWalletRealAcceptanceSupervisor,runNativeWalletRealPreflightSupervisor]){
    await assert.rejects(fn(),/RELEASE_ABSENT/);await assert.rejects(fn({runtime:{}}),/OPTIONS/);
  }
});
test('fixed native proof labels count I84 backend and role RSS under unchanged shared bounds',()=>{
  const worker=classifyNativeWalletRealExecutable(join(ROOT,'proof-workers/native-value-live-v2-worker.mjs'));
  const role=classifyNativeWalletRealExecutable(join(ROOT,'proof-workers/native-value-live-v2-role-process.mjs'));
  assert.deepEqual(worker,{role:'native-value-live-v2-proof-worker',proofWorker:true});
  assert.equal(classifyNativeWalletRealExecutable('/tmp/native-value-live-v2-worker.mjs'),null);
  assert.equal(classifyNativeWalletRealExecutable(join(ROOT,'proof-workers/native-value-live-v2-run-bounded.mjs')),null);
  const p=nativeProofProcessResources([{...worker,state:'R',rssBytes:100},{...role,state:'R',rssBytes:200}]);
  assert.deepEqual(p,{maximumProofWorkerRSSBytes:200,liveProofWorkers:1});
  assert.equal(nativeWalletUnfundedProcessFailure([{...worker,state:'Z'}]),'NATIVE_WALLET_UNFUNDED_PROOF_FORBIDDEN');
  assert.equal(nativeWalletUnfundedProcessFailure([{role:'native-value-owner-role',proofWorker:false}]),null);
  assert.equal(NATIVE_FLOW_LIMITS.totalMilliseconds,90*60*1000);
});
test('proof schedule is driver-derived D/U/S/P/R/native-I84/Nx4/T/W/W, no I36 or F invention',()=>{
  assert.deepEqual(NATIVE_WALLET_PROOF_ROLES_V1,[['deposit_balance',26],['authorization',16],['reservation',58],['dependency',42],['ready',50],
    ['admission_native_value_v2',84],['node',32],['node',32],['node',32],['node',32],['settlement',138],['withdraw_balance',39],['withdraw_balance',39]]);
});
test('fixed source ordering gates funds before all loaded and original checks, no arbitrary transports',()=>{
  const s=readFileSync(new URL('./native-wallet-real-driver-v1.mjs',import.meta.url),'utf8');
  assert.ok(s.indexOf('await loadNativeValueDeploymentArtifacts()')<s.indexOf('runtime=await createOwnedLocalEvmV2()'));
  assert.ok(s.indexOf("await health('empty'")<s.indexOf("await stage('manual-top-up-shared-http-sdk')"));
  assert.ok(s.indexOf("await health('loaded-before-authorization'")<s.indexOf('await owner.owner.prepareAuthorization'));
  assert.match(s,/OWNER_SUSPENDED_BEFORE_NATIVE/);assert.match(s,/health\('reserved-before-native'/);
  assert.match(s,/runtime\.checkReceipt\(admitted\.receipt\)/);assert.match(s,/system\.verify\('admission'/);
  assert.match(s,/joined\.bindManualNote\(preparation\.originalApproval/);
  assert.match(s,/joined\.session\.restartCoordinator/);
  assert.doesNotMatch(s,/process\.env\.(?:RPC|URL|ENABLE|PROFILE)|https:\/\/|eth_sendRawTransaction|nativeWire\s*:/);
  assert.doesNotMatch(s,/runtime\.advanceTo\(.*cutoff/);
});

test('original shared RAM/disk/RSS/90-minute/250ms limits and heavy lock paths are unchanged',()=>{
  assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes,3221225472);
  assert.equal(NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes,2684354560);
  assert.equal(NATIVE_FLOW_LIMITS.minimumFreeDiskBytes,5368709120);
  assert.equal(NATIVE_FLOW_LIMITS.sampleMilliseconds,250);
  const s=readFileSync(new URL('./native-flow-supervisor.mjs',import.meta.url),'utf8');
  assert.match(s,/const lockPaths = \[\[join\(PROOF_LOCAL, 'active.lock'\), 'pid'\], \['\/tmp\/lianum-paeg-proof-host.lock', 'parentPID'\]\]/);
  assert.match(s,/nativeWalletUnfundedProcessFailure\(sample.ownedProcesses\)/);
  assert.match(s,/nativeWalletUnfundedProcessFailure\(\[...history.values\(\)\]\)/);
});
test('second real backend and native role RSS excess trip original guards',()=>{
  const sample={availableRAMBytes:2684354560,freeDiskBytes:5368709120,mainWorkerRSSBytes:1,maximumProofWorkerRSSBytes:1,supervisorRSSBytes:1,liveProofWorkers:2};
  assert.equal(nativeResourceFailure(sample),'NATIVE_MULTIPLE_HEAVY_PROOF_WORKERS');
  assert.equal(nativeResourceFailure({...sample,liveProofWorkers:1,maximumProofWorkerRSSBytes:3221225473}),'NATIVE_PROOF_WORKER_RSS_LIMIT');
});
