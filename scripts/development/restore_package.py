#!/usr/bin/env python3
"""Integrate the verified closed1684 public package without changing sources."""
import argparse
import json
import os
from pathlib import Path
import shutil

from setup import ROOT, PROJECT, REPORTS, checked, digest, relative_path, restore_public, write_json

PACKAGE_PIN = "38333ad78604b255e7baf4717f57972036fd0d677ac299a8eabdee05d3bab87a"
RUNTIME_MANIFEST_PIN = "3b059043c54711dd6626c201f51effbfcfddf308d777b5f6e4d0f363cffbf39c"
EXTERNAL = "omnichain-flat-profile/flat-wallet/wallet-platform/artifacts/private-external-v1"
SOLANA = "omnichain-product/.local/linux-runtimes/agave-v2.3.13-loopback-memtable128m-candidate-20261005/solana-test-validator"
TRON = "omnichain-product/.local/owned-tron-native-value-v1"


def destination(root, relative):
    target = root / relative_path(relative)
    for parent in [target, *target.parents]:
        if parent.is_symlink():
            raise RuntimeError(f"Symlink in destination: {target}")
        if parent == root:
            break
    return target


def preflight_file(source, target, sha, size=None):
    checked(source, sha, size)
    if os.path.lexists(target):
        checked(target, sha, size)


def copy_file(source, target, sha, size=None, mode=0o644):
    preflight_file(source, target, sha, size)
    if target.exists():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    target.chmod(mode)
    checked(target, sha, size)
    return True


