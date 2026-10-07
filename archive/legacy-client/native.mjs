import { nativeOutcome } from './native-outcome.mjs';
const token = document.querySelector('meta[name="local-token"]').content;
const el = id => document.getElementById(id);
const labels = { OFF: 'Sin iniciar', READY: 'Entorno preparado', LOCKED: 'EVM retenido', BTC_PENDING: 'Bitcoin pendiente', BTC_CONFIRMED: 'Bitcoin confirmado localmente', PAID: 'Pago EVM ejecutado', EXPIRED: 'Plazo vencido', REFUNDED: 'EVM recuperado', QUARANTINED: 'Revisión necesaria' };
let current, sending = false, polling = false;
const text = (id, value) => { el(id).textContent = value; };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, cache: 'no-store', headers: { 'X-Local-Token': token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(10000) });
  const body = await response.json(); if (!response.ok) throw new Error(body.error); return body;
}
function render() {
  text('native-status', labels[current.status] || current.status); text('native-progress', current.progress);
  text('native-held', current.balances ? `${current.balances.escrowWei ?? '?'} wei${current.balances.evmStale ? ' (consulta pendiente)' : ''}` : 'Sin reserva');
  text('native-received', current.balances ? `${current.balances.recipientSatoshi ?? '?'} sats${current.balances.bitcoinStale ? ' (consulta pendiente)' : ''}` : 'Sin entrega');
  text('native-reward', `${current.operation?.solverRewardWei || '0'} wei`);
  text('native-authority', current.operation ? `${current.operation.reference.authority} / ${current.operation.reservation?.state || 'PENDIENTE'}` : 'El contrato se despliega al preparar el entorno.');
  text('native-privacy', 'Esta operación es pública y confía en un observador local. La wallet privada sigue pendiente.');
  for (const button of document.querySelectorAll('[data-native]')) button.disabled = sending || current.busy || !current.allowedActions.includes(button.dataset.native);
  const op = current.operation;
  text('native-outcome', nativeOutcome(current));
  text('native-evidence', JSON.stringify({ profile: current.profile, source: current.balances?.source, solana: current.capabilities.solana, reservation: op?.reference, authorization: op?.authorization, bitcoin: op?.bitcoin, evmTransactions: current.nativeTransactions?.map(t => ({ action: t.label, hash: t.receipt.transactionHash, status: t.receipt.status })), observations: current.observations, lastClientRefreshAt: current.lastClientRefreshAt, error: current.lastError }, null, 2));
}
async function refresh() {
  if (polling) return; polling = true;
  try { current = await api('/api/native'); render(); }
  catch { text('native-progress', 'No se pudo consultar el entorno. No repitas un envío; recupera la conexión primero.'); for (const b of document.querySelectorAll('[data-native]')) b.disabled = true; }
  finally { polling = false; }
}
for (const button of document.querySelectorAll('[data-native]')) button.addEventListener('click', async () => {
  if (sending || current?.busy) return; sending = true; if (current) render();
  try { current = await api('/api/native/action', { method: 'POST', body: JSON.stringify({ action: button.dataset.native }) }); }
  catch (e) { text('native-progress', `Acción no confirmada (${e.message}). Consulta el estado antes de repetir.`); }
  finally { sending = false; await refresh(); }
});
setInterval(refresh, 1200); refresh();
