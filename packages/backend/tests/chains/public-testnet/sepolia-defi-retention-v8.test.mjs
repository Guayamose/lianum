/** Real private AEAD storage/fencing across distinct processes. Issuer stand-ins
 * are explicitly HOST-only; actual compiled targets have separate tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('fixtures/sepolia-defi-retention-host-v8.mjs',import.meta.url));
function child(mode,directory){return new Promise((resolve,reject)=>{const command=spawn(process.execPath,['--experimental-test-module-mocks',fixture,mode,directory],{stdio:['ignore','pipe','pipe']});let out='',err='';command.stdout.on('data',v=>out+=v);command.stderr.on('data',v=>err+=v);command.once('error',reject);command.once('close',code=>{if(code!==0)return reject(Error('HOST_CHILD_'+mode+'_FAILED\n'+err));try{resolve(JSON.parse(out));}catch(e){reject(e);}});});}
test('DeFi initialization survives process death; finalized targets and owner checkpoints reopen without new initialization capability',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-defi-retention-v8-'));
 try{const seeded=await child('seed',directory);assert.equal(seeded.checkpoint.phase,'ACTIVE');assert.equal((await child('root-read',directory)).readOnly,true);const resumed=await child('resume',directory);assert.equal(resumed.checkpoint.phase,'CAPTURED');assert.equal(resumed.checkpoint.identity,seeded.checkpoint.identity);const wrong=await child('wrong-password',directory);assert.equal(wrong.rejected,true);const observed=await child('observe',directory);assert.equal(observed.checkpoint.phase,'ACTIVE');assert.equal(observed.checkpoint.identity,seeded.checkpoint.identity);assert.equal(observed.checkpoint.generation,2);assert.equal(observed.financialAcceptance,false);for(const name of await readdir(directory)){const stat=await lstat(join(directory,name));if(name.endsWith('.vault'))assert.equal(stat.mode&0o777,0o600);}}finally{await rm(directory,{recursive:true,force:true});}
});

test('publishing one finalized target preserves the other Original partial plan before failure capture',async()=>{const directory=await mkdtemp(join(tmpdir(),'lianum-defi-partial-capture-v8-'));try{const saved=await child('seed-multi',directory);assert.equal(saved.checkpoint.phase,'CAPTURED');const reopened=await child('observe-multi',directory);assert.equal(reopened.checkpoint.phase,'ACTIVE');assert.equal(reopened.checkpoint.identity,saved.checkpoint.identity);}finally{await rm(directory,{recursive:true,force:true});}});

test('failure before the first plan captures an empty Original birth without adopting any journal',async()=>{const directory=await mkdtemp(join(tmpdir(),'lianum-defi-empty-capture-v8-'));try{const saved=await child('capture-empty',directory);assert.equal(saved.checkpoint.phase,'CAPTURED');const reopened=await child('open-empty',directory);assert.equal(reopened.checkpoint.identity,saved.checkpoint.identity);assert.equal(reopened.checkpoint.phase,'ACTIVE');}finally{await rm(directory,{recursive:true,force:true});}});


test('Sup8 completes 1023→1024 and rejects overflow before changing the retained vault',async()=>{
 const {Vault}=await import('@lianum/engine/crypto/vault'),password='public HOST fixture password '.repeat(3);
 for(const start of [1023,Number.MAX_SAFE_INTEGER]){const directory=await mkdtemp(join(tmpdir(),'lianum-defi-counter-v8-'));try{await child('capture-empty',directory);const vault=new Vault(join(directory,'defi-supervisor.vault')),before=await vault.read(password);await vault.update(password,before.revision,()=>({...before.data,generation:start}));const reopened=await child(start===1023?'open-empty':'overflow-empty',directory);assert.equal(reopened.checkpoint.generation,start===1023?1024:start);assert.equal(reopened.checkpoint.phase,start===1023?'ACTIVE':'OPENING');}finally{await rm(directory,{recursive:true,force:true});}}
});
