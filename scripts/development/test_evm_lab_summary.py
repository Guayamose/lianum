"""Host-only metadata fixtures; no browser, proof, node or real acceptance."""
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


class EvmSummary(unittest.TestCase):
    def exercise(self, profile, mutate=None, exit_code=0, missing=None):
        spec = importlib.util.spec_from_file_location("summary_lab", HERE / "evm_lab.py")
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        run_id = "11111111-1111-4111-8111-111111111111"
        supervisor_pid, worker_pid = 424242, 424243
        prefix = {"sdk": "FLAT_MANUAL_WALLET_ACCEPTANCE", "recovery": "FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY",
            "browser": "FLAT_MANUAL_WALLET_BROWSER", "browser-recovery": "FLAT_MANUAL_WALLET_BROWSER_TIMEOUT_RECOVERY"}[profile]
        completion = {"sdk": "walletSdkEvmFlowCompleted", "recovery": "actualTimeoutFRecoveryAcceptance",
            "browser": "walletBrowserEvmFlowCompleted", "browser-recovery": "walletBrowserTimeoutFRecoveryCompleted"}[profile]
        result_format = prefix + ("_ACCEPTANCE_RESULT_V1" if profile == "browser" else "_RESULT_V1")
        flow = {"sdk": "manual-wallet-acceptance", "recovery": "manual-wallet-timeout-recovery",
            "browser": "manual-wallet-browser-acceptance", "browser-recovery": "manual-wallet-browser-timeout-recovery"}[profile]
        sources = {"format": "SYNTHETIC_EVM_SUMMARY_SOURCE_METADATA", "local": []}
        binding = {"supervisorPID": supervisor_pid, "workerPID": worker_pid}
        supervisor_identity = {"pid": supervisor_pid, "ppid": os.getpid(), "pgrp": os.getpgrp(),
            "session": os.getsid(0), "startTimeTicks": "1234"}
        result = {"format": result_format, "runId": run_id, "phase": "completed", "success": True,
            "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "sourceUnchanged": True,
            "sourcePins": copy.deepcopy(sources), "supervisor": binding, "cleanup": {"closedEvm": True},
            completion: True, "proofs": []}
        resources = {"format": prefix + "_RESOURCES_V1", "runId": run_id, "phase": "completed",
            "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
            "failure": None, "failures": [], "sourceClosureUnchanged": True, "sourcePins": copy.deepcopy(sources),
            "supervisorPID": supervisor_pid, "workerPID": worker_pid,
            "supervisorIdentity": copy.deepcopy(supervisor_identity),
            "workerIdentity": {"pid": worker_pid, "ppid": supervisor_pid, "pgrp": worker_pid,
                "session": worker_pid, "startTimeTicks": "1235"},
            "ownedProcessGroup": worker_pid, "resultAccepted": True, "ownedGroupCleanupConfirmed": True,
            "lockReleased": True, "withinTotalDeadline": True, "workerSpawned": True,
            "workerExitObserved": True, "workerCloseObserved": True,
            "workerExit": {"code": 0, "signal": None}, "workerClose": {"code": 0, "signal": None},
            "workerResult": {"format": result_format, "runId": run_id, "phase": "completed", "success": True,
                "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "supervisor": copy.deepcopy(binding),
                "cleanup": {"closedEvm": True}}}
        with tempfile.TemporaryDirectory(prefix="lianum-summary-host-") as temporary:
            module.ROOT = Path(temporary); module.FLAT = module.ROOT / "runtime"; module.DEV = module.ROOT / "dev"
            attempt = module.FLAT / ".local" / flow / ("attempt-" + run_id)
            attempt.mkdir(parents=True, mode=0o700)
            module.last_lab_attempt = attempt; module.last_lab_supervisor_pid = supervisor_pid
            module.last_lab_supervisor_code = exit_code
            module.last_lab_supervisor_identity = copy.deepcopy(supervisor_identity)
            if mutate:
                mutate(result, resources, sources, module)
            payloads = {"result": json.dumps(result).encode(), "source-pins": json.dumps(sources).encode()}
            resources["sourcePinsSHA256"] = hashlib.sha256(payloads["source-pins"]).hexdigest()
            resources["workerResult"].update({"path": str((attempt / "result.json").relative_to(module.FLAT)),
                "bytes": len(payloads["result"]), "sha256": hashlib.sha256(payloads["result"]).hexdigest()})
            # A negative fixture can independently break the original byte join.
            if getattr(module, "tamper_result_hash", False):
                resources["workerResult"]["sha256"] = "f" * 64
            payloads["resources"] = json.dumps(resources).encode()
            for name, value in payloads.items():
                if name != missing:
                    path = attempt / (name + ".json"); path.write_bytes(value); path.chmod(0o600)
            files_before = {path: path.read_bytes() for path in attempt.iterdir()}
            with redirect_stdout(io.StringIO()):
                try:
                    module.retain_summary(profile in {"recovery", "browser-recovery"}, profile in {"browser", "browser-recovery"})
                    code = 0
                except SystemExit as error:
                    code = error.code
            filename = {"sdk": "evm-lab.json", "recovery": "evm-recovery-lab.json", "browser": "evm-browser-lab.json", "browser-recovery": "evm-browser-recovery-lab.json"}[profile]
            summary = json.loads((module.DEV / "reports" / filename).read_text())
            self.assertEqual({path: path.read_bytes() for path in attempt.iterdir()}, files_before,
                "The original attempt must never be rewritten or reclassified")
            return code, summary

    def test_four_profiles_accept_only_the_joined_completed_original_metadata(self):
        for profile in ("sdk", "recovery", "browser", "browser-recovery"):
            with self.subTest(profile=profile):
                code, summary = self.exercise(profile)
                self.assertEqual(code, 0); self.assertTrue(summary["accepted"])
                self.assertTrue(all(summary["receiptChecks"].values()))
                self.assertEqual(summary["supervisorExitCode"], 0)

    def test_nonzero_supervisor_is_rejected_even_when_all_receipts_claim_completion(self):
        for profile in ("sdk", "recovery", "browser", "browser-recovery"):
            with self.subTest(profile=profile):
                code, summary = self.exercise(profile, exit_code=1)
                self.assertEqual(code, 1); self.assertFalse(summary["accepted"])
                self.assertFalse(summary["receiptChecks"]["supervisorExitZero"])

    def test_failed_changed_or_crossed_metadata_retains_a_rejected_summary(self):
        changes = [
            lambda r, s, p, m: r.update(phase="failed", success=False, errorCode="SYNTHETIC_WORKER_FAILED"),
            lambda r, s, p, m: s.update(phase="failed", failure="SYNTHETIC_RESOURCE_FAILED", failures=[{"code": "SYNTHETIC_RESOURCE_FAILED"}]),
            lambda r, s, p, m: s.pop("failure"),
            lambda r, s, p, m: r.update(sourceUnchanged=False),
            lambda r, s, p, m: s.update(sourceClosureUnchanged=False),
            lambda r, s, p, m: p.update(local=[{"path": "tampered.mjs"}]),
            lambda r, s, p, m: s.update(runId="22222222-2222-4222-8222-222222222222"),
            lambda r, s, p, m: s.update(supervisorPID=424244),
            lambda r, s, p, m: r["supervisor"].update(workerPID=424244),
            lambda r, s, p, m: s["supervisorIdentity"].update(startTimeTicks="9999"),
            lambda r, s, p, m: setattr(m, "last_lab_supervisor_identity", None),
            lambda r, s, p, m: setattr(m, "last_lab_supervisor_identity", {}),
            lambda r, s, p, m: s["workerIdentity"].update(ppid=424244),
            lambda r, s, p, m: s.update(ownedGroupCleanupConfirmed=False),
            lambda r, s, p, m: s.update(lockReleased=False),
            lambda r, s, p, m: s["workerExit"].update(signal="SIGTERM"),
            lambda r, s, p, m: s["workerClose"].pop("signal"),
            lambda r, s, p, m: setattr(m, "tamper_result_hash", True),
            lambda r, s, p, m: r.update(walletBrowserEvmFlowCompleted=False, walletSdkEvmFlowCompleted=True),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                code, summary = self.exercise("browser", change)
                self.assertEqual(code, 1); self.assertFalse(summary["accepted"])
                self.assertTrue(any(value is False for value in summary["receiptChecks"].values()))
        for missing in ("result", "resources", "source-pins"):
            with self.subTest(missing=missing):
                code, summary = self.exercise("browser", missing=missing)
                self.assertEqual(code, 1); self.assertFalse(summary["accepted"])
                self.assertIn(missing, summary["evidenceReadFailures"])

    def test_browser_f_requires_its_own_original_format_completion_and_joins(self):
        changes = [
            lambda r, s, p, m: r.update(walletBrowserTimeoutFRecoveryCompleted=False, actualTimeoutFRecoveryAcceptance=True),
            lambda r, s, p, m: r.update(format="FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_RESULT_V1"),
            lambda r, s, p, m: r.update(format="FLAT_MANUAL_WALLET_BROWSER_ACCEPTANCE_RESULT_V1"),
            lambda r, s, p, m: s.update(format="FLAT_MANUAL_WALLET_TIMEOUT_RECOVERY_RESOURCES_V1"),
            lambda r, s, p, m: s.update(resultAccepted=False),
            lambda r, s, p, m: s.update(sourceClosureUnchanged=False),
            lambda r, s, p, m: setattr(m, "tamper_result_hash", True),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                code, summary = self.exercise("browser-recovery", change)
                self.assertEqual(code, 1); self.assertFalse(summary["accepted"])
                self.assertEqual(summary["format"], "LIANUM_DEVELOPMENT_EVM_BROWSER_TIMEOUT_RECOVERY_V1")
        code, summary = self.exercise("browser-recovery")
        self.assertEqual(code, 0); self.assertTrue(summary["accepted"])
        self.assertTrue(summary["walletBrowserTimeoutFRecoveryCompleted"])
        self.assertFalse(summary["walletBrowserEvmFlowCompleted"])
        self.assertIn("Scripted production DOM only", summary["limitations"][-1])

    def test_corrupt_proof_rows_preserve_failure_without_inventing_a_zero_count(self):
        for value in (None, {}, "corrupt", [None], [{"relation": 17}]):
            with self.subTest(value=value):
                code, summary = self.exercise("browser", lambda r, s, p, m: r.update(proofs=value))
                self.assertEqual(code, 1); self.assertFalse(summary["accepted"])
                self.assertFalse(summary["receiptChecks"]["proofRowsTyped"])
                self.assertIsNone(summary["realProofCount"])
                self.assertEqual(summary["proofRelations"], [])
                self.assertEqual(summary["proofHashes"], [])


if __name__ == "__main__":
    unittest.main()
