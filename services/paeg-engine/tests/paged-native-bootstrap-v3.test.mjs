import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomUUID,createHash,X509Certificate} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preparePrivatePagedNativeStartupV3,preparePrivatePagedMixedStartupV3,preparePrivatePagedMixedReopenV3,preparePrivatePagedNativeReopenV3,normalizePrivatePagedNativeStartupV3,publishNewPagedNativePairV3,publishNewPagedMixedPairV3,publishNewPagedNativeConnectionV3,originalPagedMixedConfigurationPathV3} from '../src/bootstrap/paged-native-bootstrap-v3.mjs';
import {DEVICE_PAGED_OWNER_V3,DEVICE_PAGED_GRAPH_V3,DEVICE_PAGED_SPARSE_V3} from '@lianum/mobile-protocol/device/paged-owner-v3';

// HOST configuration and public framing only. No backend operator, native node,
// prover, original receipt or economic reopening is started by these tests.
const run=promisify(execFile),hex=index=>index.toString(16).padStart(64,'0');
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'lianum-paged-native-bootstrap-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await run('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',join(directory,'test-key.pem'),'-out',join(directory,'test-cert.pem'),'-days','1','-subj','/CN=localhost','-addext','basicConstraints=critical,CA:FALSE','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1']);
 const pair=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),publicKey=pair.publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(publicKey.x,'base64url').toString('hex')+Buffer.from(publicKey.y,'base64url').toString('hex'),
  config={deployment:{manifestSHA256:hex(1),consumerSHA256:hex(2),deploymentDomain:'0x'+hex(3),policy:'0x'+hex(4)},journal:{path:join(directory,'authority','journal.vault'),password:'test-only-journal-password-1234567890'},nativeDirectory:join(directory,'native'),origin:'https://localhost:9443',devicePublicKey,tls:{key:await readFile(join(directory,'test-key.pem'),'utf8'),cert:await readFile(join(directory,'test-cert.pem'),'utf8')},host:'127.0.0.1'};
 await writeFile(join(directory,'operator.json'),JSON.stringify(config),{mode:0o600});return{directory,config};
}

test('Paged native new startup reserves private directories and cannot silently restart its retained lifetime',async t=>{
 const {directory,config}=await fixture(t),originalConfig=await readFile(join(directory,'operator.json'));
 const input=await preparePrivatePagedNativeStartupV3(directory);
 assert.equal(input.nativeDirectory,config.nativeDirectory);assert.equal(input.journal.path,config.journal.path);
 for(const name of ['authority','native'])assert.equal((await stat(join(directory,name))).mode&0o777,0o700);
 assert.equal((await stat(join(directory,'startup.json'))).mode&0o777,0o600);
 const before=await readFile(join(directory,'startup.json'));
 await assert.rejects(preparePrivatePagedNativeStartupV3(directory),{code:'PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN'});
 assert.deepEqual(await readFile(join(directory,'startup.json')),before);
 assert.deepEqual(await readFile(join(directory,'operator.json')),originalConfig);
 assert.throws(()=>normalizePrivatePagedNativeStartupV3({...config,nativeDirectory:join(directory,'outside')},directory),/PROVIDER_PATH/);
 assert.throws(()=>normalizePrivatePagedNativeStartupV3({...config,provider:'unreviewed'},directory),/STARTUP_FIELDS/);
});

test('Paged native existing pairing is preserved before any startup marker or native directory is created',async t=>{
 const {directory}=await fixture(t),path=join(directory,'paired-descriptor.json');
 await writeFile(path,'{"retained":true}\n',{mode:0o600});const before=await readFile(path);
 await assert.rejects(preparePrivatePagedNativeStartupV3(directory),{code:'PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN'});
 assert.deepEqual(await readFile(path),before);
 await assert.rejects(stat(join(directory,'startup.json')),{code:'ENOENT'});
 await assert.rejects(stat(join(directory,'native')),{code:'ENOENT'});
});

