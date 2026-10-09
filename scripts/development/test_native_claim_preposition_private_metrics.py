"""HOST DATA only: original-format reports and real private files, no authority."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import native_claim_preposition_private_metrics as reader


def original_format():
    label = {"phase": "durable-save", "method": "operation", "round": "whole-operation", "invocations": 2,
             "measuredIntervals": 2, "wallMilliseconds": 12500.125, "maximumWallMilliseconds": 6250.0625,
             "processUserMicroseconds": 100.5, "processSystemMicroseconds": 25.25}
    report = {"schema": "CLAIM_PRIVATE_OPERATION_METRICS_V1", "cpuScope": "PROCESS_INTERVAL_INCLUDES_SIBLING_WORK",
              "wallScope": "NESTED_INTERVALS_OVERLAP", "wholeOperationScope": "TO_LAST_METRICS_SAMPLE_NOT_TERMINAL_AUTHORITY",
              "finalizationScope": "CLEANUP_TO_LAST_SAMPLE_PARTIALLY_MEASURED",
              "postFenceSamplingAndRetirementNotBudgeted": True, "nonCustodyObserverSeparatePhaseNotMeasured": True,
              "rpcCounts": None, "keyUsageMeasured": False, "operationOrdinal": 7, "wallMilliseconds": 25500.25,
              "processUserMicroseconds": 1000.5, "processSystemMicroseconds": 250.25,
              "incomplete": False, "truncated": False, "peakActiveIntervals": 3, "labels": [label]}
    # Activity is deliberately opaque/non-authoritative and never output.
    claim = [{"index": i, "activity": {"privateSentinel": "PRIVATE_ACTIVITY_VALUE"}, "metrics": {
              "schema": "CLAIM_PRIVATE_OPERATION_METRICS_VIEW_V1", "collectionIncomplete": False,
              "reports": [copy.deepcopy(report)]}} for i in range(4)]
    return {"schema": "DEVELOPMENT_CLAIM_PREPOSITION_PRIVATE_METRICS_V1", "snapshot": {
        "incomplete": False, "claim": claim, "graph": [{"index": i, "activity": None} for i in range(4)]},
        "finalAudit": {"profile": "CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2", "phase": "REVALIDATED_BEFORE_FINAL_CHECKS",
                       "originalAuthorizationAgeMilliseconds": 37625, "auditElapsedMilliseconds": 12125, "limitMilliseconds": 30000}}


class PrivateMetricsHost(unittest.TestCase):
    def test_original_numeric_projection_bounds_and_hostile_values(self):
        value = original_format(); result = reader._project(value)
        self.assertEqual(result["finalAudit"]["originalAuthorizationAgeMilliseconds"], 37625)
        self.assertEqual(result["operators"][0]["reports"][0]["labels"][0]["wallMilliseconds"], 12500.125)
        self.assertNotIn("PRIVATE_ACTIVITY_VALUE", json.dumps(result))
        self.assertNotIn("activity", json.dumps(result))
        for bad in [float("nan"), float("inf"), True, "PRIVATE_ACTUAL_MESSAGE", -1, reader._MAX_VALUE + 1]:
            mutated = copy.deepcopy(value); mutated["snapshot"]["claim"][0]["metrics"]["reports"][0]["wallMilliseconds"] = bad
            with self.assertRaises(reader.PrivateMetricsRejected): reader._project(mutated)
        for key, bad in [("phase", "PRIVATE_ACTUAL_MESSAGE"), ("method", "PRIVATE_REQUEST"), ("round", "PRIVATE_PATH")]:
            mutated = copy.deepcopy(value); mutated["snapshot"]["claim"][0]["metrics"]["reports"][0]["labels"][0][key] = bad
            with self.assertRaises(reader.PrivateMetricsRejected): reader._project(mutated)
        for key, count in [("reports", 9), ("labels", 33)]:
            mutated = copy.deepcopy(value); metrics = mutated["snapshot"]["claim"][0]["metrics"]
            if key == "reports": metrics[key] *= count
            else: metrics["reports"][0][key] *= count
            with self.assertRaises(reader.PrivateMetricsRejected): reader._project(mutated)
        for run_id in ["../PRIVATE_PATH", "8134D03E-49e4-4218-9217-4f3275d10f32", "8134d03e-49e4-4218-9217-4f3275d10f32\n"]:
            with patch.object(reader, "_read_physical_metrics", side_effect=AssertionError("HOST_NO_READ")):
                with self.assertRaises(reader.PrivateMetricsRejected): reader.read_native_claim_preposition_private_metrics(run_id)

    def test_private_fd_read_duplicate_json_permissions_links_and_race(self):
        with tempfile.TemporaryDirectory() as directory:
            attempt = Path(directory) / "attempt-host"; attempt.mkdir(mode=0o700)
            audit = attempt / "private-audit"; audit.mkdir(mode=0o700)
            file = audit / reader._FILE
            raw = json.dumps(original_format()).encode(); file.write_bytes(raw); file.chmod(0o600)
            self.assertEqual(len(reader._read_physical_metrics(attempt)["operators"]), 4)
            file.chmod(0o644)
            with self.assertRaises(reader.PrivateMetricsRejected): reader._read_physical_metrics(attempt)
            file.chmod(0o600); os.link(file, audit / "second-link")
            with self.assertRaises(reader.PrivateMetricsRejected): reader._read_physical_metrics(attempt)
            (audit / "second-link").unlink()
            file.write_bytes(b'{"schema":"PRIVATE_A","schema":"PRIVATE_B"}')
            with self.assertRaises(reader.PrivateMetricsRejected): reader._read_physical_metrics(attempt)
            file.write_bytes(raw); real_read = os.read; changed = False
            def mutate_after_first_read(fd, size):
                nonlocal changed
                result = real_read(fd, size)
                if not changed:
                    changed = True; file.write_bytes(raw + b" ")
                return result
            with patch.object(reader.os, "read", side_effect=mutate_after_first_read):
                with self.assertRaises(reader.PrivateMetricsRejected): reader._read_physical_metrics(attempt)
            file.write_bytes(raw); file.rename(audit / "original"); file.symlink_to(audit / "original")
            with self.assertRaises(OSError): reader._read_physical_metrics(attempt)


if __name__ == "__main__":
    unittest.main()
