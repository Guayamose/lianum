import {isOriginalNativePrivateExecutionBridgeV2} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
/** Direct transport for exactly one retained same-realm actor. The HTTP factory
 * remains loopback-only; an operator may install the same dispatcher with TLS.
 * No public platform adoption or new economic capabilities are issued.
 * Losing/closing HTTP never cancels or retries an original admission. */
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { types } from 'node:util';
import { assertPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2, nativePairedActorEconomicSourceV1, assertNativeActorSessionAccountMembershipV1 }
  from './paired-original-account-actor-v2.mjs';
import { assertNativeEconomicRecoveryCaptureV1 } from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { deviceOwnerReservationBridgeActorV1 } from '../../accounts/authority/device-owner-reservation-bridge-v1.mjs';
import {deviceOwnerExecutionBridgeActorV1,assertDeviceOwnerExecutionTransportBindingsV1} from '../../accounts/authority/device-owner-execution-bridge-v1.mjs';
import {wipeDeviceExitWitnessV1} from '../../../../mobile-protocol/src/device-exit-consent-v1.mjs';
import { wipeDeviceReservationWitnessV1 } from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
import { deviceOwnerDepositBridgeActorV1,isOriginalNativePrivateDepositBridgeV2 } from '../../accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { assertOriginalDeviceDurableDispatchBindingsV1, runOriginalDeviceDurableDispatchV1 }
  from './original-device-durable-dispatch-v1.mjs';
