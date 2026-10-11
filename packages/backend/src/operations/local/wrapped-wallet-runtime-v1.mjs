import {prepareWrappedColdCheckpointPublicationV1} from '../../claims/wrapped/recovery/wrapped-cold-checkpoint-v1.mjs';
import { inspectWrappedInstallationSourcesV2 } from '@lianum/components/verification/wrapped-installation';
/** Fixed original wrapped fixture. No external callbacks, factory selectors,
 * snapshots, node options, issuers or clock hooks enter this constructor. */
import assert from 'node:assert/strict';
import { mkdirSync, lstatSync, realpathSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, sep } from 'node:path';
import { WRAPPED_WALLET_FIXED_RELEASE_V1, WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1, assertWrappedDeploymentOnlyReleaseV1,
  WRAPPED_WALLET_ECONOMICS_V1 as E } from '../releases/wrapped/wrapped-wallet-fixed-policy-v1.mjs';
import { createWrappedWalletAcceptanceSystemV1 } from '../wallet/wrapped-wallet-composition-v1.mjs';
import { originalWrappedDeploymentFailureDataV1,originalWrappedDeploymentFailurePrivateDataV1 } from '../deployments/wrapped/wrapped-claim-system-v1.mjs';
const originals=new WeakMap(),fixtureRecoveryPartsV1=new WeakMap();
export function consumeWrappedFixtureRecoveryPartV1(token,part){assert.equal(arguments.length,2);const entry=fixtureRecoveryPartsV1.get(token);assert.ok(entry&&entry.part===part&&!entry.used&&entry.active,'WRAPPED_RECOVERY_FIXTURE_PART_TOKEN');entry.used=true;return entry.value;}
async function withFixtureRecoveryPartV1(part,value,work){const token=Object.freeze(Object.create(null)),entry={part,value,used:false,active:true};fixtureRecoveryPartsV1.set(token,entry);try{const result=await work(token);assert.equal(entry.used,true);return result;}finally{entry.active=false;entry.value=null;fixtureRecoveryPartsV1.delete(token);}}

function projectPrivateNativeCleanupV1(name,capture){
 assert.equal(capture.terminal?.ownedProcessStopped,true);assert.equal(capture.terminal?.forced,false);
 if(name==='solana')assert.equal(capture.terminal.nativeOrderlyExit,true);
 return {scope:'ORIGINAL_PRIVATE_NATIVE_CAPTURE_V1',stopped:true,ownedProcessStopped:true,forced:false,nativeOrderlyExit:name==='solana'?true:null,privateStateRetained:true};
}
function fixedFixtureCloserV1(s){let closing;return async function close(){if(s.recoveryCaptured)return s.recoveryCleanup;if(closing)return closing;closing=(async()=>{
  const rows={},closeOne=async(name,value)=>{if(!value)return;try{rows[name]={ok:true,result:await value.close()};}catch{rows[name]={ok:false};}};
  // The application drains both journals and releases opened provider leases
  // before the original recipient is stopped. The custody facade keeps its original opened-lease guard.
  for(let i=0;i<s.resources.length;i++)await closeOne('resource'+i,s.resources[i]);
  if(s.providerCustody){const status=s.providerCustody.report();
   if(status.closed)rows.providerCustody={ok:true,result:{closed:true,ownedByOriginalExecution:true}};
   // The original close safely releases no-lease or issued-but-unopened state.
   // If an opened lease survived its consumer's close, its own guard refuses;
   // record that failure rather than forging its lifetime or resetting it.
   else await closeOne('remainingProviderCustody',s.providerCustody);}
  await closeOne('controller',s.controller);await closeOne('keeper',s.keeper);
  for(let i=0;i<s.owners.length;i++)await closeOne('owner'+i,s.owners[i]);
  for(const [role,value]of Object.entries(s.proofClients??{}))await closeOne(role,value);
  await closeOne('bootstrap',s.bootstrap);
  if(s.privateLifetime){const a=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');await closeOne('privateLifetime',{close:()=>a.closeWrappedPrivateLifetimeRegistryV1(s.privateLifetime)});}
  // An interrupted cold capture must never fall back to destructive teardown.
  if(s.recoveryCapturing||s.nativeRetentionRequired) {
   const evm=await import('../../chains/evm/runtime/owned-evm-v2-runtime.mjs'),sol=await import('../../chains/solana/runtime/owned-solana-runtime.mjs'),btc=await import('../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs');
   const captures=[['graphNative',s.graphNative,evm.captureOwnedEvmRecoveryV1],['solana',s.solana,sol.captureOwnedSolanaRecoveryV1],['bitcoin',s.bitcoin,btc.captureOwnedBitcoinRecoveryV1],['runtime',s.runtime,evm.captureOwnedEvmRecoveryV1]];
   for(const [name,value,capture] of captures)if(value)try{const privateCapture=await capture(value);rows[name]={ok:true,result:projectPrivateNativeCleanupV1(name,privateCapture)};}catch{rows[name]={ok:false,destructiveCleanupSkipped:true};}
  } else {await closeOne('graphNative',s.graphNative);await closeOne('solana',s.solana);await closeOne('bitcoin',s.bitcoin);await closeOne('runtime',s.runtime);}s.closed=true;
  return {allOwnedResourcesClosed:Object.values(rows).every(row=>row.ok),rows,
   closedEvm:rows.runtime?.ok===true&&(rows.runtime.result?.stopped===true||rows.runtime.result?.terminal?.ownedProcessStopped===true),
   closedGraphEvm:rows.graphNative?.ok===true&&(rows.graphNative.result?.stopped===true||rows.graphNative.result?.terminal?.ownedProcessStopped===true),
   closedBitcoin:rows.bitcoin?.ok===true&&(rows.bitcoin.result?.ownedProcessStopped===true||rows.bitcoin.result?.terminal?.ownedProcessStopped===true),
   closedSolana:rows.solana?.ok===true&&(rows.solana.result?.ownedProcessStopped===true||rows.solana.result?.terminal?.nativeOrderlyExit===true)};})();return closing;};}

// BEGIN ORIGINAL CONSTRUCTION FAILURE HANDOFF. Data only, never ownership.
const constructionFailures=new WeakMap();
function freezeConstructionData(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freezeConstructionData(child);Object.freeze(value);}return value;}
function constructionFailureCode(error){try{const d=Object.getOwnPropertyDescriptor(error,'message');return d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Z][A-Z0-9_]{2,120}$/.test(d.value)?d.value:'WRAPPED_FIXED_CONSTRUCTION_FAILED';}catch{return 'WRAPPED_FIXED_CONSTRUCTION_FAILED';}}
function retainOriginalConstructionFailure(error,directory,cleanup,deployment,evidenceWrite){
 const failure=error&&(typeof error==='object'||typeof error==='function')?error:new Error('WRAPPED_FIXED_CONSTRUCTION_FAILED',{cause:error});
 const record=freezeConstructionData({directory,cleanup:structuredClone(cleanup),deployment,evidenceWrite:structuredClone(evidenceWrite)});
 constructionFailures.set(failure,record);return failure;
}
export function originalWrappedFixtureConstructionFailureV1(error,directory){assert.equal(arguments.length,2);const value=error&&(typeof error==='object'||typeof error==='function')?constructionFailures.get(error):null;return value?.directory===directory?value:null;}
// END ORIGINAL CONSTRUCTION FAILURE HANDOFF.
export function ownedWrappedWalletFixedFixtureV1(value){const s=originals.get(value);assert.ok(s&&!s.closed&&!s.recoveryCapturing,'WRAPPED_FIXED_ORIGINAL_FIXTURE_REQUIRED');inspectWrappedInstallationSourcesV2();return s;}
/** Exact selected runtime/compiler input bytes only. No process, network,
 * compiler initialization, key, perf library or runtime capability is created.
 * Original constructors still perform their own pinned reads when released. */
