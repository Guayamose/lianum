/** SYNTHETIC NORMALIZED FIXTURES ONLY. No RPC, blockchain nodes, or proofs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COHORT_PUBLIC_SCHEMA, COHORT_PUBLIC_PROFILE, COHORT_COVERAGE, COHORT_TERMS,
  validatePublicCohortTranscript, evaluatePublicCohort, evaluateCohortIssuerDisclosure,
  enumeratePublicAmountPairs, M23_DISTINCTIVE_AMOUNT_BASELINE, publicCohortMetrics,
} from '../src/private-cohort-public-evaluator.mjs';

const h = n => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const time = (lo, hi = lo) => ({ earliestMs: String(lo), latestMs: String(hi) });
const root = (n, commitments) => ({ root: h(n), commitments, evidenceRefs: ['fixture'] });
function fixture() {
  const events = [], ref = ['fixture'];
  function add(id, kind, block, at, data) {
    const chain = ['SOL', 'BTC'].includes(kind) ? kind : 'EVM';
    const metadata = chain === 'EVM' ? {
      from: kind === 'DEPOSIT' ? `${id}-public-owner` : 'shared-public-relayer', to: 'synthetic-pool',
      nonce: String(block), valueWei: kind === 'DEPOSIT' ? data.amountWei : '0',
      gasLimit: '9000000', gasUsed: '4000000', gasPriceWei: '1000000000',
      blockTimestampSeconds: String(Math.floor(at / 1000)),
      calldataHash: h(200 + block), logsHash: h(300 + block), headerHash: h(400 + block),
    } : chain === 'SOL' ? {
      feePayer: 'shared-SOL-solver', feeLamports: '5000', accountKeys: ['shared-SOL-solver', `${id}-recipient`, 'system-program'],
      instructionsHash: h(500 + block), blockHash: `SOL-block-${block}`, blockTimeSeconds: '1',
    } : {
      inputOutpoints: [`public-funding-${id}:0`], inputAddresses: ['shared-BTC-wallet-address'],
      feeSats: '1000', rawTransactionHash: h(600 + block), blockHash: `BTC-block-${block}`, blockTimeSeconds: '1',
    };
    events.push({ id, kind, chain, txid: `SYNTHETIC-${id}-transaction`, position: { block: String(block), transaction: '0', sub: '0' }, time: time(at), metadata, fundingEvidenceRefs: ref.slice(), evidenceRefs: ref.slice(), data });
  }
  add('D0', 'DEPOSIT', 1, 100, { amountWei: COHORT_TERMS.depositWei, commitment: h(1) });
  add('D1', 'DEPOSIT', 2, 200, { amountWei: COHORT_TERMS.depositWei, commitment: h(2) });
  add('S0', 'RESERVE', 3, 300, { root: h(100), expectedPostRoot: h(101), reservedCommitment: h(3), changeCommitment: h(4) });
  add('S1', 'RESERVE', 4, 400, { root: h(101), expectedPostRoot: h(102), reservedCommitment: h(5), changeCommitment: h(6) });
  add('SOL0', 'SOL', 10, 500, { amount: '3000000', source: 'shared-SOL-solver', recipient: 'SOL0-recipient', readyTime: time(550) });
  add('SOL1', 'SOL', 11, 600, { amount: '3000000', source: 'shared-SOL-solver', recipient: 'SOL1-recipient', readyTime: time(650) });
  add('BTC0', 'BTC', 20, 800, { amount: '100000', recipientScript: '0014-synthetic-BTC0', vout: '0', readyTime: time(850) });
  add('BTC1', 'BTC', 21, 900, { amount: '100000', recipientScript: '0014-synthetic-BTC1', vout: '0', readyTime: time(950) });
  const permit = (chain, effect, statement, at) => ({ nativeChain: chain, effectHash: h(effect), statementHash: h(statement), authorityVersion: '0', observedAt: String(Math.floor(at / 1000)), validUntil: '30', observationTime: time(at) });
  add('PS0', 'PERMIT', 5, 1000, permit('SOL', 10, 701, 995));
  add('PB0', 'PERMIT', 6, 1010, permit('BTC', 11, 701, 1005));
  add('PS1', 'PERMIT', 7, 1020, permit('SOL', 12, 702, 1015));
  add('PB1', 'PERMIT', 8, 1030, permit('BTC', 13, 702, 1025));
  add('O0', 'TERMINAL', 9, 1100, { originalAroot: h(101), solEffectTag: h(10), btcEffectTag: h(11), solOutputCommitment: h(7), btcOutputCommitment: h(8), statementHash: h(701), solAuthorityVersion: '0', btcAuthorityVersion: '0' });
  add('O1', 'TERMINAL', 10, 1200, { originalAroot: h(102), solEffectTag: h(12), btcEffectTag: h(13), solOutputCommitment: h(9), btcOutputCommitment: h(14), statementHash: h(702), solAuthorityVersion: '0', btcAuthorityVersion: '0' });
  for (let i = 0; i < 6; i++) add(`X${i}`, 'EXIT', 11 + i, 1300 + i * 100, {
    amountWei: COHORT_TERMS.outputWei, noteClass: i < 2 ? 'BALANCE' : 'PAYOUT', recipient: `public-exit-address-${i}`, root: h(104),
  });
  const roots = [root(100, [h(1), h(2)]), root(101, [1, 2, 3, 4].map(h)), root(102, [1, 2, 3, 4, 5, 6].map(h)), root(103, [1, 2, 3, 4, 5, 6, 7, 8].map(h)), root(104, [1, 2, 3, 4, 5, 6, 7, 8, 9, 14].map(h))];
  return {
    schema: COHORT_PUBLIC_SCHEMA, profile: COHORT_PUBLIC_PROFILE, evidenceKind: 'SYNTHETIC_FIXTURE', runId: 'synthetic-not-an-executed-cohort', pool: 'synthetic-pool',
    evidence: [{ id: 'fixture', sha256: h(999), kind: 'SYNTHETIC_FIXTURE' }],
    coverage: Object.fromEntries(COHORT_COVERAGE.map(key => [key, { status: 'COMPLETE', evidenceRefs: ['fixture'], detail: 'Explicitly synthetic closed fixture; no actual RPC coverage claimed' }])),
    events, roots, publicEdges: [],
  };
}
const event = (f, id) => f.events.find(e => e.id === id);
const edge = (kind, from, to, basis = 'KNOWN_TEMPLATE') => ({ kind, from, to, basis, detail: 'SYNTHETIC supported semantic constraint; never inferred merely from a shared controller', evidenceRefs: ['fixture'] });

test('synthetic uniform cohort has exact joint/native/deposit/exit counts, without a probability claim', () => {
  const f = fixture(), before = structuredClone(f), result = evaluatePublicCohort(f);
  assert.deepEqual(f, before, 'pure evaluator must not mutate its transcript');
  assert.equal(result.status, 'EVALUATED'); assert.equal(result.conclusion, 'BOUNDED_PUBLIC_AMBIGUITY');
  assert.deepEqual(result.counts, { joint: 384, nativeToTerminal: 4, depositToReserve: 2, solToBtc: 2, exitToOutput: 48 });
  assert.equal(result.directLinks.filter(l => l.kind === 'RESERVE_TO_TERMINAL').length, 2);
  assert.equal(result.directLinks.filter(l => l.kind === 'PERMIT_TO_TERMINAL').length, 4);
  assert.deepEqual(result.candidateSets.solToTerminal.map(r => r.count), [2, 2]);
  assert.deepEqual(result.candidateSets.exitToOutput.map(r => r.count), [2, 2, 4, 4, 4, 4]);
  assert.equal(result.fullPrivacyAccepted, false); assert.equal(result.evidenceKind, 'SYNTHETIC_FIXTURE');
  assert.ok(result.limitations.some(s => s.includes('not posterior probabilities')));
});

test('direct S/O root and public permit/O effect links survive incomplete coverage', () => {
  const f = fixture(); f.coverage.eventualExits.status = 'MISSING';
  const result = evaluatePublicCohort(f);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.counts, null);
  assert.deepEqual(result.directLinks.find(l => l.from === 'S0'), { kind: 'RESERVE_TO_TERMINAL', from: 'S0', to: 'O0', basis: 'S_EXPECTED_POST_ROOT_EQUALS_O_ORIGINAL_A_ROOT' });
  assert.ok(result.directLinks.some(l => l.from === 'PB1' && l.to === 'O1'));
});

test('address bindings force native/terminal links even when every amount is uniform', () => {
  const f = fixture(); f.publicEdges.push(edge('SAME_INTENT', 'SOL0', 'S0', 'ADDRESS'), edge('SAME_INTENT', 'BTC0', 'S0', 'ADDRESS'));
  const result = evaluatePublicCohort(f);
  assert.equal(result.status, 'EVALUATED'); assert.equal(result.conclusion, 'FORCED_TARGET_LINKS_REMAIN');
  assert.equal(result.counts.nativeToTerminal, 1); assert.equal(result.counts.solToBtc, 1);
  assert.deepEqual(result.candidateSets.solToTerminal.find(r => r.id === 'SOL0').candidates, ['O0']);
});

test('funding constraints and their one-use complement constrain SOL/BTC pairings', () => {
  const f = fixture(); f.publicEdges.push(edge('SAME_INTENT', 'SOL0', 'BTC1', 'FUNDING'));
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.solToBtc, 1); assert.equal(result.counts.nativeToTerminal, 2);
  assert.deepEqual(result.candidateSets.solToBtc.map(r => r.candidates), [['BTC1'], ['BTC0']]);
});

test('all relevant public sender/funding observations stay in input without inventing owner semantics', () => {
  const f = fixture(); f.publicEdges.push(edge('OBSERVATION_ONLY', 'SOL0', 'SOL1', 'ADDRESS'), edge('OBSERVATION_ONLY', 'BTC0', 'BTC1', 'FUNDING'));
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.nativeToTerminal, 4);
  assert.equal(event(f, 'SOL0').data.source, event(f, 'SOL1').data.source);
  assert.deepEqual(event(f, 'BTC0').metadata.inputAddresses, event(f, 'BTC1').metadata.inputAddresses);
  assert.equal(event(f, 'S0').metadata.from, event(f, 'S1').metadata.from);
});

test('eventual exit address linkage feeds back into deposit-to-S assignment', () => {
  const f = fixture(); f.publicEdges.push(edge('SAME_INTENT', 'D0', 'X0', 'ADDRESS'), edge('SAME_INTENT', 'S0', 'X0', 'FUNDING'));
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.depositToReserve, 1);
  assert.deepEqual(result.candidateSets.depositToReserve.find(r => r.id === 'D0').candidates, ['S0']);
});

test('publicly bound native payout constrains its exact role as well as the terminal', () => {
  const f = fixture(); f.publicEdges.push(edge('SAME_NATIVE_PAYOUT', 'SOL0', 'X2', 'ADDRESS'));
  const result = evaluatePublicCohort(f);
  assert.deepEqual(result.candidateSets.exitToOutput.find(r => r.id === 'X2').candidates, ['O0/SOL_PAYOUT', 'O1/SOL_PAYOUT']);
  assert.equal(result.counts.joint, 96);
});

test('public input root membership can force D-to-S even though both deposits precede S', () => {
  const f = fixture(); f.roots[0].commitments = [h(1)];
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.depositToReserve, 1);
  assert.deepEqual(result.candidateSets.depositToReserve.map(r => r.candidates), [['S0'], ['S1']]);
});

test('SOL finality-to-BTC causality forces a pairing; native order is not discarded', () => {
  const f = fixture(); event(f, 'SOL0').data.readyTime = time(850);
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.solToBtc, 1);
  assert.deepEqual(result.candidateSets.solToBtc.find(r => r.id === 'SOL0').candidates, ['BTC1']);
});

test('matching public permit timing constrains its native effect before terminal submission', () => {
  const f = fixture();
  for (const [id, at] of [['PS0', 825], ['PB0', 875]]) {
    event(f, id).time = time(at); event(f, id).data.observationTime = time(at - 5); event(f, id).data.observedAt = '0';
  }
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.nativeToTerminal, 2);
  assert.deepEqual(result.candidateSets.btcToTerminal.find(r => r.id === 'BTC0').candidates, ['O0']);
});

test('public observedAt narrows candidates even if all permit submission times are later', () => {
  const f = fixture(); event(f, 'PB0').data.observationTime = time(875); event(f, 'PB0').data.observedAt = '0';
  const result = evaluatePublicCohort(f);
  assert.equal(result.counts.nativeToTerminal, 2);
  assert.deepEqual(result.candidateSets.btcToTerminal.find(r => r.id === 'BTC0').candidates, ['O0']);
});

test('statement binding, current authority version and lease end are checked from public permit/O data', () => {
  for (const mutate of [f => { event(f, 'PB0').data.statementHash = h(999); }, f => { event(f, 'O0').data.btcAuthorityVersion = '1'; }, f => { event(f, 'PB0').data.validUntil = '1'; }, f => { event(f, 'PB0').data.observedAt = '5'; }]) {
    const f = fixture(); mutate(f); assert.equal(evaluatePublicCohort(f).status, 'INCONSISTENT');
  }
});

test('timestamp uncertainty is solved jointly with causality, without forcing clock equality', () => {
  const f = fixture(); event(f, 'SOL0').data.readyTime = time(700, 850);
  assert.equal(evaluatePublicCohort(f).counts.solToBtc, 2);
  f.publicEdges.push(edge('BEFORE', 'O0', 'S0', 'TIMING'));
  assert.equal(evaluatePublicCohort(f).status, 'INCONSISTENT');
});

for (const category of COHORT_COVERAGE) test(`missing ${category} gives INCOMPLETE, never larger anonymity`, () => {
  const f = fixture(); f.coverage[category] = { status: 'MISSING', evidenceRefs: [], detail: 'No evidence available' };
  const result = evaluatePublicCohort(f);
  assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.counts, null); assert.deepEqual(result.assignments, []);
});

test('missing eventual exit, missing root, or an unsupported public edge fails closed', () => {
  for (const mutate of [f => f.events.pop(), f => f.roots.pop(), f => f.publicEdges.push(edge('NEW_PUBLIC_FUNDING_RULE', 'D0', 'S0', 'OTHER'))]) {
    const f = fixture(); mutate(f); const result = evaluatePublicCohort(f);
    assert.equal(result.status, 'INCOMPLETE'); assert.equal(result.conclusion, 'NO_PRIVACY_CONCLUSION'); assert.equal(result.counts, null);
  }
});

test('wrong public postroot or missing public permit cannot be papered over with cosmetic decoys', () => {
  for (const mutate of [f => { event(f, 'O0').data.originalAroot = h(100); }, f => { f.events = f.events.filter(e => e.id !== 'PB0'); }]) {
    const f = fixture(); mutate(f); assert.equal(evaluatePublicCohort(f).status, 'INCOMPLETE');
  }
});

test('different amounts, malformed exit classes and duplicated outputs contradict this uniform template', () => {
  for (const mutate of [f => { event(f, 'SOL1').data.amount = '3600000'; }, f => { event(f, 'D1').metadata.valueWei = '1'; }, f => { event(f, 'X0').data.noteClass = 'PAYOUT'; }, f => { event(f, 'O1').data.solOutputCommitment = h(7); }]) {
    const f = fixture(); mutate(f); const result = evaluatePublicCohort(f);
    assert.equal(result.status, 'INCONSISTENT'); assert.equal(result.counts, null);
  }
});

test('conflicting public binding edges cannot be reported as a privacy success', () => {
  const f = fixture(); f.publicEdges.push(edge('SAME_INTENT', 'SOL0', 'O0'), edge('DIFFERENT_INTENT', 'SOL0', 'O0'));
  const result = evaluatePublicCohort(f);
  assert.equal(result.status, 'INCONSISTENT'); assert.equal(result.conclusion, 'NO_PRIVACY_CONCLUSION');
});

test('issuer/full-certificate observer is separate and collapses native assignment, with no mutation', () => {
  const f = fixture(), before = structuredClone(f);
  const disclosure = { kind: 'PRIVATE_ISSUER_OR_FULL_CERTIFICATE', mappings: [
    { effectId: 'SOL0', nativeChain: 'SOL', effectHash: h(12) },
    { effectId: 'SOL1', nativeChain: 'SOL', effectHash: h(10) },
    { effectId: 'BTC0', nativeChain: 'BTC', effectHash: h(11) },
    { effectId: 'BTC1', nativeChain: 'BTC', effectHash: h(13) },
  ] };
  const result = evaluateCohortIssuerDisclosure(f, disclosure);
  assert.equal(result.status, 'EVALUATED'); assert.equal(result.observer, 'ISSUER_OR_FULL_CERTIFICATE');
  assert.equal(result.counts.nativeToTerminal, 1); assert.equal(result.counts.solToBtc, 1);
  assert.deepEqual(f, before); assert.equal(evaluatePublicCohort(f).counts.nativeToTerminal, 4);
  assert.equal(publicCohortMetrics(result).observer, 'ISSUER_OR_FULL_CERTIFICATE');
});

test('strict schema rejects private route/certificate/key data, missing public metadata, duplicates and noncanonical units', () => {
  for (const mutate of [
    f => { f.ownerJournal = {}; }, f => { f.A = []; }, f => { f.J = []; }, f => { f.issuerHmacKey = h(44); },
    f => { event(f, 'SOL0').data.certificate = {}; }, f => { delete event(f, 'S0').metadata.nonce; },
    f => { delete event(f, 'S0').metadata.gasUsed; }, f => { event(f, 'BTC0').fundingEvidenceRefs = []; },
    f => { event(f, 'S0').evidenceRefs = ['missing']; }, f => { event(f, 'SOL0').data.amount = 3000000; },
    f => { event(f, 'SOL0').data.amount = '03000000'; }, f => { event(f, 'S0').time = time(30, 20); },
    f => { event(f, 'S0').position.block = '-0'; }, f => { f.events.push(structuredClone(event(f, 'SOL0'))); },
    f => { f.evidenceKind = 'ACTUAL_RPC'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => validatePublicCohortTranscript(f), /PC24_SCHEMA/); }
});

test('M23 actual historical quantities force one amount pairing, without implying completed privacy coverage', () => {
  const actual = M23_DISTINCTIVE_AMOUNT_BASELINE;
  assert.equal(actual.runId, '2026-10-03T09-24-29-226Z');
  assert.match(actual.interpretation, /FAILED before exits/);
  assert.deepEqual(enumeratePublicAmountPairs(actual.solAmounts, actual.btcAmounts), {
    classification: 'AMOUNT_ONLY_CONTROL_NOT_FULL_TRANSCRIPT', assignments: [[0, 1]], candidateCounts: [1, 1], count: 1,
  });
  assert.equal(enumeratePublicAmountPairs(['3000000', '3000000'], ['100000', '100000']).count, 2);
  assert.equal(enumeratePublicAmountPairs(['3000000', '3600000'], ['100000', '100000']).count, 0);
});

test('publication allow-list contains no raw assignments, addresses, tuples or private run fingerprints', () => {
  const evaluated = evaluatePublicCohort(fixture()), metrics = publicCohortMetrics(evaluated), encoded = JSON.stringify(metrics);
  assert.equal(metrics.actualCohortEvaluated, false);
  assert.equal(metrics.comparison, 'SYNTHETIC_ONLY_ACTUAL_COHORT_PENDING');
  assert.equal(metrics.historicalM23AmountControl.completePrivacyBenchmark, false);
  assert.equal(metrics.directPublicLinkCounts.reserveToTerminal, 2);
  for (const value of ['synthetic-not-an-executed-cohort', 'shared-public-relayer', 'SYNTHETIC-SOL0-transaction', 'public-exit-address-0', 'O0/SOL_PAYOUT']) assert.ok(!encoded.includes(value));
  for (const key of ['assignments', 'candidateSets', 'events', 'publicEdges', 'roots', 'runId']) assert.equal(Object.hasOwn(metrics, key), false);
  assert.equal(metrics.candidateCountHistograms.solToBtc.forcedCount, 0);
  assert.match(metrics.transcriptSha256, /^[0-9a-f]{64}$/);
  evaluated.counts.routeFingerprint = 'PRIVATE_ROUTE'; evaluated.limitations.push('PRIVATE_ROUTE');
  assert.ok(!JSON.stringify(publicCohortMetrics(evaluated)).includes('PRIVATE_ROUTE'));
});

test('input array enumeration order does not add an implicit index/owner matching rule', () => {
  const f = fixture(), a = evaluatePublicCohort(f); f.events.reverse();
  const b = evaluatePublicCohort(f);
  assert.deepEqual(b.counts, a.counts);
  assert.deepEqual(new Set(b.assignments.map(JSON.stringify)), new Set(a.assignments.map(JSON.stringify)));
});
