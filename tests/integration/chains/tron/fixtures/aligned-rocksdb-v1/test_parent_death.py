"""Real original-inventory kernel/capture probes; no Java, compiler or node.

The child is a disposable Python marker fixture, never a financial runtime.
This test is prepared for a later approved host window, not run by import.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE = Path(__file__).resolve().parent
CHILD = r'''import ctypes,importlib.util,json,os,signal,sys,time
from pathlib import Path
source=Path(sys.argv[1])
spec=importlib.util.spec_from_file_location('probe_fixed_child_guard',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.install_child_guards(os.getppid(),module.load_builder())
def write(name,value):
    with open(name,'x') as handle:
        json.dump(value,handle);handle.flush();os.fsync(handle.fileno())
def stop(signum,_):
    write('terminated.json',{'pid':os.getpid(),'signal':signum});os._exit(0)
signal.signal(signal.SIGTERM,stop)
value=ctypes.c_int()
if ctypes.CDLL(None,use_errno=True).prctl(2,ctypes.byref(value),0,0,0)!=0:raise RuntimeError('READ_PDEATH_FAILED')
fields=Path('/proc/self/stat').read_text().rsplit(') ',1)[1].split()
uids=[int(x) for x in next(x for x in Path('/proc/self/status').read_text().splitlines() if x.startswith('Uid:')).split()[1:]]
write('ready.json',{'pid':os.getpid(),'parent':os.getppid(),'start':fields[19],'uid':os.getuid(),'uids':uids,'deathSignal':value.value})
while True:time.sleep(1)
'''
PARENT = r'''import importlib.util,os,sys,time
from pathlib import Path
source,directory=Path(sys.argv[1]),Path(sys.argv[2])
spec=importlib.util.spec_from_file_location('reviewed_compiler_guard',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
inventory=module.load_owned_processes().LedgerOwnedProcesses();inventory.activate()
child=inventory.spawn([sys.executable,str(directory/'child.py'),str(source.parent/'compile-child.py')],cwd=directory,env={'LANG':'C.UTF-8'})
while child.poll() is None:time.sleep(.05)
sys.exit(child.returncode)
'''
CAPTURE_PARENT = r'''import importlib.util,json,os,sys
from pathlib import Path
source,mode,out=Path(sys.argv[1]),sys.argv[2],Path(sys.argv[3])
spec=importlib.util.spec_from_file_location('probe_real_capture',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.DESTINATION.mkdir(mode=0o700,parents=True)
module.LOCK_DIRECTORY.mkdir(mode=0o700,parents=True)
lock=module.LOCK_DIRECTORY/'active.lock'
lock.write_text(json.dumps({'pid':os.getpid(),'fixedAlignedCandidateCompiler':True}));lock.chmod(0o600)
owned=module.load_owned_processes()
def broken_retain(self,*args,**kwargs):
    if mode=='raise':raise RuntimeError('LEDGER_PROCESS_ENROLL_IDENTITY_CHANGED')
owned.LedgerOwnedProcesses._retain=broken_retain
module.load_owned_processes=lambda:owned
report={}
try:
    module.compile_owned(report)
    report['unexpectedAccepted']=True
except Exception as error:
    report['rejected']=str(error)
child=module.active
report['originalPopenExitCode']=None if child is None else child.poll()
report['originalPopenAbsent']=child is not None and not Path('/proc',str(child.pid)).exists()
out.write_text(json.dumps(report))
'''

DELAYED_READER = r'''import importlib.util,json,os,sys,time
from pathlib import Path
source,directory=Path(sys.argv[1]),Path(sys.argv[2])
spec=importlib.util.spec_from_file_location('probe_delayed_reader',source)
child=importlib.util.module_from_spec(spec);spec.loader.exec_module(child)
module=child.load_builder();module.DESTINATION=directory
original=module.load_owned_processes().identity(os.getpid())
time.sleep(.2)
original_fsync=child.os.fsync
def delayed_publish(fd):
    time.sleep(.15);original_fsync(fd)
child.os.fsync=delayed_publish
fd=child.open_startup_reader(module,original)
try:child.wait_startup(fd,time.monotonic()+2)
finally:os.close(fd)
(directory/'accepted-framing.json').write_text(json.dumps({'pid':os.getpid(),'grantAndEOFObserved':True}))
'''

TERMINAL_EXECUTABLE_PROBE = r'''import importlib.util,json,os,sys
from pathlib import Path
source,directory=Path(sys.argv[1]),Path(sys.argv[2])
spec=importlib.util.spec_from_file_location('probe_terminal_executable',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
inventory=module.load_owned_processes().LedgerOwnedProcesses();inventory.activate()
inventory.constrain_wait_deadline(module.time.monotonic()+5)
child=None
try:
    child=inventory.spawn([str(module.PYTHON),'-c',
        "import time,sys; from pathlib import Path; end=time.monotonic()+3\nwhile not Path('exit-request').exists() and time.monotonic()<end:time.sleep(.005)\nsys.exit(0 if Path('exit-request').exists() else 124)"],
        cwd=directory,env={'LANG':'C.UTF-8'})
    sampled=next(row for row in inventory.scan() if row['pid']==child.pid)
    assert inventory.records[child.pid]['pidfd'] is not None and child.poll() is None
    original_reader=module.process_executable
    def missing(_pid):raise FileNotFoundError(2,'synthetic disappearing executable while genuine child is alive')
    module.process_executable=missing
    try:module.checked_compiler_executable(inventory,sampled)
    except RuntimeError as error:assert str(error)=='TRON_ALIGNED_COMPILER_EXECUTABLE_DISAPPEARED_WHILE_LIVE'
    else:raise AssertionError('Live disappearance accepted')
    module.process_executable=original_reader
    (directory/'exit-request').touch(exist_ok=False)
    assert child.wait(timeout=2)==0
    try:original_reader(child.pid)
    except FileNotFoundError:pass
    else:raise AssertionError('Old executable read did not reproduce /proc exit race')
    assert module.checked_compiler_executable(inventory,sampled) is None
    assert inventory.records[child.pid]['gone'] and not inventory.unsafe
    assert inventory.finish()
    assert not Path('/proc',str(child.pid)).exists()
    print(json.dumps({'exitCode':child.returncode,'oldReadRejected':True,'terminalReadConfirmed':True,
                      'liveDisappearanceRejected':True,'originalChildAbsent':True,'cleanupConfirmed':True}))
finally:
    if child is not None and child.poll() is None:
        inventory.signal_retained(module.signal.SIGTERM);child.wait(timeout=2)
    if inventory.active:inventory.finish()
    if child is not None:child.stdout.close();child.stderr.close()
'''


def alive(row):
    base = Path('/proc', str(row['pid']))
    try:
        owner = base.stat().st_uid
        fields = (base / 'stat').read_text().rsplit(') ', 1)[1].split()
        if fields[19] != row['start']:
            raise AssertionError('Probe PID reused')
        uids = [int(x) for x in next(x for x in (base / 'status').read_text().splitlines() if x.startswith('Uid:')).split()[1:]]
        if uids != row['uids'] or not (owner == row['uid'] or owner == 0 and fields[0] in ('Z', 'X')):
            raise AssertionError('Probe UID4 or proc owner changed')
        return fields[0] not in ('Z', 'X')
    except FileNotFoundError:
        return False


class KernelParentDeath(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'linux' and os.uname().machine == 'x86_64', 'Linux original pidfd probe')
    def test_exit_between_original_scan_and_executable_lookup_is_confirmed_by_original_popen_pidfd(self):
        with tempfile.TemporaryDirectory(prefix='tron-aligned-terminal-exe-') as temporary:
            directory = Path(temporary); directory.chmod(0o700)
            parent = subprocess.Popen([sys.executable, '-B', '-c', TERMINAL_EXECUTABLE_PROBE, str(HERE / 'build.py'), str(directory)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                stdout, stderr = parent.communicate(timeout=8)
                self.assertEqual(parent.returncode, 0, stderr.decode())
                self.assertEqual(json.loads(stdout), {'exitCode': 0, 'oldReadRejected': True, 'terminalReadConfirmed': True,
                    'liveDisappearanceRejected': True, 'originalChildAbsent': True, 'cleanupConfirmed': True})
            finally:
                if parent.poll() is None: parent.kill(); parent.wait(timeout=2)
                parent.stdout.close(); parent.stderr.close()

    @unittest.skipUnless(sys.platform == 'linux' and os.uname().machine == 'x86_64', 'Linux x64 prctl/seccomp probe')
    def test_original_pdeathsig_and_real_failed_birth_capture_cannot_authorize_a_compiler(self):
        ready = None
        with tempfile.TemporaryDirectory(prefix='tron-aligned-kernel-probe-') as temporary:
            directory = Path(temporary); directory.chmod(0o700)
            (directory / 'child.py').write_text(CHILD)
            parent = subprocess.Popen([sys.executable, '-c', PARENT, str(HERE / 'build.py'), str(directory)],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                while not (directory / 'ready.json').exists() and time.monotonic() < deadline:
                    self.assertIsNone(parent.poll(), 'Guard probe parent failed before ready'); time.sleep(.01)
                self.assertTrue((directory / 'ready.json').exists())
                ready = json.loads((directory / 'ready.json').read_text())
                self.assertEqual(ready['parent'], parent.pid); self.assertEqual(ready['uid'], os.getuid())
                self.assertEqual(ready['uids'], [os.getuid()] * 4)
                self.assertEqual(ready['deathSignal'], signal.SIGTERM)
                self.assertEqual(Path('/proc', str(ready['pid']), 'exe').resolve(), Path(sys.executable).resolve())
                self.assertTrue(alive(ready))
                parent.kill(); self.assertEqual(parent.wait(timeout=5), -signal.SIGKILL)
                deadline = time.monotonic() + 5
                while not (directory / 'terminated.json').exists() and time.monotonic() < deadline: time.sleep(.01)
                self.assertEqual(json.loads((directory / 'terminated.json').read_text()), {'pid': ready['pid'], 'signal': signal.SIGTERM})
                deadline = time.monotonic() + 5
                while alive(ready) and time.monotonic() < deadline: time.sleep(.01)
                self.assertFalse(alive(ready))
            finally:
                if parent.poll() is None: parent.kill(); parent.wait(timeout=5)
                if ready is not None and alive(ready):
                    self.assertEqual(Path('/proc', str(ready['pid']), 'exe').resolve(), Path(sys.executable).resolve())
                    descriptor = os.pidfd_open(ready['pid'])
                    try:
                        self.assertTrue(alive(ready)); signal.pidfd_send_signal(descriptor, signal.SIGKILL)
                    finally:
                        os.close(descriptor)
                if parent.stderr is not None: parent.stderr.close()

        # Real Popen succeeds but enrollment returns None or raises. These
        # disposable roots carry no JDK/JAR/compiler, and no grant is issued.
        for mode in ('none', 'raise'):
            with self.subTest(realCapture=mode), tempfile.TemporaryDirectory(prefix='tron-aligned-birth-probe-') as temporary:
                import shutil
                directory = Path(temporary); directory.chmod(0o700)
                (directory / 'scripts/development').mkdir(parents=True)
                (directory / 'scripts/layout.json').write_text('{}')
                project = next(p for p in HERE.parents if (p / 'scripts/layout.json').is_file())
                shutil.copy2(project / 'scripts/development/ledger_owned_processes.py', directory / 'scripts/development/ledger_owned_processes.py')
                fixture = directory / 'tests/integration/chains/tron/fixtures/aligned-rocksdb-v1'
                shutil.copytree(HERE, fixture)
                shutil.copy2(HERE.parent / 'tron-candidate-seccomp.py', fixture.parent / 'tron-candidate-seccomp.py')
                report = directory / 'capture.json'
                parent = subprocess.Popen([sys.executable, '-c', CAPTURE_PARENT, str(fixture / 'build.py'), mode, str(report)],
                    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                try:
                    self.assertEqual(parent.wait(timeout=15), 0, parent.stderr.read().decode())
                    value = json.loads(report.read_text()); compiler = value['compiler']
                    self.assertNotIn('unexpectedAccepted', value)
                    self.assertTrue(compiler['popenCreated']); self.assertFalse(compiler['startupGranted'])
                    self.assertFalse(compiler['ownedChildStopped'])  # Birth uncertainty retains rejection/lock.
                    self.assertEqual(value['originalPopenExitCode'], 125); self.assertTrue(value['originalPopenAbsent'])
                    startup_rejection = (directory / '.internal/runtime/omnichain-product/.local/owned-tron-native-value-v1/reviewed-aligned-rocksdb-v2/compile-private.log').read_text().strip()
                    # With no writer ever connected after reader open, Linux
                    # may report readiness only at the original2 s deadline.
                    self.assertIn(startup_rejection, ('TRON_ALIGNED_COMPILER_STARTUP_EOF', 'TRON_ALIGNED_COMPILER_STARTUP_DEADLINE'))
                    self.assertLess(compiler['milliseconds'], 10000)
                finally:
                    if parent.poll() is None: parent.kill(); parent.wait(timeout=5)
                    parent.stderr.close()

        # Regression of the real FIFO race: the parent has already spawned
        # the causal child, but its actual reader deliberately opens later.
        with tempfile.TemporaryDirectory(prefix='tron-aligned-delayed-fifo-') as temporary:
            import importlib.util
            directory = Path(temporary); directory.chmod(0o700)
            spec = importlib.util.spec_from_file_location('probe_fixed_builder', HERE / 'build.py')
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            module.DESTINATION = directory
            fifo = directory / 'compile-startup.fifo'; os.mkfifo(fifo, 0o600)
            descriptor = os.open(fifo, os.O_RDWR | os.O_NONBLOCK | os.O_NOFOLLOW)
            inventory = module.load_owned_processes().LedgerOwnedProcesses(); inventory.activate()
            deadline = time.monotonic() + 5; inventory.constrain_wait_deadline(deadline)
            child = None
            try:
                child = inventory.spawn([str(module.PYTHON), '-c', DELAYED_READER, str(HERE / 'compile-child.py'), str(directory)],
                    cwd=directory, env={'LANG': 'C.UTF-8'})
                self.assertFalse((directory / 'compile-startup-ready.json').exists())
                publication_deadline = time.monotonic() + 1
                while not (directory / 'compile-startup-ready.tmp').exists() and time.monotonic() < publication_deadline: time.sleep(.005)
                self.assertTrue((directory / 'compile-startup-ready.tmp').exists())
                self.assertFalse((directory / 'compile-startup-ready.json').exists())  # Incomplete publication is invisible.
                ready = module.wait_compiler_reader(inventory, time.monotonic() + 2)
                self.assertEqual(ready['identity']['pid'], child.pid)
                module.grant_compiler_startup(inventory, descriptor)
                os.close(descriptor); descriptor = None
                self.assertEqual(child.wait(timeout=3), 0, child.stderr.read().decode())
                self.assertEqual(json.loads((directory / 'accepted-framing.json').read_text()), {'pid': child.pid, 'grantAndEOFObserved': True})
                self.assertTrue(inventory.finish())
            finally:
                if descriptor is not None: os.close(descriptor)
                if child is not None and child.poll() is None:
                    inventory.signal_retained(signal.SIGTERM); child.wait(timeout=3)
                if inventory.active: inventory.finish()
                if child is not None: child.stdout.close(); child.stderr.close()


if __name__ == '__main__': unittest.main()
