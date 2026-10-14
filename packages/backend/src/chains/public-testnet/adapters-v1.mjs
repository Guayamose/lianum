/** Public RPC truth remains provider trust. No local miner, faucet or clock injection. */
import {createHash} from 'node:crypto';
import {decodeProviderBase58HexV1,encodeProviderBase58HexV1} from '@lianum/crypto/native-provider-crypto-v1';
import {bitcoinScriptV1,validateNativeAddressV1} from '@lianum/crypto/native-wallet-v1';
import {nativeRpcV1,nativeEsploraV1} from '../../native-wallet/http-v1.mjs';
import {ethereumWalletAdapterV1} from '../../native-wallet/ethereum-v1.mjs';
import {bitcoinWalletAdapterV1} from '../../native-wallet/bitcoin-v1.mjs';
import {solanaWalletAdapterV1} from '../../native-wallet/solana-v1.mjs';
import {need,uint,number,quantity,q,hash,freeze} from '../../native-wallet/common-v1.mjs';
import {encodeWireCommitment,encodeSolanaBindingMessage,MEMO_PROGRAM,assertMemoProgramAccount} from '@lianum/engine/native/native-receipt-binding';
import {validatePublicPagedPreparedV1,validatePublicPagedSignedV1} from './wire-v1.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex');
const pending=()=>({status:'UNKNOWN',finalized:false,confirmations:'0',blockId:null,blockHeight:null,blockTimestamp:null,observedAt:null,feeAtomic:null});
const actualQuote=(prepared,account)=>({account,recipient:prepared.recipient,amountAtomic:prepared.amountAtomic,transaction:prepared.transaction,fee:{maximumAtomic:prepared.feeAtomic}});
function preparedBase(account,recipient,amountAtomic,wireKeyCommitment){validateNativeAddressV1(account.networkId,recipient);need(recipient!==account.address&&uint(amountAtomic,128)>0n,'PUBLIC_RECIPIENT');encodeWireCommitment(wireKeyCommitment);return{networkId:account.networkId,account,recipient,amountAtomic,wireKeyCommitment};}

