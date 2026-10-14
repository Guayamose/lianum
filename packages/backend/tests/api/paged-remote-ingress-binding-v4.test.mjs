/** Real ephemeral TLS keys/certificate, HOST-only assigned-interface fixture.
 * No operator, wallet, proof, network listener or financial permission starts. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
mock.module('node:os',{namedExports:{networkInterfaces:()=>({host:[{family:'IPv4',internal:false,address:'10.71.0.3'}]})}});
const R=await import('../../src/api/mobile/paged-remote-ingress-binding-v4.mjs');
const run=promisify(execFile);

test('remote listener has a separate fixed private port, real TLS key binding and opaque transport ownership',async()=>{
 const path=await mkdtemp(join(tmpdir(),'lianum-remote-tls-host-'));
 const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
 try{
  await writeFile(join(path,'key.pem'),key,{mode:0o600});
  await run('/usr/bin/openssl',['req','-new','-x509','-key',join(path,'key.pem'),'-out',join(path,'cert.pem'),'-days','1',
   '-subj','/CN=api.lianum.oryontechnology.com','-addext','subjectAltName=IP:10.71.0.3,DNS:api.lianum.oryontechnology.com',
   '-addext','basicConstraints=critical,CA:FALSE'],{timeout:15000,maxBuffer:8192});
  const cert=await readFile(join(path,'cert.pem'),'utf8'),configuration={origin:R.PAGED_REMOTE_ORIGIN_V4,host:'10.71.0.3',port:9445,
   privateTLS:{key,cert},publicCertificatePEM:cert};
  const binding=R.createOriginalPagedRemoteIngressBindingV4(configuration),read=R.readOriginalPagedRemoteIngressBindingV4(binding);
  assert.equal(read.origin,'https://api.lianum.oryontechnology.com');assert.equal(new URL(read.origin).port,'');assert.equal(read.port,9445);
  assert.ok(Object.isFrozen(read)&&Object.isFrozen(read.privateTLS));assert.match(read.publicCertificateSHA256,/^[a-f0-9]{64}$/);
  for(const copied of [{},structuredClone(binding),read,structuredClone(read)])assert.throws(()=>R.readOriginalPagedRemoteIngressBindingV4(copied),/PAGED_REMOTE_ORIGINAL_BINDING/);
  for(const change of [{origin:'https://attacker.invalid'},{host:'10.71.0.4'},{host:'0.0.0.0'},{port:443},{port:9446}])assert.throws(()=>R.createOriginalPagedRemoteIngressBindingV4({...configuration,...change}),/PAGED_REMOTE_/);
  const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
  assert.throws(()=>R.createOriginalPagedRemoteIngressBindingV4({...configuration,privateTLS:{key:other,cert}}),/PAGED_REMOTE_PRIVATE_TLS_BINDING/);
  const wall=Date.now;try{Date.now=()=>wall()+2*86400000;assert.throws(()=>R.readOriginalPagedRemoteIngressBindingV4(binding),/PAGED_REMOTE_TLS_VALIDITY/);}finally{Date.now=wall;}
  R.closeOriginalPagedRemoteIngressBindingV4(binding);assert.throws(()=>R.readOriginalPagedRemoteIngressBindingV4(binding),/PAGED_REMOTE_ORIGINAL_BINDING/);
 }finally{await rm(path,{recursive:true,force:false});}
});
