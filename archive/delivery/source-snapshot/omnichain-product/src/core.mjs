import { randomBytes } from 'node:crypto';
import { canonical, digest, verify } from './privacy.mjs';
import { validateInvalidation } from './invalidation.mjs';

export const DOMAIN = 'paeg:simulation:v1';
export const ASSETS = Object.freeze({ ethereum: 'ethereum:local:wei', solana: 'solana:local:lamport', bitcoin: 'bitcoin:regtest:satoshi' });
export const PAYMENT = 'local:simulation:credit';
export const STATE_VERSION = 2;
export const VERIFICATION_POLICY = Object.freeze({ id: 'paeg:simulation-attestation', version: 1, domain: DOMAIN, evidenceType: 'simulation-attestation', finality: 'simulated-final' });
const MAX = (1n << 128n) - 1n;
const TERMINAL = new Set(['SETTLED', 'REFUNDED', 'DISPUTED']);
export function ensure(condition, code) { if (!condition) throw new Error(code); }
export function amount(value) {
  ensure(typeof value === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(value), 'INVALID_AMOUNT');
  const n = BigInt(value); ensure(n <= MAX, 'AMOUNT_OVERFLOW'); return n;
}
function integer(v) { ensure(Number.isSafeInteger(v) && v >= 0, 'INVALID_TIME'); return v; }
function text(v, max = 128) { ensure(typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9:._-]+$/.test(v), 'INVALID_IDENTIFIER'); }
function fields(v, names) {
  ensure(v && Object.getPrototypeOf(v) === Object.prototype, 'INVALID_OBJECT');
  ensure(Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k)), 'INVALID_FIELDS');
}
function change(obj, key, n) { obj[key] = (amount(obj[key]) + n).toString(); amount(obj[key]); }
function byAsset(items, asset) { const item = items.find(x => x.asset === asset); ensure(item, 'UNKNOWN_ASSET'); return item; }
export function graphHash(graph) { return digest('PAEG/graph/1', graph); }
export function validateGraph(graph, now) {
  fields(graph, ['version', 'domain', 'id', 'expiresAt', 'guarantee', 'payment', 'legs']);
  ensure(graph.version === 1 && graph.domain === DOMAIN, 'UNSUPPORTED_DOMAIN');
  ensure(/^[0-9a-f]{64}$/.test(graph.id), 'INVALID_GRAPH_ID');
  integer(now); integer(graph.expiresAt);
  ensure(graph.expiresAt > now && graph.expiresAt - now <= 3600000, 'INVALID_DEADLINE');
  ensure(graph.guarantee === 'conditional-payment', 'UNSUPPORTED_GUARANTEE');
  fields(graph.payment, ['asset', 'amount', 'fee', 'solver']);
  ensure(graph.payment.asset === PAYMENT, 'UNSUPPORTED_PAYMENT_ASSET');
  ensure(amount(graph.payment.amount) > 0n && amount(graph.payment.fee) <= amount(graph.payment.amount), 'INVALID_PAYMENT');
  text(graph.payment.solver);
  ensure(Array.isArray(graph.legs) && graph.legs.length > 0 && graph.legs.length <= 32, 'INVALID_LEG_COUNT');
  const ids = new Set();
  for (const leg of graph.legs) {
    fields(leg, ['id', 'chain', 'asset', 'amount', 'maxFee', 'recipient', 'executor', 'dependsOn']);
    text(leg.id); ensure(!ids.has(leg.id), 'DUPLICATE_LEG'); ids.add(leg.id);
    ensure(Object.hasOwn(ASSETS, leg.chain) && ASSETS[leg.chain] === leg.asset, 'UNSUPPORTED_CHAIN_ASSET');
    ensure(amount(leg.amount) > 0n, 'ZERO_AMOUNT'); amount(leg.maxFee); text(leg.recipient); text(leg.executor);
    // Executor assignment is separate from the capital provider and payment recipient.
    ensure(Array.isArray(leg.dependsOn) && leg.dependsOn.length <= 31 && new Set(leg.dependsOn).size === leg.dependsOn.length, 'INVALID_DEPENDENCIES');
  }
  const visited = new Set(), active = new Set();
  function visit(id) {
    ensure(ids.has(id), 'UNKNOWN_DEPENDENCY'); ensure(!active.has(id), 'CYCLIC_GRAPH'); if (visited.has(id)) return;
    active.add(id); const leg = graph.legs.find(x => x.id === id);
    for (const dependency of leg.dependsOn) visit(dependency);
    active.delete(id); visited.add(id);
  }
  for (const leg of graph.legs) visit(leg.id);
  return graph;
}

