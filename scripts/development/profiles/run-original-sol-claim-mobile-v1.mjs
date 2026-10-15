/** Fixed local SOL claim product. TLS/device pairing is infrastructure only.
 * No native owner key is imported from the mobile device. Canonical deployment,
 * private intent/EXIT and native finality are all the original producers. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),entry=fileURLToPath(import.meta.url);
assert.equal(process.execPath,fileURLToPath(new URL('.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',root)));
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const deviceRootExit=process.argv.length===3&&process.argv[2]==='--device-root-exit';
const deviceRootSplSourceExit=process.argv.length===3&&process.argv[2]==='--device-root-spl-source-exit';
const deviceRootSplExit=process.argv.length===3&&process.argv[2]==='--device-root-spl-exit';
const deviceRoot=process.argv.length===3&&process.argv[2]==='--device-root-note';
const deviceRootSpl=process.argv.length===3&&process.argv[2]==='--device-root-spl';
assert.deepEqual(process.argv,[process.execPath,entry,...(deviceRootExit?['--device-root-exit']:deviceRootSplSourceExit?['--device-root-spl-source-exit']:deviceRootSplExit?['--device-root-spl-exit']:deviceRoot?['--device-root-note']:deviceRootSpl?['--device-root-spl']:[])]);assert.equal(await realpath(entry),entry);
const product=new URL('../../../packages/backend/src/api/claims/native-claim-http.mjs',import.meta.url);
let acquisition,operator,closing,closeRequested=false;
async function configFile(path){const parent=dirname(path),st=await lstat(parent);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&await realpath(parent)===parent);
 const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=await fd.stat();assert.ok(before.isFile()&&before.nlink===1&&before.uid===process.getuid()&&(before.mode&0o777)===0o600&&before.size>0&&before.size<=32768);
 bytes=Buffer.alloc(32769);const n=(await fd.read(bytes,0,bytes.length,0)).bytesRead,after=await fd.stat(),named=await lstat(path);
 for(const k of ['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'])assert.ok(before[k]===after[k]&&before[k]===named[k]);assert.ok(!named.isSymbolicLink()&&n===before.size);return JSON.parse(bytes.subarray(0,n).toString('utf8'));
 }finally{bytes?.fill(0);await fd.close();}}
function close(){closeRequested=true;return closing??=(async()=>{if(acquisition)operator=await acquisition;if(operator){const receipt=await operator.close();assert.ok(receipt.closed&&receipt.originalResourcesStopped);}})();}
const stop=()=>{void close().catch(()=>{process.stderr.write('NATIVE_CLAIM_LOCAL_CLOSE_UNCONFIRMED\n');process.exitCode=1;});};process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{const backend=await import(product),path=await backend.originalClaimMobileLocalConfigurationPathV1(),config=await configFile(path);
 if(!closeRequested){acquisition=deviceRootSplSourceExit?backend.createOriginalDeviceRootSplSourceClaimExitLocalOperatorV4(config):deviceRootExit?backend.createOriginalDeviceRootSolClaimExitLocalOperatorV3(config):deviceRootSplExit?backend.createOriginalDeviceRootSplClaimExitLocalOperatorV3(config):deviceRootSpl?backend.createOriginalDeviceRootSplClaimLocalOperatorV2(config):deviceRoot?backend.createOriginalDeviceRootSolClaimLocalOperatorV2(config):backend.createOriginalSolClaimMobileLocalOperatorV1(config);acquisition.catch(()=>{});operator=await acquisition;
  if(closeRequested)await close();else{process.stdout.write(JSON.stringify({profile:operator.profile,descriptor:operator.descriptor,custody:operator.custody,nativeSelfCustody:false,automaticFunding:false,...(deviceRoot||deviceRootSpl||deviceRootExit||deviceRootSplExit||deviceRootSplSourceExit?{originalWindow:operator.originalWindow,nativeCustody:operator.nativeCustody}: {})})+'\n');
   // One exact local instruction. No selected target/action, resumption, retries
   // or funding on entry. The original pairing is retained before this line.
   process.stdin.setEncoding('utf8');let input='',funding=false,sourceBindingRequested=false,sourceBindingActive=false;
   process.stdin.on('data',chunk=>{if(input.length+chunk.length>64){stop();return;}input+=chunk;if(!input.includes('\n'))return;
    if((deviceRootExit||deviceRootSplExit||deviceRootSplSourceExit)&&!funding&&!sourceBindingActive&&input==='RESTART_ROOT_CLAIM_OBSERVATION_ONCE\n'){funding=true;void operator.restartOriginalObservation().then(result=>{if(!closeRequested)process.stdout.write(JSON.stringify({profile:operator.profile,descriptor:result.descriptor,observationOnly:true,sameOriginalRuntime:result.sameOriginalRuntime,keeperChildRestarted:result.keeperChildRestarted})+'\n');},()=>{process.stderr.write('NATIVE_CLAIM_LOCAL_OBSERVATION_RESTART_FAILED\n');stop();});return;}
    if(deviceRootSplSourceExit&&!funding&&!sourceBindingRequested&&input==='DELIVER_ORIGINAL_BTC_SOURCE_ONCE\n'){sourceBindingRequested=true;sourceBindingActive=true;input='';void operator.deliverOriginalBtcSourceOnce().then(result=>{sourceBindingActive=false;if(!closeRequested)process.stdout.write(JSON.stringify({profile:operator.profile,descriptor:operator.descriptor,originalWindow:operator.originalWindow,sourceCustody:result.sourceCustody,originalTargetQuote:result.quote,privateCreditEstablished:false})+'\n');},()=>{sourceBindingActive=false;process.stderr.write('NATIVE_CLAIM_LOCAL_ORIGINAL_SPL_SOURCE_UNKNOWN\n');stop();});return;}
    if(deviceRoot||deviceRootSpl||deviceRootExit||deviceRootSplExit||deviceRootSplSourceExit||funding||input!=='FUND_ORIGINAL_ONCE\n'){process.stderr.write('NATIVE_CLAIM_LOCAL_INPUT_REJECTED\n');stop();return;}funding=true;
    void operator.fundOriginalOnce().then(()=>{if(!closeRequested)process.stdout.write('NATIVE_CLAIM_LOCAL_ORIGINAL_ENDPOINT_READY\n');},()=>{process.stderr.write('NATIVE_CLAIM_LOCAL_FUND_OUTCOME_UNKNOWN\n');stop();});});
   process.stdin.once('end',stop);process.stdin.resume();}}
}catch{process.exitCode=1;try{await close();}catch{process.stderr.write('NATIVE_CLAIM_LOCAL_CLOSE_UNCONFIRMED\n');}process.stderr.write('NATIVE_CLAIM_LOCAL_START_FAILED\n');}
