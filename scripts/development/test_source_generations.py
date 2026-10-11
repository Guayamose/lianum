"""Development preparation: source identity, reuse, tampering and publication boundary."""
import copy
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import source_generations as generations


class SourceGenerationsTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original = generations.ROOT
        generations.ROOT = Path(self.temporary.name).resolve()

    def tearDown(self):
        generations.ROOT = self.original
        self.temporary.cleanup()

    def write(self, name, value):
        path = generations.ROOT / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
        return path

    def layout(self, relocations=None):
        definition = {
            "rules": [{"source": "packages/a/src/", "runtime": "flat/"},
                      {"source": "packages/b/src/", "runtime": "flat/"}],
            "files": [], "sourceRoots": ["packages/a/src/", "packages/b/src/"],
            "importSpellings": {},
        }
        if relocations is not None:
            definition["sourceRelocations"] = relocations
        self.write("scripts/layout.json", json.dumps(definition).encode())

    def report(self, value=b"export const version = 2;", stale=False):
        digest = generations.sha(value)
        return {"schema": "LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1", "groups": [
            {"name": "native-release", "manifest": "release.mjs", "manifestSHA256": "f" * 64, "files": [{"path": "packages/source.mjs",
                "sha256": digest, "sourceSHA256": digest, "status": "CHANGED",
                "runtimeMatchesSource": not stale}]}], "artifacts": [],
                "publicationChanged": False, "financialAcceptance": False,
                "currentSourceContract": self.contract([{"path": "packages/source.mjs", "source": "packages/source.mjs",
                    "sha256": digest, "sourceSHA256": digest, "bytes": len(value), "status": "PRESENT"}])}

    def contract(self, rows):
        return {"schema": "LIANUM_CURRENT_SOURCE_CONTRACT_V2", "roots": [row["source"] for row in rows],
                "files": rows, "sourceClosureSHA256": generations.sha(generations.encoded(rows)),
                "historicalInventoriesModified": False, "financialAcceptance": False}

    def inspection(self):
        return {"status": "VERIFIED_RETAINED_ARTIFACTS", "code": None,
                "published": False, "compiled": False, "financialAcceptance": False,
                "nativeValue": {"artifactBundleIssued": False, "verifierRoles": ["node"],
                    "reuseReceipt": {"schema": "LIANUM_W39_EXACT_PUBLISHED_REUSE_V6"},
                    "nodeReuseReceipt": {"schema": "RETAINED_NODE_COMPILER_REUSE_V1"}},
                "paged": {"schema": "LIANUM_PAGED_EXACT_RETAINED_REUSE_V4", "artifactBundleIssued": False,
                          "roles": {"reserve": {"programSHA256": "f" * 64}}}}

    def closure_fixture(self, roots, relocations=None):
        for name in {generations.RELEASE, *generations.CATALOGS.values(), *generations.CURRENT_SOURCE_INPUTS}:
            self.write(name, b"{}\n")
        self.write("packages/a/package.json", b'{"name":"@lianum/a","exports":{"./main":"./src/main.mjs"}}')
        self.write("packages/b/package.json", b'{"name":"@lianum/b","exports":{"./leaf":"./src/leaf.mjs"}}')
        self.write("apps/mobile/package.json", b'{"dependencies":{"expo-crypto":"1.0.0"}}')
        self.write("apps/platform/package.json", b'{"dependencies":{}}')
        self.write("scripts/development/source-pins.json", b'{"profiles":{"platform":{"dependencyPaths":[]}}}')
        self.layout(relocations)
        capture = generations.Capture()
        return {"groups": [{"files": [capture.observe(path) for path in roots]}]}, capture

    def test_current_closure_follows_real_exports_and_workers_without_rewriting_original_names(self):
        old, current = "packages/a/src/old.mjs", "packages/a/src/main.mjs"
        self.write(current, b"import {value} from '@lianum/b/leaf';\nnew URL('./worker.mjs',import.meta.url);\n")
        self.write("packages/a/src/worker.mjs", b"export const worker=1;\n")
        leaf = self.write("packages/b/src/leaf.mjs", b"export const value=1;\n")
        report, capture = self.closure_fixture([old], {old: current})
        contract = generations.current_source_contract(report, capture)
        names = {row["path"] for row in contract["files"]}
        self.assertTrue({current, "packages/a/src/worker.mjs", "packages/b/src/leaf.mjs",
                         "packages/b/package.json"}.issubset(names))
        self.assertNotIn(old, names)
        self.assertEqual(report["groups"][0]["files"][0]["path"], old)
        self.assertEqual(report["groups"][0]["files"][0]["sourceRelocation"], {"from": old, "to": current})
        leaf.write_bytes(b"export const value=2;\n")
        changed = generations.current_source_contract(report, generations.Capture())
        self.assertNotEqual(changed["sourceClosureSHA256"], contract["sourceClosureSHA256"])
        self.write(current, b"import './old.mjs';\n")
        with self.assertRaisesRegex(ValueError, "Current import still names a relocated source"):
            generations.current_source_contract(report, generations.Capture())

    def test_fixed_current_inputs_use_the_surviving_owner_without_runtime_aliases(self):
        old, current = "packages/a/src/old.mjs", "packages/a/src/main.mjs"
        self.write(current, b"export const value=1;\n")
        report, capture = self.closure_fixture([], {old: current})
        with patch.object(generations, "CURRENT_SOURCE_INPUTS", (old,)):
            contract = generations.current_source_contract(report, capture)
        names = {row["path"] for row in contract["files"]}
        self.assertIn(current, names)
        self.assertNotIn(old, names)
        self.assertTrue(all(row["path"] == row["source"] for row in contract["files"]))
        self.assertFalse((generations.ROOT / old).exists())

    def test_fixed_resources_and_mobile_bundler_are_explicit_and_reject_undeclared_dependencies(self):
        entry = "packages/a/src/main.mjs"
        mobile = "apps/mobile/src/client.mjs"
        self.write(entry, b"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);require('ethers');\n")
        self.write(mobile, b"import {digest} from 'expo-crypto';\n")
        report, capture = self.closure_fixture([entry, mobile])
        contract = generations.current_source_contract(report, capture)
        self.assertEqual(contract["fixedRuntimeResourceBindings"], [{"source": entry, "specifier": "ethers",
                         "acceptance": "FIXED_CONSUMER_VALIDATION_REQUIRED"}])
        self.assertEqual(contract["mobileBundlerBindings"], [{"source": mobile, "specifier": "expo-crypto",
                         "acceptance": "MOBILE_BUNDLER_VALIDATION_REQUIRED"}])
        self.assertFalse(contract["runtimeResourceAcceptanceEstablished"])

        self.write(entry, b"const other=require('undeclared-package');\n")
        with self.assertRaisesRegex(ValueError, "Undeclared fixed runtime package binding"):
            generations.current_source_contract(report, generations.Capture())
        self.write(entry, b"import 'undeclared-package';\n")
        with self.assertRaisesRegex(ValueError, "Current source dependency requires review"):
            generations.current_source_contract(report, generations.Capture())
        self.write(entry, b"export const valid=true;\n")
        self.write(mobile, b"import 'undeclared-mobile-package';\n")
        with self.assertRaisesRegex(ValueError, "Current source dependency requires review"):
            generations.current_source_contract(report, generations.Capture())

    def test_retired_publication_label_needs_no_copy_and_never_shadows_current_code(self):
        old, current = "packages/a/src/retired.mjs", "packages/a/src/main.mjs"
        self.write(current, b"export const value=1;\n")
        self.layout({old: current})
        definition = json.loads(generations.read("scripts/layout.json"))
        definition["retiredRuntimeSources"] = {"flat/retired.mjs": old, "flat/main.mjs": old}
        self.write("scripts/layout.json", json.dumps(definition).encode())
        capture = generations.Capture()
        retired = capture.observe(generations.RUNTIME + "flat/retired.mjs")
        self.assertEqual(retired["source"], current)
        self.assertEqual(retired["runtimeDisposition"], "RETIRED_PUBLICATION_LABEL")
        self.assertNotIn("runtimeMatchesSource", retired)
        self.assertFalse((generations.ROOT / retired["path"]).exists())
        active = capture.observe(generations.RUNTIME + "flat/main.mjs")
        self.assertEqual(active["source"], current)
        self.assertNotIn("sourceRelocation", active)
        self.assertNotIn("runtimeDisposition", active)
        self.assertFalse(active["runtimeMatchesSource"])

    def test_live_canonical_owner_retires_only_its_exact_copy_and_rejects_current_alias_import(self):
        owner, entry = 'packages/a/src/worker.mjs', 'packages/a/src/main.mjs'
        self.write(owner, b'export const worker=1;\n')
        self.write(entry, b"import './worker.mjs';\n")
        self.closure_fixture([entry])
        definition = json.loads(generations.read('scripts/layout.json'))
        definition['canonicalRuntimeSources'] = {'flat/worker.mjs': owner}
        self.write('scripts/layout.json', json.dumps(definition).encode())
        capture = generations.Capture()
        historical = capture.observe(generations.RUNTIME + 'flat/worker.mjs')
        self.assertEqual(historical['source'], owner)
        self.assertEqual(historical['runtimeDisposition'], 'RETIRED_PUBLICATION_LABEL')
        self.assertNotIn('runtimeMatchesSource', historical)
        report = {'groups': [{'files': [historical, capture.observe(entry)]}]}
        current = generations.current_source_contract(report, capture)
        self.assertNotIn(historical['path'], {row['path'] for row in current['files']})
        self.write(entry, b"import '../../../.internal/runtime/flat/worker.mjs';\n")
        with self.assertRaisesRegex(ValueError, 'Current import names a retired runtime copy'):
            generations.current_source_contract(report, generations.Capture())

    def test_frozen_evidence_is_not_a_current_entry_but_operational_imports_are_followed(self):
        frozen, active = "experiments/old/frozen.mjs", "packages/a/src/main.mjs"
        self.write(frozen, b"import './missing-historical-implementation.mjs';\n")
        self.write(active, b"export const current=true;\n")
        report, capture = self.closure_fixture([frozen, active])
        contract = generations.current_source_contract(report, capture)
        self.assertEqual(contract["retainedEvidenceRoots"], [frozen])
        self.assertIn(frozen, {row["path"] for row in contract["files"]})
        self.write(active, b"import '../../../experiments/old/frozen.mjs';\n")
        with self.assertRaisesRegex(ValueError, "Current source dependency is missing"):
            generations.current_source_contract(report, generations.Capture())

    def test_generated_execution_is_checked_before_preparation_and_after_readback_inspection(self):
        value = b"export const version=1;\n"
        report = self.report(value)
        target = ".internal/runtime/entry.mjs"
        report["currentSourceContract"]["files"][0]["path"] = target
        report["currentSourceContract"] = self.contract(report["currentSourceContract"]["files"])
        runtime = self.write(target, b"stale executable")
        capture = SimpleNamespace(objects={generations.sha(value): value})
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate") as inspector:
            self.assertEqual(generations.prepare(report, capture)["code"], "LEGACY_RUNTIME_STALE")
            inspector.assert_not_called()
        runtime.write_bytes(value)
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=self.inspection()):
            prepared = generations.prepare(report, capture)
            digest = Path(prepared["generation"]).name
            self.assertEqual(generations.verify_generation(digest)["verification"], "READBACK_VERIFIED")
            def mutate_during_inspection():
                runtime.write_bytes(b"mutated while inspecting")
                return self.inspection()
            with patch.object(generations, "inspect_candidate", side_effect=mutate_during_inspection):
                with self.assertRaisesRegex(ValueError, "Generated executable changed during readback"):
                    generations.verify_generation(digest)

    def test_adoption_is_idempotent_and_rejects_changed_sources_before_writing(self):
        value = b"export const version=1;\n"
        report = self.report(value)
        self.write("packages/source.mjs", value)
        (generations.ROOT / "scripts/development").mkdir(parents=True)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=self.inspection()):
            prepared = generations.prepare(report, capture)
            digest = Path(prepared["generation"]).name
            self.assertEqual(generations.adopt_generation(digest)["sourceAcceptance"], "ADOPTED_CURRENT_HOST_SOURCES")
            record = generations.ROOT / "scripts/development/adopted-generation.json"
            before = record.read_bytes()
            self.assertEqual(generations.adopt_generation(digest)["written"], [])
            changed = self.report(b"export const version=2;\n")
            with patch.object(generations, "inventory", return_value=(changed, capture)):
                with self.assertRaisesRegex(ValueError, "differ from the candidate"):
                    generations.adopt_generation(digest)
            self.assertEqual(record.read_bytes(), before)

    def test_prepare_adopt_selects_only_the_verified_candidate_and_stays_idempotent(self):
        source = self.write("packages/source.mjs", b"export const version=1;\n")
        (generations.ROOT / "scripts/development").mkdir(parents=True)

        def current():
            value = source.read_bytes()
            return self.report(value), SimpleNamespace(objects={generations.sha(value): value})

        def invoke():
            output = StringIO()
            with patch.object(sys, "argv", ["sources", "prepare", "--adopt", "--json"]), redirect_stdout(output):
                self.assertEqual(generations.main(), 0)
            return json.loads(output.getvalue())

        with patch.object(generations, "workspace_build"), \
             patch.object(generations, "inventory", side_effect=current), \
             patch.object(generations, "check_current_pins", return_value={"status": "CURRENT"}), \
             patch.object(generations, "inspect_candidate", return_value=self.inspection()):
            result = invoke()
            record = generations.ROOT / "scripts/development/adopted-generation.json"
            selected = json.loads(record.read_bytes())
            self.assertEqual(selected["generation"], Path(result["generation"]).name)
            self.assertEqual(result["adoption"]["verification"], "READBACK_VERIFIED")
            self.assertFalse(result["adoption"]["financialAcceptance"])
            before = record.read_bytes()
            self.assertEqual(invoke()["adoption"]["written"], [])
            self.assertEqual(record.read_bytes(), before)

    def test_prepare_adopt_rejects_a_source_change_before_updating_the_selection(self):
        source = self.write("packages/source.mjs", b"export const version=1;\n")
        record = self.write("scripts/development/adopted-generation.json", b"retained prior selection\n")
        before = record.read_bytes()
        original_adopt = generations.adopt_generation

        def current():
            value = source.read_bytes()
            return self.report(value), SimpleNamespace(objects={generations.sha(value): value})

        def changed(digest):
            source.write_bytes(b"export const version=2;\n")
            return original_adopt(digest)

        with patch.object(generations, "workspace_build"), \
             patch.object(generations, "inventory", side_effect=current), \
             patch.object(generations, "check_current_pins", return_value={"status": "CURRENT"}), \
             patch.object(generations, "inspect_candidate", return_value=self.inspection()), \
             patch.object(generations, "adopt_generation", side_effect=changed), \
             patch.object(sys, "argv", ["sources", "prepare", "--adopt", "--json"]), redirect_stdout(StringIO()):
            with self.assertRaisesRegex(ValueError, "differ from the candidate"):
                generations.main()
        self.assertEqual(record.read_bytes(), before)

    def test_prepare_adopt_never_selects_a_blocked_candidate_or_accepts_other_actions(self):
        report = self.report()
        capture = SimpleNamespace(objects={report["groups"][0]["files"][0]["sha256"]: b"export const version = 2;"})
        with patch.object(generations, "workspace_build"), \
             patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "check_current_pins", return_value={"status": "CURRENT"}), \
             patch.object(generations, "inspect_candidate", return_value={"status": "BLOCKED", "code": "ORIGINAL_PIN_CHANGED"}), \
             patch.object(sys, "argv", ["sources", "prepare", "--adopt", "--json"]), redirect_stdout(StringIO()):
            self.assertEqual(generations.main(), 2)
        self.assertFalse((generations.ROOT / "scripts/development/adopted-generation.json").exists())
        for action in ("status", "check", "verify", "adopt"):
            with patch.object(sys, "argv", ["sources", action, "--adopt"]), redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as error:
                    generations.main()
                self.assertEqual(error.exception.code, 2)

    def test_retained_compiler_bodies_are_cached_as_original_evidence_and_tamper_rejected(self):
        value = b"export const version=1;\n"
        report = self.report(value)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        inspection = self.inspection()
        original = b"original compiler body, not executable candidate code\n"
        source = "archive/source-evidence/compiler.source"
        path = self.write(source, original)
        inspection["paged"]["hostSources"] = [{"path": "packages/old-original.mjs", "source": source,
            "sha256": generations.sha(original), "bytes": len(original)}]
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            prepared = generations.prepare(report, capture)
            cached = generations.ROOT / ".local/generations/objects" / generations.sha(original)
            self.assertEqual(cached.read_bytes(), original)
            cached.write_bytes(b"corrupt original evidence")
            with self.assertRaisesRegex(ValueError, "object was modified"):
                generations.verify_generation(Path(prepared["generation"]).name)
            path.write_bytes(b"changed original body")
            with self.assertRaisesRegex(ValueError, "Retained compiler evidence changed"):
                generations.prepare(report, capture)

    def test_reads_editable_sources_and_detects_stale_translated_runtime(self):
        self.layout()
        raw = b"import { value } from '../../b/src/dependency.mjs';\nexport { value };\n"
        self.write("packages/a/src/main.mjs", raw)
        self.write("packages/b/src/dependency.mjs", b"export const value = 42;\n")
        self.write(".internal/runtime/flat/main.mjs", b"old build")
        capture = generations.Capture()
        row = capture.observe(".internal/runtime/flat/main.mjs")
        translated = capture.objects[row["sha256"]]
        self.assertIn(b"from './dependency.mjs'", translated)
        self.assertEqual(row["sourceSHA256"], generations.sha(raw))
        self.assertFalse(row["runtimeMatchesSource"])
        self.assertEqual((generations.ROOT / ".internal/runtime/flat/main.mjs").read_bytes(), b"old build")

    def test_forward_map_handles_new_file_in_shared_historical_directory(self):
        self.layout()
        self.write("packages/b/src/new.mjs", b"export const newModule = true;\n")
        row = generations.Capture().observe(".internal/runtime/flat/new.mjs")
        self.assertEqual(row["source"], "packages/b/src/new.mjs")
        self.assertEqual(row["status"], "PRESENT")

    def test_prepare_is_deduplicated_and_does_not_rewrite_publication(self):
        original = self.write("release.mjs", b"frozen published release")
        value = b"export const version = 2;"
        report = self.report(value)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        inspection = self.inspection()
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            first = generations.prepare(report, capture)
            second = generations.prepare(report, capture)
        self.assertEqual(first["generation"], second["generation"])
        self.assertFalse(first["reusedGeneration"])
        self.assertTrue(second["reusedGeneration"])
        self.assertEqual(second["newSourceObjects"], 0)
        self.assertFalse(second["published"])
        self.assertFalse(second["compiled"])
        self.assertFalse(second["financialAcceptance"])
        self.assertEqual(original.read_bytes(), b"frozen published release")
        self.assertEqual(len(list((generations.ROOT / ".local/generations/objects").iterdir())), 1)

    def test_runtime_refresh_does_not_create_another_source_generation(self):
        value = b"export const version = 2;"
        report = self.report(value, stale=True)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate") as inspector:
            first = generations.prepare(report, capture)
            inspector.assert_not_called()
        report["groups"][0]["files"][0]["runtimeMatchesSource"] = True
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value={"status": "BLOCKED", "code": "ORIGINAL_PIN_CHANGED"}):
            second = generations.prepare(report, capture)
        self.assertEqual(first["generation"], second["generation"])
        self.assertTrue(second["reusedGeneration"])
        self.assertFalse((generations.ROOT / second["generation"] / "candidate-release.json").exists())

    def test_concurrent_source_change_discards_candidate(self):
        value = b"export const version = 2;"
        report = self.report(value)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        changed = copy.deepcopy(report)
        changed["groups"][0]["files"][0]["sha256"] = "0" * 64
        with patch.object(generations, "inventory", side_effect=[(report, capture), (changed, capture)]), \
             patch.object(generations, "inspect_candidate", return_value={"status": "VALIDATED_CANDIDATE", "candidate": {}}):
            with self.assertRaisesRegex(ValueError, "candidate discarded"):
                generations.prepare(report, capture)
        self.assertEqual(list((generations.ROOT / ".local/generations").glob("*/candidate-release.json")), [])

    def test_rejects_alias_escape_and_modified_cached_objects(self):
        target = self.write("public.mjs", b"public")
        (generations.ROOT / "alias.mjs").symlink_to(target)
        for name in ("alias.mjs", "../escape", ".env", ".git/config"):
            with self.assertRaises(ValueError):
                generations.read(name)
        with self.assertRaisesRegex(ValueError, "modified"):
            generations.create_once(target, b"replacement")
        self.assertEqual(target.read_bytes(), b"public")

    def test_relocation_keeps_published_path_and_pin_and_stages_current_inspector_path(self):
        old, new = "packages/a/src/original.mjs", "packages/b/src/current.mjs"
        value = b"export const version = 2;\n"
        expected = generations.sha(value)
        publication = self.write("release.mjs", json.dumps({"path": old, "sha256": expected}).encode())
        original_publication = publication.read_bytes()
        self.write(new, value)
        self.layout({old: new})
        capture = generations.Capture()
        row = capture.compare(generations.label_path("workspace-module/" + old), expected)
        self.assertEqual(row["path"], old)
        self.assertEqual(row["source"], new)
        self.assertEqual(row["expectedSHA256"], expected)
        self.assertEqual(row["status"], "UNCHANGED")
        self.assertEqual(row["sourceRelocation"], {"from": old, "to": new})
        self.assertEqual(capture.objects[row["sha256"]], value)
        report = self.report(value)
        report["groups"][0]["files"] = [row]
        inspection = self.inspection()
        report["currentSourceContract"] = self.contract([dict(capture.observe(new))])
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            prepared = generations.prepare(report, capture)
        manifest = json.loads((generations.ROOT / prepared["generation"] / "sources.json").read_bytes())
        self.assertEqual(manifest["groups"][0]["files"][0], row)
        self.assertEqual(manifest["currentSourceContract"]["files"][0]["source"], new)
        self.assertEqual(publication.read_bytes(), original_publication)
        self.assertFalse((generations.ROOT / old).exists())
        self.assertFalse(prepared["published"])
        self.assertFalse(prepared["financialAcceptance"])

    def test_readback_checks_current_sources_objects_metadata_and_retained_artifacts(self):
        value = b"export const version = 1;\n"
        report = self.report(value)
        capture = SimpleNamespace(objects={generations.sha(value): value})
        inspection = self.inspection()
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            prepared = generations.prepare(report, capture)
            digest = Path(prepared["generation"]).name
            self.assertEqual(generations.verify_generation(digest)["verification"], "READBACK_VERIFIED")
            object_path = generations.ROOT / ".local/generations/objects" / generations.sha(value)
            object_path.write_bytes(b"tamper")
            with self.assertRaisesRegex(ValueError, "object was modified"):
                generations.verify_generation(digest)
            object_path.write_bytes(value)
            candidate_path = generations.ROOT / prepared["generation"] / "candidate-release.json"
            original = candidate_path.read_bytes()
            candidate = json.loads(original)
            candidate["financialAcceptance"] = True
            candidate_path.write_bytes(generations.encoded(candidate))
            with self.assertRaisesRegex(ValueError, "metadata was modified"):
                generations.verify_generation(digest)
            candidate_path.write_bytes(original)
            changed = copy.deepcopy(report)
            changed["groups"][0]["files"][0]["sha256"] = "0" * 64
            with patch.object(generations, "inventory", return_value=(changed, capture)):
                with self.assertRaisesRegex(ValueError, "Current sources"):
                    generations.verify_generation(digest)
            stale = copy.deepcopy(report)
            stale["groups"][0]["files"][0]["runtimeMatchesSource"] = False
            with patch.object(generations, "inventory", return_value=(stale, capture)):
                with self.assertRaisesRegex(ValueError, "Generated executable differs"):
                    generations.verify_generation(digest)
            with patch.object(generations, "inspect_candidate", return_value={"status": "BLOCKED", "code": "TAMPERED_ARTIFACT"}):
                with self.assertRaisesRegex(ValueError, "did not authenticate"):
                    generations.verify_generation(digest)
        for bad in ("../escape", ".local/generations/" + digest, "0" * 63):
            with self.assertRaisesRegex(ValueError, "exact source-generation"):
                generations.verify_generation(bad)

    def test_relocations_reject_existing_missing_unsafe_ambiguous_and_cyclic_paths(self):
        old, new = "packages/a/src/old.mjs", "packages/b/src/new.mjs"
        other = "packages/a/src/other.mjs"
        present = "packages/a/src/present.mjs"
        self.write(new, b"new")
        self.write(present, b"retained original")
        invalid = [[], {old: None}, {present: new}, {old: "packages/b/src/missing.mjs"},
                   {old: "../escape.mjs"}, {"/absolute.mjs": new}, {old: "packages/b/src//new.mjs"},
                   {old: ".local/private.mjs"}, {old: "packages/b/.env/key"},
                   {old: "packages/b/src/secret.key"}, {old: "packages/b/src/evil\0.mjs"},
                   {old: new, other: new}, {old: other, other: new}, {old: other, other: old}]
        for relocations in invalid:
            with self.subTest(relocations=relocations):
                self.layout(relocations)
                with self.assertRaises(ValueError):
                    generations.Capture()

    def test_relocations_reject_symlinks_and_restored_historical_source(self):
        old, new = "packages/a/src/old.mjs", "packages/b/src/new.mjs"
        target = self.write(new, b"current")
        link = generations.ROOT / "packages/b/src/link.mjs"
        link.symlink_to(target)
        self.layout({old: link.relative_to(generations.ROOT).as_posix()})
        with self.assertRaisesRegex(ValueError, "aliased path"):
            generations.Capture()
        link.unlink()
        self.layout({old: new})
        capture = generations.Capture()
        self.write(old, b"restored original")
        with self.assertRaisesRegex(ValueError, "hide an existing source"):
            capture.observe(old)

    def test_retired_collector_and_facade_evidence_is_hash_authenticated_and_not_executed(self):
        old = "packages/a/src/old.mjs"
        raw = b"import './removed-legacy-worker.mjs';\n"
        for family in ['retired-source-collectors', 'retired-facades']:
            with self.subTest(family=family):
                target = "archive/source-evidence/" + family + "/" + generations.sha(raw) + ".source"
                archive = self.write(target, raw)
                report, capture = self.closure_fixture([old], {old: target})
                contract = generations.current_source_contract(report, capture)
                row = next(row for row in contract["files"] if row["source"] == target)
                self.assertEqual(row["sourceSHA256"], generations.sha(raw))
                self.assertEqual(row["sourceDisposition"], "RETAINED_SOURCE_EVIDENCE")
                self.assertFalse(any("removed-legacy-worker" in row["path"] for row in contract["files"]))
                archive.write_bytes(raw + b"// altered\n")
                with self.assertRaisesRegex(ValueError, "evidence was modified"):
                    generations.Capture()

    def test_duplicate_relocation_key_is_not_silently_overridden(self):
        self.write("scripts/layout.json", b'{"sourceRelocations":{"packages/a/old.mjs":"packages/b/one.mjs",'
                   b'"packages/a/old.mjs":"packages/b/two.mjs"}}')
        with self.assertRaisesRegex(ValueError, "Duplicate layout field"):
            generations.Capture()


if __name__ == "__main__":
    unittest.main()
