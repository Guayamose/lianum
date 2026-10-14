/** Read-only artifact loaders. No runtime, prover, account, RPC or key is born. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve,relative,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]??fileURLToPath(new URL('../../',import.meta.url)));
assert.equal(JSON.parse(fs.readFileSync(join(root,'package.json'),'utf8')).name,'lianum');
const read=fs.readFileSync,originalOpen=fs.openSync,originalRead=fs.readSync,originalClose=fs.closeSync,seen=new Set(),fds=new Map();
function remember(value){
 let path;try{path=value instanceof URL?fileURLToPath(value):typeof value==='string'?resolve(value):null;}catch{return;}
 if(path?.startsWith(root+'/.internal/runtime/'))seen.add(relative(root,path));
}
fs.readFileSync=function(path,...args){const value=read.call(fs,path,...args);remember(typeof path==='number'?fds.get(path):path);return value;};
fs.openSync=function(path,...args){const fd=originalOpen.call(fs,path,...args);fds.set(fd,path);return fd;};
fs.readSync=function(fd,...args){const count=originalRead.call(fs,fd,...args);if(count>0)remember(fds.get(fd));return count;};
fs.closeSync=function(fd){try{return originalClose.call(fs,fd);}finally{fds.delete(fd);}};
syncBuiltinESMExports();
const original=async path=>import(pathToFileURL(join(root,path)).href);
let stage='PAGED';
try{
 const {inspectFundedPagedGraphArtifactsForPreparationV4,PAEG_PAGED_ARTIFACT_DIRECTORY_V3}=await original('packages/proofs/src/toolchain/paged-artifacts-v3.mjs');
 const paged=inspectFundedPagedGraphArtifactsForPreparationV4();
 const consumer=join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json'),consumerSHA256=createHash('sha256').update(fs.readFileSync(consumer)).digest('hex');
 const {assertFundedPagedLocalDeploymentArtifactsV3}=await original('packages/backend/src/operations/local/funded-graph-paged-deployment-v3.mjs');
 assertFundedPagedLocalDeploymentArtifactsV3(paged.manifestSHA256,consumerSHA256);
 stage='FLAT';
 const {loadFlatDeploymentArtifacts}=await original('packages/backend/src/operations/deployments/system/deployment-artifacts.mjs');
 await loadFlatDeploymentArtifacts();
 // A genuinely adopted courier also authenticates the retained native-value
 // preparation lineage. Collect the actual readonly inspector's fixed public
 // dependencies rather than copying an old generation or whole state tree.
 stage='NATIVE_PREPARATION';
 const {inspectRetainedNativeValueReuseForPreparationV6}=await original('packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs');
 await inspectRetainedNativeValueReuseForPreparationV6();
 stage='BACKED_ASSETS';
 const {loadBackedAssetDeploymentArtifacts}=await original('packages/backend/src/operations/deployments/defi/deploy-backed-assets.mjs');
 loadBackedAssetDeploymentArtifacts();
 stage='TOOLS';
 const {verifyToolchain,verifyCRS}=await original('packages/components/src/resources/wallet-resources.mjs');
 verifyToolchain();verifyCRS();
 const {linuxRuntimePins}=await original('packages/engine/src/chains/shared/linux-runtime-pins.mjs');
 const {solanaCandidateBoundedLedgerCompatibilityPin}=await original('packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs');
 const {PAGED_NATIVE_PROVER_BINARY_SHA256_V3}=await original('packages/proofs/src/toolchain/paged-native-prover-v3.mjs');
 // These retained executable helpers have their own original digest checks.
 // They remain artifact resources, never aliases of active host source.
 for(const path of ['omnichain-flat-profile/candidate-poseidon/src/component-tooling.mjs',
  'omnichain-product/experiments/private-core-proof/wallet-notes/resources.mjs',
  'omnichain-product/src/private-verifier-crs.mjs'])fs.readFileSync(join(root,'.internal/runtime',path));
 process.stdout.write(JSON.stringify({schema:'LIANUM_PAEG_PUBLIC_RESOURCE_INSPECTION_V1',
  files:[...seen].sort(),paged,pagedArtifactSource:relative(root,PAEG_PAGED_ARTIFACT_DIRECTORY_V3),consumerSHA256,linuxRuntimePins,
  solanaPins:[solanaCandidateBoundedLedgerCompatibilityPin],
  nativeProverSHA256:PAGED_NATIVE_PROVER_BINARY_SHA256_V3,
  runtimeStarted:false,proofGenerated:false,financialExecution:false})+'\n');
}catch(error){
 // Original errors may contain data. Only a closed operational code is sent.
 const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:null;
 const code=typeof first==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(first)?first:'PUBLIC_ARTIFACT_INSPECTION_FAILED';
 const frames=[];for(const line of typeof error?.stack==='string'?error.stack.slice(0,32768).split('\n').slice(1,32):[]){
  const match=/\b(file:\/\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,6}):([1-9][0-9]{0,6})\)?$/.exec(line);if(!match)continue;
  try{const file=fileURLToPath(match[1]),path=relative(root,file);if(!file.startsWith(root+'/')||!/^packages\/[A-Za-z0-9_./-]+\.mjs$/.test(path))continue;frames.push({path,line:Number(match[2]),column:Number(match[3])});if(frames.length===3)break;}catch{}
 }
 process.stdout.write(JSON.stringify({schema:'LIANUM_PAEG_PUBLIC_RESOURCE_INSPECTION_V1',ok:false,stage,code,frames,runtimeStarted:false,proofGenerated:false})+'\n');
 process.exitCode=1;
}finally{fs.readFileSync=read;fs.openSync=originalOpen;fs.readSync=originalRead;fs.closeSync=originalClose;syncBuiltinESMExports();}
