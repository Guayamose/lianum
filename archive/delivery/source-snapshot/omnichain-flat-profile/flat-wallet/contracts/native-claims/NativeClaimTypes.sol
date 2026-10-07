// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatHubCodec} from "../FlatHubCodec.sol";

/// @notice New claim ABI. D27/W39 and the twelve-role flat verifier ABI are unchanged.
library NativeClaimTypes {
    enum IntentState { NONE, PREPOSITIONED, ISSUED, VOIDED }
    enum TicketState { NONE, PENDING, SIGNING, OBSERVED, DISCHARGED }
    enum Action { PREPOSITION, RENEW, RESERVE_INGRESS, ISSUE, VOID, REDEEM, BEGIN_PAYOUT, RESERVE_PAYOUT }
    uint8 internal constant REDEEM = 1;
    uint8 internal constant REFUND = 2;

    // H4 order and widths are part of CI51/CO42's byte contract.
    struct Configuration {
        uint256 evmChainId;
        bytes32 evmGenesis;
        address gateway;
        bytes32 gatewayCodeHash;
        address wrapper;
        bytes32 wrapperCodeHash;
        address pool;
        bytes32 poolCodeHash;
        bytes32 poolDomain;
        bytes32 scope;
        bytes32 policy;
        bytes32 wrapperAssetIdentity;
        address hub;
        bytes32 hubCodeHash;
        bytes32 hubDomain;
        bytes32 ledgerNamespace;
        bytes32 registryCommitment;
        bytes32 claimVerifierSetCommitment;
        uint8 nativeFamily;
        bytes32 nativeGenesis;
        bytes32 nativeAsset;
        bytes32 nativeRuleCommitment;
        bytes32 escrowEndpointCommitment;
        bytes32 custodyInventoryDomain;
        uint64 refundMaxFee;
    }
    struct Proof { bytes proof; bytes32[] inputs; }
    struct OwnerIntent {
        bytes32 scope; bytes32 policy; uint64 validFrom; uint64 validUntil;
        uint64 amount; bytes32 output;
    }
    struct Ingress {
        bytes32 claimDomain; bytes32 output; bytes32 nullifier;
        bytes32 refundDestination; bytes32 revocationState; bytes32 receiptLeaf;
        uint64 amount; uint64 evidenceFrom; uint64 evidenceUntil;
    }
    struct Discharge {
        bytes32 claimDomain; bytes32 ticketId; bytes32 ticketCommitment;
        bytes32 nullifier; bytes32 revocationState;
        uint64 evidenceFrom; uint64 evidenceUntil;
    }
    struct Ticket {
        uint8 kind; bytes32 id; bytes32 claimDomain; uint64 amount;
        bytes32 destinationCommitment; uint64 maxFee;
        bytes32 referenceIngressN; bytes32 referenceQ;
    }
    struct BackingPermit {
        bytes32 claimDomain; bytes32 custodyInventoryDomain; bytes32 actionDigest;
        uint64 expectedClaimSequence; uint64 hubStateSequence; bytes32 revocationState;
        uint256 wrapperSupply; uint256 pendingRedemptions; uint256 pendingRefunds;
        uint256 heldUnissued; uint256 unknownExposure;
        uint256 nativePrincipalAvailable; uint256 feeReserveAvailable;
        uint256 reservedFeesAfter; bytes32 inventoryCommitment; bytes32 obligationsCommitment;
        uint64 validFrom; uint64 validUntil;
    }
    // These current native-route facts are threshold-attested, not proven by CO42.
    struct Route {
        bytes endpoint; bytes32 salt;
        uint64 quotedFee; uint64 selectedInputValue; uint64 changeFloor;
        bool destinationFunded;
    }
    struct Authorization {
        BackingPermit permit;
        FlatHubCodec.QuorumSignature[3] signatures;
        uint64 healthFrom; uint64 healthUntil;
        FlatHubCodec.QuorumSignature[3] healthSignatures;
    }
    struct BackingState {
        uint64 claimSequence;
        uint256 supply; uint256 pendingRedemptions;
        uint256 pendingRefunds; uint256 heldUnissued;
    }
    struct ActionTerms {
        Action action; bytes32 operationId; uint64 revision;
        uint64 amount; bytes32 destinationCommitment; uint64 maxFee;
        bytes32 nullifier; bytes32 wireBindingCommitment; bytes32 routeCommitment;
        uint64 claimSequence; uint64 hubSequence;
    }
}
