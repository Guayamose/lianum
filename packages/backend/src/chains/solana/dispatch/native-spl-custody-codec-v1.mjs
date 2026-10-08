/** NEW SPL custody byte contracts. These pure helpers confer no owned runtime,
 * certified facts, source registration, private note credit or send authority. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {base58Decode,base58Encode} from '../runtime/solana-base58.mjs';
import {JUPITER_ORCA_V1,encodeJupiterOrcaRouteDataV1,decodeJupiterSplTokenAccountV1} from './jupiter-orca-route-codec-v1.mjs';
import {exactRecord,bytes32} from '../../../execution/encoding/commitments.mjs';
import {claimFrame,claimActionFrame,claimBackingFrame,CLAIM_ACTION_FIELDS,CLAIM_BACKING_FIELDS} from '../../../claims/authorization/permits.mjs';
import {claimUint,claimTicketSecret} from '../../../claims/protocol/framing.mjs';
import {receiptKeyCommitment} from '../../shared/dispatch/native-receipt-binding.mjs';
import {cloneInput} from '../../../execution/account/preparation/readiness-inputs.mjs';
import {normalizeNativeQuorumRegistry,nativeQuorumRegistryCommitment} from '../../../../../engine/src/evidence/native-quorum.mjs';
export const NATIVE_SPL_CUSTODY_V1=Object.freeze({version:1,program:'5RnJjhp7NKPgawoXnPJiXJtjJ5ktkMUrRuBtP4YmLSUM',mint:JUPITER_ORCA_V1.usdcMint,
 tokenProgram:JUPITER_ORCA_V1.tokenProgram,memo:'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',compute:'ComputeBudget111111111111111111111111111111',system:'11111111111111111111111111111111',instructions:'Sysvar1nstructions1111111111111111111111111',
 configBytes:610,depositBytes:128,ticketBytes:192,principalUnit:'SPL_USDC_BASE_UNIT',feeUnit:'SOL_LAMPORT',maximumAmount:'9007199254740991'});
export const NATIVE_SPL_CUSTODY_SOURCE_REVIEW_V1=null;
export const NATIVE_SPL_CUSTODY_COMPILED_RELEASE_V1=null;
const b32=value=>Buffer.from(bytes32(value,true),'hex');
const pk=value=>{assert.equal(typeof value,'string');return base58Decode(value,32);};
const uint=(value,width=8)=>Buffer.from(claimUint(value,width*8).toString(16).padStart(width*2,'0'),'hex');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fields=(row,schema)=>schema.map(([name,type])=>type==='b32'?b32(row[name]):typeof type==='number'?(type===32?Buffer.from(bytes32(row[name]),'hex'):uint(row[name],type)):uint(row[name],Number(type.slice(1))/8));
const prefix=(op,data)=>Buffer.concat([Buffer.from([1,op]),data]);
const amount=value=>{const n=claimUint(value);assert.ok(n>0n&&n<=BigInt(NATIVE_SPL_CUSTODY_V1.maximumAmount),'SPL_SAFE_PRINCIPAL');return n;};
export function nativeSplAssetCommitmentV1(input){input=cloneInput(input);exactRecord(input,['genesis','config','vault']);const p=NATIVE_SPL_CUSTODY_V1;return sha(claimFrame('LIANUM/PAEG/native-spl-asset/1',[b32(input.genesis),pk(p.mint),pk(p.tokenProgram),pk(p.program),pk(input.config),pk(input.vault)]));}
export function encodeNativeSplInitializeV1(input){input=cloneInput(input);
 exactRecord(input,['instance','genesis','config','vault','asset','claimDomain','custodyInventoryDomain','nativeChainDomain','registry']);
 assert.equal(input.asset,nativeSplAssetCommitmentV1({genesis:input.genesis,config:input.config,vault:input.vault}),'SPL_MINT_PROGRAM_VAULT_ASSET');const r=normalizeNativeQuorumRegistry(input.registry);
 const raw=Buffer.concat([b32(input.instance),b32(input.genesis),b32(input.asset),b32(input.claimDomain),b32(input.custodyInventoryDomain),b32(input.nativeChainDomain),
  b32(nativeQuorumRegistryCommitment(r)),b32(r.hubDomain),uint(r.registryEpoch),b32(r.rulesRoot),...r.keys.map(k=>Buffer.from(k.x+k.y,'hex'))]);
 assert.equal(raw.length,552);return prefix(0,raw);
}
export function encodeNativeSplSwapDepositV1(input){input=cloneInput(input);exactRecord(input,['wireKeyCommitment','amount','quotedOutput']);amount(input.amount);assert.ok(claimUint(input.quotedOutput)>=BigInt(input.amount));encodeJupiterOrcaRouteDataV1(input.quotedOutput);return prefix(1,Buffer.concat([b32(input.wireKeyCommitment),uint(input.amount),uint(input.quotedOutput)]));}
function action(input,domain){claimActionFrame(domain,input);assert.equal(input.action,'6','SPL_ORIGINAL_BEGIN_PAYOUT');amount(input.amount);assert.ok(claimUint(input.revision)>0n);return Buffer.concat(fields(input,CLAIM_ACTION_FIELDS));}
export function encodeNativeSplAuthorizeV1(input){input=cloneInput(input);
 exactRecord(input,['claimDomain','action','permit']);exactRecord(input.permit,['message','indexes','signatures']);const p=input.permit;
 const rawAction=action(input.action,input.claimDomain);const frame=claimBackingFrame(p.message);assert.equal(p.message.claimDomain,input.claimDomain);assert.equal(p.message.actionDigest,sha(claimActionFrame(input.claimDomain,input.action)),'SPL_ORIGINAL_ACTION_BINDING');
 assert.equal(p.message.expectedClaimSequence,input.action.claimSequence);assert.equal(p.message.hubStateSequence,input.action.hubSequence);
 assert.equal(p.message.unknownExposure,'0','SPL_UNKNOWN_PRINCIPAL_FENCE');
 assert.ok(Array.isArray(p.indexes)&&p.indexes.length===3&&p.indexes.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&v<4&&(i===0||p.indexes[i-1]<v)),'SPL_ORIGINAL_QUORUM_INDEXES');
 assert.ok(Array.isArray(p.signatures)&&p.signatures.length===3);const signatures=p.signatures.map(value=>{assert.match(value,/^[0-9a-f]{128}$/);return Buffer.from(value,'hex');});
 assert.ok(frame.length>480);const data=Buffer.concat([rawAction,Buffer.concat(fields(p.message,CLAIM_BACKING_FIELDS)),Buffer.from(p.indexes),...signatures]);assert.equal(data.length,876);return prefix(2,data);
}
export function encodeNativeSplDeliveryV1(input){input=cloneInput(input);exactRecord(input,['claimDomain','action','destinationSalt']);return prefix(3,Buffer.concat([action(input.action,input.claimDomain),Buffer.from(bytes32(input.destinationSalt),'hex')]));}
function compact(n){assert.ok(Number.isSafeInteger(n)&&n>=0&&n<65536);const bytes=[];do{let b=n&127;n>>>=7;if(n)b|=128;bytes.push(b);}while(n);return Buffer.from(bytes);}
function message(payer,blockhash,instructions){
 const map=new Map([[payer,{pubkey:payer,writable:true,signer:true}]]);
 for(const row of instructions){for(const item of row.accounts){pk(item.pubkey);const old=map.get(item.pubkey);map.set(item.pubkey,{pubkey:item.pubkey,writable:item.writable||old?.writable===true,signer:item.signer||old?.signer===true});}if(!map.has(row.program))map.set(row.program,{pubkey:row.program,writable:false,signer:false});}
 const keys=[...map.values()].sort((a,b)=>Number(b.signer)-Number(a.signer)||Number(b.writable)-Number(a.writable));assert.equal(keys.filter(k=>k.signer).length,1);assert.equal(keys[0].pubkey,payer);
 const indexes=new Map(keys.map((v,i)=>[v.pubkey,i]));const bytes=Buffer.concat([Buffer.from([1,0,keys.filter(k=>!k.signer&&!k.writable).length]),compact(keys.length),...keys.map(k=>pk(k.pubkey)),pk(blockhash),compact(instructions.length),...instructions.flatMap(row=>[Buffer.from([indexes.get(row.program)]),compact(row.accounts.length),Buffer.from(row.accounts.map(k=>indexes.get(k.pubkey))),compact(row.data.length),row.data])]);
 assert.ok(bytes.length+65<=1232,'SPL_ORIGINAL_NATIVE_WIRE_LIMIT');return {message:bytes,messageSHA256:sha(bytes),keys:keys.map(k=>k.pubkey)};
}
const meta=(pubkey,writable=false,signer=false)=>({pubkey,writable,signer});
function effectInstructions(accounts,data,K){const p=NATIVE_SPL_CUSTODY_V1;return [{program:p.program,accounts,data},{program:p.memo,accounts:[],data:Buffer.from('LNRB1:'+bytes32(K,true),'ascii')},{program:p.compute,accounts:[],data:Buffer.from([2,128,26,6,0])}];}
export function encodeNativeSplSwapMessageV1(input){input=cloneInput(input);
 exactRecord(input,['payer','config','vault','receipt','source','refund','blockhash','wireKeyCommitment','amount','quotedOutput']);const p=NATIVE_SPL_CUSTODY_V1,j=JUPITER_ORCA_V1;
 assert.equal(new Set(['payer','config','vault','receipt','source','refund'].map(k=>input[k])).size,6,'SPL_DISTINCT_PROFILE_ACCOUNTS');
 const accounts=[meta(input.payer,true,true),meta(input.config,true),meta(input.vault,true),meta(input.receipt,true),meta(input.source,true),meta(input.refund,true),meta(p.mint),meta(p.tokenProgram),meta(p.system),meta(p.instructions),meta(j.program),meta(j.eventAuthority),meta(j.dex),meta(j.pool,true),meta(j.authority),meta(j.reserveSol,true),meta(j.reserveUsdc,true),meta(j.poolMint,true),meta(j.poolFee,true)];
 const data=encodeNativeSplSwapDepositV1({wireKeyCommitment:input.wireKeyCommitment,amount:input.amount,quotedOutput:input.quotedOutput});return message(input.payer,input.blockhash,effectInstructions(accounts,data,input.wireKeyCommitment));
}
export function encodeNativeSplAuthorizeMessageV1(input){input=cloneInput(input);
 exactRecord(input,['payer','config','vault','ticket','blockhash','claimDomain','action','permit']);const p=NATIVE_SPL_CUSTODY_V1;return message(input.payer,input.blockhash,[{program:p.program,accounts:[meta(input.payer,true,true),meta(input.config,true),meta(input.vault),meta(input.ticket,true),meta(p.system)],data:encodeNativeSplAuthorizeV1({claimDomain:input.claimDomain,action:input.action,permit:input.permit})}]);
}
export function encodeNativeSplDeliveryMessageV1(input){input=cloneInput(input);
 exactRecord(input,['payer','config','vault','ticket','destination','blockhash','claimDomain','ledgerNamespace','action','destinationSalt']);const p=NATIVE_SPL_CUSTODY_V1;
 assert.notEqual(input.destination,input.vault);return message(input.payer,input.blockhash,effectInstructions([meta(input.payer,true,true),meta(input.config,true),meta(input.vault,true),meta(input.ticket,true),meta(input.destination,true),meta(p.tokenProgram),meta(p.mint),meta(p.instructions)],encodeNativeSplDeliveryV1({claimDomain:input.claimDomain,action:input.action,destinationSalt:input.destinationSalt}),nativeSplOriginalPayoutKeyV1({claimDomain:input.claimDomain,ledgerNamespace:input.ledgerNamespace,ticketId:input.action.operationId})));
}
export function validateNativeSplExactSignedWireV1(nativeWire,encoded,payer){
 assert.equal(typeof nativeWire,'string');const raw=Buffer.from(nativeWire,'base64');assert.equal(raw.toString('base64'),nativeWire);assert.ok(raw.length<=1232&&raw[0]===1&&raw.subarray(65).equals(encoded.message));
 const pub=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),pk(payer)]),type:'spki',format:'der'});assert.equal(verify(null,encoded.message,pub,raw.subarray(1,65)),true,'SPL_ORIGINAL_ED25519_SIGNATURE');return {signature:base58Encode(raw.subarray(1,65)),transactionSHA256:sha(raw),messageSHA256:sha(encoded.message)};
}
/** Typed principal; never substitutes token units for lamports. Ownership, PDA
 * derivation, executable ELF and canonical slot must be established by the
 * original owned runtime before any source can attest this pure observation. */
