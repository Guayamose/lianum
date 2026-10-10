import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { legacyDataRoot } from '@lianum/environment';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

// Existing consumers use this name for retained binaries, scratch and evidence.
// Keep that data location explicit when the module executes from packages/.
export const projectRoot = legacyDataRoot('engine');
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

// BEGIN PRIVATE ORIGINAL LOCAL RPC FAILURE DATA. No logging or request capture.
const originalOwnedRpcFailures = new WeakMap();
const rpcOwnData=(value,key)=>{try{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
function boundedRpcText(value){
 if(typeof value!=='string')return Object.freeze({text:null,bytes:null,sha256:null,omitted:true});
 const bytes=Buffer.byteLength(value),sha256=createHash('sha256').update(value).digest('hex');
 // Local server diagnostic text only. Omit oversized/control-bearing messages
 // and serialized payloads, long secret-like encodings or credential labels.
 const safe=bytes<=1024&&!/[\x00-\x08\x0b-\x1f\x7f{}]/.test(value)&&!/(?:0x)?[0-9a-fA-F]{64,}|[A-Za-z0-9+/=_-]{96,}|(?:private[ _-]?key|password|mnemonic|secret|authorization|witness|signed[ _-]?(?:wire|transaction))\s*[:=]|https?:\/\//i.test(value);
 return Object.freeze({text:safe?value:null,bytes,sha256,omitted:!safe});
}
function boundedRpcRevert(value){
 const out={selector:null,bytes:null,sha256:null,reason:null,panicCode:null,argumentsRetained:false};
 if(typeof value!=='string'||!/^0x(?:[0-9a-fA-F]{2})*$/.test(value))return Object.freeze(out);
 out.bytes=(value.length-2)/2;out.sha256=createHash('sha256').update(value).digest('hex');
 if(value.length>=10)out.selector=value.slice(0,10).toLowerCase();
 // Decode only standard Error(string) and Panic(uint256); never retain raw data
 // or unknown custom-error argument words.
 if(value.length<=2058&&/^0x08c379a0/i.test(value)&&value.length>=138){try{
  const raw=Buffer.from(value.slice(10),'hex'),offset=BigInt('0x'+raw.subarray(0,32).toString('hex'));
  if(offset===32n){const length=BigInt('0x'+raw.subarray(32,64).toString('hex'));
   if(length<=512n&&raw.length===64+Math.ceil(Number(length)/32)*32&&raw.subarray(64+Number(length)).every(x=>x===0)){
    out.reason=boundedRpcText(new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(64,64+Number(length))));
   }
  }
 }catch{}}
 if(/^0x4e487b71[0-9a-fA-F]{64}$/.test(value)){const n=BigInt('0x'+value.slice(10));if([0n,1n,0x11n,0x12n,0x21n,0x22n,0x31n,0x32n,0x41n,0x51n].includes(n))out.panicCode='0x'+n.toString(16);}
 return Object.freeze(out);
}
function retainOriginalOwnedRpcFailure(error,method,remote){
 try{const code=rpcOwnData(remote,'code'),data=rpcOwnData(remote,'data'),record=Object.freeze({schema:'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1',
  method:typeof method==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(method)?method:null,
  rpcCode:Number.isInteger(code)&&code>=-32768&&code<=32768?code:null,
  message:boundedRpcText(rpcOwnData(remote,'message')),revert:boundedRpcRevert(data),
  nestedDataShapeOmitted:data!==undefined&&typeof data!=='string',requestOrParametersRetained:false,rawDataRetained:false});
  originalOwnedRpcFailures.set(error,record);
 }catch{originalOwnedRpcFailures.set(error,Object.freeze({schema:'ORIGINAL_OWNED_LOOPBACK_RPC_FAILURE_V1',projectionFailed:true,requestOrParametersRetained:false,rawDataRetained:false}));}
}
export function originalOwnedRuntimeRpcFailureV1(error){
 if(arguments.length!==1)throw new Error('OWNED_RPC_FAILURE_DATA_ARGUMENTS');
 return error&&(typeof error==='object'||typeof error==='function')?originalOwnedRpcFailures.get(error)??null:null;
}
// END PRIVATE ORIGINAL LOCAL RPC FAILURE DATA.

// Harness-only writes go exclusively to a just-spawned runtime port. This is
// intentionally separate from the exported read-only application transport.
export async function ownedRuntimeRpc(endpoint, method, params = [], { timeoutMs = 3000 } = {}) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint)) throw new Error('OWNED_RPC_REQUIRES_LOOPBACK');
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error('OWNED_RPC_HTTP_ERROR');
  const value = await response.json();
  if (value.error) { const e = new Error('OWNED_RPC_REMOTE_ERROR'); e.rpcCode = value.error.code; retainOriginalOwnedRpcFailure(e,method,value.error); throw e; }
  return value.result;
}
