/** Real SDK, encrypted phone custody, authority and retained OWNER/Source
 * journals. Canonical RPC, proof execution and Expo remain explicit HOST ports.
 * These checks do not claim live chain or physical-device acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

for(const [name,fixture,flags] of [
 ['expired retained BEGIN: lost acknowledgement, replay fence, cold reopen and same-note renewal','device-paged-warm-proof-intent-recovery-v10.test.mjs',{LIANUM_HOST_EXPIRED_BEGIN_RECOVERY_V47:'1'}],
 ['an accepted BEGIN wins the cancellation race and is never reset','device-paged-warm-proof-intent-recovery-v10.test.mjs',{LIANUM_HOST_EXPIRED_BEGIN_RECOVERY_V47:'1',LIANUM_HOST_BEGIN_ACCEPTANCE_WINS_V47:'1'}],
 ['DeFi coordinator retires an expired request before its new proposal','device-sepolia-defi-paeg-investment-v8.test.mjs',{LIANUM_HOST_DEFI_SEED_RECOVERY_V45:'expired-command'}],
])test(name,{timeout:60000},async()=>{
 const env={...process.env,NODE_TEST_CONTEXT:undefined,LIANUM_HOST_EXPIRED_BEGIN_RECOVERY_V47:undefined,LIANUM_HOST_BEGIN_ACCEPTANCE_WINS_V47:undefined,LIANUM_HOST_DEFI_SEED_RECOVERY_V45:undefined,...flags};
 const child=spawn(process.execPath,['--experimental-test-module-mocks','--test',new URL('./'+fixture,import.meta.url).pathname],{env,stdio:['ignore','pipe','pipe']});let output='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk).slice(-16000);});
 const timer=setTimeout(()=>child.kill('SIGTERM'),55000);timer.unref();
 try{const [code,signal]=await once(child,'exit');assert.equal(signal,null,output);assert.equal(code,0,output);}
 finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');}
});
