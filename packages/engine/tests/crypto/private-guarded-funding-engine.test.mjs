import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {resourcePath} from '@lianum/environment';
import {readPrivateGuardedSourceCompatibilityReviewV1,validatePrivateGuardedFundingSourceDeltasV1} from '../../../backend/src/payments/private-guarded-source-compatibility-v1.mjs';
import assert from 'node:assert/strict';
import { preparePrivateReserveProjection, assertPrivateReservePrestate, createPrivateFundingPreparation, PRIVATE_PAYMENT_AMOUNTS, loadPrivateGuardedFundingSourcePins } from '../../../backend/src/payments/private-payment-engine.mjs';
import { PrivateNoteTree, noteHashToWords, ZERO_NOTE_HASH, verifyPrivateNotePath } from '../../src/notes/private-note-tree.mjs';
import { assemblySchema } from '../../src/assembly/private-assembly-encoding.mjs';
import { assemblyPackageDigest } from '../../src/assembly/private-assembly-actors.mjs';
const h=n=>'0x'+n.toString(16).padStart(64,'0'),pad=leaves=>[...leaves,...Array(64-leaves.length).fill(ZERO_NOTE_HASH)];
function fixture() {
  const pool={scope:h(2),policy:h(3)},runtime={evm:async()=>({hash:h(20)})};
  const reserve={version:1,mode:'reserve',target:'evm',proofBase64:Buffer.from('shape-only-not-a-genuine-proof').toString('base64'),publicInputs:[...noteHashToWords(pool.scope),...noteHashToWords(pool.policy),'10',PRIVATE_PAYMENT_AMOUNTS.reserveWei,...noteHashToWords(h(5)),...noteHashToWords(h(6))]};
  const leaves=[h(4)],snapshot={blockNumber:'0xa',blockHash:h(20),blockTimestamp:'6001',epoch:'10',scope:pool.scope,policy:pool.policy,root:new PrivateNoteTree(leaves).root,stateSequence:'7',sequence:'7',leaves:pad(leaves),leafCount:1,spentCount:0,liveReservations:0,liveOutputNotes:0};
  pool.snapshot=async()=>structuredClone(snapshot);
  pool.call=async(method,args,block)=>{assert.equal(block,snapshot.blockNumber);if(method==='acceptedRoots(bytes32)'){assert.equal(args[0],snapshot.root);return h(1);}assert.equal(method,'insertedCommitments(bytes32)');assert.equal(args[0],h(5));return ZERO_NOTE_HASH;};
  return {pool,runtime,reserve,snapshot,project:()=>preparePrivateReserveProjection({pool,runtime,reserve,epoch:'10'})};
}
function authorization(projection) {
  return {version:1,mode:'authorization',target:'noir-recursive',proofBase64:Buffer.alloc(458*32).toString('base64'),vkFields:Array(115).fill('0'),proofFields:Array(458).fill('0'),
    publicInputs:[...noteHashToWords(assemblySchema('authorization')),...noteHashToWords(projection.snapshot.scope),...noteHashToWords(projection.snapshot.policy),...noteHashToWords(projection.guards.expectedPostRoot),...Array(48).fill('0'),'22']};
}
function ack(pkg) {return {retained:true,mode:'authorization',packageSHA256:assemblyPackageDigest(pkg)};}
function completed(pkg) {return {event:'complete-packages-ready',delivered:['assembler','btc','sol'],authorizationSHA256:assemblyPackageDigest(pkg)};}
const ownerAck={acknowledged:true,role:'assembler'};
const exited={closed:true,channelsClosed:true,writesAfterExit:0,exitedAtNs:'1'};
function role(latch,name='sol',digest='a'.repeat(64)) {latch.roleRetained(name,digest,{retained:true,role:name,packageSHA256:digest},{acknowledged:true,role:name});}
async function prepared({missing}={}) {
  const f=fixture(),p=await f.project(),a=authorization(p),l=createPrivateFundingPreparation();
  l.reservePrepared(p);
  if(missing!=='authorization')l.authorizationRetained(a,ack(a),ownerAck);
  if(missing!=='sol')role(l);if(missing!=='btc')role(l,'btc','b'.repeat(64));
  if(missing!=='custody'&&missing!=='authorization')l.custodyAuthenticated();
  if(!['authorization','sol','btc','custody','packages'].includes(missing))l.packagesCompleted(completed(a));
  if(!missing)l.ownerExited(exited);
  return {...f,p,a,l};
}
test('canonical snapshot projects exactly one retained reserved commitment without mutating the pool or authorizing a root',async()=>{
  const f=fixture(),before=structuredClone(f.snapshot),p=await f.project();
  assert.deepEqual(f.snapshot,before);assert.equal(p.path.index,1);assert.equal(p.path.leaf,h(5));assert.equal(verifyPrivateNotePath(p.path),true);
  assert.equal(p.guards.expectedRoot,before.root);assert.equal(p.guards.expectedSequence,'7');assert.equal(p.guards.expectedPostRoot,new PrivateNoteTree([h(4),h(5)]).root);
  assert.equal(p.reservePackageSHA256,assemblyPackageDigest(f.reserve));assert.notEqual(p.guards.expectedRoot,p.guards.expectedPostRoot);
  assert.ok(Object.isFrozen(p.snapshot)&&Object.isFrozen(p.snapshot.leaves)&&Object.isFrozen(p.guards));
});
test('projection rejects stale epoch, malformed reconstruction, duplicate insert, missing headroom and canonical reorg',async()=>{
  for(const mutate of [f=>{f.snapshot.epoch='11';},f=>{f.reserve.publicInputs[16]='11';},f=>{f.snapshot.root=h(999);},f=>{f.snapshot.leaves[63]=h(999);},f=>{f.snapshot.stateSequence='8';},f=>{f.snapshot.liveReservations=32;},f=>{f.pool.call=async()=>h(1);},f=>{f.runtime.evm=async()=>({hash:h(21)});}]) {
    const f=fixture();mutate(f);await assert.rejects(f.project());
  }
});
test('prestate and next mined epoch guards fail closed without refreshing frozen descriptors',async()=>{
  const f=fixture(),p=await f.project();assert.doesNotThrow(()=>assertPrivateReservePrestate(p,f.snapshot,6002));
  for(const [key,value] of [['root',h(999)],['stateSequence','8'],['sequence','8'],['epoch','11'],['scope',h(999)],['policy',h(999)],['leafCount',2]])assert.throws(()=>assertPrivateReservePrestate(p,{...f.snapshot,[key]:value},6002));
  assert.throws(()=>assertPrivateReservePrestate(p,f.snapshot,6600),/EPOCH_CHANGED/);assert.equal(p.epoch,'10');
});
test('private latch forbids funding until exact A, both roles, custody, packages and actual owner exit are all retained',async()=>{
  for(const missing of ['authorization','sol','btc','custody','packages','exit']) {
    const {l,reserve}=await prepared({missing});assert.throws(()=>l.beforeSend(reserve),/PREPARATION_INCOMPLETE/,missing);
  }
  const {l,reserve,p}=await prepared(),record=l.beforeSend(reserve);
  assert.equal(record.custodyAuthenticated,true);assert.equal(record.completePackages,true);assert.deepEqual(record.guards,p.guards);assert.deepEqual(record.rolePackages,{sol:'a'.repeat(64),btc:'b'.repeat(64)});assert.equal(record.owner.closed,true);
  assert.throws(()=>l.beforeSend(reserve),/RESERVE_ALREADY_ATTEMPTED/);
});
test('missing/wrong role ACK or original authorization digest cannot unlock funding',async()=>{
  for(const variant of ['missing','false','role','digest','owner-role','owner-false']) {
    const f=fixture(),p=await f.project(),l=createPrivateFundingPreparation();l.reservePrepared(p);
    const retained={retained:true,role:'sol',packageSHA256:'a'.repeat(64)},owner={acknowledged:true,role:'sol'};
    if(variant==='false')retained.retained=false;if(variant==='role')retained.role='btc';if(variant==='digest')retained.packageSHA256='b'.repeat(64);if(variant==='owner-role')owner.role='btc';if(variant==='owner-false')owner.acknowledged=false;
    assert.throws(()=>l.roleRetained('sol','a'.repeat(64),variant==='missing'?null:retained,owner));assert.throws(()=>l.beforeSend(f.reserve),/PREPARATION_INCOMPLETE/);
  }
  for(const mutate of [(a,x)=>{x.retained=false;},(a,x)=>{x.mode='sol_local';},(a,x)=>{x.packageSHA256='f'.repeat(64);},(a,x)=>{a.publicInputs[24]='1';}]) {
    const f=fixture(),p=await f.project(),a=authorization(p),x=ack(a),l=createPrivateFundingPreparation();l.reservePrepared(p);mutate(a,x);
    assert.throws(()=>l.authorizationRetained(a,x,ownerAck));assert.throws(()=>l.beforeSend(f.reserve),/PREPARATION_INCOMPLETE/);
  }
});
test('failed owner completion, unclosed channels, post-exit writes and substituted reserve each prevent funding',async()=>{
  for(const mutate of [x=>{x.delivered=['assembler','sol'];},x=>{x.authorizationSHA256='f'.repeat(64);}]) {
    const f=await prepared({missing:'packages'}),value=completed(f.a);mutate(value);assert.throws(()=>f.l.packagesCompleted(value));assert.throws(()=>f.l.beforeSend(f.reserve));
  }
  for(const patch of [{closed:false},{channelsClosed:false},{writesAfterExit:1},{exitedAtNs:null}]) {
    const f=await prepared({missing:'exit'});assert.throws(()=>f.l.ownerExited({...exited,...patch}));assert.throws(()=>f.l.beforeSend(f.reserve));
  }
  const f=await prepared();f.reserve.proofBase64=Buffer.from('substituted reserve').toString('base64');assert.throws(()=>f.l.beforeSend(f.reserve),/RESERVE_PACKAGE_CHANGED/);
});

