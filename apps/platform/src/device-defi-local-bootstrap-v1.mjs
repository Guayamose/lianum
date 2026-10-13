/** One explicit original DeFi relation. Fixed original child argv, no selected
 * endpoint/runtime/provider from HTTP and no automatic note funding. */
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const relations=Object.freeze([
 {label:'Uniswap: conversión y nota privada de salida',args:['--uniswap-v3','--source-recovery-v3']},
 {label:'Aave: participaciones privadas y redención original',args:['--aave-static','--source-recovery-v3']},
 {label:'MetaMorpho: participaciones privadas y underlying original',args:['--metamorpho-underlying']}
]);
export async function runOriginalDeviceDefiProfileV1(profile){
 assert.equal(arguments.length,1);assert.equal(profile,'defi-new');const node=fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),entry=fileURLToPath(new URL('./entry.mjs',import.meta.url)),runner=fileURLToPath(new URL('./run-device-external-flat-local-v1.mjs',import.meta.url));
 assert.equal(process.execPath,node);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.deepEqual(process.argv,[node,entry,profile]);assert.equal(await realpath(entry),entry);assert.equal(await realpath(runner),runner);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');assert.ok(process.stdin.isTTY&&process.stdout.isTTY,'DEVICE_DEFI_SETUP_INTERACTIVE_REQUIRED');
 const signal=new AbortController();let child;
 const stop=()=>{signal.abort();child?.kill('SIGTERM');},capture=()=>{child?.kill('SIGUSR1');};process.once('SIGINT',stop);process.once('SIGTERM',stop);process.once('SIGUSR1',capture);
 try{
  const terminal=createInterface({input:process.stdin,output:process.stdout});terminal.once('SIGINT',stop);let selected;
  try{process.stdout.write('Selecciona UNA relación DeFi LOCAL original. Paged conserva su propia cuenta y notas.\n'+relations.map((relation,index)=>`${index+1}. ${relation.label}`).join('\n')+'\n');const choice=(await terminal.question('Relación (1-3): ',{signal:signal.signal})).trim();assert.match(choice,/^[1-3]$/);selected=relations[Number(choice)-1];}finally{terminal.close();}
  signal.signal.throwIfAborted();process.stderr.write('DEVICE_DEFI_LOCAL_ONLY: synthetic tokens and owned local network. Keep the original service running; observation/recovery retains its original limits. No notes are funded at startup.\n');
  child=spawn(node,['--max-old-space-size=384',runner,...selected.args],{stdio:'inherit',env:process.env});await new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('DEVICE_DEFI_ORIGINAL_CHILD_START_FAILED')));child.once('exit',(code,termination)=>{if(signal.signal.aborted||code===0)resolve();else reject(Error('DEVICE_DEFI_ORIGINAL_CHILD_FAILED'));});});
  return Object.freeze({closed:true,localOnly:true,automaticFunding:false});
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);process.removeListener('SIGUSR1',capture);}
}
