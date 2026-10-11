/** First actual flat U/S/P/R/I/N/T/F vertical, on owned disposable fake-value
 * chains only. The private keeper deliberately sees the schedule and retains
 * custody passwords. This is not hostile-host isolation or public finality.
 * Run only through run-native-flow.mjs after saving the exact source checkpoint.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, realpathSync, mkdirSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEvm } from '@lianum/engine/execution/local/local-evm';
import { createNativeRecipientProcess } from '../../../packages/backend/src/execution/native/recipients/native-recipient-process.mjs';
import { createProofProcess } from '@lianum/proofs/execution/proof-process';
import { walletInputPublicWords } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { noteWordsToHash } from '@lianum/engine/notes/private-note-tree';
import { PrivateNoteTree } from '@lianum/engine/notes/private-note-tree';
import { nativeAdmissionRulesTree, NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { createOwnedFlatBitcoinRuntime } from '../../../packages/backend/src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { createOwnedSolanaCohortRuntime, base58Decode } from '../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import { deployFlatSystem } from '../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { createLocalFlatOperator, createFlatOperatorQuorum } from '../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createFlatSystemStateReader } from '../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createFlatOwnerProcess } from '../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { createOwnedFlatNativeProvider } from '../../../packages/backend/src/providers/native-provider.mjs';
import { reservationWitness, recoveryWitness } from '../../../packages/backend/src/execution/account/preparation/funding-inputs.mjs';
import { buildDependencyInputs, buildReadyInputs } from '../../../packages/backend/src/execution/account/preparation/readiness-inputs.mjs';
import { buildAdmissionInputs } from '../../../packages/backend/src/execution/account/preparation/admission-inputs.mjs';
import { buildNodeInputs, buildSettlementInputs } from '../../../packages/backend/src/execution/account/reconciliation/completion-inputs.mjs';
import { joinReadiness, joinAdmission, joinSettlement, FIELD_MODULUS } from '@lianum/components/encoding/statements';
import { encodeFlatTransaction } from '../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { createRoleProofClient } from '@lianum/backend/proving/roles/role-client';
import { ROOT, relation } from '@lianum/proofs/catalog';
import { loadPinned, resourceModuleURL, circuitIdentity, versionDirectory, loadCompiled, hash, regular } from '@lianum/proofs/tooling/tooling';
import { nativeFlowSourcePins } from '../runners/source-pins.mjs';

const fresh = () => randomBytes(32).toString('hex');
const bare = value => { assert.match(value, /^0x[0-9a-f]+$/); return value.slice(2); };
const prefixed = value => '0x' + value;
const packet = proof => ({ proof: proof.proof, publicInputs: [...proof.publicInputs] });
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const safeCode = error => String(error?.code ?? error?.message ?? '').match(/^[A-Z][A-Z0-9_]{2,160}$/)?.[0] ?? 'FLAT_NATIVE_FLOW_FAILED';
function privateWrite(file, value) {
  const fd = openSync(file, 'w', 0o600);
  try { writeFileSync(fd, stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(resolve(file, '..'), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
}
const shaPath = path => ({ root: bare(path.root), index: path.index, siblings: path.siblings.map(bare) });
const fieldPath = path => ({ root: path.root, index: path.index, siblings: [...path.siblings] });
const leafPath = path => ({ leaf: bare(path.leaf), index: path.index, siblings: path.siblings.map(bare) });
const fieldLeafPath = path => ({ leaf: path.leaf, index: path.index, siblings: [...path.siblings] });
function notePath(view, commitment) {
  const index = view.ledger.commitments.indexOf(prefixed(commitment));
  assert.ok(index >= 0, 'FLAT_FLOW_NOTE_NOT_INCLUDED'); return view.ledger.tree.path(index);
}
function receiptPath(view, leaf) {
  const index = view.receiptLeaves.indexOf(leaf); assert.ok(index >= 0, 'FLAT_FLOW_RECEIPT_NOT_INCLUDED');
  return fieldPath(view.receiptTree.path(index));
}

/** Hashing private openings stays on this trusted local keeper, never eth_call.
 * Release the small hash instance before starting each large proof process. */
async function withHash(work) {
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length <= 137, 'FLAT_FLOW_HASH_WIDTH');
      const inputs = fields.map(value => { assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS);
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex'); });
      return Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
    });
  } finally { await backend?.destroy(); }
}

