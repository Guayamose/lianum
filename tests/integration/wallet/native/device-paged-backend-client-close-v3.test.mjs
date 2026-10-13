/** Actual backend client lifetime under delayed HOST process acquisition.
 * No backend, ledger, proof, transport or financial endpoint is constructed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createECDH,createHash} from 'node:crypto';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';

test('close drains a unique restart and never leaves a newly acquired backend alive',async t=>{
 const hash=value=>createHash('sha256').update(value).digest('hex'),key=createECDH('secp256k1');key.generateKeys();
 const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,
  origin:'https://127.0.0.1:9443',pairingId:'host-backend-close-v3',devicePublicKey:key.getPublicKey('hex','uncompressed'),deadlineMs:P.devicePagedNowV3()+3600000,chainId:'31337',
  ...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(name=>[name,hash(name)])),
  ...Object.fromEntries(['pool','state','native','math'].map((name,index)=>[name,'0x'+String(index+1).repeat(40)]))});
 const children=[],live=new Map();let holdReopen=false,holdCapture=false;
 class HostChild extends EventEmitter{
  constructor(reopening){super();this.pid=50000+children.length;this.stdout=new EventEmitter();this.stderr=new EventEmitter();this.connected=true;this.exitCode=null;this.signalCode=null;this.reopening=reopening;this.closes=0;children.push(this);live.set(this.pid,this);if(!reopening||!holdReopen)queueMicrotask(()=>this.ready());}
  ready(){this.emit('message',{type:'ready',value:{profile:'ORIGINAL_PAGED_BACKEND_PROCESS_V3',pid:this.pid,descriptor,reopenedOriginalState:this.reopening,
   providerConfiguration:{chainDomain:hash('provider')},runtimeIdentities:{receiverGenesis:hash('receiver'),nativeEvmGenesis:hash('native')}}});}
  finish(){this.connected=false;this.exitCode=0;live.delete(this.pid);this.emit('close',0,null);}
  capture(){this.emit('message',{type:'reply',id:this.captureId,value:{closed:true,originalResourcesStopped:true}});this.finish();}
  send(frame,callback){callback?.(null);assert.equal(frame.type,'control');queueMicrotask(()=>{if(frame.method==='capture'){this.captureId=frame.id;if(!holdCapture)this.capture();}else{assert.equal(frame.method,'close');this.closes++;this.emit('message',{type:'reply',id:frame.id,value:{closed:true}});this.finish();}});}
  kill(signal){this.signalCode=signal;this.connected=false;live.delete(this.pid);this.emit('close',null,signal);}
 }
 t.mock.module('node:child_process',{exports:{spawn(_exec,args){assert.equal(args[0],'--max-old-space-size=384');assert.match(args[1],/\/device-paged-backend-process-v3\.mjs$/);assert.ok(['new','reopen'].includes(args[2]));return new HostChild(args[2]==='reopen');}}});
 t.mock.module('node:fs/promises',{exports:{async realpath(path){assert.match(path,/\/device-paged-backend-process-v3\.mjs$/);return path;},async readFile(path){const match=/^\/proc\/([0-9]+)\/(stat|task\/[0-9]+\/children)$/.exec(path);assert.ok(match);const child=live.get(Number(match[1]));if(!child)throw Object.assign(Error('HOST process absent'),{code:'ENOENT'});if(match[2]!=='stat')return '';const fields=Array(20).fill('0');fields[0]='S';fields[19]=String(child.pid);return `${child.pid} (HOST) ${fields.join(' ')}`;}}});
 const {openOriginalPagedBackendProcessV3}=await import('./device-paged-backend-client-v3.mjs');
 const wait=async predicate=>{for(let index=0;index<100&&!predicate();index++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate());};
 // A shutdown after capture started prevents opening another process.
 holdCapture=true;let backend=await openOriginalPagedBackendProcessV3('/HOST/operator.json'),before=children.length;
 const restart=backend.restart();assert.equal(backend.restart(),restart);assert.throws(()=>backend.data());assert.throws(()=>backend.query('block'));
 const rejection=assert.rejects(restart,/RESTART_CANCELLED/);await wait(()=>children.at(-1).captureId!==undefined);const stopped=backend.close();children.at(-1).capture();await rejection;await stopped;assert.equal(children.length,before);assert.equal(live.size,0);
 // A shutdown during the new acquisition waits, then closes that exact child.
 holdCapture=false;holdReopen=true;backend=await openOriginalPagedBackendProcessV3('/HOST/operator.json');before=children.length;
 const inFlight=backend.restart(),cancelled=assert.rejects(inFlight,/RESTART_CANCELLED/);await wait(()=>children.length===before+1);const acquired=children.at(-1),drain=backend.close();acquired.ready();await cancelled;await drain;assert.equal(acquired.closes,1);assert.equal(live.size,0);assert.deepEqual(backend.history(),[]);
});
