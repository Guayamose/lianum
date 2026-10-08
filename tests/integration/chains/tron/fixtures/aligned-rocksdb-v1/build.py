"""Fixed new candidate build. It never starts a node or activates a release.

Run only after review: python3 <this fixed file> --build-reviewed-aligned-rocksdb
Two source literal changes, two new class outputs, original artifacts preserved.
"""
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import select
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
PROJECT = next((p for p in HERE.parents if (p / 'scripts/layout.json').is_file()), None)
if PROJECT is None:
    PROJECT = next(p for p in HERE.parents if p.name == '.internal').parent
RUNTIME = PROJECT / '.internal/runtime/omnichain-product/.local/owned-tron-native-value-v1'
DESTINATION = RUNTIME / 'reviewed-aligned-rocksdb-v2'
LOCK_DIRECTORY = RUNTIME / 'candidate-acceptance'
SOURCE = HERE / 'source/OwnedTronNativeDriver.java'
ORIGINAL = PROJECT / 'packages/chains/drivers/owned-tron-native-value/OwnedTronNativeDriver.java'
FIXTURES = HERE.parent
JAR_PIN = 'ac1e47f7648c7b88143381cb19b76f4cec78036c5490f3fa90c018630bd69485'
JAVA_PIN = '1a081a2c18367e5d966d716a6091d5fe2eec26b19e471980d0d8fd550174e21c'
JAVAC_PIN = 'a7067cb35a7f16dbf1182e1a84d72d5c5e9dd3272a0c519d87a3e65bfad2bdff'
SOURCE_PIN = 'd2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0'
ORIGINAL_SOURCE_PIN = '02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f'
ARGS_PIN = 'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70'
GUARD_PIN = '36241a6e2480a8bcdfb24c7d83499fbb09c8ca8516a912f26ae4d5cd43a8e7bb'
CANDIDATE_PIN = '48aecfcb7ba0f8bdc53029a1ce9c496d15c6aab9ae8b7290ced13131b3fb7975'
JDK_RECEIPT_PIN = '0e2404b5ab76d082f5e29f6cb6f584c21230090b290c0d43da832f4f7239b115'
OUTPUT_NAMES = ('OwnedTronNativeDriver$OwnedShutdown.class', 'OwnedTronNativeDriver.class')
RSS_LIMIT = 384 * 1024 * 1024
LOG_LIMIT = 1024 * 1024
DEADLINE_SECONDS = 60
active = None
active_inventory = None
interrupted = False
pending_signal = None
owner_pid = None
CLEANUP_SECONDS = 10
STARTUP_SECONDS = 2
OWNED_HELPER = PROJECT / 'scripts/development/ledger_owned_processes.py'
CHILD = HERE / 'compile-child.py'
PYTHON = Path('/usr/bin/python3').resolve(strict=True)


def need(value, code):
    if not value:
        raise RuntimeError(code)


def regular(path):
    need(path.resolve(strict=True) == path and not path.is_symlink(), 'TRON_ALIGNED_REGULAR_PATH')
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode), 'TRON_ALIGNED_REGULAR_FILE')
    return path.read_bytes()


def digest(path):
    return hashlib.sha256(regular(path)).hexdigest()


def validate_source_delta(original, candidate):
    old_engine = b'db.engine=\\"LEVELDB\\"'
    new_engine = b'db.engine=\\"ROCKSDB\\"'
    old_time = b'timestamp=\\"1750000000000\\"'
    new_time = b'timestamp=\\"1749999999000\\"'
    need(original.count(old_engine) == original.count(old_time) == 1, 'TRON_ALIGNED_ORIGINAL_LITERAL_COUNT')
    need(candidate.count(new_engine) == candidate.count(new_time) == 1, 'TRON_ALIGNED_NEW_LITERAL_COUNT')
    need(new_engine not in original and new_time not in original and old_engine not in candidate and old_time not in candidate,
         'TRON_ALIGNED_EXACT_LITERAL_CHANGE')
    need(candidate.replace(new_engine, old_engine).replace(new_time, old_time) == original, 'TRON_ALIGNED_ONLY_TWO_SOURCE_DELTAS')
    need(1749999999000 % 3000 == 0 and 1750000000000 % 3000 == 1000, 'TRON_ALIGNED_SLOT_PHASE')


