/** One startup-only diagnostic, no CRS/witness/proof. Bounded native logger. */
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {readFileSync,writeFileSync,readdirSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {filePin,hash,guard,resources,WALLET_RESOURCE_FLOORS} from '../../../../../packages/proofs/programs/wallet-notes/resources.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const bbPath=fileURLToPath(new URL('../../pc5-proof-probe/node_modules/@aztec/bb.js/build/amd64-linux/bb',import.meta.url));
filePin(bbPath,{bytes:38240512,sha256:'5a1c1ccd835e257217880936f837847fd74c8d5993497527f070fb2308f9145b'});
if(process.argv[2]==='child'){
 const result={classification:'STARTUP_ONLY_NO_CRS_WITNESS_OR_PROOF',socketPath:tmpdir()+`/bb-${process.pid}-0-0.sock`,backend:'NativeUnixSocket',threads:1,logs:[],logBytes:0};
 result.socketPathBytes=Buffer.byteLength(result.socketPath);result.linuxSockaddrUnPathCapacityBytes=108;
 const spawn=childProcess.spawn;
 childProcess.spawn=(file,args,options)=>{const p=spawn(file,args,options);if(file===bbPath){result.nativePID=p.pid;result.nativeArgs=args;p.once('exit',(code,signal)=>{result.nativeExitCode=code;result.nativeSignal=signal;});p.once('error',e=>{result.nativeSpawnError={name:e.name,message:e.message,code:e.code};});}return p;};
 syncBuiltinESMExports();let api;
 try{assert.equal(existsSync(result.socketPath),false,'DIAG_EXISTING_UNOWNED_SOCKET');const {Barretenberg,BackendType}=await import('@aztec/bb.js');const t=performance.now();api=await Barretenberg.new({backend:BackendType.NativeUnixSocket,threads:1,skipSrsInit:true,bbPath,logger:s=>{result.logBytes+=Buffer.byteLength(s);if(result.logBytes<=16384)result.logs.push(s);}});result.apiMilliseconds=performance.now()-t;result.constructed=true;}
 catch(e){result.constructed=false;result.error={name:e.name,message:e.message,code:e.code};}
 finally{if(api)await api.destroy();await new Promise(r=>setTimeout(r,100));result.socketStillPresent=existsSync(result.socketPath);process.send(result,()=>process.disconnect());}
}else{
 const startedAt=new Date().toISOString(),report={classification:'BOUNDED_STARTUP_ONLY_DIAGNOSTIC',startedAt,before:guard(),monitorIntervalMilliseconds:250,timeoutMilliseconds:15000,source:filePin(root+'diagnose-native-startup.mjs')};
 const child=childProcess.fork(fileURLToPath(import.meta.url),['child'],{cwd:root,detached:true,stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME,LANG:'C.UTF-8'}});
 const observed=new Map();
 function members(){const found=[];for(const n of readdirSync('/proc')){if(!/^\d+$/.test(n))continue;try{const s=readFileSync('/proc/'+n+'/stat','utf8'),a=s.slice(s.lastIndexOf(')')+2).split(' ');if(Number(a[2])===child.pid){const p={pid:Number(n),startTime:a[19],state:a[0]};observed.set(p.pid+':'+p.startTime,p);found.push(p);}}catch{}}return found;}
 const signal=s=>{for(const p of members())try{process.kill(p.pid,s);}catch{}};
 let failure;const stop=reason=>{failure??=reason;signal('SIGKILL');};
 const interval=setInterval(()=>{try{members();guard();}catch{stop('RESOURCE_FLOOR');}},250),timeout=setTimeout(()=>stop('TIMEOUT'),15000);
 child.on('message',r=>report.result=r);child.once('error',()=>stop('SPAWN'));
 const exit=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
 clearInterval(interval);clearTimeout(timeout);let remain=members();if(remain.some(p=>p.state!=='Z')){signal('SIGKILL');await new Promise(r=>setTimeout(r,100));remain=members();}
 Object.assign(report,{childExit:exit,failure,ownedIdentities:[...observed.values()],ownedLiveProcessesRemaining:remain.filter(p=>p.state!=='Z').length,ownedZombieProcessesRemaining:remain.filter(p=>p.state==='Z').length,after:resources(),completedAt:new Date().toISOString()});
 const path=root+'native-startup-'+startedAt.replace(/[:.]/g,'-')+'.json';writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({path,sha256:hash(readFileSync(path)),...report}));
}
