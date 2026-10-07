import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaimAvailabilityModel, ModelCreationRegistry, ModelProofOracle, finiteMenu, availabilityCuts, ACTORS, MODEL_ASSUMPTION } from '../src/claim-availability-model.mjs';
import { setupAvailability, deliverModelSOL, deliverModelBTC, prepareModelClaim, completeAvailability, runAvailabilityScenarios, receiveIndependentModelSOLProof } from '../scripts/claim-availability-demo.mjs';
const rejects = (fn, code) => assert.throws(fn, { code });

test('M6 declared refusal of every S proof path prevents first exposure', () => {
  const c = setupAvailability();
  for (const actor of ['E_S', 'P_S']) c.model.declareProofRefusal(actor, true, 4);
  assert.equal(c.model.readiness(5).ready, false);
  rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'must-not-send' }, 10), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 0);
});

test('M6 one usable declared proof path per leg still completes', () => {
  for (const [solActor, btcActor] of [['E_S', 'E_B'], ['E_S', 'P_B'], ['P_S', 'E_B'], ['P_S', 'P_B']]) {
    const c = setupAvailability({ id: `single-${solActor}-${btcActor}` });
    for (const actor of ACTORS.filter(actor => actor !== solActor && actor !== btcActor)) c.model.declareProofRefusal(actor, true, 4);
    assert.equal(c.model.readiness(5).ready, true);
    completeAvailability(c, { sol: { producer: solActor }, btc: { producer: btcActor } }); c.model.claim(c.claim, 45);
    assert.equal(c.model.snapshot().authority.status, 'PAID');
  }
});

test('M6 hidden withholding is not observable readiness and can leave an unpaid prefix', () => {
  const c = setupAvailability();
  for (const actor of ['E_S', 'P_S']) c.model.withholdProof(actor, true, 4);
  assert.equal(c.model.readiness(5).ready, true);
  deliverModelSOL(c, { produce: false });
  for (const actor of ['E_S', 'P_S']) rejects(() => c.model.produceProof(actor, c.branch, 20), 'ACTOR_WITHHOLDS_PROOF');
  c.model.refund(150); assert.equal(c.model.snapshot().simulatedExternalEffects.length, 1);
  assert.equal(c.model.snapshot().authority.ownerRefund, '1000000');
});

test('M6 intermediate deadlines reject a pipeline that fits only claimBy', () => {
  const c = setupAvailability({ timing: { finalitySOL: 60 } });
  assert.equal(c.model.readiness(70).ready, false);
  rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'infeasible-send' }, 70), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 0);
});

test('M6 known BTC issuer outage before handoff keeps only the existing S exposure', () => {
  const c = setupAvailability(); deliverModelSOL(c); c.model.setAvailability({ I_B: false }, 23);
  rejects(() => c.model.registerManifest('BTC', c.branch, { txRef: 'unavailable-B', parentProof: c.sol.proof }, 25), 'KNOWN_PROOF_PATH_UNAVAILABLE');
  assert.deepEqual(c.model.snapshot().potentialNativeExposure.map(item => item.chain), ['SOL']);
  assert.equal(c.model.snapshot().simulatedExternalEffects.length, 1);
});

test('M6 dispatch rechecks newly known issuer outage without clearing handoff exposure', () => {
  const c = setupAvailability(); deliverModelSOL(c);
  c.model.registerManifest('BTC', c.branch, { txRef: 'already-handed-off-B', parentProof: c.sol.proof }, 25);
  c.model.setAvailability({ I_B: false }, 26);
  rejects(() => c.model.dispatch('BTC', 26), 'KNOWN_PROOF_PATH_UNAVAILABLE');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 2);
  assert.equal(c.model.snapshot().events.some(event => event.type === 'MODEL_NATIVE_BROADCAST' && event.chain === 'BTC'), false);
});

test('M6 B handoff rechecks declared path refusal after a usable S proof', () => {
  const c = setupAvailability(); deliverModelSOL(c);
  for (const actor of ['E_B', 'P_B']) c.model.declareProofRefusal(actor, true, 23);
  rejects(() => c.model.registerManifest('BTC', c.branch, { txRef: 'refused-B', parentProof: c.sol.proof }, 25), 'KNOWN_PROOF_PATH_UNAVAILABLE');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 1);
});

