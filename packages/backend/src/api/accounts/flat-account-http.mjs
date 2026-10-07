/** Fixed, owned-loopback HTTP transport. Bootstrap capabilities never cross
 * the wire; there are no runtime, verifier, RPC or filesystem-input routes. */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';
import { assertFlatAccountSession, flatAccountErrorCode } from './flat-account-session.mjs';

export const FLAT_ACCOUNT_BODY_LIMIT = 4096;
const prefix = '/api/flat-account';
const routes = Object.freeze({
  [`${prefix}/prepare`]: 'prepare', [`${prefix}/execute`]: 'execute',
  [`${prefix}/reconcile`]: 'reconcile', [`${prefix}/recover`]: 'recover',
  [`${prefix}/restart`]: 'restartCoordinator', [`${prefix}/close`]: 'close',
});
const sensitiveHeaders = new Set(['host', 'origin', 'content-type', 'content-length',
  'x-flat-account-token', 'x-flat-owner-token', 'sec-fetch-site']);

function fail(code) { throw Object.assign(new Error(code), { code }); }
function validToken(submitted, expected) {
  return typeof submitted === 'string' && submitted.length === expected.length
    && /^[0-9a-f]+$/.test(submitted)
    && timingSafeEqual(Buffer.from(submitted, 'ascii'), Buffer.from(expected, 'ascii'));
}
function repeatedHeader(request) {
  const seen = new Set();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index].toLowerCase();
    if (sensitiveHeaders.has(name) && seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}
async function body(request) {
  const size = request.headers['content-length'];
  if (size !== undefined && (!/^(0|[1-9][0-9]*)$/.test(size) || Number(size) > FLAT_ACCOUNT_BODY_LIMIT))
    fail('FLAT_ACCOUNT_BODY_TOO_LARGE');
  const chunks = await new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const chunks = [];
    request.on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > FLAT_ACCOUNT_BODY_LIMIT) {
        settled = true;
        chunks.length = 0;
        reject(Object.assign(new Error('FLAT_ACCOUNT_BODY_TOO_LARGE'), { code: 'FLAT_ACCOUNT_BODY_TOO_LARGE' }));
      } else chunks.push(chunk);
    });
    request.once('end', () => { if (!settled) { settled = true; resolve(chunks); } });
    request.once('aborted', () => { if (!settled) { settled = true; reject(new Error('FLAT_ACCOUNT_REQUEST_ABORTED')); } });
    request.once('error', error => { if (!settled) { settled = true; reject(error); } });
  });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('FLAT_ACCOUNT_INVALID_JSON'); }
}

/** PRIVATE bootstrap: pass a branded session, optionally a local port. Tokens
 * are returned only to this caller, never from an HTTP endpoint or a log. */
export async function startFlatAccountHttp(options) {
  if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype
    || Reflect.ownKeys(options).some(key => !['session', 'port'].includes(key))
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'session') ?? {}, 'value')
    || Object.hasOwn(options, 'port') && !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'port') ?? {}, 'value'))
    fail('FLAT_ACCOUNT_HTTP_BOOTSTRAP_FIELDS');
  const { session, port = 0 } = options;
  assertFlatAccountSession(session);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('FLAT_ACCOUNT_PORT');
  const mutationToken = randomBytes(32).toString('hex'), ownerToken = randomBytes(32).toString('hex');
  let origin = '', host = '', closePromise = null;

  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    const send = (status, value) => {
      if (response.destroyed) return;
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Opener-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
      response.end(JSON.stringify(value));
    };
    try {
      if (request.socket.remoteAddress !== '127.0.0.1' || repeatedHeader(request)
        || request.headers.host !== host) return send(403, { error: 'FLAT_ACCOUNT_INVALID_HOST' });
      if (request.headers.origin !== undefined && request.headers.origin !== origin)
        return send(403, { error: 'FLAT_ACCOUNT_INVALID_ORIGIN' });
      if (request.headers['sec-fetch-site'] !== undefined
        && !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))
        return send(403, { error: 'FLAT_ACCOUNT_INVALID_ORIGIN' });
      if (request.method === 'GET' && (request.headers['transfer-encoding'] !== undefined
        || request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0'))
        return send(400, { error: 'FLAT_ACCOUNT_GET_BODY_FORBIDDEN' });
      // Match the raw target. No query strings, encoded paths or caller-selected
      // path segments can select a different account, file or backend.
      if (request.method === 'GET' && request.url === `${prefix}/snapshot`)
        return send(200, await session.snapshot());
      if (request.method === 'GET' && request.url === `${prefix}/owner`) {
        if (request.headers.origin !== origin || !validToken(request.headers['x-flat-owner-token'], ownerToken))
          return send(403, { error: 'FLAT_ACCOUNT_OWNER_ACCESS_REQUIRED' });
        return send(200, await session.ownerView());
      }
      if (request.method !== 'POST' || !Object.hasOwn(routes, request.url))
        return send(404, { error: 'FLAT_ACCOUNT_NOT_FOUND' });
      if (request.headers.origin !== origin) return send(403, { error: 'FLAT_ACCOUNT_ORIGIN_REQUIRED' });
      if (!validToken(request.headers['x-flat-account-token'], mutationToken))
        return send(403, { error: 'FLAT_ACCOUNT_ACCESS_REQUIRED' });
      if (request.headers['content-type'] !== 'application/json')
        return send(415, { error: 'FLAT_ACCOUNT_JSON_REQUIRED' });
      const input = await body(request);
      return send(202, session.submit(routes[request.url], input));
    } catch (error) {
      const code = flatAccountErrorCode(error);
      const status = code === 'FLAT_ACCOUNT_BODY_TOO_LARGE' ? 413
        : /UNAVAILABLE/.test(code) ? 503 : /BUSY|CONFLICT|ALREADY_BOUND/.test(code) ? 409 : 400;
      if (!response.headersSent) send(status, { error: code });
      else response.destroy();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxRequestsPerSocket = 100;
  await new Promise((resolve, reject) => {
    const onError = error => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolve(); });
  });
  host = `127.0.0.1:${server.address().port}`;
  origin = `http://${host}`;
  return Object.freeze({ origin,
    clientAccess: Object.freeze({ origin, token: mutationToken }),
    ownerAccess: Object.freeze({ origin, token: ownerToken }),
    close() {
      return closePromise ??= (async () => {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
        return session.close();
      })();
    },
  });
}
