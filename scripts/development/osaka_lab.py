"""One optionless original Osaka deployment/transfer smoke; no compiler/prover."""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
from workspace import ROOT, DEV, RUNTIME, build
NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
ENTRY = FLAT / "integration/evm/osaka/run-development-osaka-smoke.mjs"
DIRECTORY = FLAT / ".local/development-osaka-smoke-v1"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
active = None
interrupted = False
pending_signal = None
def capture_child_identity(child):
    def read():
        path = Path(f"/proc/{child.pid}/stat")
        if path.stat().st_uid != os.getuid():
            raise ValueError("OWNED_SUPERVISOR_UID_CHANGED")
        value = path.read_text()
        if not value.startswith(str(child.pid) + " ("):
            raise ValueError("OWNED_SUPERVISOR_PID_CHANGED")
        fields = value.rsplit(") ", 1)[1].split()
        return {"pid": child.pid, "ppid": int(fields[1]), "pgrp": int(fields[2]),
            "session": int(fields[3]), "startTimeTicks": fields[19]}
    try:
        before, after = read(), read()
        if before != after or before["ppid"] != os.getpid():
            return None
        return before
    except (OSError, ValueError, IndexError):
        return None

def forward_signal(signum, _frame):
    global interrupted, pending_signal
    interrupted = True
    pending_signal = signum
    if active is not None and active.poll() is None:
        active.send_signal(signum)

