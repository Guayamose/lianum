import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  ANCHOR_ROLES, REQUIRED_CONSUMERS, BOOTSTRAP_PATH,
  validateManifest, validateSnapshot, validateSourceBytes,
} from '../../../../../components/src/verification/wrapped-installation-data-v2.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const leaf='omnichain-product/src/fixture-leaf.mjs';
function publication(changes=new Map()) {
  const sources=new Map([...new Set([...Object.keys(ANCHOR_ROLES),...REQUIRED_CONSUMERS,leaf])]
    .map(path=>[path,Buffer.from(changes.get(path)??'export const fixture = true;\n')]));
  const sourceFiles=[...sources].sort(([a],[b])=>a<b?-1:1).map(([path,bytes])=>({bytes:bytes.length,path,role:ANCHOR_ROLES[path]??'source',sha256:hash(bytes)}));
  const data={purpose:'SOURCE_AUTHENTICATION_ONLY_NO_EXECUTION_PERMISSION',schema:'LIANUM_WRAPPED_INSTALLATION_SOURCE_MANIFEST_V2',sourceFiles,state:'CLOSED_SOURCE_ONLY',version:2};
  const raw=Buffer.from(JSON.stringify(data)+'\n');
  return {data,raw,sources,manifest:()=>validateManifest(raw,hash(raw))};
}
function encode(data){return Buffer.from(JSON.stringify(data)+'\n');}

test('pure publication contract authenticates exact bytes and returns immutable source-only data',()=>{
  const p=publication(),manifest=p.manifest();
  assert.equal(validateSnapshot(manifest,p.sources),true);
  assert.equal(validateSourceBytes(manifest,new Map(p.sources)),true);
  assert.ok(Object.isFrozen(manifest)&&Object.isFrozen(manifest.sourceFiles)&&manifest.sourceFiles.every(Object.isFrozen));
  assert.equal(manifest.purpose,'SOURCE_AUTHENTICATION_ONLY_NO_EXECUTION_PERMISSION');
  assert.equal(Object.hasOwn(manifest,'activationAuthorized'),false);
});

test('trusted digest and canonical wire format cannot be substituted by another manifest',()=>{
  const p=publication();
  assert.throws(()=>validateManifest(p.raw,'00'.repeat(32)),/MANIFEST_PIN/);
  const pretty=Buffer.from(JSON.stringify(p.data,null,2)+'\n');
  assert.throws(()=>validateManifest(pretty,hash(pretty)),/CANONICAL_JSON/);
  for(const raw of [null,{},Buffer.alloc(0)])assert.throws(()=>validateManifest(raw,hash(p.raw)),/MANIFEST_SIZE/);
  assert.throws(()=>validateManifest(p.raw,{}),/TRUSTED_ROOT_REQUIRED/);
});

test('manifest requires every original anchor and consumer, a sorted unique safe path, and an external bootstrap',()=>{
  for(const change of ['missing','duplicate','traversal','self-root','role']){
    const {data}=publication();
    if(change==='missing')data.sourceFiles.shift();
    if(change==='duplicate')data.sourceFiles.splice(1,0,data.sourceFiles[0]);
    if(change==='traversal')data.sourceFiles[0].path='omnichain-product/../escape.mjs';
    if(change==='self-root')data.sourceFiles[0].path=BOOTSTRAP_PATH;
    if(change==='role')data.sourceFiles[0].role='execution-permission';
    const raw=encode(data);
    assert.throws(()=>validateManifest(raw,hash(raw)),/REQUIRED_|SORT_OR_DUPLICATE|INSTALL_PATH|ROOT_MUST_BE_EXTERNAL|INSTALL_ROLE/);
  }
});

test('snapshot cannot omit, replace or alter a declared original byte',()=>{
  const p=publication(),manifest=p.manifest();
  const absent=new Map(p.sources);absent.delete(leaf);
  assert.throws(()=>validateSnapshot(manifest,absent),/EXACT_SNAPSHOT/);
  const different=new Map(p.sources);different.set(leaf,Buffer.from('export const fixture = null;\n'));
  assert.throws(()=>validateSnapshot(manifest,different),/SOURCE_BYTES|SOURCE_PIN/);
  const nonbytes=new Map(p.sources);nonbytes.set(leaf,{});
  assert.throws(()=>validateSnapshot(manifest,nonbytes),/SOURCE_MISSING/);
});

test('import closure rejects a newly referenced undeclared body or package even when its containing file is repinned',()=>{
  for(const specifier of ['./unpublished.mjs','../../escape.mjs','unexpected-package']){
    const p=publication(new Map([[leaf,`import value from '${specifier}';\n`]]));
    assert.throws(()=>validateSnapshot(p.manifest(),p.sources),/UNPINNED_IMPORT_|INSTALL_ROOT|FIXED_IMPORT/);
  }
  const p=publication(new Map([[leaf,"import assert from 'node:assert/strict';\n"]]));
  assert.equal(validateSnapshot(p.manifest(),p.sources),true);
});
