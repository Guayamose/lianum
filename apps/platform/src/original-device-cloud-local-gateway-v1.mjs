/** Fixed local ingress for a NEW original Native/SQL realm. The generic API
 * remains unbound. Requests select neither an upstream nor economic resources;
 * the original listener owns consent, admission, proof deadlines and UNKNOWN. */
import { createServer } from 'node:http';
import { assertOriginalDeviceCloudPublicSourcesV1 } from './original-device-cloud-source-pins-v1.mjs';
import { request as tlsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { types } from 'node:util';
import { normalizeMobileOrigin } from '../../../packages/mobile-protocol/src/authorization.mjs';
import { startPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3, reopenPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3 } from './original-device-local-operator-v1.mjs';
import { assertOriginalDeviceDispatchSchemaV1 } from './original-device-schema-v1.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
function exact(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== names.length || !names.every(name =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value')))
    fail('PLATFORM_ORIGINAL_GATEWAY_CONFIGURATION');
}
const statePath = '/v2/mobile/original-account/state';
const routes = new Map();
for (const [prefix, suffixes] of [
  ['/v2/mobile/original-account/', ['challenges', 'reviews', 'diagnostics']],
  ['/v1/mobile/original-account/private-state/', ['challenges', 'reviews', 'observations']],
  ['/v1/mobile/device-deposit/', ['job-reviews', 'private-jobs', 'funding-reviews', 'fund', 'observation-reviews', 'observations']],
  ['/v1/mobile/device-reservation/', ['preparation-reviews', 'job-reviews', 'private-jobs', 'reservation-reviews', 'reserve', 'observation-reviews', 'observations']],
  ['/v1/mobile/device-execution/', ['execution-reviews', 'execute', 'reconciliation-reviews', 'reconcile', 'recovery-reviews', 'recover', 'output-balances', 'arm-reviews', 'disarm-reviews', 'arm', 'disarm', 'arm-status']],
  ['/v1/mobile/device-exit/', ['preparation-reviews', 'job-reviews', 'private-jobs', 'withdrawal-reviews', 'withdraw', 'observation-reviews', 'observations']],
]) for (const suffix of suffixes) routes.set(prefix + suffix, {
  bytes: prefix.includes('device-reservation') && suffix === 'private-jobs' ? 81920
    : prefix.includes('device-exit') && suffix === 'private-jobs' ? 32768
    : prefix.includes('device-deposit') && suffix === 'private-jobs' ? 16384 : 8192,
  responseMs: suffix === 'private-jobs' ? 900000 : 5000,
});
function reply(response, status, bytes) {
  if (response.destroyed || response.writableEnded) return;
  const output = Buffer.from(bytes); // keep transport ownership until flushed
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length,
    'cache-control': 'no-store', 'connection': 'close', 'x-content-type-options': 'nosniff' });
  response.once('close', () => output.fill(0)); response.end(output, () => output.fill(0));
}
const errorBytes = code => Buffer.from(JSON.stringify({ error: code }));
async function body(request, maximum) {
  const length = request.headers['content-length'];
  if (request.headers['content-type'] !== 'application/json' || request.headers['content-encoding'] !== undefined
    || request.headers['transfer-encoding'] !== undefined || typeof length !== 'string'
    || !/^[1-9][0-9]{0,4}$/.test(length) || Number(length) < 2 || Number(length) > maximum)
    fail('PLATFORM_ORIGINAL_GATEWAY_BODY');
  const parts = []; let bytes = 0, timer;
  try {
    timer = setTimeout(() => request.destroy(), 5000); timer.unref();
    for await (const part of request) {
      parts.push(part); bytes += part.length;
      if (bytes > Number(length) || bytes > maximum) fail('PLATFORM_ORIGINAL_GATEWAY_BODY');
    }
    if (bytes !== Number(length)) fail('PLATFORM_ORIGINAL_GATEWAY_BODY');
    return Buffer.concat(parts);
  } finally { clearTimeout(timer); for (const part of parts) part.fill(0); }
}
export async function startPlatformOriginalDeviceCloudLocalGatewayV1(input) {
  if(arguments.length!==1)fail('PLATFORM_ORIGINAL_GATEWAY_CONFIGURATION');
  return openOriginalGateway(input,false);
}
/** Separate fixed entry: no caller mode, existing runtime or checkpoint DTO. */
export async function reopenPlatformOriginalDeviceCloudLocalGatewayV1(input) {
  if(arguments.length!==1)fail('PLATFORM_ORIGINAL_GATEWAY_CONFIGURATION');
  return openOriginalGateway(input,true);
}
async function openOriginalGateway(input, reopening) {
  assertOriginalDeviceCloudPublicSourcesV1();
  exact(input, ['origin', 'devicePublicKey', 'tls', 'pool', 'privacyKey', 'port']);
  exact(input.tls, ['certificate', 'privateKey']);
  if (normalizeMobileOrigin(input.origin) !== input.origin || !Number.isInteger(input.port) || input.port < 0 || input.port > 65535)
    fail('PLATFORM_ORIGINAL_GATEWAY_CONFIGURATION');
  const originText = input.origin, devicePublicKey = input.devicePublicKey, ca = input.tls.certificate, pool = input.pool, listeningPort = input.port;
  const origin = new URL(originText), hostname = origin.hostname.replace(/^\[|\]$/g, ''), upstreamPort = Number(origin.port || '443');
  if (listeningPort !== 0 && listeningPort === upstreamPort) fail('PLATFORM_ORIGINAL_GATEWAY_PORT_CONFLICT');
  const certificate = new X509Certificate(ca);
  if (certificate.ca || !certificate.checkPrivateKey(createPrivateKey(input.tls.privateKey))) fail('PLATFORM_ORIGINAL_GATEWAY_TLS');
  let service, server, closing = false, closePromise, ingressStop, capturePromise; const running = new Set(), sockets = new Set();
  function forward(path, method, bytes, responseMs) {
    return new Promise((resolve, reject) => {
      // TCP destination is fixed loopback. TLS identity and Host remain the
      // descriptor's original origin; no request can choose another target.
      const request = tlsRequest({ hostname: '127.0.0.1', port: upstreamPort, servername: hostname, method, path,
        ca: ca, rejectUnauthorized: true, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', agent: false,
        checkServerIdentity(name, peer) {
          const mismatch = checkServerIdentity(hostname, peer);
          return mismatch ?? (peer.raw && Buffer.from(peer.raw).equals(certificate.raw) ? undefined : Error('PLATFORM_ORIGINAL_GATEWAY_TLS'));
        }, headers: { Host: origin.host, ...(method === 'POST' ? { Origin: originText, 'Content-Type': 'application/json', 'Content-Length': bytes.length } : {}) },
      }, response => {
        const parts = []; let total = 0;
        response.on('data', part => { parts.push(part); total += part.length;
          if (total > 1048576) response.destroy(Error('PLATFORM_ORIGINAL_GATEWAY_RESPONSE')); });
        response.once('error', error => { for (const part of parts) part.fill(0); reject(error); });
        response.once('end', () => { const output = Buffer.concat(parts); for (const part of parts) part.fill(0);
          resolve({ status: response.statusCode, bytes: output }); });
      });
      const timer = setTimeout(() => request.destroy(Error('PLATFORM_ORIGINAL_GATEWAY_RESPONSE')), responseMs); timer.unref();
      request.once('close', () => clearTimeout(timer)); request.once('error', reject);
      request.end(bytes);
    });
  }
  function stopIngress() {
    closing=true;
    return ingressStop??=(async()=>{
      const stopped=server?.listening?new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())):Promise.resolve();
      for(const socket of sockets)socket.destroy();
      await Promise.allSettled([...running]);
      await stopped;
    })();
  }
  function capture() {
    if(arguments.length!==0||reopening)fail('PLATFORM_ORIGINAL_GATEWAY_CAPTURE_UNAVAILABLE');
    if(capturePromise)return capturePromise;
    if(closing||!service)fail('PLATFORM_ORIGINAL_GATEWAY_CLOSED');
    closing=true;
    capturePromise=(async()=>{
      try{
        await stopIngress();
        const value=await service.capture();
        if(!value.closed||!value.originalResourcesStopped||value.plannedCaptureForNewProcess!==true)fail('PLATFORM_ORIGINAL_GATEWAY_CAPTURE_UNCONFIRMED');
        return Object.freeze({...value,originalIngressStopped:true});
      }catch(error){
        try{const value=await service.close();if(!value.closed||!value.originalResourcesStopped)fail('PLATFORM_ORIGINAL_GATEWAY_CLOSE');}
        catch(failure){throw new AggregateError([error,failure],'PLATFORM_ORIGINAL_GATEWAY_CAPTURE_CLOSE');}
        throw error;
      }
    })();capturePromise.catch(()=>{});return capturePromise;
  }
  function close() {
    if(arguments.length!==0)fail('PLATFORM_ORIGINAL_GATEWAY_CONFIGURATION');
    closing=true;
    return closePromise??=(async()=>{
      let first;
      try{await stopIngress();}catch(error){first=error;}
      try{if(capturePromise)await capturePromise;else if(service){const value=await service.close();if(!value.closed||!value.originalResourcesStopped)fail('PLATFORM_ORIGINAL_GATEWAY_CLOSE');}}
      catch(error){first??=error;}
      if(first)throw first;
      return Object.freeze({closed:true,originalResourcesStopped:true});
    })();
  }
  try {
    await assertOriginalDeviceDispatchSchemaV1(pool);
    service = await (reopening?reopenPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3:startPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3)({ origin: originText, devicePublicKey: devicePublicKey,
      tls: { certificate: ca, privateKey: input.tls.privateKey }, pool: pool, privacyKey: input.privacyKey });
    if (service.profile !== 'ORIGINAL_NATIVE_DEVICE_PRIVATE_WORKER_DURABLE_NOTE_OPERATOR_V3' || service.descriptor.origin !== originText
      || service.descriptor.devicePublicKey !== devicePublicKey || service.automaticFunding !== false || service.durableOriginalAdmission !== true || (reopening&&service.readReconcileWithdrawalOnly!==true)) fail('PLATFORM_ORIGINAL_GATEWAY_ORIGINAL');
    server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
      const work = (async () => {
        if (closing) return reply(response, 503, errorBytes('DISCONNECTED'));
        if (request.method === 'GET' && request.url === '/health/live') return reply(response, 200, errorBytes('LOCAL_TRANSPORT_LIVE'));
        if (request.method === 'GET' && request.url === '/health/ready') {
          let original;
          try {
            await assertOriginalDeviceDispatchSchemaV1(pool);
            original = await forward(statePath, 'GET', undefined, 5000);
            const state = JSON.parse(original.bytes.toString('utf8'));
            if (original.status !== 200 || state.profile !== 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2' || state.connection !== 'PAIRED' || closing)
              fail('PLATFORM_ORIGINAL_GATEWAY_NOT_READY');
            reply(response, 200, Buffer.from(JSON.stringify({ status: 'READY', originalListener: true, economicObservation: null, cloudDeploymentEstablished: false })));
          } catch { reply(response, 503, errorBytes('UNAVAILABLE')); }
          finally { original?.bytes.fill(0); }
          return;
        }
        if (request.url === '/v1/mobile/challenges' || request.url === '/v1/mobile/authorizations')
          return reply(response, 503, errorBytes('MOBILE_BACKEND_UNAVAILABLE'));
        const selected = routes.get(request.url), read = request.method === 'GET' && request.url === statePath;
        if(reopening&&!read&&!(request.url.startsWith('/v1/mobile/original-account/private-state/')
          ||['/v2/mobile/original-account/challenges','/v2/mobile/original-account/reviews','/v2/mobile/original-account/diagnostics',
            '/v1/mobile/device-deposit/observation-reviews','/v1/mobile/device-deposit/observations',
            '/v1/mobile/device-reservation/observation-reviews','/v1/mobile/device-reservation/observations',
            '/v1/mobile/device-execution/reconciliation-reviews','/v1/mobile/device-execution/reconcile','/v1/mobile/device-execution/output-balances'].includes(request.url)
          ||request.url.startsWith('/v1/mobile/device-exit/')))return reply(response,403,errorBytes('ORIGINAL_OBSERVATION_OR_RETAINED_EXIT_ONLY'));
        if (!read && (request.method !== 'POST' || !selected)) return reply(response, 404, errorBytes('NOT_FOUND'));
        if (request.headers.host !== origin.host || (!read && request.headers.origin !== originText))
          return reply(response, 403, errorBytes('REQUEST_REJECTED'));
        let bytes, original;
        try {
          if (!read) bytes = await body(request, selected.bytes);
          if (closing) fail('PLATFORM_ORIGINAL_GATEWAY_CLOSED');
          original = await forward(request.url, request.method, bytes, read ? 5000 : selected.responseMs);
          reply(response, original.status, original.bytes);
        } catch (error) { reply(response, error?.code === 'PLATFORM_ORIGINAL_GATEWAY_BODY' ? 400 : 502,
          errorBytes(error?.code === 'PLATFORM_ORIGINAL_GATEWAY_BODY' ? 'REQUEST_REJECTED' : 'ORIGINAL_TRANSPORT_UNAVAILABLE_NO_RETRY')); }
        finally { bytes?.fill(0); original?.bytes.fill(0); }
      })();
      running.add(work); work.finally(() => running.delete(work)).catch(() => {});
    });
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    server.on('clientError', (_, socket) => socket.destroy());
    server.headersTimeout = 2000; server.requestTimeout = 5000; server.keepAliveTimeout = 1;
    server.maxRequestsPerSocket = 1; server.maxConnections = 4;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listeningPort, '127.0.0.1', resolve); });
    return Object.freeze({ profile: 'ORIGINAL_DEVICE_CLOUD_LOCAL_GATEWAY_V1', port: server.address().port,
      descriptor: service.descriptor, automaticFunding: false, durableOriginalAdmission: true,
      privateD26AndW39Intake: true, privateUOpeningIntake: true, nativeRecipientToWorkerEncrypted: true, cloudDeploymentEstablished: false, originalOrderedReopen: reopening, readReconcileWithdrawalOnly: reopening, capture, close });
  } catch (error) { try { await close(); } catch (failure) { throw new AggregateError([error, failure], 'PLATFORM_ORIGINAL_GATEWAY_START_CLOSE'); } throw error; }
}
