/** Fixed official MetaMorpho bootstrap on the SAME original External5 receiver.
 * No private-note funding, owners, GRAPH, proof, issuer finalization or reopen. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,mkdir,lstat,unlink,realpath,readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {externalDefiVaultExitSourcePinsV1} from './external-defi-vault-exit-source-pins-v1.mjs';
import {createOwnedExternalDefiReceiverV2} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createWrappedPrivateLifetimeRegistryV1,closeWrappedPrivateLifetimeRegistryV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {createExternalDefiRecoveryAuthorityV1,closeWrappedRecoveryAuthorityV1,retainWrappedPrivateLifetimeRecoveryV1,retainExternalDefiReceiverRuntimeV2,wrappedRecoveryAuthorityStatusV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {readPrivateRuntimeRecoveryV1} from '../../../../packages/backend/src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';
import {createOfficialProtocolFixture,assertOfficialProtocolFixture,captureOfficialProtocolFixtureRecoveryV1} from '../../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import {ownedEvmRecoveryStateBoundFailureV1} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';

const PROFILE='ORIGINAL_EXTERNAL5_METAMORPHO_BOOTSTRAP_CAPTURE_V1',MAX_CAPTURE=33554432;
const started=performance.now(),deadline=Date.now()+75000;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const active=()=>assert.ok(Date.now()<deadline,'EVM_BOOTSTRAP_CAPTURE_DEADLINE');
const code=error=>{const value=error?.code??error?.message;return typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,100}$/.exec(value)?.[0]===value?value:'EVM_BOOTSTRAP_CAPTURE_FAILED';};
async function privateDirectory(path){
 const st=await lstat(path);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700);
 assert.equal(await realpath(path),path);
}
async function writePrivate(path,value){
 const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}
}
function source(){
 const original=externalDefiVaultExitSourcePinsV1(),self=regular(join(ROOT,'integration/run-evm-recovery-state-bootstrap-v1.mjs'));
 return {original,entry:{bytes:self.length,sha256:hash(self)}};
}
async function terminalRecord(cwd){
 // The path belongs to this exact just-captured original runtime. These
 // numeric reads create no issuer/capture/reopen capability from file data.
 const path=join(cwd,'wrapped-runtime-terminal.json'),before=await lstat(path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=1048576);
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const opened=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(opened[key],before[key]);
  bytes=await file.readFile();assert.equal(bytes.length,before.size);const after=await file.stat();for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[key],before[key]);
 }finally{await file.close();}
 const named=await lstat(path);for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(named[key],before[key]);
 return readPrivateRuntimeRecoveryV1(cwd,{path:'wrapped-runtime-terminal.json',bytes:bytes.length,sha256:sha(bytes)});
}
function descriptor(value){
 const isString=typeof value==='string',length=isString?value.length:null;
 const bounded=isString&&length<=MAX_CAPTURE,prefix=isString&&value.startsWith('0x'),even=isString&&length>2&&(length-2)%2===0;
 let lowerHex=null;if(bounded&&prefix&&even){lowerHex=true;for(let i=2;i<length;i++){const c=value.charCodeAt(i);if(!(c>=48&&c<=57||c>=97&&c<=102)){lowerHex=false;break;}}}
 return {type:isString?'STRING':'NON_STRING',characterLength:length,maximumCharacters:MAX_CAPTURE,withinCharacterBound:isString?bounded:null,
  hexPrefix:isString?prefix:null,positiveEvenByteLength:isString?even:null,lowerHexEncoding:lowerHex};
}

async function main(){
 assert.equal(process.argv.length,2);assert.equal(await realpath(process.cwd()),ROOT);
 assert.equal(await realpath(process.argv[1]),join(ROOT,'integration/run-evm-recovery-state-bootstrap-v1.mjs'));
 assert.ok(process.execArgv.every(value=>value==='--max-old-space-size=384'));assert.equal(process.platform,'linux');
 const local=join(ROOT,'.local/external-defi-owner-cycle-v1');await mkdir(local,{recursive:true,mode:0o700});await privateDirectory(local);
 const runId=randomUUID(),lockPath=join(local,'active.lock');let lock,runtime,registry,authority,primary,runtimeConstructionStarted=false;
 const result={schema:PROFILE,runId,phase:'STARTING',success:false,financialAcceptance:false,loadedMeta15Equivalence:false,
  issuerFinalized:false,issuerReopened:false,owners:0,proofs:0,userNoteFunding:0,graphDeliveries:0,originalFixtureFakeLiquiditySetup:false,sourceClosureUnchanged:false,
  cleanup:{runtimeStopped:false,originalPIDAbsent:false,registryClosed:false,issuerClosed:false,lockReleased:false,errors:[]}};
 let directory,before;
 try{
  lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await lock.writeFile(JSON.stringify({profile:PROFILE,pid:process.pid,runId}));await lock.sync();
  directory=join(local,'attempt-'+runId);await mkdir(directory,{mode:0o700});directory=join(directory,'private-audit');await mkdir(directory,{mode:0o700});await privateDirectory(directory);
  before=source();const sourceSHA256=hash(JSON.stringify(before));result.sourceClosureSHA256=sourceSHA256;
  active();runtimeConstructionStarted=true;runtime=await createOwnedExternalDefiReceiverV2();active();
  const processId=runtime.metadata.processId;result.ownedProcessId=processId;
  assert.equal(runtime.transactions.length,0);assert.equal(runtime.receipts.length,0);
  const identity={directory,runId,sourceSHA256,deadlineMs:deadline};
  // All three objects are genuine fixed constructors. The issuer and registry
  // exist before every original protocol CREATE/setup effect below.
  registry=await createWrappedPrivateLifetimeRegistryV1({runtime,...identity});active();
  authority=await createExternalDefiRecoveryAuthorityV1(identity);active();
  result.phase='ORIGINAL_OFFICIAL_METAMORPHO_BOOTSTRAP';
  const official=await createOfficialProtocolFixture(runtime);active();
  assertOfficialProtocolFixture(runtime,official);
  // Exact original producer checks the configured contracts at this same
  // canonical head. No copied fixture/record becomes an execution capability.
  const setup=await captureOfficialProtocolFixtureRecoveryV1(runtime,official);active();
  const setupTransactions=runtime.transactions.length,setupReceipts=runtime.receipts.length;
  assert.ok(setupTransactions>0&&setupReceipts===setupTransactions,'EVM_BOOTSTRAP_CAPTURE_ORIGINAL_RECEIPTS');
  assert.ok(runtime.receipts.every(row=>row.receipt.status==='0x1'),'EVM_BOOTSTRAP_CAPTURE_ORIGINAL_STATUS');
  assert.ok(setup.records.every(row=>row.receipt.status==='0x1'),'EVM_BOOTSTRAP_CAPTURE_ORIGINAL_CREATES');
  result.originalFixtureFakeLiquiditySetup=true;
  result.originalFixtureSetup={transactions:setupTransactions,receipts:setupReceipts,
    directContractCreates:setup.records.length,configurationReadChecks:setup.reads.length,
    canonicalHeadVerified:true,privateNoteFunding:false,financialAcceptance:false};
  result.phase='ORIGINAL_PRIVATE_LIFETIME_CAPTURE';await retainWrappedPrivateLifetimeRecoveryV1(authority,runtime);active();
  result.phase='ORIGINAL_RECEIVER_CAPTURE';await retainExternalDefiReceiverRuntimeV2(authority,runtime);active();
  const status=wrappedRecoveryAuthorityStatusV1(authority);
  assert.equal(status.phase,'CAPTURING');assert.equal(status.sections.privateLifetime,'CAPTURED');assert.equal(status.sections.receiver,'CAPTURED');
  for(const key of ['system','owners','wallet'])assert.equal(status.sections[key],'ABSENT');
  assert.equal(status.operationInProgress,false);assert.equal(status.uncertain,false);
  assert.equal(runtime.processStatus().stopped,true);assert.throws(()=>process.kill(processId,0),{code:'ESRCH'});
  const terminal=await terminalRecord(runtime.metadata.scratchDirectory);
  assert.equal(terminal.schema,'OWNED_FIXED_EVM_CAPTURE_V2');assert.equal(terminal.family,'receiver');
  assert.equal(terminal.terminal.ownedProcessStopped,true);assert.equal(terminal.terminal.forced,false);
  const original=await readPrivateRuntimeRecoveryV1(runtime.metadata.scratchDirectory,terminal.privateRecord);
  assert.equal(original.schema,'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V2');assert.equal(original.family,'receiver');
  assert.equal(original.transactions.length,setupTransactions);assert.equal(original.receipts.length,setupReceipts);assert.equal(original.accounts.length,5);
  assert.deepEqual(original.head,setup.head,'EVM_BOOTSTRAP_CAPTURE_ORIGINAL_HEAD');
  result.stateDump=descriptor(original.stateDump);assert.equal(result.stateDump.lowerHexEncoding,true);
  result.originalAccountCount=original.accounts.length;result.issuerSections={privateLifetime:'CAPTURED',receiver:'CAPTURED',system:'ABSENT',owners:'ABSENT',wallet:'ABSENT'};
  original.stateDump=null;result.phase='ORIGINAL_BOOTSTRAP_CAPTURE_COMPLETED';result.success=true;
 }catch(error){primary=error;result.failedStage=result.phase;result.errorCode=code(error);result.recoveryStateBoundDiagnostic=ownedEvmRecoveryStateBoundFailureV1(error);result.success=false;result.phase='FAILED';}
 finally{
  for(const [field,close] of [['registryClosed',()=>registry?closeWrappedPrivateLifetimeRegistryV1(registry):undefined],['issuerClosed',()=>authority?closeWrappedRecoveryAuthorityV1(authority):undefined],['runtimeStopped',()=>runtime?.close()]]){
   try{await close();result.cleanup[field]=true;}catch(error){result.cleanup.errors.push(code(error));}
  }
  if(runtime){result.cleanup.runtimeStopped=runtime.processStatus().stopped===true;try{process.kill(runtime.metadata.processId,0);}catch(error){if(error.code==='ESRCH')result.cleanup.originalPIDAbsent=true;}}
  if(before){try{const after=source();result.sourceClosureUnchanged=hash(JSON.stringify(after))===result.sourceClosureSHA256;}catch(error){result.cleanup.errors.push(code(error));}}
  if(lock){
   // Retain exclusion whenever original construction/stop or lease cleanup is
   // unresolved. A failed constructor gives no returned handle to authenticate
   // closure; no missing reference, failed result or PID guess releases it.
   const stopped=!runtimeConstructionStarted||(runtime&&result.cleanup.runtimeStopped&&result.cleanup.originalPIDAbsent);
   if(stopped&&result.cleanup.errors.length===0){try{const current=JSON.parse(await readFile(lockPath,'utf8'));assert.equal(current.pid,process.pid);assert.equal(current.runId,runId);await lock.close();lock=null;await unlink(lockPath);result.cleanup.lockReleased=true;}catch(error){result.cleanup.errors.push(code(error));}}
   else{result.cleanup.errors.push('EVM_BOOTSTRAP_CAPTURE_LOCK_RETAINED');try{await lock.close();lock=null;}catch(error){result.cleanup.errors.push(code(error));}}
  }
  result.wallMilliseconds=performance.now()-started;
  result.success=result.success&&result.sourceClosureUnchanged&&Object.entries(result.cleanup).every(([key,value])=>key==='errors'?value.length===0:value===true);
  if(directory){try{await writePrivate(join(directory,'bootstrap-receiver-shape.json'),result);}catch(error){result.cleanup.errors.push(code(error));result.success=false;primary??=error;}}
  // Only fixed scalar diagnostic evidence is public. No original keys, state
  // dump, account addresses, source paths, receipts, authority or grant escapes.
  console.log(JSON.stringify(result));
 }
 if(primary||!result.success)process.exitCode=1;
}
try{await main();}catch(error){console.log(JSON.stringify({schema:PROFILE,phase:'PREFLIGHT_FAILED',success:false,errorCode:code(error),financialAcceptance:false}));process.exitCode=1;}
