import { validateWrappedClaimOperationalRegistration } from '../../../claims/ingress/operational-registration-v2.mjs';
import { originalOwnedRuntimeRpcFailureV1 } from '@lianum/engine/chains/shared/runtime-harness';
import { inspectWrappedInstallationSourcesV2 } from '@lianum/components/verification/wrapped-installation';
/** Genuine-artifact-bound combined wrapped-custody and generic native graph bootstrap. This module never starts an EVM or owns its
 * lifecycle. Only a golden createLocalEvm capability can receive deployments.
 * Importing it loads no artifacts, compiler, prover, backend or runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evmFunctionSelector } from '../../../chains/evm/contracts/evm-code-hash.mjs';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { deriveNativeRuntimeCode, predictNativeCreateAddress, nativeStaticArguments,
  nativeProofCalldata } from '../../../execution/native/dispatch/native-deployment.mjs';
import { linkPrivateBytecode } from '@lianum/engine/notes/private-asset-runtime';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { NATIVE_QUORUM_PROFILE, normalizeNativeQuorumRegistry } from '@lianum/engine/evidence/native-quorum';
import { exactRecord, fixedArray, canonicalField, PROFILE_FIELD } from '@lianum/components/encoding/commitments';
import { buildWrappedClaimDeploymentPlanV1, claimConfigurationABI, claimArtifactMethod } from './wrapped-claim-deployment-plan-v1.mjs';
import { WRAPPED_CLAIM_LEDGER_ROLES_V1 as NATIVE_VALUE_LEDGER_ROLES, WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1 as FLAT_VERIFIER_ORDER, WRAPPED_CLAIM_VERIFIER_ORDER_V1, loadWrappedClaimDeploymentArtifactsV1 } from './wrapped-claim-deployment-artifacts-v1.mjs';
import { assertWrappedClaimOperatorBootstrapV1, assertWrappedClaimOperatorCustodyBootstrapV1, provisionWrappedClaimOperatorsV1, finishWrappedClaimOperatorsV1 } from '../../operators/wrapped/wrapped-claim-operator-bootstrap-v1.mjs';
import { consumeWrappedClaimGraphOperatorBootstrapRequestV1 } from '../../operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { verifyWrappedClaimGraphConstructorStorageV1 } from './wrapped-claim-deployment-checks-v1.mjs';
import { WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1 } from '../../releases/wrapped/wrapped-claim-release-v1.mjs';
import { assertOwnedWrappedClaimBootstrap, ownedWrappedClaimBootstrapBindings, recheckOriginalWrappedClaimCustodyV1, revokeWrappedClaimCustodyBootstrapV1 } from '../../operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs';
import { encodeClaimABI } from '@lianum/engine/claims/abi';
import { claimDomainCommitment } from '@lianum/engine/claims/framing';
import { evmRuntimeCodeHash } from '../../../chains/evm/contracts/evm-code-hash.mjs';
export const WRAPPED_CLAIM_SYSTEM_PROFILE_V1 = 'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1';
export const WRAPPED_CLAIM_ACTIVATION_BLOCKERS_V1 = WRAPPED_CLAIM_REQUIRED_ARTIFACTS_V1;
import { assertOwnedPoolAsset, createOwnedPoolAsset } from '../../../chains/shared/contracts/owned-pool-asset.mjs';

const ZERO32 = '0x' + '00'.repeat(32), ZERO_ADDRESS = '0x' + '00'.repeat(20);
const ownedSystems = new WeakMap(), ownedClaims = new WeakMap(), activeDeployments = new WeakSet(), attemptedBootstraps = new WeakSet();
const prefix = value => '0x' + value, bare = value => value.slice(2);
const word = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const keccak = code => '0x' + publicKeccak256(Buffer.from(code.slice(2), 'hex')).toString('hex');
const encodedWords = values => nativeStaticArguments(values.map(() => ({ type: 'uint256' })), values);
const digest = value => { assert.match(value, /^0x[0-9a-f]{64}$/, 'NATIVE_VALUE_DEPLOY_DIGEST'); return value; };
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/, 'NATIVE_VALUE_DEPLOY_ADDRESS'); return value; };
function freeze(value, seen = new Set()) {
  if (seen.has(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    seen.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
      if (Object.hasOwn(descriptor, 'value')) freeze(descriptor.value, seen);
    Object.freeze(value);
  }
  return value;
}
// BEGIN BOUNDED ORIGINAL DEPLOYMENT FAILURE DATA. No ownership/launch authority.
const deploymentFailures = new WeakMap(),privateDeploymentFailures = new WeakMap();
const ownData=(value,key)=>{try{const d=Object.getOwnPropertyDescriptor(value,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
const safeNamedCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,120}$/.test(value)?value:null;
const publicRpcReason=value=>['execution reverted','out of gas','intrinsic gas too low','max code size exceeded','insufficient funds for gas * price + value'].includes(value)?value:null;
const safeFailureReason=value=>safeNamedCode(value)??publicRpcReason(value);
const hexValue=(value,bytes)=>typeof value==='string'&&new RegExp('^0x[0-9a-fA-F]{'+bytes*2+'}$').test(value)?value.toLowerCase():null;
const quantityValue=value=>typeof value==='string'&&/^0x[0-9a-fA-F]{1,64}$/.test(value)?value.toLowerCase():null;
function safeErrorName(value,name){if(['Error','TypeError','RangeError','AssertionError','AggregateError','SyntaxError'].includes(name))return name;try{let proto=Object.getPrototypeOf(value);for(let depth=0;proto&&depth<8;depth++,proto=Object.getPrototypeOf(proto)){for(const [type,label]of [[TypeError,'TypeError'],[RangeError,'RangeError'],[SyntaxError,'SyntaxError'],[AggregateError,'AggregateError'],[Error,'Error']])if(proto===type.prototype)return label;}}catch{}return 'ErrorLike';}
function boundedFailureChain(error){const rows=[],seen=new Set();let value=error;while(value!==undefined&&value!==null&&rows.length<8&&!seen.has(value)){seen.add(value);const object=(typeof value==='object'||typeof value==='function')&&value!==null,name=object?ownData(value,'name'):null,code=object?ownData(value,'code'):null,rpcCode=object?ownData(value,'rpcCode'):null,message=object?ownData(value,'message'):null;const operator=object?ownData(value,'operator'):null,actual=object?ownData(value,'actual'):undefined,expected=object?ownData(value,'expected'):undefined;rows.push({name:object?safeErrorName(value,name):'NonError',code:safeNamedCode(code)??(Number.isInteger(code)&&code>=-32768&&code<=32768?code:null),rpcCode:Number.isInteger(rpcCode)&&rpcCode>=-32768&&rpcCode<=32768?rpcCode:null,reason:safeFailureReason(message),unrecognizedMessageOmitted:message!==undefined&&safeFailureReason(message)===null,operator:['strictEqual','deepStrictEqual','match','notStrictEqual','==','==='].includes(operator)?operator:null,actualStatus:['0x0','0x1',true,false,null].includes(actual)?actual:null,expectedStatus:['0x0','0x1',true,false,null].includes(expected)?expected:null});value=object?ownData(value,'cause'):undefined;}return {rows,truncated:value!==undefined&&value!==null};}
function publicReceiptIdentity(r){r=ownData(r,'receipt')??r;return {transactionHash:hexValue(ownData(r,'transactionHash'),32),blockHash:hexValue(ownData(r,'blockHash'),32),blockNumber:quantityValue(ownData(r,'blockNumber')),transactionIndex:quantityValue(ownData(r,'transactionIndex')),status:['0x0','0x1'].includes(ownData(r,'status'))?ownData(r,'status'):null,contractAddress:hexValue(ownData(r,'contractAddress'),20),gasUsed:quantityValue(ownData(r,'gasUsed'))};}
function publicTransactionIdentity(t){const request=ownData(t,'request'),receipt=ownData(t,'receipt'),trace=ownData(t,'trace'),returned=ownData(trace,'returnValue'),hex=typeof returned==='string'?returned.replace(/^0x/,''):null;return {phase:['before-broadcast','broadcast-result-unknown','broadcast','mined','mined-reverted','uncertain-no-resend'].includes(ownData(t,'phase'))?ownData(t,'phase'):null,transactionHash:hexValue(ownData(t,'transactionHash'),32),senderNonce:quantityValue(ownData(t,'senderNonce')),from:hexValue(ownData(request,'from'),20),to:hexValue(ownData(request,'to'),20),receipt:receipt?publicReceiptIdentity(receipt):null,traceFailed:typeof ownData(trace,'failed')==='boolean'?ownData(trace,'failed'):null,revertSelector:hex&&/^[0-9a-fA-F]{8,}$/.test(hex)?'0x'+hex.slice(0,8).toLowerCase():null,panicCode:hex&&/^4e487b71[0-9a-fA-F]{64}$/.test(hex)?'0x'+hex.slice(8).toLowerCase():null,safeRevertReason:safeFailureReason(ownData(ownData(t,'revert'),'reason'))};}
function privateFailureMessages(error){const rows=[],seen=new Set();let value=error;for(let depth=0;depth<8&&value&&(typeof value==='object'||typeof value==='function')&&!seen.has(value);depth++,value=ownData(value,'cause')){seen.add(value);const message=ownData(value,'message'),bytes=typeof message==='string'?Buffer.byteLength(message):null,safe=typeof message==='string'&&bytes<=1024&&!/[\x00-\x08\x0b-\x1f\x7f{}]/.test(message)&&!/(?:0x)?[0-9a-fA-F]{64,}|[A-Za-z0-9+/=_-]{96,}|(?:private[ _-]?key|password|mnemonic|secret|authorization|witness|signed[ _-]?(?:wire|transaction))\s*[:=]|https?:\/\//i.test(message);rows.push({name:safeErrorName(value,ownData(value,'name')),message:safe?message:null,messageBytes:bytes,messageOmitted:!safe});}return freeze(rows);}
function originalRpcFailureChain(error){const rows=[],seen=new Set();let value=error;for(let depth=0;depth<8&&value&&(typeof value==='object'||typeof value==='function')&&!seen.has(value);depth++,value=ownData(value,'cause')){seen.add(value);const original=originalOwnedRuntimeRpcFailureV1(value);if(original)rows.push(original);}return Object.freeze(rows);}
function retainOriginalDeploymentFailure(failure,error,cleanupFailure,context,transactions,receipts,deployments){
  // Diagnostic failure must not replace the original deployment error.
  const safeLabel=value=>typeof value==='string'&&value.length<=256&&/^[A-Za-z0-9_. /:-]+$/.test(value)?value:null;
  const base={schema:'WRAPPED_ORIGINAL_DEPLOYMENT_FAILURE_DATA_V1',rawRpcPayloadRetained:false,rawTransactionDataRetained:false,rawSignedWireRetained:false,keysOrWitnessesRetained:false};
  let value;
  try {
    const rows=value=>Array.isArray(value)?value:[],tx=rows(transactions),rc=rows(receipts),dp=rows(deployments);
    value={...base,context:Object.fromEntries(['stage','operation','role','source','contractName'].map(key=>[key,safeLabel(ownData(context,key))])),
      cause:boundedFailureChain(error),rpcFailures:originalRpcFailureChain(error).map(r=>({method:r.method??null,rpcCode:r.rpcCode??null,safeReason:publicRpcReason(r.message?.text),revertSelector:r.revert?.selector??null,panicCode:r.revert?.panicCode??null,safeRevertReason:publicRpcReason(r.revert?.reason?.text),projectionFailed:r.projectionFailed===true})),bootstrapCleanupFailure:cleanupFailure?boundedFailureChain(cleanupFailure):null,
      transactionCount:tx.length,receiptCount:rc.length,deploymentCount:dp.length,
      transactions:tx.slice(0,128).map(publicTransactionIdentity),receipts:rc.slice(0,128).map(publicReceiptIdentity),
      deployments:dp.slice(0,128).map(r=>({source:safeLabel(ownData(r,'source')),contractName:safeLabel(ownData(r,'contractName')),
        address:hexValue(ownData(r,'address'),20),nonce:typeof ownData(r,'nonce')==='string'&&/^[0-9]{1,78}$/.test(ownData(r,'nonce'))?ownData(r,'nonce'):null,
        codeHash:hexValue(ownData(r,'codeHash'),32),receipt:ownData(r,'receipt')?publicReceiptIdentity(ownData(r,'receipt')):null})),
      truncated:tx.length>128||rc.length>128||dp.length>128,projectionComplete:true,projectionFailure:null};
    if(Buffer.byteLength(JSON.stringify(value))>196608){
      value={...value,transactions:[],receipts:[],deployments:[],truncated:true,projectionComplete:false,projectionFailure:'WRAPPED_FAILURE_DIAGNOSTIC_BOUND'};
    }
    freeze(value);
  } catch {
    value=freeze({...base,context:null,cause:null,bootstrapCleanupFailure:null,transactionCount:null,receiptCount:null,deploymentCount:null,
      transactions:[],receipts:[],deployments:[],truncated:true,projectionComplete:false,projectionFailure:'WRAPPED_FAILURE_DIAGNOSTIC_PROJECTION_FAILED'});
  }
  deploymentFailures.set(failure,value);privateDeploymentFailures.set(failure,freeze({schema:'WRAPPED_ORIGINAL_PRIVATE_FAILURE_DETAIL_V1',causeMessages:privateFailureMessages(error),rpcFailures:originalRpcFailureChain(error)}));return value;
}
export function originalWrappedDeploymentFailureDataV1(error){assert.equal(arguments.length,1);let value=error;for(let depth=0;depth<8&&value&&(typeof value==='object'||typeof value==='function');depth++,value=ownData(value,'cause')){const original=deploymentFailures.get(value);if(original)return original;}return null;}
export function originalWrappedDeploymentFailurePrivateDataV1(error){assert.equal(arguments.length,1);let value=error;for(let depth=0;depth<8&&value&&(typeof value==='object'||typeof value==='function');depth++,value=ownData(value,'cause')){const original=privateDeploymentFailures.get(value);if(original)return original;}return null;}
// END BOUNDED ORIGINAL DEPLOYMENT FAILURE DATA.

async function drained(work) {
  const results = await Promise.allSettled(work.map(fn=>Promise.resolve().then(fn)));
  const failure = results.find(row=>row.status==='rejected');
  if(failure)throw failure.reason;return results.map(row=>row.value);
}
const canonicalType = input => input.type.startsWith('tuple')
  ? '(' + input.components.map(canonicalType).join(',') + ')' + input.type.slice(5) : input.type;
const libraryType = input => input.type.startsWith('tuple')
  ? input.internalType.replace(/^struct /, '') : input.type;
function method(artifact, signature) {
  const matches = artifact.abi.filter(item => item.type === 'function'
    && [canonicalType, libraryType].some(type => item.name + '(' + item.inputs.map(type).join(',') + ')' === signature));
  assert.equal(matches.length, 1, 'NATIVE_VALUE_DEPLOY_EXACT_ABI_METHOD');
  // Solidity library selectors retain nominal struct names even though their
  // argument words use the same static tuple encoding. Use the actual pinned
  // compiler identifier, never a guessed tuple selector for a library method.
  const identifiers = [canonicalType, libraryType].map(type => matches[0].name + '(' + matches[0].inputs.map(type).join(',') + ')');
  const actualSignature = identifiers.find(key => Object.hasOwn(artifact.evm.methodIdentifiers, key));
  assert.ok(actualSignature, 'NATIVE_VALUE_DEPLOY_COMPILER_METHOD_IDENTIFIER');
  const selector = evmFunctionSelector(actualSignature);
  assert.equal(artifact.evm.methodIdentifiers[actualSignature], selector, 'NATIVE_VALUE_DEPLOY_METHOD_SELECTOR');
  return { abi: matches[0], selector };
}
function staticArguments(inputs, values) {
  fixedArray(values, inputs.length);
  const scalarInputs = [], scalarValues = [];
  function flatten(input, value) {
    const fixed = /^(.*)\[([1-9][0-9]*)\]$/.exec(input.type);
    if (fixed) {
      const length = Number(fixed[2]); assert.ok(length <= 128, 'NATIVE_VALUE_DEPLOY_STATIC_ARRAY'); fixedArray(value, length);
      for (const child of value) flatten({ ...input, type: fixed[1] }, child);
    } else if (input.type === 'tuple') {
      exactRecord(value, input.components.map(item => item.name));
      for (const item of input.components) flatten(item, value[item.name]);
    } else {
      assert.equal(input.components, undefined, 'NATIVE_VALUE_DEPLOY_STATIC_SCALAR');
      scalarInputs.push({ type: input.type }); scalarValues.push(value);
    }
  }
  inputs.forEach((input, index) => flatten(input, values[index]));
  return nativeStaticArguments(scalarInputs, scalarValues);
}
function staticData(artifact, signature, args = []) {
  const entry = method(artifact, signature);
  return '0x' + entry.selector + staticArguments(entry.abi.inputs, args).slice(2);
}

/** The exact object returned after all deployment and storage checks, bound
 * to the exact still-owned runtime. A copied object/address list never passes. */
