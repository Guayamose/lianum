/** Fixed labels only: the original supervisor owns PID/UID4/birth/group/RSS. */
import assert from 'node:assert/strict';
import {dirname,basename,join} from 'node:path';
import {ROOT,GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
import {NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1} from '../../wallet/native/native-device-economic-process-scope-v1.mjs';
const main=join(ROOT,'integration/evm-vault-flow.mjs'),successor=join(ROOT,'integration/external-defi-vault-exit-successor-v1.mjs');
const node=(argv,script)=>Array.isArray(argv)&&argv.length===2&&argv[0]===process.execPath&&argv[1]===script;
const deny=()=>({role:'external-vault-unexpected-process',proofWorker:true});
function originalAnvil(argv,reopened){
 if(!Array.isArray(argv)||argv.length!==20||argv[0]!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||argv[1]!=='--host'||argv[2]!=='127.0.0.1'||argv[3]!=='--port'||/^[1-9][0-9]{0,4}$/.exec(argv[4])?.[0]!==argv[4]||Number(argv[4])>65535||argv[5]!=='--chain-id'||argv[6]!=='31337'||argv[7]!=='--hardfork'||argv[8]!=='cancun'||argv[9]!=='--timestamp'||argv[10]!=='1900000210'||argv[11]!=='--accounts'||argv[12]!=='0'||argv[13]!==(reopened?'--load-state':'--init')||argv[15]!=='--quiet'||argv[16]!=='--no-cors'||argv[17]!=='--no-mining'||argv[18]!=='--gas-limit'||argv[19]!=='30000000')return false;
 const path=argv[14],directory=dirname(path);if(dirname(directory)!==join(GOLDEN,'.local/integrations')||/^flat-economic-receiver-v2-[A-Za-z0-9]{6}$/.exec(basename(directory))?.[0]!==basename(directory))return false;
 return reopened?/^reopen-state-([1-9]|1[0-5])\.json$/.exec(basename(path))?.[0]===basename(path):path===join(directory,'native-economic-genesis-v2.json');
}
export function classifyExternalDefiVaultExitProcessV1(argv,executable,parent){
 assert.equal(arguments.length,3);if(!Array.isArray(argv))return null;
 const mainParent=parent&&node(parent.argv,main),successorParent=parent&&node(parent.argv,successor);
 if(argv.includes(successor)){if(executable!==process.execPath||!mainParent||!node(argv,successor))return deny();return{role:'native-economic-successor-role',proofWorker:false};}
 if(executable===NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||argv[0]===NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1){if(executable!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||(!mainParent&&!successorParent)||!originalAnvil(argv,Boolean(successorParent)))return deny();return{role:'evm-runtime',proofWorker:false};}
 if(successorParent){const owner=executable===process.execPath&&argv.length===3&&argv[0]===process.execPath&&argv[1]===join(ROOT,'mobile-core/flat-owner-process.mjs')&&argv[2]==='--flat-owner-child';const coordinator=executable===process.execPath&&node(argv,join(GOLDEN,'src/paeg/generic-account-child.mjs'));if(!owner&&!coordinator)return deny();}
 if(basename(executable??'')==='anvil'||basename(argv[0]??'')==='anvil')return deny();
 return null;
}

export function externalDefiVaultExitProcessFailureV1(history){assert.equal(arguments.length,1);assert.ok(Array.isArray(history));return history.some(row=>row.role==='external-vault-unexpected-process')?'EXTERNAL_VAULT_FIXED_PROCESS_REQUIRED':null;}
