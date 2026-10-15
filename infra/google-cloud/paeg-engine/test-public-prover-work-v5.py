"""Actual public files/hashes/modes and retained cache. Host UID substitutes
the service UID/root owner only; no cryptographic or public-chain acceptance."""
import hashlib
import importlib.util
import os
from pathlib import Path
import pwd
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('public_prover_work', HERE / 'initialize-public-prover-work-v5.py')
work = importlib.util.module_from_spec(spec); spec.loader.exec_module(work)
MAIN = Path('/home/rafa_pradillo/code/Guayamose/hackathons/webank_shenzhen/lianum-project')


class OfflinePublicWork(unittest.TestCase):
    def setUp(self):
        self.context = tempfile.TemporaryDirectory(prefix='lianum-prover-work-host-')
        self.addCleanup(self.context.cleanup)
        self.base = Path(self.context.name); self.workspace = self.base / 'release'; self.directory = self.base / 'work'
        self.owner = pwd.getpwuid(os.getuid()); self.old_uid = work.ROOT_UID; work.ROOT_UID = os.getuid()
        self.addCleanup(setattr,work,'ROOT_UID',self.old_uid)
        source = MAIN / '.internal/runtime/omnichain-product/experiments/private-core-proof/native-notes/.local/crs/2097152'
        dest = self.workspace / work.PUBLIC_CRS; dest.mkdir(parents=True)
        for name,pin in work.PINS.items():
            data = (source / name).read_bytes(); self.assertEqual(len(data),pin[1]); self.assertEqual(hashlib.sha256(data).hexdigest(),pin[0]); (dest / name).write_bytes(data)

    def test_actual_pinned_files_are_retained_readonly_and_reinstall_does_not_replace(self):
        work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        identities = {}
        for name,pin in work.PINS.items():
            path = self.directory / '.bb-crs' / name
            self.assertEqual(path.stat().st_mode & 0o777,0o444); self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),pin[0]); identities[name]=path.stat().st_ino
        derived = self.directory / '.bb-crs' / 'bn254_g1.dat'; derived.write_bytes(b'HOST-derived-cache-retained')
        work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        self.assertEqual(derived.read_bytes(),b'HOST-derived-cache-retained')
        self.assertEqual({name:(self.directory/'.bb-crs'/name).stat().st_ino for name in work.PINS},identities)

    def test_changed_source_rejected_before_work_is_created(self):
        path = self.workspace / work.PUBLIC_CRS / 'bn254_g2.dat'; path.write_bytes(b'x'*128)
        with self.assertRaisesRegex(ValueError,'PUBLIC_INPUT_HASH'):work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        self.assertFalse(self.directory.exists())

    def test_changed_cache_and_alias_are_rejected_without_replacement(self):
        work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        path=self.directory/'.bb-crs'/'bn254_g2.dat'; path.chmod(0o600); path.write_bytes(b'y'*128); path.chmod(0o444)
        with self.assertRaisesRegex(ValueError,'PUBLIC_INPUT_HASH'):work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        self.assertEqual(path.read_bytes(),b'y'*128)
        path.unlink(); path.symlink_to(self.workspace/work.PUBLIC_CRS/'bn254_g2.dat')
        with self.assertRaisesRegex(ValueError,'PUBLIC_INPUT_ALIAS'):work.prepare_public_prover_work(self.workspace,self.directory,self.owner)
        self.assertTrue(path.is_symlink())


if __name__ == '__main__':unittest.main()
