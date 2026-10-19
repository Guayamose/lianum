import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,ECDH} from 'node:crypto';
import * as E from '../../src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {verifySourceFinancialEpochSignatureDataV5} from '../../src/chains/public-testnet/sepolia-source-financial-epoch-store-v5.mjs';
import * as W from '../../src/chains/public-testnet/sepolia-operation-window-data-v17.mjs';
const now=Date.parse('2026-10-17T19:33:00Z'),end=Date.parse('2026-11-23T23:30:00Z'),h=c=>c.repeat(64);
const base={profile:E.SOURCE_SPONSOR_PROFILE_V4,keysetId:h('1'),account:'0x'+'a'.repeat(40),maximumFeePerTransactionAtomic:'100',maximumTotalFeeAtomic:'1000',maximumValuePerTransactionAtomic:'200',maximumTotalValueAtomic:'1000',expiresAt:now+3600000};
const window=()=>({profile:W.OPERATION_WINDOW_V17,authorizedAt:now,expiresAt:end,spendingPolicySHA256:W.operationSpendingPolicySHA256V17(base)});
function frame(prior=null,limits={},policy={},more={}){
 const raw={profile:E.SOURCE_FINANCIAL_EPOCH_V5,chainId:'11155111',genesis:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',keysetId:base.keysetId,account:base.account,basePolicySHA256:E.sourceFinancialPolicySHA256DataV5(base),epoch:prior?'2':'1',predecessorEpochId:prior?.epochId??null,checkpoint:{identity:h('2'),revision:31,dataSHA256:h('3'),policySHA256:E.sourceFinancialPolicySHA256DataV5(prior?.policy??base)},reserved:{feeAtomic:'900',valueAtomic:'700'},limits:{maximumTotalSuccessorPools:'2',maximumSourcesPerWallet:'3',maximumTotalMixedSources:'2',...limits},policy:{...base,...policy},issuedAt:now+(prior?1:0),nonce:h(prior?'5':'4'),...more};return {...raw,epochId:E.sourceFinancialEpochIdDataV5(raw)};
}
test('finite November window preserves monetary ceilings, old wire and cumulative reservations',()=>{
 const old=frame(),wire=JSON.stringify(old);assert.equal(JSON.stringify(E.normalizeSourceFinancialEpochDataV5(old)),wire);
 const next=frame(old,{maximumSourcesPerWallet:'4',operationWindowV17:window()},{expiresAt:end});
 const accepted=E.assertSourceFinancialEpochTransitionDataV5(base,old,next);assert.equal(accepted.policy.expiresAt,end);assert.deepEqual(accepted.reserved,old.reserved);
 assert.equal(accepted.limits.maximumSourcesPerWallet,'4');assert.equal(JSON.stringify(old),wire);
 assert.equal(E.normalizeSourceFinancialEpochDataV5(accepted).epochId,accepted.epochId);
});
test('long period needs explicit window and cannot raise any monetary ceiling',()=>{
 const old=frame();assert.throws(()=>E.normalizeSourceFinancialEpochDataV5(frame(old,{}, {expiresAt:end})),/MAXIMUM_PERIOD/);
 for(const field of ['maximumFeePerTransactionAtomic','maximumTotalFeeAtomic','maximumValuePerTransactionAtomic','maximumTotalValueAtomic']){
  const policy={...base,[field]:(BigInt(base[field])+1n).toString(),expiresAt:end};
  const w={...window(),spendingPolicySHA256:W.operationSpendingPolicySHA256V17(policy)};
  assert.throws(()=>E.assertSourceFinancialEpochTransitionDataV5(base,old,frame(old,{operationWindowV17:w},policy)),/SPENDING_CHANGED/);
 }
});
test('window rejects unbounded duration, future authorization, changed deadline and changed digest',()=>{
 for(const w of [{...window(),expiresAt:now+W.MAX_OPERATION_WINDOW_MS_V17+1},{...window(),authorizedAt:now+10},{...window(),expiresAt:end-1},{...window(),spendingPolicySHA256:h('e')}])assert.throws(()=>E.normalizeSourceFinancialEpochDataV5(frame(null,{operationWindowV17:w},{expiresAt:end})));
 let called=false;const raw=window();Object.defineProperty(raw,'expiresAt',{enumerable:true,get(){called=true;return end;}});assert.throws(()=>W.normalizeOperationWindowDataV17(raw),/GETTER/);assert.equal(called,false);
 assert.throws(()=>W.normalizeOperationWindowDataV17(new Proxy(window(),{getPrototypeOf(){throw Error('trap');}})),/OBJECT/);
});
test('actual operator signature binds finite window, changing its date invalidates the signature',()=>{
 const pair=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=pair.publicKey.export({format:'jwk'}),pub=ECDH.convertKey(Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]),'secp256k1',undefined,undefined,'compressed').toString('hex');
 const value=frame(null,{operationWindowV17:window()},{expiresAt:end}),signature=sign('sha256',E.sourceFinancialEpochMessageV5(value),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}),order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));
 if(s>order/2n)Buffer.from((order-s).toString(16).padStart(64,'0'),'hex').copy(signature,32);
 assert.equal(verifySourceFinancialEpochSignatureDataV5(value,signature.toString('hex'),pub).policy.expiresAt,end);
 const changed=frame(null,{operationWindowV17:{...window(),expiresAt:end+1}},{expiresAt:end+1});assert.throws(()=>verifySourceFinancialEpochSignatureDataV5(changed,signature.toString('hex'),pub),/SIGNATURE/);
});
test('Source authority reaches signed closing boundary; legacy remains nine hours',()=>{
 const epoch=frame(null,{operationWindowV17:window()},{expiresAt:end});const history={epochId:epoch.epochId,history:[{epoch}],limits:epoch.limits,effectivePolicy:epoch.policy};
 assert.equal(W.operationSourceDeadlineDataV17(history,now),end-1800000);
 assert.equal(W.operationSourceDeadlineDataV17({...history,limits:{}},now),now+9*3600000);
 assert.throws(()=>W.operationSourceDeadlineDataV17({...history,epochId:h('f')},now),/ORIGINAL_HISTORY/);
 assert.throws(()=>W.operationSourceDeadlineDataV17(history,end-1800000),/CLOSED/);
});
