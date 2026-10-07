/** Execute the real BTC transfer and preparation-check closures with inert
 * lexical RPC/persistence/codec/controller ports. No native process, key,
 * signature, UTXO, funding, consensus or proof is exercised here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createOwnedCustodyReservationReadWindow } from './owned-native-custody.mjs';
const source = readFileSync(new URL('./owned-bitcoin-runtime.mjs', import.meta.url), 'utf8');
const excerpt = (from, until) => { const a = source.indexOf(from), b = source.indexOf(until, a); assert.ok(a >= 0 && b > a); return source.slice(a, b); };
const transferSource = excerpt('      const transfer = async (', '      const recordFor = ');
const preparationSource = excerpt('      async function assertPrepared(', '      function bindNativeAsset(');
const exactOptions = vm.runInThisContext('(need => {' + excerpt('function exactOptions(', 'function uint(') + '; return exactOptions; })')((x, m) => assert.ok(x, m));
const immutable = value => { if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); } return value; };
const clone = structuredClone, id = 'ab'.repeat(32), hash = 'cd'.repeat(32), key = 'ef'.repeat(32), originalWire = 'native-wire-fixture';
function fixture(routeName = 'redeem', fault = {}) {
  const events = [], records = new Map(), allRecords = new Map(), token = Object.freeze({}), runtime = Object.freeze({});
  const route = { name: routeName, recipientIndex: 0, sourceRole: 'escrow', source: 'source', sourceScript: 'script',
    sourceWallet: 'source-wallet', recipient: 'recipient', recipientScript: 'recipient-script', recipientWallet: 'recipient-wallet',
    changeAddress: 'change', changeScript: 'change-script' };
  const custody = routeName !== null, reservationReads = createOwnedCustodyReservationReadWindow();
  const keyToken=Object.freeze({}); let keyPrepared, keyConsumed=false, now=0;
  let api, signed = 0, sends = 0, unlocks = 0, healthReads = 0, authorizedPrepared, authorizedSigned, permission = false, used = false;
  const intent = { sourceTxid: '11'.repeat(32), sourceVout: '0', sourceScript: 'script', sourceSatoshi: '20000000',
    recipientScript: 'recipient-script', amountSatoshi: '12345', changeScript: 'change-script', feeSatoshi: '5000', wireKeyCommitment: key };
  const env = { close() {}, performance:{now:()=>now}, originalKeyControllerV4:{consumeNativeClaimOriginalKeyAuthorityV4(value,purpose,_close,genesis,routeValue,prepared){
      assert.equal(value,keyToken,'KEY_TOKEN_REQUIRED'); assert.equal(purpose,'payout'); assert.equal(genesis,'genesis');assert.equal(routeValue,routeName);assert.equal(prepared,keyPrepared);assert.equal(keyConsumed,false);keyConsumed=true;
      if(fault.keyConsume)throw Error('KEY_AUTHORITY_REFUSED');events.push('key-consume');return 0;
    }}, immutable, clone, exactOptions, need: (x,m) => assert.ok(x,m), custody, runtime, records, allRecords, reservationReads,
    sats: BigInt, hex32: x => x, index: x => x, graphRoute: () => route, BITCOIN_REGTEST_GENESIS: 'genesis',
    BITCOIN_TRANSFER_LIMITS: { maximumFeeSatoshi: '10000', minimumConfirmations: 6 }, roles: {}, cwd: 'inert',
    bitcoinSatoshiFromAmount: String, bitcoinAmountFromSatoshi: String,
    encodeWireCommitment: () => Buffer.from([0]), join: (...parts) => parts.join('/'),
    live() { events.push('live'); if (fault.dead && permission) throw Error('PROCESS_DEAD'); },
    async health() { healthReads++; events.push('health'); await fault.health?.(healthReads); if(fault.nativeAge&&healthReads>=4&&!signed)now+=15000; return { tip: 'tip', height: 55 }; },
    async addressInfo(address) { return { scriptPubKey: address === 'recipient' ? 'recipient-script' : address === 'source' ? 'script' : 'change-script' }; },
    decodeBitcoinTransaction() { return { txid: intent.sourceTxid, vin: [{ txid: '22'.repeat(32), vout: 0 }], vout: [{ script: 'script', amountSatoshi: '20000000' }] }; },
    validateBitcoinTransferWire(wire, expected, options) { assert.deepEqual(expected, intent);if(fault.codecAge&&keyPrepared&&!signed)now+=30000; return { txid: id, wtxid: id,
      unsignedTransaction: 'unsigned', transactionSHA256: hash }; },
    assertOwnedCustodyIntent() {},
    async open(path) { events.push('open:' + path); return { async writeFile() { events.push('write'); },
      async sync() { events.push('fsync'); }, async close() { events.push('close'); } }; },
    async rpc(method, params) {
      events.push(method);
      if (method === 'listunspent') return [{ txid: intent.sourceTxid, vout: 0, scriptPubKey: 'script', amount: '20000000', confirmations: 6, spendable: true, solvable: true, safe: true }];
      if (method === 'getrawtransaction') return { txid: intent.sourceTxid, hex: 'source-wire' };
      if (method === 'createrawtransaction') return 'raw';
      if (method === 'fundrawtransaction') return { hex: 'unsigned', fee: '5000', changepos: 1 };
      if (method === 'signrawtransactionwithwallet') { signed++; return { complete: true, hex: originalWire }; }
      if (method === 'gettxout') return { bestblock: 'tip', scriptPubKey: { hex: 'script' }, value: '20000000', confirmations: 6 };
      if (method === 'testmempoolaccept') { await fault.mempool?.(); return [{ txid: id, allowed: !fault.rejectMempool }]; }
      if (method === 'sendrawtransaction') { sends++; assert.deepEqual(params, [originalWire]);
        if (fault.sendFailure) throw Error('INERT_SEND_UNAVAILABLE'); return id; }
      if (method === 'lockunspent') { unlocks++; return true; }
      assert.fail(method);
    },
    assertNativeClaimBitcoinPayoutSendToken(value, owned, actualRoute) { events.push('token-check');
      assert.equal(value, token, 'PRIVATE_TOKEN'); assert.equal(owned, runtime); assert.equal(actualRoute, routeName); },
    async authorizeNativeClaimBitcoinPayoutSend(value, prepared, payload) {
      events.push('authorize-start'); assert.equal(value, token); assert.equal(reservationReads.active, true);
      assert.equal(api.state().payoutReadWindow, true); assert.equal(api.state().preSignReadWindow, false);
      assert.equal(prepared, api.state().activePrepared); assert.ok(Object.isFrozen(prepared));
      assert.deepEqual(payload, { nativeWire: originalWire });
      authorizedPrepared = prepared; authorizedSigned = payload;
      await api.assertPrepared(clone(prepared)); await fault.authorization?.({ events, prepared, payload, api });
      permission = true; events.push('authorize-end');
    },
    authorizeNativeClaimBitcoinPayoutLatch(value,prepared,payload){assert.equal(value,token);assert.ok(permission);assert.equal(prepared,authorizedPrepared);assert.equal(payload,authorizedSigned);assert.equal(records.get(id).phase,'SIGNED_NOT_BROADCAST');return 0;},
    readOwnedBitcoinRuntimeAuditState(){env.live();return clone({transfers:[...records.values()],custodyTransfers:[...records.values()],graphTransfers:[]});},
    consumeNativeClaimBitcoinPayoutSend(value, prepared, payload) {
      events.push('consume'); assert.equal(value, token); assert.equal(prepared, authorizedPrepared); assert.equal(payload, authorizedSigned);
      assert.ok(permission && !used); used = true;
      assert.equal(records.get(id).phase, 'BROADCAST_UNKNOWN'); assert.equal(records.get(id).broadcastAttempts, 1);
      assert.equal(reservationReads.active, false); assert.equal(api.state().payoutReadWindow, false);
      fault.consume?.({ events, api, record: records.get(id) });
      queueMicrotask(() => events.push('after-consume-microtask'));return 0;
    },
  };
  env.bitcoinPayoutController = Object.fromEntries(['assertNativeClaimBitcoinPayoutSendToken', 'authorizeNativeClaimBitcoinPayoutSend', 'authorizeNativeClaimBitcoinPayoutLatch', 'consumeNativeClaimBitcoinPayoutSend'].map(name => [name, env[name]]));
  api = vm.runInThisContext('(env => { const {' + Object.keys(env).join(',') + '} = env;\n' +
    'const preparedObservations=new WeakMap();let readGeneration=0n,mutationGeneration=0n,activeNativeReadOperations=0;let busy=false, observationBusy=false, inventoryBusy=false, preSignReadWindow=false, payoutReadWindow=false, activePrepared=null, activeRoute=null, signingUnresolved=false;\n' + transferSource + preparationSource +
    '\nreturn { transfer, assertPrepared, state:()=>({busy,activePrepared,activeRoute,preSignReadWindow,payoutReadWindow}) }; })')(env);
  const callbacks = () => ({ wireKeyCommitment: key, beforeSign: async value => { events.push('beforeSign');
      if(custody&&routeName!=='deposit')assert.equal(value,api.state().activePrepared);else assert.notEqual(value,api.state().activePrepared);
      await api.assertPrepared(value);keyPrepared=api.state().activePrepared;return custody&&routeName!=='deposit'&&!fault.undefinedKey?keyToken:undefined; },
    onSigned: async () => { events.push('onSigned'); await fault.onSigned?.(); },
    ...(custody && routeName !== 'deposit' ? { payoutSendToken: token } : {}) });
  return { api, route, events, records, token, callbacks, start: opts => api.transfer('12345', opts ?? callbacks(), route),
    counters: () => ({ signed, sends, unlocks }) };
}
function released(f) { assert.deepEqual(f.api.state(), { busy:false, activePrepared:null, activeRoute:null, preSignReadWindow:false, payoutReadWindow:false }); }
for (const route of ['redeem','refund']) {
  test(`${route}: full fixed gate follows native health/mempool and consumes after its read window`, async () => {
    const f = fixture(route); await f.start(); assert.deepEqual(f.counters(), {signed:1,sends:1,unlocks:0});
    const sequence = ['onSigned','testmempoolaccept','authorize-start','authorize-end','consume','sendrawtransaction','after-consume-microtask'];
    for (let i=1;i<sequence.length;i++) assert.ok(f.events.indexOf(sequence[i-1]) < f.events.indexOf(sequence[i]), sequence.join(' < '));
    assert.deepEqual(f.events.slice(f.events.indexOf('consume'), f.events.indexOf('sendrawtransaction')+1), ['consume','live','sendrawtransaction']);
    await assert.rejects(f.start(), /PRIOR_TRANSFER_UNRESOLVED/); assert.equal(f.counters().sends,1); released(f);
  });
  for (const point of ['mempool','authorization','consume','process','send']) test(`${route}: ${point} failure retains original only, never unlocks/resigns/resends`, async () => {
    const fault = point==='mempool' ? {rejectMempool:true} : point==='authorization' ? {authorization:async()=>{throw Error('FINAL_HEAD_OR_KEEPER');}}
      : point==='consume' ? {consume:()=>{throw Error('SYNC_HEAD_OR_KEEPER');}} : point==='process' ? {dead:true} : {sendFailure:true};
    const f=fixture(route,fault); await assert.rejects(f.start()); const retained=clone(f.records.get(id));
    assert.equal(retained.rawTransaction,originalWire); assert.equal(retained.transactionSHA256,hash);
    assert.equal(retained.broadcastAttempts,['consume','send'].includes(point)?1:0);
    assert.equal(retained.phase,retained.broadcastAttempts===1?'BROADCAST_UNKNOWN':'SIGNED_NOT_BROADCAST');
    assert.equal(f.counters().sends,point==='send'?1:0); assert.equal(f.counters().unlocks,0);
    const counts=f.counters(); await assert.rejects(f.start(),/PRIOR_TRANSFER_UNRESOLVED|PROCESS_DEAD/); assert.deepEqual(f.counters(),counts); released(f);
  });
  test(`${route}: spoofed or omitted token fails before signing; callbacks cannot substitute`, async()=>{
    const f=fixture(route), opts=f.callbacks(); opts.payoutSendToken={}; await assert.rejects(f.start(opts),/PRIVATE_TOKEN/);
    delete opts.payoutSendToken; await assert.rejects(f.start(opts),/INVALID_OPTIONS/);
    opts.beforeSend=()=>{}; await assert.rejects(f.start(opts),/INVALID_OPTIONS/); assert.equal(f.counters().signed,0);
  });
  test(`${route}: original native assertion cannot escape the closed final read window`, async()=>{
    const f=fixture(route); let captured;
    const g=fixture(route,{authorization:async({prepared})=>{captured=prepared;}}); await g.start();
    await assert.rejects(g.api.assertPrepared(captured),/PRE_SIGN_WINDOW_REQUIRED/); released(g); released(f);
  });
}
for (const route of ['deposit',null]) test(`${route??'graph'}: original callback/preflight/send flow remains free of payout token authority`,async()=>{
  const f=fixture(route); await f.start(); assert.deepEqual(f.counters(),{signed:1,sends:1,unlocks:0});
  assert.ok(!f.events.includes('token-check')&&!f.events.includes('authorize-start')&&!f.events.includes('consume')); released(f);
  const g=fixture(route), options=g.callbacks(); options.payoutSendToken={}; await assert.rejects(g.start(options),/INVALID_OPTIONS/);
  assert.equal(g.counters().signed,0);
});

test('source token invocation is fixed; latch/send do not contain another awaitable preflight',()=>{
  const gate=excerpt('          if (payout) {\n            // Fixed, branded', '        } catch (error) {');
  const tail=gate.slice(gate.indexOf("record.phase = 'BROADCAST_UNKNOWN'"));
  assert.equal((tail.match(/await /g)??[]).length,1); assert.ok(tail.includes("await rpc('sendrawtransaction'"));
  assert.ok(!source.includes('resumeReservedPayout'));
});

for(const fault of ['undefinedKey','keyConsume','nativeAge','codecAge'])test(`V4 BTC ${fault} refuses before signer and unlocks exact unsigned outpoint`,async()=>{
  const f=fixture('redeem',{[fault]:true});await assert.rejects(f.start(),/KEY_|TOO_OLD/);assert.deepEqual(f.counters(),{signed:0,sends:0,unlocks:1});assert.equal(f.records.size,0);released(f);
});
