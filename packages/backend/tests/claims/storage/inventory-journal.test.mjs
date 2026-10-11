/** Host-only storage audit. No previous observation is used as fresh evidence. */
import test from 'node:test';
import { legacyDataRoot } from '@lianum/environment';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
import { claimFrame, claimHash } from '../../../src/claims/authorization/permits.mjs';
import { claimEconomicInventory } from '../../../src/claims/operations/backing-audit.mjs';
import { appendClaimInventoryAudit, readClaimInventoryAudit } from '../../../src/claims/storage/inventory-journal.mjs';
import { createClaimVaultSession } from '../../../src/claims/storage/vault-session.mjs';
import { MEMO_PROGRAM, assertMemoProgramAccount } from '../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const copy = value => structuredClone(value);
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
function report(index = 0) {
  return [{ claimDomain: hash('domain'), inventory: { family: '1', nativeHead: { id: hash('native' + index), height: String(index) },
    signingUnresolved: false, escrow: { total: '100000000', utxos: Array.from({ length: 160 }, (_, i) => ({ txid: hash('coin' + i),
      vout: '0', script: '0014' + hash('escrow').slice(0, 40), amount: '1000000', confirmations: '110',
      spendable: true, solvable: true, safe: true, locked: false, coinbase: true })) }, feeAudit: { actualFees: '0', transfers: [] } } }];
}
const head = index => ({ number: String(index), hash: hash('evm' + index), timestamp: String(100 + index) });
test('snapshot references reproduce every full audit and the unchanged signed commitment', async () => {
  const data = { inventorySnapshots: {}, inventoryAudits: [], adverse: { [hash('old-native')]: 'ORIGINAL_NATIVE_FACT_CHANGED' } }, legacy = [];
  for (let i = 0; i < 25; i++) {
    const inventories = report(i), economicSnapshot = inventories.map(row => ({ claimDomain: row.claimDomain, inventory: claimEconomicInventory(row.inventory) }));
    const expected = claimHash(claimFrame('LIANUM/PAEG/native-claim-inventory/1', [Buffer.from(JSON.stringify(sorted(economicSnapshot)))]));
    assert.equal(appendClaimInventoryAudit(data, head(i), inventories), expected);
    legacy.push({ evmHead: head(i), inventoryCommitment: expected, economicSnapshot,
      nativeHeads: inventories.map(row => ({ claimDomain: row.claimDomain, nativeHead: row.inventory.nativeHead })) });
    assert.deepEqual(readClaimInventoryAudit(data, i), legacy[i]);
  }
  assert.equal(Object.keys(data.inventorySnapshots).length, 1); assert.equal(data.inventoryAudits.length, 25);
  assert.throws(() => canonical({ inventoryAudits: legacy }), /Canonical JSON exceeds byte limit/);
  assert.ok(Buffer.byteLength(canonical(data)) < 70000);
  const memo = await readFile(join(legacyDataRoot('engine'), '.local/test-programs/spl_memo-3.0.0.so'));
  const memoProgram = { address: MEMO_PROGRAM.address, owner: MEMO_PROGRAM.owner, executable: true, dataBase64: memo.toString('base64') };
  assertMemoProgramAccount(memoProgram);
  // Retain all four deposit/redemption/expired-deposit/refund program bodies,
  // plus 256 KiB for native terms, bindings, peer facts and signed permissions.
  data.nativePreparations = Array.from({ length: 4 }, (_, index) => ({ operationId: hash(index),
    prepared: { funds: { memoProgram: copy(memoProgram) } } }));
  data.otherRecordAllowance = 'x'.repeat(256 * 1024);
  const directory = await mkdtemp(join(tmpdir(), 'claim-inventory-journal-'));
  const vault = createClaimVaultSession({ path: join(directory, 'journal.vault'), password: 'host-only inventory audit password' });
  try {
    await vault.create(data);
    const next = copy(data), changed = report(25); changed[0].inventory.escrow.utxos[0].locked = true;
    appendClaimInventoryAudit(next, head(25), changed); await vault.update(0, () => next);
    const actual = (await vault.read()).data;
    assert.ok(Buffer.byteLength(canonical({ revision: 1, data: actual })) < 800000);
    assert.equal(Object.keys(actual.inventorySnapshots).length, 2); assert.equal(actual.inventoryAudits.length, 26);
    assert.deepEqual(actual.adverse, data.adverse);
    assert.deepEqual(actual.nativePreparations, data.nativePreparations);
    for (let i = 0; i < 25; i++) assert.deepEqual(readClaimInventoryAudit(actual, i), legacy[i]);
    assert.equal(readClaimInventoryAudit(actual, 25).economicSnapshot[0].inventory.escrow.utxos[0].locked, true);
  } finally { vault.close(); await rm(directory, { recursive: true, force: true }); }
});
test('changed funds or identities get new snapshots; mutation and missing references fail closed', () => {
  const data = { inventorySnapshots: {}, inventoryAudits: [] };
  const original = appendClaimInventoryAudit(data, head(0), report());
  for (const mutate of [value => { value.escrow.total = '1'; }, value => { value.escrow.utxos[0].confirmations = '111'; },
    value => { value.feeAudit.actualFees = '5000'; }, value => { value.signingUnresolved = true; },
    value => { value.escrow.utxos[0].txid = hash('other coin'); }]) {
    const inventories = report(1); mutate(inventories[0].inventory);
    assert.notEqual(appendClaimInventoryAudit(data, head(1), inventories), original);
  }
  const changed = copy(data); changed.inventorySnapshots[original][0].inventory.escrow.total = '2';
  assert.throws(() => appendClaimInventoryAudit(changed, head(2), report(2)), /SNAPSHOT_CHANGED/);
  assert.throws(() => readClaimInventoryAudit(changed, 0), /SNAPSHOT_COMMITMENT/);
  delete changed.inventorySnapshots[original]; assert.throws(() => readClaimInventoryAudit(changed, 0), /SNAPSHOT_MISSING/);
  assert.throws(() => readClaimInventoryAudit(data, -1), /AUDIT_INDEX/);
});
