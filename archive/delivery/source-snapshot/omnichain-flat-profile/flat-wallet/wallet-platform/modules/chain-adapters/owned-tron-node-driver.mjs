/** Fixed private java-tron stdio driver. No URL, process, adapter, key, clock,
 * binary path or callback is caller-selectable. Never stock FullNode.main.
 * Activation requires reviewed offline-patched source/JDK/class closure pins. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat,realpath,mkdir,mkdtemp,chmod } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exact,hex } from './owned-tron-native-value-profile.mjs';
export const TRON_UPSTREAM=Object.freeze({repository:'https://github.com/tronprotocol/java-tron',tag:'GreatVoyage-v4.8.2.3',commit:'5c449a18a2bb995d3b688d1587e664d909b473c7',
  fullNodeSHA256:'faef7f4d89b9f154632bbab2db1712c25f02ee37b356013e098558ea994accec',fullNodeBytes:145750002,requiredJava:'1.8',arch:'x64'});
// This is a release gate, not configuration. Do not populate from environment,
// argument, a caller manifest or the digest of a just-compiled unreviewed binary.
export const OWNED_TRON_RUNTIME_RELEASE=null;
const runtimeRoot=fileURLToPath(new URL('../../../../../omnichain-product/.local/owned-tron-native-value-v1/',import.meta.url));
export function inspectOwnedTronRuntimePrerequisites(){assert.equal(arguments.length,0);return Object.freeze({classification:'SOURCE_ONLY_UNRELEASED_TRON_RUNTIME',
 upstream:TRON_UPSTREAM,release:OWNED_TRON_RUNTIME_RELEASE,requiredFiles:Object.freeze(['jdk8/bin/java','FullNode-offline.jar','driver/OwnedTronNativeDriver.class']),
 blockers:Object.freeze(['PINNED_JAVA8_RUNTIME_CLOSURE_ABSENT','OFFLINE_PATCHED_NODE_BUILD_AND_DRIVER_CLASS_UNBUILT','NO_SOCKET_NATIVE_CONSENSUS_ACCEPTANCE_UNEXECUTED']),
 publicNetwork:false,canLaunch:false,graphAdmissionEligible:false,creditEligible:false});}
async function pinned(relative,expected){const root=await realpath(runtimeRoot),path=join(root,relative);assert.equal(await realpath(path),path,'OWNED_TRON_RUNTIME_SYMLINK');
 const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink());const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);assert.equal(h.digest('hex'),expected,'OWNED_TRON_RUNTIME_PIN');return path;}
export async function startFixedOwnedTronDriver(){assert.equal(arguments.length,0);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
 assert.ok(OWNED_TRON_RUNTIME_RELEASE,'OWNED_TRON_RUNTIME_RELEASE_ABSENT');
 const release=OWNED_TRON_RUNTIME_RELEASE;
 const java=await pinned('jdk8/bin/java',release.javaSHA256),jar=await pinned('FullNode-offline.jar',release.jarSHA256),driver=await pinned('driver/OwnedTronNativeDriver.class',release.driverSHA256);
 // A complete JDK native/shared-library inventory, offline patch source closure,
 // driver source and one fixed tested configuration must also be pinned.
 for(const item of release.files)await pinned(item.path,item.sha256);
 const root=join(runtimeRoot,'retained');await mkdir(root,{recursive:true,mode:0o700});await chmod(root,0o700);
 const directory=await mkdtemp(join(root,'owned-'));await chmod(directory,0o700);
 const child=spawn(java,['-Xms256m','-Xmx1536m','-XX:ActiveProcessorCount=2','-Djava.net.preferIPv4Stack=true','-cp',jar+':'+dirname(driver),'OwnedTronNativeDriver'],
  {cwd:directory,env:{HOME:directory,TMPDIR:directory,TEMP:directory,TMP:directory,LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
 let dead=false,pending=null,line='',stderrBytes=0,readyResolve,readyReject;const ready=new Promise((a,b)=>{readyResolve=a;readyReject=b;});
 const fail=error=>{dead=true;pending?.reject(error);pending=null;readyReject(error);};
 child.on('error',()=>fail(new Error('OWNED_TRON_DRIVER_PROCESS_ERROR')));child.on('exit',()=>fail(new Error('OWNED_TRON_DRIVER_EXITED')));
 child.stderr.on('data',bytes=>{stderrBytes+=bytes.length;if(stderrBytes>1024*1024)fail(new Error('OWNED_TRON_DRIVER_LOG_LIMIT'));});
 child.stdout.on('data',bytes=>{line+=bytes.toString('utf8');if(line.length>65536)return fail(new Error('OWNED_TRON_DRIVER_RESPONSE_LIMIT'));
  let i;while((i=line.indexOf('\n'))>=0){const raw=line.slice(0,i);line=line.slice(i+1);let v;try{v=JSON.parse(raw);}catch{return fail(new Error('OWNED_TRON_DRIVER_JSON'));}
   if(v.kind==='ready'&&readyResolve){readyResolve(v);readyResolve=null;}else if(pending){const p=pending;pending=null;clearTimeout(p.timer);v.error?p.reject(new Error('OWNED_TRON_DRIVER_'+v.error)):p.resolve(v);}
   else return fail(new Error('OWNED_TRON_DRIVER_UNSOLICITED_RESPONSE'));}});
 function live(){assert.ok(!dead&&child.exitCode===null&&child.signalCode===null,'OWNED_TRON_ORIGINAL_PROCESS_REQUIRED');}
 function rawCommand(kind,args=[]){live();assert.equal(pending,null,'OWNED_TRON_DRIVER_BUSY');assert.ok(['PREPARE','CURRENT','ARMKEY','ARMSEND','SIGN','BROADCAST','OBSERVE','HEALTH','SOURCEBLOCK','SOURCESOLID','SOURCETX','SOURCEINFO','SOURCEREPLAY','CLOSE'].includes(kind));
  for(const value of args)assert.ok(typeof value==='string'&&/^[0-9a-f]+$/.test(value)&&value.length<=2048,'OWNED_TRON_DRIVER_ARGUMENT');
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{fail(new Error('OWNED_TRON_DRIVER_OUTCOME_UNKNOWN'));},10000);pending={resolve,reject,timer};
   child.stdin.write([kind,...args].join('\t')+'\n',error=>{if(error)fail(new Error('OWNED_TRON_DRIVER_WRITE_UNKNOWN'));});});}
 let queue=Promise.resolve();const command=(kind,args=[])=>{const result=queue.then(()=>rawCommand(kind,args));queue=result.catch(()=>{});return result;};
 let timer;try {const hello=await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('OWNED_TRON_DRIVER_START_TIMEOUT')),120000);})]);
  exact(hello,['kind','metadata']);assert.equal(hello.metadata.classification,'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS');hex(hello.metadata.genesis,32,true);live();
  return Object.freeze({directory,metadata:Object.freeze({...hello.metadata,javaSHA256:release.javaSHA256,patchedNodeSHA256:release.jarSHA256,driverSHA256:release.driverSHA256,offlinePatchSHA256:release.offlinePatchSHA256,replayRecorderPatchSHA256:release.replayRecorderPatchSHA256}),assertAlive:live,
   health:()=>command('HEALTH'),prepare:(amount,memo)=>command('PREPARE',[amount,memo]),current:id=>command('CURRENT',[id]),
   armKey:id=>command('ARMKEY',[id]),armSend:id=>command('ARMSEND',[id]),
   readBlock:height=>command('SOURCEBLOCK',[height]),readSolidBlock:()=>command('SOURCESOLID'),readTransaction:id=>command('SOURCETX',[id]),readTransactionInfo:id=>command('SOURCEINFO',[id]),readReplay:(id,block)=>command('SOURCEREPLAY',[id,block]),
   sign:(id,raw)=>command('SIGN',[id,raw]),broadcast:(id,nativeId,wireHash)=>command('BROADCAST',[id,nativeId,wireHash]),observe:id=>command('OBSERVE',[id]),
   async close(){if(!dead){try{await command('CLOSE');}catch{}}if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}dead=true;},
  });
 }catch(error){child.kill('SIGTERM');throw error;}finally{clearTimeout(timer);}
}