def original_path():
    # The mapped checkout has the same original bytes under runtime-drivers.
    if (PROJECT / 'scripts/layout.json').is_file():
        return ORIGINAL
    return PROJECT / '.internal/runtime/omnichain-flat-profile/flat-wallet/runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'


def inputs():
    need(digest(SOURCE) == SOURCE_PIN, 'TRON_ALIGNED_SOURCE_PIN')
    original = original_path()
    need(digest(original) == ORIGINAL_SOURCE_PIN, 'TRON_ALIGNED_ORIGINAL_SOURCE_PIN')
    validate_source_delta(regular(original), regular(SOURCE))
    candidate_path = FIXTURES / 'candidate-artifacts-v3.json'
    jdk_path = FIXTURES / 'jdk-acquisition.json'
    need(digest(candidate_path) == CANDIDATE_PIN and digest(jdk_path) == JDK_RECEIPT_PIN, 'TRON_ALIGNED_ORIGINAL_RECEIPT_PIN')
    candidate = json.loads(regular(candidate_path))
    need(candidate['officialUpstreamCommit'] == '5c449a18a2bb995d3b688d1587e664d909b473c7'
         and candidate['runtimeRelease'] is None and candidate['fullGradleRebuild'] is False, 'TRON_ALIGNED_ORIGINAL_CLASSIFICATION')
    jdk = json.loads(regular(jdk_path))
    expected = set()
    for row in jdk['inventory']:
        rel = Path(row['path']).relative_to('jdk8u504-b01')
        need('..' not in rel.parts, 'TRON_ALIGNED_JDK_RELATIVE_PATH')
        path = RUNTIME / 'jdk8' / rel
        expected.add(rel.as_posix())
        info = path.lstat()
        if row['kind'] == 'symlink':
            need(path.is_symlink() and os.readlink(path) == row['target'] and path.resolve(strict=True).is_relative_to(RUNTIME / 'jdk8'),
                 'TRON_ALIGNED_JDK_SYMLINK')
        else:
            need(row['kind'] == 'file' and info.st_size == row['bytes'] and digest(path) == row['sha256']
                 and stat.S_IMODE(info.st_mode) == int(row['mode'], 8), 'TRON_ALIGNED_JDK_CLOSURE_PIN')
    actual = {p.relative_to(RUNTIME / 'jdk8').as_posix() for p in (RUNTIME / 'jdk8').rglob('*') if not p.is_dir() or p.is_symlink()}
    need(actual == expected, 'TRON_ALIGNED_COMPLETE_JDK_CLOSURE')
    classes = candidate['compiledClasses']
    need(len(classes) == 7 and sorted(p.name for p in (RUNTIME / 'driver').iterdir()) == sorted(Path(r['path']).name for r in classes),
         'TRON_ALIGNED_ORIGINAL_SEVEN_CLASS_CLOSURE')
    for row in classes:
        data = regular(RUNTIME / 'driver' / Path(row['path']).name)
        need(len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256'] and int.from_bytes(data[6:8], 'big') == row['classMajor'] == 52,
             'TRON_ALIGNED_ORIGINAL_CLASS_PIN')
    pins = {'FullNode-offline.jar': JAR_PIN, 'jdk8/bin/java': JAVA_PIN, 'jdk8/bin/javac': JAVAC_PIN,
            'reviewed-offline-agree-zero-v1/classes/org/tron/core/config/args/Args.class': ARGS_PIN,
            'reviewed-offline-agree-zero-v1/build-report.json': '71de6b263c4051738e76d27da7f4f821f800c9ca944a742c4980ccd9695e98e2'}
    for rel, pin in pins.items():
        need(digest(RUNTIME / rel) == pin, 'TRON_ALIGNED_ORIGINAL_BINARY_PIN')
    need(digest(FIXTURES / 'tron-candidate-seccomp.py') == GUARD_PIN, 'TRON_ALIGNED_ORIGINAL_GUARD_PIN')
    return {'sourceSHA256': SOURCE_PIN, 'originalSourceSHA256': ORIGINAL_SOURCE_PIN,
            'builderSHA256': digest(HERE / 'build.py'), 'launcherSHA256': digest(HERE / 'launch.py'),
            'compilerChildSHA256': digest(CHILD), 'ownedProcessHelperSHA256': digest(OWNED_HELPER),
            'compilerPythonSHA256': digest(PYTHON),
            'jdkEntries': len(expected), 'originalClasses': classes, 'originalBinaryPins': pins,
            'candidateReceiptSHA256': CANDIDATE_PIN, 'jdkReceiptSHA256': JDK_RECEIPT_PIN, 'originalGuardSHA256': GUARD_PIN}