export function decodeNativeSplInventoryV1(input){input=cloneInput(input);
 exactRecord(input,['config','vault','configOwner','vaultOwner','configData','vaultData','feeLamports','feeRentMinimum','tickets']);const p=NATIVE_SPL_CUSTODY_V1;
 assert.equal(input.configOwner,p.program);assert.equal(input.vaultOwner,p.tokenProgram);assert.match(input.configData,/^[0-9a-f]{1220}$/);assert.match(input.vaultData,/^[0-9a-f]{330}$/);const c=Buffer.from(input.configData,'hex');assert.equal(c.length,p.configBytes);assert.equal(c.subarray(0,8).toString('ascii'),'LNSPL001');
 const t=decodeJupiterSplTokenAccountV1(Buffer.from(input.vaultData,'hex'));assert.equal(t.mint,p.mint);assert.equal(t.owner,input.config);assert.equal(t.delegateOption,0);assert.equal(t.delegatedAmount,'0');assert.equal(t.closeAuthorityOption,0);assert.equal(t.nativeRent,null);
 assert.equal(c.subarray(104,136).toString('hex'),nativeSplAssetCommitmentV1({genesis:c.subarray(72,104).toString('hex'),config:input.config,vault:input.vault}),'SPL_CONFIG_MINT_PROGRAM_VAULT_ASSET');
 const derived=deriveNativeSplConfigurationV1({payer:base58Encode(c.subarray(8,40)),instance:c.subarray(40,72).toString('hex')});assert.equal(derived.config.address,input.config);assert.equal(derived.vault.address,input.vault);assert.equal(derived.config.bump,c[608]);assert.equal(derived.vault.bump,c[609]);
 const principal=c.readBigUInt64BE(592).toString(),reserved=c.readBigUInt64BE(600);assert.equal(principal,t.amount,'SPL_OBSERVED_PRINCIPAL_BACKING');assert.ok(reserved<=BigInt(principal),'SPL_AUTHORIZED_PRINCIPAL_OVERALLOCATED');
 assert.ok(Array.isArray(input.tickets)&&input.tickets.length<=32,'SPL_COMPLETE_TICKET_BOUND');let liveReserved=0n;const addresses=new Set(),operations=new Set();
 for(const row of input.tickets){exactRecord(row,['address','owner','data']);pk(row.address);assert.equal(row.owner,p.program);assert.match(row.data,/^[0-9a-f]{384}$/);const raw=Buffer.from(row.data,'hex');
  assert.equal(raw.subarray(0,8).toString('ascii'),'LNSPT001');assert.ok(raw.subarray(8,40).equals(pk(input.config)),'SPL_TICKET_ORIGINAL_CONFIG');
  const operation=bytes32(raw.subarray(40,72).toString('hex'),true);assert.equal(deriveNativeSplTicketV1({config:input.config,operationId:operation}).address,row.address,'SPL_TICKET_FIXED_PDA');assert.ok(!addresses.has(row.address)&&!operations.has(operation),'SPL_DUPLICATE_TICKET');addresses.add(row.address);operations.add(operation);
  const amount=raw.readBigUInt64BE(120);assert.ok(amount>0n&&amount<=BigInt(p.maximumAmount),'SPL_TICKET_PRINCIPAL');assert.ok(raw[160]===0||raw[160]===1,'SPL_TICKET_STATE');
  if(raw[160]===0)liveReserved+=amount;
 }
 assert.equal(liveReserved,reserved,'SPL_COMPLETE_RESERVED_TICKET_PRINCIPAL');const fees=claimUint(input.feeLamports),rent=claimUint(input.feeRentMinimum);assert.ok(fees>=rent);
 return Object.freeze({nativePrincipalAvailable:principal,nativePrincipalReserved:reserved.toString(),nativePrincipalFree:(BigInt(principal)-reserved).toString(),principalUnit:p.principalUnit,feeReserveAvailable:(fees-rent).toString(),feeUnit:p.feeUnit,feeRentMinimum:rent.toString(),nativeAsset:c.subarray(104,136).toString('hex'),claimDomain:c.subarray(136,168).toString('hex'),custodyInventoryDomain:c.subarray(168,200).toString('hex'),privateCreditEstablished:false});
}

