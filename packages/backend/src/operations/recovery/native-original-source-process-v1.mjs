/** Linux-only SOURCE process birth. The kernel signals this exact child when
 * its original parent dies; legacy runtime processes do not use this helper. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {readFile,readlink,realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {performance} from 'node:perf_hooks';
import {types} from 'node:util';
import {isolatedRuntimeEnvironment,stopOwnProcess,sleep} from '@lianum/engine/chains/shared/owned-process-lifecycle';

/** @typedef {Readonly<{pid: number, startTicks: string}>} ProcessBirth */
/** @typedef {Readonly<{schema: 'ORIGINAL_NATIVE_SOURCE_PARENT_DEATH_GUARD_V1', parent: ProcessBirth,
 * child: ProcessBirth, parentDeathSignal: 'SIGTERM', samePidAfterExec: true}>} NativeSourceProcessGuard */
/** @typedef {Readonly<{child: import('node:child_process').ChildProcessByStdio<null, null, import('node:stream').Readable>,
 * assertAlive(): void, diagnostic(): string}>} NativeSourceProcessHandle */
/** @type {WeakMap<object, NativeSourceProcessGuard>} */
const guards=new WeakMap();
const startupMilliseconds=5000;
// -I -S prevents caller modules/site hooks. No shell, process-group selection,
// RPC or financial input is used. execv preserves the child PID and birth.
const guardian=String.raw`import ctypes, os, signal, sys
def fail(code):
    os.write(2, (code + '\n').encode('ascii'))
    os._exit(126)
def original_parent(expected_pid, expected_birth):
    if os.getppid() != expected_pid:
        fail('NATIVE_SOURCE_ORIGINAL_PARENT_CHANGED')
    try:
        with open('/proc/%d/stat' % expected_pid, 'rb') as source:
            raw = source.read(4097)
        end = raw.rfind(b')')
        fields = raw[end + 1:].split()
        if len(raw) > 4096 or end < 0 or raw[:raw.find(b' ')] != str(expected_pid).encode('ascii') or len(fields) < 20 or fields[19] != expected_birth.encode('ascii'):
            fail('NATIVE_SOURCE_ORIGINAL_PARENT_CHANGED')
    except OSError:
        fail('NATIVE_SOURCE_ORIGINAL_PARENT_UNAVAILABLE')
try:
    if len(sys.argv) < 4:
        fail('NATIVE_SOURCE_GUARDIAN_ARGUMENTS')
    expected_pid = int(sys.argv[1])
    expected_birth = sys.argv[2]
    if expected_pid < 1 or not expected_birth.isdecimal() or int(expected_birth) < 1:
        fail('NATIVE_SOURCE_GUARDIAN_ARGUMENTS')
    original_parent(expected_pid, expected_birth)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0:
        fail('NATIVE_SOURCE_PARENT_DEATH_GUARD_FAILED')
    original_parent(expected_pid, expected_birth)
    os.execv(sys.argv[3], sys.argv[3:])
except BaseException:
    fail('NATIVE_SOURCE_GUARDIAN_EXEC_FAILED')
`;

/** @param {unknown} raw @param {number} pid @returns {string} */
function birth(raw,pid){
  assert.ok(typeof raw==='string'&&Buffer.byteLength(raw)<=4096,'NATIVE_SOURCE_PROCESS_STAT');
  const end=raw.lastIndexOf(')'),fields=raw.slice(end+1).trim().split(/\s+/);
  assert.ok(end>0&&raw.slice(0,raw.indexOf(' '))===String(pid)&&fields.length>=20&&/^[1-9][0-9]*$/.test(fields[19]),'NATIVE_SOURCE_PROCESS_STAT');
  return fields[19];
}
/** @param {unknown} binary @param {unknown} args @param {unknown} cwd
 * @returns {{binary: string, args: string[], cwd: string}} */
function argumentsSnapshot(binary,args,cwd){
  assert.ok(typeof binary==='string'&&isAbsolute(binary)&&binary.length<=4096&&!binary.includes('\0'),'NATIVE_SOURCE_FIXED_EXECUTABLE_REQUIRED');
  assert.ok(typeof cwd==='string'&&isAbsolute(cwd)&&cwd.length<=4096&&!cwd.includes('\0'),'NATIVE_SOURCE_ORIGINAL_DIRECTORY_REQUIRED');
  assert.ok(!types.isProxy(args)&&Array.isArray(args)&&Object.getPrototypeOf(args)===Array.prototype&&args.length<=64,'NATIVE_SOURCE_FIXED_ARGUMENTS_REQUIRED');
  assert.deepEqual(Reflect.ownKeys(args),[...Array.from({length:args.length},(_,i)=>String(i)),'length'],'NATIVE_SOURCE_FIXED_ARGUMENTS_REQUIRED');
  const argv=Array.from({length:args.length},(_,i)=>{
    const d=Object.getOwnPropertyDescriptor(args,String(i));assert.ok(d&&Object.hasOwn(d,'value'),'NATIVE_SOURCE_FIXED_ARGUMENTS_REQUIRED');
    /** @type {unknown} */const value=d.value;
    assert.ok(typeof value==='string'&&value.length<=8192&&!value.includes('\0'),'NATIVE_SOURCE_FIXED_ARGUMENTS_REQUIRED');return value;
  });
  return{binary,args:argv,cwd};
}

