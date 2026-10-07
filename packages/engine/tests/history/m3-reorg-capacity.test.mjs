import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { newIdentity, sign, decryptJson, digest } from '../../src/crypto/privacy.mjs';
import { createState, transition, makeGraph, graphHash, PAYMENT } from '../../src/core/core.mjs';
import { simulationReceipt } from '../../src/core/simulation.mjs';
import { simulationInvalidation, invalidationDigest } from '../../src/core/invalidation.mjs';
import { assertCapacity, capacityReport } from '../../src/core/capacity.mjs';
import { incidentSummary, freezeForIncident } from '../../src/core/incidents.mjs';
import { Vault } from '../../src/crypto/vault.mjs';
import { WalletSDK } from '../../src/api/sdk.mjs';

const PASSWORD = 'synthetic-m3-invalidation-test-only';
const START = 1_790_900_000_000;
const cached = new Map();

function saturatedFixture(terminal = false) {
  if (cached.has(terminal)) return structuredClone(cached.get(terminal));
  let fallback;
  // Optional local metadata changes the exact node/byte residue. Every retained
  // candidate below passes the current reducer and capacity policy. No arbitrary
  // padding or invented ledger entries are inserted to fabricate saturation.
  for (let repeats = 0; repeats < 31; repeats++) {
    const data = { state: createState(START), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
    const trust = { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey };
    const apply = (command) => { data.state = transition(data.state, command, trust); };
    const graph = makeGraph(START, { order: ['ethereum'] }), hash = graphHash(graph), legId = graph.legs[0].id;
    apply({ type: 'open', graph, signature: sign(graph, data.user.privateKey), permission: 'demo-payment' });
    const txRef = randomBytes(32).toString('hex');
    apply({ type: 'prepareDispatch', hash, legId, txRef, effectIndex: 0 });
    apply({ type: 'markSubmitted', hash, legId, txRef });
    let valid = true;
    for (let i = 0; i < repeats; i++) {
      const current = data.state.operations[0].legs[0].dispatch.state;
      apply(current === 'SUBMITTED' ? { type: 'markAmbiguous', hash, legId, reason: 'SYNTHETIC_SATURATION' } : { type: 'markSubmitted', hash, legId, txRef });
      try { assertCapacity(data); } catch { valid = false; break; }
    }
    if (!valid) continue;
    apply({ type: 'receipt', hash, receipt: simulationReceipt(graph, legId, data.observer.privateKey, START, { txRef }) });
    const other = makeGraph(START, { order: ['solana'] }), otherHash = graphHash(other);
    apply({ type: 'open', graph: other, signature: sign(other, data.user.privateKey), permission: 'demo-payment' });
    apply({ type: 'receipt', hash: otherHash, receipt: simulationReceipt(other, other.legs[0].id, data.observer.privateKey, START) });
    const pending = makeGraph(START, { order: ['bitcoin'] }), pendingHash = graphHash(pending);
    apply({ type: 'open', graph: pending, signature: sign(pending, data.user.privateKey), permission: 'demo-payment' });
    if (terminal) apply({ type: 'settle', hash });
    assertCapacity(data);
    for (let i = 0; i < 50; i++) {
      const candidate = { ...data, state: transition(data.state, { type: 'receipt', hash,
        receipt: simulationReceipt(graph, legId, data.observer.privateKey, START) }, trust) };
      try { assertCapacity(candidate); } catch { break; }
      data.state = candidate.state;
    }
    const observation = data.state.operations[0].legs[0].observations[0];
    const evidence = simulationInvalidation(data.state, hash, legId, observation.resource, data.observer.privateKey, START);
    const unsigned = { ...data, state: transition(data.state, { type: 'reorg', hash, legId, resource: observation.resource }, trust) };
    let unsignedRejected = false;
    try { assertCapacity(unsigned); } catch { unsignedRejected = true; }
    const signed = structuredClone(unsigned);
    signed.state.operations[0].legs[0].observations[0].invalidation = evidence;
    signed.state.operations[0].legs[0].observations[0].invalidationDigest = invalidationDigest(evidence);
    let signedRejected = false;
    try { assertCapacity(signed); } catch { signedRejected = true; }
    if (!signedRejected) continue;
    if (!terminal) assertCapacity({ ...data, state: transition(data.state, { type: 'settle', hash }, trust) });
    const fixture = { data, graph, hash, legId, otherHash, pendingHash, pendingLeg: pending.legs[0].id,
      evidence, unsignedRejected, repeats, report: capacityReport(data), observations: data.state.operations[0].legs[0].observations.length };
    fallback ??= fixture;
    if (unsignedRejected) { cached.set(terminal, fixture); return structuredClone(fixture); }
  }
  assert.ok(fallback, 'A bounded terminal/nonterminal record must reach signed-invalidation pressure');
  cached.set(terminal, fallback);
  return structuredClone(fallback);
}

async function setup(t, fixture, suffix = '') {
  const directory = await mkdtemp(join(tmpdir(), `paeg-m3-reorg-${suffix}`));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  const vault = new Vault(path);
  await vault.create(fixture.data, PASSWORD);
  let now = START;
  const sdk = new WalletSDK(path, PASSWORD, { clock: () => now });
  return { directory, path, vault, sdk, advance: (value) => { now = value; }, restart: () => new WalletSDK(path, PASSWORD, { clock: () => now }) };
}

async function readIncident(path) {
  const files = (await readdir(`${path}.incidents`)).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 1);
  const file = join(`${path}.incidents`, files[0]);
  const encrypted = await readFile(file, 'utf8');
  return { file, encrypted, record: decryptJson(JSON.parse(encrypted), PASSWORD) };
}

