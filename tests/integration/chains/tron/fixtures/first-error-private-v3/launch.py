"""New fixed child launcher. Original driver, seven classes and helper untouched.

This launcher cannot activate itself: its build receipt and outputs must first
be reviewed and pinned by the Node entry's independent source gate. It never
accepts an endpoint, key, source path, Java option or profile from its caller.
"""
import ctypes
import hashlib
import importlib.util
import json
import os
import re
import select
from pathlib import Path
import signal
import socket
import stat
import sys
import time

HERE = Path(__file__).resolve().parent


def need(value, code):
    if not value:
        raise RuntimeError(code)


def regular(path):
    need(path.resolve(strict=True) == path and not path.is_symlink() and path.is_file(), 'TRON_ALIGNED_LAUNCH_REGULAR_PATH')
    return path.read_bytes()


def pin(path, expected):
    data = regular(path)
    need(hashlib.sha256(data).hexdigest() == expected, 'TRON_ALIGNED_LAUNCH_ORIGINAL_PIN')
    return data


def read_release(profile_bytes):
    # Independently read the fixed gate data literal, never execute JavaScript.
    profile = profile_bytes.decode('utf-8')
    lines = [line for line in profile.splitlines() if line.startswith('export const TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3 = ')]
    need(len(lines) == 1, 'TRON_ALIGNED_LAUNCH_SINGLE_SOURCE_GATE')
    match = re.fullmatch(r'export const TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3 = (null|\{[^\r\n]*\});', lines[0])
    need(match is not None, 'TRON_ALIGNED_LAUNCH_LITERAL_GATE_REQUIRED')
    release = json.loads(match[1])
    need(isinstance(release, dict) and set(release) == {'format', 'sourceSHA256', 'buildReportSHA256', 'classSHA256', 'innerClassSHA256'}
         and release['format'] == 'REVIEWED_LOCAL_TRON_FIRST_ERROR_PRIVATE_CANDIDATE_V3'
         and release['sourceSHA256'] == '472a1e6ebef937f966cb4d5b3455bf39c7f007b47bb759e3cac3bd62cc22ee3e',
         'TRON_ALIGNED_NEW_CANDIDATE_REVIEW_REQUIRED')
    for key in ('buildReportSHA256', 'classSHA256', 'innerClassSHA256'):
        need(isinstance(release[key], str) and re.fullmatch('[0-9a-f]{64}', release[key]), 'TRON_ALIGNED_LAUNCH_RELEASE_DIGEST')
    return release


def wait_original_parent_grant():
    # One fixed startup octet is consumed; all later stdin bytes remain the
    # original Java driver's command stream. Node sends no command before READY.
    deadline = time.monotonic() + 2
    need(select.select([0], [], [], max(0, deadline - time.monotonic()))[0], 'TRON_ALIGNED_LAUNCH_STARTUP_DEADLINE')
    data = os.read(0, 2)
    need(data == b'G', 'TRON_ALIGNED_LAUNCH_STARTUP_GRANT_REQUIRED')
    need(time.monotonic() < deadline, 'TRON_ALIGNED_LAUNCH_STARTUP_DEADLINE')


