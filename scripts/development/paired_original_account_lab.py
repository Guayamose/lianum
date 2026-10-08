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
NATIVE_ECONOMIC_RECOVERY = False


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


def _public_equal(left, right):
    # Exact JSON value equality, including boolean/integer distinctions. No raw
    # receipt is normalized, rewritten or used to grant a proving capability.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


_EXECUTION_SETTINGS = {"ipaAccumulation": False, "oracleHashType": "keccak", "disableZk": False, "optimizedSolidityVerifier": False}
_EXECUTION_LIMITS = {"availableRAM": 2684354560, "freeDisk": 5368709120, "workerRSS": 3221225472,
    "sampleMilliseconds": 250, "phaseTimeoutMilliseconds": 600000, "killGraceMilliseconds": 5000,
    "outputBytes": 1048576, "jobBytes": 2097152, "threads": 1, "maximumDyadicGates": 2097152, "provingCRSPoints": 2097152}
_I84_ORIGINAL = {
    "sourceVersion": "4a6503d4b139e20e4d672ca39eb5d5f1f75497555ba6d55a7d6c424dcbb5d92e",
    "keySHA256": "c343da4850c47cc443dd017676661fd71b9864b792b3702ef6af8f2d53609d5e",
    "keyManifestSHA256": "36c4e838f8cdc9f7483b16057bb754f54990d9aba5ffc0ca9c90e06dee510414",
    "compiledManifestSHA256": "f5be21e21c153d8167b90f78cd6b546813014d7d66a20f70925fa2192140e155",
    "artifactSHA256": "fa23b3b8867c0418834d3acd4eb70cf10aca558434fe0a19c84f59d05e5b614c",
    "bytecodeSHA256": "cdfa8e3f470b002b9833c12cbd2821752b32d95f75dea131cfbb92f3ccaf4d0e"}
_NODE_ORIGINAL = {
    "keySHA256": "7db1eb6975fad4fda0ebac6b7e9ad3861604f4eb8d1231b9c2ff8ccf661d5fe4",
    "keyManifestSHA256": "95a561fdf1c92187407daede21b490673f572ddf5ca0337c4cf00606bef20b96",
    "compiledManifestSHA256": "29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004",
    "artifactSHA256": "6c2d09943e6b138bb67b8133f33331adf08263dc12210b2d1a62d78c56fce38e",
    "bytecodeSHA256": "9e4f613e46a682115b18b268cb637f9b6d1ca2eea03e9a0acc6068dcd2c6d29f"}
_RESERVATION_ORIGINAL = {
    "sourceVersion": "09a08d3a8febd2ab844ca216551b25763df8c2bc213061672a46ec161db37a22",
    "compiledManifestSHA256": "2c508f3e2bc4b38887dbad32a58d0f310185fbd32b95cfeb4110fef4e7147069",
    "artifactSHA256": "3ba226da2769a0233dc3659b224a7f116a0a97f212f1799f9bbb2cd4bded8452",
    "bytecodeSHA256": "47de269e665b33fb98ad85a94f6aff633c1c62203481ff76a589b7ebf4402094",
    "keyManifestSHA256": "f637c6289251a9010c208827b3dcafbfca286d7ab30e7d9dca2047cf4d9d56b7",
    "keySHA256": "6107377c4a6ce98767c2de4d71a661d09aa56279cfb6d8778d76eca6ef27ea32"}
_EXECUTION_GRAPH = {"reservation": ("reservation", 58), "dependency": ("dependency", 42), "ready": ("local", 50), "node": ("local", 32),
    "settlement": ("assembler", 138), "recovery": ("recovery", 41)}


