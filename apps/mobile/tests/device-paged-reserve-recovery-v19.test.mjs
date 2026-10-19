/** Reuse the real SDK/Vault/Authority/OWNER/Source HOST fixture. No public
 * RPC, user storage, financial wire replay or SNARK acceptance is asserted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

for(const [name,flag] of [
 ['lost reserve marker','LIANUM_HOST_UNTRACKED_RESERVE_V19'],
 ['expired unreserved intent stays retained without a proof, send or renewed grant','LIANUM_HOST_EXPIRED_UNTRACKED_RESERVE_V21'],
 ['a closed reserve window quarantines the plan even while its grant is live','LIANUM_HOST_CLOSED_RESERVE_WINDOW_V21'],
 ['automatic computation recovery stops after one failed retry','LIANUM_HOST_REPEAT_PROOF_FAILURE_V19']
])test(name,{timeout:90000},async()=>{
 const env={...process.env,NODE_TEST_CONTEXT:undefined,LIANUM_HOST_UNTRACKED_RESERVE_V19:undefined,LIANUM_HOST_REPEAT_PROOF_FAILURE_V19:undefined,LIANUM_HOST_EXPIRED_UNTRACKED_RESERVE_V21:undefined,LIANUM_HOST_CLOSED_RESERVE_WINDOW_V21:undefined,[flag]:'1'};
 const child=spawn(process.execPath,['--experimental-test-module-mocks','--test',new URL('./device-paged-warm-proof-intent-recovery-v10.test.mjs',import.meta.url).pathname],{env,stdio:['ignore','pipe','pipe']});let output='';
 const timer=setTimeout(()=>child.kill('SIGTERM'),80000);timer.unref();
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16000);});
 try{const [code,signal]=await once(child,'exit');assert.equal(signal,null,output);assert.equal(code,0,output);}
 finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
});