export function assertOwnedWrappedClaimGraphSystem(runtime, system) {
  assert.ok(ownedSystems.has(system) && ownedSystems.get(system).runtime === runtime, 'NATIVE_VALUE_OWNED_DEPLOYMENT_REQUIRED');
  ownedSystems.get(system).assertLive();
}

export function wrappedClaimGraphOperatorResources(runtime, system, request) {
  assertOwnedWrappedClaimGraphSystem(runtime, system);
  const entry = consumeWrappedClaimGraphOperatorBootstrapRequestV1(request, { runtime, system });
  assert.deepEqual(entry.publicKey, system.registry.quorum.keys[entry.signerIndex]);
  return ownedSystems.get(system).operators[entry.signerIndex];
}
export function assertOwnedWrappedClaimSystem(runtime, claims) {
  const entry = ownedClaims.get(claims);
  assert.ok(entry && entry.runtime === runtime, 'WRAPPED_CLAIM_OWNED_DEPLOYMENT_REQUIRED');
  assertOwnedWrappedClaimGraphSystem(runtime, entry.system);
  assert.equal(claims.flatSystem, entry.system, 'WRAPPED_CLAIM_EXACT_GRAPH_SYSTEM');
  assert.equal(entry.system.claims, claims, 'WRAPPED_CLAIM_EXACT_CLAIMS_SYSTEM');
}
function checkedOptions(runtime, options) {
  exactRecord(options, ['deploymentDomain','registryEpoch','pools','bootstrap','custodyBootstrap']);
  assertOwnedWrappedClaimBootstrap(runtime, options.custodyBootstrap);
  const custody = ownedWrappedClaimBootstrapBindings(options.custodyBootstrap);
  const metadata = assertWrappedClaimOperatorBootstrapV1(options.bootstrap);
  assertWrappedClaimOperatorCustodyBootstrapV1(options.bootstrap,{runtime,custodyBootstrap:options.custodyBootstrap});
  const deploymentDomain = digest(options.deploymentDomain);
  assert.notEqual(deploymentDomain, ZERO32, 'WRAPPED_CLAIM_DEPLOY_DOMAIN');
  assert.equal(typeof options.registryEpoch, 'string');
  assert.match(options.registryEpoch, /^(0|[1-9][0-9]*)$/); assert.ok(BigInt(options.registryEpoch)<1n<<64n);
  fixedArray(options.pools, 2);
  const pools = options.pools.map(pool => {
    exactRecord(pool, ['policy','deploymentDomain']);
    const policy = digest(pool.policy), deploymentDomain = digest(pool.deploymentDomain);
    assert.ok(policy !== ZERO32 && deploymentDomain !== ZERO32); return {policy,deploymentDomain};
  });
  assert.notEqual(pools[0].policy,pools[1].policy); assert.notEqual(pools[0].deploymentDomain,pools[1].deploymentDomain);
  return {deploymentDomain,registryEpoch:options.registryEpoch,rulesRoot:metadata.rulesRoot,
    attesterKeys:metadata.attesterKeys,adapterProfiles:metadata.adapterProfiles,bootstrap:options.bootstrap,
    custodyBootstrap:options.custodyBootstrap,custody,pools};
}
function viewFacade(runtime, record, artifact) {
  const facade = { ...record, artifact, selectors: artifact.evm.methodIdentifiers,
    data: (signature, args = []) => staticData(artifact, signature, args),
    call: async (signature, args = [], block = 'latest') => {
      const entry = method(artifact, signature);
      assert.ok(['view', 'pure'].includes(entry.abi.stateMutability), 'NATIVE_VALUE_DEPLOY_READ_ONLY_METHOD');
      // Reuse only this synchronous resolution; arguments and every RPC remain fresh.
      return runtime.call({ to: record.address, data: '0x' + entry.selector + staticArguments(entry.abi.inputs, args).slice(2) }, block);
    } };
  // Operator binding reads this exact public facade before system handles exist.
  // Freeze its code/ABI/call identity now; the aggregate system freezes later.
  return freeze(facade);
}
async function unchangedHead(runtime, header) {
  await runtime.assertCanonical(header);
  const current = await runtime.block();
  assert.equal(current.number, header.number, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
  assert.equal(current.hash, header.hash, 'NATIVE_VALUE_DEPLOY_HEAD_CHANGED');
}
async function expectedCodeAt(runtime, record, block) {
  const actual = await runtime.code(record.address, block);
  assert.equal(actual.toLowerCase(), record.expectedCode, 'NATIVE_VALUE_DEPLOY_COMPLETE_RUNTIME_MISMATCH');
  assert.equal(keccak(actual), record.codeHash, 'NATIVE_VALUE_DEPLOY_RUNTIME_HASH_MISMATCH');
}
function rawWords(raw, count) {
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'NATIVE_VALUE_DEPLOY_RETURN_WORDS');
  assert.equal(raw.length, 2 + 64 * count, 'NATIVE_VALUE_DEPLOY_RETURN_LENGTH');
  return Array.from({ length: count }, (_, i) => '0x' + raw.slice(2 + i * 64, 66 + i * 64));
}
async function originalCreation(runtime, record) {
  const hash = record.receipt.transactionHash;
  const entries = runtime.transactions.filter(entry => entry.transactionHash === hash);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_ORIGINAL_CREATION');
  const entry = entries[0];
  assert.equal(entry.phase, 'mined', 'CLAIM_BOOTSTRAP_MINED_CREATION');
  assert.equal(entry.request.to, undefined, 'CLAIM_BOOTSTRAP_CREATE_ONLY');
  assert.equal(entry.request.from, record.sender); assert.equal(entry.request.data, record.creationData);
  assert.equal(BigInt(entry.senderNonce).toString(), record.nonce);
  assert.equal(BigInt(entry.request.value ?? '0x0'), 0n, 'CLAIM_BOOTSTRAP_NO_VALUE');
  const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
  assert.ok(transaction && receipt, 'CLAIM_BOOTSTRAP_CREATION_HISTORY');
  assert.deepEqual(receipt, record.receipt, 'CLAIM_BOOTSTRAP_RECEIPT_CHANGED');
  assert.deepEqual(entry.receipt, receipt, 'CLAIM_BOOTSTRAP_ORIGINAL_RECEIPT');
  assert.equal(receipt.status, '0x1'); assert.equal(receipt.contractAddress, record.address);
  assert.equal(receipt.from, record.sender); assert.equal(receipt.to, null);
  assert.deepEqual(receipt.logs, [], 'CLAIM_BOOTSTRAP_UNEXPECTED_CONSTRUCTOR_LOG');
  assert.equal(transaction.hash, hash); assert.equal(transaction.to, null); assert.equal(transaction.from, record.sender);
  assert.equal(transaction.input, record.creationData); assert.equal(BigInt(transaction.nonce).toString(), record.nonce);
  assert.equal(BigInt(transaction.value), 0n); assert.equal(transaction.blockHash, receipt.blockHash);
  assert.equal(transaction.blockNumber, receipt.blockNumber); assert.equal(transaction.transactionIndex, receipt.transactionIndex);
  assert.equal(predictNativeCreateAddress(record.sender, BigInt(record.nonce)), record.address);
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  await expectedCodeAt(runtime, record, receipt.blockNumber);
  assert.equal(await runtime.keccak(record.expectedCode), record.codeHash, 'CLAIM_BOOTSTRAP_INDEPENDENT_HASH');
}
function abiValues(input, value) {
  const array = /^(.*)\[([0-9]*)\]$/.exec(input.type);
  if (array) {
    assert.ok(Array.isArray(value) && value.length <= 128, 'CLAIM_BOOTSTRAP_ABI_ARRAY');
    fixedArray(value, array[2] === '' ? value.length : Number(array[2]));
    return value.map(child => abiValues({ ...input, type: array[1] }, child));
  }
  if (input.type === 'tuple') {
    exactRecord(value, input.components.map(child => child.name));
    return Object.fromEntries(input.components.map(child => [child.name, abiValues(child, value[child.name])]));
  }
  if (input.type.startsWith('uint') && typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'CLAIM_BOOTSTRAP_INTEGER'); return String(value);
  }
  return value;
}
function facade(runtime, record, artifact) {
  const method = signature => claimArtifactMethod(artifact, signature);
  const encode = ({ abi, selector }, args) => {
    const inputs = abi.inputs; fixedArray(args, inputs.length);
    return prefix(selector + encodeClaimABI(inputs, inputs.map((input, i) => abiValues(input, args[i]))).slice(2));
  };
  const data = (signature, args = []) => encode(method(signature), args);
  return { ...record, artifact, data, call: async (signature, args = [], block = 'latest') => {
    const entry = method(signature);
    assert.ok(['pure', 'view'].includes(entry.abi.stateMutability), 'CLAIM_BOOTSTRAP_VIEW_ONLY');
    // No await or external callback separates resolution and argument encoding.
    return runtime.call({ to: record.address, data: encode(entry, args) }, block);
  } };
}

