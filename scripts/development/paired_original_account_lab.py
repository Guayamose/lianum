"""Fixed local Node-client acceptance of two original account notes.

No note custody on a phone, TLS, private portfolio or economic API is enabled.
The private summary joins the closed original supervisor/worker evidence only.
"""
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
import uuid
from workspace import ROOT, DEV, RUNTIME, build
from osaka_lab import capture_child_identity, private_evidence

NODE = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
ENTRY = FLAT / "integration/run-paired-native-note-v2.mjs"
DIRECTORY = FLAT / ".local/paired-native-note-v2"
PROFILE = "paired-native-note-v2"
RESULT_FORMAT = "LIANUM_PAIRED_NATIVE_NOTE_RESULT_V2"
RESOURCES_FORMAT = "LIANUM_PAIRED_NATIVE_NOTE_RESOURCES_V2"
CLEAN_ENV = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
SHA = re.compile(r"[0-9a-f]{64}")
SCOPE_FALSE = ("publicNetwork", "nativeGraphAcceptance", "nativeProcessRestartEstablished",
    "keeperLossRecoveryEstablished", "mobileNoteCustodyEstablished", "tlsEstablished",
    "reactRendererEstablished", "physicalPhoneEstablished", "mobilePortfolioEstablished",
    "independentInfrastructureEstablished", "fullWalletAcceptance")
active = None
active_identity = None
active_pidfd = None
interrupted = False
pending_signal = None
CLEANUP_SECONDS = 15
START_PIPE_ENV = "LIANUM_PAIRED_ORIGINAL_START_FD_V2"
DEVICE_DEPOSIT = False
DEVICE_RESERVATION = False
DEVICE_EXECUTION = False
DEVICE_RECOVERY = False


def record(value):
    return value if isinstance(value, dict) else {}


def digest(value):
    return isinstance(value, str) and SHA.fullmatch(value) is not None


def signal_original(signum):
    # The original Popen capability alone is insufficient after a changed birth,
    # owner or parent. Signal only the retained pidfd joined before/after opening.
    if active is None or active.poll() is not None:
        return
    current = capture_child_identity(active)
    if active_identity is None or active_pidfd is None:
        return  # Startup handler records pending signal; main delivers after capture.
    if current != active_identity:
        raise RuntimeError("PAIRED_CLI_SUPERVISOR_SIGNAL_IDENTITY_CHANGED")
    status = Path(f"/proc/{active.pid}/status").read_text()
    match = re.search(r"^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$", status, re.M)
    if not match or any(int(value) != os.getuid() for value in match.groups()):
        raise RuntimeError("PAIRED_CLI_SUPERVISOR_SIGNAL_UID_CHANGED")
    signal.pidfd_send_signal(active_pidfd, signum, None, 0)


def forward_signal(signum, _frame):
    global interrupted, pending_signal
    interrupted, pending_signal = True, signum
    # Do no /proc I/O or signalling in a handler during Popen/capture. The
    # causal child is either still behind its start pipe, or the main loop
    # forwards this latched signal through its already authenticated pidfd.


def _lock_record(lock, value):
    lock.seek(0)
    lock.write(json.dumps(value, separators=(",", ":")) + "\n")
    lock.truncate(); lock.flush(); os.fsync(lock.fileno())


def _original_cleanup_receipt(attempt, child, captured):
    """Closure only, including rejected attempts; never economic acceptance."""
    if captured is None or child.poll() is None or attempt.parent != DIRECTORY or attempt.resolve() != attempt:
        return False
    resources = json.loads(private_evidence(attempt / "resources.json"))
    identity = record(resources.get("supervisorIdentity"))
    if resources.get("format") != RESOURCES_FORMAT or resources.get("supervisorPID") != child.pid:
        return False
    if any(identity.get(key) != value for key, value in captured.items()):
        return False
    if resources.get("ownedGroupCleanupConfirmed") is not True or resources.get("lockReleased") is not True:
        return False
    if resources.get("workerSpawned") is False:
        return resources.get("workerPID") is None
    return resources.get("workerSpawned") is True and resources.get("workerExitObserved") is True \
        and resources.get("workerCloseObserved") is True


