// Owner inspector for a synthetic loopback-only local store. Not executor transport.
// API-originated values enter the document through textContent and DOM properties.
const token = document.querySelector('meta[name="local-token"]')?.content;
const $ = (id) => document.getElementById(id);
const terminal = new Set(['SETTLED', 'REFUNDED', 'DISPUTED']);
const chainLabels = { ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin' };
const units = { ethereum: 'wei ficticios', solana: 'lamports ficticios', bitcoin: 'sats ficticios' };
const chainGlyphs = { ethereum: 'E', solana: 'S', bitcoin: '₿' };
const statusLabels = {
  RESERVED: 'RESERVADA', EXECUTING: 'EN EJECUCIÓN', FULFILLED: 'RESULTADO COMPLETO',
  SETTLED: 'PAGO LIQUIDADO', REFUNDED: 'PAGO RECUPERADO', DISPUTED: 'EN DISPUTA',
  RECOVERY_PENDING: 'RECUPERACIÓN PENDIENTE', WAITING: 'PENDIENTE', FINAL: 'FINAL SINTÉTICO',
  LATE: 'EFECTO TARDÍO', REORGED: 'REORG SIMULADA',
};
const eventLabels = { open: 'Intención creada', receipt: 'Resultado sintético recibido', settle: 'Pago local liquidado', recover: 'Pago local recuperado', fail: 'Fallo simulado', reorg: 'Reorganización simulada' };
const errorLabels = {
  EXPIRED: 'La operación ha vencido. Puedes avanzar el reloj simulado y recuperar el pago local.',
  NOT_DISPATCHABLE: 'La instrucción ya no está disponible o alguna dependencia sigue pendiente.',
  DEPENDENCY_NOT_FINAL: 'Primero completa las instrucciones de las que depende este paso.',
  INCOMPLETE_FULFILLMENT: 'Todavía faltan resultados válidos para liquidar el pago.',
  VAULT_CONFLICT: 'El estado cambió durante la operación. Se ha vuelto a consultar el núcleo.',
  VAULT_LOCKED: 'El almacén está bloqueado por otro escritor o requiere recuperación explícita.',
  INSUFFICIENT_BALANCE: 'No quedan suficientes créditos ficticios disponibles.',
  PERMISSION_LIMIT: 'La autorización local no permite reservar más créditos.',
  PERMISSION_DENIED: 'La autorización local ha vencido o no permite esta operación.',
  TERMINAL_OPERATION: 'Esta operación ya tiene una decisión de pago definitiva en el modelo.',
};
let snapshot = null;
let selectedHash = null;
let busy = false;
let connectionVerified = false;
let requestStartedAt = 0;
let viewHash = null;
let viewLeg = null;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function formatted(value) {
  try { return BigInt(value).toLocaleString('es-ES'); } catch { return '—'; }
}

function rawAmount(value) {
  try { return BigInt(value); } catch { return 0n; }
}

function chainFor(asset) { return String(asset).split(':')[0]; }
function chainName(chain) { return chainLabels[chain] ?? chain; }
function activeOperation() { return snapshot?.state?.operations?.find((operation) => operation.hash === selectedHash); }
function clockNow() {
  const explicit = snapshot?.now ?? snapshot?.currentTime;
  // The server clock is manual. Never extrapolate wall time into protocol time.
  if (Number.isSafeInteger(explicit)) return explicit;
  return snapshot?.state?.lastNow ?? 0;
}

function isExpired(operation) { return clockNow() >= operation.graph.expiresAt; }
function dispatchable(operation, leg) {
  return connectionVerified && !snapshot?.incidents?.frozen && !busy && !isExpired(operation) && ['RESERVED', 'EXECUTING'].includes(operation.status) &&
    operation.legs.find((record) => record.id === leg.id)?.status === 'WAITING' &&
    leg.dependsOn.every((id) => operation.legs.find((record) => record.id === id)?.status === 'FINAL');
}

function badge(status) {
  let variant = 'neutral';
  if (['FINAL', 'FULFILLED', 'SETTLED', 'REFUNDED'].includes(status)) variant = 'success';
  if (['RESERVED', 'EXECUTING', 'WAITING', 'RECOVERY_PENDING'].includes(status)) variant = 'pending';
  if (['DISPUTED', 'LATE', 'REORGED'].includes(status)) variant = 'danger';
  return node('span', `badge ${variant}`, statusLabels[status] ?? status);
}

function notify(message, error = false) {
  $('notification').textContent = message;
  $('notification').className = `notification${error ? ' error' : ''}`;
  $('notification').hidden = false;
}

async function api(path, options = {}) {
  if (!token || token === '__LOCAL_TOKEN__') throw new Error('El servidor no ha proporcionado un token local válido. Abre el cliente desde su proceso local.');
  const response = await fetch(path, {
    ...options, cache: 'no-store', credentials: 'same-origin',
    headers: { 'X-Local-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Solicitud rechazada (${response.status})`);
  return payload;
}

async function refresh({ silent = false } = {}) {
  const requested = Date.now();
  requestStartedAt = requested;
  try {
    const received = await api('/api/state');
    if (requested < requestStartedAt) return;
    if (!received?.state || !Array.isArray(received.state.assets) || !Array.isArray(received.state.operations)) throw new Error('El núcleo devolvió un estado que este cliente no reconoce.');
    snapshot = received;
    connectionVerified = true;
    if (snapshot.incidents?.frozen) notify('Hay observaciones en cuarentena sin integrar. Reservas, envios y pagos bloqueados hasta reconciliar; el estado visible puede estar incompleto.', true);
    if (!snapshot.state.operations.some((operation) => operation.hash === selectedHash)) selectedHash = snapshot.state.operations.at(-1)?.hash ?? null;
    $('connection-dot').className = 'status-dot connected';
    $('connection-label').textContent = 'Proceso local conectado';
    $('updated-at').textContent = `Consultado ${new Date().toLocaleTimeString('es-ES')}`;
    render();
  } catch (error) {
    connectionVerified = false;
    $('connection-dot').className = 'status-dot error';
    $('connection-label').textContent = 'No se pudo consultar el núcleo';
    if (!silent) notify(readableError(error), true);
    if (snapshot) renderActionAvailability();
    throw error;
  }
}

function readableError(error) {
  const message = String(error?.message ?? error);
  return errorLabels[message] ?? `No se pudo completar la solicitud: ${message}`;
}

function renderBalances() {
  const state = snapshot.state;
  const credits = state.assets.find((asset) => asset.asset === 'local:simulation:credit');
  for (const bucket of ['available', 'reserved', 'committed', 'spent']) $(bucket).textContent = formatted(credits?.[bucket]);
  $('revision').textContent = String(snapshot.revision);
  $('state-commitment').textContent = snapshot.commitment ?? 'No disponible';
  const rows = state.assets.filter((asset) => asset.asset !== 'local:simulation:credit').map((asset) => {
    const chain = chainFor(asset.asset);
    const row = node('tr');
    const title = node('td');
    const label = node('span', 'chain-name');
    label.append(node('span', `network-glyph ${chain}`, chainGlyphs[chain] ?? '·'), node('span', '', chainName(chain)));
    title.append(label); row.append(title);
    for (const bucket of ['received', 'available']) {
      const cell = node('td', '', formatted(asset[bucket]));
      cell.append(node('span', 'unit', units[chain]?.replace(' ficticios', '') ?? 'unidades'));
      row.append(cell);
    }
    row.append(node('td', 'table-subtle', 'Atestación sintética local'));
    return row;
  });
  $('assets-body').replaceChildren(...rows);
  const positions = state.positions ?? [];
  $('positions-summary').textContent = positions.length ? `${positions.length} posiciones registradas en el modelo` : 'Sin posiciones registradas en el modelo inicial';
}

function renderCreationControls() {
  const state = snapshot?.state;
  const credits = state?.assets.find((asset) => asset.asset === 'local:simulation:credit');
  const permission = state?.permissions.find((item) => item.id === 'demo-payment');
  const funded = rawAmount(credits?.available) >= 1000n;
  const authorized = !snapshot?.incidents?.frozen && permission && rawAmount(permission.remaining) >= 1000n && permission.expiresAt >= clockNow() + 60000;
  $('create-normal').disabled = !connectionVerified || busy || !state || !funded || !authorized;
  $('create-failure').disabled = !connectionVerified || busy || !state || !funded || !authorized;
  $('create-hint').textContent = !state ? 'Esperando el estado del núcleo local.' : !funded ? 'No hay 1.000 créditos ficticios disponibles para una nueva reserva.' : !authorized ? 'El presupuesto o plazo de la autorización local no permite otra intención.' : `Autorización disponible: ${formatted(permission.remaining)} créditos. Recuperar un pago no restaura este permiso de gasto.`;
}

function renderOperationOptions() {
  const operations = snapshot.state.operations;
  const select = $('operation-select');
  select.replaceChildren();
  if (!operations.length) select.append(node('option', '', 'Todavía no hay operaciones'));
  for (const [index, operation] of operations.entries()) {
    const option = node('option', '', `${String(index + 1).padStart(2, '0')} · ${operation.hash.slice(0, 9)}… · ${statusLabels[operation.status] ?? operation.status}`);
    option.value = operation.hash;
    select.append(option);
  }
  if (selectedHash) select.value = selectedHash;
  select.disabled = busy || !operations.length;
}

function legCard(operation, leg, index) {
  const record = operation.legs.find((item) => item.id === leg.id);
  const card = node('article', `leg-card${record?.status === 'FINAL' ? ' final' : ''}`);
  const top = node('div', 'leg-top');
  top.append(node('span', 'leg-sequence', `INSTRUCCIÓN ${String(index + 1).padStart(2, '0')}`), badge(record?.status ?? 'WAITING'));
  const chain = node('div', 'leg-chain');
  chain.append(node('span', `network-glyph ${leg.chain}`, chainGlyphs[leg.chain] ?? '·'), node('span', '', chainName(leg.chain)));
  const value = node('div', 'leg-value', formatted(leg.amount));
  value.append(node('span', 'leg-unit', ` ${units[leg.chain] ?? 'unidades ficticias'}`));
  const dependency = leg.dependsOn.length ? `Depende de ${leg.dependsOn.map((id) => chainName(operation.graph.legs.find((item) => item.id === id)?.chain ?? id)).join(', ')}.` : 'Primera instrucción · sin dependencias.';
  const actions = node('div', 'leg-actions');
  const execute = node('button', 'button execute-button', 'Ejecutar paso simulado');
  execute.type = 'button'; execute.dataset.executeLeg = leg.id;
  execute.disabled = !dispatchable(operation, leg);
  execute.title = execute.disabled ? 'Requiere plazo vigente, operación activa y dependencias finales.' : 'Crea una atestación sintética; no envía una transacción.';
  execute.addEventListener('click', () => action('execute', { legId: leg.id }));
  const view = node('button', 'button subtle', 'Vista mínima');
  view.type = 'button'; view.dataset.viewLeg = leg.id;
  view.disabled = !dispatchable(operation, leg);
  view.title = 'Consulta la proyección entregada a este ejecutor mientras la instrucción está disponible.';
  view.addEventListener('click', () => inspectLeg(leg.id));
  actions.append(execute, view);
  card.append(top, chain, value, node('div', 'leg-executor', `Ejecutor · ${leg.executor}`), node('p', 'leg-dependency', dependency), actions);
  if (record?.receipt) card.append(node('p', 'leg-receipt', 'Atestación sintética conservada. No es una prueba de consenso.'));
  return card;
}

function renderOperation() {
  const operation = activeOperation();
  $('graph-empty').hidden = Boolean(operation);
  $('operation-details').hidden = !operation;
  const status = operation ? badge(operation.status) : node('span', 'badge neutral', 'SIN OPERACIÓN');
  $('operation-status').className = status.className;
  $('operation-status').textContent = status.textContent;
  if (!operation) return;
  $('operation-id').textContent = operation.hash;
  $('graph-legs').replaceChildren(...operation.graph.legs.map((leg, index) => legCard(operation, leg, index)));
  $('failure-note').hidden = !operation.failure && !operation.lateEffects?.length;
  $('failure-note').textContent = operation.failure ? `Fallo registrado: ${operation.failure}. Los efectos ya observados y el coste consumido permanecen contabilizados.` : `${operation.lateEffects?.length ?? 0} efectos tardíos registrados; no autorizan un pago tardío.`;
  renderActionAvailability();
}

function renderActionAvailability() {
  renderCreationControls();
  const operation = activeOperation();
  if (!operation) {
    for (const id of ['settle', 'fail', 'recover']) $(id).disabled = true;
    return;
  }
  const expired = isExpired(operation);
  $('settle').disabled = !connectionVerified || snapshot?.incidents?.frozen || busy || expired || operation.status !== 'FULFILLED';
  $('fail').disabled = !connectionVerified || busy || expired || terminal.has(operation.status) || operation.status === 'RECOVERY_PENDING';
  $('recover').disabled = !connectionVerified || busy || terminal.has(operation.status);
  const time = new Date(operation.graph.expiresAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('deadline').textContent = `${time}${expired ? ' · Vencida' : ''}`;
  const nowProvided = Number.isSafeInteger(snapshot.now ?? snapshot.currentTime);
  $('clock-note').textContent = nowProvided ? (expired ? 'Reloj manual: plazo vencido.' : `${Math.max(0, Math.ceil((operation.graph.expiresAt - clockNow()) / 1000))} s de plazo en el reloj manual; solo avanza al recuperar`) : 'Reloj de la ultima transicion; el servidor valida el plazo.';
  for (const button of document.querySelectorAll('[data-execute-leg], [data-view-leg]')) {
    const id = button.dataset.executeLeg ?? button.dataset.viewLeg;
    const leg = operation.graph.legs.find((item) => item.id === id);
    button.disabled = !leg || !dispatchable(operation, leg);
  }
}

function renderCapital() {
  const solver = snapshot.state.solvers?.[0];
  $('solver-name').textContent = solver?.id ?? 'Sin solver configurado';
  $('solver-paid').textContent = formatted(solver?.paid);
  $('capital-body').replaceChildren(...(solver?.inventory ?? []).map((asset) => {
    const row = node('tr');
    row.append(node('td', '', chainName(chainFor(asset.asset))));
    for (const bucket of ['available', 'reserved', 'spent']) row.append(node('td', '', formatted(asset[bucket])));
    return row;
  }));
}

function renderEvents() {
  const events = snapshot.state.events ?? [];
  $('event-count').textContent = `${events.length} ${events.length === 1 ? 'EVENTO' : 'EVENTOS'}`;
  const rows = events.slice(-6).reverse().map((event) => {
    const row = node('li', 'event-row');
    const content = node('div', 'event-main');
    content.append(node('span', '', eventLabels[event.type] ?? event.type), node('code', '', `${event.hash.slice(0, 9)}…`), badge(event.status));
    row.append(node('span', 'event-index', String(event.sequence).padStart(2, '0')), content, node('time', 'event-time', new Date(event.at).toLocaleTimeString('es-ES')));
    return row;
  });
  $('events-list').replaceChildren(...(rows.length ? rows : [node('li', 'empty-cell', 'Aún no se han registrado transiciones.')]));
}

function renderRuntimes() {
  $('runtime-status').replaceChildren(...Object.keys(chainLabels).map((chain) => {
    const runtime = snapshot.runtimeStatus?.[chain];
    let label = 'No comprobada en esta sesión';
    if (runtime !== undefined) {
      const status = typeof runtime === 'string' ? runtime : runtime.status;
      const labels = { BLOCKED: 'Integración bloqueada', UNAVAILABLE: 'Runtime no disponible', VERIFIED_LOCAL: 'Verificada localmente', LOCAL_VERIFIED: 'Verificada localmente', IMPLEMENTED: 'Implementada; pendiente de verificar', SIMULATED: 'Sólo simulada', DESIGNED: 'Diseñada', AVAILABLE: 'Runtime disponible; no prueba de integración' };
      label = labels[String(status).toUpperCase()] ?? String(status ?? 'Estado sin clasificación');
    }
    const row = node('div', 'runtime-row');
    row.append(node('span', '', chainName(chain)), node('span', '', label));
    return row;
  }));
}

function render() {
  renderBalances(); renderCreationControls(); renderOperationOptions(); renderOperation(); renderCapital(); renderEvents(); renderRuntimes();
  $('refresh').disabled = busy;
  if (viewHash && (viewHash !== selectedHash || !activeOperation()?.legs.some((leg) => leg.id === viewLeg && leg.status === 'WAITING'))) clearView();
}

function clearView() {
  viewHash = null; viewLeg = null;
  $('view-label').textContent = 'SIN SELECCIÓN';
  $('executor-view').textContent = 'Selecciona «Vista mínima» en una instrucción disponible.';
}

async function inspectLeg(legId) {
  if (busy || !selectedHash) return;
  const requestedHash = selectedHash;
  try {
    const projection = await api(`/api/view?hash=${encodeURIComponent(requestedHash)}&legId=${encodeURIComponent(legId)}`);
    if (selectedHash !== requestedHash) return;
    const currentLeg = activeOperation()?.graph.legs.find((item) => item.id === legId);
    if (!currentLeg || !dispatchable(activeOperation(), currentLeg)) return;
    viewHash = requestedHash; viewLeg = legId;
    const leg = activeOperation()?.graph.legs.find((item) => item.id === legId);
    $('view-label').textContent = leg?.executor ?? 'INSTRUCCIÓN';
    $('executor-view').textContent = JSON.stringify(projection, null, 2);
    $('inspection').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch (error) { notify(readableError(error), true); }
}

async function action(name, extra = {}) {
  if (busy || !connectionVerified) return;
  if (name !== 'create' && !selectedHash) return;
  busy = true;
  let actionAccepted = false;
  if (snapshot) render();
  try {
    const result = await api('/api/action', { method: 'POST', body: JSON.stringify({ action: name, ...(name !== 'create' ? { hash: selectedHash } : {}), ...extra }) });
    actionAccepted = true;
    if (name === 'create') {
      selectedHash = result.hash ?? null;
      clearView();
    }
    await refresh({ silent: true });
    if (result.quarantined) { notify('Observacion conservada en cuarentena cifrada; NO integrada en el estado. Nuevos envios bloqueados hasta reconciliar.', true); return; }
    const messages = {
      create: 'Intención creada: pago e inventario ficticios reservados. Completa las instrucciones de una en una.',
      execute: 'Resultado sintético registrado. No se ha enviado ninguna transacción a una red.',
      settle: 'Pago liquidado una única vez en el almacén local tras verificar todos los resultados sintéticos.',
      fail: 'Fallo registrado. El pago sigue retenido; puedes avanzar el reloj del modelo y recuperarlo.',
      recover: 'Pago retenido recuperado en el modelo. Los efectos previos y los costes del solver permanecen.',
    };
    notify(messages[name] ?? 'Acción aplicada al modelo local.');
  } catch (error) {
    notify(actionAccepted ? 'El núcleo aceptó la acción, pero no se pudo confirmar el estado actualizado. Actualiza el estado antes de continuar.' : readableError(error), true);
    await refresh({ silent: true }).catch(() => {});
  } finally {
    busy = false;
    if (snapshot) render();
  }
}

$('create-normal').addEventListener('click', () => action('create', { order: 'normal' }));
$('create-failure').addEventListener('click', () => action('create', { order: 'bitcoin-first' }));
for (const name of ['settle', 'fail', 'recover']) $(name).addEventListener('click', () => action(name));
$('refresh').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('refresh').disabled = true;
  if (snapshot) render();
  try { await refresh(); } catch { /* Displayed by refresh. */ }
  finally { busy = false; if (snapshot) render(); else $('refresh').disabled = false; }
});
$('operation-select').addEventListener('change', (event) => {
  selectedHash = event.target.value;
  clearView(); renderOperation();
});
setInterval(() => { if (snapshot) renderActionAvailability(); }, 1000);
refresh().catch(() => {});