test('Paged native publishes the actual app pairing shape and local three-network capabilities without secrets or replacement',async t=>{
 const {directory,config}=await fixture(t);await preparePrivatePagedNativeStartupV3(directory);
 const descriptor={profile:DEVICE_PAGED_OWNER_V3,graphProfile:DEVICE_PAGED_GRAPH_V3,sparseEncoding:DEVICE_PAGED_SPARSE_V3,origin:config.origin,pairingId:randomUUID(),devicePublicKey:config.devicePublicKey,deadlineMs:Date.now()+60000,chainDeadlineSeconds:'9000',chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map((key,i)=>[key,hex(i+10)])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+hex(i+30).slice(-40)]))},
  networks=['EVM','BTC','SOL'].map((family,i)=>({family,label:family+' local',chainDomain:hex(i+50),evidencePolicy:hex(i+60),assetSymbol:['ETH','BTC','SOL'][i],decimals:[18,8,9][i],destinations:[]})),
  product={profile:'ORIGINAL_DEVICE_PAGED_LOCAL_SYNTHETIC_NATIVE_OPERATOR_V3',descriptor,providerConfiguration:{chainDomain:networks[0].chainDomain,evidencePolicy:networks[0].evidencePolicy,networks}};
 await publishNewPagedNativePairV3(directory,product);
 const path=join(directory,'paired-descriptor.json'),bytes=await readFile(path),pairing=JSON.parse(bytes),capabilities=JSON.parse(await readFile(join(directory,'capabilities.json')));
 assert.deepEqual(Object.keys(pairing).sort(),['descriptor','format']);assert.equal(pairing.format,'DEVICE_PAGED_PRIVATE_GRAPH_PAIRING_V3');
 assert.equal(capabilities.localOnly,true);assert.equal(capabilities.economicReopen,true);assert.equal(capabilities.automaticFunding,false);
 assert.deepEqual(capabilities.nativePreparation.networks.map(network=>network.family),['EVM','BTC','SOL']);
 for(const name of ['paired-descriptor.json','capabilities.json'])assert.equal((await stat(join(directory,name))).mode&0o777,0o600);
 assert.equal(bytes.includes(Buffer.from(config.journal.password)),false);assert.equal(bytes.includes(Buffer.from('PRIVATE KEY')),false);
 await assert.rejects(publishNewPagedNativePairV3(directory,product),{code:'EEXIST'});assert.deepEqual(await readFile(path),bytes);
});

test('Paged native entry rejects extra arguments before configuration or original resources',async()=>{
 const node=fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),entry=fileURLToPath(new URL('../src/entry.mjs',import.meta.url));
 await assert.rejects(run(node,['--max-old-space-size=384',entry,'paged-native-new','unreviewed']),error=>error.code===1&&error.stdout===''&&error.stderr.includes('PLATFORM_PROFILE_INVALID'));
});

