/** Fixed private staging entry. No factories, grants or state arrive via HTTP. */
import assert from 'node:assert/strict';
import {lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),state='/var/lib/lianum-paeg/realm-parent/realm';
assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const original=path=>import(pathToFileURL(join(root,path)).href);
const bootstrap=await original('apps/platform/src/paged-native-bootstrap-v3.mjs');
const backend=await original('packages/backend/src/operations/local/funded-paged-native-operator-v3.mjs');
let acquisition,product,closing,config,stopping=false;
function close(){
 stopping=true;return closing??=(async()=>{
  if(acquisition)product=await acquisition;
  if(product){const result=await product.close();assert.ok(result.closed&&result.originalResourcesStopped&&result.ownedSocketsRemaining===0&&result.retainedOriginalState===true,'PAEG_REMOTE_CAPTURE_UNCONFIRMED');}
  process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  process.stdout.write(JSON.stringify({stage:'STOPPED',controlledCapture:Boolean(product),automaticFunding:false})+'\n');
 })();
}
function finite(error){return backend.readOriginalPagedCaptureFailureV3(error)??backend.readOriginalPagedStartupFailureV3(error)??{stage:'REMOTE',code:'PAEG_REMOTE_ORIGINAL_FAILURE'};}
function stop(){void close().catch(error=>{process.exitCode=1;process.stderr.write(JSON.stringify(finite(error))+'\n');});}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
try{
 const reopening=await lstat(join(state,'startup.json')).then(()=>true,error=>{if(error.code!=='ENOENT')throw error;return false;});
 config=await (reopening?bootstrap.preparePrivatePagedMixedReopenV3:bootstrap.preparePrivatePagedMixedStartupV3)(state);
 if(stopping){config.tls.key=null;config.journal.password=null;await close();}
 else{
  acquisition=(reopening?backend.reopenOriginalPagedMixedNativeOperatorV3:backend.startOriginalPagedMixedNativeOperatorV3)(config);product=await acquisition;
  if(!reopening){await bootstrap.publishNewPagedMixedPairV3(state,product);await bootstrap.publishNewPagedNativeConnectionV3(state,product,config.tls.cert);}
  if(stopping)await close();else process.stdout.write(JSON.stringify({stage:'READY',profile:product.profile,origin:product.origin,reopenedOriginalState:product.reopenedOriginalState,publicConnectionPath:join(state,'paired-connection.json'),publicMobileIngressReady:false,publicChainDeployment:false,automaticFunding:false})+'\n');
 }
}catch(error){process.exitCode=1;process.stderr.write(JSON.stringify(finite(error))+'\n');try{await close();}catch(cleanup){process.stderr.write(JSON.stringify(finite(cleanup))+'\n');}}
finally{if(config){config.tls.key=null;config.journal.password=null;}}
