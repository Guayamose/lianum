/** Crypto/storage mechanisms and one real local two-process identity check.
 * No funding, proof or full economic restart acceptance is established. */
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
import {signExternalNoteAfterGuardV1} from '../../../src/chains/evm/runtime/external-note-signing-v1.mjs';
import {checkRecoveryReorgCheckpointV1} from '../../../src/execution/native-value/reconciliation/recovery-reorg-checkpoint-v1.mjs';
import {reconcileRecoveryReorgV1} from '../../../src/execution/native-value/reconciliation/recovery-reorg-reconcile-v1.mjs';
import {reemitRetainedRecoveryWireV1} from '../../../src/chains/evm/runtime/recovery-reorg-wire-v1.mjs';
import {createNativeRecoveryReorgReservationV1} from '../../../src/accounts/authority/native-value/native-recovery-reorg-reservation-v1.mjs';
import * as canonicalRuntime from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {originalDeviceNativeFReorgStateV1} from '../../../src/accounts/authority/native-value-account-authority-v2.mjs';
import {consumeOriginalNativeRecoveryReorgWireV1} from '../../../src/execution/native-value/execution/native-value-execution-v2.mjs';
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
  // Establish an exactly representable timestamp before comparing metadata;
  // fs.Stats Date accessors otherwise round sub-millisecond inode times.
  const restoredTime=Math.trunc(Date.now()/1000)-1;await utimes(retained.path,restoredTime,restoredTime);
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
 const run=(expected,scope,custody,prepare,consume,revoke,assertAlive)=>
  signExternalNoteAfterGuardV1(expected,scope,custody,assertAlive,{prepare,consume,revoke});
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

test('local live-armed pair has original runtime identity and rejects fabricated reopening tokens', {timeout:20000},async()=>{
 let pair;const stopped=[];
 try{
  pair=await canonicalRuntime.createOwnedNativeLiveArmedObservedClockPairV1();
  assert.equal(canonicalRuntime.readOwnedNativeLiveArmedObservedClockPairV1(pair.receiver,pair.native),pair);
  for(const [runtime,check] of [[pair.receiver,canonicalRuntime.assertOwnedNativeLiveArmedReceiverV1],[pair.native,canonicalRuntime.assertOwnedNativeLiveArmedGraphRuntimeV1]]){
   check(runtime);assert.equal(runtime.accounts.length,5);assert.equal(new Set(runtime.accounts).size,5);
   assert.equal((await runtime.block('0x0')).hash,runtime.metadata.evmGenesis);
   assert.throws(()=>check({...runtime}),/ORIGINAL_RUNTIME/);
   assert.equal(runtime.metadata.profile.genesisTimestamp<=Math.floor(Date.now()/1000),true);
  }
  assert.throws(()=>canonicalRuntime.bindOwnedNativeLiveArmedObservedClockPairV1(pair.receiver,pair.native),/ALREADY_BOUND/);
  assert.throws(()=>canonicalRuntime.readOwnedNativeLiveArmedObservedClockPairV1(pair.native,pair.receiver),/ORIGINAL_RUNTIME/);
  for(const reopen of [canonicalRuntime.reopenOwnedNativeLiveArmedReceiverV1,canonicalRuntime.reopenOwnedNativeLiveArmedGraphRuntimeV1]){
   const forged=Object.freeze({runId:'fabricated',sourceSHA256:'a'.repeat(64)});
   await assert.rejects(reopen(forged),/ORIGINAL|TOKEN/);
   await assert.rejects(reopen({...forged}),/ORIGINAL|TOKEN/);
  }
 }finally{
  if(pair)for(const runtime of [pair.native,pair.receiver]){
   const status=await runtime.close({removeScratch:true});assert.equal(status.exitObserved,true);stopped.push(runtime);
   // These exact private scratch directories were created by this test's two
   // original runtimes. Retention intentionally keeps them after graceful exit.
   await rm(runtime.metadata.scratchDirectory,{recursive:true,force:true});
  }
 }
 for(const runtime of stopped){await assert.rejects(readFile('/proc/'+runtime.metadata.processId+'/stat'),{code:'ENOENT'});}
});

