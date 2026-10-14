/** Fixed reviewed V2 proposal entry. Retained pins and ABI are unchanged. */
import {createPinnedAppendOnlyDeploymentPlanner} from './append-only-deployment-plan-kernel.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Reviewed successful standard/runs200 build. Updating these literals requires
// a new source/artifact review; caller-provided matching hashes cannot replace them.
export const APPEND_ONLY_BUILD_PIN = freeze({
  "attempt": "append-only-pool-v2-candidate-2",
  "settingsSHA256": "96d0fa28f9e3e67bb711ed7dc213ae1cc9c0e4646c243806b3c3167cb5698cff",
  "sources": {
    "FlatHubCodec.sol": [
      "aadabeafefc8c985f485f3c31cdd31002426b14dd90096e6d38113f14035d487",
      "4ff5c1d14ed189b65122e8d1c5a188d879d45284e0a5f278004c48a012359ffe"
    ],
    "FlatVerifierSet.sol": [
      "dff6e8d216f6eebba2331fe38f54b57c4aaa3ba5d8355c0de1fd1d10410b6710",
      "6a2e8cff0a1cd82dc8a986f82962849168650f03824d2768ad9f760674a10853"
    ],
    "crypto/Poseidon2.sol": [
      "e1faf5b4497e7e9cc569e6711231eca9f4a4a4887cd673cc7257e8233b7ac740",
      "2d36b2ff37274ba8e01fa8bd833b428d84cabb22fc1f2d82991217e57ada58e1"
    ],
    "crypto/Poseidon2Domains.sol": [
      "ea25f1871682cb3498c83c1aba44cb954c68d7f962e69e2d79f1ac7edf177562",
      "5dc25c1dfe4ffcafb547b3d12414eb9c5c9deb83b08b7cd843a17231e064a697"
    ],
    "v2/FlatPoolRegistryCodecV2.sol": [
      "1786a8458e1095af7d1245da284d1cf5adbe8a3a64dd7d57ebfd0e4e528ca6dd",
      "0957309300e76d55828744a08f8942559fece50756efbb27702f12292238e16d"
    ],
    "v2/PrivateFlatAssetNotePoolV2.sol": [
      "14ad2dd10af26b9d34e44b8cfd5e0b15c51cfd6fd15b68096d5bf39851a8175a",
      "a2490f72c0a9ae7930d2abe8d88368f60f96d90f08744286c00268708ddc42e5"
    ],
    "v2/PrivateFlatReceiptHubV2.sol": [
      "f6a3c1ad15784552892f169f3f6b28065ec85c015422381f1e1f87fca4d73d5a",
      "f74e12f15a6cf61e8140e13da6cbf05fe2b24610b3354ee6f9d3d4121312123d"
    ]
  },
  "artifacts": {
    "hub": [
      "v2/PrivateFlatReceiptHubV2.sol",
      "PrivateFlatReceiptHubV2",
      "2b035abd3fa3dd3691127fcc8915020d94424887ccb93ef118fe53cf741774a8"
    ],
    "pool": [
      "v2/PrivateFlatAssetNotePoolV2.sol",
      "PrivateFlatAssetNotePoolV2",
      "300769fa30ba274578053ef3a27713eaf0c31259b79df691634ce38afcdd7323"
    ],
    "poolRegistryCodec": [
      "v2/FlatPoolRegistryCodecV2.sol",
      "FlatPoolRegistryCodecV2",
      "32c66bdf356c24e5b6413f26c8c3c103aa5293c3e11e8a48029e6ee9a8d45520"
    ],
    "poseidon2Domains": [
      "crypto/Poseidon2Domains.sol",
      "Poseidon2Domains",
      "2dd69907c051cf5b7665f611d2b33c290a4d0a5056ca1acfec0dde6609a5525a"
    ],
    "hubCodec": [
      "FlatHubCodec.sol",
      "FlatHubCodec",
      "8656b15c5f4d37623c657a94711460bd55be51c53c172b59a64e9f83bfc458f9"
    ]
  }
});


export const {deriveAppendOnlyLibraryPlans,buildAppendOnlyDeploymentPlan,buildAppendOnlySuccessorPlan}=createPinnedAppendOnlyDeploymentPlanner(APPEND_ONLY_BUILD_PIN,{minimumDeposits:false});
