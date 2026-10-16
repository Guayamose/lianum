/** Test-only owned Sepolia fork. Upstream is read-only; every signed wire,
 * contract execution, state change and receipt stays in the owned Anvil.
 * Synthetic balances and consensus are explicit HOST setup, never grants. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,stat,open,realpath,lstat,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pinnedBinary,unusedLoopbackPort,startOwnProcess,stopOwnProcess,sleep} from '../../packages/engine/src/chains/shared/runtime-harness.mjs';
import {linuxRuntimePins} from '../../packages/engine/src/chains/shared/linux-runtime-pins.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1} from '../../packages/backend/src/native-wallet/public-testnet-rpc-route-v1.mjs';
import {waitPublicSepoliaReadTurnV1} from '../../packages/backend/src/native-wallet/public-read-rpc-scheduler-v1.mjs';

const fetchOriginal=globalThis.fetch,owners=new WeakMap(),UPSTREAM=PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint;
/** Match only the two explicit product routes, so owned acceptance wires never
 * escape to the public RPC after the retained endpoint is resolved. */
export function isPublicSepoliaForkProductEndpointV5(endpoint){
 if(typeof endpoint!=='string')return false;
 return [PUBLIC_SEPOLIA_RPC_ROUTE_V1.retainedEndpoint,PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint].some(value=>endpoint===value||endpoint===value+'/');
}
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const upstreamMethods=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getBalance','eth_getStorageAt','eth_getProof','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getLogs','eth_call','eth_getBlockReceipts','eth_getBlockAccessList']);
const productMethods=new Set([...upstreamMethods,'eth_estimateGas','eth_maxPriorityFeePerGas','eth_gasPrice','eth_sendRawTransaction']);
const readMethods=new Set([...upstreamMethods,'eth_maxPriorityFeePerGas','eth_gasPrice']);
function packet(value){assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype);assert.equal(value.jsonrpc,'2.0');assert.ok(typeof value.method==='string'&&(!Object.hasOwn(value,'params')||Array.isArray(value.params)));assert.ok(Object.keys(value).every(key=>['jsonrpc','id','method','params'].includes(key)));return value;}
async function jsonBody(req){const parts=[];let size=0;for await(const part of req){size+=part.length;assert.ok(size<=4*1024*1024,'FORK_REQUEST_LIMIT');parts.push(part);}return JSON.parse(Buffer.concat(parts));}
function reply(res,value,status=200){const bytes=Buffer.from(JSON.stringify(value));assert.ok(bytes.length<=8*1024*1024);res.writeHead(status,{'Content-Type':'application/json','Content-Length':bytes.length});res.end(bytes);}
async function remote(body){const signal=AbortSignal.timeout(30000);await waitPublicSepoliaReadTurnV1(UPSTREAM,signal);const response=await fetchOriginal(UPSTREAM,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal});assert.equal(response.status,200,'FORK_UPSTREAM_HTTP');const text=await response.text();assert.ok(Buffer.byteLength(text)<=8*1024*1024);return JSON.parse(text);}
function live(handle){const s=owners.get(handle);assert.ok(s&&!s.closed,'FORK_ORIGINAL_OWNED_PROCESS');assert.ok(!s.miningFailure,'FORK_WALLCLOCK_MINING_FAILED');s.process.assertAlive();return s;}

