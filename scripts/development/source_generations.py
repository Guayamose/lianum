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
from source_pins import run as check_current_pins

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
CURRENT_SOURCE_INPUTS = (
    "package.json", "package-lock.json", "scripts/layout.json", "scripts/module-boundaries.json",
    "scripts/development/source-pins.json", "scripts/development/source-generation-inspect.mjs",
    "scripts/development/source_generations.py", "scripts/development/source_pins.py",
    "scripts/development/module_boundaries.py", "scripts/development/import_paths.py",
    "scripts/development/workspace.py", "apps/mobile/package.json", "apps/mobile/package-lock.json",
    "archive/source-evidence/paged-original-host-v4/provenance.json",
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def relative(name):
    if (not isinstance(name, str) or not name or name.startswith("/") or "\\" in name
            or any(ord(char) < 32 or ord(char) == 127 for char in name)):
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


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate layout field: " + key)
        value[key] = item
    return value


def source_relocations(definition):
    """Explicit one-to-one historical source names, never filesystem aliases.

    Only an absent old public source may resolve to a present physical source.
    Chains and merged destinations require a new explicit review rather than
    silently choosing an implementation for an old publication.
    """
    relocations = definition.get("sourceRelocations", {})
    if not isinstance(relocations, dict):
        raise ValueError("Source relocations must be an explicit path map")
    destinations = set()
    for old, new in relocations.items():
        for name in (old, new):
            relative(name)
            if (name.split("/", 1)[0] not in {"packages", "apps", "scripts", "tests", "experiments", "contracts"}
                    or any(part.startswith(".") or part in {"node_modules", "secrets"} for part in name.split("/"))
                    or name.endswith((".pem", ".key", ".p12", ".pfx"))):
                raise ValueError("Source relocation requires a public source path: " + name)
        if new in relocations:
            raise ValueError("Chained or cyclic source relocation: " + old)
        if new in destinations:
            raise ValueError("Ambiguous source relocation destination: " + new)
        destinations.add(new)
        if physical(old).exists():
            raise ValueError("Source relocation would hide an existing source: " + old)
        if not physical(new).is_file():
            raise ValueError("Source relocation target is missing or not a file: " + new)
    return dict(relocations)


class Capture:
    """Resolve published paths to editable sources without building the runtime."""
    def __init__(self):
        self.layout_bytes = read("scripts/layout.json")
        definition = json.loads(self.layout_bytes, object_pairs_hook=unique_object)
        self.layout = workspace_layout(ROOT)
        if read("scripts/layout.json") != self.layout_bytes:
            raise ValueError("Layout changed while resolving current sources")
        self.relocations = source_relocations(definition)
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
        original_source = source
        if source in self.relocations:
            # Recheck absence at observation time: a restored file must never be
            # shadowed by a candidate mapping captured earlier in this process.
            if physical(source).exists():
                raise ValueError("Source relocation would hide an existing source: " + source)
            source = self.relocations[source]
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
        if source != original_source:
            row["sourceRelocation"] = {"from": original_source, "to": source}
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
    report["currentSourceContract"] = current_source_contract(report, capture)
    return report, capture


def current_source_contract(report, capture):
    """Capture the current closure under its real names, separately from V5.

    Fixed published inventories determine the initial review scope. Explicit
    relocations select today's names; current ESM literal imports and public
    exports are followed. Historical inventories and mobile bundler dependencies
    remain explicit boundaries. A legacy entry that loads a generated
    module retains that generated identity instead of pretending it ran source.
    """
    from module_boundaries import imports as module_imports, TOKEN
    roots = {row["source"] for group in report["groups"] for row in group["files"]}
    roots.update({RELEASE, *CATALOGS.values(), *CURRENT_SOURCE_INPUTS})
    selected = {}
    expanded = set()
    external = set()
    resource_bindings = set()
    mobile_bindings = set()
    mobile_dependencies = json.loads(read("apps/mobile/package.json")).get("dependencies", {})
    url_pattern = re.compile(r"\bnew\s+URL\s*\(\s*(['\"])([^'\"]+\.mjs)\1\s*,\s*import\.meta\.url\s*\)")
    def evidence_only(path):
        return path.startswith(("experiments/", "packages/protocol/")) or path == "packages/crypto/src/component-tooling.mjs"
    queue = [(path, not evidence_only(path)) for path in sorted(roots)]
    while queue:
        path, follow = queue.pop()
        relative(path)
        if path in selected and (not follow or path in expanded):
            continue
        if len(selected) >= 8192:
            raise ValueError("Current source closure exceeded its fixed file bound")
        row = dict(capture.observe(path))
        if row["status"] != "PRESENT":
            raise ValueError("Current source dependency is missing: " + path)
        if path not in roots and row.get("sourceRelocation"):
            raise ValueError("Current import still names a relocated source: " + path)
        row.pop("runtimeMatchesSource", None)
        selected[path] = row
        # Public package manifests are included whether a module was reached
        # by a relative import, a package export or an original inventory root.
        parts = path.split("/")
        if parts[0] in {"apps", "packages"} and len(parts) > 2:
            manifest = "/".join(parts[:2]) + "/package.json"
            if physical(manifest).is_file():
                queue.append((manifest, False))
        if not follow or not path.endswith(".mjs"):
            continue
        expanded.add(path)
        content = capture.objects[row["sha256"]].decode("utf8")
        # createRequire bindings use their consumers' fixed resource roots and
        # retained manifests; do not pretend Node resolves them beside source.
        # Record these boundaries explicitly rather than silently accepting them
        # as part of the ESM closure or executing a fixture to discover them.
        tokens = [(match.lastgroup, match.group()) for match in TOKEN.finditer(content)
                  if match.lastgroup != "comment"]
        required = set()
        for i, (kind, word) in enumerate(tokens[:-3]):
            if kind == "word" and word == "require" and tokens[i+1][1] == "(" and tokens[i+2][0] == "string":
                required.add(tokens[i+2][1][1:-1])
        allowed_resources = {"ethers", "solc", "@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"}
        for name in required:
            if name.startswith("node:"):
                continue
            if name not in allowed_resources:
                raise ValueError("Undeclared fixed runtime package binding: " + name + " in " + path)
            resource_bindings.add((path, name))
        names = {(name, True) for name in set(module_imports(content)) - required}
        for match in url_pattern.finditer(content):
            value = match.group(2)
            if value.startswith("/") or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value):
                raise ValueError("Current source URL must be local: " + value)
            names.add((value if value.startswith(".") else "./" + value, False))
        for name, code_import in sorted(names):
            if name.startswith("node:"):
                continue
            if name.startswith("."):
                target = posixpath.normpath(posixpath.join(posixpath.dirname(path), name))
                relative(target)
                queue.append((target, code_import or not evidence_only(target)))
            elif name.startswith("@lianum/"):
                package = name.split("/")[1]
                target = capture.layout.get("_workspaceExports", {}).get(name)
                if not isinstance(target, str):
                    raise ValueError("Current dependency requires an explicit package export: " + name)
                queue.extend([("packages/" + package + "/package.json", False), (relative(target), True)])
            elif name in {"@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"}:
                # Their actual entrypoints/Wasm/toolchain and CRS are checked by
                # the original artifact inspector, never resolved from a caller.
                external.add(name)
            elif name.startswith(("@noble/curves/", "@noble/hashes/")):
                target = "apps/mobile/node_modules/" + name
                if target not in roots:
                    raise ValueError("Current npm import is outside the pinned public inventory: " + name)
                queue.append((target, True))
            elif path.startswith("apps/mobile/") and name in mobile_dependencies:
                # Native Expo/React packages are resolved by the mobile bundler,
                # whose package manifest/lock are byte-pinned and checked by
                # `sources prepare/verify`; they are not server ESM imports.
                mobile_bindings.add((path, name))
            else:
                raise ValueError("Current source dependency requires review: " + name + " in " + path)
    sources = [selected[path] for path in sorted(selected)]
    return {"schema": "LIANUM_CURRENT_SOURCE_CONTRACT_V2", "roots": sorted(roots), "files": sources,
            "scope": "Current ESM imports and fixed module URLs plus immutable publication inventories; TS/TSX are byte-pinned inventory entries, not a bundler dependency closure",
            "retainedEvidenceRoots": sorted(path for path in roots if evidence_only(path)),
            "sourceClosureSHA256": sha(encoded(sources)), "externallyValidatedPackages": sorted(external),
            "fixedRuntimeResourceBindings": [{"source": path, "specifier": name,
                "acceptance": "FIXED_CONSUMER_VALIDATION_REQUIRED"} for path, name in sorted(resource_bindings)],
            "mobileBundlerBindings": [{"source": path, "specifier": name,
                "acceptance": "MOBILE_BUNDLER_VALIDATION_REQUIRED"} for path, name in sorted(mobile_bindings)],
            "runtimeResourceAcceptanceEstablished": False,
            "historicalInventoriesModified": False, "financialAcceptance": False}

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