test('historical loader keeps its fixed pin and missing historical evidence cannot admit funding',async()=>{
  const path=resourcePath('engine','evidence/m22-guarded-reserve-source-profile.json');
  let bytes;
  try{bytes=await readFile(path);}catch(error){
    assert.equal(error.code,'ENOENT');
    await assert.rejects(loadPrivateGuardedFundingSourcePins({sources:{}}),e=>e.code==='ENOENT');
    // No native/proof/deployment method is invoked by this read-only loader.
    return;
  }
  assert.equal(bytes.length,2452);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'f3572a86386c9fcd71dc04df311dd65b71ec1443fe1b6a96a857adb0b745856e');
  const profile=JSON.parse(bytes),frozen=JSON.parse(await readFile(resourcePath('engine',profile.baselineNativeReport.file),'utf8'));
  const before=structuredClone(frozen.sources),pins=await loadPrivateGuardedFundingSourcePins(frozen);
  assert.deepEqual(Object.keys(pins).sort(),['contracts/PrivateAssemblyNativeNotePool.sol','src/private-assembly-runtime.mjs']);
  assert.deepEqual(frozen.sources,before);
  for(const file of Object.keys(pins)){const changed=structuredClone(frozen);changed.sources[file].sha256='0'.repeat(64);await assert.rejects(loadPrivateGuardedFundingSourcePins(changed),/PREVIOUS_PIN/);}
});

