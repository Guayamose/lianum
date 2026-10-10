import {createOriginalBaseRollupSourceProfileV1,assertOriginalOwnedRollupSourceProfileV1,readOriginalOwnedRollupSourceProfileV1,closeOriginalOwnedRollupSourceProfileV1} from './owned-rollup-original-source-profile-v1.mjs';
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const PROFILE = 'OWNED_BASE_NATIVE_ROLLUP_POS_V1';
const NATIVE_VALUE_PROFILE = 'OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1';
const nativeValues = new WeakSet();
const RECIPE_SHA256 = 'ef02373e988a83204581a818fe245ebf5dea9230514847af1ecc42a42e2c0c49';
const CUSTODY_SHA256 = 'a344fb661cd31045c4f481e5117671c2ada3fe0498d5d38119fcd2825e8b1f80';
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
  if(state.sourceProfile)assertOriginalOwnedRollupSourceProfileV1(state.sourceProfile);
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
  if(state.sourceProfile)closeOriginalOwnedRollupSourceProfileV1(state.sourceProfile);
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
      return Object.freeze({ profile: state.profile, closed: true, originalBackendExitCode: result.code,
        originalBackendSignal: result.signal, controlledShutdownSignalUsed: controlledSignal,
        containerCount: state.containers.size, containerDataRetained: true,
        originalOutcomeUncertain: state.uncertain });
    } finally { state.lines.close(); }
  })();
  return state.stopWork;
}
function originalReadInput(method, params) {
  assert(typeof method==='string' && method.length<=64,'BASE_ORIGINAL_READ_REQUEST');
  let nodes=0, characters=0;
  function copy(value,depth=0) {
    assert(++nodes<=256 && depth<=8,'BASE_ORIGINAL_READ_BOUND');
    if(value===null || typeof value==='boolean')return value;
    if(typeof value==='string'){characters+=value.length;assert(characters<=8192,'BASE_ORIGINAL_READ_BOUND');return value;}
    if(typeof value==='number'){assert(Number.isSafeInteger(value)&&!Object.is(value,-0),'BASE_ORIGINAL_READ_REQUEST');return value;}
    assert(value && typeof value==='object' && !types.isProxy(value),'BASE_ORIGINAL_READ_REQUEST');
    const array=Array.isArray(value);assert(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype),'BASE_ORIGINAL_READ_REQUEST');
    const keys=Reflect.ownKeys(value);assert(keys.length<=32,'BASE_ORIGINAL_READ_BOUND');
    if(array){assert(value.length<=16 && keys.length===value.length+1,'BASE_ORIGINAL_READ_REQUEST');
      const result=[];for(let i=0;i<value.length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));assert(field&&Object.hasOwn(field,'value'),'BASE_ORIGINAL_READ_REQUEST');result.push(copy(field.value,depth+1));}return result;}
    const result={};for(const key of keys){assert(typeof key==='string' && key.length<=64 && !['__proto__','constructor','prototype'].includes(key),'BASE_ORIGINAL_READ_REQUEST');
      characters+=key.length;assert(characters<=8192,'BASE_ORIGINAL_READ_BOUND');const field=Object.getOwnPropertyDescriptor(value,key);assert(Object.hasOwn(field,'value'),'BASE_ORIGINAL_READ_REQUEST');result[key]=copy(field.value,depth+1);}return result;
  }
  assert(Array.isArray(params) && !types.isProxy(params),'BASE_ORIGINAL_READ_REQUEST');
  const input={method,params:copy(params)};assert(Buffer.byteLength(JSON.stringify(input))<=16384,'BASE_ORIGINAL_READ_BOUND');return input;
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
  } catch (error) {
    if(operation==='broadcast' && state.nativeValue && !state.failed && error.code==='BASE_ORIGINAL_OPERATION_UNCERTAIN'){sameProcess(state);state.uncertain=true;throw error;}
    fail(state,error,true);void shutdown(state).catch(()=>{});throw error;
  }
  finally { release(); }
}

