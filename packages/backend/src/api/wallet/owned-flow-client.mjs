/** Owned local wallet flow over the real SDK, one-use grants and current journals. */
import assert from 'node:assert/strict';
import { createWalletApplicationClient } from './wallet-application-client.mjs';
import { ALL_ACTIONS } from '@lianum/mobile-protocol/wallet/client';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const actionName = (section, method) => section + method[0].toUpperCase() + method.slice(1);
const id = value => assert.match(value, /^[A-Za-z0-9_-]{8,100}$/);
const idle = snapshot => snapshot?.phase === 'READY' && snapshot.available === true
  && snapshot.storageAvailable === true && snapshot.busy === false && snapshot.queued === 0
  && snapshot.observation === 'CURRENT';

export function createOwnedWalletFlowClientV1(app, { deadlineMs }) {
  assert.equal(app.actionAccess, undefined, 'MANUAL_ACCEPTANCE_BROAD_ACCESS_FORBIDDEN');
  assert.match(app.origin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);
  assert.equal(app.ownerAccess.origin, app.origin);
  assert.ok(Number.isSafeInteger(deadlineMs) && deadlineMs > 0);
  const evidence = [];
  const host = app.createManualActionHandoff();
  assert.equal(host.descriptor.origin, app.origin);
  const client = (token, handoff = false) => createWalletApplicationClient({ origin: app.origin,
    ownerToken: app.ownerAccess.token, ...(token === undefined ? {} : { actionToken: token }),
    ...(handoff ? { manualActionHandoff: host.descriptor } : {}) });
  const reader = client();
  function remaining() {
    const ms = deadlineMs - Date.now();
    if (ms <= 0) fail('MANUAL_ACCEPTANCE_ORIGINAL_DEADLINE_EXHAUSTED');
    return Math.min(ms, 2147483647);
  }
  async function state() {
    remaining();
    if (!await reader.refresh()) fail('MANUAL_ACCEPTANCE_SDK_STATE_UNAVAILABLE');
    remaining();
    const state = reader.getState();
    assert.equal(state.stale, false);
    assert.equal(state.data.capabilities.graphExecution, false);
    return state.data;
  }
  async function wire(action, body, access) {
    assert.ok(Object.hasOwn(ALL_ACTIONS, action));
    const response = await fetch(app.origin + ALL_ACTIONS[action].route, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(remaining()),
      headers: { Origin: app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': access.token },
      body: JSON.stringify(body),
    });
    const result = { status: response.status, body: await response.json() }; remaining(); return result;
  }
  async function rejectedReplay(action, body, access) {
    const value = await wire(action, body, access);
    assert.equal(value.status, 403, 'MANUAL_ACCEPTANCE_USED_GRANT_ACCEPTED');
    assert.equal(value.body.error, 'WALLET_ACTION_ACCESS_REQUIRED');
    evidence.push({ action, requestId: body.requestId ?? null, check: 'USED_EXACT_GRANT_REJECTED' });
  }
  async function reviewed(action, body) {
    remaining(); body = structuredClone(body);
    const current = await state();
    const graph = action.startsWith('account') && (body.kind === 'GRAPH'
      || current.account?.snapshot?.requests?.some(row => row.requestId === body.requestId && row.kind === 'GRAPH')
      || current.account?.manualGraphs?.some(row => row.requestId === body.requestId));
    if (graph) assert.ok(current.account?.manualGraphs?.some(row => row.requestId === body.requestId),
      'MANUAL_ACCEPTANCE_ORIGINAL_GRAPH_REQUIRED');
    const nativeNote = action.startsWith('account') && current.account?.manualNativeNotes?.some(row => row.requestId === body.requestId);
    const handoff = graph || nativeNote;
    let access = handoff ? null : app.issueActionCapability({ action, body });
    const sdk = client(access?.token, handoff);
    if (!await sdk.refresh()) fail('MANUAL_ACCEPTANCE_SDK_REVIEW_UNAVAILABLE');
    remaining();
    const baseline = sdk.getState().data.account?.snapshot;
    assert.ok(idle(baseline), 'MANUAL_ACCEPTANCE_ORIGINAL_JOURNAL_NOT_READY');
    const sequence = Math.max(0, ...baseline.admissions.map(item => item.sequence)) + 1;
    const review = sdk.review(action, body);
    assert.deepEqual(review.body, body, 'MANUAL_ACCEPTANCE_REVIEW_BODY_CHANGED');
    if (handoff) {
      assert.equal(sdk.canConfirm(), false, 'MANUAL_ACCEPTANCE_TOKENLESS_REVIEW_SENT');
      const request = sdk.getManualActionReview();
      assert.deepEqual(request.body, body); assert.equal(request.action, action);
      assert.equal(request.origin, app.origin); assert.equal(request.listenerId, host.descriptor.listenerId);
      if (graph) assert.deepEqual(request.graph, review.accountContext.graph);
      else {
        assert.equal(request.profile, 'ORIGINAL_NATIVE_VALUE_NOTE_HANDOFF_V1');
        assert.deepEqual(request.note, review.accountContext.nativeNote);
        assert.equal(request.bodySHA256, request.note.actionBodySHA256[action]);
      }
      // Fixed acceptance script explicitly authorizes this exact visible review.
      // Owner-note approval remains separate in the original private catalogue.
      const grant = await host.authorizeReview(request); remaining();
      assert.equal(await sdk.acceptManualActionGrant(grant), true, 'MANUAL_ACCEPTANCE_HANDOFF_COMMITMENT_UNVERIFIED');
      remaining(); access = grant.access;
      assert.equal(sdk.canConfirm(), true);
      assert.equal(JSON.stringify(sdk.getState()).includes(access.token), false, 'MANUAL_ACCEPTANCE_TOKEN_DISCLOSED');
      evidence.push({ action, requestId: body.requestId, check: 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED',
        reviewId: request.reviewId, listenerId: request.listenerId, generationId: request.binding.generationId,
        accountIdentitySHA256: request.binding.accountIdentitySHA256, headAvailable: request.head !== null,
        explicitScriptedAuthorization: true, sent: false,
        ...(nativeNote ? { nativeNoteProfile: request.note.profile, kind: request.note.kind,
          bodySHA256: request.bodySHA256, termsSHA256: request.note.termsSHA256,
          processIdentitySHA256: request.note.terms.processIdentitySHA256, keyScopeSHA256: request.note.terms.keyScopeSHA256 } : {}) });
    }
    assert.equal(access.origin, app.origin);
    let used = false;
    return { review: structuredClone(review), body, sequence, access,
      cancel() { assert.equal(used, false); used = true; sdk.cancelReview(); if (handoff) host.cancelReview(); },
      async confirm() {
        assert.equal(used, false, 'MANUAL_ACCEPTANCE_REVIEW_ALREADY_USED'); used = true; remaining();
        // This call is the explicit scripted acceptance confirmation. Never
        // retry after false, a timeout, transport loss or an UNKNOWN outcome.
        if (!await sdk.confirm()) fail('MANUAL_ACCEPTANCE_ORIGINAL_OUTCOME_UNKNOWN');
        remaining();
        const outcome = sdk.getState().outcome;
        assert.equal(outcome.action, action); assert.equal(outcome.requestId, body.requestId ?? null);
        assert.equal(outcome.state, action.startsWith('account') ? 'VOLATILE_QUEUE_ACCEPTANCE' : 'SERVICE_RESULT');
        await rejectedReplay(action, body, access);
        if (handoff) evidence.push({ action, requestId: body.requestId, check: 'EXPLICIT_HANDOFF_CONFIRMATION',
          reviewId: review.manualHandoff.reviewId, listenerId: host.descriptor.listenerId });
        return outcome;
      },
    };
  }
  async function pollAccount(method, body, sequence, expectedKind = null) {
    const expected = method === 'prepare' ? 'PREPARED' : 'CONFIRMED';
    while (true) {
      const snapshot = (await state()).account?.snapshot;
      assert.ok(snapshot && Array.isArray(snapshot.admissions) && Array.isArray(snapshot.requests));
      const admissions = snapshot.admissions.filter(item => item.sequence === sequence);
      assert.equal(admissions.length, 1, 'MANUAL_ACCEPTANCE_ORIGINAL_ADMISSION_REQUIRED');
      const admission = admissions[0];
      assert.equal(admission.action, method); assert.equal(admission.requestId, body.requestId);
      if (admission.state === 'FAILED') fail(admission.errorCode ?? 'MANUAL_ACCEPTANCE_ADMISSION_FAILED');
      if (snapshot.phase !== 'READY' || snapshot.available !== true || snapshot.storageAvailable !== true)
        fail('MANUAL_ACCEPTANCE_ORIGINAL_JOURNAL_UNAVAILABLE');
      const rows = snapshot.requests.filter(item => item.requestId === body.requestId);
      assert.ok(rows.length <= 1, 'MANUAL_ACCEPTANCE_ORIGINAL_REQUEST_REQUIRED');
      const row = rows[0];
      if (row) {
        expectedKind ??= row.kind; assert.equal(row.kind, expectedKind);
        // A fresh explicit reconciliation/recovery can drain retained UNKNOWN.
        // No stale SUCCEEDED frame or old CONFIRMED row finishes a later action.
        if (['UNKNOWN', 'RECOVERING'].includes(row.state)
          && !(['reconcile', 'recover'].includes(method) && (!idle(snapshot) || ['ADMITTED', 'RUNNING'].includes(admission.state))))
          fail('MANUAL_ACCEPTANCE_ORIGINAL_RECONCILIATION_REQUIRED');
      }
      if (admission.state === 'SUCCEEDED' && idle(snapshot)) {
        assert.ok(row, 'MANUAL_ACCEPTANCE_ORIGINAL_REQUEST_REQUIRED'); assert.equal(row.state, expected);
        const record = { action: method, requestId: body.requestId, admissionSequence: sequence,
          via: 'NODE_SDK_EXACT_ONLY_HTTP', httpAdmission: 'VOLATILE_UI_QUEUE_ONLY', originalJournalState: row.state };
        evidence.push(record); return { snapshot, ...record };
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining())));
    }
  }
  async function reviewAccount(method, body) {
    assert.ok(['prepare', 'execute', 'reconcile', 'recover'].includes(method)); id(body.requestId);
    const prepared = await reviewed(actionName('account', method), body);
    return Object.freeze({review:prepared.review,cancel:prepared.cancel,async confirm(){
      await prepared.confirm();
      return pollAccount(method,prepared.body,prepared.sequence,
        method==='prepare'?prepared.body.kind:prepared.review.accountContext.kind);
    }});
  }
  return Object.freeze({state,reviewAccount,evidence:()=>structuredClone(evidence),
    async account(method,body){return (await reviewAccount(method,body)).confirm();}});
}
