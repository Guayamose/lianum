/** Fixed compilation closure and official material, no caller roots. */
import assert from 'node:assert/strict';
import {assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT,GOLDEN} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {aavePrivateGraphSourcePinsV1} from './aave-private-graph-source-pins-v1.mjs';
export function aaveCompilationSourcePinsV1(){
 assert.equal(arguments.length,0,'AAVE_COMPILATION_SOURCE_NO_OPTIONS');
 const basis=aavePrivateGraphSourcePinsV1(),rows=new Map(basis.local.map(row=>[row.path,row]));
 assertCapturedCurrentSources(basis,["tests/integration/chains/evm/run-evm-aave-compilation-v1.mjs","tests/integration/chains/evm/aave-compilation-worker-v1.mjs","tests/integration/chains/evm/aave-compilation-source-pins-v1.mjs","tests/integration/chains/evm/aave-compilation-policy-v1.mjs"]);
 for(const path of [
  join(GOLDEN,'tools/solidity-js/package-lock.json'),join(GOLDEN,'tools/solidity-js/node_modules/solc/soljson.js')]){
  const raw=regular(path),label=relative(FLAT,path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});
 }
 return {...basis,format:'LIANUM_AAVE_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