test('pre-payout saturated FULFILLED state: signed overflow freezes settlement across restart', async (t) => {
  const fixture = saturatedFixture(false);
  assert.equal(fixture.data.state.operations[0].status, 'FULFILLED');
  assert.equal(fixture.unsignedRejected, true, 'Reproduce the original unsigned-reorg capacity gap too');
  // Reference reproduction of M2 transaction semantics: this deliberately uses
  // the old unsigned reducer+capacity path, not the corrected SDK evidence API.
  const reference = await setup(t, fixture, 'reference-');
  await assert.rejects(reference.vault.update(PASSWORD, 0, (data) => {
    data.state = transition(data.state, { type: 'reorg', hash: fixture.hash, legId: fixture.legId, resource: fixture.evidence.payload.resource },
      { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey });
    assertCapacity(data, 1); return data;
  }), (error) => error.code?.startsWith('STORAGE_'));
  const priorModelPaid = await reference.sdk.settle(fixture.hash);
  assert.equal(priorModelPaid.state.operations[0].paymentState, 'spent');

  const local = await setup(t, fixture, 'corrected-');
  const before = await readFile(local.path);
  const result = await local.sdk.recordInvalidation(fixture.hash, fixture.evidence);
  assert.equal(result.integrated, false); assert.equal(result.quarantined, true);
  assert.deepEqual(await readFile(local.path), before);
  const incident = await readIncident(local.path);
  assert.deepEqual(incident.record.incident.evidence, fixture.evidence);
  assert.equal(incident.encrypted.includes(fixture.evidence.payload.resource), false);
  const restarted = local.restart();
  await assert.rejects(restarted.settle(fixture.hash), { code: 'STORAGE_FROZEN' });
  await assert.rejects(restarted.settle(fixture.otherHash), { code: 'STORAGE_FROZEN' });
  await assert.rejects(restarted.prepareDispatch(fixture.pendingHash, fixture.pendingLeg), { code: 'STORAGE_FROZEN' });
  await assert.rejects(restarted.open(makeGraph(START)), { code: 'STORAGE_FROZEN' });
  const duplicate = await restarted.recordInvalidation(fixture.hash, fixture.evidence);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.incidentId, result.incidentId);
  assert.equal((await incidentSummary(local.path)).count, 1);
  assert.deepEqual(await readFile(local.path), before);
  local.advance(fixture.graph.expiresAt + 1);
  await restarted.recover(fixture.hash);
  assert.equal((await restarted.snapshot()).state.operations[0].paymentState, 'refunded');
  assert.equal((await incidentSummary(local.path)).frozen, true);
  t.diagnostic(JSON.stringify({ prePayout: true, unsignedCapacityFailureReproduced: true, optionalTransitions: fixture.repeats,
    retainedObservations: fixture.observations, beforeBytes: fixture.report.actualBytes, correctedOutcome: 'SIGNED_INCIDENT_AND_SETTLEMENT_FREEZE' }));
});

