import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const PROFILE = 'OWNED_BSC_POSA_THREE_VALIDATORS_V1';
const RECIPE_SHA256 = '3b268f36b02bd0300a03a46fac5b121309c9ce3cf652c6b37f84e2f37e06e984';
// Python's 90-second readiness already contains registrations. This outer
// watchdog deliberately permits 30 + 3*15 + 90 + an explicit 15-second margin.
const CONSTRUCTOR_MS = (30 + 3 * 15 + 90 + 15) * 1000;
const IPC_MS = 30_000, SHUTDOWN_MS = 40_000;
const owned = new WeakMap();
function repository() {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== parse(current).root) {
    if (existsSync(join(current, 'scripts/layout.json'))
      && existsSync(join(current, 'packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs'))
      && existsSync(join(current, 'package.json'))
      && JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')).name === 'lianum') return realpathSync(current);
    current = dirname(current);
  }
  throw new Error('BSC_ORIGINAL_REPOSITORY_REQUIRED');
}
function errorCode(code) { return Object.assign(new Error(code), { code }); }
function processIdentity(pid) {
  const root = `/proc/${pid}`, bytes = readFileSync(`${root}/stat`, 'utf8');
  const fields = bytes.slice(bytes.lastIndexOf(')') + 2).trim().split(/\s+/);
  const value = { pid, startTicks: fields[19], pgrp: Number(fields[2]), session: Number(fields[3]), uid: statSync(root).uid };
  assert(Number.isSafeInteger(value.pid) && value.pid > 0 && /^\d+$/.test(value.startTicks)
    && Number.isSafeInteger(value.pgrp) && value.pgrp >= 0 && Number.isSafeInteger(value.session) && value.session >= 0
    && value.uid === process.getuid(), 'BSC_ORIGINAL_PROCESS');
  return Object.freeze(value);
}
function present(identity) {
  assert(identity, 'BSC_ORIGINAL_PROCESS_REQUIRED');
  if (!existsSync(`/proc/${identity.pid}`)) return false;
  try { assert.deepEqual(processIdentity(identity.pid), identity, 'BSC_ORIGINAL_PROCESS_CHANGED'); return true; }
  catch (error) { if (error.code === 'ENOENT' && !existsSync(`/proc/${identity.pid}`)) return false; throw error; }
}
function sameProcess(child, identity) {
  assert.equal(child.exitCode, null, 'BSC_ORIGINAL_CHILD_EXITED');
  assert.deepEqual(processIdentity(child.pid), identity, 'BSC_ORIGINAL_PROCESS_CHANGED');
}
function signalOriginal(identity, signal) {
  if (!present(identity)) return;
  try { process.kill(identity.pid, signal); }
  catch (error) { if (error.code === 'ESRCH' && !present(identity)) return; throw error; }
}
async function bounded(work, milliseconds, code) {
  assert(milliseconds > 0 && Number.isFinite(milliseconds));
  const deadline = performance.now() + milliseconds; let timer;
  const expiry = new Promise((_, reject) => { timer = setTimeout(() => reject(errorCode(code)), milliseconds); });
  try { const value = await Promise.race([work, expiry]); if (performance.now() > deadline) throw errorCode(code); return value; }
  finally { clearTimeout(timer); }
}
function fail(state, error, uncertain = false) {
  state.failed = true; state.uncertain ||= uncertain;
  for (const pending of state.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
  state.pending.clear();
}
function live(runtime) {
  const state = owned.get(runtime);
  assert(state && !state.closed && !state.failed, 'BSC_ORIGINAL_RUNTIME_UNAVAILABLE');
  sameProcess(state.child, state.identity); return state;
}
async function gone(identity, milliseconds) {
  const deadline = performance.now() + milliseconds;
  while (present(identity)) {
    assert(performance.now() < deadline, 'BSC_ORIGINAL_CLOSE_UNCONFIRMED');
    await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, deadline - performance.now()))));
  }
}
async function shutdown(state) {
  if (state.stopWork) return state.stopWork;
  state.closed = true;
  state.stopWork = (async () => {
    let drainError = null, forced = false, nativeSignals = 0, result = null;
    try {
      try { await bounded(state.tail.catch(() => {}), IPC_MS, 'BSC_ORIGINAL_DRAIN_TIMEOUT'); }
      catch (error) { drainError = error; fail(state, error, true); }
      state.child.stdin.end(); const deadline = performance.now() + SHUTDOWN_MS;
      try { result = await bounded(state.exited, 5_000, 'BSC_ORIGINAL_CLOSE_PENDING'); }
      catch {
        try {
          if (state.identity && present(state.identity)) {
            sameProcess(state.child, state.identity); signalOriginal(state.identity, 'SIGTERM'); forced = true;
          }
        } catch (error) { drainError ||= error; }
        try { result = await bounded(state.exited, Math.max(1, deadline - performance.now()), 'BSC_ORIGINAL_CLOSE_TIMEOUT'); }
        catch (error) { drainError ||= error; fail(state, error, true); }
      }
      // Drain every authenticated original sibling even if Python exited
      // abruptly or another sibling's birth changed. Never signal a new PID.
      const endings = await Promise.allSettled(state.validators.map(async identity => {
        if (!present(identity)) return;
        signalOriginal(identity, 'SIGTERM'); nativeSignals++;
        try { await gone(identity, 5_000); }
        catch { signalOriginal(identity, 'SIGKILL'); await gone(identity, 5_000); }
      }));
      for (const ending of endings) if (ending.status === 'rejected') drainError ||= ending.reason;
      // The original Python is forced only after its exact native children
      // have drained. A failed sibling identity never authorizes replacement.
      const nativeGone = state.validators.every(identity => {
        try { return !present(identity); } catch (error) { drainError ||= error; return false; }
      });
      if (!result && nativeGone) {
        try {
          if (state.identity && present(state.identity)) {
            sameProcess(state.child, state.identity); signalOriginal(state.identity, 'SIGKILL'); forced = true;
          }
          result = await bounded(state.exited, 5_000, 'BSC_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED');
        } catch (error) { drainError ||= error; }
      }
      for (const identity of state.validators) {
        try { assert.equal(present(identity), false, 'BSC_ORIGINAL_NODE_CLOSE_UNCONFIRMED'); }
        catch (error) { drainError ||= error; }
      }
      try { if (state.identity) assert.equal(present(state.identity), false, 'BSC_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED'); }
      catch (error) { drainError ||= error; }
      if (drainError) throw drainError;
      assert(result && (result.code === 0 || forced), 'BSC_ORIGINAL_BACKEND_CLOSE_UNCONFIRMED');
      return Object.freeze({ profile: PROFILE, closed: true, originalBackendExitCode: result.code,
        originalBackendSignal: result.signal, controlledShutdownSignalUsed: forced,
        originalNativeProcessesSignalled: nativeSignals, originalOutcomeUncertain: state.uncertain, nodeDataRetained: true });
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
    live(runtime); const id = ++state.sequence; const deadline = performance.now() + IPC_MS;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = errorCode('BSC_ORIGINAL_OPERATION_UNCERTAIN'); fail(state, error, true);
        void shutdown(state).catch(() => {});
      }, IPC_MS);
      state.pending.set(id, { resolve, reject, timer, operation });
    });
    state.child.stdin.write(`${JSON.stringify({ id, operation, input })}\n`, error => {
      if (error) { fail(state, error, true); void shutdown(state).catch(() => {}); }
    });
    const value = await result;
    if (performance.now() > deadline) { const error = errorCode('BSC_ORIGINAL_OPERATION_UNCERTAIN'); fail(state,error,true); void shutdown(state).catch(() => {}); throw error; }
    live(runtime); return value;
  } finally { release(); }
}

