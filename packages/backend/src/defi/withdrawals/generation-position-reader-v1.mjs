/** Read-only selection of an already retained generation and official share
 * preview. Brand checks stay with the canonical catalogue/exit owners. */
/**
 * @typedef {{assetId:string,pool:string}} Asset
 * @typedef {{registry:Asset[]}} Portfolio
 * @typedef {{runtime:object,portfolio:Portfolio,generationId:string}} Membership
 * @typedef {{account:object,vault:{observe:()=>Promise<unknown>,observePrivateShares:(input:{amount:string,holder:string})=>Promise<unknown>}}} Original
 * @typedef {{service:object,original:Original,membership:Membership,shareAssetId:string}} Entry
 * @typedef {{assets:{asset:{assetId:string},status:string,balances:{available:string}}[]}} PortfolioView
 */
/** @param {{runtime:object,catalogue:object,need:(condition:unknown,code:string)=>asserts condition,originalBinding:(runtime:object,service:object)=>Original,assertCatalogue:(catalogue:object,binding:{runtime:object})=>unknown,assertAccount:(catalogue:object,account:object)=>Membership,isOfficial:(vault:Original['vault'])=>boolean}} ports */
export function createGenerationPositionReaderV1(ports) {
 const {runtime,catalogue,originalBinding,assertCatalogue,assertAccount,isOfficial}=ports;
 /** @type {(condition:unknown,code:string)=>asserts condition} */ const need=ports.need;
  /** @param {Entry} entry */
  function genuine(entry) {
    assertCatalogue(catalogue, { runtime });
    need(originalBinding(runtime, entry.service) === entry.original, 'ORIGINAL_SERVICE_CHANGED');
    const current = assertAccount(catalogue, entry.original.account);
    need(current.runtime === runtime && current.portfolio === entry.membership.portfolio
      && current.generationId === entry.membership.generationId, 'ORIGINAL_GENERATION_CHANGED');
  }
  /** @param {Entry} entry @param {PortfolioView} portfolioView */
  async function readOriginalPositionVault(entry, portfolioView) {
    genuine(entry);
    if (!isOfficial(entry.original.vault)) return entry.original.vault.observe();
    const share = portfolioView.assets.find(value => value.asset.assetId === entry.shareAssetId);
    const asset = entry.membership.portfolio.registry.find(value => value.assetId === entry.shareAssetId);
    need(share?.status === 'LIVE' && asset, 'ORIGINAL_SHARE_POSITION_UNAVAILABLE');
    return entry.original.vault.observePrivateShares({ amount: share.balances.available, holder: '0x' + asset.pool });
  }
 return Object.freeze({genuine,readOriginalPositionVault});
}
