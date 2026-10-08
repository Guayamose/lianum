"""One fixed public CRS derivation under the original process/resource guard."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
ENTRY = ROOT / "packages/proofs/scripts/derive-full-public-crs.mjs"
WRAPPER = ROOT / "packages/proofs/scripts/derive-full-public-crs.py"
sys.path.insert(0, str(ROOT / "scripts/development"))
from native_value_ledger import NODE, ENV, PROOF_LOCK, DEV, FLAT, checked_node, sample, regular
from ledger_owned_processes import LedgerOwnedProcesses

ACTIVE_LOCK = FLAT / ".local/proof-workers/active.lock"


def main():
    assert len(sys.argv) == 1 and Path(sys.argv[0]).resolve() == WRAPPER
    assert Path.cwd().resolve() == ROOT
    sources = [WRAPPER, ENTRY, ROOT / "scripts/development/native_value_ledger.py",
               ROOT / "scripts/development/ledger_owned_processes.py"]
    pins = lambda: [{"path": str(path.relative_to(ROOT)),
                     "sha256": hashlib.sha256(regular(path)).hexdigest()} for path in sources]
    before = pins()
    node = checked_node(); sample()
    began = time.monotonic(); deadline = began + 90
    inventory = LedgerOwnedProcesses(); inventory.constrain_wait_deadline(deadline + 15)
    selector = selectors.DefaultSelector()
    child = None; failure = None; descriptors = {}; closed = False
    output = {"stdout": bytearray(), "stderr": bytearray()}
    peak = samples = 0; lock_released = active_lock_released = False
    def interrupted(_signum, _frame):
        raise RuntimeError("PUBLIC_CRS_GUARD_INTERRUPTED")
    handlers = {kind: signal.signal(kind, interrupted) for kind in (signal.SIGTERM, signal.SIGINT)}
    try:
        # These are the existing application, flat-worker/APK and host locks.
        # No stale lock takeover or task descriptor selects another program.
        ACTIVE_LOCK.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        assert ACTIVE_LOCK.parent.resolve() == ACTIVE_LOCK.parent, "PUBLIC_CRS_PHYSICAL_ACTIVE_LOCK_DIRECTORY"
        for path in (ACTIVE_LOCK, DEV / "evm-lab.lock", PROOF_LOCK):
            flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW
            if path in (PROOF_LOCK, ACTIVE_LOCK):
                flags |= os.O_EXCL
            fd = os.open(path, flags, 0o600)
            descriptors[path] = (fd, os.fstat(fd))
            if path in (PROOF_LOCK, ACTIVE_LOCK):
                os.write(fd, json.dumps({"pid": os.getpid(), "parentPID": os.getpid(),
                                         "mode": "ORIGINAL_FULL_PUBLIC_CRS_V1"}).encode())
            else:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        inventory.activate()
        try:
            child = inventory.spawn([str(NODE), "--max-old-space-size=384", str(ENTRY)], cwd=ROOT, env=ENV)
        finally:
            child = inventory.child
        for name in output:
            stream = getattr(child, name); os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)
        while child.poll() is None or selector.get_map():
            for key, _ in selector.select(.250):
                data = os.read(key.fileobj.fileno(), 65536)
                if data:
                    output[key.data].extend(data)
                else:
                    selector.unregister(key.fileobj)
            if sum(map(len, output.values())) > 1048576:
                raise RuntimeError("PUBLIC_CRS_OUTPUT_LIMIT")
            row = sample(inventory); samples += 1; peak = max(peak, row["rssBytes"])
            if time.monotonic() >= deadline:
                raise RuntimeError("PUBLIC_CRS_EXTERNAL_DEADLINE")
        if child.returncode != 0:
            raise RuntimeError("PUBLIC_CRS_CHILD_REJECTED")
        assert pins() == before and checked_node() == node, "PUBLIC_CRS_GUARD_SOURCE_CHANGED"
    except BaseException as error:
        failure = str(error)
    finally:
        cleanup_started = time.monotonic(); inventory.constrain_wait_deadline(cleanup_started + 15)
        try:
            live = inventory.scan() if inventory.active else []
            if live:
                inventory.signal_retained(signal.SIGTERM)
            killed = False
            while live and time.monotonic() - cleanup_started < 15:
                if time.monotonic() - cleanup_started >= 5 and not killed:
                    inventory.signal_retained(signal.SIGKILL); killed = True
                for key, _ in selector.select(.250):
                    data = os.read(key.fileobj.fileno(), 65536)
                    if data and sum(map(len, output.values())) + len(data) <= 1048576:
                        output[key.data].extend(data)
                    if not data:
                        selector.unregister(key.fileobj)
                if not selector.get_map():
                    time.sleep(.250)
                live = inventory.scan()
            closed = inventory.finish() if inventory.active else child is None
        except BaseException as error:
            closed = False; failure = failure or str(error)
        selector.close()
        if child:
            for name in output:
                getattr(child, name).close()
        try:
            assert pins() == before and checked_node() == node, "PUBLIC_CRS_GUARD_FINAL_SOURCE_CHANGED"
        except BaseException as error:
            failure = failure or str(error)
        for path, (fd, original) in reversed(list(descriptors.items())):
            try:
                actual = path.lstat()
                assert (actual.st_dev, actual.st_ino, actual.st_uid) == (original.st_dev, original.st_ino, os.getuid())
                if path in (PROOF_LOCK, ACTIVE_LOCK) and closed:
                    path.unlink()
                    if path == PROOF_LOCK:
                        lock_released = True
                    else:
                        active_lock_released = True
            except BaseException as error:
                failure = failure or str(error)
            finally:
                os.close(fd)
        accepted = not failure and closed and child is not None and child.returncode == 0 and lock_released and active_lock_released
        record = {"format": "LIANUM_FULL_PUBLIC_CRS_ORIGINAL_GUARD_V1", "accepted": bool(accepted),
                  "exitCode": child.poll() if child else None, "failure": failure,
                  "ownedCleanupConfirmed": closed, "proofLockReleased": lock_released,
                  "flatActiveLockReleased": active_lock_released,
                  "flatActiveLockRetained": ACTIVE_LOCK in descriptors and not active_lock_released,
                  "externalSamples": samples, "peakWorkerRSS": peak, "strictKernelLimit": False,
                  "proofGenerated": False, "sourcePins": before,
                  "outputSHA256": {name: hashlib.sha256(data).hexdigest() for name, data in output.items()},
                  "outputBytes": {name: len(data) for name, data in output.items()}, "inventory": inventory.receipt()}
        for kind, handler in handlers.items():
            signal.signal(kind, handler)
        print(json.dumps(record))
        return 0 if accepted else 1


if __name__ == "__main__":
    sys.exit(main())
