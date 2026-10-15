"""Check explicit package exports and prevent additional private cross-imports.

The baseline records inherited imports, not an assertion that existing modules
are independent. Computed import expressions require review; literal imports,
re-exports and require calls are checked without loading application code.
"""
import argparse
import hashlib
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
    if len(parts) >= 2 and parts[0] in {"apps", "services", "packages"}:
        return "/".join(parts[:2])
    return None


def sources(root):
    for area in ("packages", "apps", "services"):
        if not (root / area).is_dir():
            continue
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


def directed_cycles(edges):
    """Exact simple directed package cycles, canonicalized by their smallest node.

    An SCC alone is insufficient: a new reverse edge inside it can add cycles.
    Package graphs are deliberately small; file graphs use linear SCC analysis.
    """
    adjacency = {}
    for source, target in edges:
        adjacency.setdefault(source, set()).add(target)
        adjacency.setdefault(target, set())
    cycles = set()
    for start in sorted(adjacency):
        def visit(path):
            for target in sorted(adjacency[path[-1]]):
                if target == start:
                    cycles.add(tuple(path))
                elif target > start and target not in path:
                    visit([*path, target])
        visit([start])
    return cycles


def cyclic_components(edges):
    """Return actual cyclic file components and their exact internal import edges."""
    adjacency = {}
    for source, target in edges:
        adjacency.setdefault(source, set()).add(target)
        adjacency.setdefault(target, set())
    counter, indices, low, stack, pending, components = 0, {}, {}, [], set(), []
    def visit(node):
        nonlocal counter
        indices[node] = low[node] = counter
        counter += 1
        stack.append(node)
        pending.add(node)
        for target in sorted(adjacency[node]):
            if target not in indices:
                visit(target)
                low[node] = min(low[node], low[target])
            elif target in pending:
                low[node] = min(low[node], indices[target])
        if low[node] == indices[node]:
            component = []
            while True:
                target = stack.pop()
                pending.remove(target)
                component.append(target)
                if target == node:
                    break
            if len(component) > 1 or node in adjacency[node]:
                components.append(sorted(component))
    for node in sorted(adjacency):
        if node not in indices:
            visit(node)
    membership = {node: index for index, component in enumerate(components) for node in component}
    cyclic_edges = {(source, target) for source, target in edges
                    if source in membership and membership.get(target) == membership[source]}
    return sorted(components), cyclic_edges


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


def historical_inventory_errors(root, policy):
    """Original protocol files are evidence, not a second active implementation."""
    location = policy.get("historicalInventory")
    if not location:
        return []
    errors = []
    inventory = json.loads((root / location).read_text())
    historical = inventory["historicalPackage"]
    active = inventory.get("activePackages", [inventory["activePackage"]])
    retained = {row["path"]: row["sha256"] for row in inventory["historicalFiles"]}
    present = {path.relative_to(root).as_posix()
               for path in (root / historical / "src").rglob("*") if path.is_file()}
    for path in sorted(present - retained.keys()):
        if not declared_keeper_compatibility_forwarder(root, historical, path):
            errors.append(f"{path}: new source in the frozen historical package")
    for path, digest in retained.items():
        if not path.startswith(historical + "/src/"):
            errors.append(f"{path}: historical inventory path is outside its package")
        elif path not in present:
            errors.append(f"{path}: retained historical source is missing")
        elif hashlib.sha256((root / path).read_bytes()).hexdigest() != digest:
            errors.append(f"{path}: frozen historical source changed; edit the active implementation")
    for pair in inventory["pairs"]:
        if (pair["historical"] not in retained
                or retained[pair["historical"]] != pair["historicalSHA256"]
                or not any(pair["active"].startswith(package + "/src/") for package in active)
                or not (root / pair["active"]).is_file()):
            errors.append(f"{pair.get('historical')}: invalid active/historical implementation pair")
    return errors


