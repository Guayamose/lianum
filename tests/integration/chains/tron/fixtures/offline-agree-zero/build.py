"""Fixed public offline Args rebuild; never activates the canonical runtime.

Usage: python3 tests/integration/chains/tron/fixtures/offline-agree-zero/build.py --build-reviewed-offline-args
No network acquisition, caller-selected path, witness, key, node or ledger.
"""
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
PROJECT = next((p for p in HERE.parents if (p / 'scripts/layout.json').is_file()), None)
if PROJECT is None:
    internal = next(p for p in HERE.parents if p.name == '.internal')
    PROJECT = internal.parent
RUNTIME = PROJECT / '.internal/runtime/omnichain-product/.local/owned-tron-native-value-v1'
DESTINATION = RUNTIME / 'reviewed-offline-agree-zero-v1'
SOURCE_PINS = {
    'source/org/tron/core/config/args/Args.java': '7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d',
    'source/TronOfflineConfigurationDiagnostic.java': '10c1621646ab0f61ee27befee41fbe9f63d71c123b07742e97a06d42ec275a19',
    'source/lombok.config': '30f06efd1af28f1e67788ae39469bd39edb14e58845baac0e173481f121bf13f',
    'public-offline.conf': '39392755b5cd7130b10b550a56e715b7ff96bdef560c7a81308218c98a1249da',
}
PINS = {
    'FullNode-offline.jar': 'ac1e47f7648c7b88143381cb19b76f4cec78036c5490f3fa90c018630bd69485',
    'build-dependencies/lombok-1.18.34.jar': 'c27d6b2aff56241d1b07fcbcc6b183709e6b432c80f7374eeb1d823e86d4b81a',
    'driver/Args.class': '2598f93f3507449db71319b4a37f1ce86e395f38e50b840c61e06db781204d15',
}


def need(condition, code):
    if not condition:
        raise RuntimeError(code)


def digest(path):
    need(path.resolve(strict=True) == path and path.is_file() and not path.is_symlink(), 'TRON_BUILD_REGULAR_PATH')
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def inputs():
    for path, expected in SOURCE_PINS.items():
        need(digest(HERE / path) == expected, 'TRON_BUILD_REVIEWED_SOURCE_PIN')
    for path, expected in PINS.items():
        need(digest(RUNTIME / path) == expected, 'TRON_BUILD_ORIGINAL_DEPENDENCY_PIN')
    receipt = HERE.parent / 'jdk-acquisition.json'
    need(digest(receipt) == '0e2404b5ab76d082f5e29f6cb6f584c21230090b290c0d43da832f4f7239b115', 'TRON_BUILD_ORIGINAL_JDK_RECEIPT')
    inventory = json.loads(receipt.read_text())['inventory']
    expected_paths = set()
    for row in inventory:
        relative = Path(row['path']).relative_to('jdk8u504-b01')
        path = RUNTIME / 'jdk8' / relative
        need(path.is_relative_to(RUNTIME / 'jdk8'), 'TRON_BUILD_JDK_PATH')
        expected_paths.add(relative.as_posix())
        observed = path.lstat()
        if row['kind'] == 'symlink':
            need(path.is_symlink() and os.readlink(path) == row['target'], 'TRON_BUILD_JDK_SYMLINK')
        else:
            need(stat.S_IMODE(observed.st_mode) == int(row['mode'], 8), 'TRON_BUILD_JDK_MODE')
            need(observed.st_size == row['bytes'] and digest(path) == row['sha256'], 'TRON_BUILD_JDK_FILE_PIN')
    actual = {p.relative_to(RUNTIME / 'jdk8').as_posix() for p in (RUNTIME / 'jdk8').rglob('*') if p.is_file() or p.is_symlink()}
    need(actual == expected_paths, 'TRON_BUILD_COMPLETE_JDK_CLOSURE')
    return {'sourceSHA256': SOURCE_PINS, 'originalDependenciesSHA256': PINS, 'jdkEntries': len(inventory)}


def idle_gradle_snapshot(pid):
    base = Path('/proc') / str(pid)
    text = (base / 'stat').read_text(); fields = text[text.rindex(') ') + 2:].split()
    executable = os.readlink(base / 'exe'); cwd = os.readlink(base / 'cwd')
    args = (base / 'cmdline').read_bytes().decode().strip('\0').split('\0')
    if (fields[0] != 'S' or executable != '/usr/lib/jvm/java-21-openjdk-amd64/bin/java'
            or len(args) < 3 or args[0] != executable or args[-2] != 'org.gradle.launcher.daemon.bootstrap.GradleDaemon'
            or not re.fullmatch(r'[0-9]+\.[0-9]+(?:\.[0-9]+)?', args[-1])
            or cwd != str(Path.home() / '.gradle/daemon' / args[-1])):
        return None
    ticks = []
    for task in sorted((base / 'task').iterdir()):
        value = (task / 'stat').read_text(); words = value[value.rindex(') ') + 2:].split()
        if words[0] != 'S':
            return None
        ticks.append((task.name, words[11], words[12]))
    return (pid, fields[1], fields[19], executable, cwd, args, ticks) if ticks else None


