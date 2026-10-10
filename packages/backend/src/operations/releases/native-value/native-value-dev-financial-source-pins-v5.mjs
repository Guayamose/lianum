/** Current financial consumers, separately from the unchanged compiler
 * closure recorded by the original W39 build. Fixed roots; no caller paths. */
import assert from 'node:assert/strict';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { lstatSync, realpathSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, CANDIDATE } from '../../../../../proofs/src/catalog.mjs';
import { nativeValueDevHostSourcePinsV5 } from './native-value-dev-source-pins-v5.mjs';
const DEVELOPMENT=resolve(FLAT,'../../..');
const roots=Object.freeze([['development-tooling/',join(DEVELOPMENT,'scripts/development')],['development-config/',join(DEVELOPMENT,'scripts')],
 ['golden/',GOLDEN],['candidate/',CANDIDATE],['mobile-protocol/',resolve(FLAT,'../mobile-protocol')],
 ['mobile-app/',join(DEVELOPMENT,'apps/mobile')],['mobile-protocol-workspace/',join(DEVELOPMENT,'packages/mobile-protocol')],
 ['flat/',FLAT],['workspace-module/',DEVELOPMENT],['development-root/',DEVELOPMENT]]);
// Manual SQL product callers have physical pins in native-device-local-operator
// and the platform SQL source caps; they are not financial-worker imports.
const FIXED=Object.freeze(['integration/run-device-uniswap-v3-private-note-v1.mjs','workspace-module/apps/platform/src/original-device-cloud-local-gateway-v1.mjs','workspace-module/apps/platform/src/run-original-device-cloud-local-v1.mjs','mobile-app/src/screens/NativeClaimScreen.tsx','mobile-app/src/custody/native-claim-pending-v1.mjs','mobile-app/src/custody/native-claim-pending-v1.d.mts','mobile-app/src/custody/native-claim-pending-store-v1.ts','integration/run-device-aave-static-private-position-v1.mjs','integration/run-native-value-private-worker-durable-note-recovery-v3.mjs','integration/run-native-value-private-authorized-durable-note-recovery-v2.mjs','integration/run-native-value-private-durable-note-recovery-v2.mjs','integration/run-device-external-flat-source-graph-v1.mjs','integration/run-native-original-source-abrupt-v1.mjs','wallet-platform/modules/ops/native-original-source-local-operator-v1.mjs','workspace-module/apps/platform/src/run-original-native-source-v1.mjs','integration/run-device-owner-original-f-reorg-v1.mjs','golden/src/paeg/note-deposit-native-worker-v1.mjs','golden/src/paeg/note-withdraw-native-worker-v1.mjs',
 'integration/run-native-value-economic-note-recovery-v1.mjs',
 'integration/run-native-value-live-armed-short-restart-v1.mjs','integration/native-value-live-armed-short-restart-flow-v1.mjs','integration/native-device-live-armed-short-successor-v1.mjs',
 'integration/run-evm-metamorpho-recovery-flow-v1.mjs',
 'integration/run-evm-metamorpho-exit-recovery-v1.mjs',
 'integration/run-evm-aave-exit-recovery-v1.mjs',
 'integration/external-defi-vault-exit-successor-v1.mjs',
 'integration/native-value-economic-note-recovery-flow-v1.mjs','integration/native-device-economic-note-successor-worker-v1.mjs',
 'integration/native-device-economic-note-process-scope-v1.mjs',
 'proof-workers/native-value-dev-live-v5-artifacts.mjs',
 'proof-workers/native-value-dev-live-v5-client.mjs','proof-workers/native-value-dev-live-v5-role-process.mjs',
 'proof-workers/native-value-dev-live-v5-worker.mjs','proof-workers/native-value-dev-live-v5-run-bounded.mjs',
 'proof-workers/native-value-dev-live-v5-tooling.mjs','wallet-platform/modules/ops/native-value-dev-financial-source-pins-v5.mjs',
 'integration/run-native-wallet-tron-dev-v5.mjs','integration/native-wallet-tron-dev-v5.mjs',
 'integration/native-wallet-tron-dev-policy-v5.mjs','integration/native-wallet-tron-dev-source-pins-v5.mjs',
 'wallet-platform/modules/ops/native-device-local-operator-v1.mjs','wallet-platform/modules/ops/native-device-local-provider-v1.mjs',
 'wallet-platform/modules/ops/native-device-local-restart-v1.mjs',
 'wallet-platform/modules/operations/local/device-external-flat-local-operator-v1.mjs',
 'wallet-platform/modules/operations/local/device-external-flat-ordered-local-operator-v1.mjs']);
