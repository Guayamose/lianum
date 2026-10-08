/** Pure checks of original-bank bytes. Caller metadata is never native authority. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {base58Decode,base58Encode} from '../runtime/solana-base58.mjs';
import {NATIVE_SPL_CUSTODY_V1 as P,validateNativeSplClaimBindingTransactionV1} from '../dispatch/native-spl-custody-codec-v1.mjs';
import {JUPITER_ORCA_V1 as J,decodeJupiterSplTokenAccountV1,decodeJupiterSplMintV1,encodeJupiterOrcaRouteDataV1,quoteJupiterOrcaSolUsdcV1} from '../dispatch/jupiter-orca-route-codec-v1.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const n=x=>{assert.ok(Number.isSafeInteger(x)&&x>=0&&!Object.is(x,-0),'SPL_SAFE_RPC_INTEGER');return BigInt(x);};
const u=x=>{assert.equal(typeof x,'string');assert.match(x,/^(0|[1-9][0-9]*)$/);return BigInt(x);};
const b=x=>base58Encode(Buffer.from(x,'hex'));
/** Double reads, block membership, signature and exact wire all come from the
 * SAME owned validator in the runtime. This parser alone grants no provenance. */
export function validateNativeSplCanonicalWireV1(expected,raw){
 const {signature,nativeWire,keys,feeLamports,genesis}=expected;
 assert.equal(raw.genesis,genesis,'SPL_ORIGINAL_GENESIS');
 function one(status,tx,block,slot){
  assert.equal(status?.confirmationStatus,'finalized');assert.equal(status.err,null);assert.equal(tx?.meta?.err,null);
  assert.equal(n(status.slot),n(tx.slot));assert.ok(n(slot)>=n(tx.slot));assert.ok(n(block.parentSlot)<n(tx.slot));
  assert.deepEqual(tx.transaction,[nativeWire,'base64'],'SPL_FINALIZED_EXACT_WIRE');
  assert.ok(Array.isArray(block.signatures)&&new Set(block.signatures).size===block.signatures.length);assert.equal(block.signatures.filter(s=>s===signature).length,1);
  base58Decode(block.blockhash,32);base58Decode(block.previousBlockhash,32);
  assert.equal(n(tx.meta.fee).toString(),feeLamports,'SPL_ORIGINAL_QUOTED_FEE');
  for(const field of ['preBalances','postBalances']){assert.equal(tx.meta[field].length,keys.length);tx.meta[field].forEach(n);}
  assert.ok(!tx.meta.loadedAddresses||(tx.meta.loadedAddresses.writable.length===0&&tx.meta.loadedAddresses.readonly.length===0),'SPL_NO_LOOKUP_ACCOUNTS');
  return {slot:String(tx.slot),blockId:base58Decode(block.blockhash,32).toString('hex'),parent:String(block.parentSlot),fee:String(tx.meta.fee)};
 }
 const first=one(raw.status,raw.transaction,raw.block,raw.finalizedSlot),second=one(raw.statusAgain,raw.transactionAgain,raw.blockAgain,raw.finalizedSlotAgain);
 assert.deepEqual(second,first,'SPL_REPEATED_CANONICAL_HISTORY');assert.ok(n(raw.finalizedSlotAgain)>=n(raw.finalizedSlot),'SPL_FINALIZED_ROLLBACK');
 // Relevant consensus effects must remain byte-identical; float UI metadata is
 // deliberately excluded and is never converted into principal or fee units.
 for(const field of ['preBalances','postBalances','innerInstructions','preTokenBalances','postTokenBalances'])
  assert.deepEqual(raw.transactionAgain.meta[field],raw.transaction.meta[field],'SPL_REPEATED_EFFECT_CHANGED');
 return {transactionSlot:first.slot,parentSlot:first.parent,blockHeight:first.slot,blockId:first.blockId,observedSlot:String(raw.finalizedSlotAgain),feeLamports:first.fee};
}
function snapshots(rows,keys){
 assert.equal(rows.length,keys.length);const map=new Map();
 rows.forEach((row,index)=>{assert.equal(row.address,keys[index]);assert.ok(!map.has(row.address));
  if(row.account===null){map.set(row.address,null);return;}const a=row.account;
  assert.equal(typeof a.owner,'string');base58Decode(a.owner,32);assert.equal(typeof a.executable,'boolean');u(a.lamports);assert.match(a.data,/^(?:[0-9a-f]{2})*$/);
  map.set(row.address,{...a,bytes:Buffer.from(a.data,'hex')});});return map;
}
function token(map,address,mint,owner){const a=map.get(address);assert.ok(a&&!a.executable);assert.equal(a.owner,P.tokenProgram);const t=decodeJupiterSplTokenAccountV1(a.bytes);assert.equal(t.mint,mint);assert.equal(t.owner,owner);assert.equal(t.delegateOption,0);assert.equal(t.closeAuthorityOption,0);assert.equal(t.delegatedAmount,'0');return {...t,lamports:u(a.lamports)};}
function cpi(meta,keys){
 assert.equal(meta.innerInstructions?.length,1);const group=meta.innerInstructions[0];assert.equal(group.index,0);assert.ok(Array.isArray(group.instructions));
 return group.instructions.map(row=>{assert.ok(Number.isSafeInteger(row.programIdIndex)&&row.programIdIndex>=0&&row.programIdIndex<keys.length);assert.ok(Array.isArray(row.accounts));row.accounts.forEach(i=>assert.ok(Number.isSafeInteger(i)&&i>=0&&i<keys.length));
  assert.ok(Number.isSafeInteger(row.stackHeight)&&row.stackHeight>=2);return {program:keys[row.programIdIndex],accounts:row.accounts.map(i=>keys[i]),data:base58Decode(row.data),stack:row.stackHeight};});
}
function exactCpi(row,program,accounts,data,stack){assert.equal(row.program,program);assert.deepEqual(row.accounts,accounts);assert.equal(row.data.toString('hex'),data.toString('hex'));assert.equal(row.stack,stack);}
function checkedTransfer(amount){const raw=Buffer.alloc(10);raw[0]=12;raw.writeBigUInt64LE(amount,1);raw[9]=6;return raw;}
function oldTransfer(amount){const raw=Buffer.alloc(9);raw[0]=3;raw.writeBigUInt64LE(amount,1);return raw;}
function tokenBalances(meta,keys,before,after,addresses){
 for(const [field,state]of [['preTokenBalances',before],['postTokenBalances',after]]){
  const rows=meta[field];assert.ok(Array.isArray(rows));assert.equal(rows.length,addresses.length);
  const seen=new Set();for(const row of rows){const address=keys[row.accountIndex];assert.ok(addresses.includes(address)&&!seen.has(address));seen.add(address);const account=state.get(address);const t=decodeJupiterSplTokenAccountV1(account.bytes);assert.equal(row.mint,t.mint);assert.equal(row.owner,t.owner);assert.equal(row.programId,P.tokenProgram);assert.equal(row.uiTokenAmount.amount,t.amount);assert.equal(row.uiTokenAmount.decimals,t.mint===J.solMint?9:t.mint===P.mint?6:decodeJupiterSplMintV1(before.get(J.poolMint).bytes).decimals);}
 }
}
/** Exact principal/rent/CPI checks for SwapDeposit or one reserved delivery. */
export function validateNativeSplCustodyObservationV1(record,raw){
 const decoded=validateNativeSplClaimBindingTransactionV1(record.nativeWire,record.intent),i=record.intent,keys=decoded.keys;
 assert.equal(decoded.signatureHex,record.nativeId);assert.equal(decoded.transactionSHA256,record.transactionSHA256);
 const canonical=validateNativeSplCanonicalWireV1({signature:decoded.signature,nativeWire:record.nativeWire,keys,feeLamports:record.preparedFee,genesis:record.genesis},raw);
 assert.ok(n(raw.afterSlot)>=BigInt(canonical.transactionSlot));
 const before=snapshots(record.before,keys),after=snapshots(raw.after,keys),cfg=b(i.configPublicKey),vault=b(i.vaultPublicKey),payer=b(i.payerPublicKey);
 const cb=before.get(cfg),ca=after.get(cfg);assert.equal(cb?.owner,P.program);assert.equal(ca?.owner,P.program);assert.equal(cb.bytes.length,610);assert.equal(ca.bytes.length,610);
 assert.ok(cb.bytes.subarray(0,592).equals(ca.bytes.subarray(0,592))&&cb.bytes.subarray(608).equals(ca.bytes.subarray(608)),'SPL_CONFIG_IMMUTABLE_BYTES');
 const principal=cb.bytes.readBigUInt64BE(592),reserved=cb.bytes.readBigUInt64BE(600),principalAfter=ca.bytes.readBigUInt64BE(592),reservedAfter=ca.bytes.readBigUInt64BE(600),q=u(i.amount);
 const vb=token(before,vault,P.mint,cfg),va=token(after,vault,P.mint,cfg);assert.equal(vb.amount,principal.toString());assert.equal(va.amount,principalAfter.toString());
 const meta=raw.transaction.meta,inner=cpi(meta,keys),changed=new Set([payer,cfg,vault]);let spent=0n,received=0n,surplus=0n,lpMinted=0n,rent=0n;
 if(i.operation==='deposit'){
  const source=b(i.swapSourcePublicKey),refund=b(i.refundPublicKey),receipt=b(i.receiptPublicKey);changed.add(source);changed.add(refund);changed.add(receipt);
  [J.reserveSol,J.reserveUsdc,J.poolMint,J.poolFee].forEach(k=>changed.add(k));
  const sb=token(before,source,J.solMint,payer),sa=token(after,source,J.solMint,payer),rb=token(before,refund,P.mint,payer),ra=token(after,refund,P.mint,payer),resB=token(before,J.reserveSol,J.solMint,J.authority),resA=token(after,J.reserveSol,J.solMint,J.authority),usB=token(before,J.reserveUsdc,P.mint,J.authority),usA=token(after,J.reserveUsdc,P.mint,J.authority);
  assert.equal(sb.amount,J.amount,'SPL_SOURCE_ONLY_ORIGINAL_WRAP');spent=u(sb.amount)-u(sa.amount);received=u(usB.amount)-u(usA.amount);surplus=received-q;
  const quote=quoteJupiterOrcaSolUsdcV1(resB.amount,usB.amount);assert.equal(i.quotedOutput,quote.quotedOutput);assert.ok(q<=u(quote.minimumOutput));
  assert.ok(spent>0n&&spent<=BigInt(J.amount)&&received>=u(quote.minimumOutput)&&surplus>=0n);
  assert.equal(u(resA.amount)-u(resB.amount),spent);assert.equal(u(ra.amount)-u(rb.amount),surplus);assert.equal(principalAfter,principal+q);assert.equal(reservedAfter,reserved);
  assert.equal(vb.lamports,va.lamports);assert.equal(rb.lamports,ra.lamports);assert.equal(usB.lamports,usA.lamports);assert.equal(sb.lamports-sa.lamports,spent);assert.equal(resA.lamports-resB.lamports,spent);
  assert.ok(u(resA.amount)*u(usA.amount)>=u(resB.amount)*u(usB.amount),'SPL_AMM_CONSERVATION');
  const mintB=decodeJupiterSplMintV1(before.get(J.poolMint).bytes),mintA=decodeJupiterSplMintV1(after.get(J.poolMint).bytes),feeB=decodeJupiterSplTokenAccountV1(before.get(J.poolFee).bytes),feeA=decodeJupiterSplTokenAccountV1(after.get(J.poolFee).bytes);
  lpMinted=u(mintA.supply)-u(mintB.supply);assert.equal(u(feeA.amount)-u(feeB.amount),lpMinted);assert.equal(before.get(J.poolMint).lamports,after.get(J.poolMint).lamports);assert.equal(before.get(J.poolFee).lamports,after.get(J.poolFee).lamports);
  assert.equal(before.get(receipt),null);const r=after.get(receipt);assert.equal(r?.owner,P.program);assert.equal(r.executable,false);assert.equal(r.bytes.length,128);assert.equal(r.bytes.subarray(0,8).toString('ascii'),'LNSPD001');
  assert.equal(r.bytes.subarray(8,40).toString('hex'),i.configPublicKey);assert.equal(r.bytes.subarray(40,72).toString('hex'),i.wireKeyCommitment);assert.equal(r.bytes.subarray(72,104).toString('hex'),i.payerPublicKey);assert.equal(r.bytes.readBigUInt64BE(104),q);assert.equal(r.bytes.readBigUInt64BE(112),BigInt(canonical.transactionSlot));assert.equal(r.bytes[120],1);assert.equal(r.bytes.subarray(121).toString('hex'),'0'.repeat(14));rent=u(r.lamports);assert.equal(r.lamports,record.receiptRentMinimum);
  let at=0;const create=Buffer.alloc(52);create.writeBigUInt64LE(rent,4);create.writeBigUInt64LE(128n,12);base58Decode(P.program,32).copy(create,20);exactCpi(inner[at++],P.system,[payer,receipt],create,2);
  const routeAccounts=[P.tokenProgram,payer,source,vault,J.program,P.mint,J.program,J.eventAuthority,J.program,J.dex,P.tokenProgram,J.pool,J.authority,payer,source,J.reserveSol,J.reserveUsdc,vault,J.poolMint,J.poolFee];
  exactCpi(inner[at++],J.program,routeAccounts,encodeJupiterOrcaRouteDataV1(i.quotedOutput),2);
  const swap=inner[at]?.data;assert.equal(swap?.length,17);assert.equal(swap[0],1);assert.equal(swap.readBigUInt64LE(1),BigInt(J.amount));assert.ok(swap.readBigUInt64LE(9)<=received);
  exactCpi(inner[at++],J.dex,[J.pool,J.authority,payer,source,J.reserveSol,J.reserveUsdc,vault,J.poolMint,J.poolFee,P.tokenProgram],swap,3);
  exactCpi(inner[at++],P.tokenProgram,[source,J.reserveSol,payer],oldTransfer(spent),4);
  if(lpMinted>0n){const mint=Buffer.alloc(9);mint[0]=7;mint.writeBigUInt64LE(lpMinted,1);exactCpi(inner[at++],P.tokenProgram,[J.poolMint,J.poolFee,J.authority],mint,4);}
  exactCpi(inner[at++],P.tokenProgram,[J.reserveUsdc,vault,J.authority],oldTransfer(received),4);
  // Same official SwapEvent bytes observed on the accepted public program:
  // discriminator, AMM id, source mint/input amount, destination mint/output.
  const event=Buffer.alloc(128);Buffer.from('e445a52e51cb9a1d40c6cde8260871e2','hex').copy(event);base58Decode(J.dex,32).copy(event,16);base58Decode(J.solMint,32).copy(event,48);event.writeBigUInt64LE(BigInt(J.amount),80);base58Decode(P.mint,32).copy(event,88);event.writeBigUInt64LE(received,120);exactCpi(inner[at++],J.program,[J.eventAuthority],event,3);
  if(surplus>0n)exactCpi(inner[at++],P.tokenProgram,[vault,P.mint,refund,cfg],checkedTransfer(surplus),2);assert.equal(at,inner.length,'SPL_NO_UNDECLARED_CPI');
  tokenBalances(meta,keys,before,after,[source,vault,refund,J.reserveSol,J.reserveUsdc,J.poolFee]);
 }else{
  const destination=b(i.recipientPublicKey),ticket=b(i.ticketPublicKey);changed.add(destination);changed.add(ticket);
  const db=token(before,destination,P.mint,decodeJupiterSplTokenAccountV1(before.get(destination).bytes).owner),da=token(after,destination,P.mint,db.owner);assert.equal(u(db.amount)+q,u(da.amount));assert.equal(db.lamports,da.lamports);assert.equal(vb.lamports,va.lamports);
  assert.equal(principalAfter,principal-q);assert.equal(reservedAfter,reserved-q);const tb=before.get(ticket),ta=after.get(ticket);assert.equal(tb?.owner,P.program);assert.equal(ta?.owner,P.program);assert.equal(tb.bytes.length,192);assert.equal(ta.bytes.length,192);assert.equal(tb.bytes[160],0);assert.equal(ta.bytes[160],1);assert.equal(ta.bytes.readBigUInt64BE(161),BigInt(canonical.transactionSlot));assert.ok(tb.bytes.subarray(0,160).equals(ta.bytes.subarray(0,160))&&tb.bytes.subarray(169).equals(ta.bytes.subarray(169)));assert.equal(tb.lamports,ta.lamports);
  assert.equal(inner.length,1);exactCpi(inner[0],P.tokenProgram,[vault,P.mint,destination,cfg],checkedTransfer(q),2);tokenBalances(meta,keys,before,after,[vault,destination]);
 }
 // Lamports are native fees/rent, never SPL principal. Native conservation is
 // checked for every account in the signed message, including executable CPI targets.
 for(const address of [vault,...(i.operation==='deposit'?[b(i.swapSourcePublicKey),b(i.refundPublicKey),J.reserveSol,J.reserveUsdc,J.poolFee]:[b(i.recipientPublicKey)])]){
  const pre=before.get(address),post=after.get(address);assert.equal(pre.owner,post.owner);assert.equal(pre.executable,post.executable);assert.equal(pre.bytes.length,post.bytes.length);
  assert.ok(pre.bytes.subarray(0,64).equals(post.bytes.subarray(0,64))&&pre.bytes.subarray(72).equals(post.bytes.subarray(72)),'SPL_TOKEN_IMMUTABLE_BYTES');
 }
 if(i.operation==='deposit'){const pre=before.get(J.poolMint),post=after.get(J.poolMint);assert.equal(pre.owner,post.owner);assert.equal(pre.executable,post.executable);assert.ok(pre.bytes.subarray(0,36).equals(post.bytes.subarray(0,36))&&pre.bytes.subarray(44).equals(post.bytes.subarray(44)),'SPL_LP_MINT_IMMUTABLE_BYTES');}
 const payerBefore=before.get(payer),payerAfter=after.get(payer);assert.equal(payerBefore.owner,P.system);assert.equal(payerAfter.owner,P.system);assert.equal(payerBefore.executable,false);assert.equal(payerAfter.executable,false);assert.equal(payerBefore.data,'');assert.equal(payerAfter.data,'');
 let net=0n;keys.forEach((key,index)=>{const pre=before.get(key),post=after.get(key),preLamports=pre?u(pre.lamports):0n,postLamports=post?u(post.lamports):0n;assert.equal(n(meta.preBalances[index]),preLamports);assert.equal(n(meta.postBalances[index]),postLamports);net+=preLamports-postLamports;if(!changed.has(key))assert.deepEqual(post,pre,'SPL_UNDECLARED_ACCOUNT_MUTATION');});assert.equal(net,u(canonical.feeLamports));
 assert.equal(u(before.get(payer).lamports)-u(after.get(payer).lamports),u(canonical.feeLamports)+rent);
 return Object.freeze({status:'observed',genesis:record.genesis,asset:record.asset,nativeWire:record.nativeWire,intent:record.intent,...canonical,amount:i.amount,principalUnit:P.principalUnit,actualInputSpent:spent.toString(),actualOutputReceived:received.toString(),surplusReturned:surplus.toString(),lpFeeMinted:lpMinted.toString(),evidenceSHA256:hash(Buffer.from(JSON.stringify({canonical,before:record.before,after:raw.after,principal: i.amount,spent:spent.toString(),received:received.toString()})))});
}

