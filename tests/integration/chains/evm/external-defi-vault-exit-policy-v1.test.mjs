import test from 'node:test';
import assert from 'node:assert/strict';
import {assertExternalVaultExitRecoveryAuditV1} from './external-defi-vault-exit-policy-v1.mjs';
test('HOST retained EXIT assessment rejects UNKNOWN, substituted receipt and second wire without granting recovery',()=>{
 const row={profile:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_BACKEND_V1',variant:'METAMORPHO',bornBeforeFunding:true,originalSectionsStoppedBeforeReopen:true,newBackendPID:true,newOriginalCatalogue:true,newOriginalVault:true,newOriginalExitService:true,sameOriginalReceipt:true,originalExitRequestIdsRetained:true,originalCatalogueRequestIdsRetained:true,originalGraphRecoveryEstablished:false,abruptCrashRecoveryEstablished:false,parentProcessExitEstablished:false,actualWireCountBefore:91,actualWireCountAfter:91,catalogueRequestIds:['vault_exit_0','vault_exit_1'],exitRequestIds:['vault_exit_1'],catalogueStates:['CONFIRMED','CONFIRMED'],exitPhase:'REDEEMED',catalogueIdentitySHA256:'1'.repeat(64),receiptSHA256:'2'.repeat(64),redemptionReferenceSHA256:'3'.repeat(64),exitIdentitySHA256:'4'.repeat(64)};
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
