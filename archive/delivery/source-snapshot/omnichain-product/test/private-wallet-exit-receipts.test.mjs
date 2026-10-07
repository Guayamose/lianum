import test from 'node:test';
import assert from 'node:assert/strict';
import {isPrivateWalletExitReceipt} from '../scripts/lib/private-wallet-exit-receipts.mjs';
const receipt=label=>({kind:'PRIVATE_EVM_TRANSACTION_RECEIPT_HEADER',label,receipt:{status:'0x1'}});
test('withdrawal verifier/library deployments do not count as withdrawals',()=>{
  const rows=['RelationsLib','ZKTranscriptLib','HonkVerifier'].map(name=>receipt('deploy withdraw_balance.sol:'+name));
  assert.equal(rows.filter(r=>/withdrawal|withdraw_balance/.test(r.label)).length,3);
  assert.equal(rows.filter(isPrivateWalletExitReceipt).length,0);
});
test('actual balance and original-recipient withdrawal routes are recognized',()=>{
  for(const label of ['exact wallet withdraw_balance','sol exact recipient withdrawal','btc exact recipient withdrawal'])assert.equal(isPrivateWalletExitReceipt(receipt(label)),true);
});
test('unrelated or malformed evidence is not a withdrawal',()=>{
  for(const row of [null,{},receipt('exact wallet deposit_balance'),receipt('recursive terminal and fresh permits issue payouts'),{kind:'deployment',label:'exact wallet withdraw_balance'}])assert.equal(isPrivateWalletExitReceipt(row),false);
});
