"""Fixture-only child guard. No host policy or limits are modified.

The classic BPF filter is installed before exec and inherited by Java threads,
forked descendants and JNI calls. It denies socket creation and network socketpairs plus the x32 ABI.
Only anonymous AF_UNIX socketpairs required by JDK8 FileDispatcher are allowed.
Stdio is confined to local pipes or anonymous UNIX channels; no other
descriptor is inherited by Java.
Canonical Tron runtime activation remains a separate, closed source gate.
"""
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import platform
import socket
import sys
import stat


class Instruction(ctypes.Structure):
    _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte),
                ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]


class Program(ctypes.Structure):
    _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Instruction))]


def install_socket_guard():
    if sys.platform != 'linux' or platform.machine() != 'x86_64':
        raise RuntimeError('TRON_CANDIDATE_LINUX_X64_REQUIRED')
    # seccomp_data.arch then nr; accept only native x86_64 syscall numbers.
    rules = [
        (0x20, 0, 0, 4),                 # LD arch
        (0x15, 1, 0, 0xC000003E),       # JEQ AUDIT_ARCH_X86_64
        (0x06, 0, 0, 0x80000000),       # RET KILL_PROCESS
        (0x20, 0, 0, 0),                 # LD nr
        (0x35, 0, 1, 0x40000000),       # JGE x32 bit
        (0x06, 0, 0, 0x80000000),       # RET KILL_PROCESS
        (0x15, 0, 1, 41),                # JEQ socket -> deny
        (0x06, 0, 0, 0x00050000 | errno.EACCES),
        (0x15, 0, 4, 53),                # JEQ socketpair -> inspect domain
        (0x20, 0, 0, 16),                # LD args[0] domain
        (0x15, 1, 0, 1),                 # JEQ AF_UNIX -> allow
        (0x06, 0, 0, 0x00050000 | errno.EACCES),
        (0x06, 0, 0, 0x7FFF0000),       # RET ALLOW anonymous UNIX pair
        (0x06, 0, 0, 0x7FFF0000),       # RET ALLOW other syscalls
    ]
    instructions = (Instruction * len(rules))(*(Instruction(*r) for r in rules))
    program = Program(len(rules), instructions)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError(ctypes.get_errno(), 'TRON_CANDIDATE_NO_NEW_PRIVS')
    if libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'TRON_CANDIDATE_SECCOMP_FILTER')


def guard_acceptance():
    install_socket_guard()
    rejected = []
    for family, kind in [(socket.AF_INET, socket.SOCK_STREAM),
                         (socket.AF_INET6, socket.SOCK_DGRAM),
                         (socket.AF_UNIX, socket.SOCK_STREAM)]:
        try:
            value = socket.socket(family, kind)
        except OSError as error:
            if error.errno != errno.EACCES:
                raise
            rejected.append([family, kind])
        else:
            value.close()
            raise RuntimeError('TRON_CANDIDATE_SOCKET_NOT_DENIED')
    for family in [socket.AF_INET, socket.AF_INET6]:
        try:
            a, b = socket.socketpair(family)
        except OSError as error:
            if error.errno != errno.EACCES:
                raise
        else:
            a.close(); b.close()
            raise RuntimeError('TRON_CANDIDATE_NETWORK_SOCKETPAIR_NOT_DENIED')
    a, b = socket.socketpair(socket.AF_UNIX)
    try:
        a.sendall(b'ANONYMOUS_JDK_PAIR')
        if b.recv(64) != b'ANONYMOUS_JDK_PAIR' or a.getsockname() or b.getsockname():
            raise RuntimeError('TRON_CANDIDATE_ANONYMOUS_PAIR_FAILURE')
    finally:
        a.close(); b.close()
    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, b'OWNED_STDIO_PIPE')
        if os.read(read_fd, 64) != b'OWNED_STDIO_PIPE':
            raise RuntimeError('TRON_CANDIDATE_PIPE_FAILURE')
    finally:
        os.close(read_fd); os.close(write_fd)
    print(json.dumps({'socketSyscallsDenied': True, 'networkSocketpairDenied': True, 'anonymousUnixPairPermitted': True,
                      'pipesPreserved': True, 'hostPolicyChanged': False}))


