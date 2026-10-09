import {createWrappedResumeBrowser} from './features/withdrawals/wrapped-resume-browser.mjs';
import { WRAPPED_WITHDRAWAL_ACTIONS, isWrappedWithdrawalAction } from './features/withdrawals/wrapped-withdrawal-review.mjs';
import { bindManualActionConsent } from './features/accounts/manual-action-dom.mjs';
import { ACTIONS, DEFI_ACTIONS, ACCOUNT_ACTIONS, ALL_ACTIONS, atomic, createWalletClient, projectWalletState,
  originalNativeIdentity, nativeIdentityDetails, nativeAmountDetails, accountAssetChoices, accountActionContext, accountReviewDetails } from './state/view-model.mjs';

const labels = { fresh: 'Observado por RPC', unknown: 'Desconocido', stale: 'Desactualizado', reorged: 'Reorganización detectada',
  READY_TO_REDEEM: 'Preparado para redimir', REDEMPTION_UNRESOLVED: 'Redención sin resolver', REDEEMED: 'Redimido según servicio',
  REVERTED: 'Revertido', BINDING_REDEMPTION: 'Vinculando redención', REQUOTING_REDEMPTION: 'Cotización sin resolver', REOPENED: 'Servicio reabierto', LIVE: 'Observado', STALE: 'Desactualizado', PARTIAL: 'Parcial', UNAVAILABLE: 'No disponible',
  AVAILABLE: 'Diario disponible', CONNECTED: 'Servicio conectado', DISCONNECTED: 'Desconectado', READY: 'Diario disponible', CLOSED: 'Cerrado',
  ADMITTED: 'Admitida', UNKNOWN: 'Resultado desconocido', CONFIRMED: 'Confirmada por la autoridad',
  UNRESOLVED: 'Sin resolver', RUNNING: 'En curso', FAILED: 'Fallida', SUCCEEDED: 'Trabajo completado',
  DISCHARGED: 'Obligación descargada', ISSUED: 'Claim emitido', CURRENT_QUORUM: 'Quórum observado',
  PREPARED: 'Preparado', PREPOSITIONED: 'Intent incluido', HELD_UNISSUED: 'Custodiado, sin emitir',
  REFUND_PENDING: 'Devolución pendiente', REDEMPTION_PENDING: 'Redención pendiente',
  OBSERVED_AWAITING_DISCHARGE: 'Observado, descarga pendiente' };
const $ = id => document.getElementById(id);
const node = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const readable = value => labels[value] ?? value;
const badge = (value, fallback = '') => node('span', `badge ${['LIVE', 'CONNECTED', 'CURRENT_QUORUM', 'READY'].includes(value) ? 'good' : ['STALE', 'PARTIAL', 'UNKNOWN', 'UNAVAILABLE'].includes(value) ? 'warning' : 'neutral'}`, readable(value) || fallback);
const safeString = (value, fallback = 'No disponible') => typeof value === 'string' && value.length ? value : fallback;
function consumeToken(name) { const element = document.querySelector(`meta[name="${name}"]`); const token = element?.content ?? ''; element?.remove(); return token; }
const listenerId = consumeToken('wallet-listener-id');
const client = createWalletClient({ fetchImpl: (...args) => fetch(...args),
  ownerToken: consumeToken('wallet-owner-token'), actionToken: consumeToken('wallet-action-token'),
  manualActionHandoff: listenerId ? { origin: globalThis.location.origin, listenerId } : null,
  exactActionAccess: listenerId ? { origin: globalThis.location.origin, listenerId } : null,
  wrappedWithdrawalAccess: listenerId ? { origin: globalThis.location.origin, listenerId } : null });
