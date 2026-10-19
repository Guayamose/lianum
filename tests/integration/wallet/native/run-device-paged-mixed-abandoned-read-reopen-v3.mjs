/** Real LOCAL runtimes and a new backend PID after an abandoned original READ.
 * No phone identity, note deposit, proof or payment participates in this check. */
import assert from 'node:assert/strict';
import {mkdir,readFile,open,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,createHash,randomBytes,randomUUID,sign,verify} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {assertOriginalPagedNativeFinancialSourceV3} from '@lianum/backend/operations/local/funded-paged-native-source-v3';
import {PAEG_PAGED_ARTIFACT_DIRECTORY_V3,loadFundedPagedGraphArtifactsV3} from '@lianum/proofs/tooling/original-paged-artifacts-v3';
import {createDevicePagedOwnerApiV3} from '../../../../apps/mobile/src/api/device-paged-owner-api-v3.mjs';
import {openOriginalPagedMixedBackendProcessV3} from './device-paged-mixed-backend-client-v3.mjs';
import {openOriginalPagedMixedBackendTransportV3} from './device-paged-mixed-backend-transport-v3.mjs';
import {createOriginalPagedMixedLocalTlsV3} from './device-paged-financial-local-tls-v3.mjs';

const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url)));
assert.equal(process.argv.length,2);
assert.equal(process.argv[1],fileURLToPath(import.meta.url));
assert.equal(await realpath(process.argv[1]),process.argv[1]);
assert.equal(process.execPath,join(root,'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'));
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const generation=assertOriginalPagedNativeFinancialSourceV3();
const parent=join(root,'.local/device-paged-mixed-v3');await mkdir(parent,{recursive:true,mode:0o700});
const attempt=join(parent,'attempt-'+randomUUID());await mkdir(attempt,{mode:0o700});
let tls=await createOriginalPagedMixedLocalTlsV3(attempt);
await mkdir(join(attempt,'authority'),{mode:0o700});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifestSHA256=hash(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'manifest.json')));
const consumerSHA256=hash(await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json')));
loadFundedPagedGraphArtifactsV3(manifestSHA256);
// A public test identity only. Never substitute this for Android custody.
const pair=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),publicJwk=pair.publicKey.export({format:'jwk'});
let signingKey=pair.privateKey;
const devicePublicKey='04'+Buffer.from(publicJwk.x,'base64url').toString('hex')+Buffer.from(publicJwk.y,'base64url').toString('hex');
const configuration={deployment:{minimumDepositAtomic:'1',manifestSHA256,consumerSHA256,deploymentDomain:'0x'+randomBytes(32).toString('hex'),policy:'0x'+randomBytes(32).toString('hex')},
 journal:{path:join(attempt,'authority/account.aead'),password:randomBytes(32).toString('hex')},
 nativeDirectory:join(attempt,'provider'),origin:'https://127.0.0.1:7454',devicePublicKey,tls,host:'127.0.0.1'};
const path=join(attempt,'operator.json'),file=await open(path,'wx',0o600);
try{await file.writeFile(JSON.stringify(configuration));await file.sync();}finally{await file.close();configuration.journal.password=null;configuration.tls=null;}
let backend,backendAcquisition,api,transport,result=null,error=null,closure=null,stopping=false;
const signals=[];
const failure=cause=>({code:/^[A-Z][A-Z0-9_]{1,100}$/.test(cause?.code??'')?cause.code:/^[A-Z][A-Z0-9_]{1,100}$/.test(cause?.message??'')?cause.message:'UNCLASSIFIED',
 originalCode:cause?.originalFailure?.code??null});
