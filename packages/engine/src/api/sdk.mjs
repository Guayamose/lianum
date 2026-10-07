import { Vault } from '../crypto/vault.mjs';
import { newIdentity, sign, commit } from '../crypto/privacy.mjs';
import { randomBytes } from 'node:crypto';
import { createState, transition, executorView, makeGraph, graphHash, ensure } from '../core/core.mjs';
import { simulationReceipt } from '../core/simulation.mjs';
import { assertCapacity } from '../core/capacity.mjs';
import { assertNoIncidents, freezeForIncident, persistIncident, incidentSummary } from '../core/incidents.mjs';
import { validateInvalidation, simulationInvalidation } from '../core/invalidation.mjs';

/** Local-only synthetic SDK. A private vault is the authority for this one process/store.
 * No key import, wallet connection, public RPC, live transaction API or production escrow.
 */
export class WalletSDK {
  #vault; #password; #clock;
  constructor(path, password, { clock = () => Date.now() } = {}) { this.#vault = new Vault(path); this.#password = password; this.#clock = clock; }
  async create() {
    assertNoIncidents(this.#vault.path);
    const initial = { state: createState(this.#clock()), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
    assertCapacity(initial, 0);
    await this.#vault.create(initial, this.#password);
    return this.snapshot();
  }
  async snapshot() {
    const { revision, data } = await this.#vault.read(this.#password);
    return { revision, commitment: commit(data.state, data.blinding), state: data.state, incidents: await incidentSummary(this.#vault.path), mode: 'SIMULATION_ONLY', proof: 'No ZK proof; local signed synthetic attestations.' };
  }
  async #mutate(build) {
    const { revision } = await this.#vault.read(this.#password);
    let validatedUnintegrated;
    let invalidationResult;
    let idempotentResult;
    try {
      const result = await this.#vault.update(this.#password, revision, data => {
        const now = this.#clock(), command = build(data, now);
        if (['open', 'prepareDispatch', 'settle'].includes(command.type)) assertNoIncidents(this.#vault.path);
        if (command.type === 'reorg') {
          invalidationResult = validateInvalidation(data.state, command.hash, command.invalidation, now);
          command.legId = invalidationResult.legId;
          command.resource = invalidationResult.resource;
          if (invalidationResult.alreadyInvalidated) {
            if (invalidationResult.sameRetainedEvent) {
              idempotentResult = { revision, state: data.state, commitment: commit(data.state, data.blinding), integrated: true, duplicate: true, evidenceDigest: invalidationResult.retainedEvidenceDigest };
              throw Object.assign(new Error('Invalidation already integrated'), { code: 'INVALIDATION_ALREADY_INTEGRATED' });
            }
            // Distinct authenticated statements remain evidence even when their
            // economic invalidation already happened. Preserve them separately;
            // never debit the output twice or silently discard a new payload.
            freezeForIncident(this.#vault.path);
            validatedUnintegrated = command;
            throw Object.assign(new Error('Distinct invalidation needs retained audit/reconciliation'), { code: 'STORAGE_DISTINCT_INVALIDATION_AUDIT' });
          }
        }
        data.state = transition(data.state, command, { now, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey });
        if (invalidationResult) {
          const operation = data.state.operations.find((item) => item.hash === command.hash);
          const observation = operation.legs.find((item) => item.id === command.legId).observations.find((item) => item.resource === command.resource);
          observation.invalidation = structuredClone(command.invalidation);
          observation.invalidationDigest = invalidationResult.evidenceDigest;
        }
        try { assertCapacity(data, revision + 1, { commandType: command.type }); }
        catch (error) {
          if (['receipt', 'reorg'].includes(command.type) && error.code?.startsWith('STORAGE_')) {
            // transition authenticated and checked resource identity first. The
            // persistent freeze is created while the vault writer lock is held.
            freezeForIncident(this.#vault.path);
            validatedUnintegrated = command;
          }
          throw error;
        }
        return data;
      });
      return { revision: result.revision, state: result.data.state, commitment: commit(result.data.state, result.data.blinding),
        ...(invalidationResult ? { integrated: true, evidenceDigest: invalidationResult.evidenceDigest } : {}) };
    } catch (error) {
      if (idempotentResult) return idempotentResult;
      if (!validatedUnintegrated || !error.code?.startsWith('STORAGE_')) throw error;
      const incident = await persistIncident(this.#vault.path, this.#password, {
        version: 1, hash: validatedUnintegrated.hash, reason: error.code,
        ...(validatedUnintegrated.type === 'reorg' ? { kind: 'invalidation', evidence: validatedUnintegrated.invalidation,
          evidenceDigest: invalidationResult.evidenceDigest } : { receipt: validatedUnintegrated.receipt }),
      });
      return { ...incident, quarantined: true, revision, mode: 'SIMULATION_ONLY', reason: error.code };
    }
  }
  async open(graph) {
    const intent = structuredClone(graph); // Snapshot before the first await: sign exactly the caller's submitted intent.
    return this.#mutate(data => ({ type: 'open', graph: intent, signature: sign(intent, data.user.privateKey), permission: 'demo-payment' }));
  }
  async openDemo(options) { const graph = makeGraph(this.#clock(), options); const result = await this.open(graph); return { ...result, hash: graphHash(graph) }; }
  async prepareDispatch(hash, legId, { txRef, effectIndex = 0 } = {}) {
    return this.#mutate(() => ({ type: 'prepareDispatch', hash, legId, ...(txRef !== undefined ? { txRef, effectIndex } : {}) }));
  }
  async markSubmitted(hash, legId, txRef, effectIndex) {
    return this.#mutate((data, now) => {
      const operation = data.state.operations.find((item) => item.hash === hash);
      const leg = operation?.legs.find((item) => item.id === legId);
      ensure(leg, 'UNKNOWN_LEG');
      const selector = effectIndex === undefined ? leg.dispatch.effectIndex ?? 0 : effectIndex;
      const payload = { version: 1, domain: operation.graph.domain, evidenceType: 'simulation-submission-ack', graphHash: hash,
        legId, dispatchToken: leg.dispatchToken, txRef, effectIndex: selector, acknowledgedAt: now };
      return { type: 'markSubmitted', hash, legId, txRef, effectIndex: selector,
        acknowledgement: { payload, signature: sign(payload, data.observer.privateKey) } };
    });
  }
  async recordSubmissionAcknowledgement(hash, signed) {
    const acknowledgement = structuredClone(signed);
    return this.#mutate(() => ({ type: 'reconcileDispatch', hash, acknowledgement }));
  }
  async acknowledgeSimulationDispatch(hash, legId, txRef, effectIndex) {
    return this.#mutate((data, now) => {
      const operation = data.state.operations.find((item) => item.hash === hash);
      const leg = operation?.legs.find((item) => item.id === legId);
      ensure(leg, 'UNKNOWN_LEG');
      const selector = effectIndex === undefined ? leg.dispatch.effectIndex ?? 0 : effectIndex;
      const payload = { version: 1, domain: operation.graph.domain, evidenceType: 'simulation-submission-ack', graphHash: hash,
        legId, dispatchToken: leg.dispatchToken, txRef, effectIndex: selector, acknowledgedAt: now };
      return { type: 'reconcileDispatch', hash, acknowledgement: { payload, signature: sign(payload, data.observer.privateKey) } };
    });
  }
  async markAmbiguous(hash, legId, reason = 'SUBMISSION_OUTCOME_UNKNOWN') { return this.#mutate(() => ({ type: 'markAmbiguous', hash, legId, reason })); }
  async recordReceipt(hash, signed) {
    const receipt = structuredClone(signed);
    return this.#mutate(() => ({ type: 'receipt', hash, receipt }));
  }
  async executeSimulationLeg(hash, legId) {
    // The durable intent precedes any simulated submission. If this sequence is
    // interrupted, recovery keeps that attempt's exposure quarantined. A future
    // native adapter must obey the same write-before-send boundary.
    const txRef = randomBytes(32).toString('hex');
    await this.prepareDispatch(hash, legId, { txRef, effectIndex: 0 });
    await this.markSubmitted(hash, legId, txRef);
    return this.#mutate((data, now) => {
      const op = data.state.operations.find(o => o.hash === hash);
      ensure(op && now < op.graph.expiresAt, 'EXPIRED');
      return { type: 'receipt', hash, receipt: simulationReceipt(op.graph, legId, data.observer.privateKey, now, { txRef }) };
    });
  }
  async settle(hash) { return this.#mutate(() => ({ type: 'settle', hash })); }
  async recover(hash) { return this.#mutate(() => ({ type: 'recover', hash })); }
  async fail(hash, reason = 'SIMULATED_CHAIN_UNAVAILABLE') { return this.#mutate(() => ({ type: 'fail', hash, reason })); }
  async recordInvalidation(hash, signed) {
    const invalidation = structuredClone(signed);
    return this.#mutate(() => ({ type: 'reorg', hash, invalidation }));
  }
  async reorg(hash, legId, resource) {
    return this.#mutate((data, now) => ({ type: 'reorg', hash,
      invalidation: simulationInvalidation(data.state, hash, legId, resource, data.observer.privateKey, now) }));
  }
  async executorView(hash, legId) { assertNoIncidents(this.#vault.path); const { data } = await this.#vault.read(this.#password); ensure(this.#clock() < data.state.operations.find(o => o.hash === hash)?.graph.expiresAt, 'EXPIRED'); return executorView(data.state, hash, legId); }
}
