/** Authenticate a stopped CAPTURED product. Returns DATA, never a signer. */
import assert from 'node:assert/strict';
import {resolve,join,dirname} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {assertPublicEmptySourceLocationDataV9} from '../../../services/paeg-engine/src/public/public-empty-source-location-v9.mjs';
import {readPublicUniswapModeV6} from '../../../services/paeg-engine/src/public/public-uniswap-mode-v6.mjs';
import {readPublicSepoliaDefiModeV8} from '../../../services/paeg-engine/src/public/public-sepolia-defi-mode-v8.mjs';
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
 // Source and owner journals use Vault's 2 MiB bound, not the 64 KiB configuration-file bound.
 const {hashPagedSourcePrivateFileV4}=await import(pathToFileURL(join(root,'packages/backend/src/operations/recovery/paged-source-read-files-v4.mjs')).href);
 const hashSourceVault=path=>hashPagedSourcePrivateFileV4(path,2*1024*1024);
 bytes=await readPrivateOperatorFileV4(directory,'operator.json');configuration=JSON.parse(bytes.toString('utf8'));
 assert.equal(configuration.supervisorDirectory,join(directory,'supervisor'));assert.equal(configuration.nativeDirectory,native);
 const R=await import(pathToFileURL(join(root,'packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs')).href);
 const location={directory:configuration.supervisorDirectory,password:configuration.journal.password};
 const before=await R.readOriginalPagedPublicRecoveryModeV4(location);assert.equal(before.mode,'CAPTURED','PAEG_PACKAGE_REQUIRES_CAPTURED');
 const window=await readCapturedOriginalPublicFinancialWindowV5(root,configuration);
 assert.equal(window.financialSourcePermissionIssued,false);
 const files={};
 for(const path of [join(directory,'operator.json'),join(directory,'paired-connection.json'),join(directory,'paired-phone-connection.json'),join(native,'keys/provider-keys.aead'),join(native,'keys/wrapping-key.bin'),join(native,'receiver-bootstrap/native-wallet.json'),join(native,'source-operations/native-wallet.json'),join(native,'source-operations/financial-epochs.vault')])files[path]=sha(await readFile(path));
 const compositions={},uniswap=await readPublicUniswapModeV6(root,configuration);
 if(uniswap){assert.equal(uniswap.state.phase,'CAPTURED','PAEG_PACKAGE_MIXED_REQUIRES_CAPTURED');compositions.uniswapCheckpointSHA256=uniswap.state.checkpointSHA256;for(const source of uniswap.state.sourceLocations){await inspectSource(source,uniswap.input.mixed.journal.path,configuration.journal.password,uniswap.input.mixed.devicePublicKey);const packetBytes=await readPrivateOperatorFileV4(directory,'paired-uniswap-connection.json');try{assert.deepEqual(JSON.parse(packetBytes.toString('utf8')).descriptor,source.authority.descriptor,'PAEG_PACKAGE_UNISWAP_PUBLIC_DESCRIPTOR');}finally{packetBytes.fill(0);}}const defi=await readPublicSepoliaDefiModeV8(root,configuration,uniswap);if(defi){compositions.defiCheckpoint={identity:defi.state.identity,revision:defi.state.revision,dataSHA256:defi.state.dataSHA256};const source=defi.state.mixedAuthority,password=sha('LIANUM/PUBLIC/SEPOLIA/DEFI/SOURCE7/AUTHORITY/V8\0'+defi.input.password+'\0'+defi.input.devicePublicKey);await inspectSource(source,join(defi.input.directory,'source7','authority','journal.vault'),password,defi.input.devicePublicKey);defi.input.password=null;for(const name of ['defi-active-v8.json','paired-aave-connection.json','paired-morpho-connection.json'])files[join(directory,name)]=sha(await readPrivateOperatorFileV4(directory,name));}for(const name of ['uniswap-active-v6.json','paired-uniswap-connection.json'])files[join(directory,name)]=sha(await readPrivateOperatorFileV4(directory,name));}
 async function inspectSource(source,rootPath,password,devicePublicKey){assertPublicEmptySourceLocationDataV9(source,rootPath,devicePublicKey);const expected=source.authority??source,record=await new Vault(source.journalPath).read(password);assert.equal(record.data.identity,expected.identity,'PAEG_PACKAGE_SOURCE_IDENTITY');assert.equal(record.revision,expected.journalRevision,'PAEG_PACKAGE_SOURCE_REVISION');assert.equal(sha(canonical(record.data)),expected.journalDataSHA256,'PAEG_PACKAGE_SOURCE_HIGHWATER');assert.deepEqual(record.data.descriptor,expected.descriptor);assert.deepEqual(record.data.emptyReplacementV9??null,source.emptyReplacementV9??null,'PAEG_PACKAGE_SOURCE_LINEAGE');for(const path of [source.journalPath,join(dirname(source.journalPath),'private-owner.vault')])files[path]=await hashSourceVault(path);let lineage=source.emptyReplacementV9,currentPath=source.journalPath;while(lineage){const intentPath=join(dirname(currentPath),'intent.vault'),intent=await new Vault(intentPath).read(password);assert.equal(intent.data.profile,'ORIGINAL_PAGED_EMPTY_REPLACEMENT_INTENT_V9');assert.deepEqual(intent.data.lineage,lineage);files[intentPath]=await hashSourceVault(intentPath);const path=lineage.predecessor.journalPath,data=await new Vault(path).read(password);assert.equal(data.data.identity,lineage.predecessor.identity);assert.equal(data.revision,lineage.predecessor.journalRevision);assert.equal(sha(canonical(data.data)),lineage.predecessor.journalDataSHA256);for(const historic of [path,join(dirname(path),'private-owner.vault')])files[historic]=await hashSourceVault(historic);const previous=data.data.emptyReplacementV9??null;if(previous)assert.equal(previous.generation,lineage.generation-1);else assert.equal(lineage.generation,1);currentPath=path;lineage=previous;}}
 assert.deepEqual(await R.readOriginalPagedPublicRecoveryModeV4(location),before,'PAEG_CAPTURED_PACKAGE_STATE_CHANGED');
 for(const [path,digest]of Object.entries(files))assert.equal(sha(await readFile(path)),digest,'PAEG_CAPTURED_PACKAGE_FILE_CHANGED');
 const checkpoint={profile:'ORIGINAL_CAPTURED_PUBLIC_PACKAGE_CHECKPOINT_V6',supervisor:before.checkpoint,financial:{checkpoint:window.checkpoint,epochId:window.epochId,effectiveExpiresAt:window.effectiveExpiresAt},files,...(uniswap?{compositions}:{})};
 process.stdout.write(JSON.stringify({profile:'ORIGINAL_CAPTURED_PUBLIC_PACKAGE_INSPECTION_V6',checkpointSHA256:sha(JSON.stringify(checkpoint)),mode:'CAPTURED',financialSourcePermissionIssued:false,signatures:0,transactionsBroadcast:0})+'\n');
}catch{
 process.stderr.write('{"code":"PAEG_CAPTURED_PACKAGE_INSPECTION_REJECTED","financialSourcePermissionIssued":false,"transactionsBroadcast":0}\n');process.exitCode=1;
}finally{bytes?.fill(0);if(configuration)configuration.journal.password=null;}
