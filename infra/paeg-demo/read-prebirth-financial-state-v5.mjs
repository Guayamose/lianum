/** Fixed readonly command. Creates review DATA, never a financial capability. */
import assert from 'node:assert/strict';
import {publishOriginalPrebirthFinancialStateV5} from './prebirth-financial-control-v5.mjs';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4} from './public-operator-state-v4.mjs';
assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_TLS_REJECT_UNAUTHORIZED','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','PYTHONHOME'])assert.equal(process.env[name],undefined);
try{process.stdout.write(JSON.stringify(await publishOriginalPrebirthFinancialStateV5({operatorDirectory:PUBLIC_OPERATOR_STATE_V4,nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4}))+'\n');}
catch{process.stderr.write('{"code":"PAEG_PREBIRTH_FINANCIAL_READ_REJECTED","financialSourcePermissionIssued":false,"transactionsBroadcast":0}\n');process.exitCode=1;}
