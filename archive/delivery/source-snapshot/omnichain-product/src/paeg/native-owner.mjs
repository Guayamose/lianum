/** Private IPC facade for one synthetic generic native owner operation.
 * prepare() accepts a bounded DAG and private recipient offers, then returns one
 * scoped invoice request per recipient. authorize() accepts only those detached
 * signatures. Signing keys, full graph witnesses and graph nonces never leave
 * the child. The A0/C proof packages and role packets are PRIVATE capabilities.
 * A trusted fixture bootstrap assigns packets to non-colluding actors; sharing
 * one host is not OS isolation. Invoice signers necessarily learn opID + slot.
 */
import { fork } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { types } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PROOF_PROJECT_ROOT, encodeProofMessage, decodeProofMessage,
  encodePrivateProof, decodePrivateProof, wipePrivate } from './proof-worker.mjs';
import { FUNDED_DOMAINS, fundedHash, fundedAdmission } from './funded-graph.mjs';
import { canonical } from '../privacy.mjs';
import { uintBE } from '../private-note-encoding.mjs';
import { walletNoteCommitment } from '../private-wallet-note-encoding.mjs';
import { NATIVE_CAPSULE_PROFILE, nativeTransferActionCommitment, localCapsuleToNoir,
  dependencyCapsuleToNoir, localCapsuleCommitment, dependencyCapsuleCommitment, nativeReceiptKeyCommitment } from './native-capsules.mjs';
import { nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from './native-admission.mjs';

export const NATIVE_OWNER_PROTOCOL = 'LIANUM_SYNTHETIC_NATIVE_OWNER_V1';
export const NATIVE_OWNER_MAX_REQUEST_BYTES = 64 * 1024;
export const NATIVE_OWNER_ACTION_TEMPLATE_FIELDS = Object.freeze(['chainDomain', 'signerIdentity',
  'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment',
  'executionFrom', 'executionUntil']);
const CONFIG_FIELDS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId',
  'epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore', 'fundingAmount', 'nodes', 'vault'];
const CONTEXT_FIELDS = ['profile', 'scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context', 'settleBefore'];
const COMMITMENT_FIELDS = ['fundingCommitment', 'admissionTag', 'reserveCommitment', 'reserveNullifier',
  'changeCommitment', 'recoveryCommitment'];
const ZERO = '0'.repeat(64);
const workerFile = fileURLToPath(new URL('../../scripts/generic-native-owner-worker.mjs', import.meta.url));
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const ERROR_PATTERN = /^PAEG_(?:NATIVE_OWNER|PROOF)_[A-Z_]+$/;
export const nativeOwnerError = code => Object.assign(new Error(code), { code });
export function nativeOwnerNeed(condition, code) { if (!condition) throw nativeOwnerError(code); }
export function nativeOwnerExact(value, keys) {
  nativeOwnerNeed(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'PAEG_NATIVE_OWNER_EXACT_FIELDS');
  const own = Reflect.ownKeys(value);
  nativeOwnerNeed(own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key))
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && d.enumerable && Object.hasOwn(d, 'value'); }),
  'PAEG_NATIVE_OWNER_EXACT_FIELDS');
}
function array(value, maximum, minimum = 0) {
  nativeOwnerNeed(Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length >= minimum && value.length <= maximum, 'PAEG_NATIVE_OWNER_ARRAY');
  nativeOwnerNeed(Reflect.ownKeys(value).length === value.length + 1
    && Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i)))
      .every(d => d && d.enumerable && Object.hasOwn(d, 'value')), 'PAEG_NATIVE_OWNER_ARRAY');
}
export function nativeOwnerHash(value, allowZero = false) {
  nativeOwnerNeed(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value)
    && (allowZero || value !== ZERO), 'PAEG_NATIVE_OWNER_HASH');
  return value;
}
export function nativeOwnerUint(value, bits = 64, positive = false) {
  nativeOwnerNeed(typeof value === 'string' && value.length <= Math.ceil(bits / 3)
    && /^(0|[1-9][0-9]*)$/.test(value) && !/\s/.test(value), 'PAEG_NATIVE_OWNER_INTEGER');
  const number = BigInt(value);
  nativeOwnerNeed(number < (1n << BigInt(bits)) && (!positive || number > 0n), 'PAEG_NATIVE_OWNER_INTEGER');
  return value;
}
const nodeId = value => {
  nativeOwnerNeed(typeof value === 'string' && value.length <= 64 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    && !/\s/.test(value), 'PAEG_NATIVE_OWNER_NODE_ID'); return value;
};

