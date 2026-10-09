/** Fixed future genuine native-value note-wallet acceptance. This file changes
 * no artifact/key/proof role and cannot open a release via environment/options.
 * A source-only host pass is not authority to replace the null release. */
import assert from 'node:assert/strict';
import { exactRecord } from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
import { assertOwnedNativeValueAccountAuthority } from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import { assertOwnedNativeValueWalletSystem } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-wallet-binding-v2.mjs';
import { createNativeValueManualGraphAccountSession,createOriginalSessionWalletEconomicStateV1 } from '../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createManualWalletAppDriver } from '../manual/manual-wallet-app-driver.mjs';
export const NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE = null;
export const NATIVE_NOTE_WALLET_ACCEPTANCE_PROFILE = 'GENUINE_NATIVE_VALUE_NOTE_WALLET_ACCEPTANCE_V1';
/** The existing native bootstrap owns runtime/system/account and its exact
 * original owner. This adapter creates the ONE shared SDK/HTTP workflow and
 * retains it across TOP_UP, optional original GRAPH, and original-note EXIT.
 * Calls here are explicitly scripted test approvals, never autonomous consent.
 * No key, loader, signer, observer, callback, endpoint or consent blob accepted. */
export async function createNativeNoteWalletAcceptance(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'account', 'journal', 'deadlineMs']);
  assert.ok(NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE, 'NATIVE_NOTE_WALLET_GENUINE_ACCEPTANCE_NOT_RELEASED');
  const { runtime, system, poolIndex, account, journal, deadlineMs } = input;
  assertOwnedNativeValueWalletSystem(runtime, system);
  assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex });
  const preparation = await account.ownerActions.createManualPreparation();
  const joined = await createNativeValueManualGraphAccountSession({ runtime, system, poolIndex, account, journal });
  let app, driver;
  try {
    const economicState=await createOriginalSessionWalletEconomicStateV1(joined.session);
    app = await startWalletApplication({ accountSession: joined.session, economicState, actionAccessMode: 'exact-only' });
    driver = createManualWalletAppDriver(app, { deadlineMs });
  } catch (error) { await app?.close(); await joined.session.close(); throw error; }
  let busy = false, closed = false;
  return Object.freeze({
    session: joined.session,
    bindManualGraph: approval => joined.bindManualGraph(approval),
    async note(proposal) {
      assert.ok(!busy && !closed); busy = true;
      try {
        const review = await preparation.review(proposal);
        const body = await preparation.confirm(); assert.ok(body, 'NATIVE_NOTE_ACCEPTANCE_OWNER_PREPARATION_UNRESOLVED');
        joined.bindManualNote(preparation.originalApproval(body.requestId));
        await driver.account('prepare', body);
        await driver.account('execute', { requestId: body.requestId });
        await driver.account('reconcile', { requestId: body.requestId });
        return Object.freeze({ review, body, evidence: driver.evidence() });
      } finally { busy = false; }
    },
    // Graph consent stays separately branded and retains original I84 P/R/I/N/T/F.
    async graph(method, body) { assert.ok(!busy && !closed); busy = true;
      try { return await driver.account(method, body); } finally { busy = false; } },
    evidence: () => driver.evidence(),
    async close() { assert.ok(!busy); closed = true; await app.close(); await joined.session.close(); },
  });
}
/** Exact acceptance requirements. Filling the null release also requires the
 * new host closure and original genuine artifact/native factory releases. */
export function assertNativeNoteWalletAcceptance(result) {
  exactRecord(result, ['profile', 'genuineOriginalOwner', 'genericNativeGraphOnly', 'publicNetwork',
    'oneSharedSession', 'originalVaultAndKeys', 'ownerSecretsOverHttp', 'legacyConsentAccepted',
    'oldHealthyGenerationExitUnaffected', 'proofRolesUnchanged', 'requests', 'negativeChecks']);
  assert.equal(result.profile, NATIVE_NOTE_WALLET_ACCEPTANCE_PROFILE);
  for (const key of ['genuineOriginalOwner', 'genericNativeGraphOnly', 'oneSharedSession', 'originalVaultAndKeys',
    'oldHealthyGenerationExitUnaffected', 'proofRolesUnchanged']) assert.equal(result[key], true);
  for (const key of ['publicNetwork', 'ownerSecretsOverHttp', 'legacyConsentAccepted']) assert.equal(result[key], false);
  assert.ok(Array.isArray(result.requests) && result.requests.length >= 2 && result.requests.length <= 4);
  assert.equal(result.requests[0].kind, 'TOP_UP'); assert.ok(result.requests.slice(1).every(row => row.kind === 'EXIT'));
  assert.equal(new Set(result.requests.map(row => row.requestId)).size, result.requests.length);
  for (const row of result.requests) {
    exactRecord(row, ['requestId', 'kind', 'originalRequestRetained', 'confirmedOriginalObservation', 'consents']);
    assert.equal(row.originalRequestRetained, true); assert.equal(row.confirmedOriginalObservation, true);
    assert.deepEqual(row.consents.map(c => c.action), ['accountPrepare', 'accountExecute', 'accountReconcile']);
    assert.equal(new Set(row.consents.map(c => c.reviewId)).size, 3);
    for (const c of row.consents) {
      exactRecord(c, ['action', 'reviewId', 'listenerId', 'accountIdentitySHA256', 'generationId', 'bodySHA256',
        'termsSHA256', 'processIdentitySHA256', 'keyScopeSHA256', 'exactOneUseReplayRejected']);
      for (const [key, value] of Object.entries(c)) if (key.endsWith('SHA256') || ['reviewId', 'listenerId', 'generationId'].includes(key)) assert.match(value, /^[0-9a-f]{64}$/);
      assert.equal(c.exactOneUseReplayRejected, true);
    }
  }
  assert.deepEqual(result.negativeChecks, { staleHead: true, staleDomain: true, staleAmount: true,
    wrongAccount: true, wrongProcess: true, wrongKeyScope: true, cancelledReview: true, revokedGrant: true,
    oldListener: true, unknownSendObservedOnly: true, noImplicitEpochRenewal: true, restoredConsentAbsent: true });
  return true;
}
