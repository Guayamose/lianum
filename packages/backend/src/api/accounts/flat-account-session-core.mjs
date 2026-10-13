/** @typedef {{requestId:string,kind:string,state:string,errorCode:unknown,assetId?:unknown}} JournalRow
 * @typedef {{version:number,revision:number,storageAvailable:boolean,requests:JournalRow[]}} JournalSnapshot
 * @typedef {{prepare(request:unknown):Promise<unknown>,execute(id:string):Promise<unknown>,reconcile(id:string):Promise<unknown>,recover(id:string):Promise<unknown>,snapshot():Promise<unknown>,restartCoordinator():Promise<unknown>,close():Promise<unknown>}} Keeper
 * @typedef {{ownerView():Promise<unknown>}} OwnerHandoff
 * @typedef {{sequence:number,action:string,requestId:string|null,state:string,errorCode:string|null}} Admission
 * @typedef {{revision:number|null,storageAvailable:boolean,requests:{requestId:string,kind:string,state:string,errorCode:string|null}[]}} PublicJournal
 * @typedef {{version:number,profile:string,phase:string,available:boolean,busy:boolean,queued:number,observation:string,revision:number|null,storageAvailable:boolean,errorCode:string|null,requests:PublicJournal['requests'],admissions:Admission[],capabilities:{coordinatorRestart:boolean,keeperRestart:boolean,nodeRestart:boolean,fullWalletAcceptance:boolean}}} SessionView
 * @typedef {{keeper():Keeper|null,ownerView():(()=>Promise<unknown>)|undefined,live():void,snapshot():Promise<{revision:number,storageAvailable:boolean,requests:{requestId:string,assetId:unknown,kind:string,state:string}[],busy:boolean,queued:number,observation:string}>}} OwnerState
 */
import { validateFlatAccountPrepare } from '@lianum/engine/accounts/account-prepare-contract';
export { validateFlatAccountPrepare } from '@lianum/engine/accounts/account-prepare-contract';
/** Local presentation boundary over one already-created, surviving keeper.
 * Admissions below are volatile UI state, never a second account journal. */
import { types } from 'node:util';
export const FLAT_ACCOUNT_API_PROFILE = 'LOCAL_FLAT_ACCOUNT_API_V1';
export const FLAT_ACCOUNT_ADMISSION_LIMIT = 32;
/** Each builder owns isolated session brands; no setter can change the canonical guard.
 * @param {{assertOriginalGenericAccountKeeperV1(keeper:Keeper|null,expected:{config:unknown,authority:unknown}):void}} ports */
