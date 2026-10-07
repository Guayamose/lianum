import { Vault } from './vault.mjs';
import { newIdentity, sign, commit } from './privacy.mjs';
import { randomBytes } from 'node:crypto';
import { createState, transition, executorView, makeGraph, graphHash, ensure } from './core.mjs';
import { simulationReceipt } from './simulation.mjs';

/** Local-only synthetic SDK. A private vault is the authority for this one process/store.
 * No key import, wallet connection, public RPC, live transaction API or production escrow.
 */
export class WalletSDK {
  #vault; #password; #clock;
  constructor(path, password, { clock = () => Date.now() } = {}) { this.#vault = new Vault(path); this.#password = password; this.#clock = clock; }
  async create() {
    await this.#vault.create({ state: createState(this.#clock()), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') }, this.#password);
    return this.snapshot();
  }
  async snapshot() {
    const { revision, data } = await this.#vault.read(this.#password);
    return { revision, commitment: commit(data.state, data.blinding), state: data.state, mode: 'SIMULATION_ONLY', proof: 'No ZK proof; local signed synthetic attestations.' };
  }
  async #mutate(build) {
    const { revision } = await this.#vault.read(this.#password);
    const result = await this.#vault.update(this.#password, revision, data => {
      const now = this.#clock(), command = build(data, now);
      data.state = transition(data.state, command, { now, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey });
      return data;
    });
    return { revision: result.revision, state: result.data.state, commitment: commit(result.data.state, result.data.blinding) };
  }
  async open(graph) {
    const intent = structuredClone(graph); // Snapshot before the first await: sign exactly the caller's submitted intent.
    return this.#mutate(data => ({ type: 'open', graph: intent, signature: sign(intent, data.user.privateKey), permission: 'demo-payment' }));
  }
  async openDemo(options) { const graph = makeGraph(this.#clock(), options); const result = await this.open(graph); return { ...result, hash: graphHash(graph) }; }
  async executeSimulationLeg(hash, legId) {
    return this.#mutate((data, now) => {
      const op = data.state.operations.find(o => o.hash === hash);
      ensure(op && now < op.graph.expiresAt, 'EXPIRED');
      executorView(data.state, hash, legId);
      return { type: 'receipt', hash, receipt: simulationReceipt(op.graph, legId, data.observer.privateKey, now) };
    });
  }
  async settle(hash) { return this.#mutate(() => ({ type: 'settle', hash })); }
  async recover(hash) { return this.#mutate(() => ({ type: 'recover', hash })); }
  async fail(hash, reason = 'SIMULATED_CHAIN_UNAVAILABLE') { return this.#mutate(() => ({ type: 'fail', hash, reason })); }
  async reorg(hash, legId) { return this.#mutate(() => ({ type: 'reorg', hash, legId })); }
  async executorView(hash, legId) { const { data } = await this.#vault.read(this.#password); ensure(this.#clock() < data.state.operations.find(o => o.hash === hash)?.graph.expiresAt, 'EXPIRED'); return executorView(data.state, hash, legId); }
}
