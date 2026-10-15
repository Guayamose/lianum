/** Authenticate a stopped CAPTURED product. Returns DATA, never a signer. */
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readPrivateOperatorFileV4} from '../../../services/paeg-engine/src/public/public-operator-state-v4.mjs';
import {readCapturedOriginalPublicFinancialWindowV5} from '../../../services/paeg-engine/src/public/read-public-financial-window-v5.mjs';

assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const directory='/var/lib/lianum-testnet-signer/paeg-public-v4',native='/var/lib/lianum-testnet-signer/paeg-provider-v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let configuration,bytes;
try{
 bytes=await readPrivateOperatorFileV4(directory,'operator.json');configuration=JSON.parse(bytes.toString('utf8'));
 assert.equal(configuration.supervisorDirectory,join(directory,'supervisor'));assert.equal(configuration.nativeDirectory,native);
 const R=await import(pathToFileURL(join(root,'packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs')).href);
 const location={directory:configuration.supervisorDirectory,password:configuration.journal.password};
 const before=await R.readOriginalPagedPublicRecoveryModeV4(location);assert.equal(before.mode,'CAPTURED','PAEG_PACKAGE_REQUIRES_CAPTURED');
 const window=await readCapturedOriginalPublicFinancialWindowV5(root,configuration);
 assert.equal(window.financialSourcePermissionIssued,false);
 const files={};
 for(const path of [join(directory,'operator.json'),join(directory,'paired-connection.json'),join(directory,'paired-phone-connection.json'),join(native,'keys/provider-keys.aead'),join(native,'keys/wrapping-key.bin'),join(native,'receiver-bootstrap/native-wallet.json'),join(native,'source-operations/native-wallet.json'),join(native,'source-operations/financial-epochs.vault')])files[path]=sha(await readFile(path));
 assert.deepEqual(await R.readOriginalPagedPublicRecoveryModeV4(location),before,'PAEG_CAPTURED_PACKAGE_STATE_CHANGED');
 const checkpoint={profile:'ORIGINAL_CAPTURED_PUBLIC_PACKAGE_CHECKPOINT_V6',supervisor:before.checkpoint,financial:{checkpoint:window.checkpoint,epochId:window.epochId,effectiveExpiresAt:window.effectiveExpiresAt},files};
 process.stdout.write(JSON.stringify({profile:'ORIGINAL_CAPTURED_PUBLIC_PACKAGE_INSPECTION_V6',checkpointSHA256:sha(JSON.stringify(checkpoint)),mode:'CAPTURED',financialSourcePermissionIssued:false,signatures:0,transactionsBroadcast:0})+'\n');
}catch{
 process.stderr.write('{"code":"PAEG_CAPTURED_PACKAGE_INSPECTION_REJECTED","financialSourcePermissionIssued":false,"transactionsBroadcast":0}\n');process.exitCode=1;
}finally{bytes?.fill(0);if(configuration)configuration.journal.password=null;}
