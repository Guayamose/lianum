/** Fixed server-only inspector. Returns DATA; never continues a birth. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {lstat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const operatorDirectory='/var/lib/lianum-testnet-signer/paeg-public-v4',nativeDirectory='/var/lib/lianum-testnet-signer/paeg-provider-v1';
const original=name=>import(pathToFileURL(join(root,name)).href);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inspectRetained(){
 const retention=await original('packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-retention-v5.mjs');
 const token=await retention.readOriginalPagedPublicPartialRetentionForReviewV6({operatorDirectory,nativeDirectory});
 const retained=await retention.readOriginalPagedPublicPartialRetentionDataV5(token);
 const keysOwner=await original('packages/backend/src/chains/public-testnet/key-store-v1.mjs');
 const rpcOwner=await original('packages/backend/src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');
 const wire=await original('packages/backend/src/chains/public-testnet/sepolia-receiver-wire-v4.mjs');
 const kernel=await original('packages/backend/src/operations/local/funded-graph-paged-kernel-data-v4.mjs');
 kernel.pinnedCompilation(retained.configuration.deployment.manifestSHA256,retained.configuration.deployment.consumerSHA256);
 let keys,opened;
 try{
  keys=await keysOwner.openPublicPagedServerKeysV1(join(nativeDirectory,'keys'));
  const keyset=keysOwner.readPublicPagedServerAccountsV1(keys);
  const networks=retained.configuration.networkConfiguration.networks.filter(n=>n.id==='ethereum-sepolia');assert.equal(networks.length,1);
  opened=await rpcOwner.createOriginalPagedSepoliaRpcV4({endpoint:networks[0].endpoint,account:keyset.accounts[0],keysetId:keyset.keysetId});
  const runtime=opened.runtime;
  // Verify the retained account signature through the Original verifier.
  // No signer, new approval, deployment plan or Source permission is opened.
  rpcOwner.verifyOriginalPagedSepoliaPartialBootstrapForReviewV6(runtime,retained.record.frame,retained.record.signature);
  const bootstrap=JSON.parse(await readFile(join(nativeDirectory,'receiver-bootstrap/native-wallet.json'),'utf8'));
  const rows=[];const head=await runtime.block();
  for(const [index,row]of bootstrap.operations.entries()){
   assert.deepEqual(wire.validateSepoliaReceiverCreationWireV4(row.transaction,keyset.accounts[0].address,row.signed.nativeWire),row.signed);
   const receipt=await runtime.receipt(row.signed.nativeId);
   if(index<bootstrap.operations.length-1||row.receipt)assert.ok(receipt,'PAEG_PARTIAL_RETAINED_RECEIPT_MISSING');
   if(row.receipt)assert.deepEqual(receipt,row.receipt,'PAEG_PARTIAL_RETAINED_RECEIPT_CHANGED');
   if(receipt){await runtime.checkReceipt(receipt);assert.equal(receipt.contractAddress?.toLowerCase(),row.constructor.expectedAddress);assert.equal(await runtime.code(row.constructor.expectedAddress,head.number),row.constructor.expectedCode);}
   rows.push({name:row.constructor.name,nonce:row.transaction.nonce,nativeId:row.signed.nativeId,phase:row.phase,receiptObserved:receipt!==null});
  }
  const nonce=await runtime.nonce(keyset.accounts[0].address,'pending');assert.ok(nonce>=BigInt(rows.length-1)&&nonce<=BigInt(rows.length),'PAEG_PARTIAL_RETAINED_NONCE');
  await runtime.assertCanonical(head);
  const files=[];
  for(const name of [join(operatorDirectory,'partial-bootstrap-approval.vault'),join(operatorDirectory,'provider-replacement-v5/provider-birth.vault'),join(operatorDirectory,'provider-replacement-v5/provider.vault')]){
   const state=await lstat(name);assert.ok(state.isFile()&&!state.isSymbolicLink()&&state.nlink===1&&state.uid===process.getuid()&&(state.mode&0o777)===0o600);
   files.push({path:name,sha256:sha(await readFile(name))});
  }
  await retention.readOriginalPagedPublicPartialRetentionDataV5(token);
  const checkpoint={profile:'ORIGINAL_RETAINED_PUBLIC_PARTIAL_BOOTSTRAP_CHECKPOINT_V5',operatorConfigurationSHA256:retained.configurationSHA256,startupMarkerSHA256:retained.markerSHA256,bootstrapSHA256:retained.bootstrapSHA256,bootstrapRevision:retained.bootstrapRevision,files,rows,signatures:0,broadcasts:0,writes:0};
  return {profile:'ORIGINAL_RETAINED_PUBLIC_PARTIAL_BOOTSTRAP_INSPECTION_V5',checkpoint,checkpointSHA256:sha(JSON.stringify(checkpoint)),observation:{canonicalHead:{number:head.number,hash:head.hash},signatures:0,broadcasts:0,writes:0}};
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}keysOwner.closePublicPagedServerKeysV1(keys);retained.configuration.journal.password=null;}
}
try{
 let retained=false;try{await lstat(join(operatorDirectory,'partial-bootstrap-approval.vault'));retained=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 const result=retained?await inspectRetained():await(await original('packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-inspector-v5.mjs')).inspectOriginalPagedPublicPartialBootstrapV5({operatorDirectory,nativeDirectory});
 assert.match(result.checkpointSHA256,/^[a-f0-9]{64}$/);assert.ok(result.checkpoint&&result.observation);process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stderr.write('{"code":"PAEG_PARTIAL_BIRTH_INSPECTION_REJECTED","signatureIssued":false,"transactionsBroadcast":0}\n');process.exitCode=1;}
