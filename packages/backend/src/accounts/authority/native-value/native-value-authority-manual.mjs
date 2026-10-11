/** Manual operations. Dependencies are explicit and scoped by role.
 * Journal access is restricted to this domain; account ownership stays in the root. */
import { exactRecord } from "@lianum/components/encoding/commitments";
import assert from "node:assert/strict";
import { validateFlatManualReauthorization, validateFlatManualRecords, validateFlatManualReview, currentFlatManualAuthorization } from "@lianum/custody/preparation/flat-owner-manual-binding";


import { sha, immutable } from "@lianum/engine/accounts/journal";
export function createNativeValueManualLifecycle({
  originalKeepers,
  journal,
  format,
  chain,
  account,
  operations,
  profile,
  lifecycle,
  proofs
}) {
  exactRecord(originalKeepers, [
    'assertOwnedFlatManualAccountKeeper',
    'assertOwnedFlatManualPortfolioKeeper',
    'assertOwnedFlatPortfolioAccount',
  ]);
  for (const method of Object.values(originalKeepers)) assert.equal(typeof method, 'function');
  const {
    assertOwnedFlatManualAccountKeeper,
    assertOwnedFlatManualPortfolioKeeper,
    assertOwnedFlatPortfolioAccount,
  } = originalKeepers;

  let manualKeeper = null;
  let manualPortfolio = null;
  const manualStops = new WeakMap();
  const manualReceipts = new WeakMap();
  const NDRA = 'NO_DISPATCH_REAUTHORIZATION_REQUIRED';
  function validateManualLifecycle(entry) {
    const m = entry.manualLifecycle;
    exactRecord(m, ['version', 'generation', 'state', 'epoch', 'authorizationSHA256', 'history', 'noDispatch', 'pendingReauthorization']);
    assert.equal(m.version, 2);
    assert.ok(['TOP_UP', 'EXIT'].includes(entry.kind));
    assert.ok(Number.isInteger(m.generation) && m.generation >= 0 && m.generation <= 8);
    assert.ok(['PREPARED', 'EXECUTING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'].includes(m.state));
    format.reference(m.authorizationSHA256);
    assert.match(m.epoch, /^(0|[1-9][0-9]{0,19})$/);
    assert.ok(Array.isArray(m.history) && m.history.length <= 96);
    for (const event of m.history) {
      exactRecord(event, ['state', 'generation', 'evidence']);
      assert.ok(['PREPARED', 'EXECUTING', NDRA, 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED'].includes(event.state));
      assert.ok(Number.isInteger(event.generation) && event.generation >= 0 && event.generation <= m.generation + 1);
    }
    if (m.noDispatch !== null) {
      exactRecord(m.noDispatch, ['version', 'profile', 'bindingSHA256', 'ownerIdentitySHA256', 'accountIdentitySHA256', 'generation', 'authorizationSHA256', 'epoch', 'observedEpoch', 'reason']);
      assert.equal(m.noDispatch.version, 1);
      assert.equal(m.noDispatch.profile, 'FLAT_MANUAL_NO_DISPATCH_V1');
      assert.equal(m.noDispatch.reason, 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION');
      assert.equal(m.noDispatch.bindingSHA256, entry.request.bindingSHA256);
      assert.equal(m.noDispatch.generation, m.generation);
      assert.equal(m.noDispatch.authorizationSHA256, m.authorizationSHA256);
      assert.equal(m.noDispatch.epoch, m.epoch);
      assert.ok(BigInt(m.noDispatch.observedEpoch) > BigInt(m.epoch));
      assert.equal(entry.submission, null);
      assert.equal(entry.outcome, null);
      assert.equal(entry.terminal, null);
    }
    if (m.pendingReauthorization !== null) {
      validateFlatManualReauthorization(m.pendingReauthorization);
      assert.equal(m.pendingReauthorization.previousAuthorizationSHA256, m.authorizationSHA256);
      assert.equal(m.pendingReauthorization.revision, m.generation + 1);
      assert.equal(m.pendingReauthorization.priorEpoch, m.epoch);
      assert.ok(m.noDispatch);
    }
    if ([NDRA, 'REAUTHORIZING'].includes(m.state)) assert.ok(m.noDispatch);
  }
  function linkedManualKeeper(keeper) {
    if (manualPortfolio === null) assertOwnedFlatManualAccountKeeper(keeper, {
      runtime: chain.runtime,
      system: chain.system,
      poolIndex: chain.poolIndex,
      owner: chain.owner,
      account: account.capability()
    });else {
      assertOwnedFlatManualPortfolioKeeper(keeper, {
        runtime: chain.runtime,
        portfolio: manualPortfolio
      });
      assertOwnedFlatPortfolioAccount(manualPortfolio, account.capability());
    }
    assert.equal(keeper, manualKeeper, 'FLAT_ACCOUNT_ORIGINAL_MANUAL_KEEPER_REQUIRED');
  }
  async function manualOwner(ref, {
    pending = false
  } = {}) {
    const entry = operations.operation(ref),
      records = await chain.owner.ownerView.manualPreparations();
    validateFlatManualRecords(records);
    const original = records.records.find(value => value.review.request.ownerOperationRef === ref);
    assert.ok(original && original.ownerState === 'PREPARED', 'FLAT_ACCOUNT_MANUAL_ORIGINAL_REQUIRED');
    validateFlatManualReview(original.review);
    assert.equal(original.review.ownerIdentitySHA256, profile.identitySHA256);
    assert.equal(original.review.accountIdentitySHA256, sha(profile.accountIdentity));
    assert.deepEqual(original.review.asset, profile.asset);
    for (const key of ['requestId', 'kind', 'ownerOperationRef', 'assetId']) assert.equal(original.review.request[key], entry.request[key], 'FLAT_ACCOUNT_MANUAL_REQUEST_CHANGED');
    const current = currentFlatManualAuthorization(original),
      terms = await chain.owner.ownerView.preparationTerms({
        kind: entry.ownerKind
      });
    assert.equal(terms.identitySHA256, profile.identitySHA256);
    assert.equal(terms.kind, entry.ownerKind);
    assert.ok(['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(terms.prepared?.stage));
    assert.equal(terms.prepared.submissionBound, false);
    assert.equal(entry.submission, null);
    for (const name of ['amount', 'recipient']) {
      assert.equal(terms.prepared[name], original.review[name]);
      assert.equal(terms.note?.[name], original.review[name]);
    }
    assert.equal(terms.note.status, entry.kind === 'TOP_UP' ? 'UNISSUED' : 'LOCKED');
    assert.equal(terms.note.observedUnspent, entry.kind === 'EXIT');
    assert.equal(terms.prepared.epoch, current.epoch);
    const expected = pending ? entry.manualLifecycle.pendingReauthorization : null;
    if (entry.manualLifecycle) {
      assert.equal(sha(current), expected ? sha(expected) : entry.manualLifecycle.authorizationSHA256);
      assert.equal(current.epoch, expected?.epoch ?? entry.manualLifecycle.epoch);
    }
    return {
      original,
      current,
      terms
    };
  }
  async function requireManualEpoch(ref) {
    const entry = operations.operation(ref),
      m = entry.manualLifecycle;
    assert.equal(m.state, 'EXECUTING');
    assert.equal(entry.stage, 'EXECUTING');
    assert.equal(entry.submission, null);
    const {
        terms
      } = await manualOwner(ref),
      epoch = String(BigInt(terms.observed.timestamp) / 600n);
    if (epoch === m.epoch) return;
    assert.ok(BigInt(epoch) > BigInt(m.epoch), 'FLAT_ACCOUNT_MANUAL_EPOCH_REGRESSION');
    const stop = format.failure('FLAT_ACCOUNT_MANUAL_EPOCH_REVIEW_REQUIRED');
    manualStops.set(stop, {
      ref,
      generation: m.generation,
      authorizationSHA256: m.authorizationSHA256
    });
    throw stop;
  }
  function manualReceipt(entry, type) {
    const m = entry.manualLifecycle;
    const data = immutable({
      version: 1,
      type,
      ownerIdentitySHA256: profile.identitySHA256,
      accountIdentitySHA256: sha(profile.accountIdentity),
      request: entry.request,
      generation: m.generation,
      epoch: m.epoch,
      authorizationSHA256: m.authorizationSHA256,
      evidence: type === NDRA ? m.noDispatch : m.history.at(-1).evidence
    });
    const receipt = Object.freeze({
      data,
      toJSON() {
        throw format.failure('FLAT_ACCOUNT_RECEIPT_NOT_SERIALIZABLE');
      }
    });
    manualReceipts.set(receipt, {
      ref: entry.ownerOperationRef,
      type,
      digest: sha(data)
    });
    return receipt;
  }
  async function retainManualNoDispatch(ref, error) {
    const marker = manualStops.get(error),
      entry = operations.operation(ref),
      m = entry.manualLifecycle;
    assert.ok(marker && marker.ref === ref && marker.generation === m.generation && marker.authorizationSHA256 === m.authorizationSHA256, 'FLAT_ACCOUNT_NO_DISPATCH_PROVENANCE');
    assert.equal(entry.stage, 'EXECUTING');
    assert.equal(entry.submission, null);
    const {
        terms
      } = await manualOwner(ref),
      observedEpoch = String(BigInt(terms.observed.timestamp) / 600n);
    assert.ok(BigInt(observedEpoch) > BigInt(m.epoch));
    const evidence = {
      version: 1,
      profile: 'FLAT_MANUAL_NO_DISPATCH_V1',
      bindingSHA256: entry.request.bindingSHA256,
      ownerIdentitySHA256: profile.identitySHA256,
      accountIdentitySHA256: sha(profile.accountIdentity),
      generation: m.generation,
      authorizationSHA256: m.authorizationSHA256,
      epoch: m.epoch,
      observedEpoch,
      reason: 'EPOCH_EXPIRED_BEFORE_ORIGINAL_SUBMISSION'
    };
    await operations.update(ref, {
      stage: NDRA,
      manualLifecycle: {
        ...m,
        state: NDRA,
        noDispatch: evidence,
        history: [...m.history, {
          state: NDRA,
          generation: m.generation,
          evidence
        }]
      }
    });
    return manualReceipt(operations.operation(ref), NDRA);
  }
  async function finishManualReauthorization(ref) {
    const entry = operations.operation(ref),
      m = entry.manualLifecycle,
      accepted = m.pendingReauthorization;
    assert.ok(accepted && m.noDispatch);
    await manualOwner(ref, {
      pending: true
    });
    const evidence = {
      authorization: accepted,
      previousNoDispatch: m.noDispatch
    };
    await operations.update(ref, {
      stage: 'READY',
      errorCode: null,
      manualLifecycle: {
        ...m,
        generation: accepted.revision,
        epoch: accepted.epoch,
        authorizationSHA256: sha(accepted),
        state: 'PREPARED',
        noDispatch: null,
        pendingReauthorization: null,
        history: [...m.history, {
          state: 'PREPARED',
          generation: accepted.revision,
          evidence
        }]
      }
    });
    return manualReceipt(operations.operation(ref), 'PREPARED');
  }
  async function originalGraphPrepare(value) {
    await lifecycle.healthy();
    const {
      bound,
      entry
    } = operations.request(value);
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
  }
  async function originalGraphExecute(value) {
    await lifecycle.healthy();
    const {
        bound,
        entry
      } = operations.request(value),
      ref = bound.ownerOperationRef;
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
  }
  async function originalGraphReconcile(value) {
    await lifecycle.healthy();
    const {
      bound,
      entry
    } = operations.request(value);
    assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'FLAT_ACCOUNT_NOT_STARTED');
    return operations.reconcileOriginal(bound);
  }
  async function originalGraphRecover(value) {
    await lifecycle.healthy();
    const {
      bound
    } = operations.request(value);
    try {
      return await operations.recoverOriginal(bound);
    } catch (error) {
      await operations.unresolved(bound.ownerOperationRef, error);
      throw error;
    }
  }
  function checkPortfolioKeeperBinding(input) {
    exactRecord(input, ['keeper', 'portfolio']);
    assertOwnedFlatManualPortfolioKeeper(input.keeper, {
      runtime: chain.runtime,
      portfolio: input.portfolio
    });
    assertOwnedFlatPortfolioAccount(input.portfolio, account.capability());
    assert.ok(manualKeeper === null || manualKeeper === input.keeper, 'FLAT_ACCOUNT_MANUAL_KEEPER_ALREADY_BOUND');
    if (manualKeeper === null) assert.ok(journal.rows().every(entry => entry.request === null), 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
  }
  const manualLifecycle = {
    assertCanBindPortfolioKeeper: input => {
      checkPortfolioKeeperBinding(input);
    },
    bindPortfolioKeeper: input => {
      checkPortfolioKeeperBinding(input);
      manualPortfolio = input.portfolio;
      manualKeeper = input.keeper;
    },
    graphPrepare: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const {
        bound,
        entry
      } = operations.request(input.request);
      assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphPrepare(bound);
    }),
    graphExecute: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const {
        bound,
        entry
      } = operations.request(input.request);
      assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphExecute(bound);
    }),
    graphReconcile: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const {
        bound,
        entry
      } = operations.request(input.request);
      assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphReconcile(bound);
    }),
    graphRecover: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      assert.ok(manualPortfolio, 'FLAT_ACCOUNT_ORIGINAL_PORTFOLIO_KEEPER_REQUIRED');
      const {
        bound,
        entry
      } = operations.request(input.request);
      assert.equal(bound.kind, 'GRAPH');
      assert.equal(entry.manualLifecycle, undefined, 'FLAT_ACCOUNT_GRAPH_EPOCH_REAUTHORIZATION_FORBIDDEN');
      return originalGraphRecover(bound);
    }),
    bindKeeper: keeper => {
      assertOwnedFlatManualAccountKeeper(keeper, {
        runtime: chain.runtime,
        system: chain.system,
        poolIndex: chain.poolIndex,
        owner: chain.owner,
        account: account.capability()
      });
      assert.ok(manualKeeper === null || manualKeeper === keeper, 'FLAT_ACCOUNT_MANUAL_KEEPER_ALREADY_BOUND');
      if (manualKeeper === null) assert.ok(journal.rows().every(entry => entry.request === null), 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      manualKeeper = keeper;
    },
    prepare: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      const {
        bound,
        entry
      } = operations.request(input.request);
      assert.ok(['TOP_UP', 'EXIT'].includes(bound.kind));
      assert.equal(entry.stage, 'READY');
      assert.equal(entry.submission, null);
      if (entry.manualLifecycle) {
        assert.deepEqual(entry.request, bound);
        return;
      }
      // Adoption is allowed only before original authority admission, never an
      // already-used generic keeper or another request/UNKNOWN journal.
      assert.equal(entry.request, null, 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      const records = await chain.owner.ownerView.manualPreparations();
      validateFlatManualRecords(records);
      const original = records.records.find(row => row.review.request.ownerOperationRef === bound.ownerOperationRef);
      assert.ok(original);
      for (const k of ['requestId', 'kind', 'ownerOperationRef', 'assetId']) assert.equal(original.review.request[k], bound[k]);
      const current = currentFlatManualAuthorization(original);
      assert.equal(original.reauthorizations?.length ?? 0, 0, 'FLAT_ACCOUNT_LEGACY_KEEPER_MIGRATION_UNSUPPORTED');
      const m = {
        version: 2,
        generation: original.reauthorizations?.length ?? 0,
        state: 'PREPARED',
        epoch: current.epoch,
        authorizationSHA256: sha(current),
        history: [{
          state: 'PREPARED',
          generation: original.reauthorizations?.length ?? 0,
          evidence: null
        }],
        noDispatch: null,
        pendingReauthorization: null
      };
      await operations.update(bound.ownerOperationRef, {
        request: bound,
        manualLifecycle: m
      });
      await manualOwner(bound.ownerOperationRef);
    }),
    execute: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'generation']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      const {
          bound,
          entry
        } = operations.request(input.request),
        ref = bound.ownerOperationRef,
        m = entry.manualLifecycle;
      assert.ok(m);
      assert.equal(m.generation, input.generation);
      assert.equal(m.state, 'PREPARED');
      assert.equal(entry.stage, 'READY');
      await operations.update(ref, {
        stage: 'EXECUTING',
        manualLifecycle: {
          ...m,
          state: 'EXECUTING',
          history: [...m.history, {
            state: 'EXECUTING',
            generation: m.generation,
            evidence: null
          }]
        }
      });
      try {
        const receipt = await operations.executeNote(ref);
        return {
          type: 'CONFIRMED',
          outcome: await operations.confirmTerminal(bound, {
            receipt,
            outcome: 'APPLIED'
          })
        };
      } catch (error) {
        if (manualStops.has(error)) {
          try {
            return {
              type: NDRA,
              receipt: await retainManualNoDispatch(ref, error)
            };
          } catch (uncertain) {
            await operations.unresolved(ref, uncertain);
            throw uncertain;
          }
        }
        await operations.unresolved(ref, error);
        throw error;
      }
    }),
    verifyReceipt: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'receipt']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      const brand = manualReceipts.get(input.receipt);
      assert.ok(brand, 'FLAT_ACCOUNT_NO_DISPATCH_PROVENANCE');
      const entry = operations.operation(brand.ref),
        m = entry.manualLifecycle;
      assert.equal(m.state, brand.type);
      assert.equal(sha(input.receipt.data), brand.digest);
      const current = manualReceipt(entry, brand.type);
      assert.deepEqual(current.data, input.receipt.data);
      await manualOwner(brand.ref);
      return immutable(input.receipt.data);
    }),
    observeOriginal: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      const {
          bound,
          entry
        } = operations.request(input.request),
        m = entry.manualLifecycle;
      assert.ok(m);
      if (entry.submission !== null) return {
        type: 'CONFIRMED',
        outcome: await operations.reconcileOriginal(bound)
      };
      if (m.pendingReauthorization) return {
        type: 'PREPARED',
        receipt: await finishManualReauthorization(bound.ownerOperationRef)
      };
      if (m.state === NDRA || m.state === 'PREPARED') {
        await manualOwner(bound.ownerOperationRef);
        return {
          type: m.state,
          receipt: manualReceipt(entry, m.state)
        };
      }
      return {
        type: 'UNKNOWN',
        receipt: null
      };
    }),
    reviewReauthorization: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      const {
          bound,
          entry
        } = operations.request(input.request),
        m = entry.manualLifecycle;
      assert.equal(m.state, NDRA);
      assert.equal(entry.stage, NDRA);
      assert.equal(m.pendingReauthorization, null);
      const {
          original,
          current,
          terms
        } = await manualOwner(bound.ownerOperationRef),
        epoch = String(BigInt(terms.observed.timestamp) / 600n);
      assert.ok(BigInt(epoch) > BigInt(current.epoch));
      const authorization = {
        version: 1,
        profile: 'FLAT_MANUAL_EPOCH_REAUTHORIZATION_V1',
        revision: m.generation + 1,
        request: original.review.request,
        ownerIdentitySHA256: profile.identitySHA256,
        accountIdentitySHA256: sha(profile.accountIdentity),
        amount: original.review.amount,
        recipient: original.review.recipient,
        role: original.review.role,
        priorEpoch: current.epoch,
        epoch,
        observed: terms.observed,
        previousAuthorizationSHA256: sha(current)
      };
      validateFlatManualReauthorization(authorization);
      return immutable(authorization);
    }),
    reauthorize: input => lifecycle.exclusive(async () => {
      exactRecord(input, ['keeper', 'request', 'authorization']);
      linkedManualKeeper(input.keeper);
      await lifecycle.healthy();
      validateFlatManualReauthorization(input.authorization);
      const {
          bound,
          entry
        } = operations.request(input.request),
        ref = bound.ownerOperationRef,
        m = entry.manualLifecycle;
      assert.equal(m.state, NDRA);
      assert.equal(entry.stage, NDRA);
      assert.equal(m.pendingReauthorization, null);
      const {
          original,
          current,
          terms
        } = await manualOwner(ref),
        accepted = immutable(input.authorization);
      assert.deepEqual(accepted.request, original.review.request);
      for (const key of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'amount', 'recipient', 'role']) assert.equal(accepted[key], original.review[key]);
      assert.equal(accepted.previousAuthorizationSHA256, sha(current));
      assert.equal(accepted.priorEpoch, current.epoch);
      assert.equal(accepted.revision, m.generation + 1);
      if (accepted.epoch !== String(BigInt(terms.observed.timestamp) / 600n)) return {
        type: NDRA,
        receipt: manualReceipt(entry, NDRA)
      };
      await operations.update(ref, {
        stage: 'REAUTHORIZING',
        manualLifecycle: {
          ...m,
          state: 'REAUTHORIZING',
          pendingReauthorization: accepted,
          history: [...m.history, {
            state: 'REAUTHORIZING',
            generation: m.generation,
            evidence: accepted
          }]
        }
      });
      try {
        await chain.owner.owner.reauthorizeManualPreparation({
          authorization: accepted
        });
        return {
          type: 'PREPARED',
          receipt: await finishManualReauthorization(ref)
        };
      } catch (error) {
        // An epoch can advance between the review and the owner call. Only a
        // fresh original read proving the old authorization still intact may
        // retire this *unapplied* review. Lost/uncertain writes cannot pass it.
        try {
          await lifecycle.healthy();
          await manualOwner(ref);
          const retained = operations.operation(ref).manualLifecycle;
          await operations.update(ref, {
            stage: NDRA,
            manualLifecycle: {
              ...retained,
              state: NDRA,
              pendingReauthorization: null,
              history: [...retained.history, {
                state: NDRA,
                generation: retained.generation,
                evidence: {
                  unappliedAuthorization: accepted,
                  originalNoDispatch: retained.noDispatch
                }
              }]
            }
          });
          return {
            type: NDRA,
            receipt: manualReceipt(operations.operation(ref), NDRA)
          };
        } catch {
          await operations.unresolved(ref, error);
          throw error;
        }
      }
    })
  };
  return Object.freeze({
    NDRA,
    validateManualLifecycle,
    linkedManualKeeper,
    manualOwner,
    requireManualEpoch,
    manualReceipt,
    retainManualNoDispatch,
    finishManualReauthorization,
    originalGraphPrepare,
    originalGraphExecute,
    originalGraphReconcile,
    originalGraphRecover,
    checkPortfolioKeeperBinding,
    manualLifecycle,
    hasManualKeeper: () => manualKeeper !== null
  });
}
