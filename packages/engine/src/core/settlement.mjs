/** M3 transparent trusted-observer bridge. No ZK, foreign-chain verifier,
 * autonomous executor, network selection or private dispatch transport.
 * RPC access is supplied by the owned local-runtime harness, never created here.
 */
import { digest } from '../crypto/privacy.mjs';
import { validateSemanticIntent, semanticHash } from './semantic.mjs';

const U128 = (1n << 128n) - 1n;
const field = (name, type) => ({ name, type });
export const TERMS_FIELDS = Object.freeze([
  ...['intentHash','solDomain','btcDomain','solRecipient','btcRecipient'].map(n => field(n,'bytes32')),
  field('quoteVersion','uint32'),
  ...['protocolFee','solMin','solMax','solPriceNumerator','solPriceDenominator','btcPriceNumerator','btcPriceDenominator','btcMin','solFeeCap','btcFeeCap'].map(n => field(n,'uint128')),
].map(Object.freeze));
export const RESULT_FIELDS = Object.freeze([
  field('stage','uint8'), ...['effectTag','chainDomain','recipient'].map(n => field(n,'bytes32')),
  field('amount','uint128'),field('fee','uint128'),field('observedAt','uint64'),field('predecessor','bytes32'),
].map(Object.freeze));
export const DOMAIN_FIELDS = Object.freeze([
  field('name','string'),field('version','string'),field('chainId','uint256'),field('verifyingContract','address'),
].map(Object.freeze));
const typedFields = [field('escrowId','bytes32'),field('termsHash','bytes32'),field('policyVersion','uint32'),field('resultVersion','uint32'),...RESULT_FIELDS];
const invalidationFields = [field('escrowId','bytes32'),field('lockDigest','bytes32'),field('targetDigest','bytes32'),field('reason','bytes32'),field('issuedAt','uint64'),field('policyVersion','uint32')];
const check = (ok, reason) => { if (!ok) throw Object.assign(new Error(reason), { code: 'SETTLEMENT_BRIDGE_REJECTED' }); };
function uint(value, bits = 128) {
  check(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'CANONICAL_UNSIGNED_INTEGER_REQUIRED');
  const n = BigInt(value);check(n < (1n << BigInt(bits)), 'QUANTITY_OUT_OF_RANGE');return n;
}
function uintInput(value,bits=128) {
  check(typeof value==='string'||typeof value==='bigint'||(typeof value==='number'&&Number.isSafeInteger(value)),'EXACT_INTEGER_INPUT_REQUIRED');
  return uint(String(value),bits);
}
function word(value) { check(typeof value==='string' && /^0x[0-9a-f]{64}$/i.test(value),'BYTES32_REQUIRED');return value.toLowerCase(); }
function address(value) { check(typeof value==='string' && /^0x[0-9a-f]{40}$/i.test(value),'ADDRESS_REQUIRED');return value.toLowerCase(); }
function quantity(value) { check(typeof value==='string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value),'RPC_QUANTITY_REQUIRED');return BigInt(value); }
function safeNumber(value) { const n=BigInt(value);check(n>=0n&&n<=BigInt(Number.MAX_SAFE_INTEGER),'UNSAFE_TIME');return Number(n); }
function exact(value,keys) { check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),'EXACT_WORKFLOW_FIELDS_REQUIRED'); }
function chainIdentity(value) {
  check(typeof value==='string'||typeof value==='bigint'||(typeof value==='number'&&Number.isSafeInteger(value)),'CANONICAL_CHAIN_ID_REQUIRED');
  const result=uint(String(value),256);check(result>0n,'CHAIN_ID_REQUIRED');return result.toString();
}
const tagged = (domain, value) => '0x'+digest(domain,value);
const ceil = (a,b) => a/b+(a%b===0n?0n:1n);

/** The same residual-budget relation specified for the M2 intent, now also
 * checked by SemanticObserverEscrow against actual locked native input. */
