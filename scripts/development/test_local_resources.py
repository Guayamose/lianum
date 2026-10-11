"""Storage policy protects private state and keeps cache moves reversible."""
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

import local_resources as resources


class LocalResourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)

    def write(self, name, data=b'original'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_private_state_originals_and_backups_are_not_cleanup_candidates(self):
        rules = resources.policy()['rules']
        for name in ('.local/owned-bsc-posav1/account/vault', '.local/platform/database',
                     '.local/history/backup.tar.gz', '.internal/runtime/source/proving-key',
                     '.internal/dev/cache/public-crs/proof-data', '.local/mobile/artifacts/app.apk'):
            self.assertFalse(resources.classify(name, rules)['cleanup'])
        self.assertEqual(resources.classify('.local/cache/npm/package', rules)['category'], 'cache')
        self.assertIsNone(resources.classify('.local/unmanaged/data', rules))

    def test_inventory_deduplicates_hardlinks_does_not_follow_links_or_read_secrets(self):
        first = self.write('.local/owned-bsc-posav1/case/vault', b'secret' * 1000)
        os.link(first, first.with_name('copy'))
        first.with_name('outside').symlink_to('/etc')
        self.write('.local/unmanaged/private-name', b'retain me')
        report = resources.inventory(self.root)
        parent_bytes = sum(p.stat().st_blocks * 512 for p in (first.parent, first.parent.parent))
        link_bytes = first.with_name('outside').lstat().st_blocks * 512
        self.assertEqual(report['categories']['private-state']['allocatedBytes'],
                         first.stat().st_blocks * 512 + parent_bytes + link_bytes)
        self.assertFalse(report['privateContentsRead'])
        self.assertEqual(report['unclassifiedRoots'], ['.local/unmanaged'])

    def test_migration_preserves_inode_bytes_and_is_idempotent(self):
        original = self.write('.internal/dev/npm-cache/content', b'reusable cache')
        inode = original.stat().st_ino
        self.assertEqual(len(resources.migrate_caches(self.root)['migrations']), 1)
        self.assertTrue(original.exists())
        result = resources.migrate_caches(self.root, apply=True)
        target = self.root / '.local/cache/npm/content'
        self.assertEqual(target.read_bytes(), b'reusable cache')
        self.assertEqual(target.stat().st_ino, inode)
        self.assertFalse(original.exists())
        self.assertEqual(resources.migrate_caches(self.root, apply=True)['migrations'], [])
        self.assertFalse(result['privateStateChanged'])

    def test_migration_rejects_conflicts_and_aliased_roots(self):
        source = self.write('.internal/dev/npm-cache/content')
        target = self.write('.local/cache/npm/keep', b'new cache')
        with self.assertRaisesRegex(ValueError, 'destination already exists'):
            resources.migrate_caches(self.root, apply=True)
        self.assertEqual(source.read_bytes(), b'original')
        self.assertEqual(target.read_bytes(), b'new cache')
        target.unlink()
        target.parent.rmdir()
        target.parent.symlink_to(source.parent, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'physical disposable'):
            resources.migrate_caches(self.root, apply=True)

    def test_inherited_classification_uses_only_possible_deeper_rules(self):
        data = {'roots': ['.local'], 'categories': {'cache': '', 'private': ''}, 'rules': [
            {'path': '.local/cache', 'category': 'cache', 'cleanup': True},
            {'path': '.local/cache/keep-*', 'category': 'private', 'cleanup': False},
            {'path': '.local/realm-*/account', 'category': 'private', 'cleanup': False},
        ]}
        for number in range(40):
            self.write('.local/cache/packages/package-' + str(number))
        retained = self.write('.local/cache/keep-original/nested/private-name')
        self.write('.local/realm-one/account/vault')
        self.write('.local/unmanaged/do-not-enumerate')
        with patch.object(resources.RuleMatcher, 'descend', wraps=resources.RuleMatcher.descend) as calls:
            with patch.object(Path, 'read_bytes', side_effect=AssertionError('Private content read')):
                report = resources.inventory(self.root, data)
        self.assertLess(calls.call_count, 12)
        self.assertGreater(report['categories']['private']['allocatedBytes'], retained.stat().st_blocks * 512)
        self.assertEqual(report['unclassifiedRoots'], ['.local/unmanaged'])

    def test_migration_rejects_a_versioned_file_inside_a_cache(self):
        original = self.write('.internal/dev/npm-cache/reviewed/config.json')
        subprocess.run(['git', 'add', '-f', '--', str(original.relative_to(self.root))], cwd=self.root, check=True)
        for apply in (False, True):
            with self.subTest(apply=apply), self.assertRaisesRegex(ValueError, 'versioned paths'):
                resources.migrate_caches(self.root, apply=apply)
        self.assertTrue(original.exists())
        self.assertFalse((self.root / '.local/cache/npm').exists())

    def test_migration_rejects_versioned_destination_even_when_missing(self):
        original = self.write('.internal/dev/npm-cache/content')
        target = self.write('.local/cache/npm/reviewed.json')
        subprocess.run(['git', 'add', '-f', '--', str(target.relative_to(self.root))], cwd=self.root, check=True)
        target.unlink()
        target.parent.rmdir()
        with self.assertRaisesRegex(ValueError, 'versioned paths'):
            resources.migrate_caches(self.root, apply=True)
        self.assertTrue(original.exists())

    def test_migration_rechecks_index_after_process_fence(self):
        original = self.write('.internal/dev/npm-cache/content')
        def stage_during_fence(_paths):
            subprocess.run(['git', 'add', '-f', '--', str(original.relative_to(self.root))], cwd=self.root, check=True)
        with patch('clean.ensure_stopped', side_effect=stage_during_fence):
            with self.assertRaisesRegex(ValueError, 'versioned paths'):
                resources.migrate_caches(self.root, apply=True)
        self.assertTrue(original.exists())


if __name__ == '__main__':
    unittest.main()
