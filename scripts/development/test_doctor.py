"""Integrity boundaries when development source differs from the delivery."""
import unittest
from pathlib import Path
from doctor import ROOT, PROJECT, restored_artifact_path


class RestoredArtifactIntegrity(unittest.TestCase):
    def test_only_exact_frozen_source_uses_archived_original(self):
        rows = {"source.mjs": {"sha256": "original"}}
        paths = {"project/source.mjs": "archive/delivery/source-snapshot/source.mjs"}
        self.assertEqual(restored_artifact_path("source.mjs", "original", rows, paths),
                         ROOT / paths["project/source.mjs"])
        self.assertEqual(restored_artifact_path(Path("source.mjs"), "original", rows, paths),
                         ROOT / paths["project/source.mjs"])
        self.assertEqual(restored_artifact_path("source.mjs", "different", rows, paths),
                         PROJECT / "source.mjs")

    def test_dependencies_and_unmapped_sources_keep_active_integrity_checks(self):
        rows = {"source.mjs": {"sha256": "original"}}
        self.assertEqual(restored_artifact_path("tool.wasm", "expected", rows, {}), PROJECT / "tool.wasm")
        self.assertEqual(restored_artifact_path("source.mjs", "original", rows, {}), PROJECT / "source.mjs")


if __name__ == "__main__":
    unittest.main()
