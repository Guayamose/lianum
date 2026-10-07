import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {stopOwnProcess} from '../src/chains/runtime-harness.mjs';
test('owned runtime stop verifies normal child exit',async()=>{
 const child=spawn(process.execPath,['-e',"setInterval(()=>{},1000);process.stdout.write('ready\\n')"],{stdio:['ignore','pipe','ignore']});await once(child.stdout,'data');
 const r=await stopOwnProcess({child});assert.equal(r.stopped,true);assert.equal(r.forced,false);assert.ok(child.exitCode!==null||child.signalCode!==null);
});
test('unresponsive owned disposable process is force-stopped before cleanup can proceed',async()=>{
 const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.stdout.write('ready\\n')"],{stdio:['ignore','pipe','ignore']});await once(child.stdout,'data');
 const r=await stopOwnProcess({child},{graceMs:100});assert.equal(r.stopped,true);assert.equal(r.forced,true);assert.ok(child.exitCode!==null||child.signalCode!==null);
});
