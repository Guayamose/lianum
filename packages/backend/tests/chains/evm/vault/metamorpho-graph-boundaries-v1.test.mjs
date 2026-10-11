import {generateKeyPairSync,sign,createHash,createPublicKey,verify,randomBytes} from 'node:crypto';
import {mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {types} from 'node:util';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonicalClaimRecordDataV1} from '../../../../src/claims/storage/segmented-record-store.mjs';
import {assertMorphoBluePositionRedemptionAccountingV1} from '../../../../src/defi/vaults/morpho-vault-redemption-accounting-v1.mjs';
/** Pure host boundaries only. No chain, compilation, prover or financial
 * acceptance. The fresh original graph flow still requires real acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, UNISWAP_GRAPH_DELIVERY_PROFILE_V1, MORPHO_BLUE_POSITION_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  evmGraphDeliveryTermsV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1, inspectEvmGraphDeliveryEconomicsV1 }
  from '../../../../src/chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { encodePrivateExternalDelivery } from '@lianum/engine/encoding/private-external-delivery';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '@lianum/engine/encoding/evm-vault-delivery';
import { assertOwnedEvmGraphDeliveryObserverV1, assertOwnedEvmGraphDeliveryFactsV1,
  assertOwnedEvmGraphDeliveryDescriptorV1 } from '../../../../src/chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { prepareOwnedMetaMorphoGraphDescriptorV1, assertOwnedMetaMorphoGraphDeliveryFactsV1, prepareOwnedMorphoBluePositionGraphDescriptorV1,
  prepareOwnedUniswapGraphDescriptorV1, assertOwnedUniswapGraphDeliveryFactsV1, readOriginalEvmGraphDeliveryEconomicFactsV1 }
  from '../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';

import { validateOwnerGraphReview, canonicalOwnerGraphTerms, ownerFlatDeFiEconomicAllocationV1 } from '../../../../../mobile-protocol/src/wallet/contracts/owner-graph-review-v1.mjs';
import { accountReviewDetails } from '../../../../../mobile-protocol/src/wallet/client/view-model.mjs';

const h = n => n.toString(16).padStart(2, '0').repeat(32), a = n => n.toString(16).padStart(2, '0').repeat(20);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const limbs = hash => hash.match(/.{8}/g).map(value => BigInt('0x' + value).toString());
function official() {
  const scope = h(10), policy = h(11), output = h(12);
  return { profile: METAMORPHO_GRAPH_DELIVERY_PROFILE_V1,
    context: { genesisHash: h(1), ledgerNamespace: h(2), sourceLedgerNamespace: h(2),
      sourceAssetIdentity: h(3), targetAssetIdentity: h(4), routerRuntimeCodeSHA256: h(5) },
    plan: { identity: { chainId: '31337', router: a(1), solver: a(2), inputAsset: a(3), outputAsset: a(4),
      protocol: a(4), targetPool: a(5), inputCode: h(6), outputCode: h(7), protocolCode: h(7),
      poolCode: h(9), scope, policy }, protocolKind: 'METAMORPHO_V1_EXACT_SHARE_MINT', fee: null,
    route: { maximumInput: '1000000', outputAmount: '1000000000000000000', validFrom: '1000', validUntil: '1100' },
    ownerPublicInputs: [...limbs(scope), ...limbs(policy), '900', '1200', '1000000000000000000', ...limbs(output)] } };
}
test('official calldata remains the original D27 mint while PAEG binds chain, namespace and source asset', () => {
  const descriptor = official(), intent = { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' };
  const calldata = encodeEvmGraphDeliveryCallV1(intent);
  assert.equal(calldata, encodePrivateExternalDelivery({ plan: descriptor.plan, receiptCommitment: h(13), proof: intent.proof }).calldata);
  assert.deepEqual(decodeEvmGraphDeliveryCallV1(calldata, descriptor), intent);
  const commitment = evmGraphDeliveryDescriptorCommitmentV1(descriptor);
  for (const key of ['genesisHash', 'sourceAssetIdentity', 'routerRuntimeCodeSHA256']) {
    const changed = structuredClone(descriptor); changed.context[key] = h(30);
    assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
    assert.equal(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: changed }), calldata);
  }
  const changed = structuredClone(descriptor); changed.context.ledgerNamespace = changed.context.sourceLedgerNamespace = h(31);
  assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
  assert.equal(evmGraphDeliveryTermsV1(descriptor).route.assetAmount, '1000000');
});
test('descriptor and calldata reject unsupported protocols, crossed ledgers and a substituted owner output', () => {
  const intent = { descriptor: official(), receiptKeyCommitment: h(13), proof: 'deadbeef' };
  for (const mutate of [d => d.profile = 'METAMORPHO_CALLER_PROFILE', d => d.context.sourceLedgerNamespace = h(32),
    d => d.plan.protocolKind = 'UNISWAP_V3_EXACT_OUTPUT_SINGLE', d => d.plan.identity.chainId = '1',
    d => d.plan.route.outputAmount = '1000', d => d.plan.ownerPublicInputs[18] = '0']) {
    const changed = structuredClone(intent.descriptor); mutate(changed);
    assert.throws(() => validateEvmGraphDeliveryDescriptorV1(changed));
  }
  const encoded = encodeEvmGraphDeliveryCallV1(intent), rebound = structuredClone(intent.descriptor);
  rebound.plan.ownerPublicInputs.splice(19, 8, ...limbs(h(33)));
  assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(rebound), evmGraphDeliveryDescriptorCommitmentV1(intent.descriptor));
  assert.notEqual(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: rebound }), encoded);
  assert.throws(() => decodeEvmGraphDeliveryCallV1(encoded + '00', intent.descriptor));
});
test('legacy vault framing and calldata are preserved exactly', () => {
  const identity = { chainId: '31337', genesisHash: h(1), ledgerNamespace: h(2), adapterVersion: '1',
    router: a(3), routerCodeSHA256: h(4), routerVersion: '1', solver: a(5), asset: a(6), assetCodeSHA256: h(7),
    assetIdentity: h(8), vault: a(9), vaultCodeSHA256: h(10), shareIdentity: h(11), vaultDomain: h(12), vaultRuntimeId: h(13),
    targetPool: a(14), targetPoolCodeSHA256: h(15), targetDomain: h(16), targetScope: h(17), targetPolicy: h(18) };
  const descriptor = { identity, route: { assetAmount: '100', shareAmount: '100', executionFrom: '1000', executionUntil: '1100' },
    publicInputs: [...limbs(identity.targetScope), ...limbs(identity.targetPolicy), '900', '1200', '100', ...limbs(h(19))].map(word) };
  const intent = { descriptor, receiptKeyCommitment: h(20), proof: 'deadbeef' };
  assert.equal(evmGraphDeliveryDescriptorCommitmentV1(descriptor), evmVaultDeliveryDescriptorCommitment(descriptor));
  assert.equal(encodeEvmGraphDeliveryCallV1(intent), encodeEvmVaultDeliveryCall(intent));
});
test('a valid descriptor, copied observer and fabricated facts acquire no original authority', () => {
  const descriptor = official(), runtime = Object.freeze({}), system = Object.freeze({}), router = Object.freeze({ destinationPoolIndex: 1 });
  const observer = Object.freeze({ identity: descriptor.plan.identity,
    binding: Object.freeze({ poolIndex: 1, recipientIndex: '1', genesis: h(1), asset: h(4), sourceEndpoint: a(2), destinationEndpoint: a(1) }),
    profile: METAMORPHO_GRAPH_DELIVERY_PROFILE_V1 });
  assert.throws(() => assertOwnedEvmGraphDeliveryObserverV1(observer, { runtime, system, poolIndex: 1 }));
  assert.throws(() => assertOwnedEvmGraphDeliveryDescriptorV1(runtime, system, router, observer, descriptor));
  assert.throws(() => prepareOwnedMetaMorphoGraphDescriptorV1({ observer, router, route: descriptor.plan.route,
    ownerPublicInputs: descriptor.plan.ownerPublicInputs }));
  const fabricated = Object.freeze({ status: 'observed', intent: { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' } });
  assert.throws(() => assertOwnedEvmGraphDeliveryFactsV1(fabricated, { observer }));
  assert.throws(() => assertOwnedMetaMorphoGraphDeliveryFactsV1(fabricated, { observer }));
});

function uniswap() {
  const descriptor = official(); descriptor.profile = UNISWAP_GRAPH_DELIVERY_PROFILE_V1;
  descriptor.plan.protocolKind = 'UNISWAP_V3_EXACT_OUTPUT_SINGLE'; descriptor.plan.fee = '3000';
  descriptor.plan.identity.protocol = a(6); descriptor.plan.identity.protocolCode = h(8);
  descriptor.plan.route.maximumInput = '2000'; descriptor.plan.route.outputAmount = '1000';
  descriptor.plan.ownerPublicInputs[18] = '1000'; return descriptor;
}
test('fixed Uniswap framing preserves the original exact-output D27 wire and rejects fee, protocol, ledger and owner substitution', () => {
  const descriptor = uniswap(), intent = { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' };
  const calldata = encodeEvmGraphDeliveryCallV1(intent);
  assert.equal(calldata, encodePrivateExternalDelivery({ plan: descriptor.plan, receiptCommitment: h(13), proof: intent.proof }).calldata);
  assert.deepEqual(decodeEvmGraphDeliveryCallV1(calldata, descriptor), intent);
  const commitment = evmGraphDeliveryDescriptorCommitmentV1(descriptor);
  assert.notEqual(commitment, evmGraphDeliveryDescriptorCommitmentV1(official()));
  for (const key of ['genesisHash', 'sourceAssetIdentity', 'targetAssetIdentity', 'routerRuntimeCodeSHA256']) {
    const changed = structuredClone(descriptor); changed.context[key] = h(30);
    assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(changed), commitment);
    assert.equal(encodeEvmGraphDeliveryCallV1({ ...intent, descriptor: changed }), calldata);
  }
  for (const mutate of [d => d.profile = METAMORPHO_GRAPH_DELIVERY_PROFILE_V1,
    d => d.plan.fee = '500', d => d.plan.protocolKind = 'METAMORPHO_V1_EXACT_SHARE_MINT',
    d => d.plan.identity.chainId = '1', d => d.plan.identity.protocol = d.plan.identity.outputAsset,
    d => d.context.sourceLedgerNamespace = h(31), d => d.plan.ownerPublicInputs[18] = '999']) {
    const changed = structuredClone(descriptor); mutate(changed);
    assert.throws(() => validateEvmGraphDeliveryDescriptorV1(changed));
  }
  const terms = evmGraphDeliveryTermsV1(descriptor);
  assert.equal(terms.route.assetAmount, '2000'); assert.equal(terms.route.shareAmount, '1000');
  assert.throws(() => decodeEvmGraphDeliveryCallV1(calldata + '00', descriptor));
});
test('Uniswap owner consent distinguishes input cap and private output; copied observers and facts retain no authority', () => {
  const descriptor = uniswap(), plan = descriptor.plan, identity = plan.identity;
  const route = { routeProfile: 'REGISTERED_LOCAL_EVM_UNISWAP_V3_V1', family: '3', protocolKind: plan.protocolKind, fee: plan.fee,
    chainId: identity.chainId, genesis: descriptor.context.genesisHash, router: identity.router, protocol: identity.protocol,
    inputToken: identity.inputAsset, outputToken: identity.outputAsset, solver: identity.solver, sourcePool: a(7), targetPool: identity.targetPool,
    sourceAssetIdentity: descriptor.context.sourceAssetIdentity, targetAssetIdentity: descriptor.context.targetAssetIdentity,
    targetCommitment: h(12), descriptorCommitment: evmGraphDeliveryDescriptorCommitmentV1(descriptor),
    solverMaximumInputAmount: '2000', deliveredOutputAmount: '1000', executionFrom: '1000', executionUntil: '1100', settleBefore: '1200',
    payoutCommitment: h(13), deliveryRiskCommitment: h(14), deliveryLossClause: 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1',
    protocolAmountsPublic: true, publicNetwork: false };
  const review = { version: 2, profile: 'ORIGINAL_MANUAL_FLAT_GRAPH_REVIEW_V2', requestId: 'uniswap_host_only', kind: 'GRAPH',
    ownerOperationRef: h(15), assetId: h(16), asset: { assetId: h(16), symbol: 'PALT', decimals: 6 },
    graph: { version: 1, profile: 'OWNER_PRIVATE_EXECUTION_GRAPH_V1', legs: [{ slot: 0, route,
      localCommitment: h(17), dependencyCommitment: h(18) }], edges: [], graphTermsSHA256: h(19) },
    envelope: h(20), fundingNotBefore: '1000', fundingValidUntil: '1050', executionUntil: '1100', settleBefore: '1200',
    identitySHA256: h(21), sourceAmount: '5000000', reservedAmount: '1200', changeAmount: '4998800', changeRecipient: a(8),
    recoveryRecipient: a(9), originalAccountLifetime: h(22), observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY',
    solverOwnLiquidity: true, settlementEstablished: false, recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY' };
  validateOwnerGraphReview(review);
  review.economicAllocation=ownerFlatDeFiEconomicAllocationV1(review);
  validateOwnerGraphReview(review);
  assert.equal(review.economicAllocation.solverInvoiceOnTAtomic,'1200');
  assert.equal(review.economicAllocation.solverInvoiceOnFAtomic,'0');
  assert.equal(review.economicAllocation.ownerRecoveryOnFAtomic,'1200');
  assert.equal(review.economicAllocation.minimumInputCashMarginOnTAtomic,'-800');
  assert.deepEqual(review.economicAllocation.protocolFee,{kind:'IN_ORIGINAL_INPUT_SPENT',rateMillionths:'3000'});
  assert.equal(review.economicAllocation.netSolverWealthLossEstablished,false);
  assert.equal(review.economicAllocation.privateOutputsValuedAsSourceAtomic,false);
  for(const mutate of [a=>a.solverInvoiceOnFAtomic='1200',a=>a.ownerRecoveryOnFAtomic='0',a=>a.minimumInputCashMarginOnTAtomic='200',a=>a.protocolFee.rateMillionths='500',a=>a.netSolverWealthLossEstablished=true]){
    const changed=structuredClone(review);mutate(changed.economicAllocation);assert.throws(()=>validateOwnerGraphReview(changed),/ECONOMIC_ALLOCATION_CHANGED/);
  }
  const canonical = canonicalOwnerGraphTerms(review, false, true);
  const rows = accountReviewDetails({ graph: review });
  assert.ok(rows.some(([key, value]) => key.includes('límite del solver') && value.includes('2000')));
  assert.ok(rows.some(([key, value]) => key.includes('token de salida privado') && value.includes('1000') && value.includes(identity.outputAsset)));
  assert.ok(rows.some(([key]) => key.includes('exposición')));
  assert.ok(rows.some(([key,value])=>key==='Pago condicional al solver'&&value.includes('1200')&&value.includes('0 con recuperación F')));
  assert.ok(rows.some(([key,value])=>key==='Riesgo económico del solver'&&value.includes('no demuestra una pérdida patrimonial neta')));
  const changed = structuredClone(review); changed.graph.legs[0].route.deliveredOutputAmount = '1001';
  assert.notEqual(canonicalOwnerGraphTerms(changed, false, true), canonical);
  for (const mutate of [r => r.fee = '500', r => r.protocolAmountsPublic = false, r => r.publicNetwork = true,
    r => r.outputToken = r.inputToken, r => r.deliveredShares = '1000', r => r.solverMaximumInputAmount = '0']) {
    const value = structuredClone(review); mutate(value.graph.legs[0].route); assert.throws(() => validateOwnerGraphReview(value));
  }
  const runtime = Object.freeze({}), system = Object.freeze({}), router = Object.freeze({ destinationPoolIndex: 1 });
  const observer = Object.freeze({ identity, profile: UNISWAP_GRAPH_DELIVERY_PROFILE_V1 });
  assert.throws(() => assertOwnedEvmGraphDeliveryObserverV1(observer, { runtime, system, poolIndex: 1 }));
  assert.throws(() => prepareOwnedUniswapGraphDescriptorV1({ observer, router, route: plan.route, ownerPublicInputs: plan.ownerPublicInputs }));
  const fabricated = Object.freeze({ status: 'observed', intent: { descriptor, receiptKeyCommitment: h(13), proof: 'deadbeef' } });
  assert.throws(() => assertOwnedEvmGraphDeliveryFactsV1(fabricated, { observer }));
  assert.throws(() => assertOwnedUniswapGraphDeliveryFactsV1(fabricated, { observer }));
  assert.throws(() => readOriginalEvmGraphDeliveryEconomicFactsV1(fabricated, observer), /ORIGINAL_ECONOMIC_FACTS/);
});

test('original delivery economics conserve token debit, native gas and output backing without inventing a net loss or fee', async () => {
  const trace = { descriptor: uniswap(), transactionHash: h(40), blockHash: h(41), observedHeadHash: h(42),
    solverInputBefore: '5000', solverInputAfter: '3300', inputSpent: '1700', outputDelivered: '1000',
    gasUsed: '21000', gasPrice: '1000000000', nativeBalanceBefore: '1000000000000000000', nativeBalanceAfter: '999979000000000000',
    targetBacking: { held: '1100', liabilities: '1000', surplus: '100' } };
  const result = inspectEvmGraphDeliveryEconomicsV1(trace);
  assert.equal(result.status, 'OBSERVED'); assert.equal(result.actualInputSpentAtomic, '1700'); assert.equal(result.unusedMaximumInputAtomic, '300');
  assert.equal(result.nativeGasCostWei, '21000000000000'); assert.equal(result.deliveredOutputAtomic, '1000');
  assert.equal(result.protocolFeeRateMillionths, '3000'); assert.equal(result.protocolFeeSeparatelyValuedAtomic, null);
  assert.equal(result.protocolFeeAddedToInputSpent, false); assert.equal(result.netSolverWealthLossEstablished, false);
  assert.equal(result.outputsValuedAsSourceAtomic, false); assert.equal(result.futureSolvencyEstablished, false);
  for (const mutate of [t => t.solverInputAfter = '3301', t => t.inputSpent = '2001', t => t.nativeBalanceAfter = '999978999999999999',
    t => t.outputDelivered = '999', t => t.targetBacking.held = '999', t => t.targetBacking.surplus = '101',
    t => t.inputSpent = '01700', t => t.netSolverWealthLossEstablished = true]) {
    const changed = structuredClone(trace); mutate(changed); assert.throws(() => inspectEvmGraphDeliveryEconomicsV1(changed));
  }
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.targetBacking));
  // Actual observer tail; fixed inert RPC ports prove that a missing optional
  // cost read does not hide or replace any original financial guard.
  const observerURL = import.meta.url.includes('/modules/chain-adapters/')
    ? new URL('./metamorpho-graph-delivery-observer-v1.mjs', import.meta.url)
    : new URL('../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs', import.meta.url);
  const source = await readFile(observerURL, 'utf8'), from = source.indexOf('    // Financial inclusion remains subject to the original guards below.');
  assert.ok(from > 0); const to = source.indexOf('\n  }\n  observer =', from); assert.ok(to > from);
  const ports = ['assert','bare','quantity','detached','inspectEvmGraphDeliveryEconomicsV1','query','descriptor','runtime','sourceReader','targetReader',
    'wire','receipt','arrival','spent','amount','row','current','context','intent','header','beforeSource','afterSource'];
  const tail = new Function(...ports, 'return (async()=>{' + source.slice(from, to) + '})();');
  const checks = [], runtime = { async balance(){ throw Error('HOST_COST_RPC_UNAVAILABLE'); },
    async checkReceipt(){ checks.push('receipt'); } }, sourceReader = { async assertCanonical(){ checks.push('source'); } },
    targetReader = { async assertCurrent(){ checks.push('current'); } };
  const call = () => tail(assert,value=>value.slice(2),value=>BigInt(value), value=>structuredClone(value), inspectEvmGraphDeliveryEconomicsV1,
    {transactionHash:trace.transactionHash},trace.descriptor,runtime,sourceReader,targetReader,
    {gas:'30000000',gasPrice:trace.gasPrice,from:'0x'+trace.descriptor.plan.identity.solver},
    {gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00'},
    {assetObservation:{before:{solverInput:trace.solverInputBefore},after:{solverInput:trace.solverInputAfter}}},
    1700n,'1000',{prepared:{funds:{balanceWei:trace.nativeBalanceBefore}}},
    {header:{hash:'0x'+trace.observedHeadHash},ledger:{publicState:{actualAssetBalance:'1100',backedAmount:'1000',surplus:'100'}}},
    trace.descriptor.context,{}, {hash:'0x'+trace.blockHash,number:'0x1'}, {}, {});
  assert.equal((await call()).economics.status,'UNKNOWN'); assert.deepEqual(checks,['receipt','source','source','current']);
  runtime.balance=async()=>BigInt(trace.nativeBalanceAfter); checks.length=0;
  assert.equal((await call()).economics.status,'OBSERVED'); assert.deepEqual(checks,['receipt','source','source','current']);
  runtime.checkReceipt=async()=>{ throw Error('HOST_ORIGINAL_FINANCIAL_GUARD'); };
  await assert.rejects(call(),/HOST_ORIGINAL_FINANCIAL_GUARD/);
});


// The new profile uses the unchanged D27/PAEG ABI, but cannot acquire the
// historical MetaMorpho identity or fabricate its original position custody.
test('original Blue position framing binds its distinct profile without granting custody to copies', () => {
  const descriptor=official();descriptor.profile=MORPHO_BLUE_POSITION_GRAPH_DELIVERY_PROFILE_V1;
  descriptor.plan.protocolKind='MORPHO_BLUE_V1_EXACT_SHARE_SUPPLY';
  const intent={descriptor,receiptKeyCommitment:h(13),proof:'deadbeef'};
  const encoded=encodeEvmGraphDeliveryCallV1(intent);
  assert.deepEqual(decodeEvmGraphDeliveryCallV1(encoded,descriptor),intent);
  assert.notEqual(evmGraphDeliveryDescriptorCommitmentV1(descriptor),evmGraphDeliveryDescriptorCommitmentV1(official()));
  const counterfeit=structuredClone(descriptor);counterfeit.profile=METAMORPHO_GRAPH_DELIVERY_PROFILE_V1;
  assert.throws(()=>validateEvmGraphDeliveryDescriptorV1(counterfeit));
  const observer=Object.freeze({identity:descriptor.plan.identity}),router=Object.freeze({identity:descriptor.plan.identity});
  assert.throws(()=>prepareOwnedMorphoBluePositionGraphDescriptorV1({observer,router,route:descriptor.plan.route,ownerPublicInputs:descriptor.plan.ownerPublicInputs}));
  assert.throws(()=>assertOwnedEvmGraphDeliveryObserverV1(observer,{runtime:{},system:{},poolIndex:1}));
});

test('actual Blue supply observer checks exact original share rounding and keeps NAV separate from input',async()=>{
  const url=import.meta.url.includes('/chain-adapters/')
    ?new URL('./metamorpho-graph-delivery-observer-v1.mjs',import.meta.url)
    :new URL('../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs',import.meta.url);
  const source=await readFile(url,'utf8'),begin='    } else if(blue) {',end='    } else {\n      assert.equal(spent, BigInt(before.previewMint)';
  assert.equal(source.split(begin).length-1,1);const start=source.indexOf(begin)+begin.length,finish=source.indexOf(end,start);assert(finish>start);
  const inspect=new Function('assert','before','after','spent','shares',source.slice(start,finish));
  const before={totalAssets:'0',totalShares:'1000000',previewMint:'2',maxMint:'9000000',
    market:['10','10000009','0','0','1','0'],position:['1000000','0','0'],morphoUnderlying:'10',vaultUnderlying:'0',solverShares:'0',routerShares:'0'};
  const after={...structuredClone(before),totalAssets:'2',totalShares:'2000001',market:['12','11000010','0','0','1','0'],position:['2000001','0','0'],morphoUnderlying:'12'};
  inspect(assert,before,after,2n,1000001n);
  // Correlated wrong market/position balances still fail the original ceil.
  const wrong=structuredClone(after);wrong.market[1]='11000009';wrong.position[0]=wrong.totalShares='2000000';
  assert.throws(()=>inspect(assert,before,wrong,2n,1000000n));
  const debt=structuredClone(after);debt.market[2]='1';assert.throws(()=>inspect(assert,before,debt,2n,1000001n));
  const unbacked=structuredClone(after);unbacked.morphoUnderlying='11';assert.throws(()=>inspect(assert,before,unbacked,2n,1000001n));
  const inventedNAV=structuredClone(after);inventedNAV.totalAssets='3';assert.throws(()=>inspect(assert,before,inventedNAV,2n,1000001n));
});


test('Blue shares-mode redemption preserves original floor rounding rather than Meta assets-mode rounding',()=>{
 const before={protocol:'0x'+a(1),marketId:'0x'+h(1),positionOwner:'0x'+a(2),assetTotalSupply:'100',market:{totalSupplyAssets:'10',totalSupplyShares:'10000009',totalBorrowAssets:'0',totalBorrowShares:'0',lastUpdate:'1',fee:'0'},position:{supplyShares:'2000001',borrowShares:'0',collateral:'0'},underlyingBalance:'10',vaultUnderlyingBalance:'0'};
 const after={...structuredClone(before),market:{...before.market,totalSupplyAssets:'9',totalSupplyShares:'9000008',lastUpdate:'2'},position:{...before.position,supplyShares:'1000000'},underlyingBalance:'9'};
 const result=assertMorphoBluePositionRedemptionAccountingV1({before,after,shares:'1000001',assets:'1'});assert.equal(result.publicRedemption,true);assert.equal(result.privateBalanceCredited,false);
 assert.throws(()=>assertMorphoBluePositionRedemptionAccountingV1({before,after,shares:'1000000',assets:'1'}));
 const forged=structuredClone(after);forged.position.supplyShares='999999';assert.throws(()=>assertMorphoBluePositionRedemptionAccountingV1({before,after:forged,shares:'1000001',assets:'1'}));
 const debt=structuredClone(after);debt.market.totalBorrowShares='1';assert.throws(()=>assertMorphoBluePositionRedemptionAccountingV1({before,after:debt,shares:'1000001',assets:'1'}));
});

test('actual device Blue and Aave redemption require confirmed original SHARE W39 and a separate one-use PoP before native latch',async()=>{
 for(const originalAave of [false,true]){
 const mapped=import.meta.url.includes('/modules/chain-adapters/');
 const protocolURL=mapped?new URL('../../../../../mobile-protocol/src/device-morpho-blue-redemption-v1.mjs',import.meta.url):new URL('../../../../../mobile-protocol/src/device-morpho-blue-redemption-v1.mjs',import.meta.url);
 const noteURL=mapped?new URL('../../../../../mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url):new URL('../../../../../mobile-protocol/src/device-external-flat-note-v1.mjs',import.meta.url);
 const P=await import(protocolURL),Note=await import(noteURL),redeemAction=originalAave?'REDEEM_AAVE':'REDEEM_BLUE',observeAction=originalAave?'OBSERVE_AAVE':'OBSERVE_BLUE',frameFor=originalAave?P.deviceAaveStaticRedemptionPermissionMessageV1:P.deviceMorphoBlueRedemptionPermissionMessageV1;
 const backendURL=mapped?new URL('../defi-adapters/device-morpho-blue-private-exit-v1.mjs',import.meta.url):new URL('../../../../src/defi/withdrawals/device-morpho-blue-private-exit-v1.mjs',import.meta.url);
 const original=await readFile(backendURL,'utf8');const body=original.replace(/^import .*?;$/gm,'').replace(/^export /gm,'');
 assert.equal((original.match(/const owned=new WeakMap\(\),requests=new WeakMap\(\)/g)||[]).length,1);
 const ports={assert,types,randomBytes,createHash,createPublicKey,verify,mkdtemp,chmod,join,dirname,Vault,canonicalClaimRecordDataV1,P,
  externalFlatExactV1:Note.externalFlatExactV1,normalizeExternalFlatSignatureV1:Note.normalizeExternalFlatSignatureV1};
 const directory=await mkdtemp(join(tmpdir(),'original-blue-private-exit-host-'));await chmod(directory,0o700);
 const runtime={metadata:{scratchDirectory:directory}},system={},account={},position={contract:{address:'0x'+a(9)}},protocols={vault:{address:'0x'+a(9)}};
 const pair=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=pair.publicKey.export({format:'jwk'}),pub='04'+Buffer.from(jwk.x,'base64url').toString('hex')+Buffer.from(jwk.y,'base64url').toString('hex');
 const descriptor={profile:Note.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:'https://127.0.0.1:5443',pairingId:h(70),devicePublicKey:pub,lifetime:h(71),poolTerms:{pool:a(8),poolCodeHash:h(1),scope:h(2),policy:h(3),assetIdentity:h(4),asset:a(9),assetCodeHash:h(5),genesis:h(6),domainCommitment:h(7),hub:a(7),hubCodeHash:h(8),hubDomain:h(9),ledgerNamespace:h(10)},assetMetadata:{kind:'ERC20',symbol:originalAave?'staticUSDC':'OMB1',decimals:12}};
 const binding={identity:{asset:a(3)},sender:a(4)},jobId=h(72),rootId=h(73),observed={blockNumber:'22',blockHash:h(74),timestamp:'1000'};
 let confirmed=false,sends=0,subjectReads=0,adapterCalls=0,service,lost=originalAave,recoveryConsumed=false,originalRecoveryToken=null;
 const intent={reference:null,kind:'redeem',amount:'1000001',minimumOutput:'1',deadline:'1180'};
 const result=()=>({phase:'OBSERVED',execution:{confirmation:{assets:'1'}},sendBlocked:false});
 const adapter={async validateQuote(value){assert.equal(value.amount,intent.amount);assert.equal(value.minimumOutput,intent.minimumOutput);assert.equal(value.deadline,intent.deadline);return{};},async prepareOnce(value){intent.reference=value.reference;adapterCalls++;return{};},async execute(ref,request){(originalAave?loaded.assertOriginalAaveStaticRedemptionRequestV1:loaded.assertOriginalBluePositionRedemptionRequestV1)(request,adapter,ref);assert.throws(()=>(originalAave?loaded.assertOriginalBluePositionRedemptionRequestV1:loaded.assertOriginalAaveStaticRedemptionRequestV1)(request,adapter,ref));assert.equal(ref,intent.reference);sends++;if(lost)throw Error('HOST_SAME_NATIVE_REPLY_LOST');return result();},async reconcile(ref){assert.equal(ref,intent.reference);return result();},async close(){return{closed:true};}};
 ports.assertOwnedFlatSystem=(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);};ports.assertOwnedOriginalMorphoBluePositionV1=(r,p)=>{assert.equal(r,runtime);assert.equal(p,position);};ports.assertOwnedMetaMorphoVault=(r,p)=>{assert.equal(r,runtime);assert.equal(p,adapter);};ports.isOwnedMorphoBluePositionVaultV1=p=>!originalAave&&p===adapter;ports.isOwnedDeviceAaveStaticVaultV1=p=>originalAave&&p===adapter;ports.assertOfficialAaveFixtureV1=(r,p)=>{assert.equal(r,runtime);assert.equal(p,protocols);};
 ports.assertOriginalDeviceExternalFlatNoteAuthorityV1=a=>{assert.equal(a,account);return descriptor;};ports.ownedMetaMorphoVaultBinding=()=>binding;
 // Explicitly inert lower native ports: no proof, runtime, funding or native
 // financial acceptance is supplied by this HOST. The AES/CAS body is actual.
 ports.readOriginalDeviceExternalFlatShareWithdrawalV1=async(a,q)=>{assert.equal(a,account);assert.equal(q.runtime,runtime);assert.equal(q.system,system);assert.equal(q.poolIndex,1);assert.equal(q.jobId,jobId);subjectReads++;assert.ok(confirmed,'HOST_ORIGINAL_SHARE_UNCONFIRMED');return{row:{mode:'withdraw_balance',stage:'CONFIRMED',consentFields:{rootId,recipient:binding.sender,statement:{commitment:h(75),amount:intent.amount}},observation:{status:'CONFIRMED',transactionHash:h(76),recipient:binding.sender,commitment:h(75),amount:intent.amount}},observed};};
 ports.readOriginalOfficialVaultNativeCostsV1=(a,r)=>{assert.equal(a,adapter);assert.equal(r.phase,'OBSERVED');return{approval:null,redemption:null};};
 const originalLifetime=async(_r,_i,credentials,initial)=>{let checkpoint=structuredClone(initial),candidate=null;return{async capture(current){assert.deepEqual(current,checkpoint);assert.equal(candidate,null);return{credentials,checkpoint:structuredClone(checkpoint)};},async check(current){assert.deepEqual(current,checkpoint);assert.equal(candidate,null);},async before(current,next){assert.deepEqual(current,checkpoint);assert.equal(candidate,null);candidate=structuredClone(next);},async acknowledged(next){assert.deepEqual(next,candidate);assert.deepEqual(await new Vault(credentials.path).read(credentials.password),next);checkpoint=structuredClone(next);candidate=null;}};};
 ports.createRetainedPrivateVaultExitJournalV1=originalLifetime;ports.openRetainedPrivateVaultExitJournalV1=async(r,i,c,record,saved)=>{assert.ok(originalAave);assert.deepEqual(c,saved.credentials);assert.deepEqual(record,saved.checkpoint);return originalLifetime(r,i,c,record);};ports.assertOriginalExternalVaultJournalV1=async(r,path)=>{assert.equal(r,runtime);assert.equal(dirname(dirname(path)),directory);};ports.captureRetainedOwnedOfficialStaticVaultV1=async value=>{assert.ok(originalAave);assert.equal(value,adapter);return{variant:'DEVICE_AAVE_STATIC',explicitInertNativePort:true};};ports.hostOriginalRecoveryParts=async()=>({consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token,kind){assert.equal(token,originalRecoveryToken);assert.equal(kind,'aave-redemption');assert.equal(recoveryConsumed,false);recoveryConsumed=true;return token.value;}});
 const recoveryPath=[...(mapped?['..']:['..','..']),'operations','local','device-external-flat-source-graph-service-v1.mjs'].join('/'),originalImport="await "+"im"+"port('"+recoveryPath+"')";assert.ok(body.includes(originalImport),'HOST_ORIGINAL_RECOVERY_IMPORT_REQUIRED');const linked=body.replaceAll(originalImport,'await hostOriginalRecoveryParts()');const loaded=new Function(...Object.keys(ports),linked+'\nreturn {createOriginalDeviceMorphoBluePrivateExitV1,createOriginalDeviceAaveStaticPrivateExitV1,reopenOriginalDeviceAaveStaticPrivateExitV1,captureOriginalDeviceAaveStaticPrivateExitV1,assertOriginalBluePositionRedemptionRequestV1,assertOriginalAaveStaticRedemptionRequestV1};')(...Object.values(ports));
 const signature=value=>{const frame=frameFor(value);try{assert.ok(frame.length<=4096);const bytes=sign('sha256',frame,{key:pair.privateKey,dsaEncoding:'ieee-p1363'});const order=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),scalar=BigInt('0x'+bytes.subarray(32).toString('hex'));if(scalar>order/2n)Buffer.from((order-scalar).toString(16).padStart(64,'0'),'hex').copy(bytes,32);return bytes.toString('hex');}finally{frame.fill(0);}};
 try{service=await (originalAave?loaded.createOriginalDeviceAaveStaticPrivateExitV1:loaded.createOriginalDeviceMorphoBluePrivateExitV1)({runtime,system,account,...(originalAave?{protocols}:{position}),adapter});const denied=service.challenge();await assert.rejects(service.review({access:denied,signature:signature(denied),draft:{action:redeemAction,withdrawalJobId:jobId,minimumAssets:'1',deadline:'1180'}}),/HOST_ORIGINAL_SHARE_UNCONFIRMED/);assert.equal(sends,0);assert.equal(adapterCalls,0);
  confirmed=true;const access=service.challenge(),{consent}=await service.review({access,signature:signature(access),draft:{action:redeemAction,withdrawalJobId:jobId,minimumAssets:'1',deadline:'1180'}});const altered={...consent,recipient:a(5)};await assert.rejects(service.operate({consent:altered,signature:signature(consent)}));assert.equal(sends,0);
  if(originalAave){await assert.rejects(service.operate({consent,signature:signature(consent)}),/HOST_SAME_NATIVE_REPLY_LOST/);lost=false;}else{const row=await service.operate({consent,signature:signature(consent)});assert.equal(row.stage,'REDEEMED');assert.equal(row.redeemedUnderlying,'1');}assert.equal(sends,1);assert.equal(adapterCalls,1);
  await assert.rejects(service.operate({consent,signature:signature(consent)}));assert.equal(sends,1);assert.throws(()=>loaded.assertOriginalBluePositionRedemptionRequestV1(Object.freeze(Object.create(null)),adapter,consent.reference));
  if(originalAave){const snapshot=await loaded.captureOriginalDeviceAaveStaticPrivateExitV1(service);assert.equal(snapshot.record.data.operations[0].stage,'REDEMPTION_UNKNOWN');assert.equal(snapshot.record.data.operations[0].reference,consent.reference);originalRecoveryToken={value:{input:{runtime,system,account,protocols,adapter},saved:snapshot}};service=await loaded.reopenOriginalDeviceAaveStaticPrivateExitV1(originalRecoveryToken);await assert.rejects(loaded.reopenOriginalDeviceAaveStaticPrivateExitV1(originalRecoveryToken));const access=service.challenge(),review=await service.review({access,signature:signature(access),draft:{action:observeAction,withdrawalJobId:jobId,minimumAssets:'1',deadline:'1180'}});const observedRow=await service.operate({consent:review.consent,signature:signature(review.consent)});assert.equal(observedRow.stage,'REDEEMED');assert.equal(observedRow.reference,consent.reference);assert.equal(sends,1);const deny=service.challenge();await assert.rejects(service.review({access:deny,signature:signature(deny),draft:{action:redeemAction,withdrawalJobId:jobId,minimumAssets:'1',deadline:'1180'}}));assert.equal(adapterCalls,1);}
  const again=service.challenge(),status=await service.status({access:again,signature:signature(again)});assert.equal(status.observationOnly,originalAave);assert.equal(status.operations.length,1);assert.equal(status.operations[0].withdrawalTransactionHash,consent.withdrawalTransactionHash);assert.equal(status.operations[0].stage,'REDEEMED');assert.equal(sends,1);assert.ok(subjectReads>=4);
 }finally{if(service)await service.close();await rm(directory,{recursive:true,force:true});}
 }
});

test('Aave adapter checks the original Aave fixture on every healthy read and legacy Meta retains its own brand',async()=>{
 const mapped=import.meta.url.includes('/modules/chain-adapters/'),url=mapped?new URL('../defi-adapters/owned-metamorpho-vault.mjs',import.meta.url):new URL('../../../../src/defi/vaults/owned-metamorpho-vault.mjs',import.meta.url),text=await readFile(url,'utf8'),match=text.match(/const assertFixture = async \(\) => \{([^\n]+)\};/);assert.ok(match);const calls=[],runtime={},originalFixture={},position={};
 const check=new Function('blue','aave','runtime','originalFixture','position','assertOwnedOriginalMorphoBluePositionV1','assertOfficialAaveFixtureV1','assertOfficialProtocolFixture','assertOwnedLocalEvmV2','return async()=>{'+match[1]+'}');
 const ports=[runtime,originalFixture,position,()=>calls.push('blue'),(r,f)=>{assert.equal(r,runtime);assert.equal(f,originalFixture);calls.push('aave');},(r,f)=>{assert.equal(r,runtime);assert.equal(f,originalFixture);calls.push('meta');},async r=>{assert.equal(r,runtime);calls.push('runtime');}];
 await check(false,true,...ports)();assert.deepEqual(calls,['aave','runtime']);calls.length=0;await check(false,false,...ports)();assert.deepEqual(calls,['meta','runtime']);calls.length=0;await check(true,false,...ports)();assert.deepEqual(calls,['blue','meta','runtime']);
});
