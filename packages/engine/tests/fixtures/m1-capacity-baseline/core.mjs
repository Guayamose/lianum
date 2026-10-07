import { randomBytes } from 'node:crypto';
import { digest, verify } from './privacy.mjs';

export const DOMAIN = 'paeg:simulation:v1';
export const ASSETS = Object.freeze({ ethereum: 'ethereum:local:wei', solana: 'solana:local:lamport', bitcoin: 'bitcoin:regtest:satoshi' });
export const PAYMENT = 'local:simulation:credit';
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
    version: 1, domain: DOMAIN, environment: 'simulation', lastNow: now,
    assets: [PAYMENT, ...Object.values(ASSETS)].map(asset => ({ asset, initial: asset === PAYMENT ? '10000' : '0', received: '0', available: asset === PAYMENT ? '10000' : '0', reserved: '0', committed: '0', spent: '0' })),
    positions: [], permissions: [{ id: 'demo-payment', asset: PAYMENT, maxPerGraph: '2000', remaining: '10000', expiresAt: now + 86400000 }],
    solvers: [{ id: 'reference-1', inventoryStatus: 'RECONCILED', inventory: Object.values(ASSETS).map(asset => ({ asset, initial: '10000', available: '10000', reserved: '0', spent: '0' })), paid: '0' }],
    executors: [{ id: 'reference-a', chains: ['ethereum', 'bitcoin'] }, { id: 'reference-b', chains: ['solana'] }],
    operations: [], consumedResources: [], events: []
  };
}

export function assertState(state) {
  ensure(state.version === 1 && state.domain === DOMAIN && state.environment === 'simulation', 'INVALID_STATE_DOMAIN');
  integer(state.lastNow);
  ensure(new Set(state.operations.map(o => o.hash)).size === state.operations.length, 'DUPLICATE_OPERATION');
  ensure(new Set(state.operations.map(o => o.graph.id)).size === state.operations.length, 'DUPLICATE_GRAPH_ID');
  ensure(new Set(state.consumedResources).size === state.consumedResources.length, 'DUPLICATE_RESOURCE');
  for (const op of state.operations) {
    ensure(op.hash === graphHash(op.graph), 'GRAPH_MUTATION');
    if (['SETTLED', 'DISPUTED'].includes(op.status)) ensure(op.paymentState === 'spent', 'PAYMENT_STATE_MISMATCH');
    else if (op.status === 'REFUNDED') ensure(op.paymentState === 'refunded', 'PAYMENT_STATE_MISMATCH');
    else ensure(['reserved', 'committed'].includes(op.paymentState), 'PAYMENT_STATE_MISMATCH');
  }
  for (const a of state.assets) {
    ensure(amount(a.available) + amount(a.reserved) + amount(a.committed) + amount(a.spent) === amount(a.initial) + amount(a.received), 'BALANCE_CONSERVATION');
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
      ensure(amount(a.available) + amount(a.reserved) + amount(a.spent) === amount(a.initial), 'SOLVER_CONSERVATION');
      const held = state.operations.filter(o => o.graph.payment.solver === solver.id).flatMap(o => o.legs).filter(l => l.asset === a.asset).reduce((n,l) => n + amount(l.allocation), 0n);
      ensure(held === amount(a.reserved), 'INVENTORY_RESERVATION_CONSERVATION');
    }
  }
  return true;
}

