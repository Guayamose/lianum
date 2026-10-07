"""Verify the physical reorganization and the archived original handoff."""
import json

from workspace import ROOT, RUNTIME, DEV, digest, layout, physical


def main():
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
    for row in manifest["files"]:
        path = physical(ROOT / original_paths[row["path"]])
        if not path.is_file() or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]:
            raise RuntimeError(f"Archived original delivery changed: {row['path']}")
        if path.stat().st_mode & 0o777 != int(row["mode"], 8):
            raise RuntimeError(f"Archived original mode changed: {row['path']}")
    report = {"schema": "LIANUM_LAYOUT_VERIFICATION_V1", "status": "PASS",
              "editableSourceFiles": len(sources), "originalDeliveryFiles": len(manifest["files"]),
              "editedSinceOriginal": changed, "removedSinceOriginal": removed,
              "physicalFiles": True, "runtimeSynchronized": True}
    (DEV / "reports/layout.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"PASS: {len(sources)} physical workspace files; {len(manifest['files'])} originals preserved.")
    if changed:
        print(f"{len(changed)} workspace sources edited since the original delivery.")


if __name__ == "__main__":
    main()
