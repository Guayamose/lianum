/** Fixed same-generation source profile for original Base/Nitro native clients.
 * Born before custody, native CREATE or genesis funding. This is source integrity
 * only: no runtime/artifact/key/proof/spend authority is issued from metadata.
 * The existing compiler/release roots and publication remain untouched. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readSync,closeSync,readFileSync,realpathSync} from 'node:fs';
import {dirname,join,parse,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NATIVE_VALUE_DEV_RELEASE_V5} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/ops/native-value-dev-release-v5.mjs';
const CAPSULE='OWNED_ORIGINAL_ROLLUP_SOURCE_PROFILE_V1';
const profiles=Object.freeze({"Base":{"profile":"OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1","files":[{"path":"scripts/development/owned-base-rollup-v1.mjs","sha256":"e2b1f832224e9c5a2526656d133e95b2498539b53f6eb11961dff00ee0e53ce7"},{"path":"scripts/development/owned_base_rollup_v1.py","sha256":"ef02373e988a83204581a818fe245ebf5dea9230514847af1ecc42a42e2c0c49"},{"path":"scripts/development/owned-base-native-value-dispatch-v1.mjs","sha256":"a344fb661cd31045c4f481e5117671c2ada3fe0498d5d38119fcd2825e8b1f80"}]},"Arbitrum":{"profile":"OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1","files":[{"path":"scripts/development/owned-arbitrum-nitro-v1.mjs","sha256":"f49ae27bfd75e0cbccc2f06bc0eb3ff30314195550a2da77b62b2ef3693b39bf"},{"path":"scripts/development/owned_arbitrum_nitro_v1.py","sha256":"3b8cc7a0117bb36f9c287b86b4ea2e0519d56dcbe9d5574dd657866ddaf7ea75"},{"path":"scripts/development/owned-arbitrum-native-value-dispatch-v1.mjs","sha256":"ad75dd12a46496e90859886b42aada2d2203698dce70fb252b6477a3e63ba10b"}]}});
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
const mobileArbitrum=Object.freeze({profile:'ORIGINAL_ARBITRUM42161_PRIVATE_NATIVE_MOBILE_V1',files:Object.freeze([...profiles.Arbitrum.files,...[{"path":"scripts/development/owned-arbitrum-private-native-mobile-v1.mjs","sha256":"278f6a3cad03d5882a9a889adc1165bc0bc804599a3dc3ae756876f68142d65b"},{"path":"apps/platform/src/run-original-arbitrum-private-native-mobile-v1.mjs","sha256":"afd43be4514dba642ad2ea9271293ee1b38ff574fd67f285bc072f06a8a47fde"}]]),runtimeFiles:mobileRuntimeFiles});
const mobileBase=Object.freeze({profile:'ORIGINAL_BASE8453_PRIVATE_NATIVE_MOBILE_V1',files:Object.freeze([...profiles.Base.files,...[{"path":"scripts/development/owned-base-private-native-mobile-v1.mjs","sha256":"90b74cd9a332fde4e0d805283a40ecd2f9a54625c7b33554d3976af94fc6fec3"},{"path":"apps/platform/src/run-original-base-private-native-mobile-v1.mjs","sha256":"64ad435361e8c8e15d8d2915fb1d8a618046eab7b718ae167a8e2986ae06f42f"}]]),runtimeFiles:mobileRuntimeFiles});
function repository(){let current=dirname(fileURLToPath(import.meta.url));while(current!==parse(current).root){
 if(existsSync(join(current,'scripts/layout.json'))&&existsSync(join(current,'package.json'))
 &&JSON.parse(readFileSync(join(current,'package.json'),'utf8')).name==='lianum')return realpathSync(current);current=dirname(current);}
 throw new Error('OWNED_ROLLUP_SOURCE_ORIGINAL_REPOSITORY_REQUIRED');}
const root=repository();
function physical(path){assert(typeof path==='string'&&!path.startsWith('/')&&!path.split('/').some(x=>!x||x==='.'||x==='..'),'OWNED_ROLLUP_SOURCE_FIXED_PATH');
 const full=join(root,path);assert(!relative(root,full).startsWith('..'+sep),'OWNED_ROLLUP_SOURCE_FIXED_PATH');
 let part=root;for(const name of path.split('/').slice(0,-1)){part=join(part,name);const info=lstatSync(part);assert(info.isDirectory()&&!info.isSymbolicLink(),'OWNED_ROLLUP_SOURCE_PHYSICAL_DIRECTORY');}
 assert.equal(realpathSync(full),full,'OWNED_ROLLUP_SOURCE_PHYSICAL_PATH');const before=lstatSync(full);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid()
 &&[0o600,0o644].includes(before.mode&0o777)&&before.size>0&&before.size<=32*1024*1024,'OWNED_ROLLUP_SOURCE_PHYSICAL_FILE');
 const fd=openSync(full,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{for(const key of stats)assert.equal(fstatSync(fd)[key],before[key],'OWNED_ROLLUP_SOURCE_PHYSICAL_CHANGED');
 bytes=Buffer.alloc(before.size+1);let offset=0;while(offset<bytes.length){const count=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)break;offset+=count;}
 assert.equal(offset,before.size,'OWNED_ROLLUP_SOURCE_PHYSICAL_CHANGED');
 for(const after of [fstatSync(fd),lstatSync(full)])for(const key of stats)assert.equal(after[key],before[key],'OWNED_ROLLUP_SOURCE_PHYSICAL_CHANGED');
 return bytes.subarray(0,offset);
 }catch(error){bytes?.fill(0);throw error;}finally{closeSync(fd);}}
function fileHash(path){const bytes=physical(path);try{return sha(bytes);}finally{bytes.fill(0);}}
const modulePath='scripts/development/owned-rollup-original-source-profile-v1.mjs';
const loadedSourceSHA256=fileHash(modulePath);
function publication(){const bytes=physical(publicationPath);try{const text=bytes.toString('utf8');
 const match=/^\/\*\*[\s\S]*?\*\/\s*export const NATIVE_VALUE_DEV_RELEASE_V5 = Object\.freeze\(([\s\S]*)\);\s*$/.exec(text);
 assert(match,'OWNED_ROLLUP_SOURCE_FIXED_PUBLICATION');const value=JSON.parse(match[1]);
 assert.equal(value?.schema,'LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5','OWNED_ROLLUP_SOURCE_FIXED_PUBLICATION');
 assert.deepEqual(value,NATIVE_VALUE_DEV_RELEASE_V5,'OWNED_ROLLUP_SOURCE_LOADED_PUBLICATION_CHANGED');
 assert(Array.isArray(value.sourceFiles)&&value.sourceFiles.length>0&&value.sourceFiles.length<=4096,'OWNED_ROLLUP_SOURCE_PUBLICATION_MEMBERSHIP');
 const rows=new Map();for(const row of value.sourceFiles){assert(row&&Object.keys(row).sort().join(',')==='path,sha256'
 &&typeof row.path==='string'&&/^[a-f0-9]{64}$/.test(row.sha256)&&!rows.has(row.path),'OWNED_ROLLUP_SOURCE_PUBLICATION_MEMBERSHIP');rows.set(row.path,row.sha256);}
 return {sha256:sha(bytes),rows};}finally{bytes.fill(0);}}
function capture(selected){assert.equal(fileHash(modulePath),loadedSourceSHA256,'OWNED_ROLLUP_SOURCE_LOADED_MODULE_CHANGED');
 const published=publication(),own=selected.files.map(row=>{assert.equal(fileHash(row.path),row.sha256,'OWNED_ROLLUP_SOURCE_REVIEWED_FILE_CHANGED');return {...row};});
 const runtime=[...runtimeFiles,...(selected.runtimeFiles??[])].map(([path,physicalPath])=>{const expected=published.rows.get(path);assert(expected,'OWNED_ROLLUP_SOURCE_ORIGINAL_RUNTIME_MEMBER_REQUIRED');
 assert.equal(fileHash(physicalPath),expected,'OWNED_ROLLUP_SOURCE_ORIGINAL_RUNTIME_CHANGED');return {path,physicalPath,sha256:expected};});
 assert.equal(publication().sha256,published.sha256,'OWNED_ROLLUP_SOURCE_PUBLICATION_CHANGED');
 const value={schema:CAPSULE,profile:selected.profile,moduleSHA256:loadedSourceSHA256,publicationSHA256:published.sha256,ownFiles:own,runtimeFiles:runtime};
 return {value,sha256:sha(JSON.stringify(value))};}
function birth(selected){const initial=capture(selected),token=Object.freeze(Object.create(null));
 slots.set(token,{selected,value:initial.value,sha256:initial.sha256,closed:false,poisoned:false});
 assertOriginalOwnedRollupSourceProfileV1(token);return token;}
export function createOriginalBaseRollupSourceProfileV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');return birth(profiles.Base);}
/** Separate fixed Base mobile composition, before custody/native CREATE. */
export function createOriginalBaseNativeMobileSourceV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');return birth(mobileBase);}
export function createOriginalArbitrumRollupSourceProfileV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');return birth(profiles.Arbitrum);}
/** Separate fixed mobile composition, before custody/native CREATE. */
export function createOriginalArbitrumNativeMobileSourceV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');return birth(mobileArbitrum);}
export function assertOriginalOwnedRollupSourceProfileV1(token){assert.equal(arguments.length,1,'OWNED_ROLLUP_SOURCE_TOKEN_ARITY');
 const state=slots.get(token);assert(state&&!state.closed&&!state.poisoned,'OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED');
 try{const next=capture(state.selected);assert.equal(next.sha256,state.sha256,'OWNED_ROLLUP_SOURCE_GENERATION_CHANGED');assert.deepEqual(next.value,state.value,'OWNED_ROLLUP_SOURCE_GENERATION_CHANGED');}
 catch(error){state.poisoned=true;throw error;}}
