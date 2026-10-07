import test from 'node:test';
import assert from 'node:assert/strict';
import { poolEconomicIdentity, projectPoolCapacity, assertPoolHistoryAdvance,
  assertFreshPoolSuccessor } from './flat-pool-route-state.mjs';
const capacity = change => projectPoolCapacity({ leaves: 0, spent: 0, reservations: 0, outputs: 0,
  authorizationLeaves: 0, receipts: 0, globalSpentTags: 0, globalReservedTags: 0,
  checkpoints: 0, revoked: 0, halted: false, held: '0', liabilities: '0', unrelatedNative: '0', ...change });
const descriptor = change => ({ assetId: 'first', pool: 'pool-a', economicIdentitySHA256: 'asset',
  chainId: '31337', genesis: 'genesis', hub: 'hub', hubDomain: 'hub-domain', ledgerNamespace: 'namespace',
  registryCommitment: 'registry', verifierSetCommitment: 'verifiers', sourceProvenanceSHA256: 'source',
  keyLineageSHA256: 'keys', domainCommitment: 'domain-a', ...change });
const observation = change => ({ routeIdentitySHA256: 'route', sequence: '1', hubSequence: '1',
  blockNumber: '10', blockHash: 'block', capacity: capacity({ leaves: 1, outputs: 1, held: '100', liabilities: '100' }),
  commitments: ['note-1'], nullifiers: [], tags: [], revokedGIDs: [], ...change });
test('capacity-only padding survives zero monetary backing and retirement presentation', () => {
  const terminal = capacity({ leaves: 7, spent: 4, outputs: 3, globalSpentTags: 4, checkpoints: 1 });
  assert.equal(terminal.monetaryRetirable, true); assert.equal(terminal.outputs, 3);
  assert.equal(terminal.liabilities, '0'); assert.equal(terminal.fresh, false);
  assert.equal(terminal.spentHeadroom, 57); assert.equal(terminal.topUp, true);
});
test('no capacity is reclaimed by withdrawals; exact original backing stays distinct', () => {
  const exhausted = capacity({ leaves: 64, spent: 61, outputs: 3 });
  assert.equal(exhausted.topUp, false); assert.equal(exhausted.graph, false);
  assert.equal(exhausted.monetaryRetirable, true);
  assert.throws(() => capacity({ held: '0', liabilities: '1' }), /BACKING_DEFICIT/);
  assert.throws(() => capacity({ spent: 62, outputs: 3 }), /HEADROOM/);
  assert.throws(() => capacity({ leaves: 61, reservations: 1 }), /HEADROOM/);
});
test('global tag/checkpoint/revocation exhaustion is never fixed by fresh pools', () => {
  for (const change of [{ globalSpentTags: 64 }, { checkpoints: 64 }, { revoked: 64, halted: true }]) {
    const value = capacity({ outputs: 1, ...change });
    assert.equal(value.graph, false); assert.equal(value.topUp, true);
  }
  assert.throws(() => capacity({ revoked: 64, halted: false }), /HALT/);
});
test('deposit and reserve projections match Solidity headroom at every bounded state', () => {
  let cases = 0;
  for (let leaves = 0; leaves <= 64; leaves++) for (let spent = 0; spent <= 64; spent++)
    for (let reservations = 0; reservations <= 12; reservations++) {
      const outputs = (leaves + spent) % 8;
      if (leaves + 4 * reservations > 64 || spent + 5 * reservations + outputs > 64) continue;
      const state = capacity({ leaves, spent, reservations, outputs });
      assert.equal(state.topUp, leaves + 1 + 4 * reservations <= 64 && spent + 5 * reservations + outputs + 1 <= 64);
      assert.equal(state.graph, outputs > 0 && leaves + 2 + 4 * (reservations + 1) <= 64
        && spent + 1 + 5 * (reservations + 1) + outputs <= 64);
      cases++;
    }
  assert.ok(cases > 10000);
});
test('monotonic prefix history rejects regressions, nullifier replacement and ambiguous heads', () => {
  const prior = observation();
  assertPoolHistoryAdvance(prior, observation());
  assertPoolHistoryAdvance(prior, observation({ sequence: '2', blockNumber: '11', blockHash: 'new',
    capacity: capacity({ leaves: 1, spent: 1 }), nullifiers: ['nf-1'] }));
  for (const next of [observation({ sequence: '0' }), observation({ blockNumber: '9' }),
    observation({ blockHash: 'reorg' }), observation({ commitments: ['replacement'] }),
    observation({ routeIdentitySHA256: 'foreign' }), observation({ capacity: capacity() })])
    assert.throws(() => assertPoolHistoryAdvance(prior, next), /FLAT_POOL_ROUTES/);
  assert.throws(() => assertPoolHistoryAdvance(observation({ nullifiers: ['nf'] }),
    observation({ nullifiers: ['other'] })), /HISTORY_REPLACED/);
});
test('same denomination never aliases note IDs, domains, source, keys or hub replay identity', () => {
  const from = descriptor(), to = descriptor({ assetId: 'second', pool: 'pool-b', domainCommitment: 'domain-b' });
  assertFreshPoolSuccessor(from, to, capacity());
  for (const name of ['economicIdentitySHA256', 'genesis', 'hub', 'hubDomain', 'ledgerNamespace',
    'registryCommitment', 'verifierSetCommitment', 'sourceProvenanceSHA256', 'keyLineageSHA256'])
    assert.throws(() => assertFreshPoolSuccessor(from, { ...to, [name]: 'foreign' }, capacity()), /SUCCESSOR/);
  assert.throws(() => assertFreshPoolSuccessor(from, { ...to, domainCommitment: from.domainCommitment }, capacity()), /REUSED_DOMAIN/);
  assert.throws(() => assertFreshPoolSuccessor(from, to, capacity({ leaves: 1 })), /NOT_FRESH/);
  const asset = { chainId: '31337', genesis: 'genesis', kind: 'ERC20', token: 'token', codeHash: 'token-code',
    assetIdentity: 'asset', decimals: 6 };
  assert.equal(poolEconomicIdentity(asset), poolEconomicIdentity({ ...asset, pool: 'different' }));
  assert.notEqual(poolEconomicIdentity(asset), poolEconomicIdentity({ ...asset, token: 'other' }));
  assert.notEqual(poolEconomicIdentity(asset), poolEconomicIdentity({ ...asset, codeHash: 'upgraded' }));
});
