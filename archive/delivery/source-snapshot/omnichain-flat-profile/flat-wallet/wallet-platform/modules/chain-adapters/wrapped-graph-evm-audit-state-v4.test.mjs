/** Synthetic host boundaries only. No Anvil, real transfers, prover or compiler.
 * Independently exercises public recovery against OpenSSL-generated standard
 * ECDSA signatures. Run with --experimental-test-module-mocks. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, open as actualOpen, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
mock.module(new URL('../../../../../omnichain-product/src/private-asset-runtime.mjs', import.meta.url).href, { exports: {
  decodePrivateRevert() { throw new Error('SYNTHETIC_REVERT_TRACE_NOT_USED'); },
} });
const realBrands = new WeakSet(), scopes = new WeakMap();
let control;
mock.module(new URL('./evm-dispatch-gate.mjs', import.meta.url).href, { exports: {
  assertOwnedEvmDispatchRequest(request, runtime) { const scope = scopes.get(request);
    assert.ok(scope && scope.runtime === runtime, 'SYNTHETIC_ORIGINAL_SCOPE_REQUIRED'); return scope.callbacks; },
} });
mock.module(new URL('../../../../../omnichain-product/src/paeg/local-evm.mjs', import.meta.url).href, { exports: {
  async assertLocalEvm(runtime) { assert.ok(realBrands.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED'); return runtime.health(); },
} });
mock.module('node:fs/promises', { exports: { readFile, async open(path, flags, mode) {
  if (String(path).includes('/signed-')) {
    control.events.push('persist-open'); if (control.failPersist) throw new Error('SYNTHETIC_FSYNC_FAILED');
    const file = await actualOpen(path, flags, mode);
    return { writeFile: (...args) => file.writeFile(...args), close: () => file.close(),
      async sync() { await file.sync(); control.events.push('persist-sync'); } };
  }
  return actualOpen(path, flags, mode);
} } });
const hash = char => '0x' + char.repeat(64), hex = n => '0x' + BigInt(n).toString(16);
const target = '0x' + '99'.repeat(20), code = '0x6000', initialTime = 1900000310;
mock.module(new URL('../../../../../omnichain-product/src/chains/runtime-harness.mjs', import.meta.url).href, { exports: {
  async pinnedBinary(...pin) { assert.equal(pin[0], 'foundry-v1.8.4/anvil'); return '/synthetic/pinned-anvil'; },
  async scratchDirectory() { control.directory = await mkdtemp(join(tmpdir(), 'evm-v2-synthetic-')); return control.directory; },
  async removeOwnScratch(path) { assert.equal(path, control.directory); },
  async unusedLoopbackPort() { return 31338; }, async sleep() {},
  startOwnProcess(binary, args) {
    assert.equal(binary, '/synthetic/pinned-anvil');
    assert.deepEqual(args, ['--host','127.0.0.1','--port','31338','--chain-id','1','--hardfork','cancun',
      '--timestamp', String(initialTime), '--accounts','5','--balance','10','--mnemonic-random','12','--no-cors','--no-mining','--gas-limit','30000000']);
    const child = new EventEmitter(); control.child = child; Object.assign(child,{pid:12345,exitCode:null,signalCode:null});
    return {child, assertAlive(){assert.equal(child.exitCode,null);}};
  },
  async stopOwnProcess(handle) { handle.child.exitCode = 0; handle.child.emit('exit', 0, null); return {stopped:true,forced:false}; },
  async ownedRuntimeRpc(endpoint, method, params, options) {
    if (options) { assert.equal(options.timeoutMs, 30_000); control.directMethods.push(method); }
    assert.equal(endpoint, 'http://127.0.0.1:31338'); control.events.push(method);
    const c = control;
    switch (method) {
      case 'eth_chainId': return '0x1';
      case 'web3_clientVersion': return 'INERT_GRAPH_CLIENT';
      case 'eth_accounts': return [...c.accounts];
      case 'eth_blockNumber': return c.head.number;
      case 'eth_getBlockByNumber':
        if (params[0] === '0x0') return {...c.genesis};
        c.headReads++; if (c.changeHead && c.headReads === 2) return {...c.head,hash:hash('2')};
        return {...c.head,transactions:[...c.head.transactions]};
      case 'eth_getTransactionCount':
        if (c.changeNonce && ++c.nonceReads > 2) return '0x1'; return c.nonce;
      case 'eth_getBalance': return '0x8ac7230489e80000';
      case 'eth_getCode': return c.codeOverride?.(params) ?? (params[0] === target ? code : '0x');
      case 'eth_call': return c.callOverride?.(params) ?? '0x';
      case 'eth_estimateGas': return '0x5208';
      case 'eth_signTransaction': c.signs++; assert.deepEqual(params[0], c.signRequest);
        if (c.loseSign) throw new Error('SYNTHETIC_SIGN_REPLY_LOST'); return c.changedWire ?? c.wire;
      case 'eth_sendRawTransaction': c.broadcasts++; assert.equal(params[0], c.wire);
        if (c.loseBroadcast) throw new Error('SYNTHETIC_SEND_REPLY_LOST'); c.pendingBroadcast=true; return c.txHash;
      case 'evm_setNextBlockTimestamp': c.nextTime = params[0]; return null;
      case 'evm_mine': c.head = {...c.head,number:hex(BigInt(c.head.number)+1n),timestamp:hex(c.nextTime),hash:hash('3'),transactions:c.pendingBroadcast?[c.txHash]:[]}; c.pendingBroadcast=false;c.nonce='0x1'; return null;
      case 'eth_getTransactionReceipt': return c.head.number === '0x0' ? null : {...c.receipt};
      case 'eth_getTransactionByHash': return c.head.number === '0x0' ? null : {...c.observed};
      default: throw new Error('SYNTHETIC_FORBIDDEN_RPC_' + method);
    }
  },
} });
// Fake only the private HTTP boundary; no endpoint is contacted. The real
// batching helper is exercised by every runtime test below.
const { ownedRuntimeRpc: syntheticRpc } = await import('../../../../../omnichain-product/src/chains/runtime-harness.mjs');
mock.method(globalThis, 'fetch', async (endpoint, options) => {
  assert.equal(endpoint, 'http://127.0.0.1:31338');
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  const requests = JSON.parse(options.body), c = control;
  if(!Array.isArray(requests)){if(c.holdSource)await c.holdSource;return new Response(JSON.stringify({jsonrpc:'2.0',id:requests.id,result:await syntheticRpc(endpoint,requests.method,requests.params)}));}
  c.batches.push(requests);
  if (c.holdBatch) await c.holdBatch;
  const replies = await Promise.all(requests.map(async request => ({ jsonrpc: '2.0', id: request.id,
    result: await syntheticRpc(endpoint, request.method, request.params) })));
  return new Response(JSON.stringify(replies.reverse()));
});
const { createOwnedLocalEvmNativeValueV1, readOwnedLocalEvmNativeValueAuditStateV4, assertOwnedLocalEvmV2, decodeCanonicalEvmTransaction,
  assertSignedEvmTransaction, recoverSecp256k1Sender } = await import('./owned-evm-v2-runtime.mjs');
const { assertLocalEvm } = await import('./local-evm-ownership.mjs');
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const numberBytes = n => {let x=BigInt(n).toString(16);if(x==='0')return Buffer.alloc(0);if(x.length%2)x='0'+x;return Buffer.from(x,'hex');};
const rlp = xs => {
  const prefix = (length, p) => length<56 ? Buffer.from([p+length]) : Buffer.concat([Buffer.from([p+55+numberBytes(length).length]),numberBytes(length)]);
  if (Array.isArray(xs)) {const body=Buffer.concat(xs.map(rlp));return Buffer.concat([prefix(body.length,192),body]);}
  return xs.length===1&&xs[0]<128 ? xs : Buffer.concat([prefix(xs.length,128),xs]);
};
// Mathematical public signature fixture: r=Gx,s=1, signer recovered from this
// digest. No private signer or real chain claim is attached to these bytes.
function syntheticWire(patch={}) {
  const tx={chainId:'31337',nonce:'0',gasPrice:'1000000000',gas:'50000',to:target,value:'0',data:'0x12345678',...patch};
  return '0x'+rlp([numberBytes(tx.nonce),numberBytes(tx.gasPrice),numberBytes(tx.gas),Buffer.from(tx.to.slice(2),'hex'),
    numberBytes(tx.value),Buffer.from(tx.data.slice(2),'hex'),numberBytes(35n+2n*BigInt(tx.chainId)),Buffer.from(Gx,'hex'),Buffer.from([1])]).toString('hex');
}
async function fixture(options={}) {
  const wire=syntheticWire(), decoded=decodeCanonicalEvmTransaction(wire);
  const genesis={number:'0x0',hash:hash('1'),timestamp:hex(initialTime),transactions:[],baseFeePerGas:'0x3b9aca00'};
  control={directory:null,wire,txHash:decoded.nativeId,accounts:[decoded.from,...['2','3','4','5'].map(v=>'0x'+v.repeat(40))],
    genesis,head:{...genesis},events:[],batches:[],directMethods:[],nonce:'0x0',headReads:0,nonceReads:0,signs:0,broadcasts:0,...options};
  const c=control; c.signRequest={from:decoded.from,to:target,data:'0x12345678',gas:'0xc350',value:'0x0',nonce:'0x0',chainId:'0x7a69',gasPrice:'0x3b9aca00',type:'0x0'};
  c.receipt={transactionHash:c.txHash,status:'0x1',blockNumber:'0x1',blockHash:hash('3'),transactionIndex:'0x0',gasUsed:'0x5208'};
  c.observed={hash:c.txHash,from:decoded.from,to:target,input:'0x12345678',nonce:'0x0',chainId:'0x7a69',gasPrice:'0x3b9aca00',gas:'0xc350',value:'0x0',blockNumber:'0x1',blockHash:hash('3')};
  const runtime=await createOwnedLocalEvmNativeValueV1(); c.events=[]; c.headReads=0;c.nonceReads=0;
  const request={}; scopes.set(request,{runtime,callbacks:{transaction:{from:decoded.from,to:target,data:'0x12345678',gas:'50000',value:'0'},
    async beforeSign(prepared){c.events.push('beforeSign'); c.prepared=prepared;assert.ok(Object.isFrozen(prepared.transaction));
      await c.beforeSign?.(prepared);},
    async onSigned(signed){c.events.push('onSigned');c.signed=signed;assert.ok(Object.isFrozen(signed));await c.onSigned?.(signed);
      c.events.push('provider-signature-durable');},
  }});
  return {c,runtime,request,decoded,cleanup:()=>runtime.abort()};
}


const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('actual EVM native runtime exposes immutable complete original physical audit state only',async()=>{
 const f=await fixture();try{
  const first=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);
  assert.equal(first.profile,'OWNED_WRAPPED_GRAPH_NATIVE_AUDIT_STATE_V4');assert.equal(first.family,'EVM');assert.ok(first.lifetimeId);
  assert.equal(first.genesis,f.runtime.metadata.evmGenesis);assert.equal(first.readsIdle,true);assert.equal(first.activeReads,0);
  for(const key of ['transactions','receipts','lifecycle'])assert.ok(Array.isArray(first[key])&&Object.isFrozen(first[key]));
  for(const key of ['busy','closed','uncertain','pending','adverseHistory'])assert.equal(first[key],false);
  assert.ok(Object.isFrozen(first));assert.throws(()=>{first.readGeneration='0';},TypeError);
  for(const copy of [{...f.runtime},{metadata:f.runtime.metadata},new Proxy(f.runtime,{})])
   assert.throws(()=>readOwnedLocalEvmNativeValueAuditStateV4(copy),/ORIGINAL_RUNTIME_REQUIRED/);
  await f.runtime.health();const after=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);
  assert.ok(BigInt(after.readGeneration)>BigInt(first.readGeneration));assert.equal(after.mutationGeneration,first.mutationGeneration);
  assert.equal(after.lifetimeId,first.lifetimeId);assert.deepEqual(after.transactions,first.transactions);
 }finally{await f.cleanup();}
 await assert.rejects(Promise.resolve().then(()=>readOwnedLocalEvmNativeValueAuditStateV4(f.runtime)),/PROCESS_NOT_RUNNING/);
});
test('actual EVM pending read and failed mutation cannot restore a prior physical generation',async()=>{
 const f=await fixture();let release;
 try{
  const before=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);f.c.holdBatch=new Promise(resolve=>{release=resolve;});
  const read=f.runtime.block();await tick();const active=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);
  assert.equal(active.readsIdle,false);assert.ok(active.activeReads>0);assert.ok(BigInt(active.readGeneration)>BigInt(before.readGeneration));
  release();await read;f.c.holdBatch=null;
  const completed=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);assert.equal(completed.activeReads,0);assert.ok(BigInt(completed.readGeneration)>BigInt(active.readGeneration));
  f.c.holdBatch=new Promise(resolve=>{release=resolve;});const mutation=f.runtime.reconcileSignedTransaction(hash('a'));await tick();
  const mutating=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);assert.equal(mutating.busy,true);assert.equal(mutating.activeMutations,1);assert.equal(BigInt(mutating.mutationGeneration),BigInt(before.mutationGeneration)+1n);
  release();await assert.rejects(mutation,/ORIGINAL|SIGNED|RECONCILE/);f.c.holdBatch=null;
  const ended=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);assert.equal(ended.busy,false);assert.equal(ended.mutationGeneration,mutating.mutationGeneration);
  assert.ok(BigInt(ended.readGeneration)>BigInt(completed.readGeneration));assert.equal(f.c.signs,0);assert.equal(f.c.broadcasts,0);
 }finally{release?.();await f.cleanup();}
});

test('actual original EVM source descriptor RPCs participate in physical read quiescence',async()=>{
 const f=await fixture();let release;
 try{
  const {describeOwnedLocalEvmNativeValueSource}=await import('./owned-evm-native-value-health-source-v4.mjs');
  const before=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);f.c.holdSource=new Promise(resolve=>{release=resolve;});
  const describing=describeOwnedLocalEvmNativeValueSource(f.runtime,0);await new Promise(resolve=>setTimeout(resolve,10));
  const active=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);assert.equal(active.readsIdle,false);assert.ok(active.activeReads>0);
  release();const descriptor=await describing;f.c.holdSource=null;assert.equal(descriptor.sourceIndex,'0');assert.equal(descriptor.instanceCommitment,before.lifetimeId);
  const after=readOwnedLocalEvmNativeValueAuditStateV4(f.runtime);assert.equal(after.readsIdle,true);assert.ok(BigInt(after.readGeneration)>BigInt(before.readGeneration));
  assert.equal(f.c.signs,0);assert.equal(f.c.broadcasts,0);
 }finally{release?.();await f.cleanup();}
});