def _run_original_supervisor(lock):
    """Private fixed launch seam. All paths/argv are module literals, not input.

    A private inherited pipe keeps the reviewed entry before any worker or
    native operation until this parent has retained and rechecked its pidfd.
    Closing the pipe without the one-byte grant cancels startup. A startup
    failure has no fallback signal by PID and keeps the admission marker.
    """
    global active, active_identity, active_pidfd
    launch_id = str(uuid.uuid4())
    state = {"format": "LIANUM_PAIRED_ORIGINAL_CLI_LIFECYCLE_V2", "launchId": launch_id,
        "phase": "admitted", "wrapperPID": os.getpid(), "supervisorPID": None,
        "supervisorIdentity": None, "startupGrantDelivered": False, "originalSupervisorExitCode": None,
        "originalSupervisorExited": False, "originalCleanupConfirmed": False, "admissionRetained": True,
        "failure": None, "failurePhase": None, "exceptionClass": None,
        "cleanupErrors": [], "cleanupDeadlineSeconds": CLEANUP_SECONDS}
    # This file remains nonempty across SIGKILL/exception and blocks relaunch
    # under the same flock. Kernel flock itself ends when its wrapper exits.
    _lock_record(lock, state)
    previous = set(DIRECTORY.glob("attempt-*"))
    grant_reader = grant_writer = None
    child = None
    cleanup_deadline = None
    signal_sent = False
    seen = None
    phase = "before-spawn"
    def fail(code):
        nonlocal cleanup_deadline
        if state["failure"] is None:
            state["failure"] = code
            state["failurePhase"] = phase
        if cleanup_deadline is None:
            cleanup_deadline = time.monotonic() + CLEANUP_SECONDS
    def close_grant():
        nonlocal grant_reader, grant_writer
        for name, fd in (("reader", grant_reader), ("writer", grant_writer)):
            if fd is not None:
                try: os.close(fd)
                except OSError: state["cleanupErrors"].append("PAIRED_CLI_START_PIPE_CLOSE_FAILED")
            if name == "reader": grant_reader = None
            else: grant_writer = None
    owner_pid = os.getpid()
    def guard_parent():
        if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
            os._exit(125)
    try:
        if interrupted:
            fail("PAIRED_CLI_INTERRUPTED_BEFORE_SPAWN")
        else:
            phase = "create-start-pipe"
            grant_reader, grant_writer = os.pipe2(os.O_CLOEXEC)
            # Popen assignment and every subsequent startup step share this
            # try/finally; no fd, child or admission leaves through a gap.
            phase = "popen"
            child = subprocess.Popen([str(NODE), str(ENTRY)], cwd=FLAT,
                env={**CLEAN_ENV, START_PIPE_ENV: str(grant_reader)},
                pass_fds=(grant_reader,), preexec_fn=guard_parent)
            active = child
            state["supervisorPID"] = child.pid
            os.close(grant_reader); grant_reader = None
            phase = "capture"
            active_identity = capture_child_identity(child)
            state["supervisorIdentity"] = active_identity
            if active_identity is None:
                fail("PAIRED_CLI_SUPERVISOR_CAPTURE_UNCONFIRMED")
            elif child.poll() is not None:
                fail("PAIRED_CLI_SUPERVISOR_EXITED_DURING_CAPTURE")
            else:
                phase = "pidfd-open"
                active_pidfd = os.pidfd_open(child.pid, 0)
                phase = "pidfd-recheck"
                if capture_child_identity(child) != active_identity:
                    fail("PAIRED_CLI_SUPERVISOR_IDENTITY_CHANGED")
                else:
                    # Reuse the signalling predicate without sending a signal:
                    # both captures already checked inode owner and parent;
                    # the four UID fields must also remain this user's.
                    phase = "uid-recheck"
                    status = Path(f"/proc/{child.pid}/status").read_text()
                    match = re.search(r"^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$", status, re.M)
                    if not match or any(int(value) != os.getuid() for value in match.groups()):
                        fail("PAIRED_CLI_SUPERVISOR_UID_CHANGED")
                    elif capture_child_identity(child) != active_identity:
                        fail("PAIRED_CLI_SUPERVISOR_IDENTITY_CHANGED")
            state["supervisorIdentity"] = active_identity
            if interrupted:
                fail("PAIRED_CLI_INTERRUPTED_DURING_STARTUP")
            if state["failure"] is None:
                phase = "startup-grant"
                if os.write(grant_writer, b"G") != 1:
                    fail("PAIRED_CLI_START_GRANT_FAILED")
                else: state["startupGrantDelivered"] = True
            close_grant()
            _lock_record(lock, state)
            phase = "observation"
            while child.poll() is None:
                if interrupted:
                    fail("PAIRED_CLI_INTERRUPTED")
                if state["failure"] is not None:
                    if state["startupGrantDelivered"] and not signal_sent:
                        signal_original(pending_signal or signal.SIGTERM); signal_sent = True
                    if time.monotonic() >= cleanup_deadline:
                        break
                try:
                    own_lock = json.loads(private_evidence(DIRECTORY / "active.lock"))
                    attempt = FLAT / own_lock["attempt"]
                    if own_lock.get("pid") == child.pid and attempt.parent == DIRECTORY and attempt.resolve() == attempt:
                        result = json.loads(private_evidence(attempt / "result.json"))
                        rows = record(result).get("proofs")
                        current = (record(result).get("phase"), len(rows) if isinstance(rows, list) else None)
                        if current != seen:
                            print(json.dumps({"stage": current[0], "realProofs": current[1]}), flush=True); seen = current
                except (OSError, KeyError, ValueError, TypeError, RecursionError):
                    pass
                time.sleep(0.1)
    except Exception as error:
        name = type(error).__name__
        state["exceptionClass"] = name if name in {"ValueError", "TypeError", "RuntimeError", "OSError",
            "PermissionError", "FileNotFoundError", "ProcessLookupError", "IndexError", "OverflowError"} else "UnexpectedException"
        fail("PAIRED_CLI_STARTUP_OR_OBSERVATION_EXCEPTION")
    finally:
        # EOF cancels an ungranted startup. For an admitted worker the original
        # supervisor owns cleanup; one authenticated TERM requests that cleanup.
        close_grant()
        if child is not None:
            if child.poll() is None:
                fail("PAIRED_CLI_SUPERVISOR_EXIT_UNCONFIRMED")
                if state["startupGrantDelivered"] and not signal_sent:
                    try: signal_original(pending_signal or signal.SIGTERM); signal_sent = True
                    except Exception: state["cleanupErrors"].append("PAIRED_CLI_ORIGINAL_SIGNAL_UNCONFIRMED")
                while child.poll() is None and time.monotonic() < cleanup_deadline:
                    time.sleep(min(0.02, max(0, cleanup_deadline - time.monotonic())))
            state["originalSupervisorExited"] = child.poll() is not None
            state["originalSupervisorExitCode"] = child.returncode
        else:
            state["originalSupervisorExited"] = True  # Popen did not return a child.
        attempts = set(DIRECTORY.glob("attempt-*")) - previous
        attempt = attempts.pop() if len(attempts) == 1 else None
        if child is None:
            state["originalCleanupConfirmed"] = True
        elif attempt is not None:
            try: state["originalCleanupConfirmed"] = _original_cleanup_receipt(attempt, child, active_identity)
            except Exception: state["cleanupErrors"].append("PAIRED_CLI_ORIGINAL_CLEANUP_RECEIPT_UNAVAILABLE")
        state["admissionRetained"] = not state["originalCleanupConfirmed"]
        state["phase"] = "closed" if state["originalCleanupConfirmed"] else "closure-unconfirmed"
        state["kernelFlockRetainedBeyondWrapper"] = False
        receipt_path = DEV / "reports/paired-original-account-cli-v2" / (launch_id + ".json")
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        with receipt_path.open("x", encoding="utf8") as stream:
            os.chmod(receipt_path, 0o600)
            stream.write(json.dumps(state, indent=2) + "\n"); stream.flush(); os.fsync(stream.fileno())
        if state["originalCleanupConfirmed"]:
            lock.seek(0); lock.truncate(); lock.flush(); os.fsync(lock.fileno())
        else: _lock_record(lock, state)
        if active_pidfd is not None:
            os.close(active_pidfd); active_pidfd = None
        # Keep the causal Popen while this function publishes its closure. Its
        # identity is never re-created from a dead numeric PID.
        active = None; active_identity = None
    if child is None or state["failure"] is not None or not state["originalCleanupConfirmed"]:
        raise RuntimeError(state["failure"] or "PAIRED_CLI_ORIGINAL_CLEANUP_UNCONFIRMED")
    if attempt is None:
        raise RuntimeError("PAIRED_CLI_SINGLE_NEW_ATTEMPT_REQUIRED")
    return attempt, child.pid, child.returncode, state["supervisorIdentity"]