export function createState(now = Date.now()) {
  integer(now);
  return {
    version: STATE_VERSION, domain: DOMAIN, environment: 'simulation', lastNow: now,
    assets: [PAYMENT, ...Object.values(ASSETS)].map(asset => ({ asset, initial: asset === PAYMENT ? '10000' : '0', received: '0', available: asset === PAYMENT ? '10000' : '0', reserved: '0', committed: '0', spent: '0' })),
    positions: [], permissions: [{ id: 'demo-payment', asset: PAYMENT, maxPerGraph: '2000', remaining: '10000', expiresAt: now + 86400000 }],
    solvers: [{ id: 'reference-1', inventoryStatus: 'RECONCILED', inventory: Object.values(ASSETS).map(asset => ({ asset, initial: '10000', available: '10000', reserved: '0', quarantined: '0', spent: '0' })), paid: '0' }],
    executors: [{ id: 'reference-a', chains: ['ethereum', 'bitcoin'] }, { id: 'reference-b', chains: ['solana'] }],
    operations: [], consumedResources: [], events: []
  };
}

export function assertState(state) {
  ensure(state.version === STATE_VERSION && state.domain === DOMAIN && state.environment === 'simulation', 'INVALID_STATE_DOMAIN');
  integer(state.lastNow);
  ensure(new Set(state.operations.map(o => o.hash)).size === state.operations.length, 'DUPLICATE_OPERATION');
  ensure(new Set(state.operations.map(o => o.graph.id)).size === state.operations.length, 'DUPLICATE_GRAPH_ID');
  ensure(new Set(state.consumedResources).size === state.consumedResources.length, 'DUPLICATE_RESOURCE');
  const observations = [];
  for (const op of state.operations) {
    ensure(op.hash === graphHash(op.graph), 'GRAPH_MUTATION');
    ensure(op.authorization?.canonicalGraph === canonical(op.graph) && verify(op.graph, op.authorization.signature, op.authorization.signerPublicKey), 'INVALID_RETAINED_AUTHORIZATION');
    ensure(op.authorization.provenance?.source === 'trusted-local-configuration' && canonical(op.authorization.provenance.policy) === canonical(VERIFICATION_POLICY), 'INVALID_RETAINED_POLICY');
    ensure(op.authorization.provenance.signerFingerprint === digest('PAEG/local-authority/1', op.authorization.signerPublicKey) && op.authorization.provenance.verifierFingerprint === digest('PAEG/local-verifier/1', op.authorization.provenance.verifierPublicKey), 'AUTHORITY_PROVENANCE_MISMATCH');
    for (const leg of op.legs) {
      ensure(Array.isArray(leg.observations) && leg.dispatch && ['UNSUBMITTED', 'INTENT_RECORDED', 'SUBMITTED', 'AMBIGUOUS', 'CONFIRMED'].includes(leg.dispatch.state), 'INVALID_LEG_HISTORY');
      if (amount(leg.quarantined) > 0n) ensure(['INTENT_RECORDED', 'SUBMITTED', 'AMBIGUOUS'].includes(leg.dispatch.state), 'QUARANTINE_STATE_MISMATCH');
      for (const observation of leg.observations) {
        ensure(observation.resource === resourceKey(observation.receipt.payload), 'RESOURCE_MUTATION');
        ensure(['CANONICAL', 'REORGED'].includes(observation.validity), 'INVALID_OBSERVATION');
        if (observation.invalidation) {
          const proof = validateInvalidation(state, op.hash, observation.invalidation, state.lastNow);
          ensure(observation.validity === 'REORGED' && proof.resource === observation.resource && proof.legId === leg.id && proof.evidenceDigest === observation.invalidationDigest, 'INVALID_RETAINED_INVALIDATION');
        }
        if (observation.reconciliation) {
          const reconciliation = observation.reconciliation;
          const { payload } = validateSubmissionAcknowledgement(op, reconciliation.acknowledgement, state.lastNow);
          ensure(acknowledgedResource(op, payload) === observation.resource && reconciliation.acknowledgementDigest === digest('PAEG/submission-ack/1', reconciliation.acknowledgement), 'INVALID_RETAINED_RECONCILIATION');
          ensure(['RESOLVED', 'INSUFFICIENT_CAPITAL'].includes(reconciliation.outcome), 'INVALID_RECONCILIATION_OUTCOME');
          if (reconciliation.outcome === 'RESOLVED') ensure(observation.inventoryAccounting === 'ACCOUNTED' && leg.dispatch.state === 'CONFIRMED' && leg.dispatch.confirmedResource === observation.resource && leg.quarantined === '0', 'RECONCILIATION_ACCOUNTING_MISMATCH');
        }
        observations.push(observation);
      }
      if (leg.dispatch.acknowledgement) validateSubmissionAcknowledgement(op, leg.dispatch.acknowledgement, state.lastNow);
      if (leg.dispatch.intent?.expectedEffect) {
        ensure(leg.dispatch.txRef === leg.dispatch.intent.expectedEffect.txRef && leg.dispatch.effectIndex === leg.dispatch.intent.expectedEffect.effectIndex, 'DISPATCH_IDENTITY_MUTATION');
      }
      const admitted = leg.observations.filter(o => o.admission === 'FULFILLMENT');
      ensure(admitted.length <= 1, 'DUPLICATE_LEG_ADMISSION');
      ensure(admitted.length === (leg.receipt ? 1 : 0), 'ADMISSION_RECEIPT_MISMATCH');
      if (admitted.length) ensure(admitted[0].resource === leg.resource && canonical(admitted[0].receipt) === canonical(leg.receipt), 'ADMISSION_RECEIPT_MISMATCH');
      if (leg.status === 'FINAL') ensure(admitted[0]?.validity === 'CANONICAL', 'INVALID_FINAL_ADMISSION');
    }
    if (['SETTLED', 'DISPUTED'].includes(op.status)) ensure(op.paymentState === 'spent', 'PAYMENT_STATE_MISMATCH');
    else if (op.status === 'REFUNDED') ensure(op.paymentState === 'refunded', 'PAYMENT_STATE_MISMATCH');
    else ensure(['reserved', 'committed'].includes(op.paymentState), 'PAYMENT_STATE_MISMATCH');
  }
  ensure(observations.length === state.consumedResources.length && new Set(observations.map(o => o.resource)).size === observations.length && observations.every(o => state.consumedResources.includes(o.resource)), 'OBSERVATION_RESOURCE_CONSERVATION');
  for (const a of state.assets) {
    ensure(amount(a.available) + amount(a.reserved) + amount(a.committed) + amount(a.spent) === amount(a.initial) + amount(a.received), 'BALANCE_CONSERVATION');
    const credited = observations.filter(o => o.receipt.payload.asset === a.asset && o.validity === 'CANONICAL').reduce((n, o) => n + amount(o.walletCredit), 0n);
    ensure(amount(a.received) === credited, 'OBSERVED_CREDIT_CONSERVATION');
  }
  const local = byAsset(state.assets, PAYMENT);
  for (const bucket of ['reserved', 'committed']) {
    const total = state.operations.filter(o => o.paymentState === bucket).reduce((n,o) => n + amount(o.graph.payment.amount), 0n);
    ensure(amount(local[bucket]) === total, 'RESERVATION_CONSERVATION');
  }
  for (const solver of state.solvers) {
    const paid = state.operations.filter(o => o.graph.payment.solver === solver.id && o.paymentState === 'spent').reduce((n,o) => n + amount(o.graph.payment.amount), 0n);
    ensure(amount(solver.paid) === paid, 'PAYMENT_CONSERVATION');
    for (const a of solver.inventory) {
      ensure(amount(a.available) + amount(a.reserved) + amount(a.quarantined) + amount(a.spent) === amount(a.initial), 'SOLVER_CONSERVATION');
      const held = state.operations.filter(o => o.graph.payment.solver === solver.id).flatMap(o => o.legs).filter(l => l.asset === a.asset).reduce((n,l) => n + amount(l.allocation), 0n);
      ensure(held === amount(a.reserved), 'INVENTORY_RESERVATION_CONSERVATION');
      const quarantine = state.operations.filter(o => o.graph.payment.solver === solver.id).flatMap(o => o.legs).filter(l => l.asset === a.asset).reduce((n,l) => n + amount(l.quarantined), 0n);
      ensure(quarantine === amount(a.quarantined), 'INVENTORY_QUARANTINE_CONSERVATION');
      const observedCost = state.operations.filter(o => o.graph.payment.solver === solver.id).flatMap(o => o.legs).flatMap(l => l.observations)
        .filter(o => o.receipt.payload.asset === a.asset && o.inventoryAccounting === 'ACCOUNTED')
        .reduce((n, o) => n + amount(o.receipt.payload.amount) + amount(o.receipt.payload.fee), 0n);
      ensure(amount(a.spent) === observedCost, 'INVENTORY_COST_CONSERVATION');
    }
  }
  return true;
}

