import {describeWrappedResumeSuccessorV1} from '../withdrawals/wrapped-withdrawal-successor-review-v1.mjs';
import {describeWrappedWithdrawalResumeReviewV1} from '../withdrawals/wrapped-withdrawal-resume-review-v1.mjs';
import {isWrappedResumeAction} from '@lianum/mobile-protocol/wallet/wrapped-withdrawal-resume-actions';
/** Manual Node/local bridge to the existing wallet application workflow.
 * Transport bounds live here; all wallet schemas and state transitions stay in
 * the shared browser module. No session factory, persistence or automatic work. */
import { request as httpRequest } from 'node:http';
import { types, isDeepStrictEqual } from 'node:util';
import { ALL_ACTIONS, buildActionBody, createWalletClient } from '@lianum/mobile-protocol/wallet/client';

const REQUEST_LIMIT = 4096;
const RESPONSE_LIMIT = 256 * 1024;
const HEADER_LIMIT = 8192;
const handoffRoutes = new Set(['accountPrepare', 'accountExecute', 'accountReconcile', 'accountRecover'].map(action => ALL_ACTIONS[action].route));
const actionRoutes = new Set(Object.values(ALL_ACTIONS).map(action => action.route));
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
const failure = suffix => Object.assign(new Error('WALLET_APPLICATION_CLIENT_' + suffix),
  { code: 'WALLET_APPLICATION_CLIENT_' + suffix });

function access(input, count) {
  const invalid = () => { throw failure('ACCESS_INVALID'); };
  if (count !== 1 || !input || typeof input !== 'object' || types.isProxy(input)
    || Object.getPrototypeOf(input) !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(input);
  if (!keys.every(key => ['origin', 'ownerToken', 'actionToken', 'manualActionHandoff'].includes(key))
    || !['origin', 'ownerToken'].every(key => keys.includes(key))
    || !keys.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'))) invalid();
  const port = typeof input.origin === 'string' ? /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(input.origin) : null;
  if (!port || port[0] !== input.origin || Number(port[1]) > 65535
    || !match(input.ownerToken, /^[0-9a-f]{64}$/)
    || keys.includes('actionToken') && !match(input.actionToken, /^[0-9a-f]{64}$/)) invalid();
  let manualActionHandoff = null;
  if (keys.includes('manualActionHandoff')) {
    const descriptor = input.manualActionHandoff;
    if (keys.includes('actionToken') || !descriptor || typeof descriptor !== 'object' || types.isProxy(descriptor)
      || Object.getPrototypeOf(descriptor) !== Object.prototype
      || Reflect.ownKeys(descriptor).length !== 2 || !['origin', 'listenerId'].every(key => Object.hasOwn(descriptor, key))
      || !Reflect.ownKeys(descriptor).every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(descriptor, key), 'value'))
      || descriptor.origin !== input.origin || !match(descriptor.listenerId, /^[0-9a-f]{64}$/)) invalid();
    manualActionHandoff = Object.freeze({ origin: descriptor.origin, listenerId: descriptor.listenerId });
  }
  // Copy scalar values now: later caller edits cannot switch origin or tokens.
  return Object.freeze({ origin: input.origin, port: Number(port[1]), ownerToken: input.ownerToken,
    actionToken: keys.includes('actionToken') ? input.actionToken : undefined, manualActionHandoff });
}

