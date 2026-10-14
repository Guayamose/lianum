import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { canonical, newIdentity, sign, decryptJson } from '../../src/crypto/privacy.mjs';
import { Vault } from '../../src/crypto/vault.mjs';
import { WalletSDK } from '../../src/api/sdk.mjs';
import { createState, transition, makeGraph, graphHash, PAYMENT } from '../../src/core/core.mjs';
import { assertCapacity, capacityReport } from '../../src/core/capacity.mjs';
import { persistIncident, incidentSummary, assertNoIncidents, freezeForIncident } from '../../src/core/incidents.mjs';
import { simulationReceipt } from '../../src/core/simulation.mjs';

const PLAINTEXT_LIMIT = 1024 * 1024;
const PASSWORD = 'synthetic-capacity-reproduction-only';
const START = 1_790_900_000_000;
const productionCore = { createState, transition, makeGraph, graphHash };
// Retained source bytes are authenticated below; the old Git object/manifest
// is unavailable. This reproduction attests bytes and behaviour, not a commit.
const BASELINE_CLASSIFICATION = 'RETAINED_BASELINE_SOURCE_BYTES_NO_GIT_COMMIT_ATTESTATION';
const BASELINE_FILES = [
  {
    "name": "core.mjs",
    "bytes": 17861,
    "sha256": "cc2a44c491f0942cdee30bdfefbb899de5115d8788413acbc2064cb9633179ce"
  },
  {
    "name": "privacy.mjs",
    "bytes": 10256,
    "sha256": "9c971fbd40b69b4e6a56ec56c309c57b4d9ef4117fc22a8b25696befab1b8edd"
  },
  {
    "name": "sdk.mjs",
    "bytes": 3171,
    "sha256": "bba54b9b550376ee8d8038d03603f1358f6e389ccdcba33e98f8e52211a1a519"
  },
  {
    "name": "simulation.mjs",
    "bytes": 872,
    "sha256": "dec2df1d0066cd6d97050e22bca35843712be4c7c8cdd83e4dae099c66580e7f"
  },
  {
    "name": "vault.mjs",
    "bytes": 7006,
    "sha256": "d288d08ec58ade40aa352bd4579df1a6d3c2ac6395c29d08c0b46b5d6db5da8e"
  }
];
// Ordering object keys changes no byte count for these restricted ASCII JSON
// fixtures. JSON.stringify is used to measure oversize candidates without lifting
// canonical()'s independent hard limit or editing production code.
const bytes = (data, revision = 0) => Buffer.byteLength(JSON.stringify({ revision, data }));

/**
 * Fault/pressure fixture, not a claim that thousands of durable SDK writes ran.
 * Its history is the exact shape produced by repeated accepted fail transitions
 * on a RECOVERY_PENDING operation. The baseline reducer accepted those repeats;
 * duplicate fail entries are constructed in memory to avoid thousands of scrypt
 * operations. Actual persistence, subsequent admission and attempted completion
 * below run through the real Vault and WalletSDK.
 */
