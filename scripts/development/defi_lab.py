"""Run the fixed MetaMorpho private note/EXIT laboratory from the human root."""
import ctypes
import fcntl
import hashlib
import json
import os
import re
import signal
import stat
import subprocess
import sys
import time
from workspace import ROOT, DEV, RUNTIME, build

NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
ENTRY = FLAT / "integration/defi/run-private-metamorpho-flow.mjs"
DIRECTORY = FLAT / ".local/private-metamorpho-flow"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
RESULT_FORMAT = "LIANUM_PRIVATE_METAMORPHO_FLOW_RESULT_V1"
RESOURCES_FORMAT = "LIANUM_PRIVATE_METAMORPHO_RESOURCES_V1"
active = None
interrupted = False
pending_signal = None

def forward_signal(signum, _frame):
    global interrupted, pending_signal
    interrupted = True
    pending_signal = signum
    if active is not None and active.poll() is None:
        active.send_signal(signum)

def regular_bytes(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.resolve() != path or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise SystemExit("MetaMorpho evidence must remain an original private regular file")
    if info.st_size > 16 * 1024 * 1024:
        raise SystemExit("MetaMorpho evidence exceeds its fixed reading limit")
    return path.read_bytes()

def digest(value):
    return hashlib.sha256(value).hexdigest()

def retain_summary(attempt, supervisor_pid, supervisor_code):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("MetaMorpho attempt path changed")
    result_bytes = regular_bytes(attempt / "result.json")
    resources_bytes = regular_bytes(attempt / "resources.json")
    source_bytes = regular_bytes(attempt / "source-pins.json")
    result, resources, sources = json.loads(result_bytes), json.loads(resources_bytes), json.loads(source_bytes)
    run_id = result.get("runId")
    if not isinstance(run_id, str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", run_id):
        raise SystemExit("MetaMorpho original attempt identity is absent")
    if attempt.name != "attempt-" + run_id or resources.get("runId") != run_id:
        raise SystemExit("MetaMorpho result/resources attempt identities differ")
    if resources.get("supervisorPID") != supervisor_pid or result.get("supervisor", {}).get("supervisorPID") != supervisor_pid:
        raise SystemExit("MetaMorpho evidence is not from this supervised process")
    if result.get("supervisor", {}).get("workerPID") != resources.get("workerPID"):
        raise SystemExit("MetaMorpho original worker identity changed")
    if resources.get("sourcePinsSHA256") != digest(source_bytes) or result.get("sourcePins") != sources or resources.get("sourcePins") != sources:
        raise SystemExit("MetaMorpho original source snapshot identity changed")
    proofs = result.get("proofs", [])
    proof_hashes = []
    for row in proofs:
        name = row.get("file")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", name):
            raise SystemExit("MetaMorpho public proof filename changed")
        proof = regular_bytes(attempt / "public-proofs" / (name + ".bin"))
        inputs = regular_bytes(attempt / "public-proofs" / (name + ".inputs.json"))
        if digest(proof) != row.get("proofSHA256") or digest(inputs) != row.get("publicInputsSHA256"):
            raise SystemExit("MetaMorpho retained original proof bytes changed")
        proof_hashes.append({key: row.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")}
            | {"telemetrySHA256": row.get("evidence", {}).get("telemetrySHA256")})
    accepted = supervisor_code == 0 and result.get("format") == RESULT_FORMAT and resources.get("format") == RESOURCES_FORMAT \
        and result.get("success") is True and result.get("phase") == "completed" and result.get("sourceUnchanged") is True \
        and resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True \
        and resources.get("phase") == "completed" and resources.get("failure") is None and resources.get("failures") == [] \
        and [row.get("relation") for row in proofs] == ["deposit_balance", "withdraw_balance"] \
        and all(row.get("evidence", {}).get("resourceReceiptCompleted") is True for row in proofs)
    summary = {"format": "LIANUM_PRIVATE_METAMORPHO_LAB_V1", "accepted": accepted, "runId": run_id,
        "attempt": str(attempt.relative_to(ROOT)), "scope": "PRIVATE_SHARE_NOTE_EXIT_AND_PUBLIC_METAMORPHO_REDEMPTION",
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "resultSHA256": digest(result_bytes), "resourcesSHA256": digest(resources_bytes), "sourcePinsSHA256": digest(source_bytes),
        "realProofCount": len(proofs), "proofHashes": proof_hashes, "checks": result.get("checks"),
        "redemption": result.get("accepted"), "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"), "resourceSummary": resources.get("resourceSummary"),
        "keeperLossRecoveryEstablished": False, "nativeProcessRestartEstablished": False,
        "privatePAEGConversionEstablished": False, "fullWalletAcceptance": False,
        "limitations": ["Fresh official MetaMorpho deployment on owned Anvil with synthetic funds only.",
            "Public fixture deposit supplies the shares; the original private share note and EXIT are proved genuinely.",
            "One completed redemption response is discarded; recovery reopens original receipts without a second send.",
            "Original keeper credentials and native process survive; no keeper/node loss, public network or complete wallet acceptance."]}
    destination = DEV / "reports/metamorpho-lab.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(summary, stream, indent=2); stream.write("\n"); stream.flush(); os.fsync(stream.fileno())
    temporary.replace(destination)
    print(json.dumps({"accepted": accepted, "realProofCount": len(proofs), "report": str(destination.relative_to(ROOT))}), flush=True)
    if not accepted:
        raise SystemExit(1)

def main():
    global active
    if len(sys.argv) != 1:
        raise SystemExit("Usage: ./dev lab metamorpho")
    if sys.platform != "linux":
        raise SystemExit("MetaMorpho's fixed owned laboratory requires Linux/WSL")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "metamorpho-lab.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another MetaMorpho lab is active")
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, forward_signal)
        previous = set(DIRECTORY.glob("attempt-*"))
        owner_pid = os.getpid()
        def guard_parent():
            if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
                os._exit(125)
        if interrupted:
            raise SystemExit(130)
        active = subprocess.Popen([str(NODE), str(ENTRY)], cwd=FLAT, env=CLEAN_ENV, preexec_fn=guard_parent)
        # A signal may arrive while Popen has not yet returned the owned child.
        if interrupted and active.poll() is None:
            active.send_signal(pending_signal or signal.SIGTERM)
        supervisor_pid, seen = active.pid, None
        while active.poll() is None:
            try:
                current_lock = json.loads((DIRECTORY / "active.lock").read_text())
                if current_lock["pid"] == supervisor_pid:
                    result = json.loads((FLAT / current_lock["attempt"] / "result.json").read_text())
                    current = result.get("phase"), len(result.get("proofs", []))
                    if current != seen:
                        print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True); seen = current
            except (FileNotFoundError, KeyError, json.JSONDecodeError):
                pass
            time.sleep(1)
        code = active.returncode; active = None
        new = set(DIRECTORY.glob("attempt-*")) - previous
        if len(new) != 1:
            raise SystemExit("MetaMorpho lab produced no single new attempt; earlier reports are not reused")
        retain_summary(new.pop(), supervisor_pid, code)
        if code or interrupted:
            raise SystemExit(code if code > 0 else 2)

if __name__ == "__main__":
    main()
