/** Fixed existing official-factory VaultV2 and Circle test-token DATA.
 * A third-party curator controls adapters/gates; no fixture creates authority. */
const data={
  "profile": "FIXED_EXISTING_MORPHO_VAULT_V2_SEPOLIA_DATA_V4",
  "networkId": "ethereum-sepolia",
  "chainId": "11155111",
  "genesis": "0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9",
  "primary": {
    "morpho": "https://docs.morpho.org/developers/contracts/addresses/",
    "circle": "https://developers.circle.com/stablecoins/usdc-contract-addresses",
    "factoryCode": "https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2Factory.sol",
    "vaultCode": "https://github.com/morpho-org/vault-v2/blob/main/src/VaultV2.sol",
    "adapterCode": "https://github.com/morpho-org/vault-v2/blob/main/src/adapters/MorphoMarketV1AdapterV2.sol"
  },
  "addresses": {
    "underlying": "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    "vault": "0x96923a7fa4fd47f937a4948092d79bb3d46c03fe",
    "adapter": "0x8f6b58f129e73552bfcdbe4e4ed0528b868b7f44",
    "factory": "0xb3fe2d5f8af90f194b01db546397058fcebb85d1",
    "adapterFactory": "0x5481f54cacdf0aece9f71f2bb2c0a8e44b2d5d81",
    "morpho": "0xd011ee229e7459ba1ddd22631ef7bf528d424a14",
    "irm": "0x8c5ddcd3f601c91d1bf51c8ec26066010acaba7c"
  },
  "pins": {
    "0x96923a7fa4fd47f937a4948092d79bb3d46c03fe": {
      "bytes": 21808,
      "sha256": "9ca0a94c9d50d24cffc6a4459fa36bb740c254d80b9caa9525577c9760a3c191"
    },
    "0x8f6b58f129e73552bfcdbe4e4ed0528b868b7f44": {
      "bytes": 11784,
      "sha256": "85fc1a094f1d5894c3a69a6a0150cff450a79283edb47ab6b44544eb5d30c381"
    },
    "0xb3fe2d5f8af90f194b01db546397058fcebb85d1": {
      "bytes": 23124,
      "sha256": "cf0f79d0fb41a563e915b81cefb581f74acb46336cee022c1991671d9e575d8e"
    },
    "0x5481f54cacdf0aece9f71f2bb2c0a8e44b2d5d81": {
      "bytes": 13633,
      "sha256": "250c3e20270609f608ff35e21be2763dc00fdc1e0f31f63d95b4055acd5b059e"
    },
    "0xd011ee229e7459ba1ddd22631ef7bf528d424a14": {
      "bytes": 15623,
      "sha256": "769ff4f42a3c4f40768a9c1a307ee884ab328d2c85e8556c976360f2a769584a"
    },
    "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": {
      "bytes": 1798,
      "sha256": "846efa39d1689bdcffea1cdabe788d0b6f81050c0667ad6444e722aed27f7e86"
    },
    "0x8c5ddcd3f601c91d1bf51c8ec26066010acaba7c": {
      "bytes": 2323,
      "sha256": "9e090c9b85adc16acb91407ae6a58bf4ea26f000c4a6f28d7c0e541f86c46c50"
    }
  },
  "assetProxy": {
    "slot": "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
    "implementation": "0xda317c1d3e835dd5f1be459006471acaa1289068",
    "codeSHA256": "eb2726ec3ac0cb69704b0d37e7076470f47e87c6eaac452f173d58c607b4265f",
    "bytes": 23464
  },
  "marketId": "0x8c561f0929c3a3e2b20fba99c2ae15fc57b4d0599e4371b67c9a58388a27b9d2",
  "marketParameters": "0x0000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000007b79995e5f793a07bc00c21412e50ecae098e7f9000000000000000000000000af02d46ada7bae6180ac2034c897a44ac11397b20000000000000000000000008c5ddcd3f601c91d1bf51c8ec26066010acaba7c0000000000000000000000000000000000000000000000000d1d507e40be8000",
  "liquidityData": "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000001c7d4b196cb0c7b01d743fbc6116a902379c72380000000000000000000000007b79995e5f793a07bc00c21412e50ecae098e7f9000000000000000000000000af02d46ada7bae6180ac2034c897a44ac11397b20000000000000000000000008c5ddcd3f601c91d1bf51c8ec26066010acaba7c0000000000000000000000000000000000000000000000000d1d507e40be8000",
  "minimumShares": "1000000000000000000",
  "minimumUnderlying": "1000000",
  "underlyingDecimals": 6,
  "shareDecimals": 18,
  "maximumNoteShares": "18446744073709551615",
  "thirdPartyCurator": true,
  "financialAuthority": false,
  "privateProofAcceptance": false,
  "publicDeployment": false
};
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}freeze(data);
export function readFixedMorphoV2SepoliaPrimaryDataV4(){if(arguments.length!==0)throw new Error('MORPHO_V2_FIXED_PRIMARY_DATA');return data;}