def current_runtime_matches(identity):
    if any(row.get("runtimeMatchesSource") is False for group in identity["groups"] for row in group["files"]):
        return False
    for row in identity["currentSourceContract"]["files"]:
        if row["path"].startswith(RUNTIME):
            try:
                if sha(read(row["path"])) != row["sha256"]:
                    return False
            except FileNotFoundError:
                return False
    return True


def retained_compiler_files(inspection):
    """Byte evidence authenticated by the fixed inspectors, never executable roots."""
    paged = inspection["paged"]
    result = [dict(row, source=row.get("source", row["path"]))
              for row in [*paged.get("compilerInputs", []), *paged.get("hostSources", [])]]
    archive_roots = {"candidate": "omnichain-flat-profile/candidate-poseidon",
                     "flat-reference": "omnichain-flat-profile", "golden": "omnichain-product"}
    for row in inspection["nativeValue"]["nodeReuseReceipt"].get("compilerSources", []):
        source = "archive/delivery/source-snapshot/" + archive_roots[row["root"]] + "/" + relative(row["path"])
        result.append(dict(row, source=source))
    return result


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
        stale = (any(row.get("runtimeMatchesSource") is False for group in report["groups"] for row in group["files"])
                 or not current_runtime_matches(report))
        inspection = ({"status": "BLOCKED", "code": "LEGACY_RUNTIME_STALE", "next": "./dev sources prepare"}
                      if stale else inspect_candidate())
        if inspection.get("status") == "VERIFIED_RETAINED_ARTIFACTS":
            for row in retained_compiler_files(inspection):
                value = read(row["source"])
                if sha(value) != row["sha256"] or len(value) != row["bytes"]:
                    raise ValueError("Retained compiler evidence changed after inspection: " + row["source"])
                capture.objects[row["sha256"]] = value
        final, _ = inventory()
        if final != report:
            raise ValueError("Source/artifact files changed during inspection; candidate discarded")
        if not stale and not current_runtime_matches(report):
            raise ValueError("Generated executable changed during inspection; candidate discarded")
        # Source identity deliberately excludes runtime freshness: copying the
        # same sources cannot produce another development generation.
        identity = source_identity(report)
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
        validated = inspection.get("status") == "VERIFIED_RETAINED_ARTIFACTS"
        if validated:
            candidate = source_candidate(identity, generation, inspection)
            create_once(target / "candidate-release.json", encoded(candidate))
            create_once(target / "reuse-receipt.json", encoded(candidate["reuseReceipt"]))
        return {"generation": str(target.relative_to(ROOT)), "reusedGeneration": not new_generation,
                "newSourceObjects": created, "sourceObjectBytes": sum(map(len, capture.objects.values())),
                "inspection": "VALIDATED_CANDIDATE" if validated else inspection.get("status"), "code": inspection.get("code"),
                "currentSources": len(identity.get("currentSourceContract", {}).get("files", [])),
                "verifiedArtifactRoles": inspection.get("nativeValue", {}).get("verifierRoles", []) if inspection.get("nativeValue") else [],
                "verifiedPagedArtifactRoles": list(inspection.get("paged", {}).get("roles", {})) if inspection.get("paged") else [],
                "sourceAcceptance": "PREPARED_FOR_REVIEW" if validated else "BLOCKED",
                "readback": "./dev sources verify --generation " + generation,
                "published": False, "compiled": False, "financialAcceptance": False}