def declared_keeper_compatibility_forwarder(root, historical, path):
    """Only the existing public keeper ABI may forward to its original factory.

    This does not exempt retained bytes or permit code in a compatibility
    directory generally. The whole new module must be a single exact public
    named re-export, also declared by both package manifests/dependencies.
    """
    expected = 'packages/protocol/src/compatibility/account-keeper.mjs'
    source = root / path
    if historical != 'packages/protocol' or path != expected or source.is_symlink():
        return False
    manifests = packages(root)
    protocol, engine = manifests.get('@lianum/protocol'), manifests.get('@lianum/engine')
    if not protocol or not engine or protocol.get('lianum', {}).get('status') != 'compatibility':
        return False
    if default_export(protocol.get('exports', {}).get('./accounts/keeper')) != './src/compatibility/account-keeper.mjs':
        return False
    if '@lianum/engine' not in protocol.get('dependencies', {}):
        return False
    target, error = resolve_package('@lianum/engine/accounts/keeper', manifests)
    if error or not (root / target).is_file() or (root / target).is_symlink():
        return False
    tokens = [(match.lastgroup, match.group()) for match in TOKEN.finditer(source.read_text())
              if match.lastgroup != 'comment']
    if len(tokens) != 7:
        return False
    return ([value for _, value in tokens[:5]] == ['export', '{', 'createGenericAccountKeeper', '}', 'from']
            and tokens[5][0] == 'string' and tokens[5][1][1:-1] == '@lianum/engine/accounts/keeper'
            and tokens[6] == ('symbol', ';'))


