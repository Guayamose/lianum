"""Short regressions for streaming, deadlines, cancellation and child cleanup."""
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

from bounded_process import run_bounded
from run_tests import revision


class BoundedProcessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def run_code(self, code, **options):
        return run_bounded([sys.executable, '-u', '-c', code], cwd=self.root,
                           output=options.pop('output', io.StringIO()), **options)

    def test_streams_before_process_finishes_and_preserves_exit(self):
        observed = []
        class Output(io.StringIO):
            def write(self, text):
                observed.append(time.monotonic())
                return super().write(text)
        started = time.monotonic()
        result = self.run_code("import time; print('ready'); time.sleep(.15); raise SystemExit(7)",
                               output=Output(), log_path=self.root / 'log', timeout_seconds=2)
        self.assertLess(observed[0] - started, result['durationSeconds'] - .05)
        self.assertEqual(result['exitCode'], 7)
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual((self.root / 'log').read_text(), 'ready\n')

    def test_timeout_stops_same_group_grandchild(self):
        child = "import signal,time; signal.signal(signal.SIGTERM,signal.SIG_IGN); time.sleep(60)"
        code = ("import subprocess,sys,time; from pathlib import Path; "
                f"p=subprocess.Popen([sys.executable,'-c',{child!r}]); "
                "Path('child.pid').write_text(str(p.pid)); time.sleep(60)")
        result = self.run_code(code, timeout_seconds=.15)
        self.assertEqual((result['status'], result['exitCode']), ('TIMEOUT', 124))
        child_pid = int((self.root / 'child.pid').read_text())
        stat = Path(f'/proc/{child_pid}/stat')
        deadline = time.monotonic() + .3
        while stat.exists() and stat.read_text().split()[2] != 'Z' and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertTrue(not stat.exists() or stat.read_text().split()[2] == 'Z')

    def test_output_limit_is_failure_and_bounds_log(self):
        result = self.run_code("print('x' * 10000)", max_output_bytes=100,
                               log_path=self.root / 'log', timeout_seconds=2)
        self.assertEqual((result['status'], result['exitCode']), ('OUTPUT_LIMIT', 125))
        self.assertEqual((self.root / 'log').stat().st_size, 100)

    def test_successful_parent_cannot_leave_background_child(self):
        code = "import subprocess,sys; subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'])"
        result = self.run_code(code, timeout_seconds=1)
        self.assertEqual(result['status'], 'ORPHANED_PROCESS')
        self.assertEqual(result['exitCode'], 125)

    def test_sigterm_records_cancellation_instead_of_pass(self):
        script = self.root / 'runner.py'
        helper = str(Path(__file__).resolve().parent)
        script.write_text(f"import sys,json\nsys.path.insert(0,{helper!r})\nfrom bounded_process import run_bounded\n"
                          "r=run_bounded([sys.executable,'-u','-c','import time; print(\"ready\"); time.sleep(60)'],cwd='.',timeout_seconds=2)\n"
                          "print(json.dumps(r)); sys.exit(r['exitCode'])\n")
        process = subprocess.Popen([sys.executable, str(script)], cwd=self.root, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        self.addCleanup(lambda: process.kill() if process.poll() is None else None)
        self.assertEqual(process.stdout.readline().strip(), 'ready')
        process.send_signal(signal.SIGTERM)
        text, _ = process.communicate(timeout=2)
        self.assertEqual(process.returncode, 143)
        self.assertEqual(json.loads(text)['status'], 'CANCELLED')

    def test_revision_binds_untracked_bytes_and_ignores_documentation(self):
        def git(*arguments):
            subprocess.run(['git', *arguments], cwd=self.root, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
        (self.root / 'packages').mkdir()
        source = self.root / 'packages/value.mjs'
        source.write_text('export const value = 1;')
        git('add', '.'); git('commit', '-m', 'fixture')
        first = revision(self.root)
        source.write_text('export const value = 2;')
        second = revision(self.root)
        self.assertNotEqual(first, second)
        (self.root / 'packages/README.md').write_text('Different docs')
        self.assertEqual(second, revision(self.root))
        (self.root / 'packages/new.mjs').write_text('export const value = 3;')
        self.assertNotEqual(second, revision(self.root))


if __name__ == '__main__':
    unittest.main()
