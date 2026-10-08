"""Synthetic public metadata only; no proof/runtime/economic authority.

The actual fixed reader executes. Its original telemetry/file-pin read ports
are supplied inert bytes; financial proof/input byte joins remain the parent.
"""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch
import native_economic_note_receipts as reader


class NativeEconomicNoteReceiptTests(unittest.TestCase):
    def fixture(self, mode):
        native = {"profile": "LIANUM_ECONOMIC_D26_W39_NATIVE_UNIX_SOCKET_V1", "backend": "NativeUnixSocket", "threads": 12,
            "bbVersion": "5.2.0", "binarySHA256": "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b",
            "originalPreparedKeyRequired": True, "oneEphemeralJob": True, "memoryScope": "COORDINATOR_PLUS_NATIVE_CHILD",
            "rssLimitBytes": 3221225472, "outputBytes": 0, "outputByteAccounting": "RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND",
            "outputStreamsClosed": True, "socketClosed": True, "socketRemoved": True,
            "childIdentity": {"pid": 100, "ppid": 99, "pgrp": 98, "session": 98, "startTimeTicks": "123456"},
            "childClose": {"code": 0, "signal": None}}
        original = {**copy.deepcopy(reader._LINEAGE[mode]), "id": "11111111-1111-4111-8111-111111111111",
            "classification": "ACTUAL_PRIVATE_PROOF_PROCESS_PUBLIC_METRICS_ONLY", "operation": "prove", "purpose": "owner",
            "phase": "completed", "acceptedResult": True, "exit": {"code": 0, "signal": None}, "lockPreserved": False,
            "zeroKnowledgeEnabled": True, "policy": copy.deepcopy(reader._POLICY), "threads": 12, "maximumPages": None, "preparedMaximumPages": 32768,
            "nativeChildrenGone": True, "nativeBackendExecution": native, "nativeChildIdentities": [native["childIdentity"]],
            "nativeMemoryScope": "COORDINATOR_PLUS_NATIVE_CHILD", "peakWorkerRSS": 1024, "childPID": 99,
            "resourceSamples": [{"availableRAM": 2684354560, "freeDisk": 5368709120, "workerRSS": 1024}],
            "codePins": {**{name: {"bytes": 17, "sha256": "1" * 64} for name in reader._CODE_FILES},
                "nativeNoteEntries": {name: {"bytes": 17, "sha256": "1" * 64} for name in reader._ENTRY_FILES}}}
        original["worker"] = {**copy.deepcopy(reader._LINEAGE[mode]), "threads": 12, "maximumPages": None,
            "preparedMaximumPages": 32768, "zeroKnowledgeEnabled": True, "verified": True,
            "toolchain": copy.deepcopy(reader._TOOLCHAIN), "crs": copy.deepcopy(reader._CRS), "independentVerification": copy.deepcopy(reader._VERIFY),
            "nativeBackendExecution": copy.deepcopy(native), "proofSHA256": "2" * 64, "publicInputsSHA256": "3" * 64,
            "publicInputCount": 26 if mode == "deposit_balance" else 39}
        return original

    def join(self, original):
        data = json.dumps(original, allow_nan=False).encode()
        row = {"relation": original["mode"], "publicWords": original["statementWords"], "proofSHA256": original["worker"]["proofSHA256"],
            "publicInputsSHA256": original["worker"]["publicInputsSHA256"],
            "evidence": {**copy.deepcopy(original), "telemetrySHA256": hashlib.sha256(data).hexdigest(), "resourceReceiptCompleted": True}}
        return data, row

    def read(self, original, mutate_row=None, runtime=None, changed_read=False):
        data, row = self.join(original)
        if mutate_row:
            mutate_row(row)
        keys = {mode: value["keySHA256"] for mode, value in reader._LINEAGE.items()}
        expected = reader._TELEMETRY / (original["id"] + ".json")
        reads = []
        def raw(path):
            self.assertEqual(path, expected)
            reads.append(path)
            return data if not changed_read or len(reads) == 1 else data + b" "
        def pin(path):
            self.assertIn(path, {*reader._CODE_FILES.values(), *reader._ENTRY_FILES.values()})
            return {"bytes": 17, "sha256": "1" * 64}
        with patch.object(reader, "private_evidence", raw), patch.object(reader, "_file_pin", pin):
            return reader.assert_native_economic_note_row(row, keys, reader._FLAT if runtime is None else runtime)

    def test_original_raw_join_requires_finite_lineage_close_verify_resources_and_unchanged_source(self):
        for mode in ("deposit_balance", "withdraw_balance"):
            with self.subTest(positive=mode):
                self.assertTrue(self.read(self.fixture(mode)))
        original = self.fixture("deposit_balance")
        mutations = [
            lambda e: e.update(acceptedResult=False),
            lambda e: e.update(lockPreserved=True),
            lambda e: e.update(nativeChildrenGone=False),
            lambda e: e.update(nativeChildIdentities=[]),
            lambda e: e.update(peakWorkerRSS=3221225473),
            lambda e: e.update(threads=1),
            lambda e: e.pop("maximumPages"),
            lambda e: e["worker"].update(keySHA256="4" * 64),
            lambda e: e["worker"].update(artifactSHA256="4" * 64),
            lambda e: e["worker"]["nativeBackendExecution"]["childClose"].update(code=1),
            lambda e: e["worker"]["independentVerification"].update(nativeProducerClosedBeforeVerification=False),
            lambda e: e["worker"]["independentVerification"].update(backendDestroyed=False),
            lambda e: e["resourceSamples"][0].update(workerRSS=3221225473),
            lambda e: e["codePins"]["nativeNoteRunner"].update(sha256="4" * 64),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(negative=index):
                changed = copy.deepcopy(original); mutate(changed)
                self.assertFalse(self.read(changed))
        self.assertFalse(self.read(original, mutate_row=lambda row: row.update(proofSHA256="4" * 64)))
        self.assertFalse(self.read(original, mutate_row=lambda row: row["evidence"].update(telemetrySHA256="4" * 64)))
        self.assertFalse(self.read(original, changed_read=True))
        self.assertFalse(self.read(original, runtime=reader._FLAT / "caller"))


if __name__ == "__main__":
    unittest.main()
