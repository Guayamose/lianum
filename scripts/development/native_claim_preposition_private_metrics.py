"""Read-only, fixed-attempt projection of private original SPL timing DATA.

No RPC, journal/keeper, proof, signer, clock, retry or authority is opened.
The returned numeric diagnostics are not currentness or financial evidence.
"""
import json
import math
import os
from pathlib import Path
import re
import stat
import sys

from workspace import RUNTIME

_FILE = "claim-preposition-private-metrics-v1.json"
_MAX_BYTES = 1048576
_MAX_VALUE = 3600000000
_PROFILE = RUNTIME / "omnichain-flat-profile/flat-wallet/.local/development-btc-spl-jupiter-v1"
_PHASES = {"serial", "read-vault", "durable-save", "read-current-view", "current", "joint-current", "v4-round", "v4-facts-round"}
_METHODS = {"operation", "begin-payout", "redeem", "reserve-payout", "debt-health", "presign-payout", "payout-broadcast"}
_ROUNDS = {"whole-operation", "initial-preparation", "original-validation", "existing-authorization", "pre-key", "persisted-return"}
_REPORT_KEYS = {"schema", "operationOrdinal", "wallMilliseconds", "processUserMicroseconds", "processSystemMicroseconds", "cpuScope", "wallScope", "wholeOperationScope", "finalizationScope", "postFenceSamplingAndRetirementNotBudgeted", "nonCustodyObserverSeparatePhaseNotMeasured", "incomplete", "truncated", "peakActiveIntervals", "rpcCounts", "keyUsageMeasured", "labels"}
_LABEL_KEYS = {"phase", "method", "round", "invocations", "measuredIntervals", "wallMilliseconds", "maximumWallMilliseconds", "processUserMicroseconds", "processSystemMicroseconds"}
_REPORT_CONSTANTS = {"schema": "CLAIM_PRIVATE_OPERATION_METRICS_V1", "cpuScope": "PROCESS_INTERVAL_INCLUDES_SIBLING_WORK", "wallScope": "NESTED_INTERVALS_OVERLAP", "wholeOperationScope": "TO_LAST_METRICS_SAMPLE_NOT_TERMINAL_AUTHORITY", "finalizationScope": "CLEANUP_TO_LAST_SAMPLE_PARTIALLY_MEASURED", "postFenceSamplingAndRetirementNotBudgeted": True, "nonCustodyObserverSeparatePhaseNotMeasured": True, "rpcCounts": None, "keyUsageMeasured": False}


class PrivateMetricsRejected(Exception):
    pass


def _require(condition):
    if not condition:
        raise PrivateMetricsRejected("NATIVE_CLAIM_PRIVATE_METRICS_REJECTED")


def _exact(value, keys):
    _require(type(value) is dict and set(value) == set(keys))


def _number(value, integer=False, maximum=_MAX_VALUE):
    _require(type(value) in (int, float) and 0 <= value <= maximum and math.isfinite(value))
    if integer:
        _require(type(value) is int)
    return value


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        _require(key not in result)
        result[key] = value
    return result


def _identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_uid, value.st_gid, value.st_nlink, value.st_size, value.st_mtime_ns, value.st_ctime_ns)


def _directory(value):
    _require(stat.S_ISDIR(value.st_mode) and stat.S_IMODE(value.st_mode) == 0o700 and value.st_uid == os.getuid())


def _read_physical_metrics(attempt):
    # Private test seam only. The public entry below supplies the fixed path.
    _require(attempt.resolve(strict=True) == attempt.absolute())
    directories = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptors = []
    try:
        attempt_fd = os.open(attempt, directories); descriptors.append(attempt_fd)
        attempt_before = os.fstat(attempt_fd); _directory(attempt_before)
        audit_fd = os.open("private-audit", directories, dir_fd=attempt_fd); descriptors.append(audit_fd)
        audit_before = os.fstat(audit_fd); _directory(audit_before)
        _require((attempt / "private-audit").resolve(strict=True) == attempt / "private-audit")
        fd = os.open(_FILE, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=audit_fd); descriptors.append(fd)
        before = os.fstat(fd)
        _require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode) == 0o600 and before.st_uid == os.getuid() and before.st_nlink == 1 and 0 < before.st_size <= _MAX_BYTES)
        _require(_identity(os.stat(_FILE, dir_fd=audit_fd, follow_symlinks=False)) == _identity(before))
        chunks = []; remaining = before.st_size
        while remaining:
            chunk = os.read(fd, remaining); _require(bool(chunk))
            chunks.append(chunk); remaining -= len(chunk)
        _require(os.read(fd, 1) == b"")
        _require(_identity(os.fstat(fd)) == _identity(before))
        _require(_identity(os.stat(_FILE, dir_fd=audit_fd, follow_symlinks=False)) == _identity(before))
        _require(_identity(os.fstat(audit_fd)) == _identity(audit_before))
        _require(_identity(os.stat("private-audit", dir_fd=attempt_fd, follow_symlinks=False)) == _identity(audit_before))
        _require(_identity(os.fstat(attempt_fd)) == _identity(attempt_before))
        _require(_identity(os.stat(attempt, follow_symlinks=False)) == _identity(attempt_before))
        _require(attempt.resolve(strict=True) == attempt.absolute())
        raw = b"".join(chunks)
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                           parse_constant=lambda _: (_require(False)))
        return _project(value)
    finally:
        for fd in reversed(descriptors):
            os.close(fd)


