/** Durable keeper implementation. Parent storage, coordinator ownership and
 * SOURCE/lifetime ports stay fixed within each private family. Builders never
 * receive the canonical family or its mutable keeper registry. */
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { exactRecord } from '@lianum/components/encoding/commitments';
/** @typedef {{path:string,password:string|null}} Journal
 * @typedef {{config:unknown,journal:Journal,authority:unknown}} KeeperInput
 * @typedef {{checkpoint:unknown,pendingCheckpoint:unknown}} Checkpoints
 * @typedef {{revision:number,commitment:string,data:Checkpoints}} ParentRecord
 * @typedef {{path:string,password:string|null,identity:unknown}} StoreSettings
 * @typedef {{read():Promise<ParentRecord>,update(revision:number,transform:()=>Checkpoints):Promise<ParentRecord>,close():void}} ParentStore
 * @typedef {{schema:string,config:unknown,journal:Journal,checkpoint:unknown,pendingCheckpoint:unknown,parentCheckpoint:{revision:number,commitment:string}}} RetainedKeeper
 * @typedef {{readCheckpoints():Checkpoints,assertIdle():void,assertBusy():void,readCoordinator():Promise<object>,capture(read:(checkpoints:Checkpoints)=>Promise<RetainedKeeper>):Promise<RetainedKeeper>}} Control
 * @typedef {{opening:Checkpoints&{create:boolean},retain(checkpoints:Checkpoints):Promise<void>,close():void}} Persistence
 * @typedef {{bindSource(session:object):Promise<unknown>,readSource(session:object):Promise<unknown>,readSourceCandidate(session:object):Promise<unknown>,capture():Promise<RetainedKeeper>}} DurableState
 * @typedef {{genericAccountIdentity(config:unknown):unknown,immutable<T>(value:T):T,need(condition:unknown,code:string):asserts condition,same(a:unknown,b:unknown,code:string):void,sha(value:unknown):string,
 * keeperFields(value:unknown,fields:string[]):void,keeperInput(input:unknown):KeeperInput,
 * startGenericAccountKeeper(input:KeeperInput,options:object,persistence:Persistence):Promise<{keeper:object,control:Control}>,
 * createClaimRecordStore(settings:StoreSettings,initial:Checkpoints):Promise<ParentStore>,openClaimRecordStore(settings:StoreSettings):Promise<ParentStore>}} Dependencies
 * @typedef {{assertOriginalNativeSessionSourceKeeperV1(session:object,keeper:object):void,prepareOriginalNativeSessionKeeperSourceCheckpointV1(session:object,keeper:object):Promise<unknown>,confirmOriginalNativeSessionKeeperSourceCheckpointV1(session:object,keeper:object):Promise<unknown>}} Source
 * @typedef {{source():Promise<Source>,lifetime():Promise<{updateWrappedPrivateLifetimePartV1(handle:object,data:Omit<RetainedKeeper,'schema'>):Promise<unknown>}>}} Loaders
 */
