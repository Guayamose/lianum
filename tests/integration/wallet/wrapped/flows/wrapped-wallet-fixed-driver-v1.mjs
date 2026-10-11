import {applicationFlowEntrypoints} from '../../../runners/application-flow-entrypoints.mjs';
import {claimWrappedColdStageV1,wrappedColdSourceIdentityV1,reconcileWrappedColdCheckpointPublicationV1,readWrappedColdCheckpointV1} from './wrapped-wallet-cold-cycle-v1.mjs';
import { inspectWrappedInstallationSourcesV2 } from '../../../deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
/** Fixed original-supervisor worker. Source-only until all literal gates and
 * current fourteen-role/host/ABI/producer closures are separately released. */
import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,realpathSync,writeFileSync,openSync,fsyncSync,closeSync,existsSync,lstatSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
import { NATIVE_FLOW_LIMITS } from '../../../native/native-flow-supervisor.mjs';
import { wrappedWalletFixedSourcePinsV1 } from '../validation/wrapped-wallet-fixed-source-pins-v1.mjs';
import { WRAPPED_WALLET_FIXED_RELEASE_V1,WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1,WRAPPED_DEPLOYMENT_ONLY_RESULT_V1,assertWrappedDeploymentOnlyReleaseV1,assertWrappedDeploymentOnlyResultV1,
 WRAPPED_WALLET_FIXED_RESULT_V1,WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1,
 assertWrappedWalletFixedResultV1,assertWrappedWalletFixedPreflightResultV1 } from '../validation/wrapped-wallet-fixed-policy-v1.mjs';
