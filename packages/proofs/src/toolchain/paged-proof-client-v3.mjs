/** New fixed profile, not an alias of an original four-slot worker. One
 * recipient/job/role and one owned child per proof. Only its public result is
 * accepted, after actual VK verification and complete child close. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {types} from 'node:util';
import {readFileSync,statfsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PAEG_PAGED_ROOT_V3,PAEG_PAGED_WORDS_V3,loadFundedPagedGraphArtifactsV3} from './paged-artifacts-v3.mjs';
import {sealPrivateProofJobV1,wipePrivateProofInputsV1,privateProofAuthorizationBindingV1} from '@lianum/engine/crypto/private-proof-transit-v1';
import {readOriginalFundedPagedGraphProofJobV3,closeFundedPagedGraphProofJobV3} from '@lianum/engine/execution/graph/funded-graph-paged-v3';
import {PRIVATE_RESOURCE_POLICY as limits} from '@lianum/components/resources/private-resource-policy';
const clients=new WeakMap(),results=new WeakMap();
const relation=mode=>'funded_graph_paged_'+mode;
const roles=Object.freeze({reserve:'owner',fold:'owner',terminal:'owner',admission:'local',withdraw:'recipient'});
const sha=v=>createHash('sha256').update(v).digest('hex');
function boundedInput(input){
 let nodes=0,characters=0;function visit(v,depth){assert.ok(++nodes<=300000&&depth<=32,'PAEG_PAGED_PRIVATE_JOB_BOUND');if(typeof v==='string'){characters+=v.length;assert.ok(characters<=2*1024*1024,'PAEG_PAGED_PRIVATE_JOB_BOUND');return v;}if(v===null||typeof v==='boolean'||(Number.isSafeInteger(v)&&v>=0&&!Object.is(v,-0)))return v;assert.ok(v&&typeof v==='object'&&!types.isProxy(v),'PAEG_PAGED_PRIVATE_JOB_DATA');if(Array.isArray(v)){assert.ok(Object.getPrototypeOf(v)===Array.prototype&&v.length<=300000&&Reflect.ownKeys(v).length===v.length+1,'PAEG_PAGED_PRIVATE_JOB_DATA');return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));assert.ok(d&&Object.hasOwn(d,'value'),'PAEG_PAGED_PRIVATE_JOB_DATA');return visit(d.value,depth+1);});}assert.equal(Object.getPrototypeOf(v),Object.prototype,'PAEG_PAGED_PRIVATE_JOB_DATA');return Object.fromEntries(Reflect.ownKeys(v).map(k=>{assert.equal(typeof k,'string','PAEG_PAGED_PRIVATE_JOB_DATA');characters+=k.length;assert.ok(characters<=2*1024*1024,'PAEG_PAGED_PRIVATE_JOB_BOUND');const d=Object.getOwnPropertyDescriptor(v,k);assert.ok(d&&d.enumerable&&Object.hasOwn(d,'value'),'PAEG_PAGED_PRIVATE_JOB_DATA');return[k,visit(d.value,depth+1)];}));}return visit(input,0);
}
export function createFundedPagedGraphProofClientV3(manifestSHA256){
 const manifest=loadFundedPagedGraphArtifactsV3(manifestSHA256);const s={closed:false,busy:false,active:null};
 const client=Object.freeze({
  async provePrepared(compiled,originalJob){
   assert.ok(!s.closed&&!s.busy,'PAEG_PAGED_CLIENT_STATE');const job=readOriginalFundedPagedGraphProofJobV3(compiled,originalJob);closeFundedPagedGraphProofJobV3(originalJob);try{return await client.prove(job.mode,job.inputs,job.expectedPublicInputs);}finally{wipePrivateProofInputsV1(job.inputs);}
  },
  async prove(mode,input,expectedPublicInputs){
   assert.ok(!s.closed&&!s.busy&&Object.hasOwn(PAEG_PAGED_WORDS_V3,mode),'PAEG_PAGED_CLIENT_STATE');
   assert.ok(Array.isArray(expectedPublicInputs)&&expectedPublicInputs.length===PAEG_PAGED_WORDS_V3[mode],'PAEG_PAGED_EXPECTED_WORDS');
   const expected=expectedPublicInputs.map(v=>{assert.ok(typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v),'PAEG_PAGED_PUBLIC_WORD');return v;});
   const privateInput=boundedInput(input);let clear;
   try{const text=JSON.stringify(privateInput);assert.ok(Buffer.byteLength(text)<=2*1024*1024,'PAEG_PAGED_PRIVATE_JOB_BOUND');clear=Buffer.from(text);}catch(error){wipePrivateProofInputsV1(privateInput);throw error;}
   const jobId=randomUUID();const authorization=privateProofAuthorizationBindingV1({kind:'SCOPED_JOB_V1',jobId,
    consentSHA256:sha(JSON.stringify({profile:manifest.profile,manifestSHA256,mode,expected})),witnessSHA256:sha(clear)});clear.fill(0);
   s.busy=true;let child,closed=false,returned=null,failure=null,sent=false,readySeen=false,resolveStop;const done=new Promise(r=>{resolveStop=r;});
   const stop=code=>{failure??=code;if(child&&!closed){child.kill('SIGTERM');setTimeout(()=>{if(!closed)child.kill('SIGKILL');},5000).unref();}};
   const check=()=>{const available=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;const disk=statfsSync(PAEG_PAGED_ROOT_V3);assert.ok(available>=limits.floors.availableRAM&&disk.bavail*disk.bsize>=limits.floors.freeDisk,'PAEG_PAGED_RESOURCE_FLOOR');if(child&&!closed){let status;try{status=readFileSync('/proc/'+child.pid+'/status','utf8');}catch(e){if(e.code==='ENOENT')return;throw e;}assert.ok(Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0)*1024<=limits.proofWorkerRSSLimit,'PAEG_PAGED_WORKER_RSS');}};
   let timer,monitor;
   try{
    check();child=spawn(process.execPath,['--max-old-space-size=384',fileURLToPath(new URL('./paged-proof-process-v3.mjs',import.meta.url)),mode,jobId,manifestSHA256],{stdio:['ignore','pipe','pipe','ipc'],serialization:'json',env:{...process.env,NODE_OPTIONS:undefined}});s.active={stop,done};
    child.stdout.on('data',()=>stop('PAEG_PAGED_NO_PAYLOAD_STDOUT'));child.stderr.on('data',()=>stop('PAEG_PAGED_NO_PAYLOAD_STDERR'));
    timer=setTimeout(()=>stop('PAEG_PAGED_PROOF_DEADLINE'),600000);monitor=setInterval(()=>{try{check();}catch(e){stop(/^PAEG_PAGED_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG_PAGED_RESOURCE');}},250);
    const output=await new Promise((resolve,reject)=>{
     child.on('message',msg=>{try{
      assert.ok(!s.closed,'PAEG_PAGED_CLOSED');assert.ok(msg&&Object.getPrototypeOf(msg)===Object.prototype&&Buffer.byteLength(JSON.stringify(msg))<=4*1024*1024,'PAEG_PAGED_PUBLIC_PACKET');
      if(msg.type==='flat-private-proof-input-ready'){
       assert.ok(!readySeen&&!sent&&!returned,'PAEG_PAGED_ONE_RECIPIENT');readySeen=true;
       assert.equal(msg.relation,relation(mode));assert.equal(msg.role,roles[mode]);assert.equal(msg.jobId,jobId);
       const packet=sealPrivateProofJobV1(msg,{inputs:privateInput,expectedPublicInputs:expected,authorization});sent=true;
       child.send(packet,error=>{if(error)stop('PAEG_PAGED_IPC_SEND');});wipePrivateProofInputsV1(privateInput);return;
      }
      assert.deepEqual(Object.keys(msg).sort(),['bindingSHA256','jobId','manifestSHA256','mode','proof','publicInputs','type'].sort(),'PAEG_PAGED_RESULT_FIELDS');
      assert.ok(sent&&!returned&&msg.type==='funded-graph-paged-public-result-v3','PAEG_PAGED_ONE_RESULT');assert.equal(msg.jobId,jobId);assert.equal(msg.mode,mode);assert.equal(msg.manifestSHA256,manifestSHA256);
      assert.equal(msg.bindingSHA256,sha(JSON.stringify(authorization)));assert.deepEqual(msg.publicInputs,expected,'PAEG_PAGED_PUBLIC_INPUT_JOIN');assert.match(msg.proof,/^(?:[0-9a-f]{2})+$/,'PAEG_PAGED_PROOF_HEX');assert.ok(msg.proof.length<=4*1024*1024,'PAEG_PAGED_PROOF_BOUND');returned=msg;
     }catch(e){stop(/^PAEG_PAGED_[A-Z0-9_]+/.exec(e.message)?.[0]??'PAEG_PAGED_PACKET_REJECTED');}});
     child.once('error',e=>{failure='PAEG_PAGED_SPAWN_FAILED';reject(e);});
     child.once('close',(code,signal)=>{closed=true;if(failure||s.closed||code!==0||signal!==null||!returned)reject(new Error(failure??'PAEG_PAGED_PUBLIC_RESULT_REQUIRED'));else resolve(returned);});
    });
    assert.deepEqual(loadFundedPagedGraphArtifactsV3(manifestSHA256),manifest,'PAEG_PAGED_ARTIFACTS_CHANGED');
    const result=Object.freeze({profile:manifest.profile,mode,jobId,proof:output.proof,publicInputs:Object.freeze([...expected]),manifestSHA256});results.set(result,{client,mode,proof:output.proof,publicInputs:[...expected]});return result;
   }finally{clearTimeout(timer);clearInterval(monitor);wipePrivateProofInputsV1(privateInput);if(child&&!closed){stop('PAEG_PAGED_CLIENT_DRAIN');await new Promise(r=>child.once('close',r));}s.active=null;s.busy=false;resolveStop();}
  },
  async close(){s.closed=true;if(s.active){s.active.stop('PAEG_PAGED_CLIENT_CLOSED');await s.active.done;}}
 });clients.set(client,{manifestSHA256,s});return client;
}
export function assertFundedPagedGraphProofClientV3(client,manifestSHA256){const r=clients.get(client);assert.ok(r&&!r.s.closed&&r.manifestSHA256===manifestSHA256,'PAEG_PAGED_ORIGINAL_PROOF_CLIENT');}
export function readOriginalFundedPagedGraphProofResultV3(client,result,mode){assert.ok(clients.get(client)&&!clients.get(client).s.closed&&results.get(result)?.client===client&&results.get(result)?.mode===mode,'PAEG_PAGED_ORIGINAL_PROOF_RESULT');const r=results.get(result);return{proof:Buffer.from(r.proof,'hex'),publicInputs:[...r.publicInputs]};}
