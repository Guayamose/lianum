import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync,mkdtempSync,mkdirSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {dirname,join,parse,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
function repository(){let path=dirname(fileURLToPath(import.meta.url));while(path!==parse(path).root){if(existsSync(join(path,'scripts/layout.json'))&&existsSync(join(path,'package.json'))&&JSON.parse(readFileSync(join(path,'package.json'),'utf8')).name==='lianum')return realpathSync(path);path=dirname(path);}throw new Error('HOST_ORIGINAL_REPOSITORY');}
const repo=repository(),draft=join(repo,'.internal/dev/drafts/continuous-networks-v1/owned-rollup-original-source-profile-v1/canonical-overlay');
const base=join(repo,'.internal/dev/drafts/continuous-networks-v1/base-original-native-value-dispatch-v1/canonical-overlay');
const paired=join(repo,'.internal/dev/drafts/continuous-networks-v1/arbitrum-original-prague-blob-schedule-v1/canonical-overlay');
function fixedCandidate(path){for(const root of [draft,base,paired,repo])if(existsSync(join(root,path)))return readFileSync(join(root,path));throw new Error('HOST_FIXED_CANDIDATE_REQUIRED');}
const modulePath='scripts/development/owned-rollup-original-source-profile-v1.mjs';
const publicationPath='.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-dev-release-v5.mjs';
const bindings=[['golden/src/vault.mjs','.internal/runtime/omnichain-product/src/vault.mjs'],['golden/src/privacy.mjs','.internal/runtime/omnichain-product/src/privacy.mjs'],['golden/src/private-cohort-public-native.mjs','.internal/runtime/omnichain-product/src/private-cohort-public-native.mjs'],...['paeg/readiness-inputs.mjs','paeg/commitments.mjs','chain-adapters/native-economic-local-signing-v2.mjs','chain-adapters/owned-evm-v2-runtime.mjs','chain-adapters/owned-evm-native-value-profile.mjs','chain-adapters/native-value-evm-dispatch-gate.mjs'].map(path=>['wallet-platform/modules/'+path,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/'+path])];
function write(root,path,bytes,mode=0o644){const full=join(root,path);mkdirSync(dirname(full),{recursive:true,mode:0o700});writeFileSync(full,bytes,{mode});chmodSync(full,mode);}
function fixture(){const root=mkdtempSync(join(tmpdir(),'original-rollup-source-'));chmodSync(root,0o700);write(root,'scripts/layout.json','{}');write(root,'package.json',JSON.stringify({name:'lianum'}));
 for(const name of ['owned-base-rollup-v1.mjs','owned_base_rollup_v1.py','owned-base-native-value-dispatch-v1.mjs','owned-arbitrum-nitro-v1.mjs','owned_arbitrum_nitro_v1.py','owned-arbitrum-native-value-dispatch-v1.mjs']){const path='scripts/development/'+name;write(root,path,fixedCandidate(path));}
 const source=fixedCandidate(modulePath).toString();write(root,modulePath,source);
 const published=readFileSync(join(repo,publicationPath)),match=/Object\.freeze\(([\s\S]*)\);\s*$/.exec(published.toString());assert(match);const publication=JSON.parse(match[1]);write(root,publicationPath,published);
 for(const [,path] of bindings)write(root,path,readFileSync(join(repo,path)));
 const functions=['createOriginalBaseRollupSourceProfileV1','createOriginalArbitrumRollupSourceProfileV1','assertOriginalOwnedRollupSourceProfileV1','readOriginalOwnedRollupSourceProfileV1','closeOriginalOwnedRollupSourceProfileV1','readOriginalOwnedRollupSourceModuleV1'];
 // Only original repository/publication infrastructure is redirected to this
 // physical fixture. Every reviewed source byte and runtime import is real;
 // no native client, key, authority, receipt or financial result is fabricated.
 const body=source.replace(/^import[^\n]+;\n/gm,'').replace('const root=repository();','const root=HOST_ROOT;').replaceAll('fileURLToPath(import.meta.url)','join(HOST_ROOT,modulePath)').replace(/^export function /gm,'function ');
 const ports={assert,createHash,constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync,dirname,join,parse,relative,sep,fileURLToPath,NATIVE_VALUE_DEV_RELEASE_V5:publication,HOST_ROOT:root};
 const api=new Function(...Object.keys(ports),body+'\nreturn {'+functions.join(',')+'};')(...Object.values(ports));return {root,api};}
test('retains exact original rollup source generation before funding and poisons changed files',()=>{
 const {root,api}=fixture();try{
 const original=api.createOriginalArbitrumRollupSourceProfileV1(),data=api.readOriginalOwnedRollupSourceProfileV1(original);assert.equal(data.profile,'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1');assert.equal(data.reviewedOwnFiles,3);assert.equal(data.originalRuntimeFiles,9);assert.equal(data.artifactAuthorityIssued,false);assert.equal(data.runtimeAuthorityIssued,false);
 assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1({...data}),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);assert.throws(()=>api.createOriginalArbitrumRollupSourceProfileV1({files:[]}),/OWNED_ROLLUP_SOURCE_NO_OPTIONS/);
 const own='scripts/development/owned_arbitrum_nitro_v1.py',before=readFileSync(join(root,own));write(root,own,Buffer.concat([before,Buffer.from('\n# source changed after birth\n')]));assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(original),/OWNED_ROLLUP_SOURCE_REVIEWED_FILE_CHANGED/);write(root,own,before);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(original),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);assert.equal(api.closeOriginalOwnedRollupSourceProfileV1(original).sourceIntegrityUncertain,true);
 const fresh=api.createOriginalBaseRollupSourceProfileV1();const path=bindings.find(([label])=>label.endsWith('/native-value-evm-dispatch-gate.mjs'))[1],gate=readFileSync(join(root,path));write(root,path,Buffer.concat([gate,Buffer.from('\n// replaced gate\n')]));assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(fresh),/OWNED_ROLLUP_SOURCE_ORIGINAL_RUNTIME_CHANGED/);write(root,path,gate);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(fresh),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);
 const unbound=api.createOriginalBaseRollupSourceProfileV1();api.closeOriginalOwnedRollupSourceProfileV1(unbound);assert.throws(()=>api.assertOriginalOwnedRollupSourceProfileV1(unbound),/OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
