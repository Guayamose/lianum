// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet, IFlatProofVerifier} from "../FlatVerifierSet.sol";
import {FlatHubCodec} from "../FlatHubCodec.sol";
import {Poseidon2Domains} from "../crypto/Poseidon2Domains.sol";
import {NativeClaimTypes as T} from "./NativeClaimTypes.sol";
import {NativeClaimCodec as Codec} from "./NativeClaimCodec.sol";
import {NativeClaimVerifierSet as ClaimVerifiers} from "./NativeClaimVerifierSet.sol";
import {NativeClaimToken} from "./NativeClaimToken.sol";
import {INativeClaimHub, INativeClaimPool, INativeClaimAuthority} from "./NativeClaimInterfaces.sol";

/// @notice Fixed-linked stateless validation. All inputs are data supplied from
/// constructor-pinned gateway state; no storage pointer, mutation, arbitrary
/// dispatch, caller-selected authority, or delegatecall target is accepted.
library NativeClaimValidation {
    error BootstrapJoin();
    error BackingWindow();
    error BackingAction();
    error BackingCounters();
    error BackingFees();
    error BackingPrincipal();
    error InvalidOwner();
    error InvalidIngress();
    error InvalidDischarge();
    error InvalidRoute();
    error ClaimHalt();
    error ClaimRevocation();
    error ClaimHealth();
    error OutsideWindow();
    error AmountBound();
    error NoteHeadroom();

    function links(address codec, address hubCodec, address math) public pure {
        if (!(codec == address(Codec) && hubCodec == address(FlatHubCodec)
            && math == address(Poseidon2Domains))) revert BootstrapJoin();
    }
    function bootstrap(T.Configuration memory c, ClaimVerifiers.Configuration memory verifiers,
        address authority, bytes32 configurationCommitment)
        public view returns (FlatVerifierSet.Pin memory ownerVerifier, bytes32 hubCodecHash, bytes32 mathHash)
    {
        ClaimVerifiers.validate(verifiers);
        INativeClaimPool p = INativeClaimPool(c.pool); INativeClaimHub h = INativeClaimHub(c.hub);
        if (!(p.asset() == c.wrapper && p.assetIdentity() == c.wrapperAssetIdentity
            && p.scope() == c.scope && p.policy() == c.policy)) revert BootstrapJoin();
        if (!(p.receiptHub() == c.hub && p.receiptHubCodeHash() == c.hubCodeHash
            && p.hubDomain() == c.hubDomain && p.registryCommitment() == c.registryCommitment
            && p.ledgerNamespace() == c.ledgerNamespace)) revert BootstrapJoin();
        if (!(h.hubDomain() == c.hubDomain && h.registryCommitment() == c.registryCommitment
            && h.ledgerNamespace() == c.ledgerNamespace && h.isRegisteredPool(c.pool)
            && h.poolDomain(c.pool) == c.poolDomain)) revert BootstrapJoin();
        FlatVerifierSet.Configuration memory flat = p.verifierConfiguration();
        FlatVerifierSet.validate(flat);
        if (!(p.verifierSetCommitment() == FlatVerifierSet.commitment(flat)
            && h.verifierSetCommitment() == p.verifierSetCommitment())) revert BootstrapJoin();
        if (!(FlatVerifierSet.domainCommitment([c.scope, c.policy, c.wrapperAssetIdentity,
            c.hubDomain, c.registryCommitment, p.verifierSetCommitment(), c.ledgerNamespace]) == c.poolDomain
            && p.domainCommitment() == c.poolDomain)) revert BootstrapJoin();
        ownerVerifier = flat.pins[FlatVerifierSet.DEPOSIT_INTENT];
        hubCodecHash = flat.hubCodecCodeHash; mathHash = flat.poseidon2DomainsCodeHash;
        INativeClaimAuthority a = INativeClaimAuthority(authority);
        if (!(a.hub() == c.hub && a.gatewayPool(c.gateway) == c.pool
            && a.gatewayConfiguration(c.gateway) == configurationCommitment
            && h.claimAuthority() == authority)) revert BootstrapJoin();
        NativeClaimToken token = NativeClaimToken(c.wrapper);
        if (!(token.gateway() == c.gateway && token.totalSupply() == 0
            && token.decimals() == (c.nativeFamily == 1 ? 8 : 9))) revert BootstrapJoin();
    }

    function backing(T.Configuration memory c, bytes32 domain, T.BackingState memory state,
        T.Authorization memory a, T.ActionTerms memory terms,
        uint256 feesAfter, uint256 liabilitiesAdded, uint256 exactIncomingCredit) public view
    {
        T.BackingPermit memory p = a.permit;
        health(c, a.healthFrom, a.healthUntil, a.healthSignatures);
        window(p.validFrom, p.validUntil);
        if (!(p.validUntil - p.validFrom <= 30)) revert BackingWindow();
        if (!(p.claimDomain == domain && p.custodyInventoryDomain == c.custodyInventoryDomain
            && p.expectedClaimSequence == state.claimSequence && p.hubStateSequence == INativeClaimHub(c.hub).stateSequence()
            && p.actionDigest == Codec.actionDigest(domain, terms))) revert BackingAction();
        currentRevocation(c, p.revocationState);
        if (!(p.wrapperSupply == state.supply && p.pendingRedemptions == state.pendingRedemptions
            && p.pendingRefunds == state.pendingRefunds && p.heldUnissued == state.heldUnissued
            && p.unknownExposure == 0)) revert BackingCounters();
        if (!(p.inventoryCommitment != bytes32(0) && p.obligationsCommitment != bytes32(0)
            && p.reservedFeesAfter == feesAfter && p.feeReserveAvailable >= feesAfter)) revert BackingFees();
        if (!(p.nativePrincipalAvailable + exactIncomingCredit >= state.supply + state.pendingRedemptions
            + state.pendingRefunds + state.heldUnissued + liabilitiesAdded)) revert BackingPrincipal();
        address[4] memory signers;
        for (uint8 i; i < 4; ++i) { (, , signers[i]) = INativeClaimHub(c.hub).attester(i); }
        FlatHubCodec.assertQuorum(Codec.backingDigest(p), a.signatures, signers);
    }

    function owner(T.Configuration memory c, FlatVerifierSet.Pin memory pin, T.Proof memory proof)
        public view returns (T.OwnerIntent memory s)
    {
        s = Codec.decodeOwner(proof.inputs);
        if (!(s.scope == c.scope && s.policy == c.policy)) revert InvalidOwner();
        window(s.validFrom, s.validUntil); amount(c.nativeFamily, s.amount);
        FlatVerifierSet.requireCode(pin.verifier, pin.codeHash);
        if (!IFlatProofVerifier(pin.verifier).verify(proof.proof, proof.inputs)) revert InvalidOwner();
    }
    function ingress(T.Configuration memory c, bytes32 domain, ClaimVerifiers.Pin memory pin, T.Proof memory proof)
        public view returns (T.Ingress memory s)
    {
        s = Codec.decodeIngress(proof.inputs);
        if (!(s.claimDomain == domain)) revert InvalidIngress();
        window(s.evidenceFrom, s.evidenceUntil); currentRevocation(c, s.revocationState);
        FlatVerifierSet.requireCode(pin.verifier, pin.codeHash);
        if (!IFlatProofVerifier(pin.verifier).verify(proof.proof, proof.inputs)) revert InvalidIngress();
    }
    function discharge(T.Configuration memory c, bytes32 domain, ClaimVerifiers.Pin memory pin, T.Proof memory proof)
        public view returns (T.Discharge memory s)
    {
        s = Codec.decodeDischarge(proof.inputs);
        if (!(s.claimDomain == domain)) revert InvalidDischarge();
        window(s.evidenceFrom, s.evidenceUntil); currentRevocation(c, s.revocationState);
        FlatVerifierSet.requireCode(pin.verifier, pin.codeHash);
        if (!IFlatProofVerifier(pin.verifier).verify(proof.proof, proof.inputs)) revert InvalidDischarge();
    }
    function route(T.Configuration memory c, bytes32 domain, bytes32[2] memory endpoints,
        uint64 quantity, bytes32 destinationCommitment, uint64 maxFee, T.Route memory r)
        public view returns (bytes32)
    {
        amount(c.nativeFamily, quantity);
        if (!(maxFee > 0 && r.quotedFee > 0 && r.quotedFee <= maxFee)) revert InvalidRoute();
        bytes32 endpoint = Codec.endpointCommitment(c, r.endpoint);
        if (!(endpoint == endpoints[0] || endpoint == endpoints[1])) revert InvalidRoute();
        if (!(Codec.destination(c, domain, endpoint, quantity, maxFee, r.salt) == destinationCommitment)) revert InvalidRoute();
        if (c.nativeFamily == 1) {
            if (!(r.changeFloor >= 1000
                && uint256(r.selectedInputValue) >= uint256(quantity) + maxFee + r.changeFloor)) revert InvalidRoute();
        } else if (!(r.destinationFunded && r.selectedInputValue == 0 && r.changeFloor == 0)) revert InvalidRoute();
        return Codec.routeCommitment(r);
    }
    function health(T.Configuration memory c, uint64 from, uint64 until, FlatHubCodec.QuorumSignature[3] memory signatures) public view {
        if (!(!INativeClaimHub(c.hub).halted() && INativeClaimHub(c.hub).revocationOverflowCount() == 0)) revert ClaimHalt();
        if (!INativeClaimHub(c.hub).verifyFinalityHealth(c.pool, from, until, signatures)) revert ClaimHealth();
    }
    function currentRevocation(T.Configuration memory c, bytes32 expected) public view {
        if (!(!INativeClaimHub(c.hub).halted() && INativeClaimHub(c.hub).revocationOverflowCount() == 0
            && INativeClaimHub(c.hub).admissionRevocationState(c.poolDomain) == expected)) revert ClaimRevocation();
    }
    function amount(uint8 family, uint64 quantity) public pure {
        if (!(quantity > 0 && (family == 1 ? quantity >= 1000 && quantity <= 1000000000
            : family == 2 && quantity <= 9007199254740991))) revert AmountBound();
    }
    function headroom(address pool) public view {
        INativeClaimPool p = INativeClaimPool(pool);
        if (!(uint256(p.leafCount()) + 1 + 4 * uint256(p.liveReservations()) <= 64
            && uint256(p.spentCount()) + 5 * uint256(p.liveReservations()) + p.outputCapacity() + 1 <= 64)) revert NoteHeadroom();
    }
    function window(uint64 from, uint64 until) public view {
        if (!(from < until && from <= block.timestamp && block.timestamp < until)) revert OutsideWindow();
    }
}
