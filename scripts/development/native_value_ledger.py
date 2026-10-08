"""Fixed new Solidity-ledger build only; source literal publication stays manual.

Sampled resource limits are not kernel caps.
No caller command/path/pin/environment or historical output is accepted.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import sys
import tarfile
import time
import traceback
import uuid

from workspace import ROOT, DEV, RUNTIME, layout, source_files
from ledger_owned_processes import LedgerOwnedProcesses, LedgerProcessError

NODE_ARCHIVE_SHA256 = "14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
NODE_NAME = "node-v24.19.0-linux-x64"
NODE = DEV / "toolchains" / NODE_NAME / "bin/node"
ARCHIVE = DEV / "downloads" / (NODE_NAME + ".tar.xz")
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
ENTRY = FLAT / "scripts/prepare-development-native-value-ledger-v5.mjs"
OUTPUT = FLAT / ".local/development-native-value-ledger/v5"
REPORTS = DEV / "reports/native-value-dev-ledger-build-v5"
PROOF_LOCK = Path("/tmp/lianum-paeg-proof-host.lock")
ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
AVAILABLE_FLOOR = 2684354560
DISK_FLOOR = 5368709120
RSS_LIMIT = 3221225472
COMPILE_SECONDS = 600
CLEANUP_SECONDS = 15
SIGNAL_GRACE_SECONDS = 5
SAMPLE_SECONDS = 0.250
OUTPUT_LIMIT = 1024 * 1024


class GuardError(Exception):
    pass


def require(value, code):
    if not value:
        raise GuardError(code)


def regular(path, maximum=128 * 1024 * 1024):
    require(path.is_absolute() and path.resolve() == path, "LEDGER_PHYSICAL_FILE_REQUIRED")
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "LEDGER_REGULAR_FILE_REQUIRED")
    with path.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        value = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    require(len(value) == before.st_size and len(value) <= maximum and
            all(getattr(before, key) == getattr(opened, key) == getattr(after, key)
                for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")),
            "LEDGER_FILE_CHANGED_DURING_READ")
    return value


def sha(value):
    return hashlib.sha256(value).hexdigest()


def checked_node():
    require(sha(regular(ARCHIVE)) == NODE_ARCHIVE_SHA256, "LEDGER_OFFICIAL_NODE_ARCHIVE_PIN")
    with tarfile.open(ARCHIVE) as archive:
        members = [row for row in archive if row.name == NODE_NAME + "/bin/node"]
        require(len(members) == 1 and members[0].isfile() and
                members[0].size <= 128 * 1024 * 1024, "LEDGER_NODE_ARCHIVE_ENTRY")
        with archive.extractfile(members[0]) as stream:
            node_sha = hashlib.file_digest(stream, "sha256").hexdigest()
    require(sha(regular(NODE)) == node_sha, "LEDGER_NODE_EXECUTABLE_PIN")
    return {"version": "24.19.0", "archiveSHA256": NODE_ARCHIVE_SHA256, "nodeSHA256": node_sha}


def sample(inventory=None):
    memory = re.search(r"^MemAvailable:\s+(\d+)\s+kB$", Path("/proc/meminfo").read_text(), re.M)
    require(memory, "LEDGER_AVAILABLE_RAM_UNAVAILABLE")
    disk = os.statvfs(ROOT)
    value = {"availableRAMBytes": int(memory[1]) * 1024,
             "freeDiskBytes": disk.f_bavail * disk.f_frsize, "rssBytes": 0}
    require(value["availableRAMBytes"] >= AVAILABLE_FLOOR, "LEDGER_AVAILABLE_RAM_FLOOR")
    require(value["freeDiskBytes"] >= DISK_FLOOR, "LEDGER_DISK_FLOOR")
    if inventory is not None:
        members = inventory.scan()
        value["rssBytes"] = sum(row["rssBytes"] for row in members)
        require(not inventory.unsafe, "LEDGER_UNAUTHENTICATED_DESCENDANT")
        require(all(row["pid"] == inventory.child.pid for row in members), "LEDGER_UNEXPECTED_DESCENDANT")
    require(value["rssBytes"] <= RSS_LIMIT, "LEDGER_PROCESS_RSS_LIMIT")
    return value


def source_capsule():
    """Evidence only; this table never selects the release or grants a loader brand."""
    rows = []
    for target, row in sorted(source_files(layout()).items()):
        actual = regular(RUNTIME / target)
        require(sha(actual) == row["sha256"], "LEDGER_RUNTIME_SOURCE_NOT_SYNCHRONIZED")
        rows.append({"source": row["source"], "sourceSHA256": row["sourceSHA256"],
                     "runtime": target, "runtimeSHA256": sha(actual)})
    for path in [Path(__file__).resolve(), ROOT / "scripts/development/ledger_owned_processes.py",
                 ROOT / "scripts/development/workspace.py",
                 ROOT / "scripts/development/import_paths.py", ROOT / "scripts/layout.json"]:
        rows.append({"source": path.relative_to(ROOT).as_posix(), "sourceSHA256": sha(regular(path))})
    return rows


def _task_source_capsule(task):
    rows = source_capsule()
    if task is not None:
        from native_artifact_tasks import fixed_w39_task
        require(task is fixed_w39_task(), "LEDGER_FIXED_TASK_REQUIRED")
        rows = list(rows)
        for path in (ROOT / "scripts/development/native_value_w39.py",
                     ROOT / "scripts/development/native_artifact_tasks.py"):
            rows.append({"source": path.relative_to(ROOT).as_posix(), "sourceSHA256": sha(regular(path))})
    return rows


def main():
    return _run_fixed_task()


def run_w39():
    from native_artifact_tasks import fixed_w39_task
    return _run_fixed_task(fixed_w39_task())


def _run_fixed_task(task=None):
    if task is not None:
        from native_artifact_tasks import fixed_w39_task
        require(task is fixed_w39_task(), "LEDGER_FIXED_TASK_REQUIRED")
    entry = task.entry if task is not None else ENTRY
    output_directory = task.output if task is not None else OUTPUT
    reports_directory = task.reports if task is not None else REPORTS
    output_names = task.output_names if task is not None else ("compiled.json", "receipt.json")
    wrapper = task.wrapper if task is not None else Path(__file__).resolve()
    exec_args = task.exec_args if task is not None else ()
    require(task is None or (len(sys.argv) == 1 and Path(sys.argv[0]).resolve() == wrapper),
            "LEDGER_FIXED_W39_WRAPPER_INVOCATION")
    require(len(sys.argv) == 1 and Path(__file__).resolve() == ROOT / "scripts/development/native_value_ledger.py",
            "LEDGER_FIXED_WRAPPER_INVOCATION")
    require(Path.cwd().resolve() == ROOT, "LEDGER_FIXED_WRAPPER_CWD")
    require(not any((FLAT / ".local").rglob("active.lock")), "LEDGER_NATIVE_OR_PROOF_SLOT_BUSY")
    require(not any((output_directory / name).exists() for name in output_names),
            "LEDGER_EXISTING_OUTPUT_RETAINED")
    reports_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    require(reports_directory.resolve() == reports_directory, "LEDGER_PHYSICAL_REPORT_DIRECTORY")
    attempt = reports_directory / ("attempt-" + str(uuid.uuid4()))
    attempt.mkdir(mode=0o700)
    report = {"schema": task.schema if task is not None else "LIANUM_NEW_NATIVE_VALUE_LEDGER_RESOURCE_RECEIPT_V5", "phase": "starting",
              "runId": attempt.name[8:], "failure": None, "childExitCode": None,
              "sourceClosureUnchanged": False, "ownedCleanupConfirmed": False,
              "historicalArtifactRecovered": False, "proofGenerated": False, "nativeNodesStarted": False,
              "strictKernelLimit": False, "samples": [], "signals": [], "node": None,
              "workerSpawned": False, "proofLockAcquired": False, "proofLockReleased": False,
              "proofLockRetained": False, "cleanupExceptions": [], "privateErrors": []}
    def private_json(path, value):
        temporary = path.with_name(path.name + ".tmp-" + str(os.getpid()))
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            data = (json.dumps(value, indent=2) + "\n").encode()
            while data:
                written = os.write(fd, data)
                require(written > 0, "LEDGER_REPORT_SHORT_WRITE")
                data = data[written:]
            os.fsync(fd)
        finally:
            os.close(fd)
        temporary.replace(path)
    save = lambda: private_json(attempt / "resources.json", report)
    sources = None
    descriptors = {}
    child = None
    inventory = None
    began = time.monotonic()
    failure_at = None
    cleanup_deadline = None
    output = {name: {"bytes": 0, "hash": hashlib.sha256(), "storedBytes": 0,
                     "storedHash": hashlib.sha256(), "fd": None} for name in ("stdout", "stderr")}
    selector = selectors.DefaultSelector()

    def fail(code):
        nonlocal failure_at, cleanup_deadline
        if report["failure"] is None:
            report["failure"] = code
            failure_at = time.monotonic()
            if cleanup_deadline is None:
                cleanup_deadline = failure_at + CLEANUP_SECONDS
                report["cleanupBudgetOrigin"] = "FIRST_FAILURE"
            report["firstFailureElapsedMilliseconds"] = (failure_at - began) * 1000
            report["cleanupDeadlineElapsedMilliseconds"] = (cleanup_deadline - began) * 1000
            if inventory is not None:
                inventory.constrain_wait_deadline(cleanup_deadline)

    def caught(error, stage):
        # Unexpected exceptions must be failed receipts, including cleanup.
        # Their text/trace and compiler streams stay in this private attempt.
        known = isinstance(error, (GuardError, LedgerProcessError))
        code = str(error) if known and re.fullmatch(r"LEDGER_[A-Z0-9_]{1,120}", str(error)) else (
            "LEDGER_WATCHDOG_IO_FAILURE" if isinstance(error, OSError) else "LEDGER_WATCHDOG_UNEXPECTED_EXCEPTION")
        fail(code)
        if len(report["privateErrors"]) < 8:
            name = "private-error-" + str(len(report["privateErrors"]) + 1) + ".json"
            row = {"stage": stage, "exceptionType": type(error).__name__, "code": code,
                   "traceback": "".join(traceback.format_exception(type(error), error, error.__traceback__))[:8192]}
            try:
                private_json(attempt / name, row)
                report["privateErrors"].append({"path": name, "stage": stage, "code": code})
            except Exception:
                # Never replace the original rejection if private recording fails.
                if len(report["cleanupExceptions"]) < 16:
                    report["cleanupExceptions"].append("LEDGER_PRIVATE_ERROR_RECORD_FAILED")

    def take_output(name, data):
        row = output[name]
        row["bytes"] += len(data)
        row["hash"].update(data)
        remaining = OUTPUT_LIMIT - sum(item["storedBytes"] for item in output.values())
        retained_data = data[:max(0, remaining)]
        pending = retained_data
        while pending:
            written = os.write(row["fd"], pending)
            require(written > 0, "LEDGER_PRIVATE_LOG_SHORT_WRITE")
            pending = pending[written:]
        row["storedBytes"] += len(retained_data)
        row["storedHash"].update(retained_data)
        if sum(item["bytes"] for item in output.values()) > OUTPUT_LIMIT:
            fail("LEDGER_COMPILER_OUTPUT_LIMIT")

    def capture_exit():
        if child is not None:
            report["childExitCode"] = child.poll()
            report["childExit"] = {"code": child.returncode if child.returncode is not None and child.returncode >= 0 else None,
                                   "signal": signal.Signals(-child.returncode).name if child.returncode is not None and child.returncode < 0 else None}

    def signal_owned(selected):
        require(inventory is not None, "LEDGER_SIGNAL_INVENTORY_REQUIRED")
        report["signals"].extend(inventory.signal_retained(selected))

    def interrupted(signum, _frame):
        fail("LEDGER_WRAPPER_INTERRUPTED")

    previous_handlers = {}
    try:
        for name in (signal.SIGTERM, signal.SIGINT):
            previous_handlers[name] = signal.signal(name, interrupted)
        sample()
        report["node"] = checked_node()
        sources = _task_source_capsule(task)
        private_json(attempt / "source-pins.json", sources)
        save()
        for path in (DEV / "evm-lab.lock", PROOF_LOCK):
            if path == PROOF_LOCK:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                descriptors[path] = (fd, os.fstat(fd))
                report["proofLockAcquired"] = True
                os.write(fd, json.dumps({"parentPID": os.getpid(), "runId": report["runId"],
                                         "mode": task.lock_mode if task is not None else "NEW_NATIVE_VALUE_LEDGER_V5"}).encode())
            else:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                descriptors[path] = (fd, os.fstat(fd))
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for name, row in output.items():
            row["fd"] = os.open(attempt / (name + ".log"), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        inventory = LedgerOwnedProcesses()
        inventory.constrain_wait_deadline(began + COMPILE_SECONDS + CLEANUP_SECONDS)
        inventory.activate()
        sample()
        require(time.monotonic() - began < COMPILE_SECONDS, "LEDGER_COMPILATION_DEADLINE")
        require(report["failure"] is None, "LEDGER_INTERRUPTED_BEFORE_CHILD")
        try:
            child = inventory.spawn([str(NODE), *exec_args, str(entry)], cwd=FLAT, env=ENV)
        finally:
            # Popen can succeed while authentication subsequently fails. Keep
            # the original object so that missing birth never means no child.
            child = inventory.child
            report["workerSpawned"] = child is not None
        report["childIdentity"] = inventory.records[child.pid]["original"]
        report["phase"] = "compiling"
        for name in ("stdout", "stderr"):
            stream = getattr(child, name)
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)
        term_sent = kill_sent = False
        next_sample = time.monotonic()
        next_save = next_sample + 5
        while child.poll() is None or selector.get_map():
            for key, _events in selector.select(SAMPLE_SECONDS):
                data = os.read(key.fileobj.fileno(), 65536)
                if not data:
                    selector.unregister(key.fileobj)
                else:
                    take_output(key.data, data)
            if time.monotonic() >= next_sample:
                next_sample = time.monotonic() + SAMPLE_SECONDS
                try:
                    row = sample(inventory)
                    report["samples"].append({"elapsedMilliseconds": (time.monotonic() - began) * 1000, **row})
                    require(len(report["samples"]) <= 2600, "LEDGER_RESOURCE_SAMPLE_BOUND")
                except Exception as error:
                    caught(error, "resource-sample")
                if time.monotonic() >= next_save:
                    next_save = time.monotonic() + 5
                    save()
            if time.monotonic() - began >= COMPILE_SECONDS:
                fail("LEDGER_COMPILATION_DEADLINE")
            if report["failure"] is not None and not term_sent:
                signal_owned(signal.SIGTERM)
                term_sent = True
            if failure_at is not None and time.monotonic() - failure_at >= SIGNAL_GRACE_SECONDS and not kill_sent:
                signal_owned(signal.SIGKILL)
                kill_sent = True
            if cleanup_deadline is not None and time.monotonic() >= cleanup_deadline:
                fail("LEDGER_OWNED_CLEANUP_UNCONFIRMED")
                break
        capture_exit()
        if report["childExitCode"] != 0:
            fail("LEDGER_COMPILER_EXIT_NONZERO")
        report["ownedCleanupConfirmed"] = inventory.cleanup_confirmed()
        if not report["ownedCleanupConfirmed"]:
            fail("LEDGER_OWNED_CLEANUP_UNCONFIRMED")
        report["sourceClosureUnchanged"] = _task_source_capsule(task) == sources
        if not report["sourceClosureUnchanged"]:
            fail("LEDGER_SOURCE_CHANGED")
        require(checked_node() == report["node"], "LEDGER_NODE_CHANGED_AFTER_BUILD")
        for name in output_names:
            path = output_directory / name
            if path.exists():
                data = regular(path)
                report[name] = {"path": path.relative_to(FLAT).as_posix(), "bytes": len(data), "sha256": sha(data)}
        if report["failure"] is None:
            require(all(name in report for name in output_names), "LEDGER_OUTPUT_ABSENT")
    except Exception as error:
        caught(error, "guard-body")
    finally:
        cleanup_began = time.monotonic()
        if cleanup_deadline is None:
            cleanup_deadline = cleanup_began + CLEANUP_SECONDS
            report["cleanupBudgetOrigin"] = "CLEANUP_ENTRY"
            report["cleanupDeadlineElapsedMilliseconds"] = (cleanup_deadline - began) * 1000
        report["cleanupBudgetMilliseconds"] = CLEANUP_SECONDS * 1000
        if inventory is not None:
            inventory.constrain_wait_deadline(cleanup_deadline)
        if inventory is not None:
            try:
                # Unknown adopted children never become signal targets. A lost
                # birth or identity keeps unsafe latched and the lock retained.
                live = inventory.scan()
                if live and time.monotonic() < cleanup_deadline:
                    signal_owned(signal.SIGTERM)
                killed = False
                while live and time.monotonic() < cleanup_deadline:
                    if time.monotonic() - cleanup_began >= SIGNAL_GRACE_SECONDS and not killed:
                        signal_owned(signal.SIGKILL); killed = True
                    # Drain only this child's streams during bounded cleanup.
                    for key, _events in selector.select(SAMPLE_SECONDS):
                        data = os.read(key.fileobj.fileno(), 65536)
                        if data:
                            take_output(key.data, data)
                        else:
                            selector.unregister(key.fileobj)
                    if not selector.get_map():
                        time.sleep(SAMPLE_SECONDS)
                    live = inventory.scan()
                report["ownedCleanupConfirmed"] = inventory.finish()
                if not report["ownedCleanupConfirmed"]:
                    fail("LEDGER_OWNED_CLEANUP_UNCONFIRMED")
            except Exception as error:
                report["ownedCleanupConfirmed"] = False
                caught(error, "owned-process-cleanup")
            try:
                report["processInventory"] = inventory.receipt()
            except Exception as error:
                report["ownedCleanupConfirmed"] = False
                caught(error, "process-inventory-receipt")
        elif child is None:
            report["ownedCleanupConfirmed"] = True
        else:
            fail("LEDGER_OWNED_CLEANUP_UNCONFIRMED")
        try:
            capture_exit()
        except Exception as error:
            report["ownedCleanupConfirmed"] = False
            caught(error, "child-exit-observation")
        try:
            selector.close()
        except Exception as error:
            caught(error, "selector-close")
        for name in ("stdout", "stderr"):
            try:
                if child is not None and getattr(child, name, None) is not None:
                    getattr(child, name).close()
            except Exception as error:
                caught(error, "child-stream-close")
            try:
                if output[name]["fd"] is not None:
                    try:
                        os.fsync(output[name]["fd"])
                    finally:
                        os.close(output[name]["fd"]); output[name]["fd"] = None
            except Exception as error:
                caught(error, "private-log-close")
        if sources is not None:
            try:
                report["sourceClosureUnchanged"] = _task_source_capsule(task) == sources
                require(report["sourceClosureUnchanged"], "LEDGER_SOURCE_CHANGED_DURING_CLEANUP")
                require(checked_node() == report["node"], "LEDGER_NODE_CHANGED_DURING_CLEANUP")
            except Exception as error:
                report["sourceClosureUnchanged"] = False
                caught(error, "final-source-capsule")
        for path, (fd, owned) in reversed(list(descriptors.items())):
            try:
                current = path.lstat()
                require(current.st_dev == owned.st_dev and current.st_ino == owned.st_ino and current.st_uid == os.getuid(),
                        "LEDGER_LOCK_IDENTITY_CHANGED")
                if path == PROOF_LOCK:
                    if report["ownedCleanupConfirmed"]:
                        path.unlink()
                        report["proofLockReleased"] = True
                    else:
                        report["proofLockRetained"] = True
                        fail("LEDGER_OWNED_CLEANUP_UNCONFIRMED")
            except Exception as error:
                if path == PROOF_LOCK:
                    report["proofLockRetained"] = True
                caught(error, "lock-release")
            finally:
                try:
                    os.close(fd)
                except Exception as error:
                    caught(error, "lock-descriptor-close")
        for name, handler in previous_handlers.items():
            try:
                signal.signal(name, handler)
            except Exception as error:
                caught(error, "signal-handler-restore")
        if report["failure"] is None:
            if not (report["workerSpawned"] and report["childExitCode"] == 0 and
                    report["sourceClosureUnchanged"] and report["ownedCleanupConfirmed"] and report["proofLockReleased"]
                    and time.monotonic() <= cleanup_deadline):
                fail("LEDGER_ACCEPTANCE_JOIN_INCOMPLETE")
        report["phase"] = "completed" if report["failure"] is None else "failed"
        report["output"] = {name: {"observedBytes": row["bytes"], "observedSHA256": row["hash"].hexdigest(),
                                   "privatePath": name + ".log", "storedBytes": row["storedBytes"],
                                   "storedSHA256": row["storedHash"].hexdigest(), "truncated": row["bytes"] != row["storedBytes"]}
                            for name, row in output.items()}
        report["milliseconds"] = (time.monotonic() - began) * 1000
        try:
            save()
            os.chmod(attempt / "resources.json", 0o600)
        except Exception as error:
            caught(error, "final-resource-receipt")
            report["phase"] = "failed"
            # Best-effort retry is recording only; it never reruns the compiler.
            try:
                save()
            except Exception:
                pass
        print(json.dumps({"phase": report["phase"], "runId": report["runId"], "failure": report["failure"],
                          "childExitCode": report["childExitCode"], "ownedCleanupConfirmed": report["ownedCleanupConfirmed"],
                          "sourceClosureUnchanged": report["sourceClosureUnchanged"], "historicalArtifactRecovered": False}))
    return 0 if report["failure"] is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