def assert_owned_destination(path):
    need(path == DESTINATION and path.name == 'reviewed-aligned-rocksdb-v2' and path.parent == RUNTIME, 'TRON_ALIGNED_FIXED_NAMESPACE')
    info = path.lstat()
    need(path.resolve(strict=True) == path and not path.is_symlink() and stat.S_ISDIR(info.st_mode)
         and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700, 'TRON_ALIGNED_OWNED_NAMESPACE')


def output_inventory(directory):
    need(directory.resolve(strict=True) == directory and not directory.is_symlink(), 'TRON_ALIGNED_OUTPUT_DIRECTORY')
    need(sorted(p.name for p in directory.iterdir()) == list(OUTPUT_NAMES), 'TRON_ALIGNED_EXACT_TWO_CLASS_OUTPUTS')
    rows = []
    for name in OUTPUT_NAMES:
        data = regular(directory / name)
        need(len(data) > 8 and data[:4] == b'\xca\xfe\xba\xbe' and int.from_bytes(data[6:8], 'big') == 52,
             'TRON_ALIGNED_CLASS_MAJOR_52')
        rows.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'classMajor': 52})
    return rows


def load_owned_processes():
    # Reuse the reviewed helper byte-for-byte; no private fork of its inventory.
    spec = importlib.util.spec_from_file_location('tron_aligned_owned_processes', OWNED_HELPER)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def forward_signal(signum, frame):
    global interrupted, pending_signal
    # Only latch here. No /proc I/O, signalling, allocations or exceptions in a handler.
    interrupted, pending_signal = True, signum


def compiler_argv():
    return [str(RUNTIME / 'jdk8/bin/javac'), '-J-Xms32m', '-J-Xmx256m', '-J-XX:ActiveProcessorCount=2',
            '-J-Djava.io.tmpdir=' + str(DESTINATION / 'tmp'), '-proc:none', '-source', '8', '-target', '8', '-encoding', 'UTF-8',
            '-g', '-implicit:none', '-sourcepath', str(DESTINATION / 'empty-sourcepath'), '-cp',
            str(DESTINATION / 'original-classes') + ':' + str(RUNTIME / 'FullNode-offline.jar'),
            '-d', str(DESTINATION / 'classes'), str(SOURCE)]


def compiler_environment():
    return {'HOME': str(DESTINATION), 'TMPDIR': str(DESTINATION / 'tmp'), 'LANG': 'C.UTF-8'}


def process_executable(pid):
    return Path('/proc', str(pid), 'exe').resolve(strict=True)


def checked_compiler_executable(inventory, sampled):
    # The original scan may precede kernel exit by a few microseconds. Missing
    # /proc/exe is terminal only for our already-retained original Popen/pidfd.
    child = inventory.child
    need(child is not None and sampled['pid'] == child.pid, 'TRON_ALIGNED_COMPILER_ORIGINAL_POPEN_REQUIRED')
    retained = inventory.records.get(child.pid)
    need(retained is not None and retained['origin'] == 'ORIGINAL_POPEN_PREEXEC_PIPE'
         and retained['pidfd'] is not None and not retained['gone'] and not inventory.unsafe,
         'TRON_ALIGNED_COMPILER_RETAINED_PIDFD_REQUIRED')
    original = retained['original']
    need(all(sampled[key] == original[key] for key in ('pid', 'ppid', 'pgrp', 'session', 'startTimeTicks', 'uid', 'uids'))
         and original['pid'] == original['pgrp'] == original['session'] == child.pid
         and original['ppid'] == os.getpid() and original['uid'] == os.getuid()
         and original['uids'] == [os.getuid()] * 4, 'TRON_ALIGNED_COMPILER_SAMPLED_IDENTITY_CHANGED')
    try:
        executable = process_executable(child.pid)
    except FileNotFoundError:
        need(child.poll() is not None, 'TRON_ALIGNED_COMPILER_EXECUTABLE_DISAPPEARED_WHILE_LIVE')
        need(select.select([retained['pidfd']], [], [], 0)[0] == [retained['pidfd']],
             'TRON_ALIGNED_COMPILER_TERMINAL_PIDFD_UNCONFIRMED')
        live = inventory.scan()
        need(not live and not inventory.unsafe and not inventory.unknown and retained['gone'] is True,
             'TRON_ALIGNED_COMPILER_TERMINAL_INVENTORY_UNCONFIRMED')
        return None
    need(executable in (PYTHON, RUNTIME / 'jdk8/bin/javac'), 'TRON_ALIGNED_COMPILER_EXECUTABLE_CHANGED')
    return executable