def inspect(root, policy):
    manifests = packages(root)
    errors, private, public, graph, support = [], set(), set(), set(), set()
    historical = set(policy.get("historicalPackages", []))
    source_paths = list(sources(root))
    active_sources = {path.relative_to(root).as_posix() for path in source_paths
                      if owner(path.relative_to(root)) not in historical}
    file_graph = set()
    export_owners = {}
    for name, manifest in manifests.items():
        for key, value in manifest.get("exports", {}).items():
            target = default_export(value)
            if (not key.startswith(".") or not target or not target.startswith("./")
                    or ".." in Path(target).parts or "*" in key):
                errors.append(f"{name}: export must name one explicit local file: {key}")
            elif not (root / manifest["root"] / target).is_file():
                errors.append(f"{name}: export target missing: {target}")
            else:
                export_owners[posixpath.normpath(posixpath.join(manifest["root"], target))] = name
    for path in source_paths:
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
            if source in active_sources:
                # ESM extensions are explicit; TS app imports may omit them.
                resolved = next((candidate for candidate in [target, target + '.ts', target + '.tsx',
                                                             target + '.mjs', target + '/index.ts']
                                 if candidate in active_sources), None)
                if resolved:
                    file_graph.add((source, resolved))
            target_parts = Path(target).parts
            package_support = (len(target_parts) > 2 and target_parts[0] in {"packages", "apps"}
                               and target_parts[2] in {"tests", "test", "experiments"})
            if target.startswith(("tests/", "experiments/")) or package_support:
                support.add((source, target))
            if dependency is None or dependency == component:
                continue
            edge = (source, target)
            graph.add((component, dependency))
            if component.startswith("packages/") and dependency.startswith("apps/"):
                errors.append(f"{source}: package implementations cannot depend on application code: {target}")
            if dependency in historical and component not in historical:
                errors.append(f"{source}: active code cannot consume the historical package {dependency}")
            # Browsers need URL imports. A relative app import is still a public
            # boundary when its exact file is an explicitly exported package API.
            browser_public = component.startswith("apps/") and target in export_owners
            if is_public or browser_public:
                public.add(edge)
                allowed = policy["dependencies"].get(component, [])
                if dependency not in allowed:
                    errors.append(f"{source}: dependency direction {component} -> {dependency} is not allowed")
                manifest = next((row for row in manifests.values() if row["root"] == component), None)
                name = export_owners[target] if browser_public else "/".join(specifier.split("/")[:2])
                if manifest is not None and name not in manifest.get("dependencies", {}):
                    errors.append(f"{source}: {name} missing from package dependencies")
            else:
                private.add(edge)
    legacy = {(source, target) for source, targets in policy["legacyPrivateImports"].items()
              for target in targets}
    for source, target in sorted(private - legacy):
        errors.append(f"{source}: new private cross-import {target}; use a declared @lianum export")
    legacy_support = {(source, target) for source, targets in policy.get("legacySupportImports", {}).items()
                      for target in targets}
    for source, target in sorted(support - legacy_support):
        errors.append(f"{source}: new execution dependency on tests or experiments: {target}")
    errors.extend(historical_inventory_errors(root, policy))
    cycles = directed_cycles(graph)
    cycle_policy = policy.get('cycles', {})
    allowed_cycles = {tuple(cycle) for cycle in cycle_policy.get('allowedPackageCycles', [])}
    for cycle in sorted(cycles - allowed_cycles):
        errors.append('new package dependency cycle: ' + ' -> '.join([*cycle, cycle[0]]))
    components, cyclic_edges = cyclic_components(file_graph)
    allowed_edges = {(source, target) for source, targets in cycle_policy.get('allowedModuleCycleImports', {}).items()
                     for target in targets}
    for source, target in sorted(cyclic_edges - allowed_edges):
        errors.append(f'{source}: new cyclic module import {target}')
    return {"files": len(source_paths), "public": len(public),
            "legacyPrivate": len(private & legacy), "retiredLegacy": len(legacy - private),
            "legacySupport": len(support & legacy_support),
            "activeSupport": sum(source in active_sources for source, _ in support),
            "historicalSupport": sum(owner(source) in historical for source, _ in support),
            "retiredSupport": len(legacy_support - support),
            "graph": [list(edge) for edge in sorted(graph)], "errors": errors,
            "packageCycles": [list(cycle) for cycle in sorted(cycles)],
            "moduleCycleComponents": components,
            "moduleCycleImports": sorted(cyclic_edges),
            "retiredPackageCycles": len(allowed_cycles - cycles),
            "retiredModuleCycleImports": len(allowed_edges - cyclic_edges),
            "privateImports": sorted(private), "supportImports": sorted(support)}


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
        current_support = set(report["supportImports"])
        policy["legacySupportImports"] = {
            source: [target for target in targets if (source, target) in current_support]
            for source, targets in policy.get("legacySupportImports", {}).items()
            if any((source, target) in current_support for target in targets)
        }
        if 'cycles' in policy:
            current_cycles = {tuple(cycle) for cycle in report['packageCycles']}
            policy['cycles']['allowedPackageCycles'] = [cycle for cycle in policy['cycles']['allowedPackageCycles']
                                                         if tuple(cycle) in current_cycles]
            current_edges = set(report['moduleCycleImports'])
            policy['cycles']['allowedModuleCycleImports'] = {
                source: [target for target in targets if (source, target) in current_edges]
                for source, targets in policy['cycles']['allowedModuleCycleImports'].items()
                if any((source, target) in current_edges for target in targets)}
        POLICY.write_text(json.dumps(policy, indent=2) + "\n")
    del report["privateImports"]
    del report["supportImports"]
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Module boundaries: {report['files']} files, {report['public']} public imports, "
              f"{report['legacyPrivate']} inherited private imports, "
              f"{report['activeSupport']} active test/experiment dependencies; "
              f"{report['historicalSupport']} frozen historical dependencies.")
        print(f"Dependency cycles: {len(report['packageCycles'])} package cycles; "
              f"{len(report['moduleCycleComponents'])} cyclic file components / "
              f"{len(report['moduleCycleImports'])} imports. New cycles are rejected.")
        if report["retiredLegacy"]:
            action = 'removed' if args.prune else 'can be removed with --prune'
            print(f"{report['retiredLegacy']} inherited exceptions {action}.")
        for error in report["errors"]:
            print(error, file=sys.stderr)
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
