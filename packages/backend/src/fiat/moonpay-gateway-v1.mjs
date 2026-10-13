/** MoonPay widget integration. Provider status is DATA, never a private balance or chain proof.
 * Sources: dev.moonpay.com/widget/{on-ramp,off-ramp}/customization/{parameters,url-signing}
 * and dev.moonpay.com/api-reference/widget/{using-the-api,webhooks/signature}.
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { openMoonPayOrderStoreV1 } from './moonpay-order-store-v1.mjs';
import { MOONPAY_ASSETS_V1, needMoonPayV1 as need, failMoonPayV1 as fail, exactMoonPayV1 as exact,
  moonPayOwnerV1, moonPayIdV1, moonPayWalletV1, moonPayAtomicAmountV1, moonPayNativeNetworkIdV1, moonPayProviderDecimalV1, moonPayHashV1, moonPayChainV1, normalizeMoonPaySessionRequestV1 } from './moonpay-codec-v1.mjs';
export const LIANUM_MOONPAY_GATEWAY_V1 = 'LIANUM_MOONPAY_GATEWAY_V1';
const ORIGINS = Object.freeze({ SANDBOX: { BUY: 'https://buy-sandbox.moonpay.com', SELL: 'https://sell-sandbox.moonpay.com' }, PRODUCTION: { BUY: 'https://buy.moonpay.com', SELL: 'https://sell.moonpay.com' } });
const EVENTS = Object.freeze({ transaction_created: 'BUY', transaction_updated: 'BUY', transaction_failed: 'BUY', sell_transaction_created: 'SELL', sell_transaction_updated: 'SELL', sell_transaction_failed: 'SELL', sell_transaction_requote_required: 'SELL' });
const MAX_REPLY = 256 * 1024, MAX_WEBHOOK = 256 * 1024, WEBHOOK_WINDOW = 300000;
const finiteCode = new Set(['FIAT_NOT_CONFIGURED', 'FIAT_FLOW_UNAVAILABLE', 'FIAT_REQUEST_INVALID', 'FIAT_OWNER_REQUIRED', 'FIAT_ID_INVALID', 'FIAT_AMOUNT_INVALID', 'FIAT_WALLET_INVALID', 'FIAT_WALLET_NETWORK_MISMATCH', 'FIAT_ASSET_NETWORK_UNAVAILABLE', 'FIAT_ORDER_NOT_FOUND', 'FIAT_ORDER_CONFLICT', 'FIAT_ORDER_AMBIGUOUS', 'FIAT_ORDER_BINDING', 'FIAT_PROVIDER_RESPONSE_INVALID', 'FIAT_PROVIDER_UNAVAILABLE', 'FIAT_PROVIDER_TIMEOUT', 'FIAT_WEBHOOK_INVALID', 'FIAT_WEBHOOK_SIGNATURE_INVALID', 'FIAT_WEBHOOK_EXPIRED', 'FIAT_WEBHOOK_UNSUPPORTED', 'FIAT_DEPOSIT_UNSUPPORTED', 'FIAT_GATEWAY_CLOSED', 'FIAT_STORE_CAPACITY', 'FIAT_STORE_WRITE_UNCERTAIN', 'FIAT_STORE_CLOSED', 'FIAT_HTTP_BODY_LIMIT', 'FIAT_HTTP_CONTENT_TYPE', 'FIAT_ROUTE_NOT_FOUND']);
export function moonPayPublicFailureCodeV1(error) { return finiteCode.has(error?.code) ? error.code : 'FIAT_REQUEST_REJECTED'; }
function configuration(raw) {
  if (raw === null || raw === undefined) return null;
  need(raw && Object.getPrototypeOf(raw) === Object.prototype, 'FIAT_CONFIGURATION_INVALID');
  const keys = Object.keys(raw); need(keys.every(k => ['enabled', 'environment', 'publishableKey', 'secretKey', 'webhookKey', 'flows'].includes(k)), 'FIAT_CONFIGURATION_INVALID');
  exact(raw, keys); need(typeof raw.enabled === 'boolean', 'FIAT_CONFIGURATION_INVALID');
  if (!raw.enabled) return null;
  if (!raw.publishableKey || !raw.secretKey || !raw.webhookKey) return null;
  need(['SANDBOX', 'PRODUCTION'].includes(raw.environment), 'FIAT_CONFIGURATION_INVALID');
  const prefix = raw.environment === 'SANDBOX' ? 'test' : 'live';
  for (const [name, type] of [['publishableKey', 'pk'], ['secretKey', 'sk'], ['webhookKey', 'wk']]) need(typeof raw[name] === 'string' && new RegExp('^' + type + '_' + prefix + '_[A-Za-z0-9_-]{8,256}$').test(raw[name]), 'FIAT_CONFIGURATION_INVALID');
  const flows = raw.flows ?? ['BUY', 'SELL']; need(Array.isArray(flows) && flows.length >= 1 && flows.length <= 2 && new Set(flows).size === flows.length && flows.every(v => ['BUY', 'SELL'].includes(v)), 'FIAT_CONFIGURATION_INVALID');
  return { environment: raw.environment, publishableKey: raw.publishableKey, secret: Buffer.from(raw.secretKey), webhook: Buffer.from(raw.webhookKey), flows: Object.freeze([...flows]) };
}
/** Pure documented HMAC primitive, not an HTTP signer accepting arbitrary URLs. */
export function moonPayCheckoutSignatureV1(secret, query) { need(typeof query === 'string' && query.startsWith('?') && query.length <= 8192, 'FIAT_REQUEST_INVALID'); return createHmac('sha256', secret).update(query).digest('base64'); }
function checkout(config, order) {
  const url = new URL(ORIGINS[config.environment][order.request.flow]);
  const request = order.request, parameters = { apiKey: config.publishableKey,
    ...(request.flow === 'BUY' ? { currencyCode: MOONPAY_ASSETS_V1[request.asset].code, baseCurrencyCode: 'eur', baseCurrencyAmount: request.amount, walletAddress: request.walletAddress }
      : { baseCurrencyCode: MOONPAY_ASSETS_V1[request.asset].code, baseCurrencyAmount: request.amount, quoteCurrencyCode: 'eur', refundWalletAddress: request.walletAddress }),
    lockAmount: 'true', externalTransactionId: order.id, externalCustomerId: order.ownerId };
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const signature = moonPayCheckoutSignatureV1(config.secret, url.search); return url.href + '&signature=' + encodeURIComponent(signature);
}
function publicOrder(config, order, includeCheckout = false, now = Date.now()) {
  const candidate = order.depositCandidate, provider = order.provider;
  const deposit = order.request.flow === 'SELL' && order.status === 'PROVIDER_PENDING' && provider?.status === 'waitingForDeposit' && candidate?.providerId === provider.id && candidate.providerUpdatedAt === provider.updatedAt && provider.quoteExpiresAt === candidate.quoteExpiresAt && candidate.quoteExpiresAt > now && order.lastQueriedAt !== null && now >= order.lastQueriedAt && now - order.lastQueriedAt < 15000
    ? { address: candidate.address, amountAtomic: moonPayAtomicAmountV1(order.request.amount, MOONPAY_ASSETS_V1[order.request.asset].decimals), networkId: moonPayNativeNetworkIdV1(order.request.asset, config.environment), expiresAt: Math.min(candidate.quoteExpiresAt, order.lastQueriedAt + 15000) } : null;
  return Object.freeze({ profile: includeCheckout ? 'LIANUM_MOONPAY_CHECKOUT_V1' : 'LIANUM_MOONPAY_ORDER_V1', id: order.id, externalTransactionId: order.id,
    ...order.request, environment: config.environment, chain: moonPayChainV1(order.request.asset, config.environment),
    ...(includeCheckout ? { checkoutUrl: checkout(config, order) } : {}), status: order.status,
    createdAt: order.createdAt, expiresAt: null, providerStatus: order.provider?.status ?? null, providerTransactionId: order.provider?.id ?? null,
    providerUpdatedAt: order.provider?.updatedAt ?? null, lastQueriedAt: order.lastQueriedAt,
    receivedAmount: order.provider?.receivedAmount ?? null, feeAmount: order.provider?.feeAmount ?? null, networkFeeAmount: order.provider?.networkFeeAmount ?? null,
    transactionHash: order.provider?.transactionHash ?? null, deposit, chainConfirmation: 'UNVERIFIED', privateBalanceCredited: false });
}
function epoch(value) { need(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isSafeInteger(Date.parse(value)), 'FIAT_PROVIDER_RESPONSE_INVALID'); return Date.parse(value); }
function providerTransaction(raw, order, environment, now) {
  need(raw && Object.getPrototypeOf(raw) === Object.prototype, 'FIAT_PROVIDER_RESPONSE_INVALID');
  const request = order.request; moonPayIdV1(raw.id);
  need(raw.externalTransactionId === order.id && raw.externalCustomerId === order.ownerId, 'FIAT_ORDER_BINDING');
  const crypto = request.flow === 'BUY' ? raw.currency : raw.baseCurrency, fiat = request.flow === 'BUY' ? raw.baseCurrency : raw.quoteCurrency;
  need(crypto?.type === 'crypto' && crypto.code === MOONPAY_ASSETS_V1[request.asset].code && fiat?.type === 'fiat' && fiat.code === 'eur', 'FIAT_ORDER_BINDING');
  need(moonPayWalletV1(request.asset, request.flow === 'BUY' ? raw.walletAddress : raw.refundWalletAddress, environment) === request.walletAddress, 'FIAT_ORDER_BINDING');
  need(moonPayProviderDecimalV1(raw.baseCurrencyAmount) === request.amount, 'FIAT_ORDER_BINDING');
  const statuses = request.flow === 'BUY' ? ['waitingPayment', 'pending', 'waitingAuthorization', 'failed', 'completed'] : ['waitingForDeposit', 'pending', 'failed', 'completed'];
  need(statuses.includes(raw.status), 'FIAT_PROVIDER_RESPONSE_INVALID');
  const createdAt = epoch(raw.createdAt), updatedAt = epoch(raw.updatedAt); need(updatedAt >= createdAt && createdAt >= order.createdAt - WEBHOOK_WINDOW && updatedAt <= now + WEBHOOK_WINDOW, 'FIAT_ORDER_BINDING');
  const transactionHash = (request.flow === 'BUY' ? raw.cryptoTransactionId : raw.depositHash) ?? null;
  need(transactionHash === null || typeof transactionHash === 'string' && transactionHash.length <= 128 && /^[0-9A-Za-z]+$/.test(transactionHash), 'FIAT_PROVIDER_RESPONSE_INVALID');
  need(raw.status !== 'completed' || transactionHash !== null && transactionHash.length > 0, 'FIAT_PROVIDER_RESPONSE_INVALID');
  return { id: raw.id, status: raw.status, updatedAt, quoteExpiresAt: raw.quoteExpiresAt === null || raw.quoteExpiresAt === undefined ? null : epoch(raw.quoteExpiresAt), receivedAmount: moonPayProviderDecimalV1(raw.quoteCurrencyAmount, true), feeAmount: moonPayProviderDecimalV1(raw.feeAmount, true), networkFeeAmount: raw.networkFeeAmount === undefined ? null : moonPayProviderDecimalV1(raw.networkFeeAmount, true), transactionHash };
}
function validateRetained(state, config) {
  need(state.orders.length <= 10000 && state.webhooks.length <= 20000, 'FIAT_STORE_CAPACITY');
  const ids = new Set(), requests = new Set();
  for (const order of state.orders) {
    exact(order, ['id', 'ownerId', 'request', 'createdAt', 'status', 'provider', 'depositCandidate', 'lastQueriedAt']); moonPayIdV1(order.id); moonPayOwnerV1(order.ownerId);
    const request = normalizeMoonPaySessionRequestV1(order.request, config.environment); need(JSON.stringify(request) === JSON.stringify(order.request), 'FIAT_STORE_BINDING');
    need(Number.isSafeInteger(order.createdAt) && order.createdAt > 0 && ['CHECKOUT_READY', 'PROVIDER_PENDING', 'PROVIDER_FAILED', 'PROVIDER_COMPLETED', 'UNKNOWN'].includes(order.status), 'FIAT_STORE_BINDING');
    need(order.lastQueriedAt === null || Number.isSafeInteger(order.lastQueriedAt) && order.lastQueriedAt >= order.createdAt, 'FIAT_STORE_BINDING');
    need(!ids.has(order.id) && !requests.has(order.ownerId + request.requestId), 'FIAT_STORE_BINDING'); ids.add(order.id); requests.add(order.ownerId + request.requestId);
    if (order.provider) {
      exact(order.provider, ['id', 'status', 'updatedAt', 'quoteExpiresAt', 'receivedAmount', 'feeAmount', 'networkFeeAmount', 'transactionHash']); moonPayIdV1(order.provider.id);
      const statuses = request.flow === 'BUY' ? ['waitingPayment', 'pending', 'waitingAuthorization', 'failed', 'completed'] : ['waitingForDeposit', 'pending', 'failed', 'completed'];
      need(statuses.includes(order.provider.status) && Number.isSafeInteger(order.provider.updatedAt) && order.provider.updatedAt >= order.createdAt - WEBHOOK_WINDOW && (order.provider.quoteExpiresAt === null || Number.isSafeInteger(order.provider.quoteExpiresAt)), 'FIAT_STORE_BINDING');
      for (const key of ['receivedAmount', 'feeAmount']) need(moonPayProviderDecimalV1(order.provider[key], true) === order.provider[key], 'FIAT_STORE_BINDING');
      if (order.provider.networkFeeAmount !== null) need(moonPayProviderDecimalV1(order.provider.networkFeeAmount, true) === order.provider.networkFeeAmount, 'FIAT_STORE_BINDING');
      need(order.provider.transactionHash === null || typeof order.provider.transactionHash === 'string' && order.provider.transactionHash.length <= 128 && /^[0-9A-Za-z]+$/.test(order.provider.transactionHash), 'FIAT_STORE_BINDING');
      const expected = order.provider.status === 'completed' ? 'PROVIDER_COMPLETED' : order.provider.status === 'failed' ? 'PROVIDER_FAILED' : 'PROVIDER_PENDING'; need(order.status === expected || order.status === 'UNKNOWN', 'FIAT_STORE_BINDING');
    } else need(order.status === 'CHECKOUT_READY' || order.status === 'UNKNOWN', 'FIAT_STORE_BINDING');
    if (order.depositCandidate) { exact(order.depositCandidate, ['providerId', 'address', 'quoteExpiresAt', 'providerUpdatedAt']); moonPayIdV1(order.depositCandidate.providerId); need(order.request.flow === 'SELL' && moonPayWalletV1(order.request.asset, order.depositCandidate.address, config.environment) === order.depositCandidate.address && Number.isSafeInteger(order.depositCandidate.quoteExpiresAt) && Number.isSafeInteger(order.depositCandidate.providerUpdatedAt), 'FIAT_STORE_BINDING'); }
  }
  for (const event of state.webhooks) { exact(event, ['digest', 'receivedAt', 'orderId']); need(/^[0-9a-f]{64}$/.test(event.digest) && Number.isSafeInteger(event.receivedAt), 'FIAT_STORE_BINDING'); moonPayIdV1(event.orderId); need(ids.has(event.orderId), 'FIAT_STORE_BINDING'); }
  need(new Set(state.webhooks.map(value => value.digest)).size === state.webhooks.length, 'FIAT_STORE_BINDING');
}
export async function createMoonPayGatewayV1({ configuration: rawConfig = null, directory, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const config = configuration(rawConfig); need(typeof fetchImpl === 'function' && typeof now === 'function', 'FIAT_CONFIGURATION_INVALID');
  let closing = false, closeWork, store = null; const active = new Set(), requests = new Set();
  const live = () => need(!closing, 'FIAT_GATEWAY_CLOSED');
  const ready = () => { live(); need(config !== null, 'FIAT_NOT_CONFIGURED'); };
  const clock = () => { const value = now(); need(Number.isSafeInteger(value) && value > 0, 'FIAT_CLOCK_INVALID'); return value; };
  if (config) { try { store = await openMoonPayOrderStoreV1(directory, moonPayHashV1(config.environment + ':' + config.publishableKey)); validateRetained(await store.read(), config); } catch (error) { await store?.close(); config.secret.fill(0); config.webhook.fill(0); throw error; } }
  async function work(operation) { live(); const own = Promise.resolve().then(operation); active.add(own); try { return await own; } finally { active.delete(own); } }
  async function get(path, signal) {
    ready(); need(typeof path === 'string' && path.startsWith('/v'), 'FIAT_REQUEST_INVALID');
    const controller = new AbortController(), abort = () => controller.abort(); let timedOut = false;
    if (signal?.aborted) fail('FIAT_PROVIDER_UNAVAILABLE'); signal?.addEventListener('abort', abort, { once: true }); requests.add(controller);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
    try {
      const url = new URL(path, 'https://api.moonpay.com'); url.searchParams.set('apiKey', config.publishableKey);
      const response = await fetchImpl(url.href, { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal, redirect: 'error', credentials: 'omit' });
      live(); if (response.status === 404) return null;
      need(response.ok && /^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type') ?? ''), 'FIAT_PROVIDER_UNAVAILABLE');
      const chunks = []; let size = 0, bytes;
      try { const reader = response.body?.getReader(); need(reader, 'FIAT_PROVIDER_RESPONSE_INVALID'); for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; need(size <= MAX_REPLY, 'FIAT_PROVIDER_RESPONSE_INVALID'); chunks.push(Buffer.from(item.value)); } bytes = Buffer.concat(chunks); live(); return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); }
      finally { bytes?.fill(0); for (const chunk of chunks) chunk.fill(0); }
    } catch (error) { if (timedOut) fail('FIAT_PROVIDER_TIMEOUT'); if (finiteCode.has(error?.code)) throw error; fail('FIAT_PROVIDER_UNAVAILABLE'); }
    finally { clearTimeout(timer); controller.abort(); signal?.removeEventListener('abort', abort); requests.delete(controller); }
  }
  async function owned(ownerId, id) { moonPayOwnerV1(ownerId); moonPayIdV1(id); const state = await store.read(), order = state.orders.find(value => value.id === id && value.ownerId === ownerId); need(order, 'FIAT_ORDER_NOT_FOUND'); return order; }
  async function available(request, signal) {
    const currencies = await get('/v3/currencies', signal);
    need(Array.isArray(currencies) && currencies.length <= 2048, 'FIAT_PROVIDER_RESPONSE_INVALID');
    const assets = currencies.filter(value => value.code === MOONPAY_ASSETS_V1[request.asset].code), fiats = currencies.filter(value => value.code === 'eur');
    need(assets.length === 1 && fiats.length === 1, 'FIAT_ASSET_NETWORK_UNAVAILABLE');
    // Residence/KYC eligibility is decided by MoonPay's widget. The partner host
    // address and the phone timezone do not establish the customer's residence.
    need(assets[0].type === 'crypto' && fiats[0].type === 'fiat' && assets[0].isSuspended !== true, 'FIAT_ASSET_NETWORK_UNAVAILABLE');
    if (request.flow === 'SELL') need(assets[0].isSellSupported === true && fiats[0].isSellSupported === true, 'FIAT_FLOW_UNAVAILABLE');
  }
  async function reconcile(ownerId, id, signal, expectedProviderId = null) {
    ready(); const order = await owned(ownerId, id), endpoint = order.request.flow === 'BUY' ? '/v1/transactions/ext/' : '/v3/sell_transactions/ext/';
    const raw = await get(endpoint + order.id, signal); if (raw === null || Array.isArray(raw) && raw.length === 0) return publicOrder(config, order, false, clock());
    const rows = Array.isArray(raw) ? raw : [raw];
    if (rows.length !== 1) { await store.transaction(state => { state.orders.find(value => value.id === id && value.ownerId === ownerId).status = 'UNKNOWN'; return null; }); fail('FIAT_ORDER_AMBIGUOUS'); }
    const provider = providerTransaction(rows[0], order, config.environment, clock()); need(expectedProviderId === null || provider.id === expectedProviderId, 'FIAT_ORDER_BINDING');
    const result = await store.transaction(state => {
      const current = state.orders.find(value => value.id === id && value.ownerId === ownerId); need(current, 'FIAT_ORDER_NOT_FOUND');
      need(current.provider === null || current.provider.id === provider.id, 'FIAT_ORDER_AMBIGUOUS');
      if (current.provider && provider.updatedAt < current.provider.updatedAt) return current;
      if (current.provider && provider.updatedAt === current.provider.updatedAt) need(JSON.stringify(provider) === JSON.stringify(current.provider), 'FIAT_ORDER_CONFLICT');
      need(current.provider?.status !== 'completed' || provider.status === 'completed', 'FIAT_ORDER_CONFLICT');
      current.provider = provider; current.lastQueriedAt = clock(); current.status = provider.status === 'completed' ? 'PROVIDER_COMPLETED' : provider.status === 'failed' ? 'PROVIDER_FAILED' : 'PROVIDER_PENDING'; return current;
    }); return publicOrder(config, result, false, clock());
  }
  const gateway = Object.freeze({
    profile: LIANUM_MOONPAY_GATEWAY_V1,
    capabilities() { live(); return Object.freeze({ profile: 'LIANUM_MOONPAY_CAPABILITIES_V1', configured: config !== null, environment: config?.environment ?? null, buy: Boolean(config?.flows.includes('BUY')), sell: Boolean(config?.flows.includes('SELL')), fiatCurrencies: ['EUR'], assets: Object.values(MOONPAY_ASSETS_V1).map(asset => ({ asset: asset.asset, network: asset.network, decimals: asset.decimals, chain: config ? moonPayChainV1(asset.asset, config.environment) : null })), reason: config ? null : 'MERCHANT_ACCOUNT_KEYS_REQUIRED', availability: 'CHECK_AT_CHECKOUT' }); },
    createSession(ownerId, raw, signal) { return work(async () => { ready(); moonPayOwnerV1(ownerId); const request = normalizeMoonPaySessionRequestV1(raw, config.environment); need(config.flows.includes(request.flow), 'FIAT_FLOW_UNAVAILABLE');
      const previous = (await store.read()).orders.find(value => value.ownerId === ownerId && value.request.requestId === request.requestId);
      if (previous) { need(JSON.stringify(previous.request) === JSON.stringify(request), 'FIAT_ORDER_CONFLICT'); return publicOrder(config, previous, true, clock()); }
      await available(request, signal); live();
      const order = await store.transaction(state => { const concurrent = state.orders.find(value => value.ownerId === ownerId && value.request.requestId === request.requestId); if (concurrent) { need(JSON.stringify(concurrent.request) === JSON.stringify(request), 'FIAT_ORDER_CONFLICT'); return concurrent; }
        need(state.orders.length < 10000, 'FIAT_STORE_CAPACITY'); const created = { id: randomUUID(), ownerId, request, createdAt: clock(), status: 'CHECKOUT_READY', provider: null, depositCandidate: null, lastQueriedAt: null }; state.orders.push(created); return created; });
      return publicOrder(config, order, true, clock());
    }); },
    getOrder(ownerId, id) { return work(async () => { ready(); return publicOrder(config, await owned(ownerId, id), false, clock()); }); },
    reconcileOrder(ownerId, id, signal) { return work(() => reconcile(ownerId, id, signal)); },
    receiveWebhook(raw, signature) { return work(async () => { ready(); need(raw instanceof Uint8Array && raw.byteLength > 0 && raw.byteLength <= MAX_WEBHOOK && typeof signature === 'string' && signature.length <= 128, 'FIAT_WEBHOOK_INVALID');
      const parts = /^t=([0-9]{1,12}),s=([0-9a-f]{64})$/.exec(signature); need(parts, 'FIAT_WEBHOOK_SIGNATURE_INVALID');
      const timestamp = Number(parts[1]) * 1000; need(Number.isSafeInteger(timestamp) && Math.abs(clock() - timestamp) <= WEBHOOK_WINDOW, 'FIAT_WEBHOOK_EXPIRED');
      const expected = createHmac('sha256', config.webhook).update(parts[1] + '.').update(raw).digest(); need(timingSafeEqual(expected, Buffer.from(parts[2], 'hex')), 'FIAT_WEBHOOK_SIGNATURE_INVALID');
      let event; try { event = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw)); } catch { fail('FIAT_WEBHOOK_INVALID'); }
      need(event && Object.hasOwn(EVENTS, event.type) && event.data && Object.getPrototypeOf(event.data) === Object.prototype, 'FIAT_WEBHOOK_UNSUPPORTED');
      const id = event.data.externalTransactionId; if (typeof id !== 'string') return { accepted: false, duplicate: false, reconciliation: 'UNASSOCIATED' };
      const order = (await store.read()).orders.find(value => value.id === id && value.request.flow === EVENTS[event.type]); if (!order) return { accepted: false, duplicate: false, reconciliation: 'UNASSOCIATED' };
      moonPayIdV1(event.data.id); need(event.data.externalCustomerId === order.ownerId && (!order.provider || order.provider.id === event.data.id), 'FIAT_ORDER_BINDING');
      let candidate = null;
      if (order.request.flow === 'SELL' && event.data.depositWallet !== undefined && event.data.depositWallet !== null) {
        const wallet = event.data.depositWallet;
        need(wallet && Object.getPrototypeOf(wallet) === Object.prototype && (wallet.walletAddressTag === null || wallet.walletAddressTag === undefined || wallet.walletAddressTag === ''), 'FIAT_DEPOSIT_UNSUPPORTED');
        need(moonPayProviderDecimalV1(event.data.baseCurrencyAmount) === order.request.amount && event.data.baseCurrency?.code === MOONPAY_ASSETS_V1[order.request.asset].code && event.data.quoteCurrency?.code === 'eur', 'FIAT_ORDER_BINDING');
        candidate = { providerId: event.data.id, address: moonPayWalletV1(order.request.asset, wallet.walletAddress, config.environment), quoteExpiresAt: epoch(event.data.quoteExpiresAt), providerUpdatedAt: epoch(event.data.updatedAt) };
      }
      const digest = moonPayHashV1(raw), duplicate = await store.transaction(state => {
        if (state.webhooks.some(value => value.digest === digest)) return true;
        need(state.webhooks.length < 20000, 'FIAT_STORE_CAPACITY'); state.webhooks.push({ digest, receivedAt: clock(), orderId: id });
        const current = state.orders.find(value => value.id === id && value.ownerId === order.ownerId);
        if (candidate && (!current.depositCandidate || candidate.providerUpdatedAt >= current.depositCandidate.providerUpdatedAt)) {
          need(!current.depositCandidate || current.depositCandidate.providerId === candidate.providerId, 'FIAT_ORDER_AMBIGUOUS');
          if (current.depositCandidate && candidate.providerUpdatedAt === current.depositCandidate.providerUpdatedAt) need(JSON.stringify(candidate) === JSON.stringify(current.depositCandidate), 'FIAT_ORDER_CONFLICT');
          current.depositCandidate = candidate;
        }
        return false;
      });
      if (duplicate) return { accepted: true, duplicate: true, reconciliation: 'DUPLICATE' };
      // Never install event.data.status/amount. Query MoonPay via the original fixed endpoint.
      let reconciliation = 'PENDING'; try { await reconcile(order.ownerId, order.id, undefined, event.data.id); reconciliation = 'QUERIED'; } catch (error) { if (!['FIAT_PROVIDER_UNAVAILABLE', 'FIAT_PROVIDER_TIMEOUT'].includes(error?.code)) throw error; }
      return { accepted: true, duplicate, reconciliation };
    }); },
    close() { if (closeWork) return closeWork; closing = true; for (const controller of requests) controller.abort(); return closeWork = Promise.allSettled([...active]).then(async () => { try { await store?.close(); } finally { config?.secret.fill(0); config?.webhook.fill(0); } }); },
  });
  return gateway;
}