export function readOriginalOwnedRollupSourceProfileV1(token){assert.equal(arguments.length,1,'OWNED_ROLLUP_SOURCE_TOKEN_ARITY');assertOriginalOwnedRollupSourceProfileV1(token);const state=slots.get(token);
 return Object.freeze({schema:CAPSULE,profile:state.value.profile,sourceSHA256:state.sha256,moduleSHA256:loadedSourceSHA256,
 publicationSHA256:state.value.publicationSHA256,reviewedOwnFiles:state.value.ownFiles.length,originalRuntimeFiles:state.value.runtimeFiles.length,
 compilerSourceRootsChanged:false,artifactAuthorityIssued:false,runtimeAuthorityIssued:false,publicNetwork:false,independentOperators:false,rollupChallengeFinalityEstablished:false});}
export function closeOriginalOwnedRollupSourceProfileV1(token){assert.equal(arguments.length,1,'OWNED_ROLLUP_SOURCE_TOKEN_ARITY');const state=slots.get(token);assert(state,'OWNED_ROLLUP_SOURCE_ORIGINAL_TOKEN_REQUIRED');state.closed=true;
 return Object.freeze({closed:true,sourceSHA256:state.sha256,sourceIntegrityUncertain:state.poisoned});}
export function readOriginalOwnedRollupSourceModuleV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');assert.equal(fileHash(modulePath),loadedSourceSHA256,'OWNED_ROLLUP_SOURCE_LOADED_MODULE_CHANGED');return loadedSourceSHA256;}

/** Fixed read-only pre-import inspection. These records cannot satisfy token/client guards. */
export function inspectOriginalBaseRollupSourcesV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');const value=capture(profiles.Base);return Object.freeze({profile:profiles.Base.profile,sourceSHA256:value.sha256,authorityIssued:false});}
export function inspectOriginalArbitrumRollupSourcesV1(){assert.equal(arguments.length,0,'OWNED_ROLLUP_SOURCE_NO_OPTIONS');const value=capture(profiles.Arbitrum);return Object.freeze({profile:profiles.Arbitrum.profile,sourceSHA256:value.sha256,authorityIssued:false});}