def _execution_backend_receipt(relation, manifest, worker, resources):
    """Strict public framing of I84/N/S Native12; never reuse the U profile."""
    native = worker.get("nativeBackendExecution")
    if native is None:
        if "nativeBackendExecution" in worker:
            return False
        if relation == "admission_native_value_v2":
            return type(worker.get("threads")) is int and worker["threads"] == 1 and worker.get("maximumPages") == 65536 \
                and manifest.get("maximumPages") == 65536 and "independentVerification" not in worker \
                and "wasmThreadExecution" not in worker and _public_equal(worker.get("limits"), _EXECUTION_LIMITS) \
                and _public_equal(resources.get("limits"), _EXECUTION_LIMITS)
        threads = worker.get("threads")
        if type(threads) is not int or threads not in ((1, 4) if relation == "node" else (4,)):
            return False
        pages = 32768 if relation == "node" or worker.get("mode") == "prove" else 65536
        return worker.get("maximumPages") == pages and "independentVerification" not in worker \
            and _public_equal(worker.get("limits"), {**_EXECUTION_LIMITS, "threads": threads}) \
            and _public_equal(resources.get("limits"), worker.get("limits")) \
            and ("wasmThreadExecution" not in worker if threads == 1 else _public_equal(worker.get("wasmThreadExecution"), {
                "threads": 4, "sharedMemory": True, "oneOwnedProcess": True, "originalPreparedKeyRequired": True}))
    if relation not in ("admission_native_value_v2", "node", "reservation") or not isinstance(native, dict):
        return False
    i84 = relation == "admission_native_value_v2"
    pages = 65536 if i84 else 32768
    fixed = {"profile": "LIANUM_ORIGINAL_I84_V5_NATIVE_UNIX_SOCKET_V1" if i84 else "LIANUM_ORIGINAL_S_NATIVE_UNIX_SOCKET_V1" if relation == "reservation" else "LIANUM_ORIGINAL_N_NATIVE_UNIX_SOCKET_V1",
        "backend": "NativeUnixSocket", "threads": 12, "bbVersion": "5.2.0",
        "binarySHA256": "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b",
        "originalPreparedKeyRequired": True, "oneEphemeralJob": True, "memoryScope": "COORDINATOR_PLUS_NATIVE_CHILD",
        "rssLimitBytes": 3221225472, "outputByteAccounting": "RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND",
        "outputStreamsClosed": True, "socketClosed": True, "socketRemoved": True}
    child, closed = record(native.get("childIdentity")), record(native.get("childClose"))
    verification = {"backend": "Wasm", "threads": 1, "maximumPages": pages,
        "originalPreparedKeyRequired": True, "verifierCRSOnly": True, "backendDestroyed": True}
    if not i84:
        verification["nativeProducerClosedBeforeVerification"] = True
    peak, output = resources.get("peakWorkerRSS"), native.get("outputBytes")
    return set(native) == set(fixed) | {"childIdentity", "childClose", "outputBytes"} \
        and _public_equal({key: native.get(key) for key in fixed}, fixed) \
        and set(child) == {"pid", "ppid", "pgrp", "session", "startTimeTicks"} | ({"uid"} if i84 else set()) \
        and all(type(child.get(key)) is int and 1 < child[key] <= 9007199254740991 for key in ("pid", "ppid", "pgrp", "session")) \
        and isinstance(child.get("startTimeTicks"), str) and re.fullmatch(r"[0-9]+", child["startTimeTicks"]) is not None \
        and (not i84 or type(child.get("uid")) is int and child["uid"] == os.getuid()) \
        and set(closed) == {"code", "signal"} and (_public_equal(closed, {"code": 0, "signal": None}) \
            or _public_equal(closed, {"code": None, "signal": "SIGTERM"})) \
        and type(output) is int and 0 <= output <= 1048576 and type(peak) is int and 0 <= peak <= 3221225472 \
        and _public_equal(resources.get("nativeBackendExecution"), native) \
        and resources.get("nativeMemoryScope") == "COORDINATOR_PLUS_NATIVE_CHILD" and resources.get("nativeChildrenGone") is True \
        and isinstance(resources.get("nativeChildIdentities"), list) and any(_public_equal({key: record(value).get(key) for key in child}, child)
            for value in resources["nativeChildIdentities"]) \
        and type(worker.get("threads")) is int and worker["threads"] == 12 \
        and "maximumPages" in worker and worker["maximumPages"] is None and worker.get("preparedMaximumPages") == pages \
        and "wasmThreadExecution" not in worker and _public_equal(worker.get("independentVerification"), verification) \
        and _public_equal(worker.get("limits"), {**_EXECUTION_LIMITS, "threads": 12}) \
        and _public_equal(resources.get("limits"), worker.get("limits")) \
        and worker.get("hostLimitsChanged") is False and resources.get("hostLimitsChanged") is False \
        and (not i84 or manifest.get("maximumPages", "missing") is None and manifest.get("preparedMaximumPages") == 65536
            and type(manifest.get("threads")) is int and manifest["threads"] == 12 and manifest.get("executionBackend") == "NativeUnixSocket")