function releaseInventory(state, op) {
  const solver = state.solvers.find(s => s.id === op.graph.payment.solver);
  for (const leg of op.legs) {
    const held = amount(leg.allocation); const inventory = byAsset(solver.inventory, leg.asset);
    change(inventory, 'reserved', -held); change(inventory, 'available', held); leg.allocation = '0';
    // A persisted dispatch intent may already have reached the network. A local
    // refund never proves its transaction absent; quarantined funds stay held.
  }
}
// Identity is graph-independent. v1 resources are indivisible; splitting is not supported.
export function resourceKey(receipt) {
  return digest('PAEG/consumed-resource/1', { domain: receipt.domain, chain: receipt.chain, txRef: receipt.txRef, effectIndex: receipt.effectIndex });
}
function validateReceipt(op, signed, trust, now) {
  fields(signed, ['payload', 'signature']); const r = signed.payload;
  fields(r, ['version', 'domain', 'evidenceType', 'graphHash', 'legId', 'chain', 'asset', 'recipient', 'amount', 'fee', 'executor', 'txRef', 'effectIndex', 'blockHash', 'finality', 'observedAt']);
  ensure(r.version === 1 && r.domain === DOMAIN && r.evidenceType === 'simulation-attestation', 'UNSUPPORTED_EVIDENCE');
  ensure(verify(r, signed.signature, op.authorization.provenance.verifierPublicKey), 'INVALID_ATTESTATION');
  ensure(r.graphHash === op.hash, 'WRONG_GRAPH');
  const leg = op.graph.legs.find(x => x.id === r.legId); ensure(leg, 'UNKNOWN_LEG');
  // Authentic conclusions can describe an execution mistake. Retain those facts
  // separately from deciding whether they fulfill the authorized leg.
  ensure(Object.hasOwn(ASSETS, r.chain) && ASSETS[r.chain] === r.asset, 'UNSUPPORTED_OBSERVED_ASSET');
  amount(r.amount); amount(r.fee); text(r.recipient); text(r.executor);
  const mismatches = ['chain', 'asset', 'recipient', 'amount', 'executor'].filter(name => r[name] !== leg[name]);
  if (amount(r.fee) > amount(leg.maxFee)) mismatches.push('fee');
  ensure(r.finality === 'simulated-final', 'INSUFFICIENT_FINALITY');
  integer(r.observedAt); ensure(r.observedAt <= now, 'FUTURE_RECEIPT'); ensure(r.observedAt >= op.openedAt, 'PREEXISTING_RECEIPT');
  text(r.txRef); text(r.blockHash); integer(r.effectIndex);
  ensure(r.effectIndex <= 65535, 'INVALID_EFFECT_INDEX');
  return { receipt: r, leg, record: op.legs.find(x => x.id === leg.id), mismatches };
}

