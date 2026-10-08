"""Synthetic receipt joins only; no proof, chain, signing or fence acceptance."""
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


class BtcSolSummary(unittest.TestCase):
    def exercise(self, mutate=None, code=0, missing=None, malformed=None, interrupted=False):
        spec = importlib.util.spec_from_file_location("btc_sol_summary", HERE / "btc_sol_lab.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        run_id = "11111111-1111-4111-8111-111111111111"
        pid, worker = 424242, 424243
        identity = {"pid": pid, "ppid": os.getpid(), "pgrp": os.getpgrp(), "session": os.getsid(0), "startTimeTicks": "1234"}
        binding = {"supervisorPID": pid, "workerPID": worker}
        sources = {"format": "SYNTHETIC_BTC_SOL_SOURCE_METADATA", "local": []}
        proofs = []
        for relation, count in module.RELATIONS.items():
            for index in range(count):
                number = len(proofs) + 1
                attempt_id = f"22222222-2222-4222-8222-{number:012d}"
                evidence = {"resourceReceiptCompleted": True, "selfVerified": True,
                    "manifestSHA256": "a" * 64, "resultSHA256": "b" * 64, "resourcesSHA256": "c" * 64}
                if relation == "withdraw_balance":
                    evidence.pop("selfVerified")
                    evidence.update(id=attempt_id, acceptedResult=True, telemetrySHA256="d" * 64,
                        purpose="owner" if index == 0 else "recipient")
                else:
                    evidence["runId"] = attempt_id
                if relation == "native_claim_ingress_v3":
                    evidence.update(sourceVersion="65d4737a5da725dc9b73998f240c02346ae50db1731a652feb55071f2ed0d555",
                        keySHA256="11682686c16db1276738b60ad906560a58ddf18183acf7ec5fb40f99474d8f6f")
                if relation == "native_claim_discharge":
                    evidence["keySHA256"] = "0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83"
                proofs.append({"relation": relation, "proofSHA256": f"{number:064x}",
                    "publicInputsSHA256": f"{number + 100:064x}", "evidence": evidence})
        cleanup = {key: True for key in ("closedEvm", "closedBitcoin", "closedSolana", "closedController", "closedKeeper")}
        cleanup["errors"] = []
        result = {"format": module.RESULT_FORMAT, "profile": module.PROFILE, "runId": run_id,
            "phase": "completed", "success": True, "sourceUnchanged": True, "localOnly": True,
            "fakeFundsOnly": True, "publicNetwork": False, "sourcePins": copy.deepcopy(sources),
            "supervisor": binding, "cleanup": cleanup, "proofs": proofs, "selectedAssets": [0],
            "graphExecutionEstablished": True, "nativeSelfCustody": False, "independentOperators": False,
            "nativeProcessRestartEstablished": False, "keeperLossRecoveryEstablished": False, "fullWalletAcceptance": False,
            "nativeEffects": {"bitcoin": 3, "solana": 0, "graphBitcoin": 0, "graphSolana": 1, "eachBroadcastOnce": True},
            "redemptions": [{"assetIndex": 0, "amount": "80000", "role": "change", "status": "DISCHARGED", "duplicateNoEffect": True},
                {"assetIndex": 0, "amount": "20000", "role": "solver", "status": "DISCHARGED", "duplicateNoEffect": True}]}
        resources = {"format": module.RESOURCES_FORMAT, "runId": run_id, "phase": "completed",
            "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False, "failure": None, "failures": [],
            "sourceClosureUnchanged": True, "sourcePins": copy.deepcopy(sources), "supervisorPID": pid, "workerPID": worker,
            "supervisorIdentity": copy.deepcopy(identity), "workerIdentity": {"pid": worker, "ppid": pid,
                "pgrp": worker, "session": worker, "startTimeTicks": "1235"}, "ownedProcessGroup": worker,
            "resultAccepted": True, "ownedGroupCleanupConfirmed": True, "lockReleased": True, "withinTotalDeadline": True,
            "workerSpawned": True, "workerExitObserved": True, "workerCloseObserved": True,
            "workerExit": {"code": 0, "signal": None}, "workerClose": {"code": 0, "signal": None},
            "workerResult": {"format": result["format"], "runId": run_id, "phase": "completed", "success": True,
                "scope": module.PROFILE, "localOnly": True, "fakeFundsOnly": True, "publicNetwork": False,
                "supervisor": copy.deepcopy(binding), "cleanup": {key: True for key in ("closedEvm", "closedBitcoin", "closedSolana")},
                "btcCustodialIngress": True, "paegGraphExecution": True, "originalPrivateNoteExit": True,
                "nativePayoutAndDischarge": True, "duplicateNoEffect": True, "actualFRecoveryAcceptance": False,
                "evmVaultAcceptance": False, "browserVisualAcceptance": False, "fullWalletAcceptance": False}}
        with tempfile.TemporaryDirectory(prefix="btc-sol-summary-host-") as temporary:
            module.ROOT = Path(temporary)
            module.FLAT = module.ROOT / "runtime"
            module.DEV = module.ROOT / "dev"
            module.DIRECTORY = module.FLAT / ".local/development-btc-sol-graph-v1"
            module.interrupted = interrupted
            attempt = module.DIRECTORY / ("attempt-" + run_id)
            attempt.mkdir(parents=True, mode=0o700)
            captured = copy.deepcopy(identity)
            if mutate:
                mutate(result, resources, sources, captured)
            payloads = {"result": json.dumps(result).encode(), "source-pins": json.dumps(sources).encode()}
            resources["sourcePinsSHA256"] = hashlib.sha256(payloads["source-pins"]).hexdigest()
            resources["workerResult"].update({"path": str((attempt / "result.json").relative_to(module.FLAT)),
                "bytes": len(payloads["result"]), "sha256": hashlib.sha256(payloads["result"]).hexdigest()})
            if resources.pop("syntheticTamperHash", False):
                resources["workerResult"]["sha256"] = "f" * 64
            payloads["resources"] = json.dumps(resources).encode()
            if malformed:
                name, content = malformed
                payloads[name] = content
            for name, content in payloads.items():
                if name != missing:
                    path = attempt / (name + ".json")
                    path.write_bytes(content)
                    path.chmod(0o600)
            original = {path: path.read_bytes() for path in attempt.iterdir()}
            with redirect_stdout(io.StringIO()):
                try:
                    module.retain_summary(attempt, pid, code, captured)
                    rejected = False
                except SystemExit:
                    rejected = True
            summary = json.loads((module.DEV / "reports/btc-sol-lab.json").read_text())
            self.assertEqual({path: path.read_bytes() for path in attempt.iterdir()}, original,
                "Original accepted/rejected attempt bytes must never be rewritten")
            return rejected, summary

    def test_accepts_sixteen_joined_original_receipts_only_for_the_fixed_cross_profile(self):
        rejected, summary = self.exercise()
        self.assertFalse(rejected)
        self.assertTrue(summary["accepted"])
        self.assertEqual(summary["realProofCount"], 16)
        self.assertTrue(all(summary["receiptChecks"].values()))
        self.assertFalse(summary["fullWalletAcceptance"])
        self.assertFalse(summary["nativeSelfCustody"])

    def test_rejects_nonzero_exit_interrupt_or_failed_crossed_identity_byte_source_and_cleanup_joins(self):
        changes = [
            lambda r, s, p, i: r.update(phase="failed", success=False, errorCode="CLAIM_OPERATOR_AUDIT_TOO_OLD"),
            lambda r, s, p, i: s.update(phase="failed", failure="SYNTHETIC_FAILURE", failures=["SYNTHETIC_FAILURE"]),
            lambda r, s, p, i: s.pop("failure"),
            lambda r, s, p, i: r.update(sourceUnchanged=False),
            lambda r, s, p, i: s.update(sourceClosureUnchanged=False),
            lambda r, s, p, i: p.update(local=[{"path": "tampered.mjs"}]),
            lambda r, s, p, i: s.update(runId="33333333-3333-4333-8333-333333333333"),
            lambda r, s, p, i: s.update(supervisorPID=999999),
            lambda r, s, p, i: s["supervisorIdentity"].update(startTimeTicks="9999"),
            lambda r, s, p, i: i.clear(),
            lambda r, s, p, i: s["workerIdentity"].update(pgrp=999999),
            lambda r, s, p, i: s["workerExit"].update(signal="SIGTERM"),
            lambda r, s, p, i: s["workerClose"].pop("signal"),
            lambda r, s, p, i: s.update(syntheticTamperHash=True),
            lambda r, s, p, i: s.update(lockReleased=False),
            lambda r, s, p, i: s.update(ownedGroupCleanupConfirmed=False),
            lambda r, s, p, i: r["cleanup"].update(closedBitcoin=False),
            lambda r, s, p, i: s["workerResult"].update(scope="FRESH_BTC_SOL_CUSTODIAL_PRIVATE_CLAIM_ROUNDTRIPS_V1"),
            lambda r, s, p, i: r.update(fullWalletAcceptance=True),
            lambda r, s, p, i: r["nativeEffects"].update(bitcoin=4),
            lambda r, s, p, i: r["redemptions"][1].update(status="UNKNOWN"),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                rejected, summary = self.exercise(change)
                self.assertTrue(rejected)
                self.assertFalse(summary["accepted"])
        for code in (1, -15, None, True):
            rejected, summary = self.exercise(code=code)
            self.assertTrue(rejected)
            self.assertFalse(summary["receiptChecks"]["supervisorExitZero"])
        rejected, summary = self.exercise(interrupted=True)
        self.assertTrue(rejected)
        self.assertFalse(summary["receiptChecks"]["cliNotInterrupted"])

    def test_rejects_missing_extra_reused_invented_or_unaccepted_proof_rows(self):
        changes = [
            lambda r, s, p, i: r["proofs"].pop(),
            lambda r, s, p, i: r["proofs"].append(copy.deepcopy(r["proofs"][0])),
            lambda r, s, p, i: r["proofs"][0].update(relation="invented_relation"),
            lambda r, s, p, i: r["proofs"][0].update(proofSHA256=r["proofs"][1]["proofSHA256"]),
            lambda r, s, p, i: r["proofs"][0]["evidence"].update(runId=r["proofs"][1]["evidence"]["runId"]),
            lambda r, s, p, i: r["proofs"][0]["evidence"].update(resourceReceiptCompleted=False),
            lambda r, s, p, i: r["proofs"][0]["evidence"].update(selfVerified=False, acceptedResult=True),
            lambda r, s, p, i: next(row for row in r["proofs"] if row["relation"] == "withdraw_balance")["evidence"].update(acceptedResult=False, selfVerified=True),
            lambda r, s, p, i: r["proofs"][1]["evidence"].update(keySHA256="0" * 64),
            lambda r, s, p, i: r["proofs"][-1]["evidence"].update(keySHA256="0" * 64),
            lambda r, s, p, i: next(row for row in r["proofs"] if row["relation"] == "withdraw_balance")["evidence"].pop("telemetrySHA256"),
            lambda r, s, p, i: next(row for row in r["proofs"] if row["relation"] == "withdraw_balance")["evidence"].update(purpose=None),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                rejected, summary = self.exercise(change)
                self.assertTrue(rejected)
                self.assertFalse(summary["accepted"])

    def test_malformed_missing_or_untyped_evidence_retains_rejection_and_original_bytes(self):
        for value in (None, {}, "corrupt", [None], [{"relation": 17}], [{"relation": "node", "evidence": None}]):
            with self.subTest(value=value):
                rejected, summary = self.exercise(lambda r, s, p, i: r.update(proofs=value))
                self.assertTrue(rejected)
                self.assertFalse(summary["receiptChecks"]["proofRowsTyped"])
                self.assertIsNone(summary["realProofCount"])
        for name in ("result", "resources", "source-pins"):
            rejected, summary = self.exercise(missing=name)
            self.assertTrue(rejected)
            self.assertIn(name, summary["evidenceReadFailures"])
            for content in (b"broken{json", b"[]", b"null"):
                rejected, summary = self.exercise(malformed=(name, content))
                self.assertTrue(rejected)
                self.assertIn(name, summary["evidenceReadFailures"])

    def test_private_failure_details_are_not_exported_to_the_human_summary(self):
        def failure(r, s, p, i):
            r.update(phase="failed", success=False, errorCode="CLAIM_OPERATOR_AUDIT_TOO_OLD")
            r["claimRequests"] = [{"privateDiagnostics": [{"code": "CLAIM_OPERATOR_AUDIT_TOO_OLD",
                "auditBudget": {"phase": "pre-key", "elapsedMilliseconds": 30001, "limitMilliseconds": 30000}}]}]
        rejected, summary = self.exercise(failure, code=1)
        self.assertTrue(rejected)
        serialized = json.dumps(summary)
        self.assertNotIn("privateDiagnostics", serialized)
        self.assertNotIn("auditBudget", serialized)
        self.assertEqual(summary["workerFailure"], "CLAIM_OPERATOR_AUDIT_TOO_OLD")


if __name__ == "__main__":
    unittest.main()
