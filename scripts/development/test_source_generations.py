"""Development preparation: source identity, reuse, tampering and publication boundary."""
import copy
import json
from pathlib import Path
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
            {"name": "native-release", "files": [{"path": "packages/source.mjs",
                "sha256": digest, "sourceSHA256": digest, "status": "CHANGED",
                "runtimeMatchesSource": not stale}]}], "artifacts": [],
                "publicationChanged": False, "financialAcceptance": False}

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
        inspection = {"status": "VALIDATED_CANDIDATE", "candidate": {"scope": {"claimsEnabled": False}}}
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
        inspection = {"status": "VALIDATED_CANDIDATE", "candidate": {},
                      "sourceFiles": [{"path": "workspace-module/" + new, "sha256": expected}]}
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            prepared = generations.prepare(report, capture)
        manifest = json.loads((generations.ROOT / prepared["generation"] / "sources.json").read_bytes())
        self.assertEqual(manifest["groups"][0]["files"][0], row)
        self.assertEqual(manifest["currentSourceFiles"][0]["source"], new)
        self.assertEqual(publication.read_bytes(), original_publication)
        self.assertFalse((generations.ROOT / old).exists())
        self.assertFalse(prepared["published"])
        self.assertFalse(prepared["financialAcceptance"])

    def test_relocated_source_tamper_is_changed_and_stale_inspector_cannot_stage(self):
        old, new = "packages/a/src/original.mjs", "packages/b/src/current.mjs"
        original = b"export const version = 1;\n"
        modified = b"export const version = 2;\n"
        expected = generations.sha(original)
        self.write(new, modified)
        self.layout({old: new})
        capture = generations.Capture()
        row = capture.compare(old, expected)
        self.assertEqual(row["status"], "CHANGED")
        self.assertEqual(row["expectedSHA256"], expected)
        self.assertEqual(row["sha256"], generations.sha(modified))
        report = self.report(modified)
        report["groups"][0]["files"] = [row]
        inspection = {"status": "VALIDATED_CANDIDATE", "candidate": {},
                      "sourceFiles": [{"path": "workspace-module/" + new, "sha256": expected}]}
        with patch.object(generations, "inventory", return_value=(report, capture)), \
             patch.object(generations, "inspect_candidate", return_value=inspection):
            with self.assertRaisesRegex(ValueError, "Inspected current source changed"):
                generations.prepare(report, capture)
        self.assertEqual(list((generations.ROOT / ".local/generations").glob("*/candidate-release.json")), [])

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

    def test_duplicate_relocation_key_is_not_silently_overridden(self):
        self.write("scripts/layout.json", b'{"sourceRelocations":{"packages/a/old.mjs":"packages/b/one.mjs",'
                   b'"packages/a/old.mjs":"packages/b/two.mjs"}}')
        with self.assertRaisesRegex(ValueError, "Duplicate layout field"):
            generations.Capture()


if __name__ == "__main__":
    unittest.main()
