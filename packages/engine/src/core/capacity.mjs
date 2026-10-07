/** Finite M2 storage policy. Not an unlimited observation-availability promise.
 * Each admitted leg retains a conservative lifetime representation allowance,
 * including after refund. Stored leg data/events consume that allowance. Global
 * replay identities are never pruned; exhaustion requires explicit migration.
 */
import { canonical } from '../crypto/privacy.mjs';

export const CAPACITY = Object.freeze({
  plaintextBytes: 1024 * 1024, nodes: 100_000,
  legBytes: 16 * 1024, legNodes: 512,
  operationBytes: 4 * 1024, operationNodes: 128,
  globalBytes: 64 * 1024, globalNodes: 4096,
  observationBytes: 4096, receiptBytes: 2048,
  closureBytes: 1024, closureNodes: 32,
  firstObservationBytes: 8192, firstObservationNodes: 256,
});

function failure(code, message) { return Object.assign(new Error(message), { code }); }
function measure(value) {
  let encoded;
  try { encoded = canonical(value); }
  catch (error) { throw failure('STORAGE_CANONICAL_CAPACITY', `Storage payload rejected: ${error.message}`); }
  let nodes = 0;
  const visit = (item) => {
    nodes++;
    if (item && typeof item === 'object') for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return { bytes: Buffer.byteLength(encoded), nodes };
}

export function capacityReport(data, revision = 0, options = {}) {
  const actual = measure({ revision, data });
  const state = data.state;
  if (!state || !Array.isArray(state.operations) || !Array.isArray(state.events)) throw failure('STORAGE_INVALID_STATE', 'Capacity policy requires a wallet state');
  const problems = [];
  let reservedBytes = 0, reservedNodes = 0;
  const allocate = (value, byteLimit, nodeLimit, label, code, availableBytes = byteLimit, availableNodes = nodeLimit) => {
    const usage = measure(value);
    if (usage.bytes > availableBytes || usage.nodes > availableNodes) problems.push({ code, label, ...usage, byteLimit: availableBytes, nodeLimit: availableNodes });
    reservedBytes += Math.max(0, byteLimit - usage.bytes);
    reservedNodes += Math.max(0, nodeLimit - usage.nodes);
  };
  for (const operation of state.operations) {
    const nonterminal = !['SETTLED', 'REFUNDED', 'DISPUTED'].includes(operation.status);
    const operationEvents = state.events.filter((event) => event.hash === operation.hash);
    const knownLegs = new Set(operation.legs.map((leg) => leg.id));
    const unassignedEvents = operationEvents.filter((event) => !event.legId || !knownLegs.has(event.legId));
    const metadata = Object.fromEntries(Object.entries(operation).filter(([key]) => !['graph', 'authorization', 'legs'].includes(key)));
    allocate({ metadata, events: unassignedEvents }, CAPACITY.operationBytes, CAPACITY.operationNodes, operation.hash, 'STORAGE_OPERATION_BUDGET',
      CAPACITY.operationBytes - (nonterminal ? CAPACITY.closureBytes : 0), CAPACITY.operationNodes - (nonterminal ? CAPACITY.closureNodes : 0));
    for (const leg of operation.legs) {
      // Receipt size is bounded independently before consuming completion reserve.
      for (const observation of leg.observations ?? []) {
        if (measure(observation).bytes > CAPACITY.observationBytes) problems.push({ code: 'STORAGE_OBSERVATION_BUDGET', label: `${operation.hash}:${leg.id}` });
        if (measure(observation.receipt).bytes > CAPACITY.receiptBytes) problems.push({ code: 'STORAGE_RECEIPT_BUDGET', label: `${operation.hash}:${leg.id}` });
      }
      const unseen = !(leg.observations?.length);
      // Submission/ambiguity metadata cannot consume the first observation's
      // allowance. Already observed nonterminal legs retain closure space too.
      const marginBytes = unseen ? CAPACITY.firstObservationBytes : nonterminal ? CAPACITY.closureBytes : 0;
      const marginNodes = unseen ? CAPACITY.firstObservationNodes : nonterminal ? CAPACITY.closureNodes : 0;
      allocate({ leg, events: operationEvents.filter((event) => event.legId === leg.id) }, CAPACITY.legBytes, CAPACITY.legNodes, `${operation.hash}:${leg.id}`, 'STORAGE_LEG_BUDGET',
        CAPACITY.legBytes - marginBytes, CAPACITY.legNodes - marginNodes);
    }
  }
  const graphHashes = new Set(state.operations.map((operation) => operation.hash));
  const globalData = { revision, data: { ...data, state: { ...state, operations: [], events: state.events.filter((event) => !graphHashes.has(event.hash)) } } };
  allocate(globalData, CAPACITY.globalBytes, CAPACITY.globalNodes, 'global/replay-state', 'STORAGE_GLOBAL_BUDGET');
  const projectedBytes = actual.bytes + reservedBytes;
  const projectedNodes = actual.nodes + reservedNodes;
  if (projectedBytes > CAPACITY.plaintextBytes || projectedNodes > CAPACITY.nodes) problems.push({ code: 'STORAGE_COMPLETION_HEADROOM', label: 'complete-record' });
  return { version: 1, actualBytes: actual.bytes, actualNodes: actual.nodes, reservedBytes, reservedNodes, projectedBytes, projectedNodes, limitBytes: CAPACITY.plaintextBytes, limitNodes: CAPACITY.nodes, admissible: problems.length === 0, problems };
}

export function assertCapacity(data, revision = 0, options = {}) {
  const report = capacityReport(data, revision, options);
  if (!report.admissible) throw failure(report.problems[0].code, 'Insufficient bounded storage capacity; preserve existing obligations and migrate or reconcile before new work');
  return report;
}
