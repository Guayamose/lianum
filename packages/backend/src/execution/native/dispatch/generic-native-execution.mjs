/** Surviving trusted same-host keeper for an already issued S66 reserve.
 *
 * This is a private bootstrap capability, never a graph/RPC/signing HTTP API.
 * The owner has already prepared A0/C and exited. Scoped actors still share a
 * host; this controller is explicitly trusted with their private packets.
 * Actual pinned proofs, the owned provider's current-state/presign gates, the
 * branded quorum and deployed contracts remain the acceptance authorities.
 *
 * An authenticated ownerOperationRef is a private identifier, not a signature.
 * The surrounding account authority must authenticate it before this call.
 * A started operation cannot restart, even after a pre-sign failure. Only the
 * original retained terminal transaction can be reconciled without resending.
 * abort() permanently stops new work and awaits owned proof-child closure;
 * the bootstrap remains responsible for stopping providers and chain runtimes.
 */
import { createHash, randomBytes } from 'node:crypto';
import { types } from 'node:util';
import { canonical } from '@lianum/engine/crypto/privacy';
import { assertLocalEvm } from '@lianum/engine/execution/local/local-evm';
import { assertOwnedNativeSystem } from './native-deployment.mjs';
import { readNativeSystemState } from '../state/native-system-state.mjs';
import { assertOwnedSolanaRuntime, assertOwnedSolanaRecipientView, base58Decode } from '@lianum/engine/chains/solana/solana-runtime';
import { assertOwnedBitcoinRuntime } from '@lianum/engine/chains/bitcoin/bitcoin-runtime';
import { assertTrustedLocalNativeQuorumObserver, nativeFixtureEndpointCommitment } from '../../../evidence/native-quorum-observer.mjs';
import { createProofProcess } from '@lianum/proofs/execution/proof-process';
import { wipePrivate } from '@lianum/proofs/execution/proof-worker';
import { prepareNativeDependency } from '@lianum/engine/execution/native/dispatch/native-dependency';
import { prepareNativeReady } from '@lianum/engine/execution/native/dispatch/native-ready';
import { prepareNativeNode } from '@lianum/engine/execution/native/dispatch/native-node';
import { prepareNativeAdmission, nativeAdmissionChainDomain, nativeAdmissionRuleCommitment,
  nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { prepareNativeAggregatePair, prepareNativeAggregateAll, prepareNativeFulfillment } from '@lianum/engine/execution/native/dispatch/native-fulfillment';
import { nativeReceiptCommitment } from '@lianum/engine/execution/native/state/native-receipt';
import { a0Context, NATIVE_CAPSULE_PROFILE, localCapsuleCommitment, localCapsuleToNoir,
  dependencyCapsuleCommitment, dependencyCapsuleToNoir, nativeReceiptKeyCommitment,
  nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { FUNDED_GRAPH_PROFILE } from '@lianum/engine/execution/graph/funded-graph';
import { A0, FIELD_MODULUS, digestHex } from '@lianum/engine/execution/inputs/funding-wrappers';

const ZERO = '0'.repeat(64), U64 = (1n << 64n) - 1n;
const CONTEXT = ['profile', 'scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'context', 'settleBefore'];
const DOMAINS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'];
const PREPARED = ['authorization', 'capsuleAuthorization', 'reserveCommitment', 'reserveNullifier',
  'settleBefore', 'rolePackets', 'providerRiskSalts'];
const OWNER_EXTRAS = ['deposit', 'fundingCommitment', 'admissionTag', 'changeCommitment', 'recoveryCommitment', 'metrics'];
const CHECKPOINT_SIGNATURE = 'recordCheckpoint(address,uint64,uint64,bytes32,uint64,(uint8,uint8,bytes32,bytes32)[3])';
const keepers = new WeakMap(), runtimes = new WeakMap();
const fail = suffix => { const code = 'PAEG_GENERIC_NATIVE_' + suffix; throw Object.assign(new Error(code), { code }); };
const need = (condition, suffix) => { if (!condition) fail(suffix); };
const bare = value => value.startsWith('0x') ? value.slice(2) : value;
const prefix = value => '0x' + bare(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(canonical(value));
/** Public timing/resource metrics contain finite fractional milliseconds. They
 * are not signed financial input and must not use the integer-only canonical
 * encoder. Detach them before the private proof package is erased. */
export const detachGenericProofMetrics = metrics => structuredClone(metrics);
const same = (left, right, suffix) => need(canonical(left) === canonical(right), suffix);
const at = (inputs, offset) => digestHex(inputs.slice(offset, offset + 8));
const recursive = proof => ({ publicInputs: proof.publicInputs, proofFields: proof.proofFields, vkFields: proof.vkFields });
const pathForRole = path => ({ index: String(path.index), siblings: path.siblings });
function fields(value, required, optional = []) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'FIELDS');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  need(required.every(key => keys.includes(key)) && keys.every(key => [...required, ...optional].includes(key))
    && keys.every(key => Object.hasOwn(descriptors[key], 'value')), 'FIELDS');
}
function hash(value) { need(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value) && value !== ZERO, 'HASH'); return value; }
function uint(value, maximum = U64) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 77
    && BigInt(value).toString() === value && BigInt(value) <= maximum, 'INTEGER');
  return value;
}
function array(value, length) {
  need(Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === length && Reflect.ownKeys(value).length === length + 1
    && Array.from({ length }, (_, i) => Object.getOwnPropertyDescriptor(value, i)).every(d => d && Object.hasOwn(d, 'value')), 'ARRAY');
}
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
function proofCopy(value, count, digestCount) {
  fields(value, ['proof', 'publicInputs', 'proofFields', 'vkFields'], ['metrics']);
  need(!types.isProxy(value.proof) && value.proof instanceof Uint8Array && value.proof.length > 0
    && value.proof.length <= 2 * 1024 * 1024, 'PROOF_BYTES');
  const result = { proof: Buffer.from(value.proof) };
  for (const [key, length] of [['publicInputs', count], ['proofFields', 458], ['vkFields', 115]]) {
    array(value[key], length);
    result[key] = value[key].map((word, i) => uint(word, key !== 'publicInputs' ? FIELD_MODULUS - 1n : i < digestCount ? 0xffff_ffffn : U64));
  }
  return result;
}
function ownerStatement(inputs) {
  const digests = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
    'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment'];
  return { profile: FUNDED_GRAPH_PROFILE.id, ...Object.fromEntries(digests.map(key => [key, at(inputs, A0[key])])),
    outputs: Array.from({ length: 4 }, (_, slot) => at(inputs, A0.outputs + slot * 8)),
    ...Object.fromEntries(['fundingNotBefore', 'fundingValidUntil', 'settleBefore'].map(key => [key, inputs[A0[key]]])) };
}