export async function inspectWrappedFixedRuntimeInputsV1(){
 assert.equal(arguments.length,0,'WRAPPED_FIXED_RUNTIME_INPUTS_NO_OPTIONS');inspectWrappedInstallationSourcesV2();
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
 const {linuxRuntimePins}=await import('@lianum/engine/chains/shared/linux-runtime-pins');
 const {pinnedBinary,projectRoot}=await import('@lianum/engine/chains/shared/runtime-harness');
 const solana=await import('../../chains/solana/runtime/owned-solana-runtime.mjs');
 assert.deepEqual(solana.SOLANA_PRIVATE_COHORT_OPTIONS,{ledgerRetentionShreds:1000000,ticksPerSlot:64,resourceProfile:solana.SOLANA_BOUNDED_LEDGER_PROFILE});
 assert.equal(solana.SOLANA_BOUNDED_LEDGER_PROFILE,'PC23_BOUNDED_LEDGER_V1');
 assert.deepEqual(solana.solanaLedgerRetentionArguments(solana.SOLANA_PRIVATE_COHORT_OPTIONS),['--limit-ledger-size','1000000']);
 const {recoveryAnvilPinV1}=await import('../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
 const runtimePins={anvil:recoveryAnvilPinV1,bitcoin:linuxRuntimePins.bitcoin,bitcoinCli:linuxRuntimePins.cli,solana:solana.solanaCandidateBoundedLedgerCompatibilityPin};
 assert.deepEqual(runtimePins.solana,['agave-v2.3.13-loopback-memtable128m-candidate-20261005/solana-test-validator','a159dd521869c60e317b0db6d4f5ac7b24cfbb400308e6349a0fd63586d58517']);
 const paths={};for(const [name,pin]of Object.entries(runtimePins)){const path=await pinnedBinary(...pin),st=lstatSync(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o111)!==0,'WRAPPED_FIXED_RUNTIME_EXECUTABLE_REQUIRED');paths[name]=path;}
 try{lstatSync(join(dirname(paths.solana),'perf-libs'));assert.fail('SOLANA_UNREVIEWED_PERFORMANCE_LIBRARY_DIRECTORY');}catch(error){if(error.code!=='ENOENT')throw error;}
 // The actual linked compiler is the pinned JS Solc C API. Do not access or
 // substitute the legacy native-Solc path from linuxRuntimePins.
 const {GENERIC_COMPILER_PIN:compiler}=await import('@lianum/engine/execution/local/local-deployment');
 const hash=b=>createHash('sha256').update(b).digest('hex'),toolRoot=realpathSync(join(projectRoot,'tools/solidity-js'));
 const lockBytes=readFileSync(join(toolRoot,'package-lock.json'));assert.equal(hash(lockBytes),compiler.lockSHA256,'GENERIC_SOLC_LOCK_HASH');
 const pkg=JSON.parse(lockBytes).packages?.['node_modules/solc'];assert.equal(pkg?.version,compiler.packageVersion,'GENERIC_SOLC_VERSION_PIN');assert.equal(pkg.resolved,compiler.resolved,'GENERIC_SOLC_ORIGIN_PIN');assert.equal(pkg.integrity,compiler.integrity,'GENERIC_SOLC_INTEGRITY_PIN');
 const modulePath=realpathSync(join(toolRoot,'node_modules/solc/soljson.js'));assert.ok(modulePath.startsWith(toolRoot+sep),'GENERIC_SOLC_PATH_ESCAPE');assert.equal(hash(readFileSync(modulePath)),compiler.soljsonSHA256,'GENERIC_SOLJSON_HASH');
 inspectWrappedInstallationSourcesV2();return Object.freeze({runtimePins:Object.freeze(Object.fromEntries(Object.entries(runtimePins).map(([name,pin])=>[name,Object.freeze([...pin])]))),solanaResourceProfile:solana.SOLANA_BOUNDED_LEDGER_PROFILE,adjacentPerfLibrariesAbsent:true,linkedCompiler:{packageVersion:compiler.packageVersion,lockSHA256:compiler.lockSHA256,soljsonSHA256:compiler.soljsonSHA256},inputsOnly:true,executed:false});
}
export async function createWrappedWalletFixedFixtureV1(directory){
 assert.equal(arguments.length,1);assert.ok(WRAPPED_WALLET_FIXED_RELEASE_V1||WRAPPED_WALLET_FIXED_PREFLIGHT_RELEASE_V1,'WRAPPED_FIXED_NOT_RELEASED');return createFixedFixture(directory,false);
}
export async function createWrappedDeploymentOnlyFixtureV1(directory){
 assert.equal(arguments.length,1);assertWrappedDeploymentOnlyReleaseV1();return createFixedFixture(directory,true);
}
async function createFixedFixture(directory,deploymentOnly){
 assert.equal(arguments.length,2);assert.equal(typeof deploymentOnly,'boolean');inspectWrappedInstallationSourcesV2();
 assert.equal(resolve(directory),directory);assert.equal(realpathSync(directory),directory);const stat=lstatSync(directory);
 assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0);
 const {loadWrappedClaimDeploymentArtifactsV1}=await import('../deployments/wrapped/wrapped-claim-deployment-artifacts-v1.mjs');
 await loadWrappedClaimDeploymentArtifactsV1(); // full genuine fourteen-role gate before ANY runtime
 await inspectWrappedFixedRuntimeInputsV1(); // selected binary/compiler bytes before the first constructor
 const {createOwnedRecoverableReceiverV1,createOwnedRecoverableGraphNativeV1,armOwnedEvmRecoveryRetentionV1}=await import('../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
 const {createOwnedBitcoinCustodyRuntime,armOwnedBitcoinRecoveryRetentionV1}=await import('../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs');
 const {createOwnedSolanaCustodyRuntime,armOwnedSolanaRecoveryRetentionV1}=await import('../../chains/solana/runtime/owned-solana-runtime.mjs');
 const {freshFixtureId,writeFixturePrivate}=await import('../../storage/private-json-file.mjs');
 const s={directory,closed:false,owners:[],resources:[],proofClients:null,baseline:null,closure:null};const close=fixedFixtureCloserV1(s);

 const fixture=Object.freeze({close});originals.set(fixture,s);
 try{
  inspectWrappedInstallationSourcesV2();s.runtime=await createOwnedRecoverableReceiverV1();const receiverRetention=await armOwnedEvmRecoveryRetentionV1(s.runtime);
  const lifetime=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const {wrappedWalletFixedSourcePinsV1}=await import('../releases/wrapped/wrapped-wallet-fixed-source-pins-v1.mjs'),{NATIVE_FLOW_LIMITS}=await import('@lianum/proofs/host/native-flow-limits');
  const lock=JSON.parse(readFileSync(join(dirname(dirname(directory)),'active.lock'),'utf8'));
  assert.equal(directory,join(dirname(dirname(directory)),'attempt-'+lock.runId,'private-audit'));assert.equal(lock.pid,process.ppid);
  const deadlineMs=Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
  const sourceSHA256=createHash('sha256').update(JSON.stringify(wrappedWalletFixedSourcePinsV1())).digest('hex');
  s.privateLifetime=await lifetime.createWrappedPrivateLifetimeRegistryV1({runtime:s.runtime,directory,runId:lock.runId,sourceSHA256,deadlineMs});
  s.privateLifetimeIdentity=lifetime.wrappedPrivateLifetimeRegistryIdentityV1(s.privateLifetime);
  async function retainNativeInitialization(name,descriptor){const part=await lifetime.retainWrappedPrivateLifetimePartV1(s.runtime,name,{schema:descriptor.schema,family:descriptor.family,processGeneration:descriptor.processGeneration},descriptor);lifetime.assertWrappedPrivateLifetimePartSealedV1(part);}
  await retainNativeInitialization('native-receiver',receiverRetention);
  inspectWrappedInstallationSourcesV2();s.bitcoin=await createOwnedBitcoinCustodyRuntime();await retainNativeInitialization('native-bitcoin',await armOwnedBitcoinRecoveryRetentionV1(s.bitcoin));
  inspectWrappedInstallationSourcesV2();s.solana=await createOwnedSolanaCustodyRuntime();await retainNativeInitialization('native-solana',await armOwnedSolanaRecoveryRetentionV1(s.solana));inspectWrappedInstallationSourcesV2();s.graphNative=await createOwnedRecoverableGraphNativeV1();await retainNativeInitialization('native-graph-evm',await armOwnedEvmRecoveryRetentionV1(s.graphNative));
  inspectWrappedInstallationSourcesV2();assert.equal(typeof s.runtime.advanceTo,'function');assert.equal(s.graphNative.advanceTo,undefined);
  assert.equal(s.graphNative.advanceNativeTime,undefined);assert.equal(s.runtime.metadata.chainId,'31337');assert.equal(s.graphNative.metadata.chainId,'1');
  assert.notEqual(s.runtime.metadata.processId,s.graphNative.metadata.processId);
  const journalRoot=join(directory,'claim-keepers');mkdirSync(journalRoot,{mode:0o700});
  const combined=await createWrappedWalletAcceptanceSystemV1({runtime:s.runtime,nativeRuntimes:[s.bitcoin,s.solana],graphNativeRuntimes:[s.graphNative],journalRoot});
  Object.assign(s,combined);
  const op=await import('../operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs'),custody=await import('../operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');
  const originalIdentity={receiverGenesis:s.runtime.metadata.evmGenesis,hub:s.system.hub.address};
  const operatorPart=await lifetime.retainWrappedPrivateLifetimePartV1(s.runtime,'operator-keys',{profile:'WRAPPED_ORIGINAL_OPERATOR_INITIALIZATION_V1',...originalIdentity},op.snapshotWrappedClaimOperatorInitializationV1(s.bootstrap));
  const custodyPart=await lifetime.retainWrappedPrivateLifetimePartV1(s.runtime,'custody-bootstrap',{profile:'WRAPPED_ORIGINAL_CUSTODY_INITIALIZATION_V1',...originalIdentity},custody.captureWrappedClaimCustodyBootstrapRecoveryV1(s.runtime,s.custodyBootstrap));
  lifetime.assertWrappedPrivateLifetimePartSealedV1(operatorPart);lifetime.assertWrappedPrivateLifetimePartSealedV1(custodyPart);s.privateLifetimeCredentialsStored=true;
  if(deploymentOnly){s.deploymentOnlyCompleted=true;return fixture;} // Stop immediately after the original helper.
 const {createWrappedOwnerClaimObserverV1}=await import('../../custody/observers/wrapped-claim-owner-claim-observer-v1.mjs');
 const {createWrappedClaimOwnerProcessV1}=await import('../../custody/processes/wrapped-claim-owner-process-v1.mjs');
 const {createDurableNativeClaimControllerKeeper}=await import('../../claims/wrapped/controller/wrapped-controller-journal-v1.mjs');
 const {createWrappedNativeClaimControllerV1}=await import('../../claims/wrapped/controller/wrapped-controller-v1.mjs');
 const {createWrappedClaimRoleProofClientV1}=await import('../../proving/wrapped-claims/runtime/wrapped-claim-client-v1.mjs');
  s.observer=s.system.claimObserver;
  const registered=s.system.adapterProfiles.filter(row=>row.kind==='native-value');assert.equal(registered.length,1);assert.equal(registered[0].profile.chainId,'1');
  // Exactly preposition/reserveSignedEffect/issue/S/checkpoint before first I.
  // Receiver-only, forward-only, before owner terms, D27 proof or any principal.
  const nativeNow=await s.graphNative.time(),receiverNow=await s.runtime.time(),target=nativeNow+1n-5n;
  assert.ok(receiverNow<=target,'WRAPPED_FIXED_RECEIVER_SCHEDULE_UNAVAILABLE');
  assert.ok((nativeNow-target)*1000n<=BigInt(registered[0].profile.maximumClockSkewMs),'WRAPPED_FIXED_RECEIVER_SKEW');
  assert.equal(s.graphNative.transactions.length,0);assert.equal(s.bitcoin.transfers.length,0);assert.equal(s.solana.transfers.length,0);
  if(receiverNow<target)await s.runtime.advanceTo(target.toString());
  assert.equal(await s.runtime.time(),target);assert.equal(await s.graphNative.time(),nativeNow);
  s.schedule=Object.freeze({nativeInitialSecond:String(nativeNow),receiverInitialSecond:String(target),receiverBlocksBeforeGraphNative:5,nativeClockMutated:false});
  for(const poolIndex of [0,1]){
   const path=join(directory,'owner-'+poolIndex);mkdirSync(path,{mode:0o700});
   const nativeClaimObserver=await createWrappedOwnerClaimObserverV1({runtime:s.runtime,system:s.system,poolIndex,claims:s.system.claims,claimObserver:s.observer});
   s.owners.push(await createWrappedClaimOwnerProcessV1({runtime:s.runtime,system:s.system,poolIndex,directory:path,password:freshFixtureId(),create:true,checkpoint:null,
    onCheckpoint:value=>writeFixturePrivate(join(path,'checkpoint.json'),value),nativeClaimObserver}));
  }
  s.ingressProverIdentity=freshFixtureId();
  s.keeper=await createDurableNativeClaimControllerKeeper({runtime:s.runtime,claims:s.system.claims,path:join(journalRoot,'original.vault'),password:freshFixtureId()});
  s.proofClients={claim_ingress:createWrappedClaimRoleProofClientV1('claim_ingress'),claim_discharge:createWrappedClaimRoleProofClientV1('claim_discharge')};
  s.controller=await createWrappedNativeClaimControllerV1({runtime:s.runtime,claims:s.system.claims,observer:s.observer,operators:s.system.claimOperators,
   quorum:s.system.claimQuorum,proofClients:s.proofClients,keeper:s.keeper,ingressProverIdentity:s.ingressProverIdentity});
  return fixture;
 }catch(error){
  const cleanup=await close(),deployment=originalWrappedDeploymentFailureDataV1(error);
  const failure=retainOriginalConstructionFailure(error,directory,cleanup,deployment,{attempted:false,succeeded:false,errorCode:null});
  try {
   writeFixturePrivate(join(directory,'construction-failure.json'),{message:constructionFailureCode(error),cleanup,deployment,privateRpcFailure:originalWrappedDeploymentFailurePrivateDataV1(error)});
   retainOriginalConstructionFailure(failure,directory,cleanup,deployment,{attempted:true,succeeded:true,errorCode:null});
  } catch(writeError) {
   // Keep the exact thrown failure and its owned cleanup even if the private
   // evidence file cannot be written. Never infer cleanup from a disk file.
   let code;try{code=Object.getOwnPropertyDescriptor(writeError,'code')?.value;}catch{}
   retainOriginalConstructionFailure(failure,directory,cleanup,deployment,{attempted:true,succeeded:false,
    errorCode:typeof code==='string'&&/^[A-Z][A-Z0-9_]{2,120}$/.test(code)?code:'WRAPPED_FIXED_CONSTRUCTION_EVIDENCE_WRITE_FAILED'});
  }
  throw failure;
 }
}

