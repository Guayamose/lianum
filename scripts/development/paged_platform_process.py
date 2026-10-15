#!/usr/bin/env python3
"""Keep the fixed Paged backend out of the terminal's foreground signal group.

The same original Node entry owns capture. This parent forwards one signal to
its original pidfd and waits; it never signals a process group or escalates.
"""
import os
from pathlib import Path
import signal
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PROFILES = ("paged-native-new", "paged-native-reopen", "paged-mixed-new", "paged-mixed-reopen")


def _command(profile):
    node = ROOT / ".internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node"
    entry = ROOT / "services/paeg-engine/src/entry.mjs"
    if not node.is_file() or node.resolve() != node or not entry.is_file() or entry.resolve() != entry:
        raise RuntimeError("PAGED_PLATFORM_FIXED_ENTRY_REQUIRED")
    return [str(node), "--max-old-space-size=384", str(entry), profile]


def _identity(pid):
    raw = Path(f"/proc/{pid}/stat").read_text()
    fields = raw[raw.rfind(")") + 2:].split()
    return int(fields[1]), int(fields[2]), int(fields[3]), int(fields[19])


def main(arguments):
    if len(arguments) != 1 or arguments[0] not in PROFILES:
        sys.stderr.write("PAGED_PLATFORM_PROFILE_INVALID\n")
        return 2
    if sys.platform != "linux" or not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        sys.stderr.write("PAGED_PLATFORM_PIDFD_REQUIRED\n")
        return 1
    # Establish support before starting any backend or ledger resource.
    probe = os.pidfd_open(os.getpid())
    os.close(probe)
    command = _command(arguments[0])
    environment = os.environ.copy()
    environment.pop("NODE_OPTIONS", None)
    environment.pop("NODE_PATH", None)
    child = None
    pidfd = None
    identity = None
    requested = None
    forwarded = False

    def forward():
        nonlocal forwarded
        if requested is None or forwarded or child is None or pidfd is None:
            return
        if child.poll() is not None:
            return
        try:
            if _identity(child.pid) != identity:
                raise RuntimeError("PAGED_PLATFORM_PROCESS_IDENTITY_CHANGED")
            signal.pidfd_send_signal(pidfd, requested)
            forwarded = True
        except ProcessLookupError:
            # The same child exited before receiving the requested signal.
            pass

    def stop(signum, _frame):
        nonlocal requested
        if requested is None:
            requested = signum
        forward()

    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        child = subprocess.Popen(command, cwd=ROOT, env=environment, start_new_session=True)
        try:
            pidfd = os.pidfd_open(child.pid)
            identity = _identity(child.pid)
        except (ProcessLookupError, FileNotFoundError):
            return child.wait()
        if identity[:3] != (os.getpid(), child.pid, child.pid):
            raise RuntimeError("PAGED_PLATFORM_SESSION_ISOLATION_REQUIRED")
        forward()
        result = child.wait()
        return result if result >= 0 else 128 - result
    finally:
        # Any parent error still requests the original backend's ordinary close.
        # The backend remains responsible for its OWN ledgers and capture.
        if child is not None and child.poll() is None:
            if requested is None:
                requested = signal.SIGTERM
            forward()
            child.wait()
        if pidfd is not None:
            os.close(pidfd)
        for sig, handler in previous.items():
            signal.signal(sig, handler)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception:
        sys.stderr.write("PAGED_PLATFORM_OWNED_PROCESS_FAILED\n")
        sys.exit(1)
