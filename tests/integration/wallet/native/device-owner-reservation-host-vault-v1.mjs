/** Fixed acceptance adapter for ORIGINAL mobile vault code. Node AES-GCM/RNG
 * and private ciphertext files are real; Expo SecureStore, biometric hardware,
 * React Native and Hermes are NOT executed or accepted. No backend authority. */
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,existsSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let state=null; const keys=new WeakMap(),heldKeys=new Set();
const ROOT_KEY='lianum.note.root.encryption.v1',OWNER_KEY='lianum.owner.secp256k1.v1',OWNER_PUBLIC='lianum.owner.public.v1';
function live(){assert.ok(state&&!state.closed,'DEVICE_US_HOST_ADAPTER_CLOSED');return state;}
function file(name){if(state?.rootClaim&&name===OWNER_PUBLIC)return join(live().directory,name);assert.match(name,/^lianum\.note\.(?:root\.(?:pointer|record)\.v1|record\.chunk\.v1\.[0-9a-f]{64}\.[0-9]{1,2})$/);return join(live().directory,name);}
export const HostSecureStore=Object.freeze({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,
 isAvailableAsync:async()=>{live();return true;},canUseBiometricAuthentication:()=>{live();return true;},
 async getItemAsync(name,options){const s=live();if(name===ROOT_KEY){assert.equal(options.requireAuthentication,true);return s.root;}if(s.rootClaim&&name===OWNER_KEY){assert.equal(options.requireAuthentication,true);return s.owner;}
  const p=file(name);if(!existsSync(p))return null;const before=lstatSync(p);assert.equal(before.isSymbolicLink(),false);
  assert.equal(before.uid,process.getuid());assert.ok(before.isFile()&&(before.mode&0o077)===0&&before.size<=2048);
  const raw=readFileSync(p,'utf8'),after=lstatSync(p);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);return raw;},
 async setItemAsync(name,raw,options){const s=live();assert.equal(typeof raw,'string');assert.ok(Buffer.byteLength(raw)<=2048);
  if(name===ROOT_KEY){assert.equal(options.requireAuthentication,true);s.root=raw;return;}if(s.rootClaim&&name===OWNER_KEY){assert.equal(options.requireAuthentication,true);s.owner=raw;return;}
  writeFileSync(file(name),raw,{mode:0o600,flag:'w'});s.writes++;},
});
export const HostAuthentication=Object.freeze({hasHardwareAsync:async()=>{live();return true;},isEnrolledAsync:async()=>{live();return true;},
 authenticateAsync:async options=>{live();assert.equal(options.disableDeviceFallback,true);assert.equal(options.biometricsSecurityLevel,'strong');state.prompts++;return{success:true};}});
class Key{static async import(bytes){live();assert.equal(bytes.length,32);const key=new Key(),raw=Buffer.from(bytes);keys.set(key,raw);heldKeys.add(raw);return key;}}
class Sealed{constructor(bytes){this.bytes=Buffer.from(bytes);}static fromCombined(raw,options){assert.deepEqual(options,{ivLength:12,tagLength:16});assert.ok(raw instanceof Uint8Array,'HOST_NATIVE_AES_BYTE_ARRAY_REQUIRED');return new Sealed(raw);}
 async combined(encoding){assert.equal(encoding,'base64');return this.bytes.toString('base64');}}
export const HostCrypto=Object.freeze({CryptoDigestAlgorithm:Object.freeze({SHA256:'SHA-256'}),AESEncryptionKey:Key,AESSealedData:Sealed,
 getRandomBytesAsync:async width=>{live();assert.ok(width===32||width===12);return Uint8Array.from(randomBytes(width));},
 digest:async(algorithm,bytes)=>{live();assert.equal(algorithm,'SHA-256');
  assert.ok(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes));
  const raw=ArrayBuffer.isView(bytes)?Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength):Buffer.from(bytes);
  return Uint8Array.from(createHash('sha256').update(raw).digest()).buffer;},
 aesEncryptAsync:async(clear,key,options)=>{live();const explicit=Object.hasOwn(options.nonce,'bytes');if(explicit)assert.ok(options.nonce.bytes instanceof Uint8Array&&options.nonce.bytes.length===12);else assert.deepEqual(options.nonce,{length:12});assert.equal(options.tagLength,16);
  const nonce=explicit?Buffer.from(options.nonce.bytes):randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),nonce);cipher.setAAD(Buffer.from(options.additionalData));
  return new Sealed(Buffer.concat([nonce,cipher.update(clear),cipher.final(),cipher.getAuthTag()]));},
 aesDecryptAsync:async(sealed,key,options)=>{live();assert.equal(options.output,'bytes');const b=sealed.bytes,d=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));
  d.setAAD(Buffer.from(options.additionalData));d.setAuthTag(b.subarray(-16));return Uint8Array.from(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));},
});
const appStateListeners=new Set();
export const HostAppState=Object.freeze({currentState:'active',addEventListener(name,listener){assert.equal(name,'change');assert.equal(typeof listener,'function');appStateListeners.add(listener);return Object.freeze({remove(){appStateListeners.delete(listener);}});}});
export const HostPlatform=Object.freeze({OS:'android'});
export const hostFixedTlsFetch=(...args)=>live().fetch(...args);
/** Called only by this enumerated private profile, never an application route.
 * The fixed TLS transport remains exact-origin/certificate-bound. Hooks cannot
 * replace account/owner/proof/provider modules or any mobile authority brand. */