def wait_compiler_reader(inventory, deadline):
    ready = DESTINATION / 'compile-startup-ready.json'
    while time.monotonic() < deadline:
        need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
        need(inventory.child is not None and inventory.child.poll() is None, 'TRON_ALIGNED_COMPILER_STARTUP_EXIT')
        if ready.exists():
            info = ready.lstat()
            need(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size <= 4096,
                 'TRON_ALIGNED_COMPILER_STARTUP_ACK_FILE')
            ack = json.loads(regular(ready))
            need(set(ack) == {'format', 'identity', 'descriptor', 'fifoDevice', 'fifoInode'}
                 and ack['format'] == 'LIANUM_TRON_COMPILER_STARTUP_READER_V1', 'TRON_ALIGNED_COMPILER_STARTUP_ACK')
            original = inventory.records.get(inventory.child.pid)
            need(original is not None and load_owned_processes().stable_equal(original['original'], ack['identity']),
                 'TRON_ALIGNED_COMPILER_STARTUP_ACK_BIRTH')
            need(type(ack['descriptor']) is int and 2 < ack['descriptor'] < 256, 'TRON_ALIGNED_COMPILER_STARTUP_ACK_FD')
            path = DESTINATION / 'compile-startup.fifo'; fifo = path.lstat()
            actual_path = Path('/proc', str(inventory.child.pid), 'fd', str(ack['descriptor']))
            opened = actual_path.stat()
            flags = re.search(r'^flags:\s+([0-7]+)$', Path('/proc', str(inventory.child.pid), 'fdinfo', str(ack['descriptor'])).read_text(), re.M)
            need(flags is not None and int(flags[1], 8) & os.O_ACCMODE == os.O_RDONLY, 'TRON_ALIGNED_COMPILER_STARTUP_READER_FLAGS')
            need(os.readlink(actual_path) == str(path) and stat.S_ISFIFO(opened.st_mode)
                 and (opened.st_dev, opened.st_ino) == (fifo.st_dev, fifo.st_ino) == (ack['fifoDevice'], ack['fifoInode']),
                 'TRON_ALIGNED_COMPILER_STARTUP_READER_INODE')
            return ack
        time.sleep(min(.005, max(0, deadline - time.monotonic())))
    raise RuntimeError('TRON_ALIGNED_COMPILER_STARTUP_READER_DEADLINE')


def grant_compiler_startup(inventory, descriptor):
    need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
    child = inventory.child
    need(child is not None and child.poll() is None and not inventory.unsafe, 'TRON_ALIGNED_COMPILER_BIRTH_REQUIRED')
    live = inventory.scan()
    need(len(live) == 1 and live[0]['pid'] == child.pid, 'TRON_ALIGNED_SINGLE_COMPILER_CHILD')
    retained = inventory.records.get(child.pid)
    need(retained is not None and retained['origin'] == 'ORIGINAL_POPEN_PREEXEC_PIPE'
         and retained['pidfd'] is not None and not retained['gone'], 'TRON_ALIGNED_COMPILER_PIDFD_REQUIRED')
    current = inventory._read_retained(child.pid)
    need(current is not None and current['uids'] == [os.getuid()] * 4
         and current['ppid'] == os.getpid() and current['pgrp'] == current['session'] == child.pid
         and process_executable(child.pid) == PYTHON,
         'TRON_ALIGNED_COMPILER_STARTUP_IDENTITY')
    need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
    need(os.write(descriptor, b'\x01') == 1, 'TRON_ALIGNED_COMPILER_STARTUP_WRITE')


