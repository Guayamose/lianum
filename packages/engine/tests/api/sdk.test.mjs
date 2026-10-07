import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WalletSDK } from '../../src/api/sdk.mjs';
import { PAYMENT } from '../../src/core/core.mjs';

test('SDK restart preserves authorized graph, resource consumption and terminal decision in encrypted vault', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'paeg-sdk-restart-')),path=join(dir,'state.json'); const now=1800000000000,password='synthetic-test-password-only';
  try{
    const sdk=new WalletSDK(path,password,{clock:()=>now});await sdk.create();const created=await sdk.openDemo();await sdk.executeSimulationLeg(created.hash,'ethereum');
    const reopened=new WalletSDK(path,password,{clock:()=>now});await reopened.executeSimulationLeg(created.hash,'solana');await reopened.executeSimulationLeg(created.hash,'bitcoin');await reopened.settle(created.hash);
    const snapshot=await reopened.snapshot();assert.equal(snapshot.state.operations[0].status,'SETTLED');assert.equal(snapshot.state.consumedResources.length,3);
    const disk=await readFile(path,'utf8'); for(const forbidden of [created.hash,'fixture-ethereum','PRIVATE KEY','SETTLED',password]) assert.ok(!disk.includes(forbidden));
    await assert.rejects(()=>reopened.executeSimulationLeg(created.hash,'ethereum'));
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('two SDK writers racing settlement and expiry can never both pay and refund',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'paeg-sdk-race-')),path=join(dir,'state.json'),password='synthetic-race-password';let now=1800000000000;
  try{
    const sdk=new WalletSDK(path,password,{clock:()=>now});await sdk.create();const opened=await sdk.openDemo();for(const leg of ['ethereum','solana','bitcoin'])await sdk.executeSimulationLeg(opened.hash,leg);
    const expiry=now+60000; const refunding=new WalletSDK(path,password,{clock:()=>expiry});
    const results=await Promise.allSettled([sdk.settle(opened.hash),refunding.recover(opened.hash)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const snapshot=await sdk.snapshot(),input=snapshot.state.assets.find(a=>a.asset===PAYMENT),solver=snapshot.state.solvers[0];
    assert.ok((input.spent==='1000'&&input.available==='9000'&&solver.paid==='1000')||(input.spent==='0'&&input.available==='10000'&&solver.paid==='0'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
