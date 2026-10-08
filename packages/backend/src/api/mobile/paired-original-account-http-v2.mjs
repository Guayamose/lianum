/** Direct transport for exactly one retained same-realm actor. The HTTP factory
 * remains loopback-only; an operator may install the same dispatcher with TLS.
 * No public platform adoption or new economic capabilities are issued.
 * Losing/closing HTTP never cancels or retries an original admission. */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { types } from 'node:util';
import { assertPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 }
  from './paired-original-account-actor-v2.mjs';
import { deviceOwnerDepositBridgeActorV1 } from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
const listeners = new WeakSet();
const BODY_LIMIT = 8192, REQUEST_MS = 5000, CLOSE_MS = 1000;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const state = Object.freeze({ version: 2, profile: 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2', connection: 'PAIRED',
  privatePortfolio: null, economicObservation: null, noteCustodyOnDevice: false,
  nativeEffectsEstablished: false, actions: Object.freeze({ read: true, reconcile: true }) });
function exactInput(input, names = ['actor']) {
  if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== names.length
    || !Reflect.ownKeys(input).every(name => names.includes(name))
    || !names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(input, name) ?? {}, 'value')))
    fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
}
function tlsMaterial(input, descriptor) {
  exactInput(input, ['certificate', 'privateKey']);
  if (typeof input.certificate !== 'string' || Buffer.byteLength(input.certificate) > 65536
    || typeof input.privateKey !== 'string' || Buffer.byteLength(input.privateKey) > 16384)
    fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const origin = new URL(descriptor.origin), hostname = origin.hostname.replace(/^\[|\]$/g, '');
  let certificate;
  try {
    certificate = new X509Certificate(input.certificate);
    const privateKey = createPrivateKey(input.privateKey);
    if (!certificate.checkPrivateKey(privateKey) || certificate.ca
      || (isIP(hostname) ? certificate.checkIP(hostname) !== hostname
        : certificate.checkHost(hostname, { subject: 'never', wildcards: false }) !== hostname))
      fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  } catch { fail('MOBILE_ORIGINAL_TLS_CONFIGURATION'); }
  const notBefore = certificate.validFromDate.getTime(), notAfter = certificate.validToDate.getTime();
  const current = () => {
    const now = Date.now();
    if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter) || now < notBefore || now >= notAfter)
      fail('MOBILE_ORIGINAL_TLS_CERTIFICATE_EXPIRED');
  };
  current();
  return { certificate: input.certificate, privateKey: Buffer.from(input.privateKey),
    current, hostHeader: origin.host, port: Number(origin.port || '443') };
}
function reply(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length,
    'cache-control': 'no-store', 'connection': 'close', 'x-content-type-options': 'nosniff' });
  response.end(bytes);
}
async function jsonBody(request) {
  if (request.headers['content-type'] !== 'application/json' || request.headers['content-encoding'] !== undefined
    || request.headers['transfer-encoding'] !== undefined) fail('HTTP_BODY_REJECTED');
  const length = request.headers['content-length'];
  if (typeof length !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(length)
    || Number(length) < 2 || Number(length) > BODY_LIMIT) fail('HTTP_BODY_REJECTED');
  const parts = []; let bytes = 0;
  let owned;
  try {
    for await (const part of request) {
      bytes += part.length; parts.push(part);
      if (bytes > BODY_LIMIT || bytes > Number(length)) fail('HTTP_BODY_REJECTED');
    }
    if (bytes !== Number(length)) fail('HTTP_BODY_REJECTED');
    owned = Buffer.concat(parts);
    try { return JSON.parse(owned.toString('utf8')); } catch { fail('HTTP_BODY_REJECTED'); }
  } finally { owned?.fill(0); for (const part of parts) part.fill(0); }
}
export async function createPairedOriginalAccountHttpServerV2(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION'); exactInput(input);
  return startOriginalTransport(input.actor, null, '127.0.0.1');
}
/** Local operator installation only. Inputs are infrastructure TLS material
 * and an ORIGINAL actor, never JSON IDs, a SQL projection or request handlers.
 * Default loopback is suitable for adb reverse; LAN exposure is explicit.
 * The phone must independently trust the certificate via its normal TLS stack.
 * No note key or custody password is supplied to this factory. */
