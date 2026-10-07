// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {INativeClaimHub, INativeClaimGateway} from "./NativeClaimInterfaces.sol";

/// @notice Narrow N ownership and receipt capacity authority. The canonical
/// consumed-N map and receipt tree remain exclusively in the registered hub.
contract NativeClaimAuthority {
    error AuthorityConfiguration();
    error AuthorityDuplicateGateway();
    error AuthorityEmptySlot();
    error AuthorityDuplicatePool();
    error AuthorityInertOrReentrant();
    error AuthoritySeal();
    error AuthorityHubPin();
    error SharedInventoryUnsupported();
    error NativeAssetRelabel();
    error ReceiptReservationExists();
    error ClaimHalt();
    error ClaimReceiptCapacity();
    error ReservationZero();
    error ClaimReservationExists();
    error NAlreadyConsumed();
    error ReservationOperationJoin();
    error IngressSlotMissing();
    error ExactNOwnerRequired();
    error AcceptanceOperationJoin();
    error DischargeHasNoReceipt();
    error UnregisteredClaimGateway();
    error SealedGatewayConfiguration();

    struct Deployment {
        address hub;
        address[2] gateways;
        address[2] pools;
        bytes32[2] gatewayCodeHashes;
        bytes32[2] gatewayConfigurations;
    }
    struct Reservation {
        address gateway; bytes32 operationId; uint64 revision;
        bytes32 wireBindingCommitment; bool ingress; bool consumed;
    }
    address public hub;
    bool public isSealed;
    address[2] public gateways;
    mapping(address => address) public gatewayPool;
    mapping(address => bytes32) public gatewayCodeHash;
    mapping(address => bytes32) public gatewayConfiguration;
    mapping(bytes32 => address) public reservationOwner;
    mapping(bytes32 => Reservation) public reservations;
    mapping(address => uint32) public reservedReceiptCapacity;
    // 0 never booked, 1 outstanding, 2 converted. Retain identities forever.
    mapping(address => mapping(bytes32 => uint8)) public receiptReservation;
    mapping(address => mapping(bytes32 => bytes32)) public operationNullifier;
    uint256 private entered;
    event ReceiptReserved(address indexed gateway, bytes32 indexed intentId, address pool);
    event SignedEffectReserved(address indexed gateway, bytes32 indexed operationId,
        bytes32 indexed nullifier, uint64 revision, bytes32 wireBindingCommitment);
    event ClaimConsumed(address indexed gateway, bytes32 indexed operationId, bytes32 indexed nullifier);

    constructor(Deployment memory d) {
        if (!(d.hub != address(0) && d.gateways[0] != address(0))) revert AuthorityConfiguration();
        if (!(d.gateways[0] != d.gateways[1])) revert AuthorityDuplicateGateway();
        hub = d.hub; gateways = d.gateways;
        for (uint256 i; i < 2; ++i) {
            address gateway = d.gateways[i];
            if (gateway == address(0)) {
                if (!(d.pools[i] == address(0) && d.gatewayCodeHashes[i] == bytes32(0)
                    && d.gatewayConfigurations[i] == bytes32(0))) revert AuthorityEmptySlot();
                continue;
            }
            if (!(gateway != address(this) && gateway != d.hub && d.pools[i] != address(0)
                && d.gatewayCodeHashes[i] != bytes32(0) && d.gatewayCodeHashes[i] != keccak256("")
                && d.gatewayConfigurations[i] != bytes32(0))) revert AuthorityConfiguration();
            if (i == 1) if (!(d.pools[0] != d.pools[1])) revert AuthorityDuplicatePool();
            gatewayPool[gateway] = d.pools[i]; gatewayCodeHash[gateway] = d.gatewayCodeHashes[i];
            gatewayConfiguration[gateway] = d.gatewayConfigurations[i];
        }
    }
    modifier onlyGateway() {
        if (!(isSealed && entered == 0)) revert AuthorityInertOrReentrant();
        _requireGateway(msg.sender); entered = 1; _; entered = 0;
    }
    // Permissionless exact bootstrap. No arguments can choose or replace a pin.
    function seal() external {
        if (!(!isSealed && hub.code.length != 0)) revert AuthoritySeal();
        INativeClaimHub h = INativeClaimHub(hub);
        if (!(h.claimAuthority() == address(this))) revert AuthorityHubPin();
        for (uint256 i; i < 2; ++i) if (gateways[i] != address(0)) _requireGateway(gateways[i]);
        if (gateways[1] != address(0)) {
            INativeClaimGateway a = INativeClaimGateway(gateways[0]);
            INativeClaimGateway b = INativeClaimGateway(gateways[1]);
            if (!(a.custodyInventoryDomain() != b.custodyInventoryDomain())) revert SharedInventoryUnsupported();
            if (!(a.nativeAssetKey() != b.nativeAssetKey())) revert NativeAssetRelabel();
        }
        isSealed = true;
    }
    function reserveReceipt(bytes32 intentId) external onlyGateway {
        address pool = gatewayPool[msg.sender];
        if (!(intentId != bytes32(0) && receiptReservation[msg.sender][intentId] == 0)) revert ReceiptReservationExists();
        INativeClaimHub h = INativeClaimHub(hub);
        if (!(!h.halted() && h.revocationOverflowCount() == 0)) revert ClaimHalt();
        bytes32 domain = h.poolDomain(pool);
        if (!(domain != bytes32(0) && uint256(h.receiptCount(domain)) + reservedReceiptCapacity[pool] < 64)) revert ClaimReceiptCapacity();
        receiptReservation[msg.sender][intentId] = 1;
        ++reservedReceiptCapacity[pool];
        emit ReceiptReserved(msg.sender, intentId, pool);
    }
    function reserveSignedEffect(bytes32 operationId, bytes32 nullifier,
        uint64 revision, bytes32 wireBindingCommitment) external onlyGateway
    {
        if (!(operationId != bytes32(0) && nullifier != bytes32(0)
            && wireBindingCommitment != bytes32(0))) revert ReservationZero();
        if (!(reservationOwner[nullifier] == address(0)
            && operationNullifier[msg.sender][operationId] == bytes32(0))) revert ClaimReservationExists();
        if (!(!INativeClaimHub(hub).admissionNullifiers(nullifier))) revert NAlreadyConsumed();
        (bytes32 recordedN, uint64 recordedRevision, bytes32 recordedWire, bool ingress) =
            INativeClaimGateway(msg.sender).claimReservation(operationId);
        if (!(recordedN == nullifier && recordedRevision == revision && recordedWire == wireBindingCommitment)) revert ReservationOperationJoin();
        if (!(!ingress || receiptReservation[msg.sender][operationId] == 1)) revert IngressSlotMissing();
        reservations[nullifier] = Reservation(msg.sender, operationId, revision, wireBindingCommitment, ingress, false);
        reservationOwner[nullifier] = msg.sender;
        operationNullifier[msg.sender][operationId] = nullifier;
        emit SignedEffectReserved(msg.sender, operationId, nullifier, revision, wireBindingCommitment);
    }
    function consumeClaim(bytes32 operationId, bytes32 nullifier, bytes32 leaf, bytes32 revocationState)
        external onlyGateway
    {
        Reservation storage r = reservations[nullifier];
        if (!(r.gateway == msg.sender && r.operationId == operationId && !r.consumed)) revert ExactNOwnerRequired();
        (bytes32 acceptedN, bytes32 acceptedLeaf, bytes32 acceptedRevocation) =
            INativeClaimGateway(msg.sender).claimAcceptance(operationId);
        if (!(acceptedN == nullifier && acceptedLeaf == leaf && acceptedRevocation == revocationState)) revert AcceptanceOperationJoin();
        address pool = gatewayPool[msg.sender];
        if (r.ingress) {
            if (!(leaf != bytes32(0) && receiptReservation[msg.sender][operationId] == 1)) revert IngressSlotMissing();
            receiptReservation[msg.sender][operationId] = 2;
            --reservedReceiptCapacity[pool];
        } else if (!(leaf == bytes32(0))) revert DischargeHasNoReceipt();
        r.consumed = true;
        // Revert restores reservation and capacity if hub acceptance fails.
        INativeClaimHub(hub).acceptClaim(pool, nullifier, leaf, revocationState);
        emit ClaimConsumed(msg.sender, operationId, nullifier);
    }
    function _requireGateway(address gateway) private view {
        if (!(gatewayPool[gateway] != address(0))) revert UnregisteredClaimGateway();
        FlatVerifierSet.requireCode(gateway, gatewayCodeHash[gateway]);
        INativeClaimGateway g = INativeClaimGateway(gateway);
        if (!(g.isSealed() && g.authority() == address(this) && g.hub() == hub
            && g.pool() == gatewayPool[gateway] && g.claimDomain() != bytes32(0)
            && g.configurationCommitment() == gatewayConfiguration[gateway])) revert SealedGatewayConfiguration();
    }
}
