/** Complete one already-authenticated delivery observation. Optional cost
 * reads cannot replace or bypass receipt and canonical-head checks. */
import assert from 'node:assert/strict';
/** @typedef {{hash:string,number:string}} Header */
/** @typedef {{header:Header,ledger:{publicState:{actualAssetBalance:string,backedAmount:string,surplus:string}}}} Current */
/** @typedef {{gasUsed:string,effectiveGasPrice:string}} Receipt */
/** @typedef {{gas:string,gasPrice:string,from:string}} Wire */
/** @typedef {{assetObservation:{before:{solverInput:string},after:{solverInput:string}}}} Arrival */
/**
 * @template Intent, Descriptor, Source
 * @param {{query:{transactionHash:string},descriptor:Descriptor,wire:Wire,receipt:Receipt,arrival:Arrival,spent:bigint,amount:string,row:{prepared:{funds:{balanceWei:string}}},current:Current,context:{sourceAssetIdentity:string,targetAssetIdentity:string},intent:Intent,header:Header,beforeSource:Source,afterSource:Source}} data
 * @param {{runtime:{balance:(from:string,at:string)=>Promise<bigint>,checkReceipt:(receipt:Receipt)=>Promise<unknown>},sourceReader:{assertCanonical:(source:Source)=>Promise<unknown>},targetReader:{assertCurrent:(current:Current)=>Promise<unknown>},inspect:(input:{descriptor:Descriptor,transactionHash:string,blockHash:string,observedHeadHash:string,solverInputBefore:string,solverInputAfter:string,inputSpent:string,outputDelivered:string,gasUsed:string,gasPrice:string,nativeBalanceBefore:string,nativeBalanceAfter:string,targetBacking:{held:string,liabilities:string,surplus:string}})=>unknown}} ports
 */
export async function completeOriginalDeliveryObservationV1(data,ports) {
 const {query,descriptor,wire,receipt,arrival,spent,amount,row,current,context,intent,header,beforeSource,afterSource}=data;
 const {runtime,sourceReader,targetReader,inspect:inspectEvmGraphDeliveryEconomicsV1}=ports;
 /** @param {string} value */ const bare=value=>value.slice(2);
 /** @param {string} value */ const quantity=value=>{assert.ok(typeof value==='string'&&/^0x(0|[1-9a-f][0-9a-f]*)$/.test(value));return BigInt(value);};
 const detached=structuredClone;
    // Financial inclusion remains subject to the original guards below. A missing
    // optional native-cost read never reclassifies that canonical delivery.
    let economics;
    try {
      const gasUsed = quantity(receipt.gasUsed);
      assert.ok(gasUsed > 0n && gasUsed <= BigInt(wire.gas), 'METAMORPHO_GRAPH_ORIGINAL_GAS');
      assert.equal(quantity(receipt.effectiveGasPrice).toString(), wire.gasPrice, 'METAMORPHO_GRAPH_ORIGINAL_GAS');
      economics = inspectEvmGraphDeliveryEconomicsV1({ descriptor, transactionHash: query.transactionHash,
        blockHash: bare(header.hash), observedHeadHash: bare(current.header.hash),
        solverInputBefore: arrival.assetObservation.before.solverInput, solverInputAfter: arrival.assetObservation.after.solverInput,
        inputSpent: spent.toString(), outputDelivered: amount, gasUsed: gasUsed.toString(), gasPrice: wire.gasPrice,
        nativeBalanceBefore: row.prepared.funds.balanceWei, nativeBalanceAfter: String(await runtime.balance(wire.from, header.number)),
        targetBacking: { held: current.ledger.publicState.actualAssetBalance, liabilities: current.ledger.publicState.backedAmount,
          surplus: current.ledger.publicState.surplus } });
    } catch {
      economics = detached({ profile: 'ORIGINAL_EVM_DEFI_DELIVERY_ECONOMICS_V1', status: 'UNKNOWN',
        transactionHash: query.transactionHash, blockHash: bare(header.hash), observedHeadHash: bare(current.header.hash),
        sourceAssetIdentity: context.sourceAssetIdentity, targetAssetIdentity: context.targetAssetIdentity,
        actualInputSpentAtomic: null, deliveredOutputAtomic: null, nativeGasCostWei: null, targetBacking: null,
        errorCode: 'ORIGINAL_DELIVERY_COST_OBSERVATION_UNAVAILABLE', futureSolvencyEstablished: false,
        netSolverWealthLossEstablished: false, outputsValuedAsSourceAtomic: false });
    }
    await runtime.checkReceipt(receipt); await sourceReader.assertCanonical(beforeSource); await sourceReader.assertCanonical(afterSource);
    await targetReader.assertCurrent(current);
    return { intent, arrival, wire, header, tip: current.header, economics };
}