export function buildFlatAccountSessionFamilyV1(ports) {
    record(ports, ['assertOriginalGenericAccountKeeperV1'], 'FLAT_ACCOUNT_SESSION_CONTRACT');
    method(ports, 'assertOriginalGenericAccountKeeperV1', 'FLAT_ACCOUNT_SESSION_CONTRACT');
    const { assertOriginalGenericAccountKeeperV1 } = ports;
    /** @type {WeakSet<object>} */
    const sessions = new WeakSet();
    /** @type {WeakMap<object,OwnerState>} */
    const originalClaimSessions = new WeakMap();
    /** Original owner membership only; it exposes no keeper or registration port. */
    /** @param {object} session @param {unknown} ownerView */
    function assertFlatAccountSessionOwnerViewV1(session, ownerView) {
        assertFlatAccountSession(session);
        const original = originalClaimSessions.get(session);
        need(original && original.ownerView() === ownerView, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
    }
    /** Read-only original owner binding. No keeper, callback or registry writer escapes. */
    /** @param {object} session @param {unknown} expected */
    function assertFlatAccountOwnerSessionBindingV1(session, expected) {
        record(expected, ['ownerView', 'config', 'authority'], 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
        assertFlatAccountSessionOwnerViewV1(session, expected.ownerView);
        const original = originalClaimSessions.get(session);
        need(original, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
        original.live();
        assertOriginalGenericAccountKeeperV1(original.keeper(), { config: expected.config, authority: expected.authority });
    }
    /** @param {object} session @param {unknown} expected */
    async function readFlatAccountOwnerSessionSnapshotV1(session, expected) {
        assertFlatAccountOwnerSessionBindingV1(session, expected);
        const original = originalClaimSessions.get(session);
        need(original, 'FLAT_ACCOUNT_ORIGINAL_CLAIM_SESSION_REQUIRED');
        const result = await original.snapshot();
        assertFlatAccountOwnerSessionBindingV1(session, expected);
        return result;
    }
    const actions = new Set(['prepare', 'execute', 'reconcile', 'recover', 'restartCoordinator', 'close']);
    const states = new Set(['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED']);
    const kinds = new Set(['TOP_UP', 'GRAPH', 'EXIT']);
    // JavaScript's $ can match before a final line terminator. Compare the complete
    // match with the original input so canonical wire values cannot retain one.
    /** @param {unknown} value @param {RegExp} pattern @returns {value is string} */
    const wholeMatch = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
    /** @param {unknown} value @returns {value is string} */
    const requestId = value => wholeMatch(value, /^[A-Za-z0-9_-]{8,100}$/);
    /** @param {unknown} value @returns {value is string} */
    const hex = value => wholeMatch(value, /^[0-9a-f]{64}$/);
    /** @template T @param {T} value @returns {T} */
    const copy = value => structuredClone(value);
    /** @param {string} code @returns {never} */
    function fail(code) { throw Object.assign(new Error(code), { code }); }
    /** @param {unknown} condition @param {string} code @returns {asserts condition} */
    function need(condition, code) { if (!condition)
        fail(code); }
    /** @param {unknown} value @param {readonly string[]} fields @param {string} code @returns {asserts value is Record<string,unknown>} */
    function record(value, fields, code) {
        need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, code);
        const keys = Reflect.ownKeys(value);
        need(keys.length === fields.length && fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')), code);
    }
    /** @param {unknown} value @param {string} name @param {string} code */
    function method(value, name, code) {
        need(value && !types.isProxy(value), code);
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        need(descriptor && typeof descriptor.value === 'function', code);
    }
    /** @param {unknown} error @returns {string} */
    function flatAccountErrorCode(error) {
        // Neither an exception message nor a keeper response is a public payload.
        const details = /** @type {{code?:unknown,message?:unknown}|null|undefined} */ (error);
        const candidate = details?.code ?? details?.message;
        return wholeMatch(candidate, /^(?:FLAT_ACCOUNT|JOURNAL)_[A-Z0-9_]{1,90}$/)
            ? candidate : 'FLAT_ACCOUNT_OPERATION_FAILED';
    }
    /** @param {string} action @param {unknown} input @returns {{requestId?:string}} */
    function command(action, input) {
        need(actions.has(action), 'FLAT_ACCOUNT_ACTION');
        if (action === 'prepare')
            return validateFlatAccountPrepare(input);
        if (action === 'restartCoordinator' || action === 'close') {
            record(input, [], 'FLAT_ACCOUNT_REQUEST_FIELDS');
            return Object.freeze({});
        }
        record(input, ['requestId'], 'FLAT_ACCOUNT_REQUEST_FIELDS');
        need(requestId(input.requestId), 'FLAT_ACCOUNT_REQUEST');
        return Object.freeze({ requestId: input.requestId });
    }
    /** @param {unknown} raw @returns {PublicJournal} */
    function publicJournal(raw) {
        const value = /** @type {JournalSnapshot|null} */ (raw);
        need(value && value.version === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0
            && typeof value.storageAvailable === 'boolean' && Array.isArray(value.requests)
            && value.requests.length <= 128, 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
        const seen = new Set();
        const requests = value.requests.map(row => {
            need(row && requestId(row.requestId) && !seen.has(row.requestId) && kinds.has(row.kind)
                && states.has(row.state), 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
            seen.add(row.requestId);
            return { requestId: row.requestId, kind: row.kind, state: row.state,
                errorCode: row.errorCode === null ? null : flatAccountErrorCode({ code: row.errorCode }) };
        });
        // accountId, assetId, registry, holdings, refs, outcomes and all extension
        // fields are deliberately absent, including fields a future keeper adds.
        return { revision: value.revision, storageAvailable: value.storageAvailable, requests };
    }
    /** @param {object} session */
    function assertFlatAccountSession(session) {
        need(sessions.has(session), 'FLAT_ACCOUNT_ORIGINAL_SESSION_REQUIRED');
    }
    /** PRIVATE bootstrap only. No factories, serialized capabilities, replacement
     * authority, runtime URLs, journal paths or owner witnesses are accepted. */
    /** @param {unknown} input */
    async function createFlatAccountSession(input) {
        record(input, ['keeper', 'ownerHandoff'], 'FLAT_ACCOUNT_BOOTSTRAP_FIELDS');
        for (const name of ['prepare', 'execute', 'reconcile', 'recover', 'snapshot', 'restartCoordinator', 'close'])
            method(input.keeper, name, 'FLAT_ACCOUNT_KEEPER_REQUIRED');
        method(input.ownerHandoff, 'ownerView', 'FLAT_ACCOUNT_OWNER_HANDOFF_REQUIRED');
        let keeper = /** @type {Keeper|null} */ (input.keeper), ownerHandoff = /** @type {OwnerHandoff|null} */ (input.ownerHandoff);
        /** @type {PublicJournal} */
        let journal = { revision: null, storageAvailable: false, requests: [] };
        let available = false, closed = false, closing = false;
        /** @type {string|null} */ let errorCode = null;
        /** @type {Promise<unknown>} */ let tail = Promise.resolve();
        /** @type {Promise<SessionView>|null} */ let refreshPending = null, shutdownPending = null;
        let ownerReadPending = false;
        let pending = 0, running = false, sequence = 0;
        /** @type {Admission[]} */
        const admissions = [];
        input = null;
        /** @returns {SessionView} */
        function view() {
            return copy({ version: 1, profile: FLAT_ACCOUNT_API_PROFILE,
                phase: closed ? 'CLOSED' : available ? 'READY' : 'UNAVAILABLE',
                available: available && !closed, busy: running, queued: pending - Number(running),
                observation: available && !pending && !closed ? 'CURRENT' : 'STALE',
                revision: journal.revision, storageAvailable: available && journal.storageAvailable,
                errorCode, requests: journal.requests, admissions,
                capabilities: { coordinatorRestart: Boolean(keeper) && !closed, keeperRestart: false,
                    nodeRestart: false, fullWalletAcceptance: false } });
        }
        /** @template T @param {()=>T|Promise<T>} work @returns {Promise<T>} */
        function enqueue(work) {
            const result = tail.then(work);
            tail = result.catch(() => { });
            return result;
        }
        async function observe() {
            if (!keeper || closed)
                return view();
            const original = keeper;
            try {
                const observed = await original.snapshot();
                if (keeper !== original || closed)
                    return view();
                journal = publicJournal(observed);
                available = journal.storageAvailable;
                errorCode = available ? null : 'JOURNAL_STORAGE_UNAVAILABLE';
            }
            catch (error) {
                if (keeper !== original || closed)
                    return view();
                available = false;
                errorCode = flatAccountErrorCode(error);
            }
            return view();
        }
        /** @param {string} action @param {unknown} input */
        function submit(action, input) {
            // Snapshot caller-owned input before any asynchronous boundary.
            const body = command(action, input);
            need(keeper && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
            need(pending < FLAT_ACCOUNT_ADMISSION_LIMIT, 'FLAT_ACCOUNT_ADMISSION_BUSY');
            // Only the original coordinator's restart can repair an unavailable journal.
            need(available || action === 'restartCoordinator' || action === 'close', 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
            if (action === 'close')
                closing = true;
            /** @type {Admission} */
            const admission = { sequence: ++sequence, action, requestId: body.requestId ?? null,
                state: 'ADMITTED', errorCode: null };
            admissions.push(admission);
            if (admissions.length > FLAT_ACCOUNT_ADMISSION_LIMIT)
                admissions.shift();
            pending++;
            void enqueue(async () => {
                running = true;
                admission.state = 'RUNNING';
                try {
                    need(keeper && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                    need(available || action === 'restartCoordinator' || action === 'close', 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                    if (action === 'prepare')
                        await keeper.prepare(body);
                    else if (action === 'restartCoordinator' || action === 'close')
                        await keeper[action]();
                    else
                        await keeper[ /** @type {'execute'|'reconcile'|'recover'} */(action)](/** @type {string} */ (body.requestId));
                    // Never derive a confirmed account outcome from an HTTP acknowledgement
                    // or the mutation's return value. Only the keeper snapshot supplies it.
                    admission.state = 'SUCCEEDED';
                    if (action === 'close') {
                        closed = true;
                        available = false;
                        keeper = null;
                        ownerHandoff = null;
                        errorCode = 'FLAT_ACCOUNT_CLOSED';
                    }
                }
                catch (error) {
                    admission.state = 'FAILED';
                    admission.errorCode = flatAccountErrorCode(error);
                    if (action === 'close')
                        closing = false;
                }
                finally {
                    await observe();
                    running = false;
                    pending--;
                }
            });
            return copy({ version: 1, admitted: true, sequence: admission.sequence,
                action, requestId: admission.requestId });
        }
        const session = Object.freeze({
            submit,
            /** @param {unknown} request */
            prepare: request => submit('prepare', request),
            /** @param {string} id */
            execute: id => submit('execute', { requestId: id }),
            /** @param {string} id */
            reconcile: id => submit('reconcile', { requestId: id }),
            /** @param {string} id */
            recover: id => submit('recover', { requestId: id }),
            restartCoordinator: () => submit('restartCoordinator', {}),
            async snapshot() {
                // Proof/native work may be long. Polling must not contend with the keeper
                // or stall the local UI until that work completes.
                if (pending || closed || !keeper)
                    return view();
                if (!refreshPending)
                    refreshPending = enqueue(observe).finally(() => { refreshPending = null; });
                await refreshPending;
                return view();
            },
            async ownerView() {
                need(keeper && ownerHandoff && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                need(!pending && !ownerReadPending, 'FLAT_ACCOUNT_OWNER_VIEW_BUSY');
                ownerReadPending = true;
                try {
                    return await enqueue(async () => {
                        await observe();
                        need(keeper && ownerHandoff && available && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                        const original = keeper, originalOwner = ownerHandoff;
                        // The private handoff is solely a portfolio/status view; its producer
                        // must never return keys, full graph openings or proof witnesses.
                        const result = await originalOwner.ownerView();
                        need(keeper === original && ownerHandoff === originalOwner && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                        return copy(result);
                    });
                }
                finally {
                    ownerReadPending = false;
                }
            },
            async idle() { await tail; return view(); },
            close() {
                return shutdownPending ??= (async () => {
                    if (!closed && !closing && keeper) {
                        // Shutdown remains possible even when every admission slot is full.
                        // Stop new admissions before waiting for the accepted queue to drain.
                        closing = true;
                        await tail;
                        if (keeper && !closed) {
                            closing = false;
                            submit('close', {});
                        }
                    }
                    await tail;
                    return view();
                })().finally(() => { shutdownPending = null; });
            },
            async quiesceForPrivateRecovery() {
                need(keeper && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                closing = true;
                await tail;
                need(keeper && !closed, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                // The original owner captures its durable keeper separately. The UI
                // session loses all admission and owner-view access before it returns.
                closed = true;
                available = false;
                keeper = null;
                ownerHandoff = null;
                return view();
            },
            // Private lifecycle notification, deliberately absent from the HTTP routes.
            // Losing the original capability cannot be repaired by supplying another.
            keeperUnavailable() {
                keeper = null;
                ownerHandoff = null;
                available = false;
                errorCode = 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE';
                return view();
            },
        });
        sessions.add(session);
        originalClaimSessions.set(session, { keeper: () => keeper, ownerView: () => ownerHandoff?.ownerView,
            live() { need(keeper && ownerHandoff && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE'); },
            async snapshot() {
                const original = keeper;
                need(original && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                const snapshot = await original.snapshot();
                need(keeper === original && !closed && !closing, 'FLAT_ACCOUNT_KEEPER_UNAVAILABLE');
                publicJournal(snapshot);
                const observed = /** @type {JournalSnapshot} */ (snapshot);
                return copy({ revision: observed.revision, storageAvailable: observed.storageAvailable,
                    requests: observed.requests.map(q => {
                        need(hex(q.assetId), 'FLAT_ACCOUNT_SNAPSHOT_INVALID');
                        return { requestId: q.requestId, assetId: q.assetId, kind: q.kind, state: q.state };
                    }),
                    busy: running, queued: pending - Number(running), observation: available && !pending ? 'CURRENT' : 'STALE' });
            } });
        await observe();
        return session;
    }
    return Object.freeze({ assertFlatAccountSessionOwnerViewV1, assertFlatAccountOwnerSessionBindingV1, readFlatAccountOwnerSessionSnapshotV1, flatAccountErrorCode, assertFlatAccountSession, createFlatAccountSession });
}