def resources():
    available = int(re.search(r'^MemAvailable:\s+(\d+) kB$', Path('/proc/meminfo').read_text(), re.M)[1]) * 1024
    free = shutil.disk_usage(PROJECT).free
    need(available >= 2684354560 and free >= 5368709120, 'TRON_ALIGNED_RESOURCE_FLOOR')
    return {'availableRAM': available, 'freeDisk': free}


def no_heavy_work():
    flat = PROJECT / '.internal/runtime/omnichain-flat-profile/flat-wallet/.local'
    for path in (Path('/tmp/lianum-paeg-proof-host.lock'), flat / 'proof-workers/active.lock', flat / 'proof-workers-native-ingress-v3/active.lock'):
        need(not path.exists() and not path.is_symlink(), 'TRON_ALIGNED_PROOF_HOST_BUSY')
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            text = (entry / 'stat').read_text(); comm = text[text.index('(') + 1:text.rindex(') ')]
            need(not re.fullmatch(r'solana-test-val|solana-validato|agave-validator|bitcoind|anvil|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|java|javac', comm),
                 'TRON_ALIGNED_PARALLEL_HEAVY_WORK')
            if comm == 'node':
                args = (entry / 'cmdline').read_bytes().split(b'\0')
                need(not any(b'/proof-workers/' in x or b'/proof-workers-native-ingress-v3/' in x or x.endswith(b'/proof-worker.mjs') for x in args),
                     'TRON_ALIGNED_PARALLEL_NODE_PROVER')
        except FileNotFoundError:
            continue


def publish(path, value):
    with path.open('xb') as handle:
        handle.write(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()); handle.flush(); os.fsync(handle.fileno())
    path.chmod(0o600)


