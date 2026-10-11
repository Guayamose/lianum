#!/usr/bin/env python3
"""Clean rebuildable local data and compact history without changing the product."""
import argparse
from bisect import bisect_left
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone

from local_resources import cache_paths

ROOT = Path(__file__).resolve().parents[2]
HISTORY = ROOT / '.local/history'
KEEP_DRAFTS = (
    '.internal/dev/drafts/continuous-networks-v1/spl-source-mobile-economic-v4',
    '.internal/dev/drafts/continuous-networks-v1/spl-source-mobile-sdk-ui-v4',
)
RECENT_REPORTS = (
    'source-proof-checkpoint-host-v2-*',
    'paged-library-runtime-guard-host-v3-*',
    'bsc-durable-primary-cause-host-v3-*',
    'original-uniswap-source-two-hard-exit-current-checkpoint-v44-*',
    'mobile-android-paged-custody-original-holder-result-waits-current-bundle-joins-v41-*',
)
GROUPS = ('drafts', 'reports', 'snapshots')
ALLOWED = {
    'drafts': '.internal/dev/drafts/',
    'reports': '.internal/dev/reports/',
    'snapshots': '.internal/runtime/omnichain-product/.local/integrations/',
}


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def physical(path):
    path = Path(path)
    if not path.is_relative_to(ROOT) or path == ROOT or path.resolve() != path:
        raise RuntimeError('Refusing an aliased path or a path outside the project')
    return path


def tracked():
    raw = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT)
    return {ROOT / os.fsdecode(p) for p in raw.split(b'\0') if p}


def references(files):
    """Keep exact links, rather than every historical directory mentioned."""
    result = set()
    expression = re.compile(r'\.internal/dev/(?:drafts|reports)/[A-Za-z0-9_./-]+')
    for path in files:
        if path.suffix not in {'.md', '.mjs', '.py', '.json', '.ts', '.tsx'}:
            continue
        if not path.is_file():
            continue
        for value in expression.findall(path.read_text(errors='replace')):
            destination = ROOT / value.rstrip('/')
            if not destination.exists() or destination.resolve() != destination:
                continue
            if destination.is_file() or len(Path(value).parts) > 4:
                result.add(destination)
    return result


def retired_children(directory, keep):
    """Select disjoint roots while retaining ancestors of protected files."""
    selected = []
    if not directory.is_dir():
        return selected
    keep = tuple(item for item in keep if item == directory or item.is_relative_to(directory))

    def visit(path):
        if any(path == item or path.is_relative_to(item) for item in keep):
            return
        if any(item.is_relative_to(path) for item in keep):
            if path.is_dir() and not path.is_symlink():
                for child in sorted(path.iterdir()):
                    visit(child)
        else:
            selected.append(path)

    for child in sorted(directory.iterdir()):
        visit(child)
    return selected


def allocated(paths):
    if not paths:
        return 0
    raw = subprocess.check_output(['du', '-x', '-B1', '-s', '--', *map(str, paths)], text=True)
    return sum(int(line.split('\t', 1)[0]) for line in raw.splitlines())


def canonical_staging_is_redundant():
    report = ROOT / '.internal/dev/reports/canonical-root.json'
    if not report.is_file():
        return False
    data = json.loads(report.read_text())
    directory = Path(data['root'])
    if directory != Path('/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655'):
        return False
    if directory.resolve() != directory or not directory.is_dir():
        return False
    for row in data['files']:
        path = directory / row['path']
        if (path.resolve() != path or not path.is_file() or
                path.stat().st_size != row['bytes'] or sha(path) != row['sha256']):
            return False
    return True


def plan(scope="all"):
    if scope not in {"all", "caches", "history"}:
        raise ValueError("Unknown cleanup scope")
    versioned = tracked()
    keep = references(versioned) | versioned | {ROOT / p for p in KEEP_DRAFTS}
    reports = ROOT / '.internal/dev/reports'
    if reports.is_dir():
        # Tool/restoration summaries, including workspace-build, remain live.
        keep.update(p for p in reports.iterdir() if p.is_file())
        for pattern in RECENT_REPORTS:
            keep.update(reports.glob(pattern))
    archives = {name: [] for name in GROUPS}
    archives['drafts'] = retired_children(ROOT / '.internal/dev/drafts', keep)
    archives['reports'] = retired_children(reports, keep)
    integrations = ROOT / ALLOWED['snapshots']
    if integrations.is_dir():
        for pattern in ('*/reopen-state-*.json', '*/wrapped-runtime-capture.json'):
            archives['snapshots'].extend(p for p in integrations.glob(pattern)
                                         if p.is_file() and not p.is_symlink())
    remove = []
    dev = ROOT / '.internal/dev'
    for pattern in ('clean-ci-*', 'clean-checkout-*', 'audit-base-shadow-*',
                    'metrics-shadow-*', 'sql-timeout-checkpoint-*'):
        remove.extend(dev.glob(pattern))
    for name in ('component-organization-backup', 'cloud-install-smoke', 'browser-rehearsal'):
        remove.append(dev / name)
    remove.extend(cache_paths(ROOT))
    # Incomplete V3 builds are temporary; .bsc-build-* keeps the required venv.
    remove.extend((ROOT / '.local/dependencies/bsc-posav1').glob('.native-v3-build-*'))
    staging = dev / 'i84-public-staging'
    if staging.exists() and canonical_staging_is_redundant():
        remove.append(staging)
    remove = sorted({p for p in remove if p.exists()})
    if scope == "caches":
        archives = {name: [] for name in GROUPS}
        allowed = set(cache_paths(ROOT))
        remove = [path for path in remove if path in allowed]
    elif scope == "history":
        remove = []
    versioned_names = sorted(str(path) for path in versioned)
    for p in remove + [p for values in archives.values() for p in values]:
        physical(p)
        prefix = str(p) + os.sep
        index = bisect_left(versioned_names, prefix)
        if p in versioned or (index < len(versioned_names) and versioned_names[index].startswith(prefix)):
            raise RuntimeError('A cleanup candidate contains versioned files')
    return archives, remove


