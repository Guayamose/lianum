import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeClaimPortfolioView, projectNativeClaimPosition } from '../../../src/claims/operations/portfolio-view.mjs';
test('claim notes remain explicitly custodial and never double-count native spendability', () => {
  const asset = { asset: { assetId: 'ab'.repeat(32) }, status: 'LIVE', balances: { available: '100000' } };
  const config = { nativeFamily: '1', nativeGenesis: 'cd'.repeat(32) };
  const position = projectNativeClaimPosition(asset, config, true);
  assert.equal(position.availablePrivateClaims, '100000'); assert.equal(position.nativeSymbol, 'BTC');
  assert.equal(position.nativeSelfCustody, false); assert.equal(position.underlyingSpendable, false);
  assert.equal(position.independentOperators, false); assert.equal(position.custodyObservation, 'CURRENT_QUORUM');
  assert.equal(projectNativeClaimPosition(asset, config, false).custodyObservation, 'UNAVAILABLE');
  assert.equal(projectNativeClaimPosition({ ...asset, status: 'UNAVAILABLE', balances: null }, config, false).availablePrivateClaims, null);
});

test('unowned lookalike capabilities cannot construct a custody portfolio view', () => {
  let reads = 0;
  const input = { runtime: {}, claims: { configs: [] }, observer: { async read() { reads++; } },
    quorum: { async health() { reads++; } }, portfolio: { registry: [], async ownerView() { reads++; } } };
  assert.throws(() => createNativeClaimPortfolioView(input), /OWNED.*CLAIM|CLAIM.*OWNED/);
  assert.throws(() => createNativeClaimPortfolioView({ ...input, skipHealth: true }), /EXACT_FIELDS/);
  assert.equal(reads, 0);
});
