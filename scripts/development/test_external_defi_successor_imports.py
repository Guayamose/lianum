"""Static original-layout regression. Never imports or executes a backend entry."""
import hashlib
import json
import os
import posixpath
from pathlib import Path
import re
import unittest

import workspace
from import_paths import translate

ENTRY = "tests/integration/chains/evm/external-defi-vault-exit-successor-v1.mjs"
RECOVERY = "packages/backend/src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs"
FIXTURES = tuple("packages/backend/tests/fixtures/operations/deployments/system/" + name
                 for name in ("official-aave-fixture-v1.mjs", "official-protocol-fixture-v3.mjs"))
# Ignore comments before locating exact quoted specifiers, including fixed
# conditional imports. The original translator remains the only path mapper.
TOKENS = re.compile(r"//[^\n]*|/\*[\s\S]*?\*/|(?P<string>'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")|(?P<identifier>[A-Za-z_$][A-Za-z0-9_$]*)|(?P<punct>[^\s])")


def specifiers(text):
    tokens = [(m.lastgroup, m.group()) for m in TOKENS.finditer(text) if m.lastgroup]
    names = set()
    def quoted(index):
        if index < len(tokens) and tokens[index][0] == "string":
            value = tokens[index][1][1:-1]
            if "\\" in value:
                raise AssertionError("STATIC_IMPORT_ESCAPED_SPECIFIER")
            return value
        return None
    for index, (_, value) in enumerate(tokens):
        if value == "from" or (value == "import" and index + 1 < len(tokens) and tokens[index + 1][1] != "("):
            name = quoted(index + 1)
            if name is not None:
                names.add(name)
        elif value == "import" and index + 1 < len(tokens) and tokens[index + 1][1] == "(":
            depth = 1
            for kind, item in tokens[index + 2:]:
                if item == "(": depth += 1
                if item == ")": depth -= 1
                if depth == 0: break
                if kind == "string":
                    name = item[1:-1]
                    if name.startswith(("@", "node:")) or (name.startswith(".") and name.endswith((".mjs", ".js", ".ts"))):
                        names.add(name)
        elif value == "new" and [item for _, item in tokens[index + 1:index + 3]] == ["URL", "("]:
            name = quoted(index + 3)
            parent = [item for _, item in tokens[index + 4:index + 11]]
            if name is not None and name.endswith(".mjs") and parent == [",", "import", ".", "meta", ".", "url", ")"]:
                names.add(name)
    return names


