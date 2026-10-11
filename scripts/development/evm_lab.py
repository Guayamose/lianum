"""Prepare reviewed public artifacts and run one fresh fake-value EVM wallet lab."""
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
# Fixed source entrypoints; FLAT contains only the retained lab resources/state.
SOURCE_ENTRIES = {
    "scripts/prepare-backed-assets.mjs": "scripts/wallet/preparation/prepare-backed-assets.mjs",
    "scripts/prepare-development-evm.mjs": "scripts/wallet/preparation/prepare-development-evm.mjs",
    "proof-workers/run-bounded.mjs": "packages/proofs/src/jobs/run-bounded.mjs",
    **{"integration/run-" + name + ".mjs": "tests/integration/wallet/manual/run-" + name + ".mjs"
       for name in ("manual-wallet-acceptance", "manual-wallet-timeout-recovery",
                    "manual-wallet-browser-acceptance", "manual-wallet-browser-timeout-recovery")},
}

def source_entry(entry):
    try:
        selected = ROOT / SOURCE_ENTRIES[str(entry)]
    except KeyError:
        raise ValueError("EVM_LAB_FIXED_SOURCE_ENTRY") from None
    if selected.resolve() != selected or not selected.is_file():
        raise ValueError("EVM_LAB_PHYSICAL_SOURCE_ENTRY")
    return selected

CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
active = None
interrupted = False
pending_signal = None
last_lab_attempt = None
last_lab_supervisor_pid = None
last_lab_supervisor_code = None
last_lab_supervisor_identity = None

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

def run(entry, *arguments, observe=False, flow="manual-wallet-acceptance"):
    global active, last_lab_attempt, last_lab_supervisor_pid, last_lab_supervisor_code, last_lab_supervisor_identity
    if interrupted:
        raise SystemExit(130)
    print(f"Lab EVM: {entry}", flush=True)
    directory = FLAT / ".local" / flow
    previous_attempts = set(directory.glob("attempt-*")) if observe else set()
    if observe:
        last_lab_attempt = None
        last_lab_supervisor_pid = None
        last_lab_supervisor_code = None
        last_lab_supervisor_identity = None
    owner_pid = os.getpid()
    def guard_parent():
        if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
            os._exit(125)
    active = subprocess.Popen([str(NODE), str(source_entry(entry)), *arguments], cwd=FLAT, env=CLEAN_ENV, preexec_fn=guard_parent)
    supervisor_pid = active.pid
    if observe:
        last_lab_supervisor_identity = capture_child_identity(active)
    # A signal may arrive while Popen has not yet returned the owned child.
    if interrupted and active.poll() is None:
        active.send_signal(pending_signal or signal.SIGTERM)
    seen = None
    while active.poll() is None:
        if observe:
            try:
                lock = json.loads((directory / "active.lock").read_text())
                if lock["pid"] == active.pid:
                    result = json.loads((FLAT / lock["attempt"] / "result.json").read_text())
                    current = (result.get("phase"), len(result.get("proofs", [])))
                    if current != seen:
                        print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True)
                        seen = current
            except (FileNotFoundError, json.JSONDecodeError, KeyError):
                pass
        time.sleep(1)
    code = active.returncode
    active = None
    if observe:
        last_lab_supervisor_pid = supervisor_pid
        last_lab_supervisor_code = code
        new_attempts = set(directory.glob("attempt-*")) - previous_attempts
        if len(new_attempts) == 1:
            last_lab_attempt = new_attempts.pop()
    if code:
        raise SystemExit(code)

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

