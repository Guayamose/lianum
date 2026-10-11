/** Durable account composition. This module alone owns durable keeper brands,
 * authenticated parent records, SOURCE session membership and wrapped lifetime
 * updates. The generic engine only owns coordinator execution/checkpoints. */
import {open} from 'node:fs/promises';
import {dirname} from 'node:path';
import {genericAccountIdentity, immutable, need, same, sha} from '@lianum/engine/accounts/journal';
import {keeperFields, keeperInput, startGenericAccountKeeper} from '@lianum/engine/accounts/coordinator-lifecycle';
import {createClaimRecordStore, openClaimRecordStore} from '@lianum/engine/storage/records';

const durableKeepers = new WeakMap();

export async function createDurableGenericAccountKeeperV1(input, lifetimeHandle = null) {
  return durableKeeper(input, {create: true, lifetimeHandle});
}
export async function reopenDurableGenericAccountKeeperV1(input, retained, lifetimeHandle = null) {
  keeperFields(retained, ['schema', 'config', 'journal', 'checkpoint', 'pendingCheckpoint', 'parentCheckpoint']);
  need(retained.schema === 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  same(input.config, retained.config, 'JOURNAL_ORIGINAL_CONFIG_CHANGED');
  same(input.journal, retained.journal, 'JOURNAL_ORIGINAL_CREDENTIALS_CHANGED');
  return durableKeeper(input, {create: false, retained, lifetimeHandle});
}
export async function captureDurableGenericAccountKeeperV1(keeper) {
  const state = durableKeepers.get(keeper);
  need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  return state.capture();
}
export async function bindOriginalNativeSourceSessionKeeperV1(keeper, session) {
  need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
  const state = durableKeepers.get(keeper);
  need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  return state.bindSource(session);
}
export async function readOriginalNativeSourceSessionKeeperV1(keeper, session) {
  need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
  const state = durableKeepers.get(keeper);
  need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  return state.readSource(session);
}
export async function readOriginalNativeSourceSessionKeeperCandidateV1(keeper, session) {
  need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
  const state = durableKeepers.get(keeper);
  need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  return state.readSourceCandidate(session);
}

async function durableKeeper(input, durable) {
  const {config, journal, authority} = keeperInput(input);
  const identity = genericAccountIdentity(config);
  const settings = {path: journal.path + '.private-parent-v1', password: journal.password,
    identity: {profile: 'WRAPPED_GRAPH_PARENT_CHECKPOINT_V1', identity}};
  const parentStore = durable.create
    ? await createClaimRecordStore(settings, {checkpoint: null, pendingCheckpoint: null})
    : await openClaimRecordStore(settings);
  let parentRecord, sourceSession = null, keeper, control;
  try {
    parentRecord = await parentStore.read();
    if (!durable.create) {
      same({revision: parentRecord.revision, commitment: parentRecord.commitment}, durable.retained.parentCheckpoint, 'JOURNAL_PARENT_CHECKPOINT_CHANGED');
      same(parentRecord.data, {checkpoint: durable.retained.checkpoint, pendingCheckpoint: durable.retained.pendingCheckpoint}, 'JOURNAL_PARENT_CHECKPOINT_CHANGED');
      // Original one-use admission survives failed startup and descriptor copies.
      const marker = settings.path + '.reopen-' + parentRecord.commitment + '.claimed';
      const claim = await open(marker, 'wx', 0o600);
      try {await claim.writeFile(JSON.stringify({profile: 'WRAPPED_GRAPH_PARENT_REOPEN_V1', commitment: parentRecord.commitment}) + '\n'); await claim.sync();}
      finally {await claim.close();}
      const directory = await open(dirname(marker), 'r');
      try {await directory.sync();} finally {await directory.close();}
    }
    const persistence = {
      opening: {create: durable.create, ...immutable(parentRecord.data)},
      async retain({checkpoint, pendingCheckpoint}) {
        if (sourceSession) {
          const source = await import('../../api/accounts/flat-manual-graph-session.mjs');
          await source.prepareOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession, keeper);
        }
        const next = await parentStore.update(parentRecord.revision, () => ({checkpoint, pendingCheckpoint}));
        const actual = await parentStore.read();
        same(actual, next, 'JOURNAL_PARENT_READBACK');
        parentRecord = actual;
        if (sourceSession) {
          const source = await import('../../api/accounts/flat-manual-graph-session.mjs');
          await source.confirmOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession, keeper);
        }
        if (durable.lifetimeHandle) {
          const {updateWrappedPrivateLifetimePartV1} = await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
          await updateWrappedPrivateLifetimePartV1(durable.lifetimeHandle, {config, journal: {...journal}, checkpoint, pendingCheckpoint,
            parentCheckpoint: {revision: actual.revision, commitment: actual.commitment}});
        }
      },
      close() {journal.password = null; parentStore.close();},
    };
    ({keeper, control} = await startGenericAccountKeeper({config, journal, authority}, {}, persistence));
  } catch (error) {journal.password = null; parentStore.close(); throw error;}

  async function sourceSnapshot() {
    control.readCheckpoints(); // Reject unavailable ownership before touching storage.
    const actual = await parentStore.read();
    same(actual, parentRecord, 'JOURNAL_PARENT_READBACK');
    const checkpoints = control.readCheckpoints();
    return immutable({keeper: {schema: 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', config, journal: {...journal}, ...checkpoints,
      parentCheckpoint: {revision: actual.revision, commitment: actual.commitment}},
    ownedProcesses: [await control.readCoordinator()]});
  }
  durableKeepers.set(keeper, {
    async bindSource(session) {
      need(!sourceSession, 'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
      control.assertIdle();
      const source = await import('../../api/accounts/flat-manual-graph-session.mjs');
      source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
      sourceSession = session;
      return sourceSnapshot();
    },
    async readSource(session) {
      need(!sourceSession || sourceSession === session, 'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
      const source = await import('../../api/accounts/flat-manual-graph-session.mjs');
      source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
      return sourceSnapshot();
    },
    async readSourceCandidate(session) {
      need(sourceSession === session, 'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
      control.assertBusy();
      const source = await import('../../api/accounts/flat-manual-graph-session.mjs');
      source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
      const actual = await parentStore.read();
      same(actual, parentRecord, 'JOURNAL_PARENT_READBACK');
      return immutable({revision: parentRecord.revision + 1, stateSHA256: sha(control.readCheckpoints())});
    },
    async capture() {
      need(sourceSession === null, 'JOURNAL_SOURCE_LEGACY_CAPTURE_DENIED');
      return control.capture(async checkpoints => {
        const current = await parentStore.read();
        same(current, parentRecord, 'JOURNAL_PARENT_READBACK');
        return {schema: 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', config, journal: {...journal}, ...checkpoints,
          parentCheckpoint: {revision: current.revision, commitment: current.commitment}};
      });
    },
  });
  return keeper;
}
