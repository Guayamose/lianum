"""Generate original runtime paths from the physically reorganized sources."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

from import_paths import translate, map_path

ROOT = Path(__file__).resolve().parents[2]
INTERNAL = ROOT / ".internal"
RUNTIME = INTERNAL / "runtime"
DEV = INTERNAL / "dev"
LAYOUT = ROOT / "scripts/layout.json"
IGNORED = {"node_modules", ".local", ".git", "__pycache__", ".DS_Store"}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def node_export(target):
    """Resolve the explicit ESM conditions used by the pinned Node runtime."""
    if isinstance(target, str):
        return target
    if isinstance(target, dict):
        for condition, value in target.items():
            if condition in {'node', 'import', 'default', 'node-addons'}:
                resolved = node_export(value)
                if resolved is not None:
                    return resolved
    return None


def layout(project_root=None):
    root = Path(project_root) if project_root is not None else ROOT
    definition = root / 'scripts/layout.json' if project_root is not None else LAYOUT
    config = json.loads(definition.read_text())
    config['_workspaceRoot'] = str(root)
    exports = {}
    for manifest in (root / 'packages').glob('*/package.json'):
        package = json.loads(manifest.read_text())
        for key, target in package.get('exports', {}).items():
            target = node_export(target)
            if not isinstance(target, str) or not target.startswith('./'):
                continue
            if '..' in Path(target).parts or '*' in key or '*' in target:
                raise ValueError(f'Unsupported workspace export: {manifest}: {key}')
            name = package['name'] + (key[1:] if key != '.' else '')
            exports[name] = (manifest.parent / target).relative_to(root).as_posix()
    config['_workspaceExports'] = exports
    pins = root / 'scripts/development/source-pins.json'
    current_inputs = set()
    if pins.is_file():
        for profile in json.loads(pins.read_text()).get('profiles', {}).values():
            current_inputs.update(profile.get('mutablePaths', []))
    config['_canonicalSourceInputs'] = sorted(current_inputs)
    return config


def runtime_relative(raw, config=None):
    """Map an editable source file or directory to its runtime-relative path."""
    path = Path(raw)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Expected a workspace-relative path: {raw}")
    return map_path(path.as_posix().rstrip("/"), config or layout(), "runtime")


def physical(path):
    if path.is_symlink() or path.resolve() != path.absolute():
        raise RuntimeError(f"Expected a physical path without symlink ancestors: {path}")
    return path


def source_files(config):
    result = {}
    original_imports = config.get("importSpellings", {})
    known_sources = {row["source"] for row in config["files"]}
    roots = config.get("sourceRoots", [rule["source"] for rule in config["rules"]])
    for raw_root in roots:
        source = ROOT / raw_root
        if not source.exists():
            continue
        physical(source)
        if source.is_dir():
            files = []
            for parent, dirs, names in os.walk(source, followlinks=False):
                for name in dirs:
                    if name not in IGNORED:
                        physical(Path(parent) / name)
                dirs[:] = [name for name in dirs if name not in IGNORED]
                files.extend(Path(parent) / name for name in names if name not in IGNORED
                             and not name.startswith(".env"))
        else:
            files = [source]
        for path in files:
            # Component guides belong to the workspace, not the frozen runtime.
            if path.name == "README.md" and str(path.relative_to(ROOT)) not in known_sources:
                continue
            physical(path)
            if not path.is_file():
                raise RuntimeError(f"Expected a regular source file: {path}")
            relative = str(path.relative_to(ROOT))
            if path.name in {'package.json', 'package-lock.json'} and relative not in known_sources:
                continue
            if relative in config.get('canonicalRuntimeSources', {}).values():
                continue
            target = runtime_relative(relative, config)
            if target is None and path.suffix == ".md":
                continue
            # New host tests run against their workspace interfaces. They do
            # not need a legacy execution copy or a new translation rule.
            # Retained tests with an explicit mapping are still reproduced;
            # unmapped production modules continue to fail closed below.
            parts = Path(relative).parts
            if (target is None and len(parts) >= 4
                    and parts[0] in {"apps", "packages"} and parts[2] == "tests"
                    and path.name.endswith(".test.mjs")):
                continue
            if target is None:
                raise RuntimeError(f"No compatibility mapping for execution source: {relative}")
            if target in result:
                raise RuntimeError(f"Ambiguous runtime path: {relative}")
            content = path.read_bytes()
            source_hash = hashlib.sha256(content).hexdigest()
            if path.suffix == ".mjs":
                content = translate(content.decode("utf-8"), relative, target, config, "runtime",
                                    original_imports.get(relative))[0].encode("utf-8")
            result[target] = {"source": relative, "sha256": hashlib.sha256(content).hexdigest(),
                              "sourceSHA256": source_hash, "bytes": len(content),
                              "mode": oct(path.stat().st_mode & 0o777)}
    return result


def build(quiet=False):
    config = layout()
    DEV.mkdir(parents=True, exist_ok=True)
    reports = DEV / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    report_path = reports / "workspace-build.json"
    with (DEV / "workspace-build.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        physical(RUNTIME)
        sources = source_files(config)
        previous = (json.loads(report_path.read_text())["files"] if report_path.exists()
                    else {row["path"]: {"sha256": row["sha256"]} for row in config["files"]})
        removed = []
        for relative, row in previous.items():
            if relative in sources:
                continue
            path = physical(RUNTIME / relative)
            if path.exists():
                if not path.is_file() or digest(path) != row["sha256"]:
                    raise RuntimeError(f"Refusing to remove a modified internal file: {relative}")
                path.unlink()
                removed.append(relative)
        copied = 0
        for relative, row in sources.items():
            source = ROOT / row["source"]
            target = physical(RUNTIME / relative)
            if target.is_file() and digest(target) == row["sha256"]:
                target.chmod(int(row["mode"], 8))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(prefix=".workspace-", dir=target.parent, delete=False) as stream:
                temporary = Path(stream.name)
            try:
                content = source.read_bytes()
                if source.suffix == ".mjs":
                    content = translate(content.decode("utf-8"), row["source"], relative, config, "runtime",
                                        config.get("importSpellings", {}).get(row["source"]))[0].encode("utf-8")
                temporary.write_bytes(content)
                temporary.chmod(int(row["mode"], 8))
                if digest(temporary) != row["sha256"]:
                    raise RuntimeError(f"Source changed while building: {row['source']}")
                temporary.replace(target)
                copied += 1
            finally:
                temporary.unlink(missing_ok=True)
        report = {"schema": "LIANUM_WORKSPACE_BUILD_V1", "files": sources,
                  "copied": copied, "removed": removed,
                  "sourceOfTruth": "apps/, services/, packages/, contracts/, tests/, scripts/",
                  "relativeImportsTranslated": True, "symlinksCreated": False}
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    if not quiet:
        print(f"Workspace ready: {len(sources)} source files; {copied} updated, {len(removed)} removed.")
    return report


if __name__ == "__main__":
    import sys
    build(quiet="--quiet" in sys.argv[1:])
