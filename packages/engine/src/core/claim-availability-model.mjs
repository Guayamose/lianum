/** M5 BOUNDED SIMULATION ONLY.
 * MODEL_ASSUMED_VALID tokens stand for unimplemented authentication/proof relations.
 * No ZK, VRF, encryption, durable delivery, consensus, native funds or service exists
 * here. The omniscient simulator oracle is separate from recorded actor reads.
 */
import { createHash } from 'node:crypto';
export const MODEL_ASSUMPTION = 'MODEL_ASSUMED_VALID';
export const ACTORS = Object.freeze(['E_S', 'E_B', 'P_S', 'P_B']);
export const CHAINS = Object.freeze(['SOL', 'BTC']);
const CHAIN = { E_S: 'SOL', P_S: 'SOL', E_B: 'BTC', P_B: 'BTC' };
const EXECUTOR = { SOL: 'E_S', BTC: 'E_B' };
const PRODUCER = { SOL: 'P_S', BTC: 'P_B' };
const ISSUER = { SOL: 'I_S', BTC: 'I_B' };
const copy = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requireModel = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const tick = n => { requireModel(Number.isSafeInteger(n) && n >= 0, 'INVALID_MODEL_TIME'); return n; };
const quantity = n => { requireModel(typeof n === 'string' && /^(0|[1-9][0-9]{0,30})$/.test(n), 'INVALID_MODEL_QUANTITY'); return BigInt(n); };
const textId = id => { requireModel(typeof id === 'string' && /^[A-Za-z0-9_:/.-]{1,160}$/.test(id), 'INVALID_MODEL_ID'); return id; };
const ceil = (a, b) => a / b + (a % b === 0n ? 0n : 1n);

export const DEFAULT_TIMING = Object.freeze({ executeBy: 120, claimBy: 150, latestSendSOL: 70, latestSendBTC: 100, finalitySOL: 3, finalityBTC: 6, proofDuration: 2, assemblyDuration: 2, inclusionBudget: 3, maxCertificateAge: 100, maxProofWindow: 40 });

/** Explicit model-only shared creation registry. Prefixes stand for assumed
 * binding typed commitments; they are NOT a hash/commitment construction. */