def retain_summary(recovery=False, browser=False):
    browser_recovery = recovery and browser
    directory = FLAT / ".local" / ("manual-wallet-browser-timeout-recovery" if browser_recovery else "manual-wallet-browser-acceptance" if browser else "manual-wallet-timeout-recovery" if recovery else "manual-wallet-acceptance")
    if last_lab_attempt is None or last_lab_attempt.parent != directory:
        raise SystemExit("Lab EVM produced no single new attempt; earlier reports are not reused")
    attempt = last_lab_attempt
    if attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("Lab EVM original attempt path changed")
    documents, original_bytes, read_failures = {}, {}, []
    for name in ("result", "resources", "source-pins"):
        try:
            original_bytes[name] = private_evidence(attempt / (name + ".json"))
            value = json.loads(original_bytes[name])
            if not isinstance(value, dict):
                raise ValueError("EVIDENCE_OBJECT_REQUIRED")
            documents[name] = value
        except (OSError, ValueError):
            read_failures.append(name); documents[name] = {}
    result, resources, sources = (documents[name] for name in ("result", "resources", "source-pins"))
    result_bytes, resources_bytes = original_bytes.get("result", b""), original_bytes.get("resources", b"")
    source_sha256 = hashlib.sha256(original_bytes["source-pins"]).hexdigest() if "source-pins" in original_bytes else None
    completion = "walletBrowserTimeoutFRecoveryCompleted" if browser_recovery else "walletBrowserEvmFlowCompleted" if browser else "actualTimeoutFRecoveryAcceptance" if recovery else "walletSdkEvmFlowCompleted"
    prefix = "FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY" if browser_recovery else "FLAT_MANUAL_WALLET_BROWSER" if browser else "FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY" if recovery else "FLAT_MANUAL_WALLET_ACCEPTANCE"
    result_format = prefix + "_ACCEPTANCE_RESULT_V1" if browser and not browser_recovery else prefix + "_RESULT_V1"
    resources_format = prefix + "_RESOURCES_V1"
    run_id, worker_pid = result.get("runId"), resources.get("workerPID")
    record = lambda value: value if isinstance(value, dict) else {}
    worker_result = record(resources.get("workerResult"))
    supervisor = {"supervisorPID": last_lab_supervisor_pid, "workerPID": worker_pid}
    supervisor_identity, worker_identity = (record(resources.get(key)) for key in ("supervisorIdentity", "workerIdentity"))
    original_proofs = result.get("proofs")
    proof_rows_typed = isinstance(original_proofs, list) and all(isinstance(row, dict)
        and isinstance(row.get("relation"), str) for row in original_proofs)
    proofs = original_proofs if proof_rows_typed else []
    receipt_checks = {
        "originalEvidenceRead": not read_failures,
        "proofRowsTyped": proof_rows_typed,
        "supervisorExitZero": type(last_lab_supervisor_code) is int and last_lab_supervisor_code == 0,
        "resultFormat": result.get("format") == result_format,
        "resourcesFormat": resources.get("format") == resources_format,
        "runIdentity": isinstance(run_id, str) and bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", run_id))
            and attempt.name == "attempt-" + run_id and resources.get("runId") == run_id and worker_result.get("runId") == run_id,
        "supervisorIdentity": type(last_lab_supervisor_pid) is int and last_lab_supervisor_pid > 1
            and resources.get("supervisorPID") == last_lab_supervisor_pid and supervisor_identity.get("pid") == last_lab_supervisor_pid
            and supervisor_identity.get("ppid") == os.getpid() and result.get("supervisor") == supervisor and worker_result.get("supervisor") == supervisor
            and isinstance(last_lab_supervisor_identity, dict)
            and set(last_lab_supervisor_identity) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
            and all(supervisor_identity.get(key) == value for key, value in last_lab_supervisor_identity.items()),
        "workerIdentity": type(worker_pid) is int and worker_pid > 1 and worker_identity.get("pid") == worker_pid
            and worker_identity.get("ppid") == last_lab_supervisor_pid and worker_identity.get("pgrp") == worker_pid
            and worker_identity.get("session") == worker_pid and resources.get("ownedProcessGroup") == worker_pid,
        "processBirthIdentities": all(isinstance(value.get("startTimeTicks"), str) and bool(re.fullmatch(r"[0-9]+", value["startTimeTicks"]))
            for value in (supervisor_identity, worker_identity)),
        "resultCompleted": result.get("phase") == "completed" and result.get("success") is True and result.get(completion) is True,
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
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_DEVELOPMENT_EVM_BROWSER_TIMEOUT_RECOVERY_V1" if browser_recovery else "LIANUM_DEVELOPMENT_EVM_BROWSER_ACCEPTANCE_V1" if browser else "LIANUM_DEVELOPMENT_EVM_TIMEOUT_RECOVERY_V1" if recovery else "LIANUM_DEVELOPMENT_EVM_WALLET_ACCEPTANCE_V1", "accepted": accepted,
        "runId": result.get("runId", resources.get("runId")), "attempt": str(attempt.relative_to(ROOT)),
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "startedAt": result.get("startedAt"), "finishedAt": result.get("finishedAt"),
        "milliseconds": result.get("milliseconds"), "failure": resources.get("failure"),
        "workerFailure": result.get("errorCode"), "realProofCount": len(proofs) if proof_rows_typed else None,
        "proofRelations": [proof["relation"] for proof in proofs],
        "proofHashes": [{key: proof.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")}
                        for proof in proofs],
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest() if "result" in original_bytes else None,
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest() if "resources" in original_bytes else None,
        "sourcePinsSHA256": source_sha256,
        "supervisorExitCode": last_lab_supervisor_code, "receiptChecks": receipt_checks,
        "evidenceReadFailures": read_failures,
        "walletSdkEvmFlowCompleted": result.get("walletSdkEvmFlowCompleted", False),
        "walletBrowserEvmFlowCompleted": result.get("walletBrowserEvmFlowCompleted", False),
        "walletBrowserTimeoutFRecoveryCompleted": result.get("walletBrowserTimeoutFRecoveryCompleted", False),
        "manualConsentContractVerified": result.get("manualConsentContractVerified", False),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"),
        "resourceSummary": resources.get("resourceSummary"),
        "responseLoss": result.get("responseLoss"), "listenerRestart": result.get("listenerRestart"),
        "offlineOriginalRecovery": result.get("offlineOriginalRecovery"),
        "finalRecipients": result.get("finalRecipients"), "finalVault": result.get("finalVault"),
        "finalCapacity": result.get("finalCapacity"),
        "fullWalletAcceptance": False, "browserVisualAcceptance": accepted if browser else False,
        "systemicPrivacyAcceptance": False, "independentOperators": False,
        "actualTimeoutFRecoveryAcceptance": result.get("actualTimeoutFRecoveryAcceptance", False),
        "limitations": ["Local synthetic EVM and fake PALT/BLTV only; no public-chain acceptance.",
            "Client deliberately discards one actual HTTP admission reply; no physical network outage claimed.",
            "Owners restart as processes; catalogue coordinator reopens its same journal in process.",
            "Recovery here observes an already fulfilled graph; timed-out F recovery needs its own acceptance.",
            "Amounts/timing/router actions and common-host operators remain observable; no privacy certification."]}
    if recovery:
        summary.update({"originalFRecovery": result.get("originalFRecovery"),
            "recoveryBalances": result.get("recoveryBalances"),
            "expectedInterruptionCode": result.get("expectedInterruptionCode"),
            "actualAdmissionFailureCode": result.get("actualAdmissionFailureCode"),
            "originalFailedAdmission": result.get("originalFailedAdmission"),
            "expectedInterruptionPreserved": result.get("expectedInterruptionPreserved", False),
            "failureRecovery": {key: result.get("failureRecovery", {}).get(key) for key in
                ("ownerAbsentAtIssuance", "recoveryThroughExactSDK", "recoveryThroughExactBrowser", "originalFailurePreserved", "solverPayoutIssued",
                 "solverUnderlyingLoss", "nativeVaultEffects", "ownerExitsAttempted", "catalogueAdmissionsFenced")},
            "limitations": ["Local synthetic EVM and fake PALT/BLTV only; no public-chain acceptance.",
                "Controlled interruption after one real native delivery, before global settlement; signed LOCAL cutoff advanced explicitly.",
                "Real original F refunds120 to available500; recovery120 labels a subset and is not another spendable amount.",
                "Solver loses its100 underlying; target private100 shares remain. Catalogue admission fence is retained; no new exits attempted.",
                "Owners restart as processes; coordinator reopens its same authenticated journal in process and listener is replaced.",
                "No browser, physical network outage, independent operators or privacy certification accepted."]})
    if browser and not browser_recovery:
        summary.update({"browserClosures": result.get("browserClosures"),
            "originalExitReviewStateUnchanged": result.get("originalExitReviewStateUnchanged", False),
            "walletApplicationHttpAcceptance": result.get("walletApplicationHttpAcceptance"),
            "limitations": ["Local owned EVM and fake PALT/BLTV only; no public-chain acceptance.",
                "Scripted real production DOM checks each original term and checkbox before importing one-use authority from the original local host.",
                "Owner amount/destination/witness preparation remains in the separate original Linux custody process; browser is not self-contained mobile custody.",
                "One actual admitted HTTP reply is discarded; no physical network outage is claimed.",
                "Owners restart as processes; coordinator reopens its same authenticated journal and listener is replaced.",
                "Amounts, timing and router actions remain observable; no independent-operator or privacy/performance certification."]})
    if browser_recovery:
        summary["browserClosures"] = result.get("browserClosures")
        summary["limitations"][-1] = "Scripted production DOM only; Linux owner preparation remains separate. No physical outage, mobile custody, independent operators or privacy certification accepted."
    destination = DEV / "reports" / ("evm-browser-recovery-lab.json" if browser_recovery else "evm-browser-lab.json" if browser else "evm-recovery-lab.json" if recovery else "evm-lab.json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(destination)
    print(json.dumps({"accepted": accepted, "realProofCount": summary["realProofCount"],
                      "report": str(destination.relative_to(ROOT))}), flush=True)
    if not accepted:
        raise SystemExit(1)

def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else "run" if len(sys.argv) == 1 else None
    if mode not in {"prepare", "run", "recovery", "browser", "browser-recovery"}:
        raise SystemExit("Usage: ./dev lab [prepare|run|recovery|browser|browser-recovery]")
    if sys.platform != "linux":
        raise SystemExit("The fixed EVM wallet laboratory requires Linux/WSL")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    with (DEV / "evm-lab.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another EVM lab preparation/run is active")
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, forward_signal)
        if not (FLAT / ".local/backed-assets/v1/manifest.json").exists():
            run("scripts/prepare-backed-assets.mjs")
        # Bounded original workers validate/reuse each completed public artifact.
        # The missing admission key is generated once with the real circuit/CRS.
        for operation in ("compile", "stats", "prepare-key"):
            run("proof-workers/run-bounded.mjs", "admission", operation)
        run("scripts/prepare-development-evm.mjs")
        if mode in {"run", "recovery", "browser", "browser-recovery"}:
            recovery = mode in {"recovery", "browser-recovery"}
            browser = mode in {"browser", "browser-recovery"}
            flow = "manual-wallet-browser-timeout-recovery" if recovery and browser else "manual-wallet-browser-acceptance" if browser else "manual-wallet-timeout-recovery" if recovery else "manual-wallet-acceptance"
            try:
                run("integration/run-" + flow + ".mjs", observe=True, flow=flow)
            except SystemExit as error:
                try:
                    retain_summary(recovery, browser)
                except (SystemExit, FileNotFoundError):
                    pass
                raise error
            retain_summary(recovery, browser)

if __name__ == "__main__":
    main()
