import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const root = new URL('../../../', import.meta.url).pathname;
const action = process.argv[2];
if (!['start', 'stop'].includes(action)) throw new Error('Usage: node scripts/local.mjs start|stop');
const directory = root + '.local/platform';
const environment = directory + '/local.env';
await mkdir(directory, { recursive: true, mode: 0o700 });
try { await writeFile(environment, 'LIANUM_LOCAL_DB_PASSWORD=' + randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
if (!/^LIANUM_LOCAL_DB_PASSWORD=[0-9a-f]{64}\n$/.test(await readFile(environment, 'utf8'))) throw new Error('LOCAL_DATABASE_CREDENTIAL_INVALID');
if (action === 'start') {
  const available = Number((await readFile('/proc/meminfo', 'utf8')).match(/^MemAvailable:\s+(\d+)/m)?.[1]);
  if (!Number.isFinite(available) || available < 2.5 * 1024 * 1024) throw new Error('LOCAL_MEMORY_BELOW_2_5_GIB');
}
// Use a separate public-registry config so a user's gcloud credential helper is
// never invoked while starting this entirely local Docker stack.
const config = directory + '/docker-public'; await mkdir(config, { recursive: true, mode: 0o700 });
await writeFile(config + '/config.json', '{"auths":{}}\n', { mode: 0o600 });
const project = 'lianum-local-' + createHash('sha256').update(root).digest('hex').slice(0, 10);
const args = ['--config', config, 'compose', '--project-name', project, '--env-file', environment,
  '--file', root + 'apps/platform/compose.local.yml', ...(action === 'start' ? ['up', '--detach', '--wait'] : ['down'])];
const child = spawn('docker', args, { stdio: 'inherit' });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', async code => { process.exitCode = code ?? 1;
  if (code === 0 && action === 'start') {
    try {
      const origin = 'http://127.0.0.1:' + (process.env.LIANUM_LOCAL_PORT ?? '8080');
      const live = await fetch(origin + '/health/live', { signal: AbortSignal.timeout(3000) });
      const ready = await fetch(origin + '/health/ready', { signal: AbortSignal.timeout(3000) });
      if (live.status !== 200 || ready.status !== 503) throw new Error('LOCAL_API_HEALTH_UNEXPECTED');
      console.log('Local API ' + origin + '; live=200, ready=503 until the economic bridge exists.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
});
