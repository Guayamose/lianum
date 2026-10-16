import test from 'node:test';
import assert from 'node:assert/strict';
import * as SDK from '@lianum/sdk';
test('public SDK exposes proposal and finite read without a financial issuer',()=>{
 for(const name of ['createDevicePagedAgentApiV4','createDevicePagedAgentNativeProposalV4','createDevicePagedAgentProposalLinkV4'])assert.equal(typeof SDK[name],'function');
 for(const name of ['execute','submit','authorize','signWallet','createWallet','WalletSDK'])assert.equal(Object.hasOwn(SDK,name),false);
});
