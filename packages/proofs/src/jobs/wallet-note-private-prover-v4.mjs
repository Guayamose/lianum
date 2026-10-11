/** Fixed original26/39 prover capability. A second own recipient encrypts the
 * final IPC; the original PC23 algorithms, keys and deployed verifier remain.
 * No caller executable, resource policy, backend or plaintext fallback. */
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,fstatSync,statSync,statfsSync} from 'node:fs';
import {PRIVATE_RESOURCE_POLICY} from '@lianum/components/resources/private-resource-policy';
import {selectProofResourcePolicy} from '../execution/proof-resource-policy.mjs';
import {PROOF_PROJECT_ROOT,PROOF_PROTOCOL,need,exactObject,encodeProofMessage,decodeProofMessage,
 normalizePublicInputs,assertExpectedInputs,normalizeProofWitness,publicInputsFromWitness,
 decodePrivateProof,loadProofProfile,wipePrivate,proofError} from '../execution/proof-worker.mjs';
import {filePin} from '@lianum/components/resources/wallet-resources';
import {sealPrivateProofJobV1,readOriginalPrivateProofRecipientV1,privateProofAuthorizationBindingV1,
 privateProofBindingSHA256V1,wipePrivateProofInputsV1} from '@lianum/engine/crypto/private-proof-transit-v1';
export const ORIGINAL_WALLET_PRIVATE_PROVER_V4='ORIGINAL_PC23_TWO_PRIVATE_IPC_V4';
const worker=fileURLToPath(new URL('./wallet-note-private-worker-v4.mjs',import.meta.url));
const telemetryDirectory=join(PROOF_PROJECT_ROOT,'evidence/paeg-proof-attempts'),hostLock='/tmp/lianum-paeg-proof-host.lock';
const codePaths=Object.freeze({worker,parent:fileURLToPath(import.meta.url),originalWorker:fileURLToPath(new URL('../execution/proof-worker.mjs',import.meta.url)),
 privateTransit:fileURLToPath(new URL('../../../engine/src/crypto/private-proof-transit-v1.mjs',import.meta.url)),resourcePolicy:fileURLToPath(new URL('../../../components/src/resources/private-resource-policy.mjs',import.meta.url)),
 originalProver:fileURLToPath(new URL('../toolchain/wallet-prover.mjs',import.meta.url))});
const stages=new Set(['checking-pins','legacy-proof-and-self-verification']);
const modes=new Set(['deposit_balance','withdraw_balance']),digest=b=>createHash('sha256').update(b).digest('hex');
let active=null;
/** Public transport binding is not authority. Only the opened original
 * recipient WeakMap admits an exact request to the fixed PC23 algorithm. */
export function readOriginalWalletNoteProverRequestV4(opened,mode){
 need(arguments.length===2&&modes.has(mode),'PAEG_PROOF_PRIVATE_CONFIG');
 const original=readOriginalPrivateProofRecipientV1(opened);need(original.relation===mode&&original.role==='owner','PAEG_PROOF_PRIVATE_SCOPE');
 const binding=privateProofAuthorizationBindingV1(opened.authorization);need(binding.kind==='ORIGINAL_CONSENT_V1','PAEG_PROOF_PRIVATE_BINDING');
 const v=opened.inputs;exactObject(v,['profile','protocol','purpose','operation','mode','label','input']);
 need(v.profile===ORIGINAL_WALLET_PRIVATE_PROVER_V4&&v.protocol===PROOF_PROTOCOL&&v.purpose==='owner'&&v.operation==='prove'&&v.mode===mode,'PAEG_PROOF_PRIVATE_SCOPE');
 need(typeof v.label==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v.label),'PAEG_PROOF_LABEL');
 const expected=normalizePublicInputs(mode,opened.expectedPublicInputs);
 return{request:v,expected,binding};
}
function sample(child){const disk=statfsSync(PROOF_PROJECT_ROOT),mem=readFileSync('/proc/meminfo','utf8');let workerRSS=0;
 if(child?.pid&&child.exitCode===null&&child.signalCode===null){try{workerRSS=Number(/^VmRSS:\s+(\d+)/m.exec(readFileSync('/proc/'+child.pid+'/status','utf8'))?.[1]??0)*1024;}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}
 return{at:new Date().toISOString(),availableRAM:Number(/MemAvailable:\s+(\d+)/.exec(mem)?.[1])*1024,freeDisk:disk.bavail*disk.bsize,workerRSS,parentRSS:process.memoryUsage().rss};}