def ensure_stopped(paths):
    """A cleanup may not race a process using one of its selected trees."""
    runtime = ROOT / '.internal/runtime'
    encoded_paths = [os.fsencode(path) for path in paths]
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        try:
            cwd = (proc / 'cwd').resolve(strict=True)
            args = (proc / 'cmdline').read_bytes().split(b'\0')
        except (OSError, RuntimeError):
            continue
        if cwd.is_relative_to(runtime) or any(cwd == p or cwd.is_relative_to(p) for p in paths):
            raise RuntimeError('A local process is using a cleanup directory; stop it first')
        if any(arg.startswith(os.fsencode(runtime) + b'/') for arg in args):
            raise RuntimeError('A runtime process is still running; stop it first')
        if any(arg == path or arg.startswith(path + b'/')
               for arg in args for path in encoded_paths):
            raise RuntimeError('A local process is using a cleanup directory; stop it first')


def archive_files(paths):
    for path in paths:
        if path.is_dir():
            for parent, dirs, files in os.walk(path, followlinks=False):
                for name in files:
                    yield Path(parent) / name
                for name in dirs:
                    p = Path(parent) / name
                    if p.is_symlink():
                        yield p
        else:
            yield path


def make_archive(output, paths):
    rows = []
    with output.open('xb') as raw:
        os.chmod(output, 0o600)
        with gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=1, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', dereference=True) as tar:
                for path in archive_files(paths):
                    relative = path.relative_to(ROOT).as_posix()
                    before = path.lstat()
                    if path.is_symlink():
                        target = os.readlink(path)
                        member = tarfile.TarInfo(relative)
                        member.type = tarfile.SYMTYPE
                        member.linkname = target
                        member.mode = before.st_mode & 0o777
                        member.mtime = before.st_mtime
                        tar.addfile(member)
                        rows.append({'path': relative, 'link': target})
                        continue
                    if not path.is_file():
                        raise RuntimeError('Unsupported entry in development history')
                    digest = sha(path)
                    tar.add(path, arcname=relative, recursive=False)
                    after = path.stat()
                    if any(getattr(before, field) != getattr(after, field)
                           for field in ('st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')):
                        raise RuntimeError('History changed during backup')
                    rows.append({'path': relative, 'bytes': before.st_size,
                                 'mode': before.st_mode & 0o777, 'sha256': digest})
        raw.flush()
        os.fsync(raw.fileno())
    # Verify every archived byte before any original is removed.
    expected = {row['path']: row for row in rows}
    with tarfile.open(output, 'r|gz') as tar:
        for member in tar:
            row = expected.pop(member.name)
            if 'link' in row:
                if not member.issym() or member.linkname != row['link']:
                    raise RuntimeError('Archived link differs')
            else:
                stream = tar.extractfile(member)
                if (not member.isfile() or member.size != row['bytes'] or
                        hashlib.file_digest(stream, 'sha256').hexdigest() != row['sha256']):
                    raise RuntimeError('Archived file differs')
    if expected:
        raise RuntimeError('Incomplete history archive')
    return {'file': output.name, 'sha256': sha(output), 'files': rows}


