#!/usr/bin/env python3
"""Verify prepared development tools and report unrecovered original artifacts."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from setup import restoration_inventory, relative_path

ROOT = Path(__file__).resolve().parents[2]
DEV = ROOT / ".internal/dev"
PROJECT = ROOT / ".internal/runtime"
REPORTS = DEV / "reports"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def restored_artifact_path(relative, expected_hash, frozen, original_paths):
    """A restored source may evolve; its archived original must remain exact.

    Only a source explicitly present in the frozen delivery, with the same
    expected hash, qualifies. Dependency binaries and proof artifacts continue
    to be checked in the live restored tree without exceptions.
    """
    relative = Path(relative).as_posix()
    row = frozen.get(relative)
    if row and row["sha256"] == expected_hash:
        archived = original_paths.get("project/" + relative)
        if archived:
            return ROOT / archived
    return PROJECT / relative


def main():
    checks = []
    freeze = json.loads((ROOT / "archive/delivery/CLOSED1684-FREEZE.json").read_text())
    original_paths = json.loads((ROOT / "archive/delivery/original-paths.json").read_text())
    frozen_by_path = {row["path"]: row for row in freeze["files"]}
    archived_changes, changed = [], []
    for row in freeze["files"]:
        archived = ROOT / original_paths["project/" + row["path"]]
        if (not archived.is_file() or archived.is_symlink() or archived.stat().st_size != row["bytes"]
                or digest(archived) != row["sha256"] or (archived.stat().st_mode & 0o777) != int(row["mode"], 8)):
            archived_changes.append(row["path"])
        path = PROJECT / row["path"]
        if (not path.is_file() or path.is_symlink() or path.stat().st_size != row["bytes"]
                or digest(path) != row["sha256"] or (path.stat().st_mode & 0o777) != int(row["mode"], 8)):
            changed.append(row["path"])
    checks.append({"name": "frozen-source-integrity", "status": "PASS" if not archived_changes else "FAIL",
                   "files": len(freeze["files"]), "changed": archived_changes,
                   "scope": "Immutable archived delivery; working edits do not rewrite historical acceptance"})
    build_path = REPORTS / "workspace-build.json"
    build = json.loads(build_path.read_text()) if build_path.is_file() else None
    sync_errors = []
    for relative, row in (build or {}).get("files", {}).items():
        source, target = ROOT / row["source"], PROJECT / relative
        if (not source.is_file() or source.is_symlink() or not target.is_file() or target.is_symlink()
                or digest(source) != row["sourceSHA256"] or digest(target) != row["sha256"]):
            sync_errors.append(row["source"])
    checks.append({"name": "working-source-synchronization",
                   "status": "PASS" if build and not sync_errors else "FAIL", "errors": sync_errors,
                   "modifiedSinceDelivery": changed,
                   "scope": "Development source consistency only; release/proof source pins remain independently enforced"})
    node = DEV / "toolchains/node-v24.14.0-linux-x64/bin/node"
    version = subprocess.check_output([str(node), "--version"], text=True).strip() if node.is_file() else None
    checks.append({"name": "historical-lock-node", "status": "PASS" if version == "v24.14.0" else "FAIL", "version": version})
    proof_node = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
    proof_version = subprocess.check_output([str(proof_node), "--version"], text=True).strip() if proof_node.is_file() else None
    checks.append({"name": "original-proof-evidence-node", "status": "PASS" if proof_version == "v24.19.0" else "FAIL", "version": proof_version})
    package_report = REPORTS / "packages.json"
    packages = json.loads(package_report.read_text()) if package_report.is_file() else None
    errors = []
    if packages:
        for base in [DEV / "npm-proof", PROJECT / "omnichain-product/experiments/private-core-proof",
                     PROJECT / "omnichain-product/experiments/pc5-proof-probe",
                     PROJECT / "golden-overlay-v17/experiments/private-core-proof"]:
            for row in packages["packagePins"]:
                path = base / row["path"] / "package.json"
                if not path.is_file() or path.is_symlink() or digest(path) != row["sha256"]:
                    errors.append(str(path))
            for row in packages["wasmPins"]:
                path = base / row["path"]
                if not path.is_file() or path.is_symlink() or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]:
                    errors.append(str(path))
        for base in [DEV / "npm-solc", PROJECT / "golden-overlay-v17/tools/solidity-js",
                     PROJECT / "omnichain-product/tools/solidity-js"]:
            soljson = base / "node_modules/solc/soljson.js"
            if not soljson.is_file() or soljson.is_symlink() or digest(soljson) != packages["soljsonSHA256"]:
                errors.append(str(soljson))
    checks.append({"name": "npm-and-wasm", "status": "PASS" if packages and not errors else "FAIL",
                   "packagePins": len(packages["packagePins"]) if packages else 0,
                   "wasmPins": len(packages["wasmPins"]) if packages else 0, "errors": errors})
    crs_report = REPORTS / "crs.json"
    crs = json.loads(crs_report.read_text()) if crs_report.is_file() else None
    crs_errors = []
    if crs:
        for base in [DEV / "downloads", *[PROJECT / name / "experiments/private-core-proof/native-notes/.local/crs/2097152"
                                          for name in ["omnichain-product", "golden-overlay-v17"]]]:
            for filename, key in [("bn254_g1_compressed.dat", "g1"), ("bn254_g2.dat", "g2")]:
                path = base / filename
                if not path.is_file() or path.is_symlink() or path.stat().st_size != crs[key + "Bytes"] or digest(path) != crs[key + "SHA256"]:
                    crs_errors.append(str(path))
    checks.append({"name": "public-crs", "status": "PASS" if crs and not crs_errors else "FAIL", "errors": crs_errors})
    native_path = REPORTS / "native-tools.json"
    native = json.loads(native_path.read_text()) if native_path.is_file() else None
    native_errors = []
    if native:
        for name, row in native["binaries"].items():
            path = Path(row["path"])
            if not path.is_file() or digest(path) != row["sha256"]:
                native_errors.append(name)
    checks.append({"name": "evm-bitcoin-solidity-binaries", "status": "PASS" if native and not native_errors else "FAIL",
                   "errors": native_errors})
    solana_path = REPORTS / "solana-tools.json"
    solana = json.loads(solana_path.read_text()) if solana_path.is_file() else None
    solana_errors = []
    if solana:
        for name, row in solana["binaries"].items():
            path = Path(row["path"])
            if not path.is_file() or path.is_symlink() or digest(path) != row["sha256"]:
                solana_errors.append(name)
    checks.append({"name": "official-solana-cli-and-genesis", "status": "PASS" if solana and not solana_errors else "FAIL",
                   "errors": solana_errors})
    package_path = REPORTS / "dependency-package.json"
    package = json.loads(package_path.read_text()) if package_path.is_file() else None
    package_errors, runtime_errors = [], []
    if package:
        for row in package["materializedFiles"]:
            relative = relative_path(row["path"])
            path = restored_artifact_path(relative, row["sha256"], frozen_by_path, original_paths)
            if not path.is_file() or path.is_symlink() or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]:
                package_errors.append(row["path"])
        for row in package["runtimeFiles"]:
            path = PROJECT / relative_path(row["path"])
            if row.get("kind") == "symlink":
                if not path.is_symlink() or str(path.readlink()) != row["target"] or not path.resolve().is_relative_to(PROJECT):
                    runtime_errors.append(row["path"])
            elif (not path.is_file() or path.is_symlink() or digest(path) != row["sha256"]
                  or path.stat().st_mode & 0o777 != int(row["mode"], 8)):
                runtime_errors.append(row["path"])
    external = PROJECT / "omnichain-flat-profile/flat-wallet/wallet-platform/artifacts/private-external-v1"
    pins_path = external / "protocol-fixture-artifact-pins.json"
    pins = json.loads(pins_path.read_text())["files"] if pins_path.is_file() else []
    external_errors = []
    for row in pins:
        path = external / relative_path(row["path"])
        if not path.is_file() or path.is_symlink() or path.stat().st_size != row["bytes"] or digest(path) != row["sha256"]:
            external_errors.append(row["path"])
    checks.append({"name": "restored-public-package-and-defi", "status": "PASS" if package and not package_errors and len(pins) == 1862 and not external_errors else "FAIL",
                   "publicFiles": len(package["materializedFiles"]) if package else 0,
                   "sourceScope": "Frozen sources checked against archived originals; dependencies and external artifacts checked at their active paths",
                   "externalPins": len(pins), "errors": package_errors + external_errors})
    restored_path = REPORTS / "public-restoration.json"
    restored = json.loads(restored_path.read_text()) if restored_path.is_file() else {"conflicts": []}
    missing = []
    wanted, disagreements = restoration_inventory()
    for relative, row in wanted.items():
        path = PROJECT / relative
        if not path.is_file() or path.is_symlink() or digest(path) != row["sha256"]:
            missing.append({"path": relative, "sha256": row["sha256"], "bytes": row.get("bytes")})
    canonical_path = REPORTS / "canonical-root.json"
    canonical = json.loads(canonical_path.read_text()) if canonical_path.is_file() else None
    literal_root = Path("/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655")
    canonical_errors = []
    canonical_ready = bool(canonical and canonical["root"] == str(literal_root) and literal_root.is_dir()
                           and not literal_root.is_symlink() and literal_root.resolve() == literal_root)
    if canonical_ready:
        closure = {row["path"]: row for row in canonical["files"]}
        for row in freeze["files"]:
            actual = closure.get(row["path"])
            if (not actual or any(actual[key] != row[key] for key in ["sha256", "bytes"])
                    or int(actual["mode"], 8) != int(row["mode"], 8)):
                canonical_errors.append(row["path"])
        for row in canonical["files"]:
            path = literal_root / relative_path(row["path"])
            if (not path.is_file() or path.is_symlink() or path.stat().st_size != row["bytes"]
                    or digest(path) != row["sha256"] or path.stat().st_mode & 0o777 != int(row["mode"], 8)):
                canonical_errors.append(row["path"])
        canonical_ready = not canonical_errors
    blockers = [
        {"name": "original-public-artifacts", "status": "BLOCKED" if missing else "PASS", "files": len(missing)},
        {"name": "custom-solana-and-tron-original-files", "status": "PASS" if package and not runtime_errors else "BLOCKED",
         "entries": len(package["runtimeFiles"]) if package else 0, "errors": runtime_errors,
         "reason": "Exact custom Solana candidate and separate Tron V3/JDK closure, staged inactive"},
        {"name": "canonical-tron-activation", "status": "BLOCKED",
         "reason": "Current source keeps OWNED_TRON_RUNTIME_RELEASE=null; restoration does not approve activation"},
        {"name": "original-i84-canonical-root", "status": "PASS" if canonical_ready else "BLOCKED",
         "files": len(canonical["files"]) if canonical else 0, "errors": canonical_errors,
         "reason": "Audited public tree at the literal reader path; no old private laboratory identity is restored"},
        {"name": "historical-private-laboratory", "status": "UNRECOVERED",
         "reason": "Public backups do not restore original private identities or live chain databases"},
    ]
    validations = []
    for name, filename in [("development-smoke", "smoke.json"), ("selected-original-host-tests", "host-tests.json"),
                           ("restored-runtime-metadata", "restored-runtime-metadata.json"), ("restored-public-readers", "restored-readers.json")]:
        path = REPORTS / filename
        data = json.loads(path.read_text()) if path.is_file() else None
        if data and "checks" in data:
            statuses = {row["status"] for row in data["checks"]}
            status = "FAIL" if "FAIL" in statuses else "BLOCKED" if "BLOCKED" in statuses else "PASS"
        else:
            status = data["status"] if data else "NOT_RUN"
        validations.append({"name": name, "status": status, "report": str(path),
                            "counts": data.get("counts") if data else None})
    report = {"schema": "LIANUM_DEVELOPMENT_READINESS_V1", "checks": checks, "blockers": blockers,
              "validations": validations, "historicalRecipeDisagreements": disagreements,
              "missingPublicFiles": missing, "historicalConflictsPreserved": restored["conflicts"],
              "workingSourceChanges": changed,
              "basicToolsReady": all(row["status"] == "PASS" for row in checks),
              "originalEndToEndEnvironmentReady": False, "executionGatesChanged": False}
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "readiness.json").write_text(json.dumps(report, indent=2) + "\n")
    for row in checks + validations + blockers:
        print(f"{row['status']:11} {row['name']}" + (f" ({row['files']} files)" if "files" in row else ""))
    print(f"Full report: {REPORTS / 'readiness.json'}")
    if not report["basicToolsReady"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
