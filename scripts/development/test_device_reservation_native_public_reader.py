"""HOST public receipt framing only, no prover, custody or chain acceptance."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

# Reuse the existing public-reader metadata fixture and raw read seam, after
# the independent I84/N reader cut is promoted. No generated receipt is real.
spec = importlib.util.spec_from_file_location("reader_metadata_fixtures", Path(__file__).with_name("test_device_native_proof_public_reader.py"))
fixtures = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixtures)
reader = fixtures.reader


def reservation_fixture(threads=12):
    row, proof, inputs, pins = fixtures.fixture("node", threads)
    e = row["evidence"]
    row.update(relation="reservation", publicWords=58)
    inputs = fixtures.raw(["0x" + "0" * 64] * 58)
    for name in ("manifest", "result"):
        e[name].update(reader._RESERVATION_ORIGINAL)
        e[name].update(relation="reservation", role="reservation", publicWords=58, publicInputsSHA256=fixtures.sha(inputs))
    e["resources"]["relation"] = "reservation"
    e["keySHA256"] = reader._RESERVATION_ORIGINAL["keySHA256"]
    e["programSHA256"] = reader._RESERVATION_ORIGINAL["artifactSHA256"]
    row["publicInputsSHA256"] = fixtures.sha(inputs)
    if threads == 12:
        for name in ("result", "resources"):
            e[name]["nativeBackendExecution"]["profile"] = "LIANUM_ORIGINAL_S_NATIVE_UNIX_SOCKET_V1"
    return row, proof, inputs, pins


class DeviceReservationNativePublicReaderTests(unittest.TestCase):
    def accepts(self, row, proof, inputs, pins):
        records = fixtures.encoded(row, proof, inputs, pins)
        before = deepcopy(records)
        with patch.object(reader, "private_evidence", side_effect=fixtures.read_records(records)):
            accepted = reader._execution_raw_proof_receipt(row)
        self.assertEqual(records, before, "classification never rewrites raw public evidence")
        return accepted

    def test_distinct_native_s12_and_retained_wasm_s4(self):
        self.assertTrue(self.accepts(*reservation_fixture(12)))
        self.assertTrue(self.accepts(*reservation_fixture(4)))
        row, proof, inputs, pins = reservation_fixture()
        e = row["evidence"]
        self.assertTrue(reader._reservation_backend_execution("reservation", e["manifest"], e["result"], e["resources"], 12))
        self.assertFalse(reader._reservation_backend_execution("authorization", e["manifest"], e["result"], e["resources"], 12))
        self.assertFalse(self.accepts(*reservation_fixture(1)))

    def test_native_s_requires_original_lineage_close_independent_verify_and_raw_pins(self):
        mutations = (
            lambda e: (e["manifest"].update(keySHA256="0" * 64), e["result"].update(keySHA256="0" * 64)),
            lambda e: (e["manifest"].update(artifactSHA256="0" * 64), e["result"].update(artifactSHA256="0" * 64)),
            lambda e: (e["manifest"].update(sourceVersion="0" * 64), e["result"].update(sourceVersion="0" * 64)),
            lambda e: (e["result"]["nativeBackendExecution"].update(profile="LIANUM_ORIGINAL_U_NATIVE_UNIX_SOCKET_V1"),
                e["resources"]["nativeBackendExecution"].update(profile="LIANUM_ORIGINAL_U_NATIVE_UNIX_SOCKET_V1")),
            lambda e: e["resources"].update(nativeChildrenGone=False),
            lambda e: e["result"]["independentVerification"].update(nativeProducerClosedBeforeVerification=False),
            lambda e: e["resources"].update(peakWorkerRSS=3221225473),
            lambda e: e["resources"].update(phase="failed", failure="PW_RESOURCE_MONITOR_FAILED"),
        )
        for mutation in mutations:
            row, proof, inputs, pins = reservation_fixture()
            mutation(row["evidence"])
            self.assertFalse(self.accepts(row, proof, inputs, pins))
        row, proof, inputs, pins = reservation_fixture()
        records = fixtures.encoded(row, proof, inputs, pins)
        target = next(path for path in records if path.name == "runtime-pins.json")
        records[target] += b" "
        with patch.object(reader, "private_evidence", side_effect=fixtures.read_records(records)):
            self.assertFalse(reader._execution_raw_proof_receipt(row))


if __name__ == "__main__":
    unittest.main()
