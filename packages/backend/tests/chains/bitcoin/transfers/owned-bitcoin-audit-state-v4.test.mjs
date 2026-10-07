/** Host-only combined-capability regression tests. The original runtime module
 * owns its real WeakSet brands; only subprocess/RPC transport and owned process
 * lifecycle are replaced. No native process, consensus claim, compiler or prover.
 * Run with: node --experimental-test-module-mocks --test <this file> */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH } from 'node:crypto';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { encodeBitcoinBinding } from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { auditClaimNativeInventory } from '../../../../src/claims/operations/backing-audit.mjs';
import { nativeClaimEndpointCommitment } from '../../../../src/claims/protocol/framing.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash160 = value => createHash('ripemd160').update(createHash('sha256').update(value).digest()).digest('hex');
const asset = sha('combined host BTC asset'), copy = value => structuredClone(value);
let control;
const actualOpen = fs.open;
mock.module('node:fs/promises', { exports: { ...fs, async open(path, ...args) {
  const handle = await actualOpen(path, ...args), signed = String(path).includes('/signed-');
  if (signed) control.events.push('persist-open');
  return { async writeFile(...values) { await handle.writeFile(...values); },
    async sync() { if (signed && control.failPersist) throw new Error('HOST_PERSISTENCE_FAILED');
      await handle.sync(); control.events.push(signed ? 'persist-sync' : 'directory-sync'); },
    close: () => handle.close() };
} } });
const transport = () => { throw new Error('HOST_PROMISIFIED_RPC_ONLY'); };
transport[promisify.custom] = async (binary, args, options) => {
  assert.equal(binary, '/host-only/bitcoin-cli'); assert.equal(options.cwd, join(control.directory, 'bitcoin'));
  const offset = args.findIndex(value => !value.startsWith('-'));
  const method = args[offset], values = args.slice(offset + 1).map(value => {
    try { return JSON.parse(value); } catch { return value; }
  });
  const wallet = args.find(value => value.startsWith('-rpcwallet='))?.slice(11);
  control.events.push(method); control.calls.push({ method, wallet, values: copy(values) });
  await control.beforeRPC?.(method, values, wallet);
  const value = rpc(method, values, wallet); control.afterRPC?.(method, value);
  return { stdout: JSON.stringify(value), stderr: '' };
};
mock.module('node:child_process', { exports: { execFile: transport,spawn(){throw Error('HOST_NATIVE_SPAWN_DISABLED');} } });
// Exercise the actual fixed inventory helper through the actual runtime factory.
// Only node:http's wire transport is replaced; no socket or daemon is started.
mock.module('node:http', { exports: { request(options, callback) {
  assert.equal(options.protocol, 'http:'); assert.equal(options.hostname, '127.0.0.1');
  assert.equal(options.port, 31339); assert.equal(options.path, '/'); assert.equal(options.method, 'POST');
  assert.equal(options.agent, false); assert.equal(options.headers.Connection, 'close');
  assert.ok(/^synthetic-generic:[0-9a-f]{64}$/.test(options.auth), 'HOST_FIXED_EPHEMERAL_AUTH');
  const c = control, req = new EventEmitter(); let destroyed = false, res;
  req.destroy = () => { if (!destroyed) { destroyed = true; c.httpActive--; queueMicrotask(() => req.emit('close')); } };
  req.end = body => {
    c.httpActive++; c.httpPeak = Math.max(c.httpPeak, c.httpActive);
    const value = JSON.parse(body);
    assert.equal(value.jsonrpc, '2.0'); assert.equal(value.method, 'gettxout');
    assert.equal(value.params.length, 3); assert.equal(value.params[2], true);
    c.httpCalls.push(copy(value)); c.events.push('http:gettxout');
    void (async () => {
      const config = await fs.readFile(join(c.directory, 'bitcoin', 'bitcoin.conf'), 'utf8');
      assert.ok(sha(options.auth) === sha('synthetic-generic:' + /^rpcpassword=(.+)$/m.exec(config)[1]), 'HOST_OWNED_CONFIG_AUTH_MATCH');
      await c.beforeHTTP?.(value);
      await c.beforeRPC?.('gettxout', value.params);
      if (destroyed) return;
      res = new EventEmitter(); res.statusCode = 200; res.headers = {}; res.complete = true;
      res.destroy = () => req.destroy(); callback(res);
      if (destroyed) return;
      const result = rpc('gettxout', value.params);
      const envelope = c.httpReply ? c.httpReply(value, result) : { jsonrpc: '2.0', id: value.id, result };
      res.emit('data', Buffer.from(JSON.stringify(envelope))); res.emit('end'); res.emit('close'); req.destroy();
    })().catch(() => { if (!destroyed) { req.emit('error', new Error('HOST_PRIVATE_TRANSPORT_DETAILS')); req.destroy(); } });
  };
  return req;
} } });

