import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as Batch from '../src/device-sepolia-morpho-batch-review-v5.mjs';
import {planDeviceSepoliaMorphoShareNotesV4} from '../src/device-sepolia-defi-share-plan-v4.mjs';
import {DEVICE_SEPOLIA_DEFI_REVIEW_V4} from '../src/device-sepolia-defi-review-v4.mjs';
import {DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../src/device-external-flat-note-v1.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
function review(){
 const totalSharesAtomic='100000000000000000000',maximumNodes=256,plan=planDeviceSepoliaMorphoShareNotesV4({totalSharesAtomic,maximumNodes});
 const notes=plan.notes.map((note,index)=>({id:note.id,review:{profile:DEVICE_SEPOLIA_DEFI_REVIEW_V4,protocol:'MORPHO_V2',action:'INVEST',descriptor:{profile:DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://lianum.example.test',devicePublicKey:'04'+'1'.repeat(128),pairingId:hash('pair'+index),lifetime:hash('lifetime'+index),poolTerms:{pool:'1'.repeat(40),asset:'2'.repeat(40),hub:'3'.repeat(40),...Object.fromEntries(['poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(key=>[key,hash(key)]))},assetMetadata:{kind:'ERC20',symbol:'mvUSDC',decimals:18}},rootId:hash('root'+index),noteRevision:1,reference:hash('review'+index),shares:note.sharesAtomic,maximumInputAtomic:String(index+1),minimumAssetsAtomic:null,underlyingReceiver:'0x'+'5'.repeat(40),shareWithdrawalRecipient:'0x'+'6'.repeat(40),validFrom:'1',validUntil:'601',receiptCommitment:hash('receipt'+index)}}));
 return{profile:Batch.DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5,reference:hash('aggregate'),totalSharesAtomic,maximumNodes,maximumInputAtomic:'21',notes};
}
test('aggregate DATA binds six exact 100-share quantities, individual identities and the exact maximum-USDC sum',()=>{
 const data=Batch.normalizeDeviceSepoliaMorphoBatchReviewV5(review());assert.equal(data.notes.length,6);assert.equal(data.notes.reduce((sum,note)=>sum+BigInt(note.review.shares),0n),100000000000000000000n);assert.equal(data.maximumInputAtomic,'21');assert.ok(Object.isFrozen(data.notes[0].review));
 for(const key of ['pairingId','lifetime','rootId','reference','receiptCommitment']){const raw=review();if(key==='pairingId'||key==='lifetime')raw.notes[1].review.descriptor[key]=raw.notes[0].review.descriptor[key];else raw.notes[1].review[key]=raw.notes[0].review[key];assert.throws(()=>Batch.normalizeDeviceSepoliaMorphoBatchReviewV5(raw),/BATCH_REVIEW_DATA/);}
});
test('aggregate rejects changed totals, per-note shares, receivers, deadlines, assets and unreviewed USDC',()=>{
 for(const mutate of [value=>value.maximumInputAtomic='22',value=>value.notes.pop(),value=>value.notes.reverse(),value=>value.notes[0].review.shares='16666666666666666668',value=>value.notes[0].review.protocol='AAVE_STATIC',value=>value.notes[1].review.underlyingReceiver='0x'+'7'.repeat(40),value=>value.notes[1].review.shareWithdrawalRecipient='0x'+'8'.repeat(40),value=>value.notes[1].review.validUntil='602',value=>value.notes[1].review.descriptor.poolTerms.scope=hash('foreign'),value=>value.notes[1].review.descriptor.origin='https://foreign.example.test',value=>value.reference=value.notes[0].review.reference]){const data=review();mutate(data);assert.throws(()=>Batch.normalizeDeviceSepoliaMorphoBatchReviewV5(data));}
});
test('a caller accessor or unknown field never executes while normalizing aggregate review DATA',()=>{
 const raw=review();let touched=false;Object.defineProperty(raw.notes[0],'review',{enumerable:true,get(){touched=true;throw Error('accessor');}});assert.throws(()=>Batch.normalizeDeviceSepoliaMorphoBatchReviewV5(raw));assert.equal(touched,false);assert.throws(()=>Batch.normalizeDeviceSepoliaMorphoBatchReviewV5({...review(),financialGrant:{}}));
});