function ethereum(config){
 const rpc=nativeRpcV1(config.endpoint),original=ethereumWalletAdapterV1(config);
 async function prepare(account,recipient,amountAtomic,K,signal){
  const base=preparedBase(account,recipient,amountAtomic,K),data='0x'+encodeWireCommitment(K).toString('hex');
  const [head,nonce,priority,balance,code]=await Promise.all([rpc('eth_getBlockByNumber',['latest',false],signal),rpc('eth_getTransactionCount',[account.address,'pending'],signal),rpc('eth_maxPriorityFeePerGas',[],signal),rpc('eth_getBalance',[account.address,'pending'],signal),rpc('eth_getCode',[recipient,'latest'],signal)]);need(code==='0x','EVM_CONTRACT_RECIPIENT_UNSUPPORTED');hash(head.hash);
  const priorityFee=quantity(priority),maxFee=quantity(head.baseFeePerGas)*2n+priorityFee,estimated=quantity(await rpc('eth_estimateGas',[{from:account.address,to:recipient,value:q(amountAtomic),data}],signal)),gas=(estimated*120n+99n)/100n;need(gas>=23800n&&gas<=100000n&&maxFee>0n,'PUBLIC_EVM_GAS');const feeAtomic=(gas*maxFee).toString();need(quantity(balance)>=uint(amountAtomic)+uint(feeAtomic),'INSUFFICIENT_FUNDS');
  const transaction={kind:'PAGED_SEPOLIA_1559_V1',chainId:'11155111',nonce:quantity(nonce).toString(),to:recipient.toLowerCase(),value:amountAtomic,gasLimit:gas.toString(),maxFeePerGas:maxFee.toString(),maxPriorityFeePerGas:priorityFee.toString(),wireKeyCommitment:K};
  const result={...base,transaction,feeAtomic,head:{hash:head.hash,number:quantity(head.number).toString(),timestamp:quantity(head.timestamp).toString()},quoteTimestamp:quantity(head.timestamp).toString()};validatePublicPagedPreparedV1(account,result);return result;
 }
 async function beforeSend(prepared,signal){await original.identify(signal);await original.beforeBroadcast(actualQuote(prepared,prepared.account),signal);}
 async function observe(record,signal){
  validatePublicPagedSignedV1(record.prepared.account,record.prepared,record.signed.nativeWire);const wire=record.signed.nativeWire,id=record.signed.nativeId;
  const result=await original.observe({nativeId:id,rawTransaction:wire,quote:actualQuote(record.prepared,record.prepared.account)},signal);if(result.status==='UNKNOWN')return pending();
  const [tx,block,tip,finalized]=await Promise.all([rpc('eth_getTransactionByHash',[id],signal),rpc('eth_getBlockByNumber',[q(result.blockNumber),false],signal),rpc('eth_getBlockByNumber',['latest',false],signal),rpc('eth_getBlockByNumber',['finalized',false],signal)]);
  need(block?.hash===result.blockHash&&tx?.hash===id&&tx.blockHash===block.hash&&tx.blockNumber===block.number,'PUBLIC_EVM_INCLUSION');const t=record.prepared.transaction;
  for(const [key,expected] of Object.entries({chainId:t.chainId,nonce:t.nonce,value:t.value,gas:t.gasLimit,maxFeePerGas:t.maxFeePerGas,maxPriorityFeePerGas:t.maxPriorityFeePerGas}))need(quantity(tx[key]).toString()===expected,'PUBLIC_EVM_SIGNED_FIELDS');
  need(tx.from.toLowerCase()===record.prepared.account.address&&tx.to.toLowerCase()===record.prepared.recipient.toLowerCase()&&tx.input==='0x'+encodeWireCommitment(t.wireKeyCommitment).toString('hex')&&quantity(tx.type)===2n&&Array.isArray(tx.accessList)&&tx.accessList.length===0,'PUBLIC_EVM_SIGNED_FIELDS');
  need(await rpc('eth_getCode',[record.prepared.recipient,block.number],signal)==='0x','PUBLIC_EVM_INCLUDED_RECIPIENT_EOA');
  const finalizedCanonical=finalized&&await rpc('eth_getBlockByNumber',[finalized.number,false],signal);need(!finalized||finalizedCanonical?.hash===finalized.hash,'PUBLIC_EVM_FINALIZED_CANONICAL');
  const isFinal=result.status==='FINALIZED'&&finalized&&quantity(finalized.number)>=quantity(block.number);
  return freeze({status:result.status==='FAILED'?'ADVERSE':isFinal?'OBSERVED':'CONFIRMED',finalized:!!isFinal,confirmations:result.confirmations,blockId:block.hash.slice(2),blockHeight:result.blockNumber,blockTimestamp:quantity(block.timestamp).toString(),observedAt:null,nativeTipTimestamp:quantity(tip.timestamp).toString(),feeAtomic:result.feeAtomic,genesis:config.rule.genesis,asset:config.rule.asset,transactionSHA256:record.signed.transactionSHA256,nativeId:id});
 }
 async function head(signal){await original.identify(signal);const block=await rpc('eth_getBlockByNumber',['latest',false],signal);hash(block.hash);quantity(block.number);quantity(block.timestamp);return freeze({hash:block.hash,number:block.number,timestamp:block.timestamp});}
 return{identify:original.identify,head,balances:original.balances,prepare,beforeSend,broadcast:(wire,signal)=>rpc('eth_sendRawTransaction',[wire],signal),observe};
}

