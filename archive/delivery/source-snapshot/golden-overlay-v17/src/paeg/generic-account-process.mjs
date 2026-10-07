/** Fixed disposable account worker. No caller-selected process, environment,
 * runtime, graph or owner-custody credential crosses this bridge. */
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isAbsolute} from 'node:path';
import {canonical} from '../privacy.mjs';
import {PROFILE, MAX_REQUESTS, copy, exact, fail, genericAccountIdentity, hex, immutable, need, same, uint, validateBoundRequest, validateCheckpoint, validateGenericAccountConfig, validateInput, validateObservation, validateOutcome} from './generic-account-journal.mjs';

export const ACCOUNT_PROTOCOL = 'PAEG_GENERIC_ACCOUNT_IPC_V1';
export const ACCOUNT_MAX_BYTES = 256 * 1024;
export const ACCOUNT_TIMEOUT_MS = 2 * 60 * 60_000;
const childFile = fileURLToPath(new URL('./generic-account-child.mjs', import.meta.url));
const SAFE_CODES = new Set(['JOURNAL_CHILD_REJECTED', 'JOURNAL_CHILD_LOST', 'JOURNAL_PROTOCOL', 'JOURNAL_MESSAGE_LIMIT', 'JOURNAL_HOST_UNAVAILABLE', 'JOURNAL_NOT_OPEN', 'JOURNAL_REQUEST_FIELDS', 'JOURNAL_REQUEST', 'JOURNAL_ASSET_UNKNOWN', 'JOURNAL_REQUEST_CONFLICT', 'JOURNAL_REFERENCE_ALREADY_BOUND', 'JOURNAL_REQUEST_LIMIT', 'JOURNAL_REQUEST_UNKNOWN', 'JOURNAL_REQUEST_ID', 'JOURNAL_RECONCILE_ORIGINAL_REQUEST', 'JOURNAL_NOT_SUBMITTED', 'JOURNAL_RECOVERY_GRAPH_REQUIRED', 'JOURNAL_STORAGE_UNAVAILABLE', 'JOURNAL_OPEN_FAILED', 'JOURNAL_AUTHORITY_UNAVAILABLE', 'JOURNAL_AUTHORITY_CHANGED', 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED', 'JOURNAL_OWNER_PREPARATION_UNAVAILABLE', 'JOURNAL_OWNER_PREPARATION_REQUIRED', 'JOURNAL_PREPARATION_FIELDS', 'JOURNAL_COORDINATOR_UNAVAILABLE']);
export function accountError(error) {
  const code = SAFE_CODES.has(error?.code) ? error.code : 'JOURNAL_CHILD_REJECTED';
  return Object.assign(new Error(code), {code});
}
export function encodeAccountMessage(value) {
  const bytes = Buffer.from(canonical(value));
  need(bytes.length <= ACCOUNT_MAX_BYTES, 'JOURNAL_MESSAGE_LIMIT');
  return bytes;
}
export function decodeAccountMessage(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= ACCOUNT_MAX_BYTES, 'JOURNAL_MESSAGE_LIMIT');
  try { return copy(JSON.parse(bytes.toString('utf8'))); }
  catch { fail('JOURNAL_PROTOCOL'); }
  finally { bytes.fill(0); }
}
export function validateJournalCredentials(journal) {
  exact(journal, ['path', 'password'], 'JOURNAL_CREDENTIAL_FIELDS');
  need(typeof journal.path === 'string' && isAbsolute(journal.path) && journal.path.length <= 4096 && !journal.path.includes('\0') && typeof journal.password === 'string' && journal.password.length >= 16 && journal.password.length <= 1024, 'JOURNAL_CREDENTIALS');
  return copy(journal);
}
export function validateAccountSnapshot(snapshot, config) {
  exact(snapshot, ['version', 'profile', 'accountId', 'revision', 'storageAvailable', 'requests']);
  need(snapshot.version === 1 && snapshot.profile === PROFILE && snapshot.accountId === config.accountId && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 && typeof snapshot.storageAvailable === 'boolean' && Array.isArray(snapshot.requests) && snapshot.requests.length <= MAX_REQUESTS, 'JOURNAL_PROTOCOL');
  for (const r of snapshot.requests) {
    exact(r, ['requestId', 'assetId', 'kind', 'state', 'errorCode']);
    validateInput({requestId: r.requestId, assetId: r.assetId, kind: r.kind, ownerOperationRef: '0'.repeat(64)}, config.registry);
    need(['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'].includes(r.state) && [null, 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'].includes(r.errorCode), 'JOURNAL_PROTOCOL');
    need(r.state !== 'RECOVERING' || r.kind === 'GRAPH', 'JOURNAL_PROTOCOL');
  }
  need(new Set(snapshot.requests.map(r => r.requestId)).size === snapshot.requests.length, 'JOURNAL_PROTOCOL');
  return immutable(snapshot);
}
function validateResult(operation, input, result, config) {
  if (operation === 'initialize' || operation === 'snapshot') return validateAccountSnapshot(result, config);
  if (operation === 'close') { exact(result, ['closed']); need(result.closed === true, 'JOURNAL_PROTOCOL'); return {closed: true}; }
  exact(result, ['request', 'state', 'errorCode', 'confirmation']);
  validateBoundRequest(result.request, config);
  need(result.request.requestId === input.requestId, 'JOURNAL_PROTOCOL');
  if (operation === 'prepare') for (const k of Object.keys(input)) same(result.request[k], input[k], 'JOURNAL_PROTOCOL');
  need(['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'].includes(result.state) && [null, 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'].includes(result.errorCode), 'JOURNAL_PROTOCOL');
  need(result.state !== 'RECOVERING' || result.request.kind === 'GRAPH', 'JOURNAL_PROTOCOL');
  need(operation !== 'recover' || result.request.kind === 'GRAPH', 'JOURNAL_PROTOCOL');
  if (result.state === 'CONFIRMED') {
    exact(result.confirmation, ['outcome', 'observationSHA256', 'observedAt', 'observationBlockNumber', 'observationBlockHash']);
    validateOutcome(result.confirmation.outcome, result.request);
    need(hex(result.confirmation.observationSHA256) && Number.isSafeInteger(result.confirmation.observedAt) && result.confirmation.observedAt >= 0 && uint(result.confirmation.observationBlockNumber) && hex(result.confirmation.observationBlockHash), 'JOURNAL_PROTOCOL');
  } else need(result.confirmation === null, 'JOURNAL_PROTOCOL');
  return immutable(result);
}
const allowedHostMethods = {
  initialize: ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint'],
  prepare: ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'prepare'],
  execute: ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'execute', 'observe'],
  reconcile: ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'reconcile', 'observe'],
  recover: ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'recover', 'observe'],
};

export async function createGenericAccountCoordinatorProcess({config, journal, opening, host, afterHostOperation = async () => {}}) {
  config = validateGenericAccountConfig(config); journal = validateJournalCredentials(journal); opening = immutable(opening);
  const identity = genericAccountIdentity(config);
  need(typeof afterHostOperation === 'function', 'JOURNAL_TEST_HOOK');
  let child, pending, hostWork = null, hostBusy = false, lastBridge = 0, nextCommand = 0;
  let readySeen = false, ended = false, stopping = false, failure = null, readyTimer, killTimer;
  let readyResolve, readyReject, exitResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); ready.catch(() => {});
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const terminateCoordinator = () => { if (!ended) child.kill('SIGKILL'); };
  function stopWith(error) {
    failure ??= accountError(error); clearTimeout(readyTimer); readyReject(failure);
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = null; }
    if (child && !ended) { child.kill('SIGTERM'); killTimer ??= setTimeout(terminateCoordinator, 1000); }
  }
  async function send(message) {
    const bytes = encodeAccountMessage(message);
    try { await new Promise((resolve, reject) => child.send(bytes, error => error ? reject(error) : resolve())); }
    finally { bytes.fill(0); }
  }
  function checkHostInput(method, input, current) {
    need(allowedHostMethods[current.operation]?.includes(method), 'JOURNAL_PROTOCOL');
    if (method === 'assertAuthority') same(input, identity, 'JOURNAL_PROTOCOL');
    else if (method === 'proposeCheckpoint' || method === 'retainCheckpoint') validateCheckpoint(input, identity);
    else {
      const request = method === 'observe' ? input.request : input;
      if (method === 'observe') { exact(input, ['request', 'outcome', 'challenge']); need(hex(input.challenge, 32), 'JOURNAL_PROTOCOL'); validateOutcome(input.outcome, request); }
      validateBoundRequest(request, config);
      need(request.requestId === current.input.requestId, 'JOURNAL_PROTOCOL');
      need(current.operation !== 'recover' || request.kind === 'GRAPH', 'JOURNAL_PROTOCOL');
      if (current.operation === 'prepare') for (const k of Object.keys(current.input)) same(request[k], current.input[k], 'JOURNAL_PROTOCOL');
      need(!current.effects.has(method), 'JOURNAL_PROTOCOL'); current.effects.add(method);
    }
  }
  function checkHostOutput(method, input, result, startedAt) {
    if (method === 'assertAuthority') { exact(result, ['version', 'available', 'identity']); need(result.version === 1 && result.available === true, 'JOURNAL_AUTHORITY_UNAVAILABLE'); same(result.identity, identity, 'JOURNAL_AUTHORITY_CHANGED'); }
    else if (method === 'proposeCheckpoint' || method === 'retainCheckpoint') {
      const flag = method === 'proposeCheckpoint' ? 'proposed' : 'retained';
      exact(result, [flag, 'checkpointSHA256']); need(result[flag] === true && hex(result.checkpointSHA256), 'JOURNAL_PROTOCOL');
    } else if (method === 'prepare') { exact(result, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256']); need(result.version === 1 && result.state === 'PREPARED' && result.bindingSHA256 === input.bindingSHA256 && result.assetBindingSHA256 === input.assetBindingSHA256, 'JOURNAL_OWNER_PREPARATION_REQUIRED'); }
    else if (method === 'observe') validateObservation(result, input.request, input.outcome, {challenge: input.challenge, startedAt, now: Date.now()});
    else validateOutcome(result, input);
    return immutable(result);
  }
  async function bridge(message) {
    exact(message, ['kind', 'protocol', 'id', 'requestId', 'method', 'input']);
    need(!hostBusy && pending && message.requestId === pending.id && Number.isSafeInteger(message.id) && message.id === lastBridge + 1 && ++pending.bridges <= 32, 'JOURNAL_PROTOCOL');
    const current = pending; lastBridge = message.id; hostBusy = true;
    checkHostInput(message.method, message.input, current);
    let result, ok = true;
    try {
      const startedAt = Date.now();
      result = checkHostOutput(message.method, message.input, await host[message.method](immutable(message.input)), startedAt);
      if (['prepare', 'execute', 'reconcile', 'recover'].includes(message.method)) await afterHostOperation({method: message.method, request: immutable(message.input), terminateCoordinator});
    } catch { ok = false; }
    // Host effects have finished before this flag clears; a newer bridge may
    // arrive while the prior send callback is completing.
    hostBusy = false;
    if (!ended && child.connected && pending === current) await send(ok
      ? {kind: 'bridgeResult', protocol: ACCOUNT_PROTOCOL, id: message.id, requestId: current.id, ok: true, value: result}
      : {kind: 'bridgeResult', protocol: ACCOUNT_PROTOCOL, id: message.id, requestId: current.id, ok: false, code: 'JOURNAL_HOST_UNAVAILABLE'});
  }
  try { child = fork(childFile, [], {cwd: fileURLToPath(new URL('.', import.meta.url)), execArgv: [], env: {LANG: 'C.UTF-8'}, serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc']}); }
  catch { fail('JOURNAL_CHILD_LOST'); }
  child.once('error', () => stopWith(accountError({code: 'JOURNAL_CHILD_LOST'})));
  child.once('close', () => {
    ended = true; clearTimeout(readyTimer); clearTimeout(killTimer);
    if (!stopping || pending) stopWith(accountError({code: 'JOURNAL_CHILD_LOST'}));
    for (const stream of child.stdio) stream?.destroy();
    exitResolve();
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', bytes => {bytes.fill(0); stopWith(accountError({code: 'JOURNAL_PROTOCOL'}));});
    stream.on('error', () => stopWith(accountError({code: 'JOURNAL_CHILD_LOST'})));
  }
  child.on('message', bytes => {
    try {
      const message = decodeAccountMessage(bytes); need(message.protocol === ACCOUNT_PROTOCOL, 'JOURNAL_PROTOCOL');
      if (message.kind === 'ready') { exact(message, ['kind', 'protocol']); need(!readySeen && !pending, 'JOURNAL_PROTOCOL'); readySeen = true; clearTimeout(readyTimer); readyResolve(); }
      else if (message.kind === 'bridge') {
        const work = bridge(message); hostWork = work;
        void work.catch(stopWith).finally(() => { if (hostWork === work) hostWork = null; });
      } else if (message.kind === 'fatal') { exact(message, ['kind', 'protocol', 'code']); stopWith(accountError({code: message.code})); }
      else {
        exact(message, message.ok === true ? ['kind', 'protocol', 'id', 'ok', 'value'] : ['kind', 'protocol', 'id', 'ok', 'code']);
        need(message.kind === 'result' && pending && message.id === pending.id && !hostBusy && typeof message.ok === 'boolean', 'JOURNAL_PROTOCOL');
        const current = pending;
        const value = message.ok ? validateResult(current.operation, current.input, message.value, config) : null;
        pending = null; clearTimeout(current.timer);
        if (message.ok) current.resolve(value); else current.reject(accountError({code: message.code}));
      }
    } catch (error) { stopWith(error); }
  });
  readyTimer = setTimeout(() => stopWith(accountError({code: 'JOURNAL_CHILD_LOST'})), 30_000);
  async function request(operation, input = null) {
    need(readySeen && !failure && !ended && !pending && (!stopping || operation === 'close'), 'JOURNAL_COORDINATOR_UNAVAILABLE');
    if (operation === 'prepare') input = validateInput(input, config.registry);
    else if (['execute', 'reconcile', 'recover'].includes(operation)) { exact(input, ['requestId']); need(typeof input.requestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId), 'JOURNAL_REQUEST_ID'); }
    else if (operation !== 'initialize') need(['snapshot', 'close'].includes(operation) && input === null, 'JOURNAL_PROTOCOL');
    const id = ++nextCommand;
    const answer = new Promise((resolve, reject) => { pending = {id, operation, input: immutable(input), effects: new Set(), bridges: 0, resolve, reject, timer: setTimeout(() => stopWith(accountError({code: 'JOURNAL_CHILD_LOST'})), ACCOUNT_TIMEOUT_MS)}; });
    void send({kind: 'request', protocol: ACCOUNT_PROTOCOL, id, operation, input}).catch(stopWith);
    return answer;
  }
  async function whenHostIdle() { while (hostWork) await hostWork.catch(() => {}); }
  async function close() {
    if (!stopping) {
      stopping = true;
      if (!ended && !failure && !pending) { try { await request('close'); } catch (error) { stopWith(error); } }
      else if (!ended) stopWith(accountError({code: 'JOURNAL_CHILD_LOST'}));
    }
    await exited; await whenHostIdle();
  }
  let initial;
  try { await ready; initial = await request('initialize', {config, journal, opening}); }
  catch (error) { stopWith(error); await close(); throw accountError(error); }
  finally { journal.password = null; }
  return Object.freeze({initial, request, close, whenHostIdle, get available() {return !ended && !failure && !stopping;}});
}
