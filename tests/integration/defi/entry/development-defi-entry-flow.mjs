/** Fresh original D27 protocol delivery and private EXIT only. Public fixture
 * input, same-host owner, no PAEG graph, reimbursement or old release enabled. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createOwnedLocalEvmV2 } from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { evmRuntimeCodeHash } from '../../../../packages/backend/src/chains/evm/contracts/evm-code-hash.mjs';
import { createOfficialProtocolFixture } from '../../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { createOwnedPoolAsset } from '../../../../packages/backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { deployFlatSystem } from '../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { createLocalFlatOperator } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createOwnedPrivateExternalRouterV1 } from '../../../../packages/backend/src/operations/deployments/defi/deploy-private-external-router-v1.mjs';
import { createPrivateExternalIncomingObserverV1, assertOwnedPrivateExternalIncomingObservationV1 } from '../../../../packages/backend/src/chains/shared/observations/private-external-incoming-observer-v1.mjs';
import { encodePrivateExternalDelivery } from '../../../../packages/backend/src/defi/delivery/private-external-delivery.mjs';
import { createFlatOwnerProcess } from '../../../../packages/custody/src/processes/flat-owner-process.mjs';
import { createFlatAccountAuthority } from '../../../../packages/backend/src/accounts/authority/flat-account-authority.mjs';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { createFlatAccountSession } from '../../../../packages/backend/src/api/accounts/flat-account-session.mjs';
import { startFlatAccountHttp } from '../../../../packages/backend/src/api/accounts/flat-account-http.mjs';
import { createFlatSystemStateReader } from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createOwnedMetaMorphoVault, assertOwnedMetaMorphoReceipt } from '../../../../packages/backend/src/defi/vaults/owned-metamorpho-vault.mjs';
import { createOwnedPrivateVaultExit } from '../../../../packages/backend/src/defi/withdrawals/private-vault-exit.mjs';
import { assertRoleProofReceiptRecords } from '../../claims/development/development-native-claim-proof-evidence.mjs';
import { assertPrivateMetaMorphoProofTelemetry } from '../private-metamorpho-proof-evidence.mjs';
import { freshFixtureId, fixtureJSON, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { developmentDefiEntrySourcePins } from './development-defi-entry-source-pins.mjs';
import { DEVELOPMENT_DEFI_ENTRY_RESULT, DEVELOPMENT_DEFI_ENTRY_PROFILE } from './development-defi-entry-policy.mjs';

const LOCAL_RUN = '.local/development-defi-entry-roundtrip-v1', bare = value => value.slice(2);
const code = error => String(error?.message ?? '').match(/\b(?:DEVELOPMENT_DEFI|PRIVATE|FLAT|EXTERNAL|PW|ROLE_CLIENT|LOCAL_EVM)_[A-Z0-9_]+\b/)?.[0] ?? 'DEVELOPMENT_DEFI_ENTRY_FAILED';
async function main() {
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG','PATH']);
  assert.equal(process.env.LANG, 'C.UTF-8'); assert.equal(process.env.PATH, '/usr/bin:/bin');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT,'integration/defi/entry/run-development-defi-entry-flow.mjs'));
  const lock = JSON.parse(readFileSync(join(ROOT,LOCAL_RUN,'active.lock')));
  assert.equal(lock.pid,process.ppid); assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt,LOCAL_RUN+'/attempt-'+lock.runId);
  const directory=join(ROOT,lock.attempt),privateDirectory=join(directory,'private-audit'),proofDirectory=join(directory,'public-proofs');
  mkdirSync(privateDirectory,{mode:0o700}); mkdirSync(proofDirectory,{mode:0o700});
  const result={format:DEVELOPMENT_DEFI_ENTRY_RESULT,profile:DEVELOPMENT_DEFI_ENTRY_PROFILE,runId:lock.runId,
    startedAt:new Date().toISOString(),phase:'starting',success:false,sourcePins:developmentDefiEntrySourcePins(),
    supervisor:{supervisorPID:process.ppid,workerPID:process.pid},localOnly:true,fakeFundsOnly:true,publicNetwork:false,
    protocolInputPublic:true,registeredLegAdmissionEstablished:false,privatePAEGConversionEstablished:false,graphExecutionEstablished:false,providerReimbursementEstablished:false,
    independentOperators:false,nativeProcessRestartEstablished:false,keeperLossRecoveryEstablished:false,fullWalletAcceptance:false,
    stages:[],proofs:[],cycles:[],checks:{},cleanup:{closedEvm:false,errors:[]},
    disclosure:['Original official protocol routers consume public synthetic input and atomically issue original private D27 output notes.',
      'Protocol, input/output, amounts, timing, solver and deposit commitment remain public under the original route.',
      'Receipt commitment is a fresh local consumed/replay label; it establishes no registered leg or dispatch authority.',
      'Original owner/coordinator restart retains original keeper credentials; nodes and private original capabilities survive.',
      'No PAEG graph, provider reimbursement, public network, independent operator or complete wallet is established.']};
  const save=()=>writeFixturePrivate(join(directory,'result.json'),result);
  const stage=async name=>{result.phase=name;result.stages.push({name,at:new Date().toISOString()});save();process.stdout.write(JSON.stringify({stage:name})+'\n');};
  const priorD27=new Set(existsSync(join(LOCAL,'attempts'))?readdirSync(join(LOCAL,'attempts')):[]);
  const telemetryDirectory=join(GOLDEN,'evidence/paeg-proof-attempts');
  const priorTelemetry=new Set(existsSync(telemetryDirectory)?readdirSync(telemetryDirectory):[]);
  let runtime,protocol,cleanupPromise,interrupted=false;
  const operators=[],owned=[];
  async function audit() {if(runtime)writeFixturePrivate(join(privateDirectory,'evm.json'),{metadata:runtime.metadata,
    transactions:runtime.transactions,receipts:runtime.receipts});save();}
  function retainProof(label,relation,proof) {
    const bytes=Buffer.isBuffer(proof.proof)||proof.proof instanceof Uint8Array?Buffer.from(proof.proof):Buffer.from(proof.proof,'hex');
    const file=String(result.proofs.length+1).padStart(3,'0')+'-'+label,inputs=fixtureJSON(proof.publicInputs);let evidence;
    if(relation==='deposit_intent') {
      const original=proof.evidence;assert.match(original.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(priorD27.has(original.runId),false,'DEVELOPMENT_DEFI_FRESH_D27');
      const attempt=join(LOCAL,'attempts',original.runId),manifestBytes=readFileSync(join(attempt,'proof-manifest.json'));
      const manifest=JSON.parse(manifestBytes),resultBytes=readFileSync(join(attempt,'result.json')),resourcesBytes=readFileSync(join(attempt,'resources.json'));
      const originalInputs=readFileSync(join(attempt,'public-inputs.json'));
      assert.equal(hash(manifestBytes),original.manifestSHA256);assert.equal(manifest.keySHA256,original.keySHA256);
      assert.equal(hash(readFileSync(join(attempt,'proof.bin'))),hash(bytes));assert.deepEqual(JSON.parse(originalInputs),proof.publicInputs);
      evidence={...original,...assertRoleProofReceiptRecords({relation,runId:original.runId,jobId:original.jobId,manifest,
        result:JSON.parse(resultBytes),resources:JSON.parse(resourcesBytes),proofSHA256:hash(bytes),publicInputsSHA256:hash(originalInputs),
        manifestSHA256:hash(manifestBytes),resultSHA256:hash(resultBytes),resourcesSHA256:hash(resourcesBytes)})};
    } else {
      assert.equal(relation,'withdraw_balance');const original=proof.metrics;
      assert.match(original.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(priorTelemetry.has(original.id+'.json'),false,'DEVELOPMENT_DEFI_FRESH_W39');
      const telemetry=readFileSync(join(telemetryDirectory,original.id+'.json'));
      evidence=assertPrivateMetaMorphoProofTelemetry({relation,returnedMetrics:original,storedMetrics:JSON.parse(telemetry),
        proofSHA256:hash(bytes),publicInputsSHA256:hash(JSON.stringify(proof.publicInputs)),telemetrySHA256:hash(telemetry)});
    }
    writeFileSync(join(proofDirectory,file+'.bin'),bytes,{flag:'wx',mode:0o600});
    writeFileSync(join(proofDirectory,file+'.inputs.json'),inputs,{flag:'wx',mode:0o600});
    result.proofs.push({relation,file,proofSHA256:hash(bytes),publicInputsSHA256:hash(inputs),evidence});save();
  }
  function cleanup() {return cleanupPromise??=(async()=>{
    for(const value of owned) {
      try{await value.account?.abort();}catch{result.cleanup.errors.push('ACCOUNT_ABORT');}
      try{if(value.http)await value.http.close();else if(value.session)await value.session.close();else await value.keeper?.close();}catch{result.cleanup.errors.push('ACCOUNT_SESSION');}
      try{await value.account?.close();await value.owner?.close();}catch{result.cleanup.errors.push('ACCOUNT_OWNER');}
    }
    for(const operator of operators)try{operator.close();}catch{result.cleanup.errors.push('OPERATOR');}
    if(runtime)try{result.cleanup.evm=await runtime.close({removeScratch:true});result.cleanup.closedEvm=result.cleanup.evm.stopped===true;}
      catch{result.cleanup.errors.push('EVM_CLOSE');}
  })();}
  const stop=()=>{if(interrupted)return;interrupted=true;result.success=false;result.errorCode='DEVELOPMENT_DEFI_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';
    void audit().catch(()=>{}).then(cleanup).finally(()=>{result.phase='failed';save();process.exit(2);});};
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try {
    save();await stage('fresh-owned-evm-and-official-protocols');runtime=await createOwnedLocalEvmV2();protocol=await createOfficialProtocolFixture(runtime);
    for(let signerIndex=0;signerIndex<4;signerIndex++)operators.push(createLocalFlatOperator({signerIndex}));
    const sender=runtime.accounts[0],variants=[{name:'uniswap',kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',output:protocol.second,
      amount:1000n,maximumInput:2000n},{name:'metamorpho',kind:'METAMORPHO_V1_EXACT_SHARE_MINT',output:protocol.vault,
      amount:1_000_000_000_000_000_000n,maximumInput:1_000_000n}];
    for(const variant of variants) {
      if(interrupted)throw Error('DEVELOPMENT_DEFI_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN');
      await stage(variant.name+'-original-router-and-private-account');
      const value={};owned.push(value);const cyclePrivate=join(privateDirectory,variant.name);mkdirSync(cyclePrivate,{mode:0o700});
      const inputBefore=(await protocol.read(protocol.first,'balanceOf',[sender]))[0],outputBefore=(await protocol.read(variant.output,'balanceOf',[sender]))[0];
      const assets=[];for(const target of [protocol.first,variant.output])assets.push(await createOwnedPoolAsset({runtime,kind:'ERC20',
        symbol:(await protocol.read(target,'symbol'))[0],decimals:Number((await protocol.read(target,'decimals'))[0]),
        deployment:{address:target.address,transactionHash:target.receipt.transactionHash,expectedCode:target.code,codeHash:evmRuntimeCodeHash(target.code)}}));
      const system=await deployFlatSystem(runtime,{deploymentDomain:'0x'+freshFixtureId(),registryEpoch:'1',rulesRoot:'0x'+hash('direct-d27-official-protocol-no-graph/'+variant.name),
        attesterKeys:operators.map(operator=>operator.publicKey),pools:assets.map(assetCapability=>({assetCapability,policy:'0x'+freshFixtureId(),deploymentDomain:'0x'+freshFixtureId()}))});
      const router=await createOwnedPrivateExternalRouterV1({runtime,system,poolIndex:1,protocolFixture:protocol,protocolKind:variant.kind});
      const incoming=await createPrivateExternalIncomingObserverV1({runtime,system,poolIndex:1,router});
      const ownerDirectory=join(cyclePrivate,'owner');mkdirSync(ownerDirectory,{mode:0o700});
      value.owner=await createFlatOwnerProcess({runtime,system,poolIndex:1,directory:ownerDirectory,password:freshFixtureId(),create:true,
        checkpoint:null,deliveryObserver:incoming,onCheckpoint:checkpoint=>writeFixturePrivate(join(ownerDirectory,'checkpoint.json'),checkpoint)});
      value.account=await createFlatAccountAuthority({runtime,system,poolIndex:1,owner:value.owner,nativeExecution:null,
        accountId:variant.name+'_private_output',journalId:variant.name+'_private_output_journal'},
        {onProof:({label,relation,proof})=>retainProof(variant.name+'-'+label,relation,proof),onPrivateAudit:audit,onStage:()=>{}});
      value.keeper=await createGenericAccountKeeper({config:value.account.config,journal:{path:join(cyclePrivate,'account.vault'),password:freshFixtureId()},authority:value.account.authority});
      value.session=await createFlatAccountSession({keeper:value.keeper,ownerHandoff:{ownerView:value.account.ownerView}});
      value.http=await startFlatAccountHttp({session:value.session,port:0});
      const reader=await createFlatSystemStateReader({runtime,system,poolIndex:1});
      async function request(action,body={}) {
        const response=await fetch(value.http.origin+'/api/flat-account/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:value.http.origin,
          'x-flat-account-token':value.http.clientAccess.token},body:JSON.stringify(body)});
        assert.equal(response.status,202,'DEVELOPMENT_DEFI_ORIGINAL_HTTP');assert.equal((await response.json()).admitted,true);return value.session.idle();
      }
      async function ownerView() {
        const response=await fetch(value.http.origin+'/api/flat-account/owner',{headers:{Origin:value.http.origin,'x-flat-owner-token':value.http.ownerAccess.token}});
        assert.equal(response.status,200);return response.json();
      }
      await stage(variant.name+'-genuine-owner-d27');
      const start=await runtime.time(),validFrom=(start-1n).toString(),validUntil=(start+3600n).toString();
      await value.owner.owner.prepareDepositIntent({amount:variant.amount.toString(),validFrom,validUntil,exitRecipient:bare(sender)});
      const proof=await value.owner.ownerProof.proveDepositIntent();retainProof(variant.name+'-d27','deposit_intent',proof);
      const plan={identity:router.identity,protocolKind:router.protocolKind,fee:router.fee,
        route:{maximumInput:variant.maximumInput.toString(),outputAmount:variant.amount.toString(),validFrom,validUntil},ownerPublicInputs:proof.publicInputs};
      // Only a fresh replay label for the original router's consumed mapping;
      // no registered graph leg or dispatch capability is created or claimed.
      const delivery=encodePrivateExternalDelivery({plan,receiptCommitment:freshFixtureId(),proof:proof.proof});
      assert.equal(delivery.dispatchAuthorized,false);
      await protocol.send(protocol.first,'approve',[router.address,variant.maximumInput]);
      await value.owner.suspend();assert.equal((await ownerView()).status,'UNAVAILABLE');
      await stage(variant.name+'-original-atomic-protocol-private-delivery-owner-offline');
      const receipt=await runtime.send('original official private '+variant.name+' delivery',{from:sender,to:router.address,data:delivery.calldata});
      assert.equal(receipt.status,'0x1');const binding={transactionHash:bare(receipt.transactionHash),calldataSHA256:hash(Buffer.from(delivery.calldata.slice(2),'hex'))};
      const originalObservation=await incoming.observe(binding);assert.ok(originalObservation);
      assertOwnedPrivateExternalIncomingObservationV1(originalObservation,{observer:incoming});
      assert.throws(()=>assertOwnedPrivateExternalIncomingObservationV1(structuredClone(originalObservation),{observer:incoming}),/ORIGINAL_OBSERVATION_REQUIRED/);
      writeFixturePrivate(join(cyclePrivate,'original-incoming.json'),originalObservation);
      const beforeReconcile=runtime.transactions.length;await value.owner.restart();
      assert.equal((await value.owner.owner.reconcileDepositIntent(binding)).stage,'CONFIRMED');
      assert.equal((await value.owner.owner.reconcileDepositIntent(binding)).stage,'CONFIRMED');
      assert.equal(runtime.transactions.length,beforeReconcile);await request('restart');assert.equal(runtime.transactions.length,beforeReconcile);
      const funded=await ownerView();assert.equal(funded.status,'LIVE');assert.equal(funded.balances.available,variant.amount.toString());
      assert.equal(funded.backing.held,variant.amount.toString());assert.equal(await assets[1].balance(system.pools[1].address),variant.amount);
      for(const [token,spender]of [[protocol.first,router.address],[protocol.first,router.identity.protocol],[variant.output,system.pools[1].address]]) {
        const holder=spender===router.address?sender:router.address;
        const target=typeof spender==='string'&&spender.startsWith('0x')?spender:'0x'+spender;
        assert.equal((await protocol.read(token,'allowance',[holder,target]))[0],0n);
      }
      const afterInput=(await protocol.read(protocol.first,'balanceOf',[sender]))[0],spent=inputBefore-afterInput;
      assert.ok(spent>0n&&spent<=variant.maximumInput);assert.equal((await protocol.read(variant.output,'balanceOf',[sender]))[0],outputBefore);
      await stage(variant.name+'-original-private-exit-w39-http');
      const exitRef=freshFixtureId(),exitId=variant.name+'_private_protocol_exit';
      await value.owner.owner.prepareWithdrawal({role:'source',epoch:String((await runtime.time())/600n)});await value.account.ownerActions.registerExit(exitRef,'source');
      await request('prepare',{requestId:exitId,kind:'EXIT',ownerOperationRef:exitRef,assetId:value.account.assetId});
      const terminal=await request('execute',{requestId:exitId});assert.equal(terminal.requests.find(row=>row.requestId===exitId)?.state,'CONFIRMED');
      assert.equal((await protocol.read(variant.output,'balanceOf',[sender]))[0],outputBefore+variant.amount);
      const duplicateStart=runtime.transactions.length;await request('execute',{requestId:exitId});await request('reconcile',{requestId:exitId});
      assert.equal(runtime.transactions.length,duplicateStart);
      if(variant.name==='metamorpho') {
        await stage('metamorpho-original-exit-bound-public-redemption');
        const vault=await createOwnedMetaMorphoVault({runtime,protocolFixture:protocol});
        const bridge=await createOwnedPrivateVaultExit({runtime,system,poolIndex:1,account:value.account,vault});
        const minimum=(await protocol.read(protocol.vault,'previewRedeem',[variant.amount]))[0];assert.equal(minimum,spent);
        const terms={requestId:exitId,minimumOutput:minimum.toString(),deadline:String((await runtime.time())+240n)};
        assert.equal((await bridge.prepare(terms)).phase,'READY_TO_REDEEM');const count=runtime.transactions.length;
        await bridge.execute(exitId);await bridge.reopen();assert.equal((await bridge.reconcile(exitId)).phase,'REDEEMED');
        await bridge.prepare(terms);await bridge.execute(exitId);assert.equal(runtime.transactions.length-count,2);
        assertOwnedMetaMorphoReceipt(vault,await bridge.originalReceipt(exitId));
        assert.equal((await protocol.read(protocol.first,'balanceOf',[sender]))[0],inputBefore);
        assert.equal((await protocol.read(protocol.vault,'balanceOf',[sender]))[0],outputBefore);
        assert.equal((await protocol.read(protocol.vault,'totalAssets'))[0],0n);assert.equal((await protocol.read(protocol.vault,'totalSupply'))[0],0n);
      }
      const final=await ownerView(),pool=(await reader.read()).ledger.publicState;
      assert.equal(final.status,'LIVE');assert.equal(final.balances.available,'0');assert.equal(final.backing.held,'0');assert.equal(final.backing.liabilities,'0');
      assert.equal(pool.actualAssetBalance,'0');assert.equal(pool.backedAmount,'0');assert.equal(await assets[0].balance(system.pools[0].address),0n);
      result.cycles.push({protocol:variant.kind,outputAmount:variant.amount.toString(),inputSpent:spent.toString(),
        originalD27PrivateEntry:true,originalPrivateExit:true,ownerOfflineDuringDelivery:true,ownerAndCoordinatorRestartNoSend:true,
        duplicateNoEffect:true,originalObservationCopyRejected:true,protocolAllowancesCleared:true,privateLiabilitiesClosed:true,
        publicOutput:true,metamorphoReplyDiscardAndOriginalReconcile:variant.name==='metamorpho'});await audit();
    }
    assert.deepEqual(result.proofs.map(proof=>proof.relation),['deposit_intent','withdraw_balance','deposit_intent','withdraw_balance']);
    result.checks.originalProtocolPrivateEntryAndExit=true;result.phase='completed';result.success=true;await audit();
  } catch(error) {
    result.failedStage=result.phase;result.phase='failed';result.success=false;result.errorCode=code(error);
    writeFixturePrivate(join(privateDirectory,'error-private.json'),{message:String(error.message),stack:String(error.stack)});await audit().catch(()=>{});
  } finally {
    await cleanup();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
    if(!result.cleanup.closedEvm||result.cleanup.errors.length){result.success=false;result.phase='failed';result.errorCode??='DEVELOPMENT_DEFI_OWNED_CLEANUP_FAILED';}
    try{assert.deepEqual(developmentDefiEntrySourcePins(),result.sourcePins);result.sourceUnchanged=true;}catch{result.sourceUnchanged=false;result.success=false;result.phase='failed';}
    result.finishedAt=new Date().toISOString();save();if(!result.success)process.exitCode=1;
  }
}
await main();