function bitcoin(config){
 const api=nativeEsploraV1(config.endpoint),original=bitcoinWalletAdapterV1(config);
 async function prepare(account,recipient,amountAtomic,K,signal){
  const base=preparedBase(account,recipient,amountAtomic,K),sourceScript=bitcoinScriptV1(account.address,'testnet'),recipientScript=bitcoinScriptV1(recipient,'testnet');need(/^0014[0-9a-f]{40}$/.test(recipientScript)&&uint(amountAtomic,64)>=546n,'PUBLIC_BTC_RECIPIENT_P2WPKH');
  const [utxos,rates,tip]=await Promise.all([api('/address/'+account.address+'/utxo',{signal}),api('/v1/fees/recommended',{signal}),api('/blocks/tip/hash',{signal,text:true})]);hash(tip);need(Array.isArray(utxos)&&utxos.length<=10000&&typeof rates.hourFee==='number'&&Number.isFinite(rates.hourFee)&&rates.hourFee>0&&rates.hourFee<=10000,'PUBLIC_BTC_PREPARATION');
  // Existing Paged wire binds one input and positive change. Never silently aggregate incompatible inputs.
  const fee=BigInt(Math.ceil(rates.hourFee))*224n;need(fee<=10000n,'PUBLIC_BTC_FEE_BINDING_LIMIT');const candidates=utxos.filter(u=>u.status?.confirmed&&Number.isSafeInteger(u.value)&&BigInt(u.value)>=uint(amountAtomic)+fee+546n).sort((a,b)=>a.value-b.value||String(a.txid).localeCompare(String(b.txid)));need(candidates.length>0,'INSUFFICIENT_FUNDS');const out=candidates[0];hash(out.txid);need(Number.isSafeInteger(out.vout)&&out.vout>=0&&out.vout<=4294967295,'PUBLIC_BTC_PREVOUT');
  const [previousTxHex,previous,head,canonical]=await Promise.all([api('/tx/'+out.txid+'/hex',{signal,text:true}),api('/tx/'+out.txid,{signal}),api('/block/'+tip,{signal}),api('/block-height/'+out.status.block_height,{signal,text:true})]);need(previous.txid===out.txid&&previous.status?.block_hash===out.status.block_hash&&previous.status.confirmed===true&&canonical===out.status.block_hash&&head.id===tip,'PUBLIC_BTC_PREVOUT_CANONICAL');need(Array.isArray(previous.vin)&&previous.vin.length>0,'PUBLIC_BTC_PREVOUT');if(previous.vin[0].is_coinbase===true)need(number(head.height)-number(out.status.block_height)+1n>=100n,'BTC_COINBASE_IMMATURE');
  const intent={sourceTxid:out.txid,sourceVout:String(out.vout),sourceScript,sourceSatoshi:String(out.value),recipientScript,amountSatoshi:amountAtomic,changeScript:sourceScript,feeSatoshi:fee.toString(),wireKeyCommitment:K},result={...base,transaction:{kind:'PAGED_TESTNET3_P2WPKH_V1',intent,previousTxHex},feeAtomic:fee.toString(),head:{hash:tip,number:String(head.height),timestamp:String(head.timestamp)},quoteTimestamp:String(head.timestamp)};
  validatePublicPagedPreparedV1(account,result);need(await api('/blocks/tip/hash',{signal,text:true})===tip,'HEAD_CHANGED');return result;
 }
 async function beforeSend(prepared,signal){await original.identify(signal);const i=prepared.transaction.intent;await original.beforeBroadcast({...actualQuote(prepared,prepared.account),transaction:{inputs:[{txid:i.sourceTxid,vout:Number(i.sourceVout),valueAtomic:i.sourceSatoshi}]}},signal);}
 async function observe(record,signal){
  validatePublicPagedSignedV1(record.prepared.account,record.prepared,record.signed.nativeWire);const result=await original.observe({nativeId:record.signed.nativeId,rawTransaction:record.signed.nativeWire,quote:actualQuote(record.prepared,record.prepared.account)},signal);if(result.status==='UNKNOWN'||result.status==='SUBMITTED')return pending();
  const [block,tip]=await Promise.all([api('/block/'+result.blockHash,{signal}),api('/blocks/tip/hash',{signal,text:true})]);need(block.id===result.blockHash,'PUBLIC_BTC_BLOCK');const tipBlock=await api('/block/'+tip,{signal});need(tipBlock.id===tip&&number(tipBlock.height)>=uint(result.blockNumber),'PUBLIC_BTC_HEAD');
  return freeze({status:result.status==='FINALIZED'?'OBSERVED':'CONFIRMED',finalized:result.status==='FINALIZED',confirmations:result.confirmations,blockId:result.blockHash,blockHeight:result.blockNumber,blockTimestamp:String(block.timestamp),observedAt:null,nativeTipTimestamp:String(tipBlock.timestamp),feeAtomic:record.prepared.feeAtomic,genesis:config.rule.genesis,asset:config.rule.asset,transactionSHA256:record.signed.transactionSHA256,nativeId:record.signed.nativeId});
 }
 return{identify:original.identify,balances:original.balances,prepare,beforeSend,broadcast:(wire,signal)=>api('/tx',{method:'POST',body:wire,text:true,signal}),observe};
}

