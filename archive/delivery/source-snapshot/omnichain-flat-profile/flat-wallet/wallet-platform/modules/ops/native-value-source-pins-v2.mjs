/** Fixed exact new-branch host/circuit pins after additive profile isolation.
 * Historical shared helpers retain original bytes; no key or activation claim. */
export const NATIVE_VALUE_HOST_SOURCE_PINS = Object.freeze([
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
    "sha256": "05478f09774d78917f2459214f5e6517b810bad1ba863726c86e72884c19fd0c"
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
    "path": "golden/src/paeg/generic-account-journal.mjs",
    "sha256": "c1cd6952312134b63a9b1504215802e9be3a308d557d909d7e61db8317ea0fbc"
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
    "sha256": "92a222aa81c59eee72c534760dd91d5d30bdad62f1cd6468bb692ecb52b97f57"
  },
  {
    "path": "golden/src/paeg/native-recipient-process.mjs",
    "sha256": "f51d392e4cbf4fffac9b96097041e840e384f998c86710215a4b3b8dd2aaaaab"
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
    "sha256": "ef8d3da6af7714e88479216fa5f1390e2fea75cc0dba849e6a7dbf37615cd12c"
  },
  {
    "path": "golden/src/paeg/proof-resource-policy.mjs",
    "sha256": "b4b69565488debb5bb819866b62e0a5f5a536792c83b19c3231f592a7a160680"
  },
  {
    "path": "golden/src/paeg/proof-worker.mjs",
    "sha256": "4cb50f068a2484b0532b7cb4bdfe56753448d4339dfea03a62924fec2a4aa22f"
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
    "path": "golden/src/private-wallet-note-encoding.mjs",
    "sha256": "1353c7e58c594fc4ec0a8f6721b6b5b14683c9caad60dba6d6277fa3e7c0ef4e"
  },
  {
    "path": "golden/src/vault.mjs",
    "sha256": "d288d08ec58ade40aa352bd4579df1a6d3c2ac6395c29d08c0b46b5d6db5da8e"
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
    "sha256": "ce51083d69e857077b1d61f90d6aeb7daf98f05e8477156a8563214d54ebee97"
  },
  {
    "path": "mobile-core/flat-owner-manual-binding.mjs",
    "sha256": "2229ef86bb776eeddc850e21212d20f9ad4ee7d082c4aae7574551ffeb2b07d5"
  },
  {
    "path": "mobile-core/flat-owner-native-claim-observer.mjs",
    "sha256": "dd286d222cdb8e4a8c4d96d9f8bd73d3e8342122c9c2e605ca640948b57ed156"
  },
  {
    "path": "mobile-core/flat-owner-observer.mjs",
    "sha256": "b1fad2f70681774fac42bbc32d3b789a3e8ff49dcd4dfa9ae7d59041d1078d77"
  },
  {
    "path": "mobile-core/flat-owner-process.mjs",
    "sha256": "3b22e4a6d94df04f5e79a78ad118b3f48b95d784ed5604453381b0b500137865"
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
    "path": "proof-workers/native-ingress-v3-profile.mjs",
    "sha256": "ac52e01b7cc62eb08f625c3f2bcf1698648d81e93773578697ada491cb57e580"
  },
  {
    "path": "proof-workers/native-value-v2-profile.mjs",
    "sha256": "0f6ca54e8402ae804a6c68f9bd0441aac001432bf3d32d7e46878a41553b3e36"
  },
  {
    "path": "proof-workers/pinned-verifier.mjs",
    "sha256": "ddf160ffb23f3e7b1b1790c436ec98734467a9ffaa2c5e2e0d4d66843c538df9"
  },
  {
    "path": "proof-workers/role-client.mjs",
    "sha256": "f92fd9c26bc9f4feeedcabd936831913c270812e9913790574d2f49b57f6a8f5"
  },
  {
    "path": "proof-workers/tooling.mjs",
    "sha256": "200240e992228e270a528d3c389f6a65b046ccf405544017cdc054a2b2b63ff5"
  },
  {
    "path": "proof-workers/trusted-jobs.mjs",
    "sha256": "255e77da34eb0555dcec17427fcd4637cfb088acfcb503eb0c55d79db4633adc"
  },
  {
    "path": "wallet-platform/modules/api/flat-account-session.mjs",
    "sha256": "c15601bcc60c8b9d44b3483f69e8dd39d4b02423b31242c098f9742c5328c50a"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/evm-code-hash.mjs",
    "sha256": "32096b64b8f480ff1106539c563b6bb8bd5512ec0a0d72dab16f179f8a4dd453"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/evm-dispatch-gate.mjs",
    "sha256": "6f5ed448e2d11768e73d91d4bc3887a0532d4931bb804e5fd4c7e706e8841561"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/evm-facts-binding.mjs",
    "sha256": "231fc53f298f7886c15a5e4e9b5976bcee2d12d6cb439109258ac770bb0cfe6f"
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
    "path": "wallet-platform/modules/chain-adapters/generic-native-value-v2.mjs",
    "sha256": "89d88be565acc622d9d50bd5dad0f3b389d0951b9d3fe0a6f9081431958e53ba"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/local-evm-ownership.mjs",
    "sha256": "67bb773444a72a9da621728780fe7d3cc5c4fd761e62d32b19f0067566d9a991"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-dispatch-gate.mjs",
    "sha256": "ab2ca615246129fc9c83a2cd7f9269d014733b27495d03e1ad0ec8fbdd1c25df"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-facts-peer.mjs",
    "sha256": "409128063b8a55a744880ac8e402bdfdc18d07e91a69cd142b0f0d9ad27792f8"
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
    "sha256": "7d22cbf4e359ec9faf7ecdcea86b4dd589802ba7ce94ab6d99c3b6d4f9f05a93"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-value-dispatch-journal-v2.mjs",
    "sha256": "9066bf6be7a62e2d110893819acfa768504f8409bea9612b99c615f54559bcf7"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-value-dispatch-owner-v2.mjs",
    "sha256": "2216031511ac49badb6aeec18e2fb70c6d2605ce6dbc23b641b32c7e05dd0eb4"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-value-evm-dispatch-gate.mjs",
    "sha256": "9ce0229dbe9dd49c4f9c6bbc4d87bd806d27280c68be6ae0f5597c2d37ffbd0c"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-value-health-source-v3.mjs",
    "sha256": "b60ca105e367475f2d0073f3acfd23ca5a68bcb9ecb545aab70b82a85aecb70c"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/native-value-health-v2.mjs",
    "sha256": "a8612fd83ae98de7c44ad6e95ee23a3ba85fa81d1b340f3aa5e67d517d1e98bc"
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
    "sha256": "79dbace3414f486aa37ea0b33ab2d9256d86560341b60fb20fddd581688a9ea0"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-evm-native-value-profile.mjs",
    "sha256": "bcb265001ef738349ee11838964aa74b16a67cbfd6bd3f5b95903e7ce107b690"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-evm-read-batch.mjs",
    "sha256": "8a25f0ceade132db3e943cccb20f956cbd7f2a07009d1b396aebc26ec4f20e80"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs",
    "sha256": "dd5d1f086d1a74a18d55a2f1f7e3b2f546fc931b4f7f574dad242b57eaab0081"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-native-custody.mjs",
    "sha256": "2aa8042150c3ad1f5dfe63f2bd8bbece010fe97dd12e718f74d59cf135c338b0"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-pool-asset.mjs",
    "sha256": "d6fc9f053e3f6d3f9d20094a258fc297f9c402c896c3065c2e6321c848502650"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs",
    "sha256": "19daa3bd8c6f308e6dad44d2d4e7d5e1bb3d22498f89855c829b7ccf45ce1cf2"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs",
    "sha256": "5c3bf5689c4ab224ac7c23218fc573765094c0164f633301bdc72382d4bd3a5b"
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
    "path": "wallet-platform/modules/chain-adapters/portfolio-registry.mjs",
    "sha256": "32e65f86f0ae71b957ddfad593c1490b622ed490e7cd894df8fbbed7ec1f949e"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/tron-native-graph-profile.mjs",
    "sha256": "930cf201c846b31cefaa6a2f33b56a3e18f6333b68adc28919bf8d399dfd54ba"
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
    "path": "wallet-platform/modules/chain-adapters/tron-observation-adapter.mjs",
    "sha256": "e13412f7dd117f02d6b623df6a1a99e98512fd09d2b26dd2bf62732c2c996c65"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/backed-vault.mjs",
    "sha256": "93881fb037b3e4d219077ae9d8369507ac584046c5aa09ab9ef5740fe62976fa"
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
    "sha256": "28d24799b720f6e1aaab19a5ee52cbf4f454cf753bdc8b0614e36e98584eaffc"
  },
  {
    "path": "wallet-platform/modules/native-claims/evm-dispatch-gate.mjs",
    "sha256": "8bbb29461cb30c4fb0bdf9ac4702aeef1426f0263be0dc2a5537987f0d4a4f5d"
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
    "path": "wallet-platform/modules/native-claims/operators.mjs",
    "sha256": "86430f54577bacd2312c4e964959d0aa462f17c3886e31299123c5688a13daee"
  },
  {
    "path": "wallet-platform/modules/native-claims/owned-state.mjs",
    "sha256": "50696a5276df4a77cebd1d665e48ff945ee18a688876e21e2f55ad38c86f9027"
  },
  {
    "path": "wallet-platform/modules/native-claims/permits.mjs",
    "sha256": "1243cc676b26fc40e5698a266fcc7a3fa8b23a2e9012091b9663dcd6820104f5"
  },
  {
    "path": "wallet-platform/modules/native-claims/record-store-process.mjs",
    "sha256": "9f295a5d8bbdbfc9fdd36a110eef2d731702d17c936a0b5729fdf077e0810a6e"
  },
  {
    "path": "wallet-platform/modules/native-claims/reservation-facts-gate.mjs",
    "sha256": "007a4e178fc5e9e4589ed7d07499d4435854b76635efa1923e12585df5f7e311"
  },
  {
    "path": "wallet-platform/modules/native-claims/segmented-record-store.mjs",
    "sha256": "c1cd9339255c64dcef3d819d66bb57d83a8cacff3047ca01fe5817866b912068"
  },
  {
    "path": "wallet-platform/modules/native-claims/vault-session.mjs",
    "sha256": "849da8ce6aa7aa3232ee3a6ef70b422c8ab8fe94ac138c9055f231680876d520"
  },
  {
    "path": "wallet-platform/modules/ops/combined-native-operators.mjs",
    "sha256": "1c1fdf9ace6656999e527f07540060085b054ed0834f6fb358fb4dd297e47524"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-backed-assets.mjs",
    "sha256": "314f7c7d63396bd07e0cd240953723615b9170350b9fc3f9f88caa4130e28efa"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-evm-vault-router.mjs",
    "sha256": "740c39d5251972214804c302fc6c1048380830fe28ad3504c2d0d879dc25dd23"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-native-claims.mjs",
    "sha256": "0dfa03bd36e612650d741417d0419383b87b44faf562c66ca3232edfec0a366b"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-system.mjs",
    "sha256": "4c2ff61fd9ae6bd7eecf8903862e5693b661a554acc15ffbe9b1a15dcfb64631"
  },
  {
    "path": "wallet-platform/modules/ops/deployment-artifacts.mjs",
    "sha256": "e278cbfea82db5053897b9ecd0ae33af75e484b33af8e71c9c36c488b05ed5fc"
  },
  {
    "path": "wallet-platform/modules/ops/deployment-plan.mjs",
    "sha256": "1b19e415e47afa0c7cdc7607f8ea4a62e1eeec9335eee3d77479a58535deb18d"
  },
  {
    "path": "wallet-platform/modules/ops/native-claim-artifacts.mjs",
    "sha256": "b1ba6f571d7f15ebb9162792476de14a62cc2798e89eac3376f9af7cb9457633"
  },
  {
    "path": "wallet-platform/modules/ops/native-claim-deployment-plan.mjs",
    "sha256": "c988e036094764f1237bc41218663f57476f0b5f47bde330c049ca65126b0c1d"
  },
  {
    "path": "wallet-platform/modules/ops/native-claim-ingress-v3-artifacts.mjs",
    "sha256": "17f84bc87e3c97ff2d7a8100558375a718cde01b23540e24994f9c35a166c730"
  },
  {
    "path": "wallet-platform/modules/ops/native-operators.mjs",
    "sha256": "296bbf891859ddb5383a781cc74e763172fe07d945934c7ad3d7f94962cc8c1c"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs",
    "sha256": "39337feaf2f959ba47deea6a2f6e3cb1988a79fa8f6ee5818cfc548f765604ff"
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
    "path": "wallet-platform/modules/ops/native-value-inventory-v3.mjs",
    "sha256": "7815b1e4c4b5af0bad4745de139052645df9fba9bea366a1d1019f47b6c2a633"
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
    "path": "wallet-platform/modules/ops/native-value-registry-v2.mjs",
    "sha256": "894a2fc9fabbe7850a25d2e8cf0a04180cd990bf4476caa4aaec5e3cf7ebc8c7"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-system-v2.mjs",
    "sha256": "30c03884c580898351ca6a73206c9e3e641416b541cc1d424099558602f20e3d"
  },
  {
    "path": "wallet-platform/modules/ops/operator-fact-audit.mjs",
    "sha256": "fc148e2af333abeeeae87c184ba9280eb81faf06369a604ff854374c08f757e4"
  },
  {
    "path": "wallet-platform/modules/ops/owned-native-operator-reads.mjs",
    "sha256": "668af249ab0e317f178a9257833ce19fe7e7411d38d2ac17c28f02563374739b"
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
    "path": "wallet-platform/modules/paeg/deposit-intent.mjs",
    "sha256": "3c6d2b8c23a33dc8ac081d4e6d3ee6642236eeb5bb0bd492e7c94f50beaf2a07"
  },
  {
    "path": "wallet-platform/modules/paeg/flat-pure-math-cache.mjs",
    "sha256": "dce739e5a4dbfdbff41a112aefec7f0e23044233c9bc2ca60f37acd0636b3792"
  },
  {
    "path": "wallet-platform/modules/paeg/flat-system-state.mjs",
    "sha256": "9a95a54ca051f2d6545ecb907c2adf0a72b1c2f7cc43b676fa46cea294ead916"
  },
  {
    "path": "wallet-platform/modules/paeg/native-value-current-gate-v2.mjs",
    "sha256": "1ef6caba35239f8623831ae2aa03ae02eab4cbee14c4161200dd1b3812297553"
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
    "path": "wallet-platform/modules/paeg/readiness-inputs.mjs",
    "sha256": "2ee707e64d1e8f805e930ab8ae0506e59e01d5cf5e39d7f5b2aa803438f65241"
  },
  {
    "path": "wallet-platform/modules/paeg/statements.mjs",
    "sha256": "d494115f0b5b4148b57f8715e415daf6251908941c2bbc62a7fe49c0cd17e8df"
  },
  {
    "path": "wallet-platform/modules/solvers/native-value-provider-v2.mjs",
    "sha256": "78538de1c33b5c867d44058b3075a200aaba1d0c09b6312d36e2482b9e3e1ef6"
  }
].map(Object.freeze));
