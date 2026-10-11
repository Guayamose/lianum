/** Fixed original official-protocol family-3 readers. Authority requires the original fixed
 * protocol, router, signed runtime wire, canonical D27 arrival and backing.
 * No callback, receipt object or profile flag can mint this private brand. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertSignedEvmTransaction, encodeCanonicalEvmUnsignedTransaction } from '../contracts/transaction-wire-codec.mjs';
import { LOCAL_EVM_PROFILE } from '../runtime/local-evm-profiles.mjs';
import { assertOwnedLocalEvmV2 } from '../runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedFlatSystem } from '../../../operations/deployments/system/deploy-system.mjs';
import { createOwnedPrivateExternalRouterV1, assertOwnedPrivateExternalRouterV1 } from '../../../operations/deployments/defi/deploy-private-external-router-v1.mjs';
import { assertOwnedOriginalMorphoBluePositionV1, readOwnedOriginalMorphoBluePositionContextV1 } from '../../../operations/deployments/defi/deploy-morpho-blue-position-v1.mjs';
import { assertOfficialProtocolFixture } from '../../../operations/deployments/defi/official-protocol-fixture-v3.mjs';
import { createPrivateExternalIncomingObserverV1, assertOwnedPrivateExternalIncomingObservationV1 }
  from '../../shared/observations/private-external-incoming-observer-v1.mjs';
import { createFlatSystemStateReader } from '../../../execution/account/reconciliation/flat-system-state.mjs';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { exactRecord, bytes32 } from '@lianum/components/encoding/commitments';
import { decodeDepositIntentInputs } from '@lianum/engine/execution/inputs/deposit-intent';
import { decodePrivateExternalDeliveryCall } from '@lianum/engine/encoding/private-external-delivery';
import { evmRuntimeCodeHash } from '../contracts/evm-code-hash.mjs';
import { METAMORPHO_GRAPH_DELIVERY_PROFILE_V1, UNISWAP_GRAPH_DELIVERY_PROFILE_V1, AAVE_STATIC_GRAPH_DELIVERY_PROFILE_V1, MORPHO_BLUE_POSITION_GRAPH_DELIVERY_PROFILE_V1, validateEvmGraphDeliveryDescriptorV1,
  encodeEvmGraphDeliveryCallV1, decodeEvmGraphDeliveryCallV1, inspectEvmGraphDeliveryEconomicsV1 } from '../dispatch/evm-graph-delivery-codec-v1.mjs';

const owned = new WeakMap(), facts = new WeakMap(), economicFacts = new WeakMap(), batchesV4 = new WeakMap();
const META = 'METAMORPHO_V1_EXACT_SHARE_MINT', UNI = 'UNISWAP_V3_EXACT_OUTPUT_SINGLE', AAVE = 'AAVE_V3_STATIC_EXACT_SHARE_MINT', BLUE = 'MORPHO_BLUE_V1_EXACT_SHARE_SUPPLY';
const detached = value => { const result = structuredClone(value);
  const freeze = item => { if (item && typeof item === 'object') {
    Object.values(item).forEach(freeze); Object.freeze(item); } return item; }; return freeze(result); };
const sha = value => createHash('sha256').update(value).digest('hex');
const bare = value => value.slice(2);
const quantity = value => { assert.ok(typeof value === 'string' && /^0x(0|[1-9a-f][0-9a-f]*)$/.test(value)); return BigInt(value); };
const adverse = new Set(['METAMORPHO_GRAPH_REVERTED', 'METAMORPHO_GRAPH_RECEIPT_CHANGED',
  'METAMORPHO_GRAPH_PROTOCOL_ASSET_DELTA', 'METAMORPHO_GRAPH_PROTOCOL_SHARE_DELTA',
  'METAMORPHO_GRAPH_MORPHO_ASSET_DELTA', 'METAMORPHO_GRAPH_SOURCE_POOL_CHANGED',
  'METAMORPHO_GRAPH_PROTOCOL_CODE_CHANGED', 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED',
  'UNISWAP_GRAPH_POOL_CODE_CHANGED', 'UNISWAP_GRAPH_POOL_BALANCE_DELTA',
  'UNISWAP_GRAPH_SUPPLY_CHANGED', 'UNISWAP_GRAPH_EXACT_SWAP', 'UNISWAP_GRAPH_SLOT0_CHANGED']);
function failure(error, authenticated) {
  const code = error?.message?.split('\n', 1)[0];
  return { status: authenticated && error instanceof assert.AssertionError && adverse.has(code) ? 'adverse' : 'unknown',
    reason: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(code) ? code : 'METAMORPHO_GRAPH_OBSERVATION_UNAVAILABLE' };
}
export const isOwnedMetaMorphoGraphDeliveryObserverV1 = value => owned.get(value)?.protocolKind === META;
export const isOwnedUniswapGraphDeliveryObserverV1 = value => owned.get(value)?.protocolKind === UNI;
export const isOwnedAaveStaticGraphDeliveryObserverV1 = value => owned.get(value)?.protocolKind === AAVE;
export const isOwnedMorphoBluePositionGraphDeliveryObserverV1 = value => owned.get(value)?.protocolKind === BLUE;
export const isOwnedOfficialGraphDeliveryObserverV1 = value => owned.has(value);
function assertOwnedOfficialObserver(observer, expected, protocolKind = null) {
  exactRecord(expected, ['runtime', 'system', 'poolIndex']);
  const state = owned.get(observer); assert.ok(state, 'METAMORPHO_GRAPH_ORIGINAL_OBSERVER_REQUIRED');
  if (protocolKind !== null) assert.equal(state.protocolKind, protocolKind, 'EVM_GRAPH_ORIGINAL_PROTOCOL_VARIANT');
  for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(state[key], expected[key], 'METAMORPHO_GRAPH_ORIGINAL_BINDING');
  assertOwnedFlatSystem(state.runtime, state.system);
  if(batchesV4.has(observer))for(const child of batchesV4.get(observer).children)assertOwnedOfficialObserver(child,expected,META);
  assertOwnedPrivateExternalRouterV1(state.router, expected);
  assert.equal(state.router.protocolKind, state.protocolKind, 'EVM_GRAPH_ORIGINAL_PROTOCOL_VARIANT');
  assertOfficialProtocolFixture(state.runtime, state.protocolFixture);
  if(state.protocolKind===BLUE)assertOwnedOriginalMorphoBluePositionV1(state.runtime,state.position);
}
export function assertOwnedMetaMorphoGraphDeliveryObserverV1(observer, expected) { assertOwnedOfficialObserver(observer, expected, META); }
export function assertOwnedAaveStaticGraphDeliveryObserverV1(observer, expected) { assertOwnedOfficialObserver(observer, expected, AAVE); }
export function assertOwnedAaveStaticGraphDeliveryFactsV1(value, { observer }) { assert.ok(isOwnedAaveStaticGraphDeliveryObserverV1(observer) && facts.get(value) === observer, 'AAVE_GRAPH_ORIGINAL_FACTS_REQUIRED'); }
export function assertOwnedMorphoBluePositionGraphDeliveryObserverV1(observer,expected) { assertOwnedOfficialObserver(observer,expected,BLUE); }
export function assertOwnedMorphoBluePositionGraphDeliveryFactsV1(value,{observer}) { assert.ok(isOwnedMorphoBluePositionGraphDeliveryObserverV1(observer)&&facts.get(value)===observer,'BLUE_GRAPH_ORIGINAL_FACTS_REQUIRED'); }
export function assertOwnedUniswapGraphDeliveryObserverV1(observer, expected) { assertOwnedOfficialObserver(observer, expected, UNI); }
export function assertOwnedMetaMorphoGraphDeliveryFactsV1(value, { observer }) {
  assert.ok(isOwnedMetaMorphoGraphDeliveryObserverV1(observer) && facts.get(value) === observer, 'METAMORPHO_GRAPH_ORIGINAL_FACTS_REQUIRED');
}
export function assertOwnedUniswapGraphDeliveryFactsV1(value, { observer }) {
  assert.ok(isOwnedUniswapGraphDeliveryObserverV1(observer) && facts.get(value) === observer, 'UNISWAP_GRAPH_ORIGINAL_FACTS_REQUIRED');
}
/** Same original successful facts only. Copies, shaped data and unknown
 * observations have no economic provenance; this getter grants no effect. */
