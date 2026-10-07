import {validatePreparedGraphDependencies} from './prepared-graph-dependencies-v1.mjs';
import {buildOwnerNativeGraphRoute} from './owner-native-graph-review-v1.mjs';
/** Private execution keeper for the accepted four-slot flat protocol.
 * The disposable account coordinator gets opaque operation references. This
 * keeper retains scoped packets and original outcomes, never an owner key.
 * Its survival and trusted local OS are explicit availability assumptions.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { types } from 'node:util';
import { Vault } from '../../../../../omnichain-product/src/vault.mjs';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { nativeAdmissionRuleCommitment, nativeAdmissionRuleRoot } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { assertOwnedFlatSystem } from '../ops/deploy-system.mjs';
import { assertOwnedFlatOperatorQuorum, ownedFlatOperatorQuorumBindings } from '../ops/native-operators.mjs';
import { assertOwnedFlatNativeProvider, ownedFlatNativeProviderReview } from '../solvers/native-provider.mjs';
import { assertOwnedFlatEvmVaultProvider, ownedFlatEvmVaultProviderReview } from '../solvers/evm-vault-provider.mjs';
import { createFlatSystemStateReader } from './flat-system-state.mjs';
import { createFlatTerminalObserver } from './flat-terminal-observer.mjs';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, canonicalField } from './commitments.mjs';
import { decodeStatement, joinReadiness, joinAdmission, joinSettlement } from './statements.mjs';
import { buildDependencyInputs, buildReadyInputs } from './readiness-inputs.mjs';
import { buildAdmissionInputs } from './admission-inputs.mjs';
import { buildNodeInputs, buildSettlementInputs } from './completion-inputs.mjs';
import { flatCompletionWindow } from './flat-completion-window.mjs';
import { privateFailureDiagnostic } from './failure-diagnostics.mjs';
import { recoveryWitness } from './funding-inputs.mjs';
import { encodeFlatTransaction } from './transaction-codec.mjs';
import { withFlatHash, loadFlatABI, createFlatProofRunner } from '../../../proof-workers/scoped-proof-tools.mjs';

export const FLAT_EXECUTION_PROFILE = 'OWNED_FLAT_EXECUTION_KEEPER_V1';
const owners = new WeakMap(), ZERO = '0'.repeat(64), MAX_OPERATIONS = 8;
const fresh = () => randomBytes(32).toString('hex');
const copy = value => JSON.parse(canonical(value));
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const dataHash = data => createHash('sha256').update(Buffer.from(data.slice(2), 'hex')).digest('hex');
const prefix = value => '0x' + value;
const bare = value => { assert.ok(typeof value === 'string' && value.length === 66 && /^0x[0-9a-f]{64}$/.test(value)); return value.slice(2); };
const reference = value => bytes32(value, true);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(copy(value));
const path = opening => ({ root: opening.root, index: opening.index, siblings: [...opening.siblings] });
const shaPath = opening => ({ root: bare(opening.root), index: opening.index, siblings: opening.siblings.map(bare) });
const shaLeafPath = opening => ({ leaf: bare(opening.leaf), index: opening.index, siblings: opening.siblings.map(bare) });
const fieldLeafPath = opening => ({ leaf: opening.leaf, index: opening.index, siblings: [...opening.siblings] });
function notePath(view, commitment) {
  const position = view.ledger.commitments.indexOf(prefix(commitment));
  assert.ok(position >= 0, 'FLAT_EXECUTION_NOTE_NOT_INCLUDED'); return view.ledger.tree.path(position);
}
function receiptPath(view, leaf) {
  const position = view.receiptLeaves.indexOf(leaf);
  assert.ok(position >= 0, 'FLAT_EXECUTION_RECEIPT_NOT_INCLUDED'); return path(view.receiptTree.path(position));
}
const healthFields = permit => ({ healthFrom: permit.message.validFrom,
  healthUntil: permit.message.validUntil, healthSignatures: permit.abiSignatures });

export function assertOwnedFlatNativeExecution(capability, binding) {
  const state = owners.get(capability); assert.ok(state, 'FLAT_EXECUTION_OWNED_CAPABILITY'); state.live();
  for (const key of ['runtime', 'system', 'poolIndex']) assert.equal(state[key], binding[key], 'FLAT_EXECUTION_OWNED_BINDING');
}

/** Original private retained preparation only, never caller-supplied route data. */
export function ownedFlatManualEvmGraphReview(capability, reference, binding) {
  assertOwnedFlatNativeExecution(capability, binding);
  return owners.get(capability).manualReview(reference);
}

