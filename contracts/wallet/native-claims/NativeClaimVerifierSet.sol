// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet, IFlatProofVerifier} from "../FlatVerifierSet.sol";

/// @notice Separate CI51/CO42 pins. Provenance commitments identify audited artifacts;
/// nonzero commitments alone do not establish genuine verifier lineage.
library NativeClaimVerifierSet {
    error ClaimVerifierRole();
    error ClaimVerifierDuplicate();
    error ClaimProvenance();
    error ClaimPublicInputLength();

    uint8 internal constant CI51 = 0;
    uint8 internal constant CO42 = 1;
    struct Pin {
        address verifier; bytes32 codeHash;
        bytes32 sourceCommitment; bytes32 keyCommitment;
    }
    struct Configuration { Pin[2] pins; }
    function width(uint256 role) internal pure returns (uint32) {
        if (!(role < 2)) revert ClaimVerifierRole();
        return role == CI51 ? 51 : 42;
    }
    function validate(Configuration memory configuration) internal view {
        if (!(configuration.pins[0].verifier != configuration.pins[1].verifier)) revert ClaimVerifierDuplicate();
        for (uint256 i; i < 2; ++i) {
            Pin memory pin = configuration.pins[i];
            FlatVerifierSet.requireCode(pin.verifier, pin.codeHash);
            if (!(pin.sourceCommitment != bytes32(0) && pin.keyCommitment != bytes32(0))) revert ClaimProvenance();
        }
    }
    function commitment(Configuration memory configuration) internal pure returns (bytes32) {
        bytes memory frame = bytes.concat(
            FlatVerifierSet.part(bytes("LIANUM/PAEG/native-claim-verifier-set/1")),
            FlatVerifierSet.part(bytes("LIANUM_PAEG_P2_V1")));
        for (uint8 i; i < 2; ++i) {
            Pin memory pin = configuration.pins[i];
            frame = bytes.concat(frame,
                FlatVerifierSet.part(abi.encodePacked(i)),
                FlatVerifierSet.part(abi.encodePacked(pin.verifier)),
                FlatVerifierSet.part(abi.encodePacked(pin.codeHash)),
                FlatVerifierSet.part(abi.encodePacked(width(i))),
                FlatVerifierSet.part(abi.encodePacked(pin.sourceCommitment)),
                FlatVerifierSet.part(abi.encodePacked(pin.keyCommitment)));
        }
        return sha256(frame);
    }
    function verify(Configuration storage configuration, uint8 role,
        bytes calldata proof, bytes32[] calldata inputs) internal view returns (bool)
    {
        if (!(inputs.length == width(role))) revert ClaimPublicInputLength();
        Pin storage pin = configuration.pins[role];
        FlatVerifierSet.requireCode(pin.verifier, pin.codeHash);
        return IFlatProofVerifier(pin.verifier).verify(proof, inputs);
    }
}
