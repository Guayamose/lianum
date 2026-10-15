#!/usr/bin/env python3
"""Bounded development checks and explicit environment preparation."""
import argparse
import ast
from collections import defaultdict, deque
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import math

from bounded_process import run_bounded

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).with_name("workflows.json")
NODE_RELATIVE = ".internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node"
IMPORT_PATH = re.compile(r"['\"]((?:\.{1,2}/|@lianum/)[^'\"\n]+)['\"]")


def git(*arguments, root=None):
    return subprocess.check_output(["git", *arguments], cwd=root or ROOT).decode()


def paths(output):
    return [value for value in output.split("\0") if value]


def inventory(root=None):
    return sorted(set(paths(git("ls-files", "-c", "-o", "--exclude-standard", "-z", root=root))))


def changed_files(base=None, root=None):
    # A merge base includes committed branch changes and the current index/worktree.
    baseline = git("merge-base", base, "HEAD", root=root).strip() if base else "HEAD"
    changed = paths(git("diff", "--name-only", "--no-renames", "-z", baseline, "--", root=root))
    changed += paths(git("ls-files", "--others", "--exclude-standard", "-z", root=root))
    return sorted(set(changed))


def relative_path(raw):
    path = Path(raw)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Expected a repository-relative path: {raw}")
    return path.as_posix()


def catalog():
    data = json.loads(CATALOG.read_text())
    if data.get("schema") != "LIANUM_DEVELOPMENT_WORKFLOWS_V1":
        raise ValueError("Unsupported development workflow catalog")
    for component, row in data["components"].items():
        if not row["watch"] or not row["tests"] and not row.get("manual"):
            raise ValueError(f"Empty component check: {component}")
        for value in [*row["watch"], *row["tests"]]:
            relative_path(value)
        for test in row["tests"]:
            if not (ROOT / test).is_file() or not (test.endswith(".test.mjs") or
                    Path(test).name.startswith("test_") and test.endswith(".py")):
                raise ValueError(f"Missing or unsupported host test: {test}")
    return data


def dependency_graph(files, root=None):
    """Conservative literal imports; dynamic dependencies are not claimed as covered."""
    root = root or ROOT
    # Frozen evidence has its own integrity checks. It must not connect today's
    # consumers through obsolete import trees or be reread for every test plan.
    files = [path for path in files if not path.startswith(("archive/", "packages/protocol/"))]
    known = set(files)
    reverse = defaultdict(set)
    exports = {}
    def entry(value):
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            # Node evaluates matching conditions in declaration order.
            for condition, target in value.items():
                if condition in {"import", "node", "default"}:
                    result = entry(target)
                    if result:
                        return result
        return None
    for raw in files:
        path = Path(raw)
        if len(path.parts) != 3 or path.parts[0] not in {"apps", "packages"} or path.name != "package.json":
            continue
        try:
            package = json.loads((root / raw).read_text())
        except (OSError, ValueError):
            continue
        name = package.get("name", "")
        if not name.startswith("@lianum/"):
            continue
        entries = package.get("exports", {})
        if isinstance(entries, str) or isinstance(entries, dict) and not any(key.startswith(".") for key in entries):
            entries = {".": entries}
        if not isinstance(entries, dict):
            continue
        for subpath, value in entries.items():
            target = entry(value)
            if target and target.startswith("./") and "*" not in subpath:
                key = name + (subpath[1:] if subpath != "." else "")
                exports[key] = (os.path.normpath(str(path.parent / target)), raw)
    for raw in files:
        path = root / raw
        if path.suffix not in {".mjs", ".js", ".cjs", ".ts", ".tsx", ".py"} or not path.is_file():
            continue
        text = path.read_text(errors="replace")
        imports = IMPORT_PATH.findall(text)
        if path.suffix == ".py":
            try:
                for node in ast.walk(ast.parse(text)):
                    if isinstance(node, ast.Import):
                        imports.extend("./" + alias.name.replace(".", "/") for alias in node.names)
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        imports.append("./" + node.module.replace(".", "/"))
            except SyntaxError:
                pass  # A syntax failure must remain visible to the selected runner.
        for specifier in imports:
            if specifier.startswith("@lianum/"):
                if specifier in exports:
                    dependency, manifest = exports[specifier]
                    reverse[dependency].add(raw)
                    reverse[manifest].add(raw)
                continue
            candidate = os.path.normpath(str(Path(raw).parent / specifier.split("?")[0]))
            possibilities = [candidate, *[candidate + suffix for suffix in (".mjs", ".js", ".ts", ".tsx", ".py")]]
            for dependency in possibilities:
                if dependency in known:
                    reverse[dependency].add(raw)
                    break
    return reverse


def affected_files(changed, graph):
    affected = set(changed)
    pending = deque(changed)
    while pending:
        for dependent in graph.get(pending.popleft(), ()):
            if dependent not in affected:
                affected.add(dependent)
                pending.append(dependent)
    return affected