/** Pure shape/binding check, NOT proof verification or issuance. Returns a
 * detached private work bundle. Synthetic recursive fields can pass this codec;
 * no native work is authorized until the real keeper/gate/provers accept it. */
export function validateGenericNativeExecutionPreparation(input, expectedDomains) {
  fields(input, PREPARED, OWNER_EXTRAS); fields(expectedDomains, DOMAINS);
  const domains = copy(expectedDomains); DOMAINS.forEach(key => hash(domains[key]));
  const prepared = { authorization: proofCopy(input.authorization, 139, 136),
    capsuleAuthorization: proofCopy(input.capsuleAuthorization, 129, 128),
    reserveCommitment: hash(input.reserveCommitment), reserveNullifier: hash(input.reserveNullifier),
    settleBefore: uint(input.settleBefore), rolePackets: copy(input.rolePackets), providerRiskSalts: copy(input.providerRiskSalts) };
  const a = prepared.authorization.publicInputs, c = prepared.capsuleAuthorization.publicInputs;
  const statement = ownerStatement(a);
  for (const [index, key] of DOMAINS.entries()) need(at(c, index * 8) === domains[key], 'PREPARED_DOMAIN');
  for (const key of ['scope', 'policy', 'asset']) need(statement[key] === domains[key], 'PREPARED_DOMAIN');
  need(at(c, 40) === a0Context(statement), 'PREPARED_CONTEXT');
  need(statement.reserveCommitment === prepared.reserveCommitment && at(c, 48) === prepared.reserveCommitment
    && statement.reserveNullifier === prepared.reserveNullifier && at(c, 56) === prepared.reserveNullifier, 'PREPARED_RESERVE');
  need(statement.settleBefore === prepared.settleBefore && c[128] === prepared.settleBefore, 'PREPARED_CUTOFF');
  fields(prepared.rolePackets, ['ready', 'dependency', 'node']);
  Object.values(prepared.rolePackets).forEach(packets => array(packets, 4)); array(prepared.providerRiskSalts, 4);
  let activeCount = 0, padding = false;
  for (let slot = 0; slot < 4; slot++) {
    const { node: nodes, ready: readies, dependency: dependencies } = prepared.rolePackets;
    const node = nodes[slot], ready = readies[slot], dependency = dependencies[slot];
    fields(node, [...CONTEXT, 'localCapsule', 'action', 'receiptSpendSecret', 'localCapsuleCommitment']);
    fields(dependency, [...CONTEXT, 'dependencyCapsule', 'dependencyCapsuleCommitment']);
    for (const packet of [node, dependency]) {
      need(packet.profile === NATIVE_CAPSULE_PROFILE.id, 'PREPARED_PROFILE');
      for (const key of DOMAINS) need(packet[key] === domains[key], 'PACKET_DOMAIN');
      need(packet.context === at(c, 40) && packet.settleBefore === prepared.settleBefore, 'PACKET_CONTEXT');
    }
    const local = node.localCapsule, dep = dependency.dependencyCapsule;
    // Existing codecs enforce full padding/field shapes, before any proof work.
    localCapsuleToNoir(local); dependencyCapsuleToNoir(dep);
    need(local.slot === slot && dep.targetSlot === slot && local.targetContext === dep.targetContext, 'SLOT_BINDING');
    need(local.payoutCommitment === statement.outputs[slot], 'PAYOUT_BINDING');
    need(node.localCapsuleCommitment === at(c, 64 + slot * 8)
      && node.localCapsuleCommitment === localCapsuleCommitment(node, local), 'LOCAL_BINDING');
    need(dependency.dependencyCapsuleCommitment === at(c, 96 + slot * 8)
      && dependency.dependencyCapsuleCommitment === dependencyCapsuleCommitment(dependency, dep), 'DEPENDENCY_BINDING');
    let previous = -1;
    for (const source of dep.predecessors.slice(0, dep.dependencyCount)) {
      need(source.sourceSlot > previous && source.sourceSlot < slot && nodes[source.sourceSlot].localCapsule.active, 'TOPOLOGICAL_ORDER');
      previous = source.sourceSlot;
      const sourceLocal = nodes[source.sourceSlot].localCapsule;
      for (const [sourceKey, localKey] of [['sourceNodeCommitment', 'nodeCommitment'], ['sourceLocalCommitment', 'localCommitment'],
        ['sourceDispatchId', 'dispatchId'], ...['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(key => [key, key])]) {
        need(source[sourceKey] === sourceLocal[localKey], 'PREDECESSOR_BINDING');
      }
    }
    if (local.active) {
      need(!padding, 'ACTIVE_PREFIX'); activeCount++;
      fields(ready, [...CONTEXT, 'localCapsule', 'action', 'localCapsuleCommitment', 'dependencyCapsuleCommitment']);
      same(ready, { ...Object.fromEntries(CONTEXT.map(key => [key, node[key]])), localCapsule: local, action: node.action,
        localCapsuleCommitment: node.localCapsuleCommitment, dependencyCapsuleCommitment: dependency.dependencyCapsuleCommitment }, 'READY_BINDING');
      hash(node.receiptSpendSecret); hash(prepared.providerRiskSalts[slot]);
      need(nativeTransferActionCommitment(node.action) === local.actionCommitment
        && node.action.settleBefore === prepared.settleBefore, 'ACTION_BINDING');
      for (const key of ['chainDomain', 'receiptKeyCommitment', 'receiptRho']) need(node.action[key] === local[key], 'ACTION_BINDING');
      need(node.action.receiptKeyCommitment === nativeReceiptKeyCommitment(domains.hubDomain, node.receiptSpendSecret), 'RECEIPT_KEY');
      const action = node.action;
      need(action.deliveryRiskCommitment === nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
        ...domains, chainDomain: action.chainDomain, sourceCommitment: action.sourceCommitment,
        destinationCommitment: action.destinationCommitment, amount: action.amount, payoutCommitment: local.payoutCommitment,
        settleBefore: prepared.settleBefore, salt: prepared.providerRiskSalts[slot] }), 'DELIVERY_RISK');
    } else {
      padding = true;
      need(ready === null && node.action === null && node.receiptSpendSecret === ZERO
        && prepared.providerRiskSalts[slot] === null && dep.dependencyCount === 0, 'PADDING');
    }
  }
  need(activeCount >= 1 && activeCount <= 4, 'ACTIVE_COUNT');
  return { prepared, activeCount, domains };
}