/** Same wave-by-wave canonical topological order as compileGraph. No temporary
 * graph with made-up action commitments is created to discover payout slots. */
export function canonicalNativeOwnerNodes(nodes) {
  array(nodes, 4, 1);
  const byId = new Map();
  for (const node of nodes) {
    nativeOwnerNeed(node && !types.isProxy(node) && Object.getPrototypeOf(node) === Object.prototype
      && ['id', 'dependsOn'].every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(node, key) ?? {}, 'value')),
    'PAEG_NATIVE_OWNER_NODE_FIELDS');
    nodeId(node.id); array(node.dependsOn, 3); node.dependsOn.forEach(nodeId);
    nativeOwnerNeed(!byId.has(node.id) && new Set(node.dependsOn).size === node.dependsOn.length,
      'PAEG_NATIVE_OWNER_DUPLICATE_GRAPH'); byId.set(node.id, node);
  }
  for (const node of nodes) nativeOwnerNeed(node.dependsOn.every(id => id !== node.id && byId.has(id)),
    'PAEG_NATIVE_OWNER_GRAPH_EDGE');
  const remaining = new Set(byId.keys()), complete = new Set(), result = [];
  while (remaining.size) {
    const ready = [...remaining].filter(id => byId.get(id).dependsOn.every(id => complete.has(id))).sort();
    nativeOwnerNeed(ready.length > 0, 'PAEG_NATIVE_OWNER_GRAPH_CYCLE');
    for (const id of ready) { result.push(byId.get(id)); remaining.delete(id); complete.add(id); }
  }
  return result;
}

export function normalizeNativeOwnerPrepare(input) {
  nativeOwnerExact(input, CONFIG_FIELDS);
  const config = Object.fromEntries(CONFIG_FIELDS.slice(0, 6).map(key => [key, nativeOwnerHash(input[key])]));
  for (const key of ['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']) config[key] = nativeOwnerUint(input[key]);
  config.fundingAmount = nativeOwnerUint(input.fundingAmount, 64, true);
  nativeOwnerNeed(BigInt(config.fundingNotBefore) < BigInt(config.fundingValidUntil)
    && BigInt(config.fundingValidUntil) <= BigInt(config.settleBefore), 'PAEG_NATIVE_OWNER_DEADLINES');
  nativeOwnerExact(input.vault, ['path', 'password']);
  nativeOwnerNeed(typeof input.vault.path === 'string' && input.vault.path.isWellFormed()
    && isAbsolute(input.vault.path) && Buffer.byteLength(input.vault.path) <= 4096 && !input.vault.path.includes('\0'),
  'PAEG_NATIVE_OWNER_VAULT_PATH');
  nativeOwnerNeed(typeof input.vault.password === 'string' && input.vault.password.isWellFormed()
    && Buffer.byteLength(input.vault.password) >= 1 && Buffer.byteLength(input.vault.password) <= 1024,
  'PAEG_NATIVE_OWNER_VAULT_PASSWORD');
  config.vault = { path: input.vault.path, password: input.vault.password };
  array(input.nodes, 4, 1);
  config.nodes = input.nodes.map(node => {
    nativeOwnerExact(node, ['id', 'dependsOn', 'evidencePolicy', 'actionTemplate', 'recipientOffer']);
    nodeId(node.id); array(node.dependsOn, 3); node.dependsOn.forEach(nodeId);
    nativeOwnerExact(node.actionTemplate, NATIVE_OWNER_ACTION_TEMPLATE_FIELDS);
    const actionTemplate = {};
    for (const key of NATIVE_OWNER_ACTION_TEMPLATE_FIELDS) {
      actionTemplate[key] = key === 'custodyKind' ? node.actionTemplate[key]
        : key === 'amount' ? nativeOwnerUint(node.actionTemplate[key], 128, true)
          : ['executionFrom', 'executionUntil'].includes(key) ? nativeOwnerUint(node.actionTemplate[key])
            : nativeOwnerHash(node.actionTemplate[key]);
    }
    nativeOwnerNeed(actionTemplate.custodyKind === 1 && BigInt(actionTemplate.executionFrom) < BigInt(actionTemplate.executionUntil)
      && BigInt(actionTemplate.executionUntil) <= BigInt(config.settleBefore), 'PAEG_NATIVE_OWNER_ACTION_INTERVAL');
    nativeOwnerExact(node.recipientOffer, ['x', 'y', 'value', 'secret', 'randomness']);
    const recipientOffer = Object.fromEntries(['x', 'y', 'secret', 'randomness']
      .map(key => [key, nativeOwnerHash(node.recipientOffer[key])]));
    recipientOffer.value = nativeOwnerUint(node.recipientOffer.value, 64, true);
    try { createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
      x: Buffer.from(recipientOffer.x, 'hex').toString('base64url'), y: Buffer.from(recipientOffer.y, 'hex').toString('base64url') } }); }
    catch { throw nativeOwnerError('PAEG_NATIVE_OWNER_RECIPIENT_KEY'); }
    return { id: node.id, dependsOn: [...node.dependsOn], evidencePolicy: nativeOwnerHash(node.evidencePolicy), actionTemplate, recipientOffer };
  });
  canonicalNativeOwnerNodes(config.nodes);
  const total = config.nodes.reduce((sum, node) => sum + BigInt(node.recipientOffer.value), 0n);
  nativeOwnerNeed(total <= BigInt(config.fundingAmount), 'PAEG_NATIVE_OWNER_INSUFFICIENT_FUNDING');
  return config;
}

