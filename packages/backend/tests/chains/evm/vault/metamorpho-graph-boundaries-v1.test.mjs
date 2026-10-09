/** Pure host boundaries only. No chain, compilation, prover or financial
 * acceptance. The fresh original graph flow still requires real acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, UNISWAP_GRAPH_DELIVERY_PROFILE_V1, MORPHO_BLUE_POSITION_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  evmGraphDeliveryTermsV1, evmGraphDeliveryDescriptorCommitmentV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1, inspectEvmGraphDeliveryEconomicsV1 }
  from '../../../../src/chains/evm/dispatch/evm-graph-delivery-codec-v1.mjs';
import { encodePrivateExternalDelivery } from '../../../../src/defi/delivery/private-external-delivery.mjs';
import { encodeEvmVaultDeliveryCall, evmVaultDeliveryDescriptorCommitment }
  from '../../../../src/chains/evm/vault/evm-vault-delivery.mjs';
import { assertOwnedEvmGraphDeliveryObserverV1, assertOwnedEvmGraphDeliveryFactsV1,
  assertOwnedEvmGraphDeliveryDescriptorV1 } from '../../../../src/chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs';
import { prepareOwnedMetaMorphoGraphDescriptorV1, assertOwnedMetaMorphoGraphDeliveryFactsV1, prepareOwnedMorphoBluePositionGraphDescriptorV1,
  prepareOwnedUniswapGraphDescriptorV1, assertOwnedUniswapGraphDeliveryFactsV1, readOriginalEvmGraphDeliveryEconomicFactsV1 }
  from '../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs';

import { validateOwnerGraphReview, canonicalOwnerGraphTerms, ownerFlatDeFiEconomicAllocationV1 } from '../../../../../../apps/wallet/src/client/features/accounts/owner-graph-review-v1.mjs';
import { accountReviewDetails } from '../../../../../../apps/wallet/src/client/state/view-model.mjs';

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