def launch(scratch):
    parent = os.getppid(); libc = ctypes.CDLL(None, use_errno=True)
    need(parent > 1 and libc.prctl(1, signal.SIGTERM, 0, 0, 0) == 0 and os.getppid() == parent, 'TRON_ALIGNED_PARENT_DEATH_GUARD')
    wait_original_parent_grant()
    need(os.getppid() == parent, 'TRON_ALIGNED_PARENT_CHANGED_BEFORE_JAVA')
    need(sys.platform == 'linux' and os.uname().machine == 'x86_64' and sys.version_info >= (3, 12), 'TRON_ALIGNED_LAUNCH_PLATFORM')
    internal = next((p for p in HERE.parents if p.name == '.internal'), None)
    need(internal is not None, 'TRON_ALIGNED_MAPPED_HELPER_REQUIRED')
    root = internal / 'runtime/omnichain-product/.local/owned-tron-native-value-v1'
    directory = Path(scratch)
    base = root / 'aligned-rocksdb-candidate-acceptance'
    need(directory.is_absolute() and directory.parent == base and directory.name.startswith('scratch-')
         and directory.resolve(strict=True) == directory, 'TRON_ALIGNED_FIXED_SCRATCH_NAMESPACE')
    info = directory.lstat()
    need(info.st_uid == os.getuid() and stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o700, 'TRON_ALIGNED_PRIVATE_SCRATCH')
    new = root / 'reviewed-first-error-private-v3'
    need(new.resolve(strict=True) == new and stat.S_IMODE(new.stat().st_mode) == 0o700 and new.stat().st_uid == os.getuid(), 'TRON_ALIGNED_NEW_BUILD_NAMESPACE')
    release = read_release(regular(HERE.parent.parent / 'tron-first-error-private-profile-v3.mjs'))
    pin(root / 'jdk8/bin/java', '1a081a2c18367e5d966d716a6091d5fe2eec26b19e471980d0d8fd550174e21c')
    pin(root / 'FullNode-offline.jar', 'ac1e47f7648c7b88143381cb19b76f4cec78036c5490f3fa90c018630bd69485')
    build = json.loads(pin(new / 'build-report.json', release['buildReportSHA256']))
    need(build['schema'] == 'LIANUM_TRON_FIRST_ERROR_PRIVATE_BUILD_V3' and build['success'] is True, 'TRON_ALIGNED_LAUNCH_REVIEWED_BUILD')
    need(build['inputs']['launcherSHA256'] == hashlib.sha256(regular(HERE / 'launch.py')).hexdigest(), 'TRON_ALIGNED_LAUNCH_SELF_RECEIPT_JOIN')
    names = ['OwnedTronNativeDriver$OwnedShutdown.class', 'OwnedTronNativeDriver.class']
    need(sorted(p.name for p in (new / 'classes').iterdir()) == names
         and sorted(r['path'] for r in build['outputs']) == names, 'TRON_ALIGNED_LAUNCH_EXACT_OUTPUTS')
    new_overlay = directory / 'reviewed-new-driver-classes'; new_overlay.mkdir(mode=0o700)
    for row in build['outputs']:
        expected = release['classSHA256'] if row['path'] == 'OwnedTronNativeDriver.class' else release['innerClassSHA256']
        need(row['sha256'] == expected, 'TRON_ALIGNED_LAUNCH_NEW_OUTPUT_PIN')
        data = pin(new / 'classes' / row['path'], expected)
        need(len(data) == row['bytes'] and data[:4] == b'\xca\xfe\xba\xbe' and int.from_bytes(data[6:8], 'big') == row['classMajor'] == 52,
             'TRON_ALIGNED_LAUNCH_CLASS_MAJOR')
        path = new_overlay / row['path']
        with path.open('xb') as handle:
            handle.write(data)
        path.chmod(0o600)
    old_pins = {'OwnedTronNativeDriver$OwnedShutdown.class': '963a36503e3be315c095413fd2c4301d79e36016575fd1872d43a0fe0a977921',
        'OwnedTronNativeDriver.class': '977e1bcfc698eb5bcde8256ede529cbba9a0f047a9a926f80d3fdb7b46f4a5e4',
        'org/tron/core/config/args/Args.class': '2598f93f3507449db71319b4a37f1ce86e395f38e50b840c61e06db781204d15',
        'org/tron/core/db/Manager$1.class': 'e4f2bb8f9ab372adb682a6e33db75e2ccb8d7eb8364a6a394a9ba5538b1ca17b',
        'org/tron/core/db/Manager$ValidateSignTask.class': 'c2c352db2e2cc89197dd868cfb460b6d40a1a7870edc689af43ce6d77e20928b',
        'org/tron/core/db/Manager.class': '5c0ffbeca741370691928e326286ac32babbd7dfb330d98468eea2d9d4e6b35c',
        'org/tron/core/db/OwnedLocalTronReplayRecorder.class': 'd76117a0a7b8c761ab4530dafea58511d00bfbe360cc3ab2c13f94763c85fb3b'}
    overlay = directory / 'reviewed-original-classes'; overlay.mkdir(mode=0o700)
    for name, expected in old_pins.items():
        data = pin(root / 'driver' / Path(name).name, expected)
        if name == 'org/tron/core/config/args/Args.class':
            data = pin(root / 'reviewed-offline-agree-zero-v1/classes' / name,
                       'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70')
        path = overlay / name; path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with path.open('xb') as handle:
            handle.write(data)
        path.chmod(0o600)
    for descriptor in (0, 1, 2):
        mode = os.fstat(descriptor).st_mode
        if stat.S_ISFIFO(mode):
            continue
        need(stat.S_ISSOCK(mode), 'TRON_ALIGNED_LOCAL_STDIO_REQUIRED')
        channel = socket.socket(fileno=descriptor)
        try:
            need(channel.family == socket.AF_UNIX and not channel.getsockname() and not channel.getpeername(), 'TRON_ALIGNED_ANONYMOUS_STDIO')
        finally:
            channel.detach()
    guard_path = HERE.parent / 'tron-candidate-seccomp.py'
    pin(guard_path, '36241a6e2480a8bcdfb24c7d83499fbb09c8ca8516a912f26ae4d5cd43a8e7bb')
    spec = importlib.util.spec_from_file_location('tron_aligned_original_socket_guard', guard_path)
    guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
    temporary = directory / 'jni-tmp'; temporary.mkdir(mode=0o700)
    # No extra inherited FD. This original guard denies sockets including JNI.
    for path in Path('/proc/self/fd').iterdir():
        if path.name.isdigit() and int(path.name) > 2:
            try:
                os.close(int(path.name))
            except OSError as error:
                if error.errno != 9:
                    raise
    os.chdir(directory); guard.install_socket_guard()
    java = str(root / 'jdk8/bin/java')
    argv = [java, '-Xms256m', '-Xmx1536m', '-XX:ActiveProcessorCount=2', '-Djava.net.preferIPv4Stack=true',
            '-Djava.io.tmpdir=' + str(temporary), '-cp', str(new_overlay) + ':' + str(overlay) + ':' + str(root / 'FullNode-offline.jar'),
            'OwnedTronNativeDriver']
    environment = {'HOME': str(directory), 'TMPDIR': str(temporary), 'TEMP': str(temporary), 'TMP': str(temporary), 'LANG': 'C.UTF-8'}
    os.execve(java, argv, environment)


if __name__ == '__main__':
    need(len(sys.argv) == 2, 'TRON_ALIGNED_FIXED_LAUNCH_ARGUMENTS')
    launch(sys.argv[1])
