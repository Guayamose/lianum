"""Check explicit package exports and prevent additional private cross-imports.

The baseline records inherited imports, not an assertion that existing modules
are independent. Computed import expressions require review; literal imports,
re-exports and require calls are checked without loading application code.
"""
import argparse
import json
from pathlib import Path
import posixpath
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "scripts/module-boundaries.json"
SUFFIXES = {".mjs", ".js", ".ts", ".tsx", ".mts", ".cts"}
IGNORED = {"node_modules", "tests", "test", "dist", "build", "android", "ios", ".git"}
TOKEN = re.compile(
    r"(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)"
    r"|(?P<string>'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")"
    r"|(?P<template>`(?:\\.|[^`\\])*`)"
    r"|(?P<word>[A-Za-z_$][\w$]*)|(?P<symbol>[^\s])"
)


def imports(text):
    """Read literal specifiers, ignoring comments and string contents."""
    tokens = [(match.lastgroup, match.group()) for match in TOKEN.finditer(text)
              if match.lastgroup != "comment"]
    for index, (kind, word) in enumerate(tokens):
        if kind != "word" or word not in {"import", "from", "require"}:
            continue
        if index and tokens[index - 1][1] in {".", "?."}:
            continue
        target = index + 1
        if target < len(tokens) and tokens[target][1] == "(" and word in {"import", "require"}:
            target += 1
        if target >= len(tokens) or tokens[target][0] not in {"string", "template"}:
            continue
        value = tokens[target][1][1:-1]
        if "${" in value:
            continue
        # Escape-obscured package paths are rejected rather than silently ignored.
        if "\\" in value:
            yield "!escaped-import:" + value
        else:
            yield value


def owner(path):
    parts = Path(path).parts
    if len(parts) >= 2 and parts[0] in {"apps", "packages"}:
        return "/".join(parts[:2])
    return None


def sources(root):
    for area in ("packages", "apps"):
        for component in sorted((root / area).iterdir()):
            source = component / "src"
            if not source.is_dir():
                continue
            for path in sorted(source.rglob("*")):
                relative = path.relative_to(root)
                if (path.is_file() and path.suffix in SUFFIXES
                        and not set(relative.parts).intersection(IGNORED)
                        and not path.name.endswith((".d.ts", ".d.mts"))):
                    yield path


def packages(root):
    result = {}
    for path in sorted((root / "packages").glob("*/package.json")):
        manifest = json.loads(path.read_text())
        name = manifest.get("name")
        if name and name.startswith("@lianum/"):
            result[name] = {"root": str(path.parent.relative_to(root)), **manifest}
    return result


def default_export(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return default_export(value.get("import", value.get("default")))
    return None


def resolve_package(specifier, manifests):
    segments = specifier.split("/")
    name = "/".join(segments[:2])
    manifest = manifests.get(name)
    if manifest is None:
        return None, f"unknown local package {name}"
    key = "./" + "/".join(segments[2:]) if len(segments) > 2 else "."
    path = default_export(manifest.get("exports", {}).get(key))
    if path is None:
        return None, f"{name} does not export {key}"
    return posixpath.normpath(posixpath.join(manifest["root"], path)), None


def inspect(root, policy):
    manifests = packages(root)
    errors, private, public, graph = [], set(), set(), set()
    for name, manifest in manifests.items():
        for key, value in manifest.get("exports", {}).items():
            target = default_export(value)
            if (not key.startswith(".") or not target or not target.startswith("./")
                    or ".." in Path(target).parts or "*" in key):
                errors.append(f"{name}: export must name one explicit local file: {key}")
            elif not (root / manifest["root"] / target).is_file():
                errors.append(f"{name}: export target missing: {target}")
    for path in sources(root):
        source = path.relative_to(root).as_posix()
        component = owner(source)
        for specifier in imports(path.read_text()):
            if specifier.startswith("!escaped-import:"):
                errors.append(f"{source}: escaped import requires an explicit readable specifier")
                continue
            is_public = specifier.startswith("@lianum/")
            if is_public:
                target, error = resolve_package(specifier, manifests)
                if error:
                    errors.append(f"{source}: {error}")
                    continue
            elif specifier.startswith("."):
                target = posixpath.normpath(posixpath.join(posixpath.dirname(source),
                                                        re.split(r"[?#]", specifier, 1)[0]))
            else:
                continue
            dependency = owner(target)
            if dependency is None or dependency == component:
                continue
            edge = (source, target)
            graph.add((component, dependency))
            if is_public:
                public.add(edge)
                allowed = policy["dependencies"].get(component, [])
                if dependency not in allowed:
                    errors.append(f"{source}: dependency direction {component} -> {dependency} is not allowed")
                manifest = next((row for row in manifests.values() if row["root"] == component), None)
                name = "/".join(specifier.split("/")[:2])
                if manifest is not None and name not in manifest.get("dependencies", {}):
                    errors.append(f"{source}: {name} missing from package dependencies")
            else:
                private.add(edge)
    legacy = {(source, target) for source, targets in policy["legacyPrivateImports"].items()
              for target in targets}
    for source, target in sorted(private - legacy):
        errors.append(f"{source}: new private cross-import {target}; use a declared @lianum export")
    return {"files": sum(1 for _ in sources(root)), "public": len(public),
            "legacyPrivate": len(private & legacy), "retiredLegacy": len(legacy - private),
            "graph": [list(edge) for edge in sorted(graph)], "errors": errors,
            "privateImports": sorted(private)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Print the dependency report as JSON")
    parser.add_argument("--prune", action="store_true", help="Remove only retired legacy exceptions")
    args = parser.parse_args(argv)
    policy = json.loads(POLICY.read_text())
    report = inspect(ROOT, policy)
    if args.prune:
        if report["errors"]:
            raise SystemExit("Resolve new violations before pruning the inherited baseline.")
        current = set(report["privateImports"])
        policy["legacyPrivateImports"] = {
            source: [target for target in targets if (source, target) in current]
            for source, targets in policy["legacyPrivateImports"].items()
            if any((source, target) in current for target in targets)
        }
        POLICY.write_text(json.dumps(policy, indent=2) + "\n")
    del report["privateImports"]
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Module boundaries: {report['files']} files, {report['public']} public imports, "
              f"{report['legacyPrivate']} inherited private imports.")
        if report["retiredLegacy"]:
            print(f"{report['retiredLegacy']} inherited exceptions can be removed with --prune.")
        for error in report["errors"]:
            print(error, file=sys.stderr)
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
