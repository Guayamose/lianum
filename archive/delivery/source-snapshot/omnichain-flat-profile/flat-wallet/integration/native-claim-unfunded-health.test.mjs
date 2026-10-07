/** Host-only orchestration/source checks. All native, deployment, custody and
 * file-write capabilities in the probe are mocked; no chain or prover starts. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import vm from 'node:vm';
import { ROOT, LIMITS } from '../proof-workers/catalog.mjs';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from './native-claim-run-route.mjs';
import { NATIVE_FLOW_LIMITS, validateNativeClaimUnfundedHealthResult, runNativeClaimUnfundedHealthSupervisor }
  from './native-flow-supervisor.mjs';
import { UNFUNDED_HEALTH_PROFILE, UNFUNDED_HEALTH_RESULT, UNFUNDED_HEALTH_REAL_RUN_DISABLED, UNFUNDED_HEALTH_VALIDATION_SCOPE,
  unfundedHealthProcessFailure } from './native-claim-unfunded-health-policy.mjs';
let control;
const copy = value => structuredClone(value), id = 'ab'.repeat(64), sha = 'cd'.repeat(32), wireKey = 'ef'.repeat(32);
mock.module(new URL('../wallet-platform/modules/ops/native-operators.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatOperatorQuorum(value, binding) {
    assert.equal(value, control.fixture.graphQuorum);
    assert.deepEqual(binding, { runtime: control.fixture.runtime, system: control.fixture.system,
      nativeRuntime: control.fixture.graphSolana, family: '2' });
  },
} });
mock.module(new URL('../wallet-platform/modules/native-claims/operators.mjs', import.meta.url).href, { exports: {
  assertOwnedClaimOperatorQuorum(value, observer) {
    assert.equal(value, control.fixture.quorum); assert.equal(observer, control.fixture.observer);
  },
} });
mock.module(new URL('../wallet-platform/modules/native-claims/framing.mjs', import.meta.url).href, { exports: {
  claimDomainCommitment: config => config.claimDomain,
} });
mock.module(new URL('../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs', import.meta.url).href, { exports: {
  validateSolanaBindingTransaction(wire, intent) {
    assert.equal(wire, 'host-original-wire'); assert.deepEqual(intent, control.prepared.intent);
    return { signatureHex: id, transactionSHA256: sha };
  },
} });
mock.module(new URL('./owned-flat-fixture.mjs', import.meta.url).href, { exports: {
  freshFixtureId: () => wireKey,
  writeFixturePrivate(path, value) { control.events.push('write:' + basename(path)); control.artifacts.set(basename(path), copy(value)); },
} });
const { probeUnfundedPostFactClaimHealth, boundedUnfundedHealthError, unfundedHealthFailureDiagnostic }
  = await import('./native-claim-unfunded-health-probe.mjs');

function fixture(options = {}) {
  const c = { events: [], artifacts: new Map(), records: [], factCounts: [0, 0, 0, 0], transferCalls: 0, factsCalls: 0,
    observeCalls: 0, healthCalls: [0, 0], validationCalls: [0, 0], healthResults: [], reports: [], head: { number: '60', hash: '12'.repeat(32), timestamp: '1000' },
    custody: [0, 1].map(() => ({ accounts: [{ role: 'escrow', total: '5000000' }], feeAudit: { actualFees: '0' } })) };
  const keys = [0, 1, 2, 3].map(index => ({ x: String(index).repeat(64), y: 'a'.repeat(64) }));
  const configs = ['1', '2'].map((nativeFamily, i) => ({ nativeFamily, claimDomain: String(i + 1).repeat(64) }));
  const view = { head: copy(c.head), gateways: configs.map(config => ({ claimDomain: config.claimDomain, wrapperSupply: '0',
    intentCount: '0', ticketCount: '0', pendingRedemptions: '0', pendingRefunds: '0',
    heldUnissued: '0', reservedFees: '0', activePayout: '0'.repeat(64), intents: [], tickets: [] })) };
  const binding = { family: '2', genesis: 'native-genesis', asset: 'registered-asset',
    sourceEndpoint: 'solver', destinationEndpoint: 'recipient-0' };
  c.prepared = { intent: { lamports: '1000000', wireKeyCommitment: wireKey,
    sourcePublicKey: 'solver', recipientPublicKey: 'recipient-0' } };
  const native = { get transfers() { return copy(c.records); }, solver: 'solver-address', solverHex: '0xsolver', recipients: ['recipient-0', 'recipient-1'],
    async balance(address) {
      if (!this.transfers.length) return address === this.solver ? '10000000' : '2000000';
      return address === this.solver ? '8995000' : address === this.recipients[0] ? '3000000' : '2000000';
    },
    adapter(input) {
      assert.deepEqual(input, { asset: 'registered-asset', recipientIndex: 0 });
      return { binding,
        async assertPrepared(prepared) { assert.equal(prepared, c.prepared); c.events.push('prepared-current'); },
        async transfer(request, callbacks) {
          c.transferCalls++; c.events.push('transfer'); assert.deepEqual(request, { amount: '1000000', wireKeyCommitment: wireKey });
          assert.deepEqual(Object.keys(callbacks).sort(), ['beforeSign', 'onSigned']);
          await callbacks.beforeSign(c.prepared); c.events.push('sign');
          await callbacks.onSigned({ nativeWire: 'host-original-wire' }); c.events.push('broadcast');
          c.records.push({ nativeId: id, nativeWire: 'host-original-wire', transactionSHA256: sha,
            intent: copy(c.prepared.intent), phase: 'BROADCAST', broadcastAttempts: options.twoBroadcasts ? 2 : 1 });
          if (options.transferError) throw options.transferError;
          return { nativeId: id, transactionSHA256: sha };
        },
      };
    },
    async observe(nativeId) {
      assert.equal(nativeId, id); c.observeCalls++; c.events.push('observe-original');
      const row = c.records[0]; row.phase = 'OBSERVED_FINALIZED';
      row.observation = { status: 'observed', nativeId: id, nativeWire: options.changedWire ? 'other-wire' : row.nativeWire, feeLamports: '5000' };
      return row.observation;
    },
  };
  c.fixture = { runtime: { transactions: [] }, claims: { configs }, owners: [], system: { registry: { keys } },
    bitcoin: { transfers: [], inventory: async () => copy(c.custody[0]) }, graphBitcoin: { transfers: [] }, graphSolana: native,
    solana: { transfers: [], roles: { depositor: { endpoint: 'depositor' }, escrow: { endpoint: 'escrow' }, recipient: { endpoint: 'custody-recipient' } },
      inventory: async () => copy(c.custody[1]) }, rules: [{}, { family: '2', asset: binding.asset, genesis: binding.genesis }],
    operators: keys.map(publicKey => ({ publicKey })), graphOperators: keys.map((publicKey, index) => ({ publicKey,
      status: () => ({ certifiedInventoryCount: c.factCounts[index] }) })),
    observer: { async read() { c.events.push('claims-read'); return copy(view); }, async assertCurrent() { c.events.push('claims-current'); } },
    quorum: { async health(request) {
      const index = configs.findIndex(config => config.claimDomain === request.claimDomain);
      assert.ok(index === 0 || index === 1); assert.deepEqual(request, { claimDomain: configs[index].claimDomain, mode: 'ingress' });
      assert.deepEqual(c.factCounts, [1, 1, 1, 0]); c.healthCalls[index]++; c.events.push('claim-health-' + index);
      if (options.claimEffect) c.fixture.runtime.transactions.push({});
      if (options.claimErrors?.[index]) throw options.claimErrors[index];
      const result = { head: options.changedHead ? { ...c.head, number: '61' } : copy(c.head),
        signatures: ['host-private-signature-' + index], message: { domainIndex: index } };
      c.healthResults[index] = result; return result;
    }, async assertOriginalAuthorizationCurrent(originalResult) {
      assert.equal(arguments.length, 1, 'validation has no options');
      const index = c.healthResults.indexOf(originalResult);
      assert.ok(index === 0 || index === 1, 'exact original health object required');
      assert.equal(originalResult, c.healthResults[index]); assert.deepEqual(c.healthCalls, index ? [1, 1] : [1, 0]);
      c.validationCalls[index]++; c.events.push('validate-original-' + index);
      if (options.validationEffect) c.fixture.runtime.transactions.push({});
      if (options.validationNativeEffect) c.fixture.solana.transfers.push({});
      if (options.validationHistory) c.factCounts[0]++;
      if (options.validationMutation) originalResult.signatures[0] = 'changed-original-signature';
      if (options.validationErrors?.[index]) throw options.validationErrors[index];
      return options.validationResult;
    } },
    graphQuorum: {
      async facts(request) {
        c.factsCalls++; c.events.push('facts'); assert.deepEqual(request, { family: '2', recipientIndex: '0', nativeId: id, wireKeyCommitment: wireKey });
        if (options.factsError) throw options.factsError;
        c.factCounts = [1, 1, 1, 0]; return { certificates: [{}, {}, {}], head: copy(c.head) };
      },
      async health(request) {
        c.events.push('graph-health'); assert.deepEqual(request, { poolIndex: 1 }); assert.deepEqual(c.factCounts, [1, 1, 1, 0]);
        if (options.graphError) throw options.graphError;
        if (options.custodyEffect) c.custody[0].accounts[0].total = '4000000';
        return { head: copy(c.head) };
      },
      async checkpoint(request) {
        c.events.push('checkpoint'); assert.deepEqual(request, { poolIndex: 1, requestId: wireKey });
        if (options.lostRetainedFact) c.factCounts[1] = 0;
        if (options.newFinalizedContext) c.records[0].observation.currentSlot = '900';
        if (options.changedOriginal) c.records[0].nativeWire = 'replacement-wire';
        return { head: copy(c.head) };
      },
    },
  };
  c.run = () => { control = c; return probeUnfundedPostFactClaimHealth({ fixture: c.fixture, privateDirectory: '/host-only-private-audit',
    stage: async name => { c.events.push('stage:' + name); }, audit: async () => { c.events.push('audit'); },
    onReport: async value => { c.reports.push(value); } }); };
  c.view = view; return c;
}

test('one original solver effect/fact precedes both direct claim domains and optional graph checks', async () => {
  const c = fixture(), result = await c.run(), at = name => c.events.indexOf(name);
  assert.equal(c.transferCalls, 1); assert.equal(c.observeCalls, 1); assert.equal(c.factsCalls, 1); assert.deepEqual(c.healthCalls, [1, 1]);
  assert.deepEqual(c.validationCalls, [1, 1]); assert.equal(result.validationScope, UNFUNDED_HEALTH_VALIDATION_SCOPE);
  assert.ok(at('prepared-current') < at('sign'));
  assert.ok(at('write:unfunded-health-signed-before-broadcast.json') < at('broadcast'));
  for (const [a, b] of [['observe-original', 'facts'], ['facts', 'claim-health-0'], ['claim-health-0', 'validate-original-0'],
    ['validate-original-0', 'claim-health-1'], ['claim-health-1', 'validate-original-1'],
    ['validate-original-1', 'graph-health'], ['graph-health', 'checkpoint']]) assert.ok(at(a) < at(b), a + ' before ' + b);
  assert.equal(result.checksPassed, true); assert.equal(result.loadedEquivalence, false);
  assert.deepEqual(result.nativeEffects, { custodyBitcoin: 0, custodySolana: 0, graphBitcoin: 0, graphSolana: 1 });
  assert.equal(result.userDeposits, 0); assert.equal(result.claimSupply, 0); assert.equal(result.proofs, 0); assert.equal(result.owners, 0);
  assert.deepEqual(result.claimHealthValidation, [0, 1].map(domainIndex => ({ domainIndex, calls: 1, ok: true,
    assertOnlyResult: true, originalBytesUnchanged: true })));
  for (const index of [0, 1]) {
    const retained = c.artifacts.get('unfunded-health-claim-domain-' + index + '-validation.json');
    assert.equal(retained.originalResultSHA256Before, retained.originalResultSHA256After);
    assert.equal(retained.validationScope, UNFUNDED_HEALTH_VALIDATION_SCOPE);
  }
  for (const privateText of [id, wireKey, sha, 'host-original-wire', 'host-private-signature', c.fixture.claims.configs[0].claimDomain])
    assert.ok(!JSON.stringify(c.reports).includes(privateText));
  await assert.rejects(c.run(), /ONE_PROBE/); assert.equal(c.transferCalls, 1);
});

test('original unknown broadcast is reconciled once without retry; unrelated errors are not', async () => {
  const error = Object.assign(new Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE'), { nativeId: id });
  const c = fixture({ transferError: error }); await c.run(); assert.equal(c.transferCalls, 1); assert.equal(c.observeCalls, 1);
  for (const error of [new Error('SOLANA_OTHER_ERROR'), Object.assign(new Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE'), { nativeId: 'wrong' })]) {
    const c = fixture({ transferError: error }); await assert.rejects(c.run(), value => value === error);
    assert.equal(c.transferCalls, 1); assert.equal(c.observeCalls, 0); assert.equal(c.factsCalls, 0);
  }
});

test('both direct claim errors are retained once and sanitized; no poisoned graph continuation', async () => {
  const cause = Object.assign(new Error('FLAT_OPERATOR_AUDIT_TOO_OLD'), {
    auditBudget: { phase: 'after-operation', elapsedMilliseconds: 30001, limitMilliseconds: 30000 } });
  const first = new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN', { cause }), second = new Error('COMBINED_OPERATOR_CLOSED_OR_POISONED');
  const c = fixture({ claimErrors: [first, second] }), result = await c.run();
  assert.equal(result.completed, true); assert.equal(result.checksPassed, false); assert.deepEqual(c.healthCalls, [1, 1]);
  assert.deepEqual(c.validationCalls, [0, 0]);
  assert.deepEqual(result.claimHealthValidation, [0, 1].map(domainIndex => ({ domainIndex, calls: 0, ok: false,
    skipped: 'ORIGINAL_HEALTH_UNAVAILABLE' })));
  assert.equal(result.claimHealth[0].error.code, first.message); assert.equal(result.claimHealth[0].error.causeCode, cause.message);
  assert.equal(result.claimHealth[0].error.auditBudget.limitMilliseconds, 30000);
  assert.equal(result.claimHealth[1].error.code, second.message);
  assert.ok(!c.events.includes('graph-health')); assert.ok(!c.events.includes('checkpoint'));
  const retained = c.artifacts.get('unfunded-health-claim-domain-0-error.json');
  assert.deepEqual(retained.chain.map(row => row.message), [first.message, cause.message]);
  assert.ok(retained.chain.every(row => row.frames.length <= 12));
  assert.equal(c.transferCalls, 1); assert.equal(c.factsCalls, 1);
  await assert.rejects(c.run(), /ONE_PROBE/);
});

test('private original errors are bounded and public reports exclude raw RPC text', async () => {
  const error = new Error('private RPC text ' + 'z'.repeat(8000)); error.cause = error;
  const c = fixture({ claimErrors: [error] }), report = await c.run();
  assert.equal(report.claimHealth[0].error.code, 'NATIVE_UNFUNDED_HEALTH_FAILED');
  assert.ok(!JSON.stringify(c.reports).includes('private RPC text'));
  const retained = boundedUnfundedHealthError(error); assert.equal(retained.chain.length, 1); assert.equal(retained.chain[0].message.length, 1024);
  assert.ok(JSON.stringify(retained).length < 6000);
});

test('private error extraction never invokes accessors, proxy traps or non-string coercion', async () => {
  let traps = 0;
  const trap = () => { traps++; throw new Error('TRAP_MUST_NOT_RUN'); };
  const accessors = Object.defineProperties({}, Object.fromEntries(['message', 'stack', 'cause', 'causeCodes', 'code']
    .map(key => [key, { get: trap }])));
  const inherited = Object.create(accessors);
  const proxy = new Proxy({}, { get: trap, getOwnPropertyDescriptor: trap, getPrototypeOf: trap, ownKeys: trap });
  const revoked = Proxy.revocable({}, { get: trap, getOwnPropertyDescriptor: trap }); revoked.revoke();
  const coercion = { toString: trap, valueOf: trap, [Symbol.toPrimitive]: trap };
  const nonStrings = { message: coercion, stack: coercion, cause: 42 };
  for (const error of [accessors, inherited, proxy, revoked.proxy, nonStrings]) {
    const retained = boundedUnfundedHealthError(error);
    assert.equal(retained.code, 'NATIVE_UNFUNDED_HEALTH_FAILED');
    assert.ok(retained.chain.every(row => row.message === '' && row.frames.length === 0));
    const c = fixture({ claimErrors: [error] }), report = await c.run();
    assert.deepEqual(c.healthCalls, [1, 1]); assert.equal(report.claimHealth[0].ok, false);
    assert.equal(report.claimHealth[1].ok, true); assert.equal(report.completed, true); assert.equal(report.checksPassed, false);
    assert.equal(traps, 0);
  }
  const message = 'FLAT_OPERATOR_FAILED', stack = message + '\n' + Array.from({ length: 30 }, () => '    at ' + 's'.repeat(500)).join('\n');
  const ordinary = { message, stack }; ordinary.cause = ordinary;
  const retained = boundedUnfundedHealthError(ordinary);
  assert.equal(retained.chain.length, 1); assert.equal(retained.chain[0].message, message);
  assert.equal(retained.chain[0].frames.length, 12); assert.ok(retained.chain[0].frames.every(frame => frame.length === 256));
});

test('revoked nested causeCodes gets an opaque fallback and cannot block the second domain', async () => {
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  const error = Object.assign(new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN'), { causeCodes: revoked.proxy });
  const opaque = { code: 'NATIVE_UNFUNDED_HEALTH_FAILED', causeCode: null, causeCodes: [] };
  assert.deepEqual(unfundedHealthFailureDiagnostic(error), opaque);
  const retained = boundedUnfundedHealthError(error);
  assert.equal(retained.chain[0].message, 'FLAT_OPERATOR_SIGNING_UNCERTAIN'); assert.equal(retained.code, opaque.code);
  const c = fixture({ claimErrors: [error] }), report = await c.run();
  assert.deepEqual(c.healthCalls, [1, 1]); assert.deepEqual(report.claimHealth[0].error, opaque);
  assert.equal(report.claimHealth[1].ok, true); assert.equal(report.completed, true); assert.equal(report.checksPassed, false);
  const graph = fixture({ graphError: error }), graphReport = await graph.run();
  assert.deepEqual(graphReport.graphHealth.error, opaque); assert.equal(graphReport.completed, true);
  assert.ok(!graph.events.includes('checkpoint'));
});

test('AssertionError comparisons remain private while public error labels remain bounded', async () => {
  let error;
  try { assert.equal('private-original-value', 'private-expected-value', 'FLAT_OPERATOR_FAILED'); }
  catch (caught) { error = caught; }
  const retained = boundedUnfundedHealthError(error);
  assert.equal(retained.code, 'FLAT_OPERATOR_FAILED');
  assert.ok(retained.chain[0].message.includes('private-original-value'));
  assert.ok(retained.chain[0].message.includes('private-expected-value'));
  const c = fixture({ claimErrors: [error] }), report = await c.run();
  assert.equal(report.claimHealth[0].error.code, 'FLAT_OPERATOR_FAILED'); assert.deepEqual(c.healthCalls, [1, 1]);
  assert.ok(!JSON.stringify(c.reports).includes('private-original-value'));
  assert.ok(!JSON.stringify(c.reports).includes('private-expected-value'));
});

test('facts failure propagates original error and cannot reach any health or retry', async () => {
  const error = new Error('FLAT_OPERATOR_QUORUM_TOO_OLD'), c = fixture({ factsError: error });
  await assert.rejects(c.run(), value => value === error); assert.equal(c.factsCalls, 1); assert.deepEqual(c.healthCalls, [0, 0]);
  assert.equal(c.transferCalls, 1); await assert.rejects(c.run(), /ONE_PROBE/);
});

test('claim supply, intent/ticket history, owner, extra effects or graph history reject before transfer', async () => {
  for (const mutate of [c => { c.view.gateways[1].wrapperSupply = '1'; }, c => { c.view.gateways[0].intentCount = '1'; },
    c => { c.view.gateways[0].tickets.push({}); }, c => { c.fixture.owners.push({}); },
    c => { c.fixture.solana.transfers.push({}); }, c => { c.fixture.graphBitcoin.transfers.push({}); },
    c => { c.factCounts[0] = 1; }, c => { c.fixture.operators[0].publicKey = {}; },
    c => { c.fixture.solana.roles.escrow.endpoint = 'solver'; }, c => { c.fixture.claims.configs.reverse(); }]) {
    const c = fixture(); mutate(c); await assert.rejects(c.run()); assert.equal(c.transferCalls, 0);
  }
});

test('extra broadcast, changed wire/head/custody/effect or lost history fail closed', async () => {
  for (const options of [{ changedWire: true }, { twoBroadcasts: true }, { changedHead: true }, { claimEffect: true },
    { custodyEffect: true }, { lostRetainedFact: true }, { changedOriginal: true }]) {
    const c = fixture(options); await assert.rejects(c.run()); assert.equal(c.transferCalls, 1); assert.ok(c.factsCalls <= 1);
  }
  const fresh = fixture({ newFinalizedContext: true }); await fresh.run(); assert.equal(fresh.records[0].observation.currentSlot, '900');
});

test('optional graph failure is retained without checkpoint or another fact', async () => {
  const error = new Error('FLAT_OPERATOR_SIGNING_UNCERTAIN'), c = fixture({ graphError: error }), result = await c.run();
  assert.equal(result.checksPassed, false); assert.equal(result.graphHealth.error.code, error.message);
  assert.deepEqual(c.healthCalls, [1, 1]); assert.ok(!c.events.includes('checkpoint')); assert.equal(c.factsCalls, 1);
});

test('original validation failure remains separate, preserves both domains and never retries health', async () => {
  const failure = new Error('CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED');
  const later = new Error('COMBINED_OPERATOR_CLOSED_OR_POISONED');
  const c = fixture({ validationErrors: [failure], claimErrors: [null, later] }), result = await c.run();
  assert.deepEqual(c.healthCalls, [1, 1]); assert.deepEqual(c.validationCalls, [1, 0]);
  assert.equal(result.claimHealth[0].ok, true); assert.equal(result.claimHealth[0].error, undefined);
  assert.equal(result.claimHealthValidation[0].ok, false);
  assert.equal(result.claimHealthValidation[0].error.code, failure.message);
  assert.equal(result.claimHealthValidation[0].originalBytesUnchanged, true);
  assert.equal(result.claimHealthValidation[1].skipped, 'ORIGINAL_HEALTH_UNAVAILABLE');
  assert.equal(result.completed, true); assert.equal(result.checksPassed, false);
  assert.ok(!c.events.includes('graph-health')); assert.equal(c.transferCalls, 1); assert.equal(c.factsCalls, 1);
  assert.equal(c.artifacts.get('unfunded-health-claim-domain-0-validation-error.json').chain[0].message, failure.message);
  const worker = readFileSync(new URL('./native-claim-unfunded-health-worker.mjs', import.meta.url), 'utf8');
  const expression = worker.match(/const failure = ([\s\S]+?);\n      throw Object\.assign/)?.[1]; assert.ok(expression);
  assert.equal(vm.runInNewContext(expression, { result: { diagnostic: result } }).error.code, failure.message,
    'worker keeps first validation failure ahead of a later poisoned-domain failure');
  await assert.rejects(c.run(), /ONE_PROBE/); assert.deepEqual(c.healthCalls, [1, 1]);
});

test('only successful original health objects receive exactly one assert-only validation', async () => {
  const c = fixture({ claimErrors: [new Error('CLAIM_COMPLETE_AUDIT_UNAVAILABLE')] }), result = await c.run();
  assert.deepEqual(c.healthCalls, [1, 1]); assert.deepEqual(c.validationCalls, [0, 1]);
  assert.equal(result.claimHealthValidation[1].ok, true); assert.equal(result.claimHealthValidation[1].assertOnlyResult, true);
  assert.equal(result.checksPassed, false); assert.ok(!c.events.includes('graph-health'));
  const missing = fixture(); delete missing.fixture.quorum.assertOriginalAuthorizationCurrent;
  await assert.rejects(missing.run(), /VALIDATION_API_REQUIRED/); assert.equal(missing.transferCalls, 0);
  for (const returned of [null, false, {}, { newAuthorization: true }]) {
    const c = fixture({ validationResult: returned }), report = await c.run();
    assert.deepEqual(c.healthCalls, [1, 1]); assert.deepEqual(c.validationCalls, [1, 1]);
    assert.equal(report.checksPassed, false);
    for (const row of report.claimHealthValidation) assert.equal(row.error.code, 'NATIVE_UNFUNDED_VALIDATION_ASSERT_ONLY');
    assert.ok(!c.events.includes('graph-health')); assert.equal(c.transferCalls, 1); assert.equal(c.factsCalls, 1);
  }
});

test('validation cannot mutate original authorization bytes, custody effects or retained graph history', async () => {
  for (const options of [{ validationMutation: true }, { validationEffect: true }, { validationNativeEffect: true }, { validationHistory: true }]) {
    const c = fixture(options); await assert.rejects(c.run());
    assert.equal(c.transferCalls, 1); assert.equal(c.factsCalls, 1); assert.deepEqual(c.healthCalls, [1, 0]);
    assert.deepEqual(c.validationCalls, [1, 0]); assert.ok(!c.events.includes('graph-health'));
    if (options.validationMutation) {
      assert.equal(c.reports.at(-1).claimHealthValidation[0].originalBytesUnchanged, false);
      assert.equal(c.reports.at(-1).claimHealthValidation[0].ok, false);
      const retained = c.artifacts.get('unfunded-health-claim-domain-0-validation.json');
      assert.notEqual(retained.originalResultSHA256Before, retained.originalResultSHA256After);
    }
  }
});

test('validation errors use inert private/public diagnostics and do not invent key-use counters', async () => {
  const revoked = Proxy.revocable([], {}); revoked.revoke();
  const error = Object.assign(new Error('CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED'), { causeCodes: revoked.proxy });
  const c = fixture({ validationErrors: [error] }), result = await c.run();
  assert.deepEqual(c.healthCalls, [1, 1]); assert.deepEqual(c.validationCalls, [1, 1]);
  assert.equal(result.claimHealthValidation[0].error.code, 'NATIVE_UNFUNDED_HEALTH_FAILED');
  assert.equal(result.claimHealthValidation[1].ok, true); assert.equal(result.checksPassed, false);
  assert.equal(result.loadedEquivalence, false);
  for (const key of ['nativeSigningCalls', 'nativeSignatures', 'controllerEvmLease', 'fullLoadedAcceptance'])
    assert.equal(Object.hasOwn(result, key), false);
  const helper = readFileSync(new URL('./native-claim-unfunded-health-probe.mjs', import.meta.url), 'utf8');
  assert.equal([...helper.matchAll(/quorum\.health\(/g)].length, 1);
  assert.equal([...helper.matchAll(/quorum\.assertOriginalAuthorizationCurrent\(/g)].length, 1);
  assert.match(helper, /assertOriginalAuthorizationCurrent\(value\)/);
});

test('isolated route is source-disabled before files/spawn and task compiler catalog stays exact', async () => {
  const route = NATIVE_CLAIM_RUN_ROUTES.unfundedHealth;
  assert.equal(nativeClaimRunDirectory(route.entry, UNFUNDED_HEALTH_PROFILE), route.local);
  for (const other of ['legacy', 'graph', 'loadedFacts']) assert.throws(() => nativeClaimRunDirectory(NATIVE_CLAIM_RUN_ROUTES[other].entry, UNFUNDED_HEALTH_PROFILE));
  assert.throws(() => nativeClaimRunDirectory(route.entry, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH'));
  assert.equal(UNFUNDED_HEALTH_REAL_RUN_DISABLED, true);
  const before = existsSync(join(ROOT, route.local));
  await assert.rejects(runNativeClaimUnfundedHealthSupervisor(), /REQUIRES_FROZEN_CHECKPOINT/);
  await assert.rejects(runNativeClaimUnfundedHealthSupervisor({}), /NO_SUPERVISOR_OPTIONS/);
  assert.equal(existsSync(join(ROOT, route.local)), before);
  assert.equal(createHash('sha256').update(readFileSync(new URL('./task-catalog.mjs', import.meta.url))).digest('hex'),
    '43f0404c81fbe6961c24255a73509caec99014026cd2eb23795abd2b5b8298f7');
  const worker = readFileSync(new URL('./native-claim-unfunded-health-worker.mjs', import.meta.url), 'utf8');
  assert.ok(worker.indexOf('assert.equal(UNFUNDED_HEALTH_REAL_RUN_DISABLED, false') < worker.indexOf('mkdirSync(privateDirectory'));
  assert.match(worker, /fixture = await createOwnedNativeClaimGraphFixture/);
  assert.match(worker, /supervisorStartTimeTicks/); assert.match(worker, /assert\.equal\(self\.session, process\.pid\)/);
  assert.match(worker, /assert\.deepEqual\(proofAttempts\(\), originalProofAttempts/);
  assert.doesNotMatch(worker, /createProofProcess|createOwner\(|createNativeClaimController|runtime\.send\(|native-claim-flow\.mjs/);
  const helper = readFileSync(new URL('./native-claim-unfunded-health-probe.mjs', import.meta.url), 'utf8');
  assert.equal([...helper.matchAll(/adapter\.transfer\(/g)].length, 1); assert.equal([...helper.matchAll(/graphQuorum\.facts\(/g)].length, 1);
  assert.equal([...helper.matchAll(/native\.observe\(/g)].length, 1);
  assert.doesNotMatch(helper, /retainNative|seed|createProof|createOwner\(|runtime\.send\(/);
  const pins = readFileSync(new URL('./native-claim-source-pins.mjs', import.meta.url), 'utf8');
  assert.match(pins, /integration\/native-claim-unfunded-health-worker.mjs/);
  assert.equal(NATIVE_FLOW_LIMITS.minimumAvailableRAMBytes, LIMITS.availableRAM);
  assert.equal(NATIVE_FLOW_LIMITS.minimumFreeDiskBytes, LIMITS.freeDisk);
  assert.equal(NATIVE_FLOW_LIMITS.maximumProofOrMainRSSBytes, LIMITS.workerRSS);
  assert.equal(NATIVE_FLOW_LIMITS.totalMilliseconds, 90 * 60 * 1000); assert.equal(NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds, 15000);
});

test('supervisor rejects proof/owner descendants and all scope or effect overclaims', async () => {
  assert.equal(unfundedHealthProcessFailure([{ role: 'evm-runtime' }, { role: 'solana-runtime' }]), null);
  for (const role of ['flat-proof-worker', 'golden-note-proof-worker', 'flat-proof-role', 'flat-owner-role', 'golden-owner-role', 'recipient-role'])
    assert.equal(unfundedHealthProcessFailure([{ role }]), 'NATIVE_UNFUNDED_OWNER_OR_PROOF_PROCESS');
  const c = fixture(), diagnostic = await c.run();
  const result = { format: UNFUNDED_HEALTH_RESULT, profile: UNFUNDED_HEALTH_PROFILE,
    validationScope: UNFUNDED_HEALTH_VALIDATION_SCOPE, phase: 'completed', success: true,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, supervisor: { supervisorPID: 1, workerPID: 2 },
    cleanup: { closedEvm: true, closedBitcoin: true, closedSolana: true, applicationClosed: true },
    proofs: [], proofAttemptsUnchanged: true, loadedEquivalence: false, fullNativeGraphAcceptance: false, fullWalletAcceptance: false, diagnostic };
  assert.equal(validateNativeClaimUnfundedHealthResult(result, 1, 2).loadedEquivalence, false);
  for (const mutate of [r => { r.loadedEquivalence = true; }, r => { r.fullWalletAcceptance = true; },
    r => { r.proofs.push({ relation: 'deposit_intent' }); }, r => { r.proofAttemptsUnchanged = false; },
    r => { r.diagnostic.transfers = 2; }, r => { r.diagnostic.factsCalls = 2; }, r => { r.diagnostic.claimIntents = 1; },
    r => { r.diagnostic.claimHealth[1].ok = false; }, r => { r.cleanup.applicationClosed = false; },
    r => { delete r.validationScope; }, r => { delete r.diagnostic.validationScope; },
    r => { r.diagnostic.claimHealthValidation[0].calls = 2; }, r => { r.diagnostic.claimHealthValidation[1].ok = false; },
    r => { r.diagnostic.claimHealthValidation[0].assertOnlyResult = false; },
    r => { r.diagnostic.claimHealthValidation[0].originalBytesUnchanged = false; },
    r => { r.cleanup.closedSolana = false; }, r => { r.diagnostic.nativeEffects.custodySolana = 1; }]) {
    const changed = copy(result); mutate(changed); assert.throws(() => validateNativeClaimUnfundedHealthResult(changed, 1, 2));
  }
});

test('compact cleanup is idempotent, waits for fixture drain, and preserves original failure', async () => {
  const source = readFileSync(new URL('./native-claim-unfunded-health-worker.mjs', import.meta.url), 'utf8');
  const cleanupSource = source.match(/^  function cleanup\(\) \{[\s\S]*?^  \}\n(?=  const stop =)/m)?.[0]; assert.ok(cleanupSource);
  for (const broken of [false, true]) {
    let release, closeCalls = 0; const exit = new Promise(resolve => { release = resolve; });
    const context = { assert, cleanupPromise: undefined, process: {}, unfundedHealthFailureDiagnostic: error => ({ code: error.message }),
      result: { success: true, phase: 'completed', errorCode: 'ORIGINAL_DIAGNOSTIC_ERROR', cleanup: {} },
      fixture: { async close() { closeCalls++; await exit; return { closedEvm: true, closedBitcoin: true, closedSolana: true,
        owners: [], resources: [{ closed: !broken }], operators: [{ closed: true }] }; } } };
    const cleanup = vm.runInNewContext('(' + cleanupSource + ')', context), first = cleanup(), second = cleanup();
    assert.equal(first, second); assert.equal(closeCalls, 1); let done = false; void first.then(() => { done = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(done, false); release(); await first;
    assert.equal(context.result.cleanup.applicationClosed, !broken); assert.equal(context.result.errorCode, 'ORIGINAL_DIAGNOSTIC_ERROR');
    if (broken) { assert.equal(context.result.success, false); assert.equal(context.process.exitCode, 1); }
  }
});