function resourceTrip(v,p){if(!Number.isSafeInteger(v.availableRAM)||!Number.isSafeInteger(v.freeDisk))return'PAEG_PROOF_RESOURCE_SAMPLE';if(v.availableRAM<p.floors.availableRAM)return'PAEG_PROOF_AVAILABLE_RAM_FLOOR';if(v.freeDisk<p.floors.freeDisk)return'PAEG_PROOF_DISK_FLOOR';if(v.workerRSS>p.proofWorkerRSSLimit)return'PAEG_PROOF_WORKER_RSS_LIMIT';return null;}
function acquire(){let fd;try{fd=openSync(hostLock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw proofError('PAEG_PROOF_HOST_BUSY');throw e;}const identity=fstatSync(fd);
 try{writeFileSync(fd,JSON.stringify({parentPID:process.pid,createdAt:new Date().toISOString()})+'\n');}catch(e){closeSync(fd);unlinkSync(hostLock);throw e;}
 return()=>{closeSync(fd);const current=statSync(hostLock);need(current.ino===identity.ino&&current.dev===identity.dev,'PAEG_PROOF_LOCK_CHANGED');unlinkSync(hostLock);};}
export function createOriginalWalletNotePrivateProverV4(original){
 need(arguments.length===1,'PAEG_PROOF_PRIVATE_CONFIG');const scope=readOriginalPrivateProofRecipientV1(original),mode=scope.relation;
 need(modes.has(mode)&&scope.role==='owner','PAEG_PROOF_PRIVATE_SCOPE');const authorization=privateProofAuthorizationBindingV1(original.authorization);need(authorization.kind==='ORIGINAL_CONSENT_V1','PAEG_PROOF_PRIVATE_BINDING');
 const expected=Object.freeze(normalizePublicInputs(mode,original.expectedPublicInputs)),loaded=loadProofProfile(mode);need(loaded.legacy===true&&loaded.target==='evm'&&loaded.maximumPages===32768,'PAEG_PROOF_PRIVATE_PROFILE');
 const binding=loaded.publicPins,policy=selectProofResourcePolicy(mode,binding),codePins=Object.fromEntries(Object.entries(codePaths).map(([key,path])=>[key,filePin(path)]));
 let closed=false,used=false,current=null,lastReport=null;
 const facade=Object.freeze({
  prove(requestMode,input,publicInputs,label){need(arguments.length===4&&!closed&&!used&&!current&&!active,'PAEG_PROOF_PRIVATE_ONE_REQUEST');need(requestMode===mode&&input===original.inputs&&publicInputs===original.expectedPublicInputs,'PAEG_PROOF_PRIVATE_ORIGINAL_INPUT');
   assert.deepEqual(normalizePublicInputs(mode,publicInputs),expected,'PAEG_PROOF_PRIVATE_PUBLIC');need(typeof label==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(label),'PAEG_PROOF_LABEL');used=true;
   return run(input,label);
  },
  pins(){return{[mode]:structuredClone(binding)};},report(){return lastReport&&structuredClone(lastReport);},
  async abort(){const j=current;if(!j)return{aborted:false,exited:true};j.stop('PAEG_PROOF_CANCELLED');await j.done.catch(()=>{});return{aborted:true,exited:true};},
  async close(){closed=true;const j=current;if(j){j.stop('PAEG_PROOF_CLOSED');await j.done.catch(()=>{});}return{closed:true,exited:true};},
 });return facade;
 async function run(input,label){
  const currentLoaded=loadProofProfile(mode);assert.deepEqual(currentLoaded.publicPins,binding,'PAEG_PROOF_BOUND_PROFILE_CHANGED');
  for(const[key,path]of Object.entries(codePaths))filePin(path,codePins[key]);
  let normalized;try{normalized=normalizeProofWitness(currentLoaded.program,input);assertExpectedInputs(mode,publicInputsFromWitness(currentLoaded.program,normalized),expected);}catch(e){wipePrivate(normalized);throw e;}
  const id=randomUUID(),began=performance.now(),path=join(telemetryDirectory,id+'.json'),report={classification:'ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY',privateTransitProfile:ORIGINAL_WALLET_PRIVATE_PROVER_V4,id,mode,operation:'prove',purpose:'owner',label,
   startedAt:new Date().toISOString(),phase:'before-dispatch',...binding,policy,maximumPages:currentLoaded.maximumPages,threads:1,zeroKnowledgeEnabled:true,codePins,authorizationBindingSHA256:privateProofBindingSHA256V1(authorization),stages:[],resourceSamples:[],logs:{stdoutBytes:0,stderrBytes:0},acceptedResult:false};
  let child,release,monitor,deadline,killTimer,result,failure,finished=false,resultSeen=false,sequence=0,ready=false,responseBytes=0,packet;
  let resolve,reject;const done=new Promise((a,b)=>{resolve=a;reject=b;});done.catch(()=>{});
  const persist=()=>{try{writeFileSync(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});}catch{report.telemetryWriteFailed=true;try{writeFileSync('/tmp/lianum-paeg-proof-abort-'+id+'.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});}catch{report.fallbackTelemetryWriteFailed=true;}throw proofError('PAEG_PROOF_TELEMETRY_WRITE');}};
  const stop=(code,trip)=>{if(finished)return done;failure??=proofError(code);report.failedPhase??=report.phase;report.phase='aborting';report.failureCode=failure.code;if(trip&&!report.tripSample)report.tripSample=trip;try{persist();}catch{}if(child?.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');killTimer??=setTimeout(()=>{if(!finished&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},5000);}return done;};
  const finish=(exitCode,signal)=>{if(finished)return;finished=true;clearInterval(monitor);clearTimeout(deadline);clearTimeout(killTimer);wipePrivate(normalized);normalized=null;wipePrivateProofInputsV1(packet);packet=null;
   report.exit={code:exitCode,signal};report.completedAt=new Date().toISOString();report.totalMilliseconds=performance.now()-began;if(!failure&&(exitCode!==0||signal!==null||!resultSeen))failure=proofError('PAEG_PROOF_CHILD_EXIT');
   report.phase=failure?'failed':'completed';report.acceptedResult=!failure;if(failure)report.failureCode=failure.code;
   try{filePin(worker,codePins.worker);filePin(fileURLToPath(import.meta.url),codePins.parent);persist();}catch(e){failure??=e;report.phase='failed';report.acceptedResult=false;report.failureCode=failure.code;}
   try{release?.();}catch{failure??=proofError('PAEG_PROOF_LOCK_RELEASE');report.phase='failed';report.acceptedResult=false;report.failureCode=failure.code;}
   current=null;active=null;lastReport=structuredClone(report);for(const stream of child?.stdio??[])stream?.destroy();
   if(failure){wipePrivate(result);failure.telemetry=structuredClone(report);reject(failure);}else resolve({...result,metrics:structuredClone(report)});
  };
  current={done,stop};active=current;
  try{
   mkdirSync(telemetryDirectory,{recursive:true});release=acquire();const initial=sample(null);report.resourceSamples.push(initial);persist();const trip=resourceTrip(initial,policy);if(trip){report.tripSample=initial;throw proofError(trip);}
   child=fork(worker,[mode],{cwd:PROOF_PROJECT_ROOT,execPath:process.execPath,execArgv:[],serialization:'advanced',env:{LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe','ipc']});child.once('error',()=>stop('PAEG_PROOF_CHILD_SPAWN'));child.once('close',finish);report.childPID=child.pid;report.phase='starting-child';persist();
   for(const[name,stream]of [['stdout',child.stdout],['stderr',child.stderr]]){stream.on('data',b=>{report.logs[name+'Bytes']+=b.length;b.fill(0);if(report.logs.stdoutBytes+report.logs.stderrBytes>1048576)stop('PAEG_PROOF_LOG_LIMIT');});stream.on('error',()=>stop('PAEG_PROOF_CHILD_IO'));}
   child.on('message',bytes=>{let message;try{if(failure||finished||closed){wipePrivateProofInputsV1(bytes);return;}
    if(bytes&&!(bytes instanceof Uint8Array)&&bytes.type==='flat-private-proof-input-ready'){
     need(!ready&&!resultSeen,'PAEG_PROOF_PRIVATE_ONE_RECIPIENT');need(bytes.relation===mode&&bytes.role==='owner','PAEG_PROOF_PRIVATE_SCOPE');packet=sealPrivateProofJobV1(bytes,{inputs:{profile:ORIGINAL_WALLET_PRIVATE_PROVER_V4,protocol:PROOF_PROTOCOL,purpose:'owner',operation:'prove',mode,label,input:normalized},expectedPublicInputs:expected,authorization});
     wipePrivate(normalized);normalized=null;ready=true;report.phase='dispatching-private-input';report.privateWireSHA256=digest(Buffer.from(JSON.stringify(packet)));persist();
     child.send(packet,e=>{wipePrivateProofInputsV1(packet);packet=null;if(e)stop('PAEG_PROOF_CHILD_IO');});return;
    }
    need(bytes instanceof Uint8Array,'PAEG_PROOF_PROTOCOL');responseBytes+=bytes.length;need(responseBytes<=4*1024*1024+65536,'PAEG_PROOF_OUTPUT_LIMIT');message=decodeProofMessage(bytes);if(failure){wipePrivate(message);return;}
    if(message.event==='phase'){exactObject(message,['event','sequence','stage']);need(ready&&!resultSeen&&message.sequence===sequence+1&&stages.has(message.stage),'PAEG_PROOF_PROTOCOL');sequence=message.sequence;report.phase=message.stage;const v=sample(child);report.resourceSamples.push(v);report.stages.push({stage:message.stage,at:v.at});persist();const trip=resourceTrip(v,policy);if(trip){stop(trip,v);return;}const ack=encodeProofMessage({event:'phase-persisted',sequence});child.send(ack,e=>{ack.fill(0);if(e)stop('PAEG_PROOF_CHILD_IO');});
    }else if(message.event==='result'){exactObject(message,['event','result','authorizationBindingSHA256']);need(ready&&!resultSeen&&message.authorizationBindingSHA256===privateProofBindingSHA256V1(authorization),'PAEG_PROOF_PRIVATE_RESULT');resultSeen=true;const v=message.result;exactObject(v,['proofPackage','metrics']);result=decodePrivateProof(mode,v.proofPackage);assertExpectedInputs(mode,result.publicInputs,expected);need(v.metrics.keySHA256===binding.keySHA256&&v.metrics.privateTransitProfile===ORIGINAL_WALLET_PRIVATE_PROVER_V4&&v.metrics.verified===true&&v.metrics.zeroKnowledgeEnabled===true,'PAEG_PROOF_RESULT_PIN');report.worker=structuredClone(v.metrics);report.phase='awaiting-child-exit';persist();
    }else if(message.event==='failure'){exactObject(message,['event','code']);need(/^PAEG_PROOF_[A-Z_]+$/.test(message.code),'PAEG_PROOF_PROTOCOL');stop(message.code);}else throw proofError('PAEG_PROOF_PROTOCOL');
   }catch(e){stop(/^PAEG_PROOF_[A-Z_]+$/.test(e?.code??'')?e.code:'PAEG_PROOF_PROTOCOL');}finally{wipePrivate(message);}});
   monitor=setInterval(()=>{if(finished||failure)return;try{const v=sample(child);report.resourceSamples.push(v);const t=resourceTrip(v,policy);if(t)stop(t,v);}catch{stop('PAEG_PROOF_RESOURCE_SAMPLE');}},PRIVATE_RESOURCE_POLICY.externalSampleMilliseconds);deadline=setTimeout(()=>stop('PAEG_PROOF_OPERATION_TIMEOUT'),900000);
  }catch(e){failure=/^PAEG_PROOF_[A-Z_]+$/.test(e?.code??'')?e:proofError('PAEG_PROOF_STARTUP_FAILURE');if(child)stop(failure.code);else finish(null,null);}
  return done;
 }
}
