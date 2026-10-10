/** Fixed, owned-loopback HTTP transport. Bootstrap capabilities never cross
 * the wire; there are no runtime, verifier, RPC or filesystem-input routes. */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { types } from 'node:util';
import { assertNativeClaimSession, nativeClaimApiErrorCode, createNativeClaimSession, createPairedOriginalNativeClaimReaderV1, assertPairedOriginalNativeClaimReaderV1 } from './native-claim-session.mjs';

export const NATIVE_CLAIM_BODY_LIMIT = 4096;
const prefix = '/api/native-claims';
const routes = Object.freeze({
  [`${prefix}/deposit`]: 'deposit', [`${prefix}/redeem`]: 'redeem',
  [`${prefix}/refund`]: 'refund', [`${prefix}/reconcile`]: 'reconcile',
  [`${prefix}/resume`]: 'resume', [`${prefix}/restart`]: 'restartKeeper',
  [`${prefix}/close`]: 'close',
});
const sensitiveHeaders = new Set(['host', 'origin', 'content-type', 'content-length',
  'x-native-claim-token', 'x-native-owner-token', 'sec-fetch-site']);

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
  if (size !== undefined && (!/^(0|[1-9][0-9]*)$/.test(size) || Number(size) > NATIVE_CLAIM_BODY_LIMIT))
    fail('NATIVE_CLAIM_BODY_TOO_LARGE');
  const chunks = await new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const chunks = [];
    request.on('data', chunk => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > NATIVE_CLAIM_BODY_LIMIT) {
        settled = true;
        chunks.length = 0;
        reject(Object.assign(new Error('NATIVE_CLAIM_BODY_TOO_LARGE'), { code: 'NATIVE_CLAIM_BODY_TOO_LARGE' }));
      } else chunks.push(chunk);
    });
    request.once('end', () => { if (!settled) { settled = true; resolve(chunks); } });
    request.once('aborted', () => { if (!settled) { settled = true; reject(new Error('NATIVE_CLAIM_REQUEST_ABORTED')); } });
    request.once('error', error => { if (!settled) { settled = true; reject(error); } });
  });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('NATIVE_CLAIM_INVALID_JSON'); }
}

/** PRIVATE bootstrap: pass a branded session, optionally a local port. Tokens
 * are returned only to this caller, never from an HTTP endpoint or a log. */
export async function startNativeClaimHttp(options) {
  if (!options || types.isProxy(options) || Object.getPrototypeOf(options) !== Object.prototype
    || Reflect.ownKeys(options).some(key => !['session', 'port'].includes(key))
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'session') ?? {}, 'value')
    || Object.hasOwn(options, 'port') && !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'port') ?? {}, 'value'))
    fail('NATIVE_CLAIM_HTTP_BOOTSTRAP_FIELDS');
  const { session, port = 0 } = options;
  assertNativeClaimSession(session);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('NATIVE_CLAIM_PORT');
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
        || request.headers.host !== host) return send(403, { error: 'NATIVE_CLAIM_INVALID_HOST' });
      if (request.headers.origin !== undefined && request.headers.origin !== origin)
        return send(403, { error: 'NATIVE_CLAIM_INVALID_ORIGIN' });
      if (request.headers['sec-fetch-site'] !== undefined
        && !['same-origin', 'none'].includes(request.headers['sec-fetch-site']))
        return send(403, { error: 'NATIVE_CLAIM_INVALID_ORIGIN' });
      if (request.method === 'GET' && (request.headers['transfer-encoding'] !== undefined
        || request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0'))
        return send(400, { error: 'NATIVE_CLAIM_GET_BODY_FORBIDDEN' });
      // Match the raw target. No query strings, encoded paths or caller-selected
      // path segments can select a different account, file or backend.
      // Request IDs and admission history belong to this owner, including
      // when balances and witnesses are absent from the projection.
      if (request.method === 'GET' && request.url === `${prefix}/snapshot`) {
        if (request.headers.origin !== origin || !validToken(request.headers['x-native-owner-token'], ownerToken))
          return send(403, { error: 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED' });
        return send(200, await session.snapshot());
      }
      if (request.method === 'GET' && request.url === `${prefix}/owner`) {
        if (request.headers.origin !== origin || !validToken(request.headers['x-native-owner-token'], ownerToken))
          return send(403, { error: 'NATIVE_CLAIM_OWNER_ACCESS_REQUIRED' });
        return send(200, await session.ownerView());
      }
      if (request.method !== 'POST' || !Object.hasOwn(routes, request.url))
        return send(404, { error: 'NATIVE_CLAIM_NOT_FOUND' });
      if (request.headers.origin !== origin) return send(403, { error: 'NATIVE_CLAIM_ORIGIN_REQUIRED' });
      if (!validToken(request.headers['x-native-claim-token'], mutationToken))
        return send(403, { error: 'NATIVE_CLAIM_ACCESS_REQUIRED' });
      if (request.headers['content-type'] !== 'application/json')
        return send(415, { error: 'NATIVE_CLAIM_JSON_REQUIRED' });
      const input = await body(request);
      // The session persists encrypted admission before resolving submit. A
      // pending promise is not an acknowledgement and must never become HTTP 202.
      const admission = await session.submit(routes[request.url], input);
      return send(202, admission);
    } catch (error) {
      const code = nativeClaimApiErrorCode(error);
      const status = code === 'NATIVE_CLAIM_BODY_TOO_LARGE' ? 413
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
        return await session.close();
      })();
    },
  });
}

