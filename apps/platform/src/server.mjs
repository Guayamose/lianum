/** Cloud/mobile HTTP boundary. Private backend adapters must bind explicitly;
 * a valid mobile signature alone cannot mint notes or authorize chain effects. */
import { createServer } from 'node:http';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { normalizeMobileIntent, normalizeMobileChallenge, normalizeMobileOrigin,
  normalizeMobileAuthorization, mobileAuthorizationMessage, validateMobileChallenge,
  normalizeMobileReceiptRequest, validateMobileReceiptReview, mobileReceiptMessage,
  MOBILE_AUTHORIZATION_PROFILE, MOBILE_AUTHORIZATION_RECEIPT_PROFILE } from '../../../packages/mobile-protocol/src/authorization.mjs';
const hex = () => randomBytes(32).toString('hex');
function publicKey(value) {
  return createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
    x:Buffer.from(value.slice(2,66),'hex').toString('base64url'),
    y:Buffer.from(value.slice(66),'hex').toString('base64url')}});
}
function exact(raw, fields) {
  if (!raw || Object.getPrototypeOf(raw)!==Object.prototype || Object.keys(raw).sort().join(',') !== [...fields].sort().join(','))
    throw Object.assign(new Error('MOBILE_REQUEST_FIELDS'),{code:'MOBILE_REQUEST_FIELDS'});
}
async function body(request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type']??'')) throw new Error('MOBILE_CONTENT_TYPE');
  const chunks=[];let size=0;
  for await (const chunk of request) {size+=chunk.length;if(size>8192) throw new Error('MOBILE_BODY_LIMIT');chunks.push(chunk);}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
export async function startPlatformServer({origin,store=null,executor=null,port=0,host='127.0.0.1',allowInsecureLocalhost=false,now=Date.now,submitTimeoutMs=5000,closeTimeoutMs=5000}={}) {
  normalizeMobileOrigin(origin,{allowInsecureLocalhost});
  if (![submitTimeoutMs,closeTimeoutMs].every(value=>Number.isInteger(value)&&value>=1&&value<=10000))throw new Error('PLATFORM_TIMEOUT_INVALID');
  const capacities = Object.fromEntries(['prepare','execute','reconcile','recover'].map(action=>[action,Boolean(executor?.capabilities?.[action])]));
  const ready = async () => {
    try { return Boolean(store && typeof executor?.submit==='function' && Object.values(capacities).some(Boolean) && await store.ready()); }
    catch { return false; }
  };
  const persist=async operation=>{
    try{return await operation();}
    catch(error){
      if(/^MOBILE_[A-Z_]{1,60}$/.test(error?.code??''))throw error;
      throw Object.assign(new Error('MOBILE_PERSISTENCE_UNAVAILABLE'),{code:'MOBILE_PERSISTENCE_UNAVAILABLE'});
    }
  };
  const server=createServer(async (request,response)=>{
    const send=(status,value)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});response.end(JSON.stringify(value));};
    try {
      if(request.method==='GET' && request.url==='/health/live') return send(200,{status:'LIVE'});
      if(request.method==='GET' && request.url==='/health/ready') {const available=await ready();return send(available?200:503,{status:available?'READY':'UNAVAILABLE'});}
      if(request.method==='GET' && request.url==='/v1/mobile/state') {
        const available=await ready();return send(200,{version:1,connection:available?'READY':'DISCONNECTED',privatePortfolio:null,
          capabilities:available?capacities:Object.fromEntries(Object.keys(capacities).map(key=>[key,false])),
          notice:available?'Las operaciones requieren autorización y validación del backend.':'El backend de operaciones todavía no está vinculado.'});
      }
      if(request.method!=='POST' || !['/v1/mobile/challenges','/v1/mobile/authorizations','/v1/mobile/authorization-receipts'].includes(request.url)) return send(404,{error:'MOBILE_ROUTE_NOT_FOUND'});
      if(request.headers.origin!==undefined && request.headers.origin!==origin) return send(403,{error:'MOBILE_ORIGIN_BINDING'});
      if (request.url === '/v1/mobile/authorization-receipts') {
        // Receipt lookup is available independently of economic capabilities.
        // This route never calls consume(), finish() or executor.submit().
        if (!store) return send(503, { error: 'MOBILE_PERSISTENCE_UNAVAILABLE' });
        if (await persist(() => store.ready()) !== true) return send(503, { error: 'MOBILE_PERSISTENCE_UNAVAILABLE' });
        const query = normalizeMobileReceiptRequest(await body(request), { allowInsecureLocalhost });
        const review = validateMobileReceiptReview({ authorization: query.authorization,
          nonce: query.nonce, expiresAt: query.expiresAt }, { origin,
          ownerPublicKey: query.authorization.challenge.ownerPublicKey, now: now(), allowInsecureLocalhost });
        const key = publicKey(review.authorization.challenge.ownerPublicKey);
        const valid = (message, signature) => verify('sha256', message,
          { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex'));
        if (!valid(mobileAuthorizationMessage(review.authorization.challenge, { allowInsecureLocalhost }), review.authorization.signature)
          || !valid(mobileReceiptMessage(review, { allowInsecureLocalhost }), query.signature)) {
          return send(403, { error: 'MOBILE_SIGNATURE_INVALID' });
        }
        const authorization = await persist(() => store.receipt(review.authorization.challenge));
        return send(200, { version: 1, profile: MOBILE_AUTHORIZATION_RECEIPT_PROFILE,
          nonce: review.nonce, challengeId: review.authorization.challenge.challengeId,
          action: review.authorization.challenge.intent.action, authorization });
      }
      if(!await ready())return send(503,{error:'MOBILE_BACKEND_UNAVAILABLE'});
      const input=await body(request);
      if(request.url==='/v1/mobile/challenges') {
        exact(input,['ownerPublicKey','intent']);const intent=normalizeMobileIntent(input.intent);
        if(!capacities[intent.action])return send(403,{error:'MOBILE_ACTION_UNAVAILABLE'});
        const challenge=normalizeMobileChallenge({version:1,profile:MOBILE_AUTHORIZATION_PROFILE,origin,
          challengeId:hex(),nonce:hex(),expiresAt:now()+60_000,ownerPublicKey:input.ownerPublicKey,intent},{allowInsecureLocalhost});
        publicKey(challenge.ownerPublicKey);await persist(()=>store.put(challenge));return send(201,{challenge});
      }
      const authorization=normalizeMobileAuthorization(input,{allowInsecureLocalhost});
      const challenge=validateMobileChallenge(authorization.challenge,{origin,ownerPublicKey:authorization.challenge.ownerPublicKey,now:now(),allowInsecureLocalhost});
      if(!capacities[challenge.intent.action])return send(403,{error:'MOBILE_ACTION_UNAVAILABLE'});
      if(!verify('sha256',mobileAuthorizationMessage(challenge,{allowInsecureLocalhost}),{key:publicKey(challenge.ownerPublicKey),dsaEncoding:'ieee-p1363'},Buffer.from(authorization.signature,'hex')))
        return send(403,{error:'MOBILE_SIGNATURE_INVALID'});
      const admission=await persist(()=>store.consume(challenge,now()));
      if(admission.duplicate)return send(200,admission.response);
      let result=admission.response;
      try {
        // The private adapter must verify original account ownership, terms,
        // operation lineage and proof authority before any external effect.
        // This only bounds waiting for a reply. It does not cancel a pending
        // external effect or make its consumed authorization retryable.
        let timer;
        let outcome;
        try {
          outcome=await Promise.race([Promise.resolve().then(() => {
            // SQL locks/round trips may outlive the consent window. Recheck
            // immediately before dispatch; consumption still remains durable
            // UNKNOWN and never becomes retryable if this permission expired.
            validateMobileChallenge(challenge, { origin, ownerPublicKey: challenge.ownerPublicKey,
              now: now(), allowInsecureLocalhost });
            return executor.submit(challenge);
          }),
            new Promise(resolve=>{timer=setTimeout(()=>resolve(null),submitTimeoutMs);})]);
        } finally {clearTimeout(timer);}
        if(outcome?.admitted===true)result={status:'ACCEPTED',requestId:challenge.intent.requestId,operationState:'ADMITTED',retryAllowed:false};
        else if(outcome?.rejectedBeforeEffect===true)result={status:'REJECTED',requestId:challenge.intent.requestId,operationState:'REJECTED',retryAllowed:false};
      } catch { /* A lost reply/crash never makes an admitted effect retryable. */ }
      try {await store.finish(admission.key,result);} catch {result=admission.response;}
      return send(200,result);
    } catch(error) {
      const code=/^MOBILE_[A-Z_]{1,60}$/.test(error?.code??'')?error.code:'MOBILE_REQUEST_REJECTED';
      return send(code==='MOBILE_OPERATION_CONFLICT'?409:code==='MOBILE_PERSISTENCE_UNAVAILABLE'?503:
        code==='MOBILE_AUTHORIZATION_NOT_RETAINED'?404:400,{error:code});
    }
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;server.maxHeadersCount=32;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  let closing;
  return Object.freeze({port:server.address().port,close:()=>closing??=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>server.closeAllConnections(),closeTimeoutMs);timer.unref();
    server.close(error=>{clearTimeout(timer);error?reject(error):resolve();});
  })});
}
