"""Fixed actual PRODUCT SOURCE D26→exit17→new PID→U/S→ARM→exit17→same ARM.

Original supervisor admission/ownership/cleanup and raw proof readers are
reused. This launcher accepts no profile, secret, PID or artifact selection.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import sys
import uuid
import paired_original_account_lab as original
from workspace import ROOT, DEV, build
from osaka_lab import private_evidence

PROFILE = "native-original-source-abrupt-v1"
RESULT_FORMAT = "LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_RESULT_V1"
RESOURCES_FORMAT = "LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_RESOURCES_V1"
ENTRY = original.FLAT / "integration/run-native-original-source-abrupt-v1.mjs"
DIRECTORY = original.FLAT / ".local" / PROFILE
FALSE_SCOPE = ("publicNetwork", "nativeGraphAcceptance", "keeperLossRecoveryEstablished", "mobileNoteCustodyEstablished",
    "tlsEstablished", "reactRendererEstablished", "physicalPhoneEstablished", "mobilePortfolioEstablished",
    "independentInfrastructureEstablished", "fullWalletAcceptance", "postCutoffRecoveryEstablished")

def retain_summary(attempt, supervisor_pid, code, captured):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt:
        raise RuntimeError("NATIVE_SOURCE_SINGLE_ORIGINAL_ATTEMPT_REQUIRED")
    raw, data, unavailable = {}, {}, []
    for name in ("result", "resources", "source-pins"):
        try:
            raw[name] = private_evidence(attempt / (name + ".json"))
            data[name] = json.loads(raw[name])
            if type(data[name]) is not dict:
                raise ValueError("NATIVE_SOURCE_ORIGINAL_EVIDENCE_OBJECT")
        except (OSError, ValueError, TypeError, RecursionError):
            unavailable.append(name); data[name] = {}
    r, s, pins = (data[name] for name in ("result", "resources", "source-pins"))
    w = original.record(s.get("workerResult")); si = original.record(s.get("supervisorIdentity")); wi = original.record(s.get("workerIdentity"))
    run_id, worker_pid = r.get("runId"), s.get("workerPID")
    identity = {"supervisorPID": supervisor_pid, "workerPID": worker_pid}
    checks = {
        "originalEvidenceRead": not unavailable,
        "supervisorExitedZero": type(code) is int and code == 0 and original.interrupted is False,
        "originalRun": type(run_id) is str and original.UUID.fullmatch(run_id) is not None and attempt.name == "attempt-" + run_id
            and s.get("runId") == w.get("runId") == run_id,
        "originalFormats": r.get("format") == RESULT_FORMAT and s.get("format") == RESOURCES_FORMAT and w.get("format") == RESULT_FORMAT,
        "originalSupervisor": s.get("supervisorPID") == supervisor_pid and si.get("pid") == supervisor_pid and si.get("ppid") == os.getpid()
            and type(captured) is dict and set(captured) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
            and all(si.get(k) == v for k, v in captured.items()) and r.get("supervisor") == w.get("supervisor") == identity,
        "originalWorker": type(worker_pid) is int and worker_pid > 1 and wi.get("pid") == worker_pid and wi.get("ppid") == supervisor_pid
            and wi.get("pgrp") == wi.get("session") == s.get("ownedProcessGroup") == worker_pid,
        "originalResultHash": w.get("path") == str((attempt / "result.json").relative_to(original.FLAT))
            and w.get("bytes") == len(raw.get("result", b"")) and w.get("sha256") == hashlib.sha256(raw.get("result", b"")).hexdigest(),
        "originalSourceHash": "source-pins" in raw and s.get("sourcePinsSHA256") == hashlib.sha256(raw["source-pins"]).hexdigest()
            and r.get("sourcePins") == s.get("sourcePins") == pins and r.get("sourceUnchanged") is True and s.get("sourceClosureUnchanged") is True,
        "completedOriginals": r.get("success") is w.get("success") is True and r.get("phase") == s.get("phase") == w.get("phase") == "completed"
            and r.get("interrupted") is False and s.get("failure", "missing") is None and s.get("failures") == [],
        "sourceScope": r.get("profile") == PROFILE and r.get("sourceAbruptRestartNodeAcceptance") is w.get("sourceAbruptRestartNodeAcceptance") is True
            and all(r.get(k) is w.get(k) is True for k in ("nativeProcessRestartEstablished", "sourceArmedAbruptRestartEstablished",
                "sourceEconomicStateAbruptRestartEstablished", "sourceMobileStateCoherenceEstablished"))
            and all(r.get(k) is w.get(k) is False for k in FALSE_SCOPE)
            and r.get("nativeDeliveryCount") == w.get("nativeDeliveryCount") == 0
            and all(v.get("localOnly") is v.get("fakeFundsOnly") is True and v.get("publicNetwork") is False for v in (r, s, w)),
        "originalWorkerExit": all(s.get(k) is True for k in ("workerSpawned", "workerExitObserved", "workerCloseObserved"))
            and all(original.record(s.get(k)) == {"code": 0, "signal": None} for k in ("workerExit", "workerClose")),
        "originalCleanup": all(s.get(k) is True for k in ("resultAccepted", "ownedGroupCleanupConfirmed", "lockReleased", "withinTotalDeadline"))
            and original.record(r.get("cleanup")).get("errors") == []
            and all(original.record(v.get("cleanup")).get(k) is True for v in (r, w) for k in ("closedEvm", "closedNativeEvm", "closedNativeExecution", "closedBackend")),
    }
    original.NATIVE_ECONOMIC_NOTE_RECOVERY = True
    proofs, proof_checks = original.reservation_proof_checks(r.get("proofs"), original.record(original.record(r.get("artifacts")).get("noteKeys")))
    checks.update(proof_checks)
    crash, birth, reopened, arm = (original.record(r.get(k)) for k in ("crash", "birth", "reopen", "arm"))
    old, new = (original.record(v.get("initial")) for v in (birth, reopened))
    checks["actualAbruptExit"] = crash.get("exit") == {"code": 17, "signal": None} and crash.get("intendedExitCode") == 17         and crash.get("orderedCaptureCalled") is crash.get("originalCloseCalled") is False         and crash.get("allOriginalProcessesAbsent") is crash.get("parentVaultRetained") is True         and crash.get("configuredKernelParentDeathSignal") == "SIGTERM" and crash.get("signalDeliveryObserved") is False
    checks["sameNewOriginalSource"] = original.record(old.get("process")).get("pid") != original.record(new.get("process")).get("pid")         and old.get("descriptor") == new.get("descriptor") and new.get("ledger") == original.record(crash.get("before")).get("ledger")         and new.get("counts") == original.record(crash.get("before")).get("counts")         and type(old.get("sourceGeneration")) is int and type(new.get("sourceGeneration")) is int and new["sourceGeneration"] > old["sourceGeneration"]
    checks["firstFreshArmNoF"] = arm.get("firstFreshPermission") is arm.get("noEarlyF") is True         and original.record(arm.get("permission")).get("state") == "ARMED"         and original.record(original.record(arm.get("final")).get("status")).get("outcome", "missing") is None
    checks["exactFinancialEffects"] = r.get("economics") == {"amountAtomic": "500", "changeAtomic": "400", "recoveryAtomic": "100",
        "receiverFinancialWires": 2, "nativeDeliveryWires": 0, "poolBackedAtomic": "500"}
    armed_crash, armed_open, armed_observed = (original.record(r.get(k)) for k in ("armedCrash", "armedReopen", "armedObservation"))
    armed_before = original.record(armed_crash.get("before")); third = original.record(armed_open.get("initial"))
    before_arm, third_arm = (original.record(original.record(v.get("snapshot")).get("arm")) for v in (armed_before, third))
    permission = original.record(arm.get("permission"))
    checks["actualArmedAbruptExit"] = armed_crash.get("exit") == {"code": 17, "signal": None} and armed_crash.get("intendedExitCode") == 17 \
        and armed_crash.get("orderedCaptureCalled") is armed_crash.get("originalCloseCalled") is armed_crash.get("signalDeliveryObserved") is False \
        and armed_crash.get("allOriginalProcessesAbsent") is armed_crash.get("parentVaultRetained") is True \
        and armed_crash.get("configuredKernelParentDeathSignal") == "SIGTERM"
    checks["sameOriginalArmThirdPID"] = original.record(third.get("process")).get("pid") not in (original.record(old.get("process")).get("pid"), original.record(new.get("process")).get("pid")) \
        and third.get("descriptor") == new.get("descriptor") and type(third.get("sourceGeneration")) is int and type(new.get("sourceGeneration")) is int and third["sourceGeneration"] > new["sourceGeneration"] \
        and all(v.get("state") == "ARMED" and v.get("armSHA256") == permission.get("armSHA256") and v.get("settleBefore") == permission.get("settleBefore") for v in (before_arm, third_arm, original.record(armed_observed.get("arm")))) \
        and armed_observed.get("originalPermissionRetained") is armed_observed.get("noNewProofKeyOrSend") is True
    economic = original.record(r.get("economicState")); birth_state = original.record(economic.get("birth"))
    birth_value, birth_checkpoint = (original.record(birth_state.get(k)) for k in ("value", "checkpoint"))
    transitions = [original.record(economic.get(k)) for k in ("d26", "armed")]
    checks["sameEconomicObservationJournal"] = type(birth_value.get("rows")) is list and len(birth_value["rows"]) > 0 and all(
        original.record(v.get("opened")).get("checkpoint") == original.record(v.get("before")).get("checkpoint")
        and all(original.record(original.record(v.get(stage)).get("value")).get("lifetime") == birth_value.get("lifetime")
            and original.record(original.record(v.get(stage)).get("checkpoint")).get("sourceSetSHA256") == birth_checkpoint.get("sourceSetSHA256")
            and original.record(original.record(v.get(stage)).get("value")).get("storageAvailable") is True for stage in ("before", "opened", "fresh"))
        and original.record(original.record(v.get("opened")).get("value")).get("observedAt", "missing") is None
        and all(row.get("state") != "LIVE" and row.get("balances", "missing") is None for row in original.record(original.record(v.get("opened")).get("value")).get("rows", [])) for v in transitions)
    mobile = original.record(economic.get("mobile")); mobile_points = [original.record(mobile.get(k)) for k in ("sourceBefore", "sourceAfter", "outputsBefore", "invalidated", "outputsAfter")]
    source_points = mobile_points[:2]; output_points = (mobile_points[2], mobile_points[4]); invalidated = mobile_points[3]
    checks["originalMobileStateUnion"] = all(v.get("aggregateBalance", "missing") is None and v.get("completePortfolio") is False and v.get("readOnly") is True for v in mobile_points) \
        and all(type(v.get("rows")) is list and len(v["rows"]) == 1 and v["rows"][0].get("available") == "500" and original.record(v["rows"][0].get("route")).get("component") == "DEVICE_NATIVE_SOURCE" for v in source_points) \
        and all(type(v.get("rows")) is list and len(v["rows"]) == 2 and [(original.record(row.get("route")).get("noteRole"), row.get("available"), row.get("locked")) for row in v["rows"]] == [("change", "400", None), ("recovery", None, "100")] for v in output_points) \
        and type(invalidated.get("rows")) is list and len(invalidated["rows"]) == 2 and all(row.get("state") == "STALE" and row.get("available", "missing") is row.get("locked", "missing") is None for row in invalidated["rows"])
    # Copy only finite checks and source/raw hashes; journal/witness/key data is
    # never emitted by this public terminal projection.
    summary = {"format": "LIANUM_NATIVE_ORIGINAL_SOURCE_ABRUPT_CLI_SUMMARY_V1", "runId": run_id,
        "phase": "completed" if all(checks.values()) else "rejected", "scope": "ORIGINAL_MOBILE_SOURCE_D26_AND_ARM_ABRUPT_SAME_JOURNAL_MOBILE_STATE",
        "sourceArmedAbruptRestartEstablished": all(checks.values()), "sourceEconomicStateAbruptRestartEstablished": all(checks.values()),
        "sourceMobileStateCoherenceEstablished": all(checks.values()),
        "realProofCount": len(proofs), "checks": checks, "failedChecks": [k for k, v in checks.items() if not v],
        "raw": {name: {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()} for name, value in raw.items()},
        "configuredKernelParentDeathSignal": "SIGTERM", "kernelSignalDeliveryObserved": False,
        "postCutoffRecoveryEstablished": False, "physicalPhoneEstablished": False, "fullWalletAcceptance": False}
    path = attempt / "original-source-cli-summary.json"
    with path.open("x", encoding="utf8") as stream:
        os.chmod(path, 0o600); stream.write(json.dumps(summary, indent=2) + "\n"); stream.flush(); os.fsync(stream.fileno())
    print(json.dumps({"scope": summary["scope"], "accepted": summary["phase"] == "completed", "realProofs": len(proofs),
        "nativeDeliveryCount": r.get("nativeDeliveryCount"), "failedChecks": summary["failedChecks"]}), flush=True)
    if not all(checks.values()):
        raise SystemExit("Original SOURCE raw receipt rejected")

def main():
    if sys.argv[1:] or sys.platform != "linux" or Path.cwd().resolve() != ROOT         or Path(__file__).resolve() != ROOT / "scripts/development/native_original_source_abrupt_lab_v1.py"         or Path(sys.argv[0]).resolve() != Path(__file__).resolve():
        raise SystemExit("Use python3 -B scripts/development/native_original_source_abrupt_lab_v1.py from the project root")
    # Private fixed composition of the ORIGINAL admitted-child lifecycle.
    # These values are literals in this launcher, never arguments or env data.
    original.ENTRY, original.DIRECTORY = ENTRY, DIRECTORY
    original.PROFILE, original.RESULT_FORMAT, original.RESOURCES_FORMAT = PROFILE, RESULT_FORMAT, RESOURCES_FORMAT
    build(quiet=True); DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "native-original-source-abrupt-v1.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Original SOURCE launcher is already active")
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise SystemExit("Private original SOURCE lock required")
        if lock.read(16385).strip():
            raise SystemExit("Original SOURCE admission retained; audit original closure")
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, original.forward_signal)
        attempt, pid, code, captured = original._run_original_supervisor(lock)
        retain_summary(attempt, pid, code, captured)
        if code or original.interrupted:
            raise SystemExit(code if code > 0 else 2)

if __name__ == "__main__":
    main()
