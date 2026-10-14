/** HOST original policy closure with synthetic owned-chain reader ports.
 * No contracts, keys, notes, grants, deployment or financial effects. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
const systems = new WeakMap(), authorities = new WeakMap(), readers = new WeakMap();
mock.module(new URL('../../../src/operations/deployments/system/deploy-system.mjs', import.meta.url), { exports: {
  assertOwnedFlatSystem: (runtime, system) => assert.equal(systems.get(runtime), system),
  describeOwnedFlatPoolRegistry: () => ({ appendFenced: false }),
} });
mock.module(new URL('../../../src/accounts/authority/flat-account-authority.mjs', import.meta.url), { exports: {
  assertOwnedFlatAccountAuthority: (account, expected) => assert.deepEqual(authorities.get(account), expected),
} });
mock.module(new URL('../../../src/execution/account/reconciliation/flat-system-state.mjs', import.meta.url), { exports: {
  createFlatSystemStateReader: async ({ system, poolIndex }) => readers.get(system)[poolIndex],
} });
const { createFlatPoolAdmissionPolicy } = await import('../../../src/accounts/authority/flat-pool-admission-policy.mjs');
const hash = n => n.toString(16).padStart(64, '0'), address = n => n.toString(16).padStart(40, '0');
function view(changes = {}) {
  const state = { leaves: 0, spent: 0, liveReservations: 0, outputCapacity: 0, sequence: '0',
    actualAssetBalance: '0', backedAmount: '0', unrelatedNative: '0', ...changes };
  return { head: { number: '1', hash: hash(9) }, ledger: { publicState: state,
    commitments: Array.from({ length: state.leaves }, (_, n) => hash(100 + n)),
    nullifiers: Array.from({ length: state.spent }, (_, n) => hash(200 + n)) },
    state: { receiptCount: '0', spentTagCount: '0', totalReservedTagCapacity: '0',
      revokedCount: '0', stateSequence: '0', halted: false }, authorizationTree: { count: 0 },
    checkpointCount: '0', spentTags: [], revokedEntries: [] };
}
async function fixture(first = view()) {
  const runtime = {}, views = [first, view()], privateStatuses = [{ operations: [] }, { operations: [] }];
  const system = { pools: [0, 1].map(n => ({ address: '0x' + address(n + 1), assetIdentity: '0x' + hash(2),
    codeHash: '0x' + hash(3 + n), domain: hash(5 + n), domainCommitment: '0x' + hash(5 + n) })),
    hub: { address: '0x' + address(8), codeHash: '0x' + hash(8) }, hubDomain: '0x' + hash(10),
    ledgerNamespace: '0x' + hash(11), registryCommitment: '0x' + hash(12), verifierSetCommitment: '0x' + hash(13),
    provenance: { source: hash(14) }, verifiers: {} };
  systems.set(runtime, system);
  const accounts = system.pools.map((pool, poolIndex) => {
    const account = { config: { accountId: 'original_account_' + poolIndex, journalId: 'original_journal_' + poolIndex,
      lifetime: hash(40 + poolIndex), registry: [{ assetId: hash(20 + poolIndex), pool: pool.address.slice(2),
      assetIdentity: hash(2), chainId: '31337', genesis: hash(30), kind: 'NATIVE', token: '0'.repeat(40),
      codeHash: pool.codeHash.slice(2), decimals: 18 }] }, privateStatus: async () => privateStatuses[poolIndex] };
    authorities.set(account, { runtime, system, poolIndex }); return { poolIndex, account };
  });
  readers.set(system, views.map((_, n) => ({ read: async () => views[n], assertCurrent: async actual => assert.equal(actual, views[n]) })));
  const policy = await createFlatPoolAdmissionPolicy({ runtime, system, accounts,
    routeOrder: accounts.map(row => row.account.config.registry[0].assetId) });
  return { policy, views, privateStatuses, first: hash(20), second: hash(21) };
}
test('only an already original owned fresh successor receives new admissions; old bound requests remain old', async () => {
  const f = await fixture();
  const original = { kind: 'TOP_UP', assetId: f.first, ownerOperationRef: 'original-top-up' };
  await f.policy.beforePrepare(original);
  f.views[0] = view({ leaves: 64, spent: 61, outputCapacity: 3, sequence: '1' });
  assert.equal((await f.policy.capacityDecision({ assetId: f.first })).decision, 'POOL_SUCCESSOR_REQUIRED');
  await assert.rejects(f.policy.selectTopUp({ assetId: f.first, allowRotation: false }), /POOL_SUCCESSOR_REQUIRED/);
  const selection = await f.policy.selectTopUp({ assetId: f.first });
  assert.equal(selection.assetId, f.second); assert.deepEqual(f.policy.status().current, [f.second]);
  await f.policy.beforePrepare(original); // Exact already-bound preparation does not change route.
  assert.equal(f.policy.status().rotations[0].retainedOriginal.capacity.leaves, 64);
  assert.equal(f.policy.status().globalGraphCapacityExtended, false);
  await f.policy.beforePrepare({ kind: 'EXIT', assetId: f.first, ownerOperationRef: 'exit-original' });
});
test('global hub exhaustion never rotates to a superficially fresh pool', async () => {
  const f = await fixture();
  for (const v of f.views) { v.state.spentTagCount = '64'; v.spentTags = Array.from({ length: 64 }, (_, n) => hash(n + 1)); }
  assert.equal((await f.policy.capacityDecision({ assetId: f.first })).decision, 'FULL_HUB_ROTATION_REQUIRED');
  await assert.rejects(f.policy.selectTopUp({ assetId: f.first }), /FULL_HUB_ROTATION_REQUIRED/);
  assert.equal(f.policy.status().rotations.length, 0);
  await f.policy.beforePrepare({ kind: 'EXIT', assetId: f.first, ownerOperationRef: 'old-exit' });
});
test('an unresolved original operation fences fresh selection before reading another pool', async () => {
  const f = await fixture(); f.privateStatuses[0].operations = [{ stage: 'UNKNOWN' }];
  await assert.rejects(f.policy.selectTopUp({ assetId: f.first }), /ORIGINAL_OUTCOME_UNRESOLVED/);
  assert.equal(f.policy.status().admissionsFenced, true);
});

test('a full per-domain receipt or authorization tree selects a same-hub successor and preserves existing exits',async()=>{
 for(const exhausted of ['receipt','authorization']){
  const first=view({sequence:'1'});if(exhausted==='receipt')first.state.receiptCount='64';else first.authorizationTree.count=64;
  const f=await fixture(first);
  assert.equal((await f.policy.capacityDecision({assetId:f.first})).decision,'POOL_SUCCESSOR_REQUIRED');
  await assert.rejects(f.policy.selectTopUp({assetId:f.first,allowRotation:false}),/POOL_SUCCESSOR_REQUIRED/);
  await assert.rejects(f.policy.beforePrepare({kind:'TOP_UP',assetId:f.first,ownerOperationRef:'new-on-full-'+exhausted}),/POOL_SUCCESSOR_REQUIRED/);
  const selected=await f.policy.selectTopUp({assetId:f.first});assert.equal(selected.assetId,f.second);
  assert.equal(selected.route.hub,f.policy.identityForAsset(f.first).hub);
  assert.equal(f.policy.status().rotations.length,1);
  await f.policy.beforePrepare({kind:'EXIT',assetId:f.first,ownerOperationRef:'retained-exit-'+exhausted});
 }
});
