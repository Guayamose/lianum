/** Exact source closures with synthetic state/process/RPC ports. The runtime
 * factory, keys, validator, transport, compiler and prover are never run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {cloneInput,frozenInput} from '@lianum/components/plain-input';
const source=readFileSync(new URL('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs',import.meta.url),'utf8');
const cut=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start);return source.slice(start,end);};
const registry=cut('const ownedSolanaRuntimes =','const safeInteger =').replaceAll('export ','');
const install=cut('      ownedSolanaRuntimes.add(runtime);','      return runtime;');
const readSource=cut('    const read = async (method, params = [], timeoutMs = 5000) => {',"    await progress('Starting Solana validator");
function fixture(){
 const input={assert,cloneInput,frozenInput,requireCondition:(ok,msg)=>assert.ok(ok,msg),rpc:async()=>({checked:true})};
 const factory=vm.runInThisContext(`(function(env){
 const {assert,cloneInput,frozenInput,requireCondition}=env;
 ${registry}
 const records=new Map(),graphRecords=new Map(),lifetimeId='fixed-physical-lifetime',genesis='fixture-genesis';
 const allRecords=()=>[...records.values(),...graphRecords.values()];
 let readGeneration=0n,mutationGeneration=0n,activeNativeReads=0,activeNativeMutations=0,activeNativeReadOperations=0;
 let closed=false,shuttingDown=false,recoveryCapturing=false,isolationFailure=null,nativePersistenceFailure=null,busy=false,observationBusy=false,inventoryBusy=false,signingUnresolved=false,activeRoute=null,activePrepared=null,dead=false;
 const handle={assertAlive(){assert.equal(dead,false,'SOLANA_PROCESS_DEAD');}},READ_METHODS=new Set(['getHealth']),endpoint='INERT';
 const ownedRuntimeRpc=(...args)=>env.rpc(...args);
 ${readSource}
 function create(custody){const namespace=custody?records:graphRecords;const runtime=Object.freeze({close(){}});${install}return runtime;}
 const pair={custody:create(true),graph:create(false)};
 return {pair,read,snapshot:readOwnedSolanaRuntimeAuditState,records,graphRecords,
 set(p){
 if('closed'in p)closed=p.closed;if('shuttingDown'in p)shuttingDown=p.shuttingDown;if('dead'in p)dead=p.dead;
 if('isolationFailure'in p)isolationFailure=p.isolationFailure;if('nativePersistenceFailure'in p)nativePersistenceFailure=p.nativePersistenceFailure;
 if('busy'in p)busy=p.busy;if('observationBusy'in p)observationBusy=p.observationBusy;if('inventoryBusy'in p)inventoryBusy=p.inventoryBusy;
 if('signingUnresolved'in p)signingUnresolved=p.signingUnresolved;if('activeRoute'in p)activeRoute=p.activeRoute;if('activePrepared'in p)activePrepared=p.activePrepared;
 if('mutationGeneration'in p)mutationGeneration=p.mutationGeneration;if('activeNativeMutations'in p)activeNativeMutations=p.activeNativeMutations;
 },setRpc(value){env.rpc=value;}};
 })`)(input);return factory;
}
test('SOL exact audit closure binds original facades and complete physical custody/graph history',()=>{
 const f=fixture(),a=f.snapshot(f.pair.custody);f.records.set('c',{route:'redeem',phase:'SIGNED_NOT_BROADCAST',nativeWire:'PRIVATE_FIXTURE_C'});f.graphRecords.set('g',{phase:'OBSERVED_FINALIZED',nativeWire:'PRIVATE_FIXTURE_G'});
 const c=f.snapshot(f.pair.custody),g=f.snapshot(f.pair.graph);assert.equal(c.lifetimeId,g.lifetimeId);assert.equal(c.facade,'custody');assert.equal(g.facade,'graph');
 assert.equal(c.transfers.length,1);assert.equal(g.transfers.length,1);assert.deepEqual(c.custodyTransfers,g.custodyTransfers);assert.deepEqual(c.graphTransfers,g.graphTransfers);assert.equal(a.custodyTransfers.length,0);
 assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.transfers[0])&&Object.isFrozen(c.graphTransfers));
 for(const fake of [{},f.pair,{...f.pair.custody},new Proxy(f.pair.graph,{})])assert.throws(()=>f.snapshot(fake),/CAPABILITY/);
 assert.throws(()=>f.snapshot(f.pair.graph,{}),/NO_OPTIONS/);
});
test('SOL read generation starts before RPC, holds active state across await and never resets',async()=>{
 const f=fixture(),before=f.snapshot(f.pair.custody);let resolve;const held=new Promise(r=>resolve=r);f.setRpc(()=>held);
 const read=f.read('getHealth'),during=f.snapshot(f.pair.graph);assert.equal(during.activeReads,1);assert.equal(during.readsIdle,false);assert.ok(BigInt(during.readGeneration)>BigInt(before.readGeneration));
 resolve('ok');await read;const after=f.snapshot(f.pair.custody);assert.equal(after.readsIdle,true);assert.equal(after.readGeneration,during.readGeneration);
 f.setRpc(async()=>{throw Error('RPC_UNAVAILABLE');});await assert.rejects(f.read('getHealth'),/UNAVAILABLE/);assert.equal(f.snapshot(f.pair.graph).activeReads,0);assert.ok(BigInt(f.snapshot(f.pair.graph).readGeneration)>BigInt(after.readGeneration));
});
for(const failure of ['closed','shuttingDown','dead','isolationFailure','nativePersistenceFailure'])test(`SOL audit state refuses ${failure} at synchronous physical-live boundary`,()=>{
 const f=fixture();f.set({[failure]:failure.endsWith('Failure')?Error('PRIVATE_FAILURE'):true});assert.throws(()=>f.snapshot(f.pair.custody),/CLOSED|PROCESS_DEAD|PRIVATE_FAILURE/);
});
test('SOL signing intent, independent mutation generation, read-idle flags and durable adverse history remain visible',()=>{
 const f=fixture();f.set({busy:true,signingUnresolved:true,mutationGeneration:7n,activeNativeMutations:1,activeRoute:{name:'redeem'},activePrepared:{unsignedWire:'PRIVATE_FIXTURE_UNSIGNED'}});
 const beforeWire=f.snapshot(f.pair.custody);assert.equal(beforeWire.transfers.length,0);assert.equal(beforeWire.signingUnresolved,true);assert.equal(beforeWire.mutationGeneration,'7');assert.equal(beforeWire.activeMutations,1);
 f.graphRecords.set('adverse',{phase:'OBSERVED_ADVERSE',adverseReason:'RETAINED_HISTORY_CHANGED'});assert.equal(f.snapshot(f.pair.custody).adverseHistory,true);
 for(const name of ['observationBusy','inventoryBusy']){f.set({[name]:true});assert.equal(f.snapshot(f.pair.graph).readsIdle,false);f.set({[name]:false});}
});