def remove_path(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    else:
        def writable_retry(function, name, _error):
            os.chmod(name, 0o700)
            function(name)
        shutil.rmtree(path, onerror=writable_retry)


def apply(archives, remove):
    paths = remove + [p for values in archives.values() for p in values]
    if not paths:
        print(json.dumps({'applied': True, 'removedRoots': 0}))
        return
    ensure_stopped(paths)
    HISTORY.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(HISTORY, 0o700)
    directory = HISTORY / ('cleanup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    directory.mkdir(mode=0o700)
    manifest = {'schema': 'LIANUM_LOCAL_CLEANUP_V1', 'root': str(ROOT),
                'archives': {}, 'removedRebuildable': [str(p.relative_to(ROOT)) for p in remove]}
    for name, selected in archives.items():
        if selected:
            print(f'Backing up and verifying {name}...', flush=True)
            manifest['archives'][name] = make_archive(directory / (name + '.tar.gz'), selected)
    with (directory / 'manifest.json').open('x') as stream:
        os.chmod(directory / 'manifest.json', 0o600)
        json.dump(manifest, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    ensure_stopped(paths)
    for path in paths:
        physical(path)
        remove_path(path)
    print(json.dumps({'applied': True, 'history': str(directory.relative_to(ROOT)),
                      'removedRoots': len(paths),
                      'backupBytes': allocated([directory])}))


def restore(group):
    histories = sorted(p for p in HISTORY.glob('cleanup-*') if (p / 'manifest.json').is_file())
    if not histories:
        raise RuntimeError('No cleanup backup exists')
    for directory in reversed(histories):
        data = json.loads((directory / 'manifest.json').read_text())
        if group in data.get('archives', {}):
            break
    else:
        raise RuntimeError('No backup has an archive for the selected group')
    if data.get('schema') != 'LIANUM_LOCAL_CLEANUP_V1' or data['root'] != str(ROOT):
        raise RuntimeError('This backup belongs to a different project')
    row = data['archives'].get(group)
    if not row:
        raise RuntimeError('This backup has no archive for the selected group')
    archive = physical(directory / row['file'])
    if sha(archive) != row['sha256']:
        raise RuntimeError('Archive checksum differs')
    expected = {r['path']: r for r in row['files']}
    # Reject conflicts before writing; a restore never replaces another file.
    for name, item in expected.items():
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts or not name.startswith(ALLOWED[group]):
            raise RuntimeError('Archive entry lies outside its history group')
        target = ROOT / rel
        if target.parent.resolve() != target.parent:
            raise RuntimeError('Restore parent is aliased')
        if 'link' in item:
            link = item['link']
            if (Path(link).is_absolute() or
                    not (target.parent / link).resolve().is_relative_to(ROOT)):
                raise RuntimeError('Restored link would leave the project')
        if target.exists() or target.is_symlink():
            if 'link' in item:
                if not target.is_symlink() or os.readlink(target) != item['link']:
                    raise RuntimeError('Restore conflicts with an existing link')
            elif target.is_symlink() or not target.is_file() or sha(target) != item['sha256']:
                raise RuntimeError('Restore conflicts with an existing file')
    # Validate the complete archive before creating any files or directories.
    unseen = dict(expected)
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            item = unseen.pop(member.name)
            if 'link' in item:
                if not member.issym() or member.linkname != item['link']:
                    raise RuntimeError('Unexpected archived link')
            elif (not member.isfile() or member.size != item['bytes'] or
                  hashlib.file_digest(tar.extractfile(member), 'sha256').hexdigest() != item['sha256']):
                raise RuntimeError('Unexpected archive member')
    if unseen:
        raise RuntimeError('Incomplete history archive')
    count = 0
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            item = expected.pop(member.name)
            target = ROOT / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            if target.parent.resolve() != target.parent:
                raise RuntimeError('Restore parent is aliased')
            if target.exists() or target.is_symlink():
                continue
            if 'link' in item:
                link = item['link']
                if (Path(link).is_absolute() or
                        not (target.parent / link).resolve().is_relative_to(ROOT)):
                    raise RuntimeError('Restored link would leave the project')
                target.symlink_to(link)
            else:
                if not member.isfile() or member.size != item['bytes']:
                    raise RuntimeError('Unexpected archive member')
                with target.open('xb') as output:
                    os.chmod(target, item['mode'])
                    shutil.copyfileobj(tar.extractfile(member), output)
                if sha(target) != item['sha256']:
                    target.unlink()
                    raise RuntimeError('Restored file checksum differs')
            count += 1
    if expected:
        raise RuntimeError('Incomplete restore')
    print(json.dumps({'restoredGroup': group, 'files': count}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true', help='Back up history, then remove selected local data')
    mode.add_argument('--restore', choices=GROUPS, help='Restore the selected group from the latest backup')
    parser.add_argument("--scope", choices=("all", "caches", "history"), default="all",
                        help="Select disposable caches, archived history, or the full conservative plan")
    args = parser.parse_args()
    if args.restore and args.scope != "all":
        parser.error("--scope does not apply to restoration")
    if args.restore:
        restore(args.restore)
        return
    archives, remove = plan(args.scope)
    print(json.dumps({'preview': not args.apply, 'scope': args.scope,
                      'compact': {k: {'roots': len(v), 'diskBytes': allocated(v)} for k, v in archives.items()},
                      'rebuildable': {'roots': len(remove), 'diskBytes': allocated(remove)},
                      'retainedDrafts': list(KEEP_DRAFTS)}, ensure_ascii=False), flush=True)
    if args.apply:
        apply(archives, remove)


if __name__ == '__main__':
    main()
