"""Static original-layout regression. Never imports or executes a backend entry."""
import hashlib
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
                    if name.startswith((".", "@", "node:")):
                        names.add(name)
        elif value == "new" and [item for _, item in tokens[index + 1:index + 3]] == ["URL", "("]:
            name = quoted(index + 3)
            if name is not None and name.endswith(".mjs"):
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
    overrides = overrides or {}
    visited, failures, packages = {}, [], {}
    pending = [ENTRY]
    protocol = {"@lianum/mobile-protocol": "authorization.mjs",
                "@lianum/mobile-protocol/original-account-v2": "original-account-review-v2.mjs"}
    while pending:
        source = pending.pop()
        if source in visited: continue
        path = workspace.ROOT / source
        if not path.is_file():
            failures.append({"source": source, "kind": "SOURCE_ABSENT"}); continue
        text = overrides.get(source, path.read_text())
        target = workspace.runtime_relative(source, config)
        if target is None:
            failures.append({"source": source, "kind": "LAYOUT_ABSENT"}); continue
        rendered = translate(text, source, target, config, "runtime",
                             config.get("importSpellings", {}).get(source))[0]
        visited[source] = {"runtime": target, "sha256": hashlib.sha256(text.encode()).hexdigest()}
        original_names, runtime_names = specifiers(text), specifiers(rendered)
        for name in runtime_names:
            if name.startswith("node:"): continue
            if name in protocol:
                pending.append("packages/mobile-protocol/src/" + protocol[name]); continue
            if name.startswith("@noble/"):
                file = workspace.ROOT / "apps/mobile/node_modules" / name
                if not file.is_file(): failures.append({"source": source, "kind": "PINNED_PUBLIC_MODULE_ABSENT", "specifier": name})
                else: packages[name] = hashlib.sha256(file.read_bytes()).hexdigest()
                continue
            if name in ("@aztec/bb.js", "@noir-lang/noir_js", "@noir-lang/noir_wasm"):
                manifest = workspace.RUNTIME / "omnichain-product/experiments/private-core-proof/node_modules" / name / "package.json"
                if not manifest.is_file(): failures.append({"source": source, "kind": "ORIGINAL_PUBLIC_PACKAGE_ABSENT", "specifier": name})
                else: packages[name] = hashlib.sha256(manifest.read_bytes()).hexdigest()
                continue
            if not name.startswith("."):
                failures.append({"source": source, "kind": "UNKNOWN_BARE_MODULE", "specifier": name}); continue
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(target), name))
            physical = inverse.get(resolved)
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
        self.assertEqual(source.count(fixed), 1)
        failed = successor_closure({RECOVERY: source.replace(fixed, rejected)})
        expected = "omnichain-flat-profile/flat-wallet/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs"
        self.assertTrue(any(row.get("runtime") == expected and row["kind"] == "RUNTIME_MODULE_ABSENT"
                            for row in failed["failures"]))


if __name__ == "__main__":
    unittest.main()