def private_evidence(path):
    before = path.lstat()
    if path.resolve() != path or not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_mode & 0o077:
        raise ValueError("PRIVATE_REGULAR_FILE_REQUIRED")
    if before.st_size > 16 * 1024 * 1024:
        raise ValueError("EVIDENCE_READING_BOUND")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError("EVIDENCE_IDENTITY_CHANGED")
        value = stream.read(16 * 1024 * 1024 + 1)
        after = os.fstat(stream.fileno())
    if len(value) > 16 * 1024 * 1024 or any(getattr(before, key) != getattr(after, key)
        for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")):
        raise ValueError("EVIDENCE_CHANGED_DURING_READING")
    return value

def retain_summary(attempt, supervisor_pid, supervisor_code, captured_identity):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("Osaka smoke produced no single original new attempt")
    documents, original_bytes, read_failures = {}, {}, []
    for name in ("result", "resources", "source-pins"):
        try:
            original_bytes[name] = private_evidence(attempt / (name + ".json"))
            value = json.loads(original_bytes[name])
            if not isinstance(value, dict):
                raise ValueError("EVIDENCE_OBJECT_REQUIRED")
            documents[name] = value
        except (OSError, ValueError):
            read_failures.append(name)
            documents[name] = {}
    result, resources, sources = (documents[name] for name in ("result", "resources", "source-pins"))
    result_bytes, resources_bytes = original_bytes.get("result", b""), original_bytes.get("resources", b"")
    source_sha256 = hashlib.sha256(original_bytes["source-pins"]).hexdigest() if "source-pins" in original_bytes else None
    result_format, resources_format = "LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESULT_V1", "LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESOURCES_V1"
    run_id, worker_pid = result.get("runId"), resources.get("workerPID")
    record = lambda value: value if isinstance(value, dict) else {}
    worker_result = record(resources.get("workerResult"))
    supervisor = {"supervisorPID": supervisor_pid, "workerPID": worker_pid}
    supervisor_identity, worker_identity = (record(resources.get(key)) for key in ("supervisorIdentity", "workerIdentity"))
    receipt_checks = {
        "originalEvidenceRead": not read_failures,
        "cliNotInterrupted": not interrupted,
        "zeroProofs": result.get("proofs") == [],
        "supervisorExitZero": type(supervisor_code) is int and supervisor_code == 0,
        "resultFormat": result.get("format") == result_format,
        "resourcesFormat": resources.get("format") == resources_format,
        "runIdentity": isinstance(run_id, str) and bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", run_id))
            and attempt.name == "attempt-" + run_id and resources.get("runId") == run_id and worker_result.get("runId") == run_id,
        "supervisorIdentity": type(supervisor_pid) is int and supervisor_pid > 1
            and resources.get("supervisorPID") == supervisor_pid and supervisor_identity.get("pid") == supervisor_pid
            and supervisor_identity.get("ppid") == os.getpid() and result.get("supervisor") == supervisor and worker_result.get("supervisor") == supervisor
            and isinstance(captured_identity, dict)
            and set(captured_identity) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
            and all(supervisor_identity.get(key) == value for key, value in captured_identity.items()),
        "workerIdentity": type(worker_pid) is int and worker_pid > 1 and worker_identity.get("pid") == worker_pid
            and worker_identity.get("ppid") == supervisor_pid and worker_identity.get("pgrp") == worker_pid
            and worker_identity.get("session") == worker_pid and resources.get("ownedProcessGroup") == worker_pid,
        "processBirthIdentities": all(isinstance(value.get("startTimeTicks"), str) and bool(re.fullmatch(r"[0-9]+", value["startTimeTicks"]))
            for value in (supervisor_identity, worker_identity)),
        "resultCompleted": result.get("phase") == "completed" and result.get("success") is True,
        "resourcesCompleted": resources.get("phase") == "completed" and "failure" in resources and resources["failure"] is None and resources.get("failures") == [],
        "originalResultJoined": worker_result.get("format") == result_format and worker_result.get("phase") == "completed"
            and worker_result.get("success") is True and worker_result.get("path") == str((attempt / "result.json").relative_to(FLAT))
            and worker_result.get("bytes") == len(result_bytes) and worker_result.get("sha256") == hashlib.sha256(result_bytes).hexdigest(),
        "sourceJoined": result.get("sourceUnchanged") is True and resources.get("sourceClosureUnchanged") is True
            and source_sha256 is not None and resources.get("sourcePinsSHA256") == source_sha256
            and result.get("sourcePins") == sources and resources.get("sourcePins") == sources,
        "localScope": all(value.get("localOnly") is True and value.get("fakeFundsOnly") is True and value.get("publicNetwork") is False
            for value in (result, resources, worker_result)),
        "originalCleanup": resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True
            and resources.get("lockReleased") is True and resources.get("withinTotalDeadline") is True
            and record(result.get("cleanup")).get("closedEvm") is True and record(worker_result.get("cleanup")).get("closedEvm") is True,
        "workerExitZero": all(resources.get(key) is True for key in ("workerSpawned", "workerExitObserved", "workerCloseObserved"))
            and all(type(record(resources.get(key)).get("code")) is int and record(resources.get(key)).get("code") == 0
                and "signal" in record(resources.get(key)) and record(resources[key])["signal"] is None
                for key in ("workerExit", "workerClose")),
    }
    receipt_checks["fixedForkCapAndScope"] = result.get("profile") == "ORIGINAL_OSAKA_DEPLOYMENT_AND_ONE_PUBLIC_TOKEN_TRANSFER_V1" \
        and result.get("fork") == "osaka" and result.get("transactionGasCap") == "16777216" \
        and result.get("blockGasLimit") == "30000000" and result.get("nodeTransactionGasLimitEnabled") is True \
        and all(result.get(key) is False for key in ("proofAcceptanceEstablished", "privateLifecycleEstablished", \
            "fullWalletAcceptance", "productionClientAcceptanceEstablished", "publicConsensusOrFinalityVerified"))
    receipt_checks["originalNodeCapRejection"] = record(result.get("nodeCapRejection")).get("originalStateUnchanged") is True \
        and record(result.get("nodeCapRejection")).get("cap") == "16777216" \
        and worker_result.get("nodeCapRejectionObserved") is True
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_DEVELOPMENT_OSAKA_SMOKE_LAB_V1", "accepted": accepted,
        "runId": result.get("runId", resources.get("runId")), "attempt": str(attempt.relative_to(ROOT)),
        "supervisorExitCode": supervisor_code, "receiptChecks": receipt_checks,
        "startedAt": result.get("startedAt"), "finishedAt": result.get("finishedAt"), "milliseconds": result.get("milliseconds"), "evidenceReadFailures": read_failures,
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "proofAcceptanceEstablished": False, "privateLifecycleEstablished": False, "fullWalletAcceptance": False,
        "productionClientAcceptanceEstablished": False, "publicConsensusOrFinalityVerified": False,
        "realProofCount": 0 if result.get("proofs") == [] else None, "fork": result.get("fork"), "transactionGasCap": result.get("transactionGasCap"),
        "nodeCapRejection": result.get("nodeCapRejection"), "publicTransfer": result.get("publicTransfer"),
        "creations": result.get("creations"), "transactions": result.get("transactions"),
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest() if "result" in original_bytes else None,
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest() if "resources" in original_bytes else None,
        "sourcePinsSHA256": source_sha256, "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"), "resourceSummary": resources.get("resourceSummary"),
        "limitations": ["Original Cancun-target bytecode executed on one owned pinned Osaka Anvil with cap enforcement.",
            "Twelve verifiers, hub, pools and fixed router are deployments only; no verifier proof is invoked.",
            "One public synthetic token transfer and one fixed rejected cap-plus-one node request only.",
            "Signed wire codec is a separate synthetic host test; ordinary send retains observed transactions, not signed wire.",
            "No private lifecycle, native delivery, production client, public consensus/finality, performance or privacy acceptance."]}
    path = DEV / "reports/osaka-smoke-lab.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)
    print(json.dumps({"summary": str(path.relative_to(ROOT)), "accepted": accepted, "runId": summary["runId"]}), flush=True)
    if not accepted:
        raise SystemExit("Osaka smoke evidence rejected; original reports preserved")

