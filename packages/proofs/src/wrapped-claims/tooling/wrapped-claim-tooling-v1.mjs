/** Private fixed-role plumbing. No externally selected worker/artifact location. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { ROOT, LOCAL, LIMITS } from '../../catalog.mjs';
import { regular, hash, assertID } from '../../tooling/tooling.mjs';
import { wrappedClaimRelationV1, validateWrappedClaimJobV1, WRAPPED_CLAIM_PROFILE_V1 } from '../metadata/wrapped-claim-profile-v1.mjs';
import { assertWrappedClaimProofSourcePinsV1, loadWrappedClaimRoleProofArtifactsV1 } from '../../../../backend/src/operations/releases/wrapped/wrapped-claim-proof-artifacts-v1.mjs';
import { exactRecord } from '../../../../backend/src/execution/encoding/commitments.mjs';
import { cloneInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
export const WRAPPED_CLAIM_LOCAL_V1=join(ROOT,'.local/proof-workers-wrapped-claim-v1');
export const WRAPPED_CLAIM_GLOBAL_LOCK_V1=join(LOCAL,'active.lock');
export const WRAPPED_CLAIM_WORKER_V1=join(ROOT,'proof-workers/wrapped-claim-worker-v1.mjs');
export const WRAPPED_CLAIM_ROLE_PROCESS_V1=join(ROOT,'proof-workers/wrapped-claim-role-process-v1.mjs');
export const json=value=>JSON.stringify(value,null,2)+'\n';
export const readJSON=path=>JSON.parse(regular(path));
export function outputDirectory(path){
 assert.equal(resolve(path),path,'WRAPPED_JOB_OUTPUT_CANONICAL');
 assert.ok(path===WRAPPED_CLAIM_LOCAL_V1||path.startsWith(WRAPPED_CLAIM_LOCAL_V1+sep),'WRAPPED_JOB_OUTPUT_LOCATION');
 const missing=[];let parent=path;while(!existsSync(parent)){missing.push(parent);parent=dirname(parent);}
 assert.equal(realpathSync(parent),parent,'WRAPPED_JOB_OUTPUT_SYMLINK');for(const d of missing.reverse())mkdirSync(d,{mode:0o700});assert.equal(realpathSync(path),path);return path;
}
function assertOutput(path){assert.equal(resolve(path),path);assert.ok(path.startsWith(WRAPPED_CLAIM_LOCAL_V1+sep),'WRAPPED_JOB_OUTPUT_LOCATION');outputDirectory(dirname(path));}
export function writeNew(path,value){assertOutput(path);writeFileSync(path,typeof value==='string'||value instanceof Uint8Array?value:json(value),{flag:'wx',mode:0o600});}
export function replace(path,value){assertOutput(path);if(existsSync(path))regular(path);const temp=path+'.tmp';writeNew(temp,value);renameSync(temp,path);}
export async function wrappedClaimRuntimePinsV1(role){
 assert.equal(arguments.length,1,'WRAPPED_RUNTIME_PIN_ARITY');const spec=wrappedClaimRelationV1(role),a=await loadWrappedClaimRoleProofArtifactsV1(role);
 const sourceClosure=assertWrappedClaimProofSourcePinsV1();
 return {profile:WRAPPED_CLAIM_PROFILE_V1,relation:spec.name,role,sourceVersion:a.sourceVersion,keySHA256:a.keySHA256,
  keyManifestSHA256:a.keyManifestSHA256,compiledManifestSHA256:a.compiledManifestSHA256,artifactSHA256:a.artifactSHA256,
  abiSHA256:a.abiSHA256,bytecodeSHA256:a.bytecodeSHA256,hostSourceClosureSHA256:sourceClosure,proofReleaseSHA256:a.proofReleaseSHA256,
  api:a.identity.api,vendor:a.identity.vendor,toolchain:a.identity.toolchain,crs:a.crs,maximumPages:a.maximumPages};
}
let receivedOnce=false;
export function receiveWrappedClaimJobV1(role,jobId,abi){
 assert.equal(arguments.length,3,'WRAPPED_JOB_INTAKE_ARITY');const spec=wrappedClaimRelationV1(role);assertID(jobId);
 assert.equal(receivedOnce,false,'WRAPPED_JOB_ONE_HANDOFF');receivedOnce=true;assert.equal(typeof process.send,'function','WRAPPED_JOB_IPC_REQUIRED');assert.ok(process.connected);
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timeout);process.removeListener('message',receive);process.removeListener('disconnect',disconnect);error?reject(error):resolve(value);};
  const disconnect=()=>finish(Error('WRAPPED_JOB_PARENT_DISCONNECTED'));
  const receive=raw=>{try{const value=cloneInput(raw);exactRecord(value,['type','relation','role','jobId','inputs','expectedPublicInputs']);
   assert.equal(value.type,'wrapped-claim-proof-inputs-v1');assert.equal(value.relation,spec.name);assert.equal(value.role,role);assert.equal(value.jobId,jobId);
   assert.ok(Buffer.byteLength(JSON.stringify(value))<=LIMITS.jobBytes,'WRAPPED_JOB_SIZE');
   const job=validateWrappedClaimJobV1(role,abi,{relation:value.relation,inputs:value.inputs,expectedPublicInputs:value.expectedPublicInputs});finish(null,job);
  }catch{finish(Error('WRAPPED_JOB_INVALID_PRIVATE_MESSAGE'));}};
  const timeout=setTimeout(()=>finish(Error('WRAPPED_JOB_INPUT_TIMEOUT')),LIMITS.phaseTimeoutMilliseconds);
  process.once('message',receive);process.once('disconnect',disconnect);
  process.send({type:'wrapped-claim-proof-input-ready-v1',relation:spec.name,role,jobId},error=>{if(error)finish(Error('WRAPPED_JOB_PARENT_SEND_FAILED'));});
 });
}
