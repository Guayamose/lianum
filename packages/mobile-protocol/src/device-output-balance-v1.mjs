/** Signed READ response only. A decoded value grants no spend, proof, actor or
 * local provenance. Each wallet must bind the two NF to its retained openings. */
import {normalizeMobileOrigin} from './authorization.mjs';
export const DEVICE_OUTPUT_BALANCE_V1='LIANUM_DEVICE_ORIGINAL_OUTPUT_BALANCE_V1';
const need=value=>{if(!value)throw Error('MOBILE_DEVICE_OUTPUT_BALANCE_INVALID');};
function exact(raw,names){need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  return Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));}
const hex=(value,width=64)=>{need(typeof value==='string'&&new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0]===value);return value;};
const u64=value=>{need(typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0]===value&&BigInt(value)<(1n<<64n));return value;};
function path(raw){const value=exact(raw,['root','index','leaf','siblings']);hex(value.root);hex(value.leaf);
  need(Number.isSafeInteger(value.index)&&value.index>=0&&value.index<64&&Array.isArray(value.siblings)
    &&Object.getPrototypeOf(value.siblings)===Array.prototype&&value.siblings.length===6&&Reflect.ownKeys(value.siblings).length===7);
  value.siblings=Array.from({length:6},(_,i)=>{const row=Object.getOwnPropertyDescriptor(value.siblings,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return hex(row.value);});return value;}
function note(raw,role){const value=exact(raw,['noteRole','commitment','nullifier','amount','state','path']);need(value.noteRole===role);
  hex(value.commitment);hex(value.nullifier);u64(value.amount);need(BigInt(value.amount)>0n&&value.commitment!=='0'.repeat(64)&&value.nullifier!=='0'.repeat(64));
  need(['UNSPENT','SPENT','LOCKED'].includes(value.state));
  if(value.state==='LOCKED')need(value.path===null);else{value.path=path(value.path);need(value.path.leaf===value.commitment);}return value;}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function normalizeDeviceOutputBalanceV1(raw){const value=exact(raw,['version','profile','origin','pairingId','devicePublicKey','parentJobId','rootId',
  'noteRevision','nativeBindingSHA256','reservationTransactionHash','assetId','pool','poolTerms','sourceNullifier','sourceNullifierSpent',
  'nativeOutcome','change','recovery','observed','expiresAt','authorizationSHA256']);
  need(value.version===1&&value.profile===DEVICE_OUTPUT_BALANCE_V1);normalizeMobileOrigin(value.origin);
  for(const name of ['pairingId','parentJobId','rootId','nativeBindingSHA256','reservationTransactionHash','assetId','sourceNullifier','authorizationSHA256']){
    hex(value[name]);need(value[name]!=='0'.repeat(64));}hex(value.pool,40);
  need(/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey&&value.sourceNullifierSpent===true
    &&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0
    &&[null,'FULFILLED','RECOVERED'].includes(value.nativeOutcome));
  value.poolTerms=exact(value.poolTerms,['scope','policy','codeHash','assetIdentity','domainCommitment']);Object.values(value.poolTerms).forEach(value=>hex(value));
  value.observed=exact(value.observed,['blockNumber','blockHash','timestamp']);u64(value.observed.blockNumber);hex(value.observed.blockHash);u64(value.observed.timestamp);
  value.change=note(value.change,'change');value.recovery=note(value.recovery,'recovery');
  need(new Set([value.sourceNullifier,value.change.nullifier,value.recovery.nullifier]).size===3
    &&value.change.commitment!==value.recovery.commitment);
  // An invalidated original F publishes no spendable path for either output.
  need(value.change.state!=='LOCKED'||value.nativeOutcome===null&&value.recovery.state==='LOCKED'
    &&value.change.path===null&&value.recovery.path===null);
  need((value.recovery.state==='LOCKED')===(value.nativeOutcome!=='RECOVERED'));
  if(value.recovery.path!==null)need(value.recovery.path.root===value.change.path.root);
  return freeze(value);}
export function validateDeviceOutputBalanceFreshV1(raw,now=Date.now()){const value=normalizeDeviceOutputBalanceV1(raw);
  need(Number.isSafeInteger(now)&&value.expiresAt>now&&value.expiresAt<=now+15000);return value;}
