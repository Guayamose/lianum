/** Original BTC-to-SOL SOURCE delivery for the fixed device-root SPL flow.
 * The HTTP bootstrap supplies its genuine original resources once. Requests
 * cannot choose providers, account roles, native wires or retry policy.
 * This owner retains the admission journal, observations and resource cleanup.
 */
import { randomBytes } from "node:crypto";
const deviceHttpFail = () => {
  throw Error("NATIVE_CLAIM_DEVICE_TLS_CONFIGURATION");
};
export async function createDeviceRootSplOriginalSourceExecutionV4(original) {
  const {
    runtime,
    bitcoin,
    graphBitcoin,
    graphSolana,
    claims,
    bootstrap,
    observer,
    graphQuorum,
    controller,
    ingressProverIdentity,
    sourceProvider,
    sourceBinding,
    directory,
  } = original;
  const [
    { mkdir },
    { join },
    { createHash },
    { createClaimVaultSession },
    { assertOwnedFlatNativeProvider },
    { createFlatOwnerProcess },
    { createFlatOwnerNativeClaimObserver },
    { createFlatNativeExecution },
    { createFlatAccountAuthority },
    { createGenericAccountKeeper },
    { createNativeRecipientProcess },
    { decodeDepositIntentInputs },
    { claimDomainCommitment },
    { validateSolanaBindingTransaction },
    { isDeepStrictEqual },
  ] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("node:crypto"),
    import("../../claims/storage/vault-session.mjs"),
    import("../../providers/native-provider.mjs"),
    import("../../custody/processes/flat-owner-process.mjs"),
    import("../../custody/observers/flat-owner-native-claim-observer.mjs"),
    import("../../execution/account/execution/flat-native-execution.mjs"),
    import("../../accounts/authority/flat-account-authority.mjs"),
    import("@lianum/engine/accounts/keeper"),
    import("../../execution/native/recipients/native-recipient-process.mjs"),
    import("@lianum/engine/execution/inputs/deposit-intent"),
    import("@lianum/engine/claims/framing"),
    import("@lianum/engine/native/native-receipt-binding"),
    import("node:util"),
  ]);
  const system = claims.flatSystem,
    domain = system.pools[0].domain,
    secret = () => randomBytes(32).toString("hex"),
    digest = (value) => createHash("sha256").update(value).digest("hex");
  const expected = {
    runtime,
    system,
    poolIndex: 0,
    nativeRuntime: graphSolana,
    operatorQuorum: graphQuorum,
    family: "2",
    recipientIndex: 1,
  };
  let owner,
    recipient,
    execution,
    account,
    accountKeeper,
    vault,
    record,
    closing = false,
    closed = false,
    closeWork,
    work = null,
    admitted = false,
    sourceIntent = null,
    graphAdmitted = false;
  let observationTail = Promise.resolve();
  const observations = new Set(),
    operationId = secret(),
    reference = secret(),
    requestId = "device_root_spl_original_source_v4",
    proofs = [];
  const current = () => {
    if (closed) throw Error("CLAIM_DEVICE_SPL_SOURCE_CLOSED");
    assertOwnedFlatNativeProvider(sourceProvider, expected);
  };
  const open = () => {
    if (closing) throw Error("CLAIM_DEVICE_SPL_SOURCE_CLOSED");
    current();
  };
  const read = async () => {
    const actual = await vault.read();
    if (!isDeepStrictEqual(actual, record))
      throw Error("CLAIM_DEVICE_SPL_SOURCE_JOURNAL_CHANGED");
    return actual.data;
  };
  const save = async (phase) => {
    await read();
    const next = await vault.update(record.revision, (data) => ({
      ...data,
      phase,
      intentId: sourceIntent,
      graphAdmitted,
      proofs: structuredClone(proofs),
    }));
    const actual = await vault.read();
    if (!isDeepStrictEqual(actual, next))
      throw Error("CLAIM_DEVICE_SPL_SOURCE_JOURNAL_CHANGED");
    record = next;
  };
  const retainProof = async (label, relation, result) => {
    const bytes =
      typeof result.proof === "string"
        ? Buffer.from(result.proof, "hex")
        : Buffer.from(result.proof);
    try {
      proofs.push({
        label,
        relation,
        proofSHA256: digest(bytes),
        publicInputsSHA256: digest(JSON.stringify(result.publicInputs)),
        evidence: structuredClone(result.evidence ?? result.metrics ?? null),
      });
      await save(record.data.phase);
    } finally {
      bytes.fill(0);
    }
  };
  async function statusOriginal() {
    const data = await read();
    current();
    const binding = await sourceBinding.status();
    current();
    return Object.freeze({
      profile: data.profile,
      phase: data.phase,
      sourceBinding: binding,
      sourceCustody: "BACKEND_LOCAL_QUORUM",
      automaticSourceDelivery: false,
      privateCreditEstablished: false,
      retainedProofReceiptCount: data.proofs.length,
    });
  }
  async function drain() {
    if (work) await work.catch(() => {});
    for (const observation of observations) await observation.catch(() => {});
  }
  async function shutdown() {
    closing = true;
    return (closeWork ??= (async () => {
      await drain();
      let first;
      const stop = async (f) => {
        try {
          await f();
        } catch (e) {
          first ??= e;
        }
      };
      if (account) await stop(() => account.abort());
      if (accountKeeper) await stop(() => accountKeeper.close());
      if (account) await stop(() => account.close());
      if (execution) await stop(() => execution.close());
      if (recipient) await stop(() => recipient.close());
      if (owner) await stop(() => owner.close());
      if (vault) await stop(async () => vault.close());
      closed = true;
      if (first) throw first;
      return { closed: true };
    })());
  }
  try {
    current();
    const base = join(directory, "original-btc-source");
    await mkdir(base, { mode: 0o700 });
    const ownerDirectory = join(base, "source-owner");
    await mkdir(ownerDirectory, { mode: 0o700 });
    vault = createClaimVaultSession({
      path: join(base, "source.vault"),
      password: secret(),
    });
    record = await vault.create({
      profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_EXECUTION_V4",
      phase: "BORN",
      claimDomain: claimDomainCommitment(claims.configs[0]),
      operationId,
      reference,
      intentId: null,
      graphAdmitted: false,
      proofs: [],
    });
    const nativeClaimObserver = await createFlatOwnerNativeClaimObserver({
      runtime,
      system,
      poolIndex: 0,
      claims,
      claimObserver: observer,
    });
    current();
    owner = await createFlatOwnerProcess({
      runtime,
      system,
      poolIndex: 0,
      directory: ownerDirectory,
      password: secret(),
      create: true,
      checkpoint: null,
      onCheckpoint: async () => {},
      nativeClaimObserver,
    });
    current();
    const offer = sourceProvider.offer();
    if (offer.actionTemplate.amount !== "10000000")
      throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_AMOUNT");
    recipient = await createNativeRecipientProcess({
      mode: "create",
      path: join(base, "source-recipient.vault"),
      password: secret(),
      expectedTerms: {
        scope: domain.scope,
        policy: domain.policy,
        asset: domain.asset,
        hubDomain: domain.hubDomain,
        registryCommitment: domain.registryCommitment,
        operationId,
        slot: 0,
        evidencePolicy: offer.evidencePolicy,
        value: "20000",
        settleBefore: offer.actionTemplate.settleBefore,
        actionTemplate: offer.actionTemplate,
      },
      withdrawalRecipient: runtime.accounts[1].slice(2),
    });
    current();
    execution = await createFlatNativeExecution(
      {
        runtime,
        system,
        poolIndex: 0,
        bitcoin: graphBitcoin,
        solana: graphSolana,
        quorum: graphQuorum,
      },
      {
        onProof: ({ label, relation, proof }) =>
          retainProof(label, relation, proof),
      },
    );
    current();
    account = await createFlatAccountAuthority(
      {
        runtime,
        system,
        poolIndex: 0,
        owner,
        nativeExecution: execution,
        accountId: "device_root_spl_btc_source_v4",
        journalId: "device_root_spl_btc_source_journal_v4",
      },
      {
        onProof: ({ label, relation, proof }) =>
          retainProof(label, relation, proof),
      },
    );
    current();
    accountKeeper = await createGenericAccountKeeper({
      config: account.config,
      journal: { path: join(base, "source-account.vault"), password: secret() },
      authority: account.authority,
    });
    current();
    if (
      bitcoin.transfers.length !== 0 ||
      graphBitcoin.transfers.length !== 0 ||
      graphSolana.transfers.length !== 0 ||
      (await sourceBinding.status()).phase !== "BORN"
    )
      throw Error("CLAIM_DEVICE_SPL_SOURCE_BEFORE_FUND_REQUIRED");
    return Object.freeze({
      profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_EXECUTION_V4",
      sourceCustody: "BACKEND_LOCAL_QUORUM",
      automaticSourceDelivery: false,
      deliverOnce() {
        if (arguments.length !== 0) deviceHttpFail();
        open();
        if (admitted) throw Error("CLAIM_DEVICE_SPL_SOURCE_ALREADY_ADMITTED");
        admitted = true;
        work = (async () => {
          try {
            // Every authority is original; this admission is independent of the
            // target mobile FUND. No keys, roles, terms or callbacks are selected
            // by a request or reconstructed from a descriptor/RootNote.
            await save("ADMITTED");
            current();
            const now = await runtime.time();
            current();
            await owner.owner.prepareDepositIntent({
              amount: "100000",
              validFrom: String(now),
              validUntil: String(now + 86400n),
              exitRecipient: runtime.accounts[3].slice(2),
            });
            current();
            await save("SOURCE_D27_PROVING");
            const d27 = await owner.ownerProof.proveDepositIntent();
            await retainProof("source-D27", "deposit_intent", d27);
            current();
            const statement = decodeDepositIntentInputs(d27.publicInputs);
            if (statement.amount !== "100000")
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_D27");
            const handoff = await owner.owner.createNativeClaimIngressHandoff({
              claimDomain: claimDomainCommitment(claims.configs[0]),
              ingressProverIdentity,
              statement,
            });
            current();
            const prepared = await controller.prepare({ handoff });
            current();
            sourceIntent = prepared.intentId;
            await save("SOURCE_NATIVE_ADMITTED");
            await controller.preposition({ intentId: sourceIntent });
            current();
            await owner.suspend();
            current();
            if (
              owner.report().available !== false ||
              owner.report().childExited !== true
            )
              throw Error("CLAIM_DEVICE_SPL_SOURCE_OWNER_STILL_PRESENT");
            await controller.ingress({ intentId: sourceIntent });
            current();
            const receipt = await controller.privateNativeReceipt({
              operationId: sourceIntent,
            });
            current();
            if (receipt.family !== "1" || receipt.broadcastAttempts !== 1)
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_NATIVE_ONCE");
            await bitcoin.confirm(receipt.nativeId);
            current();
            await controller.reconcile({ operationId: sourceIntent });
            current();
            await save("SOURCE_CI51_ISSUING");
            const issued = await controller.issue({
              intentId: sourceIntent,
              handoff,
            });
            current();
            if (issued.status !== "ISSUED")
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_ISSUE");
            await owner.restart();
            current();
            await owner.owner.reconcileDepositIntent(issued.submission);
            current();
            await save("SOURCE_PRIVATE_CBTC_ISSUED");
            const offer = sourceProvider.offer(),
              { settleBefore, ...actionTemplate } = offer.actionTemplate;
            await owner.owner.prepareAuthorization({
              changeRecipient: runtime.accounts[3].slice(2),
              recoveryRecipient: runtime.accounts[3].slice(2),
              nativeConfig: {
                scope: domain.scope,
                policy: domain.policy,
                asset: domain.asset,
                hubDomain: domain.hubDomain,
                registryCommitment: domain.registryCommitment,
                operationId,
                fundingNotBefore: actionTemplate.executionFrom,
                fundingValidUntil: String(
                  BigInt(actionTemplate.executionFrom) + 1800n,
                ),
                settleBefore,
                nodes: [
                  {
                    id: "original-spl-sol-source",
                    dependsOn: [],
                    evidencePolicy: offer.evidencePolicy,
                    actionTemplate,
                    recipientOffer: await recipient.offer(),
                  },
                ],
              },
            });
            current();
            const invoices = await owner.owner.invoiceRequests();
            current();
            if (invoices.length !== 1 || invoices[0].slot !== 0)
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_INVOICE");
            const accepted = await recipient.acceptInvoice(invoices[0].invoice);
            current();
            await sourceProvider.bindQuote({ recipientCustody: recipient });
            current();
            const originalQuote = await recipient.acceptedQuote();
            current();
            await owner.owner.authorize({
              invoiceSignatures: [accepted.invoiceSignature],
            });
            current();
            await save("SOURCE_U_PROVING");
            const authorization = await owner.ownerProof.proveAuthorization();
            await retainProof("source-U", "authorization", authorization);
            current();
            const rolePackets = {};
            for (const name of ["reservation", "recovery", "assembler"])
              rolePackets[name] = (await owner.roles[name]()).select();
            for (const name of ["local", "dependency"]) {
              rolePackets[name] = [];
              for (let slot = 0; slot < 4; slot++)
                rolePackets[name].push(
                  (await owner.roles[name](slot)).select(),
                );
            }
            current();
            for (let slot = 0; slot < 4; slot++)
              if (rolePackets.local[slot].local.value.active !== (slot === 0))
                throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_PADDING");
            await account.ownerActions.registerGraph({
              ownerOperationRef: reference,
              prepared: {
                authorization: {
                  proof: authorization.proof,
                  publicInputs: [...authorization.publicInputs],
                },
                rolePackets,
              },
              providers: [
                {
                  slot: 0,
                  family: "2",
                  recipientIndex: 1,
                  rule: bootstrap.graphSolanaRule,
                  rulePath: bootstrap.rulePaths[2],
                  deliveryRiskSalt: originalQuote.deliveryRiskSalt,
                  provider: sourceProvider,
                },
              ],
            });
            current();
            await accountKeeper.prepare({
              requestId,
              kind: "GRAPH",
              ownerOperationRef: reference,
              assetId: account.assetId,
            });
            current();
            graphAdmitted = true;
            await save("SOURCE_GRAPH_ADMITTED");
            await accountKeeper.execute(requestId);
            current();
            const terminal = execution.snapshot(reference);
            if (terminal.outcome !== "FULFILLED")
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_GRAPH_UNRESOLVED");
            if (
              graphSolana.transfers.length !== 1 ||
              graphBitcoin.transfers.length !== 0
            )
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_DELIVERY_ONCE");
            const delivered = graphSolana.transfers[0];
            if (
              delivered.phase !== "OBSERVED_FINALIZED" ||
              delivered.broadcastAttempts !== 1 ||
              delivered.intent.lamports !== "10000000"
            )
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_FINALITY");
            const wire = validateSolanaBindingTransaction(
              delivered.nativeWire,
              delivered.intent,
            );
            if (
              wire.signatureHex !== delivered.nativeId ||
              wire.transactionSHA256 !== delivered.transactionSHA256 ||
              delivered.observation.nativeWire !== delivered.nativeWire
            )
              throw Error("CLAIM_DEVICE_SPL_SOURCE_ORIGINAL_WIRE");
            await save("SOURCE_GRAPH_OBSERVED");
            const quote = await sourceBinding.bindObservedOriginalOnce();
            current();
            await save("TARGET_QUOTED");
            return Object.freeze({
              profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_EXECUTION_V4",
              phase: "TARGET_QUOTED",
              quote,
              claimCustody: "DEVICE_ROOT_NOTE",
              sourceCustody: "BACKEND_LOCAL_QUORUM",
              privateCreditEstablished: false,
            });
          } catch (error) {
            try {
              await save("UNKNOWN");
            } catch {}
            throw error;
          }
        })();
        work.catch(() => {});
        return work;
      },
      observe() {
        if (arguments.length !== 0) deviceHttpFail();
        open();
        const observation = observationTail.then(async () => {
          if (work) await work.catch(() => {});
          current();
          if (sourceIntent)
            await controller.reconcile({ operationId: sourceIntent });
          current();
          if (graphAdmitted) await accountKeeper.reconcile(requestId);
          current();
          return statusOriginal();
        });
        observationTail = observation.catch(() => {});
        observations.add(observation);
        observation
          .finally(() => observations.delete(observation))
          .catch(() => {});
        return observation;
      },
      status() {
        if (arguments.length !== 0) deviceHttpFail();
        open();
        return statusOriginal();
      },
      drain() {
        if (arguments.length !== 0) deviceHttpFail();
        return drain();
      },
      close() {
        if (arguments.length !== 0) deviceHttpFail();
        return shutdown();
      },
      toJSON() {
        throw Error("CLAIM_DEVICE_SPL_SOURCE_NOT_SERIALIZABLE");
      },
    });
  } catch (error) {
    try {
      await shutdown();
    } catch {}
    throw error;
  }
}
