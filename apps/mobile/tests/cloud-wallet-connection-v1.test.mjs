import test from 'node:test';
import assert from 'node:assert/strict';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {nativeWalletAuthMessageV1,verifyNativeWalletAuthV1} from '../../../packages/crypto/src/native-wallet-auth-v1.mjs';

test('cloud connection discovery uses the unlocked session and rejects wrong wallet/origin, ambiguity and a session closed mid-request',async t=>{
 const key=new Uint8Array(32).fill(1),publicKey=hex.encode(secp256k1.getPublicKey(key,false)),origin='https://api.lianum.oryontechnology.com';let active=true,signed=0,mode='valid';
 t.mock.module('react-native',{exports:{AppState:{currentState:'active'}}});
 t.mock.module('expo-crypto',{exports:{}});
 t.mock.module('../src/custody/wallet-session-v1.ts',{exports:{walletSessionStatusV1:()=>({active,publicKey}),signWalletSessionNativeRequestV1:(challenge,expected)=>{signed++;return hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,{...expected,devicePublicKey:publicKey}),key,{prehash:true,lowS:true}));}}});
 const descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin,pairingId:'cloud-wallet-source',devicePublicKey:publicKey,deadlineMs:Date.now()+3600000,chainId:'11155111'};
 for(const name of ['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'])descriptor[name]='1'.repeat(64);
 for(const [i,name]of ['pool','state','native','math'].entries())descriptor[name]='0x'+String(i+1).repeat(40);
 const packet={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n',certificateSHA256:'1'.repeat(64)}};
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push(url);assert.equal(options.redirect,'error');const body=JSON.parse(options.body);
  if(url===origin+'/v1/auth/challenge'){
   assert.equal(body.path,'/v1/wallet/connections');const issuedAt=Date.now();
   if(mode==='lock-challenge')active=false;
   return Response.json({profile:'LIANUM_NATIVE_WALLET_REQUEST_V1',...body,method:'POST',nonce:'2'.repeat(64),issuedAt,expiresAt:issuedAt+60000});
  }
  assert.equal(url,origin+'/v1/wallet/connections');assert.equal(body.body,'{}');
  assert.ok(verifyNativeWalletAuthV1(body.challenge,body.signature,{origin,path:'/v1/wallet/connections',bodySHA256:body.challenge.bodySHA256,devicePublicKey:publicKey},Date.now()));
  const value={profile:'LIANUM_CLOUD_CONNECTIONS_V1',devicePublicKey:publicKey,connections:[structuredClone(packet)]};
  if(mode==='none')value.connections=[];
  if(mode==='ambiguous')value.connections.push(packet);
  if(mode==='foreign')value.connections[0].descriptor.devicePublicKey='04'+'2'.repeat(128);
  if(mode==='origin')value.connections[0].descriptor.origin='https://other.example';
  if(mode==='secret')value.connections[0].privateKey='PRIVATE';
  if(mode==='lock-result')active=false;
  return Response.json(value);
 });
 const {readCloudPagedConnectionV1}=await import('../src/api/cloud-wallet-connection-v1.ts');
 const signal=new AbortController().signal;
 const result=JSON.parse(await readCloudPagedConnectionV1(signal));assert.equal(result.descriptor.devicePublicKey,publicKey);assert.equal(signed,1);assert.equal(requests.length,2);
 for(const value of ['none','ambiguous','foreign','origin','secret','lock-result','lock-challenge']){active=true;mode=value;const before=signed;await assert.rejects(readCloudPagedConnectionV1(signal));if(value==='lock-challenge')assert.equal(signed,before);}
 active=true;mode='valid';const controller=new AbortController();controller.abort();const before=requests.length;await assert.rejects(readCloudPagedConnectionV1(controller.signal));assert.equal(requests.length,before);
});
