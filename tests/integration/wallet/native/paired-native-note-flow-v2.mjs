/** Fixed private Linux acceptance, inert on import. Two genuine native notes
 * use original custody/authority/SDK. Mobile V2 only reads/reconciles originals;
 * neither its diagnostics nor CONFIRMED cache establish an economic observation. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, readdirSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, FLAT, GOLDEN } from '../../../../packages/proofs/src/catalog.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { decodeWalletPoolInputs } from '../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { createOwnedLocalEvmV2, createOwnedLocalEvmNativeValueV1,
  assertOwnedLocalEvmV2, assertOwnedLocalEvmNativeValueV1 } from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOwnedLocalNativeValueOperatorBootstrap } from '../../../../packages/backend/src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import { deployNativeValueDevSystemV5, assertOwnedNativeValueSystem } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-system-v2.mjs';
import { loadNativeValueDevDeploymentArtifactsV5, NATIVE_VALUE_VERIFIER_ORDER } from '../../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { createNativeValueSystemStateReader } from '../../../../packages/backend/src/execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import { createNativeValueOwnerProcess } from '../../../../packages/custody/src/processes/native-value-owner-process-v2.mjs';
import { createNativeValueAccountAuthority, nativeValueAccountManualNoteDetails } from '../../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import { createNativeValueManualGraphAccountSession } from '../../../../packages/backend/src/api/accounts/flat-manual-graph-session.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 } from '../../../../packages/backend/src/api/mobile/paired-original-account-actor-v2.mjs';
import { createPairedOriginalAccountHttpServerV2 } from '../../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2, validateOriginalAccountFreshV2,
  privateStateAccessMessageV1, privateStateReviewMessageV1 } from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { startWalletApplication } from '../../../../apps/wallet/src/server/server.mjs';
import { createManualWalletAppDriver } from '../manual/manual-wallet-app-driver.mjs';
import { assertPrivateMetaMorphoProofTelemetry } from '../../defi/private-metamorpho-proof-evidence.mjs';
import { freshFixtureId, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { NATIVE_FLOW_LIMITS } from '../../native/native-flow-supervisor.mjs';
import { pairedNativeNoteSourcePinsV2 } from './paired-native-note-source-pins-v2.mjs';
import { PAIRED_NATIVE_NOTE_PROFILE_V2, PAIRED_NATIVE_NOTE_RESULT_V2,
  PAIRED_NATIVE_NOTE_ECONOMICS_V2, assertPairedNativeNoteReleaseV2, assertPairedNativeNoteResultV2 } from './paired-native-note-policy-v2.mjs';
import { DEVICE_DEPOSIT_PROFILE_V1, DEVICE_DEPOSIT_RESULT_V1, assertDeviceDepositReleaseV1, assertDeviceDepositResultV1 } from './device-owner-deposit-policy-v1.mjs';
import { deviceOwnerDepositSourcePinsV1 } from './device-owner-deposit-source-pins-v1.mjs';
import { runDeviceOwnerDepositOriginalStepV1 } from './device-owner-deposit-original-step-v1.mjs';
const HERE = fileURLToPath(import.meta.url), bare = value => value.startsWith('0x') ? value.slice(2) : value;
const hash = value => createHash('sha256').update(value).digest('hex');
const proofBytes = value => typeof value === 'string' ? Buffer.from(value, 'hex') : Buffer.from(value);
const safeCode = error => privateFailureDiagnostic(error, 'PAIRED_NATIVE_NOTE_FAILED').code;

/** No argument supplies a fixture, runtime, proof worker, release or endpoint. */
export async function runPairedNativeNoteFlowV2() {
  assert.equal(arguments.length, 0, 'PAIRED_NOTE_FIXED_NO_OPTIONS');
  return runOriginalNoteFlowV2(false);
}
export async function runDeviceOwnerDepositFlowV1() {
  assert.equal(arguments.length, 0, 'DEVICE_DEPOSIT_FIXED_NO_OPTIONS');
  return runOriginalNoteFlowV2(true);
}
async function runOriginalNoteFlowV2(deviceDeposit) {
  if (deviceDeposit) assertDeviceDepositReleaseV1(); else assertPairedNativeNoteReleaseV2();
  const worker = deviceDeposit ? join(ROOT, 'integration/device-owner-deposit-flow-v1.mjs') : HERE;
  const sourcePins = deviceDeposit ? deviceOwnerDepositSourcePinsV1 : pairedNativeNoteSourcePinsV2;
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.equal(realpathSync(process.argv[1]), worker); assert.equal(realpathSync(process.cwd()), ROOT);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2);
  assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, deviceDeposit ? 'integration/run-device-owner-deposit-v1.mjs' : 'integration/run-paired-native-note-v2.mjs'));
  const stem = deviceDeposit ? DEVICE_DEPOSIT_PROFILE_V1 : PAIRED_NATIVE_NOTE_PROFILE_V2, lock = JSON.parse(readFileSync(join(ROOT, '.local', stem, 'active.lock')));
  assert.equal(lock.pid, process.ppid); assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(lock.attempt, '.local/' + stem + '/attempt-' + lock.runId);
  const directory = join(ROOT, lock.attempt), privateDirectory = join(directory, 'private-audit'), proofDirectory = join(directory, 'public-proofs');
  mkdirSync(privateDirectory, { mode: 0o700 }); mkdirSync(proofDirectory, { mode: 0o700 });
  const ownerDirectory = join(privateDirectory, 'owner'), journalDirectory = join(privateDirectory, 'session-journal');
  const began = performance.now(), deadlineMs = Date.parse(lock.startedAt)
    + NATIVE_FLOW_LIMITS.totalMilliseconds - NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds;
  let runtime, nativeRuntime, bootstrap, system, reader, otherReader, owner, account, joined, preparation, app, driver,
    bundle, deviceKey, closing, interrupted = false;
  const pairs = [], checkpoints = [], retainedProofs = new Map(); let privateEvent = 0;
  let proofReady, proofRejected;
  const originalProofRetained = new Promise((done, reject) => { proofReady = done; proofRejected = reject; });
  originalProofRetained.catch(() => {});
  const waitOriginalProof = async () => {
    let timer;
    try { return await Promise.race([originalProofRetained, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('DEVICE_DEPOSIT_ORIGINAL_DEADLINE')), Math.max(1, deadlineMs - Date.now()));
    })]); } finally { clearTimeout(timer); }
  };
  const result = { format: deviceDeposit ? DEVICE_DEPOSIT_RESULT_V1 : PAIRED_NATIVE_NOTE_RESULT_V2, profile: stem, runId: lock.runId,
    startedAt: new Date().toISOString(), phase: 'starting', success: false, interrupted: false,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, nativeExecution: null, pairedOriginalAccountNodeAcceptance: false,
    nativeGraphAcceptance: false, nativeProcessRestartEstablished: false, keeperLossRecoveryEstablished: false,
    mobileNoteCustodyEstablished: false, tlsEstablished: false, reactRendererEstablished: false,
    physicalPhoneEstablished: false, mobilePortfolioEstablished: false, independentInfrastructureEstablished: false,
    fullWalletAcceptance: false, nativeDeliveryCount: 0, sourcePins: await sourcePins(),
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, stages: [], proofs: [], notes: [],
    mobileRequests: [], mobileStateReads: [], pairedOriginalPrivateStateReadNodeAcceptance: false, checks: {}, cleanup: { errors: [], mobileListeners: [] },
    disclosure: ['Two original Linux native-asset notes; all value is synthetic on owned local Anvil.',
      'Signed HTTPS descriptor is translated to owned loopback HTTP in the fixed test; no TLS or phone acceptance.',
      'Node uses real mobile API/lease/Noble signatures; note keys remain in the original Linux custody child.',
      'V2 diagnostics expose no portfolio; separate state-read consent reveals only the original account/pool balance.',
      'Same owner object reopens its original encrypted checkpoint; no lost-keeper, node or backend restart.',
      'Receiver uses the retained Cancun/gas30M local profile; no post-Osaka private-proof compatibility claim.'] };
  if (deviceDeposit) {
    result.deviceOwnerD26NodeAcceptance = false;
    result.disclosure = ['One client-owned PC23 opening, signed by the real portable mobile Noble module; synthetic local EVM funds only.',
      'The original D26 worker receives this one opening and signature, never the root or note private signing key.',
      'Actual loopback HTTPS/TLS1.3; exact mobile API Node execution, no plaintext translator.',
      'Separate signed PROVE/FUND/OBSERVE consent; admitted original proof survives HTTP504 and funding reply is discarded once.',
      'The original Linux note remains UNISSUED; neither owner.bindSubmission nor owner acknowledgement adopts the client note.',
      'No SecureStore, biometric hardware, Hermes/React renderer, physical phone, device vault persistence or subsequent graph/EXIT acceptance.'];
  }
  const save = () => writeFixturePrivate(join(directory, 'result.json'), result);
  const active = () => { assert.equal(interrupted, false, 'PAIRED_NOTE_INTERRUPTED');
    assert.ok(Date.now() < deadlineMs, 'PAIRED_NOTE_ORIGINAL_DEADLINE'); };
  async function stage(name) { active(); result.phase = name; result.stages.push({ name, at: new Date().toISOString() });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); }
  async function audit(runtimeOnly = false) {
    for (const [name, value] of [['evm', runtime], ['native-evm', nativeRuntime]]) if (value)
      writeFixturePrivate(join(privateDirectory, name + '.json'), { metadata: value.metadata,
        transactions: value.transactions, receipts: value.receipts, lifecycle: value.lifecycle });
    if (account && !runtimeOnly) {
      const status = await account.privateStatus();
      // Fixed nativeExecution:null TOP_UP/EXIT: retain only public operational
      // fields, excluding all prepared packets/native review/state expansions.
      const operations = status.operations.map(row => { assert.ok(['TOP_UP', 'EXIT'].includes(row.kind));
        assert.equal(row.nativeBinding, null);
        return Object.fromEntries(['ownerOperationRef', 'kind', 'ownerKind', 'role', 'request', 'stage',
          'submission', 'terminal', 'outcome', 'errorCode'].map(name => [name, row[name]])); });
      writeFixturePrivate(join(privateDirectory, 'account-private-status.json'), { profile: status.profile, operations });
    }
    save();
  }
  const telemetryDirectory = join(GOLDEN, 'evidence/paeg-proof-attempts');
  const earlierJobs = new Set(existsSync(telemetryDirectory) ? readdirSync(telemetryDirectory) : []);
  async function onProof({ label, relation, proof }) {
    active(); assert.ok(['deposit_balance', 'withdraw_balance'].includes(relation), 'PAIRED_NOTE_ONLY_D26_W39');
    assert.equal(retainedProofs.has(relation), false, 'PAIRED_NOTE_DUPLICATE_PROOF');
    assert.equal(earlierJobs.has(proof.metrics.id + '.json'), false, 'PAIRED_NOTE_FRESH_PROOF_REQUIRED');
    const bytes = proofBytes(proof.proof), inputBytes = Buffer.from(JSON.stringify(proof.publicInputs));
    const telemetry = readFileSync(join(telemetryDirectory, proof.metrics.id + '.json'));
    const evidence = assertPrivateMetaMorphoProofTelemetry({ relation, returnedMetrics: proof.metrics,
      storedMetrics: JSON.parse(telemetry), proofSHA256: hash(bytes), publicInputsSHA256: hash(inputBytes), telemetrySHA256: hash(telemetry) });
    assert.deepEqual(evidence.policy, PRIVATE_RESOURCE_POLICY); assert.equal(evidence.threads, 1);
    assert.equal(evidence.maximumPages, 32768); assert.equal(evidence.worker.threads, 1);
    assert.equal(evidence.worker.maximumPages, 32768);
    assert.equal(evidence.keySHA256, bundle.verifiers[relation].lineage.keySHA256);
    const statement = decodeWalletPoolInputs(relation, proof.publicInputs);
    assert.equal(statement.amount, PAIRED_NATIVE_NOTE_ECONOMICS_V2.amountAtomic);
    assert.equal(bare(statement.scope), bare(system.pools[0].domain.scope));
    assert.equal(bare(statement.policy), bare(system.pools[0].domain.policy));
    if (relation === 'withdraw_balance') assert.equal(statement.recipient, runtime.accounts[3]);
    const file = String(result.proofs.length + 1).padStart(3, '0') + '-' + relation;
    writeFileSync(join(proofDirectory, file + '.bin'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(proofDirectory, file + '.inputs.json'), inputBytes, { flag: 'wx', mode: 0o600 });
    retainedProofs.set(relation, { proof: bytes.toString('hex'), publicInputs: [...proof.publicInputs], statement });
    result.proofs.push({ label, relation, file, publicWords: proof.publicInputs.length, amountAtomic: statement.amount,
      proofSHA256: hash(bytes), publicInputsSHA256: hash(inputBytes), evidence }); save();
  }
  async function effectCounts() {
    return { proofs: result.proofs.length, receiverTransactions: runtime.transactions.length,
      nativeTransactions: nativeRuntime.transactions.length, recipientBalance: String(await runtime.balance(runtime.accounts[3])) };
  }
  async function observedNote(body, amount, relation) {
    const status = await account.privateStatus(), matches = status.operations.filter(row => row.ownerOperationRef === body.ownerOperationRef);
    assert.equal(matches.length, 1); const original = matches[0]; assert.equal(original.stage, 'CONFIRMED');
    assert.equal(original.request.requestId, body.requestId); assert.ok(original.outcome && original.submission?.dispatchLatched);
    const challenge = randomBytes(16).toString('hex'), observation = await account.authority.observe({
      request: original.request, outcome: original.outcome, challenge });
    assert.equal(observation.challenge, challenge); assert.equal(observation.status, 'LIVE');
    const current = await reader.read(), other = await otherReader.read(), ownerView = await account.ownerView();
    assert.equal(ownerView.status, 'LIVE'); assert.equal(ownerView.balances.available, amount);
    for (const name of ['reserved', 'locked', 'recovery']) assert.equal(ownerView.balances[name], '0');
    const backing = { held: amount, liabilities: amount, surplus: '0', deficit: '0' };
    assert.deepEqual(ownerView.backing, backing); assert.deepEqual(observation.backing, backing);
    assert.equal(current.ledger.publicState.actualAssetBalance, amount); assert.equal(current.ledger.publicState.backedAmount, amount);
    assert.equal(current.ledger.publicState.liveReservations, 0);
    assert.equal(other.ledger.publicState.actualAssetBalance, '0'); assert.equal(other.ledger.publicState.backedAmount, '0');
    await reader.assertCurrent(current); await otherReader.assertCurrent(other);
    const transactionHash = '0x' + original.submission.transactionHash;
    const rows = runtime.transactions.filter(row => row.transactionHash === transactionHash);
    assert.equal(rows.length, 1); const transaction = rows[0], receipt = await runtime.receipt(transactionHash);
    assert.equal(receipt.status, '0x1'); await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    assert.equal(transaction.phase, 'mined'); assert.equal(transaction.request.to, system.pools[0].address);
    assert.equal(transaction.request.from, runtime.accounts[0]);
    assert.equal(receipt.from, transaction.request.from); assert.equal(receipt.to, transaction.request.to);
    const proof = retainedProofs.get(relation);
    assert.equal(transaction.request.data, encodeFlatTransaction(body.kind === 'TOP_UP' ? 'depositBalance' : 'withdrawBalance', { proof: proof.proof, publicInputs: proof.publicInputs }));
    assert.equal(BigInt(transaction.request.value ?? '0'), body.kind === 'TOP_UP' ? 500n : 0n);
    assert.equal(bare(receipt.blockHash), original.outcome.blockHash);
    assert.equal(current.ledger.publicState.spent, body.kind === 'TOP_UP' ? 0 : 1);
    if (body.kind === 'EXIT') assert.deepEqual(current.ledger.nullifiers, [proof.statement.nullifier]);
    const note = { ...body, state: 'CONFIRMED', amountAtomic: '500', transactionHash, receipt,
      outcome: original.outcome, originalObservation: observation, originalTransactionCount: rows.length,
      actualCanonicalReceiptVerified: true, calldataJoinedToOriginalProof: true,
      proofSHA256: result.proofs.find(value => value.relation === relation).proofSHA256,
      observedOwnerView: ownerView, observedPool: current.ledger.publicState };
    writeFixturePrivate(join(privateDirectory, body.requestId + '-canonical.json'), note); return note;
  }
  async function close() {
    return closing ??= (async () => {
      const safely = async (name, work) => { try { return await work(); }
        catch (error) { result.cleanup.errors.push({ name, code: safeCode(error) }); return null; } };
      for (const pair of pairs) {
        const stopped = await safely('mobile-listener', () => pair.server.close());
        result.cleanup.mobileListeners.push(stopped ?? { closed: false });
        if (stopped?.closed === true && stopped.ownedSocketsRemaining === 0 && pair.afterClose)
          await safely('device-tls-retirement', () => pair.afterClose());
      }
      if (app) result.cleanup.closedWalletListener = (await safely('wallet-listener', () => app.close()))?.listenerClosed === true;
      if (account) await safely('account-abort', () => account.abort());
      if (joined) { const stopped = await safely('session', () => joined.session.close());
        result.cleanup.closedSession = stopped?.phase === 'CLOSED'; }
      if (account) result.cleanup.closedAccount = (await safely('account', () => account.close()))?.closed === true;
      if (owner) { result.cleanup.closedOwner = (await safely('owner', () => owner.close()))?.childExited === true;
        result.cleanup.ownerStop = await safely('owner-stop-report', () => owner.report()); }
      if (bootstrap) { const stopped = await safely('bootstrap', () => { bootstrap.close(); return { closed: true }; });
        result.cleanup.closedBootstrap = stopped?.closed === true; }
      for (const [name, resource, key] of [['evm', runtime, 'closedEvm'], ['nativeEvm', nativeRuntime, 'closedNativeEvm']]) if (resource) {
        const status = await safely(name, () => resource.close({ removeScratch: true }));
        const stop = await safely(name + '-stop-event', () => {
          const rows = resource.lifecycle.filter(row => row.event === 'stopped-owned-process');
          assert.equal(rows.length, 1); return rows[0]; });
        result.cleanup[name] = { status, stop }; result.cleanup[key] = status?.stopped === true;
      }
      // Remove only fixed synthetic custody/journal directories after original
      // processes have confirmed closure. Reports and public proof bytes remain.
      async function removeOwnSyntheticState(target) {
        assert.equal(realpathSync(privateDirectory), privateDirectory);
        assert.ok([ownerDirectory, journalDirectory].includes(target));
        const info = lstatSync(target);
        assert.equal(info.uid, process.getuid()); assert.equal(info.isSymbolicLink(), false);
        assert.equal(info.isDirectory(), true); assert.equal(info.mode & 0o077, 0);
        assert.equal(realpathSync(target), target); rmSync(target, { recursive: true });
        assert.equal(existsSync(target), false); return { removed: true };
      }
      if (result.cleanup.closedOwner === true) result.cleanup.syntheticOwnerStateRemoved =
        (await safely('synthetic-owner-state', () => removeOwnSyntheticState(ownerDirectory)))?.removed === true;
      if (result.cleanup.closedSession === true) result.cleanup.syntheticSessionJournalRemoved =
        (await safely('synthetic-session-journal', () => removeOwnSyntheticState(journalDirectory)))?.removed === true;
      result.cleanup.syntheticAccountStateRemoved = result.cleanup.evm?.status?.scratchRemoved === true;
      deviceKey?.fill(0);
    })();
  }
  const interrupt = () => { if (interrupted) return; interrupted = true; result.interrupted = true;
    result.success = false; result.phase = 'failed'; result.errorCode = 'PAIRED_NOTE_INTERRUPTED_ORIGINAL_OUTCOME_UNKNOWN';
    void close().catch(error => { result.cleanup.errors.push({ name: 'interrupt-cleanup', code: safeCode(error) }); })
      .finally(() => { try { save(); } finally { process.exit(2); } }); };
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
  try {
    save(); await stage('genuine-V5-artifacts-before-runtime');
    bundle = await loadNativeValueDevDeploymentArtifactsV5();
    assert.deepEqual(Object.keys(bundle.verifiers).sort(), NATIVE_VALUE_VERIFIER_ORDER.map(([name]) => name).sort());
    result.artifacts = { noteKeys: Object.fromEntries(['deposit_balance', 'withdraw_balance'].map(name => [name, bundle.verifiers[name].lineage.keySHA256])),
      notePrograms: Object.fromEntries(['deposit_balance', 'withdraw_balance'].map(name => [name, bundle.verifiers[name].lineage.programSHA256])),
      originalTwelveVerifierLineages: true };
    result.checks.genuineV5ArtifactsBeforeRuntime = true;
    await stage('two-original-runtime-bootstrap-and-native-note-account');
    runtime = await createOwnedLocalEvmV2(); nativeRuntime = await createOwnedLocalEvmNativeValueV1();
    await assertOwnedLocalEvmV2(runtime); await assertOwnedLocalEvmNativeValueV1(nativeRuntime);
    assert.notEqual(runtime, nativeRuntime); assert.notEqual(runtime.metadata.processId, nativeRuntime.metadata.processId);
    assert.equal(runtime.metadata.chainId, '31337'); assert.equal(nativeRuntime.metadata.chainId, '1');
    for (const key of ['send', 'dispatch', 'advanceTo']) assert.equal(Object.hasOwn(nativeRuntime, key), false);
    bootstrap = await createOwnedLocalNativeValueOperatorBootstrap({ nativeRuntimes: [nativeRuntime] });
    assert.equal(bootstrap.metadata.adapterProfiles.length, 1); assert.equal(bootstrap.metadata.adapterProfiles[0].profile.chainId, '1');
    system = await deployNativeValueDevSystemV5({ runtime, options: { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1', bootstrap,
      pools: [0, 1].map(() => ({ policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })) } });
    assertOwnedNativeValueSystem(runtime, system); assert.equal(system.claimsEnabled, false);
    for (const pool of system.pools) assert.equal(pool.asset, '0x' + '0'.repeat(40));
    reader = await createNativeValueSystemStateReader({ runtime, system, poolIndex: 0 });
    otherReader = await createNativeValueSystemStateReader({ runtime, system, poolIndex: 1 });
    mkdirSync(ownerDirectory, { mode: 0o700 }); mkdirSync(journalDirectory, { mode: 0o700 });
    owner = await createNativeValueOwnerProcess({ runtime, system, poolIndex: 0, directory: ownerDirectory,
      password: freshFixtureId(), create: true, checkpoint: null, onCheckpoint: async value => {
        checkpoints.push(structuredClone(value)); writeFixturePrivate(join(ownerDirectory, 'checkpoint.json'), value); } });
    account = await createNativeValueAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution: null,
      accountId: freshFixtureId(), journalId: freshFixtureId() }, { onProof, onPrivateAudit: async value => {
        // This callback runs inside the original authority single-flight gate.
        // Retain its own event; privateStatus is read only outside that gate.
        const event = Object.fromEntries(['reference', 'phase', 'receipt', 'stage', 'errorCode', 'errorCauseCodes', 'auditBudget']
          .filter(name => Object.hasOwn(value, name)).map(name => [name, value[name]]));
        writeFixturePrivate(join(privateDirectory, 'authority-event-' + (++privateEvent) + '.json'), event);
        await audit(true);
        if (deviceDeposit && value.phase === 'device-deposit-proof-retained') {
          if (value.stage === 'PROVED') proofReady();
          else if (value.stage === 'FAILED') proofRejected(Error('DEVICE_DEPOSIT_ORIGINAL_PROOF_FAILED'));
        } } });
    assert.equal(account.features.nativeGraph, false); preparation = await account.ownerActions.createManualPreparation();
    joined = await createNativeValueManualGraphAccountSession({ runtime, system, poolIndex: 0, account,
      journal: { path: join(journalDirectory, 'original-account-journal.vault'), password: freshFixtureId() } });
    app = await startWalletApplication({ accountSession: joined.session, actionAccessMode: 'exact-only', port: 0 });
    driver = createManualWalletAppDriver(app, { deadlineMs }); result.checks.originalNativeFactoryAndBootstrap = true;
    const appRoot = realpathSync(resolve(FLAT, '../../../apps/mobile'));
    assert.equal(appRoot, resolve(FLAT, '../../../apps/mobile'), 'PAIRED_NOTE_FIXED_PHYSICAL_APP_ROOT');
    const fromApp = path => import(pathToFileURL(join(appRoot, 'src', path)).href);
    const { createOriginalAccountApiV2 } = await fromApp('api/original-account-api-v2.mjs');
    const { createOriginalAccountLeaseV2 } = await fromApp('custody/original-account-lease-v2.mjs');
    const { devicePublicKey, signDeviceMessage, privateKeyFromHex } = await fromApp('custody/signing.mjs');
    for (let attempt = 0; attempt < 16 && !deviceKey; attempt++) { active(); const candidate = randomBytes(32);
      try { deviceKey = privateKeyFromHex(candidate.toString('hex')); break; }
      catch { /* No device key was accepted; no note or network operation exists. */ }
      finally { candidate.fill(0); } }
    assert.ok(deviceKey, 'PAIRED_NOTE_FRESH_DEVICE_KEY_UNAVAILABLE');
    const publicKey = devicePublicKey(deviceKey), origin = 'https://paired-native-note-v2.example';
    async function pair(approval) {
      const actor = await createPairedOriginalAccountActorV2({ session: joined.session, approval, owner, origin, devicePublicKey: publicKey });
      const descriptor = pairedOriginalAccountActorDescriptorV2(actor), server = await createPairedOriginalAccountHttpServerV2({ actor });
      let action = 'read', calls = 0, diagnosticsPosts = 0, dropNext = false, loss = null;
      const translate = async (target, options) => { active(); assert.equal(new URL(target).origin, descriptor.origin); calls++;
        const path = new URL(target).pathname;
        const diagnosticPost = path === '/v2/mobile/original-account/diagnostics' && options.method === 'POST';
        if (diagnosticPost) diagnosticsPosts++;
        const discard = dropNext && diagnosticPost;
        if (discard) dropNext = false; // consume BEFORE the owned POST, never retry
        const response = await fetch(server.url + path, options);
        if (discard) {
          assert.equal(response.status, 200, 'PAIRED_NOTE_REAL_COMPLETED_HTTP_REPLY_REQUIRED');
          assert.ok(response.body && !response.bodyUsed);
          loss = { actualHttpStatus: response.status, responseBodyDeliveredToApi: false,
            diagnosticsPostsBefore: diagnosticsPosts - 1, diagnosticsPostsAfter: diagnosticsPosts,
            noAutomaticResubmit: true, actualNetworkOutage: false };
          await response.body.cancel(); // only this genuine owned HTTP response
          throw Error('PAIRED_NOTE_ORIGINAL_HTTP_REPLY_LOST_BEFORE_API');
        }
        return new Response(response.body, { status: response.status, headers: response.headers }); };
      const api = createOriginalAccountApiV2({ descriptor, fetchImpl: translate });
      const lease = createOriginalAccountLeaseV2({ readContext: () => ({ ...descriptor, action, foreground: true }) });
      const selected = { approval, actor, descriptor, server, api, lease, translate,
        calls: () => calls, setAction(value) { action = value; },
        loseNextDiagnosticReply() { assert.equal(dropNext, false); assert.equal(loss, null); dropNext = true; },
        replyLoss: () => loss, diagnosticsPosts: () => diagnosticsPosts };
      pairs.push(selected); const state = await api.state();
      assert.deepEqual(state.actions, { read: true, reconcile: true });
      assert.equal(state.privatePortfolio, null); assert.equal(state.economicObservation, null);
      assert.equal(state.noteCustodyOnDevice, false); assert.equal(state.nativeEffectsEstablished, false);
      const details = nativeValueAccountManualNoteDetails(approval);
      for (const value of [details.body.requestId, details.body.ownerOperationRef, account.config.lifetime, descriptor.pairingId])
        assert.equal(JSON.stringify(state).includes(value), false);
      result.checks.genericMobileServiceWithoutBalances = true; return selected;
    }
    async function review(pairing, action) {
      pairing.setAction(action); const challenge = await pairing.api.challenge(action);
      assert.equal(Object.hasOwn(challenge, 'binding'), false);
      const ticket = pairing.lease.begin(), access = pairing.lease.finishAccess(ticket, challenge);
      const selected = await pairing.lease.openReview(access.lease, {
        sign: value => signDeviceMessage(deviceKey, originalAccountAccessMessageV2(value)), post: value => pairing.api.openReview(value) });
      const original = nativeValueAccountManualNoteDetails(pairing.approval);
      assert.equal(selected.value.binding.requestId, original.body.requestId); assert.equal(selected.value.binding.kind, original.body.kind);
      assert.equal(selected.value.binding.termsSHA256, original.review.termsSHA256);
      assert.equal(selected.value.binding.originalAccountLifetime, account.config.lifetime);
      assert.equal(selected.value.binding.amountAtomic, '500'); assert.equal(selected.value.action, action);
      return selected;
    }
    const signature = value => signDeviceMessage(deviceKey, originalAccountReviewMessageV2(value));
    async function diagnostic(pairing, action, lostReply = false) {
      const before = await effectCounts(), selected = await review(pairing, action);
      const post = value => pairing.api.submit(value);
      let completed = null, originalSessionAdmission = null, originalSessionRequest = null;
      if (lostReply) {
        assert.equal(action, 'reconcile'); const beforeJournal = await joined.session.snapshot();
        pairing.loseNextDiagnosticReply();
        await assert.rejects(pairing.lease.submit(selected.lease, { sign: signature, post }), /HTTP_REPLY_LOST_BEFORE_API/);
        const loss = pairing.replyLoss(); assert.ok(loss);
        assert.equal(loss.diagnosticsPostsAfter, loss.diagnosticsPostsBefore + 1);
        assert.equal(pairing.diagnosticsPosts(), loss.diagnosticsPostsAfter);
        const journal = await joined.session.idle();
        const earlier = new Set(beforeJournal.admissions.map(row => row.sequence));
        const admitted = journal.admissions.filter(row => !earlier.has(row.sequence));
        assert.equal(admitted.length, 1); originalSessionAdmission = admitted[0];
        assert.equal(originalSessionAdmission.action, 'reconcile');
        assert.equal(originalSessionAdmission.requestId, selected.value.binding.requestId);
        assert.equal(originalSessionAdmission.state, 'SUCCEEDED'); assert.equal(originalSessionAdmission.errorCode, null);
        originalSessionRequest = journal.requests.find(row => row.requestId === selected.value.binding.requestId);
        assert.equal(originalSessionRequest.state, 'CONFIRMED'); result.mobileHttpReplyLoss = loss;
      } else {
        completed = await pairing.lease.submit(selected.lease, { sign: signature, post });
        assert.equal(completed.binding.requestState, 'CONFIRMED'); assert.equal(completed.binding.authorityStage, 'CONFIRMED');
        assert.equal(completed.economicObservation, null); assert.equal(completed.privatePortfolio, null);
        if (action === 'reconcile') assert.equal(completed.admission.state, 'SUCCEEDED');
      }
      await assert.rejects(pairing.lease.submit(selected.lease, { sign: signature, post }), /REVIEW_INACTIVE/);
      await assert.rejects(pairing.api.submit({ review: selected.value, signature: signature(selected.value) }), /SERVICE_UNAVAILABLE/);
      assert.deepEqual(await effectCounts(), before);
      result.mobileRequests.push({ requestId: selected.value.binding.requestId, action,
        binding: completed?.binding ?? null, admission: completed?.admission ?? null,
        originalSessionAdmission, originalSessionRequest, originalHttpReplyLost: lostReply,
        consumedLeaseRejected: true, originalServerReplayRejected: true, noNewProofOrSend: true,
        transport: 'SIGNED_HTTPS_DESCRIPTOR_TRANSLATED_TO_OWNED_LOOPBACK_NO_TLS' });
      result.checks.mobileOriginalHttpAndNobleSignatures = true;
      result.checks.mobileReadAndReconcileOnlyAlreadyAdmitted = true;
      result.checks.consumedMobilePermissionRejected = true;
      if (lostReply) result.checks.originalMobileHttpReplyLostOnceNoRetry = true; save(); return selected;
    }
    async function mobileStateRead(pairing, note, available) {
      const before = await effectCounts(), journalBefore = await joined.session.snapshot();
      pairing.setAction('read');
      const challenge = await pairing.api.privateState.challenge();
      const access = pairing.lease.finishAccess(pairing.lease.begin(), challenge);
      const reviewed = await pairing.lease.openReview(access.lease, {
        sign: value => signDeviceMessage(deviceKey, privateStateAccessMessageV1(value)),
        post: value => pairing.api.privateState.openReview(value) });
      const observation = await pairing.lease.submit(reviewed.lease, {
        sign: value => signDeviceMessage(deviceKey, privateStateReviewMessageV1(value)),
        post: value => pairing.api.privateState.submit(value) });
      assert.equal(observation.status, 'LIVE'); assert.equal(observation.balances.available, available);
      assert.equal(observation.binding.requestId, note.requestId);
      assert.equal(observation.binding.submission.transactionHash, bare(note.transactionHash));
      assert.equal(observation.request.state, 'CONFIRMED'); assert.equal(observation.request.disposition, 'APPLIED');
      assert.deepEqual(observation.balances, note.observedOwnerView.balances);
      assert.deepEqual(observation.backing, note.observedOwnerView.backing);
      assert.equal(observation.completePortfolio, false); assert.equal(observation.mobileNoteCustody, false);
      const after = await effectCounts(), journalAfter = await joined.session.snapshot();
      assert.deepEqual(after, before); assert.equal(journalAfter.revision, journalBefore.revision);
      assert.equal(journalAfter.admissions.length, journalBefore.admissions.length);
      result.mobileStateReads.push({ observation, before, after, journalRevisionBefore: journalBefore.revision,
        journalRevisionAfter: journalAfter.revision, admissionsBefore: journalBefore.admissions.length,
        admissionsAfter: journalAfter.admissions.length,
        transport: 'SIGNED_HTTPS_DESCRIPTOR_TRANSLATED_TO_OWNED_LOOPBACK_NO_TLS' }); save();
    }
    async function notePreparation(kind, requestId) {
      const proposal = { requestId, kind, ...(kind === 'TOP_UP' ? { amount: '500', exitRecipient: bare(runtime.accounts[3]) } : { role: 'source' }) };
      const before = await owner.publicView.summary(), reviewed = await preparation.review(proposal);
      assert.equal(reviewed.amount, '500'); assert.equal(reviewed.kind, kind);
      for (const name of ['keyScopeSHA256', 'processIdentitySHA256', 'processGeneration']) assert.equal(reviewed[name], before[name]);
      const body = await preparation.confirm(); assert.deepEqual(body, reviewed.request);
      const approval = preparation.originalApproval(body.requestId); assert.deepEqual(joined.bindManualNote(approval), body);
      await driver.account('prepare', body); result.checks.originalNativeNoteConsentAndExactHttp = true; return { body, approval };
    }
    if (deviceDeposit) {
      await runDeviceOwnerDepositOriginalStepV1({ account, owner, runtime, nativeRuntime, system, reader, joined, result, pairs,
        privateDirectory, stage, save, active, notePreparation, fromApp, deviceKey, retainedProofs, proofRetained: waitOriginalProof });
      await audit(); result.success = true;
    } else {
    const setupTransactions = runtime.transactions.length;
    const payerBefore = await runtime.balance(runtime.accounts[0]), recipientBefore = await runtime.balance(runtime.accounts[3]);
    const nativeBalancesBefore = await Promise.all(nativeRuntime.accounts.map(value => nativeRuntime.balance(value)));
    await stage('genuine-D26-top-up-with-original-HTTP-reply-loss');
    const topUp = await notePreparation('TOP_UP', PAIRED_NATIVE_NOTE_ECONOMICS_V2.topUpRequestId);
    const first = await pair(topUp.approval), lost = await driver.executeAccountWithLostReply({ requestId: topUp.body.requestId });
    assert.equal(lost.loss.executeHttpRequests, 1); assert.equal(lost.loss.discardedActualAdmissionReply, true);
    assert.equal(lost.loss.sdkReportedUnknown, true); result.topUpAdmissionLoss = lost.loss;
    result.checks.originalTopUpAdmissionReplyLostOnce = true;
    result.notes.push(await observedNote(topUp.body, '500', 'deposit_balance'));
    result.checks.genuineTopUpReceiptAndBacking = true;
    const disclosureEffectsBefore = await effectCounts(), unsigned = await first.api.challenge('read');
    const unsignedCallsBefore = first.calls();
    await assert.rejects(first.api.openReview({ challenge: unsigned, signature: '0'.repeat(128) }), /SIGNATURE_NONCANONICAL/);
    assert.equal(first.calls(), unsignedCallsBefore, 'PAIRED_NOTE_NONCANONICAL_SIGNATURE_MUST_NOT_POST');
    const forbidden = await first.api.challenge('read'), forbiddenCallsBefore = first.calls();
    const unpairedDeviceKey = new Uint8Array(32).fill(12);
    try {
      assert.notEqual(devicePublicKey(unpairedDeviceKey), publicKey, 'PAIRED_NOTE_DISTINCT_UNPAIRED_DEVICE_REQUIRED');
      const signature = signDeviceMessage(unpairedDeviceKey, originalAccountAccessMessageV2(forbidden));
      await assert.rejects(first.api.openReview({ challenge: forbidden, signature }), /SERVICE_UNAVAILABLE/);
      assert.equal(first.calls(), forbiddenCallsBefore + 1, 'PAIRED_NOTE_UNPAIRED_SIGNATURE_REJECTED_BY_ORIGINAL_HTTP');
    } finally { unpairedDeviceKey.fill(0); }
    assert.deepEqual(await effectCounts(), disclosureEffectsBefore);
    result.checks.mobileUnsignedDisclosureRejected = true;
    await stage('real-mobile-signed-original-read-and-reconcile');
    await diagnostic(first, 'read'); await diagnostic(first, 'reconcile', true); await diagnostic(first, 'read');
    await mobileStateRead(first, result.notes[0], '500');
    const stale = await review(first, 'read'), restartBefore = await owner.publicView.summary(), effectsBefore = await effectCounts();
    const checkpointBefore = checkpoints.at(-1); assert.ok(checkpointBefore);
    assert.equal(checkpointBefore.pending, null); assert.equal(checkpointBefore.version, 1);
    assert.equal(checkpointBefore.identitySHA256, restartBefore.identitySHA256);
    const lifetime = account.config.lifetime; await owner.suspend();
    const unavailable = await account.ownerView(); assert.equal(unavailable.status, 'UNAVAILABLE'); assert.equal(unavailable.balances, null);
    const suspended = owner.report(); assert.equal(suspended.childExited, true); await owner.restart();
    const restartAfter = await owner.publicView.summary();
    for (const name of ['identitySHA256', 'keyScopeSHA256', 'processIdentitySHA256']) assert.equal(restartAfter[name], restartBefore[name]);
    assert.equal(restartAfter.processGeneration, restartBefore.processGeneration + 1);
    const checkpointAfter = checkpoints.at(-1);
    assert.deepEqual(checkpointAfter, checkpointBefore, 'PAIRED_NOTE_RESTART_CHECKPOINT_CHANGED');
    validateOriginalAccountFreshV2(stale.value, Date.now());
    await assert.rejects(first.api.submit({ review: stale.value, signature: signature(stale.value) }), /SERVICE_UNAVAILABLE/);
    first.lease.invalidate(); assert.deepEqual(await effectCounts(), effectsBefore);
    result.ownerRestart = { sameOriginalOwnerCapability: true, childExited: suspended.childExited,
      before: restartBefore, after: restartAfter, accountLifetimeBefore: lifetime, accountLifetimeAfter: account.config.lifetime,
      checkpointBefore, checkpointAfter,
      checkpointBeforeSHA256: hash(JSON.stringify(checkpointBefore)), checkpointAfterSHA256: hash(JSON.stringify(checkpointAfter)),
      oldSignedReviewRejected: true, newOriginalKeyCreated: false };
    result.checks.ownerChildRestartPreservedScopeAndCheckpoint = true;
    result.checks.oldMobileReviewRejectedAfterOwnerRestart = true;
    await diagnostic(first, 'read'); await diagnostic(first, 'reconcile');
    await observedNote(topUp.body, '500', 'deposit_balance'); result.checks.freshOriginalObservationAfterRestart = true;
    await stage('genuine-W39-original-source-exit-and-mobile-diagnostics');
    const exit = await notePreparation('EXIT', PAIRED_NATIVE_NOTE_ECONOMICS_V2.exitRequestId);
    await driver.account('execute', { requestId: exit.body.requestId });
    result.notes.push(await observedNote(exit.body, '0', 'withdraw_balance'));
    result.checks.genuineSourceExitReceiptAndBacking = true;
    const second = await pair(exit.approval), cross = await review(first, 'read');
    await assert.rejects(second.api.submit({ review: cross.value, signature: signature(cross.value) }), /REVIEW_CHANGED/);
    first.lease.invalidate(); result.checks.crossRequestMobilePermissionRejected = true;
    await diagnostic(second, 'read'); await diagnostic(second, 'reconcile');
    await mobileStateRead(second, result.notes[1], '0');
    const duplicateBefore = await effectCounts();
    for (const requestId of [topUp.body.requestId, exit.body.requestId]) {
      await driver.duplicateAccountExecute(requestId); await driver.account('reconcile', { requestId });
    }
    assert.deepEqual(await effectCounts(), duplicateBefore); result.checks.duplicateNoteRequestsNoProofOrSend = true;
    assert.equal(nativeRuntime.transactions.length, 0);
    assert.deepEqual(await Promise.all(nativeRuntime.accounts.map(value => nativeRuntime.balance(value))), nativeBalancesBefore);
    result.checks.nativeBootstrapRuntimeUntouched = true;
    const final = await reader.read(), ownerView = await account.ownerView(); await reader.assertCurrent(final);
    const deposits = runtime.transactions.filter(row => row.label === 'flat-account-deposit');
    const exits = runtime.transactions.filter(row => row.label === 'flat-account-withdraw_source');
    assert.equal(deposits.length, 1); assert.equal(exits.length, 1);
    assert.equal(runtime.transactions.length, setupTransactions + 2, 'PAIRED_NOTE_UNEXPECTED_FINANCIAL_SEND');
    const gasCost = result.notes.reduce((sum, note) => sum + BigInt(note.receipt.gasUsed) * BigInt(note.receipt.effectiveGasPrice), 0n);
    result.economics = { setupTransactions, finalReceiverTransactions: runtime.transactions.length, nativeBootstrapTransactions: nativeRuntime.transactions.length,
      depositTransactions: deposits.length, exitTransactions: exits.length,
      recipientDeltaAtomic: String((await runtime.balance(runtime.accounts[3])) - recipientBefore),
      payerDeltaAtomic: String(payerBefore - (await runtime.balance(runtime.accounts[0]))), totalObservedGasCostAtomic: String(gasCost),
      finalBacking: ownerView.backing, finalOwnerAvailableAtomic: ownerView.balances.available,
      finalPoolActualAtomic: final.ledger.publicState.actualAssetBalance, finalPoolBackedAtomic: final.ledger.publicState.backedAmount,
      finalSpentCount: final.ledger.publicState.spent };
    assert.deepEqual(result.proofs.map(row => row.relation), ['deposit_balance', 'withdraw_balance']);
    result.checks.exactTwoFreshOriginalProofReceipts = true; result.walletHttpEvidence = driver.evidence();
    await audit(); result.pairedOriginalAccountNodeAcceptance = true;
    result.pairedOriginalPrivateStateReadNodeAcceptance = true; result.success = true;
    }
  } catch (error) {
    result.failedStage = result.phase; result.phase = 'failed'; result.success = false; result.errorCode = safeCode(error);
    writeFixturePrivate(join(privateDirectory, 'error.json'), { diagnostic: privateFailureDiagnostic(error), stack: String(error.stack ?? error) });
    await audit().catch(() => {});
  } finally {
    try { await close(); } catch (error) { result.cleanup.errors.push({ name: 'final-cleanup', code: safeCode(error) });
      result.success = false; result.errorCode ??= safeCode(error); }
    process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt);
    try { assert.deepEqual(await sourcePins(), result.sourcePins); result.sourceUnchanged = true;
      result.checks.originalSourcesUnchanged = true; }
    catch { result.sourceUnchanged = false; result.success = false; result.errorCode ??= 'PAIRED_NOTE_SOURCE_CHANGED'; }
    result.finishedAt = new Date().toISOString(); result.elapsedMilliseconds = performance.now() - began;
    result.phase = result.success && !interrupted ? 'completed' : 'failed';
    if (result.success) try {
      if (deviceDeposit) assertDeviceDepositResultV1(result); else assertPairedNativeNoteResultV2(result);
    }
    catch (error) { result.success = false; result.phase = 'failed'; result.errorCode = safeCode(error); }
    save(); if (!result.success) process.exitCode = 1;
  }
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === HERE)
  runPairedNativeNoteFlowV2().catch(error => { process.stderr.write(safeCode(error) + '\n'); process.exitCode = 1; });
