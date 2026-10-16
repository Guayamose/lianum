/** Finite administrative composition. Storage sealing never opens a wallet or
 * issues spending authority. The separate, already bounded Original financial
 * review is the sole issuer of the requested operator epoch. No product boot,
 * deploy, user-key import or transaction is part of this operation. */
import assert from 'node:assert/strict';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {openOriginalPagedPublicDeadStorageSealV8,closeOriginalPagedPublicDeadStorageSealV8,readOriginalPagedPublicRecoveryModeV4} from './paged-runtime-recovery-authority-v3.mjs';
import {sealOriginalPagedPublicUniswapMixedDeadStorageV8,openOriginalPagedPublicMixedDeadStorageSequenceV10,readOriginalPagedPublicUniswapMixedRecoveryModeV6,reconcileOriginalPagedPublicUniswapMixedCapturedFinancialReviewV9} from './paged-public-uniswap-mixed-supervisor-v4.mjs';
import {readOriginalSepoliaDefiRetentionModeV8,sealOriginalSepoliaDefiDeadStorageV9} from './sepolia-defi-retention-v8.mjs';
import {authorizeOriginalPagedCapturedNativeFinancialEpochV5} from './paged-captured-native-financial-epoch-v5.mjs';

export async function sealOriginalPagedPublicFullStorageV9(raw){
 assert.equal(arguments.length,1);P.pagedOwnerExactV3(raw,['mixed','defi']);P.pagedOwnerExactV3(raw.mixed,['directory','password','mixedJournalPassword','flatJournalPassword']);P.pagedOwnerExactV3(raw.defi,['directory','password','parentSupervisorDirectory','parentPassword']);const rootInput={directory:raw.defi.parentSupervisorDirectory,password:raw.defi.parentPassword};let rootSeal;
 const initialRoot=await readOriginalPagedPublicRecoveryModeV4(rootInput),initialMixed=await readOriginalPagedPublicUniswapMixedRecoveryModeV6({directory:raw.mixed.directory,password:raw.mixed.password}),initialDefi=await readOriginalSepoliaDefiRetentionModeV8({directory:raw.defi.directory,password:raw.defi.password});assert.ok(['ACTIVE_DEAD_EXPIRED_FENCED','PARTIAL_OPENING_FENCED','CAPTURED','CAPTURED_FINANCIAL_REVIEW_V5'].includes(initialRoot.mode),'PUBLIC_STORAGE_REVIEW_ROOT_PHASE');assert.ok(['ACTIVE','OPENING','CAPTURED'].includes(initialMixed.phase)&&['ACTIVE','OPENING','CAPTURED'].includes(initialDefi.phase),'PUBLIC_STORAGE_REVIEW_CHILD_PHASE');
 try{
  if(['ACTIVE_DEAD_EXPIRED_FENCED','PARTIAL_OPENING_FENCED'].includes(initialRoot.mode)||initialMixed.phase!=='CAPTURED'||initialDefi.phase!=='CAPTURED'){
   assert.notEqual(initialRoot.mode,'CAPTURED_FINANCIAL_REVIEW_V5','PUBLIC_STORAGE_REVIEW_CHILD_CAPTURE_REQUIRED');const sequence=openOriginalPagedPublicMixedDeadStorageSequenceV10(raw.mixed);try{const opened=await sequence.next();assert.equal(opened.done,false);await sealOriginalSepoliaDefiDeadStorageV9(raw.defi,opened.value);const completed=await sequence.next();assert.equal(completed.done,true);}finally{await sequence.return();}
  }
 }finally{if(rootSeal)await closeOriginalPagedPublicDeadStorageSealV8(rootSeal);}
 const capturedRoot=await readOriginalPagedPublicRecoveryModeV4(rootInput),capturedMixed=await readOriginalPagedPublicUniswapMixedRecoveryModeV6({directory:raw.mixed.directory,password:raw.mixed.password}),capturedDefi=await readOriginalSepoliaDefiRetentionModeV8({directory:raw.defi.directory,password:raw.defi.password});assert.ok(['CAPTURED','CAPTURED_FINANCIAL_REVIEW_V5'].includes(capturedRoot.mode));assert.equal(capturedMixed.phase,'CAPTURED');assert.equal(capturedDefi.phase,'CAPTURED');return Object.freeze({profile:'ORIGINAL_PAGED_PUBLIC_FULL_STORAGE_SEALED_V9',rootPhase:'CAPTURED',mixedPhase:'CAPTURED',defiPhase:'CAPTURED',financialSourcePermissionIssued:false,transactionsBroadcast:0});
}
export async function sealAndReviewOriginalPagedPublicFullStorageV9(raw,review,signal){
 assert.ok(arguments.length===2||arguments.length===3);P.pagedOwnerExactV3(raw,['mixed','defi','nativeDirectory']);await sealOriginalPagedPublicFullStorageV9({mixed:raw.mixed,defi:raw.defi});const rootInput={directory:raw.defi.parentSupervisorDirectory,password:raw.defi.parentPassword};
 const result=await authorizeOriginalPagedCapturedNativeFinancialEpochV5({supervisorDirectory:rootInput.directory,journalPassword:rootInput.password,nativeDirectory:raw.nativeDirectory},review,signal),mixed=await reconcileOriginalPagedPublicUniswapMixedCapturedFinancialReviewV9({directory:raw.mixed.directory,password:raw.mixed.password},review);assert.equal(result.transactionsBroadcast,0);assert.equal(mixed.transactionsBroadcast,0);const finalRoot=await readOriginalPagedPublicRecoveryModeV4(rootInput),finalDefi=await readOriginalSepoliaDefiRetentionModeV8({directory:raw.defi.directory,password:raw.defi.password});assert.equal(finalRoot.mode,'CAPTURED');assert.equal(finalDefi.phase,'CAPTURED');return Object.freeze({profile:'ORIGINAL_PAGED_PUBLIC_FULL_STORAGE_REVIEW_RESULT_V9',outcome:result.outcome,intentId:review.intentId,rootPhase:'CAPTURED',mixedPhase:mixed.phase,defiPhase:finalDefi.phase,financialSourcePermissionIssued:false,transactionsBroadcast:0});
}
