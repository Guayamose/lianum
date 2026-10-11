/** Fixed compilation closure and official material, no caller roots. */
import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT,GOLDEN} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
export function nativeSplClaimTokenCompilationSourcePinsV1(){
 assert.equal(arguments.length,0,'SPL_TOKEN_COMPILATION_SOURCE_NO_OPTIONS');
 const basis=nativeFlowSourcePins(),rows=new Map(basis.local.map(row=>[row.path,row]));
 for(const path of ['run-native-spl-claim-token-compilation-v1.mjs','native-spl-claim-token-compilation-worker-v1.mjs','native-spl-claim-token-compilation-source-pins-v1.mjs','native-spl-claim-token-compilation-policy-v1.mjs'].map(name=>join(ROOT,'integration',name)).concat([
  join(ROOT,'contracts/native-claims/NativeClaimToken.sol'),join(ROOT,'contracts/native-claims/NativeSplClaimTokenV1.sol'),join(GOLDEN,'tools/solidity-js/package-lock.json'),join(GOLDEN,'tools/solidity-js/node_modules/solc/soljson.js')])){
  const raw=regular(path),label=relative(FLAT,path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});
 }
 return {...basis,format:'LIANUM_SPL_TOKEN_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
