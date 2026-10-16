/** Real AEAD/CAS/Original supervisor tokens; component bodies are inert HOST
 * DATA. Only the durable counter is seeded at its boundary in these fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Vault} from '@lianum/engine/crypto/vault';
import * as R from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
import * as M from '../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
import {normalizePagedSupervisorGenerationDataV8 as generation,nextPagedSupervisorGenerationDataV8 as next} from '../../src/operations/recovery/paged-supervisor-generation-data-v8.mjs';
import {descriptor,fixture} from './fixtures/paged-mixed-host-v7.mjs';

test('opening generations are safe monotonic counters, independent of successor depth',()=>{
 for(const value of [0,15,16,1023,1024,Number.MAX_SAFE_INTEGER])assert.equal(generation(value),value);
 assert.equal(next(15),16);assert.equal(next(1023),1024);assert.equal(next(Number.MAX_SAFE_INTEGER-1),Number.MAX_SAFE_INTEGER);
 for(const value of [-0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'15',null])assert.throws(()=>generation(value),/GENERATION_INVALID/);
 assert.throws(()=>next(Number.MAX_SAFE_INTEGER),/GENERATION_OVERFLOW/);
});
async function seedCounter(path,password,value){const vault=new Vault(path),before=await vault.read(password);await vault.update(password,before.revision,()=>({...before.data,generation:value}));}
async function consumeMixed(owner){
 const issued={};for(const name of ['deployment','target','mixedSource','flatAuthority','authority','provider','native'])issued[name]=await owner.issueComponent(name);
 M.consumeOriginalPagedPublicUniswapMixedComponentV4(issued.target,'target');
 for(const name of ['mixedSource','flatAuthority'])for(const token of M.splitOriginalPagedPublicUniswapMixedCollectionV4(issued[name],name))M.consumeOriginalPagedPublicUniswapMixedComponentV4(token,name);
 for(const name of ['authority','provider']){const split=await owner.splitParentAndMixed(issued[name],name);R.consumeOriginalPagedComponentRecoveryV3(split.parentToken,name);for(const entry of split.entries)M.consumeOriginalPagedPublicUniswapMixedComponentV4(entry.token,name==='authority'?'mixedAuthority':'providerScope');}
 for(const name of ['deployment','native'])R.consumeOriginalPagedComponentRecoveryV3(issued[name],name);
}
test('actual Root plus Sup7 complete 15→16→17 and preserve the captured identities and terms',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-counter-')),password='HOST actual shared supervisor counter password 123456',root={directory:join(directory,'root'),password},mixed={directory:join(directory,'mixed'),password};let parent,owner;
 try{
  await mkdir(root.directory,{mode:0o700});await mkdir(mixed.directory,{mode:0o700});parent=await R.createOriginalPagedPublicSupervisorRetentionV4(root,descriptor);owner=await M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(mixed,parent);const saved=fixture();await owner.capture(saved);const identities={mixed:owner.checkpoint().identity,root:(await new Vault(join(root.directory,'supervisor.vault')).read(password)).data.identity};await owner.close();owner=null;
  await seedCounter(join(root.directory,'supervisor.vault'),password,15);await seedCounter(join(mixed.directory,'mixed-supervisor.vault'),password,15);
  for(const expected of [16,17]){owner=await M.openOriginalPagedPublicUniswapMixedSupervisorV4(mixed);await consumeMixed(owner);await owner.complete();assert.equal(owner.checkpoint().generation,expected);assert.equal(owner.checkpoint().identity,identities.mixed);assert.deepEqual(owner.descriptor(),descriptor);const actualRoot=await new Vault(join(root.directory,'supervisor.vault')).read(password);assert.equal(actualRoot.data.generation,expected);assert.equal(actualRoot.data.identity,identities.root);assert.deepEqual(actualRoot.data.descriptor,descriptor);await owner.capture(saved);await owner.close();owner=null;}
 }finally{await owner?.close();await parent?.close();await rm(directory,{recursive:true,force:true});}
});
for(const exhausted of ['mixed','root'])test(`${exhausted} overflow fails before writing either actual Root/Sup7 vault`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-counter-overflow-')),password='HOST actual shared supervisor overflow password 123456',root={directory:join(directory,'root'),password},mixed={directory:join(directory,'mixed'),password};let parent,owner;
 try{
  await mkdir(root.directory,{mode:0o700});await mkdir(mixed.directory,{mode:0o700});parent=await R.createOriginalPagedPublicSupervisorRetentionV4(root,descriptor);owner=await M.adoptOriginalPagedPublicUniswapMixedSupervisorV6(mixed,parent);await owner.capture(fixture());await owner.close();owner=null;
  await seedCounter(exhausted==='mixed'?join(mixed.directory,'mixed-supervisor.vault'):join(root.directory,'supervisor.vault'),password,Number.MAX_SAFE_INTEGER);owner=await M.openOriginalPagedPublicUniswapMixedSupervisorV4(mixed);await consumeMixed(owner);const paths=[join(root.directory,'supervisor.vault'),join(mixed.directory,'mixed-supervisor.vault')],before=await Promise.all(paths.map(path=>readFile(path)));await assert.rejects(owner.complete(),/GENERATION_OVERFLOW/);for(const [index,path]of paths.entries())assert.deepEqual(await readFile(path),before[index]);assert.equal(owner.checkpoint().phase,'OPENING');
 }finally{await owner?.close();await parent?.close();await rm(directory,{recursive:true,force:true});}
});
