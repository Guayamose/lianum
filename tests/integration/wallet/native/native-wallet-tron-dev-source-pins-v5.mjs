import assert from 'node:assert/strict';
import { join, resolve, relative } from 'node:path';
import { readFileSync,lstatSync,realpathSync } from 'node:fs';
import { ROOT,FLAT,GOLDEN,CANDIDATE } from '../../../../packages/proofs/src/catalog.mjs';
import { hash,verifyAPI,verifyVendor } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { nativeValueDevFinancialSourcePinsV5 } from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
const project=resolve(FLAT,'../../..'),roots=Object.freeze([['development-tooling/',join(project,'scripts/development')],['development-config/',join(project,'scripts')],
 ['golden/',GOLDEN],['candidate/',CANDIDATE],['mobile-protocol/',resolve(FLAT,'../mobile-protocol')],['mobile-app/',join(project,'apps/mobile')],
 ['mobile-protocol-workspace/',join(project,'packages/mobile-protocol')],['flat/',FLAT],['workspace-module/',project],['development-root/',project]]);
export function nativeWalletTronDevSourcePinsV5(){
 assert.equal(arguments.length,0,'TRON_WALLET_DEV_PINS_NO_OPTIONS');const publication=nativeValueDevFinancialSourcePinsV5();
 const local=publication.map(row=>{const root=roots.find(([prefix])=>row.path.startsWith(prefix)),path=join(root?.[1]??ROOT,root?row.path.slice(root[0].length):row.path);
  assert.equal(realpathSync(path),path);const stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=readFileSync(path);
  assert.equal(bytes.length,stat.size);assert.equal(hash(bytes),row.sha256);return {path:relative(FLAT,path),bytes:bytes.length,sha256:row.sha256};});
 const path=join(ROOT,'wallet-platform/modules/ops/native-value-dev-release-v5.mjs');assert.equal(realpathSync(path),path);
 const stat=lstatSync(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());const bytes=readFileSync(path);assert.equal(bytes.length,stat.size);
 local.push({path:relative(FLAT,path),bytes:bytes.length,sha256:hash(bytes)});
 assert.equal(new Set(local.map(row=>row.path)).size,local.length,'TRON_WALLET_DEV_PHYSICAL_ALIAS');
 assert.deepEqual(nativeValueDevFinancialSourcePinsV5(),publication,'TRON_WALLET_DEV_PINS_CHANGED');
 return {format:'NATIVE_WALLET_TRON_DEV_CURRENT_SOURCE_CAPSULE_V5',local:local.sort((a,b)=>a.path.localeCompare(b.path)),officialAPI:verifyAPI(),vendor:verifyVendor()};
}