function observeCost(solver, record, receipt) {
  const inventory = byAsset(solver.inventory, receipt.asset), cost = amount(receipt.amount) + amount(receipt.fee);
  // Only the exact recorded transaction resolves an uncertain dispatch. A
  // different effect for the same leg must not silently release that exposure.
  const sameAsset = record.asset === receipt.asset;
  const matchesDispatch = sameAsset && record.dispatch.txRef === receipt.txRef && (record.dispatch.effectIndex ?? 0) === receipt.effectIndex &&
    receipt.observedAt >= (record.dispatch.intent?.recordedAt ?? 0) && ['INTENT_RECORDED', 'SUBMITTED', 'AMBIGUOUS'].includes(record.dispatch.state);
  const reserved = sameAsset ? amount(record.allocation) : 0n, quarantined = matchesDispatch ? amount(record.quarantined) : 0n;
  if (amount(inventory.available) + reserved + quarantined < cost) {
    solver.inventoryStatus = 'UNRECONCILED';
    return 'UNRECONCILED'; // Preserve the receipt; no negative balance or invented capital.
  }
  change(inventory, 'reserved', -reserved); if (sameAsset) record.allocation = '0';
  if (matchesDispatch) {
    change(inventory, 'quarantined', -quarantined); record.quarantined = '0';
    record.dispatch.state = 'CONFIRMED'; record.dispatch.confirmedResource = resourceKey(receipt);
  }
  change(inventory, 'available', reserved + quarantined - cost); change(inventory, 'spent', cost);
  return 'ACCOUNTED';
}