test('M6 parent certificate must cover all remaining work without assumed refresh', () => {
  for (const expiresAt of [30, 37, 38]) {
    const c = setupAvailability({ id: `parent-expiry-${expiresAt}` }); deliverModelSOL(c, { expiresAt });
    const send = () => c.model.registerManifest('BTC', c.branch, { txRef: 'bounded-B', parentProof: c.sol.proof }, 25);
    if (expiresAt < 38) { rejects(send, 'REMAINING_WORKFLOW_DEADLINE_INFEASIBLE'); assert.equal(c.model.snapshot().potentialNativeExposure.length, 1); }
    else { send(); assert.equal(c.model.snapshot().potentialNativeExposure.length, 2); }
  }
});

test('M6 dispatch rechecks the shortened remaining parent window after handoff', () => {
  const c = setupAvailability(); deliverModelSOL(c, { expiresAt: 38 });
  c.model.registerManifest('BTC', c.branch, { txRef: 'window-at-boundary', parentProof: c.sol.proof }, 25);
  rejects(() => c.model.dispatch('BTC', 26), 'REMAINING_WORKFLOW_DEADLINE_INFEASIBLE');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 2);
  assert.equal(c.model.snapshot().simulatedExternalEffects.length, 1);
});

test('M6 B does not require a future S producer or issuer after a retained eligible S proof', () => {
  const c = setupAvailability(); deliverModelSOL(c);
  c.model.setAvailability({ I_S: false }, 23);
  for (const actor of ['E_S', 'P_S']) c.model.declareProofRefusal(actor, true, 23);
  deliverModelBTC(c); prepareModelClaim(c); c.model.claim(c.claim, 45);
  assert.equal(c.model.snapshot().authority.status, 'PAID');
});

test('M6 timing boundaries enforce each stage and inclusive certificate age separately', () => {
  const cases = [
    [{}, 70, true], [{}, 71, false],
    [{ finalitySOL: 50, finalityBTC: 0, proofDuration: 0, latestSendBTC: 120 }, 70, true], [{ finalitySOL: 51, finalityBTC: 0, proofDuration: 0, latestSendBTC: 120 }, 70, false],
    [{ finalitySOL: 28 }, 70, true], [{ finalitySOL: 29 }, 70, false],
    [{ finalityBTC: 45 }, 70, true], [{ finalityBTC: 46 }, 70, false],
    [{ inclusionBudget: 64, maxProofWindow: 100 }, 70, true], [{ inclusionBudget: 65, maxProofWindow: 100 }, 70, false],
    [{ maxProofWindow: 3 }, 10, true], [{ maxProofWindow: 2 }, 10, false],
    [{ maxCertificateAge: 15 }, 10, true], [{ maxCertificateAge: 14 }, 10, false]
  ];
  for (const [timing, now, expected] of cases) assert.equal(setupAvailability({ timing }).model.readiness(now).ready, expected, JSON.stringify({ timing, now }));
  for (const [maxCertificateAge, expected] of [[18, true], [17, false]]) {
    const c = setupAvailability({ timing: { maxCertificateAge } }); deliverModelSOL(c);
    const send = () => c.model.registerManifest('BTC', c.branch, { txRef: 'age-B', parentProof: c.sol.proof }, 25);
    if (expected) send(); else rejects(send, 'REMAINING_WORKFLOW_DEADLINE_INFEASIBLE');
  }
});

test('M5 exact finite outcome relation and 2..16 bound', () => {
  assert.deepEqual(finiteMenu(), [{ branch: 'branch-0', solAmount: '3000000', btcAmount: '168750', payoutS: '310000', payoutB: '690000' }, { branch: 'branch-1', solAmount: '3500000', btcAmount: '156250', payoutS: '360000', payoutB: '640000' }]);
  rejects(() => finiteMenu(Array.from({ length: 17 }, (_, i) => String(3000000 + i))), 'FINITE_MENU_REQUIRES_2_TO_16_ENTRIES');
  assert.equal(finiteMenu(Array.from({ length: 16 }, (_, i) => String(3000000 + i))).length, 16);
  rejects(() => finiteMenu(['3000000']), 'FINITE_MENU_REQUIRES_2_TO_16_ENTRIES');
  rejects(() => finiteMenu(['3000000', '3000000']), 'DUPLICATE_MENU_OUTCOME');
});