/** @param {unknown} binary @param {unknown} args @param {unknown} cwd
 * @returns {Promise<NativeSourceProcessHandle>} */
export async function startOriginalNativeSourceProcessV1(binary,args,cwd){
  assert.equal(arguments.length,3,'NATIVE_SOURCE_PROCESS_ARITY');
  assert.equal(process.platform,'linux','NATIVE_SOURCE_PARENT_DEATH_LINUX_REQUIRED');
  const snapshot=argumentsSnapshot(binary,args,cwd),expected=await realpath(snapshot.binary);
  const parent=Object.freeze({pid:process.pid,startTicks:birth(readFileSync('/proc/self/stat','utf8'),process.pid)});
  const child=spawn('/usr/bin/python3',['-I','-S','-c',guardian,String(parent.pid),parent.startTicks,snapshot.binary,...snapshot.args],
    {cwd:snapshot.cwd,windowsHide:true,env:isolatedRuntimeEnvironment(snapshot.cwd),stdio:['ignore','ignore','pipe']});
  /** @type {Error | null} */let startupError=null;let stderr='';
  child.on('error',error=>{startupError=error;});
  child.stderr.on('data',/** @param {unknown} chunk */chunk=>{if((Buffer.isBuffer(chunk)||typeof chunk==='string')&&stderr.length<8192)stderr+=chunk.toString().slice(0,8192-stderr.length);});
  const handle=Object.freeze({child,assertAlive(){if(startupError||child.exitCode!==null||child.signalCode!==null)throw new Error('LOCAL_RUNTIME_EXITED');},diagnostic(){return stderr;}});
  try{
    const pid=child.pid;assert.ok(typeof pid==='number'&&Number.isSafeInteger(pid)&&pid>0,'NATIVE_SOURCE_OWNED_CHILD_REQUIRED');
    const start=performance.now();let originalBirth=null;
    for(;;){
      handle.assertAlive();
      try{
        const observed=birth(await readFile('/proc/'+pid+'/stat','utf8'),pid);
        originalBirth??=observed;assert.equal(observed,originalBirth,'NATIVE_SOURCE_OWNED_CHILD_CHANGED');
        if(await readlink('/proc/'+pid+'/exe')===expected){
          handle.assertAlive();assert.equal(birth(await readFile('/proc/'+pid+'/stat','utf8'),pid),originalBirth,'NATIVE_SOURCE_OWNED_CHILD_CHANGED');
          guards.set(handle,Object.freeze({schema:'ORIGINAL_NATIVE_SOURCE_PARENT_DEATH_GUARD_V1',parent,child:Object.freeze({pid,startTicks:originalBirth}),parentDeathSignal:'SIGTERM',samePidAfterExec:true}));
          return handle;
        }
      }catch(error){if(error===null||typeof error!=='object'||!('code' in error)||typeof error.code!=='string'||!['ENOENT','ESRCH'].includes(error.code))throw error;handle.assertAlive();}
      assert.ok(performance.now()-start<startupMilliseconds,'NATIVE_SOURCE_GUARDIAN_EXEC_TIMEOUT');await sleep(10);
    }
  }catch(error){try{await stopOwnProcess(handle);}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_GUARDIAN_START_FAILED',{cause:error});}throw error;}
}

/** Safe lifecycle evidence from this original handle, never a PID selector.
 * @param {unknown} handle @returns {NativeSourceProcessGuard} */
export function readOriginalNativeSourceProcessGuardV1(handle){
  assert.equal(arguments.length,1,'NATIVE_SOURCE_PROCESS_GUARD_ARITY');
  assert.ok(handle!==null&&(typeof handle==='object'||typeof handle==='function'),'NATIVE_SOURCE_ORIGINAL_PROCESS_GUARD_REQUIRED');
  const value=guards.get(handle);
  assert.ok(value,'NATIVE_SOURCE_ORIGINAL_PROCESS_GUARD_REQUIRED');return value;
}
