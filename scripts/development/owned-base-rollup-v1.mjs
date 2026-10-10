import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const PROFILE = 'OWNED_BASE_NATIVE_ROLLUP_POS_V1';
const RECIPE_SHA256 = 'e4c955e780e34335fbbcba26278dac86a41d889cacc2c048a37a40d3c5d1edab';
const BIRTH_MS = 600_000 + 240_000 + 120_000 + 15_000;
const IPC_MS = 30_000;
const owned = new WeakMap();
const roles = new Set(['l1-el', 'l1-cl', 'l1-vc', 'base-bootnode',
  'base-builder', 'base-client', 'base-rpc', 'op-batcher']);

function repository() {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== parse(current).root) {
    if (existsSync(join(current, 'scripts/layout.json')) && existsSync(join(current, 'package.json'))
      && JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')).name === 'lianum') return realpathSync(current);
    current = dirname(current);
  }
  throw errorCode('BASE_ORIGINAL_REPOSITORY_REQUIRED');
}
function errorCode(code) { return Object.assign(new Error(code), { code }); }
function processIdentity(pid, backend = true) {
  const root = `/proc/${pid}`, bytes = readFileSync(`${root}/stat`, 'utf8');
  const fields = bytes.slice(bytes.lastIndexOf(')') + 2).trim().split(/\s+/);
  const identity = { pid, startTicks: fields[19], pgrp: Number(fields[2]),
    session: Number(fields[3]), uid: statSync(root).uid };
  assert(Number.isSafeInteger(pid) && pid > 0 && /^\d+$/.test(identity.startTicks)
    && (!backend || identity.uid === process.getuid()), 'BASE_ORIGINAL_PROCESS');
  return Object.freeze(identity);
}
function sameProcess(state) {
  assert.equal(state.child.exitCode, null, 'BASE_ORIGINAL_CHILD_EXITED');
  assert.deepEqual(processIdentity(state.child.pid), state.identity, 'BASE_ORIGINAL_PROCESS_CHANGED');
}
function present(identity) {
  if (!existsSync(`/proc/${identity.pid}`)) return false;
  try { assert.deepEqual(processIdentity(identity.pid), identity, 'BASE_ORIGINAL_PROCESS_CHANGED'); return true; }
  catch (error) { if (error.code === 'ENOENT' && !existsSync(`/proc/${identity.pid}`)) return false; throw error; }
}
function bounded(work, milliseconds, code) {
  let timer;
  const deadline = performance.now() + milliseconds;
  const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(errorCode(code)), milliseconds); });
  return Promise.race([work, expiry]).then(value => {
    if (performance.now() > deadline) throw errorCode(code);
    return value;
  }).finally(() => clearTimeout(timer));
}
function fail(state, error, uncertain = false) {
  state.failed = true; state.uncertain ||= uncertain;
  for (const pending of state.pending.values()) pending.reject(error);
  state.pending.clear();
}
function live(runtime) {
  const state = owned.get(runtime);
  assert(state && !state.closed && !state.failed, 'BASE_ORIGINAL_RUNTIME_UNAVAILABLE');
  sameProcess(state); return state;
}
function docker(arguments_) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/docker', arguments_, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => error ? reject(errorCode('BASE_ORIGINAL_DOCKER_FAILED')) : resolve(stdout));
  });
}
async function sameContainer(state, original) {
  const rows = JSON.parse(await docker(['container', 'inspect', original.id]));
  assert.equal(rows.length, 1, 'BASE_ORIGINAL_CONTAINER_CHANGED');
  const row = rows[0], labels = row.Config.Labels;
  assert.equal(row.Id, original.id); assert.equal(row.Image, original.image); assert.equal(row.Created, original.created);
  assert.equal(labels['com.docker.compose.project'], state.project);
  assert.equal(labels['com.docker.compose.service'], original.service);
  if (row.State.Running) {
    assert.equal(row.State.Pid, original.pid, 'BASE_ORIGINAL_NATIVE_CHANGED');
    assert.deepEqual(processIdentity(row.State.Pid, false), original.process, 'BASE_ORIGINAL_NATIVE_CHANGED');
  }
  return row;
}
async function shutdown(state) {
  if (state.stopWork) return state.stopWork;
  state.closed = true;
  state.stopWork = (async () => {
    let primary = null, controlledSignal = false, result = null;
    try {
      try { await bounded(state.tail.catch(() => {}), IPC_MS, 'BASE_ORIGINAL_DRAIN_TIMEOUT'); }
      catch (error) { primary ||= error; fail(state, error, true); }
      state.child.stdin.end();
      try { result = await bounded(state.exited, 40_000, 'BASE_ORIGINAL_CLOSE_PENDING'); }
      catch {
        if (state.identity && present(state.identity)) {
          sameProcess(state); state.child.kill('SIGTERM'); controlledSignal = true;
        }
        try { result = await bounded(state.exited, 45_000, 'BASE_ORIGINAL_CLOSE_UNCONFIRMED'); }
        catch (error) { primary ||= error; }
      }
      // Each immutable container identity came only from the pinned original
      // child before READY. Never use a project-wide Docker cleanup or new ID.
      const inspected = await Promise.allSettled([...state.containers.values()].map(async original => {
        const row = await sameContainer(state, original);
        return { original, running: row.State.Running };
      }));
      const stops = [];
      for (const item of inspected) {
        if (item.status === 'rejected') primary ||= item.reason;
        else if (item.value.running) stops.push(item.value.original.id);
      }
      if (stops.length) {
        try { await docker(['container', 'stop', '--time', '10', ...stops]); controlledSignal = true; }
        catch (error) { primary ||= error; }
      }
      const endings = await Promise.allSettled([...state.containers.values()].map(async original => {
        assert.equal((await sameContainer(state, original)).State.Running, false, 'BASE_ORIGINAL_CLOSE_UNCONFIRMED');
      }));
      for (const ending of endings) if (ending.status === 'rejected') primary ||= ending.reason;
      if (!result && state.identity && present(state.identity) && !primary) {
        sameProcess(state); state.child.kill('SIGKILL'); controlledSignal = true;
        result = await bounded(state.exited, 5_000, 'BASE_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED');
      }
      assert(result && state.identity && !present(state.identity), 'BASE_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED');
      if (primary) throw primary;
      return Object.freeze({ profile: PROFILE, closed: true, originalBackendExitCode: result.code,
        originalBackendSignal: result.signal, controlledShutdownSignalUsed: controlledSignal,
        containerCount: state.containers.size, containerDataRetained: true,
        originalOutcomeUncertain: state.uncertain });
    } finally { state.lines.close(); }
  })();
  return state.stopWork;
}
async function command(runtime, operation, input) {
  const state = live(runtime), previous = state.tail; let release;
  const held = new Promise(resolve => { release = resolve; });
  state.tail = previous.catch(() => {}).then(() => held);
  await previous.catch(() => {});
  try {
    live(runtime); const id = ++state.sequence;
    const result = new Promise((resolve, reject) => { state.pending.set(id, { resolve, reject }); });
    state.child.stdin.write(`${JSON.stringify({ id, operation, input })}\n`, error => {
      if (error) fail(state, errorCode('BASE_ORIGINAL_OPERATION_UNCERTAIN'), true);
    });
    const value = await bounded(result, IPC_MS, 'BASE_ORIGINAL_OPERATION_UNCERTAIN');
    live(runtime); return value;
  } catch (error) { fail(state, error, true); void shutdown(state).catch(() => {}); throw error; }
  finally { release(); }
}