for (const branch of ['branch-0', 'branch-1']) test(`PC5 owner erased, fallback producers and either assembler complete ${branch}`, () => {
  const c = completeAvailability(setupAvailability({ id: branch, branch }), { claim: { assembler: branch === 'branch-0' ? 'E_S' : 'E_B' } });
  assert.equal(c.model.snapshot().ownerStorePresent, false);
  c.model.claim(c.claim, 45);
  assert.deepEqual(c.model.snapshot().authority.payouts, { E_S: c.selected.payoutS, E_B: c.selected.payoutB });
  assert.equal(c.model.snapshot().actorArtifactReads.some(read => read.actor === 'OWNER' && read.at >= 3), false);
  assert.equal(c.claim.classification, MODEL_ASSUMPTION);
  assert.equal(c.claim.kind, 'MODEL_GLOBAL_FULFILLMENT_PROOF_NOT_ZK');
});

test('PC4 owner withheld final witness blocks even optimistic local proof availability', () => {
  const c = setupAvailability({ id: 'pc4', profile: 'PC4-OWNER-WITNESS', ownerOffline: false });
  deliverModelSOL(c); deliverModelBTC(c); c.model.ownerOffline(39);
  rejects(() => prepareModelClaim(c), 'OWNER_WITNESS_UNAVAILABLE'); c.model.refund(150);
  assert.equal(c.model.snapshot().simulatedExternalEffects.length, 2);
  assert.equal(c.model.snapshot().authority.ownerRefund, '1000000');
});

