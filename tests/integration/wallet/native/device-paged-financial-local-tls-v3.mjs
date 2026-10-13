/** Fixed software TLS infrastructure for one fresh LOCAL Mixed attempt.
 * Returned PEM DATA grants no account, proof, runtime or financial authority. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {lstat,realpath,readdir,mkdtemp,open,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,X509Certificate,createPublicKey} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const project=resolve(fileURLToPath(new URL('../../../../',import.meta.url))),root=join(project,'.local/device-paged-mixed-v3'),run=promisify(execFile);
const need=(value,code)=>{if(!value)throw Error(code);};
async function directory(path){const state=await lstat(path);need(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o777)===0o700&&await realpath(path)===path,'PAGED_MIXED_TLS_PRIVATE_DIRECTORY');return state;}
async function reserveFile(path,bytes){
 const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(bytes);await handle.sync();return await handle.stat();}finally{await handle.close();bytes.fill(0);}
}
async function privateFile(path,original,maximum){
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{
  const before=await handle.stat();need(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=maximum,'PAGED_MIXED_TLS_PRIVATE_FILE');
  for(const key of ['dev','ino','uid','mode','nlink'])assert.equal(before[key],original[key],'PAGED_MIXED_TLS_ORIGINAL_FILE');
  bytes=Buffer.alloc(before.size+1);need((await handle.read(bytes,0,bytes.length,0)).bytesRead===before.size,'PAGED_MIXED_TLS_FILE_BOUND');
  const after=await handle.stat(),named=await lstat(path);need(!named.isSymbolicLink()&&await realpath(path)===path,'PAGED_MIXED_TLS_ORIGINAL_FILE');
  for(const key of ['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]),assert.equal(before[key],named[key]);
  return bytes.subarray(0,before.size).toString('utf8');
 }finally{bytes?.fill(0);await handle.close();}
}

export async function createOriginalPagedMixedLocalTlsV3(attempt){
 need(arguments.length===1&&typeof attempt==='string'&&resolve(attempt)===attempt&&dirname(attempt)===root&&/^attempt-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attempt.slice(root.length+1)),'PAGED_MIXED_TLS_FIXED_ATTEMPT');
 await directory(root);const attemptState=await directory(attempt);need((await readdir(attempt)).length===0,'PAGED_MIXED_TLS_FRESH_ATTEMPT');
 let temporary,temporaryState,key=null,cert=null,pair=null;
 try{
  temporary=await mkdtemp(join(attempt,'.software-tls-v3-'));temporaryState=await directory(temporary);
  pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});key=pair.privateKey.export({format:'pem',type:'pkcs8'});
  const keyPath=join(temporary,'key.pem'),certPath=join(temporary,'certificate.pem'),keyState=await reserveFile(keyPath,Buffer.from(key)),certState=await reserveFile(certPath,Buffer.alloc(0));
  try{await run('/usr/bin/openssl',['req','-new','-x509','-sha256','-config','/dev/null','-key',keyPath,'-out',certPath,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature','-addext','extendedKeyUsage=serverAuth'],{timeout:15000,maxBuffer:8192,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TMPDIR:temporary}});}catch{throw Error('PAGED_MIXED_TLS_GENERATION_FAILED');}
  cert=await privateFile(certPath,certState,16384);need(await privateFile(keyPath,keyState,8192)===key,'PAGED_MIXED_TLS_PRIVATE_KEY_CHANGED');
  const leaf=new X509Certificate(cert),now=Date.now();need(!leaf.ca&&leaf.checkIP('127.0.0.1')==='127.0.0.1'&&leaf.subjectAltName==='IP Address:127.0.0.1'&&leaf.checkPrivateKey(pair.privateKey)&&leaf.verify(leaf.publicKey),'PAGED_MIXED_TLS_ORIGINAL_LEAF');
  need(leaf.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(pair.privateKey).export({type:'spki',format:'der'}))&&now>=Date.parse(leaf.validFrom)&&now<Date.parse(leaf.validTo)&&Date.parse(leaf.validTo)-Date.parse(leaf.validFrom)===86400000,'PAGED_MIXED_TLS_LEAF_VALIDITY');
  const current=await directory(attempt);need(current.dev===attemptState.dev&&current.ino===attemptState.ino,'PAGED_MIXED_TLS_ORIGINAL_ATTEMPT');
  return Object.freeze({cert,key});
 }finally{
  key=null;cert=null;pair=null;
  if(temporary){const current=await directory(temporary);need(current.dev===temporaryState.dev&&current.ino===temporaryState.ino,'PAGED_MIXED_TLS_ORIGINAL_TEMPORARY');await rm(temporary,{recursive:true,force:false});}
 }
}
