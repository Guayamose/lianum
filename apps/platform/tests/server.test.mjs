import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {connect} from 'node:net';
import {once} from 'node:events';
import {startPlatformServer} from '../src/server.mjs';
import {authorizationKey,operationTerms} from '../src/authorization-store.mjs';
import {mobileAuthorizationMessage,mobileReceiptMessage,MOBILE_AUTHORIZATION_RECEIPT_PROFILE} from '../../../packages/mobile-protocol/src/authorization.mjs';
const ORDER=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const origin='https://wallet.example.test';
const keys=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=keys.publicKey.export({format:'jwk'});
const ownerPublicKey='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
const intent={requestId:'original_request_0001',action:'prepare',kind:'EXIT',chain:'ethereum',assetId:'11'.repeat(32),amountAtomic:'100',recipient:'0x'+'22'.repeat(20),maxFeeAtomic:'5'};
function signed(challenge) {
  const raw=sign('sha256',mobileAuthorizationMessage(challenge),{key:keys.privateKey,dsaEncoding:'ieee-p1363'});
  const s=BigInt('0x'+raw.subarray(32).toString('hex'));if(s>ORDER/2n)Buffer.from((ORDER-s).toString(16).padStart(64,'0'),'hex').copy(raw,32);
  return {challenge,signature:raw.toString('hex')};
}
function receiptRequest(authorization, now = Date.now()) {
  const review = { authorization, nonce: randomBytes(32).toString('hex'), expiresAt: now + 60_000 };
  const raw = sign('sha256', mobileReceiptMessage(review), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' });
  const s = BigInt('0x' + raw.subarray(32).toString('hex'));
  if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(raw, 32);
  return { ...review, signature: raw.toString('hex') };
}
// Explicit test double for intake sequencing only. PostgreSQL durability and
// contention are exercised separately by postgres.test.mjs in a real server.
function store() {
  const challenges=new Map(),records=new Map(),originals=new Map();
  return {ready:async()=>true,put:async value=>challenges.set(value.challengeId,value),
    async consume(value){const key=authorizationKey(value);if(records.has(key))return {duplicate:true,response:records.get(key)};
      assert.deepEqual(challenges.get(value.challengeId),value);const response={status:'UNKNOWN',requestId:value.intent.requestId,operationState:'UNKNOWN',retryAllowed:false};
      records.set(key,response);originals.set(key,value);return {duplicate:false,key,response};},finish:async(key,value)=>records.set(key,value),
    async receipt(value) {
      const key = authorizationKey(value);
      if (!originals.has(key) || JSON.stringify(originals.get(key)) !== JSON.stringify(value))
        throw Object.assign(new Error('MOBILE_AUTHORIZATION_NOT_RETAINED'), { code: 'MOBILE_AUTHORIZATION_NOT_RETAINED' });
      return structuredClone(records.get(key));
    },
  };
}
async function fixture(t,executor=null,persistence=store(),options={}) {
  const app=await startPlatformServer({origin,store:persistence,executor,...options});t.after(()=>app.close());
  const call=async(path,value)=>{const response=await fetch(`http://127.0.0.1:${app.port}${path}`,value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});return {status:response.status,body:await response.json()};};
  return {app,call};
}
test('unbound platform is live, unready and never exposes fictional private balances',async t=>{
  const {call}=await fixture(t);assert.equal((await call('/health/live')).status,200);
  assert.equal((await call('/health/ready')).status,503);
  const state=(await call('/v1/mobile/state')).body;assert.equal(state.connection,'DISCONNECTED');assert.equal(state.privatePortfolio,null);assert.ok(Object.values(state.capabilities).every(x=>!x));
  assert.equal((await call('/v1/mobile/challenges',{ownerPublicKey,intent})).status,503);
});
test('database outage keeps liveness but closes readiness and all operation capabilities',async t=>{
  const persistence=store();persistence.ready=async()=>{throw new Error('database connection secret must not escape');};
  let effects=0;const {call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}},persistence);
  assert.equal((await call('/health/live')).status,200);
  assert.deepEqual(await call('/health/ready'),{status:503,body:{status:'UNAVAILABLE'}});
  const state=(await call('/v1/mobile/state')).body;assert.equal(state.connection,'DISCONNECTED');assert.ok(Object.values(state.capabilities).every(value=>!value));
  assert.deepEqual(await call('/v1/mobile/challenges',{ownerPublicKey,intent}),{status:503,body:{error:'MOBILE_BACKEND_UNAVAILABLE'}});assert.equal(effects,0);
});
test('signature covers terms and one consumed authorization never dispatches twice',async t=>{
  let effects=0;const executor={capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}};
  const {call}=await fixture(t,executor);
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  const authorization=signed(challenge),changed={...authorization,challenge:{...challenge,intent:{...intent,amountAtomic:'101'}}};
  assert.equal((await call('/v1/mobile/authorizations',changed)).status,403);assert.equal(effects,0);
  const first=await call('/v1/mobile/authorizations',authorization);assert.equal(first.body.status,'ACCEPTED');assert.equal(first.body.operationState,'ADMITTED');
  assert.deepEqual((await call('/v1/mobile/authorizations',authorization)).body,first.body);assert.equal(effects,1);
});
test('lost adapter response remains unknown without automatic resubmission',async t=>{
  let effects=0;const {call}=await fixture(t,{capabilities:{execute:true},submit:async()=>{effects++;throw new Error('private failure payload');}});
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent:{...intent,action:'execute'}})).body.challenge;
  const authorization=signed(challenge),response=(await call('/v1/mobile/authorizations',authorization)).body;
  assert.deepEqual(response,{status:'UNKNOWN',requestId:intent.requestId,operationState:'UNKNOWN',retryAllowed:false});
  assert.deepEqual((await call('/v1/mobile/authorizations',authorization)).body,response);assert.equal(effects,1);
});
test('pending adapter is bounded; a late admission cannot replace UNKNOWN or dispatch the same permission again',async t=>{
  let effects=0,resolveSubmit;const pending=new Promise(resolve=>{resolveSubmit=resolve;});
  const {call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return pending;}},store(),{submitTimeoutMs:20});
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  const authorization=signed(challenge),response=(await call('/v1/mobile/authorizations',authorization)).body;
  assert.deepEqual(response,{status:'UNKNOWN',requestId:intent.requestId,operationState:'UNKNOWN',retryAllowed:false});
  assert.equal(effects,1);resolveSubmit({admitted:true});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual((await call('/v1/mobile/authorizations',authorization)).body,response);assert.equal(effects,1);
});
test('persistence failure after readiness returns 503 before dispatch; a failed final write preserves initial UNKNOWN',async t=>{
  let effects=0;const persistence=store(),originalConsume=persistence.consume;
  const {call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}},persistence);
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  persistence.consume=async()=>{throw new Error('private SQL details');};
  assert.deepEqual(await call('/v1/mobile/authorizations',signed(challenge)),{status:503,body:{error:'MOBILE_PERSISTENCE_UNAVAILABLE'}});assert.equal(effects,0);
  persistence.consume=originalConsume;persistence.finish=async()=>{throw new Error('lost final write');};
  const response=(await call('/v1/mobile/authorizations',signed(challenge))).body;
  assert.equal(response.status,'UNKNOWN');assert.equal(effects,1);
  assert.deepEqual((await call('/v1/mobile/authorizations',signed(challenge))).body,response);assert.equal(effects,1);
});
test('prepare and execute retain one operation but use independent admission keys',()=>{
  const a={ownerPublicKey,intent},b={ownerPublicKey,intent:{...intent,action:'execute'}};
  assert.notEqual(authorizationKey(a),authorizationKey(b));assert.equal(operationTerms(a),operationTerms(b));
  assert.notEqual(operationTerms(a),operationTerms({...a,intent:{...intent,maxFeeAtomic:'6'}}));
});
test('expired challenge, unknown fields and a forged signature cannot reach the adapter',async t=>{
  let effects=0;const {call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}});
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  assert.equal((await call('/v1/mobile/authorizations',signed({...challenge,expiresAt:Date.now()-1}))).status,400);
  assert.equal((await call('/v1/mobile/challenges',{ownerPublicKey,intent,privateKey:'not admitted'})).status,400);
  const signature=randomBytes(32).toString('hex')+'01'.padStart(64,'0');
  assert.equal((await call('/v1/mobile/authorizations',{challenge,signature})).status,403);assert.equal(effects,0);
});
test('Node JWK rejects invalid curve points; canonical lowS and exact origin are enforced before dispatch',async t=>{
  let effects=0;const {app,call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}});
  assert.equal((await call('/v1/mobile/challenges',{ownerPublicKey:'04'+'00'.repeat(64),intent})).status,400);
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  const authorization=signed(challenge),s=BigInt('0x'+authorization.signature.slice(64));
  assert.equal((await call('/v1/mobile/authorizations',{challenge,signature:authorization.signature.slice(0,64)+(ORDER-s).toString(16).padStart(64,'0')})).status,400);
  const foreign=await fetch(`http://127.0.0.1:${app.port}/v1/mobile/authorizations`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example.test'},body:JSON.stringify(authorization)});
  assert.equal(foreign.status,403);assert.equal(effects,0);
});
test('oversized bodies and malformed UTF8 are rejected without leaking details or consuming effects',async t=>{
  let effects=0;const {app,call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}});
  const path=`http://127.0.0.1:${app.port}/v1/mobile/challenges`;
  const malformed=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:Uint8Array.of(0xc0,0xaf)});
  assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{error:'MOBILE_REQUEST_REJECTED'});
  try {const oversized=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(8193),signal:AbortSignal.timeout(2000)});assert.ok(oversized.status>=400);}
  catch(error){assert.ok(error instanceof TypeError || error.name==='TimeoutError');}
  assert.equal((await call('/health/live')).status,200);assert.equal(effects,0);
});
test('shutdown closes an unfinished request within its drain deadline',async t=>{
  let reached=false,effects=0;const persistence=store();persistence.ready=async()=>{reached=true;return true;};
  const {app}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return {admitted:true};}},persistence,{closeTimeoutMs:20});
  const socket=connect(app.port,'127.0.0.1');socket.on('error',()=>{});t.after(()=>socket.destroy());
  await once(socket,'connect');const disconnected=once(socket,'close');
  socket.write('POST /v1/mobile/challenges HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 200\r\n\r\n{');
  while(!reached)await new Promise(resolve=>setImmediate(resolve));
  const started=Date.now();await app.close();await disconnected;
  assert.ok(Date.now()-started<1000);assert.equal(effects,0);
});

