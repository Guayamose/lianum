"""Run fixed official Uniswap/MetaMorpho D27 entry and original EXIT locally."""
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
ENTRY = FLAT / "integration/defi/entry/run-development-defi-entry-flow.mjs"
DIRECTORY = FLAT / ".local/development-defi-entry-roundtrip-v1"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
RESULT_FORMAT = "LIANUM_DEVELOPMENT_DEFI_ENTRY_RESULT_V1"
RESOURCES_FORMAT = "LIANUM_DEVELOPMENT_DEFI_ENTRY_RESOURCES_V1"
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
        raise SystemExit("DeFi entry evidence must remain an original private regular file")
    if info.st_size > 16 * 1024 * 1024:
        raise SystemExit("DeFi entry evidence exceeds its fixed reading limit")
    return path.read_bytes()

def digest(value):
    return hashlib.sha256(value).hexdigest()

def retain_summary(attempt, supervisor_pid, supervisor_code):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("DeFi entry attempt path changed")
    result_bytes = regular_bytes(attempt / "result.json")
    resources_bytes = regular_bytes(attempt / "resources.json")
    source_bytes = regular_bytes(attempt / "source-pins.json")
    result, resources, sources = json.loads(result_bytes), json.loads(resources_bytes), json.loads(source_bytes)
    run_id = result.get("runId")
    if not isinstance(run_id, str) or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", run_id):
        raise SystemExit("DeFi entry original attempt identity is absent")
    if attempt.name != "attempt-" + run_id or resources.get("runId") != run_id:
        raise SystemExit("DeFi entry result/resources attempt identities differ")
    if resources.get("supervisorPID") != supervisor_pid or result.get("supervisor", {}).get("supervisorPID") != supervisor_pid:
        raise SystemExit("DeFi entry evidence is not from this supervised process")
    if result.get("supervisor", {}).get("workerPID") != resources.get("workerPID"):
        raise SystemExit("DeFi entry original worker identity changed")
    if resources.get("sourcePinsSHA256") != digest(source_bytes) or result.get("sourcePins") != sources or resources.get("sourcePins") != sources:
        raise SystemExit("DeFi entry original source snapshot identity changed")
    proofs = result.get("proofs", [])
    proof_hashes = []
    for row in proofs:
        name = row.get("file")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", name):
            raise SystemExit("DeFi entry public proof filename changed")
        proof = regular_bytes(attempt / "public-proofs" / (name + ".bin"))
        inputs = regular_bytes(attempt / "public-proofs" / (name + ".inputs.json"))
        if digest(proof) != row.get("proofSHA256") or digest(inputs) != row.get("publicInputsSHA256"):
            raise SystemExit("DeFi entry retained original proof bytes changed")
        proof_hashes.append({key: row.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")}
            | {key: row.get("evidence", {}).get(key) for key in ("telemetrySHA256", "manifestSHA256", "resourcesSHA256", "resultSHA256")})
    accepted = supervisor_code == 0 and result.get("format") == RESULT_FORMAT and resources.get("format") == RESOURCES_FORMAT \
        and result.get("success") is True and result.get("phase") == "completed" and result.get("sourceUnchanged") is True \
        and resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True \
        and resources.get("phase") == "completed" and resources.get("failure") is None and resources.get("failures") == [] \
        and [row.get("relation") for row in proofs] == ["deposit_intent", "withdraw_balance", "deposit_intent", "withdraw_balance"] \
        and all(row.get("evidence", {}).get("resourceReceiptCompleted") is True for row in proofs) \
        and result.get("protocolInputPublic") is True \
        and all(result.get(key) is False for key in ("publicNetwork", "registeredLegAdmissionEstablished", "privatePAEGConversionEstablished", \
            "graphExecutionEstablished", "providerReimbursementEstablished", "independentOperators", \
            "nativeProcessRestartEstablished", "keeperLossRecoveryEstablished", "fullWalletAcceptance"))
    summary = {"format": "LIANUM_DEVELOPMENT_DEFI_ENTRY_LAB_V1", "accepted": accepted, "runId": run_id,
        "attempt": str(attempt.relative_to(ROOT)), "scope": "PUBLIC_PROTOCOL_INPUT_D27_PRIVATE_OUTPUT_AND_ORIGINAL_EXIT",
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "resultSHA256": digest(result_bytes), "resourcesSHA256": digest(resources_bytes), "sourcePinsSHA256": digest(source_bytes),
        "realProofCount": len(proofs), "proofHashes": proof_hashes, "checks": result.get("checks"),
        "cycles": result.get("cycles"), "protocolInputPublic": result.get("protocolInputPublic"), "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"), "resourceSummary": resources.get("resourceSummary"),
        "keeperLossRecoveryEstablished": False, "nativeProcessRestartEstablished": False,
        "registeredLegAdmissionEstablished": False, "privatePAEGConversionEstablished": False, "graphExecutionEstablished": False,
        "providerReimbursementEstablished": False, "fullWalletAcceptance": False,
        "limitations": ["Fresh official Uniswap and MetaMorpho deployments on owned Anvil with synthetic public input only.",
            "Original routers atomically issue genuine original D27 output notes; original W39 EXIT returns public output.",
            "One completed MetaMorpho redemption response is discarded; recovery reopens original receipts without another send.",
            "Original keeper credentials and node survive; no PAEG, graph, reimbursement, keeper/node loss, public network or complete wallet acceptance."]}
    destination = DEV / "reports/defi-entry-lab.json"
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
        raise SystemExit("Usage: ./dev lab defi")
    if sys.platform != "linux":
        raise SystemExit("DeFi entry's fixed owned laboratory requires Linux/WSL")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "defi-entry-lab.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another DeFi entry lab is active")
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
            raise SystemExit("DeFi entry lab produced no single new attempt; earlier reports are not reused")
        retain_summary(new.pop(), supervisor_pid, code)
        if code or interrupted:
            raise SystemExit(code if code > 0 else 2)

if __name__ == "__main__":
    main()