function preparationDigest(prepared) {
  return sha(canonical({ ...prepared, ...Object.fromEntries(['authorization', 'capsuleAuthorization'].map(key =>
    [key, { ...recursive(prepared[key]), proofSHA256: sha(prepared[key].proof) }])) }));
}
function publicState(view) {
  return { block: { number: view.header.number, hash: view.header.hash }, pool: copy(view.ledger.publicState), hub: copy(view.state) };
}
function exposure(record) {
  return copy({ stage: record.stage, status: record.status, nativeExposure: record.nativeExposure,
    proof: record.proof ?? null,
    settlementAttempted: record.settlementAttempted, terminalTransactionHash: record.terminal?.transactionHash ?? null,
    failureCode: record.failureCode ?? null });
}
function safeCode(error) {
  return [error?.code, error?.message].find(code => typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,160}$/.test(code))
    ?? 'PAEG_GENERIC_NATIVE_EXECUTION_FAILED';
}

export function assertOwnedGenericNativeExecutionKeeper(value, binding) {
  fields(binding, ['runtime', 'system', 'poolIndex']);
  const actual = keepers.get(value);
  need(actual && actual.runtime === binding.runtime && actual.system === binding.system
    && actual.poolIndex === binding.poolIndex, 'OWNED_KEEPER_CAPABILITY');
  assertOwnedNativeSystem(binding.runtime, binding.system);
}

/** No backend/prover/RPC overrides. Callbacks are fixed here by the trusted
 * bootstrap and must never originate in client input. Only I42 and T131 bytes
 * may reach onPublicProof. Private native/runtime audits use onPrivateAudit.
 * Runtime, observer and provider ownership/lifetimes stay with the bootstrap. */
