import {createOriginalBscSourceProfileV3,assertOriginalOwnedBscSourceProfileV3,readOriginalOwnedBscSourceProfileV3,closeOriginalOwnedBscSourceProfileV3} from './owned-bsc-original-source-profile-v3.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';

const PROFILE = 'OWNED_BSC_POSA_THREE_VALIDATORS_V1';
const PROFILE_V2 = 'OWNED_BSC_POSA_THREE_VALIDATORS_V2';
const PROFILE_V3 = 'OWNED_BSC_POSA_THREE_VALIDATORS_V3';
const GENESIS_V3_HELPER_SHA256 = 'c80a262c70130dc355f42d818e6a70b2a3ce75e502d861ea290d20be06a548d1';
const RECIPE_SHA256 = '177b294521b50e057938487b2e42d7a8bdd15b2af1d5a9102ffc4eccb6c9a47e';
// Python's 90-second readiness already contains registrations. This outer
// watchdog deliberately permits 30 + 3*15 + 90 + an explicit 15-second margin.
const CONSTRUCTOR_MS = (30 + 3 * 15 + 90 + 15) * 1000;
const IPC_MS = 30_000, SHUTDOWN_MS = 40_000;
const NATIVE_VALUE_PROFILE_V3='OWNED_BSC_POSA_NATIVE_VALUE_714_V3';
const nativeValues=new WeakSet(), owned = new WeakMap();
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
  if(state.sourceProfile)assertOriginalOwnedBscSourceProfileV3(state.sourceProfile);
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
      return Object.freeze({ profile: state.profile, closed: true, originalBackendExitCode: result.code,
        originalBackendSignal: result.signal, controlledShutdownSignalUsed: forced,
        originalNativeProcessesSignalled: nativeSignals, originalOutcomeUncertain: state.uncertain, nodeDataRetained: true });
    } finally { state.lines.close();if(state.sourceProfile)closeOriginalOwnedBscSourceProfileV3(state.sourceProfile); }
  })();
  return state.stopWork;
}
function originalReadInput(method, params) {
  assert(typeof method==='string' && method.length<=64,'BSC_ORIGINAL_READ_REQUEST');
  let nodes=0, characters=0;
  function copy(value,depth=0) {
    assert(++nodes<=256 && depth<=8,'BSC_ORIGINAL_READ_BOUND');
    if(value===null || typeof value==='boolean')return value;
    if(typeof value==='string'){characters+=value.length;assert(characters<=8192,'BSC_ORIGINAL_READ_BOUND');return value;}
    if(typeof value==='number'){assert(Number.isSafeInteger(value)&&!Object.is(value,-0),'BSC_ORIGINAL_READ_REQUEST');return value;}
    assert(value && typeof value==='object' && !types.isProxy(value),'BSC_ORIGINAL_READ_REQUEST');
    const array=Array.isArray(value);assert(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype),'BSC_ORIGINAL_READ_REQUEST');
    const keys=Reflect.ownKeys(value);assert(keys.length<=32,'BSC_ORIGINAL_READ_BOUND');
    if(array){assert(value.length<=16 && keys.length===value.length+1,'BSC_ORIGINAL_READ_REQUEST');
      const result=[];for(let i=0;i<value.length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));assert(field&&Object.hasOwn(field,'value'),'BSC_ORIGINAL_READ_REQUEST');result.push(copy(field.value,depth+1));}return result;}
    const result={};for(const key of keys){assert(typeof key==='string' && key.length<=64 && !['__proto__','constructor','prototype'].includes(key),'BSC_ORIGINAL_READ_REQUEST');
      characters+=key.length;assert(characters<=8192,'BSC_ORIGINAL_READ_BOUND');const field=Object.getOwnPropertyDescriptor(value,key);assert(Object.hasOwn(field,'value'),'BSC_ORIGINAL_READ_REQUEST');result[key]=copy(field.value,depth+1);}return result;
  }
  assert(Array.isArray(params) && !types.isProxy(params),'BSC_ORIGINAL_READ_REQUEST');
  const input={method,params:copy(params)};assert(Buffer.byteLength(JSON.stringify(input))<=16384,'BSC_ORIGINAL_READ_BOUND');return input;
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
async function createFixedOwnedBscPoSACluster(profile, nativeInitV2) {
  const nativeValue=profile===NATIVE_VALUE_PROFILE_V3;
  const sourceProfile=nativeValue?createOriginalBscSourceProfileV3():null;
  let custody,api,custodyPublic;
  try{if(nativeValue){api=await import('./owned-bsc-native-value-dispatch-v3.mjs');assertOriginalOwnedBscSourceProfileV3(sourceProfile);custody=await api.createOriginalBscNativeValueCustodyV3();custodyPublic=api.readOriginalBscNativeValueCustodyPublicV3(custody);assertOriginalOwnedBscSourceProfileV3(sourceProfile);}}
  catch(error){try{if(custody)await api.closeOriginalBscNativeValueCustodyV3(custody);}catch{}finally{if(sourceProfile)closeOriginalOwnedBscSourceProfileV3(sourceProfile);}throw error;}
  let root,recipe,helper,child;
  try{
    root=repository();recipe=join(root,'scripts/development/owned_bsc_posa_v1.py');helper=join(root,'scripts/development/bsc_original_genesis_v3.py');
    assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'), RECIPE_SHA256, 'BSC_ORIGINAL_RECIPE_CHANGED');
    if (profile === PROFILE_V3 || nativeValue) assert.equal(createHash('sha256').update(readFileSync(helper)).digest('hex'), GENESIS_V3_HELPER_SHA256, 'BSC_ORIGINAL_GENESIS_HELPER_CHANGED');
    const args = nativeInitV2 === false ? [] : nativeInitV2 === true ? ['--native-init-v2'] : nativeInitV2 === 'NATIVE_VALUE_V3' ? ['--native-value-v3'] : nativeInitV2 === 'NATIVE_INIT_V3' ? ['--native-init-v3'] : assert.fail('BSC_ORIGINAL_RUNTIME_PROFILE');
    child = spawn('/usr/bin/python3', [recipe, ...args], { cwd: root, stdio: ['pipe','pipe','ignore'], env: { PATH:'/usr/bin:/bin', LANG:'C.UTF-8' } });
  }catch(error){try{if(custody)await api.closeOriginalBscNativeValueCustodyV3(custody);}finally{if(sourceProfile)closeOriginalOwnedBscSourceProfileV3(sourceProfile);}throw error;}
  const state = { child, profile, nativeValue,custody,sourceProfile, identity:null, validators:[], pending:new Map(), sequence:0, tail:Promise.resolve(), closed:false, failed:false, uncertain:false };
  let exitResolve; state.exited = new Promise(resolve => { exitResolve = resolve; });
  child.once('exit', (code,signal) => exitResolve({code,signal}));
  let readyResolve, readyReject;
  const ready = new Promise((resolve,reject) => { readyResolve=resolve; readyReject=reject; });
  state.lines = createInterface({input:child.stdout,crlfDelay:Infinity});
  function birth(value) {
    assert.equal(value.profile,profile); assert.deepEqual(value.originalParent,processIdentity(process.pid),'BSC_ORIGINAL_PARENT_CHANGED');
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
      assert(line.length<=(state.nativeValue?8*1024*1024:262144),'BSC_ORIGINAL_REPLY_BOUND'); const value=JSON.parse(line);
      if(value.ownedBirth===true){birth(value);return;}
      if(value.ready===true){birth(value);assert.equal(value.chainId,714);assert(/^[0-9a-f]{64}$/.test(value.genesisSHA256));assert.equal(state.validators.length,3);readyResolve(value);return;}
      if(Object.hasOwn(value,'id')){
        const pending=state.pending.get(value.id);
        if(!pending && (state.failed||state.closed))return;
        assert(pending,'BSC_ORIGINAL_REPLY_ID');state.pending.delete(value.id);clearTimeout(pending.timer);
        if(value.error){assert(/^BSC_[A-Z_]+$/.test(value.error));const error=errorCode(value.error);pending.reject(error);if(state.nativeValue&&pending.operation==='broadcast'&&value.error==='BSC_ORIGINAL_OPERATION_UNCERTAIN'){state.uncertain=true;}else if(pending.operation==='broadcast'||value.error==='BSC_OPERATION_UNRESOLVED'){fail(state,error,true);void shutdown(state).catch(()=>{});}}else pending.resolve(value.result);
      }else{assert(/^BSC_[A-Z_]+$/.test(value.error));readyReject(errorCode(value.error));}
    }catch(error){fail(state,error,true);readyReject(error);void shutdown(state).catch(()=>{});}
  });
  child.once('error',error=>{fail(state,error);readyReject(error);exitResolve({code:null,signal:null});});
  child.once('exit',()=>{const error=errorCode('BSC_ORIGINAL_BACKEND_EXITED');fail(state,error,state.pending.size>0);readyReject(error);});
  try {
    state.identity=processIdentity(child.pid);
    const original=await bounded(ready,CONSTRUCTOR_MS,'BSC_ORIGINAL_CONSTRUCTOR_TIMEOUT');
    assert.equal(createHash('sha256').update(readFileSync(recipe)).digest('hex'),RECIPE_SHA256,'BSC_ORIGINAL_RECIPE_CHANGED');sameProcess(child,state.identity);
    if (profile === PROFILE_V3 || nativeValue) assert.equal(createHash('sha256').update(readFileSync(helper)).digest('hex'), GENESIS_V3_HELPER_SHA256, 'BSC_ORIGINAL_GENESIS_HELPER_CHANGED');
    assert(!state.failed&&!state.closed,'BSC_ORIGINAL_RUNTIME_UNAVAILABLE');
    let metadata=null;
    if(nativeValue){const temporary=Object.freeze({profile});owned.set(temporary,state);nativeValues.add(temporary);
      try{const identity=await readOwnedBscPoSANativeValueIdentityV3(temporary);assert.equal(identity.genesisSHA256,original.genesisSHA256);
        metadata=Object.freeze({version:profile,classification:'OWNED_LOCAL_ORIGINAL_BSC714_NATIVE_VALUE_V3',chainId:'714',evmGenesis:'0x'+identity.genesis,
          scratchDirectory:custodyPublic.scratchDirectory,publicNetwork:false,localLaboratorySigner:true,deviceCustody:false,independentOperators:false});
      }finally{owned.delete(temporary);nativeValues.delete(temporary);}}
    const runtime=Object.freeze({profile,network:nativeValue?'bsc-local':'bsc',chainId:714,scope:'owned-local',independentOperators:false,
      genesisSHA256:original.genesisSHA256,...(nativeValue?{metadata,accounts:Object.freeze([custodyPublic.address]),
        dispatchNativeValueV1(request){assert.equal(arguments.length,1);return api.dispatchOriginalBscNativeValueV3(custody,runtime,request);},
        assertNativeValuePreparedCurrent(prepared){assert.equal(arguments.length,1);return api.assertOriginalBscNativeValuePreparedCurrentV3(custody,runtime,prepared);},
        observeNativeValueOriginal(query){assert.equal(arguments.length,1);return api.observeOriginalBscNativeValueV3(custody,runtime,query);},
        async time(){assert.equal(arguments.length,0);return BigInt((await readOwnedBscPoSANativeValueRpcV3(runtime,'eth_getBlockByNumber',['latest',false])).timestamp);}
      }:{}),async close(){assert.equal(arguments.length,0,'BSC_NO_OPTIONS');let primary,custodyReceipt;
        try{if(custody)custodyReceipt=await api.closeOriginalBscNativeValueCustodyV3(custody);}catch(error){primary=error;}
        let result;try{result=await shutdown(state);}catch(error){primary||=error;}if(primary)throw primary;
        return custodyReceipt?Object.freeze({...result,originalOutcomeUncertain:result.originalOutcomeUncertain||custodyReceipt.nativeKeyOutcomeUncertain,originalPrivateCustodyClosed:custodyReceipt.closed}):result;}});
    owned.set(runtime,state);if(nativeValue){nativeValues.add(runtime);await api.bindOriginalBscNativeValueCustodyV3(custody,runtime);}return runtime;
  }catch(error){fail(state,error,true);try{if(custody)await api.closeOriginalBscNativeValueCustodyV3(custody);}catch{}try{await shutdown(state);}catch{}throw error;}
}
export async function createOwnedBscPoSAClusterV1() {
  assert.equal(arguments.length, 0, 'BSC_NO_OPTIONS');
  return createFixedOwnedBscPoSACluster(PROFILE, false);
}
export async function createOwnedBscPoSAClusterV2() {
  assert.equal(arguments.length, 0, 'BSC_NO_OPTIONS');
  return createFixedOwnedBscPoSACluster(PROFILE_V2, true);
}
function runtimeProfile(runtime, profile) {
  const state = live(runtime);
  assert.equal(state.profile, profile, 'BSC_ORIGINAL_RUNTIME_PROFILE');
  return runtime;
}
export function assertOwnedBscPoSAClusterV1(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return runtimeProfile(runtime, PROFILE);
}
export function assertOwnedBscPoSAClusterV2(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return runtimeProfile(runtime, PROFILE_V2);
}
async function readFinalizedHead(runtime, profile) {
  runtimeProfile(runtime, profile);
  const value = await command(runtime, 'finalized', null);
  assert(value.finality === 'bsc-native-finalized' && value.validatorCount === 3 && value.independentOperators === false);
  assert(/^\d+$/.test(value.blockNumber) && /^\d+$/.test(value.timestamp) && /^0x[0-9a-f]{64}$/.test(value.blockHash));
  return Object.freeze(value);
}
export async function readOwnedBscFinalizedHeadV1(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return readFinalizedHead(runtime, PROFILE);
}
export async function readOwnedBscFinalizedHeadV2(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return readFinalizedHead(runtime, PROFILE_V2);
}
// The same native anti-resend latch is used by both distinct generations.
async function sendSignedTransactionOnce(runtime, signedWire, profile) {
  runtimeProfile(runtime, profile);
  assert(typeof signedWire === 'string' && /^0x[0-9a-f]+$/.test(signedWire) && signedWire.length % 2 === 0 && signedWire.length <= 260000);
  const transactionHash = await command(runtime, 'broadcast', signedWire);
  assert(/^0x[0-9a-f]{64}$/.test(transactionHash)); return transactionHash;
}
export async function sendOwnedBscSignedTransactionOnceV1(runtime, signedWire) {
  assert.equal(arguments.length, 2, 'BSC_SIGNED_WIRE_ONLY');
  return sendSignedTransactionOnce(runtime, signedWire, PROFILE);
}
export async function sendOwnedBscSignedTransactionOnceV2(runtime, signedWire) {
  assert.equal(arguments.length, 2, 'BSC_SIGNED_WIRE_ONLY');
  return sendSignedTransactionOnce(runtime, signedWire, PROFILE_V2);
}

