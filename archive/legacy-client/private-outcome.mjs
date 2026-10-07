// Pure presentation of public records. Never infers current balances or recovery
// key availability from a historical successful claim.
export const PRIVATE_PROFILE = Object.freeze({ id: 'PC18_EXACT_LOCAL_V1', fundingWei: '1000000000000000', lamports: '3000000', sats: '100000', solCompensationWei: '500000000000000', btcCompensationWei: '500000000000000', realFunds: false });
export const privatePhaseLabels = Object.freeze({
  PREPARED: 'Preparada', QUEUED: 'Inicio aceptado', PREPARING: 'Preparando entorno', FUNDING: 'Reserva EVM', AUTHORIZING: 'Reteniendo autorización',
  OWNER_RELEASED: 'Propietario detenido', SOL_PENDING: 'Entrega SOL en curso', SOL_FINALIZED: 'SOL finalizado', BTC_PENDING: 'Entrega BTC en curso',
  RECOVERABLE: 'Retiradas pendientes de recuperar', RECOVERING: 'Recuperando retiradas',
  REFUNDABLE: 'Devolución pendiente de gestionar', REFUNDING: 'Devolución al propietario en curso', REFUNDED: 'Devolución al propietario registrada',
  BTC_CONFIRMED: 'BTC confirmado', SETTLING: 'Prueba global y pago', WITHDRAWING: 'Retirando compensaciones', COMPLETED: 'Pago completado', FAILED: 'Revisión necesaria', INTERRUPTED: 'Conexión con el motor no disponible',
});
export const PRIVATE_ENGINE_UNAVAILABLE = 'La conexión con el motor no está disponible. Se conserva el estado conocido; no se reanuda ni se reenvía automáticamente.';
export function privateStorageErrorLabel(code) {
  if (code === 'PRIVATE_SESSION_ALREADY_OPEN') return 'Otro coordinador local tiene el control del registro de operaciones. Esta vista es de solo lectura; la ejecución puede seguir en el otro servidor.';
  return 'El almacén local requiere revisión. Se muestran los últimos datos disponibles; los nuevos inicios, las devoluciones y las recuperaciones están bloqueados.';
}
export const privateOwnerLabels = Object.freeze({ PREPARING: 'Preparando autorización', PACKAGES_ACKNOWLEDGED: 'Autorización retenida por los tres roles', EXIT_CONFIRMED: 'Salida del proceso confirmada' });
const terminal = new Set(['COMPLETED', 'REFUNDED', 'FAILED', 'INTERRUPTED']);
const amount = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value).toLocaleString('es-ES') : 'importe sin verificar';
export const PRIVATE_OWNER_REFUND_DEFAULT = Object.freeze({ state: 'NONE', amountWei: null, claimEpoch: null, eligibleAt: null });
const ownerRefundFlow = operation => Boolean(operation?.ownerRefund?.state && operation.ownerRefund.state !== 'NONE' || ['REFUNDABLE', 'REFUNDING', 'REFUNDED'].includes(operation?.phase) || operation?.settlementState === 'RECOVERY_NOTE_ISSUED');
const refundConsequences = ' Las entregas SOL/BTC ya realizadas no se deshacen. Esta devolución no acredita el pago de las compensaciones a los ejecutores; consúltalas por separado.';
export const privatePhaseLabel = value => privatePhaseLabels[value] ?? 'Estado no reconocido; consulta pendiente';

