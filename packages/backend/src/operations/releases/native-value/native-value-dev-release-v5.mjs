/** Fixed reviewed local composition. Data only: no artifact, runtime, proof or custody authority. */
export const NATIVE_VALUE_DEV_RELEASE_V5 = Object.freeze({
  "schema": "LIANUM_NATIVE_VALUE_RETAINED_ARTIFACT_DEV_RELEASE_V5",
  "historicalReleaseSHA256": "c1f9b420205bd8c67c77d5802c25be80461f1f58ecefcdec4278373a4fb3fad1",
  "compilationSourceClosureSHA256": "c5fdcb8b2ee13d65f1cd5e3394c96f67b66b5e09d3ec13c91981e31049e5a359",
  "retainedMetadataSHA256": "1395e94fa1e3c7d0ff6ca3d57f3ab04474a33373870a286a8c75c9f53752b690",
  "w39AdapterManifestSHA256": "8b3d3adddb9e7d0064a40744cb3b0e0e37bf2028728c3e07b5489b58acd05376",
  "publicMobilePackagesSHA256": "23f1f2a7c669a204854068190c40b602d87dd6f7902690c3c26a3839de99f254",
  "producedLedger": {
    "kind": "NEW_SOLIDITY_LEDGER_WITH_EXACT_ORIGINAL_COMPONENT_IDENTITIES",
    "compiled": {
      "path": ".local/development-native-value-ledger/v5/compiled.json",
      "sha256": "6761be693042cd02e122dad717b33a7e794514b0e98a1924cda244162e188da7"
    },
    "receipt": {
      "path": ".local/development-native-value-ledger/v5/receipt.json",
      "sha256": "2a5f7e638f22888c7b4fb64cbb9105bd71f6faf7574fd69bd3a4180a5ce2f2cc"
    },
    "historicalCompiled": {
      "path": ".local/native-value-genuine-compilation/graph-only-source-v1/ledger/compiled.json",
      "sha256": "f21b27105321ff027954ac5d0660b420c3028bf974a8f9a9e0c93db66c0a11a3"
    },
    "historicalArtifactRecovered": false,
    "settingsSHA256": "96d0fa28f9e3e67bb711ed7dc213ae1cc9c0e4646c243806b3c3167cb5698cff",
    "componentPinsSHA256": "7a3720ed20ee743018b6b5715dd21f47b559fea4ad7570097875100e351ddcf6"
  },
  "producedW39": {
    "kind": "NEW_PC15_W39_GENERATION_WITH_EXACT_PUBLIC_COMPONENT_IDENTITIES",
    "role": "withdraw",
    "files": {
      "program.json": {
        "path": ".local/development-native-value-w39/v5/program.json",
        "sha256": "c7750f11dea7df8d929496340e6f28772e45ab0790cedd2dff7d84078c3a88ab"
      },
      "key.vk": {
        "path": ".local/development-native-value-w39/v5/key.vk",
        "sha256": "92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95"
      },
      "withdraw_output.sol": {
        "path": ".local/development-native-value-w39/v5/withdraw_output.sol",
        "sha256": "1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1"
      },
      "compiled.json": {
        "path": ".local/development-native-value-w39/v5/compiled.json",
        "sha256": "5c99f5bb31d89692fcf89b0d213a5b5958f9d6ab0e7688cdfec8f6875003959b"
      },
      "generation.json": {
        "path": ".local/development-native-value-w39/v5/generation.json",
        "sha256": "2e83677aa5ac95046943812453a64a0f24f3175294e12f8305ce25e57dd0781c"
      },
      "compilation.json": {
        "path": ".local/development-native-value-w39/v5/compilation.json",
        "sha256": "3037bf283b3cbeef77671b8b165bfa97aa5e7a679972fcd614e985d3ec0025f9"
      },
      "source-pins.json": {
        "path": ".local/development-native-value-w39/v5/source-pins.json",
        "sha256": "2e2f0c00c7f119ab9c26ea27553de6057636c65b7d3e33f455837efe232e1e34"
      },
      "receipt.json": {
        "path": ".local/development-native-value-w39/v5/receipt.json",
        "sha256": "84957e132e03574f9f197f4d71300d91479dff25de8219f74dda6c22f7cb0f1d"
      }
    },
    "historicalPin": {
      "source": {
        "path": "golden/evidence/m15-notes-proof/withdraw.sol",
        "sha256": "1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1"
      },
      "compiled": {
        "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_output/compiled.json",
        "sha256": "663daedd3262ef7db4d386eac8f4a751ea41c484a8a1a89fc4f89679431b0c41"
      },
      "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
      "artifactSHA256": "2ef78563fc72936632e026653454d08a699bca9b9567b54c4f8d631396b7da1a",
      "program": {
        "path": "golden/evidence/m15-notes-proof/withdraw.circuit.json",
        "sha256": "4b2ab79c9bd9bbef7a577d5f76d56ed2ad7f67641cc4e3e3b2eccf0ab24ec617"
      },
      "key": {
        "path": "golden/evidence/m15-notes-proof/withdraw.vk",
        "sha256": "92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95"
      },
      "generation": {
        "path": "golden/evidence/m15-notes-keys.json",
        "sha256": "e849a9deeaf1a17893f94c58e3b40ee1447091a639a11e726ff3ff76f77ae13a"
      },
      "constraints": null,
      "lineage": {
        "kind": "GENUINE_ORIGINAL_W39_RECORDS_ARRAY_AND_RETAINED_COMPILER",
        "originalMode": "withdraw",
        "retainedCompilerRole": "withdraw_output",
        "artifactSource": "withdraw_output.sol",
        "publicWords": 39,
        "backendPublicWords": 47,
        "publicOffset": 5,
        "keySHA256": "92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95",
        "sourceSHA256": "1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1",
        "programSHA256": "4b2ab79c9bd9bbef7a577d5f76d56ed2ad7f67641cc4e3e3b2eccf0ab24ec617",
        "abiSHA256": "b68ae43f29bfb180086eab42bd102a0cda4ed14f25bd7fd430a40a629157201a",
        "circuitSHA256": "750c9cda832efa2f6e1c0b74bc018f3c0bcfd8d0f75ee18401a2dce23dc15cf1",
        "noirSourceSHA256": "f8284b1392cc75e7cd14f0aeaf11d94823d22f5a9c112937bf95d46cd93e6a38",
        "originalGenerationReportSHA256": "e849a9deeaf1a17893f94c58e3b40ee1447091a639a11e726ff3ff76f77ae13a",
        "originalInventorySHA256": "e2399322fc346f896f65dc431ed157034fe3e7600d47aeb684b249192d85dd0d",
        "keyHashField": "5466247639599925262433468211181303473721048473057560904411583140642862455786",
        "keyHashFieldBasis": "Exact original generated source AST and retained compiler receipt; original binary/source/circuit hashes joined to original key-generation record",
        "independentVKHashRecomputed": false,
        "newProofAcceptanceEstablished": false,
        "oldReceiptRewritten": false
      }
    },
    "historicalMissing": [
      {
        "path": "golden/evidence/m15-notes-compile.json",
        "bytes": 2201718,
        "sha256": "415aa77e2bb3d165178f2bf113882ff74902bdcad16b2bbbc14630cf9df68d31"
      },
      {
        "path": "golden/evidence/m15-notes-source-at-run/experiments/private-core-proof/native-notes/prover.mjs",
        "bytes": 3538,
        "sha256": "78cf94990aa8b5d50d3b478ea7bf5cbd805bfe70901060003aa83728bb57c9e2"
      },
      {
        "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_output/manifest.json",
        "bytes": 5162,
        "sha256": "174e6cfb68478f51926b90ac896e57804f2f5663802a3b2317bd9124134840c1"
      },
      {
        "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/result.json",
        "bytes": 86330,
        "sha256": "012e1ebd4fc9e4e5ba92abe520df85936c37182ca4a56f6d34cd0f8661c6e2d9"
      },
      {
        "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/resources.json",
        "bytes": 13907,
        "sha256": "e8ac563bfa686d30eb8da4c561ce1a47f789180155a8589fd737defe75ca6969"
      }
    ],
    "historicalArtifactRecovered": false,
    "proofAcceptanceEstablished": false
  },
  "hostSourceClosureSHA256": "ae067a8defa7014ada9fedae8ccde47be1cafa36863e6ca4aed7f3108521b166",
  "sourceFiles": [
    {
      "path": "candidate/lib/Nargo.toml",
      "sha256": "5feb5e9ca8ee040c188ef4c6f0143d2a461354284b42cf9e282e02e9f61bc53f"
    },
    {
      "path": "candidate/lib/src/encoding.nr",
      "sha256": "ccab69db06a40f96d731b7fab7b7db6dce3bd82aaa44bbfaa4247b1f3fe324d9"
    },
    {
      "path": "candidate/lib/src/framing.nr",
      "sha256": "b03bb77e3a2f1f2c878245256c4e271dc53a2976c251a153e36767f407df451b"
    },
    {
      "path": "candidate/lib/src/lib.nr",
      "sha256": "27a243d89d631c827131445496021b255416da996b8e17646a5361832ab0e0a7"
    },
    {
      "path": "candidate/lib/src/merkle.nr",
      "sha256": "9298ca3b7f299699e40ed42aa68fbff1b0891fc68aa845ef13d07c9a22b2ded6"
    },
    {
      "path": "candidate/lib/src/state.nr",
      "sha256": "46e2abcb4c2b176335c963a05eefc0a7494b09349c0b6ae988c6103f4ed47cad"
    },
    {
      "path": "candidate/lib/src/types.nr",
      "sha256": "ae1e096bbb6398df0b8765270bb6a662615ee90e49edcf0fcbd043fa65f1ff68"
    },
    {
      "path": "candidate/src/component-tooling.mjs",
      "sha256": "f2e6576097e1aca87ef57d0869fe6c07c4214ee1f7a509de9e5f0d18f97dd063"
    },
    {
      "path": "candidate/vendor/poseidon/LICENSE",
      "sha256": "4458503dd48e88c4e0b945fb252a08b93c40ec757309b8ffa7c594dfa1e35104"
    },
    {
      "path": "candidate/vendor/poseidon/Nargo.toml",
      "sha256": "551d27ec7bf58e6e40896ee424210ac0f3724b29c05068cf34fef3ea8ca1b57a"
    },
    {
      "path": "candidate/vendor/poseidon/UPSTREAM-PROVENANCE.json",
      "sha256": "bba70f26507d4c6a2c3b88779fa55763353d9778cd1235acfd6afddd1edcc7a4"
    },
    {
      "path": "candidate/vendor/poseidon/src/bench.nr",
      "sha256": "64f658d97495738f12585aa0fbba025bcf51e9bc7930da8ca94fe02d3c9b479a"
    },
    {
      "path": "candidate/vendor/poseidon/src/lib.nr",
      "sha256": "5d8b3eeccceb4ac36b66430d3678fc2e8d9e6ab5b759556244be1234882fdff9"
    },
    {
      "path": "candidate/vendor/poseidon/src/oracle_tests.nr",
      "sha256": "f5e7fb3f99cf446974836548e2cba9b34f1bf72434a4a3764dbc51fb998aa398"
    },
    {
      "path": "candidate/vendor/poseidon/src/poseidon/bn254.nr",
      "sha256": "4800b851b4b0e2c71cd6456efb021be865e4fde040c6e63797b6f157c042653a"
    },
    {
      "path": "candidate/vendor/poseidon/src/poseidon/bn254/consts.nr",
      "sha256": "0e1ce6ec6ed2ebbab52739ab07a2ab7a9cfb9b479cb012527f5e08447677dfd2"
    },
    {
      "path": "candidate/vendor/poseidon/src/poseidon/bn254/perm.nr",
      "sha256": "1daf55657af0418deb717b74cd45a1a4e9ac9d59678335cf0e677ed8a682be23"
    },
    {
      "path": "candidate/vendor/poseidon/src/poseidon/mod.nr",
      "sha256": "d0b044a17c0d7c26470137c17b7a43c172051da8ea74e56797323f3cc07a5a84"
    },
    {
      "path": "candidate/vendor/poseidon/src/poseidon2.nr",
      "sha256": "727ab4c68338938edb3d300c1f7949395beda882f6b06456bc21e8917102b507"
    },
    {
      "path": "candidate/vendor/poseidon/src/tests.nr",
      "sha256": "8364bc5d1cfdf4783728c0ed0ef1001a9423a38b06d04dddfc3275a78bf215a0"
    },
    {
      "path": "contracts/native-value-v2/FlatNativeValueRegistryV2.sol",
      "sha256": "aad08f6af2f801276e0f7af94c0b8f4b184abcc7a978335a60b604d2c524b5ca"
    },
    {
      "path": "contracts/native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol",
      "sha256": "be0f45b6bb611b02ddda4bc8a3ad4eb86b7d6e37ae431a208aa0e849705b6f85"
    },
    {
      "path": "contracts/v2/FlatPoolRegistryCodecV2.sol",
      "sha256": "1786a8458e1095af7d1245da284d1cf5adbe8a3a64dd7d57ebfd0e4e528ca6dd"
    },
    {
      "path": "contracts/v2/PrivateFlatAssetNotePoolV2.sol",
      "sha256": "14ad2dd10af26b9d34e44b8cfd5e0b15c51cfd6fd15b68096d5bf39851a8175a"
    },
    {
      "path": "contracts/v2/PrivateFlatReceiptHubV2.sol",
      "sha256": "f6a3c1ad15784552892f169f3f6b28065ec85c015422381f1e1f87fca4d73d5a"
    },
    {
      "path": "contracts/wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol",
      "sha256": "22b6ea520c3db6d24026850af5b38de8909d40f19aad1b948406ac9c26ecab50"
    },
    {
      "path": "development-config/layout.json",
      "sha256": "3168d5e1a528840e15a996beaec1f230273f265964ace63994738ae9aea7cad1"
    },
    {
      "path": "development-root/dev",
      "sha256": "6aa7ea6e19f54a48c17531c54a4339428f6c534baa5dc57fb6805207e64fb17f"
    },
    {
      "path": "development-tooling/dev",
      "sha256": "96a35f2293f41be3bfc97e18ffdb0fe5c0df95a97b8364baa5dee3b82dc5375c"
    },
    {
      "path": "development-tooling/import_paths.py",
      "sha256": "f4e84f3738af0a6e9ee71bbd78085b5b4eb2e7e991aedaea9797d82a6a6e285a"
    },
    {
      "path": "development-tooling/ledger_owned_processes.py",
      "sha256": "88bfed03dc18587fe2282479d6e36316047ae68e1fb9086f1caac6d8e3079c09"
    },
    {
      "path": "development-tooling/native_artifact_tasks.py",
      "sha256": "60565379114150918bbaca5bc2d88fbeda9a8b1a3f5317b248adce9e955f88ce"
    },
    {
      "path": "development-tooling/native_value_ledger.py",
      "sha256": "41aa8cb0bb30ff0584374234f2572c73cf3a602eeb3fe12a3dd62692c2bbbb61"
    },
    {
      "path": "development-tooling/native_value_w39.py",
      "sha256": "e7ddd4dc5e44fd1b2a3875e98a1efb4fe9efd0eadd67eaf9c065ac9f15f959a2"
    },
    {
      "path": "development-tooling/osaka_lab.py",
      "sha256": "09331b5f69724937389c7e5d2bc4c7bb8816d7e9989eff5d915ed2ff715683f1"
    },
    {
      "path": "development-tooling/paired_original_account_lab.py",
      "sha256": "b2e9987d8f253fdee3169e106d22bbaa5661176de78ce6c6d3828a12223133cf"
    },
    {
      "path": "development-tooling/workspace.py",
      "sha256": "c26467fe2cf826ca63eb6e6bebcfee4b8943dd9e66daa1b6fcc7922f35e417f1"
    },
    {
      "path": "flat/src/framing.mjs",
      "sha256": "3d44fededdd4da864cd679fab1272f70b621bd2ebe95361c6f422243f53fa46d"
    },
    {
      "path": "golden/experiments/pc5-proof-probe/circuits/recursive_join/src/bb_proof_verification.nr",
      "sha256": "258cd5979844a2627688e6efcad07637b1e90624b3af77e0dc3e6ff45a9aa84c"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-funding/witness.mjs",
      "sha256": "f131ef77367a576f1ecefeb7f65ad71aac935f5f0e37e76eb60d0db6ddfb79a9"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/Nargo.toml",
      "sha256": "74d54bdd7810f8459f3a027144ecb35e3aa0721304a291da2a6a43b4e3574980"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/src/coverage.nr",
      "sha256": "2929d06c75104d05a96610c0dd0bb5a678e5420b69d7f62e48bcd440d70d140a"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/src/framing.nr",
      "sha256": "322ffea1d810f14ededdb66fcf05f21518276a1ca39cfc44454fb16d5995c7b2"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/src/graph.nr",
      "sha256": "622571e479ee83421c2b8aea7030a40b4d17ea9596f1f0546b1e158ae5fad4ae"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/src/lib.nr",
      "sha256": "b8b3cce2f9392bba19ac0c3f3f6c2450c6c8ef533a420e00edaeabf74375d741"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/lib/src/sha256.nr",
      "sha256": "0ba89bcb8ec8d26070de96ba5302a76ee493e747c4ceb14300d70a2dfcaa992d"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-graph/witness.mjs",
      "sha256": "85d7841787e46fcf8cee6648ec95c13ff78d8b6d74f32a023363974582d4fef1"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/Nargo.toml",
      "sha256": "26dbc45b6581aa3e4e3614ddec9e3eedc4ebedbdece156c6a2f3354448aba9ca"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/capsule.nr",
      "sha256": "f1fd9641a7f817d6c441ba528ea993134690b4e1a84a21b1f87022ea14273c1b"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/capsule_framing.nr",
      "sha256": "c9d75179f733293f47214eb14cd0e0d252bdab1cfba433cb18aed97bd997bb63"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/lib.nr",
      "sha256": "9b2751f5475efbb35b555713f581557370058d8f37c63c450a12c2e9e5808c7b"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/quorum.nr",
      "sha256": "8324bcef9971cf625d786de02aadc64cbf17e9b9ea4ac018af08d7ce22b72cfa"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/receipt.nr",
      "sha256": "1f943ccea08d566e6d73dd2bd841ea2bf0f04102b8f4082cfe424531cf09f4b5"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/lib/src/state.nr",
      "sha256": "54bb703e8a0ff47addcdee0960f4c92b2ec0a98fce7f2ead5aedad75167c93f3"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-native/pin-key.mjs",
      "sha256": "502f188c348300a79965f6efff03b995f415ba0d0d595fbabcdfaf6509455832"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/abi.mjs",
      "sha256": "0f0e12a4c434bab7b826055c0d03c335254265661f78e021a9a7de73c972ff96"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/generate.mjs",
      "sha256": "d65d85f957246bc743574d3a2bf7f8a681ee6ab71a8024fd81702103fcfa9e2a"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/Nargo.toml",
      "sha256": "f7a76df65c7d543251332a0b3cddd34413ceaa7bed2ce6bb862bf0046e1cfd42"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/approved_owner_key.nr",
      "sha256": "5f6682eacffbf1e14dc683bd0b9d23d0ee8d528577080ea9721e61d48dc6ac9d"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/bb_proof_verification.nr",
      "sha256": "258cd5979844a2627688e6efcad07637b1e90624b3af77e0dc3e6ff45a9aa84c"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/framing.nr",
      "sha256": "7c326b914a48f118922d6498696552fd5b5394f454e6e4cf2ec8d02b23ab65f4"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/lib.nr",
      "sha256": "1238e07716134a6e163560775e43847df56fab8cb485d9dcb29009011e03071d"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/membership.nr",
      "sha256": "45eb6eaa031b8f092a0bfa737d5ebfd0614e264d88230ef9dca83e0ba41ec77d"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/owner.nr",
      "sha256": "74952899a40beee37e893e4a5870b98b403af8a7bc01480a897b45d35c5c9d70"
    },
    {
      "path": "golden/experiments/private-core-proof/generic-wrappers/pin-owner-key.mjs",
      "sha256": "bcdda4a3f447419300dd4f7f7d0578d145762aaccceca2deb273e2d1f8367eb6"
    },
    {
      "path": "golden/experiments/private-core-proof/wallet-notes/prover.mjs",
      "sha256": "98bb360b1c6a12495fd7ae937a3b87a405363ec2ed0cd427932cfb9ff44d9973"
    },
    {
      "path": "golden/experiments/private-core-proof/wallet-notes/resources.mjs",
      "sha256": "415d49b3da693225700281f986d7f1658a5f1e89aa73be7f7a622afeebecdc0c"
    },
    {
      "path": "golden/scripts/generic-native-owner-worker.mjs",
      "sha256": "fb4669c2d489e31dc73d0c9d4c0adf283b2ec619d45c8112f93f73dfb9e82756"
    },
    {
      "path": "golden/src/chains/bitcoin-runtime.mjs",
      "sha256": "628a683594d657f7ce903eae2f39f7613abc2adeb5337b41343e2c69bfc7c43a"
    },
    {
      "path": "golden/src/chains/linux-runtime-pins.mjs",
      "sha256": "6956aaf4e19fd1cc97acadef9e5299bbbc9c1f976cd31733ab37b2df25386de8"
    },
    {
      "path": "golden/src/chains/runtime-harness.mjs",
      "sha256": "df1d8a20108efba3992790d017e4b5b42a65a7171c299c3274792b35ce28c3ae"
    },
    {
      "path": "golden/src/chains/solana-runtime.mjs",
      "sha256": "0aca0f179705beaf908b9eb2b487aca1b370a6e952270dcf50e353b35c2a397a"
    },
    {
      "path": "golden/src/evidence/native-evidence.mjs",
      "sha256": "8d93007c6d95a2064af9e32a13cbd0000e9deda183cff13ce50a841bb522d98e"
    },
    {
      "path": "golden/src/evidence/native-hub-messages.mjs",
      "sha256": "1506475bc345d7c66a707c7861976910832d873a7796b08a7abbca23250c44b2"
    },
    {
      "path": "golden/src/evidence/native-quorum-observer.mjs",
      "sha256": "831fab0e49b16dd179e385df91248bfe074eaa139806b4fddd450c6309d86a25"
    },
    {
      "path": "golden/src/evidence/native-quorum.mjs",
      "sha256": "d8fcb494326e7ad9befd975a8252651fc60a75b4dd6b2ad10c14bc78c7f71915"
    },
    {
      "path": "golden/src/native-bitcoin.mjs",
      "sha256": "01a2b3e1da168a9b04ba73a804aa72ab65085aff5b7e0582e6f18278487bc9ef"
    },
    {
      "path": "golden/src/paeg/funded-graph.mjs",
      "sha256": "cddef6ce59655e49e49ebd6f822f48811e328ddbabca38b031fed7f96473293d"
    },
    {
      "path": "golden/src/paeg/generic-account-child.mjs",
      "sha256": "0d1a18b46ec50cf8fa6746311c29ce91dd766175a3fe65feaa260a6cdd8b87ab"
    },
    {
      "path": "golden/src/paeg/generic-account-coordinator.mjs",
      "sha256": "8157f449a73573c59b60b97132dbc45fcde5e7df6cad9f52297befb6e8e600a9"
    },
    {
      "path": "golden/src/paeg/generic-account-journal.mjs",
      "sha256": "c1cd6952312134b63a9b1504215802e9be3a308d557d909d7e61db8317ea0fbc"
    },
    {
      "path": "golden/src/paeg/generic-account-keeper.mjs",
      "sha256": "632e9912dd8a68ae6eebcd68cf4c82f50dcd3f36680f914eae9f74145017da92"
    },
    {
      "path": "golden/src/paeg/generic-account-process.mjs",
      "sha256": "ef5c058d2e27b6751d7812140e2419ca6d715da53edea79d664055e4bdcb3e2d"
    },
    {
      "path": "golden/src/paeg/generic-balance-custody.mjs",
      "sha256": "f4f06a4aab559799ab9ad3b341f3ae483ce949d3a51f8c76893b0552ff33b661"
    },
    {
      "path": "golden/src/paeg/generic-balance-native-preparation.mjs",
      "sha256": "b4b94b477a99a3f39de814f5d41def2d786cfd57354c76651dda920828897962"
    },
    {
      "path": "golden/src/paeg/generic-balance-observer.mjs",
      "sha256": "028c3851d3993281b85d958663d576f49aeac5b28d51bd6e0053e9b67246b4ae"
    },
    {
      "path": "golden/src/paeg/generic-balance-owner-child.mjs",
      "sha256": "9451759d4ed80edf8953d7ec565363316a13398ad410355484da56d2c08715f3"
    },
    {
      "path": "golden/src/paeg/generic-balance-owner-protocol.mjs",
      "sha256": "a148d8cc8d8c4c028a6e4ae3ed8bc36161761d8845d3624a87716592fac17e01"
    },
    {
      "path": "golden/src/paeg/graph.mjs",
      "sha256": "06c512a41c12621e4ed56691d697ed18d02aa39ec86d2cf291dd7ee6e63c5e99"
    },
    {
      "path": "golden/src/paeg/local-deployment.mjs",
      "sha256": "849eb503f5212c22ffb1a3a3eeb5b716eabc517990e533e16e70a59e69067bc2"
    },
    {
      "path": "golden/src/paeg/local-evm.mjs",
      "sha256": "bdbe143d11b8193ccc37bfb4a4986bcc3fd994a4cadd5867e1dbb7b4f454f724"
    },
    {
      "path": "golden/src/paeg/local-ledger.mjs",
      "sha256": "8627911e1a7c5cc7f7dafa929d3a88e459611878f55caff2802f68fd4f682961"
    },
    {
      "path": "golden/src/paeg/native-admission.mjs",
      "sha256": "07d14fbe6b2adb3cf398846b2c3773c27164bd14a97e6a8406593f52f005053d"
    },
    {
      "path": "golden/src/paeg/native-capsules.mjs",
      "sha256": "495c680227076307d9f9f8f8afe3e129b97dcc71a89f6700e7dd92db7482cd0d"
    },
    {
      "path": "golden/src/paeg/native-deployment.mjs",
      "sha256": "b2dc29c4cc6a8b7b2259652456ebe53d2e0b73741aab6b46a74b1c833d55ca7f"
    },
    {
      "path": "golden/src/paeg/native-owner.mjs",
      "sha256": "90d4aa29528e4eacff5e1af4b0acbdb85b4571ded914e00784f4ac1f6181216f"
    },
    {
      "path": "golden/src/paeg/native-proof-pins.mjs",
      "sha256": "a735a21d7530a490876af74b76954a80bce6df93c096c02ee40ad6db1b12d630"
    },
    {
      "path": "golden/src/paeg/native-receipt.mjs",
      "sha256": "9ff5ea7b3bce52a28e7ad0095fc078d27f2948549992782803a2ca1d984ea1cc"
    },
    {
      "path": "golden/src/paeg/native-recipient-custody.mjs",
      "sha256": "0abae0c18fe82634513773f1b01bd3ffaba47e2bf8792967a6e158298680dc50"
    },
    {
      "path": "golden/src/paeg/native-recipient-process.mjs",
      "sha256": "0a10d2c569b5c7570da3237daee68100c6c5b2c43ad9cdfdcccadd1d4b79581d"
    },
    {
      "path": "golden/src/paeg/native-state.mjs",
      "sha256": "0432453c7aafb8e4612e231f2aed1f9415aa6473c9d165edd72e51ad0f86fd33"
    },
    {
      "path": "golden/src/paeg/native-system-state.mjs",
      "sha256": "f6f65ba78aa7ac7004c968bbde1985f834460b04b549f1c2d9b494e484f8ac8f"
    },
    {
      "path": "golden/src/paeg/proof-process.mjs",
      "sha256": "a3168c0d431c2f926fd39c79484aa9b23a084f0cf283d314eeee59157149ca2d"
    },
    {
      "path": "golden/src/paeg/proof-resource-policy.mjs",
      "sha256": "b4b69565488debb5bb819866b62e0a5f5a536792c83b19c3231f592a7a160680"
    },
    {
      "path": "golden/src/paeg/proof-worker.mjs",
      "sha256": "677f7b8957ae7e2269bff32fdb4621598fb443c0aa56dd4ebcea7cbd3b340ee6"
    },
    {
      "path": "golden/src/privacy.mjs",
      "sha256": "9c971fbd40b69b4e6a56ec56c309c57b4d9ef4117fc22a8b25696befab1b8edd"
    },
    {
      "path": "golden/src/private-account-state.mjs",
      "sha256": "d32e2273475b979042424bb74a912c761eabffefe3e96c76cdfbab638c7bb606"
    },
    {
      "path": "golden/src/private-assembly-history.mjs",
      "sha256": "45f15a77524dd1d7d8ac402fbf632ecc7a99856885d488f223ea71bdbb4e82c8"
    },
    {
      "path": "golden/src/private-assembly-revocations.mjs",
      "sha256": "23582051db05fa1d7c9d5e050a94ebd7aa795b9e9cddcbc5092cbacf76665683"
    },
    {
      "path": "golden/src/private-asset-runtime.mjs",
      "sha256": "130ab4a4cc953b0f4c0f90bec32d9bd65a957ecbd2cacc4e1fafcd1a35315f5d"
    },
    {
      "path": "golden/src/private-cohort-public-native.mjs",
      "sha256": "1e741cf5f4b8921388127fe624ecfd873f07114802b9bc813a0614f97c92bb14"
    },
    {
      "path": "golden/src/private-native-certificate.mjs",
      "sha256": "c2928050ed83eabd6a5de60e46611c14ce95514e3e0b62ef79f2b14f68151396"
    },
    {
      "path": "golden/src/private-note-encoding.mjs",
      "sha256": "6be2071779422589d73d898b29de5dda8f712fda6414f6c9932f0d24a40293f8"
    },
    {
      "path": "golden/src/private-note-tree.mjs",
      "sha256": "e2ac35aa1d1f2a805feb55717fa3bd18308867f9d14940754fb52877f063eb57"
    },
    {
      "path": "golden/src/private-resource-policy.mjs",
      "sha256": "cfa5d5c298d968c0027e4bba1398a6746ab151aad24debaa1429a9232e35927c"
    },
    {
      "path": "golden/src/private-verifier-crs.mjs",
      "sha256": "ace66e3bcec0dfa278b1527f8338b16bf64d655d707b61dc42668947b3a740a0"
    },
    {
      "path": "golden/src/private-wallet-asset-binding.mjs",
      "sha256": "a32154537a20b747671e9575ce0dfdbb9d68ab42364e779669ecd1250a466317"
    },
    {
      "path": "golden/src/private-wallet-note-encoding.mjs",
      "sha256": "1353c7e58c594fc4ec0a8f6721b6b5b14683c9caad60dba6d6277fa3e7c0ef4e"
    },
    {
      "path": "golden/src/vault.mjs",
      "sha256": "d288d08ec58ade40aa352bd4579df1a6d3c2ac6395c29d08c0b46b5d6db5da8e"
    },
    {
      "path": "integration/aave-compilation-policy-v1.mjs",
      "sha256": "96d3d17954f2577f11472c9487af034a6e39ea93d218ac4be16ac80546a47f87"
    },
    {
      "path": "integration/aave-compilation-source-pins-v1.mjs",
      "sha256": "d1f404e320240bf8c4f1f447c5ab2faa53cdde3622f20c78f3bd97d53a60dfe4"
    },
    {
      "path": "integration/aave-private-graph-policy-v1.mjs",
      "sha256": "ae6045b18e256cfd27bbb0629caae4d7c92d8a85d3d54f241190d8179e61a5ad"
    },
    {
      "path": "integration/aave-private-graph-source-pins-v1.mjs",
      "sha256": "9217c06e962fe8b6618cef142abfb2ea8e0289dfea7b7ad069c029f10a03710e"
    },
    {
      "path": "integration/claims/development/development-btc-sol-graph-policy.mjs",
      "sha256": "0d64caaea5be09541bb771142ac67a1294d5420b671179c6a60310aff4027877"
    },
    {
      "path": "integration/claims/development/development-btc-sol-graph-source-pins.mjs",
      "sha256": "47f1f94a8165581e14a8cb384a6d9c7aa3584703d93e43c6fbd2d86c7803f03e"
    },
    {
      "path": "integration/claims/development/development-native-claim-policy.mjs",
      "sha256": "07b95fefd95773ddd3696fd03b43fa06e6f2af2b17bc5628b2731e10871db70f"
    },
    {
      "path": "integration/claims/development/development-native-claim-source-pins.mjs",
      "sha256": "32c75998fa2e7be8568ba145996bc86bc2187e05adae1ef693c6f598defe7905"
    },
    {
      "path": "integration/claims/metrics/native-claim-empty-audit-policy-v1.mjs",
      "sha256": "0fd4d8ff10ba0b2b7c4c3020c054119689ecd22b025792821ad086b4e34b984c"
    },
    {
      "path": "integration/claims/metrics/native-claim-empty-audit-source-pins-v1.mjs",
      "sha256": "b3ccac940be642c04313f5c0b6471b400c19aedc704352fb70ceb297cf400d97"
    },
    {
      "path": "integration/defi/entry/development-defi-entry-policy.mjs",
      "sha256": "43113f41e09c7fb95dbe2bf82a8c2b0ea629f2b03743a90f438f623d5a8c2ce0"
    },
    {
      "path": "integration/defi/entry/development-defi-entry-source-pins.mjs",
      "sha256": "fd23b9b0f1406c2286a4452b70b7f59f00938c97d10e682bbaad20e7e3d66a85"
    },
    {
      "path": "integration/defi/private-metamorpho-flow-policy.mjs",
      "sha256": "55a541d69b7b1b1b6e6b7776bd7daeb8a297253588ae5ef528ad57acb5b488ea"
    },
    {
      "path": "integration/defi/private-metamorpho-proof-evidence.mjs",
      "sha256": "6efc783b686f58da1f9356ee55a6f76ccef2cff61a750e6c2bf67a3d0635b02e"
    },
    {
      "path": "integration/defi/private-metamorpho-source-pins.mjs",
      "sha256": "93c3bffecf0394cbc6d39f6b440c503958c068b7d9137b6178d3e63e950b97f4"
    },
    {
      "path": "integration/device-owner-deposit-original-step-v1.mjs",
      "sha256": "f6db60bc924ab27df9c5ae1403f9ad39032216907ed537c33bb58cef5dc31b7e"
    },
    {
      "path": "integration/device-owner-deposit-policy-v1.mjs",
      "sha256": "39833227aa9c60ca5639200e7ef45d1d5e1cab246598fe99f2366bcd761c07b1"
    },
    {
      "path": "integration/device-owner-deposit-source-pins-v1.mjs",
      "sha256": "8a0e8bee520256c9d8add74664e5dd30217791cd0ecb2049aa5abf3a344f7202"
    },
    {
      "path": "integration/evm-vault-flow.mjs",
      "sha256": "99f2e4870701bb87c92f8932394be85ea05ef1b0a221eb3d9197787b6c1610a7"
    },
    {
      "path": "integration/evm-vault-terminal-checks.mjs",
      "sha256": "1c83bdc0c7bce590d62bb1fb1fe2da84fddcbd2e7ecfa78e7694f0431065c88c"
    },
    {
      "path": "integration/evm-vault-wallet-app-driver.mjs",
      "sha256": "330fdece61abff177a157d2e057fb30b4d7182b57d09b82772b3b6ab3948b414"
    },
    {
      "path": "integration/evm/osaka/development-osaka-smoke-policy.mjs",
      "sha256": "b02ea3a28513b34fafdf463c8e8f411027b15202fb9f0e5f7ea67d2986da3178"
    },
    {
      "path": "integration/evm/osaka/development-osaka-smoke-source-pins.mjs",
      "sha256": "1c68f7f2d2e8c01d8a60f23fc7067f5b60229423938bfa19345543a9ea8afd58"
    },
    {
      "path": "integration/jupiter-orca-public-swap-policy-v1.mjs",
      "sha256": "20bd6ec74822d546088fb08f788c26e6374e148fcc7ef12b0c3766865a67261b"
    },
    {
      "path": "integration/jupiter-orca-public-swap-source-pins-v1.mjs",
      "sha256": "1da3792f2d2ede14ac53bc1a443ae16509092562e61b26c42d1e7408d14793ac"
    },
    {
      "path": "integration/manual-wallet-acceptance-policy.mjs",
      "sha256": "f2f110c52d35f336fd6ee62668a5a9dfdc92477c308caf9d396638a4bac057a1"
    },
    {
      "path": "integration/manual-wallet-app-driver.mjs",
      "sha256": "fb62515fd57e661cf034ea5853feeea562471dfbd8f879e99c81652256a071ba"
    },
    {
      "path": "integration/manual-wallet-browser-policy.mjs",
      "sha256": "59d22e9175f13f0fb1a41472de23fe2bdfb7b3a5890710d1cfbf9f4ef4b07fe5"
    },
    {
      "path": "integration/manual-wallet-browser-recovery-policy.mjs",
      "sha256": "cc68d01d5a6b7f42ed444f615a9c0e5b713271dda60cb57c75bf02cfd819aa33"
    },
    {
      "path": "integration/manual-wallet-browser-recovery-source-pins.mjs",
      "sha256": "98f758ff8a5b46191ba699799e078645ee3a684627090d6e8fb7676a38bc2219"
    },
    {
      "path": "integration/manual-wallet-browser-source-pins.mjs",
      "sha256": "c56f99fc8dcc8ceeb0489ab526a767edaa169172a2fb696d1946e7e5d5d3b914"
    },
    {
      "path": "integration/manual-wallet-recovery-policy.mjs",
      "sha256": "b1a031a61ab6964e5d9438603730f71f35dc915940e7cfaadd83488495e4cb81"
    },
    {
      "path": "integration/manual-wallet-source-pins.mjs",
      "sha256": "77cf4da8fb487b61def3702d493e9c5df618d613e0cfa87516fcd63cfd3d834e"
    },
    {
      "path": "integration/native-claim-begin-payout-audit-policy-v1.mjs",
      "sha256": "d34c11c31febdfed60b6ec4ff5841f2a8718806796a3b19d09324cae55673f26"
    },
    {
      "path": "integration/native-claim-begin-payout-audit-terminal-v1.mjs",
      "sha256": "8be7e8b101007d9e6ca09afde846d6d618002e2af195047f73dd2ed573d9057b"
    },
    {
      "path": "integration/native-claim-flow.mjs",
      "sha256": "8cd6d85651d3ece90b3ff7f22e0c3c2a2d10b194ee819d24556c7e664070f42f"
    },
    {
      "path": "integration/native-claim-graph-artifacts.mjs",
      "sha256": "b3fa5099680deb8e6a39c69bf1aed423b8d3d5e639ad1ee08272e589665fdeba"
    },
    {
      "path": "integration/native-claim-graph-case.mjs",
      "sha256": "6dfece3af8c2538f846ce2e6ea183d0c72efd59048ee80d2b03195a06e404617"
    },
    {
      "path": "integration/native-claim-graph-preflight.mjs",
      "sha256": "5334ad05ffd3c91949e98f807973f866dd0a0b7282950c1afd09cf12fe8da3bb"
    },
    {
      "path": "integration/native-claim-graph-terminal-checks.mjs",
      "sha256": "732f14aab24b070e28699a3ee506648df93c12e38215a7a561251501566e22c2"
    },
    {
      "path": "integration/native-claim-graph-v3-nonce-checks.mjs",
      "sha256": "9fd3aa0aec21ded90c730b855a79ee1741adc49ffd60976e58250dcff737f2fd"
    },
    {
      "path": "integration/native-claim-graph-v3-policy.mjs",
      "sha256": "57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe"
    },
    {
      "path": "integration/native-claim-loaded-facts-probe.mjs",
      "sha256": "22f6cf13aba6306c62a06dee1eca7723eda572031d3f0309435028c612de4399"
    },
    {
      "path": "integration/native-claim-loaded-v3-nonce-checks.mjs",
      "sha256": "4c3f3b2080a08bb621316f56f3d196bbeadeb6b9c7e526fc20766cf2d86f9686"
    },
    {
      "path": "integration/native-claim-loaded-v3-policy.mjs",
      "sha256": "54d02adadccc9f8aba8e092af62e077f0efbee3b48b6ca90dc211e669d6499a4"
    },
    {
      "path": "integration/native-claim-loaded-v3-probe.mjs",
      "sha256": "4ea0f253edc298db419fc0c3eeaff50aa3d5cd29f85509d713848f59fc9af705"
    },
    {
      "path": "integration/native-claim-run-route.mjs",
      "sha256": "baf483fabc6b5d2ef0f451b0a993cf9bd19c9b137373e54500d9a5ac56177040"
    },
    {
      "path": "integration/native-claim-source-pins.mjs",
      "sha256": "8f105a3aacce419368a429b66b5771855bf0f5d50d479f43011cb50eaf957411"
    },
    {
      "path": "integration/native-claim-unfunded-health-policy.mjs",
      "sha256": "519878ed9c70b8540fa7c2a1807c4fc00a7d27f756b309fe8f0687271974f098"
    },
    {
      "path": "integration/native-flow-owned-files-v1.mjs",
      "sha256": "052159dd8d12740d119379a509cfc9df6a07d1c4043674b0e79cedbfff96ce65"
    },
    {
      "path": "integration/native-flow-supervisor.mjs",
      "sha256": "0c74436d8e3b343e7035452b8cfa5f9438341ce69e7a48be8b2184484df06aad"
    },
    {
      "path": "integration/native-ingress-v3-preflight-policy.mjs",
      "sha256": "6a62f6e72c5159498c5a6ea3a98ab782da42b33833ff45797972d00e49fa959e"
    },
    {
      "path": "integration/native-ingress-v3-preflight.mjs",
      "sha256": "3c3f358dea74e628e7566dc786ef179c6333cd7a3905f54484f8c22db83e889e"
    },
    {
      "path": "integration/native-note-wallet-acceptance-v1.mjs",
      "sha256": "8ab66ee3405200d9c6f266e7f9bb96a41d21a50bee006557b7fc653cce38dfe3"
    },
    {
      "path": "integration/native-wallet-real-acceptance-v1.mjs",
      "sha256": "c32a447e7c3d1025ff967c31c874a66cea1c29924408a235d0b28eaca1e0083b"
    },
    {
      "path": "integration/native-wallet-real-driver-v1.mjs",
      "sha256": "3566f27a48022c6f8c4de38c08190f461b5a2ed7dd3e862004cc307950780172"
    },
    {
      "path": "integration/native-wallet-real-evidence-v1.mjs",
      "sha256": "04d6583822232c381609a486beed82d6199927913c039ac0d4487820aab2fd8a"
    },
    {
      "path": "integration/native-wallet-real-policy-v1.mjs",
      "sha256": "ea9cacfd4830e02753a35f1c2210de74f30a323f731f43c5b3f77d13181c0a3d"
    },
    {
      "path": "integration/native-wallet-real-preflight-v1.mjs",
      "sha256": "90f499753e2495289512c5935737263513f687e64fe181288d9db97273100b69"
    },
    {
      "path": "integration/native-wallet-real-release-v4.mjs",
      "sha256": "694fab65e22fb6788e5321ec20e58514e91826bdeaf82bbbee024d2890255c2e"
    },
    {
      "path": "integration/native-wallet-real-source-pins-v1.mjs",
      "sha256": "8db7a71a727dba5fc87acf1a0186e35133ced038c4dc4294f1707f644391a24b"
    },
    {
      "path": "integration/native-wallet-tron-dev-policy-v5.mjs",
      "sha256": "d5b2dfbef1cceb6035e50b5804c93f92f551158d93738bc03e0ec838d0ac4044"
    },
    {
      "path": "integration/native-wallet-tron-dev-source-pins-v5.mjs",
      "sha256": "a785c2d355ea3fa0c8362700f10ce4db18176f79c0b8e7278fe5e7b4c6fe281e"
    },
    {
      "path": "integration/native-wallet-tron-dev-v5.mjs",
      "sha256": "aa9986bf7c7ea1cfd28deb1fca2b89109d882e657dcbdf230bf9367090e72b77"
    },
    {
      "path": "integration/owned-evm-vault-fixture.mjs",
      "sha256": "b788cac0a2b4f72c88a67e7900f1bf377fb5dcd051cc4b117f92b9212d10a28a"
    },
    {
      "path": "integration/owned-flat-fixture.mjs",
      "sha256": "9e5db875be1eeef2ff6c5ceb50384570a43daa4857bc36d3dacd35f70b0ff342"
    },
    {
      "path": "integration/owned-native-claim-fixture.mjs",
      "sha256": "7743c1b252998b1888aa5e4adb393a012abb46cb78e05d8c0930c210a6b474ad"
    },
    {
      "path": "integration/paired-native-note-flow-v2.mjs",
      "sha256": "c6732cb97bbb5f2232be53c16f64c7f4cee3ce2cbb2f0437bb9d1d68f36ea7fa"
    },
    {
      "path": "integration/paired-native-note-policy-v2.mjs",
      "sha256": "010a54fb3602164cfdcd9009128201c81e7392d929911971d3642ae990ceb3e0"
    },
    {
      "path": "integration/paired-native-note-source-pins-v2.mjs",
      "sha256": "13ee681738f9c6e47525a6bdd1b79c2555537bdcd12161aeff32c6703aac9509"
    },
    {
      "path": "integration/pool-generation-acceptance-policy.mjs",
      "sha256": "9826c1f991cccbe58eda59a844daf4a1d8932c3bba268d0b104d7e4b675f3197"
    },
    {
      "path": "integration/pool-generation-acceptance.mjs",
      "sha256": "3632ad815a0b2222c9ada3d6b89c10bf8f74c07a24226886fc4fe5c0333c4431"
    },
    {
      "path": "integration/pool-generation-checks.mjs",
      "sha256": "e30bf9d0a2132c0fd333d76675783cd12760f469826d5c669e00c34747d6190f"
    },
    {
      "path": "integration/pool-generation-fixture.mjs",
      "sha256": "f8de8568874e92b294864f8079f9ae2e75c3f743456474779f368d95382e442b"
    },
    {
      "path": "integration/pool-generation-phase1.mjs",
      "sha256": "fb57e35f6ced3eeb13c0ae01b220668c17416448075a8b264ff1cd4a76e9ca18"
    },
    {
      "path": "integration/pool-generation-phase2.mjs",
      "sha256": "ff21029fd3bcc065ae5cee8bdf93bb3121c4f6c3c144c70d037df9ac1ca3083f"
    },
    {
      "path": "integration/pool-generation-source-pins.mjs",
      "sha256": "c46d694b52f4c78bd6416dbf47f90c3957b27fab884f9974af49330648a9d5ee"
    },
    {
      "path": "integration/prepare-native-claim-graph.mjs",
      "sha256": "635816d9517d1b5de8b29bbfd064abd1104233db036b98a051c91126fcb19893"
    },
    {
      "path": "integration/run-evm-vault-flow.mjs",
      "sha256": "8f443abd68fbb4abaa31b2572a834b48368c479e2e06df47792bd41d738d70f3"
    },
    {
      "path": "integration/run-native-claim-begin-payout-audit-v1.mjs",
      "sha256": "8a0efb7e8f53a04fb773b9cb9ec253c47cd9f14bf5866939fb0dc90ee9711f3f"
    },
    {
      "path": "integration/run-native-wallet-real-acceptance-v1.mjs",
      "sha256": "99ac89118bd9a7d38feae066faef7d0a2cf2b8e2f087728973afcc1dbcca86ba"
    },
    {
      "path": "integration/run-native-wallet-real-preflight-v1.mjs",
      "sha256": "8a013104b20345781557ba38eb2053cb5334b3bd3a299a681195b548d0ef0a01"
    },
    {
      "path": "integration/run-native-wallet-tron-dev-v5.mjs",
      "sha256": "9592fcbf896cc2a480e8078e472cbbd58e1d987fcbe5713e7fb667dd7dbf6b70"
    },
    {
      "path": "integration/run-paired-native-note-v2.mjs",
      "sha256": "918a1f5acff59f2ebaeedb62113c2cbb42796e177e9ce814b97eac76cf5421ea"
    },
    {
      "path": "integration/run-pool-generation-phase1.mjs",
      "sha256": "f06ddd539d2b4c0c20815c9676a0b795d15fe4d6b6156b6e6189ff1cbe87bbd6"
    },
    {
      "path": "integration/run-pool-generation-phase2.mjs",
      "sha256": "fab80c816e0a3536322dd12ee22e3ade4a1693d4bf5029d6c844b3b40f45c456"
    },
    {
      "path": "integration/run-wrapped-deployment-only-v1.mjs",
      "sha256": "9603fbdc8ca56a846b32ec07c9dfc17d8f45a04139750fa58b0f5bfe814ed4e6"
    },
    {
      "path": "integration/run-wrapped-wallet-fixed-acceptance-v1.mjs",
      "sha256": "b1d9cc2e875ea8d08e6ccff73ac4f5e67cd3c37d1d49d06d3ceb0036ca07b766"
    },
    {
      "path": "integration/run-wrapped-wallet-fixed-preflight-v1.mjs",
      "sha256": "5feec5c04a27207ff3ef5a21091bb737816c3fd8976f2fc9135a28a01078b607"
    },
    {
      "path": "integration/source-pins.mjs",
      "sha256": "8fb9b1778058f62648c144139d8b6d1368a0d07f2f88cde12415153f846cd319"
    },
    {
      "path": "integration/task-catalog.mjs",
      "sha256": "43f0404c81fbe6961c24255a73509caec99014026cd2eb23795abd2b5b8298f7"
    },
    {
      "path": "integration/wallet-browser-runtime-pins.mjs",
      "sha256": "990792889882a43cc8651a36aee86d82fefb183e4ed378f00ea5dad3aacd359f"
    },
    {
      "path": "integration/wrapped-deployment-only-v1.mjs",
      "sha256": "643b379d917f9045ced10601f8bdde163bff1d75cf4df4fcce71fe4d45296bc4"
    },
    {
      "path": "integration/wrapped-installation-source-inspector-v2.mjs",
      "sha256": "79771439a5d0470a654824fb779bfff12a3875501d8018b0c29da612089695a7"
    },
    {
      "path": "integration/wrapped-wallet-acceptance-v1.mjs",
      "sha256": "003c7d54334821ee1139604af6764025c7215ffab26db27d2b1815c03884022c"
    },
    {
      "path": "integration/wrapped-wallet-cold-cycle-v1.mjs",
      "sha256": "c0a0e90fd681742fec079a7feb5d0b06d2857a2fff6a66bf87e28c772994f4b8"
    },
    {
      "path": "integration/wrapped-wallet-fixed-acceptance-v1.mjs",
      "sha256": "718779c43d3db6d20b51b2506321e119b411b241a2b5e44d28ca1f010c98ef96"
    },
    {
      "path": "integration/wrapped-wallet-fixed-driver-v1.mjs",
      "sha256": "fe74c6129a7244f1a940931bd98d9cd68ac2fbcde179dbb142bf627bee7e1a5e"
    },
    {
      "path": "integration/wrapped-wallet-fixed-fixture-v1.mjs",
      "sha256": "c5afe38062853610c76fbea138d941c9426203a41cbcc3af6b822916e5f3ef16"
    },
    {
      "path": "integration/wrapped-wallet-fixed-policy-v1.mjs",
      "sha256": "0f3902b9b64e27dc210d5bebb54300ead863332aaf4de3e552125e943fae3cdf"
    },
    {
      "path": "integration/wrapped-wallet-fixed-preflight-v1.mjs",
      "sha256": "469f1d22ac55de52b87507c06c4886ae7e6e045e487cbc0d53d3580ab8748918"
    },
    {
      "path": "integration/wrapped-wallet-fixed-source-pins-v1.mjs",
      "sha256": "53fc5b0a3cb8b25e6db254ee865357877a469c227f7b278e8972e70c1223b12e"
    },
    {
      "path": "integration/wrapped-wallet-fixed-steps-v1.mjs",
      "sha256": "10aba275ff6634b6d6a4d32117a087544654eef8fa9c88df1572510a6a929253"
    },
    {
      "path": "integration/wrapped-wallet-fixed-terminal-v1.mjs",
      "sha256": "5f34e1be1dd0638b5707798006810aaf68a375b35cd073242605f388a25bddbc"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/LICENSE",
      "sha256": "4f221aee6e072336700c408c68ab3b96a3fc09f6aebe6f48f1bd99e5ef13faec"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/bls.js",
      "sha256": "9bc37d55fbf294ef99d944950eb58ab5b0330e27aa9dacf73f557a7b88e8930f"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/curve.js",
      "sha256": "dbaeee3b41ff47efb76b78e14170fe4dda7c7ecdc387c402f16c5118e0bac356"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/der.js",
      "sha256": "7f80d698611b131368ecf732b8740bb97f72cd42fef77c4b0bb923e2e2d44159"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/edwards.js",
      "sha256": "f24a9c221a549a8fff259eb8f245ab0dc17679b13c532c3970d91acc4df9fffd"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/fft.js",
      "sha256": "a4b2ff7ca33f4acc85d61f0e83ec3303c3f6b38ecc19b20d0f6462d820e518cf"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/frost.js",
      "sha256": "9a95f1fdf7e17b9d93a16049db675ee2967ed2a04cf59b1bd981d4662acbedf5"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/hash-to-curve.js",
      "sha256": "e3c97e7d0827b728b14e3311ed11d8e386d8a70d8fc77e0b9fd2a3090f19d955"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/modular.js",
      "sha256": "9ced3aa10598277a735e54f7b61d88e929d565da884ba5385f9006ebb3b6aab2"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/montgomery.js",
      "sha256": "cdafa8816dad5a24475ec51952c5f71fdd5d1b46880ab982694c4f8ff605fc46"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/oprf.js",
      "sha256": "2ca36b3e4930092db1f91559410e86975816c036e248067bc65a8055aa1c504c"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/poseidon.js",
      "sha256": "ef05eaf0372d4441abfdcacd31b9a7bea801656b55819cdf0ff0995aa0c885fb"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/tower.js",
      "sha256": "6e9f7273af53c06f8124c33b89d0d70d7d46e95effbf46d242e580e9c5aa8137"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/abstract/weierstrass.js",
      "sha256": "d007e949c0d5b912e8c54132983219c8ff8f69bda058a70563b5cc7a8783331c"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/bls12-381.js",
      "sha256": "eab0e80c31087656d0a0c2024906418e59ab6e2f02c9e5395406602c25351276"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/bn254.js",
      "sha256": "d49bd6594b30d11c949eff8a3de54a46e2ca3ae93c964b576c6c0b51c80a6785"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/ed25519.js",
      "sha256": "e13f6c50c36feb0d18bf7986d5f881bcefb5f1f5b16de3cc5ee7693254c7a0b5"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/ed448.js",
      "sha256": "a56f9673b2b207bdc196654c2116bfae6c9782464d3d53274a015e0e0a7ed75c"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/index.js",
      "sha256": "522bba9559e747647426316ac2b9df593243c4d54cd6852c54206f4124a8f7b9"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/misc.js",
      "sha256": "2db54e6ade644c4c1371903b7c88e2b77093fd3b1012d42b0a18258d1c09096d"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/nist.js",
      "sha256": "0a692b98e22c56c0354f78eb1759cfbf6aec89eafc78cd2984a4f2e8428081e6"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/package.json",
      "sha256": "63d976a6ee72f2dcdc81e6c8bf907edff54eb20e8423218578fbfaf29cff96e6"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/secp256k1.js",
      "sha256": "b4e7383e0de5064cd200d22f21890bc8730ddaf987b1e989e5e24bbfaae5cf1f"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/utils.js",
      "sha256": "be9ff86aef76419376e4d66cf01a134f3117f1f8dd62d81f1b79100145503367"
    },
    {
      "path": "mobile-app/node_modules/@noble/curves/webcrypto.js",
      "sha256": "715197e17767f7f448eb4131151205e18ee0a261d76340cf4863805e15737f0e"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/LICENSE",
      "sha256": "4f221aee6e072336700c408c68ab3b96a3fc09f6aebe6f48f1bd99e5ef13faec"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/_blake.js",
      "sha256": "cabbff61d1f373bac45594ad758df7c42e176464ddbb94b44f5533fa977a4f56"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/_md.js",
      "sha256": "60cf3010fda89e3e4d3f0e7ff1ce249e9c467f34b4fd41b6fd6101d9f69be763"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/_u64.js",
      "sha256": "b09da8c07fe8187c07649494cdb7cd0bcf13df90b506a9473d19e4d5f8c2e102"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/argon2.js",
      "sha256": "f39753324bdf2f484150731d24b1d71236f26bf10bedd594f7d190fcdfdefdc9"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/blake1.js",
      "sha256": "da1d08b4d0702ad4f185a796df8fce3fec2855de53b02190eba3bd8555677b5c"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/blake2.js",
      "sha256": "03f00237bcc0b4d822a80f7c0ac22e42632c48e246c3b6da584e6452186e32f0"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/blake3.js",
      "sha256": "bc25a8f6c50acabf3781c44ec55cb364b00f6f3f4349d841813a1057a8af2f20"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/eskdf.js",
      "sha256": "7ded32d320b0d1d71c59a4a3b493722a13c9c6a66de83f19f8a382b29af7a2f6"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/hkdf.js",
      "sha256": "ccb942a8008f974018965eeb1e33b8f4739bf767c6f95f2ceb06f5873a302f67"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/hmac.js",
      "sha256": "fec9f8f3aeda785ea2de91cc4c059d54ef98196261c026c43f48341007ae52c9"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/index.js",
      "sha256": "b0d908a44e09a1b7c27a43d7b9036a6147a7a32db758bb64d9a668ea5c72d1af"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/legacy.js",
      "sha256": "690553a41af2fdd1e32ff6b534ba8508e95f1861c09c2d62fe762b6b501e09be"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/package.json",
      "sha256": "3e361734f5269de162fa362483d7f45dee7efb533ec217157945338f7591baaf"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/pbkdf2.js",
      "sha256": "62b75b5465a89af052a80bdebe7e0383ba01648b12f64877ce285a2e9896c713"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/scrypt.js",
      "sha256": "a38a020620776fa5c57c00f151bdc1033c192827c9d841996daaf29122ea82c1"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/sha2.js",
      "sha256": "471746bba6ec4c6238ca41358d1d3b40b6ff31cf3363f0b4d550c649c1a8e83b"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/sha3-addons.js",
      "sha256": "e979866a213955afba24c105966bc42afa5d1377d77fe1017dea29a958fddcb7"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/sha3.js",
      "sha256": "9a81e1edb24eae27b335533220167609cfb58008c5690e140ce478acdc669f32"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/utils.js",
      "sha256": "037ad49adb78168b6b699598fd33f85f7877456b1d28b4d032e2a1a16807947c"
    },
    {
      "path": "mobile-app/node_modules/@noble/hashes/webcrypto.js",
      "sha256": "83f476a634233b999ce6e6cd67dc03e64f07b8d5a826e67ad4a50c940d9ce7ee"
    },
    {
      "path": "mobile-app/package-lock.json",
      "sha256": "e7f2ddb2e141e8c5a026dca04cdd2c68dcdc0700c93364b0b64b3d446887e447"
    },
    {
      "path": "mobile-app/package.json",
      "sha256": "3832c74467f8ad2225dc10bac23d895b9ef017c03a5c0d59d3631ba4239f0998"
    },
    {
      "path": "mobile-app/src/api/original-account-api-v2.mjs",
      "sha256": "7df32c87ee20ba0d7d1a581d74f3308d34bd578f84b84e3a3151ba78b53ec1f5"
    },
    {
      "path": "mobile-app/src/custody/original-account-lease-v2.mjs",
      "sha256": "5ccccd92a030ce58126a8b0b331064e73a55f262858ff72d0e8c69366fca16a6"
    },
    {
      "path": "mobile-app/src/custody/signing.mjs",
      "sha256": "418918006042ed03b68799bd0a5de874e5c40613ee3e75851cfd5d22c748f552"
    },
    {
      "path": "mobile-core/authorized-envelope.mjs",
      "sha256": "a58ea1d758119b68ef8502322486218338eb4adc1dc665dcf1c29669ef18ceda"
    },
    {
      "path": "mobile-core/flat-owner-claim-transition.mjs",
      "sha256": "9d5c1e83d09a095fa2d8bfbedf77308f25f56fd14974f9f16f7f5c3015d40f1c"
    },
    {
      "path": "mobile-core/flat-owner-custody.mjs",
      "sha256": "600a5beda30230bf6ac801758413b3097beb5c5e064ab13f89324fdfba9e2a5d"
    },
    {
      "path": "mobile-core/flat-owner-external-incoming-v1.mjs",
      "sha256": "5af74583d79e12591594a2ed427f07285aefef6d882227a0c92a6e5a22b141aa"
    },
    {
      "path": "mobile-core/flat-owner-manual-binding.mjs",
      "sha256": "2229ef86bb776eeddc850e21212d20f9ad4ee7d082c4aae7574551ffeb2b07d5"
    },
    {
      "path": "mobile-core/flat-owner-manual-preparation.mjs",
      "sha256": "8a44f822db99ecce59c0bbd99974397093dd88781adf8867194a5e458de5abbf"
    },
    {
      "path": "mobile-core/flat-owner-native-claim-observer.mjs",
      "sha256": "dd286d222cdb8e4a8c4d96d9f8bd73d3e8342122c9c2e605ca640948b57ed156"
    },
    {
      "path": "mobile-core/flat-owner-observer.mjs",
      "sha256": "f77b1bd108bcaae7a8cd2cb8678f6bdad613a37549b9dc4c56f897ecd1834aaa"
    },
    {
      "path": "mobile-core/flat-owner-process.mjs",
      "sha256": "b2ff81dab7e6007450a4d610fe9fca1a4ac9fc321d58f866a1b0ded63f2d1a5b"
    },
    {
      "path": "mobile-core/native-value-owner-custody-v3.mjs",
      "sha256": "c715a120206afcbf3fafea9933f632a39ff21e1aff51514b772d0d3ad252972d"
    },
    {
      "path": "mobile-core/native-value-owner-manual-binding-v1.mjs",
      "sha256": "f950eaae57707b9d1cb3ba310ff4f23b1367f432f60c37480120b0ad651e58fb"
    },
    {
      "path": "mobile-core/native-value-owner-manual-preparation-v1.mjs",
      "sha256": "f1229791ca0f129c0a36181ea059d7f374ff039ab4621dd17494699525b9b9d0"
    },
    {
      "path": "mobile-core/native-value-owner-observer-v2.mjs",
      "sha256": "71b01b266aab0a42904ba91d91f22f51f8c787b4301768422035d2c26b9ed684"
    },
    {
      "path": "mobile-core/native-value-owner-process-v2.mjs",
      "sha256": "6ab7640602da33db1142bbad4c5857b0cca081b7817bd87988c3ac8c8fecfe9b"
    },
    {
      "path": "mobile-core/wrapped-claim-owner-claim-observer-v1.mjs",
      "sha256": "0938a79e3ddf6f5fbfc8be4cd64c94ef6b4fc3228a1d7b860494fd5306c3bdd8"
    },
    {
      "path": "mobile-core/wrapped-claim-owner-observer-v1.mjs",
      "sha256": "61abf8cc2d0071eb1b2f1e94c3d183e7a48d4737852f9201064a2c507d994b4b"
    },
    {
      "path": "mobile-core/wrapped-claim-owner-process-v1.mjs",
      "sha256": "a6337db5fc385b3966537330f8ce670a78dc455d32e006c10efd719ea9f2be01"
    },
    {
      "path": "mobile-protocol-workspace/package.json",
      "sha256": "57b39de1a212291ddbbb670c034f8139e0ccf8540c886c1b11479fc7ad0d8bf8"
    },
    {
      "path": "mobile-protocol-workspace/src/authorization.mjs",
      "sha256": "5f5667d70df7140ca2236ada629302c7b2d1a5b6ce9649bdd93ffff3146d7eff"
    },
    {
      "path": "mobile-protocol-workspace/src/device-deposit-consent-v1.mjs",
      "sha256": "faf88916e086e59dc9e1a8b88712d37022926163bfed893d026712bd5c67664f"
    },
    {
      "path": "mobile-protocol-workspace/src/original-account-private-state-v1.mjs",
      "sha256": "1df07ff6ec361ed2c21f0a5dcc05398327eb97ccf60d3a9ab2225b670805efb6"
    },
    {
      "path": "mobile-protocol-workspace/src/original-account-review-v2.mjs",
      "sha256": "f23d26cfb8a0c7b6f06f9056efb638365420290946f29fc1515f7b3aec04ecfa"
    },
    {
      "path": "mobile-protocol/src/authorization.mjs",
      "sha256": "5f5667d70df7140ca2236ada629302c7b2d1a5b6ce9649bdd93ffff3146d7eff"
    },
    {
      "path": "mobile-protocol/src/device-deposit-consent-v1.mjs",
      "sha256": "faf88916e086e59dc9e1a8b88712d37022926163bfed893d026712bd5c67664f"
    },
    {
      "path": "mobile-protocol/src/original-account-private-state-v1.mjs",
      "sha256": "1df07ff6ec361ed2c21f0a5dcc05398327eb97ccf60d3a9ab2225b670805efb6"
    },
    {
      "path": "mobile-protocol/src/original-account-review-v2.mjs",
      "sha256": "f23d26cfb8a0c7b6f06f9056efb638365420290946f29fc1515f7b3aec04ecfa"
    },
    {
      "path": "proof-relations/admission-lib/Nargo.toml",
      "sha256": "1c7fc7a7b85a2ce49f5c6a53e2f71cfaff781f5ad85e495a1f0cbb351a7fb332"
    },
    {
      "path": "proof-relations/admission-lib/src/facts.nr",
      "sha256": "ec34940c6e44f13f7a51bff27e530fd6dc67b00c00f9b8cfd2113dfd6ba385f2"
    },
    {
      "path": "proof-relations/admission-lib/src/framing.nr",
      "sha256": "e2425b1f3e16675f3556131f1fa564e15c37e742f041a2e2208a6d1042095098"
    },
    {
      "path": "proof-relations/admission-lib/src/lib.nr",
      "sha256": "cbe72be486c3c08bd6551b340246403ee3dde64512b2b5ff8fefe2370607fc8e"
    },
    {
      "path": "proof-relations/admission-lib/src/statement.nr",
      "sha256": "4882897e255fd0f80200c5c17cfecb5818119225e25a176813601bb16061f8be"
    },
    {
      "path": "proof-relations/admission-lib/src/types.nr",
      "sha256": "3122b3ebd416f50fed647cb7dcb146f7def3fe64e9353acd55af1f21e919b4ec"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/Nargo.toml",
      "sha256": "1edd695a43593e16f5c25df446bdf87bcb317fd2fa57eab5a43ba01bef5b5368"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/facts.nr",
      "sha256": "a3a609339961a393402e8c3b15bd20a8fd526fbd4beac65aa5a1cb152de49e34"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/framing.nr",
      "sha256": "9246e22a6c911a376b63a1b60b6bfdfe08bce285dc43c2beb31898a81bcdcda3"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/lib.nr",
      "sha256": "127427f5902723f99ab9c2a24b5d29460779d4836d99ce56727b6f00df63c5b1"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/tests.nr",
      "sha256": "4c324047aa82033d886e071f06dff635732a4fbbc3ee0c1234df1d33bdae1bb9"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/tron.nr",
      "sha256": "b5e76ff4e039c74af01a3b03a60d56b3ca44532aece8e155fe7fa52196475563"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/types.nr",
      "sha256": "1448cce9e1af4663578ee88327d29bc2619d8d950f52d17b5557e7fdb48ed58d"
    },
    {
      "path": "proof-relations/admission-native-value-v2-lib/src/union.nr",
      "sha256": "a166fb69f1f1e1670c257f3be8995fd6d0e8014c1d474f18ccd4f2bd03763f8e"
    },
    {
      "path": "proof-relations/admission-native-value-v2/Nargo.toml",
      "sha256": "ea96b5eeb5069e4575f4f5f8856f4b8c1bc0dad1d0678ce09ade37f8331bf1c0"
    },
    {
      "path": "proof-relations/admission-native-value-v2/src/main.nr",
      "sha256": "61e3c07a6dc31d891a95ad358c4824b859c9658f4aee9db52d16820108b43ab9"
    },
    {
      "path": "proof-relations/readiness-lib/Nargo.toml",
      "sha256": "642907f254a2d1b46fba5a089426a23a47c3e2df6a40e2238fc9c33d448dfe7a"
    },
    {
      "path": "proof-relations/readiness-lib/src/common.nr",
      "sha256": "b951e176326ac2741384c3885ef1dda9a8631e6e9c64cbf3a47311b80f0362c7"
    },
    {
      "path": "proof-relations/readiness-lib/src/framing.nr",
      "sha256": "1be5ad36795406cee4cc7be6270d0bc66bed2dacc61a0ea19e1471756b7ba031"
    },
    {
      "path": "proof-relations/readiness-lib/src/lib.nr",
      "sha256": "5640acd4b2669e5701207ce964343e4e1058e512b186028a9483e91f9f346840"
    },
    {
      "path": "proof-relations/readiness-lib/src/types.nr",
      "sha256": "9f589a22d0c35b7c8809588f5aecd540080c97e7d8cb218d14f71b0e55766fba"
    },
    {
      "path": "proof-workers/catalog.mjs",
      "sha256": "5cfeba63766989166eeaff93e010431f74336f398b78cbad0d0e088a913acd69"
    },
    {
      "path": "proof-workers/native-claims-build-common.mjs",
      "sha256": "7ff6fbee88feb958f12ba938e2d99d272746715141c9f111d44c1fb6759a6582"
    },
    {
      "path": "proof-workers/native-claims-parent-death.py",
      "sha256": "c2b8ca04c08965618498f4de285e57c86e210583619931235c8cb7bd4c952539"
    },
    {
      "path": "proof-workers/native-flow-proof-scope-v1.mjs",
      "sha256": "fc2a76ef1497d0389e15d1973f8e52f9228ce4eba80c6dd468b2a863f0e2a0e3"
    },
    {
      "path": "proof-workers/native-ingress-v3-profile.mjs",
      "sha256": "ac52e01b7cc62eb08f625c3f2bcf1698648d81e93773578697ada491cb57e580"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-artifacts.mjs",
      "sha256": "eccdb382ba0e9279db75063eaa60e451763da66993673b4c3a05e83166b9221b"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-client.mjs",
      "sha256": "e07d92ad3314d0fe89e06935aa7df2d04d8b63f51406e170b4a765127b4a8f51"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-role-process.mjs",
      "sha256": "3881aa14f690e28d8374231000400a0a29f1111687fe805bd021e8806ec2199e"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-run-bounded.mjs",
      "sha256": "6d445cad7035f7bb69359d08aadfbd6afd4e46e109a8f5aa9696c8a383ff8744"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-tooling.mjs",
      "sha256": "1521a0e790c4b57c986a9b09758c3358a69bd0995ae322256dd0dba73ca8b706"
    },
    {
      "path": "proof-workers/native-value-dev-live-v5-worker.mjs",
      "sha256": "df308a63454cc77e36f325add64389d22007f6d435055afb74295ad19834daac"
    },
    {
      "path": "proof-workers/native-value-live-v2-artifacts.mjs",
      "sha256": "1d0bb299ef740cf87d4f144fa746541f129960765353054351217e5c389fa4de"
    },
    {
      "path": "proof-workers/native-value-live-v2-client.mjs",
      "sha256": "016f91f1e42c0a1ca4b8dd80175cf63f4e5b52443d92e635c4886bccc66fcde9"
    },
    {
      "path": "proof-workers/native-value-live-v2-profile.mjs",
      "sha256": "5b1ec2e66a8be7b68962480190bb9e3c7d33d07e30c6cfa5970ba0f71a77e16b"
    },
    {
      "path": "proof-workers/native-value-live-v2-role-process.mjs",
      "sha256": "7e3e715e5f1300e61e322ea1aab5e7594695e0c3147dc6d2373384953cca4745"
    },
    {
      "path": "proof-workers/native-value-live-v2-run-bounded.mjs",
      "sha256": "7152d54f4d360966b3512c5aa530d0d609a2cd571e3d96c34c3ec7020ee1c895"
    },
    {
      "path": "proof-workers/native-value-live-v2-tooling.mjs",
      "sha256": "755a6acc373318a0b5187bf43c8f576985b5d9273a9338b45eb525e619965ae7"
    },
    {
      "path": "proof-workers/native-value-live-v2-worker.mjs",
      "sha256": "b86dee1a49b91db0f1b97b9efee7f248f440053931e01d00407c155f50589571"
    },
    {
      "path": "proof-workers/native-value-v2-profile.mjs",
      "sha256": "0f6ca54e8402ae804a6c68f9bd0441aac001432bf3d32d7e46878a41553b3e36"
    },
    {
      "path": "proof-workers/native-value-wallet-role-release-v4.mjs",
      "sha256": "2b2a5c1c6debbc44882c0f78a7e21548b15e9a512b99a4b66b5e589f78ba479b"
    },
    {
      "path": "proof-workers/native-value-wallet-role-source-pins-v4.mjs",
      "sha256": "a27abc17e24a705006c94951e7ffd6698928c286ab6ddcac229ce5c2a1b0f0d9"
    },
    {
      "path": "proof-workers/pinned-verifier.mjs",
      "sha256": "ddf160ffb23f3e7b1b1790c436ec98734467a9ffaa2c5e2e0d4d66843c538df9"
    },
    {
      "path": "proof-workers/proving-execution.mjs",
      "sha256": "2b6f7d9e7ba8e023266a53508dc96edfb011e308be800745e2f4ad558337c335"
    },
    {
      "path": "proof-workers/role-client.mjs",
      "sha256": "4ff7957b1d6ac5b339d868600078e76b4bd7836f0e25dd03dbd904e9afccaf44"
    },
    {
      "path": "proof-workers/role-process.mjs",
      "sha256": "55e4b7487982f331ebb94e47d55f3e7b6c0d25c4ab73a53dbf083e400ade10b2"
    },
    {
      "path": "proof-workers/run-bounded.mjs",
      "sha256": "c5acdf87414ac91986a4118da14e8c46c00a6fe6f38860ea9ecc82a2d9bd07b5"
    },
    {
      "path": "proof-workers/scoped-proof-tools.mjs",
      "sha256": "25798d6235d4a78a6a8eb91b3725406c782cb5968dfb548ce468357c533b11a4"
    },
    {
      "path": "proof-workers/solidity-compiler.mjs",
      "sha256": "3983cdab7a9e7b2068604eb860b14daa6e319806f978a0545cd626666aec3935"
    },
    {
      "path": "proof-workers/tooling.mjs",
      "sha256": "18ac833e360d6450f62f9d6f53744eadaed9c202ddfc0f096c720bf0152b5ddc"
    },
    {
      "path": "proof-workers/trusted-jobs.mjs",
      "sha256": "255e77da34eb0555dcec17427fcd4637cfb088acfcb503eb0c55d79db4633adc"
    },
    {
      "path": "proof-workers/worker.mjs",
      "sha256": "0ec5f77d4de74c63ad03273c428a6a5c71c002618c1d1a5c0e7d926e02fe6a09"
    },
    {
      "path": "proof-workers/wrapped-claim-abi-reviewed-v2.json",
      "sha256": "32ced70ba954e61f6d933fc3bf5f54a3d315b9a39dc20702170741d5533ac037"
    },
    {
      "path": "proof-workers/wrapped-claim-abi-reviewed-v3.json",
      "sha256": "41b4d973c2b46937ac08186ec3ed4ededc27b6bec20a803e6b6900def85d6d83"
    },
    {
      "path": "proof-workers/wrapped-claim-abi-source-v1.json",
      "sha256": "0f5ce910ad8c656a01f0aa739781294ec77bac05394d4b7db6a911963762fafd"
    },
    {
      "path": "proof-workers/wrapped-claim-client-v1.mjs",
      "sha256": "4df620c785618a298c022e820660e6124e4e590de69813dc4259271d6a11a250"
    },
    {
      "path": "proof-workers/wrapped-claim-constraint-batches-v1.json",
      "sha256": "038a5a36dd51bdf470b8f33cb934c94242f33eab250187d955b8634b206486ae"
    },
    {
      "path": "proof-workers/wrapped-claim-profile-v1.mjs",
      "sha256": "58edde83403d1a84bf116c3df5c23137839c5ca7d6474011a1ce679f64de715d"
    },
    {
      "path": "proof-workers/wrapped-claim-proof-pins-v1.mjs",
      "sha256": "7674716b471c82a73e6bcbcc73e5c117b33424b886da7c013005e029b4ae95f1"
    },
    {
      "path": "proof-workers/wrapped-claim-role-process-v1.mjs",
      "sha256": "34848ac112766255a5a28958ff47024de5260303916395358b9ad1cc3b8359f7"
    },
    {
      "path": "proof-workers/wrapped-claim-run-bounded-v1.mjs",
      "sha256": "4a1b6865d05785d3250876a51b5069d9ee407542952b7fed2acdf546b3034afd"
    },
    {
      "path": "proof-workers/wrapped-claim-tooling-v1.mjs",
      "sha256": "4f0d3de60c0cb15f508580ae46579e5abbbc992930f86dfacb6370553afafb17"
    },
    {
      "path": "proof-workers/wrapped-claim-worker-v1.mjs",
      "sha256": "7232928d2abd7a41ad1475acef077d3af2c5d7719b29cd2164e32b87cc80dbd4"
    },
    {
      "path": "runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java",
      "sha256": "02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f"
    },
    {
      "path": "scripts/prepare-development-native-value-ledger-v5.mjs",
      "sha256": "0aaefac7c73450e93748ce8fcb8fd6f87d1660e616cea0fd26bb7eb4d14c0377"
    },
    {
      "path": "scripts/prepare-development-native-value-w39-v5.mjs",
      "sha256": "755d723623dd5540a940170e382ade73d1581711fa5b12c93b6d20a90cab2ecf"
    },
    {
      "path": "wallet-app/exact-action-capabilities.mjs",
      "sha256": "c53aed353daf6c465aa13dda91a3289c4291b9f249686a0a729c082a79b994ad"
    },
    {
      "path": "wallet-app/public-errors.mjs",
      "sha256": "9bdb4cdf913128c34a938c41175305e1e940def7229a4b3eea11738bcc2d8d66"
    },
    {
      "path": "wallet-app/public/app.mjs",
      "sha256": "8035e0a51b15e5f6229af94773a526b115d97ca1e39ab15845f464ca39b09e05"
    },
    {
      "path": "wallet-app/public/exact-action-browser-review.mjs",
      "sha256": "0c0a6699db309d75ef0d7812c1e4f83060ba7906eb606cd45fd5f60410b8aa55"
    },
    {
      "path": "wallet-app/public/generation-defi-contract.mjs",
      "sha256": "4e253aa4862e907476f79f78f966ef01d1ab9a1a5a769d135fccb96f70e46ccb"
    },
    {
      "path": "wallet-app/public/generation-position-state-v2.mjs",
      "sha256": "faa60be8edc76588354316594ba7c9cac90714e8363e9817c5ec8b1d6d641399"
    },
    {
      "path": "wallet-app/public/manual-action-dom.mjs",
      "sha256": "9404e1644463ab41abc2f48cdce555fe0018625769007af91e6ca6e8cd2da164"
    },
    {
      "path": "wallet-app/public/manual-action-handoff.mjs",
      "sha256": "7830951a50bec0df0d2510f54e4ffe4be56e91992ce8f8ff686b499ad9032773"
    },
    {
      "path": "wallet-app/public/native-note-review.mjs",
      "sha256": "0e5afba78d7b3b99b74a401f49ac5a1f03c81797f7f935ae2374889b702c36e7"
    },
    {
      "path": "wallet-app/public/owner-graph-review-v1.mjs",
      "sha256": "1b27a475437bef00598b3148118d8a792defcd6c5f7dc9d9a75bed5422c1b8c5"
    },
    {
      "path": "wallet-app/public/owner-portfolio-contract.mjs",
      "sha256": "832034a675aee8c9e2f42713b57f382082624479ddbea4f4b95ae1a88298bc62"
    },
    {
      "path": "wallet-app/public/public-token-observations.mjs",
      "sha256": "a794436b542e1d297adffcd133442df16ad6b5ce6a7f276896c71a48f6095442"
    },
    {
      "path": "wallet-app/public/view-model.mjs",
      "sha256": "71c2af1f01fc918fe63a7f80ee688fad1e35f3f569ae8a2ee7a5bdf531d68769"
    },
    {
      "path": "wallet-app/public/wrapped-resume-browser.mjs",
      "sha256": "97e3ce4af4006185cd8489eec289bbf159f756ca196821e785219efcd3b2f174"
    },
    {
      "path": "wallet-app/public/wrapped-withdrawal-resume-actions.mjs",
      "sha256": "8bb5c0b93475afef61dfa03644ffc49b7227af74d53783e7db52c16ff477fe8c"
    },
    {
      "path": "wallet-app/public/wrapped-withdrawal-review.mjs",
      "sha256": "e4aa6b2ea13732d68e54b51f901a648e010b670cee4cc536a17d99f5f2c403f1"
    },
    {
      "path": "wallet-app/server.mjs",
      "sha256": "b4ad5670eb71a97572045e92191f1af91447aaf9840e63eaad8e607d9c91e73b"
    },
    {
      "path": "wallet-platform/modules/api/fixed-owner-read-transport.mjs",
      "sha256": "7733fd7095593b2443a5309d711884785124deae924d8a7939e350081887f2ea"
    },
    {
      "path": "wallet-platform/modules/api/flat-account-http.mjs",
      "sha256": "eb29c30ec696c7003e0139a01250f6ea74adf921a468a67a84ce7c778babe8ca"
    },
    {
      "path": "wallet-platform/modules/api/flat-account-session.mjs",
      "sha256": "ccc3f976f611c28717b3d311b7dac3e4bd532b2c026f0a1f7bfecd902800ebb7"
    },
    {
      "path": "wallet-platform/modules/api/flat-manual-graph-session.mjs",
      "sha256": "608f3cb83047b6323240b352de7e1d447b802a8acf04220ff2045cf3c348a93f"
    },
    {
      "path": "wallet-platform/modules/api/native-claim-http.mjs",
      "sha256": "5da145939ef53eff6195f21ade416d2316b13387df999c21450b95871a31074e"
    },
    {
      "path": "wallet-platform/modules/api/native-claim-session.mjs",
      "sha256": "bda3a5926e6aad7a039e78086fb43805a8a741c68f0fa27d0104781f6d263c49"
    },
    {
      "path": "wallet-platform/modules/api/native-claim-status-client.mjs",
      "sha256": "608c43f514ec1fce8a9c0de7a9cad5c67fd64d54c4ec8d74b5f4f5ff847ff3ac"
    },
    {
      "path": "wallet-platform/modules/api/wallet-application-client.mjs",
      "sha256": "7d55d3d99b63dbab1214b3b7f193021fac2ef024be97539027aada5682524346"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-claim-session-v1.mjs",
      "sha256": "76a43e94f9d8c7a404239f77d9ee3c1ffe3dc1315c3dbf4a8d5e32dbef2cd5e6"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-wallet-session-v1.mjs",
      "sha256": "cac5fa44ea9133140cf7ca3cfc3b1376fe60e714f352956c371083d559618d61"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-withdrawal-admission-read-v1.mjs",
      "sha256": "ca5bd6a853f83de292f06118c7609aaa14a85358487d4bce8c99a953fa1ff8af"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-withdrawal-release-v1.mjs",
      "sha256": "bca78049bddbd8d700e4e60e93a4d9023b8756de2d007aaa8dc550071f0d6074"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-withdrawal-resume-review-v1.mjs",
      "sha256": "89b470ac529cca623b5efd0d069996c5af20bff29dd3766f37c72ca32075afbd"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-withdrawal-session-v1.mjs",
      "sha256": "a344f22f053932b138a76e6cab1a206936975667e104847b97ba478070577e7d"
    },
    {
      "path": "wallet-platform/modules/api/wrapped-withdrawal-successor-review-v1.mjs",
      "sha256": "7f47b6a939cbf247d05232fc0c7387dd8c65c5634ac4591639a7c1cadd46cbfe"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/bitcoin-observation-adapter.mjs",
      "sha256": "c1de42b0efb3eaee8acbbe734e2d9b9e6e8e9b1d3708260ebdf0d4d4841acd0e"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/erc20-observation-adapter.mjs",
      "sha256": "0c8052cb0353257c409b9a1104071a1a990068aa18a81fbb7530c801b130c309"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-code-hash.mjs",
      "sha256": "274209ae1f26fdaade45ccd6ac651509f8e1d315372d519651159b39e14650df"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-dispatch-gate.mjs",
      "sha256": "5ca8965c3f4503f2767cd3f0903a7396ca3538afa88f42586c2138e5252de6f0"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-facts-binding.mjs",
      "sha256": "970d3e6274fb16ba95bcf713e00c9db8a149639e2acbcc3e973bad152da52e39"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-graph-delivery-codec-v1.mjs",
      "sha256": "ad0d6ed8bba33625f8bf08a7a47877ff63ece9c0dedd0165a90f4d4fec3a646b"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-graph-transfer-binding.mjs",
      "sha256": "8cb0f4187b6181082651cf6723816a29751637ac0dd428d6042fca1c9679eddc"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-transfer-observer.mjs",
      "sha256": "cb492d9a1fddf288888bd11632a0de2ed447990c4e777aab0815dee4f2441d7f"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-transfer-wire.mjs",
      "sha256": "e1440c704e6ac0a7d5cd8e00a6b34aaff3b8584fe5c6e59506ac9ced6d6310b4"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-value-health-source-v3.mjs",
      "sha256": "7b46787e9d3b4534245bbe165f3362374ff52ec2d5192b8afb6bc5f5ff41201a"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-value-health-source-v4.mjs",
      "sha256": "a430dae36d39bbb1a5797476993ed9bf0c87bbb4345992d594acb19e2fe5220b"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-value-v2-source.mjs",
      "sha256": "b6dc8edf7821735048043b18545643a22472541241ff5abe854bf189f61b5ed1"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-native-value-v2.mjs",
      "sha256": "f58325591404a08d3e36bfa8cad7fbf3db901ab75506c6415011316dc29b8396"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-observation-adapter.mjs",
      "sha256": "352802bec5aaf4cbbe5b487e59fcd1b2c3db0e940b9914554196ee0d7fc9f06d"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-signed-transaction-wire.mjs",
      "sha256": "20f4f33639753a5741019dd709280f338ed12b2db00d648b23da9c4f5f7402a0"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-transfer-observation-codec.mjs",
      "sha256": "8adb879619e2e30d488bc5667d5042921e377d6feba42a523f020353756ccbb5"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-vault-delivery-observer.mjs",
      "sha256": "e789fa4c896879e12322bdbc1f6a7c31e1a3ba5d2c684e31f2f7de80e6586e81"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/evm-vault-delivery.mjs",
      "sha256": "9950801eeeaa64e772b1afb9c04d3e911b42904a9930fd89ccc1e2f264e219ff"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/generic-native-value-v2-peer.mjs",
      "sha256": "f1a6ad8539272d50499cbd1534d39b41550c9d1e4f55c5da4f9e092d552d40b5"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/generic-native-value-v2-source.mjs",
      "sha256": "19a1d0f42ef8e0134ee9ff18be4ba46dd696a08978fba9c1a2cdbe91ba3b8f90"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/generic-native-value-v2.mjs",
      "sha256": "89d88be565acc622d9d50bd5dad0f3b389d0951b9d3fe0a6f9081431958e53ba"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-aligned-child-opener-v1.mjs",
      "sha256": "efd08e3e9479c398e1e4ba52e4793df70680d482408bbf5d5adbc068db6a3dee"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-aligned-native-audit-v1.mjs",
      "sha256": "ec6198384da12cb8b71446892714d2f8d7389739e2178eca1582156feb5e485f"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-private-disk-log-capture-v1.mjs",
      "sha256": "2aafc484a27f5acad154648290911bda6014af023cdec30b2de47f21cbbc6fb1"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-private-log-capture-v1.mjs",
      "sha256": "24831b66b663208cc9669299662891b96244e3ee32339b7aa7fe1e502af857cd"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-product-host-scope-v1.mjs",
      "sha256": "93ad7522dc667ac02f23148f49d68d1bde48adb9c2b1b8ba43c6b08b53297944"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-product-node-driver-v1.mjs",
      "sha256": "5ca108e6665f297dcdf58e2bcd83fe1c156b3a5f6741078e14bce6fee6ec4d84"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-product-release-v1.mjs",
      "sha256": "d96f90f20d570f59eeece7c42ff3e1c4dfc7633b30d8d6248ecad4daf3a7d486"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-product-source-pins-v1.mjs",
      "sha256": "c979521e76a9fa4be33633d5419c2a6e05e99ece85f5458c2064f84f0d5d530d"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/guarded/tron-reviewed-material-v1.mjs",
      "sha256": "15064e8cbc0b4a92f437fb5adebf9095f6785362e6a1f690bafaf74c6a808924"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/http-erc20-portfolio.mjs",
      "sha256": "cf752c40d5f0016fa72a732503baab7ae4977162c94848945c8614bf0aa526c9"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/http-portfolio-registry.mjs",
      "sha256": "4dca9b41909571e1ad7f73369c025a4b4cf610e581870f0fb43273f28fd1415e"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/jupiter-orca-bank-state-v1.mjs",
      "sha256": "0d5c1b266047c961c38ee5f180ac16b2accc5ac0a47af6c6883d24409bf17979"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/jupiter-orca-swap-observation-v1.mjs",
      "sha256": "258624599f610d32d66fad402c0f39a240b5a835b5959c0213f33a15f374a603"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/local-evm-ownership.mjs",
      "sha256": "14e04c776a8d4b75abfb33b6856f8e942b6aa075d75e90049fc239fcd9fdd164"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/metamorpho-graph-delivery-observer-v1.mjs",
      "sha256": "7c113f56b4169ab5975158f11efbd6fd7b187691b3a19cc55d20ad16b3fd7155"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-dispatch-gate.mjs",
      "sha256": "5dfeeb7f4b79f7019b95414a0dd24bb344cb88d676a1bb8f0537d8b1058cef4e"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-facts-peer.mjs",
      "sha256": "053e016c7d16bf4dc4c01d7b44e53921c75dd2bfc1d57831127723fe1b7ffcb0"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-health.mjs",
      "sha256": "1522fdafffdff5986f5e4f85d9c327da060e187c2488bbb8f065be8df9329d9c"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-receipt-binding.mjs",
      "sha256": "97b94b2a2102a76c0078d7d548fc793dbfdebf66b70bdc2b48f73b9c5bf5500e"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-dispatch-binding-v2.mjs",
      "sha256": "f499d5a61c4f69af0929ca18b0e202a4b86eb2f2396cc17d5a9cd61175a75b86"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-dispatch-journal-v2.mjs",
      "sha256": "ded6aaf423229773f7a093b27600d88ab4b934757507865d387b26479b5f42ea"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-dispatch-owner-v2.mjs",
      "sha256": "60069049da2ffa5f8413e27626be2cdc5d10c08b623203319b2b81b5b0e4861d"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-evm-dispatch-gate.mjs",
      "sha256": "b888f2b8fdad0740e01e2fd3deefa24fbc4f139b8b8dcae8a74ec6ebe8278736"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-health-source-v3.mjs",
      "sha256": "b60ca105e367475f2d0073f3acfd23ca5a68bcb9ecb545aab70b82a85aecb70c"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-health-source-v4.mjs",
      "sha256": "6b59ee06d30d3e39353c3418034b1be2c13bac15bc7c1c35918b08e70fac4421"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-health-v2.mjs",
      "sha256": "a8612fd83ae98de7c44ad6e95ee23a3ba85fa81d1b340f3aa5e67d517d1e98bc"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-observed-clock-v1.mjs",
      "sha256": "15db1b41d3e4ce51bda005a0e23d523aaed73bfb6951fbaf30e858bc042244c6"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/native-value-tron-dispatch-gate.mjs",
      "sha256": "5540c57c68b77a861726166c45d84c17c51e5e2470cc6204a8414b85bb45faba"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/observation-addresses.mjs",
      "sha256": "375a703734ebe0a31bec08505b4e600aa7b2dc1d27fea63704a8a4ca69df089e"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/observation-http-transport.mjs",
      "sha256": "9785386c635ab5d7cfc982f3ffb3c239a76ede0a69896322f8f4688ac20c2735"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-bitcoin-inventory-reads.mjs",
      "sha256": "f5390905ba48791da2174e144f616a76a3f94a129085f2e6807cec620737657d"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-bitcoin-inventory-rpc.mjs",
      "sha256": "fd9455061af6dab22260c718d49faffcd05dec96daf7b5aa25bbf4cb442f8f75"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-bitcoin-runtime.mjs",
      "sha256": "ab325dc1b5c354c25d76b0f92417b26209fdb716e71dc73e245224c4287c6cd1"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-graph-delivery-v1.mjs",
      "sha256": "a7a21fbbe05d500893bc3bd75997066cdbb9c8231cd0e8b33c040f92f47c98f5"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-native-value-health-source-v4.mjs",
      "sha256": "bd152556dcb53cdffe7501ea28021c4fe6c9c4dc7fc50c08772c4b0c1b9e4490"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-native-value-profile.mjs",
      "sha256": "b21c27c4ba9599b8c9b30d9be902870f689fcbd7b72bc5442d89956796f157da"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-preopen-repair-v1.mjs",
      "sha256": "9a2203d62c60a5bf923d55b36c8bc0eb13b4335310a57f0ca32fb4ea9e37a9fa"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-read-batch.mjs",
      "sha256": "9a58691ec5141132838a6298f60bc0498e9e3d96de7c1d3a9d1b314c5bf103af"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-state-file-v1.mjs",
      "sha256": "72f5d6588955f2d2e63c0e94cfa38e4c48cc3bbdbb3699113694aee1fbd3adab"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs",
      "sha256": "5976dc7834c0135f2345b4f835ef1eb0d3f8fa14c94421ee352551b65bea5309"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-native-custody.mjs",
      "sha256": "2aa8042150c3ad1f5dfe63f2bd8bbece010fe97dd12e718f74d59cf135c338b0"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-pool-asset.mjs",
      "sha256": "8fecd3cb8c28354754d9d0d5a35625f1c961e69789f3d31cf0dc8c8839651d76"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-runtime-recovery-files-v1.mjs",
      "sha256": "2a615e602c0ca067b9965cc769688f19ef40932a73ac4a541f3b1da7f9aa6d29"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs",
      "sha256": "19daa3bd8c6f308e6dad44d2d4e7d5e1bb3d22498f89855c829b7ccf45ce1cf2"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs",
      "sha256": "0c73bcc238ca91fd9273d122af2df5baa43f8e2554d27678c8a814e671f62b92"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-solana-send.mjs",
      "sha256": "d17dae9adc35a088d70430de1981591e931108c304ce868978c0d09fd659f592"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-solana-socket-inodes.mjs",
      "sha256": "ce7b27c91fae013311f85eca54618d77373bd61000b87c71d6d894cb0145a6eb"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-tron-native-value-health-source-v4.mjs",
      "sha256": "728be2d289c002785538c8167ccfc8236f39640ee6db85e0bc9e62d0c1447a48"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-tron-native-value-journal.mjs",
      "sha256": "01a23740bb17ded327c27631dcf62ef3b1b9516a5092d2a95798c5ae95b9e78d"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-tron-native-value-profile.mjs",
      "sha256": "0a99c04b2385e8307c2a09030a6e55b638e38b0f76c7a8122c99e84c12024225"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-tron-native-value-runtime.mjs",
      "sha256": "33ed895d278edd5c61e5511889bb5e938ea6bcdad3dbabddfc0c80119e77f4b1"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/owned-tron-node-driver.mjs",
      "sha256": "b784e169898ae8f56ef8018b8ad19b81a7091cc07e3d0b711b3e17e27dc6b9e6"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/portfolio-registry.mjs",
      "sha256": "81e410d924ad01c7a79637f1e2bc8ee63e1c87671a4553acd43424c1ae96c359"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/private-external-incoming-observer-v1.mjs",
      "sha256": "4b7c8131f3bdd0b4166dfe5fc060ff69b518d0f520d603ace7f1e16f60dcca27"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/solana-observation-adapter.mjs",
      "sha256": "5a6a8e7766001fd24118469def0c211ecedd3d616ca2cb638687c39e873816ca"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-graph-profile.mjs",
      "sha256": "930cf201c846b31cefaa6a2f33b56a3e18f6333b68adc28919bf8d399dfd54ba"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-graph-source.mjs",
      "sha256": "e42718451f02f3fd46e6ee78f01ce4a7df100458928f290e8ed5766a1c7777d1"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-transfer-observer.mjs",
      "sha256": "b4c426e258edabe598a1e3db9d26c54ebdf66f8a7d5805446bf22f9d8c9685eb"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-transfer-wire.mjs",
      "sha256": "e11f0b0fb6cbbeb2b76dcce035699f7f0970c9559ffc05d6f93962cb20bfd915"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-value-health-source-v3.mjs",
      "sha256": "4f6ccc75021211b1ab303643efa80ebfbcd53dc635c484475364f156f307a651"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-native-value-health-source-v4.mjs",
      "sha256": "48a7377a37fc149e9384282015be7e224906093b6a97a1db23389d3aba64bf47"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/tron-observation-adapter.mjs",
      "sha256": "e13412f7dd117f02d6b623df6a1a99e98512fd09d2b26dd2bf62732c2c996c65"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/wrapped-claim-dispatch-binding-v1.mjs",
      "sha256": "2cf9b97c0215d9a2615338c14bd8df545162a92fc52d559255c3732c61639cbd"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/wrapped-claim-dispatch-journal-v1.mjs",
      "sha256": "13df97e6be80dfeb6c043d6ab682775a650f3c08edb6647252df4473c10bba91"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/wrapped-claim-dispatch-owner-v1.mjs",
      "sha256": "3c27aad8968d26a320db7c791050934b4cb53c87db2200a59a9e2e43148c7940"
    },
    {
      "path": "wallet-platform/modules/chain-adapters/wrapped-claim-graph-dispatch-gate-v1.mjs",
      "sha256": "97bc0caece44488fa26fc635084f4f1da4e0240e0f50a490203f0a73fd4edccd"
    },
    {
      "path": "wallet-platform/modules/chains/solana/dispatch/jupiter-orca-route-codec-v1.mjs",
      "sha256": "76db2b09bd04052eb240f3f1be0f5b637cd8d40460d66cab814a59ad90f9ab42"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/aave-static-redemption-accounting-v1.mjs",
      "sha256": "426c745be7109a9477c50f55ef0ede4b4097498b27ce7424e4b534d680b450fd"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/backed-vault.mjs",
      "sha256": "93881fb037b3e4d219077ae9d8369507ac584046c5aa09ab9ef5740fe62976fa"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/generation-private-vault-exit.mjs",
      "sha256": "642ba30e4db16eca8515ae27decb472baa47f7708594dd7607a8bde07285f220"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/morpho-vault-redemption-accounting-v1.mjs",
      "sha256": "38b59ed7f72be87e893c7b9391364ad1739fc9ce71fd309516060540fbf8291b"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/owned-backed-vault.mjs",
      "sha256": "611cc387da2fab8e1a79f74fe81c5712d515d7ee6d5a4f30fe1107fbfaa392e1"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/owned-metamorpho-vault.mjs",
      "sha256": "2b76b319f5d94c4bfa7aa7efc92be3bd2e1e7d0e903588d97af7183e6b856d0e"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/private-external-delivery.mjs",
      "sha256": "737992a6254e79c7f485c4d9fa3fe077653a49413457f4e331a69d438b5450e2"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/private-position-state-v2.mjs",
      "sha256": "4fe5545b34679593491b4d70113bd1b1952cceccc6621541d9b3b3dded6a138a"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/private-vault-exit.mjs",
      "sha256": "2c80f85dc8aabebbeddee4d04dfb46d2711e24b2448546fbd9fbe41bc7208f9d"
    },
    {
      "path": "wallet-platform/modules/defi-adapters/private-vault-position.mjs",
      "sha256": "a85d4cbec5777c7733c91ac43f52fce72ef7ea0ae9218cb268b832423a41f2e6"
    },
    {
      "path": "wallet-platform/modules/global-state/catalogue-owner-requests.mjs",
      "sha256": "ddca6c2e900a9502045c05b93038de7a85cd00fd48f634fe303557b7869e7f89"
    },
    {
      "path": "wallet-platform/modules/global-state/device-owner-deposit-bridge-v1.mjs",
      "sha256": "d6880ae96a6b4f7c3cf590221d3b93db2a86951c4900e1b16942cb95f5c2ee16"
    },
    {
      "path": "wallet-platform/modules/global-state/external-defi-wallet-recovery-v1.mjs",
      "sha256": "de109b373454ae750aa0b654c2003e12c93299ed68967d310846c9b278e58fbb"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-account-authority.mjs",
      "sha256": "cae91583eb7ea242fde6a53e67bd032b8e055237ca86f022a7fc0abe57ae1fdc"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-account-validation.mjs",
      "sha256": "a578cce8b314d45629889095cd40154c98b0ba1a8b6352de7e00bdba3e109048"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-journal-catalogue.mjs",
      "sha256": "e80712142c4f92b364300b7a43a2b8ed366acd319980222f98011cd2677c8b48"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-manual-account-keeper.mjs",
      "sha256": "c9a392050ea3dfd5390d4deb00227fef983ecdb183de1d7b6f2a400896f6167b"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-manual-portfolio-keeper.mjs",
      "sha256": "8a634427a4a43bff602ea0fadf98d7a427410c3e7dc82e2d51f0fcef59330b0c"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-pool-admission-policy.mjs",
      "sha256": "72c96505cfefdbefbf4ad529a9539b89ce44771cd0f3cb05115c7046fe321c89"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-pool-route-state.mjs",
      "sha256": "28aaaefbf92ad47e8f9f3bcd49c1dd118002603d4267ce57ff44c3fec2007f5b"
    },
    {
      "path": "wallet-platform/modules/global-state/flat-portfolio-authority.mjs",
      "sha256": "e76ab5a39498b6926f73c18e9dfd737ff6405925f06391e4aadf7b471bc64141"
    },
    {
      "path": "wallet-platform/modules/global-state/native-value-account-authority-v2.mjs",
      "sha256": "7cf5845e89259a96c28af607b82048083c3b133a7e9e253ee026482f65deb7c4"
    },
    {
      "path": "wallet-platform/modules/global-state/wrapped-wallet-account-authority-v1.mjs",
      "sha256": "d9cc4383277baa03849bb5e9a7d3e2d38299c95fba4e28fe82d44b08b4258028"
    },
    {
      "path": "wallet-platform/modules/global-state/wrapped-wallet-portfolio-v1.mjs",
      "sha256": "0d0af64e1d70f5678f7d1ee90b67604526fe9f2ecb0683d2a61f441f7724f098"
    },
    {
      "path": "wallet-platform/modules/mobile/paired-original-account-actor-v2.mjs",
      "sha256": "53e7cc53d76e8bdbf2e7e99b3e22345877adf93c7683b99b0d57cd5aea9cb152"
    },
    {
      "path": "wallet-platform/modules/mobile/paired-original-account-http-v2.mjs",
      "sha256": "a858e94238d1e4c9b4baa9f2441ef887b681283a9238360a8d931a5b9ebfe924"
    },
    {
      "path": "wallet-platform/modules/native-claims/abi.mjs",
      "sha256": "d734f90fcb20d8e3661dd379aabe27779552508c27212b0adfdafb764eac1d29"
    },
    {
      "path": "wallet-platform/modules/native-claims/backing-audit.mjs",
      "sha256": "05deb0550c646e21b18ea30d9f92174312ea6814bb9dd595af5b1b9f83ded66f"
    },
    {
      "path": "wallet-platform/modules/native-claims/begin-payout-audit-policy-v1.mjs",
      "sha256": "248286ba0e673c75530655b0cd282e7388fe54042098e73c1eac9a529ce3a18e"
    },
    {
      "path": "wallet-platform/modules/native-claims/bitcoin-payout-broadcast.mjs",
      "sha256": "16f9448808377a863757c0fb91fe0d1d49f7effe55059b3e2662a843b2070a7f"
    },
    {
      "path": "wallet-platform/modules/native-claims/controller-call.mjs",
      "sha256": "248e59ff1ba934c5e65832d3daa40772e66cd7081b49f52682cbb96559e4561f"
    },
    {
      "path": "wallet-platform/modules/native-claims/controller-evm-record.mjs",
      "sha256": "64f12d6ad50641b12d6af982a49ac2b9a25e701b5539633e0b8753211c9df4d2"
    },
    {
      "path": "wallet-platform/modules/native-claims/controller-journal.mjs",
      "sha256": "1f23263ddfb62083390e723a38d4a71a70b852211f29b6e5f9bb53b9e63b04f1"
    },
    {
      "path": "wallet-platform/modules/native-claims/controller-retained-state.mjs",
      "sha256": "7f46543a035704996c1edb67e1a0054847b60b45fc2003f500b2b35744e58eea"
    },
    {
      "path": "wallet-platform/modules/native-claims/controller.mjs",
      "sha256": "dc8dd4792b4fa394ff468481ad03950af41a32df6b2a37cc9eade2af31a682de"
    },
    {
      "path": "wallet-platform/modules/native-claims/current-custody-audit-v2.mjs",
      "sha256": "c31ee199636f5d0851107d0b072b0f654f6ee7489cdc430be50f1ff488511d44"
    },
    {
      "path": "wallet-platform/modules/native-claims/evm-dispatch-gate.mjs",
      "sha256": "fc02f7e937258f409c883f95887bb9d5d144ce34a2b5d66ca8c1330f165afcfe"
    },
    {
      "path": "wallet-platform/modules/native-claims/external-bootstrap-partial-admission-v1.mjs",
      "sha256": "5d346f6b5f4b16399408f82133175bb7755c2ee9024efd2ec9c692d2548c4f7e"
    },
    {
      "path": "wallet-platform/modules/native-claims/external-bootstrap-prefix-admission-v1.mjs",
      "sha256": "19d6290a6eae7133a3f0a6c111867258fdd527ce765ada3618a7e4582888d71d"
    },
    {
      "path": "wallet-platform/modules/native-claims/external-capture-lineage-admission-v1.mjs",
      "sha256": "183f9a8a6c39204e623bf6ffb5bd3b720d326ea82cf947fc602976552cbc7df8"
    },
    {
      "path": "wallet-platform/modules/native-claims/external-defi-preopen-repair-admission-v1.mjs",
      "sha256": "bbc0cf01a6a6f4a07f82901bbe82d461fc69fd4b21701a14888278bfd0a0be81"
    },
    {
      "path": "wallet-platform/modules/native-claims/external-fresh-capture-admission-v1.mjs",
      "sha256": "c00177e6177b27436850f27ce2573e42a4c22cb2fa88095b72c7de25c9c72141"
    },
    {
      "path": "wallet-platform/modules/native-claims/facts-collector-registry-v2.mjs",
      "sha256": "6c1cbd9aa387e6e287e0f8ad7ae5cfc50ac67c94f5e4222d574b873cfe447ab8"
    },
    {
      "path": "wallet-platform/modules/native-claims/framing.mjs",
      "sha256": "694319b41d8ba615c1b165305ba15e642d2862a7541c56017e062e01c44b209c"
    },
    {
      "path": "wallet-platform/modules/native-claims/ingress-v3-host.mjs",
      "sha256": "bcf37aa7190bd9787bac0492af5e39d349ac39c01241d784c7d5cbe93298ace7"
    },
    {
      "path": "wallet-platform/modules/native-claims/ingress-v3-lifecycle.mjs",
      "sha256": "af2516189c73a7f30392172d0c1a961fc657bfce9d3e1fa8d653d4d7b6332abb"
    },
    {
      "path": "wallet-platform/modules/native-claims/inputs-nonce-registry-v3.mjs",
      "sha256": "b388b032fd24f4fd9aaf9e81eed0cda052968e711494ef2de5b089576d5537e0"
    },
    {
      "path": "wallet-platform/modules/native-claims/inputs-registry-v2.mjs",
      "sha256": "f1e18566e9d010b364f7c40fa951bc7d2be98cabc6990764abf9d728e7d9b24f"
    },
    {
      "path": "wallet-platform/modules/native-claims/inputs.mjs",
      "sha256": "8b70e5eef12d5d82609f379dce5617b0bebc1cdbd96febae464bd09263fc998d"
    },
    {
      "path": "wallet-platform/modules/native-claims/inventory-journal.mjs",
      "sha256": "5cc11ca66c3d2f54a6a8bc67ab451c25de96c83b894b9738bee5ab4afc952dd7"
    },
    {
      "path": "wallet-platform/modules/native-claims/issue-call.mjs",
      "sha256": "0cbd8c1034d917119fe9dd8123e35c2626413e6290c635d7957168bb522fffca"
    },
    {
      "path": "wallet-platform/modules/native-claims/operational-registration-v2.mjs",
      "sha256": "6fa0a2bcfee79c79132a1a5716e253e3d3e8c18dcd58ad543221c639f1a5b944"
    },
    {
      "path": "wallet-platform/modules/native-claims/operator-audit-metrics.mjs",
      "sha256": "4d5fee407e2dc409e0d9146dcb4c36bec9fd24198e43bc5544fa32a4608eb7cc"
    },
    {
      "path": "wallet-platform/modules/native-claims/operators.mjs",
      "sha256": "dbdde64bc226cb3319fd3e9c2f72ddf33e5ae5c34c1692ce91c524f0e8bcb5a8"
    },
    {
      "path": "wallet-platform/modules/native-claims/owned-state.mjs",
      "sha256": "2efda5c05e634a5d2e9957625b5cae4fa27f1d7dad5730a0ff756c36eadebdc4"
    },
    {
      "path": "wallet-platform/modules/native-claims/payout-controller-dispatch-v1.mjs",
      "sha256": "120d86a469286046e6c6df188d99b84336f2f254ba3fd82e98088d452e6d5374"
    },
    {
      "path": "wallet-platform/modules/native-claims/payout-final-send.mjs",
      "sha256": "d135946626bf5697058c38619efab993ec988d46de2593a0d7baa4e8fa5c00ba"
    },
    {
      "path": "wallet-platform/modules/native-claims/permits.mjs",
      "sha256": "1243cc676b26fc40e5698a266fcc7a3fa8b23a2e9012091b9663dcd6820104f5"
    },
    {
      "path": "wallet-platform/modules/native-claims/portfolio-view.mjs",
      "sha256": "8d6aa66d15ebdc9db0288499324d92bceec243f83bf5039b97734e702a7b3b81"
    },
    {
      "path": "wallet-platform/modules/native-claims/record-store-process.mjs",
      "sha256": "9f295a5d8bbdbfc9fdd36a110eef2d731702d17c936a0b5729fdf077e0810a6e"
    },
    {
      "path": "wallet-platform/modules/native-claims/registry-envelope-v2.mjs",
      "sha256": "2b0b6e12ccc0e2fa9e02c35f48e2cf5b429f6484d5b960cd22a9aa2f1a429589"
    },
    {
      "path": "wallet-platform/modules/native-claims/reservation-facts-gate.mjs",
      "sha256": "007a4e178fc5e9e4589ed7d07499d4435854b76635efa1923e12585df5f7e311"
    },
    {
      "path": "wallet-platform/modules/native-claims/segmented-record-store.mjs",
      "sha256": "83c5b02a2cdcb849e7f4ff27a0f07d6f05349d62bed5edf163e281467f0172c8"
    },
    {
      "path": "wallet-platform/modules/native-claims/vault-session.mjs",
      "sha256": "849da8ce6aa7aa3232ee3a6ef70b422c8ab8fe94ac138c9055f231680876d520"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-controller-journal-v1.mjs",
      "sha256": "a6500ed27151dd8c5c3efb4d5f332e0a66bc6340fc0ef4786b8e6e9852c1ce1e"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-controller-v1.mjs",
      "sha256": "e374531b5f42e23687f1c37f43844c8ecf59de60155d1072579aba582bc9969a"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-evm-dispatch-gate-v1.mjs",
      "sha256": "cf7a3129e1d66bcd7cc6385e84b25f04742fb21b4a5b71f9201732847671f7fa"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-ingress-deployment-v1.mjs",
      "sha256": "ab2de90ee961c3faf876f42dcfaca2c503a648f11d86e958728f502fe2f9874a"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-operators-v1.mjs",
      "sha256": "fc6c179abd486775027e7e35954bc3d669f49e550ec9a2528a3a9e5e79616b86"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-owned-state-v1.mjs",
      "sha256": "425a5230909338442e6928ee42ba978b278657bf548029671939739ab3e4f36c"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-private-lifetime-registry-v1.mjs",
      "sha256": "acd9804c37f9ff97d22e1474ecded671748b029f6f709b8c1a91e05011bfbd7e"
    },
    {
      "path": "wallet-platform/modules/native-claims/wrapped-recovery-authority-v1.mjs",
      "sha256": "c4b57a27f07eae523762678b3b4e08451288c0f8f8bf72026ba05cc87de68292"
    },
    {
      "path": "wallet-platform/modules/ops/aave-v3-development-compilation-v1.mjs",
      "sha256": "82659b1536100114d93cdf5f6b0a0627064356064ed252890555a1965c6bd5f5"
    },
    {
      "path": "wallet-platform/modules/ops/aave-v3-official-material-v1.mjs",
      "sha256": "8651004f244479e3e22d6c81d3470890e255b6bfa9db702cfd8226770064178d"
    },
    {
      "path": "wallet-platform/modules/ops/aave-v3-runtime-code-v1.mjs",
      "sha256": "cfeffe0bb54cb1474208d33e2745b69d3fbbc47b55e31456aaebd55cc72dabcc"
    },
    {
      "path": "wallet-platform/modules/ops/append-only-deployment-artifacts.mjs",
      "sha256": "c511e352edbfab914aa9aecaa9b9ffd6ce76dcf201bee947dfbbf3752b418403"
    },
    {
      "path": "wallet-platform/modules/ops/append-only-deployment-plan.mjs",
      "sha256": "67ad4bcc2141591d60eabee214b0352e29407e3cc0c2b49032151b6bfcf4b5ac"
    },
    {
      "path": "wallet-platform/modules/ops/check-native-claim-ingress-v3-public-proof.mjs",
      "sha256": "43520ef139e6741dcbed27ab1df003293f6dc2e593620ef36d58b7c16b0bdb31"
    },
    {
      "path": "wallet-platform/modules/ops/combined-native-operators.mjs",
      "sha256": "a213f89dbd726394ccd7daf43682561336e729c904fa2408be02d6d358767779"
    },
    {
      "path": "wallet-platform/modules/ops/deploy-backed-assets.mjs",
      "sha256": "4d09918c4a8ccc340a43d9c6645c4ee01c8b77e109243581234747fcaec4225b"
    },
    {
      "path": "wallet-platform/modules/ops/deploy-evm-vault-router.mjs",
      "sha256": "8e10903994fe9f7b3f1d45a35676447c4b4a68ab3493071cf287595769094775"
    },
    {
      "path": "wallet-platform/modules/ops/deploy-native-claims.mjs",
      "sha256": "c8bb8a431b2ea210ffe54ec76c6a93be6b90c6f97b697eac9b8f381380fe299f"
    },
    {
      "path": "wallet-platform/modules/ops/deploy-private-external-router-v1.mjs",
      "sha256": "0d74ea6a50f0c1bf045eb3319b117dc6c4c2379028d933c37cbfd082af3bc18a"
    },
    {
      "path": "wallet-platform/modules/ops/deploy-system.mjs",
      "sha256": "4c80f09f2199f7d91d53124929364e079cab9a481253ea446775733ba90cf559"
    },
    {
      "path": "wallet-platform/modules/ops/deployment-artifacts.mjs",
      "sha256": "233473cf187f2c2b3d1ea37d7a5654a47a84b9675276f043a873b3a7da426d62"
    },
    {
      "path": "wallet-platform/modules/ops/deployment-plan.mjs",
      "sha256": "1b19e415e47afa0c7cdc7607f8ea4a62e1eeec9335eee3d77479a58535deb18d"
    },
    {
      "path": "wallet-platform/modules/ops/development-evm-build.mjs",
      "sha256": "aa7937c913b7f7c32282b026f094021b3767b7ed00da0cc453ef162538d1df45"
    },
    {
      "path": "wallet-platform/modules/ops/development-native-claims-build.mjs",
      "sha256": "eb286844729906c9bccdaf7b08531c60ba87e3daf0498067cf51b8d646fd221e"
    },
    {
      "path": "wallet-platform/modules/ops/external-defi-bootstrap-recovery-v1.mjs",
      "sha256": "6e21f8fa3b61cb52f6d77d56e327991754855361669d8e37e69cf9688e163949"
    },
    {
      "path": "wallet-platform/modules/ops/jupiter-official-material-v1.mjs",
      "sha256": "64f7aed3e67fce4dd76a19e75eb8adc3a6db71a96d83bf106c07761829d50a26"
    },
    {
      "path": "wallet-platform/modules/ops/native-claim-artifacts.mjs",
      "sha256": "452e1496625a5ef1e9346a8b130c764adef82d672498d446ea5e0fe6223e904d"
    },
    {
      "path": "wallet-platform/modules/ops/native-claim-deployment-plan.mjs",
      "sha256": "4dd375803260740304c75a89e4141d761c2b34ca92fb500817db5fda6a0c365f"
    },
    {
      "path": "wallet-platform/modules/ops/native-claim-ingress-v3-artifacts.mjs",
      "sha256": "63bf1c4896020ba723e154b8e6cd870188015ac4f48b4109a7a54b6be486fbbe"
    },
    {
      "path": "wallet-platform/modules/ops/native-operators.mjs",
      "sha256": "a524e9207c1c66ed1be74119870fc3c01122e3f8dcec29d3bd6abe2d9c6e2a38"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-checkpoint-v4.mjs",
      "sha256": "9f2be5a3001123fd4a71de534377b1d8f31fab01bb02798f87e3a57e5a08f504"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs",
      "sha256": "f13cfe0c3bb7d767f51c34e8f09236794270e192558f5233e9d11fd5f116cc30"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-deployment-checks-v2.mjs",
      "sha256": "b16eba4e01ff4ae3763c1649094107545b5ce92c9055c97388cfe7c5fe9d9074"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-deployment-plan-v2.mjs",
      "sha256": "26a3f8e9300b5704dde19429793b5bf911b3b150463a3c5d8c49e691b60fcf9c"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-financial-source-pins-v5.mjs",
      "sha256": "b45b6358ff8423aa5ecd9d31cc03fc97a59d26edb9b3145966517b29faaf4228"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-mobile-package-pins-v5.mjs",
      "sha256": "de5381b431866a3b16bf61ec5eeb05a61b3856524ba7086fd2744084bbf14880"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-producer-v5.mjs",
      "sha256": "815a5889633cd4e3dd3f178a75540e6eb95f5ecf6126b8b673cc6f43df3b4ba0"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-release-contract-v5.mjs",
      "sha256": "3b2572cbbc52c6e398608774d360f0a84f6e8147046c7df782f1ff987377c0d8"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-source-pins-v5.mjs",
      "sha256": "4166827e7a7a9cb12271fa9c518ef9fcaa1a2413db01f864a2df7a964a0a53ee"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-w39-artifacts-v5.mjs",
      "sha256": "c713b83b1a30387070c3609a659b4b756672b8e9f0eed794312707086462eeb6"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-w39-build-dependencies-v5.mjs",
      "sha256": "dc1d121486f0e521e2a970c97238993c6079fabd51c6ed331094643d17003cc3"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-w39-consumer-artifacts-v5.mjs",
      "sha256": "0ab71d1ea643238510ffef3784e87191bcc9b9cb8f4add4b05d3392aa4f84063"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-dev-w39-contract-v5.mjs",
      "sha256": "34504a760e1aeda29bf8fa842b94ce00e739619d736da545e53a6b1bb648b1ba"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-history-dispatch-v1.mjs",
      "sha256": "9202eb95d6e9e54dc74ba6f1311ab788d6666fc0598d56159a78aa72f12ca0e1"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-inventory-v3.mjs",
      "sha256": "7815b1e4c4b5af0bad4745de139052645df9fba9bea366a1d1019f47b6c2a633"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-inventory-v4.mjs",
      "sha256": "da354a8960e97f2c39fd647639c4d13a15f5bef5c7c4788dda3a98bb81dfe38f"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-local-operator-bootstrap-v4.mjs",
      "sha256": "b96327a2a19db89e0daa5b502c5986ba6475617bdbcd471c84b443f838e928b6"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-operator-bootstrap-v2.mjs",
      "sha256": "119502c3e8d7901dc9ab05ef2bba94fc325ad95652ae50180449425476093d38"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-operators-v3.mjs",
      "sha256": "247ef5012520994509f9d74d2480c05d87d995f376fe80754d78553bc722f22d"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-operators-v4.mjs",
      "sha256": "e57c5bdbb3eff71ea34b1e83c6bf0f34de520106fa225ded16d6534043f66037"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-registry-v2.mjs",
      "sha256": "894a2fc9fabbe7850a25d2e8cf0a04180cd990bf4476caa4aaec5e3cf7ebc8c7"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-system-v2.mjs",
      "sha256": "ed90553470666cd19c133e87116eacd181e1be8141e4c1ca505175283a0674be"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-wallet-binding-v2.mjs",
      "sha256": "0e4bc1ef5ca3ca16775fc0f8ad3b6619f0a32021c9a38e433800ddfa9c1dd2e5"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-wallet-host-source-pins-v4.mjs",
      "sha256": "ca618110ecf3b4e989cb635ab1d70973943bace5e6982d284c953385f9a9f5c9"
    },
    {
      "path": "wallet-platform/modules/ops/native-value-wallet-release-v4.mjs",
      "sha256": "961c9bd1815754f9d755a8328015d5d9d8cac2e280668a4d3806a7cd97ee2add"
    },
    {
      "path": "wallet-platform/modules/ops/official-aave-fixture-v1.mjs",
      "sha256": "4e0d47a825bff32d851496286a0021740619787d3f67a8c5cae08ddb20071e7e"
    },
    {
      "path": "wallet-platform/modules/ops/official-protocol-fixture-v3.mjs",
      "sha256": "8535c5817ec0628e8080df1635f83d4ba73897d6e63e02852bfdd9dce047868a"
    },
    {
      "path": "wallet-platform/modules/ops/operator-fact-audit.mjs",
      "sha256": "ad010caf2b22985e8a6eaaad30c0fba6a2245a6c0c03daa5b180cfefa5f9d3b2"
    },
    {
      "path": "wallet-platform/modules/ops/owned-native-operator-reads.mjs",
      "sha256": "318db1ca651a558c19c3bc25c37ba1206842edf4e1a83fa52536d6f85e41d02b"
    },
    {
      "path": "wallet-platform/modules/ops/shared-custody-allocation-v1.mjs",
      "sha256": "f809777806e2bb1103f6dd77ae96ac3928861680db5482e2f68127e920a9194e"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-artifact-contract-v1.mjs",
      "sha256": "8ec2b71744b963e34ee0fcf28b125f3e2e86e80979d8e63a8784425d885b68db"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-combined-operators-v1.mjs",
      "sha256": "aa1490dadd5b982ea47934ad02c7ecbe2c7980d12652098ef4ef3e5b0bb32865"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-custody-bootstrap-v1.mjs",
      "sha256": "716e9af62ae8ab3342440867a02968941b8752705a3762238f67189a38687243"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-deployment-artifacts-v1.mjs",
      "sha256": "8b4228e9983b64e42033756139d93648b126187b8d4822c9739763f16d22dacd"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-deployment-checks-v1.mjs",
      "sha256": "0cbe908b3dea998942eaaa666e8c7c4b4fb514a5a825bb895daa4f7b9b7d47ce"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-deployment-plan-v1.mjs",
      "sha256": "b65678c4179fbaf4fd7ae6e9fab51a85df93a117dc5fc0bcf06c437c925b53c5"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-graph-inventory-v1.mjs",
      "sha256": "84514cafba752ed10b13a9d9b4fa7da2a92d0ad3a8a3cc529771a2ea8246e3d8"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-graph-operators-v1.mjs",
      "sha256": "f57f822419aa3c99e3c69a7b2c48d1b5619b1253315bc84acc7b80365e5cf195"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-graph-plan-v1.mjs",
      "sha256": "3029cd919bde2463d7a0b00398bb98afc1b8af7a90667830c48c2b699614039a"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-operator-bootstrap-v1.mjs",
      "sha256": "bb2468b9036aaf9818f40b71a2bf8022649884daa544192202d988062bedf8aa"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-proof-artifacts-v1.mjs",
      "sha256": "f5a815d0f11dd74e71e52f54947247e87c2902b428904580c4e32d020759f702"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-release-v1.mjs",
      "sha256": "34a858f86d865aa84162fd7225e538b6cba364ddeaf8c4e193ba541e3a5fb701"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-retained-co-origin-v1.mjs",
      "sha256": "62ffded13048974a2ebd0d448c09e1a241e4ce55e08b6fbcf265f94e91ef15b3"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-retained-origin-v1.mjs",
      "sha256": "81c85fbe67a28e859fffcdaddb07180d693f7d313ac1d16ffed9f68f8fcd2ee1"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-retained-preparation-v1.mjs",
      "sha256": "12070f80b8b6bf0c570a08f504389152302e78114a5be1257ec6b31ed5999054"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-stage-provenance-v2.mjs",
      "sha256": "28395995fc6143b1e91e9d31abc78666065ca77693a8edfbbf569878ab1a2bc6"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-system-v1.mjs",
      "sha256": "95c495b9d0099d4de44e0296f12a21da8c8a3fee14dde6e2cfd9a12654046f9e"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-verifier-link-contract-v1.mjs",
      "sha256": "ac75fb8f00d0a3c74acb9d7719c1f90b10a8dd1fcbf914c306f361bd20963fed"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-claim-wallet-binding-v1.mjs",
      "sha256": "8049ea8a2803d706da643239bb40acf0f6a3b4a7b12ec2ddbf5eedbe58a2c6af"
    },
    {
      "path": "wallet-platform/modules/ops/wrapped-wallet-release-v1.mjs",
      "sha256": "4689f04c596bde78bbdaa83107def3f3c6cc6b75492cd26837baa7d6f0fffc46"
    },
    {
      "path": "wallet-platform/modules/paeg/admission-inputs.mjs",
      "sha256": "a288c16f887a823a2a7e636469c757ee1fe193047c1ff682a3635768bc5ebc8d"
    },
    {
      "path": "wallet-platform/modules/paeg/admission-native-value-v2-inputs.mjs",
      "sha256": "211db21390e75d7c0b6af6b95a0c1aa7dc85e617a924377d4af96bcef823c306"
    },
    {
      "path": "wallet-platform/modules/paeg/commitments.mjs",
      "sha256": "4f88f89746c703f36756ef5381c72587dcc7c859bbe3aeddda698d6506143e3f"
    },
    {
      "path": "wallet-platform/modules/paeg/completion-inputs.mjs",
      "sha256": "b60f9c77069f999200aec64c1dd61fc295381ebd20ca3330d88dd813c3cefac8"
    },
    {
      "path": "wallet-platform/modules/paeg/deposit-intent.mjs",
      "sha256": "3c6d2b8c23a33dc8ac081d4e6d3ee6642236eeb5bb0bd492e7c94f50beaf2a07"
    },
    {
      "path": "wallet-platform/modules/paeg/failure-diagnostics.mjs",
      "sha256": "ec16711277d2be2746f39b432f91d67653f3edc3239257ee554a1d53591d5e9e"
    },
    {
      "path": "wallet-platform/modules/paeg/flat-completion-window.mjs",
      "sha256": "f5b23b1da7e0e4b4064e6f023b1fe15f794a07cd4e07c27205328bcdb3c0eefe"
    },
    {
      "path": "wallet-platform/modules/paeg/flat-native-execution.mjs",
      "sha256": "fa6ac046d27453817072afaee519ce69d1326e6311c3be007a69d90270c3bd5b"
    },
    {
      "path": "wallet-platform/modules/paeg/flat-pure-math-cache.mjs",
      "sha256": "dce739e5a4dbfdbff41a112aefec7f0e23044233c9bc2ca60f37acd0636b3792"
    },
    {
      "path": "wallet-platform/modules/paeg/flat-system-state.mjs",
      "sha256": "d7e9a10710c1cc0ec6ea6110335441f29a1c8e1c059cc14182f304b0c8fa4759"
    },
    {
      "path": "wallet-platform/modules/paeg/flat-terminal-observer.mjs",
      "sha256": "16c1048188680026aff4a4d1ac5f81a117dd9678f42963c275f1d14a1239cf8d"
    },
    {
      "path": "wallet-platform/modules/paeg/funding-inputs.mjs",
      "sha256": "88dab47a84d34ca9f7f2bfdfe8ccdf5288ec79fac1b7ed092f5cbe97be3a859d"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-current-gate-v2.mjs",
      "sha256": "bda5d172c1a68f13224473ea0a2429df20268a95acea59a973319c620fdb0e7b"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-dev-admission-consumer-v5.mjs",
      "sha256": "c615cd9eb8f65ce669db10aead2b18df79eeb7bf5d829fc5ce4566deb2be32db"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-execution-v2.mjs",
      "sha256": "c28a561598ac4d9dcad6f5c73bc26d1ca485c4ed01e7549d62737a3efb7b7081"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-failure-retention.mjs",
      "sha256": "5cd022e69d60cc5a84b8c9bdc324f975d7de1f3c5ec7be5ab3b100b153b0d04e"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-graph-admission-v2.mjs",
      "sha256": "71f38db974d46eaa377d87f7f2a5c1678793842019f32d454b888c487f7ba60d"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-statements-v2.mjs",
      "sha256": "0acbd87d6e6a96abed719696e69ced3880aaf0f3693a5cab3f0ad1d6da39d9c3"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-system-state-v2.mjs",
      "sha256": "410ac52abad574dd42dd027472bfd7cd355a15652c4b367ef2b16ed833ea0348"
    },
    {
      "path": "wallet-platform/modules/paeg/native-value-terminal-observer-v2.mjs",
      "sha256": "fcc0bb8868e043f37ac95675878791dcc63b186e61d97a224fc9d512a4e06024"
    },
    {
      "path": "wallet-platform/modules/paeg/owner-native-graph-review-v1.mjs",
      "sha256": "6062c61247a7a81233079f39647d6c3adb698c12d7b0089e5fd316bbe99a99d4"
    },
    {
      "path": "wallet-platform/modules/paeg/prepared-graph-dependencies-v1.mjs",
      "sha256": "16aea5f9141150032cfd4832c8219e4b2294784e561aef9591fcf95f87a2a093"
    },
    {
      "path": "wallet-platform/modules/paeg/readiness-inputs.mjs",
      "sha256": "2ee707e64d1e8f805e930ab8ae0506e59e01d5cf5e39d7f5b2aa803438f65241"
    },
    {
      "path": "wallet-platform/modules/paeg/statements.mjs",
      "sha256": "d494115f0b5b4148b57f8715e415daf6251908941c2bbc62a7fe49c0cd17e8df"
    },
    {
      "path": "wallet-platform/modules/paeg/transaction-codec.mjs",
      "sha256": "b774977ddc08eccfd0576848f9afe3cb836b71fb1d093e4ecaa75687900f71e8"
    },
    {
      "path": "wallet-platform/modules/paeg/wrapped-claim-system-state-v1.mjs",
      "sha256": "a6786c067992c22d86ff489d2252e5026817ac33ea6a47759cfaeb64dc1120a4"
    },
    {
      "path": "wallet-platform/modules/paeg/wrapped-wallet-execution-v1.mjs",
      "sha256": "2552e914c5408bb7af281f56d86ae117ef6db5da8ab421a4bb31d31035682dc7"
    },
    {
      "path": "wallet-platform/modules/paeg/wrapped-wallet-graph-admission-v1.mjs",
      "sha256": "f098623cf53522d4324677ef29f9dbab46bc7e35abb31b4484dd430fbad570c1"
    },
    {
      "path": "wallet-platform/modules/paeg/wrapped-wallet-state-v1.mjs",
      "sha256": "6b1ad1d5fa1b57fb9507983ed5b216ce180b71d7ff1e90777a303ef207dd71ea"
    },
    {
      "path": "wallet-platform/modules/paeg/wrapped-wallet-terminal-v1.mjs",
      "sha256": "2612b020b6303cfa16926c0e91cb743467c542a622acada9bea5f7dcee5f8740"
    },
    {
      "path": "wallet-platform/modules/solvers/evm-vault-provider.mjs",
      "sha256": "7d0801082380f4a487ae7753ad21941a68c25a41a0264f1187fd31ce4ab6d096"
    },
    {
      "path": "wallet-platform/modules/solvers/native-provider.mjs",
      "sha256": "db73a1f6cb5905a57dae586d12ee464f07ed2150fcccb330c40fdc9994365d73"
    },
    {
      "path": "wallet-platform/modules/solvers/native-value-provider-v2.mjs",
      "sha256": "78538de1c33b5c867d44058b3075a200aaba1d0c09b6312d36e2482b9e3e1ef6"
    },
    {
      "path": "workspace-module/experiments/wallet/native-ingress-v3/fixtures/synthetic-ingress-v3.mjs",
      "sha256": "e46ac6a1b2f73fb5838c4401eb7942e35ec9eb7811f07c7c965ce9667568803c"
    },
    {
      "path": "workspace-module/packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs",
      "sha256": "97b94b2a2102a76c0078d7d548fc793dbfdebf66b70bdc2b48f73b9c5bf5500e"
    },
    {
      "path": "workspace-module/packages/backend/src/claims/protocol/framing.mjs",
      "sha256": "f659c196f081f3ba8ee6f3f91933a452537b057c4cfe9a5ba2ea7931f2ba1a61"
    },
    {
      "path": "workspace-module/packages/backend/src/claims/protocol/inputs.mjs",
      "sha256": "b3d86a77ce8a1496fa1a5eadd6419d33c02d325d92f79a32b0f0afce9a7b14c9"
    },
    {
      "path": "workspace-module/packages/backend/src/execution/account/preparation/readiness-inputs.mjs",
      "sha256": "a16bbe648b2662980ec2e1ab68b7571c2dceaa4f3719df8b75799e1ce49e7ee7"
    },
    {
      "path": "workspace-module/packages/backend/src/execution/encoding/commitments.mjs",
      "sha256": "4f88f89746c703f36756ef5381c72587dcc7c859bbe3aeddda698d6506143e3f"
    },
    {
      "path": "workspace-module/packages/backend/src/execution/encoding/statements.mjs",
      "sha256": "d494115f0b5b4148b57f8715e415daf6251908941c2bbc62a7fe49c0cd17e8df"
    },
    {
      "path": "workspace-module/packages/engine/src/chains/shared/runtime-harness.mjs",
      "sha256": "df1d8a20108efba3992790d017e4b5b42a65a7171c299c3274792b35ce28c3ae"
    },
    {
      "path": "workspace-module/packages/engine/src/chains/solana/solana-runtime.mjs",
      "sha256": "fe6960baed250ac545f8fb491e47c7e27af10a799fe24c85543593285da122d2"
    },
    {
      "path": "workspace-module/packages/engine/src/evidence/native-evidence.mjs",
      "sha256": "8d93007c6d95a2064af9e32a13cbd0000e9deda183cff13ce50a841bb522d98e"
    },
    {
      "path": "workspace-module/packages/engine/src/evidence/native-quorum.mjs",
      "sha256": "d8fcb494326e7ad9befd975a8252651fc60a75b4dd6b2ad10c14bc78c7f71915"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/graph/funded-graph.mjs",
      "sha256": "7118e47af0fd24c061fadfd764336aa9c4aa10f2a21d8b7584f995b061221be8"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/graph/graph.mjs",
      "sha256": "06c512a41c12621e4ed56691d697ed18d02aa39ec86d2cf291dd7ee6e63c5e99"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/native/dispatch/native-admission.mjs",
      "sha256": "7566e4008f20a5347751a8db02f23c4123e3e1652f7b2bcf446743910ff2776c"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/native/dispatch/native-capsules.mjs",
      "sha256": "3f58f78e0a2336cbfaf250bab35347b1d3afdcc83a6642c7d20eb3afc4e2e07e"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/native/state/native-receipt.mjs",
      "sha256": "d49a64d6176aa1a592c0b5e6f1f699d983addb061447528ac078f7028fa2baaa"
    },
    {
      "path": "workspace-module/packages/engine/src/execution/native/state/native-state.mjs",
      "sha256": "0432453c7aafb8e4612e231f2aed1f9415aa6473c9d165edd72e51ad0f86fd33"
    },
    {
      "path": "workspace-module/packages/engine/src/native/native-bitcoin.mjs",
      "sha256": "01a2b3e1da168a9b04ba73a804aa72ab65085aff5b7e0582e6f18278487bc9ef"
    },
    {
      "path": "workspace-module/packages/engine/src/notes/private-native-certificate.mjs",
      "sha256": "78c64734fdb554f7f445f380f17df27ae8e38ee9f54a3e9ba74ab394abee2a1a"
    },
    {
      "path": "workspace-module/packages/engine/src/notes/private-note-encoding.mjs",
      "sha256": "ee091ea2a0e003c965910f9f96d986a385bc0b496323e9c3f4f72da8e68b1d5c"
    },
    {
      "path": "workspace-module/packages/engine/src/notes/private-note-tree.mjs",
      "sha256": "e2ac35aa1d1f2a805feb55717fa3bd18308867f9d14940754fb52877f063eb57"
    },
    {
      "path": "workspace-module/packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs",
      "sha256": "8633efa599ebf6b70d13b5b5a615b614dcb60c891206409aefa7baf685be33e6"
    },
    {
      "path": "workspace-module/packages/proofs/src/catalog.mjs",
      "sha256": "02fd9628c5e44566096f36d78cb45d0ab66ea8d48b7e2323827220f066ab1c0a"
    },
    {
      "path": "workspace-module/packages/proofs/src/jobs/trusted-jobs.mjs",
      "sha256": "9eaa29d4b65b210e76321ce9a6312b719db306dd9fc34135151c63be740e4b9f"
    }
  ],
  "retained": {
    "schema": "LIANUM_NATIVE_VALUE_GRAPH_ONLY_RELEASE_V2",
    "sourceClosureSHA256": "c5fdcb8b2ee13d65f1cd5e3394c96f67b66b5e09d3ec13c91981e31049e5a359",
    "toolchain": {
      "node": "v24.19.0",
      "noir": "1.0.0-beta.25",
      "barretenberg": "5.2.0",
      "auditSHA256": "81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6"
    },
    "crs": {
      "points": 2097152,
      "provenanceSHA256": "e24f63bcea7cc9d1430c3696c109569015fc38c6e44d5a46ebab3a64013939e3",
      "records": [
        {
          "file": "bn254_g1_compressed.dat",
          "bytes": 67108864,
          "sha256": "3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37"
        },
        {
          "file": "bn254_g2.dat",
          "bytes": 128,
          "sha256": "01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f"
        }
      ]
    },
    "ledger": {
      "compiled": {
        "path": ".local/native-value-genuine-compilation/graph-only-source-v1/ledger/compiled.json",
        "sha256": "f21b27105321ff027954ac5d0660b420c3028bf974a8f9a9e0c93db66c0a11a3"
      },
      "settingsSHA256": "96d0fa28f9e3e67bb711ed7dc213ae1cc9c0e4646c243806b3c3167cb5698cff",
      "sources": {
        "FlatHubCodec.sol": {
          "sourceSHA256": "aadabeafefc8c985f485f3c31cdd31002426b14dd90096e6d38113f14035d487",
          "astSHA256": "4ff5c1d14ed189b65122e8d1c5a188d879d45284e0a5f278004c48a012359ffe"
        },
        "FlatVerifierSet.sol": {
          "sourceSHA256": "dff6e8d216f6eebba2331fe38f54b57c4aaa3ba5d8355c0de1fd1d10410b6710",
          "astSHA256": "0e870c66b4e51740440fafd7c5007e48625c656aea658a39892e27746d396122"
        },
        "PrivateFlatAssetNotePool.sol": {
          "sourceSHA256": "818fcd9abd1b4e7779e043fd37c9af70f16f2e2cd0095eefeeaedd783e80589d",
          "astSHA256": "1dc523631c4ae7e73259dbaf4cf9eda5fc3bd7bf8c578a33eb4b048113180e35"
        },
        "crypto/Poseidon2.sol": {
          "sourceSHA256": "e1faf5b4497e7e9cc569e6711231eca9f4a4a4887cd673cc7257e8233b7ac740",
          "astSHA256": "340049dae387cd4fdf44a9b347a7c0dadccecd40aac5e639374cdb998de78406"
        },
        "crypto/Poseidon2Domains.sol": {
          "sourceSHA256": "ea25f1871682cb3498c83c1aba44cb954c68d7f962e69e2d79f1ac7edf177562",
          "astSHA256": "15755b27126c236b5c20a48c6a0016578d202e52994ff2af6d62ca5d32f4260b"
        },
        "native-value-v2/FlatNativeValueRegistryV2.sol": {
          "sourceSHA256": "aad08f6af2f801276e0f7af94c0b8f4b184abcc7a978335a60b604d2c524b5ca",
          "astSHA256": "56d9009083a16193c8e12b7b531013da2230faaf97790a1d09bd44c2889faecb"
        },
        "native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol": {
          "sourceSHA256": "be0f45b6bb611b02ddda4bc8a3ad4eb86b7d6e37ae431a208aa0e849705b6f85",
          "astSHA256": "3f83bf4d3ab1004e641e1a92693315c66a793b6bd364fefcb85efa3dae771e15"
        }
      },
      "artifacts": {
        "hub": "70c3714dd296b30149d4483e6297770f4062729b8e46d35516cff4cf7b3c4812",
        "pool": "8cc9093e495e494f75601abff0980e99ca18c8a30f26f86a6a81b93685b77eae",
        "poseidon2Domains": "2dd69907c051cf5b7665f611d2b33c290a4d0a5056ca1acfec0dde6609a5525a",
        "hubCodec": "8656b15c5f4d37623c657a94711460bd55be51c53c172b59a64e9f83bfc458f9"
      }
    },
    "verifiers": {
      "authorization": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/authorization/authorization.sol",
          "sha256": "80bf3e4086ddc841d879d65febc501905deb923207e30c9521aedae4821afcec"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/authorization/compiled.json",
          "sha256": "568f131e2a5e53bfc97274a38d158e6cbab52604b0f710c8b065c3a39493a17b"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "8854494985d342cd1d0d6e3bb40a593fe2b4a665e7eaa6c3945abbb158cdf231",
        "program": {
          "path": ".local/proof-workers/relations/authorization/8adfa5bba156bafa5e9bef38cc51fe8932399f3f2c1520d649a39851fd6de372/compiled/943b63c0-6587-4abf-9e36-660c9661168e/program.json",
          "sha256": "84c1924f97854374b4cd1c3d6fb52f2c627f3a6722e8c628a02ea3a704547115"
        },
        "key": {
          "path": ".local/proof-workers/relations/authorization/8adfa5bba156bafa5e9bef38cc51fe8932399f3f2c1520d649a39851fd6de372/prepared/94b147d2-c52b-428a-b16a-68f4f52ec2c4/key.vk",
          "sha256": "18f7df703241b63bd4b639005e44556d54e7e6fa7da56cafb95b912e28218953"
        },
        "generation": {
          "path": ".local/proof-workers/relations/authorization/8adfa5bba156bafa5e9bef38cc51fe8932399f3f2c1520d649a39851fd6de372/prepared/94b147d2-c52b-428a-b16a-68f4f52ec2c4/manifest.json",
          "sha256": "ae4dab047791ff9797c51a63fe6a82aaf17861df1cea81a24239cc1cc696a89e"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "8adfa5bba156bafa5e9bef38cc51fe8932399f3f2c1520d649a39851fd6de372",
          "compiledManifestSHA256": "871288063c010b19b74ea67b57f7dc5ba4400d08300c443ce853ca34c7307dbd",
          "keyManifestSHA256": "ae4dab047791ff9797c51a63fe6a82aaf17861df1cea81a24239cc1cc696a89e",
          "abiSHA256": "23474f5ec7b8bd8134cb599c6423187fc8df92acdaf24461c5368fcea4ecfccd"
        }
      },
      "reservation": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/reservation/reservation.sol",
          "sha256": "7a6f04c4eb4b5b20c6c776021285c5b895c67b63956f7500125c3d494a412890"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/reservation/compiled.json",
          "sha256": "b7ebc25f6fe98da940a45541b134bb27f2ca5b5d01f0224243a9b387874192e8"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "653677c4e7c696fc6f8ccf7a3471f02f91befdbefd38d03aef2a29a47c3acbb8",
        "program": {
          "path": ".local/proof-workers/relations/reservation/09a08d3a8febd2ab844ca216551b25763df8c2bc213061672a46ec161db37a22/compiled/bd8bffc8-b963-4ef5-ab4d-769593f5cae0/program.json",
          "sha256": "3ba226da2769a0233dc3659b224a7f116a0a97f212f1799f9bbb2cd4bded8452"
        },
        "key": {
          "path": ".local/proof-workers/relations/reservation/09a08d3a8febd2ab844ca216551b25763df8c2bc213061672a46ec161db37a22/prepared/ea84e5fb-0923-4ecb-aa55-75ee3f874d02/key.vk",
          "sha256": "6107377c4a6ce98767c2de4d71a661d09aa56279cfb6d8778d76eca6ef27ea32"
        },
        "generation": {
          "path": ".local/proof-workers/relations/reservation/09a08d3a8febd2ab844ca216551b25763df8c2bc213061672a46ec161db37a22/prepared/ea84e5fb-0923-4ecb-aa55-75ee3f874d02/manifest.json",
          "sha256": "f637c6289251a9010c208827b3dcafbfca286d7ab30e7d9dca2047cf4d9d56b7"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "09a08d3a8febd2ab844ca216551b25763df8c2bc213061672a46ec161db37a22",
          "compiledManifestSHA256": "2c508f3e2bc4b38887dbad32a58d0f310185fbd32b95cfeb4110fef4e7147069",
          "keyManifestSHA256": "f637c6289251a9010c208827b3dcafbfca286d7ab30e7d9dca2047cf4d9d56b7",
          "abiSHA256": "8d2cf2c0520b2c37a6bda13d5a2a36919cb66fb5c688a2b97727c23812354450"
        }
      },
      "dependency": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/dependency/dependency.sol",
          "sha256": "992dd368453ca826a2ba09c9b6199a4dd9eefec53e71860df86652edecf72a4a"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/dependency/compiled.json",
          "sha256": "010c7cb2905bf5683097dcdd58d4b767660fd9830ee5d71625dabed8f0fcd9f1"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "ff20db489b0a61e5128e9793b201d349917ee5b02c2683e3686bca26b3e86420",
        "program": {
          "path": ".local/proof-workers/relations/dependency/bb6f2d576b8684742bd17d437b6497f9aef8b01fb97118e17da6d02e26477d70/compiled/166390b2-c3ea-4fea-bec5-82ee1e2cc7d9/program.json",
          "sha256": "e2dd2e1bc9302a6a9ce4bbda5bfb283f5d66068767a216161c925a848bb4f5f0"
        },
        "key": {
          "path": ".local/proof-workers/relations/dependency/bb6f2d576b8684742bd17d437b6497f9aef8b01fb97118e17da6d02e26477d70/prepared/bb396411-6823-48cf-91f3-5ae30522a2ad/key.vk",
          "sha256": "f78dceecf5c26c5341d918859df534c9b48cca809a0e6257fb9435754da0307d"
        },
        "generation": {
          "path": ".local/proof-workers/relations/dependency/bb6f2d576b8684742bd17d437b6497f9aef8b01fb97118e17da6d02e26477d70/prepared/bb396411-6823-48cf-91f3-5ae30522a2ad/manifest.json",
          "sha256": "c0e02a2515100edd2adf0984e41cbb0181ebf166009feb9b8cadb7018cae45de"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "bb6f2d576b8684742bd17d437b6497f9aef8b01fb97118e17da6d02e26477d70",
          "compiledManifestSHA256": "8deb6334eeca4c343a1496bf03124c90e24177426084c2bb5ba4545730c15920",
          "keyManifestSHA256": "c0e02a2515100edd2adf0984e41cbb0181ebf166009feb9b8cadb7018cae45de",
          "abiSHA256": "cfb8782c54f57cca154a6323d9678f53cd67898f29d3924020f748f6967dfc4f"
        }
      },
      "ready": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/ready/ready.sol",
          "sha256": "367241c6b96edbae341c5f8895519bb60cd8d7ec2e184a62aecdca231c4a753f"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/ready/compiled.json",
          "sha256": "fac271b1d77892ece954f432679c02c57bf07e3307ba14ce607f61d76e818479"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "4c792e6ab0a9e78d314b156914d1feac584240db611e3d3d1963d58998f0abaf",
        "program": {
          "path": ".local/proof-workers/relations/ready/133964906926e3d770f811d30b14312c73c25e4116b141ff49890b6f54289c7d/compiled/bce54408-89d7-4c02-89f8-3758038a6910/program.json",
          "sha256": "a69570f208769f3bef8b448b487a096ed83acbd7513e54e9da69b357a124b4a1"
        },
        "key": {
          "path": ".local/proof-workers/relations/ready/133964906926e3d770f811d30b14312c73c25e4116b141ff49890b6f54289c7d/prepared/b148e1d9-af59-4904-b6cf-cc40584198df/key.vk",
          "sha256": "cc2f841db89be74790e78720b2984983f5f49bc35667663f0e5e104aed2d7525"
        },
        "generation": {
          "path": ".local/proof-workers/relations/ready/133964906926e3d770f811d30b14312c73c25e4116b141ff49890b6f54289c7d/prepared/b148e1d9-af59-4904-b6cf-cc40584198df/manifest.json",
          "sha256": "69beda427de1bc32136014e727633a6de5e2dc8b3e46c1202930c64d8e4cc68b"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "133964906926e3d770f811d30b14312c73c25e4116b141ff49890b6f54289c7d",
          "compiledManifestSHA256": "271ec04f2e16edf88ef1a223920ad1ec834eb978895a982b77725deb922be30e",
          "keyManifestSHA256": "69beda427de1bc32136014e727633a6de5e2dc8b3e46c1202930c64d8e4cc68b",
          "abiSHA256": "df0496b75c81b1bf4f5b7e433e1aac0f827874dc34c09f5f81cd9c6a417f4e58"
        }
      },
      "admission": {
        "source": {
          "path": ".local/native-value-genuine-compilation/run-1/admission/admission.sol",
          "sha256": "8c109dbb517e66d361f1e3819c1725226363aee7eb4e18658dfe27591e050129"
        },
        "compiled": {
          "path": ".local/native-value-genuine-compilation/run-1/admission/compiled.json",
          "sha256": "d321db599375a72752406a63f3582b6e88f1160eea09fc57ee4f1e6ea037e0d5"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "8b02f4d1b546bb9095ec2637b7b1f587e7920627a37dfa726f21cb1698d2466a",
        "program": {
          "path": "admission-compile/public/program.json",
          "sha256": "fa23b3b8867c0418834d3acd4eb70cf10aca558434fe0a19c84f59d05e5b614c"
        },
        "key": {
          "path": "admission-prepared/evidence/key-public-20261005/key.vk",
          "sha256": "c343da4850c47cc443dd017676661fd71b9864b792b3702ef6af8f2d53609d5e"
        },
        "generation": {
          "path": "admission-prepared/evidence/key-public-20261005/key-manifest.json",
          "sha256": "36c4e838f8cdc9f7483b16057bb754f54990d9aba5ffc0ca9c90e06dee510414"
        },
        "constraints": [
          {
            "result": {
              "path": "admission-compile/layout/omnichain-flat-profile/flat-wallet/.local/proof-workers/attempts/f3912728-a488-451e-a466-dbaefd4ea47f/result.json",
              "sha256": "f57ff25df9c31ebdd46133f3266c7d57a81b4cb0ede53509195720c7c2f459a7"
            },
            "resources": {
              "path": "admission-compile/layout/omnichain-flat-profile/flat-wallet/.local/proof-workers/attempts/f3912728-a488-451e-a466-dbaefd4ea47f/resources.json",
              "sha256": "d131e5229b133d91e104ea569dad42aecd5b1f2f1ac6519db6539b35b0bbfc75"
            }
          },
          {
            "result": {
              "path": "admission-compile/layout/omnichain-flat-profile/flat-wallet/.local/proof-workers/attempts/e9dccbe1-49a5-4b68-b36c-cb5bf352ed8d/result.json",
              "sha256": "5ca479414ab0fbc77c726098e1e85064ddf663094c247e0399b8762a14ff0a61"
            },
            "resources": {
              "path": "admission-compile/layout/omnichain-flat-profile/flat-wallet/.local/proof-workers/attempts/e9dccbe1-49a5-4b68-b36c-cb5bf352ed8d/resources.json",
              "sha256": "91930d3b792277d72305e1062479b106119b01b333c204aa487851ea5c51704e"
            }
          }
        ],
        "lineage": {
          "sourceVersion": "4a6503d4b139e20e4d672ca39eb5d5f1f75497555ba6d55a7d6c424dcbb5d92e",
          "compiledManifestSHA256": "f5be21e21c153d8167b90f78cd6b546813014d7d66a20f70925fa2192140e155",
          "keyManifestSHA256": "36c4e838f8cdc9f7483b16057bb754f54990d9aba5ffc0ca9c90e06dee510414",
          "abiSHA256": "548072fa8bf66cfdc893aefca2f9145e50de445a9f491cde1a21253198e7aab0",
          "sourceClosureSHA256": "c5fdcb8b2ee13d65f1cd5e3394c96f67b66b5e09d3ec13c91981e31049e5a359"
        }
      },
      "node": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/node/node.sol",
          "sha256": "e9d3bfaef342bd1b93b159c4386d06f23eb0ea034e03802505bc50e863a985bc"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/node/compiled.json",
          "sha256": "370c6d9fd05641d99f1a37ab2e9365c8584b54fdc6c69a70bafefa0220020d05"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "4addc3b8ee9da66a066761b50ddc575abc3960d5616997d58d99a5d77a3a51c2",
        "program": {
          "path": "candidate/.local/component/compiled/29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004/program.json",
          "sha256": "6c2d09943e6b138bb67b8133f33331adf08263dc12210b2d1a62d78c56fce38e"
        },
        "key": {
          "path": "candidate/.local/component/prepared/node-component.vk",
          "sha256": "7db1eb6975fad4fda0ebac6b7e9ad3861604f4eb8d1231b9c2ff8ccf661d5fe4"
        },
        "generation": {
          "path": "candidate/.local/component/prepared/provenance.json",
          "sha256": "97fcf07956b38166a67660fca40d3fa1b8a925c70b8ba72ec8664f86048321b5"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "8bde68cc275adc32aa55c1b00ba1b729a6d870e9ee9c529752dfb39e5d86aa91",
          "compiledManifestSHA256": "29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004",
          "keyManifestSHA256": "95a561fdf1c92187407daede21b490673f572ddf5ca0337c4cf00606bef20b96",
          "abiSHA256": "ee5984b5e1a8585b06e88eb05a5b353525b177f50605f3a2212bd04c5f705676"
        }
      },
      "settlement": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/settlement/settlement.sol",
          "sha256": "e1b45ae0d92309102a56e57c77b5f316e134c7d538fe6bb4647efffd7bea5c12"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/settlement/compiled.json",
          "sha256": "f83684fd448e48dc9977080182c85527b40c9a661a78597a79d58a355d83ae2c"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "89215f43d0274bf38570c5ddb7ac0e28b43cbe1a299b46c599335a7f6aca2efa",
        "program": {
          "path": ".local/proof-workers/relations/settlement/f94b24a32eecca0a2866706198898fd8f520908efc045157613a5afefec63b2c/compiled/637abfeb-d926-4718-9a5f-f357f145d631/program.json",
          "sha256": "a72c643a8b9766847674f0b8c85f8fefb7fe97a88c77fc9f5dd2bc39e7630909"
        },
        "key": {
          "path": ".local/proof-workers/relations/settlement/f94b24a32eecca0a2866706198898fd8f520908efc045157613a5afefec63b2c/prepared/484e0c33-947f-4014-9ce5-7442005b5824/key.vk",
          "sha256": "ee31381c7e562d507c5897839decf41ecdc1d3bab287faaa1a70a187e6d6dc5e"
        },
        "generation": {
          "path": ".local/proof-workers/relations/settlement/f94b24a32eecca0a2866706198898fd8f520908efc045157613a5afefec63b2c/prepared/484e0c33-947f-4014-9ce5-7442005b5824/manifest.json",
          "sha256": "f34a1f106dfa80bd6b32e675acbc079b134907f01db00a3ca1620495a70d54cf"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "f94b24a32eecca0a2866706198898fd8f520908efc045157613a5afefec63b2c",
          "compiledManifestSHA256": "4be329743941834a1268b942552ccf6db6a7559dc01a624fb02633f2d9c92f4c",
          "keyManifestSHA256": "f34a1f106dfa80bd6b32e675acbc079b134907f01db00a3ca1620495a70d54cf",
          "abiSHA256": "fe1ab69c6e217f38fedc72f7040262998ab76d89d53ada885316e33eefe07bcc"
        }
      },
      "recovery": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/recovery/recovery.sol",
          "sha256": "ae180ac43e2d8010a9aaed13d91926320cab7c071d8f91fade93b2769886aace"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/recovery/compiled.json",
          "sha256": "8c1fcee78a66c59809af3ebf9ac2202c168c77c1f7e904cdf2e5763abbd765b9"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "8032901d2fcdbe1120e4660a8e191d845d115be96eb66868ce15d8a618a9bdb7",
        "program": {
          "path": ".local/proof-workers/relations/recovery/156f5091fd356a198343b051fda7f46efd65076ee38b95eb8acedfae9651449c/compiled/48494868-958f-43e3-b00b-fe394bb2e370/program.json",
          "sha256": "e7441efb296004bee6f697d8a9a68502372ccc50dbe58b92923a8a40bef62cc2"
        },
        "key": {
          "path": ".local/proof-workers/relations/recovery/156f5091fd356a198343b051fda7f46efd65076ee38b95eb8acedfae9651449c/prepared/65e12ca0-796b-47c4-8615-6c24cd8a8f35/key.vk",
          "sha256": "4ef5e2b6473315a24b0454943358bcc7f86c5b03d4188885b612f346954ff456"
        },
        "generation": {
          "path": ".local/proof-workers/relations/recovery/156f5091fd356a198343b051fda7f46efd65076ee38b95eb8acedfae9651449c/prepared/65e12ca0-796b-47c4-8615-6c24cd8a8f35/manifest.json",
          "sha256": "274c138851fef41904f6d1a6f394c7cc4d47ac36266cb56f705b9a4e344e89b2"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "156f5091fd356a198343b051fda7f46efd65076ee38b95eb8acedfae9651449c",
          "compiledManifestSHA256": "6c8b47589ddf56e1ea8b2cc8a3b83762463aec6595935b29c2b7694e9d285732",
          "keyManifestSHA256": "274c138851fef41904f6d1a6f394c7cc4d47ac36266cb56f705b9a4e344e89b2",
          "abiSHA256": "f329afbd7217f6e1e266cbfa9d49e6bde8d99746452d15ffcdc8be0f4a2e4ae0"
        }
      },
      "deposit_balance": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/deposit_balance/deposit_balance.sol",
          "sha256": "47ab7388f52b695fc33b8d71a3fbc0f022b8d50f8007967aa0e4b335ab71ea93"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/deposit_balance/compiled.json",
          "sha256": "c617f3127c9678647913cc85146ce79663d95a782771a0763fda44ca552b0ec6"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "78fa068f75ebc2de39261ae3675ead6478bbc04e04c06396e5b52baab75bc013",
        "program": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/compiled/deposit_balance.json",
          "sha256": "42c9dadc3194592249b5e86c047eba8969e7624669474f68a91aca6554fd9238"
        },
        "key": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.vk",
          "sha256": "e8b8b1d20c9c7618e799599ccc54dcada8043ee0bf23fd8f3c15c0a800e68767"
        },
        "generation": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.key.json",
          "sha256": "7aa7dacf33baec14b1d98bb48a0bdeb6115c1204b42bd970e87a5c8c23a8630e"
        },
        "constraints": null,
        "lineage": {
          "abiSHA256": "62a44a535ceb0638669fed99aadd5999ef931aa55edf5dbae2c65e9afda7f09d"
        }
      },
      "withdraw_balance": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_balance/withdraw_balance.sol",
          "sha256": "d1d06f9b3689f6d531b19775131cc91700772ffa0bcc5e72b083b9f7393b1824"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_balance/compiled.json",
          "sha256": "30f04b841e2733a166433117d9d5b1fcc7bd658ba81a7308bcf1417206d5f400"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "8a5d069320d10e6b6a91c807bcaf3242f3fa70105223db190d4f0e456738d0da",
        "program": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/compiled/withdraw_balance.json",
          "sha256": "99383985b10fcbd786d0d186a7bd02d139741877fe897d682dc1272c937b638b"
        },
        "key": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.vk",
          "sha256": "edb16c5329479e04b026ac4b80216291b7d830f6e0815b4d5d9297fa55fecf8a"
        },
        "generation": {
          "path": "golden/experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.key.json",
          "sha256": "b155829f4a17d17ad516074d0e0a896fdc1f6f35ef0a129bdee9f936850744da"
        },
        "constraints": null,
        "lineage": {
          "abiSHA256": "cec852177ecb380e95d71191ea891494111470c3cf4181ec7dc417a9e350617a"
        }
      },
      "withdraw": {
        "source": {
          "path": "golden/evidence/m15-notes-proof/withdraw.sol",
          "sha256": "1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/withdraw_output/compiled.json",
          "sha256": "663daedd3262ef7db4d386eac8f4a751ea41c484a8a1a89fc4f89679431b0c41"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "2ef78563fc72936632e026653454d08a699bca9b9567b54c4f8d631396b7da1a",
        "program": {
          "path": "golden/evidence/m15-notes-proof/withdraw.circuit.json",
          "sha256": "4b2ab79c9bd9bbef7a577d5f76d56ed2ad7f67641cc4e3e3b2eccf0ab24ec617"
        },
        "key": {
          "path": "golden/evidence/m15-notes-proof/withdraw.vk",
          "sha256": "92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95"
        },
        "generation": {
          "path": "golden/evidence/m15-notes-keys.json",
          "sha256": "e849a9deeaf1a17893f94c58e3b40ee1447091a639a11e726ff3ff76f77ae13a"
        },
        "constraints": null,
        "lineage": {
          "kind": "GENUINE_ORIGINAL_W39_RECORDS_ARRAY_AND_RETAINED_COMPILER",
          "originalMode": "withdraw",
          "retainedCompilerRole": "withdraw_output",
          "artifactSource": "withdraw_output.sol",
          "publicWords": 39,
          "backendPublicWords": 47,
          "publicOffset": 5,
          "keySHA256": "92251b6321b418421cff35d5db33afb98d66e1a69918c581fdde67958555aa95",
          "sourceSHA256": "1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1",
          "programSHA256": "4b2ab79c9bd9bbef7a577d5f76d56ed2ad7f67641cc4e3e3b2eccf0ab24ec617",
          "abiSHA256": "b68ae43f29bfb180086eab42bd102a0cda4ed14f25bd7fd430a40a629157201a",
          "circuitSHA256": "750c9cda832efa2f6e1c0b74bc018f3c0bcfd8d0f75ee18401a2dce23dc15cf1",
          "noirSourceSHA256": "f8284b1392cc75e7cd14f0aeaf11d94823d22f5a9c112937bf95d46cd93e6a38",
          "originalGenerationReportSHA256": "e849a9deeaf1a17893f94c58e3b40ee1447091a639a11e726ff3ff76f77ae13a",
          "originalInventorySHA256": "e2399322fc346f896f65dc431ed157034fe3e7600d47aeb684b249192d85dd0d",
          "keyHashField": "5466247639599925262433468211181303473721048473057560904411583140642862455786",
          "keyHashFieldBasis": "Exact original generated source AST and retained compiler receipt; original binary/source/circuit hashes joined to original key-generation record",
          "independentVKHashRecomputed": false,
          "newProofAcceptanceEstablished": false,
          "oldReceiptRewritten": false
        }
      },
      "deposit_intent": {
        "source": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/deposit_intent/deposit_intent.sol",
          "sha256": "219d4e0941cba964eed0a1161b9072b3463f1abeb99b7494ab4bdd89352abb8f"
        },
        "compiled": {
          "path": ".local/proof-workers/verifier-compilation/0db5cb64-67cf-47fb-9608-4036813c4bc6/deposit_intent/compiled.json",
          "sha256": "28a01c8f6a756e84677bbd6824d440b96772b78cb39994b48dc2c84bfd15ee21"
        },
        "settingsSHA256": "2b233f2f009ecad1b767611fb7df575aa9e9a2eadf95c1757c126275d5c5fa49",
        "artifactSHA256": "8140c1ee8fe955a77405a7a9986e4755e613e7f69c916254c7a50708720b729f",
        "program": {
          "path": ".local/proof-workers/relations/deposit_intent/246d95a02939b8cd97878e5ed18d7b75afda03d0127e57019f0e8e510cb4c42a/compiled/1443dad1-85c4-4b6f-b5db-486e31f8e5b8/program.json",
          "sha256": "b32223c3acd10c6e305304edd9c3ee22752217ad7dc6fed193e6de633478a8f5"
        },
        "key": {
          "path": ".local/proof-workers/relations/deposit_intent/246d95a02939b8cd97878e5ed18d7b75afda03d0127e57019f0e8e510cb4c42a/prepared/80c356a8-c02d-4b3d-9341-3b2b54e70748/key.vk",
          "sha256": "1f5ff758dec2c32cda206c210285618ec26f9b251d760798e25464150768a803"
        },
        "generation": {
          "path": ".local/proof-workers/relations/deposit_intent/246d95a02939b8cd97878e5ed18d7b75afda03d0127e57019f0e8e510cb4c42a/prepared/80c356a8-c02d-4b3d-9341-3b2b54e70748/manifest.json",
          "sha256": "60376758c0b789606894b8c90210a1401fc6a81bb8d2890465ad91c04ebf4e89"
        },
        "constraints": null,
        "lineage": {
          "sourceVersion": "246d95a02939b8cd97878e5ed18d7b75afda03d0127e57019f0e8e510cb4c42a",
          "compiledManifestSHA256": "582ad73206cedc782921524718203de125ebfdadf3e96ef600cd952a02fc07c5",
          "keyManifestSHA256": "60376758c0b789606894b8c90210a1401fc6a81bb8d2890465ad91c04ebf4e89",
          "abiSHA256": "7ab9b5f00cfed920dcba5a39e07e3d4dbcc23e05f892a3a5d4651e352bf2f439"
        }
      }
    }
  },
  "scope": {
    "localOnly": true,
    "claimsEnabled": false,
    "proofAcceptanceEstablished": false,
    "mobileNoteCustodyEstablished": false,
    "nativeGraphAcceptanceEstablished": false
  }
});
