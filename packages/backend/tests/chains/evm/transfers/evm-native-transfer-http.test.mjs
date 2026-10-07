/** Real local HTTP, synthetic original transaction/receipt responses. No public
 * node, signing, transaction submission, funds, compiler or prover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createEvmNativeTransferHttpReader, createHttpEvmNativeTransferObserver } from '../../../../src/chains/evm/transfers/evm-native-transfer-http.mjs';
import { originalFixture, hash } from '../../../fixtures/chains/evm/transfers/evm-native-transfer-fixture.mjs';
const options = () => ({ signal: new AbortController().signal });
const respond = (response, body) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
async function serve(t, handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const parts = []; for await (const part of request) parts.push(part);
    const packet = { method: request.method, path: request.url, headers: request.headers, body: JSON.parse(Buffer.concat(parts).toString()) };
    requests.push(packet); await handler(packet, response);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { endpoint: `http://127.0.0.1:${server.address().port}/`, requests };
}
const key = '12'.repeat(32);

test('four-network original receipt observers execute their complete fixed HTTP read path', async t => {
  const fixtures = new Map(['ethereum', 'base', 'arbitrum', 'bnb'].map(chain => [chain, originalFixture(chain)]));
  const local = await serve(t, async (packet, response) => {
    const f = fixtures.get(packet.path.slice(1)); assert.ok(f);
    const { id, method, params } = packet.body;
    const result = await f.transport(method, params, options());
    respond(response, { jsonrpc: '2.0', id, result });
  });
  for (const [chain, f] of fixtures) {
    const observer = createHttpEvmNativeTransferObserver({ chain, genesisHash: f.genesisHash,
      endpoint: local.endpoint + chain, original: f.original, now: () => 1030000 });
    const result = await observer.observe({ nativeId: f.original.expected.nativeId });
    assert.equal(result.status, 'observed'); assert.equal(result.identity.amount, '9007199254740993');
    assert.equal(result.deliveryVerified, false); assert.equal(result.creditEligible, false); assert.equal(result.graphAdmissionEligible, false);
    assert.equal(result.network.chain, chain); assert.equal(result.evidence.inclusion.transactionIndex, '1');
  }
  assert.equal(local.requests.length, 56);
  for (const packet of local.requests) {
    assert.equal(packet.method, 'POST'); assert.equal(packet.headers['accept-encoding'], 'identity');
    assert.equal(packet.headers.authorization, undefined); assert.equal(packet.headers.cookie, undefined);
    assert.ok(!packet.body.method.startsWith('eth_send') && !packet.body.method.startsWith('eth_sign'));
  }
});

test('reader confines transaction requests to one original hash and excludes unrelated RPC capabilities', async t => {
  const local = await serve(t, (packet, response) => respond(response, { jsonrpc: '2.0', id: packet.body.id, result: null }));
  const read = createEvmNativeTransferHttpReader({ endpoint: local.endpoint, nativeId: key });
  for (const [method, params] of [['eth_sendRawTransaction', ['0x00']], ['eth_signTransaction', [{}]],
    ['eth_getBalance', ['0x' + '34'.repeat(20), { blockHash: hash(1), requireCanonical: true }]],
    ['eth_getCode', []], ['eth_call', []], ['eth_getTransactionByHash', [hash(2)]],
    ['eth_getTransactionReceipt', ['0x' + key, 'extra']], ['eth_getBlockByNumber', ['latest', false]]])
    await assert.rejects(read(method, params, options()));
  let touched = false;
  const params = []; Object.defineProperty(params, '0', { enumerable: true, get() { touched = true; return '0x' + key; } });
  await assert.rejects(read('eth_getTransactionReceipt', params, options()));
  assert.equal(touched, false); assert.equal(local.requests.length, 0);
  assert.equal(await read('eth_getTransactionByHash', ['0x' + key], options()), null);
  assert.equal(await read('eth_getTransactionReceipt', ['0x' + key], options()), null);
});

test('no redirect, automatic retry, mismatched JSON-RPC identity or application error can become an observation', async t => {
  const canary = await serve(t, (_packet, response) => respond(response, {})); let index = 0;
  const behaviors = [
    (packet, response) => respond(response, { jsonrpc: '2.0', id: 'wrong', result: null }),
    (packet, response) => respond(response, { jsonrpc: '2.0', id: packet.body.id, error: { message: 'secret endpoint URL' } }),
    (packet, response) => respond(response, { jsonrpc: '2.0', id: packet.body.id, result: null, error: null }),
    (_packet, response) => { response.writeHead(307, { Location: canary.endpoint }); response.end(); },
    (_packet, response) => { response.writeHead(429, { 'Content-Type': 'application/json' }); response.end('{}'); },
  ];
  const local = await serve(t, (packet, response) => behaviors[index++](packet, response));
  const read = createEvmNativeTransferHttpReader({ endpoint: local.endpoint, nativeId: key });
  for (const _ of behaviors) await assert.rejects(read('eth_getTransactionReceipt', ['0x' + key], options()), error => {
    assert.match(error.message, /^[A-Z_]+$/); assert.equal(error.message.includes('secret'), false); return true;
  });
  assert.equal(local.requests.length, behaviors.length); assert.equal(canary.requests.length, 0);
});

test('receipt HTTP response limits, completion, UTF-8 and duplicate JSON fields fail closed', async t => {
  let index = 0;
  const behaviors = [
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '9999999' }); r.end(); },
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.write(' '.repeat(1100)); r.end('{}'); },
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' }); r.end('{}'); },
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(Buffer.from([0xff])); },
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'text/plain' }); r.end('{}'); },
    (_p, r) => { r.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); r.end('{}'); },
    (p, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end('{"jsonrpc":"2.0","id":"' + p.body.id + '","result":null,"result":{}}'); },
  ];
  const local = await serve(t, (packet, response) => behaviors[index++](packet, response));
  const read = createEvmNativeTransferHttpReader({ endpoint: local.endpoint, nativeId: key, maxResponseBytes: 1024 });
  for (const _ of behaviors) await assert.rejects(read('eth_getTransactionReceipt', ['0x' + key], options()));
  assert.equal(local.requests.length, behaviors.length);
});

test('receipt reader bounds requests, propagates cancellation and releases the original-reader capacity', async t => {
  const local = await serve(t, () => {});
  const read = createEvmNativeTransferHttpReader({ endpoint: local.endpoint, nativeId: key, timeoutMs: 30 });
  await assert.rejects(read('eth_getTransactionReceipt', ['0x' + key], options()), /TIMEOUT/);
  const controllers = [new AbortController(), new AbortController()];
  const active = controllers.map(controller => read('eth_getTransactionReceipt', ['0x' + key], { signal: controller.signal }).catch(error => error));
  await assert.rejects(read('eth_getTransactionReceipt', ['0x' + key], options()), /BUSY/);
  controllers.forEach(controller => controller.abort());
  assert.ok((await Promise.all(active)).every(error => error.code === 'EVM_TRANSFER_HTTP_ABORTED'));
  await assert.rejects(read('eth_getTransactionReceipt', ['0x' + key], { signal: controllers[0].signal }), /ABORTED/);
});

test('private HTTP bootstrap reuses strict endpoint policy and accepts no new authority/configuration fields', () => {
  const f = originalFixture(), baseline = { chain: 'ethereum', genesisHash: f.genesisHash,
    endpoint: 'https://example.com/rpc', original: f.original };
  for (const patch of [{ endpoint: 'http://example.com/' }, { endpoint: 'https://user:secret@example.com/' },
    { endpoint: 'https://example.com/?key=secret' }, { asset: '12'.repeat(32) }, { signer: {} },
    { headers: { Authorization: 'secret' } }, { transport() {} }])
    assert.throws(() => createHttpEvmNativeTransferObserver({ ...baseline, ...patch }));
  assert.deepEqual(Object.keys(createHttpEvmNativeTransferObserver(baseline)), ['network', 'identity', 'originalIdentity', 'status', 'observe']);
});
