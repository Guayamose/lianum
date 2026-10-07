/** Synthetic HTTP only. No Bitcoin binary, wallet, daemon, or native workflow. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createOwnedBitcoinInventoryReader, BITCOIN_INVENTORY_RPC_LIMITS } from '../../../../src/chains/bitcoin/transfers/owned-bitcoin-inventory-rpc.mjs';
import { readBitcoinInventoryOutputs } from '../../../../src/chains/bitcoin/transfers/owned-bitcoin-inventory-reads.mjs';

const password = 'ab'.repeat(32), txid = '12'.repeat(32), secret = 'private-response-must-not-escape';
const sha = value => createHash('sha256').update(value).digest('hex');
const output = index => ({ bestblock: '34'.repeat(32), confirmations: index, value: 1,
  coinbase: false, scriptPubKey: { hex: '0014' + '56'.repeat(20) } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(handler) {
  const sockets = new Set(), calls = [];
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'POST'); assert.equal(req.url, '/'); assert.equal(req.headers.connection, 'close');
      assert.ok(sha(req.headers.authorization) === sha('Basic ' + Buffer.from('synthetic-generic:' + password).toString('base64')), 'FIXED_SYNTHETIC_AUTH');
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const value = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(value.jsonrpc, '2.0'); assert.equal(value.method, 'gettxout');
      assert.equal(value.params.length, 3); assert.equal(value.params[2], true);
      calls.push(value); await handler(value, res, req);
    } catch { res.destroy(); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const reader = createOwnedBitcoinInventoryReader(server.address().port, password);
  return { reader, calls, async close() { await reader.close(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
const reply = (request, res, result) => res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
function sanitized(code) {
  return error => {
    assert.equal(error.message, 'BITCOIN_INVENTORY_RPC_' + code);
    assert.deepEqual(Object.keys(error), []);
    for (const text of [password, secret, 'synthetic-generic', 'Authorization']) assert.ok(!String(error.stack).includes(text));
    return true;
  };
}

test('202 distinct reads, duplicates, nulls and repeat inventories all send fresh fixed RPC requests', async () => {
  let active = 0, peak = 0, started = 0; const firstFour = deferred();
  const host = await fixture(async (request, res) => {
    active++; peak = Math.max(peak, active);
    if (++started <= 4) { if (started === 4) firstFour.resolve(); await firstFour.promise; }
    await tick(); active--;
    reply(request, res, request.params[1] === 3 ? null : output(Number(request.id)));
  });
  try {
    const input = Array.from({ length: 202 }, (_, vout) => ({ txid, vout })); input[201] = { ...input[0] };
    const run = () => readBitcoinInventoryOutputs(input, (_method, [tx, n]) => host.reader.getTxOut(tx, n));
    const first = await run(), second = await run();
    assert.equal(host.calls.length, 404); assert.equal(new Set(host.calls.map(row => row.id)).size, 404);
    assert.equal(first[3], null); assert.equal(second[3], null); assert.ok(peak <= 4 && peak > 1);
    assert.notDeepEqual(first[0], first[201]); assert.notDeepEqual(first[0], second[0]);
    assert.deepEqual(host.calls.map(row => row.params), [...input, ...input].map(row => [row.txid, row.vout, true]));
    assert.deepEqual(Object.keys(host.reader), ['getTxOut', 'close']); assert.ok(Object.isFrozen(host.reader));
  } finally { await host.close(); }
});

test('fixed endpoint configuration and outpoint-only capability reject substitutions before sending', async () => {
  for (const args of [[0, password], [65536, password], [1234, 'invalid'], [1234, password, 'localhost']])
    assert.throws(() => createOwnedBitcoinInventoryReader(...args), /RPC_CONFIG/);
  const host = await fixture((request, res) => reply(request, res, null));
  try {
    for (const args of [['signrawtransactionwithwallet', 0], [txid, -0], [txid, 0x100000000],
      [txid, 0, false], [txid, '0'], [{ toString() { throw Error('must not run'); } }, 0]])
      await assert.rejects(host.reader.getTxOut(...args), /RPC_OUTPOINT/);
    assert.equal(host.calls.length, 0);
  } finally { await host.close(); }
});

test('mismatched IDs, invalid envelopes/results, remote errors and malformed JSON fail with bounded codes', async () => {
  const cases = [
    request => ({ jsonrpc: '2.0', id: 'wrong', result: output(1) }),
    request => ({ jsonrpc: '2.0', id: Number(request.id), result: output(1) }),
    request => ({ jsonrpc: '1.0', id: request.id, result: output(1) }),
    request => ({ jsonrpc: '2.0', id: request.id }),
    request => ({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: secret } }),
    request => ({ jsonrpc: '2.0', id: request.id, result: null, error: { code: -1, message: secret } }),
    request => ({ jsonrpc: '2.0', id: request.id, result: {} }),
    request => ({ jsonrpc: '2.0', id: request.id, result: [] }),
    request => ({ jsonrpc: '2.0', id: request.id, result: { ...output(1), confirmations: -1 } }),
    request => ({ jsonrpc: '2.0', id: request.id, result: { ...output(1), value: 21_000_001 } }),
    request => [{ jsonrpc: '2.0', id: request.id, result: null }],
    () => 'malformed ' + secret,
  ];
  for (const make of cases) {
    const host = await fixture((request, res) => { const value = make(request); res.end(typeof value === 'string' ? value : JSON.stringify(value)); });
    try { await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('REPLY')); }
    finally { await host.close(); }
  }
});

test('HTTP errors and redirects do not escape response data or follow another endpoint', async () => {
  for (const status of [301, 401, 500]) {
    const host = await fixture((_request, res) => { res.writeHead(status, { location: 'http://example.invalid/' + secret }); res.end(secret); });
    try { await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('HTTP')); assert.equal(host.calls.length, 1); }
    finally { await host.close(); }
  }
});

test('declared and streaming oversized responses fail closed', async () => {
  for (const declared of [true, false]) {
    const host = await fixture((_request, res) => {
      if (declared) res.writeHead(200, { 'Content-Length': BITCOIN_INVENTORY_RPC_LIMITS.maximumResponseBytes + 1 });
      else res.writeHead(200, { 'Transfer-Encoding': 'chunked' });
      res.end(Buffer.alloc(BITCOIN_INVENTORY_RPC_LIMITS.maximumResponseBytes + 1, 32));
    });
    try { await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('SIZE')); }
    finally { await host.close(); }
  }
});

test('connection failure and premature response close fail closed', async () => {
  const host = await fixture((_request, res) => { res.writeHead(200, { 'Content-Length': 100 }); res.write('{'); res.socket.destroy(); });
  try { await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('TRANSPORT')); }
  finally { await host.close(); }
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const reader = createOwnedBitcoinInventoryReader(port, password);
  try { await assert.rejects(reader.getTxOut(txid, 0), sanitized('TRANSPORT')); } finally { await reader.close(); }
});

test('absolute 15-second deadline bounds partial/dripping responses and drains the request', async t => {
  const entered = deferred();
  const host = await fixture((_request, res) => { res.writeHead(200); res.write('{'); entered.resolve(); });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = assert.rejects(host.reader.getTxOut(txid, 0), sanitized('DEADLINE'));
    await entered.promise; t.mock.timers.tick(BITCOIN_INVENTORY_RPC_LIMITS.timeoutMs); await pending;
    await host.reader.close();
  } finally { t.mock.timers.reset(); await host.close(); }
});

test('four-request bound and explicit close cancel and drain every started operation', async () => {
  const entered = deferred(); let count = 0;
  const host = await fixture(() => { if (++count === 4) entered.resolve(); });
  try {
    const pending = Array.from({ length: 4 }, (_, vout) => assert.rejects(host.reader.getTxOut(txid, vout), sanitized('CLOSED')));
    await entered.promise;
    await assert.rejects(host.reader.getTxOut(txid, 4), sanitized('BUSY'));
    const close = host.reader.close(); assert.equal(host.reader.close(), close); await close; await Promise.all(pending);
    await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('CLOSED')); assert.equal(host.calls.length, 4);
  } finally { await host.close(); }
});


test('oversized HTTP headers reject without retaining private transport details', async () => {
  const host = await fixture((_request, res) => {
    res.setHeader('x-private', secret + 'x'.repeat(BITCOIN_INVENTORY_RPC_LIMITS.maximumHeaderBytes)); res.end('{}');
  });
  try { await assert.rejects(host.reader.getTxOut(txid, 0), sanitized('TRANSPORT')); }
  finally { await host.close(); }
});