def proof_checks(rows, note_keys, device_deposit=False):
    if DEVICE_EXECUTION:
        return execution_proof_checks(rows, note_keys)
    if DEVICE_RESERVATION:
        return reservation_proof_checks(rows, note_keys)
    typed = isinstance(rows, list) and all(isinstance(row, dict) and isinstance(row.get("evidence"), dict) for row in rows)
    proofs = rows if typed else []
    expected = [("deposit_balance", 26)] if device_deposit else [("deposit_balance", 26), ("withdraw_balance", 39)]
    count = len(expected)
    checks = {"proofRowsTyped": typed,
        "twoOriginalNoteRelations": typed and len(proofs) == count and [(row.get("relation"), row.get("publicWords")) for row in proofs] == expected,
        "twoFreshOriginalProofAttempts": typed and len(proofs) == count and all(isinstance(row["evidence"].get("id"), str)
            and UUID.fullmatch(row["evidence"]["id"]) for row in proofs)
            and len({row["evidence"].get("id") for row in proofs}) == count,
        "twoDistinctOriginalProofBytes": typed and len(proofs) == count and len({row.get("proofSHA256") for row in proofs}) == count
            and all(digest(row.get("proofSHA256")) and digest(row.get("publicInputsSHA256")) and row.get("amountAtomic") == "500" for row in proofs),
        "twoCompletedGenuineProofReceipts": typed and len(proofs) == count and all(
            row["evidence"].get("classification") == "ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY"
            and row["evidence"].get("mode") == row.get("relation") and row["evidence"].get("operation") == "prove"
            and row["evidence"].get("purpose") == "owner" and row["evidence"].get("phase") == "completed"
            and row["evidence"].get("acceptedResult") is True and row["evidence"].get("resourceReceiptCompleted") is True
            and row["evidence"].get("zeroKnowledgeEnabled") is True and digest(row["evidence"].get("telemetrySHA256"))
            and row["evidence"].get("exit") == {"code": 0, "signal": None}
            and record(row["evidence"].get("worker")).get("verified") is True
            and record(row["evidence"].get("worker")).get("zeroKnowledgeEnabled") is True
            and record(row["evidence"].get("worker")).get("proofSHA256") == row.get("proofSHA256")
            and record(row["evidence"].get("worker")).get("publicInputsSHA256") == row.get("publicInputsSHA256")
            and record(row["evidence"].get("worker")).get("publicInputCount") == row.get("publicWords")
            and digest(row["evidence"].get("keySHA256")) and row["evidence"]["keySHA256"] == note_keys.get(row.get("relation"))
            and record(row["evidence"].get("worker")).get("keySHA256") == row["evidence"]["keySHA256"] for row in proofs)}
    if device_deposit:
        checks = {key.replace("two", "one", 1): value for key, value in checks.items()}
    return proofs, checks