/** @param {{dependencies:Dependencies,load:Loaders}} contracts */
export function buildDurableGenericAccountKeeperV1(contracts) {
    exactRecord(contracts, ['dependencies', 'load']);
    const { dependencies, load } = contracts;
    exactRecord(dependencies, ['genericAccountIdentity', 'immutable', 'need', 'same', 'sha', 'keeperFields', 'keeperInput', 'startGenericAccountKeeper', 'createClaimRecordStore', 'openClaimRecordStore']);
    exactRecord(load, ['source', 'lifetime']);
    for (const contract of [dependencies, load])
        for (const method of Object.values(contract))
            if (typeof method !== 'function')
                throw new TypeError('JOURNAL_DURABLE_FIXED_CONTRACT');
    const { genericAccountIdentity, immutable, same, sha, keeperFields, keeperInput, startGenericAccountKeeper, createClaimRecordStore, openClaimRecordStore } = dependencies;
    /** @type {Dependencies['need']} */ const need = dependencies.need;
    /** @type {WeakMap<object,DurableState>} */
    const durableKeepers = new WeakMap();
    /** @param {KeeperInput} input @param {object|null} [lifetimeHandle] */
    async function createDurableGenericAccountKeeperV1(input, lifetimeHandle = null) {
        return durableKeeper(input, { create: true, lifetimeHandle });
    }
    /** @param {KeeperInput} input @param {RetainedKeeper} retained @param {object|null} [lifetimeHandle] */
    async function reopenDurableGenericAccountKeeperV1(input, retained, lifetimeHandle = null) {
        keeperFields(retained, ['schema', 'config', 'journal', 'checkpoint', 'pendingCheckpoint', 'parentCheckpoint']);
        need(retained.schema === 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
        same(input.config, retained.config, 'JOURNAL_ORIGINAL_CONFIG_CHANGED');
        same(input.journal, retained.journal, 'JOURNAL_ORIGINAL_CREDENTIALS_CHANGED');
        return durableKeeper(input, { create: false, retained, lifetimeHandle });
    }
    /** @param {object} keeper */
    async function captureDurableGenericAccountKeeperV1(keeper) {
        const state = durableKeepers.get(keeper);
        need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
        return state.capture();
    }
    /** @param {object} keeper @param {object} session */
    async function bindOriginalNativeSourceSessionKeeperV1(keeper, session) {
        need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
        const state = durableKeepers.get(keeper);
        need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
        return state.bindSource(session);
    }
    /** @param {object} keeper @param {object} session */
    async function readOriginalNativeSourceSessionKeeperV1(keeper, session) {
        need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
        const state = durableKeepers.get(keeper);
        need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
        return state.readSource(session);
    }
    /** @param {object} keeper @param {object} session */
    async function readOriginalNativeSourceSessionKeeperCandidateV1(keeper, session) {
        need(arguments.length === 2, 'JOURNAL_SOURCE_ARGUMENTS');
        const state = durableKeepers.get(keeper);
        need(state, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
        return state.readSourceCandidate(session);
    }
    /** @param {KeeperInput} input @param {{create:boolean,retained?:RetainedKeeper,lifetimeHandle:object|null}} durable */
    async function durableKeeper(input, durable) {
        const { config, journal, authority } = keeperInput(input);
        const identity = genericAccountIdentity(config);
        const settings = { path: journal.path + '.private-parent-v1', password: journal.password,
            identity: { profile: 'WRAPPED_GRAPH_PARENT_CHECKPOINT_V1', identity } };
        const parentStore = durable.create
            ? await createClaimRecordStore(settings, { checkpoint: null, pendingCheckpoint: null })
            : await openClaimRecordStore(settings);
        /** @type {ParentRecord} */ let parentRecord;
        /** @type {object|null} */ let sourceSession = null;
        /** @type {object} */ let keeper;
        /** @type {Control} */ let control;
        try {
            parentRecord = await parentStore.read();
            if (!durable.create) {
                need(durable.retained, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
                same({ revision: parentRecord.revision, commitment: parentRecord.commitment }, durable.retained.parentCheckpoint, 'JOURNAL_PARENT_CHECKPOINT_CHANGED');
                same(parentRecord.data, { checkpoint: durable.retained.checkpoint, pendingCheckpoint: durable.retained.pendingCheckpoint }, 'JOURNAL_PARENT_CHECKPOINT_CHANGED');
                // Original one-use admission survives failed startup and descriptor copies.
                const marker = settings.path + '.reopen-' + parentRecord.commitment + '.claimed';
                const claim = await open(marker, 'wx', 0o600);
                try {
                    await claim.writeFile(JSON.stringify({ profile: 'WRAPPED_GRAPH_PARENT_REOPEN_V1', commitment: parentRecord.commitment }) + '\n');
                    await claim.sync();
                }
                finally {
                    await claim.close();
                }
                const directory = await open(dirname(marker), 'r');
                try {
                    await directory.sync();
                }
                finally {
                    await directory.close();
                }
            }
            /** @type {Persistence} */
            const persistence = {
                opening: { create: durable.create, ...immutable(parentRecord.data) },
                async retain({ checkpoint, pendingCheckpoint }) {
                    if (sourceSession) {
                        const source = await load.source();
                        await source.prepareOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession, keeper);
                    }
                    const next = await parentStore.update(parentRecord.revision, () => ({ checkpoint, pendingCheckpoint }));
                    const actual = await parentStore.read();
                    same(actual, next, 'JOURNAL_PARENT_READBACK');
                    parentRecord = actual;
                    if (sourceSession) {
                        const source = await load.source();
                        await source.confirmOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession, keeper);
                    }
                    if (durable.lifetimeHandle) {
                        const { updateWrappedPrivateLifetimePartV1 } = await load.lifetime();
                        await updateWrappedPrivateLifetimePartV1(durable.lifetimeHandle, { config, journal: { ...journal }, checkpoint, pendingCheckpoint,
                            parentCheckpoint: { revision: actual.revision, commitment: actual.commitment } });
                    }
                },
                close() { journal.password = null; parentStore.close(); },
            };
            ({ keeper, control } = await startGenericAccountKeeper({ config, journal, authority }, {}, persistence));
        }
        catch (error) {
            journal.password = null;
            parentStore.close();
            throw error;
        }
        async function sourceSnapshot() {
            control.readCheckpoints(); // Reject unavailable ownership before touching storage.
            const actual = await parentStore.read();
            same(actual, parentRecord, 'JOURNAL_PARENT_READBACK');
            const checkpoints = control.readCheckpoints();
            return immutable({ keeper: { schema: 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', config, journal: { ...journal }, ...checkpoints,
                    parentCheckpoint: { revision: actual.revision, commitment: actual.commitment } },
                ownedProcesses: [await control.readCoordinator()] });
        }
        durableKeepers.set(keeper, {
            /** @param {object} session */
            async bindSource(session) {
                need(!sourceSession, 'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
                control.assertIdle();
                const source = await load.source();
                source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
                sourceSession = session;
                return sourceSnapshot();
            },
            /** @param {object} session */
            async readSource(session) {
                need(!sourceSession || sourceSession === session, 'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
                const source = await load.source();
                source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
                return sourceSnapshot();
            },
            /** @param {object} session */
            async readSourceCandidate(session) {
                need(sourceSession === session, 'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
                control.assertBusy();
                const source = await load.source();
                source.assertOriginalNativeSessionSourceKeeperV1(session, keeper);
                const actual = await parentStore.read();
                same(actual, parentRecord, 'JOURNAL_PARENT_READBACK');
                return immutable({ revision: parentRecord.revision + 1, stateSHA256: sha(control.readCheckpoints()) });
            },
            async capture() {
                need(sourceSession === null, 'JOURNAL_SOURCE_LEGACY_CAPTURE_DENIED');
                return control.capture(async (checkpoints) => {
                    const current = await parentStore.read();
                    same(current, parentRecord, 'JOURNAL_PARENT_READBACK');
                    return { schema: 'WRAPPED_DURABLE_GRAPH_KEEPER_V1', config, journal: { ...journal }, ...checkpoints,
                        parentCheckpoint: { revision: current.revision, commitment: current.commitment } };
                });
            },
        });
        return keeper;
    }
    return Object.freeze({ createDurableGenericAccountKeeperV1, reopenDurableGenericAccountKeeperV1, captureDurableGenericAccountKeeperV1, bindOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperCandidateV1 });
}