function nearCapacityFixture({ createState, transition, makeGraph, graphHash } = productionCore) {
  const data = { state: createState(START), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
  const trust = { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey };
  const oldGraph = makeGraph(START);
  data.state = transition(data.state, { type: 'open', graph: oldGraph, signature: sign(oldGraph, data.user.privateKey), permission: 'demo-payment' }, trust);
  data.state = transition(data.state, { type: 'fail', hash: graphHash(oldGraph), reason: 'SYNTHETIC_HISTORY_PRESSURE' }, trust);
  const event = data.state.events.at(-1);
  const target = makeGraph(START);
  const preview = () => ({ ...data, state: transition(data.state, { type: 'open', graph: target, signature: sign(target, data.user.privateKey), permission: 'demo-payment' }, trust) });
  const initialSize = bytes(preview(), 1);
  let estimated = initialSize;
  let previousDigits = String(data.state.events.length + 1).length;
  while (true) {
    const repeated = { ...event, sequence: data.state.events.length + 1 };
    const nextDigits = String(repeated.sequence + 1).length;
    const growth = Buffer.byteLength(JSON.stringify(repeated)) + 1 + nextDigits - previousDigits;
    if (estimated + growth > PLAINTEXT_LIMIT - 16) break;
    data.state.events.push(repeated);
    estimated += growth;
    previousDigits = nextDigits;
  }
  // Tune bounded, valid recipient identifiers rather than injecting arbitrary
  // padding fields into the state. This makes insufficient closure headroom exact.
  for (const leg of target.legs) {
    const current = bytes(preview(), 1);
    if (current >= PLAINTEXT_LIMIT - 17) break;
    const old = leg.recipient;
    leg.recipient += 'x';
    const perCharacter = bytes(preview(), 1) - current;
    leg.recipient = old;
    const count = Math.min(128 - old.length, Math.floor((PLAINTEXT_LIMIT - 16 - current) / perCharacter));
    leg.recipient += 'x'.repeat(Math.max(0, count));
  }
  const after = preview();
  assert.ok(bytes(after, 1) <= PLAINTEXT_LIMIT);
  assert.ok(PLAINTEXT_LIMIT - bytes(after, 1) < 32);
  assert.equal(Buffer.byteLength(canonical({ revision: 1, data: after })), bytes(after, 1));
  return { data, target, after, historyCount: data.state.events.length };
}

test('retained baseline bytes reproduce exhausted receipt AND recovery capacity without Git commit attestation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-capacity-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic-capacity.vault.json');
  const baseline = join(directory, 'historical-source');
  await mkdir(baseline);
  const fixtureDirectory = fileURLToPath(new URL('../fixtures/m1-capacity-baseline/', import.meta.url));
  const manifest = {classification:BASELINE_CLASSIFICATION,files:BASELINE_FILES};
  assert.equal(manifest.classification, 'RETAINED_BASELINE_SOURCE_BYTES_NO_GIT_COMMIT_ATTESTATION');
  assert.deepEqual(manifest.files.map((file) => file.name).sort(), ['core.mjs', 'privacy.mjs', 'sdk.mjs', 'simulation.mjs', 'vault.mjs']);
  for (const file of manifest.files) {
    const source = await readFile(join(fixtureDirectory, file.name));
    assert.equal(source.length, file.bytes);
    assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256);
    await writeFile(join(baseline, file.name), source);
  }
  const historicalCore = await import(pathToFileURL(join(baseline, 'core.mjs')).href);
  const { WalletSDK: HistoricalSDK } = await import(pathToFileURL(join(baseline, 'sdk.mjs')).href);
  const { data, target, after, historyCount } = nearCapacityFixture(historicalCore);
  const vault = new Vault(path);
  await vault.create(data, PASSWORD);
  let now = START;
  const sdk = new HistoricalSDK(path, PASSWORD, { clock: () => now });
  const opened = await sdk.open(target);
  const hash = graphHash(target);
  assert.equal(opened.state.operations.find((operation) => operation.hash === hash).status, 'RESERVED');
  assert.equal(opened.state.assets.find((asset) => asset.asset === PAYMENT).reserved, '2000');
  const committedBytes = await readFile(path);
  await assert.rejects(sdk.executeSimulationLeg(hash, target.legs[0].id), /Canonical JSON exceeds byte limit/);
  now = target.expiresAt + 1;
  await assert.rejects(sdk.recover(hash), /Canonical JSON exceeds byte limit/);
  assert.deepEqual(await readFile(path), committedBytes, 'Failed closure must not corrupt the prior encrypted snapshot');
  const retained = await vault.read(PASSWORD);
  assert.equal(retained.revision, 1);
  assert.equal(retained.data.state.operations.find((operation) => operation.hash === hash).status, 'RESERVED');
  assert.equal(retained.data.state.assets.find((asset) => asset.asset === PAYMENT).reserved, '2000');
  t.diagnostic(JSON.stringify({ fixtureKind: 'constructed-reachable-shape-history', sourceClassification:BASELINE_CLASSIFICATION, historyCount, beforeAdmissionPlaintextBytes: bytes(data), acceptedPlaintextBytes: bytes(after, 1), remainingBytes: PLAINTEXT_LIMIT - bytes(after, 1), receipt: 'REJECTED_SIZE', timeoutRecovery: 'REJECTED_SIZE', retainedRevision: retained.revision }));
});

test('M2 redundant failure is idempotent and cannot grow history', () => {
  const identity = newIdentity();
  const trust = { now: START, userPublicKey: identity.publicKey, verifierPublicKey: newIdentity().publicKey };
  const graph = makeGraph(START);
  let state = transition(createState(START), { type: 'open', graph, signature: sign(graph, identity.privateKey), permission: 'demo-payment' }, trust);
  const fail = { type: 'fail', hash: graphHash(graph), reason: 'SYNTHETIC_REPEAT' };
  state = transition(state, fail, trust);
  const priorEvents = state.events.length;
  const priorReserved = state.assets.find((asset) => asset.asset === PAYMENT).reserved;
  state = transition(state, fail, trust);
  assert.equal(state.events.length, priorEvents);
  assert.equal(state.assets.find((asset) => asset.asset === PAYMENT).reserved, priorReserved);
  assert.equal(state.operations[0].status, 'RECOVERY_PENDING');
});

