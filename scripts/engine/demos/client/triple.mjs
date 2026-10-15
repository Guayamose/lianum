const token = document.querySelector('meta[name="local-token"]').content;
const el = id => document.getElementById(id);
const labels = { OFF: 'Sin iniciar', READY: 'Tres nodos preparados', LOCKED: 'EVM retenido', SOL_OBSERVED: 'SOL observado, falta certificar', SOL_CONFIRMED: 'SOL finalizado', BTC_PENDING: 'BTC pendiente', BTC_CONFIRMED: 'BTC confirmado', PAID: 'EVM pagado', EXPIRED: 'Plazo vencido', REFUNDED: 'EVM recuperado', QUARANTINED: 'Revisión necesaria' };
let state, sending = false, polling = false;
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'X-Local-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(10000) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
}
function render() {
  el('triple-status').textContent = labels[state.status] ?? state.status;
  el('triple-progress').textContent = state.progress;
  const stale = chain => state.balances?.[chain + 'Stale'] ? ' (sin actualizar)' : '';
  el('triple-held').textContent = `${state.balances?.escrowWei ?? '?'} wei${stale('evm')}`;
  el('triple-sol').textContent = `${state.balances?.recipientLamports ?? '?'} lamports${stale('solana')}`;
  el('triple-btc').textContent = `${state.balances?.recipientSatoshi ?? '?'} sats${stale('bitcoin')}`;
  for (const b of document.querySelectorAll('[data-triple]')) b.disabled = sending || state.busy || !state.allowedActions.includes(b.dataset.triple);
  const o = state.operation;
  el('triple-outcome').textContent = o?.terminalDecision === 'PAID' ? `Pago EVM confirmado: ${o.solverRewardWei} wei. Las entregas se observaron en cadenas locales; el observador sigue siendo de confianza.` : o?.terminalDecision === 'REFUNDED' ? 'EVM devuelto. No revierte ninguna entrega SOL/BTC; el solver no cobró este pago. Consulta la frescura de cada observación.' : 'El pago exige el padre SOL exacto y la entrega BTC derivada con seis confirmaciones. Vencer y devolver EVM no revierte entregas.';
  el('triple-evidence').textContent = JSON.stringify({ profile: state.profile, operation: o, observations: state.observations, transactions: state.nativeTransactions?.map(t => ({ action: t.label, hash: t.receipt.transactionHash, status: t.receipt.status })), limitations: state.limitations, error: state.lastError, lastClientRefreshAt: state.lastClientRefreshAt }, null, 2);
}
async function refresh() {
  if (polling) return; polling = true;
  try { state = await api('/api/triple'); render(); }
  catch { el('triple-progress').textContent = 'No se pudo consultar. No repitas un envío; recupera la conexión primero.'; for (const b of document.querySelectorAll('[data-triple]')) b.disabled = true; }
  finally { polling = false; }
}
for (const b of document.querySelectorAll('[data-triple]')) b.addEventListener('click', async () => {
  if (sending || state?.busy) return; sending = true; if (state) render();
  try { state = await api('/api/triple/action', { method: 'POST', body: JSON.stringify({ action: b.dataset.triple }) }); }
  catch (e) { el('triple-progress').textContent = `Acción no confirmada (${e.message}). Consulta antes de repetir.`; }
  finally { sending = false; await refresh(); }
});
setInterval(refresh, 1200); refresh();
