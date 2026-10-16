/** Recover an installed Original Mixed product using the same retained plans.
 * No fresh deployment or wallet financial action is admitted. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {publicUniswapConfigurationV6} from './public-uniswap-mode-v6.mjs';
import {createHash} from 'node:crypto';
import {assertPreservedSourceCaptureV7} from './assert-source-capture-v7.mjs';
import {FINANCIAL_EPOCH_REVIEW_FILE_V5,publishPrivateFinancialStateDataV5} from './financial-epoch-control-v5.mjs';


assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=1024']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=path=>import(pathToFileURL(join(root,path)).href),emit=data=>process.stdout.write(JSON.stringify(data)+'\n');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
// Same exact review shape/policy normalizer/quota bounds as the live control,
// narrowed here to the one explicitly reviewed existing installation.
function retainedFinancialReview(raw,normalizePolicy){
 const exact=(value,fields)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'PAEG_FINANCIAL_REVIEW_OBJECT');assert.deepEqual(Object.keys(value).sort(),fields.slice().sort(),'PAEG_FINANCIAL_REVIEW_FIELDS');};
 exact(raw,['intentId','expectedCheckpoint','expectedEpochId','policy','limits']);assert.ok(hex(raw.intentId)&&(raw.expectedEpochId===null||hex(raw.expectedEpochId)),'PAEG_FINANCIAL_REVIEW_ID');assert.ok(raw.expectedCheckpoint&&typeof raw.expectedCheckpoint==='object'&&!Array.isArray(raw.expectedCheckpoint),'PAEG_FINANCIAL_REVIEW_CHECKPOINT');normalizePolicy(raw.policy);
 exact(raw.limits,['maximumTotalSuccessorPools','maximumSourcesPerWallet',...(Object.hasOwn(raw.limits??{},'maximumTotalMixedSources')?['maximumTotalMixedSources']:[])]);for(const value of Object.values(raw.limits))assert.ok(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&BigInt(value)<=16n,'PAEG_FINANCIAL_REVIEW_QUOTA');
 assert.deepEqual(raw.limits,{maximumTotalSuccessorPools:'1',maximumSourcesPerWallet:'1',maximumTotalMixedSources:'2'},'PAEG_UNISWAP_RECOVERY_FIXED_FINANCIAL_QUOTAS');
 for(const [field,value]of Object.entries({maximumFeePerTransactionAtomic:'500000000000000',maximumTotalFeeAtomic:'5000000000000000',maximumValuePerTransactionAtomic:'1000000000000000',maximumTotalValueAtomic:'2000000000000000',expiresAt:1792134000000}))assert.equal(raw.policy[field],value,'PAEG_UNISWAP_RECOVERY_FIXED_FINANCIAL_TERMS');assert.ok(Date.now()<raw.policy.expiresAt,'PAEG_UNISWAP_RECOVERY_FINANCIAL_EXPIRED');return raw;
}
let product,ingress,configuration,financialReviewBytes,financialReview;
try{
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');try{configuration=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}
 const review=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'partial-bootstrap-review-v5.json');review.fill(0);configuration.providerDirectory=join(PUBLIC_OPERATOR_STATE_V4,'provider-replacement-v5');
 const financialData=await load('packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs');financialReviewBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,FINANCIAL_EPOCH_REVIEW_FILE_V5);financialReview=retainedFinancialReview(JSON.parse(financialReviewBytes.toString('utf8')),financialData.normalizeSourceFinancialPolicyDataV5);
 const T=await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs'),B=await load('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs');
 const sourceFile=join(configuration.nativeDirectory,'source-operations','native-wallet.json'),dispatchFile=join(configuration.nativeDirectory,'dispatch-journal','native-wallet.json');
 const sourceBefore=await readFile(sourceFile),dispatchBefore=await readFile(dispatchFile),source=JSON.parse(sourceBefore.toString('utf8'));
 assert.equal(source.operations.length,13,'PAEG_UNISWAP_RECOVERY_SOURCE_COUNT');assert.ok(source.operations.every(row=>row.phase==='FINALIZED'),'PAEG_UNISWAP_RECOVERY_REQUIRES_FINALITY');assert.equal(source.operations.filter(row=>row.profile.includes('UNISWAP')).length,10,'PAEG_UNISWAP_RECOVERY_ORIGINAL_PLANS');assert.equal(JSON.parse(dispatchBefore.toString('utf8')).operations.length,0,'PAEG_UNISWAP_RECOVERY_NO_FINANCIAL_ACTIONS');
 const dispatchSHA=createHash('sha256').update(dispatchBefore).digest('hex');sourceBefore.fill(0);dispatchBefore.fill(0);
 const phoneBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-phone-connection.json'),rootBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-connection.json');let phone,previousRoot;try{phone=JSON.parse(phoneBytes.toString('utf8'));previousRoot=JSON.parse(rootBytes.toString('utf8'));}finally{phoneBytes.fill(0);rootBytes.fill(0);}
 const [key,cert,publicCert]=await Promise.all(['server-key.pem','server-certificate.pem','public-api-certificate.pem'].map(name=>readPrivateOperatorFileV4(PUBLIC_TRANSPORT_DIRECTORY_V4,name)));
 try{ingress=T.createOriginalPagedRemoteIngressBindingV4({origin:'https://api.lianum.oryontechnology.com',host:'10.71.0.3',port:9445,privateTLS:{key:key.toString('utf8'),cert:cert.toString('utf8')},publicCertificatePEM:publicCert.toString('utf8')});}finally{key.fill(0);cert.fill(0);publicCert.fill(0);}
 const input=publicUniswapConfigurationV6(configuration,phone.descriptor.devicePublicKey);const M=await load('packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs'),mode=await M.readOriginalPagedPublicUniswapMixedRecoveryModeV6({directory:input.parent.supervisorDirectory,password:configuration.journal.password});assert.ok(['ACTIVE','OPENING','CAPTURED'].includes(mode.phase),'PAEG_UNISWAP_RECOVERY_PHASE');emit({stage:'UNISWAP_ACTIVATION_RECOVERY_STARTED',phase:mode.phase,existingWallets:2,existingApplicationContracts:68,newWalletIdentity:false});
 product=await (mode.phase==='ACTIVE'?B.recoverOriginalPagedPublicUniswapActiveOperatorV7:mode.phase==='OPENING'?B.resumeOriginalPagedPublicUniswapMixedOpeningOperatorV5:B.reopenOriginalPagedPublicUniswapMixedOperatorV5)(input,ingress);assert.deepEqual(B.readOriginalPagedPublicNativeConnectionV4(product),previousRoot);assert.deepEqual(B.readOriginalPagedPublicNativePhoneConnectionV4(product),phone);
 const mixed=B.readOriginalPagedPublicUniswapMixedConnectionV5(product),flat=B.readOriginalPagedPublicUniswapFlatConnectionV5(product);assert.equal(mixed.descriptor.devicePublicKey,phone.descriptor.devicePublicKey);assert.equal(flat.descriptor.devicePublicKey,phone.descriptor.devicePublicKey);
 assert.deepEqual(JSON.parse(await readFile(sourceFile)),source,'PAEG_UNISWAP_RECOVERY_SOURCE_CHANGED_BEFORE_REVIEW');assert.equal(createHash('sha256').update(await readFile(dispatchFile)).digest('hex'),dispatchSHA,'PAEG_UNISWAP_RECOVERY_FINANCIAL_CHANGED');
 const unchangedReview=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,FINANCIAL_EPOCH_REVIEW_FILE_V5);try{assert.ok(unchangedReview.equals(financialReviewBytes),'PAEG_UNISWAP_RECOVERY_REVIEW_CHANGED');}finally{unchangedReview.fill(0);}
 // The current Original product serializes its genuine receiver and republishes
 // its own activation base. No isolated Native3 writer or replayed DTO is used.
 const financialState=await B.authorizeOriginalPagedPublicNativeFinancialEpochV5(product,financialReview);assert.equal(financialState?.profile,'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5');assert.ok(financialState.epoch&&financialState.epoch.nonce===financialReview.intentId&&hex(financialState.epoch.epochId),'PAEG_FINANCIAL_ORIGINAL_ACK');assert.deepEqual(financialState.epoch.policy,financialReview.policy);assert.deepEqual(financialState.effectivePolicy,financialReview.policy);assert.deepEqual(financialState.epoch.limits,financialReview.limits);assert.deepEqual(financialState.limits,financialReview.limits);assert.equal(financialState.epoch.predecessorEpochId,financialReview.expectedEpochId);assert.equal(financialState.financialSigningEnabled,true,'PAEG_UNISWAP_RECOVERY_FINANCIAL_NOT_ACTIVE');
 assert.deepEqual(JSON.parse(await readFile(sourceFile)),source,'PAEG_UNISWAP_RECOVERY_REVIEW_SOURCE_CHANGED');assert.equal(createHash('sha256').update(await readFile(dispatchFile)).digest('hex'),dispatchSHA,'PAEG_UNISWAP_RECOVERY_FINANCIAL_CHANGED');
 const ack={profile:'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5',intentId:financialReview.intentId,epochId:financialState.epoch.epochId,epoch:financialState.epoch.epoch,expiresAt:financialState.effectivePolicy.expiresAt,financialStepsStarted:false},ackBytes=Buffer.from(JSON.stringify(ack)+'\n'),ackName='financial-epoch-ack-'+financialReview.intentId+'.json';
 try{try{await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,ackName,ackBytes);}catch(error){if(error.code!=='EEXIST')throw error;const existing=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,ackName);try{assert.deepEqual(JSON.parse(existing.toString('utf8')),ack,'PAEG_FINANCIAL_ACK_CHANGED');}finally{existing.fill(0);}}}finally{ackBytes.fill(0);}
 await publishPrivateFinancialStateDataV5(financialState);emit({stage:'FINANCIAL_EPOCH_AUTHORIZED',...ack});
 const captured=await product.close();assert.ok(captured.retainedOriginalState&&captured.ownedServicesClosed,'PAEG_UNISWAP_CAPTURE_UNCONFIRMED');
 assertPreservedSourceCaptureV7(source,JSON.parse(await readFile(sourceFile)));assert.equal(createHash('sha256').update(await readFile(dispatchFile)).digest('hex'),dispatchSHA,'PAEG_UNISWAP_RECOVERY_FINANCIAL_CHANGED');
 emit({stage:'EXISTING_UNISWAP_CAPTURED_READY_FOR_REOPEN',existingWalletsPreserved:2,sameProviderKeys:true,financialPayments:false,newWalletIdentity:false,automaticRebroadcast:false});
}catch(error){
 process.exitCode=1;
 // Exception messages/actual/expected may contain private operation material.
 // Retain only fixed reason codes and source file locations for diagnosis.
 const diagnostic=(value,depth=0)=>{const first=typeof value?.message==='string'?value.message.split('\n',1)[0]:'';return{reason:/^[A-Z][A-Z0-9_]{1,120}$/.test(first)?first:'ORIGINAL_ACTIVATION_REJECTED',errorClass:['TypeError','ReferenceError','AssertionError','RangeError','SyntaxError','AggregateError','Error'].includes(value?.name)?value.name:null,safeTypeMessage:/^TypeError: [A-Za-z0-9_.$]+ is not a function$/.test(String(value))?String(value):null,code:/^[A-Z0-9_]{1,80}$/.test(value?.code)?value.code:null,locations:String(value?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,8).map(line=>line.match(/([a-z0-9-]+\.mjs:\d+:\d+)\)?$/i)?.[1]).filter(Boolean),causes:depth<3&&value instanceof AggregateError?value.errors.slice(0,4).map(child=>diagnostic(child,depth+1)):[]};};
 emit({stage:'UNISWAP_ACTIVATION_FAILED',...diagnostic(error),...(['TypeError','SyntaxError','AbortError','RangeError','Error'].includes(error?.transportClass)?{transportClass:error.transportClass}:{}),...(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','ENETUNREACH','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(error?.transportCode)?{transportCode:error.transportCode}:{}),automaticRetry:false});
}
finally{try{await product?.close();}catch{process.exitCode=1;emit({stage:'UNISWAP_CAPTURE_UNCONFIRMED',automaticRetry:false});}finally{if(ingress)(await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs')).closeOriginalPagedRemoteIngressBindingV4(ingress);if(configuration)configuration.journal.password=null;financialReviewBytes?.fill(0);financialReview=null;}}
