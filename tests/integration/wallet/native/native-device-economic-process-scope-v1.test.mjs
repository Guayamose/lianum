/** HOST process-label boundaries. No process is spawned by these fixtures. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
import {classifyNativeEconomicRestartProcessV1 as classify,NATIVE_ECONOMIC_RESTART_WORKER_V1 as MAIN,NATIVE_ECONOMIC_SUCCESSOR_WORKER_V1 as NEXT,NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1 as ANVIL} from './native-device-economic-process-scope-v1.mjs';
const parent=script=>({argv:[process.execPath,script]});
function anvil(successor){const directory=join(GOLDEN,'.local/integrations','flat-economic-native-v2-ABC123');return [ANVIL,'--host','127.0.0.1','--port','45678','--chain-id','1','--hardfork','cancun','--timestamp','1900000310','--accounts','0',...(successor?['--load-state',join(directory,'reopen-state-1.json')]:['--init',join(directory,'native-economic-genesis-v2.json')]),'--quiet','--no-cors','--no-mining','--gas-limit','30000000'];}
test('HOST economic process scope accepts only causal successor and exact zero-wallet official Anvil vectors',()=>{
 assert.deepEqual(classify([process.execPath,NEXT],process.execPath,parent(MAIN)),{role:'native-economic-successor-role',proofWorker:false});
 assert.deepEqual(classify(anvil(false),ANVIL,parent(MAIN)),{role:'evm-runtime',proofWorker:false});
 assert.deepEqual(classify(anvil(true),ANVIL,parent(NEXT)),{role:'evm-runtime',proofWorker:false});
 const rejected=argv=>assert.deepEqual(classify(argv,ANVIL,parent(NEXT)),{role:'native-economic-unexpected-process',proofWorker:true});
 for(const [index,value]of [[12,'5'],[6,'8453'],[10,'1900000311'],[14,'/tmp/reopen-state-1.json'],[14,anvil(true)[14]+'\n']]){const altered=anvil(true);altered[index]=value;rejected(altered);}
 rejected([...anvil(true),'--mnemonic','public fixture only']);
 // The old producer supplied both CLI modes; the actual fixed classifier must reject it.
 rejected([...anvil(false),'--load-state',anvil(true)[14]]);
 rejected([...anvil(true),'--init',anvil(false)[14]]);
 rejected(anvil(false));
 assert.deepEqual(classify(anvil(true),ANVIL,parent(MAIN)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify([process.execPath,NEXT],process.execPath,parent('/tmp/other.mjs')),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify(['/tmp/anvil'], '/tmp/anvil',parent(MAIN)),{role:'native-economic-unexpected-process',proofWorker:true});
});

test('Native-note successor cannot reuse a legacy economic parent or Anvil vector',async()=>{
 const {classifyNativeEconomicNoteRestartProcessV1:notes,NATIVE_ECONOMIC_NOTE_RESTART_WORKER_V1:NOTE_MAIN,NATIVE_ECONOMIC_NOTE_SUCCESSOR_WORKER_V1:NOTE_NEXT}=await import('./native-device-economic-note-process-scope-v1.mjs');
 assert.deepEqual(notes([process.execPath,NOTE_NEXT],process.execPath,parent(NOTE_MAIN)),{role:'native-economic-successor-role',proofWorker:false});
 assert.deepEqual(notes(anvil(false),ANVIL,parent(NOTE_MAIN)),{role:'evm-runtime',proofWorker:false});
 assert.deepEqual(notes(anvil(true),ANVIL,parent(NOTE_NEXT)),{role:'evm-runtime',proofWorker:false});
 assert.deepEqual(notes([...anvil(false),'--load-state',anvil(true)[14]],ANVIL,parent(NOTE_NEXT)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(notes(anvil(false),ANVIL,parent(NOTE_NEXT)),{role:'native-economic-unexpected-process',proofWorker:true});
 for(const legacy of[MAIN,NEXT]){
  assert.deepEqual(notes([process.execPath,NOTE_NEXT],process.execPath,parent(legacy)),{role:'native-economic-unexpected-process',proofWorker:true});
  assert.deepEqual(notes(anvil(true),ANVIL,parent(legacy)),{role:'native-economic-unexpected-process',proofWorker:true});
 }
 const altered=anvil(true);altered[12]='5';assert.deepEqual(notes(altered,ANVIL,parent(NOTE_NEXT)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(notes([...process.argv.slice(0,1),NOTE_NEXT,'--backend=Wasm'],process.execPath,parent(NOTE_MAIN)),{role:'native-economic-unexpected-process',proofWorker:true});
});

test('HOST durable Native10 process scope retains original vectors and rejects cross-profile successors',async()=>{
 const p=await import('./native-device-economic-note-process-scope-v1.mjs'),classify=p.classifyNativeDurableNoteRestartProcessV1,main=p.NATIVE_DURABLE_NOTE_MAIN_V1,next=p.NATIVE_DURABLE_NOTE_NEXT_V1;
 assert.deepEqual(classify([process.execPath,next],process.execPath,parent(main)),{role:'native-economic-successor-role',proofWorker:false});
 assert.deepEqual(classify(anvil(false),ANVIL,parent(main)),{role:'evm-runtime',proofWorker:false});assert.deepEqual(classify(anvil(true),ANVIL,parent(next)),{role:'evm-runtime',proofWorker:false});
 for(const old of[MAIN,NEXT,p.NATIVE_ECONOMIC_NOTE_RESTART_WORKER_V1,p.NATIVE_ECONOMIC_NOTE_SUCCESSOR_WORKER_V1])assert.deepEqual(classify([process.execPath,next],process.execPath,parent(old)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify(anvil(false),ANVIL,parent(next)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify(anvil(true),ANVIL,parent(main)),{role:'native-economic-unexpected-process',proofWorker:true});
 const altered=anvil(true);altered[12]='5';assert.deepEqual(classify(altered,ANVIL,parent(next)),{role:'native-economic-unexpected-process',proofWorker:true});
 assert.deepEqual(classify([process.execPath,next,'--sql=other'],process.execPath,parent(main)),{role:'native-economic-unexpected-process',proofWorker:true});
});
