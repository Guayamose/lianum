/** Exact mobile Vault/key-store/SDK in Node with real AES/entropy/HTTPS.
 * Protected hardware and a physical phone are explicitly not established.
 * Root and transport private keys stay in RAM; only the original encrypted
 * chunk namespace and public transport identity are persisted here. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {createHash,randomBytes,createCipheriv,createDecipheriv,X509Certificate} from 'node:crypto';
import {createServer} from 'node:net';
import {request as httpsRequest} from 'node:https';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,chmodSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {createOriginalDeviceExternalFlatNoteAuthorityV1,createOriginalDeviceExternalFlatShareNoteAuthorityV1} from '../../../../packages/backend/src/accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createOriginalDeviceExternalFlatSourceGraphServiceV1} from '../../../../packages/backend/src/operations/local/device-external-flat-source-graph-service-v1.mjs';
import {createOriginalDeviceExternalFlatNoteServiceV1} from '../../../../packages/backend/src/operations/local/device-external-flat-note-service-v1.mjs';
import {createOriginalRetainedDeviceExternalFlatNoteServiceV1,captureOriginalDeviceExternalFlatOrderedServiceV1} from '../../../../packages/backend/src/operations/local/device-external-flat-ordered-observation-service-v1.mjs';
const DEVELOPMENT=resolve(FLAT,'../../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const PRIVATE_LABELS=new Set(['lianum.external-flat.root.v1','lianum.owner.secp256k1.v1']);
const ROUTED_PRIVATE_LABEL=/^lianum\.external-flat\.root\.v1\.[0-9a-f]{64}$/;
const DATA_LABEL=/^(?:lianum\.external-flat\.(?:pointer|record)\.v1(?:\.[0-9a-f]{64})?|lianum\.external-flat\.chunk\.v1(?:\.[0-9a-f]{64})?\.[0-9a-f]{64}\.(?:[0-9]|10)|lianum\.owner\.public\.v1)$/;
let state=null;const keys=new WeakMap(),heldKeys=new Set();
function live(){assert.ok(state&&!state.closed,'DEVICE_EXTERNAL_FLAT_HOST_CLOSED');return state;}
function dataPath(name){assert.equal(DATA_LABEL.exec(name)?.[0],name,'DEVICE_EXTERNAL_FLAT_HOST_STORAGE_LABEL');return join(live().storeDirectory,name);}
export const ExternalFlatHostSecureStoreV1=Object.freeze({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>{live();return true;},canUseBiometricAuthentication:()=>{live();return true;},
 async getItemAsync(name,options){const s=live();if((PRIVATE_LABELS.has(name)||ROUTED_PRIVATE_LABEL.test(name))){assert.equal(options.requireAuthentication,true);return s.private.get(name)??null;}
  const path=dataPath(name);if(!existsSync(path))return null;const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size<=2048);
  const raw=readFileSync(path,'utf8'),after=lstatSync(path);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);return raw;},
 async setItemAsync(name,value,options){const s=live();assert.equal(typeof value,'string');assert.ok(Buffer.byteLength(value)<=2048);if((PRIVATE_LABELS.has(name)||ROUTED_PRIVATE_LABEL.test(name))){assert.equal(options.requireAuthentication,true);s.private.set(name,value);return;}
  writeFileSync(dataPath(name),value,{mode:0o600});s.writes++;}});
export const ExternalFlatHostAuthenticationV1=Object.freeze({hasHardwareAsync:async()=>{live();return true;},isEnrolledAsync:async()=>{live();return true;},authenticateAsync:async options=>{
 assert.equal(options.disableDeviceFallback,true);assert.equal(options.biometricsSecurityLevel,'strong');live().prompts++;return{success:true};}});
class Key{static async import(bytes){live();assert.equal(bytes.length,32);const key=new Key(),raw=Buffer.from(bytes);keys.set(key,raw);heldKeys.add(raw);return key;}}
class Sealed{constructor(bytes){this.bytes=Buffer.from(bytes);}static fromCombined(raw,options){assert.deepEqual(options,{ivLength:12,tagLength:16});return new Sealed(Buffer.from(raw,'base64'));}async combined(encoding){assert.equal(encoding,'base64');return this.bytes.toString('base64');}}
export const ExternalFlatHostCryptoV1=Object.freeze({CryptoDigestAlgorithm:Object.freeze({SHA256:'SHA-256'}),AESEncryptionKey:Key,AESSealedData:Sealed,
 getRandomBytesAsync:async width=>{live();assert.equal(width,32);return Uint8Array.from(randomBytes(width));},
 digest:async(algorithm,bytes)=>{live();assert.equal(algorithm,'SHA-256');assert.ok(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes));const raw=ArrayBuffer.isView(bytes)?Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength):Buffer.from(bytes);return Uint8Array.from(createHash('sha256').update(raw).digest()).buffer;},
 aesEncryptAsync:async(clear,key,options)=>{live();assert.deepEqual(options.nonce,{length:12});assert.equal(options.tagLength,16);const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),nonce);cipher.setAAD(Buffer.from(options.additionalData));return new Sealed(Buffer.concat([nonce,cipher.update(clear),cipher.final(),cipher.getAuthTag()]));},
 aesDecryptAsync:async(sealed,key,options)=>{live();assert.equal(options.output,'bytes');const b=sealed.bytes,d=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));d.setAAD(Buffer.from(options.additionalData));d.setAuthTag(b.subarray(-16));return Uint8Array.from(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));}});
export const ExternalFlatHostPlatformV1=Object.freeze({OS:'android'});
export async function openDeviceExternalFlatErc20HostV1(privateDirectory){assert.equal(arguments.length,1);assert.equal(state,null,'DEVICE_EXTERNAL_FLAT_ONE_HOST');assert.equal(realpathSync(privateDirectory),privateDirectory);
 const parent=lstatSync(privateDirectory);assert.ok(parent.isDirectory()&&parent.uid===process.getuid()&&(parent.mode&0o777)===0o700);
 const directory=join(privateDirectory,'mobile-source-vault'),storeDirectory=join(directory,'ciphertext');mkdirSync(directory,{mode:0o700});mkdirSync(storeDirectory,{mode:0o700});
 state={directory,storeDirectory,closed:false,private:new Map(),writes:0,prompts:0};
 const mobile=join(DEVELOPMENT,'apps/mobile/src'),vaultURL=pathToFileURL(join(mobile,'custody/device-external-flat-note-vault-v1.ts')).href,
  keyURL=pathToFileURL(join(mobile,'custody/key-store.ts')).href,sdkURL=pathToFileURL(join(mobile,'api/device-external-flat-note-api-v1.mjs')).href;
 const graphURL=pathToFileURL(join(mobile,'api/device-external-flat-graph-api-v1.mjs')).href;
 const parents=new Set([vaultURL,keyURL,sdkURL,graphURL]),own=import.meta.url,sources={
  'expo-secure-store':`import{ExternalFlatHostSecureStoreV1 as x}from${JSON.stringify(own)};export const{WHEN_UNLOCKED_THIS_DEVICE_ONLY,isAvailableAsync,canUseBiometricAuthentication,getItemAsync,setItemAsync}=x;`,
  'expo-local-authentication':`import{ExternalFlatHostAuthenticationV1 as x}from${JSON.stringify(own)};export const{hasHardwareAsync,isEnrolledAsync,authenticateAsync}=x;`,
  'expo-crypto':`import{ExternalFlatHostCryptoV1 as x}from${JSON.stringify(own)};export const{CryptoDigestAlgorithm,AESEncryptionKey,AESSealedData,getRandomBytesAsync,digest,aesEncryptAsync,aesDecryptAsync}=x;`,
  'react-native':`export{ExternalFlatHostPlatformV1 as Platform}from${JSON.stringify(own)};`};
 const aliases={'@lianum/mobile-protocol':pathToFileURL(join(DEVELOPMENT,'packages/mobile-protocol/src/authorization.mjs')).href,
  '@lianum/mobile-protocol/original-account-v2':pathToFileURL(join(DEVELOPMENT,'packages/mobile-protocol/src/original-account-review-v2.mjs')).href};
 let vault,identity,sdk,client,service,hook,closing,targetVault,targetClient,graphClient,graphSdk,graphAccounts,originalShareDescriptor,starting=null,reserve=null,origin,certificate,certificateSHA,dropAction=null,originalDescriptor,retained=false,captureWork=null,captureCompleted=false,observationInstalled=false;
 const sockets=new Set(),requestCounts={},drops=[],protocols=new Set();
 function close(){if(closing)return closing;state.closed=true;client?.close();targetClient?.close();graphClient?.close();const vaultStop=(async()=>{if(starting)await starting.catch(()=>{});const all=await Promise.allSettled([vault?vault.close():Promise.resolve(null),targetVault?targetVault.close():Promise.resolve(null)]);const bad=all.find(r=>r.status==='rejected');if(bad)throw bad.reason;return{...all[0].value,target:all[1].value};})(),serviceStop=(async()=>{if(starting)await starting.catch(()=>{});if(captureWork)await captureWork.catch(()=>{});const result=service?await service.close():null;if(graphAccounts){const settled=await Promise.allSettled(graphAccounts.map(a=>a.close()));const bad=settled.find(r=>r.status==='rejected');if(bad)throw bad.reason;for(const row of settled)assert.equal(row.value.closed,true);return{...result,noteAccountsClosed:true};}return result;})();
  const owned=[...sockets],drain=Promise.all(owned.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of owned)socket.destroy();
  closing=(async()=>{try{const all=await Promise.allSettled([serviceStop,vaultStop,drain]);const errors=all.filter(v=>v.status==='rejected').map(v=>v.reason);if(errors.length)throw new AggregateError(errors,'DEVICE_EXTERNAL_FLAT_HOST_CLOSE');assert.equal(sockets.size,0);
    return{closed:true,ownedTlsSocketsRemaining:0,service:all[0].value,vault:all[1].value};
   }finally{hook?.deregister();for(const raw of heldKeys)raw.fill(0);heldKeys.clear();state.private.clear();}})();return closing;}
 try{
  hook=registerHooks({resolve(specifier,context,next){if(parents.has(context.parentURL)&&Object.hasOwn(sources,specifier))return{url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true};
   if(context.parentURL===keyURL&&Object.hasOwn(aliases,specifier))return{url:aliases[specifier],shortCircuit:true};return next(specifier,context);}});
  graphSdk=await import(graphURL);identity=await import(keyURL);const devicePublicKey=await identity.createDeviceIdentity();const original=await import(vaultURL);vault=await original.createDeviceExternalFlatNoteVaultV1();sdk=await import(sdkURL);
  reserve=createServer();await new Promise((resolve,reject)=>{reserve.once('error',reject);reserve.listen(0,'127.0.0.1',resolve);});origin='https://localhost:'+reserve.address().port;await new Promise((resolve,reject)=>reserve.close(error=>error?reject(error):resolve()));reserve=null;
  const certificatePath=join(directory,'certificate.pem'),keyPath=join(directory,'private-key.pem');
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:prime256v1','-sha256','-days','2','-nodes','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-addext','basicConstraints=critical,CA:FALSE','-keyout',keyPath,'-out',certificatePath],{timeout:5000,maxBuffer:4096,stdio:'ignore',env:{PATH:'/usr/bin:/bin',LANG:'C'}});
  chmodSync(certificatePath,0o600);chmodSync(keyPath,0o600);certificate=readFileSync(certificatePath,'utf8');certificateSHA=sha(new X509Certificate(certificate).raw);
  const fetchFixed=async(target,init)=>{live();const url=new URL(target);assert.equal(url.origin,origin);assert.equal(url.search,'');assert.equal(url.hash,'');assert.ok(['/v1/mobile/external-flat/challenges','/v1/mobile/external-flat/reviews','/v1/mobile/external-flat/operations','/v1/mobile/external-flat/status','/v1/mobile/external-flat-share/challenges','/v1/mobile/external-flat-share/reviews','/v1/mobile/external-flat-share/operations','/v1/mobile/external-flat-share/status','/v1/mobile/external-flat/source-graph/challenges','/v1/mobile/external-flat/source-graph/preparations','/v1/mobile/external-flat/source-graph/reviews','/v1/mobile/external-flat/source-graph/operations','/v1/mobile/external-flat/source-graph/status','/v1/mobile/external-flat/source-graph/output-quotes','/v1/mobile/external-flat/source-graph/output-reviews','/v1/mobile/external-flat/source-graph/output-operations'].includes(url.pathname));
   assert.equal(init.method,'POST');assert.equal(init.headers.Origin,origin);assert.equal(init.headers['Content-Type'],'application/json');assert.equal(typeof init.body,'string');const graph=url.pathname.startsWith('/v1/mobile/external-flat/source-graph/');assert.ok(Buffer.byteLength(init.body)<=(graph?65536:8192));
   let parsed=JSON.parse(init.body),action=url.pathname.endsWith('/output-operations')?parsed.consent?.consent?.action:url.pathname.endsWith('/operations')?(graph?parsed.consent?.draft?.action:parsed.consent?.action):url.pathname.split('/').at(-1);parsed=null;
   assert.ok(['challenges','preparations','reviews','status','output-quotes','output-reviews','PROVE_U','RESERVE_S','OBSERVE_S','EXECUTE_GRAPH','RECONCILE_GRAPH','RECOVER_GRAPH','CANCEL_GRAPH','PROVE_D27','OBSERVE_D27','PROVE_D26','FUND_D26','OBSERVE_D26','QUOTE_W39','PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(action));requestCounts[action]=(requestCounts[action]??0)+1;
   return new Promise((resolve,reject)=>{const request=httpsRequest(url,{family:4,ca:certificate,agent:false,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',method:'POST',headers:{...init.headers,'Content-Length':Buffer.byteLength(init.body)},signal:init.signal},response=>{
    const chunks=[];let bytes=0;response.on('data',part=>{chunks.push(part);bytes+=part.length;if(bytes>65536)response.destroy(Error('DEVICE_EXTERNAL_FLAT_HOST_REPLY_BOUND'));});response.once('error',error=>{chunks.forEach(p=>p.fill(0));reject(error);});response.once('aborted',()=>{chunks.forEach(p=>p.fill(0));reject(Error('DEVICE_EXTERNAL_FLAT_HOST_REPLY_ABORTED'));});
    response.once('end',()=>{let body;try{live();body=Buffer.concat(chunks);if(dropAction===action&&response.statusCode===200){dropAction=null;drops.push({action,status:200,originalWorkCompleted:true,actualReplyDiscarded:true});reject(Object.assign(Error('DEVICE_EXTERNAL_FLAT_HOST_REPLY_LOST'),{code:'DEVICE_EXTERNAL_FLAT_HOST_REPLY_LOST'}));}
     else resolve(new Response(body,{status:response.statusCode,headers:response.headers}));}catch(error){reject(error);}finally{body?.fill(0);chunks.forEach(p=>p.fill(0));}});
   });request.once('error',reject);request.on('socket',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.once('secureConnect',()=>{try{assert.equal(socket.getProtocol(),'TLSv1.3');assert.equal(sha(socket.getPeerCertificate().raw),certificateSHA);protocols.add('TLSv1.3');}catch(error){request.destroy(error);}});});request.end(init.body);});};
  return Object.freeze({vault,devicePublicKey,origin,
   start(runtime,system){assert.equal(arguments.length,2);live();assert.equal(starting,null);starting=(async()=>{service=await createOriginalDeviceExternalFlatNoteServiceV1({runtime,system,poolIndex:0,origin,devicePublicKey,tls:{certificate,privateKey:readFileSync(keyPath,'utf8')},host:'127.0.0.1'});if(state.closed){await service.close();throw Error('DEVICE_EXTERNAL_FLAT_HOST_CLOSED');}originalDescriptor=service.descriptor;client=sdk.createDeviceExternalFlatNoteApiV1({descriptor:originalDescriptor,fetchImpl:fetchFixed});return{account:service.account,descriptor:originalDescriptor,client};})();return starting;},
   startGraph(runtime,system,quorum,router,deliveryObserver,rule,rulePath){assert.equal(arguments.length,7);live();assert.equal(starting,null);starting=(async()=>{
    const account=await createOriginalDeviceExternalFlatNoteAuthorityV1({runtime,system,poolIndex:0,origin,devicePublicKey});graphAccounts=[account];
    const targetAccount=await createOriginalDeviceExternalFlatShareNoteAuthorityV1({runtime,system,poolIndex:1,deliveryObserver,origin,devicePublicKey});graphAccounts.push(targetAccount);
    service=await createOriginalDeviceExternalFlatSourceGraphServiceV1({account,targetAccount,runtime,system,quorum,router,deliveryObserver,rule,rulePath,maximumSolverInput:'100',tls:{certificate,privateKey:readFileSync(keyPath,'utf8')},host:'127.0.0.1'});
    if(state.closed){await service.close();throw Error('DEVICE_EXTERNAL_FLAT_HOST_CLOSED');}
    originalDescriptor=service.descriptor;originalShareDescriptor=service.targetDescriptor;targetVault=await (await import(vaultURL)).createDeviceExternalFlatRoutedNoteVaultV1(originalShareDescriptor);
    if(state.closed)throw Error('DEVICE_EXTERNAL_FLAT_HOST_CLOSED');
    client=sdk.createDeviceExternalFlatNoteApiV1({descriptor:originalDescriptor,fetchImpl:fetchFixed});targetClient=sdk.createDeviceExternalFlatNoteApiV1({descriptor:originalShareDescriptor,fetchImpl:fetchFixed});graphClient=graphSdk.createDeviceExternalFlatGraphApiV1({descriptor:originalDescriptor,fetchImpl:fetchFixed});
    return{account,targetAccount,service,descriptor:originalDescriptor,targetDescriptor:originalShareDescriptor,client,targetClient,graphClient,targetVault};})();return starting;},
   startRetained(runtime,system,registry,recoveryAuthority){assert.equal(arguments.length,4);live();assert.equal(starting,null);retained=true;
    starting=(async()=>{service=await createOriginalRetainedDeviceExternalFlatNoteServiceV1({runtime,system,registry,recoveryAuthority,poolIndex:0,origin,devicePublicKey,tls:{certificate,privateKey:readFileSync(keyPath,'utf8')},host:'127.0.0.1'});
     if(state.closed){await service.close();throw Error('DEVICE_EXTERNAL_FLAT_HOST_CLOSED');}originalDescriptor=service.descriptor;client=sdk.createDeviceExternalFlatNoteApiV1({descriptor:originalDescriptor,fetchImpl:fetchFixed});return{account:service.account,descriptor:originalDescriptor,client};})();return starting;},
   captureRetained(){assert.equal(arguments.length,0);live();assert.ok(retained&&service&&!captureWork&&!closing);client.close();
    // Original service fences its listener/account synchronously. Parent custody
    // remains alive; only these original HTTP sockets and SDK are drained.
    const capture=captureOriginalDeviceExternalFlatOrderedServiceV1(service),owned=[...sockets],drain=Promise.all(owned.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of owned)socket.destroy();
    captureWork=(async()=>{const all=await Promise.allSettled([capture,drain]);const failure=all.find(row=>row.status==='rejected');if(failure)throw failure.reason;assert.equal(sockets.size,0);captureCompleted=true;return all[0].value;})();return captureWork;},
   resumeOriginalObservation(descriptor){assert.equal(arguments.length,1);live();assert.ok(retained&&captureCompleted&&!observationInstalled&&!closing);assert.deepEqual(descriptor,originalDescriptor);observationInstalled=true;
    client=sdk.createDeviceExternalFlatNoteApiV1({descriptor:originalDescriptor,fetchImpl:fetchFixed});return client;},
   sign(value){live();assert.ok(originalDescriptor);const d=value.descriptor??(value.pairingId===originalShareDescriptor?.pairingId?originalShareDescriptor:originalDescriptor);assert.deepEqual(d,d.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1'?originalShareDescriptor:originalDescriptor);return identity.signDeviceExternalFlatPermissionV1(value,origin,d.pairingId);},
   signGraph(value){live();assert.ok(originalDescriptor&&graphClient);return identity.signDeviceExternalFlatGraphPermissionV1(value,origin,originalDescriptor.pairingId);},
   signGraphOutput(value){live();assert.ok(originalDescriptor&&graphClient);return identity.signDeviceExternalFlatGraphOutputPermissionV1(value,origin,originalDescriptor.pairingId);},
   loseOriginalReply(action){live();assert.ok(['FUND_D26','WITHDRAW_W39','EXECUTE_GRAPH'].includes(action));assert.equal(dropAction,null);assert.equal(drops.some(d=>d.action===action),false);dropAction=action;},
   async replayOriginalPermission(consent,signature){live();const path=consent.profile==='DEVICE_EXTERNAL_FLAT_GRAPH_OUTPUT_W39_V1'?'/v1/mobile/external-flat/source-graph/output-operations':consent.profile==='DEVICE_EXTERNAL_FLAT_GRAPH_SOURCE_V1'?'/v1/mobile/external-flat/source-graph/operations':consent.descriptor?.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1'?'/v1/mobile/external-flat-share/operations':'/v1/mobile/external-flat/operations';const response=await fetchFixed(origin+path,{method:'POST',headers:{Accept:'application/json',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({consent,signature,witness:null})});assert.equal(response.status,403);await response.body.cancel();return{rejected:true};},
   transport(){return{requests:{...requestCounts},drops:structuredClone(drops),tlsVersions:[...protocols]};},
   evidence(){const s=state,files=readdirSync(storeDirectory).filter(name=>name.startsWith('lianum.external-flat.')).map(name=>{const raw=readFileSync(join(storeDirectory,name));assert.ok(raw.length<=2048);return{key:name,bytes:raw.length,sha256:sha(raw)};});return{nodeAesGcm:true,nodeCryptographicEntropy:true,ciphertextPersisted:files.length>0,maximumStoredValueBytes:Math.max(0,...files.map(f=>f.bytes)),ciphertextFiles:files,writes:s.writes,hostConsentPrompts:s.prompts,secureStoreHardware:false,biometricHardware:false,rootPersistedToFile:false,notePrivateKeyPersistedPlaintext:false};},close,
   remove(){assert.equal(state.closed,true);assert.equal(realpathSync(directory),directory);rmSync(directory,{recursive:true});return{removed:!existsSync(directory)};},
  });
 }catch(error){if(reserve)await new Promise(resolve=>reserve.close(resolve));try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'DEVICE_EXTERNAL_FLAT_HOST_START',{cause:error});}throw error;}
}
