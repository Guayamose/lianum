/** Fixed three-worker continuation. Grants and checkpoints never select an
 * executable, source root, economic operation, factory, budget or callback. */
import assert from 'node:assert/strict';
import {reconcileWrappedRecoveryFinalizationV1} from './wrapped-recovery-authority-v1.mjs';
import {createHash} from 'node:crypto';
import {constants,lstatSync,fstatSync,realpathSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {exactRecord} from '@lianum/components/encoding/commitments';
export const WRAPPED_COLD_CYCLE_RELEASE_V1=null;
export const WRAPPED_COLD_CYCLE_STAGES_V1=Object.freeze(['PRE_PRINCIPAL_CAPTURE','GRAPH_FULFILLED_CAPTURE','FINAL_REDEMPTION']);
const ownedColdStageClaimsV1=new Map();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function assertWrappedColdCycleReleaseV1(){assert.equal(arguments.length,0);assert.match(WRAPPED_COLD_CYCLE_RELEASE_V1,/^[0-9a-f]{64}$/,'WRAPPED_COLD_CYCLE_NOT_RELEASED');assert.notEqual(WRAPPED_COLD_CYCLE_RELEASE_V1,'0'.repeat(64));return WRAPPED_COLD_CYCLE_RELEASE_V1;}
export function wrappedColdSourceIdentityV1(pins){return hash(Buffer.from(JSON.stringify(pins)));}
function ownProcess(pid){const raw=readFileSync(`/proc/${pid}/stat`,'utf8'),tail=raw.slice(raw.lastIndexOf(')')+2).split(' ');assert.match(tail[19],/^[0-9]+$/);return {pid,startTimeTicks:tail[19]};}
function privateBytes(path,max=65536){const st=lstatSync(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&(st.mode&0o777)===0o600&&st.size<=max,'WRAPPED_COLD_PRIVATE_FILE');const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=fstatSync(fd);assert.equal(current.ino,st.ino);assert.equal(current.dev,st.dev);assert.equal(current.mode&0o777,0o600);assert.equal(current.nlink,1);const bytes=readFileSync(fd);assert.equal(bytes.length,st.size);return bytes;}finally{closeSync(fd);}}
function exclusive(path,value){const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.ok(bytes.length<=65536);const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}return {bytes:bytes.length,sha256:hash(bytes)};}
function attemptFor(directory,runId){assert.match(runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);const attempt=join(ROOT,'.local/wrapped-wallet-fixed-acceptance-v1','attempt-'+runId);assert.equal(directory,join(attempt,'private-audit'));assert.equal(realpathSync(attempt),attempt);return attempt;}
export function writeWrappedColdStageGrantV1(input){
 exactRecord(input,['attempt','runId','sourceSHA256','deadlineMs','index','worker','supervisor','previous']);assertWrappedColdCycleReleaseV1();
 assert.match(input.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.match(input.sourceSHA256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(input.deadlineMs)&&input.deadlineMs>Date.now());
 assert.equal(input.attempt,join(ROOT,'.local/wrapped-wallet-fixed-acceptance-v1','attempt-'+input.runId));assert.ok(Number.isInteger(input.index)&&input.index>=0&&input.index<3);assert.equal(input.supervisor.pid,process.pid);assert.deepEqual(ownProcess(process.pid),input.supervisor);
 assert.deepEqual(ownProcess(input.worker.pid),input.worker);assert.ok(input.index===0?input.previous===null:input.previous?.index===input.index-1);
 return exclusive(join(input.attempt,'cold-stage-'+input.index+'-grant.json'),{schema:'WRAPPED_FIXED_COLD_STAGE_GRANT_V1',...input,releaseSHA256:WRAPPED_COLD_CYCLE_RELEASE_V1});
}
export async function claimWrappedColdStageV1(input){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs']);assertWrappedColdCycleReleaseV1();const attempt=attemptFor(input.directory,input.runId),self=ownProcess(process.pid),parent=ownProcess(process.ppid),until=Math.min(input.deadlineMs,Date.now()+15000);
 assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/wrapped-wallet-fixed-acceptance-v1.mjs'));assert.equal(process.argv.length,2);
 while(Date.now()<until){for(let index=0;index<3;index++){const path=join(attempt,'cold-stage-'+index+'-grant.json');if(!existsSync(path))continue;const g=JSON.parse(privateBytes(path));
   if(g.worker?.pid!==self.pid||g.worker?.startTimeTicks!==self.startTimeTicks)continue;
   exactRecord(g,['schema','attempt','runId','sourceSHA256','deadlineMs','index','worker','supervisor','previous','releaseSHA256']);assert.equal(g.schema,'WRAPPED_FIXED_COLD_STAGE_GRANT_V1');assert.equal(g.attempt,attempt);assert.equal(g.index,index);assert.deepEqual(g.worker,self);assert.deepEqual(g.supervisor,parent);
   for(const k of ['runId','sourceSHA256','deadlineMs'])assert.equal(g[k],input[k]);assert.equal(g.releaseSHA256,WRAPPED_COLD_CYCLE_RELEASE_V1);
   exclusive(join(attempt,'cold-stage-'+index+'-consumed.json'),{schema:'WRAPPED_FIXED_COLD_STAGE_CONSUMED_V1',runId:input.runId,index,worker:self,grantSHA256:hash(privateBytes(path))});
   assert.equal(ownedColdStageClaimsV1.has(index),false);ownedColdStageClaimsV1.set(index,{...input,worker:self,checkpointStarted:false});
   return Object.freeze({index,stage:WRAPPED_COLD_CYCLE_STAGES_V1[index],previous:g.previous});
  }await new Promise(resolve=>setTimeout(resolve,20));}
 throw new Error('WRAPPED_COLD_ORIGINAL_GRANT_UNAVAILABLE');
}
function validateColdPublicationDataV1(input){
 exactRecord(input.unfunded,['originalFactories','principalAbsent','proofsAbsent','completeCurrentInventory','schedule']);for(const key of ['originalFactories','principalAbsent','proofsAbsent','completeCurrentInventory'])assert.equal(input.unfunded[key],true);
 exactRecord(input.unfunded.schedule,['nativeInitialSecond','receiverInitialSecond','receiverBlocksBeforeGraphNative','nativeClockMutated']);for(const key of ['nativeInitialSecond','receiverInitialSecond']){const second=input.unfunded.schedule[key];assert.equal(typeof second,'string');assert.match(second,/^(0|[1-9][0-9]{0,19})$/);assert.ok(BigInt(second)<=18446744073709551615n);}assert.equal(BigInt(input.unfunded.schedule.nativeInitialSecond)-BigInt(input.unfunded.schedule.receiverInitialSecond),4n);assert.equal(input.unfunded.schedule.receiverBlocksBeforeGraphNative,5);assert.equal(input.unfunded.schedule.nativeClockMutated,false);

 exactRecord(input.finalizationIntent,['schema','identity','nonce','priorCheckpoint','targetRevision','targetRecordSHA256','storeHeaderSHA256','capturedProcess']);
 const f=input.finalizationIntent;exactRecord(f.capturedProcess,['pid','startTicks']);assert.ok(Number.isSafeInteger(f.capturedProcess.pid)&&f.capturedProcess.pid>0);assert.match(f.capturedProcess.startTicks,/^[0-9]{1,24}$/);assert.equal(f.schema,'WRAPPED_RECOVERY_FINALIZATION_INTENT_V1');
 exactRecord(f.identity,['profile','directory','runId','sourceSHA256','deadlineMs']);
 assert.equal(f.identity.profile,input.index===0?'WRAPPED_FIXED_PRIVATE_RECOVERY_AUTHORITY_V1':'WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1');
 for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(f.identity[key],input[key]);
 for(const key of ['nonce','targetRecordSHA256','storeHeaderSHA256'])assert.match(f[key],/^[0-9a-f]{64}$/);
 exactRecord(f.priorCheckpoint,['revision','commitment']);assert.ok(Number.isSafeInteger(f.priorCheckpoint.revision)&&f.priorCheckpoint.revision>=0);assert.match(f.priorCheckpoint.commitment,/^[0-9a-f]{64}$/);assert.equal(f.targetRevision,f.priorCheckpoint.revision+1);
}
function coldBoundaryV1(input,checkpointSHA256){return Object.freeze({schema:'WRAPPED_FIXED_COLD_BOUNDARY_V1',index:input.index,stage:WRAPPED_COLD_CYCLE_STAGES_V1[input.index],sourceSHA256:input.sourceSHA256,deadlineMs:input.deadlineMs,checkpointSHA256,originalResourcesStopped:true,fullEconomicAcceptance:false});}
/** Records only the original finalization intent. It cannot seal an authority,
 * start a worker, authorize an effect, or replace an existing publication. */
export function prepareWrappedColdCheckpointPublicationV1(input){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs','index','finalizationIntent','unfunded']);assertWrappedColdCycleReleaseV1();assert.ok(input.index===0||input.index===1);
 const claim=ownedColdStageClaimsV1.get(input.index);assert.ok(claim&&!claim.checkpointStarted,'WRAPPED_COLD_ORIGINAL_CLAIM_REQUIRED');
 for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(input[key],claim[key],'WRAPPED_COLD_ORIGINAL_CLAIM_CHANGED');assert.deepEqual(ownProcess(process.pid),claim.worker,'WRAPPED_COLD_ORIGINAL_WORKER_CHANGED');assert.ok(Date.now()<input.deadlineMs,'WRAPPED_COLD_ORIGINAL_DEADLINE');
 validateColdPublicationDataV1(input);assert.equal(input.finalizationIntent.capturedProcess.pid,claim.worker.pid);assert.equal(input.finalizationIntent.capturedProcess.startTicks,claim.worker.startTimeTicks);const attempt=attemptFor(input.directory,input.runId);
 const consumed=privateBytes(join(attempt,'cold-stage-'+input.index+'-consumed.json')),saved=JSON.parse(consumed);
 exactRecord(saved,['schema','runId','index','worker','grantSHA256']);assert.equal(saved.schema,'WRAPPED_FIXED_COLD_STAGE_CONSUMED_V1');assert.equal(saved.runId,input.runId);assert.equal(saved.index,input.index);assert.deepEqual(saved.worker,claim.worker);
 assert.equal(saved.grantSHA256,hash(privateBytes(join(attempt,'cold-stage-'+input.index+'-grant.json'))));
 claim.checkpointStarted=true;
 const intent={schema:'WRAPPED_COLD_PUBLICATION_INTENT_V1',...input,worker:claim.worker,consumedSHA256:hash(consumed),releaseSHA256:WRAPPED_COLD_CYCLE_RELEASE_V1};
 const receipt=exclusive(join(input.directory,'cold-stage-'+input.index+'-publication-intent.json'),intent);
 const reread=privateBytes(join(input.directory,'cold-stage-'+input.index+'-publication-intent.json'));assert.equal(hash(reread),receipt.sha256,'WRAPPED_COLD_PUBLICATION_INTENT_CHANGED');
 return Object.freeze({schema:'WRAPPED_COLD_PUBLICATION_INTENT_RECEIPT_V1',index:input.index,intentSHA256:receipt.sha256});
}
/** Idempotent publication/observation only. A matching original finalization
 * anchor must establish the exact checkpoint; no caller-selected checkpoint,
 * new authority, grant, deadline extension or economic operation is accepted. */
export async function reconcileWrappedColdCheckpointPublicationV1(input){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs','index']);assert.ok(input.index===0||input.index===1);
 const attempt=attemptFor(input.directory,input.runId),raw=privateBytes(join(input.directory,'cold-stage-'+input.index+'-publication-intent.json'));
 const intent=JSON.parse(raw);exactRecord(intent,['schema','directory','runId','sourceSHA256','deadlineMs','index','finalizationIntent','unfunded','worker','consumedSHA256','releaseSHA256']);assert.equal(intent.schema,'WRAPPED_COLD_PUBLICATION_INTENT_V1');
 for(const key of ['directory','runId','sourceSHA256','deadlineMs','index'])assert.equal(intent[key],input[key],'WRAPPED_COLD_ORIGINAL_CLAIM_CHANGED');assert.match(intent.releaseSHA256,/^[0-9a-f]{64}$/);validateColdPublicationDataV1(intent);
 const consumed=privateBytes(join(attempt,'cold-stage-'+input.index+'-consumed.json'));assert.equal(hash(consumed),intent.consumedSHA256,'WRAPPED_COLD_CONSUMED_GRANT_CHANGED');const saved=JSON.parse(consumed);assert.deepEqual(saved.worker,intent.worker);assert.equal(saved.runId,input.runId);assert.equal(saved.index,input.index);assert.equal(saved.grantSHA256,hash(privateBytes(join(attempt,'cold-stage-'+input.index+'-grant.json'))));
 const {profile:authorityProfile,...authorityIdentity}=intent.finalizationIntent.identity;const finalization=await reconcileWrappedRecoveryFinalizationV1(authorityIdentity,intent.finalizationIntent);assert.equal(finalization.recoveryAuthorized,false);assert.equal(finalization.publicationIntentSHA256,hash(raw),'WRAPPED_COLD_PUBLICATION_INTENT_CHANGED');assert.equal(finalization.publicationIndex,input.index);
 const checkpoint=finalization.checkpoint;exactRecord(checkpoint,['revision','commitment']);assert.equal(checkpoint.revision,intent.finalizationIntent.targetRevision);assert.match(checkpoint.commitment,/^[0-9a-f]{64}$/);
 const identity={directory:input.directory,runId:input.runId,sourceSHA256:input.sourceSHA256,deadlineMs:input.deadlineMs};
 const value={schema:'WRAPPED_ORIGINAL_COLD_CHECKPOINT_V1',identity,index:input.index,checkpoint,unfunded:intent.unfunded},expected=Buffer.from(JSON.stringify(value)+'\n'),path=join(input.directory,'cold-stage-'+input.index+'-checkpoint.json');
 // An interrupted partial write remains a conflict. Never truncate or repair it
 // by replacement. An entirely absent target can be published from this intent.
 if(!existsSync(path)){try{exclusive(path,value);}catch(error){if(!existsSync(path))throw error;}}
 const actual=privateBytes(path);assert.ok(actual.equals(expected),'WRAPPED_COLD_PUBLICATION_BYTES_CONFLICT');
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{assert.ok(readFileSync(fd).equals(expected),'WRAPPED_COLD_PUBLICATION_BYTES_CONFLICT');fsyncSync(fd);}finally{closeSync(fd);}const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}assert.ok(privateBytes(path).equals(expected),'WRAPPED_COLD_PUBLICATION_BYTES_CONFLICT');
 return coldBoundaryV1(input,hash(actual));
}
export function readWrappedColdCheckpointV1(input){
 exactRecord(input,['directory','runId','sourceSHA256','deadlineMs','previous']);attemptFor(input.directory,input.runId);const b=input.previous;assert.ok(b&&[0,1].includes(b.index));
 const raw=privateBytes(join(input.directory,'cold-stage-'+b.index+'-checkpoint.json'));assert.equal(hash(raw),b.checkpointSHA256);const saved=JSON.parse(raw);
 exactRecord(saved,['schema','identity','index','checkpoint','unfunded']);assert.equal(saved.schema,'WRAPPED_ORIGINAL_COLD_CHECKPOINT_V1');assert.equal(saved.index,b.index);assert.deepEqual(saved.identity,{directory:input.directory,runId:input.runId,sourceSHA256:input.sourceSHA256,deadlineMs:input.deadlineMs});return saved;
}
export function assertWrappedColdBoundaryV1(result,input){
 exactRecord(input,['attempt','runId','sourceSHA256','deadlineMs','index']);assert.equal(result.phase,'captured');assert.equal(result.success,true);assert.equal(result.fullWalletAcceptance,false);const b=result.coldBoundary;
 exactRecord(b,['schema','index','stage','sourceSHA256','deadlineMs','checkpointSHA256','originalResourcesStopped','fullEconomicAcceptance']);assert.equal(b.schema,'WRAPPED_FIXED_COLD_BOUNDARY_V1');assert.equal(b.index,input.index);assert.equal(b.stage,WRAPPED_COLD_CYCLE_STAGES_V1[input.index]);assert.equal(b.sourceSHA256,input.sourceSHA256);assert.equal(b.deadlineMs,input.deadlineMs);assert.equal(b.originalResourcesStopped,true);assert.equal(b.fullEconomicAcceptance,false);
 for(const name of ['allOwnedResourcesClosed','closedEvm','closedGraphEvm','closedBitcoin','closedSolana'])assert.equal(result.cleanup?.[name],true);
 const raw=privateBytes(join(input.attempt,'private-audit','cold-stage-'+input.index+'-checkpoint.json'));assert.equal(hash(raw),b.checkpointSHA256);return {...b};
}
