/** Administrative preparation of fixed DeFi children on the SAME public
 * engine. Existing captures/plans resume through Original owners. The capital
 * bridge is still required: this never announces financial DeFi completion. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,assertPrivateOperatorDirectoryV4,readPrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {readPublicUniswapModeV6} from './public-uniswap-mode-v6.mjs';
import {PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8,PUBLIC_SEPOLIA_DEFI_SUPERVISOR_FILE_V8,publicSepoliaDefiConfigurationV8,readPublicSepoliaDefiCheckpointV8,publishCapturedPublicSepoliaDefiV8} from './public-sepolia-defi-mode-v8.mjs';
import {readCapturedPublicSepoliaDefiSourceCheckpointV8} from './captured-defi-source-checkpoint-v8.mjs';
import {assertPublicSepoliaDefiSourceCaptureV8} from './assert-defi-source-capture-v8.mjs';

assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=1024']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=path=>import(pathToFileURL(join(root,path)).href),emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
let configuration,defiInput,product,ingress,stopping=false;
const stop=()=>{stopping=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
async function readSource(){
 const directory=join(PUBLIC_NATIVE_DIRECTORY_V4,'source-operations');await assertPrivateOperatorDirectoryV4(directory);const fd=await open(join(directory,'native-wallet.json'),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const state=await fd.stat();assert.ok(state.isFile()&&state.nlink===1&&state.uid===process.getuid()&&(state.mode&0o777)===0o600&&state.size>0&&state.size<=33554432,'PAEG_DEFI_PRIVATE_SOURCE');const bytes=await fd.readFile();try{return JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}}finally{await fd.close();}
}
function checkConfiguration(value){
 assert.equal(value.nativeDirectory,PUBLIC_NATIVE_DIRECTORY_V4);assert.equal(value.supervisorDirectory,join(PUBLIC_OPERATOR_STATE_V4,'supervisor'));assert.equal(value.journal.path,join(PUBLIC_OPERATOR_STATE_V4,'authority','journal.vault'));assert.equal(value.providerDirectory,join(PUBLIC_OPERATOR_STATE_V4,'provider'));
}
try{
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');try{configuration=JSON.parse(bytes.toString('utf8'));}finally{bytes.fill(0);}checkConfiguration(configuration);
 const review=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'partial-bootstrap-review-v5.json');review.fill(0);configuration.providerDirectory=join(PUBLIC_OPERATOR_STATE_V4,'provider-replacement-v5');
 const uniswap=await readPublicUniswapModeV6(root,configuration);assert.ok(uniswap,'PAEG_DEFI_ORIGINAL_UNISWAP_REQUIRED');
 const phoneBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-phone-connection.json'),rootBytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-connection.json');let phone,previousRoot;
 try{phone=JSON.parse(phoneBytes.toString('utf8'));previousRoot=JSON.parse(rootBytes.toString('utf8'));}finally{phoneBytes.fill(0);rootBytes.fill(0);}
 const phoneKey=phone.descriptor.devicePublicKey;assert.equal(phoneKey,uniswap.input.mixed.devicePublicKey,'PAEG_DEFI_SAME_PHONE_REQUIRED');
 const before=await readSource();let mode,supervisorPresent=true;
 try{await lstat(PUBLIC_SEPOLIA_DEFI_SUPERVISOR_FILE_V8);}catch(error){if(error.code!=='ENOENT')throw error;supervisorPresent=false;}
 if(supervisorPresent){const checkpoint=await readPublicSepoliaDefiCheckpointV8(root,configuration,phoneKey);assert.ok(['CAPTURED','OPENING','ACTIVE'].includes(checkpoint.phase),'PAEG_DEFI_RECOVERY_PHASE');mode=checkpoint.phase==='ACTIVE'?'ACTIVE_DEAD':checkpoint.phase;for(const row of checkpoint.authorities)assert.equal(row.descriptor.devicePublicKey,phoneKey,'PAEG_DEFI_SAME_PHONE_REQUIRED');}
 else{
  try{await lstat(PUBLIC_SEPOLIA_DEFI_DIRECTORY_V8);throw Error('PAEG_DEFI_BIRTH_DIRECTORY_WITHOUT_SUPERVISOR');}catch(absent){if(absent.code!=='ENOENT')throw absent;}
  assert.ok(before.operations.every(row=>!row.profile.startsWith('ORIGINAL_PUBLIC_SEPOLIA_DEFI_')),'PAEG_DEFI_SOURCE_WITHOUT_ORIGINAL_SUPERVISOR');mode='CREATE';
 }
 defiInput=publicSepoliaDefiConfigurationV8(configuration,phoneKey,mode);
 const B=await load('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs'),T=await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs');
 const [key,cert,publicCert]=await Promise.all(['server-key.pem','server-certificate.pem','public-api-certificate.pem'].map(name=>readPrivateOperatorFileV4(PUBLIC_TRANSPORT_DIRECTORY_V4,name)));
 try{ingress=T.createOriginalPagedRemoteIngressBindingV4({origin:'https://api.lianum.oryontechnology.com',host:'10.71.0.3',port:9445,privateTLS:{key:key.toString('utf8'),cert:cert.toString('utf8')},publicCertificatePEM:publicCert.toString('utf8')});}finally{key.fill(0);cert.fill(0);publicCert.fill(0);}
 if(stopping)throw Error('PAEG_DEFI_PREPARATION_STOPPED');
 emit({stage:'SEPOLIA_DEFI_PREPARATION_STARTED',mode,originalWalletsPreserved:2,newWalletIdentity:false,financialReady:false});
 const opener=uniswap.state.phase==='CAPTURED'?B.reopenOriginalPagedPublicUniswapMixedWithDefiOperatorV8:uniswap.state.phase==='OPENING'?B.resumeOriginalPagedPublicUniswapMixedOpeningWithDefiOperatorV8:uniswap.state.phase==='ACTIVE'?B.recoverOriginalPagedPublicUniswapActiveWithDefiOperatorV8:null;
 assert.equal(typeof opener,'function','PAEG_DEFI_ORIGINAL_RECOVERY_OPENER_REQUIRED');
 product=await opener(uniswap.input,ingress,defiInput);defiInput.password=null;
 assert.deepEqual(B.readOriginalPagedPublicNativeConnectionV4(product),previousRoot,'PAEG_DEFI_ORIGINAL_ROOT_WALLET_CHANGED');assert.deepEqual(B.readOriginalPagedPublicNativePhoneConnectionV4(product),phone,'PAEG_DEFI_ORIGINAL_PHONE_WALLET_CHANGED');
 const connections=await B.readOriginalPagedPublicSepoliaDefiConnectionsV8(product);
 const captured=await product.close();assert.ok(captured.retainedOriginalState&&captured.ownedServicesClosed,'PAEG_DEFI_CAPTURE_UNCONFIRMED');
 const state=await readPublicSepoliaDefiCheckpointV8(root,configuration,phoneKey),checkpoint=await readCapturedPublicSepoliaDefiSourceCheckpointV8(root,configuration,uniswap.input),after=await readSource(),plans={...Object.fromEntries(Object.entries(state.targets).map(([protocol,target])=>[protocol,target.planSHA256])),SOURCE7:state.mixedSource?.planSHA256};
 const preservation=assertPublicSepoliaDefiSourceCaptureV8(before,after,checkpoint,plans);
 if(stopping)throw Error('PAEG_DEFI_CAPTURED_PUBLICATION_NOT_REQUESTED');
 const published=await publishCapturedPublicSepoliaDefiV8(root,configuration,phoneKey,connections);
 emit({stage:'SEPOLIA_DEFI_CAPTURED_PREPARATION_PUBLISHED',...preservation,plans:published.targetPlanSHA256,originalWalletsPreserved:2,newWalletIdentity:false,financialReady:false,remaining:'PUBLIC_LIQUIDITY_AND_APP_ACCEPTANCE',automaticRebroadcast:false});
}catch(error){
 process.exitCode=1;const first=typeof error?.message==='string'?error.message.split('\n',1)[0]:'';emit({stage:'SEPOLIA_DEFI_PREPARATION_FAILED',reason:/^[A-Z][A-Z0-9_]{1,120}$/.test(first)?first:'ORIGINAL_PREPARATION_REJECTED',errorClass:['TypeError','ReferenceError','AssertionError','RangeError','SyntaxError','AggregateError','Error'].includes(error?.name)?error.name:null,locations:String(error?.stack??'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,8).map(line=>line.match(/([a-z0-9-]+\.mjs:\d+:\d+)\)?$/i)?.[1]).filter(Boolean),automaticRetry:false,financialReady:false});
}finally{
 try{await product?.close();}catch{process.exitCode=1;emit({stage:'SEPOLIA_DEFI_CAPTURE_UNCONFIRMED',automaticRetry:false});}
 if(ingress)(await load('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs')).closeOriginalPagedRemoteIngressBindingV4(ingress);
 if(configuration)configuration.journal.password=null;if(defiInput)defiInput.password=null;process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
}