test('terminal saturated state preserves spent payment and retains signed invalidation', async (t) => {
  const fixture = saturatedFixture(true);
  const local = await setup(t, fixture, 'terminal-');
  const before = await readFile(local.path);
  const result = await local.sdk.recordInvalidation(fixture.hash, fixture.evidence);
  assert.equal(result.integrated, false);
  assert.deepEqual(await readFile(local.path), before);
  const state = (await local.restart().snapshot()).state;
  assert.equal(state.operations[0].paymentState, 'spent');
  assert.equal(state.assets.find((asset) => asset.asset === PAYMENT).spent, '1000');
  assert.deepEqual((await readIncident(local.path)).record.incident.evidence, fixture.evidence);
  await assert.rejects(local.restart().settle(fixture.otherHash), { code: 'STORAGE_FROZEN' });
  await assert.rejects(local.sdk.recover(fixture.hash), /TERMINAL_OPERATION/);
  t.diagnostic(JSON.stringify({ terminal: true, observations: fixture.observations, actualBytes: fixture.report.actualBytes, spentInput: '1000', integrated: false }));
});

test('invalid signatures and every binding are rejected before any incident or freeze', async (t) => {
  const fixture = saturatedFixture(false);
  const local = await setup(t, fixture, 'invalid-');
  const before = await readFile(local.path);
  const changes = [
    (e) => { e.signature = '00'.repeat(64); },
    (e) => { e.payload.domain = 'paeg:other:v1'; e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.graphHash = '01'.repeat(32); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.resource = '02'.repeat(32); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.policyDigest = '03'.repeat(32); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.authorizationDigest = '04'.repeat(32); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.verifierFingerprint = '05'.repeat(32); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.predecessor.payload.amount = '201'; e.predecessor.signature = sign(e.predecessor.payload, fixture.data.observer.privateKey); e.payload.predecessorDigest = digest('PAEG/signed-receipt/1', e.predecessor); e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.payload.observedAt = START + 1; e.signature = sign(e.payload, fixture.data.observer.privateKey); },
    (e) => { e.signature = sign(e.payload, newIdentity().privateKey); },
  ];
  for (const change of changes) {
    const evidence = structuredClone(fixture.evidence); change(evidence);
    await assert.rejects(local.sdk.recordInvalidation(fixture.hash, evidence), /INVALIDATION/);
    assert.deepEqual(await incidentSummary(local.path), { frozen: false, count: 0, pendingCount: 0 });
  }
  assert.deepEqual(await readFile(local.path), before);
});

test('full incident sink rejects capture explicitly while keeping primary state and settlement frozen', async (t) => {
  const fixture = saturatedFixture(false);
  const local = await setup(t, fixture, 'full-');
  const directory = freezeForIncident(local.path);
  // Deliberately occupied filenames are a storage-pressure fixture, not 128
  // authenticated effects or acknowledged invalidations.
  await Promise.all(Array.from({ length: 128 }, (_, i) => writeFile(join(directory, `${i.toString(16).padStart(64, '0')}.json`), '{}')));
  const before = await readFile(local.path);
  await assert.rejects(local.sdk.recordInvalidation(fixture.hash, fixture.evidence), { code: 'OBSERVATION_NOT_PERSISTED' });
  assert.deepEqual(await readFile(local.path), before);
  assert.equal((await incidentSummary(local.path)).count, 128);
  await assert.rejects(local.restart().settle(fixture.hash), { code: 'STORAGE_FROZEN' });
});

