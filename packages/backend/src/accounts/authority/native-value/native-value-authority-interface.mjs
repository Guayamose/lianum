/** Interface operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import assert from "node:assert/strict";
import { copy, immutable, sha } from "@lianum/engine/accounts/journal";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { validateNativeValueManualReview, validateNativeValueManualRecords } from "@lianum/custody/preparation/native-value-owner-manual-binding-v1";
import { flatAccountGraphBinding, validateFlatManualGraphAdmissionTime } from "../flat-account-validation.mjs";
import { validateWrappedClaimOperationalRegistration } from "../../../claims/ingress/operational-registration-v2.mjs";
import { validateOwnerGraphReview } from "@lianum/mobile-protocol/wallet/owner-graph-review-v1";
export function createNativeValueAccountInterface({
  lifecycle,
  journal,
  profile,
  operations,
  manual,
  proofs,
  chain,
  format,
  selection,
  approvals
}) {
  const authority = Object.freeze({
    assertAuthority: async expected => {
      lifecycle.continueWork();
      await lifecycle.healthy();
      assert.deepEqual(expected, profile.accountIdentity, 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
      return {
        version: 1,
        available: true,
        identity: copy(profile.accountIdentity)
      };
    },
    prepare: value => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      const {
        bound,
        entry
      } = operations.request(value);
      assert.ok(!manual.hasKeeper() && !profile.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.kind !== 'GRAPH' || entry.nativeBinding !== null, 'FLAT_ACCOUNT_NATIVE_PREPARATION_REQUIRED');
      if (entry.kind === 'GRAPH') await operations.manualGraphTime(bound.ownerOperationRef);
      if (entry.nativeManualReview) await operations.requireFixedManualEpoch(bound.ownerOperationRef);
      if (entry.request === null) await operations.update(bound.ownerOperationRef, {
        request: bound
      });
      return {
        version: 1,
        state: 'PREPARED',
        bindingSHA256: bound.bindingSHA256,
        assetBindingSHA256: bound.assetBindingSHA256
      };
    }),
    execute: value => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      const {
          bound,
          entry
        } = operations.request(value),
        ref = bound.ownerOperationRef;
      assert.ok(!manual.hasKeeper() && !profile.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(entry.request !== null, 'FLAT_ACCOUNT_NOT_PREPARED');
      if (entry.outcome !== null) return operations.reconcileOriginal(bound);
      assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
      await operations.update(ref, {
        stage: 'EXECUTING'
      });
      try {
        await proofs.onStage({
          reference: ref,
          kind: bound.kind,
          stage: 'EXECUTING'
        });
        const result = bound.kind === 'GRAPH' ? await operations.executeGraph(ref) : {
          receipt: await operations.executeNote(ref),
          outcome: 'APPLIED'
        };
        return await operations.confirmTerminal(bound, result);
      } catch (error) {
        await operations.unresolved(ref, error);
        throw error;
      }
    }),
    reconcile: value => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      const {
        bound,
        entry
      } = operations.request(value);
      assert.ok(!manual.hasKeeper() && !profile.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'FLAT_ACCOUNT_NOT_STARTED');
      return operations.reconcileOriginal(bound);
    }),
    recover: value => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      const {
        bound
      } = operations.request(value);
      assert.ok(!manual.hasKeeper() && !profile.nativeRecoveryManualMode, 'FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
      try {
        return await operations.recoverOriginal(bound);
      } catch (error) {
        await operations.unresolved(bound.ownerOperationRef, error);
        throw error;
      }
    }),
    observe: value => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      exactRecord(value, ['request', 'outcome', 'challenge']);
      const {
        bound,
        entry
      } = operations.request(value.request);
      assert.ok(entry.outcome !== null, 'FLAT_ACCOUNT_TERMINAL_REQUIRED');
      assert.deepEqual(value.outcome, entry.outcome, 'FLAT_ACCOUNT_OUTCOME_CHANGED');
      assert.match(value.challenge, /^[0-9a-f]{32}$/, 'FLAT_ACCOUNT_CHALLENGE');
      await operations.reconcileOriginal(bound);
      const original = await chain.runtime.block('0x' + BigInt(entry.outcome.blockNumber).toString(16));
      assert.equal(format.bare(original.hash), entry.outcome.blockHash, 'FLAT_ACCOUNT_OUTCOME_REORG');
      const view = await chain.reader.read(),
        state = view.ledger.publicState;
      await chain.runtime.assertCanonical(original);
      await chain.reader.assertCurrent(view);
      assert.ok(BigInt(state.actualAssetBalance) >= BigInt(state.backedAmount), 'FLAT_ACCOUNT_BACKING_DEFICIT');
      assert.equal(state.surplus, String(BigInt(state.actualAssetBalance) - BigInt(state.backedAmount)), 'FLAT_ACCOUNT_BACKING_CHANGED');
      return {
        version: 1,
        status: 'LIVE',
        bindingSHA256: bound.bindingSHA256,
        assetBindingSHA256: bound.assetBindingSHA256,
        outcomeId: entry.outcome.outcomeId,
        challenge: value.challenge,
        observedAt: Date.now(),
        blockNumber: view.head.number,
        blockHash: view.head.hash,
        canonicalOutcomeBlockHash: entry.outcome.blockHash,
        backing: {
          held: state.actualAssetBalance,
          liabilities: state.backedAmount,
          surplus: state.surplus,
          deficit: '0'
        }
      };
    })
  });
  const capability = Object.freeze({
    config: profile.config,
    registry: profile.config.registry,
    assetId: profile.asset.assetId,
    authority,
    features: Object.freeze({
      privateNotes: true,
      nativeGraph: chain.nativeExecution !== null,
      automaticTokenApproval: false,
      manualNativeValueGraph: chain.nativeExecution !== null,
      legacyManualNoteConsent: false,
      nativeManualNoteConsent: !profile.wrapped,
      manualWrappedGraph: profile.wrapped && chain.nativeExecution !== null
    }),
    ownerView: () => lifecycle.exclusive(operations.privateOwnerView),
    manualLifecycle: Object.freeze(profile.wrapped ? {} : manual.manualLifecycle),
    ownerActions: Object.freeze(selection.selectOwnerActions({
      async createManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const {
          createNativeValueOwnerManualPreparation
        } = await import("../../../custody/preparation/native-value-owner-manual-preparation-v1.mjs");
        return createNativeValueOwnerManualPreparation({
          runtime: chain.runtime,
          system: chain.system,
          poolIndex: chain.poolIndex,
          owner: chain.owner,
          account: capability
        });
      },
      async restoreManualPreparation() {
        assert.equal(arguments.length, 0, 'NATIVE_VALUE_MANUAL_NOTE_ARGUMENTS');
        const {
          restoreNativeValueOwnerManualPreparation
        } = await import("../../../custody/preparation/native-value-owner-manual-preparation-v1.mjs");
        return restoreNativeValueOwnerManualPreparation({
          runtime: chain.runtime,
          system: chain.system,
          poolIndex: chain.poolIndex,
          owner: chain.owner,
          account: capability
        });
      },
      registerNativeManualNote: review => lifecycle.exclusive(async () => {
        validateNativeValueManualReview(review);
        review = immutable(review);
        await lifecycle.healthy();
        assert.equal(review.ownerIdentitySHA256, profile.identitySHA256, 'NATIVE_VALUE_MANUAL_NOTE_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(profile.accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_ACCOUNT');
        assert.equal(review.generationId, sha(profile.accountIdentity), 'NATIVE_VALUE_MANUAL_NOTE_GENERATION');
        assert.equal(review.originalAccountLifetime, profile.config.lifetime, 'NATIVE_VALUE_MANUAL_NOTE_LIFETIME');
        assert.deepEqual(review.asset, profile.asset, 'NATIVE_VALUE_MANUAL_NOTE_ASSET');
        const records = await chain.owner.ownerView.nativeNotePreparations();
        validateNativeValueManualRecords(records);
        const saved = records.records.find(row => row.review.request.ownerOperationRef === review.request.ownerOperationRef);
        assert.equal(saved?.ownerState, 'PREPARED', 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        assert.deepEqual(saved.review, review, 'NATIVE_VALUE_MANUAL_NOTE_TERMS_CHANGED');
        const entry = operations.operation(review.request.ownerOperationRef);
        assert.equal(entry.kind, review.kind);
        assert.equal(entry.role, review.role);
        assert.equal(entry.ownerKind, review.ownerKind);
        assert.equal(entry.request, null);
        assert.equal(entry.stage, 'READY');
        assert.equal(entry.submission, null);
        assert.ok(!entry.nativeManualReview, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_ONLY');
        await operations.update(entry.ownerOperationRef, {
          nativeManualReview: review
        });
        await operations.requireFixedManualEpoch(entry.ownerOperationRef);
        return operations.nativeNoteApproval(review);
      }),
      readNativeManualNoteApproval: review => lifecycle.exclusive(async () => {
        validateNativeValueManualReview(review);
        await lifecycle.healthy();
        const entry = operations.operation(review.request.ownerOperationRef);
        assert.deepEqual(entry.nativeManualReview, review, 'NATIVE_VALUE_MANUAL_NOTE_ORIGINAL_REQUIRED');
        // Restoring metadata never restores a listener grant or executes.
        return operations.nativeNoteApproval(entry.nativeManualReview);
      }),
      // Original registration observation only; no witness, write, retry,
      // admission, proof or submission. A surviving authority remains required.
      readManualRegistration: review => lifecycle.exclusive(async () => {
        validateNativeValueManualReview(review);
        await lifecycle.healthy();
        assert.equal(review.ownerIdentitySHA256, profile.identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        assert.equal(review.accountIdentitySHA256, sha(profile.accountIdentity), 'FLAT_ACCOUNT_JOURNAL_IDENTITY');
        assert.deepEqual(review.asset, profile.asset, 'FLAT_ACCOUNT_ASSET_CHANGED');
        const r = review.request;
        const entries = journal.rows().filter(entry => entry.ownerOperationRef === r.ownerOperationRef || entry.ownerKind === review.ownerKind || entry.request?.requestId === r.requestId);
        if (entries.length === 0) return {
          status: 'ABSENT'
        };
        assert.equal(entries.length, 1, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        const entry = entries[0];
        assert.equal(entry.ownerOperationRef, r.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_ORIGINAL_CONFLICT');
        assert.equal(entry.ownerKind, review.ownerKind);
        assert.equal(entry.kind, review.kind);
        assert.equal(entry.role, review.role);
        assert.equal(entry.preparationSHA256, sha({
          kind: review.kind,
          ownerKind: review.ownerKind
        }));
        if (entry.request !== null) {
          for (const field of ['requestId', 'kind', 'ownerOperationRef', 'assetId']) assert.equal(entry.request[field], r[field], 'FLAT_ACCOUNT_REQUEST_REBOUND');
          return {
            status: 'ALREADY_ADMITTED'
          };
        }
        assert.equal(entry.stage, 'READY', 'FLAT_ACCOUNT_MANUAL_ALREADY_STARTED');
        assert.equal(entry.submission, null);
        assert.equal(entry.outcome, null);
        assert.equal(entry.terminal, null);
        return {
          status: 'REGISTERED'
        };
      }),
      registerTopUp: ref => lifecycle.exclusive(() => operations.register(ref, 'TOP_UP')),
      registerExit: (ref, role) => lifecycle.exclusive(() => {
        assert.ok(['source', 'change', 'recovery'].includes(role), 'FLAT_ACCOUNT_EXIT_ROLE');
        return operations.register(ref, 'EXIT', role);
      }),
      registerGraph: value => lifecycle.exclusive(async () => {
        exactRecord(value, ['ownerOperationRef', 'prepared', 'providers']);
        const prepared = immutable(value.prepared);
        flatAccountGraphBinding(prepared, profile.identity);
        assert.ok(Array.isArray(value.providers), 'FLAT_ACCOUNT_PROVIDERS');
        const providers = Object.freeze(value.providers.map(record => {
          exactRecord(record, ['slot', 'custody', 'deliveryRiskSalt']);
          const {
            custody,
            ...metadata
          } = record;
          return Object.freeze({
            ...immutable(metadata),
            custody
          });
        }));
        const prior = approvals.nativeProviderSets.get(value.ownerOperationRef);
        if (prior) {
          assert.equal(prior.length, providers.length, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          providers.forEach((row, i) => {
            assert.equal(row.custody, prior[i].custody, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.slot, prior[i].slot, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
            assert.equal(row.deliveryRiskSalt, prior[i].deliveryRiskSalt, 'NATIVE_VALUE_ACCOUNT_CUSTODY_REBOUND');
          });
        } else approvals.nativeProviderSets.set(value.ownerOperationRef, providers);
        return operations.register(value.ownerOperationRef, 'GRAPH', null, {
          prepared,
          providers
        });
      }),
      // PRIVATE explicit owner handoff after the original U/D27/quote graph
      // registration. No HTTP caller can fabricate or alter these terms.
      approveManualNativeValueGraph: value => lifecycle.exclusive(async () => {
        exactRecord(value, ['requestId', 'ownerOperationRef']);
        value = immutable(value);
        assert.ok(typeof value.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value.requestId)?.[0] === value.requestId, 'FLAT_ACCOUNT_REQUEST');
        await lifecycle.healthy();
        const entry = operations.operation(value.ownerOperationRef);
        assert.ok(entry.kind === 'GRAPH' && entry.nativeBinding && entry.request === null && entry.stage === 'READY', 'FLAT_ACCOUNT_MANUAL_GRAPH_PREPARATION_REQUIRED');
        const route = chain.ownedNativeValueManualGraphReview(chain.nativeExecution, value.ownerOperationRef, {
          runtime: chain.runtime,
          system: chain.system,
          poolIndex: chain.poolIndex
        });
        const terms = await chain.owner.ownerView.graphPreparationTerms();
        assert.equal(terms.identitySHA256, profile.identitySHA256, 'FLAT_ACCOUNT_OWNER_IDENTITY');
        for (const key of ['envelope', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']) assert.equal(terms[key], route[key], 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        assert.equal(BigInt(terms.sourceAmount), BigInt(terms.reservedAmount) + BigInt(terms.changeAmount), 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
        let wrappedBinding = null;
        if (profile.wrapped) {
          const registration = validateWrappedClaimOperationalRegistration(chain.system.custodyRegistration);
          const claim = registration.claims[chain.poolIndex],
            view = await chain.reader.read(),
            process = chain.owner.report();
          assert.equal(claim.config.pool, chain.pool.address.slice(2), 'WRAPPED_WALLET_ORIGINAL_CUSTODY_POOL');
          assert.equal(claim.config.wrapperAssetIdentity, chain.pool.domain.asset, 'WRAPPED_WALLET_ORIGINAL_WRAPPED_ASSET');
          assert.equal(claim.config.registryCommitment, chain.pool.domain.registryCommitment, 'WRAPPED_WALLET_ORIGINAL_REGISTRY');
          assert.ok(view.ledger.commitments.includes('0x' + entry.nativeBinding.inputCommitment), 'WRAPPED_WALLET_ORIGINAL_NOTE_REQUIRED');
          assert.ok(!view.ledger.nullifiers.includes('0x' + entry.nativeBinding.inputNullifier), 'WRAPPED_WALLET_ORIGINAL_NOTE_SPENT');
          assert.equal(process.available, true, 'WRAPPED_WALLET_ORIGINAL_OWNER_UNAVAILABLE');
          format.reference(process.processIdentitySHA256);
          wrappedBinding = immutable({
            profile: 'WRAPPED_WALLET_ORIGINAL_CONSENT_BINDING_V1',
            accountIdentitySHA256: sha(profile.accountIdentity),
            runtimeIdentitySHA256: sha({
              chainId: chain.runtime.metadata.chainId,
              genesis: chain.runtime.metadata.evmGenesis,
              bootstrap: chain.system.bootstrap
            }),
            systemProfile: chain.system.profile,
            hub: chain.system.hub.address,
            claimAuthority: chain.system.claims.authority.address,
            registryCommitment: chain.system.registryCommitment.slice(2),
            claimDomain: claim.claimDomain,
            processIdentitySHA256: process.processIdentitySHA256,
            processGeneration: process.generation,
            head: view.head,
            economicIntentSHA256: sha({
              body: {
                requestId: value.requestId,
                ownerOperationRef: value.ownerOperationRef
              },
              route,
              terms,
              asset: profile.asset.assetId,
              accountIdentity: profile.accountIdentity,
              sourceNoteCommitment: entry.nativeBinding.inputCommitment
            })
          });
          await chain.reader.assertCurrent(view);
        }
        const body = immutable({
          requestId: value.requestId,
          kind: 'GRAPH',
          ownerOperationRef: value.ownerOperationRef,
          assetId: profile.asset.assetId
        });
        const review = immutable({
          version: route.graph ? 2 : 1,
          profile: route.graph ? profile.wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V2' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V3' : profile.wrapped ? 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1' : 'ORIGINAL_MANUAL_NATIVE_VALUE_GRAPH_REVIEW_V2',
          ...(profile.wrapped ? {
            wrappedBinding
          } : {}),
          ...body,
          asset: {
            assetId: profile.asset.assetId,
            symbol: profile.asset.symbol,
            decimals: profile.asset.decimals
          },
          ...route,
          ...terms,
          originalAccountLifetime: profile.config.lifetime,
          observation: 'ORIGINAL_AUTHORIZED_TERMS_ONLY',
          solverOwnLiquidity: true,
          settlementEstablished: false,
          recovery: 'PRIVATE_ORIGINAL_CUTOFF_ONLY'
        });
        if (route.graph) validateOwnerGraphReview(review);
        validateFlatManualGraphAdmissionTime(review, String(await chain.runtime.time()));
        // One retained operation has one exact human handoff identity for this
        // authority lifetime. Duplicate issuance cannot rebind its request ID.
        const existing = approvals.manualGraphApprovals.get(value.ownerOperationRef);
        if (existing) {
          const original = approvals.manualGraphs.get(existing);
          assert.deepEqual(original.body, body, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
          assert.deepEqual(original.review, review, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
          return existing;
        }
        const approval = Object.freeze(Object.create(null));
        approvals.manualGraphs.set(approval, {
          account: capability,
          body,
          review,
          check() {
            chain.assertOwnedNativeValueExecution(chain.nativeExecution, {
              runtime: chain.runtime,
              system: chain.system,
              poolIndex: chain.poolIndex
            });
          },
          checkRoute() {
            if (profile.wrapped) {
              const process = chain.owner.report();
              assert.equal(process.processIdentitySHA256, wrappedBinding.processIdentitySHA256);
              assert.equal(process.generation, wrappedBinding.processGeneration, 'WRAPPED_WALLET_OWNER_GENERATION_CHANGED');
            }
            assert.deepEqual(chain.ownedNativeValueManualGraphReview(chain.nativeExecution, value.ownerOperationRef, {
              runtime: chain.runtime,
              system: chain.system,
              poolIndex: chain.poolIndex
            }), route, 'FLAT_ACCOUNT_MANUAL_GRAPH_TERMS_CHANGED');
          }
        });
        approvals.manualGraphApprovals.set(value.ownerOperationRef, approval);
        return approval;
      }),
      recoveryCreditRequest: ref => lifecycle.exclusive(async () => {
        await lifecycle.healthy();
        const entry = operations.operation(ref);
        assert.ok(entry.request !== null && entry.kind === 'GRAPH', 'FLAT_ACCOUNT_RECOVERY_GRAPH_ONLY');
        await operations.reconcileOriginal(entry.request);
        const current = operations.operation(ref);
        assert.equal(current.outcome?.disposition, 'RECOVERED', 'FLAT_ACCOUNT_RECOVERY_NOT_CONFIRMED');
        return {
          transactionHash: current.terminal.transactionHash,
          calldataSHA256: current.terminal.calldataSHA256
        };
      })
    })),
    privateStatus: () => lifecycle.exclusive(async () => {
      await lifecycle.healthy();
      return {
        profile: profile.accountProfile,
        keeperRestart: false,
        reusableBalanceRollover: false,
        operations: journal.rows().map(({
          prepared: _private,
          submission,
          ...entry
        }) => ({
          ...copy(entry),
          submission: submission ? {
            kind: submission.kind,
            calldataSHA256: submission.calldataSHA256,
            transactionHash: submission.transactionHash,
            dispatchLatched: submission.dispatchLatched,
            ownerConfirmed: submission.ownerConfirmed
          } : null
        }))
      };
    }),
    abort: lifecycle.abort,
    close: lifecycle.close
  });
  return Object.freeze({
    authority,
    capability
  });
}
