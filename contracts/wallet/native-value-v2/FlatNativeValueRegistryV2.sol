// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {FlatHubCodec} from "../FlatHubCodec.sol";
/// @notice New semantic registry; not the append-only pool registrar V2.
/// Internal framing is inlined into a new hub runtime. Existing FlatHubCodec,
/// all legacy registry deployments and every ledger remain unchanged.
library FlatNativeValueRegistryV2 {
    string internal constant SCHEMA = "LIANUM_NATIVE_ADAPTER_REGISTRY_V2";
    bytes32 internal constant SEMANTIC_ID = sha256("LIANUM_NATIVE_ADAPTER_ENVELOPE_V2");
    function commitment(bytes32 hubDomain, uint64 epoch, bytes32 profilesRoot,
        uint256[4] memory keysX, uint256[4] memory keysY) internal pure returns (bytes32) {
        require(profilesRoot != bytes32(0), "EMPTY_NATIVE_VALUE_PROFILES");
        bytes32 quorumCommitment = FlatHubCodec.registryCommitment(hubDomain, epoch, profilesRoot, keysX, keysY);
        return sha256(bytes.concat(
            part(bytes("LIANUM/native-adapter-registry/2")), part(bytes(SCHEMA)),
            part(abi.encodePacked(SEMANTIC_ID)), part(abi.encodePacked(hubDomain)),
            part(abi.encodePacked(epoch)), part(abi.encodePacked(quorumCommitment)),
            part(abi.encodePacked(profilesRoot))
        ));
    }
    function part(bytes memory value) private pure returns (bytes memory) {
        return abi.encodePacked(uint32(value.length), value);
    }
}
