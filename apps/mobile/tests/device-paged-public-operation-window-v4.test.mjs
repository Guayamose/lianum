/** UI preparation DATA and actual edit/effect arrows. No provider, consent,
 * user custody, remote grant or blockchain authority is issued by defaults. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import {pagedGuidedDefaultsV4} from '../src/screens/device-paged-operation-form-v3.ts';
const configuration={networks:[{family:'EVM',networkId:'ethereum-sepolia'},{family:'BTC',networkId:'bitcoin-testnet'},{family:'SOL',networkId:'solana-devnet'}]};
test('guided public BTC uses360 minutes; LOCAL/unknown identifiers and ETH-only keep120',()=>{
 assert.equal(pagedGuidedDefaultsV4(configuration,[{intent:{family:'BTC'}}]).executionMinutes,'360');
 assert.equal(pagedGuidedDefaultsV4(configuration,[{intent:{family:'EVM'}}]).executionMinutes,'120');
 assert.equal(pagedGuidedDefaultsV4(configuration).executionMinutes,'360');
 for(const n of [{family:'BTC',label:'Bitcoin testnet3'}, {family:'BTC',networkId:'bitcoin-regtest'},{family:'EVM',networkId:'bitcoin-testnet'}])assert.equal(pagedGuidedDefaultsV4({networks:[n]}).executionMinutes,'120');
 assert.equal(pagedGuidedDefaultsV4(configuration,[{intent:{kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE'}}]).executionMinutes,'120');
 assert.equal(pagedGuidedDefaultsV4(configuration).reservationMinutes,'60');
});
test('actual screen default effect preserves an advanced duration edited by the user across source refresh',async()=>{
 const source=await readFile(new URL('../src/screens/DevicePagedGraphScreen.tsx',import.meta.url),'utf8'),tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let edit,effect;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='editExecutionMinutes')edit=n.initializer;if(ts.isCallExpression(n)&&n.expression.getText(tree)==='useEffect'&&n.arguments[0]?.getText(tree).includes('executionMinutesEdited.current'))effect=n.arguments[0];ts.forEachChild(n,visit);}visit(tree);assert.ok(ts.isArrowFunction(edit)&&ts.isArrowFunction(effect));
 const emit=arrow=>ts.transpileModule('(()=>{const fn='+arrow.getText(tree)+'; return fn;})()',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const edited={current:false},writes=[],host={executionMinutesEdited:edited,nativePreparation:configuration,pagedGuidedDefaultsV4,setExecutionMinutes:value=>writes.push(value)};
 const apply=vm.runInNewContext(emit(effect),host),change=vm.runInNewContext(emit(edit),host);
 apply();assert.deepEqual(writes,['360']);change('45');apply();assert.deepEqual(writes,['360','45'],'refresh never overrides a custom45min value');
});