async function savedState(path){
 const file=await open(path,'r');try{const before=await file.stat();assert.ok(before.isFile()&&before.uid===process.getuid()&&before.size>0&&before.size<=8*1024*1024*1024,'FORK_OWNED_STATE_DUMP_BOUND');const prefix=Buffer.alloc(512);const {bytesRead}=await file.read(prefix,0,prefix.length,0),match=/^\s*\{\s*"block"\s*:\s*\{\s*"number"\s*:\s*"(0x[0-9a-f]+)"/.exec(prefix.subarray(0,bytesRead).toString('utf8'));assert.ok(match,'FORK_PINNED_STATE_HEADER');const hash=createHash('sha256');for await(const chunk of file.createReadStream({start:0,autoClose:false,highWaterMark:1024*1024}))hash.update(chunk);const after=await file.stat();for(const key of ['dev','ino','size','mtimeMs'])assert.equal(after[key],before[key],'FORK_STATE_FILE_CHANGED');return{path,bytes:before.size,sha256:hash.digest('hex'),blockNumber:match[1]};}finally{await file.close();}
}
export async function createPublicSepoliaForkHarnessV5(){assert.equal(arguments.length,0);return createFork(null);}
/** Test-only restore of an actual owned dump. Caller hashes bind physical
 * evidence; this handle grants no production Source, permission or funding. */
export async function restorePublicSepoliaForkHarnessV5(input){
 assert.equal(arguments.length,1);assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype);assert.deepEqual(Object.keys(input).sort(),['directory','evidenceSHA256','stateSHA256']);for(const key of ['stateSHA256','evidenceSHA256'])assert.match(input[key],/^[0-9a-f]{64}$/);const directory=resolve(input.directory);assert.equal(directory,input.directory);assert.ok(directory.startsWith(join(tmpdir(),'lianum-sepolia-fork-v5-')));assert.equal(await realpath(directory),directory);const info=await lstat(directory);assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o777)===0o700);const evidencePath=join(directory,'evidence.json'),evidenceInfo=await lstat(evidencePath),statePath=join(directory,'owned-chain-state.json'),stateInfo=await lstat(statePath);assert.ok(evidenceInfo.isFile()&&!evidenceInfo.isSymbolicLink()&&evidenceInfo.size<65536&&stateInfo.isFile()&&!stateInfo.isSymbolicLink());const raw=await readFile(evidencePath);assert.equal(createHash('sha256').update(raw).digest('hex'),input.evidenceSHA256);const evidence=JSON.parse(raw);assert.equal(evidence.profile,'HOST_OWNED_SEPOLIA_FORK_EVM_V5');assert.equal(evidence.upstreamWriteAttempts,0);assert.equal(evidence.publicPayments,0);assert.ok(Number.isSafeInteger(evidence.localFinancialPosts)&&evidence.localFinancialPosts>=0);const state=await savedState(statePath);assert.equal(state.sha256,input.stateSHA256);return createFork({state,evidence,directory});
}
async function createFork(restored){
 const directory=await mkdtemp(join(tmpdir(),'lianum-sepolia-fork-v5-'));let upstream,processHandle,proxy,handle;
 const stats=restored?structuredClone(Object.fromEntries(['upstreamReads','upstreamWriteAttempts','upstreamRejectedMethods','localFinancialPosts','mines'].map(key=>[key,restored.evidence[key]]))):{upstreamReads:0,upstreamWriteAttempts:0,upstreamRejectedMethods:[],localFinancialPosts:0,mines:0};
 try{
  upstream=http.createServer(async(req,res)=>{try{
   assert.equal(req.method,'POST');const raw=await jsonBody(req),rows=Array.isArray(raw)?raw:[raw];assert.ok(rows.length>0&&rows.length<=64);
   for(const value of rows){packet(value);if(!upstreamMethods.has(value.method)){if(/^(eth_send|eth_sign|personal_|wallet_|anvil_|hardhat_)/.test(value.method))stats.upstreamWriteAttempts++;if(!stats.upstreamRejectedMethods.includes(value.method))stats.upstreamRejectedMethods.push(value.method);throw Error('FORK_UPSTREAM_READ_ONLY');}}
   stats.upstreamReads+=rows.length;reply(res,await remote(raw));
  }catch{reply(res,{jsonrpc:'2.0',id:null,error:{code:-32601,message:'FORK_UPSTREAM_READ_ONLY_OR_UNAVAILABLE'}},403);}});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const anchor=await remote({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:[restored?restored.evidence.anchor.number:'latest',false]});assert.ok(anchor.result&&!anchor.error);const number=BigInt(anchor.result.number);assert.ok(number>0n);if(restored)assert.equal(anchor.result.hash,restored.evidence.anchor.hash,'FORK_RESTORE_SAME_PUBLIC_ANCHOR');
  const binary=await pinnedBinary(...linuxRuntimePins.anvil),port=await unusedLoopbackPort(),endpoint='http://127.0.0.1:'+port;
  processHandle=startOwnProcess(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','11155111','--hardfork','osaka','--accounts','0','--no-cors','--no-mining','--gas-limit','200000000','--gas-price','1','--base-fee','1','--disable-min-priority-fee','--no-fork-node-info','--dump-state',join(directory,'owned-chain-state.json'),'--preserve-historical-states','--fork-url','http://127.0.0.1:'+upstream.address().port,'--fork-block-number',String(number),...(restored?['--load-state',restored.state.path]:[]),'--quiet'],directory);
  let sequence=0;const call=async(method,params=[])=>{processHandle.assertAlive();const response=await fetchOriginal(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(response.status,200,'FORK_LOCAL_RPC_HTTP');const value=await response.json();if(value.error){const error=Error('FORK_LOCAL_RPC_FAILED');error.rpcCode=value.error.code;error.rpcMethod=method;error.rpcMessage=typeof value.error.message==='string'?value.error.message.slice(0,256):null;throw error;}processHandle.assertAlive();return value.result;};
  let ready=false;for(let i=0;i<300;i++){processHandle.assertAlive();try{ready=await call('eth_chainId')==='0xaa36a7';if(ready)break;}catch{}await sleep(100);}assert.ok(ready,'FORK_PROCESS_READY');
  assert.equal((await call('eth_getBlockByNumber',['0x0',false])).hash,GENESIS,'FORK_ACTUAL_PUBLIC_GENESIS');
  proxy=http.createServer(async(req,res)=>{try{
   live(handle);assert.equal(req.method,'POST');const raw=packet(await jsonBody(req));assert.ok(productMethods.has(raw.method),'FORK_PRODUCT_RPC_METHOD');
   const params=structuredClone(raw.params??[]);
   // Anvil has no beacon consensus. Only this declared HOST finality tag
   // projection changes; all returned headers/state/receipts are actual EVM.
   if(['eth_getBlockByNumber','eth_getCode','eth_getBalance','eth_getStorageAt','eth_getTransactionCount','eth_call'].includes(raw.method))for(let i=0;i<params.length;i++)if(params[i]==='finalized'||params[i]==='safe')params[i]='latest';
   const response=await fetchOriginal(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...raw,params}),redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);const value=await response.json();if(raw.method==='eth_maxPriorityFeePerGas'&&!value.error)value.result='0x1';
   if(raw.method==='eth_sendRawTransaction'&&!value.error){stats.localFinancialPosts++;await minePublicSepoliaForkCurrentTimeV5(handle);}
   reply(res,value);
  }catch{reply(res,{jsonrpc:'2.0',id:null,error:{code:-32000,message:'FORK_OWNED_LOCAL_RPC_FAILED'}},500);}});
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  handle=Object.freeze({profile:'HOST_OWNED_SEPOLIA_FORK_EVM_V5',rpcURL:'http://127.0.0.1:'+proxy.address().port});
  owners.set(handle,{process:processHandle,upstream,proxy,directory,call,closed:false,stats,anchor:{number:anchor.result.number,hash:anchor.result.hash,timestamp:anchor.result.timestamp}});
  if(restored){const head=await call('eth_getBlockByNumber',['latest',false]);assert.equal(head.number,restored.state.blockNumber,'FORK_RESTORED_DUMP_HEAD');const restoredAnchor=await call('eth_getBlockByNumber',[restored.evidence.anchor.number,false]);assert.equal(restoredAnchor.hash,restored.evidence.anchor.hash);owners.get(handle).restoration={profile:'HOST_SAME_OWNED_FORK_RESTORED_V5',priorDirectory:restored.directory,stateSHA256:restored.state.sha256,head:{number:head.number,hash:head.hash,timestamp:head.timestamp},financialAuthority:false};await writeFile(join(directory,'restoration.json'),JSON.stringify(owners.get(handle).restoration),{mode:0o600});}
  await minePublicSepoliaForkCurrentTimeV5(handle);const s=owners.get(handle);s.timer=setInterval(()=>{void minePublicSepoliaForkCurrentTimeV5(handle).catch(error=>{s.miningFailure=error.message;clearInterval(s.timer);});},10000);s.timer.unref();return handle;
 }catch(error){await writeFile(join(directory,'failure-evidence.json'),JSON.stringify({profile:'HOST_SEPOLIA_FORK_START_FAILURE_V5',diagnostic:processHandle?.diagnostic().slice(0,2048)??null,exitCode:processHandle?.child.exitCode??null,stats}),{mode:0o600});error.forkFailureDirectory=directory;if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}if(processHandle)await stopOwnProcess(processHandle);if(upstream){upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));}throw error;}
}
export async function readPublicSepoliaForkV5(handle,method,params=[]){assert.equal(arguments.length,3);assert.ok(readMethods.has(method),'FORK_READ_ONLY_QUERY');return live(handle).call(method,structuredClone(params));}
export async function seedPublicSepoliaForkBootstrapV5(handle,addresses){
 assert.equal(arguments.length,2);const s=live(handle);assert.equal(s.stats.localFinancialPosts,0,'FORK_SEED_BEFORE_FINANCIAL_POST');assert.ok(Array.isArray(addresses)&&addresses.length>0&&addresses.length<=16&&new Set(addresses).size===addresses.length);for(const address of addresses)assert.match(address,/^0x[0-9a-f]{40}$/);
 for(const address of addresses)await s.call('anvil_setBalance',[address,'0x8ac7230489e80000']);await minePublicSepoliaForkCurrentTimeV5(handle);
 return Object.freeze({profile:'HOST_SYNTHETIC_FORK_BOOTSTRAP_ONLY_V5',accounts:addresses.length,publicFundsMoved:false});
}
export async function minePublicSepoliaForkCurrentTimeV5(handle){
 assert.equal(arguments.length,1);const s=live(handle);if(s.mining)return s.mining;
 const work=(async()=>{const head=await s.call('eth_getBlockByNumber',['latest',false]),now=BigInt(Math.floor(Date.now()/1000)),before=BigInt(head.timestamp);assert.ok(before<=now+1n,'FORK_NO_FUTURE_CLOCK');
  await s.call('anvil_setNextBlockBaseFeePerGas',['0x1']);await s.call('evm_mine',[Number(now>=before?now:before)]);s.stats.mines++;const after=await s.call('eth_getBlockByNumber',['latest',false]);assert.ok(BigInt(after.timestamp)>=before&&BigInt(after.timestamp)<=BigInt(Math.floor(Date.now()/1000))+1n);return {hash:after.hash,number:after.number,timestamp:after.timestamp};
 })();s.mining=work;try{return await work;}finally{if(s.mining===work)s.mining=null;}
}
export function publicSepoliaForkEvidenceV5(handle){assert.equal(arguments.length,1);const s=live(handle);return Object.freeze({profile:handle.profile,anchor:{...s.anchor},...s.stats,chainId:'11155111',consensus:'HOST_FINALIZED_TAG_TO_ACTUAL_LOCAL_HEAD',execution:'REAL_OWNED_ANVIL',feeOracle:'HOST_SYNTHETIC_PRIORITY_1_WEI',upstream:'READ_ONLY',publicPayments:0,directory:s.directory,pid:s.process.child.pid,...(s.restoration?{restoration:structuredClone(s.restoration)}:{})});}
export async function stopPublicSepoliaForkHarnessV5(handle){
 assert.equal(arguments.length,1);const s=owners.get(handle);assert.ok(s,'FORK_ORIGINAL_OWNED_PROCESS');if(s.stopping)return s.stopping;
 s.stopping=(async()=>{clearInterval(s.timer);s.closed=true;const failures=[];if(s.mining)await Promise.allSettled([s.mining]);
  try{s.proxy.closeAllConnections();await new Promise((resolve,reject)=>s.proxy.close(error=>error?reject(error):resolve()));}catch(error){failures.push(error);}
  // Preserve this owned EVM before terminating it. The dump contains HOST
  // setup and actual local execution; it is never a Source or signing grant.
  let preservedHead=null,stateDump=null;
  if(s.process.child.exitCode===null&&s.process.child.signalCode===null){
   try{preservedHead=await s.call('eth_getBlockByNumber',['latest',false]);}catch(error){failures.push(error);}
  }
  try{await stopOwnProcess(s.process);}catch(error){failures.push(error);}
  if(preservedHead){try{
   const path=join(s.directory,'owned-chain-state.json');await chmod(path,0o600);const saved=await savedState(path);assert.equal(saved.blockNumber,preservedHead.number,'FORK_OWNED_STATE_DUMP_HEAD');
   stateDump={profile:'HOST_OWNED_ANVIL_STATE_DUMP_V5',path,bytes:saved.bytes,sha256:saved.sha256,head:preservedHead,restored:false,financialAuthority:false};
   await writeFile(join(s.directory,'owned-chain-checkpoint.json'),JSON.stringify(stateDump),{mode:0o600});
  }catch(error){failures.push(error);}}
  try{s.upstream.closeAllConnections();await new Promise((resolve,reject)=>s.upstream.close(error=>error?reject(error):resolve()));}catch(error){failures.push(error);}
  await writeFile(join(s.directory,'evidence.json'),JSON.stringify({profile:handle.profile,anchor:s.anchor,...s.stats,stopped:failures.length===0,stateDump,miningFailure:s.miningFailure??null,publicPayments:0}),{mode:0o600});
  if(failures.length)throw new AggregateError(failures,'FORK_OWNED_CLOSE_FAILED');
 })();return s.stopping;
}
