import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExternalVaultExitRecoveryAuditV1,commitExternalVaultExitCatalogueTransitionV1,assertExternalVaultExitCatalogueTransitionV1} from './external-defi-vault-exit-policy-v1.mjs';
test('HOST retained EXIT assessment rejects UNKNOWN, substituted receipt and second wire without granting recovery',()=>{
 const row={profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',variant:'METAMORPHO',bornBeforeFunding:true,originalSectionsStoppedBeforeReopen:true,newBackendPID:true,newOriginalCatalogue:true,newOriginalVault:true,newOriginalExitService:true,sameOriginalReceipt:true,originalExitRequestIdsRetained:true,originalCatalogueRequestIdsRetained:true,originalCatalogueAdmissionFenceEstablished:true,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false,actualWireCountBefore:91,actualWireCountAfter:91,catalogueRequestIds:['vault_top_up','vault_exit_0','vault_exit_1'],exitRequestIds:['vault_exit_1'],catalogueStates:['CONFIRMED','CONFIRMED','CONFIRMED'],exitPhase:'REDEEMED',catalogueIdentitySHA256:'1'.repeat(64),catalogueRecoveredIdentitySHA256:'5'.repeat(64),receiptSHA256:'2'.repeat(64),redemptionReferenceSHA256:'3'.repeat(64),exitIdentitySHA256:'4'.repeat(64)};
 assert.equal(assertExternalVaultExitRecoveryAuditV1(row).retainedOriginalVaultExitRecovery,true);
 for(const change of [{exitPhase:'UNKNOWN'},{sameOriginalReceipt:false},{actualWireCountAfter:92},{catalogueStates:['CONFIRMED','UNKNOWN']},{catalogueRequestIds:['vault_exit_1']},{originalGraphRecoveryEstablished:true},{originalCatalogueAdmissionFenceEstablished:false},{catalogueRecoveredIdentitySHA256:'UNKNOWN'}])assert.throws(()=>assertExternalVaultExitRecoveryAuditV1({...structuredClone(row),...change}));
 // Metadata-only host port; this test creates no account, issuer, native receipt or financial authority.
});

import {classifyExternalDefiVaultExitProcessV1,externalDefiVaultExitProcessFailureV1} from './external-defi-vault-exit-process-scope-v1.mjs';
import {ROOT,GOLDEN} from '@lianum/proofs/catalog';
import {sourceURL} from '@lianum/environment';
import {projectFlatAdmissionBudgetV1} from '../../../../packages/backend/src/accounts/storage/flat-admission-budget-v1.mjs';
import {join} from 'node:path';
import {NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1} from '../../wallet/native/native-device-economic-process-scope-v1.mjs';
test('HOST fixed successor rejects foreign parent/flags and init plus load-state before fallback',()=>{
 const child=join(ROOT,'integration/external-defi-vault-exit-successor-v1.mjs'),parent={argv:[process.execPath,join(ROOT,'integration/evm-vault-flow.mjs')]};
 assert.equal(classifyExternalDefiVaultExitProcessV1([process.execPath,child],process.execPath,parent).proofWorker,false);
 assert.equal(classifyExternalDefiVaultExitProcessV1([process.execPath,child],process.execPath,{argv:[process.execPath,'caller.mjs']}).proofWorker,true);
 const path=join(GOLDEN,'.local/integrations/flat-economic-receiver-v2-Ab1234'),argv=[NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1,'--host','127.0.0.1','--port','12345','--chain-id','31337','--hardfork','cancun','--timestamp','1900000210','--accounts','0','--init',join(path,'native-economic-genesis-v2.json'),'--quiet','--no-cors','--no-mining','--gas-limit','30000000'];
 assert.deepEqual(classifyExternalDefiVaultExitProcessV1(argv,argv[0],parent),{role:'evm-runtime',proofWorker:false});
 const successorParent={argv:[process.execPath,child]},reopened=[...argv];
 const owner=[process.execPath,join(ROOT,'mobile-core/flat-owner-process.mjs'),'--flat-owner-child'];assert.equal(classifyExternalDefiVaultExitProcessV1(owner,process.execPath,successorParent),null);assert.equal(classifyExternalDefiVaultExitProcessV1(owner.slice(0,2),process.execPath,successorParent).proofWorker,true);
 assert.equal(externalDefiVaultExitProcessFailureV1([{role:'external-vault-unexpected-process',state:'Z'}]),'EXTERNAL_VAULT_FIXED_PROCESS_REQUIRED');reopened[13]='--load-state';reopened[14]=join(path,'reopen-state-1.json');
 assert.equal(classifyExternalDefiVaultExitProcessV1(reopened,reopened[0],successorParent).proofWorker,false);
 for(const wrong of [[...reopened,'--init',argv[14]],argv.map((v,i)=>i===12?'5':v),argv.map((v,i)=>i===6?'1':v)])assert.equal(classifyExternalDefiVaultExitProcessV1(wrong,wrong[0],parent).proofWorker,true);
 // Labels do not grant launch, signal, pin, key or financial authority.
});


import {readFileSync} from 'node:fs';
import {bindGenericAccountRequest,validateBoundRequest,validateOutcome} from '@lianum/engine/accounts/journal';
test('HOST actual retained-note guard requires the original TOP_UP and EXIT terminals and excludes GRAPH',()=>{
  // Execute the production guard itself with original request/outcome validators.
  // Fixture statements are public synthetic metadata, never acceptance authority.
  const source=readFileSync(sourceURL('packages/backend/src/accounts/authority/flat-account-authority.mjs'),'utf8');
  const start=source.indexOf('function validateRetainedVaultNoteOperations('),end=source.indexOf('function retainedAccountReopenMode(',start);
  assert.ok(start>=0&&end>start);
  const check=new Function('assert','validateBoundRequest','validateOutcome',source.slice(start,end)+';return validateRetainedVaultNoteOperations;')(assert,validateBoundRequest,validateOutcome);
  const asset={assetId:'1'.repeat(64),symbol:'PALT',decimals:6,pool:'2'.repeat(40),chainId:'31337',genesis:'3'.repeat(64),kind:'ERC20',scope:'4'.repeat(64),policy:'5'.repeat(64),token:'6'.repeat(40),codeHash:'7'.repeat(64),assetIdentity:'8'.repeat(64),custody:'ONCHAIN_NOTE_POOL',trust:'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'};
  const config={accountId:'retained_vault_note_asset_0',journalId:'retained_vault_note_asset_journal_0',lifetime:'9'.repeat(64),registry:[asset]};
  const entry=(kind,id,role,ref)=>{const request=bindGenericAccountRequest({requestId:id,kind,assetId:asset.assetId,ownerOperationRef:ref},config);return {kind,role,ownerKind:kind==='TOP_UP'?'deposit':'withdraw_'+role,ownerOperationRef:ref,request,stage:'CONFIRMED',manualLifecycle:{state:'CONFIRMED'},submission:{},terminal:{},outcome:{version:1,state:'CONFIRMED',bindingSHA256:request.bindingSHA256,assetBindingSHA256:request.assetBindingSHA256,outcomeId:'c'.repeat(64),disposition:'APPLIED',blockNumber:'1',blockHash:'d'.repeat(64)}};};
  const records=[entry('TOP_UP','vault_top_up',null,'a'.repeat(64)),entry('EXIT','vault_exit_0','change','b'.repeat(64))];
  check(records,0,config,true);
  const mutate=work=>{const changed=structuredClone(records);work(changed);assert.throws(()=>check(changed,0,config,true));};
  mutate(rows=>{rows[0].kind='GRAPH';});mutate(rows=>{rows[0].request.requestId='replacement_top_up';});
  mutate(rows=>{rows[1].stage='UNKNOWN';});mutate(rows=>{rows[1].outcome=null;});
  mutate(rows=>{rows[1].outcome.bindingSHA256='e'.repeat(64);});mutate(rows=>{rows.reverse();});
  assert.throws(()=>check(records.slice(1),0,config,true));assert.throws(()=>check(records,1,config,true));
  const catalogueSource=readFileSync(sourceURL('packages/backend/src/accounts/storage/flat-journal-catalogue.mjs'),'utf8');
  const bindingStart=catalogueSource.indexOf('function validateRetainedVaultCatalogueBinding('),bindingEnd=catalogueSource.indexOf('function retainedCatalogueReopenMode(',bindingStart);
  assert.ok(bindingStart>=0&&bindingEnd>bindingStart);
  const bindingGuard=new Function('requireTrue',catalogueSource.slice(bindingStart,bindingEnd)+';return validateRetainedVaultCatalogueBinding;')((condition,code)=>assert.ok(condition,code));
  const members=[{poolIndex:0,account:{assetId:asset.assetId}},{poolIndex:1,account:{assetId:'f'.repeat(64)}}];
  records.forEach(row=>bindingGuard(row.request,members));
  bindingGuard({requestId:'vault_exit_1',kind:'EXIT',assetId:'f'.repeat(64)},members);
  for(const change of [{kind:'GRAPH'},{requestId:'substitute_top_up'},{assetId:'f'.repeat(64)},{assetId:'e'.repeat(64)}])assert.throws(()=>bindingGuard({...records[0].request,...change},members));
  assert.throws(()=>bindingGuard(records[0].request,[...members,members[0]]));
});


import {validateFlatOwnerReadPayload,GENERATION_PORTFOLIO_PROFILE} from '../../../../packages/mobile-protocol/src/wallet/contracts/owner-portfolio-contract.mjs';
test('HOST actual owner-view helper joins only the original catalogue generation and head without inventing balances',()=>{
  // Explicit public metadata fixtures; no owner, journal, node, proof or financial authority.
  const source=readFileSync(sourceURL('tests/integration/chains/evm/evm-vault-flow.mjs'),'utf8');
  const start=source.indexOf('function assertOriginalRetainedVaultOwnerPortfolioV1('),end=source.indexOf('async function main(',start);assert.ok(start>=0&&end>start);
  const check=new Function('assert','validateFlatOwnerReadPayload','GENERATION_PORTFOLIO_PROFILE',source.slice(start,end)+';return assertOriginalRetainedVaultOwnerPortfolioV1;')(assert,validateFlatOwnerReadPayload,GENERATION_PORTFOLIO_PROFILE);
  const hex=n=>String(n).repeat(64),address=n=>String(n).repeat(40),observed={observedAt:100,blockNumber:'4',blockHash:hex(3),timestamp:'1200'};
  const assets=[1,2].map(n=>({version:1,status:'LIVE',asset:{assetId:hex(n),symbol:'PALT',decimals:6},observed:structuredClone(observed),balances:{available:n===1?'100':'0',reserved:'0',recovery:'0',locked:'0'},backing:{held:n===1?'100':'0',liabilities:n===1?'100':'0',surplus:'0',deficit:'0'},requests:[]}));
  assets[0].requests=[{requestId:'vault_top_up',kind:'TOP_UP',state:'CONFIRMED',disposition:'APPLIED'}];
  const portfolio={version:1,profile:'OWNED_FLAT_PRIVATE_PORTFOLIO_V1',status:'LIVE',coherent:true,observed:structuredClone(observed),assets,capabilities:{coordinatorRestart:true,keeperRestart:false,crossAssetAtomicConversion:false,privateDeFiComposability:false,fullWalletAcceptance:false}};
  const routes=[1,2].map(n=>({assetId:hex(n),pool:address(n),domainCommitment:hex(n+3)})),generationId=hex(6);
  const view={version:2,profile:GENERATION_PORTFOLIO_PROFILE,status:'LIVE',coherent:true,observed:structuredClone(observed),generations:[{generationId,routes,portfolio,errorCode:null}],capabilities:{coordinatorRestart:true,keeperRestart:false,nodeRestart:false,privateBalancesAggregated:false,implicitNoteMigration:false,fullWalletAcceptance:false}};
  const status={profile:GENERATION_PORTFOLIO_PROFILE,generations:[{generationId,routes:structuredClone(routes)}]},original={...structuredClone(portfolio),positions:[]};
  assert.equal(check(view,status,original),original);
  for(const change of [p=>p.generations[0].generationId=hex(7),p=>p.generations.push(structuredClone(p.generations[0])),p=>p.generations[0].routes[0].pool=address(9),p=>{p.generations[0].portfolio=null;p.generations[0].errorCode='FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE';p.status='UNAVAILABLE';p.coherent=false;p.observed=null;},p=>p.profile='CALLER_SELECTED']){
    const changed=structuredClone(view);change(changed);assert.throws(()=>check(changed,status,original));
  }
  for(const change of [p=>p.assets[0].asset.assetId=hex(8),p=>p.observed.blockHash=hex(9),p=>p.assets[0].balances.available='99',p=>p.status='STALE']){
    const changed=structuredClone(original);change(changed);assert.throws(()=>check(view,status,changed));
  }
  assert.throws(()=>check(view,{...status,generations:[]},original));
  assert.throws(()=>check(view,{...status,generations:[...status.generations,status.generations[0]]},original));
});


test('HOST original retained fixture keeps the late-created lifetime accessor without changing legacy',()=>{
  // Execute the actual original fixture object-construction block only.
  // The opaque marker is an inert HOST value, never a lifetime/issuer authority.
  const source=readFileSync(sourceURL('tests/integration/fixtures/chains/evm/owned-evm-vault-fixture.mjs'),'utf8');
  const start=source.indexOf('  const fixture = {'),end=source.indexOf("  try {\n    await onStage('start-owned-local-evm-v2');",start);assert.ok(start>=0&&end>start);
  const construct=new Function('retained',`
    let recoveryLifetime,runtime,assets,officialProtocol,system,router,evmDelivery,quorum,sourceOwner,targetOwner,rulesTree,cleanupPromise;
    const capabilities=[],operators=[],readers=[],recipients=[],recipientBoots=[],providers=[],rules=[],callbacks={},official=false,officialMetaMorpho=false,officialAave=false;
    ${source.slice(start,end)}
    return {fixture,publish(value){recoveryLifetime=value;}};
  `);
  const retained=construct(true),legacy=construct(false),marker=Object.freeze(Object.create(null));
  const descriptor=Object.getOwnPropertyDescriptor(retained.fixture,'recoveryLifetime');
  assert.equal(typeof descriptor.get,'function');assert.equal(Object.hasOwn(descriptor,'value'),false);
  assert.equal(retained.fixture.recoveryLifetime,undefined);
  retained.publish(marker);assert.equal(retained.fixture.recoveryLifetime,marker);
  assert.throws(()=>Object.defineProperty(retained.fixture,'recoveryLifetime',{value:Object.freeze({})}));
  assert.equal(Object.hasOwn(legacy.fixture,'recoveryLifetime'),false);legacy.publish(marker);
  assert.equal(Object.hasOwn(legacy.fixture,'recoveryLifetime'),false);
});


import {immutable,sha as canonicalJournalSHA,genericAccountIdentity} from '@lianum/engine/accounts/journal';
test('HOST original catalogue status commits only authenticated false-to-true admission fencing and rejects every other change',()=>{
  // Run the actual catalogue factory's saved-state initialization, descriptor
  // and status closure. Public synthetic data ports contain no issuer, vault,
  // account capability, consent, native receipt or financial authority.
  const source=readFileSync(sourceURL('packages/backend/src/accounts/storage/flat-journal-catalogue.mjs'),'utf8');
  const descriptorStart=source.indexOf('function descriptor(generation) {'),descriptorEnd=source.indexOf('/** Owns construction once.',descriptorStart);
  const initializeStart=source.indexOf('  let busy = false, closed = false, storageFault = false, admissionFault = false, pendingWrite = null;'),initializeEnd=source.indexOf('  async function exclusive(work)',initializeStart);
  const statusStart=source.indexOf('    status: () => immutable('),statusEnd=source.indexOf('\n  });',statusStart);
  const bindingStart=source.indexOf('function validateRetainedVaultCatalogueBinding('),bindingEnd=source.indexOf('function retainedCatalogueReopenMode(',bindingStart);
  assert.ok(descriptorStart>=0&&descriptorEnd>descriptorStart&&initializeStart>=0&&initializeEnd>initializeStart&&statusStart>=0&&statusEnd>statusStart&&bindingStart>=0&&bindingEnd>bindingStart);
  const requireTrue=(value,code)=>assert.ok(value,code);
  const descriptor=new Function('immutable',source.slice(descriptorStart,descriptorEnd)+';return descriptor;')(immutable);
  const validateBinding=new Function('requireTrue',source.slice(bindingStart,bindingEnd)+';return validateRetainedVaultCatalogueBinding;')(requireTrue);
  const construct=new Function('assert','immutable','projectFlatAdmissionBudgetV1','descriptor','validateBoundRequest','bindGenericAccountRequest','validateRetainedVaultCatalogueBinding','requireTrue','byId','record','durable',`
    const PROFILE='FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2';
    ${source.slice(initializeStart,initializeEnd)}
    // Explicit fixture of bindings already admitted/read back in the original
    // live catalogue. The saved branch rebuilds its map via the actual code.
    if(!durable?.saved)for(const entry of record.data.bindings)bindings.set(entry.request.requestId,immutable(entry));
    return ${source.slice(statusStart+'    status: '.length,statusEnd).trim().replace(/,$/,'')};
  `);
  const asset=n=>({assetId:String(n).repeat(64),symbol:'PALT',decimals:6,pool:String(n+2).repeat(40),chainId:'31337',genesis:'3'.repeat(64),kind:'ERC20',scope:'4'.repeat(64),policy:'5'.repeat(64),token:String(n+4).repeat(40),codeHash:'7'.repeat(64),assetIdentity:'8'.repeat(64),custody:'ONCHAIN_NOTE_POOL',trust:'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
  const config={accountId:'original_note_portfolio',journalId:'original_note_portfolio_journal',lifetime:'9'.repeat(64),registry:[asset(1),asset(2)]},identity=genericAccountIdentity(config),generationId=canonicalJournalSHA({profile:'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2',identity});
  const routes=config.registry.map((asset,index)=>({assetId:asset.assetId,pool:asset.pool,domainCommitment:String(index+4).repeat(64),economicIdentitySHA256:String(index+6).repeat(64)}));
  const generation={id:generationId,identity,config,routes,admissionAssets:config.registry.map(asset=>asset.assetId),accounts:config.registry.map((asset,poolIndex)=>({poolIndex,account:{assetId:asset.assetId}}))};
  const entries=[['TOP_UP','vault_top_up',0,'a'],['EXIT','vault_exit_0',0,'b'],['EXIT','vault_exit_1',1,'c']].map(([kind,requestId,pool,ref])=>{
    const request={kind,requestId,assetId:config.registry[pool].assetId,ownerOperationRef:ref.repeat(64)};
    return {request,boundRequest:bindGenericAccountRequest(request,config),generationId};
  });
  const record={revision:3,data:{current:Object.fromEntries(routes.map(route=>[route.economicIdentitySHA256,route.assetId])),bindings:entries,generations:[{generationId}]}};
  const status=saved=>construct(assert,immutable,projectFlatAdmissionBudgetV1,descriptor,validateBoundRequest,bindGenericAccountRequest,validateBinding,requireTrue,new Map([[generationId,structuredClone(generation)]]),structuredClone(record),saved?{saved:{},vaultNotes:true}:null)();
  const before=status(false),after=status(true),commitment=commitExternalVaultExitCatalogueTransitionV1(before);
  assert.equal(before.admissionFault,false);assert.equal(after.admissionFault,true);
  assert.notEqual(canonicalJournalSHA(before),canonicalJournalSHA(after)); // Original whole-status comparison fails causally.
  assert.deepEqual({...after,admissionFault:false},before);
  assert.deepEqual(assertExternalVaultExitCatalogueTransitionV1(after,commitment),commitment);
  assert.equal(commitment.beforeSHA256,canonicalJournalSHA(before));assert.equal(commitment.afterSHA256,canonicalJournalSHA(after));assert.ok(Object.isFrozen(commitment));
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(before,commitment)); // false -> false
  assert.throws(()=>commitExternalVaultExitCatalogueTransitionV1(after)); // true -> true cannot acquire a before commitment
  const mutated=change=>{const value=structuredClone(after);change(value);assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(value,commitment));};
  for(const change of [value=>value.profile='CALLER_PROFILE',value=>value.generations[0].generationId='d'.repeat(64),value=>value.generations[0].registry[0].decimals=9,value=>value.bindings[0].request.ownerOperationRef='e'.repeat(64),value=>value.bindings.pop(),value=>value.current[routes[0].economicIdentitySHA256]=config.registry[1].assetId,value=>value.pendingReview={state:'READY'},value=>value.pendingOwnerPreparation={state:'READY'},value=>value.pendingGenerationId='f'.repeat(64),value=>value.storageFault=true,value=>value.uncertainWrite=true,value=>value.keeperRestart=true,value=>value.originalBindingsRewritten=true,value=>value.admissionBudget.remaining++,value=>value.counter=1,value=>{delete value.current;}])mutated(change);
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(after,{...commitment,beforeSHA256:'f'.repeat(64)}));
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(after,{...commitment,afterSHA256:'f'.repeat(64)}));
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(after,{...commitment,extra:1}));
  let reads=0;const getter=structuredClone(after);Object.defineProperty(getter,'bindings',{enumerable:true,get(){reads++;return [];}});
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(getter,commitment));assert.equal(reads,0);
  assert.throws(()=>assertExternalVaultExitCatalogueTransitionV1(new Proxy(after,{}),commitment));
});
