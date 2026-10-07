#!/usr/bin/env python3
"""Create an audited public source/dependency tree for the fixed I84 reader."""
import argparse
import json
import os
from pathlib import Path
import shutil

from setup import ROOT, PROJECT, DEV, REPORTS, checked, digest, relative_path, restoration_inventory, write_json
from restore_package import verify_freeze, destination, copy_file

ORIGINAL_ROOT = Path("/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655")


def inventory():
    rows = {}

    def add(relative, expected, size=None, mode=None):
        path = checked(PROJECT / relative_path(relative), expected, size)
        actual_mode = path.stat().st_mode & 0o777
        if mode is not None and actual_mode != mode:
            raise RuntimeError(f"Public file mode changed: {relative}")
        row = {"path": relative, "sha256": expected, "bytes": path.stat().st_size, "mode": oct(actual_mode)}
        if relative in rows and rows[relative] != row:
            raise RuntimeError(f"Public inventory disagreement: {relative}")
        rows[relative] = row

    for row in verify_freeze().values():
        add(row["path"], row["sha256"], row["bytes"], int(row["mode"], 8))
    wanted, _ = restoration_inventory()
    for rel, row in wanted.items():
        add(rel, row["sha256"], row.get("bytes"))
    package = json.loads((REPORTS / "dependency-package.json").read_text())
    for row in package["materializedFiles"]:
        add(row["path"], row["sha256"], row["bytes"])
    # Include complete authenticated npm trees, including API implementation files.
    for source, targets in [
        (DEV / "npm-proof/node_modules", ["omnichain-product/experiments/private-core-proof/node_modules",
                                         "omnichain-product/experiments/pc5-proof-probe/node_modules",
                                         "golden-overlay-v17/experiments/private-core-proof/node_modules"]),
        (DEV / "npm-solc/node_modules", ["omnichain-product/tools/solidity-js/node_modules",
                                        "golden-overlay-v17/tools/solidity-js/node_modules"]),
    ]:
        for path in source.rglob("*"):
            if not path.is_file() or path.is_symlink() or ".bin" in path.parts:
                continue
            for target in targets:
                add(str(Path(target) / path.relative_to(source)), digest(path), path.stat().st_size)
    for profile in ["omnichain-product", "golden-overlay-v17"]:
        for name in ["bn254_g1_compressed.dat", "bn254_g2.dat", "provenance.json"]:
            rel = profile + "/experiments/private-core-proof/native-notes/.local/crs/2097152/" + name
            add(rel, digest(PROJECT / rel))
    return sorted(rows.values(), key=lambda row: row["path"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ORIGINAL_ROOT)
    args = parser.parse_args()
    output = args.output.expanduser().absolute()
    if output.is_symlink() or output.resolve() != output or output == PROJECT or output.is_relative_to(PROJECT):
        raise RuntimeError("Canonical output must be a distinct physical directory")
    rows = inventory()
    expected_paths = {row["path"] for row in rows}
    if output.exists():
        if not output.is_dir():
            raise RuntimeError("Output is not a directory")
        for path in output.rglob("*"):
            if path.is_symlink() or (path.is_file() and str(path.relative_to(output)) not in expected_paths):
                raise RuntimeError(f"Unexpected existing file in public output: {path}")
        for row in rows:
            target = destination(output, row["path"])
            if os.path.lexists(target):
                checked(target, row["sha256"], row["bytes"])
                if target.stat().st_mode & 0o777 != int(row["mode"], 8):
                    raise RuntimeError(f"Existing public output mode mismatch: {target}")
    output.mkdir(parents=True, exist_ok=True)
    copied = 0
    for row in rows:
        copied += copy_file(PROJECT / row["path"], destination(output, row["path"]),
                            row["sha256"], row["bytes"], int(row["mode"], 8))
    report = {"schema": "LIANUM_CLOSED1684_PUBLIC_CANONICAL_ROOT_V1", "root": str(output),
              "literalI84Root": output == ORIGINAL_ROOT, "files": rows, "copied": copied,
              "frozenSourceFiles": 1684, "privateStateRestored": False, "activeLocksRestored": False,
              "nativeRuntimesIncluded": False, "runtimeActivated": False}
    write_json(REPORTS / ("canonical-root.json" if output == ORIGINAL_ROOT else "canonical-staging.json"), report)
    print(f"Verified {len(rows)} public files at {output}; {copied} newly copied")
    print("I84 literal location ready" if output == ORIGINAL_ROOT else "Staging only; I84 literal location remains pending")


if __name__ == "__main__":
    main()
