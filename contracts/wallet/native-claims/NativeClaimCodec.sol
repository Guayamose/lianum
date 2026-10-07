// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {NativeClaimTypes as T} from "./NativeClaimTypes.sol";

/// @notice Stateless linked codec. Pins, currentness and all ledger authority belong
/// to the gateway. No arbitrary execution target or storage reference is accepted.
library NativeClaimCodec {
    error D27Width();
    error D27Zero();
    error D27Window();
    error Ci51Width();
    error Ci51Zero();
    error Ci51Window();
    error Co42Width();
    error Co42Zero();
    error Co42Window();
    error TicketKind();
    error DestinationSalt();
    error NativeFamily();
    error P2WpkhRoute();
    error SolRoute();
    error ZeroEndpoint();
    error SignedWireSalt();
    error ClaimPublicU64();
    error ClaimPublicU32();

    function _p(bytes memory value) private pure returns (bytes memory) { return FlatVerifierSet.part(value); }
    function claimDomain(T.Configuration memory c) public pure returns (bytes32) {
        bytes memory frame = bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-domain/1")),
            _p(abi.encodePacked(c.evmChainId)), _p(abi.encodePacked(c.evmGenesis)),
            _p(abi.encodePacked(c.gateway)), _p(abi.encodePacked(c.gatewayCodeHash)),
            _p(abi.encodePacked(c.wrapper)), _p(abi.encodePacked(c.wrapperCodeHash)));
        frame = bytes.concat(frame,
            _p(abi.encodePacked(c.pool)), _p(abi.encodePacked(c.poolCodeHash)),
            _p(abi.encodePacked(c.poolDomain)), _p(abi.encodePacked(c.scope)),
            _p(abi.encodePacked(c.policy)), _p(abi.encodePacked(c.wrapperAssetIdentity)));
        frame = bytes.concat(frame,
            _p(abi.encodePacked(c.hub)), _p(abi.encodePacked(c.hubCodeHash)),
            _p(abi.encodePacked(c.hubDomain)), _p(abi.encodePacked(c.ledgerNamespace)),
            _p(abi.encodePacked(c.registryCommitment)), _p(abi.encodePacked(c.claimVerifierSetCommitment)));
        frame = bytes.concat(frame,
            _p(abi.encodePacked(c.nativeFamily)), _p(abi.encodePacked(c.nativeGenesis)),
            _p(abi.encodePacked(c.nativeAsset)), _p(abi.encodePacked(c.nativeRuleCommitment)),
            _p(abi.encodePacked(c.escrowEndpointCommitment)), _p(abi.encodePacked(c.custodyInventoryDomain)),
            _p(abi.encodePacked(c.refundMaxFee)));
        return sha256(frame);
    }
    function decodeOwner(bytes32[] memory inputs) public pure returns (T.OwnerIntent memory s) {
        if (!(inputs.length == 27)) revert D27Width();
        s.scope = _digest(inputs, 0); s.policy = _digest(inputs, 8);
        s.validFrom = _u64(inputs[16]); s.validUntil = _u64(inputs[17]);
        s.amount = _u64(inputs[18]); s.output = _digest(inputs, 19);
        if (!(s.amount > 0 && s.output != bytes32(0))) revert D27Zero();
        if (!(s.validFrom < s.validUntil)) revert D27Window();
    }
    function decodeIngress(bytes32[] memory inputs) public pure returns (T.Ingress memory s) {
        if (!(inputs.length == 51)) revert Ci51Width();
        s.claimDomain = _digest(inputs, 0); s.output = _digest(inputs, 8);
        s.nullifier = _digest(inputs, 16); s.refundDestination = _digest(inputs, 24);
        s.revocationState = FlatVerifierSet.canonical(_digest(inputs, 32));
        s.receiptLeaf = FlatVerifierSet.canonical(_digest(inputs, 40));
        s.amount = _u64(inputs[48]); s.evidenceFrom = _u64(inputs[49]); s.evidenceUntil = _u64(inputs[50]);
        if (!(s.claimDomain != bytes32(0) && s.output != bytes32(0) && s.nullifier != bytes32(0)
            && s.refundDestination != bytes32(0) && s.receiptLeaf != bytes32(0) && s.amount != 0)) revert Ci51Zero();
        if (!(s.evidenceFrom < s.evidenceUntil)) revert Ci51Window();
    }
    function decodeDischarge(bytes32[] memory inputs) public pure returns (T.Discharge memory s) {
        if (!(inputs.length == 42)) revert Co42Width();
        s.claimDomain = _digest(inputs, 0); s.ticketId = _digest(inputs, 8);
        s.ticketCommitment = _digest(inputs, 16); s.nullifier = _digest(inputs, 24);
        s.revocationState = FlatVerifierSet.canonical(_digest(inputs, 32));
        s.evidenceFrom = _u64(inputs[40]); s.evidenceUntil = _u64(inputs[41]);
        if (!(s.claimDomain != bytes32(0) && s.ticketId != bytes32(0)
            && s.ticketCommitment != bytes32(0) && s.nullifier != bytes32(0))) revert Co42Zero();
        if (!(s.evidenceFrom < s.evidenceUntil)) revert Co42Window();
    }
    function intentId(bytes32 domain, bytes32 output, uint64 amount) public pure returns (bytes32) {
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-intent/1")),
            _p(abi.encodePacked(domain)), _p(abi.encodePacked(output)), _p(abi.encodePacked(amount))));
    }
    function ticketId(bytes32 domain, uint8 kind, uint64 nonce) public pure returns (bytes32) {
        if (!(kind == T.REDEEM || kind == T.REFUND)) revert TicketKind();
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-ticket-id/1")),
            _p(abi.encodePacked(domain)), _p(abi.encodePacked(kind)), _p(abi.encodePacked(nonce))));
    }
    function ticketCommitment(T.Ticket memory ticket) public pure returns (bytes32) {
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-ticket/1")),
            _p(abi.encodePacked(ticket.kind)), _p(abi.encodePacked(ticket.id)),
            _p(abi.encodePacked(ticket.claimDomain)), _p(abi.encodePacked(ticket.amount)),
            _p(abi.encodePacked(ticket.destinationCommitment)), _p(abi.encodePacked(ticket.maxFee)),
            _p(abi.encodePacked(ticket.referenceIngressN)), _p(abi.encodePacked(ticket.referenceQ))));
    }
    function destination(T.Configuration memory c, bytes32 domain, bytes32 endpoint,
        uint64 amount, uint64 maxFee, bytes32 salt) public pure returns (bytes32)
    {
        if (!(salt != bytes32(0))) revert DestinationSalt();
        bytes memory label = c.nativeFamily == 1 ? bytes("BTC") : bytes("SOL");
        bytes32 chainDomain = sha256(bytes.concat(_p(bytes("LIANUM/evidence-chain/1")),
            _p(label), _p(abi.encodePacked(c.nativeGenesis)), _p(abi.encodePacked(c.nativeAsset))));
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-destination/1")),
            _p(abi.encodePacked(domain)), _p(abi.encodePacked(chainDomain)), _p(abi.encodePacked(endpoint)),
            _p(abi.encodePacked(amount)), _p(abi.encodePacked(maxFee)), _p(abi.encodePacked(salt))));
    }
    function endpointCommitment(T.Configuration memory c, bytes memory endpoint) public pure returns (bytes32) {
        if (!(c.nativeFamily == 1 || c.nativeFamily == 2)) revert NativeFamily();
        if (c.nativeFamily == 1) {
            if (!(endpoint.length == 22 && endpoint[0] == 0x00 && endpoint[1] == 0x14)) revert P2WpkhRoute();
        } else if (!(endpoint.length == 32)) revert SolRoute();
        bool nonzero;
        for (uint256 i = c.nativeFamily == 1 ? 2 : 0; i < endpoint.length; ++i) nonzero = nonzero || endpoint[i] != 0;
        if (!(nonzero)) revert ZeroEndpoint();
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-endpoint/2")),
            _p(bytes("LIANUM_PAEG_NATIVE_4_V2")), _p(c.nativeFamily == 1 ? bytes("BTC") : bytes("SOL")),
            _p(abi.encodePacked(c.nativeGenesis)), _p(abi.encodePacked(c.nativeAsset)),
            _p(c.nativeFamily == 1 ? bytes("BTC_P2WPKH_SCRIPT") : bytes("SOL_PUBLIC_KEY")), _p(endpoint)));
    }
    function routeCommitment(T.Route memory route) public pure returns (bytes32) {
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-route/1")),
            _p(route.endpoint), _p(abi.encodePacked(route.salt)), _p(abi.encodePacked(route.quotedFee)),
            _p(abi.encodePacked(route.selectedInputValue)), _p(abi.encodePacked(route.changeFloor)),
            _p(abi.encodePacked(uint8(route.destinationFunded ? 1 : 0)))));
    }
    function actionDigest(bytes32 domain, T.ActionTerms memory a) public pure returns (bytes32) {
        bytes memory frame = bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-action/1")),
            _p(abi.encodePacked(domain)), _p(abi.encodePacked(uint8(a.action))),
            _p(abi.encodePacked(a.operationId)), _p(abi.encodePacked(a.revision)),
            _p(abi.encodePacked(a.amount)), _p(abi.encodePacked(a.destinationCommitment)),
            _p(abi.encodePacked(a.maxFee)));
        return sha256(bytes.concat(frame,
            _p(abi.encodePacked(a.nullifier)), _p(abi.encodePacked(a.wireBindingCommitment)),
            _p(abi.encodePacked(a.routeCommitment)), _p(abi.encodePacked(a.claimSequence)),
            _p(abi.encodePacked(a.hubSequence))));
    }
    function backingDigest(T.BackingPermit memory p) public pure returns (bytes32) {
        bytes memory frame = bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-backing-permit/1")),
            _p(abi.encodePacked(p.claimDomain)), _p(abi.encodePacked(p.custodyInventoryDomain)),
            _p(abi.encodePacked(p.actionDigest)), _p(abi.encodePacked(p.expectedClaimSequence)),
            _p(abi.encodePacked(p.hubStateSequence)), _p(abi.encodePacked(p.revocationState)));
        frame = bytes.concat(frame,
            _p(abi.encodePacked(p.wrapperSupply)), _p(abi.encodePacked(p.pendingRedemptions)),
            _p(abi.encodePacked(p.pendingRefunds)), _p(abi.encodePacked(p.heldUnissued)),
            _p(abi.encodePacked(p.unknownExposure)), _p(abi.encodePacked(p.nativePrincipalAvailable)),
            _p(abi.encodePacked(p.feeReserveAvailable)));
        return sha256(bytes.concat(frame,
            _p(abi.encodePacked(p.reservedFeesAfter)), _p(abi.encodePacked(p.inventoryCommitment)),
            _p(abi.encodePacked(p.obligationsCommitment)), _p(abi.encodePacked(p.validFrom)),
            _p(abi.encodePacked(p.validUntil))));
    }
    /// @notice Only this salted digest goes in public reservation calldata. Raw
    /// native identity, GID, bytes and salt remain in restricted durable journals.
    function signedWireCommitment(bytes32 domain, bytes32 operationId, uint64 revision,
        bytes32 admissionN, bytes32 wireKeyCommitment, bytes32 gid, bytes32 signedWireHash, bytes32 wireSalt)
        public pure returns (bytes32)
    {
        if (!(wireSalt != bytes32(0))) revert SignedWireSalt();
        return sha256(bytes.concat(_p(bytes("LIANUM/PAEG/native-claim-signed-wire/1")),
            _p(abi.encodePacked(domain)), _p(abi.encodePacked(operationId)), _p(abi.encodePacked(revision)),
            _p(abi.encodePacked(admissionN)), _p(abi.encodePacked(wireKeyCommitment)),
            _p(abi.encodePacked(gid)), _p(abi.encodePacked(signedWireHash)), _p(abi.encodePacked(wireSalt))));
    }
    function _u64(bytes32 value) private pure returns (uint64) {
        if (!(uint256(value) <= type(uint64).max)) revert ClaimPublicU64(); return uint64(uint256(value));
    }
    function _digest(bytes32[] memory inputs, uint256 offset) private pure returns (bytes32) {
        uint256 value;
        for (uint256 i; i < 8; ++i) {
            if (!(uint256(inputs[offset + i]) <= type(uint32).max)) revert ClaimPublicU32();
            value = (value << 32) | uint256(inputs[offset + i]);
        }
        return bytes32(value);
    }
}
