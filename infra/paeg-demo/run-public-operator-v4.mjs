/** Fixed public-testnet entry. Reopening never creates fresh keys or contracts. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';
import {openCapturedPublicReadServerV4} from './public-read-server-v4.mjs';

assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=path=>import(pathToFileURL(join(root,path)).href);
const backend=await original('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
const transport=await original('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs');
const acquisitionControl=new AbortController();
let configuration,ingress,acquisition,phoneAcquisition,product,closing,captureTimer,readOpening,readServer,transition,stopping=false;
const emit=record=>process.stdout.write(JSON.stringify(record)+'\n');
// Do not emit exception messages: configuration and filesystem errors can
// contain journal passwords, keys, or private operation details.
const failure=stage=>process.stderr.write(JSON.stringify({stage,code:'PAEG_PUBLIC_ORIGINAL_OPERATION_FAILED',automaticRebroadcast:false})+'\n');
async function close(){
 stopping=true;acquisitionControl.abort();clearTimeout(captureTimer);return closing??=(async()=>{
  let controlledCapture=false,coldReopenFenced=false;
  if(acquisition)try{product=await acquisition;}catch{}
  if(phoneAcquisition)try{await phoneAcquisition;}catch{}
  if(product){const result=await product.close();assert.ok(result.closed&&result.ownedServicesClosed&&result.externalChainsStopped===false&&result.automaticRebroadcast===false,'PAEG_PUBLIC_CLOSE_UNCONFIRMED');if(result.retainedOriginalState===true)controlledCapture=true;else{assert.ok(result.retainedOriginalState===false&&result.coldReopenFenced===true&&result.interruptedPhoneAcquisition===true,'PAEG_PUBLIC_CAPTURE_UNCONFIRMED');coldReopenFenced=true;}}
  if(transition)try{await transition;}catch{}
  if(readOpening)try{readServer=await readOpening;}catch{}
  await readServer?.close();
  if(ingress)transport.closeOriginalPagedRemoteIngressBindingV4(ingress);
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  emit({stage:coldReopenFenced?'STOPPED_COLD_REOPEN_FENCED':'STOPPED',controlledCapture,coldReopenFenced,externalChainsStopped:false,automaticRebroadcast:false});
 })();
}
function stop(){void close().catch(()=>{process.exitCode=1;failure('CAPTURE');});}
async function beginReadOnly(){
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');let input;
 try{input=JSON.parse(bytes.toString('utf8'));if(!stopping){readOpening=openCapturedPublicReadServerV4(root,input,ingress);readServer=await readOpening;}}
 finally{bytes.fill(0);if(input)input.journal.password=null;}
 if(!stopping&&readServer)emit({stage:'READY',profile:readServer.profile,origin:configuration.origin??'https://api.lianum.oryontechnology.com',sources:readServer.sources,financialPermissionsReopened:false,automaticRebroadcast:false});
}
function captureToReadOnly(){
 transition??=(async()=>{
  if(stopping)return;
  emit({stage:'CAPTURING_BEFORE_PERMISSION_EXPIRY',financialDeadlineExtended:false});
  if(phoneAcquisition)await phoneAcquisition;
  const result=await product.close();assert.ok(result.retainedOriginalState&&result.ownedServicesClosed,'PAEG_PUBLIC_CAPTURE_UNCONFIRMED');
  if(!stopping)await beginReadOnly();
 })();
 void transition.catch(()=>{process.exitCode=1;failure('CAPTURE_TO_READ');stop();});
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
  if(reopening&&configuration.sourcePolicy.expiresAt-30*60*1000<=Date.now()){
   await beginReadOnly();if(stopping)await close();
  }else{
  if(!reopening)await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'startup-attempt.json',Buffer.from(JSON.stringify({profile:'ORIGINAL_PAGED_PUBLIC_STARTUP_ATTEMPT_V4',devicePublicKey:configuration.devicePublicKey})+'\n'));
  if(stopping)await close();else if(transition)await transition;else{
  // A crash after this fsync can only use Original retained checkpoints. An
  // interrupted bootstrap fails closed; it is never silently deployed again.
  const input=reopening?Object.fromEntries(['nativeDirectory','providerDirectory','supervisorDirectory','journal','devicePublicKey'].map(name=>[name,configuration[name]])):configuration;
  acquisition=(reopening?backend.reopenOriginalPagedPublicNativeOperatorV4:backend.startOriginalPagedPublicNativeOperatorV4)(input,ingress,acquisitionControl.signal);product=await acquisition;
  // Capture while the stored financial permission is still valid. Restarting
  // retains its deadline; it cannot silently grant another nine hours.
  const captureAt=configuration.sourcePolicy.expiresAt-30*60*1000;
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
   if(stopping)await close();else if(transition)await transition;else if(captureAt<=Date.now())captureToReadOnly();else emit({stage:'READY',profile:product.profile,origin:product.origin,reopenedOriginalState:product.reopenedOriginalState,sources:phone?2:1,publicConnectionPath:join(PUBLIC_OPERATOR_STATE_V4,'paired-connection.json'),phoneConnectionPath:phone?join(PUBLIC_OPERATOR_STATE_V4,'paired-phone-connection.json'):null,publicReceiver:product.publicReceiver,automaticFunding:false,automaticRebroadcast:false});
  }
  }
  }
 }
}catch{
 process.exitCode=1;failure('STARTUP');try{await close();}catch{failure('CAPTURE');}
}finally{if(configuration)configuration.journal.password=null;}
