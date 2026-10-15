#!/usr/bin/env python3
"""Create explicit private review DATA; never open a key or sign a grant."""
import argparse,datetime,json,os,pathlib,pwd,re,stat,uuid
ROOT=pathlib.Path('/var/lib/lianum-testnet-signer/paeg-public-v4')
STATE='financial-epoch-state-v5.json'
REVIEW='financial-epoch-review-v5.json'

def private_read(name,uid):
 if not re.fullmatch('[a-z0-9][a-z0-9.-]*',name):raise ValueError('PAEG_FINANCIAL_FILE_NAME')
 fd=os.open(ROOT/name,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  s=os.fstat(stream.fileno())
  if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_uid!=uid or stat.S_IMODE(s.st_mode)!=0o600 or not 0<s.st_size<=65536:raise ValueError('PAEG_FINANCIAL_PRIVATE_FILE')
  raw=stream.read(65537)
  if len(raw)>65536:raise ValueError('PAEG_FINANCIAL_PRIVATE_FILE_BOUND')
  return json.loads(raw)
def atomic(value,positive=False):
 if not re.fullmatch('0|[1-9][0-9]*',value) or (positive and int(value)==0) or int(value)>=2**128:raise argparse.ArgumentTypeError('Canonical unsigned amount below u128 required')
 return value

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--initial-source',action='store_true',help='Use the separately inspected initial Source state and its explicit review; never overwrite a live epoch review.')
 p.add_argument('--archive-acknowledged-review',action='store_true',help='Archive the exact review only after a matching Original ACK and state; issue nothing.')
 p.add_argument('--expires-at-utc',help='Explicit absolute UTC time, for example 2026-10-14T18:00:00Z; no default/automatic renewal.')
 p.add_argument('--per-transaction-fee-wei',type=lambda x:atomic(x,True))
 p.add_argument('--total-fee-wei',type=lambda x:atomic(x,True))
 p.add_argument('--per-transaction-value-wei',type=atomic)
 p.add_argument('--total-value-wei',type=atomic)
 p.add_argument('--total-successor-pools',type=lambda x:atomic(x,True))
 p.add_argument('--sources-per-wallet',type=lambda x:atomic(x,True))
 p.add_argument('--total-mixed-sources',type=lambda x:atomic(x,True),help='Explicit total Mixed Source allowance, 1..16; omitted keeps the legacy signed shape and default 1.')
 a=p.parse_args()
 if os.getuid()!=0:raise ValueError('PAEG_FINANCIAL_ROOT_REQUIRED')
 uid=pwd.getpwnam('lianum-testnet-signer').pw_uid;s=ROOT.lstat()
 if not stat.S_ISDIR(s.st_mode) or s.st_uid!=uid or stat.S_IMODE(s.st_mode)!=0o700 or ROOT.resolve()!=ROOT:raise ValueError('PAEG_FINANCIAL_PRIVATE_DIRECTORY')
 prefix='initial-source-financial' if a.initial_source else 'financial-epoch'
 state_name=prefix+'-state-v5.json';review_name=prefix+'-review-v5.json'
 state=private_read(state_name,uid)
 if a.archive_acknowledged_review:
  if any(getattr(a,k) is not None for k in ['expires_at_utc','per_transaction_fee_wei','total_fee_wei','per_transaction_value_wei','total_value_wei','total_successor_pools','sources_per_wallet','total_mixed_sources']):raise ValueError('PAEG_FINANCIAL_ARCHIVE_ARGUMENTS')
  review=private_read(review_name,uid);intent=review['intentId']
  if not re.fullmatch('[a-f0-9]{64}',intent):raise ValueError('PAEG_FINANCIAL_REVIEW_ID')
  ack=private_read(prefix+'-ack-'+intent+'.json',uid);epoch=state['epoch']
  if state.get('profile')!='ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5' or ack.get('profile')!=('ORIGINAL_PUBLIC_PREBIRTH_FINANCIAL_EPOCH_ACK_V5' if a.initial_source else 'ORIGINAL_PUBLIC_FINANCIAL_EPOCH_ACK_V5') or ack.get('intentId')!=intent or ack.get('expiresAt')!=review['policy']['expiresAt'] or (ack.get('descriptorIssued') is not True if a.initial_source else ack.get('financialStepsStarted') is not False):raise ValueError('PAEG_FINANCIAL_ACK_BINDING')
  if ack.get('outcome')=='NO_EPOCH_ISSUED':
   if ack.get('epochId') is not None or ack.get('epoch') is not None or (epoch and epoch.get('nonce')==intent) or state['checkpoint']!=review['expectedCheckpoint']:raise ValueError('PAEG_FINANCIAL_NO_EPOCH_BINDING')
  elif not epoch or epoch['nonce']!=intent or ack.get('epochId')!=epoch['epochId'] or ack.get('epoch')!=epoch['epoch'] or epoch['policy']!=review['policy'] or epoch.get('limits')!=review['limits']:raise ValueError('PAEG_FINANCIAL_ACK_BINDING')
  name=prefix+'-review-'+intent+'.json';raw=(json.dumps(review,separators=(',',':'))+'\n').encode()
  try:
   fd=os.open(ROOT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb') as stream:os.fchown(stream.fileno(),uid,pwd.getpwnam('lianum-testnet-signer').pw_gid);stream.write(raw);stream.flush();os.fsync(stream.fileno())
  except FileExistsError:
   if private_read(name,uid)!=review:raise ValueError('PAEG_FINANCIAL_ARCHIVE_CHANGED')
  if private_read(review_name,uid)!=review:raise ValueError('PAEG_FINANCIAL_REVIEW_CHANGED')
  os.unlink(ROOT/review_name);fd=os.open(ROOT,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
  print(json.dumps({'profile':'PUBLIC_FINANCIAL_EPOCH_REVIEW_DATA_V5','intentId':intent,'archived':True,'signaturesIssued':0,'transactionsBroadcast':0,'serviceSignalSent':False}));return
 if any(getattr(a,k) is None for k in ['expires_at_utc','per_transaction_fee_wei','total_fee_wei','per_transaction_value_wei','total_value_wei','total_successor_pools','sources_per_wallet']):p.error('All explicit period and limit arguments are required to create a review')
 if state.get('profile')!='ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5':raise ValueError('PAEG_FINANCIAL_ORIGINAL_STATE_REQUIRED')
 if a.initial_source and (state.get('descriptorIssued') is not False or not re.fullmatch('[a-f0-9]{64}',state.get('operatorConfigurationSHA256',''))):raise ValueError('PAEG_PREBIRTH_ORIGINAL_STATE_REQUIRED')
 if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',a.expires_at_utc):raise ValueError('PAEG_FINANCIAL_EXPLICIT_UTC_REQUIRED')
 expiry=int(datetime.datetime.fromisoformat(a.expires_at_utc.replace('Z','+00:00')).timestamp()*1000);now=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
 if not now<expiry<=now+9*3600000:raise ValueError('PAEG_FINANCIAL_PERIOD_BOUND')
 policy=dict(state['effectivePolicy']);policy.update(maximumFeePerTransactionAtomic=a.per_transaction_fee_wei,maximumTotalFeeAtomic=a.total_fee_wei,maximumValuePerTransactionAtomic=a.per_transaction_value_wei,maximumTotalValueAtomic=a.total_value_wei,expiresAt=expiry)
 limits={'maximumTotalSuccessorPools':a.total_successor_pools,'maximumSourcesPerWallet':a.sources_per_wallet}
 previous_mixed=state['limits'].get('maximumTotalMixedSources','1')
 atomic(previous_mixed,True)
 if int(previous_mixed)>16:raise ValueError('PAEG_FINANCIAL_QUOTA_BOUND')
 if a.total_mixed_sources is not None:limits['maximumTotalMixedSources']=a.total_mixed_sources
 if int(limits.get('maximumTotalMixedSources','1'))<int(previous_mixed):raise ValueError('PAEG_FINANCIAL_QUOTA_BOUND')
 if any(int(limits[k])>16 or int(limits[k])<int(state['limits'].get(k,'1')) for k in limits):raise ValueError('PAEG_FINANCIAL_QUOTA_BOUND')
 if int(policy['maximumTotalFeeAtomic'])<max(int(state['effectivePolicy']['maximumTotalFeeAtomic']),int(state['reserved']['feeAtomic']),int(policy['maximumFeePerTransactionAtomic'])) or int(policy['maximumTotalValueAtomic'])<max(int(state['effectivePolicy']['maximumTotalValueAtomic']),int(state['reserved']['valueAtomic']),int(policy['maximumValuePerTransactionAtomic'])):raise ValueError('PAEG_FINANCIAL_TOTAL_COVERAGE')
 review={'intentId':uuid.uuid4().hex+uuid.uuid4().hex,'expectedCheckpoint':state['checkpoint'],'expectedEpochId':state['epoch']['epochId'] if state['epoch'] else None,'policy':policy,'limits':limits}
 raw=(json.dumps(review,separators=(',',':'))+'\n').encode()
 if len(raw)>65536:raise ValueError('PAEG_FINANCIAL_REVIEW_BOUND')
 fd=os.open(ROOT/review_name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as stream:os.fchown(stream.fileno(),uid,pwd.getpwnam('lianum-testnet-signer').pw_gid);stream.write(raw);stream.flush();os.fsync(stream.fileno())
 fd=os.open(ROOT,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
 print(json.dumps({'profile':'PUBLIC_FINANCIAL_EPOCH_REVIEW_DATA_V5','intentId':review['intentId'],'expiresAt':expiry,'signaturesIssued':0,'transactionsBroadcast':0,'serviceSignalSent':False}))
if __name__=='__main__':
 try:main()
 except (ValueError,OSError,KeyError,TypeError):
  print(json.dumps({'profile':'PUBLIC_FINANCIAL_EPOCH_REVIEW_DATA_V5','created':False,'code':'PAEG_FINANCIAL_REVIEW_NOT_CREATED','signaturesIssued':0,'transactionsBroadcast':0}));raise SystemExit(1)
