/** Separate ORIGINAL external-ERC20 source-note custody. These permissions
 * never carry NativeValue S, a native binding, or a Linux owner capability. */
import {normalizeMobileOrigin} from './authorization.mjs';
import {normalizeOriginalAccountSignatureV2} from './original-account-review-v2.mjs';
import {normalizeDeviceDepositWitnessV1} from './device-deposit-consent-v1.mjs';
import {normalizeDeviceExitWitnessV1,normalizeDeviceExitStatementV1} from './device-exit-consent-v1.mjs';
export const DEVICE_EXTERNAL_FLAT_NOTE_V1='LIANUM_DEVICE_EXTERNAL_FLAT_SOURCE_NOTE_V1';
export const DEVICE_EXTERNAL_FLAT_SHARE_V1='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1';
const profile=v=>v===DEVICE_EXTERNAL_FLAT_NOTE_V1||v===DEVICE_EXTERNAL_FLAT_SHARE_V1;
export const DEVICE_EXTERNAL_FLAT_OPENING_V1='ONE_ORIGINAL_OPENING_TO_FIXED_EPHEMERAL_WORKER';
const fail=()=>{throw Error('DEVICE_EXTERNAL_FLAT_DATA');};
export function externalFlatExactV1(raw,names){if(!raw||Object.getPrototypeOf(raw)!==Object.prototype||Reflect.ownKeys(raw).length!==names.length)fail();
 return Object.fromEntries(names.map(name=>{const d=Object.getOwnPropertyDescriptor(raw,name);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return[name,d.value];}));}
export function externalFlatHexV1(value,width=64){if(typeof value!=='string'||new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0]!==value)fail();return value;}
export function externalFlatUintV1(value){if(typeof value!=='string'||/^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0]!==value||BigInt(value)>=(1n<<64n))fail();return value;}
const integer=v=>{if(!Number.isSafeInteger(v)||v<0||Object.is(v,-0))fail();return v;};
const frozen=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(frozen);Object.freeze(v);}return v;};
const nonzero=v=>{externalFlatHexV1(v);if(v==='0'.repeat(64))fail();return v;};
export function normalizeExternalFlatPoolV1(raw){const v=externalFlatExactV1(raw,['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace']);
 for(const key of ['pool','asset','hub']){externalFlatHexV1(v[key],40);if(v[key]==='0'.repeat(40))fail();}for(const key of Object.keys(v).filter(k=>!['pool','asset','hub'].includes(k)))nonzero(v[key]);return frozen(v);}
export function normalizeExternalFlatDescriptorV1(raw){const v=externalFlatExactV1(raw,['profile','origin','pairingId','devicePublicKey','lifetime','poolTerms','assetMetadata']);
 if(!profile(v.profile))fail();normalizeMobileOrigin(v.origin);nonzero(v.pairingId);nonzero(v.lifetime);
 if(typeof v.devicePublicKey!=='string'||/^04[0-9a-f]{128}$/.exec(v.devicePublicKey)?.[0]!==v.devicePublicKey)fail();
 v.poolTerms=normalizeExternalFlatPoolV1(v.poolTerms);v.assetMetadata=externalFlatExactV1(v.assetMetadata,['kind','symbol','decimals']);
 if(v.assetMetadata.kind!=='ERC20'||!Number.isSafeInteger(v.assetMetadata.decimals)||v.assetMetadata.decimals<0||v.assetMetadata.decimals>18)fail();
 if(typeof v.assetMetadata.symbol!=='string'||/^[\x20-\x7e]{1,64}$/.exec(v.assetMetadata.symbol)?.[0]!==v.assetMetadata.symbol)fail();return frozen(v);}
export function normalizeExternalFlatAccessV1(raw){const v=externalFlatExactV1(raw,['profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt']);
 if(!profile(v.profile)||v.action!=='ACCESS')fail();normalizeMobileOrigin(v.origin);for(const k of ['pairingId','challengeId','nonce'])nonzero(v[k]);
 if(/^04[0-9a-f]{128}$/.exec(v.devicePublicKey)?.[0]!==v.devicePublicKey)fail();integer(v.expiresAt);return frozen(v);}
