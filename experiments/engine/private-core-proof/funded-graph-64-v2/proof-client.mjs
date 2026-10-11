/** New fixed profile, not an alias of an original four-slot worker. One
 * recipient/job/role and one owned child per proof. Only its public result is
 * accepted, after actual VK verification and complete child close. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {readFileSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import {PAEG64_ROOT_V2,PAEG64_WORDS_V2,loadFundedGraph64ArtifactsV2} from './artifacts.mjs';
import {sealPrivateProofJobV1,wipePrivateProofInputsV1,privateProofAuthorizationBindingV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {PRIVATE_RESOURCE_POLICY as limits} from '@lianum/engine/crypto/private-resource-policy';
const clients=new WeakMap(),results=new WeakMap();
const relation=mode=>'funded_graph_global_'+mode;
const roles=Object.freeze({reserve:'owner',fulfill:'owner',ready:'dependency',admission:'local',withdraw:'recipient'});
const sha=v=>createHash('sha256').update(v).digest('hex');
function boundedInput(input){
 let nodes=0,characters=0;function visit(v,depth){assert.ok(++nodes<=300000&&depth<=32,'PAEG64_PRIVATE_JOB_BOUND');if(typeof v==='string'){characters+=v.length;assert.ok(characters<=2*1024*1024,'PAEG64_PRIVATE_JOB_BOUND');return v;}if(v===null||typeof v==='boolean'||(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0)))return v;assert.ok(v&&typeof v==='object'&&!types.isProxy(v),'PAEG64_PRIVATE_JOB_DATA');if(Array.isArray(v)){assert.ok(Object.getPrototypeOf(v)===Array.prototype&&v.length<=300000&&Reflect.ownKeys(v).length===v.length+1,'PAEG64_PRIVATE_JOB_DATA');return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));assert.ok(d&&Object.hasOwn(d,'value'),'PAEG64_PRIVATE_JOB_DATA');return visit(d.value,depth+1);});}assert.equal(Object.getPrototypeOf(v),Object.prototype,'PAEG64_PRIVATE_JOB_DATA');return Object.fromEntries(Reflect.ownKeys(v).map(k=>{assert.equal(typeof k,'string','PAEG64_PRIVATE_JOB_DATA');characters+=k.length;assert.ok(characters<=2*1024*1024,'PAEG64_PRIVATE_JOB_BOUND');const d=Object.getOwnPropertyDescriptor(v,k);assert.ok(d&&d.enumerable&&Object.hasOwn(d,'value'),'PAEG64_PRIVATE_JOB_DATA');return[k,visit(d.value,depth+1)];}));}return visit(input,0);
}
export function createFundedGraph64ProofClientV2(manifestSHA256){
 const manifest=loadFundedGraph64ArtifactsV2(manifestSHA256);const s={closed:false,busy:false,active:null};
 const client=Object.freeze({
  async prove(mode,input,expectedPublicInputs){
   assert.ok(!s.closed&&!s.busy&&Object.hasOwn(PAEG64_WORDS_V2,mode),'PAEG64_CLIENT_STATE');
   assert.ok(Array.isArray(expectedPublicInputs)&&expectedPublicInputs.length===PAEG64_WORDS_V2[mode],'PAEG64_EXPECTED_WORDS');
   const expected=expectedPublicInputs.map(v=>{assert.ok(typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v),'PAEG64_PUBLIC_WORD');return v;});
   const privateInput=boundedInput(input);let clear;
   try{const text=JSON.stringify(privateInput);assert.ok(Buffer.byteLength(text)<=2*1024*1024,'PAEG64_PRIVATE_JOB_BOUND');clear=Buffer.from(text);}catch(error){wipePrivateProofInputsV1(privateInput);throw error;}
   const jobId=randomUUID();const authorization=privateProofAuthorizationBindingV1({kind:'SCOPED_JOB_V1',jobId,
    consentSHA256:sha(JSON.stringify({profile:manifest.profile,manifestSHA256,mode,expected})),witnessSHA256:sha(clear)});clear.fill(0);
   s.busy=true;let child,closed=false,returned=null,failure=null,sent=false,readySeen=false,resolveStop;const done=new Promise(r=>{resolveStop=r;});
   const stop=code=>{failure??=code;if(child&&!closed){child.kill('SIGTERM');setTimeout(()=>{if(!closed)child.kill('SIGKILL');},5000).unref();}};
   const check=()=>{const available=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;const disk=statfsSync(PAEG64_ROOT_V2);assert.ok(available>=limits.floors.availableRAM&&disk.bavail*disk.bsize>=limits.floors.freeDisk,'PAEG64_RESOURCE_FLOOR');if(child&&!closed){let status;try{status=readFileSync('/proc/'+child.pid+'/status','utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}assert.ok(Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0)*1024<=limits.proofWorkerRSSLimit,'PAEG64_WORKER_RSS');}};
   let timer,monitor;
   try{
    check();child=spawn(process.execPath,['--max-old-space-size=384',join(PAEG64_ROOT_V2,'proof-process.mjs'),mode,jobId,manifestSHA256],{stdio:['ignore','pipe','pipe','ipc'],serialization:'json',env:{...process.env,NODE_OPTIONS:undefined}});s.active={stop,done};
    child.stdout.on('data',()=>stop('PAEG64_NO_PAYLOAD_STDOUT'));child.stderr.on('data',()=>stop('PAEG64_NO_PAYLOAD_STDERR'));
    timer=setTimeout(()=>stop('PAEG64_PROOF_DEADLINE'),600000);monitor=setInterval(()=>{try{check();}catch(e){stop(/^PAEG64_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG64_RESOURCE');}},250);
    const output=await new Promise((resolve,reject)=>{
     child.on('message',msg=>{try{
      assert.ok(!s.closed,'PAEG64_CLOSED');assert.ok(msg&&Object.getPrototypeOf(msg)===Object.prototype&&Buffer.byteLength(JSON.stringify(msg))<=4*1024*1024,'PAEG64_PUBLIC_PACKET');
      if(msg.type==='flat-private-proof-input-ready'){
       assert.ok(!readySeen&&!sent&&!returned,'PAEG64_ONE_RECIPIENT');readySeen=true;
       assert.equal(msg.relation,relation(mode));assert.equal(msg.role,roles[mode]);assert.equal(msg.jobId,jobId);
       const packet=sealPrivateProofJobV1(msg,{inputs:privateInput,expectedPublicInputs:expected,authorization});sent=true;
       child.send(packet,error=>{if(error)stop('PAEG64_IPC_SEND');});wipePrivateProofInputsV1(privateInput);return;
      }
      assert.deepEqual(Object.keys(msg).sort(),['bindingSHA256','jobId','manifestSHA256','mode','proof','publicInputs','type'].sort(),'PAEG64_RESULT_FIELDS');
      assert.ok(sent&&!returned&&msg.type==='funded-graph-64-public-result-v2','PAEG64_ONE_RESULT');assert.equal(msg.jobId,jobId);assert.equal(msg.mode,mode);assert.equal(msg.manifestSHA256,manifestSHA256);
      assert.equal(msg.bindingSHA256,sha(JSON.stringify(authorization)));assert.deepEqual(msg.publicInputs,expected,'PAEG64_PUBLIC_INPUT_JOIN');assert.match(msg.proof,/^(?:[0-9a-f]{2})+$/,'PAEG64_PROOF_HEX');assert.ok(msg.proof.length<=4*1024*1024,'PAEG64_PROOF_BOUND');returned=msg;
     }catch(e){stop(/^PAEG64_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG64_PACKET_REJECTED');}});
     child.once('error',e=>{failure='PAEG64_SPAWN_FAILED';reject(e);});
     child.once('close',(code,signal)=>{closed=true;if(failure||s.closed||code!==0||signal!==null||!returned)reject(new Error(failure??'PAEG64_PUBLIC_RESULT_REQUIRED'));else resolve(returned);});
    });
    assert.deepEqual(loadFundedGraph64ArtifactsV2(manifestSHA256),manifest,'PAEG64_ARTIFACTS_CHANGED');
    const result=Object.freeze({profile:manifest.profile,mode,jobId,proof:output.proof,publicInputs:Object.freeze([...expected]),manifestSHA256});results.set(result,{client,mode,proof:output.proof,publicInputs:[...expected]});return result;
   }finally{clearTimeout(timer);clearInterval(monitor);wipePrivateProofInputsV1(privateInput);if(child&&!closed){stop('PAEG64_CLIENT_DRAIN');await new Promise(r=>child.once('close',r));}s.active=null;s.busy=false;resolveStop();}
  },
  async close(){s.closed=true;if(s.active){s.active.stop('PAEG64_CLIENT_CLOSED');await s.active.done;}}
 });clients.set(client,{manifestSHA256,s});return client;
}
export function assertFundedGraph64ProofClientV2(client,manifestSHA256){const r=clients.get(client);assert.ok(r&&!r.s.closed&&r.manifestSHA256===manifestSHA256,'PAEG64_ORIGINAL_PROOF_CLIENT');}
export function readOriginalFundedGraph64ProofResultV2(client,result,mode){assert.ok(clients.get(client)&&results.get(result)?.client===client&&results.get(result)?.mode===mode,'PAEG64_ORIGINAL_PROOF_RESULT');const r=results.get(result);return{proof:Buffer.from(r.proof,'hex'),publicInputs:[...r.publicInputs]};}
