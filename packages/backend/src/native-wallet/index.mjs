/** Keyless public-native gateway. Explicit public/test genesis, public RPC
 * trust, retained signed bytes before a single send, and observation on retry.
 * This module has no PAEG note, permission, local ledger or private key. */
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateNativeAccountV1,validateNativeAddressV1,validateNativeSendReviewV1,validateNativeWalletSignedTransactionV1,nativeJsonHashV1} from '@lianum/crypto/native-wallet-v1';
import {nativePublicNetworksV1} from './networks-v1.mjs';
import {ethereumWalletAdapterV1} from './ethereum-v1.mjs';
import {bitcoinWalletAdapterV1} from './bitcoin-v1.mjs';
import {solanaWalletAdapterV1} from './solana-v1.mjs';
import {openNativeWalletJournalV1} from './journal-v1.mjs';
import {exact,need,uint,clone,freeze,same,byteSize,signalCurrent} from './common-v1.mjs';
const accountKeys=['networkId','chain','network','address','path','publicKey'];
const bootId=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),TTL_NS=120000000000n;
const quoteExpired=row=>Date.now()>=row.quote.expiresAt||row.quoteClock.bootId!==bootId||process.hrtime.bigint()>=BigInt(row.quoteClock.deadlineNs);
const rowState=row=>row.observation?.status??(row.phase==='CANCELLED'?'FAILED':row.phase==='QUOTED'?quoteExpired(row)?'EXPIRED':'PREPARED':row.phase==='SUBMITTED'?'SUBMITTED':'UNKNOWN');
function account(raw){exact(raw,accountKeys);validateNativeAccountV1(raw);return clone(raw);}
const accountKey=own=>own.networkId+':'+(own.chain==='ethereum'?own.address.toLowerCase():own.address);
function code(error){return /^NATIVE_(?:WALLET_)?[A-Z_]+$/.test(error?.code??'')?error.code:/^NATIVE_(?:WALLET_)?[A-Z_]+$/.test(error?.message??'')?error.message:'NATIVE_WALLET_NETWORK_UNCONFIRMED';}
const writeRejections=new Set(['ALREADY_KNOWN','REPLACEMENT_UNDERPRICED','NONCE_TOO_LOW','INSUFFICIENT_FUNDS','FEE_TOO_LOW','RATE_LIMITED','METHOD_UNSUPPORTED']);
const writeCode=error=>writeRejections.has(error?.rpcWriteRejection)?'NATIVE_WALLET_RPC_WRITE_'+error.rpcWriteRejection:code(error);
export async function createNativeWalletGatewayV1(options){
 exact(options,[],['config','configuration','directory','journalDirectory']);need(Object.hasOwn(options,'config')!==Object.hasOwn(options,'configuration'),'CONFIG');need(typeof(options.journalDirectory??options.directory)==='string','JOURNAL_DIRECTORY');const configurations=nativePublicNetworksV1(options.configuration??options.config),configurationSHA256=nativeJsonHashV1(configurations.map(c=>c.network).sort((a,b)=>a.id.localeCompare(b.id))),journal=await openNativeWalletJournalV1(options.journalDirectory??options.directory,configurationSHA256),adapters=new Map(configurations.map(c=>[c.network.id,{config:c,adapter:(c.network.chain==='ethereum'?ethereumWalletAdapterV1:c.network.chain==='bitcoin'?bitcoinWalletAdapterV1:solanaWalletAdapterV1)(c)}]));
 let closing=false,commitQueue=Promise.resolve(),closeWork;const active=new Set(),accountQueues=new Map(),operationIndex=new Map(),nativeIndex=new Map();
 function pick(id){need(!closing,'CLOSED');const selected=adapters.get(id);need(selected,'NETWORK_NOT_CONFIGURED');return selected;}
 function tracked(work){need(!closing,'CLOSED');const operation=work();active.add(operation);return operation.finally(()=>active.delete(operation));}
 function serialized(own,work){return tracked(()=>{
  const key=accountKey(own),prior=accountQueues.get(key)??Promise.resolve(),task=prior.then(work),tail=task.then(()=>{},()=>{});
  accountQueues.set(key,tail);void tail.then(()=>{if(accountQueues.get(key)===tail)accountQueues.delete(key);});return task;
 });}
 function indexedRows(){return [...operationIndex.values()].map(clone);}
 function indexed(id,networkId){const row=operationIndex.get(id)??nativeIndex.get(id);return row&&(networkId===undefined||row.quote.networkId===networkId)?clone(row):undefined;}
 function quoted(id){const row=operationIndex.get(id);return row?clone(row):undefined;}
 function index(row){const copy=freeze(clone(row));operationIndex.set(copy.quote.id,copy);if(copy.nativeId!==null)nativeIndex.set(copy.nativeId,copy);}
 // Network/proof work runs outside this queue. A commit merges exactly one
 // account's row with the newest journal so independent updates cannot vanish.
 async function saveRow(row,before){
  const next=clone(row),expected=before===null?null:clone(before);
  const work=commitQueue.then(async()=>{
   const previous=operationIndex.get(next.quote.id)??null;need(same(previous,expected),'JOURNAL_CONFLICT');
   if(previous!==null&&same(previous,next))return;
   const rows=indexedRows(),at=rows.findIndex(value=>value.quote.id===next.quote.id);
   if(at<0)rows.push(next);else rows[at]=next;
   await journal.commit(rows);index(next);
  });commitQueue=work.catch(()=>{});await work;
 }
 function result(row){const status=rowState(row);return freeze({operationId:row.quote.id,quoteId:row.quote.id,id:row.nativeId??null,networkId:row.quote.networkId,status,terminal:status==='EXPIRED'||row.phase==='CANCELLED'||row.observation?.terminal===true,confirmations:row.observation?.confirmations??null,blockHash:row.observation?.blockHash??null,blockNumber:row.observation?.blockNumber??null,feeAtomic:row.observation?.feeAtomic??null,errorCode:row.phase==='CANCELLED'?'NATIVE_WALLET_QUOTE_CANCELLED':status==='EXPIRED'?'NATIVE_WALLET_QUOTE_EXPIRED':row.observation?.errorCode??row.errorCode??null});}
 function pending(row){if(row.phase==='CANCELLED')return false;if(row.phase==='QUOTED')return !quoteExpired(row);return row.observation?.terminal!==true;}
 function validateRows(){const data=journal.read(),ids=new Set();for(const row of data.operations){exact(row,['quote','quoteClock','phase','nativeId','rawTransaction','errorCode','observation']);exact(row.quoteClock,['bootId','deadlineNs']);need(typeof row.quoteClock.bootId==='string'&&/^[a-f0-9-]{36}$/.test(row.quoteClock.bootId)&&typeof row.quoteClock.deadlineNs==='string'&&/^[1-9][0-9]{0,23}$/.test(row.quoteClock.deadlineNs),'JOURNAL_CLOCK');if(row.quoteClock.bootId===bootId)need(BigInt(row.quoteClock.deadlineNs)<=process.hrtime.bigint()+TTL_NS,'JOURNAL_CLOCK');const quote=row.quote;exact(quote,['profile','id','networkId','network','account','recipient','amountAtomic','fee','transaction','issuedAt','expiresAt','quoteSHA256']);need(quote.profile==='NATIVE_WALLET_SEND_QUOTE_V1'&&typeof quote.id==='string'&&/^[0-9a-f-]{36}$/.test(quote.id)&&!ids.has(quote.id),'JOURNAL_DATA');ids.add(quote.id);const selected=adapters.get(quote.networkId);need(selected&&same(quote.network,selected.config.network),'JOURNAL_NETWORK');account(quote.account);need(quote.account.networkId===quote.networkId,'JOURNAL_NETWORK');const {quoteSHA256,...body}=quote;need(nativeJsonHashV1(body)===quoteSHA256&&Number.isSafeInteger(quote.issuedAt)&&quote.expiresAt===quote.issuedAt+120000,'JOURNAL_QUOTE');validateNativeSendReviewV1(quote.account,quote.transaction,quote.recipient,quote.amountAtomic,quote.fee.maximumAtomic);need(['QUOTED','CANCELLED','SIGNED','SUBMITTING','SUBMITTED','UNKNOWN'].includes(row.phase),'JOURNAL_PHASE');if(['QUOTED','CANCELLED'].includes(row.phase))need(row.nativeId===null&&row.rawTransaction===null&&row.observation===null,'JOURNAL_PHASE');else{const signed=validateNativeWalletSignedTransactionV1(quote.account,quote.transaction,row.rawTransaction);need(signed.id===row.nativeId,'JOURNAL_SIGNED_BINDING');}if(row.observation!==null){exact(row.observation,['status','confirmations','blockHash','blockNumber','feeAtomic','errorCode'],['terminal']);need(['UNKNOWN','SUBMITTED','CONFIRMED','FINALIZED','FAILED'].includes(row.observation.status),'JOURNAL_STATUS');}}return data.operations;}
 try{for(const row of validateRows())index(row);}catch(error){await journal.close();throw error;}
 async function observeRow(row,selected,signal){await selected.adapter.identify(signal);let observation;try{observation=await selected.adapter.observe(row,signal);}catch(error){observation={status:'UNKNOWN',confirmations:null,blockHash:null,blockNumber:null,feeAtomic:null,errorCode:code(error)};}
  // A missing receipt is not a successful broadcast. Keep the bounded send
  // failure while its result is unknown; never infer rejection/finality from it.
  if(observation.status!=='UNKNOWN')row.errorCode=observation.errorCode??null;
  else row.errorCode=row.errorCode??observation.errorCode??null;
  row.observation={...observation,errorCode:observation.status==='UNKNOWN'?row.errorCode:observation.errorCode};return result(row);}
 const gateway=Object.freeze({
  capabilities(){need(!closing,'CLOSED');return freeze({profile:'NATIVE_WALLET_KEYLESS_PUBLIC_GATEWAY_V1',signing:'DEVICE_ONLY',paeg:false,networks:configurations.map(c=>({...c.network,minimumAmountAtomic:c.network.chain==='bitcoin'?'546':'1',finality:c.network.chain==='bitcoin'?'POW_6_CONFIRMATIONS':c.network.chain==='ethereum'?'RPC_FINALIZED':'RPC_FINALIZED'})),quoteLifetimeMs:120000,onePendingPerAccount:true,automaticRebroadcast:false});},
  async balances(raw,signal){const own=account(raw),selected=pick(own.networkId);return tracked(async()=>{signalCurrent(signal);await selected.adapter.identify(signal);const value=await selected.adapter.balances(own,signal),rows=indexedRows().filter(row=>accountKey(row.quote.account)===accountKey(own)&&pending(row)),reserved=rows.reduce((sum,row)=>sum+uint(row.quote.amountAtomic)+uint(row.quote.fee.maximumAtomic),0n);return freeze({networkId:own.networkId,network:selected.config.network,address:own.address,...value,spendableAtomic:rows.length?'0':value.spendableAtomic,reservedAtomic:reserved.toString(),hasPendingTransfer:rows.length>0});});},
  async prepareSend(raw,signal){exact(raw,['account','recipient','amountAtomic'],['operationId','networkId']);const own=account(raw.account),selected=pick(own.networkId);if(raw.networkId!==undefined)need(raw.networkId===own.networkId,'NETWORK_BINDING');validateNativeAddressV1(own.networkId,raw.recipient);need(uint(raw.amountAtomic)>0n,'AMOUNT');const id=raw.operationId??randomUUID();need(typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id),'OPERATION_ID');const recipient=raw.recipient,amountAtomic=raw.amountAtomic;
   return serialized(own,async()=>{signalCurrent(signal);const rows=indexedRows(),existing=rows.find(row=>row.quote.id===id);if(existing){need(same(existing.quote.account,own)&&existing.quote.recipient===recipient&&existing.quote.amountAtomic===amountAtomic,'OPERATION_REUSE_BINDING');need(existing.phase==='QUOTED'&&!quoteExpired(existing),'QUOTE_EXPIRED');return freeze(clone(existing.quote));}need(!rows.some(row=>accountKey(row.quote.account)===accountKey(own)&&pending(row)),'ACCOUNT_PENDING');need(rows.length<512,'JOURNAL_CAPACITY');await selected.adapter.identify(signal);const prepared=await selected.adapter.prepare(own,recipient,amountAtomic,signal);signalCurrent(signal);validateNativeSendReviewV1(own,prepared.transaction,recipient,amountAtomic,prepared.feeAtomic);const issuedAt=Date.now(),body={profile:'NATIVE_WALLET_SEND_QUOTE_V1',id,networkId:own.networkId,network:selected.config.network,account:own,recipient,amountAtomic,fee:{assetSymbol:selected.config.network.symbol,maximumAtomic:prepared.feeAtomic},transaction:prepared.transaction,issuedAt,expiresAt:issuedAt+120000},quote=byteSize({...body,quoteSHA256:nativeJsonHashV1(body)});await saveRow({quote,quoteClock:{bootId,deadlineNs:(process.hrtime.bigint()+TTL_NS).toString()},phase:'QUOTED',nativeId:null,rawTransaction:null,errorCode:null,observation:null},null);return freeze(clone(quote));});
  },
  async broadcast(raw,signal){exact(raw,['quoteId','rawTransaction'],['networkId']);const initial=quoted(raw.quoteId);need(initial,'QUOTE_NOT_FOUND');return serialized(initial.quote.account,async()=>{let row=quoted(raw.quoteId),before=clone(row);need(raw.networkId===undefined||raw.networkId===row.quote.networkId,'NETWORK_BINDING');need(row.phase!=='CANCELLED','QUOTE_CANCELLED');const selected=pick(row.quote.networkId),signed=validateNativeWalletSignedTransactionV1(row.quote.account,row.quote.transaction,raw.rawTransaction);if(row.rawTransaction!==null){need(signed.id===row.nativeId&&signed.rawTransaction===row.rawTransaction,'SIGNED_TRANSACTION_CHANGED');const status=await observeRow(row,selected,signal);await saveRow(row,before);return status;}signalCurrent(signal);need(!quoteExpired(row),'QUOTE_EXPIRED');await selected.adapter.identify(signal);await selected.adapter.beforeBroadcast(row.quote,signal);need(!quoteExpired(row),'QUOTE_EXPIRED');signalCurrent(signal);
    row.rawTransaction=signed.rawTransaction;row.nativeId=signed.id;row.phase='SIGNED';await saveRow(row,before);before=clone(row);
    // Persist attempted disposition before the only network POST. A crash or
    // timeout from here is UNKNOWN; retry only observes these exact bytes/ID.
    row.phase='SUBMITTING';await saveRow(row,before);before=clone(row);try{const id=await selected.adapter.broadcast(row.rawTransaction,signal);need(id===row.nativeId,'BROADCAST_ID');row.phase='SUBMITTED';row.errorCode=null;}catch(error){row.phase='UNKNOWN';row.errorCode=writeCode(error);}await saveRow(row,before);return result(row);});
  },
  async transactionStatus(raw,signal){exact(raw,['id'],['networkId']);const initial=indexed(raw.id,raw.networkId);need(initial,'TRANSACTION_NOT_FOUND');return serialized(initial.quote.account,async()=>{signalCurrent(signal);const row=indexed(raw.id,raw.networkId),before=clone(row);if(row.rawTransaction===null||row.observation?.terminal===true)return result(row);const status=await observeRow(row,pick(row.quote.networkId),signal);await saveRow(row,before);return status;});},
  async cancelQuote(raw,signal){exact(raw,['id'],['networkId']);const initial=quoted(raw.id);need(initial,'QUOTE_NOT_FOUND');return serialized(initial.quote.account,async()=>{signalCurrent(signal);const row=quoted(raw.id),before=clone(row);need(raw.networkId===undefined||raw.networkId===row.quote.networkId,'NETWORK_BINDING');if(row.phase==='CANCELLED')return result(row);need(row.phase==='QUOTED'&&row.rawTransaction===null&&row.nativeId===null,'SIGNED_CANNOT_CANCEL');row.phase='CANCELLED';row.errorCode='NATIVE_WALLET_QUOTE_CANCELLED';await saveRow(row,before);return result(row);});},
  readAccount(raw,signal){return gateway.balances(raw,signal);},
  submitSigned(raw,signal){return gateway.broadcast(raw,signal);},
  observeTransfer(id,signal){return gateway.transactionStatus(typeof id==='string'?{id}:id,signal);},
  readOperationSummaries(){need(!closing,'CLOSED');return freeze(indexedRows().map(row=>({...result(row),createdAt:row.quote.issuedAt})));},
  async close(){if(closeWork)return closeWork;closing=true;return closeWork=(async()=>{await Promise.allSettled([...active]);await commitQueue;await journal.close();})();},
 });return gateway;
}
export const createNativeWalletServiceV1=createNativeWalletGatewayV1;