def _project(value):
    _exact(value, {"schema", "snapshot", "finalAudit"})
    _require(value["schema"] == "DEVELOPMENT_CLAIM_PREPOSITION_PRIVATE_METRICS_V1")
    snapshot = value["snapshot"]; _exact(snapshot, {"incomplete", "claim", "graph"})
    _require(type(snapshot["incomplete"]) is bool)
    _require(type(snapshot["claim"]) is list and len(snapshot["claim"]) == 4)
    _require(type(snapshot["graph"]) is list and len(snapshot["graph"]) == 4)
    output = {"schema": "NATIVE_CLAIM_PRIVATE_TIMING_SUMMARY_V1", "snapshotIncomplete": snapshot["incomplete"], "cpuScope": "PROCESS_INTERVAL_INCLUDES_SIBLING_WORK", "wallScope": "NESTED_INTERVALS_OVERLAP", "wholeOperationScope": "TO_LAST_METRICS_SAMPLE_NOT_TERMINAL_AUTHORITY", "finalizationScope": "CLEANUP_TO_LAST_SAMPLE_PARTIALLY_MEASURED", "finalAudit": None, "operators": []}
    for index, graph in enumerate(snapshot["graph"]):
        _exact(graph, {"index", "activity"}); _require(type(graph["index"]) is int and graph["index"] == index)
    for index, row in enumerate(snapshot["claim"]):
        _exact(row, {"index", "activity", "metrics"}); _require(type(row["index"]) is int and row["index"] == index)
        metrics = row["metrics"]
        if metrics is None:
            _require(snapshot["incomplete"])
            output["operators"].append({"index": index, "collectionIncomplete": True, "reports": []}); continue
        _exact(metrics, {"schema", "collectionIncomplete", "reports"})
        _require(metrics["schema"] == "CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1" and type(metrics["collectionIncomplete"]) is bool)
        _require(type(metrics["reports"]) is list and len(metrics["reports"]) <= 8)
        safe = {"index": index, "collectionIncomplete": metrics["collectionIncomplete"], "reports": []}
        for report in metrics["reports"]:
            _exact(report, _REPORT_KEYS)
            for key, expected in _REPORT_CONSTANTS.items():
                _require(type(report[key]) is type(expected) and report[key] == expected)
            summary = {key: _number(report[key], integer=key in {"operationOrdinal", "peakActiveIntervals"}, maximum=64 if key == "peakActiveIntervals" else _MAX_VALUE) for key in ["operationOrdinal", "wallMilliseconds", "processUserMicroseconds", "processSystemMicroseconds", "peakActiveIntervals"]}
            for key in ["incomplete", "truncated"]:
                _require(type(report[key]) is bool); summary[key] = report[key]
            _require(type(report["labels"]) is list and len(report["labels"]) <= 32)
            summary["labels"] = []
            for label in report["labels"]:
                _exact(label, _LABEL_KEYS)
                _require(all(type(label[key]) is str for key in ["phase", "method", "round"]) and label["phase"] in _PHASES and label["method"] in _METHODS and label["round"] in _ROUNDS)
                projected = {key: label[key] for key in ["phase", "method", "round"]}
                for key in _LABEL_KEYS - {"phase", "method", "round"}:
                    projected[key] = _number(label[key], integer=key in {"invocations", "measuredIntervals"})
                _require(projected["measuredIntervals"] <= projected["invocations"])
                summary["labels"].append(projected)
            safe["reports"].append(summary)
        output["operators"].append(safe)
    final = value["finalAudit"]
    if final is not None:
        _exact(final, {"profile", "phase", "originalAuthorizationAgeMilliseconds", "auditElapsedMilliseconds", "limitMilliseconds"})
        _require(final["profile"] in {"CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2", "CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4"})
        _require(final["phase"] in {"REVALIDATED_BEFORE_FINAL_CHECKS", "CONSUMED_BEFORE_KEY"})
        _require(type(final["limitMilliseconds"]) is int and final["limitMilliseconds"] == 30000)
        output["finalAudit"] = {"profile": final["profile"], "phase": final["phase"], "limitMilliseconds": 30000,
            **{key: _number(final[key], integer=True) for key in ["originalAuthorizationAgeMilliseconds", "auditElapsedMilliseconds"]}}
    return output


def read_native_claim_preposition_private_metrics(run_id):
    _require(type(run_id) is str and re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", run_id) is not None)
    return _read_physical_metrics(_PROFILE / ("attempt-" + run_id))


if __name__ == "__main__":
    try:
        _require(len(sys.argv) == 2)
        print(json.dumps(read_native_claim_preposition_private_metrics(sys.argv[1]), sort_keys=True, separators=(",", ":")))
    except Exception:
        # Never publish parser/file/argument details or an original private cause.
        print("NATIVE_CLAIM_PRIVATE_METRICS_READ_REJECTED")
        sys.exit(1)
