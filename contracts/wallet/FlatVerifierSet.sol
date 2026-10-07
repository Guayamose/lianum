// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Poseidon2Domains} from "./crypto/Poseidon2Domains.sol";
import {FlatHubCodec} from "./FlatHubCodec.sol";

interface IFlatProofVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice Constructor-pinned verifier identities and the complete Domain codec.
/// Hashes identify a verifier configuration; they do not certify its lineage.
library FlatVerifierSet {
    uint256 internal constant COUNT = 12;
    uint256 internal constant U = 0;
    uint256 internal constant S = 1;
    uint256 internal constant P = 2;
    uint256 internal constant R = 3;
    uint256 internal constant I = 4;
    uint256 internal constant N = 5;
    uint256 internal constant T = 6;
    uint256 internal constant F = 7;
    uint256 internal constant DEPOSIT_BALANCE = 8;
    uint256 internal constant WITHDRAW_BALANCE = 9;
    uint256 internal constant WITHDRAW_OUTPUT = 10;
    uint256 internal constant DEPOSIT_INTENT = 11;
    uint256 internal constant FIELD_MODULUS =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    struct Pin {
        address verifier;
        bytes32 codeHash;
    }

    // Exact order: U16, S58, P42, R50, I84, N32, T138, F41, D26,
    // W39-balance, W39-output, D27 absolute deposit intent. Hub and both pools
    // commit the same configuration. Earlier eleven-role deployments stay immutable.
    struct Configuration {
        Pin[12] pins;
        address poseidon2Domains;
        bytes32 poseidon2DomainsCodeHash;
        address hubCodec;
        bytes32 hubCodecCodeHash;
    }
    struct Proof { bytes proof; bytes32[] inputs; }

    function width(uint256 role) internal pure returns (uint32) {
        require(role < COUNT, "VERIFIER_ROLE");
        uint32[12] memory widths = [uint32(16), 58, 42, 50, 84, 32, 138, 41, 26, 39, 39, 27];
        return widths[role];
    }

    function requireCode(address target, bytes32 expected) internal view {
        require(expected != bytes32(0) && expected != keccak256(""), "CONFIG_CODE_HASH");
        require(target != address(0) && target.code.length != 0 && target.codehash == expected,
            "PINNED_CODE_MISMATCH");
    }

    function validate(Configuration memory configuration) internal view {
        // The Solidity link target is part of the deployed runtime. A matching
        // caller-supplied hash for some OTHER library address is insufficient.
        require(configuration.poseidon2Domains == address(Poseidon2Domains), "MATH_LIBRARY_LINK_MISMATCH");
        requireCode(configuration.poseidon2Domains, configuration.poseidon2DomainsCodeHash);
        require(configuration.hubCodec == address(FlatHubCodec), "HUB_CODEC_LINK_MISMATCH");
        requireCode(configuration.hubCodec, configuration.hubCodecCodeHash);
        for (uint256 i = 0; i < COUNT; ++i) {
            requireCode(configuration.pins[i].verifier, configuration.pins[i].codeHash);
        }
    }

    /// @dev H4(v4 tag, profile, (role:u8,address:20,runtimeHash:32,width:u32)*12,
    /// (libraryName,linkedAddress:20,linkedRuntimeHash:32)*2), ordered P2 then codec.
    /// Every component has its own u32BE byte length, including the two tags.
    function commitment(Configuration memory configuration) internal pure returns (bytes32) {
        bytes memory message = bytes.concat(
            part(bytes("LIANUM/PAEG/flat-verifier-set/4")), part(bytes("LIANUM_PAEG_P2_V1"))
        );
        for (uint256 i = 0; i < COUNT; ++i) {
            message = bytes.concat(message,
                part(abi.encodePacked(uint8(i))),
                part(abi.encodePacked(configuration.pins[i].verifier)),
                part(abi.encodePacked(configuration.pins[i].codeHash)),
                part(abi.encodePacked(width(i)))
            );
        }
        message = bytes.concat(message,
            part(bytes("Poseidon2Domains")),
            part(abi.encodePacked(configuration.poseidon2Domains)),
            part(abi.encodePacked(configuration.poseidon2DomainsCodeHash))
        );
        message = bytes.concat(message,
            part(bytes("FlatHubCodec")),
            part(abi.encodePacked(configuration.hubCodec)),
            part(abi.encodePacked(configuration.hubCodecCodeHash))
        );
        return sha256(message);
    }

    function verify(Configuration storage configuration, uint256 role,
        bytes calldata proof, bytes32[] calldata inputs) internal view returns (bool)
    {
        require(inputs.length == width(role), "PUBLIC_INPUT_LENGTH");
        Pin storage pin = configuration.pins[role];
        requireCode(pin.verifier, pin.codeHash);
        return IFlatProofVerifier(pin.verifier).verify(proof, inputs);
    }

    /// @dev Purpose 1, payload14/full18. Order is scope, policy, assetIdentity,
    /// hubDomain, registryCommitment, verifierSetCommitment, ledgerNamespace.
    /// All B32 components retain both u128 limbs; none is reduced modulo Fr.
    function domainCommitment(bytes32[7] memory components) internal pure returns (bytes32) {
        bytes32 result = bytes32(Poseidon2Domains.domainCommitment(
            components[0], components[1], components[2], components[3],
            components[4], components[5], components[6]
        ));
        require(result != bytes32(0), "ZERO_DOMAIN");
        return result;
    }

    function canonical(bytes32 value) internal pure returns (bytes32) {
        require(uint256(value) < FIELD_MODULUS, "PUBLIC_NONCANONICAL_FIELD");
        return value;
    }

    function part(bytes memory value) internal pure returns (bytes memory) {
        require(value.length <= type(uint32).max, "H4_PART_TOO_LONG");
        return abi.encodePacked(uint32(value.length), value);
    }
}
