/** Genuine bounded generic execution on fresh, owned fake-value chains.
 * The common-host bootstrap is an explicit test oracle, not a privacy boundary.
 * It routes private capsules to scoped proof roles; providers receive only R98
 * and their own action. No circuit source/key depends on this fixture's graph.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEvm } from '../../../../packages/engine/src/execution/local/local-evm.mjs';
import { nativeSystemSources, compileNativeSystem, deployNativeSystem } from '../../../../packages/engine/src/execution/native/dispatch/native-deployment.mjs';
import { readNativeSystemState } from '../../../../packages/engine/src/execution/native/state/native-system-state.mjs';
import { reserveProjection } from '../../../../packages/engine/src/execution/local/local-ledger.mjs';
import { createNativeOwnerProcess } from '../../../../packages/engine/src/execution/native/dispatch/native-owner.mjs';
import { createNativeRecipientProcess } from '../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import { authorizeCurrentNativeRecipientWithdrawal } from '../../../../packages/engine/src/execution/native/recipients/native-recipient-withdrawal.mjs';
import { createNativeDispatchGate } from '../../../../packages/engine/src/execution/native/dispatch/native-dispatch-gate.mjs';
import { bootstrapTrustedLocalNativeQuorumObserver } from '../../../../packages/engine/src/evidence/native-quorum-observer.mjs';
import { createOwnedSolanaCohortRuntime, base58Decode } from '../../../../packages/engine/src/chains/solana/solana-runtime.mjs';
import { createOwnedBitcoinRuntime } from '../../../../packages/engine/src/chains/bitcoin/bitcoin-runtime.mjs';
import { createProofProcess } from '../../../../packages/engine/src/execution/proofs/proof-process.mjs';
import { wipePrivate } from '../../../../packages/engine/src/execution/proofs/proof-worker.mjs';
import { prepareNativeDependency } from '../../../../packages/engine/src/execution/native/dispatch/native-dependency.mjs';
import { prepareNativeReady } from '../../../../packages/engine/src/execution/native/dispatch/native-ready.mjs';
import { prepareNativeNode } from '../../../../packages/engine/src/execution/native/dispatch/native-node.mjs';
import { prepareNativeAdmission, NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { prepareNativeAggregatePair, prepareNativeAggregateAll, prepareNativeFulfillment } from '../../../../packages/engine/src/execution/native/dispatch/native-fulfillment.mjs';
import { nativeReceiptCommitment } from '../../../../packages/engine/src/execution/native/state/native-receipt.mjs';
import { reserveInputs, refundInputs, publicWords, digestHex } from '../../../../experiments/engine/private-core-proof/generic-wrappers/abi.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';
import { parseGenericNativeFlowArguments, runPartialRefundNativeFlow } from '../../lib/generic-native-flow-profiles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fresh = () => randomBytes(32).toString('hex');
const bare = value => value.startsWith('0x') ? value.slice(2) : value;
const prefix = value => '0x' + bare(value);
const json = value => JSON.stringify(value, (_key, child) => typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const wordsDigest = (inputs, offset) => digestHex(inputs.slice(offset, offset + 8));
const recursive = proof => ({ publicInputs: proof.publicInputs, proofFields: proof.proofFields, vkFields: proof.vkFields });
const pathForWrapper = path => ({ baseRoot: bare(path.root), acceptedRoot: bare(path.root),
  siblings: path.siblings.map(bare), leafIndex: path.index });
const pathForRole = path => ({ index: String(path.index), siblings: path.siblings });
const checkpointSignature = 'recordCheckpoint(address,uint64,uint64,bytes32,uint64,(uint8,uint8,bytes32,bytes32)[3])';
const safeError = error => ({ name: error?.name ?? 'Error',
  code: [error?.code, error?.message].find(value => /^[A-Z][A-Z0-9_]{1,160}$/.test(value ?? '')) ?? 'GENERIC_NATIVE_FLOW_FAILURE' });

function sourceManifest() {
  const paths = new Set(['scripts/integration-generic-native-flow.mjs', 'scripts/run-bounded-native-flow.mjs', 'scripts/generic-native-owner-worker.mjs',
    'contracts/PrivateNativeReceiptHub.sol', 'contracts/PrivateGenericNativeAssetNotePool.sol',
    'src/chains/solana-runtime.mjs', 'src/chains/bitcoin-runtime.mjs', 'src/chains/runtime-harness.mjs',
    'src/chains/linux-runtime-pins.mjs', 'src/private-resource-policy.mjs', 'src/private-verifier-crs.mjs', 'src/vault.mjs']);
  for (const directory of ['scripts/lib', 'src/paeg', 'src/evidence', 'experiments/private-core-proof/generic-graph',
    'experiments/private-core-proof/generic-funding', 'experiments/private-core-proof/generic-wrappers',
    'experiments/private-core-proof/generic-native']) {
    const visit = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name === '.local') continue;
        const child = join(path, entry.name);
        assert.ok(!entry.isSymbolicLink(), 'GENERIC_NATIVE_SOURCE_SYMLINK');
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) paths.add(relative(root, child));
      }
    };
    visit(join(root, directory));
  }
  return [...paths].sort().map(path => {
    const bytes = readFileSync(join(root, path)); return { path, bytes: bytes.length, sha256: sha(bytes) };
  });
}

export async function runGenericNativeFlow(argv = process.argv.slice(2)) {
  const flowCase = parseGenericNativeFlowArguments(argv);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(root, 'evidence/generic-native-flow', runId);
  const privateDirectory = join(root, '.local/private-generic-native', runId);
  mkdirSync(join(directory, 'public-proofs'), { recursive: true });
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  const report = { classification: 'GENERIC_NATIVE_FLOW_IN_PROGRESS', case: flowCase, runId, startedAt: new Date().toISOString(),
    phase: 'source-and-artifacts', fullWalletAcceptance: false, independentOperators: false,
    realTimeExpiryDemonstrated: false, source: sourceManifest(), resourcePolicy: PRIVATE_RESOURCE_POLICY,
    stages: [], proofMetrics: [], publicProofs: [], transactions: [], nativeExposure: [],
    disclosures: [
      'Common-host synthetic fixture; separate owner/recipient processes do not establish adversarial OS isolation.',
      'Fixed 3-of-4 signature profile verifies federated observations, not native consensus.',
      'Owned EVM inclusion clock is controlled; actual proving wall time is separately recorded.',
      'Provider explicitly accepts partial native delivery loss if the full local budget returns to owner.',
      'Native-to-admission linkage, timing, amounts, RPC traffic and role collusion remain privacy limits.',
      'This run does not establish seven-chain support, mobile custody, independent audit or full product privacy.',
    ] };
  for (const item of report.source) {
    const bytes = readFileSync(join(root, item.path));
    assert.equal(sha(bytes), item.sha256, 'GENERIC_NATIVE_SOURCE_FREEZE');
    const destination = join(directory, 'source', item.path);
    mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
  }
  const persist = () => writeFileSync(join(directory, 'report.json'), json(report));
  const stage = name => { report.phase = name; report.stages.push({ stage: name, at: new Date().toISOString() }); persist(); console.log(JSON.stringify({ stage: name })); };
  let evm, solana, bitcoin, system, observer, owner, ownerConfig, prepared, returningOwner;
  const providers = [], recipients = [], proofRoles = [];
  let funded = false, settled = false, refunded = false, terminalError;
  const proofRole = (purpose, modes) => { const facade = createProofProcess({ purpose, modes }); proofRoles.push(facade); return facade; };
  const audit = () => {
    if (evm) {
      writeFileSync(join(privateDirectory, 'evm-audit.json'), json({ metadata: evm.metadata,
        transactions: evm.transactions, receipts: evm.receipts }), { mode: 0o600 });
      report.transactions = evm.receipts.map(entry => ({ label: entry.label, transactionHash: entry.receipt.transactionHash,
        blockHash: entry.receipt.blockHash, blockNumber: entry.receipt.blockNumber,
        status: entry.receipt.status, revert: entry.revert ?? null }));
    }
    if (solana || bitcoin) writeFileSync(join(privateDirectory, 'native-audit.json'), json({
      solanaMetadata: solana?.metadata, bitcoinMetadata: bitcoin?.metadata,
      solana: solana?.transfers ?? [], bitcoin: bitcoin?.transfers ?? [],
    }), { mode: 0o600 });
    persist();
  };
  const metric = (label, mode, proof) => {
    assert.equal(proof.metrics.acceptedResult, true, 'GENERIC_NATIVE_PROOF_INCOMPLETE');
    report.proofMetrics.push({ label, mode, proofSHA256: sha(proof.proof),
      publicInputsSHA256: sha(json(proof.publicInputs)), metrics: proof.metrics }); persist();
  };
  const prove = async (facade, mode, witness, expected, label) => {
    const proof = await facade.prove(mode, witness, expected, label); metric(label, mode, proof); return proof;
  };
  const savePublic = (label, mode, proof) => {
    const sizes = { deposit_balance: 26, reserve: 66, admission: 42, fulfill: 131, refund: 51, withdraw_balance: 39 };
    assert.equal(proof.publicInputs.length, sizes[mode], 'GENERIC_NATIVE_PUBLIC_PROOF_ALLOWLIST');
    const encoded = json(proof.publicInputs);
    writeFileSync(join(directory, 'public-proofs', label + '.bin'), proof.proof);
    writeFileSync(join(directory, 'public-proofs', label + '.inputs.json'), encoded);
    report.publicProofs.push({ label, mode, proofSHA256: sha(proof.proof), publicInputsSHA256: sha(encoded) }); persist();
  };
  const send = async (label, to, data, { status = '0x1', reason, value } = {}) => {
    try { return await evm.send(label, { to, data, ...(value ? { value } : {}) }, status, reason); }
    finally { audit(); }
  };
  const health = async () => {
    const permit = await observer.health({}); assert.equal(permit.status, 'HEALTHY', 'GENERIC_NATIVE_HEALTH_REFUSED');
    return { healthFrom: permit.message.validFrom, healthUntil: permit.message.validUntil, healthSignatures: permit.abiSignatures };
  };
  let emergencyStopping = false;
  const emergencyStop = async signal => {
    if (emergencyStopping) return;
    emergencyStopping = true;
    report.classification = 'GENERIC_NATIVE_FLOW_INTERRUPTED_OUTCOME_REQUIRES_RECONCILIATION';
    report.interruption = { signal, at: new Date().toISOString(), phase: report.phase };
    audit();
    // Start native shutdown immediately, even if a proof/owner request is still
    // outstanding. Never discover or kill a process by name or an old PID.
    const actions = [owner?.close(), returningOwner?.close(), ...proofRoles.map(role => role.abort()),
      bitcoin?.close(), solana?.close(), evm?.close()].filter(Boolean);
    report.emergencyCleanup = (await Promise.allSettled(actions)).map(item => item.status === 'fulfilled'
      ? { result: item.value } : { error: safeError(item.reason) });
    report.completedAt = new Date().toISOString(); persist();
  };
  const onSignal = signal => { void emergencyStop(signal).finally(() => process.exit(2)); };
  const termHandler = () => onSignal('SIGTERM'), intHandler = () => onSignal('SIGINT');
  process.on('SIGTERM', termHandler); process.on('SIGINT', intHandler);
  try {
    stage('compile-pinned-system');
    const compilation = await compileNativeSystem(await nativeSystemSources(), async record => {
      report.compilationProgress = record; persist();
    });
    writeFileSync(join(directory, 'compilation.json'), json(compilation));
    stage('start-fresh-owned-runtimes');
    evm = await createLocalEvm();
    bitcoin = await createOwnedBitcoinRuntime();
    solana = await createOwnedSolanaCohortRuntime();
    report.runtime = {
      evm: { classification: evm.metadata.classification, chainId: evm.metadata.chainId,
        runtimePin: evm.metadata.runtimePin, freshSyntheticWallets: true },
      bitcoin: { profile: bitcoin.metadata.profile, network: 'regtest', peers: 0, externalNetworkEnabled: false },
      solana: { classification: solana.metadata.classification, runtimePins: solana.metadata.runtimePins,
        officialSourceVersion: solana.metadata.officialSourceVersion, ledgerRetention: solana.metadata.ledgerRetention,
        slotTiming: solana.metadata.slotTiming, ownedLoopbacksChecked: true },
    };
    const rules = [
      { family: '2', genesis: base58Decode(solana.genesis, 32).toString('hex'),
        asset: sha('LIANUM/registered-native-asset/SOL/1'), finalityKind: '2', minimumConfirmations: '0',
        maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
      { family: '1', genesis: bitcoin.genesis, asset: sha('LIANUM/registered-native-asset/BTC/1'),
        finalityKind: '1', minimumConfirmations: '6', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
    ];
    observer = await bootstrapTrustedLocalNativeQuorumObserver({ vaultPath: join(privateDirectory, 'quorum.vault'),
      password: fresh(), solana: [solana.recipientView(0), solana.recipientView(1)], bitcoin, rules, registryEpoch: '1' });
    stage('deploy-genuine-hub-and-two-registered-pools');
    system = await deployNativeSystem(evm, { compilation, deploymentDomain: prefix(fresh()), registryEpoch: '1',
      rulesRoot: prefix(observer.rulesRoot), attesterKeys: observer.attesterKeys,
      pools: [0, 1].map(() => ({ policy: prefix(fresh()), deploymentDomain: prefix(fresh()) })),
      onDeployment: async record => { report.latestDeployment = { source: record.source, name: record.contractName, address: record.address }; audit(); } });
    report.deployment = { plan: system.plan, deployments: system.deployments };
    await observer.bindDeployment({ runtime: evm, system });
    const pool = system.pools[0], initial = await readNativeSystemState(evm, system, 0);
    assert.equal(initial.ledger.publicState.backedAmount, '0');
    const now = await evm.time(), cutoff = now + 28_800n;
    const terms = { scope: bare(pool.scope), policy: bare(pool.policy), asset: bare(pool.assetIdentity),
      executionFrom: now.toString(), executionUntil: (cutoff - 60n).toString(), settleBefore: cutoff.toString() };
    const operationId = fresh(), values = ['10000', '10000'], amounts = ['3000000', '100000'];
    const recipientBefore = await Promise.all([evm.balance(evm.accounts[1]), evm.balance(evm.accounts[2])]);
    const recipientConfigs = [], offers = [];
    stage('prepare-separate-provider-and-recipient-custody');
    for (let i = 0; i < 2; i++) {
      const provider = await createNativeDispatchGate({ path: join(privateDirectory, `provider-${i}.vault`), password: fresh(),
        evmRuntime: evm, system, poolIndex: 0, nativeRuntime: i === 0 ? solana : bitcoin,
        observer, rule: rules[i], recipientIndex: 0, terms: { ...terms, amount: amounts[i] },
        acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE });
      providers.push(provider);
      const offer = provider.offer();
      const cfg = { path: join(privateDirectory, `recipient-${i}.vault`), password: fresh(),
        expectedTerms: { scope: terms.scope, policy: terms.policy, asset: terms.asset,
          hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
          operationId, slot: i, evidencePolicy: offer.evidencePolicy, value: values[i],
          settleBefore: cutoff.toString(), actionTemplate: offer.actionTemplate },
        withdrawalRecipient: bare(evm.accounts[i + 1]) };
      recipientConfigs.push(cfg);
      const recipient = await createNativeRecipientProcess({ mode: 'create', ...cfg });
      recipients.push(recipient);
      offers.push({ provider: offer, payout: await recipient.offer() });
    }
    owner = createNativeOwnerProcess();
    stage('owner-prepares-private-graph-and-scoped-invoices');
    // Keep the original private Vault credentials in memory for a possible
    // returning owner. The controller never opens or decrypts this Vault.
    ownerConfig = { scope: terms.scope, policy: terms.policy, asset: terms.asset,
      settleBefore: terms.settleBefore, operationId,
      hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
      epoch: String(now / 600n), fundingNotBefore: now.toString(), fundingValidUntil: (now + 600n).toString(),
      fundingAmount: '20000', nodes: offers.map((offer, i) => {
        const { settleBefore: _cutoff, ...actionTemplate } = offer.provider.actionTemplate;
        return { id: i === 0 ? 'sol-delivery' : 'btc-delivery', dependsOn: i === 0 ? [] : ['sol-delivery'],
          evidencePolicy: offer.provider.evidencePolicy, actionTemplate, recipientOffer: offer.payout };
      }), vault: { path: join(privateDirectory, 'owner.vault'), password: fresh() } };
    const preparedInvoices = await owner.prepare(ownerConfig);
    const invoiceSignatures = [];
    for (const request of preparedInvoices.invoiceRequests) {
      const accepted = await recipients[request.slot].acceptInvoice(request.invoice);
      invoiceSignatures.push(accepted.invoiceSignature);
      await providers[request.slot].bindQuote({ recipientCustody: recipients[request.slot] });
    }
    stage('owner-proves-deposit-authorization-and-capsules-before-funding');
    prepared = await owner.authorize({ invoiceSignatures });
    // The owner facade already decodes and validates the private IPC envelopes.
    // These are owned proof-byte packages, not base64 wire envelopes.
    const { deposit, authorization, capsuleAuthorization: capsule } = prepared;
    report.ownerPreparation = prepared.metrics;
    assert.equal(prepared.rolePackets.ready.filter(Boolean).length, 2, 'GENERIC_NATIVE_TWO_ACTIVE_SLOTS');
    savePublic('deposit', 'deposit_balance', deposit);
    const ownerExit = await owner.close(); report.ownerExitBeforeNative = ownerExit;
    assert.equal(owner.report().exited, true, 'GENERIC_NATIVE_OWNER_STILL_RUNNING');
    stage('fund-and-reserve-after-owner-exit');
    report.fundingAttempted = true; persist();
    await send('fund 20000 local fake wei', pool.address,
      pool.proofData('deposit_balance', deposit.proof, deposit.publicInputs), { value: pool.fundingTransactionValue(20000n) });
    funded = true;
    let view = await readNativeSystemState(evm, system, 0);
    const coordinator = proofRole('coordinator', ['reserve', 'refund']);
    const reservationWitness = reserveInputs(authorization, { ...pathForWrapper(view.ledger.tree.path(0)),
      validFrom: now.toString(), validUntil: (now + 600n).toString() });
    const reservation = await prove(coordinator, 'reserve', reservationWitness, publicWords('reserve', reservationWitness), 'generic-native-reserve');
    const projection = reserveProjection(view.ledger, prefix(prepared.reserveCommitment), prefix(prepared.changeCommitment));
    savePublic('reserve', 'reserve', reservation);
    await send('reserve exact authorized generic intent', pool.address,
      pool.guardedReserveData(reservation.proof, reservation.publicInputs,
        { expectedSequence: projection.expectedSequence, expectedPostRoot: projection.expectedPostRoot }));
    const reserveIndex = projection.reserveIndex;
    const dependencyRole = proofRole('dependency', ['dependency']);
    const readyRole = proofRole('ready', ['ready']);
    const admissionRole = proofRole('receipt', ['admission']);
    const receipts = new Map();
    for (let slot = 0; slot < 2; slot++) {
      stage(`native-leg-${slot + 1}-checkpoint-and-private-readiness`);
      const cp = await observer.checkpoint({ poolIndex: 0, requestId: prefix(fresh()),
        validUntil: ((await evm.time()) + 60n).toString() });
      const m = cp.message;
      await send(`authorize readiness checkpoint ${slot + 1}`, system.hub.address,
        system.hub.data(checkpointSignature, [m.pool, m.expectedPoolSequence, m.expectedHubStateSequence,
          m.requestId, m.validUntil, cp.abiSignatures]));
      view = await readNativeSystemState(evm, system, 0);
      const checkpointIndex = Number(view.checkpointCount) - 1;
      assert.equal(view.checkpointTree.path(checkpointIndex).leaf, view.snapshotDigest, 'GENERIC_NATIVE_RECORDED_CHECKPOINT');
      const readyFrom = view.snapshot.timestamp, readyUntil = (BigInt(readyFrom) + 3600n).toString();
      const dependencyPacket = prepared.rolePackets.dependency[slot];
      const prerequisiteReads = dependencyPacket.dependencyCapsule.predecessors
        .slice(0, dependencyPacket.dependencyCapsule.dependencyCount).map(source => {
          const receipt = receipts.get(source.sourceSlot); assert.ok(receipt, 'GENERIC_NATIVE_PREREQUISITE_MISSING');
          return { sourceSlot: source.sourceSlot, opening: receipt.opening,
            path: pathForRole(view.receiptTree.path(receipt.index)) };
        });
      const dependencyInput = prepareNativeDependency({ packet: dependencyPacket, snapshot: view.snapshot,
        snapshotDigest: view.snapshotDigest, receipts: prerequisiteReads, revokedEntries: view.revokedEntries,
        validFrom: readyFrom, validUntil: readyUntil });
      const dependency = await prove(dependencyRole, 'dependency', dependencyInput.inputs,
        dependencyInput.expectedPublicInputs, `generic-native-dependency-${slot}`);
      const readyInput = prepareNativeReady({ packet: prepared.rolePackets.ready[slot], capsuleProof: recursive(capsule),
        dependencyProof: recursive(dependency), snapshot: view.snapshot, snapshotDigest: view.snapshotDigest,
        reservePath: pathForRole(view.ledger.tree.path(reserveIndex)), poolSpentEntries: view.ledger.nullifiers,
        readyFrom, readyUntil });
      const ready = await prove(readyRole, 'ready', readyInput.inputs, readyInput.expectedPublicInputs, `generic-native-ready-${slot}`);
      const action = prepared.rolePackets.ready[slot].action, deliveryRiskSalt = prepared.providerRiskSalts[slot];
      if (slot === 0) {
        const badProof = Buffer.from(ready.proof); badProof[badProof.length - 1] ^= 1;
        const before = solana.transfers.length;
        await assert.rejects(providers[slot].execute({ readyProof: { proof: badProof, publicInputs: ready.publicInputs }, action, deliveryRiskSalt }));
        assert.equal(solana.transfers.length, before, 'GENERIC_NATIVE_INVALID_PROOF_EXPOSURE');
        report.invalidReadyRejectedWithoutNativeSignature = true; persist();
      }
      if (slot === 1 && flowCase === 'partial-refund') {
        await runPartialRefundNativeFlow({ evm, system, solana, bitcoin, providers, owner, ownerConfig,
          prepared, reserveIndex, sourceNullifier: wordsDigest(reservation.publicInputs, 32), cutoff,
          ready, action, deliveryRiskSalt, coordinator, readyRole, privateDirectory, fresh, report,
          stage, persist, audit, prove, proofRole, savePublic, send,
          setReturningOwner: process => { returningOwner = process; },
          markRefunded: () => { refunded = true; report.refunded = true; } });
        break;
      }
      stage(`native-leg-${slot + 1}-actual-sign-send-finality`);
      report.nativeExposure.push({ slot, family: slot === 0 ? 'SOL' : 'BTC', attemptedAt: new Date().toISOString(), deliveryConfirmed: false }); persist();
      const dispatched = await providers[slot].execute({ readyProof: { proof: ready.proof, publicInputs: ready.publicInputs }, action, deliveryRiskSalt });
      audit();
      if (slot === 0) await solana.recipientView(0).observe(dispatched.signedNative.signature,
        { expectedLamports: amounts[slot], commitment: 'finalized', timeoutMs: 120000 });
      else await bitcoin.confirm(dispatched.signedNative.txid);
      const delivered = await providers[slot].reconcile();
      report.nativeExposure[slot].deliveryConfirmed = true;
      report.nativeExposure[slot].confirmedAt = new Date().toISOString(); audit();
      const transferCount = slot === 0 ? solana.transfers.length : bitcoin.transfers.length;
      await providers[slot].execute({ readyProof: { proof: ready.proof, publicInputs: ready.publicInputs }, action, deliveryRiskSalt });
      assert.equal(slot === 0 ? solana.transfers.length : bitcoin.transfers.length, transferCount, 'GENERIC_NATIVE_DUPLICATE_DISPATCH');
      const evidenceFrom = (await evm.time()).toString();
      const opening = { hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
        globalEffectId: delivered.globalEffectId, scope: terms.scope, policy: terms.policy,
        localCommitment: wordsDigest(ready.publicInputs, 48), dispatchId: wordsDigest(ready.publicInputs, 56),
        chainDomain: action.chainDomain, evidencePolicy: wordsDigest(ready.publicInputs, 72),
        actionCommitment: wordsDigest(ready.publicInputs, 80), payoutCommitment: wordsDigest(ready.publicInputs, 88),
        validFrom: evidenceFrom, validUntil: cutoff.toString(), receiptKeyCommitment: action.receiptKeyCommitment,
        receiptRho: action.receiptRho };
      const certificate = await observer.certify({ family: slot === 0 ? 'SOL' : 'BTC', recipientIndex: 0,
        nativeId: slot === 0 ? delivered.signedNative.signature : delivered.signedNative.txid,
        action, opening, readyInputs: ready.publicInputs, providerKey: delivered.providerKey,
        dispatchSignedAt: delivered.dispatchStatement.signedAt, dispatchSignature: delivered.dispatchSignature });
      stage(`native-leg-${slot + 1}-genuine-quorum-admission`);
      view = await readNativeSystemState(evm, system, 0);
      const path = view.checkpointTree.path(checkpointIndex);
      const admissionInput = prepareNativeAdmission({ readyProof: recursive(ready), registry: observer.registry,
        rule: certificate.rule, rulePath: certificate.rulePath,
        checkpointPath: { index: String(path.index), siblings: path.siblings.map(bare) },
        action, effect: certificate.effect, opening, observation: certificate.observation,
        providerKey: delivered.providerKey, dispatchSignedAt: delivered.dispatchStatement.signedAt,
        dispatchSignature: delivered.dispatchSignature, deliveryRiskClause: NATIVE_ADMISSION_LOSS_CLAUSE, deliveryRiskSalt,
        attesterIndexes: certificate.attesterIndexes, attesterSignatures: certificate.attesterSignatures,
        admissionFrom: evidenceFrom, admissionUntil: cutoff.toString() },
      { expectedRegistryCommitment: bare(system.registryCommitment), acceptedCheckpointRoot: bare(view.checkpointTree.root) });
      const admitted = await prove(admissionRole, 'admission', admissionInput.inputs,
        admissionInput.expectedPublicInputs, `generic-native-admission-${slot}`);
      savePublic(`admission-${slot}`, 'admission', admitted);
      assert.equal(await system.verify('admission', admitted.proof, admitted.publicInputs), true, 'GENERIC_NATIVE_ADMISSION_VERIFIER');
      const beforeCount = Number((await readNativeSystemState(evm, system, 0)).state.receiptCount);
      await send(`admit native effect ${slot + 1} once`, system.hub.address,
        system.hub.proofData(admitted.proof, admitted.publicInputs, await health()));
      view = await readNativeSystemState(evm, system, 0);
      assert.equal(Number(view.state.receiptCount), beforeCount + 1);
      assert.equal(view.commitments[beforeCount], prefix(nativeReceiptCommitment(opening)));
      receipts.set(slot, { opening, index: beforeCount });
      if (slot === 0) {
        await send('duplicate native effect cannot be admitted again', system.hub.address,
          system.hub.proofData(admitted.proof, admitted.publicInputs, await health()),
          { status: '0x0', reason: 'GID_ALREADY_ADMITTED' });
        assert.equal((await readNativeSystemState(evm, system, 0)).state.receiptCount, String(beforeCount + 1));
      }
    }
    if (flowCase === 'success') {
      stage('prove-four-scoped-node-completions');
      view = await readNativeSystemState(evm, system, 0);
      const completionFrom = view.snapshot.timestamp, completionUntil = cutoff.toString();
      const nodeRole = proofRole('node', ['node']), nodeProofs = [];
      for (let slot = 0; slot < 4; slot++) {
        const receipt = receipts.get(slot);
        const nodeInput = prepareNativeNode({ packet: prepared.rolePackets.node[slot], capsuleProof: recursive(capsule),
          evidenceState: view.evidence, evidenceStateDigest: view.state.evidenceState,
          receipt: receipt ? { opening: receipt.opening, path: pathForRole(view.receiptTree.path(receipt.index)) } : null,
          revokedEntries: view.revokedEntries, validFrom: completionFrom, validUntil: completionUntil });
        nodeProofs.push(await prove(nodeRole, 'node', nodeInput.inputs, nodeInput.expectedPublicInputs, `generic-native-node-${slot}`));
      }
      stage('assemble-generic-global-fulfillment');
      const assembler = proofRole('assembler', ['aggregate_pair', 'aggregate_all', 'fulfill']), pairs = [];
      for (let pair = 0; pair < 2; pair++) {
        const input = prepareNativeAggregatePair({ nodeProofs: nodeProofs.slice(pair * 2, pair * 2 + 2).map(recursive) });
        pairs.push(await prove(assembler, 'aggregate_pair', input.inputs, input.expectedPublicInputs, `generic-native-pair-${pair}`));
      }
      const allInput = prepareNativeAggregateAll({ pairProofs: pairs.map(recursive) });
      const all = await prove(assembler, 'aggregate_all', allInput.inputs, allInput.expectedPublicInputs, 'generic-native-all-slots');
      view = await readNativeSystemState(evm, system, 0);
      const outputs = Array.from({ length: 4 }, (_, slot) => wordsDigest(authorization.publicInputs, 96 + slot * 8));
      const terminalReceiptTags = nodeProofs.map(proof => wordsDigest(proof.publicInputs, 40));
      const fulfillInput = prepareNativeFulfillment({ ownerProof: recursive(authorization), aggregateProof: recursive(all),
        reservePath: pathForRole(view.ledger.tree.path(reserveIndex)), expectedBindings: {
          scope: terms.scope, policy: terms.policy, asset: terms.asset, acceptedPoolRoot: view.ledger.tree.root,
          hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
          evidenceState: bare(view.state.evidenceState), reserveNullifier: prepared.reserveNullifier,
          outputs, terminalReceiptTags, settleBefore: cutoff.toString(), validFrom: completionFrom, validUntil: completionUntil,
        } });
      const fulfillment = await prove(assembler, 'fulfill', fulfillInput.inputs, fulfillInput.expectedPublicInputs, 'generic-native-fulfill');
      savePublic('fulfill', 'fulfill', fulfillment);
      assert.equal(await system.verify('fulfill', fulfillment.proof, fulfillment.publicInputs), true, 'GENERIC_NATIVE_TERMINAL_VERIFIER');
      const payoutStart = view.ledger.publicState.leaves;
      stage('fresh-native-health-and-atomic-private-payout');
      report.settlementAttempted = true; persist();
      await send('atomically settle complete native graph', pool.address,
        pool.fulfillData(fulfillment.proof, fulfillment.publicInputs, await health()));
      settled = true; report.firstActualClaimAt = new Date().toISOString();
      view = await readNativeSystemState(evm, system, 0);
      assert.equal(view.ledger.publicState.backedAmount, '20000');
      assert.equal(view.ledger.publicState.liveReservations, 0);
      assert.equal(view.state.spentTagCount, '4');
      assert.deepEqual(view.ledger.commitments.slice(payoutStart), outputs.map(prefix));
      report.actualPayoutState = { pool: view.ledger.publicState, hub: view.state }; audit();
      console.log(JSON.stringify({ result: 'ACTUAL_GENERIC_NATIVE_CLAIM', runId, at: report.firstActualClaimAt }));

      stage('reject-replayed-and-cross-pool-fulfillment');
      const unchanged = json({ ledger: view.ledger.publicState, hub: view.state });
      await send('same fulfilled reserve cannot settle twice', pool.address,
        pool.fulfillData(fulfillment.proof, fulfillment.publicInputs, await health()),
        { status: '0x0', reason: 'NOTE_ALREADY_SPENT' });
      const otherPool = system.pools[1];
      await send('same proof cannot spend a different registered pool', otherPool.address,
        otherPool.fulfillData(fulfillment.proof, fulfillment.publicInputs, await health()),
        { status: '0x0', reason: 'PUBLIC_DOMAIN' });
      view = await readNativeSystemState(evm, system, 0);
      assert.equal(json({ ledger: view.ledger.publicState, hub: view.state }), unchanged);

      stage('restart-recipient-custody-after-payout-before-withdrawal');
      report.recipientRestarts = [];
      for (let i = 0; i < recipients.length; i++) {
        const closed = await recipients[i].close();
        assert.equal(closed.exited, true, 'GENERIC_NATIVE_RECIPIENT_EXIT');
        const previousPID = recipients[i].report().pid;
        recipients[i] = await createNativeRecipientProcess({ mode: 'recover', ...recipientConfigs[i] });
        assert.notEqual(recipients[i].report().pid, previousPID, 'GENERIC_NATIVE_RECIPIENT_NOT_RESTARTED');
        report.recipientRestarts.push({ previousPID, newPID: recipients[i].report().pid, closed });
      }
      stage('prove-genuine-refund-cannot-duplicate-paid-reserve');
      const refundWitness = refundInputs(authorization, { ...pathForWrapper(view.ledger.tree.path(reserveIndex)),
        validFrom: cutoff.toString(), validUntil: (cutoff + 300n).toString() });
      const refund = await prove(coordinator, 'refund', refundWitness, publicWords('refund', refundWitness), 'generic-native-paid-refund-control');
      savePublic('paid-refund-control', 'refund', refund);
      assert.equal(await system.verify('recover_generic', refund.proof, refund.publicInputs), true, 'GENERIC_NATIVE_GENUINE_REFUND_VERIFIER');
      // Explicit local-clock control, disclosed above. No real waiting-time or
      // public-chain deadline claim follows from advancing this fixture clock.
      await evm.advanceTo(cutoff);
      await send('genuine refund rejects the exact already-paid reserve', pool.address,
        pool.proofData('recover_generic', refund.proof, refund.publicInputs),
        { status: '0x0', reason: 'NOTE_ALREADY_SPENT' });
      report.paidRefundControl = { genuineVerifierAccepted: true, poolRejectedSameNullifier: true, recoveryMinted: false };
      audit();

      stage('exit-issued-private-notes-after-foreign-runtimes-stop');
      report.foreignStoppedAfterSettlement = { bitcoin: await bitcoin.close(), solana: await solana.close() };
      const withdrawRole = proofRole('recipient', ['withdraw_balance']);
      report.withdrawals = [];
      for (let slot = 0; slot < 2; slot++) {
        let authorized = await authorizeCurrentNativeRecipientWithdrawal({ runtime: evm, system, poolIndex: 0, recipient: recipients[slot] });
        assert.equal(authorized.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
        if (slot === 0) {
          // Expire an unsubmitted signing authorization without producing a
          // redundant proof. Reconcile the actual unspent ledger and renew the
          // same note, amount, destination and canonical nullifier in a new epoch.
          const previous = authorized;
          await evm.advanceTo((BigInt(previous.observed.epoch) + 1n) * 600n);
          authorized = await authorizeCurrentNativeRecipientWithdrawal({ runtime: evm, system, poolIndex: 0, recipient: recipients[slot] });
          assert.equal(authorized.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
          assert.notEqual(authorized.observed.epoch, previous.observed.epoch);
          assert.equal(authorized.observed.canonicalNullifier, previous.observed.canonicalNullifier);
          report.withdrawalEpochRenewal = { previousEpoch: previous.observed.epoch, newEpoch: authorized.observed.epoch,
            sameCanonicalNullifier: true, actualUnspentLedgerReconciled: true, oldProofGenerated: false };
          wipePrivate(previous.witness);
        }
        let proof, attempts = 0;
        while (true) {
          proof = await prove(withdrawRole, 'withdraw_balance', authorized.witness,
            authorized.expectedPublicInputs, `generic-native-recipient-exit-${slot}-${attempts++}`);
          // Natural boundary rollover also renews; never submit an already known
          // expired proof or silently label its old authorization as withdrawn.
          const latestEpoch = String((await evm.time()) / 600n);
          if (latestEpoch === authorized.observed.epoch) break;
          wipePrivate(authorized.witness);
          authorized = await authorizeCurrentNativeRecipientWithdrawal({ runtime: evm, system, poolIndex: 0, recipient: recipients[slot] });
          assert.equal(authorized.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION', 'GENERIC_NATIVE_WITHDRAW_RECONCILE_REQUIRED');
        }
        savePublic(`withdraw-${slot}`, 'withdraw_balance', proof);
        const receipt = await send(`withdraw recipient ${slot + 1} once`, pool.address,
          pool.proofData('withdraw_balance', proof.proof, proof.publicInputs));
        assert.equal((await evm.balance(evm.accounts[slot + 1])) - recipientBefore[slot], BigInt(values[slot]));
        report.withdrawals.push({ slot, value: values[slot], transactionHash: receipt.transactionHash });
        if (slot === 0) await send('same payout cannot withdraw twice', pool.address,
          pool.proofData('withdraw_balance', proof.proof, proof.publicInputs),
          { status: '0x0', reason: 'NOTE_ALREADY_SPENT' });
        assert.equal((await authorizeCurrentNativeRecipientWithdrawal({ runtime: evm, system, poolIndex: 0,
          recipient: recipients[slot] })).status, 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION');
        wipePrivate(authorized.witness);
      }
      view = await readNativeSystemState(evm, system, 0);
      assert.equal(view.ledger.publicState.backedAmount, '0');
      assert.equal(view.ledger.publicState.actualAssetBalance, '0');
      assert.equal(view.ledger.publicState.liveReservations, 0);
      assert.equal(view.state.receiptCount, '2');
      assert.equal(view.state.spentTagCount, '4');
      assert.equal(solana.transfers.length, 1); assert.equal(bitcoin.transfers.length, 1);
      assert.equal(BigInt(await pool.call('canRetire()')), 1n);
      const untouched = await readNativeSystemState(evm, system, 1);
      assert.equal(untouched.ledger.publicState.leaves, 0);
      assert.equal(untouched.ledger.publicState.backedAmount, '0');
      report.finalState = { pool: view.ledger.publicState, hub: view.state, secondPool: untouched.ledger.publicState };
      report.ownerKeysUsedAfterExit = false;
      report.actualGenericNativeFulfillment = true;
      report.partialDeliveryRefundAcceptance = false;
      report.multipleNativeGraphShapesAccepted = false;
      report.classification = 'ACTUAL_OWNER_OFFLINE_TWO_LEG_GENERIC_NATIVE_FULFILLMENT_LOCAL_ONLY';
    }
    stage('completed');
  } catch (error) {
    terminalError = error; report.failedPhase = report.phase; report.phase = 'failed'; report.error = safeError(error);
    report.classification = flowCase === 'partial-refund'
      ? 'GENERIC_NATIVE_PARTIAL_REFUND_FLOW_INCOMPLETE' : 'GENERIC_NATIVE_FLOW_INCOMPLETE';
    report.funded = funded; report.settled = settled; report.refunded = refunded;
    if (system && evm) {
      try { report.finalObservedState = (await readNativeSystemState(evm, system, 0)).ledger.publicState; }
      catch (observationError) { report.finalObservationError = safeError(observationError); }
    }
    audit();
  } finally {
    const cleanup = [];
    for (const [name, item] of [['owner', owner], ['returning-owner', returningOwner], ...recipients.map((item, i) => ['recipient-' + i, item]),
      ...providers.map((item, i) => ['provider-' + i, item]), ...proofRoles.map((item, i) => ['proof-role-' + i, item])]) {
      if (!item) continue;
      try { cleanup.push({ name, result: await item.close() }); }
      catch (error) { cleanup.push({ name, error: safeError(error) }); terminalError ??= error; }
    }
    audit();
    for (const [name, runtime] of [['bitcoin', bitcoin], ['solana', solana], ['evm', evm]]) {
      if (!runtime) continue;
      try { cleanup.push({ name, result: await runtime.close() }); }
      catch (error) { cleanup.push({ name, error: safeError(error) }); terminalError ??= error; }
    }
    report.cleanup = cleanup;
    try { assert.deepEqual(sourceManifest(), report.source, 'GENERIC_NATIVE_SOURCE_CHANGED'); report.sourceUnchanged = true; }
    catch (error) { report.sourceUnchanged = false; terminalError ??= error; }
    report.completedAt = new Date().toISOString();
    if (terminalError) {
      report.classification = flowCase === 'partial-refund'
        ? 'GENERIC_NATIVE_PARTIAL_REFUND_FLOW_INCOMPLETE' : 'GENERIC_NATIVE_FLOW_INCOMPLETE';
      report.failedPhase ??= report.phase; report.phase = 'failed'; report.error ??= safeError(terminalError);
      report.funded = funded; report.settled = settled; report.refunded = refunded;
    }
    persist(); wipePrivate(prepared); wipePrivate(ownerConfig);
    const files = [];
    const visit = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) { const bytes = readFileSync(child); files.push({ path: relative(directory, child), bytes: bytes.length, sha256: sha(bytes) }); }
      }
    };
    visit(directory);
    writeFileSync(join(directory, 'terminal-manifest.json'), json({ classification: report.classification, case: flowCase,
      completedAt: report.completedAt, sourceUnchanged: report.sourceUnchanged,
      privateAuditExported: false, files: files.sort((a, b) => a.path.localeCompare(b.path)) }));
    process.removeListener('SIGTERM', termHandler); process.removeListener('SIGINT', intHandler);
  }
  if (terminalError) throw terminalError;
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGenericNativeFlow().then(result => console.log(JSON.stringify({ runId: result.runId, phase: result.phase })))
    .catch(error => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
}
