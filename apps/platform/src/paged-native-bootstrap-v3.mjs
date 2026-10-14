/** Fixed LOCAL Paged native product. Private startup DATA chooses no runtime,
 * factory or provider. Birth never replaces retained state; explicit reopening
 * authenticates a complete controlled capture under the same wallet identity. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateKey,createPublicKey,X509Certificate,createHash} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {readPrivateGatewayRecord} from './gateway-pairing.mjs';
import {platformDiagnostic} from './diagnostics.mjs';
import {normalizeDevicePagedDescriptorV3} from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeDevicePagedNativePreparationV3} from '../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';

const directory=fileURLToPath(new URL('../../../.local/device-paged-native-v3',import.meta.url));
const mixedDirectory=fileURLToPath(new URL('../../../.local/device-paged-mixed-product-v3',import.meta.url));
const retainedNames=Object.freeze(['startup.json','paired-descriptor.json','paired-connection.json','capabilities.json','authority','native']);
// A LAN origin is explicit private configuration, never an HTTP selector.
// Only a private IPv4 address actually assigned to this host may be bound.
function assignedPrivateIPv4(value){
 if(isIP(value)!==4)return false;const [a,b]=value.split('.').map(Number);
 if(!(a===10||a===172&&b>=16&&b<=31||a===192&&b===168))return false;
 return Object.values(networkInterfaces()).some(rows=>(rows??[]).some(row=>row.family==='IPv4'&&!row.internal&&row.address===value));
}
const exact=(raw,keys)=>{
 assert.ok(raw&&Object.getPrototypeOf(raw)===Object.prototype,'PAGED_NATIVE_STARTUP_DATA');
 assert.deepEqual(Reflect.ownKeys(raw).sort(),[...keys].sort(),'PAGED_NATIVE_STARTUP_FIELDS');
 for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(raw,key),'value'),'PAGED_NATIVE_STARTUP_DATA');
};
const digest=(value,prefix=false)=>{
 assert.ok(typeof value==='string'&&(prefix?/^0x[0-9a-f]{64}$/:/^[0-9a-f]{64}$/).test(value),'PAGED_NATIVE_STARTUP_DIGEST');
 assert.notEqual(value,prefix?'0x'+'0'.repeat(64):'0'.repeat(64),'PAGED_NATIVE_STARTUP_DIGEST');
};
async function privateDirectory(path){
 const state=await lstat(path);
 assert.ok(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o777)===0o700&&await realpath(path)===path,'PAGED_NATIVE_STARTUP_PRIVATE_DIRECTORY');
}
async function syncDirectory(path){const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await handle.sync();}finally{await handle.close();}}
async function publishExclusive(directory,name,value){
 await privateDirectory(directory);const bytes=Buffer.from(JSON.stringify(value)+'\n');
 assert.ok(bytes.length>0&&bytes.length<=32768,'PAGED_NATIVE_STARTUP_PUBLIC_BOUND');
 const handle=await open(join(directory,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(bytes);await handle.sync();const state=await handle.stat();assert.ok(state.isFile()&&state.uid===process.getuid()&&state.nlink===1&&(state.mode&0o777)===0o600,'PAGED_NATIVE_STARTUP_PRIVATE_FILE');}
 finally{bytes.fill(0);await handle.close();}await syncDirectory(directory);
}

export function originalPagedNativeConfigurationPathV3(){assert.equal(arguments.length,0);return join(directory,'operator.json');}
export function originalPagedMixedConfigurationPathV3(){assert.equal(arguments.length,0);return join(mixedDirectory,'operator.json');}

/** Bounded private file input only. Paths must remain in this same new product
 * directory; network/provider/registry/attester selection is not an input. */