function effectSelector(value) { integer(value); ensure(value <= 65535, 'INVALID_EFFECT_INDEX'); return value; }
function requireDispatchIdentity(record, txRef, effectIndex) {
  text(txRef); effectSelector(effectIndex);
  if (record.dispatch.txRef) {
    ensure(record.dispatch.txRef === txRef && (record.dispatch.effectIndex ?? 0) === effectIndex, 'DISPATCH_IDENTITY_CONFLICT');
  }
}
function acknowledgedResource(op, payload) {
  const leg = op.graph.legs.find(l => l.id === payload.legId);
  return resourceKey({ domain: op.graph.domain, chain: leg.chain, txRef: payload.txRef, effectIndex: payload.effectIndex });
}
function validateSubmissionAcknowledgement(op, signed, now) {
  canonical(signed); fields(signed, ['payload', 'signature']); const payload = signed.payload;
  fields(payload, ['version', 'domain', 'evidenceType', 'graphHash', 'legId', 'dispatchToken', 'txRef', 'effectIndex', 'acknowledgedAt']);
  ensure(payload.version === 1 && payload.domain === DOMAIN && payload.evidenceType === 'simulation-submission-ack', 'UNSUPPORTED_SUBMISSION_ACK');
  ensure(payload.graphHash === op.hash, 'ACK_WRONG_GRAPH');
  const record = op.legs.find(l => l.id === payload.legId); ensure(record?.dispatch.intent, 'DISPATCH_INTENT_REQUIRED');
  ensure(payload.dispatchToken === record.dispatchToken && payload.dispatchToken === record.dispatch.intent.envelope.dispatchToken, 'ACK_WRONG_ATTEMPT');
  requireDispatchIdentity(record, payload.txRef, payload.effectIndex);
  integer(payload.acknowledgedAt); ensure(payload.acknowledgedAt >= record.dispatch.intent.recordedAt && payload.acknowledgedAt <= now, 'INVALID_ACK_TIME');
  ensure(verify(payload, signed.signature, op.authorization.provenance.verifierPublicKey), 'INVALID_SUBMISSION_ACK_SIGNATURE');
  return { payload, record };
}
function selectedObservation(op, record, txRef, effectIndex) {
  const resource = acknowledgedResource(op, { legId: record.id, txRef, effectIndex });
  return record.observations.find(o => o.resource === resource);
}
function reconcileObservedDispatch(state, op, record, observation, signed, now) {
  ensure(observation, 'ACK_OBSERVATION_REQUIRED');
  const { receipt } = validateReceipt(op, observation.receipt, {}, now);
  ensure(receipt.asset === record.asset && receipt.observedAt >= record.dispatch.intent.recordedAt, 'ACK_OBSERVATION_NOT_FROM_ATTEMPT');
  if (record.dispatch.state === 'CONFIRMED') {
    ensure(record.dispatch.confirmedResource === observation.resource || (!record.dispatch.confirmedResource && record.quarantined === '0'), 'DISPATCH_IDENTITY_CONFLICT');
    return false; // A historical ACK replay cannot re-credit even an effect invalidated later.
  }
  ensure(observation.validity === 'CANONICAL', 'ACK_OBSERVATION_REORGED');
  const solver = state.solvers.find(s => s.id === op.graph.payment.solver);
  const inventory = byAsset(solver.inventory, record.asset), held = amount(record.quarantined), cost = amount(receipt.amount) + amount(receipt.fee);
  ensure(held > 0n, 'NO_QUARANTINED_ATTEMPT');
  const previous = observation.reconciliation;
  const retainedAck = previous?.acknowledgement ?? structuredClone(signed);
  const base = { acknowledgement: retainedAck, acknowledgementDigest: digest('PAEG/submission-ack/1', retainedAck), firstAttemptAt: previous?.firstAttemptAt ?? now };
  if (observation.inventoryAccounting === 'UNRECONCILED' && amount(inventory.available) + held < cost) {
    const context = digest('PAEG/reconciliation-capital/1', { available: inventory.available, quarantined: held.toString(), cost: cost.toString() });
    if (previous?.outcome === 'INSUFFICIENT_CAPITAL' && previous.capitalContext === context) return false;
    observation.reconciliation = { ...base, outcome: 'INSUFFICIENT_CAPITAL', capitalContext: context };
    solver.inventoryStatus = 'UNRECONCILED';
    return true;
  }
  const alreadyCharged = observation.inventoryAccounting === 'ACCOUNTED';
  ensure(alreadyCharged || observation.inventoryAccounting === 'UNRECONCILED', 'INVALID_INVENTORY_ACCOUNTING');
  change(inventory, 'quarantined', -held); record.quarantined = '0';
  change(inventory, 'available', held - (alreadyCharged ? 0n : cost));
  if (!alreadyCharged) change(inventory, 'spent', cost);
  observation.inventoryAccounting = 'ACCOUNTED';
  observation.reconciliation = { ...base, outcome: 'RESOLVED', completedAt: now, chargedCost: alreadyCharged ? '0' : cost.toString(), releasedQuarantine: held.toString() };
  record.dispatch.state = 'CONFIRMED'; record.dispatch.confirmedResource = observation.resource;
  if (!record.receipt) record.status = 'OBSERVED_RECONCILED'; // Accounting repair never becomes a fulfillment admission.
  const unresolved = state.operations.filter(o => o.graph.payment.solver === solver.id).flatMap(o => o.legs).flatMap(l => l.observations).some(o => o.inventoryAccounting === 'UNRECONCILED');
  solver.inventoryStatus = unresolved ? 'UNRECONCILED' : 'RECONCILED';
  return true;
}

/** Pure transition: clone-on-write means any rejection leaves original state unchanged.
 * Authorization and verifier public keys come from trusted local configuration, not the command.
 * This reducer is only a synthetic model; durable serialization belongs to WalletSDK/Vault.
 */
