import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { LocalReadOnlyRpc, parseLocalEndpoint, inspectEthereumLocal, inspectBitcoinRegtest, inspectSolanaLocal } from '../../../src/chains/shared/local-rpc.mjs';

async function fixture(t, respond) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    respond(request, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}
function reply(req, res, result) { res.end(JSON.stringify({ jsonrpc: '2.0', id: req.id, result })); }
const genesis = '0x' + 'a'.repeat(64);

test('local endpoint parser refuses SSRF encodings, DNS, credentials and routes', () => {
  for (const bad of ['https://127.0.0.1:1234', 'http://localhost:1234', 'http://127.1:1234', 'http://2130706433:1234', 'http://0x7f000001:1234', 'http://127.0.0.2:1234', 'http://[::ffff:127.0.0.1]:1234', 'http://127.0.0.1:1234@evil.test', 'http://u:p@127.0.0.1:1234', 'http://127.0.0.1:1234/?a=b', 'http://127.0.0.1:1234/#x', 'http://127.0.0.1:1234/wallet/x', 'http://127.0.0.1:1234\\@evil.test', 'http://127.0.0.1:1234\n', 'http://127.0.0.1:65536', 'http://127.0.0.1:0', 'http://127.0.0.1:0123'])
    assert.throws(() => parseLocalEndpoint(bad), { code: 'ENDPOINT_NOT_LITERAL_LOOPBACK' });
  assert.deepEqual(parseLocalEndpoint('http://[::1]:1234/'), { hostname: '::1', port: 1234, path: '/' });
});

test('HTTP fixture: EVM policy matches both local chain ID and independently pinned genesis', async t => {
  const f = await fixture(t, (req, res) => reply(req, res, { eth_chainId: '0x7a69', eth_getBlockByNumber: { hash: genesis }, eth_blockNumber: '0x2' }[req.method]));
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'ethereum' });
  assert.equal((await inspectEthereumLocal(rpc, { expectedGenesisHash: genesis })).blockNumber, '2');
  await assert.rejects(() => inspectEthereumLocal(rpc), { code: 'PINNED_LOCAL_GENESIS_REQUIRED' });
  await assert.rejects(() => inspectEthereumLocal(rpc, { expectedChainId: '0x1', expectedGenesisHash: genesis }), { code: 'LOCAL_EVM_POLICY_REQUIRED' });
  await assert.rejects(() => inspectEthereumLocal(rpc, { expectedGenesisHash: '0x' + 'b'.repeat(64) }), { code: 'WRONG_EVM_GENESIS' });
  assert.equal(new Set(f.requests.map(r => r.id)).size, f.requests.length);
});

test('HTTP fixture: no write method or method from another family is transmitted', async t => {
  const f = await fixture(t, (req, res) => reply(req, res, 'unused'));
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'ethereum' });
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'anvil_setBalance', 'personal_unlockAccount', 'getblockchaininfo', 'toString'])
    await assert.rejects(() => rpc.call(method), { code: 'METHOD_NOT_READ_ONLY_ALLOWLIST' });
  assert.equal(f.requests.length, 0);
});

test('HTTP fixture: Bitcoin requires regtest and validates bounded height', async t => {
  let chain = 'main';
  const f = await fixture(t, (req, res) => reply(req, res, { chain, blocks: 5, bestblockhash: 'a'.repeat(64) }));
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'bitcoin' });
  await assert.rejects(() => inspectBitcoinRegtest(rpc), { code: 'BITCOIN_REGTEST_REQUIRED' });
  chain = 'regtest';
  assert.equal((await inspectBitcoinRegtest(rpc)).environment, 'regtest');
});

test('HTTP fixture: Solana requires expected private local genesis; localhost is insufficient', async t => {
  const localGenesis = '2'.repeat(43);
  const f = await fixture(t, (req, res) => reply(req, res, req.method === 'getGenesisHash' ? localGenesis : 3));
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'solana' });
  await assert.rejects(() => inspectSolanaLocal(rpc), { code: 'PINNED_LOCAL_GENESIS_REQUIRED' });
  await assert.rejects(() => inspectSolanaLocal(rpc, { expectedGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' }), { code: 'PINNED_LOCAL_GENESIS_REQUIRED' });
  await assert.rejects(() => inspectSolanaLocal(rpc, { expectedGenesisHash: '3'.repeat(43) }), { code: 'WRONG_SOLANA_GENESIS' });
  assert.equal((await inspectSolanaLocal(rpc, { expectedGenesisHash: localGenesis })).finalizedSlot, 3);
});

for (const [label, respond, code] of [
  ['redirect', (_req, res) => { res.writeHead(302, { Location: 'https://example.com' }); res.end(); }, 'REDIRECT_REJECTED'],
  ['oversized chunked body', (_req, res) => res.end('x'.repeat(2048)), 'RESPONSE_TOO_LARGE'],
  ['mismatched RPC ID', (_req, res) => res.end(JSON.stringify({ jsonrpc: '2.0', id: 'wrong', result: 1 })), 'INVALID_RPC_ENVELOPE'],
  ['malformed JSON', (_req, res) => res.end('{bad'), 'INVALID_JSON'],
  ['server error omits untrusted message', (req, res) => res.end(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: 1, message: 'SECRET MUST NOT LEAK' } })), 'RPC_REMOTE_ERROR'],
  ['compressed response', (_req, res) => { res.writeHead(200, { 'Content-Encoding': 'gzip' }); res.end('anything'); }, 'ENCODING_REJECTED'],
]) test(`HTTP fixture adversary: ${label}`, async t => {
  const f = await fixture(t, respond);
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'ethereum', maxResponseBytes: 512 });
  await assert.rejects(() => rpc.call('eth_chainId'), { code, message: code });
});

test('HTTP fixture: absolute timeout closes even a server that never replies', async t => {
  const f = await fixture(t, () => {});
  const rpc = new LocalReadOnlyRpc(f.endpoint, { family: 'ethereum', timeoutMs: 50 });
  await assert.rejects(() => rpc.call('eth_chainId'), { code: 'RPC_TIMEOUT' });
});