def launch(scratch):
    if sys.version_info < (3, 12):
        raise RuntimeError('TRON_CANDIDATE_PYTHON312_REQUIRED')
    internal = next((p for p in Path(__file__).resolve().parents if p.name == '.internal'), None)
    if internal is None:
        raise RuntimeError('TRON_CANDIDATE_MAPPED_HELPER_REQUIRED')
    root = internal / 'runtime/omnichain-product/.local/owned-tron-native-value-v1'
    root = root.resolve(strict=True)
    directory = Path(scratch)
    if directory.resolve(strict=True) != directory or directory.parent != root / 'candidate-acceptance':
        raise RuntimeError('TRON_CANDIDATE_OWNED_DIRECTORY_REQUIRED')
    st = directory.lstat()
    if st.st_uid != os.getuid() or st.st_mode & 0o777 != 0o700 or not directory.name.startswith('scratch-'):
        raise RuntimeError('TRON_CANDIDATE_PRIVATE_DIRECTORY')
    pins = {
        'jdk8/bin/java': '1a081a2c18367e5d966d716a6091d5fe2eec26b19e471980d0d8fd550174e21c',
        'FullNode-offline.jar': 'ac1e47f7648c7b88143381cb19b76f4cec78036c5490f3fa90c018630bd69485',
        'driver/OwnedTronNativeDriver.class': '977e1bcfc698eb5bcde8256ede529cbba9a0f047a9a926f80d3fdb7b46f4a5e4',
        'driver/OwnedTronNativeDriver$OwnedShutdown.class': '963a36503e3be315c095413fd2c4301d79e36016575fd1872d43a0fe0a977921',
    }
    for name, expected in pins.items():
        p = root / name
        if p.resolve(strict=True) != p or not p.is_file() or p.is_symlink():
            raise RuntimeError('TRON_CANDIDATE_BINARY_PATH')
        with p.open('rb') as f:
            if hashlib.file_digest(f, 'sha256').hexdigest() != expected:
                raise RuntimeError('TRON_CANDIDATE_BINARY_PIN')
    # Exact public original patch classes override duplicate JAR entries via
    # their original Java package paths. No compilation or class rewriting.
    overlay = directory / 'reviewed-original-classes'
    overlay.mkdir(mode=0o700)
    original_classes = {'OwnedTronNativeDriver$OwnedShutdown.class': '963a36503e3be315c095413fd2c4301d79e36016575fd1872d43a0fe0a977921', 'OwnedTronNativeDriver.class': '977e1bcfc698eb5bcde8256ede529cbba9a0f047a9a926f80d3fdb7b46f4a5e4', 'org/tron/core/config/args/Args.class': '2598f93f3507449db71319b4a37f1ce86e395f38e50b840c61e06db781204d15', 'org/tron/core/db/Manager$1.class': 'e4f2bb8f9ab372adb682a6e33db75e2ccb8d7eb8364a6a394a9ba5538b1ca17b', 'org/tron/core/db/Manager$ValidateSignTask.class': 'c2c352db2e2cc89197dd868cfb460b6d40a1a7870edc689af43ce6d77e20928b', 'org/tron/core/db/Manager.class': '5c0ffbeca741370691928e326286ac32babbd7dfb330d98468eea2d9d4e6b35c', 'org/tron/core/db/OwnedLocalTronReplayRecorder.class': 'd76117a0a7b8c761ab4530dafea58511d00bfbe360cc3ab2c13f94763c85fb3b'}
    for name, expected in original_classes.items():
        source = root / 'driver' / Path(name).name
        if source.resolve(strict=True) != source or source.is_symlink():
            raise RuntimeError('TRON_CANDIDATE_ORIGINAL_CLASS_PATH')
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError('TRON_CANDIDATE_ORIGINAL_CLASS_PIN')
        if name == 'org/tron/core/config/args/Args.class':
            # This single reviewed source delta is a new compiled candidate.
            # The original class above is still authenticated and untouched.
            revised = root / 'reviewed-offline-agree-zero-v1/classes' / name
            if revised.resolve(strict=True) != revised or not revised.is_file() or revised.is_symlink():
                raise RuntimeError('TRON_CANDIDATE_REVIEWED_ARGS_PATH')
            data = revised.read_bytes()
            if hashlib.sha256(data).hexdigest() != 'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70':
                raise RuntimeError('TRON_CANDIDATE_REVIEWED_ARGS_CLASS_PIN')
        target = overlay / name
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with target.open('xb') as handle:
            handle.write(data)
        target.chmod(0o600)
    # Node's stdio='pipe' can use anonymous AF_UNIX socketpairs internally.
    # Authenticate stdio too: no pre-existing network socket can enter Java.
    for descriptor in [0, 1, 2]:
        mode = os.fstat(descriptor).st_mode
        if stat.S_ISFIFO(mode):
            continue
        if not stat.S_ISSOCK(mode):
            raise RuntimeError('TRON_CANDIDATE_LOCAL_STDIO_REQUIRED')
        channel = socket.socket(fileno=descriptor)
        try:
            if channel.family != socket.AF_UNIX or channel.getsockname() or channel.getpeername():
                raise RuntimeError('TRON_CANDIDATE_ANONYMOUS_STDIO_REQUIRED')
        finally:
            channel.detach()
    # No other FD survives into Java, even when invoked outside the fixed host.
    for p in Path('/proc/self/fd').iterdir():
        if p.name.isdigit() and int(p.name) > 2:
            try:
                os.close(int(p.name))
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise
    os.chdir(directory)
    install_socket_guard()
    java = str(root / 'jdk8/bin/java')
    arguments = [java, '-Xms256m', '-Xmx1536m', '-XX:ActiveProcessorCount=2',
                 '-Djava.net.preferIPv4Stack=true', '-cp',
                 str(overlay) + ':' + str(root / 'FullNode-offline.jar'),
                 'OwnedTronNativeDriver']
    environment = {'HOME': str(directory), 'TMPDIR': str(directory),
                   'TEMP': str(directory), 'TMP': str(directory), 'LANG': 'C.UTF-8'}
    os.execve(java, arguments, environment)


if __name__ == '__main__':
    if sys.argv[1:] == ['--check-socket-guard']:
        guard_acceptance()
    elif len(sys.argv) == 2:
        launch(sys.argv[1])
    else:
        raise RuntimeError('TRON_CANDIDATE_FIXED_HELPER_ARGUMENTS')