/** Slot-bound funded payout formula. The recipient can derive the same rho
 * independently; neither a signing key nor an owner graph is required. */
export function nativeOwnerPayoutNote(config, offer, slot) {
  nativeOwnerNeed(Number.isInteger(slot) && !Object.is(slot, -0) && slot >= 0 && slot < 4, 'PAEG_NATIVE_OWNER_SLOT');
  const rho = fundedHash(FUNDED_DOMAINS.payoutOrigin, [
    ...['scope', 'policy', 'asset', 'operationId'].map(key => Buffer.from(nativeOwnerHash(config[key]), 'hex')),
    uintBE(slot, 1), Buffer.from(nativeOwnerHash(offer.randomness), 'hex'),
  ]);
  return { type: 4, rho, x: nativeOwnerHash(offer.x), y: nativeOwnerHash(offer.y),
    value: nativeOwnerUint(offer.value, 64, true), secret: nativeOwnerHash(offer.secret) };
}
export function normalizeNativeOwnerAuthorize(input) {
  nativeOwnerExact(input, ['invoiceSignatures']); array(input.invoiceSignatures, 4, 1);
  const invoiceSignatures = input.invoiceSignatures.map(value => {
    nativeOwnerNeed(typeof value === 'string' && value.length === 128 && /^[0-9a-f]{128}$/.test(value),
      'PAEG_NATIVE_OWNER_INVOICE_SIGNATURE'); return value;
  });
  return { invoiceSignatures };
}

const publicError = error => nativeOwnerError(ERROR_PATTERN.test(error?.code ?? '') ? error.code : 'PAEG_NATIVE_OWNER_PROTOCOL');
function decodedProof(mode, encoded) {
  const decoded = decodePrivateProof(mode, encoded);
  try { return decodePrivateProof(mode, encodePrivateProof(mode, decoded)); }
  finally { wipePrivate(decoded); }
}
const digestAt = (inputs, offset) => inputs.slice(offset, offset + 8).map(v => BigInt(v).toString(16).padStart(8, '0')).join('');
const same = (a, b) => nativeOwnerNeed(a === b, 'PAEG_NATIVE_OWNER_RESULT_BINDING');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function riskCommitment(config, action, payoutCommitment, salt) {
  return nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: config.hubDomain, registryCommitment: config.registryCommitment,
    chainDomain: action.chainDomain, sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount,
    scope: config.scope, policy: config.policy, asset: config.asset, payoutCommitment,
    settleBefore: config.settleBefore, salt });
}