def source_candidate(identity, generation, inspection):
    """A new source contract; never a V5 publication with substituted paths."""
    if (inspection.get("status") != "VERIFIED_RETAINED_ARTIFACTS"
            or inspection.get("published") is not False or inspection.get("compiled") is not False
            or inspection.get("financialAcceptance") is not False):
        raise ValueError("Retained artifact inspection did not authenticate a preparation candidate")
    native = inspection.get("nativeValue") or {}
    paged = inspection.get("paged") or {}
    if (native.get("artifactBundleIssued") is not False
            or native.get("reuseReceipt", {}).get("schema") != "LIANUM_W39_EXACT_PUBLISHED_REUSE_V6"
            or native.get("nodeReuseReceipt", {}).get("schema") != "RETAINED_NODE_COMPILER_REUSE_V1"
            or paged.get("schema") != "LIANUM_PAGED_EXACT_RETAINED_REUSE_V4"
            or paged.get("artifactBundleIssued") is not False):
        raise ValueError("Complete original W39, N32 and paged reuse receipts are required")
    contract = identity["currentSourceContract"]
    if contract["sourceClosureSHA256"] != sha(encoded(contract["files"])):
        raise ValueError("Current source contract digest does not match its files")
    return {"schema": "LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7", "sourceGeneration": generation,
            "currentSourceClosureSHA256": contract["sourceClosureSHA256"],
            "priorPublications": [{"path": group["manifest"], "sha256": group["manifestSHA256"]}
                                  for group in identity["groups"]],
            "artifactInspection": inspection, "reuseReceipt": native["reuseReceipt"],
            "nodeReuseReceipt": native["nodeReuseReceipt"], "pagedReuseReceipt": paged,
            "verifiedArtifactRoles": native["verifierRoles"],
            "sourceAcceptance": "PREPARED_FOR_REVIEW", "published": False, "compiledNow": False,
            "artifactBundleIssued": False, "financialAcceptance": False}


