/** Finish interrupted publication after Original Mixed capture. Read-only
 * supervisor capabilities validate the existing state; no runtime opens. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PUBLIC_OPERATOR_STATE_V4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from './public-operator-state-v4.mjs';
import {publicUniswapConfigurationV6,PUBLIC_UNISWAP_MODE_FILE_V6} from './public-uniswap-mode-v6.mjs';
assert.equal(process.argv.length,2);assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=1024']);
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),load=p=>import(pathToFileURL(join(root,p)).href);
let config,sup,reader;
try{
 const bytes=await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'operator.json');try{config=JSON.parse(bytes);}finally{bytes.fill(0);}
 const phone=JSON.parse(await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-phone-connection.json')),original=JSON.parse(await readPrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,'paired-connection.json'));
 const input=publicUniswapConfigurationV6(config,phone.descriptor.devicePublicKey),M=await load('packages/backend/src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs'),R=await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs');
 const state=await M.readOriginalPagedPublicUniswapMixedRecoveryModeV6({directory:input.parent.supervisorDirectory,password:config.journal.password});assert.equal(state.phase,'CAPTURED');assert.equal(state.parentDirectory,config.supervisorDirectory);assert.deepEqual(state.descriptor,original.descriptor);
 sup=await M.openOriginalPagedPublicUniswapReadRecoverySupervisorV6({directory:input.parent.supervisorDirectory,password:config.journal.password});
 const descriptors=await sup.sourceDescriptors();assert.equal(descriptors.length,1);assert.equal(descriptors[0].devicePublicKey,phone.descriptor.devicePublicKey);
 const parents=await sup.parent.sourceDescriptors();assert.ok(parents.some(d=>d.pairingId===phone.descriptor.pairingId));
 reader=await R.consumeOriginalPagedSourceReadRecoveryV4(await sup.parent.issueSource(original.descriptor.pairingId));
 const binding=await R.readOriginalPagedSourceReadRecoveryBindingV4(reader),source=JSON.parse(await readFile(join(config.nativeDirectory,'source-operations','native-wallet.json'))),dispatch=JSON.parse(await readFile(join(config.nativeDirectory,'dispatch-journal','native-wallet.json'))),checkpoint=binding.native.source.checkpoint;
 assert.equal(source.configurationSHA256,checkpoint.identity);assert.equal(source.revision,checkpoint.revision);assert.equal(createHash('sha256').update(JSON.stringify(source.operations)).digest('hex'),checkpoint.dataSHA256);assert.equal(source.operations.length,13);assert.ok(source.operations.every(r=>r.phase==='FINALIZED'));assert.equal(dispatch.operations.length,0);
 R.closeOriginalPagedSourceReadRecoveryV4(reader);reader=null;await sup.close();sup=null;
 await writePrivateOperatorFileV4(PUBLIC_OPERATOR_STATE_V4,PUBLIC_UNISWAP_MODE_FILE_V6,Buffer.from(JSON.stringify({profile:'ORIGINAL_PUBLIC_UNISWAP_ACTIVE_CONFIGURATION_V6',supervisorDirectory:input.parent.supervisorDirectory,devicePublicKey:phone.descriptor.devicePublicKey})+'\n'));
 process.stdout.write(JSON.stringify({stage:'CAPTURED_UNISWAP_MODE_PUBLISHED',financialPermissionIssued:false,transactionsBroadcast:0,publicProfilesPublishedByNormalStartup:true})+'\n');
}catch{process.exitCode=1;process.stderr.write('{"stage":"CAPTURED_UNISWAP_PUBLICATION_REJECTED","transactionsBroadcast":0}\n');}
finally{if(reader)(await load('packages/backend/src/operations/recovery/paged-runtime-recovery-authority-v3.mjs')).closeOriginalPagedSourceReadRecoveryV4(reader);await sup?.close();if(config)config.journal.password=null;}
