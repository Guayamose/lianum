/** Fixed native-runtime private retention primitives. No runtime launch or caller-selected root. */
import assert from 'node:assert/strict';
import{createHash}from'node:crypto';import{constants}from'node:fs';
import{realpath,lstat,readdir,open,rename}from'node:fs/promises';import{join,dirname,basename}from'node:path';
import{projectRoot}from'../../../../../engine/src/chains/shared/runtime-harness.mjs';
const ROOT=join(projectRoot,'.local/integrations'),MAX_RECORD=64*1024*1024,MAX_FILES=20000,MAX_TOTAL=8*1024*1024*1024;
const SHA=b=>createHash('sha256').update(b).digest('hex');
const privateNames=new Set(['wrapped-runtime-capture.json','wrapped-runtime-terminal.json']);
export async function assertOwnedRecoveryScratchV1(cwd,prefix){
 assert.equal(typeof cwd,'string');assert.equal(await realpath(cwd),cwd);assert.equal(dirname(cwd),await realpath(ROOT));assert.ok(basename(cwd).startsWith(prefix));
 const s=await lstat(cwd);assert.ok(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.mode&0o077,0,'NATIVE_RECOVERY_PRIVATE_DIRECTORY');return cwd;
}
async function readFixed(path,max){
 const a=await lstat(path);assert.ok(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1);assert.ok(a.size>=0&&a.size<=max,'NATIVE_RECOVERY_FILE_BOUND');
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();for(const k of['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(s[k],a[k]);const raw=await f.readFile(),z=await f.stat();for(const k of['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(z[k],a[k]);assert.equal(raw.length,a.size);return raw;}finally{await f.close();}
}
export async function writePrivateRuntimeRecoveryV1(cwd,name,value){
 assert.ok(privateNames.has(name));const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length>0&&bytes.length<=MAX_RECORD,'NATIVE_RECOVERY_RECORD_BOUND');const path=join(cwd,name),tmp=path+'.next';
 const f=await open(tmp,'wx',0o600);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await rename(tmp,path);const d=await open(cwd,'r');try{await d.sync();}finally{await d.close();}
 return{path:name,bytes:bytes.length,sha256:SHA(bytes)};
}
export async function readPrivateRuntimeRecoveryV1(cwd,pin){
 assert.ok(privateNames.has(pin.path));const path=join(cwd,pin.path),s=await lstat(path);assert.equal(s.mode&0o777,0o600);const b=await readFixed(path,MAX_RECORD);assert.equal(b.length,pin.bytes);assert.equal(SHA(b),pin.sha256);return JSON.parse(b);
}
export async function sealStoppedNativeFilesV1(cwd){
 const files=[];let total=0;
 async function walk(relative=''){
  const dir=relative?join(cwd,relative):cwd;assert.equal(await realpath(dir),dir);const s=await lstat(dir);assert.ok(s.isDirectory()&&!s.isSymbolicLink());
  for(const name of(await readdir(dir)).sort()){
   assert.ok(name!=='.'&&name!=='..'&&!name.includes('/'));const path=relative?relative+'/'+name:name;if(!relative&&privateNames.has(name))continue;
   const full=join(cwd,path),a=await lstat(full);assert.ok(!a.isSymbolicLink(),'NATIVE_RECOVERY_SYMLINK');
   if(a.isDirectory()){await walk(path);continue;}
   if(a.isSocket()){assert.equal(path,'ledger/admin.rpc','NATIVE_RECOVERY_UNEXPECTED_SOCKET');continue;}
   assert.ok(a.isFile()&&a.nlink===1&&a.size<=2*1024*1024*1024);const f=await open(full,constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256'),buffer=Buffer.alloc(256*1024);let size=0;try{for(;;){const {bytesRead}=await f.read(buffer,0,buffer.length,null);if(!bytesRead)break;size+=bytesRead;assert.ok(size<=a.size);hash.update(buffer.subarray(0,bytesRead));}await f.sync();const z=await f.stat();for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(a[k],z[k]);}finally{await f.close();}assert.equal(size,a.size);total+=size;assert.ok(total<=MAX_TOTAL&&files.length<MAX_FILES,'NATIVE_RECOVERY_TREE_BOUND');files.push({path,bytes:size,sha256:hash.digest('hex'),mode:(a.mode&0o777).toString(8).padStart(4,'0')});
  }
  const directory=await open(dir,'r');try{await directory.sync();}finally{await directory.close();}
 }
 await walk();return{files,totalBytes:total};
}
export async function assertStoppedNativeFilesV1(cwd,expected){assert.deepEqual(await sealStoppedNativeFilesV1(cwd),expected,'NATIVE_RECOVERY_RETAINED_FILES_CHANGED');}
export const cloneRuntimeRecoveryV1=value=>JSON.parse(JSON.stringify(value));

/** One permanent admission per captured process generation. A failed reopen burns
 * this claim too: neither cleanup nor authority replacement may reset it. */
export async function claimStoppedNativeRecoveryV1(cwd,record){
 assert.ok(Number.isSafeInteger(record.processGeneration)&&record.processGeneration>=0&&record.processGeneration<16,'NATIVE_RECOVERY_GENERATION');
 assert.ok(record.cwd===cwd&&record.privateRecord&&/^[0-9a-f]{64}$/.test(record.privateRecord.sha256),'NATIVE_RECOVERY_CLAIM_IDENTITY');
 const path=join(cwd,`wrapped-runtime-open-${record.processGeneration}.json`);
 const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(JSON.stringify({schema:'NATIVE_RECOVERY_PERMANENT_OPEN_CLAIM_V1',generation:record.processGeneration,captureSHA256:record.privateRecord.sha256}));await file.sync();}finally{await file.close();}
 const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
}