def successor_closure(overrides=None):
    """Resolve only the reachable fixed successor modules through translate()."""
    config = workspace.layout()
    # New physical modules need the same forward mapping used by build(); the
    # historical layout file cannot reverse its collapsed domain directories.
    inverse = {}
    for raw in config.get("sourceRoots", []):
        start = workspace.ROOT / raw
        if start.is_file():
            candidates = [start]
        else:
            candidates = []
            for parent, dirs, files in os.walk(start):
                dirs[:] = [name for name in dirs if name not in workspace.IGNORED]
                candidates.extend(Path(parent) / name for name in files if name.endswith(".mjs"))
        for file in candidates:
            source = file.relative_to(workspace.ROOT).as_posix()
            mapped = workspace.runtime_relative(source, config)
            if mapped is not None:
                if mapped in inverse and inverse[mapped] != source:
                    raise AssertionError("STATIC_LAYOUT_MODULE_ALIAS")
                inverse[mapped] = source
    virtual_prefix = ".internal/runtime/"
    canonical = set(config.get("canonicalRuntimeSources", {}).values())
    overrides = overrides or {}
    visited, failures, packages = {}, [], {}
    pending = [ENTRY]
    def public_package(source, name):
        """Locate actual public package metadata; exact fixed ESM subpaths remain data."""
        parts = name.split("/")
        package = "/".join(parts[:2]) if name.startswith("@") else parts[0]
        subpath = name[len(package):].lstrip("/")
        if package in ("@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"):
            directory = workspace.RUNTIME / "omnichain-product/experiments/private-core-proof/node_modules" / package
        else:
            declared = False
            for parent in (workspace.ROOT / source).parents:
                if parent != workspace.ROOT and workspace.ROOT not in parent.parents:
                    break
                manifest = parent / "package.json"
                if manifest.is_file():
                    owner = json.loads(manifest.read_text())
                    declared = package == owner.get("name") or package in owner.get("dependencies", {})
                    break
            if not declared:
                failures.append({"source": source, "kind": "UNKNOWN_BARE_MODULE", "specifier": name})
                return
            directory = None
            for parent in (workspace.ROOT / source).parents:
                if parent != workspace.ROOT and workspace.ROOT not in parent.parents:
                    break
                candidate = parent / "node_modules" / package
                if (candidate / "package.json").is_file():
                    directory = candidate
                    break
        if directory is None or not (directory / "package.json").is_file():
            failures.append({"source": source, "kind": "ORIGINAL_PUBLIC_PACKAGE_ABSENT", "specifier": name})
            return
        metadata = json.loads((directory / "package.json").read_text())
        exports = metadata.get("exports")
        if isinstance(exports, dict) and any(key.startswith(".") for key in exports):
            entry = workspace.node_export(exports.get("./" + subpath if subpath else "."))
        elif exports is not None and not subpath:
            entry = workspace.node_export(exports)
        else:
            entry = subpath or metadata.get("main")
        # The official resource loader reads these physical entry files through
        # its pinned package resource, rather than an arbitrary Node subpath.
        if entry is None and subpath and package in ("@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"):
            entry = subpath
        if not isinstance(entry, str) or Path(entry).is_absolute() or ".." in Path(entry).parts:
            failures.append({"source": source, "kind": "PUBLIC_MODULE_EXPORT_ABSENT", "specifier": name})
            return
        file = directory / entry
        if not file.is_file() or file.is_symlink():
            failures.append({"source": source, "kind": "PINNED_PUBLIC_MODULE_ABSENT", "specifier": name})
            return
        packages[name] = hashlib.sha256(file.read_bytes()).hexdigest()
    while pending:
        source = pending.pop()
        if source in visited: continue
        path = workspace.ROOT / source
        if not path.is_file():
            failures.append({"source": source, "kind": "SOURCE_ABSENT"}); continue
        text = overrides.get(source, path.read_text())
        target = workspace.runtime_relative(source, config)
        current_owner = source in canonical or target is None
        execution = source if current_owner else virtual_prefix + target
        rendered = text if current_owner else translate(text, source, target, config, "runtime",
                             config.get("importSpellings", {}).get(source))[0]
        visited[source] = {"runtime": target, "execution": execution,
                           "sha256": hashlib.sha256(text.encode()).hexdigest()}
        original_names, runtime_names = specifiers(text), specifiers(rendered)
        for name in runtime_names:
            if name.startswith("node:"): continue
            if name.startswith("@lianum/"):
                physical = config["_workspaceExports"].get(name)
                if physical is None or not (workspace.ROOT / physical).is_file():
                    failures.append({"source": source, "kind": "PUBLIC_WORKSPACE_EXPORT_ABSENT", "specifier": name})
                else:
                    pending.append(physical)
                continue
            if not name.startswith("."):
                public_package(source, name)
                continue
            resolved_execution = posixpath.normpath(posixpath.join(posixpath.dirname(execution), name))
            in_runtime = resolved_execution.startswith(virtual_prefix)
            resolved = resolved_execution[len(virtual_prefix):] if in_runtime else resolved_execution
            physical = inverse.get(resolved) if in_runtime else resolved
            if physical is None or not (workspace.ROOT / physical).is_file():
                failures.append({"source": source, "kind": "RUNTIME_MODULE_ABSENT", "runtime": resolved}); continue
            if Path(physical).suffix == ".mjs": pending.append(physical)
        # Fixed new URL literals are intentionally not rewritten. Resolve them
        # through the same runtime location, exactly as an actual import would.
        for name in original_names:
            if name.startswith(".") and name.endswith(".mjs"):
                physical = posixpath.normpath(posixpath.join(posixpath.dirname(source), name))
                if (workspace.ROOT / physical).is_file() and physical not in visited:
                    # Conditional alternatives are all part of the closure.
                    pending.append(physical)
    return {"modules": visited, "failures": failures, "publicPackageSHA256": packages}


class ExternalDefiSuccessorImportsTests(unittest.TestCase):
    def test_original_translation_resolves_both_fixtures_and_complete_successor(self):
        closure = successor_closure()
        self.assertEqual(closure["failures"], [])
        for fixture in FIXTURES:
            self.assertIn(fixture, closure["modules"])
        # Reintroduce only the actual rejected shape, in memory. The genuine
        # translator must leave its wrong runtime path unresolved; no entry runs.
        source = (workspace.ROOT / RECOVERY).read_text()
        a, b = ("../../../tests/fixtures/operations/deployments/system/" + Path(f).name for f in FIXTURES)
        fixed = f"row.vault.variant==='AAVE_STATIC'?await import('{a}'):await import('{b}')"
        rejected = f"await import(row.vault.variant==='AAVE_STATIC'?'{a}':'{b}')"
        # The current composition owns two separate lazy loaders. Retain the
        # old parser regression as an inert in-memory consumer, without putting
        # a conditional module selector back into that production composition.
        self.assertNotIn(rejected, source)
        restored = successor_closure({RECOVERY: source + "\n" + fixed + ";\n"})
        self.assertEqual(restored["failures"], [])
        failed = successor_closure({RECOVERY: source + "\n" + rejected + ";\n"})
        expected = "omnichain-flat-profile/flat-wallet/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs"
        self.assertTrue(any(row.get("runtime") == expected and row["kind"] == "RUNTIME_MODULE_ABSENT"
                            for row in failed["failures"]))


if __name__ == "__main__":
    unittest.main()
