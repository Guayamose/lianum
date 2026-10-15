/** PC18 disclosed synthetic proof capability, not funded/native owner-offline evidence. */
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';import {statfsSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {projectRoot} from '../../../../packages/engine/src/chains/shared/runtime-harness.mjs';
import {syntheticSetup,syntheticCertificate} from '../../../../packages/proofs/programs/native-notes/fixtures.mjs';
import {assemblyAuthorizationInput,assemblyLocalInput,assemblyRecursiveInput} from '../../../../packages/engine/src/assembly/private-assembly-encoding.mjs';
import {privateAssemblyRootHistoryDigest} from '../../../../packages/engine/src/assembly/private-assembly-history.mjs';
import {PrivateNoteTree,privateSpentDigest,privateEffectDigest} from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import {sha256} from '../../../../packages/engine/src/notes/private-note-encoding.mjs';
import {createOwnedNativeRuntime} from '../../../../packages/engine/src/chains/shared/native-runtime.mjs';
import {deployPrivateAssemblyNativePool,privateVerifierCalldata} from '../../../../packages/engine/src/assembly/private-assembly-runtime.mjs';
const runId=new Date().toISOString().replace(/[:.]/g,'-'),experiment=join(projectRoot,'experiments/private-core-proof/owner-independent'),directory=join(projectRoot,'evidence/m18-capability',runId),reportPath=join(projectRoot,'evidence/m18-capability-'+runId+'.json');await mkdir(directory,{recursive:true});
const report={classification:'GENUINE_RECURSIVE_SYNTHETIC_CAPABILITY_NOT_FUNDED_OR_NATIVE_OWNER_OFFLINE',runId,startedAt:new Date().toISOString(),phase:'starting',fullAcceptance:false,realFunds:false,publicNetwork:false,ownerIndependentNativeClaimTested:false,disclosure:'This deliberately disclosed synthetic capability artifact publishes A/J/L public tuples and their opaque linkage. It is not a native-run privacy transcript. No private witness, note opening, signing key or raw package is saved.',proofs:[],checks:[],artifacts:{},deployments:[]};
const save=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');const hash=x=>sha256(x).toString('hex');const saveFile=async(name,bytes)=>{const p=join(directory,name);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,bytes);report.artifacts[name]={bytes:bytes.length,sha256:hash(bytes)};await save();};
let active,runtime;
async function prove(mode,input,label,operation='prove'){
 report.phase='proving-'+label;await save();const started=performance.now();
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[join(experiment,'prove-worker.mjs')],{cwd:projectRoot,stdio:['pipe','pipe','pipe','pipe']});active=child;let output=[],bytes=0,log=[],logBytes=0,failed;
 const stop=error=>{failed??=error;child.kill('SIGTERM');};
 const monitor=setInterval(()=>{const disk=statfsSync(projectRoot),mem=Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;if(mem<3*1024**3||disk.bavail*disk.bsize<5*1024**3)stop(new Error('PC18_PARENT_RESOURCE_FLOOR'));},1000);
 const timer=setTimeout(()=>stop(new Error('PC18_WORKER_16_MINUTE_BOUND')),960000);
 child.stdio[3].on('data',chunk=>{bytes+=chunk.length;if(bytes>2*1024*1024)stop(new Error('PC18_WORKER_RESPONSE_LIMIT'));else output.push(chunk);});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{logBytes+=chunk.length;if(logBytes<64*1024)log.push(chunk);});
 child.on('error',error=>{failed??=error;});child.stdin.on('error',error=>{failed??=error;});child.on('close',code=>{active=null;clearInterval(timer);clearInterval(monitor);if(failed)return reject(failed);try{const r=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(output)));assert.equal(code,0,r.code??'PC18_WORKER_EXIT');assert.equal(r.ok,true,r.code);r.result.proof=Buffer.from(r.result.proof,'base64');resolve(r.result);}catch(error){reject(error);}});child.stdin.end(JSON.stringify({mode,input,label,operation}));
 });
 const wallMilliseconds=performance.now()-started;result.metrics.workerWallMilliseconds=wallMilliseconds;report.proofs.push(result.metrics);await saveFile(label+'/proof.bin',Buffer.from(result.proof));await saveFile(label+'/public-inputs.json',Buffer.from(JSON.stringify(result.publicInputs,null,2)+'\n'));await saveFile(label+'/verification-key.bin',await readFile(join(experiment,'.local/prepared/'+mode+'.vk')));
 console.log(JSON.stringify({phase:label,mode,wallMilliseconds,proofMilliseconds:result.metrics.proofMilliseconds,verified:result.metrics.verified,peakRSSKiB:result.metrics.processResourceUsage.maxRSS}));
 if(mode.endsWith('_ready')&&wallMilliseconds>=600000){report.readinessEpochLivenessBlocker={mode,wallMilliseconds,epochMilliseconds:600000};await save();throw Error('PC18_READINESS_600_SECOND_LIVENESS_BLOCKER');}
 return result;
}
try{
 const sources=['scripts/integration-private-assembly-capability.mjs','src/private-assembly-encoding.mjs','src/private-assembly-history.mjs','src/private-assembly-runtime.mjs','contracts/PrivateAssemblyNativeNotePool.sol','experiments/private-core-proof/owner-independent/generate.mjs','experiments/private-core-proof/owner-independent/compile.mjs','experiments/private-core-proof/owner-independent/prepare.mjs','experiments/private-core-proof/owner-independent/prover.mjs','experiments/private-core-proof/owner-independent/prove-worker.mjs'];
 report.sources={};for(const source of sources){const b=await readFile(join(projectRoot,source));report.sources[source]=hash(b);await saveFile('source/'+source,b);}await cp(join(experiment,'circuits'),join(directory,'source/circuits'),{recursive:true});await cp(join(experiment,'.local/compiled'),join(directory,'source/compiled'),{recursive:true});
 const s=syntheticSetup(),g=s.graph,solCertificate=syntheticCertificate(s,'sol'),btcCertificate=syntheticCertificate(s,'btc');
 const a=await prove('authorization',assemblyAuthorizationInput(g,s.tree),'static-authorization');
 const sol=await prove('sol_local',assemblyLocalInput({role:'sol',scope:g.scope,policy:s.policy,local:g.sol,certificate:solCertificate}),'sol-local');
 const btc=await prove('btc_local',assemblyLocalInput({role:'btc',scope:g.scope,policy:s.policy,local:g.btc,certificate:btcCertificate}),'btc-local');
 const joinInput=assemblyRecursiveInput('sol_join',{authorization:a,sol});const joined=await prove('sol_join',joinInput,'authorized-sol-join');
 const history=[new PrivateNoteTree().root,s.tree.root],scope='0x'+g.scope.toString('hex'),policy='0x'+g.policy.toString('hex');
 const snapshot={scope,policy,epoch:s.epoch.toString(),sequence:'1',root:s.tree.root,rootHistory:history,rootHistoryCount:history.length,rootHistoryDigest:privateAssemblyRootHistoryDigest(scope,history),nullifiers:[],spentCount:0,spentDigest:privateSpentDigest(scope,[]),solEffects:[],solEffectCount:0,solEffectDigest:privateEffectDigest('SOL',scope,[])};
 const rs=await prove('sol_ready',assemblyRecursiveInput('sol_ready',{authorization:a,snapshot,epoch:s.epoch}),'sol-readiness');
 const rb=await prove('btc_ready',assemblyRecursiveInput('btc_ready',{joined,snapshot,epoch:s.epoch}),'btc-readiness');
 const outer=await prove('fulfill',assemblyRecursiveInput('fulfill',{joined,btc,epoch:s.epoch}),'terminal-fulfillment');
 const refund=await prove('refund',assemblyRecursiveInput('refund',{authorization:a,epoch:g.claimEpoch}),'terminal-refund');
 assert.deepEqual(outer.publicInputs.slice(25,33).map(BigInt),refund.publicInputs.slice(25,33).map(BigInt));report.checks.push('Genuine outer fulfillment and timeout bind identical reserve nullifier');
 // Both array copies are changed consistently, so ordinary Noir constraints
 // still hold. The original well-formed authentic A proof no longer matches its
 // supplied private statement; only real recursive verification can reject it.
 const bad=structuredClone(joinInput);bad.a_inputs[72]=String((BigInt(bad.a_inputs[72])+1n)%(1n<<32n));bad.authorization_inputs[72]=bad.a_inputs[72];
 const rejected=await prove('sol_join',bad,'well-formed-child-statement-substitution','reject-candidate');assert.equal(rejected.metrics.proofGenerated,true);assert.equal(rejected.metrics.verified,false);report.checks.push('Well-formed A proof with changed private recovery statement reached actual candidate generation and actual recursive verifier false');
 report.phase='deploying-genuine-evm-verifiers';await save();runtime=await createOwnedNativeRuntime(()=>{});report.runtimes={classification:'OWNED_EVM_DEPLOYMENT_AND_VERIFICATION_ONLY_NO_NATIVE_TRANSFERS',metadata:runtime.metadata};
 const solidity={};for(const mode of ['reserve','withdraw'])solidity[mode]=await readFile(join(projectRoot,'experiments/private-core-proof/native-notes/.local/prepared/'+mode+'.sol'),'utf8');for(const mode of ['sol_ready','btc_ready','fulfill','refund'])solidity[mode]=await readFile(join(experiment,'.local/prepared/'+mode+'.sol'),'utf8');
 for(const [mode,source]of Object.entries(solidity))await saveFile('verifiers/'+mode+'.sol',Buffer.from(source));
 const pool=await deployPrivateAssemblyNativePool(runtime,{sources:solidity,policy,deploymentDomain:'0x'+randomBytes(32).toString('hex'),solAuthority:runtime.accounts[2],btcAuthority:runtime.accounts[0],onDeployment:async r=>{report.deployments.push(r);await save();}});report.deployedPool={address:pool.address,scope:pool.scope,policy:pool.policy,classification:'EMPTY_SYNTHETIC_DEPLOYMENT_NOT_FUNDED_PROOF_ACCEPTANCE',verifiers:pool.verifiers,compilation:{milliseconds:pool.compilation.milliseconds,peakSampledRSSKiB:pool.compilation.peakSampledRSSKiB,sources:pool.compilation.sources}};
 for(const [mode,proof]of [['sol_ready',rs],['btc_ready',rb],['fulfill',outer],['refund',refund]]){assert.equal(await pool.verify(mode,proof.proof,proof.publicInputs),true,'PC18_DEPLOYED_VERIFIER');const receipt=await pool.send('actual verifier '+mode,{to:pool.verifiers[mode].address,data:privateVerifierCalldata(pool.verifiers[mode].selector,proof.proof,proof.publicInputs)});report.checks.push('Actual deployed '+mode+' verifier accepted exact genuine proof');report.verifierReceipts??=[];report.verifierReceipts.push({mode,receipt});await save();}
 const changed=[...outer.publicInputs];changed[49]='0x'+(BigInt(changed[49])+1n).toString(16).padStart(64,'0');
 const rejectReceipt=await pool.send('actual verifier rejects changed terminal output',{to:pool.verifiers.fulfill.address,data:privateVerifierCalldata(pool.verifiers.fulfill.selector,outer.proof,changed)},'0x0');report.verifierMutationReceipt=rejectReceipt;report.checks.push('Actual EVM transaction to genuine O verifier reverted with changed terminal output; inspect retained revert diagnostics');
 report.emptyPoolSnapshot=await pool.snapshot();assert.equal(report.emptyPoolSnapshot.leafCount,0);assert.equal(await runtime.balance(pool.address),0n);report.phase='completed';report.completedAt=new Date().toISOString();
}catch(error){report.failedPhase=report.phase;report.phase='failed';report.failure={name:error.name,message:error.message};process.exitCode=1;console.error(JSON.stringify(report.failure));}
finally{if(active)active.kill('SIGTERM');if(runtime){await runtime.close();const stopped=runtime.metadata.processIds.map(pid=>{try{process.kill(pid,0);return{pid,stopped:false};}catch(error){return{pid,stopped:error.code==='ESRCH'};}});report.runtimeCleanup={completed:stopped.every(x=>x.stopped),processes:stopped};}report.processResourceUsage=process.resourceUsage();await save();console.log(JSON.stringify({report:reportPath,phase:report.phase,proofs:report.proofs.length,checks:report.checks.length}));}
