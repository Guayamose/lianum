import {fileURLToPath} from 'node:url';
/** Prepare only the five remaining compiled relation keys, serially. The
 * bounded worker reuses an existing validated key instead of regenerating it.
 * No witnesses, proofs, chain runtimes or transfers are supplied or created. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from '../../../packages/proofs/src/catalog.mjs';

assert.equal(process.argv.length, 2, 'PREPARE_FIXED_ARGUMENTS');
assert.deepEqual(process.execArgv, [], 'PREPARE_NO_EXEC_OPTIONS');
assert.ok(!process.env.NODE_OPTIONS && !process.env.NODE_PATH, 'PREPARE_NO_INJECTION');
let active = null, interrupted = false;
const stop = () => { interrupted = true; active?.kill('SIGTERM'); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  for (const relation of ['dependency', 'ready', 'admission', 'settlement', 'recovery']) {
    assert.equal(interrupted, false, 'PREPARE_INTERRUPTED');
    const outcome = await new Promise((resolve, reject) => {
      active = spawn(process.execPath, [fileURLToPath(new URL('../../../packages/proofs/src/jobs/run-bounded.mjs',import.meta.url)), relation, 'prepare-key'],
        { cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'inherit', 'inherit'] });
      active.once('error', reject);
      active.once('close', (code, signal) => { active = null; resolve({ code, signal }); });
    });
    assert.equal(outcome.code, 0, 'PREPARE_WORKER_FAILED');
    assert.equal(outcome.signal, null, 'PREPARE_WORKER_SIGNAL');
  }
} finally {
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
