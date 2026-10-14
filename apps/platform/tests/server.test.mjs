import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomBytes} from 'node:crypto';
import {connect} from 'node:net';
import {once} from 'node:events';
import {startPlatformServer} from '../src/server.mjs';
import {platformDiagnosticSnapshot} from '../src/diagnostics.mjs';
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
  const before=platformDiagnosticSnapshot().counts.ADAPTER_FAILED;
  let effects=0;const {call}=await fixture(t,{capabilities:{execute:true},submit:async()=>{effects++;throw new Error('private failure payload');}});
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent:{...intent,action:'execute'}})).body.challenge;
  const authorization=signed(challenge),response=(await call('/v1/mobile/authorizations',authorization)).body;
  assert.deepEqual(response,{status:'UNKNOWN',requestId:intent.requestId,operationState:'UNKNOWN',retryAllowed:false});
  assert.deepEqual((await call('/v1/mobile/authorizations',authorization)).body,response);assert.equal(effects,1);
  assert.equal(platformDiagnosticSnapshot().counts.ADAPTER_FAILED,before+1);
});
test('pending adapter is bounded; a late admission cannot replace UNKNOWN or dispatch the same permission again',async t=>{
  const before=platformDiagnosticSnapshot().counts.ADAPTER_TIMEOUT;
  let effects=0,resolveSubmit;const pending=new Promise(resolve=>{resolveSubmit=resolve;});
  const {call}=await fixture(t,{capabilities:{prepare:true},submit:async()=>{effects++;return pending;}},store(),{submitTimeoutMs:20});
  const challenge=(await call('/v1/mobile/challenges',{ownerPublicKey,intent})).body.challenge;
  const authorization=signed(challenge),response=(await call('/v1/mobile/authorizations',authorization)).body;
  assert.deepEqual(response,{status:'UNKNOWN',requestId:intent.requestId,operationState:'UNKNOWN',retryAllowed:false});
  assert.equal(effects,1);resolveSubmit({admitted:true});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual((await call('/v1/mobile/authorizations',authorization)).body,response);assert.equal(effects,1);
  assert.equal(platformDiagnosticSnapshot().counts.ADAPTER_TIMEOUT,before+1);
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

test('fixed local original gateway preserves TLS bytes, rejects generic authority and drains the same admitted work', async t => {
  // Actual HTTP/TLS and the product gateway body; original Native construction
  // and SQL schema are explicitly inert HOST ports. No funded/proof acceptance.
  const { readFile, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const http = await import('node:http'), https = await import('node:https');
  const { checkServerIdentity } = await import('node:tls');
  const { X509Certificate, createPrivateKey } = await import('node:crypto');
  const { types } = await import('node:util');
  const { normalizeMobileOrigin } = await import('../../../packages/mobile-protocol/src/authorization.mjs');
  const { assertOriginalDeviceCloudPublicSourcesV1 } = await import('../src/original-device-cloud-source-pins-v1.mjs');
  const source = await readFile(new URL('../src/original-device-cloud-local-gateway-v1.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/^import .*;$/gm) ?? []).length, 10);
  const compile = new Function('createServer', 'tlsRequest', 'checkServerIdentity', 'X509Certificate', 'createPrivateKey', 'types',
    'normalizeMobileOrigin', 'startPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3','reopenPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3', 'assertOriginalDeviceDispatchSchemaV1', 'assertOriginalDeviceCloudPublicSourcesV1', 'platformDiagnostic',
    source.replace(/^import .*;\n/gm,'').replace(/export (async )?function /g,'$1function ')+'\nreturn {start:startPlatformOriginalDeviceCloudLocalGatewayV1,reopen:reopenPlatformOriginalDeviceCloudLocalGatewayV1};');
  const directory = await mkdtemp(join(tmpdir(), 'lianum-original-gateway-host-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const certPath = join(directory, 'certificate.pem'), keyPath = join(directory, 'key.pem');
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-sha256', '-days', '2',
    '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-addext', 'basicConstraints=critical,CA:FALSE',
    '-keyout', keyPath, '-out', certPath], { timeout: 5000, maxBuffer: 4096, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
  const tls = { certificate: await readFile(certPath, 'utf8'), privateKey: await readFile(keyPath, 'utf8') };
  let upstream, originalOrigin, ready = true, births = 0, effects = 0, closed = 0, captures = 0, schemaChecks = 0, received,originalBirth;
  let release, entered; const blocked = new Promise(resolve => { release = resolve; }), admitted = new Promise(resolve => { entered = resolve; });
  const pool = Object.freeze({ HOST_ONLY: true });
  const diagnosticCodes=[];
  const {start,reopen} = compile(http.createServer, https.request, checkServerIdentity, X509Certificate, createPrivateKey, types, normalizeMobileOrigin,
    originalBirth=async input => {
      assert.equal(input.pool, pool); births++;
      upstream = https.createServer({ cert: tls.certificate, key: tls.privateKey, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' }, async (request, response) => {
        assert.equal(request.headers.host, new URL(originalOrigin).host);
        if (request.url === '/v2/mobile/original-account/state') {
          response.end(JSON.stringify({ profile: 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2', connection: ready ? 'PAIRED' : 'DISCONNECTED' })); return;
        }
        assert.equal(request.headers.origin, originalOrigin);
        const parts = []; for await (const part of request) parts.push(part);
        received = Buffer.concat(parts).toString('utf8'); effects++;
        if (request.url.endsWith('/recover')) { entered(); await blocked; }
        if (request.url.endsWith('/fund')) { response.destroy(); return; }
        response.statusCode = 200; response.end(received);
      });
      const port = Number(new URL(input.origin).port); originalOrigin = input.origin;
      await new Promise((resolve, reject) => { upstream.once('error', reject); upstream.listen(port, '127.0.0.1', resolve); });
      return Object.freeze({ profile: 'ORIGINAL_NATIVE_DEVICE_PRIVATE_WORKER_DURABLE_NOTE_OPERATOR_V3', descriptor: { origin: input.origin, devicePublicKey: input.devicePublicKey },
        automaticFunding:false,durableOriginalAdmission:true,async capture(){captures++;await new Promise(resolve=>upstream.close(resolve));return{closed:true,originalResourcesStopped:true,plannedCaptureForNewProcess:true};},async close(){closed++;await new Promise(resolve=>upstream.close(resolve));return{closed:true,originalResourcesStopped:true};}});
    }, async input=>{const value=await originalBirth(input);return Object.freeze({...value,readReconcileWithdrawalOnly:true,capture:undefined});}, async value => { assert.equal(value, pool); schemaChecks++; if (!ready) throw Error('HOST_SQL_NOT_READY'); }, assertOriginalDeviceCloudPublicSourcesV1, code=>diagnosticCodes.push(code));
  const reservation = http.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const originalPort = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  let app = await start({ origin: `https://localhost:${originalPort}`, devicePublicKey: ownerPublicKey, tls, pool, privacyKey: '91'.repeat(32), port: 0 });
  t.after(() => app.close());
  function call(path, raw, changedHeaders = {}) {
    return new Promise((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port: app.port, path, method: raw === undefined ? 'GET' : 'POST',
        headers: { Host: new URL(originalOrigin).host, ...(raw === undefined ? {} : { Origin: originalOrigin,
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }), ...changedHeaders } }, response => {
        const parts = []; response.on('data', part => parts.push(part)); response.once('error', reject);
        response.once('end', () => resolve({ status: response.statusCode, body: Buffer.concat(parts).toString('utf8') }));
      }); request.once('error', reject); request.end(raw);
    });
  }
  assert.equal(births, 1); assert.equal(closed, 0); assert.equal((await call('/health/ready')).status, 200);
  ready = false; assert.equal((await call('/health/ready')).status, 503); ready = true;
  const raw = '{ "consent" : {"expiresAt":15000,"originalBinding":"HOST_PUBLIC_ONLY"}, "signature":"same" }';
  assert.deepEqual(await call('/v1/mobile/device-execution/reconcile', raw), { status: 200, body: raw });
  assert.equal(received, raw); assert.equal(effects, 1);
  const encrypted = JSON.stringify({ profile: 'HOST_ENCRYPTED_U_TRANSPORT_ONLY', ciphertext: 'a'.repeat(40000) });
  assert.deepEqual(await call('/v1/mobile/device-reservation/private-jobs', encrypted), { status: 200, body: encrypted });
  assert.equal(received, encrypted); assert.equal(effects, 2);
  for (const kind of ['deposit', 'reservation', 'exit']) assert.equal((await call('/v1/mobile/device-'+kind+'/jobs', raw)).status, 404);
  assert.equal(app.durableOriginalAdmission, true); assert.equal(app.privateUOpeningIntake, true); assert.equal(app.nativeRecipientToWorkerEncrypted, true);

  assert.equal((await call('/v1/mobile/challenges', '{}')).status, 503);
  assert.equal((await call('/v1/mobile/device-execution/execute?upstream=https://foreign.invalid', raw)).status, 404);
  assert.equal((await call('/v1/mobile/device-execution/execute', raw, { Origin: 'https://foreign.invalid' })).status, 403);
  assert.equal((await call('/v1/mobile/device-execution/execute', ' '.repeat(8193))).status, 400);
  assert.equal(effects, 2); assert.ok(schemaChecks >= 3);
  const lost = await call('/v1/mobile/device-deposit/fund', raw);
  assert.equal(lost.status, 502); assert.equal(JSON.parse(lost.body).error, 'ORIGINAL_TRANSPORT_UNAVAILABLE_NO_RETRY');
  assert.equal(effects, 3); // original listener saw exactly one POST, no resend
  const pending = call('/v1/mobile/device-execution/recover', raw).catch(() => null); await admitted;
  const capturing=app.capture();assert.equal(app.capture(),capturing);const closing=app.close();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(captures,0);assert.equal(closed,0);release();await pending;const captured=await capturing;await closing;
  assert.equal(captured.originalIngressStopped,true);assert.equal(captured.plannedCaptureForNewProcess,true);assert.equal(captures,1);assert.equal(closed,0);assert.equal(effects,4);assert.equal(births,1);
  app=await reopen({origin:originalOrigin,devicePublicKey:ownerPublicKey,tls,pool,privacyKey:'91'.repeat(32),port:0});
  assert.equal(app.originalOrderedReopen,true);assert.equal(app.readReconcileWithdrawalOnly,true);assert.throws(()=>app.capture(),/CAPTURE_UNAVAILABLE/);
  assert.equal((await call('/health/ready')).status,200);
  assert.deepEqual(await call('/v1/mobile/device-execution/reconcile',raw),{status:200,body:raw});
  for(const path of ['/v1/mobile/device-deposit/fund','/v1/mobile/device-reservation/reserve','/v1/mobile/device-execution/execute','/v1/mobile/device-execution/recover'])assert.equal((await call(path,raw)).status,403);
  assert.equal(effects,5);assert.equal(births,2);await app.close();assert.equal(closed,1);assert.equal(captures,1);
  assert.ok(diagnosticCodes.includes('ORIGINAL_GATEWAY_READY_FAILED'));
  assert.ok(diagnosticCodes.includes('ORIGINAL_TRANSPORT_FAILED'));
});


test('fixed private durable adapter creates only the original private realm before TLS or effects',async t=>{
 // Actual platform adapter + fixed dynamic original-module import. Native/SQL
 // birth is an explicit inert port; no proof/funding/custody acceptance.
 const {types}=await import('node:util');
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/original-device-local-operator-v1.mjs',import.meta.url),'utf8');
 const marker='export async function startPlatformOriginalPrivateNativeNoteDurableOperatorV2(input)';
 const index=source.indexOf(marker);assert.ok(index>=0);
 const nextExport=source.indexOf('\nexport async function ',index+marker.length);assert.ok(nextExport>index);
 const body=source.slice(index,nextExport).replace(marker,'async function startPlatformOriginalPrivateNativeNoteDurableOperatorV2(input)').replace('await import(original)','await originalModule()');
 const prefix=source.slice(source.indexOf('function exact('),source.indexOf('const original ='));
 const build=new Function('types','originalModule',prefix+body+'\nreturn startPlatformOriginalPrivateNativeNoteDurableOperatorV2;');
 const pool=Object.freeze({HOST_SQL_PORT_ONLY:true}),tls={certificate:'HOST_TLS_CERT',privateKey:'HOST_TLS_PRIVATE'};
 let births=0,legacyBirths=0,closed=0,retained,release,entered;
 const admitted=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});
 const input={origin:'https://wallet.example.test',devicePublicKey:ownerPublicKey,tls,pool,privacyKey:'92'.repeat(32)};
 const service=Object.freeze({profile:'ORIGINAL_NATIVE_DEVICE_PRIVATE_DURABLE_NOTE_OPERATOR_V2',descriptor:{origin:input.origin,devicePublicKey:input.devicePublicKey},automaticFunding:false,durableOriginalAdmission:true,
  async close(){closed++;return{closed:true,originalResourcesStopped:true};}});
 let selected=service;
 const start=build(types,async()=>({async createOriginalPrivateNativeNoteDurableOperatorV2(value){births++;retained=value;entered();await blocked;return selected;},
  createOriginalNativeDeviceDurableLocalOperatorV1(){legacyBirths++;throw Error('HOST_LEGACY_BIRTH_DENIED');}}));
 await assert.rejects(start({...input,privateMode:true}),/LOCAL_OPERATOR_CONFIGURATION/);
 let invoked=false;await assert.rejects(start({...input,get origin(){invoked=true;return input.origin;}}),/LOCAL_OPERATOR_CONFIGURATION/);assert.equal(invoked,false);assert.equal(births,0);
 const starting=start(input);await admitted;input.tls.privateKey='HOST_CHANGED_AFTER_START';release();
 assert.equal(await starting,service);assert.equal(retained.tls.privateKey,'HOST_TLS_PRIVATE');assert.equal(retained.pool,pool);assert.equal(retained.privacyKey,'92'.repeat(32));assert.equal(legacyBirths,0);assert.equal(closed,0);assert.equal(births,1);
 selected=Object.freeze({...service,profile:'ORIGINAL_NATIVE_DEVICE_DURABLE_LOCAL_OPERATOR_V1'});
 await assert.rejects(start({...input,tls}),/PRIVATE_DURABLE_OPERATOR_REQUIRED/);assert.equal(closed,1);assert.equal(legacyBirths,0);
 assert.equal(service.automaticFunding,false);assert.equal(service.durableOriginalAdmission,true);
});


test('HOST fixed Cloud private-worker open checks original SQL key before issuer and rejects mixed account families before TLS',async()=>{
 // Original opener body; source/SQL/issuer/runtime/proof/native ports are inert.
 // No DTO in this HOST is an accepted economic or recovery authority.
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../../packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function reopen(input,durable,privateWorker=false)');assert.ok(start>0);
 const body=source.slice(start).replace(/await import\(([^\n;]*)\)/g,'await originalModule($1)');
 const build=new Function('assert','exactRecord','normalizeOriginalNativeDeviceLocalConfigurationV1','readLocator','assertOriginalDeviceDurableRecoveryInfrastructureV1',
  'isOriginalNativePrivateWorkerAccountV3','readOriginalSessionWalletEconomicStateV1','originalModule',body+'\nreturn input=>reopen(input,true,true);');
 const exact=(value,names)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...names].sort());
 const descriptor={origin:'https://localhost:9443',devicePublicKey:ownerPublicKey},pool={HOST_SQL_PORT:true},key='93'.repeat(32),identity={sourceSHA256:'a1'.repeat(32),deadlineMs:Date.now()+60000};
 const locator={descriptor,identity,checkpoint:{revision:1,commitment:'a2'.repeat(32)},parentJobId:'a3'.repeat(32)};
 const runtime=()=>({async close(){return{stopped:true};},lifecycle:[{event:'stopped-owned-process',forced:false}]});
 let infrastructure=true,family=true,opened=0,tls=0;const calls=[];
 const account={async abort(){return{cancelled:true};},async close(){return{closed:true};}},privateAccounts=new WeakSet([account]);
 const originals={runtime:runtime(),nativeRuntime:runtime(),account,session:{async close(){return{phase:'CLOSED'};}},nativeExecution:{async close(){return{closed:true};}},
  providerCustody:{async close(){},report(){return{closed:true};}},owner:{async close(){return{closed:true,childExited:true};}},bootstrap:{close(){}},actor:{close(){}}};
 const modules={
  './native-device-source-review-v1.mjs':{async assertOriginalNativeDeviceLocalSourceReviewV1(){calls.push('source');}},
  './native-value-economic-successor-v1.mjs':{async reopenOriginalNativeValueEconomicNoteSuccessorV1(i,c){calls.push('issuer');assert.equal(i,identity);assert.equal(c,locator.checkpoint);opened++;return{originals,receipt:{processId:process.pid,originalProcessLifetimeDifferent:true,issuerClosed:true,sourceSHA256:identity.sourceSHA256}};}},
  './native-device-economic-service-v1.mjs':{async reinstallOriginalNativeDeviceDurableEconomicServiceV1(value){calls.push('tls');assert.equal(value.account,account);assert.equal(value.pool,pool);assert.equal(value.privacyKey,key);tls++;return{descriptor,parentJobId:locator.parentJobId,transport:{url:descriptor.origin,async close(){return{closed:true,originalWorkSettled:true,ownedSocketsRemaining:0};}},dispatch:{close(){}}};}},
 };
 const open=build(assert,exact,value=>value,async durable=>{assert.equal(durable,true);calls.push('locator');return locator;},async value=>{calls.push('sql');assert.equal(value.pool,pool);assert.equal(value.privacyKey,key);if(!infrastructure)throw Error('HOST_SQL_KEY_MISMATCH');},value=>family&&privateAccounts.has(value),()=>null,async name=>{assert.ok(Object.hasOwn(modules,name));return modules[name];});
 const input={...descriptor,tls:{certificate:'HOST_TLS_CERT',privateKey:'HOST_TLS_KEY'},pool,privacyKey:key};
 infrastructure=false;await assert.rejects(open(input),/HOST_SQL_KEY_MISMATCH/);assert.equal(opened,0);assert.equal(tls,0);
 infrastructure=true;family=false;calls.length=0;await assert.rejects(open(input),/NATIVE_DEVICE_LOCAL_REOPEN_PRIVATE_WORKER_REQUIRED/);assert.equal(opened,1);assert.equal(tls,0);assert.deepEqual(calls,['source','locator','sql','issuer']);
 family=true;calls.length=0;const service=await open(input);assert.equal(service.profile,'ORIGINAL_NATIVE_DEVICE_PRIVATE_WORKER_DURABLE_NOTE_OPERATOR_V3');assert.equal(service.readReconcileWithdrawalOnly,true);assert.deepEqual(calls,['source','locator','sql','issuer','tls']);await service.close();
});
