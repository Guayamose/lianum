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
    const files = ['services/api-server/src/admission/server.mjs', 'services/api-server/src/authorization/authorization-store.mjs', 'services/api-server/src/storage/database-pool.mjs',
      'services/api-server/src/storage/schema-migrations.mjs', 'services/api-server/src/storage/migrate.mjs', 'services/api-server/migrations/001_mobile_authorizations.sql',
      'services/api-server/tests/postgres.test.mjs', 'services/api-server/tests/helpers/platform-child.mjs',
      'services/api-server/tests/helpers/postgres-container.mjs', 'services/api-server/tests/helpers/commit-reply-proxy.mjs',
      'services/api-server/tests/helpers/migration-cases.mjs', 'apps/mobile/src/api/wallet-api.mjs',
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
