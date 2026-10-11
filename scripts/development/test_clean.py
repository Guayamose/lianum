"""Exercise cleanup backup and restore against an isolated temporary project."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_cleanup', Path(__file__).with_name('clean.py'))
clean = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clean)


class CleanupTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original = clean.ROOT, clean.HISTORY
        clean.ROOT = Path(self.temporary.name).resolve()
        clean.HISTORY = clean.ROOT / '.local/history'

    def tearDown(self):
        clean.ROOT, clean.HISTORY = self.original
        self.temporary.cleanup()

    def write(self, relative, content=b'private checkpoint', mode=0o600):
        path = clean.ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        path.chmod(mode)
        return path

    def compact(self, paths):
        groups = {name: [] for name in clean.GROUPS}
        groups['drafts'] = paths
        with contextlib.redirect_stdout(io.StringIO()):
            clean.apply(groups, [])

    def restore(self):
        with contextlib.redirect_stdout(io.StringIO()):
            clean.restore('drafts')

    def test_verified_archive_restores_hardlinks_bytes_permissions_and_symlink(self):
        first = self.write('.internal/dev/drafts/old/a')
        second = first.with_name('b')
        os.link(first, second)
        link = first.with_name('pointer')
        link.symlink_to('a')
        self.compact([first.parent])
        self.assertFalse(first.parent.exists())
        self.restore()
        for path in (first, second):
            self.assertEqual(path.read_bytes(), b'private checkpoint')
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(os.readlink(link), 'a')
        self.assertEqual(next(clean.HISTORY.glob('cleanup-*')).stat().st_mode & 0o777, 0o700)

    def test_restore_rejects_all_conflicts_before_creating_other_files(self):
        first = self.write('.internal/dev/drafts/old/a')
        second = self.write('.internal/dev/drafts/old/b')
        self.compact([first.parent])
        second.parent.mkdir(parents=True)
        second.write_bytes(b'new work')
        with self.assertRaisesRegex(RuntimeError, 'conflicts'):
            self.restore()
        self.assertFalse(first.exists())
        self.assertEqual(second.read_bytes(), b'new work')

    def test_corrupt_backup_is_rejected_without_restoring_anything(self):
        first = self.write('.internal/dev/drafts/old/a')
        self.compact([first.parent])
        archive = next(clean.HISTORY.glob('cleanup-*/drafts.tar.gz'))
        with archive.open('ab') as stream:
            stream.write(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            self.restore()
        self.assertFalse(first.exists())

    def test_selection_retains_pending_work_and_rejects_aliased_paths(self):
        keep = self.write('.internal/dev/drafts/current/pending.mjs')
        old = self.write('.internal/dev/drafts/current/old/report.json')
        other = self.write('.internal/dev/drafts/retired/result.json')
        roots = clean.retired_children(clean.ROOT / '.internal/dev/drafts', {keep})
        self.assertEqual(set(roots), {old.parent, other.parent})
        alias = clean.ROOT / 'alias'
        alias.symlink_to(keep.parent, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, 'aliased'):
            clean.physical(alias)

    def test_plan_refuses_a_temporary_copy_containing_versioned_source(self):
        source = self.write('.internal/dev/clean-ci-example/src/keep.mjs')
        with patch.object(clean, 'tracked', return_value={source}):
            with self.assertRaisesRegex(RuntimeError, 'versioned files'):
                clean.plan()
        self.assertEqual(source.read_bytes(), b'private checkpoint')

    def test_noop_and_later_cache_cleanup_leave_previous_archive_restorable(self):
        first = self.write('.internal/dev/drafts/old/a')
        self.compact([first.parent])
        empty = {name: [] for name in clean.GROUPS}
        with contextlib.redirect_stdout(io.StringIO()):
            clean.apply(empty, [])
        self.assertEqual(len(list(clean.HISTORY.glob('cleanup-*'))), 1)
        cache = self.write('.local/temporary/cache')
        with contextlib.redirect_stdout(io.StringIO()):
            clean.apply(empty, [cache.parent])
        self.restore()
        self.assertEqual(first.read_bytes(), b'private checkpoint')

    def test_scopes_separate_disposable_cache_from_history_and_retained_artifacts(self):
        cache = self.write('.local/cache/npm/content')
        artifact = self.write('.internal/dev/cache/public-crs/retained.dat')
        history = self.write('.internal/dev/drafts/old/result.json')
        with patch.object(clean, 'tracked', return_value=set()):
            archives, remove = clean.plan('caches')
            self.assertEqual(remove, [cache.parent])
            self.assertTrue(all(not rows for rows in archives.values()))
            archives, remove = clean.plan('history')
            self.assertEqual(remove, [])
            self.assertEqual(archives['drafts'], [history.parent])
        self.assertEqual(artifact.read_bytes(), b'private checkpoint')

    def test_named_cache_with_tracked_file_cannot_be_removed(self):
        source = self.write('.local/cache/npm/keep.mjs')
        with patch.object(clean, 'tracked', return_value={source}):
            with self.assertRaisesRegex(RuntimeError, 'versioned files'):
                clean.plan('caches')


if __name__ == '__main__':
    unittest.main()
