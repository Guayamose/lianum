import test from 'node:test';
import assert from 'node:assert/strict';
import {fiatCentsV1,formatFiatV1,portfolioOverviewV1,mergeNativeBalancesV25} from '../src/portfolio/portfolio-model-v1.ts';
import {normalizeMarketSnapshotV1,normalizeMarketCandlesV1} from '../src/portfolio/market-data-v1.ts';
const market=normalizeMarketSnapshotV1({data:{currency:'USD',rates:{BTC:'0.00002',ETH:'0.0005',SOL:'0.01',EUR:'0.9'}}});
const accounts=['bitcoin','ethereum','solana'].map((chain,i)=>({chain,network:'mainnet',networkId:chain,address:'a'+i,path:'p',publicKey:'k'}));
const balances=accounts.map((account,i)=>({account,status:'CONFIRMED',balance:{address:account.address,balanceAtomic:['100000000','2000000000000000000','10000000000'][i],spendableAtomic:['100000000','1000000000000000000','10000000000'][i],reservedAtomic:i===1?'250000000000000000':'0',observed:{blockNumber:'1',blockHash:'a'}}}));
test('retained display balances cannot cross networks, account identities or unknown first observations',()=>{
 for(const field of ['chain','network','networkId','address','path','publicKey']){
  const other={...accounts[0],[field]:'other'},unknown={account:other,status:'UNKNOWN',balance:null};
  const result=mergeNativeBalancesV25(balances,[unknown],[other],200);
  assert.deepEqual(result,[unknown],field);assert.equal(result[0].balance,null);
 }
 assert.deepEqual(mergeNativeBalancesV25(balances,[],[],200),[]);
 const failed={account:accounts[0],status:'UNKNOWN',balance:null};
 assert.equal(mergeNativeBalancesV25([], [failed],accounts,200)[0].observedAt,undefined);
});
test('unified fiat valuation combines three assets and conserves every cent across categories',()=>{
 const p=portfolioOverviewV1(accounts,balances,market,'USD');assert.equal(p.total,5500000n);assert.equal(p.available+p.reserved+p.occupied,p.total);assert.equal(p.reserved,50000n);assert.equal(p.occupied,150000n);
 const eur=portfolioOverviewV1(accounts,balances,market,'EUR');assert.equal(eur.total,4950000n);assert.equal(eur.available+eur.reserved+eur.occupied,eur.total);
});
test('unknown account, wrong identity and testnet cannot silently inflate or complete total',()=>{
 assert.equal(portfolioOverviewV1(accounts,balances.slice(1),market,'EUR').total,null);
 const wrong=balances.map(b=>({...b,account:{...b.account,address:'other'}}));assert.equal(portfolioOverviewV1(accounts,wrong,market,'EUR').total,null);
 const testAccount={...accounts[0],network:'testnet'};const p=portfolioOverviewV1([...accounts,testAccount],[...balances,{...balances[0],account:testAccount}],market,'USD');assert.equal(p.rows.length,3);assert.equal(p.total,5500000n);
});
test('large atomic amounts and cents retain precision beyond Number.MAX_SAFE_INTEGER',()=>{
 const result=fiatCentsV1('9007199254740993000000000000000000',18,'ETH',market,'USD');assert.equal(result,1801439850948198600000n);assert.equal(formatFiatV1(123456789n,'EUR'),'€1,234,567.89');assert.equal(formatFiatV1(null,'USD'),'—');
});
test('pending sends move their actual reservation into operations without double counting',()=>{
 const rows=balances.map(b=>({...b,balance:{...b.balance,hasPendingTransfer:true}}));const p=portfolioOverviewV1(accounts,rows,market,'USD');assert.equal(p.occupied,50000n);assert.equal(p.reserved,0n);assert.equal(p.paused,150000n);assert.equal(p.available+p.reserved+p.occupied+p.paused,p.total);
});
test('malformed, negative and missing market observations are rejected',()=>{
 assert.throws(()=>normalizeMarketSnapshotV1({data:{currency:'EUR',rates:market.rates}}));assert.throws(()=>normalizeMarketSnapshotV1({data:{currency:'USD',rates:{...market.rates,BTC:'0'}}}));assert.throws(()=>fiatCentsV1('-1',18,'ETH',market,'USD'));
 const rows=normalizeMarketCandlesV1([[3,1,2,1,12],[1,1,2,1,10],[2,1,2,1,11],[2,1,2,1,11],[0,1,2,1,9]],1000,3000);assert.deepEqual(rows.map(r=>r.close),[10,11,12]);assert.throws(()=>normalizeMarketCandlesV1([[1,1,2,1,-10]],0,3000));
});

test('explicit environment selection values only that environment and never combines identical addresses',()=>{
 const testAccounts=accounts.map(a=>({...a,network:'testnet',networkId:a.networkId+'-test'})),testBalances=testAccounts.map((account,i)=>({...balances[i],account,balance:{...balances[i].balance,balanceAtomic:'0',spendableAtomic:'0',reservedAtomic:'0'}})),all=[...accounts,...testAccounts],observations=[...balances,...testBalances];
 assert.equal(portfolioOverviewV1(all,observations,market,'USD','mainnet').total,5500000n);
 const test=portfolioOverviewV1(all,observations,market,'USD','testnet');assert.equal(test.total,0n);assert.equal(test.rows.length,3);assert.ok(test.rows.every(r=>r.account.network==='testnet'));
 assert.equal(portfolioOverviewV1(all,balances,market,'USD','testnet').total,null,'mainnet observations cannot complete testnet balances');
 assert.throws(()=>portfolioOverviewV1(all,observations,market,'USD','unknown'),/PORTFOLIO_NETWORK/);
});

test('one small pending transfer pauses the rest without presenting it as reserved or spendable',()=>{
 const own=accounts[1],balance={...balances[1],balance:{...balances[1].balance,spendableAtomic:'0',reservedAtomic:'1000000000000000',hasPendingTransfer:true}};
 const p=portfolioOverviewV1([own],[balance],market,'USD');assert.equal(p.total,400000n);assert.equal(p.available,0n);assert.equal(p.reserved,0n);assert.equal(p.occupied,200n);assert.equal(p.paused,399800n);assert.equal(p.available+p.reserved+p.occupied+p.paused,p.total);
});
