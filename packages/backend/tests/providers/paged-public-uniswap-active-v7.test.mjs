/** Actual encrypted anchors, original supervisors and dead child process.
 * The Native current-state port is explicit inert HOST DATA in this test;
 * its signature/canonical validations are covered by active-recovery tests. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Vault} from '@lianum/engine/crypto/vault';
import {descriptor,fixture} from './fixtures/paged-mixed-host-v7.mjs';

mock.module(new URL('../../src/operations/recovery/paged-public-active-current-data-v4.mjs',import.meta.url).href,{exports:{readPagedPublicActiveCurrentDataV4:async base=>structuredClone(base)}});
const M=await import('../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs');
const P=await import('../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');

test('dead Mixed activation reopens the same parent and seven retained components without a new constructor',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'mixed-active-dead-')),password='HOST_ACTUAL_ENCRYPTED_MIXED_PASSWORD_123456789',parentDirectory=join(directory,'parent'),mixedDirectory=join(directory,'mixed');
 let child,sup;
 try{
  await mkdir(parentDirectory,{mode:0o700});await mkdir(mixedDirectory,{mode:0o700});
  const childSource=`import {createOriginalPagedPublicSupervisorRetentionV4 as create} from ${JSON.stringify(new URL('../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs',import.meta.url).href)};
   import {adoptOriginalPagedPublicUniswapMixedSupervisorV6 as adopt} from ${JSON.stringify(new URL('../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs',import.meta.url).href)};
   import {descriptor,fixture} from ${JSON.stringify(new URL('./fixtures/paged-mixed-host-v7.mjs',import.meta.url).href)};
   const [p,m,password]=JSON.parse(process.argv[1]);const parent=await create({directory:p,password},descriptor),sup=await adopt({directory:m,password},parent);
   await sup.publishActivationBaseV5(fixture());process.send({ready:true});setInterval(()=>{},1000);`;
  child=spawn(process.execPath,['--input-type=module','-e',childSource,JSON.stringify([parentDirectory,mixedDirectory,password])],{stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stderr.on('data',b=>output+=b);const ready=await Promise.race([once(child,'message').then(([v])=>v),once(child,'exit').then(([code])=>{throw Error('HOST_CHILD_FAILED '+code+' '+output);})]);assert.equal(ready.ready,true);
  const before=await new Vault(join(parentDirectory,'supervisor.vault')).read(password),oldMixed=await readFile(join(mixedDirectory,'mixed-supervisor.vault'));
  await assert.rejects(M.recoverOriginalPagedPublicUniswapMixedActivationV7({directory:mixedDirectory,password}),/PAGED_PROCESS_FENCE_BUSY/);
  assert.deepEqual(await readFile(join(mixedDirectory,'mixed-supervisor.vault')),oldMixed);
  const exit=once(child,'exit');child.kill('SIGKILL');await exit;child=null;
  sup=await M.recoverOriginalPagedPublicUniswapMixedActivationV7({directory:mixedDirectory,password});assert.equal(sup.checkpoint().phase,'OPENING');
  const after=await new Vault(join(parentDirectory,'supervisor.vault')).read(password);assert.equal(after.data.identity,before.data.identity);assert.equal(after.data.generation,before.data.generation);assert.equal(after.data.phase,'OPENING');
  const saved=fixture();
  for(const name of ['deployment','native'])assert.deepEqual(P.consumeOriginalPagedComponentRecoveryV3(await sup.issueComponent(name),name),saved[name]);
  assert.deepEqual(M.consumeOriginalPagedPublicUniswapMixedComponentV4(await sup.issueComponent('target'),'target'),saved.target);
  for(const name of ['mixedSource','flatAuthority'])for(const token of M.splitOriginalPagedPublicUniswapMixedCollectionV4(await sup.issueComponent(name),name))M.consumeOriginalPagedPublicUniswapMixedComponentV4(token,name);
  for(const name of ['authority','provider']){const parts=await sup.splitParentAndMixed(await sup.issueComponent(name),name);P.consumeOriginalPagedComponentRecoveryV3(parts.parentToken,name);for(const entry of parts.entries)M.consumeOriginalPagedPublicUniswapMixedComponentV4(entry.token,name==='authority'?'mixedAuthority':'providerScope');}
  await sup.complete();await sup.capture(saved);assert.equal(sup.checkpoint().phase,'CAPTURED');
 }finally{child?.kill('SIGKILL');await sup?.close();await rm(directory,{recursive:true,force:true});}
});
