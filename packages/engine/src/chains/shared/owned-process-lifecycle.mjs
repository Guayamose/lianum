/** Shared lifecycle primitives for explicitly owned ChildProcess instances. */
import {spawn} from 'node:child_process';
import {once} from 'node:events';

/** @typedef {{child: import('node:child_process').ChildProcess, assertAlive(): void, diagnostic(): string}} OwnedProcessHandle */
/** @param {number} ms @returns {Promise<void>} */
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** @param {string} cwd @returns {NodeJS.ProcessEnv} */
export function isolatedRuntimeEnvironment(cwd) {
  /** @type {NodeJS.ProcessEnv} */
  const env = { HOME: cwd, TMPDIR: cwd, TEMP: cwd, TMP: cwd, LANG: 'C.UTF-8' };
  for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
  return env;
}

/** @param {string} binary @param {readonly string[]} args @param {string} cwd @returns {OwnedProcessHandle} */
export function startOwnProcess(binary, args, cwd) {
  // Do not inherit RPC URLs, cloud variables, wallet configuration or credentials.
  const env = isolatedRuntimeEnvironment(cwd);
  const child = spawn(binary, args, { cwd, windowsHide: true, env, stdio: ['ignore', 'ignore', 'pipe'] });
  /** @type {Error | null} */
  let startupError = null;
  let stderr = '';
  child.on('error', e => { startupError = e; });
  child.stderr.on('data', /** @param {Buffer | string} chunk */ chunk => { if (stderr.length < 8192) stderr += chunk.toString(); });
  return { child, assertAlive() { if (startupError || child.exitCode !== null) throw new Error('LOCAL_RUNTIME_EXITED'); }, diagnostic() { return stderr; } };
}

/** @param {Pick<OwnedProcessHandle, 'child'>} processHandle @param {{graceMs?: number}} [options]
 * @returns {Promise<{stopped: true, forced: boolean}>} */
export async function stopOwnProcess(processHandle, { graceMs = 5000 } = {}) {
  const { child } = processHandle;
  if (!Number.isSafeInteger(graceMs) || graceMs < 1 || graceMs > 60000) throw new Error('INVALID_OWN_PROCESS_GRACE');
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return { stopped: true, forced: false };
  const stopped = once(child, 'exit');
  /** @param {number} ms @returns {Promise<boolean>} */
  const wait = async ms => {
    /** @type {ReturnType<typeof setTimeout> | undefined} */let timer;
    try {
      /** @type {Promise<boolean>} */const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); });
      return await Promise.race([stopped.then(() => true), timeout]);
    } finally { clearTimeout(timer); }
  };
  child.kill('SIGTERM');
  if (await wait(graceMs)) return { stopped: true, forced: false };
  // Only this exact owned ChildProcess can be forced; no PID discovery or group
  // signal is used. Its scratch ledger is disposable and is removed afterward.
  child.kill('SIGKILL');
  if (!(await wait(5000))) throw new Error('OWN_RUNTIME_DID_NOT_EXIT');
  return { stopped: true, forced: true };
}
