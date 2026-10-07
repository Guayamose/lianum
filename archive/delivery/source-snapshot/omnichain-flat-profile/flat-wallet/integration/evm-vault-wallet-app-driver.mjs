/** Fixed-route acceptance driver for one already-started wallet application.
 * It creates no session/runtime/proof and never exposes GRAPH through the app.
 * Explicit driver reads are not UI polling or settlement from an HTTP ack. */
import assert from 'node:assert/strict';
import { exactRecord } from '../wallet-platform/modules/paeg/commitments.mjs';
const routes = Object.freeze({ account: Object.freeze({ prepare: '/api/wallet/account/prepare',
  execute: '/api/wallet/account/execute', reconcile: '/api/wallet/account/reconcile' }),
  defi: Object.freeze({ prepare: '/api/wallet/defi/prepare', requote: '/api/wallet/defi/requote',
    execute: '/api/wallet/defi/execute', reconcile: '/api/wallet/defi/reconcile', reopen: '/api/wallet/defi/reopen' }) });
const match = (value, re) => typeof value === 'string' && re.exec(value)?.[0] === value;
function id(value) { assert.ok(match(value, /^[A-Za-z0-9_-]{8,100}$/), 'EVM_VAULT_APP_ORIGINAL_REQUEST_ID'); }
function prepare(body) {
  exactRecord(body, ['requestId', 'kind', 'ownerOperationRef', 'assetId']); id(body.requestId);
  assert.ok(['TOP_UP', 'EXIT'].includes(body.kind), 'EVM_VAULT_APP_GRAPH_FORBIDDEN');
  for (const name of ['ownerOperationRef', 'assetId']) assert.ok(match(body[name], /^[0-9a-f]{64}$/));
}
function fail(code) { throw Object.assign(new Error(code), { code }); }

