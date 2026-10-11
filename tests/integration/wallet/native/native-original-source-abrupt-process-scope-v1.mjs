/** Fixed labels for the original SOURCE child and its kernel guardian. Labels
 * never mint a process handle or exemption from UID/birth/group/RSS guards. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {ROOT,FLAT,GOLDEN} from '@lianum/proofs/catalog';
import {assertNativeLiveArmedShortRecoverableAnvilV1} from './native-device-live-armed-short-process-scope-v1.mjs';
const WORKER=join(ROOT,'integration/native-original-source-abrupt-flow-v1.mjs'),CHILD=join(ROOT,'integration/native-original-source-abrupt-backend-v1.mjs');
const ANVIL=join(GOLDEN,'.local/linux-runtimes/foundry-v1.8.4/anvil');
const helper=join(resolve(FLAT,'../../..'),'packages/backend/src/operations/recovery/native-original-source-process-v1.mjs');
const helperSHA='7a57e3472e20b931ad34c9c669e3a263751f0cd8952530ec0102ac12df199ad6';
function guardianLiteral(){assert.equal(realpathSync(helper),helper);const before=lstatSync(helper);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<65536);
 const bytes=readFileSync(helper),after=lstatSync(helper);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);assert.equal(createHash('sha256').update(bytes).digest('hex'),helperSHA);
 const matches=[...bytes.toString('utf8').matchAll(/const guardian=String\.raw`([^`]+)`;/g)];assert.equal(matches.length,1);return matches[0][1];}
const guardian=guardianLiteral(),python=realpathSync('/usr/bin/python3');
const fixedNode=(argv,script)=>Array.isArray(argv)&&argv.length===2&&argv[0]===process.execPath&&argv[1]===script;
const unexpected=()=>({role:'native-source-unexpected-process',proofWorker:true});
function anvilArguments(argv){
 if(!Array.isArray(argv)||argv.length!==20||argv[0]!==ANVIL||argv[1]!=='--host'||argv[2]!=='127.0.0.1'||argv[3]!=='--port'
  ||!/^[1-9][0-9]{0,4}$/.test(argv[4])||Number(argv[4])>65535||argv[5]!=='--chain-id'||!['31337','1'].includes(argv[6])
  ||argv[7]!=='--hardfork'||argv[8]!=='cancun'||argv[9]!=='--timestamp'||!/^[1-9][0-9]{0,15}$/.test(argv[10])
  ||!Number.isSafeInteger(Number(argv[10]))||Number(argv[10])>Math.floor(Date.now()/1000)||argv[11]!=='--accounts'||argv[12]!=='0'
  ||!['--init','--load-state'].includes(argv[13])||argv[15]!=='--quiet'||argv[16]!=='--no-cors'||argv[17]!=='--no-mining'||argv[18]!=='--gas-limit'||argv[19]!=='30000000')return false;
 const directory=dirname(argv[14]),prefix=argv[6]==='1'?'flat-economic-native-v2-':'flat-economic-receiver-v2-';
 if(dirname(directory)!==join(GOLDEN,'.local/integrations')||!new RegExp('^'+prefix+'[A-Za-z0-9]{6}$').test(basename(directory)))return false;
 return argv[13]==='--init'?argv[14]===join(directory,'native-economic-genesis-v2.json'):/^reopen-state-([1-9]|1[0-5])\.json$/.test(basename(argv[14]));
}
export function classifyNativeSourceAbruptProcessV1(argv,executable,parent){
 assert.equal(arguments.length,3);if(!Array.isArray(argv))return null;const main=parent&&fixedNode(parent.argv,WORKER),backend=parent&&fixedNode(parent.argv,CHILD);
 if(argv.includes(CHILD)){if(!main||executable!==process.execPath||!fixedNode(argv,CHILD))return unexpected();return{role:'native-source-original-backend',proofWorker:false};}
 if(executable===ANVIL||argv[0]===ANVIL){if(!backend||executable!==ANVIL||!anvilArguments(argv))return unexpected();return{role:'evm-runtime',proofWorker:false};}
 if(argv[0]==='/usr/bin/python3'&&argv[1]==='-I'&&argv[2]==='-S'&&argv[3]==='-c'){
  if(!backend||executable!==python||argv.length!==27||argv[4]!==guardian||argv[5]!==String(parent.pid)||argv[6]!==parent.startTimeTicks||!anvilArguments(argv.slice(7)))return unexpected();
  return{role:'native-source-original-kernel-guardian',proofWorker:false};
 }
 if(basename(executable??'')==='anvil'||basename(argv[0]??'')==='anvil')return unexpected();return null;
}
export async function assertNativeSourceAbruptPreflightV1(){assert.equal(arguments.length,0);guardianLiteral();return assertNativeLiveArmedShortRecoverableAnvilV1();}
