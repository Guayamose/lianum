import {randomBytes,createHash} from 'node:crypto';
import {NATIVE_WALLET_AUTH_ROUTES_V1,nativeWalletAuthMessageV1,nativeWalletBodyHashV1,verifyNativeWalletAuthV1} from '@lianum/crypto/native-wallet-auth-v1';
export function createPublicWalletAuthV1(origin,{now=Date.now,maxPending=2000}={}){
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:')throw Error('NATIVE_AUTH_ORIGIN');const pending=new Map();
 function clean(){const time=now();for(const [nonce,value]of pending)if(value.expiresAt<=time)pending.delete(nonce);}
 return Object.freeze({
  issue(request){clean();if(pending.size>=maxPending)throw Error('NATIVE_AUTH_CAPACITY');if(!request||Object.keys(request).sort().join(',')!=='bodySHA256,devicePublicKey,origin,path'||request.origin!==origin||!NATIVE_WALLET_AUTH_ROUTES_V1.includes(request.path))throw Error('NATIVE_AUTH_BINDING');const issuedAt=now(),challenge={profile:'LIANUM_NATIVE_WALLET_REQUEST_V1',origin,method:'POST',path:request.path,bodySHA256:request.bodySHA256,devicePublicKey:request.devicePublicKey,nonce:randomBytes(32).toString('hex'),issuedAt,expiresAt:issuedAt+60000};nativeWalletAuthMessageV1(challenge,request,issuedAt);pending.set(challenge.nonce,challenge);return challenge;},
  consume(path,envelope){clean();if(!envelope||Object.keys(envelope).sort().join(',')!=='body,challenge,signature'||typeof envelope.body!=='string')throw Error('NATIVE_AUTH_BINDING');const c=envelope.challenge,original=pending.get(c?.nonce);if(!original||JSON.stringify(c)!==JSON.stringify(original))throw Error('NATIVE_AUTH_REPLAY');const expected={origin,path,bodySHA256:nativeWalletBodyHashV1(envelope.body),devicePublicKey:c.devicePublicKey};if(!verifyNativeWalletAuthV1(c,envelope.signature,expected,now()))throw Error('NATIVE_AUTH_SIGNATURE');pending.delete(c.nonce);const ownerId=createHash('sha256').update(c.devicePublicKey).digest('hex');return{ownerId,devicePublicKey:c.devicePublicKey,body:JSON.parse(envelope.body)};},
  close(){pending.clear();},
 });
}
