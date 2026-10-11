/** Fixed same-host SOURCE product. Its private capsule is born before native
 * CREATE or funds. Confirmed points reopen original resources; a half mutation
 * exposes UNKNOWN only and emits no source/economic capabilities. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {nativeValueFailureDiagnostic} from '../../execution/native-value/reconciliation/native-value-failure-retention.mjs';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {Vault} from '@lianum/engine/crypto/vault';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {createOwnedLocalNativeValueOperatorBootstrap} from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import {deployNativeValueDevSystemV5} from '../deployments/native-value/native-value-system-v2.mjs';
import {loadNativeValueDevDeploymentArtifactsV5} from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../releases/native-value/native-value-dev-release-v5.mjs';
import {createNativeValueOwnerProcess} from '../../custody/processes/native-value-owner-process-v2.mjs';
import {createNativeValueExecution} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {readOriginalSessionWalletEconomicStateV1} from '../../api/accounts/flat-manual-graph-session.mjs';
import {createPairedOriginalAccountActorV2,pairedOriginalAccountActorDescriptorV2} from '../../api/mobile/paired-original-account-actor-v2.mjs';
import {createDeviceOwnerDepositBridgeV1} from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import {createDeviceOwnerReservationBridgeV1} from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import {createDeviceOwnerExecutionBridgeV1} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import {takeOriginalNativeProviderRecoveredLeaseV1} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import {retainOriginalNativeDeviceSourceInstallationV1,consumeOriginalNativeDeviceSourceInstallationV1,readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {createPairedDeviceAccountTlsServerV1} from '../../api/mobile/paired-original-account-http-v2.mjs';
import {prepareOriginalNativeSourceLocalProviderV1} from './native-device-local-provider-v1.mjs';
import {normalizeOriginalNativeDeviceLocalConfigurationV1} from './native-device-local-restart-v1.mjs';
import {createOriginalNativeSourceLiveRecoveryProducerV1} from './native-device-local-live-recovery-v1.mjs';
import {createOriginalNativeSourceObservedClocksV1,reopenOriginalNativeSourceObservedClocksV1,refreshOriginalNativeSourceObservedClockV1} from './native-original-source-lifecycle-v1.mjs';
import {bindOwnedNativeDurableSourceClockPairV1} from './native-original-source-lifecycle-v1.mjs';
import {createOriginalNativeSourceCapsuleV1,openOriginalNativeSourceCapsuleV1,assertOriginalNativeSourceCapsuleV1,originalNativeSourceCapsuleStatusV1,readOriginalNativeSourceOwnedProcessesV1,retainOriginalNativeSourceReferenceV1,reopenOriginalNativeSourceReferenceV1,createOriginalNativeSourceAccountV1,createOriginalNativeSourceSessionV1,finishOriginalNativeSourceBirthV1,finishOriginalNativeSourceReopenV1,closeOriginalNativeSourceCapsuleV1} from './native-original-source-lifecycle-v1.mjs';
const services=new WeakMap();
const fresh=()=>randomBytes(32).toString('hex');
const local=join(ROOT,'.local/original-native-source-durable-operator-v1');
const callerPin=Object.freeze({path:'apps/platform/src/run-original-native-source-v1.mjs',bytes:4040,sha256:'796e759333325c8e232091d3778820a4d5c59c3828bb66f1668590ed2d1c06cc'});
export function originalNativeSourceLocalConfigurationPathV1(){assert.equal(arguments.length,0);return join(local,'operator.json');}
async function reviewed(){
 await loadNativeValueDevDeploymentArtifactsV5();assert.ok(NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row=>row.path==='wallet-platform/modules/ops/native-original-source-local-operator-v1.mjs'),'NATIVE_SOURCE_PRODUCT_REVIEW_REQUIRED');
 const directory=resolve(FLAT,'../../..');assert.equal(await realpath(directory),directory);let path=directory;
 for(const part of callerPin.path.split('/')){path=join(path,part);assert.equal((await lstat(path)).isSymbolicLink(),false);}
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;try{const a=await fd.stat();assert.ok(a.isFile()&&a.nlink===1&&a.size===callerPin.bytes);bytes=await fd.readFile();const b=await fd.stat(),n=await lstat(path);for(const key of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(a[key]===b[key]&&a[key]===n[key]);assert.equal(n.isSymbolicLink(),false);assert.equal(bytes.length,callerPin.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),callerPin.sha256);}finally{bytes?.fill(0);await fd.close();}
}
async function bridges(resources,preparation){
 const {runtime,system,owner,account,nativeExecution,actor}=resources;const original={actor,account,owner,runtime,system,poolIndex:0};
 let depositBridge,reservationBridge,executionBridge;try{depositBridge=await createDeviceOwnerDepositBridgeV1(original);
 reservationBridge=await createDeviceOwnerReservationBridgeV1({...original,nativePreparation:preparation.nativePreparation,invoiceSignatures:preparation.invoiceSignatures});
 executionBridge=await createDeviceOwnerExecutionBridgeV1({account,reservationBridge,nativeExecution,providers:preparation.providers,runtime,system,poolIndex:0});
 return{depositBridge,reservationBridge,executionBridge};}catch(error){for(const bridge of [executionBridge,reservationBridge,depositBridge])try{await bridge?.close();}catch{}throw error;}
}
// These callbacks belong to this producer before any funding. They retain only
// original public proof/evidence frames and finite private failure diagnostics;
// neither getter emits a source token, witness or economic authority.
function executionEvidence(r){
 r.executionProofFrames=[];r.executionFailures=[];
 return{onProof:async value=>{exactRecord(value,['label','relation','proof']);
  if(value.relation!=='recovery')return;
  assert.equal(value.label,'original-timeout-recovery','NATIVE_SOURCE_ORIGINAL_EXECUTION_PROOF');
  const frame=JSON.stringify(value);assert.ok(Buffer.byteLength(frame)<=1048576&&r.executionProofFrames.length<8,'NATIVE_SOURCE_ORIGINAL_EXECUTION_EVIDENCE_BOUND');
  assert.equal(r.executionProofFrames.some(row=>row.frame===frame),false,'NATIVE_SOURCE_ORIGINAL_EXECUTION_PROOF_DUPLICATE');
  r.executionProofFrames.push(Object.freeze({frame,sha256:createHash('sha256').update(frame).digest('hex')}));},
 onPrivateAudit:async value=>{if(value?.stage!=='execution-first-failure')return;
  const original=Object.getOwnPropertyDescriptor(value,'originalError');if(!original||!Object.hasOwn(original,'value'))return;
  if(r.executionFailures.length<8)r.executionFailures.push(nativeValueFailureDiagnostic(original.value));}};
}
export async function readOriginalNativeSourceLocalExecutionProofsV1(service){
 assert.equal(arguments.length,1);const state=services.get(service);assert.ok(state&&!state.r.closing,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');
 await state.r.account.privateStatus();assert.ok(services.get(service)===state&&!state.r.closing,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');
 assertOriginalNativeSourceCapsuleV1(state.r.authority);
 return Object.freeze((state.r.executionProofFrames??[]).map(row=>{assert.equal(createHash('sha256').update(row.frame).digest('hex'),row.sha256,'NATIVE_SOURCE_ORIGINAL_EXECUTION_EVIDENCE_FRAME');return Object.freeze(JSON.parse(row.frame));}));
}
export function readOriginalNativeSourceLocalExecutionFailuresV1(service){
 assert.equal(arguments.length,1);const state=services.get(service);assert.ok(state,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');
 return Object.freeze((state.r.executionFailures??[]).map(value=>Object.freeze(JSON.parse(JSON.stringify(value)))));
}
function lifetime(selected){
 const r={closing:false};let closing=null;
 function close(){assert.equal(arguments.length,0);r.closing=true;return closing??=(async()=>{const failures=[],stopped={};
  const tick=r.producer?.close(),http=r.transport?.close();tick?.catch(()=>{});http?.catch(()=>{});
  async function stop(name,work,check){try{const result=await work();assert.ok(check(result),'NATIVE_SOURCE_PRODUCT_CLOSE_UNCONFIRMED');stopped[name]=true;}catch(error){stopped[name]=false;failures.push(error);}}
  if(r.producer)await stop('ticker',()=>tick,v=>v.closed&&v.originalWorkSettled);
  if(r.transport)await stop('http',()=>http,v=>v.closed&&v.originalWorkSettled&&v.ownedSocketsRemaining===0);
  for(const name of ['executionBridge','reservationBridge','depositBridge'])if(r[name])await stop(name,async()=>{await r[name].close();return{closed:true};},v=>v.closed);
  // No abort/cancellation rewrites an uncertain operation during shutdown.
  if(r.session)await stop('session',()=>r.session.close(),v=>v.phase==='CLOSED');
  if(r.account)await stop('account',()=>r.account.close(),v=>v.closed);
  if(r.nativeExecution)await stop('executor',()=>r.nativeExecution.close(),v=>v.closed);
  if(r.providerCustody)await stop('provider',async()=>{await r.providerCustody.close();return r.providerCustody.report();},v=>v.closed);
  if(r.recipient&&!r.recipientClosed)await stop('recipient',()=>r.recipient.close(),v=>v.exited&&v.exit.code===0&&v.exit.signal===null);
  if(r.actor)await stop('actor',async()=>{await r.actor.close();return{closed:true};},v=>v.closed);
  if(r.owner)await stop('owner',()=>r.owner.close(),v=>v.closed&&v.childExited);
  if(r.bootstrap)await stop('bootstrap',async()=>{r.bootstrap.close();return{closed:true};},v=>v.closed);
  if(r.clocks)await stop('clock',()=>r.clocks.close(),v=>v.closed&&v.originalResourcesStopped);
  else for(const name of ['nativeRuntime','runtime'])if(r[name])await stop(name,()=>r[name].close({removeScratch:false}),v=>v.stopped&&r[name].lifecycle.findLast(x=>x.event==='stopped-owned-process')?.forced===false);
  if(r.authority)await stop('capsule',()=>closeOriginalNativeSourceCapsuleV1(r.authority),v=>v.closed);
  selected.tls=null;if(failures.length)throw new AggregateError(failures,'NATIVE_SOURCE_PRODUCT_CLOSE_UNCONFIRMED');
  return Object.freeze({closed:true,originalResourcesStopped:true,retainedEncryptedJournals:true,betweenOperationsOnly:true,stopped:Object.freeze(stopped)});
 })();}return{r,close,isClosing:()=>closing!==null};
}
function result(r,close,reopened){const service=Object.freeze({profile:'ORIGINAL_NATIVE_DURABLE_SOURCE_OPERATOR_V1',origin:r.transport.url,descriptor:pairedOriginalAccountActorDescriptorV2(r.actor),originalSourceGeneration:originalNativeSourceCapsuleStatusV1(r.authority).generation,reopenedOriginalSources:reopened,betweenOperationsOnly:true,halfMutationRecovery:false,localFakeValues:true,automaticFunding:false,automaticNativeDelivery:false,cloudAuthority:false,close});services.set(service,{r,close});return service;}
/** Private fixed-runner join; copies and closed resources cannot obtain it. */
export function readOriginalNativeSourceLocalContextV1(service){assert.equal(arguments.length,1);const state=services.get(service);assert.ok(state&&!state.r.closing&&state.r.transport,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');assertOriginalNativeSourceCapsuleV1(state.r.authority);return Object.freeze(Object.fromEntries(['runtime','nativeRuntime','system','account','session','owner','nativeExecution','actor','authority'].map(name=>[name,state.r[name]])));}
/** Private original compound owner audit; no caller bridge or observation DTO. */
export async function readOriginalNativeSourceLocalArmedAuditV1(service,jobId){
 assert.equal(arguments.length,2);const state=services.get(service);
 assert.ok(state&&!state.r.closing&&state.r.transport,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');
 assertOriginalNativeSourceCapsuleV1(state.r.authority);
 const audit=await readDeviceOwnerLiveArmedOriginalOwnerSnapshotV1(state.r.account,state.r.executionBridge,jobId);
 assert.ok(services.get(service)===state&&!state.r.closing,'NATIVE_SOURCE_ORIGINAL_LOCAL_SERVICE');
 assertOriginalNativeSourceCapsuleV1(state.r.authority);return audit;
}
export function readOriginalNativeSourceLocalOwnedProcessesV1(service){assert.equal(arguments.length,1);const context=readOriginalNativeSourceLocalContextV1(service);return readOriginalNativeSourceOwnedProcessesV1(context.authority);}
export async function createOriginalNativeSourceLocalOperatorV1(input){
 assert.equal(arguments.length,1);const selected=normalizeOriginalNativeDeviceLocalConfigurationV1(input),{r,close}=lifetime(selected);await reviewed();
 try{r.authority=await createOriginalNativeSourceCapsuleV1();const identity=assertOriginalNativeSourceCapsuleV1(r.authority);
 r.clocks=await createOriginalNativeSourceObservedClocksV1(r.authority);r.runtime=r.clocks.runtime;r.nativeRuntime=r.clocks.nativeRuntime;
 r.bootstrap=await createOwnedLocalNativeValueOperatorBootstrap({nativeRuntimes:[r.nativeRuntime]});
 r.system=await deployNativeValueDevSystemV5({runtime:r.runtime,options:{deploymentDomain:'0x'+fresh(),registryEpoch:'1',bootstrap:r.bootstrap,pools:[0,1].map(()=>({policy:'0x'+fresh(),deploymentDomain:'0x'+fresh()}))}});
 // Retain the original signer inventory only after deployment has bound its
 // runtime/system and finished all four stores, before funding any note.
 await retainOriginalNativeSourceReferenceV1(r.authority,'bootstrap',r.bootstrap);await retainOriginalNativeSourceReferenceV1(r.authority,'system',r.system);
 const ownerDirectory=join(identity.directory,'owner');await mkdir(ownerDirectory,{mode:0o700});const ownerPassword=fresh(),checkpointVault=new Vault(join(ownerDirectory,'operator-checkpoint.vault'));let checkpoint=null;
 r.owner=await createNativeValueOwnerProcess({runtime:r.runtime,system:r.system,poolIndex:0,directory:ownerDirectory,password:ownerPassword,create:true,checkpoint:null,onCheckpoint:async value=>{if(checkpoint)assert.deepEqual(await checkpointVault.read(ownerPassword),checkpoint);const next=checkpoint?await checkpointVault.update(ownerPassword,checkpoint.revision,()=>({checkpoint:value})):await checkpointVault.create({checkpoint:value},ownerPassword);assert.deepEqual(await checkpointVault.read(ownerPassword),next);checkpoint=next;}});await retainOriginalNativeSourceReferenceV1(r.authority,'owner',r.owner);
 r.nativeExecution=await createNativeValueExecution({runtime:r.runtime,system:r.system,poolIndex:0,quorum:r.system.quorum},executionEvidence(r));await retainOriginalNativeSourceReferenceV1(r.authority,'executor',r.nativeExecution);
 const provider=await prepareOriginalNativeSourceLocalProviderV1({runtime:r.runtime,system:r.system,nativeRuntime:r.nativeRuntime,bootstrap:r.bootstrap,clock:r.clocks.clock});r.providerCustody=provider.custody;r.recipient=provider.recipient;await retainOriginalNativeSourceReferenceV1(r.authority,'provider',r.providerCustody);
 r.account=await createOriginalNativeSourceAccountV1(r.authority,{runtime:r.runtime,system:r.system,poolIndex:0,owner:r.owner,nativeExecution:r.nativeExecution,accountId:fresh(),journalId:fresh(),clock:r.clocks.clock,nativeRuntime:r.nativeRuntime});
 const joined=await createOriginalNativeSourceSessionV1(r.authority,{runtime:r.runtime,system:r.system,poolIndex:0,account:r.account,journal:{path:join(identity.directory,'account-session.vault'),password:fresh()},owner:r.owner});r.session=joined.session;
 const preparation=await r.account.ownerActions.createManualPreparation(),requestId='device_product_'+fresh();const review=await preparation.review({requestId,kind:'TOP_UP',amount:'500',exitRecipient:r.runtime.accounts[3].slice(2)}),body=await preparation.confirm();assert.deepEqual(body,review.request);const approval=preparation.originalApproval(requestId);assert.deepEqual(await joined.bindManualNote(approval),body);
 // prepare() acknowledges admission; only the original admitted queue drain
 // establishes its keeper row before clock refresh and actor binding.
 const admitted=await r.session.prepare(body);assert.ok(admitted.admitted===true&&admitted.action==='prepare'&&admitted.requestId===requestId,'NATIVE_SOURCE_ORIGINAL_PREPARATION_ADMISSION');
 const prepared=await r.session.idle(),preparedRows=prepared.requests.filter(row=>row.requestId===requestId),preparedAdmission=prepared.admissions.find(row=>row.sequence===admitted.sequence);
 assert.ok(prepared.available&&prepared.storageAvailable&&prepared.observation==='CURRENT'&&!prepared.busy&&prepared.queued===0&&preparedRows.length===1&&preparedRows[0].kind===body.kind&&preparedRows[0].state==='PREPARED'&&preparedAdmission?.state==='SUCCEEDED'&&preparedAdmission.errorCode===null,'NATIVE_SOURCE_ORIGINAL_PREPARATION_NOT_SETTLED');
 await refreshOriginalNativeSourceObservedClockV1(r.clocks.clock);const economicState=readOriginalSessionWalletEconomicStateV1(r.session);assert.ok(economicState);await economicState.observe();
 const actor=await createPairedOriginalAccountActorV2({session:r.session,approval,owner:r.owner,origin:selected.origin,devicePublicKey:selected.devicePublicKey});r.actor=await retainOriginalNativeSourceReferenceV1(r.authority,'actor',actor);
 Object.assign(r,await bridges(r,{nativePreparation:provider.nativePreparation,invoiceSignatures:provider.invoiceSignatures,providers:[{slot:0,custody:r.providerCustody,deliveryRiskSalt:provider.deliveryRiskSalt}]}));
 const recipient=await r.recipient.close();assert.ok(recipient.exited&&recipient.exit.code===0&&recipient.exit.signal===null,'NATIVE_SOURCE_RECIPIENT_CLOSE_UNCONFIRMED');r.recipientClosed=true;
 await finishOriginalNativeSourceBirthV1(r.authority);r.transport=await createPairedDeviceAccountTlsServerV1({depositBridge:r.depositBridge,reservationBridge:r.reservationBridge,executionBridge:r.executionBridge,tls:selected.tls});
 r.producer=createOriginalNativeSourceLiveRecoveryProducerV1({account:r.account,executionBridge:r.executionBridge,runtime:r.runtime,system:r.system,nativeRuntime:r.nativeRuntime,clock:r.clocks.clock});return result(r,close,false);
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_PRODUCT_START_FAILED',{cause:error});}throw error;}
}
export async function reopenOriginalNativeSourceLocalOperatorV1(input){
 assert.equal(arguments.length,1);const selected=normalizeOriginalNativeDeviceLocalConfigurationV1(input),{r,close}=lifetime(selected);await reviewed();
 try{r.authority=await openOriginalNativeSourceCapsuleV1();const status=originalNativeSourceCapsuleStatusV1(r.authority);
 if(status.phase==='UNKNOWN'){selected.tls=null;return Object.freeze({profile:'ORIGINAL_NATIVE_DURABLE_SOURCE_OPERATOR_V1',phase:'UNKNOWN',observationOnly:true,availableBalance:null,betweenOperationsOnly:true,halfMutationRecovery:false,close});}
 r.runtime=await reopenOriginalNativeSourceReferenceV1(r.authority,'receiver',{});r.nativeRuntime=await reopenOriginalNativeSourceReferenceV1(r.authority,'graphNative',{});bindOwnedNativeDurableSourceClockPairV1(r.runtime,r.nativeRuntime);r.clocks=reopenOriginalNativeSourceObservedClocksV1(r.authority,{runtime:r.runtime,nativeRuntime:r.nativeRuntime});
 r.bootstrap=await reopenOriginalNativeSourceReferenceV1(r.authority,'bootstrap',{runtime:r.runtime,nativeRuntime:r.nativeRuntime});r.system=await reopenOriginalNativeSourceReferenceV1(r.authority,'system',{runtime:r.runtime,bootstrap:r.bootstrap});
 r.providerCustody=await reopenOriginalNativeSourceReferenceV1(r.authority,'provider',{runtime:r.runtime,system:r.system,nativeRuntime:r.nativeRuntime,bootstrap:r.bootstrap});r.owner=await reopenOriginalNativeSourceReferenceV1(r.authority,'owner',{runtime:r.runtime,system:r.system});
 const dispatchLease=takeOriginalNativeProviderRecoveredLeaseV1(r.providerCustody);r.nativeExecution=await reopenOriginalNativeSourceReferenceV1(r.authority,'executor',{runtime:r.runtime,system:r.system,nativeRuntime:r.nativeRuntime,bootstrap:r.bootstrap,providerCustody:r.providerCustody,dispatchLease});
 r.account=await reopenOriginalNativeSourceReferenceV1(r.authority,'account',{runtime:r.runtime,system:r.system,owner:r.owner,nativeExecution:r.nativeExecution,providerCustody:r.providerCustody,clock:r.clocks.clock,nativeRuntime:r.nativeRuntime});
 r.session=await reopenOriginalNativeSourceReferenceV1(r.authority,'session',{runtime:r.runtime,system:r.system,account:r.account,owner:r.owner});r.actor=await reopenOriginalNativeSourceReferenceV1(r.authority,'actor',{session:r.session,account:r.account,owner:r.owner});
 const descriptor=pairedOriginalAccountActorDescriptorV2(r.actor);assert.equal(descriptor.origin,selected.origin);assert.equal(descriptor.devicePublicKey,selected.devicePublicKey);
 const cap=await retainOriginalNativeDeviceSourceInstallationV1(r.account,r.actor,r.providerCustody),installation=consumeOriginalNativeDeviceSourceInstallationV1(cap,r.account,r.actor);exactRecord(installation,installation.state==='ORIGINAL_PRE_ARM'?['nativePreparation','invoiceSignatures','providers','descriptor','state']:['nativePreparation','invoiceSignatures','providers','descriptor','parentJobId','depositJobId','rootId','armSHA256','settleBefore','state']);assert.deepEqual(installation.descriptor,descriptor);
 Object.assign(r,await bridges(r,installation));await finishOriginalNativeSourceReopenV1(r.authority);
 r.transport=await createPairedDeviceAccountTlsServerV1({depositBridge:r.depositBridge,reservationBridge:r.reservationBridge,executionBridge:r.executionBridge,tls:selected.tls});
 if(installation.state!=='RECOVERED')r.producer=createOriginalNativeSourceLiveRecoveryProducerV1({account:r.account,executionBridge:r.executionBridge,runtime:r.runtime,system:r.system,nativeRuntime:r.nativeRuntime,clock:r.clocks.clock});return result(r,close,true);
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_PRODUCT_OPEN_FAILED',{cause:error});}throw error;}
}
