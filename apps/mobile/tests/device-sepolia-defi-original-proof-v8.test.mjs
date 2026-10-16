/** Actual dedicated SDK brands; custody and signature ports are HOST. This
 * proves recovery classification, never a proof verification or a chain send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sepoliaDefiFixtureV7,defiHashV7 as h} from './helpers/sepolia-defi-fixture-v7.mjs';
test('only a live SDK recovery of the accepted D27 can bind a Source7 page; copied DATA and a closed SDK cannot',async t=>{
 const {connection,review,jobId}=sepoliaDefiFixtureV7(),d=connection.descriptor,recipient=review.shareWithdrawalRecipient.slice(2),output=h('original proof output'),observed={blockNumber:'10',blockHash:h('block'),timestamp:'1200'};
 const fields={jobId,depositJobId:jobId,rootId:review.rootId,noteRevision:1,recipient,statement:{scope:d.poolTerms.scope,policy:d.poolTerms.policy,validFrom:review.validFrom,validUntil:review.validUntil,amount:review.shares,output},path:null,witnessSHA256:h('witness'),proofSHA256:h('proof'),publicInputsSHA256:h('inputs')},row={profile:d.profile,descriptor:d,jobId,mode:'deposit_intent',stage:'PROVED',consentFields:fields,observation:null,errorCode:null},summary={rootId:review.rootId,noteRevision:1,jobs:[row]};let sequence=0,signatures=0,reconciles=0,readStatus;
 const vault={summary:async()=>structuredClone(summary),reconcileOriginalStatus:async status=>{assert.equal(readStatus(status),status);reconciles++;return summary;}};
 t.mock.module('expo-crypto',{exports:{}});
 t.mock.module('../src/custody/device-external-flat-note-vault-v1.ts',{exports:{assertOriginalDeviceExternalFlatNoteVaultV1:(actual,descriptor,root)=>{assert.equal(actual,vault);assert.deepEqual(descriptor,d);assert.equal(root,review.rootId);}}});
 t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{signWalletSessionExternalV1:async()=>{signatures++;return '1'.repeat(64)+'2'.repeat(64);}}});
 const fetchImpl=async(url,init)=>{const body=JSON.parse(init.body);assert.equal(init.headers['x-lianum-defi-pairing-id'],d.pairingId);
  if(url.endsWith('/challenges'))return Response.json({profile:d.profile,action:'ACCESS',origin:d.origin,pairingId:d.pairingId,devicePublicKey:d.devicePublicKey,challengeId:h('challenge'+(++sequence)),nonce:h('nonce'+sequence),expiresAt:Date.now()+15000});
  if(url.endsWith('/defi-read-review')){assert.equal(body.reference,review.reference);return Response.json({reference:review.reference,state:'AUTHORIZED',review});}
  if(url.endsWith('/status')){const now=Date.now();return Response.json({descriptor:d,jobs:[row],observed,observedAt:now,expiresAt:now+15000,note:{state:'UNKNOWN',commitment:output,available:null,backing:null}});}
  assert.fail('recovery may not prepare a proof, request sensitive approval or send financially: '+url);
 };
 const SDK=await import('../src/api/device-sepolia-defi-shares-api-v4.mjs'),Notes=await import('../src/api/device-external-flat-note-api-v1.mjs');readStatus=Notes.readDeviceExternalFlatStatusV1;
 const api=SDK.createDeviceSepoliaDefiSharesApiV4({descriptor:d,connection,fetchImpl});t.after(()=>api.close());
 const proof=await api.recoverInvestmentPreparation(vault,review,jobId),data=SDK.readDeviceSepoliaDefiProofPreparationV8(proof);assert.deepEqual(data,{review,jobId});assert.equal(reconciles,1);assert.equal(signatures,2);
 for(const copy of [{...proof},structuredClone(proof),data,review])assert.throws(()=>SDK.readDeviceSepoliaDefiProofPreparationV8(copy),/REVIEW_BINDING/);
 const original=await api.readOriginalStatus(vault);assert.equal(readStatus(original),original);assert.throws(()=>readStatus(structuredClone(original)));assert.equal(signatures,3);
 api.close();assert.throws(()=>SDK.readDeviceSepoliaDefiProofPreparationV8(proof));assert.throws(()=>readStatus(original));
});
