/** Android ByteArray boundary with real AES-GCM; no hardware or economic effects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

test('stored AES base64 crosses the Android Uint8Array boundary and preserves authentication',async t=>{
 const keyBytes=randomBytes(32),key={},aad=new TextEncoder().encode('original-private-custody-route'),plain=new TextEncoder().encode('same encrypted custody, without rotating its identity');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes,iv);
 cipher.setAAD(aad);const combined=Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]),serialized=combined.toString('base64');
 const inputs=[],nativeCopies=[];let rejectConstructor=false;
 t.after(()=>{keyBytes.fill(0);combined.fill(0);plain.fill(0);aad.fill(0);for(const copy of nativeCopies)copy.fill(0);});
 t.mock.module('expo-crypto',{exports:{
  AESSealedData:{fromCombined(raw,config){
   assert.ok(raw instanceof Uint8Array,'ANDROID_AES_FROM_COMBINED_REQUIRES_UINT8ARRAY');
   assert.deepEqual(config,{ivLength:12,tagLength:16});inputs.push(raw);
   if(rejectConstructor)throw Error('ANDROID_NATIVE_CONSTRUCTOR_REJECTED');
   // The actual JSI converter copies into a new Java ByteArray before SealedData.
   const bytes=Buffer.from(raw);nativeCopies.push(bytes);return{bytes};
  }},
  async aesDecryptAsync(sealed,actualKey,options){
   assert.strictEqual(actualKey,key);assert.equal(options.output,'bytes');
   await Promise.resolve();
   const bytes=sealed.bytes,decipher=createDecipheriv('aes-256-gcm',keyBytes,bytes.subarray(0,12));
   decipher.setAAD(options.additionalData);decipher.setAuthTag(bytes.subarray(-16));
   return Uint8Array.from(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]));
  }
 }});
 const {decryptExpoAesBase64V1}=await import('../src/custody/expo-aes-base64-v1.mjs');
 const options={output:'bytes',additionalData:aad},limit=16384;
 const base64Error=error=>error.message==='MOBILE_CUSTODY_AES_BASE64';
 const decryptError=error=>error.message==='MOBILE_CUSTODY_AES_DECRYPT';

 await t.test('malformed, noncanonical and over-budget input is rejected before native allocation',async()=>{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',canonical=Buffer.alloc(31,17).toString('base64'),last=canonical.length-3;
  const noncanonical=canonical.slice(0,last)+alphabet[alphabet.indexOf(canonical[last])|1]+canonical.slice(last+1);
  for(const raw of [null,7,'','A','!!!!','AA=','AAA===','AA A=',noncanonical,Buffer.alloc(27).toString('base64')])
   await assert.rejects(()=>decryptExpoAesBase64V1(raw,key,options,limit),base64Error);
  await assert.rejects(()=>decryptExpoAesBase64V1(serialized,key,options,serialized.length-1),base64Error);
  assert.equal(inputs.length,0);
 });

 await t.test('AES-GCM round trip uses IV12/tag16, keeps plaintext and wipes its temporary JS bytes',async()=>{
  const opened=await decryptExpoAesBase64V1(serialized,key,options,limit);
  assert.deepEqual(opened,plain);assert.equal(inputs.length,1);assert.ok(inputs[0].every(byte=>byte===0));
  assert.deepEqual(nativeCopies[0],combined);assert.ok(opened.some(byte=>byte!==0));opened.fill(0);
 });

 await t.test('ciphertext tampering and wrong AAD fail authentication and wipe input bytes',async()=>{
  const tampered=Buffer.from(combined);tampered[12]^=1;
  try{await assert.rejects(()=>decryptExpoAesBase64V1(tampered.toString('base64'),key,options,limit),decryptError);}
  finally{tampered.fill(0);}
  const wrongAAD=new TextEncoder().encode('other-custody-route');
  try{await assert.rejects(()=>decryptExpoAesBase64V1(serialized,key,{output:'bytes',additionalData:wrongAAD},limit),decryptError);}
  finally{wrongAAD.fill(0);}
  assert.ok(inputs.slice(1).every(bytes=>bytes.every(byte=>byte===0)));
 });

 await t.test('a native constructor rejection also wipes its decoded JS buffer',async()=>{
  rejectConstructor=true;
  await assert.rejects(()=>decryptExpoAesBase64V1(serialized,key,options,limit),decryptError);
  assert.ok(inputs.at(-1).every(byte=>byte===0));
 });
});
