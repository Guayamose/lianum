/** Pure public-data conformance of authenticated solc templates. No addresses,
 * linker execution, compiler, artifact brand or deployment authority is accepted.
 * A syntax-check copy fills only declared holes; it is never executable output. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {exactRecord,fixedArray} from '@lianum/components/encoding/commitments';
const LIBRARIES=Object.freeze(['RelationsLib','ZKTranscriptLib']);
const sha=b=>createHash('sha256').update(b).digest('hex');
function named(ast,name){const matches=ast.nodes.filter(n=>n.nodeType==='ContractDefinition'&&n.name===name);assert.equal(matches.length,1,'WRAPPED_LINK_NAMED_AST');return matches[0];}
function range(row,width,size,occupied,label){
 exactRecord(row,['start','length']);assert.ok(Number.isSafeInteger(row.start)&&row.start>=0,label+'_START');assert.equal(row.length,width,label+'_WIDTH');assert.ok(row.start+width<=size,label+'_BOUNDS');
 assert.ok(occupied.every(([a,b])=>row.start+width<=a||row.start>=b),label+'_OVERLAP');occupied.push([row.start,row.start+width]);
}
function template(code,sourceName,contractName,kind){
 assert.equal(typeof code.object,'string');assert.equal(code.object.length%2,0,'WRAPPED_LINK_EVEN_TEMPLATE');const size=code.object.length/2;assert.ok(size<=(kind==='bytecode'?49152:24576),'WRAPPED_LINK_EVM_SIZE');
 exactRecord(code.linkReferences,Object.keys(code.linkReferences));
 if(contractName==='HonkVerifier'){
  exactRecord(code.linkReferences,[sourceName]);exactRecord(code.linkReferences[sourceName],LIBRARIES);
 }else assert.deepEqual(code.linkReferences,{},'WRAPPED_LINK_ONLY_VERIFIER_DEPENDS');
 const occupied=[],copy=code.object.split('');
 for(const [source,libraries]of Object.entries(code.linkReferences))for(const [name,refs]of Object.entries(libraries)){
  assert.equal(source,sourceName,'WRAPPED_LINK_SOURCE');assert.ok(LIBRARIES.includes(name),'WRAPPED_LINK_LIBRARY');fixedArray(refs,refs.length);assert.ok(refs.length>0,'WRAPPED_LINK_NONEMPTY_REFERENCES');
  const placeholder='__$'+publicKeccak256(Buffer.from(source+':'+name,'utf8')).toString('hex').slice(0,34)+'$__';
  for(const row of refs){range(row,20,size,occupied,'WRAPPED_LINK');assert.equal(code.object.slice(2*row.start,2*(row.start+20)),placeholder,'WRAPPED_LINK_QUALIFIED_KECCAK_PLACEHOLDER');copy.splice(2*row.start,40,...'00'.repeat(20));}
 }
 assert.match(copy.join(''),/^(?:[0-9a-f]{2})*$/,'WRAPPED_LINK_UNDECLARED_OR_NONHEX_BYTES');
 return {bytes:size,templateTextSHA256:sha(code.object),linkReferences:structuredClone(code.linkReferences),occupied};
}
export function validateWrappedClaimVerifierLinkTemplatesV1(compilation,sourceName,immutableNames){
 assert.equal(arguments.length,3,'WRAPPED_LINK_DATA_ARITY');assert.match(sourceName,/^[A-Za-z0-9_]+\.sol$/);exactRecord(compilation.contracts,[sourceName]);exactRecord(compilation.sourceASTs,[sourceName]);
 const contracts=compilation.contracts[sourceName],ast=compilation.sourceASTs[sourceName];assert.equal(ast.nodeType,'SourceUnit');assert.equal(ast.absolutePath,sourceName);assert.ok(Array.isArray(ast.nodes));
 const definitions=ast.nodes.filter(n=>n.nodeType==='ContractDefinition');assert.deepEqual(Object.keys(contracts).sort(),definitions.map(n=>n.name).sort(),'WRAPPED_LINK_EXACT_CONTRACT_SET');
 const main=named(ast,'HonkVerifier');assert.equal(main.contractKind,'contract');assert.equal(main.abstract,false);
 for(const name of LIBRARIES){assert.equal(named(ast,name).contractKind,'library','WRAPPED_LINK_LIBRARY_AST_KIND');assert.ok(contracts[name]?.evm?.bytecode?.object&&contracts[name]?.evm?.deployedBytecode?.object,'WRAPPED_LINK_LIBRARY_REQUIRED');}
 const declarations=new Map();for(const declaration of definitions)for(const node of declaration.nodes??[])if(node.nodeType==='VariableDeclaration'&&node.stateVariable){
  assert.ok(node.constant===true||node.mutability==='constant'||node.mutability==='immutable','WRAPPED_LINK_STORAGE_FORBIDDEN');
  if(node.mutability==='immutable'){assert.equal(declaration.name,'BaseZKHonkVerifier','WRAPPED_LINK_IMMUTABLE_OWNER');declarations.set(String(node.id),node.name);}
 }
 assert.deepEqual(immutableNames,Object.fromEntries(declarations),'WRAPPED_LINK_IMMUTABLE_AST_JOIN');
 const records=[];
 for(const [name,artifact]of Object.entries(contracts)){
  const declaration=named(ast,name),creation=template(artifact.evm.bytecode,sourceName,name,'bytecode'),runtime=template(artifact.evm.deployedBytecode,sourceName,name,'deployedBytecode');
  if(name==='HonkVerifier'||LIBRARIES.includes(name))assert.ok(creation.bytes>0&&runtime.bytes>0,'WRAPPED_LINK_NONEMPTY_DEPLOYABLE_TEMPLATE');
  if(creation.bytes===0||runtime.bytes===0){assert.equal(creation.bytes,0);assert.equal(runtime.bytes,0);assert.ok(declaration.abstract===true||declaration.contractKind==='interface','WRAPPED_LINK_EMPTY_CONCRETE_ARTIFACT');}
  const refs=artifact.evm.deployedBytecode.immutableReferences;exactRecord(refs,Object.keys(refs));const occupied=[...runtime.occupied];
  if(name!=='HonkVerifier')assert.deepEqual(refs,{},'WRAPPED_LINK_ONLY_VERIFIER_IMMUTABLES');
  for(const [id,rows]of Object.entries(refs)){assert.ok(declarations.has(id),'WRAPPED_LINK_UNDECLARED_IMMUTABLE');fixedArray(rows,rows.length);assert.ok(rows.length>0);for(const row of rows){range(row,32,runtime.bytes,occupied,'WRAPPED_LINK_IMMUTABLE');assert.equal(artifact.evm.deployedBytecode.object.slice(2*row.start,2*(row.start+32)),'00'.repeat(32),'WRAPPED_LINK_IMMUTABLE_NOT_ZERO');}}
  if(LIBRARIES.includes(name)){assert.match(artifact.evm.deployedBytecode.object,/^73(?:00){20}3014/,'WRAPPED_LINK_LIBRARY_SELF_GUARD');assert.ok((artifact.abi.filter(x=>x.type==='constructor')).every(x=>x.inputs.length===0),'WRAPPED_LINK_LIBRARY_CONSTRUCTOR');}
  const {occupied:_c,...creationRecord}=creation,{occupied:_r,...runtimeRecord}=runtime;
  records.push({name,kind:declaration.contractKind,creation:creationRecord,runtime:runtimeRecord,immutableReferences:structuredClone(refs)});
 }
 return {schema:'WRAPPED_GENERATED_VERIFIER_LINK_TEMPLATES_V1',classification:'AUTHENTICATED_TEMPLATE_CONFORMANCE_NOT_LINKED_EXECUTABLE_OR_PROOF_ACCEPTANCE',source:sourceName,requiredLibraries:[...LIBRARIES],records,linkedExecutable:false,deployable:false};
}
