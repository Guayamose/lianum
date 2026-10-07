import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdentity } from '../../src/crypto/privacy.mjs';
import { semanticIntent } from '../../src/core/semantic.mjs';
import { termsFromIntent, termsFromEvmWorkflow, quoteOutput, typedResult, typedInvalidation, evmDomain, recipientCommitment, requestCommitment, observeNativeEvmTransfer } from '../../src/core/settlement.mjs';

const h=x=>'0x'+x.repeat(64),a=x=>'0x'+x.repeat(40),hex=x=>'0x'+BigInt(x).toString(16);
function setup() {
  const from=a('1'),to=a('2'),txHash=h('a'),genesisHash=h('b'),blockHash=h('c');
  const requestData=requestCommitment({escrowId:h('d'),stage:1,predecessor:h('e'),amount:'3000000',recipient:to});
  const fixture={chainId:hex(31337),genesis:{hash:genesisHash},tx:{hash:txHash,from,to,value:hex(3000000),input:requestData,blockHash,blockNumber:'0x5'},
    receipt:{transactionHash:txHash,from,to,status:'0x1',blockHash,blockNumber:'0x5',gasUsed:'0x5208',effectiveGasPrice:'0x2'},
    block:{hash:blockHash,number:'0x5',timestamp:hex(1700000005)},canonical:{hash:blockHash,number:'0x5'},code:'0x'};
  const rpc=async(method,params)=>{
    if(method==='eth_chainId')return fixture.chainId;
    if(method==='eth_getBlockByNumber')return params[0]==='0x0'?fixture.genesis:fixture.canonical;
    if(method==='eth_getTransactionByHash')return fixture.tx;
    if(method==='eth_getTransactionReceipt')return fixture.receipt;
    if(method==='eth_getBlockByHash')return fixture.block;
    if(method==='eth_getCode')return fixture.code;
    throw new Error('Unexpected mock RPC method');
  };
  return {fixture,rpc,expected:{txHash,chainId:31337,genesisHash,from,to,amount:'3000000',maxFee:'50000',requestData,minimumBlock:4}};
}

test('M3 bridge maps the authorized relation into explicit EVM test-role terms',()=>{
  const intent=semanticIntent(newIdentity().publicKey),domain=evmDomain(31337,h('b'));
  const terms=termsFromIntent(intent,{solDomain:domain,btcDomain:domain,solRecipient:recipientCommitment(a('1')),btcRecipient:recipientCommitment(a('2'))});
  assert.equal(quoteOutput(terms,intent.quote.inputAmount,'3000000'),'168750');
  assert.equal(quoteOutput(terms,intent.quote.inputAmount,'3500000'),'156250');
  assert.throws(()=>quoteOutput(terms,'1000000','3500001'),/AUTHORIZED_RANGE/);
  assert.throws(()=>quoteOutput({...terms,btcPriceNumerator:'0'},'1000000','3000000'),/PRICE_RATIO/);
  assert.throws(()=>quoteOutput({...terms,protocolFee:'999999'},'1000000','3000000'),/NEGATIVE_RESIDUAL/);
  assert.throws(()=>quoteOutput({...terms,btcPriceDenominator:((1n<<128n)-1n).toString(),btcPriceNumerator:'1'},'1000000','3000000'),/INVALID_BTC_OUTPUT/);
  assert.equal(quoteOutput(terms,'1000000','3000001'),'168749','ceil SOL cost, then floor BTC output');
  assert.throws(()=>quoteOutput(terms,Number.MAX_SAFE_INTEGER+1,'3000000'),/EXACT_INTEGER/);
  assert.throws(()=>quoteOutput(terms,['1000000'],'3000000'),/EXACT_INTEGER/);
  assert.equal(terms.solDomain,terms.btcDomain,'Both harness roles truthfully name the same EVM domain');
});

test('M3 typed results bind the exact native authority and predecessor',()=>{
  const result={stage:1,effectTag:h('a'),chainDomain:h('b'),recipient:h('c'),amount:'3',fee:'1',observedAt:1700000000,predecessor:h('d')};
  const inputs={chainId:31337,contract:a('1'),escrowId:h('e'),termsHash:h('f'),policyVersion:3,result};
  const typed=typedResult(inputs);
  assert.equal(typed.domain.name,'SemanticObserverEscrow');assert.equal(typed.domain.version,'3');
  assert.equal(typed.message.resultVersion,3);assert.equal(typed.message.predecessor,result.predecessor);
  result.predecessor=h('b');assert.equal(typed.message.predecessor,h('d'),'Returned payload does not alias caller result');
  assert.throws(()=>typedResult({...inputs,result:{...result,extra:true}}),/RESULT_FIELDS/);
  assert.throws(()=>typedResult({...inputs,result:{...result,amount:'01'}}),/CANONICAL/);
  assert.throws(()=>typedResult({...inputs,result:{...result,stage:3}}),/RESULT_STAGE/);
  assert.throws(()=>typedResult({...inputs,result:{...result,amount:Number.MAX_SAFE_INTEGER+1}}),/EXACT_INTEGER/);
  const invalid=typedInvalidation({...inputs,lockDigest:h('a'),targetDigest:h('b'),reason:h('c'),issuedAt:1700000001});
  assert.equal(invalid.primaryType,'Invalidation');assert.equal(invalid.message.lockDigest,h('a'));
});

