/** Fixed scoped V3 job plumbing. Public artifacts remain read-only. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
import {projectRoot} from '@lianum/environment';
import { ROOT, FLAT, GOLDEN, LOCAL, LIMITS } from '@lianum/proofs/catalog';
import { regular, hash, verifyAPI, verifyVendor, resourceModuleURL } from '@lianum/proofs/tooling/tooling';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256, validateNativeIngressV3Job } from '@lianum/proofs/native-ingress/metadata/native-ingress-v3-profile';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { cloneInput } from '@lianum/components/plain-input';
export const GLOBAL_PROOF_LOCK = join(LOCAL,'active.lock');
export const V3_WORKER = fileURLToPath(new URL('../runtime/native-ingress-v3-worker.mjs',import.meta.url));
export const V3_ROLE_PROCESS = fileURLToPath(new URL('../runtime/native-ingress-v3-role-process.mjs',import.meta.url));
export const json=value=>JSON.stringify(value,null,2)+'\n';
export const readJSON=path=>JSON.parse(regular(path));
export function outputDirectory(path){
 assert.ok(path===NATIVE_INGRESS_V3_LOCAL||path.startsWith(NATIVE_INGRESS_V3_LOCAL+sep),'V3_JOB_OUTPUT_LOCATION');
 const missing=[];let parent=path;while(!existsSync(parent)){missing.push(parent);parent=dirname(parent);}
 assert.equal(realpathSync(parent),parent,'V3_JOB_OUTPUT_SYMLINK');for(const d of missing.reverse())mkdirSync(d,{mode:0o700});assert.equal(realpathSync(path),path);return path;
}
function assertOutput(path){assert.ok(resolve(path).startsWith(NATIVE_INGRESS_V3_LOCAL+sep),'V3_JOB_OUTPUT_LOCATION');outputDirectory(dirname(path));}
export function writeNew(path,value){assertOutput(path);writeFileSync(path,typeof value==='string'||value instanceof Uint8Array?value:json(value),{flag:'wx',mode:0o600});}
export function replace(path,value){assertOutput(path);if(existsSync(path))regular(path);const temp=path+'.tmp';writeNew(temp,value);renameSync(temp,path);}
export async function runtimePins(){
 const adopted=assertAdoptedSourceGeneration(),sourceFiles=new Map(adopted.sourceFiles.map(row=>[row.source,row.sourceSHA256]));
 const entries=[new URL('../../roles/role-client.mjs',import.meta.url),new URL('../runtime/native-ingress-v3-role-process.mjs',import.meta.url),
  new URL('./native-ingress-v3-run-bounded.mjs',import.meta.url),new URL('../runtime/native-ingress-v3-worker.mjs',import.meta.url),
  new URL('./native-ingress-v3-tooling.mjs',import.meta.url),resourceModuleURL];
 for(const url of entries){const path=fileURLToPath(url),source=relative(projectRoot,path).split(sep).join('/');
  assert.ok(sourceFiles.has(source),'V3_JOB_CURRENT_SOURCE_MEMBER');assert.equal(hash(regular(path)),sourceFiles.get(source),'V3_JOB_CURRENT_SOURCE_CHANGED');}
 const helpers=await import(resourceModuleURL);
 return{profile:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',sourceVersion:NATIVE_INGRESS_V3_SOURCE_VERSION,keySHA256:NATIVE_INGRESS_V3_KEY_SHA256,
  sourceGeneration:adopted.generation,currentSourceSHA256:adopted.sourceSHA256,
  local:adopted.sourceFiles.map(row=>({path:row.source,sha256:row.sourceSHA256})),api:verifyAPI(),vendor:verifyVendor(),toolchain:helpers.verifyToolchain(),crs:helpers.verifyCRS()};
}
let receivedOnce=false;
export function receiveNativeIngressV3Job(jobId,abi=null){
 assert.equal(receivedOnce,false,'V3_JOB_ONE_HANDOFF');receivedOnce=true;assert.equal(typeof process.send,'function','V3_JOB_IPC_REQUIRED');assert.ok(process.connected);
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;process.removeListener('message',receive);process.removeListener('disconnect',disconnect);error?reject(error):resolve(value);};
  const disconnect=()=>finish(Error('V3_JOB_PARENT_DISCONNECTED'));
  const receive=raw=>{try{const value=cloneInput(raw);exactRecord(value,['type','relation','role','jobId','inputs','expectedPublicInputs']);
   assert.equal(value.type,'flat-proof-inputs');assert.equal(value.relation,NATIVE_INGRESS_V3_SPEC.name);assert.equal(value.role,'claim_ingress');assert.equal(value.jobId,jobId);
   assert.ok(Buffer.byteLength(JSON.stringify(value))<=LIMITS.jobBytes,'V3_JOB_SIZE');
   const job=abi?validateNativeIngressV3Job(abi,value.inputs,value.expectedPublicInputs):{inputs:value.inputs,expectedPublicInputs:value.expectedPublicInputs};
   finish(null,job);
  }catch{finish(Error('V3_JOB_INVALID_PRIVATE_MESSAGE'));}};
  process.once('message',receive);process.once('disconnect',disconnect);
  process.send({type:'flat-proof-input-ready',relation:NATIVE_INGRESS_V3_SPEC.name,role:'claim_ingress',jobId},error=>{if(error)finish(Error('V3_JOB_PARENT_SEND_FAILED'));});
 });
}