// Direct canonical import is outside the frozen compiler/runtime mapper.
async function createFixedBaseRollupClusterV1(nativeValue) {
  const profile = nativeValue ? NATIVE_VALUE_PROFILE : PROFILE;
  const sourceProfile = nativeValue ? createOriginalBaseRollupSourceProfileV1() : null;
  const {createOriginalBaseNativeValueCustodyV1,readOriginalBaseNativeValueCustodyPublicV1,bindOriginalBaseNativeValueCustodyV1,dispatchOriginalBaseNativeValueV1,assertOriginalBaseNativeValuePreparedCurrentV1,observeOriginalBaseNativeValueV1,closeOriginalBaseNativeValueCustodyV1}=nativeValue?await import('./owned-base-native-value-dispatch-v1.mjs'):{};
  if(sourceProfile)assertOriginalOwnedRollupSourceProfileV1(sourceProfile);
  const root = repository(), recipe = join(root, 'scripts/development/owned_base_rollup_v1.py');
  assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'), RECIPE_SHA256, 'BASE_ORIGINAL_RECIPE_CHANGED');
  if(nativeValue)assert.equal(createHash('sha256').update(readFileSync(join(root,'scripts/development/owned-base-native-value-dispatch-v1.mjs'))).digest('hex'),CUSTODY_SHA256,'BASE_ORIGINAL_CUSTODY_SOURCE_CHANGED');
  const custody=nativeValue?await createOriginalBaseNativeValueCustodyV1():null;
  const custodyPublic=custody?readOriginalBaseNativeValueCustodyPublicV1(custody):null;
  try{if(sourceProfile)assertOriginalOwnedRollupSourceProfileV1(sourceProfile);}
  catch(error){try{if(custody)await closeOriginalBaseNativeValueCustodyV1(custody);}finally{if(sourceProfile)closeOriginalOwnedRollupSourceProfileV1(sourceProfile);}throw error;}
  const child = spawn('/usr/bin/python3', [recipe, ...(nativeValue ? ['--native-value'] : [])], { cwd: root, stdio: ['pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } });
  const state = { child, profile, nativeValue, custody, sourceProfile, identity: null, pending: new Map(), containers: new Map(), project: null,
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
        sameProcess(state); assert.equal(value.profile, state.profile);
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
        sameProcess(state); assert.equal(value.profile, state.profile); assert.equal(value.project, state.project);
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
    if(nativeValue)assert.equal(createHash('sha256').update(readFileSync(join(root,'scripts/development/owned-base-native-value-dispatch-v1.mjs'))).digest('hex'),CUSTODY_SHA256,'BASE_ORIGINAL_CUSTODY_SOURCE_CHANGED');
    let metadata=null;if(nativeValue){const view=Object.freeze(Object.create(null));owned.set(view,state);nativeValues.add(view);try{const identity=await readOwnedBaseRollupNativeValueIdentityV1(view);metadata=Object.freeze({version:profile,classification:'OWNED_LOCAL_ORIGINAL_BASE_NATIVE_VALUE_V1',chainId:'8453',evmGenesis:'0x'+identity.genesis,parentGenesis:'0x'+identity.parentGenesis,scratchDirectory:custodyPublic.scratchDirectory,publicNetwork:false,localLaboratorySigner:true,independentOperators:false,rollupChallengeFinalityEstablished:false,deviceCustody:false});}finally{nativeValues.delete(view);owned.delete(view);}}
    const runtime = Object.freeze({ profile, network: 'base-rollup', chainId: nativeValue ? 8453 : 84538453,
      parentChainId: 1337, scope: 'owned-local', independentOperators: false,
      ...(nativeValue?{metadata,accounts:Object.freeze([custodyPublic.address]),
        dispatchNativeValueV1(request){assert.equal(arguments.length,1);return dispatchOriginalBaseNativeValueV1(custody,runtime,request);},
        assertNativeValuePreparedCurrent(prepared){assert.equal(arguments.length,1);return assertOriginalBaseNativeValuePreparedCurrentV1(custody,runtime,prepared);},
        observeNativeValueOriginal(query){assert.equal(arguments.length,1);return observeOriginalBaseNativeValueV1(custody,runtime,query);},
        async time(){assert.equal(arguments.length,0);const head=await readOwnedBaseRollupNativeValueRpcV1(runtime,'eth_getBlockByNumber',['latest',false]);assert(/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(head.timestamp));return BigInt(head.timestamp);}}:{}),
      async close(){assert.equal(arguments.length,0,'BASE_NO_OPTIONS');let primary,custodyReceipt;try{if(custody)custodyReceipt=await closeOriginalBaseNativeValueCustodyV1(custody);}catch(error){primary=error;}const result=await shutdown(state);if(primary)throw primary;return custodyReceipt?Object.freeze({...result,originalOutcomeUncertain:result.originalOutcomeUncertain||custodyReceipt.nativeKeyOutcomeUncertain,originalPrivateCustodyClosed:custodyReceipt.closed}):result;}  });
    owned.set(runtime,state);if(nativeValue){nativeValues.add(runtime);await bounded(bindOriginalBaseNativeValueCustodyV1(custody,runtime),IPC_MS,'BASE_ORIGINAL_CUSTODY_BIND_TIMEOUT');}return runtime;
  } catch(error){fail(state,error,true);try{if(custody)await closeOriginalBaseNativeValueCustodyV1(custody);}catch{}try{await shutdown(state);}catch{}throw error;}
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

export async function createOwnedBaseRollupClusterV1() {
  assert.equal(arguments.length,0,'BASE_NO_OPTIONS'); return createFixedBaseRollupClusterV1(false);
}
export async function createOwnedBaseRollupNativeValueClusterV1() {
  assert.equal(arguments.length,0,'BASE_NO_OPTIONS'); return createFixedBaseRollupClusterV1(true);
}
export function isOwnedBaseRollupNativeValueClusterV1(runtime) {
  assert.equal(arguments.length,1,'BASE_RUNTIME_ONLY'); return nativeValues.has(runtime);
}
export function assertOwnedBaseRollupNativeValueLiveV1(runtime) {
  assert.equal(arguments.length,1,'BASE_RUNTIME_ONLY'); assert(nativeValues.has(runtime),'BASE_ORIGINAL_ECONOMIC_PROFILE_REQUIRED'); live(runtime);
}
export async function readOwnedBaseRollupNativeValueIdentityV1(runtime) {
  assertOwnedBaseRollupNativeValueLiveV1(runtime); const value=await command(runtime,'identity',null);
  assertOwnedBaseRollupNativeValueLiveV1(runtime); assert.equal(value.profile,NATIVE_VALUE_PROFILE);
  assert.equal(value.chainId,String(8453));assert(/^[0-9a-f]{64}$/.test(value.genesis));
  const state=live(runtime), containers=[...state.containers.values()].map(row=>({
    id:row.id,image:row.image,created:row.created,process:row.process,service:row.service})).sort((a,b)=>a.service.localeCompare(b.service));
  const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
  return Object.freeze({...value,identity:Object.freeze({
    endpointIdentity:hash({profile:state.profile,backend:state.identity,containers}),
    clientRelease:hash({sourceCommit:value.sourceCommit,images:containers.map(x=>x.image)}),
    chainConfiguration:hash({profile:value.profile,chainId:value.chainId,genesis:value.genesis,
      parentGenesis:value.parentGenesis,sourceCommit:value.sourceCommit})})});
}
export async function readOwnedBaseRollupNativeValueRpcV1(runtime,method,params) {
  assert.equal(arguments.length,3,'BASE_ORIGINAL_READ_ARITY'); assertOwnedBaseRollupNativeValueLiveV1(runtime);
  const input=originalReadInput(method,params);
  const value=await command(runtime,'read',input);assertOwnedBaseRollupNativeValueLiveV1(runtime);return value;
}

/** The factory alone binds custody before this original client starts. */
export function assertOwnedBaseRollupNativeValueCustodyV1(runtime,custody){assert.equal(arguments.length,2);assertOwnedBaseRollupNativeValueLiveV1(runtime);assert.equal(live(runtime).custody,custody,'BASE_ORIGINAL_CUSTODY_PAIR');}

export function readOwnedBaseRollupNativeValueSourceProfileV1(runtime){
 assert.equal(arguments.length,1);assertOwnedBaseRollupNativeValueLiveV1(runtime);
 return readOriginalOwnedRollupSourceProfileV1(live(runtime).sourceProfile);
}