/** Infrastructure has no claim-credit authority. Exact CPI, native balances
 * and account bytes still join the one signed wire observed by its runtime. */
export function validateNativeSplInfrastructureObservationV1(record,raw,expected){
 const keys=record.keys,before=snapshots(record.before,keys),after=snapshots(raw.after,keys),meta=raw.transaction.meta;
 assert.ok(n(raw.afterSlot)>=n(raw.transaction.slot));const allowed=new Set([expected.payer]);
 if(expected.operation==='initialize'){
  allowed.add(expected.config);allowed.add(expected.vault);assert.equal(before.get(expected.config),null);assert.equal(before.get(expected.vault),null);
  const create=(lamports,space,owner)=>{const data=Buffer.alloc(52);data.writeUInt32LE(0);data.writeBigUInt64LE(u(lamports),4);data.writeBigUInt64LE(BigInt(space),12);base58Decode(owner,32).copy(data,20);return data;};
  const inner=cpi(meta,keys);assert.equal(inner.length,3);exactCpi(inner[0],P.system,[expected.payer,expected.config],create(expected.configRent,610,P.program),2);exactCpi(inner[1],P.system,[expected.payer,expected.vault],create(expected.vaultRent,165,P.tokenProgram),2);
  exactCpi(inner[2],P.tokenProgram,[expected.vault,P.mint],Buffer.concat([Buffer.from([18]),base58Decode(expected.config,32)]),2);
  const cfg=after.get(expected.config),vault=after.get(expected.vault);assert.equal(cfg?.owner,P.program);assert.equal(cfg.executable,false);assert.equal(cfg.bytes.length,610);assert.equal(cfg.lamports,expected.configRent);assert.equal(vault?.owner,P.tokenProgram);assert.equal(vault.executable,false);assert.equal(vault.bytes.length,165);assert.equal(vault.lamports,expected.vaultRent);
  assert.equal(u(before.get(expected.payer).lamports)-u(after.get(expected.payer).lamports),u(record.preparedFee)+u(expected.configRent)+u(expected.vaultRent));
 }else if(expected.operation==='authorize'){
  allowed.add(expected.config);allowed.add(expected.ticket);assert.equal(before.get(expected.ticket),null);const inner=cpi(meta,keys);assert.equal(inner.length,1);const create=Buffer.alloc(52);create.writeUInt32LE(0);create.writeBigUInt64LE(u(expected.ticketRent),4);create.writeBigUInt64LE(192n,12);base58Decode(P.program,32).copy(create,20);exactCpi(inner[0],P.system,[expected.payer,expected.ticket],create,2);
  const ticket=after.get(expected.ticket);assert.equal(ticket?.owner,P.program);assert.equal(ticket.executable,false);assert.equal(ticket.bytes.length,192);assert.equal(ticket.lamports,expected.ticketRent);for(const field of ['owner','executable','lamports'])assert.equal(after.get(expected.config)[field],before.get(expected.config)[field]);
  assert.equal(u(before.get(expected.payer).lamports)-u(after.get(expected.payer).lamports),u(record.preparedFee)+u(expected.ticketRent));
 }else{
  assert.equal(expected.operation,'wrap');allowed.add(expected.source);assert.deepEqual(meta.innerInstructions,[]);const b=before.get(expected.source),a=after.get(expected.source);assert.equal(b?.owner,P.tokenProgram);assert.equal(a?.owner,P.tokenProgram);assert.equal(b.executable,false);assert.equal(a.executable,false);assert.equal(b.bytes.length,165);assert.equal(a.bytes.length,165);assert.ok(b.bytes.subarray(0,64).equals(a.bytes.subarray(0,64))&&b.bytes.subarray(72).equals(a.bytes.subarray(72)),'SPL_WRAP_ONLY_NATIVE_AMOUNT_BYTES');
  assert.equal(a.bytes.readBigUInt64LE(64)-b.bytes.readBigUInt64LE(64),BigInt(J.amount));assert.equal(u(a.lamports)-u(b.lamports),BigInt(J.amount));assert.equal(u(before.get(expected.payer).lamports)-u(after.get(expected.payer).lamports),u(record.preparedFee)+BigInt(J.amount));
 }
 const pb=before.get(expected.payer),pa=after.get(expected.payer);assert.equal(pb?.owner,P.system);assert.equal(pa?.owner,P.system);assert.equal(pb.executable,false);assert.equal(pa.executable,false);assert.equal(pb.bytes.length,0);assert.equal(pa.bytes.length,0);
 keys.forEach((key,index)=>{assert.equal(u(before.get(key)?.lamports??'0'),n(meta.preBalances[index]));assert.equal(u(after.get(key)?.lamports??'0'),n(meta.postBalances[index]));if(!allowed.has(key))assert.deepEqual(after.get(key),before.get(key),'SPL_INFRASTRUCTURE_UNRELATED_ACCOUNT_CHANGED');});
 return true;
}
