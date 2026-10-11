/** One genuine solver transfer, then reciprocal CLAIM health at empty supply.
 * No runtime is started by this module. Only original branded quorums/adapters
 * are accepted; a successful result is not loaded-state equivalence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { types } from 'node:util';
import { assertOwnedFlatOperatorQuorum } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { assertOwnedClaimOperatorQuorum } from '../../../../packages/backend/src/claims/operations/operators.mjs';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { validateSolanaBindingTransaction } from '@lianum/engine/native/native-receipt-binding';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
import { freshFixtureId, writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { UNFUNDED_HEALTH_PROFILE, UNFUNDED_HEALTH_VALIDATION_SCOPE } from './native-claim-unfunded-health-policy.mjs';

const probes = new WeakSet();
const copy = value => structuredClone(value);

export function unfundedHealthFailureDiagnostic(error, fallback = 'NATIVE_UNFUNDED_HEALTH_FAILED') {
  try { return privateFailureDiagnostic(error, fallback); }
  catch {
    // A malformed nested diagnostic (including a revoked proxy) is opaque.
    // Do not inspect the parser's exception or echo arbitrary fallback text.
    return Object.freeze({ code: 'NATIVE_UNFUNDED_HEALTH_FAILED', causeCode: null, causeCodes: Object.freeze([]) });
  }
}

/** Private bounded original own-data error text. An AssertionError's message
 * can contain comparison values; only the public projection excludes those.
 * Accessors, proxies and non-string values are never evaluated or coerced. */
export function boundedUnfundedHealthError(error) {
  const seen = new Set(), chain = [];
  const inert = value => value !== null && typeof value === 'object' && !types.isProxy(value);
  const data = (value, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  };
  for (let cause = error; inert(cause) && chain.length < 5 && !seen.has(cause); cause = data(cause, 'cause')) {
    seen.add(cause);
    const message = data(cause, 'message'), stack = data(cause, 'stack');
    chain.push({ message: typeof message === 'string' ? message.slice(0, 1024) : '',
      frames: typeof stack === 'string'
        ? stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 12).map(line => line.slice(0, 256)) : [] });
  }
  return { ...unfundedHealthFailureDiagnostic(error), chain };
}

