/** Original guard/classification and procfs budget test. No native process,
 * witness, prover or financial grant; kernel rows below are explicit HOST DATA. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resourcePath} from '@lianum/environment';
import {PRIVATE_RESOURCE_POLICY} from '@lianum/components/resources/private-resource-policy';
const coordinator=22001,native=22002,worker=fileURLToPath(new URL('../../src/toolchain/paged-proof-process-v3.mjs',import.meta.url)),binary=resourcePath('engine','experiments/private-core-proof/node_modules/@aztec/bb.js/build/amd64-linux/bb');
const argv=[process.execPath,'--max-old-space-size=384',worker,'fold','11111111-2222-4333-8444-555555555555','a'.repeat(64)];
let coordinatorRSS=900000000,nativeRSS=1800000000,children=String(native),descendants='',nativeTicks='100002';
function stat(pid){const f=Array(30).fill('0');f[0]='S';f[1]=String(pid===coordinator?process.pid:coordinator);f[2]='21000';f[3]='21000';f[19]=pid===coordinator?'100001':nativeTicks;return String(pid)+' (host-fixture) '+f.join(' ');}
mock.module('node:fs',{namedExports:{...Object.fromEntries(Object.entries(fs).filter(([k])=>k!=='default')),readFileSync(path,...args){
 const p=String(path);for(const pid of [coordinator,native]){
  if(p==='/proc/'+pid+'/stat')return stat(pid);
  if(p==='/proc/'+pid+'/status')return 'Name:\thost-fixture\nTgid:\t'+pid+'\nUid:\t'+Array(4).fill(process.getuid()).join('\t')+'\nVmRSS:\t'+Math.ceil((pid===coordinator?coordinatorRSS:nativeRSS)/1024)+' kB\n';
  if(p==='/proc/'+pid+'/cmdline')return (pid===coordinator?argv:[binary,'msgpack','run','--input','/tmp/bb-'+coordinator+'-0-0.sock']).join('\0')+'\0';
  if(p==='/proc/'+pid+'/task/'+pid+'/children')return pid===coordinator?children:descendants;
 }
 return fs.readFileSync(path,...args);
},readlinkSync(path,...args){if(String(path)==='/proc/'+native+'/exe')return binary;return fs.readlinkSync(path,...args);}}});
const helper=await import('../../src/toolchain/paged-native-prover-v3.mjs');

test('fixed Paged native recognizes only its canonical worker and owned BB command',()=>{
 assert.equal(helper.PAGED_NATIVE_PROVER_THREADS_V3,12);
 assert.deepEqual(helper.classifyPagedNativeProverProcessV3(argv,process.execPath,null),{role:'paged-native-coordinator',proofWorker:false});
 const nativeArgv=[binary,'msgpack','run','--input','/tmp/bb-'+coordinator+'-0-0.sock'];
 assert.deepEqual(helper.classifyPagedNativeProverProcessV3(nativeArgv,binary,{pid:coordinator,argv}),{role:'paged-native-backend',proofWorker:true});
 assert.equal(helper.classifyPagedNativeProverProcessV3([...argv.slice(0,3),'deposit',...argv.slice(4)],process.execPath,null),null);
 assert.equal(helper.classifyPagedNativeProverProcessV3([...argv.slice(0,2),'/tmp/caller-worker.mjs',...argv.slice(3)],process.execPath,null),null);
 assert.equal(helper.classifyPagedNativeProverProcessV3([argv[0],...argv.slice(2)],process.execPath,null),null);
 assert.equal(helper.classifyPagedNativeProverProcessV3([argv[0],'--max-old-space-size=512',...argv.slice(2)],process.execPath,null),null);
 assert.equal(helper.classifyPagedNativeProverProcessV3([argv[0],argv[1],'--inspect',...argv.slice(2)],process.execPath,null),null);
 assert.equal(helper.classifyPagedNativeProverProcessV3(nativeArgv,'/tmp/caller-bb',{pid:coordinator,argv}),null);
 assert.throws(()=>helper.classifyPagedNativeProverProcessV3([...nativeArgv.slice(0,-1),'/tmp/caller.sock'],binary,{pid:coordinator,argv}),/PAEG_PAGED_NATIVE_FIXED_CHILD_ARGUMENTS/);
});
test('native factory/current/destroy reject arbitrary options or reconstructed API',async()=>{
 await assert.rejects(helper.initializePagedNativeProverV3({threads:12}));
 await assert.rejects(helper.initializePagedNativeProverV3(),/PAEG_PAGED_NATIVE_ORIGINAL_WORKER/);
 assert.throws(()=>helper.assertPagedNativeProverCurrentV3({}),/PAEG_PAGED_NATIVE_ORIGINAL_API/);
 await assert.rejects(helper.destroyPagedNativeProverV3({}),/PAEG_PAGED_NATIVE_ORIGINAL_API/);
});
test('same 3GiB includes coordinator and native backend, rather than two separate budgets',()=>{
 const sample=helper.pagedNativeProofResourcesV3(coordinator,new Map());
 assert.equal(sample.liveNativeBackends,1);assert.equal(sample.workerRSS,sample.coordinatorRSS+sample.nativeBackendRSS);
 assert.ok(sample.coordinatorRSS>=coordinatorRSS&&sample.nativeBackendRSS>=nativeRSS);
 assert.equal(PRIVATE_RESOURCE_POLICY.proofWorkerRSSLimit,3221225472);
 const before=nativeRSS;try{nativeRSS=2600000000;const larger=helper.pagedNativeProofResourcesV3(coordinator,new Map());assert.ok(larger.workerRSS>PRIVATE_RESOURCE_POLICY.proofWorkerRSSLimit,'parent uses the same unchanged RSS guard');}finally{nativeRSS=before;}
});
test('native PID reuse cannot keep a retained resource identity',()=>{
 const history=new Map();helper.pagedNativeProofResourcesV3(coordinator,history);const before=nativeTicks;try{nativeTicks='200002';assert.throws(()=>helper.pagedNativeProofResourcesV3(coordinator,history),/PAEG_PAGED_NATIVE_CHILD_IDENTITY/);}finally{nativeTicks=before;}
});
test('unexpected second backend or native descendant fails closed',()=>{
 const before=children;try{children+=' 22003';assert.throws(()=>helper.pagedNativeProofResourcesV3(coordinator,new Map()),/PAEG_PAGED_NATIVE_ONE_BACKEND/);}finally{children=before;}
 try{descendants='22004';assert.throws(()=>helper.pagedNativeProofResourcesV3(coordinator,new Map()),/PAEG_PAGED_NATIVE_EXTRA_PRODUCER/);}finally{descendants='';}
});
