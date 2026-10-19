import {buildNativeWalletTransactionV1,validateNativeAddressV1} from '@lianum/crypto/native-wallet-v1';
import {nativeRpcV1} from './http-v1.mjs';
import {need,quantity,q,hash,uint} from './common-v1.mjs';
export function ethereumWalletAdapterV1(config){
 const rpc=nativeRpcV1(config.endpoint);
 async function identify(signal){const [chain,first]=await Promise.all([rpc('eth_chainId',[],signal),rpc('eth_getBlockByNumber',['0x0',false],signal)]);need(quantity(chain).toString()===config.chainId&&first?.hash===config.network.genesisHash,'NETWORK_IDENTITY');}
 async function balances(account,signal){const head=await rpc('eth_getBlockByNumber',['latest',false],signal);hash(head?.hash);quantity(head.number);const [current,pending]=await Promise.all([rpc('eth_getBalance',[account.address,head.number],signal),rpc('eth_getBalance',[account.address,'pending'],signal)]);const canonical=await rpc('eth_getBlockByNumber',[head.number,false],signal);need(canonical?.hash===head.hash,'HEAD_CHANGED');const a=quantity(current),b=quantity(pending);return{balanceAtomic:a.toString(),spendableAtomic:(a<b?a:b).toString(),pendingAtomic:(b>a?b-a:0n).toString(),observed:{blockHash:head.hash,blockNumber:quantity(head.number).toString(),finality:'LATEST'}};}
 async function prepare(account,recipient,amountAtomic,signal){
  validateNativeAddressV1(account.networkId,recipient);
  const [balance,head,nonce,priority,code]=await Promise.all([balances(account,signal),rpc('eth_getBlockByNumber',['latest',false],signal),rpc('eth_getTransactionCount',[account.address,'pending'],signal),rpc('eth_maxPriorityFeePerGas',[],signal),rpc('eth_getCode',[recipient,'latest'],signal)]);
  need(code==='0x','EVM_CONTRACT_RECIPIENT_UNSUPPORTED');
  const maxPriority=quantity(priority),maxFee=quantity(head.baseFeePerGas)*2n+maxPriority,amount=uint(amountAtomic),spendable=uint(balance.spendableAtomic);
  need(maxFee>0n,'EVM_FEE');
  // Every supported EOA transfer uses at least 21,000 gas, with the same 20%
  // quote margin applied below. Reject an unfunded account before estimation:
  // providers otherwise return an opaque RPC error instead of our useful code.
  need(spendable>=amount+25200n*maxFee,'INSUFFICIENT_FUNDS');
  const gas=quantity(await rpc('eth_estimateGas',[{from:account.address,to:recipient,value:q(amount),data:'0x'}],signal));
  need(gas>0n&&gas<=1000000n,'EVM_FEE');
  // Some providers return an estimate below the plain-transfer intrinsic
  // floor (observed 12,000). Quote at least 21,000 plus our existing margin;
  // a lower estimate must not remove that allowance or hide a funded review.
  const quotedGas=gas<21000n?21000n:gas;
  const gasLimit=(quotedGas*120n+99n)/100n,fee=gasLimit*maxFee;
  need(spendable>=amount+fee,'INSUFFICIENT_FUNDS');
  const transaction=buildNativeWalletTransactionV1(account,{chainId:config.chainId,nonce:quantity(nonce).toString(),to:recipient,value:amountAtomic,gasLimit:gasLimit.toString(),maxFeePerGas:maxFee.toString(),maxPriorityFeePerGas:maxPriority.toString()});
  return{transaction,feeAtomic:fee.toString()};
 }
 async function beforeBroadcast(quote,signal){const t=quote.transaction;const [nonce,balance,head,code]=await Promise.all([rpc('eth_getTransactionCount',[quote.account.address,'pending'],signal),rpc('eth_getBalance',[quote.account.address,'pending'],signal),rpc('eth_getBlockByNumber',['latest',false],signal),rpc('eth_getCode',[quote.recipient,'latest'],signal)]);need(quantity(nonce).toString()===t.nonce,'EVM_NONCE_CHANGED');need(code==='0x','EVM_CONTRACT_RECIPIENT_UNSUPPORTED');need(quantity(balance)>=uint(quote.amountAtomic)+uint(quote.fee.maximumAtomic),'INSUFFICIENT_FUNDS');need(quantity(head.baseFeePerGas)+uint(t.maxPriorityFeePerGas)<=uint(t.maxFeePerGas),'EVM_FEE_CHANGED');}
 const broadcast=(raw,signal)=>rpc('eth_sendRawTransaction',[raw],signal);
 async function observe(record,signal){const id=record.nativeId,receipt=await rpc('eth_getTransactionReceipt',[id],signal);if(receipt===null)return{status:'UNKNOWN',confirmations:'0',blockHash:null,blockNumber:null,feeAtomic:null,errorCode:null};need(receipt?.transactionHash===id,'EVM_RECEIPT');hash(receipt.blockHash);const [block,tip,finalized]=await Promise.all([rpc('eth_getBlockByNumber',[receipt.blockNumber,false],signal),rpc('eth_getBlockByNumber',['latest',false],signal),rpc('eth_getBlockByNumber',['finalized',false],signal)]);if(block?.hash!==receipt.blockHash)return{status:'UNKNOWN',confirmations:'0',blockHash:null,blockNumber:null,feeAtomic:null,errorCode:'NATIVE_WALLET_REORG'};const n=quantity(receipt.blockNumber),height=quantity(tip.number);need(height>=n&&receipt.from.toLowerCase()===record.quote.account.address.toLowerCase()&&receipt.to.toLowerCase()===record.quote.recipient.toLowerCase(),'EVM_RECEIPT');const fee=quantity(receipt.gasUsed)*quantity(receipt.effectiveGasPrice);need(fee<=uint(record.quote.fee.maximumAtomic),'EVM_FEE');const isFinal=finalized!==null&&quantity(finalized.number)>=n;return{status:quantity(receipt.status)===0n?'FAILED':isFinal?'FINALIZED':'CONFIRMED',terminal:isFinal,confirmations:(height-n+1n).toString(),blockHash:receipt.blockHash,blockNumber:n.toString(),feeAtomic:fee.toString(),errorCode:quantity(receipt.status)===0n?'NATIVE_WALLET_EXECUTION_FAILED':null};}
 return{identify,balances,prepare,beforeBroadcast,broadcast,observe};
}
