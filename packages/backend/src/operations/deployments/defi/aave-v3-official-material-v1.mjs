/** Official pinned upstream artifacts and wrapper sources; fresh development only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@lianum/proofs/catalog';
const sha = value => createHash('sha256').update(value).digest('hex');
export const AAVE_CORE_V3_MATERIAL_V1 = Object.freeze({
  "version": "1.19.3",
  "gitHead": "724a9ef43adf139437ba87dcbab63462394d4601",
  "archiveSHA256": "a7bd560885fa804a5233ceb8f9c4da4ef3336246590b6f35e4eaedef044a8679",
  "contracts": [
    {
      "name": "PoolAddressesProvider",
      "path": "artifacts/contracts/protocol/configuration/PoolAddressesProvider.sol/PoolAddressesProvider.json",
      "sha256": "94062e07572d39fd9c697cde904a7c29ef9fabbac4c15c4d6f8c33b88f888085",
      "bytes": 53968,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "ACLManager",
      "path": "artifacts/contracts/protocol/configuration/ACLManager.sol/ACLManager.json",
      "sha256": "5e47cbcfcaa6267c2ac47327381d458a55041001c47fde74110001827c66489c",
      "bytes": 33535,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "Pool",
      "path": "artifacts/contracts/protocol/pool/Pool.sol/Pool.json",
      "sha256": "a6dc3c40c52757deafa47f2d45d3a19b111a2ac1ca19b062cf39af558efe41c0",
      "bytes": 130833,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "PoolConfigurator",
      "path": "artifacts/contracts/protocol/pool/PoolConfigurator.sol/PoolConfigurator.json",
      "sha256": "7d9163867ac1d6851ee4fcde17f8a5777d537835ad9d4db1b5f88258f15ccd83",
      "bytes": 127772,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "AToken",
      "path": "artifacts/contracts/protocol/tokenization/AToken.sol/AToken.json",
      "sha256": "b9f55205c68995ce3a4ae2cc7915615b835ff53c3ea60cd32880d96c9a5d6ea5",
      "bytes": 76260,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "StableDebtToken",
      "path": "artifacts/contracts/protocol/tokenization/StableDebtToken.sol/StableDebtToken.json",
      "sha256": "02d7c367028f17760a6b366a15b696b58d631fbd47e38203f7debffb866a18c1",
      "bytes": 63834,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "VariableDebtToken",
      "path": "artifacts/contracts/protocol/tokenization/VariableDebtToken.sol/VariableDebtToken.json",
      "sha256": "18857b088478c206a95e25cd107d2382f73a8426018249432eee55091134e0e8",
      "bytes": 56885,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "DefaultReserveInterestRateStrategy",
      "path": "artifacts/contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol/DefaultReserveInterestRateStrategy.json",
      "sha256": "42e346d7ea3cb1638cf0766a25063830fe42de978e685cd5fc76e16cc74d35e4",
      "bytes": 21222,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "InitializableImmutableAdminUpgradeabilityProxy",
      "path": "artifacts/contracts/protocol/libraries/aave-upgradeability/InitializableImmutableAdminUpgradeabilityProxy.sol/InitializableImmutableAdminUpgradeabilityProxy.json",
      "sha256": "17085118168f226e4fda0a2de5495598895ff966f33bb44128058e837a145712",
      "bytes": 12133,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "BorrowLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/BorrowLogic.sol/BorrowLogic.json",
      "sha256": "ad29be77a9d8db17425b72dd672e087263b2dde213523635480309b7e0590cd9",
      "bytes": 94949,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "BridgeLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/BridgeLogic.sol/BridgeLogic.json",
      "sha256": "e7369ce4549601d411477dae3c58c75157bf88e387385c4877d8e6031c4eed60",
      "bytes": 38023,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "ConfiguratorLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/ConfiguratorLogic.sol/ConfiguratorLogic.json",
      "sha256": "65285e9649afe9781a1a4514beb0ceb9ea0b838d66639bed05e5a1f3176536d8",
      "bytes": 37850,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "EModeLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/EModeLogic.sol/EModeLogic.json",
      "sha256": "a3d2cbd116ee1e48a1789673b1ee21cc19d168d080436c4372f8728c5a4785e3",
      "bytes": 21691,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "FlashLoanLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/FlashLoanLogic.sol/FlashLoanLogic.json",
      "sha256": "3df42b35d69bfa4a7c3fa9a22654a7032b33cca8642dec8f32a6c969cde5faab",
      "bytes": 46433,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "LiquidationLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/LiquidationLogic.sol/LiquidationLogic.json",
      "sha256": "a0b8d4e370a50851fce5565bd849c80a2b8fe93e22ef851fcfaf331e0dc7a439",
      "bytes": 68582,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "PoolLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/PoolLogic.sol/PoolLogic.json",
      "sha256": "165a6225c076cd1f6179a3ff07d5a96ea433e683be4018c568c90ee7dbb13650",
      "bytes": 39917,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    },
    {
      "name": "SupplyLogic",
      "path": "artifacts/contracts/protocol/libraries/logic/SupplyLogic.sol/SupplyLogic.json",
      "sha256": "eeb59192da24f4d5a0fb74f6f721990485c2edf011a1b3df51606b76592ca1b1",
      "bytes": 65810,
      "buildInfo": "artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json",
      "buildInfoSHA256": "fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9"
    }
  ]
});
export const AAVE_STATIC_WRAPPER_MATERIAL_V1 = Object.freeze({
  "repository": "bgd-labs/static-a-token-v3",
  "commit": "101f5d977889254ca2d2711b9582b45f832d10a0",
  "entry": "static-a-token-v3/src/StaticATokenLM.sol",
  "files": [
    {
      "path": "aave-v3-core/contracts/interfaces/IAaveIncentivesController.sol",
      "sha256": "32b0077aa798eb53a41c058e4198d88a8701b8845e4cf959384e0f87cdd82c98",
      "bytes": 847
    },
    {
      "path": "aave-v3-core/contracts/interfaces/IPool.sol",
      "sha256": "d708ba2c3cf29fe81083b7b8127ef61b7d750dc017399ebaa2951d6f61a93dda",
      "bytes": 32693
    },
    {
      "path": "aave-v3-core/contracts/interfaces/IPoolAddressesProvider.sol",
      "sha256": "419371fd89901f852ad2e6ed2a043c88db00f73394266857ece39e769e2242e4",
      "bytes": 8215
    },
    {
      "path": "aave-v3-core/contracts/interfaces/IScaledBalanceToken.sol",
      "sha256": "6dbe39f0e2e0855e1fe4d8944a068b365d19132d817e38352011ce865448fc21",
      "bytes": 2740
    },
    {
      "path": "aave-v3-core/contracts/protocol/libraries/configuration/ReserveConfiguration.sol",
      "sha256": "6983afb0b2a021cbf9ebdd88d970a519d90ca3cad3aeae44a38125f293e8df6d",
      "bytes": 23655
    },
    {
      "path": "aave-v3-core/contracts/protocol/libraries/helpers/Errors.sol",
      "sha256": "dea1dcf0a8838e7560e03e0f32e4f53c69c98b167b8a44afcd1f0110191e6602",
      "bytes": 9910
    },
    {
      "path": "aave-v3-core/contracts/protocol/libraries/math/MathUtils.sol",
      "sha256": "7f73c927e9801debfe0666e2a6364b92f62fd2d58d0c4b485ff04765fd4dc58d",
      "bytes": 3357
    },
    {
      "path": "aave-v3-core/contracts/protocol/libraries/math/WadRayMath.sol",
      "sha256": "fae5b995ec613cc213050c99ea6352c9c18ceebba106d03b1726cfa8f1f0124e",
      "bytes": 4151
    },
    {
      "path": "aave-v3-core/contracts/protocol/libraries/types/DataTypes.sol",
      "sha256": "76d90509a0e359b071acd82729c76a406d63f23cfdcc1d60001b939c61efe4a1",
      "bytes": 7369
    },
    {
      "path": "aave-v3-periphery/contracts/misc/interfaces/IEACAggregatorProxy.sol",
      "sha256": "8227a90f85ff6f19028eb04c2d422d15fded00d1a64a8cf2fe8f8366c956cd9e",
      "bytes": 639
    },
    {
      "path": "aave-v3-periphery/contracts/rewards/interfaces/IRewardsController.sol",
      "sha256": "06419fb18c7994c386a18b1f5687374506f080e5ae6067b7a4864c2e051e8636",
      "bytes": 9162
    },
    {
      "path": "aave-v3-periphery/contracts/rewards/interfaces/IRewardsDistributor.sol",
      "sha256": "f3f71bf8b0ac60d30c7f5dde9861faca48de569f2d5f2adc1953b104affc2471",
      "bytes": 7040
    },
    {
      "path": "aave-v3-periphery/contracts/rewards/interfaces/ITransferStrategyBase.sol",
      "sha256": "0c6e9c57d31d46d68ebba9df89bf2ba20e175727ab73e0ae48578c380b0be3ef",
      "bytes": 1336
    },
    {
      "path": "aave-v3-periphery/contracts/rewards/libraries/RewardsDataTypes.sol",
      "sha256": "53b99d2e41e6be6a5c0016f49be87b63a02f5976d59f2b44770a1b33b9f2d81d",
      "bytes": 1665
    },
    {
      "path": "solidity-utils/contracts/oz-common/Address.sol",
      "sha256": "acb0cee874c1a58a26853a89711da98f6cd01482eb58ca169e5bc220541195ad",
      "bytes": 8671
    },
    {
      "path": "solidity-utils/contracts/oz-common/SafeCast.sol",
      "sha256": "3bc53ea9a3caf028e0f18bdcb394d480749ab97df3850d9ff8f4bc49551d6833",
      "bytes": 32723
    },
    {
      "path": "solidity-utils/contracts/oz-common/SafeERC20.sol",
      "sha256": "91d7f91acc50db325226d9813cbd70423247a600af20abe5ca3ed8edf7cd75d7",
      "bytes": 6279
    },
    {
      "path": "solidity-utils/contracts/oz-common/interfaces/IERC20.sol",
      "sha256": "ad84b13dff25e4e8d59c65ac9e70ec0e06e9e66166bff8470007a8986d0458d1",
      "bytes": 2733
    },
    {
      "path": "solidity-utils/contracts/oz-common/interfaces/IERC20Metadata.sol",
      "sha256": "9d80777ce9bfb4e5ba251ad188993d2c9a4eb92995804697c125be88ac7e35c6",
      "bytes": 776
    },
    {
      "path": "solidity-utils/contracts/oz-common/interfaces/IERC20Permit.sol",
      "sha256": "3a1544959e953a6da627602ca4d277e942393247a9ba5437f4411f6b0756049b",
      "bytes": 2330
    },
    {
      "path": "solidity-utils/contracts/oz-common/interfaces/IERC20WithPermit.sol",
      "sha256": "231beea1920c703132f80b9a64714c0678aaf18fcc8d4f0e20f72e5ff6395249",
      "bytes": 198
    },
    {
      "path": "solidity-utils/contracts/transparent-proxy/Initializable.sol",
      "sha256": "2847f38444a5b38eba59b157f5c82c890050c7b26626df93e2bd2728156268cf",
      "bytes": 5864
    },
    {
      "path": "static-a-token-v3/src/ECDSA.sol",
      "sha256": "46f143dc0c95778ae80d0d19d5042c371732a06be2ab2855df30d2481543e2b2",
      "bytes": 7277
    },
    {
      "path": "static-a-token-v3/src/ERC20.sol",
      "sha256": "970f12632fb6f44c10c39a8e7951a4c06e875d8d07ac39fdc683e4f19e6b8b89",
      "bytes": 6502
    },
    {
      "path": "static-a-token-v3/src/RayMathExplicitRounding.sol",
      "sha256": "f6dc18dd1586f58866806124404f88f31ad0165fa29f93ca36c5012bb137e517",
      "bytes": 1156
    },
    {
      "path": "static-a-token-v3/src/StaticATokenErrors.sol",
      "sha256": "24a75246716647bbefb3443a32b6079c67737cb7dbf0af9356c48301eb7ee4f3",
      "bytes": 559
    },
    {
      "path": "static-a-token-v3/src/StaticATokenLM.sol",
      "sha256": "e9b4f0dd4812c6a5a140073009d5cc6c1486106fffe783b7018855e0b8cda22a",
      "bytes": 24586
    },
    {
      "path": "static-a-token-v3/src/interfaces/IAToken.sol",
      "sha256": "b7b34e73de2313bb49baf82c04248d88c4aae1f775cbeb3e4f618d613b2ad715",
      "bytes": 602
    },
    {
      "path": "static-a-token-v3/src/interfaces/IERC4626.sol",
      "sha256": "65d7933051edbda2f66ac1832e564d8c845856e881e11972cedb9488b6820d96",
      "bytes": 12540
    },
    {
      "path": "static-a-token-v3/src/interfaces/IInitializableStaticATokenLM.sol",
      "sha256": "2714c0ff36e3cb5d597c088489b15c8fa6b0b8ba8256a9b0da05bb58f67ee884",
      "bytes": 1137
    },
    {
      "path": "static-a-token-v3/src/interfaces/IStaticATokenLM.sol",
      "sha256": "b25efdaa2d48a9010ca5ea2652bb70d599d9a3528750472564be81ec2c436dc8",
      "bytes": 8280
    }
  ]
});
const D = join(ROOT, 'wallet-platform/artifacts/aave-v3-development-v1');
function exactFile(path, pin, maximum = 40_000_000) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum, 'AAVE_MATERIAL_REGULAR_FILE');
  const raw = readFileSync(path); assert.equal(sha(raw), pin, 'AAVE_MATERIAL_PIN'); return raw;
}
/** Join bundled upstream artifacts to the actual upstream build-info. */
export function loadOfficialAaveCoreArtifactsV1() {
  assert.equal(arguments.length, 0); const artifacts = {}, sourceASTs = {}, sources = {}, readBuilds = new Map();
  for (const row of AAVE_CORE_V3_MATERIAL_V1.contracts) {
    const raw = exactFile(join(D, 'core-v3-1.19.3/package', row.path), row.sha256);
    assert.equal(raw.length, row.bytes); const a = JSON.parse(raw);
    assert.equal(a.contractName, row.name);
    let build = readBuilds.get(row.buildInfo);
    if (!build) {
      build = JSON.parse(exactFile(join(D, 'core-v3-1.19.3/package', row.buildInfo), row.buildInfoSHA256));
      assert.equal(build.solcVersion, '0.8.10');
      assert.deepEqual(build.input.settings.optimizer, {enabled: true, runs: 100000});
      assert.equal(build.input.settings.evmVersion, 'london');
      for (const [name, input] of Object.entries(build.input.sources)) {
        assert.ok(!name.startsWith('/') && !name.split('/').includes('..'), 'AAVE_SOURCE_NAME');
        const source = exactFile(join(D, 'core-v3-1.19.3/package', name), sha(input.content));
        assert.equal(source.toString('utf8'), input.content); sources[name] = input.content;
      }
      Object.assign(sourceASTs, build.output.sources); readBuilds.set(row.buildInfo, build);
    }
    const produced = build.output.contracts[a.sourceName][row.name];
    assert.deepEqual(a.abi, produced.abi); assert.equal(a.bytecode, '0x' + produced.evm.bytecode.object);
    assert.equal(a.deployedBytecode, '0x' + produced.evm.deployedBytecode.object);
    assert.deepEqual(a.linkReferences, produced.evm.bytecode.linkReferences);
    assert.deepEqual(a.deployedLinkReferences, produced.evm.deployedBytecode.linkReferences);
    artifacts[row.name] = {...a, evm: produced.evm};
  }
  // Extract the constructor-initialized proxy from the SAME pinned upstream
  // compiler output already joined above. This is published 0.8.10 output,
  // not a new compilation or a replacement for any standalone artifact.
  const sourceName = 'contracts/dependencies/openzeppelin/upgradeability/AdminUpgradeabilityProxy.sol';
  const contractName = 'AdminUpgradeabilityProxy';
  const produced = readBuilds.get(AAVE_CORE_V3_MATERIAL_V1.contracts[0].buildInfo).output.contracts[sourceName][contractName];
  artifacts[contractName] = {sourceName, contractName, abi: produced.abi,
    bytecode: '0x' + produced.evm.bytecode.object, deployedBytecode: '0x' + produced.evm.deployedBytecode.object,
    linkReferences: produced.evm.bytecode.linkReferences, deployedLinkReferences: produced.evm.deployedBytecode.linkReferences,
    evm: produced.evm};
  return {artifacts, sourceASTs, sourceRecords: Object.keys(sources).sort().map(path => ({path, sha256: sha(sources[path])}))};
}
export function loadOfficialAaveWrapperSourcesV1() {
  assert.equal(arguments.length, 0); const sources = {};
  for (const row of AAVE_STATIC_WRAPPER_MATERIAL_V1.files) {
    const raw = exactFile(join(D, 'static-a-token-v3-101f5d9', row.path), row.sha256, 1_000_000);
    assert.equal(raw.length, row.bytes); sources[row.path] = {content: raw.toString('utf8')};
  }
  return sources;
}