// HOST only: imported production mechanisms, real Vault AEAD/CAS and EIP155
// signed bytes. RPC/history/proof acceptance below are explicit inert ports;
// this test does not establish a chain reorg or economic proof acceptance.
test('HOST original F reorg invalidates both AEAD journals before one exact retained-wire emission', async()=>{
 const {canonical}=await import('@lianum/engine/crypto/privacy');
 const {encodeStatement}=await import('@lianum/components/encoding/statements');
 const {encodeFlatTransaction}=await import('../../../src/execution/encoding/transaction-codec.mjs');
 const {decodeNativeValueTerminalCalldata}=await import('../../../src/execution/encoding/terminal-calldata-codec.mjs');
 const {createHash}=await import('node:crypto');
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
   const check=checkpoint=>checkRecoveryReorgCheckpointV1(checkpoint,{wrapped:false,decodeNativeValueTerminalCalldata,
    bindingOf:value=>assert.deepEqual(value,binding),pool,runtime,
    readAt:async()=>mode==='state'?{...cloned(before),timestamp:'98'}:cloned(before),
    reader:{async read(){return {header:cloned(head),ledger:{nullifiers:['0x'+binding.inputNullifier]}};},async assertCurrent(v){assert.deepEqual(v.header,head);}}});
   const account=Object.freeze({case:++number}),executor=Object.freeze({});
   let accountRecord=accountInitial,executionRecord=executionInitial,busy=false,uncertainMutation=false;
   async function healthyAccount(){assert.deepEqual(await accountVault.read('host-account'),accountRecord,'HOST_ACCOUNT_CAS_CHANGED');}
   async function healthyExecution(){assert.deepEqual(await executionVault.read('host-execution'),executionRecord,'HOST_EXECUTION_CAS_CHANGED');}
   const journal=createNativeValueAccountJournals({readRecord:()=>accountRecord,async write(change){
    await healthyAccount();accountRecord=await accountVault.update('host-account',accountRecord.revision,change);
    await healthyAccount();
   }}).reservations;
   const reservations={reservationRow:id=>{assert.equal(id,ref);return journal.rows().find(row=>row.jobId===id);},reservationUpdate:journal.patch};
   const mechanism=createNativeRecoveryReorgReservationV1({reservations,format:{bare,reference:value=>assert.match(value,/^[0-9a-f]{64}$/)},
    chain:{nativeExecution:executor,runtime,pool,system:{sender:expected.from}},
    originalRow(e,id){assert.equal(e,executor);assert.equal(id,ref);return reservations.reservationRow(id);}
   });
   // These ports expose only the fixture journal. They never register the
   // fixture account or executor with the canonical authority owners.
   const accountPorts={
    originalDeviceNativeFReorgStateV1:(a,e,id)=>{assert.equal(a,account);return mechanism.reorgState(e,id);},
    retainOriginalDeviceNativeFReorgV1:(a,e,id,hash,phase)=>{assert.equal(a,account);return mechanism.retainReorg(e,id,hash,phase);},
    assertOriginalDeviceNativeFReorgPendingV1:(a,e,id,hash)=>{assert.equal(a,account);return mechanism.assertReorgPending(e,id,hash);},
    async checkOriginalDeviceNativeFReorgPendingV1(a,e,id,hash){assert.equal(a,account);await healthyAccount();mechanism.assertReorgPending(e,id,hash);},
    finish:result=>mechanism.retainDeviceTerminal(reservations.reservationRow(ref),result),read:()=>cloned(accountRecord)
   };
   const entry={label:'flat-execution-recovery-'+ref,request:{from:expected.from,to:expected.to,data:calldata,value:'0x0'},senderNonce:'0x3',phase:'mined',receipt:cloned(oldReceipt),transactionHash:signed.nativeId,localSigned:{...signed,expected}};
   let lastTimestamp=100n;
   const rpc=async(method,args)=>{if(method==='eth_pendingTransactions')return cloned(pending);if(method==='eth_getTransactionCount')return mode==='nonce'?'0x4':'0x3';
      if(method==='eth_sendRawTransaction'){const a=await accountVault.read('host-account'),e=await executionVault.read('host-execution');assert.equal(a.data.deviceReservations[0].nativeFReorg.phase,'OBSERVATION_PENDING');assert.equal(e.data.operations[0].nativeFReorg.phase,'OBSERVATION_PENDING');assert.equal(a.data.deviceReservations[0].nativeOutcome,null);assert.equal(e.data.operations[0].outcome,null);assert.equal(args[0],signed.nativeWire);sendCount++;if(mode==='unknown')throw new Error('HOST_RPC_UNCERTAIN');return signed.nativeId;}
      if(method==='evm_setNextBlockTimestamp'){nextTime=args[0];return true;}if(method==='evm_mine'){head={...cloned(includedHeader),hash:'0x'+'66'.repeat(32),timestamp:'0x'+BigInt(nextTime).toString(16)};currentReceipt={...cloned(oldReceipt),blockHash:head.hash};currentTx={hash:signed.nativeId,from:expected.from,to:expected.to,input:calldata,value:'0x0',nonce:'0x3',blockHash:head.hash,blockNumber:head.number};return true;}assert.fail('HOST_UNEXPECTED_RPC');};
   const emit=saved=>reemitRetainedRecoveryWireV1(saved,{transactions:[entry],block:async()=>cloned(head),assertCanonical:runtime.assertCanonical,
    transaction:runtime.transaction,receipt:runtime.receipt,rpc,clock:{observed:false,rewind:value=>{lastTimestamp=value;}},
    assertAlive:()=>assert.equal(closed,false),checkReceipt:runtime.checkReceipt,markUncertain:()=>{uncertainMutation=true;},
    async mineAt(timestamp){assert.ok(timestamp>lastTimestamp);await rpc('evm_setNextBlockTimestamp',[Number(timestamp)]);await rpc('evm_mine');lastTimestamp=timestamp;}
   });
   const operation=id=>{assert.equal(id,ref);return executionRecord.data.operations[0];};
   const keeper={keeper:executor,read:()=>cloned(executionRecord),async run(){
    assert.equal(busy,false);busy=true;
    try{await healthyExecution();return await reconcileRecoveryReorgV1(account,ref,{
     wrapped:false,binding:accountPorts,keeper:executor,operation,runtime,terminalObserver:{checkRecoveryReorg:check},healthy:healthyExecution,
     readRevision:()=>executionRecord.revision,assertActive:()=>{assert.equal(closed,false);assert.equal(busy,true);},
     async update(id,values){assert.equal(id,ref);await healthyExecution();executionRecord=await executionVault.update('host-execution',executionRecord.revision,data=>({...data,operations:data.operations.map(row=>row.reference===id?{...row,...cloned(values)}:row)}));await healthyExecution();},
     observedSubmission:async()=>{assert.ok(currentReceipt,'HOST_ORIGINAL_RECEIPT_UNAVAILABLE');return {receipt:cloned(currentReceipt),outcome:'RECOVERED',calldataSHA256:dataHash(calldata)};},
     async emit(saved){assert.equal(uncertainMutation,false);await emit(saved);}
    });}finally{busy=false;}
   }};
   return {account,accountPorts,keeper,runtime,emit,read:()=>({sendCount,entry}),check,
    tamperHead(){head={...head,hash:'0x'+'77'.repeat(32)};},async tamperAccount(){const value=await accountVault.read('host-account');await accountVault.update('host-account',value.revision,data=>({...data,extra:true}));}};
  }
  const good=await fixture();assert.throws(()=>originalDeviceNativeFReorgStateV1(good.account,good.keeper.keeper,ref),/ORIGINAL_ACCOUNT/);assert.throws(()=>originalDeviceNativeFReorgStateV1({...good.account},good.keeper.keeper,ref),/ORIGINAL_ACCOUNT/);assert.equal((await good.keeper.run()).originalFReorgInvalidated,true);assert.equal(good.read().sendCount,0);
  assert.equal(good.accountPorts.read().data.deviceReservations[0].nativeOutcome,null);assert.equal(good.keeper.read().data.operations[0].outcome,null);
  assert.throws(()=>consumeOriginalNativeRecoveryReorgWireV1({},good.runtime),/ORIGINAL_WIRE_TOKEN/);const result=await good.keeper.run();await good.accountPorts.finish(result);
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