const listeners = new WeakSet(), ownedTransports = new WeakMap(), depositContinuations = new WeakMap();
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
async function jsonBody(request, maximum = BODY_LIMIT) {
  if (request.headers['content-type'] !== 'application/json' || request.headers['content-encoding'] !== undefined
    || request.headers['transfer-encoding'] !== undefined) fail('HTTP_BODY_REJECTED');
  const length = request.headers['content-length'];
  if (typeof length !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(length)
    || Number(length) < 2 || Number(length) > maximum) fail('HTTP_BODY_REJECTED');
  const parts = []; let bytes = 0;
  let owned;
  try {
    for await (const part of request) {
      bytes += part.length; parts.push(part);
      if (bytes > maximum || bytes > Number(length)) fail('HTTP_BODY_REJECTED');
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
/** Separate fixed U/S installation; the accepted D26 listener keeps its
 * original routes/body budget. No route accepts a bridge or native preparation. */
export async function createPairedDeviceReservationTlsServerV1(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['bridge', 'tls', 'host'] : ['bridge', 'tls'];
  exactInput(input, names); const actor = deviceOwnerReservationBridgeActorV1(input.bridge);
  const host = names.includes('host') ? input.host : '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor), tls = tlsMaterial(input.tls, descriptor);
  try { return await startOriginalTransport(actor, tls, host, null, input.bridge); }
  finally { tls.privateKey.fill(0); }
}
/** Fixed continuation listener shares the original actor/TLS dispatcher. The
 * previous D26/U/S listener must be closed; no second listener or transport is
 * authority to select/change native providers or resend an original delivery. */
export async function createPairedDeviceExecutionTlsServerV1(input){
  if(arguments.length!==1)fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names=input&&!types.isProxy(input)&&Object.hasOwn(input,'host')?['bridge','reservationBridge','tls','host']:['bridge','reservationBridge','tls'];
  exactInput(input,names);const actor=deviceOwnerExecutionBridgeActorV1(input.bridge);
  if(actor!==deviceOwnerReservationBridgeActorV1(input.reservationBridge))fail('MOBILE_ORIGINAL_EXECUTION_ACTOR_CHANGED');
  const host=names.includes('host')?input.host:'127.0.0.1';if(!['127.0.0.1','0.0.0.0'].includes(host))fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const descriptor=pairedOriginalAccountActorDescriptorV2(actor),tls=tlsMaterial(input.tls,descriptor);
  try{return await startOriginalTransport(actor,tls,host,null,input.reservationBridge,input.bridge);}finally{tls.privateKey.fill(0);}
}
/** One long-lived local service for the app's existing D26/U/S/native/W39
 * clients. Only ORIGINAL same-account bridges installed before S are accepted.
 * This fixed composition uses the existing dispatcher/budgets/TLS/consents;
 * no SQL executor, bridge ID, handler callback or remote bootstrap exists. */
export async function createPairedDeviceAccountTlsServerV1(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['depositBridge', 'reservationBridge', 'executionBridge', 'tls', 'host']
    : ['depositBridge', 'reservationBridge', 'executionBridge', 'tls'];
  exactInput(input, names);
  const actor = deviceOwnerDepositBridgeActorV1(input.depositBridge);
  if (actor !== deviceOwnerReservationBridgeActorV1(input.reservationBridge)
    || actor !== deviceOwnerExecutionBridgeActorV1(input.executionBridge))
    fail('MOBILE_ORIGINAL_EXECUTION_ACTOR_CHANGED');
  assertDeviceOwnerExecutionTransportBindingsV1(input.executionBridge, input.reservationBridge);
  const host = names.includes('host') ? input.host : '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor), tls = tlsMaterial(input.tls, descriptor);
  try { return await startOriginalTransport(actor, tls, host,
    input.depositBridge, input.reservationBridge, input.executionBridge); }
  finally { tls.privateKey.fill(0); }
}
/** Explicit original-device SQL composition. SQL admission precedes only the
 * existing signed effects; the same original bridges still verify their own
 * pending consent, account state, owner and native execution capabilities. */
export async function createPairedDurableDeviceAccountTlsServerV1(input) {
  if (arguments.length !== 1) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const names = input && !types.isProxy(input) && Object.hasOwn(input, 'host')
    ? ['depositBridge', 'reservationBridge', 'executionBridge', 'dispatch', 'tls', 'host']
    : ['depositBridge', 'reservationBridge', 'executionBridge', 'dispatch', 'tls'];
  exactInput(input, names);
  const actor = assertOriginalDeviceDurableDispatchBindingsV1(input.dispatch, {
    depositBridge: input.depositBridge, reservationBridge: input.reservationBridge, executionBridge: input.executionBridge,
  });
  const host = names.includes('host') ? input.host : '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) fail('MOBILE_ORIGINAL_TLS_CONFIGURATION');
  const tls = tlsMaterial(input.tls, pairedOriginalAccountActorDescriptorV2(actor));
  try { return await startOriginalTransport(actor, tls, host,
    input.depositBridge, input.reservationBridge, input.executionBridge, input.dispatch); }
  finally { tls.privateKey.fill(0); }
}
/** Retire only an ORIGINAL D26 TLS listener for its fixed U/S continuation.
 * Its private retained lease follows the same actor; it never grants an account,
 * bridge, handler or financial permission. Normal close still closes the actor. */
export async function handoffPairedDeviceDepositTlsServerV1(transport) {
  if (arguments.length !== 1 || types.isProxy(transport)) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const owned = ownedTransports.get(transport);
  if (!owned || !owned.deposit || owned.handoff || owned.closed() || depositContinuations.has(owned.actor))
    fail('MOBILE_ORIGINAL_DEPOSIT_HANDOFF_REQUIRED');
  assertPairedOriginalAccountActorV2(owned.actor);
  if (owned.running() !== 0) fail('MOBILE_ORIGINAL_HTTP_HANDOFF_BUSY');
  owned.handoff = true;
  const closed = await owned.retire();
  if (!closed.closed || closed.ownedSocketsRemaining !== 0 || closed.originalDiagnosticsInFlight !== 0)
    fail('MOBILE_ORIGINAL_HTTP_CLEANUP_UNCONFIRMED');
  assertPairedOriginalAccountActorV2(owned.actor);
  depositContinuations.set(owned.actor, owned); listeners.delete(owned.actor);
  return Object.freeze({ ...closed, actorRetainedForOriginalContinuation: true });
}
async function startOriginalTransport(actor, tls, host, bridge = null, reservationBridge = null, executionBridge = null, dispatch = null) {
  assertPairedOriginalAccountActorV2(actor);
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  const continuation = depositContinuations.get(actor);
  if (continuation && (!tls || reservationBridge === null || !continuation.handoff || continuation.transferred
    || (bridge !== null && (bridge !== continuation.bridge || executionBridge === null))))
    fail('MOBILE_ORIGINAL_DEPOSIT_CONTINUATION_REQUIRED');
  // The composed continuation retains the SAME original deposit controller.
  // Its public factory already authenticates all three bridges by private marks;
  // historical two-controller handoff still passes bridge=null unchanged.
  if (listeners.has(actor)) fail('MOBILE_ORIGINAL_HTTP_ALREADY_BOUND'); listeners.add(actor);
  const sockets = new Set(), running = new Set(); let closed = false, closePromise, confirmOwnedClose;
  const handler = (request, response) => {
    let deadline,requestTimedOut=false,rejectDeadline;
    const armResponseDeadline=milliseconds=>{clearTimeout(deadline);deadline=setTimeout(()=>{requestTimedOut=true;rejectDeadline(Object.assign(new Error('HTTP_REQUEST_TIMEOUT'),{code:'HTTP_REQUEST_TIMEOUT'}));},milliseconds);deadline.unref();};
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
      if(executionBridge!==null&&request.method==='POST'&&request.url.startsWith('/v1/mobile/device-exit/')){
        if(!tls||request.headers.origin!==descriptor.origin)fail('HTTP_ORIGIN_REJECTED');
        const methods={'preparation-reviews':'prepareExit','job-reviews':'challengeExitJob',jobs:'proveExit','private-jobs':'proveExit',
          'withdrawal-reviews':'challengeWithdrawal',withdraw:'withdraw','observation-reviews':'challengeExitObservation',observations:'observeExit'};
        const method=methods[request.url.slice('/v1/mobile/device-exit/'.length)];if(!method)fail('HTTP_NOT_FOUND');
        const privateExit=isOriginalNativePrivateExecutionBridgeV2(executionBridge),route=request.url.slice('/v1/mobile/device-exit/'.length);if(method==='proveExit'&&privateExit!==(route==='private-jobs'))fail('HTTP_NOT_FOUND');const input=await jsonBody(request,privateExit&&method==='proveExit'?32768:undefined);if(closed)fail('HTTP_CLOSED');if(privateExit&&method==='proveExit'){if(requestTimedOut||!request.complete)fail('HTTP_REQUEST_TIMEOUT');armResponseDeadline(900000);}
        try{return dispatch && method === 'withdraw'
          ? await runOriginalDeviceDurableDispatchV1(dispatch, executionBridge, method, input)
          : await executionBridge[method](input);}finally{if(method==='proveExit')wipeDeviceExitWitnessV1(input.witness);}
      }
      if(executionBridge!==null&&request.method==='POST'&&request.url.startsWith('/v1/mobile/device-execution/')){
        if(!tls||request.headers.origin!==descriptor.origin)fail('HTTP_ORIGIN_REJECTED');
        const methods={'execution-reviews':'challengeExecution',execute:'execute','reconciliation-reviews':'challengeReconciliation',
          reconcile:'reconcile','recovery-reviews':'challengeRecovery',recover:'recover','output-balances':'observeOutputBalances',
          'arm-reviews':'challengeRecoveryArm','disarm-reviews':'challengeRecoveryDisarm',arm:'armRecovery',disarm:'disarmRecovery','arm-status':'observeRecoveryArm'};
        const method=methods[request.url.slice('/v1/mobile/device-execution/'.length)];if(!method)fail('HTTP_NOT_FOUND');
        const input=await jsonBody(request);if(closed)fail('HTTP_CLOSED');
        return dispatch && ['execute', 'recover'].includes(method)
          ? runOriginalDeviceDurableDispatchV1(dispatch, executionBridge, method, input) : executionBridge[method](input);
      }
      if (reservationBridge !== null && request.method === 'POST' && request.url.startsWith('/v1/mobile/device-reservation/')) {
        if (!tls || request.headers.origin !== descriptor.origin) fail('HTTP_ORIGIN_REJECTED');
        const methods = { 'preparation-reviews': 'challengePreparation', 'job-reviews': 'challengeJob', 'jobs': 'prove',
          'reservation-reviews': 'challengeReservation', 'reserve': 'reserve', 'observation-reviews': 'challengeObservation', 'observations': 'observe' };
        const method = methods[request.url.slice('/v1/mobile/device-reservation/'.length)]; if (!method) fail('HTTP_NOT_FOUND');
        // Fixed capacity-four owner witness plus framed consent. Existing
        // diagnostic/D26 and other U/S routes retain their original 8KiB body bound.
        const input = await jsonBody(request, method === 'prove' ? 32768 : BODY_LIMIT); if (closed) fail('HTTP_CLOSED');
        try { return dispatch && method === 'reserve'
          ? await runOriginalDeviceDurableDispatchV1(dispatch, reservationBridge, method, input)
          : await reservationBridge[method](input); }
        finally { if (method === 'prove') wipeDeviceReservationWitnessV1(input.witness); }
      }
      if (bridge !== null && request.method === 'POST' && request.url.startsWith('/v1/mobile/device-deposit/')) {
        if (!tls || request.headers.origin !== descriptor.origin) fail('HTTP_ORIGIN_REJECTED');
        const route=request.url.slice('/v1/mobile/device-deposit/'.length),privateBridge=isOriginalNativePrivateDepositBridgeV2(bridge);
        const methods = { 'job-reviews': 'challengeJob', 'jobs': 'prove', 'private-jobs':'prove','funding-reviews': 'challengeFunding',
          'fund': 'fund', 'observation-reviews': 'challengeObservation', 'observations': 'observe' };
        const method = methods[route];
        if (!method||(route==='private-jobs'&&!privateBridge)||(route==='jobs'&&privateBridge)) fail('HTTP_NOT_FOUND');
        const input = await jsonBody(request,route==='private-jobs'?16384:BODY_LIMIT); if (closed) fail('HTTP_CLOSED');
        // Only the fixed private producer gets the original proof response
        // window, after its body met the unchanged 5s ingestion deadline.
        if(route==='private-jobs'){if(requestTimedOut||!request.complete)fail('HTTP_REQUEST_TIMEOUT');armResponseDeadline(900000);}
        // A proof job is retained by the original account even if this HTTP
        // response is lost/times out. Its opening has no logs/journal storage.
        try { return dispatch && method === 'fund'
          ? await runOriginalDeviceDurableDispatchV1(dispatch, bridge, method, input) : await bridge[method](input); }
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
          return { challenge: await actor.privateStateChallenge() };
        }
        if (request.url.endsWith('/reviews')) return { review: await actor.openPrivateStateReview(value) };
        return actor.readPrivateState(value);
      }
      if (request.url.endsWith('/challenges')) return { challenge: await actor.challenge(value) };
      if (request.url.endsWith('/reviews')) return { review: await actor.openReview(value) };
      return actor.submit(value);
    })();
    running.add(work); work.finally(() => running.delete(work)).catch(() => {});
    const timeout = new Promise((_, reject) => {rejectDeadline=reject;armResponseDeadline(REQUEST_MS);});
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
  const owned = { actor, deposit: tls !== null && bridge !== null && reservationBridge === null && executionBridge === null,
    handoff: false, transferred: false, tls: tls !== null, bridge, reservationBridge, executionBridge,
    nativeRecovery: null, closed: () => closed, running: () => running.size, retire: closeTransport };
  const composed = bridge !== null && reservationBridge !== null && executionBridge !== null;
  let composedClose;
  const transport = Object.freeze({ url,
    /** Invalidates controller consents, closes only owned listener/sockets, and
     * preserves admitted original work. Its owner must await the original
     * session separately; this transport never cancels custody or native work. */
    close() {
      if (arguments.length !== 0) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
      if (owned.nativeRecovery) return owned.nativeRecovery.promise;
      if (composed) {
        // Fence this listener synchronously. Already-started requests retain
        // their original admission/work; neither HTTP close nor SQL may cancel
        // or retry them. The original workers supply their existing deadlines.
        if (!composedClose) {
          const pending = [...running];
          const network = closeTransport(); network.catch(() => {});
          composedClose = (async () => {
            const outcomes = await Promise.allSettled(pending);
            if(isOriginalNativePrivateDepositBridgeV2(bridge))await bridge.close();else bridge.close();
            reservationBridge.close();if(isOriginalNativePrivateExecutionBridgeV2(executionBridge))await executionBridge.close();else executionBridge.close();
            await actor.close(); depositContinuations.delete(actor);
            const report = await network;
            return Object.freeze({ ...report, originalDiagnosticsInFlight: running.size,
              originalWorkSettled: running.size === 0,
              originalRequestsRejected: outcomes.filter(row => row.status === 'rejected').length });
          })();
        }
        return composedClose;
      }
      if(!owned.transferred&&bridge&&isOriginalNativePrivateDepositBridgeV2(bridge)){const network=closeTransport();return(async()=>{await Promise.allSettled([...running]);await bridge.close();await actor.close();depositContinuations.delete(actor);return network;})();}
      if (!owned.transferred) { const actorClose=actor.close(); depositContinuations.delete(actor);if(actorClose instanceof Promise)return actorClose.then(()=>closeTransport()); }
      return closeTransport();
    },
  });
  ownedTransports.set(transport, owned);
  if (continuation) { continuation.transferred = true; depositContinuations.delete(actor); }
  return transport;
  function closeTransport() {
      if (!closePromise) {
        closed = true;
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
  }
}

/** Fixed same-realm recovery ownership only. This closes the actual listener
 * without revoking the actor before its own encrypted capture. No HTTP route,
 * caller close option, handler or supplied descriptor can select this branch. */
export function assertNativeDeviceTransportEconomicMembershipV1(transport, expected) {
  if (arguments.length !== 2 || types.isProxy(transport)) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  exactInput(expected, ['actor', 'session', 'account']); const owned = ownedTransports.get(transport);
  if (!owned || !owned.tls || !owned.bridge || !owned.reservationBridge || !owned.executionBridge
    || owned.actor !== expected.actor || owned.closed() || owned.nativeRecovery || owned.handoff)
    fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_TRANSPORT_REQUIRED');
  assertNativeActorSessionAccountMembershipV1(owned.actor, { session: expected.session, account: expected.account });
}
export function fenceOriginalNativeDeviceTransportRecoveryV1(transport, authority) {
  if (arguments.length !== 2 || types.isProxy(transport)) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const identity = assertNativeEconomicRecoveryCaptureV1(authority), owned = ownedTransports.get(transport);
  if (!owned) fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_TRANSPORT_REQUIRED');
  if (!owned.tls || !owned.bridge || !owned.reservationBridge || !owned.executionBridge
    || owned.closed() || owned.nativeRecovery || owned.handoff) fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_TRANSPORT_REQUIRED');
  assertPairedOriginalAccountActorV2(owned.actor);
  if (nativePairedActorEconomicSourceV1(owned.actor) !== identity.sourceSHA256 || owned.running() !== 0)
    fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_CAPTURE_BUSY');
  owned.nativeRecovery = { authority, promise: null, stopped: false };
  // retire fences closed synchronously. No request can enter between the
  // transport fence and the actor/account/provider fences in the coordinator.
  owned.nativeRecovery.promise = owned.retire(); owned.nativeRecovery.promise.catch(() => {});
  return Object.freeze({ actor: owned.actor });
}
export async function stopCapturedNativeDeviceTransportRecoveryV1(transport, authority) {
  if (arguments.length !== 2 || types.isProxy(transport)) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const owned = ownedTransports.get(transport), capture = owned?.nativeRecovery;
  if (!capture || capture.authority !== authority || capture.stopped) fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_CAPTURE_REQUIRED');
  const report = await capture.promise;
  if (!report.closed || !report.listenerClosed || report.ownedSocketsRemaining !== 0
    || report.originalDiagnosticsInFlight !== 0 || owned.running() !== 0)
    fail('MOBILE_ORIGINAL_HTTP_CLEANUP_UNCONFIRMED');
  // These controllers retain no unclosed original job because running is zero.
  // Their nonce maps are invalidated; economic one-use latches remain in Vault.
  if(isOriginalNativePrivateDepositBridgeV2(owned.bridge))await owned.bridge.close();else owned.bridge.close();
  owned.reservationBridge.close();if(isOriginalNativePrivateExecutionBridgeV2(owned.executionBridge))await owned.executionBridge.close();else owned.executionBridge.close();
  capture.stopped = true; listeners.delete(owned.actor); depositContinuations.delete(owned.actor);
  return Object.freeze({ ...report, actorRetainedForOriginalRecovery: true });
}

export async function abortNativeDeviceTransportRecoveryV1(transport, authority) {
  if (arguments.length !== 2 || types.isProxy(transport)) fail('MOBILE_ORIGINAL_HTTP_CONFIGURATION');
  const owned = ownedTransports.get(transport), capture = owned?.nativeRecovery;
  if (!capture || capture.authority !== authority) fail('MOBILE_ORIGINAL_HTTP_ECONOMIC_CAPTURE_REQUIRED');
  if (capture.stopped) return { closed: true, originalResourcesStopped: true };
  await stopCapturedNativeDeviceTransportRecoveryV1(transport, authority);
  return { closed: true, originalResourcesStopped: true };
}
