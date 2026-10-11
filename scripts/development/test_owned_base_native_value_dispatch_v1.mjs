/** Isolated HOST: original source + real key/AES/CAS/wire crypto. Native RPC,
 * private original-client pair and provider request issuance are synthetic ports;
 * this case does not establish native birth, consensus, proof or private credit. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {constants,existsSync,readFileSync,realpathSync} from 'node:fs';
import {mkdir,open,lstat,realpath,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,parse} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
let root=dirname(fileURLToPath(import.meta.url));while(root!==parse(root).root&&!existsSync(join(root,'scripts/layout.json')))root=dirname(root);
assert.notEqual(root,parse(root).root);root=realpathSync(root);
const [vault,privacy,inputs,encoding,publicCrypto,signing,wire,profile]=await Promise.all([
 import('../../packages/engine/src/crypto/vault.mjs'),
 import('../../packages/engine/src/crypto/privacy.mjs'),
 import('../../packages/components/src/plain-input.mjs'),
 import('../../packages/components/src/encoding/commitments.mjs'),
 import('../../packages/engine/src/cohorts/private-cohort-public-native.mjs'),
 import('../../packages/backend/src/chains/evm/runtime/native-economic-local-signing-v2.mjs'),
 import('../../packages/backend/src/chains/evm/contracts/transaction-wire-codec.mjs'),
 import('../../packages/backend/src/chains/evm/transfers/owned-evm-native-value-profile.mjs')]);
const source=await readFile(new URL('./owned-base-native-value-dispatch-v1.mjs',import.meta.url),'utf8');
function host(options={}){
 const pairs=new WeakMap(),requests=new WeakMap(),identities=new WeakMap(),calls=[];let sends=0,keys=0,feeReads=0,included=null,currentPrepared=null,lastSigned=null;
 const genesis='0x'+'11'.repeat(32),anchor={number:'0x10',hash:'0x'+'22'.repeat(32),timestamp:'0x77359400',transactions:[],baseFeePerGas:'0x3b9aca00'};
 const later={...anchor,number:'0x11',hash:'0x'+'33'.repeat(32),timestamp:'0x77359402',transactions:[]};
 const identity={profile:'OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1',chainId:'8453',genesis:genesis.slice(2),parentGenesis:'44'.repeat(32),sourceCommit:'55'.repeat(20),publicNetwork:false,independentInfrastructureEstablished:false,rollupChallengeFinalityEstablished:false,identity:{endpointIdentity:'66'.repeat(32),clientRelease:'77'.repeat(32),chainConfiguration:'88'.repeat(32)}};
 const originalPair=(runtime,custody)=>assert.equal(pairs.get(runtime),custody,'ARBITRUM_ORIGINAL_CUSTODY_PAIR');
 const rpc=async(runtime,method,params)=>{assert(pairs.has(runtime),'HOST_ORIGINAL_CLIENT');calls.push(method);
  switch(method){
   case 'eth_getBlockByNumber':return params[0]==='0x10'?structuredClone(anchor):params[0]==='0x12'?{...later,number:'0x12',hash:'0x'+'99'.repeat(32),transactions:[lastSigned.nativeId]}:structuredClone(later);
   case 'eth_getTransactionCount':return '0x0';
   case 'eth_getBalance':return options.lowFunds?'0x'+(100000000000000n+1000n+10n).toString(16):'0x8ac7230489e80000';
   case 'eth_getCode':return params[0]==='0x'+'bb'.repeat(20)?'0x':'0x6000';
   case 'eth_getStorageAt':return '0x'+'0'.repeat(24)+'cc'.repeat(20);
   case 'eth_call':{const data=params[0].data,word=v=>BigInt(v).toString(16).padStart(64,'0');
    assert.equal(params[0].to,'0x420000000000000000000000000000000000000f');
    if(data==='0x960e3a23')return '0x'+word(options.invalidOracle?0:1);
    if(data==='0x54fd4d50')return '0x'+word(32)+word(5)+Buffer.from('1.6.0').toString('hex').padEnd(64,'0');
    if(data.startsWith('0xf1c7a58b')){feeReads++;return '0x'+word(options.feeRise&&feeReads>1?2000:1000);}
    if(data.startsWith('0x275aedd2'))return '0x'+word(100);
    if(data.startsWith('0x49948e0e'))return '0x'+word(900);
    assert.fail('HOST_FIXED_FEE_ORACLE_SELECTOR');}

   case 'eth_gasPrice':return '0x3b9aca00';
   case 'eth_estimateGas':return '0x7530';
   case 'eth_getTransactionByHash':return included?.transaction??null;
   case 'eth_getTransactionReceipt':return included?.receipt??null;
   default:assert.fail('HOST_UNEXPECTED_NATIVE_READ');}
 };
 const send=async(runtime,nativeWire)=>{assert(pairs.has(runtime));sends++;assert.equal(sends,1,'HOST_ONE_ORIGINAL_WIRE');lastSigned=wire.decodeCanonicalEvmTransaction(nativeWire);
  const tx=lastSigned,receipt={transactionHash:tx.nativeId,status:'0x1',l1Fee:'0x384',blockHash:'0x'+'99'.repeat(32),blockNumber:'0x12',transactionIndex:'0x0',gasUsed:'0x7530'};
  included={receipt,transaction:{hash:tx.nativeId,type:'0x0',chainId:'0x2105',from:tx.from,to:tx.to,nonce:'0x0',gas:'0x186a0',gasPrice:'0x3b9aca00',value:'0x3e8',input:tx.data,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber,transactionIndex:receipt.transactionIndex}};
  throw Object.assign(new Error('ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN'),{code:'ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN'});
 };
 const opener=(request,runtime)=>{const r=requests.get(request);assert(r&&r.runtime===runtime&&!r.opened,'HOST_ORIGINAL_REQUEST_REQUIRED');r.opened=true;return r.scope;};
 const names=['assert','randomBytes','createHash','randomUUID','constants','existsSync','readFileSync','realpathSync','mkdir','open','lstat','realpath','dirname','join','parse','fileURLToPath','performance','Vault','canonical','cloneInput','frozenInput','exactRecord','publicKeccak256','nativeEconomicLocalAddressV2','prepareNativeEconomicLocalSignerV2','consumeNativeEconomicLocalSignerV2','revokeNativeEconomicLocalSignerV2','encodeCanonicalEvmUnsignedTransaction','assertSignedEvmTransaction','normalizeOwnedEvmNativeValueBaseIntent','ownedEvmNativeValueAuditCommitments','assertOwnedNativeValueEvmDispatchRequest','assertOwnedBaseRollupNativeValueCustodyV1','readOwnedBaseRollupNativeValueIdentityV1','readOwnedBaseRollupNativeValueRpcV1','sendOwnedBaseRollupSignedTransactionOnceV1','HOST_SOURCE_URL'];
 const values=[assert,randomBytes,createHash,randomUUID,constants,existsSync,readFileSync,realpathSync,mkdir,open,lstat,realpath,dirname,join,parse,fileURLToPath,performance,vault.Vault,privacy.canonical,inputs.cloneInput,inputs.frozenInput,encoding.exactRecord,publicCrypto.publicKeccak256,signing.nativeEconomicLocalAddressV2,signing.prepareNativeEconomicLocalSignerV2,t=>{calls.push('KEY');keys++;return signing.consumeNativeEconomicLocalSignerV2(t);},signing.revokeNativeEconomicLocalSignerV2,wire.encodeCanonicalEvmUnsignedTransaction,wire.assertSignedEvmTransaction,profile.normalizeOwnedEvmNativeValueBaseIntent,profile.ownedEvmNativeValueAuditCommitments,opener,originalPair,async r=>{assert(pairs.has(r));return structuredClone(identity);},rpc,send,pathToFileURL(join(root,'scripts/development/owned-base-native-value-dispatch-v1.mjs')).href];
 const body=source.replace(/^import .*;\n/gm,'').replace(/export /g,'').replaceAll('import.meta.url','HOST_SOURCE_URL');
 const exports=['createOriginalBaseNativeValueCustodyV1','readOriginalBaseNativeValueCustodyPublicV1','bindOriginalBaseNativeValueCustodyV1','assertOriginalBaseNativeValuePreparedCurrentV1','dispatchOriginalBaseNativeValueV1','observeOriginalBaseNativeValueV1','closeOriginalBaseNativeValueCustodyV1'];
 const api=new Function(...names,body+'\nreturn {'+exports.join(',')+'};')(...values);
 return {api,pairs,calls,get sends(){return sends;},get keys(){return keys;},get signed(){return lastSigned;},get prepared(){return currentPrepared;},
  issue(custody,runtime,guard=null){const pub=api.readOriginalBaseNativeValueCustodyPublicV1(custody),K='aa'.repeat(32),transaction={from:pub.address,to:'0x'+'bb'.repeat(20),value:'0x3e8',gas:'0x186a0',data:'0x'+Buffer.from('LNRB1:'+K,'ascii').toString('hex')},binding={leaseId:'ab'.repeat(32),profileCommitment:'ac'.repeat(32),chainId:'8453',genesis:genesis.slice(2),actionCommitment:'ad'.repeat(32),receiptKeyCommitment:K,readyStatement:'ae'.repeat(32),dependencyProofSHA256:'af'.repeat(32),readyProofSHA256:'ba'.repeat(32)};
   const scope=inputs.frozenInput({transaction,binding,async beforeSign(p){currentPrepared=p;await api.assertOriginalBaseNativeValuePreparedCurrentV1(custody,runtime,p);if(guard)await guard();calls.push('KEY_GUARD');},async onSigned(s){assert.equal(s.nativeId,wire.assertSignedEvmTransaction(s.nativeWire,currentPrepared.transaction).nativeId);await api.assertOriginalBaseNativeValuePreparedCurrentV1(custody,runtime,currentPrepared);calls.push('PROVIDER_GUARD');},async beforeSend(){await api.assertOriginalBaseNativeValuePreparedCurrentV1(custody,runtime,currentPrepared);calls.push('SEND_GUARD');}});
   const request=Object.freeze(Object.create(null));requests.set(request,{runtime,scope,opened:false});return request;
  },async bind(custody){const pub=api.readOriginalBaseNativeValueCustodyPublicV1(custody),runtime=Object.freeze({metadata:Object.freeze({chainId:'8453',evmGenesis:genesis,scratchDirectory:pub.scratchDirectory})});pairs.set(runtime,custody);await api.bindOriginalBaseNativeValueCustodyV1(custody,runtime);return runtime;}};
}
test('HOST original Base GPO bounds principal plus L1/L2/operator before KEY; original guards and one retained wire survive lost reply',async()=>{
 const h=host();let custody,second,otherHost;const directories=[];
 try{
  custody=await h.api.createOriginalBaseNativeValueCustodyV1();const pub=h.api.readOriginalBaseNativeValueCustodyPublicV1(custody);directories.push(pub.scratchDirectory);
  assert.equal(h.calls.length,0);const runtime=await h.bind(custody),request=h.issue(custody,runtime);
  await assert.rejects(async()=>h.api.dispatchOriginalBaseNativeValueV1(custody,runtime,{...request}),/HOST_ORIGINAL_REQUEST_REQUIRED/);assert.equal(h.keys,0);assert.equal(h.sends,0);
  await assert.rejects(h.api.dispatchOriginalBaseNativeValueV1(custody,runtime,request),/ARBITRUM_ORIGINAL_OPERATION_UNCERTAIN/);assert.equal(h.keys,1);assert.equal(h.sends,1);
  assert.equal(h.calls[h.calls.indexOf('KEY')-1],'KEY_GUARD','no asynchronous work intervenes after the original key guard');
  await assert.rejects(h.api.assertOriginalBaseNativeValuePreparedCurrentV1(custody,runtime,{...h.prepared}),/ORIGINAL_PREPARATION_REQUIRED/);
  const observed=await h.api.observeOriginalBaseNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire,transactionSHA256:h.signed.transactionSHA256});
  assert.equal(observed.status,'observed');assert.equal(observed.nativeWire,h.signed.nativeWire);
  assert.throws(()=>h.api.dispatchOriginalBaseNativeValueV1(custody,runtime,request),/UNKNOWN_NO_FRESH_SEND/);assert.equal(h.keys,1);assert.equal(h.sends,1);
  await assert.rejects(h.api.observeOriginalBaseNativeValueV1(custody,runtime,{nativeId:h.signed.nativeId.slice(2),nativeWire:h.signed.nativeWire+'00',transactionSHA256:h.signed.transactionSHA256}));
  const bytes=await readFile(join(pub.scratchDirectory,'original-base-native-value.vault'),'utf8');assert(!bytes.includes('privateKey')&&!bytes.includes('ANVIL_ACCOUNT_0_KEY'),'physical ciphertext does not disclose its original key or name');
  // L2-only sufficiency must not pass the actual private total-fee guard.
  for(const options of [{lowFunds:true},{feeRise:true}]){
   const denied=host(options),owned=await denied.api.createOriginalBaseNativeValueCustodyV1();directories.push(denied.api.readOriginalBaseNativeValueCustodyPublicV1(owned).scratchDirectory);
   try{const client=await denied.bind(owned);await assert.rejects(denied.api.dispatchOriginalBaseNativeValueV1(owned,client,denied.issue(owned,client)),options.lowFunds?/PRINCIPAL_L1_L2_OPERATOR_FUNDS/:/ROLLUP_FEE_CAP/);assert.equal(denied.keys,0);assert.equal(denied.sends,0);}finally{await denied.api.closeOriginalBaseNativeValueCustodyV1(owned);}
  }
  const other=host();otherHost=other;second=await other.api.createOriginalBaseNativeValueCustodyV1();directories.push(other.api.readOriginalBaseNativeValueCustodyPublicV1(second).scratchDirectory);
  const sameRuntime=await other.bind(second);let release,entered;const ready=new Promise(r=>{entered=r;}),held=new Promise(r=>{release=r;});
  const pending=other.api.dispatchOriginalBaseNativeValueV1(second,sameRuntime,other.issue(second,sameRuntime,async()=>{entered();await held;}));pending.catch(()=>{});await ready;
  const closing=other.api.closeOriginalBaseNativeValueCustodyV1(second);release();await assert.rejects(pending,/CUSTODY_CLOSING/);await closing;
  assert.equal(other.keys,0);assert.equal(other.sends,0);second=null;
 }finally{if(custody)await h.api.closeOriginalBaseNativeValueCustodyV1(custody);if(second)await otherHost.api.closeOriginalBaseNativeValueCustodyV1(second);for(const directory of directories)await rm(directory,{recursive:true,force:true});}
});