def watched(path, prefix):
    return path.startswith(prefix) if prefix.endswith("/") else path == prefix


def test_plan(changed, data, files, components=(), root=None):
    graph = dependency_graph(files, root) if changed else {}
    affected = affected_files(changed, graph)
    selected, reasons, smoke_only, manual = set(), {}, [], {}
    non_code = [path for path in changed if Path(path).suffix in {".md", ".txt", ".svg", ".png", ".jpg"}]
    all_tests = {test for row in data["components"].values() for test in row["tests"]}
    for test in all_tests.intersection(affected):
        selected.add(test)
        reasons[test] = "changed test or literal dependency"
    watched_changes = set()
    for component, row in data["components"].items():
        own_changes = [path for path in changed if path not in non_code
                       and any(watched(path, prefix) for prefix in row["watch"])]
        watched_changes.update(own_changes)
        if row.get("manual") and (own_changes or component in components):
            manual[component] = row["manual"]
        without_dependency = [path for path in own_changes
                              if not affected_files([path], graph).intersection(all_tests)]
        if component in components or without_dependency:
            for test in row["tests"]:
                selected.add(test)
                reasons.setdefault(test, "explicit component" if component in components else "component smoke fallback")
            if component not in components:
                smoke_only.extend(without_dependency)
    # Markdown alone must not trigger even a component smoke check.
    if changed and set(changed).issubset(non_code) and not components:
        selected.clear()
        reasons.clear()
        smoke_only.clear()
        manual.clear()
    unmapped = sorted(set(changed) - watched_changes - set(non_code))
    return {"schema": "LIANUM_DEVELOPMENT_TEST_PLAN_V1", "changedFiles": changed,
            "components": list(components), "testFiles": sorted(selected), "reasons": reasons,
            "unmappedChanges": unmapped, "smokeOnlyChanges": sorted(set(smoke_only)),
            "manualChecksRequired": manual,
            "nonCodeChanges": non_code, "scope": "Curated host/component checks; dynamic imports and economic acceptance require explicit review.",
            "economicCommandsSelected": False}


def environment_status():
    node = ROOT / NODE_RELATIVE
    version = None
    if node.is_file():
        try:
            version = subprocess.check_output([str(node), "--version"], text=True, timeout=5).strip()
        except (OSError, subprocess.SubprocessError):
            pass
    host = {"python": sys.version_info >= (3, 12), "git": shutil.which("git") is not None,
            "node": version == "v24.19.0"}
    dependencies = {"mobile": (ROOT / "apps/mobile/node_modules/typescript/package.json").is_file(),
                    "api-server": (ROOT / "services/api-server/node_modules/pg/package.json").is_file()}
    reports = ROOT / ".internal/dev/reports"
    materials = {name: (reports / name).is_file() for name in
                 ("dependency-package.json", "packages.json", "crs.json", "native-tools.json", "solana-tools.json")}
    return {"schema": "LIANUM_DEVELOPMENT_ENVIRONMENT_V1", "hostReady": all(host.values()),
            "host": host, "nodeVersion": version, "installedDependencyMarkers": dependencies,
            "restorationReportMarkers": materials,
            "integrityChecked": False, "economicReadiness": "NOT_CHECKED",
            "nextCommands": {"host": "./dev prepare host", "mobile": "./dev prepare mobile",
                             "api-server": "./dev prepare api-server", "integrity": "./dev doctor"},
            "scope": "Fast tool/version and presence checks; package markers do not verify a complete install or original artifact integrity."}


def prepare(scope):
    subprocess.run([sys.executable, "-B", str(ROOT / "scripts/development/prepare-host-runtime.py")], cwd=ROOT, check=True)
    if scope != "host":
        subprocess.run([str(ROOT / "dev"), "npm", "--prefix", ("services/api-server" if scope in {"platform", "api-server"} else "apps/" + scope), "ci", "--ignore-scripts"], cwd=ROOT, check=True)
    print(f"Prepared {scope}. Start and lab commands remain explicit; see ./dev workflows.")


def print_plan(plan):
    print(f"Selected {len(plan['testFiles'])} host/component test files.")
    for path in plan["testFiles"]:
        print(f"  {path} ({plan['reasons'][path]})")
    if plan["smokeOnlyChanges"]:
        print("Component smoke only; no literal dependency identified for:")
        for path in plan["smokeOnlyChanges"]:
            print("  " + path)
    if plan["unmappedChanges"]:
        print("No curated automatic check for these changes; choose an explicit check:")
        for path in plan["unmappedChanges"]:
            print("  " + path)
    for component, reason in plan["manualChecksRequired"].items():
        print(f"Manual selection required for {component}: {reason}")
    print(plan["scope"])


