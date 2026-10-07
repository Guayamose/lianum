import { startLocalServer } from '../../../packages/engine/src/api/server.mjs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
const root=resolve(import.meta.dirname,'..');await mkdir(join(root,'.local'),{recursive:true});
const app=await startLocalServer({port:0,initialTime:1800000000000});
const profile=await mkdtemp(join(root,'.local','browser-qa-'));
try{
  const html=await (await fetch(app.origin)).text();const token=html.match(/name="local-token" content="([0-9a-f]+)"/)[1];
  const action=async body=>{const response=await fetch(app.origin+'/api/action',{method:'POST',headers:{'X-Local-Token':token,'Content-Type':'application/json',Origin:app.origin},body:JSON.stringify(body)});if(!response.ok)throw new Error('QA_ACTION_FAILED');return response.json();};
  const opened=await action({action:'create'});for(const legId of ['ethereum','solana','bitcoin'])await action({action:'execute',hash:opened.hash,legId});await action({action:'settle',hash:opened.hash});
  const executable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const result=await new Promise((done,reject)=>{
    const child=spawn(executable,['--headless','--no-first-run','--no-default-browser-check','--disable-background-networking',`--user-data-dir=${profile}`,'--window-size=1440,1200','--virtual-time-budget=6000',`--screenshot=${join(root,'evidence','client-desktop.png')}`,'--dump-dom',app.origin],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill();reject(new Error('BROWSER_QA_TIMEOUT'));},25000);let output='',errors='';
    child.stdout.on('data',chunk=>{if(output.length<200000)output+=chunk;});child.stderr.on('data',chunk=>{if(errors.length<10000)errors+=chunk;});child.once('error',reject);child.once('close',code=>{clearTimeout(timer);done({code,output,errors});});
  });
  const report={status:result.code===0?'HEADLESS_RENDERED':'BLOCKED',code:result.code,viewport:{width:1440,height:1200},classification:'SIMULATION_UI',domContainsSettled:result.output.includes('SETTLED'),domContainsSimulation:result.output.includes('SIMULACIÓN'),screenshot:result.code===0?'evidence/client-desktop.png':null};
  await writeFile(join(root,'evidence','client-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(result.code!==0){console.log(result.errors.slice(0,1000));process.exitCode=1;}
}finally{await app.close();}
