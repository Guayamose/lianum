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
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
mock.module(new URL('../../../../../omnichain-product/src/private-asset-runtime.mjs', import.meta.url).href, { exports: {
  decodePrivateRevert() { throw new Error('SYNTHETIC_REVERT_TRACE_NOT_USED'); },
} });
const realBrands = new WeakSet(), scopes = new WeakMap();
const nativeClaimScopes = new WeakMap(), wrappedClaimScopes = new WeakMap();
for (const [file, registry] of [['../../../../src/claims/controller/controller.mjs',nativeClaimScopes],['../../../../src/claims/wrapped/controller/wrapped-controller-v1.mjs',wrappedClaimScopes]]) {
  mock.module(new URL(file, import.meta.url).href, { exports: {
    isOwnedClaimEvmDispatchRequest: request => registry.has(request),
    assertOwnedClaimEvmDispatchRequest(request, runtime) {const row=registry.get(request);assert.ok(row && row.runtime===runtime,'TEST_ORIGINAL_V4_SCOPE');return row.callbacks;}
  } });
}
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
const target = '0x' + '99'.repeat(20), code = '0x6000', initialTime = 1900000210;
mock.module(new URL('../../../../../omnichain-product/src/chains/runtime-harness.mjs', import.meta.url).href, { exports: {
  async pinnedBinary(...pin) { assert.equal(pin[0], 'foundry-v1.8.4/anvil'); return '/synthetic/pinned-anvil'; },
  async scratchDirectory() { control.directory = await mkdtemp(join(tmpdir(), 'evm-v2-synthetic-')); return control.directory; },
  async removeOwnScratch(path) { assert.equal(path, control.directory); },
  async unusedLoopbackPort() { return 31338; }, async sleep() {},
  startOwnProcess(binary, args) {
    assert.equal(binary, '/synthetic/pinned-anvil');
    assert.deepEqual(args, ['--host','127.0.0.1','--port','31338','--chain-id','31337','--hardfork','cancun',
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


// The full actual owned EVM factory/dispatch executes with inert process/RPC
// ports. Request/key issuers here are explicitly modeled; actual wrapped
// controller identity/minting is tested in wrapped-key-authority-v4.test.mjs.
for (const issuer of ['native', 'wrapped']) for (const fault of ['none','undefined','copy','replay','after-await-expiry','terminal-authority-expiry','terminal-native-expiry','changed-preparation'])
test(`actual EVM factory ${issuer} V4 consumer ${fault}`, async t => {
  const clock={now:0}, mocked=t.mock.method(performance,'now',()=>clock.now),f=await fixture();
  const registry=issuer==='wrapped'?wrappedClaimScopes:nativeClaimScopes,row=scopes.get(f.request),tokens=new WeakMap();
  const start=clock.now;let originalToken, consumed=0, beforeSignCalls=0;
  row.callbacks.beforeSign=async prepared=>{
    beforeSignCalls++;f.c.events.push('beforeSign-V4');f.c.prepared=prepared;
    assert.equal(f.runtime.ingressSendState.busy,true,'ACTUAL_RECEIVER_DISPATCH_CRITICAL_SECTION');assert.equal(f.runtime.ingressSendState.uncertain,false);
    originalToken=Object.freeze({profile:'EXPLICIT_SYNTHETIC_KEY_TOKEN_V4'});tokens.set(originalToken,prepared);
    await Promise.resolve();
    if(fault==='after-await-expiry')clock.now=30000;
    if(fault==='changed-preparation'){f.c.changeNonce=true;f.c.nonceReads=2;}
    return fault==='undefined'?undefined:fault==='copy'?{...originalToken}:originalToken;
  };
  row.callbacks.consumeBeforeKey=(token,prepared)=>{
    f.c.events.push('consume-V4');assert.equal(tokens.get(token),prepared,'TEST_PRIVATE_V4_KEY_REQUIRED');tokens.delete(token);consumed++;assert.equal(f.runtime.ingressSendState.busy,true,'ACTUAL_RECEIVER_DISPATCH_CRITICAL_SECTION');
    assert.ok(clock.now-start<30000,'TEST_ORIGINAL_AUDIT_TOO_OLD');
    if(fault==='terminal-authority-expiry')clock.now=start+30000;
    if(fault==='terminal-native-expiry')clock.now=30000;
    if(fault==='replay')row.callbacks.consumeBeforeKey(token,prepared);
    return fault==='terminal-native-expiry'?clock.now:start;
  };
  registry.set(f.request,row);
  try {
    if(fault==='none') {
      await f.runtime.dispatch(f.request);assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,1);
      const at=f.c.events.indexOf('consume-V4');assert.equal(f.c.events[at+1],'eth_signTransaction');
      assert.equal(consumed,1);assert.equal(beforeSignCalls,1);
      assert.throws(()=>row.callbacks.consumeBeforeKey(originalToken,f.c.prepared),/PRIVATE_V4_KEY_REQUIRED/);
      await assert.rejects(f.runtime.dispatch(f.request),/ALREADY_USED/);assert.equal(f.c.signs,1);
    } else {
      await assert.rejects(f.runtime.dispatch(f.request),/PRIVATE_V4_KEY_REQUIRED|TOO_OLD|NONCE_CHANGED/);
      assert.equal(f.c.signs,0);assert.equal(f.c.broadcasts,0);
      if(['replay','terminal-authority-expiry','terminal-native-expiry'].includes(fault))
        assert.throws(()=>row.callbacks.consumeBeforeKey(originalToken,f.c.prepared),/PRIVATE_V4_KEY_REQUIRED/);
    }
  } finally {mocked.mock.restore();await f.cleanup();}
});
test('ordinary EVM dispatch retains original assertion-only scope without V4 fields',async()=>{
  const f=await fixture();try{await f.runtime.dispatch(f.request);assert.equal(f.c.signs,1);assert.equal(f.c.broadcasts,1);
    assert.equal(Object.hasOwn(scopes.get(f.request).callbacks,'consumeBeforeKey'),false);
  }finally{await f.cleanup();}
});