export function readOriginalEvmGraphDeliveryEconomicFactsV1(value, observer) {
  assert.equal(arguments.length, 2, 'EVM_GRAPH_ECONOMIC_FIELDS');
  assert.ok(owned.has(observer) && facts.get(value) === observer && value.status === 'observed', 'EVM_GRAPH_ORIGINAL_ECONOMIC_FACTS');
  const result = economicFacts.get(value); assert.ok(result, 'EVM_GRAPH_ORIGINAL_ECONOMIC_FACTS'); return detached(result);
}
/** Both factories retain exact original object identities. The discriminator
 * below selects framing only after the private ownership map was checked. */
function assertOwnedOfficialDescriptor(observer, router, descriptor, protocolKind = null) {
  const batch=batchesV4.get(observer);if(batch){const child=batch.children.find(value=>owned.get(value).router===router);assert.ok(child,'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');return assertOwnedOfficialDescriptor(child,router,descriptor,protocolKind);}
  const state = owned.get(observer); assert.ok(state && state.router === router, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');
  assertOwnedOfficialObserver(observer, { runtime: state.runtime, system: state.system, poolIndex: state.poolIndex }, protocolKind);
  validateEvmGraphDeliveryDescriptorV1(descriptor);
  assert.equal(descriptor.profile, state.profile, 'METAMORPHO_GRAPH_DESCRIPTOR_REQUIRED');
  assert.deepEqual(descriptor.context, state.context, 'METAMORPHO_GRAPH_ORIGINAL_CONTEXT');
  assert.deepEqual(descriptor.plan.identity, router.identity, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_IDENTITY');
}
export function assertOwnedMetaMorphoGraphDescriptorV1(observer, router, descriptor) { assertOwnedOfficialDescriptor(observer, router, descriptor, META); }
export function assertOwnedAaveStaticGraphDescriptorV1(observer, router, descriptor) { assertOwnedOfficialDescriptor(observer, router, descriptor, AAVE); }
export function assertOwnedMorphoBluePositionGraphDescriptorV1(observer,router,descriptor) { assertOwnedOfficialDescriptor(observer,router,descriptor,BLUE); }
export function assertOwnedUniswapGraphDescriptorV1(observer, router, descriptor) { assertOwnedOfficialDescriptor(observer, router, descriptor, UNI); }
function prepareOwnedOfficialDescriptor(input, protocolKind) {
  exactRecord(input, ['observer', 'router', 'route', 'ownerPublicInputs']);
  const batch=batchesV4.get(input.observer);if(batch){const child=batch.children.find(value=>owned.get(value).router===input.router);assert.ok(child,'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');return prepareOwnedOfficialDescriptor({...input,observer:child},protocolKind);}
  const state = owned.get(input.observer); assert.ok(state && state.router === input.router, 'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');
  assert.equal(state.protocolKind, protocolKind, 'EVM_GRAPH_ORIGINAL_PROTOCOL_VARIANT');
  const descriptor = detached({ profile: state.profile, context: state.context,
    plan: { identity: input.router.identity, protocolKind, fee: input.router.fee,
      route: input.route, ownerPublicInputs: input.ownerPublicInputs } });
  assertOwnedOfficialDescriptor(input.observer, input.router, descriptor, protocolKind); return descriptor;
}
export function prepareOwnedMetaMorphoGraphDescriptorV1(input) { return prepareOwnedOfficialDescriptor(input, META); }
export function prepareOwnedAaveStaticGraphDescriptorV1(input) { return prepareOwnedOfficialDescriptor(input, AAVE); }
export function prepareOwnedMorphoBluePositionGraphDescriptorV1(input) { return prepareOwnedOfficialDescriptor(input,BLUE); }
export function prepareOwnedUniswapGraphDescriptorV1(input) { return prepareOwnedOfficialDescriptor(input, UNI); }
export async function createOwnedMetaMorphoGraphDeliveryObserverV1(input) {
  assert.equal(arguments.length, 1); return createOwnedOfficialObserver(input, META);
}
export async function createOwnedUniswapGraphDeliveryObserverV1(input) {
  assert.equal(arguments.length, 1); return createOwnedOfficialObserver(input, UNI);
}
export async function createOwnedAaveStaticGraphDeliveryObserverV1(input) { assert.equal(arguments.length, 1); return createOwnedOfficialObserver(input, AAVE); }
export async function createOwnedMorphoBluePositionGraphDeliveryObserverV1(input) { assert.equal(arguments.length,1); return createOwnedOfficialObserver(input,BLUE); }
async function createOwnedOfficialObserver(input, protocolKind) {
  const blue=protocolKind===BLUE;
  exactRecord(input, blue?['runtime','system','poolIndex','router','position']:['runtime', 'system', 'poolIndex', 'router', 'protocolFixture']);
  const { runtime, system, poolIndex, router } = input, position=blue?input.position:null;
  if(blue)assertOwnedOriginalMorphoBluePositionV1(runtime,position);
  const original=blue?readOwnedOriginalMorphoBluePositionContextV1(runtime,position).protocolFixture:input.protocolFixture;
  const protocol=blue?Object.freeze({...original,vault:position.contract}):original;
  await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system);
  assertOwnedPrivateExternalRouterV1(router, { runtime, system, poolIndex }); assertOfficialProtocolFixture(runtime, original);
  assert.equal(router.protocolKind, protocolKind, 'EVM_GRAPH_ORIGINAL_PROTOCOL_VARIANT');
  const aave = protocolKind === AAVE, uniswap = protocolKind === UNI, output = uniswap ? protocol.second : protocol.vault;
  const nativeProtocol = uniswap ? protocol.swapRouter : protocol.vault;
  const profile = blue ? MORPHO_BLUE_POSITION_GRAPH_DELIVERY_PROFILE_V1 : uniswap ? UNISWAP_GRAPH_DELIVERY_PROFILE_V1 : aave ? AAVE_STATIC_GRAPH_DELIVERY_PROFILE_V1 : METAMORPHO_GRAPH_DELIVERY_PROFILE_V1;
  const id = router.identity, sourcePoolIndex = router.sourcePoolIndex, sourcePool = system.pools[sourcePoolIndex];
  assert.equal(id.inputAsset, bare(protocol.first.address)); assert.equal(id.outputAsset, bare(output.address));
  assert.equal(id.protocol, bare(nativeProtocol.address)); assert.equal(sourcePool.asset, protocol.first.address, 'METAMORPHO_GRAPH_SOURCE_ASSET');
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
  const factoryRows = uniswap ? protocol.deployments.filter(row => row.name === 'uniswap-factory') : [];
  if (uniswap) assert.equal(factoryRows.length, 1, 'UNISWAP_GRAPH_ORIGINAL_FACTORY');
  const factory = factoryRows[0], swapPoolCode = uniswap ? await runtime.code(protocol.pool.address, pins.blockNumber) : null;
  if (uniswap) assert.ok(typeof swapPoolCode === 'string' && swapPoolCode !== '0x', 'UNISWAP_GRAPH_ORIGINAL_POOL_CODE');
  const inputIsToken0 = BigInt(protocol.first.address) < BigInt(output.address);
  async function uniswapAt(at) {
    for (const contract of [protocol.first, protocol.second, protocol.swapRouter, factory])
      assert.equal(await runtime.code(contract.address, at), contract.code, 'METAMORPHO_GRAPH_PROTOCOL_CODE_CHANGED');
    assert.equal(await runtime.code(protocol.pool.address, at), swapPoolCode, 'UNISWAP_GRAPH_POOL_CODE_CHANGED');
    const rows = await Promise.all([
      read(protocol.swapRouter, 'factory', [], at), read(factory, 'getPool', [protocol.first.address, protocol.second.address, 3000], at),
      read(protocol.pool, 'factory', [], at), read(protocol.pool, 'token0', [], at), read(protocol.pool, 'token1', [], at),
      read(protocol.pool, 'fee', [], at), read(protocol.pool, 'slot0', [], at), read(protocol.pool, 'liquidity', [], at),
      read(protocol.first, 'balanceOf', [protocol.pool.address], at), read(protocol.second, 'balanceOf', [protocol.pool.address], at),
      read(protocol.first, 'totalSupply', [], at), read(protocol.second, 'totalSupply', [], at),
      read(protocol.second, 'balanceOf', ['0x' + id.solver], at), read(protocol.pool, 'tickSpacing', [], at),
    ]);
    assert.equal(rows[0][0].toLowerCase(), factory.address); assert.equal(rows[1][0].toLowerCase(), protocol.pool.address);
    assert.equal(rows[2][0].toLowerCase(), factory.address);
    assert.equal(rows[3][0].toLowerCase(), inputIsToken0 ? protocol.first.address : protocol.second.address);
    assert.equal(rows[4][0].toLowerCase(), inputIsToken0 ? protocol.second.address : protocol.first.address);
    assert.equal(rows[5][0], 3000n); assert.equal(router.fee, '3000'); assert.equal(rows[13][0], 60n);
    const slot0 = Array.from(rows[6]).map(value => typeof value === 'boolean' ? value : value.toString());
    assert.equal(slot0.length, 7); assert.ok(BigInt(slot0[0]) > 0n && rows[7][0] > 0n && slot0[6] === true, 'UNISWAP_GRAPH_POOL_ACTIVE');
    return detached({ slot0, liquidity: rows[7][0].toString(), poolInput: rows[8][0].toString(), poolOutput: rows[9][0].toString(),
      inputSupply: rows[10][0].toString(), outputSupply: rows[11][0].toString(), solverOutput: rows[12][0].toString() });
  }
  async function protocolAt(at, amount) {
    if (uniswap) return uniswapAt(at);
    if (aave) {
      await protocol.assertCurrent(at);
      const rows = await Promise.all([
        read(protocol.vault,'totalAssets',[],at), read(protocol.vault,'totalSupply',[],at),
        read(protocol.vault,'previewMint',[amount],at), read(protocol.vault,'maxMint',[router.address],at),
        read(protocol.vault,'balanceOf',['0x'+id.solver],at), read(protocol.vault,'balanceOf',[router.address],at),
        read(protocol.vault,'rate',[],at), read(protocol.aToken,'scaledBalanceOf',[protocol.vault.address],at),
        read(protocol.aToken,'scaledTotalSupply',[],at), read(protocol.aToken,'balanceOf',[protocol.vault.address],at),
        read(protocol.first,'balanceOf',[protocol.aToken.address],at), read(protocol.first,'balanceOf',[protocol.vault.address],at),
        read(protocol.stableDebt,'totalSupply',[],at), read(protocol.variableDebt,'totalSupply',[],at), read(protocol.first,'totalSupply',[],at),
      ]);
      return detached(Object.fromEntries(['totalAssets','totalShares','previewMint','maxMint','solverShares','routerShares',
        'aaveRate','aaveScaled','aaveScaledTotal','aaveAssets','aaveUnderlying','vaultUnderlying','stableDebt','variableDebt','inputSupply']
        .map((key,index)=>[key,rows[index][0].toString()])));
    }
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
    assertOwnedOfficialObserver(observer, { runtime, system, poolIndex }); await assertOwnedLocalEvmV2(runtime);
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
    const decoded = decodePrivateExternalDeliveryCall({ calldata: wire.data, identity: id, protocolKind: router.protocolKind, fee: router.fee });
    const descriptor = prepareOwnedOfficialDescriptor({ observer, router, route: decoded.plan.route, ownerPublicInputs: decoded.plan.ownerPublicInputs }, protocolKind);
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
    if (uniswap) {
      const logs = receipt.logs.filter(log => log.address.toLowerCase() === protocol.pool.address);
      assert.equal(logs.length, 1, 'UNISWAP_GRAPH_EXACT_SWAP');
      const event = protocol.pool.iface.parseLog(logs[0]); assert.equal(event.name, 'Swap', 'UNISWAP_GRAPH_EXACT_SWAP');
      assert.equal(event.args.sender.toLowerCase(), protocol.swapRouter.address, 'UNISWAP_GRAPH_EXACT_SWAP');
      assert.equal(event.args.recipient.toLowerCase(), router.address, 'UNISWAP_GRAPH_EXACT_SWAP');
      assert.equal(inputIsToken0 ? event.args.amount0 : event.args.amount1, spent, 'UNISWAP_GRAPH_EXACT_SWAP');
      assert.equal(inputIsToken0 ? event.args.amount1 : event.args.amount0, -shares, 'UNISWAP_GRAPH_EXACT_SWAP');
      assert.equal(BigInt(after.poolInput), BigInt(before.poolInput) + spent, 'UNISWAP_GRAPH_POOL_BALANCE_DELTA');
      assert.equal(BigInt(after.poolOutput), BigInt(before.poolOutput) - shares, 'UNISWAP_GRAPH_POOL_BALANCE_DELTA');
      assert.equal(after.inputSupply, before.inputSupply, 'UNISWAP_GRAPH_SUPPLY_CHANGED');
      assert.equal(after.outputSupply, before.outputSupply, 'UNISWAP_GRAPH_SUPPLY_CHANGED');
      assert.equal(after.solverOutput, before.solverOutput, 'UNISWAP_GRAPH_POOL_BALANCE_DELTA');
      assert.equal(after.liquidity, before.liquidity, 'UNISWAP_GRAPH_SLOT0_CHANGED');
      assert.equal(event.args.liquidity.toString(), after.liquidity, 'UNISWAP_GRAPH_SLOT0_CHANGED');
      assert.equal(event.args.sqrtPriceX96.toString(), after.slot0[0], 'UNISWAP_GRAPH_SLOT0_CHANGED');
      assert.equal(event.args.tick.toString(), after.slot0[1], 'UNISWAP_GRAPH_SLOT0_CHANGED');
      for (const index of [3, 4, 5, 6]) assert.equal(after.slot0[index], before.slot0[index], 'UNISWAP_GRAPH_SLOT0_CHANGED');
    } else if (aave) {
      assert.equal(spent,BigInt(before.previewMint),'AAVE_GRAPH_ORIGINAL_PREVIEW'); assert.ok(shares<=BigInt(before.maxMint));
      for (const key of ['aaveRate','stableDebt','variableDebt','inputSupply','solverShares','routerShares','vaultUnderlying'])
        assert.equal(after[key],before[key],'AAVE_GRAPH_UNEXPECTED_PROTOCOL_EFFECT');
      assert.equal(BigInt(after.totalShares)-BigInt(before.totalShares),shares,'AAVE_GRAPH_EXACT_STATIC_SHARES');
      const ray=10n**27n, rate=BigInt(before.aaveRate), scaled=(spent*ray+rate/2n)/rate;
      assert.equal(BigInt(after.aaveScaled)-BigInt(before.aaveScaled),scaled,'AAVE_GRAPH_ORIGINAL_SCALED_MINT');
      assert.equal(BigInt(after.aaveScaledTotal)-BigInt(before.aaveScaledTotal),scaled,'AAVE_GRAPH_SCALED_TOTAL_MINT');
      assert.equal(BigInt(after.aaveUnderlying)-BigInt(before.aaveUnderlying),spent,'AAVE_GRAPH_REAL_UNDERLYING_SUPPLY');
      assert.equal(after.aaveAssets,after.totalAssets,'AAVE_GRAPH_WRAPPER_BACKING');
      const delta=BigInt(after.totalAssets)-BigInt(before.totalAssets)-spent;
      assert.ok(delta>=-1n&&delta<=1n,'AAVE_GRAPH_RAY_ROUNDING');
    } else if(blue) {
      assert.equal(spent,BigInt(before.previewMint),'BLUE_GRAPH_ORIGINAL_PREVIEW');assert.ok(shares<=BigInt(before.maxMint));
      const numerator=shares*(BigInt(before.market[0])+1n),denominator=BigInt(before.market[1])+1_000_000n;
      assert.equal(spent,(numerator+denominator-1n)/denominator,'BLUE_GRAPH_ORIGINAL_SHARE_ROUNDING');
      assert.equal(BigInt(after.totalShares)-BigInt(before.totalShares),shares,'BLUE_GRAPH_EXACT_POSITION_SHARES');
      assert.equal(BigInt(after.market[0])-BigInt(before.market[0]),spent,'BLUE_GRAPH_EXACT_MARKET_ASSETS');
      assert.equal(BigInt(after.market[1])-BigInt(before.market[1]),shares,'BLUE_GRAPH_EXACT_MARKET_SHARES');
      assert.equal(before.position[0],before.totalShares,'BLUE_GRAPH_EXACT_POSITION_BACKING');
      assert.equal(after.position[0],after.totalShares,'BLUE_GRAPH_EXACT_POSITION_BACKING');
      assert.equal(BigInt(after.morphoUnderlying)-BigInt(before.morphoUnderlying),spent,'BLUE_GRAPH_EXACT_TOKEN_BACKING');
      for(const key of ['solverShares','routerShares','vaultUnderlying'])assert.equal(after[key],before[key],'BLUE_GRAPH_NO_UNCLAIMED_POSITION');
      for(const state of [before,after]){
        for(const index of [2,3,5])assert.equal(state.market[index],'0','BLUE_GRAPH_NO_DEBT');
        for(const index of [1,2])assert.equal(state.position[index],'0','BLUE_GRAPH_NO_DEBT');
        const assets=BigInt(state.totalShares)*(BigInt(state.market[0])+1n)/(BigInt(state.market[1])+1_000_000n);
        assert.equal(BigInt(state.totalAssets),assets,'BLUE_GRAPH_ORIGINAL_POSITION_VALUE');
      }
    } else {
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
    }
    const current = await targetReader.read(); sameContext(await router.read(current.header.number));
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
  observer = Object.freeze({ identity: detached(id),
    binding: detached({ poolIndex, recipientIndex: String(poolIndex), genesis: context.genesisHash,
      asset: context.targetAssetIdentity, sourceEndpoint: id.solver, destinationEndpoint: id.router }),
    classification: blue ? 'OWNED_LOCAL_ORIGINAL_MORPHO_BLUE_PRIVATE_SUPPLY_NOT_PUBLIC_CONSENSUS' : uniswap ? 'OWNED_LOCAL_OFFICIAL_UNISWAP_NOT_PUBLIC_CONSENSUS' : aave ? 'OWNED_LOCAL_OFFICIAL_AAVE_STATIC_NOT_PUBLIC_CONSENSUS' : 'OWNED_LOCAL_OFFICIAL_METAMORPHO_NOT_PUBLIC_CONSENSUS',
    // Return the existing arrival shape so owner custody validates its retained
    // D27 proof/opening without adding a second credit authority.
    async observe(query) { return (await inspect(query, {}))?.arrival ?? null; },
    async assertPrepared(input) {
      exactRecord(input, ['prepared', 'intent']); const { prepared, intent } = detached(input);
      assertOwnedOfficialDescriptor(observer, router, intent.descriptor);
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
      if (uniswap) {
        // The original runtime already simulated this exact D27-bound calldata
        // with eth_estimateGas at this pinned head and repeats it before key use.
        // ERC20 reserves alone are not a V3 quote or an available-liquidity claim.
        assert.ok(BigInt(state.poolOutput) >= BigInt(plan.route.outputAmount), 'UNISWAP_GRAPH_PREFLIGHT_OUTPUT_RESERVE');
      } else {
        assert.ok(BigInt(state.previewMint) > 0n && BigInt(state.previewMint) <= BigInt(plan.route.maximumInput), 'METAMORPHO_GRAPH_PREFLIGHT_MAXIMUM');
        assert.ok(BigInt(plan.route.outputAmount) <= BigInt(state.maxMint), 'METAMORPHO_GRAPH_PREFLIGHT_CAPACITY');
      }
      const [allowance, balance] = await Promise.all([read(protocol.first, 'allowance', [tx.from, router.address], at), read(protocol.first, 'balanceOf', [tx.from], at)]);
      assert.equal(allowance[0].toString(), plan.route.maximumInput); assert.ok(balance[0] >= BigInt(plan.route.maximumInput));
      const targetPool = system.pools[poolIndex];
      const [consumed, inserted, protocolAllowance, poolAllowance] = await Promise.all([
        runtime.call({ to: router.address, data: '0x' + publicKeccak256(Buffer.from('consumed(bytes32)')).subarray(0, 4).toString('hex') + intent.receiptKeyCommitment }, at),
        targetPool.call('insertedCommitments(bytes32)', ['0x' + statement.output], at),
        read(protocol.first, 'allowance', [router.address, nativeProtocol.address], at),
        read(output, 'allowance', [router.address, targetPool.address], at),
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
        economicFacts.set(result, observed.economics);
      } catch (error) { result = detached(failure(error, auth.authenticated)); }
      facts.set(result, observer); return result;
    },
  });
  owned.set(observer, { runtime, system, poolIndex, router, protocolFixture: original,position, context, protocolKind, profile }); return observer;
}

/** A finite original multi-delivery reader. Each original router keeps its own
 * exact approval and native inspection. No endpoint from a query is adopted. */
export function isOwnedMetaMorphoGraphDeliveryBatchV4(observer){assert.equal(arguments.length,1);return batchesV4.has(observer);}
export function readOriginalMetaMorphoGraphBatchRoutersV4(observer,expected){
 assert.equal(arguments.length,2);assertOwnedMetaMorphoGraphDeliveryObserverV1(observer,expected);const batch=batchesV4.get(observer);assert.ok(batch,'METAMORPHO_GRAPH_ORIGINAL_BATCH');return Object.freeze(batch.children.map(child=>owned.get(child).router));
}
export function readOriginalMetaMorphoGraphBatchFactsBindingsV4(observer){
 assert.equal(arguments.length,1);const batch=batchesV4.get(observer),state=owned.get(observer);assert.ok(batch&&state,'METAMORPHO_GRAPH_ORIGINAL_BATCH');assertOwnedMetaMorphoGraphDeliveryObserverV1(observer,{runtime:state.runtime,system:state.system,poolIndex:state.poolIndex});return detached(batch.children.map(child=>child.binding));
}
export async function createOwnedMetaMorphoGraphDeliveryBatchV4(input){
 assert.equal(arguments.length,1);exactRecord(input,['runtime','system','poolIndex','protocolFixture','count']);const {runtime,system,poolIndex,protocolFixture,count}=input;
 assert.ok(Number.isInteger(count)&&count>=2&&count<=4,'METAMORPHO_GRAPH_BATCH_COUNT');assert.equal(poolIndex,1);await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);assertOfficialProtocolFixture(runtime,protocolFixture);
 const readers=[];for(const index of [0,1]){const reader=await createFlatSystemStateReader({runtime,system,poolIndex:index}),view=await reader.read();await reader.assertCurrent(view);assert.equal(view.ledger.commitments.length,0,'METAMORPHO_GRAPH_BATCH_BEFORE_FUNDING');assert.equal(view.ledger.nullifiers.length,0,'METAMORPHO_GRAPH_BATCH_BEFORE_FUNDING');readers.push(reader);}
 const children=[];for(let slot=0;slot<count;slot++){const router=await createOwnedPrivateExternalRouterV1({runtime,system,poolIndex,protocolFixture,protocolKind:META});children.push(await createOwnedMetaMorphoGraphDeliveryObserverV1({runtime,system,poolIndex,router,protocolFixture}));}
 return issueOriginalMetaMorphoGraphBatchV4({runtime,system,poolIndex,protocolFixture,children,readers});
}
/** Only the fixed original system opener can supply this one-use token. No
 * router is created, funded, adopted by address or selected by an HTTP frame. */
export async function reopenOwnedMetaMorphoGraphDeliveryBatchV4(token){
 assert.equal(arguments.length,1);const {consumeExternalDefiBootstrapPartV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
 const {runtime,system,protocolFixture,routers}=consumeExternalDefiBootstrapPartV1(token,'meta-batch');assert.ok(Array.isArray(routers)&&routers.length>=2&&routers.length<=4,'METAMORPHO_GRAPH_BATCH_COUNT');
 await assertOwnedLocalEvmV2(runtime);assertOwnedFlatSystem(runtime,system);assertOfficialProtocolFixture(runtime,protocolFixture);const children=[];
 for(const router of routers){assertOwnedPrivateExternalRouterV1(router,{runtime,system,poolIndex:1});assert.equal(router.protocolKind,META);children.push(await createOwnedMetaMorphoGraphDeliveryObserverV1({runtime,system,poolIndex:1,router,protocolFixture}));}
 return issueOriginalMetaMorphoGraphBatchV4({runtime,system,poolIndex:1,protocolFixture,children,readers:[]});
}
async function issueOriginalMetaMorphoGraphBatchV4({runtime,system,poolIndex,protocolFixture,children,readers}){
 const count=children.length;assert.equal(new Set(children.map(child=>child.identity.router)).size,count,'METAMORPHO_GRAPH_DISTINCT_ROUTERS');const first=owned.get(children[0]);for(const child of children){const value=owned.get(child);assert.equal(value.runtime,runtime);assert.equal(value.system,system);assert.equal(value.protocolFixture,protocolFixture);assert.deepEqual(value.context,first.context);}
 for(const reader of readers){const view=await reader.read();await reader.assertCurrent(view);assert.equal(view.ledger.commitments.length,0,'METAMORPHO_GRAPH_BATCH_BEFORE_FUNDING');assert.equal(view.ledger.nullifiers.length,0,'METAMORPHO_GRAPH_BATCH_BEFORE_FUNDING');}
 let observer;
 const select=async query=>{exactRecord(query,['transactionHash','calldataSHA256']);bytes32(query.transactionHash,true);bytes32(query.calldataSHA256,true);const entries=runtime.transactions.filter(row=>row.transactionHash==='0x'+query.transactionHash);assert.equal(entries.length,1,'METAMORPHO_GRAPH_ORIGINAL_SIGNED_JOURNAL');const row=entries[0],signed=await runtime.signedTransaction(row.transactionHash);assert.deepEqual(signed,row.signed,'METAMORPHO_GRAPH_ORIGINAL_SIGNED_WIRE');const wire=assertSignedEvmTransaction(signed.nativeWire,row.prepared.transaction);assert.equal(wire.nativeId,row.transactionHash);assert.equal(sha(Buffer.from(wire.data.slice(2),'hex')),query.calldataSHA256,'METAMORPHO_GRAPH_ORIGINAL_CALLDATA');const child=children.find(value=>value.identity.router===bare(wire.to));assert.ok(child,'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');return child;};
 observer=Object.freeze({identity:children[0].identity,binding:children[0].binding,classification:'OWNED_LOCAL_ORIGINAL_METAMORPHO_ROUTER_BATCH_NOT_PUBLIC_CONSENSUS',
  async observe(query){return(await select(query)).observe(query);},
  async assertPrepared(input){exactRecord(input,['intent','prepared']);const child=children.find(value=>value.identity.router===input.intent.descriptor.plan.identity.router);assert.ok(child,'METAMORPHO_GRAPH_ORIGINAL_ROUTER_REQUIRED');assertOwnedMetaMorphoGraphDescriptorV1(observer,owned.get(child).router,input.intent.descriptor);return child.assertPrepared(input);},
  async observeFacts(query){let result;try{const child=await select(query),original=await child.observeFacts(query);assertOwnedMetaMorphoGraphDeliveryFactsV1(original,{observer:child});result=detached(original);if(result.status==='observed')economicFacts.set(result,readOriginalEvmGraphDeliveryEconomicFactsV1(original,child));}catch{result=detached({status:'unknown',reason:'METAMORPHO_GRAPH_BATCH_OBSERVATION_UNAVAILABLE'});}facts.set(result,observer);return result;}
 });owned.set(observer,{...first});batchesV4.set(observer,{children:Object.freeze(children)});assertOwnedMetaMorphoGraphDeliveryObserverV1(observer,{runtime,system,poolIndex});return observer;
}
