#!/usr/bin/env python3
"""Index ZIPs/directories by original public hashes, then restore matching files."""
import argparse
import hashlib
import os
from pathlib import Path
import stat
import shutil
import zipfile

from setup import DEV, OBJECTS, REPORTS, digest, restoration_inventory, restore_public, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backups", nargs="+", type=Path)
    args = parser.parse_args()
    for path in [DEV, OBJECTS, REPORTS]:
        path.mkdir(parents=True, exist_ok=True)
    wanted, _ = restoration_inventory()
    hashes = {row["sha256"] for row in wanted.values()}
    sizes = {row["bytes"] for row in wanted.values() if row.get("bytes") is not None}
    unknown_size = any(row.get("bytes") is None for row in wanted.values())
    report = {"schema": "LIANUM_PUBLIC_BACKUP_IMPORT_V1", "backups": [], "matches": [],
              "originalHashesOnly": True, "privateStateImported": False}

    def consume(source, member, stream):
        # Hash before writing: unmatched files never enter the restoration tree.
        # Archive paths are never extracted or executed.
        temp = OBJECTS / ".import.part"
        h = hashlib.sha256()
        size = 0
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
            size += len(chunk)
        sha = h.hexdigest()
        if sha not in hashes:
            return
        try:
            destination = OBJECTS / sha
            if destination.exists():
                if destination.is_symlink() or digest(destination) != sha:
                    raise RuntimeError(f"Conflicting public object: {sha}")
            else:
                stream.seek(0)
                with temp.open("wb") as target:
                    shutil.copyfileobj(stream, target, length=1024 * 1024)
                if digest(temp) != sha:
                    raise RuntimeError("Backup file changed during import")
                temp.rename(destination)
                destination.chmod(0o644)
            report["matches"].append({"backup": str(source), "member": member, "sha256": sha, "bytes": size})
        finally:
            temp.unlink(missing_ok=True)

    for source in args.backups:
        source = source.expanduser().resolve(strict=True)
        report["backups"].append(str(source))
        if source.is_dir():
            for directory, dirs, files in os.walk(source, followlinks=False):
                dirs[:] = [name for name in dirs if not (Path(directory) / name).is_symlink()]
                for name in files:
                    path = Path(directory) / name
                    if not path.is_file() or path.is_symlink():
                        continue
                    if not unknown_size and path.stat().st_size not in sizes:
                        continue
                    with path.open("rb") as stream:
                        consume(source, str(path.relative_to(source)), stream)
        else:
            with zipfile.ZipFile(source) as archive:
                for info in archive.infolist():
                    mode = info.external_attr >> 16
                    if info.is_dir() or stat.S_ISLNK(mode):
                        continue
                    if not unknown_size and info.file_size not in sizes:
                        continue
                    with archive.open(info) as stream:
                        consume(source, info.filename, stream)
    write_json(REPORTS / "backup-import.json", report)
    print(f"Matched {len(report['matches'])} original public files", flush=True)
    restore_public()


if __name__ == "__main__":
    main()