// A distinct original birth: its genesis already contains original validator
// registrations. The native client still establishes actual finality itself.
export async function createOwnedBscPoSAClusterV3() {
  assert.equal(arguments.length, 0, 'BSC_NO_OPTIONS');
  return createFixedOwnedBscPoSACluster(PROFILE_V3, 'NATIVE_INIT_V3');
}
export function assertOwnedBscPoSAClusterV3(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return runtimeProfile(runtime, PROFILE_V3);
}
export async function readOwnedBscFinalizedHeadV3(runtime) {
  assert.equal(arguments.length, 1, 'BSC_RUNTIME_ONLY');
  return readFinalizedHead(runtime, PROFILE_V3);
}
export async function sendOwnedBscSignedTransactionOnceV3(runtime, signedWire) {
  assert.equal(arguments.length, 2, 'BSC_SIGNED_WIRE_ONLY');
  return sendSignedTransactionOnce(runtime, signedWire, PROFILE_V3);
}

/** Zero-option own-client birth. Custody and physical source capsule precede native CREATE/funds. */
export async function createOwnedBscPoSANativeValueClusterV3(){assert.equal(arguments.length,0,'BSC_NO_OPTIONS');return createFixedOwnedBscPoSACluster(NATIVE_VALUE_PROFILE_V3,'NATIVE_VALUE_V3');}
export function isOwnedBscPoSANativeValueClusterV3(runtime){assert.equal(arguments.length,1);return nativeValues.has(runtime);}
export function assertOwnedBscPoSANativeValueLiveV3(runtime){assert.equal(arguments.length,1);assert(nativeValues.has(runtime),'BSC_ORIGINAL_ECONOMIC_PROFILE_REQUIRED');live(runtime);}
export function assertOwnedBscPoSANativeValueCustodyV3(runtime,custody){assert.equal(arguments.length,2);assertOwnedBscPoSANativeValueLiveV3(runtime);assert.equal(live(runtime).custody,custody,'BSC_ORIGINAL_CUSTODY_PAIR');}
export async function readOwnedBscPoSANativeValueIdentityV3(runtime){assert.equal(arguments.length,1);assertOwnedBscPoSANativeValueLiveV3(runtime);const value=await command(runtime,'identity',null);assertOwnedBscPoSANativeValueLiveV3(runtime);
 assert.equal(value.profile,NATIVE_VALUE_PROFILE_V3);assert.equal(value.chainId,'714');assert.equal(value.validatorCount,3);for(const name of ['genesis','genesisSHA256','clientSHA256'])assert(/^[0-9a-f]{64}$/.test(value[name]));assert.equal(value.publicNetwork,false);assert.equal(value.independentInfrastructureEstablished,false);
 const state=live(runtime),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');return Object.freeze({...value,identity:Object.freeze({endpointIdentity:hash({profile:state.profile,backend:state.identity,validators:state.validators}),clientRelease:hash({clientSHA256:value.clientSHA256}),chainConfiguration:hash({profile:state.profile,chainId:value.chainId,genesis:value.genesis,genesisSHA256:value.genesisSHA256})})});}
export async function readOwnedBscPoSANativeValueRpcV3(runtime,method,params){assert.equal(arguments.length,3);assertOwnedBscPoSANativeValueLiveV3(runtime);const value=await command(runtime,'read',originalReadInput(method,params));assertOwnedBscPoSANativeValueLiveV3(runtime);return value;}
export async function sendOwnedBscNativeValueSignedTransactionOnceV3(runtime,wire){assert.equal(arguments.length,2);assertOwnedBscPoSANativeValueLiveV3(runtime);const state=live(runtime);assert.equal(state.uncertain,false,'BSC_ORIGINAL_UNKNOWN_NO_FRESH_SEND');assert(typeof wire==='string'&&/^0x(?:[0-9a-f]{2}){1,65536}$/.test(wire),'BSC_SIGNED_TRANSACTION');return command(runtime,'broadcast',wire);}
export function readOwnedBscPoSANativeValueSourceProfileV3(runtime){assert.equal(arguments.length,1);assertOwnedBscPoSANativeValueLiveV3(runtime);return readOriginalOwnedBscSourceProfileV3(live(runtime).sourceProfile);}