/** Preserve only live economic signers before native activity. Bootstrap/nonce
 * creation keys are intentionally excluded and retain their existing erasure. */
export async function writeOriginalSolanaEconomicKeysV1(cwd,value){
 await assertOwnedRecoveryScratchV1(cwd,'flat-solana-');
 assert.deepEqual(Object.keys(value).sort(),['keys','schema']);
 assert.equal(value?.schema,'OWNED_SOLANA_ORIGINAL_ECONOMIC_KEYS_V1');
 assert.deepEqual(Object.keys(value.keys).sort(),['recipient','recipient1','solver','unusedMint']);
 for(const row of Object.values(value.keys)){assert.deepEqual(Object.keys(row).sort(),['address','publicHex','seedHex']);assert.match(row.publicHex,/^[0-9a-f]{64}$/);assert.match(row.seedHex,/^[0-9a-f]{64}$/);assert.ok(typeof row.address==='string'&&row.address.length>=32&&row.address.length<=44);}
 const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length>0&&bytes.length<=8192,'SOLANA_ORIGINAL_ECONOMIC_KEY_BOUND');
 const path=join(cwd,'wrapped-runtime-original-economic-keys.json');
 const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
 const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
 return{path:'wrapped-runtime-original-economic-keys.json',bytes:bytes.length,sha256:SHA(bytes)};
}

/** Fixed original-construction credential backup; no restore/signing authority. */
export async function writeInitialNativeCredentialsV1(cwd,family,value){
 assert.ok(['receiver','graphNative','bitcoin'].includes(family),'NATIVE_INITIAL_FIXED_FAMILY');
 const prefix={receiver:'flat-owned-evm-v2-',graphNative:'flat-owned-evm-native-value-v1-',bitcoin:'flat-bitcoin-'}[family];assert.ok(prefix,'NATIVE_INITIAL_FIXED_FAMILY');await assertOwnedRecoveryScratchV1(cwd,prefix);assert.equal(value.family,family);
 const evm=family!=='bitcoin';assert.equal(value.schema,evm?'OWNED_FIXED_EVM_INITIAL_CREDENTIALS_V1':'OWNED_FIXED_BITCOIN_INITIAL_CREDENTIALS_V1');
 assert.deepEqual(Object.keys(value).sort(),(evm?['schema','family','profile','runtimePin','accounts','mnemonic']:['schema','family','genesis','runtimePins','rpcPassword','profiles']).sort());
 if(evm){assert.ok(typeof value.mnemonic==='string'&&/^[a-z]+(?: [a-z]+){11}$/.test(value.mnemonic));assert.ok(Array.isArray(value.accounts)&&value.accounts.length===5);}else assert.match(value.rpcPassword,/^[0-9a-f]{64}$/);
 const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length>0&&bytes.length<=65536,'NATIVE_INITIAL_CREDENTIAL_BOUND');
 const name='wrapped-runtime-initial-credentials.json',file=await open(join(cwd,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
 return{path:name,bytes:bytes.length,sha256:SHA(bytes)};
}