export function normalizeExternalFlatDepositStatementV1(raw){const v=externalFlatExactV1(raw,['scope','policy','epoch','amount','output']);for(const k of ['scope','policy','output'])nonzero(v[k]);externalFlatUintV1(v.epoch);externalFlatUintV1(v.amount);if(BigInt(v.amount)<=0n)fail();return frozen(v);}
export function normalizeExternalFlatIntentStatementV1(raw){const v=externalFlatExactV1(raw,['scope','policy','validFrom','validUntil','amount','output']);for(const k of ['scope','policy','output'])nonzero(v[k]);for(const k of ['validFrom','validUntil','amount'])externalFlatUintV1(v[k]);if(BigInt(v.validFrom)>=BigInt(v.validUntil)||BigInt(v.amount)<=0n)fail();return frozen(v);}
export function normalizeExternalFlatPathV1(raw){const v=externalFlatExactV1(raw,['root','index','leaf','siblings']);externalFlatHexV1(v.root);nonzero(v.leaf);integer(v.index);if(v.index>=64||!Array.isArray(v.siblings)||Object.getPrototypeOf(v.siblings)!==Array.prototype||v.siblings.length!==6||Reflect.ownKeys(v.siblings).length!==7)fail();v.siblings=Array.from({length:6},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v.siblings,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return externalFlatHexV1(d.value);});return frozen(v);}
export function normalizeExternalFlatConsentV1(raw){const v=externalFlatExactV1(raw,['profile','action','descriptor','challengeId','nonce','expiresAt','jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure']);
 if(!profile(v.profile)||!['PROVE_D26','FUND_D26','OBSERVE_D26','PROVE_D27','OBSERVE_D27','QUOTE_W39','PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(v.action))fail();
 v.descriptor=normalizeExternalFlatDescriptorV1(v.descriptor);for(const k of ['challengeId','nonce','jobId','depositJobId','rootId'])nonzero(v[k]);integer(v.expiresAt);integer(v.noteRevision);externalFlatHexV1(v.recipient,40);if(v.recipient==='0'.repeat(40)||v.recipient===v.descriptor.poolTerms.pool)fail();
 const intent=v.action.endsWith('D27'),deposit=v.action.endsWith('D26')||intent;
 if(v.profile!==v.descriptor.profile||intent&&v.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||v.action.endsWith('D26')&&v.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1)fail();
 v.statement=intent?normalizeExternalFlatIntentStatementV1(v.statement):deposit?normalizeExternalFlatDepositStatementV1(v.statement):normalizeDeviceExitStatementV1(v.statement);
 if(v.statement.scope!==v.descriptor.poolTerms.scope||v.statement.policy!==v.descriptor.poolTerms.policy)fail();
 if(deposit){if(v.jobId!==v.depositJobId||v.path!==null)fail();}else{v.path=normalizeExternalFlatPathV1(v.path);if(v.statement.recipient!==v.recipient||v.path.root!==v.statement.root||v.path.leaf!==v.statement.commitment)fail();}
 v.observed=externalFlatExactV1(v.observed,['blockNumber','blockHash','timestamp']);externalFlatUintV1(v.observed.blockNumber);externalFlatHexV1(v.observed.blockHash);externalFlatUintV1(v.observed.timestamp);
 if(['PROVE_D26','PROVE_D27','PROVE_W39'].includes(v.action)){nonzero(v.witnessSHA256);if(v.proofSHA256!==null||v.publicInputsSHA256!==null||v.openingDisclosure!==DEVICE_EXTERNAL_FLAT_OPENING_V1)fail();}
 else{if(v.openingDisclosure!==null)fail();if(v.action==='QUOTE_W39'){if(v.witnessSHA256!==null||v.proofSHA256!==null||v.publicInputsSHA256!==null)fail();}
  else{nonzero(v.witnessSHA256);nonzero(v.proofSHA256);nonzero(v.publicInputsSHA256);}}
 if(['PROVE_D26','PROVE_W39','FUND_D26','WITHDRAW_W39','QUOTE_W39'].includes(v.action)&&v.statement.epoch!==(BigInt(v.observed.timestamp)/600n).toString())fail();
 if(v.action==='PROVE_D27'&&(BigInt(v.observed.timestamp)<BigInt(v.statement.validFrom)||BigInt(v.observed.timestamp)>=BigInt(v.statement.validUntil)))fail();return frozen(v);}
function accessFrame(raw){const d=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'action'):null;if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value==='ACCESS';}
export function validateExternalFlatFreshV1(raw,now=Date.now()){const v=accessFrame(raw)?normalizeExternalFlatAccessV1(raw):normalizeExternalFlatConsentV1(raw);integer(now);if(v.expiresAt<=now||v.expiresAt>now+15000)fail();return v;}
/** A closed canonical JSON vocabulary inside a length-prefixed NEW domain.
 * No NativeValue permission or arbitrary message can be signed by this API. */
export function externalFlatPermissionMessageV1(raw){const v=accessFrame(raw)?normalizeExternalFlatAccessV1(raw):normalizeExternalFlatConsentV1(raw),text=JSON.stringify(v);
 const domain=new TextEncoder().encode(v.profile+'/permission/1'),body=new TextEncoder().encode(text);if(body.length>8192)fail();const out=new Uint8Array(8+domain.length+body.length),view=new DataView(out.buffer);view.setUint32(0,domain.length);out.set(domain,4);view.setUint32(4+domain.length,body.length);out.set(body,8+domain.length);return out;}
export function externalFlatWitnessV1(mode,raw){if(mode==='deposit_balance')return normalizeDeviceDepositWitnessV1(raw);if(mode==='withdraw_balance')return normalizeDeviceExitWitnessV1(raw);if(mode==='deposit_intent'){
 const v=externalFlatExactV1(raw,['scope','policy','valid_from','valid_until','amount','output','rho','key_x','key_y','secret','signature']);
 externalFlatUintV1(v.valid_from);externalFlatUintV1(v.valid_until);if(BigInt(v.valid_from)>=BigInt(v.valid_until))fail();
 const {valid_from,valid_until,...rest}=v,checked=normalizeDeviceDepositWitnessV1({...rest,epoch:valid_from});const {epoch,...fields}=checked;return {...fields,valid_from,valid_until};}fail();}
export function externalFlatWipeV1(value){if(value&&typeof value==='object')for(const k of Object.keys(value)){if(value[k]&&typeof value[k]==='object')externalFlatWipeV1(value[k]);value[k]=null;}}
export function externalFlatWitnessBytesV1(mode,raw){const v=externalFlatWitnessV1(mode,raw);try{const bytes=new TextEncoder().encode(JSON.stringify(v));if(bytes.length>8192)fail();return bytes;}finally{externalFlatWipeV1(v);}}
export const normalizeExternalFlatSignatureV1=normalizeOriginalAccountSignatureV2;
export function normalizeExternalFlatRowV1(raw){const r=externalFlatExactV1(raw,['profile','descriptor','jobId','mode','stage','consentFields','observation','errorCode']);
 if(!profile(r.profile)||!['deposit_balance','deposit_intent','withdraw_balance'].includes(r.mode)||!['PROVING','PROVED','FUNDING_UNKNOWN','DELIVERY_UNKNOWN','WITHDRAWAL_UNKNOWN','CONFIRMED'].includes(r.stage)||r.errorCode!==null)fail();
 r.descriptor=normalizeExternalFlatDescriptorV1(r.descriptor);nonzero(r.jobId);const c=r.consentFields=externalFlatExactV1(r.consentFields,['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256']);
 for(const k of ['jobId','depositJobId','rootId','witnessSHA256'])nonzero(c[k]);if(c.jobId!==r.jobId)fail();integer(c.noteRevision);externalFlatHexV1(c.recipient,40);if(c.recipient==='0'.repeat(40)||c.recipient===r.descriptor.poolTerms.pool)fail();
 const intent=r.mode==='deposit_intent',deposit=r.mode!=='withdraw_balance';
 if(r.profile!==r.descriptor.profile||intent&&r.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||r.mode==='deposit_balance'&&r.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1)fail();
 c.statement=intent?normalizeExternalFlatIntentStatementV1(c.statement):deposit?normalizeExternalFlatDepositStatementV1(c.statement):normalizeDeviceExitStatementV1(c.statement);if(c.statement.scope!==r.descriptor.poolTerms.scope||c.statement.policy!==r.descriptor.poolTerms.policy)fail();
 if(deposit){if(c.depositJobId!==r.jobId||c.path!==null||r.stage==='WITHDRAWAL_UNKNOWN'||r.stage===(intent?'FUNDING_UNKNOWN':'DELIVERY_UNKNOWN'))fail();}else{if(c.depositJobId===r.jobId||['FUNDING_UNKNOWN','DELIVERY_UNKNOWN'].includes(r.stage))fail();c.path=normalizeExternalFlatPathV1(c.path);if(c.path.leaf!==c.statement.commitment||c.path.root!==c.statement.root||c.statement.recipient!==c.recipient)fail();}
 if(r.stage==='PROVING'){if(c.proofSHA256!==null||c.publicInputsSHA256!==null)fail();}else{nonzero(c.proofSHA256);nonzero(c.publicInputsSHA256);}
 if(r.stage==='CONFIRMED'){const o=r.observation=externalFlatExactV1(r.observation,['profile','jobId','depositJobId','rootId','commitment','amount','recipient','proofSHA256','publicInputsSHA256','transactionHash','calldataSHA256','receiptBlockHash','observed','status','canonicalRpcVerifiedBy','mobileCanonicalRpcVerified']);
  for(const k of ['profile','jobId'])if(o[k]!==r[k])fail();for(const k of ['depositJobId','rootId','recipient','proofSHA256','publicInputsSHA256'])if(o[k]!==c[k])fail();
  if(o.commitment!==(deposit?c.statement.output:c.statement.commitment)||o.amount!==c.statement.amount||o.status!=='CONFIRMED'||o.canonicalRpcVerifiedBy!=='ORIGINAL_BACKEND_OBSERVER'||o.mobileCanonicalRpcVerified!==false)fail();
  for(const k of ['transactionHash','calldataSHA256','receiptBlockHash'])nonzero(o[k]);o.observed=normalizeExternalFlatObservedV1(o.observed);
 }else if(r.observation!==null)fail();return frozen(r);}
export function normalizeExternalFlatObservedV1(raw){const o=externalFlatExactV1(raw,['blockNumber','blockHash','timestamp']);externalFlatUintV1(o.blockNumber);nonzero(o.blockHash);externalFlatUintV1(o.timestamp);return frozen(o);}
export function normalizeExternalFlatStatusV1(raw){const descriptorField=raw&&typeof raw==='object'?Object.getOwnPropertyDescriptor(raw,'descriptor'):null;if(!descriptorField?.enumerable||!Object.hasOwn(descriptorField,'value'))fail();const descriptor=normalizeExternalFlatDescriptorV1(descriptorField.value),share=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1,claimed=!share&&Object.hasOwn(raw,'graphClaimed'),hasNote=share||Object.hasOwn(raw,'note');const s=externalFlatExactV1(raw,['descriptor','jobs','observed','observedAt','expiresAt',...(hasNote?['note']:[]),...(claimed?['graphClaimed']:[])]);if(!share){if(claimed&&typeof s.graphClaimed!=='boolean')fail();s.graphClaimed=claimed?s.graphClaimed:false;}s.descriptor=normalizeExternalFlatDescriptorV1(s.descriptor);s.observed=normalizeExternalFlatObservedV1(s.observed);integer(s.observedAt);integer(s.expiresAt);if(s.expiresAt!==s.observedAt+15000||!Array.isArray(s.jobs)||Object.getPrototypeOf(s.jobs)!==Array.prototype||s.jobs.length>2||Reflect.ownKeys(s.jobs).length!==s.jobs.length+1)fail();s.jobs=Array.from({length:s.jobs.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(s.jobs,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();const row=normalizeExternalFlatRowV1(d.value);if(JSON.stringify(row.descriptor)!==JSON.stringify(s.descriptor))fail();return row;});if(new Set(s.jobs.map(r=>r.jobId)).size!==s.jobs.length||new Set(s.jobs.map(r=>r.mode)).size!==s.jobs.length)fail();
 if(hasNote){const n=s.note=externalFlatExactV1(s.note,['state','commitment','available','backing']);if(!['UNISSUED','LIVE','SPENT','UNKNOWN'].includes(n.state))fail();if(n.commitment!==null)nonzero(n.commitment);
 const parent=s.jobs.find(r=>r.mode===(share?'deposit_intent':'deposit_balance'));if(n.commitment!==(parent?.consentFields.statement.output??null))fail();
 if(!share){if(n.state==='UNISSUED'&&parent||!parent&&n.state!=='UNISSUED'||n.state==='SPENT'&&parent?.stage!=='CONFIRMED')fail();if(n.state==='LIVE'&&(s.graphClaimed===true||s.jobs.some(r=>r.mode==='withdraw_balance'&&r.stage!=='CONFIRMED')))fail();}
 if(n.state==='LIVE'){if(parent?.stage!=='CONFIRMED'||n.available!==parent.consentFields.statement.amount)fail();externalFlatUintV1(n.available);const b=n.backing=externalFlatExactV1(n.backing,['held','liabilities','surplus','deficit']);Object.values(b).forEach(externalFlatUintV1);if(BigInt(b.held)<BigInt(b.liabilities)||b.deficit!=='0'||BigInt(b.surplus)!==BigInt(b.held)-BigInt(b.liabilities)||BigInt(n.available)>BigInt(b.held))fail();}
 else if(n.available!==null||n.backing!==null)fail();}return frozen(s);}