mock.module(new URL('../../../../../omnichain-product/src/chains/runtime-harness.mjs', import.meta.url).href, { exports: {
  projectRoot:'/host-only-project',async ownedRuntimeRpc(){throw Error('HOST_SOLANA_RPC_DISABLED');},
  async pinnedBinary(name) { return name.endsWith('/bitcoind') ? '/host-only/bitcoind' : '/host-only/bitcoin-cli'; },
  async scratchDirectory() { control.directory = await fs.mkdtemp(join(tmpdir(), 'combined-btc-host-')); return control.directory; },
  async removeOwnScratch(path) { assert.equal(path, control.directory); control.removals++; /* Preserve host-only fixture data. */ },
  async unusedLoopbackPort() { return 31339; }, async sleep() {},
  isolatedRuntimeEnvironment(path) { return { HOST_ONLY_RUNTIME: path }; },
  startOwnProcess(binary, args, directory) {
    assert.equal(binary, '/host-only/bitcoind'); assert.equal(directory, join(control.directory, 'bitcoin'));
    assert.ok(args.includes('-regtest')); assert.ok(args.includes('-txindex=1')); control.starts++;
    const child = { pid: 12001, exitCode: null, signalCode: null };
    control.handle = { child, assertAlive() { assert.equal(child.exitCode, null, 'HOST_PROCESS_EXITED'); } };
    return control.handle;
  },
  async stopOwnProcess(handle) { assert.equal(handle, control.handle); assert.equal(control.httpActive, 0); control.stops++; handle.child.exitCode = 0;
    return { stopped: true, forced: false }; },
} });
mock.module(new URL('../native-claims/payout-controller-dispatch-v1.mjs',import.meta.url).href,{exports:{}});
mock.module(new URL('../native-claims/controller.mjs',import.meta.url).href,{exports:{consumeNativeClaimOriginalKeyAuthorityV4(){throw Error('HOST_PAYOUT_KEYS_DISABLED');}}});
const { createOwnedCombinedBitcoinRuntime, createOwnedBitcoinCustodyRuntime, createOwnedFlatBitcoinRuntime,
  assertOwnedBitcoinRuntime, readOwnedBitcoinRuntimeAuditState, BITCOIN_REGTEST_GENESIS, BITCOIN_CUSTODY_PROFILE, BITCOIN_OWNED_PROFILE,
  BITCOIN_TRANSFER_LIMITS, decodeBitcoinTransaction, bitcoinSatoshiFromAmount, bitcoinAmountFromSatoshi }
  = await import('../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs');