function artifactFor(binding, record) {
  const artifact = binding.bundle.contracts.compilation.contracts[record.source]?.[record.contractName];
  if (artifact) return artifact;
  const entries = Object.values(binding.bundle.verifiers).filter(entry => entry.source === record.source);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_FIXED_ARTIFACT_SOURCE');
  const result = entries[0].contracts[record.contractName]; assert.ok(result, 'CLAIM_BOOTSTRAP_FIXED_ARTIFACT'); return result;
}
async function originalCall(runtime,sender,to,data,nonce,receipt) {
  const entries=runtime.transactions.filter(entry=>entry.transactionHash===receipt.transactionHash);
  assert.equal(entries.length,1,'WRAPPED_CLAIM_ORIGINAL_CALL');const entry=entries[0];
  assert.equal(entry.phase,'mined');exactRecord(entry.request,['from','to','data','gas']);
  assert.equal(entry.request.from,sender);assert.equal(entry.request.to,to);assert.equal(entry.request.data,data);
  assert.equal(BigInt(entry.senderNonce),nonce);assert.deepEqual(entry.receipt,receipt);
  const [transaction,observed]=await Promise.all([runtime.transaction(receipt.transactionHash),runtime.receipt(receipt.transactionHash)]);
  assert.deepEqual(receipt,observed);assert.equal(receipt.status,'0x1');assert.equal(receipt.from,sender);
  assert.equal(receipt.to,to);assert.equal(receipt.contractAddress,null);
  assert.equal(transaction.hash,receipt.transactionHash);assert.equal(transaction.from,sender);assert.equal(transaction.to,to);
  assert.equal(transaction.input,data);assert.equal(BigInt(transaction.nonce),nonce);assert.equal(BigInt(transaction.value),0n);
  assert.equal(BigInt(transaction.gas),BigInt(entry.request.gas));
  for(const key of ['blockHash','blockNumber','transactionIndex'])assert.equal(transaction[key],receipt[key]);
  await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);
  assert.equal(await runtime.nonce(sender,'pending'),nonce+1n,'WRAPPED_CLAIM_ORIGINAL_CALL_NONCE');
}
async function seal(binding, target) {
  const { runtime } = binding, sender = runtime.accounts[0], nonce = await runtime.nonce(sender, 'pending');
  const data = target.data('seal()');
  inspectWrappedInstallationSourcesV2();
  const receipt = await runtime.send('seal native claim ' + target.contractName, { from: sender, to: target.address, data });
  binding.sealReceipts.push(receipt);
  const entries = runtime.transactions.filter(entry => entry.transactionHash === receipt.transactionHash);
  assert.equal(entries.length, 1, 'CLAIM_BOOTSTRAP_ORIGINAL_SEAL');
  const entry = entries[0]; assert.equal(entry.phase, 'mined');
  exactRecord(entry.request, ['from', 'to', 'data', 'gas']);
  assert.equal(entry.request.from, sender); assert.equal(entry.request.to, target.address); assert.equal(entry.request.data, data);
  assert.equal(BigInt(entry.senderNonce), nonce); assert.deepEqual(entry.receipt, receipt);
  const [transaction, observed] = await Promise.all([runtime.transaction(receipt.transactionHash), runtime.receipt(receipt.transactionHash)]);
  assert.deepEqual(receipt, observed, 'CLAIM_BOOTSTRAP_SEAL_RECEIPT_CHANGED');
  assert.equal(receipt.status, '0x1'); assert.equal(receipt.from, sender); assert.equal(receipt.to, target.address);
  assert.equal(receipt.contractAddress, null); assert.deepEqual(receipt.logs, []);
  assert.equal(transaction.hash, receipt.transactionHash); assert.equal(transaction.from, sender);
  assert.equal(transaction.to, target.address); assert.equal(transaction.input, data);
  assert.equal(BigInt(transaction.gas), BigInt(entry.request.gas));
  assert.equal(BigInt(transaction.value), 0n); assert.equal(BigInt(transaction.nonce), nonce);
  assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
  assert.equal(transaction.transactionIndex, receipt.transactionIndex);
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'CLAIM_BOOTSTRAP_SEAL_NONCE');
}
async function checkedStorage(binding, flatSystem) {
  const { runtime, plan, authority, gateways, wrappers } = binding, header = await runtime.block(), block = header.number;
  for (const record of [...binding.deployments, flatSystem.hub, ...flatSystem.pools, ...Object.values(binding.libraries)])
    await expectedCodeAt(runtime, record, block);
  const expect = async (target, signature, args, values) => assert.equal(await target.call(signature, args, block),
    prefix(values.map(value => word(value).slice(2)).join('')), 'CLAIM_BOOTSTRAP_STORAGE_' + signature);
  await expect(authority, 'hub()', [], [flatSystem.hub.address]); await expect(authority, 'isSealed()', [], [1]);
  await expect(flatSystem.hub, 'claimAuthority()', [], [authority.address]);
  for (let i = 0; i < 2; i++) {
    const gateway = gateways[i], wrapper = wrappers[i], config = plan.configs[i], pool = flatSystem.pools[i];
    const configurationMethod = gateway.artifact.abi.find(item => item.type === 'function' && item.name === 'claimConfiguration');
    assert.equal(await gateway.call('claimConfiguration()', [], block),
      encodeClaimABI(configurationMethod.outputs, [claimConfigurationABI(config)]), 'CLAIM_BOOTSTRAP_FULL_CONFIGURATION');
    const verifierMethod = gateway.artifact.abi.find(item => item.type === 'function' && item.name === 'verifierConfiguration');
    assert.equal(await gateway.call('verifierConfiguration()', [], block),
      encodeClaimABI(verifierMethod.outputs, [gateway.deployment.verifiers]), 'CLAIM_BOOTSTRAP_FULL_VERIFIER_CONFIGURATION');
    for (const [name, value] of Object.entries({ hub: flatSystem.hub.address, pool: pool.address,
      authority: authority.address, authorityCodeHash: authority.codeHash,
      codecCodeHash: binding.libraries.nativeClaimCodec.codeHash, validationCodeHash: binding.libraries.nativeClaimValidation.codeHash,
      configurationCommitment: gateway.configurationCommitment, claimDomain: prefix(claimDomainCommitment(config)),
      custodyInventoryDomain: prefix(config.custodyInventoryDomain),
      nativeAssetKey: prefix(sha(Buffer.from(word(config.nativeFamily).slice(2) + config.nativeGenesis, 'hex'))),
      isSealed: 1, MAX_INTENTS: 16, MAX_TICKETS: 32, BITCOIN_OUTPUT_FLOOR: 1000, MAX_PERMIT_SECONDS: 30 }))
      await expect(gateway, name + '()', [], [value]);
    for (const name of ['claimSequence', 'intentCount', 'ticketCount', 'reservedRefundTickets', 'nextTicketNonce',
      'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'activePayout', 'liabilities'])
      await expect(gateway, name + '()', [], [0]);
    for (let n = 0; n < 16; n++) await expect(gateway, 'intentHistory(uint256)', [n], [0]);
    for (let n = 0; n < 32; n++) await expect(gateway, 'ticketHistory(uint256)', [n], [0]);
    await expect(wrapper, 'gateway()', [], [gateway.address]); await expect(wrapper, 'decimals()', [], [i === 0 ? 8 : 9]);
    await expect(wrapper, 'totalSupply()', [], [0]);
    for (const holder of [runtime.accounts[0], gateway.address, pool.address]) await expect(wrapper, 'balanceOf(address)', [holder], [0]);
    await expect(wrapper, 'allowance(address,address)', [gateway.address, pool.address], [0]);
    await expect(authority, 'gateways(uint256)', [i], [gateway.address]);
    await expect(authority, 'gatewayPool(address)', [gateway.address], [pool.address]);
    await expect(authority, 'gatewayCodeHash(address)', [gateway.address], [gateway.codeHash]);
    await expect(authority, 'gatewayConfiguration(address)', [gateway.address], [gateway.configurationCommitment]);
    await expect(authority, 'reservedReceiptCapacity(address)', [pool.address], [0]);
    for (let j = 0; j < 2; j++) await expect(gateway, 'payoutEndpointCommitments(uint256)', [j], [gateway.payoutEndpointCommitments[j]]);
    const observed = await binding.assetCapabilities[i].read({ holder: pool.address, blockNumber: block });
    assert.equal(observed.blockHash, header.hash); assert.equal(observed.totalSupply, '0'); assert.equal(observed.balance, '0');
  }
  for (const record of binding.deployments) await originalCreation(runtime, record);
  await unchangedHead(runtime, header);
  return freeze({ blockNumber: block, blockHash: header.hash, completeRuntimesMatched: true,
    completeConfigurationsMatched: true, originalDeploymentReceiptsMatched: true,
    gatewaysSealed: true, authoritySealed: true, initialLiabilitiesZero: true, proofAcceptanceEstablished: false });
}
/** Deploy only the exact reviewed combined verifier bundle and linked graph/custody ledgers.
 * Options contain public policy/domain data and an ORIGINAL private bootstrap.
 * No caller signer, audit, transport, hash, key or artifact callback exists.
 * The claim authority is deployed, nonzero and completely code-pinned. */
export async function deployWrappedClaimGraphSystemV1(input) {
  assert.equal(arguments.length,1,'WRAPPED_CLAIM_DEPLOY_ARGUMENTS');inspectWrappedInstallationSourcesV2();
  exactRecord(input, ['runtime','options']); const { runtime, options } = input;
  // All evidence is checked before ownership, allocation or the first send.
  const loadedBundle = await loadWrappedClaimDeploymentArtifactsV1();
  await assertLocalEvm(runtime);inspectWrappedInstallationSourcesV2();
  assert.ok(!activeDeployments.has(runtime), 'NATIVE_VALUE_DEPLOY_CONCURRENT_BOOTSTRAP');
  const configuration = checkedOptions(runtime, options), sender = address(runtime.accounts[0]);
  assert.equal(runtime.metadata.chainId, '31337', 'NATIVE_VALUE_DEPLOY_LOCAL_CHAIN');
  assert.deepEqual(configuration.custody.bundle.provenance,loadedBundle.provenance,'WRAPPED_CLAIM_CUSTODY_ARTIFACT_RELEASE_CHANGED');
  assert.ok(!attemptedBootstraps.has(configuration.custodyBootstrap), 'WRAPPED_CLAIM_BOOTSTRAP_ALREADY_ATTEMPTED');
  attemptedBootstraps.add(configuration.custodyBootstrap);
  const deployments = [], registrationReceipts = [], generatedLibraries = new Map(), visiting = new Set();
  const claimBinding = { ...configuration.custody, deployments: [], sealReceipts: [] };
  let plan, combinedPlan, bundle;
  let failureContext={stage:"custody-recheck",operation:"recheck",role:null,source:null,contractName:null};
  activeDeployments.add(runtime);
  try {
    await recheckOriginalWrappedClaimCustodyV1(configuration.custodyBootstrap);
    // All generated source/key/compiler validation completes before first send.
    bundle = loadedBundle;
    async function deploy(source, contractName, artifact, immutableNames, immutableValues, links = {}, planned) {
      failureContext={...failureContext,source,contractName,operation:'nonce-and-runtime-plan'};
      const nonce = await runtime.nonce(sender, 'pending');
      const target = predictNativeCreateAddress(sender, nonce);
      if (planned) {
        assert.equal(nonce.toString(), planned.nonce, 'NATIVE_VALUE_DEPLOY_NONCE_CHANGED');
        assert.equal(target, planned.address, 'NATIVE_VALUE_DEPLOY_PLANNED_ADDRESS');
      }
      assert.equal(await runtime.code(target), '0x', 'NATIVE_VALUE_DEPLOY_CREATE_ADDRESS_OCCUPIED');
      const astLibrary = contractName !== 'HonkVerifier' && !['PrivateFlatReceiptHubWrappedClaimV1', 'PrivateFlatAssetNotePool'].includes(contractName);
      const guardedLibrary = astLibrary && /^73(?:00){20}3014/.test(artifact.evm.deployedBytecode.object);
      const expectedCode = deriveNativeRuntimeCode({ artifact, deployedAddress: target, libraries: links,
        immutableNames, immutableValues, isLibrary: guardedLibrary });
      const constructorInputs = artifact.abi.find(item => item.type === 'constructor')?.inputs ?? [];
      const constructorData = planned?.constructorData ?? staticArguments(constructorInputs, []);
      const creationData = '0x' + linkPrivateBytecode(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, links) + constructorData.slice(2);
      assert.ok((expectedCode.length-2)/2<=24576,'NATIVE_VALUE_DEPLOY_RUNTIME_LIMIT');
      assert.ok((creationData.length - 2) / 2 <= 49152, 'NATIVE_VALUE_DEPLOY_INITCODE_LIMIT');
      if (planned) {
        assert.equal(expectedCode, planned.runtimeCode, 'NATIVE_VALUE_DEPLOY_PLANNED_RUNTIME');
        assert.equal(creationData, planned.creationData, 'NATIVE_VALUE_DEPLOY_PLANNED_CREATION');
      }
      const expectedHash = keccak(expectedCode);
      inspectWrappedInstallationSourcesV2();
      failureContext.operation='send-creation';
      const receipt = await runtime.send('deploy flat ' + source + ':' + contractName, { from: sender, data: creationData });
      failureContext.operation='check-creation-receipt';
      assert.equal(address(receipt.contractAddress), target, 'NATIVE_VALUE_DEPLOY_ACTUAL_ADDRESS');
      const records = runtime.transactions.filter(record => record.transactionHash === receipt.transactionHash);
      assert.equal(records.length, 1, 'NATIVE_VALUE_DEPLOY_TRANSACTION_RECORD');
      const transaction = records[0];
      assert.equal(transaction.phase, 'mined'); assert.equal(transaction.request.from, sender);
      assert.equal(BigInt(transaction.senderNonce), nonce); assert.equal(transaction.request.data, creationData);
      assert.equal(BigInt(transaction.request.value ?? '0x0'), 0n, 'NATIVE_VALUE_DEPLOY_NO_VALUE');
      assert.equal(await runtime.nonce(sender, 'pending'), nonce + 1n, 'NATIVE_VALUE_DEPLOY_NEXT_NONCE');
      await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
      const record = { source, contractName, address: target, nonce: nonce.toString(), receipt, expectedCode,
        sender, creationData, runtimeCode: expectedCode, codeHash: expectedHash, runtimeBytes: (expectedCode.length - 2) / 2,
        libraries: { ...links }, immutableValues, constructorData, creationSHA256: sha(Buffer.from(creationData.slice(2), 'hex')),
        proofAcceptanceClaim: false };
      failureContext.operation='check-complete-runtime';
      await expectedCodeAt(runtime, record, receipt.blockNumber);
      assert.equal(await runtime.keccak(expectedCode), expectedHash, 'NATIVE_VALUE_DEPLOY_INDEPENDENT_KECCAK');
      deployments.push(record); await originalCreation(runtime, record); freeze(record); return record;
    }
    const libraries = {};
    for (const role of ['poseidon2Domains', 'hubCodec']) {
      failureContext={stage:'base-libraries',operation:'select',role,source:null,contractName:null};
      const [source, name] = NATIVE_VALUE_LEDGER_ROLES[role], artifact = bundle.ledger.artifacts[role];
      libraries[role] = viewFacade(runtime, await deploy(source, name, artifact, {}, {}), artifact);
    }
    async function verifierLinks(entry, artifact) {
      const links = {};
      for (const references of [artifact.evm.bytecode.linkReferences, artifact.evm.deployedBytecode.linkReferences]) {
        for (const [source, names] of Object.entries(references ?? {})) for (const name of Object.keys(names)) {
          assert.equal(source, entry.source, 'NATIVE_VALUE_DEPLOY_CROSS_SOURCE_LIBRARY');
          const key = source + ':' + name;
          if (!generatedLibraries.has(key)) {
            assert.ok(!visiting.has(key), 'NATIVE_VALUE_DEPLOY_CYCLIC_LIBRARY'); visiting.add(key);
            const library = entry.contracts[name]; assert.ok(library, 'NATIVE_VALUE_DEPLOY_MISSING_LIBRARY');
            const dependencies = await verifierLinks(entry, library);
            const record = await deploy(source, name, library, {}, {}, dependencies);
            generatedLibraries.set(key, viewFacade(runtime, record, library)); visiting.delete(key);
          }
          links[key] = generatedLibraries.get(key).address;
        }
      }
      return links;
    }
    const verifiers = {};
    for (const [role] of FLAT_VERIFIER_ORDER) {
      failureContext={stage:'graph-verifiers',operation:'select',role,source:null,contractName:null};
      const entry = bundle.verifiers[role], links = await verifierLinks(entry, entry.artifact);
      const record = await deploy(entry.source, 'HonkVerifier', entry.artifact, entry.immutableNames, entry.immutableValues, links);
      verifiers[role] = { ...viewFacade(runtime, record, entry.artifact), lineage: entry.lineage };
    }
    failureContext={stage:'combined-plan',operation:'plan-and-domain',role:null,source:null,contractName:null};
    const planningHeader = await runtime.block();
    await expectedCodeAt(runtime, libraries.poseidon2Domains, planningHeader.number);
    const hashFields = async fields => {
      fixedArray(fields, 18);
      assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, 1n, 14n], 'NATIVE_VALUE_DEPLOY_DOMAIN_PURPOSE');
      const values = [];
      for (let index = 4; index < fields.length; index += 2) {
        const high = fields[index], low = fields[index + 1];
        assert.ok(typeof high === 'bigint' && high >= 0n && high < 1n << 128n
          && typeof low === 'bigint' && low >= 0n && low < 1n << 128n, 'NATIVE_VALUE_DEPLOY_DOMAIN_LIMBS');
        values.push('0x' + high.toString(16).padStart(32, '0') + low.toString(16).padStart(32, '0'));
      }
      const raw = await libraries.poseidon2Domains.call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)', values, planningHeader.number);
      const result = rawWords(raw, 1)[0].slice(2); canonicalField(result, true);
      await unchangedHead(runtime, planningHeader); return result;
    };
    combinedPlan = await buildWrappedClaimDeploymentPlanV1({bundle, sender,
      nextNonce:(await runtime.nonce(sender,'pending')).toString(),evmGenesis:configuration.custody.evmGenesis,
      configuration:{deploymentDomain:configuration.deploymentDomain,registryEpoch:configuration.registryEpoch,
        rulesRoot:configuration.rulesRoot,attesterKeys:configuration.attesterKeys,
        adapterProfiles:configuration.adapterProfiles,pools:configuration.pools},
      rules:configuration.custody.rules,nativeRoles:configuration.custody.nativeRoles,
      inventoryDomains:configuration.custody.inventoryDomains,
      libraries:Object.fromEntries(Object.entries(libraries).map(([role,value])=>[role,{address:value.address,codeHash:value.codeHash}])),
      verifiers:Object.fromEntries(Object.entries(verifiers).map(([role,value])=>[role,{address:value.address,codeHash:value.codeHash}])),
    },{hashFields});
    plan = combinedPlan.flatPlan; claimBinding.plan = combinedPlan;
    await unchangedHead(runtime, planningHeader);
    for (const proposed of [...combinedPlan.deployments,plan.hub,...plan.pools])
      assert.equal(await runtime.code(proposed.address, planningHeader.number),'0x','WRAPPED_CLAIM_CREATE_OCCUPIED');
    await unchangedHead(runtime,planningHeader);
    const byAddress = new Map();
    for (const proposed of combinedPlan.deployments) {
      failureContext={stage:'claim-deployments',operation:'select',role:proposed.contractName,source:proposed.source,contractName:proposed.contractName};
      const artifact = artifactFor(claimBinding, proposed);
      const deployed = await deploy(proposed.source,proposed.contractName,artifact,
        proposed.immutableNames,proposed.immutableValues,proposed.libraries,proposed);
      const record = freeze({...proposed,...deployed}); claimBinding.deployments.push(record);
      byAddress.set(record.address,facade(runtime,record,artifact));
    }
    const wrap = record => byAddress.get(record.address);
    claimBinding.authority=wrap(combinedPlan.authority);claimBinding.gateways=combinedPlan.gateways.map(wrap);
    claimBinding.wrappers=combinedPlan.wrappers.map(wrap);
    claimBinding.verifiers=Object.fromEntries(Object.entries(combinedPlan.verifiers).map(([role,record])=>[role,
      {...wrap(record),lineage:bundle.verifiers[role].lineage}]));
    claimBinding.libraries={...libraries,...Object.fromEntries(Object.entries(combinedPlan.libraries).map(([role,record])=>[role,wrap(record)])),
      ...Object.fromEntries(Object.entries(combinedPlan.generatedLibraries).map(([role,record])=>[role,wrap(record)]))};
    claimBinding.assetCapabilities=[];
    for (const [i,wrapper] of claimBinding.wrappers.entries()) claimBinding.assetCapabilities.push(await createOwnedPoolAsset({runtime,
      deployment:{address:wrapper.address,transactionHash:wrapper.receipt.transactionHash,expectedCode:wrapper.expectedCode,codeHash:wrapper.codeHash},
      symbol:i===0?'cBTC':'cSOL',decimals:i===0?8:9,kind:'ERC20'}));
    failureContext={stage:'graph-hub',operation:'select',role:'hub',source:null,contractName:null};
    const hub = viewFacade(runtime, await deploy('wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol', 'PrivateFlatReceiptHubWrappedClaimV1', bundle.ledger.artifacts.hub,
      bundle.ledger.immutableNames.hub, plan.hub.immutableValues, plan.links, plan.hub), bundle.ledger.artifacts.hub);
    const pools = [];
    for (const [index, projected] of plan.pools.entries()) {
      failureContext={stage:'graph-pools',operation:'select',role:'pool-'+index,source:null,contractName:null};
      const record = await deploy('PrivateFlatAssetNotePool.sol', 'PrivateFlatAssetNotePool', bundle.ledger.artifacts.pool,
        bundle.ledger.immutableNames.pool, projected.immutableValues, plan.links, projected);
      const assetCapability = claimBinding.assetCapabilities[index];
      pools.push({ ...viewFacade(runtime, record, bundle.ledger.artifacts.pool), ...projected.immutableValues,
        assetCapability, assetMetadata: assetCapability.metadata,
        domain: projected.domain, domainCommitment: projected.domainCommitment });
    }
    for (const pool of pools) {
      failureContext={stage:'graph-pool-registration',operation:'registerPoolDomain',role:'pool',source:null,contractName:null};
      const registrationNonce=await runtime.nonce(sender,'pending');
      const registrationData=hub.data('registerPoolDomain(address)',[pool.address]);
      inspectWrappedInstallationSourcesV2();
      const receipt = await runtime.send('register flat pool domain', { from: sender, to: hub.address,
        data: registrationData });
      registrationReceipts.push(receipt);
      await originalCall(runtime,sender,hub.address,registrationData,registrationNonce,receipt);
      await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    }
    failureContext={stage:'graph-constructor-storage',operation:'verify',role:null,source:null,contractName:null};
    const bootstrap = await verifyWrappedClaimGraphConstructorStorageV1(runtime, hub, pools, libraries, verifiers, [...generatedLibraries.values()], plan);
    const commonAsset = pools.every(pool => pool.asset === pools[0].asset && pool.assetCodeHash === pools[0].assetCodeHash)
      ? pools[0] : null;
    const system = { classification: 'OWNED_LOCAL_WRAPPED_CLAIM_NATIVE_GRAPH_SYSTEM_NOT_PROOF_ACCEPTANCE',
      profile:WRAPPED_CLAIM_SYSTEM_PROFILE_V1, claimsEnabled:true, custodyRegistration:combinedPlan.custodyRegistration, adapterProfiles:plan.adapterProfiles, chainId: '31337', sender,
      plan, hub, pools, libraries, generatedLibraries: Object.fromEntries(generatedLibraries), verifiers,
      registry: plan.registry, hubDomain: plan.hubDomain, registryCommitment: plan.registryCommitment,
      verifierSetCommitment: plan.verifierSetCommitment, ledgerNamespace: plan.ledgerNamespace,
      asset: commonAsset?.asset ?? null, assetCodeHash: commonAsset?.assetCodeHash ?? null,
      assetIdentity: commonAsset?.assetIdentity ?? null, assetMetadata: commonAsset?.assetMetadata ?? null,
      assetCapability: commonAsset?.assetCapability ?? null,
      deployments: [...deployments], registrationReceipts: [...registrationReceipts], bootstrap,
      provenance: bundle.provenance,
      verify: async (role, proof, publicInputs, block = 'latest') => {
        assertOwnedWrappedClaimGraphSystem(runtime, system); await assertLocalEvm(runtime);
        const spec = WRAPPED_CLAIM_VERIFIER_ORDER_V1.find(([name]) => name === role); assert.ok(spec, 'NATIVE_VALUE_DEPLOY_VERIFIER_ROLE');
        fixedArray(publicInputs, spec[1]);
        const verifier = verifiers[role] ?? claimBinding.verifiers[role]; await expectedCodeAt(runtime, verifier, block);
        const raw = await runtime.call({ to: verifier.address,
          data: nativeProofCalldata(verifier.artifact, 'verify(bytes,bytes32[])', proof, publicInputs) }, block);
        assert.ok(raw === encodedWords([0]) || raw === encodedWords([1]), 'NATIVE_VALUE_DEPLOY_VERIFIER_BOOLEAN');
        return raw === encodedWords([1]);
      },
      assetBalance: (holder, block = 'latest') => {
        assert.ok(commonAsset, 'NATIVE_VALUE_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET');
        return commonAsset.assetCapability.balance(holder, block);
      },
      get receipts() { return freeze(structuredClone(runtime.receipts)); },
    };
    failureContext={stage:'claim-seals-and-storage',operation:'recheck-and-seal',role:null,source:null,contractName:null};
    await recheckOriginalWrappedClaimCustodyV1(configuration.custodyBootstrap);
    for (const gateway of claimBinding.gateways) await seal(claimBinding,gateway);
    await seal(claimBinding,claimBinding.authority);
    const claimStorage = await checkedStorage(claimBinding,system);
    const claims = {classification:'OWNED_LOCAL_WRAPPED_CUSTODIAL_CLAIMS_NOT_PROOF_ACCEPTANCE',flatSystem:system,
      claimIngressProfile:'native_claim_ingress_nonce_registry_v3',claimDischargeProfile:'native_claim_discharge_registry_v2',
      authority:claimBinding.authority,gateways:claimBinding.gateways,wrappers:claimBinding.wrappers,
      verifiers:claimBinding.verifiers,libraries:claimBinding.libraries,verifierPins:combinedPlan.verifierPins,
      configs:combinedPlan.configs,policies:combinedPlan.policies,custodyRegistration:combinedPlan.custodyRegistration,
      nativeRuntimes:configuration.custody.nativeRuntimes,journalRoot:configuration.custody.journalRoot,
      deployments:[...claimBinding.deployments],sealReceipts:[...claimBinding.sealReceipts],bootstrap:claimStorage,
      provenance:bundle.provenance,limitations:['Owned local synthetic custody; not independently operated threshold custody.',
        'Deployment establishes code and state identity, not proof acceptance or future backing.']};
    system.claims=claims;
    failureContext={stage:'operator-provision',operation:'provision',role:null,source:null,contractName:null};
    const operatorResources = await provisionWrappedClaimOperatorsV1(configuration.bootstrap, {
      runtime, registry:plan.registry, adapterProfiles:plan.adapterProfiles });
    // No caller receives this object until all four binds and the final full
    // canonical receiver snapshot succeed. Any failure revokes the private brand.
    const live = () => { inspectWrappedInstallationSourcesV2();assertWrappedClaimOperatorBootstrapV1(configuration.bootstrap); assertOwnedWrappedClaimBootstrap(runtime,configuration.custodyBootstrap); };
    ownedSystems.set(system, { runtime, operators:operatorResources, assertLive:live });
    ownedClaims.set(claims,{runtime,system});
    try {
      failureContext={stage:'operator-bind-and-current-readers',operation:'bind',role:null,source:null,contractName:null};
      const handles = await finishWrappedClaimOperatorsV1(configuration.bootstrap,{runtime,system,claims});
      system.operators = handles.operators; system.quorum = handles.quorum;
      system.claimOperators=handles.claimOperators;system.claimQuorum=handles.claimQuorum;system.claimObserver=handles.observer;
      freeze(system);
      const { createWrappedClaimGraphStateReaderV1 } = await import('../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs');
      const readers = await drained([0,1].map(poolIndex=>()=>createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex})));
      const views = await drained(readers.map(reader=>()=>reader.read()));
      assert.deepEqual(views[0].head,views[1].head,'NATIVE_VALUE_BOOTSTRAP_COMMON_HEAD');
      await drained(readers.map((reader,i)=>()=>reader.assertCurrent(views[i])));
      const claimView=await handles.observer.read();
      assert.deepEqual(claimView.head,views[0].head,'WRAPPED_CLAIM_BOOTSTRAP_COMMON_HEAD');
      await recheckOriginalWrappedClaimCustodyV1(configuration.custodyBootstrap);
      await handles.observer.assertCurrent(claimView);
      await drained(readers.map((reader,i)=>()=>reader.assertCurrent(views[i])));
      live();await assertLocalEvm(runtime);live();return system;
    } catch(cause) { ownedSystems.delete(system);ownedClaims.delete(claims);throw cause; }
  } catch (error) {
    let cleanupFailure;
    try { configuration.bootstrap.close(); } catch (cause) { cleanupFailure = cause; }
    try { revokeWrappedClaimCustodyBootstrapV1(runtime,configuration.custodyBootstrap); } catch(cause) { cleanupFailure??=cause; }
    // Observers can throw primitive values or frozen errors. Always attach
    // retained evidence to our own writable error without losing the cause.
    const failure = new Error('WRAPPED_CLAIM_DEPLOYMENT_FAILED', { cause: error });
    if(cleanupFailure)failure.cleanupFailure=cleanupFailure;
    failure.partialDeployments = [...deployments]; failure.registrationReceipts = [...registrationReceipts];
    failure.claimDeployments=[...claimBinding.deployments];failure.claimSealReceipts=[...claimBinding.sealReceipts];
    if(combinedPlan)failure.combinedDeploymentPlan=combinedPlan;
    failure.localReceipts = runtime.receipts; failure.localTransactions = runtime.transactions;
    if (plan) failure.deploymentPlan = plan;
    if (bundle) failure.artifactProvenance = bundle.provenance;
    retainOriginalDeploymentFailure(failure,error,cleanupFailure,failureContext,runtime.transactions,runtime.receipts,deployments);
    throw failure;
  } finally { activeDeployments.delete(runtime); }
}