def execution_proof_checks(rows, note_keys):
    """Only raw public original proof receipts; this reader emits no authority."""
    global DEVICE_EXECUTION
    previous = DEVICE_EXECUTION
    DEVICE_EXECUTION = False
    try:
        _, prefix_checks = reservation_proof_checks(rows[:3] if isinstance(rows, list) else rows, note_keys)
    finally:
        DEVICE_EXECUTION = previous
    typed = isinstance(rows, list) and all(isinstance(row, dict) and isinstance(row.get("evidence"), dict) for row in rows)
    proofs = rows if typed else []
    relations = ["deposit_balance", "authorization", "reservation", "dependency", "ready", "admission_native_value_v2",
        "recovery", "withdraw_balance", "withdraw_balance"] if DEVICE_RECOVERY else ["deposit_balance", "authorization", "reservation", "dependency", "ready", "admission_native_value_v2",
        "node", "node", "node", "node", "settlement", "withdraw_balance"]
    checks = {"proofRowsTyped": typed, "expectedOriginalRelations": typed and [r.get("relation") for r in proofs] == relations,
        **{"prefix_" + name: value for name, value in prefix_checks.items()}}
    raw_checks = []
    for row in proofs[3:]:
        e = record(row.get("evidence")); relation = row.get("relation")
        try:
            if relation == "withdraw_balance":
                proof_id = e.get("id")
                if not isinstance(proof_id, str) or UUID.fullmatch(proof_id) is None:
                    raise ValueError("DEVICE_NATIVE_W39_RUN")
                stored = private_evidence(RUNTIME / "omnichain-product/evidence/paeg-proof-attempts" / (proof_id + ".json"))
                original = json.loads(stored)
                ok = hashlib.sha256(stored).hexdigest() == e.get("telemetrySHA256") and original.get("mode") == relation \
                    and original.get("phase") == "completed" and original.get("acceptedResult") is True \
                    and original.get("worker") == e.get("worker") and record(e.get("worker")).get("proofSHA256") == row.get("proofSHA256") \
                    and record(e.get("worker")).get("publicInputsSHA256") == row.get("publicInputsSHA256") \
                    and original.get("exit") == {"code": 0, "signal": None} and row.get("amountAtomic") == ("100" if DEVICE_RECOVERY and row is proofs[-1] else "400") \
                    and e.get("keySHA256") == note_keys.get("withdraw_balance")
            else:
                run_id = e.get("runId")
                if not isinstance(run_id, str) or UUID.fullmatch(run_id) is None:
                    raise ValueError("DEVICE_NATIVE_RUN")
                local = ".local/proof-workers-native-value-live-v2" if relation == "admission_native_value_v2" else ".local/proof-workers"
                path = FLAT / local / "attempts" / run_id
                m, w, r = (record(e.get(name)) for name in ("manifest", "result", "resources"))
                ok = all(hashlib.sha256(private_evidence(path / name)).hexdigest() == e.get(field) for name, field in (
                    ("proof-manifest.json", "manifestSHA256"), ("result.json", "resultSHA256"), ("resources.json", "resourcesSHA256"))) \
                    and hashlib.sha256(private_evidence(path / "proof.bin")).hexdigest() == row.get("proofSHA256") \
                    and hashlib.sha256(private_evidence(path / "public-inputs.json")).hexdigest() == row.get("publicInputsSHA256") \
                    and all(v.get("runId") == run_id and v.get("jobId") == e.get("jobId") and v.get("relation") == relation for v in (m, w, r)) \
                    and m.get("selfVerified") is True and w.get("selfVerified") is True and w.get("phase") == "completed" \
                    and r.get("phase") == "completed" and r.get("exitCode") == 0 and r.get("signal", "missing") is None \
                    and r.get("failure", "missing") is None and r.get("failures") == [] and r.get("lockPreserved") is False
                if relation == "admission_native_value_v2":
                    ok = ok and m.get("format") == "NV2_SCOPED_PUBLIC_PROOF_V1" and w.get("format") == "NV2_SCOPED_PROOF_RESULT_V1" \
                        and r.get("format") == "NV2_SCOPED_PROOF_RESOURCES_V1" and w.get("threads") == 1 and w.get("maximumPages") == 65536 \
                        and w.get("keyGenerated") is False and w.get("keyRecomputed") is False and w.get("backendDestroyed") is True \
                        and hashlib.sha256(private_evidence(path / "runtime-pins.json")).hexdigest() == e.get("runtimePinsSHA256") \
                        and all(v.get("runtimePinsSHA256") == e.get("runtimePinsSHA256") for v in (m, w, r)) \
                        and m.get("keySHA256") == e.get("keySHA256") and w.get("keySHA256") == e.get("keySHA256")
                else:
                    ok = ok and m.get("format") == "FLAT_WALLET_PUBLIC_PROOF_V1" and w.get("format") == "FLAT_WALLET_WORKER_ATTEMPT_V1" \
                        and r.get("format") == "FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1" and w.get("threads") == 4 \
                        and record(w.get("limits")).get("threads") == 4 and w.get("limits") == r.get("limits") \
                        and w.get("keyRecomputed") is False and all(v.get("runtimePinsSHA256") == w.get("runtimePinsSHA256") for v in (m, r)) \
                        and w.get("wasmThreadExecution") == {"threads": 4, "sharedMemory": True, "oneOwnedProcess": True, "originalPreparedKeyRequired": True}
            raw_checks.append(ok)
        except (OSError, ValueError, TypeError):
            raw_checks.append(False)
    checks["newOriginalReceiptsRawJoined"] = len(raw_checks) == (6 if DEVICE_RECOVERY else 9) and all(raw_checks)
    checks["distinctOriginalProofBytes"] = typed and len(proofs) == (9 if DEVICE_RECOVERY else 12) and len({row.get("proofSHA256") for row in proofs}) == (9 if DEVICE_RECOVERY else 12)
    return proofs, checks


