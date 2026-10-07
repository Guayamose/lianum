/** One bounded, newly funded local EVM acceptance for generic graph economics.
 * This proves funding/recovery composition only. Foreign execution and generic
 * fulfillment remain disabled. The local clock is explicitly synthetic.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { createGenericOwnerProcess } from '../../../../packages/engine/src/execution/local/local-owner.mjs';
import { createLocalEvm } from '../../../../packages/engine/src/execution/local/local-evm.mjs';
import { compileGenericPool, deployGenericPool } from '../../../../packages/engine/src/execution/local/local-deployment.mjs';
import { genericVerifierSources } from '../../../../packages/engine/src/execution/local/local-profile.mjs';
import { inspectGenericSnapshot, reserveProjection } from '../../../../packages/engine/src/execution/local/local-ledger.mjs';
import { reserveInputs, refundInputs, publicWords, A0, digestHex } from '../../../../experiments/engine/private-core-proof/generic-wrappers/abi.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
export const GENERIC_FUNDED_ARGUMENT = '--authorized-local-generic-funded-graph';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, (_key, child) => typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const bare = value => value.startsWith('0x') ? value.slice(2) : value;
const prefixed = value => '0x' + bare(value);
const randomHash = () => randomBytes(32).toString('hex');
const publicPath = path => ({ baseRoot: bare(path.root), acceptedRoot: bare(path.root),
  siblings: path.siblings.map(bare), leafIndex: path.index });
const boundedError = error => ({ name: /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error?.name ?? '') ? error.name : 'Error',
  code: [error?.message, error?.code].find(value => /^[A-Z][A-Z0-9_]{1,150}$/.test(value ?? '')) ?? 'GENERIC_ACCEPTANCE_FAILURE' });

function sourceManifest() {
  const selected = ['scripts/integration-generic-funded-graph.mjs', 'scripts/generic-owner-worker.mjs',
    'contracts/PrivateGenericAssetNotePool.sol', 'src/private-resource-policy.mjs'];
  for (const directory of ['src/paeg', 'experiments/private-core-proof/generic-graph',
    'experiments/private-core-proof/generic-funding', 'experiments/private-core-proof/generic-wrappers']) {
    const walk = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name === '.local') continue;
        const absolute = join(path, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile()) selected.push(relative(project, absolute));
        else throw new Error('GENERIC_SOURCE_NOT_REGULAR');
      }
    };
    walk(join(project, directory));
  }
  return [...new Set(selected)].sort().map(path => {
    const bytes = readFileSync(join(project, path)); return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}

export async function runGenericFundedGraph(argv = process.argv.slice(2)) {
  assert.deepEqual(argv, [GENERIC_FUNDED_ARGUMENT], 'GENERIC_LOCAL_AUTHORIZATION_ARGUMENT');
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const directory = join(project, 'evidence/generic-funded-graph', runId);
  const privateDirectory = join(project, '.local/private-generic-funded', runId);
  mkdirSync(join(directory, 'public-proofs'), { recursive: true });
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  const report = { classification: 'GENERIC_FUNDED_GRAPH_LOCAL_ACCEPTANCE_IN_PROGRESS', runId,
    phase: 'source-and-pins', startedAt: new Date().toISOString(), fullAcceptance: false,
    graphCapacity: 4, sameKeysAcrossShapes: false, foreignTransactions: 0,
    genericFulfillmentEnabled: false, realTimeExpiryDemonstrated: false,
    ownerProcessExitBeforeRecoveryDemonstrated: false, source: sourceManifest(),
    resourcePolicy: PRIVATE_RESOURCE_POLICY, stages: [], proofs: [], states: [], transactions: [],
    disclosure: 'Synthetic local fake-value test. Graph shapes are explicitly disclosed test-oracle information. '
      + 'Owner keys and full graph witness stay in a separate trusted local owner process. '
      + 'Coordinator receives private A0 proof tuples, which are excluded from this public evidence. '
      + 'This is neither native fulfillment, external operator independence, adversarial OS isolation nor full wallet privacy.' };
  const persist = () => writeFileSync(join(directory, 'report.json'), json(report));
  const stage = name => { report.phase = name; report.stages.push({ stage: name, at: new Date().toISOString() }); persist(); };
  const savePublicProof = (label, mode, proof) => {
    // Explicit terminal-only allowlist. A0 139-word tuples must never reach here.
    const sizes = { deposit_balance: 26, reserve: 66, refund: 51, withdraw_balance: 39 };
    assert.ok(Object.hasOwn(sizes, mode), 'GENERIC_PUBLIC_PROOF_ALLOWLIST');
    assert.equal(proof.publicInputs.length, sizes[mode], 'GENERIC_PUBLIC_PROOF_SIZE');
    const bytes = Buffer.from(proof.proof), words = json(proof.publicInputs);
    writeFileSync(join(directory, 'public-proofs', label + '.bin'), bytes);
    writeFileSync(join(directory, 'public-proofs', label + '.inputs.json'), words);
    report.proofs.push({ label, mode, proofBytes: bytes.length, proofSHA256: hash(bytes),
      publicInputsSHA256: hash(words), publicInputCount: sizes[mode] }); persist();
  };
  let runtime, owner, coordinator, pool, funded = false, terminalError;
  const audit = () => {
    if (!runtime) return;
    writeFileSync(join(privateDirectory, 'evm-audit.json'), json({ metadata: runtime.metadata,
      transactions: runtime.transactions, receipts: runtime.receipts }), { mode: 0o600 });
    report.transactions = runtime.receipts.map(entry => ({ label: entry.label,
      hash: entry.receipt.transactionHash, blockHash: entry.receipt.blockHash,
      blockNumber: entry.receipt.blockNumber, status: entry.receipt.status, gasUsed: entry.gasUsed,
      revert: entry.revert ?? null }));
  };
  const inspect = async label => {
    const snapshot = await pool.snapshot(), decoded = inspectGenericSnapshot(snapshot);
    writeFileSync(join(directory, `state-${report.states.length}-${label}.json`), json(snapshot));
    report.states.push({ label, ...decoded.publicState, blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash });
    audit(); persist(); return decoded;
  };
  const send = async (label, data, status = '0x1', reason, value) => {
    const receipt = await runtime.send(label, { to: pool.address, data, ...(value ? { value } : {}) }, status, reason);
    audit(); persist(); return receipt;
  };
  const unchanged = async (before, label) => {
    const after = await inspect(label); assert.deepEqual(after.publicState, before.publicState, 'GENERIC_REJECTED_STATE_CHANGED');
    return after;
  };
  try {
    coordinator = createProofProcess({ purpose: 'coordinator' });
    report.pins = coordinator.pins(); persist();
    stage('compile-exact-verifiers-and-ledger');
    const compilation = await compileGenericPool(genericVerifierSources(report.pins), async event => {
      report.compilationProgress = event; persist();
    });
    writeFileSync(join(directory, 'compilation.json'), json(compilation));
    stage('fresh-local-deployment'); runtime = await createLocalEvm();
    report.runtime = runtime.metadata; persist();
    pool = await deployGenericPool(runtime, { compilation, policy: prefixed(randomHash()), deploymentDomain: prefixed(randomHash()) });
    report.deployment = { address: pool.address, scope: pool.scope, policy: pool.policy, asset: pool.asset,
      assetIdentity: pool.assetIdentity, deploymentDomain: pool.deploymentDomain, deployments: pool.deployments };
    const initial = await inspect('initial');
    assert.equal(initial.publicState.backedAmount, '0');
    assert.equal(initial.publicState.leaves, 0);
    const now = await runtime.time(), settleBefore = (now / 600n + 1n) * 600n + 60n;
    const recipient = runtime.accounts[1], recipientBefore = await runtime.balance(recipient);
    owner = createGenericOwnerProcess();
    stage('owner-prepositions-deposit-and-two-authorization-proofs');
    const prepared = await owner.init({ scope: pool.scope, policy: pool.policy, asset: pool.assetIdentity,
      epoch: String(now / 600n), fundingNotBefore: String(now), fundingValidUntil: String(now + 100n),
      settleBefore: String(settleBefore), recipient });
    assert.equal(prepared.intents.length, 2, 'GENERIC_INTENT_COUNT');
    assert.equal(digestHex(prepared.intents[0].authorization.publicInputs.slice(A0.inputCommitment, A0.inputCommitment + 8)), bare(prepared.fundingCommitment));
    assert.equal(digestHex(prepared.intents[1].authorization.publicInputs.slice(A0.inputCommitment, A0.inputCommitment + 8)), bare(prepared.intents[0].changeCommitment));
    const ownerAuthorizations = prepared.metrics.proofs.filter(proof => proof.mode === 'authorization');
    assert.equal(ownerAuthorizations.length, 2, 'GENERIC_OWNER_PROOF_COUNT');
    assert.equal(ownerAuthorizations[0].keySHA256, ownerAuthorizations[1].keySHA256, 'GENERIC_REUSED_OWNER_KEY');
    assert.equal(ownerAuthorizations[0].vkFieldsSHA256, ownerAuthorizations[1].vkFieldsSHA256, 'GENERIC_REUSED_FULL_OWNER_KEY');
    report.sameKeysAcrossShapes = true;
    report.ownerPreparation = { graphShapes: prepared.intents.map(intent => intent.graphShape),
      ownerKeysTransferred: false, fullGraphWitnessTransferred: false,
      metrics: prepared.metrics,
      authorizationProofHashes: prepared.intents.map(intent => hash(intent.authorization.proof)),
      authorizationStatementHashes: prepared.intents.map(intent => hash(json(intent.authorization.publicInputs))) };
    savePublicProof('deposit', 'deposit_balance', prepared.deposit);
    stage('actual-backed-deposit');
    await send('deposit 200 local fake wei', pool.proofData('deposit_balance', prepared.deposit.proof, prepared.deposit.publicInputs),
      '0x1', undefined, pool.fundingTransactionValue(200n));
    funded = true;
    let current = await inspect('deposited');
    assert.equal(current.publicState.backedAmount, '200');
    assert.deepEqual(current.commitments, [prefixed(prepared.fundingCommitment)]);
    const reserveIndices = [];
    for (let i = 0; i < prepared.intents.length; i++) {
      const intent = prepared.intents[i], index = i === 0 ? 0 : 2;
      stage(`prove-reservation-${i + 1}`);
      const witness = reserveInputs(intent.authorization, { ...publicPath(current.tree.path(index)),
        validFrom: String(now), validUntil: String(now + 100n) });
      const proof = await coordinator.prove('reserve', witness, publicWords('reserve', witness), `funded-reserve-${i + 1}`);
      const projection = reserveProjection(current, prefixed(intent.reserveCommitment), prefixed(intent.changeCommitment));
      const guards = { expectedSequence: projection.expectedSequence, expectedPostRoot: projection.expectedPostRoot };
      savePublicProof(`reserve-${i + 1}`, 'reserve', proof);
      if (i === 0) {
        await send('stale reservation sequence is atomic', pool.guardedReserveData(proof.proof, proof.publicInputs,
          { ...guards, expectedSequence: String(BigInt(guards.expectedSequence) + 1n) }), '0x0', 'RESERVE_SEQUENCE_CHANGED');
        await unchanged(current, 'stale-sequence-rejected');
        await send('wrong projected root rolls back reservation', pool.guardedReserveData(proof.proof, proof.publicInputs,
          { ...guards, expectedPostRoot: prefixed(randomHash()) }), '0x0', 'RESERVE_POST_ROOT_MISMATCH');
        await unchanged(current, 'wrong-projection-rejected');
        const substituted = [...proof.publicInputs]; substituted[40] = String((BigInt(substituted[40]) + 1n) % (1n << 32n));
        // A matching forged projection prevents the transaction guard from
        // masking a permissive verifier. Only the proof must reject this edit.
        const forgedProjection = reserveProjection(current, prefixed(digestHex(substituted.slice(40, 48))), prefixed(intent.changeCommitment));
        await send('altered reservation output fails genuine verifier', pool.guardedReserveData(proof.proof, substituted,
          { expectedSequence: forgedProjection.expectedSequence, expectedPostRoot: forgedProjection.expectedPostRoot }), '0x0');
        await unchanged(current, 'altered-output-rejected');
      }
      await send(`reserve graph ${i + 1}`, pool.guardedReserveData(proof.proof, proof.publicInputs, guards));
      current = await inspect(`reserved-${i + 1}`);
      assert.equal(current.publicState.root, projection.expectedPostRoot);
      assert.equal(current.publicState.liveReservations, i + 1);
      assert.equal(current.publicState.backedAmount, '200');
      reserveIndices.push(projection.reserveIndex);
      if (i === 0) {
        await send('replayed reservation cannot spend again', pool.guardedReserveData(proof.proof, proof.publicInputs, guards), '0x0', 'RESERVE_ROOT_CHANGED');
        await unchanged(current, 'reservation-replay-rejected');
      }
    }
    // Both F proofs use the same accepted root. Issuing the first note does not
    // invalidate the other path, and neither operation asks the owner to sign.
    const ownerCallsBeforeRecovery = owner.report();
    const recoveries = [];
    for (let i = 0; i < prepared.intents.length; i++) {
      stage(`prove-recovery-${i + 1}`);
      const witness = refundInputs(prepared.intents[i].authorization, { ...publicPath(current.tree.path(reserveIndices[i])),
        validFrom: String(settleBefore), validUntil: String(settleBefore + 100n) });
      const proof = await coordinator.prove('refund', witness, publicWords('refund', witness), `funded-refund-${i + 1}`);
      savePublicProof(`refund-${i + 1}`, 'refund', proof); recoveries.push(proof);
    }
    await send('genuine recovery cannot execute before deadline', pool.proofData('recover_generic', recoveries[0].proof, recoveries[0].publicInputs), '0x0', 'OUTSIDE_WINDOW');
    await unchanged(current, 'early-recovery-rejected');
    stage('advance-explicit-synthetic-clock-to-recovery');
    await runtime.advanceTo(settleBefore);
    const recoveryIndices = [];
    for (let i = 0; i < recoveries.length; i++) {
      const proof = recoveries[i]; recoveryIndices.push(current.publicState.leaves);
      await send(`issue exact recovery ${i + 1}`, pool.proofData('recover_generic', proof.proof, proof.publicInputs));
      current = await inspect(`recovered-${i + 1}`);
      assert.equal(current.publicState.liveReservations, 1 - i);
      assert.equal(current.publicState.backedAmount, '200');
      assert.equal(current.commitments[recoveryIndices[i]], prefixed(prepared.intents[i].recoveryCommitment));
      if (i === 0) {
        await send('same reservation cannot recover twice', pool.proofData('recover_generic', proof.proof, proof.publicInputs), '0x0', 'NOTE_ALREADY_SPENT');
        await unchanged(current, 'recovery-replay-rejected');
      }
    }
    const ownerCallsAfterRecovery = owner.report();
    assert.deepEqual(ownerCallsAfterRecovery.requests, ownerCallsBeforeRecovery.requests, 'GENERIC_OWNER_CALLED_DURING_RECOVERY');
    assert.deepEqual(ownerCallsAfterRecovery.requests.map(request => request.operation), ['init'], 'GENERIC_UNEXPECTED_OWNER_REQUEST');
    report.ownerRecovery = { before: ownerCallsBeforeRecovery, after: ownerCallsAfterRecovery,
      signingRequestsDuringSAndF: 0, ownerProcessRemainedAliveForLaterWithdrawal: true };
    stage('owner-authorized-explicit-recovery-exits');
    for (let i = 0; i < recoveryIndices.length; i++) {
      const proof = await owner.withdraw({ recoveryIndex: i, path: current.tree.path(recoveryIndices[i]), epoch: String((await runtime.time()) / 600n) });
      savePublicProof(`withdraw-${i + 1}`, 'withdraw_balance', proof);
      await send(`withdraw recovery ${i + 1} once`, pool.proofData('withdraw_balance', proof.proof, proof.publicInputs));
      current = await inspect(`withdrawn-${i + 1}`);
      assert.equal(current.publicState.backedAmount, i === 0 ? '100' : '0');
      if (i === 0) {
        await send('same recovery cannot withdraw twice', pool.proofData('withdraw_balance', proof.proof, proof.publicInputs), '0x0', 'NOTE_ALREADY_SPENT');
        await unchanged(current, 'withdrawal-replay-rejected');
      }
    }
    assert.equal((await runtime.balance(recipient)) - recipientBefore, 200n, 'GENERIC_RECIPIENT_CONSERVATION');
    assert.equal(current.publicState.actualAssetBalance, '0');
    assert.equal(current.publicState.liveReservations, 0);
    assert.equal(current.publicState.spent, 6);
    assert.equal(current.publicState.outputCapacity, 1, 'GENERIC_SEND_MAX_PADDING_CAPACITY');
    assert.equal(BigInt(await pool.call('canRetire()')), 1n, 'GENERIC_EMPTY_BACKING_RETIRES');
    assert.deepEqual(sourceManifest(), report.source, 'GENERIC_SOURCE_CHANGED_DURING_RUN');
    report.final = { ...current.publicState, recipientReceived: '200', retiredEligibility: true,
      zeroChangePaddingIsNotSpendableValue: true, depositAndRecoveryConservation: true };
    report.classification = 'ACTUAL_GENERIC_FUNDED_GRAPH_TWO_SHAPE_RECOVERY_PASSED';
    stage('completed');
  } catch (error) {
    terminalError = error;
    report.classification = 'GENERIC_FUNDED_GRAPH_LOCAL_ACCEPTANCE_FAILED';
    report.failedStage = report.phase; report.error = boundedError(error); report.phase = 'failed';
    report.fundingDisposition = funded ? 'LOCAL_FAKE_BALANCE_MAY_REMAIN; NOT_CLAIMED_REFUNDED' : 'NO_DEPOSIT_CONFIRMED_BY_HARNESS';
    if (pool && runtime) {
      try { await inspect('failure-diagnostics'); } catch (diagnostic) { report.diagnosticError = boundedError(diagnostic); }
    }
    try { audit(); persist(); } catch { /* Keep original failure; report cleanup below. */ }
  } finally {
    report.cleanup = {};
    for (const [name, capability] of [['owner', owner], ['prover', coordinator], ['runtime', runtime]]) {
      if (!capability) continue;
      try { report.cleanup[name] = await capability.close(); }
      catch (error) { report.cleanup[name] = { error: boundedError(error) }; terminalError ??= error; }
    }
    report.completedAt = new Date().toISOString();
    if (terminalError && report.phase === 'completed') { report.phase = 'failed-cleanup'; report.classification = 'GENERIC_FUNDED_GRAPH_CLEANUP_FAILED'; }
    persist();
  }
  console.log(json({ phase: report.phase, classification: report.classification, runId, evidence: relative(project, directory), error: report.error }).trim());
  if (terminalError) throw Object.assign(new Error(report.error?.code ?? 'GENERIC_ACCEPTANCE_FAILED'), { cause: terminalError });
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGenericFundedGraph().catch(error => { console.error(boundedError(error).code); process.exitCode = 1; });
}
