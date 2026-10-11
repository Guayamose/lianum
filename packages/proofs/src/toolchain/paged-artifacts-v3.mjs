/** Active reader for the retained paged generation. Historical source bytes,
 * manifest, complete programs, verification keys and source-rebind checks keep
 * their original meaning. This reader neither compiles nor blesses new sources. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {projectRoot,sourcePath} from '@lianum/environment';
export const PAEG_PAGED_PROFILE_V3='LIANUM_PAEG_FUNDED_PAGED_V3';
export const PAEG_PAGED_WORDS_V3=Object.freeze({reserve:119,fold:66,terminal:46,admission:85,withdraw:39});
export const PAEG_PAGED_SETTINGS_V3=Object.freeze({ipaAccumulation:false,oracleHashType:'keccak',disableZk:false,optimizedSolidityVerifier:false});
export const PAEG_PAGED_ROOT_V3=sourcePath('experiments/engine/private-core-proof/funded-graph-paged-v3')+'/';
export const PAEG_PAGED_SPARSE_ENCODING_V3='BN254_POSEIDON2_SPARSE_V3';
// The original five-key generation and its rejected consumer compile remain
// untouched. The successor retains those exact keys only after recompiling all
// five complete programs and proving byte-for-byte identity with that generation.
export const PAEG_PAGED_ARTIFACT_DIRECTORY_V3=join(PAEG_PAGED_ROOT_V3,'.local/poseidon-sparse-v3-consumer-fix-v1');
const originalArtifactDirectory=join(PAEG_PAGED_ROOT_V3,'.local/poseidon-sparse-v3');
const originalArtifactManifestSHA256='0bafbc32a6ff4e645bb9aba4b6a20e50f552cbc251203764558d8527924fef8e';
const project=projectRoot;
const original=join(project,'.internal/runtime/omnichain-product');
const sha=v=>createHash('sha256').update(v).digest('hex');
const regular=p=>{assert.equal(realpathSync(p),resolve(p),'PAEG_PAGED_FILE_SYMLINK');assert.ok(lstatSync(p).isFile(),'PAEG_PAGED_REGULAR_FILE');return readFileSync(p);};
function files(dir,out=[]){for(const e of readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink(),'PAEG_PAGED_SOURCE_SYMLINK');if(e.name==='.local')continue;const p=join(dir,e.name);if(e.isDirectory())files(p,out);else if(/\.(nr|toml|mjs|sol)$/.test(e.name))out.push(p);}return out;}
function sourceClosure(seeds){
 const seen=new Set();function visit(p){p=resolve(p);assert.ok(p.startsWith(project+'/'),'PAEG_PAGED_SOURCE_OUTSIDE_PROJECT');if(seen.has(p))return;assert.ok(seen.size<1024,'PAEG_PAGED_SOURCE_CLOSURE_BOUND');const text=regular(p).toString('utf8');seen.add(p);const re=/\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/g;const sol=/\bimport\s+(?:[^;]*?\sfrom\s+)?["'](\.[^"']+)["']/g;for(const pattern of [re,sol])for(const m of text.matchAll(pattern)){const next=resolve(dirname(p),m[1]);if(/\.(mjs|ts|sol)$/.test(next))visit(next);}}seeds.forEach(visit);return [...seen];
}
export function fundedPagedGraphSourcePinsV3(){
 const paths=sourceClosure([...files(PAEG_PAGED_ROOT_V3),join(PAEG_PAGED_ROOT_V3,'transcript.json'),...files(join(project,'experiments/engine/private-core-proof/generic-graph/lib')),
  ...files(join(project,'experiments/engine/private-core-proof/generic-funding/lib')),...files(join(project,'experiments/engine/private-core-proof/generic-native/lib')),
  join(project,'packages/engine/src/execution/graph/funded-graph-paged-v3.mjs'),join(project,'packages/proofs/src/tooling/solidity-compiler.mjs'),
  ...files(join(project,'experiments/engine/private-core-proof/funded-graph-64-v2/lib')),
  ...files(join(project,'packages/crypto/vendor/poseidon')),
  join(project,'contracts/wallet/PrivatePagedFundedGraphPoolV3.sol'),join(project,'contracts/wallet/PrivatePagedFundedGraphStateV3.sol'),join(project,'contracts/wallet/PrivatePagedFundedGraphNativeStateV3.sol'),
  join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs'),join(original,'experiments/private-core-proof/wallet-notes/resources.mjs')]);
 return paths.sort().map(p=>{const b=regular(p);return{path:relative(project,p),bytes:b.length,sha256:sha(b)};});
}
function pinnedManifest(directory,expectedManifestSHA256){
 assert.match(expectedManifestSHA256,/^[0-9a-f]{64}$/,'PAEG_PAGED_REVIEWED_MANIFEST_REQUIRED');
 const bytes=regular(join(directory,'manifest.json'));assert.equal(sha(bytes),expectedManifestSHA256,'PAEG_PAGED_MANIFEST_PIN');const manifest=JSON.parse(bytes);
 assert.equal(manifest.profile,PAEG_PAGED_PROFILE_V3);assert.equal(manifest.sparseTreeEncoding,PAEG_PAGED_SPARSE_ENCODING_V3,'PAEG_PAGED_SPARSE_GENERATION_REQUIRED');assert.equal(manifest.phase,'completed');assert.deepEqual(manifest.settings,PAEG_PAGED_SETTINGS_V3);
 assert.deepEqual(Object.keys(manifest.roles),Object.keys(PAEG_PAGED_WORDS_V3),'PAEG_PAGED_EXACT_ROLES');
 for(const m of Object.keys(PAEG_PAGED_WORDS_V3)){const r=manifest.roles[m];assert.equal(r.words,PAEG_PAGED_WORDS_V3[m]);assert.equal(r.target,'evm');assert.ok(r.dyadic>0&&r.dyadic<=2097152,'PAEG_PAGED_EXISTING_CRS_TOO_SMALL');for(const [ext,key] of [['json','programSHA256'],['vk','keySHA256'],['sol','soliditySHA256']])assert.equal(sha(regular(join(directory,'prepared',m+'.'+ext))),r[key],'PAEG_PAGED_ARTIFACT_PIN');}
 return manifest;
}
function sourceRebind(original,sourcePins){
 assert.deepEqual(original.sources.map(r=>r.path),sourcePins.map(r=>r.path),'PAEG_PAGED_REBIND_SOURCE_SET');
 const changed=sourcePins.filter((r,i)=>r.sha256!==original.sources[i].sha256||r.bytes!==original.sources[i].bytes).map(r=>r.path);
 assert.deepEqual(changed.sort(),['contracts/wallet/PrivatePagedFundedGraphPoolV3.sol','experiments/engine/private-core-proof/funded-graph-paged-v3/artifacts.mjs','experiments/engine/private-core-proof/funded-graph-paged-v3/run-bounded.mjs'].sort(),'PAEG_PAGED_REBIND_FIXED_CHANGE');
 const poolPath='contracts/wallet/PrivatePagedFundedGraphPoolV3.sol',pool=regular(join(project,poolPath)).toString('utf8');
 assert.equal(pool.split('bytes1(uint8(1))').length,2,'PAEG_PAGED_REBIND_FIXED_SOLIDITY_TYPE');
 assert.equal(sha(pool.replace('bytes1(uint8(1))','bytes1(1)')),original.sources.find(r=>r.path===poolPath).sha256,'PAEG_PAGED_REBIND_EXACT_SOLIDITY_CHANGE');
 return {profile:'EXACT_COMPLETE_PROGRAM_RECOMPILE_V1',originDirectory:'.local/poseidon-sparse-v3',originManifestSHA256:originalArtifactManifestSHA256,recompiledProgramSHA256:Object.fromEntries(Object.entries(original.roles).map(([m,r])=>[m,r.programSHA256]))};
}
export function loadFundedPagedGraphArtifactsV3(expectedManifestSHA256){
 const manifest=pinnedManifest(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,expectedManifestSHA256),sourcePins=fundedPagedGraphSourcePinsV3();assert.deepEqual(manifest.sources,sourcePins,'PAEG_PAGED_SOURCE_CHANGED');
 if(manifest.artifactSourceRebind){const original=pinnedManifest(originalArtifactDirectory,originalArtifactManifestSHA256);assert.deepEqual(manifest.artifactSourceRebind,sourceRebind(original,sourcePins),'PAEG_PAGED_REBIND_PROVENANCE');assert.deepEqual(manifest.roles,original.roles,'PAEG_PAGED_REBIND_EXACT_KEYS');}
 return Object.freeze(manifest);
}
