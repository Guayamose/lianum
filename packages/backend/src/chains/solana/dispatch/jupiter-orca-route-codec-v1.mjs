/** Pinned Jupiter V6 -> Orca V2 single-hop ABI and public snapshot decoding.
 * Pure helpers grant no native send, claim credit or wallet authority. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {base58Decode,base58Encode} from '../runtime/solana-base58.mjs';
export const JUPITER_ORCA_V1=Object.freeze({
 program:'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',dex:'9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
 tokenProgram:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',pool:'EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U',
 authority:'JU8kmKzDHF9sXWsnoznaFDFezLsE5uomX2JkRMbmsQP',reserveSol:'ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg',
 reserveUsdc:'75HgnSvXbWKZBpZHveX68ZzAhDqMzNDS29X6BGLtxMo1',poolMint:'APDFRM3HMr8CAGXwKHiu2f5ePSpaiEJhaURwhsRrUUt9',
 poolFee:'8JnSiuvQq3BVuCU3n4DrSTw9chBSPvEMswrhtifVkr1o',solMint:'So11111111111111111111111111111111111111112',
 usdcMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',eventAuthority:'D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf',
 amount:'10000000',slippageBps:50,computeUnits:400000,tokenRent:'2039280'});
const pk=value=>{base58Decode(value,32);return value;},sha=value=>createHash('sha256').update(value).digest('hex');
const u64=value=>{assert.equal(typeof value,'string');assert.match(value,/^(0|[1-9][0-9]*)$/);const n=BigInt(value);assert.ok(n<1n<<64n);return n;};
export function decodeOfficialJupiterBincodeAccountV1(raw){
 const b=Buffer.from(raw);assert.ok(b.length>=57&&b.length<=2_000_000);const n=b.readBigUInt64LE(8);assert.ok(n<=2_000_000n);assert.equal(b.length,57+Number(n));
 assert.ok(b[48+Number(n)]<=1);return {lamports:b.readBigUInt64LE(0).toString(),owner:base58Encode(b.subarray(16+Number(n),48+Number(n))),
  executable:b[48+Number(n)]===1,rentEpoch:b.readBigUInt64LE(49+Number(n)).toString(),data:b.subarray(16,16+Number(n))};
}
export function decodeJupiterSplTokenAccountV1(raw){
 const b=Buffer.from(raw);assert.equal(b.length,165);assert.equal(b[108],1,'JUPITER_INITIALIZED_TOKEN_ACCOUNT');
 for(const offset of [72,109,129])assert.ok(b.readUInt32LE(offset)<=1,'JUPITER_SPL_OPTION');
 return {mint:base58Encode(b.subarray(0,32)),owner:base58Encode(b.subarray(32,64)),amount:b.readBigUInt64LE(64).toString(),
  delegateOption:b.readUInt32LE(72),nativeRent:b.readUInt32LE(109)===1?b.readBigUInt64LE(113).toString():null,
  delegatedAmount:b.readBigUInt64LE(121).toString(),closeAuthorityOption:b.readUInt32LE(129)};
}
export function decodeJupiterSplMintV1(raw){const b=Buffer.from(raw);assert.equal(b.length,82);assert.equal(b[45],1);return {supply:b.readBigUInt64LE(36).toString(),decimals:b[44],mintAuthorityOption:b.readUInt32LE(0),freezeAuthorityOption:b.readUInt32LE(46)};}
export function validateOfficialJupiterOrcaPoolV1(raw){
 const b=Buffer.from(raw);assert.equal(b.length,324);assert.deepEqual([...b.subarray(0,3)],[1,1,252]);
 assert.deepEqual(Array.from({length:7},(_,i)=>base58Encode(b.subarray(3+i*32,35+i*32))),[JUPITER_ORCA_V1.tokenProgram,JUPITER_ORCA_V1.reserveSol,JUPITER_ORCA_V1.reserveUsdc,JUPITER_ORCA_V1.poolMint,JUPITER_ORCA_V1.solMint,JUPITER_ORCA_V1.usdcMint,JUPITER_ORCA_V1.poolFee]);
 assert.deepEqual(Array.from({length:8},(_,i)=>b.readBigUInt64LE(227+i*8).toString()),['25','10000','5','10000','0','0','0','0']);
 assert.equal(b.subarray(291).toString('hex'),'0'.repeat(66),'JUPITER_CONSTANT_PRODUCT_POOL_ONLY');return true;
}
export function quoteJupiterOrcaSolUsdcV1(sourceReserve,destinationReserve){
 const x=u64(sourceReserve),y=u64(destinationReserve),input=BigInt(JUPITER_ORCA_V1.amount);assert.ok(x>0n&&y>0n);
 const trade=input*25n/10000n,owner=input*5n/10000n,net=input-trade-owner;
 // Conservative checked constant-product output floor. It is a minimum for
 // pinned pool state, not evidence that a bank executed the instruction.
 const quoted=y*net/(x+net);assert.ok(quoted>0n);return {input:input.toString(),quotedOutput:quoted.toString(),minimumOutput:(quoted*9950n/10000n).toString(),tradeFee:trade.toString(),ownerFee:owner.toString()};
}
export function encodeJupiterOrcaRouteDataV1(quotedOutput){
 const output=u64(quotedOutput);assert.ok(output>0n);const b=Buffer.alloc(35);Buffer.from([229,23,203,151,122,227,173,42]).copy(b);
 b.writeUInt32LE(1,8);Buffer.from([3,100,0,1]).copy(b,12);b.writeBigUInt64LE(BigInt(JUPITER_ORCA_V1.amount),16);b.writeBigUInt64LE(output,24);b.writeUInt16LE(50,32);return b;
}
export function jupiterOrcaRouteAccountsV1(payer,source,destination){
 [payer,source,destination].forEach(pk);assert.equal(new Set([payer,source,destination]).size,3);
 const a=(pubkey,writable=false,signer=false)=>({pubkey,writable,signer}),p=JUPITER_ORCA_V1;
 return [a(p.tokenProgram),a(payer,false,true),a(source,true),a(destination,true),a(p.program),a(p.usdcMint),a(p.program),a(p.eventAuthority),a(p.program),
  a(p.dex),a(p.tokenProgram),a(p.pool,true),a(p.authority),a(payer,false,true),a(source,true),a(p.reserveSol,true),a(p.reserveUsdc,true),a(destination,true),a(p.poolMint,true),a(p.poolFee,true)];
}
function compact(n){assert.ok(Number.isSafeInteger(n)&&n>=0&&n<65536);const result=[];do{let byte=n&127;n>>>=7;if(n)byte|=128;result.push(byte);}while(n);return Buffer.from(result);}
export function encodeJupiterOrcaFixtureMessageV1(payer,source,destination,blockhash,quotedOutput){
 [payer,source,destination,blockhash].forEach(pk);const routeAccounts=jupiterOrcaRouteAccountsV1(payer,source,destination);
 const compute=Buffer.alloc(5);compute[0]=2;compute.writeUInt32LE(400000,1);
 const instructions=[{program:'ComputeBudget111111111111111111111111111111',accounts:[],data:compute},{program:JUPITER_ORCA_V1.program,accounts:routeAccounts,data:encodeJupiterOrcaRouteDataV1(quotedOutput)}];
 const map=new Map([[payer,{pubkey:payer,writable:true,signer:true}]]);
 for(const row of instructions){for(const account of row.accounts){const old=map.get(account.pubkey);map.set(account.pubkey,{pubkey:account.pubkey,writable:account.writable||old?.writable===true,signer:account.signer||old?.signer===true});}if(!map.has(row.program))map.set(row.program,{pubkey:row.program,writable:false,signer:false});}
 const keys=[...map.values()].sort((a,b)=>Number(b.signer)-Number(a.signer)||Number(b.writable)-Number(a.writable));assert.equal(keys[0].pubkey,payer);assert.equal(keys.filter(row=>row.signer).length,1);
 const index=new Map(keys.map((row,i)=>[row.pubkey,i]));assert.ok(keys.length<128);
 const message=Buffer.concat([Buffer.from([1,0,keys.filter(row=>!row.signer&&!row.writable).length]),compact(keys.length),...keys.map(row=>base58Decode(row.pubkey,32)),base58Decode(blockhash,32),compact(instructions.length),
  ...instructions.flatMap(row=>[Buffer.from([index.get(row.program)]),compact(row.accounts.length),Buffer.from(row.accounts.map(account=>index.get(account.pubkey))),compact(row.data.length),row.data])]);
 assert.ok(message.length+65<=1232,'JUPITER_ORIGINAL_SOLANA_WIRE_LIMIT');return {message,keys:keys.map(row=>row.pubkey),messageSHA256:sha(message)};
}
export function validateJupiterOrcaFixtureTransactionV1(nativeWire,expected){
 assert.equal(typeof nativeWire,'string');const raw=Buffer.from(nativeWire,'base64');assert.equal(raw.toString('base64'),nativeWire);assert.ok(raw.length<=1232&&raw.length>65);assert.equal(raw[0],1);
 const encoded=encodeJupiterOrcaFixtureMessageV1(expected.payer,expected.source,expected.destination,expected.blockhash,expected.quotedOutput);
 assert.ok(raw.subarray(65).equals(encoded.message),'JUPITER_EXACT_ORIGINAL_MESSAGE');
 const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),base58Decode(expected.payer,32)]),type:'spki',format:'der'});
 assert.equal(verify(null,encoded.message,publicKey,raw.subarray(1,65)),true,'JUPITER_ORIGINAL_ED25519_SIGNATURE');
 return {...encoded,signature:base58Encode(raw.subarray(1,65)),transactionSHA256:sha(raw)};
}