export async function createPairedOriginalAccountTlsServerV2(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['actor', 'tls', 'host'] : ['actor', 'tls'];
  exactInput(input, names); assertPairedOriginalAccountActorV2(input.actor);
  const host = names.includes('host') ? input.host : '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const descriptor = pairedOriginalAccountActorDescriptorV2(input.actor), tls = tlsMaterial(input.tls, descriptor);
  try { return await startOriginalTransport(input.actor, tls, host); }
  finally { tls.privateKey.fill(0); }
}
/** Explicit private operator installation: only a genuine fixed bridge supplies
 * its original actor. Economic routes are TLS-only; old factories/state stay
 * unchanged. Certificates are infrastructure, never custody note/root keys. */
export async function createPairedDeviceDepositTlsServerV1(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['bridge', 'tls', 'host'] : ['bridge', 'tls'];
  exactInput(input, names); const actor = deviceOwnerDepositBridgeActorV1(input.bridge);
  const host = names.includes('host') ? input.host : '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor), tls = tlsMaterial(input.tls, descriptor);
  try { return await startOriginalTransport(actor, tls, host, input.bridge); }
  finally { tls.privateKey.fill(0); }
}
async function startOriginalTransport(actor, tls, host, bridge = null) {
  assertPairedOriginalAccountActorV2(actor);
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  if (listeners.has(actor)) fail('MOBILE_ORIGINAL_HTTP_ALREADY_BOUND'); listeners.add(actor);
  const sockets = new Set(), running = new Set(); let closed = false, closePromise, confirmOwnedClose;
  const handler = (request, response) => {
    const work = (async () => {
      if (closed) fail('HTTP_CLOSED');
      if (tls) {
        tls.current();
        if (request.headers.host !== tls.hostHeader || request.socket.encrypted !== true)
          fail('HTTP_ORIGIN_REJECTED');
      }
      if (request.url === '/v2/mobile/original-account/state' && request.method === 'GET') {
        assertPairedOriginalAccountActorV2(actor); return state;
      }
      if (bridge !== null && request.method === 'POST' && request.url.startsWith('/v1/mobile/device-deposit/')) {
        if (!tls || request.headers.origin !== descriptor.origin) fail('HTTP_ORIGIN_REJECTED');
        const methods = { 'job-reviews': 'challengeJob', 'jobs': 'prove', 'funding-reviews': 'challengeFunding',
          'fund': 'fund', 'observation-reviews': 'challengeObservation', 'observations': 'observe' };
        const method = methods[request.url.slice('/v1/mobile/device-deposit/'.length)];
        if (!method) fail('HTTP_NOT_FOUND');
        const input = await jsonBody(request); if (closed) fail('HTTP_CLOSED');
        // A proof job is retained by the original account even if this HTTP
        // response is lost/times out. Its opening has no logs/journal storage.
        try { return await bridge[method](input); }
        finally {
          // jsonBody owns these parsed vectors. Erase them only after the
          // admitted original job finishes; HTTP loss never cancels its work.
          if (method === 'prove' && input.witness && typeof input.witness === 'object')
            for (const field of Object.values(input.witness)) if (Array.isArray(field)) field.fill(0);
        }
      }
      if (request.method !== 'POST' || !['/v2/mobile/original-account/challenges',
        '/v2/mobile/original-account/reviews', '/v2/mobile/original-account/diagnostics',
        '/v1/mobile/original-account/private-state/challenges', '/v1/mobile/original-account/private-state/reviews',
        '/v1/mobile/original-account/private-state/observations'].includes(request.url))
        fail('HTTP_NOT_FOUND');
      if (request.headers.origin !== descriptor.origin) fail('HTTP_ORIGIN_REJECTED');
      const value = await jsonBody(request);
      if (closed) fail('HTTP_CLOSED'); assertPairedOriginalAccountActorV2(actor);
      if (request.url.startsWith('/v1/mobile/original-account/private-state/')) {
        if (request.url.endsWith('/challenges')) {
          if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== 0)
            fail('HTTP_BODY_REJECTED');
          return { challenge: actor.privateStateChallenge() };
        }
        if (request.url.endsWith('/reviews')) return { review: await actor.openPrivateStateReview(value) };
        return actor.readPrivateState(value);
      }
      if (request.url.endsWith('/challenges')) return { challenge: actor.challenge(value) };
      if (request.url.endsWith('/reviews')) return { review: await actor.openReview(value) };
      return actor.submit(value);
    })();
    running.add(work); work.finally(() => running.delete(work)).catch(() => {});
    let deadline;
    const timeout = new Promise((_, reject) => { deadline = setTimeout(() => reject(Object.assign(
      new Error('HTTP_REQUEST_TIMEOUT'), { code: 'HTTP_REQUEST_TIMEOUT' })), REQUEST_MS); deadline.unref(); });
    Promise.race([work, timeout]).then(value => reply(response, 200, value), error => {
      const code = error?.code;
      const status = code === 'HTTP_NOT_FOUND' ? 404 : code === 'HTTP_BODY_REJECTED' ? 400
        : code === 'HTTP_REQUEST_TIMEOUT' ? 504 : closed ? 503 : 403;
      // Original errors/terms/stacks remain private in the retained actor.
      reply(response, status, { error: status === 404 ? 'NOT_FOUND' : status === 504 ? 'REQUEST_TIMEOUT'
        : status === 503 ? 'DISCONNECTED' : 'REQUEST_REJECTED' });
      if (status === 504 && !request.complete) request.destroy();
    }).finally(() => clearTimeout(deadline)).catch(() => {});
  };
  let server;
  try {
    server = tls ? createHttpsServer({ maxHeaderSize: BODY_LIMIT, cert: tls.certificate, key: tls.privateKey,
      minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ALPNProtocols: ['http/1.1'], handshakeTimeout: 2000 }, handler)
      : createHttpServer({ maxHeaderSize: BODY_LIMIT }, handler);
  } catch { listeners.delete(actor); fail('MOBILE_ORIGINAL_TLS_CONFIGURATION'); }
  server.headersTimeout = 2000; server.requestTimeout = REQUEST_MS; server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1; server.maxConnections = 4;
  function trackSocket(socket, headersRequired) {
    if (!sockets.has(socket)) {
      sockets.add(socket);
      socket.once('close', () => { sockets.delete(socket); confirmOwnedClose?.(); });
    }
    if (!headersRequired) return;
    // Independent owned-socket deadline also bounds incomplete HTTP headers.
    const headers = setTimeout(() => socket.destroy(), 2000); headers.unref();
    socket.once('close', () => clearTimeout(headers));
    // Install before any socket data is parsed: the request event can precede
    // another data listener when a complete header arrives in its first chunk.
    const clear = request => { if (request.socket === socket) { clearTimeout(headers); server.off('request', clear); } };
    server.on('request', clear); socket.once('close', () => server.off('request', clear));
  }
  server.on('connection', socket => trackSocket(socket, !tls));
  if (tls) {
    // Inventory both TCP sockets (including incomplete handshakes) and the
    // authenticated TLS sockets; closing waits for every owned close event.
    server.on('secureConnection', socket => trackSocket(socket, true));
    server.on('tlsClientError', (_error, socket) => socket.destroy());
  }
  try {
    await new Promise((resolve, reject) => {
      const failed = error => { server.off('listening', ready); reject(error); };
      const ready = () => { server.off('error', failed); resolve(); };
      server.once('error', failed); server.once('listening', ready); server.listen(tls ? tls.port : 0, host);
    });
  } catch (error) { listeners.delete(actor); for (const socket of sockets) socket.destroy(); server.close(); throw error; }
  const address = server.address(), url = tls ? descriptor.origin : 'http://127.0.0.1:' + address.port;
  return Object.freeze({ url,
    /** Invalidates controller consents, closes only owned listener/sockets, and
     * preserves admitted original work. Its owner must await the original
     * session separately; this transport never cancels custody or native work. */
    close() {
      if (arguments.length !== 0) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
      if (!closePromise) {
        closed = true; actor.close();
        closePromise = new Promise((resolve, reject) => {
          let done = false, listenerCallback = false;
          const report = () => ({ closed: listenerCallback && !server.listening && sockets.size === 0,
            listenerClosed: !server.listening, ownedSocketsRemaining: sockets.size,
            originalDiagnosticsInFlight: running.size, retainedOriginalSession: true, retainedOriginalCustody: true });
          const finish = () => {
            if (!done && report().closed) { done = true; clearTimeout(limit); resolve(report()); }
          };
          const limit = setTimeout(() => {
            if (!done) { done = true; reject(Object.assign(new Error('MOBILE_ORIGINAL_HTTP_CLEANUP_UNCONFIRMED'),
              { code: 'MOBILE_ORIGINAL_HTTP_CLEANUP_UNCONFIRMED', cleanup: report() })); }
          }, CLOSE_MS); limit.unref();
          confirmOwnedClose = finish;
          server.close(() => { listenerCallback = true; finish(); });
          for (const socket of sockets) socket.destroy(); finish();
        });
      }
      return closePromise;
    },
  });
}
