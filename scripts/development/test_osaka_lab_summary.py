"""Synthetic identity/resource joins only, no chain/process/proof acceptance."""
from contextlib import redirect_stdout
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
HERE = Path(__file__).resolve().parent
class OsakaSummary(unittest.TestCase):
    def exercise(self, mutate=None, code=0, missing=None):
        spec = importlib.util.spec_from_file_location("osaka_summary", HERE / "osaka_lab.py")
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        run_id = "11111111-1111-4111-8111-111111111111"
        pid, worker = 424242, 424243
        identity = {"pid": pid, "ppid": os.getpid(), "pgrp": os.getpgrp(), "session": os.getsid(0), "startTimeTicks": "1234"}
        binding = {"supervisorPID": pid, "workerPID": worker}
        sources = {"format": "SYNTHETIC_OSAKA_SOURCE_METADATA", "local": []}
        result = {"format": "LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESULT_V1", "profile": "ORIGINAL_OSAKA_DEPLOYMENT_AND_ONE_PUBLIC_TOKEN_TRANSFER_V1",
            "runId": run_id, "phase": "completed", "success": True, "sourceUnchanged": True,
            "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "sourcePins": copy.deepcopy(sources),
            "supervisor": binding, "cleanup": {"closedEvm": True}, "proofs": [], "fork": "osaka",
            "transactionGasCap": "16777216", "blockGasLimit": "30000000", "nodeTransactionGasLimitEnabled": True,
            "nodeCapRejection": {"originalStateUnchanged": True, "cap": "16777216"},
            "proofAcceptanceEstablished": False, "privateLifecycleEstablished": False, "fullWalletAcceptance": False,
            "productionClientAcceptanceEstablished": False, "publicConsensusOrFinalityVerified": False}
        resources = {"format": "LIANUM_DEVELOPMENT_OSAKA_SMOKE_RESOURCES_V1", "runId": run_id, "phase": "completed",
            "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "failure": None, "failures": [],
            "sourceClosureUnchanged": True, "sourcePins": copy.deepcopy(sources), "supervisorPID": pid, "workerPID": worker,
            "supervisorIdentity": copy.deepcopy(identity), "workerIdentity": {"pid": worker, "ppid": pid,
                "pgrp": worker, "session": worker, "startTimeTicks": "1235"}, "ownedProcessGroup": worker,
            "resultAccepted": True, "ownedGroupCleanupConfirmed": True, "lockReleased": True, "withinTotalDeadline": True,
            "workerSpawned": True, "workerExitObserved": True, "workerCloseObserved": True,
            "workerExit": {"code": 0, "signal": None}, "workerClose": {"code": 0, "signal": None},
            "workerResult": {"format": result["format"], "runId": run_id, "phase": "completed", "success": True,
                "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "supervisor": copy.deepcopy(binding),
                "cleanup": {"closedEvm": True}, "nodeCapRejectionObserved": True}}
        with tempfile.TemporaryDirectory(prefix="osaka-summary-host-") as temporary:
            module.ROOT = Path(temporary); module.FLAT = module.ROOT / "runtime"; module.DEV = module.ROOT / "dev"
            module.DIRECTORY = module.FLAT / ".local/development-osaka-smoke-v1"
            attempt = module.DIRECTORY / ("attempt-" + run_id); attempt.mkdir(parents=True, mode=0o700)
            captured = copy.deepcopy(identity)
            if mutate:
                captured = mutate(result, resources, sources, captured)
            payloads = {"result": json.dumps(result).encode(), "source-pins": json.dumps(sources).encode()}
            resources["sourcePinsSHA256"] = hashlib.sha256(payloads["source-pins"]).hexdigest()
            resources["workerResult"].update({"path": str((attempt / "result.json").relative_to(module.FLAT)),
                "bytes": len(payloads["result"]), "sha256": hashlib.sha256(payloads["result"]).hexdigest()})
            if resources.pop("syntheticTamperHash", False):
                resources["workerResult"]["sha256"] = "f" * 64
            payloads["resources"] = json.dumps(resources).encode()
            for name, value in payloads.items():
                if name != missing:
                    path = attempt / (name + ".json"); path.write_bytes(value); path.chmod(0o600)
            before = {path: path.read_bytes() for path in attempt.iterdir()}
            with redirect_stdout(io.StringIO()):
                try:
                    module.retain_summary(attempt, pid, code, captured)
                    rejected = False
                except SystemExit:
                    rejected = True
            summary = json.loads((module.DEV / "reports/osaka-smoke-lab.json").read_text())
            self.assertEqual({path: path.read_bytes() for path in attempt.iterdir()}, before)
            return rejected, summary

    def test_accepts_only_the_original_zero_exit_identity_byte_and_cleanup_joins(self):
        rejected, summary = self.exercise()
        self.assertFalse(rejected); self.assertTrue(summary["accepted"])
        self.assertTrue(all(summary["receiptChecks"].values()))
        self.assertFalse(summary["privateLifecycleEstablished"]); self.assertFalse(summary["fullWalletAcceptance"])

    def test_preserves_rejection_on_nonzero_signal_source_identity_scope_or_bytes_failure(self):
        changes = [
            lambda r, s, p, i: r.update(phase="failed", success=False),
            lambda r, s, p, i: s.update(phase="failed", failure="SYNTHETIC_FAILED", failures=["SYNTHETIC_FAILED"]),
            lambda r, s, p, i: s.pop("failure"),
            lambda r, s, p, i: r.update(sourceUnchanged=False),
            lambda r, s, p, i: p.update(local=[{"path": "changed.mjs"}]),
            lambda r, s, p, i: s.update(sourceClosureUnchanged=False),
            lambda r, s, p, i: s["supervisorIdentity"].update(startTimeTicks="9999"),
            lambda r, s, p, i: s["workerIdentity"].update(ppid=999999),
            lambda r, s, p, i: s.update(runId="22222222-2222-4222-8222-222222222222"),
            lambda r, s, p, i: s["workerClose"].update(signal="SIGTERM"),
            lambda r, s, p, i: s.update(ownedGroupCleanupConfirmed=False),
            lambda r, s, p, i: s.update(lockReleased=False),
            lambda r, s, p, i: s.update(syntheticTamperHash=True),
            lambda r, s, p, i: r.update(transactionGasCap="30000000"),
            lambda r, s, p, i: r.update(fullWalletAcceptance=True),
            lambda r, s, p, i: r.update(proofs=None),
            lambda r, s, p, i: r.update(proofs=[{"relation": "invented"}]),
            lambda r, s, p, i: s["workerResult"].update(nodeCapRejectionObserved=False),
            lambda r, s, p, i: None,
        ]
        for index, change in enumerate(changes):
            def mutate(r, s, p, i):
                change(r, s, p, i)
                return None if index == len(changes) - 1 else i
            with self.subTest(index=index):
                rejected, summary = self.exercise(mutate)
                self.assertTrue(rejected); self.assertFalse(summary["accepted"])
        for code in (1, -15):
            rejected, summary = self.exercise(code=code)
            self.assertTrue(rejected); self.assertFalse(summary["receiptChecks"]["supervisorExitZero"])
        for missing in ("result", "resources", "source-pins"):
            rejected, summary = self.exercise(missing=missing)
            self.assertTrue(rejected); self.assertIn(missing, summary["evidenceReadFailures"])

if __name__ == "__main__":
    unittest.main()
