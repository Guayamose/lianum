/** HOST process-label boundaries. No process is spawned by these fixtures. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
import {classifyNativeEconomicRestartProcessV1 as classify,NATIVE_ECONOMIC_RESTART_WORKER_V1 as MAIN,NATIVE_ECONOMIC_SUCCESSOR_WORKER_V1 as NEXT,NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1 as ANVIL} from './native-device-economic-process-scope-v1.mjs';
const parent=script=>({argv:[process.execPath,script]});
function anvil(successor){const directory=join(GOLDEN,'.local/integrations','flat-economic-native-v2-ABC123');return [ANVIL,'--host','127.0.0.1','--port','45678','--chain-id','1','--hardfork','cancun','--timestamp','1900000310','--accounts','0','--init',join(directory,'native-economic-genesis-v2.json'),'--quiet','--no-cors','--no-mining','--gas-limit','30000000',...(successor?['--load-state',join(directory,'reopen-state-1.json')]:[])];}
test('HOST economic process scope accepts only causal successor and exact zero-wallet official Anvil vectors',()=>{
 assert.deepEqual(classify([process.execPath,NEXT],process.execPath,parent(MAIN)),{role:'native-economic-successor-role',proofWorker:false});
 assert.deepEqual(classify(anvil(false),ANVIL,parent(MAIN)),{role:'evm-runtime',proofWorker:false});
 assert.deepEqual(classify(anvil(true),ANVIL,parent(NEXT)),{role:'evm-runtime',proofWorker:false});
 const rejected=argv=>assert.deepEqual(classify(argv,ANVIL,parent(NEXT)),{role:'native-economic-unexpected-process',proofWorker:true});
 for(const [index,value]of [[12,'5'],[6,'8453'],[10,'1900000311'],[21,'/tmp/reopen-state-1.json'],[21,anvil(true)[21]+'\n']]){const altered=anvil(true);altered[index]=value;rejected(altered);}
 rejected([...anvil(true),'--mnemonic','public fixture only']);
 assert.deepEqual(classify(anvil(true),ANVIL,parent(MAIN)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify([process.execPath,NEXT],process.execPath,parent('/tmp/other.mjs')),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify(['/tmp/anvil'], '/tmp/anvil',parent(MAIN)),{role:'native-economic-unexpected-process',proofWorker:true});
});