def compile_owned(report):
    global active, active_inventory
    need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
    path = DESTINATION / 'compile-private.log'
    began = time.monotonic()
    row = {'phase': 'compile-fixed-driver-only', 'forced': False, 'signalsSent': [], 'samples': [],
           'spawnAttempted': False, 'popenCreated': False, 'spawnReturned': False, 'startupGranted': False,
           'ownedChildStopped': False, 'compilerExecutableObserved': False, 'logBytes': 0, 'logObservedBytes': 0, 'logTruncated': False,
           'argv': compiler_argv(), 'bootstrapArgv': [str(PYTHON), str(CHILD)]}
    report['compiler'] = row
    selector = selectors.DefaultSelector()
    output = path.open('xb'); path.chmod(0o600)
    startup_path = DESTINATION / 'compile-startup.fifo'
    startup_fd = None; inventory = None; failure = None; first_failure_at = None; cleanup_deadline = None
    term_sent = False; kill_sent = False; log_writable = True; selector_usable = True
    row['cleanupErrors'] = []

    def reject(error):
        nonlocal failure, first_failure_at, cleanup_deadline
        if failure is None:
            failure = error
            first_failure_at = time.monotonic()
            cleanup_deadline = first_failure_at + CLEANUP_SECONDS
            row['failureCode'] = str(error) if re.fullmatch(r'(?:TRON_ALIGNED|LEDGER)_[A-Z0-9_]+', str(error)) else 'TRON_ALIGNED_COMPILER_GUARD_FAILED'
            row['cleanupBudgetOrigin'] = 'FIRST_FAILURE'
            if inventory is not None:
                inventory.constrain_wait_deadline(cleanup_deadline)

    def drain(timeout, *, cleanup=False):
        nonlocal log_writable, selector_usable
        if not selector_usable:
            return
        try:
            events = selector.select(timeout)
        except Exception as error:
            reject(error); selector_usable = False
            row['cleanupErrors'].append('TRON_ALIGNED_COMPILER_CAPTURE_SELECT_FAILED')
            if not cleanup: raise
            return
        for key, _events in events:
            try:
                data = os.read(key.fileobj.fileno(), 65536)
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                row['logObservedBytes'] += len(data)
                selected = data[:max(0, LOG_LIMIT - row['logBytes'])] if log_writable else b''
                if selected:
                    try:
                        count = output.write(selected)
                        need(count == len(selected), 'TRON_ALIGNED_COMPILER_LOG_PARTIAL_WRITE')
                        row['logBytes'] += len(selected)
                    except Exception:
                        log_writable = False
                        raise
                if len(selected) != len(data):
                    row['logTruncated'] = True
                    reject(RuntimeError('TRON_ALIGNED_COMPILER_LOG_LIMIT'))
            except Exception as error:
                reject(error)
                if len(row['cleanupErrors']) < 16:
                    row['cleanupErrors'].append('TRON_ALIGNED_COMPILER_CAPTURE_IO_FAILED')
                if cleanup:
                    try: selector.unregister(key.fileobj)
                    except Exception: pass
                else:
                    raise


    def signal_owned(selected):
        need(inventory is not None, 'TRON_ALIGNED_COMPILER_INVENTORY_REQUIRED')
        sent = inventory.signal_retained(selected)
        row['signalsSent'].extend(value['signal'] for value in sent)
        if sent and selected == signal.SIGKILL:
            row['forced'] = True

    try:
        os.mkfifo(startup_path, 0o600)
        startup_fd = os.open(startup_path, os.O_RDWR | os.O_NONBLOCK | os.O_NOFOLLOW)
        inventory = load_owned_processes().LedgerOwnedProcesses(); active_inventory = inventory
        inventory.constrain_wait_deadline(began + DEADLINE_SECONDS + CLEANUP_SECONDS)
        inventory.activate()
        need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
        row['spawnAttempted'] = True
        try:
            inventory.spawn(row['bootstrapArgv'], cwd=DESTINATION, env=compiler_environment())
            row['spawnReturned'] = True
        finally:
            # Authentication may fail AFTER Popen. Never discard that causal object.
            active = inventory.child
            row['popenCreated'] = active is not None
            if active is not None:
                row['popenPID'] = active.pid
                for name in ('stdout', 'stderr'):
                    stream = getattr(active, name)
                    os.set_blocking(stream.fileno(), False)
                    selector.register(stream, selectors.EVENT_READ, name)
        need(time.monotonic() - began < DEADLINE_SECONDS, 'TRON_ALIGNED_COMPILER_DEADLINE')
        row['startupReaderAcknowledged'] = wait_compiler_reader(inventory, began + STARTUP_SECONDS)
        need(time.monotonic() < began + STARTUP_SECONDS, 'TRON_ALIGNED_COMPILER_STARTUP_READER_DEADLINE')
        grant_compiler_startup(inventory, startup_fd)
        row['startupGranted'] = True
        os.close(startup_fd); startup_fd = None
        row['identity'] = inventory.records[active.pid]['original']
        while active.poll() is None or selector.get_map():
            drain(0.100)
            need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
            need(time.monotonic() - began < DEADLINE_SECONDS, 'TRON_ALIGNED_COMPILER_DEADLINE')
            live = inventory.scan()
            need(not inventory.unsafe and all(value['pid'] == active.pid for value in live), 'TRON_ALIGNED_COMPILER_IDENTITY_CHANGED')
            for value in live:
                executable = checked_compiler_executable(inventory, value)
                if executable == RUNTIME / 'jdk8/bin/javac': row['compilerExecutableObserved'] = True
            rss = sum(value['rssBytes'] for value in live)
            need(rss <= RSS_LIMIT, 'TRON_ALIGNED_COMPILER_RSS_LIMIT')
            need(len(row['samples']) < 700, 'TRON_ALIGNED_COMPILER_SAMPLE_BOUND')
            row['samples'].append({'rss': rss, 'identities': live, **resources()})
            need(failure is None, 'TRON_ALIGNED_COMPILER_REJECTED')
        need(active.poll() == 0 and not interrupted, 'TRON_ALIGNED_COMPILER_REJECTED')
    except Exception as error:
        reject(error)
    finally:
        # Closing without the one-byte grant causes EOF rejection in the child.
        if startup_fd is not None:
            os.close(startup_fd); startup_fd = None
        if cleanup_deadline is None:
            cleanup_deadline = time.monotonic() + CLEANUP_SECONDS
            row['cleanupBudgetOrigin'] = 'CLEANUP_ENTRY'
        row['cleanupDeadlineElapsedMilliseconds'] = (cleanup_deadline - began) * 1000
        row['cleanupBudgetMilliseconds'] = CLEANUP_SECONDS * 1000
        if inventory is not None:
            inventory.constrain_wait_deadline(cleanup_deadline)
            while time.monotonic() < cleanup_deadline:
                try:
                    # A failed capture never grants signal authority; helper rejects
                    # unknown children and preserves the unsafe latch and lock.
                    live = inventory.scan()
                    if live and not term_sent:
                        signal_owned(signal.SIGTERM); term_sent = True
                    if live and first_failure_at is not None and time.monotonic() - first_failure_at >= 5 and not kill_sent:
                        signal_owned(signal.SIGKILL); kill_sent = True
                    if active is not None and active.poll() is not None and not live and (not selector_usable or not selector.get_map()):
                        break
                except Exception as error:
                    reject(error)
                    if active is not None and active.poll() is not None and (not selector_usable or not selector.get_map()):
                        break
                drain(min(0.100, max(0, cleanup_deadline - time.monotonic())), cleanup=True)
                if not selector_usable or not selector.get_map():
                    time.sleep(min(0.050, max(0, cleanup_deadline - time.monotonic())))
            try:
                row['ownedChildStopped'] = inventory.finish()
            except Exception as error:
                row['ownedChildStopped'] = False; reject(error)
            try:
                row['processInventory'] = inventory.receipt()
            except Exception as error:
                reject(error); row['processInventory'] = None
        if active is not None:
            row['exitCode'] = active.poll()
            for name in ('stdout', 'stderr'):
                stream = getattr(active, name)
                if stream is not None:
                    try: stream.close()
                    except Exception as error: reject(error)
        else:
            row['exitCode'] = None
        try: selector.close()
        except Exception as error: reject(error)
        try:
            output.flush(); os.fsync(output.fileno())
        except Exception as error:
            reject(error)
            row['cleanupErrors'].append('TRON_ALIGNED_COMPILER_LOG_FINALIZE_FAILED')
        finally:
            try: output.close()
            except Exception as error: reject(error)
        row['milliseconds'] = (time.monotonic() - began) * 1000
        row['peakRSS'] = max(int(resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss) * 1024,
                             max((sample['rss'] for sample in row['samples']), default=0))
        try:
            row['logSHA256'] = digest(path)
        except Exception as error:
            reject(error); row['logSHA256'] = None
        if row['ownedChildStopped']:
            active = None; active_inventory = None
            startup_path.unlink()
    if failure is not None:
        raise failure
    need(row['spawnReturned'] and row['popenCreated'] and row['startupGranted'] and row['compilerExecutableObserved'] and row['ownedChildStopped']
         and row['exitCode'] == 0 and not row['signalsSent'] and row['forced'] is False
         and 0 < row['milliseconds'] < DEADLINE_SECONDS * 1000 and row['logObservedBytes'] <= LOG_LIMIT
         and row['logTruncated'] is False and 0 < row['peakRSS'] <= RSS_LIMIT and bool(row['samples']) and not interrupted,
         'TRON_ALIGNED_COMPILER_CLEAN_ACCEPTANCE')


