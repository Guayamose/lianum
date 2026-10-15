/** Read-only corroboration of compiled code at the same canonical Sepolia head.
 * No alternate sender, financial runtime, signer or send is exposed. */
import assert from 'node:assert/strict';
import {nativeRpcV1} from '../../native-wallet/http-v1.mjs';
import {readOriginalPagedSepoliaRpcContextV4} from './sepolia-receiver-rpc-v4.mjs';

const FALLBACK='https://gateway.tenderly.co/public/sepolia';
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const NETWORK_ERRORS=new Set(['NATIVE_WALLET_HTTP_FAILED','NATIVE_WALLET_HTTP_TIMEOUT','NATIVE_WALLET_HTTP_STATUS']);
export async function assertOriginalPagedSepoliaCodeSetV6(runtime,rows,head){
 assert.equal(arguments.length,3);readOriginalPagedSepoliaRpcContextV4(runtime);
 assert.ok(Array.isArray(rows)&&rows.length>0&&rows.length<=256);
 assert.match(head.number,/^0x(?:0|[1-9a-f][0-9a-f]*)$/);assert.match(head.hash,/^0x[0-9a-f]{64}$/);
 for(const row of rows){assert.match(row.address,/^0x[0-9a-f]{40}$/);assert.match(row.expectedCode,/^0x(?:[0-9a-f]{2})+$/);}
 await runtime.assertCanonical(head);
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
 const workers=await Promise.allSettled(Array.from({length:Math.min(8,rows.length)},async()=>{
  for(;;){const index=cursor++;if(index>=rows.length)return;const row=rows[index];let code;
   try{code=await runtime.code(row.address,head.number);}catch(error){
    if(!NETWORK_ERRORS.has(error?.code)||error.code==='NATIVE_WALLET_HTTP_STATUS'&&![408,429,500,502,503,504].includes(error.httpStatus))throw error;
    const rpc=await secondary();code=await rpc('eth_getCode',[row.address,head.number]);
   }
   readOriginalPagedSepoliaRpcContextV4(runtime);assert.equal(code,row.expectedCode,'SEPOLIA_COMPILED_CODE_CHANGED');
  }
 }));
 const failed=workers.find(row=>row.status==='rejected');if(failed)throw failed.reason;
 if(fallback){const rpc=await fallback,block=await rpc('eth_getBlockByNumber',[head.number,false]);assert.equal(block?.number,head.number,'SEPOLIA_CODE_FALLBACK_CANONICAL');assert.equal(block?.hash,head.hash,'SEPOLIA_CODE_FALLBACK_CANONICAL');}
 await runtime.assertCanonical(head);readOriginalPagedSepoliaRpcContextV4(runtime);
}
