/** Actual helper source, original pinned SDK destroy, inert lower process/socket
 * fixtures. No native binary, proof, ledger, IPC authority or financial grant. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {ChildProcess} from 'node:child_process';
import {Socket} from 'node:net';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {resourcePath} from '@lianum/environment';
const sourceURL=new URL('../../src/toolchain/paged-native-prover-v3.mjs',import.meta.url),sourcePath=fileURLToPath(sourceURL);
const binary=resourcePath('engine','experiments/private-core-proof/node_modules/@aztec/bb.js/build/amd64-linux/bb');
const {BarretenbergNativeSocketAsyncBackend}=await import(pathToFileURL(resourcePath('engine','experiments/private-core-proof/node_modules/@aztec/bb.js/dest/node/bb_backends/node/native_socket.js')).href);

async function fixture(failAtAcquisition){
 const parentPID=23001,childPID=23002,socketPath='/tmp/bb-'+parentPID+'-0-0.sock';
 let acquired=false,closed=false,present=false,foreignExecutable=failAtAcquisition,destroyCalls=0,unlinks=0;
 const child=new ChildProcess();child.pid=childPID;child.stdout=new PassThrough();child.stderr=new PassThrough();
 const socket=new Socket();
 const socketMetadata={dev:1n,ino:2n,uid:BigInt(process.getuid()),size:0n,mode:0o140600n,nlink:1n,mtimeNs:1n,ctimeNs:1n,isSocket:()=>true};
 child.kill=signal=>{assert.equal(signal,'SIGTERM');destroyCalls++;queueMicrotask(()=>{closed=true;child.exitCode=0;child.signalCode=null;child.stdout.destroy();child.stderr.destroy();child.emit('close',0,null);});return true;};
 const backend=new BarretenbergNativeSocketAsyncBackend(child,socket),api={backend,destroy:()=>backend.destroy()};
 const command=[process.execPath,'--max-old-space-size=384',fileURLToPath(new URL('../../src/toolchain/paged-proof-process-v3.mjs',import.meta.url)),'fold','11111111-2222-4333-8444-555555555555','a'.repeat(64)];
 const parent={pid:parentPID,ppid:20000,pgrp:20000,session:20000,startTimeTicks:'100001'};
 const childStat={pid:childPID,ppid:parentPID,pgrp:20000,session:20000,startTimeTicks:'100002'};
 const proc=pid=>pid===parentPID?parent:pid===childPID&&!closed?childStat:null;
 const readFileSync=(path,...args)=>{
  if(path==='/proc/'+parentPID+'/cmdline')return command.join('\0')+'\0';
  if(path==='/proc/'+childPID+'/cmdline')return [binary,'msgpack','run','--input',socketPath].join('\0')+'\0';
  if(path==='/proc/'+childPID+'/status')return 'Uid:\t'+Array(4).fill(process.getuid()).join('\t')+'\n';
  if(path==='/proc/'+childPID+'/environ')return 'HARDWARE_CONCURRENCY=12\0';
  return fs.readFileSync(path,...args);
 };
 // Normalize public fixture arrays across VM realms; original checks and values
 // remain exact. No proof input or production assertion is replaced.
 const realmAssert=Object.assign((...args)=>assert(...args),assert,{deepEqual(actual,expected,...args){return assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),...args);}});
 const context={assert:realmAssert,ChildProcess,Socket,accessSync:fs.accessSync,constants:fs.constants,closeSync:fs.closeSync,fstatSync:fs.fstatSync,openSync:fs.openSync,readFileSync,
  lstatSync(path,...args){if(path!==socketPath)return fs.lstatSync(path,...args);if(!present)throw Object.assign(new Error('missing inert socket'),{code:'ENOENT'});return socketMetadata;},
  readlinkSync(path,...args){if(path==='/proc/'+childPID+'/exe')return foreignExecutable?'/tmp/foreign-executable':binary;return fs.readlinkSync(path,...args);},
  realpathSync(path,...args){return path===socketPath?path:fs.realpathSync(path,...args);},
  statSync(path,...args){return fs.statSync(path==='/proc/'+childPID+'/exe'?binary:path,...args);},
  unlinkSync(path){assert.equal(path,socketPath);assert.equal(present,true);present=false;unlinks++;},
  join,fileURLToPath,pathToFileURL,createHash,resourcePath,nativeProcStatV1:proc,nativeOwnedRSSV1:()=>assert.fail('unexpected RSS fixture'),URL,Buffer,performance,
  process:{execPath:process.execPath,argv:[command[0],...command.slice(2)],execArgv:[command[1]],pid:parentPID,platform:'linux',arch:'x64',connected:true,send(){},getuid:process.getuid,umask:process.umask},
  loadOfficialProofLibrariesV1:async()=>({BackendType:{NativeUnixSocket:2},Barretenberg:{async new(options){assert.equal(options.threads,12);assert.equal(options.bbPath,binary);acquired=true;present=true;return api;}}}),
 };
 // Imports are lower fixture ports; all validation/retention/cleanup bodies are
 // read directly from the applied source. The backend class and destroy above
 // are the real installed pinned SDK implementation, not a mirrored algorithm.
 const source=fs.readFileSync(sourcePath,'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(sourceURL.href));
 const helper=vm.runInNewContext(source+'\n({initializePagedNativeProverV3,assertPagedNativeProverCurrentV3,destroyPagedNativeProverV3})',context,{filename:sourcePath,importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 return {helper,api,failCurrent(){foreignExecutable=true;},state:()=>({acquired,closed,present,destroyCalls,unlinks,streamsClosed:child.stdout.closed&&child.stderr.closed,socketClosed:socket.closed})};
}

test('a validation failure after SDK acquisition drains the original handle and preserves its rejection',async()=>{
 const f=await fixture(true);
 await assert.rejects(f.helper.initializePagedNativeProverV3(),error=>error.message.split('\n')[0]==='PAEG_PAGED_NATIVE_EXECUTABLE'&&!error.nativeCleanupFailed);
 assert.deepEqual(f.state(),{acquired:true,closed:true,present:false,destroyCalls:1,unlinks:1,streamsClosed:true,socketClosed:true});
 await assert.rejects(f.helper.destroyPagedNativeProverV3(f.api),/PAEG_PAGED_NATIVE_ORIGINAL_API/);
});
test('current validation refusal still drains SDK child, socket and streams before rejecting close',async()=>{
 const f=await fixture(false),api=await f.helper.initializePagedNativeProverV3();f.failCurrent();
 await assert.rejects(f.helper.destroyPagedNativeProverV3(api),/PAEG_PAGED_NATIVE_EXECUTABLE/);
 assert.deepEqual(f.state(),{acquired:true,closed:true,present:false,destroyCalls:1,unlinks:1,streamsClosed:true,socketClosed:true});
 await assert.rejects(f.helper.destroyPagedNativeProverV3(api),/PAEG_PAGED_NATIVE_ORIGINAL_API/);
});