export function transition(previous, command, { now = Date.now(), ...trust }) {
  assertState(previous); integer(now); ensure(now >= previous.lastNow, 'CLOCK_ROLLBACK');
  const state = structuredClone(previous); state.lastNow = now;
  ensure(command && typeof command.type === 'string', 'INVALID_COMMAND');
  const local = byAsset(state.assets, PAYMENT);
  let op;
  if (command.type === 'open') {
    validateGraph(command.graph, now);
    ensure(verify(command.graph, command.signature, trust.userPublicKey), 'INVALID_AUTHORIZATION');
    const graph = structuredClone(command.graph), hash = graphHash(graph);
    ensure(!state.operations.some(o => o.hash === hash || o.graph.id === graph.id), 'GRAPH_REPLAY');
    const permission = state.permissions.find(p => p.id === command.permission);
    ensure(permission && permission.expiresAt >= graph.expiresAt && permission.asset === graph.payment.asset, 'PERMISSION_DENIED');
    const total = amount(graph.payment.amount);
    ensure(total <= amount(permission.maxPerGraph) && total <= amount(permission.remaining), 'PERMISSION_LIMIT');
    ensure(amount(local.available) >= total, 'INSUFFICIENT_BALANCE');
    const solver = state.solvers.find(s => s.id === graph.payment.solver); ensure(solver, 'UNKNOWN_SOLVER');
    ensure(solver.inventoryStatus === 'RECONCILED', 'SOLVER_INVENTORY_UNRECONCILED');
    for (const leg of graph.legs) ensure(state.executors.some(e => e.id === leg.executor && e.chains.includes(leg.chain)), 'UNCONFIGURED_EXECUTOR');
    const needs = new Map();
    for (const leg of graph.legs) needs.set(leg.asset, (needs.get(leg.asset) ?? 0n) + amount(leg.amount) + amount(leg.maxFee));
    for (const [asset, needed] of needs) ensure(amount(byAsset(solver.inventory, asset).available) >= needed, 'INSUFFICIENT_SOLVER_INVENTORY');
    for (const [asset, needed] of needs) { const a = byAsset(solver.inventory, asset); change(a, 'available', -needed); change(a, 'reserved', needed); }
    change(local, 'available', -total); change(local, 'reserved', total); change(permission, 'remaining', -total);
    ensure(typeof trust.verifierPublicKey === 'string' && trust.verifierPublicKey.startsWith('-----BEGIN PUBLIC KEY-----') && trust.verifierPublicKey.length <= 4096, 'INVALID_VERIFIER_CONFIGURATION');
    // Keep the original bytes' canonical representation and original signature.
    // Provenance records the trusted acceptance configuration; it is NOT a claim
    // that the user's graph signature signed additional policy fields.
    const authorization = { version: 1, canonicalGraph: canonical(graph), signature: command.signature,
      signerPublicKey: trust.userPublicKey, acceptedAt: now,
      provenance: { source: 'trusted-local-configuration', permission: permission.id,
        signerFingerprint: digest('PAEG/local-authority/1', trust.userPublicKey),
        verifierPublicKey: trust.verifierPublicKey, verifierFingerprint: digest('PAEG/local-verifier/1', trust.verifierPublicKey), policy: structuredClone(VERIFICATION_POLICY) } };
    op = { graph, hash, authorization, status: 'RESERVED', paymentState: 'reserved', permission: permission.id, openedAt: now, settlementAt: null,
      legs: graph.legs.map(l => ({ id: l.id, asset: l.asset, status: 'WAITING', allocation: (amount(l.amount) + amount(l.maxFee)).toString(), quarantined: '0',
        dispatchToken: randomBytes(32).toString('hex'), dispatch: { state: 'UNSUBMITTED', intent: null, txRef: null, effectIndex: null }, observations: [], receipt: null, resource: null })), lateEffects: [], failure: null };
    state.operations.push(op);
  } else {
    op = state.operations.find(o => o.hash === command.hash); ensure(op, 'UNKNOWN_GRAPH');
    if (command.type === 'prepareDispatch') {
      const view = executorView(state, op.hash, command.legId);
      const record = op.legs.find(l => l.id === command.legId);
      const expectedEffect = command.txRef === undefined ? null : { txRef: command.txRef, effectIndex: effectSelector(command.effectIndex ?? 0) };
      if (expectedEffect) text(expectedEffect.txRef);
      else ensure(command.effectIndex === undefined, 'TXREF_REQUIRED_FOR_SELECTOR');
      const inventory = byAsset(state.solvers.find(s => s.id === op.graph.payment.solver).inventory, record.asset);
      const held = amount(record.allocation);
      ensure(held > 0n && record.dispatch.state === 'UNSUBMITTED', 'ALREADY_DISPATCHED');
      change(inventory, 'reserved', -held); change(inventory, 'quarantined', held);
      record.allocation = '0'; record.quarantined = held.toString(); record.status = 'INTENT_RECORDED';
      record.dispatch = { state: 'INTENT_RECORDED', txRef: expectedEffect?.txRef ?? null, effectIndex: expectedEffect?.effectIndex ?? null,
        intent: { version: 1, recordedAt: now, graphHash: op.hash, legId: record.id,
          authorizationDigest: digest('PAEG/authorization-record/1', op.authorization), expectedEffect, envelope: view } };
      if (op.paymentState === 'reserved') { change(local, 'reserved', -amount(op.graph.payment.amount)); change(local, 'committed', amount(op.graph.payment.amount)); op.paymentState = 'committed'; }
      op.status = 'EXECUTING';
    } else if (command.type === 'markSubmitted') {
      const record = op.legs.find(l => l.id === command.legId); ensure(record?.dispatch.intent, 'DISPATCH_INTENT_REQUIRED');
      const effectIndex = command.effectIndex ?? record.dispatch.effectIndex ?? 0;
      requireDispatchIdentity(record, command.txRef, effectIndex);
      if (command.acknowledgement) {
        const { payload } = validateSubmissionAcknowledgement(op, command.acknowledgement, now);
        ensure(payload.legId === record.id && payload.txRef === command.txRef && payload.effectIndex === effectIndex, 'ACK_COMMAND_MISMATCH');
      }
      if (record.dispatch.state === 'CONFIRMED') return state; // Exact late ACK is an idempotent acknowledgement, never another effect.
      ensure(['INTENT_RECORDED', 'SUBMITTED', 'AMBIGUOUS'].includes(record.dispatch.state), 'INVALID_DISPATCH_STATE');
      const observation = selectedObservation(op, record, command.txRef, effectIndex);
      if (observation) ensure(command.acknowledgement, 'AUTHENTICATED_ACK_REQUIRED');
      if (!observation && record.dispatch.state === 'SUBMITTED' && (!command.acknowledgement || record.dispatch.acknowledgement)) return state;
      // A delayed acknowledgement is evidence about an existing attempt, not
      // authorization to send after expiry. It cannot revive the payment state.
      record.dispatch.state = 'SUBMITTED'; record.dispatch.txRef = command.txRef; record.dispatch.effectIndex = effectIndex; record.dispatch.submittedAt ??= now;
      if (command.acknowledgement && !record.dispatch.acknowledgement) record.dispatch.acknowledgement = structuredClone(command.acknowledgement);
      if (observation) {
        if (!reconcileObservedDispatch(state, op, record, observation, command.acknowledgement, now)) return state;
      } else if (!record.receipt) record.status = 'SUBMITTED';
    } else if (command.type === 'reconcileDispatch') {
      const { payload, record } = validateSubmissionAcknowledgement(op, command.acknowledgement, now);
      const observation = selectedObservation(op, record, payload.txRef, payload.effectIndex);
      ensure(observation, 'ACK_OBSERVATION_REQUIRED');
      if (record.dispatch.state !== 'CONFIRMED') {
        record.dispatch.txRef = payload.txRef; record.dispatch.effectIndex = payload.effectIndex; record.dispatch.state = 'SUBMITTED'; record.dispatch.submittedAt ??= now;
        record.dispatch.acknowledgement ??= structuredClone(command.acknowledgement);
      }
      if (!reconcileObservedDispatch(state, op, record, observation, command.acknowledgement, now)) return state;
    } else if (command.type === 'markAmbiguous') {
      const record = op.legs.find(l => l.id === command.legId); ensure(record?.dispatch.intent, 'DISPATCH_INTENT_REQUIRED');
      ensure(['INTENT_RECORDED', 'SUBMITTED'].includes(record.dispatch.state), 'INVALID_DISPATCH_STATE'); text(command.reason, 80);
      record.dispatch.state = 'AMBIGUOUS'; record.dispatch.reason = command.reason; record.dispatch.ambiguousAt = now;
      if (!record.receipt) record.status = 'AMBIGUOUS';
    } else if (command.type === 'receipt') {
      const { receipt: r, leg, record, mismatches } = validateReceipt(op, command.receipt, trust, now);
      const resource = resourceKey(r);
      ensure(!state.consumedResources.includes(resource), 'RESOURCE_REPLAY');
      const dependenciesFinal = leg.dependsOn.every(id => op.legs.find(l => l.id === id)?.status === 'FINAL');
      const solver = state.solvers.find(s => s.id === op.graph.payment.solver);
      const inventoryAccounting = observeCost(solver, record, r);
      const late = TERMINAL.has(op.status) || op.status === 'RECOVERY_PENDING' || now >= op.graph.expiresAt || r.observedAt >= op.graph.expiresAt;
      const admission = record.receipt ? 'ADDITIONAL_EFFECT' : late ? 'LATE' : mismatches.length ? 'FULFILLMENT_MISMATCH' : !dependenciesFinal ? 'DEPENDENCY_VIOLATION' : inventoryAccounting !== 'ACCOUNTED' ? 'UNRECONCILED' : 'FULFILLMENT';
      const walletCredit = r.chain === leg.chain && r.asset === leg.asset && r.recipient === leg.recipient ? r.amount : '0';
      record.observations.push({ resource, receipt: structuredClone(command.receipt), recordedAt: now, validity: 'CANONICAL', admission, inventoryAccounting, mismatches, walletCredit });
      if (inventoryAccounting === 'UNRECONCILED') op.failure = 'EXTERNAL_INVENTORY_RECONCILIATION_REQUIRED';
      if (late) op.lateEffects.push(resource);
      if (admission === 'FULFILLMENT') {
        ensure(['RESERVED', 'EXECUTING'].includes(op.status), 'INVALID_OPERATION_STATE');
        if (op.paymentState === 'reserved') { change(local, 'reserved', -amount(op.graph.payment.amount)); change(local, 'committed', amount(op.graph.payment.amount)); op.paymentState = 'committed'; }
        record.status = 'FINAL'; record.receipt = structuredClone(command.receipt); record.resource = resource;
        op.status = op.legs.every(l => l.status === 'FINAL') ? 'FULFILLED' : 'EXECUTING';
      } else if (!record.receipt) {
        record.status = inventoryAccounting === 'UNRECONCILED' ? 'LATE_UNRECONCILED' : late ? 'LATE' : 'OBSERVED_NOT_ADMITTED';
        if (!TERMINAL.has(op.status)) op.status = 'RECOVERY_PENDING';
      }
      const output = byAsset(state.assets, r.asset); change(output, 'received', amount(walletCredit)); change(output, 'available', amount(walletCredit));
      state.consumedResources.push(resource);
    } else if (command.type === 'settle') {
      ensure(now < op.graph.expiresAt, 'EXPIRED');
      ensure(op.status === 'FULFILLED' && op.legs.every(l => l.status === 'FINAL'), 'INCOMPLETE_FULFILLMENT');
      for (const leg of op.legs) ensure(validateReceipt(op, leg.receipt, trust, now).mismatches.length === 0, 'WRONG_FULFILLMENT');
      const total = amount(op.graph.payment.amount); change(local, op.paymentState, -total); change(local, 'spent', total);
      const solver = state.solvers.find(s => s.id === op.graph.payment.solver); change(solver, 'paid', total);
      op.paymentState = 'spent'; op.status = 'SETTLED'; op.settlementAt = now; releaseInventory(state, op);
    } else if (command.type === 'recover') {
      ensure(!TERMINAL.has(op.status), 'TERMINAL_OPERATION'); ensure(now >= op.graph.expiresAt, 'NOT_EXPIRED');
      ensure(['reserved', 'committed'].includes(op.paymentState), 'PAYMENT_ALREADY_DECIDED');
      const total = amount(op.graph.payment.amount); change(local, op.paymentState, -total); change(local, 'available', total);
      op.paymentState = 'refunded'; op.status = 'REFUNDED'; releaseInventory(state, op);
      // Permission spend limits are not restored by a refund; this avoids cycling one authorization.
    } else if (command.type === 'fail') {
      ensure(!TERMINAL.has(op.status), 'TERMINAL_OPERATION'); text(command.reason, 80);
      if (op.status === 'RECOVERY_PENDING') return state; // Advance the trusted clock, without duplicating an external-history event.
      op.status = 'RECOVERY_PENDING'; op.failure = command.reason;
    } else if (command.type === 'reorg') {
      const record = op.legs.find(l => l.id === command.legId); ensure(record, 'UNKNOWN_LEG');
      const observation = command.resource ? record.observations.find(o => o.resource === command.resource) : record.observations.find(o => o.resource === record.resource) ?? record.observations.find(o => o.validity === 'CANONICAL');
      ensure(observation?.validity === 'CANONICAL', 'NO_FINAL_RECEIPT');
      const output = byAsset(state.assets, observation.receipt.payload.asset), n = amount(observation.walletCredit);
      change(output, 'available', -n); change(output, 'received', -n); observation.validity = 'REORGED'; observation.reorgedAt = now;
      const invalidatesFulfillment = observation.resource === record.resource;
      if (invalidatesFulfillment || !record.receipt) record.status = 'REORGED';
      // Reorging an extra effect does not invalidate a distinct admitted receipt.
      // Reorging an admitted effect cannot restore a previously paid reservation.
      if (invalidatesFulfillment || !record.receipt) op.status = ['SETTLED', 'DISPUTED'].includes(op.status) ? 'DISPUTED' : op.status === 'REFUNDED' ? 'REFUNDED' : 'RECOVERY_PENDING';
      op.failure = 'FINALITY_ASSUMPTION_BROKEN';
    } else throw new Error('UNKNOWN_COMMAND');
  }
  const eventLegId = command.legId ?? command.receipt?.payload?.legId ?? command.acknowledgement?.payload?.legId;
  state.events.push({ sequence: state.events.length + 1, at: now, type: command.type, hash: op.hash, status: op.status, ...(eventLegId ? { legId: eventLegId } : {}) });
  assertState(state); return state;
}

