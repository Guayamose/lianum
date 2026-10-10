/** Fixed same-generation source profile for original BSC714 native clients.
 * Born before custody, native CREATE or genesis funding. This is source integrity
 * only: no runtime/artifact/key/proof/spend authority is issued from metadata.
 * The existing compiler/release roots and publication remain untouched. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,join,parse,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-dev-release-v5.mjs';
const CAPSULE='OWNED_ORIGINAL_BSC_SOURCE_PROFILE_V3';
const selected={profile:'OWNED_BSC_POSA_NATIVE_VALUE_714_V3',files:[{"path":"scripts/development/owned-bsc-posa-v1.mjs","sha256":"53f48f4afdb4cf4def95b79f5f0144053e26c87916aaeeb81996a09c09222933"},{"path":"scripts/development/owned_bsc_posa_v1.py","sha256":"ba6ff354a910516c8305625d73d4cabbd8a552d8b2b4e731a28e53365fa70c5f"},{"path":"scripts/development/owned-bsc-native-value-dispatch-v3.mjs","sha256":"bd1b0e1e218bd28f4e14032c216d99bda7f43f092954372ba43485c1cb8673ac"},{"path":"scripts/development/bsc_original_genesis_v3.py","sha256":"c80a262c70130dc355f42d818e6a70b2a3ce75e502d861ea290d20be06a548d1"}]};
const slots=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stats=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'];
const publicationPath='.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-dev-release-v5.mjs';
const runtimeRoot='.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/';
const runtimeFiles=Object.freeze([
 ['golden/src/vault.mjs','.internal/runtime/omnichain-product/src/vault.mjs'],
 ['golden/src/privacy.mjs','.internal/runtime/omnichain-product/src/privacy.mjs'],
 ['golden/src/private-cohort-public-native.mjs','.internal/runtime/omnichain-product/src/private-cohort-public-native.mjs'],
 ...['paeg/readiness-inputs.mjs','paeg/commitments.mjs',
 'chain-adapters/native-economic-local-signing-v2.mjs','chain-adapters/owned-evm-v2-runtime.mjs',
 'chain-adapters/owned-evm-native-value-profile.mjs','chain-adapters/native-value-evm-dispatch-gate.mjs'].map(path=>['wallet-platform/modules/'+path,runtimeRoot+path])]);
// Separate fixed mobile composition. No runtime, path, hash, callback or
// selected mode is accepted from its caller. All direct dynamic imports below
// must also be current authenticated publication members before native birth.
const mobileRuntimeFiles=Object.freeze([
 ...['ops/native-device-local-restart-v1.mjs','ops/native-value-local-operator-bootstrap-v4.mjs',
 'ops/native-value-system-v2.mjs','ops/native-value-deployment-artifacts-v2.mjs',
 'paeg/native-value-execution-v2.mjs','global-state/native-value-account-authority-v2.mjs',
 'api/flat-manual-graph-session.mjs','ops/native-device-local-operator-v1.mjs',
 'solvers/native-value-provider-v2.mjs','chain-adapters/generic-native-value-v2.mjs']
 .map(path=>['wallet-platform/modules/'+path,runtimeRoot+path]),
 ['mobile-core/native-value-owner-process-v2.mjs','.internal/runtime/omnichain-flat-profile/flat-wallet/mobile-core/native-value-owner-process-v2.mjs'],
 ...['native-recipient-process.mjs','native-recipient-custody.mjs','generic-balance-native-preparation.mjs','native-admission.mjs']
 .map(path=>['golden/src/paeg/'+path,'.internal/runtime/omnichain-product/src/paeg/'+path])]);
const selectedMobile=Object.freeze({profile:'ORIGINAL_BSC714_PRIVATE_NATIVE_MOBILE_V3',
 files:Object.freeze([...selected.files,...[{"path":"scripts/development/owned-bsc-private-native-mobile-v3.mjs","sha256":"728aee49a27f8b0e007da306a42a36d9c9b0fa6fa7cfcbef7860064e2ffd5c08"},{"path":"apps/platform/src/run-original-bsc-private-native-mobile-v3.mjs","sha256":"12127a2f187c40073a607d2af8eee27b81a5c735fa92b4a01bfade6ddcb1cc33"},{"path":"scripts/development/original-network-mobile-private-diagnostic-v1.mjs","sha256":"3d093a920d9d1f9818700391ee58a9485accb86bcae9cf11c91b854d9bf6690a"},{"path":"tests/integration/wallet/native/native-device-economic-private-error-v1.mjs","sha256":"5059190aa698d6bfcabcdb0511d23bb88e33006dcdf74413e8a7cfa7346aca84"}]]),runtimeFiles:mobileRuntimeFiles});
function repository(){let current=dirname(fileURLToPath(import.meta.url));while(current!==parse(current).root){
 if(existsSync(join(current,'scripts/layout.json'))&&existsSync(join(current,'package.json'))
 &&JSON.parse(readFileSync(join(current,'package.json'),'utf8')).name==='lianum')return realpathSync(current);current=dirname(current);}
 throw new Error('OWNED_BSC_SOURCE_ORIGINAL_REPOSITORY_REQUIRED');}
const root=repository();
function physical(path){assert(typeof path==='string'&&!path.startsWith('/')&&!path.split('/').some(x=>!x||x==='.'||x==='..'),'OWNED_BSC_SOURCE_FIXED_PATH');
 const full=join(root,path);assert(!relative(root,full).startsWith('..'+sep),'OWNED_BSC_SOURCE_FIXED_PATH');
 let part=root;for(const name of path.split('/').slice(0,-1)){part=join(part,name);const info=lstatSync(part);assert(info.isDirectory()&&!info.isSymbolicLink(),'OWNED_BSC_SOURCE_PHYSICAL_DIRECTORY');}
 assert.equal(realpathSync(full),full,'OWNED_BSC_SOURCE_PHYSICAL_PATH');const before=lstatSync(full);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()
 &&[0o600,0o644].includes(before.mode&0o777)&&before.size>0&&before.size<=32*1024*1024,'OWNED_BSC_SOURCE_PHYSICAL_FILE');
 const fd=openSync(full,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{for(const key of stats)assert.equal(fstatSync(fd)[key],before[key],'OWNED_BSC_SOURCE_PHYSICAL_CHANGED');
 bytes=Buffer.alloc(before.size+1);let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)break;offset+=count;}
 assert.equal(offset,before.size,'OWNED_BSC_SOURCE_PHYSICAL_CHANGED');
 for(const after of [fstatSync(fd),lstatSync(full)])for(const key of stats)assert.equal(after[key],before[key],'OWNED_BSC_SOURCE_PHYSICAL_CHANGED');
 return bytes.subarray(0,offset);
 }catch(error){bytes?.fill(0);throw error;}finally{closeSync(fd);}}
function fileHash(path){const bytes=physical(path);try{return sha(bytes);}finally{bytes.fill(0);}}
const modulePath='scripts/development/owned-bsc-original-source-profile-v3.mjs';
const loadedSourceSHA256=fileHash(modulePath);
function publication(){const bytes=physical(publicationPath);try{const text=bytes.toString('utf8');
 const match=/^\/\*\*[\s\S]*?\*\/\s*export const NATIVE_VALUE_DEV_RELEASE_V5 = Object\.freeze\(([\s\S]*)\);\s*$/.exec(text);
 assert(match,'OWNED_BSC_SOURCE_FIXED_PUBLICATION');const value=JSON.parse(match[1]);
 assert.equal(value?.schema,'LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5','OWNED_BSC_SOURCE_FIXED_PUBLICATION');
 assert.deepEqual(value,NATIVE_VALUE_DEV_RELEASE_V5,'OWNED_BSC_SOURCE_LOADED_PUBLICATION_CHANGED');
 assert(Array.isArray(value.sourceFiles)&&value.sourceFiles.length>0&&value.sourceFiles.length<=4096,'OWNED_BSC_SOURCE_PUBLICATION_MEMBERSHIP');
 const rows=new Map();for(const row of value.sourceFiles){assert(row&&Object.keys(row).sort().join(',')==='path,sha256'
 &&typeof row.path==='string'&&/^[a-f0-9]{64}$/.test(row.sha256)&&!rows.has(row.path),'OWNED_BSC_SOURCE_PUBLICATION_MEMBERSHIP');rows.set(row.path,row.sha256);}
 return {sha256:sha(bytes),rows};}finally{bytes.fill(0);}}
function capture(selected){assert.equal(fileHash(modulePath),loadedSourceSHA256,'OWNED_BSC_SOURCE_LOADED_MODULE_CHANGED');
 const published=publication(),own=selected.files.map(row=>{assert.equal(fileHash(row.path),row.sha256,'OWNED_BSC_SOURCE_REVIEWED_FILE_CHANGED');return {...row};});
 const runtime=[...runtimeFiles,...(selected.runtimeFiles??[])].map(([path,physicalPath])=>{const expected=published.rows.get(path);assert(expected,'OWNED_BSC_SOURCE_ORIGINAL_RUNTIME_MEMBER_REQUIRED');
 assert.equal(fileHash(physicalPath),expected,'OWNED_BSC_SOURCE_ORIGINAL_RUNTIME_CHANGED');return {path,physicalPath,sha256:expected};});
 assert.equal(publication().sha256,published.sha256,'OWNED_BSC_SOURCE_PUBLICATION_CHANGED');
 const value={schema:CAPSULE,profile:selected.profile,moduleSHA256:loadedSourceSHA256,publicationSHA256:published.sha256,ownFiles:own,runtimeFiles:runtime};
 return {value,sha256:sha(JSON.stringify(value))};}
function birth(selected){const initial=capture(selected),token=Object.freeze(Object.create(null));
 slots.set(token,{selected,value:initial.value,sha256:initial.sha256,closed:false,poisoned:false});
 assertOriginalOwnedBscSourceProfileV3(token);return token;}
export function createOriginalBscSourceProfileV3(){assert.equal(arguments.length,0,'OWNED_BSC_SOURCE_NO_OPTIONS');return birth(selected);}
/** Original mobile source born before native/custody CREATE or funds. */
export function createOriginalBscNativeMobileSourceV3(){assert.equal(arguments.length,0,'OWNED_BSC_SOURCE_NO_OPTIONS');return birth(selectedMobile);}
export function assertOriginalOwnedBscSourceProfileV3(token){assert.equal(arguments.length,1,'OWNED_BSC_SOURCE_TOKEN_ARITY');
 const state=slots.get(token);assert(state&&!state.closed&&!state.poisoned,'OWNED_BSC_SOURCE_ORIGINAL_TOKEN_REQUIRED');
 try{const next=capture(state.selected);assert.equal(next.sha256,state.sha256,'OWNED_BSC_SOURCE_GENERATION_CHANGED');assert.deepEqual(next.value,state.value,'OWNED_BSC_SOURCE_GENERATION_CHANGED');}
 catch(error){state.poisoned=true;throw error;}}
