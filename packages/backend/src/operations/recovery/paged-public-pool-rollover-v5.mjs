/** Physical pool selection only. A current wallet approval and the sponsor's
 * cumulative limits remain necessary for every new Source and withdrawal. */
import assert from 'node:assert/strict';
import {
 assertOriginalFundedPagedGraphSepoliaWalletV4,
 readOriginalPagedSepoliaSuccessorAttemptV4,
 assertOriginalPagedSepoliaSuccessorSelectionV4,
} from '../local/funded-graph-paged-public-kernel-v4.mjs';
import {readOriginalPagedPublicPoolCapacityV5} from './paged-public-pool-capacity-v5.mjs';

const issued = new WeakMap();
const lifetimeMs = 300000;

async function readSelection(runtime, parentSystem, childSystem) {
 assertOriginalFundedPagedGraphSepoliaWalletV4(runtime, parentSystem);
 assertOriginalFundedPagedGraphSepoliaWalletV4(runtime, childSystem);
 assert.notEqual(childSystem, parentSystem, 'PAGED_PUBLIC_ROLLOVER_DISTINCT_POOL');
 const attempt = readOriginalPagedSepoliaSuccessorAttemptV4(runtime, parentSystem);
 assert.ok(attempt?.system, 'PAGED_PUBLIC_ROLLOVER_FINALIZED_CHILD_REQUIRED');
 assert.deepEqual(attempt.system, childSystem, 'PAGED_PUBLIC_ROLLOVER_ORIGINAL_CHILD');
 await assertOriginalPagedSepoliaSuccessorSelectionV4(runtime, parentSystem, childSystem, attempt.configuration);
 for (const field of ['profile', 'securityGeneration', 'manifestSHA256', 'consumerSHA256', 'assetIdentity', 'policy']) {
  assert.equal(childSystem[field], parentSystem[field], 'PAGED_PUBLIC_ROLLOVER_COMMON_BINDING');
 }
 for (const field of ['pool', 'state', 'native', 'scope', 'domain']) {
  assert.notEqual(childSystem[field], parentSystem[field], 'PAGED_PUBLIC_ROLLOVER_DISTINCT_BINDING');
 }
 for (const field of ['registryEpoch', 'rulesRoot', 'keys']) {
  assert.deepEqual(childSystem.registry[field], parentSystem.registry[field], 'PAGED_PUBLIC_ROLLOVER_QUORUM');
 }
 assert.ok(BigInt(childSystem.minimumDepositAtomic) >= BigInt(parentSystem.minimumDepositAtomic), 'PAGED_PUBLIC_ROLLOVER_MINIMUM_DECREASED');
 const parentCapacity = await readOriginalPagedPublicPoolCapacityV5(runtime, parentSystem);
 assert.ok(BigInt(parentCapacity.availableSlots) < 3n, 'PAGED_PUBLIC_ROLLOVER_SPACE_AVAILABLE');
 const childCapacity = await readOriginalPagedPublicPoolCapacityV5(runtime, childSystem);
 assert.equal(parentCapacity.blockHash, childCapacity.blockHash, 'PAGED_PUBLIC_ROLLOVER_HEAD_CHANGED');
 assert.equal(childCapacity.leafCount, '0', 'PAGED_PUBLIC_ROLLOVER_CHILD_ALREADY_USED');
 assert.equal(childCapacity.liveReservations, '0', 'PAGED_PUBLIC_ROLLOVER_CHILD_ALREADY_USED');
 assert.equal(childCapacity.backedAmountAtomic, '0', 'PAGED_PUBLIC_ROLLOVER_CHILD_ALREADY_USED');
 assert.equal(childCapacity.acceptsDepositAndGraph, true, 'PAGED_PUBLIC_ROLLOVER_CHILD_FULL');
 return Object.freeze({runtime, parentSystem, childSystem, capacityHead: parentCapacity});
}

export async function issueOriginalPagedPublicSameWalletPoolRolloverV5(runtime, parentSystem, childSystem) {
 assert.equal(arguments.length, 3);
 const selected = await readSelection(runtime, parentSystem, childSystem);
 const token = Object.freeze(Object.create(null));
 issued.set(token, {selected, expires: performance.now() + lifetimeMs, used: false});
 return token;
}

/** Fixed higher-level wallet owners consume this token. Kernel must not import
 * this module: keeping the dependency in one direction avoids another cycle. */
export async function consumeOriginalPagedPublicSameWalletPoolRolloverV5(token, runtime, parentSystem) {
 assert.equal(arguments.length, 3);
 const row = issued.get(token);
 assert.ok(row && !row.used && row.selected.runtime === runtime && row.selected.parentSystem === parentSystem, 'PAGED_PUBLIC_ROLLOVER_ORIGINAL_SELECTION');
 row.used = true;
 assert.ok(performance.now() < row.expires, 'PAGED_PUBLIC_ROLLOVER_SELECTION_EXPIRED');
 const current = await readSelection(runtime, parentSystem, row.selected.childSystem);
 assert.equal(current.capacityHead.blockHash, row.selected.capacityHead.blockHash, 'PAGED_PUBLIC_ROLLOVER_HEAD_CHANGED');
 assert.ok(performance.now() < row.expires, 'PAGED_PUBLIC_ROLLOVER_SELECTION_EXPIRED');
 return current;
}
