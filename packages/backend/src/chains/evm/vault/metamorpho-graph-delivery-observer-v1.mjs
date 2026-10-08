/** Official MetaMorpho family-3 reader. Authority requires the original fixed
 * protocol, router, signed runtime wire, canonical D27 arrival and backing.
 * No callback, receipt object or profile flag can mint this private brand. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertOwnedLocalEvmV2, assertSignedEvmTransaction, LOCAL_EVM_PROFILE,
  encodeCanonicalEvmUnsignedTransaction } from '../runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedFlatSystem } from '../../../operations/deployments/system/deploy-system.mjs';
import { assertOwnedPrivateExternalRouterV1 } from '../../../operations/deployments/defi/deploy-private-external-router-v1.mjs';
import { assertOfficialProtocolFixture } from '../../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { createPrivateExternalIncomingObserverV1, assertOwnedPrivateExternalIncomingObservationV1 }
  from '../../shared/observations/private-external-incoming-observer-v1.mjs';
import { createFlatSystemStateReader } from '../../../execution/account/reconciliation/flat-system-state.mjs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { exactRecord, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { decodeDepositIntentInputs } from '../../../execution/account/preparation/deposit-intent.mjs';
import { decodePrivateExternalDeliveryCall } from '../../../defi/delivery/private-external-delivery.mjs';
import { evmRuntimeCodeHash } from '../contracts/evm-code-hash.mjs';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1 } from '../dispatch/evm-graph-delivery-codec-v1.mjs';

const owned = new WeakMap(), facts = new WeakMap();
const detached = value => { const result = structuredClone(value);
  const freeze = item => { if (item && typeof item === 'object') {
    Object.values(item).forEach(freeze); Object.freeze(item); } return item; }; return freeze(result); };
const sha = value => createHash('sha256').update(value).digest('hex');
const bare = value => value.slice(2);
const quantity = value => { assert.ok(typeof value === 'string' && /^0x(0|[1-9a-f][0-9a-f]*)$/.test(value)); return BigInt(value); };
const adverse = new Set(['METAMORPHO_GRAPH_REVERTED', 'METAMORPHO_GRAPH_RECEIPT_CHANGED',
  'METAMORPHO_GRAPH_PROTOCOL_ASSET_DELTA', 'METAMORPHO_GRAPH_PROTOCOL_SHARE_DELTA',
  'METAMORPHO_GRAPH_MORPHO_ASSET_DELTA', 'METAMORPHO_GRAPH_SOURCE_POOL_CHANGED',
  'METAMORPHO_GRAPH_PROTOCOL_CODE_CHANGED', 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED']);
function failure(error, authenticated) {
  const code = error?.message?.split('\n', 1)[0];
  return { status: authenticated && error instanceof assert.AssertionError && adverse.has(code) ? 'adverse' : 'unknown',
    reason: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(code) ? code : 'METAMORPHO_GRAPH_OBSERVATION_UNAVAILABLE' };
}
export const isOwnedMetaMorphoGraphDeliveryObserverV1 = value => owned.has(value);
export function assertOwnedMetaMorphoGraphDeliveryObserverV1(observer, expected) {
  exactRecord(expected, ['runtime', 'system', 'poolIndex']);
  const state = owned.get(observer); assert.ok(state, 'METAMORPHO_GRAPH_ORIGINAL_OBSERVER_REQUIRED');
  for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(state[key], expected[key], 'METAMORPHO_GRAPH_ORIGINAL_BINDING');
  assertOwnedFlatSystem(state.runtime, state.system);
  assertOwnedPrivateExternalRouterV1(state.router, expected);
  assertOfficialProtocolFixture(state.runtime, state.protocolFixture);
}
export function assertOwnedMetaMorphoGraphDeliveryFactsV1(value, { observer }) {
  assert.ok(owned.has(observer) && facts.get(value) === observer, 'METAMORPHO_GRAPH_ORIGINAL_FACTS_REQUIRED');
}
/** Exact original descriptor binding, separate from pure framing validation. */
export function assertOwnedMetaMorphoGraphDescriptorV1(observer, router, descriptor) {
  const state = owned.get(observer); assert.ok(state && state.router === router, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');
  assertOwnedMetaMorphoGraphDeliveryObserverV1(observer, { runtime: state.runtime, system: state.system, poolIndex: state.poolIndex });
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  assert.equal(descriptor.profile, METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, 'METAMORPHO_GRAPH_DESCRIPTOR_REQUIRED');
  assert.deepEqual(descriptor.context, state.context, 'METAMORPHO_GRAPH_ORIGINAL_CONTEXT');
  assert.deepEqual(descriptor.plan.identity, router.identity, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_IDENTITY');
}
/** Private bootstrap constructs the context from original deployment pins.
 * Owner D27 and route values remain subject to their proof and PAEG quote. */
export function prepareOwnedMetaMorphoGraphDescriptorV1(input) {
  exactRecord(input, ['observer', 'router', 'route', 'ownerPublicInputs']);
  const state = owned.get(input.observer); assert.ok(state && state.router === input.router, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');
  const descriptor = detached({ profile: METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, context: state.context,
    plan: { identity: input.router.identity, protocolKind: 'METAMORPHO_V1_EXACT_SHARE_MINT', fee: null,
      route: input.route, ownerPublicInputs: input.ownerPublicInputs } });
  assertOwnedMetaMorphoGraphDescriptorV1(input.observer, input.router, descriptor); return descriptor;
}

export async function createOwnedMetaMorphoGraphDeliveryObserverV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'system', 'poolIndex', 'router', 'protocolFixture']);
  const { runtime, system, poolIndex, router, protocolFixture: protocol } = input;
  await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system);
  assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex }); assertOfficialProtocolFixture(runtime, protocol);
  assert.equal(router.protocolKind, 'METAMORPHO_V1_EXACT_SHARE_MINT', 'METAMORPHO_GRAPH_OFFICIAL_PROTOCOL');
  const id = router.identity, sourcePoolIndex = router.sourcePoolIndex, sourcePool = system.pools[sourcePoolIndex];
  assert.equal(id.inputAsset, bare(protocol.first.address)); assert.equal(id.outputAsset, bare(protocol.vault.address));
  assert.equal(id.protocol, id.outputAsset); assert.equal(sourcePool.asset, protocol.first.address, 'METAMORPHO_GRAPH_SOURCE_ASSET');
  assert.equal(sourcePool.assetMetadata.address, protocol.first.address); assert.equal(sourcePool.assetMetadata.kind, 'ERC20');
  assert.equal(sourcePool.assetMetadata.genesisHash, runtime.metadata.evmGenesis);
  const pins = await router.read(), context = detached({ ...pins.context, routerRuntimeCodeSHA256: pins.routerRuntimeCodeSHA256 });
  assert.equal(context.sourceAssetIdentity, sourcePool.domain.asset); assert.equal(context.targetAssetIdentity, system.pools[poolIndex].domain.asset);
  assert.equal(context.sourceLedgerNamespace, bare(system.ledgerNamespace)); assert.equal(context.ledgerNamespace, bare(system.ledgerNamespace));
  const incoming = await createPrivateExternalIncomingObserverV1({ runtime, system, poolIndex, router });
  const sourceReader = await createFlatSystemStateReader({ runtime, system, poolIndex: sourcePoolIndex });
  const targetReader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const read = async (contract, method, args, at) => contract.iface.decodeFunctionResult(method,
    await runtime.call({ to: contract.address, data: contract.iface.encodeFunctionData(method, args) }, at));
  async function protocolAt(at, amount) {
    for (const contract of [protocol.first, protocol.vault, protocol.blue])
      assert.equal(await runtime.code(contract.address, at), contract.code, 'METAMORPHO_GRAPH_PROTOCOL_CODE_CHANGED');
    assert.equal((await read(protocol.vault, 'asset', [], at))[0].toLowerCase(), protocol.first.address);
    assert.equal((await read(protocol.vault, 'MORPHO', [], at))[0].toLowerCase(), protocol.blue.address);
    // Read the fixed original supply market, including debt and collateral.
    // The backing is held in Morpho; a vault's direct ERC20 balance is not NAV.
    const rows = await Promise.all([
      read(protocol.vault, 'totalAssets', [], at), read(protocol.vault, 'totalSupply', [], at),
      read(protocol.vault, 'previewMint', [amount], at), read(protocol.vault, 'maxMint', [router.address], at),
      read(protocol.vault, 'balanceOf', ['0x' + id.solver], at), read(protocol.vault, 'balanceOf', [router.address], at),
      read(protocol.first, 'balanceOf', [protocol.blue.address], at), read(protocol.first, 'balanceOf', [protocol.vault.address], at),
      read(protocol.blue, 'market', [protocol.marketId], at), read(protocol.blue, 'position', [protocol.marketId, protocol.vault.address], at),
    ]);
    return detached({ totalAssets: rows[0][0].toString(), totalShares: rows[1][0].toString(), previewMint: rows[2][0].toString(),
      maxMint: rows[3][0].toString(), solverShares: rows[4][0].toString(), routerShares: rows[5][0].toString(),
      morphoUnderlying: rows[6][0].toString(), vaultUnderlying: rows[7][0].toString(),
      market: Array.from(rows[8].length === 1 && Array.isArray(rows[8][0]) ? rows[8][0] : rows[8]).map(value => value.toString()),
      position: Array.from(rows[9].length === 1 && Array.isArray(rows[9][0]) ? rows[9][0] : rows[9]).map(value => value.toString()) });
  }
  function sameContext(current) {
    assert.deepEqual({ ...current.context, routerRuntimeCodeSHA256: current.routerRuntimeCodeSHA256 }, context, 'METAMORPHO_GRAPH_ORIGINAL_CONTEXT');
    assert.deepEqual(current.identity, id, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_IDENTITY');
  }
  let observer;
  async function inspect(query, auth) {
    exactRecord(query, ['transactionHash', 'calldataSHA256']); bytes32(query.transactionHash, true); bytes32(query.calldataSHA256, true);
    assertOwnedMetaMorphoGraphDeliveryObserverV1(observer, { runtime, system, poolIndex }); await assertOwnedLocalEvmV2(runtime);
    const hash = '0x' + query.transactionHash, entries = runtime.transactions.filter(row => row.transactionHash === hash);
    assert.equal(entries.length, 1, 'METAMORPHO_GRAPH_ORIGINAL_SIGNED_JOURNAL'); const row = entries[0];
    assert.equal(row.label, 'gated EVM vault delivery', 'METAMORPHO_GRAPH_GATED_WIRE_REQUIRED');
    assert.ok(row.prepared && row.signed, 'METAMORPHO_GRAPH_GATED_WIRE_REQUIRED');
    assert.ok(['mined', 'mined-reverted', 'uncertain-no-resend', 'broadcast', 'broadcast-result-unknown'].includes(row.phase));
    const signed = await runtime.signedTransaction(hash); assert.deepEqual(signed, row.signed, 'METAMORPHO_GRAPH_ORIGINAL_SIGNED_WIRE');
    const wire = assertSignedEvmTransaction(signed.nativeWire, row.prepared.transaction);
    assert.equal(wire.nativeId, hash); assert.equal(signed.nativeId, hash); assert.equal(wire.unsignedWire, row.prepared.unsignedWire);
    assert.equal(wire.transactionSHA256, signed.transactionSHA256); assert.equal(wire.nonce, quantity(row.senderNonce).toString());
    assert.equal(wire.chainId, id.chainId); assert.equal(wire.from, '0x' + id.solver); assert.equal(wire.to, router.address);
    assert.equal(wire.value, '0'); assert.equal(wire.gasPrice, '1000000000'); assert.equal(wire.gas, String(LOCAL_EVM_PROFILE.maxGas));
    for (const key of ['from', 'to', 'data']) assert.equal(row.request[key], wire[key]);
    assert.equal(quantity(row.request.gas).toString(), wire.gas); assert.equal(quantity(row.request.value).toString(), wire.value);
    assert.equal(row.prepared.genesis, '0x' + context.genesisHash);
    assert.equal(sha(Buffer.from(wire.data.slice(2), 'hex')), query.calldataSHA256, 'METAMORPHO_GRAPH_ORIGINAL_CALLDATA');
    const decoded = decodePrivateExternalDeliveryCall({ calldata: wire.data, identity: id, protocolKind: router.protocolKind, fee: null });
    const descriptor = prepareOwnedMetaMorphoGraphDescriptorV1({ observer, router, route: decoded.plan.route, ownerPublicInputs: decoded.plan.ownerPublicInputs });
    const intent = decodeEvmGraphDeliveryCallV1(wire.data, descriptor);
    sameContext(await router.read()); auth.authenticated = true;
    const receipt = await runtime.receipt(hash);
    if (receipt === null) { assert.ok(!row.receipt && !['mined', 'mined-reverted'].includes(row.phase)); return null; }
    if (row.receipt !== undefined) assert.deepEqual(receipt, row.receipt, 'METAMORPHO_GRAPH_RECEIPT_CHANGED');
    assert.equal(receipt.status, '0x1', 'METAMORPHO_GRAPH_REVERTED'); await runtime.checkReceipt(receipt);
    const header = await runtime.assertCanonical(receipt), height = quantity(header.number);
    assert.ok(height > 0n); assert.deepEqual(header.transactions, [hash]);
    const beforeTag = '0x' + (height - 1n).toString(16), amount = decoded.plan.route.outputAmount;
    const [arrival, beforeSource, afterSource, before, after] = await Promise.all([
      incoming.observe(query), sourceReader.readHistorical(beforeTag), sourceReader.readHistorical(header.number),
      protocolAt(beforeTag, amount), protocolAt(header.number, amount),
    ]);
    assert.ok(arrival, 'METAMORPHO_GRAPH_ORIGINAL_D27_ARRIVAL'); assertOwnedPrivateExternalIncomingObservationV1(arrival, { observer: incoming });
    assert.deepEqual(arrival.delivery.publicInputs, decoded.plan.ownerPublicInputs); assert.equal(arrival.delivery.receiptCommitment, intent.receiptKeyCommitment);
    for (const key of ['rawState', 'rawHistory', 'rawBacking'])
      assert.equal(beforeSource.poolObservation[key], afterSource.poolObservation[key], 'METAMORPHO_GRAPH_SOURCE_POOL_CHANGED');
    assert.deepEqual(beforeSource.authorizationRoots, afterSource.authorizationRoots, 'METAMORPHO_GRAPH_SOURCE_POOL_CHANGED');
    assert.deepEqual(row.prepared.head, { number: beforeSource.header.number, hash: beforeSource.header.hash, timestamp: beforeSource.header.timestamp });
    assert.equal(header.parentHash, beforeSource.header.hash);
    assert.equal(row.prepared.funds.targetCodeHash, evmRuntimeCodeHash(await runtime.code(router.address, beforeTag)));
    const spent = BigInt(arrival.deliveryEvent.inputSpent), shares = BigInt(amount);
    assert.equal(spent, BigInt(before.previewMint), 'METAMORPHO_GRAPH_OFFICIAL_PREVIEW'); assert.ok(shares <= BigInt(before.maxMint));
    assert.equal(BigInt(after.totalAssets), BigInt(before.totalAssets) + spent, 'METAMORPHO_GRAPH_PROTOCOL_ASSET_DELTA');
    assert.equal(BigInt(after.totalShares), BigInt(before.totalShares) + shares, 'METAMORPHO_GRAPH_PROTOCOL_SHARE_DELTA');
    assert.equal(after.solverShares, before.solverShares); assert.equal(after.routerShares, before.routerShares);
    assert.equal(BigInt(after.morphoUnderlying) + BigInt(after.vaultUnderlying),
      BigInt(before.morphoUnderlying) + BigInt(before.vaultUnderlying) + spent, 'METAMORPHO_GRAPH_MORPHO_ASSET_DELTA');
    assert.equal(BigInt(after.market[0]), BigInt(before.market[0]) + spent, 'METAMORPHO_GRAPH_MORPHO_ASSET_DELTA');
    assert.ok(BigInt(after.market[1]) > BigInt(before.market[1]) && BigInt(after.position[0]) > BigInt(before.position[0]));
    for (const index of [2, 3, 5]) assert.equal(after.market[index], before.market[index]);
    for (const index of [1, 2]) assert.equal(after.position[index], before.position[index]);
    const current = await targetReader.read(); sameContext(await router.read(current.header.number));
    await runtime.checkReceipt(receipt); await sourceReader.assertCanonical(beforeSource); await sourceReader.assertCanonical(afterSource);
    await targetReader.assertCurrent(current);
    return { intent, arrival, wire, header, tip: current.header };
  }
  observer = Object.freeze({ identity: detached(id),
    binding: detached({ poolIndex, recipientIndex: String(poolIndex), genesis: context.genesisHash,
      asset: context.targetAssetIdentity, sourceEndpoint: id.solver, destinationEndpoint: id.router }),
    classification: 'OWNED_LOCAL_OFFICIAL_METAMORPHO_NOT_PUBLIC_CONSENSUS',
    // Return the existing arrival shape so owner custody validates its retained
    // D27 proof/opening without adding a second credit authority.
    async observe(query) { return (await inspect(query, {}))?.arrival ?? null; },
    async assertPrepared(input) {
      exactRecord(input, ['prepared', 'intent']); const { prepared, intent } = detached(input);
      assertOwnedMetaMorphoGraphDescriptorV1(observer, router, intent.descriptor);
      exactRecord(prepared, ['genesis', 'head', 'transaction', 'unsignedWire', 'funds']);
      exactRecord(prepared.head, ['number', 'hash', 'timestamp']);
      exactRecord(prepared.transaction, ['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data']);
      exactRecord(prepared.funds, ['balanceWei', 'estimatedGas', 'targetCodeHash']);
      const current = await sourceReader.read(), at = current.header.number, tx = prepared.transaction;
      assert.deepEqual(prepared.head, { number: at, hash: current.header.hash, timestamp: current.header.timestamp });
      sameContext(await router.read(at)); assert.equal(prepared.genesis, '0x' + context.genesisHash);
      assert.equal(tx.chainId, id.chainId); assert.equal(tx.from, '0x' + id.solver); assert.equal(tx.to, router.address);
      assert.equal(tx.value, '0'); assert.equal(tx.gasPrice, '1000000000'); assert.equal(tx.gas, String(LOCAL_EVM_PROFILE.maxGas));
      assert.equal(tx.data, encodeEvmGraphDeliveryCallV1(intent)); assert.equal(prepared.unsignedWire, encodeCanonicalEvmUnsignedTransaction(tx));
      assert.equal(prepared.funds.targetCodeHash, evmRuntimeCodeHash(await runtime.code(router.address, at)));
      assert.ok(BigInt(prepared.funds.estimatedGas) > 0n && BigInt(prepared.funds.estimatedGas) <= BigInt(tx.gas));
      assert.equal((await runtime.balance(tx.from, at)).toString(), prepared.funds.balanceWei);
      assert.ok(BigInt(prepared.funds.balanceWei) >= BigInt(tx.gas) * BigInt(tx.gasPrice));
      for (const tag of ['latest', 'pending']) assert.equal((await runtime.nonce(tx.from, tag)).toString(), tx.nonce);
      const plan = intent.descriptor.plan, statement = decodeDepositIntentInputs(plan.ownerPublicInputs), inclusion = quantity(current.header.timestamp) + 1n;
      for (const [start, end] of [[plan.route.validFrom, plan.route.validUntil], [statement.validFrom, statement.validUntil]])
        assert.ok(BigInt(start) <= inclusion && inclusion < BigInt(end), 'METAMORPHO_GRAPH_PREFLIGHT_WINDOW');
      const state = await protocolAt(at, plan.route.outputAmount);
      assert.ok(BigInt(state.previewMint) > 0n && BigInt(state.previewMint) <= BigInt(plan.route.maximumInput), 'METAMORPHO_GRAPH_PREFLIGHT_MAXIMUM');
      assert.ok(BigInt(plan.route.outputAmount) <= BigInt(state.maxMint), 'METAMORPHO_GRAPH_PREFLIGHT_CAPACITY');
      const [allowance, balance] = await Promise.all([read(protocol.first, 'allowance', [tx.from, router.address], at), read(protocol.first, 'balanceOf', [tx.from], at)]);
      assert.equal(allowance[0].toString(), plan.route.maximumInput); assert.ok(balance[0] >= BigInt(plan.route.maximumInput));
      const targetPool = system.pools[poolIndex];
      const [consumed, inserted, protocolAllowance, poolAllowance] = await Promise.all([
        runtime.call({ to: router.address, data: '0x' + publicKeccak256(Buffer.from('consumed(bytes32)')).subarray(0, 4).toString('hex') + intent.receiptKeyCommitment }, at),
        targetPool.call('insertedCommitments(bytes32)', ['0x' + statement.output], at),
        read(protocol.first, 'allowance', [router.address, protocol.vault.address], at),
        read(protocol.vault, 'allowance', [router.address, targetPool.address], at),
      ]);
      assert.equal(BigInt(consumed), 0n, 'METAMORPHO_GRAPH_PREFLIGHT_RECEIPT_CONSUMED');
      assert.equal(BigInt(inserted), 0n, 'METAMORPHO_GRAPH_PREFLIGHT_OWNER_OUTPUT_INSERTED');
      assert.equal(protocolAllowance[0], 0n, 'METAMORPHO_GRAPH_PREFLIGHT_PROTOCOL_ALLOWANCE');
      assert.equal(poolAllowance[0], 0n, 'METAMORPHO_GRAPH_PREFLIGHT_POOL_ALLOWANCE');
      assert.equal(await system.verify('deposit_intent', Buffer.from(intent.proof, 'hex'), plan.ownerPublicInputs, at), true, 'METAMORPHO_GRAPH_PREFLIGHT_D27');
      await sourceReader.assertCurrent(current); return undefined;
    },
    async observeDispatch(query) {
      const auth = {}; try { const result = await inspect(query, auth);
        return detached({ status: result ? 'observed' : 'pending', nativeId: query.transactionHash, nativeWire: result ? bare(result.wire.nativeWire) : null });
      } catch (error) { return detached({ status: failure(error, auth.authenticated).status, nativeId: query.transactionHash, nativeWire: null }); }
    },
    async observeFacts(query) {
      const auth = {}; let result;
      try { const observed = await inspect(query, auth); assert.ok(observed, 'METAMORPHO_GRAPH_FACTS_PENDING');
        const confirmations = quantity(observed.tip.number) - quantity(observed.header.number) + 1n;
        assert.ok(confirmations > 0n && confirmations < (1n << 32n));
        result = detached({ status: 'observed', genesis: context.genesisHash, asset: context.targetAssetIdentity,
          nativeWire: bare(observed.wire.nativeWire), intent: observed.intent, blockId: bare(observed.header.hash),
          blockHeight: quantity(observed.header.number).toString(), finalityKind: '3', confirmations: confirmations.toString(),
          nativeContext: { observedTipId: bare(observed.tip.hash), observedTipHeight: quantity(observed.tip.number).toString(),
            transactionSlot: '0', parentSlot: '0', observedSlot: '0' } });
      } catch (error) { result = detached(failure(error, auth.authenticated)); }
      facts.set(result, observer); return result;
    },
  });
  owned.set(observer, { runtime, system, poolIndex, router, protocolFixture: protocol, context }); return observer;
}
