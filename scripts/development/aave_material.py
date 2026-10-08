"""Prepare fixed official Aave material. No compiler, node or private credit."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DESTINATION = ROOT / '.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/artifacts/aave-v3-development-v1'
ARCHIVE_URL = 'https://registry.npmjs.org/@aave/core-v3/-/core-v3-1.19.3.tgz'
ARCHIVE_SHA256 = 'a7bd560885fa804a5233ceb8f9c4da4ef3336246590b6f35e4eaedef044a8679'
CORE = [{'name': 'PoolAddressesProvider', 'path': 'artifacts/contracts/protocol/configuration/PoolAddressesProvider.sol/PoolAddressesProvider.json', 'sha256': '94062e07572d39fd9c697cde904a7c29ef9fabbac4c15c4d6f8c33b88f888085', 'bytes': 53968, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'ACLManager', 'path': 'artifacts/contracts/protocol/configuration/ACLManager.sol/ACLManager.json', 'sha256': '5e47cbcfcaa6267c2ac47327381d458a55041001c47fde74110001827c66489c', 'bytes': 33535, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'Pool', 'path': 'artifacts/contracts/protocol/pool/Pool.sol/Pool.json', 'sha256': 'a6dc3c40c52757deafa47f2d45d3a19b111a2ac1ca19b062cf39af558efe41c0', 'bytes': 130833, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'PoolConfigurator', 'path': 'artifacts/contracts/protocol/pool/PoolConfigurator.sol/PoolConfigurator.json', 'sha256': '7d9163867ac1d6851ee4fcde17f8a5777d537835ad9d4db1b5f88258f15ccd83', 'bytes': 127772, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'AToken', 'path': 'artifacts/contracts/protocol/tokenization/AToken.sol/AToken.json', 'sha256': 'b9f55205c68995ce3a4ae2cc7915615b835ff53c3ea60cd32880d96c9a5d6ea5', 'bytes': 76260, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'StableDebtToken', 'path': 'artifacts/contracts/protocol/tokenization/StableDebtToken.sol/StableDebtToken.json', 'sha256': '02d7c367028f17760a6b366a15b696b58d631fbd47e38203f7debffb866a18c1', 'bytes': 63834, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'VariableDebtToken', 'path': 'artifacts/contracts/protocol/tokenization/VariableDebtToken.sol/VariableDebtToken.json', 'sha256': '18857b088478c206a95e25cd107d2382f73a8426018249432eee55091134e0e8', 'bytes': 56885, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'DefaultReserveInterestRateStrategy', 'path': 'artifacts/contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol/DefaultReserveInterestRateStrategy.json', 'sha256': '42e346d7ea3cb1638cf0766a25063830fe42de978e685cd5fc76e16cc74d35e4', 'bytes': 21222, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'InitializableImmutableAdminUpgradeabilityProxy', 'path': 'artifacts/contracts/protocol/libraries/aave-upgradeability/InitializableImmutableAdminUpgradeabilityProxy.sol/InitializableImmutableAdminUpgradeabilityProxy.json', 'sha256': '17085118168f226e4fda0a2de5495598895ff966f33bb44128058e837a145712', 'bytes': 12133, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'BorrowLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/BorrowLogic.sol/BorrowLogic.json', 'sha256': 'ad29be77a9d8db17425b72dd672e087263b2dde213523635480309b7e0590cd9', 'bytes': 94949, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'BridgeLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/BridgeLogic.sol/BridgeLogic.json', 'sha256': 'e7369ce4549601d411477dae3c58c75157bf88e387385c4877d8e6031c4eed60', 'bytes': 38023, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'ConfiguratorLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/ConfiguratorLogic.sol/ConfiguratorLogic.json', 'sha256': '65285e9649afe9781a1a4514beb0ceb9ea0b838d66639bed05e5a1f3176536d8', 'bytes': 37850, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'EModeLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/EModeLogic.sol/EModeLogic.json', 'sha256': 'a3d2cbd116ee1e48a1789673b1ee21cc19d168d080436c4372f8728c5a4785e3', 'bytes': 21691, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'FlashLoanLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/FlashLoanLogic.sol/FlashLoanLogic.json', 'sha256': '3df42b35d69bfa4a7c3fa9a22654a7032b33cca8642dec8f32a6c969cde5faab', 'bytes': 46433, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'LiquidationLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/LiquidationLogic.sol/LiquidationLogic.json', 'sha256': 'a0b8d4e370a50851fce5565bd849c80a2b8fe93e22ef851fcfaf331e0dc7a439', 'bytes': 68582, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'PoolLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/PoolLogic.sol/PoolLogic.json', 'sha256': '165a6225c076cd1f6179a3ff07d5a96ea433e683be4018c568c90ee7dbb13650', 'bytes': 39917, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}, {'name': 'SupplyLogic', 'path': 'artifacts/contracts/protocol/libraries/logic/SupplyLogic.sol/SupplyLogic.json', 'sha256': 'eeb59192da24f4d5a0fb74f6f721990485c2edf011a1b3df51606b76592ca1b1', 'bytes': 65810, 'buildInfo': 'artifacts/build-info/43678f55a3ef48531b5ad2350a78a276.json', 'buildInfoSHA256': 'fdeede4711f7ef647f75f6e5d8ab7d8e6ce5716987dd8eea53de1880813bf3c9'}]
WRAPPER = [{'path': 'aave-v3-core/contracts/interfaces/IAaveIncentivesController.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/interfaces/IAaveIncentivesController.sol', 'bytes': 847, 'sha256': '32b0077aa798eb53a41c058e4198d88a8701b8845e4cf959384e0f87cdd82c98'}, {'path': 'aave-v3-core/contracts/interfaces/IPool.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/interfaces/IPool.sol', 'bytes': 32693, 'sha256': 'd708ba2c3cf29fe81083b7b8127ef61b7d750dc017399ebaa2951d6f61a93dda'}, {'path': 'aave-v3-core/contracts/interfaces/IPoolAddressesProvider.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/interfaces/IPoolAddressesProvider.sol', 'bytes': 8215, 'sha256': '419371fd89901f852ad2e6ed2a043c88db00f73394266857ece39e769e2242e4'}, {'path': 'aave-v3-core/contracts/interfaces/IScaledBalanceToken.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/interfaces/IScaledBalanceToken.sol', 'bytes': 2740, 'sha256': '6dbe39f0e2e0855e1fe4d8944a068b365d19132d817e38352011ce865448fc21'}, {'path': 'aave-v3-core/contracts/protocol/libraries/configuration/ReserveConfiguration.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/protocol/libraries/configuration/ReserveConfiguration.sol', 'bytes': 23655, 'sha256': '6983afb0b2a021cbf9ebdd88d970a519d90ca3cad3aeae44a38125f293e8df6d'}, {'path': 'aave-v3-core/contracts/protocol/libraries/helpers/Errors.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/protocol/libraries/helpers/Errors.sol', 'bytes': 9910, 'sha256': 'dea1dcf0a8838e7560e03e0f32e4f53c69c98b167b8a44afcd1f0110191e6602'}, {'path': 'aave-v3-core/contracts/protocol/libraries/math/MathUtils.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/protocol/libraries/math/MathUtils.sol', 'bytes': 3357, 'sha256': '7f73c927e9801debfe0666e2a6364b92f62fd2d58d0c4b485ff04765fd4dc58d'}, {'path': 'aave-v3-core/contracts/protocol/libraries/math/WadRayMath.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/protocol/libraries/math/WadRayMath.sol', 'bytes': 4151, 'sha256': 'fae5b995ec613cc213050c99ea6352c9c18ceebba106d03b1726cfa8f1f0124e'}, {'path': 'aave-v3-core/contracts/protocol/libraries/types/DataTypes.sol', 'repository': 'aave/aave-v3-core', 'commit': '6070e82d962d9b12835c88e68210d0e63f08d035', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-core/6070e82d962d9b12835c88e68210d0e63f08d035/contracts/protocol/libraries/types/DataTypes.sol', 'bytes': 7369, 'sha256': '76d90509a0e359b071acd82729c76a406d63f23cfdcc1d60001b939c61efe4a1'}, {'path': 'aave-v3-periphery/contracts/misc/interfaces/IEACAggregatorProxy.sol', 'repository': 'aave/aave-v3-periphery', 'commit': '72fdcca18838c2f4e05ecd25bbfb44f0db5383f7', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-periphery/72fdcca18838c2f4e05ecd25bbfb44f0db5383f7/contracts/misc/interfaces/IEACAggregatorProxy.sol', 'bytes': 639, 'sha256': '8227a90f85ff6f19028eb04c2d422d15fded00d1a64a8cf2fe8f8366c956cd9e'}, {'path': 'aave-v3-periphery/contracts/rewards/interfaces/IRewardsController.sol', 'repository': 'aave/aave-v3-periphery', 'commit': '72fdcca18838c2f4e05ecd25bbfb44f0db5383f7', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-periphery/72fdcca18838c2f4e05ecd25bbfb44f0db5383f7/contracts/rewards/interfaces/IRewardsController.sol', 'bytes': 9162, 'sha256': '06419fb18c7994c386a18b1f5687374506f080e5ae6067b7a4864c2e051e8636'}, {'path': 'aave-v3-periphery/contracts/rewards/interfaces/IRewardsDistributor.sol', 'repository': 'aave/aave-v3-periphery', 'commit': '72fdcca18838c2f4e05ecd25bbfb44f0db5383f7', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-periphery/72fdcca18838c2f4e05ecd25bbfb44f0db5383f7/contracts/rewards/interfaces/IRewardsDistributor.sol', 'bytes': 7040, 'sha256': 'f3f71bf8b0ac60d30c7f5dde9861faca48de569f2d5f2adc1953b104affc2471'}, {'path': 'aave-v3-periphery/contracts/rewards/interfaces/ITransferStrategyBase.sol', 'repository': 'aave/aave-v3-periphery', 'commit': '72fdcca18838c2f4e05ecd25bbfb44f0db5383f7', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-periphery/72fdcca18838c2f4e05ecd25bbfb44f0db5383f7/contracts/rewards/interfaces/ITransferStrategyBase.sol', 'bytes': 1336, 'sha256': '0c6e9c57d31d46d68ebba9df89bf2ba20e175727ab73e0ae48578c380b0be3ef'}, {'path': 'aave-v3-periphery/contracts/rewards/libraries/RewardsDataTypes.sol', 'repository': 'aave/aave-v3-periphery', 'commit': '72fdcca18838c2f4e05ecd25bbfb44f0db5383f7', 'url': 'https://raw.githubusercontent.com/aave/aave-v3-periphery/72fdcca18838c2f4e05ecd25bbfb44f0db5383f7/contracts/rewards/libraries/RewardsDataTypes.sol', 'bytes': 1665, 'sha256': '53b99d2e41e6be6a5c0016f49be87b63a02f5976d59f2b44770a1b33b9f2d81d'}, {'path': 'solidity-utils/contracts/oz-common/Address.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/Address.sol', 'bytes': 8671, 'sha256': 'acb0cee874c1a58a26853a89711da98f6cd01482eb58ca169e5bc220541195ad'}, {'path': 'solidity-utils/contracts/oz-common/SafeCast.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/SafeCast.sol', 'bytes': 32723, 'sha256': '3bc53ea9a3caf028e0f18bdcb394d480749ab97df3850d9ff8f4bc49551d6833'}, {'path': 'solidity-utils/contracts/oz-common/SafeERC20.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/SafeERC20.sol', 'bytes': 6279, 'sha256': '91d7f91acc50db325226d9813cbd70423247a600af20abe5ca3ed8edf7cd75d7'}, {'path': 'solidity-utils/contracts/oz-common/interfaces/IERC20.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/interfaces/IERC20.sol', 'bytes': 2733, 'sha256': 'ad84b13dff25e4e8d59c65ac9e70ec0e06e9e66166bff8470007a8986d0458d1'}, {'path': 'solidity-utils/contracts/oz-common/interfaces/IERC20Metadata.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/interfaces/IERC20Metadata.sol', 'bytes': 776, 'sha256': '9d80777ce9bfb4e5ba251ad188993d2c9a4eb92995804697c125be88ac7e35c6'}, {'path': 'solidity-utils/contracts/oz-common/interfaces/IERC20Permit.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/interfaces/IERC20Permit.sol', 'bytes': 2330, 'sha256': '3a1544959e953a6da627602ca4d277e942393247a9ba5437f4411f6b0756049b'}, {'path': 'solidity-utils/contracts/oz-common/interfaces/IERC20WithPermit.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/oz-common/interfaces/IERC20WithPermit.sol', 'bytes': 198, 'sha256': '231beea1920c703132f80b9a64714c0678aaf18fcc8d4f0e20f72e5ff6395249'}, {'path': 'solidity-utils/contracts/transparent-proxy/Initializable.sol', 'repository': 'bgd-labs/solidity-utils', 'commit': '7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d', 'url': 'https://raw.githubusercontent.com/bgd-labs/solidity-utils/7a7548c1d01f011febdb1c0d47e52c7ec6c30f9d/src/contracts/transparent-proxy/Initializable.sol', 'bytes': 5864, 'sha256': '2847f38444a5b38eba59b157f5c82c890050c7b26626df93e2bd2728156268cf'}, {'path': 'static-a-token-v3/src/ECDSA.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/ECDSA.sol', 'bytes': 7277, 'sha256': '46f143dc0c95778ae80d0d19d5042c371732a06be2ab2855df30d2481543e2b2'}, {'path': 'static-a-token-v3/src/ERC20.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/ERC20.sol', 'bytes': 6502, 'sha256': '970f12632fb6f44c10c39a8e7951a4c06e875d8d07ac39fdc683e4f19e6b8b89'}, {'path': 'static-a-token-v3/src/RayMathExplicitRounding.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/RayMathExplicitRounding.sol', 'bytes': 1156, 'sha256': 'f6dc18dd1586f58866806124404f88f31ad0165fa29f93ca36c5012bb137e517'}, {'path': 'static-a-token-v3/src/StaticATokenErrors.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/StaticATokenErrors.sol', 'bytes': 559, 'sha256': '24a75246716647bbefb3443a32b6079c67737cb7dbf0af9356c48301eb7ee4f3'}, {'path': 'static-a-token-v3/src/StaticATokenLM.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/StaticATokenLM.sol', 'bytes': 24586, 'sha256': 'e9b4f0dd4812c6a5a140073009d5cc6c1486106fffe783b7018855e0b8cda22a'}, {'path': 'static-a-token-v3/src/interfaces/IAToken.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/interfaces/IAToken.sol', 'bytes': 602, 'sha256': 'b7b34e73de2313bb49baf82c04248d88c4aae1f775cbeb3e4f618d613b2ad715'}, {'path': 'static-a-token-v3/src/interfaces/IERC4626.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/interfaces/IERC4626.sol', 'bytes': 12540, 'sha256': '65d7933051edbda2f66ac1832e564d8c845856e881e11972cedb9488b6820d96'}, {'path': 'static-a-token-v3/src/interfaces/IInitializableStaticATokenLM.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/interfaces/IInitializableStaticATokenLM.sol', 'bytes': 1137, 'sha256': '2714c0ff36e3cb5d597c088489b15c8fa6b0b8ba8256a9b0da05bb58f67ee884'}, {'path': 'static-a-token-v3/src/interfaces/IStaticATokenLM.sol', 'repository': 'bgd-labs/static-a-token-v3', 'commit': '101f5d977889254ca2d2711b9582b45f832d10a0', 'url': 'https://raw.githubusercontent.com/bgd-labs/static-a-token-v3/101f5d977889254ca2d2711b9582b45f832d10a0/src/interfaces/IStaticATokenLM.sol', 'bytes': 8280, 'sha256': 'b25efdaa2d48a9010ca5ea2652bb70d599d9a3528750472564be81ec2c436dc8'}]

def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def physical(path):
    if path.is_symlink() or path.resolve() != path.absolute():
        raise RuntimeError('AAVE_MATERIAL_PHYSICAL_PATH_REQUIRED')
    return path


def fetch(url, digest, maximum):
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = response.read(maximum + 1)
    if len(raw) > maximum or sha(raw) != digest:
        raise RuntimeError('AAVE_OFFICIAL_DOWNLOAD_PIN')
    return raw


def pinned(path, digest, size=None):
    physical(path)
    if not path.is_file() or path.stat().st_size > 40_000_000:
        raise RuntimeError('AAVE_MATERIAL_REGULAR_FILE')
    raw = path.read_bytes()
    if sha(raw) != digest or (size is not None and len(raw) != size):
        raise RuntimeError('AAVE_MATERIAL_PIN')
    return raw


def verify(destination):
    base = destination / 'core-v3-1.19.3/package'
    build = None
    for row in CORE:
        pinned(base / row['path'], row['sha256'], row['bytes'])
        if build is None:
            build = json.loads(pinned(base / row['buildInfo'], row['buildInfoSHA256']))
        elif row['buildInfo'] != CORE[0]['buildInfo'] or row['buildInfoSHA256'] != CORE[0]['buildInfoSHA256']:
            raise RuntimeError('AAVE_CORE_BUILD_JOIN')
    if build['solcVersion'] != '0.8.10' or build['input']['settings']['optimizer'] != {'enabled': True, 'runs': 100000} or build['input']['settings']['evmVersion'] != 'london':
        raise RuntimeError('AAVE_CORE_COMPILER_SETTINGS')
    for name, source in build['input']['sources'].items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts or str(relative) != name:
            raise RuntimeError('AAVE_OFFICIAL_SOURCE_NAME')
        raw = source['content'].encode('utf-8')
        pinned(base / name, sha(raw), len(raw))
    for row in WRAPPER:
        pinned(destination / 'static-a-token-v3-101f5d9' / row['path'], row['sha256'], row['bytes'])
    return {'classification': 'OFFICIAL_PUBLIC_SOURCES_AND_ARTIFACTS_NOT_NATIVE_ACCEPTANCE',
            'coreVersion': '1.19.3', 'coreCompiler': '0.8.10', 'coreContracts': len(CORE),
            'coreSources': len(build['input']['sources']), 'wrapperSources': len(WRAPPER),
            'wrapperCompilation': 'NEW_PENDING', 'privateAcceptance': False}


def prepare():
    if len(sys.argv) != 1:
        raise RuntimeError('AAVE_MATERIAL_NO_OPTIONS')
    physical(ROOT)
    if DESTINATION.exists():
        return verify(physical(DESTINATION))
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    physical(DESTINATION.parent)
    staging = Path(tempfile.mkdtemp(prefix='.aave-public-material-', dir=DESTINATION.parent))
    try:
        archive = fetch(ARCHIVE_URL, ARCHIVE_SHA256, 10_000_000)
        selected = {'package/' + row['path'] for row in CORE} | {'package/' + row['buildInfo'] for row in CORE}
        seen = set()
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
            for member in tar:
                name = member.name
                if name in seen:
                    raise RuntimeError('AAVE_ARCHIVE_ALIAS')
                seen.add(name)
                if name not in selected and not name.startswith('package/contracts/'):
                    continue
                if member.isdir():
                    continue
                relative = PurePosixPath(name)
                if relative.is_absolute() or '..' in relative.parts or str(relative) != name or not member.isfile() or member.size > 40_000_000:
                    raise RuntimeError('AAVE_ARCHIVE_REGULAR_SOURCE')
                target = staging / 'core-v3-1.19.3' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o644)
        if not selected.issubset(seen):
            raise RuntimeError('AAVE_ARCHIVE_MISSING_ARTIFACT')
        for row in WRAPPER:
            target = staging / 'static-a-token-v3-101f5d9' / row['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output:
                output.write(fetch(row['url'], row['sha256'], 1_000_000))
            target.chmod(0o644)
        result = verify(staging)
        # Existing material is never replaced or reclassified on a mismatch.
        if DESTINATION.exists():
            raise RuntimeError('AAVE_MATERIAL_DESTINATION_CHANGED')
        staging.rename(DESTINATION)
        return result
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == '__main__':
    print(json.dumps(prepare(), sort_keys=True))
