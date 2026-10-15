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
            ROOT, courier.PUBLIC_ENTRY, courier.ADDITIONAL + courier.PUBLIC_RUNTIME_ROOTS + courier.PUBLIC_SOLIDITY_ROOTS)
        locators = set()
        for path in (ROOT / 'services/paeg-engine/src/public').glob('*.mjs'):
            locators.update(re.findall(r"\b(?:original|load)\(\s*['\"]((?:packages|services)/[^'\"]+\.mjs)['\"]", path.read_text()))
        self.assertGreater(len(locators), 5)
        self.assertEqual(locators - files, set())

    def test_public_defi_compilers_files_are_delivered_and_adopted(self):
        files, _, _ = source_bundle.source_closure(
            ROOT, courier.PUBLIC_ENTRY, courier.ADDITIONAL + courier.PUBLIC_RUNTIME_ROOTS + courier.PUBLIC_SOLIDITY_ROOTS)
        # Discover the actual filesystem inputs of all three public compilers.
        compilers = ROOT / 'packages/backend/src/operations/deployments/defi'
        locators = set()
        for name in ['sepolia-uniswap', 'aave-sepolia', 'morpho-v2-sepolia']:
            self.assertIn((compilers / (name + '-compilation-v4.mjs')).relative_to(ROOT).as_posix(), files)
            locators.update(re.findall(r"['\"](contracts/[^'\"]+\.sol)['\"]", (compilers / (name + '-compilation-v4.mjs')).read_text()))
        self.assertEqual(len(locators), 5)
        self.assertEqual(locators - files, set())
        sys.path.insert(0, str(ROOT / 'scripts/development'))
        import source_generations
        self.assertTrue(locators.issubset(source_generations.CURRENT_SOURCE_INPUTS))


if __name__ == '__main__':
    unittest.main()