def _reservation_backend_execution(relation, manifest, worker, resources, threads):
    """Public framing only; raw bytes/key/proof joins remain in the original reader.

    Historic WASM U12/S4 stays exact. Only U12 can use the fixed native backend,
    with the original Child.close, sampled identity and combined RSS receipt.
    """
    if "nativeBackendExecution" not in worker:
        return worker.get("wasmThreadExecution") == {"threads": threads, "sharedMemory": True,
            "oneOwnedProcess": True, "originalPreparedKeyRequired": True}
    native = record(worker.get("nativeBackendExecution"))
    fixed = {"profile": "LIANUM_ORIGINAL_U_NATIVE_UNIX_SOCKET_V1", "backend": "NativeUnixSocket", "threads": 12,
        "bbVersion": "5.2.0", "binarySHA256": "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b",
        "originalPreparedKeyRequired": True, "oneEphemeralJob": True, "memoryScope": "COORDINATOR_PLUS_NATIVE_CHILD",
        "rssLimitBytes": 3221225472, "outputByteAccounting": "RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND",
        "outputStreamsClosed": True, "socketClosed": True, "socketRemoved": True}
    limits = {"availableRAM": 2684354560, "freeDisk": 5368709120, "workerRSS": 3221225472,
        "sampleMilliseconds": 250, "phaseTimeoutMilliseconds": 600000, "killGraceMilliseconds": 5000,
        "outputBytes": 1048576, "jobBytes": 2097152, "threads": 12, "maximumDyadicGates": 2097152, "provingCRSPoints": 2097152}
    child, closed = record(native.get("childIdentity")), record(native.get("childClose"))
    output, peak = native.get("outputBytes"), resources.get("peakWorkerRSS")
    return relation == "authorization" and threads == 12 and worker.get("threads") == 12 \
        and "wasmThreadExecution" not in worker and set(native) == set(fixed) | {"childIdentity", "childClose", "outputBytes"} \
        and all((native.get(k) is v if type(v) is bool else native.get(k) == v) for k, v in fixed.items()) \
        and set(child) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"} \
        and all(type(child.get(k)) is int and child[k] > 1 for k in ("pid", "ppid", "pgrp", "session")) \
        and isinstance(child.get("startTimeTicks"), str) and re.fullmatch(r"[0-9]+", child["startTimeTicks"]) is not None \
        and set(closed) == {"code", "signal"} and ((type(closed.get("code")) is int and closed["code"] == 0 and closed.get("signal") is None) \
            or (closed.get("code") is None and closed.get("signal") == "SIGTERM")) \
        and type(output) is int and 0 <= output <= 1048576 and type(peak) is int and 0 <= peak <= 3221225472 \
        and json.dumps(resources.get("nativeBackendExecution"), sort_keys=True) == json.dumps(native, sort_keys=True) \
        and resources.get("nativeMemoryScope") == "COORDINATOR_PLUS_NATIVE_CHILD" and resources.get("nativeChildrenGone") is True \
        and isinstance(resources.get("nativeChildIdentities"), list) and any(all(record(v).get(k) == value for k, value in child.items()) \
            for v in resources["nativeChildIdentities"]) and worker.get("limits") == limits and resources.get("limits") == limits \
        and resources.get("lockPreserved") is False and resources.get("hostLimitsChanged") is False and worker.get("hostLimitsChanged") is False \
        and digest(worker.get("keyManifestSHA256")) and manifest.get("keyManifestSHA256") == worker["keyManifestSHA256"]


def reservation_proof_checks(rows, note_keys):
    typed = isinstance(rows, list) and all(isinstance(row, dict) and isinstance(row.get("evidence"), dict) for row in rows)
    proofs = rows if typed else []
    checks = {"proofRowsTyped": typed, "threeOriginalRelations": typed and len(proofs) == 3
        and [(r.get("relation"), r.get("publicWords")) for r in proofs] == [("deposit_balance", 26), ("authorization", 16), ("reservation", 58)]}
    # D26 retains its original one-proof reader. Its branch is selected only
    # for this check, with global mode restored even if inspection rejects.
    global DEVICE_RESERVATION
    previous = DEVICE_RESERVATION
    DEVICE_RESERVATION = False
    try:
        _, original = proof_checks(proofs[:1], note_keys, True)
    finally:
        DEVICE_RESERVATION = previous
    checks.update({"d26_" + name: value for name, value in original.items()})
    checks["threeDistinctOriginalProofBytes"] = typed and len(proofs) == 3 and len({r.get("proofSHA256") for r in proofs}) == 3
    flat_ok = []
    for row in proofs[1:]:
        e = record(row.get("evidence")); m, w, r = (record(e.get(name)) for name in ("manifest", "result", "resources"))
        relation = row.get("relation"); threads = 12 if relation == "authorization" else 4
        raw_join = False
        try:
            run_id = e.get("runId")
            if not isinstance(run_id, str) or UUID.fullmatch(run_id) is None:
                raise ValueError("DEVICE_US_PROOF_RUN")
            path = FLAT / ".local/proof-workers/attempts" / run_id
            raw_join = all(hashlib.sha256(private_evidence(path / name)).hexdigest() == e.get(field) for name, field in (
                ("proof-manifest.json", "manifestSHA256"), ("result.json", "resultSHA256"), ("resources.json", "resourcesSHA256")))
            raw_join = raw_join and hashlib.sha256(private_evidence(path / "proof.bin")).hexdigest() == row.get("proofSHA256") \
                and hashlib.sha256(private_evidence(path / "public-inputs.json")).hexdigest() == row.get("publicInputsSHA256")
        except (OSError, ValueError, TypeError):
            pass
        flat_ok.append(raw_join and m.get("format") == "FLAT_WALLET_PUBLIC_PROOF_V1"
            and w.get("format") == "FLAT_WALLET_WORKER_ATTEMPT_V1" and r.get("format") == "FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1"
            and all(v.get("runId") == e.get("runId") and v.get("jobId") == e.get("jobId") and v.get("relation") == relation for v in (m, w, r))
            and m.get("selfVerified") is True and w.get("selfVerified") is True
            and w.get("phase") == "completed" and r.get("phase") == "completed"
            and r.get("failure") is None and r.get("failures") == [] and r.get("exitCode") == 0 and r.get("signal", "missing") is None
            and w.get("threads") == threads and record(w.get("limits")).get("threads") == threads and w.get("limits") == r.get("limits")
            and _reservation_backend_execution(relation, m, w, r, threads)
            and all(v.get("runtimePinsSHA256") == w.get("runtimePinsSHA256") for v in (m, r)) and digest(w.get("runtimePinsSHA256"))
            and w.get("keyRecomputed") is False and w.get("keySHA256") == m.get("keySHA256")
            and e.get("keySHA256") == m.get("keySHA256") and digest(m.get("keySHA256"))
            and m.get("proofSHA256") == row.get("proofSHA256") and m.get("publicInputsSHA256") == row.get("publicInputsSHA256"))
    checks["twoCompletedOriginalUSReceipts"] = len(flat_ok) == 2 and all(flat_ok)
    return proofs, checks


