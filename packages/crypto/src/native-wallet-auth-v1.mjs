import {sha256} from '@noble/hashes/sha2.js';
import {hex} from '@scure/base';
import {secp256k1} from '@noble/curves/secp256k1.js';
export const NATIVE_WALLET_AUTH_ROUTES_V1=Object.freeze([
 '/v1/native/account','/v1/native/prepare','/v1/native/submit','/v1/native/status','/v1/native/cancel',
 '/v1/fiat/sessions','/v1/fiat/orders/reconcile','/v1/fiat/orders/read',
 '/v1/wallet/connections',
]);
export function nativeWalletBodyHashV1(raw){if(typeof raw!=='string'||raw.length>1000000)throw Error('NATIVE_AUTH_BODY');return hex.encode(sha256(new TextEncoder().encode(raw)));}
export function nativeWalletAuthMessageV1(value,expected,now=Date.now()){
 if(!value||value.profile!=='LIANUM_NATIVE_WALLET_REQUEST_V1'||value.method!=='POST'||!NATIVE_WALLET_AUTH_ROUTES_V1.includes(value.path)
  ||value.origin!==expected.origin||value.path!==expected.path||value.bodySHA256!==expected.bodySHA256||value.devicePublicKey!==expected.devicePublicKey
  ||typeof value.nonce!=='string'||!/^[0-9a-f]{64}$/.test(value.nonce)||!/^[0-9a-f]{64}$/.test(value.bodySHA256)
  ||typeof value.devicePublicKey!=='string'||!/^04[0-9a-f]{128}$/.test(value.devicePublicKey)
  ||!Number.isSafeInteger(value.issuedAt)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt-value.issuedAt!==60000||value.issuedAt>now+5000||value.expiresAt<=now)throw Error('NATIVE_AUTH_BINDING');
 const origin=new URL(value.origin);if(origin.origin!==value.origin||origin.protocol!=='https:')throw Error('NATIVE_AUTH_ORIGIN');
 return new TextEncoder().encode(JSON.stringify({profile:value.profile,origin:value.origin,method:'POST',path:value.path,bodySHA256:value.bodySHA256,devicePublicKey:value.devicePublicKey,nonce:value.nonce,issuedAt:value.issuedAt,expiresAt:value.expiresAt}));
}
export function verifyNativeWalletAuthV1(challenge,signature,expected,now){try{return secp256k1.verify(hex.decode(signature),nativeWalletAuthMessageV1(challenge,expected,now),hex.decode(challenge.devicePublicKey),{prehash:true,lowS:true});}catch{return false;}}