export function quoteOutput(terms, inputAmount, solAmount) {
  const B=uintInput(inputAmount),S=uintInput(solAmount);
  const q=Object.fromEntries(TERMS_FIELDS.filter(f=>f.type==='uint128').map(f=>[f.name,uintInput(terms[f.name])]));
  check(B>q.protocolFee && q.solMin>0n && q.solMax>=q.solMin && q.btcMin>0n,'INVALID_QUOTE_RANGE');
  check(q.solPriceNumerator>0n && q.solPriceDenominator>0n && q.btcPriceNumerator>0n && q.btcPriceDenominator>0n,'INVALID_PRICE_RATIO');
  check(S>=q.solMin && S<=q.solMax,'SOL_OUTSIDE_AUTHORIZED_RANGE');
  const cost=ceil(S*q.solPriceNumerator,q.solPriceDenominator);
  check(B-q.protocolFee>=cost,'NEGATIVE_RESIDUAL');
  const result=(B-q.protocolFee-cost)*q.btcPriceDenominator/q.btcPriceNumerator;
  check(result>=q.btcMin && result<=U128,'INVALID_BTC_OUTPUT');return result.toString();
}

/** Model term projection only. Overrides do not carry the original owner's
 * authority to substitute native networks/recipients. Native M3 execution uses
 * termsFromEvmWorkflow and a new owner-authorized EVM open transaction instead. */
export function termsFromIntent(intent, {solDomain,btcDomain,solRecipient,btcRecipient}) {
  validateSemanticIntent(intent);
  const q=intent.quote;
  const result={intentHash:'0x'+semanticHash(intent),solDomain:word(solDomain),btcDomain:word(btcDomain),solRecipient:word(solRecipient),btcRecipient:word(btcRecipient),quoteVersion:q.version};
  for (const f of TERMS_FIELDS.filter(f=>f.type==='uint128')) result[f.name]=uint(q[f.name]).toString();
  quoteOutput(result,q.inputAmount,q.solMin);return result;
}

/** Explicit native test workflow. Its hash is part of the terms signed by the
 * owner's native open transaction, not the M2 Ed25519 model authorization. */
export function termsFromEvmWorkflow(workflow) {
  exact(workflow,['version','profile','clientSalt','owner','solver','authority','roles','quote','executeBy','claimBy']);
  check(workflow.version===3&&workflow.profile==='NATIVE_EVM_RELATION_TEST_ONLY','UNSUPPORTED_NATIVE_WORKFLOW');
  word(workflow.clientSalt);address(workflow.owner);address(workflow.solver);
  exact(workflow.authority,['chainId','genesisHash','contract','policyVersion']);
  const authority=workflow.authority;
  check(typeof authority.chainId==='string','CANONICAL_CHAIN_ID_REQUIRED');chainIdentity(authority.chainId);word(authority.genesisHash);address(authority.contract);
  check(Number.isInteger(authority.policyVersion)&&authority.policyVersion>0&&authority.policyVersion<2**32,'POLICY_REQUIRED');
  exact(workflow.roles,['sol','btc']);
  for(const role of Object.values(workflow.roles)){exact(role,['recipient']);address(role.recipient);}
  check(Number.isSafeInteger(workflow.executeBy)&&workflow.executeBy>=0&&Number.isSafeInteger(workflow.claimBy)&&workflow.claimBy>workflow.executeBy,'INVALID_WINDOWS');
  const q=workflow.quote;
  exact(q,['version','inputAmount',...TERMS_FIELDS.filter(f=>f.type==='uint128').map(f=>f.name),'rounding']);
  check(q.version===1&&q.rounding==='ceil-sol-cost-floor-btc-output-solver-keeps-dust','UNSUPPORTED_QUOTE');
  const result={intentHash:tagged('PAEG/native-evm-workflow/3',workflow),solDomain:evmDomain(authority.chainId,authority.genesisHash),btcDomain:evmDomain(authority.chainId,authority.genesisHash),
    solRecipient:recipientCommitment(workflow.roles.sol.recipient),btcRecipient:recipientCommitment(workflow.roles.btc.recipient),quoteVersion:q.version};
  for(const f of TERMS_FIELDS.filter(f=>f.type==='uint128'))result[f.name]=uint(q[f.name]).toString();
  quoteOutput(result,q.inputAmount,q.solMin);return result;
}

