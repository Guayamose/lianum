/** Pure V1 capacity/routing predicates. These values never confer chain authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const fail = name => 'FLAT_POOL_ROUTES_' + name;
export const poolRouteDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const decimal = value => { assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value
  && BigInt(value) < 1n << 256n, fail('DECIMAL')); return BigInt(value); };
const count = value => { assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= 64, fail('CAPACITY_COUNT')); return value; };
export function poolEconomicIdentity(asset) {
  // Native registry codeHash identifies the pool, not the native denomination.
  return poolRouteDigest({ chainId: asset.chainId, genesis: asset.genesis, kind: asset.kind,
    token: asset.token, tokenCodeHash: asset.kind === 'NATIVE' ? null : asset.codeHash,
    assetIdentity: asset.assetIdentity, decimals: asset.decimals });
}
export function projectPoolCapacity(input) {
  const { leaves, spent, reservations, outputs, authorizationLeaves, receipts, globalSpentTags,
    globalReservedTags, checkpoints, revoked, halted, held, liabilities, unrelatedNative } = input;
  [leaves, spent, reservations, outputs, authorizationLeaves, receipts, globalSpentTags,
    globalReservedTags, checkpoints, revoked].forEach(count);
  assert.equal(typeof halted, 'boolean', fail('HALT'));
  assert.equal(halted, revoked === 64, fail('HALT'));
  assert.ok(leaves + 4 * reservations <= 64 && spent + 5 * reservations + outputs <= 64
    && globalSpentTags + globalReservedTags <= 64, fail('HEADROOM'));
  const actual = decimal(held), backing = decimal(liabilities); decimal(unrelatedNative);
  assert.ok(actual >= backing, fail('BACKING_DEFICIT'));
  const topUp = leaves + 1 + 4 * reservations <= 64 && spent + 5 * reservations + outputs + 1 <= 64;
  const graph = !halted && outputs > 0 && leaves + 2 + 4 * (reservations + 1) <= 64
    && spent + 1 + 5 * (reservations + 1) + outputs <= 64 && authorizationLeaves < 64
    && globalSpentTags + globalReservedTags + 4 <= 64 && checkpoints < 64 && receipts < 64;
  return Object.freeze({ ...input, topUp, graph,
    // Outputs include conservative padding; they are neither money nor an exact note count.
    treeHeadroom: 64 - leaves - 4 * reservations,
    spentHeadroom: 64 - spent - 5 * reservations - outputs,
    monetaryRetirable: actual === 0n && backing === 0n && reservations === 0 && unrelatedNative === '0',
    fresh: leaves === 0 && spent === 0 && reservations === 0 && outputs === 0 && authorizationLeaves === 0
      && receipts === 0 && actual === 0n && backing === 0n && unrelatedNative === '0' });
}
export function assertPoolHistoryAdvance(previous, next) {
  if (!previous) return;
  assert.equal(next.routeIdentitySHA256, previous.routeIdentitySHA256, fail('IDENTITY_CHANGED'));
  for (const name of ['sequence', 'hubSequence', 'blockNumber'])
    assert.ok(decimal(next[name]) >= decimal(previous[name]), fail('HISTORY_REGRESSION'));
  for (const name of ['leaves', 'spent', 'authorizationLeaves', 'receipts', 'globalSpentTags', 'checkpoints', 'revoked'])
    assert.ok(next.capacity[name] >= previous.capacity[name], fail('CAPACITY_REGRESSION'));
  for (const name of ['commitments', 'nullifiers', 'tags', 'revokedGIDs'])
    assert.deepEqual(next[name].slice(0, previous[name].length), previous[name], fail('HISTORY_REPLACED'));
  if (next.blockNumber === previous.blockNumber) assert.equal(next.blockHash, previous.blockHash, fail('HEAD_REPLACED'));
  if (next.sequence === previous.sequence) {
    for (const name of ['leaves', 'spent', 'reservations', 'outputs', 'authorizationLeaves', 'liabilities'])
      assert.equal(next.capacity[name], previous.capacity[name], fail('SEQUENCE_REPLACED'));
  }
}
export function assertFreshPoolSuccessor(from, to, capacity) {
  assert.notEqual(from.assetId, to.assetId, fail('SAME_ROUTE'));
  assert.notEqual(from.pool, to.pool, fail('SAME_POOL'));
  for (const name of ['economicIdentitySHA256', 'chainId', 'genesis', 'hub', 'hubDomain', 'ledgerNamespace',
    'registryCommitment', 'verifierSetCommitment', 'sourceProvenanceSHA256', 'keyLineageSHA256'])
    assert.equal(from[name], to[name], fail('SUCCESSOR_' + name.toUpperCase()));
  assert.notEqual(from.domainCommitment, to.domainCommitment, fail('REUSED_DOMAIN'));
  assert.equal(capacity.fresh, true, fail('SUCCESSOR_NOT_FRESH'));
  assert.equal(capacity.topUp, true, fail('SUCCESSOR_CAPACITY'));
}
