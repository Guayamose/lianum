/** Fixed wrapped CI/CO clients. Reusable sequentially after completed proofs;
 * every proof has a fresh durable one-job worker attempt. An uncertain child
 * outcome faults this client permanently. No automatic resubmission/retry. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, LIMITS, SETTINGS } from '../../catalog.mjs';
import { regular, hash, assertID } from '../../tooling/tooling.mjs';
import { WRAPPED_CLAIM_PROFILE_V1, wrappedClaimRelationV1, wrappedClaimPublicWordsV1, validateWrappedClaimJobV1 } from '../metadata/wrapped-claim-profile-v1.mjs';
import { WRAPPED_CLAIM_LOCAL_V1, WRAPPED_CLAIM_ROLE_PROCESS_V1 } from '../tooling/wrapped-claim-tooling-v1.mjs';
import { loadWrappedClaimRoleProofArtifactsV1, assertWrappedClaimRoleProofArtifactsV1 } from '../../../../backend/src/operations/releases/wrapped/wrapped-claim-proof-artifacts-v1.mjs';
import { cloneInput, frozenInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
import { exactRecord } from '../../../../backend/src/execution/encoding/commitments.mjs';
const owned=new WeakMap();
function metricsForTransport(metrics){
 const fields=['initializationMilliseconds','jobPreparationMilliseconds','witnessMilliseconds','proofMilliseconds','verificationMilliseconds','totalMilliseconds','otherMilliseconds'];
 exactRecord(metrics,fields);return frozenInput(Object.fromEntries(fields.map(name=>{const n=metrics[name];assert.ok(typeof n==='number'&&Number.isFinite(n)&&n>=0&&!Object.is(n,-0),'WRAPPED_CLIENT_METRIC');return[name,String(n)];})));
}
export function assertWrappedClaimRoleProofClientV1(client,role){
 assert.equal(arguments.length,2,'WRAPPED_CLIENT_ASSERT_ARITY');wrappedClaimRelationV1(role);
 const state=owned.get(client);assert.ok(state&&state.role===role&&!state.closed&&!state.faulted,'WRAPPED_ORIGINAL_ROLE_CLIENT_REQUIRED');return client;
}
export function createWrappedClaimRoleProofClientV1(role){
 assert.equal(arguments.length,1,'WRAPPED_CLIENT_NO_OPTIONS');const spec=wrappedClaimRelationV1(role);
 const state={role,closed:false,busy:false,faulted:false,active:null,jobIds:new Set(),runIds:new Set()};
 const client=Object.freeze({
  async prove(raw){
   assert.equal(arguments.length,1,'WRAPPED_CLIENT_EXACT_REQUEST');assertWrappedClaimRoleProofClientV1(client,role);assert.equal(state.busy,false,'WRAPPED_CLIENT_BUSY');
   const request=cloneInput(raw);exactRecord(request,['relation','inputs','expectedPublicInputs']);assert.equal(request.relation,spec.name,'WRAPPED_CLIENT_EXACT_RELATION');
   const expected=wrappedClaimPublicWordsV1(spec,request.expectedPublicInputs);assert.ok(Buffer.byteLength(JSON.stringify(request))<=LIMITS.jobBytes,'WRAPPED_CLIENT_INPUT_BOUND');
   state.busy=true;let child,timer,killTimer,closed=false,jobId=null,runId=null,sent=false,failure=null,stdout='',outputBytes=0,completed=false;
   const stop=code=>{failure??=code;if(child?.pid&&!closed){child.kill('SIGTERM');killTimer??=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},LIMITS.killGraceMilliseconds);}};
   state.active={stop};timer=setTimeout(()=>stop('WRAPPED_CLIENT_TOTAL_TIMEOUT'),LIMITS.phaseTimeoutMilliseconds);
   try{
    // Real loader refusal happens before spawn, key/backend/CRS access or any
    // durable attempt. Tests never replace this production loader.
    const artifacts=await loadWrappedClaimRoleProofArtifactsV1(role);assertWrappedClaimRoleProofArtifactsV1(artifacts,role);
    const job=validateWrappedClaimJobV1(role,artifacts.program.abi,request);request.inputs=job.inputs;job.inputs=undefined;
    assert.equal(failure,null,'WRAPPED_CLIENT_PREFLIGHT_TIMEOUT');
    child=spawn(process.execPath,[WRAPPED_CLAIM_ROLE_PROCESS_V1,role],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
    const completion=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
    child.once('error',()=>stop('WRAPPED_CLIENT_SPAWN_FAILED'));
    child.on('message',message=>{try{
     exactRecord(message,['type','relation','role','jobId']);assert.equal(message.type,'wrapped-claim-proof-input-ready-v1');assert.equal(message.relation,spec.name);assert.equal(message.role,role);assert.equal(sent,false,'WRAPPED_CLIENT_ONE_HANDOFF');
     jobId=assertID(message.jobId);assert.ok(!state.jobIds.has(jobId),'WRAPPED_CLIENT_REUSED_JOB');state.jobIds.add(jobId);sent=true;
     child.send({type:'wrapped-claim-proof-inputs-v1',relation:spec.name,role,jobId,inputs:request.inputs,expectedPublicInputs:expected},error=>{if(error)stop('WRAPPED_CLIENT_IPC_FAILED');});request.inputs=undefined;
    }catch{stop('WRAPPED_CLIENT_INVALID_HANDOFF');}});
    child.stdout.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>LIMITS.outputBytes)stop('WRAPPED_CLIENT_OUTPUT_BOUND');else stdout+=bytes.toString('utf8');});
    child.stderr.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>LIMITS.outputBytes)stop('WRAPPED_CLIENT_OUTPUT_BOUND');});
    const exit=await completion;assert.equal(failure,null,'WRAPPED_CLIENT_FAILURE');assert.equal(exit.code,0,'WRAPPED_CLIENT_EXIT');assert.equal(exit.signal,null,'WRAPPED_CLIENT_SIGNAL');assert.ok(sent&&jobId,'WRAPPED_CLIENT_NO_HANDOFF');
    const status=JSON.parse(stdout.trim());exactRecord(status,['relation','role','mode','runId','jobId','phase','errorCode']);
    assert.equal(status.phase,'completed');assert.equal(status.errorCode,null);assert.equal(status.relation,spec.name);assert.equal(status.role,role);assert.equal(status.jobId,jobId);assert.equal(status.mode,'prove-wrapped-v1');
    runId=assertID(status.runId);assert.ok(!state.runIds.has(runId),'WRAPPED_CLIENT_REUSED_RUN');state.runIds.add(runId);
    const directory=join(WRAPPED_CLAIM_LOCAL_V1,'attempts',runId),read=name=>regular(join(directory,name));
    const result=JSON.parse(read('result.json')),resources=JSON.parse(read('resources.json')),manifestBytes=read('proof-manifest.json'),manifest=JSON.parse(manifestBytes);
    const runtimeBytes=read('runtime-pins.json'),runtime=JSON.parse(runtimeBytes),runtimeSHA256=hash(runtimeBytes);
    for(const report of [result,resources]){assert.equal(report.runId,runId);assert.equal(report.jobId,jobId);assert.equal(report.relation,spec.name);assert.equal(report.role,role);assert.equal(report.phase,'completed');assert.equal(report.mode,'prove-wrapped-v1');assert.equal(report.profile,WRAPPED_CLAIM_PROFILE_V1);assert.equal(report.hostLimitsChanged,false);assert.deepEqual(report.limits,LIMITS);assert.equal(report.runtimePinsSHA256,runtimeSHA256);}
    assert.equal(result.format,'WRAPPED_SCOPED_PROOF_RESULT_V1');assert.equal(resources.format,'WRAPPED_SCOPED_PROOF_RESOURCES_V1');
    assert.equal(resources.exitCode,0);assert.equal(resources.signal,null);assert.equal(resources.failure,null);assert.deepEqual(resources.failures,[]);assert.equal(resources.lockPreserved,false);
    assert.equal(manifest.format,'WRAPPED_SCOPED_PUBLIC_PROOF_V1');assert.equal(manifest.profile,WRAPPED_CLAIM_PROFILE_V1);assert.equal(manifest.relation,spec.name);assert.equal(manifest.role,role);assert.equal(manifest.jobId,jobId);assert.equal(manifest.runId,runId);
    for(const key of ['sourceVersion','keySHA256','keyManifestSHA256','compiledManifestSHA256','artifactSHA256','abiSHA256','bytecodeSHA256','proofReleaseSHA256','hostSourceClosureSHA256']){assert.equal(manifest[key],artifacts[key],'WRAPPED_CLIENT_EXACT_ARTIFACT_LINEAGE');assert.equal(runtime[key],artifacts[key],'WRAPPED_CLIENT_RUNTIME_ARTIFACT_LINEAGE');}
    assert.equal(runtime.relation,spec.name);assert.equal(runtime.role,role);assert.equal(runtime.profile,WRAPPED_CLAIM_PROFILE_V1);assert.deepEqual(runtime.api,artifacts.identity.api);assert.deepEqual(runtime.vendor,artifacts.identity.vendor);assert.deepEqual(runtime.toolchain,artifacts.identity.toolchain);assert.deepEqual(runtime.crs,artifacts.crs);
    assert.equal(manifest.runtimePinsSHA256,runtimeSHA256);assert.deepEqual(manifest.settings,SETTINGS);assert.deepEqual(result.settings,SETTINGS);
    assert.equal(manifest.publicWords,spec.publicWords);assert.equal(manifest.backendPublicWords,spec.publicWords+8);assert.equal(manifest.publicInputOffset,5);
    for(const value of [manifest,result,runtime])assert.equal(value.maximumPages,artifacts.maximumPages);assert.equal(result.threads,1);assert.equal(result.backendDestroyed,true);
    assert.equal(result.keyGenerated,false);assert.equal(result.keyRecomputed,false);assert.equal(result.witnessPersisted,false);assert.equal(result.proofGenerated,true);assert.equal(result.selfVerified,true);assert.equal(manifest.selfVerified,true);
    assert.equal(result.sourceVersion,manifest.sourceVersion);assert.equal(result.keySHA256,manifest.keySHA256);assert.equal(result.proofSHA256,manifest.proofSHA256);
    const proof=read('proof.bin'),inputBytes=read('public-inputs.json'),inputs=wrappedClaimPublicWordsV1(spec,JSON.parse(inputBytes));
    assert.ok(proof.length>0&&proof.length%32===0&&proof.length<=LIMITS.outputBytes);assert.equal(proof.length,manifest.proofBytes);assert.equal(hash(proof),manifest.proofSHA256);assert.equal(hash(inputBytes),manifest.publicInputsSHA256);
    assert.deepEqual(inputs,expected,'WRAPPED_CLIENT_ORIGINAL_PUBLIC_STATEMENT');
    const live=await loadWrappedClaimRoleProofArtifactsV1(role);assert.deepEqual(live.lineage,artifacts.lineage);assert.equal(live.proofReleaseSHA256,artifacts.proofReleaseSHA256);
    const value=frozenInput({proof:proof.toString('hex'),publicInputs:inputs,evidence:{relation:spec.name,role,runId,jobId,sourceVersion:artifacts.sourceVersion,
     keySHA256:manifest.keySHA256,proofSHA256:manifest.proofSHA256,manifestSHA256:hash(manifestBytes),proofReleaseSHA256:artifacts.proofReleaseSHA256,
     metricUnits:'milliseconds',metrics:metricsForTransport(result.metrics)}});completed=true;return value;
   }catch(error){
    if(child)state.faulted=true;
    // Never expose assertion values, private witness or an arbitrary cause.
    const code=failure??(error?.message?.includes('WRAPPED_REVIEWED_PROOF_RELEASE_REQUIRED')?'WRAPPED_REVIEWED_PROOF_RELEASE_REQUIRED':'WRAPPED_CLIENT_PROOF_INCOMPLETE');
    throw Object.assign(new Error(code),{jobId,runId,uncertain:!!child});
   }finally{
    clearTimeout(timer);clearTimeout(killTimer);request.inputs=undefined;
    if(child?.pid&&!closed)child.kill('SIGTERM');for(const stream of child?.stdio??[])stream?.destroy();
    if(child&&!completed)state.faulted=true;state.active=null;state.busy=false;
   }
  },
  close(){assert.equal(arguments.length,0,'WRAPPED_CLIENT_CLOSE_ARITY');assert.equal(state.busy,false,'WRAPPED_CLIENT_CLOSE_WHILE_BUSY');state.closed=true;},
  stop(){assert.equal(arguments.length,0,'WRAPPED_CLIENT_STOP_ARITY');state.active?.stop('WRAPPED_CLIENT_OWNER_STOPPED');},
 });owned.set(client,state);return client;
}
