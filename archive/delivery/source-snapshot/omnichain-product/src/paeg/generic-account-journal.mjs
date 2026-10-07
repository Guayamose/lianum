/** DRAFT v1. Local cooperative durability, not a chain verifier or owner vault.
 * The injected authenticated store and checkpoint sink belong to a surviving
 * trusted keeper. Neither is obtained from an incoming account request. */
import {createHash} from 'node:crypto';
import {canonical} from '../privacy.mjs';
import {validatePrivateAccountRegistry} from '../private-account-state.mjs';

export const PROFILE = 'DRAFT_OPAQUE_GENERIC_ACCOUNT_V1';
export const MAX_REQUESTS = 128;
export const MAX_OBSERVATION_AGE_MS = 30_000;
const STATES = ['PREPARING', 'PREPARED', 'SUBMITTING', 'UNKNOWN', 'RECOVERING', 'CONFIRMED'];
const KINDS = ['TOP_UP', 'GRAPH', 'EXIT'];
const INPUT_FIELDS = ['requestId', 'assetId', 'kind', 'ownerOperationRef'];
export const CHECKPOINT_FIELDS = ['version', 'journalId', 'accountId', 'lifetime', 'registrySHA256', 'revision', 'stateSHA256'];

export function fail(code) { throw Object.assign(new Error(code), {code}); }
export function need(condition, code) { if (!condition) fail(code); }
export const hex = (x, length = 64) => typeof x === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(x);
const id = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(x);
export const uint = x => typeof x === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(x) && BigInt(x) < (1n << 256n);
export const sha = x => createHash('sha256').update(canonical(x)).digest('hex');
export function copy(x) { return JSON.parse(canonical(x)); }
function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
export function immutable(x) { return freeze(copy(x)); }
export function exact(x, fields, code = 'JOURNAL_FIELDS') {
  need(x && typeof x === 'object' && !Array.isArray(x), code);
  // canonical rejects proxies, accessors, symbols, unusual prototypes and cycles.
  try { canonical(x); } catch { fail(code); }
  need(Object.keys(x).sort().join(',') === [...fields].sort().join(','), code);
}
export function same(a, b, code) { need(canonical(a) === canonical(b), code); }

export function validateGenericAccountConfig(config) {
  exact(config, ['journalId', 'accountId', 'lifetime', 'registry']);
  need(id(config.journalId) && id(config.accountId) && hex(config.lifetime), 'JOURNAL_IDENTITY');
  try { return immutable({...config, registry: validatePrivateAccountRegistry(config.registry)}); }
  catch { fail('JOURNAL_REGISTRY'); }
}
export function genericAccountIdentity(config) {
  return immutable({journalId: config.journalId, accountId: config.accountId, lifetime: config.lifetime, registrySHA256: sha(config.registry)});
}
export function validateCheckpoint(checkpoint, identity) {
  exact(checkpoint, CHECKPOINT_FIELDS, 'JOURNAL_CHECKPOINT');
  same(Object.fromEntries(Object.keys(identity).map(k => [k, checkpoint[k]])), identity, 'JOURNAL_CHECKPOINT_IDENTITY');
  need(checkpoint.version === 1 && Number.isSafeInteger(checkpoint.revision) && checkpoint.revision >= 0 && hex(checkpoint.stateSHA256), 'JOURNAL_CHECKPOINT');
  return immutable(checkpoint);
}
export function bindGenericAccountRequest(input, config) {
  const request = validateInput(input, config.registry);
  const assetBindingSHA256 = sha(config.registry.find(a => a.assetId === input.assetId));
  return {...request, assetBindingSHA256, bindingSHA256: sha({version: 1, profile: PROFILE, identity: genericAccountIdentity(config), assetBindingSHA256, request})};
}
export function validateBoundRequest(request, config) {
  exact(request, [...INPUT_FIELDS, 'bindingSHA256', 'assetBindingSHA256']);
  const input = Object.fromEntries(INPUT_FIELDS.map(k => [k, request[k]]));
  same(request, bindGenericAccountRequest(input, config), 'JOURNAL_BINDING_CHANGED');
  return immutable(request);
}

