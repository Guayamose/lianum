/** Defense in depth for a command already issued by the Original Source owner.
 * DATA validation here cannot issue a broker, restore consent or grant signing. */
import assert from 'node:assert/strict';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {normalizePagedExpiredMixedWithdrawalBindingDataV10} from '../../operations/recovery/paged-expired-mixed-withdrawal-data-v10.mjs';
import {sourceFinancialPolicySHA256DataV5} from './sepolia-source-financial-epoch-data-v5.mjs';

function withdrawalInputs(calldata){
 assert.ok(typeof calldata==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(calldata)&&calldata.length<=4194304,'SEPOLIA_EXPIRED_WITHDRAWAL_CALLDATA');
 assert.equal(calldata.slice(2,10),publicKeccak256(Buffer.from('withdraw(bytes,bytes32[])')).subarray(0,4).toString('hex'),'SEPOLIA_EXPIRED_WITHDRAWAL_SELECTOR');
 const data=calldata.slice(10),word=at=>{assert.ok(Number.isSafeInteger(at)&&at>=0&&at+64<=data.length,'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');return BigInt('0x'+data.slice(at,at+64));};
 assert.equal(word(0),64n,'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');
 const proofLength=word(128);assert.ok(proofLength>0n&&proofLength<=1048576n,'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');
 const padded=Number((proofLength+31n)/32n*32n),start=(96+padded)*2;
 assert.equal(word(64),BigInt(start/2),'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');
 assert.ok(/^0*$/.test(data.slice(192+Number(proofLength)*2,start)),'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');
 assert.equal(word(start),39n,'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');assert.equal(start+64+39*64,data.length,'SEPOLIA_EXPIRED_WITHDRAWAL_ABI');
 return P.normalizeDevicePagedPublicInputsV3('withdraw',Array.from({length:39},(_,i)=>word(start+64+i*64).toString()));
}
export function readSepoliaExpiredWithdrawalCommandDataV10(command){
 if(!Object.hasOwn(command,'expiredMixedWithdrawalV10'))return null;
 assert.ok(command.profile==='ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4'&&command.action==='WITHDRAW_W39'&&command.value==='0'&&!Object.hasOwn(command,'executorPayout'),'SEPOLIA_EXPIRED_WITHDRAWAL_COMMAND');
 const binding=normalizePagedExpiredMixedWithdrawalBindingDataV10(command.expiredMixedWithdrawalV10),descriptor=binding.sourceDescriptor,inputs=withdrawalInputs(command.data);
 assert.equal(command.to,descriptor.pool,'SEPOLIA_EXPIRED_WITHDRAWAL_POOL');assert.ok(Number.isSafeInteger(command.expiresAt)&&command.expiresAt>0&&command.expiresAt<=binding.maximumDeadlineMs,'SEPOLIA_EXPIRED_WITHDRAWAL_DEADLINE');
 assert.equal(P.devicePagedWordsHexV3(inputs,0),descriptor.scope,'SEPOLIA_EXPIRED_WITHDRAWAL_SCOPE');assert.equal(P.devicePagedWordsHexV3(inputs,8),descriptor.policy,'SEPOLIA_EXPIRED_WITHDRAWAL_POLICY');
 assert.equal(P.devicePagedWordsHexV3(inputs,25),binding.targetNullifier,'SEPOLIA_EXPIRED_WITHDRAWAL_NOTE');assert.equal(inputs[33],binding.maximumAmountAtomic,'SEPOLIA_EXPIRED_WITHDRAWAL_AMOUNT');assert.equal('0x'+P.devicePagedWordsHexV3(inputs,34,5),binding.recipient,'SEPOLIA_EXPIRED_WITHDRAWAL_RECIPIENT');
 if(binding.graphOutput?.sparseOutput)assert.equal(P.devicePagedWordsHexV3(inputs,17),binding.graphOutput.outputsCommitment,'SEPOLIA_EXPIRED_WITHDRAWAL_OUTPUT_ROOT');
 return Object.freeze({binding,inputs});
}
/** Expired signed wires remain readable; their finite signed epoch must exist. */
export function assertSepoliaExpiredWithdrawalHistoryDataV10(rows,epochs){
 for(const row of rows){const checked=readSepoliaExpiredWithdrawalCommandDataV10(row.command);if(!checked)continue;
  assert.ok(['ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4','ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8'].includes(row.profile),'SEPOLIA_EXPIRED_WITHDRAWAL_ROW');
  const {binding}=checked,epoch=epochs.find(row=>row.epoch.epochId===binding.epochId)?.epoch;assert.ok(epoch,'SEPOLIA_EXPIRED_WITHDRAWAL_SIGNED_EPOCH');assert.equal(row.policySHA256,binding.policySHA256,'SEPOLIA_EXPIRED_WITHDRAWAL_SIGNED_POLICY');assert.equal(sourceFinancialPolicySHA256DataV5(epoch.policy),binding.policySHA256,'SEPOLIA_EXPIRED_WITHDRAWAL_SIGNED_POLICY');assert.equal(epoch.policy.expiresAt,binding.sponsorExpiresAtMs,'SEPOLIA_EXPIRED_WITHDRAWAL_SIGNED_PERIOD');
 }
}
export function assertSepoliaExpiredWithdrawalLiveDataV10(command,policySHA256,epochId,now=Date.now()){
 const checked=readSepoliaExpiredWithdrawalCommandDataV10(command);if(!checked)return;
 const {binding}=checked;assert.equal(binding.policySHA256,policySHA256,'SEPOLIA_EXPIRED_WITHDRAWAL_CURRENT_POLICY');assert.equal(binding.epochId,epochId,'SEPOLIA_EXPIRED_WITHDRAWAL_CURRENT_EPOCH');assert.ok(Number.isSafeInteger(now)&&now<command.expiresAt&&now<binding.maximumDeadlineMs&&now<binding.sponsorExpiresAtMs,'SEPOLIA_EXPIRED_WITHDRAWAL_EXPIRED');
}