export function createGenericNativeExecutionKeeper(input, callbacks = {}) {
  fields(input, ['runtime', 'system', 'poolIndex', 'observer', 'solana', 'bitcoin']);
  fields(callbacks, [], ['onStage', 'onProofMetrics', 'onPublicProof', 'onPrivateAudit']);
  const hooks = { ...callbacks }; Object.values(hooks).forEach(fn => need(typeof fn === 'function', 'CALLBACK'));
  const { runtime, system, poolIndex, observer, solana, bitcoin } = input;
  let aborted = false, abortPromise = null, activeWork = null;
  const running = () => need(!aborted, 'ABORTED');
  assertOwnedNativeSystem(runtime, system);
  need((poolIndex === 0 || poolIndex === 1) && !Object.is(poolIndex, -0), 'POOL_INDEX');
  assertTrustedLocalNativeQuorumObserver(observer, runtime, system);
  assertOwnedSolanaRuntime(solana); assertOwnedBitcoinRuntime(bitcoin);
  const pool = system.pools[poolIndex];
  const domains = { scope: bare(pool.scope), policy: bare(pool.policy), asset: bare(pool.assetIdentity),
    hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment) };
  if (!runtimes.has(runtime)) runtimes.set(runtime, { busy: false, pools: new Map() });
  const lifetime = runtimes.get(runtime);
  if (!lifetime.pools.has(pool)) lifetime.pools.set(pool, { operations: new Map(), reserves: new Map() });
  const journal = lifetime.pools.get(pool);
  const owned = () => {
    assertOwnedNativeSystem(runtime, system); assertTrustedLocalNativeQuorumObserver(observer, runtime, system);
    assertOwnedSolanaRuntime(solana); assertOwnedBitcoinRuntime(bitcoin);
  };
  const audit = async (record, extra = {}) => hooks.onPrivateAudit?.({ ...exposure(record), ...extra,
    evm: { transactions: runtime.transactions, receipts: runtime.receipts },
    solana: solana.transfers, bitcoin: bitcoin.transfers });
  const stage = async (record, name) => {
    running(); record.stage = name; await hooks.onStage?.(exposure(record)); running();
  };
  const health = async () => {
    running(); const permit = await observer.health({}); running(); need(permit.status === 'HEALTHY', 'HEALTH_REFUSED');
    return { healthFrom: permit.message.validFrom, healthUntil: permit.message.validUntil, healthSignatures: permit.abiSignatures };
  };
  const send = async (record, label, to, data, terminal = false) => {
    running();
    try {
      const receipt = await runtime.send(label, { to, data });
      if (terminal) { record.terminal.receipt = copy(receipt); record.terminal.transactionHash = receipt.transactionHash; }
      running();
      return receipt;
    } catch (error) {
      if (terminal && error.transactionRecord?.transactionHash) record.terminal.transactionHash = error.transactionRecord.transactionHash;
      throw error;
    } finally { await audit(record); }
  };
  function providersFor(entries, prepared, count) {
    array(entries, count);
    return entries.map((entry, slot) => {
      fields(entry, ['slot', 'family', 'recipientIndex', 'provider']);
      need(entry.slot === slot && !Object.is(entry.slot, -0), 'PROVIDER_SLOT');
      const { family, recipientIndex, provider } = entry;
      need(['SOL', 'BTC'].includes(family) && Number.isInteger(recipientIndex) && recipientIndex >= 0
        && recipientIndex < 2 && !Object.is(recipientIndex, -0), 'PROVIDER_ROUTE');
      need(provider && Object.isFrozen(provider) && ['offer', 'execute', 'reconcile', 'report'].every(key => typeof provider[key] === 'function'), 'PROVIDER_CAPABILITY');
      const packet = prepared.rolePackets.ready[slot], action = packet.action, offer = copy(provider.offer());
      need(offer.acceptedLossClause === NATIVE_ADMISSION_LOSS_CLAUSE && offer.evidencePolicy === packet.localCapsule.evidencePolicy, 'PROVIDER_QUOTE');
      for (const [key, value] of Object.entries(offer.actionTemplate)) need(action[key] === value, 'PROVIDER_QUOTE');
      const rule = observer.rules.find(candidate => candidate.family === (family === 'SOL' ? '2' : '1')
        && nativeAdmissionChainDomain(candidate) === action.chainDomain && nativeAdmissionRuleCommitment(candidate) === offer.evidencePolicy);
      need(rule, 'PROVIDER_CHAIN');
      let native, sourceRaw, destinationRaw, genesis;
      if (family === 'SOL') {
        native = typeof solana.recipientView === 'function' ? solana.recipientView(recipientIndex) : (need(recipientIndex === 0, 'PROVIDER_RECIPIENT'), solana);
        if (native !== solana) assertOwnedSolanaRecipientView(native);
        genesis = base58Decode(native.genesis, 32).toString('hex');
        sourceRaw = base58Decode(native.solver, 32).toString('hex'); destinationRaw = base58Decode(native.recipient, 32).toString('hex');
      } else {
        native = bitcoin; genesis = bitcoin.genesis; sourceRaw = bitcoin.sourceScript; destinationRaw = bitcoin.recipientScripts[recipientIndex];
      }
      need(rule.genesis === genesis, 'PROVIDER_GENESIS');
      for (const [key, rawHex] of [['sourceCommitment', sourceRaw], ['destinationCommitment', destinationRaw]]) {
        need(action[key] === nativeFixtureEndpointCommitment({ family, genesis, asset: rule.asset, rawHex }), 'PROVIDER_RECIPIENT');
      }
      return { slot, family, recipientIndex, provider, native };
    });
  }
  async function terminalState(record) {
    owned(); await assertLocalEvm(runtime);
    need(record.terminal?.transactionHash, 'NO_ORIGINAL_TERMINAL_TRANSACTION');
    const receipt = await runtime.receipt(record.terminal.transactionHash);
    need(receipt && receipt.status === '0x1', 'TERMINAL_NOT_SUCCESSFUL');
    if (record.terminal.receipt) same(receipt, record.terminal.receipt, 'TERMINAL_RECEIPT_CHANGED');
    const transaction = await runtime.transaction(record.terminal.transactionHash);
    need(transaction && transaction.to?.toLowerCase() === pool.address.toLowerCase()
      && transaction.input === record.terminal.calldata && BigInt(transaction.value) === 0n
      && transaction.blockHash === receipt.blockHash, 'TERMINAL_TRANSACTION_CHANGED');
    const view = await readNativeSystemState(runtime, system, poolIndex);
    need(view.ledger.commitments[record.reserveIndex] === prefix(record.reserveCommitment)
      && view.ledger.nullifiers.includes(prefix(record.reserveNullifier)), 'TERMINAL_RESERVE_NOT_CONSUMED');
    same(view.ledger.commitments.slice(record.payoutStart, record.payoutStart + 4), record.outputs.map(prefix), 'TERMINAL_OUTPUTS');
    need(record.tags.every(tag => view.tags.slice(0, Number(view.state.spentTagCount)).includes(prefix(tag))), 'TERMINAL_TAGS');
    record.terminal.receipt = copy(receipt);
    return { outcome: 'SETTLED', receipt: copy(receipt), ...publicState(view) };
  }
  async function execute(request) {
    fields(request, ['ownerOperationRef', 'prepared', 'providers', 'reserveCommitment', 'reserveIndex']);
    owned(); running(); const reference = hash(request.ownerOperationRef);
    const checked = validateGenericNativeExecutionPreparation(request.prepared, domains);
    const { prepared, activeCount } = checked;
    let record, roles = new Set(), proofs = new Set(), receipts = new Map();
    try {
      const reserveCommitment = hash(bare(request.reserveCommitment));
      need(reserveCommitment === prepared.reserveCommitment && Number.isSafeInteger(request.reserveIndex)
        && request.reserveIndex >= 0 && request.reserveIndex < 64 && !Object.is(request.reserveIndex, -0), 'RESERVE_BINDING');
      const digest = preparationDigest(prepared), previous = journal.operations.get(reference);
      if (previous) {
        need(previous.preparedSHA256 === digest && previous.reserveCommitment === reserveCommitment
          && previous.reserveIndex === request.reserveIndex, 'OPERATION_REBOUND');
        if (previous.status === 'SETTLED') return copy(previous.outcome);
        const error = Object.assign(new Error('PAEG_GENERIC_NATIVE_STARTED_NO_RESTART'),
          { code: 'PAEG_GENERIC_NATIVE_STARTED_NO_RESTART', execution: exposure(previous) });
        throw error;
      }
      need(!lifetime.busy, 'KEEPER_BUSY'); need(!journal.reserves.has(reserveCommitment), 'RESERVE_ALREADY_STARTED');
      const providers = providersFor(request.providers, prepared, activeCount);
      running();
      record = { status: 'STARTED', stage: 'validate-issued-reserve', preparedSHA256: digest, reserveCommitment,
        reserveNullifier: prepared.reserveNullifier, reserveIndex: request.reserveIndex, nativeExposure: [],
        settlementAttempted: false, terminal: null, outcome: null };
      journal.operations.set(reference, record); journal.reserves.set(reserveCommitment, reference); lifetime.busy = true;
      activeWork = { record, roles };
      await assertLocalEvm(runtime);
      let view = await readNativeSystemState(runtime, system, poolIndex);
      need(view.ledger.commitments.indexOf(prefix(reserveCommitment)) === record.reserveIndex
        && view.ledger.tree.path(record.reserveIndex).leaf === prefix(reserveCommitment), 'RESERVE_NOT_ISSUED');
      need(!view.ledger.nullifiers.includes(prefix(prepared.reserveNullifier))
        && view.ledger.publicState.liveReservations > 0, 'RESERVE_NOT_UNSPENT');
      const role = (purpose, modes) => { running(); const facade = createProofProcess({ purpose, modes }); roles.add(facade); return facade; };
      const close = async facade => { await facade.close(); roles.delete(facade); };
      const release = proof => { proofs.delete(proof); wipePrivate(proof); };
      const prove = async (facade, mode, input, label) => {
        let proof;
        record.proof = { mode, label };
        try { running(); proof = await facade.prove(mode, input.inputs, input.expectedPublicInputs, label); }
        finally { wipePrivate(input); }
        proofs.add(proof); running(); need(proof.metrics.acceptedResult === true, 'PROOF_INCOMPLETE');
        await hooks.onProofMetrics?.({ label, mode, proofSHA256: sha(proof.proof),
          publicInputsSHA256: sha(canonical(proof.publicInputs)), metrics: detachGenericProofMetrics(proof.metrics) });
        running();
        record.proof = null;
        return proof;
      };
      const publish = async (mode, proof, label) => {
        running();
        need((mode === 'admission' && proof.publicInputs.length === 42)
          || (mode === 'fulfill' && proof.publicInputs.length === 131), 'PUBLIC_PROOF_ALLOWLIST');
        await hooks.onPublicProof?.({ label, mode, proof: Buffer.from(proof.proof), publicInputs: [...proof.publicInputs] });
        running();
      };
      const dependencyRole = role('dependency', ['dependency']), readyRole = role('ready', ['ready']), admissionRole = role('receipt', ['admission']);
      for (const { slot, family, recipientIndex, provider, native } of providers) {
        await stage(record, `native-leg-${slot + 1}-checkpoint-and-private-readiness`);
        const checkpointUntil = ((await runtime.time()) + 60n).toString(); running();
        const cp = await observer.checkpoint({ poolIndex, requestId: prefix(randomBytes(32).toString('hex')),
          validUntil: checkpointUntil });
        const m = cp.message;
        await send(record, `authorize readiness checkpoint ${slot + 1}`, system.hub.address,
          system.hub.data(CHECKPOINT_SIGNATURE, [m.pool, m.expectedPoolSequence, m.expectedHubStateSequence, m.requestId, m.validUntil, cp.abiSignatures]));
        view = await readNativeSystemState(runtime, system, poolIndex);
        const checkpointIndex = Number(view.checkpointCount) - 1;
        need(view.checkpointTree.path(checkpointIndex).leaf === view.snapshotDigest, 'RECORDED_CHECKPOINT');
        const action = prepared.rolePackets.ready[slot].action, readyFrom = view.snapshot.timestamp;
        const readyUntil = [BigInt(readyFrom) + 3600n, BigInt(action.executionUntil), BigInt(prepared.settleBefore)]
          .reduce((left, right) => left < right ? left : right).toString();
        const dependencyPacket = prepared.rolePackets.dependency[slot];
        const prerequisiteReads = dependencyPacket.dependencyCapsule.predecessors.slice(0, dependencyPacket.dependencyCapsule.dependencyCount).map(source => {
          const receipt = receipts.get(source.sourceSlot); need(receipt, 'PREREQUISITE_MISSING');
          return { sourceSlot: source.sourceSlot, opening: receipt.opening, path: pathForRole(view.receiptTree.path(receipt.index)) };
        });
        const dependency = await prove(dependencyRole, 'dependency', prepareNativeDependency({ packet: dependencyPacket,
          snapshot: view.snapshot, snapshotDigest: view.snapshotDigest, receipts: prerequisiteReads, revokedEntries: view.revokedEntries,
          validFrom: readyFrom, validUntil: readyUntil }), `generic-native-dependency-${slot}`);
        const readyInput = prepareNativeReady({ packet: prepared.rolePackets.ready[slot], capsuleProof: recursive(prepared.capsuleAuthorization),
          dependencyProof: recursive(dependency), snapshot: view.snapshot, snapshotDigest: view.snapshotDigest,
          reservePath: pathForRole(view.ledger.tree.path(record.reserveIndex)), poolSpentEntries: view.ledger.nullifiers, readyFrom, readyUntil });
        release(dependency);
        const ready = await prove(readyRole, 'ready', readyInput, `generic-native-ready-${slot}`);
        const deliveryRiskSalt = prepared.providerRiskSalts[slot];
        await stage(record, `native-leg-${slot + 1}-actual-sign-send-finality`);
        const leg = { slot, family, attemptedAt: new Date().toISOString(), dispatchReturned: false, deliveryConfirmed: false, admitted: false };
        record.nativeExposure.push(leg);
        let dispatched, delivered, certificate;
        try {
          dispatched = await provider.execute({ readyProof: { proof: ready.proof, publicInputs: ready.publicInputs }, action, deliveryRiskSalt });
          leg.dispatchReturned = true; running(); await audit(record); running();
          if (family === 'SOL') await native.observe(dispatched.signedNative.signature,
            { expectedLamports: action.amount, commitment: 'finalized', timeoutMs: 120000 });
          else await bitcoin.confirm(dispatched.signedNative.txid);
          running();
          delivered = await provider.reconcile(); leg.deliveryConfirmed = true;
          leg.confirmedAt = new Date().toISOString(); running(); await audit(record); running();
          const evidenceFrom = (await runtime.time()).toString(); running();
          const opening = { hubDomain: domains.hubDomain, registryCommitment: domains.registryCommitment,
            globalEffectId: delivered.globalEffectId, scope: domains.scope, policy: domains.policy,
            localCommitment: at(ready.publicInputs, 48), dispatchId: at(ready.publicInputs, 56), chainDomain: action.chainDomain,
            evidencePolicy: at(ready.publicInputs, 72), actionCommitment: at(ready.publicInputs, 80), payoutCommitment: at(ready.publicInputs, 88),
            validFrom: evidenceFrom, validUntil: prepared.settleBefore, receiptKeyCommitment: action.receiptKeyCommitment, receiptRho: action.receiptRho };
          certificate = copy(await observer.certify({ family, recipientIndex,
            nativeId: family === 'SOL' ? delivered.signedNative.signature : delivered.signedNative.txid,
            action, opening, readyInputs: ready.publicInputs, providerKey: delivered.providerKey,
            dispatchSignedAt: delivered.dispatchStatement.signedAt, dispatchSignature: delivered.dispatchSignature }));
          await stage(record, `native-leg-${slot + 1}-genuine-quorum-admission`);
          view = await readNativeSystemState(runtime, system, poolIndex);
          const path = view.checkpointTree.path(checkpointIndex);
          const admissionInput = prepareNativeAdmission({ readyProof: recursive(ready), registry: observer.registry,
            rule: certificate.rule, rulePath: certificate.rulePath, checkpointPath: { index: String(path.index), siblings: path.siblings.map(bare) },
            action, effect: certificate.effect, opening, observation: certificate.observation,
            providerKey: delivered.providerKey, dispatchSignedAt: delivered.dispatchStatement.signedAt,
            dispatchSignature: delivered.dispatchSignature, deliveryRiskClause: NATIVE_ADMISSION_LOSS_CLAUSE, deliveryRiskSalt,
            attesterIndexes: certificate.attesterIndexes, attesterSignatures: certificate.attesterSignatures,
            admissionFrom: evidenceFrom, admissionUntil: prepared.settleBefore },
          { expectedRegistryCommitment: domains.registryCommitment, acceptedCheckpointRoot: bare(view.checkpointTree.root) });
          release(ready);
          const admitted = await prove(admissionRole, 'admission', admissionInput, `generic-native-admission-${slot}`);
          await publish('admission', admitted, `admission-${slot}`);
          need(await system.verify('admission', admitted.proof, admitted.publicInputs), 'ADMISSION_VERIFIER');
          const beforeCount = Number((await readNativeSystemState(runtime, system, poolIndex)).state.receiptCount);
          await send(record, `admit native effect ${slot + 1} once`, system.hub.address,
            system.hub.proofData(admitted.proof, admitted.publicInputs, await health()));
          release(admitted);
          view = await readNativeSystemState(runtime, system, poolIndex);
          need(Number(view.state.receiptCount) === beforeCount + 1
            && view.commitments[beforeCount] === prefix(nativeReceiptCommitment(opening)), 'ADMISSION_STATE');
          receipts.set(slot, { opening, index: beforeCount }); leg.admitted = true;
        } finally {
          leg.gatePhase = provider.report().phase;
          wipePrivate(dispatched); wipePrivate(delivered); wipePrivate(certificate);
        }
      }
      await close(dependencyRole); await close(readyRole); await close(admissionRole);
      await stage(record, 'prove-four-scoped-node-completions');
      view = await readNativeSystemState(runtime, system, poolIndex);
      const completionFrom = view.snapshot.timestamp, completionUntil = prepared.settleBefore;
      const nodeRole = role('node', ['node']), nodeProofs = [];
      for (let slot = 0; slot < 4; slot++) {
        const receipt = receipts.get(slot);
        nodeProofs.push(await prove(nodeRole, 'node', prepareNativeNode({ packet: prepared.rolePackets.node[slot],
          capsuleProof: recursive(prepared.capsuleAuthorization), evidenceState: view.evidence, evidenceStateDigest: view.state.evidenceState,
          receipt: receipt ? { opening: receipt.opening, path: pathForRole(view.receiptTree.path(receipt.index)) } : null,
          revokedEntries: view.revokedEntries, validFrom: completionFrom, validUntil: completionUntil }), `generic-native-node-${slot}`));
      }
      await close(nodeRole);
      for (const receipt of receipts.values()) wipePrivate(receipt); receipts.clear();
      wipePrivate(prepared.rolePackets); wipePrivate(prepared.providerRiskSalts); wipePrivate(prepared.capsuleAuthorization);
      await stage(record, 'assemble-generic-global-fulfillment');
      const assembler = role('assembler', ['aggregate_pair', 'aggregate_all', 'fulfill']), pairs = [];
      record.tags = nodeProofs.map(proof => at(proof.publicInputs, 40));
      for (let pair = 0; pair < 2; pair++) {
        const selected = nodeProofs.slice(pair * 2, pair * 2 + 2);
        const input = prepareNativeAggregatePair({ nodeProofs: selected.map(recursive) });
        selected.forEach(release); pairs.push(await prove(assembler, 'aggregate_pair', input, `generic-native-pair-${pair}`));
      }
      nodeProofs.length = 0;
      const allInput = prepareNativeAggregateAll({ pairProofs: pairs.map(recursive) }); pairs.forEach(release); pairs.length = 0;
      const all = await prove(assembler, 'aggregate_all', allInput, 'generic-native-all-slots');
      view = await readNativeSystemState(runtime, system, poolIndex);
      record.outputs = Array.from({ length: 4 }, (_, slot) => at(prepared.authorization.publicInputs, A0.outputs + slot * 8));
      const fulfillInput = prepareNativeFulfillment({ ownerProof: recursive(prepared.authorization), aggregateProof: recursive(all),
        reservePath: pathForRole(view.ledger.tree.path(record.reserveIndex)), expectedBindings: { ...domains,
          acceptedPoolRoot: view.ledger.tree.root, evidenceState: bare(view.state.evidenceState), reserveNullifier: prepared.reserveNullifier,
          outputs: record.outputs, terminalReceiptTags: record.tags, settleBefore: prepared.settleBefore,
          validFrom: completionFrom, validUntil: completionUntil } });
      release(all); wipePrivate(prepared.authorization);
      const fulfillment = await prove(assembler, 'fulfill', fulfillInput, 'generic-native-fulfill'); await close(assembler);
      await publish('fulfill', fulfillment, 'fulfill');
      need(await system.verify('fulfill', fulfillment.proof, fulfillment.publicInputs), 'TERMINAL_VERIFIER');
      record.payoutStart = view.ledger.publicState.leaves;
      const beforePool = copy(view.ledger.publicState), beforeTags = Number(view.state.spentTagCount);
      await stage(record, 'fresh-native-health-and-atomic-private-payout');
      // Obtain health after the final proof/verification, immediately before the
      // one T send. Its calldata is retained for exact read-only reconciliation.
      const calldata = pool.fulfillData(fulfillment.proof, fulfillment.publicInputs, await health()); release(fulfillment);
      record.terminal = { calldata, transactionHash: null, receipt: null };
      record.settlementAttempted = true;
      await send(record, 'atomically settle complete native graph', pool.address, calldata, true);
      const result = await terminalState(record);
      running();
      need(result.pool.backedAmount === beforePool.backedAmount
        && result.pool.liveReservations === beforePool.liveReservations - 1
        && result.pool.leaves === beforePool.leaves + 4
        && Number(result.hub.spentTagCount) === beforeTags + 4, 'SETTLEMENT_STATE');
      record.outcome = immutable(copy(result)); record.status = 'SETTLED'; record.stage = 'settled';
      return copy(record.outcome);
    } catch (error) {
      if (!record) throw error;
      record.status = aborted ? 'CANCELLED_NO_RESTART' : 'FAILED_NO_RESTART';
      record.failureCode = aborted ? 'PAEG_GENERIC_NATIVE_ABORTED' : safeCode(error);
      try { await audit(record, { error }); } catch { /* Preserve the original failure and retained transaction. */ }
      throw Object.assign(new Error(record.failureCode), { code: record.failureCode, execution: exposure(record) });
    } finally {
      // close() reaps an in-flight child, including failed worker starts. Keep
      // only compact bindings and the original public terminal receipt/calldata.
      for (const facade of roles) { try { await facade.close(); } catch { /* No subsequent work or resend is permitted. */ } }
      for (const proof of proofs) wipePrivate(proof);
      for (const receipt of receipts.values()) wipePrivate(receipt);
      roles.clear(); proofs.clear(); receipts.clear(); wipePrivate(prepared);
      if (record) { lifetime.busy = false; activeWork = null; }
    }
  }
  const keeper = Object.freeze({
    execute,
    abort() {
      // Latch before the first await: execute cannot create another proof role
      // or initiate another native/EVM send while shutdown reaps the children.
      // A completed terminal record is immutable and remains reconcilable.
      aborted = true;
      const work = activeWork;
      if (work && work.record.status !== 'SETTLED') {
        work.record.status = 'CANCELLED_NO_RESTART';
        work.record.failureCode = 'PAEG_GENERIC_NATIVE_ABORTED';
      }
      abortPromise ??= (async () => {
        const proofRoles = [];
        // Snapshot first: execute's finally may also remove closed facades.
        for (const facade of [...(work?.roles ?? [])]) {
          try {
            const closed = await facade.close(), report = facade.report();
            proofRoles.push({ ...closed, mode: report?.mode ?? null,
              childPID: report?.childPID ?? null, exit: report?.exit ?? null });
          } catch (error) { proofRoles.push({ closed: false, exited: false, code: safeCode(error) }); }
        }
        return immutable({ aborted: true, exited: proofRoles.every(result => result.exited === true), proofRoles });
      })();
      return abortPromise;
    },
    inspect(ownerOperationRef) {
      owned(); const record = journal.operations.get(hash(ownerOperationRef)); need(record, 'UNKNOWN_OPERATION');
      return { ...exposure(record), outcome: record.outcome && copy(record.outcome) };
    },
    async reconcile(ownerOperationRef) {
      owned(); need(!lifetime.busy, 'KEEPER_BUSY');
      const record = journal.operations.get(hash(ownerOperationRef)); need(record, 'UNKNOWN_OPERATION');
      lifetime.busy = true;
      try {
        const current = await terminalState(record);
        // The original successful receipt can resolve an interrupted return.
        // Missing/failed/pending receipts never authorize a replacement send.
        record.outcome ??= immutable(copy(current)); record.status = 'SETTLED'; record.stage = 'settled';
        return { ...copy(record.outcome), current: publicStateFromResult(current) };
      } finally { lifetime.busy = false; }
    },
  });
  keepers.set(keeper, { runtime, system, poolIndex }); return keeper;
}
function publicStateFromResult(result) { return { block: result.block, pool: result.pool, hub: result.hub }; }