// This file is used by direct canonical import; scripts/development is outside
// the frozen runtime mapper's sourceRoots. No layout or compiler pin changes.
export async function createOwnedBscPoSAClusterV1() {
  assert.equal(arguments.length, 0, 'BSC_NO_OPTIONS');
  const root = repository(), recipe = join(root, 'scripts/development/owned_bsc_posa_v1.py');
  assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'), RECIPE_SHA256, 'BSC_ORIGINAL_RECIPE_CHANGED');
  const child = spawn('/usr/bin/python3', [recipe], { cwd: root, stdio: ['pipe','pipe','ignore'], env: { PATH:'/usr/bin:/bin', LANG:'C.UTF-8' } });
  const state = { child, identity:null, validators:[], pending:new Map(), sequence:0, tail:Promise.resolve(), closed:false, failed:false, uncertain:false };
  let exitResolve; state.exited = new Promise(resolve => { exitResolve = resolve; });
  child.once('exit', (code,signal) => exitResolve({code,signal}));
  let readyResolve, readyReject;
  const ready = new Promise((resolve,reject) => { readyResolve=resolve; readyReject=reject; });
  state.lines = createInterface({input:child.stdout,crlfDelay:Infinity});
  function birth(value) {
    assert.equal(value.profile,PROFILE); assert.deepEqual(value.originalParent,processIdentity(process.pid),'BSC_ORIGINAL_PARENT_CHANGED');
    assert(Array.isArray(value.ownedProcesses) && value.ownedProcesses.length>=1 && value.ownedProcesses.length<=3);
    const validators = value.ownedProcesses.map(identity => {
      assert.deepEqual(processIdentity(identity.pid),identity,'BSC_ORIGINAL_VALIDATOR_CHANGED');
      const status=readFileSync(`/proc/${identity.pid}/status`,'utf8'),ppid=Number(/^PPid:\s+(\d+)$/m.exec(status)?.[1]);
      assert.equal(ppid,child.pid,'BSC_ORIGINAL_VALIDATOR_PARENT'); assert.equal(identity.pgrp,identity.pid); assert.equal(identity.session,identity.pid);
      return Object.freeze({...identity});
    });
    assert.equal(new Set(validators.map(identity=>identity.pid)).size,validators.length);
    assert.deepEqual(validators.slice(0,state.validators.length),state.validators,'BSC_ORIGINAL_VALIDATOR_CHANGED'); state.validators=validators;
  }
  state.lines.on('line',line=>{
    try {
      assert(line.length<=262144,'BSC_ORIGINAL_REPLY_BOUND'); const value=JSON.parse(line);
      if(value.ownedBirth===true){birth(value);return;}
      if(value.ready===true){birth(value);assert.equal(value.chainId,714);assert(/^[0-9a-f]{64}$/.test(value.genesisSHA256));assert.equal(state.validators.length,3);readyResolve(value);return;}
      if(Object.hasOwn(value,'id')){
        const pending=state.pending.get(value.id);
        if(!pending && (state.failed||state.closed))return;
        assert(pending,'BSC_ORIGINAL_REPLY_ID');state.pending.delete(value.id);clearTimeout(pending.timer);
        if(value.error){assert(/^BSC_[A-Z_]+$/.test(value.error));const error=errorCode(value.error);pending.reject(error);if(pending.operation==='broadcast'||value.error==='BSC_OPERATION_UNRESOLVED'){fail(state,error,true);void shutdown(state).catch(()=>{});}}else pending.resolve(value.result);
      }else{assert(/^BSC_[A-Z_]+$/.test(value.error));readyReject(errorCode(value.error));}
    }catch(error){fail(state,error,true);readyReject(error);void shutdown(state).catch(()=>{});}
  });
  child.once('error',error=>{fail(state,error);readyReject(error);exitResolve({code:null,signal:null});});
  child.once('exit',()=>{const error=errorCode('BSC_ORIGINAL_BACKEND_EXITED');fail(state,error,state.pending.size>0);readyReject(error);});
  try {
    state.identity=processIdentity(child.pid);
    const original=await bounded(ready,CONSTRUCTOR_MS,'BSC_ORIGINAL_CONSTRUCTOR_TIMEOUT');
    assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'),RECIPE_SHA256,'BSC_ORIGINAL_RECIPE_CHANGED');sameProcess(child,state.identity);
    assert(!state.failed&&!state.closed,'BSC_ORIGINAL_RUNTIME_UNAVAILABLE');
    const runtime=Object.freeze({profile:PROFILE,network:'bsc',chainId:714,scope:'owned-local',independentOperators:false,
      genesisSHA256:original.genesisSHA256,async close(){assert.equal(arguments.length,0,'BSC_NO_OPTIONS');return shutdown(state);}});
    owned.set(runtime,state);return runtime;
  }catch(error){fail(state,error,true);try{await shutdown(state);}catch{}throw error;}
}
export function assertOwnedBscPoSAClusterV1(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY'); live(runtime); return runtime;
}
export async function readOwnedBscFinalizedHeadV1(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  const value = await command(runtime, 'finalized', null);
  assert(value.finality === 'bsc-native-finalized' && value.validatorCount === 3 && value.independentOperators === false);
  assert(/^\d+$/.test(value.blockNumber) && /^\d+$/.test(value.timestamp) && /^0x[0-9a-f]{64}$/.test(value.blockHash));
  return Object.freeze(value);
}
// The signed wire is consumed once by the original native node. An ambiguous
// RPC outcome remains unresolved; this module has no re-sign or retry path.
export async function sendOwnedBscSignedTransactionOnceV1(runtime, signedWire) {
  assert.equal(arguments.length, 2, 'BSC_SIGNED_WIRE_ONLY');
  assert(typeof signedWire === 'string' && /^0x[0-9a-f]+$/.test(signedWire) && signedWire.length % 2 === 0 && signedWire.length <= 260000);
  const transactionHash = await command(runtime, 'broadcast', signedWire);
  assert(/^0x[0-9a-f]{64}$/.test(transactionHash)); return transactionHash;
}