export function privatePayoutLabel(payout, operation) {
  if (payout?.state === 'PENDING' && operation?.settlementState === 'RECOVERY_NOTE_ISSUED') return 'Sin compensación: la reserva se destinó a la devolución al propietario';
  if (payout?.state === 'WITHDRAWN') return payout.amountWei == null ? 'Retirada registrada; importe sin verificar' : `${amount(payout.amountWei)} wei retirados`;
  if (payout?.state === 'ISSUED') return 'Nota emitida; retirada pendiente';
  return 'Pendiente de emisión y retirada';
}
export function privateOutcome(operation) {
  if (!operation) return 'Todavía no hay una operación privada preparada.';
  const history = operation.observation === 'RETAINED_HISTORY' ? 'Registro histórico conservado; no es una consulta actual de las cadenas ni un saldo gastable. ' : '';
  if (ownerRefundFlow(operation)) {
    const refund = operation.ownerRefund ?? PRIVATE_OWNER_REFUND_DEFAULT;
    if (refund.state === 'WITHDRAWN') return history + (refund.amountWei === PRIVATE_PROFILE.fundingWei ? 'Devolución al propietario registrada: se retiraron 0,001 ETH ficticios de la nota de recuperación.' : 'Consta una retirada al propietario, pero su importe no está verificado.') + refundConsequences;
    if (refund.state === 'UNKNOWN') return history + 'El envío de la devolución puede haberse realizado, pero su resultado no está confirmado. No consta una retirada EVM al propietario. Solo se consulta para conciliar; no se autoriza otro envío de devolución.' + refundConsequences;
    if (refund.state === 'UNAVAILABLE') return history + (operation.settlementState === 'RECOVERY_NOTE_ISSUED' ? 'Se emitió la nota de recuperación, pero no consta su retirada al propietario. ' : 'No consta una retirada EVM al propietario. ') + 'La autoridad de devolución se perdió o dejó de estar disponible; se requiere conciliación manual.' + refundConsequences;
    if (refund.state === 'NOTE_ISSUED' || operation.settlementState === 'RECOVERY_NOTE_ISSUED') return history + 'Se emitió la nota de recuperación autorizada. No consta una retirada EVM al propietario. La nota emitida no es una devolución cobrada; recuperarla requiere autoridad viva y una acción explícita.' + refundConsequences;
    if (['WAITING', 'ELIGIBLE'].includes(refund.state)) return history + (refund.amountWei === PRIVATE_PROFILE.fundingWei ? 'Presupuesto autorizado para devolución: 0,001 ETH ficticios. ' : 'El importe autorizado para devolución sigue sin verificar. ') + 'Aún no consta una nota de recuperación emitida ni una retirada al propietario. El servicio comprueba el plazo autenticado antes de enviar la devolución.' + refundConsequences;
    return history + 'El estado de devolución no acredita una retirada al propietario. Consulta el registro y la autoridad vigente antes de continuar.' + refundConsequences;
  }
  const withdrawn = ['sol', 'btc'].filter(role => operation.payouts?.[role]?.state === 'WITHDRAWN').length;
  const exactWithdrawals = ['sol', 'btc'].every(role => operation.payouts?.[role]?.state === 'WITHDRAWN' && operation.payouts[role].amountWei === PRIVATE_PROFILE[`${role}CompensationWei`]);
  if (operation.settlementState === 'PAYOUT_NOTES_ISSUED') {
    if (operation.phase === 'COMPLETED' && exactWithdrawals) return history + 'Pago privado completado: ambas compensaciones de 0,0005 ETH ficticio fueron retiradas. Son pagos a los ejecutores, no una devolución al propietario.';
    const recovery = operation.recoveryState === 'UNAVAILABLE' ? ' La recuperación de estas retiradas no está disponible; se requiere conciliación manual del estado retenido.' : ['RECOVERABLE', 'RECOVERING'].includes(operation.phase) ? ' Las notas retenidas son compensaciones pendientes, no importes ya retirados ni una devolución al propietario.' : '';
    return history + `El contrato emitió las notas de pago. Compensaciones con retirada registrada: ${withdrawn} de 2. La emisión del pago ya registrada no se revierte si una retirada queda pendiente.${recovery}`;
  }
  if (operation.settlementState === 'UNKNOWN' || Object.values(operation.exposure ?? {}).some(value => value === 'MAY_HAVE_SUBMITTED' || value === 'SIGNED_RETAINED')) return history + 'Puede existir una transacción firmada o enviada cuyo resultado no está confirmado. Se conserva su exposición; no se reenviará automáticamente ni se supone una devolución.';
  if (operation.phase === 'INTERRUPTED' || operation.engineState === 'INTERRUPTED') return history + PRIVATE_ENGINE_UNAVAILABLE;
  if (operation.phase === 'FAILED') return history + 'La ejecución requiere revisión. El fallo no demuestra una devolución ni revierte posibles entregas SOL/BTC.';
  if (operation.settlementState === 'FUNDED') return history + 'Reserva EVM registrada. El pago exige el resultado completo y las pruebas del perfil autorizado; las entregas ya realizadas no se revierten.';
  return history + 'No consta una reserva EVM confirmada. Iniciar autoriza una ejecución del perfil local revisado; preparar no envía fondos.';
}
export function privateCleanupLabel(operation, { connected = true } = {}) {
  if (operation?.cleanupState === 'FAILED') return 'Atención: la limpieza de los procesos locales requiere revisión. Esto no cambia los pagos ya registrados.';
  if (operation?.cleanupState === 'RUNNING') return 'Cerrando los procesos locales de esta ejecución.';
  if (operation?.cleanupState === 'RETAINED' && (!connected || operation.observation !== 'LIVE' || operation.recoveryState === 'UNAVAILABLE' || operation.ownerRefund?.state === 'UNAVAILABLE')) return 'La retención de los procesos consta en el último registro, pero no confirma que el pool o el custodio sigan vivos. No se supone ninguna retirada; si se perdió la autoridad se requiere conciliación manual.';
  if (operation?.cleanupState === 'RETAINED' && ownerRefundFlow(operation)) return 'El pool local y el custodio se retienen para la devolución. El límite se deriva del plazo original autenticado más un margen acotado para la prueba, con un techo total de tres horas para este perfil. La fecha estimada no garantiza autoridad viva. Perder nodos o custodio, o reiniciar el sistema operativo, exige conciliación manual; no se reanuda la ejecución.';
  if (operation?.cleanupState === 'RETAINED') return 'El pool local y el custodio de las notas permanecen activos para recuperar las retiradas. La autoridad se conserva como máximo 30 minutos en espera; al perderla se requiere conciliación manual. Las notas retenidas no son fondos ya retirados.';
  if (operation?.cleanupState === 'COMPLETED') return 'Procesos locales cerrados; se conserva el historial de la operación.';
  return 'Los procesos locales se cerrarán al terminar; el navegador puede desconectarse.';
}
export function privateRecoveryLabel(operation, { connected = true } = {}) {
  if (['AVAILABLE', 'RUNNING'].includes(operation?.recoveryState) && (!connected || operation.observation !== 'LIVE')) return 'El último registro conserva el estado de recuperación, pero no hay conexión actual verificada con su autoridad. Actualiza para consultar; no se inicia ni se repite ninguna retirada automáticamente.';
  if (operation?.recoveryState === 'AVAILABLE') return 'Recuperar retiradas reinicia únicamente el trabajador de compensaciones con el mismo pool y custodio activos. No vuelve a entregar SOL/BTC ni recupera EVM para el propietario. La disponibilidad depende del custodio actual y puede vencer antes de 30 minutos.';
  if (operation?.recoveryState === 'RUNNING') return 'Recuperación de retiradas en curso. Se consulta cada nota y solo se retira la compensación pendiente; las retiradas ya registradas y las entregas SOL/BTC no se repiten.';
  if (operation?.recoveryState === 'COMPLETED') return 'Recuperación de retiradas registrada. Consulta por separado las compensaciones confirmadas; no equivale a una devolución al propietario.';
  if (operation?.recoveryState === 'UNAVAILABLE') return 'Ya no hay autoridad viva confirmada para recuperar estas retiradas. Se requiere conciliación manual; el historial no acredita una nueva retirada. Reiniciar nodos, custodio o sistema operativo no restablece esta autoridad.';
  return 'La recuperación de retiradas no está disponible para esta operación.';
}
export function privateOwnerRefundLabel(operation, { connected = true } = {}) {
  const refund = operation?.ownerRefund ?? PRIVATE_OWNER_REFUND_DEFAULT;
  if (refund.state === 'WITHDRAWN') return refund.amountWei === PRIVATE_PROFILE.fundingWei ? `${amount(refund.amountWei)} wei de devolución retirados al propietario. Es un resultado registrado, no un saldo gastable actual.` : 'Retirada al propietario registrada; importe sin verificar.';
  if (refund.state === 'UNAVAILABLE') return 'No hay autoridad viva para la devolución. Se requiere conciliación manual; el historial y el plazo estimado no prueban una retirada. Reiniciar nodos, custodio o sistema operativo no restablece esta autoridad.';
  const history = !connected || operation?.observation !== 'LIVE' ? 'El último registro no confirma autoridad viva en este momento. Actualiza para consultar; no se inicia ni se repite ninguna devolución automáticamente. ' : '';
  if (refund.state === 'UNKNOWN') return history + 'Resultado de emisión de devolución desconocido. Puede existir un envío pendiente; solo se consulta para conciliar, sin autorizar otra devolución. Si se confirma la nota, el servicio podrá ofrecer Recuperar devolución.';
  if (refund.state === 'NOTE_ISSUED' || operation?.settlementState === 'RECOVERY_NOTE_ISSUED') return history + 'Nota de recuperación emitida; retirada al propietario pendiente de confirmar. Recuperar devolución solo consulta o retira esa misma nota con autoridad viva, sin repetir entregas SOL/BTC.';
  const estimate = refund.eligibleAt ? ` Plazo estimado: ${refund.eligibleAt}. Es orientativo; el reloj del navegador no autoriza la devolución.` : ' Sin fecha estimada; solo el servicio verifica el plazo autenticado.';
  if (refund.state === 'WAITING') return history + 'Presupuesto de devolución autorizado, sin nota emitida ni retirada registrada. Solicitar devolución puede aceptarse antes del plazo; el servicio esperará al corte autenticado antes de enviar.' + estimate;
  if (refund.state === 'ELIGIBLE') return history + 'El servicio registra el plazo cumplido, pero todavía no consta una nota ni una retirada. Solo la acción habilitada por el servicio permite solicitar la devolución.' + estimate;
  return history + 'No consta una devolución al propietario ni autoridad para solicitarla.';
}
export function privateControls(snapshot, operation, { connected = false, sending = false, storageReady = true, pending = null } = {}) {
  const safe = connected && storageReady && !sending && snapshot && !snapshot.storageError;
  const active = snapshot?.operations?.some(item => !terminal.has(item.phase)) || Boolean(snapshot?.activeOperationId);
  const refundSafe = safe && snapshot.capabilities?.recoveryWithdrawal === true && operation?.phase === 'REFUNDABLE' && operation.observation === 'LIVE' && operation.cleanupState === 'RETAINED' && (!snapshot.activeOperationId || snapshot.activeOperationId === operation.id);
  const allowsRefund = action => refundSafe && operation.allowedActions?.includes(action) && (!pending || pending.action === action && pending.operationId === operation.id);
  return {
    prepare: Boolean(safe && !snapshot.busy && !active && (!pending || pending.action === 'prepare')),
    recover: Boolean(safe && snapshot.capabilities?.payoutWorkerRestart === true && operation?.phase === 'RECOVERABLE' && operation.recoveryState === 'AVAILABLE' && operation.observation === 'LIVE' && operation.cleanupState === 'RETAINED' && operation.settlementState === 'PAYOUT_NOTES_ISSUED' && operation.allowedActions?.includes('recover') && (!snapshot.activeOperationId || snapshot.activeOperationId === operation.id) && (!pending || pending.action === 'recover' && pending.operationId === operation.id)),
    start: Boolean(safe && !snapshot.busy && operation?.phase === 'PREPARED' && operation.engineState === 'IDLE' && operation.allowedActions?.includes('start') && (!snapshot.activeOperationId || snapshot.activeOperationId === operation.id) && (!pending || pending.action === 'start' && pending.operationId === operation.id)),
    refund: Boolean(allowsRefund('refund') && ['WAITING', 'ELIGIBLE'].includes(operation.ownerRefund?.state)),
    recoverRefund: Boolean(allowsRefund('recoverRefund') && operation.ownerRefund?.state === 'NOTE_ISSUED' && operation.settlementState === 'RECOVERY_NOTE_ISSUED'),
  };
}
export function privatePublicDetails(operation) {
  // Explicit projection even if a future API accidentally appends private data.
  if (!operation) return null;
  const payout = role => ({ state: operation.payouts?.[role]?.state, amountWei: operation.payouts?.[role]?.amountWei });
  const refund = operation.ownerRefund ?? PRIVATE_OWNER_REFUND_DEFAULT;
  return { id: operation.id, profile: operation.profile, revision: operation.revision, phase: operation.phase, engineState: operation.engineState, ownerState: operation.ownerState, settlementState: operation.settlementState,
    exposure: Object.fromEntries(['evm', 'sol', 'btc'].map(role => [role, operation.exposure?.[role]])), payouts: { sol: payout('sol'), btc: payout('btc') }, ownerRefund: { state: refund.state, amountWei: refund.amountWei, claimEpoch: refund.claimEpoch, eligibleAt: refund.eligibleAt }, cleanupState: operation.cleanupState, recoveryState: operation.recoveryState ?? 'NONE',
    errorCode: typeof operation.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,100}$/.test(operation.errorCode) ? operation.errorCode : null, observation: operation.observation, updatedAt: operation.updatedAt,
    browserReconnect: true, executionRestart: false, payoutWorkerRestart: true, recoveryWithdrawal: true, fullAcceptance: false };
}
export function privateProgressSteps(operation) {
  const steps = [
    ['Entorno y preparación de prueba', ['QUEUED', 'PREPARING']], ['Autorización y salida del propietario', ['AUTHORIZING', 'OWNER_RELEASED']], ['Reserva EVM protegida', ['FUNDING']],
    ['Entrega SOL', ['SOL_PENDING', 'SOL_FINALIZED']], ['Entrega BTC', ['BTC_PENDING', 'BTC_CONFIRMED']], ['Prueba global y notas de pago', ['SETTLING']], ['Retiradas de compensación', ['WITHDRAWING', 'RECOVERING']],
  ];
  const at = steps.findIndex(([, phases]) => phases.includes(operation?.phase));
  const refundFlow = ownerRefundFlow(operation);
  const result = steps.map(([label], index) => {
    let state = at >= 0 ? index < at ? 'complete' : index === at ? 'current' : 'pending' : 'pending';
    // Funding and owner closure are facts, not an assumption based on row order.
    // This also renders retained records from the earlier funding-first flow.
    if (index === 1) state = operation?.ownerState === 'EXIT_CONFIRMED' ? 'complete' : ['AUTHORIZING', 'OWNER_RELEASED'].includes(operation?.phase) ? 'current' : 'pending';
    if (index === 2) state = ['FUNDED', 'PAYOUT_NOTES_ISSUED', 'RECOVERY_NOTE_ISSUED'].includes(operation?.settlementState) ? 'complete' : operation?.phase === 'FUNDING' ? 'current' : 'pending';
    if (operation?.phase === 'COMPLETED') state = 'complete';
    if (refundFlow || (terminal.has(operation?.phase) && operation.phase !== 'COMPLETED') || ['RECOVERABLE', 'RECOVERING'].includes(operation?.phase)) {
      const verified = [false, operation.ownerState === 'EXIT_CONFIRMED', ['FUNDED', 'PAYOUT_NOTES_ISSUED', 'RECOVERY_NOTE_ISSUED'].includes(operation.settlementState), operation.exposure?.sol === 'OBSERVED', operation.exposure?.btc === 'OBSERVED', operation.settlementState === 'PAYOUT_NOTES_ISSUED', ['sol', 'btc'].every(role => operation.payouts?.[role]?.state === 'WITHDRAWN')];
      state = verified[index] ? 'complete' : index === 6 && operation.phase === 'RECOVERING' ? 'current' : 'unknown';
    }
    return { label, state };
  });
  if (refundFlow) {
    const refund = operation.ownerRefund ?? PRIVATE_OWNER_REFUND_DEFAULT;
    const issued = operation.settlementState === 'RECOVERY_NOTE_ISSUED' || ['NOTE_ISSUED', 'WITHDRAWN'].includes(refund.state);
    result.push({ label: 'Plazo y nota de devolución', state: issued ? 'complete' : operation.phase === 'REFUNDING' && ['WAITING', 'ELIGIBLE'].includes(refund.state) ? 'current' : 'unknown' });
    result.push({ label: 'Retirada al propietario', state: refund.state === 'WITHDRAWN' ? 'complete' : operation.phase === 'REFUNDING' && refund.state === 'NOTE_ISSUED' ? 'current' : 'unknown' });
  }
  return result;
}
