/** Fixed original birth of a NEW Blue supply position. No address, artifact,
 * verifier, signing key, existing-position adoption or read callback input.
 * The PAEG router/observer layer must use this private brand, not MetaMorpho. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
import { assertOwnedLocalEvmV2 } from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOfficialProtocolFixture } from '../../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { expectedAaveRuntimeCodeV1 } from './aave-v3-runtime-code-v1.mjs';
import { compileOriginalMorphoBluePositionContractsV1 } from './morpho-blue-position-compilation-v1.mjs';

const PROFILE = 'MORPHO_BLUE_PRIVATE_SUPPLY_V1', owned = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => {
  const result = structuredClone(value);
  function freeze(x) { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; }
  return freeze(result);
};
export function assertOwnedOriginalMorphoBluePositionV1(runtime,position) {
  assert.equal(arguments.length,2);
  assert.ok(owned.get(position)?.runtime === runtime,'ORIGINAL_BLUE_POSITION_REQUIRED');
  assertOfficialProtocolFixture(runtime,owned.get(position).protocolFixture);
}
export function readOwnedOriginalMorphoBluePositionContextV1(runtime,position) {
  assert.equal(arguments.length,2); assertOwnedOriginalMorphoBluePositionV1(runtime,position);
  const s = owned.get(position); return Object.freeze({runtime,protocolFixture:s.protocolFixture});
}
export function readOwnedOriginalMorphoBluePositionCompilationV1(runtime,position) {
  assert.equal(arguments.length,2); assertOwnedOriginalMorphoBluePositionV1(runtime,position);
  return owned.get(position).build;
}
export async function createOwnedOriginalMorphoBluePositionV1(input) {
  assert.equal(arguments.length,1); exactRecord(input,['runtime','protocolFixture']);
  const {runtime,protocolFixture:p} = input;
  await assertOwnedLocalEvmV2(runtime); assertOfficialProtocolFixture(runtime,p);
  assert.equal(runtime.metadata.chainId,'31337','ORIGINAL_BLUE_LOCAL_PROFILE');
  assert.ok(p.blue && p.first && p.marketId,'ORIGINAL_BLUE_MARKET_REQUIRED');
  const directory = join(ROOT,'wallet-platform/artifacts/private-external-v1');
  const require = createRequire(join(directory,'abi-tools/package.json'));
  const {Interface,keccak256} = require('ethers'), build = compileOriginalMorphoBluePositionContractsV1();
  const artifact = build.artifacts.OriginalMorphoBluePositionV1, iface = new Interface(artifact.abi);
  const read = async (contract,method,args,at) => contract.iface.decodeFunctionResult(method,
    await runtime.call({to:contract.address,data:contract.iface.encodeFunctionData(method,args)},at));
  const birth = await runtime.block(); await runtime.assertCanonical(birth);
  assert.equal(await runtime.code(p.blue.address,birth.number),p.blue.code,'ORIGINAL_BLUE_CODE');
  assert.equal(await runtime.code(p.first.address,birth.number),p.first.code,'ORIGINAL_BLUE_ASSET_CODE');
  const params = await read(p.blue,'idToMarketParams',[p.marketId],birth.number);
  assert.equal(params[0].toLowerCase(),p.first.address,'ORIGINAL_BLUE_MARKET');
  for (const i of [1,2,3]) assert.equal(params[i].toLowerCase(),'0x'+'0'.repeat(40),'ORIGINAL_BLUE_MARKET');
  assert.equal(params[4],0n,'ORIGINAL_BLUE_MARKET');
  const assetDecimals = Number((await read(p.first,'decimals',[],birth.number))[0]);
  assert.ok(Number.isSafeInteger(assetDecimals) && assetDecimals>=0 && assetDecimals<=18,'ORIGINAL_BLUE_DECIMALS');
  await runtime.assertCanonical(birth); assert.deepEqual(await runtime.block(),birth,'ORIGINAL_BLUE_BIRTH_HEAD');
  const creation = '0x'+artifact.evm.bytecode.object+iface.encodeDeploy([p.blue.address,p.first.address]).slice(2);
  const label = 'deploy original Morpho Blue private position v1';
  const receipt = await runtime.send(label,{from:runtime.accounts[0],data:creation});
  await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
  const address = receipt.contractAddress.toLowerCase();
  const code = expectedAaveRuntimeCodeV1(artifact,build.sourceASTs,{}, {
    MORPHO:p.blue.address,loan:p.first.address,marketId:p.marketId,
    morphoCodeHash:keccak256(p.blue.code),assetCodeHash:keccak256(p.first.code),decimals:String(assetDecimals+6)});
  assert.equal(await runtime.code(address,receipt.blockNumber),code,'ORIGINAL_BLUE_POSITION_CODE');
  const contract = Object.freeze({address,iface,code,receipt:copy(receipt)});
  let capability;
  async function observe() {
    assertOwnedOriginalMorphoBluePositionV1(runtime,capability); await assertOwnedLocalEvmV2(runtime);
    const head = await runtime.block();
    await runtime.assertCanonical(receipt);
    const journal = runtime.transactions.filter(row=>row.transactionHash===receipt.transactionHash);
    assert.equal(journal.length,1,'ORIGINAL_BLUE_POSITION_BIRTH');
    assert.equal(journal[0].label,label); assert.equal(journal[0].phase,'mined');
    assert.equal(journal[0].request.from,runtime.accounts[0]); assert.equal(journal[0].request.data,creation);
    for (const c of [contract,p.blue,p.first]) assert.equal(await runtime.code(c.address,head.number),c.code,'ORIGINAL_BLUE_POSITION_CODE');
    const [total,heldMarket,heldPosition,underlying] = await Promise.all([
      read(contract,'totalSupply',[],head.number),read(p.blue,'market',[p.marketId],head.number),
      read(p.blue,'position',[p.marketId,address],head.number),read(p.first,'balanceOf',[p.blue.address],head.number)]);
    assert.equal(total[0],heldPosition[0],'ORIGINAL_BLUE_POSITION_BACKING');
    assert.ok(total[0]<=heldMarket[1]); assert.ok(heldMarket[0]<=underlying[0]);
    for (const i of [2,3,5]) assert.equal(heldMarket[i],0n,'ORIGINAL_BLUE_POSITION_NO_DEBT');
    for (const i of [1,2]) assert.equal(heldPosition[i],0n,'ORIGINAL_BLUE_POSITION_NO_DEBT');
    assert.ok(heldMarket[0] < 1n<<112n && heldMarket[1] < 1n<<112n,'ORIGINAL_BLUE_POSITION_CAPACITY');
    assert.equal((await read(contract,'MORPHO',[],head.number))[0].toLowerCase(),p.blue.address);
    assert.equal((await read(contract,'asset',[],head.number))[0].toLowerCase(),p.first.address);
    assert.equal((await read(contract,'marketId',[],head.number))[0],p.marketId);
    await runtime.assertCanonical(head); assert.deepEqual(await runtime.block(),head,'ORIGINAL_BLUE_POSITION_HEAD');
    return copy({profile:PROFILE,marketId:p.marketId,positionOwner:address,shareSupply:total[0].toString(),
      market:Array.from(heldMarket).map(String),position:Array.from(heldPosition).map(String),underlyingHeld:underlying[0].toString(),
      head:{number:head.number,hash:head.hash,timestamp:head.timestamp},privateBalanceCredited:false});
  }
  capability = Object.freeze({profile:PROFILE,contract,asset:p.first.address,morpho:p.blue.address,marketId:p.marketId,
    compilation:copy({inputSHA256:build.inputSHA256,compiler:build.compiler,sourceRecords:build.sourceRecords}),observe});
  owned.set(capability,{runtime,protocolFixture:p,build}); await observe(); return capability;
}