const little = (n, bytes) => { const value = Buffer.alloc(bytes); if (bytes === 8) value.writeBigUInt64LE(BigInt(n)); else value.writeUInt32LE(n); return value; };
function coinbaseWire(height, endpoint, amount) {
  return Buffer.concat([little(2, 4), Buffer.from([1]), Buffer.alloc(32), little(0xffffffff, 4),
    Buffer.from([4]), little(height, 4), little(0xffffffff, 4), Buffer.from([1]), little(amount, 8),
    Buffer.from([22]), Buffer.from(endpoint, 'hex'), little(0, 4)]).toString('hex');
}
function address(wallet, change = false) {
  const c = control;
  if (c.aliasGraph && wallet === 'combined-graph-solver' && !change) {
    const existing = [...c.addresses.values()].find(value => value.wallet === 'generic-source');
    c.wallets.get(wallet).add(existing.address); return existing.address;
  }
  const key = createECDH('secp256k1'); key.setPrivateKey(Buffer.from((++c.key).toString(16).padStart(64, '0'), 'hex'));
  const publicKey = key.getPublicKey('hex', 'compressed'), endpoint = '0014' + hash160(Buffer.from(publicKey, 'hex'));
  const value = { address: 'host-address-' + c.key, endpoint, publicKey, wallet };
  c.addresses.set(value.address, value); c.wallets.get(wallet).add(value.address); return value.address;
}
function transaction(hex, wallet = null, fee = null) {
  const decoded = decodeBitcoinTransaction(hex), tx = { ...decoded, hex, wallet, fee, height: null };
  control.txs.set(tx.txid, tx); return tx;
}
function installOutputs(tx, coinbase) {
  for (const out of tx.vout) {
    const owner = [...control.addresses.values()].find(value => value.endpoint === out.script);
    if (owner) control.coins.set(tx.txid + ':' + out.n, { txid: tx.txid, vout: out.n, amount: out.amountSatoshi,
      script: out.script, address: owner.address, wallet: owner.wallet, height: tx.height, coinbase,
      locked: false, spent: false, pendingSpent: false });
  }
}
const confirmations = row => control.height - row.height + 1;
function mine(count, recipient) {
  const c = control, hashes = [];
  for (let i = 0; i < count; i++) {
    const height = ++c.height, id = sha('host block ' + height), amount = 5_000_000_000n >> BigInt(Math.floor(height / 150));
    const coinbase = transaction(coinbaseWire(height, c.addresses.get(recipient).endpoint, amount));
    coinbase.height = height; coinbase.blockhash = id; installOutputs(coinbase, true);
    const included = [...c.pending];
    for (const nativeId of included) {
      const tx = c.txs.get(nativeId); tx.height = height; tx.blockhash = id;
      for (const input of tx.vin) c.coins.get(input.txid + ':' + input.vout).spent = true;
      installOutputs(tx, false); c.pending.delete(nativeId);
    }
    c.blocks.set(id, { hash: id, height, tx: [coinbase.txid, ...included] }); c.tip = id; hashes.push(id);
  }
  return hashes;
}
function rpc(method, values, wallet) {
  const c = control;
  switch (method) {
    case 'getblockchaininfo': return { chain: 'regtest', blocks: c.height, bestblockhash: c.tip };
    case 'getnetworkinfo': return { networkactive: false, connections: 0 };
    case 'getblockhash': return values[0] === 0 ? BITCOIN_REGTEST_GENESIS : [...c.blocks.values()].find(row => row.height === values[0]).hash;
    case 'getbestblockhash': return c.tip;
    case 'createwallet': assert.ok(!c.wallets.has(values[0])); c.wallets.set(values[0], new Set()); return { name: values[0] };
    case 'getnewaddress': return address(wallet);
    case 'getrawchangeaddress': return address(wallet, true);
    case 'getaddressinfo': {
      const info = c.addresses.get(values[0]);
      return { address: values[0], ismine: c.wallets.get(wallet)?.has(values[0]) === true, scriptPubKey: info?.endpoint };
    }
    case 'generatetoaddress': return mine(...values);
    case 'getblock': {
      const block = c.blocks.get(values[0]);
      return { ...block, confirmations: confirmations(block), tx: values[1] === 2 ? block.tx.map(id => {
        const tx = c.txs.get(id); return { txid: id, vout: tx.vout.map(out => ({ n: out.n,
          value: Number(bitcoinAmountFromSatoshi(out.amountSatoshi)), scriptPubKey: { hex: out.script } })) };
      }) : block.tx };
    }
    case 'getblockheader': { const block = c.blocks.get(values[0]); return { ...block, confirmations: confirmations(block) }; }
    case 'gettxout': {
      const coin = c.coins.get(values[0] + ':' + values[1]);
      if (!coin || coin.spent || coin.pendingSpent) return null;
      return { bestblock: c.tip, coinbase: coin.coinbase, confirmations: c.immatureGraph && coin.wallet === 'combined-graph-solver' ? 100 : confirmations(coin),
        scriptPubKey: { hex: coin.script }, value: Number(bitcoinAmountFromSatoshi(coin.amount)) };
    }
    case 'listunspent': {
      const rows = [...c.coins.values()].filter(coin => coin.wallet === wallet && values[2].includes(coin.address)
        && !coin.spent && !coin.pendingSpent && !coin.locked && confirmations(coin) >= values[0]
        && (!coin.coinbase || confirmations(coin) >= 101));
      if (c.substituteCoin && wallet === 'combined-graph-solver') rows.splice(0, rows.length,
        [...c.coins.values()].find(coin => coin.wallet === 'generic-recipient-0'));
      return rows.map(coin => ({ txid: coin.txid, vout: coin.vout, amount: Number(bitcoinAmountFromSatoshi(coin.amount)),
        scriptPubKey: coin.script, confirmations: confirmations(coin), spendable: true, solvable: true, safe: true }));
    }
    case 'createrawtransaction': { const raw = sha('draft ' + ++c.drafts.sizeCounter); c.drafts.set(raw, copy(values)); return raw; }
    case 'fundrawtransaction': {
      const draft = c.drafts.get(values[0]), opts = values[1], coin = c.coins.get(draft[0][0].txid + ':' + draft[0][0].vout);
      assert.equal(coin.wallet, wallet); assert.equal(opts.add_inputs, false); assert.equal(opts.lockUnspents, true);
      const [recipient, amount] = Object.entries(draft[1][0])[0];
      const intent = { sourceTxid: coin.txid, sourceVout: String(coin.vout), sourceScript: coin.script,
        sourceSatoshi: coin.amount, recipientScript: c.addresses.get(recipient).endpoint,
        amountSatoshi: bitcoinSatoshiFromAmount(amount), changeScript: c.addresses.get(opts.changeAddress).endpoint,
        feeSatoshi: '200', wireKeyCommitment: Buffer.from(draft[1][1].data, 'hex').toString().slice(6) };
      const hex = encodeBitcoinBinding(intent); c.funded.set(hex, { intent, wallet }); coin.locked = true;
      return { hex, changepos: 1, fee: 0.000002 };
    }
    case 'signrawtransactionwithwallet': {
      c.signs++; if (c.loseSign) throw new Error('HOST_SIGN_REPLY_LOST');
      const funded = c.funded.get(values[0]); assert.equal(funded.wallet, wallet);
      const source = [...c.addresses.values()].find(info => info.endpoint === funded.intent.sourceScript);
      const publicKey = c.foreignSigner ? [...c.addresses.values()].find(info => info.wallet === 'generic-recipient-0').publicKey : source.publicKey;
      const raw = values[0], hex = raw.slice(0, 8) + '0001' + raw.slice(8, -8)
        + '020930060201010201010121' + publicKey + raw.slice(-8);
      transaction(hex, wallet, -0.000002); return { hex, complete: true };
    }
    case 'testmempoolaccept': return [{ txid: decodeBitcoinTransaction(values[0][0]).txid, allowed: true }];
    case 'sendrawtransaction': {
      c.sends++; const id = decodeBitcoinTransaction(values[0]).txid, tx = c.txs.get(id);
      for (const input of tx.vin) c.coins.get(input.txid + ':' + input.vout).pendingSpent = true;
      c.pending.add(id); if (c.loseBroadcast) throw new Error('HOST_SEND_REPLY_LOST'); return id;
    }
    case 'getrawtransaction': {
      const tx = c.txs.get(values[0]); assert.ok(tx, 'HOST_UNKNOWN_TRANSACTION');
      return { txid: tx.txid, hex: tx.hex, ...(tx.blockhash ? { blockhash: tx.blockhash, confirmations: confirmations(tx) } : {}) };
    }
    case 'gettransaction': {
      const tx = c.txs.get(values[0]); assert.equal(tx.wallet, wallet); return { txid: tx.txid, hex: tx.hex, fee: tx.fee };
    }
    case 'getmempoolentry': assert.ok(c.pending.has(values[0])); return {};
    case 'listlockunspent': return [...c.coins.values()].filter(coin => coin.wallet === wallet && coin.locked && !coin.spent)
      .map(({ txid, vout }) => ({ txid, vout }));
    case 'lockunspent': for (const point of values[1]) c.coins.get(point.txid + ':' + point.vout).locked = !values[0]; return true;
    case 'scantxoutset': {
      c.scanned = copy(values[1]); const scripts = values[1].map(value => value.slice(4, -1));
      return { success: true, bestblock: c.tip, height: c.height,
        unspents: [...c.coins.values()].filter(coin => !coin.spent && scripts.includes(coin.script)).map(coin => ({
          txid: coin.txid, vout: coin.vout, scriptPubKey: coin.script, amount: Number(bitcoinAmountFromSatoshi(coin.amount)),
          height: coin.height, coinbase: coin.coinbase })) };
    }
    default: throw new Error('HOST_UNEXPECTED_RPC_' + method);
  }
}
async function fixture(options = {}, factory = createOwnedCombinedBitcoinRuntime) {
  control = { height: 0, tip: BITCOIN_REGTEST_GENESIS, key: 0, wallets: new Map(), addresses: new Map(), txs: new Map(),
    blocks: new Map(), coins: new Map(), pending: new Set(), drafts: Object.assign(new Map(), { sizeCounter: 0 }),
    funded: new Map(), events: [], calls: [], httpCalls: [], httpActive: 0, httpPeak: 0, starts: 0, stops: 0, removals: 0, signs: 0, sends: 0, ...options };
  const runtime = await factory(); return { runtime, c: control };
}
const adapter = (runtime, route = null, recipientIndex = 0) => runtime.adapter(route ? { asset, route } : { asset, recipientIndex });
async function send(runtime, route = null, recipientIndex = 0, hooks = {}) {
  const bound = adapter(runtime, route, recipientIndex);
  return bound.transfer({ amount: '1000000', wireKeyCommitment: sha('wire ' + control.signs) }, {
    async beforeSign(prepared) { control.events.push('beforeSign'); await bound.assertPrepared(prepared); await hooks.beforeSign?.(prepared); },
    async onSigned(payload) { control.events.push('onSigned'); await hooks.onSigned?.(payload); },
  });
}
function audit(custody, inventory) {
  return auditClaimNativeInventory(inventory, { nativeFamily: '1', nativeGenesis: custody.genesis, nativeAsset: asset,
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family: '1', genesis: custody.genesis, asset,
      endpoint: custody.roles.escrow.endpoint }) }, custody.roles);
}


