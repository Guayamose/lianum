"""Classify local storage without reading private files; migrate disposable caches only."""
import argparse
import fnmatch
import json
import os
from pathlib import Path
import re
import stat
import subprocess

ROOT = Path(__file__).resolve().parents[2]
POLICY = Path(__file__).with_name('local-resources.json')


def relative(value, allow_git=False):
    if not isinstance(value, str) or not value or value.startswith('/') or '\\' in value or any(
            part in {'', '.', '..'} or (part == '.git' and not allow_git) for part in value.split('/')):
        raise ValueError('Expected a local resource path')
    return value


def policy():
    data = json.loads(POLICY.read_text())
    if data.get('schema') != 'LIANUM_LOCAL_RESOURCES_V1':
        raise ValueError('Unsupported local resource policy')
    for path in data['roots']:
        relative(path)
    seen = set()
    for row in data['rules']:
        relative(row['path'])
        if row['path'] in seen or row['category'] not in data['categories']:
            raise ValueError('Ambiguous resource policy')
        seen.add(row['path'])
        if row['cleanup'] and (row['category'] != 'cache' or any(c in row['path'] for c in '*?[')):
            raise ValueError('Only exact cache paths may be cleaned automatically')
    return data


class RuleMatcher:
    """Carry only possible deeper overrides into each child directory.

    A tree with no deeper rules inherits its classification in constant time;
    package/cache files do not repeatedly test every rule in the policy.
    """
    def __init__(self, rules):
        compiled = {}
        self.rules = []
        for row in rules:
            patterns = []
            for part in row['path'].split('/'):
                if part not in compiled:
                    compiled[part] = re.compile(fnmatch.translate(part)) if any(c in part for c in '*?[') else part
                patterns.append(compiled[part])
            self.rules.append((tuple(patterns), row))

    @staticmethod
    def descend(part, depth, candidates, inherited):
        selected, remaining = None, []
        for patterns, row in candidates:
            pattern = patterns[depth]
            if not (part == pattern if isinstance(pattern, str) else pattern.match(part)):
                continue
            if len(patterns) == depth + 1:
                # Preserve the first matching rule on a same-depth tie.
                if selected is None:
                    selected = row
            else:
                remaining.append((patterns, row))
        return selected if selected is not None else inherited, remaining

    def locate(self, name):
        row, candidates = None, self.rules
        parts = relative(name, allow_git=True).split('/')
        for depth, part in enumerate(parts):
            row, candidates = self.descend(part, depth, candidates, row)
        return row, candidates, len(parts)


def classify(name, rules):
    return RuleMatcher(rules).locate(name)[0]


def cache_paths(root=ROOT):
    return [root / row['path'] for row in policy()['rules'] if row['cleanup']]


def inventory(root=ROOT, data=None):
    root = Path(root).absolute()
    if root.resolve() != root:
        raise ValueError('Aliased resource root')
    data = data or policy()
    matcher = RuleMatcher(data['rules'])
    totals = {name: {'allocatedBytes': 0, 'entries': 0} for name in data['categories']}
    seen, unknown = set(), set()
    def visit(path, name, info, row, candidates, depth):
        key = (info.st_dev, info.st_ino)
        if key in seen:
            return
        if row:
            totals[row['category']]['allocatedBytes'] += info.st_blocks * 512
            totals[row['category']]['entries'] += 1
        elif not candidates:
            # Report only the unmanaged root, not its potentially private names.
            unknown.add(name)
            return
        seen.add(key)
        if stat.S_ISDIR(info.st_mode):
            with os.scandir(path) as entries:
                for entry in sorted(entries, key=lambda entry: entry.name):
                    child, descendants = matcher.descend(entry.name, depth, candidates, row) if candidates else (row, ())
                    visit(entry.path, name + '/' + entry.name, entry.stat(follow_symlinks=False), child, descendants, depth + 1)
    for name in data['roots']:
        path = root / name
        if path.parent.resolve() != path.parent:
            raise ValueError('Aliased resource parent: ' + name)
        if path.exists() or path.is_symlink():
            row, candidates, depth = matcher.locate(name)
            visit(path, name, path.lstat(), row, candidates, depth)
    return {'schema': 'LIANUM_LOCAL_RESOURCE_INVENTORY_V1', 'categories': totals,
            'unclassifiedRoots': sorted(unknown), 'privateContentsRead': False,
            'scope': 'Allocated disk blocks, hardlinks counted once, symlinks never followed. Unknown trees are preserved.'}


def ensure_untracked(root, plans):
    paths = [row[key] for row in plans for key in ('from', 'to')]
    if not paths:
        return
    result = subprocess.run(['git', '--literal-pathspecs', 'ls-files', '-z', '--', *paths],
                            cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise ValueError('Cache migration requires a readable Git index')
    if result.stdout:
        raise ValueError('Cache migration contains versioned paths')


def migrate_caches(root=ROOT, apply=False):
    root = Path(root).absolute()
    if root.resolve() != root:
        raise ValueError('Only a physical repository root may migrate caches')
    data = policy()
    plans, identities = [], {}
    for row in data['migrations']:
        source, target = root / relative(row['from']), root / relative(row['to'])
        if not source.exists() and not source.is_symlink():
            continue
        for path in (source, target):
            rule = classify(path.relative_to(root).as_posix(), data['rules'])
            if not rule or not rule['cleanup'] or rule['path'] != path.relative_to(root).as_posix() or path.resolve() != path:
                raise ValueError('Only physical disposable caches may be migrated')
        if target.exists():
            raise ValueError('Cache destination already exists; no merge or overwrite: ' + row['to'])
        plans.append(row)
        info = source.lstat()
        identities[row['from']] = (info.st_dev, info.st_ino)
    ensure_untracked(root, plans)
    if apply and plans:
        # Reuse the process fence; it checks paths/arguments, never private bytes.
        from clean import ensure_stopped
        ensure_stopped([root / row[key] for row in plans for key in ('from', 'to')])
        for row in plans:
            source, target = root / row['from'], root / row['to']
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if source.resolve() != source or target.resolve() != target or target.exists():
                raise ValueError('Cache paths changed during migration')
            info = source.lstat()
            if identities[row['from']] != (info.st_dev, info.st_ino):
                raise ValueError('Cache source changed during migration')
            ensure_untracked(root, [row])
            # Same-filesystem rename keeps bytes and metadata, without copies or links.
            source.rename(target)
    return {'applied': apply, 'migrations': plans, 'privateStateChanged': False}


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', choices=('status', 'check', 'migrate-caches'), default='status')
    parser.add_argument('--json', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args(arguments)
    if args.apply and args.action != 'migrate-caches':
        parser.error('--apply requires migrate-caches')
    result = migrate_caches(apply=args.apply) if args.action == 'migrate-caches' else inventory()
    if args.json or args.action == 'migrate-caches':
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        for name, row in result['categories'].items():
            print(f"{name:16} {row['allocatedBytes'] / 1024**3:8.3f} GiB  {policy()['categories'][name]}")
        print('Unknown resource roots (preserved): ' + str(len(result['unclassifiedRoots'])))
        for name in result['unclassifiedRoots']:
            print('  ' + name)
    return 1 if args.action == 'check' and result['unclassifiedRoots'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
