/** Private interface operations.
 * The owning authority supplies live state and its original guards through context.
 * This factory does not register, copy or grant an account capability.
 */
/** Separately versioned native-value graph-only wallet binding. Historical flat modules remain unchanged. */
/** Private account authority for the fixed local flat owner. One source, one
 * authorization, and its original exits; no balance rollover is implemented.
 * The generic account keeper/journal/coordinator are reused without changes. */
import assert from "node:assert/strict";
import { copy, immutable, sha } from "../../../../../engine/src/execution/accounts/generic-account-journal.mjs";
import { exactRecord } from "../../../execution/encoding/commitments.mjs";
import { validateNativeValueManualReview, validateNativeValueManualRecords } from "../../../../../custody/src/preparation/native-value-owner-manual-binding-v1.mjs";
import { flatAccountGraphBinding, validateFlatManualGraphAdmissionTime } from "../flat-account-validation.mjs";
import { validateWrappedClaimOperationalRegistration } from "../../../claims/ingress/operational-registration-v2.mjs";
import { validateOwnerGraphReview } from "@lianum/mobile-protocol/wallet/owner-graph-review-v1";

export function createNativeValueAccountInterface(context) {
  const authority = Object.freeze({
    assertAuthority: async expected => {
      context.continueWork(); await context.healthy(); assert.deepEqual(expected, context.accountIdentity, 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
      return { version: 1, available: true, identity: copy(context.accountIdentity) };
    },
    prepare: value => context.exclusive(async () => {
      await context.healthy(); const { bound, entry } = context.request(value);
      assert.ok(context.manualKeeper === null && !context.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.kind !== 'GRAPH' || entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
      if (entry.kind === 'GRAPH') await context.manualGraphTime(bound.ownerOperationRef);
      if (entry.nativeManualReview) await context.requireFixedManualEpoch(bound.ownerOperationRef);
      if (entry.request === null) await context.update(bound.ownerOperationRef, { request: bound });
      return { version: 1, state: 'PREPARED', bindingSHA256: bound.bindingSHA256, assetBindingSHA256: bound.assetBindingSHA256 };
    }),
    execute: value => context.exclusive(async () => {
      await context.healthy(); const { bound, entry } = context.request(value), ref = bound.ownerOperationRef;
      assert.ok(context.manualKeeper === null && !context.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.request !== null, 'FLAT_ACCOUNT_NOT_PREPARED');
      if (entry.outcome !== null) return context.reconcileOriginal(bound);
      assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
      await context.update(ref, { stage: 'EXECUTING' });
      try {
        await context.onStage({ reference: ref, kind: bound.kind, stage: 'EXECUTING' });
        const result = bound.kind === 'GRAPH' ? await context.executeGraph(ref)
          : { receipt: await context.executeNote(ref), outcome: 'APPLIED' };
        return await context.confirmTerminal(bound, result);
      } catch (error) { await context.unresolved(ref, error); throw error; }
    }),
    reconcile: value => context.exclusive(async () => {
      await context.healthy(); const { bound, entry } = context.request(value);
      assert.ok(context.manualKeeper === null && !context.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'FLAT_ACCOUNT_NOT_STARTED');
      return context.reconcileOriginal(bound);
    }),
    recover: value => context.exclusive(async () => {
      await context.healthy(); const { bound } = context.request(value);
      assert.ok(context.manualKeeper === null && !context.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      try { return await context.recoverOriginal(bound); }
      catch (error) { await context.unresolved(bound.ownerOperationRef, error); throw error; }
    }),
    observe: value => context.exclusive(async () => {
      await context.healthy(); exactRecord(value, ['request', 'outcome', 'challenge']);
      const { bound, entry } = context.request(value.request);
      assert.ok(entry.outcome !== null, 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
      assert.deepEqual(value.outcome, entry.outcome, 'FLAT_ACCOUNT_OUTCOME_CHANGED');
      assert.match(value.challenge, /^[0-9a-f]{32}$/, 'FLAT_ACCOUNT_CHALLENGE');
      await context.reconcileOriginal(bound);
      const original = await context.runtime.block('0x' + BigInt(entry.outcome.blockNumber).toString(16));
      assert.equal(context.bare(original.hash), entry.outcome.blockHash, 'FLAT_ACCOUNT_OUTCOME_REORG');
      const view = await context.reader.read(), state = view.ledger.publicState;
      await context.runtime.assertCanonical(original); await context.reader.assertCurrent(view);
      assert.ok(BigInt(state.actualAssetBalance) >= BigInt(state.backedAmount), 'FLAT_ACCOUNT_BACKING_DEFICIT');
      assert.equal(state.surplus, String(BigInt(state.actualAssetBalance) - BigInt(state.backedAmount)), 'FLAT_ACCOUNT_BACKING_CHANGED');
      return { version: 1, status: 'LIVE', bindingSHA256: bound.bindingSHA256, assetBindingSHA256: bound.assetBindingSHA256,
        outcomeId: entry.outcome.outcomeId, challenge: value.challenge, observedAt: Date.now(),
        blockNumber: view.head.number, blockHash: view.head.hash, canonicalOutcomeBlockHash: entry.outcome.blockHash,
        backing: { held: state.actualAssetBalance, liabilities: state.backedAmount, surplus: state.surplus, deficit: '0' } };
    }),
  });
  const capability = Object.freeze({ config: context.config, registry: context.config.registry, assetId: context.asset.assetId, authority,
    features: Object.freeze({ privateNotes: true, nativeGraph: context.nativeExecution !== null, automaticTokenApproval: false, manualNativeValueGraph: context.nativeExecution !== null, legacyManualNoteConsent: false, nativeManualNoteConsent: !context.wrapped, manualWrappedGraph: context.wrapped && context.nativeExecution !== null }),
    ownerView: () => context.exclusive(context.privateOwnerView),
    manualLifecycle: Object.freeze(context.wrapped ? {} : context.manualLifecycle),
    ownerActions: Object.freeze(context.selectOwnerActions({
      async createManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const { createNativeValueOwnerManualPreparation } = await import("../../../../../custody/src/preparation/native-value-owner-manual-preparation-v1.mjs");
        return createNativeValueOwnerManualPreparation({ runtime: context.runtime, system: context.system, poolIndex: context.poolIndex, owner: context.owner, account: capability });
      },
      async restoreManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const { restoreNativeValueOwnerManualPreparation } = await import("../../../../../custody/src/preparation/native-value-owner-manual-preparation-v1.mjs");
        return restoreNativeValueOwnerManualPreparation({ runtime: context.runtime, system: context.system, poolIndex: context.poolIndex, owner: context.owner, account: capability });
      },
      registerNativeManualNote: review => context.exclusive(async () => {
        validateNativeValueManualReview(review); review = immutable(review); await context.healthy();
        assert.equal(review.ownerIdentitySHA256, context.identitySHA256, 'NATIVE_VALUE_MANUAL_NOTE_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(context.accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_ACCOUNT');
        assert.equal(review.generationId, sha(context.accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_GENERATION');
        assert.equal(review.originalAccountLifetime, context.config.lifetime, 'NATIVE_VALUE_MANUAL_NOTE_LIFETIME');
        assert.deepEqual(review.asset, context.asset, 'NATIVE_VALUE_MANUAL_NOTE_ASSET');
        const records = await context.owner.ownerView.nativeNotePreparations(); validateNativeValueManualRecords(records);
        const saved = records.records.find(row => row.review.request.ownerOperationRef === review.request.ownerOperationRef);
        assert.equal(saved?.ownerState, 'PREPARED', 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        assert.deepEqual(saved.review, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
        const entry = context.operation(review.request.ownerOperationRef);
        assert.equal(entry.kind, review.kind); assert.equal(entry.role, review.role); assert.equal(entry.ownerKind, review.ownerKind);
        assert.equal(entry.request, null); assert.equal(entry.stage, 'READY'); assert.equal(entry.submission, null);
        assert.ok(!entry.nativeManualReview, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_ONLY');
        await context.update(entry.ownerOperationRef, { nativeManualReview: review });
        await context.requireFixedManualEpoch(entry.ownerOperationRef);
        return context.nativeNoteApproval(review);
      }),
      readNativeManualNoteApproval: review => context.exclusive(async () => {
        validateNativeValueManualReview(review); await context.healthy();
        const entry = context.operation(review.request.ownerOperationRef);
        assert.deepEqual(entry.nativeManualReview, review, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        // Restoring metadata never restores a listener grant or executes.
        return context.nativeNoteApproval(entry.nativeManualReview);
      }),
      // Original registration observation only; no witness, write, retry,
      // admission, proof or submission. A surviving authority remains required.
      readManualRegistration: review => context.exclusive(async () => {
        validateNativeValueManualReview(review); await context.healthy();
        assert.equal(review.ownerIdentitySHA256, context.identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(context.accountIdentity), 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
        assert.deepEqual(review.asset, context.asset, 'FLAT_ACCOUNT_ASSET_CHANGED');
        const r = review.request;
        const entries = context.record.data.operations.filter(entry => entry.ownerOperationRef === r.ownerOperationRef
          || entry.ownerKind === review.ownerKind || entry.request?.requestId === r.requestId);
        if (entries.length === 0) return { status: 'ABSENT' };
        assert.equal(entries.length, 1, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        const entry = entries[0];
        assert.equal(entry.ownerOperationRef, r.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        assert.equal(entry.ownerKind, review.ownerKind); assert.equal(entry.kind, review.kind);
        assert.equal(entry.role, review.role);
        assert.equal(entry.preparationSHA256, sha({ kind: review.kind, ownerKind: review.ownerKind }));
        if (entry.request !== null) {
          for (const field of ['requestId', 'kind', 'ownerOperationRef', 'assetId'])
            assert.equal(entry.request[field], r[field], 'FLAT_ACCOUNT_REQUEST_REBOUND');
          return { status: 'ALREADY_ADMITTED' };
        }
        assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_MANUAL_ALREADY_STARTED');
        assert.equal(entry.submission, null); assert.equal(entry.outcome, null); assert.equal(entry.terminal, null);
        return { status: 'REGISTERED' };
      }),
      registerTopUp: ref => context.exclusive(() => context.register(ref, 'TOP_UP')),
      registerExit: (ref, role) => context.exclusive(() => {
        assert.ok(['source', 'change', 'recovery'].includes(role), 'FLAT_ACCOUNT_EXIT_ROLE');
        return context.register(ref, 'EXIT', role);
      }),
      registerGraph: value => context.exclusive(async () => {
        exactRecord(value, ['ownerOperationRef', 'prepared', 'providers']);
        const prepared = immutable(value.prepared); flatAccountGraphBinding(prepared, context.identity);
        assert.ok(Array.isArray(value.providers), 'FLAT_ACCOUNT_PROVIDERS');
        const providers = Object.freeze(value.providers.map(record => {
          exactRecord(record, ['slot', 'custody', 'deliveryRiskSalt']);
          const { custody, ...metadata } = record;
          return Object.freeze({ ...immutable(metadata), custody });
        }));
        const prior = context.nativeProviderSets.get(value.ownerOperationRef);
        if (prior) {
          assert.equal(prior.length, providers.length, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          providers.forEach((row, i) => {
            assert.equal(row.custody, prior[i].custody, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.slot, prior[i].slot, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.deliveryRiskSalt, prior[i].deliveryRiskSalt, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          });
        } else context.nativeProviderSets.set(value.ownerOperationRef, providers);
        return context.register(value.ownerOperationRef, 'GRAPH', null, { prepared, providers });
      }),
      // PRIVATE explicit owner handoff after the original U/D27/quote graph
      // registration. No HTTP caller can fabricate or alter these terms.
      approveManualNativeValueGraph: value => context.exclusive(async () => {
        exactRecord(value, ['requestId', 'ownerOperationRef']); value = immutable(value);
        assert.ok(typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value.requestId)?.[0] === value.requestId,
          'FLAT_ACCOUNT_REQUEST');
        await context.healthy(); const entry = context.operation(value.ownerOperationRef);
        assert.ok(entry.kind === 'GRAPH' && entry.nativeBinding && entry.request === null && entry.stage === 'READY',
          'FLAT_ACCOUNT_MANUAL_GRAPH_PREPARATION_REQUIRED');
        const route = context.ownedNativeValueManualGraphReview(context.nativeExecution, value.ownerOperationRef, { runtime: context.runtime, system: context.system, poolIndex: context.poolIndex });
        const terms = await context.owner.ownerView.graphPreparationTerms();
        assert.equal(terms.identitySHA256, context.identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        for (const key of ['envelope', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'])
          assert.equal(terms[key], route[key], 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        assert.equal(BigInt(terms.sourceAmount), BigInt(terms.reservedAmount) + BigInt(terms.changeAmount),
          'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        let wrappedBinding = null;
        if (context.wrapped) {
          const registration = validateWrappedClaimOperationalRegistration(context.system.custodyRegistration);
          const claim = registration.claims[context.poolIndex], view = await context.reader.read(), process = context.owner.report();
          assert.equal(claim.config.pool, context.pool.address.slice(2), 'WRAPPED_WALLET_ORIGINAL_CUSTODY_POOL');
          assert.equal(claim.config.wrapperAssetIdentity, context.pool.domain.asset, 'WRAPPED_WALLET_ORIGINAL_WRAPPED_ASSET');
          assert.equal(claim.config.registryCommitment, context.pool.domain.registryCommitment, 'WRAPPED_WALLET_ORIGINAL_REGISTRY');
          assert.ok(view.ledger.commitments.includes('0x' + entry.nativeBinding.inputCommitment), 'WRAPPED_WALLET_ORIGINAL_NOTE_REQUIRED');
          assert.ok(!view.ledger.nullifiers.includes('0x' + entry.nativeBinding.inputNullifier), 'WRAPPED_WALLET_ORIGINAL_NOTE_SPENT');
          assert.equal(process.available, true, 'WRAPPED_WALLET_ORIGINAL_OWNER_UNAVAILABLE');
          context.reference(process.processIdentitySHA256);
          wrappedBinding = immutable({ profile: 'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1',
            accountIdentitySHA256: sha(context.accountIdentity), runtimeIdentitySHA256: sha({ chainId: context.runtime.metadata.chainId,
              genesis: context.runtime.metadata.evmGenesis, bootstrap: context.system.bootstrap }),
            systemProfile: context.system.profile, hub: context.system.hub.address, claimAuthority: context.system.claims.authority.address,
            registryCommitment: context.system.registryCommitment.slice(2), claimDomain: claim.claimDomain,
            processIdentitySHA256: process.processIdentitySHA256, processGeneration: process.generation,
            head: view.head, economicIntentSHA256: sha({ body: { requestId: value.requestId, ownerOperationRef: value.ownerOperationRef },
              route, terms, asset: context.asset.assetId, accountIdentity: context.accountIdentity, sourceNoteCommitment: entry.nativeBinding.inputCommitment }) });
          await context.reader.assertCurrent(view);
        }
        const body = immutable({ requestId: value.requestId, kind: 'GRAPH',
          ownerOperationRef: value.ownerOperationRef, assetId: context.asset.assetId });
        const review = immutable({ version: route.graph ? 2 : 1, profile: route.graph
          ? (context.wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V2' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V3')
          : (context.wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2'),
          ...(context.wrapped ? { wrappedBinding } : {}),
          ...body, asset: { assetId: context.asset.assetId, symbol: context.asset.symbol, decimals: context.asset.decimals },
          ...route, ...terms, originalAccountLifetime: context.config.lifetime,
          observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY', solverOwnLiquidity: true,
          settlementEstablished: false, recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY' });
        if(route.graph)validateOwnerGraphReview(review);
        validateFlatManualGraphAdmissionTime(review, String(await context.runtime.time()));
        // One retained operation has one exact human handoff identity for this
        // authority lifetime. Duplicate issuance cannot rebind its request ID.
        const existing = context.manualGraphApprovals.get(value.ownerOperationRef);
        if (existing) {
          const original = context.manualGraphs.get(existing);
          assert.deepEqual(original.body, body, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
          assert.deepEqual(original.review, review, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
          return existing;
        }
        const approval = Object.freeze(Object.create(null));
        context.manualGraphs.set(approval, { account: capability, body, review, check() {
          context.assertOwnedNativeValueExecution(context.nativeExecution, { runtime: context.runtime, system: context.system, poolIndex: context.poolIndex });
        }, checkRoute() {
          if (context.wrapped) { const process = context.owner.report(); assert.equal(process.processIdentitySHA256, wrappedBinding.processIdentitySHA256);
            assert.equal(process.generation, wrappedBinding.processGeneration, 'WRAPPED_WALLET_OWNER_GENERATION_CHANGED'); }
          assert.deepEqual(context.ownedNativeValueManualGraphReview(context.nativeExecution, value.ownerOperationRef,
            { runtime: context.runtime, system: context.system, poolIndex: context.poolIndex }), route, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        } });
        context.manualGraphApprovals.set(value.ownerOperationRef, approval);
        return approval;
      }),
      recoveryCreditRequest: ref => context.exclusive(async () => {
        await context.healthy(); const entry = context.operation(ref);
        assert.ok(entry.request !== null && entry.kind === 'GRAPH', 'FLAT_ACCOUNT_RECOVERY_GRAPH_ONLY');
        await context.reconcileOriginal(entry.request); const current = context.operation(ref);
        assert.equal(current.outcome?.disposition, 'RECOVERED', 'FLAT_ACCOUNT_RECOVERY_NOT_CONFIRMED');
        return { transactionHash: current.terminal.transactionHash, calldataSHA256: current.terminal.calldataSHA256 };
      }),
    })),
    privateStatus: () => context.exclusive(async () => {
      await context.healthy();
      return { profile: context.accountProfile, keeperRestart: false, reusableBalanceRollover: false,
        operations: context.record.data.operations.map(({ prepared: _private, submission, ...entry }) => ({ ...copy(entry),
          submission: submission ? { kind: submission.kind, calldataSHA256: submission.calldataSHA256,
            transactionHash: submission.transactionHash, dispatchLatched: submission.dispatchLatched,
            ownerConfirmed: submission.ownerConfirmed } : null })) };
    }),
    async abort() {
      assert.ok(context.wrapped || !context.capturing, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME'); context.cancelled = true;
      context.abortPromise ??= (async () => {
        context.activeDeviceOwner?.stop();
        await Promise.allSettled([context.activeLegacy?.abort(), context.proofRunner.abort(), context.nativeExecution?.abort()]);
        await context.idle;
        return { cancelled: true, retainedEncryptedEvidence: true };
      })();
      return context.abortPromise;
    },
    async close() {
      assert.ok(context.wrapped || !context.capturing || context.closed, 'NATIVE_ACCOUNT_CAPTURE_OWNS_LIFETIME');
      assert.equal(context.busy, false, 'FLAT_ACCOUNT_BUSY');
      if (!context.closed) { await context.proofRunner.close(); context.closed = true; context.password = null; context.record = null;
        context.deviceExecutionInstallations.clear();context.deviceExecutionProviders.clear(); }
      return { closed: true, retainedOwnerCustody: true, retainedRuntimes: true };
    },
  });
  return Object.freeze({ authority, capability });
}
