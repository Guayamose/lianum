"""Check the actual service's fixed dynamic locators without starting it."""
import importlib.util
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/development'))
import source_bundle

spec = importlib.util.spec_from_file_location('courier', Path(__file__).with_name('package-demo.py'))
courier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(courier)


class PublicRuntimeClosureTests(unittest.TestCase):
    def test_every_fixed_candidate_locator_in_public_service_is_delivered(self):
        files, _, _ = source_bundle.source_closure(
            ROOT, courier.PUBLIC_ENTRY, courier.ADDITIONAL + courier.PUBLIC_RUNTIME_ROOTS)
        locators = set()
        for path in (ROOT / 'services/paeg-engine/src/public').glob('*.mjs'):
            locators.update(re.findall(r"\b(?:original|load)\(\s*['\"]((?:packages|services)/[^'\"]+\.mjs)['\"]", path.read_text()))
        self.assertGreater(len(locators), 5)
        self.assertEqual(locators - files, set())


if __name__ == '__main__':
    unittest.main()
