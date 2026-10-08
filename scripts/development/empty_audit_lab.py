"""Fixed fresh empty original audit diagnostic; no financial acceptance."""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from workspace import ROOT, DEV, RUNTIME, build
# Reuse the already reviewed private-file reader and /proc birth capture. These
# helpers start no runtime and grant no signing/acceptance authority.
from osaka_lab import capture_child_identity, private_evidence

NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
ENTRY = FLAT / "integration/claims/metrics/run-native-claim-empty-audit-v1.mjs"
PREPARE = FLAT / "scripts/prepare-development-native-claims.mjs"
DIRECTORY = FLAT / ".local/native-claim-empty-audit-metrics-v1"
PROFILE = "FRESH_EMPTY_ORIGINAL_CLAIM_GRAPH_AUDIT_METRICS_V1"
RESULT_FORMAT = "LIANUM_FRESH_EMPTY_ORIGINAL_AUDIT_METRICS_RESULT_V1"
RESOURCES_FORMAT = "LIANUM_EMPTY_ORIGINAL_AUDIT_METRICS_RESOURCES_V1"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
SHA = re.compile(r"[0-9a-f]{64}")
ORDER = ['claim-0', 'claim-1', 'claim-2', 'graph-0', 'graph-1', 'graph-2']
active = None
interrupted = False
pending_signal = None


def forward_signal(signum, _frame):
    global interrupted, pending_signal
    interrupted, pending_signal = True, signum
    if active is not None and active.poll() is None:
        active.send_signal(signum)


def record(value):
    return value if isinstance(value, dict) else {}


