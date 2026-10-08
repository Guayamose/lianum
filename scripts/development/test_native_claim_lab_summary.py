"""Missing worker result preserves the actual supervisor rejection, never acceptance."""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


class MissingClaimResult(unittest.TestCase):
    def exercise(self, worker_spawned):
        source = Path(__file__).with_name("native_claim_lab.py")
        spec = importlib.util.spec_from_file_location("claim_summary_missing", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix="claims-missing-result-") as temporary:
            module.ROOT = Path(temporary)
            module.DEV = module.ROOT / "dev"
            attempt = module.ROOT / "attempt-original"
            attempt.mkdir()
            resources = {"runId": "original-run", "failure": "NATIVE_SUPERVISOR_ERROR",
                         "workerSpawned": worker_spawned, "resultAccepted": True,
                         "ownedGroupCleanupConfirmed": True}
            raw = json.dumps(resources).encode()
            path = attempt / "resources.json"
            path.write_bytes(raw)
            with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as rejected:
                module.retain_summary(attempt)
            self.assertEqual(rejected.exception.code, 1)
            summary = json.loads((module.DEV / "reports/native-claims-lab.json").read_text())
            self.assertFalse(summary["accepted"])
            self.assertFalse(summary["resultPresent"])
            self.assertIsNone(summary["resultSHA256"])
            self.assertEqual(summary["runId"], "original-run")
            self.assertEqual(summary["failure"], "NATIVE_SUPERVISOR_ERROR")
            self.assertEqual(summary["resourcesSHA256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(path.read_bytes(), raw)
            return summary

    def test_preflight_failure_records_zero_proofs_only_when_the_worker_never_started(self):
        self.assertEqual(self.exercise(False)["realProofCount"], 0)

    def test_missing_result_after_spawn_preserves_unknown_proof_count(self):
        self.assertIsNone(self.exercise(True)["realProofCount"])


if __name__ == "__main__":
    unittest.main()