// Cold reopen records are accepted only from the sealed original authority.
const systemRecoveryCapturesV1=new WeakMap();
const RECOVERY_SYSTEM_FIELDS=['classification','profile','claimsEnabled','custodyRegistration','adapterProfiles','chainId','sender','plan','registry','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace','asset','assetCodeHash','assetIdentity','assetMetadata','deployments','registrationReceipts','bootstrap','provenance'];
const RECOVERY_CLAIM_FIELDS=['classification','claimIngressProfile','claimDischargeProfile','verifierPins','configs','policies','custodyRegistration','journalRoot','deployments','sealReceipts','bootstrap','provenance','limitations'];
const recoveryPick=(v,keys)=>structuredClone(Object.fromEntries(keys.map(k=>[k,v[k]])));
function recoveryFacadeRecord(v) {
  const skip=new Set(['data','call','artifact','selectors','assetCapability']);
  return {record:structuredClone(Object.fromEntries(Object.entries(v).filter(([k])=>!skip.has(k)))),artifactSHA256:sha(Buffer.from(JSON.stringify(v.artifact)))};
}
function recoveryArtifact(bundle,packed) {
  const r=packed.record,candidates=[];
  const direct=bundle.contracts.compilation.contracts[r.source]?.[r.contractName];if(direct)candidates.push(direct);
  for(const entry of Object.values(bundle.verifiers))if(entry.source===r.source&&entry.contracts[r.contractName])candidates.push(entry.contracts[r.contractName]);
  for(const [role,[source,name]] of Object.entries(NATIVE_VALUE_LEDGER_ROLES))if(source===r.source&&name===r.contractName)candidates.push(bundle.ledger.artifacts[role]);
  if(r.contractName==='PrivateFlatReceiptHubWrappedClaimV1')candidates.push(bundle.ledger.artifacts.hub);
  if(r.contractName==='PrivateFlatAssetNotePool')candidates.push(bundle.ledger.artifacts.pool);
  const artifact=candidates.find(a=>a&&sha(Buffer.from(JSON.stringify(a)))===packed.artifactSHA256);
  assert.ok(artifact,'WRAPPED_RECOVERY_ORIGINAL_ARTIFACT_REQUIRED');return artifact;
}
export async function captureWrappedClaimGraphSystemRecoveryV1(runtime,system) {
  assert.equal(arguments.length,2);assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedWrappedClaimSystem(runtime,system.claims);
  const {createWrappedClaimGraphStateReaderV1}=await import('../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs');
  const readers=await drained([0,1].map(poolIndex=>()=>createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex})));
  const views=await drained(readers.map(r=>()=>r.read())),claimView=await system.claimObserver.read();
  assert.deepEqual(views[0].head,views[1].head);assert.deepEqual(views[0].head,claimView.head);
  await drained(readers.map((r,i)=>()=>r.assertCurrent(views[i])));await system.claimObserver.assertCurrent(claimView);
  const map=rows=>Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,recoveryFacadeRecord(v)]));
  const captured={schema:'WRAPPED_GRAPH_SYSTEM_RECOVERY_V1',system:recoveryPick(system,RECOVERY_SYSTEM_FIELDS),claims:recoveryPick(system.claims,RECOVERY_CLAIM_FIELDS),
    hub:recoveryFacadeRecord(system.hub),pools:system.pools.map(recoveryFacadeRecord),libraries:map(system.libraries),generatedLibraries:map(system.generatedLibraries),verifiers:map(system.verifiers),
    claimAuthority:recoveryFacadeRecord(system.claims.authority),claimGateways:system.claims.gateways.map(recoveryFacadeRecord),claimWrappers:system.claims.wrappers.map(recoveryFacadeRecord),claimLibraries:map(system.claims.libraries),claimVerifiers:map(system.claims.verifiers),
    views:structuredClone(views),claimView:structuredClone(claimView),evmGenesis:runtime.metadata.evmGenesis};
  systemRecoveryCapturesV1.set(captured,{runtime,system,nativeHistories:structuredClone(system.claims.nativeRuntimes.map(n=>n.transfers))});return captured;
}
export async function assertCapturedWrappedClaimSystemUnchangedV1(runtime,system,captured) {
 assert.equal(arguments.length,3);const original=systemRecoveryCapturesV1.get(captured);assert.ok(original&&original.runtime===runtime&&original.system===system,'WRAPPED_RECOVERY_ORIGINAL_CAPTURE_REQUIRED');
 assert.equal(ownedSystems.get(system)?.runtime,runtime);
 const expected=captured.views[0].head,head=await runtime.block();
 assert.equal(BigInt(head.number).toString(),expected.number,'WRAPPED_RECOVERY_CAPTURE_HEAD_MOVED');assert.equal(bare(head.hash),expected.hash,'WRAPPED_RECOVERY_CAPTURE_HEAD_MOVED');await runtime.assertCanonical(head);
 assert.deepEqual(system.claims.nativeRuntimes.map(n=>n.transfers),original.nativeHistories,'WRAPPED_RECOVERY_CAPTURE_NATIVE_MOVED');
 systemRecoveryCapturesV1.delete(captured);return undefined;
}
export async function reopenWrappedClaimGraphSystemRecoveryV1(token) {
  assert.equal(arguments.length,1);inspectWrappedInstallationSourcesV2();
  const {consumeWrappedSystemRecoveryPartV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const {runtime,bootstrap,custodyBootstrap,record:r}=consumeWrappedSystemRecoveryPartV1(token,'contracts');
  exactRecord(r,['schema','system','claims','hub','pools','libraries','generatedLibraries','verifiers','claimAuthority','claimGateways','claimWrappers','claimLibraries','claimVerifiers','views','claimView','evmGenesis']);
  assert.equal(r.schema,'WRAPPED_GRAPH_SYSTEM_RECOVERY_V1');await assertLocalEvm(runtime);
  assert.equal(runtime.metadata.evmGenesis,r.evmGenesis);assert.equal(runtime.metadata.chainId,'31337');
  assertOwnedWrappedClaimBootstrap(runtime,custodyBootstrap);assertWrappedClaimOperatorCustodyBootstrapV1(bootstrap,{runtime,custodyBootstrap});
  const custody=ownedWrappedClaimBootstrapBindings(custodyBootstrap),bundle=await loadWrappedClaimDeploymentArtifactsV1();
  assert.deepEqual(bundle.provenance,r.system.provenance);assert.deepEqual(bundle.provenance,r.claims.provenance);
  assert.deepEqual(r.system.registry.quorum.keys,assertWrappedClaimOperatorBootstrapV1(bootstrap).attesterKeys);
  assert.deepEqual(r.system.adapterProfiles,assertWrappedClaimOperatorBootstrapV1(bootstrap).adapterProfiles);
  assert.equal(r.claims.journalRoot,custody.journalRoot);assert.equal(r.system.sender,runtime.accounts[0]);
  assert.ok(!attemptedBootstraps.has(custodyBootstrap),'WRAPPED_RECOVERY_SYSTEM_ALREADY_BOUND');attemptedBootstraps.add(custodyBootstrap);
  const head=await runtime.block();assert.deepEqual({number:BigInt(head.number).toString(),hash:bare(head.hash)},{number:r.views[0].head.number,hash:r.views[0].head.hash},'WRAPPED_RECOVERY_RECEIVER_HEAD_CHANGED');
  const restore=(packed,isClaim=false)=>{exactRecord(packed,['record','artifactSHA256']);const a=recoveryArtifact(bundle,packed);return (isClaim?facade:viewFacade)(runtime,packed.record,a);};
  const map=(rows,isClaim=false)=>Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,restore(v,isClaim)]));
  const libraries=map(r.libraries),generatedLibraries=map(r.generatedLibraries),verifiers=map(r.verifiers),hub=restore(r.hub);
  const claimWrappers=r.claimWrappers.map(p=>restore(p,true)),assets=[];
  for(const [i,w] of claimWrappers.entries())assets.push(await createOwnedPoolAsset({runtime,deployment:{address:w.address,transactionHash:w.receipt.transactionHash,expectedCode:w.expectedCode,codeHash:w.codeHash},symbol:i===0?'cBTC':'cSOL',decimals:i===0?8:9,kind:'ERC20'}));
  const pools=r.pools.map((p,i)=>({...restore(p),assetCapability:assets[i],assetMetadata:assets[i].metadata}));
  const common=pools.every(p=>p.asset===pools[0].asset&&p.assetCodeHash===pools[0].assetCodeHash)?pools[0]:null;
  const system={...structuredClone(r.system),hub,pools,libraries,generatedLibraries,verifiers,assetCapability:common?.assetCapability??null};
  const claims={...structuredClone(r.claims),flatSystem:system,authority:restore(r.claimAuthority,true),gateways:r.claimGateways.map(p=>restore(p,true)),wrappers:claimWrappers,
    libraries:map(r.claimLibraries,true),verifiers:map(r.claimVerifiers,true),nativeRuntimes:custody.nativeRuntimes};system.claims=claims;
  system.verify=async(role,proof,publicInputs,block='latest')=>{assertOwnedWrappedClaimGraphSystem(runtime,system);await assertLocalEvm(runtime);const spec=WRAPPED_CLAIM_VERIFIER_ORDER_V1.find(([n])=>n===role);assert.ok(spec);fixedArray(publicInputs,spec[1]);const v=system.verifiers[role]??claims.verifiers[role];await expectedCodeAt(runtime,v,block);const raw=await runtime.call({to:v.address,data:nativeProofCalldata(v.artifact,'verify(bytes,bytes32[])',proof,publicInputs)},block);assert.ok(raw===encodedWords([0])||raw===encodedWords([1]));return raw===encodedWords([1]);};
  system.assetBalance=(holder,block='latest')=>{assert.ok(common,'NATIVE_VALUE_DEPLOY_AMBIGUOUS_AGGREGATE_ASSET');return common.assetCapability.balance(holder,block);};
  Object.defineProperty(system,'receipts',{enumerable:true,get:()=>freeze(structuredClone(runtime.receipts))});
  for(const record of system.deployments){await originalCreation(runtime,record);await expectedCodeAt(runtime,record,head.number);}
  for(const receipt of [...system.registrationReceipts,...claims.sealReceipts]){assert.deepEqual(await runtime.receipt(receipt.transactionHash),receipt);await runtime.checkReceipt(receipt);await runtime.assertCanonical(receipt);}
  await unchangedHead(runtime,head);
  const resources=await provisionWrappedClaimOperatorsV1(bootstrap,{runtime,registry:system.registry,adapterProfiles:system.adapterProfiles});
  const live=()=>{inspectWrappedInstallationSourcesV2();assertWrappedClaimOperatorBootstrapV1(bootstrap);assertOwnedWrappedClaimBootstrap(runtime,custodyBootstrap);};
  ownedSystems.set(system,{runtime,operators:resources,assertLive:live});ownedClaims.set(claims,{runtime,system});
  try {
    const handles=await finishWrappedClaimOperatorsV1(bootstrap,{runtime,system,claims});
    Object.assign(system,{operators:handles.operators,quorum:handles.quorum,claimOperators:handles.claimOperators,claimQuorum:handles.claimQuorum,claimObserver:handles.observer});freeze(system);
    const {createWrappedClaimGraphStateReaderV1}=await import('../../../execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs');
    const readers=await drained([0,1].map(poolIndex=>()=>createWrappedClaimGraphStateReaderV1({runtime,system,poolIndex})));
    const views=await drained(readers.map(v=>()=>v.read())),claimView=await handles.observer.read();
    assert.deepEqual(views,r.views,'WRAPPED_RECOVERY_GRAPH_STATE_CHANGED');assert.deepEqual(claimView,r.claimView,'WRAPPED_RECOVERY_CLAIM_STATE_CHANGED');
    await drained(readers.map((v,i)=>()=>v.assertCurrent(views[i])));await handles.observer.assertCurrent(claimView);await unchangedHead(runtime,head);live();return system;
  }catch(error){ownedSystems.delete(system);ownedClaims.delete(claims);throw error;}
}

/** Wallet eligibility checked by the original deployment owner. */
export function assertOwnedWrappedClaimWalletSystemV1(runtime, system) {
  assertOwnedWrappedClaimGraphSystem(runtime,system);assertOwnedWrappedClaimSystem(runtime,system.claims);
  assert.equal(system.profile,WRAPPED_CLAIM_SYSTEM_PROFILE_V1);assert.equal(system.claimsEnabled,true);
  assert.ok(Object.isFrozen(system));validateWrappedClaimOperationalRegistration(system.custodyRegistration);
}