// Direct canonical import is outside the frozen compiler/runtime mapper.
export async function createOwnedBaseRollupClusterV1() {
  assert.equal(arguments.length, 0, 'BASE_NO_OPTIONS');
  const root = repository(), recipe = join(root, 'scripts/development/owned_base_rollup_v1.py');
  assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'), RECIPE_SHA256, 'BASE_ORIGINAL_RECIPE_CHANGED');
  const child = spawn('/usr/bin/python3', [recipe], { cwd: root, stdio: ['pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  const state = { child, identity: null, pending: new Map(), containers: new Map(), project: null,
    sequence: 0, tail: Promise.resolve(), failed: false, closed: false, uncertain: false };
  let readyResolve, readyReject, exitResolve;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  state.exited = new Promise(resolve => { exitResolve = resolve; });
  child.once('exit', (code, signal) => {
    exitResolve({ code, signal }); const error = errorCode('BASE_ORIGINAL_BACKEND_EXITED');
    fail(state, error, state.pending.size > 0); readyReject(error);
  });
  child.once('error', error => { fail(state, error); readyReject(error); exitResolve({ code: null, signal: null }); });
  state.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  state.lines.on('line', line => {
    try {
      assert(line.length <= 262144, 'BASE_ORIGINAL_REPLY_BOUND');
      const value = JSON.parse(line);
      if (value.ownedBirth === true) {
        sameProcess(state); assert.equal(value.profile, PROFILE);
        assert.deepEqual(value.originalParent, processIdentity(process.pid));
        assert.deepEqual(value.originalBackend, state.identity);
        assert(/^lianum-base-[0-9a-f]{32}$/.test(value.project), 'BASE_ORIGINAL_PROJECT');
        if (state.project) assert.equal(value.project, state.project); else state.project = value.project;
        assert(Array.isArray(value.originalContainers) && value.originalContainers.length <= 16);
        for (const original of value.originalContainers) {
          assert(roles.has(original.service) && /^[0-9a-f]{64}$/.test(original.id)
            && /^sha256:[0-9a-f]{64}$/.test(original.image) && typeof original.created === 'string'
            && Number.isSafeInteger(original.pid) && original.pid > 0, 'BASE_ORIGINAL_CONTAINER');
          assert.deepEqual(processIdentity(original.pid, false), original.process, 'BASE_ORIGINAL_NATIVE_CHANGED');
          if (state.containers.has(original.id)) assert.deepEqual(original, state.containers.get(original.id));
          else state.containers.set(original.id, Object.freeze({ ...original }));
        }
        return;
      }
      if (value.ready === true) {
        sameProcess(state); assert.equal(value.profile, PROFILE); assert.equal(value.project, state.project);
        assert.deepEqual(value.originalParent, processIdentity(process.pid)); assert.deepEqual(value.originalBackend, state.identity);
        assert.equal(new Set([...state.containers.values()].map(row => row.service)).size, roles.size);
        assert.equal(value.finality.scope, 'owned-local-base-derived-parent-finality');
        assert.equal(value.finality.rollupChallengeFinalityEstablished, false);
        assert.equal(value.finality.privateCreditEstablished, false);
        assert.equal(value.finality.independentOperators, false);
        readyResolve(value); return;
      }
      if (Object.hasOwn(value, 'id')) {
        const pending = state.pending.get(value.id);
        if (!pending && (state.closed || state.failed)) return;
        assert(pending, 'BASE_ORIGINAL_REPLY_ID'); state.pending.delete(value.id);
        if (value.error) {
          assert(/^BASE_[A-Z_]+$/.test(value.error)); pending.reject(errorCode(value.error));
        } else pending.resolve(value.result);
      } else {
        assert(/^BASE_[A-Z_]+$/.test(value.error)); readyReject(errorCode(value.error));
      }
    } catch (error) { fail(state, error, true); readyReject(error); void shutdown(state).catch(() => {}); }
  });
  try {
    state.identity = processIdentity(child.pid);
    await bounded(ready, BIRTH_MS, 'BASE_ORIGINAL_CONSTRUCTOR_TIMEOUT');
    sameProcess(state); assert(!state.failed && !state.closed, 'BASE_ORIGINAL_RUNTIME_UNAVAILABLE');
    assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'), RECIPE_SHA256, 'BASE_ORIGINAL_RECIPE_CHANGED');
    const runtime = Object.freeze({ profile: PROFILE, network: 'base-rollup', chainId: 84538453,
      parentChainId: 1337, scope: 'owned-local', independentOperators: false,
      async close() { assert.equal(arguments.length, 0, 'BASE_NO_OPTIONS'); return shutdown(state); } });
    owned.set(runtime, state); return runtime;
  } catch (error) { fail(state, error, true); try { await shutdown(state); } catch {} throw error; }
}
export function assertOwnedBaseRollupClusterV1(runtime) {
  assert.equal(arguments.length, 1, 'BASE_RUNTIME_ONLY'); live(runtime); return runtime;
}
export async function readOwnedBaseRollupFinalizedHeadV1(runtime) {
  assert.equal(arguments.length, 1, 'BASE_RUNTIME_ONLY'); return command(runtime, 'head', null);
}
export async function sendOwnedBaseRollupSignedTransactionOnceV1(runtime, wire) {
  assert.equal(arguments.length, 2, 'BASE_ORIGINAL_SIGNED_WIRE_ONLY');
  assert(typeof wire === 'string' && /^0x(?:[0-9a-f]{2}){1,65536}$/.test(wire), 'BASE_ORIGINAL_SIGNED_WIRE');
  return command(runtime, 'broadcast', wire);
}
