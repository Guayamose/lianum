"""Actual Node/filesystem/signal control; Product signer is an explicit HOST port.
No Original financial signature, public RPC, blockchain or Android claim.
"""
import json,pathlib,subprocess,tempfile,unittest,shutil,os,importlib.util,sys
ROOT=pathlib.Path(__file__).resolve().parents[6]
NODE=ROOT/'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
if not NODE.is_file():
 for parent in pathlib.Path(__file__).resolve().parents:
  candidate=parent/'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
  if candidate.is_file():ROOT=parent;NODE=candidate;break
HERE=pathlib.Path(__file__).parent
SOURCE_ROOT = next(p for p in HERE.parents if (p / 'dev').is_file() and (p / 'packages').is_dir())
CANDIDATE_ROOT=ROOT
if '--candidate-root' in sys.argv:
 index=sys.argv.index('--candidate-root');CANDIDATE_ROOT=pathlib.Path(sys.argv[index+1]).resolve();del sys.argv[index:index+2]
BACKEND=CANDIDATE_ROOT/'packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs'
class PrivateEpochControl(unittest.TestCase):
 def fixture(self,body):
  with tempfile.TemporaryDirectory(prefix='lianum-epoch-control-') as name:
   root=pathlib.Path(name);infra=root/'infra';infra.mkdir();state=root/'state';state.mkdir(mode=0o700);candidate=root/'candidate/packages/backend/src';(candidate/'operations/local').mkdir(parents=True);(candidate/'chains/public-testnet').mkdir(parents=True)
   shutil.copyfile(SOURCE_ROOT / 'services/paeg-engine/src/public/financial-epoch-control-v5.mjs',infra/'financial-epoch-control-v5.mjs')
   shutil.copyfile(SOURCE_ROOT / 'services/paeg-engine/src/public/captured-financial-epoch-control-v5.mjs',infra/'captured-financial-epoch-control-v5.mjs')
   port=(ROOT/'services/paeg-engine/src/public/public-operator-state-v4.mjs').read_text().replace("'/var/lib/lianum-testnet-signer/paeg-public-v4'",json.dumps(str(state)))
   (infra/'public-operator-state-v4.mjs').write_text(port)
   # Pure canonical DATA checks are genuine. Only receiver ownership/signing
   # below is HOST, exposing no injection hook in production control.
   shutil.copyfile(BACKEND,candidate/'chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs')
   policy={'profile':'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4','keysetId':'1'*64,'account':'0x'+'2'*40,'maximumFeePerTransactionAtomic':'5','maximumTotalFeeAtomic':'50','maximumValuePerTransactionAtomic':'10','maximumTotalValueAtomic':'20','expiresAt':1899999999000}
   checkpoint={'profile':'ORIGINAL_PAGED_SEPOLIA_SOURCE_CHECKPOINT_V4','keysetId':'1'*64,'policySHA256':'3'*64,'identity':'4'*64,'revision':3,'dataSHA256':'5'*64}
   initial={'profile':'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5','basePolicy':policy,'effectivePolicy':policy,'basePolicySHA256':'3'*64,'effectivePolicySHA256':'3'*64,'limits':{'maximumTotalSuccessorPools':'1','maximumSourcesPerWallet':'1'},'epoch':None,'history':[],'checkpoint':checkpoint,'reserved':{'feeAtomic':'3','valueAtomic':'10','successorPools':'0'},'financialSigningEnabled':True}
   review={'intentId':'6'*64,'expectedCheckpoint':checkpoint,'expectedEpochId':None,'policy':dict(policy,expiresAt=1900000000000,maximumTotalValueAtomic='30'),'limits':{'maximumTotalSuccessorPools':'2','maximumSourcesPerWallet':'2'}}
   (state/'host-state.json').write_text(json.dumps(initial));(state/'host-state.json').chmod(0o600)
   mock="""import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
export const product=Object.freeze({}),counts={calls:0,signed:0},cold={mode:'AUTHORIZED',transactions:0},delay={wait:null};const path=PATH;
async function read(){return JSON.parse(await readFile(path,'utf8'));}
export async function readOriginalPagedPublicNativeFinancialStateV5(p){assert.equal(p,product);return read();}
export async function authorizeOriginalPagedPublicNativeFinancialEpochV5(p,r){assert.equal(p,product);counts.calls++;if(delay.wait)await delay.wait;const s=await read();if(s.epoch){assert.equal(s.epoch.nonce,r.intentId);assert.deepEqual(s.epoch.policy,r.policy);return s;}counts.signed++;s.epoch={nonce:r.intentId,epochId:'7'.repeat(64),epoch:'1',policy:r.policy,limits:r.limits,predecessorEpochId:r.expectedEpochId};s.effectivePolicy=r.policy;s.limits=r.limits;s.history=[{epoch:s.epoch,signature:'HOST_NO_FINANCIAL_SIGNATURE'}];await writeFile(path,JSON.stringify(s),{mode:0o600});return s;}
export async function authorizeOriginalPagedCapturedNativeFinancialEpochV5(loc,r,signal){assert.equal(loc.nativeDirectory,'/var/lib/lianum-testnet-signer/paeg-provider-v1');assert.equal(loc.supervisorDirectory,DIRECTORY+'/supervisor');assert.ok(signal instanceof AbortSignal&&!signal.aborted);let s=await read();if(cold.mode==='AUTHORIZED')s=await authorizeOriginalPagedPublicNativeFinancialEpochV5(product,r);s.financialSigningEnabled=false;return {profile:'ORIGINAL_PAGED_CAPTURED_NATIVE_FINANCIAL_EPOCH_RESULT_V5',outcome:cold.mode,intentId:r.intentId,financialState:s,supervisorCheckpoint:{phase:'CAPTURED'},financialSourcePermissionIssued:false,transactionsBroadcast:cold.transactions};}
""".replace('PATH',json.dumps(str(state/'host-state.json'))).replace('DIRECTORY',json.dumps(str(state)))
   (candidate/'operations/local/funded-paged-public-native-operator-v4.mjs').write_text(mock)
   entry="""import assert from 'node:assert/strict';import {readFile,writeFile,chmod} from 'node:fs/promises';
import {openOriginalPublicFinancialEpochControlV5} from './infra/financial-epoch-control-v5.mjs';
import {product,counts,cold,delay} from './candidate/packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs';
import {continueCapturedOriginalPublicFinancialReviewV5} from './infra/captured-financial-epoch-control-v5.mjs';
const directory=DIRECTORY,review=REVIEW,configuration={nativeDirectory:'/var/lib/lianum-testnet-signer/paeg-provider-v1',supervisorDirectory:DIRECTORY+'/supervisor',journal:{password:'HOST-no-keys-private-fixture'}};
async function saveReview(value=review,mode=0o600){const path=directory+'/financial-epoch-review-v5.json';await writeFile(path,JSON.stringify(value),{mode});await chmod(path,mode);}
async function ack(){return JSON.parse(await readFile(directory+'/financial-epoch-ack-'+review.intentId+'.json','utf8'));}
BODY
""".replace('DIRECTORY',json.dumps(str(state))).replace('REVIEW',json.dumps(review)).replace('BODY',body)
   (root/'entry.mjs').write_text(entry)
   result=subprocess.run([str(NODE),str(root/'entry.mjs')],capture_output=True,text=True,timeout=25)
   self.assertEqual(result.returncode,0,result.stderr+result.stdout)
   return result.stdout,result.stderr
 def test_same_review_reuses_signed_epoch_and_private_ack(self):
  out,err=self.fixture("""let captures=[];const c=await openOriginalPublicFinancialEpochControlV5(product,x=>captures.push(x));await saveReview();process.emit('SIGUSR1');await c.refresh();const first=await ack();process.emit('SIGUSR1');await c.refresh();assert.deepEqual(await ack(),first);assert.equal(counts.signed,1);assert.equal(counts.calls,2);assert.deepEqual(captures,[review.policy.expiresAt,review.policy.expiresAt]);const state=JSON.parse(await readFile(directory+'/financial-epoch-state-v5.json','utf8'));assert.equal(state.history,undefined);assert.equal(state.historyCount,1);await c.close();assert.equal(process.listenerCount('SIGUSR1'),0);""")
  self.assertEqual(err,'');self.assertEqual(out.count('FINANCIAL_EPOCH_AUTHORIZED'),2)
 def test_failed_ack_callback_retains_review_and_same_original_epoch(self):
  out,err=self.fixture("""let fail=true;const c=await openOriginalPublicFinancialEpochControlV5(product,()=>{if(fail){fail=false;throw Error('HOST_CAPTURE_CALLBACK_FAILED');}});await saveReview();process.emit('SIGUSR1');await c.refresh();await assert.rejects(ack);process.emit('SIGUSR1');await c.refresh();assert.equal((await ack()).intentId,review.intentId);assert.equal(counts.signed,1);assert.equal(counts.calls,2);assert.deepEqual(JSON.parse(await readFile(directory+'/financial-epoch-review-v5.json','utf8')),review);await c.close();""")
  self.assertIn('HOST_CAPTURE_CALLBACK_FAILED',err);self.assertEqual(out.count('FINANCIAL_EPOCH_AUTHORIZED'),1)
 def test_close_drains_already_entered_issuer_and_removes_new_signal_work(self):
  out,err=self.fixture("""let release;delay.wait=new Promise(resolve=>release=resolve);const c=await openOriginalPublicFinancialEpochControlV5(product,()=>{});await saveReview();process.emit('SIGUSR1');while(counts.calls!==1)await new Promise(resolve=>setTimeout(resolve,1));let closed=false;const draining=c.close().then(()=>closed=true);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(closed,false);assert.equal(process.listenerCount('SIGUSR1'),0);release();await draining;assert.equal(closed,true);assert.equal(counts.signed,1);assert.equal((await ack()).intentId,review.intentId);await assert.rejects(c.refresh());""")
  self.assertEqual(err,'');self.assertEqual(out.count('FINANCIAL_EPOCH_AUTHORIZED'),1)
 def test_wrong_mode_extra_fields_and_missing_review_never_enter_issuer(self):
  out,err=self.fixture("""const c=await openOriginalPublicFinancialEpochControlV5(product,()=>{throw Error('HOST_CALLBACK_MUST_NOT_RUN');});process.emit('SIGUSR1');await c.refresh();await saveReview(review,0o644);process.emit('SIGUSR1');await c.refresh();await saveReview({...review,privateKey:'HOST_FORBIDDEN'});process.emit('SIGUSR1');await c.refresh();assert.equal(counts.signed,0);assert.equal(counts.calls,0);await c.close();""")
  self.assertNotIn('FINANCIAL_EPOCH_AUTHORIZED',out);self.assertNotIn('HOST_FORBIDDEN',err);self.assertEqual(err.count('FINANCIAL_EPOCH_REVIEW_FAILED'),3)

