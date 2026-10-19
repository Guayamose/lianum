/** Restartable PUBLIC historical RPC data, enabled explicitly during read-only
 * startup. No cached balances, nonces, moving tags, permissions or sends.
 * Every session freshly verifies chain/genesis/finality and its saved anchor.
 * SQLite FULL commits survive an interrupted process; no wallet state lives here.
 * Finality: https://ethereum.org/developers/docs/apis/json-rpc/
 * Hash-pinned state: https://eips.ethereum.org/EIPS/eip-1898 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,lstat,realpath,chmod,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {deflateSync,inflateSync} from 'node:zlib';
import {need,signalCurrent} from './common-v1.mjs';
import {PUBLIC_SEPOLIA_RPC_ROUTE_V1 as route} from './public-testnet-rpc-route-v1.mjs';

const PROFILE='LIANUM_PUBLIC_FINALIZED_READ_CACHE_V16',APPLICATION=0x4c524310;
const MAX_VALUE=1024*1024,MAX_BYTES=64*1024*1024,MAX_ROWS=8192,REFRESH_MS=30000;
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scope=sha([PROFILE,route.effectiveEndpoint,route.chainId,route.genesis]);
const quantity=value=>typeof value==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(value);
const blockHash=value=>typeof value==='string'&&/^0x[0-9a-f]{64}$/.test(value);
const reads=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getBalance','eth_getCode','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs','eth_call','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
const freshMetrics=()=>({finalizedReadCacheRequests:0,finalizedReadCacheHits:0,finalizedReadCacheWrites:0,finalizedReadCacheInvalidRows:0,finalizedReadCacheInvalidations:0,finalizedReadCacheEvictions:0,finalizedReadCacheRefreshes:0,finalizedReadCacheFallbacks:0,finalizedReadCacheRepairs:0,finalizedReadCacheRows:0,finalizedReadCacheBytes:0,finalizedReadCacheCompressedRows:0,finalizedReadCacheSavedBytes:0,finalizedImmutableCodeHitsV25:0});
let active=null,last=freshMetrics();
export function readPublicFinalizedCacheMetricsV16(){return Object.freeze({...last,...(active?.metrics??{})});}

function header(value,number){return value&&quantity(value.number)&&blockHash(value.hash)&&(number===undefined||value.number===number);}
function keyFor(method,params){return sha([scope,method,params]);}
function rowChecksum(row){return sha([PROFILE,row.key,row.method,row.params,row.value,row.block_number,row.block_hash]);}
// Keep the existing public SQLite schema and old JSON rows readable. Large
// repeated verifier bytecode must not evict the history needed on reopening.
function encodeValueV20(json){
 if(Buffer.byteLength(json)<2048)return json;
 const encoded='z20:'+deflateSync(Buffer.from(json),{level:1}).toString('base64');
 return Buffer.byteLength(encoded)<Buffer.byteLength(json)*.8?encoded:json;
}
function decodeValueV20(value){
 if(!value.startsWith('z20:'))return JSON.parse(value);
 const encoded=value.slice(4);assert.match(encoded,/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
 return JSON.parse(inflateSync(Buffer.from(encoded,'base64'),{maxOutputLength:MAX_VALUE}).toString('utf8'));
}
async function privateFile(path){
 try{const st=await lstat(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.uid===process.getuid()&&(st.mode&0o777)===0o600&&st.size<=100*1024*1024,'RPC_HISTORY_CACHE_PRIVATE_FILE');return true;}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}
function deleteRow(state,row){state.db.prepare('DELETE FROM entries WHERE key=?').run(row.key);state.metrics.finalizedReadCacheInvalidRows++;}
function decode(state,row,method,params){
 if(!row)return null;
 try{
  assert.equal(row.key,keyFor(method,params));assert.equal(row.method,method);assert.equal(row.params,JSON.stringify(params));
  assert.ok(row.value.length<=MAX_VALUE&&quantity(row.block_number)&&blockHash(row.block_hash));
  assert.equal(row.checksum,rowChecksum(row));assert.ok(BigInt(row.block_number)<=BigInt(state.anchor.number));
  return decodeValueV20(row.value);
 }catch{deleteRow(state,row);return null;}
}
function get(state,method,params){
 const row=state.db.prepare('SELECT * FROM entries WHERE key=?').get(keyFor(method,params));
 const value=decode(state,row,method,params);if(value===null)return null;
 // LRU bookkeeping is approximate; repeated hits must not each force a FULL
 // SQLite disk commit. Financial records are not stored in this database.
 if(Date.now()-row.touched>=REFRESH_MS)state.db.prepare('UPDATE entries SET touched=? WHERE key=?').run(Date.now(),row.key);
 state.metrics.finalizedReadCacheHits++;return value;
}
function tally(state){const row=state.db.prepare('SELECT count(*) AS rows,coalesce(sum(bytes),0) AS bytes FROM entries').get();state.metrics.finalizedReadCacheRows=row.rows;state.metrics.finalizedReadCacheBytes=row.bytes;}
function compactLegacyValuesV20(state){
 if(state.compactedV20)return;const before={...state.metrics};state.db.exec('BEGIN IMMEDIATE');
 try{
  for(const row of state.db.prepare("SELECT * FROM entries WHERE value NOT LIKE 'z20:%'").all()){
   let params;try{params=JSON.parse(row.params);}catch{deleteRow(state,row);continue;}
   if(decode(state,row,row.method,params)===null)continue;
   const packed=encodeValueV20(row.value);if(packed===row.value)continue;
   const next={...row,value:packed},bytes=Buffer.byteLength(packed)+Buffer.byteLength(row.params)+256;
   state.db.prepare('UPDATE entries SET value=?,checksum=?,bytes=? WHERE key=?').run(packed,rowChecksum(next),bytes,row.key);
   state.metrics.finalizedReadCacheCompressedRows++;state.metrics.finalizedReadCacheSavedBytes+=Buffer.byteLength(row.value)-Buffer.byteLength(packed);
  }
  state.db.exec('COMMIT');state.compactedV20=true;tally(state);
 }catch(error){state.db.exec('ROLLBACK');state.metrics=before;if(error.code!=='ERR_SQLITE_ERROR')throw error;state.metrics.finalizedReadCacheFallbacks++;}
}
function put(state,method,params,value,number,hash){
 if(state.closed||!state.ready||BigInt(number)>BigInt(state.anchor.number))return;
 const json=JSON.stringify(value);if(typeof json!=='string'||json.length>MAX_VALUE)return;
 const row={key:keyFor(method,params),method,params:JSON.stringify(params),value:encodeValueV20(json),block_number:number,block_hash:hash};
 const bytes=Buffer.byteLength(row.value)+Buffer.byteLength(row.params)+256;if(bytes>MAX_VALUE)return;
 // Evict before insertion, preserving the disk and memory bounds even on a
 // long cold run. Cache storage failure only loses an optimization.
 try{
  tally(state);
  while(state.metrics.finalizedReadCacheRows>=MAX_ROWS||state.metrics.finalizedReadCacheBytes+bytes>MAX_BYTES){
   const oldest=state.db.prepare('SELECT key FROM entries ORDER BY touched,key LIMIT 1').get();if(!oldest)break;
   state.db.prepare('DELETE FROM entries WHERE key=?').run(oldest.key);state.metrics.finalizedReadCacheEvictions++;tally(state);
  }
  state.db.prepare('INSERT OR REPLACE INTO entries(key,method,params,value,block_number,block_hash,checksum,bytes,touched) VALUES(?,?,?,?,?,?,?,?,?)').run(row.key,row.method,row.params,row.value,number,hash,rowChecksum(row),bytes,Date.now());
  state.metrics.finalizedReadCacheWrites++;tally(state);
 }catch(error){if(!['ERR_SQLITE_ERROR'].includes(error.code))throw error;state.metrics.finalizedReadCacheFallbacks++;}
}
function discard(state){state.db.exec('DELETE FROM entries; DELETE FROM metadata;');state.metrics.finalizedReadCacheInvalidations++;tally(state);}
async function ensure(state,invoke){
 if(state.closed)return false;
 if(state.checkedAt!==null&&Date.now()-state.checkedAt<REFRESH_MS)return state.ready;
 if(state.refresh)return state.refresh;
 state.refresh=(async()=>{
  state.validating=true;
  try{
   const signal=state.control.signal;
   const [chain,genesis,finalized]=await Promise.all([invoke('eth_chainId',[],signal),invoke('eth_getBlockByNumber',['0x0',false],signal),invoke('eth_getBlockByNumber',['finalized',false],signal)]);
   signalCurrent(signal);need(quantity(chain)&&BigInt(chain)===BigInt(route.chainId)&&header(genesis,'0x0')&&genesis.hash===route.genesis,'RPC_HISTORY_CACHE_CHAIN_MISMATCH');
   state.metrics.finalizedReadCacheRefreshes++;
   if(!header(finalized)){state.ready=false;state.checkedAt=Date.now();state.metrics.finalizedReadCacheFallbacks++;return false;}
   let saved=null;const row=state.db.prepare('SELECT value FROM metadata WHERE key=?').get('anchor');
   if(row)try{saved=JSON.parse(row.value);assert.equal(saved.scope,scope);assert.ok(header(saved));}catch{discard(state);saved=null;}
   if(saved){
    // Revalidate the old finalized anchor with a fresh numbered observation;
    // a changed anchor or lagging provider invalidates ALL historical reuse.
    const observed=await invoke('eth_getBlockByNumber',[saved.number,false],signal);signalCurrent(signal);
    if(!header(observed,saved.number)||observed.hash!==saved.hash||BigInt(finalized.number)<BigInt(saved.number))discard(state);
   }
   state.anchor={scope,number:finalized.number,hash:finalized.hash};
   state.db.prepare('INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)').run('anchor',JSON.stringify(state.anchor));
   state.ready=true;state.checkedAt=Date.now();return true;
  }finally{state.validating=false;state.refresh=null;}
 })();return state.refresh;
}
function knownHeader(state,hash){
 const row=state.db.prepare("SELECT * FROM entries WHERE method='eth_getBlockByNumber' AND block_hash=? LIMIT 1").get(hash);
 if(!row)return null;
 const value=decode(state,row,'eth_getBlockByNumber',[row.block_number,false]);
 return header(value,row.block_number)&&value.hash===hash?value:null;
}
// EIP-6780 preserves existing contract bytecode after Cancun; EIP-7702
// permits changing only empty/delegated account code. Reuse ONLY nonempty,
// nondelegated code observed after Sepolia Cancun, at an older finalized block.
// Storage, proxy implementation slots, calls and current balances stay separate.
// https://eips.ethereum.org/EIPS/eip-6780
// https://eips.ethereum.org/EIPS/eip-7702
// https://github.com/eth-clients/sepolia (Cancun time 1706655072)
const SEPOLIA_CANCUN_V25=1706655072n;
function immutableCodeV25(state,params,target){
 if(params.length!==2||!/^0x[0-9a-f]{40}$/.test(params[0])||!quantity(target.timestamp)||BigInt(target.timestamp)<SEPOLIA_CANCUN_V25)return null;
 // Both address and prefix are fixed validated public data; inspect a bounded
 // set of existing entries and retain their original checksum/block bindings.
 const prefix=JSON.stringify([params[0]]).slice(0,-1)+',',rows=state.db.prepare("SELECT * FROM entries WHERE method='eth_getCode' AND params LIKE ? ORDER BY touched DESC LIMIT 8").all(prefix+'%');
 for(const row of rows){
  if(!quantity(row.block_number)||BigInt(row.block_number)>BigInt(target.number))continue;
  let prior;try{prior=JSON.parse(row.params);}catch{deleteRow(state,row);continue;}
  if(!Array.isArray(prior)||prior.length!==2||prior[0]!==params[0]||prior[1]?.blockHash!==row.block_hash||prior[1]?.requireCanonical!==true)continue;
  const value=decode(state,row,'eth_getCode',prior),head=knownHeader(state,row.block_hash);
  if(typeof value!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(value)||value.startsWith('0xef0100')||!head||!quantity(head.timestamp)||BigInt(head.timestamp)<SEPOLIA_CANCUN_V25||BigInt(head.timestamp)>BigInt(target.timestamp))continue;
  state.metrics.finalizedImmutableCodeHitsV25++;return value;
 }
 return null;
}
async function read(state,method,params,signal,invoke){
 signalCurrent(signal);state.metrics.finalizedReadCacheRequests++;
 const numbered=method==='eth_getBlockByNumber'&&params.length===2&&quantity(params[0])&&params[1]===false;
 const byHash=method==='eth_getBlockByHash'&&params.length===2&&blockHash(params[0])&&params[1]===false;
 const transaction=(method==='eth_getTransactionReceipt'||method==='eth_getTransactionByHash')&&params.length===1&&blockHash(params[0]);
 const pinned=params.at(-1),fixed=['eth_getCode','eth_getStorageAt','eth_call'].includes(method)&&pinned&&Object.getPrototypeOf(pinned)===Object.prototype&&pinned.requireCanonical===true&&blockHash(pinned.blockHash)&&Object.keys(pinned).sort().join(',')==='blockHash,requireCanonical';
 if(!numbered&&!byHash&&!transaction&&!fixed)return invoke(method,params,signal);
 if(!await ensure(state,invoke))return invoke(method,params,signal);signalCurrent(signal);
 if(state.closed)return invoke(method,params,signal);
 if(numbered&&BigInt(params[0])>BigInt(state.anchor.number))return invoke(method,params,signal);
 let canonical=fixed?knownHeader(state,pinned.blockHash):null;
 if(fixed&&!canonical)return invoke(method,params,signal);
 const cached=get(state,method,params);if(cached!==null){signalCurrent(signal);return cached;}
 if(method==='eth_getCode'&&canonical){const code=immutableCodeV25(state,params,canonical);if(code!==null){signalCurrent(signal);return code;}}
 const value=await invoke(method,params,signal);signalCurrent(signal);if(state.closed)return value;
 if(numbered&&header(value,params[0]))put(state,method,params,value,value.number,value.hash);
 else if(byHash&&header(value)&&value.hash===params[0]||transaction&&value&&quantity(value.blockNumber)&&blockHash(value.blockHash)&&(method==='eth_getTransactionReceipt'?value.transactionHash:value.hash)===params[0]){
  const number=byHash?value.number:value.blockNumber,hash=byHash?value.hash:value.blockHash;
  if(BigInt(number)<=BigInt(state.anchor.number)){
   canonical=await read(state,'eth_getBlockByNumber',[number,false],signal,invoke);signalCurrent(signal);
   if(canonical?.hash===hash)put(state,method,params,value,number,hash);
  }
 }else if(fixed&&typeof value==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(value)&&(method!=='eth_getStorageAt'||value.length===66))put(state,method,params,value,canonical.number,canonical.hash);
 return value;
}

export async function readPublicFinalizedCachedV16(endpoint,method,params,signal,invoke){
 const state=active;if(!state||endpoint!==route.effectiveEndpoint)return invoke(method,params,signal);
 need(reads.has(method),'RPC_STARTUP_READ_ONLY');
 if(state.validating)return invoke(method,params,signal);
 return read(state,method,JSON.parse(JSON.stringify(params)),signal,invoke);
}
export function openPublicFinalizedReadCacheV16({directory}){return openCache(directory,false);}
async function openCache(directory,recovered){
 assert.equal(active,null,'RPC_HISTORY_CACHE_ALREADY_OPEN');assert.equal(resolve(directory),directory);
 try{await mkdir(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
 const st=await lstat(directory);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(st.mode&0o777)===0o700&&await realpath(directory)===directory,'RPC_HISTORY_CACHE_PRIVATE_DIRECTORY');
 const path=join(directory,'historical-rpc.sqlite'),existing=await privateFile(path);
 for(const suffix of ['-wal','-shm'])await privateFile(path+suffix);
 let db;
 try{
  db=new DatabaseSync(path,{enableForeignKeyConstraints:true,enableDoubleQuotedStringLiterals:false});
  await chmod(path,0o600);
  if(existing){const application=db.prepare('PRAGMA application_id').get().application_id;assert.ok(application===APPLICATION||application===0&&db.prepare('SELECT count(*) AS n FROM sqlite_master').get().n===0,'RPC_HISTORY_CACHE_DATABASE_KIND');}
  db.exec(`PRAGMA application_id=${APPLICATION}; PRAGMA auto_vacuum=INCREMENTAL; PRAGMA max_page_count=24576; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=128; PRAGMA journal_size_limit=1048576; PRAGMA cache_size=-4096; PRAGMA busy_timeout=1000;`);
  for(const suffix of ['-wal','-shm']){try{await chmod(path+suffix,0o600);}catch(error){if(error.code!=='ENOENT')throw error;}await privateFile(path+suffix);}
  db.exec('CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entries(key TEXT PRIMARY KEY,method TEXT NOT NULL,params TEXT NOT NULL,value TEXT NOT NULL,block_number TEXT NOT NULL,block_hash TEXT NOT NULL,checksum TEXT NOT NULL,bytes INTEGER NOT NULL,touched INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS entries_lru ON entries(touched,key); CREATE INDEX IF NOT EXISTS entries_hash ON entries(method,block_hash);');
  assert.equal(db.prepare('PRAGMA quick_check(1)').get().quick_check,'ok','RPC_HISTORY_CACHE_DATABASE_CORRUPT');
  const state={db,metrics:freshMetrics(),anchor:null,ready:false,closed:false,checkedAt:null,validating:false,refresh:null,control:new AbortController()};tally(state);active=state;
  return Object.freeze({
   async prime(invoke,signal){signalCurrent(signal);assert.strictEqual(active,state);const ready=await ensure(state,invoke);signalCurrent(signal);if(ready)compactLegacyValuesV20(state);return Object.freeze({stage:'PUBLIC_HISTORY_CACHE_VALIDATED',persistent:true,finalityAvailable:ready,...state.metrics});},
   async close(){if(state.closed)return;state.closed=true;state.control.abort();if(active===state)active=null;try{await state.refresh;}catch{}last={...state.metrics};try{db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum(256);');}finally{db.close();}},
  });
 }catch(error){
  db?.close();
  const corrupt=[11,26].includes(error.errcode)||/RPC_HISTORY_CACHE_DATABASE_(?:KIND|CORRUPT)/.test(error.message??'');
  if(!recovered&&corrupt){
   // This directory contains PUBLIC optimization data only. Preserve one
   // bounded bad copy and rebuild it once; never touch any wallet directory.
   for(const suffix of ['','-wal','-shm'])if(await privateFile(path+suffix)){
    if(await privateFile(path+suffix+'.corrupt'))await unlink(path+suffix+'.corrupt');
    await rename(path+suffix,path+suffix+'.corrupt');
   }
   const handle=await openCache(directory,true);active.metrics.finalizedReadCacheRepairs++;return handle;
  }
  throw error;
 }
}