function fixedTransport(credentials) {
  return (path, options) => new Promise((resolve, reject) => {
    const isRead = options.method === 'GET' && path === '/api/wallet/state';
    // The shared model alone retains a commitment-checked, one-use token.
    // This private transport accepts it only on the four fixed account routes.
    // No caller-supplied transport, host callback, URL or general header API.
    const token = credentials.manualActionHandoff && handoffRoutes.has(path)
      ? options.headers?.['x-wallet-action-token'] : credentials.actionToken;
    const isAction = options.method === 'POST' && actionRoutes.has(path)
      && match(token, /^[0-9a-f]{64}$/);
    // This is a private adapter used only by createWalletClient, never a public
    // path/header hook. Fail closed if its fixed transport contract changes.
    const expectedHeaders = isRead ? { 'x-wallet-owner-token': credentials.ownerToken }
      : { 'x-wallet-action-token': token, 'Content-Type': 'application/json' };
    if ((!isRead && !isAction) || options.cache !== 'no-store' || options.credentials !== 'omit'
      || options.redirect !== 'error' || !(options.signal instanceof AbortSignal)
      || JSON.stringify(options.headers) !== JSON.stringify(expectedHeaders)
      || (isRead ? options.body !== undefined : typeof options.body !== 'string'
        || Buffer.byteLength(options.body, 'utf8') > REQUEST_LIMIT)) {
      reject(failure('TRANSPORT_CONTRACT')); return;
    }
    const signal = options.signal;
    let request, response, settled = false, bytes = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', abort); chunks.length = 0;
      if (error) { response?.destroy(); request?.destroy(); reject(failure(error)); }
      else resolve(value);
    };
    // Aborting waiting never cancels an admitted server job. The shared action
    // workflow treats every transport failure as UNKNOWN, retaining original ID.
    const abort = () => finish('TIMEOUT');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try {
      request = httpRequest({ hostname: '127.0.0.1', port: credentials.port, method: options.method,
        path, agent: false, maxHeaderSize: HEADER_LIMIT,
        headers: { Host: '127.0.0.1:' + credentials.port, Origin: credentials.origin,
          Accept: 'application/json', 'Accept-Encoding': 'identity',
          ...(isRead ? { 'x-wallet-owner-token': credentials.ownerToken }
            : { 'x-wallet-action-token': token, 'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(options.body, 'utf8')) }) } }, incoming => {
        response = incoming;
        response.on('error', () => finish('RESPONSE_INCOMPLETE'));
        response.on('aborted', () => finish('RESPONSE_INCOMPLETE'));
        response.on('close', () => { if (!settled) finish('RESPONSE_INCOMPLETE'); });
        if (settled) { response.destroy(); return; }
        const status = response.statusCode;
        if (!Number.isInteger(status) || status < 200 || status > 599) return finish('RESPONSE_INVALID');
        // node:http does not follow redirects. Never inspect Location as a URL.
        if (status >= 300 && status < 400) return finish('REDIRECT_FORBIDDEN');
        const headers = response.headers, length = headers['content-length'];
        const seen = new Set();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          const name = response.rawHeaders[index].toLowerCase();
          if (['content-type', 'content-length', 'content-encoding', 'transfer-encoding'].includes(name)) {
            if (seen.has(name)) return finish('RESPONSE_INVALID');
            seen.add(name);
          }
        }
        if (!match(headers['content-type'], /^application\/json(?:;\s*charset=utf-8)?$/i)
          || headers['content-encoding'] !== undefined && headers['content-encoding'] !== 'identity'
          || headers['transfer-encoding'] !== undefined && headers['transfer-encoding'] !== 'chunked') return finish('RESPONSE_INVALID');
        if (length !== undefined && (!match(length, /^(0|[1-9][0-9]*)$/)
          || Number(length) > RESPONSE_LIMIT)) return finish('RESPONSE_TOO_LARGE');
        response.on('data', chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > RESPONSE_LIMIT) return finish('RESPONSE_TOO_LARGE');
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          if (!response.complete || length !== undefined && Number(length) !== bytes) return finish('RESPONSE_INCOMPLETE');
          let value;
          try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
          catch { return finish('RESPONSE_INVALID'); }
          finish(null, Object.freeze({ ok: status >= 200 && status < 300, status, json: async () => value }));
        });
      });
      request.on('error', () => finish('NETWORK_UNAVAILABLE'));
      request.end(isRead ? undefined : options.body);
    } catch { finish('NETWORK_UNAVAILABLE'); }
  });
}

/** Exactly one { origin, ownerToken, actionToken? | manualActionHandoff? } argument.
 * Omit both optional fields for read-only access. A handoff descriptor is only
 * original-listener metadata; shared tokenless review/import/confirm owns the
 * workflow. It cannot be combined with a standing action token. Construction performs no I/O. Requires Node, not a
 * browser/mobile runtime; credentials come from the private app bootstrap. */
export function createWalletApplicationClient(input) {
  const credentials = access(input, arguments.length);
  const client = createWalletClient({ fetchImpl: fixedTransport(credentials),
    ownerToken: credentials.ownerToken, actionToken: credentials.actionToken,
    manualActionHandoff: credentials.manualActionHandoff });
  // Preserve the established Node surface unless the caller explicitly chose
  // the scoped descriptor. Optional methods still belong to the shared model.
  if (credentials.manualActionHandoff === null) return Object.freeze(Object.fromEntries(
    ['getState', 'subscribe', 'can', 'refresh', 'review', 'cancelReview', 'confirm'].map(key => [key, client[key]])));
  return client;
}