function decodePrepared(value, config) {
  nativeOwnerExact(value, ['invoiceRequests', 'metrics']); array(value.invoiceRequests, 4, 1);
  const ordered = canonicalNativeOwnerNodes(config.nodes);
  same(value.invoiceRequests.length, ordered.length);
  // Invoice packets use JSON-only structured terms. The recipient reconstructs
  // and signs its own canonical frame; no opaque arbitrary signing API exists.
  value.invoiceRequests.forEach((request, slot) => {
    nativeOwnerExact(request, ['id', 'slot', 'invoice']);
    same(request.id, ordered[slot].id); same(request.slot, slot);
    const invoice = request.invoice;
    nativeOwnerExact(invoice, ['scope', 'policy', 'asset', 'operationId', 'slot', 'chainDomain',
      'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'rho', 'settleBefore', 'action', 'deliveryRiskSalt']);
    nativeOwnerHash(invoice.deliveryRiskSalt); nativeTransferActionCommitment(invoice.action);
    for (const field of ['scope', 'policy', 'asset', 'operationId', 'settleBefore']) same(invoice[field], config[field]);
    same(invoice.slot, slot); same(invoice.chainDomain, ordered[slot].actionTemplate.chainDomain);
    same(invoice.evidencePolicy, ordered[slot].evidencePolicy);
    same(invoice.actionCommitment, nativeTransferActionCommitment(invoice.action));
    const note = nativeOwnerPayoutNote(config, ordered[slot].recipientOffer, slot);
    same(invoice.rho, note.rho);
    same(invoice.payoutCommitment, walletNoteCommitment(config.scope, config.policy, note).toString('hex'));
    NATIVE_OWNER_ACTION_TEMPLATE_FIELDS.forEach(field => same(invoice.action[field], ordered[slot].actionTemplate[field]));
    same(invoice.action.settleBefore, config.settleBefore);
    same(invoice.action.deliveryRiskCommitment, riskCommitment(config, invoice.action, invoice.payoutCommitment, invoice.deliveryRiskSalt));
  });
  checkMetrics(value.metrics, false);
  return structuredClone(value);
}
function checkMetrics(metrics, proved) {
  nativeOwnerExact(metrics, ['classification', 'configurationSHA256', 'invoiceRequestsSHA256', 'recoveryStateSHA256', 'proofs']);
  same(metrics.classification, 'SYNTHETIC_NATIVE_OWNER_HASH_ONLY_METRICS');
  for (const key of ['configurationSHA256', 'invoiceRequestsSHA256', 'recoveryStateSHA256']) nativeOwnerHash(metrics[key]);
  array(metrics.proofs, 3, proved ? 3 : 0); same(metrics.proofs.length, proved ? 3 : 0);
  metrics.proofs.forEach((proof, i) => {
    const mode = ['deposit_balance', 'authorization', 'capsule'][i];
    nativeOwnerExact(proof, ['mode', 'keySHA256', 'artifactSHA256', 'sourceTreeSHA256', 'proofSHA256',
      'publicInputsSHA256', 'proofBytes', 'publicInputCount', 'verified', ...(i ? ['proofFieldsSHA256', 'vkFieldsSHA256'] : [])]);
    same(proof.mode, mode); same(proof.verified, true);
    for (const key of Object.keys(proof).filter(key => key.endsWith('SHA256'))) nativeOwnerHash(proof[key]);
    nativeOwnerNeed(Number.isSafeInteger(proof.proofBytes) && proof.proofBytes > 0 && proof.proofBytes <= 2 * 1024 * 1024,
      'PAEG_NATIVE_OWNER_PROOF_BYTES');
    same(proof.publicInputCount, [26, 139, 129][i]);
  });
}
function decodeAuthorized(value, config) {
  nativeOwnerExact(value, ['deposit', 'authorization', 'capsuleAuthorization', ...COMMITMENT_FIELDS,
    'settleBefore', 'rolePackets', 'providerRiskSalts', 'metrics']);
  const result = { ...Object.fromEntries(COMMITMENT_FIELDS.map(key => [key, nativeOwnerHash(value[key])])),
    settleBefore: nativeOwnerUint(value.settleBefore), deposit: decodedProof('deposit_balance', value.deposit),
    authorization: decodedProof('authorization', value.authorization), capsuleAuthorization: decodedProof('capsule', value.capsuleAuthorization) };
  const a = result.authorization.publicInputs, c = result.capsuleAuthorization.publicInputs, d = result.deposit.publicInputs;
  for (const [key, offset] of [['scope', 0], ['policy', 8], ['asset', 16]]) {
    same(digestAt(a, offset), config[key]); same(digestAt(c, offset), config[key]);
  }
  same(digestAt(a, 24), config.operationId); same(digestAt(a, 32), result.fundingCommitment);
  same(result.admissionTag, fundedAdmission(config));
  for (const [key, offset] of [['reserveCommitment', 72], ['reserveNullifier', 80], ['changeCommitment', 88], ['recoveryCommitment', 128]]) same(digestAt(a, offset), result[key]);
  same(digestAt(d, 0), config.scope); same(digestAt(d, 8), config.policy); same(d[16], config.epoch);
  same(d[17], config.fundingAmount); same(digestAt(d, 18), result.fundingCommitment);
  same(digestAt(c, 24), config.hubDomain); same(digestAt(c, 32), config.registryCommitment);
  same(digestAt(c, 48), result.reserveCommitment); same(digestAt(c, 56), result.reserveNullifier);
  same(a[136], config.fundingNotBefore); same(a[137], config.fundingValidUntil);
  same(a[138], config.settleBefore); same(c[128], config.settleBefore); same(result.settleBefore, config.settleBefore);
  nativeOwnerExact(value.rolePackets, ['ready', 'dependency', 'node']);
  for (const packets of Object.values(value.rolePackets)) { array(packets, 4, 4); }
  array(value.providerRiskSalts, 4, 4);
  const ordered = canonicalNativeOwnerNodes(config.nodes);
  for (let slot = 0; slot < 4; slot++) {
    const active = slot < ordered.length, node = value.rolePackets.node[slot], dep = value.rolePackets.dependency[slot], ready = value.rolePackets.ready[slot];
    nativeOwnerExact(node, [...CONTEXT_FIELDS, 'localCapsule', 'action', 'receiptSpendSecret', 'localCapsuleCommitment']);
    nativeOwnerExact(dep, [...CONTEXT_FIELDS, 'dependencyCapsule', 'dependencyCapsuleCommitment']);
    for (const packet of [node, dep]) {
      same(packet.profile, NATIVE_CAPSULE_PROFILE.id);
      for (const key of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'settleBefore']) same(packet[key], config[key]);
      same(packet.context, digestAt(c, 40));
    }
    localCapsuleToNoir(node.localCapsule); dependencyCapsuleToNoir(dep.dependencyCapsule);
    same(node.localCapsule.slot, slot); same(node.localCapsule.active, active); same(dep.dependencyCapsule.targetSlot, slot);
    same(node.localCapsule.targetContext, dep.dependencyCapsule.targetContext);
    same(node.localCapsule.payoutCommitment, digestAt(a, 96 + slot * 8));
    same(node.localCapsuleCommitment, digestAt(c, 64 + slot * 8));
    same(dep.dependencyCapsuleCommitment, digestAt(c, 96 + slot * 8));
    same(localCapsuleCommitment(node, node.localCapsule), node.localCapsuleCommitment);
    same(dependencyCapsuleCommitment(dep, dep.dependencyCapsule), dep.dependencyCapsuleCommitment);
    nativeOwnerHash(node.receiptSpendSecret, !active);
    if (active) {
      nativeOwnerExact(ready, [...CONTEXT_FIELDS, 'localCapsule', 'action', 'localCapsuleCommitment', 'dependencyCapsuleCommitment']);
      same(canonical(ready), canonical({ ...Object.fromEntries(CONTEXT_FIELDS.map(key => [key, node[key]])),
        localCapsule: node.localCapsule, action: node.action, localCapsuleCommitment: node.localCapsuleCommitment,
        dependencyCapsuleCommitment: dep.dependencyCapsuleCommitment }));
      same(nativeTransferActionCommitment(node.action), node.localCapsule.actionCommitment);
      nativeOwnerHash(value.providerRiskSalts[slot]);
      NATIVE_OWNER_ACTION_TEMPLATE_FIELDS.forEach(field => same(node.action[field], ordered[slot].actionTemplate[field]));
      same(node.action.receiptKeyCommitment, nativeReceiptKeyCommitment(config.hubDomain, node.receiptSpendSecret));
      same(node.action.deliveryRiskCommitment, riskCommitment(config, node.action, node.localCapsule.payoutCommitment, value.providerRiskSalts[slot]));
      same(node.localCapsule.payoutCommitment, walletNoteCommitment(config.scope, config.policy,
        nativeOwnerPayoutNote(config, ordered[slot].recipientOffer, slot)).toString('hex'));
    } else { same(ready, null); same(node.action, null); same(node.receiptSpendSecret, ZERO); same(value.providerRiskSalts[slot], null); }
  }
  checkMetrics(value.metrics, true);
  [result.deposit, result.authorization, result.capsuleAuthorization].forEach((proof, i) => {
    const m = value.metrics.proofs[i];
    same(m.proofSHA256, hash(proof.proof)); same(m.publicInputsSHA256, hash(canonical(proof.publicInputs)));
    same(m.proofBytes, proof.proof.length);
    if (i) { same(m.proofFieldsSHA256, hash(canonical(proof.proofFields))); same(m.vkFieldsSHA256, hash(canonical(proof.vkFields))); }
  });
  return { ...result, rolePackets: structuredClone(value.rolePackets), providerRiskSalts: [...value.providerRiskSalts], metrics: structuredClone(value.metrics) };
}

/** Fixed worker/cwd/environment. No caller-selected commands or proving keys.
 * close() waits for the owned child's actual OS close event, including on error.
 * The supplied new Vault path must be in the client's trusted local directory.
 */
export function createNativeOwnerProcess() {
  nativeOwnerNeed(arguments.length === 0, 'PAEG_NATIVE_OWNER_NO_CONFIGURATION');
  let child, pending, readyResolve, readyReject, exitResolve, readyTimer, killTimer, closeTimer;
  let nextId = 0, config, prepared = false, authorized = false, operating = false, closed = false, failure;
  const report = { classification: 'SYNTHETIC_NATIVE_OWNER_PUBLIC_LIFECYCLE_ONLY', phase: 'not-started',
    started: false, exited: false, requests: [], logs: { stdoutBytes: 0, stderrBytes: 0 } };
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); ready.catch(() => {});
  const exited = new Promise(resolve => { exitResolve = resolve; });
  function fail(error) {
    failure ??= publicError(error); report.failureCode = failure.code;
    if (!report.exited) report.phase = 'stopping-after-failure';
    readyReject(failure);
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = null; }
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => { if (!report.exited && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 10000);
    }
  }
  function start() {
    if (child) return ready;
    nativeOwnerNeed(!closed && !failure, 'PAEG_NATIVE_OWNER_CLOSED'); report.phase = 'starting';
    try { child = fork(workerFile, [], { cwd: PROOF_PROJECT_ROOT, execArgv: [], serialization: 'advanced',
      env: { LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }); }
    catch { fail(nativeOwnerError('PAEG_NATIVE_OWNER_SPAWN')); exitResolve(structuredClone(report)); return ready; }
    report.started = true; report.pid = child.pid;
    child.once('error', () => fail(nativeOwnerError('PAEG_NATIVE_OWNER_SPAWN')));
    child.once('close', (code, signal) => {
      clearTimeout(readyTimer); clearTimeout(killTimer); clearTimeout(closeTimer);
      report.exited = true; report.exit = { code, signal };
      if (!closed || pending || code !== 0) fail(nativeOwnerError('PAEG_NATIVE_OWNER_CHILD_EXIT'));
      report.phase = failure ? 'failed' : 'closed';
      for (const stream of child.stdio) stream?.destroy();
      if (config) wipePrivate(config); config = null; exitResolve(structuredClone(report));
    });
    for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]]) {
      stream.on('data', bytes => { report.logs[name + 'Bytes'] += bytes.length; bytes.fill(0);
        if (report.logs.stdoutBytes + report.logs.stderrBytes > 65536) fail(nativeOwnerError('PAEG_NATIVE_OWNER_LOG_LIMIT')); });
      stream.on('error', () => fail(nativeOwnerError('PAEG_NATIVE_OWNER_IO')));
    }
    let readySeen = false;
    child.on('message', bytes => {
      let message;
      try {
        nativeOwnerNeed(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length <= MAX_RESPONSE_BYTES, 'PAEG_NATIVE_OWNER_MESSAGE_LIMIT');
        message = decodeProofMessage(bytes); if (failure) return;
        if (message.event === 'ready') {
          nativeOwnerExact(message, ['event', 'protocol']);
          nativeOwnerNeed(!readySeen && message.protocol === NATIVE_OWNER_PROTOCOL, 'PAEG_NATIVE_OWNER_PROTOCOL');
          readySeen = true; clearTimeout(readyTimer); report.phase = 'ready'; readyResolve();
        } else if (message.event === 'failure') {
          nativeOwnerExact(message, ['event', 'id', 'code']);
          nativeOwnerNeed(pending && message.id === pending.id && ERROR_PATTERN.test(message.code), 'PAEG_NATIVE_OWNER_PROTOCOL');
          fail(nativeOwnerError(message.code));
        } else {
          nativeOwnerExact(message, ['event', 'id', 'result']);
          nativeOwnerNeed(readySeen && message.event === 'result' && pending && message.id === pending.id, 'PAEG_NATIVE_OWNER_PROTOCOL');
          let result;
          if (pending.operation === 'prepare') result = decodePrepared(message.result, config);
          else if (pending.operation === 'authorize') result = decodeAuthorized(message.result, config);
          else { nativeOwnerExact(message.result, ['closed']); same(message.result.closed, true); result = { closed: true }; }
          const current = pending; pending = null; clearTimeout(current.timer);
          report.requests.push({ operation: current.operation, completedAt: new Date().toISOString() });
          report.phase = current.operation === 'close' ? 'awaiting-child-exit' : 'ready'; current.resolve(result);
        }
      } catch (error) { fail(error); } finally { wipePrivate(message); }
    });
    readyTimer = setTimeout(() => fail(nativeOwnerError('PAEG_NATIVE_OWNER_START_TIMEOUT')), 30000); return ready;
  }
  async function request(operation, input) {
    await start(); nativeOwnerNeed(!failure && !report.exited && !pending, 'PAEG_NATIVE_OWNER_BUSY_OR_CLOSED');
    const bytes = encodeProofMessage({ protocol: NATIVE_OWNER_PROTOCOL, id: ++nextId, operation, input });
    if (bytes.length > NATIVE_OWNER_MAX_REQUEST_BYTES) { bytes.fill(0); throw nativeOwnerError('PAEG_NATIVE_OWNER_MESSAGE_LIMIT'); }
    report.phase = operation;
    const response = new Promise((resolve, reject) => { pending = { id: nextId, operation, resolve, reject,
      timer: setTimeout(() => fail(nativeOwnerError('PAEG_NATIVE_OWNER_OPERATION_TIMEOUT')),
        operation === 'authorize' ? 50 * 60 * 1000 : operation === 'prepare' ? 30000 : 20000) }; });
    try { child.send(bytes, error => { bytes.fill(0); if (error) fail(nativeOwnerError('PAEG_NATIVE_OWNER_IO')); }); }
    catch (error) { bytes.fill(0); fail(error); } return response;
  }
  return Object.freeze({
    async prepare(input) {
      nativeOwnerNeed(!closed && !prepared && !operating && !config, 'PAEG_NATIVE_OWNER_PREPARE_ONCE');
      config = normalizeNativeOwnerPrepare(input); operating = true;
      try { const result = await request('prepare', config); prepared = true; return result; }
      finally { operating = false; }
    },
    async authorize(input) {
      nativeOwnerNeed(prepared && !closed && !authorized && !operating, 'PAEG_NATIVE_OWNER_NOT_READY');
      const normalized = normalizeNativeOwnerAuthorize(input);
      same(normalized.invoiceSignatures.length, config.nodes.length); operating = true;
      try { const result = await request('authorize', normalized); authorized = true; return result; }
      finally { wipePrivate(normalized); operating = false; }
    },
    report: () => structuredClone(report),
    async close() {
      if (!child) { closed = true; if (config) wipePrivate(config); config = null; return { closed: true, exited: true, started: false }; }
      if (!closed) {
        closed = true; closeTimer = setTimeout(() => fail(nativeOwnerError('PAEG_NATIVE_OWNER_CLOSE_TIMEOUT')), 20000);
        if (!failure && !pending && !report.exited) { try { await request('close', null); } catch (error) { fail(error); } }
        else if (!report.exited) fail(nativeOwnerError('PAEG_NATIVE_OWNER_CANCELLED'));
      }
      const lifecycle = await exited; clearTimeout(closeTimer);
      return { closed: true, exited: lifecycle.exited, exit: lifecycle.exit, metrics: lifecycle };
    },
  });
}
