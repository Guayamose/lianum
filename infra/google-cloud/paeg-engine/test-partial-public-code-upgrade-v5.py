"""Actual shell/file upgrade with inert HOST service/inspector ports.
No Google Cloud, financial keys, Original proof or public-chain acceptance.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT=Path(__file__).with_name('upgrade-partial-public-birth-code-v5.sh')

class PartialCodeUpgradeTests(unittest.TestCase):
    def fixture(self, mode):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        root=Path(temporary.name); opt=root/'opt';work=root/'work';bin_dir=root/'bin';bin_dir.mkdir()
        old='a'*64;new='b'*64;checkpoint='c'*64
        for base in [opt,work]:
            (base/'releases'/old).mkdir(parents=True)
            (base/'current').symlink_to(base/'releases'/old)
        old_release=opt/'releases'/old;(old_release/'infra').mkdir()
        (old_release/'infra/verify-release.py').write_text('')
        (old_release/'infra/lianum-paeg-public.service').write_text('old-unit')
        release=root/'new-release';(release/'infra').mkdir(parents=True)
        (release/'infra/verify-release.py').write_text('')
        unit=root/'unit.service';unit.write_text('old-unit')
        artifacts=root/'artifacts.conf';artifacts.write_text('old-artifacts')
        state=root/'state.json';state.write_text(json.dumps({'mode':mode,'mainPIDReads':0,'inspections':0}))
        code=SCRIPT.read_text().replace('[ "$(id -u)" -eq 0 ]', '[ "$(id -u)" -eq '+str(os.getuid())+' ]').replace('ls.st_uid!=0','ls.st_uid!='+str(os.getuid())).replace('ts.st_uid!=0','ts.st_uid!='+str(os.getuid())).replace('/opt/lianum-paeg-public',str(opt)).replace('/var/lib/lianum-paeg-public',str(work)).replace('/etc/systemd/system/lianum-paeg-public.service.d/artifacts.conf',str(artifacts)).replace('/etc/systemd/system/lianum-paeg-public.service',str(unit)).replace('/run/lock/lianum-paeg-public-partial-birth-upgrade-v5.lock',str(root/'lock')).replace('/run/lianum-partial-birth-',str(root/'report-'))
        code=code.replace('install -o root -g root -m 0644','install -m 0644')
        script=root/'upgrade.sh';script.write_text(code)
        control='''#!/usr/bin/python3
import json,os,sys
from pathlib import Path
p=Path(os.environ['HOST_CONTROL']);d=json.loads(p.read_text());a=sys.argv[1:]
if a[:1]==['show']:
 prop=next(x.split('=',1)[1] for x in a if x.startswith('--property='))
 if prop=='ActiveState':print('active' if d['mode']=='initial-live' else 'failed')
 elif prop=='MainPID':
  d['mainPIDReads']+=1;print('7' if d['mode']=='race-live' and d['mainPIDReads']>=2 else '0')
 elif prop=='ExecMainStartTimestampMonotonic':print('0' if d['mode']=='rebooted' else '42')
else:
 assert a==['daemon-reload'],a
p.write_text(json.dumps(d))
'''
        (bin_dir/'systemctl').write_text(control);(bin_dir/'systemctl').chmod(0o755)
        inspector='''#!/usr/bin/python3
import json,os,sys
from pathlib import Path
p=Path(os.environ['HOST_CONTROL']);d=json.loads(p.read_text());d['inspections']+=1;p.write_text(json.dumps(d))
if d['mode']=='inspection-rejected':sys.exit(1)
value='d'*64 if d['mode']=='changed-checkpoint' and d['inspections']>1 else 'c'*64
print(json.dumps({'checkpointSHA256':value,'HOST_INERT':True}))
'''
        (bin_dir/'sudo').write_text(inspector);(bin_dir/'sudo').chmod(0o755)
        installer=f'''#!/bin/sh
set -eu
if [ "$HOST_MODE" = install-fails ]; then exit 11; fi
mkdir -p '{opt}/releases/{new}' '{work}/releases/{new}'
ln -s '{opt}/releases/{new}' '{opt}/current'
ln -s '{work}/releases/{new}' '{work}/current'
printf new-unit > '{unit}'
printf new-artifacts > '{artifacts}'
'''
        (release/'infra/install-public-release-v4.sh').write_text(installer)
        env=dict(os.environ,PATH=str(bin_dir)+':/usr/bin:/bin',HOST_CONTROL=str(state),HOST_MODE=mode)
        result=subprocess.run(['/bin/sh',str(script),str(release),new,checkpoint],env=env,text=True,capture_output=True,timeout=20)
        return result,opt,work,unit,artifacts,state,old,new

    def test_success_replaces_only_code_without_start(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('success')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((opt/'current').readlink(),opt/'releases'/new)
        self.assertEqual((work/'current').readlink(),work/'releases'/new)
        self.assertTrue((opt/'releases'/old).exists())
        self.assertEqual(json.loads(state.read_text())['inspections'],2)
        self.assertIn('NOT_STARTED',result.stdout)

    def test_live_or_racing_service_cannot_switch_code(self):
        for mode in ['initial-live','race-live']:
            with self.subTest(mode=mode):
                result,opt,work,unit,artifacts,state,old,new=self.fixture(mode)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual((opt/'current').readlink(),opt/'releases'/old)
                self.assertEqual((work/'current').readlink(),work/'releases'/old)
                self.assertEqual(unit.read_text(),'old-unit')

    def test_rebooted_service_uses_persistent_original_inspection(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('rebooted')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((opt/'current').readlink(),opt/'releases'/new)
        self.assertEqual(json.loads(state.read_text())['inspections'],2)

    def test_rejected_original_state_cannot_switch_code(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('inspection-rejected')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((opt/'current').readlink(),opt/'releases'/old)
        self.assertEqual((work/'current').readlink(),work/'releases'/old)
        self.assertEqual(unit.read_text(),'old-unit')
        self.assertEqual(artifacts.read_text(),'old-artifacts')

    def test_installer_or_checkpoint_failure_rolls_back_code(self):
        for mode in ['install-fails','changed-checkpoint']:
            with self.subTest(mode=mode):
                result,opt,work,unit,artifacts,state,old,new=self.fixture(mode)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual((opt/'current').readlink(),opt/'releases'/old)
                self.assertEqual((work/'current').readlink(),work/'releases'/old)
                self.assertEqual(unit.read_text(),'old-unit')
                self.assertEqual(artifacts.read_text(),'old-artifacts')

if __name__=='__main__':unittest.main()
