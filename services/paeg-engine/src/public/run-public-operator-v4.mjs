/** Fixed public-testnet entry. Reopening never creates fresh keys or contracts. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,assertPrivateOperatorDirectoryV4,readPrivateOperatorFileV4,writePrivateOperatorFileV4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';
import {PARTIAL_BOOTSTRAP_REVIEW_FILE_V5,normalizePartialBootstrapReviewDataV5} from './partial-bootstrap-review-data-v5.mjs';
import {openCapturedPublicReadServerV4} from './public-read-server-v4.mjs';
import {openOriginalPublicFinancialEpochControlV5} from './financial-epoch-control-v5.mjs';
import {readCapturedOriginalPublicFinancialWindowV5} from './read-public-financial-window-v5.mjs';
import {readPendingPrebirthFinancialReviewV5,acknowledgeOriginalPrebirthFinancialReviewV5} from './prebirth-financial-control-v5.mjs';
import {continueCapturedOriginalPublicFinancialReviewV5} from './captured-financial-epoch-control-v5.mjs';

assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
const backend=await original('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
const transport=await original('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs');
const recovery=await original('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');
const acquisitionControl=new AbortController();
let configuration,ingress,acquisition,phoneAcquisition,product,closing,captureTimer,readOpening,readServer,transition,financialControl,financialDeadline,stopping=false;
const ignoreFinancialSignalBeforeReady=()=>{};process.on('SIGUSR1',ignoreFinancialSignalBeforeReady);
const emit=record=>process.stdout.write(JSON.stringify(record)+'\n');
const diagnosticRPCMethods=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
// Do not emit exception messages: configuration and filesystem errors can
// contain journal passwords, keys, or private operation details.
const failure=(stage,error)=>{const firstLine=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';const reason=/^[A-Z][A-Z0-9_]{1,120}$/.test(firstLine)?firstLine:'UNCLASSIFIED_ORIGINAL_FAILURE';const httpStatus=Number.isInteger(error?.httpStatus)&&error.httpStatus>=400&&error.httpStatus<=599?error.httpStatus:undefined;const rpcMethod=diagnosticRPCMethods.has(error?.rpcMethod)?error.rpcMethod:undefined;process.stderr.write(JSON.stringify({stage,code:'PAEG_PUBLIC_ORIGINAL_OPERATION_FAILED',reason,httpStatus,rpcMethod,automaticRebroadcast:false})+'\n');};
async function close(){
 stopping=true;acquisitionControl.abort();clearTimeout(captureTimer);return closing??=(async()=>{
  let controlledCapture=false,coldReopenFenced=false;
  if(acquisition)try{product=await acquisition;}catch{}
  if(phoneAcquisition)try{await phoneAcquisition;}catch{}
  await financialControl?.close();
  if(product){const result=await product.close();assert.ok(result.closed&&result.ownedServicesClosed&&result.externalChainsStopped===false&&result.automaticRebroadcast===false,'PAEG_PUBLIC_CLOSE_UNCONFIRMED');if(result.retainedOriginalState===true)controlledCapture=true;else{assert.ok(result.retainedOriginalState===false&&result.coldReopenFenced===true&&result.interruptedPhoneAcquisition===true,'PAEG_PUBLIC_CAPTURE_UNCONFIRMED');coldReopenFenced=true;}}
  if(transition)try{await transition;}catch{}
  if(readOpening)try{readServer=await readOpening;}catch{}
  await readServer?.close();
  if(ingress)transport.closeOriginalPagedRemoteIngressBindingV4(ingress);
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);process.removeListener('SIGUSR1',ignoreFinancialSignalBeforeReady);
  emit({stage:coldReopenFenced?'STOPPED_COLD_REOPEN_FENCED':'STOPPED',controlledCapture,coldReopenFenced,externalChainsStopped:false,automaticRebroadcast:false});
 })();
}
function stop(){void close().catch(error=>{process.exitCode=1;failure('CAPTURE',error);});}
async function beginReadOnly(){
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');let input;
 try{input={...JSON.parse(bytes.toString('utf8')),providerDirectory:configuration.providerDirectory};if(!stopping){readOpening=openCapturedPublicReadServerV4(root,input,ingress);readServer=await readOpening;}}
 finally{bytes.fill(0);if(input)input.journal.password=null;}
 if(!stopping&&readServer)emit({stage:'READY',profile:readServer.profile,origin:configuration.origin??'https://api.lianum.oryontechnology.com',sources:readServer.sources,financialPermissionsReopened:false,automaticRebroadcast:false});
}
function captureToReadOnly(){
 transition??=(async()=>{
  if(stopping)return;
  emit({stage:'CAPTURING_BEFORE_PERMISSION_EXPIRY',financialDeadlineExtended:false});
  await financialControl?.close();
  if(phoneAcquisition)await phoneAcquisition;
  const result=await product.close();assert.ok(result.retainedOriginalState&&result.ownedServicesClosed,'PAEG_PUBLIC_CAPTURE_UNCONFIRMED');
  if(!stopping)await beginReadOnly();
 })();
 void transition.catch(error=>{process.exitCode=1;failure('CAPTURE_TO_READ',error);stop();});
}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');
 try{configuration=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
 assert.equal(configuration.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);
 assert.equal(configuration.providerDirectory,join(PUBLIC_OPERATOR_STATE_V4,'provider'));
 assert.equal(configuration.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));
 assert.equal(configuration.journal.path,join(PUBLIC_OPERATOR_STATE_V4,'authority','journal.vault'));
 const [key,cert,publicCert]=await Promise.all(['server-key.pem','server-certificate.pem','public-api-certificate.pem'].map(name=>readPrivateOperatorFileV4(PUBLIC_TRANSPORT_DIRECTORY_V4,name)));
 try{if(!stopping)ingress=transport.createOriginalPagedRemoteIngressBindingV4({origin:'https://api.lianum.oryontechnology.com',host:'10.71.0.3',port:9445,privateTLS:{key:key.toString('utf8'),cert:cert.toString('utf8')},publicCertificatePEM:publicCert.toString('utf8')});}finally{key.fill(0);cert.fill(0);publicCert.fill(0);}
 let reopening=false;
 try{const marker=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'startup-attempt.json');try{const record=JSON.parse(marker.toString('utf8'));assert.deepEqual(record,{profile:'ORIGINAL_PAGED_PUBLIC_STARTUP_ATTEMPT_V4',devicePublicKey:configuration.devicePublicKey});reopening=true;}finally{marker.fill(0);}}catch(error){if(error.code!=='ENOENT')throw error;}
 if(stopping)await close();
 else{
  assert.ok(Number.isSafeInteger(configuration.sourcePolicy.expiresAt),'PAEG_PUBLIC_STORED_SPONSOR_DEADLINE');
  financialDeadline=configuration.sourcePolicy.expiresAt;
  let recoveryMode=null,partialReview=null;
  if(reopening){
   let supervisorPresent=true;try{await assertPrivateOperatorDirectoryV4(configuration.supervisorDirectory);}catch(error){if(error.code!=='ENOENT')throw error;supervisorPresent=false;}
   if(!supervisorPresent){
    let retainedPartial=false;try{const retained=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'partial-bootstrap-approval.vault');retained.fill(0);retainedPartial=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    if(retainedPartial){partialReview={operatorDirectory:PUBLIC_OPERATOR_STATE_V4,nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4};recoveryMode='RETAINED_PARTIAL_BOOTSTRAP_V5';}
    else{
    const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PARTIAL_BOOTSTRAP_REVIEW_FILE_V5);try{partialReview=normalizePartialBootstrapReviewDataV5(JSON.parse(bytes.toString('utf8')),true);}finally{bytes.fill(0);}
    assert.equal(partialReview.operatorDirectory,PUBLIC_OPERATOR_STATE_V4);assert.equal(partialReview.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);
    assert.match(partialReview.checkpointSHA256,/^[a-f0-9]{64}$/);assert.match(partialReview.operatorConfigurationSHA256,/^[a-f0-9]{64}$/);
    assert.ok(partialReview.approval.expiresAt>Date.now(),'PAEG_PARTIAL_REVIEW_EXPIRED');
    recoveryMode='REVIEWED_PARTIAL_BOOTSTRAP_V5';
    }
   }else{
    try{const review=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PARTIAL_BOOTSTRAP_REVIEW_FILE_V5);try{normalizePartialBootstrapReviewDataV5(JSON.parse(review.toString('utf8')));}finally{review.fill(0);}configuration={...configuration,providerDirectory:join(PUBLIC_OPERATOR_STATE_V4,'provider-replacement-v5')};}catch(error){if(error.code!=='ENOENT')throw error;}

   const selection=await recovery.readOriginalPagedPublicRecoveryModeV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});
   assert.equal(selection.profile,'ORIGINAL_PAGED_PUBLIC_RECOVERY_MODE_V4','PAEG_PUBLIC_ORIGINAL_RECOVERY_MODE');
   assert.ok(['CAPTURED','CAPTURED_FINANCIAL_REVIEW_V5','ACTIVE_DEAD_ANCHORED'].includes(selection.mode),'PAEG_PUBLIC_RECOVERY_FENCED');
   recoveryMode=selection.mode;
   if(['CAPTURED','CAPTURED_FINANCIAL_REVIEW_V5'].includes(recoveryMode)){await continueCapturedOriginalPublicFinancialReviewV5(configuration,acquisitionControl.signal);const updated=await recovery.readOriginalPagedPublicRecoveryModeV4({directory:configuration.supervisorDirectory,password:configuration.journal.password});assert.equal(updated.mode,'CAPTURED','PAEG_CAPTURED_FINANCIAL_REVIEW_UNFINISHED');recoveryMode=updated.mode;const window=await readCapturedOriginalPublicFinancialWindowV5(root,configuration);financialDeadline=window.effectiveExpiresAt;}
   }
   emit({stage:'RECOVERY_ROUTE_SELECTED',mode:recoveryMode,financialDeadlineExtended:false,automaticRebroadcast:false});
  }
  if(reopening&&recoveryMode==='CAPTURED'&&financialDeadline-30*60*1000<=Date.now()){
   assert.equal(recoveryMode,'CAPTURED','PAEG_PUBLIC_EXPIRED_ACTIVE_RECOVERY_FENCED');
   await beginReadOnly();if(stopping)await close();
  }else{
  if(!reopening)await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'startup-attempt.json',Buffer.from(JSON.stringify({profile:'ORIGINAL_PAGED_PUBLIC_STARTUP_ATTEMPT_V4',devicePublicKey:configuration.devicePublicKey})+'\n'));
  if(stopping)await close();else if(transition)await transition;else{
  // A crash after this fsync can only use Original retained checkpoints. An
  // interrupted bootstrap fails closed; it is never silently deployed again.
  const input=partialReview??(reopening?Object.fromEntries(['nativeDirectory','providerDirectory','supervisorDirectory','journal','devicePublicKey'].map(name=>[name,configuration[name]])):configuration);
  const openOriginal=partialReview?(recoveryMode==='RETAINED_PARTIAL_BOOTSTRAP_V5'?backend.reopenOriginalPagedPublicPartialNativeOperatorV5:backend.startOriginalPagedPublicPartialNativeOperatorV5):!reopening?backend.startOriginalPagedPublicNativeOperatorV4:recoveryMode==='CAPTURED'?backend.reopenOriginalPagedPublicNativeOperatorV4:backend.recoverOriginalPagedPublicNativeOperatorV4;
  const initialFinancialReview=await readPendingPrebirthFinancialReviewV5();
  if(partialReview&&initialFinancialReview){const openWithReview=recoveryMode==='RETAINED_PARTIAL_BOOTSTRAP_V5'?backend.reopenOriginalPagedPublicPartialNativeOperatorWithFinancialReviewV5:backend.startOriginalPagedPublicPartialNativeOperatorWithFinancialReviewV5;assert.equal(typeof openWithReview,'function','PAEG_PREBIRTH_ORIGINAL_OPENER_REQUIRED');acquisition=openWithReview(input,initialFinancialReview,ingress,acquisitionControl.signal);}else acquisition=openOriginal(input,ingress,acquisitionControl.signal);
  product=await acquisition;
  if(initialFinancialReview){const ack=await acknowledgeOriginalPrebirthFinancialReviewV5(product,initialFinancialReview);emit({stage:'INITIAL_SOURCE_FINANCIAL_EPOCH_CONFIRMED',...ack});}
  // Capture while the stored financial permission is still valid. Restarting
  // retains its deadline; it cannot silently grant another nine hours.
  const initialFinancialState=await backend.readOriginalPagedPublicNativeFinancialStateV5(product);financialDeadline=initialFinancialState.effectivePolicy.expiresAt;
  const captureAt=financialDeadline-30*60*1000;
  assert.ok(Number.isSafeInteger(captureAt),'PAEG_PUBLIC_STORED_SPONSOR_DEADLINE');
  if(captureAt>Date.now()){captureTimer=setTimeout(captureToReadOnly,captureAt-Date.now());captureTimer.unref();}
  if(stopping)await close();else if(transition)await transition;else if(captureAt<=Date.now()){captureToReadOnly();await transition;}else{
   const connection=backend.readOriginalPagedPublicNativeConnectionV4(product);
   // The paired descriptor and pin are public connection data, not custody.
   await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,Buffer.from(JSON.stringify(connection)+'\n'));
   let phone=transition?null:backend.readOriginalPagedPublicNativePhoneConnectionV4(product);
   if(!phone&&!stopping&&!transition){
    let requestBytes;
    try{requestBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'phone-source-request.json');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(requestBytes){try{const request=JSON.parse(requestBytes.toString('utf8'));assert.equal(request.journalPath,join(PUBLIC_OPERATOR_STATE_V4,'authority-phone','journal.vault'));assert.notEqual(request.devicePublicKey,configuration.devicePublicKey);assert.equal(request.minimumDepositAtomic,configuration.deployment.minimumDepositAtomic);if(!stopping&&!transition){phoneAcquisition=backend.createOriginalPagedPublicNativePhoneSourceV4(product,request,acquisitionControl.signal);phone=await phoneAcquisition;}}finally{requestBytes.fill(0);}}
   }
   if(phone&&!stopping&&!transition)await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,Buffer.from(JSON.stringify(phone)+'\n'),'paired-phone-connection.json');
   if(!stopping&&!transition)financialControl=await openOriginalPublicFinancialEpochControlV5(product,async expiresAt=>{assert.ok(!stopping&&!transition,'PAEG_FINANCIAL_CAPTURE_ALREADY_STARTED');assert.ok(Number.isSafeInteger(expiresAt)&&expiresAt>0,'PAEG_FINANCIAL_CAPTURE_WINDOW');clearTimeout(captureTimer);financialDeadline=expiresAt;captureTimer=setTimeout(captureToReadOnly,Math.max(0,financialDeadline-30*60*1000-Date.now()));captureTimer.unref();});
   if(stopping)await close();else if(transition)await transition;else if(financialDeadline-30*60*1000<=Date.now())captureToReadOnly();else emit({stage:'READY',profile:product.profile,origin:product.origin,reopenedOriginalState:product.reopenedOriginalState,sources:phone?2:1,publicConnectionPath:join(PUBLIC_OPERATOR_STATE_V4,'paired-connection.json'),phoneConnectionPath:phone?join(PUBLIC_OPERATOR_STATE_V4,'paired-phone-connection.json'):null,publicReceiver:product.publicReceiver,automaticFunding:false,automaticRebroadcast:false});
  }
  }
  }
 }
}catch(error){
 process.exitCode=1;failure('STARTUP',error);try{await close();}catch(captureError){failure('CAPTURE',captureError);}
}finally{if(configuration)configuration.journal.password=null;}