export const NATIVE_SPL_CLAIM_INTENT_PROFILE_V1='LIANUM_NATIVE_SPL_CLAIM_INTENT_V1';
/** Fixed PDA seeds, matching solana-pubkey 2.4.0/curve25519-dalek 4.1.3.
 * Mathematical derivation is not observation of a deployed account. */
const P25519=(1n<<255n)-19n,mod25519=n=>((n%P25519)+P25519)%P25519;
function power25519(base,exp){let value=1n;base=mod25519(base);for(;exp>0n;exp>>=1n,base=base*base%P25519)if(exp&1n)value=value*base%P25519;return value;}
const EDWARDS_D=mod25519(-121665n*power25519(121666n,P25519-2n));
function dalekDecompressible(bytes){
 const raw=Buffer.from(bytes);assert.equal(raw.length,32);raw[31]&=127;
 const y=mod25519(BigInt('0x'+Buffer.from(raw).reverse().toString('hex'))),yy=y*y%P25519;
 const numerator=mod25519(yy-1n),denominator=mod25519(EDWARDS_D*yy+1n);
 if(denominator===0n)return numerator===0n;
 const ratio=numerator*power25519(denominator,P25519-2n)%P25519;
 return ratio===0n||power25519(ratio,(P25519-1n)/2n)===1n;
}
function fixedPda(seeds,program=NATIVE_SPL_CUSTODY_V1.program){
 assert.ok(seeds.length<16&&seeds.every(b=>Buffer.isBuffer(b)&&b.length<=32));
 for(let bump=255;bump>=0;bump--){const bytes=createHash('sha256').update(Buffer.concat([...seeds,Buffer.from([bump]),pk(program),Buffer.from('ProgramDerivedAddress')])).digest();
  if(!dalekDecompressible(bytes))return Object.freeze({address:base58Encode(bytes),endpoint:bytes.toString('hex'),bump});}
 assert.fail('SPL_FIXED_PDA_NOT_FOUND');
}
export function deriveNativeSplProgramDataV1(){assert.equal(arguments.length,0);return fixedPda([pk(NATIVE_SPL_CUSTODY_V1.program)],'BPFLoaderUpgradeab1e11111111111111111111111');}
export function deriveNativeSplConfigurationV1(input){input=cloneInput(input);exactRecord(input,['payer','instance']);
 const config=fixedPda([Buffer.from('spl-config'),pk(input.payer),b32(input.instance)]),vault=fixedPda([Buffer.from('spl-vault'),pk(config.address)]);return Object.freeze({config,vault});}
