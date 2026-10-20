/** Local documentation renderer and SVG layout inspection. Node + local Chrome only. */
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const assets=join(root,'docs/assets');
const temporary=await mkdtemp(join(tmpdir(),'lianum-docs-'));
let child;
let socket;
let sequence=0;
const pending=new Map();
const events=new Map();
const timeout=15000;
const request=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Chrome request timed out: ${method}`));},timeout);
  pending.set(id,{resolve,reject,timer});
  socket.send(JSON.stringify({id,method,params}));
});
const nextEvent=method=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{events.delete(method);reject(new Error(`Chrome event timed out: ${method}`));},timeout);
  events.set(method,value=>{clearTimeout(timer);resolve(value);});
});

try {
  child=spawn(process.env.CHROME_BIN||'google-chrome',[
    '--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars',
    '--remote-debugging-port=0',`--user-data-dir=${temporary}/profile`,'about:blank',
  ],{stdio:['ignore','ignore','pipe']});
  const browserURL=await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('Chrome did not start')),timeout);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.stderr.on('data',chunk=>{
      output+=chunk;
      const match=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
  });
  const host=new URL(browserURL).host;
  const targets=await (await fetch(`http://${host}/json/list`)).json();
  const target=targets.find(item=>item.type==='page');
  if(!target)throw new Error('Chrome page unavailable');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const value=JSON.parse(event.data);
    if(value.id){
      const task=pending.get(value.id);
      if(task){clearTimeout(task.timer);pending.delete(value.id);value.error?task.reject(new Error(value.error.message)):task.resolve(value.result);}
    }else if(events.has(value.method)){const receive=events.get(value.method);events.delete(value.method);receive(value.params);}
  });
  await request('Page.enable');
  const report=[];
  for(const filename of (await readdir(assets)).filter(name=>name.endsWith('.svg')&&!['lianum.svg','mark.svg'].includes(name)).sort()){
    const svg=await readFile(join(assets,filename),'utf8');
    const width=Number(svg.match(/<svg[^>]*\bwidth="([\d.]+)"/)[1]);
    const height=Number(svg.match(/<svg[^>]*\bheight="([\d.]+)"/)[1]);
    const html=join(temporary,'drawing.html');
    await writeFile(html,`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await request('Emulation.setDeviceMetricsOverride',{width:Math.ceil(width),height:Math.ceil(height),deviceScaleFactor:1,mobile:false});
    const load=nextEvent('Page.loadEventFired');
    await request('Page.navigate',{url:pathToFileURL(html).href});
    await load;
    await request('Runtime.evaluate',{expression:'document.fonts.ready',awaitPromise:true});
    const layout=await request('Runtime.evaluate',{expression:`JSON.stringify((()=>{
      const svg=document.querySelector('svg');
      const rects=[...svg.querySelectorAll(':scope > rect')].filter(r=>+r.getAttribute('height')>=60&&+r.getAttribute('width')<1200);
      return [...svg.querySelectorAll('text')].flatMap(t=>{
        const b=t.getBBox();const x=+t.getAttribute('x');const y=+t.getAttribute('y');
        const card=rects.find(r=>x>=+r.getAttribute('x')&&x<=+r.getAttribute('x')+(+r.getAttribute('width'))&&y>=+r.getAttribute('y')&&y<=+r.getAttribute('y')+(+r.getAttribute('height')));
        const overflow=b.x<0||b.y<0||b.x+b.width>${width}+1||b.y+b.height>${height}+1||(card&&b.x+b.width>+card.getAttribute('x')+(+card.getAttribute('width'))-8);
        return overflow?[{text:t.textContent,x:b.x,y:b.y,width:b.width,card:card?.getAttribute('width')}]:[];
      });
    })())`,returnByValue:true});
    const overflows=JSON.parse(layout.result.value);
    report.push({file:filename,width,height,overflows});
    const capture=await request('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
    await writeFile(join(assets,filename.replace(/\.svg$/,'.png')),Buffer.from(capture.data,'base64'));
  }
  const reportDir=join(root,'.local/documentation-review');
  const {mkdir}=await import('node:fs/promises');await mkdir(reportDir,{recursive:true});
  await writeFile(join(reportDir,'svg-layout.json'),JSON.stringify(report,null,2)+'\n');
  const failures=report.filter(row=>row.file!=='architecture-detail.svg'&&row.overflows.length);
  console.log(JSON.stringify({rendered:report.length,layoutOverflows:failures}));
  if(failures.length)process.exitCode=1;
}finally{
  if(socket)socket.close();
  if(child&&!child.killed){child.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  for(const {timer} of pending.values())clearTimeout(timer);
  await rm(temporary,{recursive:true,force:true});
}
