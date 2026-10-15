import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {publicProviderAccountFromKeyV1} from '@lianum/crypto/native-provider-crypto-v1';
import {createOriginalPagedSepoliaRpcV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {estimateOriginalPagedSepoliaCreateGasV6} from '../../../src/chains/public-testnet/sepolia-deployment-gas-v6.mjs';

const genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const head={number:'0x100',hash:'0x'+'44'.repeat(32),parentHash:'0x'+'33'.repeat(32),timestamp:'0x6ac00000',gasLimit:'0xbebc200',baseFeePerGas:'0x10'};
for(const fault of ['none','cap','lag','revert','chain','genesis','canonical','reorg','bound'])test('CREATE gas estimation uses authenticated runtime and bounded canonical fallback: '+fault,async t=>{
 const key=randomBytes(32);let opened;const calls=[];let fallbackBlocks=0;
 try{
  const account=publicProviderAccountFromKeyV1('ethereum-sepolia',key);
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
   const request=JSON.parse(options.body),fallback=String(endpoint).includes('tenderly');calls.push({fallback,method:request.method});let result,error;
   switch(request.method){
    case 'eth_chainId':result=fallback&&fault==='chain'?'0x1':'0xaa36a7';break;
    case 'eth_getBlockByNumber':
     if(request.params[0]==='0x0')result={hash:fallback&&fault==='genesis'?'0x'+'99'.repeat(32):genesis};
     else {if(fallback)fallbackBlocks++;result=fallback&&fault==='lag'&&fallbackBlocks===1?null:fallback&&(fault==='canonical'||fault==='reorg'&&fallbackBlocks>1)?{...head,hash:'0x'+'99'.repeat(32)}:head;}break;
    case 'eth_estimateGas':
     assert.equal(request.params[0].gas,head.gasLimit);assert.equal(request.params[0].gasPrice,'0x0');
     if(fallback){assert.equal(request.params[1],head.number);result=fault==='bound'?'0xffffffff':'0x3167cb2';}
     else if(fault==='none')result='0x186a0';
     else error=fault==='revert'?{code:3,message:'execution reverted'}:{code:-32003,message:'out of gas: gas required exceeds: 50000000'};
     break;
    default:throw Error('UNEXPECTED_RPC:'+request.method);
   }
   return Response.json({jsonrpc:'2.0',id:request.id,...(error?{error}:{result})});
  });
  opened=await createOriginalPagedSepoliaRpcV4({endpoint:'https://primary.invalid',account,keysetId:'ab'.repeat(32)});
  const run=()=>estimateOriginalPagedSepoliaCreateGasV6(opened.runtime,'0x6000',head);
  if(['none','cap','lag'].includes(fault))assert.equal(await run(),fault==='none'?'0x186a0':'0x3167cb2');
  else await assert.rejects(run(),fault==='revert'?/RPC_FAILED/:/SEPOLIA_GAS_FALLBACK_/);
  assert.equal(calls.some(c=>c.fallback),!['none','revert'].includes(fault));
  assert.ok(calls.every(c=>!['eth_sendRawTransaction','eth_sendTransaction'].includes(c.method)));
  await assert.rejects(estimateOriginalPagedSepoliaCreateGasV6({...opened.runtime},'0x6000',head),/SEPOLIA_RECEIVER_CLOSED/);
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}key.fill(0);}
});