export function deriveNativeSplDepositV1(input){input=cloneInput(input);exactRecord(input,['config','wireKeyCommitment']);return fixedPda([Buffer.from('spl-deposit'),pk(input.config),b32(input.wireKeyCommitment)]);}
export function deriveNativeSplTicketV1(input){input=cloneInput(input);exactRecord(input,['config','operationId']);return fixedPda([Buffer.from('spl-payout'),pk(input.config),b32(input.operationId)]);}
export function encodeNativeSplInitializeMessageV1(input){input=cloneInput(input);exactRecord(input,['payer','blockhash','initialization']);
 const i=input.initialization,p=NATIVE_SPL_CUSTODY_V1,derived=deriveNativeSplConfigurationV1({payer:input.payer,instance:i.instance});assert.equal(i.config,derived.config.address);assert.equal(i.vault,derived.vault.address);
 return message(input.payer,input.blockhash,[{program:p.program,accounts:[meta(input.payer,true,true),meta(i.config,true),meta(i.vault,true),meta(p.mint),meta(p.tokenProgram),meta(p.system)],data:encodeNativeSplInitializeV1(i)}]);}
/** Only the fixed SOURCE amount is wrapped, with the same original recipient's
 * signature. There is no transfer from a pre-funded WSOL fixture. */
