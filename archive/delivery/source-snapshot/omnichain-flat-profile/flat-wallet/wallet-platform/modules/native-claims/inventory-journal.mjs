/** Every audit keeps its own EVM/native heads. Identical economic bodies are
 * stored once under the existing signed commitment. This never supplies an
 * observation or substitutes a previous audit for a current native read. */
import assert from 'node:assert/strict';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
import { cloneInput as copy } from '../paeg/readiness-inputs.mjs';
import { bytes32 } from '../paeg/commitments.mjs';
import { claimHash, claimFrame } from './permits.mjs';
import { claimEconomicInventory } from './backing-audit.mjs';

const commitment = value => claimHash(claimFrame('LIANUM/PAEG/native-claim-inventory/1', [Buffer.from(canonical(value))]));
export function appendClaimInventoryAudit(data, evmHead, inventories) {
  const economicSnapshot = inventories.map(row => ({ claimDomain: row.claimDomain, inventory: claimEconomicInventory(row.inventory) }));
  const inventoryCommitment = commitment(economicSnapshot);
  if (Object.hasOwn(data.inventorySnapshots, inventoryCommitment))
    assert.deepEqual(data.inventorySnapshots[inventoryCommitment], economicSnapshot, 'CLAIM_INVENTORY_SNAPSHOT_CHANGED');
  else data.inventorySnapshots[inventoryCommitment] = copy(economicSnapshot);
  data.inventoryAudits.push({ evmHead: copy(evmHead), inventoryCommitment,
    nativeHeads: inventories.map(row => ({ claimDomain: row.claimDomain, nativeHead: copy(row.inventory.nativeHead) })) });
  return inventoryCommitment;
}
/** Authenticated journal tooling can reconstruct each complete historical
 * audit without losing repeated heads, changed inventories or adverse history. */
export function readClaimInventoryAudit(data, index) {
  assert.ok(Number.isSafeInteger(index) && index >= 0 && index < data.inventoryAudits.length, 'CLAIM_INVENTORY_AUDIT_INDEX');
  const audit = data.inventoryAudits[index]; bytes32(audit.inventoryCommitment, true);
  assert.ok(Object.hasOwn(data.inventorySnapshots, audit.inventoryCommitment), 'CLAIM_INVENTORY_SNAPSHOT_MISSING');
  const economicSnapshot = data.inventorySnapshots[audit.inventoryCommitment];
  assert.equal(commitment(economicSnapshot), audit.inventoryCommitment, 'CLAIM_INVENTORY_SNAPSHOT_COMMITMENT');
  return copy({ ...audit, economicSnapshot });
}
