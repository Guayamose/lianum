/** Encrypted controller journal plus a surviving in-process checkpoint keeper.
 * Controller close/reopen is supported. Keeper loss and native node/key restart
 * are deliberately not presented as recoverable custody. */
import assert from 'node:assert/strict';
import {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,updateWrappedPrivateLifetimePartV1} from '../recovery/wrapped-private-lifetime-registry-v1.mjs';
import { createClaimVaultSession } from '../../storage/vault-session.mjs';
import { canonical } from '../../../../../engine/src/crypto/privacy.mjs';
import { createHash } from 'node:crypto';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { assertOwnedWrappedClaimSystem } from '../../../operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { startClaimRecordStoreProcess } from '../../storage/record-store-process.mjs';
import { retainOriginalWrappedRecoverySectionV1, consumeOriginalWrappedRecoverySectionV1 } from '../recovery/wrapped-recovery-authority-v1.mjs';
const keepers = new WeakMap();
const copy = v => structuredClone(v);
const digest = v => createHash('sha256').update(canonical(v)).digest('hex');
export async function createNativeClaimControllerKeeper(input) {
  exactRecord(input, ['runtime', 'claims', 'path', 'password']);
  assertOwnedWrappedClaimSystem(input.runtime, input.claims);
  assert.ok(typeof input.password === 'string' && input.password.length >= 32, 'CLAIM_KEEPER_PASSWORD');
  const vault = createClaimVaultSession({ path: input.path, password: input.password });
  let record;
  try { record = await vault.create({ profile: 'OWNED_WRAPPED_NATIVE_CLAIM_CONTROLLER_MEMORY_V1', deposits: [], tickets: [], evm: [] }); }
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
  assertOwnedWrappedClaimSystem(runtime, claims);
  assert.ok(typeof input.password === 'string' && input.password.length >= 32, 'CLAIM_KEEPER_PASSWORD');
  let password = input.password;
  const identity = {
    profile: 'OWNED_WRAPPED_NATIVE_CLAIM_CONTROLLER_V1',
    evmGenesis: runtime.metadata.evmGenesis,
    chainId: runtime.metadata.chainId,
    configurations: copy(claims.configs),
    verifierPins: copy(claims.verifierPins),
    registry: copy(claims.flatSystem.registry),
    nativeRoles: claims.nativeRuntimes.map(native => copy(native.roles)),
  };
  let lifetimeHandle,lifetimeState={path,password,checkpoint:null,pendingUpdate:null};
  if(mode==='create')lifetimeHandle=await retainWrappedPrivateLifetimePartV1(runtime,'claim-keeper',identity,lifetimeState);
  else{const retained=await readWrappedPrivateLifetimePartV1(runtime,'claim-keeper',identity);assert.equal(retained.privateState.path,path);assert.ok(retained.privateState.password===password,'CLAIM_KEEPER_ORIGINAL_CREDENTIAL_CHANGED');assert.equal(retained.privateState.pendingUpdate,null,'CLAIM_KEEPER_PENDING_CHECKPOINT_RECONCILIATION_REQUIRED');lifetimeHandle=retained.handle;lifetimeState=retained.privateState;}
  async function retainLifetime(next){await updateWrappedPrivateLifetimePartV1(lifetimeHandle,next);lifetimeState=copy(next);}
  let worker, recovery, closePromise, fault = false, closed = false, leased = false, changing = false, capturing = false;
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
    assert.ok(!closed && !fault && !changing && !capturing && worker.status().available, 'CLAIM_KEEPER_CLOSED_OR_UNCERTAIN');
    assertOwnedWrappedClaimSystem(runtime, claims);
  }
  async function record() {
    live();
    return readOriginalRecord();
  }
  async function readOriginalRecord() {
    try {
      const result = await worker.read();
      assert.equal(result.data.profile, identity.profile, 'CLAIM_KEEPER_SCHEMA');
      for (const name of ['deposits', 'tickets', 'evm', 'apiAccounts', 'apiAdmissions'])
        assert.ok(Array.isArray(result.data[name]), 'CLAIM_KEEPER_COLLECTION');
      const current={revision:result.revision,commitment:result.commitment};
      if(lifetimeState.checkpoint===null)await retainLifetime({...lifetimeState,checkpoint:current});else assert.deepEqual(current,lifetimeState.checkpoint,'CLAIM_KEEPER_LIFETIME_CHECKPOINT_CHANGED');
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
        await retainLifetime({...lifetimeState,pendingUpdate:{revision:previous.revision+1,dataSHA256:digest(data)}});
        const next = await worker.update(previous.revision, data);
        assert.equal(next.revision, previous.revision + 1, 'CLAIM_KEEPER_REVISION');
        assert.deepEqual(await worker.read(),next,'CLAIM_KEEPER_WRITE_READBACK');
        await retainLifetime({...lifetimeState,checkpoint:{revision:next.revision,commitment:next.commitment},pendingUpdate:null});
        return copy(next.data);
      } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_WRITE_UNCERTAIN', { cause }); }
    },
    acquire() { live(); assert.ok(!leased, 'CLAIM_KEEPER_EXCLUSIVE_CONTROLLER'); leased = true; },
    release() { assert.ok(leased); leased = false; },
    requiresReconciliation: () => reconciliationRequired,
    acknowledgeReconciliation() { live(); assert.ok(leased); reconciliationRequired = false; },
    async recoveryCapture() {
      live(); assert.ok(!leased, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN');
      // Fence acquisition, restart and mutation before the first awaited read.
      // A failed capture stays fenced; it never authorizes a fresh controller.
      capturing = true;
      const current = await readOriginalRecord();
      return { schema: 'ORIGINAL_WRAPPED_KEEPER_REOPEN_V1', path, password,
        identity: copy(identity), checkpoint: { revision: current.revision, commitment: current.commitment },
        originalWorkerProcessId: worker.status().processId };
    },
    async stopCaptured() {
      assert.ok(capturing && !leased && !changing && !closed, 'CLAIM_KEEPER_ORIGINAL_CAPTURE_REQUIRED');
      closed = true; password = undefined; closePromise = worker.close();
      return closePromise;
    },
    async stopCaptureAfterFailure() {
      if (!capturing) return null;
      if (closed) return closePromise;
      return state.stopCaptured();
    },
    async verifyReopenedCapture(retained) {
      live(); assert.ok(!leased && reconciliationRequired, 'CLAIM_KEEPER_REOPEN_RECONCILIATION_FENCE');
      assert.deepEqual(identity, retained.identity, 'CLAIM_KEEPER_ORIGINAL_REOPEN_IDENTITY');
      const current = await record();
      assert.deepEqual({ revision: current.revision, commitment: current.commitment }, retained.checkpoint,
        'CLAIM_KEEPER_ORIGINAL_REOPEN_RECORD');
      assert.equal(recovery.openedFromDisk, true);
      assert.notEqual(worker.status().processId, retained.originalWorkerProcessId,
        'CLAIM_KEEPER_REOPEN_REQUIRES_NEW_CHILD');
    },
  };
  const keeper = Object.freeze({
    status: () => Object.freeze({ closed, controllerOpen: leased, uncertain: fault || !closed && !worker.status().available,
      controllerRestart: true, keeperRestart: true, keeperProcessId: worker.status().processId,
      keeperProcessExited: worker.status().exited,
      requiresExternalEffectReconciliation: reconciliationRequired, nativeNodeRestart: false,
      operatorKeyRestart: false, storageRecovery: copy(recovery) }),
    async restart() {
      assert.ok(!leased && !closed && !changing && !capturing, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN');
      changing = true; reconciliationRequired = true;
      try {
        await worker.close();
        await launch('open'); fault = false;
      } catch (cause) { fault = true; throw new Error('CLAIM_KEEPER_REOPEN_UNCERTAIN', { cause }); }
      finally { changing = false; }
      return keeper.status();
    },
    async close() {
      if (closed) return closePromise;
      assert.ok(!leased && !changing && !capturing, 'CLAIM_KEEPER_CONTROLLER_STILL_OPEN');
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
/** Fixed private fixture boundary. Capture commits the original credential and
 * exact encrypted record checkpoint before the original child is stopped. */
export async function retainWrappedKeeperForReopenV1(keeper, attemptAuthority) {
  assert.equal(arguments.length, 2);
  const state = keepers.get(keeper);
  assert.ok(state?.recoveryCapture, 'CLAIM_ORIGINAL_DURABLE_KEEPER_REQUIRED');
  try {
    const retained = await state.recoveryCapture();
    await retainOriginalWrappedRecoverySectionV1(attemptAuthority, 'keeper', retained);
  }
  catch (error) {
    // Storage failure cannot leave a child alive or turn this into a completed
    // capture. The unchanged encrypted journal is never deleted.
    try { await state.stopCaptureAfterFailure(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'CLAIM_KEEPER_RETENTION_AND_STOP_FAILED', { cause: error }); }
    throw error;
  }
  const terminal = await state.stopCaptured();
  assert.equal(keeper.status().keeperProcessExited, true, 'CLAIM_KEEPER_ORIGINAL_STOP_REQUIRED');
  assert.ok(terminal && (terminal.code === 0 || terminal.signal === 'SIGTERM'), 'CLAIM_KEEPER_ORIGINAL_STOP_UNCERTAIN');
  assert.notEqual(terminal.signal, 'SIGKILL');
  return { retained: true, originalResourcesStopped: true };
}
export async function reopenWrappedKeeperFromAuthorityV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'claims', 'attemptAuthority']);
  const retained = consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority, 'keeper');
  exactRecord(retained, ['schema', 'path', 'password', 'identity', 'checkpoint', 'originalWorkerProcessId']);
  assert.equal(retained.schema, 'ORIGINAL_WRAPPED_KEEPER_REOPEN_V1');
  const keeper = await openDurableNativeClaimControllerKeeper({ runtime: input.runtime, claims: input.claims,
    path: retained.path, password: retained.password });
  try { await keepers.get(keeper).verifyReopenedCapture(retained); return keeper; }
  catch (error) { await keeper.close(); throw error; }
}
/** Private bootstrap accessor. Data-shaped journal/keeper substitutes fail. */
export function ownedClaimControllerJournal(keeper, runtime, claims) {
  const state = keepers.get(keeper); assert.ok(state && state.runtime === runtime && state.claims === claims, 'CLAIM_OWNED_KEEPER_REQUIRED');
  assertOwnedWrappedClaimSystem(runtime, claims); return state;
}
