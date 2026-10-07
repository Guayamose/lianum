import test from 'node:test';
import assert from 'node:assert/strict';
import { createTronNativeTransferHttpReader as reader, createHttpTronNativeTransferObserver as create }
  from '../../../../src/chains/tron/transfers/tron-native-transfer-http.mjs';
import { fixtureHttp, fixture, serve, respond, signal, NOW } from '../../../fixtures/chains/tron/transfers/tron-native-transfer-fixture.mjs';
const path = '/walletsolidity/gettransactioninfobyid';

test('complete concrete HTTP observation uses only fixed SolidityNode reads and exact original identity', async t => {
  const f = await fixtureHttp(t), observer = create({ chain: 'tron', genesisHash: f.genesisHash,
    endpoint: f.endpoint, original: f.original, now: () => NOW });
  assert.equal(f.packets.length, 0);
  const result = await observer.observe(f.query); assert.equal(result.status, 'observed'); assert.equal(f.packets.length, 12);
  assert.equal(result.evidence.receipt.feeSun, '9007199254740993');
  for (const packet of f.packets) {
    assert.equal(packet.method, 'POST'); assert.equal(packet.headers.authorization, undefined); assert.equal(packet.headers.cookie, undefined);
    assert.equal(packet.headers['accept-encoding'], 'identity');
    assert.ok(['/walletsolidity/getnowblock', '/walletsolidity/getblockbynum', '/walletsolidity/gettransactionbyid', path].includes(packet.path));
    if (packet.path.includes('transaction')) assert.deepEqual(packet.body, { value: f.query.nativeId });
  }
});

test('numeric JSON receipt tokens and outgoing int63 block heights preserve exact bytes', async t => {
  const f = fixture(), local = await serve(t, (_packet, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"fee":9007199254740993}');
  });
  const read = reader({ endpoint: local.endpoint, nativeId: f.query.nativeId });
  assert.deepEqual(await read(path, { value: f.query.nativeId }, signal()), { fee: '9007199254740993' });
  await read('/walletsolidity/getblockbynum', { num: '9223372036854775807' }, signal());
  assert.equal(local.packets[1].raw, '{"num":9223372036854775807}');
});

test('reader denies arbitrary RPC, full-node fallback, retargeting and hostile input without HTTP', async t => {
  const f = fixture(), local = await serve(t, (_p, res) => respond(res, {})), read = reader({ endpoint: local.endpoint, nativeId: f.query.nativeId });
  for (const [route, body] of [['/wallet/broadcasttransaction', {}], ['/wallet/gettransactionbyid', { value: f.query.nativeId }],
    ['/walletsolidity/getaccount', { address: f.signed.ownerAddress, visible: false }], [path, { value: 'a'.repeat(64) }],
    [path, { value: f.query.nativeId, visible: true }], ['/walletsolidity/getnowblock', { num: '1' }],
    ['/walletsolidity/getblockbynum', { num: 0 }], ['/walletsolidity/getblockbynum', { num: '01' }],
    ['/walletsolidity/getblockbynum', { num: '9223372036854775808' }]]) await assert.rejects(read(route, body, signal()));
  let touched = 0; const getter = {}; Object.defineProperty(getter, 'value', { enumerable: true, get() { touched++; return f.query.nativeId; } });
  for (const body of [getter, new Proxy({ value: f.query.nativeId }, {}), Object.create({ value: f.query.nativeId })]) await assert.rejects(read(path, body, signal()));
  await assert.rejects(read(path, { value: f.query.nativeId }, { signal: Object.create(AbortSignal.prototype) }));
  assert.equal(local.packets.length, 0); assert.equal(touched, 0);
  for (const endpoint of ['http://example.com/', 'http://localhost:1234/', 'https://node.example/rpc', 'https://a:b@node.example/',
    'https://node.example/?key=x', 'https://node.example/#x']) assert.throws(() => reader({ endpoint, nativeId: f.query.nativeId }));
});

test('HTTP errors and redirects never retry or reach a redirect target; error bodies stay private', async t => {
  const f = fixture(), canary = await serve(t, (_p, res) => respond(res, {})); let index = 0;
  const behaviors = [(_p, res) => { res.writeHead(307, { Location: canary.endpoint }); res.end(); },
    (_p, res) => { res.writeHead(429); res.end(); }, (_p, res) => respond(res, { Error: 'PRIVATE_RPC_CANARY' }),
    (_p, res) => respond(res, { error: null }), (_p, res) => respond(res, null)];
  const local = await serve(t, (p, res) => behaviors[index++](p, res)), read = reader({ endpoint: local.endpoint, nativeId: f.query.nativeId });
  for (const _ of behaviors) await assert.rejects(read(path, { value: f.query.nativeId }, signal()), error => {
    assert.match(error.message, /^[A-Z_]+$/); assert.doesNotMatch(error.message, /PRIVATE_RPC_CANARY/); return true;
  });
  assert.equal(local.packets.length, behaviors.length); assert.equal(canary.packets.length, 0);
});

test('response bounds, duplicate keys, malformed UTF8, compression and truncated payloads fail closed', async t => {
  const f = fixture(); let index = 0;
  const behaviors = [res => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '99999999' }); res.end(); },
    res => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(' '.repeat(1200)); },
    res => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' }); res.end('{}'); },
    res => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(Buffer.from([0xff])); },
    res => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('{}'); },
    res => { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); res.end('{}'); },
    res => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"id":"a","id":"b"}'); }];
  const local = await serve(t, (_p, res) => behaviors[index++](res)), read = reader({ endpoint: local.endpoint, nativeId: f.query.nativeId, maxResponseBytes: 1024 });
  for (const _ of behaviors) await assert.rejects(read(path, { value: f.query.nativeId }, signal()));
  assert.equal(local.packets.length, behaviors.length);
});

test('abort, per-request deadline and concurrent-request bound fail without fallback', async t => {
  const f = fixture(); let entered; const ready = new Promise(resolve => entered = resolve);
  const local = await serve(t, () => entered()), read = reader({ endpoint: local.endpoint, nativeId: f.query.nativeId, timeoutMs: 50 });
  const control = new AbortController(); const aborted = read(path, { value: f.query.nativeId }, { signal: control.signal });
  await ready; control.abort(); await assert.rejects(aborted, /ABORTED/);
  const first = read(path, { value: f.query.nativeId }, signal()), second = read(path, { value: f.query.nativeId }, signal());
  const settled = Promise.allSettled([first, second]);
  await assert.rejects(read(path, { value: f.query.nativeId }, signal()), /BUSY/);
  for (const result of await settled) { assert.equal(result.status, 'rejected'); assert.match(result.reason.message, /TIMEOUT/); }
});
