/** Fixed scoped native-value V2 job plumbing. Public artifacts remain read-only. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FLAT, GOLDEN, LOCAL, LIMITS } from '../../catalog.mjs';
import { regular, hash, verifyAPI, verifyVendor, resourceModuleURL } from '../../tooling/tooling.mjs';
import { NATIVE_VALUE_LIVE_V2_LOCAL, NATIVE_VALUE_LIVE_V2_SPEC, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,
  NATIVE_VALUE_LIVE_V2_KEY_SHA256, validateNativeValueLiveV2Job } from '../metadata/native-value-live-v2-profile.mjs';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { assertNativeValueLiveSourcePins } from '../metadata/native-value-live-v2-artifacts.mjs';
import { cloneInput } from '../../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
export const GLOBAL_PROOF_LOCK = join(LOCAL,'active.lock');
export const NV2_WORKER = join(ROOT,'proof-workers/native-value-live-v2-worker.mjs');
export const NV2_ROLE_PROCESS = join(ROOT,'proof-workers/native-value-live-v2-role-process.mjs');
export const json=value=>JSON.stringify(value,null,2)+'\n';
export const readJSON=path=>JSON.parse(regular(path));
export function outputDirectory(path){
 assert.ok(path===NATIVE_VALUE_LIVE_V2_LOCAL||path.startsWith(NATIVE_VALUE_LIVE_V2_LOCAL+sep),'NV2_JOB_OUTPUT_LOCATION');
 const missing=[];let parent=path;while(!existsSync(parent)){missing.push(parent);parent=dirname(parent);}
 assert.equal(realpathSync(parent),parent,'NV2_JOB_OUTPUT_SYMLINK');for(const d of missing.reverse())mkdirSync(d,{mode:0o700});assert.equal(realpathSync(path),path);return path;
}
function assertOutput(path){assert.ok(resolve(path).startsWith(NATIVE_VALUE_LIVE_V2_LOCAL+sep),'NV2_JOB_OUTPUT_LOCATION');outputDirectory(dirname(path));}
export function writeNew(path,value){assertOutput(path);writeFileSync(path,typeof value==='string'||value instanceof Uint8Array?value:json(value),{flag:'wx',mode:0o600});}
export function replace(path,value){assertOutput(path);if(existsSync(path))regular(path);const temp=path+'.tmp';writeNew(temp,value);renameSync(temp,path);}
export async function runtimePins(){
 assertNativeValueLiveSourcePins();
 const files=new Map();function visit(path){path=resolve(path);if(files.has(path))return;assert.ok([ROOT,FLAT,GOLDEN].some(r=>path.startsWith(r+sep)),'NV2_JOB_SOURCE_LOCATION');
  const bytes=regular(path);files.set(path,{path:relative(ROOT,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});
  for(const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+)(['"])([^'"]+)\1/gm)){if(match[2].startsWith('node:'))continue;assert.ok(match[2].startsWith('.'),'NV2_JOB_LOCAL_SOURCE');visit(resolve(dirname(path),match[2]));}}
 for(const name of ['native-value-live-v2-client.mjs','native-value-live-v2-role-process.mjs','native-value-live-v2-run-bounded.mjs','native-value-live-v2-worker.mjs','native-value-live-v2-tooling.mjs'])visit(join(ROOT,'proof-workers',name));
 visit(fileURLToPath(resourceModuleURL));
 const helpers=await import(resourceModuleURL);
 return{profile:'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2',sourceVersion:NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,keySHA256:NATIVE_VALUE_LIVE_V2_KEY_SHA256,
  local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),api:verifyAPI(),vendor:verifyVendor(),toolchain:helpers.verifyToolchain(),crs:helpers.verifyCRS()};
}
let receivedOnce=false;
export function receiveNativeValueLiveV2Job(jobId,abi=null){
 assert.equal(receivedOnce,false,'NV2_JOB_ONE_HANDOFF');receivedOnce=true;assert.equal(typeof process.send,'function','NV2_JOB_IPC_REQUIRED');assert.ok(process.connected);
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;process.removeListener('message',receive);process.removeListener('disconnect',disconnect);error?reject(error):resolve(value);};
  const disconnect=()=>finish(Error('NV2_JOB_PARENT_DISCONNECTED'));
  const receive=raw=>{try{const value=cloneInput(raw);exactRecord(value,['type','relation','role','jobId','inputs','expectedPublicInputs']);
   assert.equal(value.type,'flat-proof-inputs');assert.equal(value.relation,NATIVE_VALUE_LIVE_V2_SPEC.name);assert.equal(value.role,'local');assert.equal(value.jobId,jobId);
   assert.ok(Buffer.byteLength(JSON.stringify(value))<=LIMITS.jobBytes,'NV2_JOB_SIZE');
   const job=abi?validateNativeValueLiveV2Job(abi,value.inputs,value.expectedPublicInputs):{inputs:value.inputs,expectedPublicInputs:value.expectedPublicInputs};
   finish(null,job);
  }catch{finish(Error('NV2_JOB_INVALID_PRIVATE_MESSAGE'));}};
  process.once('message',receive);process.once('disconnect',disconnect);
  process.send({type:'flat-proof-input-ready',relation:NATIVE_VALUE_LIVE_V2_SPEC.name,role:'local',jobId},error=>{if(error)finish(Error('NV2_JOB_PARENT_SEND_FAILED'));});
 });
}