test('M3 actual workflow authorization names EVM roles instead of silently translating the model intent',()=>{
  const workflow={version:3,profile:'NATIVE_EVM_RELATION_TEST_ONLY',clientSalt:h('1'),owner:a('2'),solver:a('3'),
    authority:{chainId:'31337',genesisHash:h('4'),contract:a('5'),policyVersion:3},roles:{sol:{recipient:a('6')},btc:{recipient:a('7')}},
    quote:semanticIntent(newIdentity().publicKey).quote,executeBy:1700000100,claimBy:1700000200};
  const terms=termsFromEvmWorkflow(workflow);
  assert.equal(terms.solDomain,evmDomain(31337,h('4')));assert.equal(terms.btcDomain,terms.solDomain);
  assert.equal(terms.solRecipient,recipientCommitment(a('6')));
  const changed=structuredClone(workflow);changed.roles.btc.recipient=a('8');
  assert.notEqual(termsFromEvmWorkflow(changed).intentHash,terms.intentHash);
  assert.throws(()=>termsFromEvmWorkflow({...workflow,profile:'SOLANA_NATIVE'}),/UNSUPPORTED_NATIVE_WORKFLOW/);
  assert.throws(()=>termsFromEvmWorkflow({...workflow,unexpected:'ignored?'}),/EXACT_WORKFLOW_FIELDS/);
});

test('M3 observer parser checks a complete native RPC fixture without claiming runtime evidence',async()=>{
  const {rpc,expected}=setup();
  const observed=await observeNativeEvmTransfer(rpc,expected);
  assert.equal(observed.amount,'3000000');assert.equal(observed.fee,'42000');
  assert.equal(observed.observedAt,1700000005);assert.equal(observed.chainDomain,evmDomain(31337,expected.genesisHash));
  assert.equal(observed.recipient,recipientCommitment(expected.to));
  assert.equal(observed.evidence.classification,'TRUSTED_RPC_NATIVE_EVM_OBSERVATION');
  const again=await observeNativeEvmTransfer(rpc,{...expected,maxFee:'60000'});
  assert.equal(again.effectTag,observed.effectTag,'Fee cap cannot create a second identity for one effect');
});

const mutations=[
  ['wrong sender',f=>{f.tx.from=a('3');}],['wrong recipient',f=>{f.tx.to=a('3');}],
  ['wrong amount',f=>{f.tx.value=hex(2999999);}],['wrong request commitment',f=>{f.tx.input=h('0');}],
  ['wrong chain',f=>{f.chainId='0x1';}],['wrong genesis',f=>{f.genesis.hash=h('0');}],
  ['failed execution',f=>{f.receipt.status='0x0';}],['pending receipt',f=>{f.receipt=null;}],
  ['transaction mismatch',f=>{f.receipt.transactionHash=h('0');}],['noncanonical block',f=>{f.canonical.hash=h('0');}],
  ['block height mismatch',f=>{f.tx.blockNumber='0x4';}],['excessive fee',f=>{f.receipt.effectiveGasPrice='0x3';}],
  ['contract recipient may forward value',f=>{f.code='0x6000';}],['receipt party mismatch',f=>{f.receipt.to=a('3');}],
];
for(const [label,mutate] of mutations)test(`M3 observer rejects ${label}`,async()=>{
  const {fixture,rpc,expected}=setup();mutate(fixture);
  await assert.rejects(observeNativeEvmTransfer(rpc,expected),{code:'NATIVE_OBSERVATION_REJECTED'});
});

test('M3 request context prevents honest observer from adopting a pre-lock or unrelated gift',async()=>{
  const {rpc,expected}=setup();
  await assert.rejects(observeNativeEvmTransfer(rpc,{...expected,minimumBlock:6}),/PRECEDES_LOCK/);
  const changed=requestCommitment({escrowId:h('f'),stage:1,predecessor:h('e'),amount:'3000000',recipient:expected.to});
  await assert.rejects(observeNativeEvmTransfer(rpc,{...expected,requestData:changed}),/REQUEST_BINDING/);
});

test('M3 one chain cannot gain alternate effect identities through textual aliases',async()=>{
  const {rpc,expected}=setup();
  const observations=await Promise.all([31337,'31337',31337n].map(chainId=>observeNativeEvmTransfer(rpc,{...expected,chainId})));
  assert.equal(new Set(observations.map(x=>x.effectTag)).size,1);
  for(const chainId of ['031337','0x7a69',0,-1,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>evmDomain(chainId,expected.genesisHash));
    await assert.rejects(observeNativeEvmTransfer(rpc,{...expected,chainId}));
  }
});

test('M3 observer policy rejects self-transfers, reserved recipients and missing predecessor height',async()=>{
  const {fixture,rpc,expected}=setup();
  fixture.tx.to=expected.from;fixture.receipt.to=expected.from;
  await assert.rejects(observeNativeEvmTransfer(rpc,{...expected,to:expected.from}),/RECIPIENT_POLICY/);
  await assert.rejects(observeNativeEvmTransfer(rpc,{...expected,to:'0x'+'0'.repeat(40)}),/RECIPIENT_POLICY/);
  const missing={...expected};delete missing.minimumBlock;
  await assert.rejects(observeNativeEvmTransfer(rpc,missing),/MINIMUM_BLOCK/);
});
