/** Fixed prepared public inputs. No caller path, compiler or release authority. */
import assert from 'node:assert/strict';
import {lstatSync,readlinkSync,realpathSync,readdirSync,openSync,readSync,fstatSync,closeSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,relative,sep,dirname} from 'node:path';
import {homedir} from 'node:os';
import {ROOT,FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
export const SPL_COMPILATION_PROJECT_V1=resolve(FLAT,'../../..');
export const SPL_COMPILATION_MATERIAL_V1=join(SPL_COMPILATION_PROJECT_V1,'.internal/dev/toolchains/native-spl-custody-v3');
export const SPL_COMPILATION_TOOLS_V1=join(SPL_COMPILATION_PROJECT_V1,'.internal/dev/toolchains/platform-tools-v1.48');
export const SPL_COMPILATION_COMMAND_V1=join(SPL_COMPILATION_PROJECT_V1,'.internal/runtime/omnichain-product/.local/linux-runtimes/agave-v2.3.13/solana-release/bin/cargo-build-sbf');
// Actual fixed v3 copy measured independently; v2 outputs and receipts remain intact.
const REVIEWED_V3_SOURCE_INVENTORY_SHA256='d46909e63cf696c7705f8c978b0cf70945dee69835f34d9201fde5cb45942751';
const REVIEWED_V3_CACHE_INVENTORY_SHA256='768b7b9b333eb14364f63c8c9b228a871679ece6e7fbe2d091baf10100dc1044';
const p=(path,pin)=>{const raw=regular(path);assert.equal(hash(raw),pin,'SPL_COMPILATION_PUBLIC_INPUT_CHANGED');return raw;};
const within=(root,path)=>{assert.ok(path.startsWith(root+sep)&&resolve(path)===path,'SPL_COMPILATION_FIXED_PATH');return path;};
function walkFiles(root){return readdirSync(root,{withFileTypes:true}).flatMap(row=>row.isDirectory()?walkFiles(join(root,row.name)):[join(root,row.name)]).sort();}
export function nativeSplCompilationMaterialV1(){
 assert.equal(arguments.length,0,'SPL_COMPILATION_NO_MATERIAL_OPTIONS');assert.ok(REVIEWED_V3_SOURCE_INVENTORY_SHA256&&REVIEWED_V3_CACHE_INVENTORY_SHA256,'SPL_COMPILATION_V3_PUBLIC_COPY_REVIEW_REQUIRED');const records=new Map();
 const record=path=>{const raw=regular(path);records.set(path,{path:relative(FLAT,path).split(sep).join('/'),bytes:raw.length,sha256:hash(raw)});return raw;};
 const archive=join(SPL_COMPILATION_TOOLS_V1,'platform-tools-linux-x86_64.tar.bz2');assert.equal(realpathSync(archive),archive);assert.equal(lstatSync(archive).isFile(),true);
 const archiveFD=openSync(archive,'r'),archiveHash=createHash('sha256'),chunk=Buffer.alloc(1024**2);let archiveBytes=0;
 try{const before=fstatSync(archiveFD);for(;;){const n=readSync(archiveFD,chunk,0,chunk.length,null);if(n===0)break;archiveHash.update(chunk.subarray(0,n));archiveBytes+=n;}
  const after=fstatSync(archiveFD);for(const key of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key],'SPL_COMPILATION_ARCHIVE_CHANGED');assert.equal(archiveBytes,after.size);
 }finally{closeSync(archiveFD);}
 const archiveSHA=archiveHash.digest('hex');assert.equal(archiveSHA,'a9d3157f937d5f6faf4321a35a8035e0f827114a663b0150db492e893ec27597');
 records.set(archive,{path:relative(FLAT,archive).split(sep).join('/'),bytes:archiveBytes,sha256:archiveSHA});
 const toolPath=join(SPL_COMPILATION_TOOLS_V1,'toolchain-manifest.json');
 const tools=JSON.parse(p(toolPath,'aac02dbb824452660ceff69005c699470dad15e20fd4a114f0bc084c5d40e1c1'));record(toolPath);
 const distribution=join(SPL_COMPILATION_TOOLS_V1,'distribution'),expected=[];
 for(const row of tools.files){const path=within(distribution,join(distribution,row.path)),info=lstatSync(path);expected.push(path);
  assert.equal(info.mode&0o777,Number(row.mode),'SPL_COMPILATION_TOOL_MODE');
  if(row.type==='symlink'){assert.equal(info.isSymbolicLink(),true);assert.equal(readlinkSync(path),row.target);within(distribution,resolve(dirname(path),row.target));}
  else{assert.equal(row.type,'file');assert.equal(info.isFile(),true);const raw=record(path);assert.equal(raw.length,row.bytes);assert.equal(hash(raw),row.sha256);}
 }
 assert.deepEqual(walkFiles(distribution),expected.sort(),'SPL_COMPILATION_COMPLETE_TOOLCHAIN');
 const dependenciesPath=join(SPL_COMPILATION_TOOLS_V1,'sdk-prepared-dependencies.json');
 const deps=JSON.parse(p(dependenciesPath,'f9f36b4a787e6be1edd9f91c0a62e86795930efaf6c173813248f58370fc78d3'));record(dependenciesPath);
 const criterion=join(SPL_COMPILATION_TOOLS_V1,'criterion-v2.3.3/criterion-v2.3.3');assert.equal(deps.criterionRoot,criterion);assert.equal(deps.files.length,32);
 p(join(SPL_COMPILATION_TOOLS_V1,'criterion-v2.3.3-linux-x86_64.tar.bz2'),'ee7f92d7268563848aa3ae90bbf5df86604b8d0fb0e4942b0ecfbf6201596550');record(join(SPL_COMPILATION_TOOLS_V1,'criterion-v2.3.3-linux-x86_64.tar.bz2'));
 const criterionPaths=[];for(const row of deps.files){const path=within(criterion,join(criterion,row.path));criterionPaths.push(path);assert.equal(lstatSync(path).mode&0o777,row.mode);
  if(row.type==='symlink'){assert.equal(readlinkSync(path),row.target);within(criterion,realpathSync(path));}
  else{const raw=record(path);assert.equal(raw.length,row.bytes);assert.equal(hash(raw),row.sha256);}}
 assert.deepEqual(walkFiles(criterion),criterionPaths.sort(),'SPL_COMPILATION_COMPLETE_CRITERION');
 const sdk=join(SPL_COMPILATION_TOOLS_V1,'sbf-sdk');assert.equal(realpathSync(join(sdk,'dependencies/criterion')),criterion);
 for(const name of ['criterion-v2.3.3.md','platform-tools-v1.48.md'])assert.equal(record(join(sdk,'dependencies',name)).length,0,'SPL_COMPILATION_ORIGINAL_INSTALL_MARKER');
 const cargoHome=join(SPL_COMPILATION_MATERIAL_V1,'cargo-home'),cargoPath=join(SPL_COMPILATION_MATERIAL_V1,'cargo-source-inventory-v3.json');
 const cargo=JSON.parse(p(cargoPath,REVIEWED_V3_SOURCE_INVENTORY_SHA256));record(cargoPath);
 assert.equal(cargo.format,'LIANUM_NEW_SPL_CARGO_SOURCE_INVENTORY_V3');assert.equal(cargo.archiveCount,183);assert.equal(cargo.files.length,6652);
 for(const row of cargo.files){within(join(cargoHome,'registry/src'),row.path);assert.equal(realpathSync(row.path),row.path);const raw=record(row.path);assert.equal(raw.length,row.bytes);assert.equal(hash(raw),row.sha256);assert.equal(lstatSync(row.path).mode&0o777,row.mode);}
 assert.deepEqual(walkFiles(join(cargoHome,'registry/src')),cargo.files.map(row=>row.path).sort(),'SPL_COMPILATION_COMPLETE_CRATE_SOURCES');
 // A new task Cargo home contains exactly the locked package archives and
 // their copied sparse-index entries. The mixed historical cache is retained.
 const cachePath=join(SPL_COMPILATION_MATERIAL_V1,'cargo-cache-inventory-v3.json');
 const cache=JSON.parse(p(cachePath,REVIEWED_V3_CACHE_INVENTORY_SHA256));record(cachePath);
 assert.equal(cache.format,'LIANUM_NEW_SPL_CARGO_CACHE_INVENTORY_V3');assert.equal(cache.cargoHome,cargoHome);
 assert.equal(cache.sourceInventoryRawSHA256,hash(regular(cargoPath)));assert.equal(cache.archives.length,183);assert.equal(cache.index.length,169);
 for(const [kind,rows]of [['cache',cache.archives],['index',cache.index]]){
  const root=join(cargoHome,'registry',kind);for(const row of rows){within(root,row.path);assert.equal(realpathSync(row.path),row.path);
   const raw=record(row.path);assert.equal(raw.length,row.bytes);assert.equal(hash(raw),row.sha256);assert.equal(lstatSync(row.path).mode&0o777,row.mode);}
  assert.deepEqual(walkFiles(root),rows.map(row=>row.path).sort(),'SPL_COMPILATION_COMPLETE_CRATE_'+kind.toUpperCase());
 }

 const source=join(SPL_COMPILATION_MATERIAL_V1,'source');
 for(const [name,pin] of [['Cargo.toml','747b133654ceec001193e15eb144989ff326ede3e3371a8850358e51ee72bfa6'],['src/lib.rs','c68547203aba2f8fb013efe51a17aebb18b01cf0e2bd2a881672781c3db0ed2c'],['Cargo.lock','d2b0d2a4c29e53c192cd9f7e25ed56e7eaac24e849d380de96c8462d449fd85b']]){p(join(source,name),pin);record(join(source,name));
  if(name!=='Cargo.lock'){const canonical=join(SPL_COMPILATION_PROJECT_V1,'contracts/wallet/solana/native-spl-custody-v1',name);assert.ok(record(canonical).equals(regular(join(source,name))),'SPL_COMPILATION_NEW_SOURCE_COPY');}}
 p(SPL_COMPILATION_COMMAND_V1,'3d0b244026df58e01709a2abacab6ce082d757065a3930bb5b4f094a719b7af0');record(SPL_COMPILATION_COMMAND_V1);
 const rustup=join(homedir(),'.cargo/bin/rustup');p(realpathSync(rustup),'20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c');record(realpathSync(rustup));
 // Agave's --version preparation probes this original HOME cache path even
 // with --skip-tools-install. It is absent in this fixed prepared profile;
 // neither an unreviewed global rustc nor a global installation is permitted.
 const globalCompiler=join(homedir(),'.cache/solana/v1.48/platform-tools/rust/bin/rustc');assert.equal(existsSync(globalCompiler),false,'SPL_COMPILATION_GLOBAL_TOOLCHAIN_PRESENT');
 for(const path of ['/usr/bin/bash','/usr/bin/env','/usr/bin/dirname','/usr/bin/mkdir','/usr/bin/uname','/usr/bin/cc','/usr/bin/ld','/usr/libexec/gcc/x86_64-linux-gnu/13/collect2'])record(realpathSync(path));
 const originalSdk=join(dirname(SPL_COMPILATION_COMMAND_V1),'platform-tools-sdk/sbf');
 for(const original of walkFiles(originalSdk)){const rel=relative(originalSdk,original);if(rel.startsWith('dependencies'+sep))continue;
  const path=within(sdk,join(sdk,rel));assert.equal(realpathSync(original),original);assert.equal(realpathSync(path),path);
  assert.ok(record(original).equals(record(path)),'SPL_COMPILATION_ORIGINAL_SDK_COPY');assert.equal(lstatSync(original).mode&0o777,lstatSync(path).mode&0o777);
 }
 assert.equal(realpathSync(join(sdk,'dependencies/platform-tools')),distribution,'SPL_COMPILATION_PRIVATE_SDK_BINDING');
 assert.equal(realpathSync(join(SPL_COMPILATION_TOOLS_V1,'rustup-home/toolchains/solana')),join(distribution,'rust'),'SPL_COMPILATION_PRIVATE_RUSTUP_BINDING');
 const argv=[SPL_COMPILATION_COMMAND_V1,'--manifest-path',join(source,'Cargo.toml'),'--sbf-sdk',sdk,'--sbf-out-dir',join(SPL_COMPILATION_MATERIAL_V1,'out'),'--skip-tools-install','--tools-version','v1.48','--jobs','1','--offline','--','--locked'];
 // Preserve the original user's HOME. All writable Cargo/Rustup/target paths
 // remain explicit task paths; prepared SDK markers keep install.sh read-only.
 const env={HOME:homedir(),PATH:dirname(rustup)+':/usr/bin:/bin',RUSTUP_HOME:join(SPL_COMPILATION_TOOLS_V1,'rustup-home'),CARGO_HOME:cargoHome,RUSTUP_TOOLCHAIN:'solana',CARGO_TARGET_DIR:join(SPL_COMPILATION_MATERIAL_V1,'target'),CARGO_BUILD_JOBS:'1',CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS:'fallback',LC_ALL:'C.UTF-8',CARGO_NET_OFFLINE:'true'};
 const recipePath=join(SPL_COMPILATION_MATERIAL_V1,'sbf-compilation-recipe-v4.json');
 const recipe=JSON.parse(p(recipePath,'5bf56f1111fa319abfa4c10ab3e3a26396546fb245e814481d1609f49c89a312'));record(recipePath);
 assert.equal(recipe.format,'LIANUM_NEW_SPL_SBF_COMPILATION_RECIPE_V4');
 assert.deepEqual(recipe.argv,argv,'SPL_COMPILATION_RECIPE_ARGV');
 assert.deepEqual(recipe.environment,env,'SPL_COMPILATION_RECIPE_ENV');
 assert.equal(recipe.workingDirectory,source,'SPL_COMPILATION_RECIPE_CWD');
 assert.equal(recipe.expectedOutput,'lianum_native_spl_custody_v1.so');
 assert.equal(recipe.generatedDeployKeyMustBeRemoved,true);
 const actualRow=path=>{const raw=regular(path);return {path,bytes:raw.length,sha256:hash(raw)};};
 assert.deepEqual(recipe.sourcePins,['Cargo.toml','src/lib.rs','Cargo.lock'].map(name=>actualRow(join(source,name))),'SPL_COMPILATION_RECIPE_SOURCE_JOIN');
 assert.deepEqual(recipe.publicMaterial,[toolPath,dependenciesPath,cargoPath,cachePath].map(actualRow),'SPL_COMPILATION_RECIPE_MATERIAL_JOIN');
 assert.deepEqual(recipe.originalAgaveSbfCommand,actualRow(SPL_COMPILATION_COMMAND_V1),'SPL_COMPILATION_RECIPE_COMMAND_JOIN');
 assert.deepEqual(recipe.rustupOriginal,{path:rustup,sha256:hash(regular(realpathSync(rustup)))},'SPL_COMPILATION_RECIPE_RUSTUP_JOIN');
 assert.equal(recipe.toolchainArchiveSHA256,archiveSHA,'SPL_COMPILATION_RECIPE_TOOLCHAIN_JOIN');
 assert.equal(recipe.crateArchiveCount,cargo.archiveCount);assert.equal(recipe.packageCount,184);
 return {argv,env,cwd:source,records:[...records.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
