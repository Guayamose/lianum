/** Exact NEW Solc build; data only. V2 artifacts and verifier lineage are retained separately. */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const FLAT_MINIMUM_BUILD_PIN=freeze({
  "attempt": "append-only-pool-minimum-v3-build-1",
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
    "v2/PrivateFlatAssetNotePoolV3.sol": [
      "10e08da48263e822c66d4785eb6acfc211fb5168e0dc0274e9cf76920a00a645",
      "6275c2c1ea02ca4ff5e34ca2defeea3c9bd4bb69dc3abd0610e46096539f2ef2"
    ],
    "v2/PrivateFlatReceiptHubV2.sol": [
      "f6a3c1ad15784552892f169f3f6b28065ec85c015422381f1e1f87fca4d73d5a",
      "209e08cc020313429a6734608c13b0ee3890d678e65f220e219c8e09c10878ba"
    ]
  },
  "artifacts": {
    "hub": [
      "v2/PrivateFlatReceiptHubV2.sol",
      "PrivateFlatReceiptHubV2",
      "10180111ae3ec8025d3eddc799e465d9e6cd8325a4b4e34bef03fb124873ebd1"
    ],
    "pool": [
      "v2/PrivateFlatAssetNotePoolV3.sol",
      "PrivateFlatAssetNotePoolV3",
      "9d51bc9061a9164b50b2cba8a6a7e8a064e1e17f8055f58df1400980c4fbcd92"
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
export const FLAT_MINIMUM_ARTIFACT_FILES=freeze({
  "compiled.json": {
    "path": ".local/development-flat-minimum/v3/compiled.json",
    "sha256": "3a8ea69d466a9cf9eb4480406d3b6e4ff5ec266506429b3280f8f4e50cf1f916",
    "bytes": 8504391
  },
  "standard-input.json": {
    "path": ".local/development-flat-minimum/v3/standard-input.json",
    "sha256": "278efc306cc253401234b037c5016633f9b0e7c7b48b5af6ccf6250c57ca8368",
    "bytes": 136708
  },
  "manifest.json": {
    "path": ".local/development-flat-minimum/v3/manifest.json",
    "sha256": "e0244db375f6b2a60407a790443a69e652273ed1921f732b5831e95d73898493",
    "bytes": 3260
  }
});
export const FLAT_MINIMUM_RUNTIME_BYTES=freeze({
  "hub": 24415,
  "pool": 22838,
  "poolRegistryCodec": 5979,
  "poseidon2Domains": 7598,
  "hubCodec": 11073
});
export const FLAT_MINIMUM_PROFILE='LIANUM_FLAT_APPEND_ONLY_POOLS_V3';