/** TLS-only finite READ and exact admitted-request RECONCILE routes. Infrastructure certificate material is never
 * note custody; the original reader remains the sole admission authority. */
import {createServer as createTlsServer} from 'node:https';
import {createPrivateKey,X509Certificate} from 'node:crypto';

import {isIP} from 'node:net';
const deviceListeners=new WeakSet(),MAX_BODY=8192,MAX_REPLY=65536;
const deviceHttpFail=()=>{throw Error('NATIVE_CLAIM_DEVICE_TLS_CONFIGURATION');};
function deviceHttpExact(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)??{},'value')))deviceHttpFail();}
function deviceHttpReply(response,status,value){if(response.destroyed||response.writableEnded)return;let bytes=Buffer.from(JSON.stringify(value));if(bytes.length>MAX_REPLY){status=403;bytes=Buffer.from('{"error":"REQUEST_REJECTED"}');}
 response.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':bytes.length,'cache-control':'no-store','connection':'close','x-content-type-options':'nosniff'});response.end(bytes);}
async function deviceHttpBody(request){if(request.headers['content-type']!=='application/json'||request.headers['content-encoding']!==undefined||request.headers['transfer-encoding']!==undefined)deviceHttpFail();
 const length=request.headers['content-length'];if(typeof length!=='string'||/^(0|[1-9][0-9]{0,4})$/.exec(length)?.[0]!==length||Number(length)<2||Number(length)>MAX_BODY)deviceHttpFail();
 const parts=[];let count=0,bytes;try{for await(const part of request){parts.push(part);count+=part.length;if(count>Number(length)||count>MAX_BODY)deviceHttpFail();}if(count!==Number(length))deviceHttpFail();bytes=Buffer.concat(parts);return JSON.parse(bytes.toString('utf8'));}finally{bytes?.fill(0);parts.forEach(p=>p.fill(0));}}
export async function startPairedNativeClaimTlsV1(input){
 if(arguments.length!==1)deviceHttpFail();const keys=input&&!types.isProxy(input)&&Object.hasOwn(input,'host')?['reader','tls','host']:['reader','tls'];deviceHttpExact(input,keys);deviceHttpExact(input.tls,['certificate','privateKey']);
 const reader=input.reader,descriptor=assertPairedOriginalNativeClaimReaderV1(reader),origin=new URL(descriptor.origin),host=input.host??'127.0.0.1',hostname=origin.hostname.replace(/^\[|\]$/g,'');
 if(!['127.0.0.1','0.0.0.0'].includes(host)||deviceListeners.has(reader)||typeof input.tls.certificate!=='string'||Buffer.byteLength(input.tls.certificate)>65536||typeof input.tls.privateKey!=='string'||Buffer.byteLength(input.tls.privateKey)>16384)deviceHttpFail();
 let certificate;try{certificate=new X509Certificate(input.tls.certificate);const key=createPrivateKey(input.tls.privateKey);if(certificate.ca||!certificate.checkPrivateKey(key)||(isIP(hostname)?certificate.checkIP(hostname)!==hostname:certificate.checkHost(hostname,{subject:'never',wildcards:false})!==hostname))deviceHttpFail();}catch{deviceHttpFail();}
 const current=()=>{const now=Date.now();if(now<certificate.validFromDate.getTime()||now>=certificate.validToDate.getTime())deviceHttpFail();};current();
 const privateKey=Buffer.from(input.tls.privateKey),running=new Set(),sockets=new Set();let closed=false,closing,server;
 const routes=Object.freeze({'/v1/mobile/native-claims/challenges':'challenge','/v1/mobile/native-claims/operations':'operate'});
 deviceListeners.add(reader);
 try{server=createTlsServer({cert:input.tls.certificate,key:privateKey,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',ALPNProtocols:['http/1.1'],maxHeaderSize:8192,handshakeTimeout:2000},(request,response)=>{
  const work=(async()=>{if(closed)deviceHttpFail();current();if(request.socket.encrypted!==true||request.headers.host!==origin.host||request.headers.origin!==descriptor.origin||request.method!=='POST'||!Object.hasOwn(routes,request.url))deviceHttpFail();
   const value=await deviceHttpBody(request);if(closed)deviceHttpFail();assertPairedOriginalNativeClaimReaderV1(reader);
   return reader[routes[request.url]](value);})();
  running.add(work);work.finally(()=>running.delete(work)).catch(()=>{});let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_CLAIM_DEVICE_HTTP_TIMEOUT')),15000);timer.unref();});
  Promise.race([work,timeout]).then(v=>deviceHttpReply(response,200,v),()=>deviceHttpReply(response,closed?503:403,{error:closed?'DISCONNECTED':'REQUEST_REJECTED'})).finally(()=>clearTimeout(timer)).catch(()=>{});
 });}catch(error){deviceListeners.delete(reader);reader.close();throw error;}finally{privateKey.fill(0);}
 server.headersTimeout=2000;server.requestTimeout=15000;server.keepAliveTimeout=1;server.maxRequestsPerSocket=1;server.maxConnections=4;
 const track=socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));};server.on('connection',track);server.on('secureConnection',track);server.on('tlsClientError',(_error,socket)=>socket.destroy());
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(origin.port||443),host,()=>{server.off('error',reject);resolve();});});}
 catch(error){closed=true;reader.close();deviceListeners.delete(reader);const ownedSockets=[...sockets],drain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));for(const socket of ownedSockets)socket.destroy();await Promise.all([drain,new Promise(resolve=>server.close(()=>resolve()))]);throw error;}
 return Object.freeze({descriptor,url:descriptor.origin,
  close(){if(arguments.length!==0)deviceHttpFail();if(closing)return closing;closed=true;reader.close();const admitted=[...running];
   const ownedSockets=[...sockets],socketDrain=Promise.all(ownedSockets.map(socket=>new Promise(resolve=>socket.once('close',resolve))));const network=new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));for(const socket of ownedSockets)socket.destroy();
   closing=(async()=>{const results=await Promise.allSettled([...admitted,network,socketDrain]);await reader.idle();if(results.slice(admitted.length).some(r=>r.status==='rejected')||sockets.size||running.size)throw Error('NATIVE_CLAIM_DEVICE_TLS_CLOSE_UNCONFIRMED');deviceListeners.delete(reader);
    return{closed:true,ownedSocketsRemaining:0,originalReadsInFlight:0,retainedOriginalCustody:true};})();return closing;},
 });
}

