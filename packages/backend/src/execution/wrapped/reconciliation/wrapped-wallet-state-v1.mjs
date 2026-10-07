/** Fixed private reader composition for a wrapped wallet. Reads use the exact
 * original quorum and its same-head complete reciprocal custody/graph audits.
 * No caller inventory, signer, transport, clock or callback can substitute. */
import assert from 'node:assert/strict';
import { exactRecord } from '../../encoding/commitments.mjs';
import { assertOwnedWrappedClaimWalletSystemV1 } from '../../../operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs';
import { assertOwnedNativeValueQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { createWrappedClaimGraphStateReaderV1 } from './wrapped-claim-system-state-v1.mjs';
const issued = new WeakMap();
export async function createWrappedWalletStateReaderV1(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex']);
  const { runtime, system, poolIndex } = input;
  const live = () => { assertOwnedWrappedClaimWalletSystemV1(runtime, system);
    assertOwnedNativeValueQuorum(system.quorum, { runtime, system }); };
  live(); const original = await createWrappedClaimGraphStateReaderV1(input);
  async function checked(view) {
    live(); const audit = await system.quorum.audit({ poolIndex });
    assert.equal(audit.classification, 'ORIGINAL_WRAPPED_RECIPROCAL_FULL_INVENTORY_AUDIT_V1');
    assert.equal(audit.signed, false); assert.deepEqual(audit.head, view.head, 'WRAPPED_WALLET_COMMON_INVENTORY_HEAD');
    assert.deepEqual(audit.signerIndexes, system.quorum.signerIndexes, 'WRAPPED_WALLET_ORIGINAL_JOINT_QUORUM');
    await original.assertCurrent(view); live(); issued.set(view, audit); return view;
  }
  return Object.freeze({
    async read(query) { return checked(await original.read(query)); },
    async assertCurrent(view) { assert.ok(issued.has(view), 'WRAPPED_WALLET_ORIGINAL_VIEW_REQUIRED'); await checked(view); },
    async authorizationPath(view, envelope) {
      assert.ok(issued.has(view), 'WRAPPED_WALLET_ORIGINAL_VIEW_REQUIRED');
      await checked(view); const result = await original.authorizationPath(view, envelope); await checked(view); return result;
    },
    // Historical graph data never asserts current escrow or signing coverage.
    readHistorical: block => original.readHistorical(block), assertCanonical: view => original.assertCanonical(view),
  });
}
