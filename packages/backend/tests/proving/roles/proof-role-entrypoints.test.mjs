/** Real scoped role children stop at invalid intake; no compiler/prover starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT} from '@lianum/proofs/catalog';
for(const [name,entry,ready,error] of [
 ['reservation',new URL('../../../../proofs/src/jobs/role-process.mjs',import.meta.url),'flat-private-proof-input-ready','PW_ROLE_JOB_FAILED'],
 ['native_claim_ingress_v3',new URL('../../../src/proving/native-ingress/runtime/native-ingress-v3-role-process.mjs',import.meta.url),'flat-proof-input-ready','V3_ROLE_JOB_FAILED'],
])test(`canonical ${name} role rejects malformed IPC without starting proof work`,{timeout:4000},async t=>{
 const child=fork(fileURLToPath(entry),[name],{execArgv:[],cwd:ROOT,env:{LANG:'C.UTF-8',PATH:'/usr/bin:/bin'},serialization:'json',stdio:['ignore','pipe','pipe','ipc']});
 t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
 let messages=0,out='',err='';child.stdout.on('data',b=>out+=b.toString());child.stderr.on('data',b=>err+=b.toString());
 child.on('message',message=>{assert.equal(message.type,ready);assert.equal(message.relation,name);messages++;child.send({malformed:true});});
 const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 assert.deepEqual(exit,{code:1,signal:null},err);assert.equal(err,'');assert.equal(messages,1);
 const result=JSON.parse(out);assert.equal(result.errorCode,error);assert.equal(result.phase,'failed');assert.equal(result.relation,name);assert.equal(Object.hasOwn(result,'proof'),false);
});
