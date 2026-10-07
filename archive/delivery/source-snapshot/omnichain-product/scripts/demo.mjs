import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WalletSDK } from '../src/sdk.mjs';
const root=resolve(import.meta.dirname,'..'); await mkdir(join(root,'.local'),{recursive:true}); await mkdir(join(root,'evidence'),{recursive:true});
const dir=await mkdtemp(join(root,'.local','demo-')); let now=1800000000000;
const sdk=new WalletSDK(join(dir,'vault.json'),randomBytes(32).toString('hex'),{clock:()=>now}); await sdk.create();
const completed=await sdk.openDemo();
const views=[];
for(const leg of ['ethereum','solana','bitcoin']) { views.push(await sdk.executorView(completed.hash,leg)); await sdk.executeSimulationLeg(completed.hash,leg); }
await sdk.settle(completed.hash);
const failed=await sdk.openDemo({order:['bitcoin','solana','ethereum']});
await sdk.executeSimulationLeg(failed.hash,'bitcoin'); await sdk.fail(failed.hash,'SOLANA_HALTED'); now+=60000; await sdk.recover(failed.hash);
const snapshot=await sdk.snapshot();
const report={version:1,classification:'SIMULATION_ONLY',command:'node scripts/demo.mjs',runtime:process.version,generatedAt:new Date().toISOString(),
  guarantees:{ledger:'serialized encrypted local ledger only',protocol:'one local payment decision',economic:'conditional local payment, no native rollback'},
  references:{successful:completed.hash,failed:failed.hash},executorViews:views,snapshot};
await writeFile(join(root,'evidence','model-demo.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({evidence:'evidence/model-demo.json',classification:report.classification,revision:snapshot.revision,operations:snapshot.state.operations.map(o=>({hash:o.hash,status:o.status})),tests:'Run npm test separately'},null,2));
