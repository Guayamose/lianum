/** Read-only corroboration of compiled code at the same canonical Sepolia head.
 * No alternate sender, financial runtime, signer or send is exposed. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nativeRpcV1,withPublicCanonicalBlockReadsV25} from '../../native-wallet/http-v1.mjs';
import {readOriginalPagedSepoliaRpcContextV4} from './sepolia-receiver-rpc-v4.mjs';

const FALLBACK='https://gateway.tenderly.co/public/sepolia';
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const NETWORK_ERRORS=new Set(['NATIVE_WALLET_HTTP_FAILED','NATIVE_WALLET_HTTP_TIMEOUT','NATIVE_WALLET_HTTP_STATUS']);
// Completed PUBLIC code checks at an exact block are immutable data. Each
// invocation still checks the real runtime and canonical block before/after.
// No current balance, policy, nonce, storage, permission or send is cached.
const checkedViewsV20=new WeakMap(),MAX_VIEWS_V20=16;
const codeKeyV20=row=>createHash('sha256').update(row.address).update('\0').update(row.expectedCode).digest('hex');
export async function assertOriginalPagedSepoliaCodeSetV6(runtime,rows,head){
 assert.equal(arguments.length,3);const {endpoint}=readOriginalPagedSepoliaRpcContextV4(runtime);
 const prior=checkedViewsV20.get(runtime)?.get(head?.number+':'+head?.hash);
 if(prior&&Array.isArray(rows)&&rows.every(row=>prior.has(codeKeyV20(row))))return checkCodeSet(runtime,rows,head);
 return withPublicCanonicalBlockReadsV25(endpoint,head,()=>checkCodeSet(runtime,rows,head));
}
async function checkCodeSet(runtime,rows,head){
 readOriginalPagedSepoliaRpcContextV4(runtime);
 assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=256);
 assert.match(head.number,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);assert.match(head.hash,/^0x[0-9a-f]{64}$/);
 for(const row of rows){assert.match(row.address,/^0x[0-9a-f]{40}$/);assert.match(row.expectedCode,/^0x(?:[0-9a-f]{2})+$/);}
 await runtime.assertCanonical(head);
 let views=checkedViewsV20.get(runtime);if(!views){views=new Map();checkedViewsV20.set(runtime,views);}
 const viewKey=head.number+':'+head.hash,prior=views.get(viewKey)??new Set(),keys=rows.map(codeKeyV20),missing=rows.filter((_,index)=>!prior.has(keys[index]));
 if(missing.length===0){await runtime.assertCanonical(head);readOriginalPagedSepoliaRpcContextV4(runtime);return;}
 let cursor=0,fallback;
 async function secondary(){
  fallback??=(async()=>{
   readOriginalPagedSepoliaRpcContextV4(runtime);const rpc=nativeRpcV1(FALLBACK);
   const [chain,genesis,block]=await Promise.all([rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['0x0',false]),rpc('eth_getBlockByNumber',[head.number,false])]);
   assert.equal(chain,'0xaa36a7','SEPOLIA_CODE_FALLBACK_CHAIN');assert.equal(genesis?.hash,GENESIS,'SEPOLIA_CODE_FALLBACK_GENESIS');
   assert.equal(block?.number,head.number,'SEPOLIA_CODE_FALLBACK_CANONICAL');assert.equal(block?.hash,head.hash,'SEPOLIA_CODE_FALLBACK_CANONICAL');
   readOriginalPagedSepoliaRpcContextV4(runtime);return rpc;
  })();return fallback;
 }
 // Drain every started read before rejecting. A large parent never opens a
 // separate connection for every contract at once.
 const workers=await Promise.allSettled(Array.from({length:Math.min(8,missing.length)},async()=>{
  for(;;){const index=cursor++;if(index>=missing.length)return;const row=missing[index];let code;
   try{code=await runtime.code(row.address,head.number);}catch(error){
    if(!NETWORK_ERRORS.has(error?.code)||error.code==='NATIVE_WALLET_HTTP_STATUS'&&![408,429,500,502,503,504].includes(error.httpStatus))throw error;
    const rpc=await secondary();code=await rpc('eth_getCode',[row.address,head.number]);
   }
   readOriginalPagedSepoliaRpcContextV4(runtime);assert.equal(code,row.expectedCode,'SEPOLIA_COMPILED_CODE_CHANGED');
  }
 }));
 const failed=workers.find(row=>row.status==='rejected');if(failed){views.delete(viewKey);throw failed.reason;}
 if(fallback){const rpc=await fallback,block=await rpc('eth_getBlockByNumber',[head.number,false]);assert.equal(block?.number,head.number,'SEPOLIA_CODE_FALLBACK_CANONICAL');assert.equal(block?.hash,head.hash,'SEPOLIA_CODE_FALLBACK_CANONICAL');}
 await runtime.assertCanonical(head);readOriginalPagedSepoliaRpcContextV4(runtime);
 // Publish only a complete successful observation. Bound each retained view,
 // including overlapping caller sets, rather than retaining large bytecode.
 const checked=new Set([...(views.get(viewKey)??prior),...keys]);
 while(checked.size>256)checked.delete(checked.values().next().value);
 views.delete(viewKey);views.set(viewKey,checked);
 while(views.size>MAX_VIEWS_V20)views.delete(views.keys().next().value);
}
