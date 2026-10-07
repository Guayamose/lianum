/** Bounded M6 regression only: no proof, network, runtime or service execution.
 * Replays the pinned, locally committed M5 source in memory for matched traces.
 * Historical M5 scripts/evidence are read-only and are never regenerated here.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaimAvailabilityModel } from '../src/claim-availability-model.mjs';

const BASELINE_COMMIT = 'a7071affd5e26f653500203ed783dc7e23151921';
const BASELINE_SOURCE_SHA256 = '0fc4be4433bc23931b6bb729396339075d16573f882f0e4b58b5faef415d6136';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const attempt = fn => { try { return { accepted: true, value: fn() }; } catch (error) { return { accepted: false, error: error.code ?? error.message }; } };
const setup = (Model, id, timing = {}) => { const model = new Model({ id, timing }); model.activate(1); model.deliverAll(2); model.ownerOffline(3); return model; };
const observeSOL = (model, expiresAt = 145) => {
  model.registerManifest('SOL', 'branch-0', { txRef: 'model-S-reference' }, 10); model.dispatch('SOL', 11);
  model.observeEffect('SOL', { txRef: 'model-S-reference', amount: '3000000', recipient: 'private-sol-recipient', executedAt: 12, finalAt: 15, expiresAt }, 20);
  return model.produceProof('P_S', 'branch-0', 20);
};
const capture = model => {
  const snapshot = model.snapshot();
  return { classification: snapshot.classification, authority: snapshot.authority, exposures: snapshot.potentialNativeExposure, retainedNativeEffects: snapshot.simulatedExternalEffects, observableChecks: snapshot.events.filter(event => event.type === 'remaining-workflow-readiness-checked') };
};

function replay(Model, label) {
  const traces = {};
  {
    const model = setup(Model, `${label}-intermediate`, { finalitySOL: 60 });
    const readiness = model.readiness(70);
    const handoff = attempt(() => model.registerManifest('SOL', 'branch-0', { txRef: 'impossible-budget' }, 70));
    traces.intermediateCutoffs = { readiness, handoff, ...capture(model) };
  }
  {
    const model = setup(Model, `${label}-issuer-outage`), parent = observeSOL(model);
    model.setAvailability({ I_B: false }, 23);
    const handoff = attempt(() => model.registerManifest('BTC', 'branch-0', { txRef: 'issuer-unavailable', parentProof: parent }, 25));
    traces.knownIssuerOutage = { handoff, ...capture(model) };
  }
  {
    const model = setup(Model, `${label}-parent-expiry`), parent = observeSOL(model, 30);
    const handoff = attempt(() => model.registerManifest('BTC', 'branch-0', { txRef: 'insufficient-parent-life', parentProof: parent }, 25));
    traces.insufficientParentExpiry = { parentExpiresAt: 30, handoff, ...capture(model) };
  }
  {
    const model = setup(Model, `${label}-dispatch-outage`), parent = observeSOL(model);
    model.registerManifest('BTC', 'branch-0', { txRef: 'already-exposed-B', parentProof: parent }, 25);
    model.setAvailability({ I_B: false }, 26);
    const dispatch = attempt(() => model.dispatch('BTC', 26));
    traces.outageAfterHandoff = { dispatch, ...capture(model) };
  }
  {
    const model = setup(Model, `${label}-hidden-intent`);
    for (const actor of ['E_S', 'P_S']) model.withholdProof(actor, true, 4);
    const readiness = model.readiness(5);
    const proof = attempt(() => observeSOL(model));
    const executorProof = attempt(() => model.produceProof('E_S', 'branch-0', 20));
    model.refund(150);
    traces.hiddenWithholding = { readiness, proof, executorProof, ...capture(model) };
  }
  {
    const model = setup(Model, `${label}-known-refusal`);
    const observableRefusalAPIExists = typeof model.declareProofRefusal === 'function';
    if (observableRefusalAPIExists) {
      for (const actor of ['E_S', 'P_S']) model.declareProofRefusal(actor, true, 4);
      const readiness = model.readiness(5);
      const handoff = attempt(() => model.registerManifest('SOL', 'branch-0', { txRef: 'declared-no-path' }, 10));
      traces.knownRefusal = { observableRefusalAPIExists, readiness, handoff, ...capture(model) };
    } else traces.knownRefusal = { observableRefusalAPIExists, limitation: 'Historical API had only simulator withholding intent; it could not express an observable refusal separately.' };
  }
  return traces;
}

export async function runReadinessRegression() {
  // Executes only our own known, hash-pinned historical model source. This is
  // a local git read and in-memory JS import, never checkout or file rewriting.
  const historical = execFileSync('git', ['show', `${BASELINE_COMMIT}:src/claim-availability-model.mjs`], { cwd: root, windowsHide: true });
  assert.equal(hash(historical), BASELINE_SOURCE_SHA256);
  const { ClaimAvailabilityModel: HistoricalModel } = await import(`data:text/javascript;base64,${historical.toString('base64')}`);
  const before = replay(HistoricalModel, 'baseline'), after = replay(ClaimAvailabilityModel, 'fixed');
  assert.equal(before.intermediateCutoffs.readiness.ready, true); assert.equal(before.intermediateCutoffs.handoff.accepted, true);
  assert.equal(after.intermediateCutoffs.readiness.ready, false); assert.equal(after.intermediateCutoffs.handoff.accepted, false); assert.equal(after.intermediateCutoffs.exposures.length, 0);
  for (const key of ['knownIssuerOutage', 'insufficientParentExpiry']) {
    assert.equal(before[key].handoff.accepted, true); assert.equal(before[key].exposures.length, 2);
    assert.equal(after[key].handoff.accepted, false); assert.equal(after[key].exposures.length, 1); assert.equal(after[key].retainedNativeEffects.length, 1);
  }
  assert.equal(before.outageAfterHandoff.dispatch.accepted, true); assert.equal(after.outageAfterHandoff.dispatch.accepted, false); assert.equal(after.outageAfterHandoff.exposures.length, 2);
  assert.equal(after.knownRefusal.readiness.ready, false); assert.equal(after.knownRefusal.handoff.accepted, false); assert.equal(after.knownRefusal.exposures.length, 0);
  for (const side of [before, after]) {
    assert.equal(side.hiddenWithholding.readiness.ready, true); assert.equal(side.hiddenWithholding.proof.accepted, false); assert.equal(side.hiddenWithholding.executorProof.accepted, false);
    assert.equal(side.hiddenWithholding.authority.ownerRefund, '1000000'); assert.equal(side.hiddenWithholding.retainedNativeEffects.length, 1);
  }
  return {
    schemaVersion: 6,
    classification: 'MODEL_ONLY_READINESS_REGRESSION_NO_NATIVE_NO_ZK_NO_SERVICE',
    baseline: { commit: BASELINE_COMMIT, sourceSHA256: BASELINE_SOURCE_SHA256, replay: 'Hash-pinned local historical source imported in memory; historical files untouched.' },
    before, after,
    interpretation: [
      'Declared/observed refusal and known issuer outage are checked; hidden actor intention is not available to readiness.',
      'Every remaining stage must fit its declared budget and hard cutoff; retained parent certificate must cover final inclusion with no assumed refresh.',
      'Planning durations and live paths are explicit model assumptions, not forecasts or guaranteed upper bounds on real networks.',
      'A known failure after handoff blocks sender dispatch but never clears prior exposure or undoes any native output.',
      'Future native truth, certificate issuance, delays, withholding and revocation remain failure modes after an accepted snapshot.'
    ]
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidence = await runReadinessRegression();
  evidence.recordedAt = new Date().toISOString();
  evidence.sourceSHA256 = Object.fromEntries(await Promise.all(['src/claim-availability-model.mjs', 'test/claim-availability-model.test.mjs', 'scripts/readiness-regression.mjs'].map(async path => [path, hash(await readFile(join(root, path)))])));
  evidence.historicalArtifactsSHA256 = Object.fromEntries(await Promise.all(['scripts/claim-availability-demo.mjs', 'evidence/m5-claim-availability.json'].map(async path => [path, hash(await readFile(join(root, path)))])));
  await writeFile(join(root, 'evidence/m6-readiness-regression.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ classification: evidence.classification, pairedTraces: Object.keys(evidence.after).length, evidence: 'evidence/m6-readiness-regression.json', m5EvidenceUntouched: true }));
}