test('Mixed uses a fresh fixed-port realm and publishes three networks plus the original target TLS and template',async t=>{
 const {directory,config}=await fixture(t);config.origin='https://localhost:9445';await writeFile(join(directory,'operator.json'),JSON.stringify(config),{mode:0o600});
 assert.ok(originalPagedMixedConfigurationPathV3().endsWith('/.local/device-paged-mixed-product-v3/operator.json'));
 await preparePrivatePagedMixedStartupV3(directory);const marker=JSON.parse(await readFile(join(directory,'startup.json')));assert.equal(marker.profile,'DEVICE_PAGED_MIXED_LOCAL_STARTUP_V3');assert.equal(marker.economicReopen,true);
 const descriptor={profile:DEVICE_PAGED_OWNER_V3,graphProfile:DEVICE_PAGED_GRAPH_V3,sparseEncoding:DEVICE_PAGED_SPARSE_V3,origin:config.origin,pairingId:randomUUID(),devicePublicKey:config.devicePublicKey,deadlineMs:Date.now()+60000,chainDeadlineSeconds:'9000',chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map((key,i)=>[key,hex(i+10)])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+hex(i+30).slice(-40)]))},
  networks=['EVM','BTC','SOL'].map((family,i)=>({family,label:family+' local',chainDomain:hex(i+50),evidencePolicy:hex(i+60),assetSymbol:['ETH','BTC','SOL'][i],decimals:[18,8,9][i],destinations:[]})),
  target={profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin:'https://localhost:9446',pairingId:hex(80),devicePublicKey:config.devicePublicKey,lifetime:hex(81),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map((key,i)=>[key,hex(i+90).slice(0,['pool','asset','hub'].includes(key)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'OUT',decimals:18}},
  uniswap={configuration:{family:'EVM',label:'Uniswap exact-output local',chainDomain:hex(70),evidencePolicy:hex(71),assetSymbol:'OUT',decimals:18,destinations:[]},targetConnection:{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:target,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:config.tls.cert,certificateSHA256:createHash('sha256').update(new X509Certificate(config.tls.cert).raw).digest('hex')}},template:{maximumInput:'200',outputAmount:'100',recipient:hex(111).slice(-40),inputAsset:{asset:hex(112).slice(-40),assetIdentity:hex(113),symbol:'IN',decimals:6}}};
 // Public HOST DATA, not an original operator or a proof of deployed liquidity.
 descriptor.manifestSHA256=config.deployment.manifestSHA256;descriptor.consumerSHA256=config.deployment.consumerSHA256;
 for(const name of ['pool','asset','hub'])target.poolTerms[name]=hex(['pool','asset','hub'].indexOf(name)+90).slice(-40);
 const product={profile:'ORIGINAL_DEVICE_PAGED_LOCAL_SYNTHETIC_NATIVE_OPERATOR_V3',descriptor,providerConfiguration:{chainDomain:networks[0].chainDomain,evidencePolicy:networks[0].evidencePolicy,networks,uniswap},uniswap,controlledColdReopenSupported:true};
 const wrong=structuredClone(product);wrong.uniswap.targetConnection.transport.certificateSHA256='f'.repeat(64);wrong.providerConfiguration.uniswap=wrong.uniswap;
 await assert.rejects(publishNewPagedMixedPairV3(directory,wrong),/TARGET_TLS_PIN/);await assert.rejects(stat(join(directory,'paired-descriptor.json')),{code:'ENOENT'});
 await publishNewPagedMixedPairV3(directory,product);await publishNewPagedNativeConnectionV3(directory,product,config.tls.cert);
 const capabilities=JSON.parse(await readFile(join(directory,'capabilities.json'))),connection=JSON.parse(await readFile(join(directory,'paired-connection.json')));
 assert.equal(capabilities.economicReopen,true);assert.equal(capabilities.automaticFunding,false);assert.deepEqual(capabilities.nativePreparation.networks.map(row=>row.family),['EVM','BTC','SOL']);assert.deepEqual(capabilities.nativePreparation.uniswap,uniswap);assert.equal(connection.descriptor.origin,config.origin);assert.equal(connection.transport.certificateSHA256,uniswap.targetConnection.transport.certificateSHA256);
 const before=await readFile(join(directory,'paired-connection.json'));assert.equal(before.includes(Buffer.from(config.journal.password)),false);assert.equal(before.includes(Buffer.from('PRIVATE KEY')),false);
 for(const name of ['paired-descriptor.json','paired-connection.json','capabilities.json'])assert.equal((await stat(join(directory,name))).mode&0o777,0o600);
 await assert.rejects(preparePrivatePagedMixedStartupV3(directory),{code:'PAGED_NATIVE_RETAINED_STATE_NO_ECONOMIC_REOPEN'});assert.deepEqual(await readFile(join(directory,'paired-connection.json')),before);
 // Only private configuration/public framing is checked here. This inert file
 // cannot issue an original supervisor opening token or restore a runtime.
 await writeFile(join(directory,'supervisor.vault'),'HOST_INERT_NO_OPENING_CAPABILITY',{mode:0o600});
 const reopened=await preparePrivatePagedMixedReopenV3(directory);assert.deepEqual(reopened,config);
 assert.deepEqual(await readFile(join(directory,'paired-connection.json')),before);
 await assert.rejects(preparePrivatePagedNativeReopenV3(directory),/PAGED_REOPEN_PROFILE/);
 const startupPath=join(directory,'startup.json'),startupBytes=await readFile(startupPath);
 await writeFile(startupPath,JSON.stringify({...marker,economicReopen:false}),{mode:0o600});
 await assert.rejects(preparePrivatePagedMixedReopenV3(directory),/PAGED_REOPEN_CAPTURE_REQUIRED/);
 assert.deepEqual(await readFile(join(directory,'paired-connection.json')),before);
 await writeFile(startupPath,startupBytes,{mode:0o600});
 await rm(join(directory,'supervisor.vault'));await assert.rejects(preparePrivatePagedMixedReopenV3(directory),{code:'ENOENT'});
});

test('Mixed rejects old listener ports and unknown CLI flags before any resource can start',async t=>{
 const {directory}=await fixture(t);await assert.rejects(preparePrivatePagedMixedStartupV3(directory),/PAGED_MIXED_STARTUP_FIXED_PORT/);await assert.rejects(stat(join(directory,'startup.json')),{code:'ENOENT'});
 const node=fileURLToPath(new URL('../../../.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node',import.meta.url)),entry=fileURLToPath(new URL('../src/entry.mjs',import.meta.url));
 for(const args of [['paged-mixed-new','caller-provider'],['paged-mixed-reopen','caller-provider']])await assert.rejects(run(node,['--max-old-space-size=384',entry,...args]),error=>error.code===1&&error.stdout===''&&error.stderr.includes('PLATFORM_PROFILE_INVALID'));
});
