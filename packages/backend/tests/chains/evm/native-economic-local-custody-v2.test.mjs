/** HOST crypto/storage boundaries only. No Anvil, funding, proof or restart
 * acceptance is established by these tests. */
import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,lstat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNativeEconomicLocalCustodyV2,checkNativeEconomicLocalCustodyV2,captureNativeEconomicLocalCustodyV2,reopenNativeEconomicLocalCustodyV2,nativeEconomicLocalCustodyPublicV2,closeNativeEconomicLocalCustodyV2,prepareNativeEconomicCustodySigningV2,consumeNativeEconomicCustodySigningV2,revokeNativeEconomicCustodySigningV2,signNativeEconomicCustodyTransactionV2} from '../../../src/chains/evm/runtime/native-economic-local-custody-v2.mjs';
import { assertSignedEvmTransaction } from '../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { LOCAL_EVM_PROFILE } from '../../../src/chains/evm/runtime/local-evm-profiles.mjs';
import {Vault} from '@lianum/engine/crypto/vault';
import {createNativeValueAccountJournals} from '../../../src/accounts/authority/native-value/native-value-authority-journals.mjs';
import {extractDeclaration as extractAuthorityDeclaration} from '../../support/authority-source-host.mjs';
function terms(from){return Object.freeze({chainId:'31337',from,to:'0x'+'22'.repeat(20),nonce:'3',gas:'100000',gasPrice:'1000000000',value:'1000',data:'0x1234'});}
test('HOST original AEAD five-key retention, exact public genesis and sync lease survive custody reopen',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'lianum-local-native-v2-host-'));let first,second;
 try{
  first=await createNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const view=nativeEconomicLocalCustodyPublicV2(first),tx=terms(view.accounts[1]),prepared=Object.freeze({transaction:tx});
  const lease=await prepareNativeEconomicCustodySigningV2(first,prepared),copy={...lease};
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,copy,prepared),/ORIGINAL_SIGNING_LEASE/);
  const signed=consumeNativeEconomicCustodySigningV2(first,lease,prepared);
  assert.ok(!(signed instanceof Promise));assertSignedEvmTransaction(signed.nativeWire,tx);
  assert.equal((await signNativeEconomicCustodyTransactionV2(first,tx)).nativeWire,signed.nativeWire);
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,lease,prepared),/ORIGINAL_SIGNING_LEASE/);revokeNativeEconomicCustodySigningV2(lease);
  const retained=await captureNativeEconomicLocalCustodyV2(first),genesis=await readFile(retained.genesis.path,'utf8'),cipher=await readFile(retained.path,'utf8');
  assert.deepEqual(Object.keys(JSON.parse(genesis).alloc).sort(),view.accounts.map(a=>a.slice(2)).sort());
  assert.ok(!genesis.includes('privateKeys')&&!genesis.includes('password')&&!genesis.includes('mnemonic'));assert.ok(!cipher.includes(retained.password));
  const active=await prepareNativeEconomicCustodySigningV2(first,prepared),closingSetup=signNativeEconomicCustodyTransactionV2(first,tx);
  closeNativeEconomicLocalCustodyV2(first);
  await assert.rejects(closingSetup,/ORIGINAL_CUSTODY/);
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(first,active,prepared),/ORIGINAL_CUSTODY/);revokeNativeEconomicCustodySigningV2(active);
  second=await reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained);
  assert.deepEqual(nativeEconomicLocalCustodyPublicV2(second),view);
  const same=consumeNativeEconomicCustodySigningV2(second,await prepareNativeEconomicCustodySigningV2(second,prepared),prepared);
  assert.equal(same.nativeWire,signed.nativeWire);assertSignedEvmTransaction(same.nativeWire,tx);
  // Changing the public genesis or authenticated custody bytes cannot become
  // a different set of five signers under the old recovery credential.
  closeNativeEconomicLocalCustodyV2(second);second=null;
  await writeFile(retained.genesis.path,genesis+' ',{mode:0o600});
  await assert.rejects(reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained),/GENESIS_CHANGED|AssertionError/);
  await writeFile(retained.genesis.path,genesis,{mode:0o600});
  const bad=JSON.parse(cipher);bad.ciphertext=(bad.ciphertext??'')+'00';await writeFile(retained.path,JSON.stringify(bad),{mode:0o600});
  await assert.rejects(reopenNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE},retained));
 }finally{if(second)closeNativeEconomicLocalCustodyV2(second);if(first)closeNativeEconomicLocalCustodyV2(first);await rm(cwd,{recursive:true,force:true});}
});

