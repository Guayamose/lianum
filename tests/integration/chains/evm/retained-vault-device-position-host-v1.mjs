/** Fixed acceptance adapter: the ORIGINAL mobile SDK and ORIGINAL catalogue
 * TLS/reader execute in this same DeFi realm. Only device key/Expo digest and
 * TLS certificate infrastructure are HOST fixtures; no phone custody claim. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash,createECDH,createPrivateKey,sign,randomBytes,X509Certificate} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {createServer} from 'node:net';
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,realpathSync,mkdirSync,chmodSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FLAT,ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {retainedExternalVaultWalletContextV1} from '../../../../packages/backend/src/accounts/recovery/external-defi-retained-vault-wallet-v1.mjs';
import {deviceDefiPositionPermissionMessageV1,deviceDefiPositionStateBytesV1,validateDeviceDefiPositionHeadsFreshV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
const DEVELOPMENT=resolve(FLAT,'../../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCE=Object.freeze([
 ['apps/mobile/src/api/device-defi-position-read-api-v1.mjs','b9def71bbdef7b554b7528170b67b54f54446bbd857203a86c957f1c6c59118a'],
 ['packages/mobile-protocol/src/device-defi-position-read-v1.mjs','433ec94eda55d031b8d32f009d66a3c2a4d22431cd8729b26ff50711ec5147f4'],
 ['packages/mobile-protocol/src/authorization.mjs','5f5667d70df7140ca2236ada629302c7b2d1a5b6ce9649bdd93ffff3146d7eff'],
 ['apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs','faa60be8edc76588354316594ba7c9cac90714e8363e9817c5ec8b1d6d641399'],
].map(row=>Object.freeze(row)));
function assertSource() {
 assert.equal(realpathSync(DEVELOPMENT),DEVELOPMENT);
 for(const[name,digest]of SOURCE){let path=DEVELOPMENT;for(const part of name.split('/')){path=join(path,part);assert.equal(lstatSync(path).isSymbolicLink(),false);}
  const before=lstatSync(path);assert.ok(before.isFile()&&before.uid===process.getuid()&&before.nlink===1&&before.size<=131072);const raw=readFileSync(path),after=lstatSync(path);
  for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);assert.equal(raw.length,before.size);assert.equal(sha(raw),digest,'ORIGINAL_DEVICE_DEFI_SDK_SOURCE');
 }
}
export const originalRetainedDeviceReadDigestV1=async(algorithm,bytes)=>{
 assert.equal(algorithm,'SHA-256');assert.ok(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes));
 const raw=ArrayBuffer.isView(bytes)?Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength):Buffer.from(bytes);
 return Uint8Array.from(createHash('sha256').update(raw).digest()).buffer;
};
export async function openOriginalRetainedVaultDeviceReadHostV1(wallet,privateDirectory) {
 assert.equal(arguments.length,2);const original=retainedExternalVaultWalletContextV1(wallet);assert.equal(typeof wallet.installDevicePositionRead,'function');
 assert.ok(privateDirectory.startsWith(join(ROOT,'.local/external-defi-owner-cycle-v1/attempt-'))&&privateDirectory.endsWith('/private-audit'));
 assert.equal(realpathSync(privateDirectory),privateDirectory);const parent=lstatSync(privateDirectory);assert.ok(parent.isDirectory()&&parent.uid===process.getuid()&&(parent.mode&0o077)===0);
 assertSource();const directory=join(privateDirectory,'device-defi-read-tls'),certificatePath=join(directory,'certificate.pem'),privateKeyPath=join(directory,'private-key.pem');
 let keyBytes,deviceKey,curve,server,client,hook,reserve=null,directoryOwned=false,installStarted=false,closed=false,closing=null;const sockets=new Set();
 function live(){assert.equal(closed,false,'ORIGINAL_DEVICE_DEFI_READ_CLOSED');assert.equal(retainedExternalVaultWalletContextV1(wallet).runtime,original.runtime);}
 function close(){if(closing)return closing;closed=true;client?.close();keyBytes?.fill(0);deviceKey=null;curve=null;
  const stopping=installStarted?wallet.closeDevicePositionRead():Promise.resolve(),reservation=reserve?new Promise((resolve,reject)=>reserve.close(error=>error?reject(error):resolve())):Promise.resolve(),ownedSockets=[...sockets],drain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of ownedSockets)socket.destroy();
  closing=(async()=>{try{const stopped=await Promise.allSettled([stopping,reservation,drain]);const failures=stopped.filter(row=>row.status==='rejected').map(row=>row.reason);if(failures.length)throw new AggregateError(failures,'ORIGINAL_DEVICE_DEFI_CLOSE_UNCONFIRMED');
    assert.equal(sockets.size,0);assertSource();if(directoryOwned){assert.equal(realpathSync(directory),directory);const current=lstatSync(directory);assert.ok(current.isDirectory()&&current.uid===process.getuid()&&(current.mode&0o077)===0);rmSync(directory,{recursive:true});directoryOwned=false;}return{closed:true,ownedTlsSocketsRemaining:0,retainedOriginalCustody:true};}
   finally{hook?.deregister();}})();return closing;}
 try{
  mkdirSync(directory,{mode:0o700});directoryOwned=true;reserve=createServer();await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',resolve);});const port=reserve.address().port;await new Promise((resolve,reject)=>reserve.close(error=>error?reject(error):resolve()));reserve=null;const origin='https://localhost:'+port;
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-sha256','-days','2','-nodes','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:FALSE','-keyout',privateKeyPath,'-out',certificatePath],{timeout:5000,maxBuffer:4096,stdio:'ignore',env:{PATH:'/usr/bin:/bin',LANG:'C'}});
  chmodSync(certificatePath,0o600);chmodSync(privateKeyPath,0o600);
  const certificate=readFileSync(certificatePath,'utf8'),certificateSHA=sha(new X509Certificate(certificate).raw);
  curve=createECDH('secp256k1');let preparedKey=false;for(let attempt=0;attempt<4;attempt++){keyBytes=randomBytes(32);try{curve.setPrivateKey(keyBytes);preparedKey=true;break;}catch{keyBytes.fill(0);}}assert.equal(preparedKey,true,'ORIGINAL_DEVICE_DEFI_HOST_KEY');
  const publicBytes=curve.getPublicKey(null,'uncompressed'),devicePublicKey=publicBytes.toString('hex');
  deviceKey=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:publicBytes.subarray(1,33).toString('base64url'),y:publicBytes.subarray(33).toString('base64url'),d:keyBytes.toString('base64url')}});
  installStarted=true;server=await wallet.installDevicePositionRead({origin,devicePublicKey,tls:{certificate,privateKey:readFileSync(privateKeyPath,'utf8')}});
  const sdkPath=join(DEVELOPMENT,SOURCE[0][0]),sdkURL=pathToFileURL(sdkPath).href;
  const digestSource='import{originalRetainedDeviceReadDigestV1 as digest}from'+JSON.stringify(import.meta.url)+';export {digest};export const CryptoDigestAlgorithm=Object.freeze({SHA256:"SHA-256"});';
  hook=registerHooks({resolve(specifier,context,next){if(context.parentURL===sdkURL&&specifier==='expo-crypto')return{url:'data:text/javascript,'+encodeURIComponent(digestSource),shortCircuit:true};return next(specifier,context);}});
  const {createDeviceDefiPositionReadApiV1}=await import(sdkURL);assertSource();
  const fetchFixed=async(target,init)=>{live();const url=new URL(target);assert.equal(url.origin,origin);assert.ok(['/v1/mobile/defi-positions/challenges','/v1/mobile/defi-positions/reviews','/v1/mobile/defi-positions/observations'].includes(url.pathname));
   assert.equal(url.search,'');assert.equal(url.hash,'');assert.equal(init.method,'POST');assert.equal(init.headers.Origin,origin);assert.equal(init.headers['Content-Type'],'application/json');assert.equal(typeof init.body,'string');assert.ok(Buffer.byteLength(init.body)<=8192);
   return new Promise((resolve,reject)=>{const request=httpsRequest(url,{family:4,ca:certificate,agent:false,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',method:'POST',headers:{...init.headers,'Content-Length':Buffer.byteLength(init.body)},signal:init.signal},response=>{
     const parts=[];let bytes=0;response.on('data',part=>{parts.push(part);bytes+=part.length;if(bytes>65536){response.destroy(Error('ORIGINAL_DEVICE_DEFI_REPLY_BOUND'));}});response.once('error',error=>{parts.forEach(part=>part.fill(0));reject(error);});response.once('aborted',()=>{parts.forEach(part=>part.fill(0));reject(Error('ORIGINAL_DEVICE_DEFI_REPLY_ABORTED'));});
     response.once('end',()=>{let combined;try{live();combined=Buffer.concat(parts);resolve(new Response(combined,{status:response.statusCode,headers:response.headers}));}catch(error){reject(error);}finally{combined?.fill(0);parts.forEach(part=>part.fill(0));}});
    });request.once('error',reject);request.on('socket',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.once('secureConnect',()=>{try{assert.equal(socket.getProtocol(),'TLSv1.3');assert.equal(sha(socket.getPeerCertificate().raw),certificateSHA);}catch(error){request.destroy(error);}});});request.end(init.body);
   });
  };
  client=createDeviceDefiPositionReadApiV1({descriptor:server.descriptor,fetchImpl:fetchFixed});
  function signature(value){live();const bytes=sign('sha256',deviceDefiPositionPermissionMessageV1(value),{key:deviceKey,dsaEncoding:'ieee-p1363'}),order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+bytes.subarray(32).toString('hex'));
   if(s>order/2n)Buffer.from((order-s).toString(16).padStart(64,'0'),'hex').copy(bytes,32);return bytes.toString('hex');}
  return Object.freeze({
   async read(phase,expectedShares){assert.equal(arguments.length,2);live();assert.ok(['after-mint','after-redemption'].includes(phase));assert.ok(typeof expectedShares==='string'&&/^(0|[1-9][0-9]{0,77})$/.exec(expectedShares)?.[0]===expectedShares);
    const access=await client.challenge();live();const review=await client.openReview(access,signature(access));live();const response=await client.read(review,signature(review));live();
    const actual=validateDeviceDefiPositionHeadsFreshV1(await wallet.exit.ownerStateView());live();assert.equal(sha(deviceDefiPositionStateBytesV1(response.positions)),sha(deviceDefiPositionStateBytesV1(actual)),'ORIGINAL_DEVICE_DEFI_POSITIONS_JOIN');
    const target=response.positions.positions.find(row=>row.shareAssetId===wallet.accounts[1].assetId);assert.ok(target);assert.equal(target.ownership.status,'LIVE');assert.equal(target.ownership.balances.available,expectedShares);
    assert.equal(target.vaultIdentity.vault,target.vault);assert.equal(target.underlyingSpendable,false);assert.equal(response.mobileNoteCustody,false);
    return{phase,originalTargetsAndAmountsJoined:true,originalHeadJoined:true,readOnly:true,mobileNoteCustody:false,linuxOriginalCustody:true,twoOwnFreshConsents:true,responseSHA256:sha(Buffer.from(JSON.stringify(response))),sdkSources:SOURCE.map(([path,sha256])=>({path,sha256})),phoneOrExpoHardwareAccepted:false};
   },close,
  });
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'ORIGINAL_DEVICE_DEFI_HOST_START_FAILED',{cause:error});}throw error;}
}
