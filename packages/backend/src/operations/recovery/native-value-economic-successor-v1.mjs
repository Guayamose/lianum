/** Fixed economic successor, called only by the original private child entry.
 * Identity/checkpoint arrive over that profile's causal IPC, never HTTP. The
 * native issuer authenticates AEAD/CAS, completed stopped sections, a distinct
 * process lifetime and one-use ordered claims. No restored DTO is a capability.
 */
import assert from 'node:assert/strict';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../execution/account/preparation/readiness-inputs.mjs';
import { openNativeEconomicRecoveryAuthorityV1, reopenNativeEconomicFromAuthorityV1 }
  from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';

export async function reopenOriginalNativeValueEconomicSuccessorV1(rawIdentity, rawCheckpoint) {
  assert.equal(arguments.length, 2);
  const identity = cloneInput(rawIdentity), checkpoint = cloneInput(rawCheckpoint);
  exactRecord(identity, ['directory', 'runId', 'sourceSHA256', 'deadlineMs']);
  exactRecord(checkpoint, ['revision', 'commitment']);
  const authority = await openNativeEconomicRecoveryAuthorityV1(identity, checkpoint);
  // The fixed original consumer closes its issuer before returning. On any
  // failure it retains OPENING and closes owned resources/lease; no retry here.
  const originals = await reopenNativeEconomicFromAuthorityV1(authority);
  return Object.freeze({ originals, receipt: frozenInput({
    kind: 'ORIGINAL_NATIVE_ECONOMIC_SUCCESSOR_V1',
    sourceSHA256: identity.sourceSHA256, checkpoint,
    processId: process.pid, originalProcessLifetimeDifferent: true,
    originalSectionsStoppedBeforeCheckpoint: true, issuerClosed: true,
    economicAcceptanceEstablished: false,
  }) });
}
