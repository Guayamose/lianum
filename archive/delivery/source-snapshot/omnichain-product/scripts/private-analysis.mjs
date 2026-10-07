/** Deterministic counterexamples, not a VRF/ZK/settlement implementation. */
import { createHash, createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const ceil = (a, b) => (a + b - 1n) / b;

// Positive integer fixture domain. This computes a public correlation interval,
// not a posterior probability or evidence that two transactions share an owner.
export function amountCandidates({ B, F, pS, qS, pB, qB, K }) {
  for (const v of [B, F, pS, qS, pB, qB, K]) {
    if (typeof v !== 'bigint' || v < 0n) throw new Error('NONNEGATIVE_BIGINT_REQUIRED');
  }
  if (!pS || !qS || !pB || !qB || F >= B) throw new Error('INVALID_RATIO_OR_BUDGET');
  const residualMin = ceil(K * pB, qB);
  const residualMax = ceil((K + 1n) * pB, qB) - 1n;
  const costMin = B - F - residualMax;
  const costMax = B - F - residualMin;
  if (costMax < 1n || costMin > B - F) return null;
  const lowCost = costMin < 1n ? 1n : costMin;
  const highCost = costMax > B - F ? B - F : costMax;
  const min = ((lowCost - 1n) * qS) / pS + 1n;
  const max = (highCost * qS) / pS;
  return max < min ? null : { min, max, count: max - min + 1n };
}

export function analyzePrivateCounterexamples(nativeEvidence) {
  const candidates = Array.from({ length: 256 }, (_, i) => `synthetic:bitcoin:regtest:tx${i}:vout0`);
  const effect = candidates[173];
  const publicTag = sha(effect);
  const recovered = candidates.filter((candidate) => sha(candidate) === publicTag);
  // These deliberately BROKEN alternatives are counterexamples only. HMAC is
  // not used as a pretend VRF, and no result below verifies a PC4 construction.
  const graphTags = ['graph-A', 'graph-B'].map((g) => sha(`${g}:${effect}`));
  const callerKeyTags = ['caller-chosen-A', 'caller-chosen-B'].map((key) =>
    createHmac('sha256', key).update(effect).digest('hex'));
  const knownIssuerKey = 'PUBLIC_SYNTHETIC_ATTACKER_FIXTURE_ONLY';
  const issuerTag = createHmac('sha256', knownIssuerKey).update(effect).digest('hex');
  const issuerMatches = candidates.filter((candidate) =>
    createHmac('sha256', knownIssuerKey).update(candidate).digest('hex') === issuerTag);
  const params = { B: 1000000n, F: 25000n, pS: 1n, qS: 10n, pB: 4n, qB: 1n, K: 168750n };
  const interval = amountCandidates(params);
  const workflow = nativeEvidence.workflow;
  if (workflow?.classification !== 'REAL_EVM_LOCK_AND_TWO_EVM_ROLE_OUTPUTS_AND_EVM_CLAIM') {
    throw new Error('EXPECTED_HISTORICAL_M3_NATIVE_FIXTURE');
  }
  const input = BigInt(workflow.inputAmount);
  const outputA = BigInt(workflow.selectedA.amount);
  const outputB = BigInt(workflow.selectedB.amount);
  const feeA = BigInt(workflow.selectedA.fee);
  const feeB = BigInt(workflow.selectedB.fee);
  return {
    schemaVersion: 1,
    classification: 'DETERMINISTIC_PRIVACY_COUNTEREXAMPLES_AND_HISTORICAL_ACCOUNTING_ONLY',
    noZkVrfLedgerOrNativeExecution: true,
    publicHashDictionary: {
      candidateCount: candidates.length, targetIndex: 173, publicTag,
      recoveredCount: recovered.length, recoveredEffect: recovered[0],
      claim: 'A publicly enumerable unkeyed effect digest does not hide its effect.',
    },
    graphScopedIdentity: {
      sameEffect: effect, graphTags, distinctTags: graphTags[0] !== graphTags[1],
      claim: 'A consumed set keyed only by these graph-specific tags permits reuse across graphs.',
    },
    callerChosenIdentityKey: {
      sameEffect: effect, tags: callerKeyTags, distinctTags: callerKeyTags[0] !== callerKeyTags[1],
      claim: 'A free key choice defeats canonical one-use identity; this is not a VRF experiment.',
    },
    keyholderDictionary: {
      primitive: 'HMAC-SHA256 counterexample only; NOT PC4 VRF', candidateCount: candidates.length,
      recoveredCount: issuerMatches.length, recoveredEffect: issuerMatches[0],
      claim: 'The holder of a deterministic tag key can enumerate this candidate set.',
    },
    publicAmountRelation: {
      parameters: params, interval,
      claim: 'Forty possible S quantities, conditional on these public parameters; not transaction attribution.',
    },
    historicalM3SelectedPair: {
      evidence: 'evidence/m3-evm-semantic-local.json',
      claimTransaction: workflow.claimReceipt.transactionHash,
      units: 'wei; both output roles actually EVM', input, outputA, outputB,
      netBeforeGas: input - outputA - outputB,
      selectedOutputGasA: feeA, selectedOutputGasB: feeB, selectedOutputGasTotal: feeA + feeB,
      netAfterSelectedOutputGas: input - outputA - outputB - feeA - feeB,
      excludedCosts: ['other confirmed outputs', 'claim gas', 'setup and lock gas', 'other harness transactions'],
      claim: 'Negative selected-pair exposure; synthetic conversion ratios did not establish viable economics.',
    },
    openGates: ['real ZK and VRF verification', 'native shielded authority', 'matched naive/competent replay comparison',
      'quantified traffic and issuer-query privacy', 'one native EVM/SVM/UTXO workflow'],
  };
}

export const jsonEvidence = (value) => `${JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceUrl = new URL('../evidence/m3-evm-semantic-local.json', import.meta.url);
  const source = await readFile(sourceUrl);
  const report = analyzePrivateCounterexamples(JSON.parse(source));
  report.historicalM3SelectedPair.sourceWorkingBytesSHA256 = sha(source);
  await writeFile(new URL('../evidence/m4-private-analysis.json', import.meta.url), jsonEvidence(report));
  console.log('M4 counterexamples recorded: 40-quantity interval; negative historical economics; no proof/runtime execution.');
}