test('fresh signed receipt query reads an expired consumed original with the economic adapter absent', async t => {
  let clock = 1_000_000, effects = 0;
  const persistence = store();
  const first = await fixture(t, { capabilities: { execute: true }, submit: async () => { effects++; return { admitted: true }; } }, persistence, { now: () => clock });
  const challenge = (await first.call('/v1/mobile/challenges', { ownerPublicKey, intent: { ...intent, action: 'execute' } })).body.challenge;
  const authorization = signed(challenge);
  const admitted = (await first.call('/v1/mobile/authorizations', authorization)).body;
  clock += 60_001;
  assert.equal((await first.call('/v1/mobile/authorizations', authorization)).status, 400);
  for (const name of ['put', 'consume', 'finish']) persistence[name] = async () => { throw Error('READ_ONLY_RECEIPT_VIOLATION'); };
  const reader = await fixture(t, null, persistence, { now: () => clock });
  assert.equal((await reader.call('/health/ready')).status, 503);
  const request = receiptRequest(authorization, clock);
  const observed = await reader.call('/v1/mobile/authorization-receipts', request);
  assert.deepEqual(observed, { status: 200, body: { version: 1, profile: MOBILE_AUTHORIZATION_RECEIPT_PROFILE,
    nonce: request.nonce, challengeId: challenge.challengeId, action: 'execute', authorization: admitted } });
  assert.deepEqual(await reader.call('/v1/mobile/authorization-receipts', request), observed);
  assert.equal(effects, 1);
});

