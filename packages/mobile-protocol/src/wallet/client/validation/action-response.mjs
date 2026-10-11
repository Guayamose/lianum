/** Validate response contracts without treating admission as execution or settlement. */
import { ACCOUNT_ACTIONS, DEFI_PROFILE, accountAction, defiAction } from '../actions/catalog.mjs';
import { isWrappedWithdrawalAction, WRAPPED_WITHDRAWAL_ACTIONS } from '../../contracts/wrapped-withdrawal-review.mjs';

const defiPhases = ['BINDING_REDEMPTION', 'READY_TO_REDEEM', 'REDEMPTION_UNRESOLVED', 'REQUOTING_REDEMPTION', 'REDEEMED', 'REVERTED'];

export function actionResponseOutcome(action, body, response, originalRequestId) {
  if (isWrappedWithdrawalAction(action)) {
    const admission = response.value;
    if (response.status !== 202 || admission?.admitted !== true
      || admission.action !== WRAPPED_WITHDRAWAL_ACTIONS[action].command || admission.requestId !== body.requestId)
      throw new Error('WALLET_WRAPPED_WITHDRAWAL_ADMISSION_CONTRACT');
    return { state: 'DURABLE_WRAPPED_WITHDRAWAL_ADMISSION', action, requestId: originalRequestId };
  }
  if (accountAction(action)) {
    const result = response.value, admission = result?.admission;
    if (response.status !== 200 || result?.version !== 1 || result.profile !== 'FLAT_ACCOUNT_VOLATILE_ADMISSION_V1'
      || Object.keys(result).sort().join(',') !== 'acceptance,admission,durableAdmissionEstablished,profile,settlementEstablished,version'
      || result.acceptance !== 'VOLATILE_UI_QUEUE_ONLY' || result.durableAdmissionEstablished !== false || result.settlementEstablished !== false
      || admission?.version !== 1 || admission.admitted !== true || !Number.isSafeInteger(admission.sequence) || admission.sequence <= 0
      || Object.keys(admission).sort().join(',') !== 'action,admitted,requestId,sequence,version'
      || admission.action !== ACCOUNT_ACTIONS[action].command || admission.requestId !== body.requestId)
      throw new Error('WALLET_ACCOUNT_ADMISSION_CONTRACT');
    return { state: 'VOLATILE_QUEUE_ACCEPTANCE', action, requestId: originalRequestId };
  }
  if (defiAction(action)) {
    const result = response.value;
    if (response.status !== 200 || (action === 'defiReopen'
      ? result?.reopened !== true || result.originalIdentitiesRetained !== true || result.keeperRestart !== false || !Array.isArray(result.requestIds)
      : result?.version !== 1 || result.profile !== DEFI_PROFILE || result.requestId !== body.requestId
        || !defiPhases.includes(result.phase) || result.underlyingPrivateSpendable !== false
        || result.underlyingLocation !== 'EXTERNAL_OWNER_ADDRESS' || result.redemptionPublic !== true))
      throw new Error('WALLET_DEFI_RESULT_CONTRACT');
    return { state: 'SERVICE_RESULT', action, requestId: originalRequestId,
      phase: action === 'defiReopen' ? 'REOPENED' : result.phase };
  }
  if (response.status !== 202) throw new Error('WALLET_ACTION_UNKNOWN');
  const admission = response.value;
  if (admission?.admitted !== true || admission.action !== action || admission.requestId !== body.requestId)
    throw new Error('WALLET_ADMISSION_CONTRACT');
  return { state: 'ADMITTED', action, requestId: body.requestId };
}
