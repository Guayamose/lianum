/** Synthetic metadata/RPC boundary only: no native node, compiler or prover.
 * Signed bytes are a separate mathematical public ECDSA codec fixture. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {writeFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as actualRuntimeHarness from '@lianum/engine/chains/shared/runtime-harness';
const {projectRoot}=actualRuntimeHarness;
import * as actualPrivateAsset from '@lianum/engine/notes/private-asset-runtime';
import * as actualGoldenRuntime from '@lianum/engine/execution/local/local-evm';
let control;
const scopes=new WeakMap(),failures=new WeakMap(),golden=new WeakSet();
mock.module(import.meta.resolve('@lianum/engine/notes/private-asset-runtime'),{exports:{...actualPrivateAsset,decodePrivateRevert(){throw Error('UNEXPECTED_REVERT');}}});
mock.module(import.meta.resolve('@lianum/engine/execution/local/local-evm'),{exports:{...actualGoldenRuntime,
  LOCAL_EVM_PROFILE:Object.freeze({name:'PAEG_LOCAL_FAKE_CLOCK_V1',chainId:31337,hardfork:'cancun',genesisTimestamp:1900000210,accountCount:5,accountBalanceWei:'10000000000000000000',maxGas:30000000,manualMining:true,publicNetwork:false}),
  async assertLocalEvm(runtime){assert.ok(golden.has(runtime),'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');return runtime.health();}
}});
mock.module(new URL('../../../../src/chains/evm/dispatch/evm-dispatch-gate.mjs',import.meta.url).href,{exports:{
  assertOwnedEvmDispatchRequest(request,runtime){const value=scopes.get(request);assert.ok(value&&value.runtime===runtime,'SYNTHETIC_ORIGINAL_SCOPE_REQUIRED');return value.callbacks;}
}});
const hash=c=>'0x'+c.repeat(64),hex=n=>'0x'+BigInt(n).toString(16),target='0x'+'99'.repeat(20),clock=1900000210;
async function rpc(endpoint,method,params=[]) {
  assert.equal(endpoint,'http://127.0.0.1:31338');const c=control;c.events.push(method);
  switch(method){
    case 'eth_chainId':return '0x7a69';case 'eth_accounts':return c.accounts;
    case 'eth_blockNumber':return c.head.number;
    case 'eth_getBlockByNumber':return params[0]==='0x0'?c.genesis:{...c.head};
    case 'eth_getTransactionCount':return c.nonce;case 'eth_getBalance':return '0x8ac7230489e80000';
    case 'eth_getCode':return params[0]===target?'0x6000':'0x';case 'eth_call':return '0x';
    case 'eth_pendingTransactions':return [];
    case 'eth_sendTransaction': {
      c.sends++;assert.equal(params.length,1);
      const tx=params[0];
      if(tx.gas==='0x1000001') {
        assert.deepEqual(tx,{from:c.accounts[0],to:c.accounts[4],gas:'0x1000001',value:'0x0',data:'0x'});
        if(c.probeAccept)return c.txHash;
        if(c.probeSpoof)throw Object.assign(Error('OWNED_RPC_REMOTE_ERROR'),{schema:'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1'});
        if(c.probeStateChanged)c.nonce='0x1';
        const error=Error('OWNED_RPC_REMOTE_ERROR');failures.set(error,{schema:'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1',method,
          rpcCode:-32003,message:{text:c.probeWrongCapBranch?'Transaction gas limit is greater than the block gas limit, gas_limit: 16777217, cap: 16777216':c.probeOtherError?'other failure':
            'intrinsic gas too high -- tx.gas_limit > resolved tx gas limit cap',omitted:false}});
        throw error;
      }
      assert.equal(BigInt(tx.gas),BigInt(c.expectedGas));c.pending=true;return c.txHash;
    }
    case 'eth_signTransaction':c.signs++;assert.equal(BigInt(params[0].gas),BigInt(c.expectedGas));return c.wire;
    case 'eth_sendRawTransaction':c.sends++;assert.equal(params[0],c.wire);c.pending=true;return c.txHash;
    case 'evm_setNextBlockTimestamp':c.nextTime=params[0];return null;
    case 'evm_mine':c.head={...c.head,number:hex(BigInt(c.head.number)+1n),timestamp:hex(c.nextTime),hash:hash('3'),transactions:c.pending?[c.txHash]:[]};c.pending=false;c.nonce='0x1';return null;
    case 'eth_getTransactionReceipt':return c.head.number==='0x0'?null:c.receipt;
    case 'eth_getTransactionByHash':return c.head.number==='0x0'?null:c.observed;
    default:throw Error('SYNTHETIC_UNEXPECTED_RPC_'+method);
  }
}
mock.module(import.meta.resolve('@lianum/engine/chains/shared/runtime-harness'),{exports:{...actualRuntimeHarness,
  projectRoot, async pinnedBinary(...args){assert.equal(args[0],'foundry-v1.8.4/anvil');return '/synthetic/pinned-anvil';},
  async scratchDirectory(){control.directory=await mkdtemp(join(tmpdir(),'osaka-host-'));return control.directory;},
  async removeOwnScratch(path){assert.equal(path,control.directory);await rm(path,{recursive:true});},
  async unusedLoopbackPort(){return 31338;},async sleep(){},
  startOwnProcess(binary,args){
    assert.equal(binary,'/synthetic/pinned-anvil');control.args=args;
    writeFileSync(args[args.indexOf('--config-out')+1],JSON.stringify({available_accounts:control.accounts,wallet:{mnemonic:Array(12).fill('fixture').join(' ')}}),{flag:'w',mode:0o600});
    const child=new EventEmitter();Object.assign(child,{pid:12345,exitCode:null,signalCode:null});
    return {child,assertAlive(){assert.equal(child.exitCode,null);}};
  },
  async stopOwnProcess(handle){handle.child.exitCode=0;handle.child.emit('exit',0,null);return {stopped:true,forced:false};},
  ownedRuntimeRpc:rpc,originalOwnedRuntimeRpcFailureV1(error){return failures.get(error)??null;}
}});
mock.method(globalThis,'fetch',async(endpoint,options)=>{
  assert.equal(options.redirect,'error');const items=JSON.parse(options.body);assert.ok(Array.isArray(items));
  const rows=await Promise.all(items.map(async row=>({jsonrpc:'2.0',id:row.id,result:await rpc(endpoint,row.method,row.params)})));
  return new Response(JSON.stringify(rows.reverse()));
});
const actualRecovery=await import('../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs');
mock.module(new URL('../../../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs',import.meta.url).href,{exports:{...actualRecovery,
 async writeInitialNativeCredentialsV1(cwd,family,value){assert.equal(cwd,control.directory);assert.equal(family,'receiver');assert.equal(value.profile,'PAEG_LOCAL_FAKE_CLOCK_V1');control.syntheticInitialCredentials=true;return null;}
}});
const {createOwnedLocalEvmOsakaV1,createOwnedLocalEvmV2,LOCAL_OSAKA_EVM_PROFILE_V1,LOCAL_EVM_PROFILE,
  ownedLocalEvmTransactionGasLimit,probeOwnedOsakaTransactionGasRejectionV1,decodeCanonicalEvmTransaction,assertSignedEvmTransaction}
  =await import('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs');
const {assertLocalEvmDeploymentProfile}=await import('../../../../src/chains/evm/runtime/local-evm-ownership.mjs');
const integer=n=>{let x=BigInt(n).toString(16);if(x==='0')return Buffer.alloc(0);if(x.length%2)x='0'+x;return Buffer.from(x,'hex');};
const rlp=value=>{
 const prefix=(size,offset)=>size<56?Buffer.from([offset+size]):Buffer.concat([Buffer.from([offset+55+integer(size).length]),integer(size)]);
 if(Array.isArray(value)){const body=Buffer.concat(value.map(rlp));return Buffer.concat([prefix(body.length,192),body]);}
 return value.length===1&&value[0]<128?value:Buffer.concat([prefix(value.length,128),value]);
};
function mathematicalWire(gas){return '0x'+rlp([integer(0),integer(1000000000),integer(gas),Buffer.from(target.slice(2),'hex'),
 integer(0),Buffer.from('12345678','hex'),integer(62709),
 Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798','hex'),Buffer.from([1])]).toString('hex');}
async function fixture(legacy=false){
 const wire=mathematicalWire(16777216),decoded=decodeCanonicalEvmTransaction(wire),genesis={number:'0x0',hash:hash('1'),timestamp:hex(clock),transactions:[],baseFeePerGas:'0x3b9aca00'};
 control={wire,txHash:decoded.nativeId,expectedGas:16777216,accounts:[decoded.from,...['2','3','4','5'].map(c=>'0x'+c.repeat(40))],
  genesis,head:{...genesis},events:[],nonce:'0x0',sends:0,signs:0};
 control.receipt={transactionHash:control.txHash,status:'0x1',blockNumber:'0x1',blockHash:hash('3'),transactionIndex:'0x0',gasUsed:'0x5208'};
 control.observed={hash:control.txHash,from:decoded.from,to:target,input:'0x12345678',nonce:'0x0',chainId:'0x7a69',gasPrice:'0x3b9aca00',gas:'0x1000000',value:'0x0',blockNumber:'0x1',blockHash:hash('3')};
 const runtime=await (legacy?createOwnedLocalEvmV2():createOwnedLocalEvmOsakaV1());return {runtime,c:control};
}
test('original Osaka factory authenticates exact fixed profile and launch flags, rejecting options and copies',async()=>{
 await assert.rejects(createOwnedLocalEvmOsakaV1({hardfork:'cancun'}),/FIXED_CONSTRUCTOR/);
 const {runtime,c}=await fixture();try{
  assert.equal(runtime.metadata.profile,LOCAL_OSAKA_EVM_PROFILE_V1);assert.equal(ownedLocalEvmTransactionGasLimit(runtime),16777216);
  assert.equal(await assertLocalEvmDeploymentProfile(runtime),LOCAL_OSAKA_EVM_PROFILE_V1);
  assert.deepEqual(c.args.slice(0,8),['--host','127.0.0.1','--port','31338','--chain-id','31337','--hardfork','osaka']);
  assert.equal(c.args.filter(x=>x==='--enable-tx-gas-limit').length,1);assert.equal(c.args[c.args.indexOf('--gas-limit')+1],'30000000');
  assert.ok(!c.args.some(x=>/disable.*limit/.test(x)));
  for(const copy of [{...runtime},{metadata:runtime.metadata},{}]){
   assert.throws(()=>ownedLocalEvmTransactionGasLimit(copy),/CAPABILITY/);
   await assert.rejects(assertLocalEvmDeploymentProfile(copy),/CAPABILITY/);
   await assert.rejects(probeOwnedOsakaTransactionGasRejectionV1(copy),/ORIGINAL_RUNTIME/);
  }
 }finally{await runtime.abort();}
});
test('original send and dispatch reject zero/cap+1/30M before journal, nonce, balance or native key use; cap-exact emits once',async()=>{
 const {runtime,c}=await fixture();try{
  const before={nonce:await runtime.nonce(runtime.accounts[0]),balance:await runtime.balance(runtime.accounts[0]),journal:runtime.transactions};
  for(const gas of ['0','16777217','30000000']){
   await assert.rejects(runtime.send('synthetic invalid gas',{to:target,data:'0x12345678',gas}),/GAS_LIMIT/);
   const request={};scopes.set(request,{runtime,callbacks:{transaction:{from:runtime.accounts[0],to:target,data:'0x12345678',value:'0',gas},beforeSign(){},onSigned(){}}});
   await assert.rejects(runtime.dispatch(request),/GAS_LIMIT/);
   assert.deepEqual({nonce:await runtime.nonce(runtime.accounts[0]),balance:await runtime.balance(runtime.accounts[0]),journal:runtime.transactions},before);
   assert.equal(c.sends,0);assert.equal(c.signs,0);
  }
  const receipt=await runtime.send('synthetic cap-exact',{to:target,data:'0x12345678',gas:'16777216'});
  assert.equal(receipt.status,'0x1');assert.equal(c.sends,1);assert.equal(c.signs,0);
  assert.equal(runtime.transactions.length,1);assert.equal(BigInt(runtime.transactions[0].request.gas),16777216n);
 }finally{await runtime.abort();}
});
test('fixed original node probe authenticates remote error, unchanged state and one use; ambiguous/accepted responses poison fence',async()=>{
 for(const variation of ['reject','accept','wrong-error','wrong-cap-branch','spoof','state-change']){
  const {runtime,c}=await fixture();try{
   c.probeAccept=variation==='accept';c.probeOtherError=variation==='wrong-error';
   c.probeWrongCapBranch=variation==='wrong-cap-branch';c.probeSpoof=variation==='spoof';c.probeStateChanged=variation==='state-change';
   if(variation==='reject'){
    const proof=await probeOwnedOsakaTransactionGasRejectionV1(runtime);assert.equal(proof.originalStateUnchanged,true);
    assert.deepEqual(proof.before,proof.after);assert.equal(runtime.mutationStatus.uncertain,false);
   }else{
    await assert.rejects(probeOwnedOsakaTransactionGasRejectionV1(runtime),/OSAKA_GAS_PROBE_/);
    assert.equal(runtime.mutationStatus.uncertain,true);
    await assert.rejects(runtime.send('no repeat',{to:target,data:'0x12345678',gas:'16777216'}),/UNCERTAIN_MUTATION/);
   }
   await assert.rejects(probeOwnedOsakaTransactionGasRejectionV1(runtime),/ONE_ATTEMPT_ONLY/);
   assert.equal(c.sends,1);assert.equal(c.signs,0);assert.equal(runtime.transactions.length,0);
  }finally{await runtime.abort();}
 }
});
test('independent public mathematical signed-wire codec joins cap exactly and rejects altered expected gas',()=>{
 const wire=mathematicalWire(16777216),decoded=decodeCanonicalEvmTransaction(wire);
 assert.equal(decoded.gas,'16777216');const expected=Object.fromEntries(['chainId','from','to','nonce','gasPrice','gas','value','data'].map(k=>[k,decoded[k]]));
 assert.deepEqual(assertSignedEvmTransaction(wire,expected),decoded);
 for(const gas of ['16777217','30000000'])assert.throws(()=>assertSignedEvmTransaction(wire,{...expected,gas}),/EVM_SIGNED_GAS/);
 // This test establishes decoding/body integrity only; it does not assert a
 // legacy native-value factory adopts the new fork or Node signed this wire.
 assert.equal(LOCAL_EVM_PROFILE.hardfork,'cancun');assert.equal(LOCAL_EVM_PROFILE.maxGas,30000000);
});

test('unchanged original legacy factory still launches Cancun, emits default30M and rejects Osaka node probe',async()=>{
 const {runtime,c}=await fixture(true);try{
  assert.equal(runtime.metadata.profile,LOCAL_EVM_PROFILE);assert.equal(ownedLocalEvmTransactionGasLimit(runtime),30000000);
  assert.equal(await assertLocalEvmDeploymentProfile(runtime),LOCAL_EVM_PROFILE);assert.equal(c.args[c.args.indexOf('--hardfork')+1],'cancun');
  assert.ok(!c.args.includes('--enable-tx-gas-limit'));assert.equal(c.args[c.args.indexOf('--gas-limit')+1],'30000000');
  assert.equal(c.syntheticInitialCredentials,true);await assert.rejects(probeOwnedOsakaTransactionGasRejectionV1(runtime),/ORIGINAL_RUNTIME/);
  c.expectedGas=30000000;c.observed.gas='0x1c9c380';await runtime.send('legacy unchanged setup',{to:target,data:'0x12345678'});
  assert.equal(BigInt(runtime.transactions[0].request.gas),30000000n);assert.equal(c.sends,1);
 }finally{await runtime.abort();}
});
