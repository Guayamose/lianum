#!/usr/bin/env python3
"""Bounded public-network readback; optional one free devnet faucet request."""
import argparse,json,re,time,urllib.request,urllib.error
from pathlib import Path

GENESIS={
 'ethereum-sepolia':'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
 'bitcoin-testnet':'000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943',
 'solana-devnet':'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
}
def request(url,body=None,text=False):
 data=None if body is None else json.dumps(body).encode();r=urllib.request.Request(url,data=data,headers={'Content-Type':'application/json','Accept':'application/json'})
 with urllib.request.urlopen(r,timeout=15) as reply:
  raw=reply.read(2*1024*1024+1)
  if len(raw)>2*1024*1024:raise ValueError('RESPONSE_BOUND')
  return raw.decode().strip() if text else json.loads(raw)
def rpc(endpoint,method,params):
 value=request(endpoint,{'jsonrpc':'2.0','id':1,'method':method,'params':params})
 if value.get('error') is not None:
  e=RuntimeError('RPC_FAILED');e.rpc_code=value['error'].get('code');raise e
 if value.get('id')!=1 or 'result' not in value:raise ValueError('RPC_SHAPE')
 return value['result']
def error(error):
 if isinstance(error,urllib.error.HTTPError):return {'code':'HTTP_STATUS','httpStatus':error.code}
 if isinstance(error,urllib.error.URLError):return {'code':'NETWORK_UNAVAILABLE'}
 if getattr(error,'rpc_code',None) is not None:return {'code':'RPC_FAILED','rpcCode':error.rpc_code if type(error.rpc_code) is int else None}
 return {'code':str(error) if str(error) in {'NETWORK_IDENTITY','RPC_SHAPE','RESPONSE_BOUND'} else 'READBACK_FAILED'}
def main():
 p=argparse.ArgumentParser();p.add_argument('--accounts',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--request-solana-airdrop',action='store_true');a=p.parse_args();keyset=json.loads(a.accounts.read_text());accounts=keyset['accounts'];rows=[]
 if [v['networkId'] for v in accounts]!=list(GENESIS):raise ValueError('ACCOUNT_NETWORKS')
 for account in accounts:
  network=account['networkId'];address=account['address'];row={'networkId':network,'address':address,'genesis':None,'genesisVerified':False,'balanceAtomic':None,'head':None,'trust':'RPC_PROVIDER','transactionsBroadcast':0};started=time.monotonic()
  try:
   if network=='ethereum-sepolia':
    endpoint='https://ethereum-sepolia-rpc.publicnode.com';chain=rpc(endpoint,'eth_chainId',[]);first=rpc(endpoint,'eth_getBlockByNumber',['0x0',False]);row['genesis']=first['hash']
    if chain!='0xaa36a7' or row['genesis']!=GENESIS[network]:raise ValueError('NETWORK_IDENTITY')
    row['genesisVerified']=True;head=rpc(endpoint,'eth_getBlockByNumber',['finalized',False]);balance=rpc(endpoint,'eth_getBalance',[address,head['number']]);row['balanceAtomic']=str(int(balance,16));row['head']={'hash':head['hash'],'height':str(int(head['number'],16)),'timestamp':str(int(head['timestamp'],16)),'finality':'RPC_FINALIZED'}
   elif network=='bitcoin-testnet':
    base='https://mempool.space/testnet/api';row['genesis']=request(base+'/block-height/0',text=True)
    if row['genesis']!=GENESIS[network]:raise ValueError('NETWORK_IDENTITY')
    row['genesisVerified']=True;tip=request(base+'/blocks/tip/hash',text=True);head=request(base+'/block/'+tip);utxos=request(base+'/address/'+address+'/utxo');row['balanceAtomic']=str(sum(u['value'] for u in utxos));row['head']={'hash':tip,'height':str(head['height']),'timestamp':str(head['timestamp']),'finality':'POW_HEAD_NOT_FINAL'};row['confirmedUtxoCount']=sum(u['status']['confirmed'] for u in utxos);rates=request(base+'/v1/fees/recommended');row['hourFeeSatoshiPerVByte']=rates['hourFee']
   else:
    endpoint='https://api.devnet.solana.com';row['genesis']=rpc(endpoint,'getGenesisHash',[])
    if row['genesis']!=GENESIS[network]:raise ValueError('NETWORK_IDENTITY')
    row['genesisVerified']=True;balance=rpc(endpoint,'getBalance',[address,{'commitment':'finalized'}]);slot=balance['context']['slot'];head=rpc(endpoint,'getBlock',[slot,{'commitment':'finalized','transactionDetails':'none','rewards':False,'maxSupportedTransactionVersion':0}]);row['balanceAtomic']=str(balance['value']);row['head']={'hash':head['blockhash'],'height':str(slot),'timestamp':str(head['blockTime']),'finality':'RPC_FINALIZED'}
    if a.request_solana_airdrop:
     try:
      signature=rpc(endpoint,'requestAirdrop',[address,1000000000,{'commitment':'finalized'}]);
      if not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{80,90}',signature):raise ValueError('RPC_SHAPE')
      status=rpc(endpoint,'getSignatureStatuses',[[signature],{'searchTransactionHistory':True}])['value'][0];row['faucet']={'requestedLamports':'1000000000','signature':signature,'confirmed':bool(status and status.get('confirmationStatus')=='finalized' and status.get('err') is None)}
     except Exception as e:row['faucet']={'requestedLamports':'1000000000','signature':None,'confirmed':False,**error(e)}
  except Exception as e:row['error']=error(e)
  row['elapsedMs']=round((time.monotonic()-started)*1000);rows.append(row)
 report={'profile':'PUBLIC_PROVIDER_TESTNET_READBACK_V1','keysetId':keyset['keysetId'],'accountsGeneratedOnServer':True,'networkRows':rows,'publicSendAccepted':False,'paegAdmissionAccepted':False,'userWalletTouched':False};raw=(json.dumps(report,indent=2)+'\n').encode()
 with a.output.open('xb') as f:f.write(raw)
 a.output.chmod(0o600);print(json.dumps(report))
if __name__=='__main__':main()
