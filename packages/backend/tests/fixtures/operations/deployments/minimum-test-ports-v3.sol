// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {FlatVerifierSet} from "FlatVerifierSet.sol";

interface IMinimumTestPoolV3 { function domainCommitment() external view returns(bytes32); }

/// Explicit permissive TEST verifier, never a proof or a production release.
contract MinimumTestVerifierV3 {
    function verify(bytes calldata, bytes32[] calldata) external pure returns(bool) { return true; }
}
/// Explicit TEST hub ports for amount/exit predicates; no original authority.
contract MinimumTestHubV3 {
    bytes32 public immutable hubDomain = bytes32(uint256(2));
    bytes32 public immutable registryCommitment = bytes32(uint256(3));
    bytes32 public immutable verifierSetCommitment;
    address public immutable poseidon2Domains;
    bytes32 public immutable poseidon2DomainsCodeHash;
    address public immutable hubCodec;
    bytes32 public immutable hubCodecCodeHash;
    bytes32 public immutable ledgerNamespace = bytes32(uint256(2));
    uint256 public reserved;
    constructor(FlatVerifierSet.Configuration memory configuration) {
        verifierSetCommitment=FlatVerifierSet.commitment(configuration);
        poseidon2Domains=configuration.poseidon2Domains;
        poseidon2DomainsCodeHash=configuration.poseidon2DomainsCodeHash;
        hubCodec=configuration.hubCodec;
        hubCodecCodeHash=configuration.hubCodecCodeHash;
    }
    function isPinnedPool(address) external pure returns(bool) { return true; }
    function isRegisteredPool(address) external pure returns(bool) { return true; }
    function poolDomain(address pool) external view returns(bytes32) { return IMinimumTestPoolV3(pool).domainCommitment(); }
    function bookTagCapacity() external { reserved+=4; }
    function releaseTagCapacity() external { reserved-=4; }
}
