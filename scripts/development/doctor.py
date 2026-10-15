#!/usr/bin/env python3
"""Read installed host tools and current source pins without scanning wallet state."""
import argparse
import json
from pathlib import Path
import subprocess
from source_runtime import installation_inputs, installed, NODE
from source_pins import run as source_pins

ROOT = Path(__file__).resolve().parents[2]


def inspect_host(root=ROOT):
    checks = []
    node = Path(root) / NODE.relative_to(ROOT)
    try:
        version = subprocess.check_output([str(node), '--version'], text=True, timeout=5).strip()
        checks.append({'name': 'node', 'status': 'PASS' if version == 'v24.19.0' else 'FAIL', 'version': version})
    except (OSError, subprocess.SubprocessError):
        checks.append({'name': 'node', 'status': 'FAIL', 'next': 'python3 scripts/development/prepare-host-runtime.py'})
    try:
        inputs = installation_inputs()
        checks.append({'name': 'workspace-dependencies', 'status': 'PASS' if installed(inputs) else 'FAIL',
                       'next': './dev build'})
    except (OSError, ValueError, KeyError, SystemExit) as error:
        checks.append({'name': 'workspace-dependencies', 'status': 'FAIL', 'detail': str(error)})
    try:
        pins = source_pins('check', 'all')
        checks.append({'name': 'current-source-pins', 'status': 'PASS' if pins['status'] == 'CURRENT' else 'FAIL',
                       'next': './dev pins check --profile all --json'})
    except (OSError, ValueError, KeyError) as error:
        checks.append({'name': 'current-source-pins', 'status': 'FAIL', 'detail': str(error)})
    return {'schema': 'LIANUM_CURRENT_HOST_CHECK_V1',
            'status': 'PASS' if all(row['status'] == 'PASS' for row in checks) else 'FAIL',
            'scope': 'Installed Node, npm workspace links/dependencies and current public source pins.',
            'checks': checks, 'walletStateScanned': False, 'historicalDeliveryRequired': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    result = inspect_host()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for row in result['checks']:
            print(row['status'] + ': ' + row['name'])
        print(result['scope'])
    return 0 if result['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