function solana(config){
 const rpc=nativeRpcV1(config.endpoint),original=solanaWalletAdapterV1(config),options={commitment:'finalized'};
 async function memoFingerprint(signal){const account=await rpc('getAccountInfo',[MEMO_PROGRAM.address,{...options,encoding:'base64'}],signal);need(account?.value?.executable===true&&Array.isArray(account.value.data)&&account.value.data[1]==='base64','PUBLIC_SOL_MEMO_PROGRAM');assertMemoProgramAccount({address:MEMO_PROGRAM.address,owner:account.value.owner,executable:account.value.executable,dataBase64:account.value.data[0]});return{owner:account.value.owner,codeSHA256:digest(Buffer.from(account.value.data[0],'base64'))};}
 async function prepare(account,recipient,amountAtomic,K,signal){
  const base=preparedBase(account,recipient,amountAtomic,K),latest=await rpc('getLatestBlockhash',[options],signal),slot=number(latest.context.slot),block=await rpc('getBlock',[Number(slot),{...options,transactionDetails:'none',rewards:false,maxSupportedTransactionVersion:0}],signal);need(block&&Number.isSafeInteger(block.blockTime)&&block.blockTime>0,'PUBLIC_SOL_BLOCK_TIME');
  const intent={sourcePublicKey:account.publicKey,recipientPublicKey:decodeProviderBase58HexV1(recipient),recentBlockhash:decodeProviderBase58HexV1(latest.value.blockhash),lamports:amountAtomic,wireKeyCommitment:K};const messageBase64=Buffer.from(encodeSolanaBindingMessage(intent),'hex').toString('base64');
  const [fee,balance,memo]=await Promise.all([rpc('getFeeForMessage',[messageBase64,options],signal),rpc('getBalance',[account.address,{...options,minContextSlot:latest.context.slot}],signal),memoFingerprint(signal)]);need(fee.value!==null&&number(balance.value)>=uint(amountAtomic)+number(fee.value),'INSUFFICIENT_FUNDS');
  const result={...base,transaction:{kind:'PAGED_DEVNET_TRANSFER_MEMO_V1',intent,lastValidBlockHeight:number(latest.value.lastValidBlockHeight).toString()},feeAtomic:number(fee.value).toString(),memoProgram:memo,head:{hash:block.blockhash,number:slot.toString(),timestamp:String(block.blockTime)},quoteTimestamp:String(block.blockTime)};validatePublicPagedPreparedV1(account,result);return result;
 }
 async function beforeSend(prepared,signal){await original.identify(signal);const t=prepared.transaction,quote={...actualQuote(prepared,prepared.account),transaction:{recentBlockhash:encodeProviderBase58HexV1(t.intent.recentBlockhash),lastValidBlockHeight:t.lastValidBlockHeight,messageBase64:Buffer.from(encodeSolanaBindingMessage(t.intent),'hex').toString('base64')}};await original.beforeBroadcast(quote,signal);need(JSON.stringify(await memoFingerprint(signal))===JSON.stringify(prepared.memoProgram),'PUBLIC_SOL_MEMO_CHANGED');}
 async function observe(record,signal){
  validatePublicPagedSignedV1(record.prepared.account,record.prepared,record.signed.nativeWire);const result=await original.observe({nativeId:record.signed.nativeId,rawTransaction:record.signed.nativeWire,quote:{...actualQuote(record.prepared,record.prepared.account),transaction:{lastValidBlockHeight:record.prepared.transaction.lastValidBlockHeight}}},signal);if(['UNKNOWN','SUBMITTED'].includes(result.status))return pending();
  need(JSON.stringify(await memoFingerprint(signal))===JSON.stringify(record.prepared.memoProgram),'PUBLIC_SOL_MEMO_CHANGED');const block=await rpc('getBlock',[Number(result.blockNumber),{commitment:result.status==='FINALIZED'?'finalized':'confirmed',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0}],signal);need(block.blockhash===result.blockHash&&Number.isSafeInteger(block.blockTime)&&block.blockTime>0,'PUBLIC_SOL_BLOCK');
  return freeze({status:result.status==='FAILED'?'ADVERSE':result.status==='FINALIZED'?'OBSERVED':'CONFIRMED',finalized:result.status==='FINALIZED',confirmations:result.confirmations??'0',blockId:decodeProviderBase58HexV1(result.blockHash),blockHeight:result.blockNumber,blockTimestamp:String(block.blockTime),observedAt:null,nativeTipTimestamp:String(block.blockTime),feeAtomic:result.feeAtomic,genesis:config.rule.genesis,asset:config.rule.asset,transactionSHA256:record.signed.transactionSHA256,nativeId:record.signed.nativeId});
 }
 return{identify:original.identify,balances:original.balances,prepare,beforeSend,broadcast:(wire,signal)=>rpc('sendTransaction',[wire,{encoding:'base64',skipPreflight:false,preflightCommitment:'finalized',maxRetries:0}],signal),observe};
}
export function publicPagedNativeAdapterV1(config){return config.network.chain==='ethereum'?ethereum(config):config.network.chain==='bitcoin'?bitcoin(config):solana(config);}