test('private BTC audit snapshots require exact genuine facade and contain complete physical history', async()=>{
 const {runtime:pair}=await fixture();try{
  const a=readOwnedBitcoinRuntimeAuditState(pair.custody),b=readOwnedBitcoinRuntimeAuditState(pair.graph);
  assert.equal(a.lifetimeId,b.lifetimeId);assert.equal(a.readGeneration,b.readGeneration);assert.equal(a.mutationGeneration,b.mutationGeneration);
  assert.equal(a.facade,'custody');assert.equal(b.facade,'graph');assert.equal(a.signingUnresolved,false);assert.equal(a.readsIdle,true);
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.custodyTransfers)&&Object.isFrozen(a.graphTransfers));
  for(const fake of [{},pair,{...pair.graph},new Proxy(pair.graph,{})])assert.throws(()=>readOwnedBitcoinRuntimeAuditState(fake),/CAPABILITY/);
  assert.throws(()=>readOwnedBitcoinRuntimeAuditState(pair.graph,{}),/NO_OPTIONS/);
  const sent=await send(pair.graph);await pair.graph.confirm(sent.nativeId);
  const later=readOwnedBitcoinRuntimeAuditState(pair.custody);assert.equal(later.transfers.length,0);assert.equal(later.graphTransfers.length,1);assert.equal(later.custodyTransfers.length,0);
  assert.equal(later.graphTransfers[0].txid,sent.nativeId);assert.ok(BigInt(later.readGeneration)>BigInt(a.readGeneration));assert.ok(BigInt(later.mutationGeneration)>BigInt(a.mutationGeneration));
  assert.equal(a.graphTransfers.length,0,'prior snapshot never mutates');
 }finally{await pair.custody.close();assert.throws(()=>readOwnedBitcoinRuntimeAuditState(pair.graph),/CLOSED/);}
});
test('private BTC audit generation and active-read state never revert after an awaited read',async()=>{
 const {runtime:pair,c}=await fixture();try{
  const before=readOwnedBitcoinRuntimeAuditState(pair.custody);let release,entered;
  const started=new Promise(r=>{entered=r;});const hold=new Promise(r=>{release=r;});
  c.beforeRPC=async method=>{if(method==='getblockchaininfo'){entered();await hold;}};
  const read=pair.graph.health();await started;const during=readOwnedBitcoinRuntimeAuditState(pair.custody);
  assert.equal(during.readsIdle,false);assert.ok(during.activeReads>0);assert.ok(BigInt(during.readGeneration)>BigInt(before.readGeneration));
  release();await read;const after=readOwnedBitcoinRuntimeAuditState(pair.graph);assert.equal(after.readsIdle,true);assert.equal(after.activeReads,0);
  assert.ok(BigInt(after.readGeneration)>BigInt(before.readGeneration));
 }finally{await pair.custody.close();}
});
test('private BTC audit sees unresolved key intent before any new retained wire',async()=>{
 const {runtime:pair,c}=await fixture();try{
  let seen;c.beforeRPC=async method=>{if(method==='signrawtransactionwithwallet'){seen=readOwnedBitcoinRuntimeAuditState(pair.custody);throw Error('HOST_SIGNER_REPLY_UNAVAILABLE');}};
  await assert.rejects(send(pair.graph),/OWNED_RPC_FAILED/);assert.ok(seen);assert.equal(seen.signingUnresolved,true);assert.equal(seen.graphTransfers.length,0);assert.ok(seen.activeMutations>0);
  const after=readOwnedBitcoinRuntimeAuditState(pair.custody);assert.equal(after.signingUnresolved,true);assert.equal(after.graphTransfers.length,0);assert.equal(after.activeMutations,0);
 }finally{await pair.custody.close();}
});
test('private BTC state reports genuine transient unavailable history instead of treating it as success',async()=>{
 const {runtime:pair,c}=await fixture();try{
  const sent=await send(pair.graph);await pair.graph.confirm(sent.nativeId);let release,entered;
  const started=new Promise(r=>{entered=r;}),hold=new Promise(r=>{release=r;});let stopped=false;
  c.beforeRPC=async method=>{if(method==='getblockchaininfo'&&!stopped){stopped=true;entered();await hold;}};
  const read=pair.graph.observe(sent.nativeId);await started;const during=readOwnedBitcoinRuntimeAuditState(pair.custody);
  assert.equal(during.graphTransfers[0].phase,'OBSERVATION_UNAVAILABLE');assert.equal(during.observationBusy,true);assert.equal(during.readsIdle,false);
  release();await read;const after=readOwnedBitcoinRuntimeAuditState(pair.custody);assert.equal(after.graphTransfers[0].phase,'OBSERVED_CONFIRMED');assert.equal(after.readsIdle,true);
  assert.notEqual(after.readGeneration,during.readGeneration);
 }finally{await pair.custody.close();}
});
test('private BTC snapshot latches failed native persistence and never treats retained wire as completed signing',async()=>{
 const {runtime:pair,c}=await fixture();try{c.failPersist=true;await assert.rejects(send(pair.graph),/HOST_PERSISTENCE_FAILED/);
 const value=readOwnedBitcoinRuntimeAuditState(pair.custody);assert.equal(value.persistenceFailed,true);assert.equal(value.signingUnresolved,true);assert.equal(value.graphTransfers.length,1);assert.equal(value.graphTransfers[0].broadcastAttempts,0);
 }finally{await pair.custody.close();}
});
test('private BTC snapshot latches isolation failure across later otherwise normal reads',async()=>{
 const {runtime:pair,c}=await fixture();try{c.afterRPC=(method,result)=>{if(method==='getnetworkinfo')result.networkactive=true;};
 await assert.rejects(pair.custody.health(),/NETWORK_ISOLATION_FAILED/);assert.equal(readOwnedBitcoinRuntimeAuditState(pair.graph).isolationFailed,true);
 c.afterRPC=null;await assert.rejects(pair.graph.health(),/NETWORK_ISOLATION_FAILED/);assert.equal(readOwnedBitcoinRuntimeAuditState(pair.custody).isolationFailed,true);
 }finally{await pair.custody.close();}
});
test('genuine owned-read quiescence drains BTC unavailable overlap, holds later reads and permanently fences their generation',async()=>{
 const {createOwnedOperatorNativeReads,quiesceOwnedOperatorNativeReads,assertOwnedOperatorNativeReadsQuiescent,releaseOwnedOperatorNativeReadQuiescence}=await import('../../../../src/operations/operators/claims/owned-native-operator-reads.mjs');
 const {runtime:pair,c}=await fixture();let fence;
 try{
  const sent=await send(pair.graph);await pair.graph.confirm(sent.nativeId);
  const one=createOwnedOperatorNativeReads({native:pair.graph,family:'1'}),two=createOwnedOperatorNativeReads({native:pair.graph,family:'1'});
  const r1=one.factReader({asset}),r2=two.factReader({asset}),query={family:'1',recipientIndex:'0',nativeId:sent.nativeId};
  let release,entered;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);let blocked=false;
  c.beforeRPC=async method=>{if(method==='getblockchaininfo'&&!blocked){blocked=true;entered();await hold;}};
  const first=r1.observe(query);await started;assert.equal(readOwnedBitcoinRuntimeAuditState(pair.custody).graphTransfers[0].phase,'OBSERVATION_UNAVAILABLE');
  let obtained=false;const closing=quiesceOwnedOperatorNativeReads([one,two]).then(value=>{obtained=true;return value;});await Promise.resolve();assert.equal(obtained,false);
  release();assert.equal((await first).status,'observed');fence=await closing;assertOwnedOperatorNativeReadsQuiescent(fence);
  const captured=readOwnedBitcoinRuntimeAuditState(pair.custody);assert.equal(captured.graphTransfers[0].phase,'OBSERVED_CONFIRMED');assert.equal(captured.readsIdle,true);
  let laterDone=false;const later=r2.observe(query).then(value=>{laterDone=true;return value;});await Promise.resolve();await Promise.resolve();assert.equal(laterDone,false);
  assertOwnedOperatorNativeReadsQuiescent(fence);releaseOwnedOperatorNativeReadQuiescence(fence);assert.equal((await later).status,'observed');
  assert.throws(()=>assertOwnedOperatorNativeReadsQuiescent(fence),/GENERATION_CHANGED/);assert.notEqual(readOwnedBitcoinRuntimeAuditState(pair.custody).readGeneration,captured.readGeneration);
  for(const fake of [{...one},new Proxy(one,{})])await assert.rejects(quiesceOwnedOperatorNativeReads([fake]),/ORIGINAL_READER/);
 }finally{if(fence)releaseOwnedOperatorNativeReadQuiescence(fence);await pair.custody.close();}
});
