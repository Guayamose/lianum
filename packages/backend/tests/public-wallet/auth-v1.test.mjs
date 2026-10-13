import test from 'node:test';
import assert from 'node:assert/strict';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {createPublicWalletAuthV1} from '../../src/public-wallet/auth-v1.mjs';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../crypto/src/native-wallet-auth-v1.mjs';
test('wallet HTTP authentication binds identity, request and one-use fresh nonce',()=>{
 let now=100000;const origin='https://wallet.example',auth=createPublicWalletAuthV1(origin,{now:()=>now}),key=new Uint8Array(32).fill(1),devicePublicKey=hex.encode(secp256k1.getPublicKey(key,false)),body=JSON.stringify({id:'an-original-order'}),path='/v1/fiat/orders/read';
 const expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey},challenge=auth.issue(expected),signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected,now),key,{prehash:true,lowS:true}));
 assert.throws(()=>auth.consume(path,{challenge,signature,body:'{}'}),/SIGNATURE/);assert.throws(()=>auth.consume('/v1/native/submit',{challenge,signature,body}),/SIGNATURE/);const accepted=auth.consume(path,{challenge,signature,body});assert.deepEqual(accepted.body,JSON.parse(body));assert.match(accepted.ownerId,/^[0-9a-f]{64}$/);assert.throws(()=>auth.consume(path,{challenge,signature,body}),/REPLAY/);
 const expired=auth.issue(expected);now+=60001;assert.throws(()=>auth.consume(path,{challenge:expired,signature,body}),/REPLAY/);assert.throws(()=>auth.issue({...expected,path:'/admin'}),/BINDING/);auth.close();
});
