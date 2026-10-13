/** Owns one canonical backend child at a time. Replies are observations/data;
 * no runtime, proof result, signing key or dispatch grant crosses IPC. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const entry = fileURLToPath(new URL('./device-paged-backend-process-v3.mjs', import.meta.url));
const owned = new WeakMap();
function stateBoundData(raw){
 if(raw===null||raw===undefined)return null;
 const legacy=raw.schema==='OWNED_EVM_RECOVERY_STATE_BOUND_DIAGNOSTIC_V1';assert.ok(legacy||raw.schema==='OWNED_PAGED_HUB_EVM_STATE_BOUND_DIAGNOSTIC_V3');
 const numbers=legacy?['characterLength','maximumCharacters','gzipHeaderFlags','gzipFooterISizeHintBytes']:['characterLength','encodedBytes','maximumEncodedBytes','metadataBytes','maximumMetadataBytes','recordBytes','maximumRecordBytes','decodedBytes','maximumDecodedBytes'];
 const flags=legacy?['withinCharacterBound','hexPrefix','positiveEvenByteLength','lowerHexEncoding','gzipHeaderMagicAndMethod','gzipHeaderReservedBitsClear','gzipFooterISizeHintWithinDecodedBound','gzipFooterHintOnly','gzipFooterHintAuthenticated','gzipFooterISizeHintModulo2Pow32']:['withinEncodedBound','hexPrefix','positiveEvenByteLength','lowerHexEncoding','gzipHeaderMagicAndMethod'];
 const value=P.pagedOwnerExactV3(raw,['schema','type',...numbers,...flags]);assert.ok(['NULL','STRING','UNDEFINED','BOOLEAN','NUMBER','BIGINT','SYMBOL','FUNCTION','OBJECT'].includes(value.type));for(const key of numbers)assert.ok(value[key]===null||Number.isSafeInteger(value[key])&&value[key]>=0&&value[key]<=0xffffffff);for(const key of flags)assert.ok(value[key]===null||typeof value[key]==='boolean');
 if(legacy){assert.equal(value.maximumCharacters,32*1024*1024);assert.equal(value.gzipFooterHintOnly,true);assert.equal(value.gzipFooterHintAuthenticated,false);assert.equal(value.gzipFooterISizeHintModulo2Pow32,true);}else{assert.equal(value.maximumEncodedBytes,48*1024*1024);assert.equal(value.maximumMetadataBytes,16*1024*1024);assert.equal(value.maximumRecordBytes,64*1024*1024);assert.equal(value.maximumDecodedBytes,128*1024*1024);}
 return Object.freeze({...value});
}
function errorFrom(frame) {
  P.pagedOwnerExactV3(frame, ['type', 'id', 'error']); assert.equal(frame.type, 'failed');
  const value = P.pagedOwnerExactV3(frame.error, ['name', 'code', 'frames', ...(Object.hasOwn(frame.error ?? {}, 'rpcCode') ? ['rpcCode'] : []),...(Object.hasOwn(frame.error ?? {}, 'stateBound')?['stateBound']:[])]);
  const names = new Set(['Error', 'AssertionError', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError', 'AggregateError']);
  assert.ok(value.code === null || typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{3,100}$/.test(value.code));
  assert.ok(Array.isArray(value.frames) && value.frames.length <= 6);
  assert.ok(value.rpcCode === undefined || value.rpcCode === null || typeof value.rpcCode === 'string' && /^-?\d{1,8}$/.test(value.rpcCode));
  const originalFailure = Object.freeze({ name: names.has(value.name) ? value.name : 'Error', code: value.code, rpcCode: value.rpcCode ?? null,stateBound:stateBoundData(value.stateBound),
    frames: Object.freeze(value.frames.filter(row => typeof row === 'string' && row.length <= 2048
      && /^at (?:[A-Za-z0-9_.$<>[\] -]+ \()?((?:file:\/\/)?\/[A-Za-z0-9_./-]+\.(?:mjs|cjs|js|ts)):[1-9][0-9]{0,8}:[1-9][0-9]{0,8}\)?$/.test(row))) });
  const error = Error('PAGED_BACKEND_PROCESS_FAILED');
  Object.defineProperty(error, 'originalFailure', { value: originalFailure }); return error;
}
async function processTree(pid) {
  const rows = [];
  async function visit(current) {
    let stat;
    try { stat = await readFile('/proc/' + current + '/stat', 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    rows.push({ pid: current, startTicks: fields[19] });
    let children;try{children=await readFile(`/proc/${current}/task/${current}/children`, 'utf8');}catch(error){if(error.code==='ENOENT')return;throw error;}
    for (const next of children.trim().split(/\s+/).filter(Boolean)) await visit(Number(next));
  }
  await visit(pid); return rows;
}
async function originalProcessStopped(row) {
  try {
    const stat = await readFile('/proc/' + row.pid + '/stat', 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] !== row.startTicks;
  } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
async function launch(path, reopening) {
  assert.equal(await realpath(entry), entry);
  const child = spawn(process.execPath, ['--max-old-space-size=384', entry, reopening ? 'reopen' : 'new', path],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json',
      env: { ...process.env, NODE_OPTIONS: undefined, NODE_PATH: undefined } });
  let sequence = 0, waiting = null, ready = null, closed = false, failed = false;
  const exited = new Promise(resolve => child.once('close', (code, signal) => {
    closed = true; ready?.reject(Error('PAGED_BACKEND_PROCESS_CLOSED')); if (waiting) { clearTimeout(waiting.timer); waiting.reject(Error('PAGED_BACKEND_PROCESS_CLOSED')); waiting = null; }
    resolve({ code, signal });
  }));
  const initial = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('PAGED_BACKEND_PROCESS_START_TIMEOUT')), 600000);
    ready = { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
  });
  const stopForFailure = error => {
    failed = true; ready?.reject(error);
    if (waiting) { clearTimeout(waiting.timer); waiting.reject(error); waiting = null; }
    if (!closed && child.signalCode === null && child.exitCode === null) child.kill('SIGTERM');
  };
  child.stdout.on('data', () => stopForFailure(Error('PAGED_BACKEND_PROCESS_STDOUT')));
  child.stderr.on('data', () => stopForFailure(Error('PAGED_BACKEND_PROCESS_STDERR')));
  child.once('error', stopForFailure);
  child.on('message', frame => {
    try {
      assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 256 * 1024);
      if (frame.type === 'failed') { stopForFailure(errorFrom(frame)); return; }
      if (frame.type === 'ready') { P.pagedOwnerExactV3(frame, ['type', 'value']); assert.ok(ready); ready.resolve(frame.value); ready = null; return; }
      P.pagedOwnerExactV3(frame, ['type', 'id', 'value']); assert.equal(frame.type, 'reply');
      assert.ok(waiting && waiting.id === frame.id); clearTimeout(waiting.timer);
      const original = waiting; waiting = null; original.resolve(frame.value);
    } catch (error) { stopForFailure(error); }
  });
  function request(method, args, timeout = 15000) {
    assert.ok(!closed && !failed && !waiting && child.connected);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stopForFailure(Error('PAGED_BACKEND_CONTROL_TIMEOUT')), timeout);
      waiting = { id, resolve, reject, timer };
      child.send({ type: 'control', id, method, args }, error => { if (error) stopForFailure(error); });
    });
  }
  try {
    const data = await initial;
    assert.equal(data.profile, 'ORIGINAL_PAGED_BACKEND_PROCESS_V3'); assert.equal(data.pid, child.pid);
    assert.equal(data.reopenedOriginalState, reopening); P.normalizeDevicePagedDescriptorV3(data.descriptor);
    return { child, data: structuredClone(data), request, exited, tree: () => processTree(child.pid),
      async close() { if (!closed && !failed) await request('close', [], 300000); const result = await exited;
        assert.deepEqual(result, { code: 0, signal: null }, 'PAGED_BACKEND_ORDERLY_EXIT'); return result; } };
  } catch (error) {
    stopForFailure(error); await exited; throw error;
  }
}
export async function openOriginalPagedBackendProcessV3(path) {
  assert.equal(arguments.length, 1); let current = await launch(path, false), closing, restartWork = null, stopping = false;
  const history = [], descriptor = structuredClone(current.data.descriptor);
  const backend = Object.freeze({
    profile: 'ORIGINAL_PAGED_BACKEND_PROCESS_CLIENT_V3', descriptor,
    data() { assert.ok(!stopping && !restartWork); return structuredClone(current.data); },
    query(method, args = []) { assert.ok(!stopping && !restartWork); return current.request('query', [{ method, args }]); },
    restart() {
      assert.ok(!stopping); if (restartWork) return restartWork;
      const operation = (async () => {
      const before = current, originalTree = await before.tree();
      const captured = await before.request('capture', [], 300000);
      assert.ok(captured.closed && captured.originalResourcesStopped);
      assert.deepEqual(await before.exited, { code: 0, signal: null });
      for (const process of originalTree) assert.equal(await originalProcessStopped(process), true, 'PAGED_BACKEND_OLD_PROCESS_REMAINED');
      assert.ok(!stopping, 'PAGED_BACKEND_RESTART_CANCELLED');
      // close() drains this exact acquisition before closing its result.
      current = await launch(path, true); assert.ok(!stopping, 'PAGED_BACKEND_RESTART_CANCELLED');
      assert.notEqual(current.child.pid, before.child.pid);
      assert.deepEqual(current.data.descriptor, descriptor, 'PAGED_BACKEND_SAME_WALLET');
      assert.deepEqual(current.data.providerConfiguration, before.data.providerConfiguration, 'PAGED_BACKEND_SAME_PROVIDER_CONFIGURATION');
      assert.equal(current.data.runtimeIdentities.receiverGenesis, before.data.runtimeIdentities.receiverGenesis);
      assert.equal(current.data.runtimeIdentities.nativeEvmGenesis, before.data.runtimeIdentities.nativeEvmGenesis);
      const evidence = Object.freeze({ oldBackendPID: before.child.pid, newBackendPID: current.child.pid,
        oldOwnedProcessesStopped: originalTree.length, sameDescriptor: true, sameProviderConfiguration: true,
        sameLedgers: true, newBackendProcess: true }); history.push(evidence); return evidence;
      })();
      restartWork = operation;
      operation.finally(() => { if (restartWork === operation) restartWork = null; }).catch(() => {});
      return operation;
    },
    history() { return structuredClone(history); },
    close() {
      if (closing) return closing; stopping = true;
      return closing = (async () => { await restartWork?.catch(() => {}); return current.close(); })();
    },
  });
  owned.set(backend, { path }); return backend;
}
export function assertOriginalPagedBackendProcessV3(backend) {
  assert.equal(arguments.length, 1); assert.ok(owned.has(backend), 'PAGED_BACKEND_ORIGINAL_CLIENT'); return backend;
}
