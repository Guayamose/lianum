/** Encrypted controller journal plus a surviving in-process checkpoint keeper.
 * Controller close/reopen is supported. Keeper loss and native node/key restart
 * are deliberately not presented as recoverable custody. */
import assert from 'node:assert/strict';
import { createClaimVaultSession } from './vault-session.mjs';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
import { createHash } from 'node:crypto';
import { exactRecord } from '../paeg/commitments.mjs';
import { assertOwnedNativeClaimSystem } from '../ops/deploy-native-claims.mjs';
import { startClaimRecordStoreProcess } from './record-store-process.mjs';
const keepers = new WeakMap();
const copy = v => structuredClone(v);
const digest = v => createHash('sha256').update(canonical(v)).digest('hex');
export async function createNativeClaimControllerKeeper(input) {
  exactRecord(input, ['runtime', 'claims', 'path', 'password']);
  assertOwnedNativeClaimSystem(input.runtime, input.claims);
  assert.ok(typeof input.password === 'string' && input.password.length >= 32, 'CLAIM_KEEPER_PASSWORD');
  const vault = createClaimVaultSession({ path: input.path, password: input.password });
  let record;
  try { record = await vault.create({ profile: 'OWNED_NATIVE_CLAIM_CONTROLLER_V2', deposits: [], tickets: [], evm: [] }); }
  catch (error) { vault.close(); throw error; }
  let checkpoint = digest(record), fault = false, leased = false, closed = false;
  async function read() {
    assert.ok(!closed && !fault, 'CLAIM_KEEPER_CLOSED_OR_UNCERTAIN');
    try { const actual = await vault.read(); assert.equal(digest(actual), checkpoint, 'CLAIM_KEEPER_ROLLBACK_OR_REPLACEMENT');
      assert.deepEqual(actual, record, 'CLAIM_KEEPER_READBACK_CHANGED'); return copy(record.data); }
    catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_READ_UNCERTAIN', { cause }); }
  }
  const state = { runtime: input.runtime, claims: input.claims, read,
    async update(transform) {
      await read();
      try {
        const next = await vault.update(record.revision, data => transform(copy(data)));
        const actual = await vault.read(); assert.deepEqual(actual, next, 'CLAIM_KEEPER_WRITE_READBACK');
        // Both readback and the surviving checkpoint ACK precede any effect.
        record = next; checkpoint = digest(next); return copy(record.data);
      } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_WRITE_UNCERTAIN', { cause }); }
    },
    acquire() { assert.ok(!closed && !fault && !leased, 'CLAIM_KEEPER_EXCLUSIVE_CONTROLLER'); leased = true; },
    release() { assert.ok(leased); leased = false; },
  };
  const keeper = Object.freeze({ status: () => Object.freeze({ closed, controllerOpen: leased, uncertain: fault,
    controllerRestart: true, keeperRestart: false, nativeNodeRestart: false }),
    close() { assert.ok(!leased, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN'); closed = true; vault.close(); } });
  keepers.set(keeper, state); await read(); return keeper;
}

/** V3 keeper: a dedicated fixed child owns the encrypted record store and its
 * checkpoint. Chain authorities and operator signing keys remain in the owned
 * bootstrap. Reopening always fences effects until those authorities reconcile
 * every retained original operation. V2 journals require an explicit migration;
 * this factory never adopts one silently. */
async function durableKeeper(input, mode) {
  exactRecord(input, ['runtime', 'claims', 'path', 'password']);
  const { runtime, claims, path } = input;
  assertOwnedNativeClaimSystem(runtime, claims);
  assert.ok(typeof input.password === 'string' && input.password.length >= 32, 'CLAIM_KEEPER_PASSWORD');
  let password = input.password;
  const identity = {
    profile: 'OWNED_NATIVE_CLAIM_CONTROLLER_V3',
    evmGenesis: runtime.metadata.evmGenesis,
    chainId: runtime.metadata.chainId,
    configurations: copy(claims.configs),
    verifierPins: copy(claims.verifierPins),
    registry: copy(claims.flatSystem.registry),
    nativeRoles: claims.nativeRuntimes.map(native => copy(native.roles)),
  };
  let worker, recovery, closePromise, fault = false, closed = false, leased = false, changing = false;
  let reconciliationRequired = mode === 'open';
  async function launch(nextMode) {
    worker = await startClaimRecordStoreProcess({ mode: nextMode, options: { path, password, identity },
      ...(nextMode === 'create' ? { initialData: {
        profile: identity.profile, deposits: [], tickets: [], evm: [], apiAccounts: [], apiAdmissions: [],
      } } : {}) });
    recovery = await worker.recovery();
  }
  await launch(mode);
  function live() {
    assert.ok(!closed && !fault && !changing && worker.status().available, 'CLAIM_KEEPER_CLOSED_OR_UNCERTAIN');
    assertOwnedNativeClaimSystem(runtime, claims);
  }
  async function record() {
    live();
    try {
      const result = await worker.read();
      assert.equal(result.data.profile, identity.profile, 'CLAIM_KEEPER_SCHEMA');
      for (const name of ['deposits', 'tickets', 'evm', 'apiAccounts', 'apiAdmissions'])
        assert.ok(Array.isArray(result.data[name]), 'CLAIM_KEEPER_COLLECTION');
      return result;
    } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_READ_UNCERTAIN', { cause }); }
  }
  const state = {
    runtime, claims,
    read: async () => copy((await record()).data),
    async update(transform) {
      const previous = await record();
      try {
        const data = transform(copy(previous.data));
        assert.ok(data && typeof data.then !== 'function', 'CLAIM_KEEPER_SYNCHRONOUS_TRANSFORM');
        const next = await worker.update(previous.revision, data);
        assert.equal(next.revision, previous.revision + 1, 'CLAIM_KEEPER_REVISION');
        return copy(next.data);
      } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_WRITE_UNCERTAIN', { cause }); }
    },
    acquire() { live(); assert.ok(!leased, 'CLAIM_KEEPER_EXCLUSIVE_CONTROLLER'); leased = true; },
    release() { assert.ok(leased); leased = false; },
    requiresReconciliation: () => reconciliationRequired,
    acknowledgeReconciliation() { live(); assert.ok(leased); reconciliationRequired = false; },
  };
  const keeper = Object.freeze({
    status: () => Object.freeze({ closed, controllerOpen: leased, uncertain: fault || !closed && !worker.status().available,
      controllerRestart: true, keeperRestart: true, keeperProcessId: worker.status().processId,
      keeperProcessExited: worker.status().exited,
      requiresExternalEffectReconciliation: reconciliationRequired, nativeNodeRestart: false,
      operatorKeyRestart: false, storageRecovery: copy(recovery) }),
    async restart() {
      assert.ok(!leased && !closed && !changing, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN');
      changing = true; reconciliationRequired = true;
      try {
        await worker.close();
        await launch('open'); fault = false;
      } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_REOPEN_UNCERTAIN', { cause }); }
      finally { changing = false; }
      return keeper.status();
    },
    async close() {
      assert.ok(!leased && !changing, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN');
      if (!closed) { closed = true; password = undefined; closePromise = worker.close(); }
      return closePromise;
    },
  });
  keepers.set(keeper, state);
  try { await record(); } catch (error) { await keeper.close(); throw error; }
  return keeper;
}
export function createDurableNativeClaimControllerKeeper(input) { return durableKeeper(input, 'create'); }
export function openDurableNativeClaimControllerKeeper(input) { return durableKeeper(input, 'open'); }
/** Private bootstrap accessor. Data-shaped journal/keeper substitutes fail. */
export function ownedClaimControllerJournal(keeper, runtime, claims) {
  const state = keepers.get(keeper); assert.ok(state && state.runtime === runtime && state.claims === claims, 'CLAIM_OWNED_KEEPER_REQUIRED');
  assertOwnedNativeClaimSystem(runtime, claims); return state;
}