export class ModelCreationRegistry {
  #grants = new Map(); #notes = new Map(); #active = new Set(); #terminal = new Set(); #consumed = { SOL: new Set(), BTC: new Set() }; #revoked = { SOL: new Set(), BTC: new Set() }; #sequences = { SOL: 0, BTC: 0 };
  // One explicit object is one canonical model pool authority. Multiple ACTIVE
  // reservations in that pool MUST share this object, including current safety.
  canonicalEffectTag(chain, txRef, selector) {
    requireModel(CHAINS.includes(chain), 'UNSUPPORTED_CHAIN_ROLE');
    const raw = JSON.stringify(['MODEL_POOL_SCOPE', chain, `MODEL_${chain}_GENESIS`, txRef, selector]);
    // Deterministic identity label only: public and dictionary-searchable, NOT VRF.
    return `MODEL_NF_${chain}_${createHash('sha256').update(raw).digest('hex')}`;
  }
  isConsumed(chain, nf) { return this.#consumed[chain].has(nf); }
  isRevoked(chain, nf) { return this.#revoked[chain].has(nf); }
  sequence(chain) { return this.#sequences[chain]; }
  consumeEffects(tags) {
    for (const chain of CHAINS) { requireModel(!this.isRevoked(chain, tags[chain]), 'CURRENT_TARGETED_REVOCATION'); requireModel(!this.isConsumed(chain, tags[chain]), 'EFFECT_ALREADY_CONSUMED'); }
    for (const chain of CHAINS) this.#consumed[chain].add(tags[chain]);
  }
  revoke(issuer, chain, nf) {
    requireModel(CHAINS.includes(chain) && ISSUER[chain] === issuer, 'ISSUER_CANNOT_WRITE_OTHER_CHAIN_PARTITION');
    const added = !this.#revoked[chain].has(nf); this.#revoked[chain].add(nf); if (added) this.#sequences[chain]++;
    return { added, sequence: this.#sequences[chain], incident: this.#consumed[chain].has(nf) };
  }
  safetySnapshot() { return { consumedEffects: Object.fromEntries(CHAINS.map(chain => [chain, [...this.#consumed[chain]]])), revoked: Object.fromEntries(CHAINS.map(chain => [chain, [...this.#revoked[chain]]])), revocationSequence: copy(this.#sequences) }; }
  registerGrant(grantId, activeN) {
    requireModel(!this.#grants.has(grantId), 'GRANT_ALREADY_ACTIVATED');
    requireModel(!this.#active.has(activeN), 'ACTIVE_NOTE_ID_ALREADY_REGISTERED');
    this.#active.add(activeN);
    this.#grants.set(grantId, activeN);
  }
  registerUntypedActive(activeN) { requireModel(!this.#active.has(activeN), 'ACTIVE_NOTE_ID_ALREADY_REGISTERED'); this.#active.add(activeN); }
  isTerminal(activeN) { return this.#terminal.has(activeN); }
  consumeRefund(activeN) { requireModel(this.#active.has(activeN) && !this.#terminal.has(activeN), 'TERMINAL_NOTE_ALREADY_CONSUMED'); this.#terminal.add(activeN); }
  deposit(note) {
    this.checkOrdinaryCreation('DEPOSIT', note);
    requireModel(!this.#notes.has(note.commitment), 'DUPLICATE_NOTE_COMMITMENT');
    this.#notes.set(note.commitment, copy({ ...note, path: 'MODEL_FUNDED_NORMAL_DEPOSIT' }));
  }
  checkOrdinaryCreation(path, note) {
    requireModel(['DEPOSIT', 'CHANGE', 'REFUND'].includes(path), 'UNSUPPORTED_CREATION_PATH');
    requireModel(note.kind === 'NORMAL' && note.commitment.startsWith('MODEL_NORMAL_CM:'), `PAYOUT_CREATION_FORBIDDEN_ON_${path}`);
  }
  checkFulfillment(grantId, activeN, notes, typed = true) {
    if (typed) requireModel(this.#grants.get(grantId) === activeN, 'PAYOUT_GRANT_ORIGIN_NOT_AUTHORIZED');
    requireModel(new Set(notes.map(n => n.commitment)).size === notes.length, 'DUPLICATE_OUTPUT_COMMITMENT');
    for (const note of notes) {
      if (typed) requireModel(note.kind === 'PAYOUT' && note.originGrant === grantId && note.commitment.startsWith(`MODEL_PAYOUT_CM:${grantId}:`), 'PAYOUT_GRANT_ORIGIN_NOT_AUTHORIZED');
      requireModel(!this.#notes.has(note.commitment), 'DUPLICATE_NOTE_COMMITMENT');
    }
  }
  fulfill(grantId, activeN, notes, typed = true, tags) {
    requireModel(this.#active.has(activeN) && !this.#terminal.has(activeN), 'TERMINAL_NOTE_ALREADY_CONSUMED');
    this.checkFulfillment(grantId, activeN, notes, typed);
    for (const chain of CHAINS) { requireModel(!this.isRevoked(chain, tags[chain]), 'CURRENT_TARGETED_REVOCATION'); requireModel(!this.isConsumed(chain, tags[chain]), 'EFFECT_ALREADY_CONSUMED'); }
    // All checks precede this synchronous model transition. No observer callback.
    for (const note of notes) this.#notes.set(note.commitment, copy({ ...note, path: 'MODEL_FULL_FULFILLMENT' }));
    for (const chain of CHAINS) this.#consumed[chain].add(tags[chain]);
    this.#terminal.add(activeN);
  }
  snapshot() { return { classification: 'MODEL_SHARED_CREATION_CONSUMPTION_REVOCATION_AUTHORITY_NOT_A_CONTRACT', grants: Object.fromEntries(this.#grants), notes: [...this.#notes.values()].map(copy), registeredActiveNotes: [...this.#active], consumedActiveNotes: [...this.#terminal], ...this.safetySnapshot() }; }
}

/** Test oracle for assumed-valid proof handles. No secret/raw witness is stored. */
export class ModelProofOracle {
  #proofs = new Map();
  issue(statement) { const proof = { ...copy(statement), id: `MODEL_PROOF_${this.#proofs.size + 1}` }; this.#proofs.set(proof.id, copy(proof)); return proof; }
  verify(proof) { const issued = this.#proofs.get(proof?.id); requireModel(issued && same(issued, proof), 'MODEL_PROOF_TOKEN_NOT_ISSUED_OR_CHANGED'); return copy(issued); }
}
export function finiteMenu(solAmounts = ['3000000', '3500000']) {
  requireModel(Array.isArray(solAmounts) && solAmounts.length >= 2 && solAmounts.length <= 16, 'FINITE_MENU_REQUIRES_2_TO_16_ENTRIES');
  requireModel(new Set(solAmounts).size === solAmounts.length, 'DUPLICATE_MENU_OUTCOME');
  return solAmounts.map((amount, index) => {
    const S = quantity(amount), B = 1000000n, FS = 10000n, FB = 15000n;
    requireModel(S >= 2500000n && S <= 3500000n, 'MENU_OUTSIDE_AUTHORIZED_RANGE');
    const costS = ceil(S, 10n), K = (B - FS - FB - costS) / 4n;
    requireModel(K >= 150000n && B >= FS + FB + costS, 'INFEASIBLE_MENU_BRANCH');
    return { branch: `branch-${index}`, solAmount: S.toString(), btcAmount: K.toString(), payoutS: (costS + FS).toString(), payoutB: (B - costS - FS).toString() };
  });
}

/** Structural cut analysis before local proofs are available. This is a Boolean
 * dependency model, not execution of 16 real proof pipelines or a liveness proof.
 */
export function availabilityCuts({ issuerSOL = true, issuerBTC = true, authority = true } = {}) {
  const rows = Array.from({ length: 16 }, (_, mask) => {
    const available = Object.fromEntries(ACTORS.map((actor, i) => [actor, Boolean(mask & (1 << i))]));
    const solWitnessPath = available.E_S || available.P_S;
    const btcWitnessPath = available.E_B || available.P_B;
    const assemblyPath = available.E_S || available.E_B;
    const proofPipeline = solWitnessPath && btcWitnessPath && issuerSOL && issuerBTC;
    return { mask, available, solWitnessPath, btcWitnessPath, proofPipeline, assemblyPath, canCompleteUnderOtherAssumptions: proofPipeline && assemblyPath && authority };
  });
  const failing = rows.filter(row => !row.canCompleteUnderOtherAssumptions).map(row => ({ ...row, absent: ACTORS.filter(actor => !row.available[actor]) }));
  const minimalCuts = failing.filter(row => !failing.some(other => other.absent.length < row.absent.length && other.absent.every(actor => row.absent.includes(actor)))).map(row => row.absent);
  return { classification: 'MODEL_STRUCTURAL_AVAILABILITY_ANALYSIS', beforeProofsAvailable: true, issuerSOL, issuerBTC, authority, rows, minimalCuts, successfulMasks: rows.filter(row => row.canCompleteUnderOtherAssumptions).length, caveat: 'All native fulfillment, gas, policy/anchor retention, no targeted revocation, finite delays and truthful available issuers are still assumed. Existing retained proofs can change later cuts. Colocated issuer/producer failures can be correlated.' };
}

export class ClaimAvailabilityModel {
  #profile; #id; #timing; #oracle; #owner; #roles = new Map(); #live; #withheld = new Set(); #declaredRefusal = new Set(); #creation; #grantId; #typedPayouts; #deposits = []; #proofOracle; #exposure = new Map();
  #status = 'UNFUNDED'; #time = 0; #gate = false; #ownerOfflineAt = null; #events = []; #reads = [];
  #manifests = new Map(); #dispatches = new Map(); #external = []; #proofs = new Map(); #claims = new Map();
  #noteConsumed = false; #paid = { E_S: '0', E_B: '0' }; #refund = '0'; #held = '0'; #resultIds = new Map();

  constructor({ id = 'm5-reservation', profile = 'PC5-F', solAmounts, timing = {}, creationRegistry = new ModelCreationRegistry(), proofOracle = new ModelProofOracle(), grantId = `grant:${id}`, payoutCreation = 'TYPED_PAYOUT' } = {}) {
    requireModel(['PC5-F', 'PC4-OWNER-WITNESS'].includes(profile), 'UNSUPPORTED_MODEL_PROFILE');
    this.#id = textId(id); this.#profile = profile; this.#timing = { ...DEFAULT_TIMING, ...timing };
    requireModel(['TYPED_PAYOUT', 'VULNERABLE_NORMAL'].includes(payoutCreation), 'UNSUPPORTED_PAYOUT_CREATION_PROFILE');
    this.#creation = creationRegistry; this.#grantId = textId(grantId); this.#typedPayouts = payoutCreation === 'TYPED_PAYOUT';
    this.#proofOracle = proofOracle;
    for (const value of Object.values(this.#timing)) tick(value);
    requireModel(this.#timing.executeBy < this.#timing.claimBy && this.#timing.latestSendSOL <= this.#timing.executeBy && this.#timing.latestSendBTC <= this.#timing.executeBy, 'INVALID_MODEL_DEADLINES');
    const menu = finiteMenu(solAmounts);
    const authorization = branch => ({ classification: MODEL_ASSUMPTION, kind: profile === 'PC5-F' ? 'STATIC_BRANCH_AUTHORIZATION_NOT_FULFILLMENT' : 'PC4_CONTEXT_ONLY_OWNER_GLOBAL_WITNESS_STILL_REQUIRED', verifier: profile === 'PC5-F' ? 'MODEL_VK_AUTH_PC5_F' : 'MODEL_PC4_OWNER_WITNESS_RELATION_NOT_PREPROVED', scope: 'MODEL_POOL_SCOPE', grantId: this.#grantId, menuBinding: `MODEL_MENU:${this.#id}`, activeN: `MODEL_ACTIVE:${this.#id}`, activeCommitment: `MODEL_ACTIVE_CM_AFTER_PAYOUT_CMS:${this.#id}`, retainedAnchor: 'MODEL_RETAINED_NOTE_ANCHOR', branch: branch.branch, constraintS: `MODEL_CS:${this.#id}:${branch.branch}`, constraintB: `MODEL_CB:${this.#id}:${branch.branch}`, payoutCommitmentS: `${this.#typedPayouts ? 'MODEL_PAYOUT_CM' : 'MODEL_NORMAL_CM'}:${this.#grantId}:${branch.branch}:S`, payoutCommitmentB: `${this.#typedPayouts ? 'MODEL_PAYOUT_CM' : 'MODEL_NORMAL_CM'}:${this.#grantId}:${branch.branch}:B`, payoutCiphertextS: 'MODEL_ASSUMED_AVAILABLE_CIPHERTEXT_S', payoutCiphertextB: 'MODEL_ASSUMED_AVAILABLE_CIPHERTEXT_B', executeBy: this.#timing.executeBy, claimBy: this.#timing.claimBy });
    const boundAuthorization = branch => ({ ...authorization(branch), attemptS: `MODEL_ATTEMPT:${this.#id}:SOL`, attemptB: `MODEL_ATTEMPT:${this.#id}:BTC`, activationResult: `MODEL_ACTIVATION_RESULT:${this.#id}`, resultSaltCommitmentS: `MODEL_BOUND_SALT_CM:${this.#id}:SOL:${branch.branch}`, resultSaltCommitmentB: `MODEL_BOUND_SALT_CM:${this.#id}:BTC:${branch.branch}` });
    this.#oracle = { classification: 'OMNISCIENT_TEST_ORACLE_NOT_AN_ACTOR_OR_A_PROVER', menu: copy(menu), authorizations: menu.map(boundAuthorization), anchorRetained: true, policyRetained: true, budget: '1000000' };
    this.#owner = { classification: 'OWNER_ONLY_MODEL_GRAPH_WITNESS', graph: 'MODEL_PRIVATE_GRAPH_AND_QUOTE_OPENING', menu: copy(menu), packages: Object.fromEntries(ACTORS.map(actor => [actor, {
      classification: 'MODEL_STATIC_CAPSULE_NO_REAL_ENCRYPTION', actor, chain: CHAIN[actor], activeN: `MODEL_ACTIVE:${this.#id}`, authorizations: menu.map(boundAuthorization),
      ownOpenings: menu.map(branch => ({ branch: branch.branch, chain: CHAIN[actor], constraint: CHAIN[actor] === 'SOL' ? `MODEL_CS:${this.#id}:${branch.branch}` : `MODEL_CB:${this.#id}:${branch.branch}`, amount: CHAIN[actor] === 'SOL' ? branch.solAmount : branch.btcAmount, conditionalPayout: CHAIN[actor] === 'SOL' ? branch.payoutS : branch.payoutB, recipient: CHAIN[actor] === 'SOL' ? 'private-sol-recipient' : 'private-btc-recipient', maxFee: '10000', localSalt: `MODEL_LOCAL_SALT:${this.#id}:${CHAIN[actor]}:${branch.branch}`, scope: 'MODEL_POOL_SCOPE' }))
    }])) };
    this.#live = { E_S: true, E_B: true, P_S: true, P_B: true, I_S: true, I_B: true, AUTHORITY: true, HISTORY: true };
  }

  #advance(now) { tick(now); requireModel(now >= this.#time, 'MODEL_TIME_CANNOT_REWIND'); this.#time = now; }
  #event(type, data = {}) { this.#events.push({ sequence: this.#events.length, at: this.#time, type, ...copy(data) }); }
  #read(actor, artifact, holder = actor, chain = null) {
    if (actor === 'OWNER') requireModel(this.#owner !== null, 'OWNER_WITNESS_UNAVAILABLE');
    this.#reads.push({ sequence: this.#reads.length, at: this.#time, actor, holder, artifact, ...(chain ? { chain } : {}) });
  }
  #role(actor) {
    requireModel(ACTORS.includes(actor), 'UNKNOWN_ACTOR');
    requireModel(this.#live[actor], 'ACTOR_UNAVAILABLE');
    requireModel(this.#roles.has(actor), 'ROLE_STATIC_MATERIAL_MISSING');
    this.#read(actor, 'retained-role-static-copy');
    return this.#roles.get(actor);
  }
  #currentAuthority() { requireModel(this.#live.AUTHORITY && this.#live.HISTORY, 'AUTHORITY_OR_HISTORY_UNAVAILABLE'); requireModel(this.#oracle.anchorRetained && this.#oracle.policyRetained, 'ANCHOR_OR_POLICY_UNAVAILABLE'); }
  #auth(actor, branch) {
    const role = this.#role(actor), auth = role.capsule.authorizations.find(a => a.branch === branch);
    requireModel(auth, 'BRANCH_OUTSIDE_FINITE_MENU');
    this.#read(actor, `static-authorization:${branch}`);
    return auth;
  }
  #opening(actor, branch) {
    const opening = this.#role(actor).capsule.ownOpenings.find(item => item.branch === branch);
    requireModel(opening, 'OWN_CONSTRAINT_OPENING_MISSING');
    this.#read(actor, `own-constraint:${branch}`, actor, CHAIN[actor]);
    return opening;
  }
  #verifiedProof(proof) {
    requireModel(proof?.classification === MODEL_ASSUMPTION && proof.kind === 'MODEL_LOCAL_LEG_PROOF', 'UNIMPLEMENTED_OR_UNRESOLVED_PROOF');
    requireModel(CHAINS.includes(proof.chain) && proof.verifier === `MODEL_VK_${proof.chain}` && Array.isArray(proof.unresolvedAssumptions) && proof.unresolvedAssumptions.length === 0, 'WRONG_MODEL_VK_OR_UNRESOLVED_ASSUMPTIONS');
    return this.#proofOracle.verify(proof);
  }
  #tag(chain, txRef, selector) {
    return this.#creation.canonicalEffectTag(chain, txRef, selector);
  }

  activate(now = 1) {
    this.#advance(now); this.#currentAuthority(); requireModel(this.#status === 'UNFUNDED', 'ALREADY_ACTIVATED');
    if (this.#typedPayouts) this.#creation.registerGrant(this.#grantId, `MODEL_ACTIVE:${this.#id}`);
    else this.#creation.registerUntypedActive(`MODEL_ACTIVE:${this.#id}`);
    this.#status = 'ACTIVE'; this.#held = this.#oracle.budget;
    this.#event('model-activation-assumed-final', { proof: MODEL_ASSUMPTION, amount: this.#held });
    return this.snapshot().authority;
  }
  deliverStatic(actor, { bytesAvailable = true, keyDelivered = true, decrypts = true, complete = true, bindingValid = true, allBranches = true, ownSaltOverride } = {}, now = this.#time) {
    this.#advance(now); requireModel(this.#status === 'ACTIVE' && !this.#gate, 'STATIC_DELIVERY_PHASE_CLOSED');
    requireModel(this.#owner !== null, 'OWNER_WITNESS_UNAVAILABLE'); requireModel(ACTORS.includes(actor) && this.#live[actor], 'STATIC_RECIPIENT_UNAVAILABLE');
    for (const [condition, code] of [[bytesAvailable, 'CAPSULE_BYTES_UNAVAILABLE'], [keyDelivered, 'CAPSULE_KEY_UNAVAILABLE'], [decrypts, 'CAPSULE_DECRYPTION_UNUSABLE'], [complete, 'CAPSULE_LOCAL_WITNESS_INCOMPLETE'], [bindingValid, 'CAPSULE_BINDING_INVALID'], [allBranches, 'CAPSULE_MENU_COVERAGE_INCOMPLETE']]) requireModel(condition, code);
    this.#read('OWNER', `prepare-capsule:${actor}`);
    const capsule = copy(this.#owner.packages[actor]);
    for (const opening of capsule.ownOpenings) {
      const expected = this.#owner.packages[actor].ownOpenings.find(item => item.branch === opening.branch);
      if (ownSaltOverride !== undefined) opening.localSalt = ownSaltOverride;
      // Symbolic commitment-opening predicate only. The chosen pre-positioned
      // salt must be identical for both same-chain holders; no hash/ZK is run.
      requireModel(opening.localSalt === expected.localSalt, 'CAPSULE_RESULT_SALT_BINDING_INVALID');
      opening.resultSaltCommitment = `MODEL_BOUND_SALT_CM:${this.#id}:${CHAIN[actor]}:${opening.branch}`;
      opening.resultSaltBinding = MODEL_ASSUMPTION;
    }
    this.#roles.set(actor, { capsule, manifests: {}, proofInbox: {}, retained: true });
    this.#read(actor, 'accepted-full-capsule-own-openings-and-all-branches', actor, CHAIN[actor]);
    this.#event('static-copy-retained', { actor, branches: this.#oracle.menu.length, checks: 'MODEL_ASSUMED_VALID—not encryption/proof/durable-storage verification' });
  }
  deliverAll(now = this.#time) { for (const actor of ACTORS) this.deliverStatic(actor, {}, now); }
  ownerOffline(now = this.#time) {
    this.#advance(now); this.#owner = null; this.#ownerOfflineAt ??= now;
    this.#event('owner-only-graph-witness-erased', { retainedRoleCopies: [...this.#roles.keys()] });
  }
  setAvailability(changes, now = this.#time) {
    this.#advance(now);
    for (const [actor, value] of Object.entries(changes)) { requireModel(Object.hasOwn(this.#live, actor) && typeof value === 'boolean', 'INVALID_AVAILABILITY_ACTOR'); this.#live[actor] = value; }
    this.#event('availability-assumption-changed', changes);
  }
  withholdProof(actor, enabled = true, now = this.#time) {
    this.#advance(now); requireModel(ACTORS.includes(actor), 'UNKNOWN_ACTOR'); enabled ? this.#withheld.add(actor) : this.#withheld.delete(actor);
    // Hidden test-oracle intent: readiness must not inspect this set or predict
    // a future abort. Use declareProofRefusal for an already observable refusal.
    this.#event('proof-cooperation-changed', { actor, withholding: enabled, visibility: 'OMNISCIENT_TEST_ONLY_HIDDEN_ACTOR_INTENT' });
  }
  declareProofRefusal(actor, enabled = true, now = this.#time) {
    this.#advance(now); requireModel(ACTORS.includes(actor) && typeof enabled === 'boolean', 'INVALID_DECLARED_PROOF_REFUSAL');
    enabled ? this.#declaredRefusal.add(actor) : this.#declaredRefusal.delete(actor);
    this.#event('declared-proof-refusal-changed', { actor, refusal: enabled, visibility: 'MODEL_OBSERVABLE_DECLARED_REFUSAL' });
  }
  setRetainedAuthorityMaterial({ anchor = true, policy = true }, now = this.#time) { this.#advance(now); this.#oracle.anchorRetained = anchor; this.#oracle.policyRetained = policy; }
  #knownProofPaths(chains) {
    return Object.fromEntries(chains.map(chain => {
      const holders = [EXECUTOR[chain], PRODUCER[chain]].filter(actor => this.#roles.get(actor)?.retained && this.#live[actor] && !this.#declaredRefusal.has(actor));
      return [chain, { holders, issuerAvailable: this.#live[ISSUER[chain]], usable: holders.length > 0 && this.#live[ISSUER[chain]] }];
    }));
  }
  #remainingTiming(chain, now, parent = null) {
    const t = this.#timing;
    // Existing abstract durations stand for declared execution/finality and
    // proof/delivery budgets. No network prediction or certificate refresh.
    const SOL = chain === 'SOL' ? { send: now, observed: now + t.finalitySOL, proofReady: now + t.finalitySOL + t.proofDuration } : null;
    const btcSend = SOL ? SOL.proofReady : now;
    const BTC = { send: btcSend, observed: btcSend + t.finalityBTC, proofReady: btcSend + t.finalityBTC + t.proofDuration };
    const outerReady = BTC.proofReady + t.assemblyDuration, claimIncluded = outerReady + t.inclusionBudget;
    const checks = {
      safeArithmetic: [...(SOL ? Object.values(SOL) : []), ...Object.values(BTC), outerReady, claimIncluded].every(Number.isSafeInteger),
      solSendCutoff: !SOL || SOL.send <= t.latestSendSOL,
      solObservationCutoff: !SOL || SOL.observed <= t.executeBy,
      btcSendCutoff: BTC.send <= t.latestSendBTC,
      btcObservationCutoff: BTC.observed <= t.executeBy,
      claimCutoff: claimIncluded < t.claimBy,
      outerWindowCapacity: t.inclusionBudget <= t.maxProofWindow,
      solCertificateAge: SOL ? claimIncluded - SOL.observed <= t.maxCertificateAge : Boolean(parent && claimIncluded - parent.observedAt <= parent.maxAge),
      btcCertificateAge: claimIncluded - BTC.observed <= t.maxCertificateAge,
      retainedParentExpiry: !parent || claimIncluded <= parent.certificateExpiresAt
    };
    return { classification: 'DECLARED_MODEL_BUDGET_NOT_A_FUTURE_GUARANTEE', phase: chain, SOL, BTC, outerReady, claimIncluded, checks, feasible: Object.values(checks).every(Boolean), futureCertificateExpiry: 'Unknown until observed; never assumed renewed. Rechecked against retained parent before B exposure.' };
  }
  #requireExecutableReadiness(chain, now, parent = null) {
    const proofPaths = this.#knownProofPaths(chain === 'SOL' ? CHAINS : ['BTC']);
    const timing = this.#remainingTiming(chain, now, parent);
    this.#event('remaining-workflow-readiness-checked', { chain, proofPaths, timing });
    requireModel(Object.values(proofPaths).every(path => path.usable), 'KNOWN_PROOF_PATH_UNAVAILABLE');
    requireModel(this.#live.E_S || this.#live.E_B, 'NO_LIVE_CLAIM_ASSEMBLER');
    requireModel(timing.feasible, 'REMAINING_WORKFLOW_DEADLINE_INFEASIBLE');
  }
  readiness(now = this.#time) {
    this.#advance(now);
    const copies = ACTORS.every(actor => this.#roles.get(actor)?.retained);
    const timing = this.#remainingTiming('SOL', now), enoughTime = timing.feasible;
    const proofPaths = this.#knownProofPaths(CHAINS), usableProofPaths = Object.values(proofPaths).every(path => path.usable);
    const actorsAvailable = ACTORS.every(actor => this.#live[actor]) && this.#live.I_S && this.#live.I_B;
    const ready = this.#status === 'ACTIVE' && copies && enoughTime && actorsAvailable && usableProofPaths && this.#live.AUTHORITY && this.#live.HISTORY && this.#oracle.anchorRetained && this.#oracle.policyRetained;
    return { classification: 'MODEL_READINESS_SNAPSHOT_NOT_FUTURE_GUARANTEE', at: now, ready, allStaticCopies: copies, enoughTime, timing, actorsAvailable, proofPaths, usableProofPaths, latestSend: { SOL: this.#timing.latestSendSOL, BTC: this.#timing.latestSendBTC } };
  }

  registerManifest(chain, branch, { txRef, parentProof = null, selector = 0, acknowledged = true, rawSignedNativeTransaction, broadcastableBytes } = {}, now = this.#time) {
    this.#advance(now); requireModel(CHAINS.includes(chain), 'UNSUPPORTED_CHAIN_ROLE'); this.#currentAuthority();
    requireModel(rawSignedNativeTransaction === undefined && broadcastableBytes === undefined, 'BROADCASTABLE_NATIVE_BYTES_HANDOFF_UNSUPPORTED');
    requireModel(this.#status === 'ACTIVE', 'NOTE_NOT_ACTIVE');
    if (!this.#gate) { requireModel(this.readiness(now).ready, 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED'); this.#gate = true; this.#event('pre-dispatch-gate-passed'); }
    requireModel(now <= this.#timing[`latestSend${chain}`], 'LATEST_SEND_BOUND_EXCEEDED');
    requireModel(!this.#manifests.has(chain), 'REPLACEMENT_ATTEMPT_UNSUPPORTED');
    const executor = EXECUTOR[chain], producer = PRODUCER[chain], opening = this.#opening(executor, branch), fallback = this.#opening(producer, branch);
    requireModel(same(opening.amount, fallback.amount) && opening.constraint === fallback.constraint && opening.localSalt === fallback.localSalt && opening.resultSaltCommitment === fallback.resultSaltCommitment, 'PRODUCER_CONSTRAINT_MISMATCH');
    const auth = this.#auth(executor, branch);
    let parent = auth.activationResult;
    if (chain === 'BTC') {
      const proof = this.#verifiedProof(parentProof);
      requireModel(proof.chain === 'SOL' && proof.branch === branch && proof.activeN === auth.activeN, 'WRONG_PARENT_BRANCH_OR_RESERVATION');
      requireModel(proof.scope === auth.scope && proof.menuBinding === auth.menuBinding && proof.constraint === auth.constraintS && proof.attempt === auth.attemptS && proof.parent === auth.activationResult && proof.resultSaltCommitment === auth.resultSaltCommitmentS, 'PARENT_AUTHORIZATION_BINDING_MISMATCH');
      requireModel(proof.readyAt <= now, 'PARENT_PROOF_NOT_READY');
      requireModel(now <= proof.certificateExpiresAt && now <= proof.observedAt + proof.maxAge, 'PARENT_CERTIFICATE_EXPIRED');
      requireModel(!this.#creation.isRevoked('SOL', proof.nf), 'PARENT_CURRENTLY_REVOKED');
      requireModel(!this.#creation.isConsumed('SOL', proof.nf), 'PARENT_ALREADY_CONSUMED');
      parent = proof.resultBinding;
      this.#read(executor, 'parent-opaque-local-proof', 'proof-inbox', 'SOL');
    }
    requireModel(selector === 0, 'UNSUPPORTED_MODEL_EFFECT_SELECTOR');
    this.#requireExecutableReadiness(chain, now, parentProof);
    const manifest = { classification: MODEL_ASSUMPTION, kind: 'ASSUMED_SIGNED_APPLICATION_MANIFEST_REFERENCE_ONLY', id: `MODEL_MANIFEST:${this.#id}:${chain}`, scope: auth.scope, menuBinding: auth.menuBinding, activeN: auth.activeN, branch, attempt: chain === 'SOL' ? auth.attemptS : auth.attemptB, chain, txRef: textId(txRef), selector, recipient: opening.recipient, amount: opening.amount, constraint: opening.constraint, parent, ...(chain === 'BTC' ? { completeParentProof: copy(parentProof) } : {}), registeredAt: now, fallbackAcknowledged: acknowledged, rawNativeBytesSupplied: false, referenceMayEnableNativeReconstruction: true };
    // Conservatively quarantine BEFORE any identity/signature handoff. In some
    // chains (notably Solana) a txid is signature material; no non-broadcastability
    // assumption follows merely from omitting a serialized transaction here.
    this.#exposure.set(chain, { chain, txRef: manifest.txRef, amount: manifest.amount, at: now, state: 'POTENTIAL_EXPOSURE_BEFORE_IDENTITY_HANDOFF', acknowledged, replacementAllowed: false });
    this.#event('exposure-quarantined-before-identity-handoff', { chain, txRef: manifest.txRef, amount: manifest.amount });
    for (const holder of [executor, producer]) this.#roles.get(holder).manifests[chain] = copy(manifest);
    this.#manifests.set(chain, copy(manifest));
    this.#event('manifest-prepositioned-before-broadcast', { chain, branch, executor, producer, txRef: manifest.txRef });
    requireModel(acknowledged, 'ACKNOWLEDGEMENT_MISSING_EXPOSURE_QUARANTINED');
    return copy(manifest);
  }
  dispatch(chain, now = this.#time) {
    this.#advance(now); this.#currentAuthority(); requireModel(this.#status === 'ACTIVE', 'NOTE_NOT_ACTIVE');
    const manifest = this.#manifests.get(chain); requireModel(manifest?.fallbackAcknowledged, 'PRE_SEND_MANIFEST_MISSING');
    requireModel(this.#live[EXECUTOR[chain]], 'NATIVE_EXECUTOR_UNAVAILABLE');
    requireModel(now <= this.#timing[`latestSend${chain}`] && now <= this.#timing.executeBy, 'LATEST_SEND_BOUND_EXCEEDED');
    requireModel(!this.#dispatches.has(chain), 'NATIVE_ATTEMPT_ALREADY_DISPATCHED');
    if (chain === 'BTC') {
      const parent = this.#verifiedProof(manifest.completeParentProof);
      requireModel(parent.resultBinding === manifest.parent, 'COMPLETE_PARENT_PROOF_BINDING_FAILED');
      requireModel(!this.#creation.isRevoked('SOL', parent.nf), 'PARENT_CURRENTLY_REVOKED');
      requireModel(!this.#creation.isConsumed('SOL', parent.nf), 'PARENT_ALREADY_CONSUMED');
      this.#read(EXECUTOR[chain], 'complete-checked-parent-proof-from-own-manifest', EXECUTOR[chain], 'SOL');
      requireModel(now <= parent.certificateExpiresAt && now <= parent.observedAt + parent.maxAge, 'PARENT_CERTIFICATE_EXPIRED');
    }
    this.#requireExecutableReadiness(chain, now, manifest.completeParentProof ?? null);
    this.#dispatches.set(chain, { at: now, manifest: copy(manifest) });
    this.#event('MODEL_NATIVE_BROADCAST', { chain, txRef: manifest.txRef, classification: 'SIMULATED_NOT_A_TRANSACTION' });
    return copy(manifest);
  }
  observeEffect(chain, { txRef, amount, recipient, executedAt, finalAt, expiresAt = 145, fee = '100', selector = 0, nativeTruthAssumed = true } = {}, now = this.#time) {
    this.#advance(now); requireModel(CHAINS.includes(chain), 'UNSUPPORTED_CHAIN_ROLE');
    quantity(amount); quantity(fee); tick(executedAt); tick(finalAt); tick(expiresAt); textId(txRef); textId(recipient);
    const manifest = this.#manifests.get(chain), dispatch = this.#dispatches.get(chain), exposure = this.#exposure.get(chain);
    let admissionFailure = null;
    if (!manifest || (!dispatch && !exposure) || txRef !== manifest.txRef || selector !== manifest.selector) admissionFailure = 'UNREGISTERED_NATIVE_EFFECT';
    else if (amount !== manifest.amount || recipient !== manifest.recipient) admissionFailure = chain === 'SOL' && !this.#oracle.menu.some(b => b.solAmount === amount) ? 'OUTCOME_OUTSIDE_FINITE_MENU' : 'MANIFEST_EFFECT_MISMATCH';
    else if (executedAt < exposure.at || executedAt > this.#timing.executeBy) admissionFailure = 'EXECUTION_OUTSIDE_WINDOW';
    else if (finalAt > this.#timing.executeBy || now > this.#timing.executeBy) admissionFailure = 'FINALITY_OR_OBSERVATION_AFTER_EXECUTE_BY';
    else if (finalAt < executedAt + this.#timing[`finality${chain}`] || now < finalAt || !nativeTruthAssumed) admissionFailure = 'NATIVE_FINALITY_ASSUMPTION_NOT_MET';
    else if (quantity(fee) > 10000n) admissionFailure = 'NATIVE_FEE_CAP_EXCEEDED';
    else if (this.#external.some(item => item.chain === chain && item.txRef === txRef && item.selector === selector && !item.admissionFailure)) admissionFailure = 'CERTIFICATE_REFRESH_UNSUPPORTED';
    const nf = this.#tag(chain, txRef, selector);
    const item = { classification: 'SIMULATED_NATIVE_FACT_NOT_CHAIN_EVIDENCE', chain, txRef, selector, recipient, amount, fee, executedAt, finalAt, observedAt: now, expiresAt, nf, nativeTruthAssumed, admissionFailure, statusAtObservation: this.#status, inclusionWithoutSenderBroadcastAcknowledgment: !dispatch && Boolean(exposure) };
    this.#external.push(item);
    this.#event('external-effect-retained', { chain, txRef, admissionFailure, statusAtObservation: this.#status });
    return copy(item);
  }

  produceProof(actor, branch, now = this.#time) {
    this.#advance(now); requireModel(!this.#withheld.has(actor) && !this.#declaredRefusal.has(actor), 'ACTOR_WITHHOLDS_PROOF');
    const opening = this.#opening(actor, branch), chain = CHAIN[actor], role = this.#role(actor), auth = this.#auth(actor, branch);
    requireModel(this.#live[ISSUER[chain]], 'CHAIN_ISSUER_UNAVAILABLE'); requireModel(this.#live.HISTORY, 'NATIVE_HISTORY_UNAVAILABLE');
    const manifest = role.manifests[chain]; requireModel(manifest && manifest.branch === branch, 'OWN_PRE_SEND_MANIFEST_MISSING');
    if (chain === 'BTC') {
      const parent = this.#verifiedProof(manifest.completeParentProof);
      requireModel(parent.resultBinding === manifest.parent && parent.branch === branch && parent.activeN === auth.activeN, 'COMPLETE_PARENT_PROOF_BINDING_FAILED');
      this.#read(actor, 'complete-checked-parent-proof-from-own-manifest', actor, 'SOL');
    }
    this.#read(actor, 'own-signed-pre-send-manifest', actor, chain);
    this.#read(actor, 'own-chain-fact-and-certificate', `CHAIN_SOURCE:${chain}`, chain);
    const fact = [...this.#external].reverse().find(item => item.chain === chain && item.txRef === manifest.txRef && !item.admissionFailure);
    requireModel(fact && fact.amount === opening.amount && fact.recipient === opening.recipient, 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE');
    requireModel(fact.finalAt <= now && fact.observedAt <= now, 'FINALITY_NOT_AVAILABLE');
    const readyAt = now + this.#timing.proofDuration;
    requireModel(readyAt < this.#timing.claimBy && readyAt <= fact.expiresAt && readyAt <= fact.observedAt + this.#timing.maxCertificateAge, 'PROOF_PIPELINE_DEADLINE_OR_CERTIFICATE_EXPIRED');
    const saltCommitment = chain === 'SOL' ? auth.resultSaltCommitmentS : auth.resultSaltCommitmentB;
    requireModel(opening.resultSaltBinding === MODEL_ASSUMPTION && opening.resultSaltCommitment === saltCommitment, 'LOCAL_RESULT_SALT_BINDING_MISMATCH');
    const bindingKey = JSON.stringify([auth.scope, auth.activeN, auth.menuBinding, branch, opening.constraint, fact.nf, fact.amount, fact.recipient, manifest.attempt, opening.localSalt]);
    if (!this.#resultIds.has(bindingKey)) this.#resultIds.set(bindingKey, `MODEL_RESULT_BINDING_${this.#resultIds.size + 1}`);
    const proof = this.#proofOracle.issue({ classification: MODEL_ASSUMPTION, kind: 'MODEL_LOCAL_LEG_PROOF', verifier: `MODEL_VK_${chain}`, unresolvedAssumptions: [], producer: actor, scope: auth.scope, menuBinding: auth.menuBinding, activeN: auth.activeN, branch, attempt: manifest.attempt, chain, constraint: opening.constraint, resultSaltCommitment: saltCommitment, nf: fact.nf, resultBinding: this.#resultIds.get(bindingKey), parent: manifest.parent, readyAt, certificateExpiresAt: fact.expiresAt, observedAt: fact.observedAt, maxAge: this.#timing.maxCertificateAge, snapshotRevocationSequence: this.#creation.sequence(chain) });
    this.#proofs.set(proof.id, copy(proof));
    for (const assembler of ['E_S', 'E_B']) if (this.#live[assembler] && this.#roles.has(assembler)) this.#roles.get(assembler).proofInbox[proof.id] = copy(proof);
    this.#event('MODEL_ASSUMED_LOCAL_PROOF_PRODUCED', { actor, chain, branch, proofId: proof.id, noNativeSigningKeyOrOwnerRequest: true, readyAt });
    return copy(proof);
  }
  receiveOpaqueProof(actor, proof, now = this.#time) { this.#advance(now); const verified = this.#verifiedProof(proof); const role = this.#role(actor); role.proofInbox[proof.id] = copy(verified); this.#read(actor, 'received-assumed-valid-opaque-proof', 'proof-sender', proof.chain); }
  assemble(actor, solProof, btcProof, { validFrom, validUntil }, now = this.#time) {
    this.#advance(now); requireModel(['E_S', 'E_B'].includes(actor), 'NO_AUTHORIZED_ASSEMBLER');
    const role = this.#role(actor); this.#currentAuthority(); requireModel(this.#status === 'ACTIVE', 'NOTE_NOT_ACTIVE');
    if (this.#profile === 'PC4-OWNER-WITNESS') { this.#read('OWNER', 'PC4-complete-graph-and-reservation-witness'); }
    requireModel(solProof && btcProof, 'BOTH_LOCAL_PROOFS_REQUIRED_NO_PARTIAL_PAYMENT');
    const S = this.#verifiedProof(solProof), B = this.#verifiedProof(btcProof);
    requireModel(role.proofInbox[S.id] && role.proofInbox[B.id], 'ASSEMBLER_PROOF_DELIVERY_MISSING');
    this.#read(actor, 'both-delivered-opaque-local-proofs', actor);
    const auth = this.#auth(actor, S.branch);
    requireModel(S.chain === 'SOL' && B.chain === 'BTC' && S.activeN === auth.activeN && B.activeN === auth.activeN && S.branch === B.branch && S.scope === auth.scope && B.scope === auth.scope && S.menuBinding === auth.menuBinding && B.menuBinding === auth.menuBinding, 'BRANCH_OR_RESERVATION_MISMATCH');
    requireModel(S.constraint === auth.constraintS && B.constraint === auth.constraintB && B.parent === S.resultBinding, 'EXACT_PARENT_OR_CONSTRAINT_MISMATCH');
    requireModel(S.attempt === auth.attemptS && B.attempt === auth.attemptB, 'ASSIGNED_ROLE_ATTEMPT_MISMATCH');
    requireModel(S.parent === auth.activationResult, 'ACTIVATION_PARENT_MISMATCH');
    requireModel(S.resultSaltCommitment === auth.resultSaltCommitmentS && B.resultSaltCommitment === auth.resultSaltCommitmentB, 'LOCAL_RESULT_SALT_BINDING_MISMATCH');
    requireModel(S.observedAt <= auth.executeBy && B.observedAt <= auth.executeBy, 'FINALITY_OR_OBSERVATION_AFTER_EXECUTE_BY');
    requireModel(S.readyAt <= now && B.readyAt <= now, 'LOCAL_PROOF_NOT_READY');
    tick(validFrom); tick(validUntil);
    requireModel(validFrom >= now + this.#timing.assemblyDuration && validUntil >= validFrom && validUntil < this.#timing.claimBy && validUntil - validFrom <= this.#timing.maxProofWindow, 'INVALID_OUTER_PROOF_WINDOW');
    requireModel([S, B].every(p => validUntil <= p.certificateExpiresAt && validUntil <= p.observedAt + p.maxAge), 'CERTIFICATE_DOES_NOT_COVER_WHOLE_WINDOW');
    const claim = { classification: MODEL_ASSUMPTION, kind: 'MODEL_GLOBAL_FULFILLMENT_PROOF_NOT_ZK', id: `MODEL_CLAIM_${this.#claims.size + 1}`, verifier: 'MODEL_VK_JOIN_PC5_F', unresolvedAssumptions: [], assembledBy: actor, scope: auth.scope, menuBinding: auth.menuBinding, grantId: auth.grantId, activeN: auth.activeN, branch: auth.branch, SOL: { nf: S.nf, proof: S.id, attempt: S.attempt }, BTC: { nf: B.nf, proof: B.id, attempt: B.attempt }, payoutCommitments: [auth.payoutCommitmentS, auth.payoutCommitmentB], ciphertexts: [auth.payoutCiphertextS, auth.payoutCiphertextB], validFrom, validUntil };
    this.#claims.set(claim.id, copy(claim)); this.#event('MODEL_GLOBAL_CLAIM_ASSEMBLED', { actor, claimId: claim.id, ownerReadRequired: this.#profile === 'PC4-OWNER-WITNESS' });
    return copy(claim);
  }
  claim(claim, now = this.#time) {
    this.#advance(now); this.#currentAuthority(); requireModel(this.#status === 'ACTIVE' && !this.#noteConsumed && !this.#creation.isTerminal(`MODEL_ACTIVE:${this.#id}`), 'TERMINAL_NOTE_ALREADY_CONSUMED');
    requireModel(claim?.classification === MODEL_ASSUMPTION && same(this.#claims.get(claim.id), claim), 'MODEL_GLOBAL_PROOF_NOT_ISSUED_OR_CHANGED');
    requireModel(this.#live[claim.assembledBy], 'CLAIM_SUBMITTER_UNAVAILABLE');
    requireModel(now >= claim.validFrom && now <= claim.validUntil && now < this.#timing.claimBy, 'CLAIM_INCLUSION_OUTSIDE_WINDOW');
    for (const chain of CHAINS) {
      requireModel(!this.#creation.isRevoked(chain, claim[chain].nf), 'CURRENT_TARGETED_REVOCATION');
      requireModel(!this.#creation.isConsumed(chain, claim[chain].nf), 'EFFECT_ALREADY_CONSUMED');
    }
    const branch = this.#oracle.menu.find(row => row.branch === claim.branch);
    requireModel(branch && quantity(branch.payoutS) + quantity(branch.payoutB) === quantity(this.#held), 'MODEL_BUDGET_CONSERVATION_FAILED');
    const notes = this.#fixedPayoutNotes(claim.branch);
    this.#creation.checkFulfillment(this.#grantId, claim.activeN, notes, this.#typedPayouts);
    this.#creation.fulfill(this.#grantId, claim.activeN, notes, this.#typedPayouts, Object.fromEntries(CHAINS.map(chain => [chain, claim[chain].nf])));
    this.#noteConsumed = true;
    this.#paid = { E_S: branch.payoutS, E_B: branch.payoutB }; this.#held = '0'; this.#status = 'PAID';
    this.#event('MODEL_GLOBAL_PAYMENT', { bothPayoutsTogether: true, payoutS: branch.payoutS, payoutB: branch.payoutB });
    return this.snapshot().authority;
  }
  refund(now = this.#time) {
    this.#advance(now); this.#currentAuthority(); requireModel(this.#status === 'ACTIVE' && !this.#noteConsumed && !this.#creation.isTerminal(`MODEL_ACTIVE:${this.#id}`), 'TERMINAL_NOTE_ALREADY_CONSUMED');
    requireModel(now >= this.#timing.claimBy, 'REFUND_TOO_EARLY');
    // Refund authorization/recovery access is an explicitly assumed separate path;
    // ownerOffline removes claim witness, not an invented arbitrary withdraw right.
    this.#creation.consumeRefund(`MODEL_ACTIVE:${this.#id}`);
    this.#refund = this.#held; this.#held = '0'; this.#noteConsumed = true; this.#status = 'REFUNDED';
    this.#event('MODEL_OWNER_REFUND', { amount: this.#refund, nativeEffectsRetained: this.#external.length, recoveryAuthorization: MODEL_ASSUMPTION });
    return this.snapshot().authority;
  }
  ordinaryWithdraw() { requireModel(false, 'ACTIVE_NOTE_HAS_NO_ORDINARY_WITHDRAWAL'); }
  #fixedPayoutNotes(branchId) {
    const branch = this.#oracle.menu.find(row => row.branch === branchId), auth = this.#oracle.authorizations.find(row => row.branch === branchId);
    requireModel(branch && auth, 'BRANCH_OUTSIDE_FINITE_MENU');
    return [{ slot: 'S', value: branch.payoutS, commitment: auth.payoutCommitmentS }, { slot: 'B', value: branch.payoutB, commitment: auth.payoutCommitmentB }].map(note => ({ ...note, kind: this.#typedPayouts ? 'PAYOUT' : 'NORMAL', originGrant: this.#grantId, branch: branchId }));
  }
  attemptDepositFixedPayout(branch, slot = 'S', now = this.#time) {
    this.#advance(now); requireModel(slot === 'S' || slot === 'B', 'UNKNOWN_PAYOUT_SLOT');
    const note = this.#fixedPayoutNotes(branch).find(item => item.slot === slot);
    this.#creation.deposit(note); this.#deposits.push(copy(note));
    this.#event('MODEL_OWNER_FRONTRUN_NORMAL_PAYOUT_DEPOSIT', { note, extraOwnerFunding: note.value });
    return copy(note);
  }
  attemptForeignPayoutCreation(branch, otherGrantId, now = this.#time) {
    this.#advance(now);
    this.#creation.checkFulfillment(otherGrantId, `MODEL_ACTIVE:${this.#id}`, this.#fixedPayoutNotes(branch), true);
    requireModel(false, 'UNEXPECTED_FOREIGN_CREATION_ALLOWED');
  }
  attemptOtherPayoutCreationPath(branch, path, now = this.#time) {
    this.#advance(now); this.#creation.checkOrdinaryCreation(path, this.#fixedPayoutNotes(branch)[0]);
    requireModel(false, 'UNEXPECTED_NONFULFILLMENT_PAYOUT_CREATION_ALLOWED');
  }
  revoke(issuer, chain, nf, now = this.#time) {
    this.#advance(now); requireModel(CHAINS.includes(chain) && ISSUER[chain] === issuer, 'ISSUER_CANNOT_WRITE_OTHER_CHAIN_PARTITION');
    requireModel(this.#live[issuer], 'CHAIN_ISSUER_UNAVAILABLE'); textId(nf);
    const { added, sequence, incident } = this.#creation.revoke(issuer, chain, nf);
    this.#event('partitioned-current-revocation', { issuer, chain, nf, sequence, added, afterPaidIncident: incident, rollback: false });
    return { added, incident, status: this.#status };
  }
  actorView(actor) {
    const role = this.#role(actor);
    return copy({ classification: 'MODEL_ACTOR_PROJECTION_NOT_ZK_CONFIDENTIALITY', actor, chain: CHAIN[actor], staticCapsule: role.capsule, ownManifests: role.manifests, opaqueProofInbox: role.proofInbox });
  }
  snapshot() {
    const total = quantity(this.#held) + quantity(this.#paid.E_S) + quantity(this.#paid.E_B) + quantity(this.#refund);
    return copy({ classification: 'M5_SIMULATION_NOT_NATIVE_OR_CRYPTOGRAPHIC_VERIFICATION', profile: this.#profile, id: this.#id, modelTime: this.#time, timing: this.#timing,
      authority: { status: this.#status, funded: this.#status !== 'UNFUNDED', activeN: `MODEL_ACTIVE:${this.#id}`, terminalConsumed: this.#noteConsumed, held: this.#held, payouts: this.#paid, ownerRefund: this.#refund, accountedTotal: total.toString(), budgetConserved: total === (this.#status === 'UNFUNDED' ? 0n : quantity(this.#oracle.budget)), ...this.#creation.safetySnapshot() },
      ownerStorePresent: this.#owner !== null, ownerOfflineAt: this.#ownerOfflineAt, gatePassed: this.#gate, retainedCopies: [...this.#roles.keys()], availability: this.#live, payoutCreationProfile: this.#typedPayouts ? 'TYPED_PAYOUT' : 'VULNERABLE_NORMAL', creationRegistry: this.#creation.snapshot(), separateFundedNormalDeposits: this.#deposits,
      omniscientTestOracle: { classification: this.#oracle.classification, menu: this.#oracle.menu, isActorInput: false },
      simulatedExternalEffects: this.#external, potentialNativeExposure: [...this.#exposure.values()], actorArtifactReads: this.#reads, events: this.#events,
      assumptions: ['All proof/certificate/signature/encryption checks represented by MODEL_ASSUMED_VALID tokens and explicit validation flags; no real proof generation.', 'One simulated canonical funded-note authority with assumed available honest history and immutable retained policy/anchor.', 'Per-chain raw witness access and truthful finality/certificate/identity issuers are required; P_i services are not implemented.', 'Model role copies are in-memory snapshots, not durable storage or operator independence.', 'Reference-only manifests may still enable native reconstruction/broadcast; potential exposure is quarantined before identity/signature handoff and persists after missing ACK/refund.', 'Certificate refresh/replacement is unsupported; repeated proof generation from the same fact preserves NF/result binding. Actual certificate-refresh compatibility remains a separate gate.', 'Owner refund authorization/recovery can return later; active owner cannot ordinarily withdraw.', 'Finite deadlines, gas/inclusion and availability bounds can fail after readiness. No partial payouts or invented compensation.'] });
  }
}