async function main() {
  assert.equal(realpathSync(process.argv[1]), fileURLToPath(import.meta.url));
  assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
  assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
  assert.equal(process.env.LANG, 'C.UTF-8'); assert.equal(process.env.PATH, '/usr/bin:/bin');
  const parent = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  assert.equal(parent.length, 2); assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parent[1])),
    join(ROOT, 'integration/run-native-flow.mjs'));
  const lock = JSON.parse(regular(join(ROOT, '.local/native-flow/active.lock')));
  assert.equal(lock.pid, process.ppid, 'FLAT_FLOW_OWNED_SUPERVISOR');
  assert.match(lock.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'FLAT_FLOW_UNIQUE_RUN_ID');
  const directory = join(ROOT, '.local/native-flow', `attempt-${lock.runId}`);
  assert.equal(lock.attempt, '.local/native-flow/attempt-' + lock.runId, 'FLAT_FLOW_OWNED_ATTEMPT');
  const privateDirectory = join(directory, 'private-audit'); mkdirSync(privateDirectory, { mode: 0o700 });
  const proofDirectory = join(directory, 'public-proofs'); mkdirSync(proofDirectory);
  const started = performance.now();
  const result = { format: 'FLAT_WALLET_NATIVE_FLOW_RESULT_V1', phase: 'starting', success: false,
    runId: lock.runId, startedAt: new Date().toISOString(), localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: process.ppid, workerPID: process.pid }, sourcePins: nativeFlowSourcePins(),
    fullWalletAcceptance: false, independentOperators: false, systemicPrivacyAcceptance: false,
    realClockDeadlineAcceptance: false, performanceTargetAchieved: false,
    disclosure: [
      'Fresh owned Anvil, Bitcoin regtest and Agave. EVM inclusion clock is deliberately controlled.',
      'Three synthetic one-key observers run on one common trusted host, not independent native consensus validators.',
      'Private keeper retains schedule and custody passwords; this does not establish hostile-host or metadata privacy.',
      'The bounded generic flat relation has four slots. Different order/count needs no circuit combination, but this run is one BTC-to-SOL schedule.',
      'No seven-chain, DeFi, mobile self-custody, external audit or total-overhead performance acceptance is claimed.',
    ], stages: [], proofs: [], transactions: [], nativeEffects: { bitcoin: 0, solana: 0 },
    cleanup: { closedEvm: false, closedBitcoin: false, closedSolana: false } };
  // This owned attempt has a separate scope from the proof-artifact writer.
  // Atomic replace + directory fsync keeps the latest stage durable and does
  // not widen the proof worker's output allowlist.
  const save = () => {
    assert.equal(realpathSync(directory), directory, 'FLAT_FLOW_RESULT_DIRECTORY');
    const temporary = join(directory, 'result-' + fresh() + '.tmp');
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, stringify(result)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, join(directory, 'result.json'));
    const parentFd = openSync(directory, 'r'); try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
  };
  const stage = name => { result.phase = name; result.stages.push({ name, at: new Date().toISOString(), elapsedMilliseconds: performance.now() - started });
    save(); process.stdout.write(JSON.stringify({ stage: name }) + '\n'); };
  let evm, bitcoin, solana, system, reader, owner, quorum, terminalError, stopping = false;
  const operators = [], providers = [], recipients = [], recipientBoots = [], activeProofs = new Set();
  const abis = {}, receiptRecords = [], rolePackets = {};
  const audit = async () => {
    if (evm) {
      privateWrite(join(privateDirectory, 'evm.json'), { metadata: evm.metadata, transactions: evm.transactions, receipts: evm.receipts });
      result.transactions = evm.receipts.map(item => ({ label: item.label, transactionHash: item.receipt.transactionHash,
        blockHash: item.receipt.blockHash, status: item.receipt.status, gasUsed: item.gasUsed }));
    }
    if (bitcoin || solana) {
      privateWrite(join(privateDirectory, 'native.json'), { bitcoin: bitcoin?.transfers ?? [], solana: solana?.transfers ?? [],
        bitcoinMetadata: bitcoin?.metadata, solanaMetadata: solana?.metadata });
      result.nativeEffects = { bitcoin: bitcoin?.transfers.length ?? 0, solana: solana?.transfers.length ?? 0 };
    }
    save();
  };
  const cleanup = async () => {
    for (const proof of activeProofs) proof.stop?.();
    await Promise.allSettled([...activeProofs].map(proof => proof.abort?.()).filter(Boolean));
    for (const provider of providers) { try { await provider.close(); } catch {} }
    for (const recipient of recipients) { try { await recipient.close(); } catch {} }
    try { if (owner) result.ownerFinalLifecycle = await owner.close(); } catch {}
    for (const operator of operators) { try { await operator.close(); } catch {} }
    for (const [name, runtime] of [['closedSolana', solana], ['closedBitcoin', bitcoin], ['closedEvm', evm]]) {
      try { const status = await runtime?.close(); result.cleanup[name] = runtime ? true : null;
        result.cleanup[name + 'Status'] = status ?? null; } catch (error) { result.cleanup[name] = false; result.cleanup[name + 'Error'] = safeCode(error); }
    }
  };
  const interrupt = () => { if (stopping) return; stopping = true;
    result.interruption = { at: new Date().toISOString(), stage: result.phase }; result.success = false;
    void audit().catch(() => {}).then(cleanup).finally(() => { result.phase = 'failed'; result.errorCode = 'FLAT_FLOW_INTERRUPTED_OUTCOME_REQUIRES_RECONCILIATION'; save(); process.exit(2); }); };
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
  function retainProof(label, relationName, proof) {
    const bytes = Buffer.from(proof.proof, 'hex');
    const file = `${String(result.proofs.length + 1).padStart(3, '0')}-${label}`;
    writeFileSync(join(proofDirectory, file + '.bin'), bytes, { flag: 'wx' });
    writeFileSync(join(proofDirectory, file + '.inputs.json'), stringify(proof.publicInputs), { flag: 'wx' });
    result.proofs.push({ label, relation: relationName, file, proofSHA256: hash(bytes), publicInputsSHA256: hash(stringify(proof.publicInputs)),
      evidence: proof.evidence ?? proof.metrics }); save();
  }
  async function prove(name, job, label) {
    const client = createRoleProofClient(relation(name).role); activeProofs.add(client);
    try { stage('prove-' + label); const proof = await client.prove({ relation: name, inputs: job.inputs,
      expectedPublicInputs: job.expectedPublicInputs ?? job.publicInputs }); retainProof(label, name, proof); return packet(proof); }
    finally { client.close(); activeProofs.delete(client); }
  }
  async function proveLegacy(mode, witness, expected, label, purpose) {
    const client = createProofProcess({ purpose, modes: [mode] }); activeProofs.add(client);
    try { stage('prove-' + label); const proof = await client.prove(mode, witness, expected, label);
      const converted = { proof: Buffer.from(proof.proof).toString('hex'), publicInputs: [...proof.publicInputs], metrics: proof.metrics };
      retainProof(label, mode, converted); return packet(converted); }
    finally { await client.close(); activeProofs.delete(client); }
  }
  async function ownedSubmit(kind, data, value = '0') {
    const binding = await owner.owner.bindSubmission({ kind, calldata: data });
    assert.equal(binding.dispatchAllowed, true, 'FLAT_FLOW_OWNER_DISPATCH_ONCE');
    const receipt = await evm.send('owner-' + kind, { to: system.pools[0].address, data, value });
    await owner.owner.acknowledgeSubmitted({ kind, transactionHash: bare(receipt.transactionHash) });
    const reconciled = await owner.owner.reconcile({ kind });
    await audit(); return { receipt, reconciled };
  }
  async function checkpoint() {
    const permit = await quorum.checkpoint({ poolIndex: 0, requestId: fresh() });
    const message = permit.message;
    const data = encodeFlatTransaction('recordCheckpoint', { pool: system.pools[0].address,
      expectedPoolSequence: message.expectedPoolSequence, expectedHubStateSequence: message.expectedHubStateSequence,
      requestId: message.requestId, validUntil: message.validUntil, signatures: permit.abiSignatures });
    await evm.send('record-current-checkpoint', { to: system.hub.address, data });
    const view = await reader.read(); const recorded = view.checkpoints[view.checkpoints.length - 1];
    assert.equal(recorded.snapshot.pool, system.pools[0].address); return { view, recorded };
  }
  function healthRequest(permit) {
    return { healthFrom: permit.message.validFrom, healthUntil: permit.message.validUntil, healthSignatures: permit.abiSignatures };
  }

  try {
    stage('authenticate-existing-artifacts');
    const helpers = await import(resourceModuleURL), toolchain = helpers.verifyToolchain();
    for (const name of ['reservation', 'dependency', 'ready', 'admission', 'node', 'settlement', 'recovery']) {
      const spec = relation(name), identity = circuitIdentity(spec, toolchain), sourceVersion = hash(JSON.stringify(identity));
      const compiled = await loadCompiled({ spec, identity, sourceVersion, toolchain, directory: versionDirectory(spec, sourceVersion) });
      abis[name] = compiled.program.abi;
    }
    stage('start-owned-local-runtimes');
    evm = await createLocalEvm(); bitcoin = await createOwnedFlatBitcoinRuntime(); solana = await createOwnedSolanaCohortRuntime();
    const rules = [
      { family: '1', genesis: bitcoin.genesis, asset: hash('LIANUM/registered-native-asset/BTC/1'),
        finalityKind: '1', minimumConfirmations: '6', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
      { family: '2', genesis: base58Decode(solana.genesis, 32).toString('hex'), asset: hash('LIANUM/registered-native-asset/SOL/1'),
        finalityKind: '2', minimumConfirmations: '0', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
    ];
    const rulesTree = nativeAdmissionRulesTree(rules);
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    stage('deploy-actual-flat-ledgers-and-verifiers');
    system = await deployFlatSystem(evm, { deploymentDomain: prefixed(fresh()), registryEpoch: '1',
      rulesRoot: prefixed(rulesTree.root), attesterKeys: operators.map(operator => operator.publicKey),
      pools: [0, 1].map(() => ({ policy: prefixed(fresh()), deploymentDomain: prefixed(fresh()) })),
      onDeployment: async () => audit() });
    result.deployed = { hub: system.hub.address, pools: system.pools.map(pool => pool.address),
      verifierSetCommitment: system.verifierSetCommitment, ledgerNamespace: system.ledgerNamespace,
      verifiers: Object.fromEntries(Object.entries(system.verifiers).map(([name, entry]) => [name, { address: entry.address, codeHash: entry.codeHash }])) };
    for (const operator of operators) await operator.bind({ runtime: evm, system, bitcoin, solana, rules, rulePaths: rulesTree.paths });
    quorum = createFlatOperatorQuorum({ operators: operators.slice(0, 3) });
    reader = await createFlatSystemStateReader({ runtime: evm, system, poolIndex: 0 });
    const pool = system.pools[0], domain = pool.domain;
    const ownerDirectory = join(privateDirectory, 'owner'); mkdirSync(ownerDirectory, { mode: 0o700 });
    owner = await createFlatOwnerProcess({ runtime: evm, system, poolIndex: 0, directory: ownerDirectory,
      password: fresh(), create: true, checkpoint: null,
      onCheckpoint: async value => privateWrite(join(ownerDirectory, 'checkpoint.json'), value) });
    stage('fund-one-private-balance');
    await owner.owner.prepareDeposit({ amount: '50000', epoch: String((await evm.time()) / 600n), exitRecipient: bare(evm.accounts[3]) });
    const depositJob = await owner.ownerProof.deposit();
    const deposit = await proveLegacy('deposit_balance', depositJob.inputs, depositJob.publicInputs, 'original-balance-deposit', 'owner');
    await ownedSubmit('deposit', encodeFlatTransaction('depositBalance', deposit), '50000');
    const funded = await reader.read(); assert.equal(funded.ledger.publicState.backedAmount, '50000');
    result.fundingConfirmed = true; save();

    const now = await evm.time(), cutoff = now + 28_800n, operationId = fresh();
    const terms = { scope: domain.scope, policy: domain.policy, asset: domain.asset,
      executionFrom: String(now), executionUntil: String(cutoff - 60n), settleBefore: String(cutoff) };
    const amounts = ['100000', '3000000'], offers = [];
    stage('prepare-two-dependent-private-actions');
    for (let slot = 0; slot < 2; slot++) {
      const directory = join(evm.metadata.scratchDirectory, 'flat-provider-' + slot); mkdirSync(directory, { mode: 0o700 });
      const provider = await createOwnedFlatNativeProvider({ runtime: evm, system, poolIndex: 0,
        nativeRuntime: slot === 0 ? bitcoin : solana, rule: rules[slot], rulePath: rulesTree.paths[slot], recipientIndex: 0,
        terms: { ...terms, amount: amounts[slot] }, acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE,
        operatorQuorum: quorum, directory, password: fresh() }); providers.push(provider);
      const offer = provider.offer();
      const boot = { mode: 'create', path: join(privateDirectory, 'recipient-' + slot + '.vault'), password: fresh(),
        expectedTerms: { scope: terms.scope, policy: terms.policy, asset: terms.asset,
          hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, operationId, slot,
          evidencePolicy: offer.evidencePolicy, value: '10000', settleBefore: String(cutoff), actionTemplate: offer.actionTemplate },
        withdrawalRecipient: bare(evm.accounts[slot + 1]) };
      recipientBoots.push(boot); const recipient = await createNativeRecipientProcess(boot); recipients.push(recipient);
      offers.push({ provider: offer, payout: await recipient.offer() });
    }
    await owner.owner.prepareAuthorization({ changeRecipient: bare(evm.accounts[3]), recoveryRecipient: bare(evm.accounts[3]),
      nativeConfig: { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(key => [key, domain[key]])),
        operationId, fundingNotBefore: String(now), fundingValidUntil: String(now + 7200n), settleBefore: String(cutoff),
        nodes: offers.map((offer, slot) => { const { settleBefore: _cutoff, ...actionTemplate } = offer.provider.actionTemplate;
          return { id: 'leg-' + slot, dependsOn: slot ? ['leg-0'] : [], evidencePolicy: offer.provider.evidencePolicy,
            actionTemplate, recipientOffer: offer.payout }; }) } });
    const invoiceSignatures = [];
    for (const invoice of await owner.owner.invoiceRequests()) {
      invoiceSignatures.push((await recipients[invoice.slot].acceptInvoice(invoice.invoice)).invoiceSignature);
      await providers[invoice.slot].bindQuote({ recipientCustody: recipients[invoice.slot] });
    }
    const authorizationStatement = await owner.owner.authorize({ invoiceSignatures });
    stage('prove-owner-envelope-on-owner-side');
    const ownerProof = await owner.ownerProof.proveAuthorization(); retainProof('owner-envelope', 'authorization', ownerProof);
    const authorization = packet(ownerProof);
    for (const name of ['reservation', 'recovery', 'assembler']) rolePackets[name] = (await owner.roles[name]()).select();
    rolePackets.local = []; rolePackets.dependency = [];
    for (let slot = 0; slot < 4; slot++) {
      rolePackets.local.push((await owner.roles.local(slot)).select());
      rolePackets.dependency.push((await owner.roles.dependency(slot)).select());
    }
    const beforeReserve = await reader.read(), funding = rolePackets.reservation.funding.value;
    const reservationJob = await withHash(hashFields => reservationWitness(rolePackets.reservation,
      { inputRoot: bare(beforeReserve.ledger.tree.root), inputPath: leafPath(notePath(beforeReserve, funding.inputCommitment)) }, { hashFields }));
    const reservation = await prove('reservation', reservationJob, 'funded-reservation');
    const projected = new PrivateNoteTree(beforeReserve.ledger.commitments);
    projected.append(prefixed(funding.reserveCommitment)); projected.append(prefixed(funding.changeCommitment));
    await ownedSubmit('reservation', encodeFlatTransaction('reserveGenericGuarded', { authorization, reservation,
      expectedSequence: beforeReserve.ledger.publicState.sequence, expectedPostRoot: projected.root }));
    assert.equal((await reader.read()).ledger.publicState.liveReservations, 1);
    result.reservationConfirmed = true;
    result.ownerStoppedBeforeFirstNative = await owner.suspend();
    assert.equal(owner.report().childExited, true); assert.equal(owner.report().available, false); save();

    // A scoped dependency actor gets predecessor ReceiptRead openings only;
    // the target local actor retains its own secret, never predecessor secrets.
    for (let slot = 0; slot < 2; slot++) {
      stage('prepare-causal-leg-' + slot);
      const { view, recorded } = await checkpoint();
      const authPath = await reader.authorizationPath(view, authorizationStatement.envelope);
      const authorizationPath = fieldPath(authPath);
      const readyFrom = recorded.snapshot.timestamp, readyUntil = String(BigInt(readyFrom) + 7200n);
      const dependencyJob = await withHash(hashFields => buildDependencyInputs({ packet: rolePackets.dependency[slot],
        authorization: authorizationPath, snapshot: recorded.snapshot, readyFrom, readyUntil,
        predecessorReceipts: receiptRecords.map(receipt => ({ opening: receipt.opening, path: receiptPath(view, receipt.leaf) })),
        revokedEntries: view.revokedEntries }, { hashFields, abi: abis.dependency }));
      const readyJob = await withHash(hashFields => buildReadyInputs({ packet: rolePackets.local[slot],
        authorization: authorizationPath, snapshot: recorded.snapshot, readyFrom, readyUntil,
        reservePath: shaPath(notePath(view, rolePackets.local[slot].core.value.reserveCommitment)),
        poolSpentEntries: [...view.ledger.nullifiers.map(bare), ...Array(64 - view.ledger.nullifiers.length).fill('0'.repeat(64))],
        readinessBlind: fresh() }, { hashFields, abi: abis.ready }));
      joinReadiness(dependencyJob.statement, readyJob.statement);
      const dependency = await prove('dependency', dependencyJob, 'leg-' + slot + '-dependency');
      const readiness = await prove('ready', readyJob, 'leg-' + slot + '-readiness');
      const quote = await recipients[slot].acceptedQuote(), local = rolePackets.local[slot];
      stage('dispatch-native-leg-' + slot);
      const delivery = await providers[slot].execute({ dependencyProof: dependency, readyProof: readiness,
        readinessOpening: readyJob.admissionOpening, action: local.action,
        deliveryRiskSalt: quote.deliveryRiskSalt, receiptSpendSecret: local.receiptSpendSecret });
      privateWrite(join(privateDirectory, 'delivery-' + slot + '.json'), delivery); await audit();
      if (slot === 0) await bitcoin.confirm(delivery.nativeId);
      else assert.equal((await solana.observe(delivery.nativeId, { timeoutMs: 45_000 })).status, 'observed', 'FLAT_FLOW_SOL_FINALITY');
      const observed = await providers[slot].reconcile();
      assert.equal(observed.phase, 'OBSERVED', 'FLAT_FLOW_NATIVE_NOT_FINAL');
      result.nativeDelivery ??= []; result.nativeDelivery.push({ slot, family: rules[slot].family,
        ownerSuspended: owner.report().childExited && !owner.report().available, at: new Date().toISOString() }); save();
      stage('certify-and-admit-leg-' + slot);
      const facts = await quorum.facts({ family: rules[slot].family, recipientIndex: '0', nativeId: observed.nativeId,
        wireKeyCommitment: local.action.receiptKeyCommitment });
      const current = await reader.read();
      const checkpointIndex = current.checkpoints.findIndex(item => item.digest === readyJob.statement.checkpoint);
      assert.ok(checkpointIndex >= 0, 'FLAT_FLOW_RETAINED_CHECKPOINT');
      const fact = facts.certificates[0].facts, descriptor = readyJob.admissionOpening.descriptor;
      const opening = Object.fromEntries(['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment', 'dispatchId',
        'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(key => [key, descriptor[key]]));
      Object.assign(opening, { globalEffectId: fact.nativeGid, validFrom: fact.observation.evidenceFrom,
        validUntil: String(BigInt(fact.observation.evidenceUntil) < cutoff ? BigInt(fact.observation.evidenceUntil) : cutoff),
        receiptKeyCommitment: local.action.receiptKeyCommitment, receiptRho: local.action.receiptRho });
      const admissionJob = await withHash(hashFields => buildAdmissionInputs({ readyStatement: readyJob.statement,
        readinessOpening: readyJob.admissionOpening, action: local.action, receiptSpendSecret: local.receiptSpendSecret,
        receiptOpening: opening, checkpointOpening: fieldPath(current.checkpointTree.path(checkpointIndex)),
        registry: system.registry, rule: rules[slot], rulePath: rulesTree.paths[slot],
        provider: { publicKey: observed.providerKey, dispatchStatement: observed.dispatchStatement,
          signature: observed.dispatchSignature, deliveryRiskSalt: quote.deliveryRiskSalt }, certificates: facts.certificates,
        currentRevocation: { revokedDigest: current.state.revokedDigest, revokedCount: current.state.revokedCount,
          revocationSequence: current.state.revocationSequence, entries: current.revokedEntries },
        admissionFrom: opening.validFrom, admissionUntil: opening.validUntil }, { hashFields, abi: abis.admission }));
      joinAdmission(dependencyJob.statement, readyJob.statement, admissionJob.statement);
      const admission = await prove('admission', admissionJob, 'leg-' + slot + '-admission');
      const permit = await quorum.health({ poolIndex: 0 });
      await evm.send('admit-native-leg-' + slot, { to: system.hub.address,
        data: encodeFlatTransaction('admit', { pool: pool.address, dependency, readiness, admission, ...healthRequest(permit) }) });
      receiptRecords.push({ opening, leaf: admissionJob.statement.receiptLeaf, commitment: admissionJob.receiptCommitment });
      const admitted = await reader.read(); assert.equal(admitted.state.receiptCount, String(slot + 1));
      result.admittedLegs = slot + 1; await audit();
    }

    stage('assemble-four-scoped-completions');
    const finalView = await reader.read(), authPath = await reader.authorizationPath(finalView, authorizationStatement.envelope);
    const authorizationPath = fieldPath(authPath), period = { validFrom: finalView.head.timestamp, validUntil: String(cutoff) };
    const completions = [], completionOpenings = [];
    for (let slot = 0; slot < 4; slot++) {
      const receipt = receiptRecords[slot];
      const job = await withHash(hashFields => buildNodeInputs({ packet: rolePackets.local[slot], authorization: authorizationPath,
        stateOpening: finalView.stateOpening, evidenceState: finalView.evidenceState, revokedEntries: finalView.revokedEntries,
        receiptOpening: receipt?.opening ?? null, receiptPath: receipt ? receiptPath(finalView, receipt.leaf) : null,
        ...period, completionBlind: fresh() }, { hashFields, abi: abis.node }));
      completionOpenings.push(job.completionOpening); completions.push({ proof: await prove('node', job, 'slot-' + slot + '-completion'), statement: job.statement });
    }
    const settlementJob = await withHash(hashFields => buildSettlementInputs({ packet: rolePackets.assembler,
      authorization: authorizationPath, evidenceState: finalView.evidenceState,
      reservePath: shaPath(notePath(finalView, rolePackets.assembler.core.value.reserveCommitment)),
      completions: completionOpenings, ...period }, { hashFields, abi: abis.settlement }));
    joinSettlement(completions.map(item => item.statement), settlementJob.statement);
    const settlement = await prove('settlement', settlementJob, 'global-fulfillment');
    const permit = await quorum.health({ poolIndex: 0 });
    const fulfillData = encodeFlatTransaction('fulfillGeneric', { settlement, completions: completions.map(item => item.proof), ...healthRequest(permit) });
    stage('claim-global-fulfillment-owner-offline');
    await evm.send('flat-global-fulfillment', { to: pool.address, data: fulfillData });
    const settled = await reader.read();
    assert.equal(settled.ledger.publicState.liveReservations, 0); assert.equal(settled.ledger.publicState.backedAmount, '50000');
    assert.equal(settled.state.spentTagCount, '4'); assert.equal(owner.report().childExited, true); assert.equal(owner.report().available, false);
    result.actualGlobalClaim = { at: new Date().toISOString(), ownerSuspended: true, pool: settled.ledger.publicState, hub: settled.state };
    await audit(); process.stdout.write(JSON.stringify({ result: 'ACTUAL_FLAT_NATIVE_GLOBAL_CLAIM', at: result.actualGlobalClaim.at }) + '\n');
    await evm.send('reject-paid-fulfillment-replay', { to: pool.address, data: fulfillData }, '0x0', 'NOTE_ALREADY_SPENT');
    result.paidReplayRejected = true;

    // Restart each recipient from its encrypted original state only after the
    // actual claim. Its canonical note/nullifier and destination stay fixed.
    const balancesBefore = await Promise.all([1, 2, 3].map(index => evm.balance(evm.accounts[index])));
    for (let slot = 0; slot < 2; slot++) {
      stage('restart-and-exit-recipient-' + slot); await recipients[slot].close();
      const recipient = await createNativeRecipientProcess({ ...recipientBoots[slot], mode: 'recover' }); recipients[slot] = recipient;
      const status = await recipient.withdrawalStatus(), view = await reader.read();
      assert.ok(!view.ledger.nullifiers.includes(prefixed(status.canonicalNullifier)));
      const witness = await recipient.authorizeWithdrawal({ scope: status.scope, policy: status.policy,
        payoutCommitment: status.payoutCommitment, recipient: status.recipient, amount: status.amount,
        epoch: String(BigInt(view.head.timestamp) / 600n), path: notePath(view, status.payoutCommitment) });
      const words = walletInputPublicWords('withdraw_balance', witness);
      assert.equal(noteWordsToHash(words.slice(25, 33)), prefixed(status.canonicalNullifier));
      const withdrawal = await proveLegacy('withdraw_balance', witness, words, 'recipient-' + slot + '-exit', 'recipient');
      const data = encodeFlatTransaction('withdrawBalance', withdrawal);
      await evm.send('recipient-' + slot + '-withdraw', { to: pool.address, data });
      await evm.send('reject-recipient-' + slot + '-withdraw-replay', { to: pool.address, data }, '0x0', 'NOTE_ALREADY_SPENT');
      await audit();
    }
    stage('return-owner-and-exit-change'); await owner.restart();
    await owner.owner.prepareWithdrawal({ role: 'change', epoch: String((await evm.time()) / 600n) });
    const changeJob = await owner.ownerProof.withdrawal('change');
    const changeProof = await proveLegacy('withdraw_balance', changeJob.inputs, changeJob.publicInputs, 'owner-change-exit', 'owner');
    await ownedSubmit('withdraw_change', encodeFlatTransaction('withdrawBalance', changeProof));
    const balancesAfter = await Promise.all([1, 2, 3].map(index => evm.balance(evm.accounts[index])));
    assert.deepEqual(balancesAfter.map((value, index) => String(value - balancesBefore[index])), ['10000', '10000', '30000']);
    const exited = await reader.read(); assert.equal(exited.ledger.publicState.backedAmount, '0');
    assert.equal(exited.ledger.publicState.actualAssetBalance, '0'); assert.equal(exited.ledger.publicState.liveReservations, 0);
    result.recipientRestartAndExit = true; result.changeExit = true; result.finalPool = exited.ledger.publicState;
    stage('prove-original-refund-and-reject-already-paid-reserve');
    const recoveryAuthorization = await reader.authorizationPath(exited, authorizationStatement.envelope);
    const recoveryJob = await withHash(hashFields => recoveryWitness(rolePackets.recovery,
      { authorizationRoot: recoveryAuthorization.root,
        authorizationPath: fieldLeafPath(exited.authorizationTree.path(recoveryAuthorization.index)),
        poolRoot: bare(exited.ledger.tree.root), reservePath: leafPath(notePath(exited, rolePackets.recovery.core.value.reserveCommitment)) },
      { hashFields }));
    const recovery = await prove('recovery', recoveryJob, 'paid-reserve-refund-control');
    assert.equal(await system.verify('recovery', Buffer.from(recovery.proof, 'hex'), recovery.publicInputs), true);
    await evm.advanceTo(String(cutoff));
    await evm.send('reject-paid-reserve-refund', { to: pool.address,
      data: encodeFlatTransaction('recoverGeneric', recovery) }, '0x0', 'NOTE_ALREADY_SPENT');
    result.genuinePaidRefundRejected = true;
    result.partialDeliveryRecoveryAcceptance = false;
    result.nativeEffects = { bitcoin: bitcoin.transfers.length, solana: solana.transfers.length };
    assert.deepEqual(result.nativeEffects, { bitcoin: 1, solana: 1 });
    result.success = true; result.phase = 'completed'; await audit();
  } catch (error) {
    terminalError = error; result.success = false; result.failedStage = result.phase; result.phase = 'failed'; result.errorCode = safeCode(error);
    privateWrite(join(privateDirectory, 'error.json'), { name: error?.name, message: String(error?.message), stack: String(error?.stack),
      cause: error?.cause ? { message: String(error.cause.message), stack: String(error.cause.stack) } : null });
    // Preserve actual intermediate balances and delivery without inventing a
    // refund, then collect read-only state before orderly runtime shutdown.
    if (reader) { try { const view = await reader.read(); result.lastObservedPool = view.ledger.publicState;
      result.lastObservedHub = view.state; result.lastObservedAt = new Date().toISOString(); } catch (readError) { result.finalReadError = safeCode(readError); } }
    await audit().catch(() => {});
  } finally {
    await cleanup(); process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt);
    if ([result.cleanup.closedEvm, result.cleanup.closedBitcoin, result.cleanup.closedSolana].some(value => value === false)) {
      result.success = false; result.phase = 'failed'; result.cleanupFailed = true;
    }
    try { assert.deepEqual(nativeFlowSourcePins(), result.sourcePins); result.sourceUnchanged = true; }
    catch { result.success = false; result.phase = 'failed'; result.sourceUnchanged = false; }
    result.finishedAt = new Date().toISOString(); result.milliseconds = performance.now() - started; save();
    if (terminalError || !result.success) process.exitCode = 1;
  }
}

await main();