def no_heavy_work():
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            text = (entry / 'stat').read_text(); comm = text[text.index('(') + 1:text.rindex(') ')]
            if comm == 'java':
                first = idle_gradle_snapshot(int(entry.name))
                if first is not None:
                    time.sleep(0.25)
                    if idle_gradle_snapshot(int(entry.name)) == first:
                        continue
            need(not re.fullmatch(r'solana-test-val|solana-validato|agave-validator|bitcoind|anvil|bb|nargo|cargo|rustc|rust-lld|ld\.lld|cc1|cc1plus|java', comm), 'TRON_BUILD_PARALLEL_HEAVY_WORK')
        except FileNotFoundError:
            continue


def resources(pid=None):
    memory = int(re.search(r'^MemAvailable:\s+(\d+) kB$', Path('/proc/meminfo').read_text(), re.M)[1]) * 1024
    disk = shutil.disk_usage(PROJECT).free
    rss = 0
    if pid:
        try:
            text = Path(f'/proc/{pid}/stat').read_text()
            rss = int(text[text.rindex(') ') + 2:].split()[21]) * os.sysconf('SC_PAGE_SIZE')
        except FileNotFoundError:
            pass
    need(memory >= 2684354560, 'TRON_BUILD_RAM_FLOOR')
    need(disk >= 5368709120, 'TRON_BUILD_DISK_FLOOR')
    need(rss <= 2147483648, 'TRON_BUILD_JAVA_RSS_LIMIT')
    return {'availableRAM': memory, 'freeDisk': disk, 'workerRSS': rss}


def publish(path, value):
    content = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
    with path.open('xb') as handle:
        handle.write(content)
    path.chmod(0o600)


