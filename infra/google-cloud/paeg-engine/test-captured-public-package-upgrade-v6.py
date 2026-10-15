import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('prior_tests',Path(__file__).with_name('test-partial-public-code-upgrade-v5.py'))
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
class CapturedPackageUpgradeTests(prior.PartialCodeUpgradeTests):
    def fixture(self,mode):
        with patch.object(prior,'SCRIPT',Path(__file__).with_name('upgrade-captured-public-package-v6.sh')):
            return super().fixture(mode)
    def test_existing_runtime_code_cannot_be_changed_by_package_repair(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('changed-runtime')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((opt/'current').readlink(),opt/'releases'/old)
        self.assertEqual(unit.read_text(),'old-unit')
if __name__=='__main__':unittest.main()
