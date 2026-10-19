/** Real SQLite and process interruption; chain responses are explicit HOST
 * fixtures. No key, signature, transaction or real-chain acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {openPublicFinalizedReadCacheV16 as open,readPublicFinalizedCachedV16 as read,readPublicFinalizedCacheMetricsV16 as metrics} from '../../src/native-wallet/public-finalized-read-cache-v16.mjs';
import {nativeRpcV1,withPublicCanonicalBlockReadsV25 as scoped} from '../../src/native-wallet/http-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from '../../src/native-wallet/public-testnet-rpc-route-v1.mjs';
const endpoint=route.effectiveEndpoint,hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+n.toString(16).padStart(40,'0');
function chain(){
 const state={fork:0,finalized:true,chainId:'0x'+BigInt(route.chainId).toString(16),timestamp:null,calls:[]};
 const header=number=>({number,hash:number==='0x0'?route.genesis:hash(BigInt(number)+1000n+BigInt(state.fork)*10000n),parentHash:hash(0),transactions:[],...(state.timestamp===null?{}:{timestamp:'0x'+(BigInt(state.timestamp)+BigInt(number)).toString(16)})});
 const invoke=async(method,params)=>{
  state.calls.push({method,params:structuredClone(params)});
  if(method==='eth_chainId')return state.chainId;
  if(method==='eth_getBlockByNumber')return params[0]==='finalized'?(state.finalized?header('0x20'):null):params[0]==='latest'?header('0x21'):header(params[0]);
  if(method==='eth_getBlockByHash')return header('0x7');
  if(method==='eth_getCode'||method==='eth_call')return state.fork?'0x6001':'0x6000';
  if(method==='eth_getStorageAt')return hash(7);
  if(method==='eth_getTransactionReceipt')return{transactionHash:params[0],blockNumber:'0x7',blockHash:header('0x7').hash,status:'0x1'};
  if(method==='eth_getTransactionByHash')return{hash:params[0],blockNumber:'0x7',blockHash:header('0x7').hash,to:address(1)};
  if(method==='eth_getBalance'||method==='eth_getTransactionCount')return '0x5';
  throw Error('HOST_UNEXPECTED_METHOD');
 };
 return{state,header,invoke,count:method=>state.calls.filter(row=>row.method===method).length};
}
async function fixture(t){const base=await mkdtemp(join(tmpdir(),'lianum-history-v16-')),directory=join(base,'cache'),network=chain();let current;const start=async()=>{current=await open({directory});await current.prime(network.invoke);return current;};t.after(async()=>{await current?.close();await rm(base,{recursive:true,force:true});});return{base,directory,...network,start,call:(method,params)=>read(endpoint,method,params,undefined,network.invoke)};}

test('finalized deployed code survives advancing heads and process reopening; mutable calls remain block-specific',async t=>{
 const f=await fixture(t);f.state.timestamp=1706655072;let h=await f.start();
 for(const number of ['0x7','0x8','0x9']){
  await f.call('eth_getBlockByNumber',[number,false]);
  assert.equal(await f.call('eth_getCode',[address(900),{blockHash:f.header(number).hash,requireCanonical:true}]),'0x6000');
  await f.call('eth_call',[{to:address(900),data:'0x1234'},{blockHash:f.header(number).hash,requireCanonical:true}]);
 }
 assert.equal(f.count('eth_getCode'),1);assert.equal(f.count('eth_call'),3);assert.equal(metrics().finalizedImmutableCodeHitsV25,2);
 await h.close();f.state.calls.length=0;h=await f.start();await f.call('eth_getBlockByNumber',['0xa',false]);
 assert.equal(await f.call('eth_getCode',[address(900),{blockHash:f.header('0xa').hash,requireCanonical:true}]),'0x6000');assert.equal(f.count('eth_getCode'),0);
 await h.close();f.state.fork=1;h=await f.start();await f.call('eth_getBlockByNumber',['0xb',false]);assert.equal(await f.call('eth_getCode',[address(900),{blockHash:f.header('0xb').hash,requireCanonical:true}]),'0x6001');assert.equal(f.count('eth_getCode'),1,'changed finalized ancestry invalidates immutable code as well');
});
test('cross-block reuse excludes pre-Cancun code, empty code, delegated accounts, backwards reads and unknown headers',async t=>{
 const f=await fixture(t);f.state.timestamp=1706655000;const h=await f.start();let code='0x6000',codeReads=0;
 const invoke=(method,params,signal)=>method==='eth_getCode'?(codeReads++,Promise.resolve(code)):f.invoke(method,params,signal);
 const query=async(id,number)=>{await read(endpoint,'eth_getBlockByNumber',[number,false],undefined,invoke);return read(endpoint,'eth_getCode',[address(id),{blockHash:f.header(number).hash,requireCanonical:true}],undefined,invoke);};
 await query(901,'0x7');await query(901,'0x8');assert.equal(codeReads,2);
 f.state.timestamp=1706655100;await h.close();await f.start();
 for(const [id,value]of [[902,'0x'],[903,'0xef0100'+address(1).slice(2)]]){code=value;const before=codeReads;await query(id,'0xb');await query(id,'0xc');assert.equal(codeReads-before,2);}
 code='0x6000';const before=codeReads;await query(904,'0xc');await query(904,'0xb');assert.equal(codeReads-before,2);
 await read(endpoint,'eth_getCode',[address(904),{blockHash:hash(99999),requireCanonical:true}],undefined,invoke);assert.equal(codeReads-before,3);
});
test('a canonical read group populates persistent history and its fresh exit check cannot be hidden by that history',async t=>{
 const f=await fixture(t);f.state.timestamp=1706655072;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const request=JSON.parse(options.body),one=async q=>({jsonrpc:'2.0',id:q.id,result:await f.invoke(q.method,q.params)});return Response.json(Array.isArray(request)?await Promise.all(request.map(one)):await one(request));});
 let h=await f.start();const rpc=nativeRpcV1(endpoint),head=f.header('0x7');
 await scoped(endpoint,head,()=>rpc('eth_getCode',[address(905),head.number]));await h.close();
 f.state.calls.length=0;h=await f.start();await f.call('eth_getCode',[address(905),{blockHash:head.hash,requireCanonical:true}]);assert.equal(f.count('eth_getCode'),0,'grouped reads retain their validated header for reuse on restart');
 await assert.rejects(scoped(endpoint,head,async()=>{await rpc('eth_getCode',[address(905),head.number]);f.state.fork=1;}),/READ_SCOPE_CANONICAL/);
});

test('the actual HTTP clients reuse finalized headers and pinned state, then return to fresh reads when startup closes',async t=>{
 const f=await fixture(t);
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const request=JSON.parse(options.body),one=async q=>({jsonrpc:'2.0',id:q.id,result:await f.invoke(q.method,q.params)});
  return Response.json(Array.isArray(request)?await Promise.all(request.map(one)):await one(request));
 });
 const handle=await open({directory:f.directory}),rpc=nativeRpcV1(endpoint);
 try{
  await handle.prime(rpc);
  for(let i=0;i<8;i++)assert.equal(await rpc('eth_getCode',[address(101),'0x7']),'0x6000');
  assert.equal(f.count('eth_getCode'),1);assert.equal(f.state.calls.filter(r=>r.method==='eth_getBlockByNumber'&&r.params[0]==='0x7').length,1);
  assert.ok(metrics().finalizedReadCacheHits>=7);
  const before=f.state.calls.length;await assert.rejects(rpc('eth_sendRawTransaction',['0x00']),{code:'NATIVE_WALLET_RPC_STARTUP_READ_ONLY'});assert.equal(f.state.calls.length,before);
 }finally{await handle.close();}
 const before=f.state.calls.length;await rpc('eth_getTransactionReceipt',[hash(90)]);await rpc('eth_getTransactionReceipt',[hash(90)]);assert.equal(f.state.calls.length-before,2);
});
test('a reopened database saves historical reads while current state and tags still require the network',async t=>{
 const f=await fixture(t);let h=await f.start();
 for(let i=0;i<30;i++){
  await f.call('eth_getBlockByNumber',['0x7',false]);
  await f.call('eth_getCode',[address(i+1),{blockHash:f.header('0x7').hash,requireCanonical:true}]);
  await f.call('eth_getTransactionReceipt',[hash(i+1)]);
 }
 const cold=f.state.calls.length;await h.close();f.state.calls.length=0;h=await f.start();
 for(let i=0;i<30;i++){
  await f.call('eth_getBlockByNumber',['0x7',false]);
  await f.call('eth_getCode',[address(i+1),{blockHash:f.header('0x7').hash,requireCanonical:true}]);
  await f.call('eth_getTransactionReceipt',[hash(i+1)]);
 }
 const warm=f.state.calls.length;assert.equal(warm,4);assert.ok(cold>=64);assert.equal(f.count('eth_getCode'),0);assert.equal(f.count('eth_getTransactionReceipt'),0);
 for(const [method,params]of [['eth_getBlockByNumber',['latest',false]],['eth_getBlockByNumber',['finalized',false]],['eth_getBlockByNumber',['0x21',false]],['eth_getBalance',[address(1),'0x7']],['eth_getTransactionCount',[address(1),'pending']]]){
  const before=f.state.calls.length;await f.call(method,params);await f.call(method,params);assert.equal(f.state.calls.length-before,2,method);
 }
 t.diagnostic(JSON.stringify({profile:'HOST_RESTART_RPC_COMPARISON_V16',historicalQueries:90,coldNetworkReads:cold,restartNetworkReads:warm,financialTransactions:0}));
});
test('large public verifier code stays bounded and survives reopening without history eviction',async t=>{
 const f=await fixture(t),code='0x'+'6001600055'.repeat(16000),wire=async(method,params,signal)=>method==='eth_getCode'?code:f.invoke(method,params,signal);
 let handle=await f.start();await f.call('eth_getBlockByNumber',['0x7',false]);
 // The uncompressed responses exceed the 64 MiB history budget. Compression
 // preserves its existing disk limit, original exact block and fresh anchor.
 for(let i=0;i<450;i++)assert.equal(await read(endpoint,'eth_getCode',[address(i+1000),{blockHash:f.header('0x7').hash,requireCanonical:true}],undefined,wire),code);
 const before=metrics();assert.equal(before.finalizedReadCacheEvictions,0);assert.ok(before.finalizedReadCacheBytes<4*1024*1024);await handle.close();handle=await f.start();
 const forbidden=async(method,params,signal)=>{assert.notEqual(method,'eth_getCode','the retained finalized bytecode must not hit the network');return f.invoke(method,params,signal);};
 for(let i=0;i<450;i++)assert.equal(await read(endpoint,'eth_getCode',[address(i+1000),{blockHash:f.header('0x7').hash,requireCanonical:true}],undefined,forbidden),code);
 assert.ok(metrics().finalizedReadCacheHits>=450);
 t.diagnostic(JSON.stringify({profile:'HOST_COMPRESSED_HISTORY_V20',contracts:450,rawBytes:450*Buffer.byteLength(JSON.stringify(code)),storedBytes:before.finalizedReadCacheBytes,evictions:before.finalizedReadCacheEvictions,financialTransactions:0}));
});
test('old uncompressed rows are compacted after fresh anchor verification; compressed bombs are discarded',async t=>{
 const f=await fixture(t),code='0x'+'6001600055'.repeat(10000),params=[address(777),{blockHash:f.header('0x7').hash,requireCanonical:true}];let handle=await f.start();
 await f.call('eth_getBlockByNumber',['0x7',false]);await read(endpoint,'eth_getCode',params,undefined,async method=>{assert.equal(method,'eth_getCode');return code;});await handle.close();
 const rewrite=value=>{
  const db=new DatabaseSync(join(f.directory,'historical-rpc.sqlite')),row=db.prepare("SELECT * FROM entries WHERE method='eth_getCode'").get();
  const checksum=createHash('sha256').update(JSON.stringify(['LIANUM_PUBLIC_FINALIZED_READ_CACHE_V16',row.key,row.method,row.params,value,row.block_number,row.block_hash])).digest('hex');
  db.prepare('UPDATE entries SET value=?,checksum=?,bytes=? WHERE key=?').run(value,checksum,Buffer.byteLength(value)+Buffer.byteLength(row.params)+256,row.key);db.close();
 };
 rewrite(JSON.stringify(code));const before=f.count('eth_getCode');handle=await f.start();assert.equal(metrics().finalizedReadCacheCompressedRows,1);assert.ok(metrics().finalizedReadCacheSavedBytes>50000);assert.equal(await f.call('eth_getCode',params),code);assert.equal(f.count('eth_getCode'),before);await handle.close();
 rewrite('z20:'+deflateSync(Buffer.from('"'+'b'.repeat(1024*1024+1)+'"')).toString('base64'));handle=await f.start();assert.equal(await f.call('eth_getCode',params),'0x6000');assert.equal(metrics().finalizedReadCacheInvalidRows,1);assert.equal(f.count('eth_getCode'),before+1);
});
test('a changed finalized anchor invalidates earlier results across restarts',async t=>{
 const f=await fixture(t);let h=await f.start();await f.call('eth_getBlockByNumber',['0x7',false]);
 const q=()=>f.call('eth_getCode',[address(1),{blockHash:f.header('0x7').hash,requireCanonical:true}]);assert.equal(await q(),'0x6000');await h.close();
 f.state.fork=1;h=await f.start();assert.equal(metrics().finalizedReadCacheInvalidations,1);await f.call('eth_getBlockByNumber',['0x7',false]);assert.equal(await q(),'0x6001');assert.equal(f.count('eth_getCode'),2);
});
test('periodic revalidation detects an anchor change during one long startup',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1000000});
 const f=await fixture(t);await f.start();await f.call('eth_getBlockByNumber',['0x7',false]);
 f.state.fork=1;t.mock.timers.tick(31000);
 assert.equal((await f.call('eth_getBlockByNumber',['0x7',false])).hash,f.header('0x7').hash);assert.equal(metrics().finalizedReadCacheInvalidations,1);
});
test('unsupported finality never permits reuse, and a wrong network rejects before a historical answer',async t=>{
 const f=await fixture(t);f.state.finalized=false;const h=await f.start();
 await f.call('eth_getBlockByNumber',['0x7',false]);await f.call('eth_getBlockByNumber',['0x7',false]);assert.equal(f.state.calls.filter(r=>r.params[0]==='0x7').length,2);assert.equal(metrics().finalizedReadCacheHits,0);
 await h.close();f.state.finalized=true;f.state.chainId='0x1';await assert.rejects(f.start(),{code:'NATIVE_WALLET_RPC_HISTORY_CACHE_CHAIN_MISMATCH'});
});
test('a corrupted cached row is discarded and refetched, and untrusted paths are rejected',async t=>{
 const f=await fixture(t);let h=await f.start();await f.call('eth_getBlockByNumber',['0x7',false]);await f.call('eth_getTransactionReceipt',[hash(7)]);await h.close();
 const db=new DatabaseSync(join(f.directory,'historical-rpc.sqlite'));db.prepare("UPDATE entries SET checksum='BROKEN' WHERE method='eth_getTransactionReceipt'").run();db.close();
 f.state.calls.length=0;h=await f.start();await f.call('eth_getTransactionReceipt',[hash(7)]);assert.equal(f.count('eth_getTransactionReceipt'),1);assert.equal(metrics().finalizedReadCacheInvalidRows,1);await h.close();
 await symlink(f.directory,join(f.base,'alias'));await assert.rejects(open({directory:join(f.base,'alias')}),/PRIVATE_DIRECTORY/);
 await writeFile(join(f.base,'public-file'),'HOST');await assert.rejects(open({directory:join(f.base,'public-file')}),/PRIVATE_DIRECTORY/);
});
test('cancelled reads, unmined receipts and oversized replies cannot become restart evidence',async t=>{
 const f=await fixture(t);await f.start();await f.call('eth_getBlockByNumber',['0x7',false]);
 const code=[address(8),{blockHash:f.header('0x7').hash,requireCanonical:true}];
 const abort=new AbortController();abort.abort();const before=f.state.calls.length;
 await assert.rejects(read(endpoint,'eth_getCode',code,abort.signal,f.invoke),{code:'NATIVE_WALLET_CANCELLED'});assert.equal(f.state.calls.length,before);
 let large=0,missing=0;
 const invoke=async(method,params,signal)=>{if(method==='eth_getCode'){large++;return '0x'+'ff'.repeat(600000);}if(method==='eth_getTransactionReceipt'){missing++;return null;}return f.invoke(method,params,signal);};
 await read(endpoint,'eth_getCode',code,undefined,invoke);await read(endpoint,'eth_getCode',code,undefined,invoke);assert.equal(large,2);
 await read(endpoint,'eth_getTransactionReceipt',[hash(70)],undefined,invoke);await read(endpoint,'eth_getTransactionReceipt',[hash(70)],undefined,invoke);assert.equal(missing,2);
 assert.equal(metrics().finalizedReadCacheRows,1);
});
test('a damaged public cache is quarantined and rebuilt without touching wallet data',async t=>{
 const f=await fixture(t);let h=await f.start();await h.close();
 const wallet=join(f.base,'wallet-do-not-touch');await writeFile(wallet,'HOST_PRIVATE_STATE');
 await writeFile(join(f.directory,'historical-rpc.sqlite'),'HOST_TORN_DATABASE');
 h=await f.start();assert.equal(metrics().finalizedReadCacheRepairs,1);assert.equal((await f.call('eth_getBlockByNumber',['0x7',false])).hash,f.header('0x7').hash);
 const {readFile}=await import('node:fs/promises');assert.equal(await readFile(wallet,'utf8'),'HOST_PRIVATE_STATE');assert.equal(await readFile(join(f.directory,'historical-rpc.sqlite.corrupt'),'utf8'),'HOST_TORN_DATABASE');
});

test('SIGKILL after committed reads preserves them for a different process',async t=>{
 const base=await mkdtemp(join(tmpdir(),'lianum-cache-crash-v16-'));t.after(()=>rm(base,{recursive:true,force:true}));
 const module=new URL('../../src/native-wallet/public-finalized-read-cache-v16.mjs',import.meta.url).href,routeModule=new URL('../../src/native-wallet/public-testnet-rpc-route-v1.mjs',import.meta.url).href;
 const script=`import {DatabaseSync} from 'node:sqlite';import {openPublicFinalizedReadCacheV16 as open,readPublicFinalizedCachedV16 as read} from ${JSON.stringify(module)};
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from ${JSON.stringify(routeModule)};
const hash=n=>'0x'+n.toString(16).padStart(64,'0');let wire=0,stateReads=0;
const invoke=async(m,p)=>{wire++;if(m==='eth_chainId')return '0x'+BigInt(route.chainId).toString(16);if(m==='eth_getBlockByNumber'){const number=p[0]==='finalized'?'0x20':p[0];return{number,hash:number==='0x0'?route.genesis:hash(Number(BigInt(number))+1000)};}stateReads++;return '0x6000';};
const h=await open({directory:process.argv[1]});await h.prime(invoke);
await read(route.effectiveEndpoint,'eth_getBlockByNumber',['0x7',false],undefined,invoke);
for(let i=1;i<=20;i++)await read(route.effectiveEndpoint,'eth_getCode',['0x'+i.toString(16).padStart(40,'0'),{blockHash:hash(1007),requireCanonical:true}],undefined,invoke);
if(process.argv[2]==='FILL'){const interrupted=new DatabaseSync(process.argv[1]+'/historical-rpc.sqlite');interrupted.exec('BEGIN IMMEDIATE; DELETE FROM entries;');console.log(JSON.stringify({committed:true,uncommittedDeletion:true,wire,stateReads}));setInterval(()=>{},1000);}else{await h.close();console.log(JSON.stringify({wire,stateReads}));}`;
 const run=(mode,kill)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','-e',script,join(base,'cache'),mode],{stdio:['ignore','pipe','pipe']}),timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('HOST_CHILD_TIMEOUT'));},10000);let stdout='',stderr='',killed=false;
  t.after(()=>{if(child.exitCode===null&&!child.killed)child.kill('SIGKILL');});
  child.stdout.on('data',chunk=>{stdout+=chunk;if(kill&&stdout.includes('\n')&&!killed){killed=true;child.kill('SIGKILL');}});child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',reject);
  child.on('exit',(code,signal)=>{clearTimeout(timer);try{assert.ok(kill?signal==='SIGKILL':code===0,stderr);resolve(JSON.parse(stdout.trim()));}catch(error){reject(error);}});
 });
 const first=await run('FILL',true),second=await run('REPLAY',false);assert.equal(first.stateReads,20);assert.equal(second.stateReads,0);assert.equal(second.wire,4);
 t.diagnostic(JSON.stringify({profile:'HOST_PROCESS_KILL_REPLAY_V16',beforeKillNetworkReads:first.wire,afterRestartNetworkReads:second.wire,committedStateReadsRecovered:20,realChain:false}));
});