function progress(stage,details={}){process.stdout.write(JSON.stringify({stage,...details})+'\n');}
function readDraft(){return {action:'READ_STATE',jobId:'abandoned-read-'+randomUUID(),rootId:randomBytes(32).toString('hex'),revision:1,mode:null,publicInputs:null,witnessSHA256:null,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};}
function signTestRead(consent){
 const message=P.devicePagedPermissionMessageV3(consent),signature=sign('sha256',message,{key:signingKey,dsaEncoding:'ieee-p1363'});
 try{
  // OpenSSL may return high-S; the genuine OWNER channel requires low-S.
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));
  if(s>order/2n)Buffer.from((order-s).toString(16).padStart(64,'0'),'hex').copy(signature,32);
  assert.ok(verify('sha256',message,{key:pair.publicKey,dsaEncoding:'ieee-p1363'},signature),'TEST_ORIGINAL_OWNER_SIGNATURE');
  return signature.toString('hex');
 }finally{message.fill(0);signature.fill(0);}
}
async function releaseRead(){await api?.close();api=null;await transport?.close();transport=null;}
async function abandonedRead(){
 transport=openOriginalPagedMixedBackendTransportV3(backend,tls);
 api=createDevicePagedOwnerApiV3({descriptor:backend.descriptor,fetchImpl:transport.fetchImpl});
 const consent=await api.challenge(readDraft());assert.equal(consent.action,'READ_STATE');assert.equal(consent.recipient,null);
 const expiresAt=consent.expiresAt;await releaseRead();return {expiresAt,operationsSubmitted:0};
}
async function readOriginalEmptyState(){
 transport=openOriginalPagedMixedBackendTransportV3(backend,tls);
 api=createDevicePagedOwnerApiV3({descriptor:backend.descriptor,fetchImpl:transport.fetchImpl});
 const consent=await api.challenge(readDraft());
 const signature=signTestRead(consent);
 const status=await api.submit(consent,signature);
 assert.deepEqual(status.jobs,[],'ABANDONED_READ_NO_JOBS');assert.equal(status.note,null,'ABANDONED_READ_NO_NOTE');
 await releaseRead();return {jobs:0,note:null};
}
let closing;
async function close(){return closing??=(async()=>{if(backendAcquisition)backend??=await backendAcquisition;await releaseRead();if(backend)await backend.close();})();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{signals.push(signal);stopping=true;void close().catch(()=>{process.exitCode=1;});});
try{
 progress('STARTING_REAL_MIXED_BACKEND',{physicalPhone:false,noteDeposits:0,payments:0});
 backendAcquisition=openOriginalPagedMixedBackendProcessV3(path);backend=await backendAcquisition;assert.equal(stopping,false);
 const before=backend.data(),stateBefore=await readOriginalEmptyState(),headBefore=await backend.query('block'),account=before.receiverAccounts[0],balanceBefore=await backend.query('balance',[account]);
 progress('REAL_BACKEND_READY',{pid:before.pid});
 const abandoned=await abandonedRead();const captureStarted=performance.now();
 progress('ABANDONED_ORIGINAL_READ',{operationsSubmitted:0});
 const restart=await backend.restart();assert.equal(stopping,false);
 const after=backend.data(),stateAfter=await readOriginalEmptyState(),headAfter=await backend.query('block'),balanceAfter=await backend.query('balance',[account]);
 assert.deepEqual(stateAfter,stateBefore,'ABANDONED_READ_REOPEN_SAME_OWNER_STATE');
 assert.equal(headAfter.hash,headBefore.hash,'ABANDONED_READ_REOPEN_SAME_HEAD');
 assert.equal(headAfter.number,headBefore.number,'ABANDONED_READ_REOPEN_SAME_HEIGHT');
 assert.equal(balanceAfter,balanceBefore,'ABANDONED_READ_REOPEN_SAME_BALANCE');
 assert.equal(after.descriptor.devicePublicKey,devicePublicKey);
 assert.notEqual(after.pid,before.pid);assert.equal(after.reopenedOriginalState,true);
 progress('REAL_CAPTURE_AND_REOPEN_CONFIRMED',{sameHead:true,sameBalance:true,sameOwnerState:true,oldBackendPID:before.pid,newBackendPID:after.pid,oldOwnedProcessesStopped:restart.oldOwnedProcessesStopped});
 // Also leave a fresh original READ before the final orderly shutdown.
 const second=await abandonedRead();await close();
 closure={backendExited:true,transportDrained:true};
 result={abandonedRead:abandoned,secondAbandonedRead:second,restart,captureAndReopenElapsedMs:Math.round(performance.now()-captureStarted),sameHead:true,sameBalance:true,sameOwnerState:true,newConsentAfterReopen:true,
  physicalPhone:false,noteDeposits:0,proofsRequested:0,payments:0,readOperationsSubmitted:2,financialOperationsSubmitted:0,financialAcceptance:false};
}catch(cause){error=failure(cause);process.exitCode=1;}
finally{
 try{await close();closure??={backendExited:!!backend,transportDrained:true};}catch(cause){closure={backendExited:false,transportDrained:false,error:failure(cause)};process.exitCode=1;}
 tls=null;signingKey=null;
 const accepted=result!==null&&error===null&&closure.backendExited&&signals.length===0;
 const report={profile:'ORIGINAL_PAGED_MIXED_ABANDONED_READ_REAL_REOPEN_V3',sourceGeneration:generation.generationSHA256??generation.generation??null,result,error,closure,signals,
  accepted,physicalPhone:false,financialAcceptance:false,previousPhysicalRealmChanged:false,publicNetwork:false};
 const output=await open(join(attempt,'result.json'),'wx',0o600);try{await output.writeFile(JSON.stringify(report));await output.sync();}finally{await output.close();}
 progress(accepted?'REAL_ABANDONED_READ_REOPEN_PASS':'REAL_ABANDONED_READ_REOPEN_FAIL',{report:join(attempt,'result.json'),code:error?.code??null,originalCode:error?.originalCode??null});
 if(!accepted)process.exitCode=1;
}
