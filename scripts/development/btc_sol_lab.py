"""One optionless fresh CBTC invoice/SOL delivery; no historical gate fallback."""
from collections import Counter
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
ENTRY = FLAT / "integration/claims/development/run-development-btc-sol-graph-flow.mjs"
PREPARE = FLAT / "scripts/prepare-development-native-claims.mjs"
DIRECTORY = FLAT / ".local/development-btc-sol-graph-v1"
PROFILE = "FRESH_PRIVATE_CBTC_INVOICE_SOL_DELIVERY_V1"
RESULT_FORMAT = "LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_RESULT_V1"
RESOURCES_FORMAT = "LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_RESOURCES_V1"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
SHA = re.compile(r"[0-9a-f]{64}")
RELATIONS = {"deposit_intent": 1, "native_claim_ingress_v3": 1, "authorization": 1,
    "reservation": 1, "dependency": 1, "ready": 1, "admission": 1, "node": 4,
    "settlement": 1, "withdraw_balance": 2, "native_claim_discharge": 2}
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


def proof_checks(rows):
    typed = isinstance(rows, list) and all(isinstance(row, dict)
        and isinstance(row.get("relation"), str) and isinstance(row.get("evidence"), dict) for row in rows)
    proofs = rows if typed else []
    evidence = [row["evidence"] for row in proofs]
    ids = [row.get("runId", row.get("id")) for row in evidence]
    hashes = [row.get("proofSHA256") for row in proofs]
    valid_bytes = all(digest(row.get("proofSHA256")) and digest(row.get("publicInputsSHA256")) for row in proofs)
    receipts = all(item.get("resourceReceiptCompleted") is True
        and (item.get("acceptedResult") is True if row["relation"] == "withdraw_balance" else item.get("selfVerified") is True)
        and (digest(item.get("telemetrySHA256")) if row["relation"] == "withdraw_balance"
            else all(digest(item.get(key)) for key in ("manifestSHA256", "resultSHA256", "resourcesSHA256")))
        for row, item in zip(proofs, evidence))
    pins = all((item.get("sourceVersion") == "65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555"
        and item.get("keySHA256") == "11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f")
        if row["relation"] == "native_claim_ingress_v3" else
        item.get("keySHA256") == "0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83"
        if row["relation"] == "native_claim_discharge" else True for row, item in zip(proofs, evidence))
    checks = {"proofRowsTyped": typed,
        "sixteenOriginalProofRelations": typed and len(proofs) == 16 and Counter(row["relation"] for row in proofs) == Counter(RELATIONS),
        "sixteenFreshProofAttempts": typed and len(ids) == 16 and all(isinstance(value, str) and UUID.fullmatch(value) for value in ids)
            and len(set(ids)) == 16,
        "originalProofByteHashes": typed and valid_bytes and len(hashes) == 16 and len(set(hashes)) == 16,
        "originalCompletedProofReceipts": typed and receipts,
        "originalCi51Co42Pins": typed and pins,
        "ownerAndSolverExits": typed and all(isinstance(item.get("purpose"), str) for row, item in zip(proofs, evidence)
            if row["relation"] == "withdraw_balance") and sorted(item["purpose"] for row, item in zip(proofs, evidence)
            if row["relation"] == "withdraw_balance") == ["owner", "recipient"]}
    return proofs, checks