function releaseInventory(state, op) {
  const solver = state.solvers.find(s => s.id === op.graph.payment.solver);
  for (const leg of op.legs) {
    const held = amount(leg.allocation); const inventory = byAsset(solver.inventory, leg.asset);
    change(inventory, 'reserved', -held); change(inventory, 'available', held); leg.allocation = '0';
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
  ensure(verify(r, signed.signature, trust.verifierPublicKey), 'INVALID_ATTESTATION');
  ensure(r.graphHash === op.hash, 'WRONG_GRAPH');
  const leg = op.graph.legs.find(x => x.id === r.legId); ensure(leg, 'UNKNOWN_LEG');
  for (const name of ['chain', 'asset', 'recipient', 'amount', 'executor']) ensure(r[name] === leg[name], 'WRONG_FULFILLMENT');
  ensure(amount(r.fee) <= amount(leg.maxFee), 'FEE_EXCEEDED');
  ensure(r.finality === 'simulated-final', 'INSUFFICIENT_FINALITY');
  integer(r.observedAt); ensure(r.observedAt <= now, 'FUTURE_RECEIPT'); ensure(r.observedAt >= op.openedAt, 'PREEXISTING_RECEIPT');
  text(r.txRef); text(r.blockHash); integer(r.effectIndex);
  ensure(r.effectIndex <= 65535, 'INVALID_EFFECT_INDEX');
  return { receipt: r, leg, record: op.legs.find(x => x.id === leg.id) };
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
    op = { graph, hash, status: 'RESERVED', paymentState: 'reserved', permission: permission.id, openedAt: now, settlementAt: null,
      legs: graph.legs.map(l => ({ id: l.id, asset: l.asset, status: 'WAITING', allocation: (amount(l.amount) + amount(l.maxFee)).toString(), dispatchToken: randomBytes(32).toString('hex'), receipt: null, resource: null })), lateEffects: [], failure: null };
    state.operations.push(op);
  } else {
    op = state.operations.find(o => o.hash === command.hash); ensure(op, 'UNKNOWN_GRAPH');
    if (command.type === 'receipt') {
      const { receipt: r, leg, record } = validateReceipt(op, command.receipt, trust, now);
      const resource = resourceKey(r);
      ensure(!state.consumedResources.includes(resource), 'RESOURCE_REPLAY');
      ensure(!record.receipt, 'LEG_REPLAY');
      const dependenciesFinal = leg.dependsOn.every(id => op.legs.find(l => l.id === id)?.status === 'FINAL');
      const solver = state.solvers.find(s => s.id === op.graph.payment.solver);
      const inventory = byAsset(solver.inventory, leg.asset), cost = amount(leg.amount) + amount(r.fee);
      // Late effects are externally irreversible observations, never a route to late payment.
      if (TERMINAL.has(op.status) || op.status === 'RECOVERY_PENDING' || now >= op.graph.expiresAt || r.observedAt >= op.graph.expiresAt) {
        if (amount(inventory.available) + amount(record.allocation) >= cost) {
          const held = amount(record.allocation);
          change(inventory, 'reserved', -held); change(inventory, 'available', held - cost); change(inventory, 'spent', cost); record.allocation = '0';
          record.status = 'LATE';
        } else {
          // Preserve authentic observation, freeze new capital allocation; do not invent funds or model debt.
          solver.inventoryStatus = 'UNRECONCILED'; record.status = 'LATE_UNRECONCILED';
          op.failure = 'EXTERNAL_INVENTORY_RECONCILIATION_REQUIRED';
        }
        record.receipt = structuredClone(command.receipt); record.resource = resource;
        op.lateEffects.push(resource);
        if (!TERMINAL.has(op.status)) op.status = 'RECOVERY_PENDING';
      } else {
        ensure(dependenciesFinal, 'DEPENDENCY_NOT_FINAL');
        ensure(['RESERVED', 'EXECUTING'].includes(op.status), 'INVALID_OPERATION_STATE');
        const held = amount(record.allocation); ensure(held >= cost, 'INSUFFICIENT_RESERVED_INVENTORY');
        change(inventory, 'reserved', -held); change(inventory, 'available', held - cost); change(inventory, 'spent', cost); record.allocation = '0';
        if (op.paymentState === 'reserved') { change(local, 'reserved', -amount(op.graph.payment.amount)); change(local, 'committed', amount(op.graph.payment.amount)); op.paymentState = 'committed'; }
        record.status = 'FINAL'; record.receipt = structuredClone(command.receipt); record.resource = resource;
        op.status = op.legs.every(l => l.status === 'FINAL') ? 'FULFILLED' : 'EXECUTING';
      }
      const output = byAsset(state.assets, leg.asset); change(output, 'received', amount(leg.amount)); change(output, 'available', amount(leg.amount));
      state.consumedResources.push(resource);
    } else if (command.type === 'settle') {
      ensure(now < op.graph.expiresAt, 'EXPIRED');
      ensure(op.status === 'FULFILLED' && op.legs.every(l => l.status === 'FINAL'), 'INCOMPLETE_FULFILLMENT');
      for (const leg of op.legs) validateReceipt(op, leg.receipt, trust, now);
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
      op.status = 'RECOVERY_PENDING'; op.failure = command.reason;
    } else if (command.type === 'reorg') {
      const record = op.legs.find(l => l.id === command.legId); ensure(record && ['FINAL', 'LATE', 'LATE_UNRECONCILED'].includes(record.status), 'NO_FINAL_RECEIPT');
      const output = byAsset(state.assets, record.asset), n = amount(record.receipt.payload.amount);
      change(output, 'available', -n); change(output, 'received', -n); record.status = 'REORGED';
      // Never undo an already paid input or release another refund after settlement.
      op.status = ['SETTLED', 'DISPUTED'].includes(op.status) ? 'DISPUTED' : op.status === 'REFUNDED' ? 'REFUNDED' : 'RECOVERY_PENDING';
      op.failure = 'FINALITY_ASSUMPTION_BROKEN';
    } else throw new Error('UNKNOWN_COMMAND');
  }
  state.events.push({ sequence: state.events.length + 1, at: now, type: command.type, hash: op.hash, status: op.status });
  assertState(state); return state;
}

/** Minimized executor view. This is a projection, not a proof of distributed unlinkability. */
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