export function normalizePrivatePagedNativeStartupV3(raw,privateRoot){
 assert.equal(arguments.length,2);assert.equal(resolve(privateRoot),privateRoot,'PAGED_NATIVE_STARTUP_DIRECTORY');
 exact(raw,['deployment','journal','nativeDirectory','origin','devicePublicKey','tls','host']);
 exact(raw.deployment,['manifestSHA256','consumerSHA256','deploymentDomain','policy',...(Object.hasOwn(raw.deployment,'minimumDepositAtomic')?['minimumDepositAtomic']:[])]);exact(raw.journal,['path','password']);exact(raw.tls,['key','cert']);
 for(const key of ['manifestSHA256','consumerSHA256'])digest(raw.deployment[key]);
 for(const key of ['deploymentDomain','policy'])digest(raw.deployment[key],true);
 assert.equal(raw.journal.path,join(privateRoot,'authority','journal.vault'),'PAGED_NATIVE_STARTUP_JOURNAL_PATH');
 assert.equal(raw.nativeDirectory,join(privateRoot,'native'),'PAGED_NATIVE_STARTUP_PROVIDER_PATH');
 assert.ok(typeof raw.journal.password==='string'&&raw.journal.password.length>=32&&raw.journal.password.length<=4096,'PAGED_NATIVE_STARTUP_JOURNAL_PASSWORD');
 assert.ok(typeof raw.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.test(raw.devicePublicKey),'PAGED_NATIVE_STARTUP_DEVICE_KEY');
 createPublicKey({key:{kty:'EC',crv:'secp256k1',x:Buffer.from(raw.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(raw.devicePublicKey.slice(66),'hex').toString('base64url')},format:'jwk'});
 assert.ok(typeof raw.origin==='string'&&raw.origin.length<=2048&&(['127.0.0.1','::1'].includes(raw.host)||assignedPrivateIPv4(raw.host)),'PAGED_NATIVE_STARTUP_LOCAL_ORIGIN');
 const origin=new URL(raw.origin),hostname=origin.hostname.replace(/^\[|\]$/g,'');
 assert.ok(origin.origin===raw.origin&&origin.protocol==='https:'&&origin.port&&!origin.username&&!origin.password&&!origin.search&&!origin.hash&&origin.pathname==='/'&&(['localhost','127.0.0.1','::1'].includes(hostname)||hostname===raw.host&&assignedPrivateIPv4(hostname)),'PAGED_NATIVE_STARTUP_LOCAL_ORIGIN');
 assert.ok(hostname==='localhost'&&['127.0.0.1','::1'].includes(raw.host)||hostname===raw.host,'PAGED_NATIVE_STARTUP_LISTENER_BINDING');
 assert.ok(typeof raw.tls.key==='string'&&Buffer.byteLength(raw.tls.key)<=8192&&typeof raw.tls.cert==='string'&&Buffer.byteLength(raw.tls.cert)<=16384,'PAGED_NATIVE_STARTUP_TLS_BOUND');
 const certificate=new X509Certificate(raw.tls.cert),key=createPrivateKey(raw.tls.key),publicKey=createPublicKey(key);assert.ok(!certificate.ca,'PAGED_NATIVE_STARTUP_TLS_LEAF');
 assert.ok(publicKey.export({format:'der',type:'spki'}).equals(certificate.publicKey.export({format:'der',type:'spki'})),'PAGED_NATIVE_STARTUP_TLS_KEY');
 assert.ok(isIP(hostname)?certificate.checkIP(hostname):certificate.checkHost(hostname),'PAGED_NATIVE_STARTUP_TLS_HOST');
 const now=Date.now();assert.ok(now>=Date.parse(certificate.validFrom)&&now<Date.parse(certificate.validTo),'PAGED_NATIVE_STARTUP_TLS_VALIDITY');
 return structuredClone(raw);
}

/** Reserve a fresh retained lifetime before any runtime or listener can start.
 * Even an interrupted/failed attempt stays visible for explicit investigation. */
export async function preparePrivatePagedNativeStartupV3(privateRoot){
 assert.equal(arguments.length,1);return preparePrivatePagedStartupV3(privateRoot,false);
}
export async function preparePrivatePagedMixedStartupV3(privateRoot){
 assert.equal(arguments.length,1);return preparePrivatePagedStartupV3(privateRoot,true);
}
async function preparePrivatePagedStartupV3(privateRoot,mixed){
 await privateDirectory(privateRoot);
 const {value:raw}=await readPrivateGatewayRecord(privateRoot,'operator.json');let config;
 try{if(mixed)assert.equal(new URL(raw.origin).port,'9445','PAGED_MIXED_STARTUP_FIXED_PORT');config=normalizePrivatePagedNativeStartupV3(raw,privateRoot);}finally{raw.tls=null;if(raw.journal)raw.journal.password=null;}
 try{
  for(const name of [...retainedNames,'supervisor.vault','supervisor-owner.lock'])await lstat(join(privateRoot,name)).then(()=>{
   const error=Error('PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN');error.code='PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN';throw error;
  },error=>{if(error.code!=='ENOENT')throw error;});
  await publishExclusive(privateRoot,'startup.json',{profile:mixed?'DEVICE_PAGED_MIXED_LOCAL_STARTUP_V3':'DEVICE_PAGED_NATIVE_LOCAL_STARTUP_V3',localOnly:true,automaticFunding:false,economicReopen:true,createdAt:Date.now()});
  for(const name of ['authority','native']){const path=join(privateRoot,name);await mkdir(path,{mode:0o700});await privateDirectory(path);}
  await syncDirectory(privateRoot);return config;
 }catch(error){config.tls=null;config.journal.password=null;throw error;}
}
/** Read the same private startup and public identity. The backend alone opens
 * the authenticated CAPTURED supervisor; this helper adopts no public DTO. */
export async function preparePrivatePagedNativeReopenV3(privateRoot){
 assert.equal(arguments.length,1);return preparePrivatePagedReopenV3(privateRoot,false);
}
export async function preparePrivatePagedMixedReopenV3(privateRoot){
 assert.equal(arguments.length,1);return preparePrivatePagedReopenV3(privateRoot,true);
}
async function preparePrivatePagedReopenV3(privateRoot,mixed){
 await privateDirectory(privateRoot);const {value:raw}=await readPrivateGatewayRecord(privateRoot,'operator.json');let config;
 try{config=normalizePrivatePagedNativeStartupV3(raw,privateRoot);}finally{raw.tls=null;if(raw.journal)raw.journal.password=null;}
 try{for(const name of retainedNames)await lstat(join(privateRoot,name));await lstat(join(privateRoot,'supervisor.vault'));const {value:startup}=await readPrivateGatewayRecord(privateRoot,'startup.json');exact(startup,['profile','localOnly','automaticFunding','economicReopen','createdAt']);assert.equal(startup.profile,mixed?'DEVICE_PAGED_MIXED_LOCAL_STARTUP_V3':'DEVICE_PAGED_NATIVE_LOCAL_STARTUP_V3','PAGED_REOPEN_PROFILE');assert.ok(startup.localOnly===true&&startup.automaticFunding===false&&startup.economicReopen===true,'PAGED_REOPEN_CAPTURE_REQUIRED');if(mixed)assert.equal(new URL(config.origin).port,'9445','PAGED_MIXED_STARTUP_FIXED_PORT');const {value:pairing}=await readPrivateGatewayRecord(privateRoot,'paired-descriptor.json');exact(pairing,['format','descriptor']);assert.equal(pairing.format,'DEVICE_PAGED_PRIVATE_GRAPH_PAIRING_V3');const descriptor=normalizeDevicePagedDescriptorV3(pairing.descriptor);assert.equal(descriptor.origin,config.origin);assert.equal(descriptor.devicePublicKey,config.devicePublicKey);assert.equal(descriptor.manifestSHA256,config.deployment.manifestSHA256);assert.equal(descriptor.consumerSHA256,config.deployment.consumerSHA256);return config;}catch(error){config.tls=null;config.journal.password=null;throw error;}
}

/** Public pairing DATA from the original product. No key, password, receipt,
 * accepted proof or reopening capability is serialized into these files. */
export async function publishNewPagedNativePairV3(privateRoot,product){
 assert.equal(arguments.length,2);return publishNewPagedPairV3(privateRoot,product,false);
}
export async function publishNewPagedMixedPairV3(privateRoot,product){
 assert.equal(arguments.length,2);return publishNewPagedPairV3(privateRoot,product,true);
}
async function publishNewPagedPairV3(privateRoot,product,mixed){
 assert.equal(product.profile,'ORIGINAL_DEVICE_PAGED_LOCAL_SYNTHETIC_NATIVE_OPERATOR_V3','PAGED_NATIVE_STARTUP_PRODUCT');
 if(mixed){assert.ok(product.uniswap&&product.controlledColdReopenSupported===true,'PAGED_MIXED_STARTUP_ORIGINAL_PRODUCT');assert.deepEqual(product.providerConfiguration.uniswap,product.uniswap,'PAGED_MIXED_STARTUP_PROVIDER_CONFIGURATION');}
 else assert.ok(!Object.hasOwn(product,'uniswap')&&!Object.hasOwn(product.providerConfiguration,'uniswap'),'PAGED_NATIVE_STARTUP_THREE_NETWORK_PRODUCT');
 const descriptor=normalizeDevicePagedDescriptorV3(product.descriptor),configuration=product.providerConfiguration,
  nativePreparation=normalizeDevicePagedNativePreparationV3({family:'EVM',chainDomain:configuration.chainDomain,evidencePolicy:configuration.evidencePolicy,networks:configuration.networks,...(mixed?{uniswap:product.uniswap}:{})},descriptor);
 assert.deepEqual(nativePreparation.networks.map(network=>network.family).sort(),['BTC','EVM','SOL'],'PAGED_NATIVE_STARTUP_THREE_NETWORKS');
 if(mixed){const certificate=new X509Certificate(nativePreparation.uniswap.targetConnection.transport.certificatePEM),host=new URL(descriptor.origin).hostname.replace(/^\[|\]$/g,'');assert.equal(new URL(descriptor.origin).port,'9445','PAGED_MIXED_STARTUP_FIXED_PORT');assert.equal(createHash('sha256').update(certificate.raw).digest('hex'),nativePreparation.uniswap.targetConnection.transport.certificateSHA256,'PAGED_MIXED_STARTUP_TARGET_TLS_PIN');assert.ok(!certificate.ca,'PAGED_NATIVE_STARTUP_TLS_LEAF');assert.ok(isIP(host)?certificate.checkIP(host):certificate.checkHost(host),'PAGED_NATIVE_STARTUP_TLS_HOST');assert.ok(Date.now()>=Date.parse(certificate.validFrom)&&Date.now()<Date.parse(certificate.validTo),'PAGED_NATIVE_STARTUP_TLS_VALIDITY');}
 await publishExclusive(privateRoot,'paired-descriptor.json',{format:'DEVICE_PAGED_PRIVATE_GRAPH_PAIRING_V3',descriptor});
 await publishExclusive(privateRoot,'capabilities.json',{profile:mixed?'DEVICE_PAGED_MIXED_LOCAL_CAPABILITIES_V3':'DEVICE_PAGED_NATIVE_LOCAL_CAPABILITIES_V3',classification:'LOCAL_SYNTHETIC_COMMON_OPERATOR_3_OF_4',localOnly:true,automaticFunding:false,economicReopen:true,publicDeployment:false,independentOperators:false,nativePreparation});
}

/** Public app connection. The descriptor keeps the original owner/authority
 * family; the only addition is its exact public TLS leaf, bound to that origin. */
export async function publishNewPagedNativeConnectionV3(privateRoot,product,certificatePEM){
 assert.equal(arguments.length,3);assert.equal(product.profile,'ORIGINAL_DEVICE_PAGED_LOCAL_SYNTHETIC_NATIVE_OPERATOR_V3','PAGED_NATIVE_STARTUP_PRODUCT');
 const descriptor=normalizeDevicePagedDescriptorV3(product.descriptor),hostname=new URL(descriptor.origin).hostname.replace(/^\[|\]$/g,'');
 assert.ok(typeof certificatePEM==='string'&&Buffer.byteLength(certificatePEM)>0&&Buffer.byteLength(certificatePEM)<=16384,'PAGED_NATIVE_STARTUP_TLS_BOUND');
 const certificate=new X509Certificate(certificatePEM),now=Date.now();assert.ok(!certificate.ca,'PAGED_NATIVE_STARTUP_TLS_LEAF');
 assert.ok(isIP(hostname)?certificate.checkIP(hostname):certificate.checkHost(hostname),'PAGED_NATIVE_STARTUP_TLS_HOST');
 assert.ok(now>=Date.parse(certificate.validFrom)&&now<Date.parse(certificate.validTo),'PAGED_NATIVE_STARTUP_TLS_VALIDITY');
 const profile={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM,certificateSHA256:createHash('sha256').update(certificate.raw).digest('hex')}};
 await publishExclusive(privateRoot,'paired-connection.json',profile);return Object.freeze(profile);
}

