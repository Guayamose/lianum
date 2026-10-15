/** Explicit same-budget renewal of an unfinished deployment. With no arguments
 * this prints review data only. It never starts the motor or sends a transaction. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

assert.ok([2,5].includes(process.argv.length));
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const original=name=>import(pathToFileURL(join(root,name)).href);
const operatorDirectory='/var/lib/lianum-testnet-signer/paeg-public-v4',nativeDirectory='/var/lib/lianum-testnet-signer/paeg-provider-v1';
let keys,rpc,signer,retained,K;
try{
 const R=await original('packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-retention-v5.mjs');
 const RPC=await original('packages/backend/src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');
 K=await original('packages/backend/src/chains/public-testnet/key-store-v1.mjs');
 const token=await R.readOriginalPagedPublicPartialRetentionForReviewV6({operatorDirectory,nativeDirectory});
 retained=await R.readOriginalPagedPublicPartialRetentionDataV5(token);
 keys=await K.openPublicPagedServerKeysV1(join(nativeDirectory,'keys'));const metadata=K.readPublicPagedServerAccountsV1(keys);
 const networks=retained.configuration.networkConfiguration.networks.filter(n=>n.id==='ethereum-sepolia');assert.equal(networks.length,1);
 rpc=await RPC.createOriginalPagedSepoliaRpcV4({endpoint:networks[0].endpoint,account:metadata.accounts[0],keysetId:metadata.keysetId});
 RPC.verifyOriginalPagedSepoliaPartialBootstrapForReviewV6(rpc.runtime,retained.record.frame,retained.record.signature);
 if(process.argv.length===2){
  process.stdout.write(JSON.stringify(await K.readOriginalPublicPartialBootstrapRenewalReviewV6(token))+'\n');
 }else{
  const [checkpointSHA256,maximumTotalFeeAtomic,deadline]=process.argv.slice(2);
  assert.match(checkpointSHA256,/^[0-9a-f]{64}$/);assert.match(maximumTotalFeeAtomic,/^[1-9][0-9]{0,38}$/);assert.match(deadline,/^[1-9][0-9]{12}$/);
  signer=await K.openOriginalPublicCompiledReceiverSignerV4(keys,rpc.runtime);
  const result=await K.renewOriginalPublicPartialBootstrapApprovalV6(signer,token,{checkpointSHA256,maximumTotalFeeAtomic,expiresAt:Number(deadline)},retained.configuration.journal.password);
  process.stdout.write(JSON.stringify(result)+'\n');
 }
}catch{
 process.stderr.write('{"code":"PAEG_PARTIAL_BOOTSTRAP_RENEWAL_REJECTED","sourcePolicyRenewed":false,"transactionsBroadcast":0}\n');process.exitCode=1;
}finally{
 if(K){await K.closeOriginalPublicCompiledReceiverSignerV4(signer);K.closePublicPagedServerKeysV1(keys);}
 if(rpc){rpc.lifecycle.acknowledge();await rpc.runtime.close();}
 if(retained)retained.configuration.journal.password=null;
}
