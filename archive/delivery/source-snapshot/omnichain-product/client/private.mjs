import { PRIVATE_PROFILE, PRIVATE_OWNER_REFUND_DEFAULT, PRIVATE_ENGINE_UNAVAILABLE, privateStorageErrorLabel, privatePhaseLabel, privateOwnerLabels, privatePayoutLabel, privateOutcome, privateCleanupLabel, privateRecoveryLabel, privateOwnerRefundLabel, privateControls, privatePublicDetails, privateProgressSteps } from './private-outcome.mjs';

export const PRIVATE_CLIENT_STORAGE_KEY = 'private-wallet-client-v1';
const operationId = value => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const requestId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const publicRequestId = value => typeof value === 'string' && /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value);
const recoveryStates = new Set(['NONE', 'AVAILABLE', 'RUNNING', 'COMPLETED', 'UNAVAILABLE']);
const ownerRefundStates = new Set(['NONE', 'WAITING', 'ELIGIBLE', 'NOTE_ISSUED', 'WITHDRAWN', 'UNKNOWN', 'UNAVAILABLE']);
const ownerRefundAction = action => ['refund', 'recoverRefund'].includes(action);
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function validOwnerRefund(value) {
  return value === undefined || value && !Array.isArray(value) && ownerRefundStates.has(value.state) &&
    (value.amountWei === null || value.amountWei === PRIVATE_PROFILE.fundingWei) &&
    (value.claimEpoch === null || typeof value.claimEpoch === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value.claimEpoch) && BigInt(value.claimEpoch) < 2n ** 64n) &&
    (value.eligibleAt === null || isoDate(value.eligibleAt));
}
const publicCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(value);
const clone = value => JSON.parse(JSON.stringify(value));
function assertPending(value) {
  if (value === null) return;
  const fields = value?.action === 'prepare' ? ['action', 'requestId', 'profile'] : ['action', 'requestId', 'operationId'];
  if (!value || Array.isArray(value) || Object.keys(value).sort().join() !== fields.sort().join() || !requestId(value.requestId) ||
    !(value.action === 'prepare' && value.profile === PRIVATE_PROFILE.id || ['start', 'recover', 'refund', 'recoverRefund'].includes(value.action) && operationId(value.operationId))) throw new Error('PRIVATE_CLIENT_STORAGE_INVALID');
}
export function validatePrivateSnapshot(value) {
  if (value?.version !== 1 || !Object.entries(PRIVATE_PROFILE).every(([key, expected]) => value.profile?.[key] === expected) ||
    value.capabilities?.browserReconnect !== true || value.capabilities?.executionRestart !== false || value.capabilities?.payoutWorkerRestart !== true || value.capabilities?.recoveryWithdrawal !== true || value.capabilities?.fullAcceptance !== false ||
    !Array.isArray(value.operations) || value.operations.length > 1000 || typeof value.busy !== 'boolean' ||
    !(value.activeOperationId === null || operationId(value.activeOperationId)) || !(value.storageError === null || typeof value.storageError === 'string')) throw new Error('PRIVATE_CLIENT_CONTRACT');
  const ids = new Set();
  for (const op of value.operations) {
    if (!operationId(op?.id) || ids.has(op.id) || op.profile !== PRIVATE_PROFILE.id || !Number.isSafeInteger(op.revision) || op.revision < 0 ||
      !['phase', 'engineState', 'ownerState', 'settlementState', 'observation', 'cleanupState'].every(key => publicCode(op[key])) ||
      !['evm', 'sol', 'btc'].every(role => publicCode(op.exposure?.[role])) ||
      !['sol', 'btc'].every(role => publicCode(op.payouts?.[role]?.state) && (op.payouts[role].amountWei === null || typeof op.payouts[role].amountWei === 'string' && /^(0|[1-9][0-9]{0,39})$/.test(op.payouts[role].amountWei))) ||
      !(op.recoveryState === undefined || recoveryStates.has(op.recoveryState)) ||
      !(op.lastRecoveryRequestId === undefined || op.lastRecoveryRequestId === null || publicRequestId(op.lastRecoveryRequestId)) ||
      !validOwnerRefund(op.ownerRefund) || !(op.lastOwnerRefundRequestId === undefined || op.lastOwnerRefundRequestId === null || publicRequestId(op.lastOwnerRefundRequestId)) ||
      !Array.isArray(op.allowedActions) || !op.allowedActions.every(action => typeof action === 'string')) throw new Error('PRIVATE_CLIENT_CONTRACT');
    ids.add(op.id);
  }
  if (value.activeOperationId && !ids.has(value.activeOperationId)) throw new Error('PRIVATE_CLIENT_CONTRACT');
  return { ...value, operations: value.operations.map(op => ({ ...op, recoveryState: op.recoveryState ?? 'NONE', lastRecoveryRequestId: op.lastRecoveryRequestId ?? null, ownerRefund: { ...(op.ownerRefund ?? PRIVATE_OWNER_REFUND_DEFAULT) }, lastOwnerRefundRequestId: op.lastOwnerRefundRequestId ?? null })) };
}

