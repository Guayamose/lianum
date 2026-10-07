import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaimAvailabilityModel, ModelCreationRegistry, ModelProofOracle, MODEL_ASSUMPTION, finiteMenu, availabilityCuts, ACTORS } from '../../../packages/engine/src/core/claim-availability-model.mjs';

export function setupAvailability(options = {}) {
  const { ownerOffline = true, branch = 'branch-0', ...config } = options;
  const model = new ClaimAvailabilityModel(config);
  model.activate(1); model.deliverAll(2); if (ownerOffline) model.ownerOffline(3);
  return { model, branch, selected: finiteMenu(config.solAmounts).find(item => item.branch === branch), id: config.id ?? 'm5-reservation' };
}
export function deliverModelSOL(context, { expiresAt = 145, actualAmount, producer = 'P_S', produce = true, txReference } = {}) {
  const { model, branch, selected, id } = context;
  const txRef = txReference ?? `simulated:${id}:sol-tx`;
  model.registerManifest('SOL', branch, { txRef }, 10); model.dispatch('SOL', 11);
  const fact = model.observeEffect('SOL', { txRef, amount: actualAmount ?? selected.solAmount, recipient: 'private-sol-recipient', executedAt: 12, finalAt: 15, expiresAt }, 20);
  const proof = produce ? model.produceProof(producer, branch, 20) : null;
  context.sol = { fact, proof }; return context.sol;
}
export function deliverModelBTC(context, { expiresAt = 145, producer = 'P_B', produce = true, observe = true, txReference } = {}) {
  const { model, branch, selected, id } = context;
  const txRef = txReference ?? `simulated:${id}:btc-tx`;
  model.registerManifest('BTC', branch, { txRef, parentProof: context.sol.proof }, 25); model.dispatch('BTC', 26);
  const params = { txRef, amount: selected.btcAmount, recipient: 'private-btc-recipient', executedAt: 27, finalAt: 33, expiresAt };
  const fact = observe ? model.observeEffect('BTC', params, 36) : null;
  const proof = produce && observe ? model.produceProof(producer, branch, 36) : null;
  context.btc = { fact, proof, params }; return context.btc;
}
export function prepareModelClaim(context, { assembler = 'E_S', validFrom = 42, validUntil = 80, now = 40 } = {}) {
  context.claim = context.model.assemble(assembler, context.sol.proof, context.btc.proof, { validFrom, validUntil }, now);
  return context.claim;
}
export function completeAvailability(context, options = {}) { deliverModelSOL(context, options.sol); deliverModelBTC(context, options.btc); prepareModelClaim(context, options.claim); return context; }
/** Test fixture for an independent assumed proof producer: no actual proof or
 * native verification. E_B receives only the opaque statement, not raw S data. */
export function receiveIndependentModelSOLProof(context, oracle) {
  const { model, branch, sol } = context;
  const auth = model.actorView('E_B').staticCapsule.authorizations.find(item => item.branch === branch);
  const proof = oracle.issue({ classification: MODEL_ASSUMPTION, kind: 'MODEL_LOCAL_LEG_PROOF', verifier: 'MODEL_VK_SOL', unresolvedAssumptions: [], producer: 'INDEPENDENT_MODEL_PRODUCER', scope: auth.scope, menuBinding: auth.menuBinding, activeN: auth.activeN, branch, attempt: auth.attemptS, chain: 'SOL', constraint: auth.constraintS, resultSaltCommitment: auth.resultSaltCommitmentS, nf: sol.fact.nf, resultBinding: `MODEL_EXTERNAL_STABLE_RESULT:${context.id}`, parent: auth.activationResult, readyAt: 22, certificateExpiresAt: sol.fact.expiresAt, observedAt: sol.fact.observedAt, maxAge: 100, snapshotRevocationSequence: 0 });
  model.receiveOpaqueProof('E_B', proof, 22); context.sol.proof = proof;
  return proof;
}
const rejection = (fn, code) => {
  let caught; try { fn(); } catch (error) { caught = error; }
  assert.equal(caught?.code, code); return code;
};

