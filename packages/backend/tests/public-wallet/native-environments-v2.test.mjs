/** Real HTTP signatures, gateway and durable journals; chain adapters are HOST ports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {deriveNativeAccountV1,buildNativeWalletTransactionV1,signNativeWalletTransactionV1} from '@lianum/crypto/native-wallet-v1';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../crypto/src/native-wallet-auth-v1.mjs';
test('adding testnet preserves the existing mainnet journal and routes signed mutations to separate Original journals',async t=>{
 let sends=0;const directory=await mkdtemp(join(tmpdir(),'lianum-environments-http-')),origin='https://wallet.example',entropy=new Uint8Array(32).fill(7),otherEntropy=new Uint8Array(32).fill(8),key=new Uint8Array(32).fill(9),devicePublicKey=hex.encode(secp256k1.getPublicKey(key,false));let service;
 t.mock.module('../../src/native-wallet/ethereum-v1.mjs',{exports:{ethereumWalletAdapterV1:config=>({identify:async()=>{},balances:async()=>({balanceAtomic:'100000000000000000000',spendableAtomic:'100000000000000000000',pendingAtomic:'0',observed:{blockHash:'0x'+'a'.repeat(64),blockNumber:'1'}}),prepare:async(account,recipient,amountAtomic)=>({transaction:buildNativeWalletTransactionV1(account,{chainId:config.chainId,nonce:'0',to:recipient,value:amountAtomic,gasLimit:'21000',maxFeePerGas:'1000000000',maxPriorityFeePerGas:'1000000000'}),feeAtomic:'21000000000000'}),beforeBroadcast:async()=>{},broadcast:async()=>{sends++;throw Error('HOST_LOST_RESPONSE_AFTER_ACCEPT');},observe:async()=>({status:'UNKNOWN',terminal:false,confirmations:null,blockHash:null,blockNumber:null,feeAtomic:null,errorCode:'NATIVE_WALLET_NETWORK_UNCONFIRMED'})})}});
 const {createPublicWalletHttpServiceV1}=await import('../../src/public-wallet/http-service-v1.mjs');
 t.after(async()=>{await service?.close();await rm(directory,{recursive:true,force:true});entropy.fill(0);otherEntropy.fill(0);key.fill(0);});
 const configs=ids=>({networks:ids.map(id=>({id,endpoint:'https://host-native-fixture.example'}))}),mainIds=['ethereum-mainnet','bitcoin-mainnet','solana-mainnet'],testIds=['ethereum-sepolia','bitcoin-testnet','solana-devnet'];
 let url;
 async function start(configuration){service=await createPublicWalletHttpServiceV1({origin,directory,nativeConfiguration:configuration});const address=await service.listen();url='http://127.0.0.1:'+address.port;}
 async function request(path,value,status=200){const body=JSON.stringify(value),expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey},challengeResponse=await fetch(url+'/v1/auth/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(expected)});assert.equal(challengeResponse.status,200);const challenge=await challengeResponse.json(),signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),key,{prehash:true,lowS:true})),response=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({challenge,signature,body})}),data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
 const main=deriveNativeAccountV1(entropy,'ethereum-mainnet'),testnet=deriveNativeAccountV1(entropy,'ethereum-sepolia'),recipient=deriveNativeAccountV1(otherEntropy,'ethereum-mainnet').address;
 assert.equal(main.address,testnet.address);
 await start(configs(mainIds));const mainQuote=await request('/v1/native/prepare',{account:main,recipient,amountAtomic:'1000000000000000'});await service.close();service=null;
 const owner=(await readdir(join(directory,'native')))[0],mainPath=join(directory,'native',owner,'native-wallet.json'),before=await readFile(mainPath);
 await start(configs([...mainIds,...testIds]));const mainBalance=await request('/v1/native/account',main);assert.equal(mainBalance.spendableAtomic,'0');assert.equal(mainBalance.reservedAtomic,'1021000000000000');
 const testBalance=await request('/v1/native/account',testnet);assert.equal(testBalance.reservedAtomic,'0');assert.equal(testBalance.spendableAtomic,'100000000000000000000');assert.deepEqual(await readFile(mainPath),before,'opening both environments never rewrites the original fingerprint or operations');
 const testQuote=await request('/v1/native/prepare',{account:testnet,recipient,amountAtomic:'1'});const testPath=join(directory,'native',owner,'testnet-v2','native-wallet.json');assert.notEqual(JSON.parse(await readFile(testPath)).configurationSHA256,JSON.parse(before).configurationSHA256);
 const wrong=await request('/v1/native/cancel',{id:mainQuote.id,networkId:testnet.networkId},400);assert.match(wrong.error,/QUOTE_NOT_FOUND/);assert.deepEqual(await readFile(mainPath),before,'a signed testnet cancellation cannot mutate the mainnet journal');
 const wrongChain=await request('/v1/native/cancel',{id:mainQuote.id,networkId:'bitcoin-mainnet'},400);assert.match(wrongChain.error,/NETWORK_BINDING/);assert.deepEqual(await readFile(mainPath),before);
 await request('/v1/native/cancel',{id:testQuote.id,networkId:testnet.networkId});assert.deepEqual(await readFile(mainPath),before);
 const mainCancel=await request('/v1/native/cancel',{id:mainQuote.id});assert.equal(mainCancel.errorCode,'NATIVE_WALLET_QUOTE_CANCELLED','legacy mainnet clients keep the same routing');const afterMainCancel=await readFile(mainPath);
 const next=await request('/v1/native/prepare',{account:testnet,recipient,amountAtomic:'2'}),signed=signNativeWalletTransactionV1(entropy,testnet,next.transaction);
 const wrongSubmit=await request('/v1/native/submit',{quoteId:next.id,rawTransaction:signed.rawTransaction,networkId:'bitcoin-testnet'},400);assert.match(wrongSubmit.error,/NETWORK_BINDING/);assert.equal(sends,0);
 const submitted=await request('/v1/native/submit',{quoteId:next.id,rawTransaction:signed.rawTransaction,networkId:testnet.networkId});assert.equal(submitted.status,'UNKNOWN');assert.equal(sends,1);
 await request('/v1/native/submit',{quoteId:next.id,rawTransaction:signed.rawTransaction,networkId:testnet.networkId});assert.equal(sends,1,'an uncertain testnet submission is never broadcast again');
 const observed=await request('/v1/native/status',{id:next.id,networkId:testnet.networkId});assert.equal(observed.networkId,testnet.networkId);assert.equal(sends,1);assert.deepEqual(await readFile(mainPath),afterMainCancel);
 await service.close();service=null;await start(configs([...mainIds,...testIds]));const recovered=await request('/v1/native/status',{id:next.id,networkId:testnet.networkId});assert.equal(recovered.status,'UNKNOWN');assert.equal(sends,1,'both Original journals reopen with their unchanged configuration identities');
});
