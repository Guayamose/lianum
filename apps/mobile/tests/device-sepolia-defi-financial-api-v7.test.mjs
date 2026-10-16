import test from 'node:test';
import assert from 'node:assert/strict';
import {sepoliaDefiFixtureV7,defiHashV7 as h} from './helpers/sepolia-defi-fixture-v7.mjs';
import {deviceSepoliaDefiFeedbackV7} from '../src/screens/sepolia-defi-feedback-v7.mjs';

test('financial submit never retries a lost response; the same job is observed without a sensitive approval',async t=>{
  const {connection,review,summary,jobId}=sepoliaDefiFixtureV7(),vault={summary:async()=>structuredClone(summary)};let reads=0,writes=0,mode='lost',sequence=0;
  t.mock.module('expo-crypto',{exports:{}});
  t.mock.module('../src/custody/device-external-flat-note-vault-v1.ts',{exports:{assertOriginalDeviceExternalFlatNoteVaultV1:(given,d,root)=>{assert.equal(given,vault);assert.deepEqual(d,connection.descriptor);assert.equal(root,review.rootId);}}});
  t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{signWalletSessionExternalV1:async(kind,access,origin,pairing)=>{assert.equal(kind,'NOTE');assert.equal(origin,connection.descriptor.origin);assert.equal(pairing,connection.descriptor.pairingId);reads++;return '1'.repeat(64)+'2'.repeat(64);}}});
  const status={jobId,reference:review.reference,phase:'CONFIRMED',transactionHash:'0x'+h('transaction'),canonical:true,protocol:review.protocol,kind:'INVEST'};
  const fetchImpl=async(url,init)=>{const data=JSON.parse(init.body);assert.equal(init.headers['x-lianum-defi-pairing-id'],connection.descriptor.pairingId);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
    if(url.endsWith('/challenges'))return Response.json({profile:connection.descriptor.profile,action:'ACCESS',origin:connection.descriptor.origin,pairingId:connection.descriptor.pairingId,devicePublicKey:connection.descriptor.devicePublicKey,challengeId:h('access'+(++sequence)),nonce:h('nonce'+sequence),expiresAt:Date.now()+15000});
    if(url.endsWith('/defi-proposals')){assert.equal(data.underlyingReceiver,review.underlyingReceiver);assert.equal(data.rootId,review.rootId);assert.equal(data.noteRevision,review.noteRevision);if(mode==='sponsor-window')return Response.json({error:'SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW'},{status:403});return Response.json({review:mode==='redirected-review'?{...review,underlyingReceiver:'0x'+'6'.repeat(40)}:review});}
    assert.equal(data.jobId,jobId);assert.equal(data.reference,review.reference);
    if(url.endsWith('/financial-submit')){writes++;if(mode==='capital-guard')return Response.json({error:'SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED'},{status:403});throw Error('HOST_LOST_POST_ACK');}
    assert.ok(url.endsWith('/financial-observe'));return Response.json(mode==='wrong-job'?{...status,jobId:h('foreign')}:mode==='proof-only'?{...status,phase:'PROVED'}:mode==='not-canonical'?{...status,canonical:false}:mode==='prepared'?{...status,phase:'PREPARED',canonical:false,transactionHash:null}:status);
  };
  const {createDeviceSepoliaDefiFinancialApiV7}=await import('../src/api/device-sepolia-defi-financial-api-v7.mjs'),api=createDeviceSepoliaDefiFinancialApiV7({connection,fetchImpl});t.after(()=>api.close());
  await assert.rejects(api.submitInvestment(vault,review,jobId),/HOST_LOST_POST_ACK/);assert.equal(writes,1);
  await assert.rejects(api.submitInvestment(vault,review,jobId),/FINANCIAL_BINDING/);assert.equal(writes,1,'an explicit repeated API call cannot send the same write again');
  mode='valid';const result=await api.observe(vault,review,jobId);assert.equal(result.canonical,true);assert.equal(result.phase,'CONFIRMED');assert.equal(writes,1);assert.equal(reads,3,'only unlocked read signatures were requested');
  for(const value of ['wrong-job','proof-only','not-canonical']){mode=value;await assert.rejects(api.observe(vault,review,jobId));}
  mode='prepared';const pending=await api.observe(vault,review,jobId);await assert.rejects(api.continueInvestment(vault,review,jobId,{...pending}),/FINANCIAL_BINDING/);assert.equal(writes,1);
  await assert.rejects(api.continueInvestment(vault,review,jobId,pending),/HOST_LOST_POST_ACK/);assert.equal(writes,2,'only explicit continuation after the original PREPARED observation submits again');
  await assert.rejects(api.continueInvestment(vault,review,jobId,pending),/FINANCIAL_BINDING/);assert.equal(writes,2,'the original read handle is one-use');
  const before=reads;await assert.rejects(api.observe(vault,{...review,maximumInputAtomic:'1002001'},jobId));assert.equal(reads,before,'a review above the connection cap is rejected before signing');
  const userSelected=structuredClone(connection);userSelected.terms.underlyingReceiver=null;const proposed=createDeviceSepoliaDefiFinancialApiV7({connection:userSelected,fetchImpl});t.after(()=>proposed.close());
  const input={action:'INVEST',receiptCommitment:review.receiptCommitment,sharesAtomic:review.shares,maximumInputAtomic:'1001000',minimumAssetsAtomic:null,underlyingReceiver:review.underlyingReceiver};
  mode='valid';assert.equal((await proposed.propose(vault,input)).underlyingReceiver,input.underlyingReceiver);
  mode='redirected-review';await assert.rejects(proposed.propose(vault,input),/FINANCIAL_BINDING/);
  mode='sponsor-window';await assert.rejects(proposed.propose(vault,input),/SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW/);
  const guarded=createDeviceSepoliaDefiFinancialApiV7({connection,fetchImpl});t.after(()=>guarded.close());mode='capital-guard';await assert.rejects(guarded.submitInvestment(vault,review,jobId),/SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED/);
  const {createDeviceSepoliaDefiSharesNoteApiV4}=await import('../src/api/device-external-flat-note-api-v1.mjs'),blockedNote=createDeviceSepoliaDefiSharesNoteApiV4({descriptor:connection.descriptor,fetchImpl:async()=>Response.json({error:'SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED'},{status:403})});t.after(()=>blockedNote.close());await assert.rejects(blockedNote.challenge(),/SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED/);
  assert.match(deviceSepoliaDefiFeedbackV7(Error('SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED')),/falta conectar la reserva de fondos/);assert.ok(!deviceSepoliaDefiFeedbackV7(Error('SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED')).includes('Consulta esta misma operación'));
  api.close();await assert.rejects(api.observe(vault,review,jobId));
});
