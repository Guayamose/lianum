/** Portable client against explicit fetch responses; these examples carry no
 * original account authority. Real paired HTTP has a separate integration. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '@lianum/mobile-protocol/original-account-v2';
import { createOriginalAccountApiV2, normalizeOriginalAccountServiceV2 } from '../src/api/original-account-api-v2.mjs';
import { devicePublicKey, signDeviceMessage } from '../src/custody/signing.mjs';
import { originalAccountFramesV2 } from './helpers/original-account-frames-v2.mjs';
import { privateStateAccessFrameV1, privateStateReviewFrameV1, PRIVATE_STATE_SCOPE_V1,
  PRIVATE_STATE_OBSERVATION_V1, privateStateAccessMessageV1, privateStateReviewMessageV1 }
  from '@lianum/mobile-protocol/original-account-v2';
const key = new Uint8Array(32).fill(11), device = devicePublicKey(key);
const state = () => ({ version: 2, profile: 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2', connection: 'PAIRED',
  privatePortfolio: null, economicObservation: null, noteCustodyOnDevice: false,
  nativeEffectsEstablished: false, actions: { read: true, reconcile: true } });
function fixture(action = 'read') {
  const { access, review } = originalAccountFramesV2({ devicePublicKey: device, action });
  const descriptor = { origin: access.origin, pairingId: access.pairingId, devicePublicKey: device };
  const admission = action === 'read' ? null : { version: 1, admitted: true, sequence: 2, action: 'reconcile',
    requestId: review.binding.requestId, state: 'FAILED', errorCode: 'FLAT_ACCOUNT_OPERATION_FAILED' };
  const diagnostic = { version: 2, profile: 'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2', action,
    binding: structuredClone(review.binding), admission, privatePortfolio: null, economicObservation: null,
    noteCustodyOnDevice: false, nativeEffectsEstablished: false };
  const responses = new Map([['state', state()], ['challenges', { challenge: access }],
    ['reviews', { review }], ['diagnostics', diagnostic]]), calls = [];
  let response = null;
  const api = createOriginalAccountApiV2({ descriptor, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store'); assert.equal(options.headers.Origin, descriptor.origin);
    assert.ok(options.signal instanceof AbortSignal);
    return response ?? new Response(JSON.stringify(responses.get(url.split('/').at(-1))),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  } });
  const signedAccess = { challenge: access, signature: signDeviceMessage(key, originalAccountAccessMessageV2(access)) };
  const signedReview = { review, signature: signDeviceMessage(key, originalAccountReviewMessageV2(review)) };
  return { api, access, review, diagnostic, signedAccess, signedReview, responses, calls,
    setResponse: value => { response = value; } };
}
test('explicit descriptor and portable frames traverse only the diagnostic routes, without economic capabilities', async () => {
  for (const action of ['read', 'reconcile']) {
    const f = fixture(action);
    assert.deepEqual(await f.api.state(), state());
    assert.deepEqual(await f.api.challenge(action), f.access);
    assert.deepEqual(await f.api.openReview(f.signedAccess), f.review);
    assert.deepEqual(await f.api.submit(f.signedReview), f.diagnostic);
    assert.deepEqual(f.calls.map(row => row.url.split('/').at(-1)), ['state', 'challenges', 'reviews', 'diagnostics']);
    assert.equal(JSON.stringify(f.calls).includes('privateKey'), false);
    assert.equal(f.diagnostic.privatePortfolio, null);
  }
});
test('unbound/invalid descriptors, extra fields and execute/recover cannot issue any HTTP request', async () => {
  for (const descriptor of [{}, { origin: 'http://127.0.0.1:8000', pairingId: '1'.repeat(64), devicePublicKey: device },
    { origin: 'https://original.example', pairingId: 'bad', devicePublicKey: device }])
    assert.throws(() => createOriginalAccountApiV2({ descriptor }));
  const f = fixture();
  for (const action of ['execute', 'recover', 'prepare']) await assert.rejects(f.api.challenge(action), /ORIGINAL_ACTION/);
  await assert.rejects(f.api.openReview({ ...f.signedAccess, account: {} }), /ORIGINAL_REQUEST_INVALID/);
  await assert.rejects(f.api.submit({ ...f.signedReview, callback() {} }), /ORIGINAL_REQUEST_INVALID/);
  assert.equal(f.calls.length, 0);
});
test('substituted challenge origin, pairing, key or action is rejected before protected signing', async () => {
  for (const changes of [{ origin: 'https://foreign.example' }, { pairingId: 'a2'.repeat(32) },
    { devicePublicKey: devicePublicKey(new Uint8Array(32).fill(12)) }, { action: 'reconcile' }]) {
    const f = fixture(); f.responses.set('challenges', { challenge: { ...f.access, ...changes } });
    await assert.rejects(f.api.challenge('read'), /REVIEW_CHANGED/); assert.equal(f.calls.length, 1);
  }
});
test('substituted review bootstrap/action/descriptor and expired inputs cannot advance to diagnostic POST', async () => {
  for (const changes of [{ bootstrapChallengeId: 'a2'.repeat(32) }, { action: 'reconcile' },
    { pairingId: 'a2'.repeat(32) }, { origin: 'https://foreign.example' }]) {
    const f = fixture(); f.responses.set('reviews', { review: { ...f.review, ...changes } });
    await assert.rejects(f.api.openReview(f.signedAccess), /REVIEW_CHANGED/); assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  await assert.rejects(f.api.openReview({ ...f.signedAccess, challenge: { ...f.access, expiresAt: Date.now() - 1 } }), /ORIGINAL_EXPIRED/);
  await assert.rejects(f.api.submit({ ...f.signedReview, review: { ...f.review, expiresAt: Date.now() - 1 } }), /ORIGINAL_EXPIRED/);
  assert.equal(f.calls.length, 0);
});
test('a diagnostic may update request stage but cannot substitute original lifetime/terms/submission or project balances', async () => {
  for (const change of [value => { value.binding.originalAccountLifetime = 'a2'.repeat(32); },
    value => { value.binding.requestId = 'replacement_request_0051'; }, value => { value.binding.amountAtomic = '101'; },
    value => { value.binding.asset.symbol = 'SOL'; }, value => { value.binding.journalRevision--; },
    value => { value.binding.observedProcessGeneration--; },
    value => { value.binding.submission.transactionHash = 'a2'.repeat(32); },
    value => { value.privatePortfolio = []; }, value => { value.nativeEffectsEstablished = true; }]) {
    const f = fixture('reconcile'); change(f.diagnostic);
    await assert.rejects(f.api.submit(f.signedReview), /REVIEW_CHANGED|ORIGINAL_RESPONSE_INVALID/);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture('reconcile'); f.diagnostic.binding.requestState = 'CONFIRMED';
  f.diagnostic.binding.authorityStage = 'CONFIRMED'; f.diagnostic.binding.journalRevision++;
  f.diagnostic.admission.state = 'SUCCEEDED'; f.diagnostic.admission.errorCode = null;
  const value = await f.api.submit(f.signedReview);
  assert.equal(value.binding.requestState, 'CONFIRMED'); assert.equal(value.privatePortfolio, null);
  assert.equal(value.economicObservation, null); assert.equal(value.nativeEffectsEstablished, false);
});
test('permission admission must retain the original request and queue state; it never becomes economic confirmation', async () => {
  for (const changes of [{ admitted: false }, { version: 2 }, { requestId: 'replacement_request_0051' },
    { action: 'execute' }, { state: 'CONFIRMED' }, { state: 'SUCCEEDED', errorCode: 'BAD' },
    { state: 'FAILED', errorCode: null }, { sequence: 0 }, { callback: 'extra' }]) {
    const f = fixture('reconcile'); Object.assign(f.diagnostic.admission, changes);
    await assert.rejects(f.api.submit(f.signedReview), /ORIGINAL_RESPONSE_INVALID/);
  }
  const f = fixture(); f.diagnostic.admission = { version: 1, admitted: true };
  await assert.rejects(f.api.submit(f.signedReview), /ORIGINAL_RESPONSE_INVALID/);
  assert.throws(() => normalizeOriginalAccountServiceV2({ ...state(), economicObservation: 'CONFIRMED' }), /RESPONSE_INVALID/);
});
test('diagnostics never regress an initiated or terminal original request even at a newer journal revision', async () => {
  for (const [beforeRequest, beforeAuthority, afterRequest, afterAuthority] of [
    ['UNKNOWN', 'UNKNOWN', 'PREPARED', 'UNKNOWN'], ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'READY'],
    ['CONFIRMED', 'CONFIRMED', 'UNKNOWN', 'CONFIRMED'], ['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'UNKNOWN'],
  ]) {
    const f = fixture('reconcile');
    f.review.binding.requestState = beforeRequest; f.review.binding.authorityStage = beforeAuthority;
    f.signedReview.signature = signDeviceMessage(key, originalAccountReviewMessageV2(f.review));
    f.diagnostic.binding.requestState = afterRequest; f.diagnostic.binding.authorityStage = afterAuthority;
    f.diagnostic.binding.journalRevision++;
    await assert.rejects(f.api.submit(f.signedReview), /REVIEW_CHANGED/);
    assert.equal(f.calls.length, 1);
  }
});
test('redirects, foreign URLs, oversized/non-JSON/error responses reject without transport retry', async () => {
  for (const response of [
    { redirected: true, url: '', headers: new Headers(), ok: true, text: async () => '{}' },
    { redirected: false, url: 'https://foreign.example', headers: new Headers(), ok: true, text: async () => '{}' },
    new Response('{}', { headers: { 'content-type': 'text/html' } }),
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '16385' } }),
    new Response('x'.repeat(16385), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }),
  ]) {
    const f = fixture(); f.setResponse(response);
    await assert.rejects(f.api.state()); assert.equal(f.calls.length, 1);
  }
});
test('chunked or falsely short responses stop at the byte limit and cancel only their response stream', async () => {
  for (const declared of [null, '1']) {
    let reads = 0, cancelled = 0;
    const stream = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(4096).fill(120)); },
      cancel() { cancelled++; } }, { highWaterMark: 0 });
    const headers = { 'content-type': 'application/json' };
    if (declared !== null) headers['content-length'] = declared;
    const f = fixture(); f.setResponse(new Response(stream, { headers }));
    await assert.rejects(f.api.state(), /ORIGINAL_RESPONSE_INVALID/);
    assert.equal(reads, 5); assert.equal(cancelled, 1); assert.equal(f.calls.length, 1);
  }
});
test('a missing streaming body is rejected rather than calling an unbounded text adapter', async () => {
  const f = fixture(); let textCalls = 0;
  f.setResponse({ ok: true, redirected: false, url: '', headers: new Headers({ 'content-type': 'application/json' }),
    body: null, text: async () => { textCalls++; return JSON.stringify(state()); } });
  await assert.rejects(f.api.state(), /ORIGINAL_STREAM_REQUIRED/);
  assert.equal(textCalls, 0); assert.equal(f.calls.length, 1);
});
test('a quiet response stream expires even if its transport ignores abort or cancel never resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = 0;
  const stream = new ReadableStream({ pull() {}, cancel() { cancelled++; return new Promise(() => {}); } }, { highWaterMark: 0 });
  const f = fixture(); f.setResponse(new Response(stream, { headers: { 'content-type': 'application/json' } }));
  const pending = assert.rejects(f.api.state(), /SERVICE_UNAVAILABLE/);
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(15_000); await pending;
  assert.equal(cancelled, 1); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.signal.aborted, true);
});

test('private-state transport binds the original asset/lifetime and rejects stale, inflated or substituted observations before display', async t => {
  const stateFixture = (genesis='c1'.repeat(32),requestId='original_request_0051') => {
    const f = fixture();
    f.review.binding.asset.genesis=genesis;
    f.review.binding.requestId=requestId;
    f.responses.set('challenges', { challenge: privateStateAccessFrameV1(f.access) });
    f.responses.set('reviews', { review: privateStateReviewFrameV1(f.review) });
    const value = { version: 1, profile: PRIVATE_STATE_OBSERVATION_V1, scope: PRIVATE_STATE_SCOPE_V1,
      binding: structuredClone(f.review.binding), status: 'LIVE',
      asset: { assetId: f.review.binding.assetId, ...f.review.binding.asset },
      observed: { observedAt: Date.now(), blockNumber: '10', blockHash: 'a1'.repeat(32), timestamp: '10000' },
      balances: { available: '100', reserved: '0', recovery: '40', locked: '0' },
      backing: { held: '100', liabilities: '100', surplus: '0', deficit: '0' },
      request: { requestId: f.review.binding.requestId, kind: f.review.binding.kind, state: 'UNRESOLVED', disposition: null },
      custody: 'LINUX_ORIGINAL_OWNER_CUSTODY', mobileNoteCustody: false, completePortfolio: false };
    f.responses.set('observations', value);
    return { ...f, value, stateSignedReview: { review: f.review, signature: signDeviceMessage(key, privateStateReviewMessageV1(f.review)) } };
  };
  const f = stateFixture();
  assert.deepEqual(await f.api.privateState.challenge(), f.access);
  assert.deepEqual(await f.api.privateState.openReview({ challenge: f.access,
    signature: signDeviceMessage(key, privateStateAccessMessageV1(f.access)) }), f.review);
  const observed = await f.api.privateState.submit(f.stateSignedReview);
  assert.equal(observed.balances.available, '100'); assert.equal(observed.balances.recovery, '40');
  assert.ok(f.calls.every(row => row.url.includes('/v1/mobile/original-account/private-state/')));
  for (const mutate of [value => { value.asset.pool = 'a2'.repeat(20); },
    value => { value.binding.originalAccountLifetime = 'a2'.repeat(32); },
    value => { value.binding.observedProcessGeneration++; },
    value => { value.observed.observedAt -= 15_001; },
    value => { value.balances.recovery = '101'; },
    value => { value.backing.held = '99'; },
    value => { value.status = 'UNAVAILABLE'; },
    value => { value.completePortfolio = true; }]) {
    const changed = stateFixture(); mutate(changed.value);
    await assert.rejects(changed.api.privateState.submit(changed.stateSignedReview), /PRIVATE_STATE_INVALID|REVIEW_CHANGED/);
  }
  const unavailable = stateFixture();
  Object.assign(unavailable.value, { status: 'UNAVAILABLE', observed: null, balances: null, backing: null });
  const unknown = await unavailable.api.privateState.submit(unavailable.stateSignedReview);
  assert.equal(unknown.balances, null);
  // Execute the real mobile union and SDK; the explicit fetch fixture grants
  // no economic account. Expo crypto is unreachable in these account-only
  // cases and is fenced instead of fabricating DeFi hashing or SDK authority.
  const hooks=registerHooks({resolve(specifier,context,next){if(specifier==='expo-crypto')return{url:'data:text/javascript,export%20function%20digest()%7Bthrow%20Error(%22HOST_UNREACHABLE_CRYPTO%22)%3B%7D',shortCircuit:true};return next(specifier,context);}});
  t.after(()=>hooks.deregister());
  const {createPrivateWalletStateV1}=await import('../src/state/private-wallet-state-v1.mjs'),wallet=createPrivateWalletStateV1();
  assert.throws(()=>wallet.acceptAccount(structuredClone(observed)));assert.throws(()=>wallet.acceptPositions({}));assert.throws(()=>wallet.acceptExternal({}));
  wallet.acceptAccount(observed);let snapshot=wallet.snapshot();assert.equal(snapshot.rows.length,1);assert.equal(snapshot.rows[0].state,'UNKNOWN');assert.equal(snapshot.rows[0].available,null);
  const other=stateFixture('c2'.repeat(32));other.value.request.state='CONFIRMED';other.value.request.disposition='APPLIED';
  const otherObserved=await other.api.privateState.submit(other.stateSignedReview);wallet.acceptAccount(otherObserved);
  snapshot=wallet.snapshot();assert.equal(snapshot.rows.length,2);assert.notEqual(snapshot.rows[0].key,snapshot.rows[1].key);assert.equal(snapshot.rows[1].available,'100');assert.equal(snapshot.rows[1].recovery,'40');assert.equal(snapshot.aggregateBalance,null);
  const later=stateFixture('c1'.repeat(32),'original_request_0052');later.value.request.state='CONFIRMED';later.value.request.disposition='APPLIED';
  wallet.acceptAccount(await later.api.privateState.submit(later.stateSignedReview));snapshot=wallet.snapshot();assert.equal(snapshot.rows.length,2);assert.equal(snapshot.rows[0].requests.length,2);assert.equal(snapshot.rows[0].state,'UNKNOWN');assert.equal(snapshot.rows[0].available,null);
  assert.equal(f.calls.length,3);assert.equal(other.calls.length,1);assert.equal(Object.isFrozen(snapshot.rows[1]),true);
  const realNow=Date.now;t.mock.method(Date,'now',()=>realNow()+15001);snapshot=wallet.snapshot();assert.equal(snapshot.rows.every(row=>row.state==='STALE'&&row.available===null&&row.recovery===null),true);t.mock.restoreAll();
  wallet.clear();assert.equal(wallet.snapshot().rows.length,0);assert.equal(createPrivateWalletStateV1().snapshot().rows.length,0);
  // An unavailable response has no live head to expire. The READ review must
  // still be fresh after the original response stream has been received.
  const late=stateFixture();Object.assign(late.value,{status:'UNAVAILABLE',observed:null,balances:null,backing:null});
  const reply=new Response(JSON.stringify(late.value),{status:200,headers:{'content-type':'application/json; charset=utf-8'}}),reader=reply.body.getReader.bind(reply.body);
  t.mock.method(reply.body,'getReader',()=>{t.mock.method(Date,'now',()=>late.review.expiresAt+1);return reader();});late.setResponse(reply);
  await assert.rejects(late.api.privateState.submit(late.stateSignedReview),/ORIGINAL_EXPIRED/);t.mock.restoreAll();
});

test('device U uses its exact consent domain and one fixed POST; a lost response never triggers a second proof or reservation', async () => {
  const { deviceReservationFixtureV1 } = await import('./helpers/device-reservation-fixture-v1.mjs');
  const { deviceReservationConsentMessageV1 } = await import('../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs');
  const f = deviceReservationFixtureV1(key), calls = [];
  const api = createOriginalAccountApiV2({ descriptor: f.descriptor, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/job-reviews')) return new Response(JSON.stringify(f.consent), { headers: { 'content-type': 'application/json' } });
    assert.ok(url.endsWith('/jobs')); throw new Error('SYNTHETIC_LOST_ADMITTED_RESPONSE');
  } });
  const accessSignature = signDeviceMessage(key, originalAccountAccessMessageV2(f.access));
  const input = { access: f.access, signature: accessSignature, depositJobId: f.consent.depositJobId, quoteId: f.consent.quoteId,
    custody: f.consent.custody, statement: f.consent.statement, witnessSHA256: f.consent.witnessSHA256, jobId: f.consent.jobId };
  const consent = await api.deviceReservation.challengeJob(input);
  const signature = signDeviceMessage(key, deviceReservationConsentMessageV1(consent));
  await assert.rejects(api.deviceReservation.submit({ consent, signature, witness: f.witness }), /LOST_ADMITTED/);
  assert.deepEqual(calls.map(row => row.url.split('/').at(-1)), ['job-reviews', 'jobs']);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.consent.jobId, f.consent.jobId); assert.deepEqual(body.witness, f.witness);
  assert.equal(JSON.stringify(body).includes('privateKey'), false); assert.equal(JSON.stringify(body).includes('rootHex'), false);
  const before = calls.length;
  await assert.rejects(api.deviceReservation.submit({ consent: { ...consent, origin: 'https://foreign.example' }, signature, witness: f.witness }), /REVIEW_CHANGED/);
  await assert.rejects(api.deviceReservation.submit({ consent, signature, witness: { ...f.witness, privateKey: '11'.repeat(32) } }), /RESERVATION_INVALID/);
  assert.equal(calls.length, before);
});

// These frames demonstrate transport/signature boundaries only. They do not
// carry an owned executor or establish any delivery, S/T/F or native balance.
test('native continuation uses only its three fixed routes and one POST; lost replies never replay a reserve or delivery', async () => {
  const { deviceReservationFixtureV1 } = await import('./helpers/device-reservation-fixture-v1.mjs');
  const { deviceExecutionConsentMessageV1 } = await import('../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs');
  for (const [action, reviewPath, submitPath] of [['EXECUTE_NATIVE', 'execution-reviews', 'execute'],
    ['RECONCILE_NATIVE', 'reconciliation-reviews', 'reconcile'], ['RECOVER_NATIVE', 'recovery-reviews', 'recover']]) {
    const f = deviceReservationFixtureV1(key), calls = [];
    const consent = { version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_EXECUTION_V1', action,
      reservation: { ...f.consent, action: 'OBSERVE_S', proofSHA256: '21'.repeat(32), publicInputsSHA256: '22'.repeat(32), openingDisclosure: null },
      nativeBindingSHA256: '23'.repeat(32), reservationTransactionHash: '24'.repeat(32), executionSnapshotSHA256: '25'.repeat(32),
      lossClause: 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1' };
    const api = createOriginalAccountApiV2({ descriptor: f.descriptor, fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/' + reviewPath)) return new Response(JSON.stringify(consent), { headers: { 'content-type': 'application/json' } });
      assert.ok(url.endsWith('/' + submitPath)); throw Error('SYNTHETIC_LOST_ADMITTED_RESPONSE');
    } });
    const reviewed = await api.deviceExecution.challenge(action, { access: f.access,
      signature: signDeviceMessage(key, originalAccountAccessMessageV2(f.access)), jobId: f.consent.jobId });
    const signature = signDeviceMessage(key, deviceExecutionConsentMessageV1(reviewed));
    await assert.rejects(api.deviceExecution.submit({ consent: reviewed, signature }), /LOST_ADMITTED/);
    assert.deepEqual(calls.map(row => row.url.split('/').at(-1)), [reviewPath, submitPath]);
    assert.ok(calls.every(row => row.url.includes('/v1/mobile/device-execution/')));
    const body = JSON.parse(calls[1].options.body); assert.deepEqual(Object.keys(body).sort(), ['consent', 'signature']);
    assert.equal(body.consent.reservation.jobId, f.consent.jobId);
    const before = calls.length;
    await assert.rejects(api.deviceExecution.submit({ consent: { ...reviewed, reservation: { ...reviewed.reservation, origin: 'https://foreign.example' } }, signature }), /REVIEW_CHANGED/);
    await assert.rejects(api.deviceExecution.submit({ consent: reviewed, signature, providers: [] }), /REQUEST_INVALID/);
    await assert.rejects(api.deviceExecution.challenge('RESERVE_S', { access: f.access, signature, jobId: f.consent.jobId }), /REQUEST_INVALID/);
    assert.equal(calls.length, before);
  }
});
