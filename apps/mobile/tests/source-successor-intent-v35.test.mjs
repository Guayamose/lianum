/** Durable routing and crash recovery only. HOST storage/biometrics ports;
 * profiles never create custody, balances, consent, or financial authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {sepoliaDefiSourceFixtureV8} from './helpers/sepolia-defi-source-fixture-v8.mjs';
test('successor intent survives lost acknowledgement and prevents stale cloud rollback across generations',async t=>{
 const store=new Map();let loseWrite=false;
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},TurboModuleRegistry:{get:()=>null}}});
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,getItemAsync:async key=>store.get(key)??null,setItemAsync:async(key,value)=>{store.set(key,value);if(loseWrite){loseWrite=false;throw Error('HOST_WRITE_ACK_LOST');}}}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),CryptoDigestAlgorithm:{SHA256:'SHA-256'},digest:async(_,bytes)=>createHash('sha256').update(bytes).digest()}});
 const {prepareSourceSuccessorIntentV35:prepare,finishSourceSuccessorIntentV35:finish,resolveSourceSuccessorProfileV35:resolve}=await import('../src/state/source-successor-intent-v35.ts');
 const fixture=sepoliaDefiSourceFixtureV8(),packet={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:fixture.paegSource.descriptor,transport:fixture.transport},profile=n=>JSON.stringify({...packet,descriptor:{...packet.descriptor,pairingId:'successor-intent-host-'+n}}),old=profile(1),next=profile(2),third=profile(3);
 assert.equal(JSON.parse(await resolve(old)).descriptor.pairingId,JSON.parse(old).descriptor.pairingId);
 loseWrite=true;await assert.rejects(prepare(old),/HOST_WRITE_ACK_LOST/);const before=[...store.values()][0],intent=await prepare(old);assert.equal(intent.intentId,JSON.parse(before).request.intentId,'ack loss does not allocate another source');assert.deepEqual(await prepare(old),intent);
 assert.equal(JSON.parse(await resolve(next)).descriptor.pairingId,JSON.parse(old).descriptor.pairingId,'new cloud connection cannot bypass unfinished encrypted handoff');
 await assert.rejects(prepare(next),/INTENT/);await assert.rejects(finish(old,JSON.stringify({...JSON.parse(next),descriptor:{...JSON.parse(next).descriptor,pool:'0x'+'9'.repeat(40)}})));
 await assert.rejects(finish(old,JSON.stringify({...JSON.parse(next),transport:{...packet.transport,certificateSHA256:'9'.repeat(64)}})),/INTENT/);await assert.rejects(resolve(JSON.stringify({...JSON.parse(next),transport:{...packet.transport,certificateSHA256:'9'.repeat(64)}})),/INTENT/);
 await finish(old,next);await finish(old,next);assert.equal(JSON.parse(await resolve(old)).descriptor.pairingId,JSON.parse(next).descriptor.pairingId);assert.equal(JSON.parse(await resolve(next)).descriptor.pairingId,JSON.parse(next).descriptor.pairingId);
 const second=await prepare(next);assert.notEqual(second.intentId,intent.intentId);assert.equal(JSON.parse(await resolve(old)).descriptor.pairingId,JSON.parse(next).descriptor.pairingId);assert.equal(JSON.parse(await resolve(third)).descriptor.pairingId,JSON.parse(next).descriptor.pairingId);
 loseWrite=true;await assert.rejects(finish(next,third),/HOST_WRITE_ACK_LOST/);await finish(next,third);assert.equal(JSON.parse(await resolve(old)).descriptor.pairingId,JSON.parse(third).descriptor.pairingId,'even an API snapshot two generations old cannot roll back completed custody');
 await assert.rejects(prepare(old),/INTENT/);const foreign=JSON.stringify({...packet,descriptor:{...packet.descriptor,pool:'0x'+'9'.repeat(40)}});assert.equal(JSON.parse(await resolve(foreign)).descriptor.pool,'0x'+'9'.repeat(40));assert.equal(store.size,1);assert.ok(![...store.values()].some(value=>value.includes('privateKey')||value.includes('opening')));
});
