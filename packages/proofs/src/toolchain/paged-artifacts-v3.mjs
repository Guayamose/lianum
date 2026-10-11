/** Active reader for the retained paged generation. Historical source bytes,
 * manifest, complete programs, verification keys and source-rebind checks keep
 * their original meaning. This reader neither compiles nor blesses new sources. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {projectRoot,sourcePath} from '@lianum/environment';
import {verifyToolchain,verifyCRS} from '@lianum/components/resources/wallet-resources';
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
// Fixed byte evidence for the relocated/changed host records. These files
// are read and hashed only; they are never imported or installed as launchers.
const retainedHostSources=Object.freeze({
 '.internal/runtime/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs':'archive/delivery/source-snapshot/omnichain-flat-profile/flat-wallet/proof-workers/solidity-compiler.mjs',
 '.internal/runtime/omnichain-product/src/chains/runtime-harness.mjs':'archive/delivery/source-snapshot/omnichain-product/src/chains/runtime-harness.mjs',
 '.internal/runtime/omnichain-product/src/private-resource-policy.mjs':'archive/delivery/source-snapshot/omnichain-product/src/private-resource-policy.mjs',
 'packages/engine/src/chains/shared/runtime-harness.mjs':'archive/delivery/source-snapshot/omnichain-product/src/chains/runtime-harness.mjs',
 'packages/engine/src/crypto/private-resource-policy.mjs':'archive/delivery/source-snapshot/omnichain-product/src/private-resource-policy.mjs',
 'apps/mobile/src/custody/poseidon2-bn254-v1.mjs':'archive/source-evidence/paged-original-host-v4/a647de5c112bb8f76bfd39362f2ef0442c0c7c95e041014198e3788782bf74ab.source',
 'packages/engine/src/execution/graph/funded-graph-paged-trees-v3.mjs':'archive/source-evidence/paged-original-host-v4/5d889f2f365bb89ef1fe6a96269534c97e74021799f6b0739be5e067ce90cd22.source',
 'packages/engine/src/execution/graph/funded-graph-paged-v3.mjs':'archive/source-evidence/paged-original-host-v4/0c78278135f719afc593c4eef8e196784371e15a414ae353a9f2db2bdec6f779.source',
 'packages/proofs/src/jobs/private-proof-transit-v1.mjs':'archive/source-evidence/paged-original-host-v4/b4ed378cb081421d91630ab808fec3abf91073c5c6051791894e84a67fd12278.source',
 'packages/proofs/src/tooling/solidity-compiler.mjs':'archive/source-evidence/paged-original-host-v4/144113a0642dcba06d4396dfc40cfc8cd94eeb4b79cba6e9aab05b25e4171473.source',
});
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

/** Authenticate the retained five-role generation for source-candidate review.
 * The original financial reader above keeps its exact current-source join.
 * Historical launcher records remain historical; no wrapper is substituted for
 * an original producer and no proof, compilation or artifact brand is issued. */
export function inspectFundedPagedGraphArtifactsForPreparationV4(){
 assert.equal(arguments.length,0,'PAEG_PAGED_PREPARATION_NO_OPTIONS');
 const manifestSHA256='a3cfb7d05246a5876590f1c5c0a50ab8313c7d1e863dfe7636f18aa8199fe8aa';
 const manifest=pinnedManifest(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,manifestSHA256);
 const original=pinnedManifest(originalArtifactDirectory,originalArtifactManifestSHA256);
 assert.deepEqual(manifest.artifactSourceRebind,sourceRebind(original,manifest.sources),'PAEG_PAGED_REBIND_PROVENANCE');
 assert.deepEqual(manifest.roles,original.roles,'PAEG_PAGED_REBIND_EXACT_KEYS');
 const compilerInputs=[],hostSources=[];
 // Current host JavaScript is authenticated separately by the candidate's
 // current ESM source contract. Every recorded circuit/library/configuration and
 // Solidity input must still match the original generation byte for byte.
 for(const row of manifest.sources){
  assert.ok(typeof row.path==='string'&&!row.path.startsWith('/')&&!row.path.split('/').some(p=>!p||p==='.'||p==='..'),'PAEG_PAGED_RETAINED_SOURCE_PATH');
  if(row.path.endsWith('.mjs')){
   const source=Object.hasOwn(retainedHostSources,row.path)?retainedHostSources[row.path]:row.path;
   const value=regular(join(project,source));
   assert.equal(value.length,row.bytes,'PAEG_PAGED_RETAINED_HOST_BYTES');
   assert.equal(sha(value),row.sha256,'PAEG_PAGED_RETAINED_HOST_PIN');
   hostSources.push({...row,source});
   continue;
  }
  assert.ok(/\.(nr|toml|sol|json)$/.test(row.path),'PAEG_PAGED_RETAINED_SOURCE_KIND');
  const value=regular(join(project,row.path));
  assert.equal(value.length,row.bytes,'PAEG_PAGED_RETAINED_COMPILER_BYTES');
  assert.equal(sha(value),row.sha256,'PAEG_PAGED_RETAINED_COMPILER_PIN');
  compilerInputs.push({...row});
 }
 const toolchain=verifyToolchain(),crs=verifyCRS();
 assert.deepEqual(pinnedManifest(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,manifestSHA256),manifest,'PAEG_PAGED_PREPARATION_CHANGED');
 return Object.freeze({schema:'LIANUM_PAGED_EXACT_RETAINED_REUSE_V4',manifestSHA256,
  originalManifestSHA256:originalArtifactManifestSHA256,artifactSourceRebind:manifest.artifactSourceRebind,
  roles:manifest.roles,recordedSourceFiles:manifest.sources,compilerInputs,hostSources,toolchain,crs,
  currentLaunchersClaimedAsOriginal:false,compiledNow:false,proofGenerated:false,
  sourceCapsuleRewritten:false,sourceAcceptanceEstablished:false,artifactBundleIssued:false,financialAcceptance:false});
}