test('M2 storage admission rejects the near-limit fixture before creating another obligation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-admission-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  const { data, target } = nearCapacityFixture();
  assert.throws(() => assertCapacity(data), (error) => error.code?.startsWith('STORAGE_'));
  const vault = new Vault(path);
  await vault.create(data, PASSWORD);
  const before = await readFile(path);
  const sdk = new WalletSDK(path, PASSWORD, { clock: () => START });
  await assert.rejects(sdk.open(target), (error) => error.code?.startsWith('STORAGE_'));
  assert.deepEqual(await readFile(path), before);
  const current = await vault.read(PASSWORD);
  assert.equal(current.revision, 0);
  assert.equal(current.data.state.operations.length, 1);
  assert.equal(current.data.state.assets.find((asset) => asset.asset === PAYMENT).reserved, '1000');
});

test('M2 admission pressure preserves completion capacity for every admitted operation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-headroom-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  let now = START;
  const sdk = new WalletSDK(path, PASSWORD, { clock: () => now });
  await sdk.create();
  const admitted = [];
  let capacityRejected = false;
  for (let i = 0; i < 50; i++) {
    const graph = makeGraph(now);
    graph.payment.amount = '1'; graph.payment.fee = '0';
    try { await sdk.open(graph); admitted.push(graph); }
    catch (error) {
      assert.match(error.code ?? '', /^STORAGE_/);
      capacityRejected = true; break;
    }
  }
  assert.equal(capacityRejected, true, 'The bounded store must eventually deny new admissions');
  assert.ok(admitted.length > 1);
  const selected = admitted.at(-1), selectedHash = graphHash(selected);
  for (const leg of selected.legs) await sdk.executeSimulationLeg(selectedHash, leg.id);
  await sdk.settle(selectedHash);
  now = selected.expiresAt + 1;
  for (const graph of admitted.slice(0, -1)) await sdk.recover(graphHash(graph));
  const { revision, data } = await new Vault(path).read(PASSWORD);
  const credits = data.state.assets.find((asset) => asset.asset === PAYMENT);
  assert.equal(credits.reserved, '0'); assert.equal(credits.committed, '0');
  assert.equal(credits.spent, '1'); assert.equal(credits.available, '9999');
  const report = capacityReport(data, revision);
  assert.equal(report.admissible, true);
  assert.ok(report.projectedBytes <= PLAINTEXT_LIMIT);
  t.diagnostic(JSON.stringify({ admittedOperations: admitted.length, completed: 1, recovered: admitted.length - 1, actualBytes: report.actualBytes, projectedWithLifetimeReserves: report.projectedBytes }));
});

test('M2 repeated authenticated external effects spill durably and freeze admission across restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-effects-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  let now = START;
  const sdk = new WalletSDK(path, PASSWORD, { clock: () => now });
  await sdk.create();
  const graph = makeGraph(START);
  await sdk.open(graph);
  const hash = graphHash(graph), first = graph.legs[0];
  await sdk.executeSimulationLeg(hash, first.id);
  const { data } = await new Vault(path).read(PASSWORD);
  let spilledReceipt;
  for (let i = 0; i < 40; i++) {
    const receipt = simulationReceipt(graph, first.id, data.observer.privateKey, START);
    const result = await sdk.recordReceipt(hash, receipt);
    if (result.integrated === false || result.quarantined === true) { spilledReceipt = receipt; break; }
  }
  assert.ok(spilledReceipt, 'Finite leg storage must spill rather than silently discard another effect');
  const summary = await incidentSummary(path);
  assert.deepEqual(summary, { frozen: true, count: 1, pendingCount: 0 });
  const files = (await readdir(`${path}.incidents`)).filter((name) => name.endsWith('.json'));
  const encrypted = await readFile(join(`${path}.incidents`, files[0]), 'utf8');
  assert.equal(encrypted.includes(spilledReceipt.payload.txRef), false);
  const incident = decryptJson(JSON.parse(encrypted), PASSWORD);
  assert.deepEqual(incident.incident.receipt, spilledReceipt);
  const restarted = new WalletSDK(path, PASSWORD, { clock: () => now });
  await assert.rejects(restarted.open(makeGraph(START)), { code: 'STORAGE_FROZEN' });
  await assert.rejects(restarted.prepareDispatch(hash, graph.legs[1].id), { code: 'STORAGE_FROZEN' });
  now = graph.expiresAt + 1;
  await restarted.recover(hash);
  assert.equal((await restarted.snapshot()).state.operations[0].status, 'REFUNDED');
  assert.equal((await incidentSummary(path)).frozen, true, 'Refund does not reconcile an unintegrated observation');
});

