/** Pure arithmetic of the original Blue supply observation. The owner still
 * authenticates the transaction, original fixture and canonical block. */
import assert from 'node:assert/strict';
/** @typedef {{totalAssets:string,totalShares:string,previewMint:string,maxMint:string,market:string[],position:string[],morphoUnderlying:string,vaultUnderlying:string,solverShares:string,routerShares:string}} SupplyObservation */
/** @param {SupplyObservation} before @param {SupplyObservation} after @param {bigint} spent @param {bigint} shares */
export function assertOriginalBlueSupplyAccountingV1(before,after,spent,shares) {
      assert.equal(spent,BigInt(before.previewMint),'BLUE_GRAPH_ORIGINAL_PREVIEW');assert.ok(shares<=BigInt(before.maxMint));
      const numerator=shares*(BigInt(before.market[0])+1n),denominator=BigInt(before.market[1])+1_000_000n;
      assert.equal(spent,(numerator+denominator-1n)/denominator,'BLUE_GRAPH_ORIGINAL_SHARE_ROUNDING');
      assert.equal(BigInt(after.totalShares)-BigInt(before.totalShares),shares,'BLUE_GRAPH_EXACT_POSITION_SHARES');
      assert.equal(BigInt(after.market[0])-BigInt(before.market[0]),spent,'BLUE_GRAPH_EXACT_MARKET_ASSETS');
      assert.equal(BigInt(after.market[1])-BigInt(before.market[1]),shares,'BLUE_GRAPH_EXACT_MARKET_SHARES');
      assert.equal(before.position[0],before.totalShares,'BLUE_GRAPH_EXACT_POSITION_BACKING');
      assert.equal(after.position[0],after.totalShares,'BLUE_GRAPH_EXACT_POSITION_BACKING');
      assert.equal(BigInt(after.morphoUnderlying)-BigInt(before.morphoUnderlying),spent,'BLUE_GRAPH_EXACT_TOKEN_BACKING');
      for(const key of /** @type {const} */ (['solverShares','routerShares','vaultUnderlying']))assert.equal(after[key],before[key],'BLUE_GRAPH_NO_UNCLAIMED_POSITION');
      for(const state of [before,after]){
        for(const index of [2,3,5])assert.equal(state.market[index],'0','BLUE_GRAPH_NO_DEBT');
        for(const index of [1,2])assert.equal(state.position[index],'0','BLUE_GRAPH_NO_DEBT');
        const assets=BigInt(state.totalShares)*(BigInt(state.market[0])+1n)/(BigInt(state.market[1])+1_000_000n);
        assert.equal(BigInt(state.totalAssets),assets,'BLUE_GRAPH_ORIGINAL_POSITION_VALUE');
      }
}