test('normal invalidation integrates complete signed evidence and repeated delivery is idempotent', async (t) => {
  const data = { state: createState(START), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
  const graph = makeGraph(START, { order: ['ethereum'] }), hash = graphHash(graph), legId = graph.legs[0].id;
  const trust = { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey };
  data.state = transition(data.state, { type: 'open', graph, signature: sign(graph, data.user.privateKey), permission: 'demo-payment' }, trust);
  data.state = transition(data.state, { type: 'receipt', hash, receipt: simulationReceipt(graph, legId, data.observer.privateKey, START) }, trust);
  data.state = transition(data.state, { type: 'settle', hash }, trust);
  const local = await setup(t, { data }, 'ordinary-');
  const integrated = await local.sdk.reorg(hash, legId);
  assert.equal(integrated.integrated, true);
  const observation = integrated.state.operations[0].legs[0].observations[0];
  assert.ok(observation.invalidation.signature);
  assert.equal(observation.invalidationDigest, invalidationDigest(observation.invalidation));
  assert.equal(integrated.state.operations[0].status, 'DISPUTED');
  assert.equal(integrated.state.operations[0].paymentState, 'spent');
  const before = await readFile(local.path);
  const duplicate = await local.sdk.recordInvalidation(hash, observation.invalidation);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.integrated, true);
  assert.deepEqual(await readFile(local.path), before);
  assert.deepEqual(await incidentSummary(local.path), { frozen: false, count: 0, pendingCount: 0 });
});

test('repeated overflow receipts deduplicate but distinct authenticated payloads are retained', async (t) => {
  const fixture = saturatedFixture(false);
  const local = await setup(t, fixture, 'receipt-repeat-');
  const receipt = simulationReceipt(fixture.graph, fixture.legId, fixture.data.observer.privateKey, START);
  const first = await local.sdk.recordReceipt(fixture.hash, receipt);
  assert.equal(first.integrated, false);
  const again = await local.sdk.recordReceipt(fixture.hash, receipt);
  assert.equal(again.duplicate, true); assert.equal(again.incidentId, first.incidentId);
  assert.equal((await incidentSummary(local.path)).count, 1);
  const distinct = simulationReceipt(fixture.graph, fixture.legId, fixture.data.observer.privateKey, START);
  const second = await local.sdk.recordReceipt(fixture.hash, distinct);
  assert.equal(second.integrated, false); assert.notEqual(second.incidentId, first.incidentId);
  assert.equal((await incidentSummary(local.path)).count, 2);
});

test('distinct signed invalidation after integration is retained without a second economic debit', async (t) => {
  const data = { state: createState(START), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
  const graph = makeGraph(START, { order: ['ethereum'] }), hash = graphHash(graph), legId = graph.legs[0].id;
  const trust = { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey };
  data.state = transition(data.state, { type: 'open', graph, signature: sign(graph, data.user.privateKey), permission: 'demo-payment' }, trust);
  data.state = transition(data.state, { type: 'receipt', hash, receipt: simulationReceipt(graph, legId, data.observer.privateKey, START) }, trust);
  const local = await setup(t, { data }, 'distinct-invalidation-');
  const first = await local.sdk.reorg(hash, legId);
  const retained = first.state.operations[0].legs[0].observations[0].invalidation;
  const distinct = structuredClone(retained);
  distinct.payload.observedAt = START + 1;
  distinct.signature = sign(distinct.payload, data.observer.privateKey);
  local.advance(START + 1);
  const priorBytes = await readFile(local.path);
  const next = await local.sdk.recordInvalidation(hash, distinct);
  assert.equal(next.integrated, false); assert.equal(next.reason, 'STORAGE_DISTINCT_INVALIDATION_AUDIT');
  assert.deepEqual(await readFile(local.path), priorBytes);
  assert.deepEqual((await readIncident(local.path)).record.incident.evidence, distinct);
  const repeated = await local.sdk.recordInvalidation(hash, distinct);
  assert.equal(repeated.duplicate, true);
  assert.equal((await incidentSummary(local.path)).count, 1);
  assert.equal((await local.sdk.snapshot()).state.assets.find((asset) => asset.asset === 'ethereum:local:wei').received, '0');
});

test('a corrupted duplicate incident is never treated as authenticated capture', async (t) => {
  const fixture = saturatedFixture(false);
  const local = await setup(t, fixture, 'corrupt-');
  await local.sdk.recordInvalidation(fixture.hash, fixture.evidence);
  const incident = await readIncident(local.path);
  const corrupted = JSON.parse(incident.encrypted); corrupted.cipher.tag = '00'.repeat(16);
  await writeFile(incident.file, JSON.stringify(corrupted));
  await assert.rejects(local.sdk.recordInvalidation(fixture.hash, fixture.evidence), { code: 'OBSERVATION_NOT_PERSISTED' });
  assert.equal((await incidentSummary(local.path)).count, 1);
  await assert.rejects(local.sdk.settle(fixture.hash), { code: 'STORAGE_FROZEN' });
});
