/** Fixed original product factory acceptance. Importing starts nothing. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTronProductOriginalAcceptanceV1 } from './tron-candidate-acceptance.mjs';
const HERE=fileURLToPath(import.meta.url);
if(process.argv[1]&&resolve(process.argv[1])===HERE){
 try{const result=await runTronProductOriginalAcceptanceV1();console.log(JSON.stringify(result));process.exitCode=result.report.success?0:1;}
 catch(error){console.error(String(error?.message??'').match(/\bTRON_(?:ALIGNED|CANDIDATE|PRODUCT)_[A-Z0-9_]+\b/)?.[0]??'TRON_PRODUCT_ACCEPTANCE_REJECTED');process.exitCode=2;}
}
