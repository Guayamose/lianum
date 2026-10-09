import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExternalVaultExitRecoveryAuditV1} from './external-defi-vault-exit-policy-v1.mjs';
test('HOST retained EXIT assessment rejects UNKNOWN, substituted receipt and second wire without granting recovery',()=>{
 const row={profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',variant:'METAMORPHO',bornBeforeFunding:true,originalSectionsStoppedBeforeReopen:true,newBackendPID:true,newOriginalCatalogue:true,newOriginalVault:true,newOriginalExitService:true,sameOriginalReceipt:true,originalExitRequestIdsRetained:true,originalCatalogueRequestIdsRetained:true,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false,actualWireCountBefore:91,actualWireCountAfter:91,catalogueRequestIds:['vault_top_up','vault_exit_0','vault_exit_1'],exitRequestIds:['vault_exit_1'],catalogueStates:['CONFIRMED','CONFIRMED','CONFIRMED'],exitPhase:'REDEEMED',catalogueIdentitySHA256:'1'.repeat(64),receiptSHA256:'2'.repeat(64),redemptionReferenceSHA256:'3'.repeat(64),exitIdentitySHA256:'4'.repeat(64)};
 assert.equal(assertExternalVaultExitRecoveryAuditV1(row).retainedOriginalVaultExitRecovery,true);
 for(const change of [{exitPhase:'UNKNOWN'},{sameOriginalReceipt:false},{actualWireCountAfter:92},{catalogueStates:['CONFIRMED','UNKNOWN']},{catalogueRequestIds:['vault_exit_1']},{originalGraphRecoveryEstablished:true}])assert.throws(()=>assertExternalVaultExitRecoveryAuditV1({...structuredClone(row),...change}));
 // Metadata-only host port; this test creates no account, issuer, native receipt or financial authority.
});

import {classifyExternalDefiVaultExitProcessV1,externalDefiVaultExitProcessFailureV1} from './external-defi-vault-exit-process-scope-v1.mjs';
import {ROOT,GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
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
import {bindGenericAccountRequest,validateBoundRequest,validateOutcome} from '../../../../packages/engine/src/execution/accounts/generic-account-journal.mjs';
test('HOST actual retained-note guard requires the original TOP_UP and EXIT terminals and excludes GRAPH',()=>{
  // Execute the production guard itself with original request/outcome validators.
  // Fixture statements are public synthetic metadata, never acceptance authority.
  const source=readFileSync(join(ROOT,'wallet-platform/modules/global-state/flat-account-authority.mjs'),'utf8');
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
  const catalogueSource=readFileSync(join(ROOT,'wallet-platform/modules/global-state/flat-journal-catalogue.mjs'),'utf8');
  const bindingStart=catalogueSource.indexOf('function validateRetainedVaultCatalogueBinding('),bindingEnd=catalogueSource.indexOf('function retainedCatalogueReopenMode(',bindingStart);
  assert.ok(bindingStart>=0&&bindingEnd>bindingStart);
  const bindingGuard=new Function('requireTrue',catalogueSource.slice(bindingStart,bindingEnd)+';return validateRetainedVaultCatalogueBinding;')((condition,code)=>assert.ok(condition,code));
  const members=[{poolIndex:0,account:{assetId:asset.assetId}},{poolIndex:1,account:{assetId:'f'.repeat(64)}}];
  records.forEach(row=>bindingGuard(row.request,members));
  bindingGuard({requestId:'vault_exit_1',kind:'EXIT',assetId:'f'.repeat(64)},members);
  for(const change of [{kind:'GRAPH'},{requestId:'substitute_top_up'},{assetId:'f'.repeat(64)},{assetId:'e'.repeat(64)}])assert.throws(()=>bindingGuard({...records[0].request,...change},members));
  assert.throws(()=>bindingGuard(records[0].request,[...members,members[0]]));
});
