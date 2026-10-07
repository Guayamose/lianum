// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {FlatHubCodec} from "../FlatHubCodec.sol";
import {Poseidon2Domains} from "../crypto/Poseidon2Domains.sol";
import {NativeClaimTypes as T} from "./NativeClaimTypes.sol";
import {NativeClaimCodec as Codec} from "./NativeClaimCodec.sol";
import {NativeClaimVerifierSet as ClaimVerifiers} from "./NativeClaimVerifierSet.sol";
import {NativeClaimValidation as Validation} from "./NativeClaimValidation.sol";
import {NativeClaimToken} from "./NativeClaimToken.sol";
import {INativeClaimHub, INativeClaimPool, INativeClaimAuthority} from "./NativeClaimInterfaces.sol";

/// @notice Source-only bounded custodial SOL/BTC claim state machine. Genuine
/// verifier artifacts, deployment-size checks and chain execution are required
/// before deployment. Historical native ingress is never treated as solvency.
contract NativeClaimGateway {
    error ClaimConfiguration();
    error ClaimNativeConfiguration();
    error ClaimNamespace();
    error ClaimAuthority();
    error ClaimVerifierSet();
    error EscrowEndpointPin();
    error PayoutToEscrow();
    error DuplicatePayoutEndpoint();
    error ClaimReentrancy();
    error NoClaimAcceptance();
    error ClaimSeal();
    error IntentLifetimeCapacity();
    error RefundLifetimeCapacity();
    error ClaimSequenceChanged();
    error IntentRenewal();
    error SignedEffectExistsOrZero();
    error RefundDestinationRequired();
    error ExactActivePayoutRequired();
    error CurrentD27IntentRequired();
    error ClaimAllowanceNotZero();
    error ClaimApproval();
    error ClaimAtomicBackingDeltas();
    error CurrentIntentNotExpired();
    error TicketLifetimeCapacity();
    error ClaimBurnDeltas();
    error TicketIdChanged();
    error TicketNotPending();
    error PayoutProjectedCoverage();
    error ExactDischargeTicketRequired();
    error TicketKind();
    error Ci51OriginalIntentJoin();
    error UnmatchedPayoutFence();
    error ClaimBootstrapIncomplete();

    uint32 public constant MAX_INTENTS = 16;
    uint32 public constant MAX_TICKETS = 32;
    uint64 public constant BITCOIN_OUTPUT_FLOOR = 1000;
    uint64 public constant MAX_PERMIT_SECONDS = 30;
    struct Deployment {
        T.Configuration claim;
        ClaimVerifiers.Configuration verifiers;
        address authority;
        bytes32 authorityCodeHash;
        bytes32 codecCodeHash;
        bytes32 validationCodeHash;
        // At most two already-funded owned SOL accounts or canonical BTC scripts.
        bytes[2] payoutEndpoints;
        bytes escrowEndpoint;
    }
    struct Intent {
        T.IntentState state; bytes32 output; uint64 amount;
        uint64 validFrom; uint64 validUntil; uint64 revision; bytes32 proofHash;
        bytes32 nullifier; bytes32 refundDestination;
    }
    struct SignedEffect {
        bytes32 nullifier; uint64 revision; bytes32 wireBindingCommitment; bool ingress;
    }
    struct Acceptance { bytes32 operationId; bytes32 nullifier; bytes32 leaf; bytes32 revocationState; }

    // No configuration setter exists. Constructor-only storage avoids runtime
    // hash cycles with the prospective gateway, wrapper, pool, authority and hub.
    T.Configuration private configuration;
    ClaimVerifiers.Configuration private claimVerifiers;
    FlatVerifierSet.Pin private ownerVerifier;
    bytes32 public configurationCommitment;
    bytes32 public claimDomain;
    address public hub;
    address public pool;
    address public authority;
    bytes32 public authorityCodeHash;
    bytes32 public codecCodeHash;
    bytes32 public validationCodeHash;
    bytes32 private hubCodecCodeHash;
    bytes32 private mathCodeHash;
    bytes32 public custodyInventoryDomain;
    bytes32 public nativeAssetKey;
    bytes32[2] public payoutEndpointCommitments;
    bool public isSealed;
    uint64 public claimSequence;
    uint32 public intentCount;
    uint32 public ticketCount;
    uint32 public reservedRefundTickets;
    uint64 public nextTicketNonce;
    uint256 public pendingRedemptions;
    uint256 public pendingRefunds;
    // Conservative obligations: prepared-but-unfunded intentions are included.
    // This counter is never a representation of a native account balance.
    uint256 public heldUnissued;
    uint256 public reservedFees;
    bytes32 public activePayout;
    mapping(bytes32 => Intent) public intents;
    mapping(bytes32 => T.Ticket) private tickets;
    mapping(bytes32 => T.TicketState) public ticketState;
    mapping(bytes32 => bytes32) public ticketCommitments;
    mapping(bytes32 => bytes32) public payoutRouteCommitment;
    mapping(bytes32 => SignedEffect) private signedEffects;
    bytes32[16] public intentHistory;
    bytes32[32] public ticketHistory;
    Acceptance private accepting;
    uint256 private entered;
    event IntentPrepositioned(bytes32 indexed intentId, bytes32 output, uint64 amount, uint64 revision);
    event IntentRenewed(bytes32 indexed intentId, uint64 revision, uint64 validFrom, uint64 validUntil);
    event IntentIssued(bytes32 indexed intentId, bytes32 indexed nullifier, bytes32 output, uint64 amount);
    event IntentVoided(bytes32 indexed intentId, bytes32 indexed nullifier, bytes32 indexed refundTicket);
    event TicketCreated(bytes32 indexed ticketId, uint8 kind, uint64 amount, bytes32 destinationCommitment, uint64 maxFee);
    event PayoutBegun(bytes32 indexed ticketId, bytes32 routeCommitment, uint64 sequence);
    event SignedEffectReserved(bytes32 indexed operationId, bytes32 indexed nullifier, bytes32 wireBindingCommitment);
    event TicketObserved(bytes32 indexed ticketId, bytes32 indexed nullifier);
    event TicketDischarged(bytes32 indexed ticketId, bytes32 indexed nullifier);
    event ClaimStateAdvanced(uint64 sequence);

    constructor(Deployment memory d) {
        T.Configuration memory c = d.claim;
        if (!(c.gateway == address(this) && c.evmChainId == block.chainid
            && c.evmGenesis != bytes32(0) && (c.nativeFamily == 1 || c.nativeFamily == 2))) revert ClaimConfiguration();
        if (!(c.refundMaxFee > 0 && c.nativeGenesis != bytes32(0) && c.nativeAsset != bytes32(0)
            && c.nativeRuleCommitment != bytes32(0) && c.custodyInventoryDomain != bytes32(0)
            && c.nativeAsset != c.wrapperAssetIdentity && c.poolDomain != bytes32(0)
            && c.scope != bytes32(0) && c.policy != bytes32(0))) revert ClaimNativeConfiguration();
        if (!(c.ledgerNamespace == c.hubDomain && c.hubDomain != bytes32(0))) revert ClaimNamespace();
        if (!(d.authority != address(0) && d.authorityCodeHash != bytes32(0))) revert ClaimAuthority();
        FlatVerifierSet.requireCode(address(Codec), d.codecCodeHash);
        FlatVerifierSet.requireCode(address(Validation), d.validationCodeHash);
        if (!(ClaimVerifiers.commitment(d.verifiers) == c.claimVerifierSetCommitment)) revert ClaimVerifierSet();
        configuration = c; claimVerifiers = d.verifiers;
        configurationCommitment = sha256(abi.encode(d));
        claimDomain = Codec.claimDomain(c);
        hub = c.hub; pool = c.pool; authority = d.authority;
        authorityCodeHash = d.authorityCodeHash; codecCodeHash = d.codecCodeHash;
        validationCodeHash = d.validationCodeHash;
        custodyInventoryDomain = c.custodyInventoryDomain;
        // This profile supports only the chain's native currency. Caller-supplied
        // asset/inventory labels cannot create a second backing namespace.
        nativeAssetKey = sha256(abi.encode(c.nativeFamily, c.nativeGenesis));
        if (!(Codec.endpointCommitment(c, d.escrowEndpoint) == c.escrowEndpointCommitment)) revert EscrowEndpointPin();
        for (uint256 i; i < 2; ++i) {
            payoutEndpointCommitments[i] = Codec.endpointCommitment(c, d.payoutEndpoints[i]);
            if (!(payoutEndpointCommitments[i] != c.escrowEndpointCommitment)) revert PayoutToEscrow();
        }
        if (!(payoutEndpointCommitments[0] != payoutEndpointCommitments[1])) revert DuplicatePayoutEndpoint();
    }
    modifier guarded() {
        if (!(entered == 0)) revert ClaimReentrancy(); entered = 1;
        _live(); _; entered = 0;
    }
    function claimConfiguration() external view returns (T.Configuration memory) { return configuration; }
    function verifierConfiguration() external view returns (ClaimVerifiers.Configuration memory) { return claimVerifiers; }
    function ticket(bytes32 id) external view returns (T.Ticket memory) { return tickets[id]; }
    function claimReservation(bytes32 id) external view returns (bytes32, uint64, bytes32, bool) {
        SignedEffect storage s = signedEffects[id];
        return (s.nullifier, s.revision, s.wireBindingCommitment, s.ingress);
    }
    function claimAcceptance(bytes32 id) external view returns (bytes32, bytes32, bytes32) {
        if (!(entered == 1 && accepting.operationId == id && id != bytes32(0))) revert NoClaimAcceptance();
        return (accepting.nullifier, accepting.leaf, accepting.revocationState);
    }
    function liabilities() public view returns (uint256) {
        return NativeClaimToken(configuration.wrapper).totalSupply() + pendingRedemptions + pendingRefunds + heldUnissued;
    }
    // Deterministic one-time checked bootstrap. Calling earlier cannot bypass a
    // missing pool, genuine verifier pin, registry join or authority commitment.
    function seal() external {
        if (!(!isSealed && entered == 0)) revert ClaimSeal();
        _codePins();
        Validation.links(address(Codec), address(FlatHubCodec), address(Poseidon2Domains));
        (ownerVerifier, hubCodecCodeHash, mathCodeHash) = Validation.bootstrap(
            configuration, claimVerifiers, authority, configurationCommitment);
        isSealed = true;
    }

    function preposition(T.Proof calldata ownerProof, T.Authorization calldata authorization) external guarded returns (bytes32 id) {
        _noPayout(); _poolHeadroom();
        T.OwnerIntent memory s = _owner(ownerProof);
        id = Codec.intentId(claimDomain, s.output, s.amount);
        if (!(intents[id].state == T.IntentState.NONE && intentCount < MAX_INTENTS)) revert IntentLifetimeCapacity();
        if (!(uint256(ticketCount) + reservedRefundTickets < MAX_TICKETS)) revert RefundLifetimeCapacity();
        uint256 feesAfter = reservedFees + configuration.refundMaxFee;
        T.ActionTerms memory terms = _terms(T.Action.PREPOSITION, id, 1, s.amount,
            configuration.escrowEndpointCommitment, configuration.refundMaxFee);
        // Bind the exact current owner bounds and genuine proof bytes to approval.
        terms.routeCommitment = _ownerBinding(s, ownerProof.proof);
        _authorize(authorization, terms, feesAfter, s.amount, s.amount);
        intents[id] = Intent(T.IntentState.PREPOSITIONED, s.output, s.amount,
            s.validFrom, s.validUntil, 1, sha256(ownerProof.proof), bytes32(0), bytes32(0));
        intentHistory[intentCount++] = id; ++reservedRefundTickets;
        heldUnissued += s.amount; reservedFees = feesAfter;
        INativeClaimAuthority(authority).reserveReceipt(id);
        _advance(); emit IntentPrepositioned(id, s.output, s.amount, 1);
    }
    function renewIntent(T.Proof calldata ownerProof, uint64 expectedRevision, uint64 expectedSequence) external guarded {
        if (!(expectedSequence == claimSequence)) revert ClaimSequenceChanged();
        T.OwnerIntent memory s = _owner(ownerProof);
        bytes32 id = Codec.intentId(claimDomain, s.output, s.amount);
        Intent storage current = intents[id];
        if (!(current.state == T.IntentState.PREPOSITIONED && current.revision == expectedRevision
            && s.validUntil > current.validUntil)) revert IntentRenewal();
        current.validFrom = s.validFrom; current.validUntil = s.validUntil;
        current.proofHash = sha256(ownerProof.proof); ++current.revision;
        // Preserve the original s/K/N and signed reservation across owner renewal.
        _advance(); emit IntentRenewed(id, current.revision, s.validFrom, s.validUntil);
    }

    /// @notice After original signed bytes are durably persisted, before the sole
    /// broadcast. Signers privately verify the original wire and fresh random salt.
    /// This is an exact quorum authority, never a public arbitrary-N reservation.
    function reserveSignedEffect(bytes32 operationId, bytes32 nullifier, bytes32 wireBindingCommitment,
        bytes32 refundDestination, T.Authorization calldata authorization) external guarded
    {
        if (!(nullifier != bytes32(0) && wireBindingCommitment != bytes32(0)
            && signedEffects[operationId].nullifier == bytes32(0))) revert SignedEffectExistsOrZero();
        Intent storage intent = intents[operationId];
        bool ingress = intent.state == T.IntentState.PREPOSITIONED;
        T.ActionTerms memory terms;
        uint64 revision;
        if (ingress) {
            _noPayout(); _poolHeadroom();
            if (!(refundDestination != bytes32(0))) revert RefundDestinationRequired();
            revision = intent.revision;
            terms = _terms(T.Action.RESERVE_INGRESS, operationId, revision, intent.amount,
                refundDestination, configuration.refundMaxFee);
            terms.nullifier = nullifier; terms.wireBindingCommitment = wireBindingCommitment;
            _authorize(authorization, terms, reservedFees, 0, intent.amount);
            intent.nullifier = nullifier; intent.refundDestination = refundDestination;
        } else {
            if (!(activePayout == operationId && ticketState[operationId] == T.TicketState.SIGNING
                && refundDestination == bytes32(0))) revert ExactActivePayoutRequired();
            T.Ticket storage t = tickets[operationId];
            revision = 1;
            terms = _terms(T.Action.RESERVE_PAYOUT, operationId, revision, t.amount, t.destinationCommitment, t.maxFee);
            terms.nullifier = nullifier; terms.wireBindingCommitment = wireBindingCommitment;
            terms.routeCommitment = payoutRouteCommitment[operationId];
            _authorize(authorization, terms, reservedFees, 0, 0);
        }
        signedEffects[operationId] = SignedEffect(nullifier, revision, wireBindingCommitment, ingress);
        INativeClaimAuthority(authority).reserveSignedEffect(operationId, nullifier, revision, wireBindingCommitment);
        _advance(); emit SignedEffectReserved(operationId, nullifier, wireBindingCommitment);
    }

    function issue(T.Proof calldata ownerProof, T.Proof calldata ingressProof, T.Authorization calldata authorization)
        external guarded
    {
        _noPayout(); _poolHeadroom();
        T.OwnerIntent memory owner = _owner(ownerProof);
        T.Ingress memory s = _ingress(ingressProof);
        bytes32 id = Codec.intentId(claimDomain, s.output, s.amount);
        Intent storage current = intents[id];
        if (!(current.state == T.IntentState.PREPOSITIONED && owner.output == current.output
            && owner.amount == current.amount && owner.validFrom == current.validFrom
            && owner.validUntil == current.validUntil && sha256(ownerProof.proof) == current.proofHash)) revert CurrentD27IntentRequired();
        _joinIngress(current, s);
        uint256 feesAfter = reservedFees - configuration.refundMaxFee;
        T.ActionTerms memory terms = _terms(T.Action.ISSUE, id, current.revision, s.amount,
            s.refundDestination, configuration.refundMaxFee);
        terms.nullifier = s.nullifier; terms.wireBindingCommitment = signedEffects[id].wireBindingCommitment;
        terms.routeCommitment = s.receiptLeaf;
        _authorize(authorization, terms, feesAfter, 0, 0);
        NativeClaimToken token = NativeClaimToken(configuration.wrapper);
        INativeClaimPool target = INativeClaimPool(pool);
        uint256 supplyBefore = token.totalSupply(); uint256 gatewayBefore = token.balanceOf(address(this));
        uint256 poolBefore = token.balanceOf(pool); uint256 backingBefore = target.backedAmount();
        if (!(token.allowance(address(this), pool) == 0)) revert ClaimAllowanceNotZero();
        _accept(id, s.nullifier, s.receiptLeaf, s.revocationState);
        current.state = T.IntentState.ISSUED; heldUnissued -= s.amount;
        --reservedRefundTickets; reservedFees = feesAfter;
        token.mintToGateway(s.amount);
        if (!(token.approve(pool, s.amount))) revert ClaimApproval();
        target.depositBalanceIntent(ownerProof.proof, ownerProof.inputs);
        if (!(token.allowance(address(this), pool) == 0
            && token.totalSupply() == supplyBefore + s.amount
            && token.balanceOf(address(this)) == gatewayBefore && token.balanceOf(pool) == poolBefore + s.amount
            && target.backedAmount() == backingBefore + s.amount)) revert ClaimAtomicBackingDeltas();
        _advance(); emit IntentIssued(id, s.nullifier, s.output, s.amount);
    }

    function voidDeposit(T.Proof calldata ingressProof, uint64 expectedIntentRevision,
        uint64 expectedSequence, uint64 healthFrom, uint64 healthUntil,
        FlatHubCodec.QuorumSignature[3] calldata healthSignatures) external guarded returns (bytes32 refundId)
    {
        if (!(expectedSequence == claimSequence)) revert ClaimSequenceChanged();
        T.Ingress memory s = _ingress(ingressProof);
        bytes32 id = Codec.intentId(claimDomain, s.output, s.amount);
        Intent storage current = intents[id];
        if (!(current.state == T.IntentState.PREPOSITIONED && current.revision == expectedIntentRevision
            && block.timestamp >= current.validUntil)) revert CurrentIntentNotExpired();
        _joinIngress(current, s); _health(healthFrom, healthUntil, healthSignatures);
        _accept(id, s.nullifier, s.receiptLeaf, s.revocationState);
        current.state = T.IntentState.VOIDED; heldUnissued -= s.amount;
        pendingRefunds += s.amount; --reservedRefundTickets;
        refundId = _ticket(T.REFUND, s.amount, s.refundDestination, configuration.refundMaxFee, s.nullifier, s.output);
        // The intent's fee reservation follows its refund; no reserve is freed.
        _advance(); emit IntentVoided(id, s.nullifier, refundId);
    }

    function requestRedemption(uint64 amount, bytes32 destinationCommitment, uint64 maxFee,
        T.Route calldata route, T.Authorization calldata authorization) external guarded returns (bytes32 id)
    {
        _noPayout(); _amount(amount);
        if (!(uint256(ticketCount) + reservedRefundTickets < MAX_TICKETS)) revert TicketLifetimeCapacity();
        bytes32 routeHash = _route(amount, destinationCommitment, maxFee, route);
        id = Codec.ticketId(claimDomain, T.REDEEM, nextTicketNonce);
        uint256 feesAfter = reservedFees + maxFee;
        T.ActionTerms memory terms = _terms(T.Action.REDEEM, id, 1, amount, destinationCommitment, maxFee);
        // The burn caller is part of the exact action; no permit can be stolen to
        // burn another account or moved between holders of split public claims.
        terms.wireBindingCommitment = bytes32(uint256(uint160(msg.sender)));
        terms.routeCommitment = routeHash;
        _authorize(authorization, terms, feesAfter, 0, 0);
        NativeClaimToken token = NativeClaimToken(configuration.wrapper);
        uint256 beforeSupply = token.totalSupply(); uint256 beforeBalance = token.balanceOf(msg.sender);
        token.burnForTicket(msg.sender, amount);
        if (!(token.totalSupply() == beforeSupply - amount && token.balanceOf(msg.sender) == beforeBalance - amount)) revert ClaimBurnDeltas();
        pendingRedemptions += amount; reservedFees = feesAfter;
        if (!(_ticket(T.REDEEM, amount, destinationCommitment, maxFee, bytes32(0), bytes32(0)) == id)) revert TicketIdChanged();
        _advance();
    }

    /// @notice Included before native key use. This fences every controller for
    /// this inventory until genuine CO42 accounts for this exact original send.
    function beginPayout(bytes32 id, T.Route calldata route, T.Authorization calldata authorization) external guarded {
        _noPayout(); if (!(ticketState[id] == T.TicketState.PENDING)) revert TicketNotPending();
        T.Ticket storage t = tickets[id];
        bytes32 routeHash = _route(t.amount, t.destinationCommitment, t.maxFee, route);
        T.ActionTerms memory terms = _terms(T.Action.BEGIN_PAYOUT, id, 1, t.amount, t.destinationCommitment, t.maxFee);
        terms.routeCommitment = routeHash;
        _authorize(authorization, terms, reservedFees, 0, 0);
        // Principal remains debt until CO42. Only the selected ticket may be
        // subtracted for the native executor's projected post-send coverage.
        uint256 debt = liabilities();
        if (!(authorization.permit.nativePrincipalAvailable - t.amount >= debt - t.amount)) revert PayoutProjectedCoverage();
        activePayout = id; ticketState[id] = T.TicketState.SIGNING;
        payoutRouteCommitment[id] = routeHash;
        _advance(); emit PayoutBegun(id, routeHash, claimSequence);
    }

    function discharge(T.Proof calldata dischargeProof, uint64 expectedSequence,
        uint64 healthFrom, uint64 healthUntil, FlatHubCodec.QuorumSignature[3] calldata healthSignatures) external guarded
    {
        if (!(expectedSequence == claimSequence)) revert ClaimSequenceChanged();
        T.Discharge memory s = Validation.discharge(configuration, claimDomain,
            claimVerifiers.pins[ClaimVerifiers.CO42], dischargeProof);
        if (!(s.claimDomain == claimDomain && activePayout == s.ticketId
            && ticketState[s.ticketId] == T.TicketState.SIGNING
            && ticketCommitments[s.ticketId] == s.ticketCommitment
            && signedEffects[s.ticketId].nullifier == s.nullifier)) revert ExactDischargeTicketRequired();
        _health(healthFrom, healthUntil, healthSignatures);
        T.Ticket storage t = tickets[s.ticketId];
        ticketState[s.ticketId] = T.TicketState.OBSERVED;
        emit TicketObserved(s.ticketId, s.nullifier);
        _accept(s.ticketId, s.nullifier, bytes32(0), s.revocationState);
        if (t.kind == T.REDEEM) pendingRedemptions -= t.amount;
        else { if (!(t.kind == T.REFUND)) revert TicketKind(); pendingRefunds -= t.amount; }
        reservedFees -= t.maxFee; ticketState[s.ticketId] = T.TicketState.DISCHARGED;
        activePayout = bytes32(0); _advance(); emit TicketDischarged(s.ticketId, s.nullifier);
        // Deliberately no pre-discharge backing inequality: principal has left.
        // No remint, new send or unrelated debt forgiveness occurs in this path.
    }

    function _ticket(uint8 kind, uint64 amount, bytes32 destinationCommitment, uint64 maxFee,
        bytes32 referenceN, bytes32 referenceQ) private returns (bytes32 id)
    {
        if (!(ticketCount < MAX_TICKETS && uint256(ticketCount) + reservedRefundTickets < MAX_TICKETS)) revert TicketLifetimeCapacity();
        id = Codec.ticketId(claimDomain, kind, nextTicketNonce++);
        T.Ticket memory t = T.Ticket(kind, id, claimDomain, amount, destinationCommitment, maxFee, referenceN, referenceQ);
        tickets[id] = t; ticketState[id] = T.TicketState.PENDING;
        ticketCommitments[id] = Codec.ticketCommitment(t); ticketHistory[ticketCount++] = id;
        emit TicketCreated(id, kind, amount, destinationCommitment, maxFee);
    }
    function _authorize(T.Authorization calldata a, T.ActionTerms memory terms,
        uint256 feesAfter, uint256 liabilitiesAdded, uint256 exactIncomingCredit) private view
    {
        T.BackingState memory state = T.BackingState(claimSequence,
            NativeClaimToken(configuration.wrapper).totalSupply(), pendingRedemptions, pendingRefunds, heldUnissued);
        Validation.backing(configuration, claimDomain, state, a, terms,
            feesAfter, liabilitiesAdded, exactIncomingCredit);
    }
    function _terms(T.Action action, bytes32 id, uint64 revision, uint64 amount,
        bytes32 destinationCommitment, uint64 maxFee) private view returns (T.ActionTerms memory t)
    {
        t.action = action; t.operationId = id; t.revision = revision; t.amount = amount;
        t.destinationCommitment = destinationCommitment; t.maxFee = maxFee;
        t.claimSequence = claimSequence; t.hubSequence = INativeClaimHub(hub).stateSequence();
    }
    function _ownerBinding(T.OwnerIntent memory s, bytes calldata proof) private pure returns (bytes32) {
        return sha256(abi.encode(s.scope, s.policy, s.validFrom, s.validUntil, s.amount, s.output, sha256(proof)));
    }
    function _owner(T.Proof calldata proof) private view returns (T.OwnerIntent memory s) {
        return Validation.owner(configuration, ownerVerifier, proof);
    }
    function _ingress(T.Proof calldata proof) private view returns (T.Ingress memory s) {
        return Validation.ingress(configuration, claimDomain, claimVerifiers.pins[ClaimVerifiers.CI51], proof);
    }
    function _joinIngress(Intent storage intent, T.Ingress memory s) private view {
        if (!(intent.output == s.output && intent.amount == s.amount && intent.nullifier == s.nullifier
            && intent.refundDestination == s.refundDestination)) revert Ci51OriginalIntentJoin();
    }
    function _accept(bytes32 id, bytes32 nullifier, bytes32 leaf, bytes32 revocationState) private {
        accepting = Acceptance(id, nullifier, leaf, revocationState);
        INativeClaimAuthority(authority).consumeClaim(id, nullifier, leaf, revocationState);
        delete accepting;
    }
    function _route(uint64 amount, bytes32 destinationCommitment, uint64 maxFee, T.Route calldata route)
        private view returns (bytes32)
    {
        return Validation.route(configuration, claimDomain, payoutEndpointCommitments,
            amount, destinationCommitment, maxFee, route);
    }
    function _health(uint64 from, uint64 until, FlatHubCodec.QuorumSignature[3] calldata signatures) private view {
        Validation.health(configuration, from, until, signatures);
    }
    function _amount(uint64 amount) private view {
        Validation.amount(configuration.nativeFamily, amount);
    }
    function _poolHeadroom() private view {
        Validation.headroom(pool);
    }
    function _noPayout() private view { if (!(activePayout == bytes32(0))) revert UnmatchedPayoutFence(); }
    function _codePins() private view {
        FlatVerifierSet.requireCode(address(this), configuration.gatewayCodeHash);
        FlatVerifierSet.requireCode(configuration.wrapper, configuration.wrapperCodeHash);
        FlatVerifierSet.requireCode(pool, configuration.poolCodeHash);
        FlatVerifierSet.requireCode(hub, configuration.hubCodeHash);
        FlatVerifierSet.requireCode(authority, authorityCodeHash);
        FlatVerifierSet.requireCode(address(Codec), codecCodeHash);
        FlatVerifierSet.requireCode(address(Validation), validationCodeHash);
    }
    function _live() private view {
        if (!(isSealed && INativeClaimAuthority(authority).isSealed())) revert ClaimBootstrapIncomplete();
        _codePins();
        FlatVerifierSet.requireCode(address(FlatHubCodec), hubCodecCodeHash);
        FlatVerifierSet.requireCode(address(Poseidon2Domains), mathCodeHash);
    }
    function _advance() private { ++claimSequence; emit ClaimStateAdvanced(claimSequence); }
}