function domain(chainId, contract) {
  return {name:'SemanticObserverEscrow',version:'3',chainId:chainIdentity(chainId),verifyingContract:address(contract)};
}
export function typedResult({chainId,contract,escrowId,termsHash,policyVersion,result}) {
  check(Number.isInteger(policyVersion)&&policyVersion>0&&policyVersion<2**32,'POLICY_REQUIRED');
  const message={escrowId:word(escrowId),termsHash:word(termsHash),policyVersion,resultVersion:3};
  check(result && Object.keys(result).length===RESULT_FIELDS.length && RESULT_FIELDS.every(f=>Object.hasOwn(result,f.name)),'RESULT_FIELDS');
  for (const f of RESULT_FIELDS) {
    const v=result[f.name];
    message[f.name]=f.type==='bytes32'?word(v):uintInput(v,Number(f.type.slice(4))).toString();
  }
  check(['1','2'].includes(message.stage),'RESULT_STAGE');
  return {types:{EIP712Domain:DOMAIN_FIELDS.map(f=>({...f})),Result:typedFields.map(f=>({...f}))},primaryType:'Result',domain:domain(chainId,contract),message};
}
export function typedInvalidation({chainId,contract,escrowId,lockDigest,targetDigest,reason,issuedAt,policyVersion}) {
  check(Number.isInteger(policyVersion)&&policyVersion>0&&policyVersion<2**32,'POLICY_REQUIRED');
  return {types:{EIP712Domain:DOMAIN_FIELDS.map(f=>({...f})),Invalidation:invalidationFields.map(f=>({...f}))},primaryType:'Invalidation',domain:domain(chainId,contract),
    message:{escrowId:word(escrowId),lockDigest:word(lockDigest),targetDigest:word(targetDigest),reason:word(reason),issuedAt:uintInput(issuedAt,64).toString(),policyVersion}};
}

export function evmDomain(chainId, genesisHash) {
  return tagged('PAEG/M3/native-evm-domain',{family:'EVM',chainId:chainIdentity(chainId),genesisHash:word(genesisHash),selector:'top-level-native-value/1'});
}
export const recipientCommitment = recipient => tagged('PAEG/M3/native-evm-recipient',address(recipient));
export function requestCommitment({escrowId,stage,predecessor,amount,recipient}) {
  check(stage===1||stage===2,'RESULT_STAGE');return tagged('PAEG/M3/native-evm-request',{escrowId:word(escrowId),stage,predecessor:word(predecessor),amount:uintInput(amount).toString(),recipient:address(recipient)});
}

/** Trusts one supplied RPC and its current canonical view. A later reorg or a
 * dishonest node can invalidate this observation. No funds signing occurs here. */
