/** Host regression against the actual V2 projection with synthetic reads.
 * No node, proof, credit or execution acceptance is produced by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPrivatePositionStateV2 }
  from '../../../../packages/backend/src/defi/positions/private-position-state-v2.mjs';
import { POSITION_STATE_PROFILE }
  from '../../../../apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs';
import { assertManualWalletConvertedPosition } from './manual-wallet-position-checks.mjs';
const h = n => n.repeat(64), a = n => n.repeat(40);
function fixture() {
  const original = { generationId: h('1'), shareAssetId: h('2'), underlyingAssetId: h('3'),
    identity: { chainId: '31337', genesisHash: h('4'), domain: h('5'), runtimeId: h('6'),
      asset: a('7'), assetCodeSHA256: h('8'), vault: a('9'), vaultCodeSHA256: h('a') } };
  const head = { observedAt: 1, blockNumber: '12', blockHash: h('b'), timestamp: '1000' };
  const portfolio = { version: 1, profile: 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1', status: 'LIVE', coherent: true,
    observed: { ...head }, assets: [original.underlyingAssetId, original.shareAssetId].map((assetId, i) => ({
      version: 1, status: 'LIVE', asset: { assetId, symbol: i ? 'BLTV' : 'PALT', decimals: 6 },
      observed: { ...head }, balances: { available: i ? '100' : '380', reserved: '0', recovery: '0', locked: '0' },
      backing: { held: i ? '100' : '500', liabilities: i ? '100' : '380', surplus: i ? '0' : '120', deficit: '0' }, requests: [],
    })), capabilities: { coordinatorRestart: true, keeperRestart: false, crossAssetAtomicConversion: false,
      privateDeFiComposability: false, fullWalletAcceptance: false } };
  const vaultView = { identity: original.identity, snapshot: { blockNumber: head.blockNumber, blockHash: head.blockHash,
    blockTimestamp: head.timestamp, totalAssets: '100', totalShares: '100' } };
  const positions = { version: 2, profile: POSITION_STATE_PROFILE,
    positions: [projectPrivatePositionStateV2({ ...original, portfolioView: portfolio, vaultView })],
    privateBalancesAggregated: false, underlyingPrivateSpendable: false };
  return { ...original, portfolio, positions, vaultView };
}
test('conversion readback consumes the real V2 producer, preserving both authenticated observations', () => {
  const value = fixture();
  assert.equal(value.positions.positions[0].observed, undefined, 'V1 fields are absent in the current producer');
  assert.deepEqual(assertManualWalletConvertedPosition(value), {
    availableShares: '100', estimatedRedeemableUnderlying: '100', underlyingSpendable: false });
});
test('ownership alone, stale heads, rebound assets and spendable estimates cannot satisfy conversion acceptance', () => {
  const value = fixture();
  const unavailable = projectPrivatePositionStateV2({ ...value, portfolioView: value.portfolio, vaultView: null });
  assert.equal(unavailable.ownership.status, 'LIVE'); assert.equal(unavailable.valuation.status, 'UNAVAILABLE');
  assert.throws(() => assertManualWalletConvertedPosition({ ...value,
    positions: { ...value.positions, positions: [unavailable] } }));
  for (const change of [
    copy => { copy.positions.positions[0].ownership.observed.blockHash = h('c'); },
    copy => { copy.positions.positions[0].valuation.observed.blockHash = h('c'); },
    copy => { copy.positions.positions[0].generationId = h('c'); },
    copy => { copy.positions.positions[0].shareAssetId = h('c'); },
    copy => { copy.positions.positions[0].underlyingSpendable = true; },
  ]) {
    const copy = structuredClone(value); change(copy);
    assert.throws(() => assertManualWalletConvertedPosition(copy));
  }
});
