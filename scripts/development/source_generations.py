#!/usr/bin/env python3
"""Prepare reviewable source generations without publishing or rebuilding proofs.

The published release remains authoritative. Development snapshots use a shared
content-addressed store; repeated preparation never clones the laboratory.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import stat
import subprocess
import sys
import tempfile

from import_paths import map_path, translate
from workspace import layout as workspace_layout, build as workspace_build

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ".internal/runtime/"
FLAT = RUNTIME + "omnichain-flat-profile/flat-wallet/"
RELEASE = "packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs"
CATALOGS = {
    "native-paged": "packages/backend/src/operations/local/funded-paged-native-source-v3.mjs",
    "graph-paged": "packages/backend/src/operations/local/funded-graph-paged-device-graph-source-v3.mjs",
}
PREFIXES = (
    ("development-tooling/", "scripts/development/"), ("development-config/", "scripts/"),
    ("golden/", RUNTIME + "omnichain-product/"),
    ("candidate/", RUNTIME + "omnichain-flat-profile/candidate-poseidon/"),
    ("mobile-protocol/", RUNTIME + "mobile-protocol/"),
    ("mobile-app/", "apps/mobile/"), ("mobile-protocol-workspace/", "packages/mobile-protocol/"),
    ("flat/", RUNTIME + "omnichain-flat-profile/"),
    ("workspace-package/", "packages/"),
    ("workspace-module/", ""), ("development-root/", ""),
)
MAX_BYTES = 128 * 1024 * 1024


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def relative(name):
    if not isinstance(name, str) or not name or name.startswith("/") or "\\" in name:
        raise ValueError("Expected a repository-relative path")
    if any(not part or part in (".", "..", ".git") or part.startswith(".env") for part in name.split("/")):
        raise ValueError("Refusing non-public or escaping path")
    return name


def physical(name):
    path = ROOT / relative(name)
    if path.resolve() != path.absolute():
        raise ValueError("Refusing an aliased path: " + name)
    return path


def read(name):
    path = physical(name)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_BYTES:
            raise ValueError("Expected bounded regular file: " + name)
        with os.fdopen(fd, "rb", closefd=False) as stream:
            value = stream.read(MAX_BYTES + 1)
        after = os.fstat(fd)
        named = path.lstat()
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if len(value) != before.st_size or any(getattr(before, key) != getattr(after, key)
                or getattr(before, key) != getattr(named, key) for key in fields):
            raise ValueError("Source changed while reading: " + name)
        return value
    finally:
        os.close(fd)


def literal(data, marker):
    text = data.decode("utf8")
    if text.count(marker) != 1:
        raise ValueError("Expected one fixed data declaration: " + marker)
    return json.JSONDecoder().raw_decode(text.split(marker, 1)[1].lstrip())[0]


def label_path(name):
    relative(name)
    for prefix, root in PREFIXES:
        if name.startswith(prefix):
            return relative(root + name[len(prefix):])
    return relative(FLAT + name)


class Capture:
    """Resolve published paths to editable sources without building the runtime."""
    def __init__(self):
        self.layout_bytes = read("scripts/layout.json")
        self.layout = workspace_layout(ROOT)
        self.files = {}
        self.objects = {}
        # Forward-map today's real files. Several domain directories share one
        # historical flat directory, so reversing a directory rule is ambiguous
        # for modules added after the frozen layout inventory.
        self.reverse = {row["path"]: row["source"] for row in self.layout["files"]}
        seen = {}
        ignored = {"node_modules", ".local", ".git", "__pycache__", ".DS_Store"}
        for name in self.layout.get("sourceRoots", []):
            base = ROOT / name
            paths = []
            if base.is_file():
                paths = [base]
            elif base.is_dir():
                for parent, dirs, names in os.walk(base, followlinks=False):
                    dirs[:] = [entry for entry in dirs if entry not in ignored]
                    paths.extend(Path(parent) / entry for entry in names
                                 if entry not in ignored and not entry.startswith(".env"))
            for path in paths:
                source = path.relative_to(ROOT).as_posix()
                target = map_path(source, self.layout, "runtime")
                if target is None or path.name in {"README.md", "package.json", "package-lock.json"}:
                    continue
                if target in seen and seen[target] != source:
                    raise ValueError("Ambiguous current source mapping: " + target)
                seen[target] = source
                self.reverse[target] = source

    def observe(self, target):
        relative(target)
        if target in self.files:
            return self.files[target]
        source = target
        mapped = None
        if target.startswith(RUNTIME):
            runtime = target[len(RUNTIME):]
            mapped = self.reverse.get(runtime)
            if mapped is not None:
                relative(mapped)
                if map_path(mapped, self.layout, "runtime") != runtime:
                    raise ValueError("Non-reversible source mapping: " + target)
                source = mapped
        try:
            value = read(source)
        except FileNotFoundError:
            row = {"path": target, "source": source, "status": "MISSING"}
        else:
            canonical_sha = sha(value)
            self.objects[canonical_sha] = value
            generated = value
            if mapped is not None and source.endswith(".mjs"):
                generated = translate(value.decode(), source, target[len(RUNTIME):], self.layout,
                    "runtime", self.layout.get("importSpellings", {}).get(source))[0].encode()
            generated_sha = sha(generated)
            self.objects[generated_sha] = generated
            row = {"path": target, "source": source, "sourceSHA256": canonical_sha,
                   "sha256": generated_sha, "bytes": len(generated), "status": "PRESENT"}
            if mapped is not None:
                try:
                    row["runtimeMatchesSource"] = sha(read(target)) == generated_sha
                except FileNotFoundError:
                    row["runtimeMatchesSource"] = False
        self.files[target] = row
        return row

    def compare(self, path, expected):
        row = dict(self.observe(path))
        row["expectedSHA256"] = expected
        if row["status"] == "PRESENT":
            row["status"] = "UNCHANGED" if row["sha256"] == expected else "CHANGED"
        return row


def inventory():
    capture = Capture()
    publication_bytes = read(RELEASE)
    publication = literal(publication_bytes, "export const NATIVE_VALUE_DEV_RELEASE_V5 = Object.freeze(")
    if publication.get("schema") != "LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5":
        raise ValueError("Unsupported published release schema")
    groups = [{"name": "native-release", "manifest": RELEASE, "dependsOn": [],
               "manifestSHA256": sha(publication_bytes), "files": [capture.compare(label_path(row["path"]),
               row["sha256"]) | {"label": row["path"]} for row in publication["sourceFiles"]]}]
    for name, path in CATALOGS.items():
        raw = read(path)
        rows = literal(raw, "const rows=Object.freeze(")
        files = []
        for row in rows:
            for kind in ("canonical", "generated"):
                if row[kind] is not None:
                    files.append(capture.compare(row[kind]["path"], row[kind]["sha256"]) | {"kind": kind})
        groups.append({"name": name, "manifest": path, "manifestSHA256": sha(raw),
                       "dependsOn": ["native-release"] + (["native-paged"] if name == "graph-paged" else []), "files": files})
    artifacts = []
    for name, pins in (("ledger-v5", [publication["producedLedger"][key] for key in ("compiled", "receipt")]),
                       ("w39-v9", list(publication["producedW39"]["files"].values()))):
        files = []
        for pin in pins:
            target = label_path(pin["path"])
            try:
                value = read(target)
                status = "UNCHANGED" if sha(value) == pin["sha256"] else "CHANGED"
                files.append({"path": target, "sha256": sha(value), "expectedSHA256": pin["sha256"],
                              "bytes": len(value), "status": status})
            except FileNotFoundError:
                files.append({"path": target, "expectedSHA256": pin["sha256"], "status": "MISSING"})
        artifacts.append({"name": name, "files": files,
                          "rawPinsMatch": all(row["status"] == "UNCHANGED" for row in files),
                          "semanticValidation": "NOT_RUN", "action": "CHECK_REUSE_WITH_ORIGINAL_VALIDATOR"})
    report = {"schema": "LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1", "layoutSHA256": sha(capture.layout_bytes),
              "groups": groups, "artifacts": artifacts, "publicationChanged": False,
              "financialAcceptance": False, "compilationRequested": False}
    report["compilerDependencies"] = compiler_dependencies(capture, publication)
    return report, capture


def compiler_dependencies(capture, publication):
    """New development boundary; original compilation receipts stay immutable.

    Follow the compilation entry, including public package export declarations.
    Shell/Python launchers are not compiler module imports. This slice plans work;
    semantic artifact authentication still belongs to the genuine inspector.
    """
    receipt_pin = publication["producedW39"]["files"]["source-pins.json"]
    try:
        original = read(label_path(receipt_pin["path"]))
    except FileNotFoundError:
        return {"status": "BLOCKED", "code": "ORIGINAL_COMPILER_RECEIPT_MISSING", "files": []}
    if sha(original) != receipt_pin["sha256"]:
        return {"status": "BLOCKED", "code": "ORIGINAL_COMPILER_RECEIPT_CHANGED", "files": []}
    historical = {label_path(row["path"]): row["sha256"] for row in json.loads(original)}
    selected = {}
    patterns = (
        r"\b(?:import|export)\s+(?:[^;'\"\n]*?\s+from\s*)?(['\"])([^'\"]+)\1",
        r"^\s*(?:import|export)\s+(?:[^;'\"]*?\s+from\s*)?(['\"])([^'\"]+)\1",
        r"\bimport\s*\(\s*(['\"])([^'\"]+)\1\s*\)",
        r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)",
    )

    def visit(source):
        relative(source)
        if source in selected:
            return
        target = None if Path(source).name in {"package.json", "package-lock.json"} else map_path(source, capture.layout, "runtime")
        target = RUNTIME + target if target is not None else source
        row = capture.compare(target, historical.get(target))
        if row["status"] == "CHANGED" and target not in historical:
            row["status"] = "ADDED"
        selected[source] = row
        if row["status"] == "MISSING" or not source.endswith(".mjs"):
            return
        text = read(source).decode()
        imports = {match.group(2) for pattern in patterns for match in re.finditer(pattern, text, re.M)}
        for name in sorted(imports):
            if name.startswith("node:") or name in ("@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"):
                continue
            if name.startswith("."):
                visit(posixpath.normpath(posixpath.join(posixpath.dirname(source), name)))
            elif name.startswith("@lianum/"):
                package, _, _ = name[len("@lianum/"):].partition("/")
                manifest = "packages/" + package + "/package.json"
                visit(manifest)
                value = capture.layout.get("_workspaceExports", {}).get(name)
                if not isinstance(value, str):
                    raise ValueError("Compiler dependency requires an explicit public export: " + name)
                visit(relative(value))
            else:
                raise ValueError("Compiler dependency requires review: " + name)

    try:
        visit("scripts/wallet/preparation/prepare-development-native-value-w39-v5.mjs")
    except (OSError, ValueError) as error:
        return {"status": "BLOCKED", "code": str(error), "files": list(selected.values())}
    changed = any(row["status"] != "UNCHANGED" for row in selected.values())
    return {"status": "REVIEW_REQUIRED" if changed else "UNCHANGED", "entry": "scripts/wallet/preparation/prepare-development-native-value-w39-v5.mjs",
            "scope": "Static compiler module dependencies; raw compiler packages, circuits, CRS and artifact semantics remain separately validated",
            "originalSourcePinsSHA256": receipt_pin["sha256"], "files": [selected[name] for name in sorted(selected)],
            "historicalReceiptModified": False}


def summary(report):
    lines = []
    for group in report["groups"]:
        changed = sum(row["status"] == "CHANGED" for row in group["files"])
        missing = sum(row["status"] == "MISSING" for row in group["files"])
        stale = sum(row.get("runtimeMatchesSource") is False for row in group["files"])
        lines.append(f"{group['name']}: {changed} changed, {missing} missing, {stale} stale runtime copies")
    for group in report["artifacts"]:
        lines.append(f"{group['name']}: " + ("published artifact bytes intact" if group["rawPinsMatch"] else "missing or changed artifacts"))
    compiler = report.get("compilerDependencies")
    if compiler:
        lines.append(f"compiler dependencies: {compiler['status']} ({len(compiler['files'])} files)")
    return "\n".join(lines)


def create_once(path, value):
    """Atomic immutable file; an existing object must have exactly these bytes."""
    physical(path.relative_to(ROOT).as_posix())
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        if read(path.relative_to(ROOT).as_posix()) != value:
            raise ValueError("Existing generation/object was modified: " + str(path))
        return False
    with tempfile.NamedTemporaryFile(prefix=".prepare-", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
            os.link(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    return True


def inspect_candidate():
    node = ROOT / ".internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node"
    if not node.is_file():
        return {"status": "BLOCKED", "code": "PINNED_NODE_MISSING"}
    env = dict(os.environ)
    env.pop("NODE_OPTIONS", None)
    env.pop("NODE_PATH", None)
    try:
        result = subprocess.run([str(node), "--max-old-space-size=384", str(ROOT / "scripts/development/source-generation-inspect.mjs")],
            cwd=ROOT, env=env, capture_output=True, timeout=45, check=False)
    except subprocess.TimeoutExpired:
        return {"status": "BLOCKED", "code": "INSPECTION_TIME_LIMIT_45_SECONDS"}
    if result.returncode or len(result.stdout) > 8 * 1024 * 1024:
        return {"status": "BLOCKED", "code": "INSPECTION_PROCESS_FAILED"}
    return json.loads(result.stdout)


def prepare(report, capture):
    if any(row["status"] == "MISSING" for group in report["groups"] for row in group["files"]):
        raise ValueError("Restore missing source files before preparing a complete generation")
    directory = physical(".local/generations")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = physical(".local/generations/.prepare.lock")
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fresh, _ = inventory()
        if fresh != report:
            raise ValueError("Source/artifact files changed while preparing; retry after edits finish")
        stale = any(row.get("runtimeMatchesSource") is False for group in report["groups"] for row in group["files"])
        inspection = ({"status": "BLOCKED", "code": "LEGACY_RUNTIME_STALE", "next": "./dev sources prepare"}
                      if stale else inspect_candidate())
        final, _ = inventory()
        if final != report:
            raise ValueError("Source/artifact files changed during inspection; candidate discarded")
        # Source identity deliberately excludes runtime freshness: copying the
        # same sources cannot produce another development generation.
        identity = json.loads(json.dumps(report))
        for group in identity["groups"]:
            for row in group["files"]:
                row.pop("runtimeMatchesSource", None)
        for row in identity.get("compilerDependencies", {}).get("files", []):
            row.pop("runtimeMatchesSource", None)
        if inspection.get("sourceFiles"):
            current = []
            for pin in inspection["sourceFiles"]:
                row = dict(capture.observe(label_path(pin["path"])))
                if row.get("sha256") != pin["sha256"]:
                    raise ValueError("Inspected current source changed before staging: " + pin["path"])
                row.pop("runtimeMatchesSource", None)
                current.append(row | {"label": pin["path"]})
            identity["currentSourceFiles"] = current
        generation = sha(encoded(identity))
        target = directory / generation
        objects = directory / "objects"
        created = 0
        for digest, value in capture.objects.items():
            created += create_once(objects / digest, value)
        manifest = target / "sources.json"
        new_generation = create_once(manifest, encoded(identity))
        # Separate inspection records are themselves addressed by content. A
        # retry after installing prerequisites cannot overwrite earlier evidence.
        inspection_bytes = encoded(inspection)
        create_once(target / ("inspection-" + sha(inspection_bytes) + ".json"), inspection_bytes)
        if inspection.get("status") == "VALIDATED_CANDIDATE":
            create_once(target / "candidate-release.json", encoded(inspection["candidate"]))
            if inspection["candidate"].get("reuseReceipt"):
                create_once(target / "reuse-receipt.json", encoded(inspection["candidate"]["reuseReceipt"]))
        return {"generation": str(target.relative_to(ROOT)), "reusedGeneration": not new_generation,
                "newSourceObjects": created, "sourceObjectBytes": sum(map(len, capture.objects.values())),
                "inspection": inspection.get("status"), "code": inspection.get("code"),
                "currentSources": len(inspection.get("sourceFiles") or []),
                "verifiedArtifactRoles": inspection.get("candidate", {}).get("verifiedArtifactRoles", []) if inspection.get("candidate") else [],
                "published": False, "compiled": False, "financialAcceptance": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("status", "check", "prepare"), default="status")
    parser.add_argument("--json", action="store_true", help="Return machine-readable details")
    args = parser.parse_args()
    report, capture = inventory()
    if args.action == "prepare":
        # Explicit preparation is the only action that updates compatibility
        # copies. The content-aware builder never compiles circuits or starts a
        # laboratory, and status/check remain entirely read-only.
        workspace_build(quiet=True)
        report, capture = inventory()
    result = prepare(report, capture) if args.action == "prepare" else report
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(summary(report))
        if args.action == "prepare":
            print(f"Generation: {result['generation']} ({result['newSourceObjects']} new source objects)")
            print(f"Artifact reuse inspection: {result['inspection']}" + (f" — {result['code']}" if result['code'] else ""))
            print("Prepared for review; the published release and financial acceptance are unchanged.")
    if args.action == "check":
        return int(any(row["status"] != "UNCHANGED" or row.get("runtimeMatchesSource") is False
                       for group in report["groups"] + report["artifacts"] for row in group["files"]))
    if args.action == "prepare":
        return 0 if result["inspection"] == "VALIDATED_CANDIDATE" else 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print("Source preparation failed: " + str(error), file=sys.stderr)
        sys.exit(1)
