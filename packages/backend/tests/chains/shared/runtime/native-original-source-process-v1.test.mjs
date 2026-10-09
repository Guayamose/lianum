import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {isolatedRuntimeEnvironment,sleep} from '../../../../../engine/src/chains/shared/runtime-harness.mjs';
import {startOriginalNativeSourceProcessV1} from '../../../../src/operations/recovery/native-original-source-process-v1.mjs';

const helperUrl=new URL(import.meta.url.endsWith('/wallet-platform/modules/chain-adapters/native-original-source-process-v1.test.mjs')?'../ops/native-original-source-process-v1.mjs':'../../../../src/operations/recovery/native-original-source-process-v1.mjs',import.meta.url).href;
// Actual Node processes; no runtime, journal, proof, financial port or event
// mock. The child records the signal it actually receives from the kernel.
const childBody=String.raw`
import {readFileSync,writeFileSync} from 'node:fs';
const raw=readFileSync('/proc/self/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+1).trim().split(/\s+/);
const identity={pid:process.pid,parentPid:process.ppid,startTicks:fields[19]};
process.once('SIGTERM',()=>{writeFileSync('terminated.json',JSON.stringify({...identity,signal:'SIGTERM'}),{mode:0o600,flag:'wx'});process.exit(0);});
writeFileSync('ready.json',JSON.stringify(identity),{mode:0o600,flag:'wx'});
setInterval(()=>{},1000);
`;
const parentBody=String.raw`
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
const [directory,url,body]=process.argv.slice(1),helper=await import(url);
const handle=await helper.startOriginalNativeSourceProcessV1(process.execPath,['--input-type=module','--eval',body],directory);
const exit=once(handle.child,'exit'),close=once(handle.child,'close');
let identity;
for(let count=0;count<500;count++){try{identity=JSON.parse(await readFile(directory+'/ready.json','utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;await new Promise(resolve=>setTimeout(resolve,10));}}
assert.ok(identity);const guard=helper.readOriginalNativeSourceProcessGuardV1(handle);
assert.equal(identity.pid,guard.child.pid);assert.equal(identity.parentPid,guard.parent.pid);assert.equal(identity.startTicks,guard.child.startTicks);
const command=new Promise(resolve=>process.once('message',resolve));
await new Promise((resolve,reject)=>process.send({kind:'READY',identity,guard},error=>error?reject(error):resolve()));
const value=await command;
if(value==='EXIT17')process.exit(17);
assert.equal(value,'CLOSE');handle.assertAlive();handle.child.kill('SIGTERM');
const [code,signal]=await exit;await close;assert.equal(code,0);assert.equal(signal,null);process.exit(0);
`;
async function waitFor(read){
  const start=performance.now();for(;;){const value=await read();if(value)return value;assert.ok(performance.now()-start<10000,'HOST_ORIGINAL_PROCESS_EVIDENCE_TIMEOUT');await sleep(10);}
}
async function marker(directory,name){try{return JSON.parse(await readFile(join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function absent(identity){
  try{const raw=await readFile('/proc/'+identity.pid+'/stat','utf8'),fields=raw.slice(raw.lastIndexOf(')')+1).trim().split(/\s+/);assert.equal(fields[19],identity.startTicks,'HOST_OWNED_PROCESS_REUSED');return false;}
  catch(error){if(error.code==='ENOENT'||error.code==='ESRCH')return true;throw error;}
}

test('HOST SOURCE kernel parent-death guard stops only its original exec child', {timeout:30000},async()=>{
  assert.equal(process.platform,'linux');const directory=await mkdtemp(join(tmpdir(),'source-parent-death-'));
  const parents=[];
  try{
    await assert.rejects(startOriginalNativeSourceProcessV1(process.execPath,new Proxy([],{}),directory),/FIXED_ARGUMENTS_REQUIRED/);
    for(const abrupt of [false,true]){
      const own=join(directory,abrupt?'abrupt':'live');await mkdir(own,{mode:0o700});
      const parent=spawn(process.execPath,['--input-type=module','--eval',parentBody,own,helperUrl,childBody],
        {cwd:own,env:isolatedRuntimeEnvironment(own),stdio:['ignore','ignore','pipe','ipc']});parents.push(parent);
      parent.stderr.on('data',bytes=>bytes.fill(0));const exit=once(parent,'exit'),close=once(parent,'close');
      const received=await Promise.race([once(parent,'message').then(([value])=>value),exit.then(()=>{throw new Error('HOST_SOURCE_PARENT_EARLY_EXIT');})]);
      assert.equal(received.kind,'READY');assert.equal(received.guard.parentDeathSignal,'SIGTERM');assert.equal(received.guard.samePidAfterExec,true);
      assert.equal(received.guard.parent.pid,parent.pid);assert.equal(received.identity.pid,received.guard.child.pid);
      assert.equal(received.identity.startTicks,received.guard.child.startTicks);assert.equal(await absent(received.identity),false);
      if(!abrupt){await sleep(100);assert.equal(parent.exitCode,null);assert.equal(await absent(received.identity),false);assert.equal(await marker(own,'terminated.json'),null);}
      parent.send(abrupt?'EXIT17':'CLOSE');const [code,signal]=await exit;await close;assert.equal(code,abrupt?17:0);assert.equal(signal,null);
      const stopped=await waitFor(()=>marker(own,'terminated.json'));assert.equal(stopped.signal,'SIGTERM');assert.equal(stopped.pid,received.identity.pid);assert.equal(stopped.startTicks,received.identity.startTicks);
      await waitFor(()=>absent(received.identity));assert.equal(await absent(received.identity),true);
    }
  }finally{
    for(const parent of parents){if(parent.exitCode===null&&parent.signalCode===null){const done=once(parent,'close');parent.kill('SIGTERM');await done;}}
    await rm(directory,{recursive:true,force:true});
  }
});