def main():
    global active
    if len(sys.argv) != 1:
        raise SystemExit("Usage: ./dev lab osaka")
    if sys.platform != "linux" or Path.cwd().resolve() != ROOT:
        raise SystemExit("Run the fixed Osaka smoke from the project root in Linux/WSL")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "osaka-smoke-lab.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another Osaka smoke lab is active")
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, forward_signal)
        previous = set(DIRECTORY.glob("attempt-*"))
        owner_pid = os.getpid()
        def guard_parent():
            if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
                os._exit(125)
        if interrupted:
            raise SystemExit(130)
        active = subprocess.Popen([str(NODE), str(ENTRY)], cwd=FLAT, env=CLEAN_ENV, preexec_fn=guard_parent)
        supervisor_pid, captured_identity, seen = active.pid, capture_child_identity(active), None
        if interrupted and active.poll() is None:
            active.send_signal(pending_signal or signal.SIGTERM)
        while active.poll() is None:
            try:
                own_lock = json.loads((DIRECTORY / "active.lock").read_text())
                if own_lock.get("pid") == supervisor_pid:
                    result = json.loads((FLAT / own_lock["attempt"] / "result.json").read_text())
                    current = result.get("phase") if isinstance(result, dict) else "rejected-evidence-type"
                    if current != seen:
                        print(json.dumps({"stage": current}), flush=True)
                        seen = current
            except (OSError, KeyError, ValueError):
                pass
            time.sleep(1)
        code = active.returncode
        active = None
        attempts = set(DIRECTORY.glob("attempt-*")) - previous
        if len(attempts) != 1:
            raise SystemExit("Osaka smoke produced no single new attempt; earlier reports are not reused")
        retain_summary(attempts.pop(), supervisor_pid, code, captured_identity)
        if code or interrupted:
            raise SystemExit(code if code > 0 else 2)

if __name__ == "__main__":
    main()
