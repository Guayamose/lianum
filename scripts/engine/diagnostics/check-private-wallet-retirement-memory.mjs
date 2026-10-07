/**
 * HOST ONLY: actual production assembler/recipient child lifecycles, mock
 * settlement. No chain/node startup, proof operation, native dispatch, key
 * preparation, or payout-recovery object. Shape-only fixed assembler pins are
 * sufficient because only status and shutdown are requested from that child.
 *
 * Run explicitly: node scripts/check-private-wallet-retirement-memory.mjs
 * Evidence is exclusive-create; previous frozen attempts are never modified.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { launchAssemblyProcess } from '../../../packages/engine/src/assembly/private-assembly-actors.mjs';
import { ASSEMBLY_PUBLIC_WORDS, ASSEMBLY_RECURSIVE_MODES } from '../../../packages/engine/src/assembly/private-assembly-encoding.mjs';
import { startRecipient, stopOwnedChild } from '../../../packages/engine/src/payments/private-payment-engine.mjs';
import { createRetainedWalletRecipient, retirePrivateWalletSettledProcesses } from '../../../packages/engine/src/wallet/resources/private-wallet-retirement.mjs';
import { importRecipientInvoice } from '../../../packages/engine/src/recipients/private-recipient-custody.mjs';
import { origin, withdrawFrame } from '../../../packages/engine/src/notes/private-note-encoding.mjs';
import { canonical } from '../../../packages/engine/src/crypto/privacy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const CLASSIFICATION = 'HOST_ONLY_MOCK_SETTLEMENT_REAL_CHILD_LIFECYCLE_NOT_NATIVE_OR_PROOF';
const CYCLES = 3;
const sha = value => createHash('sha256').update(value).digest('hex');
const hashJson = value => sha(canonical(value));
const fixed = label => sha(`HOST_ONLY_RETIREMENT:${label}`);
const pins = Object.fromEntries(ASSEMBLY_RECURSIVE_MODES.map((mode, index) => [mode, {
  target: 'noir-recursive', keySHA256: fixed(`key:${mode}`), circuitSHA256: fixed(`circuit:${mode}`),
  statementWords: ASSEMBLY_PUBLIC_WORDS[mode], vkFields: Array(115).fill(String(index + 1)),
}]));
const forbiddenModulePattern = /(?:@aztec|@noir-lang|\/one-proof-worker\.mjs|\/prove-worker\.mjs|\/note-prove-worker\.mjs|\/verify-worker\.mjs)/;
const frozenRoot = join(root, 'evidence/m23-shared-wallet-failed-attempt');

function processSample(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/status`, 'utf8');
    const rss = /VmRSS:\s+(\d+)\s+kB/.exec(text);
    return { pid, live: true, rssBytes: rss ? Number(rss[1]) * 1024 : 0 };
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    return { pid, live: false, rssBytes: 0 };
  }
}
function directChildPids() {
  // Some managed Linux /proc implementations omit task/PID/children.
  // PPid in the normal process status provides the same read-only inventory.
  return readdirSync('/proc').filter(name => /^[0-9]+$/.test(name)).filter(name => {
    try { return Number(/^PPid:\s+(\d+)/m.exec(readFileSync(`/proc/${name}/status`, 'utf8'))?.[1]) === process.pid; }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return false; throw error; }
  }).map(Number);
}
async function frozenManifest() {
  const records = [];
  async function walk(path) {
    for (const name of (await readdir(path)).sort()) {
      const file = join(path, name), stat = await lstat(file);
      assert.equal(stat.isSymbolicLink(), false, 'HOST_MEMORY_FROZEN_SYMLINK');
      if (stat.isDirectory()) await walk(file);
      else if (stat.isFile()) records.push({ path: relative(frozenRoot, file), bytes: stat.size, sha256: sha(await readFile(file)) });
    }
  }
  await walk(frozenRoot);
  return { fileCount: records.length, treeSHA256: hashJson(records) };
}
function termsFor(cycle, role) {
  const slot = role === 'sol' ? 1 : 2;
  const scope = fixed(`scope:${cycle}`), seed = fixed(`seed:${cycle}`);
  return {
    scope, policy: fixed(`policy:${cycle}`), role, originSlot: slot,
    origin: origin(scope, seed, slot).toString('hex'), value: '500000000000000',
    descriptor: {
      chain: slot, nonce: fixed(`nonce:${cycle}:${role}`),
      source: role === 'btc' ? '00'.repeat(32) : fixed(`source:${cycle}:${role}`),
      recipient: fixed(`native-recipient-shape-only:${cycle}:${role}`),
      amount: role === 'sol' ? '3000000' : '100000',
      executeAfter: '1900000200', executeBefore: '1900005000', validFrom: '3166667', validUntil: '3166676',
    },
  };
}
function verifyOriginalWithdrawal(invoice, request, authorized) {
  const { signature, ...returned } = authorized;
  assert.deepEqual(returned, request, 'HOST_MEMORY_EXACT_ORIGINAL_WITHDRAWAL');
  const publicKey = createPublicKey({ key: {
    kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(invoice.note.x, 'hex').toString('base64url'),
    y: Buffer.from(invoice.note.y, 'hex').toString('base64url'),
  }, format: 'jwk' });
  assert.equal(verify('sha256', withdrawFrame(request.scope, request.policy,
    request.paymentCommitment, Buffer.from(request.recipient, 'hex'), request.amount, request.epoch),
  { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')), true, 'HOST_MEMORY_ORIGINAL_KEY_SIGNATURE');
}

const startedAt = new Date().toISOString(), started = performance.now();
const evidenceDir = join(root, 'evidence/m23-wallet-retirement-memory');
const evidencePath = join(evidenceDir, `${startedAt.replace(/[:.]/g, '-')}-${process.pid}.json`);
const report = {
  classification: CLASSIFICATION, startedAt, phase: 'RUNNING', cyclesRequested: CYCLES,
  platform: process.platform, nodeVersion: process.version,
  mockSettlement: { state: 'CLAIMED', payouts: { sol: 'READY', btc: 'READY' } },
  assemblerPins: 'FIXED_SHAPE_ONLY_NOT_VERIFICATION_KEYS',
  measurements: 'Linux /proc RSS and MemAvailable bytes; only this runner-owned child PIDs',
  limits: 'Host process-retirement evidence only. System MemAvailable includes unrelated host activity. No native settlement, proof validity, warmed prover footprint, or durable OS-restart claim.',
  cycles: [], samples: [],
};
const ownedChildren = [], recipientWorkers = [], assemblers = [], tracked = new Map(), vaults = [];
let scratch, cycleNumber = 0;

function sample(stage) {
  const children = [...tracked].map(([pid, label]) => ({ label, ...processSample(pid) }));
  const live = children.filter(child => child.live);
  const direct = directChildPids();
  assert.ok(direct.every(pid => tracked.has(pid)), 'HOST_MEMORY_UNEXPECTED_CHILD');
  const memory = /MemAvailable:\s+(\d+)\s+kB/.exec(readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(memory, 'HOST_MEMORY_MEMAVAILABLE');
  const result = {
    cycle: cycleNumber, stage, elapsedMilliseconds: Math.round(performance.now() - started),
    memAvailableBytes: Number(memory[1]) * 1024, controllerRSSBytes: processSample(process.pid).rssBytes,
    childRSSBytes: live.reduce((sum, child) => sum + child.rssBytes, 0),
    liveChildCount: live.length, directChildCount: direct.length, children,
  };
  report.samples.push(result);
  return result;
}
async function spawnRecipient(config) {
  const recipient = await startRecipient(config, [], ownedChildren);
  recipientWorkers.push(recipient);
  tracked.set(recipient.pid, `cycle-${cycleNumber}-${config.expectedTerms.role}-${config.mode ?? 'create'}`);
  return recipient;
}
async function assertOriginalVaults() {
  let bytes = 0;
  for (const vault of vaults) {
    const stat = await lstat(vault.path);
    assert.equal(stat.mode & 0o777, 0o600, 'HOST_MEMORY_PRIVATE_VAULT_MODE');
    assert.equal(sha(await readFile(vault.path)), vault.sha256, 'HOST_MEMORY_ORIGINAL_ENCRYPTED_VAULT_UNCHANGED');
    bytes += stat.size;
  }
  return { count: vaults.length, bytes, allOriginalEncryptedBytesUnchanged: true };
}

try {
  assert.equal(process.platform, 'linux', 'HOST_MEMORY_LINUX_ONLY');
  report.frozenEvidenceBefore = await frozenManifest();
  scratch = await mkdtemp(join(tmpdir(), 'private-wallet-retirement-'));
  await chmod(scratch, 0o700);
  assert.equal((await lstat(scratch)).mode & 0o777, 0o700);
  for (cycleNumber = 1; cycleNumber <= CYCLES; cycleNumber++) {
    const cycle = { cycle: cycleNumber, recoveredRole: cycleNumber % 2 ? 'sol' : 'btc' };
    report.cycles.push(cycle);
    const before = sample('BEFORE_CYCLE');
    assert.equal(before.liveChildCount, 0, 'HOST_MEMORY_NO_PRIOR_LIVE_CHILDREN');
    assert.equal(before.directChildCount, 0, 'HOST_MEMORY_NO_PRIOR_DIRECT_CHILDREN');
    const directory = join(scratch, `cycle-${cycleNumber}`);
    await mkdir(directory, { mode: 0o700 });
    assert.equal((await lstat(directory)).mode & 0o777, 0o700);
    const terms = Object.fromEntries(['sol', 'btc'].map(role => [role, termsFor(cycleNumber, role)]));
    const assembler = launchAssemblyProcess('assembler', { kind: 'assembler', scope: terms.sol.scope, policy: terms.sol.policy, pins });
    assemblers.push(assembler); tracked.set(assembler.control.pid, `cycle-${cycleNumber}-assembler`);
    await assembler.control.ready;
    assert.equal((await assembler.control.request('status')).kind, 'assembler');
    const recipients = {}, originals = {};
    for (const role of ['sol', 'btc']) {
      const custody = { path: join(directory, `${role}.vault`), password: `synthetic-${randomBytes(32).toString('hex')}`,
        expectedTerms: terms[role], withdrawalRecipient: fixed(`withdrawal:${cycleNumber}:${role}`).slice(0, 40) };
      const initialRecipient = await spawnRecipient(custody);
      const { termsDigest, value, paymentCommitment, localCommitment } = initialRecipient.review;
      const expectedReview = await initialRecipient.request('acknowledgeCompensation', { termsDigest, value, paymentCommitment, localCommitment }, 'operator');
      assert.equal(expectedReview.acknowledged, true);
      const invoice = await initialRecipient.request('invoice', terms[role]);
      importRecipientInvoice(terms[role], invoice);
      const request = { scope: terms[role].scope, policy: terms[role].policy, paymentCommitment,
        recipient: custody.withdrawalRecipient, amount: value, epoch: '3166670' };
      originals[role] = { invoice, request, originalPid: initialRecipient.pid };
      vaults.push({ path: custody.path, sha256: sha(await readFile(custody.path)) });
      recipients[role] = createRetainedWalletRecipient({ role, initialRecipient, custody, expectedReview, startRecipient: spawnRecipient });
    }
    const live = sample('LIVE_BEFORE_MOCK_SETTLEMENT_RETIREMENT');
    assert.equal(live.liveChildCount, 3, 'HOST_MEMORY_THREE_REAL_LIVE_CHILDREN');
    assert.ok(live.children.filter(child => child.live).every(child => child.rssBytes > 0), 'HOST_MEMORY_REAL_CHILD_RSS');
    let verifyCalls = 0;
    await retirePrivateWalletSettledProcesses({ assembler: assembler.control, recipients,
      verifySettled: async () => { verifyCalls++; return structuredClone(report.mockSettlement); },
      recordSample: async stage => { sample(stage); },
      recordRetirement: async value => { cycle.retirement = value; },
    });
    assert.ok(verifyCalls > 0, 'HOST_MEMORY_MOCK_SETTLEMENT_CHECKED');
    cycle.mockSettlementCheckCount = verifyCalls;
    const retired = sample('RETIRED_AFTER_MOCK_SETTLEMENT');
    assert.equal(retired.liveChildCount, 0, 'HOST_MEMORY_SETTLED_CHILDREN_RETIRED');
    assert.equal(retired.directChildCount, 0, 'HOST_MEMORY_SETTLED_CHILDREN_CLOSED');
    assert.equal(retired.childRSSBytes, 0, 'HOST_MEMORY_RETIRED_CHILD_RSS_ZERO');
    assert.equal(assembler.control.provenance().closed, true);
    assert.equal(assembler.control.provenance().channelsClosed, true);
    assert.deepEqual(assembler.control.provenance().callsByOperation, { status: 1, shutdown: 1 }, 'HOST_MEMORY_ASSEMBLER_NO_PROOF_OPERATIONS');
    cycle.retiredChildRSSBytes = live.childRSSBytes;
    cycle.retirementMemAvailableDeltaBytes = retired.memAvailableBytes - live.memAvailableBytes;

    const role = cycle.recoveredRole, original = originals[role];
    const signed = await recipients[role].authorizeWithdrawal(original.request);
    verifyOriginalWithdrawal(original.invoice, original.request, signed);
    const restored = sample('ONE_ORIGINAL_RECIPIENT_LAZILY_RESTORED');
    assert.equal(restored.liveChildCount, 1, 'HOST_MEMORY_EXACTLY_ONE_LAZY_RECIPIENT');
    assert.notEqual(restored.children.find(child => child.live).pid, original.originalPid, 'HOST_MEMORY_NEW_RECIPIENT_PID');
    cycle.withdrawalRecovery = {
      originalInvoiceSHA256: hashJson(original.invoice), originalRequestSHA256: hashJson(original.request),
      exactOriginalRequestRetained: true, originalPublicKeyVerifiedSignature: true,
      originalPaymentCommitmentSHA256: sha(original.request.paymentCommitment),
      originalDestinationSHA256: sha(original.request.recipient), amount: original.request.amount,
      noteOpeningSHA256: hashJson(original.invoice.note),
      originalPid: original.originalPid, restoredPid: restored.children.find(child => child.live).pid,
    };
    await recipients[role].retire();
    const idle = sample('AFTER_RECOVERY_RETIREMENT');
    assert.equal(idle.liveChildCount, 0, 'HOST_MEMORY_NO_LIVE_CHILD_ACCUMULATION');
    assert.equal(idle.directChildCount, 0, 'HOST_MEMORY_ALL_CHILD_CHANNELS_CLOSED');
    cycle.encryptedVaultsRetainedAcrossCycles = await assertOriginalVaults();
  }
  report.frozenEvidenceAfter = await frozenManifest();
  assert.deepEqual(report.frozenEvidenceAfter, report.frozenEvidenceBefore, 'HOST_MEMORY_FROZEN_EVIDENCE_UNCHANGED');
  report.noLiveChildAccumulation = true;
  report.maximumLiveChildren = Math.max(...report.samples.map(entry => entry.liveChildCount));
  report.summary = {
    completedCycles: report.cycles.length, totalActualChildLifecycles: tracked.size,
    retainedEncryptedVaultCount: vaults.length,
    childRSSRetiredBytesByCycle: report.cycles.map(cycle => cycle.retiredChildRSSBytes),
    controllerRSSBytesBefore: report.samples[0].controllerRSSBytes,
    controllerRSSBytesAfter: report.samples.at(-1).controllerRSSBytes,
    finalLiveChildCount: report.samples.at(-1).liveChildCount,
    finalChildRSSBytes: report.samples.at(-1).childRSSBytes,
  };
  report.phase = 'PASSED';
} catch (error) {
  report.phase = 'FAILED';
  report.failure = { name: error.name, code: error.code ?? null, message: error.message };
  process.exitCode = 1;
} finally {
  const cleanup = [];
  for (const recipient of recipientWorkers) cleanup.push(recipient.terminate());
  for (const assembler of assemblers) cleanup.push(assembler.control.terminate());
  for (const child of ownedChildren) cleanup.push(stopOwnedChild(child));
  const results = await Promise.allSettled(cleanup);
  report.cleanupRejections = results.filter(result => result.status === 'rejected').length;
  cycleNumber = Math.min(cycleNumber, CYCLES);
  const finalSample = sample('FINAL_ALL_OWNED_CHILDREN_CLOSED');
  if (finalSample.liveChildCount !== 0 || finalSample.directChildCount !== 0 || report.cleanupRejections !== 0) {
    report.phase = 'FAILED'; process.exitCode = 1;
  }
  if (scratch) { await rm(scratch, { recursive: true, force: true }); report.temporarySyntheticCustodyRemovedAfterAllCycles = true; }
  report.completedAt = new Date().toISOString();
  report.elapsedMilliseconds = Math.round(performance.now() - started);
  report.sources = {};
  for (const path of ['scripts/check-private-wallet-retirement-memory.mjs', 'src/private-wallet-retirement.mjs',
    'src/private-recipient-process.mjs', 'src/private-recipient-custody.mjs', 'src/private-payment-engine.mjs', 'src/private-assembly-actors.mjs']) {
    report.sources[path] = sha(await readFile(join(root, path)));
  }
  // Imported dependencies may expose inert native helpers, but this runner must
  // never import proof runtimes or execute a worker entrypoint itself.
  const ownSource = await readFile(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(ownSource.split('\n').filter(line => /^import /.test(line)).some(line => forbiddenModulePattern.test(line)), false);
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  const encoded = JSON.stringify(report, null, 2) + '\n';
  await writeFile(evidencePath, encoded, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: report.phase, classification: CLASSIFICATION,
    evidencePath: relative(root, evidencePath), evidenceSHA256: sha(encoded), summary: report.summary,
    ...(report.failure ? { failure: report.failure } : {}) }));
}
