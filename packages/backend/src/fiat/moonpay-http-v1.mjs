/** The enclosing server authenticates ownerId against method/path/body before dispatch.
 * Only the signed raw provider webhook is allowed without wallet authentication. */
import { exactMoonPayV1, needMoonPayV1, moonPayIdV1 } from './moonpay-codec-v1.mjs';
import { moonPayPublicFailureCodeV1 } from './moonpay-gateway-v1.mjs';
export async function dispatchMoonPayHttpV1(method, path, body, ownerId, gateway, signal) {
  if (method === 'GET' && path === '/v1/fiat/capabilities') return { status: 200, body: gateway.capabilities() };
  needMoonPayV1(ownerId, 'FIAT_OWNER_REQUIRED');
  if (method === 'POST' && path === '/v1/fiat/sessions') return { status: 201, body: await gateway.createSession(ownerId, body, signal) };
  if (method === 'POST' && path === '/v1/fiat/orders/read') { exactMoonPayV1(body, ['id']); return { status: 200, body: await gateway.getOrder(ownerId, moonPayIdV1(body.id)) }; }
  if (method === 'POST' && path === '/v1/fiat/orders/reconcile') { exactMoonPayV1(body, ['id']); return { status: 200, body: await gateway.reconcileOrder(ownerId, moonPayIdV1(body.id), signal) }; }
  if (method === 'GET' && /^\/v1\/fiat\/orders\/[0-9a-f-]{36}$/.test(path)) return { status: 200, body: await gateway.getOrder(ownerId, moonPayIdV1(path.slice('/v1/fiat/orders/'.length))) };
  needMoonPayV1(false, 'FIAT_ROUTE_NOT_FOUND');
}
export async function handleMoonPayHttpV1(request, response, { ownerId, gateway, verifiedBody, signal } = {}) {
  const chunks = []; let raw;
  const send = (status, body) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(JSON.stringify(body)); };
  try {
    if (request.method === 'POST' && request.url === '/v1/fiat/moonpay/webhook') {
      needMoonPayV1(/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? ''), 'FIAT_HTTP_CONTENT_TYPE');
      let size = 0; for await (const chunk of request) { size += chunk.byteLength; needMoonPayV1(size <= 256 * 1024, 'FIAT_HTTP_BODY_LIMIT'); chunks.push(Buffer.from(chunk)); }
      raw = Buffer.concat(chunks); return send(200, await gateway.receiveWebhook(raw, request.headers['moonpay-signature-v2']));
    }
    // No second body parse: dispatch the exact body authenticated by the enclosing server.
    const result = await dispatchMoonPayHttpV1(request.method, request.url, verifiedBody, ownerId, gateway, signal); return send(result.status, result.body);
  } catch (error) {
    const code = moonPayPublicFailureCodeV1(error), status = code === 'FIAT_NOT_CONFIGURED' || code.startsWith('FIAT_PROVIDER_') ? 503 : code === 'FIAT_ORDER_NOT_FOUND' || code === 'FIAT_ROUTE_NOT_FOUND' ? 404 : ['FIAT_ORDER_CONFLICT', 'FIAT_ORDER_AMBIGUOUS'].includes(code) ? 409 : code === 'FIAT_OWNER_REQUIRED' || code.startsWith('FIAT_WEBHOOK_') ? 403 : 400;
    if (!response.headersSent && !response.destroyed) send(status, { error: code });
  } finally { raw?.fill(0); for (const chunk of chunks) chunk.fill(0); }
}