for (const [field, code] of Object.entries({ bytesAvailable: 'CAPSULE_BYTES_UNAVAILABLE', keyDelivered: 'CAPSULE_KEY_UNAVAILABLE', decrypts: 'CAPSULE_DECRYPTION_UNUSABLE', complete: 'CAPSULE_LOCAL_WITNESS_INCOMPLETE', bindingValid: 'CAPSULE_BINDING_INVALID', allBranches: 'CAPSULE_MENU_COVERAGE_INCOMPLETE' })) test(`static capsule gate separately rejects ${field}`, () => {
  const model = new ClaimAvailabilityModel(); model.activate(1);
  for (const actor of ACTORS.filter(a => a !== 'P_B')) model.deliverStatic(actor, {}, 2);
  rejects(() => model.deliverStatic('P_B', { [field]: false }, 2), code);
  rejects(() => model.registerManifest('SOL', 'branch-0', { txRef: 'not-sent' }, 10), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED');
  assert.equal(model.snapshot().potentialNativeExposure.length, 0);
  assert.equal(model.snapshot().simulatedExternalEffects.length, 0);
});

test('actor projections contain only own plaintext menu/witness; omniscient oracle separate', () => {
  const c = completeAvailability(setupAvailability({ id: 'roles' }));
  const s = c.model.actorView('E_S'), b = c.model.actorView('P_B');
  assert.ok(JSON.stringify(s).includes('private-sol-recipient')); assert.ok(!JSON.stringify(s).includes('private-btc-recipient'));
  assert.ok(JSON.stringify(b).includes('private-btc-recipient')); assert.ok(!JSON.stringify(b).includes('private-sol-recipient'));
  assert.ok(!JSON.stringify(s).includes('MODEL_PRIVATE_GRAPH')); assert.ok(!JSON.stringify(b).includes('MODEL_PRIVATE_GRAPH'));
  assert.equal(b.ownManifests.BTC.completeParentProof.kind, 'MODEL_LOCAL_LEG_PROOF');
  assert.equal(b.ownManifests.BTC.completeParentProof.id, c.sol.proof.id);
  assert.equal(c.model.snapshot().omniscientTestOracle.isActorInput, false);
  for (const read of c.model.snapshot().actorArtifactReads.filter(read => read.artifact === 'own-chain-fact-and-certificate')) assert.equal(read.chain, ['E_S', 'P_S'].includes(read.actor) ? 'SOL' : 'BTC');
});

test('one executor proof withholding closes only through live complete own-chain fallback', () => {
  const c = setupAvailability(); deliverModelSOL(c); deliverModelBTC(c, { produce: false });
  c.model.withholdProof('E_B', true, 36); rejects(() => c.model.produceProof('E_B', c.branch, 36), 'ACTOR_WITHHOLDS_PROOF');
  c.btc.proof = c.model.produceProof('P_B', c.branch, 36); prepareModelClaim(c); c.model.claim(c.claim, 45);
  assert.equal(c.model.snapshot().authority.status, 'PAID');
});

test('B dispatch and proof generation use retained S proof without internal S producer store', () => {
  const oracle = new ModelProofOracle(), c = setupAvailability({ proofOracle: oracle });
  deliverModelSOL(c, { produce: false }); receiveIndependentModelSOLProof(c, oracle);
  assert.equal(c.model.snapshot().events.some(event => event.type === 'MODEL_ASSUMED_LOCAL_PROOF_PRODUCED' && event.chain === 'SOL'), false);
  deliverModelBTC(c); prepareModelClaim(c, { assembler: 'E_B' }); c.model.claim(c.claim, 45);
  assert.equal(c.model.snapshot().authority.status, 'PAID');
  for (const actor of ['E_B', 'P_B']) assert.ok(c.model.snapshot().actorArtifactReads.some(read => read.actor === actor && read.holder === actor && read.artifact === 'complete-checked-parent-proof-from-own-manifest'));
});

test('all own-chain witness holders unavailable cannot be repaired by an assembler', () => {
  const c = setupAvailability(); deliverModelSOL(c); deliverModelBTC(c, { produce: false }); c.model.setAvailability({ E_B: false, P_B: false }, 36);
  rejects(() => c.model.produceProof('P_B', c.branch, 37), 'ACTOR_UNAVAILABLE');
  rejects(() => prepareModelClaim(c), 'BOTH_LOCAL_PROOFS_REQUIRED_NO_PARTIAL_PAYMENT'); c.model.refund(150);
  assert.equal(c.model.snapshot().simulatedExternalEffects.length, 2);
  assert.deepEqual(c.model.snapshot().authority.payouts, { E_S: '0', E_B: '0' });
});

test('wrong branch dispatch and absent suffix cannot pay a completed prefix', () => {
  const c = setupAvailability(); deliverModelSOL(c);
  rejects(() => c.model.registerManifest('BTC', 'branch-1', { txRef: 'spliced', parentProof: c.sol.proof }, 25), 'WRONG_PARENT_BRANCH_OR_RESERVATION');
  rejects(() => c.model.assemble('E_S', c.sol.proof, null, { validFrom: 42, validUntil: 80 }, 40), 'BOTH_LOCAL_PROOFS_REQUIRED_NO_PARTIAL_PAYMENT');
  assert.deepEqual(c.model.snapshot().authority.payouts, { E_S: '0', E_B: '0' });
});

test('otherwise assumed-valid foreign branch proof fails global reservation/branch join', () => {
  const oracle = new ModelProofOracle();
  const a = completeAvailability(setupAvailability({ id: 'join-a', proofOracle: oracle }));
  const b = completeAvailability(setupAvailability({ id: 'join-b', branch: 'branch-1', proofOracle: oracle }));
  a.model.receiveOpaqueProof('E_S', b.btc.proof, 40);
  rejects(() => a.model.assemble('E_S', a.sol.proof, b.btc.proof, { validFrom: 42, validUntil: 80 }, 40), 'BRANCH_OR_RESERVATION_MISMATCH');
});

test('tampered proof/VK/parent and unresolved assumptions never count as model-valid proof', () => {
  const c = completeAvailability(setupAvailability());
  rejects(() => c.model.assemble('E_S', c.sol.proof, { ...c.btc.proof, parent: 'wrong-parent' }, { validFrom: 42, validUntil: 80 }, 40), 'MODEL_PROOF_TOKEN_NOT_ISSUED_OR_CHANGED');
  for (const changed of [{ ...c.btc.proof, verifier: 'wrong-vk' }, { ...c.btc.proof, unresolvedAssumptions: ['not-resolved'] }]) rejects(() => c.model.assemble('E_S', c.sol.proof, changed, { validFrom: 42, validUntil: 80 }, 40), 'WRONG_MODEL_VK_OR_UNRESOLVED_ASSUMPTIONS');
});

test('stable result binding and nullifier survive own-chain producer substitution', () => {
  const c = setupAvailability(); deliverModelSOL(c);
  const second = c.model.produceProof('E_S', c.branch, 21);
  assert.equal(second.nf, c.sol.proof.nf); assert.equal(second.resultBinding, c.sol.proof.resultBinding);
  assert.notEqual(second.id, c.sol.proof.id); assert.notEqual(second.readyAt, c.sol.proof.readyAt);
});

test('both S holders check the same precommitted result salt before exposure', () => {
  const model = new ClaimAvailabilityModel({ id: 'salt-copy' }); model.activate(1);
  for (const actor of ACTORS.filter(actor => actor !== 'P_S')) model.deliverStatic(actor, {}, 2);
  rejects(() => model.deliverStatic('P_S', { ownSaltOverride: 'executor-chosen-alternate-salt' }, 2), 'CAPSULE_RESULT_SALT_BINDING_INVALID');
  rejects(() => model.registerManifest('SOL', 'branch-0', { txRef: 'not-handed-off' }, 10), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED');
  assert.equal(model.snapshot().potentialNativeExposure.length, 0);
  model.deliverStatic('P_S', {}, 10);
  assert.deepEqual(model.actorView('E_S').staticCapsule.ownOpenings, model.actorView('P_S').staticCapsule.ownOpenings);
});

test('outer join rejects otherwise assumed-valid wrong attempts, salt commitment and activation parent', () => {
  for (const [role, changes, code] of [
    ['SOL', { attempt: 'different-authorized-looking-S-attempt' }, 'ASSIGNED_ROLE_ATTEMPT_MISMATCH'],
    ['BTC', { attempt: 'different-authorized-looking-B-attempt' }, 'ASSIGNED_ROLE_ATTEMPT_MISMATCH'],
    ['SOL', { resultSaltCommitment: 'alternate-result-salt-commitment' }, 'LOCAL_RESULT_SALT_BINDING_MISMATCH'],
    ['SOL', { parent: 'different-activation-parent' }, 'ACTIVATION_PARENT_MISMATCH']
  ]) {
    const oracle = new ModelProofOracle(); const c = completeAvailability(setupAvailability({ id: `join-${role}-${code}`, proofOracle: oracle }));
    const changed = oracle.issue({ ...(role === 'SOL' ? c.sol.proof : c.btc.proof), ...changes });
    c.model.receiveOpaqueProof('E_S', changed, 40);
    rejects(() => c.model.assemble('E_S', role === 'SOL' ? changed : c.sol.proof, role === 'BTC' ? changed : c.btc.proof, { validFrom: 42, validUntil: 80 }, 40), code);
  }
});

test('B exposure refuses an otherwise assumed-valid S proof from another attempt', () => {
  const oracle = new ModelProofOracle(); const c = setupAvailability({ proofOracle: oracle }); deliverModelSOL(c);
  const changed = oracle.issue({ ...c.sol.proof, attempt: 'wrong-S-attempt' });
  rejects(() => c.model.registerManifest('BTC', c.branch, { txRef: 'should-not-hand-off', parentProof: changed }, 25), 'PARENT_AUTHORIZATION_BINDING_MISMATCH');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 1);
});

test('certificate refresh is explicitly unsupported rather than silently extending proof life', () => {
  const c = setupAvailability(); deliverModelSOL(c, { expiresAt: 30 });
  const refresh = c.model.observeEffect('SOL', { txRef: c.sol.fact.txRef, amount: c.selected.solAmount, recipient: 'private-sol-recipient', executedAt: 12, finalAt: 15, expiresAt: 140 }, 25);
  assert.equal(refresh.admissionFailure, 'CERTIFICATE_REFRESH_UNSUPPORTED');
  rejects(() => c.model.produceProof('P_S', c.branch, 31), 'PROOF_PIPELINE_DEADLINE_OR_CERTIFICATE_EXPIRED');
});

test('out-of-menu and unregistered effects remain explicit irreversible model observations', () => {
  const c = setupAvailability(); deliverModelSOL(c, { actualAmount: '3200000', produce: false });
  assert.equal(c.sol.fact.admissionFailure, 'OUTCOME_OUTSIDE_FINITE_MENU'); rejects(() => c.model.produceProof('P_S', c.branch, 20), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE');
  const extra = c.model.observeEffect('BTC', { txRef: 'unknown', amount: '8', recipient: 'private-btc-recipient', executedAt: 21, finalAt: 27, expiresAt: 145 }, 30);
  assert.equal(extra.admissionFailure, 'UNREGISTERED_NATIVE_EFFECT'); c.model.refund(150); assert.equal(c.model.snapshot().simulatedExternalEffects.length, 2);
});

test('unrelated revocation does not stale an issued proof; current target does', () => {
  const good = completeAvailability(setupAvailability({ id: 'unrelated' })); good.model.revoke('I_S', 'SOL', 'unrelated', 43); good.model.claim(good.claim, 45); assert.equal(good.model.snapshot().authority.status, 'PAID');
  const bad = completeAvailability(setupAvailability({ id: 'target' })); bad.model.revoke('I_B', 'BTC', bad.btc.proof.nf, 43); rejects(() => bad.model.claim(bad.claim, 45), 'CURRENT_TARGETED_REVOCATION'); bad.model.refund(150);
  assert.equal(bad.model.snapshot().authority.ownerRefund, '1000000');
});

test('issuer writes only own partition; SOL partition BTC-tag insertion cannot censor BTC', () => {
  const c = completeAvailability(setupAvailability());
  rejects(() => c.model.revoke('I_S', 'BTC', c.btc.proof.nf, 43), 'ISSUER_CANNOT_WRITE_OTHER_CHAIN_PARTITION');
  c.model.revoke('I_S', 'SOL', c.btc.proof.nf, 43); c.model.claim(c.claim, 45); assert.equal(c.model.snapshot().authority.status, 'PAID');
});

test('late targeted revocation records incident without rollback or second terminal spend', () => {
  const c = completeAvailability(setupAvailability()); c.model.claim(c.claim, 45);
  assert.equal(c.model.revoke('I_S', 'SOL', c.sol.proof.nf, 46).incident, true);
  rejects(() => c.model.claim(c.claim, 47), 'TERMINAL_NOTE_ALREADY_CONSUMED'); rejects(() => c.model.refund(150), 'TERMINAL_NOTE_ALREADY_CONSUMED');
  assert.equal(c.model.snapshot().authority.budgetConserved, true);
});

test('readiness then delayed fact permits refund plus retained native outputs', () => {
  const c = setupAvailability(); assert.equal(c.model.readiness(5).ready, true); deliverModelSOL(c); deliverModelBTC(c, { produce: false, observe: false });
  c.model.refund(150); c.model.observeEffect('BTC', { ...c.btc.params, expiresAt: 220 }, 151);
  rejects(() => c.model.produceProof('P_B', c.branch, 151), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE');
  assert.equal(c.model.snapshot().simulatedExternalEffects[1].statusAtObservation, 'REFUNDED'); assert.equal(c.model.snapshot().authority.budgetConserved, true);
});

test('native execution before executeBy is insufficient when completion or observation is late', () => {
  for (const [executedAt, finalAt, observedAt] of [[119, 125, 125], [110, 116, 125]]) {
    const c = setupAvailability({ id: `late-observe-${executedAt}` }); deliverModelSOL(c);
    c.model.registerManifest('BTC', c.branch, { txRef: 'late-B', parentProof: c.sol.proof }, 90); c.model.dispatch('BTC', 91);
    const fact = c.model.observeEffect('BTC', { txRef: 'late-B', amount: c.selected.btcAmount, recipient: 'private-btc-recipient', executedAt, finalAt }, observedAt);
    assert.equal(fact.admissionFailure, 'FINALITY_OR_OBSERVATION_AFTER_EXECUTE_BY');
    rejects(() => c.model.produceProof('P_B', c.branch, 125), 'COMPLETE_LOCAL_WITNESS_UNAVAILABLE');
    c.model.refund(150); assert.equal(c.model.snapshot().simulatedExternalEffects.length, 2);
  }
});

test('whole-window certificate validity and actual inclusion time are independently enforced', () => {
  const c = setupAvailability(); deliverModelSOL(c, { expiresAt: 60 }); deliverModelBTC(c);
  rejects(() => prepareModelClaim(c), 'CERTIFICATE_DOES_NOT_COVER_WHOLE_WINDOW'); prepareModelClaim(c, { validUntil: 55 });
  rejects(() => c.model.claim(c.claim, 56), 'CLAIM_INCLUSION_OUTSIDE_WINDOW'); c.model.refund(150);
});

test('latest-send recheck rejects a stale readiness snapshot before exposure handoff', () => {
  const c = setupAvailability(); assert.equal(c.model.readiness(5).ready, true);
  rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'too-late' }, 71), 'PRE_DISPATCH_STATIC_OR_AVAILABILITY_GATE_FAILED');
  assert.equal(c.model.snapshot().potentialNativeExposure.length, 0);
});