def main():
    need(sys.argv[1:] == ['--build-reviewed-offline-args'], 'TRON_BUILD_EXACT_OPT_IN')
    need(sys.platform == 'linux' and os.uname().machine == 'x86_64' and sys.version_info >= (3, 12), 'TRON_BUILD_LINUX_X64_PYTHON312')
    need(not (PROJECT / '.internal/runtime/omnichain-flat-profile/flat-wallet/.local/proof-workers/active.lock').exists(), 'TRON_BUILD_PROOF_HOST_BUSY')
    need(not Path('/tmp/lianum-paeg-proof-host.lock').exists(), 'TRON_BUILD_PROOF_HOST_BUSY')
    no_heavy_work()
    verified = inputs()
    resources()
    DESTINATION.mkdir(mode=0o700)  # Existing or incomplete builds need explicit review.
    need(DESTINATION.resolve() == DESTINATION and DESTINATION.stat().st_uid == os.getuid(), 'TRON_BUILD_OWNED_DESTINATION')
    guard = HERE.parent / 'tron-candidate-seccomp.py'
    need(digest(guard) == '36241a6e2480a8bcdfb24c7d83499fbb09c8ca8516a912f26ae4d5cd43a8e7bb', 'TRON_BUILD_CHILD_GUARD_PIN')
    spec = importlib.util.spec_from_file_location('tron_socket_guard', guard)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    (DESTINATION / 'empty-sourcepath').mkdir(mode=0o700)
    for name in ['classes', 'diagnostic', 'original-classes']:
        (DESTINATION / name).mkdir(mode=0o700)
    original = DESTINATION / 'original-classes/org/tron/core/config/args/Args.class'
    original.parent.mkdir(parents=True, mode=0o700)
    shutil.copyfile(RUNTIME / 'driver/Args.class', original)
    original.chmod(0o600)
    shutil.copyfile(HERE / 'public-offline.conf', DESTINATION / 'public-offline.conf')
    (DESTINATION / 'public-offline.conf').chmod(0o600)
    report = {'schema': 'LIANUM_TRON_OFFLINE_AGREE_ZERO_BUILD_V1', 'success': False, 'inputs': verified,
              'canonicalRuntimeRelease': None, 'nativeNodesStarted': False, 'keysOrWitnessesCreated': False,
              'historicalReportsRecreated': False, 'steps': [], 'childSocketGuard': True}
    child = None
    interrupted = False

    def stop(signum, frame):
        nonlocal interrupted
        interrupted = True
        if child is not None and child.poll() is None:
            child.terminate()

    for value in [signal.SIGTERM, signal.SIGINT]:
        signal.signal(value, stop)

    def preexec():
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
            os._exit(125)
        module.install_socket_guard()

    owner_pid = os.getpid()

    def run(label, executable, arguments):
        nonlocal child
        need(not interrupted, 'TRON_BUILD_OWNER_INTERRUPTED')
        began = time.monotonic()
        path = DESTINATION / (label + '.log')
        with path.open('xb') as output:
            path.chmod(0o600)
            child = subprocess.Popen([str(executable), *arguments], cwd=DESTINATION,
                env={'HOME': str(DESTINATION), 'TMPDIR': str(DESTINATION), 'LANG': 'C.UTF-8'},
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, close_fds=True, preexec_fn=preexec)
            row = {'label': label, 'pid': child.pid, 'samples': [], 'exitCode': None}
            report['steps'].append(row)
            try:
                while child.poll() is None:
                    need(not interrupted, 'TRON_BUILD_OWNER_INTERRUPTED')
                    need(time.monotonic() - began < 60, 'TRON_BUILD_PHASE_TIMEOUT')
                    need(output.tell() <= 1048576, 'TRON_BUILD_OUTPUT_LIMIT')
                    row['samples'].append(resources(child.pid))
                    time.sleep(0.25)
                row['exitCode'] = child.returncode
                row['elapsedMilliseconds'] = int((time.monotonic() - began) * 1000)
                need(child.returncode == 0, 'TRON_BUILD_JAVA_STEP_FAILED')
            finally:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill(); child.wait()
                row['exitCode'] = child.returncode
                row['ownedChildStopped'] = child.poll() is not None
                child = None
        need(path.stat().st_size <= 1048576, 'TRON_BUILD_OUTPUT_LIMIT')
        row['logSHA256'] = digest(path)
        return path

    jar = str(RUNTIME / 'FullNode-offline.jar')
    lombok = str(RUNTIME / 'build-dependencies/lombok-1.18.34.jar')
    flags = ['-J-Xms64m', '-J-Xmx1536m', '-J-XX:ActiveProcessorCount=2', '-source', '8', '-target', '8',
             '-encoding', 'UTF-8', '-g', '-implicit:none', '-sourcepath', str(DESTINATION / 'empty-sourcepath')]
    java = RUNTIME / 'jdk8/bin/java'
    try:
        run('compile-args', RUNTIME / 'jdk8/bin/javac', [*flags, '-processorpath', lombok,
            '-cp', jar + ':' + lombok, '-d', str(DESTINATION / 'classes'), str(HERE / 'source/org/tron/core/config/args/Args.java')])
        run('compile-diagnostic', RUNTIME / 'jdk8/bin/javac', [*flags, '-proc:none', '-cp', jar,
            '-d', str(DESTINATION / 'diagnostic'), str(HERE / 'source/TronOfflineConfigurationDiagnostic.java')])
        for name, overlay in [('original', 'original-classes'), ('reviewed', 'classes')]:
            log = run('configuration-' + name, java, ['-Xms64m', '-Xmx512m', '-XX:ActiveProcessorCount=2',
                '-Djava.net.preferIPv4Stack=true', '-cp', str(DESTINATION / overlay) + ':' + str(DESTINATION / 'diagnostic') + ':' + jar,
                'TronOfflineConfigurationDiagnostic'])
            rows = [json.loads(line) for line in log.read_text().splitlines() if line.startswith('{') and '"agreeNodeCount"' in line]
            need(len(rows) == 1, 'TRON_BUILD_SINGLE_PUBLIC_CONFIGURATION_RESULT')
            report[name + 'Configuration'] = rows[0]
        need(report['originalConfiguration']['agreeNodeCount'] == 19, 'TRON_BUILD_ORIGINAL_CLAMP_CONFIRMED')
        expected = dict(report['originalConfiguration']); expected['agreeNodeCount'] = 0
        need(report['reviewedConfiguration'] == expected, 'TRON_BUILD_ONLY_EXPLICIT_OFFLINE_ZERO_CHANGED')
        need(report['reviewedConfiguration']['p2pDisable'] is True, 'TRON_BUILD_EXPLICIT_OFFLINE_REQUIRED')
        need(inputs() == verified, 'TRON_BUILD_INPUTS_CHANGED')
        report['classSHA256'] = digest(DESTINATION / 'classes/org/tron/core/config/args/Args.class')
        report['diagnosticClassSHA256'] = digest(DESTINATION / 'diagnostic/TronOfflineConfigurationDiagnostic.class')
        report['success'] = True
    except Exception as error:
        report['errorCode'] = str(error) if re.fullmatch(r'TRON_BUILD_[A-Z0-9_]+', str(error)) else 'TRON_BUILD_FAILED'
        raise
    finally:
        report['cleanup'] = {'ownedCompilerAndDiagnosticChildrenStopped': child is None,
                             'originalCandidateUnmodified': inputs() == verified}
        publish(DESTINATION / 'build-report.json', report)
    print(json.dumps({'success': True, 'reportPath': str(DESTINATION / 'build-report.json'),
                      'classSHA256': report['classSHA256'], 'canonicalRuntimeRelease': None}))


if __name__ == '__main__':
    main()
