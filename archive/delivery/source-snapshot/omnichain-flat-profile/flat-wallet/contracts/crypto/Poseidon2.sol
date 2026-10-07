// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Source-derived BN254 Poseidon2 hash, t=4/rate=3/capacity=1.
/// @dev Port of AztecProtocol/aztec-packages at
/// 49a592109ec4f18d79212b43d621891aaf36f7b6, crypto/poseidon2/{params,
/// permutation,sponge}; sponge also matches the fixed-length construction in
/// noir-lang/poseidon at e105cdd5c79c222860d53c5dfdb8fa8012b291c0.
/// See vendor/poseidon2-reference for unmodified sources, licenses and hashes.
/// This Solidity port has no inherited audit or conformance claim.
library Poseidon2 {
    uint256 internal constant MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    error NonCanonicalField(uint256 index, uint256 value);
    error InputLengthExceedsU32();

    /// @dev Rejects caller aliases >=r before absorbing any input. Length is
    /// the entire supplied message, not a header's payload-count component.
    function hash(uint256[] memory input) internal pure returns (uint256) {
        uint256 length = input.length;
        if (length > type(uint32).max) revert InputLengthExceedsU32();
        for (uint256 i = 0; i < length; ++i) {
            if (input[i] >= MODULUS) revert NonCanonicalField(i, input[i]);
        }
        uint256[4] memory state;
        state[3] = length << 64;
        uint256[256] memory constants = _roundConstants();
        uint256 offset;
        while (offset + 3 <= length) {
            state[0] = addmod(state[0], input[offset], MODULUS);
            state[1] = addmod(state[1], input[offset + 1], MODULUS);
            state[2] = addmod(state[2], input[offset + 2], MODULUS);
            _permute(state, constants);
            offset += 3;
        }
        uint256 remainder = length - offset;
        for (uint256 i = 0; i < remainder; ++i) {
            state[i] = addmod(state[i], input[offset + i], MODULUS);
        }
        // A final full block was already permuted. Empty input still receives
        // exactly one permutation. No extra full-block delimiter is appended.
        if (length == 0 || remainder != 0) _permute(state, constants);
        return state[0];
    }

    function _sbox(uint256 value) private pure returns (uint256) {
        uint256 square = mulmod(value, value, MODULUS);
        return mulmod(mulmod(square, square, MODULUS), value, MODULUS);
    }

    /// @dev Exact upstream external MDS:
    /// [5 7 1 3; 4 6 1 1; 1 3 5 7; 1 1 4 6]. Memory state mutates in place.
    function _externalMatrix(uint256[4] memory state) private pure {
        uint256 t0 = addmod(state[0], state[1], MODULUS);
        uint256 t1 = addmod(state[2], state[3], MODULUS);
        uint256 t2 = addmod(addmod(state[1], state[1], MODULUS), t1, MODULUS);
        uint256 t3 = addmod(addmod(state[3], state[3], MODULUS), t0, MODULUS);
        uint256 t4 = addmod(addmod(t1, t1, MODULUS), addmod(t1, t1, MODULUS), MODULUS);
        t4 = addmod(t4, t3, MODULUS);
        uint256 t5 = addmod(addmod(t0, t0, MODULUS), addmod(t0, t0, MODULUS), MODULUS);
        t5 = addmod(t5, t2, MODULUS);
        state[0] = addmod(t3, t5, MODULUS);
        state[1] = t5;
        state[2] = addmod(t2, t4, MODULUS);
        state[3] = t4;
    }

    function _internalMatrix(uint256[4] memory state) private pure {
        uint256 sum = addmod(addmod(state[0], state[1], MODULUS), addmod(state[2], state[3], MODULUS), MODULUS);
        // Constants are D_i-1, not D_i; sum already includes the old state[i].
        state[0] = addmod(mulmod(state[0], 0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7, MODULUS), sum, MODULUS);
        state[1] = addmod(mulmod(state[1], 0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b, MODULUS), sum, MODULUS);
        state[2] = addmod(mulmod(state[2], 0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15, MODULUS), sum, MODULUS);
        state[3] = addmod(mulmod(state[3], 0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b, MODULUS), sum, MODULUS);
    }

    function _externalRound(uint256[4] memory state, uint256[256] memory constants, uint256 round) private pure {
        for (uint256 i = 0; i < 4; ++i) {
            state[i] = _sbox(addmod(state[i], constants[round * 4 + i], MODULUS));
        }
        _externalMatrix(state);
    }

    function _permute(uint256[4] memory state, uint256[256] memory constants) private pure {
        _externalMatrix(state);
        for (uint256 round = 0; round < 4; ++round) _externalRound(state, constants, round);
        for (uint256 round = 4; round < 60; ++round) {
            state[0] = _sbox(addmod(state[0], constants[round * 4], MODULUS));
            _internalMatrix(state);
        }
        for (uint256 round = 60; round < 64; ++round) _externalRound(state, constants, round);
    }

    /// @dev Row-major [64][4] upstream constants. The three unused columns of
    /// each internal round remain explicitly zero-initialized by Solidity.
    function _roundConstants() private pure returns (uint256[256] memory constants) {
        // Round 0: external
        constants[0] = 0x19b849f69450b06848da1d39bd5e4a4302bb86744edc26238b0878e269ed23e5;
        constants[1] = 0x265ddfe127dd51bd7239347b758f0a1320eb2cc7450acc1dad47f80c8dcf34d6;
        constants[2] = 0x199750ec472f1809e0f66a545e1e51624108ac845015c2aa3dfc36bab497d8aa;
        constants[3] = 0x157ff3fe65ac7208110f06a5f74302b14d743ea25067f0ffd032f787c7f1cdf8;
        // Round 1: external
        constants[4] = 0x2e49c43c4569dd9c5fd35ac45fca33f10b15c590692f8beefe18f4896ac94902;
        constants[5] = 0x0e35fb89981890520d4aef2b6d6506c3cb2f0b6973c24fa82731345ffa2d1f1e;
        constants[6] = 0x251ad47cb15c4f1105f109ae5e944f1ba9d9e7806d667ffec6fe723002e0b996;
        constants[7] = 0x13da07dc64d428369873e97160234641f8beb56fdd05e5f3563fa39d9c22df4e;
        // Round 2: external
        constants[8] = 0x0c009b84e650e6d23dc00c7dccef7483a553939689d350cd46e7b89055fd4738;
        constants[9] = 0x011f16b1c63a854f01992e3956f42d8b04eb650c6d535eb0203dec74befdca06;
        constants[10] = 0x0ed69e5e383a688f209d9a561daa79612f3f78d0467ad45485df07093f367549;
        constants[11] = 0x04dba94a7b0ce9e221acad41472b6bbe3aec507f5eb3d33f463672264c9f789b;
        // Round 3: external
        constants[12] = 0x0a3f2637d840f3a16eb094271c9d237b6036757d4bb50bf7ce732ff1d4fa28e8;
        constants[13] = 0x259a666f129eea198f8a1c502fdb38fa39b1f075569564b6e54a485d1182323f;
        constants[14] = 0x28bf7459c9b2f4c6d8e7d06a4ee3a47f7745d4271038e5157a32fdf7ede0d6a1;
        constants[15] = 0x0a1ca941f057037526ea200f489be8d4c37c85bbcce6a2aeec91bd6941432447;
        // Round 4: internal
        constants[16] = 0x0c6f8f958be0e93053d7fd4fc54512855535ed1539f051dcb43a26fd926361cf;
        // Round 5: internal
        constants[20] = 0x123106a93cd17578d426e8128ac9d90aa9e8a00708e296e084dd57e69caaf811;
        // Round 6: internal
        constants[24] = 0x26e1ba52ad9285d97dd3ab52f8e840085e8fa83ff1e8f1877b074867cd2dee75;
        // Round 7: internal
        constants[28] = 0x1cb55cad7bd133de18a64c5c47b9c97cbe4d8b7bf9e095864471537e6a4ae2c5;
        // Round 8: internal
        constants[32] = 0x1dcd73e46acd8f8e0e2c7ce04bde7f6d2a53043d5060a41c7143f08e6e9055d0;
        // Round 9: internal
        constants[36] = 0x011003e32f6d9c66f5852f05474a4def0cda294a0eb4e9b9b12b9bb4512e5574;
        // Round 10: internal
        constants[40] = 0x2b1e809ac1d10ab29ad5f20d03a57dfebadfe5903f58bafed7c508dd2287ae8c;
        // Round 11: internal
        constants[44] = 0x2539de1785b735999fb4dac35ee17ed0ef995d05ab2fc5faeaa69ae87bcec0a5;
        // Round 12: internal
        constants[48] = 0x0c246c5a2ef8ee0126497f222b3e0a0ef4e1c3d41c86d46e43982cb11d77951d;
        // Round 13: internal
        constants[52] = 0x192089c4974f68e95408148f7c0632edbb09e6a6ad1a1c2f3f0305f5d03b527b;
        // Round 14: internal
        constants[56] = 0x1eae0ad8ab68b2f06a0ee36eeb0d0c058529097d91096b756d8fdc2fb5a60d85;
        // Round 15: internal
        constants[60] = 0x179190e5d0e22179e46f8282872abc88db6e2fdc0dee99e69768bd98c5d06bfb;
        // Round 16: internal
        constants[64] = 0x29bb9e2c9076732576e9a81c7ac4b83214528f7db00f31bf6cafe794a9b3cd1c;
        // Round 17: internal
        constants[68] = 0x225d394e42207599403efd0c2464a90d52652645882aac35b10e590e6e691e08;
        // Round 18: internal
        constants[72] = 0x064760623c25c8cf753d238055b444532be13557451c087de09efd454b23fd59;
        // Round 19: internal
        constants[76] = 0x10ba3a0e01df92e87f301c4b716d8a394d67f4bf42a75c10922910a78f6b5b87;
        // Round 20: internal
        constants[80] = 0x0e070bf53f8451b24f9c6e96b0c2a801cb511bc0c242eb9d361b77693f21471c;
        // Round 21: internal
        constants[84] = 0x1b94cd61b051b04dd39755ff93821a73ccd6cb11d2491d8aa7f921014de252fb;
        // Round 22: internal
        constants[88] = 0x1d7cb39bafb8c744e148787a2e70230f9d4e917d5713bb050487b5aa7d74070b;
        // Round 23: internal
        constants[92] = 0x2ec93189bd1ab4f69117d0fe980c80ff8785c2961829f701bb74ac1f303b17db;
        // Round 24: internal
        constants[96] = 0x2db366bfdd36d277a692bb825b86275beac404a19ae07a9082ea46bd83517926;
        // Round 25: internal
        constants[100] = 0x062100eb485db06269655cf186a68532985275428450359adc99cec6960711b8;
        // Round 26: internal
        constants[104] = 0x0761d33c66614aaa570e7f1e8244ca1120243f92fa59e4f900c567bf41f5a59b;
        // Round 27: internal
        constants[108] = 0x20fc411a114d13992c2705aa034e3f315d78608a0f7de4ccf7a72e494855ad0d;
        // Round 28: internal
        constants[112] = 0x25b5c004a4bdfcb5add9ec4e9ab219ba102c67e8b3effb5fc3a30f317250bc5a;
        // Round 29: internal
        constants[116] = 0x23b1822d278ed632a494e58f6df6f5ed038b186d8474155ad87e7dff62b37f4b;
        // Round 30: internal
        constants[120] = 0x22734b4c5c3f9493606c4ba9012499bf0f14d13bfcfcccaa16102a29cc2f69e0;
        // Round 31: internal
        constants[124] = 0x26c0c8fe09eb30b7e27a74dc33492347e5bdff409aa3610254413d3fad795ce5;
        // Round 32: internal
        constants[128] = 0x070dd0ccb6bd7bbae88eac03fa1fbb26196be3083a809829bbd626df348ccad9;
        // Round 33: internal
        constants[132] = 0x12b6595bdb329b6fb043ba78bb28c3bec2c0a6de46d8c5ad6067c4ebfd4250da;
        // Round 34: internal
        constants[136] = 0x248d97d7f76283d63bec30e7a5876c11c06fca9b275c671c5e33d95bb7e8d729;
        // Round 35: internal
        constants[140] = 0x1a306d439d463b0816fc6fd64cc939318b45eb759ddde4aa106d15d9bd9baaaa;
        // Round 36: internal
        constants[144] = 0x28a8f8372e3c38daced7c00421cb4621f4f1b54ddc27821b0d62d3d6ec7c56cf;
        // Round 37: internal
        constants[148] = 0x0094975717f9a8a8bb35152f24d43294071ce320c829f388bc852183e1e2ce7e;
        // Round 38: internal
        constants[152] = 0x04d5ee4c3aa78f7d80fde60d716480d3593f74d4f653ae83f4103246db2e8d65;
        // Round 39: internal
        constants[156] = 0x2a6cf5e9aa03d4336349ad6fb8ed2269c7bef54b8822cc76d08495c12efde187;
        // Round 40: internal
        constants[160] = 0x2304d31eaab960ba9274da43e19ddeb7f792180808fd6e43baae48d7efcba3f3;
        // Round 41: internal
        constants[164] = 0x03fd9ac865a4b2a6d5e7009785817249bff08a7e0726fcb4e1c11d39d199f0b0;
        // Round 42: internal
        constants[168] = 0x00b7258ded52bbda2248404d55ee5044798afc3a209193073f7954d4d63b0b64;
        // Round 43: internal
        constants[172] = 0x159f81ada0771799ec38fca2d4bf65ebb13d3a74f3298db36272c5ca65e92d9a;
        // Round 44: internal
        constants[176] = 0x1ef90e67437fbc8550237a75bc28e3bb9000130ea25f0c5471e144cf4264431f;
        // Round 45: internal
        constants[180] = 0x1e65f838515e5ff0196b49aa41a2d2568df739bc176b08ec95a79ed82932e30d;
        // Round 46: internal
        constants[184] = 0x2b1b045def3a166cec6ce768d079ba74b18c844e570e1f826575c1068c94c33f;
        // Round 47: internal
        constants[188] = 0x0832e5753ceb0ff6402543b1109229c165dc2d73bef715e3f1c6e07c168bb173;
        // Round 48: internal
        constants[192] = 0x02f614e9cedfb3dc6b762ae0a37d41bab1b841c2e8b6451bc5a8e3c390b6ad16;
        // Round 49: internal
        constants[196] = 0x0e2427d38bd46a60dd640b8e362cad967370ebb777bedff40f6a0be27e7ed705;
        // Round 50: internal
        constants[200] = 0x0493630b7c670b6deb7c84d414e7ce79049f0ec098c3c7c50768bbe29214a53a;
        // Round 51: internal
        constants[204] = 0x22ead100e8e482674decdab17066c5a26bb1515355d5461a3dc06cc85327cea9;
        // Round 52: internal
        constants[208] = 0x25b3e56e655b42cdaae2626ed2554d48583f1ae35626d04de5084e0b6d2a6f16;
        // Round 53: internal
        constants[212] = 0x1e32752ada8836ef5837a6cde8ff13dbb599c336349e4c584b4fdc0a0cf6f9d0;
        // Round 54: internal
        constants[216] = 0x2fa2a871c15a387cc50f68f6f3c3455b23c00995f05078f672a9864074d412e5;
        // Round 55: internal
        constants[220] = 0x2f569b8a9a4424c9278e1db7311e889f54ccbf10661bab7fcd18e7c7a7d83505;
        // Round 56: internal
        constants[224] = 0x044cb455110a8fdd531ade530234c518a7df93f7332ffd2144165374b246b43d;
        // Round 57: internal
        constants[228] = 0x227808de93906d5d420246157f2e42b191fe8c90adfe118178ddc723a5319025;
        // Round 58: internal
        constants[232] = 0x02fcca2934e046bc623adead873579865d03781ae090ad4a8579d2e7a6800355;
        // Round 59: internal
        constants[236] = 0x0ef915f0ac120b876abccceb344a1d36bad3f3c5ab91a8ddcbec2e060d8befac;
        // Round 60: external
        constants[240] = 0x1797130f4b7a3e1777eb757bc6f287f6ab0fb85f6be63b09f3b16ef2b1405d38;
        constants[241] = 0x0a76225dc04170ae3306c85abab59e608c7f497c20156d4d36c668555decc6e5;
        constants[242] = 0x1fffb9ec1992d66ba1e77a7b93209af6f8fa76d48acb664796174b5326a31a5c;
        constants[243] = 0x25721c4fc15a3f2853b57c338fa538d85f8fbba6c6b9c6090611889b797b9c5f;
        // Round 61: external
        constants[244] = 0x0c817fd42d5f7a41215e3d07ba197216adb4c3790705da95eb63b982bfcaf75a;
        constants[245] = 0x13abe3f5239915d39f7e13c2c24970b6df8cf86ce00a22002bc15866e52b5a96;
        constants[246] = 0x2106feea546224ea12ef7f39987a46c85c1bc3dc29bdbd7a92cd60acb4d391ce;
        constants[247] = 0x21ca859468a746b6aaa79474a37dab49f1ca5a28c748bc7157e1b3345bb0f959;
        // Round 62: external
        constants[248] = 0x05ccd6255c1e6f0c5cf1f0df934194c62911d14d0321662a8f1a48999e34185b;
        constants[249] = 0x0f0e34a64b70a626e464d846674c4c8816c4fb267fe44fe6ea28678cb09490a4;
        constants[250] = 0x0558531a4e25470c6157794ca36d0e9647dbfcfe350d64838f5b1a8a2de0d4bf;
        constants[251] = 0x09d3dca9173ed2faceea125157683d18924cadad3f655a60b72f5864961f1455;
        // Round 63: external
        constants[252] = 0x0328cbd54e8c0913493f866ed03d218bf23f92d68aaec48617d4c722e5bd4335;
        constants[253] = 0x2bf07216e2aff0a223a487b1a7094e07e79e7bcc9798c648ee3347dd5329d34b;
        constants[254] = 0x1daf345a58006b736499c583cb76c316d6f78ed6a6dffc82111e11a63fe412df;
        constants[255] = 0x176563472456aaa746b694c60e1823611ef39039b2edc7ff391e6f2293d2c404;
    }
}
