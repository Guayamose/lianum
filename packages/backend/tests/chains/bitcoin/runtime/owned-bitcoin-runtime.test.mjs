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
import * as childProcess from 'node:child_process';
import { encodeBitcoinBinding } from '@lianum/engine/native/native-receipt-binding';
import { auditClaimNativeInventory } from '../../../../src/claims/operations/backing-audit.mjs';
import { nativeClaimEndpointCommitment } from '@lianum/engine/claims/framing';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash160 = value => createHash('ripemd160').update(createHash('sha256').update(value).digest()).digest('hex');
const asset = sha('combined host BTC asset'), copy = value => structuredClone(value);
const actualHarness = await import('@lianum/engine/chains/shared/runtime-harness');
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
  assert.equal(options.timeout, 15_000, 'HOST_ORIGINAL_RPC_TIMEOUT_UNCHANGED');
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
mock.module('node:child_process', { exports: { ...childProcess, execFile: transport,
  spawn() { throw new Error('HOST_OWNED_START_ONLY'); } } });
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

mock.module('@lianum/engine/chains/shared/runtime-harness', { exports: {
  ...actualHarness,
  async pinnedBinary(name) { return name.endsWith('/bitcoind') ? '/host-only/bitcoind' : '/host-only/bitcoin-cli'; },
  async scratchDirectory() {
    const root = join(actualHarness.projectRoot, '.local/integrations');
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    control.directory = await fs.mkdtemp(join(root, 'flat-bitcoin-host-')); return control.directory;
  },
  async removeOwnScratch(path) { assert.equal(path, control.directory); control.removals++; await fs.rm(path, { recursive: true }); },
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
const { createOwnedCombinedBitcoinRuntime, createOwnedBitcoinCustodyRuntime, createOwnedFlatBitcoinRuntime,
  assertOwnedBitcoinRuntime, BITCOIN_REGTEST_GENESIS, BITCOIN_CUSTODY_PROFILE, BITCOIN_OWNED_PROFILE,
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

test('fixed factories reject supplied endpoints/paths/keys before transport; only original capabilities are branded', async () => {
  for (const factory of [createOwnedCombinedBitcoinRuntime, createOwnedBitcoinCustodyRuntime, createOwnedFlatBitcoinRuntime])
    for (const value of [undefined, {}, { endpoint: 'http://localhost' }, { wallet: 'escrow', keys: 'forbidden' }])
      await assert.rejects(factory(value), /FIXED_CONSTRUCTOR/);
  assert.throws(() => assertOwnedBitcoinRuntime(Object.freeze({ genesis: BITCOIN_REGTEST_GENESIS })), /CAPABILITY/);
  const { runtime: pair, c } = await fixture();
  try {
    assert.deepEqual(Object.keys(pair), ['custody', 'graph']); assert.ok(Object.isFrozen(pair));
    for (const runtime of Object.values(pair)) { assertOwnedBitcoinRuntime(runtime); assert.ok(Object.isFrozen(runtime)); }
    assert.throws(() => assertOwnedBitcoinRuntime(pair), /CAPABILITY/);
    assert.throws(() => assertOwnedBitcoinRuntime({ ...pair.graph }), /CAPABILITY/);
    assert.throws(() => assertOwnedBitcoinRuntime(new Proxy(pair.graph, {})), /CAPABILITY/);
    assert.equal(c.starts, 1); assert.equal(pair.custody.genesis, pair.graph.genesis);
    assert.equal(pair.custody.metadata.profile, BITCOIN_CUSTODY_PROFILE); assert.equal(pair.graph.metadata.profile, BITCOIN_OWNED_PROFILE);
    for (const method of ['close', 'health', 'processStatus']) assert.equal(pair.custody[method], pair.graph[method]);
    assert.equal(pair.graph.inventory, undefined); assert.equal(pair.graph.roles, undefined); assert.equal(pair.custody.transfer, undefined);
    assert.equal(pair.graph.rpc, undefined); assert.equal(pair.graph.sign, undefined);
  } finally { await pair.custody.close(); }
});

test('combined wallets, routes and native-asset bindings cannot be substituted across capabilities', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  try {
    const custodyScripts = Object.values(custody.roles).map(role => role.endpoint);
    const graphScripts = [graph.sourceScript, graph.changeScript, ...graph.recipientScripts];
    assert.equal(new Set([...custodyScripts, ...graphScripts]).size, 7);
    assert.equal(c.wallets.size, 6); assert.ok(c.wallets.has('combined-graph-solver'));
    assert.deepEqual(adapter(graph, null, 1).binding, { family: '1', genesis: graph.genesis, asset,
      sourceEndpoint: graph.sourceScript, destinationEndpoint: graph.recipientScripts[1], changeEndpoint: graph.changeScript });
    for (const route of ['deposit', 'refund', 'redeem']) {
      assert.throws(() => graph.adapter({ asset, route }), /INVALID_OPTIONS/);
      assert.throws(() => graph.factReader({ asset, route }), /INVALID_OPTIONS/);
      assert.ok(custodyScripts.includes(adapter(custody, route).binding.sourceEndpoint));
    }
    assert.throws(() => custody.adapter({ asset, recipientIndex: 0 }), /INVALID_OPTIONS/);
    assert.throws(() => custody.factReader({ asset }), /INVALID_OPTIONS/);
    assert.throws(() => custody.adapter({ asset, route: 'graph' }), /CUSTODY_FIXED_ROUTE/);
    assert.throws(() => custody.adapter({ asset: sha('different asset'), route: 'deposit' }), /REBIND_FORBIDDEN/);
    await assert.rejects(send(graph, null, 0, { async beforeSign(prepared) {
      await assert.rejects(adapter(custody, 'deposit').assertPrepared(prepared), /OTHER_ROUTE/);
      await assert.rejects(adapter(graph, null, 1).assertPrepared(prepared), /OTHER_ROUTE/);
      throw new Error('HOST_STOP_BEFORE_SIGN');
    } }), /HOST_STOP_BEFORE_SIGN/);
    assert.equal(c.signs, 0); assert.equal(c.sends, 0);
    c.substituteCoin = true;
    await assert.rejects(send(graph), /INSUFFICIENT_OWNED_INVENTORY/);
    assert.equal(c.signs, 0); assert.equal(c.sends, 0);
  } finally { await graph.close(); }
});

test('wallet alias and immature graph funding fail construction and close the sole process', async () => {
  for (const options of [{ aliasGraph: true }, { immatureGraph: true }]) {
    await assert.rejects(fixture(options), /COMBINED_WALLET_ALIAS|GRAPH_SYNTHETIC_FUNDING/);
    assert.equal(control.starts, 1); assert.equal(control.stops, 1); assert.equal(control.removals, 1);
  }
});

test('fresh bootstrap retains exactly 101 ordered blocks in bounded batches', async () => {
  const { runtime, c } = await fixture({}, createOwnedFlatBitcoinRuntime);
  try {
    assert.deepEqual(c.calls.filter(row => row.method === 'generatetoaddress').map(row => row.values[0]), [...Array(10).fill(10), 1]);
    assert.equal(c.height, 101);
    assert.equal(c.blocks.size, 101);
    assert.equal(c.signs, 0); assert.equal(c.sends, 0);
  } finally { await runtime.close(); }
});

test('malformed, short and duplicate bootstrap batches reject and close the original process', async () => {
  for (const mutate of [rows => rows.pop(), rows => { rows[0] = 'not-a-block-hash'; }, rows => { rows[1] = rows[0]; }]) {
    await assert.rejects(fixture({ afterRPC(method, rows) { if (method === 'generatetoaddress') mutate(rows); } }, createOwnedFlatBitcoinRuntime), /BITCOIN_BOOTSTRAP_BATCH_LENGTH|BITCOIN_INVALID_HASH|BITCOIN_BOOTSTRAP_DUPLICATE_BLOCK/);
    assert.equal(control.starts, 1); assert.equal(control.stops, 1); assert.equal(control.removals, 1);
    assert.equal(control.signs, 0); assert.equal(control.sends, 0);
  }
});

test('graph funding and original graph effects stay outside custody principal, inventory, fee audit and facts', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  try {
    adapter(custody, 'deposit'); const initial = await custody.inventory();
    assert.equal(audit(custody, initial).nativePrincipalAvailable, '0');
    assert.equal(graph.syntheticFunding.classification, 'SYNTHETIC_LOCAL_GRAPH_LIQUIDITY_NOT_USER_BACKING');
    assert.ok(BigInt(graph.syntheticFunding.confirmations) >= 101n);
    assert.equal(graph.syntheticFunding.amount, '2500000000');
    assert.notEqual(graph.syntheticFunding.nativeId, custody.syntheticPrefunding.nativeId);
    const delivered = await send(graph, null, 1);
    const pending = await graph.factReader({ asset }).observe({ family: '1', recipientIndex: '1', nativeId: delivered.nativeId });
    assert.equal(pending.status, 'unavailable');
    const fact = await graph.confirm(delivered.nativeId);
    assert.equal(fact.confirmations, BITCOIN_TRANSFER_LIMITS.minimumConfirmations);
    const retained = graph.transfers[0], original = await fs.readFile(join(c.directory, 'signed-' + delivered.nativeId + '.json'), 'utf8');
    assert.equal(JSON.parse(original).rawTransaction, retained.rawTransaction);
    assert.equal(JSON.parse(original).phase, 'SIGNED_NOT_BROADCAST');
    const graphFact = await graph.factReader({ asset }).observe({ family: '1', recipientIndex: '1', nativeId: delivered.nativeId });
    assert.equal(graphFact.status, 'observed'); assert.equal(graphFact.nativeWire, retained.rawTransaction);
    assert.equal(graphFact.intent.sourceScript, graph.sourceScript); assert.equal(graphFact.intent.changeScript, graph.changeScript);
    assert.equal(custody.transfers.length, 0);
    assert.deepEqual(await custody.factReader({ asset, route: 'deposit' }).observe({ family: '1', recipientIndex: '1', nativeId: delivered.nativeId }),
      { status: 'unknown', reason: 'OWNED_IDENTITY_NOT_RETAINED' });
    await assert.rejects(custody.observe(delivered.nativeId), /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(custody.confirm(delivered.nativeId), /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(adapter(custody, 'redeem').observe({ nativeId: delivered.nativeId }), /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(graph.factReader({ asset }).observe({ family: '1', recipientIndex: '0', nativeId: delivered.nativeId }), /OTHER_RECIPIENT/);
    const afterGraph = await custody.inventory();
    assert.equal(afterGraph.escrow.total, initial.escrow.total); assert.deepEqual(afterGraph.feeAudit, initial.feeAudit);
    assert.deepEqual(audit(custody, afterGraph), audit(custody, initial));
    assert.deepEqual(c.scanned, Object.values(custody.roles).map(role => 'raw(' + role.endpoint + ')'));
    assert.ok(afterGraph.accounts.every(account => ![graph.sourceScript, graph.changeScript, ...graph.recipientScripts].includes(account.endpoint)));
    const deposit = await send(custody, 'deposit', 0, { async onSigned() {
      const reader = graph.factReader({ asset });
      assert.equal((await reader.observe({ family: '1', recipientIndex: '1', nativeId: delivered.nativeId })).status, 'observed');
      await assert.rejects(send(graph), /OPERATION_BUSY/);
      await assert.rejects(graph.confirm(delivered.nativeId), /OPERATION_BUSY/);
      await assert.rejects(custody.observe(custody.transfers[0].txid), /OPERATION_BUSY|REQUIRES_CONFIRMED_HISTORY/);
    } }); await custody.confirm(deposit.nativeId);
    assert.equal(graph.transfers.length, 1); assert.equal(custody.transfers.length, 1);
    const afterDeposit = await custody.inventory(); assert.equal(audit(custody, afterDeposit).nativePrincipalAvailable, '1000000');
    assert.equal(afterDeposit.feeAudit.transfers.length, 1); assert.equal(afterDeposit.feeAudit.actualFees, '200');
    assert.equal(afterDeposit.feeAudit.transfers[0].nativeId, deposit.nativeId);
    assert.deepEqual(await graph.factReader({ asset }).observe({ family: '1', recipientIndex: '0', nativeId: deposit.nativeId }),
      { status: 'unknown', reason: 'OWNED_IDENTITY_NOT_RETAINED' });
    await assert.rejects(graph.observe(deposit.nativeId), /UNKNOWN_SIGNED_IDENTITY/);
    await assert.rejects(adapter(custody, 'refund').observe({ nativeId: deposit.nativeId }), /OTHER_ROUTE/);
    const snapshot = graph.transfers; snapshot[0].rawTransaction = '00'; assert.equal(graph.transfers[0].rawTransaction, retained.rawTransaction);
    const events = c.events, firstSign = events.indexOf('signrawtransactionwithwallet');
    assert.ok(firstSign < events.indexOf('persist-sync')); assert.ok(events.indexOf('persist-sync') < events.indexOf('directory-sync'));
    assert.ok(events.indexOf('directory-sync') < events.indexOf('onSigned')); assert.ok(events.indexOf('onSigned') < events.indexOf('sendrawtransaction'));
    assert.equal(c.signs, 2); assert.equal(c.sends, 2);
    // This runtime/inventory fixture has no original payout controller grant.
    // Keep that boundary intact; dedicated payout tests exercise real grants.
    await assert.rejects(send(custody, 'refund'), /BITCOIN_INVALID_OPTIONS/);
    const unchanged = await custody.inventory();
    assert.equal(audit(custody, unchanged).nativePrincipalAvailable, audit(custody, afterDeposit).nativePrincipalAvailable);
    assert.equal(graph.transfers.length, 1); assert.equal(c.signs, 2); assert.equal(c.sends, 2);
  } finally { await custody.close(); }
});

test('shared operation fence blocks simultaneous work and every ambiguity prevents another sign or send', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  try {
    await send(graph, null, 0, { async beforeSign() {
      await assert.rejects(send(custody, 'deposit'), /OPERATION_BUSY/);
    } });
    await assert.rejects(send(custody, 'deposit'), /PRIOR_TRANSFER_UNRESOLVED/);
    await graph.confirm(graph.transfers[0].txid);
    await assert.rejects(graph.confirm(graph.transfers[0].txid), /MINING_ALREADY_USED/);
    assert.equal(c.signs, 1); assert.equal(c.sends, 1);
  } finally { await graph.close(); }
  for (const options of [{ loseSign: true }, { foreignSigner: true }, { failPersist: true }, { loseBroadcast: true }, { rejectSigned: true }]) {
    const { runtime: pair, c: state } = await fixture(options);
    try {
      await assert.rejects(send(pair.graph, null, 0, {
        async onSigned() { if (options.rejectSigned) throw new Error('HOST_SIGNED_CALLBACK_REJECTED'); },
      }));
      await assert.rejects(send(pair.custody, 'deposit'), /PRIOR_SIGNING_UNRESOLVED|PRIOR_TRANSFER_UNRESOLVED/);
      assert.equal(state.signs, 1); assert.equal(state.sends, options.loseBroadcast ? 1 : 0);
      if (options.loseBroadcast) {
        const retained = pair.graph.transfers[0]; assert.equal(retained.broadcastAttempts, 1);
        await pair.graph.confirm(retained.txid); assert.equal(state.sends, 1);
      }
    } finally { await pair.graph.close(); }
  }
});

test('closing either facade closes both and removes exactly the shared owned resources once', async () => {
  for (const first of ['custody', 'graph']) {
    const { runtime: pair, c } = await fixture(), second = first === 'custody' ? 'graph' : 'custody';
    const result = await pair[first].close(); assert.equal(result.ownedProcessStopped, true);
    assert.deepEqual(await pair[second].close(), result); assert.equal(c.stops, 1); assert.equal(c.removals, 1);
    for (const native of Object.values(pair)) {
      assert.equal(native.processStatus().closed, true); assert.equal(native.processStatus().running, false);
      await assert.rejects(native.health(), /RUNTIME_CLOSED/);
    }
    await assert.rejects(pair.custody.inventory(), /RUNTIME_CLOSED/);
    await assert.rejects(send(pair.graph), /RUNTIME_CLOSED/); await assert.rejects(send(pair.custody, 'deposit'), /RUNTIME_CLOSED/);
  }
});

test('standalone factories preserve original profiles, wallet topology and transfer interfaces', async () => {
  for (const factory of [createOwnedFlatBitcoinRuntime, createOwnedBitcoinCustodyRuntime]) {
    const { runtime, c } = await fixture({}, factory);
    try {
      assertOwnedBitcoinRuntime(runtime); assert.equal(c.starts, 1); assert.equal(c.wallets.size, 3);
      assert.equal(runtime.syntheticFunding, undefined);
      if (factory === createOwnedFlatBitcoinRuntime) {
        assert.equal(runtime.metadata.profile, BITCOIN_OWNED_PROFILE); assert.equal(runtime.inventory, undefined);
        const result = await send(runtime); await runtime.confirm(result.nativeId);
      } else {
        assert.equal(runtime.metadata.profile, BITCOIN_CUSTODY_PROFILE); assert.equal(runtime.transfer, undefined);
        const result = await send(runtime, 'deposit'); await runtime.confirm(result.nativeId);
      }
      assert.equal(runtime.transfers.length, 1); assert.equal(c.signs, 1); assert.equal(c.sends, 1);
    } finally { await runtime.close(); }
  }
});

test('inventory read failure holds the shared native fence until all started UTXO reads drain', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  let entered, release, started = 0, active = 0, finished = false;
  const reached = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  c.beforeRPC = async method => {
    if (method !== 'gettxout') return;
    const index = started++; active++;
    if (started === 4) entered();
    try {
      if (index === 1) { await new Promise(resolve => setImmediate(resolve)); throw Error('HOST_READ_FAILED'); }
      await barrier;
    } finally { active--; }
  };
  try {
    const inventory = custody.inventory();
    inventory.then(() => { finished = true; }, () => { finished = true; });
    await reached; await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 4); assert.equal(finished, false); assert.equal(active, 3);
    await assert.rejects(custody.inventory(), /INVENTORY_BUSY/);
    await assert.rejects(send(graph), /OPERATION_BUSY/);
    assert.equal(c.signs, 0); assert.equal(c.sends, 0);
    release(); await assert.rejects(inventory, /BITCOIN_INVENTORY_RPC_TRANSPORT/);
    assert.equal(active, 0); assert.equal(finished, true); assert.equal(started, 4);
    c.beforeRPC = null;
    const fresh = await custody.inventory(); assert.ok(fresh.accounts[0].utxos.length > 4);
  } finally { release(); c.beforeRPC = null; await custody.close(); }
});


test('two complete 202-output inventories use fresh HTTP reads while all signing and mutations stay on CLI', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  try {
    const cliOutpoints = c.calls.filter(row => row.method === 'gettxout').length;
    const before = c.calls.length;
    const first = await custody.inventory(), second = await custody.inventory();
    assert.equal(first.accounts.reduce((count, row) => count + row.utxos.length, 0), 202);
    assert.deepEqual(first, second); assert.equal(c.httpCalls.length, 404);
    assert.equal(new Set(c.httpCalls.map(row => row.id)).size, 404);
    assert.deepEqual(c.httpCalls.slice(0, 202).map(row => row.params), c.httpCalls.slice(202).map(row => row.params));
    assert.equal(c.httpPeak, 4); assert.equal(c.httpActive, 0);
    assert.equal(c.calls.filter(row => row.method === 'gettxout').length, cliOutpoints);
    assert.equal(c.calls.slice(before).filter(row => row.method === 'getblockchaininfo').length, 4);
    assert.equal(c.calls.slice(before).filter(row => row.method === 'getnetworkinfo').length, 4);
    assert.equal(c.calls.slice(before).filter(row => row.method === 'scantxoutset').length, 2);
    await send(graph);
    assert.equal(c.httpCalls.length, 404); assert.equal(c.signs, 1); assert.equal(c.sends, 1);
    for (const method of ['createwallet', 'generatetoaddress', 'createrawtransaction', 'fundrawtransaction',
      'signrawtransactionwithwallet', 'testmempoolaccept', 'sendrawtransaction']) assert.ok(c.calls.some(row => row.method === method));
    assert.ok(c.calls.filter(row => row.method === 'gettxout').length > cliOutpoints, 'pre-sign read stays on CLI');
    for (const runtime of [custody, graph]) {
      for (const field of ['rpc', 'inventoryReader', 'password', 'port', 'endpoint']) assert.equal(runtime[field], undefined);
    }
  } finally { await custody.close(); }
});

test('duplicate scanned outpoints are each read and then rejected by the unchanged inventory audit', async () => {
  const { runtime: { custody }, c } = await fixture();
  c.afterRPC = (method, value) => { if (method === 'scantxoutset') value.unspents.push({ ...value.unspents[0] }); };
  try {
    await assert.rejects(custody.inventory(), /CUSTODY_DUPLICATE_UTXO/);
    const duplicate = c.httpCalls.filter(row => row.params[0] === c.httpCalls[0].params[0]);
    assert.equal(duplicate.length, 2); assert.notEqual(duplicate[0].id, duplicate[1].id);
    assert.equal(c.httpActive, 0); assert.equal(c.signs, 0); assert.equal(c.sends, 0);
  } finally { await custody.close(); }
});

test('runtime transport reply failures have no CLI fallback, and a later inventory reads afresh', async () => {
  const { runtime: { custody }, c } = await fixture();
  try {
    const cliOutpoints = c.calls.filter(row => row.method === 'gettxout').length;
    c.httpReply = (_request, result) => ({ jsonrpc: '2.0', id: 'wrong', result });
    await assert.rejects(custody.inventory(), { message: 'BITCOIN_INVENTORY_RPC_REPLY' });
    assert.equal(c.httpActive, 0); assert.equal(c.httpCalls.length, 4);
    assert.equal(c.calls.filter(row => row.method === 'gettxout').length, cliOutpoints);
    c.httpReply = null; const fresh = await custody.inventory();
    assert.equal(fresh.accounts.reduce((sum, row) => sum + row.utxos.length, 0), 202);
    assert.equal(c.httpCalls.length, 206); assert.equal(c.signs, 0); assert.equal(c.sends, 0);
  } finally { await custody.close(); }
});

test('closing the shared runtime cancels inventory HTTP reads before process stop and scratch removal', async () => {
  const { runtime: { custody, graph }, c } = await fixture();
  let entered, release, started = 0;
  const reached = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  c.beforeHTTP = async () => { if (++started === 4) entered(); await barrier; };
  try {
    const read = assert.rejects(custody.inventory(), { message: 'BITCOIN_INVENTORY_RPC_CLOSED' });
    await reached; const closed = await graph.close(); await read;
    assert.equal(closed.ownedProcessStopped, true); assert.equal(c.httpActive, 0);
    assert.equal(c.httpCalls.length, 4); assert.equal(c.stops, 1); assert.equal(c.removals, 1);
    await assert.rejects(custody.inventory(), /RUNTIME_CLOSED/);
  } finally { release(); await custody.close(); }
});


test('per-output binding and before/after inventory head checks still fail closed', async () => {
  for (const scenario of ['output', 'head']) {
    const { runtime: { custody }, c } = await fixture();
    try {
      if (scenario === 'output') c.httpReply = (request, result) => ({ jsonrpc: '2.0', id: request.id,
        result: { ...result, bestblock: sha('different owned tip') } });
      else {
        let healthReads = 0;
        c.afterRPC = (method, value) => { if (method === 'getblockchaininfo' && ++healthReads === 2) value.bestblockhash = sha('changed after full inventory'); };
      }
      await assert.rejects(custody.inventory(), scenario === 'output' ? /INVENTORY_OUTPUT_CHANGED/ : /INVENTORY_HEAD_CHANGED/);
      assert.equal(c.httpActive, 0); assert.equal(c.signs, 0); assert.equal(c.sends, 0);
      if (scenario === 'head') assert.equal(c.httpCalls.length, 202);
    } finally { await custody.close(); }
  }
});