export function runAvailabilityScenarios() {
  const scenarios = [];
  const retain = (name, context, finding, extra = {}) => {
    const snapshot = context.model.snapshot(); assert.equal(snapshot.authority.budgetConserved, true);
    scenarios.push({ name, classification: 'BOUNDED_MODEL_SCENARIO_NOT_NATIVE_OR_CRYPTOGRAPHIC_TEST', finding, ...extra, snapshot });
  };
  {
    const oracle = new ModelProofOracle(), c = setupAvailability({ id: 'external-S-proof-material', proofOracle: oracle });
    deliverModelSOL(c, { produce: false }); receiveIndependentModelSOLProof(c, oracle);
    deliverModelBTC(c); prepareModelClaim(c, { assembler: 'E_B' }); c.model.claim(c.claim, 45);
    retain('B uses retained independent opaque S proof', c, 'The test oracle supplies an assumed-valid S proof without local S proof production. B dispatch and P_B proof generation use the complete proof retained in the B manifest; they do not read an internal S producer store. This is a material-dependency test, not proof-generation verification.');
  }
  {
    const c = setupAvailability({ id: 'producer-before-sender-rebroadcast' });
    c.model.registerManifest('SOL', c.branch, { txRef: 'producer-first' }, 5); c.model.dispatch('SOL', 8);
    const fact = c.model.observeEffect('SOL', { txRef: 'producer-first', amount: c.selected.solAmount, recipient: 'private-sol-recipient', executedAt: 6, finalAt: 9 }, 10);
    assert.equal(fact.admissionFailure, null); c.model.produceProof('P_S', c.branch, 10); c.model.refund(150);
    retain('Producer includes before later sender rebroadcast', c, 'Potential exposure starts at handoff t5. Producer-controlled inclusion t6 remains admitted after the sender records its own broadcast t8; neither ACK nor local broadcast establishes exclusive timing control. No B suffix means no global payment.');
  }
  {
    const c = setupAvailability({ id: 'pc4-owner-withholds', profile: 'PC4-OWNER-WITNESS', ownerOffline: false });
    deliverModelSOL(c); deliverModelBTC(c); c.model.ownerOffline(39);
    rejection(() => prepareModelClaim(c), 'OWNER_WITNESS_UNAVAILABLE'); c.model.refund(150);
    retain('PC4 owner withholds after both deliveries', c, 'Owner-only full witness missing; optimistic local proof availability still cannot complete PC4 global proof. Owner recovery later refunds the input; both model outputs remain.');
  }
  for (const branch of ['branch-0', 'branch-1']) {
    const c = setupAvailability({ id: `pc5-offline-${branch}`, branch });
    c.model.withholdProof('E_S', true, 4); c.model.withholdProof('E_B', true, 4);
    completeAvailability(c, { claim: { assembler: branch === 'branch-0' ? 'E_S' : 'E_B' } });
    c.model.claim(c.claim, 45);
    assert.deepEqual(c.model.snapshot().authority.payouts, { E_S: c.selected.payoutS, E_B: c.selected.payoutB });
    assert.equal(c.model.snapshot().actorArtifactReads.some(read => read.actor === 'OWNER' && read.at >= 3), false);
    retain(`PC5 owner offline ${branch}`, c, 'Both native outcomes, local proofs and global payment are model assumptions. Fallback P_S/P_B and a surviving assembler close the data dependency with no post-erasure owner read.', { branchOutcome: c.selected });
  }
  {
    const c = setupAvailability({ id: 'peer-proof-withheld' }); deliverModelSOL(c); deliverModelBTC(c, { produce: false });
    c.model.withholdProof('E_B', true, 36); rejection(() => c.model.produceProof('E_B', c.branch, 36), 'ACTOR_WITHHOLDS_PROOF');
    c.btc.proof = c.model.produceProof('P_B', c.branch, 36); prepareModelClaim(c); c.model.claim(c.claim, 45);
    retain('Peer withholds proof; prepositioned own-chain producer recovers', c, 'P_B has its own opening and full checked parent proof/manifest; no raw SOL witness or owner request is needed.');
  }
  {
    const model = new ClaimAvailabilityModel({ id: 'missing-static-copy' }); model.activate(1);
    for (const actor of ACTORS.filter(actor => actor !== 'P_B')) model.deliverStatic(actor, {}, 2);
    model.ownerOffline(3); const ready = model.readiness(5);
    rejection(() => model.registerManifest('SOL', 'branch-0', { txRef: 'never-handed-off' }, 10), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED'); model.refund(150);
    retain('One required static package withheld', { model }, 'No first handoff/native dispatch or exposure; the active note still obeys its finite refund rule.', { readiness: ready });
  }
  {
    const c = setupAvailability({ id: 'all-btc-holders-lost' }); deliverModelSOL(c); deliverModelBTC(c, { produce: false });
    c.model.setAvailability({ E_B: false, P_B: false }, 36);
    rejection(() => c.model.produceProof('P_B', c.branch, 37), 'ACTOR_UNAVAILABLE');
    rejection(() => prepareModelClaim(c), 'BOTH_LOCAL_PROOFS_REQUIRED_NO_PARTIAL_PAYMENT'); c.model.refund(150);
    retain('All holders of one leg witness disappear', c, 'Both model outputs exist; no B proof can be manufactured by the remaining assembler. Owner refund retains both external effects.');
  }
  {
    const c = setupAvailability({ id: 'branch-splice-and-partial-payment' }); deliverModelSOL(c);
    rejection(() => c.model.registerManifest('BTC', 'branch-1', { txRef: 'wrong-branch', parentProof: c.sol.proof }, 25), 'WRONG_PARENT_BRANCH_OR_RESERVATION');
    rejection(() => c.model.assemble('E_S', c.sol.proof, null, { validFrom: 42, validUntil: 80 }, 40), 'BOTH_LOCAL_PROOFS_REQUIRED_NO_PARTIAL_PAYMENT'); c.model.refund(150);
    retain('Wrong downstream branch and partial claim', c, 'No per-leg payout; the retained prefix can still be lost under the global condition.');
  }
  {
    const c = setupAvailability({ id: 'out-of-menu' }); deliverModelSOL(c, { actualAmount: '3200000', produce: false });
    assert.equal(c.sol.fact.admissionFailure, 'OUTCOME_OUTSIDE_FINITE_MENU');
    rejection(() => c.model.produceProof('P_S', c.branch, 20), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE'); c.model.refund(150);
    retain('Output outside finite menu', c, 'The unsupported effect is preserved and cannot be rounded into a supported branch.');
  }
  for (const mode of ['unrelated', 'target-before', 'target-after', 'wrong-partition']) {
    const c = completeAvailability(setupAvailability({ id: `revocation-${mode}` }));
    if (mode === 'unrelated') { c.model.revoke('I_S', 'SOL', 'unrelated-tag', 43); c.model.claim(c.claim, 45); }
    if (mode === 'target-before') { c.model.revoke('I_B', 'BTC', c.btc.proof.nf, 43); rejection(() => c.model.claim(c.claim, 45), 'CURRENT_TARGETED_REVOCATION'); c.model.refund(150); }
    if (mode === 'target-after') { c.model.claim(c.claim, 45); assert.equal(c.model.revoke('I_S', 'SOL', c.sol.proof.nf, 46).incident, true); rejection(() => c.model.refund(150), 'TERMINAL_NOTE_ALREADY_CONSUMED'); }
    if (mode === 'wrong-partition') {
      rejection(() => c.model.revoke('I_S', 'BTC', c.btc.proof.nf, 43), 'ISSUER_CANNOT_WRITE_OTHER_CHAIN_PARTITION');
      c.model.revoke('I_S', 'SOL', c.btc.proof.nf, 43); c.model.claim(c.claim, 45);
    }
    retain(`Current typed revocation: ${mode}`, c, 'Current per-chain lookup at acceptance; unrelated updates need no reproof, targeted earlier revocation rejects, later revocation cannot undo payment.');
  }
  {
    const c = setupAvailability({ id: 'late-fact-after-refund' }); const snapshot = c.model.readiness(5);
    deliverModelSOL(c); deliverModelBTC(c, { produce: false, observe: false }); c.model.refund(150);
    c.model.observeEffect('BTC', { ...c.btc.params, expiresAt: 220 }, 151);
    rejection(() => c.model.produceProof('P_B', c.branch, 151), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE');
    retain('Finite deadline with delayed evidence', c, 'Correct readiness does not imply timely evidence/inclusion. A B effect executed within the native window is learned only after canonical owner refund.', { earlierReadiness: snapshot });
  }
  {
    const c = setupAvailability({ id: 'completion-after-execute-by' }); deliverModelSOL(c);
    c.model.registerManifest('BTC', c.branch, { txRef: 'late-completion-B', parentProof: c.sol.proof }, 90); c.model.dispatch('BTC', 91);
    const late = c.model.observeEffect('BTC', { txRef: 'late-completion-B', amount: c.selected.btcAmount, recipient: 'private-btc-recipient', executedAt: 119, finalAt: 125 }, 125);
    assert.equal(late.admissionFailure, 'FINALITY_OR_OBSERVATION_AFTER_EXECUTE_BY');
    rejection(() => c.model.produceProof('P_B', c.branch, 125), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE'); c.model.refund(150);
    retain('Executed before deadline but completed after executeBy', c, 'Execution at 119 precedes executeBy 120; finality and observation at 125 still prevent admission, despite time remaining before claimBy 150. Both simulated native effects remain after refund.');
  }
  {
    const c = setupAvailability({ id: 'certificate-and-inclusion-deadline' }); deliverModelSOL(c, { expiresAt: 60 }); deliverModelBTC(c);
    rejection(() => prepareModelClaim(c), 'CERTIFICATE_DOES_NOT_COVER_WHOLE_WINDOW');
    prepareModelClaim(c, { validFrom: 42, validUntil: 55 }); rejection(() => c.model.claim(c.claim, 56), 'CLAIM_INCLUSION_OUTSIDE_WINDOW'); c.model.refund(150);
    retain('Certificate covers whole proof window; finite inclusion delay still loses', c, 'Extending refund time cannot extend a certificate. A valid narrower claim can miss inclusion and leave outputs unpaid.');
  }
  {
    const c = setupAvailability({ id: 'issuer-unavailable' }); deliverModelSOL(c); deliverModelBTC(c, { produce: false });
    c.model.setAvailability({ I_B: false }, 36); rejection(() => c.model.produceProof('P_B', c.branch, 37), 'CHAIN_ISSUER_UNAVAILABLE'); c.model.refund(150);
    retain('Required chain issuer unavailable', c, 'A live witness holder is insufficient without the declared truthful available issuer/finality source.');
  }
  {
    const c = setupAvailability({ id: 'both-assemblers-unavailable' }); deliverModelSOL(c); deliverModelBTC(c, { produce: false });
    c.model.setAvailability({ E_S: false, E_B: false }, 36); c.btc.proof = c.model.produceProof('P_B', c.branch, 36);
    rejection(() => prepareModelClaim(c), 'ACTOR_UNAVAILABLE'); c.model.refund(150);
    retain('Proof pipeline alive but both assemblers unavailable', c, 'Producer availability does not guarantee a live submission path or fee budget.');
  }
  {
    const c = completeAvailability(setupAvailability({ id: 'normal-output-collision-baseline', payoutCreation: 'VULNERABLE_NORMAL' }));
    const deposited = c.model.attemptDepositFixedPayout(c.branch, 'S', 43);
    rejection(() => c.model.claim(c.claim, 45), 'DUPLICATE_NOTE_COMMITMENT'); c.model.refund(150);
    retain('Vulnerable pre-fixed NORMAL output collision', c, 'Owner funds only the S payout CM early, blocking full claim through permanent duplicate-CM rejection, and later refunds all reserved B.', { extraOwnerFunding: deposited.value, separatelyCreatedNormalPayout: deposited });
  }
  {
    const c = completeAvailability(setupAvailability({ id: 'typed-payout-origin-fix' }));
    rejection(() => c.model.attemptDepositFixedPayout(c.branch, 'S', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_DEPOSIT');
    rejection(() => c.model.attemptForeignPayoutCreation(c.branch, 'another-grant', 43), 'PAYOUT_GRANT_ORIGIN_NOT_AUTHORIZED');
    rejection(() => c.model.attemptOtherPayoutCreationPath(c.branch, 'CHANGE', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_CHANGE');
    rejection(() => c.model.attemptOtherPayoutCreationPath(c.branch, 'REFUND', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_REFUND');
    c.model.claim(c.claim, 45); retain('Origin-exclusive typed PAYOUT outputs', c, 'Only full fulfillment of the unique activated grant creates both typed payout notes; deposit and other-origin routes reject.');
  }
  {
    const registry = new ModelCreationRegistry(), first = new ClaimAvailabilityModel({ id: 'grant-a', grantId: 'shared-grant', creationRegistry: registry }), second = new ClaimAvailabilityModel({ id: 'grant-b', grantId: 'shared-grant', creationRegistry: registry });
    first.activate(1); rejection(() => second.activate(1), 'GRANT_ALREADY_ACTIVATED');
    retain('Second activation cannot reuse grant', { model: first }, 'Grant registration precedes dispatch; payout commitments derive from the prechosen grant, without a circular dependency on N_active.', { rejectedSecondActivation: second.snapshot().authority });
  }
  {
    const c = setupAvailability({ id: 'identity-handoff-lost-ack' });
    rejection(() => c.model.registerManifest('SOL', c.branch, { txRef: 'identity-may-reconstruct-native-tx', acknowledged: false }, 10), 'ACKNOWLEDGEMENT_MISSING_EXPOSURE_QUARANTINED');
    rejection(() => c.model.registerManifest('SOL', c.branch, { txRef: 'unsafe-replacement' }, 11), 'REPLACEMENT_ATTEMPT_UNSUPPORTED');
    rejection(() => c.model.dispatch('SOL', 11), 'PRE_SEND_MANIFEST_MISSING');
    const observed = c.model.observeEffect('SOL', { txRef: 'identity-may-reconstruct-native-tx', amount: c.selected.solAmount, recipient: 'private-sol-recipient', executedAt: 11, finalAt: 14, expiresAt: 145 }, 20);
    assert.equal(observed.inclusionWithoutSenderBroadcastAcknowledgment, true); c.model.refund(150);
    retain('Identity handoff can expose a transaction before ACK', c, 'Model adversarial inclusion preserves potential exposure before handoff, rejects replacement after lost ACK, and retains output after refund. No native reconstruction was executed.');
  }
  {
    const c = setupAvailability({ id: 'unregistered-effect' });
    const fact = c.model.observeEffect('SOL', { txRef: 'unregistered-broadcast', amount: '3000000', recipient: 'private-sol-recipient', executedAt: 10, finalAt: 13, expiresAt: 145 }, 20);
    assert.equal(fact.admissionFailure, 'UNREGISTERED_NATIVE_EFFECT'); c.model.refund(150);
    retain('Unregistered native output is retained but cannot qualify', c, 'No registered admitted attempt does not mean no economic effect.');
  }
  {
    const registry = new ModelCreationRegistry();
    const a = setupAvailability({ id: 'same-authority-reservation-a', creationRegistry: registry });
    const b = setupAvailability({ id: 'same-authority-reservation-b', creationRegistry: registry });
    const sameEffects = { sol: { txReference: 'same-canonical-SOL-effect' }, btc: { txReference: 'same-canonical-BTC-effect' } };
    completeAvailability(a, sameEffects); completeAvailability(b, sameEffects);
    assert.equal(a.sol.proof.nf, b.sol.proof.nf); assert.equal(a.btc.proof.nf, b.btc.proof.nf);
    a.model.claim(a.claim, 45); rejection(() => b.model.claim(b.claim, 45), 'EFFECT_ALREADY_CONSUMED'); b.model.refund(150);
    retain('One authority rejects reused native resources across active reservations', b, 'Both reservations were activated before the effects. Assumed-valid separate binding attestations cannot credit the same canonical resource twice in this shared authority.', { firstReservationSnapshot: a.model.snapshot(), sameNF: { SOL: a.sol.proof.nf, BTC: a.btc.proof.nf }, identityNote: 'Deterministic public SHA-256 model labels over scope/chain/genesis/txRef/selector, not a private VRF construction.' });
  }
  return { schemaVersion: 5, classification: 'MODEL_ONLY_NO_ZK_NO_NATIVE_RUNTIME_NO_SERVICE', menu: finiteMenu(), scenarios, availability: availabilityCuts(), interpretation: 'Success demonstrates closure of specified model data dependencies under assumptions, not real proofs, witness confidentiality, native finality, operator independence, unconditional payment or three-chain acceptance.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidence = runAvailabilityScenarios();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  evidence.recordedAt = new Date().toISOString();
  evidence.sourceSHA256 = Object.fromEntries(await Promise.all(['src/claim-availability-model.mjs', 'scripts/claim-availability-demo.mjs', 'test/claim-availability-model.test.mjs'].map(async path => [path, createHash('sha256').update(await readFile(join(root, path))).digest('hex')])));
  await mkdir(join(root, 'evidence'), { recursive: true });
  await writeFile(join(root, 'evidence/m5-claim-availability.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ classification: evidence.classification, scenarios: evidence.scenarios.length, masks: evidence.availability.rows.length, successfulMasksUnderAssumptions: evidence.availability.successfulMasks, minimalCuts: evidence.availability.minimalCuts, evidence: 'evidence/m5-claim-availability.json' }));
}
