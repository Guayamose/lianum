/** Fixed proof-worker and actor process composition. Engine actor contracts stay
 * independent of the installed proof implementation; every default child below
 * is an explicit, owned source entrypoint with the original bounded IPC. */
import { spawn } from 'node:child_process';
import { readFileSync, statfsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { legacyDataRoot } from '@lianum/environment';
import { PRIVATE_RESOURCE_FLOORS, PRIVATE_RESOURCE_POLICY, PRIVATE_PROOF_WORKER_RSS_LIMIT } from '@lianum/components/resources/private-resource-policy';
import { canonical } from '@lianum/engine/crypto/privacy';
import { ASSEMBLY_PUBLIC_WORDS, ASSEMBLY_RECURSIVE_MODES } from '@lianum/engine/assembly/private-assembly-encoding';
import { attachAssemblyControl, validateAssemblyProofPackage, decodeAssemblyProofPackage, assemblyBackendFields as fromBackendFields } from '@lianum/engine/assembly/private-assembly-actors';
const WALLET_WORDS = Object.freeze({deposit_balance:26,reserve_from_note:74,withdraw_balance:39});
const MODES = ['reserve', ...Object.keys(ASSEMBLY_PUBLIC_WORDS), ...Object.keys(WALLET_WORDS)];
const recursive = mode => ASSEMBLY_RECURSIVE_MODES.includes(mode);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (condition, code = 'PC18_ACTOR_INPUT') => { if (!condition) fail(code); };
const safeCode = error => /^(PC18|PC23|WALLET_CUSTODY)_[A-Z0-9_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'PC18_REQUEST_REJECTED';
const processOptions = () => ({cwd:legacyDataRoot('engine'),stdio:['pipe','pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
export function launchRecipientWithdrawalProofWorker() {
  need(arguments.length === 0, 'PC18_WITHDRAW_WORKER_ARITY');
  return spawn(process.execPath, [fileURLToPath(new URL('./note-proof-worker.mjs', import.meta.url))], processOptions());
}
export function launchPrivateWalletSignerProcess() {
  need(arguments.length === 0, 'PC23_SIGNER_PROCESS_ARITY');
  return spawn(process.execPath, [fileURLToPath(new URL('./private-wallet-signer-process.mjs', import.meta.url))], processOptions());
}

export function launchAssemblyProcess(kind, bootstrap) {
  need(['owner', 'producer', 'assembler'].includes(kind), 'PC18_PROCESS_KIND'); canonical(bootstrap);
  const path = fileURLToPath(kind === 'owner' ? new URL('./private-assembly-owner-process.mjs', import.meta.url) : new URL('./private-assembly-actor-process.mjs', import.meta.url));
  const child = spawn(process.execPath, [path, ...(kind === 'owner' ? [] : [kind])], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe', ...(kind === 'owner' && bootstrap.walletCustody ? ['pipe'] : [])], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
  const control = attachAssemblyControl(child, kind); child.stdio[3].end(Buffer.from(canonical(bootstrap)));
  const names = kind === 'owner' ? ['sol', 'btc', 'assembler', ...(bootstrap.walletCustody ? ['wallet'] : [])] : kind === 'producer' ? ['owner', 'broker', 'assembler'] : ['owner', 'sol', 'btc'];
  return Object.freeze({ control, channels: Object.freeze(Object.fromEntries(names.map((name, i) => [name, child.stdio[i + 4]]))) });
}

/** Fixed local proof-worker isolation. A private witness goes straight from its
 * actor into this child, never via controller IPC. stdout/stderr are discarded
 * with byte caps; only bounded fd3 JSON is parsed. Wait for close before return
 * so actor idleness cannot retain the worker's Wasm address space.
 * spawnWorker/timeout injection is a host-test seam, never an IPC operation or
 * a bootstrap option. Production uses only fixed repository proof/note/verifier workers.
 */
export const ASSEMBLY_WORKER_RESOURCE_FLOORS = PRIVATE_RESOURCE_FLOORS;
export function assemblyWorkerResourceViolations(snapshot) {
  need(snapshot && ['availableRAM', 'freeDisk'].every(k => Number.isSafeInteger(snapshot[k]) && snapshot[k] >= 0), 'PC18_WORKER_RESOURCE_SAMPLE');
  const result=Object.keys(ASSEMBLY_WORKER_RESOURCE_FLOORS).filter(k => snapshot[k] < ASSEMBLY_WORKER_RESOURCE_FLOORS[k]);
  if(snapshot.childRSS!==undefined){need(Number.isSafeInteger(snapshot.childRSS)&&snapshot.childRSS>=0,'PC18_WORKER_RESOURCE_SAMPLE');if(snapshot.childRSS>PRIVATE_PROOF_WORKER_RSS_LIMIT)result.push('childRSS');}return result;
}
/** Only numerical resource diagnostics, no witness, proof, IPC data or process
 * arguments. The exact trip sample is captured before terminating this child. */
function archiveAssemblyWorkerResourceAbort(mode, operation, child, snapshot, violations) {
  let childRSS = null;
  if (Number.isSafeInteger(child.pid) && child.pid > 0) {
    try { const match = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`, 'utf8')); if (match) childRSS = Number(match[1]) * 1024; } catch {}
  }
  const directory = join(legacyDataRoot('engine'), 'evidence/m18-worker-resource-aborts/');
  const at = new Date().toISOString();
  const record = { classification: 'EXACT_EXTERNAL_WORKER_RESOURCE_FLOOR_SAMPLE', at, mode, operation, resourcePolicy:PRIVATE_RESOURCE_POLICY, floorBytes: ASSEMBLY_WORKER_RESOURCE_FLOORS, observedBytes: snapshot, violated: violations, actorRSS: process.memoryUsage().rss, childRSS, noWitnessOrNativeIdentifiers: true };
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + at.replace(/[:.]/g, '-') + '-' + process.pid + '-' + process.hrtime.bigint() + '.json', JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}

function assemblyWorkerRunner(operation, { spawnWorker, timeoutMs = operation === 'verify' ? 330000 : 930000 } = {}) {
  need(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 930000, 'PC18_WORKER_TIMEOUT_BOUND');
  const launch = spawnWorker ?? (mode => {
    const worker = WALLET_WORDS[mode] ? new URL('./wallet-note-proof-worker.mjs', import.meta.url)
      : operation === 'verify' ? new URL('./assembly-verify-worker.mjs', import.meta.url)
        : mode === 'reserve' ? new URL('./note-proof-worker.mjs', import.meta.url)
          : new URL('./assembly-prove-worker.mjs', import.meta.url);
    return spawn(process.execPath, [fileURLToPath(worker)], {
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' },
    });
  });
  return async function proveInWorker(mode, input, label) {
    need(MODES.includes(mode), 'PC18_WORKER_MODE');
    need(typeof label === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(label), 'PC18_WORKER_LABEL');
    const request = Buffer.from(canonical({ mode, input, label, operation }));
    need(request.length <= 4 * 1024 * 1024, 'PC18_WORKER_REQUEST_SIZE');
    let child;
    try { child = launch(mode); } catch { request.fill(0); fail('PC18_WORKER_SPAWN'); }
    need(child?.stdin && child?.stdout && child?.stderr && child.stdio?.[3], 'PC18_WORKER_PIPES');
    const result = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0, stdoutBytes = 0, stderrBytes = 0, failure = null, killTimer, closed = false;
      const abort = code => {
        if (closed) return; failure ??= code; child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 5000);
      };
      const timer = setTimeout(() => abort('PC18_WORKER_TIMEOUT'), timeoutMs);
      // External to synchronous Wasm: parent remains responsive during proof work.
      const memoryWatch = setInterval(() => {
        const disk = statfsSync(process.cwd());
        const snapshot = { availableRAM: Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024, freeDisk: disk.bavail * disk.bsize };
        if (Number.isSafeInteger(child.pid) && child.pid > 0 && child.exitCode === null && child.signalCode === null) {
          try { const match=/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`,'utf8')); if(match) snapshot.childRSS=Number(match[1])*1024; } catch(error) { if(error.code!=='ENOENT') { abort('PC18_WORKER_RESOURCE_READ'); return; } }
        }
        const violations = assemblyWorkerResourceViolations(snapshot);
        if (violations.length) {
          // Telemetry failure must never prevent the original fail-closed action.
          if (!failure && !closed) try { archiveAssemblyWorkerResourceAbort(mode, operation, child, snapshot, violations); } catch {}
          abort(violations.includes('childRSS')?'PC18_WORKER_RSS_BUDGET':'PC18_WORKER_RESOURCE_FLOOR');
        }
      }, 250);
      const parentStopping = () => abort('PC18_WORKER_PARENT_STOPPING');
      const parentExiting = () => { if (!closed) child.kill('SIGKILL'); };
      process.once('SIGTERM', parentStopping); process.once('exit', parentExiting);
      child.stdout.on('data', chunk => { stdoutBytes += chunk.length; if (stdoutBytes > 1024 * 1024) abort('PC18_WORKER_LOG_SIZE'); });
      child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 1024 * 1024) abort('PC18_WORKER_LOG_SIZE'); });
      child.stdio[3].on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) abort('PC18_WORKER_RESULT_SIZE'); else chunks.push(Buffer.from(chunk)); });
      child.stdio[3].on('error', () => abort('PC18_WORKER_RESULT_IO'));
      child.stdin.on('error', () => abort('PC18_WORKER_REQUEST_IO'));
      child.once('error', () => abort('PC18_WORKER_SPAWN'));
      child.once('close', (code, signal) => {
        closed = true; clearTimeout(timer); clearTimeout(killTimer); clearInterval(memoryWatch); process.removeListener('SIGTERM', parentStopping); process.removeListener('exit', parentExiting); request.fill(0);
        try {
          need(!failure, failure ?? 'PC18_WORKER_FAILURE');
          const bytes = Buffer.concat(chunks), decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          bytes.fill(0); const envelope = JSON.parse(decoded);
          // Parsed JSON cannot have getters/proxies; backend metrics contain
          // fractional timings, so do not apply integer-only canonical() here.
          const exactJSON = (v, keys) => need(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), 'PC18_WORKER_RESULT_FIELDS');
          if (envelope.ok === false) {
            exactJSON(envelope, ['ok', 'code', 'name']);
            need(typeof envelope.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(envelope.name), 'PC18_WORKER_ERROR_NAME');
            need(typeof envelope.code === 'string' && /^(PC18|PC23|WALLET)_[A-Z0-9_]+$/.test(envelope.code), 'PC18_WORKER_FAILURE'); fail(envelope.code);
          }
          need(code === 0 && signal === null, 'PC18_WORKER_EXIT'); exactJSON(envelope, ['ok', 'result']); need(envelope.ok === true, 'PC18_WORKER_RESULT');
          const raw = envelope.result;
          if (operation === 'verify') { exactJSON(raw, ['verified']); need(typeof raw.verified === 'boolean', 'PC18_WORKER_VERIFY_RESULT'); resolve(raw.verified); return; }
          exactJSON(raw, ['proof', 'publicInputs', 'metrics', ...(recursive(mode) ? ['vkFields', 'proofFields'] : [])]);
          need(raw.metrics && typeof raw.metrics === 'object' && !Array.isArray(raw.metrics), 'PC18_WORKER_METRICS');
          const wire = { version: 1, mode, target: recursive(mode) ? 'noir-recursive' : 'evm', proofBase64: raw.proof, publicInputs: fromBackendFields(raw.publicInputs),
            ...(recursive(mode) ? { vkFields: fromBackendFields(raw.vkFields), proofFields: fromBackendFields(raw.proofFields) } : {}) };
          // Drop every backend metric and any possible diagnostic before the
          // result enters actor state; only typed proof material is retained.
          resolve(decodeAssemblyProofPackage(wire, mode));
        } catch (error) { reject(Object.assign(new Error(safeCode(error)), { code: safeCode(error) })); }
        finally { for (const chunk of chunks) chunk.fill(0); for (const stream of child.stdio) if (stream && !stream.destroyed) stream.destroy(); }
      });
      child.stdin.end(request, () => request.fill(0));
    });
    return result;
  };
}
export const createAssemblyProofWorkerRunner = options => assemblyWorkerRunner('prove', options);
export function createAssemblyVerificationWorkerRunner(options) {
  const run = assemblyWorkerRunner('verify', options);
  return async (mode, proofPackage, label = `pc18-verify-${mode}`) => {
    need(mode !== 'reserve' && MODES.includes(mode), 'PC18_WORKER_VERIFY_MODE');
    need(proofPackage?.proof instanceof Uint8Array, 'PC18_PROOF_BYTES');
    const wire = validateAssemblyProofPackage({ version: 1, mode, target: recursive(mode) ? 'noir-recursive' : 'evm', proofBase64: Buffer.from(proofPackage.proof).toString('base64'),
      publicInputs: fromBackendFields(proofPackage.publicInputs), ...(recursive(mode) ? { vkFields: fromBackendFields(proofPackage.vkFields), proofFields: fromBackendFields(proofPackage.proofFields) } : {}) }, mode);
    const input = { proofBase64: wire.proofBase64, publicInputs: wire.publicInputs, ...(recursive(mode) ? { vkFields: wire.vkFields, proofFields: wire.proofFields } : {}) };
    return run(mode, input, label);
  };
}
export const proveAssemblyInWorker = createAssemblyProofWorkerRunner();
export const verifyAssemblyInWorker = createAssemblyVerificationWorkerRunner();
