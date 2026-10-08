import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
import {nativeSplCompilationMaterialV1} from './native-spl-compilation-material-v1.mjs';
export function nativeSplCompilationSourcePinsV1(){
 assert.equal(arguments.length,0,'SPL_COMPILATION_SOURCE_NO_OPTIONS');const basis=nativeFlowSourcePins(),rows=new Map(basis.local.map(row=>[row.path,row]));
 for(const row of nativeSplCompilationMaterialV1().records)rows.set(row.path,row);
 for(const name of ['run-native-spl-compilation-v1.mjs','native-spl-compilation-worker-v1.mjs','native-spl-compilation-policy-v1.mjs','native-spl-compilation-source-pins-v1.mjs','native-spl-compilation-material-v1.mjs']){
  const path=join(ROOT,'integration',name),raw=regular(path),label=relative(FLAT,path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});
 }
 return {...basis,format:'LIANUM_NEW_SPL_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
