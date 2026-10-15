export const SHARED_ACCOUNT_PROFILE = 'PC26_SHARED_ASSET_ACCOUNTS_V1';
export const ACCOUNT_CLIENT_KEY = 'private-shared-accounts-client-v1';
export function accountBaseUnits(text, decimals) {
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text)) throw Error('Importe inválido');
  const [a, b = ''] = text.split('.');
  if (b.length > decimals) throw Error('Demasiados decimales');
  const n = BigInt(a) * 10n ** BigInt(decimals) + BigInt((b + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (n <= 0n || n >= (1n << 64n)) throw Error('Importe fuera del límite local');
  return n.toString();
}
export function accountDisplayUnits(value, decimals) {
  const n = BigInt(value), base = 10n ** BigInt(decimals), tail = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (n / base).toString() + (tail ? '.' + tail : '');
}
const isOwner = n => n === 0 || n === 1;
const isId = n => typeof n === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(n);
const commonActions = ['open', 'start', 'next', 'reset', 'close'];
const ownerActions = ['prepare', 'execute', 'reconcile', 'refresh', 'restart', 'enroll', 'cancel'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === keys.slice().sort().join();
function validPending(p) {
  return p === null || exact(p, ['requestId', 'action', 'ownerIndex', 'preparedRequestId']) && isId(p.requestId) &&
    (p.ownerIndex === null ? commonActions.includes(p.action) : isOwner(p.ownerIndex) && ownerActions.includes(p.action)) &&
    (['execute', 'reconcile', 'enroll'].includes(p.action) ? isId(p.preparedRequestId) : p.preparedRequestId === null);
}
/** Browser persistence stores opaque request identities only, never private terms or balances. */
export function createAccountRequestTracker(storage, uuid = () => crypto.randomUUID()) {
  let state = {version: 1, ownerIndex: 0, selected: [null, null], pending: null};
  const raw = storage.getItem(ACCOUNT_CLIENT_KEY);
  if (raw !== null) {
    try {
      const value = JSON.parse(raw);
      if (!exact(value, ['version', 'ownerIndex', 'selected', 'pending']) || value.version !== 1 || !isOwner(value.ownerIndex) ||
        !Array.isArray(value.selected) || value.selected.length !== 2 || !value.selected.every(x => x === null || isId(x)) || !validPending(value.pending)) throw Error();
      state = value;
    } catch { throw Error('PC26_BROWSER_STORAGE_INVALID'); }
  }
  const save = value => { storage.setItem(ACCOUNT_CLIENT_KEY, JSON.stringify(value)); state = value; };
  return Object.freeze({
    get pending() { return structuredClone(state.pending); },
    get ownerIndex() { return state.ownerIndex; },
    get selected() { return state.selected[state.ownerIndex]; },
    chooseOwner(index) { if (!isOwner(index)) throw Error('PC26_OWNER_INDEX'); save({...state, ownerIndex: index}); },
    select(value) {
      if (value !== null && !isId(value)) throw Error('PC26_REQUEST_SELECTION');
      const selected = [...state.selected]; selected[state.ownerIndex] = value; save({...state, selected});
    },
    begin(action, ownerIndex, preparedRequestId = null) {
      if (state.pending) throw Error('PC26_PENDING_REQUEST');
      const pending = {requestId: uuid(), action, ownerIndex, preparedRequestId};
      if (!validPending(pending)) throw Error('PC26_BROWSER_REQUEST');
      save({...state, pending}); return structuredClone(pending);
    },
    reconcile(rows) {
      const p = state.pending;
      if (!p) return false;
      const q = rows.find(q => q.id === p.requestId);
      if (!q) return false;
      if (q.action !== p.action || q.ownerIndex !== p.ownerIndex || (q.preparedRequestId ?? null) !== p.preparedRequestId) throw Error('PC26_REQUEST_RESPONSE');
      const selected = [...state.selected];
      if (p.action === 'prepare') selected[p.ownerIndex] = p.requestId;
      save({...state, selected, pending: null}); return true;
    },
    reject() { save({...state, pending: null}); },
  });
}
export function validateSharedAccountSnapshot(value) {
  if (value?.profile !== SHARED_ACCOUNT_PROFILE || !Array.isArray(value.requests) || typeof value.available !== 'boolean' ||
    typeof value.occupied !== 'boolean' || typeof value.busy !== 'boolean' || value.capabilities?.fullAcceptance !== false ||
    value.group && (value.group.privacyEvaluation !== 'NOT_EVALUATED' || value.group.transparentFallback !== false)) throw Error('PC26_API_CONTRACT');
  return value;
}
export function validateAccountPortfolio(value, summary, ownerIndex) {
  const accountId = summary?.group?.owners?.find(o => o.ownerIndex === ownerIndex)?.accountId;
  if (!accountId || value?.accountId !== accountId || !Array.isArray(value.registry) || !Array.isArray(value.assets) || !Array.isArray(value.nativeHoldings) || !Array.isArray(value.requests) || !Array.isArray(value.cohortEnrollments)) throw Error('PC26_PRIVATE_API_CONTRACT');
  return value;
}
export function accountControls(summary, view, ownerIndex, {connected = true, sending = false, pending = false, consent = false, requestId = null, noteId = null} = {}) {
  const group = summary?.group, cohort = group?.cohort, status = group?.owners?.find(o => o.ownerIndex === ownerIndex)?.status;
  const can = connected && !sending && !pending && !summary?.storageError;
  const live = can && summary?.available, idle = live && !summary?.busy && !cohort?.active;
  const request = view?.requests.find(r => r.requestId === requestId), waiting = ['WAITING_FOR_COHORT', 'READY_FOR_REVIEW'].includes(cohort?.state);
  const note = view?.assets.flatMap(a => a.positions).find(n => n.id === noteId), enrollments = view?.cohortEnrollments ?? [];
  const alreadyEnrolled = enrollments.some(r => r.requestId === requestId);
  const canCancelOwner = !view || !Array.isArray(view.cohortEnrollments) || enrollments.some(r => r.roundNumber === cohort?.roundNumber);
  return {
    open: Boolean(can && !summary?.occupied), refresh: Boolean(idle && status?.workerAvailable),
    restart: Boolean(can && group?.authorityAvailable && status?.authorityAvailable && !summary?.busy && !cohort?.active),
    close: Boolean(idle), topup: Boolean(idle && view), payment: Boolean(idle && waiting && view),
    exit: Boolean(idle && ['AVAILABLE', 'ISSUED'].includes(note?.state)),
    refund: Boolean(idle && request?.kind === 'payment' && ['SUBMITTING', 'UNKNOWN'].includes(request.state)),
    execute: Boolean(idle && request?.state === 'PREPARED' && request.kind !== 'payment'),
    reconcile: Boolean(idle && request && ['SUBMITTING', 'UNKNOWN'].includes(request.state)),
    enroll: Boolean(idle && waiting && consent && !alreadyEnrolled && request?.kind === 'payment' && request.state === 'PREPARED'),
    cancel: Boolean(live && canCancelOwner && cohort?.joined > 0 && !['SETTLED_IN_POOL', 'CANCELLED_NO_DISPATCH', 'EXPIRED_NO_DISPATCH', 'RESOLVED', 'QUARANTINED', 'CANCELLATION_PENDING'].includes(cohort.state)),
    start: Boolean(idle && cohort?.state === 'READY_FOR_REVIEW' && cohort.joined === 2),
    next: Boolean(idle && ['SETTLED_IN_POOL', 'CANCELLED_NO_DISPATCH', 'EXPIRED_NO_DISPATCH', 'RESOLVED'].includes(cohort?.state) && cohort.roundsUsed < cohort.maxRounds),
    reset: Boolean(idle && cohort?.state === 'QUARANTINED'),
  };
}
const labels = {
  OPENING: 'Abriendo los pools compartidos locales', READY: 'Cuentas disponibles', COHORT_RUNNING: 'Ronda en curso',
  COHORT_QUARANTINED: 'Ronda pendiente de recuperación original', COORDINATOR_UNAVAILABLE: 'Coordinador detenido; reábrelo para conciliar',
  UNAVAILABLE: 'Infraestructura no disponible; historial conservado', CLOSED: 'Cuentas cerradas',
  WAITING_FOR_COHORT: 'Esperando los dos consentimientos', READY_FOR_REVIEW: 'Dos consentimientos listos para iniciar',
  PREPARING_RESERVATIONS: 'Preparando ambas reservas', SOL_BATCH: 'Entregas Solana', BTC_BATCH: 'Entregas Bitcoin', SETTLING: 'Liquidando las notas originales',
  SETTLED_IN_POOL: 'Pagos liquidados; notas retenidas en los pools', CANCELLED_NO_DISPATCH: 'Cancelada antes de enviar',
  EXPIRED_NO_DISPATCH: 'Consentimiento vencido antes de enviar', CANCELLATION_PENDING: 'Cancelación en curso; devolución todavía no confirmada',
  QUARANTINED: 'Se requiere recuperar y conciliar las operaciones originales', RESOLVED: 'Obligaciones originales resueltas',
};
export function startSharedAccountClient() {
  const $ = id => document.getElementById(id);
  if (!$('account-panel')) return;
  const token = document.querySelector('meta[name="local-token"]')?.content;
  let summary, view, tracker, sending = false, reading = false, readAgain = false, connected = false, lastError = '', viewError = '', retryBody = null;
  const selections = [{asset: null, note: null}, {asset: null, note: null}];
  try { tracker = createAccountRequestTracker(localStorage); } catch { lastError = 'No se puede conservar la identidad de solicitudes en este navegador. Acciones desactivadas.'; }
  const ownerIndex = () => tracker?.ownerIndex ?? 0;
  const selection = () => selections[ownerIndex()];
  const rows = s => [...s.requests, ...(s.lastControl ? [s.lastControl] : [])];
  async function api(path, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(path, {method: body ? 'POST' : 'GET', headers: {'x-local-token': token, ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {}), cache:'no-store', signal: controller.signal});
      const value = await response.json();
      if (!response.ok) { const error = Error(value.error ?? 'No se pudo consultar la cuenta'); error.definitive = response.status >= 400 && response.status < 500 && !/UNCERTAIN|STORAGE|STORE_/.test(error.message); throw error; }
      return value;
    } finally { clearTimeout(timer); }
  }
  function choices(select, options, old) {
    select.replaceChildren();
    for (const item of options) { const option = document.createElement('option'); option.value = item.value; option.textContent = item.text; select.append(option); }
    if (options.some(item => item.value === old)) select.value = old;
    return select.value || null;
  }
  function render() {
    const group = summary?.group, cohort = group?.cohort, selected = selection();
    $('account-owner').value = String(ownerIndex()); $('account-owner').disabled = sending || !tracker;
    $('account-status').textContent = labels[group?.phase] ?? group?.phase ?? 'Cuentas cerradas';
    $('account-owner-status').textContent = `Titular simulado ${ownerIndex() + 1} · ${labels[group?.owners?.[ownerIndex()]?.status?.phase] ?? group?.owners?.[ownerIndex()]?.status?.phase ?? 'sin cuenta abierta'}`;
    $('account-cohort-status').textContent = cohort ? `Ronda ${cohort.roundNumber} · ${labels[cohort.state] ?? cohort.state} · ${cohort.joined}/2 consentimientos · reservas ${cohort.counts.reservations}/2 · SOL ${cohort.counts.solCompleted}/2 · BTC ${cohort.counts.btcCompleted}/2 · liquidaciones ${cohort.counts.settled}/2` : 'Los dos titulares comparten el mismo pool de cada activo durante todas las rondas';
    const latest = [...(summary?.requests ?? []), ...(summary?.lastControl ? [summary.lastControl] : [])].filter(r => r.ownerIndex === null || r.ownerIndex === ownerIndex()).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')).at(-1);
    $('account-error').textContent = lastError || viewError || summary?.storageError || (['FAILED', 'INTERRUPTED'].includes(latest?.state) ? latest.errorCode : '') || cohort?.errorCode || '';
    $('account-pending').textContent = tracker?.pending ? `Confirmación HTTP pendiente: ${tracker.pending.action}${tracker.pending.ownerIndex === null ? ' del grupo' : ' del titular simulado ' + (tracker.pending.ownerIndex + 1)}. Conserva la solicitud original; consultar no vuelve a enviarla.` : '';
    $('account-retry').hidden = !tracker?.pending; $('account-retry').disabled = sending || !connected || !retryBody || !tracker?.pending || tracker.pending.ownerIndex !== null && tracker.pending.ownerIndex !== ownerIndex();
    $('account-query').disabled = reading;
    const balances = $('account-balances'), pools = $('account-shared-pools'); balances.replaceChildren(); pools.replaceChildren();
    selected.asset = choices($('account-asset'), (view?.registry ?? []).map(a => ({value: a.assetId, text: a.symbol})), selected.asset);
    for (const p of view?.assets ?? []) {
      const asset = view.registry.find(a => a.assetId === p.assetId), line = document.createElement('p'), shared = document.createElement('p');
      line.textContent = `${asset.symbol}: ${accountDisplayUnits(p.available, asset.decimals)} en notas del titular ${ownerIndex() + 1} · ${p.observation === 'LIVE' ? 'conciliado' : 'observación no vigente'}`;
      shared.textContent = `Pool compartido ${asset.symbol} · custodia ${accountDisplayUnits(p.backing.held, asset.decimals)} · obligaciones totales ${accountDisplayUnits(p.backing.liabilities, asset.decimals)} ${asset.symbol} · ${p.observation}`;
      balances.append(line); pools.append(shared);
    }
    for (const h of view?.nativeHoldings ?? []) { const line = document.createElement('p'); line.textContent = `${h.symbol}: ${accountDisplayUnits(h.amountBaseUnits, h.decimals)} observado para este titular · fuera del saldo privado gastable · ${h.observation}`; balances.append(line); }
    const asset = view?.assets.find(a => a.assetId === selected.asset), meta = view?.registry.find(a => a.assetId === selected.asset);
    selected.note = choices($('account-note'), (asset?.positions ?? []).filter(n => ['AVAILABLE', 'ISSUED'].includes(n.state)).map(n => ({value: n.id, text: `${n.type} · ${accountDisplayUnits(n.amountBaseUnits, meta.decimals)} ${meta.symbol}`})), selected.note);
    const requestId = choices($('account-request'), (view?.requests ?? []).map(r => ({value: r.requestId, text: `${r.kind} · ${view.registry.find(a => a.assetId === r.assetId)?.symbol} · ${r.state}`})).reverse(), tracker?.selected);
    if (tracker && view && tracker.selected !== requestId) { try { tracker.select(requestId); } catch { lastError = 'No se puede conservar la selección de la solicitud'; tracker = null; } }
    const request = view?.requests.find(r => r.requestId === requestId), enrollment = view?.cohortEnrollments?.find(r => r.requestId === requestId);
    $('account-request-detail').textContent = request ? `${request.kind} · ${request.state} · ${request.errorCode ?? ''}\n${Object.entries(request.terms).map(([k, v]) => `${k}: ${v}`).join('\n')}\n${request.kind === 'payment' ? 'Este pago requiere consentimiento e inicio de la pareja; no admite ejecución individual.' : 'La ejecución usa exclusivamente estos valores guardados y el destinatario original.'}` : 'Selecciona una preparación del titular actual para revisar los valores guardados';
    if (enrollment) $('account-request-detail').textContent += `\nInscripción original: ronda ${enrollment.roundNumber} · ${labels[enrollment.state] ?? enrollment.state}. Para otra ronda, prepara un pago nuevo desde las notas retenidas.`;
    const controls = accountControls(summary, view, ownerIndex(), {connected: connected && Boolean(tracker), sending, pending: Boolean(tracker?.pending), consent: $('account-consent').checked, requestId, noteId: selected.note});
    for (const [action, enabled] of Object.entries(controls)) $(`account-${action}`).disabled = !enabled;
  }
  async function refresh() {
    if (reading) { readAgain = true; return; }
    reading = true;
    try {
      summary = validateSharedAccountSnapshot(await api('/api/private-accounts')); connected = true;
      if (tracker?.reconcile(rows(summary))) retryBody = null;
      const index = ownerIndex();
      if (summary.available) {
        try { const next = validateAccountPortfolio(await api(`/api/private-accounts/owners/${index}/private`), summary, index); if (index === ownerIndex()) { view = next; viewError = ''; } else readAgain = true; }
        catch (e) { if (index === ownerIndex()) { view = null; viewError = `Vista del titular no disponible: ${e.message}. Reabrir su coordinador conserva la custodia original.`; } }
      } else { view = null; viewError = ''; }
    } catch (e) { connected = false; view = null; lastError = `No se pudo verificar el estado: ${e.message}`; }
    finally { reading = false; render(); if (readAgain) { readAgain = false; void refresh(); } }
  }
  async function act(action, extra = {}, index = ownerIndex(), retry = false) {
    if (sending || !tracker) return;
    sending = true; lastError = '';
    try {
      const pending = retry ? tracker.pending : tracker.begin(action, index, extra.preparedRequestId ?? null);
      if (!pending) throw Error('PC26_NO_PENDING_REQUEST');
      if (retry && (!retryBody || retryBody.requestId !== pending.requestId)) throw Error('PC26_ORIGINAL_BODY_UNAVAILABLE');
      const body = retry ? retryBody : {action, requestId: pending.requestId, ...extra}; retryBody = body; render();
      const result = await api(pending.ownerIndex === null ? '/api/private-accounts/action' : `/api/private-accounts/owners/${pending.ownerIndex}/action`, body);
      summary = validateSharedAccountSnapshot(result.snapshot);
      if (!tracker.reconcile(rows(summary)) && tracker.pending) throw Error('PC26_HTTP_RESULT_UNKNOWN');
      retryBody = null;
      if (action === 'enroll' || ['next', 'reset', 'close'].includes(action)) $('account-consent').checked = false;
    } catch (e) {
      lastError = `${e.message}${e.definitive ? '' : '. Conserva la solicitud original y consulta su resultado antes de reintentar.'}`;
      if (e.definitive) { tracker.reject(); retryBody = null; }
    } finally { sending = false; await refresh(); render(); }
  }
  function prepare(kind) {
    try {
      const meta = view.registry.find(a => a.assetId === selection().asset), amount = accountBaseUnits($('account-amount').value, meta.decimals);
      const terms = kind === 'topup' ? {amount} : {budget: amount, solCompensation: (BigInt(amount) / 2n).toString(), amountSol: '3000000', numerator: '1', denominator: '30'};
      void act('prepare', {assetId: meta.assetId, kind, terms});
    } catch (e) { lastError = e.message; render(); }
  }
  for (const action of commonActions) $(`account-${action}`).onclick = () => act(action, action === 'open' ? {profile: SHARED_ACCOUNT_PROFILE} : {}, null);
  for (const action of ['refresh', 'restart', 'cancel']) $(`account-${action}`).onclick = () => act(action);
  $('account-query').onclick = refresh; $('account-retry').onclick = () => { const p = tracker.pending; if (p && (p.ownerIndex === null || p.ownerIndex === ownerIndex())) void act(p.action, {}, p.ownerIndex, true); };
  $('account-owner').onchange = () => { try { tracker.chooseOwner(Number($('account-owner').value)); view = null; viewError = ''; $('account-consent').checked = false; render(); void refresh(); } catch (e) { lastError = e.message; render(); } };
  $('account-asset').onchange = () => { selection().asset = $('account-asset').value; selection().note = null; $('account-consent').checked = false; $('account-amount').value = view.registry.find(a => a.assetId === selection().asset).kind === 'NATIVE' ? '0.0015' : '1.5'; render(); };
  $('account-note').onchange = () => { selection().note = $('account-note').value; render(); };
  $('account-request').onchange = () => { try { tracker.select($('account-request').value || null); $('account-consent').checked = false; } catch (e) { lastError = e.message; } render(); };
  $('account-consent').onchange = render;
  $('account-topup').onclick = () => prepare('topup'); $('account-payment').onclick = () => prepare('payment');
  $('account-exit').onclick = () => {
    const n = view.assets.find(a => a.assetId === selection().asset)?.positions.find(n => n.id === selection().note);
    if (!n) return;
    const terms = n.type === 'OWNER_BALANCE' ? {noteId: n.id} : {operationId: n.operationId, role: {SOL_PAYOUT: 'sol', BTC_PAYOUT: 'btc', OWNER_REFUND: 'refund'}[n.type]};
    void act('prepare', {assetId: selection().asset, kind: 'exit', terms});
  };
  $('account-refund').onclick = () => { const r = view.requests.find(r => r.requestId === tracker.selected); if (r) void act('prepare', {assetId: r.assetId, kind: 'refund', terms: {operationId: r.operationId}}); };
  for (const action of ['execute', 'reconcile']) $(`account-${action}`).onclick = () => act(action, {preparedRequestId: tracker.selected});
  $('account-enroll').onclick = () => { if ($('account-consent').checked) void act('enroll', {preparedRequestId: tracker.selected, consentToWait: true, expiresAt: Date.now() + 15 * 60 * 1000}); };
  render(); void refresh();
  let interval;
  const poll = () => { clearInterval(interval); interval = setInterval(() => { if (!document.hidden && !sending) void refresh(); }, 2500); };
  poll(); window.addEventListener('pagehide', () => clearInterval(interval)); window.addEventListener('pageshow', () => { poll(); void refresh(); });
}
if (typeof document !== 'undefined') startSharedAccountClient();
