/** HOST-only selection state machine. Kernel handles and RPC capacity are
 * explicit stubs; no Source, signature, journal, deposit or public write. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';

const systems = new WeakSet(), runtime = Object.freeze({}), attempts = new WeakMap(), capacity = new WeakMap();
const original = system => {assert.ok(systems.has(system), 'HOST_ORIGINAL_SYSTEM'); return system;};
const kernel = new URL('../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs', import.meta.url).href;
mock.module(kernel, {exports: {
 assertOriginalFundedPagedGraphSepoliaWalletV4(actual, system) {assert.equal(actual, runtime); return original(system);},
 readOriginalPagedSepoliaSuccessorAttemptV4(actual, system) {assert.equal(actual, runtime); original(system); return attempts.get(system) ?? null;},
 async assertOriginalPagedSepoliaSuccessorSelectionV4(actual, parent, child, configuration) {
  assert.equal(actual, runtime); original(parent); original(child);
  assert.equal(attempts.get(parent).system, child, 'HOST_ORIGINAL_CHILD'); assert.equal(attempts.get(parent).configuration, configuration); return child;
 },
}});
mock.module(new URL('../../src/operations/recovery/paged-public-pool-capacity-v5.mjs', import.meta.url).href, {exports: {
 async readOriginalPagedPublicPoolCapacityV5(actual, system) {assert.equal(actual, runtime); original(system); return Object.freeze({...capacity.get(system)});},
}});
const Selection = await import('../../src/operations/recovery/paged-public-pool-rollover-v5.mjs');

function fixture() {
 const common = {profile: 'HOST_COMPILED_PROFILE', securityGeneration: 'EXACT_PAYOUT_SET_V4', manifestSHA256: 'a'.repeat(64), consumerSHA256: 'b'.repeat(64), assetIdentity: 'c'.repeat(64), policy: 'd'.repeat(64), minimumDepositAtomic: '100', registry: {registryEpoch: '1', rulesRoot: 'e'.repeat(64), keys: ['HOST_KEYS']}};
 const make = name => ({...structuredClone(common), ...Object.fromEntries(['pool', 'state', 'native', 'scope', 'domain'].map(key => [key, name + key]))});
 const parent = make('parent'), child = make('child'); systems.add(parent); systems.add(child);
 attempts.set(parent, {system: child, configuration: Object.freeze({profile: 'HOST_ORIGINAL_CONFIGURATION'})});
 const head = {blockHash: 'a'.repeat(64), leafCount: '0', liveReservations: '0', backedAmountAtomic: '0', acceptsDepositAndGraph: true, financialAuthorization: false};
 capacity.set(parent, {...head, availableSlots: '2', leafCount: '254'}); capacity.set(child, {...head, availableSlots: '256'});
 return {parent, child};
}

test('physical rollover requires a full original parent and fresh linked child; copied tokens never select or grant funds', async () => {
 const {parent, child} = fixture();
 await assert.rejects(Selection.issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, {...parent}, child), /HOST_ORIGINAL_SYSTEM/);
 capacity.get(parent).availableSlots = '3';
 await assert.rejects(Selection.issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, parent, child), /SPACE_AVAILABLE/);
 capacity.get(parent).availableSlots = '2';
 const token = await Selection.issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, parent, child);
 assert.deepEqual(Reflect.ownKeys(token), []); assert.equal(Object.getPrototypeOf(token), null);
 await assert.rejects(Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5({...token}, runtime, parent), /ORIGINAL_SELECTION/);
 await assert.rejects(Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, {...runtime}, parent), /ORIGINAL_SELECTION/);
 const selected = await Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, runtime, parent);
 assert.equal(selected.childSystem, child); assert.equal(selected.parentSystem, parent); assert.equal(selected.runtime, runtime);
 assert.equal(selected.capacityHead.financialAuthorization, false); assert.deepEqual(Object.keys(selected).sort(), ['capacityHead', 'childSystem', 'parentSystem', 'runtime']);
 await assert.rejects(Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, runtime, parent), /ORIGINAL_SELECTION/);
});

test('selection revalidates canonical capacity and fences a changed head or used child without reusable tokens', async () => {
 for (const change of [
  ({parent, child}) => {capacity.get(parent).blockHash = 'b'.repeat(64); capacity.get(child).blockHash = 'b'.repeat(64);},
  ({child}) => {capacity.get(child).leafCount = '1';},
  ({parent}) => {capacity.get(parent).availableSlots = '3';},
 ]) {
  const pair = fixture(), token = await Selection.issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, pair.parent, pair.child); change(pair);
  await assert.rejects(Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, runtime, pair.parent), /HEAD_CHANGED|ALREADY_USED|SPACE_AVAILABLE/);
  await assert.rejects(Selection.consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, runtime, pair.parent), /ORIGINAL_SELECTION/);
 }
});

test('lower deposit minimum, changed policy or quorum, and unrelated original child cannot become a selection', async () => {
 for (const change of [
  ({child}) => {child.minimumDepositAtomic = '99';},
  ({child}) => {child.policy = 'foreign';},
  ({child}) => {child.registry.keys = ['FOREIGN_KEYS'];},
  ({parent, child}) => {attempts.get(parent).system = {...child};},
 ]) {
  const pair = fixture(); change(pair);
  await assert.rejects(Selection.issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, pair.parent, pair.child), /MINIMUM_DECREASED|COMMON_BINDING|QUORUM|HOST_ORIGINAL_CHILD/);
 }
});