/** Minimized read-only preview, not permission to transmit. prepareDispatch must
 * durably record the intent first. This projection is not a proof of distributed
 * unlinkability and cannot compel an external executor to obey the dispatcher. */
export function executorView(state, hash, legId) {
  const op = state.operations.find(o => o.hash === hash); ensure(op, 'UNKNOWN_GRAPH');
  ensure(state.solvers.find(s => s.id === op.graph.payment.solver)?.inventoryStatus === 'RECONCILED', 'SOLVER_INVENTORY_UNRECONCILED');
  const leg = op.graph.legs.find(l => l.id === legId), record = op.legs.find(l => l.id === legId); ensure(leg, 'UNKNOWN_LEG');
  ensure(['RESERVED', 'EXECUTING'].includes(op.status) && state.lastNow < op.graph.expiresAt && record.status === 'WAITING' && leg.dependsOn.every(id => op.legs.find(l => l.id === id)?.status === 'FINAL'), 'NOT_DISPATCHABLE');
  return { version: 1, domain: DOMAIN, dispatchToken: record.dispatchToken, chain: leg.chain, asset: leg.asset, amount: leg.amount, maxFee: leg.maxFee, recipient: leg.recipient, expiresAt: op.graph.expiresAt };
}

export function makeGraph(now, { order = ['ethereum', 'solana', 'bitcoin'], ttl = 60000 } = {}) {
  const values = { ethereum: '200', solana: '300', bitcoin: '400' };
  return { version: 1, domain: DOMAIN, id: randomBytes(32).toString('hex'), expiresAt: now + ttl, guarantee: 'conditional-payment',
    payment: { asset: PAYMENT, amount: '1000', fee: '25', solver: 'reference-1' },
    legs: order.map((chain, index) => ({ id: chain, chain, asset: ASSETS[chain], amount: values[chain], maxFee: '10', recipient: `fixture-${chain}-recipient`, executor: chain === 'solana' ? 'reference-b' : 'reference-a', dependsOn: index ? [order[index - 1]] : [] })) };
}
