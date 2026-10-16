/** HOST transport/custody/session ports; the real SDK normalizes and brands
 * its reads. No proof, chain receipt, private key or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sepoliaDefiFixtureV7,defiHashV7 as h} from './helpers/sepolia-defi-fixture-v7.mjs';
test('a retained W39 proof resumes with one explicit review approval and no new proof',async t=>{
  const {connection,review,jobId}=sepoliaDefiFixtureV7('AAVE_STATIC','REDEEM'),d=connection.descriptor,depositId=h('deposit'),output=h('output'),recipient=review.shareWithdrawalRecipient.slice(2),observed={blockNumber:'10',blockHash:h('block'),timestamp:'1200'};
  const parentFields={jobId:depositId,depositJobId:depositId,rootId:review.rootId,noteRevision:1,recipient,statement:{scope:d.poolTerms.scope,policy:d.poolTerms.policy,validFrom:'1000',validUntil:'1600',amount:review.shares,output},path:null,witnessSHA256:h('deposit witness'),proofSHA256:h('deposit proof'),publicInputsSHA256:h('deposit inputs')};
  const parent={profile:d.profile,descriptor:d,jobId:depositId,mode:'deposit_intent',stage:'CONFIRMED',consentFields:parentFields,observation:{profile:d.profile,jobId:depositId,depositJobId:depositId,rootId:review.rootId,commitment:output,amount:review.shares,recipient,proofSHA256:parentFields.proofSHA256,publicInputsSHA256:parentFields.publicInputsSHA256,transactionHash:h('deposit tx'),calldataSHA256:h('deposit calldata'),receiptBlockHash:observed.blockHash,observed,status:'CONFIRMED',canonicalRpcVerifiedBy:'ORIGINAL_BACKEND_OBSERVER',mobileCanonicalRpcVerified:false},errorCode:null};
  const fields={jobId,depositJobId:depositId,rootId:review.rootId,noteRevision:1,recipient,statement:{scope:d.poolTerms.scope,policy:d.poolTerms.policy,epoch:'2',root:h('root path'),nullifier:h('nullifier'),amount:review.shares,recipient,commitment:output},path:{root:h('root path'),index:0,leaf:output,siblings:Array.from({length:6},(_,i)=>h('sibling'+i))},witnessSHA256:h('withdraw witness'),proofSHA256:h('withdraw proof'),publicInputsSHA256:h('withdraw inputs')};
  const row={profile:d.profile,descriptor:d,jobId,mode:'withdraw_balance',stage:'PROVED',consentFields:fields,observation:null,errorCode:null},summary={rootId:review.rootId,noteRevision:1,jobs:[parent,row]},vault={summary:async()=>structuredClone(summary),reconcileOriginalStatus:async status=>{assert.equal(status.jobs[1].jobId,jobId);return summary;},latch:async consent=>{assert.equal(consent.action,'WITHDRAW_W39');assert.equal(consent.jobId,jobId);}};
  let approvals=0,signatures=0,financialWrites=0,sequence=0,readOriginalRow;const approval=Object.freeze({}),signature='1'.repeat(64)+'2'.repeat(64);
  t.mock.module('expo-crypto',{exports:{}});
  t.mock.module('../src/custody/device-external-flat-note-vault-v1.ts',{exports:{assertOriginalDeviceExternalFlatNoteVaultV1:(v,descriptor,root)=>{assert.equal(v,vault);assert.deepEqual(descriptor,d);assert.equal(root,review.rootId);}}});
  t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{signWalletSessionExternalV1:async()=>signature,approveWalletSessionSepoliaDefiV4:async checked=>{assert.deepEqual(checked,review);approvals++;return approval;},assertWalletSessionSepoliaDefiV4:(token,checked)=>{assert.equal(token,approval);assert.deepEqual(checked,review);},bindWalletSessionSepoliaDefiProofV4:(token,original)=>{assert.equal(token,approval);assert.equal(readOriginalRow(original),original);assert.equal(original.jobId,jobId);},signWalletSessionSepoliaDefiNoteV4:async(token,consent)=>{assert.equal(token,approval);assert.equal(consent.statement.amount,review.shares);signatures++;return signature;},closeWalletSessionAuthorizationV1:()=>{}}});
  const financial={jobId,reference:review.reference,phase:'SUBMITTED',transactionHash:'0x'+h('withdrawal'),canonical:false,protocol:review.protocol,kind:'WITHDRAW'};
  const fetchImpl=async(url,init)=>{const payload=JSON.parse(init.body);let value;
    if(url.endsWith('/challenges'))value={profile:d.profile,action:'ACCESS',origin:d.origin,pairingId:d.pairingId,devicePublicKey:d.devicePublicKey,challengeId:h('challenge'+(++sequence)),nonce:h('nonce'+sequence),expiresAt:Date.now()+15000};
    else if(url.endsWith('/defi-read-review'))value={reference:review.reference,state:'AUTHORIZED',review};
    else if(url.endsWith('/status')){const now=Date.now();value={descriptor:d,jobs:[parent,row],observed,observedAt:now,expiresAt:now+15000,note:{state:'UNKNOWN',commitment:output,available:null,backing:null}};}
    else if(url.endsWith('/withdrawal-review'))value={consent:{profile:d.profile,action:'WITHDRAW_W39',descriptor:d,challengeId:h('withdraw consent'),nonce:h('withdraw nonce'),expiresAt:Date.now()+15000,...fields,observed,openingDisclosure:null}};
    else if(url.endsWith('/withdrawal-arm')){assert.equal(payload.consentSignature,signature);financialWrites++;value=financial;}
    else if(url.endsWith('/redeem-submit')){financialWrites++;value=financial;}
    else assert.fail('resuming must not prepare or submit another proof: '+url);
    return Response.json(value);
  };
  const {createDeviceSepoliaDefiSharesApiV4}=await import('../src/api/device-sepolia-defi-shares-api-v4.mjs'),api=createDeviceSepoliaDefiSharesApiV4({descriptor:d,connection,fetchImpl});t.after(()=>api.close());
  readOriginalRow=(await import('../src/api/device-external-flat-note-api-v1.mjs')).readDeviceExternalFlatRowV1;
  const token=await api.resumeRedemption(vault,review,jobId);assert.equal(approvals,1);assert.equal(signatures,0);assert.equal(financialWrites,0);
  const result=await api.executeRedemption(token);assert.equal(result.kind,'WITHDRAW');assert.equal(result.canonical,false);assert.equal(financialWrites,2);assert.equal(approvals,1);assert.equal(signatures,1);
  await assert.rejects(api.executeRedemption({...token}));assert.equal(financialWrites,2);
});