test('chain issuer and anchor availability remain necessary assumptions', () => {
  const c = setupAvailability(); deliverModelSOL(c); deliverModelBTC(c, { produce: false }); c.model.setAvailability({ I_B: false }, 36);
  rejects(() => c.model.produceProof('P_B', c.branch, 37), 'CHAIN_ISSUER_UNAVAILABLE');
  const d = completeAvailability(setupAvailability({ id: 'anchor' })); d.model.setRetainedAuthorityMaterial({ anchor: false }, 43); rejects(() => d.model.claim(d.claim, 45), 'ANCHOR_OR_POLICY_UNAVAILABLE');
});

test('16 actor masks distinguish per-leg proof cuts from assembler cut', () => {
  const cuts = availabilityCuts(); assert.equal(cuts.rows.length, 16);
  assert.deepEqual(cuts.minimalCuts.map(cut => [...cut].sort()).sort(), [['E_S', 'E_B'], ['E_S', 'P_S'], ['E_B', 'P_B']].map(cut => [...cut].sort()).sort());
  const onlyProducers = cuts.rows.find(row => row.available.P_S && row.available.P_B && !row.available.E_S && !row.available.E_B);
  assert.equal(onlyProducers.proofPipeline, true); assert.equal(onlyProducers.assemblyPath, false);
  assert.equal(availabilityCuts({ issuerBTC: false }).successfulMasks, 0);
});

