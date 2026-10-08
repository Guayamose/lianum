/** Real encrypted storage, synthetic public chain data; no node or signer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../../../../../engine/src/crypto/vault.mjs';
import { canonical } from '../../../../../engine/src/crypto/privacy.mjs';
import { prepareOwnedTronNative, validateOwnedTronPreparation, assertPreparationCurrent }
  from '../../../../src/chains/tron/transfers/owned-tron-native-value-profile.mjs';

function prepared() {
  const genesis = '0'.repeat(16) + 'ab'.repeat(24), ownerAddress = '41' + '11'.repeat(20), recipientAddress = '41' + '22'.repeat(20);
  const binding = Object.fromEntries(['leaseId','profileCommitment','genesis','actionCommitment','receiptKeyCommitment',
    'readyStatement','dependencyProofSHA256','readyProofSHA256'].map((name, index) => [name, name === 'genesis' ? genesis : String(index + 1).repeat(64)]));
  const intent = { ownerAddress, recipientAddress, amountSun: '100000', wireKeyCommitment: binding.receiptKeyCommitment };
  const head = { id: '0000000000000064' + '34'.repeat(24), number: '100', timestampMs: '1791450000000' };
  const snapshot = { genesis, head: { ...head }, solid: { ...head }, reference: { ...head }, ownerAddress, recipientAddress,
    ownerPermission: { id: '0', type: 'Owner', threshold: '1', keys: [{ address: ownerAddress, weight: '1' }] },
    ownerBalanceSun: '100000000', recipientExists: true, recipientType: 'Normal', transactionFeeSun: '1000', memoFeeSun: '0',
    pendingCount: '0', chainParametersSHA256: 'a'.repeat(64), resourcesSHA256: 'b'.repeat(64), configurationSHA256: 'c'.repeat(64) };
  return prepareOwnedTronNative({ binding, intent, snapshot, nowMs: head.timestampMs });
}

test('the original TRX preparation and unsigned wire survive actual Vault create, CAS update and reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tron-preparation-storage-'));
  try {
    const path = join(directory, 'original.vault'), password = 'synthetic-host-password', vault = new Vault(path), original = prepared();
    const created = await vault.create({ preparation: original, events: [] }, password);
    assert.deepEqual(validateOwnedTronPreparation(created.data.preparation), original);
    await vault.update(password, created.revision, data => ({ ...data, events: ['PREPARED'] }));
    const restored = (await new Vault(path).read(password)).data.preparation;
    assert.deepEqual(validateOwnedTronPreparation(restored), original);
    assert.equal(restored.unsignedWire, original.unsignedWire);
    assertPreparationCurrent(restored, original.snapshot, original.transaction.timestampMs);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('canonical key order changes preserve content joins, but snapshot, permission, funds and transaction substitution still reject', () => {
  const original = prepared(), canonicalized = JSON.parse(canonical(original));
  assert.deepEqual(validateOwnedTronPreparation(canonicalized), original);
  for (const change of [
    p => { p.snapshot.resourcesSHA256 = 'd'.repeat(64); },
    p => { p.snapshot.ownerBalanceSun = '100000001'; },
    p => { p.snapshot.ownerPermission.keys[0].address = p.transaction.recipientAddress; },
    p => { p.funds.observationCommitment = 'e'.repeat(64); },
    p => { p.funds.ownershipCommitment = 'e'.repeat(64); },
    p => { p.transaction.amountSun = '100001'; },
    p => { p.transaction.expirationMs = String(BigInt(p.transaction.expirationMs) + 1n); },
  ]) { const value = structuredClone(canonicalized); change(value); assert.throws(() => validateOwnedTronPreparation(value)); }
});
