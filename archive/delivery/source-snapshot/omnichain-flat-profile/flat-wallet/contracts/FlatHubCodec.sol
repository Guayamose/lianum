// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IFlatHubProofVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice Linked stateless encoders and signature predicates for the flat hub.
/// Every input is data, never a storage reference. These helpers cannot mutate
/// a ledger, choose trusted attesters/verifiers, or authenticate a caller
/// snapshot. The hub supplies its stored identities and pins this runtime.
library FlatHubCodec {
    uint256 private constant SIGNER_COUNT = 4;
    uint256 private constant QUORUM = 3;
    string private constant PROFILE = "LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2";
    string private constant FLAT_PROFILE = "LIANUM_PAEG_P2_V1";
    uint256 private constant SECP_P =
        0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f;
    uint256 private constant SECP_N =
        0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
    uint256 private constant SECP_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 private constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    struct QuorumSignature { uint8 signerIndex; uint8 v; bytes32 r; bytes32 s; }

    struct Snapshot {
        address pool;
        bytes32 scope;
        bytes32 policy;
        bytes32 assetIdentity;
        bytes32 poolRoot;
        bytes32 poolSpentDigest;
        uint32 poolSpentCount;
        uint64 poolStateSequence;
        bytes32 receiptRoot;
        uint32 receiptCount;
        bytes32 spentTagDigest;
        uint32 spentTagCount;
        uint64 spentTagSequence;
        bytes32 revokedDigest;
        uint32 revokedCount;
        uint64 revocationSequence;
        uint64 hubStateSequence;
        uint64 registryEpoch;
        bool halt;
        uint64 timestamp;
    }

    // Exact ordered health fields after the two fixed ASCII parts. Widths,
    // H4 tags and field order match the first linked-math source revision.
    struct Health {
        address pool;
        bytes32 domain;
        bytes32 hubDomain;
        bytes32 registryCommitment;
        bytes32 evidenceState;
        bytes32 receiptRoot;
        uint32 receiptCount;
        bytes32 spentTagDigest;
        uint32 spentTagCount;
        uint64 spentTagSequence;
        bytes32 revokedDigest;
        uint32 revokedCount;
        uint64 revocationSequence;
        uint64 stateSequence;
        bytes32 revocationOverflowDigest;
        uint64 revocationOverflowCount;
        bool halted;
        uint64 validFrom;
        uint64 validUntil;
    }

    struct AdmissionStatement {
        bytes32 domain;
        bytes32 authorizationRoot;
        bytes32 checkpoint;
        bytes32 readinessEvidenceState;
        bytes32 acceptedCheckpointRoot;
        bytes32 admissionRevocationState;
        bytes32 receiptLeaf;
        bytes32 nullifier;
        uint64 admissionFrom;
        uint64 admissionUntil;
    }

    struct VerifierPin { address verifier; bytes32 codeHash; }
    struct Proof { bytes proof; bytes32[] inputs; }

    /// @dev The consuming hub MUST supply these three pins from its immutable
    /// constructor configuration in P/R/I order. A direct call to this stateless
    /// helper chooses no ledger authority and grants no deployment capability.
    function verifyAdmissionBundle(VerifierPin[3] memory pins, Proof[3] memory proofs)
        public view returns (AdmissionStatement memory statement)
    {
        statement = decodeAdmission(proofs[0].inputs, proofs[1].inputs, proofs[2].inputs);
        require(_verifyPinned(pins[0], proofs[0], 42), "DEPENDENCY_PROOF");
        require(_verifyPinned(pins[1], proofs[1], 50), "READINESS_PROOF");
        require(_verifyPinned(pins[2], proofs[2], 84), "ADMISSION_PROOF");
    }

    function _verifyPinned(VerifierPin memory pin, Proof memory proof, uint256 width)
        private view returns (bool)
    {
        require(proof.inputs.length == width, "PUBLIC_INPUT_LENGTH");
        require(pin.codeHash != bytes32(0) && pin.codeHash != keccak256(""), "CONFIG_CODE_HASH");
        require(pin.verifier != address(0) && pin.verifier.code.length != 0
            && pin.verifier.codehash == pin.codeHash, "PINNED_CODE_MISMATCH");
        // Preserve the typed external ABI, including canonical bool decoding,
        // short-return failure and revert propagation. No catch/host flag exists.
        return IFlatHubProofVerifier(pin.verifier).verify(proof.proof, proof.inputs);
    }

    /// @dev Exact P42/R50/I84 syntax and equality predicates only. This does
    /// not authenticate roots, currentness, authorization, native facts or proofs.
    function decodeAdmission(bytes32[] memory p, bytes32[] memory r, bytes32[] memory inputs)
        public pure returns (AdmissionStatement memory statement)
    {
        require(p.length == 42 && r.length == 50 && inputs.length == 84, "PUBLIC_INPUT_LENGTH");
        for (uint256 i = 0; i < 40; ++i) require(p[i] == r[i] && r[i] == inputs[i], "READINESS_JOIN_MISMATCH");
        for (uint256 i = 40; i < 48; ++i) require(r[i] == inputs[i], "READINESS_COMMITMENT_MISMATCH");
        statement.domain = _fieldDigest(inputs, 0);
        statement.authorizationRoot = _fieldDigest(inputs, 8);
        statement.checkpoint = _digest(inputs, 16);
        statement.readinessEvidenceState = _fieldDigest(inputs, 24);
        _fieldDigest(inputs, 32); // J remains canonical although opaque here.
        _fieldDigest(inputs, 40); // L remains canonical although opaque here.
        statement.acceptedCheckpointRoot = _digest(inputs, 48);
        statement.admissionRevocationState = _fieldDigest(inputs, 56);
        statement.receiptLeaf = _fieldDigest(inputs, 64);
        statement.nullifier = _digest(inputs, 72);
        uint64 readyFrom = _u64(inputs[80]);
        uint64 readyUntil = _u64(inputs[81]);
        require(readyFrom < readyUntil, "INVALID_READINESS_WINDOW");
        require(_u64(p[40]) == readyFrom && _u64(r[48]) == readyFrom, "READY_FROM_MISMATCH");
        require(_u64(p[41]) == readyUntil && _u64(r[49]) == readyUntil, "READY_UNTIL_MISMATCH");
        statement.admissionFrom = _u64(inputs[82]);
        statement.admissionUntil = _u64(inputs[83]);
    }

    function hashSnapshot(bytes32 hubDomain, bytes32 registryCommitment, Snapshot memory snapshot) public pure returns (bytes32) {
        bytes memory message = bytes.concat(
            _part(bytes("LIANUM/PAEG/checkpoint/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.pool)),
            _part(abi.encodePacked(snapshot.scope)),
            _part(abi.encodePacked(snapshot.policy)),
            _part(abi.encodePacked(snapshot.assetIdentity)),
            _part(abi.encodePacked(snapshot.poolRoot)),
            _part(abi.encodePacked(snapshot.poolSpentDigest)),
            _part(abi.encodePacked(snapshot.poolSpentCount)),
            _part(abi.encodePacked(snapshot.poolStateSequence))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.receiptRoot)),
            _part(abi.encodePacked(snapshot.receiptCount)),
            _part(abi.encodePacked(snapshot.spentTagDigest)),
            _part(abi.encodePacked(snapshot.spentTagCount)),
            _part(abi.encodePacked(snapshot.spentTagSequence))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.revokedDigest)),
            _part(abi.encodePacked(snapshot.revokedCount)),
            _part(abi.encodePacked(snapshot.revocationSequence)),
            _part(abi.encodePacked(snapshot.hubStateSequence)),
            _part(abi.encodePacked(snapshot.registryEpoch)),
            _part(abi.encodePacked(uint8(snapshot.halt ? 1 : 0))),
            _part(abi.encodePacked(snapshot.timestamp))
        );
        return sha256(message);
    }

    function revocationMessage(
        bytes32 hubDomain, bytes32 registryCommitment, bytes32 gid,
        uint64 expectedSequence, bytes32 reasonCommitment, uint64 authorizationExpiry
    ) public pure returns (bytes32) {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/revoke-receipt/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(gid)),
            _part(abi.encodePacked(expectedSequence)),
            _part(abi.encodePacked(reasonCommitment)),
            _part(abi.encodePacked(authorizationExpiry))
        ));
    }

    function checkpointAuthorizationDigest(
        bytes32 hubDomain,
        bytes32 registryCommitment,
        address pool,
        uint64 expectedPoolSequence,
        uint64 expectedHubStateSequence,
        bytes32 requestId,
        uint64 validUntil
    ) public pure returns (bytes32) {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/checkpoint-authorize/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(pool)),
            _part(abi.encodePacked(expectedPoolSequence)),
            _part(abi.encodePacked(expectedHubStateSequence)),
            _part(abi.encodePacked(requestId)),
            _part(abi.encodePacked(validUntil))
        ));
    }

    function registryCommitment(bytes32 hubDomain, uint64 registryEpoch, bytes32 rulesRoot,
        uint256[4] memory attesterX, uint256[4] memory attesterY) public pure returns (bytes32) {
        bytes memory message = bytes.concat(
            _part(bytes("LIANUM/native-registry/secp256k1/2")),
            _part(bytes(PROFILE)),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryEpoch)),
            _part(abi.encodePacked(rulesRoot))
        );
        for (uint256 i = 0; i < SIGNER_COUNT; ++i) {
            message = bytes.concat(message,
                _part(abi.encodePacked(attesterX[i])), _part(abi.encodePacked(attesterY[i])));
        }
        return sha256(message);
    }

    function assertQuorum(bytes32 message, QuorumSignature[3] memory signatures,
        address[4] memory attesterAddresses) public pure {
        for (uint256 i = 0; i < QUORUM; ++i) {
            QuorumSignature memory signature = signatures[i];
            require(signature.signerIndex < SIGNER_COUNT, "SIGNER_INDEX");
            if (i != 0) require(signatures[i - 1].signerIndex < signature.signerIndex, "SIGNER_ORDER");
            require(signature.v == 27 || signature.v == 28, "SIGNATURE_V");
            require(uint256(signature.r) > 0 && uint256(signature.r) < SECP_N, "SIGNATURE_R");
            require(uint256(signature.s) > 0 && uint256(signature.s) <= SECP_HALF_N, "SIGNATURE_LOW_S");
            address recovered = ecrecover(message, signature.v, signature.r, signature.s);
            require(recovered != address(0)
                && recovered == attesterAddresses[signature.signerIndex], "QUORUM_SIGNATURE");
        }
    }

    function finalityHealthDigest(Health memory health) public pure returns (bytes32) {
        bytes memory message = bytes.concat(
            _part(bytes("LIANUM/PAEG/flat-native-health/1")), _part(bytes(FLAT_PROFILE)),
            _part(abi.encodePacked(health.pool)), _part(abi.encodePacked(health.domain)),
            _part(abi.encodePacked(health.hubDomain)), _part(abi.encodePacked(health.registryCommitment)),
            _part(abi.encodePacked(health.evidenceState))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(health.receiptRoot)), _part(abi.encodePacked(health.receiptCount)),
            _part(abi.encodePacked(health.spentTagDigest)), _part(abi.encodePacked(health.spentTagCount)),
            _part(abi.encodePacked(health.spentTagSequence))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(health.revokedDigest)), _part(abi.encodePacked(health.revokedCount)),
            _part(abi.encodePacked(health.revocationSequence)), _part(abi.encodePacked(health.stateSequence)),
            _part(abi.encodePacked(health.revocationOverflowDigest)), _part(abi.encodePacked(health.revocationOverflowCount))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(uint8(health.halted ? 1 : 0))),
            _part(abi.encodePacked(health.validFrom)), _part(abi.encodePacked(health.validUntil))
        );
        return sha256(message);
    }

    function attesterAddress(uint256 x, uint256 y) public pure returns (address signer) {
        require(x < SECP_P && y < SECP_P, "ATTESTER_COORDINATE_RANGE");
        require(mulmod(y, y, SECP_P)
            == addmod(mulmod(mulmod(x, x, SECP_P), x, SECP_P), 7, SECP_P), "ATTESTER_NOT_ON_CURVE");
        signer = address(uint160(uint256(keccak256(abi.encodePacked(x, y)))));
        require(signer != address(0), "ATTESTER_ZERO_ADDRESS");
    }

    function revocationOverflowDigest(bytes32 hubDomain, bytes32 registryCommitment,
        bytes32 previousDigest, bytes32 gid, bytes32 reasonCommitment,
        uint64 revocationSequence, uint64 expiry) public pure returns (bytes32)
    {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/revocation-overflow/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(previousDigest)),
            _part(abi.encodePacked(gid)),
            _part(abi.encodePacked(reasonCommitment)),
            _part(abi.encodePacked(revocationSequence)),
            _part(abi.encodePacked(expiry))
        ));
    }

    function _part(bytes memory value) private pure returns (bytes memory) {
        require(value.length <= type(uint32).max, "H4_PART_TOO_LONG");
        return abi.encodePacked(uint32(value.length), value);
    }

    function _u32(bytes32 value) private pure returns (uint32) {
        require(uint256(value) <= type(uint32).max, "PUBLIC_U32");
        return uint32(uint256(value));
    }

    function _u64(bytes32 value) private pure returns (uint64) {
        require(uint256(value) <= type(uint64).max, "PUBLIC_U64");
        return uint64(uint256(value));
    }

    function _digest(bytes32[] memory inputs, uint256 offset) private pure returns (bytes32) {
        uint256 result;
        for (uint256 i = 0; i < 8; ++i) result = (result << 32) | _u32(inputs[offset + i]);
        return bytes32(result);
    }

    function _fieldDigest(bytes32[] memory inputs, uint256 offset) private pure returns (bytes32) {
        bytes32 value = _digest(inputs, offset);
        require(uint256(value) < FIELD_MODULUS, "PUBLIC_NONCANONICAL_FIELD");
        return value;
    }
}
