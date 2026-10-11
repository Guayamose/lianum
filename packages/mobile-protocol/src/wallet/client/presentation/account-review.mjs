/** Render account and graph review details as display-only label/value pairs. */
import { ownerGraphProfiles } from '../validation/graph-review.mjs';
import { validateOwnerGraphReview } from '../../contracts/owner-graph-review-v1.mjs';

export function accountReviewDetails(context) {
  if (context.nativeNote) {
    const n = context.nativeNote, t = n.terms;
    return [['Operación original', n.kind + ' · nota privada de origen nativo'], ['ID original', n.requestId],
      ['Activo', `${n.asset.symbol} · ${n.assetId}`], ['Importe exacto', t.amount + ' unidades atómicas'],
      ['Destinatario de salida original', t.recipient], ['Rol', t.role ?? 'source'], ['Época fija', t.epoch],
      ['Pool original', t.asset.pool], ['Dominio original', `${t.asset.scope} · ${t.asset.policy} · ${t.asset.assetIdentity}`],
      ['Cuenta y generación', `${n.accountIdentitySHA256} · ${n.generationId}`],
      ['Proceso y ámbito originales', `${t.processIdentitySHA256} · ${t.processGeneration} · ${t.keyScopeSHA256}`],
      ['Términos inmutables SHA-256', n.termsSHA256]];
  }
  if (context.graph) {
    const g = context.graph;
    if (ownerGraphProfiles.has(g.profile)) {
      validateOwnerGraphReview(g);
      const rows = [
        ['Operación original', `GRAPH · ${g.graph.legs.length} pasos`],
        ['ID original', g.requestId],
        ['Activo privado de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
        ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
        ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
        ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
        ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
        ['Cutoff de liquidación original', g.settleBefore],
        ['Identidad del grafo revisado', g.graph.graphTermsSHA256],
        ['Envelope original', g.envelope],
        ['Referencia original del titular', g.ownerOperationRef],
        ['Visibilidad de esta revisión', 'Grafo completo solo para el titular; cada ejecutor conserva su ámbito original'],
      ];
      if(g.economicAllocation){
        const a=g.economicAllocation;
        rows.push(
          ['Pago condicional al solver', `${a.solverInvoiceOnTAtomic} unidades atómicas del origen sólo con cumplimiento T; ${a.solverInvoiceOnFAtomic} con recuperación F`],
          ['Recuperación y entrega finalizada', `${a.ownerRecoveryOnFAtomic} de reserva vuelve al titular con F; la nota D27 entregada conserva su dueño original`],
          ['Margen de caja frente al máximo de entrada', `${a.minimumInputCashMarginOnTAtomic} unidades atómicas del origen antes del gas; el margen no es una comisión cotizada`],
          ['Comisiones y gas', a.protocolFee.rateMillionths===null?'No hay una comisión del protocolo cotizada por separado. El solver paga gas nativo; la factura privada no lo reembolsa por separado.':'El coste de entrada ya incluye la comisión Uniswap de '+a.protocolFee.rateMillionths+' millonésimas; no se suma otra vez. El solver paga gas nativo.'],
          ['Riesgo económico del solver', 'Con F el solver soporta el desembolso y el gas. Si recibe también la salida D27, esto no demuestra una pérdida patrimonial neta.'],
          ['Alcance de solvencia', 'Saldo, allowance, gas y respaldo se comprueban en el head original antes del envío. No hay seguro ni garantía de liquidez futura; las retiradas tienen costes propios.'],
        );
      }
      for (const leg of g.graph.legs) {
        const route = leg.route, label = `Paso ${leg.slot + 1}`;
        const predecessors = g.graph.edges.filter(edge => edge.targetSlot === leg.slot)
          .map(edge => `paso ${edge.sourceSlot + 1}`);
        const network = route.family === '1' ? 'Bitcoin local'
          : route.family === '2' ? 'Solana local'
          : route.family === '4' ? 'Tron local' : 'EVM local ' + route.chainId;
        rows.push(
          [label, predecessors.length ? `Depende de ${predecessors.join(', ')}` : 'Sin dependencias anteriores'],
          [`${label} · red y génesis`, `${network} · ${route.genesis}`],
          [`${label} · origen de respaldo`, `${route.sourcePool} · ${route.sourceAssetIdentity}`],
        );
        if (route.routeProfile === 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1') {
          rows.push(
            [`${label} · intercambio`, `Uniswap V3 exact output · fee ${route.fee}`],
            [`${label} · protocolo y router`, `${route.protocol} / ${route.router}`],
            [`${label} · token de entrada`, route.inputToken],
            [`${label} · límite del solver`, `${route.solverMaximumInputAmount} unidades atómicas de entrada`],
            [`${label} · token de salida privado`, `${route.deliveredOutputAmount} unidades atómicas · ${route.outputToken} · ${route.targetAssetIdentity}`],
            [`${label} · pool de destino`, route.targetPool],
            [`${label} · destinatario privado`, `Compromiso de salida ${route.targetCommitment}`],
            [`${label} · descriptor original`, route.descriptorCommitment],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
            [`${label} · exposición`, 'Protocolo, importes, ejecución y depósito observables en la red local'],
          );
        } else if (['REGISTERED_LOCAL_EVM_VAULT_V1', 'REGISTERED_LOCAL_EVM_METAMORPHO_V1', 'REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)) {
          rows.push(
            [`${label} · depósito en vault`, route.vault],
            [`${label} · router`, route.router],
            [`${label} · liquidez del solver`, ['REGISTERED_LOCAL_EVM_METAMORPHO_V1','REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)
              ? `Límite ${route.solverMaximumUnderlyingAmount} unidades atómicas del subyacente`
              : `${route.solverUnderlyingAmount} unidades atómicas del subyacente`],
            [`${label} · shares entregadas`, `${route.deliveredShares} unidades atómicas · ${route.targetAssetIdentity}`],
            [`${label} · pool de destino`, route.targetPool],
            [`${label} · destinatario privado`, `Compromiso de salida ${route.targetCommitment}`],
            [`${label} · descriptor original`, route.descriptorCommitment],
          );
          if (['REGISTERED_LOCAL_EVM_METAMORPHO_V1','REGISTERED_LOCAL_EVM_AAVE_STATIC_V1'].includes(route.routeProfile)) rows.push(
            [`${label} · protocolo`, route.routeProfile==='REGISTERED_LOCAL_EVM_AAVE_STATIC_V1' ? 'Aave V3 oficial; cuotas estáticas cuyo valor incorpora el rendimiento del Pool. Importes, ejecución y depósito observables en la red local' : 'MetaMorpho oficial; importes, ejecución y depósito observables en la red local'],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
          );
        } else {
          const endpointEncoding = route.family === '1' ? 'script Bitcoin en hexadecimal'
            : route.family === '2' ? 'clave pública Solana en hexadecimal'
            : route.family === '4' ? 'dirección Tron en hexadecimal' : 'dirección EVM';
          rows.push(
            [`${label} · activo e importe`, `${route.nativeAmount} unidades atómicas · ${route.nativeAsset}`],
            [`${label} · destinatario (${endpointEncoding})`, route.recipient],
            [`${label} · compromiso de riesgo`, route.deliveryRiskCommitment],
          );
        }
        rows.push(
          [`${label} · solver`, route.solver],
          [`${label} · entrega`, `${route.executionFrom} ≤ tiempo de cadena < ${route.executionUntil}`],
          [`${label} · cutoff`, route.settleBefore],
          [`${label} · compromiso de pago`, route.payoutCommitment],
          [`${label} · pérdida de entrega`, route.deliveryLossClause],
          [`${label} · compromiso local`, leg.localCommitment],
          [`${label} · compromiso de dependencias`, leg.dependencyCommitment],
        );
      }
      return rows.concat([
        ['Liquidez de los solvers', 'Separada del respaldo en custodia'],
        ['Saldo privado', 'Esta revisión no acredita saldo ni liquidación; las entregas nativas no crean crédito privado'],
        ['Liquidación', 'Todavía no establecida; depende del resultado completo y los términos originales'],
        ['Vida original de cuenta', g.originalAccountLifetime],
        ['Estado del diario', context.journalState ?? 'Aún no vinculado'],
      ]);
    }
    if (['ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1'].includes(g.profile)) return [
      ['Operación original', 'GRAPH · entrega nativa local'], ['ID original', g.requestId],
      ['Activo privado de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
      ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
      ['Entrega nativa', `${g.nativeAmount} unidades atómicas · ${g.nativeAsset}`],
      ['Red y génesis originales', `${g.family === '4' ? 'Tron local' : 'EVM local ' + g.chainId} · ${g.genesis}`],
      ['Solver original', g.solver], ['Destinatario original', g.recipient],
      ['Liquidez propia del solver', 'Separada del respaldo en custodia'],
      ['Crédito privado por esta entrega', 'Ninguno; no crea saldo nativo privado gastable'],
      ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
      ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
      ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
      ['Ventana de entrega', `${g.executionFrom} ≤ tiempo de cadena < ${g.executionUntil}`],
      ['Cutoff original', g.settleBefore], ['Cláusula de pérdida de entrega', g.deliveryLossClause],
      ['Compromiso de pago', g.payoutCommitment], ['Compromiso de riesgo', g.deliveryRiskCommitment],
      ['Vida original de cuenta', g.originalAccountLifetime], ['Estado del diario', context.journalState ?? 'Aún no vinculado']];
    return [['Operación original', 'GRAPH · vault EVM fijo'], ['ID original', g.requestId],
      ['Activo de origen', `${g.asset.symbol} · ${g.assetId} · ${g.asset.decimals} decimales`],
      ['Presupuesto privado reservado', `${g.reservedAmount} unidades atómicas del origen`],
      ['Liquidez propia del solver', `${g.solverUnderlyingAmount} unidades atómicas del subyacente; separada del presupuesto`],
      ['Shares privadas de destino', `${g.deliveredShares} unidades atómicas · ${g.targetAssetIdentity}`],
      ['Nota privada de destino autorizada', g.targetCommitment], ['Pool de destino', g.targetPool],
      ['Router y vault originales', `${g.router} / ${g.vault}`], ['Solver original', g.solver],
      ['Cambio privado', `${g.changeAmount} · salida futura a ${g.changeRecipient}`],
      ['Recuperación original', `${g.reservedAmount} · salida futura a ${g.recoveryRecipient}`],
      ['Ventana de financiación', `${g.fundingNotBefore} ≤ tiempo de cadena < ${g.fundingValidUntil}`],
      ['Ventana de entrega', `${g.executionFrom} ≤ tiempo de cadena < ${g.executionUntil}`],
      ['Cutoff original', g.settleBefore], ['Cláusula de pérdida de entrega', g.deliveryLossClause],
      ['Identidad de ruta', g.descriptorCommitment], ['Vida original de cuenta', g.originalAccountLifetime],
      ['Estado del diario', context.journalState ?? 'Aún no vinculado']];
  }
  return [['Operación original', context.kind], ['Estado del diario', context.journalState ?? 'Preparación aún no vinculada'],
    ['Activo original', context.asset?.symbol ?? (context.journalState ? 'No disponible; conciliación solo por ID original' : 'Selecciona un activo original observado')],
    ['Identidad completa del activo', context.asset?.assetId ?? 'No disponible; no se infiere del ticker o del orden'],
    ['Decimales del activo', context.asset ? String(context.asset.decimals) : 'No disponibles'],
    ...(context.originalGeneration ? [
      ['Generación original', context.originalGeneration.generationId], ['Pool original', context.originalGeneration.pool],
      ['Dominio original', context.originalGeneration.domainCommitment],
      ['Bloque observado original', context.originalGeneration.observed.blockNumber + ' · ' + context.originalGeneration.observed.blockHash],
    ] : []),
    ['Importe y destino originales', 'No expuestos por esta referencia opaca; los conserva y valida el titular original'],
    ...(context.preparingContinuation ? [['Continuación PREPARING', 'Mismo ID y tipo original. El navegador no puede comparar ref/asset con los campos ocultos; el keeper debe rechazar cualquier diferencia, sin revincular.']] : [])];
}
