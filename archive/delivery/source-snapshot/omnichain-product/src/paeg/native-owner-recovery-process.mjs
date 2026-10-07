/** DRAFT returning-owner facade. An actual parent-owned deployment capability
 * is mandatory before any child is spawned or Vault is opened. This fixed
 * read-only bridge is NOT arbitrary RPC, a runtime-restoration API or a prover.
 * Authorization results include PRIVATE proof inputs: never publish/log them.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { assertOwnedNativeSystem } from './native-deployment.mjs';
import { readNativeSystemState } from './native-system-state.mjs';
import { wipePrivate } from './proof-worker.mjs';
import { PROTOCOL, TIMEOUT_MS, DOMAINS, need, problem, codeFor, copy, same, exact, sequence,
  note, encode, decode, config, projectNativeObservation, checkQuery, checkStatus, checkInitialized, checkAuthorization }
  from './native-owner-recovery-protocol.mjs';

const worker = fileURLToPath(new URL('./native-owner-recovery-child.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('.', import.meta.url));
const ownedProcesses = new WeakSet();
export function assertOwnedGenericOwnerRecoveryProcess(value) {
  need(ownedProcesses.has(value), 'OWNED_PROCESS_CAPABILITY');
}
function options(input) {
  // Do not serialize runtime/system: their WeakMap ownership is parent-local.
  need(input && !types.isProxy(input) && Object.getPrototypeOf(input) === Object.prototype, 'CONFIG');
  const fields = ['runtime', 'system', 'poolIndex', 'custody'];
  need(Reflect.ownKeys(input).length === fields.length && fields.every(name =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(input, name) ?? {}, 'value')), 'CONFIG');
  try { assertOwnedNativeSystem(input.runtime, input.system); }
  catch { throw problem('OWNER_RECOVERY_OWNED_SYSTEM_CAPABILITY'); }
  need(input.poolIndex === 0 || input.poolIndex === 1, 'POOL_INDEX');
  return { runtime: input.runtime, system: input.system, poolIndex: input.poolIndex, cfg: config(input.custody) };
}

export async function createGenericOwnerRecoveryProcess(input) {
  need(arguments.length === 1, 'CONFIG');
  const { runtime, system, poolIndex, cfg } = options(input);
  const publicConfig = { expectedBinding: copy(cfg.expectedBinding), destinations: copy(cfg.destinations) };
  const binding = publicConfig.expectedBinding, pool = system.pools[poolIndex];
  const expectedDomains = { scope: pool.scope, policy: pool.policy, asset: pool.assetIdentity,
    hubDomain: system.hubDomain, registryCommitment: system.registryCommitment };
  async function readPool() {
    assertOwnedNativeSystem(runtime, system);
    need(DOMAINS.every(name => expectedDomains[name] === '0x' + binding[name]), 'POOL_BINDING');
    const native = await readNativeSystemState(runtime, system, poolIndex);
    // The live capability was registered by deployNativeSystem. This block-pinned
    // snapshot must still be that pool and its exact five recovery domains.
    const projected = projectNativeObservation(native, binding, pool.address);
    // Preserve the actual header privately; a child can only reference its ID.
    return { header: native.header, view: projected };
  }
  let preflightTimer;
  try {
    await Promise.race([readPool(), new Promise((_, reject) => {
      preflightTimer = setTimeout(() => reject(problem('OWNER_RECOVERY_OBSERVATION_TIMEOUT')), TIMEOUT_MS);
    })]);
  } catch (error) { wipePrivate(cfg); throw problem(codeFor(error)); }
  finally { clearTimeout(preflightTimer); }

  let child, pending, lastBridgeId = 0, nextId = 0, readySeen = false, bridgeBusy = false;
  let initialized, stopping = false, finished = false, failure, readyTimer, killTimer, closeTimer;
  let readyResolve, readyReject, exitResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; }); ready.catch(() => {});
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const report = { classification: 'DRAFT_OWNER_RECOVERY_LIFECYCLE_ONLY', started: false, exited: false,
    completedRequests: 0, observationReads: 0, canonicalChecks: 0 };
  function fail(error) {
    failure ??= problem(codeFor(error)); report.failureCode = failure.code;
    clearTimeout(readyTimer); readyReject(failure);
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = null; }
    if (child && !finished) {
      child.kill('SIGTERM');
      killTimer ??= setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 1000);
    }
  }
  function send(value) {
    const bytes = encode(value);
    try { child.send(bytes, error => { bytes.fill(0); if (error) fail(problem('OWNER_RECOVERY_IO')); }); }
    catch { bytes.fill(0); fail(problem('OWNER_RECOVERY_IO')); }
  }
  async function bridge(message) {
    exact(message, ['kind', 'protocol', 'id', 'requestId', 'operation', 'input']);
    need(!bridgeBusy && pending?.operation === 'authorizeCurrentNote' && message.requestId === pending.id
      && sequence(message.id) === lastBridgeId + 1, 'BRIDGE_SEQUENCE');
    const current = pending; lastBridgeId = message.id; bridgeBusy = true;
    try {
      let result;
      if (message.operation === 'observe') {
        checkQuery(message.input, binding, current.note);
        need(current.reads < 2 && (!current.observation || current.observation.checks === 0), 'BRIDGE_READ_LIMIT');
        const observed = await readPool();
        need(pending === current && !finished && !failure, 'BRIDGE_CLOSED');
        current.reads++; report.observationReads++;
        current.observation = { ...observed, id: message.id, checks: 0 };
        result = { observationId: message.id, view: observed.view };
      } else if (message.operation === 'assertCanonical') {
        exact(message.input, ['observationId']);
        need(current.observation && message.input.observationId === current.observation.id
          && current.observation.checks < 2, 'BRIDGE_OBSERVATION');
        await runtime.assertCanonical(current.observation.header);
        need(pending === current && !finished && !failure, 'BRIDGE_CLOSED');
        current.observation.checks++; report.canonicalChecks++; result = { canonical: true };
      } else need(false, 'BRIDGE_OPERATION_DENIED');
      send({ kind: 'bridgeResult', protocol: PROTOCOL, id: message.id, requestId: message.requestId, ok: true, value: result });
    } finally { bridgeBusy = false; }
  }
  try {
    child = fork(worker, [], { cwd, execArgv: [], env: { LANG: 'C.UTF-8' }, serialization: 'advanced',
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  } catch { wipePrivate(cfg); throw problem('OWNER_RECOVERY_SPAWN'); }
  report.started = true; report.pid = child.pid ?? null;
  child.once('error', () => fail(problem('OWNER_RECOVERY_SPAWN')));
  child.once('close', (code, signal) => {
    finished = true; report.exited = true; report.exit = { code, signal };
    clearTimeout(readyTimer); clearTimeout(killTimer); clearTimeout(closeTimer);
    if (!stopping || pending || code !== 0) fail(problem('OWNER_RECOVERY_CHILD_EXIT'));
    for (const stream of child.stdio) stream?.destroy();
    wipePrivate(cfg); exitResolve(copy(report));
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', bytes => { bytes.fill(0); fail(problem('OWNER_RECOVERY_UNEXPECTED_LOG')); });
    stream.on('error', () => fail(problem('OWNER_RECOVERY_IO')));
  }
  child.on('message', bytes => {
    let message;
    try {
      message = decode(bytes); need(message.protocol === PROTOCOL, 'PROTOCOL');
      if (failure) { wipePrivate(message); return; }
      if (message.kind === 'ready') {
        exact(message, ['kind', 'protocol']); need(!readySeen && !pending, 'PROTOCOL');
        readySeen = true; clearTimeout(readyTimer); readyResolve();
      } else if (message.kind === 'bridge') {
        void bridge(message).catch(fail).finally(() => wipePrivate(message)); return;
      } else if (message.kind === 'fatal') {
        exact(message, ['kind', 'protocol', 'code']); fail(problem(codeFor({ code: message.code })));
      } else {
        exact(message, message.ok === true ? ['kind', 'protocol', 'id', 'ok', 'value'] : ['kind', 'protocol', 'id', 'ok', 'code']);
        need(readySeen && message.kind === 'result' && pending && message.id === pending.id
          && !bridgeBusy && (message.ok === true || message.ok === false), 'PROTOCOL');
        const current = pending;
        let result;
        if (message.ok) {
          if (current.operation === 'initialize') result = checkInitialized(message.value, publicConfig);
          else if (current.operation === 'withdrawalStatus') {
            result = checkStatus(message.value, publicConfig, current.note, initialized.record.state);
            const { authorization: a, ...terms } = result;
            const { authorization: b, ...original } = initialized.statuses[current.note];
            need(same(terms, original), 'RESULT_BINDING');
          } else if (current.operation === 'authorizeCurrentNote') {
            need(current.observation, 'BRIDGE_OBSERVATION');
            result = checkAuthorization(message.value, initialized.statuses[current.note],
              current.observation.view, current.observation.checks);
          } else { exact(message.value, ['closed']); need(message.value.closed === true, 'PROTOCOL'); result = { closed: true }; }
        }
        pending = null; clearTimeout(current.timer);
        if (message.ok) { report.completedRequests++; current.resolve(result); }
        else current.reject(problem(codeFor({ code: message.code })));
      }
      wipePrivate(message);
    } catch (error) { wipePrivate(message); fail(error); }
  });
  readyTimer = setTimeout(() => fail(problem('OWNER_RECOVERY_START_TIMEOUT')), TIMEOUT_MS);
  async function request(operation, input) {
    need(readySeen && !failure && !finished && !pending && (!stopping || operation === 'close'), 'BUSY_OR_CLOSED');
    const id = ++nextId;
    const result = new Promise((resolve, reject) => {
      pending = { id, operation, note: input?.note, reads: 0, observation: null, resolve, reject,
        timer: setTimeout(() => fail(problem('OWNER_RECOVERY_OPERATION_TIMEOUT')), TIMEOUT_MS) };
    });
    try { send({ kind: 'request', protocol: PROTOCOL, id, operation, input }); } catch (error) { fail(error); }
    return result;
  }
  async function close() {
    if (finished) return exited;
    if (!stopping) {
      stopping = true;
      closeTimer = setTimeout(() => fail(problem('OWNER_RECOVERY_CLOSE_TIMEOUT')), 5000);
      if (!failure && !finished && !pending) {
        try { await request('close', null); } catch (error) { fail(error); }
      } else if (!finished) fail(problem('OWNER_RECOVERY_CANCELLED'));
    }
    return exited;
  }
  try { await ready; initialized = await request('initialize', cfg); }
  catch (error) { fail(error); await close(); throw problem(codeFor(error)); }
  finally { wipePrivate(cfg); }
  const facade = Object.freeze({
    withdrawalStatus: name => request('withdrawalStatus', { note: note(name) }),
    authorizeCurrentNote: name => request('authorizeCurrentNote', { note: note(name) }),
    report: () => copy(report), close,
  });
  ownedProcesses.add(facade); return facade;
}