/** Ordered pre-principal capture is a distinct gate. It never claims funded
 * wallet/provider recovery or permits destructive full-economic teardown. */
export async function retainWrappedFixtureContextForReopenV1(fixture,token) {
  assert.equal(arguments.length,2);const s=ownedWrappedWalletFixedFixtureV1(fixture);
 const {retainOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1}=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const identity=originalWrappedRecoverySectionIdentityV1(token,'fixture');assert.equal(s.directory,identity.directory,'WRAPPED_RECOVERY_FIXTURE_ATTEMPT_CHANGED');
 const funded=identity.profile==='WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1';
 if(funded){assert.equal(s.walletCapturedForRecovery,true,'WRAPPED_RECOVERY_WALLET_CAPTURE_REQUIRED');assert.equal(s.cycleRecoveryContext?.stage,'GRAPH_FULFILLED_BEFORE_WITHDRAWAL');}
 else{assert.equal(identity.profile,'WRAPPED_FIXED_PRIVATE_RECOVERY_AUTHORITY_V1');assert.equal(s.resources.length,0,'WRAPPED_RECOVERY_PRE_PRINCIPAL_ONLY');assert.equal(s.providerCustody,undefined);
  assert.equal(s.solana.transfers.length,0,'WRAPPED_RECOVERY_PRE_PRINCIPAL_ONLY');assert.equal(s.bitcoin.transfers.length,0,'WRAPPED_RECOVERY_PRE_PRINCIPAL_ONLY');assert.equal(s.graphNative.transactions.length,0,'WRAPPED_RECOVERY_PRE_PRINCIPAL_ONLY');}
 assert.ok(s.schedule&&s.ingressProverIdentity&&s.controller&&s.keeper&&s.owners.length===2);
 const {captureWrappedWalletTerminalRecoveryV1}=await import('../../claims/wrapped/recovery/wrapped-terminal-baseline-v1.mjs');const terminalBaseline=captureWrappedWalletTerminalRecoveryV1(fixture);s.recoveryCapturing=true;
 const record={schema:'WRAPPED_FIXED_FIXTURE_CONTEXT_V1',directory:s.directory,schedule:structuredClone(s.schedule),ingressProverIdentity:s.ingressProverIdentity,
  lifecyclePhase:funded?'GRAPH_FULFILLED_BEFORE_WITHDRAWAL':'PRE_PRINCIPAL',stepsProofs:funded?structuredClone(s.cycleRecoveryContext.proofs):null,terminalBaseline};
  await retainOriginalWrappedRecoverySectionV1(token,'fixture',record);
  await s.controller.close();
  for(const client of Object.values(s.proofClients))await client.close();
  return {retained:true,originalResourcesStopped:true};
}
export async function captureWrappedWalletFixedFixtureV1(fixture,authority,unfunded) {
  assert.equal(arguments.length,3);const s=ownedWrappedWalletFixedFixtureV1(fixture);s.nativeRetentionRequired=true;
  const a=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  await a.retainWrappedFixtureRecoveryV1(authority,fixture);
  await a.retainWrappedOwnersRecoveryV1(authority,{owners:s.owners});
  await a.retainWrappedKeeperRecoveryV1(authority,s.keeper);
  await a.retainWrappedSystemRecoveryV1(authority,{runtime:s.runtime,system:s.system,bootstrap:s.bootstrap,custodyBootstrap:s.custodyBootstrap});
  await a.retainWrappedPrivateLifetimeRecoveryV1(authority,s.runtime);
  for(const [family,runtime] of [['graphNative',s.graphNative],['solana',s.solana],['bitcoin',s.bitcoin],['receiver',s.runtime]])await a.retainWrappedRuntimeRecoveryV1(authority,family,runtime);
  const finalizationIntent=await a.prepareWrappedRecoveryFinalizationV1(authority);const {profile,...identity}=finalizationIntent.identity;const publicationReceipt=prepareWrappedColdCheckpointPublicationV1({...identity,index:0,finalizationIntent,unfunded});const checkpoint=await a.finishWrappedRecoveryCaptureV1(authority,finalizationIntent,publicationReceipt);s.closed=true;s.recoveryCaptured=true;s.recoveryCleanup={allOwnedResourcesClosed:true,rows:{},closedEvm:true,closedGraphEvm:true,closedBitcoin:true,closedSolana:true,privateStateRetained:true,scope:'PRE_PRINCIPAL_ORIGINAL_FIXTURE_CAPTURE_V1'};
  return {checkpoint,scope:'PRE_PRINCIPAL_ORIGINAL_FIXTURE_CAPTURE_V1',fullEconomicAcceptance:false};
}
export async function reopenWrappedWalletFixedFixtureV1(input) {
  assert.equal(arguments.length,1);inspectWrappedInstallationSourcesV2();
  const {exactRecord,fixedArray}=await import('@lianum/components/encoding/commitments');
  exactRecord(input,['runtime','nativeRuntimes','graphNativeRuntimes','system','bootstrap','custodyBootstrap','owners','keeper','attemptAuthority']);
  fixedArray(input.nativeRuntimes,2);fixedArray(input.graphNativeRuntimes,1);fixedArray(input.owners,2);
  const {consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1}=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const identity=originalWrappedRecoverySectionIdentityV1(input.attemptAuthority,'fixture');
  const r=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'fixture');assert.equal(r.directory,identity.directory,'WRAPPED_RECOVERY_FIXTURE_ATTEMPT_CHANGED');
  exactRecord(r,['schema','directory','schedule','ingressProverIdentity','lifecyclePhase','stepsProofs','terminalBaseline']);assert.equal(r.schema,'WRAPPED_FIXED_FIXTURE_CONTEXT_V1');
  assert.equal(r.lifecyclePhase,identity.profile==='WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1'?'GRAPH_FULFILLED_BEFORE_WITHDRAWAL':'PRE_PRINCIPAL');if(r.lifecyclePhase==='PRE_PRINCIPAL')assert.equal(r.stepsProofs,null);else assert.ok(Array.isArray(r.stepsProofs)&&r.stepsProofs.length===2);assert.match(r.ingressProverIdentity,/^[0-9a-f]{64}$/);
  assert.equal(resolve(r.directory),r.directory);assert.equal(realpathSync(r.directory),r.directory);
  const st=lstatSync(r.directory);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o700);
  const {assertWrappedClaimOperatorBootstrapForSystemV1}=await import('../operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs');
  assertWrappedClaimOperatorBootstrapForSystemV1(input.bootstrap,{runtime:input.runtime,system:input.system});
  const {assertOwnedWrappedClaimOwnerProcessV1}=await import('../../custody/processes/wrapped-claim-owner-process-v1.mjs');
  input.owners.forEach((owner,poolIndex)=>assertOwnedWrappedClaimOwnerProcessV1(owner,{runtime:input.runtime,system:input.system,poolIndex}));
  const s={directory:r.directory,closed:false,owners:[...input.owners],resources:[],proofClients:null,baseline:null,closure:null,
    runtime:input.runtime,bitcoin:input.nativeRuntimes[0],solana:input.nativeRuntimes[1],graphNative:input.graphNativeRuntimes[0],
    system:input.system,bootstrap:input.bootstrap,custodyBootstrap:input.custodyBootstrap,keeper:input.keeper,
    observer:input.system.claimObserver,schedule:Object.freeze(r.schedule),ingressProverIdentity:r.ingressProverIdentity,recovered:true,recoveredLifecyclePhase:r.lifecyclePhase,recoveredStepProofs:r.stepsProofs};
  const close=fixedFixtureCloserV1(s),fixture=Object.freeze({close});originals.set(fixture,s);
  try {
    const {createWrappedClaimRoleProofClientV1}=await import('../../proving/wrapped-claims/runtime/wrapped-claim-client-v1.mjs');
    const {createWrappedNativeClaimControllerV1}=await import('../../claims/wrapped/controller/wrapped-controller-v1.mjs');
    s.proofClients={claim_ingress:createWrappedClaimRoleProofClientV1('claim_ingress'),claim_discharge:createWrappedClaimRoleProofClientV1('claim_discharge')};
    s.controller=await createWrappedNativeClaimControllerV1({runtime:s.runtime,claims:s.system.claims,observer:s.observer,operators:s.system.claimOperators,
      quorum:s.system.claimQuorum,proofClients:s.proofClients,keeper:s.keeper,ingressProverIdentity:s.ingressProverIdentity});
    await s.controller.reconcileAll({});assert.equal((await s.controller.status()).requiresExternalEffectReconciliation,false,'WRAPPED_RECOVERY_ORIGINAL_RECONCILIATION_REQUIRED');
    const {reopenWrappedWalletTerminalRecoveryV1}=await import('../../claims/wrapped/recovery/wrapped-terminal-baseline-v1.mjs');
    await withFixtureRecoveryPartV1('terminal',{fixture,record:r.terminalBaseline},token=>reopenWrappedWalletTerminalRecoveryV1(token));
    return fixture;
  }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'WRAPPED_RECOVERY_FIXTURE_CLEANUP_FAILED',{cause:error});}throw error;}
}

