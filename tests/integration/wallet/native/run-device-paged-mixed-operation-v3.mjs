/** Explicit one-run entry. It always uses one canonical source namespace and
 * the existing private local TLS configuration. No public spending/deployment. */
import assert from 'node:assert/strict';
import {open,lstat,realpath,mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {assertOriginalPagedNativeFinancialSourceV3} from '../../../../packages/backend/src/operations/local/funded-paged-native-source-v3.mjs';
import {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import {createOriginalPagedMixedLocalTlsV3} from './device-paged-financial-local-tls-v3.mjs';

const entry=fileURLToPath(import.meta.url),project=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
assert.equal(process.argv.length,2);assert.equal(process.argv[1],entry);assert.equal(await realpath(entry),entry);
assert.equal(entry,join(project,'tests/integration/wallet/native/run-device-paged-mixed-operation-v3.mjs'));
assert.equal(process.execPath,join(project,'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'));
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const generation=assertOriginalPagedNativeFinancialSourceV3();
const modules=Object.freeze({host:'tests/integration/wallet/native/device-paged-mobile-host-v3.mjs',operator:'packages/backend/src/operations/local/funded-paged-native-operator-v3.mjs',flow:'tests/integration/wallet/native/device-paged-three-network-operation-v3.mjs'});
async function canonicalModule(role){
 assert.ok(Object.hasOwn(modules,role));const path=join(project,modules[role]);assert.equal(await realpath(path),path,'PAGED_THREE_NETWORK_CANONICAL_IMPORT');
 assertOriginalPagedNativeFinancialSourceV3();const api=await import(pathToFileURL(path).href);assertOriginalPagedNativeFinancialSourceV3();return api;
}
// Dedicated fresh software-only transport. Prior TLS/phone configurations and
// economic namespaces remain untouched. This profile has no caller TLS override.
const config={host:'127.0.0.1',origin:'https://127.0.0.1:7450',policy:'0x'+randomBytes(32).toString('hex'),deploymentDomain:'0x'+randomBytes(32).toString('hex'),tls:null};let originalTLS=null;
const directory=join(project,'.local/device-paged-mixed-v3');await mkdir(directory,{recursive:true,mode:0o700});
const directoryStat=await lstat(directory);assert.ok(directoryStat.isDirectory()&&!directoryStat.isSymbolicLink()&&directoryStat.uid===process.getuid()&&(directoryStat.mode&0o777)===0o700);assert.equal(await realpath(directory),directory);
const attempt=join(directory,'attempt-'+randomUUID());await mkdir(attempt,{mode:0o700});
let host,product,runWork,result=null,error=null,closure=null,closing,acquisition=Promise.resolve(),stopping=false;const signals=[];
const errorMetadata=error=>({name:error?.name??'Error',code:/^[A-Z][A-Z0-9_]{3,100}$/.test(error?.code??'')?error.code:/^[A-Z][A-Z0-9_]{3,100}$/.test(error?.message??'')?error.message:null,rpcCode:/^-?\d{1,8}$/.test(String(error?.rpcCode??''))?String(error.rpcCode):null,clockGapMs:error?.code==='MOBILE_PAGED_CLOCK_FUTURE'&&Number.isSafeInteger(error?.clockGapMs)&&error.clockGapMs>=0&&error.clockGapMs<=3600000?error.clockGapMs:null,frames:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,6).map(line=>line.trim())});
const live=()=>assert.ok(!stopping,'PAGED_THREE_NETWORK_ENTRY_CLOSED');
const acquire=work=>{live();const started=Promise.resolve().then(()=>{live();return work();});acquisition=started;return started;};
function close(){
 stopping=true;
 return closing??=(async()=>{
  await acquisition.catch(()=>{});const productClose=product?.close();
  await Promise.allSettled([runWork??Promise.resolve()]);
  const closed=await Promise.allSettled([productClose??Promise.resolve(null),host?.close()??Promise.resolve()]);
  closure={operator:closed[0].status==='fulfilled'?closed[0].value:null,hostClosed:closed[1].status==='fulfilled',errors:closed.filter(row=>row.status==='rejected').map(row=>errorMetadata(row.reason))};
 })();
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{signals.push(signal);void close().finally(()=>{process.exitCode=1;});});
try{
 config.tls=await createOriginalPagedMixedLocalTlsV3(attempt);originalTLS=structuredClone(config.tls);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),manifestSHA256=sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'manifest.json'))),consumerSHA256=sha(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json')));
 loadFundedPagedGraphArtifactsV3(manifestSHA256);
 const {openOriginalPagedMobileHostV3}=await canonicalModule('host'),{startOriginalPagedMixedNativeOperatorV3}=await canonicalModule('operator');
 host=await acquire(()=>openOriginalPagedMobileHostV3(attempt));live();
 product=await acquire(()=>startOriginalPagedMixedNativeOperatorV3({deployment:{manifestSHA256,consumerSHA256,deploymentDomain:config.deploymentDomain,policy:config.policy},journal:{path:join(attempt,'account.aead'),password:randomBytes(32).toString('hex')},nativeDirectory:join(attempt,'provider'),origin:config.origin,devicePublicKey:host.devicePublicKey,tls:config.tls,host:config.host}));live();
 const {runOriginalPagedMixedOperationV3}=await canonicalModule('flow');live();runWork=runOriginalPagedMixedOperationV3(product,host,originalTLS);result=await runWork;live();
}catch(cause){error=errorMetadata(cause);process.exitCode=1;}
finally{
 config.tls=null;await close();if(originalTLS){originalTLS.key=null;originalTLS.cert=null;}
 const report={profile:'ORIGINAL_PAGED_MIXED_UNISWAP_THREE_NETWORK_ACCEPTANCE_V3',sourceGeneration:generation.generationSHA256??generation.generation??null,result,error,closure,signals,
  originalResourcesClosed:product?closure?.operator?.originalResourcesStopped===true&&closure.hostClosed&&closure.errors.length===0:null};
 const file=await open(join(attempt,'result.json'),'wx',0o600);try{await file.writeFile(JSON.stringify(report));await file.sync();}finally{await file.close();}
 const completed=!!result&&report.originalResourcesClosed===true&&signals.length===0&&error===null;if(!completed)process.exitCode=1;
 process.stdout.write(completed?'PAGED_MIXED_OPERATION_COMPLETED\n':'PAGED_MIXED_OPERATION_REJECTED\n');
}
