import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deriveNativeAccountsV1,buildNativeWalletTransactionV1,nativeJsonHashV1} from '../../../packages/crypto/src/native-wallet-v1.mjs';

test('environment persists per owner, isolates equal addresses and invalidates an old reviewed quote before signing',async t=>{
 const owner='04'+'03'.repeat(64),entropy=new Uint8Array(16),accounts={mainnet:deriveNativeAccountsV1(entropy,'mainnet'),testnet:deriveNativeAccountsV1(entropy,'testnet')},storage=new Map(),enabled=new Set(['mainnet']),requests=[];let signs=0,activations=0;
 t.mock.module('react-native',{exports:{AppState:{currentState:'active'}}});t.mock.module('expo-crypto',{exports:{randomUUID}});
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,getItemAsync:async k=>storage.get(k)??null,setItemAsync:async(k,v)=>storage.set(k,v)}});
 t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{walletSessionStatusV1:()=>({active:true,publicKey:owner})}});
 t.mock.module('../src/native-wallet/native-wallet-public-configuration-v1.ts',{exports:{nativeWalletPublicConfigurationV1:{network:'mainnet'}}});
 t.mock.module('../src/custody/native-wallet-custody-v1.ts',{exports:{
  readNativeWalletCustodyV1:async(signal,network='mainnet')=>({status:enabled.has(network)?'READY':'NETWORK_REQUIRED',accounts:enabled.has(network)?accounts[network]:[]}),
  enableNativeWalletNetworkV2:async network=>{activations++;enabled.add(network);return{status:'READY',accounts:accounts[network]};},
  createNativeWalletCustodyV1:async()=>{},restoreNativeWalletCustodyV1:async()=>{},revealNativeWalletMnemonicV1:async()=>{},authorizeNativeWalletSendV1:async()=>{signs++;throw Error('HOST_MUST_NOT_SIGN_STALE_QUOTE');},
 }});
 t.mock.module('../src/api/public-wallet-session-api-v1.ts',{exports:{publicWalletSessionOriginV1:()=> 'https://wallet.example',readPublicWalletJsonV1:async()=>{},requestPublicWalletSessionV1:async(path,input)=>{
  requests.push({path,input});
  if(path==='/v1/native/account')return{address:input.address,network:{id:input.networkId},balanceAtomic:input.network==='mainnet'?'100':'1',spendableAtomic:input.network==='mainnet'?'100':'1',reservedAtomic:'0'};
  if(path==='/v1/native/prepare'){
   const transaction=buildNativeWalletTransactionV1(input.account,{chainId:input.account.network==='mainnet'?'1':'11155111',nonce:'0',to:input.recipient,value:input.amountAtomic,gasLimit:'21000',maxFeePerGas:'1000000000',maxPriorityFeePerGas:'1000000000'}),issuedAt=Date.now(),q={profile:'NATIVE_WALLET_SEND_QUOTE_V1',id:input.operationId,networkId:input.account.networkId,network:{id:input.account.networkId},account:input.account,recipient:input.recipient,amountAtomic:input.amountAtomic,fee:{maximumAtomic:'21000000000000'},transaction,issuedAt,expiresAt:issuedAt+120000};return{...q,quoteSHA256:nativeJsonHashV1(q)};
  }
  throw Error('HOST_UNEXPECTED_HTTP');
 }}});
 const C=await import('../src/native-wallet/native-wallet-controller.ts'),port=C.nativeWalletUiPortV1,signal=new AbortController().signal;
 assert.equal(await C.readNativeWalletEnvironmentV2(signal),'mainnet');assert.deepEqual((await port.readState(signal)).accounts,accounts.mainnet);
 const quote=await port.prepareSend({account:accounts.mainnet[0],recipient:'0x0000000000000000000000000000000000000001',amountAtomic:'1'},signal);
 assert.equal(await C.selectNativeWalletEnvironmentV2('testnet',signal),'testnet');assert.equal(activations,1);assert.equal(await C.readNativeWalletEnvironmentV2(signal),'testnet');
 await assert.rejects(port.authorizeAndSend(quote,signal),/QUOTE_NOT_ORIGINAL/);assert.equal(signs,0);
 const count=requests.length;await assert.rejects(port.prepareSend({account:accounts.mainnet[0],recipient:quote.recipient,amountAtomic:'1'},signal),/ACCOUNT_BINDING/);assert.equal(requests.length,count,'a mainnet account cannot be prepared in the testnet context');
 const balances=await port.readBalances(signal);assert.equal(balances.length,3);assert.ok(balances.every(r=>r.account.network==='testnet'&&r.balance.balanceAtomic==='1'));
 assert.equal(accounts.mainnet[0].address,accounts.testnet[0].address,'EVM address equality is not network identity');
 const j={version:1,owner,transfers:[...['mainnet','testnet'].map(network=>({id:network,quote:{account:accounts[network][0]},transfer:{id:network,networkId:accounts[network][0].networkId,status:'CONFIRMED',amountAtomic:'1'}}))],fiatOrders:[],fiatRequests:[]};storage.set('activity.'+owner,JSON.stringify(j));
 assert.deepEqual((await port.readState(signal)).transactions.map(t=>t.id),['testnet']);await C.selectNativeWalletEnvironmentV2('mainnet',signal);assert.deepEqual((await port.readState(signal)).transactions.map(t=>t.id),['mainnet']);
 assert.equal(JSON.parse(storage.get('activity.'+owner)).transfers.length,2,'switching only filters the journal; no history is deleted');
 assert.equal(requests.some(r=>r.path==='/v1/native/submit'),false);assert.equal(signs,0);
});