export async function captureWrappedWalletFixedFundedFixtureV1(fixture,authority,unfunded) {
 assert.equal(arguments.length,3);const s=ownedWrappedWalletFixedFixtureV1(fixture),context=s.cycleRecoveryContext;s.nativeRetentionRequired=true;
 assert.ok(context&&context.schema==='WRAPPED_ORIGINAL_GRAPH_FULFILLED_CONTINUATION_V1');assert.equal(context.stage,'GRAPH_FULFILLED_BEFORE_WITHDRAWAL');
 assert.equal(s.providerCustody,context.provider);assert.equal(s.resources.length,2);assert.equal(s.resources[1],context.recipient);
 const a=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 assert.equal(a.wrappedRecoveryAuthorityStatusV1(authority).profile,'WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1');
 s.controller=context.wallet.originalController();
 await a.retainWrappedWalletRecoveryV1(authority,context.wallet);s.walletCapturedForRecovery=true;
 await a.retainWrappedFixtureRecoveryV1(authority,fixture);
 await a.retainWrappedOwnersRecoveryV1(authority,{owners:s.owners});await a.retainWrappedKeeperRecoveryV1(authority,s.keeper);
 await a.retainWrappedSystemRecoveryV1(authority,{runtime:s.runtime,system:s.system,bootstrap:s.bootstrap,custodyBootstrap:s.custodyBootstrap});
 await a.retainWrappedPrivateLifetimeRecoveryV1(authority,s.runtime);
 for(const [family,runtime]of [['graphNative',s.graphNative],['solana',s.solana],['bitcoin',s.bitcoin],['receiver',s.runtime]])await a.retainWrappedRuntimeRecoveryV1(authority,family,runtime);
 const finalizationIntent=await a.prepareWrappedRecoveryFinalizationV1(authority);const {profile,...identity}=finalizationIntent.identity;const publicationReceipt=prepareWrappedColdCheckpointPublicationV1({...identity,index:1,finalizationIntent,unfunded});const checkpoint=await a.finishWrappedRecoveryCaptureV1(authority,finalizationIntent,publicationReceipt);s.closed=true;s.recoveryCaptured=true;
 s.recoveryCleanup={allOwnedResourcesClosed:true,rows:{},closedEvm:true,closedGraphEvm:true,closedBitcoin:true,closedSolana:true,privateStateRetained:true,scope:'ORIGINAL_FUNDED_GRAPH_FULFILLED_CAPTURE_V1'};
 return {checkpoint,scope:'ORIGINAL_FUNDED_GRAPH_FULFILLED_CAPTURE_V1',fullEconomicAcceptance:false};
}
/** Fixed original reopen order; no replacement factory or caller callback. */
export async function reopenWrappedWalletFixedRecoveryV1(authority) {
 assert.equal(arguments.length,1);inspectWrappedInstallationSourcesV2();
 const a=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs'),status=a.wrappedRecoveryAuthorityStatusV1(authority);
 const handles=[];let runtime,bitcoin,solana,graphNative,combined,owners,keeper,fixture,privateLifetime;
 const retain=value=>{handles.push(value);return value;};
 try {
  runtime=retain(await a.reopenWrappedRuntimeFromAuthorityV1(authority,'receiver'));privateLifetime=await a.reopenWrappedPrivateLifetimeFromAuthorityV1(authority,runtime);
  const lifetime=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');retain({close:()=>lifetime.closeWrappedPrivateLifetimeRegistryV1(privateLifetime)});
  bitcoin=retain(await a.reopenWrappedRuntimeFromAuthorityV1(authority,'bitcoin'));
  solana=retain(await a.reopenWrappedRuntimeFromAuthorityV1(authority,'solana'));graphNative=retain(await a.reopenWrappedRuntimeFromAuthorityV1(authority,'graphNative'));
  combined=await a.reopenWrappedSystemFromAuthorityV1(authority,{runtime,nativeRuntimes:[bitcoin,solana],graphNativeRuntimes:[graphNative]});retain(combined.bootstrap);
  const {createWrappedOwnerClaimObserverV1}=await import('../../custody/observers/wrapped-claim-owner-claim-observer-v1.mjs');
  const nativeClaimObservers=[];for(const poolIndex of [0,1])nativeClaimObservers.push(await createWrappedOwnerClaimObserverV1({runtime,system:combined.system,poolIndex,claims:combined.system.claims,claimObserver:combined.system.claimObserver}));
  owners=await a.reopenWrappedOwnersFromAuthorityV1(authority,{runtime,system:combined.system,nativeClaimObservers});owners.forEach(retain);
  keeper=retain(await a.reopenWrappedKeeperFromAuthorityV1(authority,{runtime,claims:combined.system.claims}));
  fixture=await a.reopenWrappedFixtureFromAuthorityV1(authority,{runtime,nativeRuntimes:[bitcoin,solana],graphNativeRuntimes:[graphNative],...combined,owners,keeper});
  const reopenedState=ownedWrappedWalletFixedFixtureV1(fixture);reopenedState.privateLifetime=privateLifetime;reopenedState.privateLifetimeIdentity=lifetime.wrappedPrivateLifetimeRegistryIdentityV1(privateLifetime);reopenedState.privateLifetimeCredentialsStored=true;
  if(status.profile==='WRAPPED_FIXED_FUNDED_PRIVATE_RECOVERY_AUTHORITY_V1') {
   const s=ownedWrappedWalletFixedFixtureV1(fixture);
   const wallet=await a.reopenWrappedWalletFromAuthorityV1(authority,{runtime,system:s.system,owners,controller:s.controller,bootstrap:s.bootstrap,nativeRuntimes:[graphNative],deadlineMs:status.deadlineMs});
   const {ownedWrappedWalletRecoveryResourcesV1}=await import('../wallet/wrapped-wallet-composition-v1.mjs'),resources=ownedWrappedWalletRecoveryResourcesV1(wallet);
   assert.equal(resources.providers.length,1);assert.ok(resources.recipient);s.recoveryWallet=wallet;s.providerCustody=resources.providers[0];
   s.resources.push(Object.freeze({async close(){let failed=false;try{await wallet.close();}catch(error){failed=true;throw error;}finally{try{s.controller=wallet.originalController();}catch(error){if(!failed)throw error;}}}}),resources.recipient);
  }
  return fixture;
 }catch(error){const failures=[];if(fixture)try{await fixture.close();}catch(e){failures.push(e);}else{
   for(const value of handles.reverse())try{await value.close();}catch(e){failures.push(e);}
   if(combined)try{const m=await import('../operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs');m.revokeWrappedClaimCustodyBootstrapV1(runtime,combined.custodyBootstrap);}catch(e){failures.push(e);}
  }if(failures.length)throw new AggregateError([error,...failures],'WRAPPED_RECOVERY_ORIGINAL_FIXTURE_REOPEN_FAILED',{cause:error});throw error;}
}

