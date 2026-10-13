/** Real OpenSSL leaf generation and Node certificate/key verification only.
 * No original operator, listener, proof, signer or economic request is started. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readdir,readFile,writeFile,lstat,rm,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,X509Certificate,createPrivateKey,createPublicKey} from 'node:crypto';
import {createOriginalPagedMixedLocalTlsV3} from './device-paged-financial-local-tls-v3.mjs';
const root=join(resolve(fileURLToPath(new URL('../../../../',import.meta.url))),'.local/device-paged-mixed-v3');
async function attempt(t){await mkdir(root,{recursive:true,mode:0o700});const path=join(root,'attempt-'+randomUUID());await mkdir(path,{mode:0o700});t.after(()=>rm(path,{recursive:true,force:true}));return path;}

test('fresh attempt receives a matching fixed-IP CA:false TLS leaf and retains no temporary private files',async t=>{
 const path=await attempt(t),tls=await createOriginalPagedMixedLocalTlsV3(path);assert.deepEqual(Object.keys(tls).sort(),['cert','key']);assert.ok(Object.isFrozen(tls));
 const leaf=new X509Certificate(tls.cert),key=createPrivateKey(tls.key);assert.equal(leaf.ca,false);assert.equal(leaf.subjectAltName,'IP Address:127.0.0.1');assert.equal(leaf.checkIP('127.0.0.1'),'127.0.0.1');assert.equal(leaf.checkIP('127.0.0.2'),undefined);assert.equal(leaf.checkPrivateKey(key),true);assert.equal(leaf.verify(leaf.publicKey),true);
 assert.ok(leaf.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(key).export({type:'spki',format:'der'})));assert.equal(key.asymmetricKeyType,'ec');assert.equal(key.asymmetricKeyDetails.namedCurve,'prime256v1');assert.equal(Date.parse(leaf.validTo)-Date.parse(leaf.validFrom),86400000);assert.ok(Date.now()>=Date.parse(leaf.validFrom)&&Date.now()<Date.parse(leaf.validTo));
 assert.deepEqual(await readdir(path),[]);assert.equal((await lstat(path)).mode&0o777,0o700);
});

test('existing attempt files and symlink targets are preserved; callers cannot choose another realm or host',async t=>{
 const retained=await attempt(t),sentinel=join(retained,'retained-sentinel.json'),bytes=Buffer.from('{"public-test-marker":true}\n');await writeFile(sentinel,bytes,{flag:'wx',mode:0o600});
 await assert.rejects(createOriginalPagedMixedLocalTlsV3(retained),/PAGED_MIXED_TLS_FRESH_ATTEMPT/);assert.deepEqual(await readFile(sentinel),bytes);assert.deepEqual(await readdir(retained),['retained-sentinel.json']);
 const alias=join(root,'attempt-'+randomUUID());await symlink(retained,alias);t.after(()=>rm(alias,{force:true}));await assert.rejects(createOriginalPagedMixedLocalTlsV3(alias),/PAGED_MIXED_TLS_PRIVATE_DIRECTORY/);assert.deepEqual(await readFile(sentinel),bytes);
 await assert.rejects(createOriginalPagedMixedLocalTlsV3(join(root,'attempt-caller')),/PAGED_MIXED_TLS_FIXED_ATTEMPT/);await assert.rejects(createOriginalPagedMixedLocalTlsV3(root),/PAGED_MIXED_TLS_FIXED_ATTEMPT/);await assert.rejects(createOriginalPagedMixedLocalTlsV3(retained,{host:'caller'}),/PAGED_MIXED_TLS_FIXED_ATTEMPT/);assert.deepEqual(await readFile(sentinel),bytes);
});
