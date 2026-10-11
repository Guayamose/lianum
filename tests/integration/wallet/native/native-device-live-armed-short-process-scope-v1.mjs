import {fileURLToPath} from 'node:url';
/** Fixed LIVE_ARMED observed-genesis process labels and original recoverable-Anvil preflight for the
 * planned economic restart. Labels never mint an account or signal capability.
 * The supervisor retains its original PID/group/UID/birth/RSS checks. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {access,lstat,realpath} from 'node:fs/promises';
import {dirname,join,basename} from 'node:path';
import {ROOT,GOLDEN} from '@lianum/proofs/catalog';
import {pinnedBinary} from '@lianum/engine/chains/shared/runtime-harness';

export const NATIVE_ECONOMIC_RECOVERABLE_ANVIL_PIN_V1=Object.freeze([
  'foundry-v1.8.4/anvil',
  'be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176',
]);
export const NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1=join(GOLDEN,'.local/linux-runtimes',NATIVE_ECONOMIC_RECOVERABLE_ANVIL_PIN_V1[0]);
export const NATIVE_LIVE_ARMED_SHORT_WORKER_V1=fileURLToPath(new URL('./native-value-live-armed-short-restart-flow-v1.mjs',import.meta.url));
export const NATIVE_LIVE_ARMED_SHORT_SUCCESSOR_V1=fileURLToPath(new URL('./native-device-live-armed-short-successor-v1.mjs',import.meta.url));

const fixedNode=(argv,script)=>Array.isArray(argv)&&argv.length===2&&argv[0]===process.execPath&&argv[1]===script;
const unexpected=()=>({role:'native-economic-unexpected-process',proofWorker:true});
function originalAnvilArguments(argv,successor){
  // V2 has no server wallet, mnemonic or config-out. Its genesis contains only
  // five public local-custody allocations; restored state remains exact bytes.
  if(!Array.isArray(argv)||argv.length!==20)return false;
  if(argv[0]!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||argv[1]!=='--host'||argv[2]!=='127.0.0.1'
    ||argv[3]!=='--port'||!(/^[1-9][0-9]{0,4}$/.exec(argv[4])?.[0]===argv[4])||Number(argv[4])>65535
    ||argv[5]!=='--chain-id'||!['31337','1'].includes(argv[6])||argv[7]!=='--hardfork'||argv[8]!=='cancun'
    ||argv[9]!=='--timestamp'||!(/^[1-9][0-9]{0,15}$/.exec(argv[10])?.[0]===argv[10])||!Number.isSafeInteger(Number(argv[10]))||Number(argv[10])>Math.floor(Date.now()/1000)
    ||argv[11]!=='--accounts'||argv[12]!=='0'||argv[13]!== (successor?'--load-state':'--init')
    ||argv[15]!=='--quiet'||argv[16]!=='--no-cors'||argv[17]!=='--no-mining'
    ||argv[18]!=='--gas-limit'||argv[19]!=='30000000')return false;
  const directory=dirname(argv[14]),prefix=argv[6]==='1'?'flat-economic-native-v2-':'flat-economic-receiver-v2-';
  if(dirname(directory)!==join(GOLDEN,'.local/integrations')
    ||new RegExp('^'+prefix+'[A-Za-z0-9]{6}$').exec(basename(directory))?.[0]!==basename(directory)
    )return false;
  // Initial genesis and restored chain are mutually exclusive official CLI modes.
  return !successor?argv[14]===join(directory,'native-economic-genesis-v2.json')
    :new RegExp('^reopen-state-([1-9]|1[0-5])\\.json$').exec(basename(argv[14]))?.[0]===basename(argv[14]);
}

/** Pure labels only; unknown children of the fixed successor receive the
 * stricter heavy label, never an exemption based on a basename or DTO. */
export function classifyNativeLiveArmedShortProcessV1(argv,executable,parent=null){
  assert.equal(arguments.length,3);
  if(!Array.isArray(argv))return null;
  const mainParent=parent&&fixedNode(parent.argv,NATIVE_LIVE_ARMED_SHORT_WORKER_V1);
  const successorParent=parent&&fixedNode(parent.argv,NATIVE_LIVE_ARMED_SHORT_SUCCESSOR_V1);
  if(argv.includes(NATIVE_LIVE_ARMED_SHORT_SUCCESSOR_V1)){
    if(executable!==process.execPath||!mainParent||!fixedNode(argv,NATIVE_LIVE_ARMED_SHORT_SUCCESSOR_V1))return unexpected();
    return{role:'native-economic-successor-role',proofWorker:false};
  }
  if(executable===NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||argv[0]===NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1){
    if(executable!==NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1||!originalAnvilArguments(argv,Boolean(successorParent))
      ||(!mainParent&&!successorParent))return unexpected();
    return{role:'evm-runtime',proofWorker:false};
  }
  if(basename(executable??'')==='anvil'||typeof argv[0]==='string'&&basename(argv[0])==='anvil')return unexpected();
  return null;
}

/** Must run before the first runtime/funding. The actual original runtime
 * hashes this same fixed binary again before each spawn and reopen. This new V2 profile is born before D26; no adoption
 * of a funded legacy Anvil, caller path, executable or pin is accepted. */
export async function assertNativeLiveArmedShortRecoverableAnvilV1(){
  assert.equal(arguments.length,0,'NATIVE_ECONOMIC_FIXED_ANVIL_PREFLIGHT');
  assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
  const path=NATIVE_ECONOMIC_RECOVERABLE_ANVIL_V1;
  assert.equal(await realpath(path),path,'NATIVE_ECONOMIC_ANVIL_FIXED_PATH');
  const before=await lstat(path);
  assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid(),
    'NATIVE_ECONOMIC_ANVIL_REGULAR_ORIGINAL');
  const pinned=await pinnedBinary(...NATIVE_ECONOMIC_RECOVERABLE_ANVIL_PIN_V1);
  assert.equal(pinned,path,'NATIVE_ECONOMIC_ANVIL_FIXED_PATH');await access(path,constants.X_OK);
  const after=await lstat(path);
  for(const key of ['dev','ino','uid','nlink','size','mode','mtimeMs','ctimeMs'])
    assert.equal(after[key],before[key],'NATIVE_ECONOMIC_ANVIL_CHANGED');
  assert.equal(await realpath(path),path,'NATIVE_ECONOMIC_ANVIL_FIXED_PATH');
  return Object.freeze({path,sha256:NATIVE_ECONOMIC_RECOVERABLE_ANVIL_PIN_V1[1],bytes:before.size,executable:true});
}