/** Validate all retained openings before the source reservation can be sent.
 * This is host framing, not a replacement for atomic onchain U/S verification. */
export async function validateFlatExecutionPreparation(raw, domain, hashFields) {
  const prepared = copy(raw); exactRecord(prepared, ['authorization', 'rolePackets']);
  exactRecord(prepared.authorization, ['proof', 'publicInputs']);
  assert.ok(typeof prepared.authorization.proof === 'string' && prepared.authorization.proof.length > 0
    && prepared.authorization.proof.length % 64 === 0 && /^[0-9a-f]+$/.exec(prepared.authorization.proof)?.[0] === prepared.authorization.proof,
  'FLAT_EXECUTION_U_PROOF_BYTES');
  const u = decodeStatement('authorization', prepared.authorization.publicInputs), packets = prepared.rolePackets;
  exactRecord(packets, ['reservation', 'recovery', 'assembler', 'local', 'dependency']);
  fixedArray(packets.local, 4); fixedArray(packets.dependency, 4);
  const codec = createCommitmentCodec({ hashFields });
  assert.equal(await codec.domainCommitment(domain), u.domainCommitment, 'FLAT_EXECUTION_DOMAIN');
  const core = packets.reservation.core.value;
  async function opening(name, value, index) {
    exactRecord(value, ['value', 'blind', 'leaf', 'index', 'siblings']);
    assert.equal(value.index, index); bytes32(value.blind, true); canonicalField(value.leaf, true); fixedArray(value.siblings, 4);
    const leaf = await codec[name + 'Leaf'](u.domainCommitment, value.value, value.blind);
    assert.equal(leaf, value.leaf, 'FLAT_EXECUTION_LEAF');
    assert.equal(await codec.membershipRoot(u.domainCommitment, 1, leaf, value.siblings, index), u.envelope, 'FLAT_EXECUTION_ENVELOPE');
  }
  async function selected(packet, name, index, extras = []) {
    exactRecord(packet, ['domainCommitment', 'envelope', 'domain', 'core', name, ...extras]);
    assert.equal(packet.domainCommitment, u.domainCommitment); assert.equal(packet.envelope, u.envelope);
    assert.deepEqual(packet.domain, domain); assert.deepEqual(packet.core.value, core);
    await opening('core', packet.core, 0); await opening(name, packet[name], index);
  }
  await selected(packets.reservation, 'funding', 1);
  await selected(packets.recovery, 'recovery', 2);
  await selected(packets.assembler, 'settlement', 3, ['payouts']); fixedArray(packets.assembler.payouts, 4);
  for (let slot = 0; slot < 4; slot++) {
    await selected(packets.local[slot], 'local', 4 + slot, ['action', 'receiptSpendSecret']);
    await selected(packets.dependency[slot], 'dependency', 8 + slot);
    await opening('payout', packets.assembler.payouts[slot], 12 + slot);
    assert.equal(packets.local[slot].local.value.slot, String(slot));
    assert.equal(packets.dependency[slot].dependency.value.targetSlot, String(slot));
  }
  validatePreparedGraphDependencies(packets);
  const funding = packets.reservation.funding.value, recovery = packets.recovery.recovery.value;
  assert.equal(funding.reserveCommitment, core.reserveCommitment);
  for (const key of ['reserveCommitment', 'reserveNullifier', 'settleBefore']) assert.equal(recovery[key], core[key]);
  return detached({ prepared, binding: { domainCommitment: u.domainCommitment, envelope: u.envelope,
    inputCommitment: funding.inputCommitment, inputNullifier: funding.inputNullifier,
    reserveCommitment: core.reserveCommitment, reserveNullifier: core.reserveNullifier,
    changeCommitment: funding.changeCommitment, recoveryCommitment: recovery.recoveryCommitment,
    settleBefore: core.settleBefore, authorizationPublicInputsSHA256: digest(prepared.authorization.publicInputs) } });
}

