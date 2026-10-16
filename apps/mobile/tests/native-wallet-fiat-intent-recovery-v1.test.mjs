import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {normalizeNativeWalletFiatIntentV1,selectNativeWalletFiatIntentV1} from '../src/native-wallet/native-wallet-fiat-intent-v1.mjs';
const intent=extra=>({requestId:randomUUID(),flow:'BUY',asset:'ETH',network:'ethereum',fiatCurrency:'EUR',amount:'10.00',walletAddress:'0x'+'12'.repeat(20),...extra});
test('lost checkout response reuses its durable request ID across reopening and user retry; amount canonicalization matches the server',()=>{
 const first=normalizeNativeWalletFiatIntentV1(intent()),journal=JSON.parse(JSON.stringify({requests:[first],orders:[]})),next=intent({amount:'10'});
 assert.equal(selectNativeWalletFiatIntentV1(journal.requests,journal.orders,next).requestId,first.requestId);
 assert.equal(selectNativeWalletFiatIntentV1(journal.requests,journal.orders,next).amount,'10');
 assert.equal(selectNativeWalletFiatIntentV1(journal.requests,[{requestId:first.requestId}],next).requestId,next.requestId,'explicit later purchase can create an independent intent after its original order is known');
 assert.throws(()=>selectNativeWalletFiatIntentV1(journal.requests,[],{...first,amount:'11'}),/FIAT_ORDER_BINDING/);
 assert.throws(()=>selectNativeWalletFiatIntentV1([first,{...first,requestId:randomUUID()}],[],next),/FIAT_ORDER_AMBIGUOUS/);
 for(const changed of [{walletAddress:'0x'+'34'.repeat(20)},{flow:'SELL',amount:'0.01'},{asset:'BTC',network:'bitcoin'}])assert.equal(selectNativeWalletFiatIntentV1([first],[],{...next,...changed}).requestId,next.requestId);
});