export function validateInput(input, registry) {
  exact(input, INPUT_FIELDS, 'JOURNAL_REQUEST_FIELDS');
  need(id(input.requestId) && hex(input.assetId) && KINDS.includes(input.kind) && hex(input.ownerOperationRef), 'JOURNAL_REQUEST');
  need(registry.some(a => a.assetId === input.assetId), 'JOURNAL_ASSET_UNKNOWN');
  return copy(input);
}
export function validateOutcome(value, request) {
  exact(value, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256', 'outcomeId', 'disposition', 'blockNumber', 'blockHash'], 'JOURNAL_OUTCOME_FIELDS');
  need(value.version === 1 && value.state === 'CONFIRMED' && value.bindingSHA256 === request.bindingSHA256 && value.assetBindingSHA256 === request.assetBindingSHA256, 'JOURNAL_OUTCOME_BINDING');
  need(hex(value.outcomeId) && uint(value.blockNumber) && hex(value.blockHash), 'JOURNAL_OUTCOME_ANCHOR');
  need(value.disposition === 'APPLIED' || (request.kind === 'GRAPH' && value.disposition === 'RECOVERED'), 'JOURNAL_OUTCOME_DISPOSITION');
  return copy(value);
}
export function validateObservation(value, request, outcome, {challenge, startedAt, now}) {
  exact(value, ['version', 'status', 'bindingSHA256', 'assetBindingSHA256', 'outcomeId', 'challenge', 'observedAt', 'blockNumber', 'blockHash', 'canonicalOutcomeBlockHash', 'backing'], 'JOURNAL_OBSERVATION_FIELDS');
  need(value.version === 1 && value.status === 'LIVE' && value.bindingSHA256 === request.bindingSHA256 && value.assetBindingSHA256 === request.assetBindingSHA256 && value.outcomeId === outcome.outcomeId, 'JOURNAL_OBSERVATION_BINDING');
  need(hex(value.challenge, 32) && value.challenge === challenge, 'JOURNAL_OBSERVATION_CHALLENGE');
  need(Number.isSafeInteger(now) && Number.isSafeInteger(startedAt) && Number.isSafeInteger(value.observedAt) && value.observedAt >= startedAt && value.observedAt <= now && now - value.observedAt <= MAX_OBSERVATION_AGE_MS, 'JOURNAL_OBSERVATION_STALE');
  need(uint(value.blockNumber) && hex(value.blockHash) && value.canonicalOutcomeBlockHash === outcome.blockHash && BigInt(value.blockNumber) >= BigInt(outcome.blockNumber), 'JOURNAL_OBSERVATION_CANONICAL');
  if (value.blockNumber === outcome.blockNumber) need(value.blockHash === outcome.blockHash, 'JOURNAL_OBSERVATION_CANONICAL');
  exact(value.backing, ['held', 'liabilities', 'surplus', 'deficit'], 'JOURNAL_BACKING_FIELDS');
  need(Object.values(value.backing).every(uint), 'JOURNAL_BACKING');
  const held = BigInt(value.backing.held), debt = BigInt(value.backing.liabilities);
  need(held >= debt && value.backing.deficit === '0' && value.backing.surplus === String(held - debt), 'JOURNAL_BACKING_DEFICIT');
  return copy(value);
}

/** store: {create(data), read(), update(expectedRevision, synchronousTransform)}.
 * It must authenticate encrypted bytes and provide atomic CAS/readback semantics
 * equivalent to the existing Vault. Inject closures over a separate journal
 * Vault/password; never pass an owner Vault or owner password to this class. */
export class GenericAccountJournal {
  #store; #retain; #propose; #record; #identity; #registry; #fault = false; #opened = false;
  constructor(config, {store, retainCheckpoint, proposeCheckpoint}) {
    config = validateGenericAccountConfig(config);
    this.#registry = config.registry;
    this.#identity = genericAccountIdentity(config);
    need(store && ['create', 'read', 'update'].every(k => typeof store[k] === 'function') && typeof retainCheckpoint === 'function' && typeof proposeCheckpoint === 'function', 'JOURNAL_KEEPER_REQUIRED');
    this.#store = store;
    this.#retain = retainCheckpoint;
    this.#propose = proposeCheckpoint;
  }
  identity() { return immutable(this.#identity); }
  #checkpoint(record) { return {version: 1, ...this.#identity, revision: record.revision, stateSHA256: sha(record.data)}; }
  #validateRecord(record) {
    exact(record, ['revision', 'data'], 'JOURNAL_STORAGE_RECORD');
    need(Number.isSafeInteger(record.revision) && record.revision >= 0, 'JOURNAL_REVISION');
    const s = record.data;
    exact(s, ['version', 'profile', 'identity', 'registry', 'previousStateSHA256', 'requests']);
    need(s.version === 1 && s.profile === PROFILE, 'JOURNAL_VERSION');
    same(s.identity, this.#identity, 'JOURNAL_IDENTITY_CHANGED');
    same(s.registry, this.#registry, 'JOURNAL_REGISTRY_CHANGED');
    need(record.revision === 0 ? s.previousStateSHA256 === null : hex(s.previousStateSHA256), 'JOURNAL_PREDECESSOR');
    need(Array.isArray(s.requests) && s.requests.length <= MAX_REQUESTS, 'JOURNAL_REQUEST_LIMIT');
    const requestIds = new Set(), refs = new Set();
    for (const entry of s.requests) {
      exact(entry, ['request', 'state', 'errorCode', 'confirmation']);
      const r = entry.request;
      exact(r, [...INPUT_FIELDS, 'bindingSHA256', 'assetBindingSHA256']);
      const input = Object.fromEntries(INPUT_FIELDS.map(k => [k, r[k]]));
      same(r, this.#binding(input), 'JOURNAL_BINDING_CHANGED');
      need(!requestIds.has(r.requestId) && !refs.has(r.ownerOperationRef), 'JOURNAL_DUPLICATE_BINDING');
      requestIds.add(r.requestId); refs.add(r.ownerOperationRef);
      need(STATES.includes(entry.state), 'JOURNAL_STATE');
      need(entry.state !== 'RECOVERING' || r.kind === 'GRAPH', 'JOURNAL_RECOVERY_GRAPH_REQUIRED');
      need(entry.errorCode === null || entry.errorCode === 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED', 'JOURNAL_ERROR_CODE');
      if (entry.state === 'CONFIRMED') {
        exact(entry.confirmation, ['outcome', 'observationSHA256', 'observedAt', 'observationBlockNumber', 'observationBlockHash']);
        validateOutcome(entry.confirmation.outcome, r);
        need(hex(entry.confirmation.observationSHA256) && Number.isSafeInteger(entry.confirmation.observedAt) && entry.confirmation.observedAt >= 0 && uint(entry.confirmation.observationBlockNumber) && hex(entry.confirmation.observationBlockHash), 'JOURNAL_CONFIRMATION');
        need(entry.errorCode === null, 'JOURNAL_CONFIRMATION');
      } else need(entry.confirmation === null, 'JOURNAL_CONFIRMATION');
    }
    return record;
  }
  #binding(input) {
    const request = validateInput(input, this.#registry);
    const assetBindingSHA256 = sha(this.#registry.find(a => a.assetId === input.assetId));
    return {...request, assetBindingSHA256, bindingSHA256: sha({version: 1, profile: PROFILE, identity: this.#identity, assetBindingSHA256, request})};
  }
  #guard() { need(this.#opened && this.#record && !this.#fault, 'JOURNAL_STORAGE_UNAVAILABLE'); }
  async #ack(record) {
    const checkpoint = this.#checkpoint(record);
    const answer = await this.#retain(immutable(checkpoint));
    exact(answer, ['retained', 'checkpointSHA256'], 'JOURNAL_CHECKPOINT_ACK');
    need(answer.retained === true && answer.checkpointSHA256 === sha(checkpoint), 'JOURNAL_CHECKPOINT_ACK');
  }
  async #candidate(record) {
    const checkpoint = this.#checkpoint(record);
    const answer = await this.#propose(immutable(checkpoint));
    exact(answer, ['proposed', 'checkpointSHA256'], 'JOURNAL_CHECKPOINT_PROPOSAL');
    need(answer.proposed === true && answer.checkpointSHA256 === sha(checkpoint), 'JOURNAL_CHECKPOINT_PROPOSAL');
  }
  async open(options = {}) {
    need(!this.#opened && !this.#fault, 'JOURNAL_ALREADY_OPEN');
    this.#opened = true;
    try {
      exact(options, options.create === true ? ['create'] : ['checkpoint', ...(Object.hasOwn(options, 'pendingCheckpoint') ? ['pendingCheckpoint'] : [])], 'JOURNAL_OPEN_FIELDS');
      const {create = false, checkpoint = null, pendingCheckpoint = null} = copy(options);
      need(typeof create === 'boolean', 'JOURNAL_OPEN');
      if (create) {
        need(checkpoint === null, 'JOURNAL_CREATE_CHECKPOINT');
        const data = {version: 1, profile: PROFILE, identity: this.#identity, registry: this.#registry, previousStateSHA256: null, requests: []};
        await this.#candidate({revision: 0, data});
        await this.#store.create(data);
      } else {
        validateCheckpoint(checkpoint, this.#identity);
        if (pendingCheckpoint !== null) validateCheckpoint(pendingCheckpoint, this.#identity);
      }
      const record = this.#validateRecord(await this.#store.read());
      if (create) need(record.revision === 0, 'JOURNAL_CREATE_REVISION');
      else if (record.revision === checkpoint.revision) need(sha(record.data) === checkpoint.stateSHA256, 'JOURNAL_CHECKPOINT_CHANGED');
      else {
        // A predecessor hash alone is not enough: the surviving keeper must
        // retain this exact candidate before its encrypted write begins.
        need(record.revision === checkpoint.revision + 1 && record.data.previousStateSHA256 === checkpoint.stateSHA256, 'JOURNAL_CHECKPOINT_STALE');
        same(this.#checkpoint(record), pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE');
      }
      await this.#ack(record);
      this.#record = copy(record);
      return this.snapshot();
    } catch { this.#fault = true; fail('JOURNAL_OPEN_FAILED'); }
  }
  snapshot() {
    need(this.#record, 'JOURNAL_NOT_OPEN');
    return immutable({version: 1, profile: PROFILE, accountId: this.#identity.accountId, revision: this.#record.revision, storageAvailable: !this.#fault, requests: this.#record.data.requests.map(({request, state, errorCode}) => ({requestId: request.requestId, assetId: request.assetId, kind: request.kind, state, errorCode}))});
  }
  request(requestId) {
    this.#guard();
    need(id(requestId), 'JOURNAL_REQUEST_ID');
    return immutable(this.#record.data.requests.find(e => e.request.requestId === requestId) ?? null);
  }
  async #write(transform) {
    this.#guard();
    try {
      const before = this.#validateRecord(await this.#store.read());
      same(before, this.#record, 'JOURNAL_STORAGE_CHANGED');
      const data = transform(copy(before.data));
      data.previousStateSHA256 = sha(before.data);
      const candidate = this.#validateRecord({revision: before.revision + 1, data});
      await this.#candidate(candidate);
      const next = await this.#store.update(before.revision, current => {
        same(current, before.data, 'JOURNAL_STORAGE_CHANGED');
        return copy(candidate.data);
      });
      same(next, candidate, 'JOURNAL_CHECKPOINT_CANDIDATE');
      need(next.revision === before.revision + 1, 'JOURNAL_WRITE_REVISION');
      this.#validateRecord(next);
      same(await this.#store.read(), next, 'JOURNAL_WRITE_READBACK');
      await this.#ack(next);
      this.#record = copy(next);
    } catch { this.#fault = true; fail('JOURNAL_STORAGE_UNAVAILABLE'); }
  }
  async bind(input) {
    this.#guard();
    const request = this.#binding(input), old = this.request(request.requestId);
    if (old) { same(old.request, request, 'JOURNAL_REQUEST_CONFLICT'); return old; }
    need(!this.#record.data.requests.some(e => e.request.ownerOperationRef === request.ownerOperationRef), 'JOURNAL_REFERENCE_ALREADY_BOUND');
    need(this.#record.data.requests.length < MAX_REQUESTS, 'JOURNAL_REQUEST_LIMIT');
    await this.#write(s => ({...s, requests: [...s.requests, {request, state: 'PREPARING', errorCode: null, confirmation: null}]}));
    return this.request(request.requestId);
  }
  async transition(requestId, state, confirmation = null) {
    const old = this.request(requestId);
    need(old, 'JOURNAL_REQUEST_UNKNOWN');
    const allowed = {PREPARING: ['PREPARED'], PREPARED: ['SUBMITTING'], SUBMITTING: ['UNKNOWN', 'RECOVERING', 'CONFIRMED'], UNKNOWN: ['UNKNOWN', 'RECOVERING', 'CONFIRMED'], RECOVERING: ['RECOVERING', 'CONFIRMED'], CONFIRMED: []};
    need(allowed[old.state].includes(state), 'JOURNAL_TRANSITION');
    need(state !== 'RECOVERING' || old.request.kind === 'GRAPH', 'JOURNAL_RECOVERY_GRAPH_REQUIRED');
    await this.#write(s => ({...s, requests: s.requests.map(e => e.request.requestId === requestId ? {...e, state, confirmation: copy(confirmation), errorCode: ['UNKNOWN', 'RECOVERING'].includes(state) ? 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED' : null} : e)}));
    return this.request(requestId);
  }
  close() { this.#fault = true; }
}