def digest(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def audit_checks(result):
    calls = result.get("calls")
    fixed_calls = isinstance(calls, list) and len(calls) == 6 and all(isinstance(row, dict) for row in calls)
    if fixed_calls:
        fixed_calls = [row.get("label") for row in calls] == ORDER and all(row.get("completed") is True
            and row.get("cpuScope") == "PROCESS_INTERVAL_INCLUDES_SIBLING_WORK"
            and all(type(row.get(key)) in (int, float) and 0 <= row[key] <= 3_600_000_000
                for key in ("wallMilliseconds", "processCpuMicroseconds")) for row in calls)
    activity = record(result.get("activity"))
    before, after = record(activity.get("before")), record(activity.get("after"))
    valid_activity = activity.get("scope") == "ORIGINAL_V4_EPOCH_AND_PERSISTED_HISTORIES_ONLY" \
        and activity.get("originalHistoriesMeasured") is True and activity.get("totalKeyInvocationsMeasured") is False
    for branch in ("claim", "graph"):
        rows = before.get(branch)
        valid_activity = valid_activity and isinstance(rows, list) and len(rows) == 4
        for row in rows if isinstance(rows, list) else []:
            row = record(row)
            valid_activity = valid_activity and row.get("schema") == branch.upper() + "_PRIVATE_AUDIT_ACTIVITY_V1" \
                and row.get("epochScope") == ("ORIGINAL_CLAIM_V4_KEY_LEASES_ONLY" if branch == "claim" else "ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS") \
                and row.get("originalHistoriesMeasured") is True and row.get("totalKeyInvocationsMeasured") is False \
                and type(row.get("keyUseEpoch")) is int and row["keyUseEpoch"] == 0 \
                and all(type(row.get(key)) is int and row[key] == 0 for key in
                    ("authorizationCount", "signedAuthorizationCount", "factCount", "signedFactCount")) \
                and all(row.get(key) is False for key in ("busy", "branchClosed", "branchPoisoned", "custodyClosed", "custodyPoisoned"))
            if branch == "claim":
                valid_activity = valid_activity and type(row.get("retainedBindingCount")) is int and row["retainedBindingCount"] == 0
    valid_activity = valid_activity and before == after
    return {"sixFixedOriginalAuditCalls": bool(fixed_calls), "originalScopeActivityUnchanged": bool(valid_activity),
        "zeroProofsAndOwners": result.get("proofs") == [] and type(result.get("ownersCreated")) is int and result["ownersCreated"] == 0
            and result.get("proofAttemptsUnchanged") is True,
        "baseEmptyScopeOnly": result.get("validationScope") == "BASE_EMPTY_AUDIT_MEASURED"
            and all(result.get(key) is False for key in ("loadedEquivalence", "financialAcceptance", "fullWalletAcceptance",
                "publicNetwork", "independentOperators", "nativeSelfCustody", "payoutAuthorizationReproduced")),
        "noPostSetupEconomicEffects": result.get("nativeEffects") == {"bitcoin": 0, "solana": 0, "graphBitcoin": 0, "graphSolana": 0}
            and all(type(record(result.get("nativeEffects")).get(key)) is int for key in
                ("bitcoin", "solana", "graphBitcoin", "graphSolana"))
            and type(result.get("evmTransactionsAfterSetup")) is int and result["evmTransactionsAfterSetup"] == 0}


def retain_summary(attempt, supervisor_pid, supervisor_code, captured_identity):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("Empty audit lab produced no single original new attempt")
    documents, original_bytes, read_failures = {}, {}, []
    for name in ("result", "resources", "source-pins"):
        try:
            original_bytes[name] = private_evidence(attempt / (name + ".json"))
            value = json.loads(original_bytes[name])
            if not isinstance(value, dict):
                raise ValueError("EVIDENCE_OBJECT_REQUIRED")
            documents[name] = value
        except (OSError, ValueError, RecursionError):
            read_failures.append(name)
            documents[name] = {}
    result, resources, sources = (documents[name] for name in ("result", "resources", "source-pins"))
    result_bytes, resources_bytes = original_bytes.get("result", b""), original_bytes.get("resources", b"")
    source_sha = hashlib.sha256(original_bytes["source-pins"]).hexdigest() if "source-pins" in original_bytes else None
    run_id, worker_pid = result.get("runId"), resources.get("workerPID")
    worker_result = record(resources.get("workerResult"))
    supervisor_identity, worker_identity = (record(resources.get(key)) for key in ("supervisorIdentity", "workerIdentity"))
    binding = {"supervisorPID": supervisor_pid, "workerPID": worker_pid}
    receipt_checks = audit_checks(result)
    receipt_checks.update({
        "originalEvidenceRead": not read_failures, "cliNotInterrupted": not interrupted,
        "supervisorExitZero": type(supervisor_code) is int and supervisor_code == 0,
        "fixedFormatsAndScope": result.get("format") == RESULT_FORMAT and resources.get("format") == RESOURCES_FORMAT
            and result.get("profile") == PROFILE and worker_result.get("scope") == PROFILE,
        "runIdentity": isinstance(run_id, str) and UUID.fullmatch(run_id) is not None and attempt.name == "attempt-" + run_id
            and resources.get("runId") == run_id and worker_result.get("runId") == run_id,
        "supervisorIdentity": type(supervisor_pid) is int and supervisor_pid > 1 and resources.get("supervisorPID") == supervisor_pid
            and supervisor_identity.get("pid") == supervisor_pid and supervisor_identity.get("ppid") == os.getpid()
            and result.get("supervisor") == binding and worker_result.get("supervisor") == binding
            and isinstance(captured_identity, dict) and set(captured_identity) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
            and all(supervisor_identity.get(key) == value for key, value in captured_identity.items()),
        "workerIdentity": type(worker_pid) is int and worker_pid > 1 and worker_identity.get("pid") == worker_pid
            and worker_identity.get("ppid") == supervisor_pid and worker_identity.get("pgrp") == worker_pid
            and worker_identity.get("session") == worker_pid and resources.get("ownedProcessGroup") == worker_pid,
        "processBirthIdentities": all(isinstance(item.get("startTimeTicks"), str) and re.fullmatch(r"[0-9]+", item["startTimeTicks"]) is not None
            for item in (supervisor_identity, worker_identity)),
        "resultCompleted": result.get("phase") == "completed" and result.get("success") is True,
        "resourcesCompleted": resources.get("phase") == "completed" and "failure" in resources and resources["failure"] is None
            and resources.get("failures") == [],
        "originalResultJoined": worker_result.get("format") == RESULT_FORMAT and worker_result.get("phase") == "completed"
            and worker_result.get("success") is True and worker_result.get("path") == str((attempt / "result.json").relative_to(FLAT))
            and worker_result.get("bytes") == len(result_bytes) and worker_result.get("sha256") == hashlib.sha256(result_bytes).hexdigest(),
        "sourceJoined": result.get("sourceUnchanged") is True and resources.get("sourceClosureUnchanged") is True
            and source_sha is not None and resources.get("sourcePinsSHA256") == source_sha
            and result.get("sourcePins") == sources and resources.get("sourcePins") == sources,
        "localScope": all(value.get("localOnly") is True and value.get("fakeFundsOnly") is True and value.get("publicNetwork") is False
            for value in (result, resources, worker_result)),
        "originalCleanup": resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True
            and resources.get("lockReleased") is True and resources.get("withinTotalDeadline") is True
            and all(record(result.get("cleanup")).get(key) is True and record(worker_result.get("cleanup")).get(key) is True
                for key in ("closedEvm", "closedBitcoin", "closedSolana"))
            and record(result.get("cleanup")).get("errors") == [],
        "workerExitZero": all(resources.get(key) is True for key in ("workerSpawned", "workerExitObserved", "workerCloseObserved"))
            and all(type(record(resources.get(key)).get("code")) is int and record(resources.get(key)).get("code") == 0
                and "signal" in record(resources.get(key)) and record(resources[key])["signal"] is None for key in ("workerExit", "workerClose")),
        "scopedWorkerProjection": type(worker_result.get("originalAuditCalls")) is int and worker_result["originalAuditCalls"] == 6
            and all(type(worker_result.get(key)) is int and worker_result[key] == 0 for key in
                ("proofs", "originalV4EpochDelta", "newPersistedAuthorizations", "newPersistedFacts"))
            and worker_result.get("totalKeyInvocationsMeasured") is False
            and worker_result.get("loadedEquivalence") is False and worker_result.get("financialAcceptance") is False,
    })
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_FRESH_EMPTY_AUDIT_METRICS_LAB_V1", "accepted": accepted,
        "runId": run_id, "attempt": str(attempt.relative_to(ROOT)), "scope": PROFILE,
        "validationScope": "BASE_EMPTY_AUDIT_MEASURED", "receiptChecks": receipt_checks,
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "startedAt": result.get("startedAt"), "finishedAt": result.get("finishedAt"),
        "supervisorExitCode": supervisor_code, "evidenceReadFailures": read_failures,
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest() if "result" in original_bytes else None,
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest() if "resources" in original_bytes else None,
        "sourcePinsSHA256": source_sha, "failure": resources.get("failure"),
        "workerFailure": result.get("failureCode"), "realProofCount": 0 if result.get("proofs") == [] else None,
        "originalAuditCalls": 6 if receipt_checks["sixFixedOriginalAuditCalls"] else None,
        "originalV4EpochDelta": 0 if receipt_checks["originalScopeActivityUnchanged"] else None,
        "totalKeyInvocationsMeasured": False, "rpcCounts": None,
        "loadedEquivalence": False, "financialAcceptance": False,
        "nativeSelfCustody": False, "independentOperators": False, "fullWalletAcceptance": False,
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"),
        "limitations": ["Fresh same-host synthetic BTC, SOL and original EVM bootstrap.",
            "Six empty original audit facades only; no owner, proof, payout or new authorization.",
            "V4 epoch and persisted histories have scope-specific counters, not a total signature counter.",
            "CLAIM phase intervals are partial; CPU includes process siblings; no RPC/queue measurement.",
            "BASE_EMPTY_AUDIT_MEASURED does not explain a loaded Solana presign failure or establish a financial flow."]}
    path = DEV / "reports/empty-audit-lab.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)
    print(json.dumps({"summary": str(path.relative_to(ROOT)), "accepted": accepted, "runId": run_id,
        "validationScope": summary["validationScope"]}), flush=True)
    if not accepted:
        raise SystemExit("Empty audit lab evidence rejected; original reports preserved")