// Only request identity and selection are browser-persistent, never keys or
// operation payloads. A failed write prevents the caller from issuing a POST.
export function createPrivateRequestTracker(storage, uuid = () => crypto.randomUUID()) {
  let saved = { version: 1, pending: null, selectedId: null };
  const raw = storage.getItem(PRIVATE_CLIENT_STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Object.keys(parsed).sort().join() !== 'pending,selectedId,version' || parsed.version !== 1 || !(parsed.selectedId === null || operationId(parsed.selectedId))) throw new Error();
      assertPending(parsed.pending); saved = parsed;
    } catch { throw new Error('PRIVATE_CLIENT_STORAGE_INVALID'); }
  }
  const persist = next => {
    if (JSON.stringify(next) !== JSON.stringify(saved)) { storage.setItem(PRIVATE_CLIENT_STORAGE_KEY, JSON.stringify(next)); saved = next; }
  };
  return Object.freeze({
    get pending() { return clone(saved.pending); },
    get selectedId() { return saved.selectedId; },
    select(id) { if (!(id === null || operationId(id))) throw new Error('PRIVATE_CLIENT_OPERATION_ID'); persist({ ...saved, selectedId: id }); },
    begin(action, id) {
      if (saved.pending) {
        if (saved.pending.action !== action || action !== 'prepare' && saved.pending.operationId !== id) throw new Error('PRIVATE_CLIENT_REQUEST_PENDING');
        return clone(saved.pending);
      }
      const pending = action === 'prepare' ? { action, requestId: uuid(), profile: PRIVATE_PROFILE.id } : { action, requestId: uuid(), operationId: id };
      assertPending(pending); persist({ ...saved, pending }); return clone(pending);
    },
    accept(operation, acceptedRequest = null) {
      const pending = saved.pending;
      // Only the awaited successful response to this exact saved body can stand
      // in for its acceptance marker. Polling/history must match the marker.
      const directAcceptance = acceptedRequest && pending && Object.keys(acceptedRequest).length === Object.keys(pending).length && Object.entries(pending).every(([key, value]) => acceptedRequest[key] === value);
      const markerMatches = pending?.action === 'recover' ? operation?.lastRecoveryRequestId === pending.requestId : ownerRefundAction(pending?.action) ? operation?.lastOwnerRefundRequestId === pending.requestId : true;
      if (!pending || !operationId(operation?.id) || !(pending.action === 'prepare' ? operation.requestId === pending.requestId : operation.id === pending.operationId && (markerMatches || directAcceptance))) throw new Error('PRIVATE_CLIENT_RESPONSE_MISMATCH');
      persist({ ...saved, pending: null, selectedId: operation.id });
    },
    reconcile(operations) {
      const pending = saved.pending;
      if (!pending) return null;
      const found = operations.find(op => pending.action === 'prepare' ? op.requestId === pending.requestId : op.id === pending.operationId && (pending.action === 'recover' ? op.lastRecoveryRequestId === pending.requestId : ownerRefundAction(pending.action) ? op.lastOwnerRefundRequestId === pending.requestId : op.phase !== 'PREPARED'));
      if (found) { this.accept(found); return found; }
      return null;
    },
    reject() { persist({ ...saved, pending: null }); },
  });
}

