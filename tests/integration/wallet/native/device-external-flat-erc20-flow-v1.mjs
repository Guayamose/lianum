/** One original mobile-owned ERC20 source D26, then full-source W39.
 * Actual local runtime/proof/observer/TLS with original mobile custody/SDK;
 * no Linux note owner, S/GRAPH, callback grants or backend restart. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {PROOF_PROJECT_ROOT} from '../../../../packages/engine/src/execution/proofs/proof-worker.mjs';
import {walletInputPublicWords} from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {derivePrivateAssetIdentity} from '../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import {nativeAdmissionRulesTree} from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import {createOwnedExternalDefiReceiverV2,assertOwnedExternalDefiReceiverV2} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createOwnedPoolAsset} from '../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import {evmRuntimeCodeHash} from '../../../../packages/backend/src/chains/evm/contracts/evm-code-hash.mjs';
import {createOfficialProtocolFixture,assertOfficialProtocolFixture} from '../../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import {createLocalFlatOperator} from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import {deployFlatSystem,assertOwnedFlatSystem} from '../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import {loadFlatDeploymentArtifacts} from '../../../../packages/backend/src/operations/deployments/system/deployment-artifacts.mjs';
import {createFlatSystemStateReader} from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import {readOriginalDeviceExternalFlatProofReceiptsV1} from '../../../../packages/backend/src/accounts/authority/device-external-flat-note-authority-v1.mjs';
import {readOriginalDeviceExternalFlatHttpFailureV1} from '../../../../packages/backend/src/api/mobile/device-external-flat-note-http-v1.mjs';
import {freshFixtureId,writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
import {NATIVE_FLOW_LIMITS} from '../../native/native-flow-supervisor.mjs';
import {readNativeFlowRegularV1,nativeProcStatV1} from '../../native/native-flow-owned-files-v1.mjs';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
import {openDeviceExternalFlatErc20HostV1} from './device-external-flat-erc20-host-vault-v1.mjs';
import {deviceExternalFlatErc20SourcePinsV1} from './device-external-flat-erc20-source-pins-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1,DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1,assertDeviceExternalFlatErc20ReleaseV1,assertDeviceExternalFlatErc20ResultV1} from './device-external-flat-erc20-policy-v1.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),bare=v=>v.startsWith('0x')?v.slice(2):v;
const validId=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(v)?.[0]===v;
// Only closed original mobile Vault labels. This diagnostic grants no capability;
// the TS throw remains the primary error even when metadata storage fails.
const ORIGINAL_MOBILE_FAILURE_CODES_V1=new Set([
 'MOBILE_ENTROPY_FAILED','MOBILE_EXTERNAL_FLAT_ALREADY_OPEN','MOBILE_EXTERNAL_FLAT_BINDING',
 'MOBILE_EXTERNAL_FLAT_BUSY','MOBILE_EXTERNAL_FLAT_CAPACITY','MOBILE_EXTERNAL_FLAT_OBSERVE_ONLY',
 'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOB','MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS',
 'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED','MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED',
 'MOBILE_EXTERNAL_FLAT_UNAVAILABLE','MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN'
]);
function originalDeviceExternalFlatMobileFailureCodeV1(error){
 if(!error||typeof error!=='object'||types.isProxy(error)||!types.isNativeError(error))return null;
 for(const key of ['code','message']){
  const descriptor=Object.getOwnPropertyDescriptor(error,key);
  if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'
   &&ORIGINAL_MOBILE_FAILURE_CODES_V1.has(descriptor.value))return descriptor.value;
 }
 return null;
}
function retainOriginalDeviceExternalFlatFirstErrorV1(path,error){
 try{
  const originalMobileErrorCode=originalDeviceExternalFlatMobileFailureCodeV1(error);
  const first=privateNativeEconomicSuccessorFirstErrorV1(error);
  writeFixturePrivate(path,{...first,originalMobileErrorCode});
 }catch{}
}
async function run(){assertDeviceExternalFlatErc20ReleaseV1();assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);assert.equal(realpathSync(process.cwd()),ROOT);
 assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/device-external-flat-erc20-flow-v1.mjs'));assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
 const parent=readFileSync('/proc/'+process.ppid+'/cmdline','utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);assert.equal(parent[0],process.execPath);
 assert.equal(realpathSync(resolve(realpathSync('/proc/'+process.ppid+'/cwd'),parent[1])),join(ROOT,'integration/run-device-external-flat-erc20-v1.mjs'));
 const local=join(ROOT,'.local',DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1),lock=JSON.parse(readNativeFlowRegularV1(join(local,'active.lock')));assert.equal(lock.pid,process.ppid);assert.equal(validId(lock.runId),true);assert.equal(lock.attempt,'.local/'+DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1+'/attempt-'+lock.runId);
 const directory=join(ROOT,lock.attempt),privateDirectory=join(directory,'private-audit'),proofDirectory=join(directory,'public-proofs');mkdirSync(privateDirectory,{mode:0o700});mkdirSync(proofDirectory,{mode:0o700});
 const sourcePins=deviceExternalFlatErc20SourcePinsV1(),deadline=Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
 let interrupted=false,runtime,host,client,account,system,reader,official,primary;const operators=[],privateWitnesses=[];
 const result={format:DEVICE_EXTERNAL_FLAT_ERC20_RESULT_V1,profile:DEVICE_EXTERNAL_FLAT_ERC20_PROFILE_V1,runId:lock.runId,startedAt:new Date().toISOString(),phase:'starting',success:false,interrupted:false,sourceUnchanged:false,
  supervisor:{supervisorPID:process.ppid,workerPID:process.pid},sourcePins,localOnly:true,fakeFundsOnly:true,publicNetwork:false,nativeExecution:null,nativeDeliveryCount:0,
  originalDeviceExternalFlatNodeAcceptance:false,physicalPhoneEstablished:false,secureStoreHardwareEstablished:false,biometricHardwareEstablished:false,reactRendererEstablished:false,newBackendRecoveryEstablished:false,graphAcceptance:false,fullWalletAcceptance:false,
  proofs:[],stages:[],cleanup:{errors:[]},disclosure:['Actual synthetic local ERC20 D26/TOP_UP and full-source W39/EXIT from one original mobile note opening.',
   'The exact mobile Vault/key-store/SDK execute in Node with real AES-GCM, entropy and loopback TLS1.3. No physical phone, protected hardware or React renderer claim.',
   'The fixed original proof worker receives only this bounded opening/signature, never the root or note private key. Two original WASM proofs and deployed verifier checks.',
   'Original funding and exit replies are discarded only after the same completed work; fresh signed observation reconciles the same jobs without another send.',
   'Original official protocol/System bootstrap and token allowance are explicit local setup. No native delivery, GRAPH, copied account/actor or full backend restart.']};
 const save=()=>writeFixturePrivate(join(directory,'result.json'),result),active=()=>{assert.equal(interrupted,false,'DEVICE_EXTERNAL_FLAT_INTERRUPTED');assert.ok(Date.now()<deadline,'DEVICE_EXTERNAL_FLAT_TOTAL_DEADLINE');};
 const stage=async name=>{active();result.phase=name;result.stages.push({name,at:new Date().toISOString()});save();process.stdout.write(JSON.stringify({stage:name})+'\n');};
 const onSignal=()=>{interrupted=true;result.interrupted=true;};process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
 const retainProofs=()=>{const rows=readOriginalDeviceExternalFlatProofReceiptsV1(account);for(const row of rows){if(result.proofs.some(p=>p.label===row.label))continue;
  assert.ok(['device-external-flat-d26','device-external-flat-w39'].includes(row.label));const r=row.result,e=r.metrics;assert.equal(validId(e.id),true);assert.equal(e.label,row.label);assert.equal(e.mode,row.relation);assert.equal(e.acceptedResult,true);assert.equal(e.phase,'completed');assert.deepEqual(e.exit,{code:0,signal:null});
  const telemetryPath=join(PROOF_PROJECT_ROOT,'evidence/paeg-proof-attempts',e.id+'.json'),before=lstatSync(telemetryPath);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&before.nlink===1&&(before.mode&0o777)===0o600);
  const telemetry=readNativeFlowRegularV1(telemetryPath,1048576),after=lstatSync(telemetryPath);for(const k of ['dev','ino','uid','nlink','size','mtimeMs','ctimeMs'])assert.equal(before[k],after[k]);assert.deepEqual(JSON.parse(telemetry),e,'DEVICE_EXTERNAL_FLAT_ORIGINAL_TELEMETRY');
  const proof=typeof r.proof==='string'?Buffer.from(r.proof,'hex'):Buffer.from(r.proof),inputs=Buffer.from(JSON.stringify(r.publicInputs));assert.equal(sha(proof),e.worker.proofSHA256);assert.equal(sha(inputs),e.worker.publicInputsSHA256);assert.equal(nativeProcStatV1(e.childPID),null,'DEVICE_EXTERNAL_FLAT_PROOF_CHILD_NOT_GONE');
  const name=row.label;writeFileSync(join(proofDirectory,name+'.bin'),proof,{flag:'wx',mode:0o600});writeFileSync(join(proofDirectory,name+'.inputs.json'),inputs,{flag:'wx',mode:0o600});writeFileSync(join(proofDirectory,name+'.telemetry.json'),telemetry,{flag:'wx',mode:0o600});
  result.proofs.push({label:row.label,relation:row.relation,file:name,publicWords:r.publicInputs.length,amountAtomic:'500',proofBytes:proof.length,proofSHA256:sha(proof),publicInputsSHA256:sha(inputs),rawTelemetrySHA256:sha(telemetry),retainedTelemetrySHA256:sha(readNativeFlowRegularV1(join(proofDirectory,name+'.telemetry.json'))),actualProofChildGone:true,evidence:e});}save();};
 const access=async()=>{active();const a=await client.challenge();return[a,await host.sign(a)];};
 const status=async()=>{const[a,s]=await access();const v=await client.status(a,s);await host.vault.acceptStatus(v);return v;};
 const review=async draft=>{const[a,s]=await access();return client.review(a,s,draft);};
 const perform=async(consent,witness=null)=>{const signature=await host.sign(consent);await host.vault.latch(consent);const row=await client.submit(consent,signature,witness);await host.vault.accept(row);return{row,signature};};
 try{save();await stage('owned-erc20-system-before-device-funding');runtime=await createOwnedExternalDefiReceiverV2();official=await createOfficialProtocolFixture(runtime);assertOfficialProtocolFixture(runtime,official);
  const capabilities=[];for(const contract of [official.first,official.vault])capabilities.push(await createOwnedPoolAsset({runtime,deployment:{address:contract.address,transactionHash:contract.receipt.transactionHash,expectedCode:contract.code,codeHash:evmRuntimeCodeHash(contract.code)},symbol:(await official.read(contract,'symbol'))[0],decimals:Number((await official.read(contract,'decimals'))[0]),kind:'ERC20'}));
  const shareIdentity=derivePrivateAssetIdentity(runtime.metadata.chainId,official.vault.address,evmRuntimeCodeHash(official.vault.code)).slice(2),rules=nativeAdmissionRulesTree([{family:'3',genesis:bare(runtime.metadata.evmGenesis),asset:shareIdentity,finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'}]);
  for(let signerIndex=0;signerIndex<4;signerIndex++)operators.push(createLocalFlatOperator({signerIndex}));
  system=await deployFlatSystem(runtime,{deploymentDomain:'0x'+freshFixtureId(),registryEpoch:'1',rulesRoot:'0x'+rules.root,attesterKeys:operators.map(op=>op.publicKey),pools:capabilities.map(assetCapability=>({assetCapability,policy:'0x'+freshFixtureId(),deploymentDomain:'0x'+freshFixtureId()}))});assertOwnedFlatSystem(runtime,system);
  assert.equal(system.bootstrap.poolsUnfunded,true);assert.equal(system.bootstrap.constructorStorageMatched,true);assert.equal(system.bootstrap.completeRuntimesMatched,true);assert.equal(Object.keys(system.verifiers).length,12);
  for(const op of operators){assert.equal(op.status().bound,false);assert.equal(op.status().certifiedInventoryCount,0);await op.close();assert.equal(op.status().closed,true);}result.cleanup.setupOperatorsClosed=true;
  const artifacts=await loadFlatDeploymentArtifacts();result.artifacts={noteKeys:Object.fromEntries(['deposit_balance','withdraw_balance'].map(mode=>[mode,artifacts.verifiers[mode].lineage.keySHA256]))};
  reader=await createFlatSystemStateReader({runtime,system,poolIndex:0});host=await openDeviceExternalFlatErc20HostV1(privateDirectory);const started=await host.start(runtime,system);({account,client}=started);result.assetMetadata=started.descriptor.assetMetadata;assert.equal(result.assetMetadata.decimals,6);
  const recipient=bare(runtime.accounts[1]),amount='500',pool=system.pools[0],asset=pool.assetCapability;assert.equal(await asset.allowance(system.sender,pool.address,(await runtime.block()).number),0n);
  await official.send(official.first,'approve',[pool.address,BigInt(amount)]);const sourceHead=await runtime.block();assert.equal(await asset.allowance(system.sender,pool.address,sourceHead.number),BigInt(amount));assert.ok(await asset.balance(system.sender,sourceHead.number)>=BigInt(amount));
  const initial=await status(),prepared=await host.vault.prepareDeposit(started.descriptor,recipient,amount,initial.observed.timestamp);privateWitnesses.push(prepared.witness);
  assert.equal(Object.hasOwn(prepared.witness,'privateKey'),false);const inputPublic=walletInputPublicWords('deposit_balance',prepared.witness);assert.equal(inputPublic.length,26);
  const transportKeyDifferent=host.devicePublicKey.slice(2)!==Buffer.from(prepared.witness.key_x).toString('hex')+Buffer.from(prepared.witness.key_y).toString('hex');assert.equal(transportKeyDifferent,true);
  const setupTransactions=runtime.transactions.length,setupReceipts=runtime.receipts.length,recipientBefore=await asset.balance('0x'+recipient,sourceHead.number);result.setup={transactions:setupTransactions,receipts:setupReceipts,officialFixture:true,originalSystem:true,registryActorsBound:false,registryActorsSigned:false,userNoteProofs:0,financialTransactions:0};
  await stage('device-original-erc20-source-d26');const depositConsent=await review(prepared.draft),depositProved=await perform(depositConsent,prepared.witness);retainProofs();assert.equal(depositProved.row.stage,'PROVED');
  await stage('device-original-top-up-lost-response');const fundConsent=await review(await host.vault.draft('FUND_D26')),fundSignature=await host.sign(fundConsent);await host.vault.latch(fundConsent);host.loseOriginalReply('FUND_D26');await assert.rejects(client.submit(fundConsent,fundSignature,null),{code:'DEVICE_EXTERNAL_FLAT_HOST_REPLY_LOST'});assert.deepEqual(host.transport().drops,[{action:'FUND_D26',status:200,originalWorkCompleted:true,actualReplyDiscarded:true}]);
  const beforeDuplicate=host.transport().requests.FUND_D26;await assert.rejects(client.submit(fundConsent,fundSignature,null));assert.equal(host.transport().requests.FUND_D26,beforeDuplicate);await host.replayOriginalPermission(fundConsent,fundSignature);
  const fundStatus=await status();assert.equal(fundStatus.jobs.length,1);await host.vault.accept(fundStatus.jobs[0]);const depositObservation=await perform(await review(await host.vault.draft('OBSERVE_D26')));assert.equal(depositObservation.row.stage,'CONFIRMED');
  const funded=await reader.read();await reader.assertCurrent(funded);assert.equal(funded.ledger.publicState.backedAmount,amount);assert.equal(funded.ledger.publicState.actualAssetBalance,amount);assert.equal(funded.ledger.publicState.leaves,1);
  const noteSummary=await host.vault.summary(),commitment=noteSummary.commitment;assert.equal(depositObservation.row.consentFields.statement.output,commitment);const quoteConsent=await review(await host.vault.draft('QUOTE_W39')),quoteReply=await client.submit(quoteConsent,await host.sign(quoteConsent),null);
  const withdrawalPrepared=await host.vault.prepareWithdrawal(quoteReply.quote);privateWitnesses.push(withdrawalPrepared.witness);assert.equal(Object.hasOwn(withdrawalPrepared.witness,'privateKey'),false);
  assert.deepEqual(['rho','key_x','key_y','secret'].map(k=>withdrawalPrepared.witness[k]),['rho','key_x','key_y','secret'].map(k=>prepared.witness[k]));
  await stage('device-original-full-source-w39');const exitConsent=await review(withdrawalPrepared.draft),exitProved=await perform(exitConsent,withdrawalPrepared.witness);retainProofs();assert.equal(exitProved.row.stage,'PROVED');
  await stage('device-original-exit-lost-response');const withdrawalConsent=await review(await host.vault.draft('WITHDRAW_W39')),withdrawalSignature=await host.sign(withdrawalConsent);await host.vault.latch(withdrawalConsent);host.loseOriginalReply('WITHDRAW_W39');await assert.rejects(client.submit(withdrawalConsent,withdrawalSignature,null),{code:'DEVICE_EXTERNAL_FLAT_HOST_REPLY_LOST'});assert.deepEqual(host.transport().drops.map(d=>({action:d.action,status:d.status,originalWorkCompleted:d.originalWorkCompleted,actualReplyDiscarded:d.actualReplyDiscarded})),['FUND_D26','WITHDRAW_W39'].map(action=>({action,status:200,originalWorkCompleted:true,actualReplyDiscarded:true})));
  const exitPosts=host.transport().requests.WITHDRAW_W39;await assert.rejects(client.submit(withdrawalConsent,withdrawalSignature,null));assert.equal(host.transport().requests.WITHDRAW_W39,exitPosts);await host.replayOriginalPermission(withdrawalConsent,withdrawalSignature);
  const exitStatus=await status();assert.equal(exitStatus.jobs.length,2);const observedExit=exitStatus.jobs.find(j=>j.mode==='withdraw_balance');await host.vault.accept(observedExit);const withdrawalObservation=await perform(await review(await host.vault.draft('OBSERVE_W39')));assert.equal(withdrawalObservation.row.stage,'CONFIRMED');
  const final=await reader.read();await reader.assertCurrent(final);assert.equal(final.ledger.publicState.backedAmount,'0');assert.equal(final.ledger.publicState.actualAssetBalance,'0');assert.equal(final.ledger.publicState.spent,1);assert.equal(final.ledger.nullifiers.includes('0x'+quoteReply.quote.statement.nullifier),true);
  const recipientAfter=await asset.balance('0x'+recipient,final.header.number);assert.equal(recipientAfter-recipientBefore,BigInt(amount));assert.equal(runtime.transactions.length,setupTransactions+2);assert.equal(runtime.receipts.length,setupReceipts+2);
  for(const row of [depositObservation.row,withdrawalObservation.row]){const matches=runtime.receipts.filter(r=>r.receipt.transactionHash==='0x'+row.observation.transactionHash);assert.equal(matches.length,1);const receipt=matches[0].receipt;assert.equal(receipt.status,'0x1');assert.equal(receipt.blockHash,'0x'+row.observation.receiptBlockHash);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
  assert.deepEqual(await runtime.block(),final.header);const finalSummary=await host.vault.summary();assert.equal(finalSummary.rootId,noteSummary.rootId);assert.equal(finalSummary.commitment,commitment);assert.equal(finalSummary.pending,null);
  const transport=host.transport();assert.deepEqual(transport.tlsVersions,['TLSv1.3']);assert.deepEqual(transport.drops.map(d=>d.action),['FUND_D26','WITHDRAW_W39']);
  result.deviceNote={amountAtomic:amount,commitment,deposit:depositObservation.row,withdrawal:withdrawalObservation.row,sourceOpeningUnchanged:true,transportKeyDifferentFromNoteKey:transportKeyDifferent,privateSigningKeyAbsentFromWitness:true,
   originalFinancialWireCount:runtime.transactions.length-setupTransactions,originalFinancialReceiptCount:runtime.receipts.length-setupReceipts,actualFundReplyDiscarded:true,actualExitReplyDiscarded:true,sameJobReconciliation:true,duplicateSdkRejectedBeforePost:true,duplicateOriginalPermissionRejected:true,noAutomaticRetry:true,canonicalReceiptsJoined:true,sourceNullifierSpent:true,poolUnfundedAfterExit:true,recipientDeltaExact:true,poolBackingAfterFund:funded.ledger.publicState.backedAmount,poolBackingAfterExit:final.ledger.publicState.backedAmount,recipientDeltaAtomic:(recipientAfter-recipientBefore).toString(),transport};
  result.mobileHost=host.evidence();result.sourceUnchanged=true;assert.deepEqual(deviceExternalFlatErc20SourcePinsV1(),sourcePins);result.originalDeviceExternalFlatNodeAcceptance=true;
 }catch(error){primary=error;result.phase='failed';result.errorCode='DEVICE_EXTERNAL_FLAT_FLOW_FAILED';retainOriginalDeviceExternalFlatFirstErrorV1(join(privateDirectory,'first-error-private.json'),error);if(account)try{const failure=readOriginalDeviceExternalFlatHttpFailureV1(account);if(failure)writeFixturePrivate(join(privateDirectory,'account-first-error-private.json'),failure);}catch{}save();}
 finally{const wipe=v=>{if(v&&typeof v==='object')for(const k of Object.keys(v)){if(v[k]&&typeof v[k]==='object')wipe(v[k]);v[k]=null;}};privateWitnesses.forEach(wipe);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);const cleanup=async(name,fn)=>{try{const value=await fn();result.cleanup[name]=true;return value;}catch(error){result.cleanup[name]=false;result.cleanup.errors.push({phase:name,errorCode:'DEVICE_EXTERNAL_FLAT_CLEANUP_UNCONFIRMED'});primary??=error;return null;}};
  if(host){result.cleanup.host=await cleanup('closedMobileHost',()=>host.close());result.cleanup.service=result.cleanup.host?.service;result.cleanup.closedDeviceService=result.cleanup.service?.closed===true;result.cleanup.closedMobileVault=result.cleanup.host?.vault?.closed===true;}
  for(const op of operators)if(!op.status().closed)await cleanup('setupOperatorsClosed',()=>op.close());
  if(runtime){let scratchBefore,originalScratch,originalRetention=false;try{assertOwnedExternalDefiReceiverV2(runtime);originalScratch=runtime.metadata.scratchDirectory;assert.equal(realpathSync(originalScratch),originalScratch);scratchBefore=lstatSync(originalScratch);assert.ok(scratchBefore.isDirectory()&&!scratchBefore.isSymbolicLink()&&scratchBefore.uid===process.getuid()&&(scratchBefore.mode&0o777)===0o700);originalRetention=true;}catch(error){primary??=error;}
   const closeReceipt=await cleanup('closedEvm',()=>runtime.close()),status=runtime.processStatus(),stop=runtime.lifecycle.findLast(row=>row.event==='stopped-owned-process'),originalPIDAbsent=nativeProcStatV1(status.pid)===null;let originalRecoveryScratchRetained=false;
   try{assert.ok(closeReceipt&&originalRetention&&scratchBefore);assert.equal(status.scratchRemoved,false);assert.equal(realpathSync(originalScratch),originalScratch);const after=lstatSync(originalScratch);assert.ok(after.isDirectory()&&!after.isSymbolicLink()&&after.uid===process.getuid()&&(after.mode&0o777)===0o700);for(const k of ['dev','ino','uid','mode'])assert.equal(after[k],scratchBefore[k]);originalRecoveryScratchRetained=true;}catch(error){primary??=error;}
   result.cleanup.evm={closeReceipt,stop,status,originalPIDAbsent,originalRecoveryScratchRetained};if(!closeReceipt||!status.stopped||!status.exitObserved||!originalPIDAbsent||!originalRecoveryScratchRetained||stop?.stopped!==true||stop?.forced!==false){result.cleanup.closedEvm=false;primary??=Error('DEVICE_EXTERNAL_FLAT_RUNTIME_CLOSE_UNCONFIRMED');}}
  try{assert.deepEqual(deviceExternalFlatErc20SourcePinsV1(),sourcePins);result.sourceUnchanged=true;}catch(error){result.sourceUnchanged=false;primary??=error;}
  result.interrupted=interrupted;result.finishedAt=new Date().toISOString();result.success=!primary&&!interrupted&&result.cleanup.errors.length===0;if(result.success){result.phase='completed';try{assertDeviceExternalFlatErc20ResultV1(result);}catch(error){primary=error;result.phase='failed';result.success=false;result.errorCode='DEVICE_EXTERNAL_FLAT_RESULT_REJECTED';retainOriginalDeviceExternalFlatFirstErrorV1(join(privateDirectory,'first-error-private.json'),error);}}save();}
 if(primary)throw primary;return result;
}
try{await run();}catch{process.stdout.write(JSON.stringify({status:'DEVICE_EXTERNAL_FLAT_FLOW_FAILED'})+'\n');process.exitCode=1;}
