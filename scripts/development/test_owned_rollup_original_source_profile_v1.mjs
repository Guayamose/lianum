import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync,mkdtempSync,mkdirSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {dirname,join,parse,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
function repository(){let path=dirname(fileURLToPath(import.meta.url));while(path!==parse(path).root){if(existsSync(join(path,'scripts/layout.json'))&&existsSync(join(path,'package.json'))&&JSON.parse(readFileSync(join(path,'package.json'),'utf8')).name==='lianum')return realpathSync(path);path=dirname(path);}throw new Error('HOST_ORIGINAL_REPOSITORY');}
const repo=repository();
// Fixtures always use the versioned implementation, independently of local
// agent drafts or whether the development history has been cleaned.
function fixedCandidate(path){return readFileSync(join(repo,path));}
const modulePath='scripts/development/owned-rollup-original-source-profile-v1.mjs';
const publicationPath='packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs';
const profileSource=readFileSync(join(repo,modulePath),'utf8');
const bindings=JSON.parse(/const runtimeFiles=Object\.freeze\((\[[\s\S]*?\])\);/.exec(profileSource)[1]);
function write(root,path,bytes,mode=0o644){const full=join(root,path);mkdirSync(dirname(full),{recursive:true,mode:0o700});writeFileSync(full,bytes,{mode});chmodSync(full,mode);}
const ownPaths=['owned-base-rollup-v1.mjs','owned_base_rollup_v1.py','owned-base-native-value-dispatch-v1.mjs','owned-arbitrum-nitro-v1.mjs','owned_arbitrum_nitro_v1.py','owned-arbitrum-native-value-dispatch-v1.mjs'].map(name=>'scripts/development/'+name);
function fixture(){const root=mkdtempSync(join(tmpdir(),'original-rollup-source-'));chmodSync(root,0o700);write(root,'scripts/layout.json','{}');write(root,'package.json',JSON.stringify({name:'lianum'}));
 for(const path of ownPaths)write(root,path,fixedCandidate(path));
 const source=fixedCandidate(modulePath).toString();write(root,modulePath,source);
 const published=readFileSync(join(repo,publicationPath)),match=/Object\.freeze\(([\s\S]*)\);\s*$/.exec(published.toString());assert(match);const publication=JSON.parse(match[1]);write(root,publicationPath,published);
 for(const [,path] of bindings)write(root,path,readFileSync(join(repo,path)));
 const functions=['createOriginalBaseRollupSourceProfileV1','createOriginalArbitrumRollupSourceProfileV1','assertOriginalOwnedRollupSourceProfileV1','readOriginalOwnedRollupSourceProfileV1','closeOriginalOwnedRollupSourceProfileV1','readOriginalOwnedRollupSourceModuleV1'];
 // Only original repository/publication infrastructure is redirected to this
 // physical fixture. Every reviewed source byte and runtime import is real;
 // no native client, key, authority, receipt or financial result is fabricated.
 const body=source.replace(/^import[^\n]+;\n/gm,'').replace('const root=repository();','const root=HOST_ROOT;').replaceAll('fileURLToPath(import.meta.url)','join(HOST_ROOT,modulePath)').replace(/^export function /gm,'function ');
 const adopted=Object.freeze({generation:'11'.repeat(32),sourceSHA256:'22'.repeat(32),sourceFiles:Object.freeze([...bindings.map(([,source])=>source),...ownPaths].map(source=>Object.freeze({source,sourceSHA256:createHash('sha256').update(readFileSync(join(root,source))).digest('hex')})))});
 let currentAdoption=adopted;
 // Isolate the adoption-reader port: its own physical/tamper tests run in
 // current-source-generation.test.mjs. This fixture exercises consumer tokens.
 const ports={assertAdoptedSourceGeneration:()=>currentAdoption,assert,createHash,constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync,dirname,join,parse,relative,sep,fileURLToPath,NATIVE_VALUE_DEV_RELEASE_V5:publication,HOST_ROOT:root};
 const api=new Function(...Object.keys(ports),body+'\nreturn {'+functions.join(',')+'};')(...Object.values(ports));return {root,api,adopted,setAdoption(value){currentAdoption=value;}};}
test('retains exact original rollup source generation before funding and poisons changed files',()=>{
 const {root,api}=fixture();try{
 const original=api.createOriginalArbitrumRollupSourceProfileV1(),data=api.readOriginalOwnedRollupSourceProfileV1(original);assert.equal(data.profile,'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1');assert.equal(data.reviewedOwnFiles,3);assert.equal(data.originalRuntimeFiles,9);assert.equal(data.artifactAuthorityIssued,false);assert.equal(data.runtimeAuthorityIssued,false);
 assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1({...data}),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);assert.throws(()=>api.createOriginalArbitrumRollupSourceProfileV1({files:[]}),/OWNED_ROLLUP_SOURCE_NO_OPTIONS/);
 const own='scripts/development/owned_arbitrum_nitro_v1.py',before=readFileSync(join(root,own));write(root,own,Buffer.concat([before,Buffer.from('\n# source changed after birth\n')]));assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(original),/OWNED_ROLLUP_SOURCE_REVIEWED_FILE_CHANGED/);write(root,own,before);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(original),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);assert.equal(api.closeOriginalOwnedRollupSourceProfileV1(original).sourceIntegrityUncertain,true);
 const fresh=api.createOriginalBaseRollupSourceProfileV1();const path=bindings.find(([label])=>label.endsWith('/native-value-evm-dispatch-gate.mjs'))[1],gate=readFileSync(join(root,path));write(root,path,Buffer.concat([gate,Buffer.from('\n// replaced gate\n')]));assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(fresh),/OWNED_ROLLUP_SOURCE_ORIGINAL_RUNTIME_CHANGED/);write(root,path,gate);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(fresh),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);
 const unbound=api.createOriginalBaseRollupSourceProfileV1();api.closeOriginalOwnedRollupSourceProfileV1(unbound);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(unbound),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('adopted membership and generation bind the exact canonical sources without creating runtime authority',()=>{
 const {root,api,adopted,setAdoption}=fixture();try{
  setAdoption({...adopted,sourceFiles:adopted.sourceFiles.slice(1)});
  assert.throws(()=>api.createOriginalBaseRollupSourceProfileV1(),/OWNED_ROLLUP_SOURCE_CURRENT_SOURCE_MEMBER_REQUIRED/);
  setAdoption(adopted);const token=api.createOriginalBaseRollupSourceProfileV1();
  const report=api.readOriginalOwnedRollupSourceProfileV1(token);
  assert.equal(report.generation,adopted.generation);assert.equal(report.currentSourceSHA256,adopted.sourceSHA256);
  setAdoption({...adopted,generation:'33'.repeat(32)});
  assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(token),/OWNED_ROLLUP_SOURCE_GENERATION_CHANGED/);
  setAdoption(adopted);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(token),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