def main():
    global owner_pid
    need(sys.argv[1:] == ['--build-reviewed-aligned-rocksdb'], 'TRON_ALIGNED_EXACT_BUILD_OPT_IN')
    need(sys.platform == 'linux' and os.uname().machine == 'x86_64' and sys.version_info >= (3, 12), 'TRON_ALIGNED_LINUX_X64_PYTHON312')
    no_heavy_work(); verified = inputs(); resources()
    LOCK_DIRECTORY.mkdir(mode=0o700, exist_ok=True)
    need(LOCK_DIRECTORY.resolve(strict=True) == LOCK_DIRECTORY and LOCK_DIRECTORY.stat().st_uid == os.getuid()
         and stat.S_IMODE(LOCK_DIRECTORY.stat().st_mode) == 0o700, 'TRON_ALIGNED_SHARED_LOCK_DIRECTORY')
    lock_path = LOCK_DIRECTORY / 'active.lock'
    descriptor = os.open(lock_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    lock_identity = os.fstat(descriptor); owner_pid = os.getpid()
    report = {'schema': 'LIANUM_TRON_ALIGNED_ROCKSDB_BUILD_V1', 'success': False, 'canonicalRuntimeRelease': None,
              'candidateRuntimeRelease': None, 'nativeNodesStarted': False, 'keysOrWitnessesCreated': False,
              'historicalReportsRecreated': False, 'inputs': verified,
              'delta': {'storageEngine': 'ROCKSDB', 'genesisTimestampMs': '1749999999000', 'sourceLiteralChanges': 2},
              'limits': {'compilerHeapBytes': 268435456, 'compilerRSSBytes': RSS_LIMIT, 'deadlineSeconds': DEADLINE_SECONDS, 'logBytes': LOG_LIMIT}}
    created = False
    previous = {s: signal.getsignal(s) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        os.write(descriptor, json.dumps({'pid': owner_pid, 'fixedAlignedCandidateCompiler': True}).encode()); os.fsync(descriptor)
        for s in previous:
            signal.signal(s, forward_signal)
        DESTINATION.mkdir(mode=0o700); created = True; assert_owned_destination(DESTINATION)
        for name in ('classes', 'original-classes', 'empty-sourcepath', 'tmp'):
            (DESTINATION / name).mkdir(mode=0o700)
        original_names = {'OwnedTronNativeDriver.class': 'OwnedTronNativeDriver.class',
            'OwnedTronNativeDriver$OwnedShutdown.class': 'OwnedTronNativeDriver$OwnedShutdown.class',
            'Args.class': 'org/tron/core/config/args/Args.class', 'Manager.class': 'org/tron/core/db/Manager.class',
            'Manager$1.class': 'org/tron/core/db/Manager$1.class', 'Manager$ValidateSignTask.class': 'org/tron/core/db/Manager$ValidateSignTask.class',
            'OwnedLocalTronReplayRecorder.class': 'org/tron/core/db/OwnedLocalTronReplayRecorder.class'}
        for source, target in original_names.items():
            data = regular(RUNTIME / 'driver' / source)
            if source == 'Args.class':
                data = regular(RUNTIME / 'reviewed-offline-agree-zero-v1/classes/org/tron/core/config/args/Args.class')
            out = DESTINATION / 'original-classes' / target; out.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            with out.open('xb') as handle:
                handle.write(data)
            out.chmod(0o600)
        compile_owned(report)
        report['outputs'] = output_inventory(DESTINATION / 'classes')
        need(inputs() == verified, 'TRON_ALIGNED_INPUTS_CHANGED')
        need(not interrupted, 'TRON_ALIGNED_OWNER_INTERRUPTED')
        report['success'] = True
    except Exception as error:
        report['errorCode'] = str(error) if re.fullmatch(r'TRON_ALIGNED_[A-Z0-9_]+', str(error)) else 'TRON_ALIGNED_BUILD_FAILED'
        raise
    finally:
        try:
            unchanged = inputs() == verified
        except Exception:
            unchanged = False
            report['errorCode'] = report.get('errorCode', 'TRON_ALIGNED_FINAL_INPUT_RECHECK_FAILED')
        stopped = ('compiler' not in report) or report['compiler'].get('ownedChildStopped') is True
        report['cleanup'] = {'ownedCompilerStopped': stopped, 'originalInputsUnmodified': unchanged, 'interrupted': interrupted}
        report['success'] = report['success'] and stopped and unchanged and not interrupted
        if created:
            publish(DESTINATION / 'build-report.json', report)
        os.close(descriptor)
        if stopped:
            retained = lock_path.lstat()
            need(stat.S_ISREG(retained.st_mode) and retained.st_uid == os.getuid() and retained.st_ino == lock_identity.st_ino
                 and retained.st_dev == lock_identity.st_dev, 'TRON_ALIGNED_LOCK_OWNER')
            lock_path.unlink()
        for s, handler in previous.items():
            signal.signal(s, handler)
    need(report['success'], 'TRON_ALIGNED_BUILD_REJECTED')
    print(json.dumps({'success': True, 'reportPath': str(DESTINATION / 'build-report.json'), 'outputs': report['outputs'], 'canonicalRuntimeRelease': None}))


if __name__ == '__main__':
    main()
