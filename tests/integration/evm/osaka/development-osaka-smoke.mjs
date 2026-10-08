/** Fixed new lifetime only: original byte-identical artifacts, no compiler/prover.
 * This runner deliberately establishes no private note, native-value wire,
 * public chain/client/consensus/finality or production deployment acceptance. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { createOwnedLocalEvmOsakaV1, LOCAL_OSAKA_EVM_PROFILE_V1,
  ownedLocalEvmTransactionGasLimit, probeOwnedOsakaTransactionGasRejectionV1 }
  from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedPoolAsset } from '../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { derivePrivateAssetIdentity } from '../../../../packages/engine/src/notes/private-asset-runtime.mjs';
import { nativeAdmissionRulesTree } from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeStaticCalldata } from '../../../../packages/engine/src/execution/native/dispatch/native-deployment.mjs';
import { deployBackedAssets, loadBackedAssetDeploymentArtifacts } from '../../../../packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs';
import { deployFlatSystem } from '../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { deployEvmVaultRouter } from '../../../../packages/backend/src/operations/deployments/defi/deploy-evm-vault-router.mjs';
import { createLocalFlatOperator } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { osakaSmokeSourcePins } from './development-osaka-smoke-source-pins.mjs';
import { OSAKA_SMOKE_RESULT, OSAKA_SMOKE_PROFILE, assertOsakaSmokeResult } from './development-osaka-smoke-policy.mjs';
const FLOW='.local/development-osaka-smoke-v1', hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fresh=()=> '0x'+randomBytes(32).toString('hex');
const errorCode=error=>String(error?.message??'').match(/\b(?:OSAKA|LOCAL_EVM|FLAT|BACKED|EVM_ROUTER)_[A-Z0-9_]+\b/)?.[0]??'OSAKA_SMOKE_FAILED';
async function main() {
  const began=performance.now();
  assert.equal(process.argv.length,2);assert.deepEqual(process.execArgv,[]);
  assert.equal(realpathSync(process.argv[1]),fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(),['LANG','PATH']);assert.equal(process.env.LANG,'C.UTF-8');assert.equal(process.env.PATH,'/usr/bin:/bin');
  const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length,2);assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1])),
    join(ROOT,'integration/evm/osaka/run-development-osaka-smoke.mjs'));
  const lock=JSON.parse(readFileSync(join(ROOT,FLOW,'active.lock')));
  assert.equal(lock.pid,process.ppid);assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt,FLOW+'/attempt-'+lock.runId);
  const directory=join(ROOT,lock.attempt),privateDirectory=join(directory,'private-audit');mkdirSync(privateDirectory,{mode:0o700});
  const result={format:OSAKA_SMOKE_RESULT,profile:OSAKA_SMOKE_PROFILE,runId:lock.runId,
    phase:'starting',success:false,startedAt:new Date().toISOString(),sourcePins:osakaSmokeSourcePins(),
    supervisor:{supervisorPID:process.ppid,workerPID:process.pid},localOnly:true,fakeFundsOnly:true,publicNetwork:false,
    fork:'osaka',transactionGasCap:'16777216',blockGasLimit:'30000000',nodeTransactionGasLimitEnabled:true,
    proofAcceptanceEstablished:false,privateLifecycleEstablished:false,fullWalletAcceptance:false,
    productionClientAcceptanceEstablished:false,publicConsensusOrFinalityVerified:false,
    proofs:[],stages:[],transactions:[],creations:[],runtimeGasRejections:[],cleanup:{closedEvm:false,errors:[]}};
  let runtime,assets,system,router,cleanupPromise,interrupted=false;const operators=[];
  const save=()=>writeFixturePrivate(join(directory,'result.json'),result);
  const stage=async name=>{assert.equal(interrupted,false,'OSAKA_SMOKE_INTERRUPTED_OUTCOME_UNKNOWN');result.phase=name;result.stages.push({name,at:new Date().toISOString()});save();process.stdout.write(JSON.stringify({stage:name})+'\n');};
  const audit=async()=>{if(runtime)writeFixturePrivate(join(privateDirectory,'evm.json'),{
    metadata:runtime.metadata,transactions:runtime.transactions,receipts:runtime.receipts,mutationStatus:runtime.mutationStatus});save();};
  function cleanup(){return cleanupPromise??=(async()=>{
    for(const operator of operators)try{await operator.close();}catch{result.cleanup.errors.push('OSAKA_OPERATOR_CLOSE');}
    if(runtime)try{result.cleanup.evm=await runtime.close({removeScratch:true});result.cleanup.closedEvm=result.cleanup.evm.stopped===true;
      const stopped=runtime.lifecycle.filter(row=>row.event==='stopped-owned-process');
      assert.equal(stopped.length,1,'OSAKA_SMOKE_ORIGINAL_STOP_EVENT');result.cleanup.stoppedOwnedEvmEvent=stopped[0];
      for(const key of ['pid','exitObserved','exitCode','signal','spawnErrorCode','stopped'])
        assert.equal(stopped[0][key],result.cleanup.evm[key],'OSAKA_SMOKE_ORIGINAL_STOP_JOIN');
      assert.equal(stopped[0].pid,runtime.metadata.processId,'OSAKA_SMOKE_ORIGINAL_STOP_PID');
    }
      catch{result.cleanup.errors.push('OSAKA_EVM_CLOSE');}
  })();}
  const stop=()=>{if(interrupted)return;interrupted=true;result.success=false;result.errorCode='OSAKA_SMOKE_INTERRUPTED_OUTCOME_UNKNOWN';
    void audit().catch(()=>{}).then(cleanup).finally(()=>{result.phase='failed';save();process.exit(2);});};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try {
    await stage('start-original-pinned-osaka-node');runtime=await createOwnedLocalEvmOsakaV1();
    result.runtimeProcessId=runtime.metadata.processId;
    assert.equal(runtime.metadata.profile,LOCAL_OSAKA_EVM_PROFILE_V1);assert.equal(ownedLocalEvmTransactionGasLimit(runtime),16777216);
    assert.equal(runtime.metadata.freshSyntheticWallets,true);assert.equal(runtime.metadata.restoredOriginalState,false);
    result.observedGenesisBlockGasLimit=BigInt((await runtime.block()).gasLimit).toString();
    assert.equal(result.observedGenesisBlockGasLimit,'30000000');
    await stage('reject-original-runtime-gas-before-broadcast');
    const state=async()=>({nonce:(await runtime.nonce(runtime.accounts[0],'pending')).toString(),
      balance:(await runtime.balance(runtime.accounts[0])).toString(),head:await runtime.block(),
      journalLength:runtime.transactions.length,receipts:runtime.receipts.length});
    for(const gas of ['0','16777217','30000000']) {
      const before=await state();await assert.rejects(runtime.send('fixed rejected Osaka gas',{
        from:runtime.accounts[0],to:runtime.accounts[4],data:'0x',value:'0',gas}),/LOCAL_EVM_GAS_LIMIT/);
      assert.deepEqual(await state(),before);result.runtimeGasRejections.push({gas,noJournalNonceBalanceOrHeadEffect:true});
    }
    await stage('observe-original-node-cap-plus-one-rejection');
    result.nodeCapRejection=await probeOwnedOsakaTransactionGasRejectionV1(runtime);
    await assert.rejects(probeOwnedOsakaTransactionGasRejectionV1(runtime),/ONE_ATTEMPT_ONLY/);await audit();
    await stage('deploy-original-palt-bltv-assets');assets=await deployBackedAssets(runtime,{domain:fresh(),runtimeId:fresh(),supply:'1000000'});
    const capabilities=[];
    for(const asset of [assets.token,assets.vault])capabilities.push(await createOwnedPoolAsset({runtime,
      deployment:asset.deployment,symbol:asset.symbol,decimals:asset.decimals,kind:'ERC20'}));
    const identity=derivePrivateAssetIdentity(runtime.metadata.chainId,assets.vault.address,assets.vault.codeHash).slice(2);
    const rules=nativeAdmissionRulesTree([{family:'3',genesis:runtime.metadata.evmGenesis.slice(2),asset:identity,
      finalityKind:'3',minimumConfirmations:'1',maximumEvidenceLifetime:'86400',maximumClockSkew:'30'}]);
    for(let signerIndex=0;signerIndex<4;signerIndex++)operators.push(createLocalFlatOperator({signerIndex}));
    await stage('deploy-original-twelve-verifiers-hub-and-two-pools');
    system=await deployFlatSystem(runtime,{deploymentDomain:fresh(),registryEpoch:'1',rulesRoot:'0x'+rules.root,
      attesterKeys:operators.map(operator=>operator.publicKey),
      pools:capabilities.map(assetCapability=>({assetCapability,policy:fresh(),deploymentDomain:fresh()}))});
    result.originalVerifierCount=Object.keys(system.verifiers).length;result.originalPoolCount=system.pools.length;
    assert.equal(system.registrationReceipts.length,2);
    result.originalPoolRegistrationTransactionHashes=system.registrationReceipts.map(receipt=>receipt.transactionHash);
    assert.equal(result.originalVerifierCount,12);assert.equal(result.originalPoolCount,2);
    await stage('deploy-original-pinned-vault-router');
    router=await deployEvmVaultRouter(runtime,system,{sourcePoolIndex:0,destinationPoolIndex:1,solver:runtime.accounts[1],backedAssets:assets});
    const records=[...assets.deployments,...system.deployments,router];assert.equal(records.length,44);
    for(const record of records) {
      const rows=runtime.transactions.filter(row=>row.transactionHash===record.receipt.transactionHash);assert.equal(rows.length,1);
      const row=rows[0],actual=await runtime.code(record.address);assert.equal(actual,record.expectedCode,'OSAKA_SMOKE_COMPLETE_CODE');
      assert.equal(row.request.to,undefined);const initcodeBytes=(row.request.data.length-2)/2,runtimeBytes=(actual.length-2)/2;
      assert.ok(initcodeBytes<=49152&&runtimeBytes<=24576);assert.ok(record.constructorData===undefined
        ||row.request.data.endsWith(record.constructorData.slice(2)),'OSAKA_SMOKE_ORIGINAL_CONSTRUCTOR');
      result.creations.push({address:record.address,contractName:record.contractName??record.symbol??'EVMVaultDeliveryRouter',
        transactionHash:row.transactionHash,initcodeBytes,runtimeBytes,constructorBytes:record.constructorData?(record.constructorData.length-2)/2:0,
        creationSHA256:hash(Buffer.from(row.request.data.slice(2),'hex')),runtimeSHA256:hash(Buffer.from(actual.slice(2),'hex')),
        originalCompleteCodeMatched:true});
    }
    await stage('one-public-synthetic-token-transfer');
    const artifact=loadBackedAssetDeploymentArtifacts().artifacts.token,sender=runtime.accounts[0],recipient=runtime.accounts[4];
    const tokenBalance=async account=>BigInt(await runtime.call({to:assets.token.address,data:nativeStaticCalldata(artifact,'balanceOf(address)',[account])}));
    const before={source:await tokenBalance(sender),recipient:await tokenBalance(recipient),nonce:await runtime.nonce(sender,'pending'),journal:runtime.transactions.length};
    const transfer=await runtime.send('Osaka public synthetic PALT transfer one unit',{from:sender,to:assets.token.address,
      data:nativeStaticCalldata(artifact,'transfer(address,uint256)',[recipient,'1'])});
    await runtime.checkReceipt(transfer);assert.equal(transfer.status,'0x1');
    const after={source:await tokenBalance(sender),recipient:await tokenBalance(recipient),nonce:await runtime.nonce(sender,'pending'),journal:runtime.transactions.length};
    assert.equal(after.source-before.source,-1n);assert.equal(after.recipient-before.recipient,1n);
    assert.equal(after.nonce-before.nonce,1n);assert.equal(after.journal-before.journal,1);
    for(const record of records)assert.equal(await runtime.code(record.address),record.expectedCode,'OSAKA_SMOKE_CODE_UNCHANGED');
    result.publicTransfer={transactionHash:transfer.transactionHash,amount:'1',senderNonceDelta:'1',sourceTokenDelta:'-1',recipientTokenDelta:'1',
      broadcasts:1,contractCodesUnchanged:true,originalCanonicalReceipt:true,signedWireAcceptanceEstablished:false};
    await stage('join-every-original-journal-transaction-and-canonical-receipt');
    for(const row of runtime.transactions) {
      assert.equal(row.phase,'mined');assert.ok(row.receipt);await runtime.checkReceipt(row.receipt);
      const observed=await runtime.transaction(row.transactionHash);assert.ok(observed);
      assert.equal(observed.from.toLowerCase(),row.request.from);assert.equal(observed.input,row.request.data);
      assert.equal(BigInt(observed.nonce),BigInt(row.senderNonce));assert.equal(BigInt(observed.gas),BigInt(row.request.gas));
      assert.equal(BigInt(observed.value),BigInt(row.request.value??'0x0'));
      assert.equal(observed.to?.toLowerCase()??null,row.request.to??null);
      assert.equal(observed.blockHash,row.receipt.blockHash);assert.equal(observed.blockNumber,row.receipt.blockNumber);
      const create=!row.request.to;result.transactions.push({label:row.label,transactionHash:row.transactionHash,
        blockHash:row.receipt.blockHash,blockNumber:row.receipt.blockNumber,status:row.receipt.status,phase:row.phase,create,
        contractAddress:row.receipt.contractAddress,initcodeBytes:create?(row.request.data.length-2)/2:0,
        requestGas:BigInt(row.request.gas).toString(),gas:BigInt(observed.gas).toString(),gasUsed:BigInt(row.receipt.gasUsed).toString(),originalReceiptCanonical:true});
    }
    result.provenance={system:system.provenance,backedAssetsPinned:true,routerPinned:true,compiledBytecodeTarget:'cancun',executionFork:'osaka',newProgramsOrKeysGenerated:false};
    result.success=true;result.phase='completed';await audit();
  } catch(error) {
    result.failedStage=result.phase;result.success=false;result.phase='failed';result.errorCode=errorCode(error);
    writeFixturePrivate(join(privateDirectory,'error-private.json'),{message:String(error.message),stack:String(error.stack)});await audit().catch(()=>{});
  } finally {
    await cleanup();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
    try{assert.deepEqual(osakaSmokeSourcePins(),result.sourcePins);result.sourceUnchanged=true;}catch{result.sourceUnchanged=false;}
    if(interrupted||!result.cleanup.closedEvm||result.cleanup.errors.length||!result.sourceUnchanged){result.success=false;result.phase='failed';result.errorCode??='OSAKA_SMOKE_SOURCE_OR_CLEANUP_FAILED';}
    result.finishedAt=new Date().toISOString();result.milliseconds=performance.now()-began;save();
    if(result.success)try{assertOsakaSmokeResult(result);}catch(error){result.success=false;result.phase='failed';result.errorCode=errorCode(error);save();}
    if(!result.success)process.exitCode=1;
  }
}
await main();
