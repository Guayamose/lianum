/** Host wiring only. Fake proofs/nodes are never native or privacy evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOwnedSharedAccountRuntimeForTest,SHARED_ACCOUNT_INITIAL_PALT_SUPPLY,SHARED_ACCOUNT_OWNER1_PALT_PREFUND} from '../../../backend/src/accounts/runtime/private-shared-account-runtime.mjs';
import {createReusableAssetCohortController} from '../../src/accounts/private-reusable-cohort.mjs';
import {base58Encode,createBoundSolanaRecipientViews} from '../../src/chains/solana/solana-runtime.mjs';
const h=(n,w=64)=>n.toString(16).padStart(w,'0'),hx=n=>'0x'+h(n),addr=n=>'0x'+h(n,40);
const terms={budget:'100',solCompensation:'40',amountSol:'30',numerator:'1',denominator:'30'};
const sleep=()=>new Promise(r=>setImmediate(r));
async function fixture(t,{holdPrepare=false}={}){
 const local=await mkdtemp(join(tmpdir(),'pc26-shared-host-')),accounts=Array.from({length:9},(_,i)=>addr(i+1));
 let deployments=0,closes=0,lease=false,heldRelease,heldEnter,holdOnce=holdPrepare,serial=1000;
 const held=new Promise(r=>heldRelease=r),entered=new Promise(r=>heldEnter=r),events=[],assets=[],authorities=[],btcOutputs=new Map(),solBalances=[50,70];
 const runtime={accounts,btc:async(method,args,wallet)=>{events.push(['btc',method,args,wallet]);if(method==='getbestblockhash')return h(55);if(method==='getnewaddress')return'owned-address-'+serial++;if(method==='listunspent')return args[2].flatMap(a=>btcOutputs.get(a)??[]);throw Error(method);},evm:async(method)=>{assert.equal(method,'eth_getBlockByNumber');return{hash:hx(1)};}};
 const solRecipients=[4,5].map(n=>base58Encode(Buffer.alloc(32,n)));
 const solViews=createBoundSolanaRecipientViews({genesis:base58Encode(Buffer.alloc(32,8)),solver:base58Encode(Buffer.alloc(32,3)),recipients:solRecipients},{transfer:async()=>{throw Error('NO_TRANSFER_IN_OBSERVER_FIXTURE');},observe:async()=>{throw Error('NO_OBSERVATION_IN_OBSERVER_FIXTURE');},balance:async address=>String(solBalances[solRecipients.indexOf(address)]),replayFinalizedForReview:async()=>{},transfers:()=>[]});
 assert.equal(solViews[0].readPublic,undefined);
 let solFault=null;
 const base={runtime,solana:{readPublic:async(method,args)=>{assert.equal(method,'getBalance');const index=solRecipients.indexOf(args[0]);assert.ok(index>=0);assert.deepEqual(args[1],{commitment:'finalized'});events.push(['sol-finalized-balance',index]);if(solFault)throw Error(solFault);return{value:solBalances[index],context:{slot:40}};}},pool:{address:addr(99),policy:hx(8)},identity:{walletId:h(77,32),chainId:'31337',evmGenesis:h(2),bitcoinGenesis:h(3),solanaGenesis:h(4),policy:h(8),issuerLifetime:h(5)},local,
  cohortBindings:{authorities:{sol:accounts[7],btc:accounts[8]},observerModel:{commonTrustedHost:true}},clock:6000,guard(){},heavy:async(_l,f)=>f(),audit:async(l,v)=>{events.push(['audit',l,v]);},close:async()=>{closes++;},
  mutate:async(label,work)=>{assert.equal(lease,false,'double shared lease');lease=true;events.push(['lease',label]);try{return await work();}finally{lease=false;events.push(['release',label]);}},
 };
 const group=await createOwnedSharedAccountRuntimeForTest({groupId:h(77,32)},{
  createBase:async()=>base,loadSources:async()=>({unchanged:true}),captureReceipt:async(_runtime,r)=>r,
  participantView:async(_base,{ownerIndex,walletId})=>({...base,local:join(local,'owners',walletId),identity:{...base.identity,walletId},accountBindings:{profile:'PC24_TWO_OWNER_COHORT_V1',ownerIndex,deposit:accounts[ownerIndex],ownerWithdrawal:accounts[ownerIndex],relayer:accounts[6],payouts:{sol:accounts[2+2*ownerIndex],btc:accounts[3+2*ownerIndex]},authorities:base.cohortBindings.authorities},solana:solViews[ownerIndex],bind:()=>{}}),
  deployPool:async(_runtime,options)=>{
   assert.equal(options.solAuthority,accounts[7]);assert.equal(options.btcAuthority,accounts[8]);
   const n=++deployments,asset=n===1?addr(0):addr(30),tokenBalances=new Map([[accounts[0],SHARED_ACCOUNT_INITIAL_PALT_SUPPLY],[accounts[1],0n]]);
   const s={blockNumber:'0x1',blockHash:hx(1),root:hx(10+n),scope:hx(20+n),policy:hx(8),stateSequence:'0',leafCount:0,spentCount:0,liveReservations:0,liveOutputNotes:0,leaves:[],nullifiers:[],asset,assetCodeHash:n===1?hx(0):hx(31),assetIdentity:hx(40+n),backedAmount:'0',assetBalance:'0',assetSurplus:'0',assetDeficit:'0',unrelatedNative:'0'};
   const pool={address:addr(10+n),asset,assetCodeHash:s.assetCodeHash,assetIdentity:s.assetIdentity,scope:s.scope,policy:s.policy,deployments:[{n}],receipts:[],snapshot:async()=>structuredClone(s),assetBalance:async holder=>tokenBalances.get(holder)??0n,
    assetCall:async method=>{assert.equal(method,'totalSupply()');return SHARED_ACCOUNT_INITIAL_PALT_SUPPLY;},assetData:(method,args)=>({method,args}),fundingTransactionValue:()=>n===1?'0x1':'0x0',beforeDeposit:async()=>{},
    send:async(label,tx)=>{assert.match(label,/explicit fixture/);assert.equal(tx.from,accounts[0]);assert.equal(tx.to,asset);assert.equal(tx.data.method,'transfer(address,uint256)');const[to,amount]=tx.data.args;assert.equal(to,accounts[1]);assert.equal(amount,SHARED_ACCOUNT_OWNER1_PALT_PREFUND);tokenBalances.set(tx.from,tokenBalances.get(tx.from)-amount);tokenBalances.set(to,tokenBalances.get(to)+amount);const r={transactionHash:hx(70)};pool.receipts.push(r);events.push(['fixture',tx]);return r;},
   };assets.push({pool,s,tokenBalances});return pool;
  },
  createAuthority:(options,deps)=>{
   const intents=[],notes=[];let view,closed=false,busy=false;const a={options,intents,notes,get view(){return view;},inputOverride:null};authorities.push(a);
   const status=()=>({asset:view.assetAdapter.descriptor,availableBaseUnits:notes.filter(n=>n.state==='AVAILABLE').reduce((n,x)=>n+BigInt(x.amountBaseUnits),0n).toString(),pendingBaseUnits:'0',unavailableBaseUnits:'0',notes:structuredClone(notes),intents:structuredClone(intents)});
   const action=async(kind,input={})=>{
    if(kind==='open'){view=await deps.createRuntime();return;}
    assert.equal(closed,false);if(kind==='prepareIntent'){intents.push({...input,state:'PREPARED'});return;}
    if(kind==='reconcile'){events.push(['reconcile',view.accountBindings.ownerIndex]);return;}
    assert.equal(kind,'execute');const intent=intents.find(i=>i.intentId===input.intentId);assert.equal(intent.state,'PREPARED');intent.state='EXECUTING';busy=true;
    const pool=assets.find(p=>p.pool.address===view.pool.address);
    try{return await view.mutate('wallet-'+intent.kind,async()=>{
     if(intent.kind==='topup'){const commitment=h(serial++);notes.push({id:commitment,type:'OWNER_BALANCE',state:'AVAILABLE',amountBaseUnits:intent.terms.amount,operationId:null,commitment});pool.s.backedAmount=(BigInt(pool.s.backedAmount)+BigInt(intent.terms.amount)).toString();pool.s.assetBalance=pool.s.backedAmount;pool.s.leafCount++;pool.s.liveOutputNotes++;pool.s.leaves.push('0x'+commitment);intent.state='COMPLETED';return;}
     assert.equal(intent.kind,'payment');const selected=notes.find(n=>n.state==='AVAILABLE');
     const context={operationId:input.operationId,inputCommitment:selected.commitment,guard:()=>{assert.equal(closed,false);},beforeEvm:async()=>{},beforeNative:async()=>{}};
     const host=await deps.createOperationHost(context,view,{},intent.terms);
     await host.prepare();await host.prepareReserve();await host.authorize();await host.releaseOwner();await host.assertOwnerExited();await host.reserve();
     await host.execute('sol',await host.readiness('sol'));await host.assertOwnerExited();await host.join();await host.execute('btc',await host.readiness('btc'));
     const terminal=await host.terminal();for(const role of ['sol','btc'])await host.permit(role,terminal);await host.claim(terminal);await host.verifyCompletion();await host.retireSettledProcesses();
     selected.amountBaseUnits=(BigInt(selected.amountBaseUnits)-BigInt(intent.terms.budget)).toString();selected.commitment=h(serial++);selected.id=selected.commitment;intent.state='COMPLETED';
    });}catch(e){intent.state='UNKNOWN';throw e;}finally{busy=false;}
   };
   Object.assign(a,{action,privateAssetStatus:async()=>status(),privatePaymentAdmission:async({intentId,operationId})=>{if(busy)assert.equal(view.isPaymentAdmissionSafe(operationId),true);const intent=intents.find(i=>i.intentId===intentId),note=notes.find(n=>n.state==='AVAILABLE');assert.ok(note);return{intentId,operationId,kind:intent.kind,terms:intent.terms,state:intent.state,inputCommitment:a.inputOverride??note.commitment,inputValue:note.amountBaseUnits,identity:view.identity,snapshot:await view.pool.snapshot()};},abort:async()=>{closed=true;events.push(['owner-abort',view.accountBindings.ownerIndex,view.identity.asset.kind]);}});return a;
  },
  createHost:async(context,view)=>{
   const index=view.accountBindings.ownerIndex,pool=assets.find(p=>p.pool.address===view.pool.address),host={};
   for(const name of ['prepare','prepareReserve','authorize','releaseOwner','assertOwnerExited','reserve','readiness','execute','join','terminal','permit','claim','verifyCompletion','retireSettledProcesses'])host[name]=async(...args)=>{
    context.guard();assert.equal(lease,true);events.push(['host',index,name,args[0]]);
    if(name==='prepare'){
     if(holdOnce){holdOnce=false;heldEnter();await held;context.guard();}
     const address=await view.runtime.btc('getnewaddress',['','bech32'],'m9-recipient');btcOutputs.set(address,[{address,txid:h(serial++),vout:0,confirmations:6,amount:index===0?0.000001:0.000002}]);
    }
    if(name==='reserve'){pool.s.leafCount+=2;pool.s.spentCount++;pool.s.liveReservations++;}
    if(name==='execute')await context.beforeNative(args[0]);
    if(name==='claim'){await context.beforeEvm('claim');pool.s.liveReservations--;pool.s.liveOutputNotes+=2;pool.s.leafCount+=2;pool.s.spentCount++;}
    return{};
   };return host;
  },
 });
 const owners=[await group.createOwnerRuntime(0,{accountId:h(80,32)}),await group.createOwnerRuntime(1,{accountId:h(81,32)})];
 let controller;controller=createReusableAssetCohortController({cohortId:'host_cohort',authorities:owners,mutate:group.mutate,validateAdmission:ctx=>group.validateAdmission(ctx.ownerIndex,{...ctx.request,state:'PREPARED'}),validateRound:group.validateRound,executeRequest:ctx=>owners[ctx.ownerIndex].execute(ctx.request),recoverRequest:(ctx)=>owners[ctx.ownerIndex].reconcile(ctx.request),assertRoundResolved:group.assertRoundResolved,fatalShutdown:()=>group.abort(),onCheckpoint:async()=>{},chooseOrder:()=>[0,1]});group.bindCohort(controller);
 t.after(async()=>{heldRelease();await group.abort();await rm(local,{recursive:true,force:true});});
 const request=(index,asset,kind,terms)=>({requestId:'request_'+serial++,assetId:group.registry[asset].assetId,intentId:h(serial++,32),operationId:h(serial++,32),kind,terms,state:'PREPARED'});
 const topup=async(index,asset)=>{const r=request(index,asset,'topup',{amount:'1000'});await owners[index].prepare(r);await owners[index].execute(r);return r;};
 const pair=async(asset=0)=>{const requests=[];for(const i of [0,1]){const r=request(i,asset,'payment',{...terms});await owners[i].prepare(r);const{kind,state,...input}=r;await controller.enroll(i,{...input,consentToWait:true,expiresAt:Date.now()+60_000});requests.push(r);}return requests;};
 return{group,owners,controller,assets,authorities,events,entered,release:heldRelease,topup,pair,request,failSol:code=>{solFault=code;},closes:()=>closes,deployments:()=>deployments};
}

test('HOST: real restricted SOL views use owner-bound finalized shared reads and preserve stale holdings on RPC failure',async t=>{
 const f=await fixture(t);
 for(const index of [0,1]){const previous=await f.owners[index].snapshot();const holding=previous.nativeHoldings.find(h=>h.chain==='SOLANA');assert.equal(holding.observation,'LIVE');assert.equal(holding.amountBaseUnits,String(index?70:50));assert.equal(holding.anchor,'40');assert.equal(holding.spendability,'OBSERVATION_ONLY');}
 const previous=await f.owners[0].snapshot();f.failSol('SOLANA_RPC_UNAVAILABLE');const current=await f.owners[0].snapshot(previous),holding=current.nativeHoldings.find(h=>h.chain==='SOLANA');assert.equal(holding.observation,'UNAVAILABLE');assert.equal(holding.errorCode,'SOLANA_RPC_UNAVAILABLE');assert.equal(holding.amountBaseUnits,'50');assert.equal(holding.observedAt,previous.nativeHoldings[0].observedAt);
});

test('HOST: exactly two shared assets, fixed fixture transfer, isolated custody paths and three reusable rounds',async t=>{
 const f=await fixture(t);assert.equal(f.deployments(),2);assert.equal(f.events.filter(e=>e[0]==='fixture').length,1);assert.ok(Object.isFrozen(f.group.registry)&&Object.isFrozen(f.group.registry[0]));
 assert.equal(new Set(f.authorities.map(a=>a.view.local)).size,4);assert.equal(new Set(f.authorities.map(a=>a.view.identity.walletId)).size,4);assert.equal(new Set(f.authorities.map(a=>a.view.identity.issuerLifetime)).size,1);
 for(const a of f.authorities){const i=a.view.accountBindings.ownerIndex;assert.equal(a.view.accountBindings.deposit,addr(i+1));assert.equal(a.view.accountBindings.relayer,addr(7));assert.equal(a.view.accountBindings.payouts.sol,addr(3+2*i));}
 for(const i of [0,1])for(const asset of [0,1])await f.topup(i,asset);
 for(const asset of [0,1,0]){if(f.controller.status().state==='SETTLED_IN_POOL')await f.controller.beginNextRound();await f.pair(asset);await f.controller.start();const s=await f.controller.idle();assert.equal(s.state,'SETTLED_IN_POOL',s.errorCode);}
 assert.equal(f.deployments(),2);assert.equal(f.closes(),0);assert.equal(f.events.filter(e=>e[0]==='host'&&e[2]==='reserve').length,6);
 for(const i of [0,1]){const s=await f.owners[i].snapshot();assert.equal(s.nativeHoldings[0].amountBaseUnits,String(i?70:50));assert.equal(s.nativeHoldings[1].amountBaseUnits,String(i?600:300));assert.equal(s.nativeHoldings[1].spendability,'OBSERVATION_ONLY');}
 assert.equal(f.events.some(e=>e[0]==='btc'&&e[1]==='getbalance'),false);
});

test('HOST: direct payment rejects before host construction and paired original input cannot change',async t=>{
 const f=await fixture(t);for(const i of [0,1])await f.topup(i,0);const requests=await f.pair();
 await assert.rejects(f.owners[0].execute(requests[0]),/ENROLLED_ACTIVE_OPERATION/);assert.equal(f.events.some(e=>e[0]==='host'),false);
 f.authorities[2].inputOverride=h(999);await assert.rejects(f.controller.start(),/ORIGINAL_INPUT_CHANGED/);assert.equal(f.events.some(e=>e[0]==='host'),false);
});

test('HOST: combined capacity admission fails before preparation even when individual reservations fit',async t=>{
 const f=await fixture(t);for(const i of [0,1])await f.topup(i,0);await f.pair();
 Object.assign(f.assets[0].s,{leafCount:58,spentCount:0,liveReservations:0,liveOutputNotes:2});
 await f.controller.start();assert.equal((await f.controller.idle()).state,'QUARANTINED');assert.equal(f.events.some(e=>e[0]==='host'),false);
 await assert.rejects(f.controller.resetFailedRound(),/UNRESOLVED_ORIGINAL/);
});

test('HOST: active cancellation prevents native exposure, ordinary work stays blocked, original custody survives',async t=>{
 const f=await fixture(t,{holdPrepare:true});for(const i of [0,1])await f.topup(i,0);const requests=await f.pair();await f.controller.start();await f.entered;
 await assert.rejects(f.owners[0].prepare(f.request(0,1,'topup',{amount:'1'})),/COHORT_STILL_EXECUTING/);
 await f.controller.cancel(0);f.release();assert.equal((await f.controller.idle()).state,'QUARANTINED');assert.equal(f.events.some(e=>e[0]==='host'&&e[2]==='execute'),false);assert.equal(f.closes(),0);
 await assert.rejects(f.controller.recover(0,requests[0].requestId,{action:'reconcile'}),/ACCOUNT_OUTCOME_UNKNOWN/);assert.ok(f.events.some(e=>e[0]==='reconcile'));assert.equal(f.closes(),0);
});

test('HOST: closing or aborting one empty owner preserves peer custody and common nodes; BTC empty set never queries all UTXOs',async t=>{
 const f=await fixture(t);const s=await f.owners[0].snapshot();assert.equal(s.nativeHoldings[1].amountBaseUnits,'0');assert.equal(f.events.some(e=>e[0]==='btc'&&e[1]==='listunspent'),false);
 await f.owners[0].close();assert.equal(f.closes(),0);await f.topup(1,0);assert.equal((await f.owners[1].snapshot()).assets[0].available,'1000');await f.owners[1].abort();assert.equal(f.closes(),0);await f.group.abort();assert.equal(f.closes(),1);
});
