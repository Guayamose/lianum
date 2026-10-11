/** One funded generic balance, two different native graphs, coordinator restart,
 * and explicit note exits. All chains and value are owned local fixtures.
 * Run only through the fixed resource watchdog after saving the source delta.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalEvm } from '../../../../packages/engine/src/execution/local/local-evm.mjs';
import { compileNativeSystem, nativeSystemSources, deployNativeSystem } from '../../../../packages/backend/src/execution/native/dispatch/native-deployment.mjs';
import { readNativeSystemState } from '../../../../packages/backend/src/execution/native/state/native-system-state.mjs';
import { createOwnedBitcoinRuntime } from '../../../../packages/engine/src/chains/bitcoin/bitcoin-runtime.mjs';
import { createOwnedSolanaCohortRuntime, base58Decode } from '../../../../packages/engine/src/chains/solana/solana-runtime.mjs';
import { bootstrapTrustedLocalNativeQuorumObserver } from '../../../../packages/backend/src/evidence/native-quorum-observer.mjs';
import { createOwnedGenericBalanceObserver } from '../../../../packages/backend/src/accounts/balances/generic-balance-observer.mjs';
import { createGenericBalanceOwnerProcess } from '../../../../packages/backend/src/accounts/balances/generic-balance-owner-process.mjs';
import { createGenericNativeExecutionKeeper, detachGenericProofMetrics } from '../../../../packages/backend/src/execution/native/dispatch/generic-native-execution.mjs';
import { createGenericBalanceAccountAuthority } from '../../../../packages/backend/src/accounts/balances/generic-balance-account-authority.mjs';
import { createGenericAccountKeeper } from '../../../../packages/engine/src/execution/accounts/generic-account-keeper.mjs';
import { prepareGenericBalanceNativeProofs, abortGenericBalanceNativeProofs } from '../../../../packages/backend/src/accounts/balances/generic-balance-native-proofs.mjs';
import { createNativeDispatchGate } from '../../../../packages/backend/src/execution/native/dispatch/native-dispatch-gate.mjs';
import { createNativeRecipientProcess } from '../../../../packages/backend/src/execution/native/recipients/native-recipient-process.mjs';
import { authorizeCurrentNativeRecipientWithdrawal } from '../../../../packages/backend/src/execution/native/recipients/native-recipient-withdrawal.mjs';
import { NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { createProofProcess } from '../../../../packages/proofs/src/execution/proof-process.mjs';
import { wipePrivate } from '../../../../packages/proofs/src/execution/proof-worker.mjs';
import { objectDigest } from '../../../../packages/engine/src/execution/balances/generic-balance-custody.mjs';
import { PRIVATE_RESOURCE_POLICY } from '../../../../packages/engine/src/crypto/private-resource-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fresh = () => randomBytes(32).toString('hex');
const bare = value => value.slice(2);
const json = value => JSON.stringify(value, (_key, child) => typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const safe = error => ({ code: [error?.code, error?.message]
  .find(code => /^[A-Z][A-Z0-9_]{1,160}$/.test(code ?? '')) ?? 'GENERIC_BALANCE_ACCOUNT_FAILURE' });

function sourceManifest() {
  const files = new Set(['scripts/integration-generic-balance-account.mjs', 'scripts/run-bounded-generic-account.mjs',
    'src/vault.mjs', 'src/privacy.mjs', 'src/private-resource-policy.mjs', 'src/private-verifier-crs.mjs',
    'src/private-note-encoding.mjs', 'src/private-wallet-note-encoding.mjs', 'src/private-wallet-asset-binding.mjs',
    'src/private-note-tree.mjs', 'src/private-account-state.mjs', 'src/private-asset-runtime.mjs',
    'src/chains/solana-runtime.mjs', 'src/chains/bitcoin-runtime.mjs', 'src/chains/runtime-harness.mjs',
    'src/chains/linux-runtime-pins.mjs', 'contracts/PrivateNativeReceiptHub.sol',
    'contracts/PrivateGenericNativeAssetNotePool.sol']);
  for (const directory of ['src/paeg', 'src/evidence', 'experiments/private-core-proof/generic-graph',
    'experiments/private-core-proof/generic-funding', 'experiments/private-core-proof/generic-wrappers',
    'experiments/private-core-proof/generic-native']) {
    const visit = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name === '.local') continue;
        assert.ok(!entry.isSymbolicLink(), 'GENERIC_ACCOUNT_SOURCE_SYMLINK');
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) files.add(relative(root, child));
      }
    };
    visit(join(root, directory));
  }
  return [...files].sort().map(path => {
    const bytes = readFileSync(join(root, path)); return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}

export async function runGenericBalanceAccount(argv = process.argv.slice(2)) {
  const recoveryCase = argv.length === 2 && argv[1] === '--case=partial-recovery';
  assert.deepEqual(argv, ['--authorized-local-generic-balance-account',
    ...(recoveryCase ? ['--case=partial-recovery'] : [])], 'GENERIC_ACCOUNT_FIXED_LOCAL_ARGUMENTS');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(root, 'evidence/generic-balance-account', runId);
  const privateDirectory = join(root, '.local/private-generic-account', runId);
  mkdirSync(join(directory, 'public-proofs'), { recursive: true });
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  const report = { classification: 'GENERIC_BALANCE_ACCOUNT_IN_PROGRESS', runId,
    case: recoveryCase ? 'partial-recovery' : 'two-settlements',
    startedAt: new Date().toISOString(), phase: 'source-freeze', source: sourceManifest(),
    fullWalletAcceptance: false, independentOperators: false, realTimeExpiryDemonstrated: false,
    sourceNoteMigration: false, keeperRestartDemonstrated: false, resourcePolicy: PRIVATE_RESOURCE_POLICY,
    stages: [], proofMetrics: [], publicProofs: [], operations: [], transactions: [],
    disclosures: [
      'Common-host synthetic keeper knows the private graph and retains custody passwords; process separation is not adversarial OS isolation.',
      'Three-of-four attestation keys are local trusted observers, not native consensus verification or independent operators.',
      'The EVM inclusion clock is deliberately controlled. This does not establish real-clock deadline viability or public Bitcoin latency.',
      'Only the disposable account coordinator restarts. Original keeper, exact pool, observer and native nodes survive.',
      'This run does not establish cohort unlinkability, seven chains, DeFi, mobile root keys, independent audit, or the performance target.',
    ] };
  for (const item of report.source) {
    const destination = join(directory, 'source', item.path);
    mkdirSync(dirname(destination), { recursive: true });
    const bytes = readFileSync(join(root, item.path));
    assert.equal(hash(bytes), item.sha256, 'GENERIC_ACCOUNT_SOURCE_FREEZE');
    writeFileSync(destination, bytes);
  }
  const persist = () => writeFileSync(join(directory, 'report.json'), json(report));
  const stage = name => {
    report.phase = name; report.stages.push({ name, at: new Date().toISOString() }); persist();
    console.log(JSON.stringify({ stage: name }));
  };
  let evm, bitcoin, solana, system, quorum, owner, balanceObserver, nativeExecution, accountAuthority, account, terminalError;
  const recipients = [], providers = [], extraProofRoles = [];
  let proofCounter = 0, operationNumber = 0, injectedCoordinatorLoss = false;
  let interruptedGraph = null, injectedGraphInterruption = false;
  const publicModes = new Set(['deposit_balance', 'reserve', 'admission', 'fulfill', 'refund', 'withdraw_balance']);
  const publicProof = ({ label, mode, proof, publicInputs }) => {
    assert.ok(publicModes.has(mode), 'GENERIC_ACCOUNT_PUBLIC_PROOF_ALLOWLIST');
    const file = `${String(++proofCounter).padStart(3, '0')}-${mode}`;
    const bytes = Buffer.from(proof), inputs = json(publicInputs);
    writeFileSync(join(directory, 'public-proofs', file + '.bin'), bytes);
    writeFileSync(join(directory, 'public-proofs', file + '.inputs.json'), inputs);
    report.publicProofs.push({ label, mode, file, proofSHA256: hash(bytes), publicInputsSHA256: hash(inputs) }); persist();
  };
  const privateProof = ({ mode, proof }) => {
    assert.equal(proof.metrics.acceptedResult, true, 'GENERIC_ACCOUNT_PROOF_INCOMPLETE');
    report.proofMetrics.push({ operation: operationNumber, mode, proofSHA256: hash(proof.proof), metrics: detachGenericProofMetrics(proof.metrics) });
    if (publicModes.has(mode)) publicProof({ label: 'account-' + mode, mode, proof: proof.proof, publicInputs: proof.publicInputs });
    persist();
  };
  const audit = async (execution = null) => {
    if (execution?.stage) {
      const { error, ...details } = execution;
      writeFileSync(join(privateDirectory, 'execution-audit.json'), json({ ...details,
        ...(error ? { error: { name: error.name, code: error.code ?? null,
          message: String(error.message), stack: String(error.stack ?? '').slice(0, 16000) } } : {}) }), { mode: 0o600 });
      if (error) report.executionFailure = { stage: execution.stage, status: execution.status,
        nativeExposure: execution.nativeExposure, settlementAttempted: execution.settlementAttempted,
        proof: execution.proof ?? null, error: safe(error) };
    }
    if (evm) {
      writeFileSync(join(privateDirectory, 'evm-audit.json'), json({ metadata: evm.metadata,
        transactions: evm.transactions, receipts: evm.receipts }), { mode: 0o600 });
      report.transactions = evm.receipts.map(entry => ({ label: entry.label, transactionHash: entry.receipt.transactionHash,
        blockHash: entry.receipt.blockHash, blockNumber: entry.receipt.blockNumber, status: entry.receipt.status }));
    }
    if (solana || bitcoin) writeFileSync(join(privateDirectory, 'native-audit.json'), json({
      solanaMetadata: solana?.metadata, bitcoinMetadata: bitcoin?.metadata,
      solana: solana?.transfers ?? [], bitcoin: bitcoin?.transfers ?? [],
    }), { mode: 0o600 });
    persist();
  };
  let stopping = false;
  const emergencyStop = async signal => {
    if (stopping) return;
    stopping = true; report.phase = 'interrupted';
    report.classification = 'GENERIC_BALANCE_ACCOUNT_INTERRUPTED_OUTCOME_REQUIRES_RECONCILIATION';
    report.interruption = { signal, at: new Date().toISOString() }; await audit();
    report.emergencyCleanup = await Promise.allSettled([owner && abortGenericBalanceNativeProofs(owner),
      accountAuthority?.abort(), nativeExecution?.abort(), owner?.close(), bitcoin?.close(), solana?.close(), evm?.close(),
      ...extraProofRoles.map(role => role.abort())].filter(Boolean));
    persist();
  };
  const onTerm = () => void emergencyStop('SIGTERM').finally(() => process.exit(2));
  const onInt = () => void emergencyStop('SIGINT').finally(() => process.exit(2));
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  try {
    stage('compile-existing-pinned-native-system');
    const compilation = await compileNativeSystem(await nativeSystemSources());
    writeFileSync(join(directory, 'compilation.json'), json(compilation));
    stage('start-fresh-owned-local-runtimes');
    evm = await createLocalEvm(); bitcoin = await createOwnedBitcoinRuntime(); solana = await createOwnedSolanaCohortRuntime();
    const rules = [
      { family: '2', genesis: base58Decode(solana.genesis, 32).toString('hex'),
        asset: hash('LIANUM/registered-native-asset/SOL/1'), finalityKind: '2', minimumConfirmations: '0',
        maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
      { family: '1', genesis: bitcoin.genesis, asset: hash('LIANUM/registered-native-asset/BTC/1'),
        finalityKind: '1', minimumConfirmations: '6', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
    ];
    quorum = await bootstrapTrustedLocalNativeQuorumObserver({ vaultPath: join(privateDirectory, 'quorum.vault'),
      password: fresh(), solana: [solana.recipientView(0), solana.recipientView(1)], bitcoin, rules, registryEpoch: '1' });
    stage('deploy-shared-generic-pool');
    system = await deployNativeSystem(evm, { compilation, deploymentDomain: '0x' + fresh(), registryEpoch: '1',
      rulesRoot: '0x' + quorum.rulesRoot, attesterKeys: quorum.attesterKeys,
      pools: [0, 1].map(() => ({ policy: '0x' + fresh(), deploymentDomain: '0x' + fresh() })) });
    await quorum.bindDeployment({ runtime: evm, system });
    report.deployment = { plan: system.plan, deployments: system.deployments };
    balanceObserver = await createOwnedGenericBalanceObserver({ runtime: evm, system, poolIndex: 0, bitcoin, solana,
      walletId: 'generic-shared-owner', issuerLifetime: fresh() });
    owner = await createGenericBalanceOwnerProcess({ runtime: evm, system, poolIndex: 0, observer: balanceObserver });
    nativeExecution = createGenericNativeExecutionKeeper({ runtime: evm, system, poolIndex: 0,
      observer: quorum, bitcoin, solana }, {
      onStage: value => {
        stage('graph-' + operationNumber + '-' + value.stage);
        if (recoveryCase && operationNumber === 1 && value.stage === 'prove-four-scoped-node-completions'
          && !injectedGraphInterruption) {
          // A controlled interruption after actual delivery/admission, before
          // any global fulfillment proof or submission. The original A0 must
          // already be durable for later owner-independent recovery.
          injectedGraphInterruption = true;
          report.controlledGraphInterruption = { at: new Date().toISOString(),
            afterNativeAdmission: true, beforeGlobalSettlement: true, nativeExposure: value.nativeExposure };
          persist();
          throw new Error('GENERIC_ACCOUNT_SIMULATED_INTERRUPTION_AFTER_NATIVE_ADMISSION');
        }
      },
      onProofMetrics: value => { report.proofMetrics.push({ operation: operationNumber, ...value }); persist(); },
      onPublicProof: publicProof, onPrivateAudit: audit,
    });
    accountAuthority = await createGenericBalanceAccountAuthority({ runtime: evm, system, poolIndex: 0,
      owner, observer: balanceObserver, nativeExecution, accountId: 'generic-account-one', journalId: 'generic-journal-one' },
    { onStage: value => {
      if (value.ownerLifecycle) {
        report.ownerSuspensions ??= [];
        report.ownerSuspensions.push({ operation: operationNumber, at: new Date().toISOString(), ...value.ownerLifecycle });
      }
      stage('account-' + value.kind + '-' + value.stage);
    }, onProof: privateProof, onPrivateAudit: audit });
    account = await createGenericAccountKeeper({ config: accountAuthority.config,
      journal: { path: join(privateDirectory, 'account-journal.vault'), password: fresh() }, authority: accountAuthority.authority }, {
      afterHostOperation: async ({ method, request, terminateCoordinator }) => {
        if (method === (recoveryCase ? 'recover' : 'execute') && request.kind === 'GRAPH' && !injectedCoordinatorLoss) {
          injectedCoordinatorLoss = true;
          report.coordinatorLoss = { afterActualHostResult: true, action: method, at: new Date().toISOString() }; persist();
          terminateCoordinator();
        }
      },
    });
    const pool = system.pools[0], identity = balanceObserver.identity;
    const requestFor = (requestId, kind, ownerOperationRef) => ({ requestId, kind, ownerOperationRef, assetId: accountAuthority.assetId });
    stage('fund-private-balance-once');
    const fundingRef = fresh();
    await owner.owner.prepareFunding({ ownerOperationRef: fundingRef, identitySHA256: objectDigest(identity),
      amount: '50000', epoch: String((await evm.time()) / 600n) });
    wipePrivate(await owner.owner.depositInput(fundingRef));
    await accountAuthority.ownerActions.registerTopUp(fundingRef);
    await account.prepare(requestFor('original_top_up_0001', 'TOP_UP', fundingRef));
    assert.equal((await account.execute('original_top_up_0001')).state, 'CONFIRMED');
    report.fundingConfirmed = true;
    assert.equal((await owner.owner.privateBalance()).available, '50000');
    const destinationBefore = await Promise.all([1, 2, 3].map(index => evm.balance(evm.accounts[index])));

    const graphShapes = [[{ family: 'BTC', amount: '100000', value: '20000', recipientIndex: 0 }], [
      { family: 'BTC', amount: '150000', value: '10000', recipientIndex: 1 },
      { family: 'SOL', amount: '3000000', value: '10000', recipientIndex: 0 },
    ]];
    for (let index = 0; index < graphShapes.length; index++) {
      operationNumber = index + 1;
      if (owner.report().suspended) await owner.restart();
      const balance = await owner.owner.privateBalance();
      assert.equal(balance.available, index === 0 ? '50000' : '30000');
      const source = balance.notes.find(note => note.status === 'AVAILABLE');
      assert.ok(source, 'GENERIC_ACCOUNT_REUSABLE_SOURCE_REQUIRED');
      const now = await evm.time(), cutoff = now + (recoveryCase && index === 0 ? 7200n : 28_800n);
      const operationId = fresh(), reference = fresh();
      const terms = { scope: identity.scope, policy: identity.policy, asset: identity.asset.identity,
        executionFrom: String(now), executionUntil: String(cutoff - 60n), settleBefore: String(cutoff) };
      const graphProviders = [], graphRecipients = [], offers = [];
      stage('prepare-graph-' + operationNumber + '-from-existing-note');
      for (let slot = 0; slot < graphShapes[index].length; slot++) {
        const leg = graphShapes[index][slot];
        const provider = await createNativeDispatchGate({ path: join(privateDirectory, `provider-${index}-${slot}.vault`),
          password: fresh(), evmRuntime: evm, system, poolIndex: 0, nativeRuntime: leg.family === 'BTC' ? bitcoin : solana,
          observer: quorum, rule: rules[leg.family === 'SOL' ? 0 : 1], recipientIndex: leg.recipientIndex,
          terms: { ...terms, amount: leg.amount }, acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE });
        providers.push(provider); graphProviders.push({ slot, family: leg.family, recipientIndex: leg.recipientIndex, provider });
        const offer = provider.offer();
        const recipient = await createNativeRecipientProcess({ mode: 'create',
          path: join(privateDirectory, `recipient-${index}-${slot}.vault`), password: fresh(),
          expectedTerms: { scope: terms.scope, policy: terms.policy, asset: terms.asset,
            hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment), operationId, slot,
            evidencePolicy: offer.evidencePolicy, value: leg.value, settleBefore: String(cutoff), actionTemplate: offer.actionTemplate },
          withdrawalRecipient: bare(evm.accounts[slot + 1]) });
        recipients.push({ recipient, value: leg.value, destinationIndex: slot + 1,
          eligibleForExit: !(recoveryCase && index === 0) });
        graphRecipients.push(recipient); offers.push({ provider: offer, payout: await recipient.offer() });
      }
      await owner.owner.prepareNativeOperation({ ownerOperationRef: reference, identitySHA256: objectDigest(identity),
        sourceNoteId: source.noteId, nativeConfig: {
          scope: identity.scope, policy: identity.policy, asset: identity.asset.identity,
          hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment), operationId,
          fundingNotBefore: String(now), fundingValidUntil: String(now + 600n), settleBefore: String(cutoff),
          nodes: offers.map((offer, slot) => {
            const { settleBefore: _cutoff, ...actionTemplate } = offer.provider.actionTemplate;
            return { id: 'leg-' + slot, dependsOn: slot === 0 ? [] : ['leg-' + (slot - 1)],
              evidencePolicy: offer.provider.evidencePolicy, actionTemplate, recipientOffer: offer.payout };
          }),
        } });
      const invoiceSignatures = [];
      for (const invoice of await owner.owner.nativeInvoiceRequests(reference)) {
        invoiceSignatures.push((await graphRecipients[invoice.slot].acceptInvoice(invoice.invoice)).invoiceSignature);
        await graphProviders[invoice.slot].provider.bindQuote({ recipientCustody: graphRecipients[invoice.slot] });
      }
      wipePrivate(await owner.owner.authorizeOperation({ ownerOperationRef: reference, invoiceSignatures }));
      const prepared = await prepareGenericBalanceNativeProofs({ owner, ownerOperationRef: reference }, {
        onStage: value => stage('graph-' + operationNumber + '-' + value.stage), onProof: privateProof,
      });
      await accountAuthority.ownerActions.registerGraph({ ownerOperationRef: reference, prepared, providers: graphProviders });
      wipePrivate(prepared);
      const requestId = 'generic_graph_' + operationNumber + '_0001';
      await account.prepare(requestFor(requestId, 'GRAPH', reference));
      if (recoveryCase && index === 0) {
        await assert.rejects(account.execute(requestId), /JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED/);
        assert.equal(injectedGraphInterruption, true, 'GENERIC_ACCOUNT_EXPECTED_GRAPH_INTERRUPTION');
        assert.equal(owner.report().suspended, true, 'GENERIC_ACCOUNT_OWNER_ACTIVE_DURING_NATIVE');
        const pending = await readNativeSystemState(evm, system, 0);
        assert.equal(pending.ledger.publicState.backedAmount, '50000');
        assert.equal(pending.ledger.publicState.liveReservations, 1);
        assert.equal(pending.state.receiptCount, '1');
        assert.equal(pending.state.spentTagCount, '0');
        assert.equal(bitcoin.transfers.length, 1); assert.equal(solana.transfers.length, 0);
        report.controlledGraphInterruption.failure = report.executionFailure;
        delete report.executionFailure;
        interruptedGraph = { reference, requestId, cutoff: String(cutoff) };
        report.operations.push({ index: 1, nativeOrder: ['BTC'], outcome: 'DELIVERED_PENDING_RECOVERY',
          interruptedAt: new Date().toISOString(), pool: pending.ledger.publicState, hub: pending.state });
        await audit();
        continue;
      }
      if (!recoveryCase && index === 0) {
        let executionError;
        try { await account.execute(requestId); } catch (error) { executionError = error; }
        // Preserve a real host failure instead of replacing it with the planned
        // fault-injection assertion before the first actual settlement exists.
        if (!injectedCoordinatorLoss) {
          throw executionError ?? new Error('GENERIC_ACCOUNT_EXPECTED_COORDINATOR_LOSS');
        }
        assert.ok(executionError, 'GENERIC_ACCOUNT_LOST_REPLY_MUST_REJECT');
        const transfers = { solana: solana.transfers.length, bitcoin: bitcoin.transfers.length };
        const transactionCount = evm.transactions.length;
        await account.restartCoordinator();
        assert.equal((await account.reconcile(requestId)).state, 'CONFIRMED');
        assert.deepEqual({ solana: solana.transfers.length, bitcoin: bitcoin.transfers.length }, transfers);
        assert.equal(evm.transactions.length, transactionCount, 'GENERIC_ACCOUNT_RECONCILE_RESENT');
        report.coordinatorLoss.reconciledOriginalWithoutAnyNewTransaction = true;
        report.coordinatorLoss.ownerStillSuspended = owner.report().suspended;
      } else assert.equal((await account.execute(requestId)).state, 'CONFIRMED');
      assert.equal(owner.report().suspended, true, 'GENERIC_ACCOUNT_OWNER_ACTIVE_DURING_NATIVE');
      const settled = await readNativeSystemState(evm, system, 0);
      assert.equal(settled.ledger.publicState.backedAmount, '50000');
      assert.equal(settled.ledger.publicState.liveReservations, recoveryCase ? 1 : 0);
      report.operations.push({ index: operationNumber, nativeOrder: graphShapes[index].map(leg => leg.family),
        outcome: 'SETTLED', actualSettledAt: new Date().toISOString(), pool: settled.ledger.publicState, hub: settled.state });
      await audit();
      console.log(JSON.stringify({ result: 'ACTUAL_GENERIC_REUSABLE_ACCOUNT_GRAPH_SETTLED', operation: operationNumber, runId }));
    }

    if (recoveryCase) {
      assert.ok(interruptedGraph, 'GENERIC_ACCOUNT_ORIGINAL_INTERRUPTION_REQUIRED');
      assert.equal(owner.report().suspended, true, 'GENERIC_ACCOUNT_OWNER_REQUIRED_ABSENT');
      stage('stop-foreign-nodes-before-owner-independent-account-recovery');
      await audit();
      report.foreignStoppedBeforeRecovery = { bitcoin: await bitcoin.close(), solana: await solana.close() };
      // An early recovery request cannot send or change the signed deadline.
      const earlyTransactions = evm.transactions.length;
      await assert.rejects(account.recover(interruptedGraph.requestId));
      assert.equal(evm.transactions.length, earlyTransactions, 'GENERIC_ACCOUNT_EARLY_RECOVERY_EFFECT');
      await evm.advanceTo(interruptedGraph.cutoff);
      stage('recover-original-budget-with-owner-and-foreign-nodes-absent');
      let recoveryError;
      try { await account.recover(interruptedGraph.requestId); } catch (error) { recoveryError = error; }
      if (!injectedCoordinatorLoss) throw recoveryError ?? new Error('GENERIC_ACCOUNT_EXPECTED_RECOVERY_REPLY_LOSS');
      assert.ok(recoveryError, 'GENERIC_ACCOUNT_LOST_RECOVERY_REPLY_MUST_REJECT');
      const transfers = { bitcoin: bitcoin.transfers.length, solana: solana.transfers.length };
      const transactionCount = evm.transactions.length;
      await account.restartCoordinator();
      const recovered = await account.reconcile(interruptedGraph.requestId);
      assert.equal(recovered.state, 'CONFIRMED');
      assert.equal(recovered.confirmation.outcome.disposition, 'RECOVERED');
      assert.equal(evm.transactions.length, transactionCount, 'GENERIC_ACCOUNT_RECOVERY_RECONCILE_RESENT');
      assert.deepEqual({ bitcoin: bitcoin.transfers.length, solana: solana.transfers.length }, transfers);
      assert.equal(owner.report().suspended, true, 'GENERIC_ACCOUNT_OWNER_USED_FOR_RECOVERY');
      report.coordinatorLoss.reconciledOriginalWithoutAnyNewTransaction = true;
      report.coordinatorLoss.ownerStillSuspended = true;
      report.operations[0].outcome = 'RECOVERED';
      report.operations[0].actualRecoveredAt = new Date().toISOString();
      report.ownerIndependentRecovery = { ownerAbsentThroughIssuanceAndReconciliation: true,
        foreignRuntimesStopped: true, originalNativeDeliveryNotRolledBack: true,
        budget: '20000', disposition: recovered.confirmation.outcome.disposition };
      const repeated = await account.recover(interruptedGraph.requestId);
      assert.equal(repeated.confirmation.outcome.disposition, 'RECOVERED');
      assert.equal(evm.transactions.length, transactionCount, 'GENERIC_ACCOUNT_RECOVERY_DUPLICATE_SEND');
      await audit();
      console.log(JSON.stringify({ result: 'ACTUAL_OWNER_INDEPENDENT_GENERIC_ACCOUNT_RECOVERY', runId }));
    }

    stage('explicit-owner-change-and-recipient-note-exits');
    await owner.restart();
    if (recoveryCase) {
      const credit = await accountAuthority.ownerActions.recoveryCreditRequest(interruptedGraph.reference);
      assert.equal((await owner.owner.reconcileRecovery(credit)).recoveryStage, 'CONFIRMED');
    }
    const finalBalance = await owner.owner.privateBalance();
    assert.equal(finalBalance.available, recoveryCase ? '30000' : '10000');
    const ownerNotes = finalBalance.notes.filter(note => note.status === 'AVAILABLE');
    assert.equal(ownerNotes.length, recoveryCase ? 2 : 1);
    for (let index = 0; index < ownerNotes.length; index++) {
      const finalNote = ownerNotes[index], exitRef = fresh(), requestId = 'explicit_owner_exit_000' + index;
      await owner.owner.prepareWithdrawal({ ownerOperationRef: exitRef, identitySHA256: objectDigest(identity),
        sourceNoteId: finalNote.noteId, recipient: bare(evm.accounts[3]), epoch: String((await evm.time()) / 600n) });
      wipePrivate(await owner.owner.withdrawalInput(exitRef));
      await accountAuthority.ownerActions.registerExit(exitRef);
      await account.prepare(requestFor(requestId, 'EXIT', exitRef));
      assert.equal((await account.execute(requestId)).state, 'CONFIRMED');
    }
    assert.equal((await owner.owner.privateBalance()).available, '0');
    assert.equal((await evm.balance(evm.accounts[3])) - destinationBefore[2], recoveryCase ? 30000n : 10000n);
    const withdrawal = createProofProcess({ purpose: 'recipient', modes: ['withdraw_balance'] });
    extraProofRoles.push(withdrawal);
    for (let index = 0; index < recipients.length; index++) {
      const recipient = recipients[index].recipient;
      const authorized = await authorizeCurrentNativeRecipientWithdrawal({ runtime: evm, system, poolIndex: 0, recipient });
      if (!recipients[index].eligibleForExit) {
        assert.equal(authorized.status, 'PAYOUT_NOT_ISSUED_AT_OBSERVATION', 'GENERIC_ACCOUNT_REFUNDED_GRAPH_PAYOUT_MINTED');
        continue;
      }
      assert.equal(authorized.status, 'AUTHORIZED_UNSPENT_AT_OBSERVATION');
      const proof = await withdrawal.prove('withdraw_balance', authorized.witness,
        authorized.expectedPublicInputs, 'generic-account-recipient-exit');
      privateProof({ mode: 'withdraw_balance', proof });
      await evm.send('withdraw issued generic account recipient note', { to: pool.address,
        data: pool.proofData('withdraw_balance', proof.proof, proof.publicInputs) });
      wipePrivate(authorized.witness); wipePrivate(proof);
    }
    await withdrawal.close();
    assert.equal((await evm.balance(evm.accounts[1])) - destinationBefore[0], recoveryCase ? 10000n : 30000n);
    assert.equal((await evm.balance(evm.accounts[2])) - destinationBefore[1], 10000n);
    const final = await readNativeSystemState(evm, system, 0);
    assert.equal(final.ledger.publicState.backedAmount, '0');
    assert.equal(final.ledger.publicState.actualAssetBalance, '0');
    assert.equal(final.ledger.publicState.liveReservations, 0);
    assert.equal(final.state.receiptCount, '3');
    assert.equal(final.state.spentTagCount, recoveryCase ? '4' : '8');
    assert.equal(bitcoin.transfers.length, 2); assert.equal(solana.transfers.length, 1);
    assert.equal(BigInt(await pool.call('canRetire()')), 1n);
    const other = await readNativeSystemState(evm, system, 1);
    assert.equal(other.ledger.publicState.backedAmount, '0');
    assert.equal(other.ledger.publicState.leaves, 0);
    report.finalState = { pool: final.ledger.publicState, hub: final.state, secondPool: other.ledger.publicState };
    report.account = await account.snapshot();
    report.singleDepositReused = true; report.realChangeSpentBySecondGraph = true;
    report.multipleNativeGraphShapesAccepted = !recoveryCase;
    report.graphOutcomes = recoveryCase ? ['PARTIAL_DELIVERY_RECOVERED', 'SETTLED'] : ['SETTLED', 'SETTLED'];
    report.explicitOwnerAndRecipientExits = true;
    report.classification = recoveryCase
      ? 'ACTUAL_REUSABLE_GENERIC_ACCOUNT_PARTIAL_DELIVERY_RECOVERY_SECOND_GRAPH_SETTLEMENT_AND_EXITS_LOCAL_ONLY'
      : 'ACTUAL_REUSABLE_GENERIC_BALANCE_TWO_GRAPHS_COORDINATOR_RESTART_AND_EXITS_LOCAL_ONLY';
    stage('completed');
  } catch (error) {
    terminalError = error; report.failedPhase = report.phase; report.phase = 'failed'; report.error = safe(error);
    report.classification = 'GENERIC_BALANCE_ACCOUNT_INCOMPLETE';
    if (evm && system) {
      try { report.finalObservedState = (await readNativeSystemState(evm, system, 0)).ledger.publicState; }
      catch (failure) { report.finalObservationError = safe(failure); }
    }
    if (accountAuthority) {
      try { writeFileSync(join(privateDirectory, 'authority-final-state.json'), json(await accountAuthority.privateStatus()), { mode: 0o600 }); }
      catch (failure) { report.authorityObservationError = safe(failure); }
    }
    report.unresolvedLocalBackingIsNotRefunded = Boolean(report.finalObservedState?.backedAmount !== '0');
    await audit();
  } finally {
    const cleanup = [];
    for (const [name, item] of [['account', account], ['authority', accountAuthority], ['owner', owner],
      ...recipients.map(({ recipient }, index) => ['recipient-' + index, recipient]),
      ...providers.map((provider, index) => ['provider-' + index, provider]),
      ...extraProofRoles.map((role, index) => ['proof-' + index, role])]) {
      if (!item) continue;
      try { cleanup.push({ name, result: await item.close() }); }
      catch (error) { cleanup.push({ name, error: safe(error) }); terminalError ??= error; }
    }
    await audit();
    for (const [name, runtime] of [['bitcoin', bitcoin], ['solana', solana], ['evm', evm]]) {
      if (!runtime) continue;
      try { cleanup.push({ name, result: await runtime.close() }); }
      catch (error) { cleanup.push({ name, error: safe(error) }); terminalError ??= error; }
    }
    report.cleanup = cleanup;
    try { assert.deepEqual(sourceManifest(), report.source); report.sourceUnchanged = true; }
    catch (error) { report.sourceUnchanged = false; terminalError ??= error; }
    report.completedAt = new Date().toISOString();
    if (terminalError) { report.classification = 'GENERIC_BALANCE_ACCOUNT_INCOMPLETE'; report.phase = 'failed'; report.error ??= safe(terminalError); }
    persist();
    const files = [];
    const visit = path => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile()) { const bytes = readFileSync(child); files.push({ path: relative(directory, child), bytes: bytes.length, sha256: hash(bytes) }); }
      }
    };
    visit(directory);
    writeFileSync(join(directory, 'terminal-manifest.json'), json({ classification: report.classification,
      completedAt: report.completedAt, sourceUnchanged: report.sourceUnchanged, privateAuditExported: false,
      files: files.sort((a, b) => a.path.localeCompare(b.path)) }));
    process.removeListener('SIGTERM', onTerm); process.removeListener('SIGINT', onInt);
  }
  if (terminalError) throw terminalError;
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGenericBalanceAccount().then(result => console.log(JSON.stringify({ runId: result.runId, phase: result.phase })))
    .catch(error => { console.error(JSON.stringify(safe(error))); process.exitCode = 1; });
}
