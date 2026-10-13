import test from 'node:test';
import assert from 'node:assert/strict';
import * as btc from '@scure/btc-signer';
import {base64} from '@scure/base';
import * as sol from 'micro-sol-signer';
import * as W from '../src/native-wallet-v1.mjs';
// Published BIP39/BIP84 test mnemonic, never a funded account.
const entropy=new Uint8Array(16);
test('standard recovery preserves three addresses and testnet is explicit',()=>{
 const phrase=W.nativeMnemonicV1(entropy);assert.equal(phrase,'abandon '.repeat(11)+'about');assert.deepEqual(W.nativeEntropyV1(phrase),entropy);
 const accounts=W.deriveNativeAccountsV1(entropy);assert.equal(accounts[0].address,'0x9858EfFD232B4033E47d90003D41EC34EcaEda94');assert.equal(accounts[1].address,'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');assert.equal(accounts[2].address,'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
 assert.deepEqual(W.deriveNativeAccountsV1(W.nativeEntropyV1(phrase)),accounts);assert.match(W.deriveNativeAccountsV1(entropy,'testnet')[1].address,/^tb1/);assert.throws(()=>W.validateNativeAddressV1('bitcoin-mainnet',W.deriveNativeAccountsV1(entropy,'testnet')[1].address));assert.throws(()=>W.nativeEntropyV1('abandon '.repeat(12)),/RECOVERY_INVALID/);
 assert.equal(W.parseNativeAmountV1('0.000000000000000001',18),'1');assert.throws(()=>W.parseNativeAmountV1('0.000000001',8),/PRECISION/);
});
test('ETH signer binds network, recipient, value and maximum fee to wire',()=>{
 const a=W.deriveNativeAccountV1(entropy,'ethereum-sepolia'),t=W.buildNativeWalletTransactionV1(a,{chainId:'11155111',nonce:'0',to:'0x0000000000000000000000000000000000000001',value:'100',gasLimit:'21000',maxFeePerGas:'1000000000',maxPriorityFeePerGas:'1000000000'});
 W.validateNativeSendReviewV1(a,t,t.to,'100','21000000000000');const signed=W.signNativeWalletTransactionV1(entropy,a,t);assert.match(signed.id,/^0x[0-9a-f]{64}$/);assert.deepEqual(W.validateNativeWalletSignedTransactionV1(a,t,signed.rawTransaction),signed);
 assert.throws(()=>W.validateNativeSendReviewV1(a,t,t.to,'101','21000000000000'),/BINDING/);assert.throws(()=>W.signNativeWalletTransactionV1(entropy,a,{...t,chainId:'1'}),/NETWORK_BINDING/);assert.throws(()=>W.validateNativeWalletSignedTransactionV1(a,{...t,value:'101'},signed.rawTransaction),/BINDING/);assert.throws(()=>W.signNativeWalletTransactionV1(entropy,a,{...t,data:'0x1234'}),/TRANSACTION_INVALID/);
});
test('BTC signer proves input amounts from previous wire and owns all change',()=>{
 const a=W.deriveNativeAccountV1(entropy,'bitcoin-testnet'),prev=new btc.Transaction({allowUnknownInputs:true});prev.addInput({txid:'01'.repeat(32),index:0});prev.addOutputAddress(a.address,10000n,btc.TEST_NETWORK);
 const input={txid:prev.id,vout:0,valueAtomic:'10000',scriptPubKey:W.bitcoinScriptV1(a.address,'testnet'),previousTxHex:prev.hex};const t=W.buildNativeWalletTransactionV1(a,{inputs:[input],outputs:[{address:a.address,valueAtomic:'9000',scriptPubKey:input.scriptPubKey}]});W.validateNativeSendReviewV1(a,t,a.address,'9000','1000');const signed=W.signNativeWalletTransactionV1(entropy,a,t);assert.deepEqual(W.validateNativeWalletSignedTransactionV1(a,t,signed.rawTransaction),signed);
 assert.throws(()=>W.signNativeWalletTransactionV1(entropy,a,{...t,inputs:[{...input,valueAtomic:'9001'}]}),/PREVOUT_BINDING/);assert.throws(()=>W.signNativeWalletTransactionV1(entropy,a,{...t,inputs:[{...input,previousTxHex:undefined}]}),/PREVOUT_REQUIRED/);assert.throws(()=>W.validateNativeSendReviewV1(a,t,a.address,'9000','1'),/FEE_BINDING/);
});
test('SOL rejects extra instructions and verifies the original transfer signature',()=>{
 const a=W.deriveNativeAccountV1(entropy,'solana-devnet'),t=W.buildNativeWalletTransactionV1(a,{to:'11111111111111111111111111111111',lamports:'42',recentBlockhash:'11111111111111111111111111111111',lastValidBlockHeight:'100'});W.validateNativeSendReviewV1(a,t,t.to,'42','5000');const signed=W.signNativeWalletTransactionV1(entropy,a,t);assert.deepEqual(W.validateNativeWalletSignedTransactionV1(a,t,signed.rawTransaction),signed);
 const message=sol.Message.decode(base64.decode(t.messageBase64));message.instructions.push(message.instructions[0]);assert.throws(()=>W.signNativeWalletTransactionV1(entropy,a,{...t,messageBase64:base64.encode(sol.Message.encode(message))}),/TRANSACTION_BINDING/);assert.throws(()=>W.validateNativeWalletSignedTransactionV1(a,{...t,lamports:'43'},signed.rawTransaction),/BINDING/);
});
