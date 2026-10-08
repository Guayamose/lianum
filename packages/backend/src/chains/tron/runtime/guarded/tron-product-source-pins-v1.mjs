/** Current product source, independent of the accepted historical report. Uses
 * the original static walk predicates; no caller roots, exclusions or pins. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FLAT, GOLDEN } from '../../../../../../proofs/src/catalog.mjs';
const MOBILE_PROTOCOL=resolve(FLAT,'../mobile-protocol');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function regular(path) { assert.equal(realpathSync(path),path,'TRON_PRODUCT_SOURCE_SYMLINK');
 const info=lstatSync(path); assert.ok(info.isFile()&&!info.isSymbolicLink()); return readFileSync(path); }
export function captureTronProductSourcePinsV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_SOURCE_NO_OPTIONS'); const files=new Map();
 function capture(path) { const bytes=regular(path); files.set(path,{path:relative(FLAT,path),bytes:bytes.length,sha256:sha(bytes),mode:lstatSync(path).mode&0o7777}); return bytes; }
 function visit(path) {
  assert.ok([ROOT,FLAT,GOLDEN,MOBILE_PROTOCOL].some(root=>path.startsWith(root+'/'))&&path.endsWith('.mjs'),'TRON_PRODUCT_SOURCE_FIXED_LOCAL_ROOT');
  if(files.has(path))return; const source=capture(path).toString('utf8'), names=new Set();
  for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g))names.add(match[2]);
  for(const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm))names.add(match[2]);
  for(const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g))names.add(match[2]);
  for(const match of source.matchAll(/\bnew\s+URL\s*\(\s*(['"])([^'"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)/g))names.add(match[2]);
  for(const name of names) { if(name.startsWith('node:')||['@aztec/bb.js','@noir-lang/noir_js','@noir-lang/noir_wasm'].includes(name))continue;
   assert.ok(name.startsWith('.'),'TRON_PRODUCT_SOURCE_LOCAL_IMPORT'); visit(resolve(dirname(path),name)); }
 }
 visit(fileURLToPath(new URL('./tron-product-node-driver-v1.mjs',import.meta.url)));
 const fixed=join(ROOT,'integration/chains/tron');
 for(const name of ['tron-aligned-rocksdb-profile.mjs','fixtures/candidate-artifacts-v3.json','fixtures/jdk-acquisition.json',
  'fixtures/aligned-rocksdb-v1/build.py','fixtures/aligned-rocksdb-v1/compile-child.py','fixtures/aligned-rocksdb-v1/launch.py',
  'fixtures/aligned-rocksdb-v1/source/OwnedTronNativeDriver.java','fixtures/tron-candidate-seccomp.py',
  'fixtures/offline-agree-zero/source/org/tron/core/config/args/Args.java'])capture(join(fixed,name));
 capture(join(resolve(ROOT,'../../../..'),'scripts/development/ledger_owned_processes.py'));
 capture(join(ROOT,'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'));
 for(const [path,row] of files) { const bytes=regular(path); assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);assert.equal(lstatSync(path).mode&0o7777,row.mode); }
 return Object.freeze({format:'LIANUM_TRON_PRODUCT_CURRENT_SOURCE_PINS_V1',historicalReportRewritten:false,
  files:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))});
}