export function readOriginalOwnedBscSourceProfileV3(token){assert.equal(arguments.length,1,'OWNED_BSC_SOURCE_TOKEN_ARITY');assertOriginalOwnedBscSourceProfileV3(token);const state=slots.get(token);
 return Object.freeze({schema:CAPSULE,profile:state.value.profile,sourceSHA256:state.sha256,moduleSHA256:loadedSourceSHA256,
 publicationSHA256:state.value.publicationSHA256,reviewedOwnFiles:state.value.ownFiles.length,originalRuntimeFiles:state.value.runtimeFiles.length,
 compilerSourceRootsChanged:false,artifactAuthorityIssued:false,runtimeAuthorityIssued:false,publicNetwork:false,independentOperators:false,nativeFinalityAcceptanceEstablished:false});}
export function closeOriginalOwnedBscSourceProfileV3(token){assert.equal(arguments.length,1,'OWNED_BSC_SOURCE_TOKEN_ARITY');const state=slots.get(token);assert(state,'OWNED_BSC_SOURCE_ORIGINAL_TOKEN_REQUIRED');state.closed=true;
 return Object.freeze({closed:true,sourceSHA256:state.sha256,sourceIntegrityUncertain:state.poisoned});}
export function readOriginalOwnedBscSourceModuleV3(){assert.equal(arguments.length,0,'OWNED_BSC_SOURCE_NO_OPTIONS');assert.equal(fileHash(modulePath),loadedSourceSHA256,'OWNED_BSC_SOURCE_LOADED_MODULE_CHANGED');return loadedSourceSHA256;}

/** Metadata only; original tokens remain private and cannot be copied. */
export function inspectOriginalBscSourcesV3(){assert.equal(arguments.length,0,'OWNED_BSC_SOURCE_NO_OPTIONS');const value=capture(selected);return Object.freeze({profile:selected.profile,sourceSHA256:value.sha256,authorityIssued:false});}
