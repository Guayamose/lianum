/** Display-only confirmation text for the exact original action. */
import { isWrappedWithdrawalAction, WRAPPED_WITHDRAWAL_ACTIONS } from '../../contracts/wrapped-withdrawal-review.mjs';
import { copy } from '../validation/values.mjs';
import { accountAction, ACCOUNT_ACTIONS, defiAction, DEFI_ACTIONS, ACTIONS } from '../actions/catalog.mjs';
import { originalNativeIdentity } from '../validation/native-identity.mjs';
import { nativeAmountDetails } from './native-review.mjs';

export function actionReview(action, body, nativeClaims = null, accountContext = null, wrappedContext = null) {
  if (isWrappedWithdrawalAction(action)) return { title: WRAPPED_WITHDRAWAL_ACTIONS[action].title, body: copy(body), wrappedWithdrawalContext: copy(wrappedContext), notes: [
    'Solo la nota, titular original, pool, activo, importe y destino de esta revisión. Preparar no firma ni envía.',
    'Ejecutar autoriza la firma de nota y un único envío original; conciliar solo observa el mismo envío. Un resultado incierto no permite repetir ni renovar el epoch.',
    'HTTP 202 confirma admisión duradera, nunca liquidación. Conserva el ID y concilia el original.' ] };
  if (accountAction(action)) return { title: ACCOUNT_ACTIONS[action].title, body: copy(body), accountContext: copy(accountContext), notes: [
    ...(action === 'accountRecover' ? ['Solicita solo F para el GRAPH original bajo su cutoff y reserva originales, o concilia la liquidación original si ya existe. La autoridad original decide su validez; no modifica el cutoff ni reenvía la entrega. La entrega nativa previa no se revierte y la pérdida aceptada corresponde al solver.'] : []),
    action === 'accountPrepare' ? accountContext?.preparingContinuation
      ? 'Continúa manualmente el mismo ID y tipo PREPARING. Introduce solo su ownerOperationRef y activo originales. El navegador no verifica igualdad con los campos ocultos; el keeper conserva la vinculación y debe rechazar cualquier diferencia, nunca reemplazarla.'
      : 'Vincula una preparación ya creada en el proceso del titular. Este navegador no crea el ownerOperationRef, claves, testigos ni pruebas.'
      : action === 'accountExecute' ? 'Ejecuta únicamente la preparación original registrada identificada. Puede iniciar pruebas y efectos bajo sus comprobaciones originales; no cambia el importe o destino.'
        : action === 'accountRecover' ? 'Solicita F sobre la reserva original. Puede generar su prueba y una transacción de recuperación original, una sola vez, si la autoridad confirma el cutoff y el estado. No reenvía la entrega.'
        : 'Concilia exclusivamente el ID original registrado. No reenvía la operación ni crea una solicitud de reemplazo.',
    'HTTP 200 solo confirma entrada en una cola local volátil: puede no ser duradera. No demuestra ejecución completada, liquidación ni aplicación al saldo.',
    'Conserva el ID original. Actualiza manualmente el diario y la vista privada; un fallo de transporte no confirma rechazo y no autoriza repetir.',
    accountContext?.graph ? 'Solo esta ruta EVM previamente autorizada. El solver aporta su propia liquidez; si entrega y falla la liquidación global, la recuperación privada F mantiene el cutoff original y no revierte la entrega. No hay recuperación automática.' : 'Los grafos sin preparación EVM original registrada están bloqueados.',
    'Recuperación exige otra capacidad exacta explícita para el mismo GRAPH original; no es un reintento. El reinicio del coordinador permanece privado.',
  ] };
  if (defiAction(action)) return { title: DEFI_ACTIONS[action].title, body: copy(body), notes: [
    'Esta acción DeFi requiere una salida original de shares (EXIT) ya confirmada por el titular. Usa por separado su flujo de cuenta original; la acción DeFi no crea esa salida.',
    action === 'defiReopen' ? 'Reabre solo el servicio original. Conserva identidades; no reinicia el keeper ni reenvía transferencias.'
      : action === 'defiRequote' ? 'Cambia únicamente mínimo y deadline de la solicitud original nunca enviada. No permite reenviar una transferencia incierta.'
        : action === 'defiReconcile' ? 'Concilia exclusivamente la redención original y sus identidades retenidas. No crea una transferencia nueva.'
          : 'La redención es pública y el subyacente se entrega a la dirección externa original del titular. No se añade al saldo privado gastable.',
    'El deadline usa el timestamp de la cadena original. No se deriva del reloj del navegador.',
    'HTTP 200 devuelve un resultado del servicio; verifica su fase original. No es admisión nativa 202 ni una garantía de liquidación.',
  ] };
  return { title: ACTIONS[action].title, body: copy(body), nativeIdentity: originalNativeIdentity(nativeClaims),
    nativeAmounts: nativeAmountDetails(action, body, nativeClaims), notes: [
    action === 'deposit' ? 'Requiere un intent ya preparado por el titular original. Este navegador no prepara el intent ni pruebas.'
      : action === 'redeem' ? 'Requiere la salida original autorizada por el titular y un wrapper claim disponible para quemar. El saldo privado mostrado no sustituye esa salida.'
        : action === 'refund' ? 'Usa el intent original elegible y su origen de devolución fijado. No cambia el destinatario ni crea otro depósito.'
          : action === 'reconcile' ? 'Consulta y concilia únicamente las identidades retenidas de la solicitud original. No crea una transferencia nueva.'
            : 'Reanuda exclusivamente la solicitud original bajo las comprobaciones del servidor. Puede continuar efectos autorizados pendientes; no cambia sus términos ni destinos.',
    'Una respuesta HTTP 202 confirma admisión duradera en el diario, nunca liquidación nativa.',
    'La interfaz no recibe claves raíz o de gasto y no prepara pruebas. Destinos, dominio y custodia los fija el bootstrap local.',
  ] };
}
