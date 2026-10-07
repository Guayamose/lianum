/** Public immutable synthetic wire from the active binder's independently
 * checked fixture. No signing primitive, private material, native runtime. */
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { decodeTronNativeTransferWire } from '../../../../../src/chains/tron/transfers/tron-native-transfer-wire.mjs';
export const WIRE = '0a85010a02c1452208c56bd8a3b3341d9d40e0c4d086a6375a67080112630a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412320a15417e5f4552091a69125d5dfcb7b8c2659029395bdf121541353535353535353535353535353535353535353518d1a54c7080f0cc86a637124179be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179826fa509ec12503e09fb669a93c8e2c880906efa7b011e36065b391bc2e20c65801';
export const NOW = 1900000030000;
export const blockId = (height, byte = 'a') => BigInt(height).toString(16).padStart(16, '0') + byte.repeat(48);
export const block = (height, timestampMs, byte = 'a') => ({ blockID: blockId(height, byte), block_header: {
  raw_data: { number: String(height), timestamp: String(timestampMs), parentHash: blockId(BigInt(height) - 1n, 'b') } } });
export function fixture() {
  const signed = decodeTronNativeTransferWire(WIRE);
  const keys = ['nativeId', 'transactionSHA256', 'ownerAddress', 'recipientAddress', 'amountSun', 'refBlockBytes', 'refBlockHash',
    'timestampMs', 'expirationMs', 'wireKeyCommitment'];
  const original = { nativeWire: WIRE, expected: Object.fromEntries(keys.map(key => [key, signed[key]])) };
  const transaction = { txID: signed.nativeId, raw_data_hex: signed.rawDataHex,
    signature: [signed.signature.r + signed.signature.s + '0' + signed.signature.v], ret: [{ contractRet: 'SUCCESS' }] };
  const genesisHash = blockId(0, '1'), genesis = { blockID: genesisHash, block_header: { raw_data: {} } };
  const state = { transaction, info: { id: signed.nativeId, blockNumber: '10', blockTimeStamp: String(NOW - 10000),
    fee: '9007199254740993', receipt: { net_usage: '267' } },
    included: { ...block(10, NOW - 10000), transactions: [{ txID: 'f'.repeat(64) }, structuredClone(transaction)] },
    solid: block(12, NOW), extraBlocks: new Map(), genesis, now: NOW, read: null };
  const calls = [];
  const transport = async (path, body, options) => {
    calls.push({ path, body: structuredClone(body), signal: options?.signal });
    let value;
    if (path === '/walletsolidity/gettransactionbyid') value = state.transaction;
    else if (path === '/walletsolidity/gettransactioninfobyid') value = state.info;
    else if (path === '/walletsolidity/getnowblock') value = state.solid;
    else if (path === '/walletsolidity/getaccount') value = { address: body.address, balance: '9007199254740993' };
    else if (path === '/walletsolidity/getblockbynum') value = String(body.num) === '0' ? state.genesis
      : String(body.num) === String(state.included.block_header.raw_data.number) ? state.included
        : String(body.num) === String(state.solid.block_header.raw_data.number) ? state.solid : state.extraBlocks.get(String(body.num));
    else throw new Error('FIXTURE_FORBIDDEN_METHOD');
    if (state.read) value = await state.read(path, body, value, calls.length);
    return structuredClone(value);
  };
  return { signed, original, genesisHash, state, calls, transport,
    config: { chain: 'tron', genesisHash, original, transport, now: () => state.now },
    query: { nativeId: signed.nativeId } };
}
export async function serve(t, handler) {
  const packets = [];
  const server = createServer(async (req, res) => {
    try {
      const parts = []; for await (const part of req) parts.push(part);
      const raw = Buffer.concat(parts).toString('utf8');
      const packet = { path: req.url, method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : null, raw };
      packets.push(packet); await handler(packet, res);
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { endpoint: `http://127.0.0.1:${server.address().port}/`, packets };
}
export const respond = (res, body) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
export const signal = () => ({ signal: new AbortController().signal });
export async function fixtureHttp(t, f = fixture()) {
  const local = await serve(t, async (packet, res) => respond(res, await f.transport(packet.path, packet.body, signal())));
  return { ...f, ...local, networkConfig: { networks: [{ chain: 'tron', genesisHash: f.genesisHash, endpoint: local.endpoint }],
    accounts: [{ chain: 'tron', address: f.signed.ownerAddress }] } };
}
export function http(app, path = '/api/wallet/state', authenticated = true, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, app.origin), { method, agent: false,
      headers: { Origin: app.origin, ...(authenticated ? { 'x-wallet-owner-token': app.ownerAccess.token } : {}) } }, res => {
      const parts = []; res.on('data', part => parts.push(part)); res.on('end', () => {
        const text = Buffer.concat(parts).toString(); resolve({ status: res.statusCode, text, json: JSON.parse(text) });
      });
    });
    req.on('error', reject); req.end();
  });
}
