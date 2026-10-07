// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {FlatHubCodec} from "../FlatHubCodec.sol";

interface INativeClaimHub {
    function claimAuthority() external view returns (address);
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function poolDomain(address pool) external view returns (bytes32);
    function isRegisteredPool(address pool) external view returns (bool);
    function admissionNullifiers(bytes32 nullifier) external view returns (bool);
    function receiptCount(bytes32 domain) external view returns (uint32);
    function admissionRevocationState(bytes32 domain) external view returns (bytes32);
    function stateSequence() external view returns (uint64);
    function halted() external view returns (bool);
    function revocationOverflowCount() external view returns (uint64);
    function attester(uint8 index) external view returns (uint256 x, uint256 y, address signer);
    function verifyFinalityHealth(address pool, uint64 validFrom, uint64 validUntil,
        FlatHubCodec.QuorumSignature[3] calldata signatures) external view returns (bool);
    function acceptClaim(address pool, bytes32 nullifier, bytes32 leaf, bytes32 revocationState) external;
}
interface INativeClaimPool {
    function asset() external view returns (address);
    function assetIdentity() external view returns (bytes32);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function domainCommitment() external view returns (bytes32);
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function receiptHub() external view returns (address);
    function receiptHubCodeHash() external view returns (bytes32);
    function verifierConfiguration() external view returns (FlatVerifierSet.Configuration memory);
    function backedAmount() external view returns (uint256);
    function leafCount() external view returns (uint32);
    function spentCount() external view returns (uint32);
    function liveReservations() external view returns (uint32);
    function outputCapacity() external view returns (uint32);
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs) external payable;
}
interface INativeClaimGateway {
    function configurationCommitment() external view returns (bytes32);
    function isSealed() external view returns (bool);
    function hub() external view returns (address);
    function pool() external view returns (address);
    function authority() external view returns (address);
    function claimDomain() external view returns (bytes32);
    function custodyInventoryDomain() external view returns (bytes32);
    function nativeAssetKey() external view returns (bytes32);
    function claimReservation(bytes32 operationId) external view returns
        (bytes32 nullifier, uint64 revision, bytes32 wireBindingCommitment, bool ingress);
    function claimAcceptance(bytes32 operationId) external view returns
        (bytes32 nullifier, bytes32 leaf, bytes32 revocationState);
}
interface INativeClaimAuthority {
    function hub() external view returns (address);
    function isSealed() external view returns (bool);
    function gatewayPool(address gateway) external view returns (address);
    function gatewayConfiguration(address gateway) external view returns (bytes32);
    function reservationOwner(bytes32 nullifier) external view returns (address);
    function reservedReceiptCapacity(address pool) external view returns (uint32);
    function reserveReceipt(bytes32 intentId) external;
    function reserveSignedEffect(bytes32 operationId, bytes32 nullifier,
        uint64 revision, bytes32 wireBindingCommitment) external;
    function consumeClaim(bytes32 operationId, bytes32 nullifier, bytes32 leaf, bytes32 revocationState) external;
}
