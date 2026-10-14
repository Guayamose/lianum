/** Synthetic host boundaries only. No Anvil, real transfers, prover or compiler.
 * Independently exercises public recovery against OpenSSL-generated standard
 * ECDSA signatures. Run with --experimental-test-module-mocks. */
import test, { mock,after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as actualFs from 'node:fs/promises';
const {mkdtemp,rm,open:actualOpen,readFile}=actualFs;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {writeFileSync} from 'node:fs';
// Synthetic process configuration is retained by the actual filesystem guard.
const hostProjectRoot=await mkdtemp(join(tmpdir(),'host-evm-fixture-'));
await actualFs.mkdir(join(hostProjectRoot,'.local/integrations'),{recursive:true});
after(()=>rm(hostProjectRoot,{recursive:true,force:true}));
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import * as actualAssetHelpers from '@lianum/engine/notes/private-asset-runtime';
import * as actualGoldenRuntime from '@lianum/engine/execution/local/local-evm';
mock.module(new URL('../../../../../engine/src/notes/private-asset-runtime.mjs', import.meta.url).href, { exports: { ...actualAssetHelpers,
  decodePrivateRevert() { throw new Error('SYNTHETIC_REVERT_TRACE_NOT_USED'); },
} });
const realBrands = new WeakSet(), scopes = new WeakMap();
let control;
mock.module(new URL('../../../../src/chains/evm/dispatch/evm-dispatch-gate.mjs', import.meta.url).href, { exports: {
  assertOwnedEvmDispatchRequest(request, runtime) { const scope = scopes.get(request);
    assert.ok(scope && scope.runtime === runtime, 'SYNTHETIC_ORIGINAL_SCOPE_REQUIRED'); return scope.callbacks; },
} });
mock.module('@lianum/engine/execution/local/local-evm', { exports: { ...actualGoldenRuntime,
  async assertLocalEvm(runtime) { assert.ok(realBrands.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED'); return runtime.health(); },
} });
mock.module('node:fs/promises', { exports: { ...actualFs, async open(path, flags, mode) {
  if (String(path).includes('/signed-')) {
    control.events.push('persist-open'); if (control.failPersist) throw new Error('SYNTHETIC_FSYNC_FAILED');
    const file = await actualOpen(path, flags, mode);
    return { writeFile: (...args) => file.writeFile(...args), close: () => file.close(),
      async sync() { await file.sync(); control.events.push('persist-sync'); } };
  }
  return actualOpen(path, flags, mode);
} } });
const hash = char => '0x' + char.repeat(64), hex = n => '0x' + BigInt(n).toString(16);
const target = '0x' + '99'.repeat(20), code = '0x6000', initialTime = 1900000210;
mock.module(new URL('../../../../../engine/src/chains/shared/runtime-harness.mjs', import.meta.url).href, { exports: {
  projectRoot:hostProjectRoot,isolatedRuntimeEnvironment(){throw Error('HOST_FOREIGN_RUNTIME_ENV_NOT_USED');},
  originalOwnedRuntimeRpcFailureV1(){return null;},
  async pinnedBinary(...pin) { assert.equal(pin[0], 'foundry-v1.8.4/anvil'); return '/synthetic/pinned-anvil'; },
  async scratchDirectory(prefix) { control.directory = await mkdtemp(join(hostProjectRoot,'.local/integrations',prefix)); return control.directory; },
  async removeOwnScratch(path) { assert.equal(path, control.directory); await rm(path, {recursive:true}); },
  async unusedLoopbackPort() { return 31338; }, async sleep() {},
  startOwnProcess(binary, args) {
    assert.equal(binary, '/synthetic/pinned-anvil');
    assert.deepEqual(args, ['--host','127.0.0.1','--port','31338','--chain-id','31337','--hardfork','cancun',
      '--timestamp', String(initialTime), '--accounts','5','--balance','10','--mnemonic-random','12','--config-out',join(control.directory,'anvil-private-config.json'),'--quiet','--no-cors','--no-mining','--gas-limit','30000000']);
    writeFileSync(join(control.directory,'anvil-private-config.json'),JSON.stringify({available_accounts:control.accounts,wallet:{mnemonic:'test test test test test test test test test test test junk'}}),{mode:0o600});
    const child = new EventEmitter(); control.child = child; Object.assign(child,{pid:12345,exitCode:null,signalCode:null});
    return {child, assertAlive(){assert.equal(child.exitCode,null);}};
  },
  async stopOwnProcess(handle) { handle.child.exitCode = 0; handle.child.emit('exit', 0, null); return {stopped:true,forced:false}; },
  async ownedRuntimeRpc(endpoint, method, params, options) {
    if (options) { assert.equal(options.timeoutMs, 30_000); control.directMethods.push(method); }
    assert.equal(endpoint, 'http://127.0.0.1:31338'); control.events.push(method);
    const c = control;
    switch (method) {
      case 'eth_chainId': return '0x7a69';
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
const { ownedRuntimeRpc: syntheticRpc } = await import('@lianum/engine/chains/shared/runtime-harness');
mock.method(globalThis, 'fetch', async (endpoint, options) => {
  assert.equal(endpoint, 'http://127.0.0.1:31338');
  assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.ok(options.signal instanceof AbortSignal);
  const requests = JSON.parse(options.body), c = control;
  assert.ok(Array.isArray(requests)); c.batches.push(requests);
  if (c.holdBatch) await c.holdBatch;
  const replies = await Promise.all(requests.map(async request => ({ jsonrpc: '2.0', id: request.id,
    result: await syntheticRpc(endpoint, request.method, request.params) })));
  return new Response(JSON.stringify(replies.reverse()));
});
const { createOwnedLocalEvmV2, assertOwnedLocalEvmV2, decodeCanonicalEvmTransaction,
  assertSignedEvmTransaction, recoverSecp256k1Sender } = await import('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs');
const { assertLocalEvm } = await import('../../../../src/chains/evm/runtime/local-evm-ownership.mjs');
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
  const runtime=await createOwnedLocalEvmV2(); c.events=[]; c.headReads=0;c.nonceReads=0;
  const request={}; scopes.set(request,{runtime,callbacks:{transaction:{from:decoded.from,to:target,data:'0x12345678',gas:'50000',value:'0'},
    async beforeSign(prepared){c.events.push('beforeSign'); c.prepared=prepared;assert.ok(Object.isFrozen(prepared.transaction));
      await c.beforeSign?.(prepared);},
    async onSigned(signed){c.events.push('onSigned');c.signed=signed;assert.ok(Object.isFrozen(signed));await c.onSigned?.(signed);
      c.events.push('provider-signature-durable');},
  }});
  return {c,runtime,request,decoded,cleanup:()=>runtime.abort()};
}

test('standard public recovery independently matches OpenSSL ECDSA sign/verify for both parity choices', () => {
  for(let i=0;i<8;i++) {
    const pair=generateKeyPairSync('ec',{namedCurve:'secp256k1'}), message=Buffer.from('independent OpenSSL public recovery vector '+i);
    const sig=sign('sha256',message,{key:pair.privateKey,dsaEncoding:'ieee-p1363'});
    assert.ok(verify('sha256',message,{key:pair.publicKey,dsaEncoding:'ieee-p1363'},sig));
    let s=BigInt('0x'+sig.subarray(32).toString('hex'));if(s>ORDER/2n)s=ORDER-s;
    const key=pair.publicKey.export({format:'jwk'}), publicPoint=Buffer.concat([Buffer.from(key.x,'base64url'),Buffer.from(key.y,'base64url')]);
    const sender='0x'+publicKeccak256(publicPoint).subarray(12).toString('hex');
    const args={digest:createHash('sha256').update(message).digest('hex'),r:sig.subarray(0,32).toString('hex'),s:s.toString(16).padStart(64,'0')};
    const recovered=[0,1].map(parity=>recoverSecp256k1Sender({...args,parity}));
    assert.equal(recovered.filter(value=>value===sender).length,1);
    assert.throws(()=>recoverSecp256k1Sender({...args,s:(ORDER-s).toString(16).padStart(64,'0'),parity:0}),/LOW_S/);
  }
});
test('strict wire refuses noncanonical encodings, malformed signatures and every changed intent field', () => {
  const raw=syntheticWire(), decoded=decodeCanonicalEvmTransaction(raw);
  const expected=Object.fromEntries(['chainId','from','to','nonce','gasPrice','gas','value','data'].map(k=>[k,decoded[k]]));
  assert.deepEqual(assertSignedEvmTransaction(raw,expected),decoded);
  for(const name of Object.keys(expected)) {
    const value=['from','to'].includes(name)?'0x'+'ab'.repeat(20):name==='data'?'0x12345679':String(BigInt(expected[name])+1n);
    assert.throws(()=>assertSignedEvmTransaction(raw,{...expected,[name]:value}),/EVM_SIGNED_/);
  }
  for(const bad of [raw+'00','0x02'+raw.slice(2),'0x00',raw.toUpperCase(),'0xc08100','0xb80100'])
    assert.throws(()=>decodeCanonicalEvmTransaction(bad));
  assert.throws(()=>recoverSecp256k1Sender({digest:'00'.repeat(32),r:'00'.repeat(32),s:'01'.repeat(32),parity:0}),/LOW_S/);
});
test('ownership facade rejects copied runtime objects and gate scope copies',async()=>{
  const f=await fixture();try{
    await assertLocalEvm(f.runtime);await assertOwnedLocalEvmV2(f.runtime);
    for(const copied of [{...f.runtime},{metadata:f.runtime.metadata},{}])await assert.rejects(assertLocalEvm(copied),/CAPABILITY/);
    await assert.rejects(f.runtime.dispatch({...f.request}),/ORIGINAL_SCOPE/);
    const golden={health:async()=>({golden:true})};realBrands.add(golden);assert.deepEqual(await assertLocalEvm(golden),{golden:true});
  }finally{await f.cleanup();}
});
test('final gate immediately precedes real key-use seam; raw fsync then provider retention then one send',async()=>{
  const f=await fixture();try{
    f.c.beforeSign=async()=>{await assert.rejects(f.runtime.advanceTo(initialTime+1),/CONCURRENT_MUTATION/);
      await assert.rejects(f.runtime.send('interloper',{to:target,data:'0x12345678'}),/CONCURRENT_MUTATION/);};
    const result=await f.runtime.dispatch(f.request);assert.equal(result.nativeId,f.c.txHash);
    const events=f.c.events;assert.equal(events[events.indexOf('eth_signTransaction')-1],'beforeSign');
    assert.ok(events.indexOf('eth_signTransaction')<events.indexOf('persist-sync'));
    assert.ok(events.indexOf('persist-sync')<events.indexOf('onSigned'));
    assert.ok(events.indexOf('provider-signature-durable')<events.indexOf('eth_sendRawTransaction'));
    assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,1);
    assert.deepEqual(await f.runtime.signedTransaction(result.nativeId),f.c.signed);
    assert.equal((await f.runtime.transaction(result.nativeId)).hash,result.nativeId);
    assert.equal(JSON.parse(await readFile(join(f.c.directory,'signed-'+result.nativeId.slice(2)+'.json'),'utf8')).signed.nativeWire,f.c.wire);
    await assert.rejects(f.runtime.dispatch(f.request),/ALREADY_USED_NO_RESEND/);assert.equal(f.c.broadcasts,1);
  }finally{await f.cleanup();}
});
for(const failure of ['guard','nonce','head'])test(failure+' rejection makes no key use or send',async()=>{
  const f=await fixture();try{
    if(failure==='guard')f.c.beforeSign=()=>{throw new Error('FINAL_CURRENT_SOURCE_CHANGED');};
    if(failure==='nonce')f.c.changeNonce=true;if(failure==='head')f.c.changeHead=true;
    await assert.rejects(f.runtime.dispatch(f.request),/CHANGED/);assert.equal(f.c.signs,0);assert.equal(f.c.broadcasts,0);
    assert.equal(f.runtime.mutationStatus.uncertain,false);
  }finally{await f.cleanup();}
});
for(const failure of ['sign','wire','raw-persist','provider-persist','broadcast'])test(failure+' uncertainty permanently prevents signing and rebroadcast',async()=>{
  const f=await fixture();try{
    if(failure==='sign')f.c.loseSign=true;
    if(failure==='wire')f.c.changedWire=syntheticWire({nonce:'1'});
    if(failure==='raw-persist')f.c.failPersist=true;
    if(failure==='provider-persist')f.c.onSigned=()=>{throw new Error('PROVIDER_SIGNATURE_FSYNC_LOST');};
    if(failure==='broadcast')f.c.loseBroadcast=true;
    await assert.rejects(f.runtime.dispatch(f.request));assert.equal(f.runtime.mutationStatus.uncertain,true);
    assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,failure==='broadcast'?1:0);
    const second={};scopes.set(second,scopes.get(f.request));
    await assert.rejects(f.runtime.dispatch(second),/UNCERTAIN_MUTATION/);
    await assert.rejects(f.runtime.advanceTo(initialTime+1),/UNCERTAIN_MUTATION/);
    await assert.rejects(f.runtime.send('no retry',{to:target,data:'0x12345678'}),/UNCERTAIN_MUTATION/);
    assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,failure==='broadcast'?1:0);
    if(['provider-persist','broadcast'].includes(failure))assert.equal((await f.runtime.signedTransaction(f.c.txHash)).nativeWire,f.c.wire);
  }finally{await f.cleanup();}
});

test('known canonical revert consumes its exact dispatch without disabling independent recovery work',async()=>{
  const f=await fixture();try{
    f.c.receipt.status='0x0';await assert.rejects(f.runtime.dispatch(f.request),/EVM_DISPATCH_REVERTED/);
    assert.equal(f.runtime.mutationStatus.uncertain,false);assert.equal(f.runtime.transactions[0].phase,'mined-reverted');
    assert.equal((await f.runtime.signedTransaction(f.c.txHash)).nativeWire,f.c.wire);
    await assert.rejects(f.runtime.dispatch(f.request),/ALREADY_USED_NO_RESEND/);
    assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,1);
    const recoveryBlock=await f.runtime.advanceTo(initialTime+2);assert.equal(recoveryBlock.number,'0x2');
    assert.deepEqual(recoveryBlock.transactions,[]);
  }finally{await f.cleanup();}
});

test('frozen final-guard exception identity is preserved as proof of no key use',async()=>{
  const f=await fixture();try{
    const original=Object.freeze(new Error('FROZEN_FINAL_GUARD_REJECTION'));f.c.beforeSign=()=>{throw original;};
    await assert.rejects(f.runtime.dispatch(f.request),error=>error===original);
    assert.equal(f.c.signs,0);assert.equal(f.c.broadcasts,0);assert.equal(f.runtime.mutationStatus.uncertain,false);
  }finally{await f.cleanup();}
});

test('lost original raw-broadcast reply reconciles once from exact canonical wire without resigning or sending', async () => {
  const f = await fixture({loseBroadcast:true});
  try {
    await assert.rejects(f.runtime.dispatch(f.request), /REPLY_LOST/);
    assert.equal(await f.runtime.reconcileSignedTransaction(f.c.txHash), null);
    assert.equal(f.runtime.mutationStatus.uncertain, true);
    await assert.rejects(f.runtime.reconcileSignedTransaction(hash('9')), /ORIGINAL_SIGNED_REQUIRED/);
    // Simulate only the original transaction becoming included. No actual node
    // or transaction is used in this explicit RPC fixture.
    f.c.head = {...f.c.genesis, number:'0x1', timestamp:hex(initialTime+1), hash:hash('3'), transactions:[f.c.txHash]};
    f.c.nonce = '0x1';
    const result = await f.runtime.reconcileSignedTransaction(f.c.txHash);
    assert.equal(result.originalUncertainty, 'original-signed-broadcast');
    assert.equal(f.runtime.mutationStatus.uncertain, false);
    assert.deepEqual(await f.runtime.reconcileSignedTransaction(f.c.txHash), result);
    assert.equal(f.c.signs, 1); assert.equal(f.c.broadcasts, 1);
    await assert.rejects(f.runtime.dispatch(f.request), /ALREADY_USED_NO_RESEND/);
    assert.equal((await f.runtime.advanceTo(initialTime+2)).number, '0x2');
  } finally { await f.cleanup(); }
});
test('signed-but-unacknowledged persistence is not a recoverable broadcast latch', async () => {
  const f = await fixture({onSigned(){ throw new Error('KEEPER_UNCERTAIN'); }});
  try {
    await assert.rejects(f.runtime.dispatch(f.request), /KEEPER_UNCERTAIN/);
    await assert.rejects(f.runtime.reconcileSignedTransaction(f.c.txHash), /UNRELATED_UNCERTAINTY/);
    assert.equal(f.runtime.mutationStatus.uncertain, true); assert.equal(f.c.broadcasts, 0);
  } finally { await f.cleanup(); }
});


test('private transport batches duplicate runtime reads while original direct methods and public capability stay fixed', async () => {
  const f = await fixture();
  try {
    f.c.batches = []; f.c.directMethods = [];
    let read = 0; f.c.codeOverride = () => ++read === 1 ? '0x6000' : '0x6001';
    const raw = await Promise.all([f.runtime.code(target, '0x0'), f.runtime.code(target, '0x0')]);
    assert.deepEqual(raw, ['0x6000', '0x6001']); assert.equal(f.c.batches.length, 1);
    assert.equal(f.c.batches[0].length, 2); assert.notEqual(f.c.batches[0][0].id, f.c.batches[0][1].id);
    assert.deepEqual(f.c.batches[0][0].params, f.c.batches[0][1].params);
    assert.throws(() => assert.equal(raw[1], raw[0], 'FLAT_STATE_CODE_CHANGED'), /FLAT_STATE_CODE_CHANGED/);
    delete f.c.codeOverride;
    await f.runtime.dispatch(f.request);
    const allowed = new Set(['eth_getCode', 'eth_call', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_chainId', 'eth_accounts']);
    assert.ok(f.c.batches.flat().every(item => allowed.has(item.method)));
    assert.ok(f.c.directMethods.includes('eth_signTransaction') && f.c.directMethods.includes('eth_sendRawTransaction'));
    assert.ok(f.c.directMethods.includes('evm_mine') && f.c.directMethods.includes('evm_setNextBlockTimestamp'));
    assert.ok(f.c.directMethods.every(method => !allowed.has(method)));
    assert.equal(f.c.events[f.c.events.indexOf('eth_signTransaction') - 1], 'beforeSign');
    for (const key of ['rpc', 'batch', 'readBatch', 'postBatch', 'endpoint']) assert.equal(Object.hasOwn(f.runtime, key), false);
    await assert.rejects(createOwnedLocalEvmV2({ endpoint: 'http://127.0.0.1:31338' }), /FIXED_CONSTRUCTOR/);
  } finally { await f.cleanup(); }
});

test('same-head contradictory prepared code and canonical block replies still reject through runtime guards', async () => {
  const f = await fixture();
  try {
    let reads = 0; f.c.codeOverride = () => ++reads === 1 ? code : '0x6001';
    await assert.rejects(f.runtime.dispatch(f.request), /EVM_PREPARED_CODE_CHANGED/);
    assert.equal(f.c.signs, 0); assert.equal(f.c.broadcasts, 0); assert.equal(f.runtime.mutationStatus.uncertain, false);
    f.c.changeHead = true; f.c.headReads = 0; f.c.head = { ...f.c.head, number: '0x1' };
    const header = { number: '0x1', hash: f.c.head.hash };
    const results = await Promise.allSettled([f.runtime.assertCanonical(header), f.runtime.assertCanonical(header)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.match(results[1].reason.message, /LOCAL_EVM_CANONICAL_BLOCK_CHANGED/);
    const batch = f.c.batches.at(-1); assert.equal(batch.length, 2); assert.deepEqual(batch[0].params, batch[1].params);
  } finally { await f.cleanup(); }
});

for (const mode of ['close', 'process-exit', 'process-error']) test('runtime ' + mode + ' cancels pending private reads without late success', async () => {
  const f = await fixture(); let release;
  try {
    f.c.holdBatch = new Promise(resolve => { release = resolve; });
    const pending = f.runtime.code(target, '0x0');
    const rejected = assert.rejects(pending, /CLOSED|PROCESS_NOT_RUNNING/);
    await new Promise(resolve => setImmediate(resolve));
    if (mode === 'close') await f.runtime.close();
    else if (mode === 'process-exit') { f.c.child.exitCode = 1; f.c.child.emit('exit', 1, null); }
    else f.c.child.emit('error', new Error('SYNTHETIC_PROCESS_ERROR'));
    await rejected; release(); await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(f.runtime.code(target), /PROCESS_NOT_RUNNING/);
    assert.equal(f.c.signs, 0); assert.equal(f.c.broadcasts, 0);
  } finally { release?.(); await f.cleanup(); }
});
