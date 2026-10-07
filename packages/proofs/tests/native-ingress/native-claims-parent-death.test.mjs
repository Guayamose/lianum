import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {nativeProcStatV1} from '../../../../tests/integration/native/native-flow-owned-files-v1.mjs';
const guardian=fileURLToPath(new URL('../../src/native-ingress/tooling/native-claims-parent-death.py',import.meta.url));
for(const signal of ['SIGTERM','SIGKILL'])test('public preparation stops after real parent '+signal,{timeout:10000},async()=>{
 const scratch=mkdtempSync(join(tmpdir(),'lianum-parent-death-')),marker=join(scratch,'terminated.txt');
 const code='import os,runpy,sys\nm=runpy.run_path(sys.argv[1]);m["bind_parent_lifetime"](os.getppid())\njs="process.on(\\\"SIGTERM\\\",()=>{require(\\\"node:fs\\\").writeFileSync(process.argv[1],\\\"SIGTERM\\\");process.exit(0);});console.log(process.pid);setInterval(()=>{},1000);"\nos.execve(sys.argv[3],[sys.argv[3],"-e",js,sys.argv[2]],{"PATH":"/usr/bin:/bin","LANG":"C.UTF-8"})\n';
 const parentScript='const{spawn}=require("node:child_process");const child=spawn("python3",["-c",process.argv[1],process.argv[2],process.argv[3],process.execPath],{stdio:["ignore","pipe","ignore"]});child.stdout.once("data",bytes=>process.send({childPID:Number(bytes.toString().trim())}));setInterval(()=>{},1000);';
 const parent=spawn(process.execPath,['-e',parentScript,code,guardian,marker],{stdio:['ignore','ignore','ignore','ipc']});
 const closed=once(parent,'close');let identity;
 try{
  const [{childPID}]=await once(parent,'message');identity=nativeProcStatV1(childPID);assert.ok(identity&&identity.ppid===parent.pid);
  parent.kill(signal);await closed;
  for(let i=0;i<80;i++){const stat=nativeProcStatV1(childPID);if((!stat||/^[ZX]$/.test(stat.state))&&existsSync(marker))break;await new Promise(r=>setTimeout(r,25));}
  assert.equal(readFileSync(marker,'utf8'),'SIGTERM');
  const after=nativeProcStatV1(childPID);assert.ok(!after||after.startTimeTicks!==identity.startTimeTicks||/^[ZX]$/.test(after.state));
 }finally{
  const parentStat=nativeProcStatV1(parent.pid);if(parentStat)parent.kill('SIGKILL');await closed;
  if(identity){const current=nativeProcStatV1(identity.pid);if(current&&current.startTimeTicks===identity.startTimeTicks&&!/^[ZX]$/.test(current.state))process.kill(identity.pid,'SIGKILL');}
  rmSync(scratch,{recursive:true,force:true});
 }
});
