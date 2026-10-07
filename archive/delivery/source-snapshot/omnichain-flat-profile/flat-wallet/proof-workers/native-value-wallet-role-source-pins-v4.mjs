/** V4 exact host-source data; not a circuit identity or proof receipt. Historical V2/V3 tables remain byte-exact.
 * All historical/new release and pin tables are excluded to prevent hash cycles and pinned by the outer installation manifest. */
export const NATIVE_VALUE_WALLET_ROLE_SOURCE_PINS_V4=Object.freeze([
  {
    "path": "candidate/src/component-tooling.mjs",
    "sha256": "f2e6576097e1aca87ef57d0869fe6c07c4214ee1f7a509de9e5f0d18f97dd063"
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
    "path": "golden/experiments/private-core-proof/generic-graph/witness.mjs",
    "sha256": "85d7841787e46fcf8cee6648ec95c13ff78d8b6d74f32a023363974582d4fef1"
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
    "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/approved_owner_key.nr",
    "sha256": "5f6682eacffbf1e14dc683bd0b9d23d0ee8d528577080ea9721e61d48dc6ac9d"
  },
  {
    "path": "golden/experiments/private-core-proof/generic-wrappers/lib/src/bb_proof_verification.nr",
    "sha256": "258cd5979844a2627688e6efcad07637b1e90624b3af77e0dc3e6ff45a9aa84c"
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
    "path": "integration/evm-vault-flow.mjs",
    "sha256": "078d96fcd694e7abb8732e636d5d3b9a7f5a97e634ea87653cbcddea23f376c8"
  },
  {
    "path": "integration/evm-vault-terminal-checks.mjs",
    "sha256": "2ef1e6da1cf9a327b6ec06f05096887f24b2789f24010fb7069e7877d4ade40f"
  },
  {
    "path": "integration/evm-vault-wallet-app-driver.mjs",
    "sha256": "330fdece61abff177a157d2e057fb30b4d7182b57d09b82772b3b6ab3948b414"
  },
  {
    "path": "integration/manual-wallet-acceptance-policy.mjs",
    "sha256": "a77c32b40704928ff299e686f0b83ab11517b9a41748c2a1b1891cfccbecd1cd"
  },
  {
    "path": "integration/manual-wallet-app-driver.mjs",
    "sha256": "4349111796c9629357d1ddc503656d4c565cf4b36709c2561be9cf669216441a"
  },
  {
    "path": "integration/manual-wallet-source-pins.mjs",
    "sha256": "44bf75dc8f6e37d10131f1db81c8a52c009f68051729930ebe9226cf814cb28c"
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
    "path": "integration/native-claim-graph-artifacts.mjs",
    "sha256": "b3fa5099680deb8e6a39c69bf1aed423b8d3d5e639ad1ee08272e589665fdeba"
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
    "path": "integration/native-claim-loaded-v3-policy.mjs",
    "sha256": "54d02adadccc9f8aba8e092af62e077f0efbee3b48b6ca90dc211e669d6499a4"
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
    "sha256": "1bbb44ec4515d5d9d54b52b7b1eb0d1f9ec68fdc7ecdc35de6aa325ef5b9e2e8"
  },
  {
    "path": "integration/native-ingress-v3-preflight-policy.mjs",
    "sha256": "6a62f6e72c5159498c5a6ea3a98ab782da42b33833ff45797972d00e49fa959e"
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
    "sha256": "0206c41745e4ca7d53aef2b78e30efdf80bc90d005ef1d532fbd35c76a092247"
  },
  {
    "path": "integration/native-wallet-real-evidence-v1.mjs",
    "sha256": "04d6583822232c381609a486beed82d6199927913c039ac0d4487820aab2fd8a"
  },
  {
    "path": "integration/native-wallet-real-policy-v1.mjs",
    "sha256": "f87cbbdf898ce3ac7d0bbf98e797650c141beeecbda09b42543da254a28ebe71"
  },
  {
    "path": "integration/native-wallet-real-preflight-v1.mjs",
    "sha256": "90f499753e2495289512c5935737263513f687e64fe181288d9db97273100b69"
  },
  {
    "path": "integration/native-wallet-real-source-pins-v1.mjs",
    "sha256": "8db7a71a727dba5fc87acf1a0186e35133ced038c4dc4294f1707f644391a24b"
  },
  {
    "path": "integration/owned-evm-vault-fixture.mjs",
    "sha256": "40a91498d5624c36960ec14e2ba94fce8dccce394aca8d43490107de736e3f50"
  },
  {
    "path": "integration/owned-flat-fixture.mjs",
    "sha256": "9e5db875be1eeef2ff6c5ceb50384570a43daa4857bc36d3dacd35f70b0ff342"
  },
  {
    "path": "integration/pool-generation-acceptance-policy.mjs",
    "sha256": "9826c1f991cccbe58eda59a844daf4a1d8932c3bba268d0b104d7e4b675f3197"
  },
  {
    "path": "integration/pool-generation-source-pins.mjs",
    "sha256": "c46d694b52f4c78bd6416dbf47f90c3957b27fab884f9974af49330648a9d5ee"
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
    "path": "integration/run-wrapped-wallet-fixed-acceptance-v1.mjs",
    "sha256": "b1d9cc2e875ea8d08e6ccff73ac4f5e67cd3c37d1d49d06d3ceb0036ca07b766"
  },
  {
    "path": "integration/run-wrapped-wallet-fixed-preflight-v1.mjs",
    "sha256": "5feec5c04a27207ff3ef5a21091bb737816c3fd8976f2fc9135a28a01078b607"
  },
  {
    "path": "integration/source-pins.mjs",
    "sha256": "6a1965d17b0067c8d5aa29ba760aba336ae6051ee8872e7823818a6a8eef258c"
  },
  {
    "path": "integration/task-catalog.mjs",
    "sha256": "43f0404c81fbe6961c24255a73509caec99014026cd2eb23795abd2b5b8298f7"
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
    "sha256": "ec5195b739eadbce14d1d95a55551295758bfa5ce930fda8494b30ff3a055333"
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
    "path": "proof-workers/catalog.mjs",
    "sha256": "5cfeba63766989166eeaff93e010431f74336f398b78cbad0d0e088a913acd69"
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
    "path": "proof-workers/pinned-verifier.mjs",
    "sha256": "ddf160ffb23f3e7b1b1790c436ec98734467a9ffaa2c5e2e0d4d66843c538df9"
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
    "sha256": "ddc99882668abdf735fdbaa0ccc1cc87911a16e576ca7edd1b5efa8ff3a026e0"
  },
  {
    "path": "proof-workers/scoped-proof-tools.mjs",
    "sha256": "25798d6235d4a78a6a8eb91b3725406c782cb5968dfb548ce468357c533b11a4"
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
    "sha256": "2a4710ea5f4fe921ac2d3b8b04c6f25dbdd94b10efb4b26fc7d9311838288a45"
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
    "path": "wallet-app/exact-action-capabilities.mjs",
    "sha256": "c53aed353daf6c465aa13dda91a3289c4291b9f249686a0a729c082a79b994ad"
  },
  {
    "path": "wallet-app/public-errors.mjs",
    "sha256": "9bdb4cdf913128c34a938c41175305e1e940def7229a4b3eea11738bcc2d8d66"
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
    "path": "wallet-app/public/manual-action-handoff.mjs",
    "sha256": "7830951a50bec0df0d2510f54e4ffe4be56e91992ce8f8ff686b499ad9032773"
  },
  {
    "path": "wallet-app/public/native-note-review.mjs",
    "sha256": "0e5afba78d7b3b99b74a401f49ac5a1f03c81797f7f935ae2374889b702c36e7"
  },
  {
    "path": "wallet-app/public/owner-graph-review-v1.mjs",
    "sha256": "1e3f88f8905590fa9cf02d5eb674ef1f1865b438ec0ee88a70638a2bbaa3dbd5"
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
    "sha256": "0883336bdacb75764d43304268655146db9a9c667485b9ebb1ec2c8688ffb193"
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
    "sha256": "68e6de8e005de9e2b2f93175bfbdef85b97c37d007e3b9de683a33ea26a3759d"
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
    "path": "wallet-platform/modules/api/native-claim-session.mjs",
    "sha256": "1ec7c73e52caf7eec5e00cc79e5c40ac0a82f6baf84331fe98d9a851d55d5245"
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
    "path": "wallet-platform/modules/chain-adapters/evm-native-value-health-source-v4.mjs",
    "sha256": "a430dae36d39bbb1a5797476993ed9bf0c87bbb4345992d594acb19e2fe5220b"
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
    "path": "wallet-platform/modules/chain-adapters/http-erc20-portfolio.mjs",
    "sha256": "cf752c40d5f0016fa72a732503baab7ae4977162c94848945c8614bf0aa526c9"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/http-portfolio-registry.mjs",
    "sha256": "4dca9b41909571e1ad7f73369c025a4b4cf610e581870f0fb43273f28fd1415e"
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
    "sha256": "aa386781e40dcadb00e71e9954bd99514831c121288dd2c5220733960e5a3adb"
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
    "sha256": "b3d4030dfffc3082ee52e9dd9e4900cde62e66c8704bb9773d05d9116e216329"
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
    "sha256": "9c1696246eba842ed362985745592322cdbee1f7c0222dcee4c1c73a8572ceef"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-tron-native-value-runtime.mjs",
    "sha256": "b9fb7f94655ce61a31f979883b106e86ef744ba7f06b0eb2f72b8572c5abdf73"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/owned-tron-node-driver.mjs",
    "sha256": "133635145b4d0b95fce3533adb35bd0e88f5a301f8ec08a77e66d501f4538dc7"
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
    "path": "wallet-platform/modules/chain-adapters/tron-native-transfer-observer.mjs",
    "sha256": "b4c426e258edabe598a1e3db9d26c54ebdf66f8a7d5805446bf22f9d8c9685eb"
  },
  {
    "path": "wallet-platform/modules/chain-adapters/tron-native-transfer-wire.mjs",
    "sha256": "e11f0b0fb6cbbeb2b76dcce035699f7f0970c9559ffc05d6f93962cb20bfd915"
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
    "path": "wallet-platform/modules/defi-adapters/backed-vault.mjs",
    "sha256": "93881fb037b3e4d219077ae9d8369507ac584046c5aa09ab9ef5740fe62976fa"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/generation-private-vault-exit.mjs",
    "sha256": "91850cb2150d32a2a5bbcadad3259f3633113df88f1e9c765e4ab0ede0076106"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/owned-backed-vault.mjs",
    "sha256": "611cc387da2fab8e1a79f74fe81c5712d515d7ee6d5a4f30fe1107fbfaa392e1"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/private-external-delivery.mjs",
    "sha256": "82512426b1fc616bb2aa79fdb01f9be69101e55cd4c57da66f2f28ffe5ed07c4"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/private-position-state-v2.mjs",
    "sha256": "4fe5545b34679593491b4d70113bd1b1952cceccc6621541d9b3b3dded6a138a"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/private-vault-exit.mjs",
    "sha256": "7e8648452b0fafc7554f3700dd6cf580c19900d401dd61b1c991682b9e598715"
  },
  {
    "path": "wallet-platform/modules/defi-adapters/private-vault-position.mjs",
    "sha256": "41c05fea8ae4962515c4ee75f8f35e1a263596077791f97aadf2a48ba9616e75"
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
    "sha256": "a910d2257827be01a4e1506c6d101621569d5e65f25f55109d4c4300f547f0ac"
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
    "sha256": "04cb7c161f25c531594dd497efb17bf73fe3f6d529f965e871a9c6b0eb43dccc"
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
    "path": "wallet-platform/modules/native-claims/operators.mjs",
    "sha256": "f7225faf2a6e2dc1f5b585a1258863f48d78d392ef06b03066bfed244fffd1b6"
  },
  {
    "path": "wallet-platform/modules/native-claims/owned-state.mjs",
    "sha256": "50696a5276df4a77cebd1d665e48ff945ee18a688876e21e2f55ad38c86f9027"
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
    "path": "wallet-platform/modules/ops/append-only-deployment-artifacts.mjs",
    "sha256": "c511e352edbfab914aa9aecaa9b9ffd6ce76dcf201bee947dfbbf3752b418403"
  },
  {
    "path": "wallet-platform/modules/ops/append-only-deployment-plan.mjs",
    "sha256": "67ad4bcc2141591d60eabee214b0352e29407e3cc0c2b49032151b6bfcf4b5ac"
  },
  {
    "path": "wallet-platform/modules/ops/combined-native-operators.mjs",
    "sha256": "a213f89dbd726394ccd7daf43682561336e729c904fa2408be02d6d358767779"
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
    "sha256": "c8bb8a431b2ea210ffe54ec76c6a93be6b90c6f97b697eac9b8f381380fe299f"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-private-external-router-v1.mjs",
    "sha256": "2e713c2cec6d6727cc00eda1db713a1810ef936e59d7427d3ee16e58de302913"
  },
  {
    "path": "wallet-platform/modules/ops/deploy-system.mjs",
    "sha256": "4c80f09f2199f7d91d53124929364e079cab9a481253ea446775733ba90cf559"
  },
  {
    "path": "wallet-platform/modules/ops/deployment-artifacts.mjs",
    "sha256": "d61ed8d503a3d0b4e91d83f4d4b5f76756fc7b934fdbe5eaf5e156872971848e"
  },
  {
    "path": "wallet-platform/modules/ops/deployment-plan.mjs",
    "sha256": "1b19e415e47afa0c7cdc7607f8ea4a62e1eeec9335eee3d77479a58535deb18d"
  },
  {
    "path": "wallet-platform/modules/ops/external-defi-bootstrap-recovery-v1.mjs",
    "sha256": "6e21f8fa3b61cb52f6d77d56e327991754855361669d8e37e69cf9688e163949"
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
    "sha256": "372d8a1793da62be67e9f48f3352445431eb56d357b2d21765c230a355d8fdf4"
  },
  {
    "path": "wallet-platform/modules/ops/native-operators.mjs",
    "sha256": "6485023bd69af2528ffc6b94cdbf916c26002ef8e2a151c1d88f38e57a847f9e"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-checkpoint-v4.mjs",
    "sha256": "9f2be5a3001123fd4a71de534377b1d8f31fab01bb02798f87e3a57e5a08f504"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs",
    "sha256": "aff1e949f9696074a1b61df38c5a2eceefc2a838f1eb7a48d825dd30832fef2e"
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
    "path": "wallet-platform/modules/ops/native-value-history-dispatch-v1.mjs",
    "sha256": "9202eb95d6e9e54dc74ba6f1311ab788d6666fc0598d56159a78aa72f12ca0e1"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-inventory-v4.mjs",
    "sha256": "da354a8960e97f2c39fd647639c4d13a15f5bef5c7c4788dda3a98bb81dfe38f"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-local-operator-bootstrap-v4.mjs",
    "sha256": "3159ed4b5b4ee2ec50ffe2f07ff798c308eb38f7e77bd94d3d4c49122027fc18"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-operators-v4.mjs",
    "sha256": "6eb0e3e728671431a768d75e48d598d7a8a22757a41515b4c225db329b0093cc"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-registry-v2.mjs",
    "sha256": "894a2fc9fabbe7850a25d2e8cf0a04180cd990bf4476caa4aaec5e3cf7ebc8c7"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-system-v2.mjs",
    "sha256": "5d582961af105cda6b5040e41764b758365f231ae463c84e02377e6e8923b72e"
  },
  {
    "path": "wallet-platform/modules/ops/native-value-wallet-binding-v2.mjs",
    "sha256": "0e4bc1ef5ca3ca16775fc0f8ad3b6619f0a32021c9a38e433800ddfa9c1dd2e5"
  },
  {
    "path": "wallet-platform/modules/ops/official-protocol-fixture-v3.mjs",
    "sha256": "637c404998c098013cdc5b8bda535f959904845105dcef6e4c97af617ae91f21"
  },
  {
    "path": "wallet-platform/modules/ops/operator-fact-audit.mjs",
    "sha256": "fc148e2af333abeeeae87c184ba9280eb81faf06369a604ff854374c08f757e4"
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
    "sha256": "d8493bf287d9dc3329ab7c7beed2a2dee1ea0ce0b9e8290696bf7832b3675b2d"
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
    "path": "wallet-platform/modules/paeg/native-value-execution-v2.mjs",
    "sha256": "7cfb9a5419296ed6dbf1d728b80c8f98650a9cb809aa08b5ea5fb99b334983c1"
  },
  {
    "path": "wallet-platform/modules/paeg/native-value-failure-retention.mjs",
    "sha256": "5cd022e69d60cc5a84b8c9bdc324f975d7de1f3c5ec7be5ab3b100b153b0d04e"
  },
  {
    "path": "wallet-platform/modules/paeg/native-value-graph-admission-v2.mjs",
    "sha256": "fa55c45455051eaa0dc7dd9fa2965f10778a4cf566b18555c3357dd5e1ec59dc"
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
    "sha256": "ff8c4d46853fee56f5e3675ecf25dd6882a3b70aa7f1f49713b51b766f195384"
  },
  {
    "path": "wallet-platform/modules/solvers/native-provider.mjs",
    "sha256": "db73a1f6cb5905a57dae586d12ee464f07ed2150fcccb330c40fdc9994365d73"
  },
  {
    "path": "wallet-platform/modules/solvers/native-value-provider-v2.mjs",
    "sha256": "78538de1c33b5c867d44058b3075a200aaba1d0c09b6312d36e2482b9e3e1ef6"
  }
].map(Object.freeze));