export function createEvmVaultWalletAppDriver(app, options) {
  exactRecord(options, ['deadlineMs']);
  assert.ok(Number.isSafeInteger(options.deadlineMs) && options.deadlineMs >= 0, 'EVM_VAULT_APP_ORIGINAL_DEADLINE');
  const deadlineMs = options.deadlineMs;
  function remaining() {
    const left = deadlineMs - Date.now();
    if (left <= 0) fail('EVM_VAULT_APP_POLL_BUDGET_EXHAUSTED');
    return Math.min(left, 2147483647);
  }
  async function wire(url, options) {
    const budget = remaining();
    try {
      const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(budget) });
      const body = await response.json(); remaining();
      return { status: response.status, body };
    } catch (error) {
      if (Date.now() >= deadlineMs) fail('EVM_VAULT_APP_POLL_BUDGET_EXHAUSTED');
      throw error; // Lost replies never trigger another mutating request.
    }
  }
  assert.ok(app && match(app.origin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/), 'EVM_VAULT_APP_ORIGINAL_ORIGIN');
  const origin = app.origin, owner = app.ownerAccess, action = app.actionAccess;
  for (const access of [owner, action]) {
    exactRecord(access, ['origin', 'token']); assert.equal(access.origin, origin);
    assert.ok(match(access.token, /^[0-9a-f]{64}$/), 'EVM_VAULT_APP_ORIGINAL_ACCESS');
  }
  assert.notEqual(owner.token, action.token, 'EVM_VAULT_APP_SEPARATE_ACCESS');
  async function state() {
    const response = await wire(origin + '/api/wallet/state', {
      headers: { Origin: origin, 'x-wallet-owner-token': owner.token } });
    assert.equal(response.status, 200, 'EVM_VAULT_APP_OWNER_STATE');
    const value = response.body;
    assert.equal(value.version, 1); assert.equal(value.profile, 'ACTIVE_FLAT_WALLET_APP_V1');
    assert.equal(value.capabilities.graphExecution, false, 'EVM_VAULT_APP_GRAPH_WAS_EXPOSED');
    return value;
  }
  async function post(section, method, body) {
    assert.ok(Object.hasOwn(routes, section) && Object.hasOwn(routes[section], method), 'EVM_VAULT_APP_FIXED_ROUTE');
    return wire(origin + routes[section][method], { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, 'x-wallet-action-token': action.token },
      body: JSON.stringify(body) });
  }
  return Object.freeze({ state,
    async account(method, input) {
      assert.ok(Object.hasOwn(routes.account, method), 'EVM_VAULT_APP_FIXED_ROUTE');
      if (method === 'prepare') prepare(input); else { exactRecord(input, ['requestId']); id(input.requestId); }
      const body = structuredClone(input), response = await post('account', method, body);
      assert.equal(response.status, 200, 'EVM_VAULT_APP_VOLATILE_ADMISSION');
      const accepted = response.body;
      assert.equal(accepted.version, 1); assert.equal(accepted.profile, 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1');
      assert.equal(accepted.acceptance, 'VOLATILE_UI_QUEUE_ONLY');
      assert.equal(accepted.durableAdmissionEstablished, false); assert.equal(accepted.settlementEstablished, false);
      assert.equal(accepted.admission.admitted, true); assert.equal(accepted.admission.requestId, body.requestId);
      assert.equal(accepted.admission.action, method);
      const sequence = accepted.admission.sequence;
      assert.ok(Number.isSafeInteger(sequence) && sequence > 0, 'EVM_VAULT_APP_ORIGINAL_ADMISSION_REQUIRED');
      const expectedState = method === 'prepare' ? 'PREPARED' : 'CONFIRMED';
      let originalKind = method === 'prepare' ? body.kind : null;
      // The existing supervisor owns the whole-run deadline and cancellation.
      // No action is retried. Reads retain the same request/admission identity.
      while (true) {
        const value = await state(), snapshot = value.account?.snapshot;
        assert.ok(snapshot, 'EVM_VAULT_APP_ORIGINAL_ACCOUNT_REQUIRED');
        assert.ok(Array.isArray(snapshot.admissions) && Array.isArray(snapshot.requests), 'EVM_VAULT_APP_JOURNAL_RESPONSE');
        assert.ok(typeof snapshot.busy === 'boolean' && Number.isSafeInteger(snapshot.queued) && snapshot.queued >= 0,
          'EVM_VAULT_APP_JOURNAL_RESPONSE');
        assert.ok(snapshot.idle === undefined || typeof snapshot.idle === 'boolean', 'EVM_VAULT_APP_JOURNAL_RESPONSE');
        assert.ok(['CURRENT', 'STALE'].includes(snapshot.observation), 'EVM_VAULT_APP_JOURNAL_RESPONSE');
        const admissions = snapshot.admissions.filter(item => item.sequence === sequence);
        assert.equal(admissions.length, 1, 'EVM_VAULT_APP_ORIGINAL_ADMISSION_REQUIRED');
        const admission = admissions[0];
        assert.equal(admission.requestId, body.requestId, 'EVM_VAULT_APP_ADMISSION_IDENTITY_CHANGED');
        assert.equal(admission.action, method, 'EVM_VAULT_APP_ADMISSION_IDENTITY_CHANGED');
        assert.ok(['ADMITTED', 'RUNNING', 'SUCCEEDED', 'FAILED'].includes(admission.state), 'EVM_VAULT_APP_JOURNAL_RESPONSE');
        if (admission.state === 'FAILED') fail(admission.errorCode ?? 'EVM_VAULT_APP_ADMISSION_FAILED');
        if (snapshot.phase !== 'READY' || snapshot.available !== true || snapshot.storageAvailable !== true)
          fail('EVM_VAULT_APP_ORIGINAL_JOURNAL_UNAVAILABLE');
        const originals = snapshot.requests.filter(item => item.requestId === body.requestId);
        assert.ok(originals.length <= 1, 'EVM_VAULT_APP_ORIGINAL_REQUEST_REQUIRED');
        const original = originals[0];
        const idleCurrent = snapshot.busy === false && snapshot.queued === 0
          && snapshot.idle !== false && snapshot.observation === 'CURRENT';
        if (original) {
          assert.ok(['TOP_UP', 'EXIT'].includes(original.kind), 'EVM_VAULT_APP_GRAPH_FORBIDDEN');
          originalKind ??= original.kind;
          assert.equal(original.kind, originalKind, 'EVM_VAULT_APP_ORIGINAL_REQUEST_KIND');
          assert.ok(['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'].includes(original.state),
            'EVM_VAULT_APP_JOURNAL_RESPONSE');
          // An explicitly requested reconciliation may be resolving an already
          // UNKNOWN row. Waiting for that same admission does not resume/send.
          if (['UNKNOWN', 'RECOVERING'].includes(original.state)
            && !(method === 'reconcile' && (['ADMITTED', 'RUNNING'].includes(admission.state) || !idleCurrent)))
            fail('EVM_VAULT_APP_ORIGINAL_RECONCILIATION_REQUIRED');
        }
        // SUCCEEDED is published before the session's final observe/pending
        // release. Even an already-CONFIRMED row is only pending while stale.
        if (admission.state === 'SUCCEEDED' && idleCurrent) {
          assert.ok(original, 'EVM_VAULT_APP_ORIGINAL_REQUEST_REQUIRED');
          assert.equal(original.state, expectedState, 'EVM_VAULT_APP_JOURNAL_STATE_CONFLICT');
          return { snapshot, requestId: body.requestId, action: method, admissionSequence: sequence,
            httpAdmission: 'VOLATILE_UI_QUEUE_ONLY', originalJournalState: original.state };
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining())));
      }
    },
    async duplicateAccountExecute(requestId) {
      id(requestId); const response = await post('account', 'execute', { requestId });
      assert.equal(response.status, 409); assert.equal(response.body.error, 'WALLET_ACCOUNT_STATE_CONFLICT');
      const snapshot = (await state()).account?.snapshot;
      assert.equal(snapshot?.requests.find(item => item.requestId === requestId)?.state, 'CONFIRMED');
      return { snapshot, duplicateRejected: true };
    },
    async rejectGraphRequest(requestId) {
      id(requestId); const response = await post('account', 'execute', { requestId });
      assert.equal(response.status, 400); assert.equal(response.body.error, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
      return { graphRejected: true };
    },
    async defi(method, input) {
      assert.ok(Object.hasOwn(routes.defi, method), 'EVM_VAULT_APP_FIXED_ROUTE');
      exactRecord(input, method === 'reopen' ? [] : ['prepare', 'requote'].includes(method)
        ? ['requestId', 'minimumOutput', 'deadline'] : ['requestId']);
      if (method !== 'reopen') id(input.requestId);
      const response = await post('defi', method, structuredClone(input));
      assert.equal(response.status, 200, 'EVM_VAULT_APP_DEFI_SERVICE_RESPONSE');
      const value = response.body;
      if (method === 'reopen') {
        assert.equal(value.reopened, true); assert.equal(value.originalIdentitiesRetained, true);
        assert.equal(value.keeperRestart, false); assert.ok(Array.isArray(value.requestIds)); value.requestIds.forEach(id);
      } else {
        assert.equal(value.requestId, input.requestId, 'EVM_VAULT_APP_DEFI_IDENTITY_CHANGED');
        assert.equal(value.version, 1); assert.equal(value.profile, 'OWNED_PRIVATE_VAULT_EXIT_V1');
        assert.equal(value.underlyingPrivateSpendable, false); assert.equal(value.redemptionPublic, true);
        assert.equal(value.underlyingLocation, 'EXTERNAL_OWNER_ADDRESS');
      }
      return value;
    },
  });
}
