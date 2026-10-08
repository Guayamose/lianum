/** Private loopback transport for exactly one retained same-realm actor. TLS,
 * remote routing, public API adoption and economic capabilities are absent.
 * Losing/closing HTTP never cancels or retries an original admission. */
import { createServer } from 'node:http';
import { types } from 'node:util';
import { assertPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 }
  from './paired-original-account-actor-v2.mjs';
const listeners = new WeakSet();
const BODY_LIMIT = 8192, REQUEST_MS = 5000, CLOSE_MS = 1000;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const state = Object.freeze({ version: 2, profile: 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2', connection: 'PAIRED',
  privatePortfolio: null, economicObservation: null, noteCustodyOnDevice: false,
  nativeEffectsEstablished: false, actions: Object.freeze({ read: true, reconcile: true }) });
function exactInput(input) {
  if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype
    || Reflect.ownKeys(input).length !== 1 || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, 'actor') ?? {}, 'value'))
    fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
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
  for await (const part of request) {
    bytes += part.length;
    if (bytes > BODY_LIMIT || bytes > Number(length)) fail('HTTP_BODY_REJECTED'); parts.push(part);
  }
  if (bytes !== Number(length)) fail('HTTP_BODY_REJECTED');
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { fail('HTTP_BODY_REJECTED'); }
}
export async function createPairedOriginalAccountHttpServerV2(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION'); exactInput(input);
  const actor = input.actor; assertPairedOriginalAccountActorV2(actor);
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  if (listeners.has(actor)) fail('MOBILE_ORIGINAL_HTTP_ALREADY_BOUND'); listeners.add(actor);
  const sockets = new Set(), running = new Set(); let closed = false, closePromise, confirmOwnedClose;
  const server = createServer({ maxHeaderSize: BODY_LIMIT }, (request, response) => {
    const work = (async () => {
      if (closed) fail('HTTP_CLOSED');
      if (request.url === '/v2/mobile/original-account/state' && request.method === 'GET') {
        assertPairedOriginalAccountActorV2(actor); return state;
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
  });
  server.headersTimeout = 2000; server.requestTimeout = REQUEST_MS; server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1; server.maxConnections = 4;
  server.on('connection', socket => {
    sockets.add(socket);
    // Independent owned-socket deadline also bounds incomplete HTTP headers.
    const headers = setTimeout(() => socket.destroy(), 2000); headers.unref();
    socket.once('close', () => { clearTimeout(headers); sockets.delete(socket); confirmOwnedClose?.(); });
    // Install before any socket data is parsed: the request event can precede
    // another data listener when a complete header arrives in its first chunk.
    const clear = request => { if (request.socket === socket) { clearTimeout(headers); server.off('request', clear); } };
    server.on('request', clear); socket.once('close', () => server.off('request', clear));
  });
  try {
    await new Promise((resolve, reject) => {
      const failed = error => { server.off('listening', ready); reject(error); };
      const ready = () => { server.off('error', failed); resolve(); };
      server.once('error', failed); server.once('listening', ready); server.listen(0, '127.0.0.1');
    });
  } catch (error) { listeners.delete(actor); for (const socket of sockets) socket.destroy(); server.close(); throw error; }
  const address = server.address(), url = 'http://127.0.0.1:' + address.port;
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