test('submission metadata pressure preserves first-observation and recovery allowances', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-dispatch-headroom-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  const data = { state: createState(START), user: newIdentity(), observer: newIdentity(), blinding: randomBytes(32).toString('hex') };
  const trust = { now: START, userPublicKey: data.user.publicKey, verifierPublicKey: data.observer.publicKey };
  const graph = makeGraph(START), hash = graphHash(graph), legId = graph.legs[0].id, txRef = '12'.repeat(32);
  data.state = transition(data.state, { type: 'open', graph, signature: sign(graph, data.user.privateKey), permission: 'demo-payment' }, trust);
  data.state = transition(data.state, { type: 'prepareDispatch', hash, legId }, trust);
  let blocked = false;
  let transitions = 0;
  for (let i = 0; i < 100; i++) {
    const dispatch = data.state.operations[0].legs[0].dispatch.state;
    const command = dispatch === 'SUBMITTED' ? { type: 'markAmbiguous', hash, legId, reason: 'SYNTHETIC_AMBIGUITY' } : { type: 'markSubmitted', hash, legId, txRef };
    const candidate = { ...data, state: transition(data.state, command, trust) };
    try { assertCapacity(candidate, i + 1); }
    catch (error) { assert.equal(error.code, 'STORAGE_LEG_BUDGET'); blocked = true; break; }
    data.state = candidate.state;
    transitions++;
  }
  assert.equal(blocked, true);
  assert.ok(transitions > 2);
  await new Vault(path).create(data, PASSWORD);
  let now = START;
  const sdk = new WalletSDK(path, PASSWORD, { clock: () => now });
  const receipt = simulationReceipt(graph, legId, data.observer.privateKey, now, { txRef });
  const recorded = await sdk.recordReceipt(hash, receipt);
  assert.notEqual(recorded.integrated, false, 'A bounded first observation must still fit');
  assert.equal(recorded.state.operations[0].legs[0].receipt.payload.txRef, txRef);
  now = graph.expiresAt + 1;
  await sdk.recover(hash);
  assert.equal((await sdk.snapshot()).state.operations[0].status, 'REFUNDED');
  t.diagnostic(JSON.stringify({ optionalSubmissionTransitions: transitions, firstObservation: 'INTEGRATED', recovery: 'REFUNDED' }));
});

test('incident sink encrypts independent immutable records and bounded exhaustion never acknowledges capture', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-incident-bound-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  assertNoIncidents(path);
  const payload = { hash: 'ab'.repeat(32), receipt: { syntheticMarker: 'PRIVATE_OBSERVATION_478' }, reason: 'STORAGE_LEG_BUDGET' };
  const outcome = await persistIncident(path, PASSWORD, payload);
  assert.equal(outcome.recorded, true); assert.equal(outcome.integrated, false);
  assert.throws(() => assertNoIncidents(path), { code: 'STORAGE_FROZEN' });
  const entryPath = join(`${path}.incidents`, `${outcome.incidentId}.json`);
  const original = await readFile(entryPath, 'utf8');
  assert.equal(original.includes(payload.receipt.syntheticMarker), false);
  assert.deepEqual(decryptJson(JSON.parse(original), PASSWORD).incident, payload);
  // Deliberate directory-capacity fixture; these names are not evidence that 127
  // additional real observations were acknowledged or authenticated.
  await Promise.all(Array.from({ length: 127 }, (_, i) => writeFile(join(`${path}.incidents`, `${i.toString(16).padStart(64, '0')}.json`), '{}')));
  await assert.rejects(persistIncident(path, PASSWORD, payload), { code: 'OBSERVATION_NOT_PERSISTED' });
  assert.equal(await readFile(entryPath, 'utf8'), original);
  assert.throws(() => assertNoIncidents(path), { code: 'STORAGE_FROZEN' });
  assert.equal((await incidentSummary(path)).count, 128);
});

test('oversized incident or stale append lock leaves a persistent explicit freeze', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'paeg-m2-incident-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'synthetic.vault.json');
  await assert.rejects(persistIncident(path, PASSWORD, { synthetic: 'x'.repeat(20 * 1024) }), { code: 'OBSERVATION_NOT_PERSISTED' });
  assert.deepEqual(await incidentSummary(path), { frozen: true, count: 0, pendingCount: 0 });
  freezeForIncident(path);
  await writeFile(join(`${path}.incidents`, '.append.lock'), 'synthetic-stale-lock');
  await assert.rejects(persistIncident(path, PASSWORD, { synthetic: true }), { code: 'OBSERVATION_NOT_PERSISTED' });
  assert.throws(() => assertNoIncidents(path), { code: 'STORAGE_FROZEN' });
});
