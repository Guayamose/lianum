/** Read each registered account independently and project public data only. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
export const FLAT_PRIVATE_PORTFOLIO_VIEW_PROFILE_V1 =
  "OWNED_FLAT_PRIVATE_PORTFOLIO_V1";
/** @typedef {{assetId: string, symbol: string, decimals: number}} Asset */
/** @typedef {{blockHash: string, blockNumber: string, timestamp: string}} Observation */
/** @typedef {{asset: Asset, observed: Observation | null, status: string}} AccountView */
/** @template {AccountView} V
 * @typedef {{version: 1, profile: typeof FLAT_PRIVATE_PORTFOLIO_VIEW_PROFILE_V1,
 * status: 'UNAVAILABLE'|'PARTIAL'|'LIVE'|'STALE', coherent: boolean,
 * observed: Observation | null, assets: V[],
 * capabilities: {coordinatorRestart: true, keeperRestart: false,
 * crossAssetAtomicConversion: false, privateDeFiComposability: false, fullWalletAcceptance: false}}} PortfolioView */
/** @param {{immutable: <T>(value: T) => T}} ports */
export function createFlatPortfolioOwnerReaderV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, ["immutable"]);
  const { immutable } = ports;
  assert.equal(typeof immutable, "function");
  /** @template {AccountView} V
   * @param {Array<{asset: Asset, account: {ownerView(): Promise<V>}}>} accounts
   * @returns {Promise<PortfolioView<V>>} */
  async function readFlatPortfolioOwnerViewV1(accounts) {
    const assets = [];
    for (const child of accounts) {
      const view = await child.account.ownerView();
      assert.equal(
        view.asset.assetId,
        child.asset.assetId,
        "FLAT_PORTFOLIO_VIEW_ASSET",
      );
      assert.equal(view.asset.symbol, child.asset.symbol);
      assert.equal(view.asset.decimals, child.asset.decimals);
      assets.push(view);
    }
    const observed = assets.filter(
      /** @returns {view is V & {observed: Observation}} */
      (view) => view.observed !== null,
    );
    const coherent =
      observed.length === assets.length &&
      observed.every(
        (view) =>
          view.observed.blockHash === observed[0].observed.blockHash &&
          view.observed.blockNumber === observed[0].observed.blockNumber &&
          view.observed.timestamp === observed[0].observed.timestamp,
      );
    const status =
      observed.length === 0
        ? "UNAVAILABLE"
        : observed.length < assets.length
          ? "PARTIAL"
          : coherent && assets.every((view) => view.status === "LIVE")
            ? "LIVE"
            : "STALE";
    /** @type {PortfolioView<V>} */
    const result = {
      version: 1,
      profile: FLAT_PRIVATE_PORTFOLIO_VIEW_PROFILE_V1,
      status,
      coherent,
      observed: coherent ? observed[0].observed : null,
      assets,
      capabilities: {
        coordinatorRestart: true,
        keeperRestart: false,
        crossAssetAtomicConversion: false,
        privateDeFiComposability: false,
        fullWalletAcceptance: false,
      },
    };
    return immutable(result);
  }

  return readFlatPortfolioOwnerViewV1;
}
