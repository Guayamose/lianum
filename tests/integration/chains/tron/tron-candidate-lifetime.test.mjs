import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { beginTronCandidateLifetime, bindTronCandidateChildCancellation, TRON_CANDIDATE_TOTAL_MILLISECONDS } from './tron-candidate-lifetime.mjs';
test('fixed total deadline cancels pending work and requests exactly one owned cleanup', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const before=process.listenerCount('SIGTERM'), lifetime=beginTronCandidateLifetime();
  let failure, calls=0;
  const release=bindTronCandidateChildCancellation(lifetime.signal,error=>{failure=error.message;},async()=>{calls++;});
  lifetime.assertActive(); t.mock.timers.tick(TRON_CANDIDATE_TOTAL_MILLISECONDS-1); assert.equal(lifetime.signal.aborted,false);
  t.mock.timers.tick(1); assert.match(failure,/TOTAL_DEADLINE_ORIGINAL_OUTCOME_UNKNOWN/);
  assert.throws(()=>lifetime.assertActive(),/TOTAL_DEADLINE/); await Promise.resolve(); assert.equal(calls,1);
  release(); lifetime.finish(); lifetime.finish(); assert.equal(process.listenerCount('SIGTERM'),before);
});
test('an already-cancelled lifetime rejects work before starting a new child', async () => {
  const lifetime=beginTronCandidateLifetime(); process.emit('SIGINT');
  let failure, calls=0;
  const release=bindTronCandidateChildCancellation(lifetime.signal,error=>{failure=error.message;},async()=>{calls++;});
  await Promise.resolve(); assert.equal(calls,1); assert.match(failure,/OWNER_SIGINT_ORIGINAL_OUTCOME_UNKNOWN/);
  assert.throws(()=>lifetime.assertActive(),/OWNER_SIGINT/); release();lifetime.finish();
  assert.throws(()=>beginTronCandidateLifetime({totalMilliseconds:1}),/NO_OPTIONS/);
});
for (const signal of ['SIGTERM','SIGINT']) test(signal+' closes the owned child and retains an unknown-outcome rejection', {timeout:10000}, async () => {
  const fixture=fileURLToPath(new URL('./fixtures/tron-lifetime-signal-fixture.mjs',import.meta.url));
  const child=spawn(process.execPath,[fixture],{stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit'); let output='',diagnostic='';
  child.stdout.on('data',bytes=>output+=bytes.toString());child.stderr.on('data',bytes=>diagnostic+=bytes.toString());
  try {
    while (!output.includes('\n')) { await Promise.race([once(child.stdout,'data'),exited.then(()=>{throw Error(diagnostic);})]); }
    const first=JSON.parse(output.split('\n')[0]);assert.equal(first.ready,true);child.kill(signal);
    const [code,exitSignal]=await exited;assert.equal(code,0,diagnostic);assert.equal(exitSignal,null);
    const result=JSON.parse(output.trim().split('\n')[1]);assert.equal(result.calls,1);assert.deepEqual(result.cleanup,{code:0,signal:null});
    assert.equal(result.failure,'TRON_CANDIDATE_OWNER_'+signal+'_ORIGINAL_OUTCOME_UNKNOWN');
    assert.throws(()=>process.kill(first.ownedPID,0),/ESRCH/);
  } finally { if (child.exitCode===null && child.signalCode===null) {child.kill('SIGKILL');await exited;} }
});
