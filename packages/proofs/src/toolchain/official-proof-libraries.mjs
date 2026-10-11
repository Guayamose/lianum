/** Fixed installed public libraries. Importing this module starts no prover.
 * Source/key/CRS verification remains in the calling operation. */
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resourcePath} from '@lianum/environment';
const modules=resourcePath('engine','experiments/private-core-proof/node_modules');
export async function loadOfficialProofLibrariesV1(){
 const [noir,backend]=await Promise.all([
  import(pathToFileURL(join(modules,'@noir-lang/noir_js/lib/index.mjs')).href),
  import(pathToFileURL(join(modules,'@aztec/bb.js/dest/node/index.js')).href),
 ]);
 return {...noir,...backend};
}