export async function observeNativeEvmTransfer(rpc, {txHash,chainId,genesisHash,from,to,amount,maxFee,requestData,minimumBlock}) {
  const txId=word(txHash),genesisId=word(genesisHash),sender=address(from),recipient=address(to),data=word(requestData);
  const canonicalChain=chainIdentity(chainId);
  check((typeof minimumBlock==='number'&&Number.isSafeInteger(minimumBlock))||typeof minimumBlock==='bigint'||typeof minimumBlock==='string','EXPLICIT_MINIMUM_BLOCK_REQUIRED');
  const firstAllowedBlock=uint(String(minimumBlock),256);check(firstAllowedBlock>0n,'EXPLICIT_MINIMUM_BLOCK_REQUIRED');
  const expectedAmount=uintInput(amount),feeCap=uintInput(maxFee);
  try {
    const [actualChain,genesis,tx,receipt]=await Promise.all([
      rpc('eth_chainId',[]),rpc('eth_getBlockByNumber',['0x0',false]),rpc('eth_getTransactionByHash',[txId]),rpc('eth_getTransactionReceipt',[txId]),
    ]);
    check(sender!==recipient&&BigInt(recipient)>0xfffn,'UNSUPPORTED_RECIPIENT_POLICY');
    check(quantity(actualChain)===BigInt(canonicalChain),'WRONG_CHAIN');check(genesis && word(genesis.hash)===genesisId,'WRONG_GENESIS');
    check(tx && receipt && tx.blockHash && tx.blockNumber!==null,'NATIVE_TRANSFER_PENDING_OR_MISSING');
    check(word(tx.hash)===txId && word(receipt.transactionHash)===txId,'WRONG_TRANSACTION');
    check(quantity(receipt.status)===1n,'NATIVE_TRANSFER_FAILED');
    check(address(tx.from)===sender && address(tx.to)===recipient,'WRONG_NATIVE_PARTIES');
    check(quantity(tx.value)===expectedAmount,'WRONG_NATIVE_AMOUNT');
    check(typeof tx.input==='string' && tx.input.toLowerCase()===data,'WRONG_NATIVE_REQUEST_BINDING');
    const blockHash=word(receipt.blockHash),height=quantity(receipt.blockNumber);
    check(word(tx.blockHash)===blockHash && quantity(tx.blockNumber)===height,'INCONSISTENT_TRANSACTION_BLOCK');
    check(height>=firstAllowedBlock,'TRANSFER_PRECEDES_LOCK');
    const [block,canonical,recipientCode]=await Promise.all([rpc('eth_getBlockByHash',[blockHash,false]),rpc('eth_getBlockByNumber',[receipt.blockNumber,false]),rpc('eth_getCode',[recipient,receipt.blockNumber])]);
    check(block && canonical && word(block.hash)===blockHash && word(canonical.hash)===blockHash,'NONCANONICAL_NATIVE_BLOCK');
    check(quantity(block.number)===height && quantity(canonical.number)===height,'INCONSISTENT_BLOCK_HEIGHT');
    check(recipientCode==='0x','UNSUPPORTED_CONTRACT_RECIPIENT');
    check(address(receipt.from)===sender && address(receipt.to)===recipient,'INCONSISTENT_RECEIPT_PARTIES');
    const fee=quantity(receipt.gasUsed)*quantity(receipt.effectiveGasPrice);
    check(fee<=feeCap && fee<=U128,'NATIVE_FEE_CAP_EXCEEDED');
    const observedAt=safeNumber(quantity(block.timestamp));
    const effectTag=tagged('PAEG/M3/native-evm-effect',{family:'EVM',chainId:canonicalChain,genesisHash:genesisId,transactionHash:txId,selector:'top-level-native-value/1'});
    return {effectTag,chainDomain:evmDomain(canonicalChain,genesisId),recipient:recipientCommitment(recipient),amount:expectedAmount.toString(),fee:fee.toString(),observedAt,
      evidence:{classification:'TRUSTED_RPC_NATIVE_EVM_OBSERVATION',chainId:canonicalChain,genesisHash:genesisId,transaction:tx,receipt,blockHash,blockNumber:height.toString(),requestData:data,limitations:['one RPC canonical snapshot','no consensus/light-client verification','later reorg may invalidate','fees cover this local EVM receipt only','owner-selected recipient key control assumed; empty code alone does not prove it']}};
  } catch (error) {
    throw Object.assign(new Error(`Native observation rejected: ${error.message}`,{cause:error}),{code:'NATIVE_OBSERVATION_REJECTED'});
  }
}
