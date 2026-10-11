/** Fixed same-generation source profile for original Java-Tron mobile composition.
 * Born before custody, native CREATE or genesis funding. This is source integrity
 * only: no runtime/artifact/key/proof/spend authority is issued from metadata.
 * The existing compiler/release roots and publication remain untouched. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,join,parse,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../../packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs';
const CAPSULE='OWNED_ORIGINAL_TRON_MOBILE_SOURCE_PROFILE_V1';
const selected={profile:'ORIGINAL_TRON_PRIVATE_NATIVE_MOBILE_V1',files:[{"path":"scripts/development/owned-tron-private-native-mobile-v1.mjs","sha256":"6802c9d7d65328b0d9d18c453427eea9198834ae370136e6dd4448df14b1ef6b"},{"path":"apps/platform/src/run-original-tron-private-native-mobile-v1.mjs","sha256":"337079a86fdcd8001e6a7ea8d79cf90136370faf999d8d910e30bfefe9dcb800"},{"path":"scripts/development/original-network-mobile-private-diagnostic-v1.mjs","sha256":"fd296edbeef48b8165472b62a02e560bd139e80bcab41a06fb464d1b8c099dbd"},{"path":"tests/integration/wallet/native/native-device-economic-private-error-v1.mjs","sha256":"5059190aa698d6bfcabcdb0511d23bb88e33006dcdf74413e8a7cfa7346aca84"}]};
const slots=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stats=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'];
const publicationPath='packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs';
// Original publication labels remain provenance. Current bytes are authenticated
// against the adopted generation at their actual executed source locations.
const runtimeFiles=Object.freeze([
 [
  "golden/src/vault.mjs",
  "packages/engine/src/crypto/vault.mjs"
 ],
 [
  "golden/src/privacy.mjs",
  "packages/engine/src/crypto/privacy.mjs"
 ],
 [
  "golden/src/private-cohort-public-native.mjs",
  "packages/engine/src/cohorts/private-cohort-public-native.mjs"
 ],
 [
  "wallet-platform/modules/paeg/readiness-inputs.mjs",
  "packages/components/src/plain-input.mjs"
 ],
 [
  "wallet-platform/modules/paeg/commitments.mjs",
  "packages/components/src/encoding/commitments.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/native-economic-local-signing-v2.mjs",
  "packages/backend/src/chains/evm/runtime/native-economic-local-signing-v2.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs",
  "packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/owned-evm-native-value-profile.mjs",
  "packages/backend/src/chains/evm/transfers/owned-evm-native-value-profile.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/native-value-evm-dispatch-gate.mjs",
  "packages/backend/src/chains/evm/dispatch/native-value-evm-dispatch-gate.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/owned-tron-native-value-runtime.mjs",
  "packages/backend/src/chains/tron/runtime/owned-tron-native-value-runtime.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/guarded/tron-product-host-scope-v1.mjs",
  "packages/backend/src/chains/tron/runtime/guarded/tron-product-host-scope-v1.mjs"
 ]
]);
const mobileRuntimeFiles=Object.freeze([
 [
  "wallet-platform/modules/ops/native-device-local-restart-v1.mjs",
  "packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs"
 ],
 [
  "wallet-platform/modules/ops/native-value-local-operator-bootstrap-v4.mjs",
  "packages/backend/src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs"
 ],
 [
  "wallet-platform/modules/ops/native-value-system-v2.mjs",
  "packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs"
 ],
 [
  "wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs",
  "packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs"
 ],
 [
  "wallet-platform/modules/paeg/native-value-execution-v2.mjs",
  "packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs"
 ],
 [
  "wallet-platform/modules/global-state/native-value-account-authority-v2.mjs",
  "packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs"
 ],
 [
  "wallet-platform/modules/api/flat-manual-graph-session.mjs",
  "packages/backend/src/api/accounts/flat-manual-graph-session.mjs"
 ],
 [
  "wallet-platform/modules/ops/native-device-local-operator-v1.mjs",
  "packages/backend/src/operations/recovery/native-device-local-operator-v1.mjs"
 ],
 [
  "wallet-platform/modules/solvers/native-value-provider-v2.mjs",
  "packages/backend/src/providers/native-value-provider-v2.mjs"
 ],
 [
  "wallet-platform/modules/chain-adapters/generic-native-value-v2.mjs",
  "packages/backend/src/chains/shared/transfers/generic-native-value-v2.mjs"
 ],
 [
  "mobile-core/native-value-owner-process-v2.mjs",
  "packages/backend/src/custody/processes/native-value-owner-process-v2.mjs"
 ],
 [
  "golden/src/paeg/native-recipient-process.mjs",
  "packages/backend/src/execution/native/recipients/native-recipient-process.mjs"
 ],
 [
  "golden/src/paeg/native-recipient-custody.mjs",
  "packages/engine/src/execution/native/recipients/native-recipient-custody.mjs"
 ],
 [
  "golden/src/paeg/generic-balance-native-preparation.mjs",
  "packages/engine/src/execution/balances/generic-balance-native-preparation.mjs"
 ],
 [
  "golden/src/paeg/native-admission.mjs",
  "packages/engine/src/execution/native/dispatch/native-admission.mjs"
 ]
]);
const selectedMobile=Object.freeze({...selected,runtimeFiles:mobileRuntimeFiles});
function repository(){let current=dirname(fileURLToPath(import.meta.url));while(current!==parse(current).root){
 if(existsSync(join(current,'scripts/layout.json'))&&existsSync(join(current,'package.json'))
 &&JSON.parse(readFileSync(join(current,'package.json'),'utf8')).name==='lianum')return realpathSync(current);current=dirname(current);}
 throw new Error('OWNED_TRON_MOBILE_SOURCE_ORIGINAL_REPOSITORY_REQUIRED');}
const root=repository();
function physical(path){assert(typeof path==='string'&&!path.startsWith('/')&&!path.split('/').some(x=>!x||x==='.'||x==='..'),'OWNED_TRON_MOBILE_SOURCE_FIXED_PATH');
 const full=join(root,path);assert(!relative(root,full).startsWith('..'+sep),'OWNED_TRON_MOBILE_SOURCE_FIXED_PATH');
 let part=root;for(const name of path.split('/').slice(0,-1)){part=join(part,name);const info=lstatSync(part);assert(info.isDirectory()&&!info.isSymbolicLink(),'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_DIRECTORY');}
 assert.equal(realpathSync(full),full,'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_PATH');const before=lstatSync(full);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()
 &&[0o600,0o644].includes(before.mode&0o777)&&before.size>0&&before.size<=32*1024*1024,'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_FILE');
 const fd=openSync(full,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{for(const key of stats)assert.equal(fstatSync(fd)[key],before[key],'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_CHANGED');
 bytes=Buffer.alloc(before.size+1);let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)break;offset+=count;}
 assert.equal(offset,before.size,'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_CHANGED');
 for(const after of [fstatSync(fd),lstatSync(full)])for(const key of stats)assert.equal(after[key],before[key],'OWNED_TRON_MOBILE_SOURCE_PHYSICAL_CHANGED');
 return bytes.subarray(0,offset);
 }catch(error){bytes?.fill(0);throw error;}finally{closeSync(fd);}}
function fileHash(path){const bytes=physical(path);try{return sha(bytes);}finally{bytes.fill(0);}}
const modulePath='scripts/development/owned-tron-original-mobile-source-v1.mjs';
const loadedSourceSHA256=fileHash(modulePath);
function publication(){const bytes=physical(publicationPath);try{const text=bytes.toString('utf8');
 const match=/^\/\*\*[\s\S]*?\*\/\s*export const NATIVE_VALUE_DEV_RELEASE_V5 = Object\.freeze\(([\s\S]*)\);\s*$/.exec(text);
 assert(match,'OWNED_TRON_MOBILE_SOURCE_FIXED_PUBLICATION');const value=JSON.parse(match[1]);
 assert.equal(value?.schema,'LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5','OWNED_TRON_MOBILE_SOURCE_FIXED_PUBLICATION');
 assert.deepEqual(value,NATIVE_VALUE_DEV_RELEASE_V5,'OWNED_TRON_MOBILE_SOURCE_LOADED_PUBLICATION_CHANGED');
 assert(Array.isArray(value.sourceFiles)&&value.sourceFiles.length>0&&value.sourceFiles.length<=4096,'OWNED_TRON_MOBILE_SOURCE_PUBLICATION_MEMBERSHIP');
 const rows=new Map();for(const row of value.sourceFiles){assert(row&&Object.keys(row).sort().join(',')==='path,sha256'
 &&typeof row.path==='string'&&/^[a-f0-9]{64}$/.test(row.sha256)&&!rows.has(row.path),'OWNED_TRON_MOBILE_SOURCE_PUBLICATION_MEMBERSHIP');rows.set(row.path,row.sha256);}
 return {sha256:sha(bytes),rows};}finally{bytes.fill(0);}}
function capture(selected){assert.equal(fileHash(modulePath),loadedSourceSHA256,'OWNED_TRON_MOBILE_SOURCE_LOADED_MODULE_CHANGED');
 const adopted=assertAdoptedSourceGeneration(),currentSources=new Map(adopted.sourceFiles.map(row=>[row.source,row.sourceSHA256]));
 const published=publication(),own=selected.files.map(row=>{const expected=currentSources.get(row.path);assert(expected,'OWNED_TRON_MOBILE_SOURCE_CURRENT_SOURCE_MEMBER_REQUIRED');assert.equal(fileHash(row.path),expected,'OWNED_TRON_MOBILE_SOURCE_REVIEWED_FILE_CHANGED');return {path:row.path,sha256:expected,originalSHA256:row.sha256};});
 const runtime=[...runtimeFiles,...(selected.runtimeFiles??[])].map(([path,physicalPath])=>{
 const originalSHA256=published.rows.get(path);assert(originalSHA256,'OWNED_TRON_MOBILE_SOURCE_ORIGINAL_RUNTIME_MEMBER_REQUIRED');
 const expected=currentSources.get(physicalPath);assert(expected,'OWNED_TRON_MOBILE_SOURCE_CURRENT_SOURCE_MEMBER_REQUIRED');
 assert.equal(fileHash(physicalPath),expected,'OWNED_TRON_MOBILE_SOURCE_ORIGINAL_RUNTIME_CHANGED');return {path,physicalPath,sha256:expected,originalSHA256};});
 const after=assertAdoptedSourceGeneration();assert.equal(after.generation,adopted.generation,'OWNED_TRON_MOBILE_SOURCE_GENERATION_CHANGED');assert.equal(after.sourceSHA256,adopted.sourceSHA256,'OWNED_TRON_MOBILE_SOURCE_GENERATION_CHANGED');
 assert.equal(publication().sha256,published.sha256,'OWNED_TRON_MOBILE_SOURCE_PUBLICATION_CHANGED');
 const value={schema:CAPSULE,profile:selected.profile,moduleSHA256:loadedSourceSHA256,publicationSHA256:published.sha256,generation:adopted.generation,currentSourceSHA256:adopted.sourceSHA256,ownFiles:own,runtimeFiles:runtime};
 return {value,sha256:sha(JSON.stringify(value))};}
function birth(selected){const initial=capture(selected),token=Object.freeze(Object.create(null));
 slots.set(token,{selected,value:initial.value,sha256:initial.sha256,closed:false,poisoned:false});
 assertOriginalOwnedTronMobileSourceV1(token);return token;}
/** Original mobile source born before native/custody CREATE or funds. */
export function createOriginalTronNativeMobileSourceV1(){assert.equal(arguments.length,0,'OWNED_TRON_MOBILE_SOURCE_NO_OPTIONS');return birth(selectedMobile);}
export function assertOriginalOwnedTronMobileSourceV1(token){assert.equal(arguments.length,1,'OWNED_TRON_MOBILE_SOURCE_TOKEN_ARITY');
 const state=slots.get(token);assert(state&&!state.closed&&!state.poisoned,'OWNED_TRON_MOBILE_SOURCE_ORIGINAL_TOKEN_REQUIRED');
 try{const next=capture(state.selected);assert.equal(next.sha256,state.sha256,'OWNED_TRON_MOBILE_SOURCE_GENERATION_CHANGED');assert.deepEqual(next.value,state.value,'OWNED_TRON_MOBILE_SOURCE_GENERATION_CHANGED');}
 catch(error){state.poisoned=true;throw error;}}
