#!/usr/bin/env python3
"""Stream selected host tests with a deadline and a revision-bound result."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

from workspace import RUNTIME, runtime_relative, build
from source_runtime import prepare
from bounded_process import run_bounded

ROOT = Path(__file__).resolve().parents[2]
FLAT = ROOT / ".internal/runtime/omnichain-flat-profile/flat-wallet"
NODE = ROOT / ".internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node"
REPORTS = ROOT / ".internal/dev/reports"
DEFAULT_TESTS = [
    "apps/wallet/tests/server/server.test.mjs", "apps/wallet/tests/client/ui.test.mjs",
    "apps/wallet/tests/server/exact-action-capabilities.test.mjs", "apps/wallet/tests/server/public-errors.test.mjs",
    "packages/backend/tests/api/wallet/wallet-application-client.test.mjs",
    "packages/backend/tests/api/wallet/wallet-application-client.transport.test.mjs",
    "packages/backend/tests/accounts/portfolio/catalogue-owner-requests.test.mjs",
    "packages/backend/tests/execution/account/reconciliation/flat-completion-window.test.mjs",
    "packages/backend/tests/execution/account/reconciliation/failure-diagnostics.test.mjs",
    "packages/backend/tests/execution/account/execution/native-value-terminal-first.test.mjs",
    "packages/backend/tests/execution/account/reconciliation/flat-terminal-observer.test.mjs",
    "packages/backend/tests/execution/encoding/flat-pure-math-cache.test.mjs",
    'packages/backend/tests/claims/operations/original-btc-payout-completion-v3.test.mjs',
    'packages/backend/tests/accounts/authority/source-proof-receipts-v1.test.mjs',
    'packages/backend/tests/accounts/authority/native-source-kernel-composition.test.mjs',
    'packages/backend/tests/accounts/authority/native-account-kernel-isolation.test.mjs',
    'packages/backend/tests/claims/operations/device-root-spl-source-binding-v3.test.mjs',
    'packages/backend/tests/claims/recovery/device-root-claim-observation-v3.test.mjs',
    'packages/backend/tests/operations/support/wrapped-recovery-composition.test.mjs',
    'packages/backend/tests/operations/support/device-graph-recovery-contracts.test.mjs',
    'packages/engine/tests/storage/bounded-file-reader-v1.test.mjs',
    'packages/backend/tests/operations/operators/wrapped/wrapped-graph-native-queue-v4.test.mjs',
    'packages/backend/tests/api/accounts/flat-account-owner-client.test.mjs',
    'packages/backend/tests/operations/operators/wrapped/wrapped-claim-audit-diagnostics-v1.test.mjs',
    'packages/backend/tests/operations/validation/graph-facts-original-validation.test.mjs',
    'packages/backend/tests/defi/vaults/owned-backed-vault-idempotency.test.mjs',
    'packages/components/tests/plain-input.test.mjs',
    'packages/backend/tests/chains/solana/runtime/solana-payout-authority-runtime.test.mjs',
    'packages/backend/tests/chains/solana/transfers/owned-solana-payout-final-send.test.mjs',
    'packages/backend/tests/chains/solana/runtime/owned-solana-runtime.test.mjs',
    'packages/backend/tests/chains/solana/runtime/owned-solana-runtime.combined.test.mjs',
    'packages/backend/tests/chains/solana/dispatch/native-spl-custody-codec-v1.test.mjs',
    'packages/backend/tests/chains/solana/observations/jupiter-orca-swap-observation-v1.test.mjs',
]


def revision(root=ROOT):
    """Identify HEAD plus actual modified/untracked development bytes, not secrets."""
    def git(*arguments):
        return subprocess.check_output(['git', *arguments], cwd=root, stderr=subprocess.DEVNULL)
    head = git('rev-parse', 'HEAD').decode().strip()
    scopes = ['apps', 'packages', 'scripts', 'tests', 'contracts', 'infra', '.github',
              'dev', 'package.json', 'package-lock.json']
    changed = set(git('diff', '--name-only', '-z', 'HEAD', '--', *scopes).split(b'\0'))
    changed.update(git('ls-files', '--others', '--exclude-standard', '-z', '--', *scopes).split(b'\0'))
    changed.discard(b'')
    # Documentation edits do not change the code under test.
    changed = sorted(name for name in changed if not name.endswith(b'.md'))
    digest = hashlib.sha256()
    for name in changed:
        path = root / name.decode()
        digest.update(name + b'\0')
        if path.is_symlink():
            digest.update(b'LINK\0' + str(path.readlink()).encode())
        elif path.is_file():
            with path.open('rb') as stream:
                digest.update(hashlib.file_digest(stream, 'sha256').digest())
        else:
            digest.update(b'DELETED')
    return {'commit': head, 'dirty': bool(changed), 'changedFiles': [name.decode() for name in changed],
            'workingChangesSha256': digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy', action='store_true')
    parser.add_argument('--timeout', type=float, default=120,
                        help='Maximum seconds for this entire selection (default: 120)')
    parser.add_argument('tests', nargs='*')
    args = parser.parse_args()
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error('--timeout must be positive')
    legacy = args.legacy
    if legacy:
        build(quiet=True)
    else:
        prepare(quiet=True)
    tests = args.tests or DEFAULT_TESTS
    executable_tests = []
    for test in tests:
        path = ROOT / test
        if path.is_dir():
            selected = sorted(path.rglob("*.test.mjs"))
            if not selected:
                raise SystemExit(f"No test files in {test}")
            for file in selected:
                if not legacy:
                    executable_tests.append(str(file))
                    continue
                mapped = runtime_relative(str(file.relative_to(ROOT)))
                if mapped is None:
                    raise SystemExit(f"Test file is outside the runtime map: {file}")
                executable_tests.append(str(RUNTIME / mapped))
        else:
            if not legacy:
                if not path.is_file():
                    raise SystemExit(f'Test source does not exist: {test}')
                executable_tests.append(str(path))
                continue
            relative = runtime_relative(test)
            # Keep runtime-relative paths accepted for archived commands.
            executable_tests.append(str(RUNTIME / relative) if relative else test)
    executable_tests = list(dict.fromkeys(executable_tests))
    REPORTS.mkdir(parents=True, exist_ok=True)
    report_name = "host-tests" if tests == DEFAULT_TESTS else "selected-host-tests"
    if legacy:
        report_name += '-legacy'
    started_at = datetime.now(timezone.utc).isoformat()
    source_revision = revision()
    result = run_bounded([str(NODE), "--max-old-space-size=384", "--test-concurrency=1",
                          "--experimental-test-module-mocks", "--test",
                          "--test-reporter=tap", *executable_tests], cwd=FLAT if legacy else ROOT,
                         timeout_seconds=args.timeout, log_path=REPORTS / (report_name + '.log'))
    ending_revision = revision()
    source_changed = source_revision != ending_revision
    if source_changed and result['status'] == 'PASS':
        result.update(status='SOURCE_CHANGED', exitCode=2)
    counts = {key: int(value) for key, value in re.findall(
        r"^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$", result['stdout'], re.MULTILINE)}
    if result['status'] == 'PASS' and (not counts.get('pass') or counts.get('cancelled') or counts.get('fail')):
        result.update(status='NO_COMPLETE_PASS', exitCode=2)
    report = {"schema": "LIANUM_HOST_TEST_RESULT_V1", "status": result['status'],
              "node": subprocess.check_output([str(NODE), "--version"], text=True).strip(),
              "exitCode": result['exitCode'], "testFiles": tests,
              "resolvedTestFiles": executable_tests, "counts": counts,
              "defaultSelection": tests == DEFAULT_TESTS,
              "execution": "compatibility" if legacy else "editable-sources",
              "startedAt": started_at, "finishedAt": datetime.now(timezone.utc).isoformat(),
              "durationSeconds": result['durationSeconds'], "timeoutSeconds": args.timeout,
              "outputBytes": result['outputBytes'], "maxOutputBytes": result['maxOutputBytes'],
              "revision": source_revision, "revisionAtEnd": ending_revision,
              "sourceChangedDuringRun": source_changed,
              "scope": "Selected existing host tests only; not native chain or original proof acceptance"}
    (REPORTS / (report_name + ".json")).write_text(json.dumps(report, indent=2) + "\n")
    print(f"{report['status']} ({report['durationSeconds']}s): {REPORTS / (report_name + '.json')}")
    sys.exit(result['exitCode'])


if __name__ == "__main__":
    main()
