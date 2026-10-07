/** Actual browser consent wiring, injectable DOM ports for interruption tests.
 * No host discovery, postMessage, storage, polling, signing or token display. */
export function bindManualActionConsent({ client, consent, confirm, status, page }) {
  let previous = null, armed = false;
  const unsubscribe = client.subscribe(state => {
    const key = state.review ? JSON.stringify({ revision: state.revision, review: state.review, grantReady: state.exactGrantReady }) : null;
    if (key !== previous || !state.review) { consent.checked = false; armed = false; previous = key; }
    confirm.disabled = !armed || !client.canConfirm();
    if (status) status.textContent = !state.review?.manualHandoff && !state.review?.wrappedWithdrawalReview ? '' : state.exactGrantReady
      ? 'Capacidad exacta recibida. Revisa los términos y confirma ahora; solo puede usarse una vez.'
      : state.review?.wrappedWithdrawalReview
        ? 'Revisión sin permiso de envío. Preparar, ejecutar y conciliar necesitan cada uno una capacidad exacta distinta del listener original. El permiso de cuenta no sirve para esta salida.'
        : 'Revisión sin permiso de envío. El host local original debe autorizar y entregar una capacidad exacta para esta revisión.';
  });
  const onChange = () => {
    armed = Boolean(consent.checked && client.canConfirm());
    if (!armed) consent.checked = false;
    confirm.disabled = !armed;
  };
  const onConfirm = () => {
    if (!armed || !consent.checked || !client.canConfirm()) return;
    armed = false; consent.checked = false; confirm.disabled = true; void client.confirm();
  };
  const onLeave = () => client.disconnectManualActionHost();
  consent.addEventListener('change', onChange); confirm.addEventListener('click', onConfirm);
  page?.addEventListener('pagehide', onLeave);
  return () => { unsubscribe(); consent.removeEventListener('change', onChange); confirm.removeEventListener('click', onConfirm);
    page?.removeEventListener('pagehide', onLeave); client.disconnectManualActionHost(); };
}