def run_plan(plan, maximum, timeout=120):
    if plan["unmappedChanges"] or plan["manualChecksRequired"]:
        print("Checks not started: unmapped changes need an explicit selection.", file=sys.stderr)
        return 2
    if len(plan["testFiles"]) > maximum:
        print(f"Checks not started: selection exceeds --max-files {maximum}. Select --component or set an explicit budget.", file=sys.stderr)
        return 2
    if not plan["testFiles"]:
        print("No executable checks selected; this is not a test pass.")
        return 0
    python_tests = [path for path in plan["testFiles"] if path.endswith(".py")]
    node_tests = [path for path in plan["testFiles"] if path.endswith(".mjs")]
    commands = [[sys.executable, "-B", str(ROOT / path)] for path in python_tests]
    started = time.monotonic()
    for command in commands:
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            print('TIMEOUT: selection exhausted its wall-time budget.', file=sys.stderr)
            return 124
        result = run_bounded(command, cwd=ROOT, timeout_seconds=remaining,
                             log_path=ROOT / '.internal/dev/reports' / (Path(command[-1]).stem + '.log'))
        if result['exitCode']:
            print(f"{result['status']}: {command[-1]}", file=sys.stderr)
            return result['exitCode']
    if node_tests:
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            return 124
        # Give the nested runner time to close its owned group and write its cancellation report.
        result = run_bounded([str(ROOT / 'dev'), 'test', '--timeout', str(remaining), *node_tests],
                             cwd=ROOT, timeout_seconds=remaining, termination_grace=.75)
        return result['exitCode']
    return 0


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "catalog"):
        commands.add_parser(name).add_argument("--json", action="store_true")
    commands.add_parser('help')
    commands.add_parser('docs-check')
    commands.add_parser("prepare").add_argument("scope", nargs="?", default="host", choices=("host", "mobile", "api-server", "platform"))
    tests = commands.add_parser("test")
    choice = tests.add_mutually_exclusive_group(required=True)
    choice.add_argument("--changed", action="store_true")
    choice.add_argument("--component", action="append")
    tests.add_argument("--base")
    tests.add_argument("--plan", action="store_true")
    tests.add_argument("--json", action="store_true")
    tests.add_argument("--max-files", type=int, default=24)
    tests.add_argument('--timeout', type=float, default=120)
    args = parser.parse_args(arguments)
    if args.command == "status":
        report = environment_status()
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print("Host tools: " + ("READY" if report["hostReady"] else "MISSING; run ./dev prepare host"))
            print("Node: " + (report["nodeVersion"] or "missing or unusable"))
            for name, present in report["installedDependencyMarkers"].items():
                print(f"{name} dependency marker: {'present' if present else 'missing; run ./dev prepare ' + name}")
            print(report["scope"])
            print("Economic readiness: NOT_CHECKED. ./dev doctor checks installed tools and current pins; ./dev workflows lists explicit execution paths.")
        return 0 if report["hostReady"] else 1
    if args.command == "prepare":
        prepare(args.scope)
        return 0
    data = catalog()
    if args.command in {'help', 'docs-check'}:
        lines = [f"{row['usage']:<39} {row['description']}" for row in data['commands']]
        if args.command == 'help':
            print('Lianum — ejecutar desde la raíz del proyecto\n' + '\n'.join(lines))
            return 0
        path = ROOT / 'docs/COMMANDS.md'
        expected = '# Comandos de desarrollo\n\nGenerado desde `scripts/development/workflows.json`; `./dev help` usa el mismo catálogo.\n\n```text\n' + '\n'.join(lines) + '\n```\n'
        if not path.is_file() or path.read_text() != expected:
            print('docs/COMMANDS.md no coincide con workflows.json.', file=sys.stderr)
            return 1
        print('Command documentation matches the executable help catalog.')
        return 0
    if args.command == "catalog":
        if args.json:
            print(json.dumps(data, indent=2))
        else:
            print("Component checks: " + ", ".join(data["components"]))
            for row in data["entrypoints"]:
                print(f"[{row['level']}] {row['id']}: {row['command']}\n  {row['entry']}\n  {row['description']}")
        return 0
    if args.base and not args.changed:
        parser.error("--base requires --changed")
    if args.max_files < 1:
        parser.error("--max-files must be positive")
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error('--timeout must be positive')
    if args.json and not args.plan:
        parser.error("--json requires --plan when selecting tests")
    unknown = set(args.component or ()) - set(data["components"])
    if unknown:
        parser.error("Unknown components: " + ", ".join(sorted(unknown)))
    changed = changed_files(args.base) if args.changed else []
    plan = test_plan(changed, data, inventory(), args.component or ())
    if args.json:
        print(json.dumps(plan, indent=2))
    else:
        print_plan(plan)
    if args.plan:
        return 0
    return run_plan(plan, args.max_files, args.timeout)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Development workflow failed: {error}", file=sys.stderr)
        sys.exit(1)
