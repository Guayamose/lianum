/** TEST boundary: synthetic BTC/SOL funding, RPC and confirmations. All original
 * production adapters, protected signers, wire checks and PAEG owners remain.
 * Ethereum is forwarded to actual owned fork EVM by the outer harness. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as btc from '@scure/btc-signer';
import {hex,base58} from '@scure/base';
import {MEMO_PROGRAM} from '@lianum/engine/native/native-receipt-binding';
import {publicPagedTestnetNetworksV1} from '../../../../src/chains/public-testnet/profile-v1.mjs';
import {projectRoot} from '@lianum/environment';
const digest=v=>createHash('sha256').update(v).digest('hex');
export async function createPublicBtcSolReceiptsHostV5(nativeDirectory,accounts){
 const networks=publicPagedTestnetNetworksV1(),account=accounts[1],p=btc.p2wpkh(hex.decode(account.publicKey),btc.TEST_NETWORK),funding=new btc.Transaction({allowUnknownInputs:true});funding.addOutput({amount:100000n,script:p.script});funding.addInput({txid:'11'.repeat(32),index:0,finalScriptSig:Uint8Array.of(0)});
 const previous=hex.encode(funding.toBytes(true,true)),fundingId=funding.id,blockId=digest('HOST BTC finalized block'),fundingBlock=digest('HOST BTC funding'),solBlock=base58.encode(Buffer.from(digest('HOST SOL finalized block'),'hex')),memo=await readFile(join(projectRoot,'.internal/runtime/omnichain-flat-profile/flat-wallet/integration/fixtures/spl_memo-3.0.0.so'));assert.equal(digest(memo),MEMO_PROGRAM.codeSHA256);
 const btcRows=new Map(),solRows=new Map(),stats={bitcoinPosts:0,solanaPosts:0,originalSignedRowsBeforePOST:0};
 async function durable(wire){const journal=JSON.parse(await readFile(join(nativeDirectory,'dispatch-journal/native-wallet.json'),'utf8')),row=journal.operations.find(row=>row.signed?.nativeWire===wire);assert.ok(row&&row.phase==='SUBMITTING','HOST_ORIGINAL_DURABLE_WIRE_BEFORE_POST');stats.originalSignedRowsBeforePOST++;return row;}
 const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json'}}),text=v=>new Response(v,{status:200,headers:{'content-type':'text/plain'}});
 return Object.freeze({stats,async route(url,options){
  const endpoint=new URL(url),now=Math.floor(Date.now()/1000);
  if(endpoint.hostname==='mempool.space'){
   const path=endpoint.pathname.replace(/^\/testnet\/api/,'');
   if(path==='/block-height/0')return text(networks[1].network?.genesisHash??networks[1].rule.genesis);
   if(path==='/blocks/tip/hash')return text(blockId);if(path==='/blocks/tip/height')return text('206');
   if(path==='/block/'+blockId)return json({id:blockId,height:206,timestamp:now});
   if(path==='/block/'+fundingBlock)return json({id:fundingBlock,height:100,timestamp:now});
   if(path==='/block-height/100')return text(fundingBlock);if(path==='/block-height/200')return text(blockId);
   if(path==='/v1/fees/recommended')return json({hourFee:1});
   if(path.startsWith('/address/')&&path.endsWith('/utxo'))return json([{txid:fundingId,vout:0,value:100000,status:{confirmed:true,block_height:100,block_hash:fundingBlock}}]);
   if(path==='/tx/'+fundingId+'/hex')return text(previous);if(path==='/tx/'+fundingId)return json({txid:fundingId,status:{confirmed:true,block_hash:fundingBlock},vin:[{is_coinbase:false}]});
   if(path==='/tx'&&options.method==='POST'){const row=await durable(options.body);btcRows.set(row.signed.nativeId,row.signed.nativeWire);stats.bitcoinPosts++;return text(row.signed.nativeId);}
   const match=path.match(/^\/tx\/([0-9a-f]{64})\/(hex|status)$/);if(match&&btcRows.has(match[1]))return match[2]==='hex'?text(btcRows.get(match[1])):json({confirmed:true,block_height:200,block_hash:blockId});
   throw Error('HOST_BTC_UNEXPECTED_ROUTE:'+path);
  }
  if(endpoint.hostname==='api.devnet.solana.com'){
   const req=JSON.parse(options.body),reply=value=>json({jsonrpc:'2.0',id:req.id,result:value}),context={slot:200};
   switch(req.method){
    case'getGenesisHash':return reply('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
    case'getBalance':return reply({context,value:1000000000});
    case'getLatestBlockhash':return reply({context,value:{blockhash:solBlock,lastValidBlockHeight:5000}});
    case'getBlockHeight':return reply(200);case'isBlockhashValid':return reply({context,value:true});
    case'getFeeForMessage':return reply({context,value:5000});case'getMinimumBalanceForRentExemption':return reply(890880);
    case'getAccountInfo':return reply({context,value:req.params[0]===MEMO_PROGRAM.address?{owner:MEMO_PROGRAM.owner,executable:true,data:[memo.toString('base64'),'base64']}:{owner:'11111111111111111111111111111111',executable:false,data:['','base64']}});
    case'sendTransaction':{const row=await durable(req.params[0]);solRows.set(row.signed.nativeId,row.signed.nativeWire);stats.solanaPosts++;return reply(row.signed.nativeId);}
    case'getSignatureStatuses':return reply({context,value:req.params[0].map(id=>solRows.has(id)?{slot:200,confirmations:null,err:null,confirmationStatus:'finalized'}:null)});
    case'getTransaction':return reply(solRows.has(req.params[0])?{slot:200,transaction:[solRows.get(req.params[0]),'base64'],meta:{fee:5000,err:null}}:null);
    case'getBlock':return reply({blockhash:solBlock,blockTime:now,signatures:req.params[1].transactionDetails==='signatures'?[...solRows.keys()]:undefined});
    default:throw Error('HOST_SOL_UNEXPECTED_RPC:'+req.method);
   }
  }
  throw Error('HOST_ONLY_BTC_SOL_ROUTE');
 }});
}
