"""Actual installer transaction; service/Original inspection ports are HOST.
No financial keys, permissions, proof or public-chain effects are simulated.
"""
import importlib.util
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('prior_runtime_tests',Path(__file__).with_name('test-partial-public-code-upgrade-v5.py'))
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
class CapturedReviewedRuntimeTests(prior.PartialCodeUpgradeTests):
    def fixture(self,mode):
        run=prior.subprocess.run
        def with_review(command,**kwargs):
            script=Path(command[1]);script.write_text(script.read_text().replace('st.st_uid!=0','st.st_uid!='+str(os.getuid())))
            release=Path(command[2]);old=(script.parent/'opt/current').resolve();before=json.loads((old/'release-manifest.json').read_text())['files'];after=json.loads((release/'release-manifest.json').read_text())['files']
            if mode in ['additional-defi-source','changed-contract-source','removed-contract-source','unscoped-contract-source']:
                original='candidate/contracts/engine/Existing.sol'
                before[original]={'sha256':'1'*64,'bytes':12,'mode':'0644'}
                after[original]=dict(before[original])
                if mode=='changed-contract-source':after[original]['sha256']='2'*64
                elif mode=='removed-contract-source':del after[original]
                else:after['candidate/contracts/'+('wallet/defi/New.sol' if mode=='additional-defi-source' else 'engine/New.sol')]={'sha256':'3'*64,'bytes':12,'mode':'0644'}
                (old/'release-manifest.json').write_text(json.dumps({'files':before}))
                (release/'release-manifest.json').write_text(json.dumps({'files':after}))
            changes={name:{'before':before.get(name),'after':after.get(name)} for name in sorted(set(before)|set(after)) if before.get(name)!=after.get(name)}
            # Ordinary fixture success gets one explicit additive runtime change.
            if not changes:
                after['candidate/new-reviewed-module.mjs']={'sha256':'d'*64,'bytes':1,'mode':'0644'}
                (release/'release-manifest.json').write_text(json.dumps({'files':after}));changes={'candidate/new-reviewed-module.mjs':{'before':None,'after':after['candidate/new-reviewed-module.mjs']}}
            review={'profile':'LIANUM_CAPTURED_RUNTIME_UPGRADE_REVIEW_V7','beforeRelease':old.name,'afterRelease':command[3],'capturedCheckpointSHA256':command[4],'expiresAt':int(time.time())+120,'changes':changes}
            if mode=='unreviewed-runtime':review['changes']={}
            if mode=='expired-review':review['expiresAt']=int(time.time())-1
            file=script.parent/'review.json';file.write_text(json.dumps(review));file.chmod(0o600)
            return run(command+[str(file)],**kwargs)
        with patch.object(prior,'SCRIPT',Path(__file__).with_name('upgrade-captured-reviewed-runtime-v7.sh')),patch.object(prior.subprocess,'run',with_review):
            return super().fixture(mode)
    def test_reviewed_runtime_change_is_accepted_without_starting(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('changed-runtime')
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual((opt/'current').readlink(),opt/'releases'/new);self.assertEqual(json.loads(state.read_text())['inspections'],2)
    def test_unreviewed_or_expired_change_keeps_original_release(self):
        for mode in ['unreviewed-runtime','expired-review']:
            with self.subTest(mode=mode):
                result,opt,work,unit,artifacts,state,old,new=self.fixture(mode)
                self.assertNotEqual(result.returncode,0);self.assertEqual((opt/'current').readlink(),opt/'releases'/old);self.assertEqual(unit.read_text(),'old-unit')

    def test_review_can_add_missing_defi_source_without_changing_originals(self):
        result,opt,work,unit,artifacts,state,old,new=self.fixture('additional-defi-source')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((opt/'current').readlink(),opt/'releases'/new)

    def test_review_cannot_change_remove_or_add_unscoped_contract_sources(self):
        for mode in ['changed-contract-source','removed-contract-source','unscoped-contract-source']:
            with self.subTest(mode=mode):
                result,opt,work,unit,artifacts,state,old,new=self.fixture(mode)
                self.assertNotEqual(result.returncode,0)
                self.assertEqual((opt/'current').readlink(),opt/'releases'/old)

if __name__=='__main__':unittest.main()
