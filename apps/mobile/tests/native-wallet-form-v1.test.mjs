import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeWalletAmountAtomicV1,nativeWalletAmountTextV1,nativeWalletFiatEnabledV1,nativeWalletGatewayUrlV1,nativeWalletQuoteReviewV1} from '../src/native-wallet/native-wallet-form-v1.mjs';

test('native amounts preserve atomic units on all three chains without floating point',()=>{
 for(const decimals of [8,9,18]){const atomic=nativeWalletAmountAtomicV1('0.001',decimals);assert.equal(atomic,10n**BigInt(decimals-3)+'');assert.equal(nativeWalletAmountTextV1(atomic,decimals),'0.001');const large='10000000000000000000000000000';assert.equal(nativeWalletAmountAtomicV1(nativeWalletAmountTextV1(large,decimals),decimals),large);}
 assert.equal(nativeWalletAmountAtomicV1('0,00000001',8),'1');
 for(const text of ['0','-1','1e9','1.000000001','0.0012.3','01','Infinity'])assert.throws(()=>nativeWalletAmountAtomicV1(text,8));
});
const account=Object.freeze({chain:'ethereum',network:'mainnet',networkId:'ethereum-mainnet',address:'0x'+'12'.repeat(20),publicKey:'04'+'34'.repeat(64),path:"m/44'/60'/0'/0/0"});
const input={recipient:'0x'+'56'.repeat(20),amountAtomic:'1000000000000000'};
const quote=Object.freeze({profile:'NATIVE_WALLET_SEND_QUOTE_V1',id:'original-operation',networkId:account.networkId,network:Object.freeze({id:account.networkId,chain:'ethereum',network:'mainnet',genesisHash:'0x'+'ab'.repeat(32),symbol:'ETH',decimals:18,trust:'RPC_PROVIDER'}),account,recipient:input.recipient,amountAtomic:input.amountAtomic,fee:Object.freeze({assetSymbol:'ETH',maximumAtomic:'21000000000000'}),issuedAt:10000,expiresAt:130000,transaction:Object.freeze({type:'original'}),quoteSHA256:'a'.repeat(64)});
test('send review joins exact account, network, destination, atomic amount and fee without mutating the original quote',()=>{
 const review=nativeWalletQuoteReviewV1(quote,account,input,10001);assert.equal(review.amount,'0.001');assert.equal(review.maximumFee,'0.000021');assert.equal(review.maximumTotal,'0.001021');assert.equal(quote.transaction.type,'original');
 for(const change of [{recipient:account.address},{amountAtomic:'2000000000000000'},{networkId:'ethereum-sepolia'},{account:{...account,path:"m/44'/60'/0'/0/1"}},{network:{...quote.network,network:'testnet'}},{fee:{assetSymbol:'BTC',maximumAtomic:'1'}}])assert.throws(()=>nativeWalletQuoteReviewV1({...quote,...change},account,input,10001));
 assert.throws(()=>nativeWalletQuoteReviewV1(quote,account,input,130000));assert.throws(()=>nativeWalletQuoteReviewV1(quote,account,input,9999));
});
test('gateway only enables matching configured environments and opens the exact provider origin for the chosen flow',()=>{
 const caps={configured:true,environment:'PRODUCTION',buy:true,sell:true,assets:[{asset:'ETH',network:'ethereum',decimals:18}]};assert.equal(nativeWalletFiatEnabledV1(caps,account,'BUY'),true);assert.equal(nativeWalletFiatEnabledV1({...caps,configured:false},account,'BUY'),false);assert.equal(nativeWalletFiatEnabledV1({...caps,environment:'SANDBOX'},account,'SELL'),false);
 const order={profile:'LIANUM_MOONPAY_CHECKOUT_V1',flow:'BUY',environment:'PRODUCTION',checkoutUrl:'https://buy.moonpay.com/?signature=original'};assert.equal(nativeWalletGatewayUrlV1(order),order.checkoutUrl);
 for(const checkoutUrl of ['http://buy.moonpay.com/','https://buy.moonpay.com.evil.example/','https://sell.moonpay.com/','https://buy-sandbox.moonpay.com/','https://user@buy.moonpay.com/','https://buy.moonpay.com:9445/'])assert.throws(()=>nativeWalletGatewayUrlV1({...order,checkoutUrl}));
});
