"""One fixed compiler bootstrap; no caller argv/env/path/compiler is accepted.

The original LedgerOwnedProcesses birth pipe/pidfd inventory owns this child.
Only a one-byte grant followed by EOF within two seconds permits fixed javac.
EOF/error/extra byte/signal/unknown identity reject before any compiler starts.
"""
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import select
import signal
import stat
import sys
import time

HERE = Path(__file__).resolve().parent


def load_builder():
    spec = importlib.util.spec_from_file_location('tron_aligned_fixed_builder', HERE / 'build.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def wait_startup(descriptor, deadline):
    received = bytearray()
    while time.monotonic() < deadline:
        if not select.select([descriptor], [], [], max(0, deadline - time.monotonic()))[0]:
            break
        data = os.read(descriptor, 2)
        if not data:
            if bytes(received) != b'\x01':
                raise RuntimeError('TRON_ALIGNED_COMPILER_STARTUP_EOF')
            return
        received.extend(data)
        if bytes(received) != b'\x01':
            raise RuntimeError('TRON_ALIGNED_COMPILER_STARTUP_EXTRA_BYTE')
    raise RuntimeError('TRON_ALIGNED_COMPILER_STARTUP_DEADLINE')


def publish_startup_ack(module, value):
    final = module.DESTINATION / 'compile-startup-ready.json'
    temporary = module.DESTINATION / 'compile-startup-ready.tmp'
    module.need(not final.exists() and not final.is_symlink(), 'TRON_ALIGNED_COMPILER_STARTUP_ACK_EXISTS')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        data = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
        module.need(len(data) <= 4096, 'TRON_ALIGNED_COMPILER_STARTUP_ACK_BOUND')
        os.fchmod(descriptor, 0o600)
        module.need(os.write(descriptor, data) == len(data), 'TRON_ALIGNED_COMPILER_STARTUP_ACK_WRITE')
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    # Atomic publication with an exclusive destination: the parent can only
    # observe the complete 0600 inode, and no prior ACK/symlink is overwritten.
    os.link(temporary, final, follow_symlinks=False)
    temporary.unlink()


def open_startup_reader(module, original):
    path = module.DESTINATION / 'compile-startup.fifo'
    before = path.lstat()
    module.need(path.resolve(strict=True) == path and stat.S_ISFIFO(before.st_mode) and before.st_uid == os.getuid()
                and stat.S_IMODE(before.st_mode) == 0o600, 'TRON_ALIGNED_COMPILER_CHILD_STARTUP_PIPE')
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        actual = os.fstat(descriptor)
        module.need((actual.st_dev, actual.st_ino, actual.st_uid, actual.st_mode) ==
                    (before.st_dev, before.st_ino, before.st_uid, before.st_mode), 'TRON_ALIGNED_COMPILER_CHILD_PIPE_CHANGED')
        # ACK only says that the reader FD is open. The parent still owns and
        # rechecks the actual child via original UID4/birth/pidfd and /proc FD.
        publish_startup_ack(module, {
            'format': 'LIANUM_TRON_COMPILER_STARTUP_READER_V1', 'identity': original,
            'descriptor': descriptor, 'fifoDevice': actual.st_dev, 'fifoInode': actual.st_ino})
        return descriptor
    except Exception:
        os.close(descriptor); raise


def install_child_guards(parent, module):
    libc = ctypes.CDLL(None, use_errno=True)
    death_signal = ctypes.c_int()
    module.need(libc.prctl(2, ctypes.byref(death_signal), 0, 0, 0) == 0 and death_signal.value == signal.SIGTERM,
                'TRON_ALIGNED_COMPILER_ORIGINAL_PDEATHSIG')
    module.need(parent > 1 and os.getppid() == parent and libc.prctl(1, signal.SIGTERM, 0, 0, 0) == 0
                and os.getppid() == parent, 'TRON_ALIGNED_COMPILER_PARENT_CHANGED')
    resource.setrlimit(resource.RLIMIT_FSIZE, (module.LOG_LIMIT, module.LOG_LIMIT))
    spec = importlib.util.spec_from_file_location('tron_aligned_original_child_guard', module.FIXTURES / 'tron-candidate-seccomp.py')
    guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
    guard.install_socket_guard()


def main():
    began = time.monotonic(); parent = os.getppid()
    module = load_builder()
    module.need(sys.argv == [str(HERE / 'compile-child.py')], 'TRON_ALIGNED_COMPILER_CHILD_NO_ARGS')
    module.need(sys.platform == 'linux' and os.uname().machine == 'x86_64' and sys.version_info >= (3, 12),
                'TRON_ALIGNED_COMPILER_CHILD_PLATFORM')
    module.assert_owned_destination(module.DESTINATION)
    module.need(Path.cwd() == module.DESTINATION and dict(os.environ) == module.compiler_environment(),
                'TRON_ALIGNED_COMPILER_CHILD_FIXED_ENV_CWD')
    owned = module.load_owned_processes()
    original = owned.identity(os.getpid()); owner = owned.identity(parent)
    module.need(original['ppid'] == parent and original['pgrp'] == original['session'] == original['pid']
                and original['uids'] == [os.getuid()] * 4, 'TRON_ALIGNED_COMPILER_CHILD_BIRTH')
    lock = module.LOCK_DIRECTORY / 'active.lock'
    opened = lock.lstat()
    module.need(stat.S_ISREG(opened.st_mode) and opened.st_uid == os.getuid() and stat.S_IMODE(opened.st_mode) == 0o600,
                'TRON_ALIGNED_COMPILER_CHILD_LOCK')
    claim = json.loads(module.regular(lock))
    module.need(claim == {'pid': parent, 'fixedAlignedCandidateCompiler': True}, 'TRON_ALIGNED_COMPILER_CHILD_LOCK_OWNER')
    descriptor = open_startup_reader(module, original)
    try:
        wait_startup(descriptor, began + module.STARTUP_SECONDS)
    finally:
        os.close(descriptor)
    module.need(time.monotonic() - began < module.STARTUP_SECONDS and owned.stable_equal(owner, owned.identity(parent))
                and owned.stable_equal(original, owned.identity(os.getpid())), 'TRON_ALIGNED_COMPILER_CHILD_STARTUP_IDENTITY')
    # Parent owns the full input closure before/after compile. Recheck the
    # exact executable and syscall guard at this two-second startup boundary.
    module.need(module.digest(module.RUNTIME / 'jdk8/bin/javac') == module.JAVAC_PIN
                and module.digest(module.FIXTURES / 'tron-candidate-seccomp.py') == module.GUARD_PIN,
                'TRON_ALIGNED_COMPILER_CHILD_EXEC_GUARD_PIN')
    module.need(time.monotonic() - began < module.STARTUP_SECONDS, 'TRON_ALIGNED_COMPILER_STARTUP_DEADLINE')
    install_child_guards(parent, module)
    os.execve(str(module.RUNTIME / 'jdk8/bin/javac'), module.compiler_argv(), module.compiler_environment())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        code = str(error) if re.fullmatch(r'TRON_ALIGNED_[A-Z0-9_]+', str(error)) else 'TRON_ALIGNED_COMPILER_CHILD_FAILED'
        sys.stderr.write(code + '\n'); sys.exit(125)
