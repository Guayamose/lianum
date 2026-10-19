import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
test('native Metro loads ECharts helpers directly without the failing tslib default wrapper',async()=>{
 const config=require('../metro.config.cjs');
 const context={resolveRequest:(_context,name,platform)=>({filePath:require.resolve(name),type:'sourceFile',platform})};
 const result=config.resolver.resolveRequest(context,'tslib','android');
 assert.ok(result.filePath.endsWith('tslib.es6.mjs'));assert.equal(result.platform,'android');
 const helpers=await import(pathToFileURL(result.filePath).href);
 function Base(){this.initialized=true;}function Child(){Base.call(this);}helpers.__extends(Child,Base);
 const child=new Child();assert.ok(child instanceof Base);assert.equal(child.initialized,true);
});
