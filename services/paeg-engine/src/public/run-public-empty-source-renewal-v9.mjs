/** Explicit finite operator review and EMPTY Source4/7 replacement through the
 * same live Original composition. No Native-only recovery or synthetic state. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4,publishOriginalPublicConnectionFileV4} from './public-operator-state-v4.mjs';
import {readPublicUniswapModeV6} from './public-uniswap-mode-v6.mjs';
import {publicSepoliaDefiConfigurationV8,readPublicSepoliaDefiCheckpointV8,publishCapturedPublicSepoliaDefiV8} from './public-sepolia-defi-mode-v8.mjs';
import {publishPrivateFinancialStateDataV5} from './financial-epoch-control-v5.mjs';
import {normalizeEmptySourceRenewalIntentDataV9,prepareEmptySourceFinancialReviewDataV9} from './empty-source-financial-review-v9.mjs';

const periodOnly=process.argv[2]==='--period-only';assert.ok(process.argv.length===2||process.argv.length===3&&periodOnly);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=1024']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=p=>import(pathToFileURL(join(root,p)).href),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
const intentName='empty-source-renewal-intent-v9.json';
let configuration,defiInput,product,ingress,stopping=false;
const stop=()=>{stopping=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
const current=()=>assert.ok(!stopping,'PAEG_EMPTY_RENEWAL_STOPPED');
async function privateJSON(name){const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name);try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}
async function createSamePrivateJSON(name,value){const bytes=Buffer.from(JSON.stringify(value)+'\n');try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,name,bytes);}catch(error){if(error.code!=='EEXIST')throw error;assert.deepEqual(await privateJSON(name),value,'PAEG_EMPTY_RENEWAL_RECEIPT_CHANGED');}finally{bytes.fill(0);}}
async function sourceData(){const F=await load('packages/backend/src/operations/recovery/paged-source-read-files-v4.mjs');return(await F.readPagedSourcePrivateJSONV4(join(PUBLIC_NATIVE_DIRECTORY_V4,'source-operations','native-wallet.json'),33554432)).data;}
try{
 configuration=await privateJSON('operator.json');assert.equal(configuration.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);assert.equal(configuration.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));assert.equal(configuration.journal.path,join(PUBLIC_OPERATOR_STATE_V4,'authority','journal.vault'));assert.equal(configuration.providerDirectory,join(PUBLIC_OPERATOR_STATE_V4,'provider'));
 const oldBootstrap=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'partial-bootstrap-review-v5.json');oldBootstrap.fill(0);configuration.providerDirectory=join(PUBLIC_OPERATOR_STATE_V4,'provider-replacement-v5');
 const intent=normalizeEmptySourceRenewalIntentDataV9(await privateJSON(intentName)),sourceBefore=await sourceData();
 assert.equal(sourceBefore.operations.length,31,'PAEG_EMPTY_RENEWAL_FIXED_INSTALLATION');assert.ok(sourceBefore.operations.every(r=>r.phase==='FINALIZED'),'PAEG_EMPTY_RENEWAL_SOURCE_PENDING');assert.equal(sha(sourceBefore.operations),intent.sourceRowsSHA256,'PAEG_EMPTY_RENEWAL_SOURCE_CHANGED');
 const dispatchPath=join(PUBLIC_NATIVE_DIRECTORY_V4,'dispatch-journal','native-wallet.json'),dispatchBefore=JSON.parse(await readFile(dispatchPath,'utf8'));assert.deepEqual(dispatchBefore.operations,[],'PAEG_EMPTY_RENEWAL_DISPATCH_PENDING');
 const phone=await privateJSON('paired-phone-connection.json'),previousRoot=await privateJSON('paired-connection.json'),phoneKey=phone.descriptor.devicePublicKey,uniswap=await readPublicUniswapModeV6(root,configuration);assert.ok(uniswap,'PAEG_EMPTY_RENEWAL_UNISWAP_REQUIRED');
 const checkpoint=await readPublicSepoliaDefiCheckpointV8(root,configuration,phoneKey);assert.ok(['CAPTURED','OPENING','ACTIVE'].includes(checkpoint.phase),'PAEG_EMPTY_RENEWAL_PHASE');defiInput=publicSepoliaDefiConfigurationV8(configuration,phoneKey,checkpoint.phase==='ACTIVE'?'ACTIVE_DEAD':checkpoint.phase);
 const B=await load('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs'),T=await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs');
 const [key,cert,publicCert]=await Promise.all(['server-key.pem','server-certificate.pem','public-api-certificate.pem'].map(name=>readPrivateOperatorFileV4(PUBLIC_TRANSPORT_DIRECTORY_V4,name)));
 try{ingress=T.createOriginalPagedRemoteIngressBindingV4({origin:'https://api.lianum.oryontechnology.com',host:'10.71.0.3',port:9445,privateTLS:{key:key.toString('utf8'),cert:cert.toString('utf8')},publicCertificatePEM:publicCert.toString('utf8')});}finally{key.fill(0);cert.fill(0);publicCert.fill(0);}
 const opener=uniswap.state.phase==='CAPTURED'?B.reopenOriginalPagedPublicUniswapMixedWithDefiOperatorV8:uniswap.state.phase==='OPENING'?B.resumeOriginalPagedPublicUniswapMixedOpeningWithDefiOperatorV8:uniswap.state.phase==='ACTIVE'?B.recoverOriginalPagedPublicUniswapActiveWithDefiOperatorV8:null;assert.equal(typeof opener,'function','PAEG_EMPTY_RENEWAL_ORIGINAL_OPENER');
 current();emit({stage:'EMPTY_SOURCE_ORIGINAL_COMPOSITION_OPENING',financialTransactions:0});product=await opener(uniswap.input,ingress,defiInput);defiInput.password=null;current();
 assert.deepEqual(B.readOriginalPagedPublicNativeConnectionV4(product),previousRoot,'PAEG_EMPTY_RENEWAL_ROOT_CHANGED');assert.deepEqual(B.readOriginalPagedPublicNativePhoneConnectionV4(product),phone,'PAEG_EMPTY_RENEWAL_PHONE_CHANGED');
 const before=await B.readOriginalPagedPublicNativeFinancialStateV5(product),reviewName='empty-source-financial-review-'+intent.intentId+'.json';let retained=null;try{retained=await privateJSON(reviewName);}catch(error){if(error.code!=='ENOENT')throw error;}
 const review=prepareEmptySourceFinancialReviewDataV9(before,intent,retained);await createSamePrivateJSON(reviewName,review);assert.deepEqual(await privateJSON(intentName),intent,'PAEG_EMPTY_RENEWAL_INTENT_CHANGED');current();
 const after=await B.authorizeOriginalPagedPublicNativeFinancialEpochV5(product,review);assert.equal(after.epoch?.nonce,intent.intentId,'PAEG_EMPTY_RENEWAL_ORIGINAL_EPOCH_REQUIRED');assert.deepEqual(after.effectivePolicy,review.policy);assert.deepEqual(after.limits,review.limits);assert.deepEqual(after.reserved,before.reserved,'PAEG_EMPTY_RENEWAL_RESERVATIONS_CHANGED');assert.deepEqual((await sourceData()).operations,sourceBefore.operations,'PAEG_EMPTY_RENEWAL_FINANCIAL_SEND');
 const ack={profile:'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5',intentId:review.intentId,epochId:after.epoch.epochId,epoch:after.epoch.epoch,expiresAt:after.effectivePolicy.expiresAt,financialStepsStarted:false};await createSamePrivateJSON('financial-epoch-ack-'+review.intentId+'.json',ack);await publishPrivateFinancialStateDataV5(after);current();
 const renewal=periodOnly?null:await B.renewOriginalPagedPublicEmptyMixedSourcesV9(product);if(renewal){assert.equal(renewal.profile,'ORIGINAL_PAGED_PUBLIC_EMPTY_MIXED_RENEWAL_V9');assert.equal(renewal.financialTransactions,0);assert.deepEqual(renewal.renewedSources.map(s=>s.role).sort(),['DEFI_SOURCE7','UNISWAP_SOURCE4']);}
 const mixed=B.readOriginalPagedPublicUniswapMixedConnectionV5(product),flat=B.readOriginalPagedPublicUniswapFlatConnectionV5(product),connections=await B.readOriginalPagedPublicSepoliaDefiConnectionsV8(product);current();
 const captured=await product.close();assert.ok(captured.retainedOriginalState&&captured.ownedServicesClosed,'PAEG_EMPTY_RENEWAL_CAPTURE_REQUIRED');
 const sourceAfter=await sourceData(),dispatchAfter=JSON.parse(await readFile(dispatchPath,'utf8'));assert.deepEqual(sourceAfter.operations,sourceBefore.operations,'PAEG_EMPTY_RENEWAL_FINANCIAL_SEND');assert.deepEqual({...dispatchAfter,revision:dispatchBefore.revision},dispatchBefore,'PAEG_EMPTY_RENEWAL_DISPATCH_CHANGED');assert.equal(dispatchAfter.revision,dispatchBefore.revision+1,'PAEG_EMPTY_RENEWAL_DISPATCH_CAPTURE');
 for(const [name,value]of [['paired-uniswap-connection.json',mixed],['paired-uniswap-flat-connection.json',flat]]){const bytes=Buffer.from(JSON.stringify(value)+'\n');try{await publishOriginalPublicConnectionFileV4(PUBLIC_OPERATOR_STATE_V4,bytes,name);}finally{bytes.fill(0);}}
 await publishCapturedPublicSepoliaDefiV8(root,configuration,phoneKey,connections);
 const receipt={profile:periodOnly?'ORIGINAL_PUBLIC_OPERATOR_PERIOD_RENEWAL_RECEIPT_V9':'ORIGINAL_PUBLIC_EMPTY_SOURCE_RENEWAL_RECEIPT_V9',intentId:intent.intentId,expiresAt:after.effectivePolicy.expiresAt,roles:renewal?.renewedSources.map(s=>s.role).sort()??[],sourceRows:sourceAfter.operations.length,sourceRowsSHA256:sha(sourceAfter.operations),financialTransactions:0,rootAndPhonePreserved:true};await createSamePrivateJSON((periodOnly?'empty-source-period-ack-':'empty-source-renewal-ack-')+intent.intentId+'.json',receipt);emit({stage:periodOnly?'OPERATOR_PERIOD_RENEWED_AND_CAPTURED':'EMPTY_SOURCES_RENEWED_AND_CAPTURED',...receipt});
}catch(error){
 process.exitCode=1;const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';emit({stage:'EMPTY_SOURCE_RENEWAL_FAILED',reason:/^[A-Z][A-Z0-9_]{1,120}$/.test(first)?first:'ORIGINAL_RENEWAL_REJECTED',errorClass:['TypeError','ReferenceError','AssertionError','RangeError','SyntaxError','AggregateError','Error'].includes(error?.name)?error.name:null,locations:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,8).map(line=>line.match(/([a-z0-9-]+\.mjs:\d+:\d+)\)?$/i)?.[1]).filter(Boolean),automaticRetry:false});
}finally{
 try{await product?.close();}catch{process.exitCode=1;emit({stage:'EMPTY_SOURCE_CAPTURE_UNCONFIRMED',automaticRetry:false});}
 if(ingress)(await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs')).closeOriginalPagedRemoteIngressBindingV4(ingress);
 if(configuration)configuration.journal.password=null;if(defiInput)defiInput.password=null;process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
}