export async function runOriginalPagedNativeProfileV3(profile){
 assert.equal(arguments.length,1);assert.ok(['paged-native-new','paged-native-reopen','paged-mixed-new','paged-mixed-reopen'].includes(profile),'PLATFORM_PROFILE_INVALID');const reopening=profile.endsWith('-reopen'),mixed=profile.startsWith('paged-mixed-'),privateRoot=mixed?mixedDirectory:directory;
 assert.equal(process.execPath,fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),'PAGED_NATIVE_STARTUP_PINNED_NODE');
 assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED,'0');
 const entry=await realpath(process.argv[1]),common=fileURLToPath(new URL('./entry.mjs',import.meta.url)),runner=fileURLToPath(new URL('./run-original-device-paged-native-v3.mjs',import.meta.url));
 assert.equal(entry,process.argv[1],'PAGED_NATIVE_STARTUP_ENTRY_ALIAS');
 assert.ok(entry===common&&process.argv.length===3&&process.argv[2]===profile||entry===runner&&process.argv.length===2,'PAGED_NATIVE_STARTUP_ENTRY');
 let acquisition,service,closing,closed=false,readCaptureFailure=()=>null,readStartupFailure=()=>null,startupStage='SOURCE';const startupAbort=new AbortController();
 const closeCodes=new Set(['SOLANA_RECOVERY_OWNED_ADMIN_SOCKET','SOLANA_RECOVERY_ORIGINAL_ADMIN_PATH','SOLANA_RECOVERY_ADMIN_TIMEOUT','SOLANA_RECOVERY_ADMIN_UNAVAILABLE','SOLANA_RECOVERY_ADMIN_RESPONSE','SOLANA_RECOVERY_ADMIN_ORIGINAL_PID','SOLANA_RECOVERY_ADMIN_EXIT_ACK','SOLANA_RECOVERY_NATIVE_JOIN_NOT_ESTABLISHED','SOLANA_RECOVERY_REQUIRES_ORDERLY_NATIVE_TERMINAL']);
 const startupStages=new Set(['SOURCE','CONFIG','ACQUIRE','PAIR']);
 const startupCodes=new Set(['CURRENT_SOURCE_DIGEST','CURRENT_SOURCE_PUBLIC_PATH','CURRENT_SOURCE_ALIAS','CURRENT_SOURCE_REGULAR_FILE','CURRENT_SOURCE_CHANGED_DURING_READ','CURRENT_SOURCE_BYTES','CURRENT_SOURCE_PIN','CURRENT_SOURCE_PATH','CURRENT_SOURCE_BYTE_COUNT','CURRENT_SOURCE_DUPLICATE','CURRENT_SOURCE_ADOPTION_CHANGED','CURRENT_SOURCE_GENERATION_CHANGED','CURRENT_SOURCE_CANDIDATE_CHANGED',
  'EADDRINUSE','EACCES','EPERM','ENOENT','ECONNREFUSED','ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','PAGED_NATIVE_STARTUP_DATA','PAGED_NATIVE_STARTUP_FIELDS','PAGED_NATIVE_STARTUP_DIGEST','PAGED_NATIVE_STARTUP_PRIVATE_DIRECTORY','PAGED_NATIVE_STARTUP_PUBLIC_BOUND','PAGED_NATIVE_STARTUP_PRIVATE_FILE','PAGED_NATIVE_STARTUP_DIRECTORY','PAGED_NATIVE_STARTUP_JOURNAL_PATH','PAGED_NATIVE_STARTUP_PROVIDER_PATH','PAGED_NATIVE_STARTUP_JOURNAL_PASSWORD','PAGED_NATIVE_STARTUP_DEVICE_KEY','PAGED_NATIVE_STARTUP_LOCAL_ORIGIN','PAGED_NATIVE_STARTUP_LISTENER_BINDING','PAGED_NATIVE_STARTUP_TLS_BOUND','PAGED_NATIVE_STARTUP_TLS_LEAF','PAGED_NATIVE_STARTUP_TLS_KEY','PAGED_NATIVE_STARTUP_TLS_HOST','PAGED_NATIVE_STARTUP_TLS_VALIDITY','PAGED_NATIVE_STARTUP_PRODUCT','PAGED_NATIVE_STARTUP_THREE_NETWORK_PRODUCT','PAGED_NATIVE_STARTUP_THREE_NETWORKS','PAGED_NATIVE_STARTUP_TARGET_TLS_PIN','PAGED_NATIVE_REOPEN_CONFIGURATION_REQUIRED','PAGED_NATIVE_SETUP_RETAINED_DIRECTORY','PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN','PAGED_NATIVE_REOPEN_SAME_PAIRING','PAGED_REOPEN_PROFILE','PAGED_REOPEN_CAPTURE_REQUIRED','PAGED_MIXED_STARTUP_FIXED_PORT','PAGED_MIXED_STARTUP_SHARED_TLS_CERTIFICATE','PAGED_MIXED_STARTUP_ORIGINAL_PRODUCT','PAGED_MIXED_STARTUP_PROVIDER_CONFIGURATION']);
 function finiteFailureCode(error,codes){try{if(!(error instanceof Error))return'UNCLASSIFIED';for(const name of ['code','message']){const value=Object.getOwnPropertyDescriptor(error,name)?.value;if(typeof value==='string'){const newline=value.indexOf('\n'),candidate=newline<0?value:value.slice(0,newline);if(codes.has(candidate))return candidate;}}}catch{}return'UNCLASSIFIED';}
 function reportStartupFailure(error){
  try{if(readStartupFailure(error)===null)console.error('LIANUM_PAGED_START_FAILURE',startupStages.has(startupStage)?startupStage:'SOURCE',finiteFailureCode(error,startupCodes));}catch{}
 }
 function reportCloseFailure(error){
  try{if(readCaptureFailure(error)===null)console.error('LIANUM_PAGED_CAPTURE_FAILURE','RESOURCE_CLOSE',finiteFailureCode(error,closeCodes));}catch{}
  platformDiagnostic('SERVICE_CLOSE_FAILED');
 }
 function close(){closed=true;startupAbort.abort();return closing??=(async()=>{if(acquisition)service=await acquisition;if(service){const result=await service.close();assert.ok(result.closed&&result.originalResourcesStopped&&result.ownedSocketsRemaining===0&&result.automaticFunding===false,'PAGED_NATIVE_STARTUP_CLOSE_UNCONFIRMED');}process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);platformDiagnostic('SERVICE_STOPPED');})();}
 function stop(){void close().catch(error=>{process.exitCode=1;reportCloseFailure(error);});}
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 let config;
 try{
  const {assertOriginalPagedNativeFinancialSourceV3}=await import('@lianum/backend/operations/local/funded-paged-native-source-v3');assertOriginalPagedNativeFinancialSourceV3();
  const {startOriginalPagedNativeOperatorV3,reopenOriginalPagedNativeOperatorV3,startOriginalPagedMixedNativeOperatorV3,reopenOriginalPagedMixedNativeOperatorV3,readOriginalPagedCaptureFailureV3,readOriginalPagedStartupFailureV3}=await import('@lianum/backend/operations/local/funded-paged-native-operator-v3');readCaptureFailure=readOriginalPagedCaptureFailureV3;readStartupFailure=readOriginalPagedStartupFailureV3;
  startupStage='CONFIG';
  await lstat(join(privateRoot,'operator.json')).catch(async error=>{
   if(error.code!=='ENOENT')throw error;
   assert.ok(!reopening,'PAGED_NATIVE_REOPEN_CONFIGURATION_REQUIRED');
   const {configureNewPagedNativeStartupV3,configureNewPagedMixedStartupV3}=await import('./paged-native-configure-v3.mjs');await (mixed?configureNewPagedMixedStartupV3:configureNewPagedNativeStartupV3)(privateRoot,startupAbort.signal);
  });
  if(closed)return Object.freeze({close,stoppedBeforeStartup:true});
  config=await (reopening?mixed?preparePrivatePagedMixedReopenV3:preparePrivatePagedNativeReopenV3:mixed?preparePrivatePagedMixedStartupV3:preparePrivatePagedNativeStartupV3)(privateRoot);
  if(closed)return Object.freeze({close,stoppedBeforeStartup:true});
  process.stderr.write(mixed?'PAGED_MIXED_LOCAL_ONLY: Ethereum, Bitcoin, Solana and original Uniswap composition. Controlled shutdown retains the same operation and ERC20 custody. Abrupt or incomplete capture stays closed for investigation. No automatic note funding.\n':'PAGED_NATIVE_LOCAL_ONLY: owned local chains and common operators. Controlled shutdown retains the original private state; abrupt or incomplete capture stays closed for investigation.\n');
  startupStage='ACQUIRE';const certificatePEM=config.tls.cert;acquisition=(reopening?mixed?reopenOriginalPagedMixedNativeOperatorV3:reopenOriginalPagedNativeOperatorV3:mixed?startOriginalPagedMixedNativeOperatorV3:startOriginalPagedNativeOperatorV3)(config);acquisition.catch(()=>{});config.tls=null;config.journal.password=null;
  service=await acquisition;
  startupStage='PAIR';
  if(closed)await close();else{if(reopening){const {value:retained}=await readPrivateGatewayRecord(privateRoot,'paired-descriptor.json');assert.deepEqual(retained.descriptor,service.descriptor,'PAGED_NATIVE_REOPEN_SAME_PAIRING');}else{if(mixed)assert.equal(service.uniswap.targetConnection.transport.certificatePEM,certificatePEM,'PAGED_MIXED_STARTUP_SHARED_TLS_CERTIFICATE');await (mixed?publishNewPagedMixedPairV3:publishNewPagedNativePairV3)(privateRoot,service);await publishNewPagedNativeConnectionV3(privateRoot,service,certificatePEM);}if(closed)await close();else{platformDiagnostic('SERVICE_STARTED');process.stdout.write((mixed?'ORIGINAL_DEVICE_PAGED_MIXED_LOCAL_SERVICE_READY\n':'ORIGINAL_DEVICE_PAGED_NATIVE_LOCAL_SERVICE_READY\n')+'Conexión pública para importar en la app: '+join(privateRoot,'paired-connection.json')+'\n');}}
  return Object.freeze({close,origin:service.origin,localOnly:true,economicReopen:true,reopenedOriginalState:reopening,automaticFunding:false});
 }catch(error){
  reportStartupFailure(error);
  if(error.message==='PAGED_NATIVE_SETUP_RETAINED_DIRECTORY')process.stderr.write('PAGED_NATIVE_SETUP_RETAINED_DIRECTORY: existing setup is preserved; no private configuration is replaced automatically.\n');
  if(error.code==='PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN')process.stderr.write('PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN: existing state is preserved; this profile cannot reopen or replace it.\n');
  try{await close();}catch(closeError){if(closeError!==error)reportCloseFailure(closeError);}
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);throw error;
 }finally{if(config){config.tls=null;config.journal.password=null;}}
}