test('vulnerable NORMAL payout front-run blocks full claim and permits full owner refund', () => {
  const c = completeAvailability(setupAvailability({ payoutCreation: 'VULNERABLE_NORMAL' }));
  assert.equal(c.model.attemptDepositFixedPayout(c.branch, 'S', 43).value, '310000');
  rejects(() => c.model.claim(c.claim, 45), 'DUPLICATE_NOTE_COMMITMENT'); c.model.refund(150);
  assert.equal(c.model.snapshot().authority.ownerRefund, '1000000'); assert.deepEqual(c.model.snapshot().authority.payouts, { E_S: '0', E_B: '0' });
  assert.equal(c.model.snapshot().separateFundedNormalDeposits.length, 1);
});

test('typed origin-exclusive PAYOUT prevents deposit and other-grant front-run', () => {
  const c = completeAvailability(setupAvailability());
  rejects(() => c.model.attemptDepositFixedPayout(c.branch, 'S', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_DEPOSIT');
  rejects(() => c.model.attemptForeignPayoutCreation(c.branch, 'different-grant', 43), 'PAYOUT_GRANT_ORIGIN_NOT_AUTHORIZED');
  rejects(() => c.model.attemptOtherPayoutCreationPath(c.branch, 'CHANGE', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_CHANGE');
  rejects(() => c.model.attemptOtherPayoutCreationPath(c.branch, 'REFUND', 43), 'PAYOUT_CREATION_FORBIDDEN_ON_REFUND');
  c.model.claim(c.claim, 45); assert.equal(c.model.snapshot().creationRegistry.notes.length, 2);
  assert.ok(c.model.snapshot().creationRegistry.notes.every(note => note.kind === 'PAYOUT' && note.path === 'MODEL_FULL_FULFILLMENT'));
});

test('shared grant nullifier rejects second activation before dispatch', () => {
  const registry = new ModelCreationRegistry(), a = new ClaimAvailabilityModel({ id: 'a', grantId: 'same', creationRegistry: registry }), b = new ClaimAvailabilityModel({ id: 'b', grantId: 'same', creationRegistry: registry });
  a.activate(1); rejects(() => b.activate(1), 'GRANT_ALREADY_ACTIVATED'); assert.equal(b.snapshot().authority.status, 'UNFUNDED');
});

test('shared authority consumes native effects once across active reservations with canonical NF', () => {
  const registry = new ModelCreationRegistry();
  const a = setupAvailability({ id: 'shared-a', creationRegistry: registry }), b = setupAvailability({ id: 'shared-b', creationRegistry: registry });
  const effects = { sol: { txReference: 'same-sol-tx' }, btc: { txReference: 'same-btc-tx' } };
  completeAvailability(a, effects); completeAvailability(b, effects);
  assert.equal(a.sol.proof.nf, b.sol.proof.nf); assert.equal(a.btc.proof.nf, b.btc.proof.nf);
  assert.equal(registry.canonicalEffectTag('SOL', 'same-sol-tx', 0), a.sol.proof.nf);
  a.model.claim(a.claim, 45); rejects(() => b.model.claim(b.claim, 45), 'EFFECT_ALREADY_CONSUMED'); b.model.refund(150);
  assert.equal(a.model.snapshot().authority.status, 'PAID'); assert.equal(b.model.snapshot().authority.status, 'REFUNDED');
  assert.equal(registry.snapshot().notes.length, 2);
});

test('same authority revocation state is shared across active reservations', () => {
  const registry = new ModelCreationRegistry();
  const a = setupAvailability({ id: 'rev-shared-a', creationRegistry: registry }), b = setupAvailability({ id: 'rev-shared-b', creationRegistry: registry });
  completeAvailability(a); completeAvailability(b);
  a.model.revoke('I_B', 'BTC', b.btc.proof.nf, 43);
  rejects(() => b.model.claim(b.claim, 45), 'CURRENT_TARGETED_REVOCATION'); a.model.claim(a.claim, 45);
  assert.ok(b.model.snapshot().authority.revoked.BTC.includes(b.btc.proof.nf));
});

test('same shared authority cannot register duplicate ACTIVE identity under a new grant', () => {
  const registry = new ModelCreationRegistry(), a = new ClaimAvailabilityModel({ id: 'same-active', grantId: 'first-grant', creationRegistry: registry }), b = new ClaimAvailabilityModel({ id: 'same-active', grantId: 'second-grant', creationRegistry: registry });
  a.activate(1); rejects(() => b.activate(1), 'ACTIVE_NOTE_ID_ALREADY_REGISTERED');
});

test('identity/signature handoff exposure survives lost ACK and producer inclusion', () => {
  const c = setupAvailability();
  rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'reconstructable-reference', acknowledged: false }, 10), 'ACKNOWLEDGEMENT_MISSING_EXPOSURE_QUARANTINED');
  rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'replacement' }, 11), 'REPLACEMENT_ATTEMPT_UNSUPPORTED');
  const fact = c.model.observeEffect('SOL', { txRef: 'reconstructable-reference', amount: c.selected.solAmount, recipient: 'private-sol-recipient', executedAt: 11, finalAt: 14 }, 20);
  assert.equal(fact.inclusionWithoutSenderBroadcastAcknowledgment, true); assert.equal(fact.admissionFailure, null);
  c.model.refund(150); assert.equal(c.model.snapshot().potentialNativeExposure.length, 1); assert.equal(c.model.snapshot().simulatedExternalEffects.length, 1);
});

