"""Verify that current editable sources match the prepared compatibility runtime."""
import argparse
import json
from workspace import ROOT, RUNTIME, DEV, digest, layout, physical


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tracked-delivery', action='store_true', help=argparse.SUPPRESS)
    parser.parse_args()
    config = layout()
    current = json.loads((DEV / 'reports/workspace-build.json').read_text())['files']
    sources = set()
    for relative, row in current.items():
        source = physical(ROOT / row['source'])
        if row['source'] in sources or not source.is_file():
            raise RuntimeError('Missing or duplicated editable source: ' + row['source'])
        sources.add(row['source'])
        target = physical(RUNTIME / relative)
        if not target.is_file() or digest(source) != row['sourceSHA256'] or digest(target) != row['sha256']:
            raise RuntimeError('Prepared runtime differs from editable source: ' + row['source'])
    report = {'schema': 'LIANUM_LAYOUT_VERIFICATION_V2', 'status': 'PASS',
              'editableSourceFiles': len(sources), 'physicalFiles': True,
              'runtimeSynchronized': True, 'frozenDeliveryRequired': False}
    (DEV / 'reports/layout.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'PASS: {len(sources)} current source files; prepared runtime synchronized.')


if __name__ == '__main__':
    main()