test('HOST fresh immutable ciphertext checks avoid KDF repetition while signing and capture retain full AEAD',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'lianum-local-native-current-host-'));let custody;
 const read=Vault.prototype.read;let authenticatedReads=0;
 const audit=mock.method(Vault.prototype,'read',async function(...args){authenticatedReads++;return read.apply(this,args);});
 try{
  custody=await createNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const view=nativeEconomicLocalCustodyPublicV2(custody);assert.equal(authenticatedReads,1);
  assert.deepEqual(await checkNativeEconomicLocalCustodyV2(custody),view);
  assert.deepEqual(await checkNativeEconomicLocalCustodyV2(custody),view);
  assert.equal(authenticatedReads,1,'current checks must not repeat full AEAD/KDF');
  const tx=terms(view.accounts[0]),prepared=Object.freeze({transaction:tx});
  const lease=await prepareNativeEconomicCustodySigningV2(custody,prepared);
  assert.equal(authenticatedReads,2,'key preparation must authenticate the original Vault again');
  assertSignedEvmTransaction(consumeNativeEconomicCustodySigningV2(custody,lease,prepared).nativeWire,tx);
  const retained=await captureNativeEconomicLocalCustodyV2(custody);
  assert.equal(authenticatedReads,3,'capture must authenticate the original Vault again');
  const bytes=await readFile(retained.path),before=await lstat(retained.path),bad=JSON.parse(bytes.toString('utf8'));
  bad.ciphertext=(bad.ciphertext[0]==='A'?'B':'A')+bad.ciphertext.slice(1);
  const changed=Buffer.from(JSON.stringify(bad));assert.equal(changed.length,bytes.length);
  await writeFile(retained.path,changed);await utimes(retained.path,before.atime,before.mtime);
  const after=await lstat(retained.path);
  for(const key of ['dev','ino','uid','size','mode','nlink'])assert.equal(after[key],before[key]);
  // mtime is restored and all file checks stay stable across the fresh read.
  // ctime can change on a real filesystem: no metadata shortcut is used here.
  assert.equal(Math.trunc(after.mtimeMs),Math.trunc(before.mtimeMs));
  await assert.rejects(checkNativeEconomicLocalCustodyV2(custody),/NATIVE_ECONOMIC_KEYS_CIPHERTEXT_CHANGED/);
  assert.equal(authenticatedReads,3,'tampering is rejected by the fresh ciphertext digest');
  await writeFile(retained.path,bytes);
  await assert.rejects(prepareNativeEconomicCustodySigningV2(custody,prepared),/NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
  assert.throws(()=>nativeEconomicLocalCustodyPublicV2(custody),/NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
 }finally{audit.mock.restore();if(custody)closeNativeEconomicLocalCustodyV2(custody);await rm(cwd,{recursive:true,force:true});}
});
test('HOST close during a fresh ciphertext read cannot publish authenticated public custody',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'lianum-local-native-close-current-host-'));let custody;
 try{
  custody=await createNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const reading=checkNativeEconomicLocalCustodyV2(custody);
  closeNativeEconomicLocalCustodyV2(custody);
  await assert.rejects(reading,/NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
  assert.throws(()=>nativeEconomicLocalCustodyPublicV2(custody),/NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
 }finally{if(custody)closeNativeEconomicLocalCustodyV2(custody);await rm(cwd,{recursive:true,force:true});}
});