def retain_summary(attempt, supervisor_pid, supervisor_code, captured_identity):
    if attempt.parent != DIRECTORY or attempt.resolve() != attempt or not attempt.is_dir():
        raise SystemExit("Paired original lab produced no single new original attempt")
    documents, original_bytes, read_failures = {}, {}, []
    for name in ("result", "resources", "source-pins"):
        try:
            value_bytes = private_evidence(attempt / (name + ".json"))
            value = json.loads(value_bytes)
            if not isinstance(value, dict):
                raise ValueError("EVIDENCE_OBJECT_REQUIRED")
            original_bytes[name] = value_bytes
            documents[name] = value
        except (OSError, ValueError, TypeError, RecursionError):
            read_failures.append(name)
            documents[name] = {}
    result, resources, sources = (documents[name] for name in ("result", "resources", "source-pins"))
    result_bytes = original_bytes.get("result", b"")
    resources_bytes = original_bytes.get("resources", b"")
    source_sha = hashlib.sha256(original_bytes["source-pins"]).hexdigest() if "source-pins" in original_bytes else None
    worker_result = record(resources.get("workerResult"))
    supervisor_identity, worker_identity = (record(resources.get(key)) for key in ("supervisorIdentity", "workerIdentity"))
    worker_pid = resources.get("workerPID")
    supervisor = {"supervisorPID": supervisor_pid, "workerPID": worker_pid}
    run_id = result.get("runId")
    receipt_checks = {
        "originalEvidenceRead": not read_failures, "cliNotInterrupted": not interrupted,
        "supervisorExitZero": type(supervisor_code) is int and supervisor_code == 0,
        "resultFormat": result.get("format") == RESULT_FORMAT,
        "resourcesFormat": resources.get("format") == RESOURCES_FORMAT,
        "runIdentity": isinstance(run_id, str) and UUID.fullmatch(run_id) is not None and attempt.name == "attempt-" + run_id
            and resources.get("runId") == run_id and worker_result.get("runId") == run_id,
        "supervisorIdentity": type(supervisor_pid) is int and supervisor_pid > 1 and resources.get("supervisorPID") == supervisor_pid
            and supervisor_identity.get("pid") == supervisor_pid and supervisor_identity.get("ppid") == os.getpid()
            and result.get("supervisor") == supervisor and worker_result.get("supervisor") == supervisor
            and isinstance(captured_identity, dict) and set(captured_identity) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"}
            and all(supervisor_identity.get(key) == value for key, value in captured_identity.items()),
        "workerIdentity": type(worker_pid) is int and worker_pid > 1 and worker_identity.get("pid") == worker_pid
            and worker_identity.get("ppid") == supervisor_pid and worker_identity.get("pgrp") == worker_pid
            and worker_identity.get("session") == worker_pid and resources.get("ownedProcessGroup") == worker_pid,
        "processBirthIdentities": all(isinstance(value.get("startTimeTicks"), str) and bool(re.fullmatch(r"[0-9]+", value["startTimeTicks"]))
            for value in (supervisor_identity, worker_identity)),
        "resultCompleted": result.get("phase") == "completed" and result.get("success") is True
            and result.get("deviceOwnerNativeRecoveryNodeAcceptance" if DEVICE_RECOVERY else "deviceOwnerNativeNodeAcceptance" if DEVICE_EXECUTION else "deviceOwnerUSNodeAcceptance" if DEVICE_RESERVATION else "deviceOwnerD26NodeAcceptance" if DEVICE_DEPOSIT else "pairedOriginalAccountNodeAcceptance") is True and result.get("interrupted") is False,
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
        "fixedPairedScope": result.get("profile") == PROFILE
            and result.get("nativeExecution", "missing") == ("ORIGINAL_DEVICE_NATIVE_EXECUTOR_V1" if DEVICE_EXECUTION else None)
            and result.get("nativeDeliveryCount") == (1 if DEVICE_EXECUTION else 0)
            and result.get("nativeGraphAcceptance") is DEVICE_EXECUTION
            and all(result.get(key) is False for key in SCOPE_FALSE if key != "nativeGraphAcceptance")
            and worker_result.get("deviceOwnerNativeRecoveryNodeAcceptance" if DEVICE_RECOVERY else "deviceOwnerNativeNodeAcceptance" if DEVICE_EXECUTION else "deviceOwnerUSNodeAcceptance" if DEVICE_RESERVATION else "deviceOwnerD26NodeAcceptance" if DEVICE_DEPOSIT else "pairedOriginalAccountNodeAcceptance") is True
            and all(worker_result.get(key) is False for key in ("mobileNoteCustodyEstablished", "tlsEstablished",
                "reactRendererEstablished", "physicalPhoneEstablished", "mobilePortfolioEstablished", "fullWalletAcceptance")),
        "originalCleanup": resources.get("resultAccepted") is True and resources.get("ownedGroupCleanupConfirmed") is True
            and resources.get("lockReleased") is True and resources.get("withinTotalDeadline") is True
            and all(record(value.get("cleanup")).get(key) is True for value in (result, worker_result) for key in ("closedEvm", "closedNativeEvm"))
            and record(result.get("cleanup")).get("errors") == [],
        "workerExitZero": all(resources.get(key) is True for key in ("workerSpawned", "workerExitObserved", "workerCloseObserved"))
            and all(type(record(resources.get(key)).get("code")) is int and record(resources.get(key)).get("code") == 0
                and "signal" in record(resources.get(key)) and record(resources[key])["signal"] is None for key in ("workerExit", "workerClose")),
    }
    proofs, proof_receipts = proof_checks(result.get("proofs"), record(record(result.get("artifacts")).get("noteKeys")), DEVICE_DEPOSIT)
    receipt_checks.update(proof_receipts)
    listeners = record(result.get("cleanup")).get("mobileListeners")
    receipt_checks["pairedListenersClosed"] = isinstance(listeners, list) and len(listeners) == (2 if DEVICE_RESERVATION else 1 if DEVICE_DEPOSIT else 2) and all(
        record(row).get("closed") is True and record(row).get("listenerClosed") is True
        and record(row).get("ownedSocketsRemaining") == 0 and record(row).get("originalDiagnosticsInFlight") == 0 for row in listeners)
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_DEVICE_OWNER_RECOVERY_LAB_V1" if DEVICE_RECOVERY else "LIANUM_DEVICE_OWNER_EXECUTION_LAB_V1" if DEVICE_EXECUTION else "LIANUM_DEVICE_OWNER_RESERVATION_LAB_V1" if DEVICE_RESERVATION else "LIANUM_DEVICE_OWNER_DEPOSIT_LAB_V1" if DEVICE_DEPOSIT else "LIANUM_PAIRED_ORIGINAL_ACCOUNT_LAB_V2", "accepted": accepted, "runId": run_id,
        "attempt": str(attempt.relative_to(ROOT)), "receiptChecks": receipt_checks, "supervisorExitCode": supervisor_code,
        "evidenceReadFailures": read_failures, "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
        ("deviceOwnerNativeRecoveryNodeAcceptance" if DEVICE_RECOVERY else "deviceOwnerNativeNodeAcceptance" if DEVICE_EXECUTION else "deviceOwnerUSNodeAcceptance" if DEVICE_RESERVATION else "deviceOwnerD26NodeAcceptance" if DEVICE_DEPOSIT else "pairedOriginalAccountNodeAcceptance"): accepted, "realProofCount": len(proofs) if proof_receipts["proofRowsTyped"] else None,
        "proofHashes": [{key: row.get(key) for key in ("relation", "proofSHA256", "publicInputsSHA256")} for row in proofs],
        "resultSHA256": hashlib.sha256(result_bytes).hexdigest() if "result" in original_bytes else None,
        "resourcesSHA256": hashlib.sha256(resources_bytes).hexdigest() if "resources" in original_bytes else None,
        "sourcePinsSHA256": source_sha, "failure": resources.get("failure"), "workerFailure": result.get("errorCode"),
        "ownedGroupCleanupConfirmed": resources.get("ownedGroupCleanupConfirmed"), "resourceSummary": resources.get("resourceSummary"),
        "economics": result.get("economics"), **{key: False for key in SCOPE_FALSE},
        "nativeGraphAcceptance": accepted if DEVICE_EXECUTION else False,
        "limitations": ["Two original local EVM notes with fake funds and Linux original owner custody only.",
            "Node runs the exact mobile V2 API, lease, protocol and Noble signatures through an explicit paired loopback translation.",
            "This establishes neither TLS, React/device execution, biometric signing, private portfolio nor note custody on a phone.",
            "Only the original owner child restarts; keeper/backend/node loss recovery, native graph delivery and public finality are excluded."]}
    if DEVICE_DEPOSIT:
        summary["limitations"] = ["One genuine D26 and one synthetic funding wire to a client-owned opening, never adopted by the Linux owner.",
            "Actual exact-origin loopback TLS1.3 and real mobile API/Noble signatures in Node; no phone, Hermes, SecureStore or biometric execution.",
            "PROVE HTTP504 and deliberately lost FUND reply do not retry the original job or signed wire; explicit OBSERVE authenticates the same ledger inclusion.",
            "No graph/reservation/EXIT, portable vault persistence or full mobile economic custody acceptance."]
    if DEVICE_RESERVATION:
        summary["limitations"] = ["Original client-owned D26/U/S on synthetic local EVM; one funding and one reservation, no native delivery or EXIT.",
            "Exact mobile vault/codec/API run in Node with real AES-GCM/RNG and private ciphertext files; Expo SecureStore/biometrics/Hermes/phone remain untested.",
            "Same encrypted device note/output custody is retained before U and S. HTTP loss waits the original admitted work; no reproof/send retry.",
            "Linux owner note remains UNISSUED/available0. Recovery100 is a prospective subset of reserve100, not another funded balance."]
    if DEVICE_EXECUTION:
        summary["limitations"] = ["Same original device D26/U/S and one EVM native delivery, I84/N4/T then change W39; synthetic local funds only.",
            "Exact mobile API/codec/vault execute in Node with original AES-GCM/RNG and ciphertext readback; no physical SecureStore/Hermes/biometrics/phone.",
            "Separate execute/exit consents and retained single jobs/wires survive HTTP loss; same encrypted openings and terminal receipts reopen without adoption by Linux.",
            "Solver payout100 remains backed; no payout EXIT, actual F recovery, full process restart, public chain, Cloud or independent mobile RPC acceptance."]
    if DEVICE_RECOVERY:
        summary["limitations"] = ["Same original device D26/U/S, one admitted EVM native delivery, fixed stop before N0, cutoff/F41, change400+recovery100 W39s.",
            "Recovery100 is part of reserved100 and total original owner refund500; provider bears delivered native1M plus actual gas, with no T/payout.",
            "Exact encrypted mobile vault/API runs in Node; no physical SecureStore/Hermes/biometrics/phone or independent mobile canonical RPC.",
            "Original jobs/wires stay latched after HTTP loss; no owner-offline/full restart/public-chain/Cloud acceptance."]
    path = DEV / ("reports/device-owner-recovery-lab-v1.json" if DEVICE_RECOVERY else "reports/device-owner-execution-lab-v1.json" if DEVICE_EXECUTION else "reports/device-owner-reservation-lab-v1.json" if DEVICE_RESERVATION else "reports/device-owner-deposit-lab-v1.json" if DEVICE_DEPOSIT else "reports/paired-original-account-lab-v2.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600); temporary.replace(path)
    print(json.dumps({"summary": str(path.relative_to(ROOT)), "accepted": accepted, "runId": run_id,
        "realProofCount": summary["realProofCount"]}), flush=True)
    if not accepted:
        raise SystemExit("Paired original lab evidence rejected; original reports preserved")


def main():
    global active, active_identity, active_pidfd, DEVICE_DEPOSIT, DEVICE_RESERVATION, DEVICE_EXECUTION, DEVICE_RECOVERY, ENTRY, DIRECTORY, PROFILE, RESULT_FORMAT, RESOURCES_FORMAT
    if sys.argv[1:] not in ([], ["--device-deposit"], ["--device-reservation"], ["--device-execution"], ["--device-recovery"]):
        raise SystemExit("Usage: python3 -B scripts/development/paired_original_account_lab.py [--device-deposit|--device-reservation|--device-execution|--device-recovery]")
    if sys.argv[1:] == ["--device-recovery"]:
        DEVICE_DEPOSIT = DEVICE_RESERVATION = DEVICE_EXECUTION = DEVICE_RECOVERY = True
        ENTRY = FLAT / "integration/run-device-owner-recovery-v1.mjs"
        DIRECTORY = FLAT / ".local/device-owner-recovery-v1"
        PROFILE = "device-owner-recovery-v1"
        RESULT_FORMAT = "LIANUM_DEVICE_OWNER_RECOVERY_RESULT_V1"
        RESOURCES_FORMAT = "LIANUM_DEVICE_OWNER_RECOVERY_RESOURCES_V1"
    elif sys.argv[1:] == ["--device-execution"]:
        DEVICE_DEPOSIT = DEVICE_RESERVATION = DEVICE_EXECUTION = True
        ENTRY = FLAT / "integration/run-device-owner-execution-v1.mjs"
        DIRECTORY = FLAT / ".local/device-owner-execution-v1"
        PROFILE = "device-owner-execution-v1"
        RESULT_FORMAT = "LIANUM_DEVICE_OWNER_EXECUTION_RESULT_V1"
        RESOURCES_FORMAT = "LIANUM_DEVICE_OWNER_EXECUTION_RESOURCES_V1"
    elif sys.argv[1:] == ["--device-reservation"]:
        DEVICE_DEPOSIT = DEVICE_RESERVATION = True
        ENTRY = FLAT / "integration/run-device-owner-reservation-v1.mjs"
        DIRECTORY = FLAT / ".local/device-owner-reservation-v1"
        PROFILE = "device-owner-reservation-v1"
        RESULT_FORMAT = "LIANUM_DEVICE_OWNER_RESERVATION_RESULT_V1"
        RESOURCES_FORMAT = "LIANUM_DEVICE_OWNER_RESERVATION_RESOURCES_V1"
    elif sys.argv[1:] == ["--device-deposit"]:
        DEVICE_DEPOSIT = True
        ENTRY = FLAT / "integration/run-device-owner-deposit-v1.mjs"
        DIRECTORY = FLAT / ".local/device-owner-deposit-v1"
        PROFILE = "device-owner-deposit-v1"
        RESULT_FORMAT = "LIANUM_DEVICE_OWNER_DEPOSIT_RESULT_V1"
        RESOURCES_FORMAT = "LIANUM_DEVICE_OWNER_DEPOSIT_RESOURCES_V1"
    if sys.platform != "linux" or Path.cwd().resolve() != ROOT:
        raise SystemExit("Run the fixed paired original lab from the project root in Linux/WSL")
    if Path(__file__).resolve() != ROOT / "scripts/development/paired_original_account_lab.py" or Path(sys.argv[0]).resolve() != Path(__file__).resolve():
        raise SystemExit("Fixed canonical paired original launcher required")
    build(quiet=True)
    DEV.mkdir(parents=True, exist_ok=True)
    fd = os.open(DEV / "paired-original-account-lab-v2.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another paired original lab is active")
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, forward_signal)
        info = os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise SystemExit("Private original launcher lock required")
        lock.seek(0)
        if lock.read(16 * 1024 + 1).strip():
            raise SystemExit("Original launcher admission retained; closure must be audited before relaunch")
        attempt, supervisor_pid, code, captured_identity = _run_original_supervisor(lock)
        retain_summary(attempt, supervisor_pid, code, captured_identity)
        if code or interrupted:
            raise SystemExit(code if code > 0 else 2)


if __name__ == "__main__":
    main()
