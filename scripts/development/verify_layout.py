"""Verify the physical reorganization and the archived original handoff."""
import argparse
import json
import subprocess

from workspace import ROOT, RUNTIME, DEV, digest, layout, physical


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tracked-delivery', action='store_true',
                        help='Check versioned originals only; explicitly exclude local reference packets.')
    args = parser.parse_args()
    config = layout()
    current = json.loads((DEV / "reports/workspace-build.json").read_text())["files"]
    sources = set()
    changed = [row["source"] for row in config["files"]
               if row["path"] in current and current[row["path"]]["sha256"] != row["sha256"]]
    removed = [row["source"] for row in config["files"] if row["path"] not in current]
    for relative, row in current.items():
        source = physical(ROOT / row["source"])
        if row["source"] in sources or not source.is_file():
            raise RuntimeError(f"Missing or duplicated editable source: {row['source']}")
        sources.add(row["source"])
        target = physical(RUNTIME / relative)
        if (not target.is_file() or digest(source) != row["sourceSHA256"]
                or digest(target) != row["sha256"]):
            raise RuntimeError(f"Internal runtime differs from editable source: {row['source']}")
    delivery = ROOT / "archive/delivery"
    manifest = json.loads((delivery / "MANIFEST.json").read_text())
    original_paths = json.loads((delivery / "original-paths.json").read_text())
    checked_rows = manifest["files"]
    excluded = []
    if args.tracked_delivery:
        tracked = set(subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT,
                                             text=True).split('\0'))
        checked_rows = []
        for row in manifest['files']:
            original = original_paths[row['path']]
            if original in tracked:
                checked_rows.append(row)
            elif original.startswith(('archive/reference/', 'archive/reviewed-packets/', 'archive/drafts/')):
                excluded.append(original)
            else:
                raise RuntimeError(f'Original required in Git is not versioned: {original}')
    for row in checked_rows:
        path = physical(ROOT / original_paths[row["path"]])
        if not path.is_file() or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]:
            raise RuntimeError(f"Archived original delivery changed: {row['path']}")
        actual_mode, original_mode = path.stat().st_mode & 0o777, int(row["mode"], 8)
        # Git retains executability, not the original owner's read/write bits.
        mode_matches = (bool(actual_mode & 0o111) == bool(original_mode & 0o111)
                        if args.tracked_delivery else actual_mode == original_mode)
        if not mode_matches:
            raise RuntimeError(f"Archived original mode changed: {row['path']}")
    report = {"schema": "LIANUM_LAYOUT_VERIFICATION_V1", "status": "PASS",
              "editableSourceFiles": len(sources), "originalDeliveryFiles": len(manifest["files"]),
              "verifiedOriginalFiles": len(checked_rows),
              "deliveryScope": "versioned-originals" if args.tracked_delivery else "complete-restored-delivery",
              "originalPermissionScope": "git-executability" if args.tracked_delivery else "exact-unix-mode",
              "excludedLocalReferences": excluded,
              "editedSinceOriginal": changed, "removedSinceOriginal": removed,
              "physicalFiles": True, "runtimeSynchronized": True}
    (DEV / "reports/layout.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"PASS: {len(sources)} physical workspace files; {len(checked_rows)} originals verified.")
    if excluded:
        print(f"Scope: versioned originals; {len(excluded)} local reference files excluded explicitly.")
    if changed:
        print(f"{len(changed)} workspace sources edited since the original delivery.")


if __name__ == "__main__":
    main()
