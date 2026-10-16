/** DATA checks only; these fixtures do not grant signing or prove a withdrawal. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonical} from '@lianum/engine/crypto/privacy';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {sourceFinancialPolicySHA256DataV5} from '../../../src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {readSepoliaExpiredWithdrawalCommandDataV10 as read,assertSepoliaExpiredWithdrawalHistoryDataV10 as history,assertSepoliaExpiredWithdrawalLiveDataV10 as live} from '../../../src/chains/public-testnet/sepolia-expired-withdrawal-command-v10.mjs';
const h=s=>createHash('sha256').update(s).digest('hex'),sha=s=>createHash('sha256').update(canonical(s)).digest('hex'),address=n=>'0x'+String(n).repeat(40),word=n=>BigInt(n).toString(16).padStart(64,'0'),chunks=h=>h.match(/.{8}/g).map(v=>BigInt('0x'+v).toString());
function fixture(){
 const sourceDescriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://127.0.0.1:9448',pairingId:'expired-source-k-data',devicePublicKey:'0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',deadlineMs:1000,chainId:'11155111',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,address(i+1)]))};
 const sourceOwnerCheckpoint={profile:'DEVICE_PAGED_OWNER_DURABLE_CHECKPOINT_V3',descriptorSHA256:sha(sourceDescriptor),revision:1,dataSHA256:h('owner'),public:{}},policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:h('keyset'),account:address(5),maximumFeePerTransactionAtomic:'20',maximumTotalFeeAtomic:'200',maximumValuePerTransactionAtomic:'100',maximumTotalValueAtomic:'1000',expiresAt:5000},policySHA256=sourceFinancialPolicySHA256DataV5(policy),epoch={epochId:h('epoch'),policy};
 const binding={profile:'DEVICE_PAGED_EXPIRED_WITHDRAWAL_SCOPE_V10',brokerId:h('broker'),sourceDescriptor,sourceIdentity:h('source'),sourceJournalRevision:2,sourceJournalDataSHA256:h('journal'),sourceOwnerCheckpointSHA256:sha(sourceOwnerCheckpoint),epochId:epoch.epochId,policySHA256,sponsorExpiresAtMs:5000,maximumDeadlineMs:4000,targetRootId:h('note-root'),targetRevision:1,targetCommitment:h('commitment'),targetNullifier:h('nullifier'),maximumAmountAtomic:'100',recipient:address(6),graphOutput:null,sourceJournalPath:'/private/source/operations.vault',sourceOwnerCheckpoint};
 const inputs=[...chunks(sourceDescriptor.scope),...chunks(sourceDescriptor.policy),'2',...chunks(h('merkle-root')),...chunks(binding.targetNullifier),'100',...chunks(binding.recipient.slice(2))];
 const data='0x'+publicKeccak256(Buffer.from('withdraw(bytes,bytes32[])')).subarray(0,4).toString('hex')+word(64)+word(128)+word(1)+'ab'+'0'.repeat(62)+word(39)+inputs.map(word).join('');
 return{binding,epoch,inputs,command:{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',identity:h('broker-identity'),jobId:'withdraw-broker',action:'WITHDRAW_W39',to:sourceDescriptor.pool,value:'0',data,expiresAt:3000,expiredMixedWithdrawalV10:binding}};
}
test('withdraw-only command fixes note, pool, recipient, amount and signed operator epoch',()=>{
 const {command,binding,inputs,epoch}=fixture();assert.deepEqual(read(command),{binding,inputs});
 assert.doesNotThrow(()=>live(command,binding.policySHA256,binding.epochId,2000));
 const rows=[{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4',policySHA256:binding.policySHA256,command}];assert.doesNotThrow(()=>history(rows,[{epoch}]));
 // Expired retained wires can be observed; no fresh key/POST is admitted.
 assert.doesNotThrow(()=>history(rows,[{epoch}]));assert.throws(()=>live(command,binding.policySHA256,binding.epochId,3000),/EXPIRED/);
 assert.throws(()=>live(command,h('other-policy'),binding.epochId,2000),/CURRENT_POLICY/);assert.throws(()=>live(command,binding.policySHA256,h('other-epoch'),2000),/CURRENT_EPOCH/);
 assert.throws(()=>history(rows,[]),/SIGNED_EPOCH/);
 assert.throws(()=>history(rows,[{epoch:{...epoch,policy:{...epoch.policy,maximumTotalFeeAtomic:'201'}}}]),/SIGNED_POLICY/);
});
test('substituted withdrawal terms and ambiguous ABI cannot enter the signing lane',()=>{
 for(const mutate of [c=>c.action='FUND_D26',c=>c.value='1',c=>c.to=address(7),c=>c.expiresAt=4001,c=>c.executorPayout={},c=>c.expiredMixedWithdrawalV10.recipient=address(7),c=>c.expiredMixedWithdrawalV10.maximumAmountAtomic='101',c=>c.expiredMixedWithdrawalV10.targetNullifier=h('other-note'),c=>c.expiredMixedWithdrawalV10.sourceDescriptor.scope=h('other-scope'),c=>c.expiredMixedWithdrawalV10.extra='any-signer',c=>c.data+='00',c=>c.data=c.data.slice(0,10)+word(0)+c.data.slice(74),c=>c.data=c.data.slice(0,10+64)+word(96)+c.data.slice(10+128)]){
  const {command}=fixture();mutate(command);assert.throws(()=>read(command));
 }
 assert.equal(read({profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',action:'WITHDRAW_W39'}),null,'legacy commands retain their existing issuer path');
});
