"""Linux parent-lifetime guard for the fixed public CO42 preparation process."""
import ctypes
import os
from pathlib import Path
import signal
import sys


def bind_parent_lifetime(expected_parent: int) -> None:
    """Request SIGTERM for this process if its actual parent dies, including SIGKILL."""
    if expected_parent <= 1 or os.getppid() != expected_parent:
        raise RuntimeError("NATIVE_REBUILD_PARENT_CHANGED_BEFORE_BIND")
    libc = ctypes.CDLL(None, use_errno=True)
    prctl = libc.prctl
    prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    prctl.restype = ctypes.c_int
    if prctl(1, signal.SIGTERM, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
        raise RuntimeError("NATIVE_REBUILD_PARENT_DEATH_BIND_FAILED")
    if os.getppid() != expected_parent:
        raise RuntimeError("NATIVE_REBUILD_PARENT_CHANGED_AFTER_BIND")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"compile", "stats", "prepare-key"}:
        raise RuntimeError("NATIVE_REBUILD_FIXED_PARENT_GUARD_ARGUMENTS")
    root = Path(__file__).resolve().parent.parent
    parent = os.getppid()
    args = Path(f"/proc/{parent}/cmdline").read_bytes().split(b"\0")
    args = [value.decode() for value in args if value]
    parent_cwd = Path(f"/proc/{parent}/cwd").resolve()
    if len(args) != 2 or (parent_cwd / args[1]).resolve() != root / "scripts/prepare-development-native-claims.mjs":
        raise RuntimeError("NATIVE_REBUILD_FIXED_ACTUAL_PARENT")
    node = str(Path(f"/proc/{parent}/exe").resolve())
    bind_parent_lifetime(parent)
    os.chdir(root)
    os.execve(node, [node, str(root / "proof-workers/run-bounded.mjs"),
                    "native_claim_discharge", sys.argv[1]],
              {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})


if __name__ == "__main__":
    main()
