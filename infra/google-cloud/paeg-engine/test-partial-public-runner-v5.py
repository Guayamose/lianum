"""Actual fixed Node entry/selection and exclusive review DATA; HOST backend,
private-file and ingress ports. No Original Native financial acceptance."""
import json
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SOURCE_ROOT = next(p for p in HERE.parents if (p / 'dev').is_file() and (p / 'packages').is_dir())
NODE = next(parent / '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node' for parent in HERE.parents if (parent / '.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node').is_file())


_spec = importlib.util.spec_from_file_location('paeg_courier', HERE / 'package-demo.py')
_courier = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_courier)


class PartialPublicRunner(unittest.TestCase):
    def fixture(self, case):
        context = tempfile.TemporaryDirectory(prefix='lianum-fixed-runner-host-')
        root = Path(context.name)
        self.addCleanup(context.cleanup)
        infra = root / 'infra'; infra.mkdir()
        for name in ['run-public-operator-v4.mjs', 'partial-bootstrap-review-data-v5.mjs', 'review-partial-public-birth-v5.mjs']:
            (infra / name).write_bytes(_courier.delivery_module_bytes((SOURCE_ROOT / 'services/paeg-engine/src/public' / name) if (SOURCE_ROOT / 'services/paeg-engine/src/public' / name).is_file() else HERE / name))
        (infra / 'prebirth-financial-control-v5.mjs').write_text("import {readFile} from 'node:fs/promises';export async function readPendingPrebirthFinancialReviewV5(){const mode=JSON.parse(await readFile(new URL('../case.json',import.meta.url)));return mode.initialReview?{intentId:'4'.repeat(64)}:null;}export async function acknowledgeOriginalPrebirthFinancialReviewV5(){return {profile:'HOST_INITIAL_ACK',descriptorIssued:true};}\n")
        (infra / 'financial-epoch-control-v5.mjs').write_text("export async function openOriginalPublicFinancialEpochControlV5(){return{close:async()=>{},refresh:async()=>{}};}\n")
        (infra / 'captured-financial-epoch-control-v5.mjs').write_text("export async function continueCapturedOriginalPublicFinancialReviewV5(){return null;}\n")
        (infra / 'read-public-financial-window-v5.mjs').write_text("import {readFile} from 'node:fs/promises';export async function readCapturedOriginalPublicFinancialWindowV5(){const mode=JSON.parse(await readFile(new URL('../case.json',import.meta.url)));return{effectiveExpiresAt:mode.expired&&!mode.epochActive?Date.now():Date.now()+3600000};}\n")
        state = r'''
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
export const PUBLIC_OPERATOR_STATE_V4='/var/lib/lianum-testnet-signer/paeg-public-v4',PUBLIC_NATIVE_DIRECTORY_V4='/var/lib/lianum-testnet-signer/paeg-provider-v1',PUBLIC_TRANSPORT_DIRECTORY_V4='/var/lib/lianum-testnet-signer/transport';
const mode=JSON.parse(await readFile(new URL('../case.json',import.meta.url)));
const config={nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4,providerDirectory:PUBLIC_OPERATOR_STATE_V4+'/provider',supervisorDirectory:PUBLIC_OPERATOR_STATE_V4+'/supervisor',journal:{path:PUBLIC_OPERATOR_STATE_V4+'/authority/journal.vault',password:'HOST_JOURNAL_PASSWORD_MUST_NOT_BE_PRINTED'},devicePublicKey:'04'+'1'.repeat(128),deployment:{minimumDepositAtomic:'100'},sourcePolicy:{expiresAt:mode.expired?Date.now():Date.now()+3600000}};
const review={operatorDirectory:PUBLIC_OPERATOR_STATE_V4,nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4,checkpointSHA256:'2'.repeat(64),operatorConfigurationSHA256:'3'.repeat(64),approval:{maximumTotalFeeAtomic:'30000000000000000',expiresAt:mode.expired?Date.now()-1:Date.now()+300000}};
export async function assertPrivateOperatorDirectoryV4(path){assert.equal(path,config.supervisorDirectory);if(!mode.supervisor)throw Object.assign(Error('HOST_ABSENT'),{code:'ENOENT'});}
export async function readPrivateOperatorFileV4(directory,name){
 if(directory===PUBLIC_TRANSPORT_DIRECTORY_V4)return Buffer.from('HOST_TLS_PORT');
 assert.equal(directory,PUBLIC_OPERATOR_STATE_V4);
 if(name==='operator.json')return Buffer.from(JSON.stringify(config));
 if(name==='startup-attempt.json')return Buffer.from(JSON.stringify({profile:'ORIGINAL_PAGED_PUBLIC_STARTUP_ATTEMPT_V4',devicePublicKey:config.devicePublicKey}));
 if(name==='partial-bootstrap-approval.vault'&&mode.partialInProgress)return Buffer.from('HOST_ENCRYPTED_APPROVAL_NOT_A_GRANT');
 if(name==='partial-bootstrap-review-v5.json'&&mode.review)return Buffer.from(JSON.stringify(review));
 throw Object.assign(Error('HOST_ABSENT'),{code:'ENOENT'});
}
export async function writePrivateOperatorFileV4(directory,name,bytes){assert.equal(directory,PUBLIC_OPERATOR_STATE_V4);await writeFile(new URL('../'+name,import.meta.url),bytes,{flag:'wx'});}
export async function publishOriginalPublicConnectionFileV4(directory,bytes,name='paired-connection.json'){assert.equal(directory,PUBLIC_OPERATOR_STATE_V4);await writeFile(new URL('../'+name,import.meta.url),bytes);}
'''
        (infra / 'public-operator-state-v4.mjs').write_text(state)
        (infra / 'public-read-server-v4.mjs').write_text("export async function openCapturedPublicReadServerV4(root,input){if(!input.providerDirectory.endsWith('/provider-replacement-v5'))throw Error('HOST_WRONG_READ_LOCATOR');return{profile:'HOST_READ',sources:2,close:async()=>{}};}\n")
        (root / 'case.json').write_text(json.dumps(case))
        def module(name, text):
            path = root / 'candidate' / name
            path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)
        module('packages/backend/src/api/mobile/paged-remote-ingress-binding-v4.mjs', "export const createOriginalPagedRemoteIngressBindingV4=()=>({HOST:true});export const closeOriginalPagedRemoteIngressBindingV4=()=>{};\n")
        module('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs', "import {readFile} from 'node:fs/promises';export async function readOriginalPagedPublicRecoveryModeV4(){const m=JSON.parse(await readFile(new URL('../../../../../../case.json',import.meta.url)));return {profile:'ORIGINAL_PAGED_PUBLIC_RECOVERY_MODE_V4',mode:m.active?'ACTIVE_DEAD_ANCHORED':'CAPTURED'};}\n")
        module('packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs', r'''
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const capture=async(mode,input,signal)=>{assert.ok(signal instanceof AbortSignal);assert.ok(!signal.aborted);await writeFile(new URL('../../../../../../chosen.json',import.meta.url),JSON.stringify({mode,keys:Object.keys(input).sort(),providerDirectory:input.providerDirectory??null,sourceDeadline:input.sourcePolicy?.expiresAt??null}));return{profile:'HOST_PRODUCT',origin:'https://api.lianum.oryontechnology.com',publicReceiver:'HOST_NOT_FINANCIAL',reopenedOriginalState:mode==='REOPEN',close:async()=>({closed:true,ownedServicesClosed:true,externalChainsStopped:false,automaticRebroadcast:false,retainedOriginalState:true})};};
export const startOriginalPagedPublicPartialNativeOperatorWithFinancialReviewV5=(input,review,_ingress,signal)=>{assert.equal(review.intentId,'4'.repeat(64));return capture('PARTIAL_WITH_REVIEW',input,signal);};
export const reopenOriginalPagedPublicPartialNativeOperatorWithFinancialReviewV5=(input,review,_ingress,signal)=>{assert.equal(review.intentId,'4'.repeat(64));return capture('RETAINED_PARTIAL_WITH_REVIEW',input,signal);};
export const startOriginalPagedPublicPartialNativeOperatorV5=(input,_ingress,signal)=>capture('PARTIAL',input,signal);
export const reopenOriginalPagedPublicPartialNativeOperatorV5=(input,_ingress,signal)=>capture('RETAINED_PARTIAL',input,signal);
export const reopenOriginalPagedPublicNativeOperatorV4=(input,_ingress,signal)=>capture('REOPEN',input,signal);
export const recoverOriginalPagedPublicNativeOperatorV4=async(input,_ingress,signal)=>{const m=JSON.parse(await readFile(new URL('../../../../../../case.json',import.meta.url)));assert.ok(!m.activeRejected,'HOST_ORIGINAL_ACTIVE_PERMISSION_REJECTED');return capture('ACTIVE',input,signal);};
export const startOriginalPagedPublicNativeOperatorV4=()=>{throw Error('HOST_FORBIDDEN_FRESH_BIRTH');};
export async function readOriginalPagedPublicNativeFinancialStateV5(){const mode=JSON.parse(await readFile(new URL('../../../../../../case.json',import.meta.url)));return{effectivePolicy:{expiresAt:mode.expired&&!mode.epochActive?Date.now():Date.now()+3600000}};}
export const readOriginalPagedPublicNativeConnectionV4=()=>({HOST:'connection'});
export const readOriginalPagedPublicNativePhoneConnectionV4=()=>({HOST:'phone'});
''')
        module('packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-inspector-v5.mjs', "export async function inspectOriginalPagedPublicPartialBootstrapV5(){return{checkpointSHA256:'2'.repeat(64),checkpoint:{operatorConfigurationSHA256:'3'.repeat(64),maximumFeeAlreadyReservedAtomic:'100',paidFeeAlreadyAtomic:'90'}};}\n")
        return root, infra

    def invoke(self, path, *args):
        return subprocess.run([str(NODE), '--max-old-space-size=384', str(path), *args], capture_output=True, text=True, timeout=20, env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})

    def test_partial_requires_review_and_does_not_fallback_to_fresh_birth(self):
        root, infra = self.fixture({'review':True,'supervisor':False,'expired':False})
        result = self.invoke(infra / 'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,0,result.stderr)
        chosen = json.loads((root / 'chosen.json').read_text()); self.assertEqual(chosen['mode'],'PARTIAL')
        self.assertEqual(chosen['keys'],sorted(['operatorDirectory','nativeDirectory','checkpointSHA256','operatorConfigurationSHA256','approval']))
        self.assertNotIn('HOST_JOURNAL_PASSWORD',result.stdout+result.stderr)
        root, infra = self.fixture({'review':False,'supervisor':False,'expired':False})
        result = self.invoke(infra / 'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,1)
        self.assertFalse((root / 'chosen.json').exists()); self.assertNotIn('HOST_JOURNAL_PASSWORD',result.stdout+result.stderr)

    def test_captured_reopen_and_expired_read_use_original_replacement_locator(self):
        root, infra = self.fixture({'review':True,'supervisor':True,'expired':False})
        result = self.invoke(infra / 'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,0,result.stderr)
        chosen = json.loads((root / 'chosen.json').read_text()); self.assertEqual(chosen['mode'],'REOPEN'); self.assertTrue(chosen['providerDirectory'].endswith('/provider-replacement-v5'))
        root, infra = self.fixture({'review':True,'supervisor':True,'expired':True})
        result = self.invoke(infra / 'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse((root / 'chosen.json').exists()); self.assertIn('"profile":"HOST_READ"',result.stdout)

    def test_captured_signed_epoch_window_does_not_rewrite_historical_config(self):
        root, infra = self.fixture({'review':True,'supervisor':True,'expired':True,'epochActive':True})
        result=self.invoke(infra/'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,0,result.stderr)
        chosen=json.loads((root/'chosen.json').read_text()); self.assertEqual(chosen['mode'],'REOPEN'); self.assertIsNone(chosen['sourceDeadline'])
        self.assertIn('\"stage\":\"READY\"',result.stdout); self.assertFalse((root/'operator.json').exists())

    def test_active_original_recovery_uses_signed_period_without_rewriting_base_configuration(self):
        root, infra=self.fixture({'review':True,'supervisor':True,'expired':True,'epochActive':True,'active':True})
        result=self.invoke(infra/'run-public-operator-v4.mjs');self.assertEqual(result.returncode,0,result.stderr)
        chosen=json.loads((root/'chosen.json').read_text());self.assertEqual(chosen['mode'],'ACTIVE');self.assertIsNone(chosen['sourceDeadline']);self.assertIn('\"stage\":\"READY\"',result.stdout)
        root, infra=self.fixture({'review':True,'supervisor':True,'expired':True,'epochActive':True,'active':True,'activeRejected':True})
        result=self.invoke(infra/'run-public-operator-v4.mjs');self.assertEqual(result.returncode,1);self.assertFalse((root/'chosen.json').exists());self.assertNotIn('\"profile\":\"HOST_READ\"',result.stdout)

    def test_retained_partial_uses_original_opener_without_renewing_review(self):
        root, infra = self.fixture({'review':False,'supervisor':False,'expired':False,'partialInProgress':True})
        result = self.invoke(infra / 'run-public-operator-v4.mjs'); self.assertEqual(result.returncode,0,result.stderr)
        chosen=json.loads((root/'chosen.json').read_text()); self.assertEqual(chosen['mode'],'RETAINED_PARTIAL'); self.assertEqual(chosen['keys'],['nativeDirectory','operatorDirectory'])
        self.assertFalse((root/'partial-bootstrap-review-v5.json').exists())

    def test_review_creation_is_exclusive_and_fixed_to_original_checkpoint(self):
        root, infra = self.fixture({'review':False,'supervisor':False,'expired':False})
        result = self.invoke(infra / 'review-partial-public-birth-v5.mjs','2'*64); self.assertEqual(result.returncode,0,result.stderr)
        review = json.loads((root / 'partial-bootstrap-review-v5.json').read_text()); self.assertEqual(review['approval']['maximumTotalFeeAtomic'],'30000000000000000')
        result = self.invoke(infra / 'review-partial-public-birth-v5.mjs','2'*64); self.assertEqual(result.returncode,1)
        self.assertEqual(json.loads((root / 'partial-bootstrap-review-v5.json').read_text()),review)
        root, infra = self.fixture({'review':False,'supervisor':False,'expired':False})
        result = self.invoke(infra / 'review-partial-public-birth-v5.mjs','4'*64); self.assertEqual(result.returncode,1)
        self.assertFalse((root / 'partial-bootstrap-review-v5.json').exists())


    def test_initial_review_selects_explicit_original_opener_without_fresh_fallback(self):
        for retained,mode in [(False,'PARTIAL_WITH_REVIEW'),(True,'RETAINED_PARTIAL_WITH_REVIEW')]:
            with self.subTest(retained=retained):
                root,infra=self.fixture({'review':True,'supervisor':False,'expired':False,'initialReview':True,'partialInProgress':retained})
                result=self.invoke(infra/'run-public-operator-v4.mjs');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(json.loads((root/'chosen.json').read_text())['mode'],mode);self.assertIn('INITIAL_SOURCE_FINANCIAL_EPOCH_CONFIRMED',result.stdout);self.assertNotIn('HOST_JOURNAL_PASSWORD',result.stdout+result.stderr)

    def test_lost_initial_ack_after_source_birth_reopens_and_queries_same_epoch(self):
        root,infra=self.fixture({'review':False,'supervisor':True,'expired':False,'initialReview':True})
        result=self.invoke(infra/'run-public-operator-v4.mjs');self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(json.loads((root/'chosen.json').read_text())['mode'],'REOPEN');self.assertIn('INITIAL_SOURCE_FINANCIAL_EPOCH_CONFIRMED',result.stdout);self.assertNotIn('HOST_JOURNAL_PASSWORD',result.stdout+result.stderr)

if __name__ == '__main__':
    unittest.main()
