import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { beginTronCandidateLifetime, bindTronCandidateChildCancellation } from '../tron-candidate-lifetime.mjs';
const owned = spawn(process.execPath, ['--input-type=module', '-e',
  'const timer=setInterval(()=>{},1000);process.stdin.resume();process.stdin.on("end",()=>{clearInterval(timer);process.exit(0)});console.log("ready");'],
  { stdio: ['pipe', 'pipe', 'pipe'] });
const exited = once(owned, 'exit');
await once(owned.stdout, 'data');
const lifetime = beginTronCandidateLifetime(); let failure, calls=0, cleanup;
const close = () => cleanup ??= (async()=>{ calls++; owned.stdin.end(); const [code, signal]=await exited; return {code,signal}; })();
const release = bindTronCandidateChildCancellation(lifetime.signal, error=>{failure=error.message;}, close);
console.log(JSON.stringify({ready:true, ownedPID:owned.pid}));
await new Promise(resolve=>lifetime.signal.addEventListener('abort',resolve,{once:true}));
const result=await close(); release(); lifetime.finish();
console.log(JSON.stringify({failure,calls,cleanup:result}));