const resumeController=listenerId?createWrappedResumeBrowser({origin:globalThis.location.origin,listenerId,fetchImpl:(...args)=>fetch(...args),onChanged:()=>render(client.getState())}):null;
export const getWrappedResumeReview=()=>resumeController?.getReview()??null;
export const acceptWrappedResumeActionAccess=input=>resumeController?.acceptAccess(input)??false;
export const disconnectWrappedResumeHost=()=>resumeController?.disconnect();
// Direct module interface only. An already-authorized original local shell must
// pin this exact document/origin, and explicitly hand off the returned grant.
export const getManualActionReview = () => client.getManualActionReview();
export const acceptManualActionGrant = grant => client.acceptManualActionGrant(grant);
export const disconnectManualActionHost = () => client.disconnectManualActionHost();
export const getExactActionReview = () => client.getExactActionReview();
export const acceptExactActionAccess = grant => client.acceptExactActionAccess(grant);
export const disconnectExactActionHost = () => client.disconnectExactActionHost();
// Separate direct-module import of an existing original one-use action access.
// The pinned local host must explicitly review this request and call its actual
// application.issueActionCapability({ action, body }). No automatic host callback.
export const getWrappedWithdrawalReview = () => client.getWrappedWithdrawalReview();
export const acceptWrappedWithdrawalActionAccess = grant => client.acceptWrappedWithdrawalActionAccess(grant);
export const disconnectWrappedWithdrawalHost = () => client.disconnectWrappedWithdrawalHost();
let selectedAction = 'deposit', selectedDefiAction = 'defiPrepare', selectedAccountAction = 'accountPrepare', reviewShown = false;
const isDefi = action => Object.hasOwn(DEFI_ACTIONS, action);
const isAccount = action => Object.hasOwn(ACCOUNT_ACTIONS, action);
const groupFor = action => isWrappedWithdrawalAction(action) ? 'wrappedWithdrawal' : isAccount(action) ? 'account' : isDefi(action) ? 'defi' : 'native';
const sectionFor = action => isAccount(action) ? 'account' : isDefi(action) ? 'defi' : 'operations';
const selectedFor = action => isAccount(action) ? selectedAccountAction : isDefi(action) ? selectedDefiAction : selectedAction;
const formMap = new Map();
function empty(message) { const result = node('div', 'empty-state'); result.append(node('span', 'empty-symbol', '◈'), node('p', '', message)); return result; }
function exactAmount(parent, amount, units, formatted = null) {
  parent.append(node('strong', 'amount', amount === null ? 'No disponible' : formatted ?? amount));
  parent.append(node('span', 'atomic-units', amount === null ? 'Sin observación; no equivale a cero' : `${amount} ${units}`));
}
function showText(id, text) { $(id).textContent = text; $(id).hidden = !text; }
function renderPortfolio(state, view) {
  $('portfolio-badge').replaceWith(Object.assign(badge(view.portfolioStatus), { id: 'portfolio-badge' }));
  $('coherence').textContent = view.coherent ? 'Observación coherente del titular. Los importes conservan su unidad y su activo.'
    : view.ownerStateCoherence?.assets ? 'Activos observados; la vista global está incompleta porque faltan posiciones, valoraciones o diarios coherentes. Los importes conocidos se conservan por separado.'
    : view.portfolioStatus === 'PARTIAL' ? 'Vista parcial: algunos activos no tienen una observación disponible. No hay total consolidado.'
      : view.portfolioStatus === 'STALE' ? 'Última vista conservada; no es una comprobación actual del saldo o del respaldo.'
        : 'No hay una observación coherente disponible. Los datos ausentes no se representan como cero.';
  showText('portfolio-error', state.data?.errors.portfolio ? `Proyección del portafolio: ${state.data.errors.portfolio}. Los datos conservados están desactualizados.` : '');
  const cards = $('asset-cards'); cards.replaceChildren();
  for (const asset of view.assets) {
    const card = node('article', 'asset-card');
    const head = node('div', 'card-heading');
    const title = node('div', 'asset-identity'); title.append(node('span', 'asset-icon', asset.symbol.slice(0, 1)), node('h3', '', asset.symbol));
    head.append(title, badge(asset.status)); card.append(head);
    if (asset.generationId) {
      const generation = view.generations.find(row => row.generationId === asset.generationId);
      card.append(node('p', 'eyebrow', `Generación ${generation?.ordinal ?? '?'} · pool original`));
      card.append(node('p', 'mono small', asset.pool));
    }
    const grid = node('div', 'balance-grid');
    for (const [key, title] of [['available', 'Disponible'], ['reserved', 'Reservado'], ['recovery', 'Recuperación'], ['locked', 'Bloqueado']]) {
      const cell = node('div', `balance ${key === 'available' ? 'available' : ''}`); cell.append(node('span', 'balance-label', title));
      exactAmount(cell, asset.balances[key], `unidades atómicas · ${asset.symbol}`, asset.amounts[key]); grid.append(cell);
    }
    card.append(grid);
    const footer = node('div', 'card-footer');
    footer.append(node('span', '', asset.observed?.blockNumber ? `Bloque ${asset.observed.blockNumber}` : 'Bloque no disponible'),
      node('span', '', `Decimales: ${Number.isInteger(asset.decimals) ? asset.decimals : 'no disponibles'}`)); card.append(footer);
    if (asset.domain) card.append(node('p', 'small', `Dominio ${asset.domain.scope.slice(0,12)} · red ${asset.domain.chainId}`),
      node('p', 'footnote', 'Disponible, reservado, recuperable y bloqueado pueden solaparse; no se suman.'));
    const detail = node('details', 'asset-detail'); detail.append(node('summary', '', 'Identidad y respaldo observado'));
    detail.append(node('p', 'mono', asset.id || 'Identidad no disponible'));
    if (asset.domain) for (const [label, field] of [['Génesis','genesis'],['Pool','pool'],['Ámbito','scope'],['Política','policy'],['Identidad del activo','assetIdentity']])
      detail.append(node('p','mono small', `${label}: ${asset.domain[field]}`));
    if (asset.generationId) {
      detail.append(node('p', 'mono small', `Generación: ${asset.generationId}`));
      detail.append(node('p', 'mono small', `Dominio original: ${asset.domainCommitment}`));
      detail.append(node('p', 'footnote', 'Este pool conserva sus notas y recuperaciones originales. No se suma ni migra su saldo a otra generación.'));
    }
    for (const [key, title] of [['held', 'Custodiado'], ['liabilities', 'Obligaciones'], ['surplus', 'Excedente'], ['deficit', 'Déficit']])
      detail.append(node('p', 'muted small', `${title}: ${atomic(asset.backing?.[key]) ?? 'no disponible'} · unidades atómicas`));
    detail.append(node('p', 'footnote', 'El respaldo corresponde al activo, no a un saldo adicional del titular.')); card.append(detail); cards.append(card);
  }
  if (view.economicState) cards.append(node('p', 'footnote', 'Vista privada guardada por activo y dominio. Las redes se observan por separado; no hay un total agregado. Las notas del dispositivo requieren sus permisos propios y no están incluidas en esta conexión.'));
  if (!view.assets.length) cards.append(empty('Portafolio no disponible. Abre la sesión original y consulta su estado; no se ha inferido ningún saldo.'));
  $('positions').hidden = !view.positions.length; $('position-cards').replaceChildren();
  for (const position of view.positions) {
    const card = node('article', 'asset-card'); const head = node('div', 'card-heading');
    head.append(node('h3', '', `${position.shareSymbol} / ${position.underlyingSymbol}`), badge(position.status)); card.append(head);
    card.append(node('p', 'eyebrow', 'ERC4626_SHARE · POSICIÓN REPORTADA POR EL HOST'));
    if (position.generationId) {
      card.append(node('p', 'mono small', `Generación original: ${position.generationId}`),
        node('p', 'mono small', `Share asset: ${position.shareAssetId}`),
        node('p', 'mono small', `Underlying asset: ${position.underlyingAssetId ?? 'no registrado en esta generación'}`),
        node('p', 'mono small', `Pool original: ${position.pool ?? 'no disponible'}`),
        node('p', 'mono small', `Dominio original: ${position.domainCommitment ?? 'no disponible'}`),
        node('p', 'mono small', `Vault: ${position.vault} · token subyacente: ${position.underlyingToken}`));
      if (position.join !== 'SAME_GENERATION_AND_HEAD') card.append(node('p', 'inline-warning',
        'Estimación desconocida: falta una vista actual de la misma generación, bloque y saldo disponible de shares.'));
      if (position.observed) card.append(node('p', 'mono small',
        `Bloque de la estimación: ${position.observed.blockNumber} · ${position.observed.blockHash} · timestamp ${position.observed.timestamp}`));
      card.append(node('p', 'footnote', 'Redondeo hacia abajo · no gastable · no se suma al saldo privado ni a otras generaciones.'));
    }
    if (Object.hasOwn(position,'ownershipBalances')) {
      card.append(node('p','small',`Propiedad privada: ${position.ownershipStatus} · valoración: ${position.valuationStatus}`));
      for(const [key,label] of [['reserved','Shares reservadas'],['locked','Shares bloqueadas'],['recovery','Shares recuperables']])
        card.append(node('p','',`${label}: ${position.ownershipBalances?.[key]??'no disponibles'} unidades atómicas`));
      card.append(node('p','footnote','Las categorías pueden solaparse; no se suman. La recuperación puede estar incluida en shares disponibles o bloqueadas.'));
      for(const request of position.pendingRequests??[])card.append(node('p','mono small',`${request.kind} · ${request.requestId} · ${request.state}`));
      if(position.pendingRequests===null)card.append(node('p','inline-warning','Solicitudes pendientes desconocidas; no equivale a que no existan.'));
    }
    card.append(node('p', '', `Shares disponibles: ${position.shares ?? 'no disponibles'} unidades atómicas`));
    card.append(node('p', '', `Subyacente estimado: ${position.estimate ?? 'no disponible'} unidades atómicas`));
    card.append(node('p', 'footnote', 'underlyingSpendable: false · redondeo conservador · estimación separada de la redención pública')); $('position-cards').append(card);
  }
}
function renderNative(state, view) {
  $('native-badge').replaceWith(Object.assign(badge(view.nativeStatus), { id: 'native-badge' }));
  showText('native-error', state.data?.errors.nativeClaims ? `Servicio de claims: ${state.data.errors.nativeClaims}. Revisa el estado antes de actuar.` : '');
  const cards = $('native-cards'); cards.replaceChildren();
  for (const claim of view.nativeClaims) {
    const card = node('article', 'native-card'); const head = node('div', 'card-heading');
    head.append(node('h3', '', `${claim.nativeSymbol} · claim custodial`), badge(claim.custody)); card.append(head);
    card.append(node('p', 'small', `Wrapper privado: ${claim.symbol}`));
    exactAmount(card, claim.amount, claim.atomicUnit ? `${claim.atomicUnit} · ${claim.decimals} decimales de claim privado` : 'unidades atómicas de claim privado',
      claim.display === undefined || claim.display === null ? null : `${claim.display} ${claim.symbol}`);
    if (claim.mint) card.append(node('p', 'small mono', `Mint SPL: ${claim.mint}`));
    card.append(node('p', 'footnote', 'Sin autocustodia nativa · subyacente no gastable desde aquí'));
    if (claim.diagnostic) card.append(node('p', 'inline-warning mono', claim.diagnostic)); cards.append(card);
  }
  if (!view.nativeClaims.length) cards.append(empty('Sin proyección de claims nativos disponible. La ausencia de datos no confirma un saldo cero.'));
  $('native-observation').textContent = `Observación del servicio: ${view.nativeObservation}. El diario conserva resultados; no constituye por sí solo una observación nativa nueva.`;
  const records = $('native-records'); records.replaceChildren();
  for (const [kind, values, idField] of [['Intent', view.deposits, 'intentId'], ['Ticket', view.tickets, 'ticketId']]) for (const row of values) {
    const line = node('article', 'native-record');
    line.append(node('h4', '', `${kind} · ${safeString(row.kind, 'depósito')}`),
      node('p', 'mono', safeString(row[idField])), badge(state.stale || state.nativeStale ? 'STALE' : safeString(row.status)),
      node('p', 'small', `Importe: ${atomic(row.amount) ?? 'no disponible'} unidades atómicas`));
    if (kind === 'Intent' && typeof row.intentId === 'string') {
      const use = node('button', 'button small', 'Usar intent en depósito'); use.type = 'button'; use.disabled = !client.can('deposit');
      use.addEventListener('click', () => { selectAction('deposit'); formMap.get('deposit').elements.intentId.value = row.intentId; client.cancelReview(); $('operations').scrollIntoView({ block: 'start' }); }); line.append(use);
    }
    records.append(line);
  }
  if (!view.deposits.length && !view.tickets.length) records.append(node('p', 'muted', 'No hay intents o tickets recibidos para esta vista.'));
}
const descriptions = {
  accountRecover: 'Recupera solo el GRAPH original mediante una capacidad exacta explícita. El cutoff y la reserva originales no cambian; no se reenvía ni se revierte una entrega previa.',
  accountPrepare: 'Selecciona TOP_UP, EXIT o GRAPH registrado y el activo exacto observado. Introduce la referencia ya preparada por el proceso original del titular. Para continuar PREPARING, conserva su mismo ID, tipo, referencia y activo; el keeper valida los campos ocultos sin revincular.',
  accountExecute: 'Ejecuta solo una preparación original registrada en estado PREPARED, con activo identificado de forma única. La ejecución puede iniciar trabajo y efectos originales; requiere tu confirmación.',
  accountReconcile: 'Consulta únicamente el ID original registrado. No crea ni reenvía una transferencia; Grafos sin handoff original e IDs desconocidos están bloqueados.',
  defiPrepare: 'Vincula una redención al ID del EXIT original de shares ya confirmado. El mínimo se expresa en unidades atómicas del subyacente. Introduce el deadline como timestamp de la cadena original.',
  defiExecute: 'Ejecuta únicamente la redención original preparada. Es una operación pública hacia la dirección externa original del titular.',
  defiReconcile: 'Consulta la redención original y sus identidades retenidas. Un resultado desconocido no permite reenviar la transferencia.',
  defiReopen: 'Reabre solo el servicio con las mismas identidades. No reinicia el keeper, nodos ni claves, y no reenvía transferencias.',
  defiRequote: 'Modifica mínimo y deadline de la redención original solo si nunca fue enviada. El servidor comprueba esa condición; no permite reenviar una transferencia incierta.',
  deposit: 'Admite un depósito para un intent ya preparado por el titular original. No prepara intents o pruebas desde el navegador.',
  redeem: 'Requiere la salida original del titular y wrapper claim disponible para quemar. Importe y comisión máxima se expresan en unidades atómicas del dominio nativo fijado por el servicio.',
  refund: 'Solicita la devolución elegible del intent original a su origen fijado. Conserva el intent; no crea otro depósito.',
  reconcile: 'Consulta las identidades retenidas de una solicitud ya admitida o de resultado desconocido. Introduce su ID original.',
  resume: 'Continúa una solicitud original bajo las comprobaciones del servidor. Puede continuar efectos autorizados pendientes y exige confirmación explícita.',
};
const fieldLabels = { requestId: 'ID de solicitud', intentId: 'ID del intent original', amount: 'Importe · unidades atómicas', maxFee: 'Comisión máxima · unidades atómicas', minimumOutput: 'Mínimo de subyacente · unidades atómicas', deadline: 'Deadline · timestamp de la cadena original',
  kind: 'Operación original', ownerOperationRef: 'Referencia preparada por el titular · ownerOperationRef', assetId: 'Activo original · identidad completa' };