def source_identity(report):
    identity = json.loads(json.dumps(report))
    for group in identity["groups"]:
        for row in group["files"]:
            row.pop("runtimeMatchesSource", None)
    for row in identity.get("compilerDependencies", {}).get("files", []):
        row.pop("runtimeMatchesSource", None)
    return identity


def verify_generation(generation):
    """Read back the source candidate against immutable objects and actual files.

    This consumes only the preparation contract. Financial loaders still require
    their own published release and process-local capabilities.
    """
    if not isinstance(generation, str) or not re.fullmatch(r"[0-9a-f]{64}", generation):
        raise ValueError("Expected the exact source-generation digest")
    base = ".local/generations/" + generation
    raw = read(base + "/sources.json")
    identity = json.loads(raw)
    if raw != encoded(identity) or sha(raw) != generation:
        raise ValueError("Source generation identity was modified")
    candidate_raw = read(base + "/candidate-release.json")
    candidate = json.loads(candidate_raw)
    expected = source_candidate(identity, generation, candidate["artifactInspection"])
    if candidate_raw != encoded(expected):
        raise ValueError("Source candidate metadata was modified")
    inspection_bytes = encoded(candidate["artifactInspection"])
    if read(base + "/inspection-" + sha(inspection_bytes) + ".json") != inspection_bytes:
        raise ValueError("Source candidate inspection record was modified")
    if read(base + "/reuse-receipt.json") != encoded(candidate["reuseReceipt"]):
        raise ValueError("Source candidate reuse receipt was modified")
    digests = set()
    rows = [row for group in identity["groups"] for row in group["files"]]
    rows += identity.get("compilerDependencies", {}).get("files", [])
    rows += identity["currentSourceContract"]["files"]
    rows += retained_compiler_files(candidate["artifactInspection"])
    for row in rows:
        digests.update(row[key] for key in ("sourceSHA256", "sha256") if key in row)
    for digest in sorted(digests):
        if not re.fullmatch(r"[0-9a-f]{64}", digest) or sha(read(".local/generations/objects/" + digest)) != digest:
            raise ValueError("Source generation object was modified")
    fresh, _ = inventory()
    if source_identity(fresh) != identity:
        raise ValueError("Current sources, exports, relocation rules or original publications differ from the candidate")
    if not current_runtime_matches(fresh):
        raise ValueError("Generated executable differs from the source candidate")
    inspection = inspect_candidate()
    final, _ = inventory()
    if source_identity(final) != identity:
        raise ValueError("Source candidate changed during readback inspection")
    if not current_runtime_matches(final):
        raise ValueError("Generated executable changed during readback inspection")
    if encoded(source_candidate(identity, generation, inspection)) != candidate_raw:
        raise ValueError("Retained artifact inspection differs from the candidate")
    return {"generation": base, "verification": "READBACK_VERIFIED", "inspection": "VALIDATED_CANDIDATE",
            "currentSources": len(identity["currentSourceContract"]["files"]),
            "verifiedArtifactRoles": candidate["verifiedArtifactRoles"],
            "verifiedPagedArtifactRoles": list(candidate["pagedReuseReceipt"]["roles"]),
            "sourceAcceptance": "PREPARED_FOR_REVIEW", "published": False, "compiled": False,
            "artifactBundleIssued": False, "financialAcceptance": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("status", "check", "prepare", "verify"), default="status")
    parser.add_argument("--json", action="store_true", help="Return machine-readable details")
    parser.add_argument("--generation", help="Exact digest for a read-only candidate verification")
    args = parser.parse_args()
    if args.action in {"prepare", "verify"}:
        # The native producer already depends on these mobile packages. Do not
        # require the separate Cloud installation or approve hashes implicitly.
        try:
            pins = check_current_pins("check", "mobile", ROOT)
        except (ValueError, OSError, KeyError, TypeError, IndexError) as error:
            pins = {"status": "BLOCKED", "error": str(error)}
        if pins["status"] != "CURRENT":
            result = {"inspection": "BLOCKED", "code": "CURRENT_MOBILE_PINS_" + pins["status"],
                      "next": "./dev pins check --profile mobile --json", "pins": pins,
                      "published": False, "compiled": False, "financialAcceptance": False}
            if args.json:
                print(json.dumps(result, indent=2))
            else:
                print("Source preparation blocked: " + result["code"])
                print(pins.get("error", "Current mobile manifests differ from the reviewed pin table."))
                print("Inspect: " + result["next"])
                if pins["status"] == "STALE":
                    print("After reviewing that diff: ./dev pins update --profile mobile")
            return 2
    if args.action == "verify":
        result = verify_generation(args.generation)
        print(json.dumps(result, indent=2) if args.json else "Verified source candidate: " + result["generation"])
        return 0
    if args.generation is not None:
        raise ValueError("--generation is only valid with sources verify")
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
