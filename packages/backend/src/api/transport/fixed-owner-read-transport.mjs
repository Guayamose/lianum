/** Internal fixed-route HTTP plumbing for read-only Node/local-bridge clients.
 * Only the three named GETs are exported. No caller path/header/RPC selection.
 * Public SDK modules validate their route's schema before exposing any data. */
import { request as httpRequest } from 'node:http';
import { types } from 'node:util';

export const OWNER_READ_RESPONSE_LIMIT = 256 * 1024;
export const OWNER_READ_TIMEOUT_MS = 5000;
export const FLAT_OWNER_READ_TIMEOUT_MS = 90000;
const NATIVE_CODE = /^(?:NATIVE_CLAIM|CLAIM|VAULT|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|FLAT_OPERATOR|COMBINED_OPERATOR)_[A-Z0-9_]{1,100}$/;
const FLAT_CODE = /^(?:FLAT_ACCOUNT|JOURNAL)_[A-Z0-9_]{1,90}$/;
const routes = Object.freeze({
  nativeSnapshot: Object.freeze({ path: '/api/native-claims/snapshot', header: 'x-native-owner-token', prefix: 'NATIVE_CLAIM_STATUS',
    code: NATIVE_CODE, timeoutMilliseconds: OWNER_READ_TIMEOUT_MS }),
  nativeOwner: Object.freeze({ path: '/api/native-claims/owner', header: 'x-native-owner-token', prefix: 'NATIVE_CLAIM_STATUS',
    code: NATIVE_CODE, timeoutMilliseconds: OWNER_READ_TIMEOUT_MS }),
  // This producer can perform two independently bounded 30-second CLAIM
  // health audits plus account reads. Only client response waiting changes.
  flatOwner: Object.freeze({ path: '/api/flat-account/owner', header: 'x-flat-owner-token', prefix: 'FLAT_ACCOUNT_OWNER_CLIENT',
    code: FLAT_CODE, timeoutMilliseconds: FLAT_OWNER_READ_TIMEOUT_MS }),
});
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function access(input, route, count) {
  const invalid = route.prefix + '_ACCESS_INVALID', fields = ['origin', ...(route.header ? ['token'] : [])];
  if (count !== 1 || !input || typeof input !== 'object' || types.isProxy(input)
    || Object.getPrototypeOf(input) !== Object.prototype) fail(invalid);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || !fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, 'value'))) fail(invalid);
  const origin = input.origin, port = typeof origin === 'string' ? /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(origin) : null;
  if (!port || port[0] !== origin || Number(port[1]) > 65535) fail(invalid);
  if (route.header && !match(input.token, /^[0-9a-f]{64}$/)) fail(invalid);
  return { origin, port: Number(port[1]), ...(route.header ? { token: input.token } : {}) };
}
function read(input, route, count) {
  const credentials = access(input, route, count), code = suffix => route.prefix + '_' + suffix;
  const options = { hostname: '127.0.0.1', port: credentials.port, method: 'GET', path: route.path,
    agent: false, maxHeaderSize: 8192,
    headers: { Host: '127.0.0.1:' + credentials.port, Origin: credentials.origin, Accept: 'application/json',
      'Accept-Encoding': 'identity', ...(route.header ? { [route.header]: credentials.token } : {}) } };
  return new Promise(resolve => {
    let request, response, timer, settled = false, bytes = 0; const chunks = [];
    const finish = (body, errorCode, httpStatus = null) => {
      if (settled) return; settled = true; clearTimeout(timer); chunks.length = 0;
      resolve(Object.freeze({ body, errorCode, httpStatus }));
    };
    const stop = (errorCode, status = null) => { finish(null, errorCode, status); response?.destroy(); request?.destroy(); };
    timer = setTimeout(() => stop(code('TIMEOUT')), route.timeoutMilliseconds);
    try {
      request = httpRequest(options, incoming => {
        response = incoming;
        const status = Number.isInteger(response.statusCode) ? response.statusCode : null;
        response.on('error', () => stop(code('NETWORK_UNAVAILABLE'), status));
        response.on('aborted', () => stop(code('RESPONSE_INCOMPLETE'), status));
        response.on('close', () => { if (!settled) stop(code('RESPONSE_INCOMPLETE'), status); });
        if (settled) { response.destroy(); return; }
        // The primitive never follows redirects; Location is never a target.
        if (status >= 300 && status < 400) return stop(code('REDIRECT_FORBIDDEN'), status);
        const headers = response.headers, contentType = headers['content-type'], length = headers['content-length'];
        if (!match(contentType, /^application\/json(?:;\s*charset=utf-8)?$/i)
          || headers['content-encoding'] !== undefined && headers['content-encoding'] !== 'identity')
          return stop(code('RESPONSE_INVALID'), status);
        if (length !== undefined && (!match(length, /^(0|[1-9][0-9]*)$/)
          || Number(length) > OWNER_READ_RESPONSE_LIMIT)) return stop(code('RESPONSE_TOO_LARGE'), status);
        response.on('data', chunk => {
          if (settled) return; bytes += chunk.length;
          if (bytes > OWNER_READ_RESPONSE_LIMIT) return stop(code('RESPONSE_TOO_LARGE'), status);
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          if (response.complete === false || length !== undefined && Number(length) !== bytes)
            return stop(code('RESPONSE_INCOMPLETE'), status);
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { return stop(code('RESPONSE_INVALID'), status); }
          if (status !== 200) {
            const known = body && typeof body === 'object' && Object.keys(body).length === 1 && match(body.error, route.code);
            return finish(null, known ? body.error : code('HTTP_ERROR'), status);
          }
          finish(body, null, status);
        });
      });
      request.on('error', () => stop(code('NETWORK_UNAVAILABLE')));
      request.end(); // Exact GET, no body, one attempt, no retry or mutation.
    } catch { stop(code('NETWORK_UNAVAILABLE')); }
  });
}
export async function readNativeClaimSnapshotWire(input) { return read(input, routes.nativeSnapshot, arguments.length); }
export async function readNativeClaimOwnerWire(input) { return read(input, routes.nativeOwner, arguments.length); }
export async function readFlatAccountOwnerWire(input) { return read(input, routes.flatOwner, arguments.length); }
