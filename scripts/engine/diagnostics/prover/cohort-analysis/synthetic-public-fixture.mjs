/** SYNTHETIC NORMALIZED FIXTURES ONLY. No RPC, blockchain nodes, or proofs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COHORT_PUBLIC_SCHEMA, COHORT_PUBLIC_PROFILE, COHORT_COVERAGE, COHORT_TERMS,
  validatePublicCohortTranscript, evaluatePublicCohort, evaluateCohortIssuerDisclosure,
  enumeratePublicAmountPairs, M23_DISTINCTIVE_AMOUNT_BASELINE, publicCohortMetrics,
} from './evaluator-with-bootstrap.mjs';

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

export {fixture};
