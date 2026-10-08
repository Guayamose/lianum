"""HOST public metadata only: no scheduler, process, prover or financial authority."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

CANONICAL = Path(__file__).resolve()
while not (CANONICAL / "scripts/development/workspace.py").is_file():
    if CANONICAL == CANONICAL.parent:
        raise RuntimeError("CANONICAL_READER_TEST_ROOT")
    CANONICAL = CANONICAL.parent
sys.path.insert(0, str(CANONICAL / "scripts/development"))
spec = importlib.util.spec_from_file_location("paired_public_reader", Path(__file__).with_name("paired_original_account_lab.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

RUN = "01234567-89ab-4cde-8fab-0123456789ab"
JOB = "11234567-89ab-4cde-8fab-0123456789ab"


def raw(value):
    return (json.dumps(value, indent=2) + "\n").encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def read_records(records):
    def read(path):
        if path not in records:
            raise FileNotFoundError(path.name)
        return records[path]
    return read


def fixture(relation, threads=12):
    i84 = relation == "admission_native_value_v2"
    native = threads == 12
    fields = deepcopy(reader._I84_ORIGINAL if i84 else reader._NODE_ORIGINAL)
    if not i84:
        fields["sourceVersion"] = "f" * 64
    pins = raw({"format": "HOST_ONLY_RUNTIME_PIN_FIXTURE", "files": [{"path": "proof-worker.mjs", "sha256": "1" * 64}]})
    proof = b"p" * 64
    inputs = raw(["0x" + "0" * 64] * (84 if i84 else 32))
    shared = {"profile": "LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2" if i84 else "LIANUM_PAEG_P2_V1",
        "relation": relation, "runId": RUN, "jobId": JOB, "runtimePinsSHA256": sha(pins)}
    m = {**shared, **fields, "format": "NV2_SCOPED_PUBLIC_PROOF_V1" if i84 else "FLAT_WALLET_PUBLIC_PROOF_V1",
        "role": "local", "selfVerified": True, "proofSHA256": sha(proof), "publicInputsSHA256": sha(inputs),
        "proofBytes": len(proof), "settings": deepcopy(reader._EXECUTION_SETTINGS), "target": "evm"}
    w = {**shared, **fields, "format": "NV2_SCOPED_PROOF_RESULT_V1" if i84 else "FLAT_WALLET_WORKER_ATTEMPT_V1",
        "role": "local", "phase": "completed", "mode": "prove-dyadic21" if i84 else "prove",
        "threads": threads, "maximumPages": None if native else 65536 if i84 else 32768,
        "settings": deepcopy(reader._EXECUTION_SETTINGS), "limits": {**reader._EXECUTION_LIMITS, "threads": threads},
        "selfVerified": True, "proofGenerated": True, "keyGenerated": False, "keyRecomputed": False,
        "hostLimitsChanged": False, "backendDestroyed": True, "witnessPersisted": False,
        "proofSHA256": sha(proof), "publicInputsSHA256": sha(inputs), "target": "evm"}
    r = {**shared, "format": "NV2_SCOPED_PROOF_RESOURCES_V1" if i84 else "FLAT_WALLET_EXTERNAL_RESOURCE_REPORT_V1",
        "phase": "completed", "mode": w["mode"], "exitCode": 0, "signal": None, "failure": None,
        "failures": [], "lockPreserved": False, "hostLimitsChanged": False, "limits": deepcopy(w["limits"])}
    if i84:
        m.update(publicWords=84, backendPublicWords=92, publicInputOffset=5, maximumPages=None if native else 65536)
    else:
        m["publicWords"] = w["publicWords"] = 32
    if native:
        pages = 65536 if i84 else 32768
        child = {"pid": 303, "ppid": 202, "pgrp": 101, "session": 101, "startTimeTicks": "12345"}
        if i84:
            child["uid"] = reader.os.getuid()
            m.update(preparedMaximumPages=65536, executionBackend="NativeUnixSocket", threads=12)
        n = {"profile": "LIANUM_ORIGINAL_I84_V5_NATIVE_UNIX_SOCKET_V1" if i84 else "LIANUM_ORIGINAL_N_NATIVE_UNIX_SOCKET_V1",
            "backend": "NativeUnixSocket", "threads": 12, "bbVersion": "5.2.0",
            "binarySHA256": "5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b",
            "originalPreparedKeyRequired": True, "oneEphemeralJob": True, "memoryScope": "COORDINATOR_PLUS_NATIVE_CHILD",
            "rssLimitBytes": 3221225472, "outputByteAccounting": "RAW_CAPTURE_PLUS_OFFICIAL_LOGGER_UPPER_BOUND",
            "outputStreamsClosed": True, "socketClosed": True, "socketRemoved": True,
            "childIdentity": child, "childClose": {"code": None, "signal": "SIGTERM"}, "outputBytes": 128}
        w.update(nativeBackendExecution=n, preparedMaximumPages=pages,
            independentVerification={"backend": "Wasm", "threads": 1, "maximumPages": pages,
                "originalPreparedKeyRequired": True, "verifierCRSOnly": True, "backendDestroyed": True})
        if not i84:
            w["independentVerification"]["nativeProducerClosedBeforeVerification"] = True
        r.update(nativeBackendExecution=deepcopy(n), nativeMemoryScope="COORDINATOR_PLUS_NATIVE_CHILD",
            nativeChildrenGone=True, nativeChildIdentities=[deepcopy(child)], peakWorkerRSS=3221225472)
    elif threads == 4:
        w["wasmThreadExecution"] = {"threads": 4, "sharedMemory": True, "oneOwnedProcess": True, "originalPreparedKeyRequired": True}
    row = {"relation": relation, "publicWords": 84 if i84 else 32, "proofSHA256": sha(proof), "publicInputsSHA256": sha(inputs),
        "evidence": {"runId": RUN, "jobId": JOB, "manifest": m, "result": w, "resources": r,
            "keySHA256": fields["keySHA256"], "programSHA256": fields["artifactSHA256"], "runtimePinsSHA256": sha(pins)}}
    return row, proof, inputs, pins


def encoded(row, proof, inputs, pins):
    e = row["evidence"]
    local = (".local/proof-workers-native-value-dev-live-v5" if "nativeBackendExecution" in e["result"] else
        ".local/proof-workers-native-value-live-v2") if row["relation"] == "admission_native_value_v2" else ".local/proof-workers"
    directory = reader.FLAT / local / "attempts" / RUN
    records = {directory / "proof.bin": proof, directory / "public-inputs.json": inputs, directory / "runtime-pins.json": pins}
    for name, field, report in (("proof-manifest.json", "manifestSHA256", "manifest"),
        ("result.json", "resultSHA256", "result"), ("resources.json", "resourcesSHA256", "resources")):
        data = raw(e[report]); records[directory / name] = data; e[field] = sha(data)
    return records


class DeviceNativePublicReaderTests(unittest.TestCase):
    def accepts(self, row, proof, inputs, pins):
        records = encoded(row, proof, inputs, pins)
        before = deepcopy(records)
        with patch.object(reader, "private_evidence", side_effect=read_records(records)):
            result = reader._execution_raw_proof_receipt(row)
        self.assertEqual(records, before, "reader must never rewrite raw evidence")
        return result

    def test_native12_and_historical_backends_fixed_by_relation_and_namespace(self):
        for relation, threads in (("admission_native_value_v2", 12), ("admission_native_value_v2", 1),
            ("node", 12), ("node", 4), ("node", 1)):
            with self.subTest(relation=relation, threads=threads):
                self.assertTrue(self.accepts(*fixture(relation, threads)))
        # The V5 consumer also produced historical WASM1 receipts. Both fixed
        # namespaces are supported, but duplicate UUID originals must reject.
        row, proof, inputs, pins = fixture("admission_native_value_v2", 1)
        records = encoded(row, proof, inputs, pins)
        current = {reader.FLAT / ".local/proof-workers-native-value-dev-live-v5/attempts" / RUN / path.name: value
            for path, value in records.items()}
        with patch.object(reader, "private_evidence", side_effect=read_records(current)):
            self.assertTrue(reader._execution_raw_proof_receipt(row))
        with patch.object(reader, "private_evidence", side_effect=read_records({**records, **current})):
            self.assertFalse(reader._execution_raw_proof_receipt(row))

    def test_raw_pin_key_profile_and_retained_object_joins_are_not_interchangeable(self):
        mutations = (
            lambda e: e["manifest"].update(keySHA256="0" * 64),
            lambda e: e["manifest"].update(keyManifestSHA256="0" * 64),
            lambda e: e["result"].update(runtimePinsSHA256="0" * 64),
            lambda e: e["resources"].update(profile="LIANUM_PAEG_P2_V1"),
            lambda e: e["result"]["nativeBackendExecution"].update(profile="LIANUM_ORIGINAL_U_NATIVE_UNIX_SOCKET_V1"),
            lambda e: e["manifest"]["settings"].update(disableZk=True),
        )
        for change in mutations:
            row, proof, inputs, pins = fixture("admission_native_value_v2")
            change(row["evidence"])
            with self.subTest(change=change):
                self.assertFalse(self.accepts(row, proof, inputs, pins))
        row, proof, inputs, pins = fixture("admission_native_value_v2")
        records = encoded(row, proof, inputs, pins)
        row["evidence"]["result"]["selfVerified"] = False  # original raw and SHA deliberately unchanged
        with patch.object(reader, "private_evidence", side_effect=read_records(records)):
            self.assertFalse(reader._execution_raw_proof_receipt(row))

    def test_native_close_ownership_aggregate_limits_and_independent_verify_are_required(self):
        for relation in ("admission_native_value_v2", "node"):
            changes = (
                lambda e: e["resources"].update(nativeChildrenGone=False),
                lambda e: e["resources"].update(peakWorkerRSS=3221225473),
                lambda e: e["resources"]["nativeChildIdentities"][0].update(startTimeTicks="98765"),
                lambda e: e["result"]["nativeBackendExecution"].update(childClose={"code": None, "signal": None}),
                lambda e: e["result"]["independentVerification"].update(threads=12),
                lambda e: e["result"].update(maximumPages=32768),
                lambda e: e["resources"]["limits"].update(threads=4),
                lambda e: e["result"]["nativeBackendExecution"].update(socketClosed=1),
            )
            for change in changes:
                row, proof, inputs, pins = fixture(relation)
                change(row["evidence"])
                with self.subTest(relation=relation, change=change):
                    self.assertFalse(self.accepts(row, proof, inputs, pins))

    def test_self_verified_proof_never_converts_original_resource_rejection_to_acceptance(self):
        for change in (lambda r: r.update(phase="failed"), lambda r: r.update(exitCode=1),
            lambda r: r.update(failure="PW_RESOURCE_MONITOR_FAILED", failures=["PW_RESOURCE_MONITOR_FAILED"]),
            lambda r: r.update(lockPreserved=True), lambda r: r.update(hostLimitsChanged=True)):
            row, proof, inputs, pins = fixture("node")
            change(row["evidence"]["resources"])
            self.assertFalse(self.accepts(row, proof, inputs, pins))
        row, proof, inputs, pins = fixture("node")
        records = encoded(row, proof, inputs, pins)
        target = next(p for p in records if p.name == "runtime-pins.json")
        records[target] += b" "  # same JSON meaning, different ORIGINAL bytes: must reject SHA
        with patch.object(reader, "private_evidence", side_effect=read_records(records)):
            self.assertFalse(reader._execution_raw_proof_receipt(row))


if __name__ == "__main__":
    unittest.main()
