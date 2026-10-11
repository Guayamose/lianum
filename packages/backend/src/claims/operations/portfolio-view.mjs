/** Owner-facing private claim balances with an explicit native-custody layer.
 * A wrapper note is never relabeled as a spendable native self-custody balance. */
import assert from 'node:assert/strict';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { privateFailureDiagnostic } from '../../execution/account/reconciliation/failure-diagnostics.mjs';
import { assertOwnedFlatPortfolio } from '../../accounts/authority/flat-portfolio-authority.mjs';
import { assertOwnedNativeClaimSystem } from '../../operations/deployments/claims/deploy-native-claims.mjs';
import { assertOwnedClaimObserver, ownedClaimObserverBindings } from './owned-state.mjs';
import { assertOwnedClaimOperatorQuorum } from './operators.mjs';
import {originalNativeClaimAssetUnitsV1} from './native-claim-asset-units-v1.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
const originalViews = new WeakMap();
export function readOriginalNativeClaimPortfolioViewV1(view, runtime) {
  assert.equal(arguments.length, 2); const original = originalViews.get(view);
  assert.ok(original && original.runtime === runtime, 'CLAIM_PORTFOLIO_ORIGINAL_VIEW_REQUIRED');
  original.check(); return Object.freeze({runtime, claims: original.claims, portfolio: original.portfolio});
}


function custodyFailureDiagnostic(error, fallback) {
  let diagnostic;
  try { diagnostic = privateFailureDiagnostic(error, fallback); }
  catch { diagnostic = privateFailureDiagnostic(null, fallback); }
  // Optional owner-only labels: omit timings, values, identities and raw errors.
  const { code, causeCode, causeCodes } = diagnostic;
  return Object.freeze({ code, causeCode, causeCodes });
}

export function projectNativeClaimPosition(assetView, config, ready, units=null) {
  assert.equal(assetView.asset.assetId.length, 64, 'CLAIM_PORTFOLIO_ASSET');
  assert.ok(config.nativeFamily === '1' || config.nativeFamily === '2', 'CLAIM_PORTFOLIO_NATIVE_FAMILY');
  const available = assetView.status === 'LIVE' ? assetView.balances.available : null;
  return Object.freeze({ kind: 'CUSTODIAL_NATIVE_CLAIM', assetId: assetView.asset.assetId,
    nativeSymbol: units?.nativeSymbol??(config.nativeFamily === '1' ? 'BTC' : 'SOL'),
    ...(units?.nativeAssetKind?{nativeAssetKind:units.nativeAssetKind,decimals:units.decimals,atomicUnit:units.atomicUnit,mint:units.mint}:{}),
    nativeGenesis: config.nativeGenesis, availablePrivateClaims: available,
    custodyObservation: ready ? 'CURRENT_QUORUM' : 'UNAVAILABLE',
    nativeSelfCustody: false, underlyingSpendable: false,
    redemption: 'EXPLICIT_BURN_TICKET_AND_ORIGINAL_NATIVE_DELIVERY',
    independentOperators: false,
    assurance: 'LOCAL_THREE_OF_FOUR_OBSERVATIONS_WITH_COMMON_HOST_AND_NATIVE_CUSTODIAN_TRUST' });
}

/** The regular portfolio supplies note ownership. A genuine claim quorum
 * separately rechecks complete retained native inventory before this view can
 * label custody current. Missing observations never become a zero balance. */
export function createNativeClaimPortfolioView(input) {
  exactRecord(input, ['runtime', 'claims', 'observer', 'quorum', 'portfolio']);
  const { runtime, claims, observer, quorum, portfolio } = input;
  assertOwnedNativeClaimSystem(runtime, claims); assertOwnedFlatPortfolio(runtime, portfolio);
  assertOwnedClaimObserver(observer); assertOwnedClaimOperatorQuorum(quorum, observer);
  assert.equal(ownedClaimObserverBindings(observer).system, claims, 'CLAIM_PORTFOLIO_SYSTEM');
  const assets = claims.configs.map(config => {
    const matches = portfolio.registry.filter(asset => asset.token === config.wrapper
      && asset.pool === config.pool && asset.scope === config.scope && asset.policy === config.policy);
    assert.equal(matches.length, 1, 'CLAIM_PORTFOLIO_REGISTERED_WRAPPER'); return matches[0];
  });
  const check = () => {assertOwnedNativeClaimSystem(runtime, claims); assertOwnedFlatPortfolio(runtime, portfolio);
    assertOwnedClaimObserver(observer); assertOwnedClaimOperatorQuorum(quorum, observer);
    assert.equal(ownedClaimObserverBindings(observer).system, claims, 'CLAIM_PORTFOLIO_SYSTEM');};
  const ownerView = async function ownerView() {
    assertOwnedNativeClaimSystem(runtime, claims); assertOwnedFlatPortfolio(runtime, portfolio);
    assertOwnedClaimOperatorQuorum(quorum, observer);
    const view = await portfolio.ownerView();
    const positions = [];
    for (let index = 0; index < claims.configs.length; index++) {
      const config = claims.configs[index], asset = view.assets.find(item => item.asset.assetId === assets[index].assetId);
      assert.ok(asset, 'CLAIM_PORTFOLIO_MISSING_ASSET');
      let ready = false, diagnostic;
      if (view.status === 'LIVE' && view.coherent === true && asset.status === 'LIVE') {
        try {
          const health = await quorum.health({ claimDomain: claimDomainCommitment(config), mode: 'ingress' });
          ready = health.head.hash === view.observed.blockHash
            && health.head.number === view.observed.blockNumber
            && health.head.timestamp === view.observed.timestamp;
          if (ready) {
            const current = await observer.read(); await observer.assertCurrent(current);
            ready = current.head.hash === health.head.hash;
          }
          if (!ready) diagnostic = custodyFailureDiagnostic(null, 'CLAIM_PORTFOLIO_HEAD_MISMATCH');
        } catch (error) {
          // Even a failed final current-head check cannot leave custody ready.
          // The private note amount can remain known while custody is unavailable.
          ready = false;
          diagnostic = custodyFailureDiagnostic(error, 'CLAIM_PORTFOLIO_CUSTODY_UNAVAILABLE');
        }
      } else diagnostic = custodyFailureDiagnostic(null, 'CLAIM_PORTFOLIO_PRIVATE_VIEW_UNAVAILABLE');
      const position = projectNativeClaimPosition(asset, config, ready,originalNativeClaimAssetUnitsV1(runtime,claims,config));
      positions.push(diagnostic ? Object.freeze({ ...position, custodyDiagnostic: diagnostic }) : position);
    }
    check(); return { ...view, nativeClaims: positions };
  };
  originalViews.set(ownerView, {runtime, claims, portfolio, check}); return ownerView;
}
