/** Host cryptographic/storage conformance only. No nodes/proofs/benchmark.
 * Test-only module spies count KDF calls and inject a post-rename fsync fault;
 * production exposes neither a raw key nor an I/O callback. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { canonical, decryptJson } from '../../../../engine/src/crypto/privacy.mjs';
const keys = [], events = []; let failDirectorySync = null;
const named = module => Object.fromEntries(Object.entries(module).filter(([name]) => name !== 'default'));
mock.module('node:crypto', { exports: { ...named(crypto), scryptSync(...args) {
  const key = crypto.scryptSync(...args); keys.push(key); return key;
} } });
mock.module('node:fs/promises', { exports: { ...named(fs),
  async open(path, flags, mode) {
    const handle = await fs.open(path, flags, mode);
    return { read: handle.read.bind(handle), stat: handle.stat.bind(handle),
      async writeFile(...args) { events.push({kind:'write',path:String(path)}); return handle.writeFile(...args); },
      async sync() { events.push({kind:'sync',path:String(path)});
        if (String(path) === failDirectorySync) { failDirectorySync = null; throw Error('TEST_DIRECTORY_FSYNC_UNKNOWN'); }
        return handle.sync(); },
      async close() { events.push({kind:'close',path:String(path)}); return handle.close(); },
    };
  },
  async rename(from, to) { events.push({kind:'rename',path:String(to)}); return fs.rename(from,to); },
} });
const { createClaimVaultSession } = await import('../../../src/claims/storage/vault-session.mjs');
const password = 'synthetic per-vault private password 0123456789';
async function fixture() {
  const directory = await fs.mkdtemp(join(tmpdir(),'claim-vault-session-')), path = join(directory,'journal.vault');
  const before = keys.length, session = createClaimVaultSession({path,password}), key = keys[before];
  assert.equal(keys.length,before+1);
  return {directory,path,session,key,async close(){session.close();assert.ok(key.every(byte=>byte===0));await fs.rm(directory,{recursive:true,force:true});}};
}
const envelope = async path => JSON.parse(await fs.readFile(path,'utf8'));
function encryptText(header,text,key) {
  const value=structuredClone(header);value.cipher.iv=crypto.randomBytes(12).toString('hex');
  const cipher=crypto.createCipheriv('aes-256-gcm',key,Buffer.from(value.cipher.iv,'hex'),{authTagLength:16});
  cipher.setAAD(Buffer.from(canonical({context:'private-omnichain-wallet/encrypted-json',version:value.version,
    kdf:value.kdf,cipher:{name:value.cipher.name,iv:value.cipher.iv}})));
  value.ciphertext=Buffer.concat([cipher.update(Buffer.from(text)),cipher.final()]).toString('base64url');
  value.cipher.tag=cipher.getAuthTag().toString('hex');return value;
}
test('derive once; legacy decrypt remains compatible; fresh IVs preserve independent vault keys',async()=>{
  const a=await fixture(),b=await fixture();
  try{
    assert.notDeepEqual(a.key,b.key);const calls=keys.length;
    const created=await a.session.create({secret:'PRIVATE CLAIM OPENING',history:[]});
    const first=await envelope(a.path);assert.deepEqual(await a.session.read(),created);
    const updated=await a.session.update(0,data=>({...data,history:['original-signed-wire']}));
    const second=await envelope(a.path);assert.deepEqual(await a.session.read(),updated);
    await b.session.create({role:'other operator'});const other=await envelope(b.path);
    assert.equal(keys.length,calls,'no password derivation during create/read/update/readback');
    assert.equal(first.kdf.salt,second.kdf.salt);assert.notEqual(first.cipher.iv,second.cipher.iv);
    assert.notEqual(first.kdf.salt,other.kdf.salt);assert.deepEqual(decryptJson(second,password),updated);
    assert.deepEqual(await new Vault(a.path).read(password),updated);
    assert.ok(!(await fs.readFile(a.path,'utf8')).includes('PRIVATE CLAIM OPENING'));
    assert.throws(()=>decryptJson(second,'wrong password'),/authentication failed/);
    assert.throws(()=>JSON.stringify(a.session),/NOT_SERIALIZABLE/);
  }finally{await a.close();await b.close();}
});
test('legacy lock/CAS, single-writer ownership, sync order and nonmutating transform errors remain intact',async()=>{
  const f=await fixture();
  try{
    await f.session.create({n:0});events.length=0;
    const pending=f.session.update(0,()=>({n:1}));assert.throws(()=>f.session.close(),/SESSION_BUSY/);
    await assert.rejects(f.session.read(),/SESSION_BUSY/);await pending;
    const write=events.findIndex(e=>e.kind==='write'&&e.path.includes('.tmp-'));
    const sync=events.findIndex(e=>e.kind==='sync'&&e.path.includes('.tmp-'));
    const renamed=events.findIndex(e=>e.kind==='rename'&&e.path===f.path);
    const directorySync=events.findIndex(e=>e.kind==='sync'&&e.path===f.directory);
    assert.ok(write>=0&&write<sync&&sync<renamed&&renamed<directorySync);
    const before=await fs.readFile(f.path);
    await assert.rejects(f.session.update(0,()=>({n:2})),e=>e.code==='VAULT_CONFLICT');
    await assert.rejects(f.session.update(1,async()=>({n:2})),/synchronous/);
    await assert.rejects(f.session.update(1,()=>Promise.resolve({n:2})),/synchronous JSON/);
    assert.deepEqual(await fs.readFile(f.path),before);assert.deepEqual(await f.session.read(),{revision:1,data:{n:1}});
    await fs.writeFile(f.path+'.lock','EXISTING OTHER WRITER LOCK',{mode:0o600});
    await assert.rejects(f.session.update(1,()=>({n:2})),e=>e.code==='VAULT_LOCKED');
    assert.equal(await fs.readFile(f.path+'.lock','utf8'),'EXISTING OTHER WRITER LOCK');await fs.unlink(f.path+'.lock');
    await assert.rejects(f.session.create({replacement:true}),e=>e.code==='VAULT_EXISTS');
  }finally{await f.close();}
});
const tamperCases={
  'extra envelope field':v=>{v.extra=true;},'extra kdf field':v=>{v.kdf.extra=true;},'extra cipher field':v=>{v.cipher.extra=true;},
  'version':v=>{v.version=2;},'kdf name':v=>{v.kdf.name='none';},'kdf N':v=>{v.kdf.N=16384;},
  'kdf r':v=>{v.kdf.r=4;},'kdf p':v=>{v.kdf.p=2;},'salt':v=>{v.kdf.salt='11'.repeat(32);},
  'cipher name':v=>{v.cipher.name='aes-256-ctr';},'authenticated iv':v=>{v.cipher.iv='22'.repeat(12);},
  'tag':v=>{v.cipher.tag='33'.repeat(16);},'ciphertext':v=>{v.ciphertext=(v.ciphertext[0]==='A'?'B':'A')+v.ciphertext.slice(1);},
  'tag trailing newline':v=>{v.cipher.tag+='\n';},'iv trailing newline':v=>{v.cipher.iv+='\n';},
  'salt trailing newline':v=>{v.kdf.salt+='\n';},'ciphertext trailing newline':v=>{v.ciphertext+='\n';},
  'base64 padding':v=>{v.ciphertext+='=';},'uppercase salt':v=>{v.kdf.salt=v.kdf.salt.toUpperCase();},
};
for(const [name,change]of Object.entries(tamperCases))test('reject '+name+' and poison the role-local session',async()=>{
  const f=await fixture();try{
    await f.session.create({n:0});const bad=await envelope(f.path);change(bad);await fs.writeFile(f.path,JSON.stringify(bad));
    await assert.rejects(f.session.read());assert.ok(f.key.every(byte=>byte===0));
    await assert.rejects(f.session.update(0,()=>({n:1})),/CLOSED_OR_UNCERTAIN/);
  }finally{await f.close();}
});
test('matching salt with wrong derived key cannot authenticate; canonical plaintext is mandatory',async()=>{
  for(const mode of ['wrong-key','noncanonical','extra-record-field']){
    const f=await fixture();try{
      await f.session.create({n:0});const original=await envelope(f.path);
      const wrong=crypto.scryptSync('other password',Buffer.from(original.kdf.salt,'hex'),32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
      const text=mode==='noncanonical'?' {"data":{"n":0},"revision":0}':mode==='extra-record-field'
        ?canonical({data:{n:0},revision:0,extra:1}):canonical({data:{n:0},revision:0});
      const bad=encryptText(original,text,mode==='wrong-key'?wrong:f.key);wrong.fill(0);
      await fs.writeFile(f.path,JSON.stringify(bad));await assert.rejects(f.session.read());
    }finally{await f.close();}
  }
});
test('replacement vault/salt, symlinks and oversized files fail closed',async()=>{
  for(const mode of ['replacement','symlink','oversized']){
    const f=await fixture();let other;
    try{
      await f.session.create({n:0});
      if(mode==='replacement'){other=await fixture();await other.session.create({n:99});await fs.copyFile(other.path,f.path);}
      else if(mode==='symlink'){const target=join(f.directory,'retained.vault');await fs.rename(f.path,target);await fs.symlink(target,f.path);}
      else await fs.writeFile(f.path,'x'.repeat(2*1024*1024+1));
      await assert.rejects(f.session.read());assert.ok(f.key.every(byte=>byte===0));
    }finally{await other?.close();await f.close();}
  }
});
test('post-rename fsync uncertainty preserves the committed file but poisons and wipes the session',async()=>{
  const f=await fixture();try{
    await f.session.create({n:0});failDirectorySync=f.directory;
    await assert.rejects(f.session.update(0,()=>({n:1})),/DIRECTORY_FSYNC_UNKNOWN/);
    assert.ok(f.key.every(byte=>byte===0));await assert.rejects(f.session.read(),/CLOSED_OR_UNCERTAIN/);
    assert.deepEqual(await new Vault(f.path).read(password),{revision:1,data:{n:1}});
    assert.ok(!(await fs.readdir(f.directory)).some(name=>name.endsWith('.lock')));
  }finally{failDirectorySync=null;await f.close();}
});
test('closed session rejects all later work and plaintext size limit is preserved',async()=>{
  const f=await fixture();try{
    await f.session.create({n:0});f.session.close();assert.ok(f.key.every(byte=>byte===0));
    await assert.rejects(f.session.read(),/CLOSED_OR_UNCERTAIN/);
    await assert.rejects(f.session.create({n:1}),/CLOSED_OR_UNCERTAIN/);
    await assert.rejects(f.session.update(0,()=>({n:1})),/CLOSED_OR_UNCERTAIN/);
  }finally{await f.close();}
  const big=await fixture();try{
    await assert.rejects(big.session.create({text:'x'.repeat(1024*1024)}),/byte limit/);
  }finally{await big.close();}
});
