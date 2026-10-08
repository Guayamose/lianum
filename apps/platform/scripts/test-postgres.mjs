import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../../../', import.meta.url).pathname;
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', new URL('../tests/postgres.test.mjs', import.meta.url).pathname], {
  stdio: ['inherit', 'pipe', 'inherit'], env: { ...process.env, LIANUM_TEST_POSTGRES_DOCKER: '1' },
});
let output = ''; child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('close', async (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
  try {
    const files = ['apps/platform/src/server.mjs', 'apps/platform/src/authorization-store.mjs', 'apps/platform/src/database-pool.mjs',
      'apps/platform/tests/postgres.test.mjs', 'apps/platform/tests/helpers/platform-child.mjs',
      'apps/platform/tests/helpers/postgres-container.mjs', 'apps/platform/tests/helpers/commit-reply-proxy.mjs', 'apps/mobile/src/api/wallet-api.mjs',
      'packages/mobile-protocol/src/authorization.mjs'];
    const hashes = Object.fromEntries(await Promise.all(files.map(async path => [path,
      createHash('sha256').update(await readFile(root + path)).digest('hex')])));
    const report = { createdAt: new Date().toISOString(), status: code === 0 ? 'PASS' : 'FAIL',
      nodeVersion: process.version, exitCode: code, signal,
      tests: Number(output.match(/^# tests (\d+)$/m)?.[1]), passed: Number(output.match(/^# pass (\d+)$/m)?.[1]),
      failed: Number(output.match(/^# fail (\d+)$/m)?.[1]), sourceSha256: hashes,
      postgresMemoryMiB: 256, realPostgres: true,
      scope: 'SQL durability, contention, real HTTP/process restart and mobile signature contract',
      executor: 'Explicit SQL test counter; no real chain, funds, custody or proofs',
    };
    await mkdir(root + '.internal/dev/reports', { recursive: true });
    await writeFile(root + '.internal/dev/reports/platform-postgres.json', JSON.stringify(report, null, 2) + '\n');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
});
