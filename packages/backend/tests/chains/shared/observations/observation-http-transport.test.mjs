/** Actual loopback HTTP transport tests, with synthetic RPC payloads only.
 * No public network, private key, transaction broadcast, native node or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { parseObservationJson, createEvmHttpObservationTransport, createTronHttpObservationTransport }
  from '../../../../src/chains/shared/observations/observation-http-transport.mjs';

const hash = '0x' + '12'.repeat(32), evmAddress = '0x' + '34'.repeat(20), tronAddress = '41' + '56'.repeat(20);
const options = () => ({ signal: new AbortController().signal });
function json(response, value) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); }
async function server(t, handler) {
  const calls = [];
  const instance = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const call = { path: request.url, method: request.method, headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString()) }; calls.push(call);
    handler(call, response, request);
  });
  instance.listen(0, '127.0.0.1'); await once(instance, 'listening');
  t.after(() => new Promise(resolve => { instance.closeAllConnections(); instance.close(resolve); }));
  return { calls, endpoint: `http://127.0.0.1:${instance.address().port}/` };
}

test('lossless JSON preserves bare Tron int64 numbers and does not assign prototypes', () => {
  const parsed = parseObservationJson('{"balance":9007199254740993,"max":9223372036854775807,"zero":0,"flag":false,"list":[1,null,"2"],"__proto__":{"x":1}}', { numericTokens: true });
  assert.equal(parsed.balance, '9007199254740993'); assert.equal(parsed.max, '9223372036854775807');
  assert.equal(parsed.zero, '0'); assert.equal(parsed.flag, false); assert.deepEqual(parsed.list, ['1', null, '2']);
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype); assert.equal(parsed.x, undefined);
  assert.equal(Object.hasOwn(parsed, '__proto__'), true); assert.equal({}.x, undefined);
  assert.equal(parseObservationJson('"\\\"quoted\\ntext\\u0041"'), '"quoted\ntextA');
});

test('strict JSON rejects duplicate keys, invalid grammar, unsafe ordinary integers and excessive nesting', () => {
  for (const text of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '[1,]', '{"x":}', '{"x":1,}',
    '{"x" 1}', '[01]', 'true false', '', '"\n"', '"\\x01"', 'undefined', 'NaN', '1e999', '9007199254740993',
    '['.repeat(66) + '0' + ']'.repeat(66)]) assert.throws(() => parseObservationJson(text), /RPC_TRANSPORT_/);
  assert.deepEqual(parseObservationJson('{"a":-1.25e2,"b":true,"c":null}'), { a: -125, b: true, c: null });
});

test('EVM transport sends exact bounded JSON-RPC POSTs and matches a distinct response id', async t => {
  const { endpoint, calls } = await server(t, (call, response) => json(response,
    { jsonrpc: '2.0', id: call.body.id, result: '0x1' }));
  const read = createEvmHttpObservationTransport({ endpoint });
  assert.equal(await read('eth_chainId', [], options()), '0x1');
  await read('eth_getBlockByNumber', ['finalized', false], options());
  await read('eth_getBalance', [evmAddress, { blockHash: hash, requireCanonical: true }], options());
  assert.equal(calls.length, 3); assert.equal(new Set(calls.map(call => call.body.id)).size, 3);
  for (const call of calls) {
    assert.equal(call.path, '/'); assert.equal(call.method, 'POST'); assert.equal(call.body.jsonrpc, '2.0');
    assert.equal(call.headers['accept-encoding'], 'identity'); assert.equal(call.headers.cookie, undefined);
    assert.equal(call.headers.authorization, undefined);
  }
  assert.deepEqual(calls[2].body.params, [evmAddress, { blockHash: hash, requireCanonical: true }]);
});

test('Tron transport uses only solidified fixed paths and raw int64 tokens survive HTTP', async t => {
  const { endpoint, calls } = await server(t, (_call, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"address":"' + tronAddress + '","balance":9007199254740993}');
  });
  const read = createTronHttpObservationTransport({ endpoint });
  assert.equal((await read('/walletsolidity/getaccount', { address: tronAddress, visible: false }, options())).balance, '9007199254740993');
  await read('/walletsolidity/getnowblock', {}, options());
  await read('/walletsolidity/getblockbynum', { num: 0 }, options());
  assert.deepEqual(calls.map(call => call.path), ['/walletsolidity/getaccount', '/walletsolidity/getnowblock', '/walletsolidity/getblockbynum']);
  assert.deepEqual(calls[2].body, { num: 0 });
});

test('methods, weaker selectors, extra fields and accessor/proxy injection reject before HTTP', async t => {
  const { endpoint, calls } = await server(t, (_call, response) => json(response, {}));
  const evm = createEvmHttpObservationTransport({ endpoint }), tron = createTronHttpObservationTransport({ endpoint });
  for (const [method, params] of [
    ['eth_sendRawTransaction', ['0x00']], ['eth_call', []], ['eth_getBalance', [evmAddress, 'latest']],
    ['eth_getBalance', [evmAddress, { blockHash: hash, requireCanonical: false }]],
    ['eth_getBalance', [evmAddress, { blockHash: hash, requireCanonical: true, blockNumber: '0x1' }]],
    ['eth_getBlockByNumber', ['latest', false]], ['eth_getBlockByNumber', ['safe', false]],
    ['eth_getBlockByNumber', ['0x1', true]], ['eth_chainId', [1]],
  ]) await assert.rejects(evm(method, params, options()));
  for (const [path, body] of [['/wallet/getaccount', { address: tronAddress, visible: false }],
    ['/wallet/broadcasttransaction', {}], ['/walletsolidity/getaccount?path=bad', {}],
    ['/walletsolidity/getaccount', { address: tronAddress, visible: false, endpoint }],
    ['/walletsolidity/getaccount', { address: tronAddress, visible: true }],
    ['/walletsolidity/getnowblock', { num: 1 }], ['/walletsolidity/getblockbynum', { num: 1 }]])
    await assert.rejects(tron(path, body, options()));
  let touched = false;
  const array = []; Object.defineProperty(array, '0', { enumerable: true, get() { touched = true; return 'finalized'; } }); array[1] = false;
  await assert.rejects(evm('eth_getBlockByNumber', array, options()));
  await assert.rejects(evm('eth_chainId', new Proxy([], { get() { touched = true; } }), options()));
  await assert.rejects(tron('/walletsolidity/getaccount', { get address() { touched = true; }, visible: false }, options()));
  await assert.rejects(evm('eth_chainId', [], { signal: Object.create(AbortSignal.prototype) }));
  assert.equal(touched, false); assert.equal(calls.length, 0);
});

test('bootstrap permits canonical HTTPS or explicit loopback and forbids credentials/queries/alternate origins', () => {
  for (const endpoint of ['http://example.com/', 'http://localhost:80/', 'ftp://example.com/', 'https://user:secret@example.com/',
    'https://example.com/?token=secret', 'https://example.com/#fragment', 'https://example.com', ' https://example.com/',
    'http://127.0.0.1:80/', 'http://2130706433/', 'https://EXAMPLE.com/'])
    assert.throws(() => createEvmHttpObservationTransport({ endpoint }), /RPC_TRANSPORT_ENDPOINT/);
  assert.throws(() => createTronHttpObservationTransport({ endpoint: 'https://example.com/walletsolidity/' }));
  assert.equal(typeof createEvmHttpObservationTransport({ endpoint: 'https://example.com/rpc' }), 'function');
  assert.equal(typeof createTronHttpObservationTransport({ endpoint: 'https://example.com/' }), 'function');
  for (const extra of [{ headers: { Authorization: 'secret' } }, { timeoutMs: 0 }, { timeoutMs: 60001 },
    { maxResponseBytes: 100 }, { maxResponseBytes: 16777217 }, { fetch() {} }])
    assert.throws(() => createEvmHttpObservationTransport({ endpoint: 'https://example.com/', ...extra }));
});

test('HTTP/JSON-RPC failures are sanitized and never retried or redirected', async t => {
  const canary = await server(t, (_call, response) => json(response, {}));
  const behaviors = [
    (call, response) => json(response, { jsonrpc: '2.0', id: 'wrong', result: '0x1' }),
    (call, response) => json(response, { jsonrpc: '1.0', id: call.body.id, result: '0x1' }),
    (call, response) => json(response, { jsonrpc: '2.0', id: call.body.id, error: { message: 'secret endpoint detail' } }),
    (call, response) => json(response, { jsonrpc: '2.0', id: call.body.id, result: '0x1', error: null }),
    (_call, response) => { response.writeHead(307, { Location: canary.endpoint }); response.end(); },
    (_call, response) => { response.writeHead(429, { 'Content-Type': 'application/json' }); response.end('{"error":"secret"}'); },
    (_call, response) => { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('{}'); },
    (_call, response) => { response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); response.end('{}'); },
    (_call, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{invalid'); },
    (_call, response) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(Buffer.from([0xff])); },
    (_call, response) => { response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' }); response.end('{}'); },
    (call, response) => { response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"jsonrpc":"2.0","id":"' + call.body.id + '","result":"0x1","result":"0x2"}'); },
  ];
  let index = 0;
  const fixture = await server(t, (call, response) => behaviors[index++](call, response));
  const read = createEvmHttpObservationTransport({ endpoint: fixture.endpoint });
  for (let count = 0; count < behaviors.length; count++) await assert.rejects(read('eth_chainId', [], options()), error => {
    assert.match(error.message, /^[A-Z_]+$/); assert.equal(error.message.includes('secret'), false); return true;
  });
  assert.equal(fixture.calls.length, behaviors.length); assert.equal(canary.calls.length, 0);
});

test('declared and streaming response limits bound memory and do not retry', async t => {
  let count = 0;
  const fixture = await server(t, (_call, response) => {
    if (++count === 1) { response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '99999999' }); response.end(); }
    else { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write(' '.repeat(1100)); response.end('{}'); }
  });
  const read = createEvmHttpObservationTransport({ endpoint: fixture.endpoint, maxResponseBytes: 1024 });
  for (let iteration = 0; iteration < 2; iteration++) await assert.rejects(read('eth_chainId', [], options()), /RESPONSE_LIMIT/);
  assert.equal(fixture.calls.length, 2);
});

test('timeout, caller abort, pre-abort and concurrency limits close outstanding work', async t => {
  const fixture = await server(t, () => {});
  const read = createEvmHttpObservationTransport({ endpoint: fixture.endpoint, timeoutMs: 100 });
  await assert.rejects(read('eth_chainId', [], options()), /TIMEOUT/);
  const controller = new AbortController(), pending = read('eth_chainId', [], { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /ABORTED/);
  const before = fixture.calls.length;
  await assert.rejects(read('eth_chainId', [], { signal: controller.signal }), /ABORTED/);
  assert.equal(fixture.calls.length, before);
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const active = controllers.map(controller => read('eth_chainId', [], { signal: controller.signal }).catch(error => error));
  await assert.rejects(read('eth_chainId', [], options()), /BUSY/);
  controllers.forEach(controller => controller.abort());
  assert.ok((await Promise.all(active)).every(error => error.code === 'RPC_TRANSPORT_ABORTED'));
});

test('Tron application errors and non-object responses reject with no response detail leak', async t => {
  const bodies = [{ Error: 'secret' }, { error: 'secret' }, [], null];
  const fixture = await server(t, (_call, response) => json(response, bodies.shift()));
  const read = createTronHttpObservationTransport({ endpoint: fixture.endpoint });
  for (let count = 0; count < 4; count++) await assert.rejects(read('/walletsolidity/getnowblock', {}, options()), error => {
    assert.equal(error.message.includes('secret'), false); return true;
  });
});
