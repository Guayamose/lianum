import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalServer } from '../src/server.mjs';
import { toBTC, decodeReservation } from '../src/native-triple.mjs';
test('triple client is explicit opt-in and refuses arbitrary RPC, origin and body fields', async () => {
 const directory = await mkdtemp(join(tmpdir(),'triple-client-')), app = await startLocalServer({ port:0, directory });
 try {
  const page = await (await fetch(app.origin)).text(), token = page.match(/name="local-token" content="([0-9a-f]+)"/)[1];
  assert.match(page,/id="triple"/); assert.match(page,/prueba global/);
  assert.equal((await fetch(app.origin+'/triple.mjs')).status,200);
  assert.equal((await fetch(app.origin+'/api/triple')).status,403);
  const headers={'X-Local-Token':token, Origin:app.origin, 'Content-Type':'application/json'};
  const current=await (await fetch(app.origin+'/api/triple',{headers})).json(); assert.equal(current.status,'OFF'); assert.deepEqual(current.allowedActions,['prepare']); assert.equal(current.capabilities.fullAcceptance,false);
  const action=body=>fetch(app.origin+'/api/triple/action',{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await action({action:'prepare',rpc:'http://127.0.0.1:1'})).status,400);
  assert.equal((await action({action:'settle'})).status,400);
  assert.equal((await action({action:'bitcoin'})).status,400);
  assert.equal((await fetch(app.origin+'/api/triple/action',{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{"action":"prepare"}'})).status,403);
  assert.equal(app.triple.ownedRuntimeForReview,undefined);
 } finally { await app.close(); await rm(directory,{recursive:true,force:true}); }
});
test('Bitcoin decimal serialization keeps integer satoshi arithmetic exact',()=>{
 assert.equal(toBTC('100000'),'0.00100000'); assert.equal(toBTC(1n),'0.00000001'); assert.equal(toBTC(2100000000000000n),'21000000.00000000'); assert.throws(()=>toBTC(-1n));
});
test('triple ABI decode rejects missing words and invalid encoding',()=>{
 assert.throws(()=>decodeReservation('0x')); assert.throws(()=>decodeReservation('0x'+'0'.repeat(64*14))); assert.throws(()=>decodeReservation('0xz'));
});

test('changed Solana certification is persisted before rejection and cannot retain old eligible facts', async()=>{
 const {retainSolanaObservation}=await import('../src/native-triple.mjs');
 const old={signature:'sig',slot:5,blockhash:'old',lamports:'3000000',solverHex:'solver',recipientHex:'recipient',instructionIndex:0};
 const state={status:'BTC_CONFIRMED',operation:{solana:{...old,certifiedObservation:{...old},parentDigest:'parent'}}};let saved;
 await assert.rejects(()=>retainSolanaObservation(state,async()=>({...old,slot:9,blockhash:'new'}),async()=>{saved=structuredClone(state);}),/SOLANA_CERTIFICATION_CHANGED/);
 assert.equal(saved.operation.solana.slot,9);assert.equal(saved.operation.solana.certifiedObservation.slot,5);assert.equal(saved.operation.solana.certificationCurrent,false);assert.equal(saved.operation.solana.certificationChangedObserved,true);assert.equal(saved.status,'QUARANTINED');assert.equal(saved.observations.solana.delivery.status,'OBSERVED');
});
test('unavailable Solana observation does not erase existing native delivery or call it fresh', async()=>{
 const {retainSolanaObservation}=await import('../src/native-triple.mjs');
 const state={status:'SOL_CONFIRMED',operation:{solana:{signature:'retained',slot:5,parentDigest:'bound'}}};let saved;
 await assert.rejects(()=>retainSolanaObservation(state,async()=>{throw new Error('RPC_UNAVAILABLE');},async()=>{saved=structuredClone(state);}),/RPC_UNAVAILABLE/);
 assert.equal(saved.operation.solana.signature,'retained');assert.equal(saved.operation.solana.parentDigest,'bound');assert.equal(saved.observations.solana.delivery.status,'UNAVAILABLE_OR_REJECTED');assert.equal(saved.observations.solana.delivery.observedAt,null);
});
