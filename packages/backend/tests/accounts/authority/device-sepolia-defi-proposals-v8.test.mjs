/** HOST proposal boundary: Original account/venue reads are explicit fakes.
 * Protocol normalization and cap/deadline/destination logic are real. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../providers/fixtures/paged-mixed-host-v7.mjs';
let operatorBalance=100000000n;const capitalReads=[];
const accounts=new WeakMap(),venues=new WeakMap(),runtime=Object.freeze({async call(tx,tag){assert.equal(tag,'0x1');assert.equal(tx.data,'0x70a08231'+target.account.slice(2).padStart(64,'0'));capitalReads.push(tx.to);return '0x'+operatorBalance.toString(16).padStart(64,'0');},async assertCanonical(head){assert.match(head.hash,/^0x[0-9a-f]{64}$/);}});let auths=0,quotes=0,nonce=0;const issued=new Set(),consumed=new Set();
const target=Object.freeze({account:'0x'+'1'.repeat(40),delivery:{address:'0x'+'2'.repeat(40)},exit:{address:'0x'+'3'.repeat(40)},target:{pools:[{address:'0x'+'4'.repeat(40)},{address:'0x'+'5'.repeat(40)}]}});
const auth={
 readOriginalDeviceSepoliaDefiSharesBindingV8(r,account){assert.strictEqual(r,runtime);assert.ok(accounts.has(account),'HOST_ORIGINAL_ACCOUNT');return {target};},
 async authorizeOriginalDeviceSepoliaDefiProposalAccessV8(account,request){const row=accounts.get(account);assert.ok(row,'HOST_ORIGINAL_ACCOUNT');assert.equal(request.signature,'HOST_SIGNED_NOTE_READ','HOST_ACCESS_SIGNATURE');assert.equal(request.access.action,'ACCESS','HOST_ACCESS_ACTION');assert.ok(issued.has(request.access.nonce),'HOST_ACCESS_ISSUED');assert.ok(!consumed.has(request.access.nonce),'HOST_ACCESS_REPLAY');consumed.add(request.access.nonce);auths++;return row;},
};
function quote(venue,shares){const row=venues.get(venue);assert.ok(row,'HOST_ORIGINAL_VENUE');quotes++;return {view:{addresses:{underlying:'0x'+(row.protocol==='AAVE_STATIC'?'6':'7').repeat(40)},shares,chainId:'11155111',genesis:'0x'+row.descriptor.poolTerms.genesis,head:{number:'0x1',hash:'0x'+'a'.repeat(64),timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)},maximumInputAtomic:'1100000',estimatedUnderlyingAtomic:'1099999',underlyingLiquidityAtomic:'100000000'}};}
mock.module(new URL('../../../src/accounts/authority/device-sepolia-defi-shares-authority-v4.mjs',import.meta.url).href,{exports:auth});
mock.module(new URL('../../../src/chains/evm/vault/aave-sepolia-original-v4.mjs',import.meta.url).href,{exports:{async quoteOriginalAaveSepoliaSharesV4(v,s){return quote(v,s);},async readOriginalAaveSepoliaPublicPositionV4(v,holder,s){assert.equal(holder,target.target.pools[1].address);return quote(v,s).view;}}});
mock.module(new URL('../../../src/chains/evm/vault/morpho-v2-sepolia-original-v4.mjs',import.meta.url).href,{exports:{async quoteOriginalMorphoV2SepoliaSharesV4(v,s){return quote(v,s);},async readOriginalMorphoV2SepoliaPublicPositionV4(v,holder,s){assert.equal(holder,target.target.pools[1].address);return quote(v,s).view;}}});
mock.module(new URL('../../../src/accounts/authority/device-sepolia-defi-financial-http-v8.mjs',import.meta.url).href,{exports:{createOriginalDeviceSepoliaDefiFinancialHttpV8(){assert.fail('HOST_NO_FINANCIAL_DISPATCH');},isDeviceSepoliaDefiFinancialHttpRouteV8(){return false;},mountOriginalDeviceSepoliaDefiFinancialSourceV8(){assert.fail('HOST_NO_FINANCIAL_MOUNT');}}});
const {createOriginalDeviceSepoliaDefiSharesRetainedHttpV8,assertOriginalDeviceSepoliaDefiSharesHttpV4}=await import('../../../src/accounts/authority/device-sepolia-defi-shares-http-v4.mjs');
async function proposal(runtime,account,request){const handler=createOriginalDeviceSepoliaDefiSharesRetainedHttpV8(runtime,account);assert.throws(()=>assertOriginalDeviceSepoliaDefiSharesHttpV4({...handler}),/ORIGINAL_HTTP/);return handler.dispatch('/v1/mobile/sepolia-defi-shares/defi-proposals',request,account.descriptor.pairingId);}
function original(protocol){const descriptor=structuredClone(fixture().flatAuthority.entries[0].descriptor);if(protocol==='MORPHO_V2')descriptor.assetMetadata={kind:'ERC20',symbol:'mvUSDC',decimals:18};const account=Object.freeze({descriptor}),venue=Object.freeze(Object.create(null)),row={descriptor,protocol,venue,target,policy:{expiresAt:Date.now()+24*3600000},head:{}};accounts.set(account,row);venues.set(venue,row);return {account,row};}
function request(protocol,action='INVEST'){const challenge='host-access-'+(++nonce);issued.add(challenge);return {access:{action:'ACCESS',nonce:challenge},signature:'HOST_SIGNED_NOTE_READ',protocol,action,rootId:'7'.repeat(64),noteRevision:1,sharesAtomic:protocol==='AAVE_STATIC'?'1000000':'1000000000000000000',maximumInputAtomic:null,minimumAssetsAtomic:null,underlyingReceiver:'0x'+'9'.repeat(40),shareWithdrawalRecipient:target.account,receiptCommitment:action==='INVEST'?'6'.repeat(64):null};}

test('HTTP authenticates both Original venues before bounded quote/review DATA, without creating authorization or a proof',async()=>{
 for(const protocol of ['AAVE_STATIC','MORPHO_V2']){
  const {account,row}=original(protocol),invest=await proposal(runtime,account,request(protocol));assert.deepEqual(Object.keys(invest),['review']);assert.equal(invest.review.maximumInputAtomic,'1111000');assert.equal(invest.review.minimumAssetsAtomic,null);assert.equal(invest.review.descriptor.assetMetadata.decimals,protocol==='AAVE_STATIC'?6:18);assert.equal(BigInt(invest.review.validUntil)-BigInt(invest.review.validFrom),25200n);assert.match(invest.review.reference,/^[0-9a-f]{64}$/);assert.equal(invest.review.receiptCommitment,'6'.repeat(64));
  const redemption=await proposal(runtime,account,request(protocol,'REDEEM'));assert.equal(redemption.review.minimumAssetsAtomic,'1088999');assert.equal(redemption.review.maximumInputAtomic,null);assert.equal(redemption.review.receiptCommitment,null);
  await assert.rejects(proposal(runtime,account,{...request(protocol),receiptCommitment:'0'.repeat(64)}),/RECEIPT_COMMITMENT/);
  await assert.rejects(proposal(runtime,account,{...request(protocol),receiptSecret:'8'.repeat(64)}),/DEVICE_EXTERNAL_FLAT_DATA/);
  await assert.rejects(proposal(runtime,{...account},request(protocol)),/ORIGINAL_ACCOUNT/);
  await assert.rejects(proposal(runtime,account,{...request(protocol),underlyingReceiver:target.account}),/USER_DESTINATION/);
  await assert.rejects(proposal(runtime,account,{...request(protocol),shareWithdrawalRecipient:'0x'+'8'.repeat(40)}),/TEMPORARY_CUSTODY/);
  assert.equal((await proposal(runtime,account,{...request(protocol),maximumInputAtomic:'10000000'})).review.maximumInputAtomic,'1111000');await assert.rejects(proposal(runtime,account,{...request(protocol),maximumInputAtomic:'1099999'}),/INPUT_LIMIT/);await assert.rejects(proposal(runtime,account,{...request(protocol),maximumInputAtomic:'10000001'}),/INPUT_LIMIT/);
  assert.equal((await proposal(runtime,account,{...request(protocol,'REDEEM'),minimumAssetsAtomic:'1'})).review.minimumAssetsAtomic,'1088999');await assert.rejects(proposal(runtime,account,{...request(protocol,'REDEEM'),minimumAssetsAtomic:'1100000'}),/MINIMUM_OUTPUT/);
  const beforeInvalid=quotes;
  await assert.rejects(proposal(runtime,account,{...request(protocol),signature:'INVALID'}),/ACCESS_SIGNATURE/);
  await assert.rejects(proposal(runtime,account,{...request(protocol),access:{action:'ACCESS',nonce:'forged'}}),/ACCESS_ISSUED/);
  assert.equal(quotes,beforeInvalid,'invalid ACCESS never reaches an Original venue quote');
  const once=request(protocol);await proposal(runtime,account,once);const afterOnce=quotes;await assert.rejects(proposal(runtime,account,once),/ACCESS_REPLAY/);assert.equal(quotes,afterOnce,'a consumed read cannot be reused to quote again');
  row.policy.expiresAt=Date.now()+30*60000+30000;await assert.rejects(proposal(runtime,account,request(protocol)),/SPONSOR_WINDOW/);
 }
 assert.ok(auths>0&&quotes>0);
});

test('new redemption reviews allow proof plus finality while retaining sponsor, amount and destination bounds',async()=>{
 for(const protocol of ['AAVE_STATIC','MORPHO_V2']){
  const {account,row}=original(protocol);row.policy.expiresAt=Date.now()+24*3600000;
  const invest=await proposal(runtime,account,request(protocol)),redeem=await proposal(runtime,account,request(protocol,'REDEEM'));
  assert.equal(BigInt(invest.review.validUntil)-BigInt(invest.review.validFrom),25200n,'new investment leaves room inside the original eight-hour graph deadline');
  assert.equal(BigInt(redeem.review.validUntil)-BigInt(redeem.review.validFrom),28800n,'redemption has eight hours while retaining its original sponsor ceiling');
  assert.equal(redeem.review.minimumAssetsAtomic,'1088999');assert.equal(redeem.review.underlyingReceiver,'0x'+'9'.repeat(40));assert.equal(redeem.review.shares,request(protocol,'REDEEM').sharesAtomic);
  const retained=structuredClone(redeem.review);row.policy.expiresAt=Date.now()+90*60000;
  const bounded=await proposal(runtime,account,request(protocol,'REDEEM'));
  assert.equal(BigInt(bounded.review.validUntil),BigInt(Math.floor((row.policy.expiresAt-30*60000)/1000)),'never extends the sponsor usable window');
  assert.deepEqual(redeem.review,retained,'a later proposal never rewrites an existing review');
  row.policy.expiresAt=Date.now()+45*60000;await assert.rejects(proposal(runtime,account,request(protocol,'REDEEM')),/REDEMPTION_WINDOW/);
 }
});


test('investment preflight checks the correct underlying and reviewed maximum including slippage; redemption remains independent',async()=>{
 try{for(const protocol of ['AAVE_STATIC','MORPHO_V2']){
  const {account}=original(protocol);operatorBalance=0n;
  await assert.rejects(proposal(runtime,account,request(protocol)),/SEPOLIA_DEFI_PROPOSAL_TOKEN_FUNDS_REQUIRED/);
  assert.equal(capitalReads.at(-1),'0x'+(protocol==='AAVE_STATIC'?'6':'7').repeat(40));
  operatorBalance=1110999n;await assert.rejects(proposal(runtime,account,request(protocol)),/TOKEN_FUNDS_REQUIRED/);
  operatorBalance=1111000n;assert.equal((await proposal(runtime,account,request(protocol))).review.maximumInputAtomic,'1111000');
  operatorBalance=0n;const before=capitalReads.length;assert.equal((await proposal(runtime,account,request(protocol,'REDEEM'))).review.action,'REDEEM');assert.equal(capitalReads.length,before,'redemption does not depend on new investment capital');
 }}finally{operatorBalance=100000000n;}
});