import { createWrappedWalletFixedFixtureV1,createWrappedDeploymentOnlyFixtureV1,ownedWrappedWalletFixedFixtureV1,originalWrappedFixtureConstructionFailureV1,captureWrappedWalletFixedFixtureV1,captureWrappedWalletFixedFundedFixtureV1,reopenWrappedWalletFixedRecoveryV1 } from '../../../fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs';
import { captureWrappedWalletEmptyV1,assertWrappedWalletClosedV1,originalWrappedWalletObservationFailureV1 } from '../validation/wrapped-wallet-fixed-terminal-v1.mjs';
import { runWrappedWalletFixedStepsV1,runWrappedWalletFixedStepsUntilRecoveryV1,resumeWrappedWalletFixedStepsAfterRecoveryV1 } from './wrapped-wallet-fixed-steps-v1.mjs';
import { originalOwnedRuntimeRpcFailureV1 } from '@lianum/engine/chains/shared/runtime-harness';
// Bounded private details for an actual caught worker failure. Never raw logs,
// requests, observations, inventories, native wires, witnesses or key material.
const failureOwn=(value,key)=>{try{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
function privateWorkerFailure(error){const causes=[],rpc=[],seen=new Set();let value=error;for(let depth=0;depth<8&&value&&(typeof value==='object'||typeof value==='function')&&!seen.has(value);depth++,value=failureOwn(value,'cause')){seen.add(value);const message=failureOwn(value,'message'),bytes=typeof message==='string'?Buffer.byteLength(message):null,safe=typeof message==='string'&&bytes<=1024&&!/[\x00-\x08\x0b-\x1f\x7f{}]/.test(message)&&!/(?:0x)?[0-9a-fA-F]{64,}|[A-Za-z0-9+/=_-]{96,}|(?:private[ _-]?key|password|mnemonic|secret|authorization|witness|signed[ _-]?(?:wire|transaction))\s*[:=]|https?:\/\//i.test(message);const code=failureOwn(value,'code');causes.push({message:safe?message:null,messageBytes:bytes,messageOmitted:!safe,code:typeof code==='string'&&/^[A-Z][A-Z0-9_]{2,120}$/.test(code)?code:null});const original=originalOwnedRuntimeRpcFailureV1(value);if(original)rpc.push(original);}return {causes,rpc};}
function publicWrappedCleanupV1(value){return Object.fromEntries(['allOwnedResourcesClosed','closedEvm','closedGraphEvm','closedBitcoin','closedSolana'].map(name=>[name,failureOwn(value,name)===true]));}
function retainPrivateOperationFailure(directory,record){let fd;try{const raw=JSON.stringify(record,null,2)+'\n';assert.ok(Buffer.byteLength(raw)<=65536,'WRAPPED_WORKER_PRIVATE_FAILURE_BOUND');fd=openSync(join(directory,'operation-failure.json'),'wx',0o600);writeFileSync(fd,raw);fsyncSync(fd);closeSync(fd);fd=undefined;return {attempted:true,succeeded:true,bytes:Buffer.byteLength(raw),errorCode:null};}catch(error){const code=failureOwn(error,'code');return {attempted:true,succeeded:false,bytes:null,errorCode:['EACCES','ENOENT','ENOSPC','EDQUOT','EIO','EEXIST','EMFILE','ENFILE','EROFS'].includes(code)?code:'WRAPPED_WORKER_PRIVATE_FAILURE_WRITE_FAILED'};}finally{if(fd!==undefined)try{closeSync(fd);}catch{}}}
export async function runWrappedWalletFixedAcceptanceV1(){assert.equal(arguments.length,0);assert.ok(WRAPPED_WALLET_FIXED_RELEASE_V1,'WRAPPED_FIXED_ACCEPTANCE_NOT_RELEASED');return run(false);}
export async function runWrappedWalletFixedPreflightV1(){assert.equal(arguments.length,0);assert.ok(WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1,'WRAPPED_FIXED_PREFLIGHT_NOT_RELEASED');return run(true);}
export async function runWrappedDeploymentOnlyV1(){assert.equal(arguments.length,0);assertWrappedDeploymentOnlyReleaseV1();return run(true,true);}
async function run(unfunded,deploymentOnly=false){
 inspectWrappedInstallationSourcesV2();
 const stem=deploymentOnly?'wrapped-deployment-only-v1':'wrapped-wallet-fixed-'+(unfunded?'preflight':'acceptance')+'-v1';
 assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.argv[1]),applicationFlowEntrypoints[deploymentOnly?'wrappedDeploymentOnly':unfunded?'wrappedWalletFixedPreflight':'wrappedWalletFixedAcceptance'].worker);
 assert.equal(realpathSync(process.cwd()),ROOT);assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.PATH,'/usr/bin:/bin');assert.equal(process.env.LANG,'C.UTF-8');
 const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
 assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),applicationFlowEntrypoints[deploymentOnly?'wrappedDeploymentOnly':unfunded?'wrappedWalletFixedPreflight':'wrappedWalletFixedAcceptance'].entry);
 const lock=JSON.parse(readFileSync(join(ROOT,'.local',stem,'active.lock')));assert.equal(lock.pid,process.ppid);
 assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,'.local/'+stem+'/attempt-'+lock.runId);
 const directory=join(ROOT,lock.attempt),privateDirectory=join(directory,'private-audit');if(!existsSync(privateDirectory))mkdirSync(privateDirectory,{mode:0o700});else{assert.equal(unfunded,false);assert.equal(deploymentOnly,false);const stat=lstatSync(privateDirectory);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o700);assert.equal(realpathSync(privateDirectory),privateDirectory);}
 const deadlineMs=Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
 const result={format:deploymentOnly?WRAPPED_DEPLOYMENT_ONLY_RESULT_V1:unfunded?WRAPPED_WALLET_FIXED_PREFLIGHT_RESULT_V1:WRAPPED_WALLET_FIXED_RESULT_V1,runId:lock.runId,startedAt:new Date().toISOString(),
  phase:'starting',success:false,localOnly:true,fakeFundsOnly:true,publicNetwork:false,fullWalletAcceptance:false,
  ...(deploymentOnly?{deploymentOnly:true,fullUnfundedWalletAcceptance:false,checkpointSHA256:assertWrappedDeploymentOnlyReleaseV1(),oneExecutionReleaseConsumed:false,deployment:null}:{}),
  supervisor:{supervisorPID:process.ppid,workerPID:process.pid},cleanup:null,unfunded:null,terminal:null};
 const save=()=>writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});let fixture,stopping=false,cleanup,constructionFailure=null;let workerStage='original-source-checks',coldAuthority=null,coldAuthorityOpen=false,coldAPI=null,capturedBoundary=false;
 // A stop during original construction must never memoize an empty cleanup.
 // Once construction returns, the stopped-path catch closes that exact fixture.
 const close=()=>fixture?(cleanup??=fixture.close()):Promise.resolve(constructionFailure?.cleanup??null);
 const stop=()=>{stopping=true;result.phase='interrupted';result.success=false;save();void close().then(value=>{if(value!==null)result.cleanup=publicWrappedCleanupV1(value);save();process.exitCode=2;});};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);save();
 try{
  inspectWrappedInstallationSourcesV2();const pins=wrappedWalletFixedSourcePinsV1();result.sourcePins=pins;save();
  if(deploymentOnly){
   // Original pool-acceptance one-use mechanism, before any constructor or key.
   const consumed=join(ROOT,'.local',stem,'release-'+result.checkpointSHA256+'.consumed.json'),fd=openSync(consumed,'wx',0o600);
   try{writeFileSync(fd,JSON.stringify({checkpointSHA256:result.checkpointSHA256,runId:lock.runId,supervisorPID:process.ppid,oneExecutionOnly:true,scope:'DEPLOYMENT_ONLY'})+'\n');fsyncSync(fd);}finally{closeSync(fd);}
   const parentFD=openSync(join(ROOT,'.local',stem),'r');try{fsyncSync(parentFD);}finally{closeSync(parentFD);}
   result.oneExecutionReleaseConsumed=true;save();workerStage='construct-original-deployment-fixture';fixture=await createWrappedDeploymentOnlyFixtureV1(privateDirectory);
   const s=ownedWrappedWalletFixedFixtureV1(fixture);assert.equal(s.deploymentOnlyCompleted,true);assert.equal(s.owners.length,0);assert.equal(s.resources.length,0);assert.equal(s.proofClients,null);
   for(const name of ['schedule','controller','keeper','ingressProverIdentity'])assert.equal(s[name],undefined);
   result.deployment={scope:'ORIGINAL_COMBINED_DEPLOYMENT_HELPER_ONLY_V1',helperReturned:true,originalFactories:true,runtimeCapabilityCount:4,receiverChainId:s.runtime.metadata.chainId,graphChainId:s.graphNative.metadata.chainId,laterWalletWorkStarted:false};
  }else if(unfunded){
   workerStage='construct-original-wallet-fixture';fixture=await createWrappedWalletFixedFixtureV1(privateDirectory);
   workerStage='capture-original-empty-wallet';result.unfunded=await captureWrappedWalletEmptyV1(fixture);save();assert.equal(stopping,false);assert.ok(Date.now()<deadlineMs);
  }else{
   const sourceSHA256=wrappedColdSourceIdentityV1(pins),identity={directory:privateDirectory,runId:lock.runId,sourceSHA256,deadlineMs};
   workerStage='claim-original-cold-stage';const grant=await claimWrappedColdStageV1(identity);result.coldStage=grant.index;save();
   coldAPI=await import('../../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');assert.equal(stopping,false);assert.ok(Date.now()<deadlineMs);
   if(grant.index===0){
    workerStage='construct-original-wallet-fixture';fixture=await createWrappedWalletFixedFixtureV1(privateDirectory);
    const s=ownedWrappedWalletFixedFixtureV1(fixture);for(const key of ['directory','runId','sourceSHA256','deadlineMs'])assert.equal(s.privateLifetimeIdentity[key],identity[key]);
    workerStage='capture-original-empty-wallet';result.unfunded=await captureWrappedWalletEmptyV1(fixture);save();assert.equal(stopping,false);
    workerStage='capture-original-pre-principal-fixture';coldAuthority=await coldAPI.createWrappedRecoveryAuthorityV1(identity);coldAuthorityOpen=true;
    const captured=await captureWrappedWalletFixedFixtureV1(fixture,coldAuthority,result.unfunded);coldAuthorityOpen=false;
    result.coldBoundary=await reconcileWrappedColdCheckpointPublicationV1({...identity,index:0});capturedBoundary=true;
   }else{
    const saved=readWrappedColdCheckpointV1({...identity,previous:grant.previous});assert.equal(saved.index,grant.index-1);result.unfunded=saved.unfunded;
    workerStage='open-original-cold-authority';coldAuthority=await (grant.index===1?coldAPI.openWrappedRecoveryAuthorityV1:coldAPI.openWrappedFundedRecoveryAuthorityV1)(saved.identity,saved.checkpoint);coldAuthorityOpen=true;
    workerStage='reopen-original-complete-fixture';fixture=await reopenWrappedWalletFixedRecoveryV1(coldAuthority);await coldAPI.closeWrappedRecoveryAuthorityV1(coldAuthority);coldAuthorityOpen=false;
    const original=ownedWrappedWalletFixedFixtureV1(fixture);assert.equal(original.recovered,true);assert.equal(stopping,false);assert.ok(Date.now()<deadlineMs);
    if(grant.index===1){
     workerStage='run-original-deposit-and-graph';const steps=await runWrappedWalletFixedStepsUntilRecoveryV1(fixture,deadlineMs);assert.equal(steps.pausedForRecovery,true);assert.equal(ownedWrappedWalletFixedFixtureV1(fixture),original);
     workerStage='capture-original-funded-fixture';coldAuthority=await coldAPI.createWrappedFundedRecoveryAuthorityV1(identity);coldAuthorityOpen=true;
     const captured=await captureWrappedWalletFixedFundedFixtureV1(fixture,coldAuthority,result.unfunded);coldAuthorityOpen=false;
     result.coldBoundary=await reconcileWrappedColdCheckpointPublicationV1({...identity,index:1});capturedBoundary=true;
    }else{
     workerStage='resume-original-withdrawal-and-redemption';const steps=await resumeWrappedWalletFixedStepsAfterRecoveryV1(fixture,deadlineMs);assert.equal(ownedWrappedWalletFixedFixtureV1(fixture),original);
     result.oneSharedApplication=steps.oneSharedApplication;result.httpEvidence=steps.evidence;result.proofs=steps.proofs;
     workerStage='assert-original-closed-wallet';result.terminal=await assertWrappedWalletClosedV1(fixture);result.fullWalletAcceptance=true;
     result.coldRecovery={orderedWorkerLifetimes:3,prePrincipalReopened:true,fundedObligationsReopened:true,originalBaselineRestored:true,noInitialEffectsReplayed:true};
    }
   }
  }
  workerStage='final-source-and-deadline';assert.deepEqual(wrappedWalletFixedSourcePinsV1(),pins,'WRAPPED_FIXED_FINAL_SOURCE_DRIFT');assert.equal(stopping,false);assert.ok(Date.now()<deadlineMs);
  workerStage='close-original-fixture';result.cleanup=publicWrappedCleanupV1(await close());inspectWrappedInstallationSourcesV2();assert.equal(result.cleanup.allOwnedResourcesClosed,true);result.phase=capturedBoundary?'captured':'completed';result.success=true;
  if(!capturedBoundary)(deploymentOnly?assertWrappedDeploymentOnlyResultV1:unfunded?assertWrappedWalletFixedPreflightResultV1:assertWrappedWalletFixedResultV1)(result);save();
 }catch(error){constructionFailure=originalWrappedFixtureConstructionFailureV1(error,privateDirectory);result.phase='failed';result.success=false;result.fullWalletAcceptance=false;
  if(constructionFailure){result.originalConstructionCleanupRetained=true;result.deploymentFailure=constructionFailure.deployment;result.constructionEvidenceWrite=constructionFailure.evidenceWrite;}
  if(fixture&&!constructionFailure){const observation=originalWrappedWalletObservationFailureV1(error,fixture);result.operationFailure={schema:'WRAPPED_ORIGINAL_WORKER_OPERATION_FAILURE_V1',runId:lock.runId,scope:deploymentOnly?'deployment-only':unfunded?'full-unfunded-wallet':'full-economic-wallet',stage:workerStage,fixtureReturned:true,completed:false,observation};
   result.operationFailureEvidenceWrite=retainPrivateOperationFailure(privateDirectory,{...result.operationFailure,privateError:privateWorkerFailure(error)});}
  let message;try{message=Object.getOwnPropertyDescriptor(error,'message')?.value;}catch{}
  result.errorCode='WRAPPED_FIXED_ORIGINAL_ACCEPTANCE_INCOMPLETE';
  result.cleanup=publicWrappedCleanupV1(await close());save();process.exitCode=1;
 }finally{if(coldAuthorityOpen&&coldAPI)try{await coldAPI.closeWrappedRecoveryAuthorityV1(coldAuthority);}catch{result.success=false;result.fullWalletAcceptance=false;result.phase='failed';result.errorCode='WRAPPED_FIXED_ORIGINAL_ACCEPTANCE_INCOMPLETE';save();process.exitCode=1;}process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
 process.stdout.write(JSON.stringify({format:result.format,runId:result.runId,phase:result.phase,success:result.success,fullWalletAcceptance:result.fullWalletAcceptance})+'\n');return result;
}
