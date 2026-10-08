"""Synthetic immutable receipt joins; no original native audit result claimed."""
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


class EmptyAuditSummary(unittest.TestCase):
    def exercise(self, mutate=None, code=0, interrupted=False):
        spec = importlib.util.spec_from_file_location('empty_audit_summary', HERE / 'empty_audit_lab.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        run_id = '11111111-1111-4111-8111-111111111111'
        pid, worker = 424242, 424243
        identity = {'pid': pid, 'ppid': os.getpid(), 'pgrp': os.getpgrp(), 'session': os.getsid(0), 'startTimeTicks': '1234'}
        binding = {'supervisorPID': pid, 'workerPID': worker}
        sources = {'format': 'EXPLICIT_SYNTHETIC_EMPTY_AUDIT_METADATA', 'local': []}
        before = {}
        for branch in ('claim', 'graph'):
            row = {'schema': branch.upper() + '_PRIVATE_AUDIT_ACTIVITY_V1',
                'epochScope': 'ORIGINAL_CLAIM_V4_KEY_LEASES_ONLY' if branch == 'claim' else 'ORIGINAL_GRAPH_SIGNING_NOTIFICATIONS',
                'originalHistoriesMeasured': True, 'totalKeyInvocationsMeasured': False, 'keyUseEpoch': 0,
                'authorizationCount': 0, 'signedAuthorizationCount': 0, 'factCount': 0, 'signedFactCount': 0,
                'busy': False, 'branchClosed': False, 'branchPoisoned': False, 'custodyClosed': False, 'custodyPoisoned': False}
            if branch == 'claim':
                row['retainedBindingCount'] = 0
            before[branch] = [copy.deepcopy(row) for _ in range(4)]
        cleanup = {'closedEvm': True, 'closedBitcoin': True, 'closedSolana': True, 'errors': []}
        result = {'format': module.RESULT_FORMAT, 'profile': module.PROFILE, 'runId': run_id,
            'phase': 'completed', 'success': True, 'sourceUnchanged': True, 'sourcePins': copy.deepcopy(sources),
            'supervisor': binding, 'localOnly': True, 'fakeFundsOnly': True, 'publicNetwork': False,
            'validationScope': 'BASE_EMPTY_AUDIT_MEASURED', 'proofs': [], 'ownersCreated': 0, 'proofAttemptsUnchanged': True,
            'loadedEquivalence': False, 'financialAcceptance': False, 'fullWalletAcceptance': False,
            'nativeSelfCustody': False, 'independentOperators': False, 'payoutAuthorizationReproduced': False,
            'nativeEffects': {'bitcoin': 0, 'solana': 0, 'graphBitcoin': 0, 'graphSolana': 0}, 'evmTransactionsAfterSetup': 0,
            'calls': [{'label': label, 'completed': True, 'wallMilliseconds': 2.5, 'processCpuMicroseconds': 1000,
                'cpuScope': 'PROCESS_INTERVAL_INCLUDES_SIBLING_WORK'} for label in module.ORDER],
            'activity': {'scope': 'ORIGINAL_V4_EPOCH_AND_PERSISTED_HISTORIES_ONLY', 'originalHistoriesMeasured': True,
                'totalKeyInvocationsMeasured': False, 'before': before, 'after': copy.deepcopy(before)}, 'cleanup': cleanup,
            'unprojectedPrivateValue': 'TEST_SECRET_NEVER_DISCLOSED'}
        resources = {'format': module.RESOURCES_FORMAT, 'runId': run_id, 'phase': 'completed', 'failure': None, 'failures': [],
            'sourceClosureUnchanged': True, 'sourcePins': copy.deepcopy(sources), 'supervisorPID': pid, 'workerPID': worker,
            'supervisorIdentity': copy.deepcopy(identity), 'workerIdentity': {'pid': worker, 'ppid': pid,
                'pgrp': worker, 'session': worker, 'startTimeTicks': '1235'}, 'ownedProcessGroup': worker,
            'localOnly': True, 'fakeFundsOnly': True, 'publicNetwork': False, 'resultAccepted': True,
            'ownedGroupCleanupConfirmed': True, 'lockReleased': True, 'withinTotalDeadline': True,
            'workerSpawned': True, 'workerExitObserved': True, 'workerCloseObserved': True,
            'workerExit': {'code': 0, 'signal': None}, 'workerClose': {'code': 0, 'signal': None},
            'workerResult': {'format': module.RESULT_FORMAT, 'runId': run_id, 'phase': 'completed', 'success': True,
                'localOnly': True, 'fakeFundsOnly': True, 'publicNetwork': False, 'scope': module.PROFILE,
                'supervisor': binding, 'cleanup': copy.deepcopy(cleanup), 'originalAuditCalls': 6, 'proofs': 0,
                'originalV4EpochDelta': 0, 'newPersistedAuthorizations': 0, 'newPersistedFacts': 0,
                'totalKeyInvocationsMeasured': False, 'loadedEquivalence': False, 'financialAcceptance': False}}
        with tempfile.TemporaryDirectory(prefix='empty-audit-summary-') as temporary:
            module.ROOT = Path(temporary)
            module.DEV = module.ROOT / 'dev'
            module.FLAT = module.ROOT / 'flat'
            module.DIRECTORY = module.FLAT / '.local/native-claim-empty-audit-metrics-v1'
            attempt = module.DIRECTORY / ('attempt-' + run_id)
            attempt.mkdir(parents=True)
            captured = copy.deepcopy(identity)
            if mutate:
                mutate(result, resources, sources, captured)
            for name, value in [('result', result), ('source-pins', sources)]:
                path = attempt / (name + '.json')
                path.write_text(json.dumps(value))
                path.chmod(0o600)
            raw = (attempt / 'result.json').read_bytes()
            resources['workerResult'].update(path=str((attempt / 'result.json').relative_to(module.FLAT)),
                bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            resources['sourcePinsSHA256'] = hashlib.sha256((attempt / 'source-pins.json').read_bytes()).hexdigest()
            path = attempt / 'resources.json'
            path.write_text(json.dumps(resources))
            path.chmod(0o600)
            original = {path.name: path.read_bytes() for path in attempt.iterdir()}
            module.interrupted = interrupted
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                try:
                    module.retain_summary(attempt, pid, code, captured)
                    rejected = False
                except SystemExit:
                    rejected = True
            summary = json.loads((module.DEV / 'reports/empty-audit-lab.json').read_text())
            self.assertEqual(original, {path.name: path.read_bytes() for path in attempt.iterdir()})
            self.assertNotIn('TEST_SECRET_NEVER_DISCLOSED', stdout.getvalue() + json.dumps(summary))
            self.assertEqual((module.DEV / 'reports/empty-audit-lab.json').stat().st_mode & 0o077, 0)
            return rejected, summary

    def test_accepts_only_six_scoped_original_empty_audits_without_financial_claim(self):
        rejected, summary = self.exercise()
        self.assertFalse(rejected)
        self.assertTrue(summary['accepted'])
        self.assertEqual(summary['validationScope'], 'BASE_EMPTY_AUDIT_MEASURED')
        self.assertEqual(summary['originalAuditCalls'], 6)
        self.assertFalse(summary['totalKeyInvocationsMeasured'])
        self.assertFalse(summary['financialAcceptance'])
        self.assertIsNone(summary['rpcCounts'])

    def test_rejects_crossed_sources_birth_exit_close_and_lock_receipts(self):
        changes = [
            lambda r, s, p, i: r.update(phase='rejected', success=False),
            lambda r, s, p, i: s.update(failure='ORIGINAL_FAILURE', failures=['ORIGINAL_FAILURE']),
            lambda r, s, p, i: s.pop('failure'),
            lambda r, s, p, i: p.update(local=[{'path': 'changed.mjs'}]),
            lambda r, s, p, i: s['supervisorIdentity'].update(startTimeTicks='999'),
            lambda r, s, p, i: i.clear(),
            lambda r, s, p, i: s['workerIdentity'].update(pgrp=999),
            lambda r, s, p, i: s['workerClose'].pop('signal'),
            lambda r, s, p, i: s.update(lockReleased=False),
            lambda r, s, p, i: s.update(ownedGroupCleanupConfirmed=False),
            lambda r, s, p, i: r['cleanup'].update(closedSolana=False),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                rejected, summary = self.exercise(change)
                self.assertTrue(rejected)
                self.assertFalse(summary['accepted'])
        for code in (1, -15, None, True):
            rejected, _ = self.exercise(code=code)
            self.assertTrue(rejected)
        self.assertTrue(self.exercise(interrupted=True)[0])

    def test_rejects_widened_scope_new_keys_histories_proofs_owners_or_economic_effects(self):
        changes = [
            lambda r, s, p, i: r.update(loadedEquivalence=True),
            lambda r, s, p, i: r.update(financialAcceptance=True),
            lambda r, s, p, i: r.update(proofs=[{'relation': 'deposit_intent'}]),
            lambda r, s, p, i: r.update(ownersCreated=1),
            lambda r, s, p, i: r['calls'].reverse(),
            lambda r, s, p, i: r['calls'].pop(),
            lambda r, s, p, i: r['calls'][0].update(cpuScope='ACTOR_CPU'),
            lambda r, s, p, i: r['activity'].update(totalKeyInvocationsMeasured=True),
            lambda r, s, p, i: r['activity']['before']['claim'][0].update(keyUseEpoch=1),
            lambda r, s, p, i: r['activity']['before']['claim'][0].update(keyUseEpoch=False),
            lambda r, s, p, i: r['activity']['after']['graph'][1].update(signedFactCount=1),
            lambda r, s, p, i: r['activity']['before']['claim'][0].update(busy=True),
            lambda r, s, p, i: r['nativeEffects'].update(solana=1),
            lambda r, s, p, i: r.update(evmTransactionsAfterSetup=1),
            lambda r, s, p, i: s['workerResult'].update(newPersistedFacts=1),
        ]
        for index, change in enumerate(changes):
            with self.subTest(index=index):
                rejected, summary = self.exercise(change)
                self.assertTrue(rejected)
                self.assertFalse(summary['accepted'])


if __name__ == '__main__':
    unittest.main()
