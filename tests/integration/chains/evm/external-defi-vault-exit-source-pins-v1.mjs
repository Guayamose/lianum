/** New fixed consumer closure; historical proof/compiler sources stay intact. */
import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {aavePrivateGraphSourcePinsV1} from './aave-private-graph-source-pins-v1.mjs';
export function externalDefiVaultExitSourcePinsV1(){
 assert.equal(arguments.length,0,'EXTERNAL_VAULT_SOURCE_NO_OPTIONS');
 // The original fixed walker starts at this worker/supervisor, so it captures
 // new constructor/issuer/child dependencies through their literal imports.
 const original=aavePrivateGraphSourcePinsV1(),files=new Map(original.local.map(row=>[row.path,row]));
 for(const name of ['run-evm-metamorpho-exit-recovery-v1.mjs','run-evm-aave-exit-recovery-v1.mjs','external-defi-vault-exit-source-pins-v1.mjs','external-defi-vault-exit-policy-v1.mjs','external-defi-vault-exit-lifetime-v1.mjs','external-defi-vault-exit-successor-v1.mjs']){const path=join(ROOT,'integration',name),bytes=regular(path);files.set(relative(FLAT,path).split(sep).join('/'),{path:relative(FLAT,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});}
 return{...original,format:'ORIGINAL_RETAINED_OFFICIAL_VAULT_EXIT_SOURCE_CLOSURE_V1',local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
