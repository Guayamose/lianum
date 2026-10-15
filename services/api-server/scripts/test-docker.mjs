import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { TEST_PLATFORM_PRIVACY_KEY } from '../tests/helpers/privacy-key-v1.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { startTestPostgres, poolFor } from '../tests/helpers/postgres-container.mjs';

const command = promisify(execFile);
const token = randomBytes(12).toString('hex');
const root = new URL('../../../', import.meta.url).pathname;
const database = await startTestPostgres();
const pool = poolFor(database.connectionString);
const docker = async args => (await command('docker', args, { timeout: 30_000,
  env: { ...process.env, DATABASE_URL: database.containerConnectionString, LIANUM_PLATFORM_PRIVACY_KEY: TEST_PLATFORM_PRIVACY_KEY }, maxBuffer: 1024 * 1024 })).stdout.trim();
let id, migrationId;
try {
  // Schema setup is an explicit one-shot command using the exact image under
  // test. The subsequent normal API process must only verify it.
  migrationId = await docker(['run', '--detach', '--name', 'lianum-platform-migrate-' + token,
    '--label', 'lianum.test.owner=' + token, '--memory', '128m', '--memory-swap', '128m',
    '--cpus', '1', '--pids-limit', '64', '--env', 'DATABASE_URL', '--pull', 'never',
    'lianum-platform:local', 'node', 'src/storage/migrate.mjs']);
  assert.equal(await docker(['wait', migrationId]), '0');
  const migration = JSON.parse(await docker(['logs', migrationId]));
  assert.equal(migration.status, 'COMPLETE'); assert.equal(migration.version, 1);
  assert.deepEqual(migration.applied, [1]);
  id = await docker(['run', '--detach', '--name', 'lianum-platform-api-' + token,
    '--label', 'lianum.test.owner=' + token, '--memory', '256m', '--memory-swap', '256m',
    '--cpus', '1', '--pids-limit', '64', '--publish', '127.0.0.1::8080',
    '--env', 'LIANUM_PUBLIC_ORIGIN=https://wallet.example.test', '--env', 'DATABASE_URL', '--env', 'LIANUM_PLATFORM_PRIVACY_KEY', '--pull', 'never', 'lianum-platform:local']);
  const info = JSON.parse(await docker(['inspect', id]))[0];
  const port = Number(info.NetworkSettings.Ports['8080/tcp'][0].HostPort);
  const origin = `http://127.0.0.1:${port}`;
  let live;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { live = await fetch(origin + '/health/live'); if (live.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(live?.status, 200); assert.deepEqual(await live.json(), { status: 'LIVE' });
  const ready = await fetch(origin + '/health/ready'); assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { status: 'UNAVAILABLE' });
  const state = await (await fetch(origin + '/v1/mobile/state')).json();
  assert.equal(state.connection, 'DISCONNECTED'); assert.equal(state.privatePortfolio, null);
  assert.ok(Object.values(state.capabilities).every(value => value === false));
  const operation = await fetch(origin + '/v1/mobile/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(operation.status, 503);
  for (const table of ['mobile_challenges', 'mobile_operations', 'mobile_authorizations'])
    assert.equal((await pool.query('SELECT to_regclass($1) AS name', [table])).rows[0].name, table);
  assert.equal(await docker(['exec', id, 'node', '-p', 'process.getuid()']), '1000');
  const report = { createdAt: new Date().toISOString(), status: 'PASS', imageId: info.Image,
    nodeVersion: await docker(['exec', id, 'node', '--version']), postgresImage: database.image,
    apiMemoryMiB: 256, postgresMemoryMiB: 256, live: 200, ready: 503,
    state: 'DISCONNECTED', privatePortfolio: null, schemaMigratedSeparately: true,
    schemaVersion: migration.version, migrationsApplied: migration.applied, uid: 1000,
    limitations: ['Economic adapter intentionally unbound', 'No real custody, proof, worker or chain execution', 'No Google Cloud project/deployment/cost'],
  };
  await mkdir(root + '.internal/dev/reports', { recursive: true });
  await writeFile(root + '.internal/dev/reports/platform-docker.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  for (const container of [id, migrationId].filter(Boolean)) {
    assert.equal(await docker(['inspect', '--format', '{{index .Config.Labels "lianum.test.owner"}}', container]), token);
    await docker(['rm', '--force', '--volumes', container]);
  }
  await pool.end(); await database.close();
}
