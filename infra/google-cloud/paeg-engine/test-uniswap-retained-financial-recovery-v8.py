"""Actual recovery script/private files and pure epoch DATA validation.
Original Product/ingress are explicit HOST seams: no keys, signatures or RPC.
"""
import hashlib,json,pathlib,shutil,subprocess,tempfile,unittest

HERE=pathlib.Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'dev').is_file() and (p/'packages').is_dir())
NODE=ROOT/'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'
EXPIRY=1792134000000

class RetainedFinancialRecovery(unittest.TestCase):
 def fixture(self,change=None,mode='normal',existing_ack=None):
  with tempfile.TemporaryDirectory(prefix='lianum-retained-financial-') as temporary:
   root=pathlib.Path(temporary);infra=root/'infra';infra.mkdir();state=root/'state';state.mkdir(mode=0o700);native=root/'native';(native/'source-operations').mkdir(parents=True);(native/'dispatch-journal').mkdir();transport=root/'transport';transport.mkdir(mode=0o700)
   candidate=root/'candidate/packages/backend/src';(candidate/'operations/local').mkdir(parents=True);(candidate/'operations/recovery').mkdir(parents=True);(candidate/'api/mobile').mkdir(parents=True);(candidate/'chains/public-testnet').mkdir(parents=True)
   public=ROOT/'services/paeg-engine/src/public'
   for name in ['run-public-uniswap-retained-recovery-v8.mjs','financial-epoch-control-v5.mjs','assert-source-capture-v7.mjs','public-uniswap-mode-v6.mjs']:shutil.copyfile(public/name,infra/name)
   port=(public/'public-operator-state-v4.mjs').read_text().replace("'/var/lib/lianum-testnet-signer/paeg-public-v4'",json.dumps(str(state))).replace("'/var/lib/lianum-testnet-signer/transport'",json.dumps(str(transport)))
   (infra/'public-operator-state-v4.mjs').write_text(port)
   shutil.copyfile(ROOT/'packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs',candidate/'chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs')
   def private(directory,name,data):
    path=directory/name;path.write_text(data if isinstance(data,str) else json.dumps(data));path.chmod(0o600)
   root_key='04'+'1'*128;phone_key='04'+'2'*128;connection={'descriptor':{'devicePublicKey':root_key}};phone={'descriptor':{'devicePublicKey':phone_key}}
   configuration={'nativeDirectory':str(native),'providerDirectory':str(root/'unused-provider'),'supervisorDirectory':str(state/'supervisor'),'devicePublicKey':root_key,'journal':{'password':'HOST_PRIVATE_OPERATOR_SECRET_NOT_KEYS'}}
   for name,data in [('operator.json',configuration),('partial-bootstrap-review-v5.json',{}),('paired-connection.json',connection),('paired-phone-connection.json',phone)]:private(state,name,data)
   for name in ['server-key.pem','server-certificate.pem','public-api-certificate.pem']:private(transport,name,'HOST_NO_TLS_KEY')
   source={'configurationSHA256':'3'*64,'revision':89,'operations':[{'id':str(i),'profile':'HOST_'+('UNISWAP' if i>=3 else 'SOURCE'),'phase':'FINALIZED'} for i in range(13)]};private(native/'source-operations','native-wallet.json',source);private(native/'dispatch-journal','native-wallet.json',{'profile':'NATIVE_WALLET_KEYLESS_JOURNAL_V1','configurationSHA256':'c'*64,'revision':7,'operations':[]});dispatch_before=(native/'dispatch-journal/native-wallet.json').read_bytes()
   policy={'profile':'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4','keysetId':'4'*64,'account':'0x'+'5'*40,'maximumFeePerTransactionAtomic':'500000000000000','maximumTotalFeeAtomic':'5000000000000000','maximumValuePerTransactionAtomic':'1000000000000000','maximumTotalValueAtomic':'2000000000000000','expiresAt':EXPIRY}
   checkpoint={'profile':'ORIGINAL_PAGED_SEPOLIA_SOURCE_CHECKPOINT_V4','identity':'3'*64,'keysetId':'4'*64,'policySHA256':'6'*64,'revision':89,'dataSHA256':hashlib.sha256(json.dumps(source['operations'],separators=(',',':')).encode()).hexdigest()}
   review={'intentId':'7'*64,'expectedCheckpoint':checkpoint,'expectedEpochId':'8'*64,'policy':policy,'limits':{'maximumTotalSuccessorPools':'1','maximumSourcesPerWallet':'1','maximumTotalMixedSources':'2'}}
   if change:change(review)
   private(state,'financial-epoch-review-v5.json',review)
   if existing_ack is not None:private(state,'financial-epoch-ack-'+review['intentId']+'.json',existing_ack(review))
   initial={'profile':'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5','effectivePolicy':policy,'epoch':None,'limits':{'maximumTotalSuccessorPools':'1','maximumSourcesPerWallet':'1'},'checkpoint':checkpoint,'history':[],'financialSigningEnabled':True}
   private(state,'host-financial.json',initial)
   (candidate/'operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs').write_text("export async function readOriginalPagedPublicUniswapMixedRecoveryModeV6(){return {phase:'OPENING'};}\n")
   (candidate/'api/mobile/paged-remote-ingress-binding-v4.mjs').write_text("const owners=new WeakSet();export function createOriginalPagedRemoteIngressBindingV4(raw){const o=Object.freeze({});owners.add(o);return o;}export function closeOriginalPagedRemoteIngressBindingV4(o){if(!owners.has(o))throw Error('HOST_ORIGINAL_INGRESS');owners.delete(o);}\n")
   backend="""import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const directory=DIRECTORY,native=NATIVE,mode=MODE,owners=new WeakSet();let current=null,closed=false;const counts={resume:0,authorize:0,epoch:0,close:0,ackBeforeClose:false};
async function json(path){return JSON.parse(await readFile(path,'utf8'));}async function save(){await writeFile(directory+'/host-counts.json',JSON.stringify(counts));}
export async function resumeOriginalPagedPublicUniswapMixedOpeningOperatorV5(input,ingress){assert.ok(input.parent&&ingress);counts.resume++;current=Object.freeze({async close(){if(closed)return {retainedOriginalState:true,ownedServicesClosed:true};closed=true;counts.close++;try{const ack=await json(directory+'/financial-epoch-ack-'+ '7'.repeat(64)+'.json'),state=await json(directory+'/financial-epoch-state-v5.json');counts.ackBeforeClose=ack.epochId===state.epoch.epochId&&state.historyCount===1;}catch{}const source=await json(native+'/source-operations/native-wallet.json');source.revision++;await writeFile(native+'/source-operations/native-wallet.json',JSON.stringify(source));const dispatch=await json(native+'/dispatch-journal/native-wallet.json');dispatch.revision+=mode==='dispatch-jump'?2:1;if(mode==='dispatch-row')dispatch.operations.push({id:'HOST_FORBIDDEN_PAYMENT'});if(mode==='dispatch-identity')dispatch.configurationSHA256='d'.repeat(64);if(mode==='dispatch-extra')dispatch.unexpected='HOST_NOT_ALLOWED';await writeFile(native+'/dispatch-journal/native-wallet.json',JSON.stringify(dispatch));await save();return {retainedOriginalState:true,ownedServicesClosed:true};}});owners.add(current);await save();if(mode==='changed-review')await writeFile(directory+'/financial-epoch-review-v5.json',JSON.stringify({...await json(directory+'/financial-epoch-review-v5.json'),intentId:'9'.repeat(64)}));return current;}
export const recoverOriginalPagedPublicUniswapActiveOperatorV7=resumeOriginalPagedPublicUniswapMixedOpeningOperatorV5,reopenOriginalPagedPublicUniswapMixedOperatorV5=resumeOriginalPagedPublicUniswapMixedOpeningOperatorV5;
function original(product){assert.ok(owners.has(product)&&!closed,'HOST_ORIGINAL_PRODUCT');}
export function readOriginalPagedPublicNativeConnectionV4(p){original(p);return ROOT_CONNECTION;}export function readOriginalPagedPublicNativePhoneConnectionV4(p){original(p);return PHONE_CONNECTION;}export function readOriginalPagedPublicUniswapMixedConnectionV5(p){original(p);return PHONE_CONNECTION;}export const readOriginalPagedPublicUniswapFlatConnectionV5=readOriginalPagedPublicUniswapMixedConnectionV5;
export async function authorizeOriginalPagedPublicNativeFinancialEpochV5(p,review){original(p);counts.authorize++;const state=await json(directory+'/host-financial.json');assert.deepEqual(review.expectedCheckpoint,state.checkpoint,'HOST_ORIGINAL_CAS');const epoch={nonce:review.intentId,epochId:'a'.repeat(64),epoch:'2',policy:review.policy,limits:review.limits,predecessorEpochId:review.expectedEpochId};state.epoch=epoch;state.effectivePolicy=review.policy;state.limits=review.limits;state.history=[{epoch,signature:'HOST_NO_SIGNATURE'}];counts.epoch++;await writeFile(directory+'/host-financial.json',JSON.stringify(state));await save();return state;}
""".replace('DIRECTORY',json.dumps(str(state))).replace('NATIVE',json.dumps(str(native))).replace('MODE',json.dumps(mode)).replace('ROOT_CONNECTION',json.dumps(connection)).replace('PHONE_CONNECTION',json.dumps(phone))
   (candidate/'operations/local/funded-paged-public-native-operator-v4.mjs').write_text(backend)
   result=subprocess.run([str(NODE),'--max-old-space-size=1024',str(infra/'run-public-uniswap-retained-recovery-v8.mjs')],capture_output=True,text=True,timeout=10)
   counts=json.loads((state/'host-counts.json').read_text()) if (state/'host-counts.json').exists() else {'resume':0,'authorize':0,'epoch':0,'close':0}
   ack_path=state/('financial-epoch-ack-'+review['intentId']+'.json');ack=json.loads(ack_path.read_text()) if ack_path.exists() else None
   published=state/'financial-epoch-state-v5.json';financial=json.loads(published.read_text()) if published.exists() else None
   dispatch_after=json.loads((native/'dispatch-journal/native-wallet.json').read_text());expected_dispatch=json.loads(dispatch_before)
   if not mode.startswith('dispatch-'):
    expected_dispatch['revision']+=counts['close'];self.assertEqual(dispatch_after,expected_dispatch)
   current_source=json.loads((native/'source-operations/native-wallet.json').read_text());self.assertEqual(current_source['operations'],source['operations']);self.assertEqual(current_source['revision'],89+counts['close'])
   return result,counts,review,ack,financial

 def test_same_product_epoch_ack_and_state_are_durable_before_capture(self):
  result,counts,review,ack,state=self.fixture();self.assertEqual(result.returncode,0,result.stderr+result.stdout);self.assertEqual(counts,{'resume':1,'authorize':1,'epoch':1,'close':1,'ackBeforeClose':True});self.assertEqual(ack['profile'],'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5');self.assertEqual(ack['intentId'],review['intentId']);self.assertFalse(ack['financialStepsStarted']);self.assertEqual(state['limits'],review['limits']);self.assertEqual(state['effectivePolicy'],review['policy']);self.assertEqual(state['historyCount'],1);self.assertNotIn('history',state);self.assertIn('FINANCIAL_EPOCH_AUTHORIZED',result.stdout)
 def test_invalid_terms_rejected_before_resuming_any_product(self):
  variants=[lambda r:r['limits'].update(maximumTotalMixedSources='3'),lambda r:r['limits'].update(unexpected='1'),lambda r:r['limits'].pop('maximumTotalMixedSources'),lambda r:r['policy'].update(expiresAt=EXPIRY+1),lambda r:r['policy'].update(maximumTotalFeeAtomic='5000000000000001'),lambda r:r.update(privateKey='HOST_FORBIDDEN')]
  for change in variants:
   with self.subTest(change=change):
    result,counts,review,ack,state=self.fixture(change=change);self.assertEqual(result.returncode,1);self.assertEqual(counts['resume'],0);self.assertEqual(counts['authorize'],0);self.assertIsNone(ack);self.assertIsNone(state);self.assertNotIn('HOST_FORBIDDEN',result.stdout)
 def test_review_changed_during_resume_is_not_authorized(self):
  result,counts,review,ack,state=self.fixture(mode='changed-review');self.assertEqual(result.returncode,1);self.assertEqual(counts['resume'],1);self.assertEqual(counts['authorize'],0);self.assertEqual(counts['close'],1);self.assertIsNone(ack);self.assertIsNone(state);self.assertIn('PAEG_UNISWAP_RECOVERY_REVIEW_CHANGED',result.stdout)
 def test_matching_existing_ack_reused_but_conflicting_ack_not_replaced(self):
  def ack(review):return {'profile':'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5','intentId':review['intentId'],'epochId':'a'*64,'epoch':'2','expiresAt':EXPIRY,'financialStepsStarted':False}
  result,counts,review,existing,state=self.fixture(existing_ack=ack);self.assertEqual(result.returncode,0,result.stdout);self.assertTrue(counts['ackBeforeClose']);self.assertEqual(existing,ack(review))
  def conflicting(review):return dict(ack(review),epochId='b'*64)
  result,counts,review,existing,state=self.fixture(existing_ack=conflicting);self.assertEqual(result.returncode,1);self.assertEqual(counts['authorize'],1);self.assertEqual(existing,conflicting(review));self.assertIsNone(state);self.assertIn('PAEG_FINANCIAL_ACK_CHANGED',result.stdout)
 def test_capture_rejects_any_dispatch_change_beyond_one_checkpoint_revision(self):
  for mode in ['dispatch-jump','dispatch-row','dispatch-identity','dispatch-extra']:
   with self.subTest(mode=mode):
    result,counts,review,ack,state=self.fixture(mode=mode);self.assertEqual(result.returncode,1);self.assertEqual(counts['authorize'],1);self.assertEqual(counts['close'],1);self.assertTrue(counts['ackBeforeClose']);self.assertNotIn('EXISTING_UNISWAP_CAPTURED_READY_FOR_REOPEN',result.stdout);self.assertIn('PAEG_UNISWAP_RECOVERY_DISPATCH_CAPTURE_REVISION' if mode=='dispatch-jump' else 'PAEG_UNISWAP_RECOVERY_FINANCIAL_CHANGED',result.stdout)

if __name__=='__main__':unittest.main()
