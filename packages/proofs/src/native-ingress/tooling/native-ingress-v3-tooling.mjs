/** Fixed scoped V3 job plumbing. Public artifacts remain read-only. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FLAT, GOLDEN, LOCAL, LIMITS } from '../../catalog.mjs';
import { regular, hash, verifyAPI, verifyVendor, resourceModuleURL } from '../../tooling/tooling.mjs';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256, validateNativeIngressV3Job } from '../metadata/native-ingress-v3-profile.mjs';
import { exactRecord } from '../../../../backend/src/execution/encoding/commitments.mjs';
import { cloneInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
export const GLOBAL_PROOF_LOCK = join(LOCAL,'active.lock');
export const V3_WORKER = join(ROOT,'proof-workers/native-ingress-v3-worker.mjs');
export const V3_ROLE_PROCESS = join(ROOT,'proof-workers/native-ingress-v3-role-process.mjs');
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
 const files=new Map();function visit(path){path=resolve(path);if(files.has(path))return;assert.ok([ROOT,FLAT,GOLDEN].some(r=>path.startsWith(r+sep)),'V3_JOB_SOURCE_LOCATION');
  const bytes=regular(path);files.set(path,{path:relative(ROOT,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});
  for(const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+)(['"])([^'"]+)\1/gm)){if(match[2].startsWith('node:'))continue;assert.ok(match[2].startsWith('.'),'V3_JOB_LOCAL_SOURCE');visit(resolve(dirname(path),match[2]));}}
 for(const name of ['role-client.mjs','native-ingress-v3-role-process.mjs','native-ingress-v3-run-bounded.mjs','native-ingress-v3-worker.mjs','native-ingress-v3-tooling.mjs'])visit(join(ROOT,'proof-workers',name));
 visit(fileURLToPath(resourceModuleURL));
 const helpers=await import(resourceModuleURL);
 return{profile:'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',sourceVersion:NATIVE_INGRESS_V3_SOURCE_VERSION,keySHA256:NATIVE_INGRESS_V3_KEY_SHA256,
  local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),api:verifyAPI(),vendor:verifyVendor(),toolchain:helpers.verifyToolchain(),crs:helpers.verifyCRS()};
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
