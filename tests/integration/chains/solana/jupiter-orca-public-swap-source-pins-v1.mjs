/** Fixed original supervisor closure + official public snapshot; no caller roots. */
import assert from 'node:assert/strict';
import {join,relative,resolve,sep} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
import {JUPITER_OFFICIAL_FILES_V1,loadJupiterOfficialMaterialV1} from '../../../../packages/backend/src/operations/deployments/defi/jupiter-official-material-v1.mjs';
export function jupiterOrcaPublicSwapSourcePinsV1(){
 assert.equal(arguments.length,0,'JUPITER_SWAP_SOURCE_NO_OPTIONS');
 const basis=nativeFlowSourcePins(),rows=new Map(basis.local.map(row=>[row.path,row]));
 const record=path=>{assert.ok(path.startsWith(FLAT+sep)||path.startsWith(resolve(FLAT,'../../..')+sep),'JUPITER_SWAP_FIXED_SOURCE_ROOT');
  const raw=regular(path),label=relative(FLAT,path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});};
 for(const name of ['run-jupiter-orca-public-swap-v1.mjs','jupiter-orca-public-swap-worker-v1.mjs','jupiter-orca-public-swap-policy-v1.mjs','jupiter-orca-public-swap-source-pins-v1.mjs'])record(join(ROOT,'integration',name));
 const material=loadJupiterOfficialMaterialV1();for(const row of JUPITER_OFFICIAL_FILES_V1)record(join(material.directory,row.path));
 record(join(resolve(FLAT,'../../..'),'scripts/development/jupiter_material.py'));
 return {...basis,format:'LIANUM_JUPITER_ORCA_PUBLIC_SWAP_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
