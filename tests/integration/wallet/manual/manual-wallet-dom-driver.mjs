/** Scripted DOM acceptance over the production page. No standing consent.
 * A run establishes evidence only after its fixed source closure,
 * original journals, genuine proofs, lifecycle and scoped policy are reviewed. */
import assert from 'node:assert/strict';
import { ALL_ACTIONS, DEFI_PROFILE, accountActionContext, accountReviewDetails, actionReview, validateWalletState }
  from '../../../../apps/wallet/src/client/state/view-model.mjs';

const actionName = (section, method) => section + method[0].toUpperCase() + method.slice(1);
const idle = snapshot => snapshot?.phase === 'READY' && snapshot.available === true
  && snapshot.storageAvailable === true && snapshot.busy === false && snapshot.queued === 0
  && snapshot.observation === 'CURRENT';
const fieldLabels = { requestId: 'ID de solicitud', kind: 'Operación original',
  ownerOperationRef: 'Referencia preparada por el titular · ownerOperationRef',
  assetId: 'Activo original · identidad completa', minimumOutput: 'Mínimo de subyacente · unidades atómicas',
  deadline: 'Deadline · timestamp de la cadena original' };
const fail = code => { throw Object.assign(new Error(code), { code }); };

export async function createManualWalletDomDriver(app, { page, deadlineMs }) {
  assert.equal(app.actionAccess, undefined, 'BROWSER_BROAD_ACCESS_FORBIDDEN');
  assert.match(app.origin, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);
  assert.equal(app.ownerAccess.origin, app.origin);
  assert.ok(Number.isSafeInteger(deadlineMs) && deadlineMs > Date.now());
  const host = app.createManualActionHandoff();
  assert.equal(host.descriptor.origin, app.origin);
  const evidence = [], seenReviewIds = new Set(), failures = [];
  let closed = false;
  function remaining() {
    const ms = deadlineMs - Date.now();
    if (ms <= 0) fail('BROWSER_ORIGINAL_DEADLINE_EXHAUSTED');
    return Math.min(ms, 2147483647);
  }
  const onPageError = error => failures.push(error.name);
  const onResponse = async response => {
    if (closed) return;
    const url = new URL(response.url());
    if (url.origin !== app.origin || url.pathname !== '/api/wallet/state') return;
    try {
      assert.equal(response.request().method(), 'GET'); assert.equal(response.status(), 200);
      validateWalletState(await response.json());
    } catch (error) { failures.push(error.name); }
  };
  page.on('pageerror', onPageError); page.on('response', onResponse);
  const timeout = () => Math.min(remaining(), 30_000);
  async function boundedProtocol(operation) {
    let timer;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('BROWSER_PROTOCOL_DEADLINE')), timeout());
      })]);
    } finally { clearTimeout(timer); }
  }
  const api = (name, input) => boundedProtocol(page.evaluate(async ({ name, input }) => {
    // Fixed HTTP asset; the browser collector pins the server's original app,
    // HTML, CSS and complete browser-module closure separately from Node ESM.
    const modulePath = '/app.mjs';
    const module = await import(modulePath);
    return input === undefined ? module[name]() : module[name](input);
  }, { name, input }));
  const requireHealthy = () => assert.deepEqual(failures, [], 'BROWSER_PAGE_OR_STATE_FAILED');
  // The production module starts one read on load. DOMContentLoaded and a
  // visible button do not mean its original catalogue read has finished.
  // Retain that response before navigating, then wait for its final render
  // before handing control back to local owner preparation.
  const initialRead = page.waitForResponse(response => response.url() === app.origin + '/api/wallet/state'
    && response.request().method() === 'GET', { timeout: timeout() });
  // Navigation can fail before this retained response settles; close will
  // then reject it. Keep that rejection handled without replacing its value.
  initialRead.catch(() => {});
  await page.goto(app.origin, { waitUntil: 'domcontentloaded', timeout: timeout() });
  await page.locator('#refresh').waitFor({ state: 'visible', timeout: timeout() });
  const initialResponse = await initialRead;
  assert.equal(initialResponse.status(), 200);
  validateWalletState(await initialResponse.json());
  await page.waitForFunction(() => document.getElementById('refresh')?.disabled === false
    && document.getElementById('updated-at')?.textContent.startsWith('Última consulta: '),
    null, { timeout: timeout() });
  requireHealthy();
  async function state() {
    remaining(); requireHealthy();
    await page.waitForFunction(() => document.getElementById('refresh')?.disabled === false,
      null, { timeout: timeout() });
    const read = page.waitForResponse(response => response.url() === app.origin + '/api/wallet/state'
      && response.request().method() === 'GET', { timeout: timeout() });
    await page.locator('#refresh').click({ timeout: timeout() });
    const response = await read;
    assert.equal(response.status(), 200);
    const observedState = validateWalletState(await response.json());
    await page.waitForFunction(() => document.getElementById('refresh')?.disabled === false,
      null, { timeout: timeout() });
    requireHealthy(); assert.equal(observedState.capabilities.graphExecution, false);
    assert.equal(new URL(page.url()).origin, app.origin);
    assert.equal(await page.locator('meta[name="wallet-owner-token"],meta[name="wallet-action-token"]').count(), 0);
    assert.equal((await page.content()).includes(app.ownerAccess.token), false);
    return structuredClone(observedState);
  }
  async function wire(action, body, access) {
    const response = await fetch(app.origin + ALL_ACTIONS[action].route, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout()),
      headers: { Origin: app.origin, 'Content-Type': 'application/json', 'x-wallet-action-token': access.token },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  async function rejectedReplay(action, body, access) {
    const value = await wire(action, body, access);
    assert.equal(value.status, 403); assert.equal(value.body.error, 'WALLET_ACTION_ACCESS_REQUIRED');
    evidence.push({ action, requestId: body.requestId ?? null, check: 'USED_EXACT_GRANT_REJECTED' });
  }
  async function readVisibleReview() {
    return page.locator('#review-values').evaluate(element => {
      const children = [...element.children];
      if (children.length % 2 !== 0) throw new Error('UNPAIRED_REVIEW_TERMS');
      const pairs = [];
      for (let i = 0; i < children.length; i += 2) {
        if (children[i].tagName !== 'DT' || children[i+1].tagName !== 'DD') throw new Error('INVALID_REVIEW_TERMS');
        pairs.push([children[i].textContent, children[i+1].textContent]);
      }
      return pairs;
    });
  }
  async function reviewed(action, input) {
    assert.ok(Object.hasOwn(ALL_ACTIONS, action)); const body = structuredClone(input);
    const current = await state(), baseline = current.account?.snapshot;
    assert.ok(idle(baseline), 'BROWSER_ORIGINAL_JOURNAL_NOT_READY');
    const stateEnvelope = { data: current, stale: false, portfolioStale: current.errors.portfolio !== null,
      accountStale: Boolean(current.errors.account), accountSnapshotFresh: true,
      defiStale: Boolean(current.errors.defi), reading: false, sending: false };
    const context = accountActionContext(stateEnvelope, action, body);
    const expected = actionReview(action, body, null, context);
    const sequence = Math.max(0, ...baseline.admissions.map(row => row.sequence)) + 1;
    await page.locator('button[data-action="' + action + '"]').click({ timeout: timeout() });
    const form = page.locator('#form-' + action);
    await form.waitFor({ state: 'visible', timeout: timeout() });
    for (const [key, value] of Object.entries(body)) {
      const field = form.locator('[name="' + key + '"]');
      if (key === 'kind' || key === 'assetId') await field.selectOption(value, { timeout: timeout() });
      else await field.fill(value, { timeout: timeout() });
    }
    assert.equal(await form.locator('button[data-review]').isEnabled(), true,
      'BROWSER_FRESH_ORIGINAL_REVIEW_NOT_ENABLED_BY_PRODUCTION_UI');
    await form.locator('button[data-review]').click({ timeout: timeout() });
    await page.locator('#review-dialog').waitFor({ state: 'visible', timeout: timeout() });
    assert.equal(await page.locator('#review-title').innerText(), expected.title);
    assert.deepEqual(await page.locator('#review-notes p').allTextContents(), expected.notes);
    assert.equal(await page.locator('#review-consent').isChecked(), false);
    assert.equal(await page.locator('#confirm-review').isDisabled(), true);
    const manual = await api('getManualActionReview'), exact = await api('getExactActionReview');
    assert.equal(Boolean(manual) !== Boolean(exact), true, 'BROWSER_EXACTLY_ONE_ORIGINAL_CHANNEL_REQUIRED');
    const request = manual ?? exact;
    assert.equal(request.action, action); assert.deepEqual(request.body, body);
    assert.equal(request.origin, app.origin); assert.equal(request.listenerId, host.descriptor.listenerId);
    assert.match(request.reviewId, /^[0-9a-f]{64}$/); assert.equal(seenReviewIds.has(request.reviewId), false);
    seenReviewIds.add(request.reviewId);
    if (manual) {
      assert.ok(context.graph || context.nativeNote);
      if (context.graph) assert.deepEqual(request.graph, context.graph);
      else assert.deepEqual(request.note, context.nativeNote);
    } else {
      assert.equal(context?.graph ?? context?.nativeNote ?? null, null);
      const originalContext = context ?? (action.startsWith('defi')
        ? { profile: DEFI_PROFILE,
          operation: current.defi?.snapshot?.operations?.find(row => row.requestId === body.requestId) ?? null } : null);
      assert.deepEqual(request.context, originalContext, 'BROWSER_EXACT_CONTEXT_DIFFERS_FROM_CURRENT_ORIGINAL');
    }
    const terms = [
      ...(action.startsWith('account') ? accountReviewDetails(context) : []),
      ...Object.entries(body).map(([key, value]) => [fieldLabels[key] ?? key, value]),
      ...(manual ? [['Generación original', request.binding.generationId],
        ['Cuenta original', request.binding.accountIdentitySHA256], ['Listener original', request.listenerId],
        ['Bloque revisado', request.head ? `${request.head.blockNumber} · ${request.head.blockHash} · timestamp ${request.head.timestamp}`
          : 'Sin observación actual; solo conciliación o recuperación original']]
        : [['Servicio original', request.origin], ['Listener original', request.listenerId]]),
    ];
    assert.deepEqual(await readVisibleReview(), terms, 'BROWSER_VISIBLE_TERMS_DIFFER_FROM_ORIGINAL_REVIEW');
    // This fixed acceptance explicitly compares every rendered term before
    // obtaining authority. Production has no callback or automatic consent.
    const grant = manual ? await host.authorizeReview(request)
      : { review: request, access: app.issueActionCapability({ action, body }) };
    const access = grant.access;
    assert.equal(access.origin, app.origin);
    assert.equal(await api(manual ? 'acceptManualActionGrant' : 'acceptExactActionAccess', grant), true);
    assert.equal(await page.locator('#review-consent').isChecked(), false);
    assert.equal(await page.locator('#confirm-review').isDisabled(), true);
    assert.equal((await page.content()).includes(access.token), false);
    evidence.push({ action, requestId: body.requestId ?? null, check: manual
      ? 'TOKENLESS_HANDOFF_COMMITMENT_VERIFIED' : 'EXACT_BROWSER_CAPABILITY_IMPORTED_AFTER_VISIBLE_REVIEW',
      reviewId: request.reviewId, listenerId: request.listenerId, explicitScriptedAuthorization: true,
      visibleTermsVerified: true, browserConsentInitiallyUnchecked: true, sent: false,
      ...(manual ? { generationId: request.binding.generationId,
        accountIdentitySHA256: request.binding.accountIdentitySHA256, headAvailable: request.head !== null } : {}) });
    let used = false;
    async function confirm({ loseReply = false } = {}) {
      assert.equal(used, false); used = true; remaining();
      let lost = false, posts = 0;
      const endpoint = app.origin + ALL_ACTIONS[action].route;
      const fault = async route => {
        if (route.request().method() !== 'POST') return route.fallback();
        posts++;
        assert.equal(posts, 1, 'BROWSER_LOST_REPLY_AUTO_RESUBMIT');
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: timeout() });
        assert.equal(response.status(), 200, 'BROWSER_LOST_REPLY_ACTUAL_ADMISSION_REQUIRED');
        lost = true; await route.abort('failed');
      };
      if (loseReply) await page.route(endpoint, fault);
      const reply = loseReply ? null : page.waitForResponse(response => response.url() === endpoint
        && response.request().method() === 'POST', { timeout: timeout() });
      try {
        await page.locator('#review-consent').check({ timeout: timeout() });
        assert.equal(await page.locator('#confirm-review').isEnabled(), true);
        await page.locator('#confirm-review').click({ timeout: timeout() });
        if (reply) {
          const response = await reply; assert.equal(response.status(), 200);
          const value = await response.json();
          await page.locator('#review-dialog').waitFor({ state: 'hidden', timeout: timeout() });
          const outcome = page.locator(action.startsWith('account') ? '#account-outcome' : '#defi-outcome');
          await outcome.waitFor({ state: 'visible', timeout: timeout() });
          assert.equal(await outcome.evaluate(element => element.classList.contains('unknown')), false,
            'BROWSER_200_DID_NOT_ESTABLISH_THE_ORIGINAL_UI_OUTCOME');
          assert.match(await outcome.locator('strong').innerText(), action.startsWith('account')
            ? /^En cola local volátil/ : /^Resultado del servicio/);
          await rejectedReplay(action, body, access);
          if (manual) evidence.push({ action, requestId: body.requestId, check: 'EXPLICIT_HANDOFF_CONFIRMATION',
            reviewId: request.reviewId, listenerId: request.listenerId, browserCheckboxChecked: true });
          return value;
        }
        await page.waitForFunction(() => document.getElementById('account-outcome')?.classList.contains('unknown'),
          null, { timeout: timeout() });
        assert.equal(lost, true); assert.equal(posts, 1);
        assert.match(await page.locator('#account-outcome').innerText(), /desconocido/i);
        return { discardedActualAdmissionReply: true, browserReportedUnknown: true, executeHttpRequests: posts,
          noAutomaticResubmit: true, actualNetworkOutage: false };
      } finally { if (loseReply) await boundedProtocol(page.unroute(endpoint, fault)); }
    }
    return { review: { action, ...expected, ...(manual ? { manualHandoff: request } : { exactActionReview: request }) },
      body, sequence, access, confirm,
      async cancel() { assert.equal(used, false); used = true;
        await page.locator('#cancel-review').click({ timeout: timeout() });
        if (manual) host.cancelReview(); },
    };
  }
  async function pollAccount(method, body, sequence, expectedKind) {
    while (true) {
      const snapshot = (await state()).account?.snapshot;
      assert.ok(snapshot && Array.isArray(snapshot.admissions) && Array.isArray(snapshot.requests));
      const frames = snapshot.admissions.filter(row => row.sequence === sequence);
      assert.equal(frames.length, 1); const frame = frames[0];
      assert.equal(frame.action, method); assert.equal(frame.requestId, body.requestId);
      if (frame.state === 'FAILED') fail(frame.errorCode ?? 'BROWSER_ORIGINAL_ADMISSION_FAILED');
      assert.equal(snapshot.available, true); assert.equal(snapshot.storageAvailable, true);
      const rows = snapshot.requests.filter(row => row.requestId === body.requestId); assert.ok(rows.length <= 1);
      const row = rows[0];
      if (row) {
        assert.equal(row.kind, expectedKind);
        if (['UNKNOWN', 'RECOVERING'].includes(row.state)
          && !(['reconcile', 'recover'].includes(method) && (!idle(snapshot) || ['ADMITTED', 'RUNNING'].includes(frame.state))))
          fail('BROWSER_ORIGINAL_RECONCILIATION_REQUIRED');
      }
      if (frame.state === 'SUCCEEDED' && idle(snapshot)) {
        assert.ok(row); assert.equal(row.state, method === 'prepare' ? 'PREPARED' : 'CONFIRMED');
        const record = { action: method, requestId: body.requestId, admissionSequence: sequence,
          via: 'BROWSER_DOM_EXACT_ONLY_HTTP', httpAdmission: 'VOLATILE_UI_QUEUE_ONLY', originalJournalState: row.state };
        evidence.push(record); return { snapshot, ...record };
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(500, remaining())));
    }
  }
  async function reviewAccount(method, body) {
    assert.ok(['prepare', 'execute', 'reconcile', 'recover'].includes(method));
    const prepared = await reviewed(actionName('account', method), body);
    const finish = async afterAdmission => {
      await prepared.confirm(); if (afterAdmission) await afterAdmission();
      return pollAccount(method, prepared.body, prepared.sequence,
        method === 'prepare' ? body.kind : prepared.review.accountContext.kind);
    };
    return Object.freeze({ review: prepared.review, cancel: prepared.cancel, confirm: () => finish(),
      async confirmAfterAdmission(afterAdmission) {
        assert.equal(method, 'execute'); assert.equal(prepared.review.accountContext.kind, 'GRAPH');
        assert.equal(typeof afterAdmission, 'function'); return finish(afterAdmission);
      } });
  }
  async function requireDuplicateReviewBlocked(action, requestId) {
    await page.locator('button[data-action="' + action + '"]').click({ timeout: timeout() });
    await page.locator('#' + action + '-requestId').fill(requestId, { timeout: timeout() });
    const review = page.locator('#form-' + action + ' button[data-review]');
    if (await review.isEnabled()) {
      await review.click({ timeout: timeout() });
      await page.locator('#error').waitFor({ state: 'visible', timeout: timeout() });
      assert.ok((await page.locator('#error').innerText()).length > 0);
    }
    assert.equal(await page.locator('#review-dialog').isVisible(), false,
      'BROWSER_DUPLICATE_OPENED_AN_AUTHORISABLE_REVIEW');
    assert.equal(await api('getManualActionReview'), null);
    assert.equal(await api('getExactActionReview'), null);
    evidence.push({ action, requestId, check: 'ORIGINAL_DUPLICATE_REVIEW_BLOCKED' });
  }
  return Object.freeze({ state, reviewAccount, evidence: () => structuredClone(evidence),
    close() { closed = true; page.off('pageerror', onPageError); page.off('response', onResponse); },
    async account(method, body) { return (await reviewAccount(method, body)).confirm(); },
    async executeAccountWithLostReply(body) {
      const prepared = await reviewed('accountExecute', body); assert.equal(prepared.review.accountContext.kind, 'TOP_UP');
      const loss = await prepared.confirm({ loseReply: true });
      const result = await pollAccount('execute', body, prepared.sequence, 'TOP_UP');
      await rejectedReplay('accountExecute', body, prepared.access);
      Object.assign(loss, { requestId: body.requestId, originalJournalReconciled: true });
      evidence.push({ action: 'accountExecute', check: 'ADMITTED_REPLY_LOST_NO_RESUBMIT', ...loss });
      return { ...result, loss };
    },
    async unspentGraphGrantForListenerReplacement(requestId) {
      const prepared = await reviewed('accountReconcile', { requestId }); assert.ok(prepared.review.manualHandoff);
      evidence.push({ action: 'accountReconcile', requestId, check: 'UNSPENT_HANDOFF_LISTENER_GRANT',
        reviewId: prepared.review.manualHandoff.reviewId, listenerId: host.descriptor.listenerId });
      return prepared.access;
    },
    async rejectForeignListenerGrant(action, body, access) {
      await rejectedReplay(action, body, access);
      evidence.push({ action, requestId: body.requestId, check: 'OLD_LISTENER_GRANT_REJECTED' });
    },
    async duplicateAccountExecute(requestId) {
      const body = { requestId }, current = await state();
      assert.equal(current.account.snapshot.requests.find(row => row.requestId === requestId)?.state, 'CONFIRMED');
      await requireDuplicateReviewBlocked('accountExecute', requestId);
      const access = app.issueActionCapability({ action: 'accountExecute', body });
      const value = await wire('accountExecute', body, access); assert.equal(value.status, 409);
      assert.equal(value.body.error, 'WALLET_ACCOUNT_STATE_CONFLICT'); await rejectedReplay('accountExecute', body, access);
      evidence.push({ action: 'accountExecute', requestId, check: 'CONFIRMED_DUPLICATE_REJECTED' });
      return { snapshot: (await state()).account.snapshot };
    },
    async defi(method, body) {
      assert.ok(['prepare', 'execute', 'reconcile', 'reopen'].includes(method));
      const value = await (await reviewed(actionName('defi', method), body)).confirm();
      const current = await state();
      if (method === 'reopen') {
        assert.equal(value.reopened, true); assert.equal(value.originalIdentitiesRetained, true);
        assert.equal(value.keeperRestart, false); assert.ok(Array.isArray(value.requestIds));
        const projection = current.defi.snapshot.generationProjection;
        assert.ok(projection.generations.every(row => row.status === 'AVAILABLE' && Array.isArray(row.requestIds)));
        return { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, generationProjection: projection };
      }
      const originals = current.defi.snapshot.operations.filter(row => row.requestId === body.requestId);
      assert.equal(originals.length, 1); assert.equal(originals[0].phase, value.phase); return originals[0];
    },
    async duplicateDefiExecute(requestId) {
      const current = await state();
      assert.equal(current.defi.snapshot.operations.find(row => row.requestId === requestId)?.phase, 'REDEEMED');
      await requireDuplicateReviewBlocked('defiExecute', requestId);
      const body = { requestId }, access = app.issueActionCapability({ action: 'defiExecute', body });
      const value = await wire('defiExecute', body, access); assert.equal(value.status, 200);
      assert.equal(value.body.phase, 'REDEEMED'); assert.equal(value.body.requestId, requestId);
      await rejectedReplay('defiExecute', body, access);
      evidence.push({ action: 'defiExecute', requestId, check: 'REDEEMED_DUPLICATE_SERVICE_IDEMPOTENT' }); return value.body;
    },
  });
}