def run(entry, observe=False):
    global active
    if not ((entry == PREPARE and observe is False) or (entry == ENTRY and observe is True)):
        raise SystemExit("Empty audit CLI fixed preparation or supervisor required")
    if interrupted:
        raise SystemExit(130)
    previous = set(DIRECTORY.glob("attempt-*")) if observe else set()
    owner_pid = os.getpid()
    def guard_parent():
        if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
            os._exit(125)
    active = subprocess.Popen([str(NODE), str(entry)], cwd=FLAT, env=CLEAN_ENV, preexec_fn=guard_parent)
    supervisor_pid, captured_identity, seen = active.pid, capture_child_identity(active), None
    if interrupted and active.poll() is None:
        active.send_signal(pending_signal or signal.SIGTERM)
    while active.poll() is None:
        if observe:
            try:
                own_lock = json.loads(private_evidence(DIRECTORY / "active.lock"))
                attempt = FLAT / own_lock["attempt"]
                if own_lock.get("pid") == supervisor_pid and attempt.parent == DIRECTORY and attempt.resolve() == attempt:
                    result = json.loads(private_evidence(attempt / "result.json"))
                    rows = record(result).get("calls")
                    current = (record(result).get("phase"), len(rows) if isinstance(rows, list) else None)
                    if current != seen:
                        print(json.dumps({"stage": current[0], "originalAuditCalls": current[1]}), flush=True)
                        seen = current
            except (OSError, KeyError, ValueError, TypeError, RecursionError):
                pass
        time.sleep(1)
    code = active.returncode
    active = None
    if observe:
        attempts = set(DIRECTORY.glob("attempt-*")) - previous
        if len(attempts) != 1:
            raise SystemExit("Empty audit lab produced no single new attempt; earlier reports are not reused")
        retain_summary(attempts.pop(), supervisor_pid, code, captured_identity)
    if code or interrupted:
        raise SystemExit(code if code > 0 else 2)


def main():
    if len(sys.argv) != 1:
        raise SystemExit("Usage: ./dev lab audit-base")
    if sys.platform != "linux" or Path.cwd().resolve() != ROOT:
        raise SystemExit("Run the fixed Empty audit lab from the project root in Linux/WSL")
    if interrupted:
        raise SystemExit(130)
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "empty-audit-lab.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another Empty audit lab is active")
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, forward_signal)
        # The original bounded public preparer runs first. The supervisor then
        # uses the original sampler/locks/identity cleanup and the fixed empty
        # audit factory. Its new gate remains closed until an explicit review.
        run(PREPARE)
        run(ENTRY, observe=True)


if __name__ == "__main__":
    main()