export async function createFlatNativeExecution(input, callbacks = {}) {
  assert.ok(input && typeof input === 'object' && !types.isProxy(input), 'FLAT_EXECUTION_INPUT');
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'bitcoin', 'solana', 'quorum',
    ...(Object.hasOwn(input, 'evmDelivery') ? ['evmDelivery'] : [])]);
  const { runtime, system, poolIndex, bitcoin, solana, quorum } = input;
  const evmDelivery = input.evmDelivery ?? null;
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  assert.notEqual(system.deploymentProfile, 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2', 'APPEND_ONLY_GRAPH_RUNTIME_NOT_RELEASED');
  assert.ok(poolIndex === 0 || poolIndex === 1, 'FLAT_EXECUTION_POOL');
  // The actual quorum reconstructed the complete registered rules tree at
  // bootstrap. Caller-selected families or omitted runtimes cannot narrow it.
  const bindings = ownedFlatOperatorQuorumBindings(quorum, { runtime, system });
  for (const [name, capability] of Object.entries({ bitcoin, solana, evmDelivery }))
    assert.equal(capability, bindings[name], 'FLAT_EXECUTION_QUORUM_CAPABILITY');
  const nativeRuntimes = { '1': bitcoin, '2': solana, '3': evmDelivery };
  const families = bindings.families;
  for (const family of families)
    assertOwnedFlatOperatorQuorum(quorum, { runtime, system, nativeRuntime: nativeRuntimes[family], family });
  assert.ok(Object.keys(callbacks).every(key => ['onStage', 'onProof', 'onPrivateAudit'].includes(key)), 'FLAT_EXECUTION_CALLBACKS');
  const onStage = callbacks.onStage ?? (async () => {}), onProof = callbacks.onProof ?? (async () => {}),
    onPrivateAudit = callbacks.onPrivateAudit ?? (async () => {});
  for (const callback of [onStage, onProof, onPrivateAudit]) assert.equal(typeof callback, 'function');
  const pool = system.pools[poolIndex], reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const terminalObserver = await createFlatTerminalObserver({ runtime, system, poolIndex });
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'flat-execution-'));
  const vault = new Vault(join(directory, 'operations.vault')); let password = fresh();
  let record = await vault.create({ version: 1, profile: FLAT_EXECUTION_PROFILE,
    pool: pool.address, domainCommitment: pool.domainCommitment, operations: [] }, password);
  assert.deepEqual(await vault.read(password), record);
  const providerSets = new Map(), abis = {}, proofs = createFlatProofRunner({ onProof });
  let closed = false, poisoned = false, busy = false, cancelled = false, activeDone = Promise.resolve(), releaseActive;
  const live = () => assert.ok(!closed && !poisoned, 'FLAT_EXECUTION_UNAVAILABLE');
  async function healthy() { live(); assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
    assert.deepEqual(await vault.read(password), record, 'FLAT_EXECUTION_STORAGE_CHANGED'); }
  async function write(change) {
    try { await healthy(); const next = await vault.update(password, record.revision, old => change(copy(old)));
      assert.deepEqual(await vault.read(password), next); record = next; }
    catch (error) { poisoned = true; throw error; }
  }
  function operation(ref) { reference(ref); const item = record.data.operations.find(value => value.reference === ref);
    assert.ok(item, 'FLAT_EXECUTION_ORIGINAL_PREPARATION_REQUIRED'); return item; }
  async function update(ref, values) { await write(state => ({ ...state, operations: state.operations.map(item =>
    item.reference === ref ? { ...item, ...copy(values) } : item) })); }
  async function stage(ref, name) { assert.ok(!cancelled, 'FLAT_EXECUTION_CANCELLED');
    await update(ref, { stage: name }); await onStage({ reference: ref, stage: name }); }
  async function exclusive(work) { live(); assert.ok(!busy && !cancelled, 'FLAT_EXECUTION_BUSY'); busy = true;
    activeDone = new Promise(resolve => { releaseActive = resolve; });
    try { await healthy(); return await work(); } finally { busy = false; releaseActive(); releaseActive = null; } }
  async function abi(name) { abis[name] ??= await loadFlatABI(name); return abis[name]; }
  async function prove(ref, name, job, label) { await stage(ref, 'prove-' + label); return proofs.prove(name, job, label); }
  async function send(ref, kind, target, calldata) {
    const entry = operation(ref), key = kind === 'recovery' ? 'recoverySubmission' : 'settlementSubmission';
    assert.equal(entry[key], null, 'FLAT_EXECUTION_NO_RESEND');
    const submission = { target, calldata, calldataSHA256: dataHash(calldata), transactionHash: null };
    await update(ref, { [key]: submission });
    const receipt = await runtime.send('flat-execution-' + kind + '-' + ref, { to: target, data: calldata });
    await update(ref, { [key]: { ...submission, transactionHash: bare(receipt.transactionHash) } });
    return receipt;
  }
  async function observedSubmission(ref, kind) {
    const entry = operation(ref), saved = entry[kind === 'recovery' ? 'recoverySubmission' : 'settlementSubmission'];
    assert.ok(saved, 'FLAT_EXECUTION_NO_TERMINAL_SUBMISSION');
    return terminalObserver.observe({ kind, submission: detached(saved), binding: detached(entry.binding),
      statement: detached(kind === 'recovery' ? entry.recoveryStatement : entry.settlementStatement) });
  }
  async function checkpoint(ref) {
    const permit = await quorum.checkpoint({ poolIndex, requestId: fresh() }), message = permit.message;
    await runtime.send('flat-execution-checkpoint-' + ref, { to: system.hub.address,
      data: encodeFlatTransaction('recordCheckpoint', { pool: pool.address, expectedPoolSequence: message.expectedPoolSequence,
        expectedHubStateSequence: message.expectedHubStateSequence, requestId: message.requestId,
        validUntil: message.validUntil, signatures: permit.abiSignatures }) });
    const view = await reader.read(); return { view, recorded: view.checkpoints.at(-1) };
  }
  async function expose(ref, selected, local, dependencyPacket) {
    const entry = operation(ref), { view, recorded } = await checkpoint(ref);
    const authorization = await reader.authorizationPath(view, entry.binding.envelope);
    const readyFrom = recorded.snapshot.timestamp, cutoff = BigInt(entry.binding.settleBefore);
    const dependencyABI = await abi('dependency'), readyABI = await abi('ready');
    const predecessorSlots = dependencyPacket.dependency.value.predecessors
      .slice(0, Number(dependencyPacket.dependency.value.dependencyCount)).map(value => Number(value.sourceSlot));
    const incoming = predecessorSlots.map(slot => { const receipt = operation(ref).receipts.find(value => value.slot === slot);
      assert.ok(receipt, 'FLAT_EXECUTION_PREDECESSOR_NOT_ADMITTED'); return { opening: receipt.opening, path: receiptPath(view, receipt.leaf) }; });
    const readyUntil = String([BigInt(readyFrom) + 7200n, cutoff, BigInt(local.action.executionUntil),
      ...incoming.map(value => BigInt(value.opening.validUntil))].reduce((a, b) => a < b ? a : b));
    assert.ok(BigInt(readyUntil) > BigInt(readyFrom), 'FLAT_EXECUTION_READY_WINDOW_CLOSED');
    const pJob = await withFlatHash(hashFields => buildDependencyInputs({ packet: dependencyPacket, authorization,
      snapshot: recorded.snapshot, readyFrom, readyUntil, predecessorReceipts: incoming, revokedEntries: view.revokedEntries },
    { hashFields, abi: dependencyABI }));
    const rJob = await withFlatHash(hashFields => buildReadyInputs({ packet: local, authorization, snapshot: recorded.snapshot,
      readyFrom, readyUntil, reservePath: shaPath(notePath(view, entry.binding.reserveCommitment)),
      poolSpentEntries: [...view.ledger.nullifiers.map(bare), ...Array(64 - view.ledger.nullifiers.length).fill(ZERO)],
      readinessBlind: fresh() }, { hashFields, abi: readyABI }));
    joinReadiness(pJob.statement, rJob.statement);
    const dependency = await prove(ref, 'dependency', pJob, 'leg-' + selected.slot + '-dependency');
    const readiness = await prove(ref, 'ready', rJob, 'leg-' + selected.slot + '-readiness');
    await stage(ref, 'dispatch-native-leg-' + selected.slot);
    await update(ref, { exposures: [...operation(ref).exposures,
      { slot: selected.slot, family: selected.family, status: 'POSSIBLE', nativeId: null }] });
    const delivery = await selected.provider.execute({ dependencyProof: dependency, readyProof: readiness,
      readinessOpening: rJob.admissionOpening, action: local.action, deliveryRiskSalt: selected.deliveryRiskSalt,
      receiptSpendSecret: local.receiptSpendSecret });
    await update(ref, { exposures: operation(ref).exposures.map(value => value.slot === selected.slot
      ? { ...value, status: 'BROADCAST', nativeId: delivery.nativeId } : value) });
    if (selected.family === '1') await bitcoin.confirm(delivery.nativeId);
    else if (selected.family === '2')
      assert.equal((await solana.observe(delivery.nativeId, { timeoutMs: 45_000 })).status, 'observed', 'FLAT_EXECUTION_SOL_FINALITY');
    // Family 3 reconciles the original signed EVM wire through its branded
    // vault observer. A receipt status or an extra caller callback is no grant.
    const observed = await selected.provider.reconcile(); assert.equal(observed.phase, 'OBSERVED', 'FLAT_EXECUTION_NATIVE_FINALITY');
    await update(ref, { exposures: operation(ref).exposures.map(item => item.slot === selected.slot ? { ...item, status: 'DELIVERED' } : item) });
    await onPrivateAudit({ reference: ref, stage: 'native-delivered', slot: selected.slot, delivery: observed });
    // A bounded acceptance harness may interrupt here. The durable exposure
    // is already present, and later execution cannot sign or send it again.
    await stage(ref, 'native-delivered-' + selected.slot);
    const facts = await quorum.facts({ family: selected.family, recipientIndex: String(selected.recipientIndex),
      nativeId: observed.nativeId, wireKeyCommitment: local.action.receiptKeyCommitment });
    const current = await reader.read(), checkpointIndex = current.checkpoints.findIndex(item => item.digest === rJob.statement.checkpoint);
    assert.ok(checkpointIndex >= 0, 'FLAT_EXECUTION_CHECKPOINT_NOT_RETAINED');
    const descriptor = rJob.admissionOpening.descriptor, fact = facts.certificates[0].facts;
    const opening = Object.fromEntries(['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment', 'dispatchId',
      'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(name => [name, descriptor[name]]));
    Object.assign(opening, { globalEffectId: fact.nativeGid, validFrom: fact.observation.evidenceFrom,
      validUntil: String(BigInt(fact.observation.evidenceUntil) < cutoff ? BigInt(fact.observation.evidenceUntil) : cutoff),
      receiptKeyCommitment: local.action.receiptKeyCommitment, receiptRho: local.action.receiptRho });
    const admissionABI = await abi('admission');
    const iJob = await withFlatHash(hashFields => buildAdmissionInputs({ readyStatement: rJob.statement,
      readinessOpening: rJob.admissionOpening, action: local.action, receiptSpendSecret: local.receiptSpendSecret,
      receiptOpening: opening, checkpointOpening: path(current.checkpointTree.path(checkpointIndex)), registry: system.registry,
      rule: selected.rule, rulePath: selected.rulePath, provider: { publicKey: observed.providerKey,
        dispatchStatement: observed.dispatchStatement, signature: observed.dispatchSignature, deliveryRiskSalt: selected.deliveryRiskSalt },
      certificates: facts.certificates, currentRevocation: { revokedDigest: current.state.revokedDigest,
        revokedCount: current.state.revokedCount, revocationSequence: current.state.revocationSequence, entries: current.revokedEntries },
      admissionFrom: opening.validFrom, admissionUntil: opening.validUntil }, { hashFields, abi: admissionABI }));
    joinAdmission(pJob.statement, rJob.statement, iJob.statement);
    const admission = await prove(ref, 'admission', iJob, 'leg-' + selected.slot + '-admission');
    const permit = await quorum.health({ poolIndex });
    await runtime.send('flat-execution-admission-' + ref + '-' + selected.slot, { to: system.hub.address,
      data: encodeFlatTransaction('admit', { pool: pool.address, dependency, readiness, admission, ...healthFields(permit) }) });
    const receipt = { slot: selected.slot, opening, leaf: iJob.statement.receiptLeaf, commitment: iJob.receiptCommitment };
    const included = await reader.read(); receiptPath(included, receipt.leaf);
    await update(ref, { receipts: [...operation(ref).receipts, receipt] });
    await onPrivateAudit({ reference: ref, stage: 'native-admitted', receipt, certificates: facts.certificates });
  }

  const keeper = Object.freeze({
    async prepare(ref, raw, providers) { return exclusive(async () => {
      reference(ref); assert.ok(Array.isArray(providers) && providers.length > 0 && providers.length <= 4);
      assert.equal(new Set(providers.map(value=>value.provider)).size,providers.length,'FLAT_EXECUTION_DISTINCT_ORIGINAL_PROVIDERS');
      const checked = await withFlatHash(hashFields => validateFlatExecutionPreparation(raw, pool.domain, hashFields));
      const packets = checked.prepared.rolePackets, active = packets.local.map((value, slot) => value.local.value.active ? slot : null).filter(value => value !== null);
      assert.deepEqual(providers.map(value => value.slot), active, 'FLAT_EXECUTION_PROVIDER_SLOTS');
      const captured = providers.map(value => {
        exactRecord(value, ['slot', 'family', 'recipientIndex', 'rule', 'rulePath', 'deliveryRiskSalt', 'provider']);
        assert.ok(families.includes(value.family), 'FLAT_EXECUTION_REGISTERED_FAMILY');
        assert.ok(value.recipientIndex === 0 || value.recipientIndex === 1);
        const providerBinding = { runtime, system, poolIndex, operatorQuorum: quorum,
          family: value.family, recipientIndex: value.recipientIndex };
        if (value.family === '3')
          assertOwnedFlatEvmVaultProvider(value.provider, { ...providerBinding, observer: evmDelivery });
        else assertOwnedFlatNativeProvider(value.provider, { ...providerBinding, nativeRuntime: nativeRuntimes[value.family] });
        assert.equal(value.provider.report().quoteBound, true, 'FLAT_EXECUTION_ACCEPTED_QUOTE_REQUIRED'); bytes32(value.deliveryRiskSalt, true);
        const offer = value.provider.offer(), local = packets.local[value.slot];
        assert.equal(value.rule.family, value.family, 'FLAT_EXECUTION_RULE_FAMILY');
        assert.equal(nativeAdmissionRuleRoot(value.rule, value.rulePath), system.registry.rulesRoot, 'FLAT_EXECUTION_REGISTERED_RULE');
        assert.equal(nativeAdmissionRuleCommitment(value.rule), local.local.value.evidencePolicy, 'FLAT_EXECUTION_RULE_POLICY');
        assert.equal(offer.evidencePolicy, local.local.value.evidencePolicy, 'FLAT_EXECUTION_PROVIDER_POLICY');
        assert.deepEqual(offer.actionTemplate, Object.fromEntries(Object.keys(offer.actionTemplate).map(key => [key, local.action[key]])),
          'FLAT_EXECUTION_PROVIDER_ACTION');
        return { ...copy(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'provider'))), provider: value.provider };
      });
      const providerBindings = captured.map(({ provider, ...value }) => ({ ...value, offer: provider.offer() }));
      const preparationSHA256 = digest({ prepared: checked.prepared, providerBindings });
      const old = record.data.operations.find(value => value.reference === ref);
      if (old) { assert.equal(old.preparationSHA256, preparationSHA256); return detached(old.binding); }
      assert.ok(record.data.operations.length < MAX_OPERATIONS, 'FLAT_EXECUTION_CAPACITY');
      assert.ok(!record.data.operations.some(value => value.binding.envelope === checked.binding.envelope), 'FLAT_EXECUTION_ENVELOPE_REUSED');
      await write(state => ({ ...state, operations: [...state.operations, { reference: ref, preparationSHA256,
        binding: checked.binding, prepared: checked.prepared, providerBindings, stage: 'PREPARED', executionStarted: false,
        exposures: [], receipts: [], settlementStatement: null, recoveryStatement: null, settlementSubmission: null, recoverySubmission: null,
        outcome: null, errorCode: null }] }));
      providerSets.set(ref, captured); return checked.binding;
    }); },
    async execute(ref) { return exclusive(async () => {
      const original = operation(ref);
      if (original.outcome) return observedSubmission(ref, original.outcome === 'RECOVERED' ? 'recovery' : 'settlement');
      assert.equal(original.executionStarted, false, 'FLAT_EXECUTION_RECONCILE_OR_RECOVER_ORIGINAL');
      const view = await reader.read(); notePath(view, original.binding.reserveCommitment);
      assert.ok(view.ledger.nullifiers.includes(prefix(original.binding.inputNullifier)), 'FLAT_EXECUTION_RESERVATION_REQUIRED');
      assert.ok(!view.ledger.nullifiers.includes(prefix(original.binding.reserveNullifier)), 'FLAT_EXECUTION_RESERVE_SPENT');
      await reader.authorizationPath(view, original.binding.envelope);
      await update(ref, { executionStarted: true, stage: 'EXECUTING' });
      try {
        const selected = providerSets.get(ref); assert.ok(selected, 'FLAT_EXECUTION_ORIGINAL_PROVIDERS_REQUIRED');
        const packets = operation(ref).prepared.rolePackets;
        for (const provider of selected) await expose(ref, provider, packets.local[provider.slot], packets.dependency[provider.slot]);
        const finalView = await reader.read(), authorization = await reader.authorizationPath(finalView, original.binding.envelope);
        const period = flatCompletionWindow({ timestamp: finalView.head.timestamp,
          settleBefore: original.binding.settleBefore,
          receipts: operation(ref).receipts.map(({ opening }) => ({
            validFrom: opening.validFrom, validUntil: opening.validUntil })) });
        const nodeABI = await abi('node'), completionOpenings = [], completions = [], statements = [];
        for (let slot = 0; slot < 4; slot++) {
          const receipt = operation(ref).receipts.find(value => value.slot === slot);
          const job = await withFlatHash(hashFields => buildNodeInputs({ packet: packets.local[slot], authorization,
            stateOpening: finalView.stateOpening, evidenceState: finalView.evidenceState, revokedEntries: finalView.revokedEntries,
            receiptOpening: receipt?.opening ?? null, receiptPath: receipt ? receiptPath(finalView, receipt.leaf) : null,
            ...period, completionBlind: fresh() }, { hashFields, abi: nodeABI }));
          completionOpenings.push(job.completionOpening); statements.push(job.statement);
          completions.push(await prove(ref, 'node', job, 'slot-' + slot + '-completion'));
        }
        const settlementABI = await abi('settlement');
        const job = await withFlatHash(hashFields => buildSettlementInputs({ packet: packets.assembler, authorization,
          evidenceState: finalView.evidenceState, reservePath: shaPath(notePath(finalView, original.binding.reserveCommitment)),
          completions: completionOpenings, ...period }, { hashFields, abi: settlementABI }));
        joinSettlement(statements, job.statement);
        const settlement = await prove(ref, 'settlement', job, 'global-fulfillment');
        const permit = await quorum.health({ poolIndex });
        await update(ref, { settlementStatement: job.statement });
        await stage(ref, 'submit-global-fulfillment');
        await send(ref, 'settlement', pool.address, encodeFlatTransaction('fulfillGeneric', { settlement, completions, ...healthFields(permit) }));
        const confirmed = await observedSubmission(ref, 'settlement');
        await update(ref, { outcome: 'FULFILLED', stage: 'FULFILLED' }); return confirmed;
      } catch (error) {
        const diagnostic = privateFailureDiagnostic(error);
        await update(ref, { errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
          ...(diagnostic.auditBudget ? { errorAuditBudget: diagnostic.auditBudget } : {}),
          stage: 'ORIGINAL_OUTCOME_UNRESOLVED' });
        await onPrivateAudit({ reference: ref, stage: 'execution-failed', operation: detached(operation(ref)),
          errorCode: diagnostic.code, errorCauseCodes: diagnostic.causeCodes,
          ...(diagnostic.auditBudget ? { auditBudget: diagnostic.auditBudget } : {}) }); throw error;
      }
    }); },
    async reconcile(ref) { return exclusive(async () => {
      const entry = operation(ref);
      const kinds = [...(entry.recoverySubmission ? ['recovery'] : []), ...(entry.settlementSubmission ? ['settlement'] : [])];
      assert.ok(kinds.length, 'FLAT_EXECUTION_PARTIAL_DELIVERY_REQUIRES_RECOVERY');
      let observed, originalError;
      // A rejected/unknown late attempt does not erase a separately retained
      // successful original terminal transaction. Each candidate must still
      // pass exact owned calldata, canonical receipt, state and backing checks.
      for (const kind of kinds) {
        try { observed = await observedSubmission(ref, kind); break; }
        catch (error) { originalError ??= error; }
      }
      if (!observed) throw originalError;
      await update(ref, { outcome: observed.outcome, stage: observed.outcome, errorCode: null }); return observed;
    }); },
    async recover(ref) { return exclusive(async () => {
      const entry = operation(ref);
      if (entry.recoverySubmission) return observedSubmission(ref, 'recovery');
      const view = await reader.read();
      if (view.ledger.nullifiers.includes(prefix(entry.binding.reserveNullifier))) {
        assert.ok(entry.settlementSubmission, 'FLAT_EXECUTION_SPENT_OUTCOME_REQUIRES_RECONCILIATION');
        return observedSubmission(ref, 'settlement');
      }
      assert.ok(BigInt(view.head.timestamp) >= BigInt(entry.binding.settleBefore), 'FLAT_EXECUTION_RECOVERY_BEFORE_CUTOFF');
      assert.ok(view.ledger.nullifiers.includes(prefix(entry.binding.inputNullifier)), 'FLAT_EXECUTION_RESERVATION_REQUIRED');
      // Preserve any earlier settlement latch, including an unknown reply.
      // At this original cutoff T can no longer be included successfully; F
      // competes for the same onchain nullifier and never resends the old T.
      const authorization = await reader.authorizationPath(view, entry.binding.envelope);
      const job = await withFlatHash(hashFields => recoveryWitness(entry.prepared.rolePackets.recovery,
        { authorizationRoot: authorization.root, authorizationPath: fieldLeafPath(view.authorizationTree.path(authorization.index)),
          poolRoot: bare(view.ledger.tree.root), reservePath: shaLeafPath(notePath(view, entry.binding.reserveCommitment)) }, { hashFields }));
      const proof = await prove(ref, 'recovery', job, 'original-timeout-recovery');
      await update(ref, { recoveryStatement: job.statement });
      await stage(ref, 'submit-original-timeout-recovery');
      await send(ref, 'recovery', pool.address, encodeFlatTransaction('recoverGeneric', proof));
      const confirmed = await observedSubmission(ref, 'recovery');
      await update(ref, { outcome: 'RECOVERED', stage: 'RECOVERED', errorCode: null });
      await onStage({ reference: ref, stage: 'recovery-included' }); return confirmed;
    }); },
    snapshot(ref) { live(); const entry = operation(ref); return detached({ reference: ref, stage: entry.stage,
      outcome: entry.outcome, executionStarted: entry.executionStarted,
      nativeExposure: entry.exposures.map(({ slot, family, status }) => ({ slot, family, status })),
      admittedReceipts: entry.receipts.length, errorCode: entry.errorCode, errorCauseCodes: entry.errorCauseCodes ?? [],
      ...(entry.errorAuditBudget ? { errorAuditBudget: entry.errorAuditBudget } : {}),
      keeperRestart: false, nodeRestart: false, fullWalletAcceptance: false }); },
    async abort() { cancelled = true; await proofs.abort(); await activeDone; return { aborted: true }; },
    async close() { await keeper.abort(); await proofs.close(); closed = true; password = undefined; providerSets.clear(); return { closed: true }; },
  });
  owners.set(keeper, { runtime, system, poolIndex, live,
    manualReview(ref) {
      live(); assert.ok(!cancelled, 'FLAT_EXECUTION_CANCELLED');
      const entry = operation(ref), selected = providerSets.get(ref), packets = entry.prepared.rolePackets;
      if(selected?.length!==1||selected[0]?.family!=='3'||selected[0]?.slot!==0||packets.dependency[0].dependency.value.dependencyCount!=='0'){
        assert.equal(new Set(selected.map(value=>value.provider)).size,selected.length,'FLAT_EXECUTION_DISTINCT_ORIGINAL_PROVIDERS');
        const readReview=chosen=>{
          const binding={runtime,system,poolIndex,operatorQuorum:quorum,family:chosen.family,recipientIndex:chosen.recipientIndex};
          return chosen.family==='3'
            ? ownedFlatEvmVaultProviderReview(chosen.provider,{...binding,observer:evmDelivery})
            : ownedFlatNativeProviderReview(chosen.provider,{...binding,nativeRuntime:nativeRuntimes[chosen.family]});
        };
        const originals=selected.map(chosen=>({...chosen,review:readReview(chosen)}));
        return buildOwnerNativeGraphRoute({binding:entry.binding,packets,selected:originals,wrapped:false,flat:true,reviewProvider:readReview});
      }
      // This application profile supports exactly the accepted fixed one-vault
      // route. Registered BTC/SOL or future EVM actions are not opted in.
      assert.ok(selected?.length === 1 && selected[0].family === '3' && selected[0].slot === 0,
        'FLAT_ACCOUNT_MANUAL_GRAPH_ROUTE_UNSUPPORTED');
      assert.equal(packets.dependency[0].dependency.value.dependencyCount, '0', 'FLAT_ACCOUNT_MANUAL_GRAPH_ROUTE_UNSUPPORTED');
      const chosen = selected[0];
      const review = ownedFlatEvmVaultProviderReview(chosen.provider, { runtime, system, poolIndex,
        operatorQuorum: quorum, family: '3', recipientIndex: chosen.recipientIndex, observer: evmDelivery });
      assert.equal(review.settleBefore, entry.binding.settleBefore, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
      assert.equal(review.payoutCommitment, packets.local[0].local.value.payoutCommitment, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
      return detached({ ...review, envelope: entry.binding.envelope,
        fundingNotBefore: packets.reservation.funding.value.fundingNotBefore,
        fundingValidUntil: packets.reservation.funding.value.fundingValidUntil });
    } }); return keeper;
}
