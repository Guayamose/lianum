"""Real private filesystem/control; Original reader and Product are HOST ports.
The financial policy normalizer is genuine. No signer or blockchain acceptance.
"""
import json,pathlib,shutil,subprocess,tempfile,unittest
HERE=pathlib.Path(__file__).resolve().parent
SOURCE_ROOT = next(p for p in HERE.parents if (p / 'dev').is_file() and (p / 'packages').is_dir())
ROOT=next(p for p in HERE.parents if (p/'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node').is_file())
NODE=ROOT/'.internal/dev/toolchains/node-v24.19.0-linux-x64/bin/node'

class PrebirthControl(unittest.TestCase):
 def fixture(self,body):
  with tempfile.TemporaryDirectory(prefix='lianum-prebirth-control-') as name:
   root=pathlib.Path(name);infra=root/'infra';infra.mkdir();state=root/'state';state.mkdir(mode=0o700)
   shutil.copyfile(SOURCE_ROOT / 'services/paeg-engine/src/public/prebirth-financial-control-v5.mjs',infra/'prebirth-financial-control-v5.mjs')
   port=(ROOT/'services/paeg-engine/src/public/public-operator-state-v4.mjs').read_text().replace("'/var/lib/lianum-testnet-signer/paeg-public-v4'",json.dumps(str(state)))
   (infra/'public-operator-state-v4.mjs').write_text(port)
   candidate=root/'candidate/packages/backend/src';(candidate/'operations/local').mkdir(parents=True);(candidate/'operations/recovery').mkdir(parents=True);(candidate/'chains/public-testnet').mkdir(parents=True)
   shutil.copyfile(ROOT/'packages/backend/src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs',candidate/'chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs')
   policy={'profile':'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4','keysetId':'1'*64,'account':'0x'+'2'*40,'maximumFeePerTransactionAtomic':'5','maximumTotalFeeAtomic':'50','maximumValuePerTransactionAtomic':'10','maximumTotalValueAtomic':'20','expiresAt':1900000000000}
   review={'intentId':'6'*64,'expectedCheckpoint':{'revision':0,'dataSHA256':'3'*64},'expectedEpochId':None,'policy':policy,'limits':{'maximumTotalSuccessorPools':'2','maximumSourcesPerWallet':'2'}}
   mock="""import assert from 'node:assert/strict';
export const product=Object.freeze({}),counts={reads:0},control={descriptorIssued:false,transactions:0,financialPermission:false};
export const state={profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5',history:[],effectivePolicy:POLICY,epoch:null};
export async function readOriginalPagedPublicPrebirthFinancialStateV5(loc){assert.deepEqual(Object.keys(loc).sort(),['nativeDirectory','operatorDirectory']);counts.reads++;return {profile:'ORIGINAL_PAGED_PUBLIC_PREBIRTH_FINANCIAL_STATE_V5',operatorConfigurationSHA256:'4'.repeat(64),financialState:state,descriptorIssued:control.descriptorIssued,financialSourcePermissionIssued:control.financialPermission,transactionsBroadcast:control.transactions};}
export async function readOriginalPagedPublicNativeFinancialStateV5(p){assert.equal(p,product);return state;}
""".replace('POLICY',json.dumps(policy))
   (candidate/'operations/local/funded-paged-public-native-operator-v4.mjs').write_text(mock)
   (candidate/'operations/recovery/paged-public-prebirth-financial-state-v5.mjs').write_text("export {readOriginalPagedPublicPrebirthFinancialStateV5} from '../local/funded-paged-public-native-operator-v4.mjs';\n")
   entry="""import assert from 'node:assert/strict';import {readFile,writeFile,lstat,chmod} from 'node:fs/promises';
import {publishOriginalPrebirthFinancialStateV5,readPendingPrebirthFinancialReviewV5,acknowledgeOriginalPrebirthFinancialReviewV5} from './infra/prebirth-financial-control-v5.mjs';
import {product,counts,control,state} from './candidate/packages/backend/src/operations/local/funded-paged-public-native-operator-v4.mjs';
const directory=DIRECTORY,review=REVIEW,loc={operatorDirectory:directory,nativeDirectory:'/HOST/keys'};
async function save(value=review,mode=0o600){const p=directory+'/initial-source-financial-review-v5.json';await writeFile(p,JSON.stringify(value),{mode});await chmod(p,mode);}
async function snapshot(){return JSON.parse(await readFile(directory+'/initial-source-financial-state-v5.json','utf8'));}
BODY
""".replace('DIRECTORY',json.dumps(str(state))).replace('REVIEW',json.dumps(review)).replace('BODY',body)
   (root/'entry.mjs').write_text(entry)
   result=subprocess.run([str(NODE),str(root/'entry.mjs')],capture_output=True,text=True,timeout=25)
   self.assertEqual(result.returncode,0,result.stderr+result.stdout)
 def test_readonly_original_result_publishes_private_history_count_without_grant(self):
  self.fixture("""state.history=[{epoch:'HOST_HISTORY'}];const result=await publishOriginalPrebirthFinancialStateV5(loc);assert.equal(result.descriptorIssued,false);assert.equal(result.financialSourcePermissionIssued,false);assert.equal(result.transactionsBroadcast,0);assert.equal(counts.reads,1);const s=await snapshot();assert.equal(s.history,undefined);assert.equal(s.historyCount,1);assert.equal(s.operatorConfigurationSHA256,'4'.repeat(64));assert.equal(s.descriptorIssued,false);assert.equal((await lstat(directory+'/initial-source-financial-state-v5.json')).mode&0o777,0o600);assert.equal(await readPendingPrebirthFinancialReviewV5(),null);""")
 def test_effect_claim_and_nonprivate_snapshot_are_rejected(self):
  self.fixture("""for(const key of ['descriptorIssued','financialPermission','transactions']){control[key]=key==='transactions'?1:true;await assert.rejects(publishOriginalPrebirthFinancialStateV5(loc));control[key]=key==='transactions'?0:false;}await assert.rejects(snapshot());await publishOriginalPrebirthFinancialStateV5(loc);await chmod(directory+'/initial-source-financial-state-v5.json',0o644);await assert.rejects(publishOriginalPrebirthFinancialStateV5(loc));""")
 def test_review_is_only_data_and_rejects_extra_fields_and_wrong_mode(self):
  self.fixture("""await save();assert.deepEqual(await readPendingPrebirthFinancialReviewV5(),review);assert.equal(counts.reads,0);await save({...review,privateKey:'HOST_FORBIDDEN'});await assert.rejects(readPendingPrebirthFinancialReviewV5());await save(review,0o644);await assert.rejects(readPendingPrebirthFinancialReviewV5());""")
 def test_matching_original_product_receipt_replays_without_overwrite(self):
  self.fixture("""await assert.rejects(acknowledgeOriginalPrebirthFinancialReviewV5(product,review));state.epoch={nonce:review.intentId,epochId:'7'.repeat(64),epoch:'1',policy:review.policy,limits:review.limits};state.history=[{epoch:state.epoch}];const first=await acknowledgeOriginalPrebirthFinancialReviewV5(product,review);assert.equal(first.descriptorIssued,true);assert.deepEqual(await acknowledgeOriginalPrebirthFinancialReviewV5(product,review),first);assert.equal((await snapshot()).descriptorIssued,true);await assert.rejects(acknowledgeOriginalPrebirthFinancialReviewV5({...product},review));state.epoch.nonce='8'.repeat(64);await assert.rejects(acknowledgeOriginalPrebirthFinancialReviewV5(product,review));""")

if __name__=='__main__':unittest.main()