/** Trusted product birth after the ORIGINAL handoff is PREPARED and before
 * preposition/ingress/FUND. Pairing authorizes the SAME journal, not native keys.
 * Reopen reuses its persisted descriptor; it cannot mint pairing after effects. */
export async function createOriginalNativeClaimMobileServiceV1(input) {
  if (arguments.length !== 1) deviceHttpFail();
  deviceHttpExact(input, ['controller','accountId','ownerIdentitySHA256','claimDomain','caller','origin','devicePublicKey','tls','host']);
  let session, reader, server;
  try {
    session = await createNativeClaimSession({ controller: input.controller, accountId: input.accountId,
      ownerIdentitySHA256: input.ownerIdentitySHA256, claimDomain: input.claimDomain, caller: input.caller });
    reader = await createPairedOriginalNativeClaimReaderV1({ session, origin: input.origin, devicePublicKey: input.devicePublicKey });
    server = await startPairedNativeClaimTlsV1({ reader, tls: input.tls, host: input.host });
  } catch (error) { reader?.close(); await Promise.allSettled([reader?.idle(), session?.close()]); throw error; }
  let closing;
  return Object.freeze({ descriptor: server.descriptor, origin: server.url,
    profile: 'ORIGINAL_NATIVE_CLAIM_MOBILE_SERVICE_V1',
    close() { if (arguments.length !== 0) deviceHttpFail(); return closing ??= (async () => {
      let first; try { await server.close(); } catch (error) { first = error; }
      try { await session.close(); } catch (error) { first ??= error; }
      if (first) throw first;
      return { closed: true, retainedOriginalNativeCustody: true, mobileNativeCustody: false };
    })(); },
  });
}
