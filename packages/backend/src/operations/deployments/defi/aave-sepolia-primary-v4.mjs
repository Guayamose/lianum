/** Reviewed official address data and finalized RPC code pins. DATA only;
 * this record issues no runtime, signer, proof, deployment or custody capability.
 * Upgradeable Aave contracts remain subject to their governance and RPC trust. */
const data={
  "networkId": "ethereum-sepolia",
  "chainId": "11155111",
  "genesis": "0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9",
  "primary": {
    "profile": "OFFICIAL_AAVE_SEPOLIA_ADDRESS_DATA_V4",
    "commit": "4ee7b505d40760f48bcfdc4edd5fe3d532ec88d2",
    "url": "https://raw.githubusercontent.com/aave-dao/aave-address-book/4ee7b505d40760f48bcfdc4edd5fe3d532ec88d2/src/AaveV3Sepolia.sol",
    "bytes": 14061,
    "sha256": "fe45780c0802fcb3705cec1321dffa466bc5069afc61714b96f4e710df9a594d"
  },
  "addresses": {
    "underlying": "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8",
    "pool": "0x6ae43d3271ff6888e7fc43fd7321a503ff738951",
    "factory": "0xd210dfb43b694430b8d31762b5199e30c31266c8",
    "wrapper": "0x8a88124522dbbf1e56352ba3de1d9f78c143751e",
    "aToken": "0x16da4541ad1807f4443d92d26044c1147406eb80",
    "provider": "0x012bac54348c0e635dcac9d5fb99f06f24136c9a"
  },
  "pins": {
    "0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8": {
      "bytes": 5462,
      "sha256": "583644aee778ddb688d4b61116b6259ef417b1a094dc8f8a578e0cfc099f4519"
    },
    "0x6ae43d3271ff6888e7fc43fd7321a503ff738951": {
      "bytes": 2333,
      "sha256": "0759fc2d3982461ad44c299f0b23df1c1c73b99916a9db591a4855a78822bc88"
    },
    "0xd210dfb43b694430b8d31762b5199e30c31266c8": {
      "bytes": 2081,
      "sha256": "665ffb4a6f21892738bb3390225a91b3cf61ca572e2a545a9bcf95ea738b3238"
    },
    "0x8a88124522dbbf1e56352ba3de1d9f78c143751e": {
      "bytes": 2081,
      "sha256": "665ffb4a6f21892738bb3390225a91b3cf61ca572e2a545a9bcf95ea738b3238"
    },
    "0x16da4541ad1807f4443d92d26044c1147406eb80": {
      "bytes": 2333,
      "sha256": "a7e1c15e6e732970ad331cb5f8238f3080886436e789b1ff505b37779e47591e"
    },
    "0x012bac54348c0e635dcac9d5fb99f06f24136c9a": {
      "bytes": 9779,
      "sha256": "0e18c72785e7a05a0dbf56d2ec2119fcdf894e7b080883be0e97468c21ff08cb"
    }
  },
  "proxies": {
    "0x6ae43d3271ff6888e7fc43fd7321a503ff738951": {
      "implementation": "0x0562453c3dafbb5e625483af58f4e6d668c44e19",
      "sha256": "6394583bf86d5f9638150d7ddc7dd3086b8d8443fb2018f0314251ef36155295",
      "bytes": 21673
    },
    "0xd210dfb43b694430b8d31762b5199e30c31266c8": {
      "implementation": "0x31a239f3e39c5d8ba6b201ba81ed584492ae960f",
      "sha256": "d23211c57cf9a05b84cf8fd376ef4bcccbf9690faa1fc79b4dbc25c26f052a81",
      "bytes": 3675
    },
    "0x8a88124522dbbf1e56352ba3de1d9f78c143751e": {
      "implementation": "0xe88fb4eaf67ea87bb458e24c94bef0eb02b5f449",
      "sha256": "9f7945754d4a4031215cc3b6b12d6bbdf5d7915741a98098a87cc093fa5e8e44",
      "bytes": 17587
    },
    "0x16da4541ad1807f4443d92d26044c1147406eb80": {
      "implementation": "0x48424f2779be0f03cdf6f02e17a591a9bf7af89f",
      "sha256": "3d4a268f66d2c6b730575e141a3908540ce558de7ab1ab2770d8ade87b075ba9",
      "bytes": 13783
    }
  },
  "proxySlot": "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  "minimumShares": "1000000",
  "decimals": 6
};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
freeze(data);
export function readFixedAaveSepoliaPrimaryDataV4(){if(arguments.length!==0)throw new Error('AAVE_FIXED_PRIMARY_DATA');return data;}
