/** HOST procfs regression for an exec transition observed on the actual
 * pinned BB process. No native process, witness, signature or funds here. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resourcePath} from '@lianum/environment';
const coordinator=23001,native=23002,worker=fileURLToPath(new URL('../../src/jobs/native-private-note-deposit-worker-v3.mjs',import.meta.url)),binary=resourcePath('engine','experiments/private-core-proof/node_modules/@aztec/bb.js/build/amd64-linux/bb'),argv=[binary,'msgpack','run','--input','/tmp/bb-'+coordinator+'-0-0.sock'];
let emptyReads=0,persistentEmpty=false,wrongArguments=false,reuseAfterEmpty=false,wrongExecutable=false,childReads=0,nativeTicks='100002';
function stat(pid){const fields=Array(30).fill('0');fields[0]='S';fields[1]=String(pid===coordinator?process.pid:coordinator);fields[2]='21000';fields[3]='21000';fields[19]=pid===coordinator?'100001':nativeTicks;return pid+' (host-fixture) '+fields.join(' ');}
mock.module('node:fs',{namedExports:{...Object.fromEntries(Object.entries(fs).filter(([key])=>key!=='default')),
 readFileSync(path,...args){const p=String(path);for(const pid of [coordinator,native]){
  if(p==='/proc/'+pid+'/stat')return stat(pid);
  if(p==='/proc/'+pid+'/status')return 'Name:\thost-fixture\nTgid:\t'+pid+'\nUid:\t'+Array(4).fill(process.getuid()).join('\t')+'\nVmRSS:\t1000 kB\n';
  if(p==='/proc/'+pid+'/cmdline'){
   if(pid===coordinator)return [process.execPath,worker].join('\0')+'\0';
   childReads++;if(persistentEmpty||emptyReads-->0){if(reuseAfterEmpty)nativeTicks='200002';return '';}
   return (wrongArguments?[...argv.slice(0,-1),'/tmp/caller.sock']:argv).join('\0')+'\0';
  }
 }return fs.readFileSync(path,...args);},
 readlinkSync(path,...args){if(String(path)==='/proc/'+native+'/exe')return wrongExecutable?'/tmp/caller-bb':binary;return fs.readlinkSync(path,...args);},
 readdirSync(path,...args){if(String(path)==='/proc')return [String(coordinator),String(native)];return fs.readdirSync(path,...args);}
}});
const nativeNote=await import('../../src/jobs/native-private-note-execution-v3.mjs');
function reset(){emptyReads=0;persistentEmpty=false;wrongArguments=false;reuseAfterEmpty=false;wrongExecutable=false;childReads=0;nativeTicks='100002';}
test('first D26/W39 backend enrollment waits only for an empty exec cmdline and preserves actual RSS',()=>{
 reset();try{emptyReads=2;const history=new Map(),sample=nativeNote.nativePrivateEconomicNoteResourcesV3(coordinator,history);assert.equal(childReads,3);assert.equal(sample.liveNativeBackends,1);assert.equal(sample.workerRSS,2048000);assert.equal(history.get(native).startTimeTicks,'100002');}finally{reset();}
});
test('persistent empty cmdline is rejected within a bounded attempt without enrolling a backend',()=>{
 reset();try{persistentEmpty=true;const history=new Map(),started=performance.now();assert.throws(()=>nativeNote.nativePrivateEconomicNoteResourcesV3(coordinator,history),/PW_NATIVE_FIXED_CHILD_ARGUMENTS/);assert.ok(performance.now()-started<1000);assert.equal(history.has(native),false);}finally{reset();}
});
test('a nonempty wrong command is rejected immediately, including after an empty transition',()=>{
 for(const reads of [0,1]){reset();try{emptyReads=reads;wrongArguments=true;const history=new Map();assert.throws(()=>nativeNote.nativePrivateEconomicNoteResourcesV3(coordinator,history),/PW_NATIVE_FIXED_CHILD_ARGUMENTS/);assert.equal(childReads,reads+1);assert.equal(history.has(native),false);}finally{reset();}}
});
test('PID reuse and executable replacement during enrollment remain rejected',()=>{
 reset();try{emptyReads=1;reuseAfterEmpty=true;assert.throws(()=>nativeNote.nativePrivateEconomicNoteResourcesV3(coordinator,new Map()),/PW_NATIVE_CHILD_IDENTITY_CHANGED/);}finally{reset();}
 try{wrongExecutable=true;assert.throws(()=>nativeNote.nativePrivateEconomicNoteResourcesV3(coordinator,new Map()),/PW_NATIVE_EXECUTABLE_CHANGED/);assert.equal(childReads,0);}finally{reset();}
});
