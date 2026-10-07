export function nativeOutcome(state) {
  const op = state.operation;
  if (!op?.terminalDecision) return 'El pago requiere comprobar la entrega Bitcoin exacta. Firmar o enviar no demuestra confirmación.';
  const prefix = op.terminalDecision === 'REFUNDED' ? 'Devolución EVM confirmada; el solver no cobró EVM.' : 'Pago EVM confirmado por el contrato.';
  const btc = op.bitcoin;
  if (!btc) return `${prefix} No hay transacción Bitcoin firmada registrada.`;
  const freshness = state.observations?.bitcoin?.delivery;
  const when = btc.observedAt ? ` Observación BTC: ${btc.observedAt}.` : '';
  const cached = freshness?.status !== 'OBSERVED' ? ' El estado actual de Bitcoin no se ha actualizado; la exposición sigue pendiente de verificar.' : '';
  let detail;
  switch (btc.transactionState) {
    case 'SIGNED': detail = 'Hay una transacción firmada; no consta envío ni entrega.'; break;
    case 'SUBMISSION_UNKNOWN': detail = 'Se intentó enviar Bitcoin; aceptación, entrega y comisión pagada sin verificar.'; break;
    case 'MEMPOOL': detail = 'Bitcoin fue observado en mempool, sin confirmaciones; su comisión aún no consta pagada.'; break;
    case 'REORGED_MEMPOOL': detail = 'La confirmación anterior fue retirada por una reorganización. La transacción volvió al mempool; entrega y comisión sin confirmar en esa observación.'; break;
    case 'CONFIRMED_IN_OBSERVED_CHAIN': {
      detail = `La entrega BTC tenía ${btc.confirmations} confirmaciones en la cadena observada.`;
      if (btc.outputState === 'SPENT_IN_OBSERVED_CHAIN') detail += ' La salida ya se había gastado en esa cadena.';
      if (btc.outputState === 'SPENT_IN_MEMPOOL_OBSERVED') detail += ' Se observó un gasto posterior en mempool.';
      if (btc.feeStatus === 'CONFIRMED_IN_OBSERVED_CHAIN' && btc.paidFeeSatoshi != null) detail += ` Comisión incluida: ${btc.paidFeeSatoshi} sats.`;
      if (op.terminalDecision === 'REFUNDED') detail += ' La devolución EVM no revierte efectos Bitcoin; si esta entrega permanece canónica, el solver la financia sin cobro EVM.';
      break;
    }
    default: detail = 'Existe una identidad Bitcoin retenida; entrega y comisión pagada sin verificar.';
  }
  return `${prefix} ${detail}${when}${cached}`;
}
