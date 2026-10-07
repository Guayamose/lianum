import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/chains/runtime-harness.mjs';

// An explicit failing acceptance gate. Independent local transfers and HTTP
// fixtures cannot satisfy a dependent EVM/SVM/UTXO protocol integration.
const evidence = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  status: 'BLOCKED',
  acceptancePassed: false,
  executedChainTransactionsThisRun: 0,
  historicalIndependentEvidence: ['evidence/chains-evm-local.json', 'evidence/chains-bitcoin-regtest.json'],
  blockers: [
    'No supported local Solana validator or SVM execution runtime is available in this Windows environment. WSL E_ACCESSDENIED is respected without escalation or alternate access.',
    'No implementation yet authenticates three dependent native-chain receipts and binds them to the PAEG graph/domain/version exactly once.',
    'No actual three-chain timeout and economic settlement/recovery integration has passed.',
  ],
  acceptanceRequires: [
    'At least three dependent legs execute against real local EVM, SVM and Bitcoin runtimes.',
    'A required leg genuinely times out; irreversible earlier effects remain recorded.',
    'Receipt replay across graph/domain/version and native transaction replay are tested separately.',
    'Global fulfillment authorizes one explicitly scoped settlement, or recovery occurs under documented finality and availability assumptions.',
  ],
  simulationFallbackUsed: false,
};
await mkdir(join(projectRoot, 'evidence'), { recursive: true });
await writeFile(join(projectRoot, 'evidence', 'chains-triple-acceptance.json'), JSON.stringify(evidence, null, 2) + '\n');
console.error('BLOCKED: real EVM + Solana + Bitcoin dependent integration acceptance has not passed. See evidence/chains-triple-acceptance.json.');
process.exitCode = 2;
