/** Original scrypt/AEAD with explicit HOST storage and biometric ports.
 * No phone, SDK request, proof or economic authorization is exercised. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

test('identity copy stays in one managed session and avoids protected rereads',async t=>{
 const PRIVATE='lianum.owner.secp256k1.v1',PUBLIC='lianum.owner.public.v1',storage=new Map(),reads=new Map(),keys=new WeakMap(),clearBuffers=[],keyBuffers=[],listeners=new Set();
 const control={approval:true,authenticate:null,encrypt:null,decrypt:null};let bios=0,writes=0;
 const app={currentState:'active',addEventListener(_name,listener){listeners.add(listener);return{remove(){listeners.delete(listener);}};}};
 t.mock.module('react-native',{exports:{Platform:{OS:'android'},AppState:app}});
 t.mock.module('expo-secure-store',{exports:{WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>true,canUseBiometricAuthentication:()=>true,
  async getItemAsync(name,options){reads.set(name,(reads.get(name)??0)+1);if(name===PRIVATE)assert.equal(options.requireAuthentication,true);return storage.get(name)??null;},
  async setItemAsync(name,value){writes++;storage.set(name,value);},async deleteItemAsync(name){writes++;storage.delete(name);}}});
 t.mock.module('expo-local-authentication',{exports:{hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,async authenticateAsync(options){bios++;assert.equal(options.disableDeviceFallback,true);assert.equal(options.biometricsSecurityLevel,'strong');await control.authenticate?.();return{success:control.approval};}}});
 t.mock.module('expo-crypto',{exports:{getRandomBytesAsync:async n=>new Uint8Array(randomBytes(n)),AESEncryptionKey:{async import(bytes){keyBuffers.push(bytes);const key={};keys.set(key,Buffer.from(bytes));return key;}},
  AESSealedData:{fromCombined(bytes,options){assert.ok(bytes instanceof Uint8Array);assert.deepEqual(options,{ivLength:12,tagLength:16});return{bytes:Buffer.from(bytes)};}},
  async aesEncryptAsync(clear,key,options){clearBuffers.push(clear);await control.encrypt?.();const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys.get(key),iv);cipher.setAAD(options.additionalData);const encrypted=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{combined:async()=>encrypted.toString('base64')};},
  async aesDecryptAsync(sealed,key,options){const b=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keys.get(key),b.subarray(0,12));decipher.setAAD(options.additionalData);decipher.setAuthTag(b.subarray(-16));const clear=Uint8Array.from(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]));clearBuffers.push(clear);await control.decrypt?.();return clear;}}});
 const S=await import('../src/custody/signing.mjs'),W=await import('../src/custody/wallet-session-v1.ts'),K=await import('../src/custody/key-store.ts');
 const secret='0'.repeat(63)+'1',key=S.privateKeyFromHex(secret),pub=S.devicePublicKey(key);key.fill(0);const other=S.privateKeyFromHex('0'.repeat(63)+'2'),otherPub=S.devicePublicKey(other);other.fill(0);
 storage.set(PRIVATE,secret);storage.set(PUBLIC,pub);const pass='same-identity-private-copy-password',signal=new AbortController().signal;let copy;
 async function reopen(){W.lockWalletSessionV1();app.currentState='active';storage.set(PUBLIC,pub);Object.assign(control,{approval:true,authenticate:null,encrypt:null,decrypt:null});await W.openWalletSessionV1();}
 t.after(()=>W.lockWalletSessionV1());
 await t.test('ciphertext and verification use one explicit approval each, no private read or write',async()=>{
  await W.openWalletSessionV1();const privateReads=reads.get(PRIVATE),beforeWrites=writes;
  copy=await K.exportDeviceIdentityBackupV1(pass,pub,signal);assert.equal(bios,1);assert.equal(reads.get(PRIVATE),privateReads);assert.equal(writes,beforeWrites);
  assert.equal(JSON.parse(copy).binding.profile,'DEVICE_IDENTITY_CUSTODY_V1');assert.ok(!copy.includes(secret));assert.ok(!copy.includes('privateKeyHex'));
  assert.deepEqual(await K.importDeviceIdentityBackupV1(copy,pass,pub,signal),{devicePublicKey:pub,restored:true});assert.equal(bios,2);assert.equal(reads.get(PRIVATE),privateReads);assert.equal(writes,beforeWrites);
  await assert.rejects(()=>K.importDeviceIdentityBackupV1(copy,'another-password',pub,signal),/BACKUP_AUTHENTICATION/);assert.equal(reads.get(PRIVATE),privateReads);
  control.approval=false;await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/AUTHENTICATION_CANCELLED/);control.approval=true;
 });
 await t.test('locked and cancelled work never falls back to protected legacy reads',async()=>{
  W.lockWalletSessionV1();const count=reads.get(PRIVATE),beforeBio=bios;await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/SESSION_LOCKED/);assert.equal(reads.get(PRIVATE),count);assert.equal(bios,beforeBio);
  await reopen();const controller=new AbortController();control.authenticate=async()=>controller.abort();await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,controller.signal),/BACKUP_CANCELLED/);control.authenticate=null;
 });
 await t.test('public identity CAS rejects changes during authentication and encryption',async()=>{
  await reopen();control.authenticate=async()=>storage.set(PUBLIC,otherPub);await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/BACKUP_STORAGE_CHANGED/);
  await reopen();control.encrypt=async()=>storage.set(PUBLIC,otherPub);await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/BACKUP_STORAGE_CHANGED/);
  await reopen();control.decrypt=async()=>storage.set(PUBLIC,otherPub);await assert.rejects(()=>K.importDeviceIdentityBackupV1(copy,pass,pub,signal),/BACKUP_STORAGE_CHANGED/);
 });
 await t.test('background and same-key reopen revoke in-flight work instead of changing its session',async()=>{
  await reopen();control.encrypt=async()=>{app.currentState='background';for(const listener of listeners)listener('background');};await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/SESSION_LOCKED/);
  await reopen();control.decrypt=async()=>{W.lockWalletSessionV1();await W.openWalletSessionV1();};await assert.rejects(()=>K.importDeviceIdentityBackupV1(copy,pass,pub,signal),/SESSION_LOCKED/);
  await reopen();control.encrypt=async()=>{W.lockWalletSessionV1();await W.openWalletSessionV1();};await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/SESSION_LOCKED/);
 });
 await t.test('delayed authentication cannot cross the original session maximum',async()=>{
  await reopen();const previous=Object.getOwnPropertyDescriptor(performance,'now'),now=performance.now.bind(performance);
  control.authenticate=async()=>Object.defineProperty(performance,'now',{configurable:true,value:()=>now()+30*60*1000+1});
  try{await assert.rejects(()=>K.exportDeviceIdentityBackupV1(pass,pub,signal),/SESSION_EXPIRED/);}finally{if(previous)Object.defineProperty(performance,'now',previous);else delete performance.now;}
 });
 assert.ok(clearBuffers.length>0&&clearBuffers.every(bytes=>bytes.every(b=>b===0)),'identity plaintext is wiped after success and rejected continuations');
 assert.ok(keyBuffers.length>0&&keyBuffers.every(bytes=>bytes.every(b=>b===0)),'temporary AEAD/KDF key buffers are wiped');
 assert.equal(storage.get(PRIVATE),secret,'no copy path modifies the original identity');
});
