#!/usr/bin/env python3
"""Verify an immutable remote courier with stdlib only; never import its JS."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat


def sha(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def relative(name):
    if not isinstance(name, str) or not name or '\\' in name or '\x00' in name or PurePosixPath(name).is_absolute() or any(part in {'', '.', '..'} for part in name.split('/')):
        raise ValueError('PAEG_RELEASE_RELATIVE_PATH')
    return name


def verify(root, expected):
    root = root.absolute()
    if root.is_symlink() or root.resolve() != root:
        raise ValueError('PAEG_RELEASE_ROOT_ALIAS')
    manifest_path = root / 'release-manifest.json'
    state = manifest_path.lstat()
    if not stat.S_ISREG(state.st_mode) or state.st_nlink != 1 or state.st_size > 8 * 1024 * 1024 or sha(manifest_path) != expected:
        raise ValueError('PAEG_RELEASE_MANIFEST_PIN')
    manifest = json.loads(manifest_path.read_bytes())
    if set(manifest) != {'schema', 'status', 'financialAcceptance', 'files', 'links'} or manifest['schema'] != 'LIANUM_PAEG_REMOTE_RELEASE_V1' or manifest['status'] != 'STAGING_NOT_DEPLOYED' or manifest['financialAcceptance'] is not False:
        raise ValueError('PAEG_RELEASE_MANIFEST_SCHEMA')
    if not isinstance(manifest['files'], dict) or not 1 <= len(manifest['files']) <= 50000 or not isinstance(manifest['links'], dict) or len(manifest['links']) > 128:
        raise ValueError('PAEG_RELEASE_INVENTORY_BOUND')
    candidate_path = root / 'candidate/source-bundle.json'
    candidate = json.loads(candidate_path.read_bytes())
    files, links, total = set(), {}, 0
    for parent, directories, names in os.walk(root, followlinks=False):
        for name in directories[:]:
            path = Path(parent) / name
            if path.is_symlink():
                links[path.relative_to(root).as_posix()] = os.readlink(path); directories.remove(name)
        for name in names:
            path = Path(parent) / name; relative_path = relative(path.relative_to(root).as_posix())
            state = path.lstat()
            if stat.S_ISLNK(state.st_mode):
                links[relative_path] = os.readlink(path); continue
            if relative_path == 'release-manifest.json':
                continue
            row = manifest['files'].get(relative_path)
            if not stat.S_ISREG(state.st_mode) or state.st_nlink != 1 or not isinstance(row, dict) or set(row) != {'sha256', 'bytes', 'mode'} or state.st_size != row['bytes'] or f'{stat.S_IMODE(state.st_mode):04o}' != row['mode'] or sha(path) != row['sha256']:
                raise ValueError('PAEG_RELEASE_FILE_PIN')
            files.add(relative_path); total += state.st_size
            if total > 3 * 1024 ** 3:
                raise ValueError('PAEG_RELEASE_BYTE_BOUND')
    if files != set(manifest['files']) or links != manifest['links']:
        raise ValueError('PAEG_RELEASE_CLOSED_INVENTORY')
    for path, target in links.items():
        relative(path)
        if not path.startswith('candidate/node_modules/@lianum/') or target != candidate['links'].get(path.removeprefix('candidate/')) or not (root / path).resolve().is_relative_to(root / 'candidate'):
            raise ValueError('PAEG_RELEASE_LINK')
    if candidate.get('financialAcceptance') is not False or not candidate.get('adoptedGeneration'):
        raise ValueError('PAEG_RELEASE_ADOPTION_REQUIRED')
    return {'verified': True, 'manifestSHA256': expected, 'files': len(files), 'bytes': total,
            'sourceGeneration': candidate['adoptedGeneration'], 'runtimeStarted': False,
            'proofGenerated': False, 'publicMobileIngressReady': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.directory, args.sha256), sort_keys=True))
