/** One serial native/WASM cold process pair. Never persist private input or witness. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {walletFixture,walletFixtureInput} from '../../../../../packages/proofs/programs/wallet-notes/fixtures.mjs';
import {walletInputPublicWords} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {hash,guard,resources,WALLET_RESOURCE_FLOORS,filePin} from '../../../../../packages/proofs/programs/wallet-notes/resources.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const report={classification:'SYNTHETIC_STATEMENT_GENUINE_PROOF_PERFORMANCE_NOT_NATIVE_SETTLEMENT_OR_WALLET_UX_ACCEPTANCE',startedAt:new Date().toISOString(),mode:'reserve_from_note',statementWords:74,fixtureType:4,fixtureCount:1,privateMaterialPersisted:false,coldLifetimes:true,serialOrder:['native','wasm'],threadsEach:1,proofsPerBackend:1,provingKeyReuse:false,backendSharingAcrossOwners:false,hostLimitsChanged:false,floors:WALLET_RESOURCE_FLOORS,monitorIntervalMilliseconds:250,timeoutEachMilliseconds:900000,phase:'starting',results:[]};
const reportPath=root+'cold-s74-ab-'+report.startedAt.replace(/[:.]/g,'-')+'.json';
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const nativeProv=JSON.parse(readFileSync(root+'native-provenance.json'));
filePin(new URL('../../pc5-proof-probe/node_modules/@aztec/bb.js/build/amd64-linux/bb',import.meta.url),{sha256:nativeProv.binarySHA256,bytes:nativeProv.binaryBytes});
report.sources=Object.fromEntries(['run-controlled-ab.mjs','one-cold-child.mjs','native-provenance.json','../../../../../packages/proofs/programs/wallet-notes/fixtures.mjs','../../../../../packages/proofs/programs/wallet-notes/resources.mjs','../../../../../packages/proofs/programs/wallet-notes/prover.mjs','../../../src/private-wallet-note-encoding.mjs'].map(p=>[p,filePin(root+p)]));
report.before=guard();save();
const fixture=walletFixture(4),input=walletFixtureInput('reserve_from_note',fixture),expectedPublicInputs=walletInputPublicWords('reserve_from_note',input);
function ownedProcesses(group){const found=[];for(const name of readdirSync('/proc')){if(!/^\d+$/.test(name))continue;try{const stat=readFileSync('/proc/'+name+'/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).split(' ');if(Number(tail[2])!==group)continue;const status=readFileSync('/proc/'+name+'/status','utf8');found.push({pid:Number(name),parent:Number(tail[1]),startTime:tail[19],state:tail[0],rssBytes:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0)*1024});}catch{}}return found;}
async function run(backend,crossProof){
 guard();const start=performance.now(),sampled={samples:0,minAvailableRAM:Infinity,minFreeDisk:Infinity,peakNodeRSSBytes:0,peakDescendantRSSBytes:0,peakOwnedRSSSumBytes:0,ownedIdentities:[],peakSupervisorRSSBytes:0,scope:'Dedicated child process group only; RSS sum may double-count shared pages; 250ms sampling may miss peaks'};
 const child=fork(root+'one-cold-child.mjs',[],{cwd:root,serialization:'advanced',detached:true,stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
 let result,failure,phase='child-startup',stopping=false,killTimer,firstMessageMilliseconds,primaryObservedMilliseconds;
 const identityMap=new Map();
 const signalOwned=signal=>{const members=ownedProcesses(child.pid);for(const p of members){if(p.pid===child.pid||identityMap.has(p.pid+':'+p.startTime)){try{process.kill(p.pid,signal);}catch{}}}};
 const stop=why=>{failure??=why;if(stopping)return;stopping=true;signalOwned('SIGTERM');killTimer=setTimeout(()=>signalOwned('SIGKILL'),3000);};
 const sample=()=>{try{const r=resources(),members=ownedProcesses(child.pid);sampled.samples++;sampled.minAvailableRAM=Math.min(sampled.minAvailableRAM,r.availableRAM);sampled.minFreeDisk=Math.min(sampled.minFreeDisk,r.freeDisk);sampled.peakSupervisorRSSBytes=Math.max(sampled.peakSupervisorRSSBytes,r.rss);let nr=0,dr=0;for(const p of members){identityMap.set(p.pid+':'+p.startTime,{pid:p.pid,startTime:p.startTime,parent:p.parent});if(p.pid===child.pid)nr+=p.rssBytes;else dr+=p.rssBytes;}sampled.peakNodeRSSBytes=Math.max(sampled.peakNodeRSSBytes,nr);sampled.peakDescendantRSSBytes=Math.max(sampled.peakDescendantRSSBytes,dr);sampled.peakOwnedRSSSumBytes=Math.max(sampled.peakOwnedRSSSumBytes,nr+dr);if(r.availableRAM<WALLET_RESOURCE_FLOORS.availableRAM||r.freeDisk<WALLET_RESOURCE_FLOORS.freeDisk)stop('AB_EXTERNAL_RESOURCE_FLOOR');}catch{stop('AB_MONITOR_READ');}};
 const interval=setInterval(sample,250),timeout=setTimeout(()=>stop('AB_EXTERNAL_TIMEOUT'),900000);sample();
 const killOnExit=()=>signalOwned('SIGKILL'),onSignal=()=>stop('AB_SUPERVISOR_STOP');process.once('exit',killOnExit);process.once('SIGTERM',onSignal);process.once('SIGINT',onSignal);
 let outputBytes=0;for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{outputBytes+=b.length;if(outputBytes>1024*1024)stop('AB_CHILD_LOG_LIMIT');});
 child.on('message',m=>{firstMessageMilliseconds??=performance.now()-start;if(m.type==='phase'){phase=m.phase;console.log(JSON.stringify({backend,phase}));}if(m.type==='primary'){primaryObservedMilliseconds=performance.now()-start;console.log(JSON.stringify({backend,primary:m.metrics}));}if(m.type==='result')result=m;});
 child.once('error',()=>stop('AB_CHILD_SPAWN'));
 const done=new Promise(resolve=>child.once('close',(exitCode,signal)=>resolve({exitCode,signal})));
 child.send({backend,input,expectedPublicInputs,crossProof});
 const exit=await done;clearTimeout(timeout);clearTimeout(killTimer);
 // destroy() signals the native process asynchronously; verify only this owned group.
 const cleanupStart=performance.now();let members=ownedProcesses(child.pid);
 while(members.some(p=>p.state!=='Z')&&performance.now()-cleanupStart<5000){await new Promise(r=>setTimeout(r,100));members=ownedProcesses(child.pid);}
 if(members.some(p=>p.state!=='Z')){signalOwned('SIGKILL');await new Promise(r=>setTimeout(r,100));members=ownedProcesses(child.pid);}
 clearInterval(interval);process.removeListener('exit',killOnExit);process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);
 sampled.ownedIdentities=[...identityMap.values()];
 const final={...(result?.metrics??{backend,phase:'failed',failedPhase:phase}),external:{...exit,failure,firstMessageMilliseconds,primaryObservedMilliseconds,childLifetimeMilliseconds:performance.now()-start,postChildCleanupMilliseconds:performance.now()-cleanupStart,ownedLiveProcessesRemaining:members.filter(p=>p.state!=='Z').length,ownedZombieProcessesRemaining:members.filter(p=>p.state==='Z').length,outputBytes},sampled};
 report.results.push(final);save();console.log(JSON.stringify({backend,completed:final}));
 assert.equal(exit.exitCode,0,'AB_CHILD_FAILED');assert.equal(failure,undefined,'AB_MONITOR_FAILED');assert.equal(result?.metrics.phase,'completed','AB_PROOF_FAILED');assert.equal(final.external.ownedLiveProcessesRemaining,0,'AB_OWNED_CLEANUP');
 return result;
}
try{
 report.phase='native';save();const native=await run('native');
 report.phase='wasm';save();const wasm=await run('wasm',native.proof);
 assert.equal(native.ephemeralWitnessHash,wasm.ephemeralWitnessHash,'AB_WITNESS_MISMATCH');
 assert.deepEqual(native.proof.publicInputs,wasm.proof.publicInputs,'AB_PUBLIC_MISMATCH');
 report.sameInputAndWitness=true;report.sameExactPublicInputs=true;report.nativeProofVerifiedByWasm=wasm.metrics.nativeProofVerifiedByWasm;
 report.comparison={generateProofWasmOverNative:wasm.metrics.timingsMilliseconds.generateProof/native.metrics.timingsMilliseconds.generateProof,throughPrimaryVerificationWasmOverNative:wasm.metrics.timingsMilliseconds.throughPrimaryVerification/native.metrics.timingsMilliseconds.throughPrimaryVerification,oneModeOnePairOnly:true};
 // Export only public proofs and public statement, explicitly synthetic.
 for(const r of [native,wasm]){const p=root+r.metrics.backend+'-synthetic-s74-proof.json';const data={classification:report.classification,mode:report.mode,backend:r.metrics.backend,verificationKeySHA256:r.metrics.pins.keySHA256,proofHex:Buffer.from(r.proof.proof).toString('hex'),publicInputs:r.proof.publicInputs};writeFileSync(p,JSON.stringify(data,null,2)+'\n');report[r.metrics.backend+'PublicProofFile']={path:p,sha256:hash(readFileSync(p))};}
 delete native.ephemeralWitnessHash;delete wasm.ephemeralWitnessHash;report.phase='completed';
}catch(error){report.failedPhase=report.phase;report.phase='failed';report.failure={name:error.name,message:/^AB_/.test(error.message)?error.message:'AB_FAILURE'};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();report.after=resources();save();console.log(JSON.stringify({report:reportPath,phase:report.phase,comparison:report.comparison,sha256:hash(readFileSync(reportPath))}));}
