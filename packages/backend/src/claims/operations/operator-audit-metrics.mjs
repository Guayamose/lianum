/** Private diagnostics only. These tokens cannot authorize an operation,
 * change its clock, provide an observation or select a caller callback. */
import { performance } from 'node:perf_hooks';
import { cpuUsage } from 'node:process';

const lifetimes = new WeakMap();
const operations = new WeakMap();
const intervals = new WeakMap();
const MAX_LABELS = 32;
const MAX_ACTIVE = 64;
const MAX_REPORTS = 8;
const MAX_VALUE = 3_600_000_000;
const PHASES = new Set(['serial', 'read-vault', 'durable-save', 'read-current-view',
  'current', 'joint-current', 'v4-round', 'v4-facts-round']);
const METHODS = new Set(['operation', 'begin-payout', 'redeem', 'reserve-payout',
  'debt-health', 'presign-payout', 'payout-broadcast']);
const ROUNDS = new Set(['whole-operation', 'initial-preparation', 'original-validation',
  'existing-authorization', 'pre-key', 'persisted-return']);
const opaque = () => Object.freeze(Object.create(null));

function incomplete(state) {
  if (state) state.incomplete = true;
}

function clamp(state, value) {
  if (!Number.isFinite(value) || value < 0) {
    incomplete(state);
    return 0;
  }
  if (value > MAX_VALUE) {
    state.truncated = true;
    return MAX_VALUE;
  }
  return value;
}

function sample(state) {
  try {
    return { wall: performance.now(), cpu: cpuUsage() };
  } catch {
    incomplete(state);
    return null;
  }
}

function copyReport(state) {
  const start = state.start;
  const end = state.end;
  const values = start && end ? [end.wall - start.wall, end.cpu.user - start.cpu.user, end.cpu.system - start.cpu.system] : [];
  const invalid = values.length !== 3 || values.some(value => !Number.isFinite(value) || value < 0);
  const saturated = values.some(value => value > MAX_VALUE);
  const bounded = value => Number.isFinite(value) && value >= 0 ? Math.min(MAX_VALUE, value) : 0;
  return Object.freeze({ schema: 'CLAIM_PRIVATE_OPERATION_METRICS_V1',
    operationOrdinal: state.ordinal,
    wallMilliseconds: start && end ? bounded(end.wall - start.wall) : 0,
    processUserMicroseconds: start && end ? bounded(end.cpu.user - start.cpu.user) : 0,
    processSystemMicroseconds: start && end ? bounded(end.cpu.system - start.cpu.system) : 0,
    cpuScope: 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK',
    wallScope: 'NESTED_INTERVALS_OVERLAP',
    wholeOperationScope: 'TO_LAST_METRICS_SAMPLE_NOT_TERMINAL_AUTHORITY',
    finalizationScope: 'CLEANUP_TO_LAST_SAMPLE_PARTIALLY_MEASURED',
    postFenceSamplingAndRetirementNotBudgeted: true,
    nonCustodyObserverSeparatePhaseNotMeasured: true,
    incomplete: state.incomplete || invalid,
    truncated: state.truncated || saturated,
    peakActiveIntervals: state.peakActive,
    rpcCounts: null,
    keyUsageMeasured: false,
    labels: Object.freeze([...state.labels.values()].map(row => Object.freeze({ ...row }))) });
}

function raw_createClaimOperatorMetricsLifetime() {
  const token = opaque();
  lifetimes.set(token, { reports: [], nextOperation: 0, active: null, failed: false });
  return token;
}

function raw_beginClaimOperatorMetrics(lifetime) {
  const retained = lifetimes.get(lifetime);
  if (!retained || retained.active) return null;
  const token = opaque();
  const ordinal = Math.min(retained.nextOperation, MAX_VALUE);
  const saturated = retained.nextOperation >= MAX_VALUE;
  retained.nextOperation = Math.min(MAX_VALUE, retained.nextOperation + 1);
  const state = { lifetime, ordinal, labels: new Map(), active: new Set(),
    incomplete: saturated, truncated: saturated, closed: false, peakActive: 0, start: null, latest: null, end: null };
  state.start = sample(state);
  state.latest = state.start;
  operations.set(token, state);
  retained.active = token;
  return token;
}

function raw_enterClaimOperatorMetricsPhase(operation, phase, method, round) {
  const state = operations.get(operation);
  if (!state || state.closed) return null;
  if (!PHASES.has(phase) || !METHODS.has(method) || !ROUNDS.has(round)) {
    incomplete(state);
    return null;
  }
  const label = phase + ':' + method + ':' + round;
  let aggregate = state.labels.get(label);
  if (!aggregate) {
    if (state.labels.size >= MAX_LABELS) {
      state.truncated = true;
      incomplete(state);
      return null;
    }
    aggregate = { phase, method, round, invocations: 0, measuredIntervals: 0,
      wallMilliseconds: 0, maximumWallMilliseconds: 0, processUserMicroseconds: 0,
      processSystemMicroseconds: 0 };
    state.labels.set(label, aggregate);
  }
  aggregate.invocations = clamp(state, aggregate.invocations + 1);
  if (state.active.size >= MAX_ACTIVE) {
    state.truncated = true;
    incomplete(state);
    return null;
  }
  const token = opaque();
  const started = sample(state);
  if (!started) return null;
  intervals.set(token, { operation, aggregate, started });
  state.active.add(token);
  state.peakActive = Math.max(state.peakActive, state.active.size);
  return token;
}