test('producer inclusion after handoff remains admissible before later sender rebroadcast', () => {
  const c = setupAvailability();
  c.model.registerManifest('SOL', c.branch, { txRef: 'producer-first' }, 5);
  c.model.dispatch('SOL', 8);
  const fact = c.model.observeEffect('SOL', { txRef: 'producer-first', amount: c.selected.solAmount, recipient: 'private-sol-recipient', executedAt: 6, finalAt: 9 }, 10);
  assert.equal(fact.admissionFailure, null);
  assert.equal(c.model.produceProof('P_S', c.branch, 10).nf, fact.nf);
});

test('raw signed transaction handoff is unsupported and active note cannot ordinarily withdraw', () => {
  const c = setupAvailability(); rejects(() => c.model.registerManifest('SOL', c.branch, { txRef: 'ref', rawSignedNativeTransaction: 'bytes' }, 10), 'BROADCASTABLE_NATIVE_BYTES_HANDOFF_UNSUPPORTED');
  rejects(() => c.model.ordinaryWithdraw(), 'ACTIVE_NOTE_HAS_NO_ORDINARY_WITHDRAWAL'); assert.equal(c.model.snapshot().potentialNativeExposure.length, 0);
});

test('all bounded demo scenarios retain explicit simulation labels and conserved budget', () => {
  const evidence = runAvailabilityScenarios(); assert.equal(evidence.classification, 'MODEL_ONLY_NO_ZK_NO_NATIVE_RUNTIME_NO_SERVICE'); assert.ok(evidence.scenarios.length >= 20);
  for (const scenario of evidence.scenarios) { assert.equal(scenario.snapshot.authority.budgetConserved, true); assert.equal(scenario.snapshot.classification, 'M5_SIMULATION_NOT_NATIVE_OR_CRYPTOGRAPHIC_VERIFICATION'); }
});