def verify_freeze():
    freeze = json.loads((ROOT / "archive/delivery/CLOSED1684-FREEZE.json").read_text())
    for row in freeze["files"]:
        path = checked(PROJECT / relative_path(row["path"]), row["sha256"], row["bytes"])
        if path.stat().st_mode & 0o777 != int(row["mode"], 8):
            raise RuntimeError(f"Frozen source mode mismatch: {row['path']}")
    return {row["path"]: row for row in freeze["files"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("payload", type=Path)
    args = parser.parse_args()
    payload = args.payload.expanduser().resolve(strict=True)
    manifest = json.loads(checked(payload / "PACKAGE-MANIFEST.json", PACKAGE_PIN).read_text())
    for row in manifest["files"]:
        path = payload / relative_path(row["path"])
        if row["type"] != "file":
            raise RuntimeError("Unexpected package entry type")
        checked(path, row["sha256"], row["bytes"])
    frozen = verify_freeze()
    conflicts = {row["path"] for row in json.loads(
        (payload / "historical-dependency-source-conflicts.json").read_text())["files"]}
    dependency_rows = [row for row in manifest["files"]
                       if row["path"].startswith("rebuild-recipes/dependencies/")]
    plans, preserved, historical_locks = [], [], []
    for row in dependency_rows:
        rel = row["path"].removeprefix("rebuild-recipes/dependencies/")
        source = payload / row["path"]
        backup = destination(ROOT / "archive/restoration/recipes", row["path"].removeprefix("rebuild-recipes/"))
        preflight_file(source, backup, row["sha256"], row["bytes"])
        if rel.endswith("/active.lock"):
            # A failure-preservation receipt contains a historical lock file.
            # Retain its bytes in the archive only, never the execution tree.
            historical_locks.append(rel)
            plans.append((row, source, backup, None, rel))
            continue
        target = destination(PROJECT, rel)
        if target.exists() and digest(target) != row["sha256"]:
            if rel not in conflicts or rel not in frozen:
                raise RuntimeError(f"Unexpected current-source conflict: {rel}")
            preserved.append({"path": rel, "historicalSHA256": row["sha256"],
                              "currentSHA256": frozen[rel]["sha256"]})
            target = None
        elif target.exists():
            checked(target, row["sha256"], row["bytes"])
        plans.append((row, source, backup, target, rel))

    # The package's runtime inventory also covers the expanded original JDK.
    runtime_manifest = json.loads(checked(payload / "runtimes/RUNTIME-FILE-MANIFEST.json",
                                         RUNTIME_MANIFEST_PIN).read_text())
    runtime_rows = {row["path"]: row for row in runtime_manifest["files"]}
    for row in runtime_rows.values():
        path = payload / "runtimes" / relative_path(row["path"])
        if row.get("kind") == "symlink":
            if not path.is_symlink() or str(path.readlink()) != row["target"]:
                raise RuntimeError(f"Runtime link mismatch: {row['path']}")
            if not path.resolve().is_relative_to(payload / "runtimes"):
                raise RuntimeError("Runtime link escapes the package")
        else:
            checked(path, row["sha256"], row.get("bytes"))

    runtime_plans = [(runtime_rows["solana/" + SOLANA], SOLANA, 0o755)]
    prefix = "tron-v3/drafts/tron-offline-candidate-build/"
    for row in runtime_rows.values():
        if row["path"].startswith(prefix + "toolchains/jdk8u504-b01/"):
            rel = row["path"].removeprefix(prefix + "toolchains/jdk8u504-b01/")
            runtime_plans.append((row, TRON + "/jdk8/" + rel, int(row.get("mode", "0o644"), 8)))
        elif row["path"] == prefix + "build-attempt-v3/FullNode-offline.jar":
            runtime_plans.append((row, TRON + "/FullNode-offline.jar", 0o600))
        elif row["path"].startswith(prefix + "build-attempt-v3/classes/"):
            runtime_plans.append((row, TRON + "/driver/" + Path(row["path"]).name, 0o600))
    for row, rel, mode in runtime_plans:
        # JDK links are checked separately, without following them to write.
        target = PROJECT / relative_path(rel)
        if row.get("kind") == "symlink":
            destination(PROJECT, str(Path(rel).parent))
            if os.path.lexists(target) and (not target.is_symlink() or str(target.readlink()) != row["target"]):
                raise RuntimeError(f"Runtime destination link conflict: {rel}")
        else:
            destination(PROJECT, rel)
            preflight_file(payload / "runtimes" / row["path"], target, row["sha256"], row.get("bytes"))

    report = {"schema": "LIANUM_PUBLIC_PACKAGE_INTEGRATION_V1", "payloadPath": str(payload),
              "packageManifestSHA256": PACKAGE_PIN, "runtimeManifestSHA256": RUNTIME_MANIFEST_PIN,
              "verifiedPackageFiles": len(manifest["files"]), "verifiedRuntimeEntries": len(runtime_rows),
              "dependenciesCopiedToArchive": 0, "dependenciesAddedToProject": 0,
              "historicalLocksRetainedOnlyInArchive": historical_locks,
              "preservedHistoricalConflicts": preserved, "materializedFiles": [], "runtimeFiles": [],
              "sourceFilesChanged": False, "runtimeActivated": False, "privateLaboratoryRestored": False}
    for row, source, backup, target, rel in plans:
        report["dependenciesCopiedToArchive"] += copy_file(source, backup, row["sha256"], row["bytes"])
        if target is not None:
            report["dependenciesAddedToProject"] += copy_file(source, target, row["sha256"], row["bytes"])
            report["materializedFiles"].append({"path": rel, "sha256": row["sha256"], "bytes": row["bytes"]})
    # Retain manifests and assessment separately from historical delivery evidence.
    for name in ["PACKAGE-MANIFEST.json", "START-HERE.md", "OMISSIONS.json",
                 "historical-dependency-source-conflicts.json", "missing-seven-assessment.json"]:
        source = payload / name
        copy_file(source, destination(ROOT / "archive/restoration/recipes", "package-evidence/" + name), digest(source), source.stat().st_size)
    for row, rel, mode in runtime_plans:
        target = PROJECT / rel
        if row.get("kind") == "symlink":
            if not os.path.lexists(target):
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(row["target"])
            report["runtimeFiles"].append({"path": rel, "kind": "symlink", "target": row["target"]})
        else:
            copy_file(payload / "runtimes" / row["path"], target, row["sha256"], row.get("bytes"), mode)
            if target.stat().st_mode & 0o777 != mode:
                raise RuntimeError(f"Runtime destination mode mismatch: {rel}")
            report["runtimeFiles"].append({"path": rel, "sha256": row["sha256"], "bytes": row.get("bytes"), "mode": oct(mode)})
    external = PROJECT / EXTERNAL
    pins = json.loads((external / "protocol-fixture-artifact-pins.json").read_text())["files"]
    for row in pins:
        checked(external / relative_path(row["path"]), row["sha256"], row.get("bytes"))
    report["externalProtocolPinsVerified"] = len(pins)
    report["solanaCandidateRestored"] = True
    report["tronV3FilesRestored"] = True
    verify_freeze()
    write_json(REPORTS / "dependency-package.json", report)
    restore_public()
    print(f"Verified {len(manifest['files'])} package files; integrated {report['dependenciesAddedToProject']} missing dependencies")
    print(f"DeFi: {len(pins)} verified pins; Solana and Tron V3 materialized inactive")
    print(f"Preserved {len(preserved)} differing historical sources and all {len(frozen)} current source files")


if __name__ == "__main__":
    main()
