/** Expo/native boundaries are explicit test doubles. These tests exercise the
 * real key-store orchestration and signatures; they do not prove device
 * biometrics, hardware isolation, mobile fund recovery or native acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes,createPublicKey,verify} from 'node:crypto';
import {deviceReservationFixtureV1} from './helpers/device-reservation-fixture-v1.mjs';
import {normalizeNativePrivateDepositConsentV2,deviceDepositConsentEitherMessageV2,DEVICE_NATIVE_PRIVATE_DEPOSIT_V2} from '../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';
import {normalizeNativePrivateExitConsentV2,deviceExitConsentEitherMessageV2,DEVICE_NATIVE_PRIVATE_EXIT_V2} from '../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
import { MOBILE_AUTHORIZATION_PROFILE, mobileReceiptMessage } from '@lianum/mobile-protocol';
import * as signing from '../src/custody/signing.mjs';

const store = new Map(), calls = [], privateBuffers = [], backupKeyInputs=[];
const control = { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null, discardPendingWrite: false, discardIdentityWrite:false, afterBackupDecrypt:null };
const PRIVATE = 'lianum.owner.secp256k1.v1', PUBLIC = 'lianum.owner.public.v1';
mock.module('expo-secure-store', { exports: {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: async () => control.supported,
  canUseBiometricAuthentication: () => control.supported,
  async getItemAsync(key, options) {
    calls.push({ method: 'read', key, options });
    if (key === PRIVATE) {
      assert.equal(options.requireAuthentication, true);
      if (control.slowRead) await control.slowRead();
      if (control.invalidatePrivate) return null;
    }
    return store.get(key) ?? null;
  },
  async setItemAsync(key, value, options) {
    calls.push({ method: 'write', key, options });
    if (key === PRIVATE) { assert.equal(options.requireAuthentication, true); assert.equal(options.keychainAccessible, 6); }
    if (key.includes('pending') && control.discardPendingWrite) return;
    if (key===PRIVATE&&control.discardIdentityWrite) return;
    store.set(key, value);
  },
} });
mock.module('expo-local-authentication', { exports: {
  hasHardwareAsync: async () => control.supported,
  isEnrolledAsync: async () => control.supported,
  async authenticateAsync(options) {
    assert.equal(options.disableDeviceFallback, true); assert.equal(options.biometricsSecurityLevel, 'strong');
    return { success: control.approval };
  },
} });
mock.module('expo-crypto', { exports: {
  // Real AES-GCM and the production fixed scrypt are exercised here. Expo
  // storage/biometrics/entropy remain explicit HOST ports, not phone acceptance.
  AESEncryptionKey: {async import(bytes){backupKeyInputs.push(bytes);return{bytes:Uint8Array.from(bytes)};}},
  AESSealedData: {fromCombined(value,config){assert.deepEqual(config,{ivLength:12,tagLength:16});return{bytes:Buffer.from(value,'base64')};}},
  async aesEncryptAsync(clear,key,options){assert.equal(options.tagLength,16);assert.deepEqual(options.nonce,{length:12});const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key.bytes,iv);try{cipher.setAAD(options.additionalData);const value=Buffer.concat([iv,cipher.update(clear),cipher.final(),cipher.getAuthTag()]);return{async combined(encoding){assert.equal(encoding,'base64');return value.toString('base64');}};}finally{key.bytes.fill(0);}},
  async aesDecryptAsync(sealed,key,options){assert.equal(options.output,'bytes');const b=sealed.bytes,d=createDecipheriv('aes-256-gcm',key.bytes,b.subarray(0,12));try{d.setAAD(options.additionalData);d.setAuthTag(b.subarray(b.length-16));const clear=new Uint8Array(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));control.afterBackupDecrypt?.();return clear;}finally{key.bytes.fill(0);}},
  async getRandomBytesAsync(length) { control.randomness++; assert.equal(length, 32); return new Uint8Array(32).fill(10+control.randomness); },
} });
mock.module('react-native', { exports: { Platform: { OS: 'ios' }, AppState:{currentState:'active',addEventListener:()=>({remove(){}})} } });
mock.module(new URL('../src/custody/signing.mjs', import.meta.url).href, { exports: {
  ...signing,
  privateKeyFromHex(value) { const bytes = signing.privateKeyFromHex(value); privateBuffers.push(bytes); return bytes; },
} });
const { createDeviceIdentity, readDevicePublicKey, signReviewedChallenge, signReviewedReceipt,exportDeviceIdentityBackupV1,importDeviceIdentityBackupV1,
  signDeviceDepositConsentV1,signDeviceExitConsentV1 } = await import('../src/custody/key-store.ts');
const { retainPendingOperation, readPendingOperation, assertPendingOperationIdentity } = await import('../src/custody/pending-operations.ts');
function reset() {
  store.clear(); calls.length = 0; privateBuffers.length = 0; backupKeyInputs.length=0;
  Object.assign(control, { supported: true, approval: true, randomness: 0, invalidatePrivate: false, slowRead: null, discardPendingWrite: false,discardIdentityWrite:false,afterBackupDecrypt:null });
}
const challenge = ownerPublicKey => ({ version: 1, profile: MOBILE_AUTHORIZATION_PROFILE, origin: 'https://wallet.example',
  challengeId: 'a'.repeat(64), nonce: 'b'.repeat(64), expiresAt: Date.now() + 60_000, ownerPublicKey,
  intent: { requestId: 'original_request_0003', action: 'execute', kind: 'EXIT', chain: 'ethereum',
    assetId: 'c'.repeat(64), amountAtomic: '25', recipient: '0x' + 'd'.repeat(40), maxFeeAtomic: '1' } });

test('identity creation requires enrolled protection, native entropy and never rotates an original key', async () => {
  reset();
  const publicKey = await createDeviceIdentity(), originalPrivate = store.get(PRIVATE);
  assert.equal(publicKey.length, 130); assert.equal(await readDevicePublicKey(), publicKey);
  assert.equal(await createDeviceIdentity(), publicKey);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  const privateWrites = calls.filter(call => call.method === 'write' && call.key === PRIVATE);
  assert.equal(privateWrites.length, 1); assert.equal(privateWrites[0].options.requireAuthentication, true);
  store.delete(PUBLIC);
  assert.equal(await createDeviceIdentity(), publicKey);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
});

test('unsupported/cancelled/inaccessible custody fails before generating or replacing a key', async () => {
  reset(); control.supported = false;
  await assert.rejects(createDeviceIdentity(), /PROTECTED_STORAGE_UNAVAILABLE/);
  assert.equal(control.randomness, 0); assert.equal(store.size, 0);
  reset(); control.approval = false;
  await assert.rejects(createDeviceIdentity(), /AUTHENTICATION_CANCELLED/);
  assert.equal(control.randomness, 0); assert.equal(store.size, 0);
  reset(); const publicKey = await createDeviceIdentity(), originalPrivate = store.get(PRIVATE);
  control.invalidatePrivate = true;
  await assert.rejects(createDeviceIdentity(), /KEY_RECOVERY_REQUIRED/);
  await assert.rejects(signReviewedChallenge(challenge(publicKey), 'https://wallet.example'), /KEY_RECOVERY_REQUIRED/);
  assert.equal(control.randomness, 1); assert.equal(store.get(PRIVATE), originalPrivate);
});

test('signing binds origin, owner and expiry after authentication and clears mutable key buffers', async () => {
  reset(); const publicKey = await createDeviceIdentity(), original = challenge(publicKey);
  const signature = await signReviewedChallenge(original, original.origin);
  assert.equal(signature.length, 128);
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  await assert.rejects(signReviewedChallenge(original, 'https://other.example'), /ORIGIN_BINDING/);
  await assert.rejects(signReviewedChallenge({ ...original, ownerPublicKey: '04' + 'f'.repeat(128) }, original.origin), /OWNER_BINDING/);
  let clock = 1_000_000;
  const time = mock.method(Date, 'now', () => clock);
  const expiresSoon = { ...original, expiresAt: clock + 60_000 };
  control.slowRead = async () => { clock += 60_001; };
  try { await assert.rejects(signReviewedChallenge(expiresSoon, original.origin), /CHALLENGE_EXPIRED/); }
  finally { time.mock.restore(); }
  assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
});

test('pending original authorization survives a reopened store without automatic key or network work', async () => {
  reset(); const publicKey = await createDeviceIdentity(), original = challenge(publicKey);
  const signature = await signReviewedChallenge(original, original.origin);
  const operation = { authorization: { challenge: original, signature }, status: 'SUBMITTING' };
  const retained = await retainPendingOperation(operation);
  assert.equal(retained.economicState, 'UNRESOLVED');
  assert.deepEqual(retained.originalAuthorization, operation.authorization);
  assert.deepEqual(retained.authorizations, [operation]);
  const reads = calls.length;
  assert.deepEqual(await readPendingOperation(), retained);
  assert.equal(control.randomness, 1); assert.equal(calls.length, reads + 1);
  assert.ok(calls.filter(call => call.key.includes('pending')).every(call => call.options.requireAuthentication === true));
  const changed = { ...original, intent: { ...original.intent, requestId: 'replacement_request_0003' } };
  await assert.rejects(retainPendingOperation({ authorization: { challenge: changed,
    signature: await signReviewedChallenge(changed, changed.origin) }, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  assert.deepEqual(await readPendingOperation(), retained);
});

async function authorization(publicKey, action, overrides = {}) {
  const original = challenge(publicKey), originalAction = { execute: 'a', reconcile: 'e', recover: 'f', prepare: 'd' }[action];
  const reviewed = { ...original, challengeId: originalAction.repeat(64), ...overrides,
    intent: { ...original.intent, action, ...(overrides.intent ?? {}) } };
  return { challenge: reviewed, signature: await signReviewedChallenge(reviewed, reviewed.origin) };
}

test('rejected reconcile/recover permissions preserve original UNKNOWN execution and cannot replace its terms', async () => {
  reset(); const publicKey = await createDeviceIdentity();
  const execute = await authorization(publicKey, 'execute');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  for (const action of ['reconcile', 'recover']) {
    const next = await authorization(publicKey, action);
    await retainPendingOperation({ authorization: next, status: 'SUBMITTING' });
    await retainPendingOperation({ authorization: next, status: 'REJECTED' });
  }
  const saved = await readPendingOperation();
  assert.equal(saved.economicState, 'UNRESOLVED');
  assert.equal(saved.status, 'REJECTED'); // latest permission only
  assert.deepEqual(saved.originalAuthorization, execute);
  assert.deepEqual(saved.authorizations.map(row => [row.authorization.challenge.intent.action, row.status]),
    [['execute', 'UNKNOWN'], ['reconcile', 'REJECTED'], ['recover', 'REJECTED']]);
  const before = store.get('lianum.pending.authorizations.v1');
  for (const intent of [{ requestId: 'replacement_request_0003' }, { amountAtomic: '26' },
    { recipient: '0x' + 'e'.repeat(40) }, { maxFeeAtomic: '2' }, { assetId: 'e'.repeat(64) },
    { kind: 'TOP_UP' }, { chain: 'base' }]) {
    const changed = await authorization(publicKey, 'prepare', { intent });
    assert.throws(() => assertPendingOperationIdentity(saved, changed.challenge), /ORIGINAL_OPERATION_REQUIRED/);
    await assert.rejects(retainPendingOperation({ authorization: changed, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
    assert.equal(store.get('lianum.pending.authorizations.v1'), before);
  }
  const movedOrigin = await authorization(publicKey, 'prepare', { origin: 'https://foreign.example' });
  await assert.rejects(retainPendingOperation({ authorization: movedOrigin, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  const otherKey = signing.devicePublicKey(new Uint8Array(32).fill(12));
  assert.throws(() => assertPendingOperationIdentity(saved, { ...execute.challenge, ownerPublicKey: otherKey }), /ORIGINAL_OPERATION_REQUIRED/);
  assert.deepEqual(await readPendingOperation(), saved);
});

test('original per-action evidence survives concurrent updates and fresh challenges cannot resend that action', async () => {
  reset(); const publicKey = await createDeviceIdentity();
  const execute = await authorization(publicKey, 'execute'), reconcile = await authorization(publicKey, 'reconcile'),
    recover = await authorization(publicKey, 'recover');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  await Promise.all([retainPendingOperation({ authorization: reconcile, status: 'SUBMITTING' }),
    retainPendingOperation({ authorization: recover, status: 'SUBMITTING' })]);
  await Promise.all([retainPendingOperation({ authorization: reconcile, status: 'REJECTED' }),
    retainPendingOperation({ authorization: recover, status: 'REJECTED' })]);
  const saved = await readPendingOperation(), bytes = store.get('lianum.pending.authorizations.v1');
  assert.equal(saved.authorizations.length, 3); assert.deepEqual(saved.originalAuthorization, execute);
  assert.equal(saved.authorizations[0].status, 'UNKNOWN');
  const replacement = await authorization(publicKey, 'execute', { challengeId: '9'.repeat(64), nonce: '8'.repeat(64) });
  await assert.rejects(retainPendingOperation({ authorization: replacement, status: 'SUBMITTING' }), /ORIGINAL_AUTHORIZATION_REQUIRED/);
  await assert.rejects(retainPendingOperation({ authorization: execute, status: 'SUBMITTING' }), /AUTHORIZATION_STATE_CONFLICT/);
  await assert.rejects(retainPendingOperation({ authorization: reconcile, status: 'ACCEPTED' }), /AUTHORIZATION_STATE_CONFLICT/);
  assert.equal(store.get('lianum.pending.authorizations.v1'), bytes);
});

test('legacy REJECTED permissions remain economically unresolved without inventing earlier evidence', async () => {
  reset(); const publicKey = await createDeviceIdentity(), reconcile = await authorization(publicKey, 'reconcile');
  const legacy = JSON.stringify({ authorization: reconcile, status: 'REJECTED' });
  store.set('lianum.pending.authorizations.v1', legacy);
  const before = calls.length, saved = await readPendingOperation();
  assert.equal(saved.economicState, 'UNRESOLVED'); assert.equal(saved.legacyEvidenceIncomplete, true);
  assert.deepEqual(saved.originalAuthorization, reconcile); assert.equal(saved.authorizations.length, 1);
  assert.equal(calls.length, before + 1); assert.equal(store.get('lianum.pending.authorizations.v1'), legacy);
  const changed = await authorization(publicKey, 'prepare', { intent: { requestId: 'replacement_request_0003' } });
  await assert.rejects(retainPendingOperation({ authorization: changed, status: 'SUBMITTING' }), /ORIGINAL_OPERATION_REQUIRED/);
  const recover = await authorization(publicKey, 'recover');
  const next = await retainPendingOperation({ authorization: recover, status: 'SUBMITTING' });
  assert.equal(next.legacyEvidenceIncomplete, true); assert.deepEqual(next.originalAuthorization, reconcile);
  assert.deepEqual(next.authorizations[0], { authorization: reconcile, status: 'REJECTED' });
});

test('pending write readback and invalid economic markers fail before returning a dispatchable authorization', async () => {
  reset(); const publicKey = await createDeviceIdentity(), execute = await authorization(publicKey, 'execute');
  control.discardPendingWrite = true;
  await assert.rejects(retainPendingOperation({ authorization: execute, status: 'SUBMITTING' }), /PENDING_READBACK_FAILED/);
  assert.equal(await readPendingOperation(), null);
  control.discardPendingWrite = false;
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  const key = 'lianum.pending.authorizations.v1', original = store.get(key), altered = JSON.parse(original);
  altered.economicState = 'REJECTED'; store.set(key, JSON.stringify(altered));
  await assert.rejects(readPendingOperation(), /PENDING_STATE_INVALID/);
  store.set(key, original);
  assert.equal((await readPendingOperation()).economicState, 'UNRESOLVED');
});

test('fresh protected receipt signing preserves an expired original and updates only its permission admission', async () => {
  reset();
  const publicKey = await createDeviceIdentity(), execute = await authorization(publicKey, 'execute');
  await retainPendingOperation({ authorization: execute, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: execute, status: 'UNKNOWN' });
  const recover = await authorization(publicKey, 'recover');
  await retainPendingOperation({ authorization: recover, status: 'SUBMITTING' });
  await retainPendingOperation({ authorization: recover, status: 'REJECTED' });
  let clock = execute.challenge.expiresAt + 1;
  const time = mock.method(Date, 'now', () => clock);
  const review = { authorization: execute, nonce: '8'.repeat(64), expiresAt: clock + 60_000 };
  try {
    const signature = await signReviewedReceipt(review, execute.challenge.origin);
    const expectedKey = signing.privateKeyFromHex(store.get(PRIVATE));
    try { assert.equal(signature, signing.signDeviceMessage(expectedKey, mobileReceiptMessage(review))); }
    finally { expectedKey.fill(0); }
    const observed = await retainPendingOperation({ authorization: execute, status: 'ACCEPTED' });
    assert.equal(observed.economicState, 'UNRESOLVED'); assert.deepEqual(observed.originalAuthorization, execute);
    assert.deepEqual(observed.authorizations.map(row => row.status), ['ACCEPTED', 'REJECTED']);
    await assert.rejects(retainPendingOperation({ authorization: execute, status: 'UNKNOWN' }), /STATE_CONFLICT/);
    assert.deepEqual((await readPendingOperation()).authorizations.map(row => row.status), ['ACCEPTED', 'REJECTED']);
    control.slowRead = async () => { clock += 60_001; };
    await assert.rejects(signReviewedReceipt(review, execute.challenge.origin), /RECEIPT_EXPIRED/);
    assert.ok(privateBuffers.every(bytes => bytes.every(byte => byte === 0)));
  } finally { time.mock.restore(); }
});


test('sealed identity backup restores the SAME PoP after total loss and rejects corruption, replacement and ambiguous writes', async()=>{
  reset();const {sealDeviceCustodyBackupV1}=await import('../src/custody/sealed-custody-backup-v1.mjs');
  const publicKey=await createDeviceIdentity(),originalPrivate=store.get(PRIVATE),review=challenge(publicKey),originalSignature=await signReviewedChallenge(review,review.origin);
  const oversized=new Uint8Array(65537);Object.defineProperty(oversized,'length',{get(){throw Error('CALLER_LENGTH_GETTER');}});
  await assert.rejects(sealDeviceCustodyBackupV1(oversized,'una contraseña original separada',{profile:'DEVICE_IDENTITY_CUSTODY_V1',devicePublicKey:publicKey,routeSHA256:null}),/BACKUP_INVALID/);
  const password='una contraseña original separada',sealed=await exportDeviceIdentityBackupV1(password,publicKey);
  assert.equal(sealed.includes(originalPrivate),false);assert.equal(sealed.includes('privateKeyHex'),false);assert.equal(sealed.includes('DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1'),false);
  const envelope=JSON.parse(sealed);assert.equal(envelope.binding.devicePublicKey,publicKey);assert.equal(envelope.binding.routeSHA256,null);
  assert.deepEqual({name:envelope.kdf.name,N:envelope.kdf.N,r:envelope.kdf.r,p:envelope.kdf.p},{name:'scrypt',N:32768,r:8,p:1});
  store.clear();const writes=()=>calls.filter(c=>c.method==='write').length,before=writes();
  await assert.rejects(importDeviceIdentityBackupV1(sealed,'otra contraseña equivocada',publicKey),/BACKUP_AUTHENTICATION/);assert.equal(writes(),before);assert.equal(store.size,0);
  const corrupt=structuredClone(envelope);corrupt.sealed=(corrupt.sealed[0]==='A'?'B':'A')+corrupt.sealed.slice(1);
  await assert.rejects(importDeviceIdentityBackupV1(JSON.stringify(corrupt),password,publicKey),/BACKUP_AUTHENTICATION/);assert.equal(writes(),before);
  const weak=structuredClone(envelope);weak.kdf.N=2;await assert.rejects(importDeviceIdentityBackupV1(JSON.stringify(weak),password,publicKey),/BACKUP_INVALID/);assert.equal(writes(),before);
  await assert.rejects(importDeviceIdentityBackupV1(sealed,password,signing.devicePublicKey(new Uint8Array(32).fill(12))),/BACKUP_BINDING/);assert.equal(writes(),before);
  const restored=await importDeviceIdentityBackupV1(sealed,password,publicKey);assert.deepEqual(restored,{devicePublicKey:publicKey,restored:true});
  assert.equal(store.get(PRIVATE),originalPrivate);assert.equal(await readDevicePublicKey(),publicKey);assert.equal(await signReviewedChallenge(review,review.origin),originalSignature);
  assert.equal(control.randomness,2); // Only the original key and backup salt, never a replacement key.
  const unchanged=writes();await importDeviceIdentityBackupV1(sealed,password,publicKey);assert.equal(writes(),unchanged);
  const foreign=signing.devicePublicKey(new Uint8Array(32).fill(12));store.set(PRIVATE,'0c'.repeat(32));store.set(PUBLIC,foreign);
  await assert.rejects(importDeviceIdentityBackupV1(sealed,password,publicKey),/BACKUP_CONFLICT/);assert.equal(store.get(PRIVATE),'0c'.repeat(32));assert.equal(store.get(PUBLIC),foreign);
  store.clear();control.approval=false;await assert.rejects(importDeviceIdentityBackupV1(sealed,password,publicKey),/AUTHENTICATION_CANCELLED/);assert.equal(store.size,0);control.approval=true;
  const controller=new AbortController();control.afterBackupDecrypt=()=>controller.abort();
  await assert.rejects(importDeviceIdentityBackupV1(sealed,password,publicKey,controller.signal),/BACKUP_CANCELLED/);assert.equal(store.size,0);control.afterBackupDecrypt=null;
  control.discardIdentityWrite=true;await assert.rejects(importDeviceIdentityBackupV1(sealed,password,publicKey),/BACKUP_WRITE_UNCERTAIN/);assert.equal(store.size,0);control.discardIdentityWrite=false;
  store.set(PUBLIC,publicKey);await importDeviceIdentityBackupV1(sealed,password,publicKey);assert.equal(store.get(PRIVATE),originalPrivate);assert.equal(store.get(PUBLIC),publicKey);
  assert.ok(privateBuffers.every(bytes=>bytes.every(b=>b===0)));assert.ok(backupKeyInputs.every(bytes=>bytes.every(b=>b===0)));
});


test('protected Native private V2 signing accepts original W39 framing without widening legacy or replacing custody',async()=>{
 reset();const publicKey=await createDeviceIdentity(),originalPrivate=store.get(PRIVATE),originalKey=signing.privateKeyFromHex(originalPrivate);
 const fixture=deviceReservationFixtureV1(originalKey),hex=n=>n.toString(16).padStart(64,'0');
 const publicObject=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(publicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(publicKey.slice(66),'hex').toString('base64url')}});
 function consent(method){const base={version:2,profile:method==='fund'?DEVICE_NATIVE_PRIVATE_DEPOSIT_V2:DEVICE_NATIVE_PRIVATE_EXIT_V2,action:method==='fund'?'FUND_D26':'WITHDRAW_W39',...fixture.descriptor,
  challengeId:hex(100),nonce:hex(101),expiresAt:Date.now()+15000,binding:structuredClone(fixture.consent.binding),poolTerms:structuredClone(fixture.consent.poolTerms),rootId:hex(102),noteRevision:1,jobId:hex(103),
  witnessSHA256:hex(104),proofSHA256:hex(105),publicInputsSHA256:hex(106),observed:{blockNumber:'1',blockHash:hex(107),timestamp:'6000'},openingDisclosure:null,privateProof:null};
  if(method==='fund')base.statement={scope:base.poolTerms.scope,policy:base.poolTerms.policy,epoch:'10',amount:'500',output:hex(108)};
  else Object.assign(base,{parentJobId:hex(109),nativeBindingSHA256:hex(110),quoteId:hex(111),noteRole:'change',statement:{scope:base.poolTerms.scope,policy:base.poolTerms.policy,epoch:'10',root:hex(112),nullifier:hex(113),amount:'400',recipient:'e1'.repeat(20),commitment:hex(114)}});
  return(method==='fund'?normalizeNativePrivateDepositConsentV2:normalizeNativePrivateExitConsentV2)(base);}
 let time;try{
  for(const method of ['fund','withdraw']){const value=consent(method),message=(method==='fund'?deviceDepositConsentEitherMessageV2:deviceExitConsentEitherMessageV2)(value),sign=method==='fund'?signDeviceDepositConsentV1:signDeviceExitConsentV1;
   try{assert.ok(message.length<=8192);if(method==='withdraw'){assert.ok(message.length>4096);assert.throws(()=>signing.signDeviceMessage(originalKey,message),/MOBILE_MESSAGE_INVALID/);}
    const signature=await sign(value,value.origin,value.pairingId);assert.equal(verify('sha256',message,{key:publicObject,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),true);
    const substituted=structuredClone(value);substituted.statement.amount='1';const changed=(method==='fund'?deviceDepositConsentEitherMessageV2:deviceExitConsentEitherMessageV2)(substituted);
    try{assert.equal(verify('sha256',changed,{key:publicObject,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),false);}finally{changed.fill(0);}
    const before=calls.length;await assert.rejects(sign(value,'https://other.example',value.pairingId),/MOBILE_REVIEW_CHANGED/);assert.equal(calls.slice(before).some(c=>c.key===PRIVATE),false);
   }finally{message.fill(0);}}
  assert.throws(()=>signing.signNativePrivateDeviceConsentV2(originalKey,{version:1,profile:DEVICE_NATIVE_PRIVATE_EXIT_V2}),/PRIVATE_SIGNING_INVALID/);
  assert.throws(()=>signing.signNativePrivateDeviceConsentV2(originalKey,new Uint8Array(8193)),/PRIVATE_SIGNING_INVALID/);
  let invoked=false;assert.throws(()=>signing.signNativePrivateDeviceConsentV2(originalKey,{version:2,get profile(){invoked=true;return DEVICE_NATIVE_PRIVATE_EXIT_V2;}}),/PRIVATE_SIGNING_INVALID/);assert.equal(invoked,false);
  const value=consent('withdraw');let now=Date.now();time=mock.method(Date,'now',()=>now);control.slowRead=async()=>{now=value.expiresAt;};
  await assert.rejects(signDeviceExitConsentV1(value,value.origin,value.pairingId),/MOBILE_NATIVE_PRIVATE_W39_INVALID/);
  assert.equal(store.get(PRIVATE),originalPrivate);assert.ok(privateBuffers.every(bytes=>bytes.every(byte=>byte===0)));
 }finally{time?.mock.restore();originalKey.fill(0);control.slowRead=null;}
});
