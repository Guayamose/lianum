// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Poseidon2} from "./Poseidon2.sol";
import {Poseidon2Domains} from "./Poseidon2Domains.sol";

/// @notice Local conformance harness only. No wallet state or authority.
contract Poseidon2Conformance {
    function hash(uint256[] memory input) external pure returns (uint256) {
        return Poseidon2.hash(input);
    }

    function domainCommitment(bytes32 scope, bytes32 policy, bytes32 asset, bytes32 hub,
        bytes32 registry, bytes32 verifierSet, bytes32 ledgerNamespace) external pure returns (uint256)
    {
        return Poseidon2Domains.domainCommitment(scope, policy, asset, hub, registry, verifierSet, ledgerNamespace);
    }

    function revokedDigest(uint256 domain, bytes32 hub, bytes32[64] memory entries, uint256 count)
        external pure returns (uint256)
    {
        return Poseidon2Domains.revokedDigest(domain, hub, entries, count);
    }

    function authorizationLeaf(uint256 domain, uint256 envelope) external pure returns (uint256) {
        return Poseidon2Domains.authorizationLeaf(domain, envelope);
    }

    function receiptLeaf(uint256 domain, bytes32 shaCommitment) external pure returns (uint256) {
        return Poseidon2Domains.receiptLeaf(domain, shaCommitment);
    }

    function emptyLeaf(uint256 domain, uint256 kind) external pure returns (uint256) {
        return Poseidon2Domains.emptyLeaf(domain, kind);
    }

    function nodeHash(uint256 domain, uint256 kind, uint256 level, uint256 left, uint256 right)
        external pure returns (uint256)
    {
        return Poseidon2Domains.nodeHash(domain, kind, level, left, right);
    }

    function evidenceState(uint256 domain, Poseidon2Domains.EvidenceState memory state)
        external pure returns (uint256)
    {
        return Poseidon2Domains.evidenceState(domain, state);
    }

    function admissionRevocationState(uint256 domain, uint256 digest, uint256 count, uint256 sequence)
        external pure returns (uint256)
    {
        return Poseidon2Domains.admissionRevocationState(domain, digest, count, sequence);
    }
}
