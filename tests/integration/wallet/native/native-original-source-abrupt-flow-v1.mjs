import {fileURLToPath} from 'node:url';
/** Genuine SOURCE product: one mobile D26, abrupt backend exit, the SAME
 * capsule in a new PID, then original unadmitted U/S, first fresh ARM and a second abrupt reopen. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,chmodSync,readFileSync,writeFileSync,existsSync,realpathSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {createNativeSourceTlsTransportV1} from './native-source-tls-transport-v1.mjs';
import {ROOT,FLAT,GOLDEN,LOCAL} from '@lianum/proofs/catalog';
import {NATIVE_FLOW_LIMITS} from '../../native/native-flow-supervisor.mjs';
import {readNativeFlowRegularV1,nativeProcStatV1} from '../../native/native-flow-owned-files-v1.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {assertNativeEconomicNoteTelemetryV1} from '@lianum/proofs/execution/note-native-execution-v1';
import {assertBtcSolGraphProofReceipts} from '../../claims/development/development-btc-sol-graph-proof-evidence.mjs';
import {originalAccountAccessMessageV2} from '@lianum/mobile-protocol/original-account-v2';
import {deviceDepositConsentMessageV1} from '@lianum/mobile-protocol/device-deposit-consent-v1';
import {deviceReservationConsentMessageV1,wipeDeviceReservationWitnessV1} from '@lianum/mobile-protocol/device-reservation-consent-v1';
import {deviceRecoveryArmConsentMessageV1} from '@lianum/mobile-protocol/device-recovery-arm-consent-v1';
import {openDeviceReservationHostVaultV1} from './device-owner-reservation-host-vault-v1.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
import {nativeSourceAbruptSourcePinsV1} from './native-original-source-abrupt-source-pins-v1.mjs';
import {NATIVE_SOURCE_ABRUPT_PROFILE_V1,NATIVE_SOURCE_ABRUPT_RESULT_V1,assertNativeSourceAbruptReleaseV1,assertNativeSourceAbruptResultV1} from './native-original-source-abrupt-policy-v1.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),bare=v=>v.startsWith('0x')?v.slice(2):v;
const childScript=fileURLToPath(new URL('./native-original-source-abrupt-backend-v1.mjs',import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 assertNativeSourceAbruptReleaseV1();assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.cwd()),ROOT);
 assert.equal(realpathSync(process.argv[1]),fileURLToPath(new URL('./native-original-source-abrupt-flow-v1.mjs',import.meta.url)));assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);
 const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);assert.deepEqual(parent,[process.execPath,fileURLToPath(new URL('./run-native-original-source-abrupt-v1.mjs',import.meta.url))]);
 const lock=JSON.parse(readNativeFlowRegularV1(join(ROOT,'.local',NATIVE_SOURCE_ABRUPT_PROFILE_V1,'active.lock')));assert.equal(lock.pid,process.ppid);assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,'.local/'+NATIVE_SOURCE_ABRUPT_PROFILE_V1+'/attempt-'+lock.runId);
 const directory=join(ROOT,lock.attempt),privateDirectory=join(directory,'private-audit'),proofDirectory=join(directory,'public-proofs');
 mkdirSync(privateDirectory,{mode:0o700});mkdirSync(proofDirectory,{mode:0o700});
 const deadline=Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
 const sources=nativeSourceAbruptSourcePinsV1(),earlierNotes=new Set(existsSync(join(GOLDEN,'evidence/paeg-proof-attempts'))?readdirSync(join(GOLDEN,'evidence/paeg-proof-attempts')):[]),earlierGraph=new Set(existsSync(join(LOCAL,'attempts'))?readdirSync(join(LOCAL,'attempts')):[]);
 const result={format:NATIVE_SOURCE_ABRUPT_RESULT_V1,profile:NATIVE_SOURCE_ABRUPT_PROFILE_V1,runId:lock.runId,phase:'starting',success:false,interrupted:false,sourceUnchanged:false,
  supervisor:{supervisorPID:process.ppid,workerPID:process.pid},sourcePins:sources,localOnly:true,fakeFundsOnly:true,publicNetwork:false,
  nativeExecution:'ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1',nativeDeliveryCount:0,nativeGraphAcceptance:false,sourceAbruptRestartNodeAcceptance:false,sourceArmedAbruptRestartEstablished:false,sourceEconomicStateAbruptRestartEstablished:false,sourceMobileStateCoherenceEstablished:false,
  nativeProcessRestartEstablished:false,keeperLossRecoveryEstablished:false,mobileNoteCustodyEstablished:false,tlsEstablished:false,reactRendererEstablished:false,
  physicalPhoneEstablished:false,mobilePortfolioEstablished:false,independentInfrastructureEstablished:false,fullWalletAcceptance:false,postCutoffRecoveryEstablished:false,
  proofs:[],stages:[],cleanup:{errors:[]},disclosure:['Actual same-host product SOURCE confirmed between operations; two abrupt backend exits17 without close/capture, after D26 and after ARM.',
  'Same original mobile SDK/Vault execute in Node using real TLS1.3/AES-GCM/RNG. Device key and note root remain only in the surviving parent. No phone/hardware/renderer claim.',
  'Original kernel guardian is configured SIGTERM for Anvil parent death; absence is physically verified. Delivery is not inferred from absent PIDs.',
  'Three original D26/U/S proofs and two financial wires; first fresh ARM uses the original eight-hour cutoff. No F before cutoff or proof of post-cutoff restart is claimed.']};
 const save=()=>writeFixturePrivate(join(directory,'result.json'),result),active=()=>{assert.equal(result.interrupted,false);assert.ok(Date.now()<deadline,'NATIVE_SOURCE_ACCEPTANCE_TOTAL_DEADLINE');};
 const stage=async name=>{active();result.phase=name;result.stages.push({name,at:new Date().toISOString()});save();process.stdout.write(JSON.stringify({stage:name})+'\n');};
 const signals=()=>{result.interrupted=true;};process.on('SIGTERM',signals);process.on('SIGINT',signals);
 let backend=null,host=null,vault=null,deviceKey=null,dapi=null,rapi=null,eapi=null,rootId=null,primary=null,outputApi=null,localRequest=null,witness=null,configuration=null,mobileState=null;
 const children=[];
 function backendStart(){active();const child=spawn(process.execPath,[childScript],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},serialization:'json',stdio:['ignore','ignore','ignore','ipc']});
  const requests=new Map();let next=0,ended=false,startError=null;const closed=new Promise(resolve=>child.once('close',(code,signal)=>{ended=true;for(const row of requests.values()){clearTimeout(row.timer);row.reject(Error('NATIVE_SOURCE_BACKEND_CLOSED'));}requests.clear();resolve({code,signal});}));
  child.once('error',error=>{startError=error;});child.on('message',message=>{const row=requests.get(message?.id);if(!row)return;requests.delete(message.id);clearTimeout(row.timer);
   assert.ok(Buffer.byteLength(JSON.stringify(message))<=4*1024*1024,'NATIVE_SOURCE_PRIVATE_IPC_BOUND');if(message.ok===true)row.resolve(message.value);else{const error=Object.assign(Error('NATIVE_SOURCE_ORIGINAL_BACKEND_FAILURE'),{code:'NATIVE_SOURCE_ORIGINAL_BACKEND_FAILURE'});writeFixturePrivate(join(privateDirectory,'backend-first-error-private.json'),message.error);row.reject(error);}});
  const value={child,closed,call(method,payload={}){if(method!=='CLOSE')active();assert.equal(ended,false);if(startError)throw startError;const id=++next;
   return new Promise((resolveDone,rejectDone)=>{const timer=setTimeout(()=>{requests.delete(id);rejectDone(Error('NATIVE_SOURCE_BACKEND_REPLY_DEADLINE'));},Math.max(1,Math.min(method==='CLOSE'?NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds:900000,(method==='CLOSE'?deadline+NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds:deadline)-Date.now())));
    requests.set(id,{resolve:resolveDone,reject:rejectDone,timer});child.send({id,method,payload},error=>{if(error){clearTimeout(timer);requests.delete(id);rejectDone(error);}});});}};children.push(value);return value;}
 async function allAbsent(identities,cleanup=false){const until=Math.min(deadline+(cleanup?NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds:0),Date.now()+30000);for(;;){if(!cleanup)active();if(identities.every(identity=>nativeProcStatV1(identity.pid)===null))return;
   assert.ok(Date.now()<until,'NATIVE_SOURCE_ORIGINAL_PROCESSES_PRESENT');await wait(25);}}
 const tlsDirectory=join(privateDirectory,'tls');mkdirSync(tlsDirectory,{mode:0o700});const certificatePath=join(tlsDirectory,'certificate.pem'),keyPath=join(tlsDirectory,'key.pem');
 const portServer=createServer();await new Promise((resolveDone,rejectDone)=>{portServer.once('error',rejectDone);portServer.listen(0,'127.0.0.1',resolveDone);});const port=portServer.address().port;await new Promise((resolveDone,rejectDone)=>portServer.close(error=>error?rejectDone(error):resolveDone()));
 execFileSync('/usr/bin/openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-sha256','-days','2','-nodes','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:FALSE','-keyout',keyPath,'-out',certificatePath],{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:'ignore',timeout:5000});chmodSync(certificatePath,0o600);chmodSync(keyPath,0o600);
 const origin='https://localhost:'+port,certificate=readFileSync(certificatePath,'utf8');const transport={posts:{},tlsVersion:null};
 const fetch=createNativeSourceTlsTransportV1({active,origin,certificate,transport});
 const fromApp=path=>import(pathToFileURL(join(resolve(FLAT,'../../../apps/mobile'),'src',path)).href);
 try{save();await stage('SOURCE-product-born-before-original-device-funding');
  const signing=await fromApp('custody/signing.mjs');for(let attempt=0;attempt<16&&!deviceKey;attempt++){const bytes=randomBytes(32);try{deviceKey=signing.privateKeyFromHex(bytes.toString('hex'));}catch{}finally{bytes.fill(0);}}assert.ok(deviceKey);
  configuration={origin,devicePublicKey:signing.devicePublicKey(deviceKey),tls:{certificate,privateKey:readFileSync(keyPath,'utf8')}};
  backend=backendStart();const born=await backend.call('START',{mode:'CREATE',configuration});result.birth=born;result.artifacts={noteKeys:{deposit_balance:born.initial.artifactKeys.deposit_balance},graphKeys:{authorization:born.initial.artifactKeys.authorization,reservation:born.initial.artifactKeys.reservation}};
  host=await openDeviceReservationHostVaultV1({appRoot:resolve(FLAT,'../../../apps/mobile'),directory:join(privateDirectory,'mobile-ciphertext'),fetch});
  const createdRoot=await host.original.createLocalRootNoteVaultV1();rootId=createdRoot.rootId;vault=host.original.openLocalRootNoteVaultV1(rootId);
  mobileState=(await fromApp('state/private-wallet-state-v1.mjs')).createPrivateWalletStateV1();
  const economicBirth=await backend.call('STATE_CACHE');assert.equal(economicBirth.value.storageAvailable,true);
  dapi=await host.deposit.createDeviceOwnerDepositApiV1(born.initial.descriptor);const sign=message=>signing.signDeviceMessage(deviceKey,message);
  const access=async api=>{const value=await api.access();return{access:value,signature:sign(originalAccountAccessMessageV2(value))};};
  const submitOnce=async(api,value)=>{try{return{response:await api.submit(value),httpUnknown:false};}catch(error){assert.equal(error.message,'MOBILE_SERVICE_UNAVAILABLE');return{response:null,httpUnknown:true};}};
  const retain=receipts=>{for(const row of receipts){if(result.proofs.some(p=>p.label===row.label))continue;const {relation,proof,label}=row;const bytes=Buffer.from(proof.proof,'hex');let inputs=Buffer.from(JSON.stringify(proof.publicInputs)),evidence;
    if(relation==='deposit_balance'){assert.equal(earlierNotes.has(proof.metrics.id+'.json'),false);const raw=readNativeFlowRegularV1(join(GOLDEN,'evidence/paeg-proof-attempts',proof.metrics.id+'.json'),1048576);
     evidence=assertNativeEconomicNoteTelemetryV1({relation,returnedMetrics:proof.metrics,storedMetrics:JSON.parse(raw),proofSHA256:sha(bytes),publicInputsSHA256:sha(inputs),telemetrySHA256:sha(raw)});writeFileSync(join(proofDirectory,label+'.telemetry.json'),raw,{flag:'wx',mode:0o600});
    }else{const e=proof.evidence;assert.equal(earlierGraph.has(e.runId),false);const base=join(LOCAL,'attempts',e.runId),manifest=readNativeFlowRegularV1(join(base,'proof-manifest.json')),worker=readNativeFlowRegularV1(join(base,'result.json')),resources=readNativeFlowRegularV1(join(base,'resources.json'));
     inputs=readNativeFlowRegularV1(join(base,'public-inputs.json'));assert.deepEqual(JSON.parse(inputs),proof.publicInputs);assert.equal(sha(readNativeFlowRegularV1(join(base,'proof.bin'))),sha(bytes));assert.equal(e.manifestSHA256,sha(manifest));
     evidence={...e,manifest:JSON.parse(manifest),result:JSON.parse(worker),resources:JSON.parse(resources),...assertBtcSolGraphProofReceipts({relation,runId:e.runId,jobId:e.jobId,manifest:JSON.parse(manifest),result:JSON.parse(worker),resources:JSON.parse(resources),proofSHA256:sha(bytes),publicInputsSHA256:sha(inputs),manifestSHA256:sha(manifest),resultSHA256:sha(worker),resourcesSHA256:sha(resources)})};}
    assert.equal(evidence.keySHA256,born.initial.artifactKeys[relation]);writeFileSync(join(proofDirectory,label+'.bin'),bytes,{flag:'wx',mode:0o600});writeFileSync(join(proofDirectory,label+'.inputs.json'),inputs,{flag:'wx',mode:0o600});
    result.proofs.push({label,relation,file:label,publicWords:proof.publicInputs.length,amountAtomic:'500',proofSHA256:sha(bytes),publicInputsSHA256:sha(inputs),evidence});}save();};
  const scope=bare(born.initial.domain.scope),policy=bare(born.initial.domain.policy),pool=bare(born.initial.domain.pool),recipient=bare(born.initial.domain.recipient);
  const prepared=await vault.prepareUnissuedBalanceNote({scope,policy,pool,recipient,amount:'500'}),epoch=(BigInt(born.initial.head.timestamp)/600n).toString();
  const noteSigned=await vault.signPreparedDeposit(await vault.reviewPreparedDeposit({relation:'D26',epoch}));localRequest=await vault.createDeviceProofRequest(noteSigned);
  const consent=await dapi.challengeJob({...await access(dapi),statement:{scope,policy,epoch,amount:'500',output:prepared.commitment},rootId,noteRevision:localRequest.noteRevision,witnessSHA256:localRequest.witnessSHA256,jobId:null});
  witness=await vault.bindDeviceProofRequest(localRequest,consent);localRequest.close();localRequest=null;
  await stage('original-device-D26-proof-one-admission');const d26Submit=await submitOnce(dapi,{consent,signature:sign(deviceDepositConsentMessageV1(consent)),witness});
  retain(await backend.call('RECEIPTS',{count:1}));for(const value of Object.values(witness))if(Array.isArray(value))value.fill(0);witness=null;
  await stage('original-device-D26-funding-one-wire');const fund=await dapi.challenge('FUND_D26',{...await access(dapi),jobId:consent.jobId});const funding=await submitOnce(dapi,{consent:fund,signature:sign(deviceDepositConsentMessageV1(fund))});await backend.call('RECEIPTS',{count:1});
  const observeD26=async()=>{const c=await dapi.challenge('OBSERVE_D26',{...await access(dapi),jobId:consent.jobId});const value=await dapi.submit({consent:c,signature:sign(deviceDepositConsentMessageV1(c))});assert.equal(value.state,'CONFIRMED');const observed=host.deposit.readDeviceDepositInclusionV1(value.observation);await vault.applyDeviceDepositInclusion(value.observation);return observed;};
  const originalD26=await observeD26();result.deposit={jobId:consent.jobId,commitment:prepared.commitment,observation:originalD26,proveHttpUnknown:d26Submit.httpUnknown,fundHttpUnknown:funding.httpUnknown};
  assert.equal((await vault.readDeviceNote()).availableBalance,'500');await mobileState.acceptNative(await vault.readDeviceNote());const sourceMobileBefore=mobileState.snapshot();
  assert.equal(sourceMobileBefore.rows.length,1);assert.equal(sourceMobileBefore.rows[0].available,'500');assert.equal(sourceMobileBefore.aggregateBalance,null);
  const economicD26Before=await backend.call('STATE_READ'),vaultBefore=await vault.readDeviceNote(),writesBefore=host.evidence().writes;
  await stage('confirmed-SOURCE-abrupt-backend-exit17-without-capture');const crash=await backend.call('EXIT17');const exit=await backend.closed;assert.deepEqual(exit,{code:17,signal:null});await allAbsent(crash.ownedProcesses);
  result.crash={...crash,exit,allOriginalProcessesAbsent:true,parentVaultRetained:true,configuredKernelParentDeathSignal:'SIGTERM',signalDeliveryObserved:false};dapi.close();
  await stage('new-PID-opens-SAME-original-SOURCE-capsule');backend=backendStart();const reopened=await backend.call('START',{mode:'OPEN',configuration});assert.notEqual(reopened.initial.process.pid,born.initial.process.pid);
  assert.deepEqual(reopened.initial.descriptor,born.initial.descriptor);assert.deepEqual(reopened.initial.ledger,crash.before.ledger);assert.deepEqual(reopened.initial.counts,crash.before.counts);assert.ok(reopened.initial.sourceGeneration>born.initial.sourceGeneration);
  const restoredD26Note=await vault.readDeviceNote();for(const field of ['rootId','revision','commitment','amount','status','job','localReservation'])assert.deepEqual(restoredD26Note[field],vaultBefore[field]);
  assert.equal(restoredD26Note.availableBalance,null);assert.equal(host.evidence().writes,writesBefore);result.reopen=reopened;
  const economicD26Open=await backend.call('STATE_CACHE');assert.deepEqual(economicD26Open.checkpoint,economicD26Before.checkpoint);
  assert.equal(economicD26Open.value.observedAt,null);assert.ok(economicD26Open.value.rows.every(row=>row.state!=='LIVE'&&row.balances===null));const restoredReceipts=await backend.call('RECEIPTS',{count:1});assert.equal(restoredReceipts[0].proof.proof,result.proofs[0]?readFileSync(join(proofDirectory,result.proofs[0].label+'.bin')).toString('hex'):'');retain(restoredReceipts);
  dapi=await host.deposit.createDeviceOwnerDepositApiV1(reopened.initial.descriptor);const renewed=await observeD26();for(const k of ['jobId','commitment','nullifier','transactionHash'])assert.equal(renewed[k],originalD26[k]);
  await mobileState.acceptNative(await vault.readDeviceNote());const sourceMobileAfter=mobileState.snapshot();assert.equal(sourceMobileAfter.rows[0].available,'500');
  const economicD26Fresh=await backend.call('STATE_READ');
  await assert.rejects(dapi.challenge('FUND_D26',{...await access(dapi),jobId:consent.jobId}));assert.equal(result.proofs.length,1);
  rapi=await host.reservation.createDeviceOwnerReservationApiV1(reopened.initial.descriptor);await stage('same-funded-source-next-original-U');
  const quote=await rapi.preparation({...await access(rapi),depositJobId:consent.jobId,rootId});const review=await vault.prepareDeviceReservationFromQuote(quote);assert.equal(review.changeAmount,'400');assert.equal(review.recoveryAmount,'100');
  const signedU=await vault.signDeviceReservation(review);localRequest=await vault.createDeviceAuthorizationRequest(signedU,quote);
  const u=await rapi.challengeJob({...await access(rapi),depositJobId:consent.jobId,quoteId:localRequest.quoteId,jobId:localRequest.jobId,custody:localRequest.custody,statement:localRequest.statement,witnessSHA256:localRequest.witnessSHA256});
  witness=await vault.bindDeviceAuthorizationRequest(localRequest,u);const uReply=await submitOnce(rapi,{consent:u,signature:sign(deviceReservationConsentMessageV1(u)),witness});retain(await backend.call('RECEIPTS',{count:2}));wipeDeviceReservationWitnessV1(witness);witness=null;localRequest.close();localRequest=null;
  await stage('next-original-S-no-duplicated-D26-U-or-wire');const s=await rapi.challenge('RESERVE_S',{...await access(rapi),jobId:u.jobId});const sReply=await submitOnce(rapi,{consent:s,signature:sign(deviceReservationConsentMessageV1(s))});retain(await backend.call('RECEIPTS',{count:3}));
  const readS=await rapi.challenge('OBSERVE_S',{...await access(rapi),jobId:u.jobId}),observedS=await rapi.submit({consent:readS,signature:sign(deviceReservationConsentMessageV1(readS))});assert.equal(observedS.stage,'RESERVED');await vault.applyDeviceReservationInclusion(observedS);
  result.reservation={jobId:u.jobId,statement:u.statement,observation:observedS.observation,uHttpUnknown:uReply.httpUnknown,sHttpUnknown:sReply.httpUnknown};
  await assert.rejects(rapi.challenge('RESERVE_S',{...await access(rapi),jobId:u.jobId}));
  eapi=await host.execution.createDeviceOwnerExecutionApiV1(reopened.initial.descriptor);await stage('first-fresh-device-ARM-same-original-eight-hour-cutoff');
  const arm=await eapi.challengeRecoveryArm('ARM_RECOVERY',{...await access(eapi),jobId:u.jobId});const armed=await eapi.submitRecoveryArm({consent:arm,signature:sign(deviceRecoveryArmConsentMessageV1(arm))});assert.equal(armed.state,'ARMED');
  const readArm=await eapi.observeRecoveryArm({...await access(eapi),jobId:u.jobId});assert.equal(readArm.armSHA256,armed.armSHA256);const final=await backend.call('ARM_AUDIT',{jobId:u.jobId});assert.equal(final.arm.armSHA256,armed.armSHA256);
  assert.equal(final.counts.receiver,born.initial.counts.receiver+2);assert.equal(final.counts.native,born.initial.counts.native);assert.equal(final.ledger.publicState.actualAssetBalance,'500');assert.equal(final.ledger.publicState.backedAmount,'500');
  assert.ok(final.ledger.nullifiers.includes('0x'+originalD26.nullifier));assert.ok(final.ledger.commitments.includes('0x'+u.statement.changeCommitment));assert.equal(final.ownerView.balances.available,'0');assert.equal(final.linuxSummary.notes.source.status,'UNISSUED');
  result.arm={permission:armed,read:readArm,final,firstFreshPermission:true,noEarlyF:true};
  outputApi=await host.outputBalance.createDeviceOwnerOutputBalanceApiV1(reopened.initial.descriptor);
  const readOutputs=async()=>{const subject=await vault.readDeviceOutputBalanceSubject(),handle=await outputApi.observe({...await access(outputApi),...subject});
   await vault.applyDeviceOutputBalances(handle);const value=host.outputBalance.readDeviceOutputBalanceV1(handle),note=await vault.readDeviceNote();
   assert.equal(value.change.amount,'400');assert.equal(value.change.state,'UNSPENT');assert.equal(value.recovery.amount,'100');assert.equal(value.recovery.state,'LOCKED');
   assert.equal(note.localReservation.change.availableBalance,'400');assert.equal(note.localReservation.recovery.availableBalance,null);
   await mobileState.acceptNative(note);const common=mobileState.snapshot();assert.equal(common.rows.length,2);assert.equal(common.aggregateBalance,null);assert.equal(common.completePortfolio,false);
   assert.deepEqual(common.rows.map(row=>[row.route.noteRole,row.available,row.locked]),[['change','400',null],['recovery',null,'100']]);return{value,note,common};};
  const beforeOutputs=await readOutputs(),economicArmBefore=await backend.call('STATE_READ'),armedVaultBefore=await vault.readDeviceNote(),armedWrites=host.evidence().writes;
  await stage('confirmed-original-ARM-abrupt-backend-exit17-without-rearm-or-capture');
  const armedCrash=await backend.call('EXIT17_ARM',{jobId:u.jobId}),armedExit=await backend.closed;assert.deepEqual(armedExit,{code:17,signal:null});await allAbsent(armedCrash.ownedProcesses);
  result.armedCrash={...armedCrash,exit:armedExit,allOriginalProcessesAbsent:true,parentVaultRetained:true,configuredKernelParentDeathSignal:'SIGTERM',signalDeliveryObserved:false};
  assert.equal(armedCrash.before.snapshot.arm.armSHA256,armed.armSHA256);assert.deepEqual(armedCrash.before.snapshot.ledger,final.ledger);
  dapi.close();rapi.close();eapi.close();outputApi.close();vault.forgetDeviceOutputBalanceObservation();const mobileInvalidated=mobileState.snapshot();
  assert.ok(mobileInvalidated.rows.every(row=>row.available===null&&row.locked===null&&row.state==='STALE'));
  await stage('third-original-backend-PID-resumes-the-SAME-ARM-without-fresh-permission');backend=backendStart();
  const armedReopen=await backend.call('START',{mode:'OPEN_ARMED',configuration,jobId:u.jobId});
  assert.notEqual(armedReopen.initial.process.pid,born.initial.process.pid);assert.notEqual(armedReopen.initial.process.pid,reopened.initial.process.pid);
  assert.deepEqual(armedReopen.initial.descriptor,reopened.initial.descriptor);assert.ok(armedReopen.initial.sourceGeneration>reopened.initial.sourceGeneration);
  assert.deepEqual(armedReopen.initial.snapshot.ledger,armedCrash.before.snapshot.ledger);assert.deepEqual(armedReopen.initial.snapshot.counts,armedCrash.before.snapshot.counts);
  assert.equal(armedReopen.initial.snapshot.arm.armSHA256,armed.armSHA256);assert.equal(armedReopen.initial.snapshot.arm.state,'ARMED');
  assert.equal(host.evidence().writes,armedWrites);const retainedNote=await vault.readDeviceNote();
  assert.equal(retainedNote.revision,armedVaultBefore.revision);assert.deepEqual(retainedNote.localReservation.transactionHash,armedVaultBefore.localReservation.transactionHash);
  result.armedReopen=armedReopen;const economicArmOpen=await backend.call('STATE_CACHE');assert.deepEqual(economicArmOpen.checkpoint,economicArmBefore.checkpoint);
  assert.equal(economicArmOpen.value.observedAt,null);assert.ok(economicArmOpen.value.rows.every(row=>row.state!=='LIVE'&&row.balances===null));
  const originalSReceipt=(await backend.call('RECEIPTS',{count:3}))[0];
  assert.equal(originalSReceipt.label,result.proofs[2].label);assert.equal(sha(Buffer.from(originalSReceipt.proof.proof,'hex')),result.proofs[2].proofSHA256);assert.equal(sha(Buffer.from(JSON.stringify(originalSReceipt.proof.publicInputs))),result.proofs[2].publicInputsSHA256);
  eapi=await host.execution.createDeviceOwnerExecutionApiV1(armedReopen.initial.descriptor);
  const resumedArm=await eapi.observeRecoveryArm({...await access(eapi),jobId:u.jobId});assert.equal(resumedArm.state,'ARMED');assert.equal(resumedArm.armSHA256,armed.armSHA256);
  await assert.rejects(eapi.challengeRecoveryArm('ARM_RECOVERY',{...await access(eapi),jobId:u.jobId}));
  outputApi=await host.outputBalance.createDeviceOwnerOutputBalanceApiV1(armedReopen.initial.descriptor);const afterOutputs=await readOutputs();
  for(const role of ['change','recovery'])for(const k of ['amount','state','commitment','nullifier'])assert.equal(afterOutputs.value[role][k],beforeOutputs.value[role][k]);
  const resumedFinal=await backend.call('ARM_AUDIT',{jobId:u.jobId});assert.equal(resumedFinal.arm.armSHA256,armed.armSHA256);assert.deepEqual(resumedFinal.ledger,final.ledger);assert.deepEqual(resumedFinal.counts,final.counts);
  result.armedObservation={arm:resumedArm,outputs:afterOutputs.value,final:resumedFinal,originalPermissionRetained:true,noNewProofKeyOrSend:true};
  const economicArmFresh=await backend.call('STATE_READ');
  result.economicState={birth:economicBirth,d26:{before:economicD26Before,opened:economicD26Open,fresh:economicD26Fresh},armed:{before:economicArmBefore,opened:economicArmOpen,fresh:economicArmFresh},
   mobile:{sourceBefore:sourceMobileBefore,sourceAfter:sourceMobileAfter,outputsBefore:beforeOutputs.common,invalidated:mobileInvalidated,outputsAfter:afterOutputs.common}};
  result.sourceEconomicStateAbruptRestartEstablished=true;result.sourceMobileStateCoherenceEstablished=true;
  result.sourceArmedAbruptRestartEstablished=true;assert.equal(result.proofs.length,3);
  result.economics={amountAtomic:'500',changeAtomic:'400',recoveryAtomic:'100',receiverFinancialWires:2,nativeDeliveryWires:0,poolBackedAtomic:'500'};
  result.mobileCustody=host.evidence();assert.equal(result.mobileCustody.rootPersistedToFile,false);assert.equal(transport.tlsVersion,'TLSv1.3');result.tlsVersion=transport.tlsVersion;
  result.sourceAbruptRestartNodeAcceptance=true;result.nativeProcessRestartEstablished=true;
 }catch(error){primary=error;writeFixturePrivate(join(privateDirectory,'first-error-private.json'),privateNativeEconomicSuccessorFirstErrorV1(error));result.phase='failed';save();}
 finally{localRequest?.close();if(witness){for(const v of Object.values(witness))if(Array.isArray(v))v.fill(0);}dapi?.close();rapi?.close();eapi?.close();outputApi?.close();
  try{if(backend&&nativeProcStatV1(backend.child.pid)!==null){const stopped=await backend.call('CLOSE');const exit=await backend.closed;assert.deepEqual(exit,{code:0,signal:null});await allAbsent(stopped.ownedProcesses,true);result.cleanup.backend=stopped;result.cleanup.closedEvm=true;result.cleanup.closedNativeEvm=true;result.cleanup.closedNativeExecution=true;result.cleanup.closedBackend=true;}}catch(error){primary??=error;result.cleanup.errors.push('NATIVE_SOURCE_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED');if(backend?.child.connected)backend.child.disconnect();}
  mobileState?.clear();vault?.close();result.cleanup.closedMobileVault=true;deviceKey?.fill(0);configuration=null;if(host){result.mobileCustody??=host.evidence();host.close();result.cleanup.closedMobileHost=true;}
  for(const c of children)if(nativeProcStatV1(c.child.pid)!==null)result.cleanup.errors.push('NATIVE_SOURCE_BACKEND_PID_PRESENT');
  try{assert.deepEqual(nativeSourceAbruptSourcePinsV1(),sources);result.sourceUnchanged=true;}catch(error){primary??=error;result.cleanup.errors.push('NATIVE_SOURCE_ACCEPTANCE_SOURCE_CHANGED');}
  process.off('SIGTERM',signals);process.off('SIGINT',signals);}
 if(primary){result.phase='failed';result.error=privateNativeEconomicSuccessorFirstErrorV1(primary);save();throw primary;}
 result.success=true;result.phase='completed';assertNativeSourceAbruptResultV1(result);save();process.stdout.write(JSON.stringify({format:result.format,phase:'completed',success:true})+'\n');
}
try{await run();}catch{process.exitCode=1;}
