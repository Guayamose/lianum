/** DATA accounting for an Original Source command, never a signing grant.
 * Reservations remain in the Source journal through restarts and epoch changes.
 * An unsigned or reverted attempt keeps its reservation until an Original
 * recovery transition proves it can be released. */
import {need} from '../../native-wallet/common-v1.mjs';

const FIELDS=['profile','collectionId','planSHA256','quoteRoot','id','ordinal','commitment','nullifier','amountAtomic','beneficiary','maximumFeeAtomic','maximumTotalFeeAtomic','collectBy'];
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)&&value!=='0'.repeat(64);
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value)<(1n<<256n);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function exact(value){
 need(value&&Object.getPrototypeOf(value)===Object.prototype&&same(Reflect.ownKeys(value).sort(),[...FIELDS].sort()),'SEPOLIA_EXECUTOR_PAYOUT_FIELDS');
 for(const key of FIELDS)need(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'),'SEPOLIA_EXECUTOR_PAYOUT_FIELDS');
}
export function readSepoliaExecutorPayoutTermsDataV5(command){
 if(!Object.hasOwn(command,'executorPayout'))return null;
 const p=command.executorPayout;exact(p);
 need(command.profile==='ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4'&&command.action==='WITHDRAW_OUTPUT_W39'&&command.value==='0','SEPOLIA_EXECUTOR_PAYOUT_COMMAND');
 need(p.profile==='ORIGINAL_PAGED_EXECUTOR_PAYOUT_COMMAND_V5','SEPOLIA_EXECUTOR_PAYOUT_PROFILE');
 for(const field of ['collectionId','planSHA256','quoteRoot','commitment','nullifier'])need(hash(p[field]),'SEPOLIA_EXECUTOR_PAYOUT_BINDING');
 need(typeof p.id==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(p.id),'SEPOLIA_EXECUTOR_PAYOUT_BINDING');
 for(const field of ['ordinal','amountAtomic','maximumFeeAtomic','maximumTotalFeeAtomic'])need(uint(p[field]),'SEPOLIA_EXECUTOR_PAYOUT_AMOUNT');
 need(BigInt(p.amountAtomic)>0n&&BigInt(p.maximumFeeAtomic)>0n&&BigInt(p.maximumTotalFeeAtomic)>=BigInt(p.maximumFeeAtomic),'SEPOLIA_EXECUTOR_PAYOUT_AMOUNT');
 need(typeof p.beneficiary==='string'&&/^0x[0-9a-f]{40}$/.test(p.beneficiary)&&p.beneficiary!=='0x'+'0'.repeat(40),'SEPOLIA_EXECUTOR_PAYOUT_BENEFICIARY');
 need(Number.isSafeInteger(p.collectBy)&&p.collectBy>0&&Number.isSafeInteger(command.expiresAt)&&command.expiresAt>0&&command.expiresAt<=p.collectBy,'SEPOLIA_EXECUTOR_PAYOUT_DEADLINE');
 return p;
}
const collectionTerms=(command,p)=>[command.identity,p.planSHA256,p.quoteRoot,p.maximumTotalFeeAtomic];
function add(groups,command,p,fee){
 let group=groups.get(p.collectionId);
 if(!group){group={terms:collectionTerms(command,p),reserved:0n,ids:new Set(),nullifiers:new Set()};groups.set(p.collectionId,group);}
 need(same(group.terms,collectionTerms(command,p)),'SEPOLIA_EXECUTOR_PAYOUT_COLLECTION_CHANGED');
 need(!group.ids.has(p.id)&&!group.nullifiers.has(p.nullifier),'SEPOLIA_EXECUTOR_PAYOUT_ALREADY_RESERVED');
 need(fee>=0n&&fee<=BigInt(p.maximumFeeAtomic),'SEPOLIA_EXECUTOR_PAYOUT_FEE_CEILING');
 group.ids.add(p.id);group.nullifiers.add(p.nullifier);group.reserved+=fee;
 need(group.reserved<=BigInt(p.maximumTotalFeeAtomic),'SEPOLIA_EXECUTOR_PAYOUT_TOTAL_FEE_CEILING');
}
function ledger(rows,feeOf){
 const groups=new Map();
 for(const row of rows){
  const p=readSepoliaExecutorPayoutTermsDataV5(row.command);if(!p)continue;
  need(['ORIGINAL_PAGED_SEPOLIA_SOURCE_ROW_V4','ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8'].includes(row.profile)&&row.transaction!==null,'SEPOLIA_EXECUTOR_PAYOUT_DURABLE_ROW');
  add(groups,row.command,p,feeOf(row.transaction));
 }
 return groups;
}
export function assertSepoliaExecutorPayoutHistoryDataV5(rows,feeOf){
 ledger(rows,feeOf);
}
export function assertSepoliaExecutorPayoutReservationDataV5(rows,command,transaction,feeOf,now=Date.now()){
 const p=readSepoliaExecutorPayoutTermsDataV5(command);if(!p)return;
 need(Number.isSafeInteger(now)&&now<command.expiresAt&&now<p.collectBy,'SEPOLIA_EXECUTOR_PAYOUT_EXPIRED');
 const groups=ledger(rows,feeOf);add(groups,command,p,feeOf(transaction));
}