def _execution_raw_proof_receipt(row):
    """Reread the original fixed attempt; hashes and retained JSON must both join."""
    e, relation = record(row.get("evidence")), row.get("relation")
    run_id, job_id = e.get("runId"), e.get("jobId")
    if not all(isinstance(value, str) and UUID.fullmatch(value) is not None for value in (run_id, job_id)):
        return False
    m, w, r = (record(e.get(name)) for name in ("manifest", "result", "resources"))
    if relation == "admission_native_value_v2":
        local = (".local/proof-workers-native-value-dev-live-v5",) if "nativeBackendExecution" in w else (
            ".local/proof-workers-native-value-dev-live-v5", ".local/proof-workers-native-value-live-v2")
        paths = []
        for directory in local:
            candidate = FLAT / directory / "attempts" / run_id
            try:
                private_evidence(candidate / "proof-manifest.json")
                paths.append(candidate)
            except FileNotFoundError:
                pass  # Exact absence only; unreadable/unsafe originals reject.
        if len(paths) != 1:
            return False
        path = paths[0]
    else:
        path = FLAT / ".local/proof-workers/attempts" / run_id
    for name, field, retained in (("proof-manifest.json", "manifestSHA256", m), ("result.json", "resultSHA256", w), ("resources.json", "resourcesSHA256", r)):
        raw = private_evidence(path / name)
        if hashlib.sha256(raw).hexdigest() != e.get(field) or not _public_equal(json.loads(raw), retained):
            return False
    proof, inputs, pins = (private_evidence(path / name) for name in ("proof.bin", "public-inputs.json", "runtime-pins.json"))
    proof_sha, inputs_sha, pins_sha = (hashlib.sha256(raw).hexdigest() for raw in (proof, inputs, pins))
    if not (0 < len(proof) <= 1048576 and len(proof) % 32 == 0 and m.get("proofBytes") == len(proof)
        and proof_sha == row.get("proofSHA256") == m.get("proofSHA256") == w.get("proofSHA256")
        and inputs_sha == row.get("publicInputsSHA256") == m.get("publicInputsSHA256")
        and all(v.get("runtimePinsSHA256") == pins_sha for v in (m, w, r))
        and (relation != "admission_native_value_v2" or e.get("runtimePinsSHA256") == pins_sha)
        and all(v.get("runId") == run_id and v.get("jobId") == job_id and v.get("relation") == relation for v in (m, w, r))
        and m.get("selfVerified") is True and w.get("selfVerified") is True and w.get("phase") == "completed"
        and r.get("phase") == "completed" and type(r.get("exitCode")) is int and r["exitCode"] == 0 and r.get("signal", "missing") is None
        and r.get("failure", "missing") is None and r.get("failures") == [] and r.get("lockPreserved") is False
        and w.get("keyRecomputed") is False and w.get("proofGenerated") is True
        and w.get("hostLimitsChanged") is False and r.get("hostLimitsChanged") is False
        and all(field not in w for field in ("errorCode", "cleanupErrorCode", "finalPinErrorCode"))
        and _public_equal(m.get("settings"), _EXECUTION_SETTINGS) and _public_equal(w.get("settings"), _EXECUTION_SETTINGS)
        and _execution_backend_receipt(relation, m, w, r)):
        return False
    if relation == "admission_native_value_v2":
        return m.get("format") == "NV2_SCOPED_PUBLIC_PROOF_V1" and w.get("format") == "NV2_SCOPED_PROOF_RESULT_V1" \
            and r.get("format") == "NV2_SCOPED_PROOF_RESOURCES_V1" \
            and all(v.get("profile") == "LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2" for v in (m, w, r)) \
            and all(v.get("mode") == "prove-dyadic21" for v in (w, r)) and m.get("role") == w.get("role") == "local" \
            and (m.get("publicWords"), m.get("backendPublicWords"), m.get("publicInputOffset")) == (84, 92, 5) \
            and row.get("publicWords") == 84 and isinstance(json.loads(inputs), list) and len(json.loads(inputs)) == 84 \
            and all(m.get(key) == value for key, value in _I84_ORIGINAL.items()) \
            and all(w.get(key) == _I84_ORIGINAL[key] for key in ("sourceVersion", "keySHA256", "keyManifestSHA256")) \
            and e.get("keySHA256") == _I84_ORIGINAL["keySHA256"] and e.get("programSHA256") == _I84_ORIGINAL["artifactSHA256"] \
            and w.get("keyGenerated") is False and w.get("backendDestroyed") is True and w.get("witnessPersisted") is False
    if relation not in _EXECUTION_GRAPH:
        return False
    role, words = _EXECUTION_GRAPH[relation]
    return m.get("format") == "FLAT_WALLET_PUBLIC_PROOF_V1" and w.get("format") == "FLAT_WALLET_WORKER_ATTEMPT_V1" \
        and r.get("format") == "FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1" \
        and all(v.get("profile") == "LIANUM_PAEG_P2_V1" for v in (m, w, r)) \
        and w.get("mode") in ("prove", "prove-dyadic21") and r.get("mode") == w.get("mode") \
        and m.get("role") == w.get("role") == role and m.get("publicWords") == w.get("publicWords") == row.get("publicWords") == words \
        and isinstance(json.loads(inputs), list) and len(json.loads(inputs)) == words \
        and m.get("target") == w.get("target") == "evm" and w.get("publicInputsSHA256") == inputs_sha \
        and m.get("keySHA256") == w.get("keySHA256") == e.get("keySHA256") and digest(m.get("keySHA256")) \
        and m.get("keyManifestSHA256") == w.get("keyManifestSHA256") and digest(m.get("keyManifestSHA256")) \
        and m.get("sourceVersion") == w.get("sourceVersion") and digest(m.get("sourceVersion")) \
        and (relation != "node" or all(m.get(key) == value and w.get(key) == value for key, value in _NODE_ORIGINAL.items())) \
        and (relation != "reservation" or all(m.get(key) == value and w.get(key) == value for key, value in _RESERVATION_ORIGINAL.items()))


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
                ok = _execution_raw_proof_receipt(row)
            raw_checks.append(ok)
        except (OSError, ValueError, TypeError, RecursionError):
            raw_checks.append(False)
    checks["newOriginalReceiptsRawJoined"] = len(raw_checks) == (6 if DEVICE_RECOVERY else 9) and all(raw_checks)
    checks["distinctOriginalProofBytes"] = typed and len(proofs) == (9 if DEVICE_RECOVERY else 12) and len({row.get("proofSHA256") for row in proofs}) == (9 if DEVICE_RECOVERY else 12)
    return proofs, checks


