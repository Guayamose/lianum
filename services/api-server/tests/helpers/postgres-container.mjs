import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import pg from 'pg';

const command = promisify(execFile);
const image = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function poolFor(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 2000,
    statement_timeout: 5000, idleTimeoutMillis: 1000 });
  pool.on('error', () => {}); // Restart tests deliberately close the database.
  return pool;
}
export async function startTestPostgres() {
  const available = Number((await readFile('/proc/meminfo', 'utf8')).match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(available) || available < 2.5 * 1024 * 1024) throw new Error('TEST_MEMORY_BELOW_2_5_GIB');
  const token = randomBytes(12).toString('hex');
  const name = 'lianum-platform-pg-' + token;
  const password = randomBytes(32).toString('hex');
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const hostPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const config = await mkdtemp(join(tmpdir(), 'lianum-test-docker-'));
  await writeFile(join(config,'config.json'), '{"auths":{}}\n', {mode:0o600});
  const docker = async args => (await command('docker', ['--config',config,...args], {
    timeout: 60_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, POSTGRES_PASSWORD: password },
  })).stdout.trim();
  let id;
  async function close() {
    if (id) {
      const label = await docker(['inspect', '--format', '{{index .Config.Labels "lianum.test.owner"}}', id]);
      if (label !== token) throw new Error('TEST_CONTAINER_OWNER_MISMATCH');
      // Only this fixture's exact ID and anonymous volume are removed.
      await docker(['rm', '--force', '--volumes', id]);
      id = undefined;
    }
    await rm(config,{recursive:true,force:true});
  }
  try {
    id = await docker(['run', '--detach', '--name', name, '--label', 'lianum.test.owner=' + token,
      '--memory', '256m', '--memory-swap', '256m', '--cpus', '1', '--pids-limit', '128',
      '--publish', `127.0.0.1:${hostPort}:5432`, '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=lianum_test',
      image, '-c', 'shared_buffers=32MB', '-c', 'max_connections=32']);
    let connectionString, containerConnectionString;
    async function updateAddress() {
      const info = JSON.parse(await docker(['inspect', id]))[0];
      const port = Number(info.NetworkSettings.Ports['5432/tcp'][0].HostPort);
      connectionString = `postgresql://postgres:${password}@127.0.0.1:${port}/lianum_test`;
      containerConnectionString = `postgresql://postgres:${password}@${info.NetworkSettings.IPAddress}:5432/lianum_test`;
    }
    await updateAddress();
    async function waitReady() {
      const pool = poolFor(connectionString);
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          try { await pool.query('SELECT 1'); return; }
          catch { await pause(200); }
        }
        throw new Error('TEST_POSTGRES_START_TIMEOUT');
      } finally { await pool.end(); }
    }
    await waitReady();
    return Object.freeze({ get connectionString() { return connectionString; },
      get containerConnectionString() { return containerConnectionString; }, image,
      async restart() { await docker(['restart', '--time', '5', id]); await updateAddress(); await waitReady(); },
      async stop() { await docker(['stop','--time','5',id]); },
      async start() { await docker(['start',id]);await updateAddress();await waitReady(); },
      close,
    });
  } catch (error) { await close(); throw error; }
}