export function readOriginalOwnedTronMobileSourceV1(token){assert.equal(arguments.length,1,'OWNED_TRON_MOBILE_SOURCE_TOKEN_ARITY');assertOriginalOwnedTronMobileSourceV1(token);const state=slots.get(token);
 return Object.freeze({schema:CAPSULE,profile:state.value.profile,sourceSHA256:state.sha256,moduleSHA256:loadedSourceSHA256,
 publicationSHA256:state.value.publicationSHA256,generation:state.value.generation,currentSourceSHA256:state.value.currentSourceSHA256,reviewedOwnFiles:state.value.ownFiles.length,originalRuntimeFiles:state.value.runtimeFiles.length,
 compilerSourceRootsChanged:false,artifactAuthorityIssued:false,runtimeAuthorityIssued:false,publicNetwork:false,independentOperators:false,nativeFinalityAcceptanceEstablished:false});}
export function closeOriginalOwnedTronMobileSourceV1(token){assert.equal(arguments.length,1,'OWNED_TRON_MOBILE_SOURCE_TOKEN_ARITY');const state=slots.get(token);assert(state,'OWNED_TRON_MOBILE_SOURCE_ORIGINAL_TOKEN_REQUIRED');state.closed=true;
 return Object.freeze({closed:true,sourceSHA256:state.sha256,sourceIntegrityUncertain:state.poisoned});}