export function encodeNativeSplSourceWrapMessageV1(input){input=cloneInput(input);exactRecord(input,['payer','source','blockhash']);const data=Buffer.alloc(12);data.writeUInt32LE(2);data.writeBigUInt64LE(BigInt(JUPITER_ORCA_V1.amount),4);
 return message(input.payer,input.blockhash,[{program:NATIVE_SPL_CUSTODY_V1.system,accounts:[meta(input.payer,true,true),meta(input.source,true)],data},
  {program:NATIVE_SPL_CUSTODY_V1.tokenProgram,accounts:[meta(input.source,true)],data:Buffer.from([17])}]);}
function claimEncoding(raw){
 const i=cloneInput(raw),deposit=i.operation==='deposit';
 const common=['profile','operation','payerPublicKey','sourcePublicKey','recipientPublicKey','recentBlockhash','configPublicKey','vaultPublicKey','claimDomain','ledgerNamespace','amount','wireKeyCommitment'];
 exactRecord(i,deposit?[...common,'receiptPublicKey','swapSourcePublicKey','refundPublicKey','quotedOutput']:[...common,'ticketPublicKey','action','destinationSalt']);
 assert.equal(i.profile,NATIVE_SPL_CLAIM_INTENT_PROFILE_V1);assert.ok(['deposit','refund','redeem'].includes(i.operation));amount(i.amount);bytes32(i.claimDomain,true);bytes32(i.wireKeyCommitment,true);
 const asKey=value=>base58Encode(Buffer.from(bytes32(value,true),'hex')),p=NATIVE_SPL_CUSTODY_V1;
 const fixed={payer:asKey(i.payerPublicKey),config:asKey(i.configPublicKey),vault:asKey(i.vaultPublicKey),blockhash:asKey(i.recentBlockhash)};
 let encoded;
 if(deposit){
  assert.equal(i.recipientPublicKey,i.vaultPublicKey,'SPL_DEPOSIT_ORIGINAL_VAULT');assert.equal(i.sourcePublicKey,i.refundPublicKey,'SPL_DEPOSITOR_USDC_ENDPOINT');
  assert.notEqual(i.swapSourcePublicKey,i.sourcePublicKey,'SPL_WSOL_NOT_USDC_PRINCIPAL');const receipt=deriveNativeSplDepositV1({config:fixed.config,wireKeyCommitment:i.wireKeyCommitment});assert.equal(receipt.endpoint,i.receiptPublicKey);
  encoded=encodeNativeSplSwapMessageV1({...fixed,receipt:receipt.address,source:asKey(i.swapSourcePublicKey),refund:asKey(i.refundPublicKey),wireKeyCommitment:i.wireKeyCommitment,amount:i.amount,quotedOutput:i.quotedOutput});
 }else{
  assert.equal(i.sourcePublicKey,i.vaultPublicKey,'SPL_PAYOUT_ORIGINAL_VAULT');assert.equal(i.action.amount,i.amount);assert.equal(i.action.wireBindingCommitment,'0'.repeat(64),'SPL_ORIGINAL_EVM_BEGIN_K_ZERO');assert.equal(i.wireKeyCommitment,nativeSplOriginalPayoutKeyV1({claimDomain:i.claimDomain,ledgerNamespace:i.ledgerNamespace,ticketId:i.action.operationId}),'SPL_ORIGINAL_PAYOUT_K_DERIVATION');
  const ticket=deriveNativeSplTicketV1({config:fixed.config,operationId:i.action.operationId});assert.equal(ticket.endpoint,i.ticketPublicKey);
  encoded=encodeNativeSplDeliveryMessageV1({...fixed,ticket:ticket.address,destination:asKey(i.recipientPublicKey),claimDomain:i.claimDomain,ledgerNamespace:i.ledgerNamespace,action:i.action,destinationSalt:i.destinationSalt});
 }
 return {intent:i,encoded,payer:fixed.payer};
}
export function encodeNativeSplClaimUnsignedWireV1(raw){assert.equal(arguments.length,1);return claimEncoding(raw).encoded.message.toString('hex');}
/** Exact SPL wire branch of the ORIGINAL family-2/effect-0/Memo-1 tuple.
 * Does not accept System+Memo, grant source credit, or establish finality. */
export function validateNativeSplClaimBindingTransactionV1(nativeWire,raw){
 assert.equal(arguments.length,2);const {intent:i,encoded,payer}=claimEncoding(raw),checked=validateNativeSplExactSignedWireV1(nativeWire,encoded,payer);
 return Object.freeze({...checked,keys:Object.freeze([...encoded.keys]),signatureHex:base58Decode(checked.signature,64).toString('hex'),effectIndex:'0',wireBindingVersion:'1',wireBindingKind:'2',wireBindingPosition:'1',wireKeyCommitment:i.wireKeyCommitment,amount:i.amount,principalUnit:NATIVE_SPL_CUSTODY_V1.principalUnit});
}

/** Exact original deterministic opening; not a new ticket or authorization. */
export function nativeSplOriginalPayoutKeyV1(input){assert.equal(arguments.length,1);input=cloneInput(input);exactRecord(input,['claimDomain','ledgerNamespace','ticketId']);return receiptKeyCommitment({ledgerNamespace:input.ledgerNamespace,secret:claimTicketSecret({claimDomain:input.claimDomain,ticketId:input.ticketId})});}