const excluded=join(ROOT,'wallet-platform/modules/ops/native-value-dev-release-v5.mjs');
// The local Cloud CLI imports pg's CommonJS entry. Capture its whole installed
// public dependency closure, including optional pg-cloudflare, rather than
// treating a bare import as a local file or omitting runtime require() bytes.
const PLATFORM_PG_PACKAGES=Object.freeze({pg:'8.23.1','pg-cloudflare':'1.4.1',
 'pg-connection-string':'2.14.1','pg-int8':'1.0.1','pg-pool':'3.14.0',
 'pg-protocol':'1.16.1','pg-types':'2.2.0',pgpass:'1.0.5',
 'postgres-array':'2.0.0','postgres-bytea':'1.0.1','postgres-date':'1.0.7',
 'postgres-interval':'1.2.0',split2:'4.2.0',xtend:'4.0.2'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function pathFor(name){
 assert.ok(typeof name==='string'&&name&&!name.startsWith('/')&&!name.split('/').some(v=>!v||v==='.'||v==='..'),'NV5_FINANCIAL_FIXED_PATH');
 const selected=roots.find(([prefix])=>name.startsWith(prefix));return join(selected?.[1]??ROOT,selected?name.slice(selected[0].length):name);
}
function label(path){
 if(path.startsWith(ROOT+sep))return relative(ROOT,path).split(sep).join('/');
 const selected=roots.find(([,root])=>path.startsWith(root+sep));assert.ok(selected,'NV5_FINANCIAL_LOCAL_SOURCE');
 const name=selected[0]+relative(selected[1],path).split(sep).join('/');
 return name;
}
function bytes(path){
 const name=label(path),selected=roots.find(([prefix])=>name.startsWith(prefix));let current=selected?.[1]??ROOT;
 assert.equal(realpathSync(current),current,'NV5_FINANCIAL_ROOT_ALIAS');
 for(const part of (selected?name.slice(selected[0].length):name).split('/')){current=join(current,part);assert.equal(lstatSync(current).isSymbolicLink(),false,'NV5_FINANCIAL_SOURCE_ALIAS');}
 const stat=lstatSync(current);assert.ok(stat.isFile()&&stat.size<=128*1024*1024,'NV5_FINANCIAL_SOURCE_FILE');
 const value=readFileSync(current);assert.equal(value.length,stat.size,'NV5_FINANCIAL_SOURCE_CHANGED');return value;
}
export function nativeValueDevFinancialSourcePinsV5(){
 assert.equal(arguments.length,0,'NV5_FINANCIAL_NO_OPTIONS');const original=nativeValueDevHostSourcePinsV5(),files=new Map(),visited=new Set();
 for(const row of original){const path=pathFor(row.path);assert.equal(sha(bytes(path)),row.sha256);assert.equal(files.has(path),false,'NV5_FINANCIAL_SOURCE_ALIAS');files.set(path,row);}
 let pgCaptured=false;
 function capturePlatformPg(){
  if(pgCaptured)return;pgCaptured=true;
  const platform=join(DEVELOPMENT,'apps/platform'),lockPath=join(platform,'package-lock.json'),
    manifestPath=join(platform,'package.json'),lock=JSON.parse(bytes(lockPath)),manifest=JSON.parse(bytes(manifestPath));
  assert.equal(lock.lockfileVersion,3,'NV5_FINANCIAL_PG_LOCK_VERSION');
  assert.deepEqual(manifest.dependencies,{pg:PLATFORM_PG_PACKAGES.pg},'NV5_FINANCIAL_PG_DIRECT_DEPENDENCY');
  assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies,'NV5_FINANCIAL_PG_LOCK_DIRECT');
  assert.deepEqual(Object.keys(lock.packages).filter(name=>name!=='').sort(),
    Object.keys(PLATFORM_PG_PACKAGES).map(name=>'node_modules/'+name).sort(),'NV5_FINANCIAL_PG_LOCK_CLOSURE');
  for(const path of [manifestPath,lockPath])files.set(path,{path:label(path),sha256:sha(bytes(path))});
  const captureDirectory=directory=>{
   assert.equal(realpathSync(directory),directory,'NV5_FINANCIAL_PG_DIRECTORY_ALIAS');
   for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const path=join(directory,entry.name);assert.equal(entry.isSymbolicLink(),false,'NV5_FINANCIAL_PG_SOURCE_ALIAS');
    if(entry.isDirectory())captureDirectory(path);
    else{assert.ok(entry.isFile(),'NV5_FINANCIAL_PG_SOURCE_FILE');files.set(path,{path:label(path),sha256:sha(bytes(path))});}
   }
  };
  for(const [name,version]of Object.entries(PLATFORM_PG_PACKAGES)){
   assert.equal(lock.packages['node_modules/'+name].version,version,'NV5_FINANCIAL_PG_LOCK_PACKAGE');
   const directory=join(platform,'node_modules',name),installed=JSON.parse(bytes(join(directory,'package.json')));
   assert.equal(installed.name,name,'NV5_FINANCIAL_PG_INSTALLED_NAME');
   assert.equal(installed.version,version,'NV5_FINANCIAL_PG_INSTALLED_VERSION');captureDirectory(directory);
  }
 }
 function visit(path){
  if(path===excluded||visited.has(path))return;visited.add(path);const value=bytes(path),name=label(path),prior=files.get(path);
  if(prior)assert.equal(prior.sha256,sha(value),'NV5_FINANCIAL_BASE_SOURCE_CHANGED');else files.set(path,{path:name,sha256:sha(value)});
  if(!path.endsWith('.mjs'))return;const source=value.toString('utf8'),imports=new Set();
  for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g))imports.add(match[2]);
  for(const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm))imports.add(match[2]);
  for(const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g))imports.add(match[2]);
  for(const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g))imports.add(match[2]);
  for(const name of imports){
   if(name.startsWith('node:')||['@aztec/bb.js','@noir-lang/noir_js','@noir-lang/noir_wasm'].includes(name))continue;
   if(name==='pg'){
    assert.equal(path,join(DEVELOPMENT,'apps/platform/src/database-pool.mjs'),'NV5_FINANCIAL_PG_ORIGINAL_IMPORT');
    capturePlatformPg();continue;
   }
   // The unchanged full walker already pins public package manifests and bytes.
   if(name==='@lianum/mobile-protocol'){visit(join(DEVELOPMENT,'packages/mobile-protocol/src/authorization.mjs'));continue;}
   if(name==='@lianum/mobile-protocol/original-account-v2'){visit(join(DEVELOPMENT,'packages/mobile-protocol/src/original-account-review-v2.mjs'));continue;}
   if(name.startsWith('@noble/')){const path=join(DEVELOPMENT,'apps/mobile/node_modules',name);assert.ok(files.has(path),'NV5_FINANCIAL_PINNED_PUBLIC_IMPORT');visit(path);continue;}
   assert.ok(name.startsWith('.'),'NV5_FINANCIAL_STATIC_LOCAL_IMPORT');visit(resolve(dirname(path),name));
  }
 }
 for(const name of FIXED)visit(pathFor(name));
 assert.deepEqual(nativeValueDevHostSourcePinsV5(),original,'NV5_FINANCIAL_BASE_CHANGED');
 for(const [path,row]of files)assert.equal(sha(bytes(path)),row.sha256,'NV5_FINANCIAL_CAPTURE_CHANGED');
 const result=[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 assert.equal(new Set(result.map(row=>row.path)).size,result.length,'NV5_FINANCIAL_LABEL_ALIAS');return result;
}