function raw_leaveClaimOperatorMetricsPhase(token) {
  const entry = intervals.get(token);
  if (!entry) return;
  intervals.delete(token);
  const state = operations.get(entry.operation);
  if (!state || state.closed || !state.active.delete(token)) return;
  const ended = sample(state);
  if (!ended) return;
  state.latest = ended;
  const wall = clamp(state, ended.wall - entry.started.wall);
  const user = clamp(state, ended.cpu.user - entry.started.cpu.user);
  const system = clamp(state, ended.cpu.system - entry.started.cpu.system);
  const row = entry.aggregate;
  row.measuredIntervals = clamp(state, row.measuredIntervals + 1);
  row.wallMilliseconds = clamp(state, row.wallMilliseconds + wall);
  row.maximumWallMilliseconds = Math.max(row.maximumWallMilliseconds, wall);
  row.processUserMicroseconds = clamp(state, row.processUserMicroseconds + user);
  row.processSystemMicroseconds = clamp(state, row.processSystemMicroseconds + system);
}

/** Called before the original budget computes elapsed; sampling overhead is
 * part of that same unchanged bound. This does not perform a validation. */
function raw_checkpointClaimOperatorMetrics(operation) {
  const state = operations.get(operation);
  if (!state || state.closed) return;
  state.latest = sample(state) ?? state.latest;
}

/** Bounded retirement only. No clock, report construction or freeze occurs
 * here after the final original fence. The private getter builds the copy. */
function raw_finishClaimOperatorMetrics(lifetime, operation) {
  const retained = lifetimes.get(lifetime);
  const state = operations.get(operation);
  if (!retained || !state || state.lifetime !== lifetime || state.closed || retained.active !== operation) return;
  if (state.active.size) {
    incomplete(state);
    for (const token of state.active) intervals.delete(token);
    state.active.clear();
  }
  state.end = state.latest;
  state.closed = true;
  retained.active = null;
  retained.reports.push(state);
  if (retained.reports.length > MAX_REPORTS) retained.reports.shift();
  operations.delete(operation);
}

/** The core operator getter supplies this retained token from its original
 * brand. Copies carry no token, frame, original result or financial authority. */
function raw_claimOperatorMetricsReports(lifetime) {
  const retained = lifetimes.get(lifetime);
  if (!retained) return Object.freeze([]);
  return Object.freeze(retained.reports.map(copyReport));
}


function noteCollectorFailure(lifetime, operation) {
  try {
    const state = operations.get(operation);
    if (state) {
      incomplete(state);
      const owner = lifetimes.get(state.lifetime);
      if (owner) owner.failed = true;
    }
    const owner = lifetimes.get(lifetime);
    if (owner) owner.failed = true;
  } catch { /* Diagnostics never replace a protocol result or exception. */ }
}

export function createClaimOperatorMetricsLifetime() {
  try { return raw_createClaimOperatorMetricsLifetime(); }
  catch { return null; }
}
export function beginClaimOperatorMetrics(lifetime) {
  try { return raw_beginClaimOperatorMetrics(lifetime); }
  catch { noteCollectorFailure(lifetime, null); return null; }
}
export function enterClaimOperatorMetricsPhase(operation, phase, method, round) {
  try { return raw_enterClaimOperatorMetricsPhase(operation, phase, method, round); }
  catch { noteCollectorFailure(null, operation); return null; }
}
export function leaveClaimOperatorMetricsPhase(token) {
  let operation;
  try {
    operation = intervals.get(token)?.operation;
    raw_leaveClaimOperatorMetricsPhase(token);
    return true;
  } catch {
    noteCollectorFailure(null, operation);
    return false;
  }
}
export function checkpointClaimOperatorMetrics(operation) {
  try { raw_checkpointClaimOperatorMetrics(operation); return true; }
  catch { noteCollectorFailure(null, operation); return false; }
}
export function finishClaimOperatorMetrics(lifetime, operation) {
  try { raw_finishClaimOperatorMetrics(lifetime, operation); return true; }
  catch { noteCollectorFailure(lifetime, operation); return false; }
}
export function claimOperatorMetricsReports(lifetime) {
  try { return raw_claimOperatorMetricsReports(lifetime); }
  catch { noteCollectorFailure(lifetime, null); return Object.freeze([]); }
}
export function claimOperatorMetricsLifetimeIncomplete(lifetime) {
  try { return lifetimes.get(lifetime)?.failed !== false; }
  catch { return true; }
}