def _reservation_backend_execution(relation, manifest, worker, resources, threads):
    """Public framing only; raw bytes/key/proof joins remain in the original reader.

    Historic WASM U12/S4 stays exact. Native S12 requires its separate fixed
    lineage and independent verifier after actual producer closure; U retains
    its original profile and verifier strategy.
    """
    if relation == "reservation" and threads == 12:
        return all(worker.get(key) == value and manifest.get(key) == value for key, value in _RESERVATION_ORIGINAL.items()) \
            and _execution_backend_receipt(relation, manifest, worker, resources)
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
        relation = row.get("relation"); threads = 12 if relation == "authorization" or relation == "reservation" and w.get("threads") == 12 else 4
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
        if relation == "reservation" and threads == 12:
            try:
                raw_join = raw_join and _execution_raw_proof_receipt(row)
            except (OSError, ValueError, TypeError):
                raw_join = False
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
            and all(result.get(key) is False for key in SCOPE_FALSE if key != "nativeGraphAcceptance" and (not NATIVE_ECONOMIC_RECOVERY or key != "nativeProcessRestartEstablished"))
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
    if NATIVE_ECONOMIC_RECOVERY:
        restart = record(result.get("deviceEconomicRestart"))
        successor = record(record(result.get("cleanup")).get("successor"))
        original = record(restart.get("originalProcess"))
        new = record(restart.get("successorProcess"))
        receipt_checks["plannedOriginalEconomicRestart"] = result.get("nativeDeviceEconomicRestartNodeAcceptance") is True \
            and result.get("nativeProcessRestartEstablished") is True and result.get("keeperLossRecoveryEstablished") is False \
            and restart.get("originalSectionsStoppedBeforeReopen") is True and restart.get("parentDeviceVaultRetained") is True \
            and restart.get("abruptCrashRecoveryEstablished") is False and restart.get("parentProcessExitEstablished") is False \
            and type(new.get("pid")) is int and new.get("pid") != original.get("pid") and new.get("ppid") == original.get("pid") \
            and restart.get("originalProofsBeforeRestart") == 7 and restart.get("originalProofsAfterRestart") == 9 \
            and successor.get("originalBackendStopped") is True and successor.get("originalChildProcessClosed") is True \
            and successor.get("processId") == new.get("pid") and successor.get("exit") == {"code": 0, "signal": None} \
            and successor.get("close") == {"code": 0, "signal": None} \
            and worker_result.get("nativeDeviceEconomicRestartNodeAcceptance") is True \
            and worker_result.get("nativeProcessRestartEstablished") is True
    accepted = all(receipt_checks.values())
    summary = {"format": "LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_LAB_V1" if NATIVE_ECONOMIC_RECOVERY else "LIANUM_DEVICE_OWNER_RECOVERY_LAB_V1" if DEVICE_RECOVERY else "LIANUM_DEVICE_OWNER_EXECUTION_LAB_V1" if DEVICE_EXECUTION else "LIANUM_DEVICE_OWNER_RESERVATION_LAB_V1" if DEVICE_RESERVATION else "LIANUM_DEVICE_OWNER_DEPOSIT_LAB_V1" if DEVICE_DEPOSIT else "LIANUM_PAIRED_ORIGINAL_ACCOUNT_LAB_V2", "accepted": accepted, "runId": run_id,
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
    if NATIVE_ECONOMIC_RECOVERY:
        summary["nativeDeviceEconomicRestartNodeAcceptance"] = accepted
        summary["nativeProcessRestartEstablished"] = accepted
        summary["plannedCaptureOnly"] = True
        summary["deviceEconomicRestart"] = result.get("deviceEconomicRestart")
        summary["limitations"] = ["Planned authenticated complete native economic capture after canonical F and lost mobile reply, before terminal apply/read/W39.",
            "Original backend sections stopped before one-use reopen in a new causal PID; parent process survives with the same mobile vault and signing key.",
            "Fresh signed reconciliation and both W39s use the same funded note/openings/S/F; no old proof or delivery is replayed.",
            "Recoverable AEAD/runtime state is retained. Abrupt-crash recovery, physical SecureStore/Hermes/biometrics/phone, public chains and Cloud are unaccepted."]
    path = DEV / ("reports/native-device-economic-recovery-lab-v1.json" if NATIVE_ECONOMIC_RECOVERY else "reports/device-owner-recovery-lab-v1.json" if DEVICE_RECOVERY else "reports/device-owner-execution-lab-v1.json" if DEVICE_EXECUTION else "reports/device-owner-reservation-lab-v1.json" if DEVICE_RESERVATION else "reports/device-owner-deposit-lab-v1.json" if DEVICE_DEPOSIT else "reports/paired-original-account-lab-v2.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=2) + "\n")
    temporary.chmod(0o600); temporary.replace(path)
    print(json.dumps({"summary": str(path.relative_to(ROOT)), "accepted": accepted, "runId": run_id,
        "realProofCount": summary["realProofCount"]}), flush=True)
    if not accepted:
        raise SystemExit("Paired original lab evidence rejected; original reports preserved")


def main():
    global active, active_identity, active_pidfd, DEVICE_DEPOSIT, DEVICE_RESERVATION, DEVICE_EXECUTION, DEVICE_RECOVERY, NATIVE_ECONOMIC_RECOVERY, ENTRY, DIRECTORY, PROFILE, RESULT_FORMAT, RESOURCES_FORMAT
    if sys.argv[1:] not in ([], ["--device-deposit"], ["--device-reservation"], ["--device-execution"], ["--device-recovery"], ["--native-economic-recovery"]):
        raise SystemExit("Usage: python3 -B scripts/development/paired_original_account_lab.py [--device-deposit|--device-reservation|--device-execution|--device-recovery|--native-economic-recovery]")
    if sys.argv[1:] == ["--native-economic-recovery"]:
        DEVICE_DEPOSIT = DEVICE_RESERVATION = DEVICE_EXECUTION = DEVICE_RECOVERY = NATIVE_ECONOMIC_RECOVERY = True
        ENTRY = FLAT / "integration/run-native-value-economic-recovery-v1.mjs"
        DIRECTORY = FLAT / ".local/native-value-economic-recovery-v1"
        PROFILE = "native-value-economic-recovery-v1"
        RESULT_FORMAT = "LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_RESULT_V1"
        RESOURCES_FORMAT = "LIANUM_NATIVE_DEVICE_ECONOMIC_RECOVERY_RESOURCES_V1"
    elif sys.argv[1:] == ["--device-recovery"]:
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
