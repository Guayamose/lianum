import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PRIVATE_ASSET_VERIFIER_MODES } from '../../src/private-asset-runtime.mjs';
import { linuxRuntimePins } from '../../src/chains/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep } from '../../src/chains/runtime-harness.mjs';
export const CLASSIFICATION='SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS';
export const sha=data=>createHash('sha256').update(data).digest('hex');
export const hash=label=>`0x${sha(`PRIVATE ASSET NATIVE SYNTHETIC ${label}`)}`;
export const word=n=>BigInt(n).toString(16).padStart(64,'0');
const marker=mode=>PRIVATE_ASSET_VERIFIER_MODES.indexOf(mode)+1;
export const proof=(mode,inputs)=>Buffer.concat([Buffer.from([marker(mode)]),Buffer.from(sha(Buffer.from(inputs.map(word).join(''),'hex')),'hex')]);
export const source=mode=>`// SPDX-License-Identifier: MIT\npragma solidity 0.8.37;
// ${CLASSIFICATION}. Only binds test inputs; NO circuit relation.
contract HonkVerifier {
 function verify(bytes calldata p,bytes32[] calldata inputs) external view returns(bool){
  return p.length==33 && p[0]==bytes1(uint8(${marker(mode)})) && bytes32(p[1:33])==sha256(abi.encodePacked(inputs));
 }
}`;
export async function ownAnvil(){
 const binary=await pinnedBinary(...linuxRuntimePins.anvil),cwd=await scratchDirectory('private-asset-native-controls-');let handle;
 try{
  const port=await unusedLoopbackPort();
  handle=startOwnProcess(binary,['--host','127.0.0.1','--port',String(port),'--chain-id','31337','--hardfork','cancun','--timestamp','1900000200','--accounts','5','--balance','10','--mnemonic-random','12','--no-cors'],cwd);
  const evm=(method,params=[])=>ownedRuntimeRpc(`http://127.0.0.1:${port}`,method,params,{timeoutMs:15000});
  let ready=false;for(let i=0;i<100;i++){handle.assertAlive();try{ready=await evm('eth_chainId')==='0x7a69';if(ready)break;}catch{}await sleep(50);}
  assert.ok(ready,'OWNED_WALLET_ANVIL_READY');
  return{evm,accounts:await evm('eth_accounts'),metadata:{classification:'OWNED_LOCAL_RUNTIMES_ONLY',freshSyntheticWallets:true,chainId:'31337',evmGenesis:(await evm('eth_getBlockByNumber',['0x0',false])).hash},close:async()=>{await stopOwnProcess(handle);await removeOwnScratch(cwd);}};
 }catch(error){if(handle)await stopOwnProcess(handle);await removeOwnScratch(cwd);throw error;}
}