function selectAction(action) {
  if (!Object.hasOwn(ALL_ACTIONS, action)) return;
  if (isAccount(action)) selectedAccountAction = action; else if (isDefi(action)) selectedDefiAction = action; else selectedAction = action;
  client.cancelReview(); renderControls(client.getState());
}
function useOriginal(action, requestId) {
  selectAction(action); formMap.get(action).elements.requestId.value = requestId; client.cancelReview();
  $(sectionFor(action)).scrollIntoView({ block: 'start' }); formMap.get(action).elements.requestId.focus();
}
function buildForms(actions, tabId, formId) {
  for (const [action, meta] of Object.entries(actions)) {
    const tab = node('button', 'action-tab', meta.title); tab.type = 'button'; tab.dataset.action = action;
    tab.setAttribute('aria-controls', `form-${action}`); tab.addEventListener('click', () => selectAction(action)); $(tabId).append(tab);
    const form = node('form', 'action-form'); form.id = `form-${action}`; form.dataset.action = action; form.noValidate = true;
    form.append(node('p', 'form-description', descriptions[action]));
    if (groupFor(action) === 'native') { const binding = node('dl', 'review-values native-binding'); binding.dataset.nativeBinding = 'true'; form.append(binding); }
    const grid = node('div', 'form-grid');
    const keys = action === 'accountPrepare' ? ['requestId', 'kind', 'ownerOperationRef', 'assetId'] : isAccount(action) ? ['requestId']
      : action === 'defiReopen' ? [] : ['defiPrepare', 'defiRequote'].includes(action) ? ['requestId', 'minimumOutput', 'deadline']
      : isDefi(action) ? ['requestId'] : action === 'deposit' || action === 'refund' ? ['requestId', 'intentId'] : action === 'redeem' ? ['requestId', 'amount', 'maxFee'] : ['requestId'];
    for (const key of keys) {
      const label = node('label', 'field');
      const title = node('span', '', key === 'requestId' && (isDefi(action) || ['reconcile', 'resume', 'accountExecute', 'accountReconcile'].includes(action)) ? isDefi(action) ? 'ID del EXIT original confirmado' : 'ID de la solicitud original' : fieldLabels[key]);
      title.dataset.fieldLabel = key; label.append(title);
      const input = node(['kind', 'assetId'].includes(key) ? 'select' : 'input'); input.name = key; input.id = `${action}-${key}`; input.required = true; input.autocomplete = 'off'; input.spellcheck = false;
      if (key === 'kind') for (const [value, label] of [['', 'Selecciona la preparación original'], ['TOP_UP', 'TOP_UP · entrada privada'], ['EXIT', 'EXIT · salida privada'], ['GRAPH', 'GRAPH · preparación original registrada']]) {
        const option = node('option', '', label); option.value = value; input.append(option);
      }
      input.maxLength = key === 'requestId' ? 100 : ['intentId', 'ownerOperationRef', 'assetId'].includes(key) ? 64 : key === 'minimumOutput' ? 39 : 20;
      input.inputMode = ['amount', 'maxFee', 'minimumOutput', 'deadline'].includes(key) ? 'numeric' : 'text';
      input.placeholder = key === 'requestId' ? 'solicitud_original_01' : ['intentId', 'ownerOperationRef'].includes(key) ? '64 caracteres hexadecimales, sin 0x' : 'Entero positivo, sin decimales';
      label.append(input); grid.append(label);
    }
    form.append(grid);
    if (groupFor(action) === 'native') { const amounts = node('dl', 'review-values native-amounts'); amounts.dataset.nativeAmounts = 'true'; form.append(amounts); }
    if (isAccount(action)) { const details = node('dl', 'review-values'); details.dataset.accountDetails = 'true'; form.append(details); }
    const actions = node('div', 'form-actions');
    if (action === 'accountPrepare' || groupFor(action) === 'native' && !['reconcile', 'resume'].includes(action)) {
      const generate = node('button', 'button subtle', 'Crear un ID nuevo'); generate.type = 'button'; generate.dataset.generate = 'true';
      generate.addEventListener('click', () => { client.cancelReview(); if (globalThis.crypto?.randomUUID) form.elements.requestId.value = crypto.randomUUID(); else showText('error', 'Introduce un ID nuevo manualmente; no se pudo generar en este navegador.'); }); actions.append(generate);
    } else if (action !== 'defiReopen') {
      const original = node('button', 'button subtle', 'Usar último ID enviado'); original.type = 'button'; original.dataset.original = 'true';
      original.addEventListener('click', () => { const id = client.getState().originalRequestIds[groupFor(action)]; if (id) { form.elements.requestId.value = id; client.cancelReview(); } }); actions.append(original);
    }
    const review = node('button', 'button primary', 'Revisar operación'); review.type = 'submit'; review.dataset.review = 'true'; actions.append(review); form.append(actions);
    form.append(node('p', 'form-hint', action === 'accountPrepare' ? 'Un ID nuevo corresponde a una preparación nueva. Para continuar PREPARING, conserva su ID y sus términos originales; no crees un reemplazo.'
      : action === 'defiReopen' ? 'Esta acción no usa un ID nuevo y conserva todas las identidades originales.' : isDefi(action) || ['reconcile', 'resume', 'accountExecute', 'accountReconcile'].includes(action)
      ? 'No sustituyas el ID original por uno nuevo para recuperar una acción.'
      : 'Un ID nuevo corresponde a una intención nueva. Ante un resultado desconocido, conserva el anterior y usa Conciliar original.'));
    form.addEventListener('input', () => client.cancelReview());
    form.addEventListener('change', () => client.cancelReview());
    form.addEventListener('submit', event => { event.preventDefault(); try {
      const body = Object.fromEntries(keys.map(key => [key, form.elements[key].value])); client.review(action, body);
    } catch (error) { showText('error', error.message); } });
    formMap.set(action, form); $(formId).append(form);
  }
}
function renderControls(state) {
  for (const tab of [...$('action-tabs').children, ...$('defi-tabs').children, ...$('account-tabs').children]) { const selected = tab.dataset.action === selectedFor(tab.dataset.action); tab.classList.toggle('selected', selected); tab.setAttribute('aria-pressed', String(selected)); tab.disabled = state.sending; }
  for (const [action, form] of formMap) {
    form.hidden = action !== selectedFor(action);
    for (const input of form.querySelectorAll('input,select')) input.disabled = state.sending;
    form.querySelector('[data-review]').disabled = !client.can(action);
    const generate = form.querySelector('[data-generate]'); if (generate) generate.disabled = state.sending
      || action === 'accountPrepare' && Boolean(state.data?.account?.snapshot?.requests.some(row => row.requestId === form.elements.requestId.value));
    const original = form.querySelector('[data-original]'); if (original) original.disabled = state.sending || !state.originalRequestIds[groupFor(action)];
    if (isAccount(action)) {
      const choices = accountAssetChoices(state, action === 'accountPrepare' ? form.elements.kind.value : 'TOP_UP'), selector = form.elements.assetId;
      if (selector && selector.dataset.choices !== JSON.stringify(choices)) {
        const selected = selector.value; selector.replaceChildren();
        const prompt = node('option', '', 'Selecciona la identidad exacta del activo'); prompt.value = ''; selector.append(prompt);
        for (const asset of choices) { const option = node('option', '', `${asset.symbol} · ${asset.assetId}`); option.value = asset.assetId; selector.append(option); }
        selector.value = choices.some(asset => asset.assetId === selected) ? selected : ''; selector.dataset.choices = JSON.stringify(choices);
      }
      const details = form.querySelector('[data-account-details]'); details.replaceChildren();
      let context = null;
      if (action === 'accountPrepare') {
        const original = state.data?.account?.snapshot?.requests.find(row => row.requestId === form.elements.requestId.value);
        context = { kind: form.elements.kind.value || 'TOP_UP o EXIT · elige el original', journalState: original?.state ?? null,
          preparingContinuation: original?.state === 'PREPARING', asset: choices.find(asset => asset.assetId === selector.value) ?? null };
      }
      else try { context = accountActionContext(state, action, { requestId: form.elements.requestId.value }); } catch {}
      if (context) for (const [label, value] of accountReviewDetails(context)) details.append(node('dt', '', label), node('dd', 'mono', value));
      else details.append(node('dt', '', 'Solicitud original'), node('dd', '', 'Introduce un ID existente y consulta su diario; no se infiere el activo'));
    }
    if (groupFor(action) === 'native') {
      const identity = state.nativeIdentityMismatch ? null : originalNativeIdentity(state.data?.nativeClaims);
      const binding = form.querySelector('[data-native-binding]'); binding.replaceChildren();
      for (const [label, value] of nativeIdentityDetails(identity)) binding.append(node('dt', '', label), node('dd', 'mono', value));
      const amounts = form.querySelector('[data-native-amounts]'); amounts.replaceChildren();
      const body = Object.fromEntries([...form.querySelectorAll('input')].map(input => [input.name, input.value]));
      const details = identity ? nativeAmountDetails(action, body, state.data.nativeClaims) : [];
      amounts.hidden = !details.length;
      for (const [label, value] of details) amounts.append(node('dt', '', label), node('dd', 'mono', value));
      for (const key of ['amount', 'maxFee']) {
        const label = form.querySelector(`[data-field-label="${key}"]`);
        if (label) label.textContent = identity
          ? `${key === 'amount' ? `Importe · ${identity.claimSymbol}` : `Comisión máxima · ${identity.nativeSymbol}`} · ${identity.atomicUnit}`
          : `${fieldLabels[key]} · identidad no disponible`;
      }
    }
  }
  const enabled = client.can(selectedAction);
  showText('action-availability', enabled ? '' : state.sending ? 'Enviando una única solicitud. Espera su respuesta.'
    : state.stale ? 'Vista desactualizada. Actualiza manualmente antes de revisar otra acción.'
      : state.reading ? 'Consultando el servicio local…'
        : state.nativeIdentityMismatch ? 'La identidad de la sesión cambió. Las acciones monetarias están bloqueadas; revisa el proceso local y vuelve a abrir la página.'
          : selectedAction !== 'reconcile' && !originalNativeIdentity(state.data?.nativeClaims)
            ? 'Identidad nativa ausente o inconsistente. No se infiere el activo del portafolio; las acciones monetarias están bloqueadas.'
            : 'Esta acción no está habilitada por el servicio o no hay una sesión verificable.');
  showText('defi-availability', client.can(selectedDefiAction) ? '' : state.sending ? 'Solicitud en curso. Espera su resultado.'
    : state.stale ? 'Actualiza manualmente antes de actuar sobre la redención original.' : 'Esta capacidad DeFi no está habilitada o su estado no pudo verificarse.');
  showText('account-availability', client.can(selectedAccountAction) ? '' : state.sending ? 'Solicitud en curso. Espera su resultado.'
    : state.stale ? 'Actualiza manualmente antes de actuar sobre la cuenta original.' : 'La cuenta requiere un diario original disponible, sin trabajos activos de cuenta o claims, y su capacidad explícita.');
  for (const id of ['action-outcome', 'defi-outcome', 'account-outcome']) { $(id).replaceChildren(); $(id).hidden = true; }
  if (isWrappedWithdrawalAction(state.outcome?.action)) return;
  const outcome = $(isAccount(state.outcome?.action) ? 'account-outcome' : isDefi(state.outcome?.action) ? 'defi-outcome' : 'action-outcome'); outcome.hidden = !state.outcome;
  if (state.outcome) {
    outcome.classList.toggle('unknown', state.outcome.state === 'UNKNOWN');
    outcome.append(node('strong', '', state.outcome.state === 'VOLATILE_QUEUE_ACCEPTANCE' ? 'En cola local volátil · puede no ser duradera · ejecución y liquidación no confirmadas'
      : state.outcome.state === 'SERVICE_RESULT' ? `Resultado del servicio · ${readable(state.outcome.phase)}` : state.outcome.state === 'ADMITTED' ? 'Admisión duradera registrada · liquidación no confirmada' : 'Aceptación y resultado desconocidos'),
      node('p', '', ALL_ACTIONS[state.outcome.action].title), node('p', 'mono', state.outcome.requestId ?? 'Servicio original · sin ID nuevo'),
      node('p', 'small', state.outcome.requestId ? 'Este ID se conserva solo en memoria durante esta página. Actualizar el estado no reenvía la acción.' : 'Consulta manualmente el servicio original. No se creó un ID nuevo ni se reenviaron operaciones.'));
    if (!state.outcome.requestId) return;
    const reconcile = node('button', 'button', 'Usar este ID para conciliar'); reconcile.type = 'button'; reconcile.disabled = state.sending;
    reconcile.addEventListener('click', () => useOriginal(isAccount(state.outcome.action) ? 'accountReconcile' : isDefi(state.outcome.action) ? 'defiReconcile' : 'reconcile', state.outcome.requestId)); outcome.append(reconcile);
  }
}
function renderHistory(state, view) {
  $('request-count').textContent = `${view.requests.length} solicitudes recibidas${state.stale ? ' · vista desactualizada' : ''}`;
  const list = $('request-list'); list.replaceChildren();
  for (const request of view.requests) {
    const row = node('article', 'request-row');
    const identity = node('div', 'request-identity'); identity.append(node('h3', '', `${request.source} · ${ACTIONS[request.action]?.title ?? request.action}`), node('p', 'mono', request.requestId));
    if (request.disposition) identity.append(node('p', 'small muted', `Resultado retenido: ${request.disposition}`));
    if (request.errorCode) identity.append(node('p', 'small inline-warning', request.errorCode));
    row.append(identity, badge(request.state));
    if (request.native) {
      const button = node('button', 'button small', 'Conciliar'); button.type = 'button'; button.disabled = !client.can('reconcile');
      button.addEventListener('click', () => useOriginal('reconcile', request.requestId)); row.append(button);
    }
    list.append(row);
  }
  if (!view.requests.length) list.append(empty('No se recibieron solicitudes originales. No se ha creado ni ejecutado una operación desde esta vista.'));
}
function renderAccount(state, view) {
  const visible = Boolean(state.data?.account || state.data?.errors.account || Object.values(ACCOUNT_ACTIONS).some(item => state.data?.capabilities[item.capability]));
  $('account').hidden = !visible; $('account-nav').hidden = !visible;
  $('account-badge').replaceWith(Object.assign(badge(view.accountStatus), { id: 'account-badge' }));
  showText('account-error', state.data?.errors.account ? `Diario de cuenta: ${state.data.errors.account}. Los datos retenidos no autorizan nuevas acciones.` : '');
  const records = $('account-records'); records.replaceChildren();
  for (const entry of view.accountRequests) {
    const row = node('article', 'defi-record'); row.append(node('h4', '', `${entry.kind} · diario original`), node('p', 'mono', entry.requestId), badge(entry.state));
    row.append(node('p', 'footnote', entry.supported ? 'Estado retenido del diario; consulta por separado la disposición de la vista privada. No se deriva de la cola HTTP.' : 'GRAPH no está habilitado desde esta interfaz.'));
    if (entry.errorCode) row.append(node('p', 'inline-warning mono', entry.errorCode));
    if (entry.supported) {
      const actions = node('div', 'form-actions');
      if (entry.state === 'PREPARING') {
        const prepare = node('button', 'button small', 'Continuar preparación original'); prepare.type = 'button'; prepare.disabled = !client.can('accountPrepare');
        prepare.addEventListener('click', () => {
          const form = formMap.get('accountPrepare'); form.elements.kind.value = entry.kind;
          form.elements.ownerOperationRef.value = ''; form.elements.assetId.value = '';
          useOriginal('accountPrepare', entry.requestId);
        }); actions.append(prepare);
      }
      for (const [action, label] of [['accountExecute', 'Revisar ejecución'], ['accountReconcile', 'Conciliar original']]) {
        const button = node('button', 'button small', label); button.type = 'button'; button.disabled = !client.can(action);
        try { accountActionContext(state, action, { requestId: entry.requestId }); } catch { button.disabled = true; }
        button.addEventListener('click', () => useOriginal(action, entry.requestId)); actions.append(button);
      }
      row.append(actions);
    }
    records.append(row);
  }
  if (!view.accountRequests.length) records.append(empty('No hay solicitudes recibidas en el diario original. Un ID de cola ausente aquí no prueba rechazo ni permite crear un reemplazo.'));
  const admissions = $('account-admissions'); admissions.replaceChildren();
  for (const entry of view.accountAdmissions) admissions.append(node('p', 'mono', `${entry.requestId} · ${entry.action} · ${entry.state} · solo estado de procesamiento de la cola local`));
  if (!view.accountAdmissions.length) admissions.append(node('p', 'muted small', 'Sin entradas de cola recibidas. Esta lista es volátil y puede desaparecer.'));
}
function renderTransfers(state, view) {
  const visible = Boolean(view.transfers.length || state.data?.errors.transfers);
  $('transfers').hidden = !visible; $('transfers-nav').hidden = !visible;
  showText('transfers-error', state.data?.errors.transfers ? `Observaciones originales: ${state.data.errors.transfers}. Los datos retenidos son históricos y no establecen un resultado actual.` : '');
  const list = $('transfer-records'); list.replaceChildren();
  const reported = { unobserved: 'Sin observación previa', observed: 'Observado por RPC · estado retenido', pending: 'Pendiente según RPC',
    reverted: 'Revertido según RPC', unknown: 'Desconocido', reorged: 'Reorganización reportada', stale: 'Observación desactualizada' };
  const directions = { outgoing: 'Saliente respecto al titular', incoming: 'Entrante respecto al titular', self: 'Misma dirección de origen y destino' };
  for (const transfer of view.transfers) {
    const card = node('article', 'defi-record'); const heading = node('div', 'card-heading');
    heading.append(node('h3', '', `${transfer.chain} · ${transfer.symbol} · ${directions[transfer.direction]}`),
      node('span', `badge ${transfer.historical ? 'warning' : 'neutral'}`, transfer.historical ? 'Histórico · sin revalidar' : 'Metadatos RPC retenidos · sin revalidar')); card.append(heading);
    card.append(node('p', 'small', `Estado RPC retenido: ${reported[transfer.status]}`), node('p', 'eyebrow', 'IMPORTE DE LA TRANSACCIÓN ORIGINAL'));
    exactAmount(card, transfer.value, `unidades atómicas · ${transfer.symbol} · ${transfer.decimals} decimales`, `${transfer.display} ${transfer.symbol}`);
    const identities = node('dl', 'review-values');
    for (const [label, value] of [['Red completa', transfer.networkId], ['Cadena / chainId', `${transfer.chain} / ${transfer.chainId ?? 'No aplica'}`],
      ['Génesis completo', transfer.genesisHash], ['TX original (nativeId)', transfer.nativeId], ['Desde', transfer.from], ['Hacia', transfer.to],
      ['Titular asociado', transfer.ownerAddress], ['Activo nativo completo', transfer.assetId], ['Compromiso del activo', transfer.assetCommitment],
      [transfer.family === 'tron' ? 'Tipo original' : 'Nonce / tipo original', transfer.family === 'tron'
        ? transfer.transactionType : `${transfer.nonce} / ${transfer.transactionType}`], ['Observado por el host (ms)', transfer.observedAtMs ?? 'No disponible'],
      ['Límite retenido (ms)', transfer.validUntilMs ?? 'No disponible']]) identities.append(node('dt', '', label), node('dd', 'mono', value));
    card.append(identities);
    if (transfer.reason || transfer.errorCode) card.append(node('p', 'inline-warning mono', transfer.reason ?? transfer.errorCode));
    card.append(node('p', 'footnote', 'Fuente: metadatos de observación RPC retenidos. Un límite temporal futuro no verifica finalidad actual. Sin entrega verificada, sin valor retenido verificado, sin crédito privado ni admisión de grafos.'));
    if (transfer.family === 'tron') card.append(node('p', 'footnote',
      'Tron: solidificación reportada por RPC; sin consenso independiente, autorización de permisos, TAPOS ni expiración verificados.'));
    list.append(card);
  }
  if (!view.transfers.length) list.append(empty('No hay metadatos originales disponibles. No se ha inferido ninguna transferencia, importe entregado o saldo.'));
}
function renderExtensions(state, view) {
  const hasNetworks = Boolean(state.data?.networks || state.data?.errors.networks);
  $('networks').hidden = !hasNetworks; $('networks-nav').hidden = !hasNetworks;
  showText('networks-error', state.data?.errors.networks ? `Lecturas externas: ${state.data.errors.networks}. No se infiere ningún saldo.` : '');
  const networks = $('network-cards'); networks.replaceChildren();
  for (const chain of view.networks) {
    const card = node('article', 'native-card'); const heading = node('div', 'card-heading');
    heading.append(node('h3', '', chain.chain), node('span', 'badge neutral', chain.configured ? 'Configurado · no confirma conexión' : 'Sin configurar')); card.append(heading);
    for (const observation of chain.observations) {
      card.append(badge(observation.status)); exactAmount(card, observation.amount, `unidades atómicas · ${observation.symbol}`, observation.display);
      if (Object.hasOwn(observation,'pendingAmount')) {
        exactAmount(card,observation.pendingAmount,'unidades atómicas pendientes · BTC',observation.pendingDisplay);
        card.append(node('p','footnote',`${observation.minimumConfirmations??'?'} confirmaciones mínimas · ${observation.coverage}. No acredita saldo privado gastable`));
      }
      if (observation.block) card.append(node('p', 'small muted', `Bloque reportado: ${observation.block}`));
      if (observation.reason) card.append(node('p', 'inline-warning mono', observation.reason));
    }
    for(const token of chain.tokenObservations??[]){card.append(node('h4','',token.symbol+' · token'),badge(token.status));exactAmount(card,token.amount,'unidades atómicas · '+token.symbol,token.display);card.append(node('p','mono small',token.token));if(token.block)card.append(node('p','small muted','Bloque reportado: '+token.block));if(token.reason)card.append(node('p','inline-warning mono',token.reason));}
    if (!chain.observations.length&&!(chain.tokenObservations?.length)) card.append(node('p', 'muted small', 'Sin observación. Configurar un adaptador no demuestra conexión ni saldo.'));
    card.append(node('p', 'footnote', 'Saldo externo informativo · nunca saldo privado gastable')); networks.append(card);
  }
  if (!view.networks.length) networks.append(empty('No hay lecturas externas disponibles.'));
  const hasDefi = Boolean(state.data?.defi || state.data?.errors.defi || Object.values(DEFI_ACTIONS).some(item => state.data?.capabilities[item.capability]));
  $('defi').hidden = !hasDefi; $('defi-nav').hidden = !hasDefi;
  showText('defi-error', state.data?.errors.defi ? `Redención de vault: ${state.data.errors.defi}. Las operaciones retenidas no son una observación nueva.` : '');
  const operations = $('defi-records'); operations.replaceChildren();
  for (const generation of view.defiGenerations) {
    const row = node('article', 'defi-record');
    row.append(node('h3', '', 'Disponibilidad del diario DeFi original'), badge(generation.status),
      node('p', 'mono small', `Generación original: ${generation.generationId}`),
      node('p', 'mono small', `Share asset: ${generation.shareAssetId}`),
      node('p', generation.journalContentsKnown ? 'small' : 'inline-warning', generation.journalContentsKnown
        ? `Solicitudes leídas en este diario: ${generation.requestCount}`
        : 'Contenido del diario original desconocido. No significa cero operaciones ni ausencia de obligaciones.'),
      node('p', 'footnote', 'La disponibilidad del diario no demuestra salud de la cadena, saldo gastable ni autorización de ejecución.'));
    if (generation.errorCode) row.append(node('p', 'mono small', generation.errorCode));
    operations.append(row);
  }
  for (const operation of view.defiOperations) {
    const row = node('article', 'defi-record'); const heading = node('div', 'card-heading');
    heading.append(node('h3', '', 'EXIT original de shares'), badge(operation.phase)); row.append(heading);
    if (operation.generationId) row.append(node('p', 'mono small', `Generación original: ${operation.generationId}`),
      node('p', 'mono small', `Share asset: ${operation.shareAssetId}`));
    row.append(node('p', 'mono', operation.requestId), node('p', 'small', `Shares: ${operation.shares ?? 'no disponible'} · mínimo de subyacente: ${operation.minimumUnderlying ?? 'no disponible'} · unidades atómicas`),
      node('p', 'small', `Deadline original: ${operation.deadline ?? 'no disponible'} · timestamp de la cadena`),
      node('p', 'small', `Subyacente redimido retenido: ${operation.redeemedUnderlying ?? 'no disponible'} unidades atómicas · dirección externa del titular`),
      node('p', 'footnote', `Observación: ${operation.observation}. Redención pública; underlyingPrivateSpendable: false. ${operation.sendBlocked ? 'Envío bloqueado.' : 'El servidor vuelve a validar antes de enviar.'}`));
    const actions = node('div', 'form-actions');
    for (const [action, label] of [['defiReconcile', 'Conciliar original'], ['defiExecute', 'Revisar ejecución'], ['defiRequote', 'Revisar cotización']]) {
      const button = node('button', 'button small', label); button.type = 'button';
      button.disabled = !client.can(action) || action !== 'defiReconcile' && (operation.phase !== 'READY_TO_REDEEM' || operation.sendBlocked);
      button.addEventListener('click', () => useOriginal(action, operation.requestId)); actions.append(button);
    }
    row.append(actions); operations.append(row);
  }
  if (!view.defiOperations.length) operations.append(empty(view.defiGenerationMode && view.defiJournalsUnknown
    ? 'Contenido de uno o más diarios originales desconocido. No se infieren cero operaciones ni ausencia de obligaciones.'
    : 'Sin redenciones recibidas. Preparar requiere un EXIT original confirmado; esta vista no crea esa salida.'));
}
const wrappedRoles = { change: 'Cambio del titular de origen', recipient: 'Nota del destinatario del payout' };
function wrappedDetails(context) {
  const t = context.terms;
  return [['Autoridad original', wrappedRoles[t.role]], ['Rol de la autoridad', t.actor.kind],
    ['Identidad original', t.actor.identitySHA256], ['Proceso original', t.actor.processIdentitySHA256],
    ['Generación del actor', String(t.actor.generation)], ['Pool original', t.pool],
    ['Activo original', `${safeString(t.asset.symbol)} · ${t.assetId}`], ['Registro del activo', JSON.stringify(t.asset)],
    ['Nota original', t.noteCommitment], ['Importe exacto · unidades atómicas', t.amount],
    ['Destino original fijado', `0x${t.recipient}`], ['Epoch original', t.epoch],
    ['Bloque revisado', `${t.head.number} · ${t.head.hash} · timestamp ${t.head.timestamp}`],
    ['Compromiso del registro', t.registryCommitment], ['Autoridad del claim', t.claimAuthority],
    ['Digest de términos revisados', context.termsSHA256]];
}
function reviewWrapped(action, row) {
  try {
    const requestId = action === 'wrappedWithdrawPrepare' ? globalThis.crypto.randomUUID() : row.requestId;
    client.review(action, { requestId, ...(action === 'wrappedWithdrawPrepare' ? { role: row.terms.role } : {}), termsSHA256: row.termsSHA256 });
  } catch { showText('error', 'No se pudo abrir la revisión exacta. Consulta manualmente el estado original; no se envió ninguna acción.'); }
}
function renderWrappedWithdrawals(state) {
  const section = state.data?.wrappedWithdrawals;
  const visible = Boolean(section || state.data?.errors.wrappedWithdrawals || state.wrappedWithdrawalAttempts?.length);
  $('wrapped-withdrawals').hidden = !visible; $('wrapped-withdrawals-nav').hidden = !visible;
  const stale = state.stale || Boolean(state.data?.errors.wrappedWithdrawals);
  showText('wrapped-withdrawal-error', stale
    ? 'Estado no verificado. Los términos y resultados retenidos son históricos; todas las nuevas firmas y envíos permanecen bloqueados.' : '');
  const records = $('wrapped-withdrawal-records'); records.replaceChildren();
  if (state.wrappedWithdrawalMutationUncertain) records.append(node('p', 'inline-warning',
    'El diario conservó una firma o envío incierto. Esta página mantiene bloqueadas nuevas retiradas en ambos roles; conciliar no demuestra que el receptor permita nuevas mutaciones.'));
  for (const role of ['change', 'recipient']) {
    const rows = section?.snapshot?.operations?.filter(row => row.role === role) ?? [];
    const offers = section?.owner?.offers?.filter(row => row.terms.role === role) ?? [];
    const reapproval=section?.owner?.reviews?.find(value=>value.terms.role===role);
    const row = rows.length === 1 ? rows[0] : null, offer = rows.length === 0 && offers.length === 1 ? offers[0] : null;
    const attempt = state.wrappedWithdrawalAttempts?.find(item => item.role === role);
    const card = node('article', 'defi-record'); card.dataset.wrappedRole = role;
    const heading = node('div', 'card-heading'); heading.append(node('h3', '', wrappedRoles[role]),
      badge(stale ? 'STALE' : row?.state ?? (offer ? 'Términos disponibles' : 'UNKNOWN'))); card.append(heading);
    card.append(node('p', 'footnote', role === 'change'
      ? 'Autoridad: titular de origen, sobre su nota de cambio original.'
      : 'Autoridad separada: destinatario original del GRAPH, sobre su nota de payout.'));
    const context = row ?? offer;
    if (context) {
      const details = node('dl', 'review-values');
      for (const [label, value] of wrappedDetails(context)) details.append(node('dt', '', label), node('dd', 'mono', value));
      card.append(details);
    } else card.append(node('p', 'inline-warning', 'Nota, saldo y capacidad no disponibles. No se infiere saldo cero ni permiso de retirada.'));
    if (row) card.append(node('p', 'mono', `ID original: ${row.requestId}`),
      node('p', 'small', row.transactionHash ? `Transacción original retenida: ${row.transactionHash}` : 'Transacción original no conocida'));
    if (attempt) card.append(node('p', 'mono small', `Último ID enviado desde esta página: ${attempt.requestId}`));
    if(row?.state==='PREPARED'&&row.executionAvailable===false)card.append(node('p','small','Preparación conservada de una sesión anterior. Revisa de nuevo sus mismos importes y destino, o cancela la preparación sin firmar. El ID y la nota originales se conservan.'));
    if (attempt?.uncertain || row && ['EXECUTE_ADMITTED', 'SIGNING_UNKNOWN', 'PROVING', 'PROOF_READY', 'SEND_UNKNOWN', 'UNKNOWN'].includes(row.state))
      card.append(node('p', 'inline-warning', row?.state === 'CONFIRMED'
        ? 'El diario conserva confirmación del original. La respuesta anterior fue incierta; conciliar no habilita otra firma ni elimina el bloqueo del receptor.'
        : 'Resultado original sin resolver. No se permite otra clave, prueba, firma, epoch ni envío. Solo puede conciliarse el envío original cuando su diario lo permita.'));
    if(row?.state==='LOCAL_PROOF_READY')card.append(node('p','small','Se recuperó la autorización original retenida. No se creó otra firma ni se inició un envío. La continuación requiere una revisión explícita del mismo ID.'));
    const resumeExplanation={
      RESUME_ADMITTED:'La revisión original está autorizada. Aún no hay confirmación de retirada. La continuación manual requiere la capacidad exacta del cliente local; esta pantalla no la inicia.',
      RESUME_PROVING:'El cliente local está calculando la prueba de la autorización original. No se ha confirmado una transferencia y no debe crearse otra retirada.',
      RESUME_PROOF_READY:'La prueba original está retenida, pero la retirada aún no está confirmada. Esta pantalla no repite ni inicia su envío.',
      RESUME_PROOF_INTERRUPTED:'El cálculo de la prueba original se interrumpió y su proceso terminó de forma comprobada antes de armar el envío. Solo el cliente local puede solicitar continuar el mismo trabajo bajo las mismas condiciones; no se crea otra firma.'
    };
    if(resumeExplanation[row?.state])card.append(node('p','small',resumeExplanation[row.state]));
    if (row?.errorCode) card.append(node('p', 'inline-warning', 'El servicio conserva un fallo original. Consulta su estado; este fallo no autoriza repetir la operación.'));
    const actions = node('div', 'form-actions');
    const choices = offer ? [['wrappedWithdrawPrepare', 'Revisar preparación', offer]]
      : row&&['PREPARED','CANCELLED'].includes(row.state)?[
        ...(row.state==='PREPARED'&&row.executionAvailable===true?[['wrappedWithdrawExecute','Revisar firma y envío',row]]:[]),
        ...(reapproval?[['wrappedWithdrawReapprove','Volver a revisar el mismo ID',reapproval]]:[]),
        ...(row.state==='PREPARED'?[['wrappedWithdrawCancel','Cancelar preparación sin firma',row]]:[])]
      : row && ['SIGNING_UNKNOWN','PROVING','PROOF_READY','LOCAL_PROOF_READY','SEND_UNKNOWN','UNKNOWN','CONFIRMED'].includes(row.state) ? [['wrappedWithdrawReconcile', 'Revisar conciliación original', row]] : [];
    for (const [action, label, original] of choices) {
      const button = node('button', 'button', label); button.type = 'button'; button.dataset.wrappedAction = action;
      button.disabled = !client.can(action) || !['wrappedWithdrawReconcile','wrappedWithdrawCancel'].includes(action)
        && Boolean(attempt?.uncertain || attempt?.action === action || attempt?.executeAttempted
          || state.wrappedWithdrawalMutationUncertain || state.wrappedWithdrawalAttempts?.some(item => item.uncertain && item.executeAttempted));
      button.addEventListener('click', () => { if (!button.disabled) reviewWrapped(action, original); }); actions.append(button);
    }
    for(const choice of resumeController?.choices(row?.requestId)??[]){const button=node('button','button',choice.title);button.type='button';button.dataset.resumeAction=choice.action;button.disabled=!choice.enabled;button.addEventListener('click',()=>{if(!button.disabled)resumeController.select(choice.action,row.requestId);});actions.append(button);}
    card.append(actions, node('p', 'footnote', 'Saldo privado gastable: desconocido. La salida de esta nota entrega el activo wrapped al destino fijado; no redime BTC o SOL nativo.'));
    records.append(card);
  }
  const resumeState=resumeController?.getState();
  if(resumeState?.review){const r=resumeState.review,panel=node('article','defi-record');panel.dataset.resumeReview='true';panel.append(node('h3','','Revisar recuperación original'),node('p','mono',r.body.requestId));
   const details=node('dl','review-values');for(const [label,value]of wrappedDetails({terms:r.terms,termsSHA256:r.context.termsSHA256}))details.append(node('dt','',label),node('dd','mono',value));panel.append(details);
   if(r.body.resumeSHA256)panel.append(node('p','mono','Consentimiento: '+r.body.resumeSHA256));
   if(r.serverReview?.predecessorAdmissionSHA256)panel.append(node('p','mono','Predecesor conservado: '+r.serverReview.predecessorAdmissionSHA256));
   panel.append(node('p','small','Esta acción usa el ID y la autorización originales. Requiere una capacidad de un solo uso del host local y confirmación explícita. No hay reintentos automáticos.'));
   const label=node('label',''),check=node('input','');check.type='checkbox';check.dataset.resumeConsent='true';label.append(check,node('span','',' He revisado esta acción concreta'));const confirm=node('button','button','Confirmar una vez');confirm.type='button';confirm.dataset.resumeConfirm='true';confirm.disabled=true;
   check.addEventListener('change',()=>{confirm.disabled=!check.checked||!resumeController.canConfirm();});confirm.addEventListener('click',()=>{if(!confirm.disabled)void resumeController.confirm(check.checked);});
   const cancel=node('button','button','Cancelar revisión');cancel.type='button';cancel.dataset.resumeCancel='true';cancel.addEventListener('click',()=>resumeController.cancel());panel.append(label,confirm,cancel,node('p','small',resumeState.grantReady?'Capacidad exacta recibida; falta tu confirmación.':'Esperando capacidad exacta del host local.'));records.append(panel);
  }
  if(resumeState?.outcome){const o=resumeState.outcome;records.append(node('p',o.status==='UNKNOWN'?'inline-warning':'small',o.status==='UNKNOWN'?'Resultado desconocido del ID '+o.requestId+'. No se repetirá. Actualiza manualmente para consultar el original.':o.action.endsWith('Review')?'Revisión obtenida. No se ha autorizado ni enviado otra transferencia.':o.action.endsWith('Admit')?'Consentimiento registrado. No confirma una transferencia; actualiza manualmente.':'El servicio confirmó la retirada original.'));}
  const outcome = $('wrapped-withdrawal-outcome'); outcome.replaceChildren();
  outcome.hidden = !isWrappedWithdrawalAction(state.outcome?.action);
  if (!outcome.hidden) {
    outcome.classList.toggle('unknown', state.outcome.state === 'UNKNOWN');
    outcome.append(node('strong', '', state.outcome.state === 'DURABLE_WRAPPED_WITHDRAWAL_ADMISSION'
      ? 'Admisión duradera registrada · liquidación no confirmada' : 'Aceptación y resultado desconocidos'),
      node('p', '', WRAPPED_WITHDRAWAL_ACTIONS[state.outcome.action].title), node('p', 'mono', state.outcome.requestId),
      node('p', 'small', 'Conserva el ID original. Actualiza manualmente y usa únicamente la conciliación original habilitada en su diario. No hay reintento automático.'));
  }
}
function renderReview(state) {
  const dialog = $('review-dialog');
  if (!state.review) { if (dialog.open) dialog.close(); reviewShown = false; $('review-consent').checked = false; $('confirm-review').disabled = true; return; }
  if (reviewShown) return;
  if (isWrappedWithdrawalAction(state.review.action)) {
    $('confirm-review').textContent = state.review.action === 'wrappedWithdrawPrepare' ? 'Confirmar preparación una vez'
      : state.review.action === 'wrappedWithdrawExecute' ? 'Autorizar firma y envío una vez' : 'Conciliar original una vez';
  } else $('confirm-review').textContent = 'Confirmar y enviar una vez';
  $('review-title').textContent = state.review.title; $('review-values').replaceChildren();
  if (isWrappedWithdrawalAction(state.review.action)) for (const [label, value] of wrappedDetails(state.review.wrappedWithdrawalContext))
    $('review-values').append(node('dt', '', label), node('dd', 'mono', value));
  if (isAccount(state.review.action)) for (const [label, value] of accountReviewDetails(state.review.accountContext))
    $('review-values').append(node('dt', '', label), node('dd', 'mono', value));
  if (groupFor(state.review.action) === 'native') for (const [label, value] of [...nativeIdentityDetails(state.review.nativeIdentity), ...state.review.nativeAmounts])
    $('review-values').append(node('dt', '', label), node('dd', 'mono', value));
  for (const [key, value] of Object.entries(state.review.body)) $('review-values').append(node('dt', '', fieldLabels[key] ?? ({ role: 'Autoridad original', termsSHA256: 'Digest de términos' }[key] ?? key)), node('dd', 'mono', value));
  if (state.review.manualHandoff) {
    const binding = state.review.manualHandoff;
    for (const [label, value] of [['Generación original', binding.binding.generationId],
      ['Cuenta original', binding.binding.accountIdentitySHA256], ['Listener original', binding.listenerId],
      ['Bloque revisado', binding.head ? `${binding.head.blockNumber} · ${binding.head.blockHash} · timestamp ${binding.head.timestamp}`
        : 'Sin observación actual; solo conciliación o recuperación original']])
      $('review-values').append(node('dt', '', label), node('dd', 'mono', value));
  }
  if (state.review.exactActionReview) {
    const original = state.review.exactActionReview;
    for (const [label, value] of [['Servicio original', original.origin], ['Listener original', original.listenerId]])
      $('review-values').append(node('dt', '', label), node('dd', 'mono', value));
  }
  $('review-notes').replaceChildren(...state.review.notes.map(note => node('p', '', note)));
  $('review-consent').checked = false; $('confirm-review').disabled = true; reviewShown = true; dialog.showModal();
}
function render(state) {
  resumeController?.observe(state);
  const view = projectWalletState(state.data, state);
  const connection = !state.data || state.data.connection !== 'CONNECTED' ? state.data?.connection ?? 'DISCONNECTED' : state.stale ? 'STALE' : 'CONNECTED';
  $('connection-label').textContent = readable(connection); $('connection-dot').classList.toggle('connected', connection === 'CONNECTED');
  $('connection-badge').replaceWith(Object.assign(badge(connection), { id: 'connection-badge' }));
  $('refresh').disabled = state.reading || state.sending; $('refresh').textContent = state.reading ? 'Consultando…' : '↻ Actualizar estado';
  $('updated-at').textContent = state.lastUpdated === null ? 'Todavía sin consulta válida' : `Última consulta: ${new Date(state.lastUpdated).toLocaleString('es-ES')}`;
  showText('error', state.error);
  showText('notice', state.reading ? 'Consultando una vez el estado original…' : state.stale && state.data
    ? 'Vista desactualizada. Los datos visibles son históricos; usa Actualizar estado para verificarlos. No se ejecuta ni se reenvía nada al consultar.'
    : state.data?.connection === 'DISCONNECTED' ? 'No hay sesiones originales conectadas a esta interfaz. Los formularios permanecerán deshabilitados hasta que el host vincule sus capacidades originales.'
    : state.data?.connection === 'UNAVAILABLE' ? 'El servicio original no está disponible. No se puede verificar ni ejecutar una acción.'
    : state.portfolioStale || state.nativeStale || state.accountStale || state.networksStale || state.defiStale || state.transfersStale ? 'Vista parcial. Una sección no pudo verificarse; sus últimos datos se identifican como desactualizados.' : '');
  renderPortfolio(state, view); renderNative(state, view); renderAccount(state, view); renderTransfers(state, view); renderExtensions(state, view); renderControls(state); renderWrappedWithdrawals(state); renderHistory(state, view); renderReview(state);
}
buildForms(ACTIONS, 'action-tabs', 'action-forms');
buildForms(DEFI_ACTIONS, 'defi-tabs', 'defi-forms');
buildForms(ACCOUNT_ACTIONS, 'account-tabs', 'account-forms');
$('refresh').addEventListener('click', () => { void client.refresh(); });
$('close-review').addEventListener('click', () => client.cancelReview());
$('cancel-review').addEventListener('click', () => client.cancelReview());
$('review-dialog').addEventListener('close', () => { if (client.getState().review) client.cancelReview(); });
globalThis.addEventListener('pagehide', () => {client.disconnectWrappedWithdrawalHost();resumeController?.disconnect();});
$('review-dialog').addEventListener('cancel', event => { event.preventDefault(); client.cancelReview(); });

client.subscribe(render);
bindManualActionConsent({ client, consent: $('review-consent'), confirm: $('confirm-review'), status: $('handoff-status'), page: globalThis });
// Initial read only. No scheduled polling, focus handlers, visibility handlers or route changes refresh this view.
void client.refresh();