test('receipt permission cannot dispatch, replace an original, cross domains or open an expired authorization', async t => {
  let clock = 1_000_000, effects = 0;
  const { call } = await fixture(t, { capabilities: { prepare: true }, submit: async () => { effects++; throw Error('LOST_REPLY'); } }, store(), { now: () => clock });
  const challenge = (await call('/v1/mobile/challenges', { ownerPublicKey, intent })).body.challenge;
  const authorization = signed(challenge);
  const original = (await call('/v1/mobile/authorizations', authorization)).body;
  clock += 60_001;
  const request = receiptRequest(authorization, clock);
  assert.deepEqual((await call('/v1/mobile/authorization-receipts', request)).body.authorization, original);
  for (const mutate of [value => { value.nonce = 'f'.repeat(64); }, value => { value.authorization.signature = value.signature; },
    value => { value.signature = value.authorization.signature; }, value => { value.expiresAt = clock; },
    value => { value.expiresAt = clock + 60_001; }, value => { value.privateKey = 'FORBIDDEN'; }]) {
    const changed = structuredClone(request); mutate(changed);
    assert.ok((await call('/v1/mobile/authorization-receipts', changed)).status >= 400);
  }
  const different = signed({ ...challenge, challengeId: 'e'.repeat(64), nonce: 'd'.repeat(64) });
  assert.equal((await call('/v1/mobile/authorization-receipts', receiptRequest(different, clock))).status, 404);
  const neverConsumed = signed({ ...challenge, intent: { ...intent, requestId: 'original_unconsumed_001' } });
  assert.equal((await call('/v1/mobile/authorization-receipts', receiptRequest(neverConsumed, clock))).status, 404);
  assert.equal((await call('/v1/mobile/authorizations', request)).status, 400);
  assert.equal((await call('/v1/mobile/authorizations', authorization)).status, 400);
  assert.equal(effects, 1);
});