/** One explicit local resume call. Each call requires its own exact listener
 * grant. No automatic chaining, polling, resend, or recovery on transport loss. */
export async function submitWrappedWithdrawalResume(input){
 const invalid=()=>{throw failure('RESUME_INPUT_INVALID');};
 if(arguments.length!==1||!input||types.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)invalid();
 const keys=Reflect.ownKeys(input);if(keys.length!==6||!['origin','ownerToken','action','body','access','confirmed'].every(key=>keys.includes(key))||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,key),'value')))invalid();
 if(input.confirmed!==true||!isWrappedResumeAction(input.action))invalid();
 const grant=input.access;if(!grant||types.isProxy(grant)||Object.getPrototypeOf(grant)!==Object.prototype||Reflect.ownKeys(grant).length!==2||!['origin','token'].every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(grant,key)??{},'value'))||grant.origin!==input.origin)invalid();
 const body=input.body;if(!body||types.isProxy(body)||Object.getPrototypeOf(body)!==Object.prototype||!Reflect.ownKeys(body).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(body,key),'value')&&typeof body[key]==='string'))invalid();
 const action=input.action,exact=buildActionBody(action,{...body}),credentials=access({origin:input.origin,ownerToken:input.ownerToken,actionToken:grant.token},1),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fixedTransport(credentials)(ALL_ACTIONS[action].route,{method:'POST',headers:{'x-wallet-action-token':credentials.actionToken,'Content-Type':'application/json'},body:JSON.stringify(exact),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
  const value=await response.json();if(!response.ok){const preEffect=response.status===403&&value&&Object.keys(value).length===1&&['WALLET_ACTION_ACCESS_REQUIRED','WALLET_INVALID_ORIGIN','WALLET_INVALID_HOST'].includes(value.error);return Object.freeze({status:preEffect?'REJECTED':'UNKNOWN',action,requestId:exact.requestId,retryAllowed:false});}
  const allowed=action.endsWith('Review')?['review','resumeSHA256','effectPermission']:action.endsWith('Admit')?['requestId','state','resumeSHA256','effectPermission']:['requestId','state'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==allowed.sort().join(','))throw failure('RESUME_RESPONSE_INVALID');
  if(action.endsWith('Review')?(value.effectPermission!==false||!match(value.resumeSHA256,/^[0-9a-f]{64}$/)||(action==='wrappedWithdrawSuccessorReview'?value.review?.originalReview?.requestId:value.review?.requestId)!==exact.requestId):value.requestId!==exact.requestId)throw failure('RESUME_RESPONSE_INVALID');
  if(action==='wrappedWithdrawSuccessorReview'){
   const {predecessorAdmissionSHA256,ordinal,originalReview}=value.review;
   const expected=describeWrappedResumeSuccessorV1({predecessorAdmissionSHA256,ordinal,originalReview});
   if(value.resumeSHA256!==expected.resumeSHA256||!isDeepStrictEqual(value.review,expected.review))throw failure('RESUME_RESPONSE_INVALID');
  }else if(action==='wrappedWithdrawResumeReview'){
   const {version,profile,action:reviewAction,work,effectPermission,...facts}=value.review;
   const expected=describeWrappedWithdrawalResumeReviewV1(facts);
   if(value.resumeSHA256!==expected.resumeSHA256||!isDeepStrictEqual(value.review,expected.review))throw failure('RESUME_RESPONSE_INVALID');
  }else if(action.endsWith('Admit')){
   if(value.state!=='RESUME_ADMITTED'||value.resumeSHA256!==exact.resumeSHA256||value.effectPermission!==false)throw failure('RESUME_RESPONSE_INVALID');
  }else if(value.state!=='CONFIRMED')throw failure('RESUME_RESPONSE_INVALID');
  return Object.freeze({status:'OBSERVED',action,requestId:exact.requestId,value:structuredClone(value),retryAllowed:false});
 }catch{return Object.freeze({status:'UNKNOWN',action,requestId:exact.requestId,retryAllowed:false});}finally{clearTimeout(timer);}
}