class CapturedControl(unittest.TestCase):
 fixture=PrivateEpochControl.fixture
 def test_cold_authorized_and_lost_ack_replay_preserve_fixed_review(self):
  out,err=self.fixture("""await saveReview();const signal=new AbortController().signal;const first=await continueCapturedOriginalPublicFinancialReviewV5(configuration,signal);assert.equal(first.outcome,'AUTHORIZED');const retained=await ack();await continueCapturedOriginalPublicFinancialReviewV5(configuration,signal);assert.deepEqual(await ack(),retained);assert.equal(counts.signed,1);const state=JSON.parse(await readFile(directory+'/financial-epoch-state-v5.json','utf8'));assert.equal(state.financialSigningEnabled,false);assert.equal(state.historyCount,1);assert.equal(state.history,undefined);""")
  self.assertEqual(err,'');self.assertEqual(out.count('CAPTURED_FINANCIAL_REVIEW_COMPLETED'),2)
 def test_cold_no_epoch_receipt_is_distinct_and_no_issuer_entered(self):
  out,err=self.fixture("""await saveReview();cold.mode='NO_EPOCH_ISSUED';const result=await continueCapturedOriginalPublicFinancialReviewV5(configuration,new AbortController().signal);assert.equal(result.outcome,'NO_EPOCH_ISSUED');const receipt=await ack();assert.equal(receipt.outcome,'NO_EPOCH_ISSUED');assert.equal(receipt.epochId,null);assert.equal(counts.signed,0);assert.equal(counts.calls,0);""")
  self.assertEqual(err,'');self.assertIn('NO_EPOCH_ISSUED',out)
 def test_cold_rejects_result_effect_claim_and_bad_locators(self):
  out,err=self.fixture("""await saveReview();cold.transactions=1;await assert.rejects(continueCapturedOriginalPublicFinancialReviewV5(configuration,new AbortController().signal));await assert.rejects(ack);await assert.rejects(continueCapturedOriginalPublicFinancialReviewV5({...configuration,nativeDirectory:'/HOST/other'},new AbortController().signal));assert.deepEqual(JSON.parse(await readFile(directory+'/financial-epoch-review-v5.json','utf8')),review);""")
  self.assertEqual(err,'');self.assertNotIn('CAPTURED_FINANCIAL_REVIEW_COMPLETED',out)

