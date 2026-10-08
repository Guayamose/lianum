/** Fixed official public Jupiter snapshot. Not recovered/compiled/private evidence. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT} from '../../../../../proofs/src/catalog.mjs';
import {regular,hash} from '../../../../../proofs/src/tooling/tooling.mjs';
export const JUPITER_OFFICIAL_COMMIT_V1='cc068c9d1df0060c62f9a8a4fc37ea13ea7b9b39';
export const JUPITER_OFFICIAL_PROGRAM_V1='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
export const ORCA_OFFICIAL_PROGRAM_V1='9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP';
export const JUPITER_OFFICIAL_POOL_V1='EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U';
export const JUPITER_OFFICIAL_FILES_V1=Object.freeze([
  {
    "path": "README.md",
    "bytes": 1184,
    "sha256": "7a8dfb865145c838bfa2a5ed86671c04c86def84ca9cdf9d5f67f31502281a0c"
  },
  {
    "path": "Cargo.lock",
    "bytes": 177347,
    "sha256": "319bb841288680b08797c879d8cbd95e6ac4f29df87237a9f706664117a26cee"
  },
  {
    "path": "idls/jupiter_aggregator_v6.json",
    "bytes": 38435,
    "sha256": "100b41d7caad93818cf440e8ae97bde43e6dad1ca732de45762adf43013cf9d6"
  },
  {
    "path": "idls/jupiter_dex_interfaces.json",
    "bytes": 100623,
    "sha256": "e737c2859dd4e656a92ea68e9d9165525bbbbfcd2d739c5de66051b1e5ff90af"
  },
  {
    "path": "jupiter-aggregator-v6/src/lib.rs",
    "bytes": 10485,
    "sha256": "17715930a3be813b87ed2ab672f5a14a75e4ecd3cbfcdbe14916f0f20f1ce944"
  },
  {
    "path": "jupiter-core/tests/fixtures/README.md",
    "bytes": 1645,
    "sha256": "0d3acfb6f5fb8b7dba95389cf102567350eb4a581c56af80c8ce1e372443b1d4"
  },
  {
    "path": "jupiter-core/tests/fixtures/jupiter_v6.so",
    "bytes": 1220464,
    "sha256": "a34a851815fa90fc17d65e3417e8ef5debe45ca46b0c9cd5613e2d1f8f87a25f"
  },
  {
    "path": "jupiter-core/tests/fixtures/orca_v2.so",
    "bytes": 691104,
    "sha256": "86bf92b3e6c73fd0c30019d23f4b55457bf6e61a31563c545a0893d2897b4e52"
  },
  {
    "path": "jupiter-core/src/amms/spl_token_swap_amm.rs",
    "bytes": 7611,
    "sha256": "73f16aee6b3dec387f87077576fb90091b9e6a99f71db06ad9c9fcf539d4e6ee"
  },
  {
    "path": "jupiter-core/src/amms/test_harness.rs",
    "bytes": 43646,
    "sha256": "5f85284fdd946e96bfe34478f488e08b7c53a40d3c86fb381d9dc8e152e0ea24"
  },
  {
    "path": "jupiter-core/src/route/route.rs",
    "bytes": 663,
    "sha256": "1bacfbd0bcbc9c4d89c317329199c0a2883c69713fe35a75abfc8679c1e26c34"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/75HgnSvXbWKZBpZHveX68ZzAhDqMzNDS29X6BGLtxMo1.bin",
    "bytes": 222,
    "sha256": "6c819c62478d08456650a797d29dea0ab90bb369fdecf4e8b22fedc5197c25d3"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/8JnSiuvQq3BVuCU3n4DrSTw9chBSPvEMswrhtifVkr1o.bin",
    "bytes": 222,
    "sha256": "24181228e73a316e83eea8697b0eb42b61cb5a93232d062d1a6fb57bfbc5a992"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg.bin",
    "bytes": 222,
    "sha256": "3ba1dd768a0f7f89c86c135885e66d4128822de3a9fc7258a06b0a2444d87b3d"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/APDFRM3HMr8CAGXwKHiu2f5ePSpaiEJhaURwhsRrUUt9.bin",
    "bytes": 139,
    "sha256": "235392a0708c7c23b09a20319b14f0321314bcea28502a273647088088d4cc65"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U.bin",
    "bytes": 381,
    "sha256": "84bf97152c9d89a19ee1eedb16b79ad0175a3aac2d0ad4e29b21690d7dd0b1b7"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.bin",
    "bytes": 139,
    "sha256": "24ba455df5181acd60e60f97af7b6b8757124923931b8d56e3d9c1bbceac65b4"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/JU8kmKzDHF9sXWsnoznaFDFezLsE5uomX2JkRMbmsQP.bin",
    "bytes": 57,
    "sha256": "b0cb5275dc24d5f401f8f13e8006070cd240183ea8715b973db6a1e7b0b71b0b"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/So11111111111111111111111111111111111111112.bin",
    "bytes": 139,
    "sha256": "6bf90fa892d8499099f263c34360e1609294c899d4a5f293e2d1183497195c51"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/SysvarC1ock11111111111111111111111111111111.bin",
    "bytes": 97,
    "sha256": "ca8cf96b40bcf9c9ca6c60b3494c0ba4ebe133f1c7cbecca316c1163ba68ea18"
  },
  {
    "path": "jupiter-core/tests/fixtures/accounts/EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA.bin",
    "bytes": 134137,
    "sha256": "d3ab1405c9b5d066ee9a2541727c760311bcce48c4bbe507d5caa7ca501ef275"
  },
  {
    "path": "jupiter-core/src/swap_transaction/build_swap_instruction.rs",
    "bytes": 12715,
    "sha256": "b911709e2f0d5b451838f4ac1ff4b61822eb9a3f77ce73e46dbaa9faa2ae77e5"
  },
  {
    "path": "jupiter-core/src/math/swap_curve_info.rs",
    "bytes": 1182,
    "sha256": "18bb3d2dc85731391ad2b55bcaa1457a61ecc858f8752535d526560aa6886cd4"
  },
  {
    "path": "jupiter-core/src/active_features.rs",
    "bytes": 20737,
    "sha256": "70d67f94991e09e079980e83ea24c305ad3756bbb4716fdcf4839e5e0a3743e4"
  }
]);
export const JUPITER_PUBLIC_FIXTURE_SOURCE_REVIEW_V1=null;
export function assertJupiterPublicFixtureSourceReviewV1(){
 assert.equal(arguments.length,0);assert.deepEqual(JUPITER_PUBLIC_FIXTURE_SOURCE_REVIEW_V1,{commit:JUPITER_OFFICIAL_COMMIT_V1,
  program:JUPITER_OFFICIAL_PROGRAM_V1,dex:ORCA_OFFICIAL_PROGRAM_V1,pool:JUPITER_OFFICIAL_POOL_V1,localOnly:true,fakeFundsOnly:true,
  recoveredArtifact:false,locallyCompiled:false,publicNetwork:false,privateCreditEstablished:false,fullWalletAcceptance:false},'JUPITER_PUBLIC_FIXTURE_SOURCE_REVIEW_REQUIRED');
}
export function loadJupiterOfficialMaterialV1(){
 assert.equal(arguments.length,0,'JUPITER_MATERIAL_NO_OPTIONS');
 const directory=join(ROOT,'wallet-platform/artifacts/jupiter-public-snapshot-v1'),files=new Map();
 for(const row of JUPITER_OFFICIAL_FILES_V1){const raw=regular(join(directory,row.path));assert.equal(raw.length,row.bytes);assert.equal(hash(raw),row.sha256,'JUPITER_OFFICIAL_MATERIAL_PIN');files.set(row.path,raw);}
 const idl=JSON.parse(files.get('idls/jupiter_aggregator_v6.json'));assert.equal(idl.address,JUPITER_OFFICIAL_PROGRAM_V1);
 const route=idl.instructions.find(row=>row.name==='route');assert.deepEqual(route.discriminator,[229,23,203,151,122,227,173,42]);
 assert.deepEqual(route.args.map(row=>[row.name,row.type]),[['route_plan',{vec:{defined:{name:'RoutePlanStep'}}}],['in_amount','u64'],['quoted_out_amount','u64'],['slippage_bps','u16'],['platform_fee_bps','u8']]);
 const variants=idl.types.find(row=>row.name==='Swap').type.variants;assert.equal(variants[3].name,'TokenSwap');assert.equal(variants[3].fields,undefined);
 for(const name of ['jupiter_v6.so','orca_v2.so']){const raw=files.get('jupiter-core/tests/fixtures/'+name);assert.equal(raw.subarray(0,4).toString('hex'),'7f454c46');assert.equal(raw[4],2);assert.equal(raw[5],1);assert.equal(raw.readUInt16LE(18),247,'JUPITER_SBF_ELF_REQUIRED');}
 return {directory,files,idl,commit:JUPITER_OFFICIAL_COMMIT_V1,privateCreditEstablished:false};
}