export async function createWrappedFixedRecipientWithLifetimeV1(fixture,input){
 assert.equal(arguments.length,2);const s=ownedWrappedWalletFixedFixtureV1(fixture);assert.equal(input.mode,'create');assert.equal(input.path,join(s.directory,'original-recipient.vault'));
 const a=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const identity={profile:'WRAPPED_ORIGINAL_RECIPIENT_INITIALIZATION_V1',receiverGenesis:s.runtime.metadata.evmGenesis,hub:s.system.hub.address,path:input.path,expectedTerms:structuredClone(input.expectedTerms),withdrawalRecipient:input.withdrawalRecipient};
 const initial={bootstrap:structuredClone(input),process:null,recoveryAdmissionGranted:false};
 const handle=await a.retainWrappedPrivateLifetimeIndexedPartV1(s.runtime,'recipient',identity,initial);a.assertWrappedPrivateLifetimePartSealedV1(handle);
 const {createNativeRecipientProcess,attachWrappedRecipientInitializationV1}=await import('../../execution/native/recipients/native-recipient-process.mjs');
 const recipient=await createNativeRecipientProcess(input);
 try{const report=recipient.report();await a.updateWrappedPrivateLifetimePartV1(handle,{...initial,process:{pid:report.pid,lifetimeIdentity:report.processLifetimeIdentity}});
  await withFixtureRecoveryPartV1('recipient-initialization',{runtime:s.runtime,identity,handle},token=>attachWrappedRecipientInitializationV1(recipient,token));return recipient;
 }catch(error){await recipient.close();throw error;}
}
