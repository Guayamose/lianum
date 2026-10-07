import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalServer } from '../src/server.mjs';

test('loopback client: signed local workflow, authentic state, no private keys, origin/token/body checks',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'paeg-server-test-')); const app=await startLocalServer({port:0,directory,initialTime:1800000000000});
  try {
    const page=await fetch(app.origin); assert.equal(page.status,200); const html=await page.text();
    const token=html.match(/name="local-token" content="([0-9a-f]+)"/)?.[1]; assert.ok(token);
    const outcomeModule=await fetch(app.origin+'/native-outcome.mjs'); assert.equal(outcomeModule.status,200); assert.match(await outcomeModule.text(),/export function nativeOutcome/);
    assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal((await fetch(app.origin+'/api/state')).status,403);
    const headers={'X-Local-Token':token,'Content-Type':'application/json',Origin:app.origin};
    const action=async body=>{const r=await fetch(app.origin+'/api/action',{method:'POST',headers,body:JSON.stringify(body)}); assert.equal(r.status,200,await r.clone().text());return r.json();};
    assert.equal((await fetch(app.origin+'/api/action',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{}'})).status,403);
    assert.equal((await fetch(app.origin+'/api/action',{method:'POST',headers:{...headers,'X-Local-Token':'a'.repeat(64)},body:'{}'})).status,403);
    assert.equal((await fetch(app.origin+'/api/action',{method:'POST',headers,body:JSON.stringify({action:'create',untrusted:true})})).status,400);
    assert.equal((await fetch(app.origin+'/api/action',{method:'POST',headers,body:' '.repeat(5000)})).status,413);
    const created=await action({action:'create'});
    for(const legId of ['ethereum','solana','bitcoin']) await action({action:'execute',hash:created.hash,legId});
    await action({action:'settle',hash:created.hash});
    const state=await (await fetch(app.origin+'/api/state',{headers})).json(); assert.equal(state.state.operations[0].status,'SETTLED');
    assert.equal(state.mode,'SIMULATION_ONLY'); assert.equal(state.clockMode,'manual-simulation'); assert.equal(state.currentTime,1800000000000); assert.ok(!JSON.stringify(state).includes('PRIVATE KEY')); assert.equal(state.user,undefined);
    const failed=await action({action:'create',order:'bitcoin-first'});await action({action:'execute',hash:failed.hash,legId:'bitcoin'});await action({action:'fail',hash:failed.hash});await action({action:'recover',hash:failed.hash});
    const after=await (await fetch(app.origin+'/api/state',{headers})).json();assert.equal(after.state.operations[1].status,'REFUNDED');
  } finally { await app.close(); await rm(directory,{recursive:true,force:true}); }
});
