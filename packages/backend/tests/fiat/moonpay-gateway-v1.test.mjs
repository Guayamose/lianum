import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, chmod, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createMoonPayGatewayV1, moonPayCheckoutSignatureV1 } from '../../src/fiat/moonpay-gateway-v1.mjs';
import { moonPayWalletV1 } from '../../src/fiat/moonpay-codec-v1.mjs';
import { dispatchMoonPayHttpV1, handleMoonPayHttpV1 } from '../../src/fiat/moonpay-http-v1.mjs';
import { Readable } from 'node:stream';
// Public, inert credentials. No provider or chain network request is performed.
const CONFIG = { enabled: true, environment: 'SANDBOX', publishableKey: 'pk_test_LOCAL_INERT_0123456789', secretKey: 'sk_test_LOCAL_INERT_0123456789', webhookKey: 'wk_test_LOCAL_INERT_0123456789' };
const OWNER = 'a'.repeat(64), OTHER = 'b'.repeat(64), ETH = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
const NOW = 1791828000000;
const currencies = [{ code: 'eur', type: 'fiat', isSellSupported: true }, ...['btc', 'eth', 'sol'].map(code => ({ code, type: 'crypto', isSellSupported: true, isSuspended: false, notAllowedCountries: [] }))];
const countries = [{ alpha2: 'ES', isAllowed: true, isBuyAllowed: true, isSellAllowed: true }];
const request = (extra = {}) => ({ requestId: randomUUID(), flow: 'BUY', asset: 'ETH', network: 'ethereum', fiatCurrency: 'EUR', amount: '100.00', walletAddress: ETH, ...extra });
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
function provider(order, status = 'pending', extra = {}) {
  const sell = order.flow === 'SELL';
  return { id: '9020fd02-42ac-497f-8b5f-41fdf4dd0b1d', externalTransactionId: order.id, externalCustomerId: OWNER,
    createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW + 1000).toISOString(), status,
    baseCurrencyAmount: Number(order.amount), quoteCurrencyAmount: sell ? 300 : 0.001,
    feeAmount: 1, networkFeeAmount: sell ? undefined : 0.1,
    ...(sell ? { baseCurrency: { type: 'crypto', code: order.asset.toLowerCase() }, quoteCurrency: { type: 'fiat', code: 'eur' }, refundWalletAddress: order.walletAddress, depositHash: '0x' + '1'.repeat(64) }
      : { currency: { type: 'crypto', code: order.asset.toLowerCase() }, baseCurrency: { type: 'fiat', code: 'eur' }, walletAddress: order.walletAddress, cryptoTransactionId: '0x' + '1'.repeat(64) }), ...extra };
}
function webhook(order, type = 'transaction_updated', extra = {}) { return Buffer.from(JSON.stringify({ type, data: { id: '9020fd02-42ac-497f-8b5f-41fdf4dd0b1d', externalTransactionId: order.id, externalCustomerId: OWNER, status: 'completed', ...extra } })); }
function signature(raw, time = NOW) { const t = String(Math.floor(time / 1000)); return 't=' + t + ',s=' + createHmac('sha256', CONFIG.webhookKey).update(t + '.').update(raw).digest('hex'); }
async function fixture(t, handler = () => null, config = CONFIG) {
  const parent = await mkdtemp(join(tmpdir(), 'lianum-fiat-inert-')); await chmod(parent, 0o700); const directory = join(parent, 'orders'); let clock = NOW, calls = 0;
  const fetchImpl = async (url, options) => { calls++; const parsed = new URL(url); assert.equal(parsed.origin, 'https://api.moonpay.com'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(parsed.searchParams.get('apiKey'), config.publishableKey); assert.equal(options.headers.Authorization, undefined);
    if (parsed.pathname === '/v3/currencies') return response(currencies);
    if (parsed.pathname === '/v3/countries') return response(countries);
    const value = await handler(parsed, options); return value instanceof Response ? value : response(value); };
  const gateway = await createMoonPayGatewayV1({ configuration: config, directory, fetchImpl, now: () => clock });
  t.after(async () => { await gateway.close(); await rm(parent, { recursive: true, force: true }); });
  return { gateway, directory, fetchImpl, setClock(value) { clock = value; }, calls: () => calls };
}
test('disabled without merchant credentials: no store/network/checkout', async () => {
  let calls = 0; const gateway = await createMoonPayGatewayV1({ configuration: { enabled: true, environment: 'PRODUCTION' }, fetchImpl() { calls++; throw Error('network forbidden'); } });
  assert.equal(gateway.capabilities().configured, false); assert.equal(gateway.capabilities().buy, false);
  await assert.rejects(gateway.createSession(OWNER, request()), { code: 'FIAT_NOT_CONFIGURED' }); assert.equal(calls, 0); await gateway.close();
});
test('official MoonPay signing vector, including leading ? and base64 +/ escaping', () => {
  // dev.moonpay.com/widget/on-ramp/customization/url-signing public documentation vector.
  const query = '?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
  assert.equal(moonPayCheckoutSignatureV1('sk_test_DocsVector00', query), 'oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=');
});
test('currency/network/address gates reject regtest, wrong BTC environment and amount precision', async t => {
  const f = await fixture(t);
  assert.equal(moonPayWalletV1('BTC', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'PRODUCTION'), 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  assert.equal(moonPayWalletV1('BTC', 'tb1q45h8zexwztmz3nyd8gmkxhpavdsva4znwwhzvs', 'SANDBOX'), 'tb1q45h8zexwztmz3nyd8gmkxhpavdsva4znwwhzvs');
  assert.throws(() => moonPayWalletV1('BTC', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'SANDBOX'), { code: 'FIAT_WALLET_NETWORK_MISMATCH' });
  assert.throws(() => moonPayWalletV1('BTC', 'bcrt1q45h8zexwztmz3nyd8gmkxhpavdsva4znwwhzvs', 'PRODUCTION'), { code: 'FIAT_WALLET_NETWORK_MISMATCH' });
  assert.throws(() => moonPayWalletV1('BTC', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5', 'PRODUCTION'), { code: 'FIAT_WALLET_INVALID' });
  for (const extra of [{ network: 'solana' }, { fiatCurrency: 'USD' }, { asset: 'PALT' }, { amount: '100.001' }, { walletAddress: '0x' + '0'.repeat(40) }, { signature: 'caller' }]) await assert.rejects(f.gateway.createSession(OWNER, request(extra)));
  assert.equal(f.calls(), 0);
});
test('BUY/SELL URLs fix original request, signature last, durable idempotency and private owner binding', async t => {
  const f = await fixture(t), input = request(), buy = await f.gateway.createSession(OWNER, input), url = new URL(buy.checkoutUrl);
  assert.equal(url.origin, 'https://buy-sandbox.moonpay.com'); assert.equal(url.searchParams.get('currencyCode'), 'eth'); assert.equal(url.searchParams.get('baseCurrencyCode'), 'eur'); assert.equal(url.searchParams.get('baseCurrencyAmount'), '100'); assert.equal(url.searchParams.get('walletAddress'), ETH.toLowerCase()); assert.equal(url.searchParams.get('lockAmount'), 'true');
  const sig = url.searchParams.get('signature'); assert.ok(url.search.endsWith('&signature=' + encodeURIComponent(sig))); url.searchParams.delete('signature'); assert.equal(sig, moonPayCheckoutSignatureV1(CONFIG.secretKey, url.search));
  assert.equal(buy.chain, 'ETHEREUM_SEPOLIA'); assert.equal(buy.expiresAt, null); assert.equal(buy.privateBalanceCredited, false);
  const calls = f.calls(); assert.deepEqual(await f.gateway.createSession(OWNER, input), buy); assert.equal(f.calls(), calls);
  await assert.rejects(f.gateway.createSession(OWNER, { ...input, amount: '101' }), { code: 'FIAT_ORDER_CONFLICT' });
  await assert.rejects(f.gateway.getOrder(OTHER, buy.id), { code: 'FIAT_ORDER_NOT_FOUND' });
  const sell = await f.gateway.createSession(OWNER, request({ flow: 'SELL', amount: '0.01' })), sellUrl = new URL(sell.checkoutUrl);
  assert.equal(sellUrl.origin, 'https://sell-sandbox.moonpay.com'); assert.equal(sellUrl.searchParams.get('refundWalletAddress'), ETH.toLowerCase()); assert.equal(sellUrl.searchParams.get('quoteCurrencyCode'), 'eur'); assert.equal(sellUrl.searchParams.get('baseCurrencyAmount'), '0.01');
  const saved = await readFile(join(f.directory, 'orders.json'), 'utf8'); assert.ok(!saved.includes(CONFIG.secretKey) && !saved.includes(CONFIG.webhookKey) && !saved.includes('checkoutUrl'));
  assert.equal((await stat(f.directory)).mode & 0o777, 0o700); assert.equal((await stat(join(f.directory, 'orders.json'))).mode & 0o777, 0o600);
  await f.gateway.close(); const reopened = await createMoonPayGatewayV1({ configuration: CONFIG, directory: f.directory, fetchImpl: f.fetchImpl, now: () => NOW }); assert.deepEqual(await reopened.createSession(OWNER, input), buy); await reopened.close();
});
test('signed raw webhook is authenticated before JSON: tamper/stale/future cannot query or change status', async t => {
  const f = await fixture(t), order = await f.gateway.createSession(OWNER, request()), bytes = webhook(order), before = f.calls();
  await assert.rejects(f.gateway.receiveWebhook(Buffer.concat([bytes, Buffer.from(' ')]), signature(bytes)), { code: 'FIAT_WEBHOOK_SIGNATURE_INVALID' });
  await assert.rejects(f.gateway.receiveWebhook(bytes, signature(bytes, NOW - 301000)), { code: 'FIAT_WEBHOOK_EXPIRED' });
  await assert.rejects(f.gateway.receiveWebhook(bytes, signature(bytes, NOW + 301000)), { code: 'FIAT_WEBHOOK_EXPIRED' });
  assert.equal(f.calls(), before); assert.equal((await f.gateway.getOrder(OWNER, order.id)).status, 'CHECKOUT_READY');
});
test('webhook says completed but query says pending; only fixed authenticated query installs provider DATA', async t => {
  let current; const f = await fixture(t, () => [current]), order = await f.gateway.createSession(OWNER, request()); current = provider(order, 'pending');
  const bytes = webhook(order), first = await f.gateway.receiveWebhook(bytes, signature(bytes)); assert.equal(first.duplicate, false); assert.equal(first.reconciliation, 'QUERIED');
  const state = await f.gateway.getOrder(OWNER, order.id); assert.equal(state.status, 'PROVIDER_PENDING'); assert.equal(state.chainConfirmation, 'UNVERIFIED'); assert.equal(state.privateBalanceCredited, false);
  await f.gateway.close(); const reopened = await createMoonPayGatewayV1({ configuration: CONFIG, directory: f.directory, fetchImpl: f.fetchImpl, now: () => NOW });
  const duplicate = await reopened.receiveWebhook(bytes, signature(bytes)); assert.equal(duplicate.duplicate, true); assert.equal(JSON.parse(await readFile(join(f.directory, 'orders.json'), 'utf8')).webhooks.length, 1); await reopened.close();
});
test('completed provider response remains chain UNVERIFIED, wrong recipient/currency/owner rejected and duplicates UNKNOWN', async t => {
  let current; const f = await fixture(t, () => current), order = await f.gateway.createSession(OWNER, request()); current = provider(order, 'completed');
  const result = await f.gateway.reconcileOrder(OWNER, order.id); assert.equal(result.status, 'PROVIDER_COMPLETED'); assert.equal(result.privateBalanceCredited, false); assert.equal(result.chainConfirmation, 'UNVERIFIED'); assert.equal(result.receivedAmount, '0.001');
  for (const fields of [{ walletAddress: '0x' + '2'.repeat(40) }, { externalCustomerId: OTHER }, { externalTransactionId: randomUUID() }, { currency: { type: 'crypto', code: 'eth_arbitrum' } }, { baseCurrencyAmount: 101 }]) { current = provider(order, 'completed', fields); await assert.rejects(f.gateway.reconcileOrder(OWNER, order.id)); }
  current = [provider(order), provider(order, 'pending', { id: randomUUID() })]; await assert.rejects(f.gateway.reconcileOrder(OWNER, order.id), { code: 'FIAT_ORDER_AMBIGUOUS' }); assert.equal((await f.gateway.getOrder(OWNER, order.id)).status, 'UNKNOWN');
});
test('unavailable query after valid webhook is durably pending and can be queried again without financial POST', async t => {
  let order; const f = await fixture(t, () => { throw Error('private network exception must not leak'); }); order = await f.gateway.createSession(OWNER, request());
  const result = await f.gateway.receiveWebhook(webhook(order), signature(webhook(order))); assert.equal(result.reconciliation, 'PENDING'); assert.equal((await f.gateway.getOrder(OWNER, order.id)).status, 'CHECKOUT_READY');
});
test('close aborts and drains existing provider GET, then refuses new requests', async t => {
  let start; const started = new Promise(resolve => { start = resolve; });
  const f = await fixture(t, (_url, options) => new Promise((_resolve, reject) => { start(); options.signal.addEventListener('abort', () => reject(Error('aborted'))); }));
  const order = await f.gateway.createSession(OWNER, request()), work = f.gateway.reconcileOrder(OWNER, order.id); await started; const reject = assert.rejects(work); await f.gateway.close(); await reject;
  await assert.rejects(f.gateway.getOrder(OWNER, order.id), { code: 'FIAT_GATEWAY_CLOSED' }); assert.ok(!(await readdir(f.directory)).includes('writer.lock'));
});
test('HTTP adapter never takes owner from body, routes raw webhook separately and uses only finite errors', async t => {
  const f = await fixture(t); await assert.rejects(dispatchMoonPayHttpV1('POST', '/v1/fiat/sessions', request(), null, f.gateway), { code: 'FIAT_OWNER_REQUIRED' });
  const invalid = await f.gateway.createSession(OWNER, request()), bytes = webhook(invalid), input = Readable.from([bytes]); input.method = 'POST'; input.url = '/v1/fiat/moonpay/webhook'; input.headers = { 'content-type': 'application/json', 'moonpay-signature-v2': 'invalid' };
  let value, status; const output = { writeHead(code) { status = code; }, end(text) { value = JSON.parse(text); } }; await handleMoonPayHttpV1(input, output, { gateway: f.gateway }); assert.equal(status, 403); assert.deepEqual(value, { error: 'FIAT_WEBHOOK_SIGNATURE_INVALID' });
});
test('private store fails closed on unsafe directory, symlink and other account/environment', async t => {
  const f = await fixture(t); await f.gateway.close(); await chmod(f.directory, 0o755);
  await assert.rejects(createMoonPayGatewayV1({ configuration: CONFIG, directory: f.directory, fetchImpl: f.fetchImpl }), { code: 'FIAT_STORE_UNSAFE' }); await chmod(f.directory, 0o700);
  const alias = f.directory + '-alias'; await symlink(f.directory, alias);  await assert.rejects(createMoonPayGatewayV1({ configuration: CONFIG, directory: alias, fetchImpl: f.fetchImpl }), { code: 'FIAT_STORE_UNSAFE' });
  await assert.rejects(createMoonPayGatewayV1({ configuration: { ...CONFIG, publishableKey: 'pk_test_DIFFERENT_INERT_012345' }, directory: f.directory, fetchImpl: f.fetchImpl }), { code: 'FIAT_STORE_BINDING' }); await rm(alias);
});

test('SELL deposit is authenticated webhook + exact queried order, fresh15s, expiry/memo/status gates', async t => {
  let current; const f = await fixture(t, () => [current]), order = await f.gateway.createSession(OWNER, request({ flow: 'SELL', amount: '0.01' }));
  const quoteExpiresAt = new Date(NOW + 60000).toISOString(), destination = '0x' + '3'.repeat(40);
  current = provider(order, 'waitingForDeposit', { quoteExpiresAt });
  assert.equal((await f.gateway.reconcileOrder(OWNER, order.id)).deposit, null); // REST/redirect alone has no trusted address.
  const data = { baseCurrencyAmount: 0.01, baseCurrency: { type: 'crypto', code: 'eth' }, quoteCurrency: { type: 'fiat', code: 'eur' }, quoteExpiresAt, updatedAt: current.updatedAt, depositWallet: { walletAddress: destination, walletAddressTag: null } };
  const raw = webhook(order, 'sell_transaction_created', data); await f.gateway.receiveWebhook(raw, signature(raw));
  assert.deepEqual((await f.gateway.getOrder(OWNER, order.id)).deposit, { address: destination, amountAtomic: '10000000000000000', networkId: 'ethereum-sepolia', expiresAt: NOW + 15000 });
  const calls = f.calls(); assert.equal((await f.gateway.receiveWebhook(raw, signature(raw))).duplicate, true); assert.equal(f.calls(), calls); // replay never causes another provider query.
  f.setClock(NOW + 15001); assert.equal((await f.gateway.getOrder(OWNER, order.id)).deposit, null);
  const fresh = await f.gateway.reconcileOrder(OWNER, order.id); assert.equal(fresh.deposit.expiresAt, NOW + 30001);
  current = provider(order, 'pending', { quoteExpiresAt, updatedAt: new Date(NOW + 20000).toISOString() }); assert.equal((await f.gateway.reconcileOrder(OWNER, order.id)).deposit, null);
  const tagged = webhook(order, 'sell_transaction_updated', { ...data, depositWallet: { walletAddress: destination, walletAddressTag: 'memo' } }); await assert.rejects(f.gateway.receiveWebhook(tagged, signature(tagged)), { code: 'FIAT_DEPOSIT_UNSUPPORTED' });
});
test('SELL expired, changed timestamp and wrong providerId/amount cannot publish a deposit', async t => {
  let current; const f = await fixture(t, () => [current]), order = await f.gateway.createSession(OWNER, request({ flow: 'SELL', amount: '0.01' }));
  const quoteExpiresAt = new Date(NOW + 30000).toISOString(), destination = '0x' + '3'.repeat(40);
  current = provider(order, 'waitingForDeposit', { quoteExpiresAt });
  const data = { baseCurrencyAmount: 0.01, baseCurrency: { type: 'crypto', code: 'eth' }, quoteCurrency: { type: 'fiat', code: 'eur' }, quoteExpiresAt, updatedAt: current.updatedAt, depositWallet: { walletAddress: destination, walletAddressTag: '' } };
  const wrongAmount = webhook(order, 'sell_transaction_created', { ...data, baseCurrencyAmount: 0.02 }); await assert.rejects(f.gateway.receiveWebhook(wrongAmount, signature(wrongAmount)), { code: 'FIAT_ORDER_BINDING' });
  const raw = webhook(order, 'sell_transaction_created', data); await f.gateway.receiveWebhook(raw, signature(raw));
  current = provider(order, 'waitingForDeposit', { quoteExpiresAt, updatedAt: new Date(NOW + 2000).toISOString() }); assert.equal((await f.gateway.reconcileOrder(OWNER, order.id)).deposit, null);
  f.setClock(NOW + 30001); assert.equal((await f.gateway.reconcileOrder(OWNER, order.id)).deposit, null);
});
