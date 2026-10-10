#!/usr/bin/env python3
"""Run the selected existing host tests and retain their unmodified result."""
import json
from pathlib import Path
import re
import subprocess
import sys

from workspace import RUNTIME, runtime_relative, build
from source_runtime import prepare

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
]


def main():
    arguments = sys.argv[1:]
    legacy = bool(arguments and arguments[0] == '--legacy')
    if legacy:
        arguments = arguments[1:]
        build(quiet=True)
    else:
        prepare(quiet=True)
    tests = arguments or DEFAULT_TESTS
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
    result = subprocess.run([str(NODE), "--max-old-space-size=384", "--test-concurrency=1",
                             "--experimental-test-module-mocks", "--test",
                             "--test-reporter=tap", *executable_tests], cwd=FLAT if legacy else ROOT, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    REPORTS.mkdir(parents=True, exist_ok=True)
    report_name = "host-tests" if tests == DEFAULT_TESTS else "selected-host-tests"
    if legacy:
        report_name += '-legacy'
    (REPORTS / (report_name + ".log")).write_text(result.stdout)
    counts = {key: int(value) for key, value in re.findall(
        r"^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$", result.stdout, re.MULTILINE)}
    report = {"schema": "LIANUM_HOST_TEST_RESULT_V1", "status": "PASS" if result.returncode == 0 else "FAIL",
              "node": subprocess.check_output([str(NODE), "--version"], text=True).strip(),
              "exitCode": result.returncode, "testFiles": tests,
              "resolvedTestFiles": executable_tests, "counts": counts,
              "defaultSelection": tests == DEFAULT_TESTS,
              "execution": "compatibility" if legacy else "editable-sources",
              "scope": "Selected existing host tests only; not native chain or original proof acceptance"}
    (REPORTS / (report_name + ".json")).write_text(json.dumps(report, indent=2) + "\n")
    sys.stdout.write(result.stdout)
    print(f"Report: {REPORTS / (report_name + '.json')}")
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