test('fresh source review authenticates archival bytes and current producers without historical financial acceptance',async()=>{
 const review=await readPrivateGuardedSourceCompatibilityReviewV1();
 assert.equal(review.profile,'PRIVATE_GUARDED_SOURCE_COMPATIBILITY_REVIEW_V1');
 assert.equal(review.classification,'CURRENT_SOURCE_REVIEW_ONLY_NOT_M18_M22_ACCEPTANCE');
 assert.equal(review.financialAcceptance,false);assert.equal(review.historicalEvidenceRecovered,false);
 assert.equal(review.genuineGuardedFundingRunCompleted,false);
 const prior=Object.fromEntries(Object.entries(review.allowedSourceDeltas).map(([file,delta])=>[file,delta.previous]));
 prior['unmodified-cryptographic-pins']={bytes:1,sha256:'12'.repeat(32)};
 const before=structuredClone(prior),pins=validatePrivateGuardedFundingSourceDeltasV1(review.allowedSourceDeltas,prior);
 assert.deepEqual(prior,before);assert.ok(Object.isFrozen(pins));
 for(const [file,pin]of Object.entries(pins)){
  assert.ok(Object.isFrozen(pin));
  const source=await readFile(new URL('../../../../'+review.sourceLocations[file].current,import.meta.url));
  assert.equal(source.length,pin.bytes);assert.equal(createHash('sha256').update(source).digest('hex'),pin.sha256);
  const changed=structuredClone(prior);changed[file].sha256='0'.repeat(64);
  assert.throws(()=>validatePrivateGuardedFundingSourceDeltasV1(review.allowedSourceDeltas,changed),/PREVIOUS_PIN/);
 }
 for(const mutate of [
  d=>{d.extra=d['src/private-assembly-runtime.mjs'];},
  d=>{delete d['src/private-assembly-runtime.mjs'];},
  d=>{d['src/private-assembly-runtime.mjs'].extra=true;},
  d=>{d['src/private-assembly-runtime.mjs'].current.extra=true;},
  d=>{d['src/private-assembly-runtime.mjs'].current.bytes=0;},
  d=>{d['src/private-assembly-runtime.mjs'].current.sha256='not-a-pin';},
 ]){const d=structuredClone(review.allowedSourceDeltas);mutate(d);assert.throws(()=>validatePrivateGuardedFundingSourceDeltasV1(d,prior));}
 // A source-only successor cannot substitute for the historical resource.
 try{await readFile(resourcePath('engine','evidence/m22-guarded-reserve-source-profile.json'));}
 catch(error){assert.equal(error.code,'ENOENT');await assert.rejects(loadPrivateGuardedFundingSourcePins({sources:prior}),e=>e.code==='ENOENT');}
});