test('receipt reads fail closed on unavailable SQL without invoking economic or mutation methods', async t => {
  const persistence = store();
  let reads = 0;
  persistence.receipt = async () => { reads++; throw Error('Unexpected read'); };
  for (const name of ['put', 'consume', 'finish']) persistence[name] = async () => { throw Error('READ_ONLY_RECEIPT_VIOLATION'); };
  const { call } = await fixture(t, null, persistence);
  const authorization = signed({ version: 1, profile: 'LIANUM_MOBILE_AUTHORIZATION_V1', origin,
    challengeId: 'a'.repeat(64), nonce: 'b'.repeat(64), expiresAt: Date.now() - 1, ownerPublicKey, intent });
  for (const ready of [async () => false, async () => { throw Error('SQL transport details'); }]) {
    persistence.ready = ready;
    assert.deepEqual(await call('/v1/mobile/authorization-receipts', receiptRequest(authorization)),
      { status: 503, body: { error: 'MOBILE_PERSISTENCE_UNAVAILABLE' } });
    assert.equal(reads, 0);
  }
});

test('expiry during durable consumption prevents dispatch and preserves UNKNOWN original', async t => {
  let clock = 1_000_000, effects = 0, expireOnce = true;
  const persistence = store(), consume = persistence.consume;
  persistence.consume = async challenge => {
    const admission = await consume(challenge);
    if (!admission.duplicate && expireOnce) {
      expireOnce = false;
      clock = challenge.expiresAt;
    }
    return admission;
  };
  const { call } = await fixture(t, { capabilities: { execute: true }, submit: async () => {
    effects++; return { admitted: true };
  } }, persistence, { now: () => clock });
  const terms = { ...intent, action: 'execute' };
  const challenge = (await call('/v1/mobile/challenges', { ownerPublicKey, intent: terms })).body.challenge;
  const original = signed(challenge);
  const expected = { status: 'UNKNOWN', requestId: terms.requestId, operationState: 'UNKNOWN', retryAllowed: false };
  assert.deepEqual(await call('/v1/mobile/authorizations', original), { status: 200, body: expected });
  assert.equal(effects, 0);
  assert.deepEqual(await persistence.receipt(challenge), expected);
  assert.equal((await call('/v1/mobile/authorizations', original)).status, 400);
  const replacement = (await call('/v1/mobile/challenges', { ownerPublicKey, intent: terms })).body.challenge;
  assert.deepEqual(await call('/v1/mobile/authorizations', signed(replacement)), { status: 200, body: expected });
  const receipt = await call('/v1/mobile/authorization-receipts', receiptRequest(original, clock));
  assert.equal(receipt.status, 200);
  assert.deepEqual(receipt.body.authorization, expected);
  assert.deepEqual(await persistence.receipt(challenge), expected);
  assert.equal(effects, 0);
});