export async function probeUnfundedPostFactClaimHealth({ fixture, privateDirectory, stage, audit, onReport }) {
  const { runtime, system, graphSolana: native, graphQuorum, quorum } = fixture;
  assertOwnedFlatOperatorQuorum(graphQuorum, { runtime, system, nativeRuntime: native, family: '2' });
  assertOwnedClaimOperatorQuorum(quorum, fixture.observer);
  assert.equal(typeof quorum.assertOriginalAuthorizationCurrent, 'function', 'NATIVE_UNFUNDED_VALIDATION_API_REQUIRED');
  assert.ok(!probes.has(fixture), 'NATIVE_UNFUNDED_ONE_PROBE');
  assert.equal(fixture.owners.length, 0, 'NATIVE_UNFUNDED_OWNER');
  const counts = () => [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, native].map(value => value.transfers.length);
  assert.deepEqual(counts(), [0, 0, 0, 0], 'NATIVE_UNFUNDED_INITIAL_EFFECTS');
  assert.equal(fixture.operators.length, 4); assert.equal(fixture.graphOperators.length, 4);
  const inventoryCounts = () => fixture.graphOperators.map(operator => operator.status().certifiedInventoryCount);
  assert.deepEqual(inventoryCounts(), [0, 0, 0, 0], 'NATIVE_UNFUNDED_INITIAL_GRAPH_HISTORY');
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(fixture.operators[i].publicKey, fixture.graphOperators[i].publicKey);
    assert.deepEqual(fixture.graphOperators[i].publicKey, system.registry.keys[i]);
  }
  const domains = fixture.claims.configs.map(claimDomainCommitment);
  assert.equal(domains.length, 2); assert.notEqual(domains[0], domains[1]);
  assert.deepEqual(fixture.claims.configs.map(config => config.nativeFamily), ['1', '2']);
  const empty = view => {
    assert.equal(view.gateways.length, 2, 'NATIVE_UNFUNDED_GATEWAYS');
    assert.deepEqual(view.gateways.map(gateway => gateway.claimDomain), domains, 'NATIVE_UNFUNDED_REGISTERED_DOMAINS');
    for (const gateway of view.gateways) {
      for (const key of ['wrapperSupply', 'intentCount', 'ticketCount', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'])
        assert.equal(gateway[key], '0', 'NATIVE_UNFUNDED_CLAIM_NOT_EMPTY');
      assert.equal(gateway.activePayout, '0'.repeat(64));
      assert.deepEqual(gateway.intents, []); assert.deepEqual(gateway.tickets, []);
    }
  };
  const beforeClaims = await fixture.observer.read(), evmCount = runtime.transactions.length;
  empty(beforeClaims); await fixture.observer.assertCurrent(beforeClaims);
  const beforeCustody = await Promise.all([fixture.bitcoin.inventory(), fixture.solana.inventory()]);
  const balances = () => Promise.all([native.solver, ...native.recipients].map(address => native.balance(address)));
  const beforeBalances = await balances();
  const rule = fixture.rules[1]; assert.equal(rule.family, '2');
  const adapter = native.adapter({ asset: rule.asset, recipientIndex: 0 });
  assert.equal(adapter.binding.genesis, rule.genesis); assert.equal(adapter.binding.asset, rule.asset);
  assert.equal(adapter.binding.sourceEndpoint, native.solverHex.slice(2));
  assert.ok(!Object.values(fixture.solana.roles).some(role => role.endpoint === adapter.binding.sourceEndpoint),
    'NATIVE_UNFUNDED_SOLVER_IS_CUSTODY');
  const retain = (name, value) => writeFixturePrivate(join(privateDirectory, 'unfunded-health-' + name + '.json'), value);
  const report = { scope: UNFUNDED_HEALTH_PROFILE, validationScope: UNFUNDED_HEALTH_VALIDATION_SCOPE,
    completed: false, checksPassed: false, loadedEquivalence: false,
    owners: 0, proofs: 0, userDeposits: 0, claimSupply: 0, claimIntents: 0, claimTickets: 0,
    evmTransactionsAfterSetup: 0, solverNativeAmount: '1000000', solverSeparateLiquidity: true,
    transfers: 0, originalReconciliations: 0, factsCalls: 0, claimHealth: [], claimHealthValidation: [],
    graphHealth: { calls: 0 }, graphCheckpoint: { calls: 0 } };
  const publish = async () => { await onReport(copy(report)); await audit(); };
  const unchanged = () => {
    assert.deepEqual(counts(), [0, 0, 0, 1], 'NATIVE_UNFUNDED_NATIVE_EFFECT');
    assert.equal(runtime.transactions.length, evmCount, 'NATIVE_UNFUNDED_EVM_EFFECT');
    assert.equal(fixture.owners.length, 0, 'NATIVE_UNFUNDED_OWNER');
  };
  const wireKeyCommitment = freshFixtureId(); let preparedCopy, signed, submitted;
  probes.add(fixture);
  await stage('unfunded-health-send-one-original-solver-transfer');
  report.transfers++; await publish();
  try {
    submitted = await adapter.transfer({ amount: '1000000', wireKeyCommitment }, {
      async beforeSign(prepared) {
        assert.equal(prepared.intent.lamports, '1000000');
        assert.equal(prepared.intent.wireKeyCommitment, wireKeyCommitment);
        assert.equal(prepared.intent.sourcePublicKey, adapter.binding.sourceEndpoint);
        assert.equal(prepared.intent.recipientPublicKey, adapter.binding.destinationEndpoint);
        await adapter.assertPrepared(prepared); preparedCopy = copy(prepared);
      },
      async onSigned(payload) {
        const decoded = validateSolanaBindingTransaction(payload.nativeWire, preparedCopy.intent);
        signed = { nativeWire: payload.nativeWire, nativeId: decoded.signatureHex,
          transactionSHA256: decoded.transactionSHA256, prepared: preparedCopy };
        retain('signed-before-broadcast', signed);
      },
    });
  } catch (error) {
    // Only this exact already-signed transfer can be reconciled. Never resend.
    if (error.message !== 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE' || !signed || error.nativeId !== signed.nativeId) throw error;
    submitted = signed;
  }
  assert.equal(submitted.nativeId, signed.nativeId); assert.equal(submitted.transactionSHA256, signed.transactionSHA256);
  report.originalReconciliations++;
  const observation = await native.observe(signed.nativeId);
  assert.equal(observation.status, 'observed', 'NATIVE_UNFUNDED_ORIGINAL_NOT_FINALIZED');
  assert.equal(observation.nativeId, signed.nativeId); assert.equal(observation.nativeWire, signed.nativeWire);
  const record = native.transfers[0];
  const original = () => {
    const retained = native.transfers[0];
    assert.equal(retained.nativeId, signed.nativeId); assert.equal(retained.nativeWire, signed.nativeWire);
    assert.equal(retained.transactionSHA256, signed.transactionSHA256); assert.deepEqual(retained.intent, preparedCopy.intent);
    assert.equal(retained.phase, 'OBSERVED_FINALIZED'); assert.equal(retained.broadcastAttempts, 1);
    assert.equal(retained.observation.nativeId, signed.nativeId); assert.equal(retained.observation.nativeWire, signed.nativeWire);
    unchanged();
  };
  original(); retain('original-finalized', record); report.originalFinalizedOnce = true; await publish();

  await stage('unfunded-health-genuine-graph-facts-once');
  report.factsCalls++; await publish();
  const facts = await graphQuorum.facts({ family: '2', recipientIndex: '0', nativeId: signed.nativeId, wireKeyCommitment });
  assert.equal(facts.certificates.length, 3); assert.deepEqual(facts.head, beforeClaims.head, 'NATIVE_UNFUNDED_HEAD_CHANGED');
  const retainedFact = () => { original(); assert.deepEqual(inventoryCounts(), [1, 1, 1, 0], 'NATIVE_UNFUNDED_RETAINED_GRAPH_HISTORY'); };
  retainedFact(); retain('genuine-graph-facts', facts); report.retainedGraphFactPerSigner = 1; await publish();

  // Direct original claim quorum calls expose the error swallowed by portfolio.
  // Both registered domains are attempted exactly once, even if the first fails.
  for (const domainIndex of [0, 1]) {
    await stage('unfunded-health-direct-claim-domain-' + domainIndex);
    const outcome = { domainIndex, mode: 'ingress', calls: 1, ok: false };
    const validation = { domainIndex, calls: 0, ok: false };
    report.claimHealth.push(outcome); report.claimHealthValidation.push(validation); await publish();
    let value;
    try { value = await quorum.health({ claimDomain: domains[domainIndex], mode: 'ingress' }); }
    catch (error) {
      retain('claim-domain-' + domainIndex + '-error', boundedUnfundedHealthError(error));
      outcome.error = unfundedHealthFailureDiagnostic(error);
    }
    if (value) {
      retain('claim-domain-' + domainIndex, value);
      assert.deepEqual(value.head, facts.head, 'NATIVE_UNFUNDED_HEAD_CHANGED'); outcome.ok = true;
      retainedFact();
      const beforeBytes = JSON.stringify(value);
      await stage('unfunded-health-validate-original-domain-' + domainIndex);
      validation.calls++; await publish();
      try {
        // Keep this exact completed branded object. Validation asserts current
        // original authority; it is not a second health/signing request.
        const returned = await quorum.assertOriginalAuthorizationCurrent(value);
        assert.equal(returned, undefined, 'NATIVE_UNFUNDED_VALIDATION_ASSERT_ONLY');
        validation.assertOnlyResult = true; validation.ok = true;
      } catch (error) {
        retain('claim-domain-' + domainIndex + '-validation-error', boundedUnfundedHealthError(error));
        validation.error = unfundedHealthFailureDiagnostic(error);
      }
      const afterBytes = JSON.stringify(value);
      validation.originalBytesUnchanged = afterBytes === beforeBytes;
      const sha = bytes => createHash('sha256').update(bytes).digest('hex');
      retain('claim-domain-' + domainIndex + '-validation', { ...validation,
        validationScope: UNFUNDED_HEALTH_VALIDATION_SCOPE,
        originalResultSHA256Before: sha(beforeBytes), originalResultSHA256After: sha(afterBytes) });
      if (!validation.originalBytesUnchanged) { validation.ok = false; await publish(); }
      assert.equal(validation.originalBytesUnchanged, true, 'NATIVE_UNFUNDED_ORIGINAL_AUTHORIZATION_CHANGED');
      assert.deepEqual(value.head, facts.head, 'NATIVE_UNFUNDED_HEAD_CHANGED');
    } else {
      validation.skipped = 'ORIGINAL_HEALTH_UNAVAILABLE';
    }
    retainedFact(); await publish();
  }
  // A failed direct health result is already useful. Avoid further signatures
  // on a potentially poisoned branch; do not retry or add another graph fact.
  if (report.claimHealth.every(outcome => outcome.ok) && report.claimHealthValidation.every(outcome => outcome.ok)) {
    for (const [key, method, input] of [['graphHealth', 'health', { poolIndex: 1 }],
      ['graphCheckpoint', 'checkpoint', { poolIndex: 1, requestId: freshFixtureId() }]]) {
      await stage('unfunded-health-' + method + '-retained-graph-fact');
      const outcome = report[key]; outcome.calls++; await publish(); let value;
      try { value = await graphQuorum[method](input); }
      catch (error) {
        retain(method + '-error', boundedUnfundedHealthError(error));
        outcome.ok = false; outcome.error = unfundedHealthFailureDiagnostic(error);
      }
      if (value) { retain(method, value); assert.deepEqual(value.head, facts.head, 'NATIVE_UNFUNDED_HEAD_CHANGED'); outcome.ok = true; }
      retainedFact(); await publish(); if (!outcome.ok) break;
    }
  }
  const afterClaims = await fixture.observer.read(); empty(afterClaims);
  assert.deepEqual(afterClaims.head, beforeClaims.head, 'NATIVE_UNFUNDED_HEAD_CHANGED');
  assert.deepEqual(afterClaims.gateways, beforeClaims.gateways); await fixture.observer.assertCurrent(afterClaims);
  const afterCustody = await Promise.all([fixture.bitcoin.inventory(), fixture.solana.inventory()]);
  for (let i = 0; i < 2; i++) for (const key of ['accounts', 'feeAudit']) assert.deepEqual(afterCustody[i][key], beforeCustody[i][key]);
  const afterBalances = await balances();
  assert.equal(BigInt(beforeBalances[0]) - BigInt(afterBalances[0]), 1000000n + BigInt(record.observation.feeLamports));
  assert.equal(BigInt(afterBalances[1]) - BigInt(beforeBalances[1]), 1000000n);
  assert.deepEqual(afterBalances.slice(2), beforeBalances.slice(2)); retainedFact();
  retain('unchanged-empty-claims', { beforeClaims, afterClaims, beforeCustody, afterCustody, beforeBalances, afterBalances });
  Object.assign(report, { completed: true, checksPassed: report.claimHealth.every(outcome => outcome.ok)
    && report.claimHealthValidation.every(outcome => outcome.ok)
    && report.graphHealth.ok === true && report.graphCheckpoint.ok === true,
    custodyUnchanged: true, sameEvmHead: true, noAttestationTransactionSubmitted: true,
    nativeEffects: { custodyBitcoin: 0, custodySolana: 0, graphBitcoin: 0, graphSolana: 1 } });
  await publish(); return copy(report);
}
