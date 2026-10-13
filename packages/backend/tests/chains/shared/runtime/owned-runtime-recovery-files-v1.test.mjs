/** Real filesystem HOST only: synthetic bytes, no native runtime or custody. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,readlink,link,unlink,symlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
import {projectRoot} from '@lianum/engine/chains/shared/runtime-harness';
import {sealStoppedNativeFilesV1,assertStoppedNativeFilesV1} from '../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs';

const scratch=join(projectRoot,'.local/integrations'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(prefix='flat-solana-files-host-'){
 await mkdir(scratch,{recursive:true,mode:0o700});const cwd=await mkdtemp(join(scratch,prefix));
 await mkdir(join(cwd,'ledger/accounts/run'),{recursive:true,mode:0o700});return cwd;
}
async function account(cwd,filename='512.8',slots=['701']){
 const run='ledger/accounts/run/'+filename;await writeFile(join(cwd,run),'HOST_NATIVE_ACCOUNT_BYTES',{mode:0o600});const paths=[run];
 for(const slot of slots){const dir=join(cwd,'ledger/accounts/snapshot',slot);await mkdir(dir,{recursive:true,mode:0o700});const alias='ledger/accounts/snapshot/'+slot+'/'+filename;await link(join(cwd,run),join(cwd,alias));paths.push(alias);}return paths;
}
async function snapshotReference(cwd,slot='701',target='ledger/accounts/snapshot/'+slot){const path='ledger/snapshot/'+slot+'/accounts_hardlinks/account_path_0';await mkdir(join(cwd,'ledger/snapshot',slot,'accounts_hardlinks'),{recursive:true,mode:0o700});await symlink(target,join(cwd,path));return path;}

test('singleton native files retain the exact old manifest byte format',async()=>{
 const cwd=await fixture('flat-bitcoin-files-host-');try{
  const bytes=Buffer.from('HOST_SINGLETON');await writeFile(join(cwd,'singleton'),bytes,{mode:0o600});
  const expected={files:[{path:'singleton',bytes:bytes.length,sha256:sha(bytes),mode:'0600'}],totalBytes:bytes.length};
  const actual=await sealStoppedNativeFilesV1(cwd);assert.equal(JSON.stringify(actual),JSON.stringify(expected));await assertStoppedNativeFilesV1(cwd,actual);
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('original Solana run and bounded snapshot aliases are sealed as complete groups',async()=>{
 const cwd=await fixture();try{
  const pair=await account(cwd),multiple=await account(cwd,'601.6',['701','801']);const manifest=await sealStoppedNativeFilesV1(cwd);
  assert.deepEqual(manifest.hardlinkGroups,[{paths:pair,nlink:2},{paths:multiple,nlink:3}]);assert.equal(manifest.files.length,5);
  for(const group of manifest.hardlinkGroups){const rows=group.paths.map(path=>manifest.files.find(row=>row.path===path));assert.ok(rows.every(row=>row.sha256===rows[0].sha256&&row.mode===rows[0].mode&&row.bytes===rows[0].bytes));}
  await assertStoppedNativeFilesV1(cwd,manifest);
  // Replacing an alias with identical bytes changes topology and must reject.
  await unlink(join(cwd,pair[1]));await writeFile(join(cwd,pair[1]),'HOST_NATIVE_ACCOUNT_BYTES',{mode:0o600});await assert.rejects(assertStoppedNativeFilesV1(cwd,manifest),/NATIVE_RECOVERY_RETAINED_FILES_CHANGED/);
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('external, incomplete, wrongly named and non-Solana hardlinks reject',async()=>{
 const roots=[];try{
  const external=await fixture(),outside=await fixture();roots.push(external,outside);const [run]=await account(external,'512.8',[]);await link(join(external,run),join(outside,'outside'));await assert.rejects(sealStoppedNativeFilesV1(external),/NATIVE_RECOVERY_INCOMPLETE_HARDLINK/);
  const wrong=await fixture();roots.push(wrong);const [wrongRun]=await account(wrong,'512.8',[]);await mkdir(join(wrong,'ledger/accounts/snapshot/701'),{recursive:true});await link(join(wrong,wrongRun),join(wrong,'ledger/accounts/snapshot/701/601.6'));await assert.rejects(sealStoppedNativeFilesV1(wrong),/NATIVE_RECOVERY_HARDLINK_PAIR/);
  const other=await fixture('flat-bitcoin-files-host-');roots.push(other);await account(other);await assert.rejects(sealStoppedNativeFilesV1(other));
  const extra=await fixture();roots.push(extra);await account(extra,'512.8',['701','702','703','704','705','706','707','708','709']);await assert.rejects(sealStoppedNativeFilesV1(extra),/NATIVE_RECOVERY_UNEXPECTED_HARDLINK/);
  const escape=await fixture();roots.push(escape);const [escapeRun]=await account(escape,'512.8',[]);await link(join(escape,escapeRun),join(escape,'unapproved'));await assert.rejects(sealStoppedNativeFilesV1(escape),/NATIVE_RECOVERY_UNEXPECTED_HARDLINK_PATH/);
  const symbolic=await fixture();roots.push(symbolic);await symlink(join(symbolic,'ledger/accounts/run'),join(symbolic,'alias'));await assert.rejects(sealStoppedNativeFilesV1(symbolic),/NATIVE_RECOVERY_SYMLINK/);
 }finally{for(const cwd of roots)await rm(cwd,{recursive:true,force:true});}
});

test('a hardlink removal during the original streaming read is rejected',async()=>{
 const cwd=await fixture();let hook;try{
  const [run,snapshot]=await account(cwd),source=new URL('../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs',import.meta.url),url=source.href+'?host-link-race';
  // Intercept only this HOST import's filesystem port. Production exports and
  // source bytes remain unchanged; mutation affects our own inert fixture only.
  const wrapper='data:text/javascript,'+encodeURIComponent(`import * as fs from 'node:fs/promises';export const {realpath,lstat,readdir,readlink,rename}=fs;let changed=false;export async function open(path,...args){const f=await fs.open(path,...args);if(path!==${JSON.stringify(join(cwd,run))})return f;return{stat:()=>f.stat(),sync:()=>f.sync(),close:()=>f.close(),async read(...args){const result=await f.read(...args);if(!changed){changed=true;await fs.unlink(${JSON.stringify(join(cwd,snapshot))});}return result;}};}`);
  const bytes=await readFile(source,'utf8');hook=registerHooks({load(path,context,next){if(path!==url)return next(path,context);return{format:'module',source:bytes.replace("from'node:fs/promises'",'from'+JSON.stringify(wrapper)),shortCircuit:true};}});
  const raced=await import(url);await assert.rejects(raced.sealStoppedNativeFilesV1(cwd),/NATIVE_RECOVERY_FILE_CHANGED/);
 }finally{hook?.deregister();await rm(cwd,{recursive:true,force:true});}
});

test('Agave cwd-relative snapshot reference is retained without following its OS symlink',async()=>{
 const cwd=await fixture();try{
  await account(cwd);const path=await snapshotReference(cwd),target='ledger/accounts/snapshot/701',manifest=await sealStoppedNativeFilesV1(cwd);
  assert.deepEqual(manifest.symbolicLinks,[{path,target}]);assert.equal(await readlink(join(cwd,path)),target);await assertStoppedNativeFilesV1(cwd,manifest);
  await unlink(join(cwd,path));await symlink('ledger/accounts/snapshot/702',join(cwd,path));await assert.rejects(assertStoppedNativeFilesV1(cwd,manifest),/NATIVE_RECOVERY_SNAPSHOT_LINK_TARGET/);
 }finally{await rm(cwd,{recursive:true,force:true});}
});

test('snapshot reference rejects external targets, other slots and unverified storage aliases',async()=>{
 const roots=[];try{
  for(const target of ['/tmp','../accounts/snapshot/701','ledger/accounts/snapshot/702']){const cwd=await fixture();roots.push(cwd);await account(cwd);await snapshotReference(cwd,'701',target);await assert.rejects(sealStoppedNativeFilesV1(cwd),/NATIVE_RECOVERY_SNAPSHOT_LINK_TARGET/);}
  const unlinked=await fixture();roots.push(unlinked);await mkdir(join(unlinked,'ledger/accounts/snapshot/701'),{recursive:true});await writeFile(join(unlinked,'ledger/accounts/snapshot/701/512.8'),'HOST_SINGLETON',{mode:0o600});await snapshotReference(unlinked);await assert.rejects(sealStoppedNativeFilesV1(unlinked),/NATIVE_RECOVERY_SNAPSHOT_LINK_HARDLINKS/);
  const wrong=await fixture();roots.push(wrong);await account(wrong);const path=await snapshotReference(wrong);await symlink('ledger/accounts/snapshot/701',join(wrong,path.replace('account_path_0','account_path_1')));await assert.rejects(sealStoppedNativeFilesV1(wrong),/NATIVE_RECOVERY_SYMLINK/);
 }finally{for(const cwd of roots)await rm(cwd,{recursive:true,force:true});}
});

test('changing a snapshot reference between readlink and lstat rejects',async()=>{
 const cwd=await fixture();let hook;try{
  await account(cwd);const path=await snapshotReference(cwd),source=new URL('../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs',import.meta.url),url=source.href+'?host-symbolic-race';
  const wrapper='data:text/javascript,'+encodeURIComponent(`import * as fs from 'node:fs/promises';export const {realpath,lstat,readdir,open,rename}=fs;let changed=false;export async function readlink(path,...args){const result=await fs.readlink(path,...args);if(!changed&&path===${JSON.stringify(join(cwd,path))}){changed=true;await fs.unlink(path);await fs.symlink('ledger/accounts/snapshot/702',path);}return result;}`);
  const bytes=await readFile(source,'utf8');hook=registerHooks({load(path,context,next){if(path!==url)return next(path,context);return{format:'module',source:bytes.replace("from'node:fs/promises'",'from'+JSON.stringify(wrapper)),shortCircuit:true};}});
  const raced=await import(url);await assert.rejects(raced.sealStoppedNativeFilesV1(cwd),/NATIVE_RECOVERY_FILE_CHANGED/);
 }finally{hook?.deregister();await rm(cwd,{recursive:true,force:true});}
});
