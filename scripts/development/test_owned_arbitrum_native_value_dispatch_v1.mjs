/** Isolated HOST: original source + real key/AES/CAS/wire crypto. Native RPC,
 * private original-client pair and provider request issuance are synthetic ports;
 * this case does not establish native birth, consensus, proof or private credit. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,scryptSync,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {constants,existsSync,readFileSync,realpathSync} from 'node:fs';
import {mkdir,open,lstat,realpath,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,parse} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
let root=dirname(fileURLToPath(import.meta.url));while(root!==parse(root).root&&!existsSync(join(root,'scripts/layout.json')))root=dirname(root);
assert.notEqual(root,parse(root).root);root=realpathSync(root);
const [vault,privacy,inputs,encoding,publicCrypto,signing,wire,profile]=await Promise.all([
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-product/src/vault.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-product/src/privacy.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/paeg/readiness-inputs.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/paeg/commitments.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-product/src/private-cohort-public-native.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/native-economic-local-signing-v2.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs')).href),
 import(pathToFileURL(join(root,'.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-native-value-profile.mjs')).href)]);
const source=await readFile(new URL('./owned-arbitrum-native-value-dispatch-v1.mjs',import.meta.url),'utf8');
const bscSource=await readFile(new URL('./owned-bsc-native-value-dispatch-v3.mjs',import.meta.url),'utf8');
const profileSource=await readFile(join(root,'packages/backend/src/chains/evm/transfers/owned-evm-native-value-profile.mjs'),'utf8');
const bscProfile=new Function('assert','createHash',profileSource.replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nreturn {normalizeOwnedBscNativeValueIntentV3};')(assert,createHash);
function host(family='nitro'){
 const bsc=family==='bsc',chainId=bsc?'714':'42161',nativeCode=bsc?'BSC_ORIGINAL_OPERATION_UNCERTAIN':'ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN';
 const alias=name=>bsc?name.replace('normalizeOwnedEvmNativeValueArbitrumIntent','normalizeOwnedBscNativeValueIntentV3').replace('sendOwnedArbitrumNitroSignedTransactionOnceV1','sendOwnedBscNativeValueSignedTransactionOnceV3').replace('ArbitrumNitro','BscPoSA').replace('Arbitrum','Bsc').replace(/V1$/,'V3'):name;

 const pairs=new WeakMap(),requests=new WeakMap(),identities=new WeakMap(),calls=[];let sends=0,keys=0,included=null,currentPrepared=null,lastSigned=null;
 const genesis='0x'+'11'.repeat(32),anchor={number:'0x10',hash:'0x'+'22'.repeat(32),timestamp:'0x77359400',transactions:[],baseFeePerGas:'0x3b9aca00'};
 const later={...anchor,number:'0x11',hash:'0x'+'33'.repeat(32),timestamp:'0x77359402',transactions:[]};
 const identity={profile:'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1',chainId:'42161',genesis:genesis.slice(2),parentGenesis:'44'.repeat(32),sourceCommit:'55'.repeat(20),publicNetwork:false,independentInfrastructureEstablished:false,rollupChallengeFinalityEstablished:false,identity:{endpointIdentity:'66'.repeat(32),clientRelease:'77'.repeat(32),chainConfiguration:'88'.repeat(32)}};
 if(bsc){delete identity.parentGenesis;delete identity.sourceCommit;delete identity.rollupChallengeFinalityEstablished;Object.assign(identity,{profile:'OWNED_BSC_POSA_NATIVE_VALUE_714_V3',chainId,clientSHA256:'44'.repeat(32),genesisSHA256:'55'.repeat(32),validatorCount:3});}
 const originalPair=(runtime,custody)=>assert.equal(pairs.get(runtime),custody,'ARBITRUM_ORIGINAL_CUSTODY_PAIR');
 const rpc=async(runtime,method,params)=>{assert(pairs.has(runtime),'HOST_ORIGINAL_CLIENT');calls.push(method);
  switch(method){
   case 'eth_getBlockByNumber':return params[0]==='0x10'?structuredClone(anchor):params[0]==='0x12'?{...later,number:'0x12',hash:'0x'+'99'.repeat(32),transactions:[lastSigned.nativeId]}:structuredClone(later);
   case 'eth_getTransactionCount':return '0x0';
   case 'eth_getBalance':return '0x8ac7230489e80000';
   case 'eth_getCode':return '0x';
   case 'eth_gasPrice':return '0x3b9aca00';
   case 'eth_estimateGas':return '0x7530';
   case 'eth_getTransactionByHash':return included?.transaction??null;
   case 'eth_getTransactionReceipt':return included?.receipt??null;
   default:assert.fail('HOST_UNEXPECTED_NATIVE_READ');}
 };
 const send=async(runtime,nativeWire)=>{assert(pairs.has(runtime));sends++;assert.equal(sends,1,'HOST_ONE_ORIGINAL_WIRE');lastSigned=wire.decodeCanonicalEvmTransaction(nativeWire);
  const tx=lastSigned,receipt={transactionHash:tx.nativeId,status:'0x1',blockHash:'0x'+'99'.repeat(32),blockNumber:'0x12',transactionIndex:'0x0',gasUsed:'0x7530'};
  included={receipt,transaction:{hash:tx.nativeId,type:'0x0',chainId:'0x'+BigInt(chainId).toString(16),from:tx.from,to:tx.to,nonce:'0x0',gas:'0x186a0',gasPrice:'0x3b9aca00',value:'0x3e8',input:tx.data,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,transactionIndex:receipt.transactionIndex}};
  throw Object.assign(new Error(nativeCode),{code:nativeCode});
 };
 const opener=(request,runtime)=>{const r=requests.get(request);assert(r&&r.runtime===runtime&&!r.opened,'HOST_ORIGINAL_REQUEST_REQUIRED');r.opened=true;return r.scope;};
 const names=['assert','randomBytes','createHash','randomUUID','constants','existsSync','readFileSync','realpathSync','mkdir','open','lstat','realpath','dirname','join','parse','fileURLToPath','performance','Vault','canonical','cloneInput','frozenInput','exactRecord','publicKeccak256','nativeEconomicLocalAddressV2','prepareNativeEconomicLocalSignerV2','consumeNativeEconomicLocalSignerV2','revokeNativeEconomicLocalSignerV2','encodeCanonicalEvmUnsignedTransaction','assertSignedEvmTransaction','normalizeOwnedEvmNativeValueArbitrumIntent','ownedEvmNativeValueAuditCommitments','assertOwnedNativeValueEvmDispatchRequest','assertOwnedArbitrumNitroNativeValueCustodyV1','readOwnedArbitrumNitroNativeValueIdentityV1','readOwnedArbitrumNitroNativeValueRpcV1','sendOwnedArbitrumNitroSignedTransactionOnceV1','HOST_SOURCE_URL'];
 const values=[assert,randomBytes,createHash,randomUUID,constants,existsSync,readFileSync,realpathSync,mkdir,open,lstat,realpath,dirname,join,parse,fileURLToPath,performance,vault.Vault,privacy.canonical,inputs.cloneInput,inputs.frozenInput,encoding.exactRecord,publicCrypto.publicKeccak256,signing.nativeEconomicLocalAddressV2,signing.prepareNativeEconomicLocalSignerV2,t=>{calls.push('KEY');keys++;return signing.consumeNativeEconomicLocalSignerV2(t);},signing.revokeNativeEconomicLocalSignerV2,wire.encodeCanonicalEvmUnsignedTransaction,wire.assertSignedEvmTransaction,bsc?bscProfile.normalizeOwnedBscNativeValueIntentV3:profile.normalizeOwnedEvmNativeValueArbitrumIntent,profile.ownedEvmNativeValueAuditCommitments,opener,originalPair,async r=>{assert(pairs.has(r));return structuredClone(identity);},rpc,send,pathToFileURL(join(root,'scripts/development/'+(bsc?'owned-bsc-native-value-dispatch-v3.mjs':'owned-arbitrum-native-value-dispatch-v1.mjs'))).href];
 const body=(bsc?bscSource:source).replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll('import.meta.url','HOST_SOURCE_URL');
 const exports=['createOriginalArbitrumNativeValueCustodyV1','readOriginalArbitrumNativeValueCustodyPublicV1','bindOriginalArbitrumNativeValueCustodyV1','assertOriginalArbitrumNativeValuePreparedCurrentV1','dispatchOriginalArbitrumNativeValueV1','observeOriginalArbitrumNativeValueV1','closeOriginalArbitrumNativeValueCustodyV1'];
 const actual=new Function(...names.map(alias),...(bsc?['scryptSync','createDecipheriv','timingSafeEqual']:[]),body+'\nreturn {'+exports.map(alias).join(',')+'};')(...values,...(bsc?[scryptSync,createDecipheriv,timingSafeEqual]:[]));
 const api=Object.fromEntries(exports.map(name=>[name,actual[alias(name)]]));
 return {api,pairs,calls,get sends(){return sends;},get keys(){return keys;},get signed(){return lastSigned;},get prepared(){return currentPrepared;},
  issue(custody,runtime,guard=null){const pub=api.readOriginalArbitrumNativeValueCustodyPublicV1(custody),K='aa'.repeat(32),transaction={from:pub.address,to:'0x'+'bb'.repeat(20),value:'0x3e8',gas:'0x186a0',data:'0x'+Buffer.from('LNRB1:'+K,'ascii').toString('hex')},binding={leaseId:'ab'.repeat(32),profileCommitment:'ac'.repeat(32),chainId,genesis:genesis.slice(2),actionCommitment:'ad'.repeat(32),receiptKeyCommitment:K,readyStatement:'ae'.repeat(32),dependencyProofSHA256:'af'.repeat(32),readyProofSHA256:'ba'.repeat(32)};
   const scope=inputs.frozenInput({transaction,binding,async beforeSign(p){currentPrepared=p;await api.assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,p);if(guard)await guard();calls.push('KEY_GUARD');},async onSigned(s){assert.equal(s.nativeId,wire.assertSignedEvmTransaction(s.nativeWire,currentPrepared.transaction).nativeId);await api.assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,currentPrepared);calls.push('PROVIDER_GUARD');},async beforeSend(){await api.assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,currentPrepared);calls.push('SEND_GUARD');}});
   const request=Object.freeze(Object.create(null));requests.set(request,{runtime,scope,opened:false});return request;
  },async bind(custody){const pub=api.readOriginalArbitrumNativeValueCustodyPublicV1(custody),runtime=Object.freeze({metadata:Object.freeze({chainId,evmGenesis:genesis,scratchDirectory:pub.scratchDirectory})});pairs.set(runtime,custody);await api.bindOriginalArbitrumNativeValueCustodyV1(custody,runtime);return runtime;}};
}
test('HOST original Nitro custody precedes native reads; original request guards KEY, lost reply only observes same wire, and close fences pending KEY',async()=>{
 const h=host();let custody,second,otherHost;const directories=[];
 try{
  custody=await h.api.createOriginalArbitrumNativeValueCustodyV1();const pub=h.api.readOriginalArbitrumNativeValueCustodyPublicV1(custody);directories.push(pub.scratchDirectory);
  assert.equal(h.calls.length,0);const runtime=await h.bind(custody),request=h.issue(custody,runtime);
  await assert.rejects(async()=>h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,{...request}),/HOST_ORIGINAL_REQUEST_REQUIRED/);assert.equal(h.keys,0);assert.equal(h.sends,0);
  await assert.rejects(h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,request),/ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN/);assert.equal(h.keys,1);assert.equal(h.sends,1);
  assert.equal(h.calls[h.calls.indexOf('KEY')-1],'KEY_GUARD','no asynchronous work intervenes after the original key guard');
  await assert.rejects(h.api.assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,{...h.prepared}),/ORIGINAL_PREPARATION_REQUIRED/);
  const observed=await h.api.observeOriginalArbitrumNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire,transactionSHA256:h.signed.transactionSHA256});
  assert.equal(observed.status,'observed');assert.equal(observed.nativeWire,h.signed.nativeWire);
  assert.throws(()=>h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,request),/UNKNOWN_NO_FRESH_SEND/);assert.equal(h.keys,1);assert.equal(h.sends,1);
  await assert.rejects(h.api.observeOriginalArbitrumNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire+'00',transactionSHA256:h.signed.transactionSHA256}));
  const bytes=await readFile(join(pub.scratchDirectory,'original-nitro-native-value.vault'),'utf8');assert(!bytes.includes('privateKey')&&!bytes.includes('user_alice'),'physical ciphertext does not disclose its original key or name');
  const other=host();otherHost=other;second=await other.api.createOriginalArbitrumNativeValueCustodyV1();directories.push(other.api.readOriginalArbitrumNativeValueCustodyPublicV1(second).scratchDirectory);
  const sameRuntime=await other.bind(second);let release,entered;const ready=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});
  const pending=other.api.dispatchOriginalArbitrumNativeValueV1(second,sameRuntime,other.issue(second,sameRuntime,async()=>{entered();await held;}));pending.catch(()=>{});await ready;
  const closing=other.api.closeOriginalArbitrumNativeValueCustodyV1(second);release();await assert.rejects(pending,/CUSTODY_CLOSING/);await closing;
  assert.equal(other.keys,0);assert.equal(other.sends,0);second=null;
 }finally{if(custody)await h.api.closeOriginalArbitrumNativeValueCustodyV1(custody);if(second)await otherHost.api.closeOriginalArbitrumNativeValueCustodyV1(second);for(const directory of directories)await rm(directory,{recursive:true,force:true});}
});


test('HOST original BSC714 custody is before native reads, rejects foreign preparation and observes one retained wire after lost reply',async()=>{
 const h=host('bsc');let custody;const directories=[];
 try{custody=await h.api.createOriginalArbitrumNativeValueCustodyV1();const pub=h.api.readOriginalArbitrumNativeValueCustodyPublicV1(custody);directories.push(pub.scratchDirectory);
  assert.equal(h.calls.length,0);assert.equal(pub.publicNetwork,false);assert.equal(pub.localLaboratorySigner,true);
  const runtime=await h.bind(custody),request=h.issue(custody,runtime);
  await assert.rejects(async()=>h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,{...request}),/HOST_ORIGINAL_REQUEST_REQUIRED/);assert.equal(h.keys,0);assert.equal(h.sends,0);
  await assert.rejects(h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,request),/BSC_ORIGINAL_OPERATION_UNCERTAIN/);assert.equal(h.keys,1);assert.equal(h.sends,1);assert.equal(h.signed.chainId,'714');
  assert.throws(()=>bscProfile.normalizeOwnedBscNativeValueIntentV3({transaction:{from:pub.address,to:'0x'+'bb'.repeat(20),value:'0x3e8',gas:'0x186a0',data:h.prepared.transaction.data},binding:{...h.prepared.binding,chainId:'56'}},{accounts:[pub.address],genesis:'0x'+h.prepared.binding.genesis}),/LOCAL_CHAIN_ONLY/);
  assert.equal(h.calls[h.calls.indexOf('KEY')-1],'KEY_GUARD');
  await assert.rejects(h.api.assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,{...h.prepared}),/ORIGINAL_PREPARATION_REQUIRED/);
  const observed=await h.api.observeOriginalArbitrumNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire,transactionSHA256:h.signed.transactionSHA256});assert.equal(observed.status,'observed');assert.equal(observed.nativeWire,h.signed.nativeWire);
  assert.throws(()=>h.api.dispatchOriginalArbitrumNativeValueV1(custody,runtime,request),/UNKNOWN_NO_FRESH_SEND/);assert.equal(h.keys,1);assert.equal(h.sends,1);
  await assert.rejects(h.api.observeOriginalArbitrumNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire+'00',transactionSHA256:h.signed.transactionSHA256}));
  const encrypted=await readFile(join(pub.scratchDirectory,'original-bsc-native-value.vault'),'utf8');assert(!encrypted.includes('privateKey'),'physical Vault retains ciphertext only');
 }finally{if(custody)await h.api.closeOriginalArbitrumNativeValueCustodyV1(custody);for(const directory of directories)await rm(directory,{recursive:true,force:true});}
});
