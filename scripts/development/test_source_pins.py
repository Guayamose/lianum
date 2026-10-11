import json
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import source_pins as pins
import source_generations as generations


class SourcePinsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.mobile_raw, self.packages = [], []
        mobile_lock = {"packages": {"": {"name": "mobile"}}}
        for name in ("@noble/curves", "@noble/hashes"):
            record = {"name": name, "version": "1.0.0", "resolved": "https://registry.npmjs.org/example.tgz", "integrity": "sha512-reviewed"}
            self.packages.append(record)
            mobile_lock["packages"]["node_modules/" + name] = {key: value for key, value in record.items() if key != "name"}
            for tail, contents in (("package.json", json.dumps({"name": name, "version": "1.0.0"})), ("index.js", "export const reviewed = true;")):
                path = "apps/mobile/node_modules/" + name + "/" + tail
                self.write(path, contents)
                self.mobile_raw.append({"path": "mobile-app/" + path[len("apps/mobile/"):], "sha256": pins.sha(contents.encode())})
        self.write("apps/mobile/package-lock.json", json.dumps(mobile_lock))
        self.write("apps/mobile/package.json", '{"name":"mobile"}')
        self.write("packages/mobile-protocol/package.json", '{"name":"protocol"}')
        mobile = {key: pins.sha((self.root / path).read_bytes()) for key, path in pins.MOBILE_MANIFESTS.items()}
        mobile.update(packages=self.packages, rawFiles=self.mobile_raw)
        digest = pins.sha(json.dumps(mobile, sort_keys=True, separators=(",", ":")).encode())
        self.write(pins.TARGETS["mobile"], "export const NATIVE_VALUE_DEV_MOBILE_PACKAGE_PINS_V5 = Object.freeze(" + json.dumps(mobile, indent=2) + ");\n"
                   "export const NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5 = '" + digest + "';\n")
        pg = {"version": "1.0.0", "resolved": "https://registry.npmjs.org/pg.tgz", "integrity": "sha512-reviewed"}
        self.write("apps/platform/package-lock.json", json.dumps({"packages": {"": {}, "node_modules/pg": pg}}))
        self.write("apps/platform/package.json", json.dumps({"name": "platform", "dependencies": {"pg": "1.0.0"}}))
        self.write("apps/platform/node_modules/pg/package.json", '{"name":"pg","version":"1.0.0"}')
        self.write("apps/platform/node_modules/pg/index.js", 'export const reviewed = true;')
        self.write("apps/platform/src/run.mjs", 'export const start = () => "ready";')
        self.mutable = ["package.json", "package-lock.json", "src/run.mjs"]
        self.dependencies = ["node_modules/pg/package.json", "node_modules/pg/index.js"]
        rows = [self.row("apps/platform/" + path, path) for path in self.mutable + self.dependencies]
        self.write(pins.TARGETS["platform"], 'const PINS=Object.freeze(' + json.dumps(rows, separators=(",", ":")) + '.map(row=>Object.freeze(row)));\n')
        self.callers = [pins.TARGETS["platform"], "apps/platform/src/run.mjs"]
        self.write(pins.TARGETS["callers"], 'const reviewedCallers = Object.freeze([\n' + "".join(
            '  Object.freeze(' + json.dumps(self.row(path, path), separators=(",", ":")) + '),\n' for path in self.callers) + ']);\n')
        policy = {"schema": "LIANUM_CURRENT_SOURCE_PIN_POLICY_V1", "profiles": {
            "mobile": {"target": pins.TARGETS["mobile"], "manifests": pins.MOBILE_MANIFESTS,
                       "packages": [row["name"] for row in self.packages], "rawPaths": [row["path"] for row in self.mobile_raw]},
            "platform": {"target": pins.TARGETS["platform"], "mutablePaths": self.mutable, "dependencyPaths": self.dependencies,
                         "packages": {"node_modules/pg": pg}, "dependencies": {"pg": "1.0.0"}},
            "callers": {"target": pins.TARGETS["callers"], "mutablePaths": self.callers}}}
        self.write(pins.POLICY, json.dumps(policy))
        self.historical = "packages/backend/src/operations/releases/native-value/native-value-dev-release-v5.mjs"
        self.write(self.historical, 'export const ORIGINAL = "unchanged historical publication";')

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def row(self, path, label):
        value = (self.root / path).read_bytes()
        return {"path": label, "bytes": len(value), "sha256": pins.sha(value)}

    def before(self):
        return {name: (self.root / name).read_bytes() for name in (*pins.TARGETS.values(), self.historical)}

    def test_current_is_read_only_and_update_is_idempotent(self):
        original = self.before()
        result = pins.run(root=self.root)
        self.assertEqual(result["status"], "CURRENT")
        self.assertEqual(result["changes"], [])
        times = {name: (self.root / name).stat().st_mtime_ns for name in original}
        self.assertEqual(pins.run("update", root=self.root)["written"], [])
        self.assertEqual(self.before(), original)
        self.assertEqual(times, {name: (self.root / name).stat().st_mtime_ns for name in original})

    def test_update_current_sources_and_dependent_capsule_preserves_originals(self):
        original = self.before()
        self.write("apps/platform/src/run.mjs", 'export const start = () => "changed";')
        self.write("packages/mobile-protocol/package.json", '{"name":"protocol","exports":{".":"./entry.mjs"}}')
        check = pins.run(root=self.root)
        self.assertEqual(check["status"], "STALE")
        self.assertEqual(self.before(), original)
        self.assertTrue(check["diffs"])
        self.assertEqual({change["profile"] for change in check["changes"]}, {"mobile", "platform", "callers"})
        result = pins.run("update", root=self.root)
        self.assertEqual(set(result["written"]), set(pins.TARGETS.values()))
        self.assertFalse(result["published"])
        self.assertFalse(result["financialAcceptance"])
        self.assertEqual((self.root / self.historical).read_bytes(), original[self.historical])
        self.assertEqual(pins.run(root=self.root)["status"], "CURRENT")
        self.assertEqual(pins.run("update", root=self.root)["written"], [])

    def test_platform_includes_its_reviewed_caller_hash_in_same_update(self):
        self.write("apps/platform/src/run.mjs", 'export const start = () => "new code";')
        result = pins.run("update", "platform", self.root)
        self.assertEqual(result["profiles"], ["platform", "callers"])
        self.assertEqual(set(result["written"]), {pins.TARGETS["platform"], pins.TARGETS["callers"]})
        self.assertEqual(pins.run(root=self.root)["status"], "CURRENT")

    def test_runtime_update_preserves_assertions_and_unlisted_historical_pins(self):
        source, target = "packages/backend/src/guard.mjs", "tests/integration/scope.mjs"
        self.write(source, "export const guard = 'original';\n")
        original_digest = pins.sha((self.root / source).read_bytes())
        self.write(target, "const helperSHA='" + original_digest + "';\nconst originalPin='" + "ab" * 32 + "';\n")
        policy = json.loads((self.root / pins.POLICY).read_text())
        policy["profiles"]["runtime"] = {"bindings": [
            {"target": target, "source": source, "declaration": "const helperSHA="}]}
        self.write(pins.POLICY, json.dumps(policy))
        self.write(source, "export const guard = 'reviewed change';\n")
        original = (self.root / target).read_bytes()
        self.assertEqual(pins.run("check", "runtime", self.root)["status"], "STALE")
        self.assertEqual((self.root / target).read_bytes(), original)
        result = pins.run("update", "runtime", self.root)
        self.assertEqual(result["written"], [target])
        self.assertIn(pins.sha((self.root / source).read_bytes()), (self.root / target).read_text())
        self.assertIn("const originalPin='" + "ab" * 32, (self.root / target).read_text())
        self.assertEqual(pins.run("check", "runtime", self.root)["status"], "CURRENT")
        self.write(target, (self.root / target).read_text() + "const helperSHA='" + "cd" * 32 + "';\n")
        before = (self.root / target).read_bytes()
        with self.assertRaisesRegex(ValueError, "Expected one runtime pin"):
            pins.run("update", "runtime", self.root)
        self.assertEqual((self.root / target).read_bytes(), before)

    def test_runtime_record_updates_bytes_and_hash_with_other_pin_in_same_file(self):
        source, caller, target = "packages/backend/src/guard.mjs", "apps/platform/src/caller.mjs", "packages/backend/src/owner.mjs"
        self.write(source, "export const guard = 1;\n")
        self.write(caller, "export const caller = 1;\n")
        old = {"path": caller, "bytes": len((self.root / caller).read_bytes()), "sha256": pins.sha((self.root / caller).read_bytes())}
        self.write(target, "const helperSHA='" + pins.sha((self.root / source).read_bytes()) + "';\n"
                   + "const callerPin=Object.freeze(" + json.dumps(old) + ");\n"
                   + "assert.equal(actual.sha256,callerPin.sha256);\nconst historical='" + "ab" * 32 + "';\n")
        policy = json.loads((self.root / pins.POLICY).read_text())
        policy["profiles"]["runtime"] = {"bindings": [{"target": target, "source": source, "declaration": "const helperSHA="}],
            "records": [{"target": target, "source": caller, "declaration": "const callerPin=Object.freeze("}]}
        self.write(pins.POLICY, json.dumps(policy))
        self.write(source, "export const guard = 2;\n")
        self.write(caller, "export const caller = 'reviewed longer source';\n")
        result = pins.run("update", "runtime", self.root)
        self.assertEqual(result["written"], [target])
        text = (self.root / target).read_text()
        self.assertIn(pins.sha((self.root / source).read_bytes()), text)
        self.assertIn(json.dumps({"path": caller, "bytes": len((self.root / caller).read_bytes()),
                      "sha256": pins.sha((self.root / caller).read_bytes())}, separators=(",", ":")), text)
        self.assertIn("assert.equal(actual.sha256,callerPin.sha256);", text)
        self.assertIn("const historical='" + "ab" * 32, text)
        self.assertEqual(pins.run("check", "runtime", self.root)["status"], "CURRENT")
        self.write(target, text.replace('"path":"' + caller + '"', '"path":"apps/platform/src/other.mjs"'))
        before = (self.root / target).read_bytes()
        with self.assertRaisesRegex(ValueError, "exact reviewed source"):
            pins.run("update", "runtime", self.root)
        self.assertEqual((self.root / target).read_bytes(), before)

    def test_runtime_record_chain_uses_updated_launcher_and_preserves_guard_table(self):
        product = 'scripts/development/mobile-product.mjs'
        entry = 'apps/platform/src/mobile-entry.mjs'
        host = 'packages/backend/src/mobile-host.mjs'
        self.write(product, 'export const version = 1;\n')
        product_pin = json.dumps(self.row(product, product), separators=(',', ':'))
        self.write(entry, 'const productPin=Object.freeze(' + product_pin + ');\n'
                   'assert.equal(actual.sha256,productPin.sha256);\n')
        entry_pin = json.dumps(self.row(entry, entry), separators=(',', ':'))
        guard_table = ('const MOBILE_SOURCES=Object.freeze([MOBILE_PRODUCT_PIN,MOBILE_ENTRY_PIN]);\n'
                       'for(const pin of MOBILE_SOURCES) assert.equal(readHash(pin.path),pin.sha256);\n')
        self.write(host, 'const MOBILE_PRODUCT_PIN=Object.freeze(' + product_pin + ');\n'
                   'const MOBILE_ENTRY_PIN=Object.freeze(' + entry_pin + ');\n' + guard_table)
        policy = json.loads((self.root / pins.POLICY).read_text())
        policy['profiles']['runtime'] = {'bindings': [], 'records': [
            {'target': entry, 'source': product, 'declaration': 'const productPin=Object.freeze('},
            {'target': host, 'source': product, 'declaration': 'const MOBILE_PRODUCT_PIN=Object.freeze('},
            {'target': host, 'source': entry, 'declaration': 'const MOBILE_ENTRY_PIN=Object.freeze('},
        ]}
        self.write(pins.POLICY, json.dumps(policy))
        self.write(product, 'export const version = "reviewed longer source";\n')
        historical = (self.root / self.historical).read_bytes()
        result = pins.run('update', 'runtime', self.root)
        self.assertEqual(set(result['written']), {entry, host})
        for target, marker, source in [(entry, 'const productPin=Object.freeze(', product),
                                       (host, 'const MOBILE_PRODUCT_PIN=Object.freeze(', product),
                                       (host, 'const MOBILE_ENTRY_PIN=Object.freeze(', entry)]:
            text = (self.root / target).read_text()
            record, _, _ = pins.json_at(text, pins.marker_start(text, marker))
            self.assertEqual(record, self.row(source, source))
        self.assertIn(guard_table, (self.root / host).read_text())
        self.assertIn('assert.equal(actual.sha256,productPin.sha256);', (self.root / entry).read_text())
        self.assertEqual((self.root / self.historical).read_bytes(), historical)
        self.assertEqual(pins.run('check', 'runtime', self.root)['status'], 'CURRENT')
        self.assertEqual(pins.run('update', 'runtime', self.root)['written'], [])

    def test_changed_dependency_bytes_cannot_be_rebaselined(self):
        original = self.before()
        for path in ("apps/mobile/node_modules/@noble/curves/index.js", "apps/platform/node_modules/pg/index.js"):
            with self.subTest(path=path):
                saved = (self.root / path).read_bytes()
                self.write(path, 'export const changed = true;')
                with self.assertRaisesRegex(ValueError, "Immutable public dependency bytes changed"):
                    pins.run("update", root=self.root)
                self.assertEqual(self.before(), original)
                (self.root / path).write_bytes(saved)

    def test_new_dependency_or_changed_integrity_requires_review(self):
        original = self.before()
        for root in ("apps/mobile", "apps/platform"):
            with self.subTest(root=root):
                path = self.root / root / "package-lock.json"
                saved = path.read_bytes()
                lock = json.loads(saved)
                name = next(name for name in lock["packages"] if name)
                lock["packages"][name]["integrity"] = "sha512-unreviewed"
                path.write_text(json.dumps(lock))
                with self.assertRaisesRegex(ValueError, "Public dependency lock changed"):
                    pins.run("update", root=self.root)
                self.assertEqual(self.before(), original)
                path.write_bytes(saved)

    def test_undeclared_paths_and_duplicate_rows_are_rejected(self):
        target = self.root / pins.TARGETS["callers"]
        saved = target.read_text()
        for suffix in ('Object.freeze({"path":"apps/platform/src/new.mjs","bytes":0,"sha256":"' + '0' * 64 + '"}),',
                       'Object.freeze(' + json.dumps(self.row(self.callers[0], self.callers[0])) + '),'):
            target.write_text(saved.replace(']);', suffix + '\n]);'))
            with self.assertRaisesRegex(ValueError, "Pin paths differ"):
                pins.run("update", "callers", self.root)
        target.write_text(saved)

    def test_private_paths_and_symlinks_fail_without_writes(self):
        original = self.before()
        path = self.root / "apps/platform/src/run.mjs"
        path.unlink()
        path.symlink_to(self.root / self.historical)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            pins.run("update", root=self.root)
        self.assertEqual(self.before(), original)
        for private in ("../outside", ".local/private.json", "apps/platform/.env", "archive/receipt.json"):
            with self.assertRaises(ValueError):
                pins.public_path(private)

    def test_concurrent_source_change_rejects_before_any_write(self):
        original = self.before()
        self.write("apps/platform/src/run.mjs", 'export const start = () => "version 2";')
        plan = pins.Plan(self.root, "platform").build()
        self.write("apps/platform/src/run.mjs", 'export const start = () => "version 3";')
        with self.assertRaisesRegex(ValueError, "Concurrent input change"):
            plan.apply()
        self.assertEqual(self.before(), original)

    def test_concurrent_change_during_replace_rolls_back_only_our_writes(self):
        original = self.before()
        self.write("apps/platform/src/run.mjs", 'export const start = () => "version 2";')
        plan = pins.Plan(self.root, "platform").build()
        replace = pins.os.replace
        changed = False

        def concurrent(source, destination):
            nonlocal changed
            replace(source, destination)
            if not changed:
                changed = True
                self.write("apps/platform/src/run.mjs", 'export const start = () => "concurrent editor";')

        with patch.object(pins.os, "replace", side_effect=concurrent):
            with self.assertRaisesRegex(ValueError, "Concurrent input change"):
                plan.apply()
        self.assertEqual(self.before(), original)
        self.assertIn("concurrent editor", (self.root / "apps/platform/src/run.mjs").read_text())
        self.assertEqual(list(self.root.rglob(".source-pins-*")), [])

    def test_preparation_stops_with_actionable_diff_without_updating_pins(self):
        original = self.before()
        self.write("packages/mobile-protocol/package.json", '{"name":"protocol","version":"2"}')
        output = StringIO()
        with patch.object(generations, "ROOT", self.root), patch.object(generations.sys, "argv", ["sources", "prepare", "--json"]), \
             patch.object(generations, "inventory") as inventory, patch.object(generations, "workspace_build") as build, redirect_stdout(output):
            self.assertEqual(generations.main(), 2)
        result = json.loads(output.getvalue())
        self.assertEqual(result["code"], "CURRENT_MOBILE_PINS_STALE")
        self.assertEqual(result["next"], "./dev pins check --profile mobile --json")
        self.assertTrue(result["pins"]["changes"])
        inventory.assert_not_called()
        build.assert_not_called()
        self.assertEqual(self.before(), original)


if __name__ == "__main__":
    unittest.main()
