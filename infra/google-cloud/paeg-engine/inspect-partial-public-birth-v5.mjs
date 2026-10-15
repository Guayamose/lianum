/** Fixed server-only inspector. Returns DATA; never continues a birth. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
try{
 const {inspectOriginalPagedPublicPartialBootstrapV5}=await import(pathToFileURL(join(root,'packages/backend/src/chains/public-testnet/sepolia-partial-bootstrap-inspector-v5.mjs')).href);
 const result=await inspectOriginalPagedPublicPartialBootstrapV5({operatorDirectory:'/var/lib/lianum-testnet-signer/paeg-public-v4',nativeDirectory:'/var/lib/lianum-testnet-signer/paeg-provider-v1'});
 assert.match(result.checkpointSHA256,/^[a-f0-9]{64}$/);assert.ok(result.checkpoint&&result.observation);process.stdout.write(JSON.stringify(result)+'\n');
}catch{process.stderr.write('{"code":"PAEG_PARTIAL_BIRTH_INSPECTION_REJECTED","signatureIssued":false,"transactionsBroadcast":0}\n');process.exitCode=1;}
