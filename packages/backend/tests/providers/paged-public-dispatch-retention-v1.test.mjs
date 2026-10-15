/** HOST unit: genuine provider/Vault/key store/signatures/journal/adapters.
 * Authority/receiver issuance and RPC responses are explicitly inert fixtures.
 * No RPC network, proof, public confirmation or financial acceptance is claimed. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import * as Graph from '@lianum/engine/execution/graph/funded-graph-paged-v3';
import {nativeTransferActionCommitment} from '@lianum/engine/execution/native/dispatch/native-capsules';
import {nativeDispatchStatementFrame} from '@lianum/engine/execution/native/dispatch/native-admission';
import {normalizeNativeQuorumRegistry,nativeQuorumRegistryCommitment,NATIVE_QUORUM_PROFILE} from '@lianum/engine/evidence/native-quorum';
import {normalizeDevicePagedEconomicSettlementRowV3} from '../../../mobile-protocol/src/device-paged-economic-view-v3.mjs';
import {normalizeDevicePagedNativePreparationV3} from '@lianum/mobile-protocol/device/paged-graph-v3';
import {normalizeDevicePagedDescriptorV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {initializePublicPagedServerKeysV1} from '../../src/chains/public-testnet/key-store-v1.mjs';
import {publicPagedAccountFromKeyV1} from '../../src/chains/public-testnet/wire-v1.mjs';
import {publicPagedTestnetNetworksV1} from '../../src/chains/public-testnet/profile-v1.mjs';
import {createOriginalPagedPublicTestnetRuntimesV1} from '../../src/providers/paged-public-testnet-runtimes-v1.mjs';
import {readPagedNativeProviderCredentialV3,PAGED_NATIVE_PROVIDER_RETENTION_PROFILE_V3} from '../../src/providers/paged-native-provider-retention-v3.mjs';

const h=s=>createHash('sha256').update('DECLARED_PUBLIC_DISPATCH_HOST:'+s).digest('hex'),copy=structuredClone;
const url=p=>new URL(p,import.meta.url).href,services=new WeakMap(),issued=new WeakMap(),observedReceivers=new WeakSet();let context;
mock.module('@lianum/proofs/tooling/original-paged-artifacts-v3',{exports:{Graph}});
mock.module(url('../../src/operations/local/funded-paged-native-source-v3.mjs'),{exports:{assertOriginalPagedNativeFinancialSourceV3(){}}});
mock.module(url('../../src/operations/local/funded-graph-paged-device-graph-operator-v3.mjs'),{exports:{readOriginalDevicePagedGraphExecutionContextV3(service){const c=services.get(service);assert.ok(c,'HOST_ORIGINAL_SERVICE');return c;},async readOriginalDevicePagedGraphProviderBirthContextV5(service){const c=services.get(service);assert.ok(c,'HOST_ORIGINAL_SERVICE');return c;}}});
mock.module(url('../../src/operations/local/funded-graph-paged-deployment-v3.mjs'),{exports:{readOriginalFundedPagedGraphDeploymentV3(runtime,system){assert.equal(runtime,context.runtime);assert.equal(system,context.system);return{async call(){return'0x'+'0'.repeat(64);}};},pagedGraphStaticDataV3(){throw Error('HOST_UNUSED');}}});
mock.module(url('../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs'),{exports:{
 assertOwnedLocalEvmObservedClockV1(runtime){assert.ok(observedReceivers.has(runtime),'HOST_ORIGINAL_OBSERVED_RECEIVER');},
 createOwnedOriginalPagedNativeRuntimesV3(){throw Error('HOST_LOCAL_BIRTH_FORBIDDEN');},createOwnedOriginalPagedDurableNativeRuntimesV3(){throw Error('HOST_LOCAL_BIRTH_FORBIDDEN');},
 openOriginalPagedUniswapConstructionV3(){throw Error('HOST_UNUSED');},reopenOwnedOriginalPagedNativeRuntimesV3(){throw Error('HOST_UNUSED');},captureOwnedOriginalPagedNativeRuntimesV3(){throw Error('HOST_UNUSED');},assertOwnedDeviceExternalFlatReceiverLiveV1(){throw Error('HOST_UNUSED');},assertOwnedLocalPagedNativeEvmV3(){throw Error('HOST_UNUSED');},
}});
mock.module(url('../../src/accounts/authority/device-paged-note-authority-v3.mjs'),{exports:{
 readOriginalDevicePagedRetainedSourceDescriptorV5:account=>account.descriptor(),
 async bindOriginalDevicePagedNativePreparationV3(account){assert.equal(account,context.account);},
 readOriginalPagedNativeQuoteScopeV3(token,provider){const record=issued.get(token);assert.ok(record?.kind==='scope'&&record.provider===provider,'HOST_ORIGINAL_SCOPE');return copy(record.scope);},
 async readOriginalDevicePagedNativeDispatchV3(token,provider){const record=issued.get(token);assert.ok(record?.kind==='grant'&&record.provider===provider&&!record.revoked,'HOST_ORIGINAL_GRANT');return{ready:copy(record.ready),quoteScope:copy(record.scope),head:await context.runtime.block()};},
 async consumeOriginalDevicePagedProviderRetentionV3(token,provider){const record=issued.get(token);assert.ok(record?.kind==='seal'&&record.provider===provider&&!record.used);record.used=true;return{...context,purpose:'SEAL',journalPassword:record.password,journalRevision:0,current(){assert.ok(!record.revoked);},release(){assert.ok(!record.released);record.released=true;}};},
}});

test('one genuine signature and POST survive lost reply; same durable nativeId is observed after reopening',async()=>{
 const root=await mkdtemp(join(tmpdir(),'public-dispatch-retention-host-')),runtimeDirectory=join(root,'runtime'),providerDirectory=join(root,'provider'),networks=publicPagedTestnetNetworksV1();let provider,runtime,reopened,credential,supervisor,sends=0,receiptReads=0;
 const oldFetch=globalThis.fetch,now=Math.floor(Date.now()/1000),head={hash:'0x'+h('head'),number:'0x64',timestamp:'0x'+now.toString(16),baseFeePerGas:'0x1'};
 let vault,providerPoint;
 globalThis.fetch=async(raw,options={})=>{
  const endpoint=String(raw);
  if(endpoint.includes('mempool.space'))return new Response(networks[1].network.genesisHash);
  const request=JSON.parse(options.body);let result;
  if(endpoint.includes('devnet.solana.com')){assert.equal(request.method,'getGenesisHash');result=networks[2].network.genesisHash;}
  else switch(request.method){
   case 'eth_chainId':result='0xaa36a7';break;
   case 'eth_getBlockByNumber':result=request.params[0]==='0x0'?{hash:networks[0].network.genesisHash}:head;break;
   case 'eth_getBalance':result='0x10000000000000';break;
   case 'eth_getTransactionCount':result='0x0';break;
   case 'eth_maxPriorityFeePerGas':result='0x1';break;
   case 'eth_getCode':result='0x';break;
   case 'eth_estimateGas':result='0x7530';break;
   case 'eth_getTransactionReceipt':receiptReads++;result=null;break;
   case 'eth_sendRawTransaction':{
    sends++;assert.equal(sends,1,'HOST_SOLE_POST');
    const lower=JSON.parse(await readFile(join(runtimeDirectory,'dispatch-journal','native-wallet.json'),'utf8')).operations[0];assert.equal(lower.phase,'SUBMITTING');assert.equal(lower.signed.nativeWire,request.params[0]);
    const upper=(await vault.read(credential.providerPassword)).data.deliveries[0];assert.equal(upper.stage,'SIGNED');assert.deepEqual(upper.signed,lower.signed);assert.equal(upper.dispatch.actionCommitment,lower.actionCommitment);
    const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(providerPoint.x,'hex').toString('base64url'),y:Buffer.from(providerPoint.y,'hex').toString('base64url')}});
    assert.ok(verify('sha256',nativeDispatchStatementFrame(upper.dispatch),{key,dsaEncoding:'ieee-p1363'},Buffer.from(upper.dispatchSignature,'hex')));throw Error('HOST_LOST_NETWORK_RESPONSE');
   }
   default:throw Error('HOST_UNEXPECTED_RPC_'+request.method);
  }
  return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}));
 };
 try{
  await initializePublicPagedServerKeysV1(join(runtimeDirectory,'keys'));runtime=await createOriginalPagedPublicTestnetRuntimesV1({directory:runtimeDirectory});const P=await import('../../src/providers/funded-paged-native-provider-v3.mjs');provider=await P.createOriginalPagedPublicNativeProviderV4({directory:providerDirectory},runtime);
  await assert.rejects(P.createOriginalPagedPublicNativeProviderV4({directory:join(root,'second-provider')},runtime),/PUBLIC_PROVIDER_ALREADY_BOUND/);assert.equal(runtime.checkpoint().keysetId,runtime.metadata.keysetId);
  const config=provider.publicConfiguration;assert.deepEqual(normalizeDevicePagedNativePreparationV3({family:'EVM',chainDomain:config.chainDomain,evidencePolicy:config.evidencePolicy,networks:config.networks}).networks,config.networks);assert.equal(config.publicExecution.networks[0].networkId,'ethereum-sepolia');
  const hubDomain=h('hub'),registry=normalizeNativeQuorumRegistry({profile:NATIVE_QUORUM_PROFILE,hubDomain,registryEpoch:'1',rulesRoot:config.rulesRoot.slice(2),keys:config.attesterKeys}),system={hubDomain,registry,registryCommitment:nativeQuorumRegistryCommitment(registry),scope:h('scope'),policy:h('policy'),assetIdentity:h('asset'),manifestSHA256:h('manifest'),consumerSHA256:h('consumer')},point=config.attesterKeys[0];
  const descriptor=normalizeDevicePagedDescriptorV3({profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://127.0.0.1:9445',pairingId:'declared-public-host-pair',devicePublicKey:'04'+point.x+point.y,deadlineMs:Date.now()+60000,chainId:'11155111',genesis:h('receiver-genesis'),pool:'0x'+'11'.repeat(20),state:'0x'+'22'.repeat(20),native:'0x'+'33'.repeat(20),scope:system.scope,policy:system.policy,assetIdentity:system.assetIdentity,domain:h('domain'),hubDomain,registryCommitment:system.registryCommitment,manifestSHA256:system.manifestSHA256,consumerSHA256:system.consumerSHA256,poolCodeHash:h('pool'),stateCodeHash:h('state'),nativeCodeHash:h('native'),math:'0x'+'44'.repeat(20),mathCodeHash:h('math')});
  const receiver={async refreshObservedClock(){},async block(){return copy(head);},async assertCanonical(value){assert.deepEqual(value,head);}};observedReceivers.add(receiver);context={runtime:receiver,system,account:{descriptor:()=>copy(descriptor)}};const service=Object.freeze({});services.set(service,context);await P.bindOriginalPagedNativeProviderV3(provider,service);
  const seal=Object.freeze({}),journalPassword=h('journal');issued.set(seal,{kind:'seal',provider,password:journalPassword});const checkpoint=await P.sealOriginalPagedNativeProviderRetentionV3(provider,seal);credential=await readPagedNativeProviderCredentialV3(providerDirectory,journalPassword,{profile:PAGED_NATIVE_PROVIDER_RETENTION_PROFILE_V3,providerIdentity:checkpoint.providerIdentity,configurationSHA256:checkpoint.configurationSHA256});vault=new Vault(join(providerDirectory,'provider.vault'));
  const settleBefore=String(now+3600),scope={descriptor,graphId:'graph-declared-public-host',rootId:h('root'),revision:2,budget:'100',settleBefore,sourceScope:system.scope,assetIdentity:system.assetIdentity},scopeToken=Object.freeze({});issued.set(scopeToken,{kind:'scope',provider,scope});const network=config.networks[0],recipient=publicPagedAccountFromKeyV1('ethereum-sepolia',Buffer.alloc(32,2)).address;
  await P.prepareOriginalPagedNativeActionsV3(provider,{preparation:{preparationId:'paged-page-'+h('prep').slice(0,32),pageIndex:'0',nodes:[{id:'ethereum',ordinal:'0',chainDomain:network.chainDomain,evidencePolicy:network.evidencePolicy,amount:'100',receiptKeyCommitment:h('K'),receiptRho:h('rho'),payoutCommitment:h('payout'),intent:{family:'EVM',recipient,amount:'1000'}}]},settleBefore},scopeToken);
  const stored=(await vault.read(credential.providerPassword)).data,q=stored.preparations[0].rows[0];providerPoint=stored.providerKey;const grant=Object.freeze({});issued.set(grant,{kind:'grant',provider,scope,ready:{id:q.id,action:copy(q.action),public:{authorizationRoot:h('auth'),reserveNullifier:h('reserve'),readyCommitment:h('ready'),progressCommitment:h('progress')},packet:{authorizationRoot:h('auth'),node:{ordinal:q.ordinal,actionCommitment:nativeTransferActionCommitment(q.action),localCommitment:q.localCommitment,dispatchId:q.dispatchId,payoutCommitment:q.payoutCommitment,receiptKeyCommitment:q.action.receiptKeyCommitment}}}});
  await assert.rejects(P.executeOriginalPagedNativeReadyV3(provider,{...grant}),/HOST_ORIGINAL_GRANT/);const sent=await P.executeOriginalPagedNativeReadyV3(provider,grant);assert.equal(sent.status,'UNKNOWN');assert.equal(sends,1);assert.match(sent.nativeId,/^0x[0-9a-f]{64}$/);
  const economic=await P.readOriginalPagedNativeEconomicSettlementV3(provider,'ethereum');assert.equal(normalizeDevicePagedEconomicSettlementRowV3(economic,descriptor).classification,'PAGED_PUBLIC_TESTNET_RPC_PROVIDER_V1');const falselyLocal=copy(economic);falselyLocal.classification='LOCAL_SYNTHETIC_COMMON_OPERATOR_3_OF_4';assert.throws(()=>normalizeDevicePagedEconomicSettlementRowV3(falselyLocal,descriptor),/MOBILE_PAGED/);
  const signed=(await vault.read(credential.providerPassword)).data.deliveries[0].signed;assert.equal(signed.nativeId,sent.nativeId);const repeated=await P.executeOriginalPagedNativeReadyV3(provider,grant);assert.equal(repeated.nativeId,signed.nativeId);assert.equal((await P.reconcileOriginalPagedNativeDeliveryV3(provider,'ethereum')).status,'UNKNOWN');assert.equal(sends,1);
  const keysetId=runtime.metadata.keysetId,savedProvider=await P.captureOriginalPagedNativeProviderV3(provider),Recovery=await import('../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),supervisorConfig={directory:join(root,'supervisor'),password:h('supervisor-credential')};
  await mkdir(supervisorConfig.directory,{mode:0o700});supervisor=await Recovery.createOriginalPagedPublicSupervisorRetentionV4(supervisorConfig,descriptor);await supervisor.capture({deployment:{profile:'ORIGINAL_PAGED_SEPOLIA_DEPLOYMENT_RETENTION_V4',system:{receiverProfile:'ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4',...Object.fromEntries(['pool','state','native','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256'].map(k=>[k,descriptor[k]]))},configuration:{HOST_INERT:true}},authority:{profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor,identity:h('authority'),journalRevision:0,journalDataSHA256:h('journal'),ownerCheckpoint:{HOST_INERT:true}},provider:savedProvider,native:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:runtimeDirectory,keysetId,configuration:runtime.publicConfiguration,checkpoint:runtime.checkpoint(),source:null}});await supervisor.close();supervisor=await Recovery.openOriginalPagedPublicSupervisorRetentionV4(supervisorConfig);
  await provider.close();provider=null;runtime=null;reopened=await createOriginalPagedPublicTestnetRuntimesV1({directory:runtimeDirectory});assert.equal(reopened.metadata.keysetId,keysetId);const providerToken=await supervisor.issueComponent('provider');await assert.rejects(P.reopenOriginalPagedPublicNativeProviderV4({directory:providerDirectory,journalPassword},{...providerToken},reopened),/PAGED_SUPERVISOR_ORIGINAL_OPEN_TOKEN/);provider=await P.reopenOriginalPagedPublicNativeProviderV4({directory:providerDirectory,journalPassword},providerToken,reopened);assert.deepEqual(provider.publicConfiguration,config);await P.bindOriginalPagedNativeProviderV3(provider,service);assert.deepEqual(P.readOriginalPagedNativeProviderCheckpointV3(provider),savedProvider.checkpoint);assert.equal((await P.reconcileOriginalPagedNativeDeliveryV3(provider,'ethereum')).status,'UNKNOWN');assert.equal(sends,1);const observed=await reopened.observe('ethereum',h('auth'));assert.equal(observed.nativeId,signed.nativeId);assert.equal(observed.transactionSHA256,signed.transactionSHA256);assert.equal(observed.status,'UNKNOWN');assert.equal(observed.automaticRebroadcast,false);assert.equal(sends,1);assert.ok(receiptReads>=2);
  const retained=JSON.parse(await readFile(join(runtimeDirectory,'dispatch-journal','native-wallet.json'),'utf8'));assert.equal(retained.operations.length,1);assert.deepEqual(retained.operations[0].signed,signed);
 }finally{await supervisor?.close();await provider?.close();await runtime?.close();await reopened?.close();credential&&(credential.providerPassword=null);globalThis.fetch=oldFetch;await rm(root,{recursive:true,force:true});}
});
