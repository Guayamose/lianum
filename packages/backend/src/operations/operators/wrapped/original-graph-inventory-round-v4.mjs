import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';

/** @typedef {import('../native-value/original-inventory-round-v4.mjs').InventoryState} InventoryState */
/** @typedef {import('../native-value/original-inventory-round-v4.mjs').InventoryRecord} InventoryRecord */
/** @typedef {import('../native-value/original-inventory-round-v4.mjs').Observation} Observation */
/** @typedef {import('../native-value/original-inventory-round-v4.mjs').Blocker} Blocker */
/** @typedef {import('../native-value/original-inventory-round-v4.mjs').InventoryPorts} NativePorts */
/** @typedef {{bound:{binding:object,resources:import('../native-value/original-inventory-round-v4.mjs').Resources},
 * record:InventoryRecord,active:{view:{head:{timestamp:string,[field:string]:unknown}},quiet?:{release():void}|null}}} GraphInventoryScope */
/** @typedef {{copy:NativePorts['copy'],freeze:NativePorts['freeze'],equal:NativePorts['equal'],
 * exactRecord:NativePorts['exactRecord'],inputUint:NativePorts['inputUint'],
 * validateNativeValueOperatorInventory:(state:InventoryState,binding:object)=>InventoryState,
 * nativeValueWatermark:NativePorts['nativeValueWatermark'],MAX_CERTIFICATES_PER_ORIGINAL:number,
 * owned:()=>void,poison:()=>void,current:()=>Promise<void>,observe:NativePorts['observe']}} GraphInventoryPorts */

/** Whole wrapped graph journal and inventory audit. The original operator
 * supplies fixed checks and private scope getters; custody, membership and
 * coverage tickets stay in that operator. Wrapped writes always commit and
 * release native quiescence before a write, retaining their original semantics.
 * @param {GraphInventoryScope} scope @param {GraphInventoryPorts} ports */
export function createOriginalGraphInventoryRoundV4(scope, ports) {
  const {copy,freeze,equal,exactRecord,inputUint,validateNativeValueOperatorInventory,
    nativeValueWatermark,MAX_CERTIFICATES_PER_ORIGINAL,owned,poison,current,observe} = ports;
  async function unchanged() {
    try { equal(await scope.bound.resources.store.load(), scope.record); }
    catch (cause) { poison(); throw new Error('NATIVE_VALUE_JOURNAL_UNAVAILABLE_OR_CHANGED', { cause }); }
  }
  /** @param {InventoryState} next */
  async function save(next) {
    scope.active?.quiet?.release();
    try {
      owned(); await unchanged(); const state = validateNativeValueOperatorInventory(next, scope.bound.binding);
      const result = await scope.bound.resources.store.commit(freeze({ expectedRevision: scope.record.revision, nextState: copy(state) }));
      exactRecord(result, ['revision', 'state']); assert.equal(inputUint(result.revision), BigInt(scope.record.revision) + 1n); equal(result.state, state);
      equal(await scope.bound.resources.store.load(), result); scope.record = copy(result);
    } catch (cause) { poison(); throw new Error('NATIVE_VALUE_DURABLE_WRITE_UNCERTAIN', { cause }); }
  }
  /** @param {string | null} allowedPending */
  async function auditAll(allowedPending = null) {
    await current(); await unchanged(); const next = copy(scope.record.state);
    /** @type {Blocker[]} */
    const blockers = [];
    const observations = [];
    next.lastClock = scope.active.view.head.timestamp;
    for (let i = 0; i < next.inventories.length; i++) {
      const inventory = next.inventories[i], finality = new Map();
      if (inventory.entries.length >= 64) blockers.push({ profileCommitment: inventory.profileCommitment, reason: 'NATIVE_VALUE_INVENTORY_SATURATED' });
      for (const entry of inventory.entries) {
        // Deliberately includes expired, unadmitted, unsigned and adverse rows.
        const result = await observe(i, entry.original.nativeId, entry);
        observations.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId,
          attempted: true, nativeObservationReturned: result.observed, authenticatedNativeReadCount: result.nativeReadCount, sourceStatus: result.sourceStatus, priorAdverse: entry.status === 'adverse' });
        if (entry.status !== 'adverse') { entry.status = result.status; entry.reason = result.reason; }
        entry.lastCheckedAt = scope.active.view.head.timestamp;
        if (result.status === 'live') {
          entry.watermark = nativeValueWatermark(result.original.facts);
          const height = entry.watermark.blockHeight, prior = finality.get(height);
          if (prior && prior !== entry.watermark.blockId) { entry.status = 'adverse'; entry.reason = 'NATIVE_VALUE_PROFILE_FINALITY_DISAGREEMENT'; }
          finality.set(height, entry.watermark.blockId);
        }
        if (entry.status !== 'live') blockers.push({ profileCommitment: inventory.profileCommitment, nativeId: entry.original.nativeId, nativeGid: entry.original.facts.nativeGid, status: entry.status, reason: entry.reason });
        if (entry.pending && entry.pending.digest !== allowedPending) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_UNFINISHED_SIGNING_INTENT' });
        if (entry.history.length >= MAX_CERTIFICATES_PER_ORIGINAL) blockers.push({ profileCommitment: inventory.profileCommitment,
          nativeId: entry.original.nativeId, reason: 'NATIVE_VALUE_SIGNED_HISTORY_SATURATED' });
      }
    }
    for (const authorization of next.authorizations)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_HEALTH_INTENT' });
    if (next.authorizations.length >= 256) blockers.push({ reason: 'NATIVE_VALUE_HEALTH_HISTORY_SATURATED' });
    for (const authorization of next.checkpoints)
      if (authorization.signature === null && authorization.digest !== allowedPending)
        blockers.push({ reason: 'NATIVE_VALUE_UNFINISHED_CHECKPOINT_INTENT' });

    if (!isDeepStrictEqual(next, scope.record.state)) await save(next);
    await current(); await unchanged();
    return freeze({ head: copy(scope.active.view.head), inventoryCount: String(observations.length), observations, blockers });
  }

  return Object.freeze({unchanged,save,audit:auditAll});
}
