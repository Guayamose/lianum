import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

export const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const integrationRoot = join(projectRoot, '.local', 'integrations');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function pinnedBinary(relative, expectedHash) {
  if (!['win32', 'linux'].includes(process.platform) || process.arch !== 'x64') throw new Error('PINNED_RUNTIME_REQUIRES_REVIEWED_X64_PLATFORM');
  const runtimeRoot = await realpath(join(projectRoot, '.local', process.platform === 'linux' ? 'linux-runtimes' : 'runtimes'));
  const path = await realpath(join(runtimeRoot, relative));
  if (!path.startsWith(runtimeRoot + sep)) throw new Error('RUNTIME_PATH_ESCAPE');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== expectedHash) throw new Error('PINNED_EXECUTABLE_HASH_MISMATCH');
  return path;
}

export async function scratchDirectory(prefix) {
  await mkdir(integrationRoot, { recursive: true });
  return mkdtemp(join(integrationRoot, prefix));
}
export async function removeOwnScratch(path) {
  const root = await realpath(integrationRoot);
  const target = await realpath(path);
  if (!target.startsWith(root + sep) || target === root) throw new Error('SCRATCH_PATH_ESCAPE');
  await rm(target, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
}
export async function unusedLoopbackPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export function isolatedRuntimeEnvironment(cwd) {
  const env = { HOME: cwd, TMPDIR: cwd, TEMP: cwd, TMP: cwd, LANG: 'C.UTF-8' };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  return env;
}
export function startOwnProcess(binary, args, cwd) {
  // Do not inherit RPC URLs, cloud variables, wallet configuration or credentials.
  const env = isolatedRuntimeEnvironment(cwd);
  const child = spawn(binary, args, { cwd, windowsHide: true, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let startupError = null;
  let stderr = '';
  child.on('error', e => { startupError = e; });
  child.stderr.on('data', chunk => { if (stderr.length < 8192) stderr += chunk.toString(); });
  return { child, assertAlive() { if (startupError || child.exitCode !== null) throw new Error('LOCAL_RUNTIME_EXITED'); }, diagnostic() { return stderr; } };
}
export async function stopOwnProcess(processHandle, { graceMs = 5000 } = {}) {
  const { child } = processHandle;
  if (!Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 60000) throw new Error('INVALID_OWN_PROCESS_GRACE');
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return { stopped: true, forced: false };
  const stopped = once(child, 'exit');
  const wait = async ms => { let timer; try { return await Promise.race([stopped.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); })]); } finally { clearTimeout(timer); } };
  child.kill('SIGTERM');
  if (await wait(graceMs)) return { stopped: true, forced: false };
  // Only this exact owned ChildProcess can be forced; no PID discovery or group
  // signal is used. Its scratch ledger is disposable and is removed afterward.
  child.kill('SIGKILL');
  if (!(await wait(5000))) throw new Error('OWN_RUNTIME_DID_NOT_EXIT');
  return { stopped: true, forced: true };
}

// Harness-only writes go exclusively to a just-spawned runtime port. This is
// intentionally separate from the exported read-only application transport.
export async function ownedRuntimeRpc(endpoint, method, params = [], { timeoutMs = 3000 } = {}) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint)) throw new Error('OWNED_RPC_REQUIRES_LOOPBACK');
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error('OWNED_RPC_HTTP_ERROR');
  const value = await response.json();
  if (value.error) { const e = new Error('OWNED_RPC_REMOTE_ERROR'); e.rpcCode = value.error.code; throw e; }
  return value.result;
}
