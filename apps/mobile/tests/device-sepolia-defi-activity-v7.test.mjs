import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sepoliaDefiFixtureV7,defiHashV7 as h} from './helpers/sepolia-defi-fixture-v7.mjs';
test('tracking reopens the same public review/job after a failed chunk write without inventing an authorization',async t=>{
  t.mock.module('expo-crypto',{exports:{CryptoDigestAlgorithm:{SHA256:'SHA-256'},digest:async(_,bytes)=>Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer}});
  const {connection,review,jobId}=sepoliaDefiFixtureV7(),data=new Map();let fail=false,writes=0;
  const storage={get:async key=>data.get(key)??null,set:async(key,value)=>{assert.ok(value.length<=1200);if(fail&&key.includes('.INVEST.')&&++writes===2)throw Error('HOST_INTERRUPTED_CHUNK');data.set(key,value);}};
  const {createDeviceSepoliaDefiActivityV7}=await import('../src/state/device-sepolia-defi-activity-v7.mjs'),actor=createDeviceSepoliaDefiActivityV7({connection,storage});
  assert.equal(await actor.read('INVEST'),null);await actor.save(review);
  fail=true;await assert.rejects(actor.save(review,jobId),/HOST_INTERRUPTED_CHUNK/);fail=false;
  const reopened=createDeviceSepoliaDefiActivityV7({connection,storage}),old=await reopened.read('INVEST');assert.equal(old.review.reference,review.reference);assert.equal(old.jobId,null,'incomplete new chunks cannot replace the complete prior checkpoint');
  await reopened.save(review,jobId);const recovered=await createDeviceSepoliaDefiActivityV7({connection,storage}).read('INVEST');assert.equal(recovered.jobId,jobId);assert.deepEqual(Object.keys(recovered).sort(),['jobId','profile','review']);assert.equal(recovered.authorized,undefined);assert.equal(recovered.available,undefined);
  await assert.rejects(reopened.save(review,h('other job')));await assert.rejects(reopened.save({...review,underlyingReceiver:'0x'+'6'.repeat(40)},jobId));
});