export async function openDeviceReservationHostVaultV1(input){assert.equal(arguments.length,1);return openFixedDeviceReservationHostVault(input,false);}
/** Fixed RootNote-native profile; original mobile identity remains private in HOST RAM. */
export async function openDeviceRootClaimHostVaultV3(input){assert.equal(arguments.length,1);return openFixedDeviceReservationHostVault(input,true);}
async function openFixedDeviceReservationHostVault({appRoot,directory,fetch},rootClaim){
 assert.equal(state,null,'DEVICE_US_ONE_HOST_ADAPTER');assert.equal(realpathSync(appRoot),appRoot);mkdirSync(directory,{mode:0o700});
 assert.equal(realpathSync(directory),directory);const info=lstatSync(directory);assert.equal(info.uid,process.getuid());assert.equal(info.mode&0o077,0);
 state={directory,fetch,root:null,owner:null,rootClaim,closed:false,writes:0,prompts:0};
 const own=import.meta.url,root=pathToFileURL(join(appRoot,'src')).href+'/',vaultURL=root+'custody/local-root-note-vault-v1.ts',keyURL=root+'custody/key-store.ts';
 const sources={
  'expo-secure-store':`import{HostSecureStore as x}from${JSON.stringify(own)};export const{WHEN_UNLOCKED_THIS_DEVICE_ONLY,isAvailableAsync,canUseBiometricAuthentication,getItemAsync,setItemAsync}=x;`,
  'expo-local-authentication':`import{HostAuthentication as x}from${JSON.stringify(own)};export const{hasHardwareAsync,isEnrolledAsync,authenticateAsync}=x;`,
  'expo-crypto':`import{HostCrypto as x}from${JSON.stringify(own)};export const{CryptoDigestAlgorithm,AESEncryptionKey,AESSealedData,getRandomBytesAsync,digest,aesEncryptAsync,aesDecryptAsync}=x;`,
  'react-native':`export{HostPlatform as Platform,HostAppState as AppState}from${JSON.stringify(own)};`,
  'expo/fetch':`export{hostFixedTlsFetch as fetch}from${JSON.stringify(own)};`,
 };
 const hook=registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.startsWith(root)&&Object.hasOwn(sources,specifier))return{url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true};
  if(context.parentURL===vaultURL&&['../api/device-owner-deposit-api-v1','../api/device-owner-reservation-api-v1','../api/device-owner-exit-api-v1','../api/device-owner-execution-api-v1','../api/device-owner-output-balance-api-v1'].includes(specifier))return next(specifier+'.ts',context);
  if(rootClaim&&context.parentURL===keyURL&&specifier==='@lianum/mobile-protocol')return next(pathToFileURL(resolve(appRoot,'../../packages/mobile-protocol/src/authorization.mjs')).href,context);
  if(rootClaim&&context.parentURL===keyURL&&specifier==='@lianum/mobile-protocol/original-account-v2')return next(pathToFileURL(resolve(appRoot,'../../packages/mobile-protocol/src/original-account-review-v2.mjs')).href,context);
  return next(specifier,context);
 }});
 try{
  const original=await import(vaultURL),deposit=await import(root+'api/device-owner-deposit-api-v1.ts'),reservation=await import(root+'api/device-owner-reservation-api-v1.ts'),
   execution=await import(root+'api/device-owner-execution-api-v1.ts'),exit=await import(root+'api/device-owner-exit-api-v1.ts'),outputBalance=await import(root+'api/device-owner-output-balance-api-v1.ts');
  const claim=rootClaim?await import(root+'api/native-claim-device-api-v1.mjs'):null,identity=rootClaim?await import(keyURL):null;
  return Object.freeze({original,deposit,reservation,execution,exit,outputBalance,...(rootClaim?{claim,identity}:{}),
   evidence(){const s=live(),rows=readdirSync(directory).map(name=>{const p=file(name),info=lstatSync(p);assert.ok(info.isFile()&&!info.isSymbolicLink());
     const raw=readFileSync(p);assert.ok(raw.length<=2048);return{key:name,bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};});
    return{nodeAesGcm:true,nodeCryptographicEntropy:true,ciphertextPersisted:rows.length>0,maximumStoredValueBytes:Math.max(0,...rows.map(r=>r.bytes)),ciphertextFiles:rows,
     writes:s.writes,hostConsentPrompts:s.prompts,secureStoreHardware:false,biometricHardware:false,rootPersistedToFile:false};},
   close(){if(state.closed)return;hook.deregister();for(const key of heldKeys)key.fill(0);heldKeys.clear();state.root=null;state.owner=null;state.fetch=null;state.closed=true;},
   retire(){assert.equal(state.closed,true);const info=lstatSync(directory);assert.equal(info.uid,process.getuid());assert.equal(realpathSync(directory),directory);
    assert.equal(info.isSymbolicLink(),false);rmSync(directory,{recursive:true});assert.equal(existsSync(directory),false);return{removed:true};},
  });
 }catch(error){hook.deregister();state.closed=true;for(const key of heldKeys)key.fill(0);heldKeys.clear();state.root=null;state.owner=null;state.fetch=null;throw error;}
}