class PrivateReviewCli(unittest.TestCase):
 def setUp(self):
  import types
  from unittest.mock import patch
  self.patch=patch;self.types=types;self.temp=tempfile.TemporaryDirectory(prefix='lianum-epoch-review-');self.directory=pathlib.Path(self.temp.name);self.directory.chmod(0o700)
  spec=importlib.util.spec_from_file_location('host_epoch_cli',HERE/'create-financial-epoch-review-v5.py');self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module);self.module.ROOT=self.directory
  self.uid=os.getuid();self.gid=os.getgid();self.state={'profile':'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5','effectivePolicy':{'profile':'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4','keysetId':'1'*64,'account':'0x'+'2'*40,'maximumFeePerTransactionAtomic':'5','maximumTotalFeeAtomic':'50','maximumValuePerTransactionAtomic':'10','maximumTotalValueAtomic':'20','expiresAt':1},'checkpoint':{'revision':0,'dataSHA256':'3'*64},'epoch':None,'limits':{'maximumTotalSuccessorPools':'1','maximumSourcesPerWallet':'1'},'reserved':{'feeAtomic':'5','valueAtomic':'10'}}
  self.path=self.directory/'financial-epoch-state-v5.json';self.path.write_text(json.dumps(self.state));self.path.chmod(0o600)
  import datetime
  self.expiry=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
  self.args=['cli','--expires-at-utc',self.expiry,'--per-transaction-fee-wei','5','--total-fee-wei','60','--per-transaction-value-wei','10','--total-value-wei','30','--total-successor-pools','2','--sources-per-wallet','2']
 def tearDown(self):self.temp.cleanup()
 def run_cli(self,args=None):
  import sys,contextlib,io
  out=io.StringIO()
  # Explicit HOST root/user-directory selection. Real O_NOFOLLOW/O_EXCL,
  # modes, fsync and file bytes are exercised; no actual privilege/signature.
  with self.patch.object(self.module.os,'getuid',return_value=0),self.patch.object(self.module.pwd,'getpwnam',return_value=self.types.SimpleNamespace(pw_uid=self.uid,pw_gid=self.gid)),self.patch.object(sys,'argv',args or self.args),contextlib.redirect_stdout(out):self.module.main()
  return out.getvalue()
 def test_explicit_absolute_review_preserves_state_and_refuses_overwrite(self):
  before=self.path.read_bytes();out=self.run_cli();p=self.directory/'financial-epoch-review-v5.json';review=json.loads(p.read_text());self.assertEqual(review['policy']['expiresAt'],int(self.module.datetime.datetime.fromisoformat(self.expiry.replace('Z','+00:00')).timestamp()*1000));self.assertEqual(review['expectedCheckpoint'],self.state['checkpoint']);self.assertEqual(review['expectedEpochId'],None);self.assertEqual(p.stat().st_mode&0o777,0o600);self.assertEqual(self.path.read_bytes(),before);self.assertIn('"signaturesIssued": 0',out)
  retained=p.read_bytes()
  with self.assertRaises(FileExistsError):self.run_cli()
  self.assertEqual(p.read_bytes(),retained)
 def test_past_period_and_total_rollbacks_are_rejected_before_file_creation(self):
  for key,value in [('--expires-at-utc','2000-01-01T00:00:00Z'),('--total-value-wei','19'),('--total-fee-wei','49'),('--sources-per-wallet','17')]:
   with self.subTest(key=key):
    args=self.args.copy();args[args.index(key)+1]=value
    with self.assertRaises(ValueError):self.run_cli(args)
    self.assertFalse((self.directory/'financial-epoch-review-v5.json').exists())
 def test_private_state_mode_and_symlink_rejected(self):
  self.path.chmod(0o644)
  with self.assertRaises(ValueError):self.run_cli()
  self.path.chmod(0o600);target=self.directory/'actual-state.json';self.path.rename(target);self.path.symlink_to(target)
  with self.assertRaises(OSError):self.run_cli()
  self.assertFalse((self.directory/'financial-epoch-review-v5.json').exists())

 def test_archive_requires_same_original_ack_and_epoch(self):
  self.run_cli();review_path=self.directory/'financial-epoch-review-v5.json';review=json.loads(review_path.read_text());args=['cli','--archive-acknowledged-review']
  with self.assertRaises(FileNotFoundError):self.run_cli(args)
  self.assertTrue(review_path.exists())
  epoch={'nonce':review['intentId'],'epochId':'7'*64,'epoch':'1','policy':review['policy'],'limits':review['limits']};self.state['epoch']=epoch;self.state['effectivePolicy']=review['policy'];self.path.write_text(json.dumps(self.state));self.path.chmod(0o600)
  ack={'profile':'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5','intentId':review['intentId'],'epochId':'8'*64,'epoch':'1','expiresAt':review['policy']['expiresAt'],'financialStepsStarted':False};ack_path=self.directory/('financial-epoch-ack-'+review['intentId']+'.json');ack_path.write_text(json.dumps(ack));ack_path.chmod(0o600)
  with self.assertRaises(ValueError):self.run_cli(args)
  self.assertTrue(review_path.exists());ack['epochId']='7'*64;ack_path.write_text(json.dumps(ack));ack_path.chmod(0o600);out=self.run_cli(args);self.assertIn('"archived": true',out);self.assertFalse(review_path.exists());archive=self.directory/('financial-epoch-review-'+review['intentId']+'.json');self.assertEqual(json.loads(archive.read_text()),review);self.assertEqual(archive.stat().st_mode&0o777,0o600)

 def test_archive_no_epoch_requires_unchanged_checkpoint(self):
  self.run_cli();review_path=self.directory/'financial-epoch-review-v5.json';review=json.loads(review_path.read_text());ack={'profile':'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5','outcome':'NO_EPOCH_ISSUED','intentId':review['intentId'],'epochId':None,'epoch':None,'expiresAt':review['policy']['expiresAt'],'financialStepsStarted':False};ack_path=self.directory/('financial-epoch-ack-'+review['intentId']+'.json');ack_path.write_text(json.dumps(ack));ack_path.chmod(0o600);args=['cli','--archive-acknowledged-review'];self.state['checkpoint']['revision']=1;self.path.write_text(json.dumps(self.state));self.path.chmod(0o600)
  with self.assertRaises(ValueError):self.run_cli(args)
  self.assertTrue(review_path.exists());self.state['checkpoint']=review['expectedCheckpoint'];self.path.write_text(json.dumps(self.state));self.path.chmod(0o600);out=self.run_cli(args);self.assertIn('"archived": true',out);self.assertFalse(review_path.exists())

 def test_initial_source_uses_separate_review_and_requires_original_prebirth_state(self):
  live=self.path.read_bytes();initial=self.directory/'initial-source-financial-state-v5.json';initial.write_text(json.dumps(dict(self.state,descriptorIssued=False,operatorConfigurationSHA256='4'*64)));initial.chmod(0o600)
  args=self.args+['--initial-source'];self.run_cli(args);review_path=self.directory/'initial-source-financial-review-v5.json';review=json.loads(review_path.read_text());self.assertEqual(review['expectedCheckpoint'],self.state['checkpoint']);self.assertFalse((self.directory/'financial-epoch-review-v5.json').exists());self.assertEqual(self.path.read_bytes(),live)
  review_path.unlink();bad=dict(self.state,descriptorIssued=True,operatorConfigurationSHA256='4'*64);initial.write_text(json.dumps(bad))
  with self.assertRaises(ValueError):self.run_cli(args)
  self.assertFalse(review_path.exists())
 def test_initial_source_archive_requires_matching_prebirth_ack(self):
  initial=self.directory/'initial-source-financial-state-v5.json';state=dict(self.state,descriptorIssued=False,operatorConfigurationSHA256='4'*64);initial.write_text(json.dumps(state));initial.chmod(0o600);self.run_cli(self.args+['--initial-source']);review_path=self.directory/'initial-source-financial-review-v5.json';review=json.loads(review_path.read_text());state['epoch']={'nonce':review['intentId'],'epochId':'7'*64,'epoch':'1','policy':review['policy'],'limits':review['limits']};state['descriptorIssued']=True;initial.write_text(json.dumps(state));args=['cli','--initial-source','--archive-acknowledged-review'];ack={'profile':'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5','intentId':review['intentId'],'epochId':'7'*64,'epoch':'1','expiresAt':review['policy']['expiresAt'],'descriptorIssued':True};ack_path=self.directory/('initial-source-financial-ack-'+review['intentId']+'.json');ack_path.write_text(json.dumps(ack));ack_path.chmod(0o600)
  with self.assertRaises(ValueError):self.run_cli(args)
  self.assertTrue(review_path.exists());ack['profile']='ORIGINAL_PUBLIC_PREBIRTH_FINANCIAL_EPOCH_ACK_V5';ack_path.write_text(json.dumps(ack));out=self.run_cli(args);self.assertIn('"archived": true',out);self.assertFalse(review_path.exists());self.assertEqual(json.loads((self.directory/('initial-source-financial-review-'+review['intentId']+'.json')).read_text()),review)

 def test_optional_mixed_quota_retains_legacy_shape_and_requires_explicit_increase(self):
  before=self.path.read_bytes();self.run_cli();review_path=self.directory/'financial-epoch-review-v5.json';review=json.loads(review_path.read_text());self.assertNotIn('maximumTotalMixedSources',review['limits']);review_path.unlink()
  self.run_cli(self.args+['--total-mixed-sources','2']);review=json.loads(review_path.read_text());self.assertEqual(review['limits']['maximumTotalMixedSources'],'2');self.assertNotIn('maximumTotalMixedSources',review['policy']);self.assertEqual(self.path.read_bytes(),before)
 def test_mixed_quota_cannot_be_omitted_decreased_or_exceed_bound_after_increase(self):
  self.state['limits']['maximumTotalMixedSources']='2';self.path.write_text(json.dumps(self.state));self.path.chmod(0o600)
  for flags in [[],['--total-mixed-sources','1'],['--total-mixed-sources','17']]:
   with self.subTest(flags=flags):
    with self.assertRaises(ValueError):self.run_cli(self.args+flags)
    self.assertFalse((self.directory/'financial-epoch-review-v5.json').exists())
  self.run_cli(self.args+['--total-mixed-sources','2']);self.assertEqual(json.loads((self.directory/'financial-epoch-review-v5.json').read_text())['limits']['maximumTotalMixedSources'],'2')
 def test_archive_rejects_review_quota_different_from_same_epoch(self):
  self.run_cli(self.args+['--total-mixed-sources','2']);review_path=self.directory/'financial-epoch-review-v5.json';review=json.loads(review_path.read_text());self.state['epoch']={'nonce':review['intentId'],'epochId':'7'*64,'epoch':'1','policy':review['policy'],'limits':dict(review['limits'])};self.path.write_text(json.dumps(self.state));self.path.chmod(0o600)
  ack={'profile':'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5','intentId':review['intentId'],'epochId':'7'*64,'epoch':'1','expiresAt':review['policy']['expiresAt'],'financialStepsStarted':False};ack_path=self.directory/('financial-epoch-ack-'+review['intentId']+'.json');ack_path.write_text(json.dumps(ack));ack_path.chmod(0o600)
  review['limits']['maximumTotalMixedSources']='3';review_path.write_text(json.dumps(review));retained=review_path.read_bytes()
  with self.assertRaises(ValueError):self.run_cli(['cli','--archive-acknowledged-review'])
  self.assertEqual(review_path.read_bytes(),retained);self.assertFalse((self.directory/('financial-epoch-review-'+review['intentId']+'.json')).exists())

if __name__=='__main__':unittest.main()
