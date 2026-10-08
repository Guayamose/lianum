/** Fixed new candidate entry. Importing starts nothing; release is initially null. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTronAlignedRocksDbCandidateAcceptance } from './tron-candidate-acceptance.mjs';
const HERE = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  try {
    const result = await runTronAlignedRocksDbCandidateAcceptance();
    console.log(JSON.stringify(result)); process.exitCode = result.report.success ? 0 : 1;
  } catch (error) {
    console.error(String(error?.message ?? '').match(/\bTRON_(?:ALIGNED|CANDIDATE)_[A-Z0-9_]+\b/)?.[0] ?? 'TRON_ALIGNED_REJECTED');
    process.exitCode = 2;
  }
}