def retain_summary(attempt, supervisor_pid, supervisor_code, captured_identity):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("BTC/SOL lab produced no single original new attempt")
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
    proofs, receipt_checks = proof_checks(result.get("proofs"))
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
            and all(record(result.get("cleanup")).get(key) is True for key in ("closedController", "closedKeeper"))
            and record(result.get("cleanup")).get("errors") == [],
        "workerExitZero": all(resources.get(key) is True for key in ("workerSpawned", "workerExitObserved", "workerCloseObserved"))
            and all(type(record(resources.get(key)).get("code")) is int and record(resources.get(key)).get("code") == 0
                and "signal" in record(resources.get(key)) and record(resources[key])["signal"] is None for key in ("workerExit", "workerClose")),
        "custodialInvoiceGraphScope": result.get("graphExecutionEstablished") is True and result.get("selectedAssets") == [0]
            and all(result.get(key) is False for key in ("nativeSelfCustody", "independentOperators", "nativeProcessRestartEstablished",
                "keeperLossRecoveryEstablished", "fullWalletAcceptance"))
            and all(worker_result.get(key) is True for key in ("btcCustodialIngress", "paegGraphExecution", "originalPrivateNoteExit", "nativePayoutAndDischarge", "duplicateNoEffect"))
            and all(worker_result.get(key) is False for key in ("actualFRecoveryAcceptance", "evmVaultAcceptance", "browserVisualAcceptance", "fullWalletAcceptance")),
        "fixedNativeEffects": result.get("nativeEffects") == {"bitcoin": 3, "solana": 0, "graphBitcoin": 0, "graphSolana": 1, "eachBroadcastOnce": True},
        "twoOriginalBtcRedemptions": isinstance(result.get("redemptions"), list) and len(result["redemptions"]) == 2
            and [(record(row).get("assetIndex"),record(row).get("amount"),record(row).get("role"),record(row).get("status"),record(row).get("duplicateNoEffect"))
                for row in result["redemptions"]] == [(0,"80000","change","DISCHARGED",True),(0,"20000","solver","DISCHARGED",True)],
    })
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_DEVELOPMENT_BTC_SOL_GRAPH_LAB_V1", "accepted": accepted,
        "runId": run_id, "attempt": str(attempt.relative_to(ROOT)), "scope": PROFILE, "receiptChecks": receipt_checks,
        "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        "startedAt": result.get("startedAt"), "finishedAt": result.get("finishedAt"),
        "supervisorExitCode": supervisor_code, "evidenceReadFailures": read_failures,
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest() if "result" in original_bytes else None,
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest() if "resources" in original_bytes else None,
        "sourcePinsSHA256": source_sha, "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "realProofCount": len(proofs) if receipt_checks["proofRowsTyped"] else None,
        "proofRelations": [row["relation"] for row in proofs],
        "proofHashes": [{key: row.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")} for row in proofs],
        "nativeEffects": result.get("nativeEffects"), "redemptions": result.get("redemptions"),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"), "resourceSummary": resources.get("resourceSummary"),
        "nativeSelfCustody": False, "independentOperators": False, "nativeProcessRestartEstablished": False,
        "keeperLossRecoveryEstablished": False, "fullWalletAcceptance": False, "actualFRecoveryAcceptance": False,
        "limitations": ["Fresh same-host fake-value BTC regtest, custom SOL validator and original Cancun EVM only.",
            "One private 100000 CBTC invoice pays 20000 to a separate solver for 1000000 lamports; 80000 is owner change.",
            "Both original BTC redemptions use the same fixed owned custody native recipient; two independent BTC wallets are not established.",
            "Both custodial BTC redemptions discharge once. Native/process/key loss recovery is excluded.",
            "One real admitted HTTP response is discarded; no physical network outage is simulated.",
            "No same-asset bridge, price discovery, browser/mobile custody, independent operators, public network or privacy certification."]}
    path = DEV / "reports/btc-sol-lab.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600)
    temporary.replace(path)
    print(json.dumps({"summary": str(path.relative_to(ROOT)), "accepted": accepted, "runId": run_id,
        "realProofCount": summary["realProofCount"]}), flush=True)
    if not accepted:
        raise SystemExit("BTC/SOL lab evidence rejected; original reports preserved")


def run(entry, observe=False):
    global active
    if not ((entry == PREPARE and observe is False) or (entry == ENTRY and observe is True)):
        raise SystemExit("BTC/SOL CLI fixed preparation or supervisor required")
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
                    rows = record(result).get("proofs")
                    current = (record(result).get("phase"), len(rows) if isinstance(rows, list) else None)
                    if current != seen:
                        print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True)
                        seen = current
            except (OSError, KeyError, ValueError, TypeError, RecursionError):
                pass
        time.sleep(1)
    code = active.returncode
    active = None
    if observe:
        attempts = set(DIRECTORY.glob("attempt-*")) - previous
        if len(attempts) != 1:
            raise SystemExit("BTC/SOL lab produced no single new attempt; earlier reports are not reused")
        retain_summary(attempts.pop(), supervisor_pid, code, captured_identity)
    if code or interrupted:
        raise SystemExit(code if code > 0 else 2)


def main():
    if len(sys.argv) != 1:
        raise SystemExit("Usage: ./dev lab btc-sol")
    if sys.platform != "linux" or Path.cwd().resolve() != ROOT:
        raise SystemExit("Run the fixed BTC/SOL lab from the project root in Linux/WSL")
    if interrupted:
        raise SystemExit(130)
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "btc-sol-lab.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another BTC/SOL lab is active")
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, forward_signal)
        # The bounded public preparer authenticates/reuses original CI51/CO42
        # and can rebuild absent public artifacts without historical reports.
        # Its original global proof lock and per-phase limits stay unchanged.
        run(PREPARE)
        run(ENTRY, observe=True)


if __name__ == "__main__":
    main()