test('HOST original external-note send branch uses the same frozen custody preparation after the final guard',async()=>{
 const {fileURLToPath}=await import('node:url');
 const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/chains/evm/native-economic-local-custody-v2.test.mjs');
 const source=await readFile(new URL(generated?'../../chain-adapters/owned-evm-v2-runtime.mjs':'../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url),'utf8');
 const start=source.indexOf('if(externalNoteScope){\n              // Private original source-note producer only.');
 const end=source.indexOf('}else signed=await signNativeEconomicCustodyTransactionV2(localCustody,expected);',start);
 assert.ok(start>=0&&end>start);
 // Execute the actual source branch with real AEAD custody and real signing.
 // Infrastructure guards below are explicit HOST ports, with no RPC/send.
 const branch=source.slice(start,end)+'}';
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('expected','externalNoteScope','localCustody',
  'prepareNativeEconomicCustodySigningV2','consumeNativeEconomicCustodySigningV2',
  'revokeNativeEconomicCustodySigningV2','assertAlive','let signed;'+branch+';return signed;');
 const cwd=await mkdtemp(join(tmpdir(),'lianum-external-flat-signing-host-'));let custody;
 try{
  custody=await createNativeEconomicLocalCustodyV2({cwd,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const view=nativeEconomicLocalCustodyPublicV2(custody),expected={...terms(view.accounts[0])},order=[];
  // The old bare transaction is rejected by the original producer contract.
  await assert.rejects(prepareNativeEconomicCustodySigningV2(custody,expected),/NATIVE_ECONOMIC_FIXED_PREPARATION/);
  let samePrepared,sameLease;
  const prepare=async function(c,p){assert.equal(arguments.length,2);assert.equal(c,custody);assert.equal(Object.isFrozen(p),true);assert.equal(Object.isFrozen(p.transaction),true);assert.equal(p.transaction,expected);samePrepared=p;
   const lease=await prepareNativeEconomicCustodySigningV2(c,p);sameLease=lease;order.push('prepared');return lease;};
  const consume=function(c,l,p){assert.equal(arguments.length,3);assert.equal(c,custody);assert.equal(l,sameLease);assert.equal(p,samePrepared);order.push('consume');return consumeNativeEconomicCustodySigningV2(c,l,p);};
  const revoke=l=>{assert.equal(l,sameLease);order.push('revoke');revokeNativeEconomicCustodySigningV2(l);};
  const scope={async beforeKey(tx){assert.equal(tx,expected);assert.equal(Object.isFrozen(tx),true);order.push('before-key');},assertBeforeKey(tx){assert.equal(tx,expected);order.push('guard');}};
  const signed=await run(expected,scope,custody,prepare,consume,revoke,()=>order.push('alive'));
  assertSignedEvmTransaction(signed.nativeWire,expected);assert.deepEqual(order,['prepared','before-key','guard','alive','consume','revoke']);
  assert.throws(()=>consumeNativeEconomicCustodySigningV2(custody,sameLease,samePrepared),/ORIGINAL_SIGNING_LEASE/);
  // A close in the final awaited guard revokes the actual private lease. The
  // same finally cleanup drains it; no replacement key, signature or send.
  let revoked=false,lateLease,latePrepared,consumes=0;
  const late={async beforeKey(){closeNativeEconomicLocalCustodyV2(custody);},assertBeforeKey(){}};
  await assert.rejects(run({...expected},late,custody,
   async(c,p)=>{latePrepared=p;lateLease=await prepareNativeEconomicCustodySigningV2(c,p);return lateLease;},
   function(c,l,p){consumes++;assert.equal(arguments.length,3);assert.equal(p,latePrepared);return consumeNativeEconomicCustodySigningV2(c,l,p);},
   l=>{assert.equal(l,lateLease);revokeNativeEconomicCustodySigningV2(l);revoked=true;},()=>{}),/NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
  assert.equal(consumes,1);assert.equal(revoked,true);assert.throws(()=>nativeEconomicLocalCustodyPublicV2(custody),/ORIGINAL_CUSTODY/);
 }finally{if(custody)closeNativeEconomicLocalCustodyV2(custody);await rm(cwd,{recursive:true,force:true});}
});

test('HOST live-armed observed runtime keeps its original pair and authenticated five-key genesis across reopening',async()=>{
 const {default:vm}=await import('node:vm');
 const {canonical}=await import('@lianum/engine/crypto/privacy');
 const {randomBytes,createHash}=await import('node:crypto');
 const {constants}=await import('node:fs');
 const fs=await import('node:fs/promises');
 const {fileURLToPath}=await import('node:url');
 const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/chains/evm/native-economic-local-custody-v2.test.mjs');
 const runtimeURL=new URL(generated?'../../chain-adapters/owned-evm-v2-runtime.mjs':'../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url);
 const custodyURL=new URL(generated?'../../chain-adapters/native-economic-local-custody-backend-v2.mjs':'../../../src/chains/evm/runtime/native-economic-local-custody-backend-v2.mjs',import.meta.url);
 const signing=await import(new URL(generated?'../../chain-adapters/native-economic-local-signing-v2.mjs':'../../../src/chains/evm/runtime/native-economic-local-signing-v2.mjs',import.meta.url));
 const runtimeSource=await readFile(runtimeURL,'utf8'),custodySource=await readFile(custodyURL,'utf8');
 const cut=(start,end)=>{const a=runtimeSource.indexOf(start),b=runtimeSource.indexOf(end,a);assert.ok(a>=0&&b>a);return runtimeSource.slice(a,b);};
 const hostAssert={...assert,deepEqual:(a,b,m)=>assert.deepEqual(structuredClone(a),structuredClone(b),m)};
 const requests=new WeakMap(),brands=new WeakMap(),clocks=new WeakMap(),pairs=new WeakMap(),events=[],identities=new WeakMap(),records=new WeakMap();
 const receiverProfile=Object.freeze({...LOCAL_EVM_PROFILE,name:'LOCAL_NATIVE_ECONOMIC_OBSERVED_RECEIVER_V2',genesisTimestamp:null});
 const nativeProfile=Object.freeze({...receiverProfile,name:'LOCAL_NATIVE_ECONOMIC_OBSERVED_GRAPH_V2',chainId:1});
 const marker=Symbol('EXPLICIT_HOST_LIVE_ARMED_MARKER');let generation=0;
 const context={assert:hostAssert,Object,AggregateError,WeakMap,Symbol,cloneRuntimeRecoveryV1:structuredClone,
  originalLiveArmedRuntimeStatesV1:brands,originalLiveArmedClockPairsV1:pairs,observedEconomicRuntimeClocksV2:clocks,
  NATIVE_LIVE_ARMED_OBSERVED_RUNTIME_V1:marker,LOCAL_ECONOMIC_OBSERVED_RECEIVER_PROFILE_V2:receiverProfile,LOCAL_ECONOMIC_OBSERVED_GRAPH_PROFILE_V2:nativeProfile,
  LIVE_ARMED_CAPTURE_SCHEMA_V1:'OWNED_FIXED_EVM_LIVE_ARMED_CAPTURE_V1',
  async createFixedOwnedLocalEvm(profile,poolGeneration,recovery,admitted){assert.equal(poolGeneration,false);assert.equal(admitted,marker);const family=profile===receiverProfile?'receiver':'graphNative',runtime=Object.freeze({generation:++generation,async close(options){assert.deepEqual(options,{removeScratch:false});brands.get(runtime).closed=true;events.push('close-'+family);}});brands.set(runtime,{family,identity:null,closed:false});clocks.set(runtime,{});events.push('create-'+family);return runtime;},
  assertOwnedNativeEconomicObservedReceiverV2(runtime){assert.ok(brands.get(runtime)?.family==='receiver'&&!brands.get(runtime).closed,'HOST_RECEIVER_BRAND');},
  assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime){assert.ok(brands.get(runtime)?.family==='graphNative'&&!brands.get(runtime).closed,'HOST_GRAPH_BRAND');},
  async armOwnedEvmRecoveryRetentionV1(runtime){assert.ok(brands.has(runtime));events.push('retain-'+brands.get(runtime).family);},
  nativeLiveArmedRecoverySectionIdentityV1(token,family){const identity=identities.get(token);assert.ok(identity&&identity.family===family,'HOST_ORIGINAL_LIVE_ARMED_TOKEN');return identity.identity;},
  consumeNativeLiveArmedRecoverySectionV1(token,family){assert.equal(identities.get(token)?.family,family);const record=records.get(token);assert.ok(record,'HOST_ORIGINAL_ONE_USE');records.delete(token);return record;}
 };
 const factorySource=cut('/** Fixed two-process producer.','export async function refreshOwnedNativeEconomicObservedGraphClockV2(runtime){').replaceAll('export ','');
 const ports=vm.runInNewContext(factorySource+'\n({createOwnedNativeLiveArmedObservedClockPairV1,readOwnedNativeLiveArmedObservedClockPairV1,bindOwnedNativeLiveArmedObservedClockPairV1,reopenOwnedNativeLiveArmedReceiverV1,reopenOwnedNativeLiveArmedGraphRuntimeV1});',context);
 const pair=await ports.createOwnedNativeLiveArmedObservedClockPairV1();assert.deepEqual(events,['create-receiver','create-graphNative','retain-receiver','retain-graphNative']);assert.equal(ports.readOwnedNativeLiveArmedObservedClockPairV1(pair.receiver,pair.native),pair);
 assert.throws(()=>ports.readOwnedNativeLiveArmedObservedClockPairV1({...pair.receiver},pair.native),/ORIGINAL_RUNTIME/);assert.throws(()=>ports.bindOwnedNativeLiveArmedObservedClockPairV1(pair.receiver,pair.native),/ALREADY_BOUND/);
 const identity={runId:'explicit-host-original-issuer',sourceSHA256:'a'.repeat(64)},token=family=>{const cap=Object.freeze(Object.create(null));identities.set(cap,{family,identity});records.set(cap,{schema:context.LIVE_ARMED_CAPTURE_SCHEMA_V1,family});return cap;};
 const rToken=token('receiver'),nToken=token('graphNative');
 await assert.rejects(ports.reopenOwnedNativeLiveArmedReceiverV1({...rToken}),/ORIGINAL_LIVE_ARMED_TOKEN/);
 const restoredReceiver=await ports.reopenOwnedNativeLiveArmedReceiverV1(rToken),restoredNative=await ports.reopenOwnedNativeLiveArmedGraphRuntimeV1(nToken);
 await assert.rejects(ports.reopenOwnedNativeLiveArmedReceiverV1(rToken),/ORIGINAL_ONE_USE/);
 const restored=ports.bindOwnedNativeLiveArmedObservedClockPairV1(restoredReceiver,restoredNative);assert.equal(restored.receiver,restoredReceiver);assert.notEqual(restored.receiver,pair.receiver);
 assert.throws(()=>ports.bindOwnedNativeLiveArmedObservedClockPairV1(pair.receiver,restored.native),/ALREADY_BOUND/);
 const wrongReceiver=await ports.reopenOwnedNativeLiveArmedReceiverV1(token('receiver')),badNativeToken=token('graphNative');identities.get(badNativeToken).identity={...identity,runId:'different-issuer'};
 const wrongNative=await ports.reopenOwnedNativeLiveArmedGraphRuntimeV1(badNativeToken);assert.throws(()=>ports.bindOwnedNativeLiveArmedObservedClockPairV1(wrongReceiver,wrongNative),/ISSUER_CHANGED/);
 // Actual custody implementation, actual encrypted Vault and all five original
 // address bindings. The request issuer is an explicit inert HOST map only.
 const custodyContext={assert:hostAssert,randomBytes,createHash,constants,...fs,join,Vault,canonical,...signing,structuredClone,Object,WeakMap,Buffer,process,Date,
  consumeNativeEconomicObservedCustodyRequestV2(token){const input=requests.get(token);assert.ok(input,'ECONOMIC_OBSERVED_ORIGINAL_CUSTODY_REQUEST');requests.delete(token);return input;}};
 const script=custodySource.replace(/^import .*;$/gm,'').replaceAll('export ','');
 // Keep the actual canonical/Vault checks in their original realm: plain
 // source-created records are not foreign VM objects or altered DTOs.
 const custodyNames=['assert','randomBytes','createHash','constants','open','lstat','realpath','join','Vault','canonical','consumeNativeEconomicObservedCustodyRequestV2','nativeEconomicLocalAddressV2','prepareNativeEconomicLocalSignerV2','consumeNativeEconomicLocalSignerV2','revokeNativeEconomicLocalSignerV2'];
 const custodyPorts=new Function(...custodyNames,script+'\nreturn buildNativeEconomicCustodyBackend(consumeNativeEconomicObservedCustodyRequestV2);')(...custodyNames.map(name=>custodyContext[name]));
 const cwd=await mkdtemp(join(tmpdir(),'lianum-live-armed-custody-host-'));let first,second;
 try{const profile={...receiverProfile,genesisTimestamp:Math.floor(Date.now()/1000)-2},input={cwd,family:'receiver',profile};const request=()=>{const cap=Object.freeze(Object.create(null));requests.set(cap,input);return cap;};
  first=await custodyPorts.createNativeEconomicObservedLocalCustodyV2(request());const view=custodyPorts.nativeEconomicLocalCustodyPublicV2(first),retained=await custodyPorts.captureNativeEconomicLocalCustodyV2(first);custodyPorts.closeNativeEconomicLocalCustodyV2(first);
  await assert.rejects(custodyPorts.reopenNativeEconomicLocalCustodyV2(input,retained));
  const cap=request();second=await custodyPorts.reopenNativeEconomicObservedLocalCustodyV2(cap,retained);assert.deepEqual(structuredClone(custodyPorts.nativeEconomicLocalCustodyPublicV2(second)),structuredClone(view));
  await assert.rejects(custodyPorts.reopenNativeEconomicObservedLocalCustodyV2(cap,retained),/ORIGINAL_CUSTODY_REQUEST/);
  const prepared=Object.freeze({transaction:terms(view.accounts[0])});const signed=custodyPorts.consumeNativeEconomicCustodySigningV2(second,await custodyPorts.prepareNativeEconomicCustodySigningV2(second,prepared),prepared);assertSignedEvmTransaction(signed.nativeWire,prepared.transaction);
  custodyPorts.closeNativeEconomicLocalCustodyV2(second);second=null;const changedGenesis=await readFile(retained.genesis.path);try{assert.equal(changedGenesis.length,retained.genesis.bytes);changedGenesis[0]^=1;await writeFile(retained.genesis.path,changedGenesis);}finally{changedGenesis.fill(0);}
  await assert.rejects(custodyPorts.reopenNativeEconomicObservedLocalCustodyV2(request(),retained),/GENESIS_CHANGED/);
 }finally{if(first)custodyPorts.closeNativeEconomicLocalCustodyV2(first);if(second)custodyPorts.closeNativeEconomicLocalCustodyV2(second);await rm(cwd,{recursive:true,force:true});}
});

// HOST only: original private methods, real Vault AEAD/CAS and real EIP155
// signed bytes. RPC/history/proof acceptance below are explicit inert ports;
// this test does not establish a chain reorg or economic proof acceptance.
test('HOST original F reorg invalidates both AEAD journals before one exact retained-wire emission', async()=>{
 const {fileURLToPath}=await import('node:url'),{canonical}=await import('@lianum/engine/crypto/privacy');
 const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/chains/evm/native-economic-local-custody-v2.test.mjs');
 const moduleURL=(name,canonicalPath)=>new URL(generated?'../../'+name:canonicalPath,import.meta.url);
 const runtimeSource=await readFile(moduleURL('chain-adapters/owned-evm-v2-runtime.mjs','../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs'),'utf8');
 const executionSource=await readFile(moduleURL('paeg/native-value-execution-v2.mjs','../../../src/execution/native-value/execution/native-value-execution-v2.mjs'),'utf8');
 const accountSource=await readFile(moduleURL('global-state/native-value-account-authority-v2.mjs','../../../src/accounts/authority/native-value-account-authority-v2.mjs'),'utf8');
 const accountExecutionSource=await readFile(moduleURL('global-state/native-value/native-value-authority-execution.mjs','../../../src/accounts/authority/native-value/native-value-authority-execution.mjs'),'utf8');
 const accountReservationSource=await readFile(moduleURL('global-state/native-value/native-value-authority-reservations.mjs','../../../src/accounts/authority/native-value/native-value-authority-reservations.mjs'),'utf8');
 const observerSource=await readFile(moduleURL('paeg/native-value-terminal-observer-v2.mjs','../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs'),'utf8');
 const {encodeStatement,validateStatement}=await import(moduleURL('paeg/statements.mjs','../../../../components/src/encoding/statements.mjs'));
 const {encodeFlatTransaction}=await import(moduleURL('paeg/transaction-codec.mjs','../../../src/execution/encoding/transaction-codec.mjs'));
 const {decodeNativeValueTerminalCalldata}=await import(moduleURL('paeg/native-value-terminal-observer-v2.mjs','../../../src/execution/native-value/reconciliation/native-value-terminal-observer-v2.mjs'));
 const {exactRecord}=await import(moduleURL('paeg/commitments.mjs','../../../../components/src/encoding/commitments.mjs'));
 const {createHash}=await import('node:crypto');
 const cut=(text,a,b)=>{const start=text.indexOf(a),end=text.indexOf(b,start);assert.ok(start>=0&&end>start);return text.slice(start,end);};
 const compile=(body,ports)=>new Function(...Object.keys(ports),body)(...Object.values(ports));
 const replaceImport=(text,name)=>{const hits=text.match(/await import\('[^']+'\)/g);assert.equal(hits?.length,1);return text.replace(hits[0],name);};
 const cloned=x=>JSON.parse(canonical(x)),detached=x=>Object.freeze(cloned(x));
 const sha=x=>createHash('sha256').update(canonical(x)).digest('hex'),dataHash=x=>createHash('sha256').update(Buffer.from(x.slice(2),'hex')).digest('hex');
 const word=n=>BigInt(n).toString(16).padStart(64,'0'),bare=x=>x.slice(2),ref='a'.repeat(64),bridge=Object.freeze({}),pool={address:'0x'+'22'.repeat(20)};
 const binding={domainCommitment:word(1),envelope:word(2),inputCommitment:word(3),inputNullifier:word(4),reserveCommitment:word(5),reserveNullifier:word(6),changeCommitment:word(7),recoveryCommitment:word(8),settleBefore:'100',authorizationPublicInputsSHA256:word(9)};
 const statement={domainCommitment:word(1),authorizationRoot:word(10),poolRoot:word(11),reserveNullifier:word(6),recoveryCommitment:word(8),settleBefore:'100'};
 const calldata=encodeFlatTransaction('recoverGeneric',{proof:'11'.repeat(32),publicInputs:encodeStatement('recovery',statement)});
 const root=await mkdtemp(join(tmpdir(),'lianum-original-f-reorg-host-'));let custody;
 try{
  custody=await createNativeEconomicLocalCustodyV2({cwd:root,family:'receiver',profile:LOCAL_EVM_PROFILE});
  const expected=Object.freeze({chainId:'31337',from:nativeEconomicLocalCustodyPublicV2(custody).accounts[0],to:pool.address,nonce:'3',gas:'1000000',gasPrice:'1000000000',value:'0',data:calldata});
  const signed=await signNativeEconomicCustodyTransactionV2(custody,expected);assertSignedEvmTransaction(signed.nativeWire,expected);
  let number=0;
  async function fixture(mode='success'){
   const dir=await mkdtemp(join(root,'case-')),accountVault=new Vault(join(dir,'account.vault')),executionVault=new Vault(join(dir,'execution.vault'));
   const parent={number:'0x9',hash:'0x'+'33'.repeat(32),parentHash:'0x'+'44'.repeat(32),timestamp:'0x63',transactions:[]};
   const includedHeader={number:'0xa',hash:'0x'+'55'.repeat(32),parentHash:parent.hash,timestamp:'0x64',transactions:[signed.nativeId]};
   const oldReceipt={transactionHash:signed.nativeId,status:'0x1',to:pool.address,blockNumber:'0xa',blockHash:includedHeader.hash,transactionIndex:'0x0',gasUsed:'0x100'};
   const before={header:parent,timestamp:'99',pools:[],authorization:[],unchangedHub:[]};
   const submission={target:pool.address,calldata,calldataSHA256:dataHash(calldata),transactionHash:bare(signed.nativeId)};
   const checkpoint={schema:'ORIGINAL_NATIVE_F_BEFORE_CHECKPOINT_V1',query:{kind:'recovery',submission,statement,binding},before,includedHeader,receipt:oldReceipt};
   const terminal={transactionHash:bare(signed.nativeId),blockHash:bare(oldReceipt.blockHash),blockNumber:'10',calldataSHA256:dataHash(calldata),outcome:'RECOVERED'};
   const originalSHash=word(12),sObservation={profile:'LIANUM_DEVICE_ORIGINAL_S_OBSERVATION_V1',transactionHash:originalSHash};
   const accountInitial=await accountVault.create({operations:[],deviceReservations:[{jobId:ref,nativeBinding:binding,nativeRecoveryLatched:true,nativeLatched:mode!=='automatic',nativeOutcome:'RECOVERED',nativeTerminal:terminal,nativeStage:'RECOVERED',
    observation:sObservation,submission:{dispatchLatched:mode!=='missingS',observation:{transaction:{hash:originalSHash}}},
    ...(mode==='automatic'?{liveRecoveryArm:{state:'RECOVERED',armSHA256:word(13),nativeBindingSHA256:sha(binding),reservationTransactionHash:originalSHash,settleBefore:binding.settleBefore,lossClause:'FULL_OWNER_REFUND_PROVIDER_LOSS_V1'}}:{})}]},'host-account');
   const executionInitial=await executionVault.create({operations:[{reference:ref,binding,recoveryStatement:statement,recoverySubmission:submission,originalFCheckpoint:checkpoint,outcome:'RECOVERED',stage:'RECOVERED'}]},'host-execution');
   let head=cloned(parent),currentReceipt=null,currentTx=null,pending=[],nextTime=null,sendCount=0,closed=false;
   const runtime={get transactions(){return cloned([entry]);},async receipt(){return cloned(currentReceipt);},async transaction(){return cloned(currentTx);},async block(){return cloned(head);},async assertCanonical(h){assert.equal(h.hash??h.blockHash,head.hash);return cloned(head);},async checkReceipt(r){assert.deepEqual(r,currentReceipt);return r;}};
   const checkSource=cut(observerSource,'    async checkRecoveryReorg(checkpoint) {','\n    },\n  });').replace('    async checkRecoveryReorg(checkpoint) {','async function checkRecoveryReorg(checkpoint) {')+'\n}';
   const check=compile(checkSource+';return checkRecoveryReorg;',{assert,wrapped:false,exactRecord,decodeNativeValueTerminalCalldata,validateStatement,bindingOf:value=>assert.deepEqual(value,binding),dataHash,pool,prefix:x=>'0x'+x,runtime,
    readAt:async()=>{if(mode==='state')return {...cloned(before),timestamp:'98'};return cloned(before);},reader:{async read(){return {header:cloned(head),ledger:{nullifiers:['0x'+binding.inputNullifier]}};},async assertCurrent(v){assert.deepEqual(v.header,head);}},detached});
   const accountOwned=new WeakMap(),account=Object.freeze({case:++number});let keeper,accountPorts;
   const declarations=(source,names)=>names.map(name=>extractAuthorityDeclaration(source,name).replace(/^export\s+/, '')).join('\n');
   const accountCore=declarations(accountExecutionSource,['reorgState','retainReorg','assertReorgPending']);
   const accountWrite=extractAuthorityDeclaration(accountSource,'write');
   const accountRow=declarations(accountReservationSource,['reservationRows','reservationRow','reservationUpdate']);
   const terminalCore=extractAuthorityDeclaration(accountExecutionSource,'retainDeviceTerminal');
   const wrappers=declarations(accountSource,['originalDeviceNativeFReorgStateV1','retainOriginalDeviceNativeFReorgV1','checkOriginalDeviceNativeFReorgPendingV1','assertOriginalDeviceNativeFReorgPendingV1']);
   const makeAccount=compile('return async function(nativeExecution){let record=initial,unavailable=false,busy=true,closed=false,cancelled=false;const wrapped=false,sourceHandle=null;let reorgAdmission={executor:nativeExecution,ref,bridge};const chain={nativeExecution,runtime,pool,system},format={bare,reference},lifecycle={continueWork,isBusy:()=>busy};const journal=createNativeValueAccountJournals({readRecord:()=>record,write}).reservations;const reservations={reservationRow:(...args)=>reservationRow(...args),reservationUpdate:(...args)=>reservationUpdate(...args)};'+accountCore+accountWrite+accountRow+terminalCore+
    '\n'+wrappers+'\nconst state={wrapped:false,closed:()=>closed||unavailable,reorgState,retainReorg,assertReorgPending,async checkReorgPending(e,r,id){await healthy();assertReorgPending(e,r,id);}};owned.set(account,state);return{originalDeviceNativeFReorgStateV1,retainOriginalDeviceNativeFReorgV1,assertOriginalDeviceNativeFReorgPendingV1,checkOriginalDeviceNativeFReorgPendingV1,async finish(result){await retainDeviceTerminal(reservationRow(ref),result);},read:()=>copy(record),async healthy(){await healthy();}};};',
    {assert,createNativeValueAccountJournals,initial:accountInitial,ref,bridge,account,owned:accountOwned,copy:cloned,sha,byteSHA:dataHash,reference:x=>assert.match(x,/^[0-9a-f]{64}$/),vault:accountVault,password:'host-account',pool,system:{sender:expected.from},runtime,decodeNativeValueTerminalCalldata,flatAccountCalldataHash:dataHash,bare,
     continueWork:()=>assert.equal(closed,false),deviceExecutionOriginal:(b,row)=>{assert.equal(b,bridge);assert.deepEqual(row.nativeBinding,binding);},validateManualLifecycle:()=>assert.fail('HOST_UNUSED_MANUAL'),retainLifetime:()=>assert.fail('HOST_UNUSED_WRAPPED'),
     healthy:async()=>{assert.deepEqual(await accountVault.read('host-account'),accountPorts.read());}});
   const wires=new WeakMap();
   const consumeCore=cut(executionSource,'export function consumeOriginalNativeRecoveryReorgWireV1','const owners = new WeakMap()').replace('export ','');
   const consume=compile(consumeCore+';return consumeOriginalNativeRecoveryReorgWireV1;',{assert,originalFReorgWires:wires});
   const mutateCore=cut(runtimeSource,'    const mutate = async operation => {','    const mineAt =');
   const mineCore=cut(runtimeSource,'    const mineAt = async timestamp => {','    const observedInclusionSecond=');
   const emitCore=replaceImport(cut(runtimeSource,'    const reemitOriginalRecovery = token =>','    // The legacy public port'),'executorPorts');
   const entry={label:'flat-execution-recovery-'+ref,request:{from:expected.from,to:expected.to,data:calldata,value:'0x0'},senderNonce:'0x3',phase:'mined',receipt:cloned(oldReceipt),transactionHash:signed.nativeId,localSigned:{...signed,expected}};
   const emitted=compile('let busy=false,uncertainMutation=false,lastTimestamp=100n,ingressMutationEpoch=0n;const economicRecoveryFence=null,observedFinalityV2=null,deviceSourceObservationOnly=false,sourceDurableV1=false,deviceSourceV2=false;'+mutateCore+mineCore+emitCore+';return {emit:reemitOriginalRecovery,read:()=>({busy,uncertainMutation})};',
    {assert,cloned,runtime,executorPorts:{consumeOriginalNativeRecoveryReorgWireV1:consume},transactions:[entry],assertSignedEvmTransaction,sha:value=>createHash('sha256').update(value).digest('hex'),Buffer,observedClock:false,assertAlive:()=>assert.equal(closed,false),health:async()=>{},block:async()=>cloned(head),assertCanonical:runtime.assertCanonical,transaction:runtime.transaction,receipt:runtime.receipt,checkReceipt:runtime.checkReceipt,
     rpc:async(method,args)=>{if(method==='eth_pendingTransactions')return cloned(pending);if(method==='eth_getTransactionCount')return mode==='nonce'?'0x4':'0x3';
      if(method==='eth_sendRawTransaction'){const a=await accountVault.read('host-account'),e=await executionVault.read('host-execution');assert.equal(a.data.deviceReservations[0].nativeFReorg.phase,'OBSERVATION_PENDING');assert.equal(e.data.operations[0].nativeFReorg.phase,'OBSERVATION_PENDING');assert.equal(a.data.deviceReservations[0].nativeOutcome,null);assert.equal(e.data.operations[0].outcome,null);assert.equal(args[0],signed.nativeWire);sendCount++;if(mode==='unknown')throw new Error('HOST_RPC_UNCERTAIN');return signed.nativeId;}
      if(method==='evm_setNextBlockTimestamp'){nextTime=args[0];return true;}if(method==='evm_mine'){head={...cloned(includedHeader),hash:'0x'+'66'.repeat(32),timestamp:'0x'+BigInt(nextTime).toString(16)};currentReceipt={...cloned(oldReceipt),blockHash:head.hash};currentTx={hash:signed.nativeId,from:expected.from,to:expected.to,input:calldata,value:'0x0',nonce:'0x3',blockHash:head.hash,blockNumber:head.number};return true;}assert.fail('HOST_UNEXPECTED_RPC');}});
   // The first replacement is the account import, the second is the runtime
   // import. Replace by exact literals rather than evaluating arbitrary paths.
   const exBody=cut(executionSource,'  async function reconcileRecovery(account, ref) {','  async function checkpoint(ref) {');
   const exImports=exBody.match(/await import\('[^']+'\)/g);assert.equal(exImports.length,2);
   const ex=exBody.replace(exImports[0],'accountPorts').replace(exImports[1],'runtimePorts');
   const exWrite=cut(executionSource,'  async function write(change) {','  async function stage(ref, name)');
   const exExclusive=cut(executionSource,'  async function exclusive(work) {','  async function abi(name)');
   const makeExecutor=compile('return async function(){let record=initial,poisoned=false,busy=false,cancelled=false,capturing=false,closed=false,activeDone=Promise.resolve(),releaseActive;const wrapped=false,sourceHandle=null;const keeper=Object.freeze({});'+exWrite+exExclusive+ex+';return{keeper,read:()=>copy(record),run:()=>reconcileRecovery(account,ref)};};',
    {assert,initial:executionInitial,account,ref,runtime,terminalObserver:{checkRecoveryReorg:check},bare,copy:cloned,detached,digest:sha,reference:x=>assert.match(x,/^[0-9a-f]{64}$/),vault:executionVault,password:'host-execution',retainLifetime:()=>assert.fail('HOST_UNUSED_WRAPPED'),privateRecoveryDigest:sha,
     live:()=>assert.equal(closed,false),healthy:async()=>assert.deepEqual(await executionVault.read('host-execution'),keeper.read()),accountPorts:new Proxy({}, {get:(_,key)=>(...args)=>accountPorts[key](...args)}),runtimePorts:{reemitOwnedOriginalNativeRecoveryV1:(r,t)=>{assert.equal(r,runtime);return emitted.emit(t);}},originalFReorgWires:wires,
     observedSubmission:async()=>{assert.ok(currentReceipt,'HOST_ORIGINAL_RECEIPT_UNAVAILABLE');return {receipt:cloned(currentReceipt),outcome:'RECOVERED',calldataSHA256:dataHash(calldata)};}});
   keeper=await makeExecutor();accountPorts=await makeAccount(keeper.keeper);
   return {account,accountPorts,keeper,runtime,emit:emitted.emit,read:()=>({sendCount,entry}),check,
    tamperHead(){head={...head,hash:'0x'+'77'.repeat(32)};},async tamperAccount(){const value=await accountVault.read('host-account');await accountVault.update('host-account',value.revision,data=>({...data,extra:true}));}};
  }
  const good=await fixture();assert.throws(()=>good.accountPorts.originalDeviceNativeFReorgStateV1({...good.account},good.keeper.keeper,ref),/ORIGINAL_ACCOUNT/);assert.equal((await good.keeper.run()).originalFReorgInvalidated,true);assert.equal(good.read().sendCount,0);
  assert.equal(good.accountPorts.read().data.deviceReservations[0].nativeOutcome,null);assert.equal(good.keeper.read().data.operations[0].outcome,null);
  await assert.rejects(good.emit({}),/ORIGINAL_WIRE_TOKEN/);const result=await good.keeper.run();await good.accountPorts.finish(result);
  assert.equal(good.read().sendCount,1);assert.equal(good.read().entry.localSigned.nativeWire,signed.nativeWire);assert.equal(good.accountPorts.read().data.deviceReservations[0].nativeFReorg.phase,'RECONFIRMED');
  await good.keeper.run();assert.equal(good.read().sendCount,1);
  const automatic=await fixture('automatic');assert.equal(automatic.accountPorts.read().data.deviceReservations[0].nativeLatched,false);
  assert.equal((await automatic.keeper.run()).originalFReorgInvalidated,true);assert.equal(automatic.read().sendCount,0);
  const automaticResult=await automatic.keeper.run();await automatic.accountPorts.finish(automaticResult);
  assert.equal(automatic.read().sendCount,1);assert.equal(automatic.accountPorts.read().data.deviceReservations[0].nativeFReorg.phase,'RECONFIRMED');
  assert.equal(automatic.accountPorts.read().data.deviceReservations[0].nativeLatched,false);
  for(const mode of ['state','deeper','missingS']){const f=await fixture(mode);if(mode==='deeper')f.tamperHead();
   await assert.rejects(f.keeper.run());assert.equal(f.read().sendCount,0);assert.equal(f.accountPorts.read().data.deviceReservations[0].nativeFReorg,undefined);
   assert.equal(f.keeper.read().data.operations[0].nativeFReorg,undefined);}
  for(const mode of ['nonce','unknown','tamper']){const f=await fixture(mode);await f.keeper.run();if(mode==='tamper')await f.tamperAccount();
   await assert.rejects(f.keeper.run());assert.equal(f.read().sendCount,mode==='unknown'?1:0);assert.equal(f.accountPorts.read().data.deviceReservations[0].nativeOutcome,null);
   if(mode==='unknown'){await assert.rejects(f.keeper.run(),/RECEIPT_UNAVAILABLE/);assert.equal(f.read().sendCount,1);}}
 }finally{if(custody)closeNativeEconomicLocalCustodyV2(custody);await rm(root,{recursive:true,force:true});}
});
