/** Failure retention for the owned development flow. Diagnostic loss does not
 * replace the operation error, resample metrics, or prevent its final cleanup. */
import {join} from 'node:path';
import {privateFailureDiagnostic} from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';

export async function retainDevelopmentNativeClaimFailure(error, ports) {
  const {result, btcToSpl, fixture, controller, privateDirectory,
    loadedSolanaSnapshot, finalAudit, writeFixturePrivate, audit, code} = ports;
  result.failedStage = result.phase;
  result.phase = 'failed';
  result.success = false;
  result.errorCode = code(error);
  if (error.fixtureCleanup) Object.assign(result.cleanup, error.fixtureCleanup);

  if (btcToSpl && fixture?.operators && controller &&
      ['original-native-ingress-and-private-issuance-0',
        'original-native-ingress-and-private-issuance-1'].includes(result.failedStage)) {
    try {
      const snapshot = loadedSolanaSnapshot();
      const retainedAudit = finalAudit();
      writeFixturePrivate(join(privateDirectory, 'claim-preposition-private-metrics-v1.json'), {
        schema: 'DEVELOPMENT_CLAIM_PREPOSITION_PRIVATE_METRICS_V1',
        snapshot, finalAudit: retainedAudit,
      });
    } catch { /* Retain the original failure even if diagnostic storage fails. */ }
  }

  writeFixturePrivate(join(privateDirectory, 'error-private.json'), {
    message: String(error.message), stack: String(error.stack),
    cause: error.cause ? String(error.cause.stack ?? error.cause.message) : null,
    privateDiagnostic: privateFailureDiagnostic(error, 'NATIVE_CLAIM_OPERATION_FAILED'),
  });
  await audit().catch(() => {});
}
