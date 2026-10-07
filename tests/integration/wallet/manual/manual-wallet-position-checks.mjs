/** Acceptance readback for the wallet's current V2 owner position contract.
 * Ownership and valuation must independently agree with the original head;
 * the estimate never becomes a spendable underlying balance. */
import assert from 'node:assert/strict';
import { validatePositionStateEnvelope, samePositionHead }
  from '../../../../apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs';
import { validateFlatOwnerReadPayload }
  from '../../../../apps/wallet/src/client/features/portfolio/owner-portfolio-contract.mjs';

export function assertManualWalletConvertedPosition({ positions, portfolio, generationId, shareAssetId, underlyingAssetId }) {
  validatePositionStateEnvelope(positions);
  validateFlatOwnerReadPayload(portfolio);
  assert.equal(positions.positions.length, 1, 'MANUAL_ACCEPTANCE_ORIGINAL_POSITION_COUNT');
  assert.equal(portfolio.status, 'LIVE'); assert.equal(portfolio.coherent, true);
  const row = positions.positions[0];
  assert.equal(row.generationId, generationId);
  assert.equal(row.shareAssetId, shareAssetId); assert.equal(row.underlyingAssetId, underlyingAssetId);
  assert.equal(row.ownership.status, 'LIVE'); assert.equal(row.valuation.status, 'LIVE');
  assert.equal(samePositionHead(row.ownership.observed, portfolio.observed), true,
    'MANUAL_ACCEPTANCE_OWNERSHIP_ORIGINAL_HEAD');
  assert.equal(samePositionHead(row.valuation.observed, portfolio.observed), true,
    'MANUAL_ACCEPTANCE_VALUATION_ORIGINAL_HEAD');
  assert.deepEqual(row.ownership.balances, { available: '100', reserved: '0', recovery: '0', locked: '0' });
  assert.equal(row.valuation.availableShares, '100');
  assert.equal(row.valuation.estimatedRedeemableUnderlying, '100');
  assert.equal(row.underlyingSpendable, false); assert.equal(row.privateConversionAccepted, false);
  return Object.freeze({ availableShares: row.valuation.availableShares,
    estimatedRedeemableUnderlying: row.valuation.estimatedRedeemableUnderlying, underlyingSpendable: false });
}
