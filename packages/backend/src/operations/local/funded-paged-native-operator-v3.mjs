/** Fixed original Paged product. Controlled capture preserves the same private
 * wallet/operation; a cold opening verifies every original component before TLS.
 * Public requests cannot select factories or reconstruct an authority. */
import assert from 'node:assert/strict';
import {request as httpsRequest} from 'node:https';
import {createHash,X509Certificate} from 'node:crypto';
import {dirname,relative} from 'node:path';
import {lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepareOriginalDevicePagedDurableNativeGraphLocalOperatorV3,reopenOriginalDevicePagedNativeGraphLocalOperatorV3,listenOriginalDevicePagedGraphLocalOperatorV3,captureOriginalDevicePagedGraphLocalOperatorV3,fenceOriginalDevicePagedGraphLocalOperatorV3,quiesceOriginalDevicePagedGraphLocalOperatorV4,readOriginalDevicePagedGraphExecutionContextV3} from './funded-graph-paged-device-graph-operator-v3.mjs';
import {createOriginalPagedDurableNativeProviderV3,createOriginalPagedNativeProviderWithUniswapV3,reopenOriginalPagedNativeProviderV3,reopenOriginalPagedNativeProviderWithUniswapV3,captureOriginalPagedNativeProviderV3,captureOriginalPagedNativeProviderRuntimesV3,readOriginalPagedNativeProviderRuntimeV3,sealOriginalPagedNativeProviderRetentionV3,assertOriginalPagedNativeProviderV3} from '../../providers/funded-paged-native-provider-v3.mjs';
import {emitOriginalDevicePagedProviderRetentionV3} from '../../accounts/authority/device-paged-note-authority-v3.mjs';
import {createOriginalPagedSupervisorRetentionV3,openOriginalPagedSupervisorRetentionV3,createOriginalPagedMixedSupervisorRetentionV3,openOriginalPagedMixedSupervisorRetentionV3} from '../recovery/paged-runtime-recovery-authority-v3.mjs';
import {assertOriginalPagedNativeFinancialSourceV3} from './funded-paged-native-source-v3.mjs';
import {createOriginalPagedUniswapContextV3,readOriginalPagedUniswapContextV3,prepareOriginalPagedUniswapSolverV3,captureOriginalPagedUniswapContextV3,reopenOriginalPagedUniswapContextV3} from '../../providers/paged-uniswap-provider-v3.mjs';
import {createOriginalDeviceExternalFlatTlsServerV1,quiesceOriginalRetainedDeviceExternalFlatTlsServerV1} from '../../api/mobile/device-external-flat-note-http-v1.mjs';
const captureProjectRoot=fileURLToPath(new URL('../../../../../',import.meta.url)).replace(/\/$/,'');
const own=new WeakMap(),sha=value=>createHash('sha256').update(value).digest('hex');
const captureStages=new Set(['FENCE','DRAIN','PROVIDER','GRAPH','NATIVE','UNISWAP','SUPERVISOR','RESOURCE_CLOSE','SOCKET_DRAIN']);
const captureCodes=new Set(['SOLANA_RECOVERY_OWNED_ADMIN_SOCKET','SOLANA_RECOVERY_ORIGINAL_ADMIN_PATH','SOLANA_RECOVERY_ADMIN_TIMEOUT','SOLANA_RECOVERY_ADMIN_UNAVAILABLE','SOLANA_RECOVERY_ADMIN_RESPONSE','SOLANA_RECOVERY_ADMIN_ORIGINAL_PID','SOLANA_RECOVERY_ADMIN_EXIT_ACK','SOLANA_RECOVERY_NATIVE_JOIN_NOT_ESTABLISHED','SOLANA_RECOVERY_REQUIRES_ORDERLY_NATIVE_TERMINAL']);
const captureExtraCodes=new Set(['PAGED_AUTHORITY_CAPTURE_QUIESCENT','PAGED_AUTHORITY_CAPTURE_QUEUED','PAGED_AUTHORITY_CAPTURE_CLOCK','PAGED_AUTHORITY_CAPTURE_PERMISSION_TIMEOUT','PAGED_AUTHORITY_CAPTURE_PERMISSION_BINDING','PAGED_AUTHORITY_CAPTURE_JOURNAL_CHANGED','PAGED_AUTHORITY_CAPTURE_UNRESOLVED_WORK','PAGED_AUTHORITY_CAPTURE_FAILED_OWNER','PAGED_AUTHORITY_CAPTURE_OWNER_PUBLIC','PAGED_DEVICE_CLOSED','PAGED_DEVICE_HEAD_CHANGED','PAGED_GRAPH_OPERATOR_CAPTURE_CLOSED','PAGED_GRAPH_OPERATOR_SOCKET_DRAIN','PAGED_GRAPH_OPERATOR_CLOSE_FAILED','PAGED_GRAPH_PROCESS_CHANGED','PAGED_GRAPH_OWNER_CLOSED','PAGED_GRAPH_CLOSED_FRAME','PAGED_GRAPH_PROCESS_CLOSED','PAGED_GRAPH_COMMAND_DEADLINE','PAGED_GRAPH_PROOF_OBSERVATION_REQUIRED','PAGED_NATIVE_PROVIDER_CLOSE_UNCONFIRMED','PAGED_NATIVE_TLS_DRAIN','MOBILE_PAGED_GRAPH_CONSENT_FUTURE','MOBILE_PAGED_GRAPH_CONSENT_CLOCK_INVALID','MOBILE_PAGED_GRAPH_CONSENT_DEADLINE','MOBILE_PAGED_CLOCK_FUTURE','MOBILE_PAGED_CLOCK_INVALID','MOBILE_PAGED_CLOCK_BINDING','MOBILE_PAGED_CLOCK_CAPACITY','MOBILE_PAGED_OWNER_BINDING','EVM_RECOVERY_CAPTURE_HEAD_CHANGED','EVM_RECOVERY_CAPTURE_AND_STOP_FAILED','EVM_ECONOMIC_CAPTURE_REQUIRES_QUIESCENCE','EVM_ECONOMIC_ORIGINAL_CAPTURE_TOKEN','NATIVE_RECOVERY_SYMLINK','NATIVE_RECOVERY_HARDLINK','NATIVE_RECOVERY_FILE_CHANGED','NATIVE_RECOVERY_FILE_BOUND','VAULT_LOCKED','VAULT_CONFLICT','VAULT_SIZE','VAULT_RECORD']);
for(const code of captureExtraCodes)captureCodes.add(code);
function captureSourceFrames(error){
 try{
  if(!(error instanceof Error))return Object.freeze([]);const raw=error.stack;if(typeof raw!=='string'||raw.length>65536)return Object.freeze([]);
  const frames=[];for(const line of raw.split('\n')){
   if(!/^\s+at /.test(line))continue;
   const match=/\b(file:\/\/[^()\r\n?#]+\.mjs):([1-9][0-9]{0,6}):([1-9][0-9]{0,6})\)?$/.exec(line);
   if(!match)continue;let path;
   try{const file=fileURLToPath(match[1]);path=relative(captureProjectRoot,file);if(!file.startsWith(captureProjectRoot+'/')||!/^packages\/(?:backend|engine|proofs|mobile-protocol)\/src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.mjs$/.test(path)||path.split('/').includes('..'))continue;const stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(file)!==file)continue;}catch{continue;}
   frames.push(Object.freeze({path,line:Number(match[2]),column:Number(match[3])}));if(frames.length===6)break;
  }return Object.freeze(frames);
 }catch{return Object.freeze([]);}
}
const captureFailures=new WeakMap();
function finiteFailureCode(error,codes){try{if(!(error instanceof Error))return'UNCLASSIFIED';for(const name of ['code','message']){const value=Object.getOwnPropertyDescriptor(error,name)?.value;if(typeof value==='string'){const newline=value.indexOf('\n'),candidate=newline<0?value:value.slice(0,newline);if(codes.has(candidate))return candidate;}}}catch{}return'UNCLASSIFIED';}
const captureFailureCode=error=>finiteFailureCode(error,captureCodes);
function reportCaptureFailure(stage,error){
 const prior=error instanceof Error?captureFailures.get(error):null;if(prior)return prior;
 const code=captureFailureCode(error),metadata=Object.freeze({stage:captureStages.has(stage)?stage:'RESOURCE_CLOSE',code,...(code==='UNCLASSIFIED'?{sourceFrames:captureSourceFrames(error)}:{})});
 if(error instanceof Error)captureFailures.set(error,metadata);
 try{console.error('LIANUM_PAGED_CAPTURE_FAILURE',metadata.stage,metadata.code,...(metadata.sourceFrames?[JSON.stringify(metadata.sourceFrames)]:[]));}catch{}
 return metadata;
}
/** Original failure provenance DATA only; no state, source or recovery grant. */
export function readOriginalPagedCaptureFailureV3(error){if(arguments.length!==1)return null;return error instanceof Error?captureFailures.get(error)??null:null;}
const startupStages=new Set(['SOURCE','UNI_CONTEXT','UNI_SOLVER','NATIVE_PROVIDER','GRAPH','SUPERVISOR','LISTEN']);
const startupCodes=new Set(['CURRENT_SOURCE_DIGEST','CURRENT_SOURCE_PUBLIC_PATH','CURRENT_SOURCE_ALIAS','CURRENT_SOURCE_REGULAR_FILE','CURRENT_SOURCE_CHANGED_DURING_READ','CURRENT_SOURCE_BYTES','CURRENT_SOURCE_PIN','CURRENT_SOURCE_PATH','CURRENT_SOURCE_BYTE_COUNT','CURRENT_SOURCE_DUPLICATE','CURRENT_SOURCE_ADOPTION_CHANGED','CURRENT_SOURCE_GENERATION_CHANGED','CURRENT_SOURCE_CANDIDATE_CHANGED',
 'EADDRINUSE','EACCES','EPERM','ENOENT','ECONNREFUSED','PINNED_EXECUTABLE_HASH_MISMATCH','RUNTIME_PATH_ESCAPE','PINNED_RUNTIME_REQUIRES_REVIEWED_X64_PLATFORM','LOCAL_RUNTIME_EXITED','OWNED_RPC_REQUIRES_LOOPBACK','OWNED_RPC_HTTP_ERROR','OWNED_RPC_REMOTE_ERROR',
 'PAGED_NATIVE_FIXED_RUNTIME_BIRTH','PAGED_NATIVE_FIXED_BIRTH','PAGED_NATIVE_ORIGINAL_RUNTIME','PAGED_NATIVE_ORIGINAL_COHORT','PAGED_NATIVE_PROVIDER_CLOSE_UNCONFIRMED','PAGED_DURABLE_FIXED_EVM_PROFILE','PAGED_COLD_FIXED_EVM_PROFILE','LOCAL_EVM_PRIVATE_FIXED_PROFILE','LOCAL_EVM_LINUX_ONLY','EVM_PRIVATE_INPUT_FIXED_PROFILE','LOCAL_EVM_PROCESS_NOT_RUNNING','LOCAL_EVM_STARTUP_TIMEOUT','LOCAL_EVM_INITIAL_HEAD','LOCAL_EVM_GENESIS','LOCAL_EVM_GENESIS_TRANSACTIONS','LOCAL_EVM_GENESIS_HASH','LOCAL_EVM_GENESIS_TIME','LOCAL_EVM_ACCOUNT_COUNT','LOCAL_EVM_ACCOUNT_UNIQUENESS','LOCAL_EVM_FRESH_NONCE','LOCAL_EVM_FAKE_BALANCE','LOCAL_EVM_FRESH_ACCOUNT_CODE','EVM_ECONOMIC_NO_SERVER_SIGNERS','EVM_ECONOMIC_AUTHENTICATED_LOCAL_KEYS',
 'OWNED_NATIVE_VALUE_PLAIN_RECORD','OWNED_NATIVE_VALUE_EXACT_FIELDS','OWNED_NATIVE_VALUE_FIXED_NORMALIZER','OWNED_NATIVE_VALUE_BINDING_HASH','OWNED_NATIVE_VALUE_LOCAL_CHAIN_ONLY','OWNED_NATIVE_VALUE_ORIGINAL_GENESIS','OWNED_NATIVE_VALUE_ORIGINAL_ACCOUNTS','OWNED_NATIVE_VALUE_SOLVER_NOT_OWNED','OWNED_NATIVE_VALUE_RECIPIENT','OWNED_NATIVE_VALUE_FIXED_GAS','OWNED_NATIVE_VALUE_AMOUNT','OWNED_NATIVE_VALUE_EXACT_K_MEMO',
 'SOLANA_STARTUP_TIMEOUT','SOLANA_VALIDATOR_EXITED','SOLANA_LOOPBACK_COMPAT_BUILD_NOT_READY','SOLANA_PINNED_EXECUTABLE_HASH_MISMATCH','SOLANA_UNREVIEWED_PERFORMANCE_LIBRARY_DIRECTORY','SOLANA_UNEXPECTED_CLUSTER_PEER','SOLANA_NON_LOOPBACK_CONTACT','SOLANA_NON_LOOPBACK_OWNED_SOCKET','SOLANA_NO_OWNED_SOCKET_EVIDENCE','SOLANA_MISSING_OWNED_LOOPBACK_LISTENER','SOLANA_SYNTHETIC_FUNDING_MISMATCH','SOLANA_GRAPH_SYNTHETIC_FUNDING_MISMATCH','SOLANA_FINALIZED_HISTORY_CHANGED',
 'PAGED_UNISWAP_ORIGINAL_CONTEXT','PAGED_UNISWAP_CHECKPOINT_CHANGED','PAGED_UNISWAP_BUSY','PAGED_UNISWAP_APPROVAL_UNKNOWN','PAGED_UNISWAP_CLOSE_UNCONFIRMED','PAGED_MIXED_FIXED_TARGET_PORT','PAGED_GRAPH_OPERATOR_CLOSE_FAILED','PAGED_GRAPH_OPERATOR_LISTENER_PHASE','DEVICE_EXTERNAL_FLAT_TLS_LEAF','DEVICE_EXTERNAL_FLAT_TLS_PIN','DEVICE_EXTERNAL_FLAT_TLS_HOST']);
const startupFailures=new WeakMap();
function reportStartupFailure(stage,error){
 const prior=error instanceof Error?startupFailures.get(error):null;if(prior)return prior;
 const metadata=Object.freeze({stage:startupStages.has(stage)?stage:'SOURCE',code:finiteFailureCode(error,startupCodes)});
 if(error instanceof Error)startupFailures.set(error,metadata);
 try{console.error('LIANUM_PAGED_START_FAILURE',metadata.stage,metadata.code);}catch{}
 return metadata;
}
/** Original startup provenance DATA only; no factory, source or recovery grant. */
export function readOriginalPagedStartupFailureV3(error){if(arguments.length!==1)return null;return error instanceof Error?startupFailures.get(error)??null:null;}
const exact=(value,keys)=>{assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());};
export async function startOriginalPagedNativeOperatorV3(raw){assert.equal(arguments.length,1);return openProduct(raw,false);}
export async function reopenOriginalPagedNativeOperatorV3(raw){assert.equal(arguments.length,1);return openProduct(raw,true);}
export async function startOriginalPagedMixedNativeOperatorV3(raw){assert.equal(arguments.length,1);return openProduct(raw,false,true);}
export async function reopenOriginalPagedMixedNativeOperatorV3(raw){assert.equal(arguments.length,1);return openProduct(raw,true,true);}
async function openProduct(raw,opening,mixed=false){
 exact(raw,['deployment','journal','nativeDirectory','origin','devicePublicKey','tls','host']);exact(raw.deployment,['manifestSHA256','consumerSHA256','deploymentDomain','policy',...(Object.hasOwn(raw.deployment,'minimumDepositAtomic')?['minimumDepositAtomic']:[])]);exact(raw.tls,['key','cert']);const config=structuredClone(raw);assertOriginalPagedNativeFinancialSourceV3();
 let provider,service,supervisor,uniswapContext,uniswapListener,uniswapPublic,closing,capturing,captured=null,closed=false;const sockets=new Set(),work=new Set(),cert=new X509Certificate(config.tls.cert),certSHA=sha(cert.raw),privateRoot=dirname(config.nativeDirectory);
 function uniswapOriginals(){
  const originals=readOriginalPagedUniswapContextV3(uniswapContext),targetOrigin=new URL(config.origin);assert.ok(Number(targetOrigin.port)>0&&Number(targetOrigin.port)<65535,'PAGED_MIXED_FIXED_TARGET_PORT');targetOrigin.port=String(Number(targetOrigin.port)+1);assert.equal(originals.targetDescriptor.origin,targetOrigin.origin);assert.equal(originals.targetDescriptor.devicePublicKey,config.devicePublicKey);
  const targetConnection={format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:originals.targetDescriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:config.tls.cert,certificateSHA256:certSHA}};uniswapPublic={configuration:uniswapContext.configuration,targetConnection,template:uniswapContext.template};return {runtime:originals.runtime,system:originals.system,targetAccount:originals.targetAccount,router:originals.router,observer:originals.observer,protocolFixture:originals.protocolFixture,rule:originals.rule,...uniswapPublic};
 }
 async function capture(){
  if(capturing)return capturing;assert.ok(supervisor&&provider&&service&&!closed,'PAGED_NATIVE_CAPTURE_NOT_READY');closed=true;for(const socket of sockets)socket.destroy();
  return capturing=(async()=>{
   let stage='FENCE';try{
   // Fence both original listeners before retaining any component. Target TLS
   // quiescence preserves account custody until its own original capture.
   const target=mixed?readOriginalPagedUniswapContextV3(uniswapContext):null;
   await Promise.all([fenceOriginalDevicePagedGraphLocalOperatorV3(service),...(mixed?[quiesceOriginalRetainedDeviceExternalFlatTlsServerV1(uniswapListener,target.targetAccount)]:[])]);
   stage='DRAIN';await Promise.allSettled([...work]);
   // Provider checks need all connector/target brands live. Native capture
   // similarly checks Uniswap, so its target runtime is always stopped last.
   await quiesceOriginalDevicePagedGraphLocalOperatorV4(service);
   stage='PROVIDER';const providerState=await captureOriginalPagedNativeProviderV3(provider);
   stage='GRAPH';const graph=await captureOriginalDevicePagedGraphLocalOperatorV3(service);
   stage='NATIVE';const native=await captureOriginalPagedNativeProviderRuntimesV3(provider);
   stage='UNISWAP';const uni=mixed?await captureOriginalPagedUniswapContextV3(uniswapContext):null;
   stage='SUPERVISOR';captured=await supervisor.capture({deployment:graph.deployment,authority:graph.authority,provider:providerState,runtimes:{receiver:graph.receiver,...native,...(mixed?{uniswap:uni.receiver}:{})},...(mixed?{uniswap:uni.context}:{})});
   stage='RESOURCE_CLOSE';for(const resource of [service,uniswapListener,provider,uniswapContext,supervisor])await resource?.close();
   stage='SOCKET_DRAIN';assert.equal(sockets.size,0,'PAGED_NATIVE_TLS_DRAIN');return Object.freeze({closed:true,originalResourcesStopped:true,ownedSocketsRemaining:0,automaticFunding:false,retainedOriginalState:true,checkpoint:captured});
   }catch(error){reportCaptureFailure(stage,error);throw error;}
  })();
 }
 async function close(){if(closing)return closing;return closing=(async()=>{if(supervisor&&provider&&service){try{return await capture();}catch(error){await Promise.allSettled([service,uniswapListener,provider,uniswapContext].map(resource=>Promise.resolve().then(()=>resource?.close())));try{await supervisor.close();}catch{}throw error;}}closed=true;for(const socket of sockets)socket.destroy();await Promise.allSettled([...work]);let first;for(const resource of [service,uniswapListener,provider,uniswapContext,supervisor])try{await resource?.close();}catch(error){first??=error;}if(first){reportCaptureFailure('RESOURCE_CLOSE',first);throw first;}try{assert.equal(sockets.size,0,'PAGED_NATIVE_TLS_DRAIN');}catch(error){reportCaptureFailure('SOCKET_DRAIN',error);throw error;}return Object.freeze({closed:true,originalResourcesStopped:true,ownedSocketsRemaining:0,automaticFunding:false});})();}
 let startupStage='SUPERVISOR';try{
  if(opening){
   supervisor=await (mixed?openOriginalPagedMixedSupervisorRetentionV3:openOriginalPagedSupervisorRetentionV3)({directory:privateRoot,password:config.journal.password});assert.equal(supervisor.descriptor().origin,config.origin);assert.equal(supervisor.descriptor().devicePublicKey,config.devicePublicKey);
   if(mixed){startupStage='UNI_CONTEXT';uniswapContext=await reopenOriginalPagedUniswapContextV3(await supervisor.issueComponent('uniswap'),await supervisor.issueRuntime('uniswap'));}
   startupStage='NATIVE_PROVIDER';
   const runtimeTokens={EVM:await supervisor.issueRuntime('graphNative'),BTC:await supervisor.issueRuntime('bitcoin'),SOL:await supervisor.issueRuntime('solana')},providerToken=await supervisor.issueComponent('provider');
   if(mixed){const originals=uniswapOriginals();provider=await reopenOriginalPagedNativeProviderWithUniswapV3({directory:config.nativeDirectory,journalPassword:config.journal.password},providerToken,runtimeTokens,originals);}else provider=await reopenOriginalPagedNativeProviderV3({directory:config.nativeDirectory,journalPassword:config.journal.password},providerToken,runtimeTokens);
   const tokens={receiver:await supervisor.issueRuntime('receiver'),deployment:await supervisor.issueComponent('deployment'),authority:await supervisor.issueComponent('authority')};
   startupStage='GRAPH';service=await reopenOriginalDevicePagedNativeGraphLocalOperatorV3({deployment:{...config.deployment,registryEpoch:provider.publicConfiguration.registryEpoch,rulesRoot:provider.publicConfiguration.rulesRoot,attesterKeys:provider.publicConfiguration.attesterKeys},journal:config.journal,origin:config.origin,devicePublicKey:config.devicePublicKey,tls:config.tls,host:config.host},provider,tokens);
   const context=readOriginalDevicePagedGraphExecutionContextV3(service);assert.deepEqual(service.descriptor,supervisor.descriptor());assertOriginalPagedNativeProviderV3(provider,context);await supervisor.complete();
  }else{
   if(mixed){startupStage='UNI_CONTEXT';const targetOrigin=new URL(config.origin);assert.ok(Number(targetOrigin.port)>0&&Number(targetOrigin.port)<65535,'PAGED_MIXED_FIXED_TARGET_PORT');targetOrigin.port=String(Number(targetOrigin.port)+1);uniswapContext=await createOriginalPagedUniswapContextV3({origin:targetOrigin.origin,devicePublicKey:config.devicePublicKey});startupStage='UNI_SOLVER';await prepareOriginalPagedUniswapSolverV3(uniswapContext,'200');startupStage='NATIVE_PROVIDER';provider=await createOriginalPagedNativeProviderWithUniswapV3({directory:config.nativeDirectory},uniswapOriginals());}
   else{startupStage='NATIVE_PROVIDER';provider=await createOriginalPagedDurableNativeProviderV3({directory:config.nativeDirectory});}startupStage='GRAPH';service=await prepareOriginalDevicePagedDurableNativeGraphLocalOperatorV3({deployment:{...config.deployment,registryEpoch:provider.publicConfiguration.registryEpoch,rulesRoot:provider.publicConfiguration.rulesRoot,attesterKeys:provider.publicConfiguration.attesterKeys},journal:config.journal,origin:config.origin,devicePublicKey:config.devicePublicKey,tls:config.tls,host:config.host},provider);
   startupStage='SOURCE';assertOriginalPagedNativeFinancialSourceV3();startupStage='SUPERVISOR';const context=readOriginalDevicePagedGraphExecutionContextV3(service),token=await emitOriginalDevicePagedProviderRetentionV3(context.account,provider,'SEAL');await sealOriginalPagedNativeProviderRetentionV3(provider,token);supervisor=await (mixed?createOriginalPagedMixedSupervisorRetentionV3:createOriginalPagedSupervisorRetentionV3)({directory:privateRoot,password:config.journal.password},service.descriptor);
  }
  startupStage='LISTEN';
  if(mixed){const originals=readOriginalPagedUniswapContextV3(uniswapContext);uniswapListener=await createOriginalDeviceExternalFlatTlsServerV1({account:originals.targetAccount,tls:{privateKey:config.tls.key,certificate:config.tls.cert},host:config.host});}
  await listenOriginalDevicePagedGraphLocalOperatorV3(service);const descriptor=service.descriptor,origin=descriptor.origin;
  const fetchFixed=(url,init)=>{assert.ok(!closed);const target=new URL(url);assert.equal(target.origin,origin);assert.ok(['/v1/mobile/paged-owner/challenges','/v1/mobile/paged-owner/operations','/v1/mobile/paged-owner/graph/pairing','/v1/mobile/paged-owner/graph/challenges','/v1/mobile/paged-owner/graph/operations'].includes(target.pathname));assert.equal(init.method,'POST');assert.equal(init.headers['Content-Type'],'application/json');assert.ok(Buffer.byteLength(init.body)<=4*1024*1024);
   const operation=new Promise((resolve,reject)=>{const request=httpsRequest(target,{family:4,ca:config.tls.cert,agent:false,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',method:'POST',headers:{...init.headers,'Content-Length':Buffer.byteLength(init.body)},signal:init.signal},response=>{let size=0;const chunks=[];response.on('data',bytes=>{size+=bytes.length;if(size>4*1024*1024)response.destroy(Error('PAGED_NATIVE_REPLY_BOUND'));chunks.push(bytes);});response.once('error',error=>{chunks.forEach(bytes=>bytes.fill(0));reject(error);});response.once('aborted',()=>{chunks.forEach(bytes=>bytes.fill(0));reject(Error('PAGED_NATIVE_REPLY_ABORTED'));});response.once('end',()=>{let body;try{assert.ok(!closed);body=Buffer.concat(chunks);resolve(new Response(Uint8Array.from(body),{status:response.statusCode,headers:response.headers}));}catch(error){reject(error);}finally{body?.fill(0);chunks.forEach(bytes=>bytes.fill(0));}});});request.once('error',reject);request.on('socket',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.once('secureConnect',()=>{try{assert.equal(socket.getProtocol(),'TLSv1.3');assert.equal(sha(socket.getPeerCertificate().raw),certSHA);}catch(error){request.destroy(error);}});});request.end(init.body);});work.add(operation);operation.finally(()=>work.delete(operation)).catch(()=>{});return operation;};
  const product=Object.freeze({profile:'ORIGINAL_DEVICE_PAGED_LOCAL_SYNTHETIC_NATIVE_OPERATOR_V3',descriptor,origin,providerConfiguration:provider.publicConfiguration,reopenedOriginalState:opening,...(mixed?{uniswap:Object.freeze(uniswapPublic),controlledColdReopenSupported:true}:{}),close});own.set(product,{service,provider,fetchFixed,closed:()=>closed,nativeRuntime:readOriginalPagedNativeProviderRuntimeV3(provider),uniswapContext,capture});return product;
 }catch(error){reportStartupFailure(startupStage,error);try{await close();}catch{}throw error;}finally{config.journal.password=null;config.tls.key=null;}
}
export function readOriginalPagedNativeExecutionContextV3(product){assert.equal(arguments.length,1);const s=own.get(product);assert.ok(s&&!s.closed(),'PAGED_NATIVE_ORIGINAL_PRODUCT');return Object.freeze({...readOriginalDevicePagedGraphExecutionContextV3(s.service),provider:s.provider,nativeRuntime:s.nativeRuntime,fetchImpl:s.fetchFixed,...(s.uniswapContext?{uniswapContext:s.uniswapContext}:{})});}
export async function captureOriginalPagedNativeOperatorV3(product){assert.equal(arguments.length,1);const original=own.get(product);assert.ok(original,'PAGED_NATIVE_ORIGINAL_PRODUCT');return original.capture();}