export function startPrivateClient() {
  const el = id => document.getElementById(id), token = document.querySelector('meta[name="local-token"]')?.content;
  if (!el('private')) return;
  let snapshot = null, selectedId = null, connected = false, sending = false, reading = null, tracker, storageReady = true, message = '', connectionIssue = false;
  const storageFailure = () => { storageReady = false; message = 'No se puede conservar la identidad de la solicitud en este navegador. Los nuevos inicios, las devoluciones y las recuperaciones están bloqueados para evitar duplicados; puedes seguir consultando el historial.'; };
  try { tracker = createPrivateRequestTracker(localStorage); selectedId = tracker.selectedId; } catch { storageFailure(); }
  const active = () => snapshot?.operations.find(op => op.id === selectedId) ?? null;
  const date = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Fecha no disponible' : d.toLocaleString('es-ES'); };
  const choose = id => { selectedId = id; try { tracker?.select(id); } catch { storageFailure(); } };
  async function api(path, options = {}) {
    if (!token || token === '__LOCAL_TOKEN__') throw new Error('PRIVATE_CLIENT_SESSION');
    const response = await fetch(path, { ...options, cache: 'no-store', credentials: 'same-origin', headers: { 'X-Local-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15000) });
    let body;
    try { body = await response.json(); } catch { throw new Error('PRIVATE_CLIENT_RESPONSE_UNKNOWN'); }
    if (!response.ok) {
      // Gateway/server errors may follow acceptance. Only explicit 4xx replies
      // establish rejection; an unreadable or lost response keeps its identity.
      const error = new Error('PRIVATE_CLIENT_REQUEST_REJECTED'); error.status = response.status;
      error.definitive = [400, 403, 404, 409, 413, 415, 422].includes(response.status);
      throw error;
    }
    return body;
  }
  function render() {
    const op = active(), pending = tracker?.pending, controls = privateControls(snapshot, op, { connected, sending, storageReady, pending });
    el('private-prepare').disabled = !controls.prepare;
    el('private-start').disabled = !controls.start;
    el('private-recover').disabled = !controls.recover;
    el('private-refund').disabled = !controls.refund;
    el('private-recover-refund').disabled = !controls.recoverRefund;
    el('private-prepare').textContent = pending?.action === 'prepare' ? 'Reintentar misma preparación' : '1. Preparar pago';
    el('private-start').textContent = pending?.action === 'start' ? 'Reintentar mismo inicio' : '2. Iniciar pago';
    el('private-recover').textContent = pending?.action === 'recover' ? 'Reintentar misma recuperación' : 'Recuperar retiradas';
    el('private-refund').textContent = pending?.action === 'refund' ? 'Reintentar misma devolución' : 'Solicitar devolución';
    el('private-recover-refund').textContent = pending?.action === 'recoverRefund' ? 'Reintentar misma recuperación de devolución' : 'Recuperar devolución';
    for (const id of ['private-prepare', 'private-start', 'private-recover', 'private-refund', 'private-recover-refund']) el(id).setAttribute('aria-busy', String(sending));
    el('private-refresh').disabled = Boolean(reading);
    el('private-connection').textContent = connected ? 'Servicio local conectado. Consultando la misma operación; cerrar el navegador no detiene el motor.' : 'Sin conexión verificada. El motor puede seguir trabajando; reconectar consultará la misma operación. No inicies otra para sustituirla.';
    el('private-connection').classList.toggle('disconnected', !connected);
    const notice = !storageReady ? message : snapshot?.storageError ? privateStorageErrorLabel(snapshot.storageError) : message || (pending ? 'La respuesta de esta solicitud sigue pendiente. Actualiza para consultar su aceptación; un reintento manual conservará exactamente su identidad, sin crear otro envío nativo.' : '');
    el('private-notice').hidden = !notice; el('private-notice').textContent = notice;
    el('private-history-count').textContent = `${snapshot?.operations.length ?? 0} OPERACIONES`;
    const select = el('private-operation-select');
    const choices = (snapshot?.operations ?? []).map(item => ({ id: item.id, label: `${date(item.createdAt)} · ${item.id.slice(0, 8)}… · ${privatePhaseLabel(item.phase)}` }));
    const key = JSON.stringify(choices);
    if (select.dataset.options !== key) {
      select.dataset.options = key;
      const options = (choices.length ? choices : [{ id: '', label: 'Sin operaciones retenidas' }]).map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; return option; });
      select.replaceChildren(...options);
    }
    select.value = selectedId ?? ''; select.disabled = !choices.length;
    const running = snapshot?.operations.find(item => item.id === snapshot.activeOperationId);
    el('private-active-note').textContent = running && running.id !== op?.id ? `Operación activa: ${running.id.slice(0, 8)}… · ${privatePhaseLabel(running.phase)}. Estás viendo otro registro.` : 'Cada entrada conserva un resultado independiente del modelo sintético y de los paneles transparentes.';
    el('private-status').textContent = op ? privatePhaseLabel(op.phase) : connected ? 'Sin preparar' : 'Sin conexión';
    el('private-status').className = `badge ${op?.phase === 'COMPLETED' ? 'success' : op?.phase === 'REFUNDED' ? 'neutral' : ['FAILED', 'INTERRUPTED'].includes(op?.phase) ? 'danger' : op ? 'pending' : 'neutral'}`;
    el('private-empty').hidden = Boolean(op); el('private-operation').hidden = !op;
    if (!op) return;
    el('private-operation-id').textContent = op.id;
    el('private-updated').textContent = date(op.updatedAt);
    el('private-observation').textContent = op.observation === 'LIVE' && connected ? 'Estado del motor conectado; no es un saldo de wallet' : 'Historial retenido; no es una observación actual ni un saldo gastable';
    el('private-progress').textContent = op.phase === 'INTERRUPTED' || op.engineState === 'INTERRUPTED' ? PRIVATE_ENGINE_UNAVAILABLE : `${privatePhaseLabel(op.phase)}${op.errorCode ? '. Hay una incidencia que requiere revisión; consulta el estado retenido.' : ''}`;
    el('private-owner').textContent = privateOwnerLabels[op.ownerState] ?? 'Estado del proceso sin verificar';
    for (const role of ['sol', 'btc']) el(`private-payout-${role}`).textContent = privatePayoutLabel(op.payouts?.[role], op);
    el('private-outcome').textContent = privateOutcome(op);
    el('private-cleanup').textContent = privateCleanupLabel(op, { connected });
    el('private-cleanup').classList.toggle('disconnected', ['FAILED', 'RETAINED'].includes(op.cleanupState));
    el('private-recovery').textContent = privateRecoveryLabel(op, { connected });
    el('private-recovery').classList.toggle('disconnected', !connected || op.recoveryState === 'UNAVAILABLE');
    el('private-recovery').hidden = !['RECOVERABLE', 'RECOVERING'].includes(op.phase) && (op.recoveryState ?? 'NONE') === 'NONE';
    el('private-owner-refund').textContent = privateOwnerRefundLabel(op, { connected });
    el('private-owner-refund').classList.toggle('disconnected', !connected || ['UNKNOWN', 'UNAVAILABLE'].includes(op.ownerRefund.state));
    el('private-owner-refund').hidden = !['REFUNDABLE', 'REFUNDING', 'REFUNDED'].includes(op.phase) && op.ownerRefund.state === 'NONE' && op.settlementState !== 'RECOVERY_NOTE_ISSUED';
    el('private-evidence').textContent = JSON.stringify(privatePublicDetails(op), null, 2);
    const stateLabels = { complete: 'Registrado', current: 'En curso', pending: 'Pendiente', unknown: 'Sin confirmar' };
    el('private-steps').replaceChildren(...privateProgressSteps(op).map(step => {
      const li = document.createElement('li'); li.className = `private-step ${step.state}`;
      const label = document.createElement('span'); label.textContent = step.label;
      const status = document.createElement('small'); status.textContent = stateLabels[step.state];
      if (step.state === 'current') li.setAttribute('aria-current', 'step');
      li.append(label, status); return li;
    }));
  }
  function refresh() {
    if (reading) return reading;
    reading = (async () => {
      try {
        snapshot = validatePrivateSnapshot(await api('/api/private')); connected = true;
        if (connectionIssue && storageReady) message = 'Conexión recuperada. Se ha consultado el estado conservado de la misma operación.';
        connectionIssue = false;
        if (storageReady) {
          try { const accepted = tracker.reconcile(snapshot.operations); if (accepted) { selectedId = accepted.id; message = 'Solicitud localizada. Se ha recuperado la misma operación, sin repetir la ejecución.'; } } catch { storageFailure(); }
        }
        if (!snapshot.operations.some(op => op.id === selectedId)) choose(snapshot.activeOperationId ?? snapshot.operations[0]?.id ?? null);
        return true;
      } catch (error) {
        connected = false; connectionIssue = true;
        if (storageReady) message = error.status === 403 ? 'La sesión local cambió. Recarga esta página para obtener la sesión vigente y volver a consultar la operación.' : error.message === 'PRIVATE_CLIENT_CONTRACT' ? 'El servicio devolvió un perfil o estado incompatible. Se bloquean los nuevos inicios, las devoluciones y las recuperaciones; no se ha asumido un resultado.' : 'No se pudo consultar el servicio. Esto no demuestra que la operación haya fallado ni que el pago se haya devuelto.';
        return false;
      } finally { reading = null; render(); }
    })();
    render(); return reading;
  }
  async function submit(action) {
    if (sending || !storageReady) return;
    sending = true; render();
    let body;
    try {
      const previous = tracker.pending;
      // Every explicit retry first checks acceptance; never create a new request
      // when that read resolves the prior ambiguous one.
      if (previous || action === 'recover' || ownerRefundAction(action)) { if (!await refresh() || previous && !tracker.pending) return; }
      else if (reading) await reading;
      const controls = privateControls(snapshot, active(), { connected, storageReady, pending: tracker.pending });
      if (!controls[action]) return;
      try { body = tracker.begin(action, selectedId); } catch { storageFailure(); return; }
      message = ''; render();
      const response = await api('/api/private/action', { method: 'POST', body: JSON.stringify(body) });
      try { tracker.accept(response.operation, body); selectedId = response.operation.id; } catch (error) { if (error.message === 'PRIVATE_CLIENT_RESPONSE_MISMATCH') throw error; storageFailure(); return; }
      message = response.replayed ? 'Solicitud ya aceptada: se consulta la misma operación, sin iniciar otra.' : action === 'prepare' ? 'Perfil preparado. Revisa la operación antes de iniciar el pago local.' : action === 'recover' ? 'Recuperación de retiradas aceptada. Solo se consultan o retiran las notas de compensación en el mismo pool vivo; no se reenvían SOL/BTC.' : action === 'refund' ? 'Solicitud de devolución aceptada. El servicio esperará al corte autenticado antes de enviar; aún no acredita una retirada al propietario ni el pago a ejecutores.' : action === 'recoverRefund' ? 'Recuperación de devolución aceptada. Solo se consulta o retira la misma nota con autoridad viva; no se repiten las entregas SOL/BTC ni se dan por pagados los ejecutores.' : 'Inicio aceptado. El motor continúa aunque cierres esta página.';
    } catch (error) {
      if (body && error.definitive) { try { tracker.reject(); } catch { storageFailure(); } }
      if (storageReady) message = error.definitive ? 'La solicitud fue rechazada. Consulta el estado actualizado antes de continuar.' : 'No se confirmó la respuesta. Conservamos esta solicitud y consultaremos su aceptación; no se ha creado un nuevo envío.';
    } finally { sending = false; await refresh(); render(); }
  }
  el('private-prepare').addEventListener('click', () => { void submit('prepare'); });
  el('private-start').addEventListener('click', () => { void submit('start'); });
  el('private-recover').addEventListener('click', () => { void submit('recover'); });
  el('private-refund').addEventListener('click', () => { void submit('refund'); });
  el('private-recover-refund').addEventListener('click', () => { void submit('recoverRefund'); });
  el('private-refresh').addEventListener('click', () => { void refresh(); });
  el('private-operation-select').addEventListener('change', event => { choose(event.target.value || null); render(); });
  // Poll only reads. A new page or reconnection never sends a POST automatically.
  let interval = null;
  const startPolling = () => { if (interval === null) interval = setInterval(() => { if (!sending) void refresh(); }, 2000); };
  startPolling();
  window.addEventListener('online', () => { void refresh(); });
  window.addEventListener('pagehide', () => { clearInterval(interval); interval = null; });
  window.addEventListener('pageshow', () => { startPolling(); void refresh(); });
  void refresh();
}
if (typeof document !== 'undefined') startPrivateClient();
