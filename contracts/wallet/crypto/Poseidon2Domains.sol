// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Poseidon2} from "./Poseidon2.sol";

/// @notice Only the frozen onchain schemas for bounded authorization/receipt
/// trees and state commitments. Encodings do not prove a domain's authority.
library Poseidon2Domains {
    uint256 internal constant PROFILE = 0x4c49414e554d5f504145475f50325f5631; // ASCII LIANUM_PAEG_P2_V1
    uint256 internal constant MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    error InvalidDomain();
    error NonCanonicalField();
    error EmptyCommitment();
    error InvalidTreeKind();
    error InvalidTreeLevel();
    error InvalidCount();
    error InvalidSequence();
    error InvalidRevokedEntry(uint256 index);
    error DuplicateRevokedEntry(uint256 first, uint256 second);

    struct EvidenceState {
        bytes32 hubDomain;
        bytes32 registryCommitment;
        uint256 receiptRoot;
        uint256 receiptCount;
        uint256 revokedDigest;
        uint256 revokedCount;
        uint256 revocationSequence;
    }

    function _field(uint256 value) private pure {
        if (value >= MODULUS) revert NonCanonicalField();
    }

    function _domain(uint256 value) private pure {
        if (value == 0 || value >= MODULUS) revert InvalidDomain();
    }

    function _kind(uint256 treeKind) private pure returns (uint256 depth) {
        if (treeKind > 2) revert InvalidTreeKind();
        return treeKind == 1 ? 4 : 6;
    }

    function _count(uint256 count) private pure {
        // This bounded schema is stricter than the u32 representation.
        if (count > 64) revert InvalidCount();
    }

    function _sequence(uint256 sequence) private pure {
        if (sequence > type(uint64).max) revert InvalidSequence();
    }

    function _header(uint256 purpose, uint256 count) private pure returns (uint256[] memory input) {
        input = new uint256[](count + 4);
        input[0] = PROFILE;
        input[1] = 1;
        input[2] = purpose;
        input[3] = count;
    }

    function _b32(uint256[] memory input, uint256 offset, bytes32 value) private pure {
        // Exact two-limb big-endian encoding; never reduce a bytes32 modulo r.
        input[offset] = uint256(value) >> 128;
        input[offset + 1] = uint256(value) & type(uint128).max;
    }

    /// @dev Purpose 1; seven raw bytes32 identities, whole length 18.
    /// Nonzero identities match the frozen host domain codec. This only binds
    /// the supplied configuration; the consuming hub must establish authority.
    function domainCommitment(
        bytes32 scope,
        bytes32 policy,
        bytes32 asset,
        bytes32 hub,
        bytes32 registry,
        bytes32 verifierSet,
        bytes32 ledgerNamespace
    ) public pure returns (uint256) {
        if (scope == bytes32(0) || policy == bytes32(0) || asset == bytes32(0)
            || hub == bytes32(0) || registry == bytes32(0) || verifierSet == bytes32(0)
            || ledgerNamespace == bytes32(0)) revert EmptyCommitment();
        uint256[] memory input = _header(1, 14);
        _b32(input, 4, scope); _b32(input, 6, policy); _b32(input, 8, asset);
        _b32(input, 10, hub); _b32(input, 12, registry); _b32(input, 14, verifierSet);
        _b32(input, 16, ledgerNamespace);
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 6; payload [D,0x32,hub-hi128,hub-lo128,count,64 B32 entries],
    /// whole length 137. Preserve original order, including every zero tail.
    function revokedDigest(uint256 domain, bytes32 hubDomain, bytes32[64] memory entries, uint256 count)
        public pure returns (uint256)
    {
        _domain(domain); _count(count);
        uint256[] memory input = _header(6, 133);
        input[4] = domain; input[5] = 0x32;
        _b32(input, 6, hubDomain);
        input[8] = count;
        for (uint256 i = 0; i < 64; ++i) {
            if (i < count) {
                if (entries[i] == bytes32(0)) revert InvalidRevokedEntry(i);
                for (uint256 j = 0; j < i; ++j) {
                    if (entries[i] == entries[j]) revert DuplicateRevokedEntry(j, i);
                }
            } else if (entries[i] != bytes32(0)) {
                revert InvalidRevokedEntry(i);
            }
            _b32(input, 9 + 2 * i, entries[i]);
        }
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 7; payload [D,E], whole length 6.
    function authorizationLeaf(uint256 domain, uint256 envelope) public pure returns (uint256) {
        _domain(domain); _field(envelope);
        if (envelope == 0) revert EmptyCommitment();
        uint256[] memory input = _header(7, 2);
        input[4] = domain; input[5] = envelope;
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 8; payload [D,2,SHA-CM-hi128,SHA-CM-lo128], whole length 8.
    function receiptLeaf(uint256 domain, bytes32 shaReceiptCommitment) public pure returns (uint256) {
        _domain(domain);
        if (shaReceiptCommitment == bytes32(0)) revert EmptyCommitment();
        uint256[] memory input = _header(8, 4);
        input[4] = domain; input[5] = 2;
        _b32(input, 6, shaReceiptCommitment);
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 9; payload [D,kind], whole length 6. Zero is not this leaf.
    function emptyLeaf(uint256 domain, uint256 treeKind) public pure returns (uint256) {
        _domain(domain); _kind(treeKind);
        uint256[] memory input = _header(9, 2);
        input[4] = domain; input[5] = treeKind;
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 10; payload [D,kind,parentLevel,left,right], whole length 9.
    function nodeHash(uint256 domain, uint256 treeKind, uint256 level, uint256 left, uint256 right)
        public pure returns (uint256)
    {
        _domain(domain); _field(left); _field(right);
        uint256 depth = _kind(treeKind);
        if (level == 0 || level > depth) revert InvalidTreeLevel();
        uint256[] memory input = _header(10, 5);
        input[4] = domain; input[5] = treeKind; input[6] = level;
        input[7] = left; input[8] = right;
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 5; whole length 14. Domain configuration and currentness
    /// must be checked by the consuming hub; this helper only encodes them.
    function evidenceState(uint256 domain, EvidenceState memory state) public pure returns (uint256) {
        _domain(domain); _field(state.receiptRoot); _field(state.revokedDigest);
        _count(state.receiptCount); _count(state.revokedCount); _sequence(state.revocationSequence);
        uint256[] memory input = _header(5, 10);
        input[4] = domain;
        _b32(input, 5, state.hubDomain);
        _b32(input, 7, state.registryCommitment);
        input[9] = state.receiptRoot; input[10] = state.receiptCount;
        input[11] = state.revokedDigest; input[12] = state.revokedCount;
        input[13] = state.revocationSequence;
        return Poseidon2.hash(input);
    }

    /// @dev Purpose 18; payload [D,revokedDigest,count,sequence], whole length 8.
    function admissionRevocationState(uint256 domain, uint256 revokedDigest, uint256 count, uint256 sequence)
        public pure returns (uint256)
    {
        _domain(domain); _field(revokedDigest); _count(count); _sequence(sequence);
        uint256[] memory input = _header(18, 4);
        input[4] = domain; input[5] = revokedDigest; input[6] = count; input[7] = sequence;
        return Poseidon2.hash(input);
    }
}
